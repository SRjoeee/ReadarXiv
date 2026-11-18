// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Ctx, GATES } from '../../lab/release-check/gates.mjs'

// The rules every workflow of this repository obeys (lab/release-check/CI.md, "Security"), read from the files themselves, so that a
// workflow added later is held to them without a line here. The repository is public: anyone can open a pull request, and a pull
// request's run takes its workflow files from the pull request itself. So the rules are about what a run can reach, not only about
// which workflow is meant to run: no job runs on a runner of the maintainer's (a fork's pull request could name its labels in a
// workflow of its own), no event an outsider can cause runs in the repository's own context, a secret reaches a step only through
// that step's environment, every action is GitHub's own and pinned by its commit, every token reads and nothing more unless the
// list below says why, and no checkout keeps a credential. Each rule is a reader of one file that names what breaks it; each is
// shown to refuse what it is for (the controls). And the hosted jobs run the release check's fast tier as gates.mjs states it,
// gate by gate. tests/scripts/rules-workflows.test.ts holds what is particular to the rules gate's three workflows and to the
// fixtures' token in ci.yml; `actionlint` checks the syntax where it is installed.

const ROOT = resolve(__dirname, '../..')
const DIR = join(ROOT, '.github/workflows')
const NAMES = readdirSync(DIR).filter(n => /\.ya?ml$/.test(n)).sort()
const text = (name: string) => readFileSync(join(DIR, name), 'utf8')
/** a workflow's lines that are not comments: what GitHub reads */
const codeOf = (yml: string) => yml.split('\n').filter(l => !/^\s*#/.test(l)).join('\n')
/** the events of a workflow's `on:` block */
const eventsOf = (yml: string) => [...(/^on:\n((?: {2}.*\n| *\n| *#.*\n)+)/m.exec(yml)?.[1] ?? '').matchAll(/^ {2}([a-z_]+):/gm)].map(m => m[1]!)
/** a workflow's jobs by name, each with its text (the comments before the next job's name stay with the one above it) */
const jobsOf = (yml: string) => new Map(yml.slice(yml.indexOf('\njobs:\n') + 7).split(/\n(?= {2}[a-z][a-z-]*:\n)/).flatMap(part => { const name = /^ {2}([a-z][a-z-]*):/m.exec(part)?.[1]; return name ? [[name, part] as [string, string]] : [] }))
/** a job's steps, each its text after its `- ` to the next step's, comments left out */
const stepsOf = (job: string) => codeOf(job.slice(job.indexOf('\n    steps:\n'))).split(/\n {6}- /).slice(1)
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** a step that runs exactly `command`, as its one line */
const runs = (step: string, command: string) => new RegExp(`(^|\\n)\\s*run: ${escaped(command)}$`, 'm').test(step)
/** the bodies of a workflow's `run:` steps */
function runBodies(yml: string): string[] {
  const lines = yml.split('\n'), out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(- )?run:\s*(.*)$/.exec(lines[i]!)
    if (!m) continue
    const indent = m[1]!.length + (m[2] ? 2 : 0)
    if (m[3] && !/^[|>][-+]?$/.test(m[3])) { out.push(m[3]); continue }
    const body: string[] = []
    for (i++; i < lines.length && (lines[i]!.trim() === '' || lines[i]!.length - lines[i]!.trimStart().length > indent); i++) body.push(lines[i]!)
    i--
    out.push(body.join('\n'))
  }
  return out
}

/** the events a run may come from: a push and a dispatch are the repository's writers' own; a pull request's run, a fork's
 *  included, has no secret and a token that reads; a schedule runs the default branch's file. Every other event either runs the
 *  base's workflow in its own context for a change an outsider made (pull_request_target, workflow_run of a pull request's run),
 *  or can be caused by anyone with an account (issue_comment, issues, discussion, a review, a fork, a star) */
const EVENTS = ['push', 'pull_request', 'workflow_dispatch', 'schedule']
/** every write a token holds, where and why: the rules gate's comment on its own pull request, and the rollback's cancel of the
 *  publishes not finished (rules-point.yml, the one job that holds it, with no secret) */
const WRITES: Record<string, string[]> = {
  'rules-gate.yml': ['workflow: pull-requests'],
  'rules-point.yml': ['cancel-publishes: actions'],
}

/** the rules, each a reader of one workflow's text that returns what breaks it (nothing, where the file obeys it) */
const RULES: Record<string, (yml: string, name: string) => string[]> = {
  // (a self-hosted runner registered here takes a job from any workflow that names its labels, a fork's pull request's own workflow
  // file included, and only a person's approval of each outside run would stand between it and the runner's machine: CI.md,
  // "Security". The lab's tiers run on that machine by hand, never from here)
  'hosted runners': yml => {
    const labels = [...codeOf(yml).matchAll(/^\s+runs-on:\s*(.+?)\s*$/gm)].map(m => m[1]!)
    return [...(labels.length ? [] : ['no runs-on']), ...labels.filter(l => !/^(ubuntu|windows|macos)-(latest|\d+(\.\d+)?)$/.test(l)).map(l => `runs-on: ${l}`), ...(/self-hosted/.test(codeOf(yml)) ? ['self-hosted named'] : [])]
  },
  events: yml => {
    const events = eventsOf(yml)
    return [
      ...(/^on:\n/m.test(yml) && events.length ? [] : ['no `on:` block of events']),
      ...events.filter(e => !EVENTS.includes(e)).map(e => `event ${e}`),
      // (and no line names one an outsider can cause, in a comment or not: the rules-gate's own test refuses the name too)
      ...[...yml.matchAll(/pull_request_target|workflow_run|issue_comment|workflow_call/g)].map(m => `names ${m[0]}`),
    ]
  },
  secrets: yml => {
    const code = codeOf(yml)
    return [
      ...code.split('\n').filter(l => l.includes('secrets.') && !/^ {10}[A-Z][A-Z0-9_]*: \$\{\{ secrets\.[A-Z][A-Z0-9_]* \}\}$/.test(l)).map(l => `secret outside a step's environment: ${l.trim()}`),
      ...runBodies(code).filter(b => /\$\{\{/.test(b)).map(b => `an expression in a script: ${b.trim().slice(0, 80)}`),
      ...(/secrets: inherit|toJSON\(secrets\)/.test(code) ? ['secrets passed on whole'] : []),
      // (no workflow's or job's environment names a secret: a step's alone)
      ...[...code.matchAll(/^(?:env:\n((?: {2}\S.*\n)+)| {4}env:\n((?: {6}\S.*\n)+))/gm)].filter(m => /secrets\./.test(m[1] ?? m[2] ?? '')).map(() => "a secret in a workflow's or a job's environment"),
    ]
  },
  actions: yml => [...codeOf(yml).matchAll(/uses:\s*(.*)$/gm)].map(m => m[1]!.trim()).filter(use => !/^actions\/[a-z-]+(\/[a-z-]+)?@[0-9a-f]{40} # v\d+\.\d+\.\d+$/.test(use)).map(use => `uses: ${use}`),
  // pnpm by corepack, at the version package.json names, not by a third party's action
  pnpm: yml => (/\bpnpm /.test(yml) && !yml.includes('run: corepack enable') ? ['pnpm without corepack'] : []),
  permissions: (yml, name) => {
    const code = codeOf(yml)
    const writes = [
      ...[...(/^permissions:\n((?: {2}.*\n)+)/m.exec(code)?.[1] ?? '').matchAll(/^ {2}([a-z-]+): write$/gm)].map(m => `workflow: ${m[1]}`),
      ...[...jobsOf(code)].flatMap(([job, body]) => [...(/\n {4}permissions:\n((?: {6}.*\n)+)/.exec(body)?.[1] ?? '').matchAll(/^ {6}([a-z-]+): write$/gm)].map(m => `${job}: ${m[1]}`)),
    ]
    return [
      ...(/^permissions:\n {2}contents: read\n/m.test(code) ? [] : ["the workflow's permissions do not begin with contents: read"]),
      ...(/write-all|read-all/.test(code) ? ['a blanket permission'] : []),
      ...writes.filter(w => !(WRITES[name] ?? []).includes(w)).map(w => `a write not listed: ${w}`),
    ]
  },
  checkout: yml => {
    const code = codeOf(yml)
    return [
      ...code.split(/\n(?= {6}- )/).filter(s => /uses: actions\/checkout@/.test(s) && !/\n {8}with:\n(?: {10}.*\n)*? {10}persist-credentials: false\b/.test(`${s}\n`)).map(() => 'a checkout that keeps its credential'),
      ...(/git push|persist-credentials: true|git config [^\n]*credential/.test(code) ? ['a push or a kept credential'] : []),
    ]
  },
  // (the full and release tiers read the lab's data on the maintainer's machine)
  tiers: yml => (/--tier[ =](full|release)|AXT_LAB_DATA|AXT_TODAY/.test(codeOf(yml)) ? ['a lab tier run here'] : []),
}

describe('every workflow', () => {
  it('is read here, the four there are among them (a workflow added later is read without a line here)', () => {
    expect(NAMES).toEqual(expect.arrayContaining(['ci.yml', 'rules-gate.yml', 'rules-point.yml', 'rules-publish.yml']))
  })

  it('obeys every rule', () => {
    const broken = NAMES.flatMap(name => Object.entries(RULES).flatMap(([rule, read]) => read(text(name), name).map(v => `${name}: ${rule}: ${v}`)))
    expect(broken).toEqual([])
  })

  it('uses one commit of each action in every workflow', () => {
    const commits = new Map<string, Set<string>>()
    for (const name of NAMES) for (const m of codeOf(text(name)).matchAll(/uses:\s*(\S+)@([0-9a-f]{40})/g)) commits.set(m[1]!, (commits.get(m[1]!) ?? new Set()).add(m[2]!))
    expect(commits.size).toBeGreaterThan(0)
    for (const [action, at] of commits) expect([...at], action).toHaveLength(1)
  })

  // the controls: each rule, given ci.yml with the one thing it is for, says so
  const ci = text('ci.yml')
  const broken = (rule: string, yml: string) => RULES[rule]!(yml, 'ci.yml')
  /** a GitHub Actions expression (a plain string with one in it is a lint warning) */
  const EXPR = (inner: string) => `\${{ ${inner} }}`
  const once = (yml: string, from: string | RegExp, to: string) => {
    const out = yml.replace(from, to)
    expect(out, String(from)).not.toBe(yml)
    return out
  }
  it.each([
    ['hosted runners', 'a job on a runner of the maintainer\'s', () => once(ci, 'runs-on: ubuntu-24.04', 'runs-on: [self-hosted, macOS, ARM64, lab-data]')],
    ['events', 'pull_request_target', () => once(ci, '\n  pull_request:\n', '\n  pull_request:\n  pull_request_target:\n')],
    ['events', 'a comment on an issue', () => once(ci, '\n  pull_request:\n', '\n  pull_request:\n  issue_comment:\n    types: [created]\n')],
    ['secrets', "a secret in a job's environment", () => once(ci, '    timeout-minutes: 30\n', `    timeout-minutes: 30\n    env:\n      TOKEN: ${EXPR('secrets.ANY')}\n`)],
    ['secrets', 'a secret in a script', () => once(ci, 'run: pnpm e2e:small-caps', `run: echo "${EXPR('secrets.ANY')}"`)],
    ['secrets', 'an expression in a script', () => once(ci, 'run: pnpm e2e:small-caps', `run: echo "${EXPR('github.event.pull_request.title')}"`)],
    ['actions', "a third party's action", () => once(ci, 'run: corepack enable', 'uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4.3.0')],
    ['actions', 'an action by its tag', () => once(ci, /uses: actions\/checkout@[0-9a-f]{40} # v4\.4\.0/, 'uses: actions/checkout@v4')],
    ['permissions', 'a write at the top', () => once(ci, 'permissions:\n  contents: read\n', 'permissions:\n  contents: write\n')],
    ['permissions', "a job's write not listed", () => once(ci, '    timeout-minutes: 45\n', '    timeout-minutes: 45\n    permissions:\n      pull-requests: write\n')],
    ['checkout', 'a checkout that keeps its credential', () => once(ci, /( {6}- uses: actions\/checkout@[0-9a-f]{40} # v[\d.]+\n {8}with:\n) {10}persist-credentials: false\n/, '$1          fetch-depth: 1\n')],
    ['tiers', 'the full tier', () => once(ci, 'run: pnpm e2e:small-caps', 'run: pnpm release-check --tier full')],
  ])('the rule on %s refuses %s', (rule, _what, mutate) => {
    expect(broken(rule, ci)).toEqual([])
    expect(broken(rule, mutate()).length).toBeGreaterThan(0)
  })
})

describe('the fast tier on GitHub\'s runners (ci.yml)', () => {
  const ci = text('ci.yml')
  const jobs = jobsOf(codeOf(ci))
  const ctx: Ctx = { root: ROOT, labData: null, refactor: '/lab', work: '/work', online: false, minFree: 12 }
  /** a fast gate's command as gates.mjs runs it, its own words */
  const commandOf = (id: string) => GATES.find(g => g.id === id)!.steps!(ctx).map(s => s.cmd.join(' '))

  it('runs on every pull request and every push to main and rebuild/v2, a pull request\'s older run stopped by its newer push', () => {
    expect(eventsOf(ci)).toEqual(['push', 'pull_request'])
    expect(ci).toMatch(/^ {2}push:\n {4}branches: \[main, rebuild\/v2\]\n {2}pull_request:\n/m)
    // (a pull request's runs share one group, a newer push cancelling the run in progress; every other run is a group of its own,
    // which nothing cancels: a pending run of a shared group is replaced by the next one queued)
    expect(ci).toMatch(/\nconcurrency:\n {2}group: \$\{\{ github\.event_name == 'pull_request' && format\('ci-pr-\{0\}', github\.event\.pull_request\.number\) \|\| format\('ci-run-\{0\}', github\.run_id\) \}\}\n {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}\n/)
  })

  it('has the three jobs, and the two browser jobs hold no secret, variable, token, environment, cache or permission of their own', () => {
    expect([...jobs.keys()]).toEqual(['check', 'reader', 'extension'])
    for (const job of ['reader', 'extension']) {
      const body = jobs.get(job)!
      expect(body, job).not.toMatch(/secrets\.|vars\.|github\.token|GH_TOKEN|READARXIV_|CF_ACCOUNT|environment:|actions\/cache|permissions:|services:|container:/)
      expect(body, job).toMatch(/\n {4}runs-on: ubuntu-24\.04\n {4}timeout-minutes: \d+\n/)
      // Playwright's browsers at the lockfile's version, installed after the dependencies and before any check
      const steps = stepsOf(body)
      const install = steps.findIndex(s => /run: pnpm exec playwright install --with-deps chromium/.test(s))
      expect(install, job).toBeGreaterThan(steps.findIndex(s => runs(s, 'pnpm install --frozen-lockfile')))
    }
  })

  it('runs each gate of the fast tier with the command gates.mjs gives it: the browser gates as steps named by their ids, the e2e scripts on a build', () => {
    const fast = GATES.filter(g => g.tier === 'fast' && !g.private)
    const ran: string[] = []
    for (const g of fast.filter(g => g.stage === 'reader')) {
      const commands = commandOf(g.id)
      expect(commands, g.id).toHaveLength(1)
      const holder = ['reader', 'extension'].find(job => stepsOf(jobs.get(job)!).some(s => s.startsWith(`name: ${g.id}\n`)))
      expect(holder, g.id).toBeDefined()
      const steps = stepsOf(jobs.get(holder!)!)
      const step = steps.find(s => s.startsWith(`name: ${g.id}\n`))!
      expect(runs(step, commands[0]!), `${g.id}: ${step}`).toBe(true)
      // an e2e script that loads the extension runs on this job's own build, never on none
      if ((g.after ?? []).includes('build')) {
        expect(holder, g.id).toBe('extension')
        const build = steps.findIndex(s => s.startsWith('id: build\n') && runs(s, 'pnpm build'))
        expect(build, g.id).toBeGreaterThanOrEqual(0)
        expect(build, g.id).toBeLessThan(steps.indexOf(step))
        expect(step, g.id).toContain("steps.build.outcome == 'success'")
      }
      ran.push(g.id)
    }
    // the unit gates in `check`: the type check, the lint, the build and the tests (the contract tests are among pnpm test's
    // files, tests/contract), and the census of this tree alone
    const check = stepsOf(jobs.get('check')!)
    for (const id of ['typecheck', 'lint', 'build', 'test']) {
      expect(check.some(s => runs(s, commandOf(id)[0]!)), id).toBe(true)
      ran.push(id)
    }
    expect(commandOf('contract')[0]).toContain('tests/contract')
    ran.push('contract')
    expect(commandOf('census')[0]).toMatch(/^node lab\/release-check\/census\.mjs /)
    expect(check.some(s => s.startsWith('name: census\n') && runs(s, 'node lab/release-check/census.mjs --no-today')), 'census').toBe(true)
    ran.push('census')
    expect(ran.sort()).toEqual(fast.map(g => g.id).sort())
  })
})
