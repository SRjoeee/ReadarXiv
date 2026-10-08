// @vitest-environment node
// The engine's contract (docs/PDF-READER.md, "The engine's contract"): src/pdf-reader/engine/ is what the web imports, through
// five entries that hold re-exports only. What each exports is snapshotted in engine-contract.json (WRITE_CONTRACT=1 records
// it again: a name that appears or goes is a change of the surface the web pins, made on purpose); the three entries a server
// or a worker loads load in plain node, with no alias and no bundler; nothing they or the reading view reach states a port;
// and every module of the engine is reached by an entry, by a gate that is kept, or by the shipped extension.
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node script, deliberately dependency-free and untyped
import { closureOf, ENGINE_ALLOW, engineFiles, portedInClosure, trackedFiles, unreached, valueImportsOf, withoutComments } from '../../scripts/check-boundary.mjs'

const ENGINE = 'src/pdf-reader/engine'
const ENTRIES = ['pipeline', 'translate', 'rules', 'layer', 'view'] as const
const entryFile = (name: string) => `${ENGINE}/${name}.mjs`
const CONTRACT_FILE = new URL('./engine-contract.json', import.meta.url)

/** the layer gate's instrument loads this checker by its address (lab/pdf/spikes/layer-gate/proto.mjs, hashed into every record) */
const GATE_NAMED = [`${ENGINE}/layer/check.mjs`]

// (the layer opens a canvas at import, as a browser's modules may; node has none)
class StubCanvas { width = 8; height = 8; getContext() { return null } }
const LOAD: Record<(typeof ENTRIES)[number], () => Promise<object>> = {
  pipeline: () => import('@/pdf-reader/engine/pipeline.mjs'),
  translate: () => import('@/pdf-reader/engine/translate.mjs'),
  rules: () => import('@/pdf-reader/engine/rules.mjs'),
  layer: () => import('@/pdf-reader/engine/layer.mjs'),
  view: () => import('@/pdf-reader/engine/view.mjs'),
}
async function withCanvas<T>(run: () => Promise<T>): Promise<T> {
  const g = globalThis as { OffscreenCanvas?: unknown }
  const had = g.OffscreenCanvas
  g.OffscreenCanvas = StubCanvas
  try { return await run() } finally { g.OffscreenCanvas = had }
}
const namesOf = (name: (typeof ENTRIES)[number]) => withCanvas(async () => Object.keys(await LOAD[name]()).sort())

describe('the five entries', () => {
  it('export, sorted, the names engine-contract.json lists', async () => {
    const now: Record<string, string[]> = {}
    for (const name of ENTRIES) now[name] = await namesOf(name)
    if (process.env.WRITE_CONTRACT === '1') writeFileSync(CONTRACT_FILE, `${JSON.stringify(now, null, 2)}\n`)
    const listed = JSON.parse(readFileSync(CONTRACT_FILE, 'utf8')) as Record<string, string[]>
    expect(Object.keys(listed)).toEqual([...ENTRIES])
    for (const name of ENTRIES) {
      expect(listed[name], `${name}: the file lists its names sorted`).toEqual([...(listed[name] ?? [])].sort())
      expect(now[name], name).toEqual(listed[name])
    }
  })

  it('hold re-exports only: no statement but `export … from`, and no import', () => {
    for (const name of ENTRIES) {
      const statements = withoutComments(readFileSync(entryFile(name), 'utf8')).split('\n').map((l: string) => l.trim()).filter(Boolean)
      expect(statements.length, name).toBeGreaterThan(0)
      for (const line of statements) expect(/^export (?:\*|\{[^}]+\}) from '\.\/[\w./-]+\.(?:mjs|ts)'$/.test(line), `${name}: ${line}`).toBe(true)
    }
  })

  it('give the layer the reader\'s door whole and the bundle\'s and the layout file\'s parsers it takes', async () => {
    const layer = await namesOf('layer')
    const door = await withCanvas(async () => Object.keys(await import('@/pdf-reader/engine/layer-proto/reader.mjs')).sort())
    expect(layer).toEqual(door)
    for (const name of ['openLayer', 'readBundle', 'BundleRefusal', 'BUNDLE', 'BUNDLE_CAP', 'BUNDLE_VALUES', 'VTAG', 'parseLayout', 'indexLayout', 'parseAddonManifest']) expect(layer, name).toContain(name)
  })

  it('give the server the bundle\'s writer and the translation the rows, and not the other way about', async () => {
    const pipeline = await namesOf('pipeline'), translate = await namesOf('translate')
    for (const name of ['openPaper', 'originalFiles', 'makeLayout', 'layoutMarksOfPaper', 'paperAddon', 'writeBundle', 'bundleUnitsOf', 'unpackSource', 'PDFJS']) expect(pipeline, name).toContain(name)
    for (const name of ['serialize', 'rehydrate', 'serializeTags', 'translateUnits', 'decideGroups', 'authorsTranslated', 'TRANSLATE_VERSION', 'rowOf', 'unitOf', 'layerRows', 'toTranslate', 'batchesOf', 'runRows']) expect(translate, name).toContain(name)
    // (the compile path stays out of the server's entry, and the layout maker and the front end out of the translation's)
    for (const name of ['runLive', 'translationFiles', 'strategiesFor', 'typesetting']) expect(pipeline, name).not.toContain(name)
    for (const name of ['makeLayout', 'paperAddon', 'openPaper', 'loadProject']) expect(translate, name).not.toContain(name)
  })
})

describe('plain node', () => {
  // no bundler, no alias: a TypeScript file reached by its extension is read by node's own type stripping
  for (const name of ['pipeline', 'translate', 'rules'] as const) {
    it(`loads ${name} and finds the names the contract lists`, () => {
      const listed = (JSON.parse(readFileSync(CONTRACT_FILE, 'utf8')) as Record<string, string[]>)[name] ?? []
      const url = pathToFileURL(entryFile(name)).href
      const r = spawnSync(process.execPath, ['--no-warnings', '--experimental-strip-types', '--input-type=module', '-e', `const m = await import(${JSON.stringify(url)}); console.log(JSON.stringify(Object.keys(m).sort()))`], { encoding: 'utf8' })
      expect({ status: r.status, stderr: r.stderr.slice(0, 400) }).toEqual({ status: 0, stderr: '' })
      expect(JSON.parse(r.stdout)).toEqual(listed)
    })
  }
})

describe('the engine\'s imports', () => {
  it('are relative paths, the engine\'s own and the three core modules\', in every file of the closure of the entries', () => {
    const closure = [...closureOf(ENTRIES.map(entryFile))] as string[]
    const core = new Set<string>(ENGINE_ALLOW)
    for (const file of closure.filter(f => f.endsWith('.mjs') || f.endsWith('.ts'))) {
      for (const spec of valueImportsOf(readFileSync(file, 'utf8')) as string[]) {
        if (!spec.startsWith('.') || spec.startsWith('node:')) continue
        expect(file.startsWith(`${ENGINE}/`) || [...core].some(c => file === `${c}.ts` || file === `${c}/index.ts`), file).toBe(true)
      }
    }
  })
})

describe('what the translation, the rules and the browser load', () => {
  // the server's modules: the front end and the files it reads, the compile path and the paper's pipeline, the layout maker,
  // the marks, the remover and the add-on's maker, and the pixel checker. The anchors and the versions are the pipeline's too,
  // and leaves that every reader takes
  const server = (f: string) => f.startsWith(`${ENGINE}/source/`)
    || (f.startsWith(`${ENGINE}/pipeline/`) && !/\/pipeline\/(?:anchors|versions)\.mjs$/.test(f))
    || /\/layout\/(?:make|marks|paper|remove|addon|carry|match|stream)\.mjs$/.test(f)
    || f.endsWith('/layer/check.mjs')
  for (const name of ['translate', 'rules', 'layer', 'view'] as const) {
    it(`reach none of the server's modules from ${name}`, () => {
      const closure = [...closureOf([entryFile(name)])] as string[]
      expect(closure.length).toBeGreaterThan(5)
      expect(closure.filter(server)).toEqual([])
    })
  }
})

describe('the licence of what a reader loads', () => {
  const tracked: string[] = trackedFiles()
  const code = (f: string) => /\.(?:[cm]?[jt]sx?)$/.test(f) && !/\.d\.[cm]?ts$/.test(f)
  const shared = ['src/pdf-reader/controller.ts', ...tracked.filter(f => /^(?:src\/pdf-reader\/ui|src\/ui\/controls)\//.test(f) && code(f))]

  it('states no port anywhere in the closure of the five entries (the web\'s R21 detector)', () => {
    expect(portedInClosure(ENTRIES.map(entryFile))).toEqual([])
  })

  // The brief held the shared interface to the same empty closure. It reaches four ported files today, each by one import
  // (listed with the file that brings it); the list is a ratchet — it may shrink, never grow — until those four are cut
  // from controller.ts and the shared components or the web takes them as ported code with the registry's entry.
  it('keeps the closure of controller.ts, src/pdf-reader/ui/** and src/ui/controls/** to the four ported files it reaches today, and no more', () => {
    expect(shared.length).toBeGreaterThan(30)
    expect(portedInClosure(shared)).toEqual([
      'src/config/languages.ts',          // controller.ts: the language table
      'src/providers/microsoft.ts',       // src/pdf-reader/ui/Menus.tsx, by src/ui/service-items.ts
      'src/providers/prompt-library.ts',  // controller.ts, by src/config/schema.ts
      'src/providers/request/retry-policy.ts', // controller.ts, by src/providers/types.ts
    ])
  })
})

describe('what nothing reaches', () => {
  it('is no module of the engine: each is reached by an entry, by the gate that names it, or by the shipped extension or the lab', () => {
    expect(engineFiles().length).toBeGreaterThan(60)
    expect(unreached(ENTRIES.map(entryFile), GATE_NAMED)).toEqual([])
  })
})
