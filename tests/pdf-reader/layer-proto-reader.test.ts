import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rolesFor } from '@/pdf-reader/engine/rules/font-roles.mjs'
import type { SourceUnit } from '@/pdf-reader/engine/source/latex-front.mjs'
import { type BundleParts, bundleUnitsOf, type ReadBundle, readBundle, STRING_MAX, writeBundle } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import { layerRows, type Row, rowOf, toTranslate, unitOf } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { withGroups } from './helpers/groups'
import { indexLayout, LAYOUT, LAYOUT_SCHEMA, type LayoutFile, UNIT_KINDS } from '@/pdf-reader/engine/layout/file.mjs'
import { trPiecesOf } from '@/pdf-reader/engine/layer/pieces.mjs'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'
import { TOGGLE_DEFAULTS } from '@/pdf-reader/engine/rules/content-classes.mjs'
import { PDFJS } from '@/pdf-reader/engine/pipeline/versions.mjs'

// The reader's door (layer-proto/reader.mjs, A2's E4): both readers open the instant layer through openLayer, over a
// paper's read bundle, the composed document and a target, and never write v0's host. Over a paper of this file's own
// making: two pages of a PDF.js document's shape (its text layer, its views; nothing drawn), its bundle written and read
// back by the engine, its rows made by the engine's own rows (rows.mjs layerRows), every face served whole. The pages'
// pixels are the layer gate's (--door, in a real browser); these are the calls and what they answer

/** the requests the runs made, and every openProto call's options (the door's host, as v0 is given it) */
const seen = vi.hoisted(() => {
  // a canvas context that draws nothing and reads a white page, made before layer2.mjs loads (it measures with a canvas
  // of its own made then): an em a CJK character, half one any other
  const ctxStub = (canvas?: { width: number; height: number }) => new Proxy({} as Record<string | symbol, unknown>, {
    get(t, k) {
      if (k in t) return t[k]
      if (k === 'measureText') return (s: string) => { const px = Number(/(\d+(?:\.\d+)?)px/.exec(String(t.font ?? ''))?.[1] ?? 10); return { width: [...s].reduce((w, ch) => w + (/[\u3000-\u9fff]/.test(ch) ? px : px / 2), 0), actualBoundingBoxAscent: 0.7 * px, actualBoundingBoxDescent: 0.2 * px } }
      if (k === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4).fill(255) })
      if (k === 'createImageData') return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4) })
      if (k === 'canvas') return canvas
      return () => {}
    },
    set(t, k, v) { t[k] = v; return true },
  })
  const g = globalThis as Record<string, unknown>
  g.OffscreenCanvas = class { width = 8; height = 8; getContext() { return ctxStub(this) } }
  ;(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = function (this: HTMLCanvasElement) { return ctxStub(this) }
  g.FontFace = class { family: string; constructor(family: string) { this.family = family } load() { return Promise.resolve(this) } }
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add() {}, delete() {}, load: async () => [], check: () => true, ready: Promise.resolve() } })
  const out = { urls: [] as string[], opens: [] as Record<string, unknown>[], runs: [] as unknown[] }
  // (no hyphenation patterns: none is needed for these lines)
  g.fetch = async (url: string) => { out.urls.push(String(url)); return { ok: false, json: async () => null } }
  return out
})
vi.mock('@/pdf-reader/engine/layer-proto/run.mjs', async importOriginal => {
  const actual = await importOriginal<typeof import('@/pdf-reader/engine/layer-proto/run.mjs')>()
  return { ...actual, openProto: async (o: Parameters<typeof actual.openProto>[0]) => { seen.opens.push(o as never); const run = await actual.openProto(o); seen.runs.push(run); return run } }
})

const H = 300, VIEW: [number, number, number, number] = [0, 0, 300, H]
const CJK = (n: number, from = 0x4e00) => Array.from({ length: n }, (_, i) => String.fromCharCode(from + 7 * i)).join('')
/** a unit of the paper: its source text, its lines (page, x0, x1, baseline; 10 pt), where it is read from (the layout
 *  file, the left, or both), its table cell */
interface Spec { kind: string; text: string; lines: [number, number, number, number][]; file: boolean; left: boolean; cell?: { table: number; row: number; col: number; span: number; head: boolean } }
const cellAt = (row: number, head = false) => ({ table: 0, row, col: 0, span: 1, head })
const SPECS: Spec[] = [
  { kind: 'para', text: 'Alpha beta gamma', lines: [[1, 20, 280, 260]], file: true, left: true },
  { kind: 'author', text: 'Ann Author', lines: [[1, 20, 120, 240]], file: false, left: true },
  { kind: 'para', text: 'Delta epsilon zeta', lines: [[1, 20, 280, 200]], file: false, left: true },
  { kind: 'footnote', text: 'Eta', lines: [[1, 20, 60, 40]], file: true, left: true },
  { kind: 'cell', text: 'Model', lines: [[2, 20, 80, 260]], file: true, left: false, cell: cellAt(0, true) },
  { kind: 'cell', text: 'Ours', lines: [[2, 20, 80, 240]], file: true, left: false, cell: cellAt(1) },
  { kind: 'cell', text: 'Base', lines: [[2, 20, 80, 220]], file: true, left: false, cell: cellAt(2) },
  { kind: 'para', text: 'Theta iota kappa', lines: [[2, 20, 280, 120]], file: true, left: true },
]
const rectOf = ([p, x0, x1, b]: [number, number, number, number]): [number, number, number, number, number] => [p, x0, b - 2.15, x1, b + 6.83]

/** the paper's source units, as openPaper gives them */
const sourceUnits = (): { units: SourceUnit[]; kept: Set<SourceUnit> } => ({ units: SPECS.map(s => ({ kind: s.kind, pieces: [{ t: 'text', s: s.text }], ...(s.cell ? { cell: s.cell } : {}) }) as SourceUnit), kept: new Set() })
function layoutOf(): LayoutFile {
  const file = SPECS.map((s, id) => ({ ...s, id })).filter(s => s.file)
  return {
    schema: LAYOUT_SCHEMA, lineskip: null, layout: LAYOUT, pdfjs: PDFJS, paper: { id: '2610.00001', version: 1, pages: 2 }, left: '', views: [...VIEW, ...VIEW], fonts: ['F1'],
    units: file.map(s => [s.id, UNIT_KINDS.indexOf(s.kind as never), 9, 0, 1]),
    lines: file.map(s => [s.id, s.lines.flatMap(([p, x0, x1, b]) => [p, x0, x1, b, b + 7, b - 2, 10, 0])]),
    frames: file.map(s => [s.id, s.lines.flatMap(([p], j) => [p, 0, j, 1, j ? 0 : -1, 0])]),
    erase: file.map(s => [s.id, s.lines.flatMap(([, x0, x1, b], j) => [j, x0, b - 2, x1, b + 7])]),
    ph: [], labels: [], headings: [], pageText: [], held: [], names: [],
  } as never
}
/** the bundle's parts: the units, the left (the units v0's anchors hold), the layout file, its cell rules */
function partsOf({ layout = true, names = [] as string[] } = {}): BundleParts {
  return {
    paper: { id: '2610.00001', version: 1, pages: 2 },
    base: { bytes: 12_345, sha256: '0123456789abcdef'.repeat(4), url: '/api/v1/original/2610.00001v1' },
    image: '1',
    // (the paper's structural names, `names`, units of kind `name` after the source's: bundleUnitsOf)
    units: bundleUnitsOf({ ...sourceUnits(), names }),
    left: { kinds: [...SPECS.map(s => s.kind), ...names.map(() => 'name')], pages: [VIEW, VIEW], units: SPECS.map((s, id) => [id, id, s.lines.map(rectOf)] as [number, number, [number, number, number, number, number][]]).filter(([id]) => SPECS[id]!.left) },
    layout: layout ? layoutOf() : null,
    rules: layout ? { 2: [20, 250, 80, 250.4] } : null,
  }
}
const bundleOf = (o?: Parameters<typeof partsOf>[0]): ReadBundle => readBundle(writeBundle(partsOf(o)))
/** the composed document: two pages, each unit's lines in its text layer (Times, 10 pt); its pages given once `ready`
 *  resolves, where it is given */
function docOf(ready: Promise<unknown> | null = null) {
  const viewportOf = (scale: number) => ({ width: 300 * scale, height: H * scale, scale, transform: [scale, 0, 0, -scale, 0, H * scale], convertToViewportPoint: (x: number, y: number) => [x * scale, (H - y) * scale], convertToPdfPoint: (x: number, y: number) => [x / scale, H - y / scale] })
  const items = [1, 2].map(p => SPECS.flatMap(s => s.lines.filter(l => l[0] === p).map(([, x0, x1, b]) => ({ str: s.text, transform: [10, 0, 0, 10, x0, b], width: x1 - x0, height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false }))))
  const pageOf = (n: number) => ({ view: VIEW, getViewport: ({ scale }: { scale: number }) => viewportOf(scale), getTextContent: async () => ({ items: items[n - 1], styles: { f1: { fontFamily: 'serif', ascent: 0.7, descent: -0.2 } } }), render: () => ({ promise: Promise.resolve() }), commonObjs: { get: () => ({ name: 'Times-Roman' }) }, cleanup() {}, getAnnotations: async () => [{ subtype: 'Link', rect: [270, 2, 290, 12], url: `https://example.org/p${n}`, overlaidText: '', borderStyle: { width: 0, style: 1 }, color: null }] })
  return withGroups({ numPages: 2, getPage: async (n: number) => { await ready; return pageOf(n) } })
}
/** every face served whole, one slice over every code point; the faces asked, in turn */
const facesAsked: string[] = []
const faceSources = async (id: string) => { facesAsked.push(id); return [{ url: `/f/${id}.otf`, ranges: [0, 0x10ffff] }] }
const hyphUrl = (lang: string) => `/hyph/${lang}.json`
/** the rows of the paper's translation into Chinese, by the engine's own rows: each unit's text translated whole */
function rowsOf(bundle: ReadBundle, tr: (id: number) => string = id => CJK(4, 0x4e00 + 16 * id)) {
  const results = new Map(toTranslate(bundle, 'zh').map(id => [id, { state: 'whole', by: 'test', pieces: [{ t: 'text', tr: true, s: tr(id) }] }]))
  return layerRows(bundle, results, 'zh').rows
}
const tick = () => new Promise(ok => setTimeout(ok, 0))
/** the units file's pieces of the units a run is given (the translated units'), which the layout file locates a unit by */
const piecesOfUnits = (units: unknown[]) => new Map(units.flatMap((u, id) => { const x = u as { pieces?: unknown[]; state?: string } | undefined; return x?.pieces && (x.state === 'whole' || x.state === 'partial') ? [[id, trPiecesOf(x.pieces as never, (p: unknown) => (p as { k: number }).k)] as const] : [] }))
/** the sheets in the page but the one of the faces' classes the SVG text names (layer2.mjs faceClass), which every run of
 *  the page shares, each face's class made once */
const faceSheet = (e: HTMLStyleElement) => { const rules = [...(e.sheet?.cssRules ?? [])]; return rules.length > 0 && rules.every(r => /^\.axf[0-9a-z-]+$/.test((r as CSSStyleRule).selectorText ?? '')) }
const styles = () => [...document.head.querySelectorAll('style')].filter(e => !faceSheet(e)).length

beforeEach(() => { seen.opens.length = 0; seen.runs.length = 0; seen.urls.length = 0; facesAsked.length = 0 })
type Run = Awaited<ReturnType<typeof import('@/pdf-reader/engine/layer-proto/run.mjs').openProto>>
/** openProto's options, as the door gave them */
type Opened = Parameters<typeof import('@/pdf-reader/engine/layer-proto/run.mjs').openProto>[0]
afterEach(() => { vi.restoreAllMocks() })

describe('the reader\'s door: two readers\' hosts are the same calls', () => {
  it('awaits the units its toggles show: a class turned off is the original\'s, and a toggle that is none is refused', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const bundle = bundleOf(), doc = docOf()
    const all = toTranslate(bundle, 'zh')
    for (const [classes, want] of [[{ names: true }, all], [{ tables: false }, all.filter(id => id !== 1 && bundle.units[id]?.[0] !== 'cell')]] as const) {
      const layer = await openLayer({ bundle, doc, target: 'zh', faceSources, hyphUrl, classes })
      expect((seen.opens.at(-1) as unknown as Opened).expect).toEqual(want)
      layer.dispose()
    }
    await expect(openLayer({ bundle, doc, target: 'zh', faceSources, hyphUrl, classes: { margins: true } } as never)).rejects.toThrow(/classes/)
  })

  it('draws the figures\' text translated where the toggle `figures` is on, as it is by default, and the original\'s where it is off', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const bundle = bundleOf(), doc = docOf()
    for (const [classes, shown] of [[null, true], [{ figures: true }, true], [{ figures: false }, false], [{ tables: false }, true]] as const) {
      const layer = await openLayer({ bundle, doc, target: 'zh', faceSources, hyphUrl, classes })
      expect((seen.opens.at(-1) as unknown as { hiding: { figuresShown: boolean } }).hiding.figuresShown).toBe(shown)
      layer.dispose()
    }
  })

  it('refuses a light index (M24): the layer needs the units\' bodies', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const light = { kind: 'index', light: true, sha256: 'a'.repeat(64), head: { paper: { pages: 1 } }, units: [], kinds: [], pieces: new Uint32Array(0), dropped: [], records: {} }
    await expect(openLayer({ index: light, doc: docOf(), target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: () => {} } as never)).rejects.toThrow(/light index/)
  })

  it('opens v0 with the bundle\'s left, layout and cell rules, the target\'s units and cells\' groups, L7\'s labels, the served faces and hyphenation, at 2.5 and dpr 1', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const bundle = bundleOf(), doc = docOf()
    const layer = await openLayer({ bundle, doc, target: 'zh', faceSources, hyphUrl })
    const o = seen.opens.at(-1) as unknown as Opened
    expect(o.doc).toBe(doc)
    expect(o.geometry).toEqual({ schema: 1, kinds: bundle.left.kinds, left: { pages: bundle.left.pages, units: bundle.left.units } })
    expect(o.units).toEqual([])
    // (the author block, unit 1, is the names toggle's, off where the reader has not turned it on: rules/content-classes.mjs
    // TOGGLE_DEFAULTS)
    expect(o.expect).toEqual(toTranslate(bundle, 'zh').filter(id => id !== 1))
    // (the run given the door's toggles resolved: none given, TOGGLE_DEFAULTS)
    expect(o.classes).toEqual(TOGGLE_DEFAULTS)
    expect(o.groups).toEqual(new Map([[4, '0:h'], [5, '0:c0'], [6, '0:c0']]))
    expect(o.target).toBe('zh')
    expect([o.scale, o.dpr, o.copy, o.pages]).toEqual([2.5, 1, false, Number.POSITIVE_INFINITY])
    expect(o.tex).toMatchObject({ symbols: 'text', extents: 'v0' })
    expect(o.tex?.index.file).toEqual(bundle.layout)
    expect(o.tex?.pieces).toEqual(new Map())
    // (what the file could not hide: none in a BUNDLE 3 file; its cell rules by page)
    expect([o.hiding?.unhidden?.(0), o.hiding?.labelKept?.(0), o.hiding?.rules?.(2), o.hiding?.rules?.(1)]).toEqual([null, false, [20, 250, 80, 250.4], undefined])
    // (the names of a float come from the rule set, given to the run whole: the built-in one where the host passes none)
    expect(o.labels).toEqual({ captions: { figure: 'target', table: 'target' } })
    expect(o.rules).toBe(BUILTIN_RULES)
    expect(o.faceSources).toBe(faceSources)
    expect(o.hyphUrl).toBe(hyphUrl)
    // (the door passes the rule set, never a parameter of its own)
    expect(Object.keys(o)).not.toContain('params')
    layer.dispose()
    // a bundle the maker refused: a layout file of no unit, so that every unit is the original's, and no cell rules
    const bare = bundleOf({ layout: false })
    const plain = await openLayer({ bundle: bare, doc, target: 'de', faceSources, hyphUrl })
    const p = seen.opens.at(-1) as unknown as Opened
    expect([p.tex.index.file.units, p.hiding?.rules?.(2)]).toEqual([[], undefined])
    expect(p.labels).toEqual({ captions: { figure: 'target', table: 'target' } })
    plain.dispose()
  })

  it('gives the run the toggles it was opened with, which leaves a class they hide the original\'s however its rows come', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const bundle = bundleOf(), doc = docOf()
    const layer = await openLayer({ bundle, doc, target: 'zh', faceSources, hyphUrl, classes: { names: true, references: true } })
    expect((seen.opens.at(-1) as unknown as Opened).classes).toEqual({ ...TOGGLE_DEFAULTS, names: true, references: true })
    layer.dispose()
  })

  it("with no layout file nothing is drawn: every unit is the original's, one with a citation or a text symbol alike (the layer draws only from the file)", async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const bundle = bundleOf({ layout: false }), rows = rowsOf(bundle)
    const layer = await openLayer({ bundle, doc: docOf(), target: 'zh', faceSources, hyphUrl })
    layer.take(rows)
    layer.end()
    const run = seen.runs.at(-1) as Run
    await run.until(2)
    expect(run.placed).toEqual([])
    expect(run.stats).toEqual([])
    expect(run.skipped.length).toBeGreaterThan(0)
    expect(run.skipped.every(k => k.why === 'unanchored' || k.why === 'author' || k.why.startsWith('group'))).toBe(true)
    layer.dispose()
  })

  it('refuses a rule set that is none with a TypeError of its own, before it takes the page\'s one open, like the door\'s other arguments', async () => {
    const { firstFaceOf, openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const o = { bundle: bundleOf(), doc: docOf(), target: 'zh', faceSources, hyphUrl }
    for (const rules of [null, 7, 'set', true, [], {}, { schema: 1 }, { ...structuredClone(BUILTIN_RULES), languages: null }, { ...structuredClone(BUILTIN_RULES), scripts: 3 }]) {
      const refused = { name: 'TypeError', message: expect.stringMatching(/^rules: a rule set \(readRules's\), not /) }
      await expect(openLayer({ ...o, rules } as never), JSON.stringify(rules)).rejects.toMatchObject(refused)
      expect(() => firstFaceOf('zh', rules as never), JSON.stringify(rules)).toThrow(expect.objectContaining(refused))
    }
    // (no open was begun by any of them: the next, with a set, is the page's one)
    const layer = await openLayer({ ...o, rules: structuredClone(BUILTIN_RULES) })
    layer.dispose()
  })

  it('opens v0 with the rule set a host passes, and says which in its stats; the built-in one where it passes none', async () => {
    const { firstFaceOf, openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const set = structuredClone(BUILTIN_RULES) as unknown as { version: number; scripts: Record<string, { leadBase: number; cjkFaces: { group: string } }> }
    set.version = 8
    set.scripts.Hans!.leadBase = 1.5
    set.scripts.Hans!.cjkFaces.group = 'shs-k'
    const layer = await openLayer({ bundle: bundleOf(), doc: docOf(), target: 'zh', faceSources, hyphUrl, rules: set as never })
    const o = seen.opens.at(-1) as unknown as Opened
    expect(o.rules).toBe(set)
    expect(layer.stats().rules).toEqual({ schema: 8, version: 8 })
    // (the face asked first is the set's: Korean's group for Chinese, which the built-in set does not say)
    expect(facesAsked[0]).toBe('shs-k-regular')
    expect(firstFaceOf('zh', set as never)).toBe('shs-k-regular')
    expect(firstFaceOf('zh')).toBe('shs-sc-regular')
    layer.dispose()
    const built = await openLayer({ bundle: bundleOf(), doc: docOf(), target: 'zh', faceSources, hyphUrl })
    expect(built.stats().rules).toEqual({ schema: 8, version: BUILTIN_RULES.version })
    built.dispose()
  })

  it('draws, with its rows taken in parts as they come, the pages one open over every unit draws: pageOf\'s SVG, copyOf\'s canvas, unitAt, stats', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const bundle = bundleOf(), rows = rowsOf(bundle)
    // the gate's way: every unit at once (v0's units as the rows make them), the hybrid's pieces given, the same choices
    const units: unknown[] = []
    const pieces = new Map<number, unknown>()
    for (const r of rows) { const u = unitOf(bundle, r)!; units[r[0]] = u; if (u.pieces && (u.state === 'whole' || u.state === 'partial')) pieces.set(r[0], trPiecesOf(u.pieces, (p: unknown) => (p as { k: number }).k)) }
    const whole = await openProto({
      doc: docOf(), geometry: { schema: 1, kinds: bundle.left.kinds, left: { pages: bundle.left.pages, units: bundle.left.units } } as never, units: units as never, target: 'zh',
      pages: Number.POSITIVE_INFINITY, scale: 2.5, dpr: 1, copy: false, faceSources, hyphUrl,
      tex: { symbols: 'text', extents: 'v0', index: (await import('@/pdf-reader/engine/layout/file.mjs')).indexLayout(bundle.layout!), pieces: pieces as never },
      
      labels: { captions: { figure: 'target', table: 'target' } },
    })
    await whole.until(2)
    const want = whole.rows.map((_, i) => whole.svgOf(i + 1).outerHTML)
    expect(whole.stats.length).toBeGreaterThan(4)
    whole.dispose()

    const layer = await openLayer({ bundle, doc: docOf(), target: 'zh', faceSources, hyphUrl })
    // the rows two a part, a macrotask apart, beside the pages asked for
    const fed = (async () => {
      const complete: number[] = []
      for (let i = 0; i < rows.length; i += 2) { await tick(); complete.push(...layer.take(rows.slice(i, i + 2)).complete) }
      await tick()
      layer.end()
      return complete
    })()
    const run = seen.runs.at(-1) as Run
    const pages = []
    // (each page let go of by the run once it is laid, whoever asks: nothing held of it but its record, its analysis state and
    // its units' own gone, no element of it kept; no host releases a page, so it stays a page a crop may be cut from)
    expect(run.held()).toEqual({ free: true, records: false, shelf: false })
    pages.push(await layer.pageOf(1, { lang: 'zh-Hans' }))
    expect(run.held(1)).toEqual({ state: [], units: [], reads: 0 })
    pages.push(await layer.pageOf(2, { lang: 'zh-Hans' }))
    expect([1, 2].map(p => run.held(p))).toEqual([1, 2].map(() => ({ state: [], units: [], reads: 0 })))
    expect(run.rows.map(r => [Object.keys(r).includes('svg'), r.base, !!r.released])).toEqual([[false, true, false], [false, true, false]])
    // (the pages complete in no order the pages have, each exactly once: the set of the pages told, sorted)
    expect((await fed).sort()).toEqual([1, 2])
    pages.forEach((pg, i) => {
      expect(pg.svg).toBeInstanceOf(SVGSVGElement)
      expect([pg.w, pg.h, pg.svg.getAttribute('width'), pg.svg.getAttribute('height')]).toEqual([750, 750, '750', '750'])
      expect(pg.svg.getAttribute('lang')).toBe('zh-Hans')
      const markup = pg.svg.cloneNode(true) as SVGSVGElement
      markup.removeAttribute('lang')
      expect(markup.outerHTML).toBe(want[i])
    })
    // (a new element of the same markup each time it is asked)
    const again = await layer.pageOf(1, { lang: 'zh-Hans' })
    expect(again.svg).not.toBe(pages[0]!.svg)
    expect(again.svg.outerHTML).toBe(pages[0]!.svg.outerHTML)
    // (the word table: a copy of the page's record, new arrays on every ask)
    expect(again.words.tokens.n).toBe(again.words.word.length)
    expect(again.words).toEqual(pages[0]!.words)
    expect(again.words.word).not.toBe(pages[0]!.words.word)
    // (the links: a copy of the page's kept records, new objects on every ask; the margin's link with no glyph under it stays in place)
    expect(again.links).toEqual([{ boxes: [270, 2, 290, 12], url: 'https://example.org/p1', name: '', moved: false, order: 0 }])
    expect(again.links).toEqual(pages[0]!.links)
    expect(again.links[0]).not.toBe(pages[0]!.links[0])
    expect(layer.stats().links).toMatchObject({ total: 2, inPlace: 2, moved: 0, unsupported: 0, unread: 0 })
    const source = document.createElement('canvas')
    source.width = 1500
    source.height = 1500
    const copy = await layer.copyOf(2, { k: 5, width: source.width, height: source.height })
    expect(copy).toBeInstanceOf(HTMLCanvasElement)
    expect(copy).not.toBe(source)
    expect([copy.width, copy.height]).toEqual([1500, 1500])
    // the unit at a point: the left's shapes, the smallest where two hold it; none off them, nor of a unit only the
    // layout file holds (the table's cells), nor on a page that is not one
    expect(layer.unitAt(1, 100, 262)).toBe(0)
    expect(layer.unitAt(1, 100, 202)).toBe(2)
    expect(layer.unitAt(1, 100, 230)).toBeNull()
    expect(layer.unitAt(2, 50, 262)).toBeNull()
    expect(layer.unitAt(3, 100, 262)).toBeNull()
    expect(layer.unitAt(1, Number.NaN, 262)).toBeNull()
    const s = layer.stats()
    expect(s).toMatchObject({ units: toTranslate(bundle, 'zh').filter(id => bundle.units[id]?.[0] !== 'author').length, drawn: whole.stats.length, pages: [1, 2], dropped: 0, rules: { schema: 8, version: BUILTIN_RULES.version } })
    expect(Object.keys(s.pageMs)).toEqual(['1', '2'])
    expect(s.slowestTaskMs).toBeGreaterThanOrEqual(0)
    layer.dispose()
  })

  it('a paper\'s structural names (units of kind `name`, after the source\'s): no page awaits one, and its row is the run\'s word for the name, neither placed nor skipped nor late (PDF-READER §19.14)', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const bundle = bundleOf({ names: ['Assumption'] }), rows = rowsOf(bundle), id = SPECS.length
    expect([bundle.units[id]?.[0], bundle.left.kinds[id]]).toEqual(['name', 'name'])
    const name = rows.find(r => r[0] === id)!
    expect(name).toBeTruthy()
    const layer = await openLayer({ bundle, doc: docOf(), target: 'zh', faceSources, hyphUrl })
    const o = seen.opens.at(-1) as unknown as Opened
    expect(o.expect).not.toContain(id)
    // (every page complete with the source's rows alone)
    expect(layer.take(rows.filter(r => r !== name)).complete.sort()).toEqual([1, 2])
    layer.take([name])
    layer.end()
    const run = seen.runs.at(-1) as Run
    await run.until(2)
    expect(run.placed.map(p => p.id)).not.toContain(id)
    expect(run.skipped.map(k => k.id)).not.toContain(id)
    expect(run.late()).not.toContain(id)
    expect(layer.stats()).toMatchObject({ units: SPECS.filter(sp => sp.kind !== 'author').length, dropped: 0 })
    layer.dispose()
    // (a run a host opens with the name among the units it awaits, as the gate may: it awaits it neither, the geometry's kind
    // saying what it is)
    const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const direct = await openProto({ ...o, expect: [...(o.expect ?? []), id], onStep: () => {} } as never)
    expect(direct.take(new Map(rows.filter(r => r !== name).map(r => [r[0], unitOf(bundle, r)!]))).complete.sort()).toEqual([1, 2])
    direct.take(new Map([[id, unitOf(bundle, name)!]]))
    expect(direct.late()).not.toContain(id)
    direct.dispose()
  })

  it('the unit at a point is the smallest shape that holds it, where two do', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const parts = partsOf()
    // (unit 3, the footnote, given a second shape inside the paragraph's: the point in both is the footnote's)
    parts.left.units = parts.left.units.map(([id, st, rects]) => (id === 3 ? [id, st, [...rects, [1, 90, 258, 110, 265]]] : [id, st, rects]))
    const layer = await openLayer({ bundle: readBundle(writeBundle(parts)), doc: docOf(), target: 'zh', faceSources, hyphUrl })
    expect(layer.unitAt(1, 100, 262)).toBe(3)
    expect(layer.unitAt(1, 150, 262)).toBe(0)
    layer.dispose()
  })

  it('asks for the face firstFaceOf names first, at the open: the target\'s CJK body beside the family v0 opens with', async () => {
    const { firstFaceOf, openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    for (const t of ['zh', 'zh-TW', 'ja', 'ko']) {
      facesAsked.length = 0
      expect(firstFaceOf(t)).toBe(rolesFor(t, 'times', resolveRules(BUILTIN_RULES, t).cjkFaces).cjk!.body)
      const layer = await openLayer({ bundle: bundleOf(), doc: docOf(), target: t, faceSources, hyphUrl })
      expect(facesAsked[0]).toBe(firstFaceOf(t))
      layer.dispose()
    }
    expect(['zh', 'zh-TW', 'ja', 'ko', 'de', 'fr', 'es', 'ru'].map(t => firstFaceOf(t))).toEqual(['shs-sc-regular', 'shs-tc-regular', 'haranoaji-regular', 'shs-k-regular', null, null, null, null])
  })

  it('takes every row there is a unit of, and skips and counts the rest: an id the bundle has not, a unit it dropped, a row of no shape', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    // (unit 2's kind is not a kind: the bundle reader drops it, null at its index)
    const json = JSON.parse(new TextDecoder().decode(writeBundle(partsOf())))
    json.units[2][0] = 'Para'
    const bundle = readBundle(new TextEncoder().encode(JSON.stringify(json)))
    expect(bundle.dropped).toEqual([2])
    const layer = await openLayer({ bundle, doc: docOf(), target: 'zh', faceSources, hyphUrl })
    const rows = rowsOf(bundle)
    const hostile = [[99, ['x'], 'whole', null, null], [2, ['x'], 'whole', null, null], 'a row', null, [0, [7], 'whole', null, null]] as unknown as Row[]
    expect(() => layer.take(hostile)).not.toThrow()
    // (each dropped row by the unit it names, the run's code `rowUnfit`: unit 0's names its piece 7, past its source's pieces;
    // a row of no id is counted alone)
    expect(layer.stats()).toMatchObject({ dropped: 5, droppedRows: [[0, 'rowUnfit'], [2, 'rowUnfit'], [99, 'rowUnfit']] })
    expect(() => layer.take(rows)).not.toThrow()
    layer.end()
    expect(layer.stats().dropped).toBe(5)
    // (a later row that fits takes its unit out: unit 0 is laid from its own)
    expect(layer.stats().droppedRows).toEqual([[2, 'rowUnfit'], [99, 'rowUnfit']])
    await layer.pageOf(2, { lang: 'zh' })
    // (page 2 laid by its closure alone: no unit of it runs on from page 1, so page 1 is drawn first and laid only when asked)
    expect(layer.stats().pages).toEqual([2])
    await layer.pageOf(1, { lang: 'zh' })
    expect(layer.stats().pages).toEqual([1, 2])
    expect(layer.stats().drawn).toBeGreaterThan(3)
    layer.dispose()
  })

  it('a hostile string is text: a translation of markup and a bidirectional override is drawn as the SVG\'s text, in no element of its own', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const bundle = bundleOf()
    const evil = '<img src=x onerror=alert(1)>\u202e'
    const layer = await openLayer({ bundle, doc: docOf(), target: 'zh', faceSources, hyphUrl })
    layer.take(rowsOf(bundle, id => (id === 0 ? evil : CJK(4, 0x4e00 + 16 * id))))
    layer.end()
    const { svg } = await layer.pageOf(1, { lang: 'zh' })
    const names = new Set([...svg.querySelectorAll('*')].map(e => e.localName))
    expect([...names].every(n => ['g', 'text', 'tspan'].includes(n))).toBe(true)
    expect(names.has('tspan')).toBe(true)
    expect(svg.querySelector('img')).toBeNull()
    expect(svg.querySelector('[data-u="0"]')?.textContent).toContain('<img src=x onerror=alert(1)>')
    // (written into the SVG's markup escaped: the markup holds no tag of the translation's)
    expect(svg.innerHTML).toContain('&lt;img ')
    expect(svg.innerHTML).toContain('onerror=alert(1)&gt;')
    expect(svg.innerHTML).not.toContain('<img')
    layer.dispose()
  })

  it('dispose leaves no sheet: the one the run inserted removed, the pages\' canvases let go, nothing answered after but stats and unitAt', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const before = styles()
    const bundle = bundleOf()
    const layer = await openLayer({ bundle, doc: docOf(), target: 'zh', faceSources, hyphUrl })
    expect(styles()).toBe(before + 1)
    layer.take(rowsOf(bundle))
    layer.end()
    await layer.pageOf(1, { lang: 'zh' })
    layer.dispose()
    layer.dispose()
    expect(styles()).toBe(before)
    // (the faces' classes stay, for the page's other runs)
    expect([...document.head.querySelectorAll('style')].some(faceSheet)).toBe(true)
    // (the door's calls after dispose throw at once, but take, stats and unitAt)
    expect(() => layer.pageOf(2, { lang: 'zh' })).toThrow(/let go/)
    expect(() => layer.pageState(1)).toThrow(/let go/)
    const source = document.createElement('canvas')
    source.width = 10
    source.height = 10
    expect(() => layer.copyOf(1, { k: 2.5, width: source.width, height: source.height })).toThrow(/let go/)
    expect(layer.take(rowsOf(bundle))).toEqual({ complete: [] })
    expect(layer.stats().rules).toEqual({ schema: 8, version: BUILTIN_RULES.version })
    expect(layer.unitAt(1, 100, 262)).toBe(0)
  })

  it('a page under way when the run is let go: its canvases go once it ends, and nothing is laid after', async () => {
    const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const bundle = bundleOf(), rows = rowsOf(bundle)
    const units: unknown[] = []
    for (const r of rows) units[r[0]] = unitOf(bundle, r)
    let go = () => {}
    const ready = new Promise(ok => { go = () => ok(null) })
    const run = await openProto({ doc: docOf(ready), geometry: { schema: 1, kinds: bundle.left.kinds, left: { pages: bundle.left.pages, units: bundle.left.units } } as never, units: units as never, target: 'zh', scale: 2.5, dpr: 1, copy: true, tex: { index: indexLayout(bundle.layout!), pieces: piecesOfUnits(units) as never }, faceSources, hyphUrl })
    const before = styles()
    // (its first page asked for and not given yet: let go while it is drawn)
    const under = run.until(2)
    await tick()
    run.dispose()
    go()
    await under
    await tick()
    expect(styles()).toBe(before - 1)
    expect(run.rows.every(r => r.released && !r.base && r.left!.width === 0 && r.right!.width === 0)).toBe(true)
    expect(run.stats).toEqual([])
  })

  it("copyOf let go while it draws gives no canvas, as nothing is given after dispose", async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const bundle = bundleOf()
    const layer = await openLayer({ bundle, doc: docOf(), target: 'zh', faceSources, hyphUrl })
    layer.take(rowsOf(bundle))
    layer.end()
    await layer.pageOf(1, { lang: 'zh' })
    // (the run's drawing of the copy held until the layer is let go)
    const run = seen.runs.at(-1) as Run & { drawCopy: (...a: unknown[]) => Promise<void> }
    const draw = run.drawCopy
    let go = () => {}
    const held = new Promise<void>(ok => { go = ok })
    run.drawCopy = async (...a: unknown[]) => { await held; return draw(...a) }
    const source = document.createElement('canvas')
    source.width = 10
    source.height = 10
    const copy = layer.copyOf(1, { k: 2.5, width: source.width, height: source.height })
    await tick()
    layer.dispose()
    go()
    await expect(copy).rejects.toThrow(/let go/)
  })

  it('a run let go during the yield before a unit lays that unit neither', async () => {
    const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const bundle = bundleOf(), rows = rowsOf(bundle)
    const units: unknown[] = []
    for (const r of rows) units[r[0]] = unitOf(bundle, r)
    const run = await openProto({ doc: docOf(), geometry: { schema: 1, kinds: bundle.left.kinds, left: { pages: bundle.left.pages, units: bundle.left.units } } as never, units: units as never, target: 'zh', scale: 2.5, dpr: 1, copy: false, tex: { index: indexLayout(bundle.layout!), pieces: piecesOfUnits(units) as never }, faceSources, hyphUrl })
    // (the host's dispose in the yield v0 makes before the first unit it lays: not those its faces' warming makes)
    let yields = 0
    const g = globalThis as { scheduler?: unknown }
    g.scheduler = { yield: () => { if (!/warmFaces/.test(new Error().stack ?? '') && yields++ === 0) run.dispose(); return new Promise(ok => setTimeout(ok, 0)) } }
    try { await run.until(2) } finally { delete g.scheduler }
    expect(yields).toBe(1)
    expect(run.order).toEqual([])
    expect(run.stats).toEqual([])
  })

  it('one open layer a page: a second open before the first is let go is refused, one after it opens, and a failed open frees the page', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const o = () => ({ bundle: bundleOf(), doc: docOf(), target: 'zh', faceSources, hyphUrl })
    const first = await openLayer(o())
    await expect(openLayer(o())).rejects.toThrow(/one open layer a page/)
    first.dispose()
    // (two opens at once: the first open's, the second refused)
    const [a, b] = await Promise.allSettled([openLayer(o()), openLayer(o())])
    expect([a.status, b.status]).toEqual(['fulfilled', 'rejected'])
    ;(a as PromiseFulfilledResult<Awaited<ReturnType<typeof openLayer>>>).value.dispose()
    // (an open v0 refuses, its left's units no list: the page is free again)
    const bad = bundleOf()
    await expect(openLayer({ ...o(), bundle: { ...bad, left: { ...bad.left, units: null as never } } })).rejects.toThrow(TypeError)
    const again = await openLayer(o())
    again.dispose()
  })

  it('pageOf and copyOf of a page done already wait for no other page being laid (a zoom on page 1 while page 2 waits for its rows)', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const bundle = bundleOf(), rows = rowsOf(bundle)
    const layer = await openLayer({ bundle, doc: docOf(), target: 'zh', faceSources, hyphUrl })
    // (page 1's units' rows alone: page 1 laid, page 2 waits)
    layer.take(rows.filter(r => r[0] <= 3))
    await layer.pageOf(1, { lang: 'zh' })
    let second = false
    const p2 = layer.pageOf(2, { lang: 'zh' }).then(() => { second = true })
    await tick()
    await tick()
    expect(second).toBe(false)
    const source = document.createElement('canvas')
    source.width = 750
    source.height = 750
    const late = <T,>(p: Promise<T>) => Promise.race([p, new Promise<string>(ok => setTimeout(() => ok('waited'), 300))])
    expect(await late(layer.copyOf(1, { k: 2.5, width: source.width, height: source.height }))).toBeInstanceOf(HTMLCanvasElement)
    expect(await late(layer.pageOf(1, { lang: 'zh' }).then(r => r.svg))).toBeInstanceOf(SVGSVGElement)
    expect(second).toBe(false)
    layer.take(rows.filter(r => r[0] > 3))
    layer.end()
    await p2
    expect(second).toBe(true)
    layer.dispose()
  })

  it('one string bound: the bundle\'s STRING_MAX, 16,000 code units, is the rows\' too', () => {
    expect(STRING_MAX).toBe(16_000)
    const bundle = bundleOf()
    const row = (n: number) => rowOf(bundle, 0, { state: 'whole', pieces: [{ t: 'text', tr: true, s: 'x'.repeat(n) }] })
    expect(row(STRING_MAX)[2]).toBe('whole')
    expect(row(STRING_MAX + 1)[2]).toBe('none')
  })
})

describe("the original's canvas with no copy kept (openProto copy: false): read once for the page's ink, then let go", () => {
  // the reader's memory: a host that jumps to page p lays pages 1 to p before it is done with any, and each page's original
  // is a canvas of 12.5 MB on A4. With no copy nothing reads it but the ink map (drawCopy takes the page from the host), so
  // it goes as the page is drawn, not when the host releases the page
  /** v0 over the paper as the door opens it, every unit at once, the copy kept or not */
  const open = async (copy: boolean, rules?: unknown) => {
    const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const bundle = bundleOf(), rows = rowsOf(bundle)
    const units: unknown[] = []
    const pieces = new Map<number, unknown>()
    for (const r of rows) { const u = unitOf(bundle, r)!; units[r[0]] = u; if (u.pieces && (u.state === 'whole' || u.state === 'partial')) pieces.set(r[0], trPiecesOf(u.pieces, (p: unknown) => (p as { k: number }).k)) }
    return openProto({
      doc: docOf(), geometry: { schema: 1, kinds: bundle.left.kinds, left: { pages: bundle.left.pages, units: bundle.left.units } } as never, units: units as never, target: 'zh',
      pages: Number.POSITIVE_INFINITY, scale: 2.5, dpr: 1, copy, faceSources, hyphUrl, ...(rules ? { rules: rules as never } : {}),
      tex: { symbols: 'text', extents: 'v0', index: indexLayout(bundle.layout!), pieces: pieces as never },
      
      labels: { captions: { figure: 'target', table: 'target' } },
    })
  }
  const drawing = (run: Run) => run.rows.map((r, i) => ({ svg: run.svgOf(i + 1).outerHTML, ops: JSON.stringify(r.ops) }))

  it('lets each canvas go before the host is done with the page, keeps base and released as they were, and draws what the same open with a copy draws', async () => {
    const kept = await open(true)
    await kept.until(2)
    const want = drawing(kept)
    // (a drawing worth comparing: text set on both pages, units' groups hidden)
    expect(want.every(w => w.svg.includes('<tspan') && w.ops.includes('"hidden"'))).toBe(true)
    // (a copy kept, as the gate and the lab open: the original whole until the page is released)
    expect(kept.rows.map(r => [r.left!.width, r.left!.height, r.right!.width])).toEqual([[750, 750, 750], [750, 750, 750]])
    expect(kept.rows.map(r => [r.base, !!r.released])).toEqual([[true, false], [true, false]])
    kept.dispose()

    const run = await open(false)
    const canvases = run.rows.map(r => r.left!)
    expect(canvases.every(c => c instanceof HTMLCanvasElement)).toBe(true)
    await run.until(2)
    // (both pages laid, none released: the canvas gone, its reference dropped, the page still drawn for a crop)
    expect(run.rows.map(r => r.left)).toEqual([null, null])
    expect(canvases.map(c => [c.width, c.height])).toEqual([[0, 0], [0, 0]])
    expect(run.rows.map(r => [r.base, !!r.released])).toEqual([[true, false], [true, false]])
    expect(drawing(run)).toEqual(want)
    // (the host is done: released once, again, and the run let go after: nothing reads a canvas that is not there)
    run.release(1)
    run.release(1)
    run.release(2)
    expect(run.rows.map(r => [r.base, r.released])).toEqual([[false, true], [false, true]])
    run.dispose()
    run.dispose()
    expect(run.rows.map(r => r.left)).toEqual([null, null])
  })

  it("reads the page's ink from the canvas while it is whole, on every page, whatever the rules say of borrowing", async () => {
    const g = globalThis as unknown as { OffscreenCanvas: new () => { getContext(...a: unknown[]): unknown } }
    const Real = g.OffscreenCanvas
    const reads: number[] = []
    // (what inkMapOf draws from: the page's canvas, its width read as it is drawn)
    g.OffscreenCanvas = class extends Real {
      override getContext(...a: unknown[]) {
        const ctx = super.getContext(...a) as object
        return new Proxy(ctx, { get: (t, k) => (k === 'drawImage' ? (src: { width: number }) => { reads.push(src.width) } : Reflect.get(t, k)) })
      }
    }
    try {
      for (const borrow of [1, 0]) {
        reads.length = 0
        const rules = structuredClone(BUILTIN_RULES) as unknown as { scripts: Record<string, { borrow: number }> }
        rules.scripts.Hans!.borrow = borrow
        const run = await open(false, rules)
        expect(run.P.borrow).toBe(borrow)
        await run.until(2)
        expect(reads).toEqual([750, 750])
        expect(run.rows.map(r => r.left)).toEqual([null, null])
        run.dispose()
      }
    } finally { g.OffscreenCanvas = Real }
  })

  it('a jump through the door holds no canvas on the way, and every call after it (the same page, an earlier one, a copy, the end) is safe', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const bundle = bundleOf()
    const layer = await openLayer({ bundle, doc: docOf(), target: 'zh', faceSources, hyphUrl })
    layer.take(rowsOf(bundle))
    layer.end()
    const run = seen.runs.at(-1) as Run
    const canvases = run.rows.map(r => r.left!)
    // (page 2 asked for first: page 1 is drawn first, page 2's closure, and its canvas never outlives its ink)
    const jump = await layer.pageOf(2, { lang: 'zh' })
    expect(canvases.map(c => c.width)).toEqual([0, 0])
    // (page 2 let go of by the run once laid, still drawn for a crop: no host's release; page 1, drawn and not laid (a side
    // page: its units are laid with its own closure), keeps what its laying reads until then: it is never drawn twice, M1)
    expect(run.rows.map(r => [r.left, r.base, r.released])).toEqual([[null, true, undefined], [null, true, undefined]])
    expect([1, 2].map(p => run.ready(p))).toEqual([false, true])
    expect(run.held(1).state).toEqual(['chars', 'ink', 'laid'])
    expect(run.held(2).state).toEqual([])
    expect((await layer.pageOf(2, { lang: 'zh' })).svg.outerHTML).toBe(jump.svg.outerHTML)
    const one = (await layer.pageOf(1, { lang: 'zh' })).svg
    one.removeAttribute('lang')
    expect(one.outerHTML).toBe(run.svgOf(1).outerHTML)
    // (and let go of once its own closure is laid, M2)
    expect([1, 2].map(p => run.held(p).state)).toEqual([[], []])
    const source = document.createElement('canvas')
    source.width = 750
    source.height = 750
    expect((await layer.copyOf(1, { k: 2.5, width: source.width, height: source.height })).width).toBe(750)
    layer.dispose()
    layer.dispose()
  })
})

describe('the door reaches no server-only module', () => {
  it('walks every module reader.mjs imports and re-exports: none of the server\'s, no node: specifier, no package but zod, in rules/ alone', () => {
    const SERVER = ['pipeline/live.mjs', 'layout/remove.mjs', 'layout/addon.mjs', 'layout/make.mjs', 'layout/marks.mjs', 'layout/carry.mjs', 'layer/check.mjs'].map(f => resolve('src/pdf-reader/engine', f))
    // (static import and export … from, relative and the repository's @/ alias; a module of the alias is TypeScript)
    const SPEC = /(?:^|[\n;])\s*(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g
    // (any import( of code: a literal's or a computed specifier's)
    const DYNAMIC = /\bimport\s*\(/g
    const TOP_AWAIT = /^(?:(?:export\s+)?(?:const|let|var)\s[^=\n]*=\s*)?(?:\(\s*)?await\b.*$/gm
    const fileOf = (from: string, spec: string) => {
      const base = spec.startsWith('@/') ? resolve('src', spec.slice(2)) : resolve(dirname(from), spec)
      for (const f of [base, `${base}.ts`, join(base, 'index.ts')]) { try { readFileSync(f); return f } catch {} }
      throw new Error(`${from}: ${spec} resolves to no file`)
    }
    const seenFiles = new Set<string>(), others = new Map<string, string[]>(), dynamic: string[] = [], awaiting: string[] = []
    const todo = [resolve('src/pdf-reader/engine/layer-proto/reader.mjs')]
    while (todo.length) {
      const f = todo.pop()!
      if (seenFiles.has(f)) continue
      seenFiles.add(f)
      const text = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      for (const m of text.matchAll(SPEC)) {
        const spec = m[1]!
        if (spec.startsWith('.') || spec.startsWith('@/')) todo.push(fileOf(f, spec))
        else others.set(spec, [...(others.get(spec) ?? []), f])
      }
      for (const m of text.matchAll(DYNAMIC)) dynamic.push(`${f}|${text.slice(m.index, m.index + 40)}`)
      // (a statement at the column of the module's own: `await …`, `const x = await …`)
      for (const m of text.matchAll(TOP_AWAIT)) awaiting.push(`${f}|${m[0].trim().slice(0, 60)}`)
    }
    // (no module of the walk loads another at run time, nor awaits at its top level)
    expect(dynamic).toEqual([])
    expect(awaiting).toEqual([])
    expect(seenFiles.size).toBeGreaterThan(20)
    for (const f of SERVER) expect(seenFiles.has(f), f).toBe(false)
    // (the layout rules' validator is the one package the door's closure holds, imported by the rules' module and by none
    // other: the rest of the engine takes the rules' answers, never the schema)
    expect([...others.keys()]).toEqual(['zod/mini'])
    expect(others.get('zod/mini')!.map(f => f.slice(resolve('src/pdf-reader/engine').length + 1))).toEqual(['rules/layout.mjs'])
    // (the walk reaches what it should: the run, the rows, the bundle, the translation)
    for (const f of ['layer-proto/run.mjs', 'layer-proto/rows.mjs', 'layer-proto/bundle.mjs', 'translate/mt.mjs', 'layer-proto/check.mjs']) expect(seenFiles.has(resolve('src/pdf-reader/engine', f)), f).toBe(true)
  })

  it('exports what the hosts take, and not the role table\'s or v0\'s own calls', async () => {
    const door = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    expect(Object.keys(door).sort()).toEqual([
      'BUNDLE', 'BUNDLE_CAP', 'BUNDLE_VALUES', 'BundleRefusal', 'CTAG', 'DRAWS_HELD', 'DROPPED_ROWS', 'FACES', 'LAYOUT', 'LAYOUT_CAP', 'LAYOUT_VALUES', 'LayoutRefusal', 'PDF_OPTIONS', 'SKIP_CODES', 'VTAG',
      'batchesOf', 'bundleKey', 'firstFaceOf', 'indexLayout', 'layerRows', 'openLayer', 'parseLayout', 'readBundle', 'rowOf', 'runRows', 'toTranslate', 'trPiecesOf', 'translateUnits', 'unitOf',
    ].sort())
  })
})
