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
import { closureOf, ENGINE_ALLOW, engineFiles, engineViolations, namedModulesOf, portedInClosure, trackedFiles, unreached, withoutComments } from '../../scripts/check-boundary.mjs'

const ENGINE = 'src/pdf-reader/engine'
const ENTRIES = ['pipeline', 'translate', 'rules', 'layer', 'view'] as const
const entryFile = (name: string) => `${ENGINE}/${name}.mjs`
const CONTRACT_FILE = new URL('./engine-contract.json', import.meta.url)

/** the layer gate's instrument loads these checkers by their address (lab/pdf/spikes/layer-gate/proto.mjs, hashed into every
 *  record): the engine's layer's, and v0's, which no reader carries (run.mjs checkInputs hands it what it reads) */
const GATE_NAMED = [`${ENGINE}/layer/check.mjs`, `${ENGINE}/layer-proto/check.mjs`]

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
      for (const line of statements) expect(/^export (?:\*|\{[^}]+\}) from '(?:\.\/[\w./-]+\.(?:mjs|ts)|@readarxiv\/engine)'$/.test(line), `${name}: ${line}`).toBe(true)
    }
  })

  it('give the layer the reader\'s door whole and the bundle\'s and the layout file\'s parsers it takes', async () => {
    const layer = await namesOf('layer')
    const door = await withCanvas(async () => Object.keys(await import('@/pdf-reader/engine/layer-proto/reader.mjs')).sort())
    // (the door whole, and beyond it BUNDLE 4's readers, keys and bounds, and the memory-class errors: names of format.mjs and memory.mjs)
    const format = Object.keys(await import('@/pdf-reader/engine/layer-proto/format.mjs'))
    // (and a left part's draw geometry: the reader's check, its decode to the layer's inputs and the fonts' key, names of draw.mjs)
    const draw = Object.keys(await import('@/pdf-reader/engine/layer-proto/draw.mjs'))
    expect(layer.filter(n => door.includes(n))).toEqual(door)
    expect(layer.filter(n => !door.includes(n) && !format.includes(n) && !draw.includes(n) && n !== 'isMemoryError')).toEqual([])
    for (const name of ['readUnitsChunk', 'readHead', 'indexOf', 'unitsOfChunks', 'readPart', 'readLeftPart', 'readCatalog', 'mergeParts', 'keyOf', 'keyParts', 'catalogKey', 'writeCatalog', 'isMemoryError', 'BUNDLE5', 'CTAG5', 'VTAG5', 'checkDraw', 'drawFontKey', 'drawInputsOf']) expect(layer, name).toContain(name)
    for (const name of ['writeUnitChunks', 'writeHead', 'writePart', 'writeLeftPart']) expect(layer, name).not.toContain(name)
    for (const name of ['openLayer', 'readBundle', 'BundleRefusal', 'BUNDLE', 'BUNDLE_CAP', 'BUNDLE_VALUES', 'VTAG', 'parseLayout', 'indexLayout']) expect(layer, name).toContain(name)
    for (const name of ['parseAddonManifest', 'ADDON_CAP', 'TAIL_CAP']) expect(layer, name).not.toContain(name)
  })

  it('give the server the bundle\'s writer and the translation the rows, and not the other way about', async () => {
    const pipeline = await namesOf('pipeline'), translate = await namesOf('translate')
    for (const name of ['openPaper', 'originalFiles', 'makeLayout', 'layoutMarksOfPaper', 'pageRules', 'checkBoxes', 'writeBundle', 'bundleUnitsOf', 'unpackSource', 'PDFJS', 'writeUnitChunks', 'writeHead', 'writePart', 'writeLeftPart', 'writeCatalog', 'partTarget', 'isMemoryError', 'BundleRefusal', 'drawDataOf', 'wireOf', 'DRAW_ITEMS']) expect(pipeline, name).toContain(name)
    for (const name of ['serialize', 'rehydrate', 'serializeTags', 'translateUnits', 'decideGroups', 'authorsTranslated', 'TRANSLATE_VERSION', 'rowOf', 'unitOf', 'layerRows', 'toTranslate', 'batchesOf', 'runRows']) expect(translate, name).toContain(name)
    // (the compile path stays out of the server's entry, and the layout maker and the front end out of the translation's)
    for (const name of ['runLive', 'translationFiles', 'strategiesFor', 'typesetting']) expect(pipeline, name).not.toContain(name)
    for (const name of ['makeLayout', 'openPaper', 'loadProject']) expect(translate, name).not.toContain(name)
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
  const closure = [...closureOf(ENTRIES.map(entryFile))] as string[]
  const core = (f: string) => (ENGINE_ALLOW as string[]).some(c => f === `${c}.ts` || f === `${c}/index.ts`)

  it('hold the engine\'s rule in every file of the closure of the entries: a relative path, a node: module or the rules\' validator, in every form', () => {
    const inEngine = closure.filter(f => f.startsWith(`${ENGINE}/`) && /\.(?:mjs|ts)$/.test(f))
    expect(inEngine.length).toBeGreaterThan(30)
    expect(engineViolations(inEngine)).toEqual([])
  })

  it('reach the core by the four allowed modules alone, each file of them naming modules by relative path only', () => {
    // (the front half moved into the engine package, reached through its transition paths, is the engine's own code)
    const outside = closure.filter(f => !f.startsWith(`${ENGINE}/`) && !f.startsWith('packages/engine/src/'))
    // (the entries reach three of the four: names.ts is the figures' and the extension's session's)
    expect(outside.every(core), outside.join(' ')).toBe(true)
    expect(outside.length).toBeGreaterThanOrEqual(2)
    for (const file of outside) {
      for (const { spec, display } of namedModulesOf(readFileSync(file, 'utf8')) as { spec: string | null; display?: string }[]) {
        expect(spec !== null && spec.startsWith('.'), `${file}: ${spec ?? display}`).toBe(true)
      }
    }
  })
})

describe('what the translation, the rules and the browser load', () => {
  // the server's modules: the front end and the files it reads, the compile path and the paper's pipeline, the layout maker,
  // the marks, the content walk the wrap reads (remove.mjs), the ownership and the wrap, and the pixel checker. The anchors and
  // the versions are the pipeline's too, and leaves that every reader takes
  const server = (f: string) => f.startsWith(`${ENGINE}/source/`)
    || /^packages\/engine\/src\/source\/(?:latex-front|paper-meta|paper-names)\.(?:mjs|ts)$/.test(f)
    || /^packages\/engine\/src\/(?:marks\/marks|own\/own|own\/stream)\.(?:mjs|ts)$/.test(f)
    || /^packages\/engine\/src\/(?:compile\/(?:live|tex-errors|tex|paper)|instrument\/instrument)\.(?:mjs|ts)$/.test(f)
    || (f.startsWith(`${ENGINE}/pipeline/`) && !/\/pipeline\/(?:anchors|versions|memory)\.mjs$/.test(f))
    || /\/layout\/(?:make|marks|paper|remove|wrap|own|carry|match|stream)\.mjs$/.test(f)
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
  /** the shared interface: the reader's chrome (its controller's fold among it, model.ts) and the control kit */
  const shared = tracked.filter(f => /^(?:packages\/reader\/src\/chrome|packages\/ui\/src)\//.test(f) && code(f))

  it('states no port anywhere in the closure of the five entries (the web\'s R21 detector)', () => {
    expect(portedInClosure(ENTRIES.map(entryFile))).toEqual([])
  })

  // What section 19.3 says the web carries with the engine and the shared interface is so, and the registry holds its rows
  it('has the notices the web carries: LaTeXML\'s table is in the closures of pipeline and layer, and the registry names LaTeXML, Lucide and Noto', () => {
    for (const name of ['pipeline', 'layer'] as const) expect([...closureOf([entryFile(name)])], name).toContain('packages/engine/src/source/latexml-args.ts')
    const registry = readFileSync('docs/THIRD_PARTY.md', 'utf8')
    for (const word of ['LaTeXML', 'Lucide', 'Noto Sans SC']) expect(registry, word).toContain(word)
    expect(shared).toContain('packages/ui/src/controls/Icon.tsx')
    expect(shared).toContain('packages/ui/src/controls/display-glyphs.ts')
    expect(shared).toContain('packages/reader/src/chrome/model.ts')
  })

  // The brief held the shared interface to the same empty closure, and it holds now: the four GPL-ported files it reached (the
  // language table, the configuration's prompt library and the providers' retry policy by the controller, Microsoft's by the
  // service menu) went with the chrome's move into packages/reader, its words the host's (parts.tsx) and the service menu the
  // extension's slot (src/pdf-reader/host/slots.tsx). The closure reaches nothing of the extension at all
  it('keeps the closure of packages/reader/src/chrome/** and packages/ui/src/** free of any ported file, and of the extension', () => {
    expect(shared.length).toBeGreaterThan(30)
    expect(portedInClosure(shared)).toEqual([])
    expect([...closureOf(shared)].filter((f: string) => f.startsWith('src/'))).toEqual([])
  })
})

// The front half moved from the engine into packages/engine: each old path re-exports its module through a transition path of
// the package (`@readarxiv/engine/today/<folder>/<file>`), a hole in the package's wall that only the old engine and the lab
// may use, until the cut-over deletes both
describe('the transition paths of the moved front half', () => {
  const manifest = JSON.parse(readFileSync('packages/engine/package.json', 'utf8')) as { exports: Record<string, string> }
  const paths = Object.entries(manifest.exports).filter(([k]) => k.startsWith('./today/'))
  const code = (f: string) => /\.(?:[cm]?[jt]sx?)$/.test(f) && !/\.d\.[cm]?ts$/.test(f)

  it('name each moved module one by one (no pattern), at its own place under the package\'s src/', () => {
    const tracked = new Set(trackedFiles())
    expect(paths.length).toBeGreaterThan(0)
    for (const [key, target] of paths) {
      expect(key, key).not.toContain('*')
      expect(target, key).toBe(`./src/${key.slice('./today/'.length)}`)
      expect(tracked.has(`packages/engine/${target.slice(2)}`), key).toBe(true)
    }
  })

  it('are imported by the old paths under src/pdf-reader/engine/ and the lab alone, each path one the package names', () => {
    const named = new Set(paths.map(([key]) => `@readarxiv/engine/today/${key.slice('./today/'.length)}`))
    const importers: string[] = [], strays: string[] = []
    for (const file of trackedFiles().filter(code)) {
      const text = readFileSync(file, 'utf8')
      if (!text.includes('@readarxiv/engine/today')) continue
      for (const { spec } of namedModulesOf(text) as { spec: string | null }[]) {
        if (spec === null || !spec.startsWith('@readarxiv/engine/today')) continue
        if (!named.has(spec) || !/^(?:src\/pdf-reader\/engine|lab)\//.test(file)) strays.push(`${file}: ${spec}`)
        else importers.push(file)
      }
    }
    expect(importers.filter(f => f.startsWith(`${ENGINE}/`)).length).toBeGreaterThan(0)
    expect(strays).toEqual([])
  })
})

describe('what nothing reaches', () => {
  it('is no module of the engine: each is reached by an entry, by the gate that names it, or by the shipped extension or the lab', () => {
    expect(engineFiles().length).toBeGreaterThan(60)
    expect(unreached(ENTRIES.map(entryFile), GATE_NAMED)).toEqual([])
  })
})
