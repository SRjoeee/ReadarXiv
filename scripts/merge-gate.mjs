#!/usr/bin/env node
// The merge gate (CLAUDE.md, Working rules): "Nothing merges into `main` and no version is released without the
// maintainer's explicit request." A sentence holds an agent only while the agent remembers it, so Claude Code runs
// this before a shell command that merges a pull request (`.claude/settings.json`, a PreToolUse hook):
//
// - a merge of one of this repository's pull requests into `main` **asks** the person at the keyboard;
// - a merge this script cannot read — a pull request named by an expansion, a GraphQL mutation, a lookup that
//   failed — asks too: a gate that guesses is no gate;
// - a merge into any other base, written as one plain `gh pr merge …` and nothing else, is **allowed**: feature work
//   merges into `next` on the agent's own authority (docs/agents/review.md), and it should not wait for a prompt;
// - everything else gets no answer, which leaves the command to the ordinary permission flow.
//
// "Allowed" covers the whole command line, so it is given only when the merge is the whole command line: a merge
// chained to anything (`gh pr merge 5 --merge && …`), redirected, wrapped (`env`, `xargs`), carrying an assignment
// or holding an expansion is never allowed here, whatever its base.
//
// No shell parser: the command is split into simple commands by a small scanner that honours quotes, and a merge is
// the words `gh pr merge`, or `gh api` on the merge endpoint, in one of them. Erring strict costs a prompt; erring
// loose would cost the rule. `tests/scripts/merge-gate.test.ts` pins every form.
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** The branch a merge into which is the maintainer's alone to ask for */
export const GUARDED = 'main'

const SEPARATORS = new Set([';', '&', '|', '\n', '(', ')'])

/** A command line as its simple commands, and what the scanner saw on the way. Each command is its `words` (quotes
 *  removed) and, word for word, `dynamic`: the shell would expand something in it (`$…`, a substitution), so the word
 *  is not what it reads as. `compound`: more than one command, or a substitution; `redirected`: a `<` or `>` outside
 *  quotes. A substitution leaves one dynamic word where it stands and is scanned as a command of its own. */
export function simpleCommands(text) {
  const commands = []
  const seen = { compound: false, redirected: false }
  let words = []
  let dynamic = []
  let word = null
  let wordIsDynamic = false
  let quote = null
  const endWord = () => {
    if (word !== null) {
      words.push(word)
      dynamic.push(wordIsDynamic)
    }
    word = null
    wordIsDynamic = false
  }
  const endCommand = () => {
    endWord()
    if (words.length > 0) commands.push({ words, dynamic })
    words = []
    dynamic = []
  }
  const substitution = () => {
    word = `${word ?? ''}$(…)`
    wordIsDynamic = true
    seen.compound = true
    endCommand()
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote !== null) {
      if (c === quote) quote = null
      else if (quote === '"' && c === '\\' && i + 1 < text.length) word += text[++i]
      else {
        if (quote === '"' && (c === '$' || c === '`')) wordIsDynamic = true
        word += c
      }
    } else if (c === "'" || c === '"') {
      quote = c
      word ??= ''
    } else if (c === '\\' && i + 1 < text.length) {
      const next = text[++i]
      if (next !== '\n') word = (word ?? '') + next
    } else if (c === ' ' || c === '\t') {
      endWord()
    } else if (c === '#' && word === null) {
      while (i + 1 < text.length && text[i + 1] !== '\n') i++
    } else if (c === '`') {
      substitution()
    } else if (c === '$' && text[i + 1] === '(') {
      i++
      substitution()
    } else if (SEPARATORS.has(c)) {
      seen.compound = true
      endCommand()
    } else if (c === '<' || c === '>') {
      seen.redirected = true
      endWord()
    } else {
      if (c === '$') wordIsDynamic = true
      word = (word ?? '') + c
    }
  }
  endCommand()
  if (commands.length > 1) seen.compound = true
  return { commands, ...seen }
}

/** `gh pr merge`'s flags that take a value (gh 2.x, `gh pr merge --help`) */
const VALUE_FLAGS = new Set(['-A', '--author-email', '-b', '--body', '-F', '--body-file', '--match-head-commit', '-R', '--repo', '-t', '--subject'])
const REPO_FLAGS = new Set(['-R', '--repo'])
/** Flags with which the command is not a merge */
const NOT_A_MERGE = new Set(['-h', '--help', '--disable-auto'])

/** What follows `gh pr merge`: the pull request it names (a number, a URL, a branch; null for the current branch's)
 *  and the repository a flag names, each with the index of the word it was read from; null when the command merges
 *  nothing. */
function pullRequestArguments(args) {
  let ref = null
  let repo = null
  const from = []
  const takeRepo = (value, at) => {
    repo = value ?? null
    from.push(at)
  }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (NOT_A_MERGE.has(arg)) return null
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=')
      const name = eq < 0 ? arg : arg.slice(0, eq)
      if (!VALUE_FLAGS.has(name)) continue
      if (eq < 0) i++
      if (REPO_FLAGS.has(name)) takeRepo(eq < 0 ? args[i] : arg.slice(eq + 1), i)
    } else if (arg.startsWith('-') && arg.length > 1) {
      // a cluster of short flags: the first that takes a value takes the rest of the cluster, or the next word
      for (let j = 1; j < arg.length; j++) {
        const name = `-${arg[j]}`
        if (NOT_A_MERGE.has(name)) return null
        if (!VALUE_FLAGS.has(name)) continue
        const rest = arg.slice(j + 1).replace(/^=/, '')
        if (rest === '') i++
        if (REPO_FLAGS.has(name)) takeRepo(rest === '' ? args[i] : rest, i)
        break
      }
    } else if (ref === null) {
      ref = arg
      from.push(i)
    }
  }
  return { ref, repo, from }
}

const MERGE_ENDPOINT = /(?:^|\/)repos\/([^/]+)\/([^/]+)\/pulls\/([^/]+)\/merge\/?$/
const PLACEHOLDER = /^(?:\{\w+\}|:\w+)$/
const GRAPHQL_MERGE = /mergePullRequest|enablePullRequestAutoMerge/

/** What follows `gh api`, when it is the REST or the GraphQL way to merge a pull request; null otherwise. A request
 *  to the merge endpoint is a merge only as a PUT (a GET asks whether the pull request is merged). */
function apiArguments(args) {
  if (args[0] === 'graphql') return args.some(a => GRAPHQL_MERGE.test(a)) ? { ref: null, repo: null, from: [], graphql: true } : null
  let put = false
  let endpoint = null
  let at = -1
  for (let i = 0; i < args.length; i++) {
    const method = /^(?:-X|--method)(?:=?(.+))?$/.exec(args[i])
    if (method) put = (method[1] ?? args[++i] ?? '').toUpperCase() === 'PUT'
    else if (endpoint === null) {
      endpoint = MERGE_ENDPOINT.exec(args[i])
      at = i
    }
  }
  if (!put || endpoint === null) return null
  const [, owner, name, number] = endpoint
  return { ref: number, repo: PLACEHOLDER.test(owner) || PLACEHOLDER.test(name) ? null : `${owner}/${name}`, from: [at], graphql: false }
}

/** Every merge of a pull request a command line makes. `ref` and `repo` as the command names them (null: the current
 *  branch's pull request, the current directory's repository); `unreadable`: the words do not say which pull request
 *  (an expansion where it is named, a `GH_…` assignment, a GraphQL mutation); `plain`: the merge is the whole command
 *  line, written `gh pr merge …` with nothing for the shell to expand. */
export function mergesIn(text) {
  const { commands, compound, redirected } = simpleCommands(text)
  const merges = []
  for (const { words, dynamic } of commands) {
    let start = 0
    while (start < words.length && /^[A-Za-z_]\w*=/.test(words[start])) start++
    const assigned = words.slice(0, start)
    for (let i = start; i < words.length; i++) {
      if (words[i] !== 'gh' && !words[i].endsWith('/gh')) continue
      const viaApi = words[i + 1] === 'api'
      if (!viaApi && !(words[i + 1] === 'pr' && words[i + 2] === 'merge')) continue
      const first = i + (viaApi ? 2 : 3)
      const found = viaApi ? apiArguments(words.slice(first)) : pullRequestArguments(words.slice(first))
      if (found === null) continue
      merges.push({
        ref: found.ref,
        repo: found.repo,
        unreadable:
          found.graphql === true ||
          found.from.some(at => dynamic[first + at]) ||
          dynamic.slice(i, first).some(Boolean) ||
          assigned.some(a => a.startsWith('GH_')) ||
          (viaApi && !/^\d+$/.test(found.ref ?? '')),
        plain: !viaApi && i === 0 && !compound && !redirected && commands.length === 1 && !dynamic.some(Boolean),
      })
      break
    }
  }
  return merges
}

const named = merge => (merge.ref === null ? "the current branch's pull request" : `pull request ${merge.ref}`)

/** The gate's answer for a command line: `{ decision: 'ask' | 'allow', reason }`, or null for no answer.
 *  `lookup(merge)` returns `{ repo: 'owner/name', base, number }` for the pull request a merge names, or null when it
 *  cannot be found; `here` is this repository as `owner/name` (lower case), or null when it is unknown — then every
 *  pull request is held as this repository's, and none is allowed. */
export function decide(text, { lookup, here }) {
  let allowed = null
  for (const merge of mergesIn(text)) {
    if (merge.unreadable) return { decision: 'ask', reason: `Merge gate: this command merges a pull request the gate cannot read from its text (${named(merge)}).` }
    const found = lookup(merge)
    if (found === null) return { decision: 'ask', reason: `Merge gate: the base branch of ${named(merge)} could not be looked up.` }
    if (here !== null && found.repo.toLowerCase() !== here) continue
    if (found.base === GUARDED) {
      return { decision: 'ask', reason: `Merge gate: #${found.number} merges into ${GUARDED}. CLAUDE.md, Working rules: nothing merges into ${GUARDED} without the maintainer's explicit request.` }
    }
    if (here !== null && merge.plain) allowed = { decision: 'allow', reason: `Merge gate: #${found.number} merges into ${found.base}, not ${GUARDED}.` }
  }
  return allowed
}

/** `owner/name` (lower case) of a GitHub URL, a remote's or a pull request's; null when it is not one */
export function repositoryOf(url) {
  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:\/pull\/\d+.*)?\/?$/.exec(url.trim())
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null
}

function run(file, args, cwd) {
  return execFileSync(file, args, { cwd, encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'] })
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const input = JSON.parse(readFileSync(0, 'utf8'))
  const text = input.tool_name === 'Bash' && typeof input.tool_input?.command === 'string' ? input.tool_input.command : ''
  const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd()
  let here = null
  try {
    here = repositoryOf(run('git', ['-C', dirname(fileURLToPath(import.meta.url)), 'remote', 'get-url', 'origin']))
  } catch {}
  const lookup = merge => {
    try {
      const args = ['pr', 'view', ...(merge.ref === null ? [] : [merge.ref]), '--json', 'baseRefName,number,url', ...(merge.repo === null ? [] : ['--repo', merge.repo])]
      const found = JSON.parse(run('gh', args, cwd))
      const repo = repositoryOf(found.url)
      return repo === null ? null : { repo, base: found.baseRefName, number: found.number }
    } catch {
      return null
    }
  }
  const answer = decide(text, { lookup, here })
  if (answer !== null) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: answer.decision, permissionDecisionReason: answer.reason } }))
  }
}
