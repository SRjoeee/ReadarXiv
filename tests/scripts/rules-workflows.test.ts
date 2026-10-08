import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MARK } from '../../lab/pdf/spikes/rules-gate.mjs'

// The three workflows of the rules gate (.github/workflows/rules-gate.yml, rules-publish.yml, rules-point.yml, Task R6) cannot
// run on a machine that is not GitHub's, so what keeps them honest is read here: that the gate runs when the files it loads
// change, that no secret reaches a script but through a step's environment, that the production publish is off and waits for
// its reviewer, and that every flag a workflow gives a script is one the script reads. `actionlint` checks the rest (the
// syntax, the contexts, the expressions) where it is installed.

const ROOT = resolve(__dirname, '../..')
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8')
const WORKFLOWS = ['rules-gate.yml', 'rules-publish.yml', 'rules-point.yml']
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
    const loaded = closure(['layer/check.mjs', 'layout/json.mjs', 'layer-proto/removal.mjs', 'layout/ink.mjs', 'layer-proto/run.mjs', 'layout/file.mjs', 'rules/layout.mjs', 'layout/addon.mjs', 'layout/remove.mjs', 'layer-proto/hyph.mjs'].map(E))
    expect(loaded.length).toBeGreaterThan(20)
    expect(loaded.filter(f => !covered(patterns, f))).toEqual([])
  })
  it('covers the gate, its scorer and measures, the rules gate, the pack and its manifest, and itself', () => {
    const gate = ['lab/pdf/spikes/layer-gate.mjs', ...readdirSync(join(ROOT, 'lab/pdf/spikes/layer-gate')).map(f => `lab/pdf/spikes/layer-gate/${f}`), 'lab/pdf/spikes/rules-gate.mjs', 'lab/pdf/spikes/gate-pack.mjs', 'lab/pdf/gate-pack.json', '.github/workflows/rules-gate.yml']
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
    for (const name of WORKFLOWS) {
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
    expect(gate.match(/secrets\./g)).toHaveLength(1)
    expect(/- name: Pack from the bucket\n\s+if: .*\n\s+env:\n\s+READARXIV_CI_TOKEN: \$\{\{ secrets\.READARXIV_CI_TOKEN \}\}/.test(gate)).toBe(true)
    for (const name of ['rules-publish.yml', 'rules-point.yml']) for (const m of text(name).matchAll(/secrets\.(\w+)/g)) expect(['RULES_PUBLISH_SECRET', 'READARXIV_CI_TOKEN']).toContain(m[1])
  })
  it('go to actions of GitHub\'s alone, at a major version: pnpm comes with corepack, not a third party\'s action', () => {
    for (const name of WORKFLOWS) for (const m of text(name).matchAll(/uses: (\S+)/g)) expect(m[1], name).toMatch(/^actions\/[a-z-]+(\/[a-z-]+)?@v\d+$/)
    for (const name of WORKFLOWS.filter(n => text(n).includes('pnpm '))) expect(text(name), name).toContain('run: corepack enable')
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

describe('the pull request gate', () => {
  const yml = text('rules-gate.yml')
  it('holds the permissions the plan names, runs in its environment, skips a fork and an unset bucket, and keeps to its budget', () => {
    expect(/^permissions:\n {2}contents: read\n {2}pull-requests: write\n/m.test(yml)).toBe(true)
    expect(yml).toContain('environment: rules-gate')
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
    expect(yml).toMatch(/upload-artifact@v4\n\s+with:\n\s+name: rules-gate\n\s+path: \$\{\{ runner\.temp \}\}\/verdict\/rules-gate\.json/)
  })
})

describe('the publish', () => {
  const yml = text('rules-publish.yml')
  it('goes to staging by itself once staging exists, past the live engines, to production only when it is on and its reviewer says so', () => {
    expect(/\n {2}staging:\n\s+name: Staging\n(?:\s+#.*\n)*\s+if: vars\.RULES_STAGING_URL != ''\n(?:.*\n)*?\s+environment: rules-staging\n/.test(yml)).toBe(true)
    expect(/\n {2}engines:\n\s+name: Live engines\n\s+needs: staging\n(?:.*\n)*?\s+environment: rules-gate\n/.test(yml)).toBe(true)
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
  /** a workflow's jobs by name, each with its text (the comments before the next job's name stay with the one above it) */
  const jobsOf = (yml: string) => new Map(yml.slice(yml.indexOf('\njobs:\n') + 7).split(/\n(?= {2}[a-z][a-z-]*:\n)/).flatMap(part => { const name = /^ {2}([a-z][a-z-]*):/m.exec(part)?.[1]; return name ? [[name, part] as [string, string]] : [] }))
  const concurrencyOf = (job: string) => /\n {4}concurrency:\n {6}group: (.*)\n {6}cancel-in-progress: (.*)\n/.exec(job)?.slice(1) ?? null
  const publish = jobsOf(text('rules-publish.yml')), point = jobsOf(text('rules-point.yml'))

  it('puts every write of a pointer in the one group of its environment, queued and never cancelled', () => {
    expect(concurrencyOf(publish.get('staging')!)).toEqual(['rules-pointer-staging', 'false'])
    expect(concurrencyOf(publish.get('production')!)).toEqual(['rules-pointer-production', 'false'])
    // the rollback's group is an expression of the environment, which is one of two: it comes to the same two groups
    const options = [...(/options:\n((?:\s+- \w+\n)+)/.exec(text('rules-point.yml'))?.[1] ?? '').matchAll(/- (\w+)/g)].map(m => m[1]!)
    expect(options).toEqual(['staging', 'production'])
    const rollback = concurrencyOf(point.get('point')!)!
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub expression, not a template
    expect(rollback[0]).toBe('rules-pointer-${{ inputs.environment }}')
    expect(options.map(o => rollback[0]!.replace('${{ inputs.environment }}', o))).toEqual(['rules-pointer-staging', 'rules-pointer-production'])
    expect(rollback[1]).toBe('false')
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
  it('cancels the publishes waiting for their approval before a production rollback, with the one write permission there is, and no secret', () => {
    const cancel = point.get('cancel-waiting')!
    expect(cancel).toContain("if: inputs.environment == 'production'")
    expect(cancel).toMatch(/\n {4}permissions:\n {6}actions: write\n/)
    expect(cancel).not.toMatch(/secrets\.|environment:/)
    const body = runBodies(cancel).join('\n')
    expect(body).toContain('gh run list --workflow rules-publish.yml --status waiting')
    expect(body).toContain('gh run cancel "$id"')
    // that job alone holds a write permission; the workflows' own are read
    for (const name of WORKFLOWS) {
      const yml = text(name)
      expect(/^permissions:\n {2}contents: read\n/m.test(yml), name).toBe(true)
      const writes = [...yml.matchAll(/\n( +)(\w[\w-]*): write\n/g)].map(m => `${m[2]}`)
      expect(writes.filter(w => w === 'actions'), name).toHaveLength(name === 'rules-point.yml' ? 1 : 0)
    }
    // the rollback follows it, and is not made where it failed (a skipped one is staging's)
    const rollback = point.get('point')!
    expect(rollback).toContain('needs: cancel-waiting')
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub expression, not a template
    expect(rollback).toContain("if: ${{ !cancelled() && (needs.cancel-waiting.result == 'success' || needs.cancel-waiting.result == 'skipped') }}")
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
