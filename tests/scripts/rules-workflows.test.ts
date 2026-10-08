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
    expect(covered(patterns, 'src/pdf-reader/engine/live.mjs')).toBe(false)
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
  it('go to actions of GitHub\'s and pnpm\'s alone, at a major version', () => {
    for (const name of WORKFLOWS) for (const m of text(name).matchAll(/uses: (\S+)/g)) expect(m[1], name).toMatch(/^(actions\/[a-z-]+(\/[a-z-]+)?|pnpm\/action-setup)@v\d+$/)
  })
})

describe('the pull request gate', () => {
  const yml = text('rules-gate.yml')
  it('holds the permissions the plan names, runs in its environment, skips a fork, and keeps to its budget', () => {
    expect(/^permissions:\n {2}contents: read\n {2}pull-requests: write\n/m.test(yml)).toBe(true)
    expect(yml).toContain('environment: rules-gate')
    expect(yml).toContain('if: github.event.pull_request.head.repo.full_name == github.repository')
    expect(yml).toContain('timeout-minutes: 15')
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub expression, not a template
    expect(yml).toContain('ref: ${{ github.event.pull_request.head.sha }}')
  })
  it('edits one comment found by the marker the script writes, and uploads the numbers alone', () => {
    expect(yml).toContain(`startswith("${MARK}")`)
    expect(yml).toContain(String.raw`printf '<!-- rules-gate -->\n`)
    expect(yml).toMatch(/upload-artifact@v4\n\s+with:\n\s+name: rules-gate\n\s+path: \$\{\{ runner\.temp \}\}\/verdict\/rules-gate\.json/)
  })
})

describe('the publish', () => {
  const yml = text('rules-publish.yml')
  it('goes to staging by itself, past the live engines, to production only when it is on and its reviewer says so', () => {
    expect(/\n {2}staging:\n(?:.*\n)*?\s+environment: rules-staging\n/.test(yml)).toBe(true)
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
