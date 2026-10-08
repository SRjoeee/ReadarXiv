import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captionNames } from '@/pdf-reader/engine/caption-names.mjs'
import { rolesFor } from '@/pdf-reader/engine/font-roles.mjs'
import type { SourceUnit } from '@/pdf-reader/engine/latex-front.mjs'
import { type BundleParts, bundleUnitsOf, type ReadBundle, readBundle, STRING_MAX, writeBundle } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import { layerRows, type Row, rowOf, toTranslate, unitOf } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { REMOVAL } from '@/pdf-reader/engine/layout/addon-manifest.mjs'
import { LAYOUT, type LayoutFile, UNIT_KINDS } from '@/pdf-reader/engine/layout/file.mjs'
import { trPiecesOf } from '@/pdf-reader/engine/layer/pieces.mjs'
import { PDFJS } from '@/pdf-reader/engine/versions.mjs'

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
    schema: 1, layout: LAYOUT, pdfjs: PDFJS, paper: { id: '2610.00001', version: 1, pages: 2 }, left: '', views: [...VIEW, ...VIEW], fonts: ['F1'],
    units: file.map(s => [s.id, UNIT_KINDS.indexOf(s.kind as never), 9, 0, 1]),
    lines: file.map(s => [s.id, s.lines.flatMap(([p, x0, x1, b]) => [p, x0, x1, b, b + 7, b - 2, 10, 0])]),
    frames: file.map(s => [s.id, s.lines.flatMap(([p], j) => [p, 0, j, 1, j ? 0 : -1, 0])]),
    erase: file.map(s => [s.id, s.lines.flatMap(([, x0, x1, b], j) => [j, x0, b - 2, x1, b + 7])]),
    ph: [], labels: [], headings: [], pageText: [], held: [],
  } as never
}
/** the bundle's parts: the units, the left (the units v0's anchors hold), the layout file, the add-on */
function partsOf({ layout = true, addon = true } = {}): BundleParts {
  const tail = Uint8Array.from({ length: 64 }, (_, i) => (i * 37 + 11) & 255)
  return {
    paper: { id: '2610.00001', version: 1, pages: 2 },
    base: { bytes: 12_345, sha256: '0123456789abcdef'.repeat(4), url: '/api/v1/original/2610.00001v1' },
    image: '1',
    units: bundleUnitsOf(sourceUnits()),
    left: { kinds: SPECS.map(s => s.kind), pages: [VIEW, VIEW], units: SPECS.map((s, id) => [id, id, s.lines.map(rectOf)] as [number, number, [number, number, number, number, number][]]).filter(([id]) => SPECS[id]!.left) },
    layout: layout ? layoutOf() : null,
    addon: addon ? { manifest: { schema: 1, removal: REMOVAL, pages: 2, sets: {}, page: { 1: { ok: true }, 2: { ok: true } }, appended: tail.length, stats: { removed: 2 } } as never, tail } : null,
  }
}
const bundleOf = (o?: Parameters<typeof partsOf>[0]): ReadBundle => readBundle(writeBundle(partsOf(o)))
/** the composed document: two pages, each unit's lines in its text layer (Times, 10 pt); its pages given once `ready`
 *  resolves, where it is given */
function docOf(ready: Promise<unknown> | null = null) {
  const viewportOf = (scale: number) => ({ width: 300 * scale, height: H * scale, scale, transform: [scale, 0, 0, -scale, 0, H * scale], convertToViewportPoint: (x: number, y: number) => [x * scale, (H - y) * scale], convertToPdfPoint: (x: number, y: number) => [x / scale, H - y / scale] })
  const items = [1, 2].map(p => SPECS.flatMap(s => s.lines.filter(l => l[0] === p).map(([, x0, x1, b]) => ({ str: s.text, transform: [10, 0, 0, 10, x0, b], width: x1 - x0, height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false }))))
  const pageOf = (n: number) => ({ view: VIEW, getViewport: ({ scale }: { scale: number }) => viewportOf(scale), getTextContent: async () => ({ items: items[n - 1], styles: { f1: { fontFamily: 'serif', ascent: 0.7, descent: -0.2 } } }), render: () => ({ promise: Promise.resolve() }), commonObjs: { get: () => ({ name: 'Times-Roman' }) }, cleanup() {} })
  return { numPages: 2, getPage: async (n: number) => { await ready; return pageOf(n) } }
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
/** the sheets in the page but the one of the faces' classes the SVG text names (layer2.mjs faceClass), which every run of
 *  the page shares, each face's class made once */
const faceSheet = (e: HTMLStyleElement) => { const rules = [...(e.sheet?.cssRules ?? [])]; return rules.length > 0 && rules.every(r => /^\.axf\d+$/.test((r as CSSStyleRule).selectorText ?? '')) }
const styles = () => [...document.head.querySelectorAll('style')].filter(e => !faceSheet(e)).length

beforeEach(() => { seen.opens.length = 0; seen.runs.length = 0; seen.urls.length = 0; facesAsked.length = 0 })
type Run = Awaited<ReturnType<typeof import('@/pdf-reader/engine/layer-proto/run.mjs').openProto>>
/** openProto's options, as the door gave them */
type Opened = Parameters<typeof import('@/pdf-reader/engine/layer-proto/run.mjs').openProto>[0]
afterEach(() => { vi.restoreAllMocks() })

describe('the reader\'s door: two readers\' hosts are the same calls', () => {
  it('opens v0 with the bundle\'s left, layout and add-on, the target\'s units and cells\' groups, L7\'s labels, the served faces and hyphenation, at 2.5 and dpr 1', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const bundle = bundleOf(), doc = docOf()
    const layer = await openLayer({ bundle, doc, target: 'zh', faceSources, hyphUrl })
    const o = seen.opens.at(-1) as unknown as Opened
    expect(o.doc).toBe(doc)
    expect(o.geometry).toEqual({ schema: 1, kinds: bundle.left.kinds, left: { pages: bundle.left.pages, units: bundle.left.units } })
    expect(o.units).toEqual([])
    expect(o.expect).toEqual(toTranslate(bundle, 'zh'))
    expect(o.groups).toEqual(new Map([[4, '0:h'], [5, '0:c0'], [6, '0:c0']]))
    expect(o.target).toBe('zh')
    expect([o.scale, o.dpr, o.copy, o.pages]).toEqual([2.5, 1, false, Number.POSITIVE_INFINITY])
    expect(o.tex).toMatchObject({ use: 'lines', texOnly: true, symbols: 'text', extents: 'v0' })
    expect(o.tex?.index.file).toEqual(bundle.layout)
    expect(o.tex?.pieces).toEqual(new Map())
    // (v0's removal reads no OPS: none is passed, and none asked of the host)
    expect(o.removal).toEqual({ mode: 'draw', doc, manifest: bundle.addon!.manifest })
    expect(o.labels).toEqual({ names: captionNames('zh'), captions: { figure: 'target', table: 'target' } })
    expect(o.faceSources).toBe(faceSources)
    expect(o.hyphUrl).toBe(hyphUrl)
    expect(o.params).toBeUndefined()
    layer.dispose()
    // a bundle the maker and the remover refused: v0 from the left alone, every unit erased and put back
    const bare = bundleOf({ layout: false, addon: false })
    const plain = await openLayer({ bundle: bare, doc, target: 'de', faceSources, hyphUrl })
    const p = seen.opens.at(-1) as unknown as Opened
    expect([p.tex, p.removal]).toEqual([null, null])
    expect(p.labels).toEqual({ names: captionNames('de'), captions: { figure: 'target', table: 'target' } })
    plain.dispose()
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
      tex: { use: 'lines', texOnly: true, symbols: 'text', extents: 'v0', index: (await import('@/pdf-reader/engine/layout/file.mjs')).indexLayout(bundle.layout!), pieces: pieces as never },
      removal: { mode: 'draw', doc: docOf(), manifest: bundle.addon!.manifest },
      labels: { names: captionNames('zh'), captions: { figure: 'target', table: 'target' } },
    })
    await whole.until(2)
    const want = whole.rows.map(r => r.svg.outerHTML)
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
    // (each page done let go once it is asked for, a page never before: as the gate asks for its pages)
    pages.push(await layer.pageOf(1, { lang: 'zh-Hans' }))
    expect(run.rows.map(r => !!r.released)).toEqual([true, false])
    pages.push(await layer.pageOf(2, { lang: 'zh-Hans' }))
    expect(run.rows.map(r => !!r.released)).toEqual([true, true])
    expect(await fed).toEqual([1, 2])
    pages.forEach((pg, i) => {
      expect(pg.svg).toBeInstanceOf(SVGSVGElement)
      expect([pg.w, pg.h, pg.svg.getAttribute('width'), pg.svg.getAttribute('height')]).toEqual([750, 750, '750', '750'])
      expect(pg.svg.getAttribute('lang')).toBe('zh-Hans')
      const markup = pg.svg.cloneNode(true) as SVGSVGElement
      markup.removeAttribute('lang')
      expect(markup.outerHTML).toBe(want[i])
    })
    // (the same element each time it is asked)
    expect((await layer.pageOf(1, { lang: 'zh-Hans' })).svg).toBe(pages[0]!.svg)
    const source = document.createElement('canvas')
    source.width = 1500
    source.height = 1500
    const copy = await layer.copyOf(2, source, 5)
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
    expect(s).toMatchObject({ units: toTranslate(bundle, 'zh').length, drawn: whole.stats.length, pages: [1, 2], dropped: 0, rules: { schema: 1, version: 1 } })
    expect(Object.keys(s.pageMs)).toEqual(['1', '2'])
    expect(s.slowestTaskMs).toBeGreaterThanOrEqual(0)
    layer.dispose()
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
      expect(firstFaceOf(t)).toBe(rolesFor(t, 'times').cjk!.body)
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
    expect(() => layer.take([...hostile, ...rows])).not.toThrow()
    layer.end()
    expect(layer.stats().dropped).toBe(5)
    await layer.pageOf(2, { lang: 'zh' })
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
    await expect(layer.pageOf(2, { lang: 'zh' })).rejects.toThrow(/let go/)
    const source = document.createElement('canvas')
    source.width = 10
    source.height = 10
    await expect(layer.copyOf(1, source, 2.5)).rejects.toThrow(/let go/)
    expect(layer.take(rowsOf(bundle))).toEqual({ complete: [] })
    expect(layer.stats().rules).toEqual({ schema: 1, version: 1 })
    expect(layer.unitAt(1, 100, 262)).toBe(0)
  })

  it('a page under way when the run is let go: its canvases go once it ends, and nothing is laid after', async () => {
    const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const bundle = bundleOf(), rows = rowsOf(bundle)
    const units: unknown[] = []
    for (const r of rows) units[r[0]] = unitOf(bundle, r)
    let go = () => {}
    const ready = new Promise(ok => { go = () => ok(null) })
    const run = await openProto({ doc: docOf(ready), geometry: { schema: 1, kinds: bundle.left.kinds, left: { pages: bundle.left.pages, units: bundle.left.units } } as never, units: units as never, target: 'zh', scale: 2.5, dpr: 1, copy: true, faceSources, hyphUrl })
    const before = styles()
    // (its first page asked for and not given yet: let go while it is drawn)
    const under = run.until(2)
    await tick()
    run.dispose()
    go()
    await under
    await tick()
    expect(styles()).toBe(before - 1)
    expect(run.rows.every(r => r.released && !r.base && r.left.width === 0 && r.right!.width === 0)).toBe(true)
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
    const copy = layer.copyOf(1, source, 2.5)
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
    const run = await openProto({ doc: docOf(), geometry: { schema: 1, kinds: bundle.left.kinds, left: { pages: bundle.left.pages, units: bundle.left.units } } as never, units: units as never, target: 'zh', scale: 2.5, dpr: 1, copy: false, faceSources, hyphUrl })
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
    expect(await late(layer.copyOf(1, source, 2.5))).toBeInstanceOf(HTMLCanvasElement)
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

describe('the door reaches no server-only module', () => {
  it('walks every module reader.mjs imports and re-exports: none of the server\'s, no node: specifier, no package', () => {
    const SERVER = ['live.mjs', 'layout/remove.mjs', 'layout/addon.mjs', 'layout/make.mjs', 'layout/marks.mjs', 'layout/carry.mjs', 'layer/check.mjs'].map(f => resolve('src/pdf-reader/engine', f))
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
    const seenFiles = new Set<string>(), others = new Set<string>(), dynamic: string[] = [], awaiting: string[] = []
    const todo = [resolve('src/pdf-reader/engine/layer-proto/reader.mjs')]
    while (todo.length) {
      const f = todo.pop()!
      if (seenFiles.has(f)) continue
      seenFiles.add(f)
      const text = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      for (const m of text.matchAll(SPEC)) {
        const spec = m[1]!
        if (spec.startsWith('.') || spec.startsWith('@/')) todo.push(fileOf(f, spec))
        else others.add(spec)
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
    expect([...others]).toEqual([])
    // (the walk reaches what it should: the run, the rows, the bundle, the translation)
    for (const f of ['layer-proto/run.mjs', 'layer-proto/rows.mjs', 'layer-proto/bundle.mjs', 'mt.mjs', 'layer-proto/check.mjs']) expect(seenFiles.has(resolve('src/pdf-reader/engine', f)), f).toBe(true)
  })

  it('exports what the hosts take, and not the role table\'s or v0\'s own calls', async () => {
    const door = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    expect(Object.keys(door).sort()).toEqual([
      'ADDON_CAP', 'ADDON_MANIFEST_CAP', 'ADDON_MANIFEST_VALUES', 'BUNDLE', 'BUNDLE_CAP', 'BUNDLE_VALUES', 'BundleRefusal', 'CTAG', 'FACES', 'LAYOUT', 'LAYOUT_CAP', 'LAYOUT_VALUES', 'LayoutRefusal', 'PDF_OPTIONS', 'VTAG',
      'batchesOf', 'bundleKey', 'firstFaceOf', 'indexLayout', 'layerRows', 'openLayer', 'parseAddonManifest', 'parseLayout', 'readBundle', 'rowOf', 'runRows', 'toTranslate', 'trPiecesOf', 'translateUnits', 'unitOf',
    ].sort())
  })
})
