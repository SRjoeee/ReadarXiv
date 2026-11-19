// The rules every workflow of this repository obeys (lab/release-check/CI.md, "Security"), each a reader of one workflow's text that
// names what breaks it; tests/scripts/ci-workflows.test.ts holds every file of .github/workflows to them, and their controls are
// tests/scripts/workflow-controls.ts. No YAML parser: the files are held to the one plain form they are written in, and each reader
// FAILS CLOSED on form. A spelling of YAML or of an expression it does not read (a quoted key, a flow mapping, a key at another
// indentation, a scalar in another style, an anchor, an alias, a tag, an escape, the bracket form or another case of a context) is
// itself a violation, never a pass, so that no valid spelling a reader skips can carry what its rule refuses.

const indentOf = (l: string) => l.length - l.trimStart().length
/**
 * A workflow's lines but its YAML comments: what GitHub reads (a comment after a value stays: `uses:`'s version). A line led by
 * `#` is a YAML comment only outside a scalar's text: below a key or a sequence's entry with a value on its line (a block scalar's
 * `|` or `>`, or a plain or quoted scalar going on), every line deeper than that key is the value's own, whatever it begins with.
 * In a script it is a shell comment, which GitHub reads for its expressions before the shell reads it; in an environment's value,
 * an action's input or an `if:`, it is text GitHub reads all the same. Such a line is kept, and every reader below reads it
 */
export function codeOf(yml: string): string {
  const out: string[] = []
  /** the column of the key whose value's text the lines deeper than it are, or -1 outside any */
  let owner = -1
  for (const l of yml.split('\n')) {
    if (owner >= 0 && (l.trim() === '' || indentOf(l) > owner)) {
      out.push(l)
      continue
    }
    owner = -1
    if (/^\s*#/.test(l)) continue
    out.push(l)
    // (a key or an entry with a value on its line, the value no comment: the lines deeper than its key are that value's)
    const m = /^(\s*)(- )?(?:([^\s#'"][^:]*?|"[^"]*"|'[^']*'):(?=\s|$))?\s*(.*)$/.exec(l)
    if (m && m[4] !== '' && !m[4]!.startsWith('#') && (m[3] !== undefined || m[2])) owner = m[1]!.length + (m[2] && m[3] !== undefined ? 2 : 0)
  }
  return out.join('\n')
}
/** an expression's and a quoted scalar's text taken out of a line (each quoted scalar left as '' so that the line keeps its shape) */
const bare = (l: string) => l.replace(/\$\{\{.*?\}\}/g, '').replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, "''")

/** a workflow's `run:` keys: the line each stands on, its value on that line, and its body, that value and every line after it
 *  deeper than the key, whatever the scalar's style (plain, quoted, literal, folded, with an indentation or a chomping indicator) */
export function runsOf(code: string): { at: number; end: number; value: string; body: string }[] {
  const lines = code.split('\n'), out: { at: number; end: number; value: string; body: string }[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(- )?run:(.*)$/.exec(lines[i]!)
    if (!m) continue
    const key = m[1]!.length + (m[2] ? 2 : 0)
    let j = i + 1
    while (j < lines.length && (lines[j]!.trim() === '' || indentOf(lines[j]!) > key)) j++
    out.push({ at: i, end: j, value: m[3]!.trim(), body: [m[3]!, ...lines.slice(i + 1, j)].join('\n') })
    i = j - 1
  }
  return out
}
/** the code the structure readers read: every `run:` key kept bare, its value and its body's lines taken out */
export function skeletonOf(code: string): string[] {
  const lines = code.split('\n'), runs = runsOf(code)
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const run = runs.find(r => r.at === i)
    if (!run) { out.push(lines[i]!); continue }
    out.push(lines[i]!.slice(0, lines[i]!.indexOf('run:') + 4))
    i = run.end - 1
  }
  return out
}
/** the job keys under `jobs:` (each at two spaces), by their line in the skeleton */
const jobKeysOf = (sk: string[]) => {
  const at = sk.indexOf('jobs:')
  return at < 0 ? [] : sk.map((l, i) => ({ l, i })).filter(({ l, i }) => i > at && indentOf(l) === 2 && l.trim() !== '')
}
/** the job a skeleton line belongs to: the nearest job key above it */
const jobOf = (sk: string[], i: number) => {
  for (let j = i; j >= 0; j--) if (indentOf(sk[j]!) === 2 && /^ {2}[a-z][\w-]*:$/.test(sk[j]!)) return sk[j]!.trim().slice(0, -1)
  return null
}
/** a step's lines: from its `      - ` line to the next line at six spaces or less */
function stepAround(lines: string[], i: number): { from: number; to: number } | null {
  let from = i
  while (from >= 0 && !/^ {6}- /.test(lines[from]!)) {
    if (lines[from]!.trim() !== '' && indentOf(lines[from]!) < 6) return null
    from--
  }
  if (from < 0) return null
  let to = from + 1
  while (to < lines.length && (lines[to]!.trim() === '' || indentOf(lines[to]!) > 6)) to++
  return { from, to }
}

/** the events a run may come from: a push and a dispatch are the repository's writers' own; a pull request's run, a fork's
 *  included, has no secret and a token that reads; a schedule runs the default branch's file. Every other event either runs the
 *  base's workflow in its own context for a change an outsider made (pull_request_target, workflow_run of a pull request's run),
 *  or can be caused by anyone with an account (issue_comment, issues, discussion, a review, a fork, a star) */
export const EVENTS = ['push', 'pull_request', 'workflow_dispatch', 'schedule']
/** GitHub's own actions this repository runs, each read for what it does with its inputs (no action that runs an input as a
 *  script); another is added here with its reason */
export const ACTIONS = ['actions/checkout', 'actions/setup-node', 'actions/cache/restore', 'actions/cache/save', 'actions/upload-artifact']
/** the scopes a token's permissions name */
const SCOPES = ['actions', 'attestations', 'checks', 'contents', 'deployments', 'discussions', 'id-token', 'issues', 'models', 'packages', 'pages', 'pull-requests', 'repository-projects', 'security-events', 'statuses']
/** the one form a secret takes: a step's environment's entry, the context by its dot */
const SECRET_ENTRY = /^ {10}[A-Z][A-Z0-9_]*: \$\{\{ secrets\.[A-Z][A-Z0-9_]* \}\}$/
const HOSTED = /^ {4}runs-on: (ubuntu|windows|macos)-(latest|\d+(\.\d+)?)$/
const USES = new RegExp(`^(?: {6}- | {8})uses: (?:${ACTIONS.map(a => a.replace('/', '\\/')).join('|')})@[0-9a-f]{40} # v\\d+\\.\\d+\\.\\d+$`)

export type Rule = (yml: string, file: string) => string[]

/** the rules, each a reader of one workflow's text that returns what breaks it (nothing, where the file obeys it); `writes`: each
 *  file's token writes allowed, `<job or workflow>: <scope>` */
export function rulesFor(writes: Record<string, string[]>): Record<string, Rule> {
  return {
    // (the forms the readers below do not read are refused here, whatever they hold)
    forms: yml => {
      const code = codeOf(yml), out: string[] = []
      for (const l of skeletonOf(code)) {
        const b = bare(l)
        if (/^\s*(?:- )?(?:"[^"]*"|'[^']*')\s*:/.test(l)) out.push(`a quoted key: ${l.trim()}`)
        if (/[{}]/.test(b)) out.push(`a flow mapping: ${l.trim()}`)
        if (/(^|[\s[,])[&*][\w-]/.test(b) || /<<\s*:/.test(b)) out.push(`an anchor, an alias or a merge: ${l.trim()}`)
        if (/^\s*(?:- )?(?:[\w-]+\s*:\s+)?!/.test(b)) out.push(`a tag: ${l.trim()}`)
        if (l.includes('\\')) out.push(`an escape: ${l.trim()}`)
      }
      // (a script in double quotes: YAML reads its escapes before GitHub reads its expressions)
      for (const r of runsOf(code)) if (r.value.startsWith('"')) out.push(`a script in double quotes: ${r.value.slice(0, 60)}`)
      // the steps: a block under `    steps:`, each step at six spaces
      const sk = skeletonOf(code)
      sk.forEach((l, i) => {
        if (!/\bsteps\s*:/i.test(l)) return
        if (l !== '    steps:') { out.push(`steps in another form: ${l.trim()}`); return }
        for (let j = i + 1; j < sk.length && (sk[j]!.trim() === '' || indentOf(sk[j]!) > 4); j++) if (/^\s*-(\s|$)/.test(sk[j]!) && !/^ {6}- /.test(sk[j]!)) out.push(`a step at another indentation: ${sk[j]!.trim()}`)
      })
      return out
    },
    // (a self-hosted runner registered here takes a job from any workflow that names its labels, a fork's pull request's own
    // workflow file included, and only a person's approval of each outside run would stand between it and the runner's machine:
    // CI.md, "Security". The lab's tiers run on that machine by hand, never from here)
    'hosted runners': yml => {
      const code = codeOf(yml), sk = skeletonOf(code)
      const lines = sk.filter(l => /runs-on/i.test(l))
      const jobs = jobKeysOf(sk)
      return [
        ...lines.filter(l => !HOSTED.test(l)).map(l => `runs-on in another form or on another runner: ${l.trim()}`),
        ...(lines.filter(l => HOSTED.test(l)).length === jobs.length && jobs.length > 0 ? [] : [`${jobs.length} jobs, ${lines.filter(l => HOSTED.test(l)).length} hosted runs-on`]),
        ...jobs.filter(({ l }) => !/^ {2}[a-z][\w-]*:$/.test(l)).map(({ l }) => `a job key in another form: ${l.trim()}`),
        ...(/self-hosted/i.test(code) ? ['self-hosted named'] : []),
      ]
    },
    events: yml => {
      const sk = skeletonOf(codeOf(yml)), out: string[] = []
      const keys = sk.filter(l => /^\W*on\W*:/i.test(l) && indentOf(l) === 0)
      if (keys.length !== 1 || keys[0] !== 'on:') out.push(`the events not one block under \`on:\`: ${keys.join(' | ') || 'none'}`)
      const at = sk.indexOf('on:')
      const events: string[] = []
      for (let j = at + 1; at >= 0 && j < sk.length && (sk[j]!.trim() === '' || indentOf(sk[j]!) > 0); j++) {
        if (indentOf(sk[j]!) !== 2) continue
        const m = /^ {2}([a-z_]+):(\s|$)/.exec(sk[j]!)
        if (!m) out.push(`an event in another form: ${sk[j]!.trim()}`)
        else events.push(m[1]!)
      }
      if (at >= 0 && !events.length) out.push('no event')
      return [
        ...out,
        ...events.filter(e => !EVENTS.includes(e)).map(e => `event ${e}`),
        // (and no line names one an outsider can cause, in a comment or not: the rules-gate's own test refuses the name too)
        ...[...yml.matchAll(/pull_request_target|workflow_run|issue_comment|workflow_call/gi)].map(m => `names ${m[0]}`),
      ]
    },
    secrets: yml => {
      const code = codeOf(yml), lines = code.split('\n'), out: string[] = []
      // the secrets context in any spelling (its dot or its brackets, any case: expressions are case-insensitive) is a step's
      // environment's entry of the one form, its step handing it to no step after it, or it is refused
      lines.forEach((l, i) => {
        if (!/secrets/i.test(l)) return
        if (!SECRET_ENTRY.test(l)) { out.push(`the secrets context outside a step's environment's entry: ${l.trim()}`); return }
        let p = i - 1
        while (p >= 0 && (lines[p]!.trim() === '' || indentOf(lines[p]!) >= 10)) p--
        if (lines[p] !== '        env:') { out.push(`a secret under another key than a step's env: ${l.trim()}`); return }
        const step = stepAround(lines, p)
        if (!step) { out.push(`a secret in no step: ${l.trim()}`); return }
        if (/GITHUB_(ENV|OUTPUT|PATH|STATE)\b/.test(lines.slice(step.from, step.to).join('\n'))) out.push(`a step that holds a secret writes the job's files: ${l.trim()}`)
      })
      // no expression spliced into a script: its value goes through the environment
      for (const r of runsOf(code)) if (/\$\{\{/.test(r.body)) out.push(`an expression in a script: ${r.body.trim().slice(0, 80)}`)
      return out
    },
    actions: yml => skeletonOf(codeOf(yml)).filter(l => /\buses\b/i.test(l) && !USES.test(l)).map(l => `uses in another form, or an action not listed: ${l.trim()}`),
    // pnpm by corepack, at the version package.json names, not by a third party's action
    pnpm: yml => (/\bpnpm /.test(yml) && !yml.includes('run: corepack enable') ? ['pnpm without corepack'] : []),
    permissions: (yml, file) => {
      const code = codeOf(yml), sk = skeletonOf(code), out: string[] = [], held: string[] = []
      const jobsAt = sk.indexOf('jobs:')
      sk.forEach((l, i) => {
        if (!/permissions/i.test(l)) return
        const top = l === 'permissions:' && (jobsAt < 0 || i < jobsAt)
        const job = l === '    permissions:' && jobsAt >= 0 && i > jobsAt
        if (!top && !job) { out.push(`permissions in another form or place: ${l.trim()}`); return }
        const child = top ? 2 : 6
        let n = 0
        for (let j = i + 1; j < sk.length && (sk[j]!.trim() === '' || indentOf(sk[j]!) > indentOf(l)); j++) {
          if (sk[j]!.trim() === '') continue
          const m = new RegExp(`^ {${child}}([a-z-]+): (read|write|none)$`).exec(sk[j]!)
          if (!m || !SCOPES.includes(m[1]!)) { out.push(`a permission in another form: ${sk[j]!.trim()}`); continue }
          n++
          if (m[2] === 'write') held.push(`${top ? 'workflow' : jobOf(sk, i)}: ${m[1]}`)
        }
        if (!n) out.push(`permissions with no scope under them: ${l.trim()}`)
      })
      // the workflow's own, first of all: the repository's contents, read
      if (!/^permissions:\n {2}contents: read\n/m.test(code)) out.push("the workflow's permissions do not begin with contents: read")
      if (/write-all|read-all/i.test(code)) out.push('a blanket permission')
      const allowed = writes[file] ?? []
      out.push(...held.filter(w => !allowed.includes(w)).map(w => `a write not listed: ${w}`))
      // and, whatever the reading above saw: every write anywhere, in any spelling, is a scope this file may write
      const scopes = allowed.map(w => w.split(': ')[1])
      const anywhere = [...sk.join('\n').matchAll(/([\w-]+)["']?\s*:\s*["']?write\b/gi)].map(m => m[1]!)
      out.push(...anywhere.filter(s => !scopes.includes(s)).map(s => `a write of ${s} anywhere`))
      if (anywhere.length !== held.length) out.push(`${anywhere.length} writes written, ${held.length} read as permissions`)
      return out
    },
    checkout: yml => {
      const code = codeOf(yml), sk = skeletonOf(code), out: string[] = []
      sk.forEach((l, i) => {
        if (!/actions\/checkout@/.test(l)) return
        if (!/^(?: {6}- | {8})uses: /.test(l)) { out.push(`a checkout in another form: ${l.trim()}`); return }
        const step = stepAround(sk, i)
        const lines = step ? sk.slice(step.from, step.to) : []
        const w = lines.indexOf('        with:')
        const block: string[] = []
        for (let j = w + 1; w >= 0 && j < lines.length && (lines[j]!.trim() === '' || indentOf(lines[j]!) > 8); j++) block.push(lines[j]!)
        if (!block.includes('          persist-credentials: false')) out.push(`a checkout that keeps its credential: ${l.trim()}`)
      })
      for (const l of sk) if (/persist-credentials/i.test(l) && l !== '          persist-credentials: false') out.push(`persist-credentials in another form: ${l.trim()}`)
      if (/git push|git config [^\n]*credential/i.test(code)) out.push('a push or a kept credential')
      return out
    },
    // (the full and release tiers read the lab's data on the maintainer's machine: no tier, nor the release check itself, is run
    // here, in any spelling of its flag)
    tiers: yml => (/--tier\b|release-check\/run\.mjs|release-check(?![/\w-])|AXT_LAB|AXT_TODAY/i.test(codeOf(yml)) ? ['a lab tier run here'] : []),
  }
}

/** rule 7 over ci.yml's two browser jobs: they name no secret, variable or token, in any spelling, and hold no environment, cache,
 *  permission, service or container of their own */
export const browserJobs: Rule = yml => {
  const code = codeOf(yml), sk = skeletonOf(code), lines = code.split('\n')
  const jobs = jobKeysOf(sk).map(({ l }) => l.trim().slice(0, -1))
  return ['reader', 'extension'].flatMap(job => {
    if (!jobs.includes(job)) return []
    const from = lines.indexOf(`  ${job}:`)
    let to = from + 1
    while (to < lines.length && (lines[to]!.trim() === '' || indentOf(lines[to]!) > 2)) to++
    return [...lines.slice(from, to).join('\n').matchAll(/secrets|\bvars\b|token|environment|permissions|actions\/cache|services|container/gi)].map(m => `${job}: ${m[0]}`)
  })
}
