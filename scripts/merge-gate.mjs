#!/usr/bin/env node
// The merge gate (CLAUDE.md, Working rules): "Nothing merges into `main` and no version is released without the
// maintainer's explicit request." A sentence holds an agent only while the agent remembers it, so Claude Code runs
// this before every shell command (`.claude/settings.json`, a PreToolUse hook):
//
// - a merge of one of this repository's pull requests into `main` **asks** the person at the keyboard;
// - a merge this script cannot read asks too — a pull request named by an expansion, a merge that follows a command
//   which may have changed the directory or the branch it is resolved in, a GraphQL mutation, a lookup that failed:
//   a gate that guesses is no gate;
// - a merge into any other base, written as one plain `gh pr merge …` and nothing else, is **allowed**: feature work
//   merges into `next` on the agent's own authority (docs/agents/review.md), and it should not wait for a prompt;
// - everything else gets no answer, which leaves the command to the ordinary permission flow.
//
// "Allowed" covers the whole command line, so it is given only when the merge is the whole command line: a merge
// chained to anything (`gh pr merge 5 --merge && …`), redirected, wrapped (`env`, `xargs`, `bash -c`), carrying an
// assignment or holding an expansion is never allowed here, whatever its base.
//
// What it reads is the command line: a merge wherever it stands in it — after a `cd`, behind a wrapper, inside a
// substitution, in what a shell is handed to run (a `-c` string, a here-document, a here-string, a pipe) — and the
// request body a GraphQL call names as a file. A pull request or a repository named by a variable is read at the variable's value only where the line
// leaves no doubt about it: inside the body of its own `for n in 5 6`, when that body sets `n` nowhere, or when the
// whole line sets the name once, to a literal (`R=owner/name`); and only on a line whose every command is known not
// to assign (a closed list of names: the shells have more ways to assign than a list of those could hold). A name
// set twice, in a branch or a loop's later pass, or on a line that runs anything else, is nobody's to read. The
// same doubt covers what leans on a directory or a branch: after a `cd` the shell may have skipped, behind a
// wrapper, in a loop that moves. It does not follow the line into a program it runs (a script that merges is that
// script's to answer for), it sees shell commands only, not a merge another tool makes, and it does not undo a line
// written to hide a merge (a command name built by brace or glob expansion, an encoded payload): it guards against
// forgetting the rule, not against meaning to break it.
//
// The first version read less: it took `gh pr merge` only as three words in a row, resolved every merge in the
// directory the command started in, and kept a substitution inside quotes as text. The review of #635 walked past
// it four ways; the second version followed the line in the order it is written, and the review found a variable
// read at a value the shell had since replaced; the third listed the commands that assign, and the review found
// one more the same day. `tests/scripts/merge-gate.test.ts` pins each, and hands a set of
// lines to bash and zsh themselves, with a stand-in `gh`: where the gate says it can read a line, every merge the
// shell made is one the gate read. Measured on 2026-11-11 over some 15,800 distinct shell commands of this
// repository's recent sessions, which merge in chains and loops, almost never plainly: it found their 424 merging
// commands, called none unreadable and no other command a merge; a scan takes under a millisecond, the node
// process around it about 35.
//
// No shell parser: a small scanner splits the line into simple commands, honouring quotes, substitutions,
// redirections and here-documents. Erring strict costs a prompt; erring loose would cost the rule.
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** The branch a merge into which is the maintainer's alone to ask for */
export const GUARDED = 'main'

/** The word a substitution outside quotes leaves where it stood */
const SUBSTITUTION = '$(…)'
const SEPARATORS = new Set([';', '&', '|', '\n', '(', ')'])

/** The here-document a `<<` at `at` opens: its delimiter, whether a `-` strips the body's leading tabs, whether the
 *  delimiter was quoted (then the body is data and nothing in it runs), and the index after the delimiter. */
function heredocAt(text, at) {
  let i = at + 2
  const strip = text[i] === '-'
  if (strip) i++
  while (text[i] === ' ' || text[i] === '\t') i++
  let delimiter = ''
  let quoted = false
  for (; i < text.length && !/[\s;&|()<>]/.test(text[i]); i++) {
    const c = text[i]
    if (c === "'" || c === '"') {
      quoted = true
      const end = text.indexOf(c, i + 1)
      delimiter += text.slice(i + 1, end < 0 ? text.length : end)
      i = end < 0 ? text.length : end
    } else if (c === '\\') {
      quoted = true
      delimiter += text[++i] ?? ''
    } else delimiter += c
  }
  return { delimiter, strip, quoted, next: i }
}

/** A here-document's body, which starts after the newline at `newline`: its text, and the index of the newline that
 *  ends its last line (the text's last index when the text ends first). */
function bodyOf(text, newline, { delimiter, strip }) {
  const start = newline + 1
  for (let line = start; line <= text.length; ) {
    const stop = text.indexOf('\n', line)
    const content = text.slice(line, stop < 0 ? text.length : stop)
    if ((strip ? content.replace(/^\t+/, '') : content) === delimiter) return { body: text.slice(start, line), end: stop < 0 ? text.length - 1 : stop }
    if (stop < 0) break
    line = stop + 1
  }
  return { body: text.slice(start), end: text.length - 1 }
}

/** Index of the backquote that closes one opened just before `from`; the text's length when none does */
function backquote(text, from) {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\\') i++
    else if (text[i] === '`') return i
  }
  return text.length
}

/** Index of the `)` that closes a `$(` whose text starts at `from`; the text's length when none does. Quotes and
 *  here-documents inside are stepped over, so a parenthesis or a quote in their text closes nothing. */
function closing(text, from) {
  let depth = 1
  const heredocs = []
  for (let i = from; i < text.length; i++) {
    const c = text[i]
    if (c === '\\') i++
    else if (c === "'") {
      const end = text.indexOf("'", i + 1)
      if (end < 0) return text.length
      i = end
    } else if (c === '"') {
      for (i++; i < text.length && text[i] !== '"'; i++) {
        if (text[i] === '\\') i++
        else if (text[i] === '$' && text[i + 1] === '(') i = closing(text, i + 2)
      }
    } else if (c === '<' && text[i + 1] === '<' && text[i + 2] !== '<') {
      const opened = heredocAt(text, i)
      heredocs.push(opened)
      i = opened.next - 1
    } else if (c === '\n' && heredocs.length > 0) {
      for (const opened of heredocs.splice(0)) i = bodyOf(text, i, opened).end
    } else if (c === '(') depth++
    else if (c === ')' && --depth === 0) return i
  }
  return text.length
}

/** The scripts a text runs when the shell expands it: what its `$(…)` and its backquotes hold */
function substitutionsIn(text) {
  const scripts = []
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '\\') i++
    else if (c === '$' && text[i + 1] === '(') {
      const end = closing(text, i + 2)
      scripts.push(text.slice(i + 2, end))
      i = end
    } else if (c === '`') {
      const end = backquote(text, i + 1)
      scripts.push(text.slice(i + 1, end))
      i = end
    }
  }
  return scripts
}

/** A command line as its simple commands, and what the scanner saw on the way. Each command is its `words` (quotes
 *  removed; a redirection's target and a here-document's body are no words); word for word, `dynamic`: the shell
 *  would expand something in it (`$…`, a substitution), so the word is not what it reads as; its `scripts`: the text
 *  of every substitution it holds, in a word or in a here-document the shell expands, each a command line of its
 *  own; its `bodies`: the text of its here-documents and here-strings; and `before` / `after`, the operators that
 *  join it to its neighbours. `compound`: more than one command, or a
 *  substitution; `redirected`: a redirection or a here-document. */
export function simpleCommands(text) {
  const commands = []
  const seen = { compound: false, redirected: false }
  const heredocs = []
  let words = []
  let dynamic = []
  let scripts = []
  let bodies = []
  let word = null
  let wordIsDynamic = false
  let quote = null
  let target = false
  let hereString = false
  let begun = false
  let joint = ''
  let before = ''
  const extend = more => {
    if (!begun) {
      begun = true
      before = joint
      if (commands.length > 0) commands[commands.length - 1].after = joint
      joint = ''
    }
    word = (word ?? '') + more
  }
  const endWord = () => {
    if (word !== null) {
      if (!target) {
        words.push(word)
        dynamic.push(wordIsDynamic)
      } else if (hereString) bodies.push(word)
      target = false
      hereString = false
    }
    word = null
    wordIsDynamic = false
  }
  const endCommand = () => {
    endWord()
    if (words.length > 0) commands.push({ words, dynamic, scripts, bodies, before, after: '' })
    else {
      if (scripts.length > 0 && commands.length > 0) commands[commands.length - 1].scripts.push(...scripts)
      if (begun) joint = before + joint
    }
    words = []
    dynamic = []
    scripts = []
    bodies = []
    target = false
    hereString = false
    begun = false
  }
  const substitute = script => {
    scripts.push(script)
    seen.compound = true
    wordIsDynamic = true
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote !== null) {
      if (c === quote) quote = null
      else if (quote === '"' && c === '\\' && i + 1 < text.length) {
        // inside double quotes a backslash quotes `$`, a backquote, `"` and itself, is a line continuation before a
        // newline, and before anything else is a backslash
        const next = text[++i]
        if (next !== '\n') word += '$`"\\'.includes(next) ? next : `\\${next}`
      } else if (quote === '"' && c === '$' && text[i + 1] === '(') {
        const end = closing(text, i + 2)
        word += text.slice(i, end + 1)
        substitute(text.slice(i + 2, end))
        i = end
      } else if (quote === '"' && c === '`') {
        const end = backquote(text, i + 1)
        word += text.slice(i, end + 1)
        substitute(text.slice(i + 1, end))
        i = end
      } else {
        if (quote === '"' && c === '$') wordIsDynamic = true
        word += c
      }
    } else if (c === "'" || c === '"') {
      quote = c
      extend('')
    } else if (c === '\\' && i + 1 < text.length) {
      const next = text[++i]
      if (next !== '\n') extend(next)
    } else if (c === ' ' || c === '\t') {
      endWord()
    } else if (c === '#' && word === null) {
      while (i + 1 < text.length && text[i + 1] !== '\n') i++
    } else if (c === '$' && text[i + 1] === '(') {
      const end = closing(text, i + 2)
      extend(SUBSTITUTION)
      substitute(text.slice(i + 2, end))
      i = end
    } else if (c === '`') {
      const end = backquote(text, i + 1)
      extend(SUBSTITUTION)
      substitute(text.slice(i + 1, end))
      i = end
    } else if ((c === '<' || c === '>') && text[i + 1] === '(') {
      // a process substitution: where it stands, a file name the shell makes up; what it holds, a script
      const end = closing(text, i + 2)
      extend(SUBSTITUTION)
      substitute(text.slice(i + 2, end))
      i = end
    } else if (c === '<' && text[i + 1] === '<' && text[i + 2] !== '<') {
      seen.redirected = true
      endWord()
      // the body comes after the line, by when the line may have gone on to other commands: it is kept for this one
      const opened = { ...heredocAt(text, i), bodies, scripts }
      heredocs.push(opened)
      i = opened.next - 1
    } else if (c === '<' || c === '>' || (c === '&' && text[i + 1] === '>')) {
      seen.redirected = true
      if (word !== null && /^\d+$/.test(word)) word = null
      endWord()
      // (`<<<`: the word that follows is what the command reads, kept with its here-documents)
      hereString = text.startsWith('<<<', i)
      while (i + 1 < text.length && '<>&|'.includes(text[i + 1])) i++
      target = true
    } else if (c === '\n' && heredocs.length > 0) {
      for (const opened of heredocs.splice(0)) {
        const { body, end } = bodyOf(text, i, opened)
        opened.bodies.push(body)
        if (!opened.quoted) opened.scripts.push(...substitutionsIn(body))
        i = end
      }
      seen.compound = true
      endCommand()
      joint += '\n'
    } else if (SEPARATORS.has(c)) {
      seen.compound = true
      endCommand()
      joint += c
    } else {
      if (c === '$') wordIsDynamic = true
      extend(c)
    }
  }
  endCommand()
  if (commands.length > 0) commands[commands.length - 1].after = joint
  if (commands.length > 1) seen.compound = true
  return { commands, ...seen }
}

/** `gh pr merge`'s flags that take a value (gh 2.x, `gh pr merge --help`) */
const VALUE_FLAGS = new Set(['-A', '--author-email', '-b', '--body', '-F', '--body-file', '--match-head-commit', '-R', '--repo', '-t', '--subject'])
const REPO_FLAGS = new Set(['-R', '--repo'])
/** Flags with which the command is not a merge */
const NOT_A_MERGE = new Set(['-h', '--help', '--disable-auto'])

/** What follows `gh pr merge` from the word at `first`: the pull request it names (a number, a URL, a branch; null
 *  for the current branch's) and the repository a flag names, each with the index of the word it was read from (-1
 *  for none); `loose`, a word the shell decides that is no option's value, so may itself be a flag or another pull
 *  request; null when the command merges nothing. */
function pullRequestArguments(words, dynamic, first) {
  let ref = null
  let repo = null
  let refAt = -1
  let repoAt = -1
  let loose = false
  for (let i = first; i < words.length; i++) {
    const arg = words[i]
    if (NOT_A_MERGE.has(arg)) return null
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=')
      const name = eq < 0 ? arg : arg.slice(0, eq)
      if (!VALUE_FLAGS.has(name)) continue
      if (eq < 0) i++
      if (REPO_FLAGS.has(name)) {
        repo = (eq < 0 ? words[i] : arg.slice(eq + 1)) ?? null
        repoAt = i
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      // a cluster of short flags: the first that takes a value takes the rest of the cluster, or the next word
      for (let j = 1; j < arg.length; j++) {
        const name = `-${arg[j]}`
        if (NOT_A_MERGE.has(name)) return null
        if (!VALUE_FLAGS.has(name)) continue
        const rest = arg.slice(j + 1).replace(/^=/, '')
        if (rest === '') i++
        if (REPO_FLAGS.has(name)) {
          repo = (rest === '' ? words[i] : rest) ?? null
          repoAt = i
        }
        break
      }
    } else if (ref === null) {
      ref = arg
      refAt = i
    } else if (dynamic[i]) loose = true
  }
  return { ref, repo, refAt, repoAt, loose }
}

const MERGE_ENDPOINT = /(?:^|\/)repos\/([^/]+)\/([^/]+)\/pulls\/([^/]+)\/merge\/?$/
const PLACEHOLDER = /^(?:\{\w+\}|:\w+)$/
const GRAPHQL_MERGE = /mergePullRequest|enablePullRequestAutoMerge/

/** `gh api`'s flags that take a value (gh 2.x, `gh api --help`): the short ones, and the long name of each */
const API_SHORT = { f: '--raw-field', F: '--field', H: '--header', X: '--method', q: '--jq', t: '--template', p: '--preview' }
const API_LONG = new Set([...Object.values(API_SHORT), '--input', '--hostname', '--cache'])

/** The options of a `gh api` whose arguments start at `first` that take a value, each as its long name, its value
 *  and the index of the word the value was read from. `-fquery=x`, `-f query=x`, `--raw-field=query=x` and
 *  `--raw-field query=x` are one option, and a cluster of short flags ends at the first that takes a value. */
function apiOptions(words, first) {
  const options = []
  for (let i = first; i < words.length; i++) {
    const word = words[i]
    if (word.startsWith('--')) {
      const eq = word.indexOf('=')
      const name = eq < 0 ? word : word.slice(0, eq)
      if (!API_LONG.has(name)) continue
      if (eq < 0) i++
      options.push({ name, value: eq < 0 ? words[i] : word.slice(eq + 1), at: i })
    } else if (word.startsWith('-')) {
      for (let j = 1; j < word.length; j++) {
        const name = API_SHORT[word[j]]
        if (name === undefined) continue
        const attached = word.slice(j + 1).replace(/^=/, '')
        if (attached === '') i++
        options.push({ name, value: attached === '' ? words[i] : attached, at: i })
        break
      }
    }
  }
  return options
}

/** What the options of a `gh api` send as a GraphQL query: `literal`, an argument that holds a merge mutation;
 *  `unseen`, a query the arguments do not hold (an expansion, the standard input, a file named by an expansion);
 *  `files`, the files a query or the whole body is read from. */
function graphqlQuery(options, dynamic) {
  let literal = false
  let unseen = false
  const files = []
  for (const { name, value, at } of options) {
    if (value === undefined) continue
    if (name === '--input') {
      if (dynamic[at] || value === '-') unseen = true
      else files.push(value)
    } else if (name === '--raw-field' || name === '--field') {
      // (a field whose key the shell composes may be the query: `-f "$FIELD"`)
      const eq = value.indexOf('=')
      if (dynamic[at] && (eq < 0 || /[$`]/.test(value.slice(0, eq)))) unseen = true
      if (!value.startsWith('query=')) continue
      const query = value.slice('query='.length)
      const typed = name === '--field'
      if (dynamic[at] || (typed && query === '@-')) unseen = true
      else if (typed && query.startsWith('@')) files.push(query.slice(1))
      else if (GRAPHQL_MERGE.test(query)) literal = true
    }
  }
  return { kind: 'graphql', literal, unseen, files }
}

/** The GraphQL endpoint as `gh api` takes it: the bare word, or the URL of one (`https://host/graphql`, `…/api/graphql`) */
const GRAPHQL_ENDPOINT = /(?:^|\/)graphql\/?$/

/** What follows `gh api` from the word at `first`, when it is the REST or the GraphQL way to merge a pull request;
 *  null otherwise. The words are first told apart as the CLI tells them: an option's value, the endpoint, and any
 *  other word, which only an expansion puts there and which may then be an option whole (`"$FIELD"` holding
 *  `-fquery=…`, or `-X PUT`). A request to the merge endpoint is a merge only as a PUT (a GET asks whether the pull
 *  request is merged); a method the shell decides, or may have brought in such a word, may be one. */
function apiArguments(words, dynamic, first) {
  const options = apiOptions(words, first)
  const values = new Set(options.map(option => option.at))
  const bare = []
  for (let k = first; k < words.length; k++) if (!words[k].startsWith('-') && !values.has(k)) bare.push(k)
  const query = graphqlQuery(options, dynamic)
  const graphql = bare.find(k => !dynamic[k] && GRAPHQL_ENDPOINT.test(pathOf(words[k])))
  if (graphql !== undefined) {
    if (bare.some(k => k !== graphql && dynamic[k])) query.unseen = true
    return query.literal || query.unseen || query.files.length > 0 ? query : null
  }
  // (a merge mutation in sight is one, whatever endpoint the shell composes for it)
  if (query.literal) return query
  const method = options.findLast(option => option.name === '--method')
  const put = method !== undefined && (dynamic[method.at] || (method.value ?? '').toUpperCase() === 'PUT')
  const at = words.findIndex((word, k) => k >= first && MERGE_ENDPOINT.test(pathOf(word)))
  if (at >= 0) {
    if (!put && !bare.some(k => k !== at && dynamic[k])) return null
    const [, owner, name, number] = MERGE_ENDPOINT.exec(pathOf(words[at]))
    const blanks = [PLACEHOLDER.test(owner), PLACEHOLDER.test(name)]
    // (`{owner}/{repo}` is the directory's repository; a repository named by half is nobody's to put together)
    return { kind: 'api', ref: number, repo: blanks[0] || blanks[1] ? null : `${owner}/${name}`, refAt: at, repoAt: at, ...(blanks[0] !== blanks[1] ? { composed: true } : {}) }
  }
  // no merge endpoint in sight, but the endpoint, the first of the bare words, is one the shell composes
  // (`"$ENDPOINT"`, `$R/merge`). An endpoint whose path is in sight is that path, whatever else the line holds.
  const composed = bare[0]
  if (composed === undefined || !dynamic[composed]) return null
  // a PUT to one that may end in `/merge` is a merge nobody can read
  if (mayEndWith(words[composed], '/merge') && (put || bare.slice(1).some(k => dynamic[k]))) return { kind: 'api', ref: null, repo: null, refAt: composed, repoAt: composed, composed: true }
  // and one that may be the GraphQL endpoint makes of a query the line does not show a request nobody can read, and
  // of a body file what the request sends
  return mayEndWith(words[composed], 'graphql') && (query.unseen || query.files.length > 0) ? query : null
}

/** An endpoint without the query or the fragment that may follow its path */
const pathOf = word => word.split(/[?#]/, 1)[0]

/** Whether a word the shell expands may come out with a path that ends in `ending`: what stands after its last
 *  expansion is all the line says of its end */
function mayEndWith(whole, ending) {
  const word = pathOf(whole)
  const expansions = [...word.matchAll(/\$\{[^}]*\}|\$\([^)]*\)|\$[A-Za-z_]\w*|`[^`]*`/g)]
  const last = expansions.at(-1)
  // (a path with no expansion in it is what it reads as: what the shell decides is then in the query after it)
  if (last === undefined) return false
  const tail = word.slice(last.index + last[0].length)
  return tail.length >= ending.length ? tail.endsWith(ending) : ending.endsWith(tail)
}

/** The merge a `gh` at word `at` makes, or null: `gh pr merge` or `gh api`, past the flags that may stand before
 *  either subcommand (`gh -R owner/name pr merge 5` is the same merge). */
function ghCall(words, dynamic, at) {
  let j = at + 1
  let repo = null
  let repoAt = -1
  let loose = false
  const flags = () => {
    for (; j < words.length && (words[j].startsWith('-') || dynamic[j]); j++) {
      // (a word the shell decides, before a subcommand: a flag, or the subcommand itself, for all the line says)
      if (dynamic[j] && !words[j].startsWith('-')) loose = true
      const flag = /^(?:-R|--repo)(?:=?(.+))?$/.exec(words[j])
      if (flag === null) continue
      if (flag[1] === undefined) j++
      repo = flag[1] ?? words[j] ?? null
      repoAt = j
    }
  }
  flags()
  if (words[j] === 'api') return apiArguments(words, dynamic, j + 1)
  if (words[j] !== 'pr') return null
  j++
  flags()
  if (words[j] !== 'merge') return null
  const found = pullRequestArguments(words, dynamic, j + 1)
  return found === null ? null : { kind: 'pr', ref: found.ref, refAt: found.refAt, repo: found.repo ?? repo, repoAt: found.repo === null ? repoAt : found.repoAt, loose: loose || found.loose }
}

/** Words that stand before a command without being it */
const RESERVED = new Set(['{', '}', '!', 'if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while', 'until', 'for', 'case', 'esac', 'time', 'function'])
/** Commands, besides a plain `cd`, after which the shell may stand in another directory */
const MOVES = new Set(['pushd', 'popd', 'source', '.', 'eval'])
/** Words before a builtin that leave it running in this shell */
const RUNS_BUILTINS = new Set(['command', 'builtin', 'noglob', 'nocorrect', '-'])
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh'])
const ASSIGNMENT = /^[A-Za-z_]\w*=/
/** A word that is one variable, whole: `$n`, `${n}` */
const VARIABLE = /^\$(?:(\w+)|\{(\w+)\})$/
/** A command string that is nothing but what the shell expands: variables, substitutions */
const HIDDEN = /^\s*(?:(?:\$\w+|\$\{[^}]*\}|\$\((?:[^()]|\([^()]*\))*\)|`[^`]*`)\s*)+$/
/** An assignment that changes which repository `gh` works on: its own variables (`GH_REPO`, `GH_HOST`), and git's
 *  (`GIT_DIR`), whose remotes it reads */
const REPOINTS = /^(?:GH|GIT)_\w*=/
/** The operators after which the next command runs in the same shell: always (`;`, a newline), or when the one
 *  before succeeded (`&&`) */
const SEQUENCE = /^(?:&&\n*|[;\n]+)$/
const CHAINED = /^&&\n*$/
/** The words that open a block whose commands run or not as it decides, and the words that close one */
const OPENS = new Set(['if', 'case', 'while', 'until', 'for'])
const CLOSES = new Set(['fi', 'esac', 'done'])
/** What joins two commands, without the parentheses that open or close a subshell between them */
const joining = joint => joint.replace(/[()]/g, '')

/** How a shell whose name is the word at `at` is told what to run, read the way the shell reads its own options:
 *  `c` anywhere in a cluster of short options means the first word that is no option is the command string
 *  (`bash -ce '…'`, `bash -euo pipefail -c '…'`); `s`, or no such word at all, means the commands come on the
 *  standard input; otherwise that word is a script file. `-o` and `-O` take the next word, as do the two long
 *  options that name a file. */
function shellInput(words, at) {
  let string = false
  let stdin = false
  for (let k = at + 1; k < words.length; k++) {
    const word = words[k]
    if (word === '--') return { string, stdin, first: words[k + 1] }
    if (word.startsWith('--')) {
      if (word === '--rcfile' || word === '--init-file') k++
    } else if (/^[-+]./.test(word)) {
      if (word[0] === '-' && word.includes('c')) string = true
      if (word[0] === '-' && word.includes('s')) stdin = true
      if (/[oO]$/.test(word)) k++
    } else return { string, stdin, first: word }
  }
  return { string, stdin, first: undefined }
}

/** The command lines a command hands to a shell: the string after `bash -c`, the arguments of `eval`, and the
 *  here-documents and here-strings of a shell that reads its commands from the standard input (`bash <<'EOF'`,
 *  `bash -s`, `bash <<< '…'`: quoted or not, that text runs); with `at`, the index of the word that is the shell,
 *  and `reads`, whether it reads the standard input at all. A shell given a script file runs the file, which is not
 *  the line's to read. */
function shellStrings({ words, bodies }, start) {
  for (let j = start; j < words.length; j++) {
    const name = words[j].slice(words[j].lastIndexOf('/') + 1)
    if (name === 'eval') return { at: j, scripts: [words.slice(j + 1).join(' ')], reads: false }
    if (!SHELLS.has(name)) continue
    const { string, stdin, first } = shellInput(words, j)
    if (string) return { at: j, scripts: first === undefined ? [] : [first], reads: false }
    const reads = stdin || first === undefined
    return { at: j, scripts: reads ? bodies : [], reads }
  }
  return { at: start, scripts: [], reads: false }
}

/** Commands that cannot set a shell variable: programs of their own, and the builtins that only test, print, move
 *  or leave. The list is closed on purpose. The shells have more ways to assign than a list of them can hold
 *  (`printf -vN`, zsh's `print -v`, `read -aN`, a function the line defines), and the review of #635 found one the
 *  day such a list was written; so a line that runs anything not named here is a line whose variables the gate does
 *  not claim to know. */
const INERT = new Set([
  ...['gh', 'git', 'echo', 'sleep', 'true', 'false', ':', 'test', '[', '[[', 'break', 'continue', 'cd', 'exit', 'pwd'],
  ...['tail', 'head', 'cat', 'grep', 'rg', 'sed', 'awk', 'jq', 'tr', 'cut', 'sort', 'uniq', 'wc', 'tee', 'date', 'ls', 'mkdir', 'rm', 'cp', 'mv', 'touch', 'basename', 'dirname'],
  ...['pnpm', 'npm', 'npx', 'node', 'curl', 'perl', 'python3', 'ps', 'df', 'du', 'base64', 'open', 'sysctl', 'find', 'xargs'],
  // (a shell run as a program is a process of its own: what it assigns, it assigns to itself)
  ...['bash', 'sh', 'zsh', 'dash', 'ksh'],
])
/** A word that sets a variable, wherever it stands: `n=5`, `n+=5`, `n[1]=5` */
const SETS = /^([A-Za-z_]\w*)(?:\[[^\]]*\])?\+?=/

/** Whether the command whose name is the word at `at` leaves every variable as it was: one of INERT; `printf`
 *  without its `-v`; `export` of nothing but assignments, whose values are then in sight; `set` of options alone
 *  (`set -e`, `set -o pipefail`), not of the positional parameters or, with `-A`, of an array */
function inert(words, dynamic, at) {
  if (dynamic[at]) return false
  const name = words[at].slice(words[at].lastIndexOf('/') + 1)
  const rest = words.slice(at + 1)
  if (name === 'printf') return !rest.some(word => word.startsWith('-v'))
  if (name === 'export') return rest.length > 0 && rest.every(word => ASSIGNMENT.test(word))
  if (name === 'set') return rest.every((word, k) => (/^[-+][a-zA-Z]+$/.test(word) && !word.includes('A')) || (/^\w+$/.test(word) && /^[-+]o$/.test(rest[k - 1] ?? '')))
  return INERT.has(name)
}

/** The words a `for` at word `at` runs its variable over (`for n in 5 6`), or null when the shell decides any of them */
function literalsOf(words, dynamic, at) {
  return words[at + 2] === 'in' && words.length > at + 3 && !dynamic.slice(at + 3).some(Boolean) ? words.slice(at + 3) : null
}

/** How a command line sets its variables and moves, read over the whole line before any of it is followed, because
 *  the order the shell runs it in is not the order it is written in (a loop's second pass, a branch not taken, a
 *  function called later). `settings`: how many times each name is set by a word of the line — an assignment in any
 *  position, a loop's variable; `loopsOf`: command by command, the loops it stands in, outermost first, each with
 *  the variable its `for` runs (null for a `while`), the literal values it runs it over (null when the shell
 *  decides them) and the names its body sets; `opaque`: something on the line may set a variable without a word
 *  that says so — a command not known to be inert, arithmetic, an expansion or a redirection that assigns;
 *  `loopMoves`: a loop's body changes the directory.
 *
 *  A variable is taken at its value only where no order of execution can make the value another: inside the body
 *  of its own `for`, when that body sets it nowhere; anywhere else, when the whole line sets it once; and never on
 *  an opaque line. */
function lineOf(commands, text) {
  const settings = new Map()
  const stack = []
  const loopsOf = []
  let header = null
  const set = name => {
    settings.set(name, (settings.get(name) ?? 0) + 1)
    for (const loop of stack) loop.sets.add(name)
  }
  // (arithmetic, `$[…]`; any `${…=…}`: bash's `${n:=5}`, zsh's `${n::=5}`; `{n}>file`, which sets `n` to a descriptor)
  let opaque = /\(\(|\$\[|\$\{[^}]*=|\{[A-Za-z_]\w*\}[<>]/.test(text)
  let loopMoves = false
  for (const { words, dynamic } of commands) {
    let start = 0
    let heads = false
    for (; start < words.length && RESERVED.has(words[start]); start++) {
      if (words[start] === 'do') {
        stack.push({ ...(header ?? { name: null, values: null }), sets: new Set() })
        header = null
      } else if (words[start] === 'done') stack.pop()
      else if (words[start] === 'for' && words[start + 1] !== undefined) {
        set(words[start + 1])
        header = { name: words[start + 1], values: literalsOf(words, dynamic, start) }
        heads = true
      } else if (words[start] === 'case') heads = true
      else if (words[start] === 'function') opaque = true
    }
    loopsOf.push([...stack])
    for (const word of words) {
      const sets = SETS.exec(word)
      if (sets) set(sets[1])
    }
    // what follows `for` or `case` on their own line is the loop's list or the subject, not a command
    let at = start
    while (at < words.length && ASSIGNMENT.test(words[at])) at++
    if (heads || at >= words.length) continue
    if (!inert(words, dynamic, at)) opaque = true
    const name = words[at].slice(words[at].lastIndexOf('/') + 1)
    if (stack.length > 0 && (name === 'cd' || MOVES.has(name) || RUNS_BUILTINS.has(name))) loopMoves = true
  }
  return { settings, loopsOf, opaque, loopMoves }
}

/** What the variables hold after `command`, as far as its words say: the literals of `for n in 5 6` and of a plain
 *  `R=owner/name`; a variable set any other way (an expansion, an assignment the shell may skip) holds nothing the
 *  gate knows. Whether a held value may be used at all is the line's to say (`lineOf`). */
function learn(context, { words, dynamic, before, after }) {
  const hold = (name, values) => {
    context.vars = { ...context.vars, [name]: values }
  }
  for (let at = 0; at < words.length && RESERVED.has(words[at]); at++) {
    if (words[at] !== 'for' || words[at + 1] === undefined) continue
    hold(words[at + 1], literalsOf(words, dynamic, at))
    return
  }
  const first = words[0] === 'export' ? 1 : 0
  if (words.length > first && words.slice(first).every(w => ASSIGNMENT.test(w))) {
    const inSequence = (joining(before) === '' || SEQUENCE.test(joining(before))) && (joining(after) === '' || SEQUENCE.test(joining(after)))
    for (let k = first; k < words.length; k++) {
      const eq = words[k].indexOf('=')
      hold(words[k].slice(0, eq), context.blocks === 0 && inSequence && !dynamic[k] ? [words[k].slice(eq + 1)] : null)
    }
    if (inSequence && CHAINED.test(joining(before))) context.conditionalVars = true
  }
}

/** Where the commands after `command` run, as far as its words say: a plain `cd` to a literal directory, joined to
 *  its neighbours in sequence, is followed; any other change of directory, and an assignment that repoints `gh`,
 *  loses the directory, and so does a `cd` inside a block (`if`, `case`, a loop) and a command that changes which
 *  repository the directory is (`git remote`, `git config`, `gh repo set-default`); any other command may have
 *  changed the branch. A `cd` reached through `&&` ran only if what
 *  stands before it succeeded, so it is conditional: it holds for the rest of that chain and no further. */
function move(context, { words, dynamic, before, after }, start) {
  if (words.some(word => REPOINTS.test(word))) context.dirKnown = false
  const head = words[start]
  if (head === undefined) return
  if (head === 'cd') {
    const inSequence = (joining(before) === '' || SEQUENCE.test(joining(before))) && (joining(after) === '' || SEQUENCE.test(joining(after)))
    if (context.blocks === 0 && start === 0 && inSequence && words.length <= 2 && !dynamic.some(Boolean) && words[1] !== '-') {
      context.dirs = [...context.dirs, words[1] ?? '~']
      if (CHAINED.test(joining(before))) context.conditionalDir = true
    } else context.dirKnown = false
  } else {
    // (`git remote`, `git config`, `gh repo set-default`: the directory stays, the repository `gh` finds in it may not)
    const rebinds = (head === 'git' && words.slice(start + 1).some(word => word === 'remote' || word === 'config') && words.length > start + 2 && !words.includes('-v')) || (head === 'gh' && words.includes('set-default'))
    // (`command cd x`, `builtin pushd x`, zsh's `noglob cd x`: the builtin runs in this shell all the same)
    const carried = RUNS_BUILTINS.has(head) && words.slice(start + 1).some(word => word === 'cd' || MOVES.has(word))
    if (MOVES.has(head) || rebinds || carried) context.dirKnown = false
    context.branchKnown = false
  }
}

/** Every merge of a pull request a command line makes, its substitutions and the strings it hands a shell included.
 *  `ref` and `repo` as the command names them (null: the current branch's pull request, the current directory's
 *  repository), a variable whose value the line leaves no doubt about read as that value, one merge for each; `dirs`: the literal `cd`s that
 *  precede it, to resolve from where the line starts; `unreadable`: the line does not say which pull request (an
 *  expansion where it is named, a `GH_…` assignment, a directory or a branch lost on the way, changed by the loop it
 *  stands in or left to a wrapper, a GraphQL mutation);
 *  `plain`: the merge is the whole command line, written
 *  `gh … pr merge …` with nothing for the shell to expand; `files`, on a GraphQL request alone: the files its body is
 *  read from, which say whether it merges. */
export function mergesIn(text, inherited = { dirs: [], dirKnown: true, branchKnown: true, conditionalDir: false, conditionalVars: false, loops: 0, blocks: 0, vars: {} }, depth = 0) {
  const { commands, compound, redirected } = simpleCommands(text)
  const line = lineOf(commands, text)
  const context = { ...inherited }
  const merges = []
  // what a subshell does to the directory and the variables ends at its closing parenthesis; what it did to the
  // branch, or to a file, stays done. A `case` ends each of its patterns with a `)` that closes nothing: `cases`
  // holds, for every `case` still open, how many subshells were open when it began, and a `)` met at that depth is a
  // pattern's. A `)` with nothing to close leaves the directory and the variables unknown.
  const scopes = []
  const cases = []
  context.blocks = 0
  for (const [index, command] of commands.entries()) {
    const { words, dynamic, scripts } = command
    const loops = line.loopsOf[index]
    for (const c of command.before) {
      if (c === '(') scopes.push({ ...context })
      else if (c === ')' && !(cases.length > 0 && scopes.length <= cases.at(-1))) {
        const outer = scopes.pop()
        if (outer === undefined) Object.assign(context, { dirKnown: false, vars: {} })
        else Object.assign(context, outer, { branchKnown: outer.branchKnown && context.branchKnown, blocks: context.blocks })
      }
    }
    // the blocks the command stands in (`if … fi`, `case … esac`, a loop to its `done`): inside one, a command runs
    // or not as the block decides, so what it does to the directory or to a variable is not the line's to count on
    for (let k = 0; k < words.length && RESERVED.has(words[k]); k++) {
      if (words[k] === 'case') cases.push(scopes.length)
      else if (words[k] === 'esac') cases.pop()
      if (OPENS.has(words[k])) context.blocks++
      else if (CLOSES.has(words[k])) context.blocks = Math.max(0, context.blocks - 1)
    }
    if (!CHAINED.test(joining(command.before))) {
      // the `&&` chain a `cd` or an assignment was reached through has ended: whether it ran is not on the line
      if (context.conditionalDir) context.dirKnown = false
      if (context.conditionalVars) context.vars = {}
      context.conditionalDir = false
      context.conditionalVars = false
    }
    // what a substitution runs is a command that ran, and it runs before the command it stands in: the branch, and
    // any file, may be another by the time that command reads them
    if (scripts.length > 0) context.branchKnown = false
    // the values of a variable where the line leaves no doubt about them: inside the body of its own loop, that
    // loop's, unless the body sets the name; anywhere else, what the line's one setting gave it; null otherwise, and
    // when a value reads as a flag (it is then no pull request and no repository)
    const valuesOf = name => {
      if (line.opaque) return null
      const own = loops.findLast(loop => loop.name === name)
      const values = own !== undefined ? (own.sets.has(name) ? null : own.values) : line.settings.get(name) === 1 && Object.hasOwn(context.vars, name) ? context.vars[name] : null
      return values ?? null
    }
    let start = 0
    while (start < words.length && (RESERVED.has(words[start]) || ASSIGNMENT.test(words[start]))) start++
    for (let i = start; i < words.length; i++) {
      // (a word the shell decides may be `gh` too: `$GH pr merge 5` is a merge nobody can read)
      if (words[i] !== 'gh' && !words[i].endsWith('/gh') && !dynamic[i]) continue
      const call = ghCall(words, dynamic, i)
      if (call === null) continue
      // behind a wrapper (`env`, `xargs`, `command`), what the directory, the branch and the environment are when `gh`
      // runs is the wrapper's to know; and an assignment that repoints `gh` counts wherever it stands before it
      const wrapped = i > start
      const repointed = words.slice(0, i).some(word => REPOINTS.test(word))
      const lostDirectory = wrapped || !context.dirKnown || line.loopMoves
      if (call.kind === 'graphql') {
        // a body file is opened now, before the line runs: it says what the request will send only if nothing on the
        // line could rewrite it first (no command but a literal `cd` before it, no loop around it), and, named by a
        // relative path, only if the directory is not in doubt. A query the line does not show is nobody's to read.
        const settled = context.branchKnown && context.loops + loops.length === 0
        const adrift = call.files.length > 0 && (!settled || (lostDirectory && call.files.some(file => !file.startsWith('/'))))
        if (call.literal || call.unseen || adrift) merges.push({ ref: null, repo: null, dirs: context.dirs, unreadable: true, plain: false, graphql: true })
        else if (call.files.length > 0) merges.push({ ref: null, repo: null, dirs: context.dirs, unreadable: false, plain: false, graphql: true, files: call.files })
        break
      }
      const viaApi = call.kind === 'api'
      // the word that names the pull request, and the one that names the repository: as written, or, when the shell
      // decides it, every value the line gave that variable; null when the line does not say
      const said = (word, at) => {
        if (at < 0 || !dynamic[at]) return [word]
        const variable = viaApi ? null : VARIABLE.exec(words[at])
        const values = variable ? valuesOf(variable[1] ?? variable[2]) : null
        return values?.some(value => value.startsWith('-')) ? null : values
      }
      const refs = said(call.ref, call.refAt)
      const repos = said(call.repo, call.repoAt)
      for (const ref of refs ?? [call.ref]) {
        for (const repo of repos ?? [call.repo]) {
          const needsDirectory = repo === null && !/^https?:\/\//.test(ref ?? '')
          const needsBranch = !viaApi && ref === null
          merges.push({
            ref,
            repo,
            dirs: context.dirs,
            unreadable:
              refs === null ||
              repos === null ||
              dynamic[i] ||
              repointed ||
              call.composed === true ||
              call.loose === true ||
              (viaApi && !/^\d+$/.test(ref ?? '')) ||
              (needsDirectory && lostDirectory) ||
              (needsBranch && (wrapped || !context.branchKnown || context.loops + loops.length > 0)),
            plain: !viaApi && depth === 0 && i === 0 && !compound && !redirected && commands.length === 1 && !dynamic.some(Boolean),
            ...(call.composed ? { composed: true } : {}),
          })
        }
      }
      break
    }
    if (depth < 4) {
      // a script runs where its command runs: inside whatever chain led here, so the directory it inherits is not in
      // doubt; the line's variables it does not take, their one setting being the line's to count, not its own
      const within = { ...context, conditionalDir: false, conditionalVars: false, dirKnown: context.dirKnown && !line.loopMoves, loops: context.loops + loops.length, vars: {} }
      // the string a shell is handed runs where that shell runs, and behind a wrapper that is the wrapper's to know,
      // as it is for a `gh` behind one
      const handed = shellStrings(command, start)
      const behind = handed.at > start || words.slice(0, handed.at).some(word => REPOINTS.test(word))
      const there = behind ? { ...within, dirKnown: false, branchKnown: false } : within
      // a shell at the end of a pipe runs what the pipe carries: the words and the here-documents of the commands
      // that feed it are what the line shows of that (`echo '…' | bash`, `cat <<EOF | sh`)
      const piped = []
      for (let k = index; handed.reads && k > 0 && /^\|&?$/.test(commands[k].before); k--) piped.push(...commands[k - 1].words.slice(1), ...commands[k - 1].bodies)
      // a string a shell is handed that is one expansion whole (`bash -c "$CMD"`, `eval "$(…)"`) is read at the
      // variable's values where the line leaves no doubt about them, and is otherwise a command the line does not
      // show: it may be a merge
      const shown = []
      for (const script of handed.scripts) {
        const variable = VARIABLE.exec(script.trim())
        const values = variable ? valuesOf(variable[1] ?? variable[2]) : null
        if (values !== null) shown.push(...values)
        else if (HIDDEN.test(script)) merges.push({ ref: null, repo: null, dirs: context.dirs, unreadable: true, plain: false, hidden: true })
        else shown.push(script)
      }
      for (const script of scripts) for (const merge of mergesIn(script, within, depth + 1)) merges.push({ ...merge, plain: false })
      for (const script of [...shown, ...piped]) for (const merge of mergesIn(script, there, depth + 1)) merges.push({ ...merge, plain: false })
    }
    learn(context, command)
    move(context, command, start)
  }
  return merges
}

const named = merge => (merge.hidden ? 'a command a shell is handed that the line does not show' : merge.graphql ? 'a GraphQL mutation' : merge.composed ? 'a PUT to an endpoint the line does not spell out' : merge.ref === null ? "the current branch's pull request" : `pull request ${merge.ref}`)

/** The gate's answer for a command line: `{ decision: 'ask' | 'allow', reason }`, or null for no answer.
 *  `lookup(merge)` returns `{ repo: 'owner/name', base, number }` for the pull request a merge names, or null when it
 *  cannot be found; `read(file, merge)` returns the text of a file a GraphQL request takes its body from, or null
 *  when it cannot be opened; `here` is this repository as `owner/name` (lower case), or null when it is unknown —
 *  then every pull request is held as this repository's, and none is allowed. */
export function decide(text, { lookup, read, here }) {
  let allowed = null
  for (const merge of mergesIn(text)) {
    if (merge.files !== undefined) {
      const bodies = merge.files.map(file => read(file, merge))
      if (bodies.some(body => body === null)) return { decision: 'ask', reason: `Merge gate: this GraphQL request takes its body from a file the gate cannot open (${merge.files.join(', ')}).` }
      if (!bodies.some(body => GRAPHQL_MERGE.test(body))) continue
    }
    if (merge.hidden) return { decision: 'ask', reason: 'Merge gate: a shell is handed a command the line does not show; it may merge a pull request.' }
    if (merge.unreadable || merge.files !== undefined) return { decision: 'ask', reason: `Merge gate: this command merges a pull request the gate cannot read from its text (${named(merge)}).` }
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

/** A lookup that answers within the time the hook has. Claude Code drops the answer of a hook that runs past its
 *  timeout and lets the command go, so the lookups of one command line share `budget` milliseconds: each pull
 *  request is looked up once, `find(merge, left)` is given what is left, and once it is spent a pull request gets no
 *  answer at all — which the gate takes as one it could not look up, and asks. */
export function withinBudget(find, budget, now = Date.now) {
  const until = now() + budget
  const found = new Map()
  return merge => {
    const key = JSON.stringify([merge.ref, merge.repo, merge.dirs])
    if (!found.has(key)) {
      const left = until - now()
      found.set(key, left < 1000 ? null : find(merge, left))
    }
    return found.get(key)
  }
}

/** The time all lookups of one command line may take together: under the hook's own timeout (`.claude/settings.json`) */
const BUDGET = 20_000

function run(file, args, cwd, timeout = 15_000) {
  return execFileSync(file, args, { cwd, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'] })
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const input = JSON.parse(readFileSync(0, 'utf8'))
  const text = input.tool_name === 'Bash' && typeof input.tool_input?.command === 'string' ? input.tool_input.command : ''
  const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd()
  /** The directory a merge runs in: the command's own, then each literal `cd` before it */
  const directoryOf = merge => merge.dirs.reduce((dir, to) => resolve(dir, to === '~' ? homedir() : to.startsWith('~/') ? join(homedir(), to.slice(2)) : to), cwd)
  let here = null
  try {
    here = repositoryOf(run('git', ['-C', dirname(fileURLToPath(import.meta.url)), 'remote', 'get-url', 'origin']))
  } catch {}
  const lookup = withinBudget((merge, left) => {
    try {
      const args = ['pr', 'view', ...(merge.ref === null ? [] : [merge.ref]), '--json', 'baseRefName,number,url', ...(merge.repo === null ? [] : ['--repo', merge.repo])]
      const found = JSON.parse(run('gh', args, directoryOf(merge), Math.min(15_000, left)))
      const repo = repositoryOf(found.url)
      return repo === null ? null : { repo, base: found.baseRefName, number: found.number }
    } catch {
      return null
    }
  }, BUDGET)
  const read = (file, merge) => {
    try {
      return readFileSync(resolve(directoryOf(merge), file), 'utf8')
    } catch {
      return null
    }
  }
  let answer = null
  try {
    answer = decide(text, { lookup, read, here })
  } catch (error) {
    if (/\bgh\b/.test(text) && /merge/i.test(text)) answer = { decision: 'ask', reason: `Merge gate: this command could not be read (${error instanceof Error ? error.message : error}).` }
  }
  if (answer !== null) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: answer.decision, permissionDecisionReason: answer.reason } }))
  }
}
