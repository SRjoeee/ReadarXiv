import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MARK } from '../../lab/pdf/spikes/rules-gate.mjs'

// The three workflows of the rules gate (.github/workflows/rules-gate.yml, rules-publish.yml, rules-point.yml, Task R6) cannot
// run on a machine that is not GitHub's, so what keeps them honest is read here: that the gate runs when the files it loads
// change, that no secret reaches a script but through a step's environment, that the production publish is off and waits for
// its reviewer, and that every flag a workflow gives a script is one the script reads. The same rules hold for ci.yml's fixtures
// fetch, which reads the same repository secret. `actionlint` checks the rest (the syntax, the contexts, the expressions) where
// it is installed.

const ROOT = resolve(__dirname, '../..')
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8')
const WORKFLOWS = ['rules-gate.yml', 'rules-publish.yml', 'rules-point.yml']
/** the workflows whose jobs may hold the bucket's read token: the three above, and the fixtures fetch of ci.yml */
const WITH_TOKEN = [...WORKFLOWS, 'ci.yml']
const text = (name: string) => read(`.github/workflows/${name}`)

/** the patterns of a workflow's `paths:` filter */
const pathsOf = (yml: string) => [...(/^\s+paths:\n((?:\s+- '.*'\n)+)/m.exec(yml)?.[1] ?? '').matchAll(/- '(.*)'/g)].map(m => m[1]!)
/** a GitHub path pattern: `**` crosses directories, `*` does not */
const matches = (pattern: string, path: string) => new RegExp(`^${pattern.split('**').map(part => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('.*')}$`).test(path)
const covered = (patterns: string[], path: string) => patterns.some(p => matches(p, path))

/** the files a file loads by a relative import, followed to the end */
function closure(entries: string[]): string[] {
  const seen = new Set<string>()
  const visit = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    if (!/\.m?js$/.test(file)) return
    for (const m of readFileSync(file, 'utf8').matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"](\.[^'"]+)['"]/g)) {
      const target = resolve(dirname(file), m[1]!)
      if (existsSync(target)) visit(target)
    }
  }
  entries.forEach(visit)
  return [...seen].map(f => relative(ROOT, f)).sort()
}

/** a workflow's jobs by name, each with its text (the comments before the next job's name stay with the one above it) */
const jobsOf = (yml: string) => new Map(yml.slice(yml.indexOf('\njobs:\n') + 7).split(/\n(?= {2}[a-z][a-z-]*:\n)/).flatMap(part => { const name = /^ {2}([a-z][a-z-]*):/m.exec(part)?.[1]; return name ? [[name, part] as [string, string]] : [] }))

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

describe('the gate runs when what it loads changes', () => {
  const patterns = pathsOf(text('rules-gate.yml'))
  it('covers every engine file the gate loads, found by following its imports from the files the page and the Node side load', () => {
    const E = (f: string) => join(ROOT, 'src/pdf-reader/engine', f)
    // the page (layer-gate/proto.mjs) imports these from /engine/; layer-gate.mjs imports the others in Node
    // (and the wrap's, layer-gate/wrap.mjs: the base page wrapped by optional content and its cell rules, beside the source
    // units' reading, which is the pipeline's and not the drawing's)
    const loaded = closure(['layer/check.mjs', 'layout/json.mjs', 'layer-proto/visibility.mjs', 'layer-proto/hide.mjs', 'layout/ink.mjs', 'layer-proto/run.mjs', 'layout/file.mjs', 'rules/layout.mjs', 'layout/wrap.mjs', 'layout/cell-rules.mjs', 'layout/remove.mjs', 'layer-proto/hyph.mjs', 'layer-proto/rows.mjs'].map(E))
    // (and the rows' reading, rows.mjs, whose units openProto takes: their table groups, translate/groups.mjs, and a cell's
    // span, layer-proto/cells.mjs — Devin on #456)
    expect(loaded.length).toBeGreaterThan(20)
    expect(loaded.filter(f => !covered(patterns, f))).toEqual([])
  })
  it('loads in the page no module the page cannot import: none of the repository\'s TypeScript (src/core), which only --door transpiles', () => {
    // (3310dfa7 on #456: run.mjs imported translate/groups.mjs, whose mt.mjs imports src/core's .ts: every output of the head run
    // failed to load the engine, "did not run")
    const E = (f: string) => join(ROOT, 'src/pdf-reader/engine', f)
    const page = closure(['layer/check.mjs', 'layout/json.mjs', 'layer-proto/visibility.mjs', 'layer-proto/hide.mjs', 'layout/ink.mjs', 'layer-proto/run.mjs', 'layout/file.mjs', 'rules/layout.mjs', 'layer-proto/hyph.mjs'].map(E))
    expect(page.filter(f => f.endsWith('.ts'))).toEqual([])
  })
  it('covers the gate, its scorer and measures, the rules gate, the pack and its manifest, and itself', () => {
    const gate = ['lab/pdf/spikes/layer-gate.mjs', ...readdirSync(join(ROOT, 'lab/pdf/spikes/layer-gate')).map(f => `lab/pdf/spikes/layer-gate/${f}`), 'lab/pdf/spikes/rules-gate.mjs', 'lab/pdf/spikes/gate-pack.mjs', 'scripts/r2-read.mjs', 'lab/pdf/gate-pack.json', '.github/workflows/rules-gate.yml']
    expect(gate.filter(f => !covered(patterns, f))).toEqual([])
    // and not the rest of the repository
    expect(covered(patterns, 'src/core/rules/latexml.ts')).toBe(false)
    expect(covered(patterns, 'src/pdf-reader/engine/pipeline/live.mjs')).toBe(false)
  })
  it('publishes when the set changes, on next, and on nothing else', () => {
    const yml = text('rules-publish.yml')
    expect(pathsOf(yml)).toEqual(['src/pdf-reader/engine/rules/layout-rules.json'])
    expect(/push:\n\s+branches:\n\s+- next\n/.test(yml)).toBe(true)
    expect(yml).not.toMatch(/pull_request/)
  })
})

describe('the secrets', () => {
  it('are named only as the value of a step\'s environment, and no expression is spliced into a script', () => {
    for (const name of WITH_TOKEN) {
      const yml = text(name)
      for (const line of yml.split('\n').filter(l => l.includes('secrets.'))) {
        expect(line, `${name}: ${line.trim()}`).toMatch(/^ {10}[A-Z][A-Z0-9_]*: \$\{\{ secrets\.[A-Z][A-Z0-9_]* \}\}$/)
      }
      for (const body of runBodies(yml)) expect(body, `${name}: a script holds an expression`).not.toContain('${{')
      expect(yml).not.toMatch(/pull_request_target/)
      expect(yml).not.toMatch(/secrets: inherit/)
    }
  })
  it('are the read token in the step that fetches the pack, the publish secret in the step that publishes', () => {
    const gate = text('rules-gate.yml')
    // the two restore steps (the pull request's pack, and the merge base's: 'each side runs on its own pack' below) and no other
    expect(gate.match(/secrets\./g)).toHaveLength(2)
    for (const step of ['Pack from the bucket', 'Merge base pack from the bucket']) {
      expect(new RegExp(`- name: ${step}\\n\\s+if: .*\\n\\s+env:\\n\\s+READARXIV_CI_TOKEN: \\$\\{\\{ secrets\\.READARXIV_CI_TOKEN \\}\\}`).test(gate), step).toBe(true)
    }
    for (const name of ['rules-publish.yml', 'rules-point.yml']) for (const m of text(name).matchAll(/secrets\.(\w+)/g)) expect(['RULES_PUBLISH_SECRET', 'READARXIV_CI_TOKEN']).toContain(m[1])
  })
  it('go to actions of GitHub\'s alone, each pinned by its full commit with its version beside it: pnpm comes with corepack, not a third party\'s action', () => {
    // a tag moves where its owner moves it; a commit does not (#82f: the website's deploy workflows pin so, and are held to it)
    for (const name of WITH_TOKEN) {
      const uses = [...text(name).matchAll(/uses: (.*)/g)].map(m => m[1]!)
      expect(uses.length, name).toBeGreaterThan(0)
      for (const use of uses) expect(use, name).toMatch(/^actions\/[a-z-]+(\/[a-z-]+)?@[0-9a-f]{40} # v\d+\.\d+\.\d+$/)
    }
    // one action, one commit, in every workflow
    const commits = new Map<string, Set<string>>()
    for (const name of WITH_TOKEN) for (const m of text(name).matchAll(/uses: (\S+)@([0-9a-f]{40})/g)) commits.set(m[1]!, (commits.get(m[1]!) ?? new Set()).add(m[2]!))
    for (const [action, at] of commits) expect([...at], action).toHaveLength(1)
    for (const name of WITH_TOKEN.filter(n => text(n).includes('pnpm '))) expect(text(name), name).toContain('run: corepack enable')
    expect(text('ci.yml')).not.toContain('pnpm/action-setup')
  })
  it('are held by no environment: the read token is a repository secret, and a copy in an environment would shadow it at rotation', () => {
    for (const name of WITH_TOKEN) expect(text(name), name).not.toContain('environment: rules-gate')
    let restoring = 0
    for (const name of WORKFLOWS) {
      for (const [job, body] of jobsOf(text(name))) {
        if (!body.includes('gate-pack.mjs restore')) continue
        restoring++
        expect(body, `${name}: ${job}`).not.toMatch(/^\s+environment:/m)
        expect(body, `${name}: ${job}`).toMatch(/\n {8}env:\n {10}READARXIV_CI_TOKEN: \$\{\{ secrets\.READARXIV_CI_TOKEN \}\}\n {10}CF_ACCOUNT_ID: \$\{\{ vars\.CF_ACCOUNT_ID \}\}\n {8}run: node lab\/pdf\/spikes\/gate-pack\.mjs restore\n/)
      }
    }
    // the gate and the live-engines check of the publish
    expect(restoring).toBe(2)
  })
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

describe('each side of the gate runs on the pack its own commit names', () => {
  const yml = text('rules-gate.yml')
  /** the gate job's steps by name (a step's trailing comments stay with it; none of them names a secret or a path) */
  const steps = new Map(yml.slice(yml.indexOf('\n    steps:\n')).split(/\n {6}- /).slice(1).flatMap(s => { const name = /^(?:name: (.*)|id: .*\n\s+name: (.*))/m.exec(s); return name ? [[(name[1] ?? name[2])!, s] as [string, string]] : [] }))
  const step = (name: string) => { const s = steps.get(name); expect(s, name).toBeDefined(); return s! }
  const order = [...steps.keys()]
  const BASE_SCRIPT = '"$RUNNER_TEMP/base/lab/pdf/spikes/gate-pack.mjs"'
  const BASE_MANIFEST = '--pack="$RUNNER_TEMP/base/lab/pdf/gate-pack.json"'

  it('has the merge base\'s worktree before either pack is restored, and both packs before either run', () => {
    const at = (name: string) => { expect(order, name).toContain(name); return order.indexOf(name) }
    expect(at('Merge base')).toBeLessThan(at('Pack digests'))
    expect(at('Pack digests')).toBeLessThan(at('Pack from the bucket'))
    expect(at('Pack digests')).toBeLessThan(at('Merge base pack from the bucket'))
    expect(at('Check the merge base pack')).toBeLessThan(at('Gate on the merge base'))
    expect(at('Check the pack')).toBeLessThan(at('Gate on the merge base'))
  })

  it('reads the merge base\'s digest from its own manifest with its own script, and runs the base on the pull request\'s directory only where the layout file\'s version is the same (not where the digests are)', () => {
    const digests = step('Pack digests')
    expect(digests).toContain('head=$(node lab/pdf/spikes/gate-pack.mjs digest)')
    expect(digests).toContain(`base=$(node ${BASE_SCRIPT} digest ${BASE_MANIFEST})`)
    // the layout field of each side's gate-pack.json decides, not the digest: another pack under the same layout is measured on the one pack
    expect(digests).toMatch(/hl=\$\(node -e '[^']*\.layout \?\? null[^']*' lab\/pdf\/gate-pack\.json\)/)
    expect(digests).toMatch(/bl=\$\(node -e '[^']*\.layout \?\? null[^']*' "\$RUNNER_TEMP\/base\/lab\/pdf\/gate-pack\.json"\)/)
    expect(digests).toContain('if [ "$hl" = "$bl" ]; then')
    expect(digests).toMatch(/same=true.*\n\s+echo "BASE_PACK=\$PWD\/lab\/pdf\/out\/gate-pack" >> "\$GITHUB_ENV"\n\s+echo "BASE_PACK_JSON=\$PWD\/lab\/pdf\/gate-pack\.json" >> "\$GITHUB_ENV"\n\s+else\n\s+echo "same=false.*\n\s+echo "BASE_PACK=\$RUNNER_TEMP\/base-pack" >> "\$GITHUB_ENV"\n\s+echo "BASE_PACK_JSON=\$RUNNER_TEMP\/base\/lab\/pdf\/gate-pack\.json" >> "\$GITHUB_ENV"\n\s+fi/)
  })

  it('restores the merge base\'s pack with the merge base\'s own script and manifest, from a cache keyed by its own digest, only where the layout versions differ', () => {
    const cache = step('Merge base pack from the cache'), bucket = step('Merge base pack from the bucket'), keep = step('Keep the merge base pack'), check = step('Check the merge base pack')
    for (const s of [cache, bucket, keep, check]) expect(s).toContain("steps.pack.outputs.same != 'true'")
    expect(cache).toContain('uses: actions/cache/restore@')
    expect(keep).toContain('uses: actions/cache/save@')
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub expressions, not templates
    for (const s of [cache, keep]) { expect(s).toContain('key: gate-pack-${{ steps.pack.outputs.base }}'); expect(s).toContain('path: ${{ runner.temp }}/base-pack') }
    // only a cache miss reads the bucket and saves
    for (const s of [bucket, keep]) expect(s).toContain("steps.base-cache.outputs.cache-hit != 'true'")
    expect(bucket).toContain(`run: node ${BASE_SCRIPT} restore ${BASE_MANIFEST} --out="$BASE_PACK"`)
    expect(check).toContain(`run: node ${BASE_SCRIPT} verify ${BASE_MANIFEST} --out="$BASE_PACK"`)
    // (the directory the digests step chose for the other branch is the one the cache holds)
    expect(step('Pack digests')).toContain('BASE_PACK=$RUNNER_TEMP/base-pack')
  })

  it('keeps the pull request\'s pack on its own digest, and measures the base on the base\'s directory and the head on the pull request\'s', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub expressions, not templates
    for (const name of ['Pack from the cache', 'Keep the pack']) expect(step(name)).toContain('key: gate-pack-${{ steps.pack.outputs.digest }}')
    expect(step('Gate on the merge base')).toContain('--pack="$BASE_PACK" --pack-json="$BASE_PACK_JSON"')
    expect(step('Gate on the merge base')).not.toContain('--pack=lab/pdf/out/gate-pack')
    expect(step('Gate on the pull request')).toContain('--pack=lab/pdf/out/gate-pack --pack-json=lab/pdf/gate-pack.json ')
    expect(step('Gate on the pull request')).not.toContain('BASE_PACK')
    // the verdict reads the pull request's manifest and records
    expect(step('Verdict')).toContain('--pack=lab/pdf/gate-pack.json --records=lab/pdf/out/gate-pack/fixtures')
  })

  it('names the token only in the two restore steps\' environments', () => {
    const named = [...steps].filter(([, s]) => /secrets\.|READARXIV_CI_TOKEN|CF_ACCOUNT_ID/.test(s)).map(([name]) => name)
    expect(named).toEqual(['Pack from the bucket', 'Merge base pack from the bucket'])
    // and the job-level environment holds none
    expect(/\n {4}env:\n((?: {6}.*\n)+)/.exec(yml)?.[1]).not.toMatch(/secrets|TOKEN|CF_ACCOUNT_ID/)
  })
})

describe('the pack\'s cache', () => {
  it('is kept only by a workflow that pull requests alone run: a cache of next is read by a fork\'s pull request', () => {
    for (const name of WORKFLOWS) {
      const yml = text(name)
      if (!/uses: actions\/cache/.test(yml)) continue
      const on = /^on:\n((?: {2}.*\n| *\n)+)/m.exec(yml)?.[1] ?? ''
      expect([...on.matchAll(/^ {2}([a-z_]+):/gm)].map(m => m[1]), `${name} caches the pack`).toEqual(['pull_request'])
    }
    // the publish workflow downloads the pack fresh, digest-checked, and saves nothing
    expect(text('rules-publish.yml')).not.toMatch(/actions\/cache/)
    expect(text('rules-publish.yml')).toContain('gate-pack.mjs restore')
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

describe('the pull request gate', () => {
  const yml = text('rules-gate.yml')
  it('holds the permissions the plan names, runs in no environment, skips a fork and an unset bucket, and keeps to its budget', () => {
    expect(/^permissions:\n {2}contents: read\n {2}pull-requests: write\n/m.test(yml)).toBe(true)
    expect(yml).not.toMatch(/^\s+environment:/m)
    expect(yml).toContain("if: github.event.pull_request.head.repo.full_name == github.repository && vars.CF_ACCOUNT_ID != ''")
    expect(yml).toContain('timeout-minutes: 15')
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub expression, not a template
    expect(yml).toContain('ref: ${{ github.event.pull_request.head.sha }}')
  })
  it('comments unless the run was cancelled (a superseded run says nothing), and finds its comment without a pipe that can break', () => {
    expect(yml).toMatch(/- name: Comment\n\s+if: \$\{\{ !cancelled\(\) \}\}/)
    expect(yml).not.toMatch(/\| head /)
  })
  it('edits one comment found by the marker the script writes, and uploads the numbers alone', () => {
    expect(yml).toContain(`startswith("${MARK}")`)
    expect(yml).toContain(String.raw`printf '<!-- rules-gate -->\n`)
    expect(yml).toMatch(/upload-artifact@[0-9a-f]{40} # v[\d.]+\n\s+with:\n\s+name: rules-gate\n\s+path: \$\{\{ runner\.temp \}\}\/verdict\/rules-gate\.json/)
  })
})

describe('the publish', () => {
  const yml = text('rules-publish.yml')
  it('goes to staging by itself once staging exists, past the live engines, to production only when it is on and its reviewer says so', () => {
    expect(/\n {2}staging:\n\s+name: Staging\n(?:\s+#.*\n)*\s+if: vars\.RULES_STAGING_URL != ''\n(?:.*\n)*?\s+environment: rules-staging\n/.test(yml)).toBe(true)
    // (the live-engines check restores the pack with the repository secret: it names no environment)
    expect(/\n {2}engines:\n\s+name: Live engines\n\s+needs: staging\n/.test(yml)).toBe(true)
    expect(jobsOf(yml).get('engines')).not.toMatch(/^\s+environment:/m)
    expect(/\n {2}production:\n\s+name: Production\n\s+if: vars\.RULES_PRODUCTION == 'on'\n\s+needs: \[staging, engines\]\n(?:.*\n)*?\s+environment: rules-production\n/.test(yml)).toBe(true)
  })
  it('measures nothing while live-engines.json names no engine', () => {
    const engines = JSON.parse(read('lab/pdf/live-engines.json'))
    expect(engines.engines).toEqual([])
    expect(yml).toContain("count=$(node -p \"require('./lab/pdf/live-engines.json').engines.length\")")
    // every step after the count carries the condition, but the checkout and the count itself
    const steps = yml.slice(yml.indexOf('name: Engines to check')).split(/\n {6}- /).slice(1)
    const production = steps.findIndex(s => s.startsWith('name: Pack digest'))
    for (const s of steps.slice(production - 4, steps.findIndex(s => s.startsWith('name: The set on each live engine')) + 1)) expect(s, s.split('\n')[0]).toContain("steps.list.outputs.count != '0'")
  })
})

describe('the newest set only', () => {
  const yml = text('rules-publish.yml')
  it('has each publish read next just before its write, and ask the script to stand down where next is newer', () => {
    for (const environment of ['staging', 'production']) {
      const steps = yml.slice(yml.indexOf(`name: Publish to ${environment} and point it at the set`) - 400).split(/\n {6}- /)
      const at = steps.findIndex(s => s.startsWith(`name: Publish to ${environment}`))
      expect(steps[at - 1], environment).toMatch(/^name: Fetch next\n\s+run: git fetch --no-tags --depth=1 origin \+refs\/heads\/next:refs\/remotes\/origin\/next/)
      expect(steps[at], environment).toContain('rules-publish.mjs publish --url="$RULES_URL" --next=origin/next')
    }
    expect(yml.match(/--next=origin\/next/g)).toHaveLength(2)
  })
})

describe('the rollback', () => {
  const yml = text('rules-point.yml')
  it('is a dispatch with a schema, a version and a choice of two environments, and production waits for its reviewer', () => {
    expect(yml).toMatch(/workflow_dispatch:\n\s+inputs:\n\s+schema:/)
    expect(yml).toMatch(/environment:\n(?:\s+.*\n)*?\s+type: choice\n\s+options:\n\s+- staging\n\s+- production\n/)
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub expression, not a template
    expect(yml).toContain("environment: ${{ inputs.environment == 'production' && 'rules-production' || 'rules-staging' }}")
  })
})

describe('one pointer, one queue', () => {
  // [group, cancel-in-progress, queue]: the queue is GitHub's `queue: max`, which keeps every pending job in order (the default keeps one
  // and cancels it for the next, so a rollback pending behind a publish would vanish)
  const concurrencyOf = (job: string) => /\n {4}concurrency:\n {6}group: (.*)\n {6}cancel-in-progress: (.*)\n(?: {6}#.*\n)* {6}queue: (.*)\n/.exec(job)?.slice(1) ?? null
  const publish = jobsOf(text('rules-publish.yml')), point = jobsOf(text('rules-point.yml'))

  it('puts every write of a pointer in the one group of its environment, queued and never cancelled', () => {
    expect(concurrencyOf(publish.get('staging')!)).toEqual(['rules-pointer-staging', 'false', 'max'])
    expect(concurrencyOf(publish.get('production')!)).toEqual(['rules-pointer-production', 'false', 'max'])
    // the rollback's group is an expression of the environment, which is one of two: it comes to the same two groups
    const options = [...(/options:\n((?:\s+- \w+\n)+)/.exec(text('rules-point.yml'))?.[1] ?? '').matchAll(/- (\w+)/g)].map(m => m[1]!)
    expect(options).toEqual(['staging', 'production'])
    const rollback = concurrencyOf(point.get('point')!)!
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub expression, not a template
    expect(rollback[0]).toBe('rules-pointer-${{ inputs.environment }}')
    expect(options.map(o => rollback[0]!.replace('${{ inputs.environment }}', o))).toEqual(['rules-pointer-staging', 'rules-pointer-production'])
    expect(rollback[1]).toBe('false')
    expect(rollback[2]).toBe('max')
  })
  it('lets no job that writes a pointer go without one, in any of the workflows', () => {
    for (const name of WORKFLOWS) {
      for (const [job, body] of jobsOf(text(name))) {
        if (!/rules-publish\.mjs (publish|point)/.test(body)) continue
        expect(concurrencyOf(body)?.[0], `${name}: ${job}`).toMatch(/^rules-pointer-/)
      }
    }
    // the group of the live-engines check is nobody's: it writes no pointer
    expect(concurrencyOf(publish.get('engines')!)).toBeNull()
  })
  it('cancels every unfinished publish before a production rollback (one still measuring reaches the approval later), with the one write permission there is, and no secret', () => {
    const cancel = point.get('cancel-publishes')!
    expect(cancel).toContain("if: inputs.environment == 'production'")
    expect(cancel).toMatch(/\n {4}permissions:\n {6}actions: write\n/)
    expect(cancel).not.toMatch(/secrets\.|environment:/)
    const body = runBodies(cancel).join('\n')
    expect(body).toContain('for status in requested queued pending in_progress waiting; do')
    expect(body).toContain('gh run list --workflow rules-publish.yml --status "$status"')
    expect(body).toContain('if gh run cancel "$id"; then')
    // a run that ended between the list and the cancel is no failure; any other is
    expect(body).toContain('elif [ "$(gh run view "$id" --json status --jq .status)" = completed ]; then')
    expect(body).toContain('else exit 1; fi')
    // that job alone holds a write permission; the workflows' own are read
    for (const name of WORKFLOWS) {
      const yml = text(name)
      expect(/^permissions:\n {2}contents: read\n/m.test(yml), name).toBe(true)
      const writes = [...yml.matchAll(/\n( +)(\w[\w-]*): write\n/g)].map(m => `${m[2]}`)
      expect(writes.filter(w => w === 'actions'), name).toHaveLength(name === 'rules-point.yml' ? 1 : 0)
    }
    // the rollback follows it, and is not made where it failed (a skipped one is staging's)
    const rollback = point.get('point')!
    expect(rollback).toContain('needs: cancel-publishes')
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub expression, not a template
    expect(rollback).toContain("if: ${{ !cancelled() && (needs.cancel-publishes.result == 'success' || needs.cancel-publishes.result == 'skipped') }}")
  })
})

describe('the scripts a workflow runs', () => {
  it('are files of the tree, and every flag a workflow gives one is a flag it reads', () => {
    for (const name of WORKFLOWS) {
      for (const body of runBodies(text(name))) {
        for (const m of body.matchAll(/node (lab\/pdf\/spikes\/[\w.-]+\.mjs)((?:[^\n\\]|\\\n)*)/g)) {
          const script = m[1]!
          expect(existsSync(join(ROOT, script)), `${name}: ${script}`).toBe(true)
          const source = read(script)
          for (const f of m[2]!.matchAll(/--([a-z][a-z-]*)/g)) expect(source, `${name}: ${script} --${f[1]}`).toMatch(new RegExp(`['"\`]${f[1]}['"\`]|--${f[1]}[=\\s\`'"]`))
        }
      }
    }
  })
})
