// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Ctx, GATES } from '../../lab/release-check/gates.mjs'
import { controlsOf } from './workflow-controls'
import { browserJobs, codeOf, rulesFor } from './workflow-rules'

// Every workflow of this repository held to the rules of tests/scripts/workflow-rules.ts (lab/release-check/CI.md, "Security"),
// read from the files themselves, so that a workflow added later is held to them without a line here. The repository is public:
// anyone can open a pull request, and a pull request's run takes its workflow files from the pull request itself. So the rules are
// about what a run can reach, not only about which workflow is meant to run: no job runs on a runner of the maintainer's, no event an
// outsider can cause runs in the repository's own context, a secret reaches one step through that step's environment, every action
// is one of GitHub's own the list names, pinned by its commit, every token reads and nothing more unless the list below says why, no
// checkout keeps a credential, no lab tier runs here. Each reader fails closed on form (a spelling it does not read is refused), and
// each rule is shown to refuse what it is for, every spelling that could carry it included (tests/scripts/workflow-controls.ts).
// And the hosted jobs run the release check's fast tier as gates.mjs states it, gate by gate; and what is particular to ci.yml's
// fixtures: their read token in the one step that fetches them, their cache a pull request's of this repository alone. `actionlint`
// checks the syntax where it is installed.

const ROOT = resolve(__dirname, '../..')
const DIR = join(ROOT, '.github/workflows')
const NAMES = readdirSync(DIR).filter(n => /\.ya?ml$/.test(n)).sort()
const text = (name: string) => readFileSync(join(DIR, name), 'utf8')
/** every write a token holds, where and why: none */
const WRITES: Record<string, string[]> = {}
const RULES = { ...rulesFor(WRITES), 'browser jobs': browserJobs }
/** the fast tier's gates no hosted job runs, each with its reason: they run on the maintainer's machine, in the fast tier run
 *  there (lab/release-check/CI.md); none */
const NOT_HOSTED: Record<string, string> = {}

/** a workflow's jobs by name, each with its text (the comments before the next job's name stay with the one above it) */
const jobsOf = (yml: string) => new Map(yml.slice(yml.indexOf('\njobs:\n') + 7).split(/\n(?= {2}[a-z][a-z-]*:\n)/).flatMap(part => { const name = /^ {2}([a-z][a-z-]*):/m.exec(part)?.[1]; return name ? [[name, part] as [string, string]] : [] }))
/** a job's steps, each its text after its `- ` to the next step's, comments left out */
const stepsOf = (job: string) => codeOf(job.slice(job.indexOf('\n    steps:\n'))).split(/\n {6}- /).slice(1)
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** a step that runs exactly `command`, as its one line */
const runs = (step: string, command: string) => new RegExp(`(^|\\n)\\s*run: ${escaped(command)}$`, 'm').test(step)

describe('every workflow', () => {
  it('is read here, the one there is among them (a workflow added later is read without a line here)', () => {
    expect(NAMES).toEqual(expect.arrayContaining(['ci.yml']))
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

  // the controls: each rule, given ci.yml with the one thing it is for, in each spelling that could carry it, says so
  const ci = text('ci.yml')
  it.each(controlsOf(ci).map(c => [c.rule, c.what, c.text] as const))('the rule on %s refuses %s', (rule, _what, mutated) => {
    expect(RULES[rule as keyof typeof RULES], rule).toBeDefined()
    expect(RULES[rule as keyof typeof RULES](ci, 'ci.yml')).toEqual([])
    expect(RULES[rule as keyof typeof RULES](mutated, 'ci.yml').length).toBeGreaterThan(0)
  })
})

describe('the fast tier on GitHub\'s runners (ci.yml)', () => {
  const ci = text('ci.yml')
  const jobs = jobsOf(codeOf(ci))
  const ctx: Ctx = { root: ROOT, labData: null, refactor: '/lab', work: '/work', online: false, minFree: 12 }
  /** a fast gate's command as gates.mjs runs it, its own words */
  const commandOf = (id: string) => GATES.find(g => g.id === id)!.steps!(ctx).map(s => s.cmd.join(' '))

  it('runs on every pull request and every push to main and rebuild/v2, a pull request\'s older run stopped by its newer push', () => {
    expect(ci).toMatch(/^on:\n {2}push:\n {4}branches: \[main, rebuild\/v2\]\n {2}pull_request:\n\n/m)
    // (a pull request's runs share one group, a newer push cancelling the run in progress; every other run is a group of its own,
    // which nothing cancels: a pending run of a shared group is replaced by the next one queued)
    expect(ci).toMatch(/\nconcurrency:\n {2}group: \$\{\{ github\.event_name == 'pull_request' && format\('ci-pr-\{0\}', github\.event\.pull_request\.number\) \|\| format\('ci-run-\{0\}', github\.run_id\) \}\}\n {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}\n/)
  })

  it('has the three jobs, and the two browser jobs hold no secret, variable, token, environment, cache or permission of their own', () => {
    expect([...jobs.keys()]).toEqual(['check', 'reader', 'extension'])
    expect(browserJobs(ci, 'ci.yml')).toEqual([])
    for (const job of ['reader', 'extension']) {
      const body = jobs.get(job)!
      expect(body, job).toMatch(/\n {4}runs-on: ubuntu-24\.04\n {4}timeout-minutes: \d+\n/)
      // Playwright's browsers at the lockfile's version, installed after the dependencies and before any check
      const steps = stepsOf(body)
      const install = steps.findIndex(s => /run: pnpm exec playwright install --with-deps chromium/.test(s))
      expect(install, job).toBeGreaterThan(steps.findIndex(s => runs(s, 'pnpm install --frozen-lockfile')))
    }
  })

  it('runs each gate of the fast tier with the command gates.mjs gives it, but those kept off the runner with their reason: the browser gates as steps named by their ids, the e2e scripts on a build', () => {
    const fast = GATES.filter(g => g.tier === 'fast' && !g.private)
    const ran: string[] = []
    for (const g of fast.filter(g => g.stage === 'reader')) {
      if (NOT_HOSTED[g.id]) {
        // (a gate kept off GitHub's runners, its reason above: no step of ci.yml names it or runs its command)
        expect(codeOf(ci), g.id).not.toContain(g.id)
        expect(codeOf(ci), g.id).not.toContain(commandOf(g.id)[0]!)
        ran.push(g.id)
        continue
      }
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

describe('the secrets', () => {
  it('reach the fixtures fetch of ci.yml in that step\'s environment and in no other step', () => {
    const ci = text('ci.yml')
    const steps = ci.slice(ci.indexOf('\n    steps:\n')).split(/\n {6}- /).slice(1)
    const holding = steps.filter(step => /READARXIV_CI_TOKEN|CF_ACCOUNT_ID|secrets\./.test(step))
    expect(holding).toHaveLength(1)
    expect(holding[0]).toMatch(/^run: node scripts\/fetch-fixtures\.mjs\n {8}env:\n {10}READARXIV_CI_TOKEN: \$\{\{ secrets\.READARXIV_CI_TOKEN \}\}\n {10}CF_ACCOUNT_ID: \$\{\{ vars\.CF_ACCOUNT_ID \}\}\s*$/)
    // not the job's, the workflow's or any other step's, and no environment to take it from
    expect(ci).not.toMatch(/^env:/m)
    expect(ci).not.toMatch(/^\s+environment:/m)
    expect(ci.match(/READARXIV_CI_TOKEN/g)).toHaveLength(2)
    expect(ci.match(/CF_ACCOUNT_ID/g)).toHaveLength(2)
    expect(ci).not.toMatch(/pull_request_target/)
    // the job that holds the token reads the repository alone, and keeps no git credential in the checkout
    expect(ci).toMatch(/^permissions:\n {2}contents: read\n/m)
    expect(ci).toMatch(/uses: actions\/checkout@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}persist-credentials: false\n/)
    // the order of the fetch among the steps stays: after the cache is restored, before the tests that read the fixtures
    const order = steps.map(step => (step.startsWith('id: fixtures-cache') ? 'restore' : step.startsWith('run: node scripts/fetch-fixtures.mjs') ? 'fetch' : step.startsWith('run: pnpm test') ? 'test' : ''))
    expect(order.filter(Boolean)).toEqual(['restore', 'fetch', 'test'])
  })
})

describe('the fixtures\' cache (ci.yml)', () => {
  // arXiv's papers under its non-exclusive licence, never redistributed (tests/fixtures/README.md): ci.yml runs on a push to main
  // too, and a cache saved there is restorable by any pull request, a fork's included, whose own copy of the workflow decides what
  // happens to it (#88 E8). A pull request's cache is that pull request's alone
  const ci = text('ci.yml')
  const steps = ci.slice(ci.indexOf('\n    steps:\n')).split(/\n {6}- /).slice(1)
  const SAME_REPO = "github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository"
  it('is restored and saved only in a pull request of this repository', () => {
    const caching = steps.filter(step => /uses: actions\/cache\//.test(step))
    expect(caching).toHaveLength(2)
    for (const step of caching) {
      const condition = /^(?:id: .*\n\s+)?if: (.*)$/m.exec(step)?.[1]
      expect(condition, step.split('\n')[0]).toBeDefined()
      expect(condition!.startsWith(`${SAME_REPO}`), step.split('\n')[0]).toBe(true)
    }
    // the save after a miss alone
    expect(caching.find(step => step.includes('actions/cache/save'))).toContain(`if: ${SAME_REPO} && steps.fixtures-cache.outputs.cache-hit != 'true'`)
  })
  it('is keyed apart from the entry main saved before the guard, which no run reads again and so expires', () => {
    for (const m of ci.matchAll(/key: (\S+)\$\{\{/g)) expect(m[1]).toBe('remote-fixtures-pr-')
  })
})
