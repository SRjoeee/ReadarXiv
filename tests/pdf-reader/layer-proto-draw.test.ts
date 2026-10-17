import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { checkDraw, type Draw } from '@/pdf-reader/engine/layer-proto/draw.mjs'
import { layoutFacade } from '@/pdf-reader/engine/layer-proto/facade.mjs'
import type { LayerIndex, ReadPart } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { layerRows, sourceUnitsOf, toTranslate } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { REMOVAL } from '@/pdf-reader/engine/layout/addon-manifest.mjs'
import type { TextContentLike } from '@/pdf-reader/engine/layer-proto/run.mjs'
import { drawDataOf } from '@/pdf-reader/engine/pipeline/draw-data.mjs'
import { CJK, cutSpec, groupsOfIndex, H, type PaperSpec, unitsOfRows, VIEW } from './helpers/parts-paper'

// E-C's browser part (ec-browser-design.md): a page drawn from its draw geometry (run.mjs openProto `drawOf`), the door's
// hand-off of the draw its left part carries, against the same run reading every page live. A page from data reads no text,
// annotation or pixel of PDF.js's; its pixels are read (X) where a step reads its ink: the page asked, a lay that borrows
// below on it, a crop cut from it, a name put back on it, a paint on it (deferred until the page is laid). Each drawing is
// the live run's, whatever the order the pages are asked in

/** a canvas context that draws nothing and reads a white page */
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
beforeAll(() => {
  g.OffscreenCanvas = class { width = 8; height = 8; getContext() { return ctxStub(this) } }
  ;(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = function (this: HTMLCanvasElement) { return ctxStub(this) }
  g.FontFace = class { family: string; constructor(family: string) { this.family = family } load() { return Promise.resolve(this) } }
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add() {}, delete() {}, load: async () => [], check: () => true, ready: Promise.resolve() } })
  g.fetch = async () => ({ ok: false, json: async () => null })
})
afterEach(() => { delete g.scheduler })

/** a test's switch: every font key a draw's inputs give made one (two fonts under one key, which no content key gives) */
const keys = vi.hoisted(() => ({ one: false }))
vi.mock('@/pdf-reader/engine/layer-proto/draw.mjs', async importOriginal => {
  const actual = await importOriginal<typeof import('@/pdf-reader/engine/layer-proto/draw.mjs')>()
  const drawInputsOf = (d: Draw) => {
    const x = actual.drawInputsOf(d)
    if (!keys.one) return x
    return { ...x, items: x.items.map(it => ({ ...it, fontName: it.fontName === null ? null : 'axt-draw-one' })), fonts: new Map([['axt-draw-one', [...x.fonts.values()][0]!]]), styles: { 'axt-draw-one': Object.values(x.styles)[0]! } }
  }
  return { ...actual, drawInputsOf }
})

// ---------------------------------------------------------------- the paper, its PDF.js pages counted, its draws
const para = (text: string, page: number, b: number, o: Partial<PaperSpec['units'][number]> = {}) => ({ kind: 'para', text, lines: [[page, 20, 280, b]] as [number, number, number, number][], file: true, stream: null, ...o })
/** three pages: a paragraph running from page 1 on to page 2 (translated long, so that it borrows the room below its lines and
 *  reads their pages' ink), one from page 2 on to page 3 (short: it reads no ink, and is painted on page 3) */
const SPEC: PaperSpec = {
  pages: 3,
  units: [
    para('Alpha beta gamma delta', 1, 260, { stream: 0 }),
    { ...para('Running from one on to two', 1, 40, { stream: 5 }), lines: [[1, 20, 280, 40], [2, 20, 280, 270]] },
    para('Second page body text', 2, 200, { stream: 21 }),
    { ...para('Running from two on to three', 2, 40, { stream: 30 }), lines: [[2, 20, 280, 40], [3, 20, 280, 270]] },
    para('Third page body text', 3, 200, { stream: 45 }),
  ],
}
/** the translation's length of each unit, in CJK characters (4 where not said) */
const LONG = new Map([[1, 80]])

const FONT = { name: 'NimbusRomNo9L-Regu', isType3Font: false, missingFile: false, toUnicode: { _map: [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'] } }
type Counts = Record<'text' | 'annots' | 'render', number[]>
/** the paper's documents (one: no tails), each page's PDF.js calls counted; a page's text items and Link annotations as docsOf
 *  makes them, its font a Times with its map */
function docsOf(spec: PaperSpec) {
  const N = spec.pages
  const counts: Counts = { text: Array(N + 1).fill(0), annots: Array(N + 1).fill(0), render: Array(N + 1).fill(0) }
  const viewportOf = (scale: number) => ({ width: 300 * scale, height: H * scale, scale, transform: [scale, 0, 0, -scale, 0, H * scale], convertToViewportPoint: (x: number, y: number) => [x * scale, (H - y) * scale], convertToPdfPoint: (x: number, y: number) => [x / scale, H - y / scale] })
  const items = (p: number) => spec.units.flatMap(u => u.lines.filter(l => l[0] === p).map(([, x0, x1, b]) => ({ str: u.text, transform: [10, 0, 0, 10, x0, b], width: x1 - x0, height: 10, fontName: 'g_d0_f1', dir: 'ltr', hasEOL: false })))
  const annotationsOf = (p: number) => {
    const out: Record<string, unknown>[] = []
    spec.units.forEach((u, id) => {
      const l = u.lines.find(x => x[0] === p)
      if (!l) return
      const [, x0, , b] = l
      out.push({ subtype: 'Link', rect: [x0 + 1, b - 2, x0 + 40, b + 8], dest: id % 2 ? [{ num: 10 + id, gen: 0 }, { name: 'XYZ' }, 72, 700, null] : `cite.${id}`, overlaidText: u.text.slice(0, 3), borderStyle: { width: 0, style: 1 }, color: new Uint8ClampedArray([0, 255, 0]) })
    })
    out.push({ subtype: 'Link', rect: [270, 2, 290, 12], url: `https://example.org/p${p}`, overlaidText: '', borderStyle: { width: 0, style: 1 }, color: null })
    return out
  }
  const pageOf = (n: number) => ({
    view: VIEW, rotate: 0, getViewport: ({ scale }: { scale: number }) => viewportOf(scale),
    getTextContent: async () => { counts.text[n]!++; return { items: items(n), styles: { g_d0_f1: { fontFamily: 'serif', ascent: 0.7, descent: -0.2 } } } },
    render: () => { counts.render[n]!++; return { promise: Promise.resolve() } },
    commonObjs: { get: (name: string) => { if (name !== 'g_d0_f1') throw new Error(`${name} not resolved`); return FONT } },
    cleanup() {}, getAnnotations: async () => { counts.annots[n]!++; return annotationsOf(n) },
  })
  const doc = { numPages: N, getPage: async (n: number) => pageOf(n) }
  /** each page's draw, as the server reads it (pipeline/draw-data.mjs) and a left part carries it (checked JSON) */
  const draws = async () => {
    const out: (Draw | null)[] = []
    for (let p = 1; p <= N; p++) { const { draw } = await drawDataOf(pageOf(p)); out.push(draw === null ? null : checkDraw(JSON.parse(JSON.stringify(draw)))) }
    return out
  }
  return { doc, counts, draws, pageOf }
}

const HYBRID = { use: 'lines', texOnly: true, symbols: 'text', extents: 'v0' } as const
const LABELS = { captions: { figure: 'target', table: 'target' } }
type Run = Awaited<ReturnType<typeof import('@/pdf-reader/engine/layer-proto/run.mjs').openProto>>
/** the rows of the translation: each unit's text translated whole, LONG's longer */
function rowsOf(index: LayerIndex) {
  const results = new Map(toTranslate(index, 'zh').map(id => [id, { state: 'whole', by: 'test', pieces: [{ t: 'text', tr: true, s: CJK(LONG.get(id) ?? 4, 0x4e00 + 16 * id) }, ...(sourceUnitsOf(index)[id]!.pieces.slice(1).filter(p => (p as { t: string }).t === 'ph'))] }]))
  return layerRows(index, results, 'zh').rows
}
/** what a run drew: each page's operations, SVG, words and links (a ready page's), its units' records and why each unit left is left */
const drawing = (run: Run) => ({
  pages: run.rows.map((r, i) => (r ? { ops: JSON.stringify(r.ops), svg: run.svgOf(i + 1).innerHTML, ...(run.ready(i + 1) ? { words: JSON.stringify(run.wordsOf(i + 1), (_, v) => (ArrayBuffer.isView(v) ? Array.from(v as Float32Array) : v)), links: JSON.stringify(run.linksOf(i + 1)) } : {}) } : null)),
  stats: run.stats.map(({ ms: _, ...r }) => r),
  skipped: run.skipped.map(s => `${s.id}:${s.why}`).sort(),
})

/** the run over the paper, every part told at the open, its rows taken and ended, the pages asked for in `order` (each laid by
 *  its closure, layFor): with `drawOf`, each page's draw handed over once a page */
async function runOf(P: { index: LayerIndex; parts: ReadPart[] }, doc: unknown, order: number[], drawOf?: (page: number) => Promise<Draw | null>, o: { copy?: boolean } = {}) {
  const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
  const facade = layoutFacade(P.index.head)
  const N = SPEC.pages
  const asked: number[] = []
  const run = await openProto({
    parts: true, proof: true, doc, geometry: { schema: 1, kinds: P.index.kinds.map(k => k ?? ''), left: { pages: [], units: [] } } as never, units: [], expect: toTranslate(P.index, 'zh'), groups: groupsOfIndex(P.index),
    target: 'zh', pages: N, scale: 1, dpr: 1, copy: o.copy ?? false, free: true, records: true, labels: LABELS as never,
    tex: { ...HYBRID, index: facade.index, pieces: new Map() }, removal: { mode: 'draw', doc, manifest: { schema: 1, removal: REMOVAL, pages: N, sets: {}, page: {} } as never },
    ...(drawOf ? { drawOf: (p: number) => { asked.push(p); return drawOf(p) } } : {}),
  } as never)
  for (const part of P.parts) { facade.add(part); run.grow(part) }
  run.endParts()
  run.take(unitsOfRows(P.index, rowsOf(P.index)) as never)
  run.end()
  for (const p of order) await run.layFor(p)
  return { run, asked }
}

async function paper() {
  const c = await cutSpec(SPEC)
  return { index: c.index, parts: c.parts }
}
const ORDERS = [[1, 2, 3], [3, 2, 1], [2, 1, 3]]

describe('a page drawn from its draw geometry', () => {
  it('draws every page as the run that reads every page live, in every order the pages are asked in', async () => {
    const P = await paper()
    const want = new Map<string, ReturnType<typeof drawing>>()
    for (const order of ORDERS) {
      const live = docsOf(SPEC)
      want.set(order.join(), drawing((await runOf(P, live.doc, order)).run))
      const data = docsOf(SPEC)
      const D = await docsOf(SPEC).draws()
      expect(D.every(d => d !== null)).toBe(true)
      const { run, asked } = await runOf(P, data.doc, order, async p => D[p - 1]!)
      expect(drawing(run), order.join()).toEqual(want.get(order.join()))
      // (each page's draw asked for once)
      expect(asked.slice().sort(), order.join()).toEqual([1, 2, 3])
      // (no text, annotation read of PDF.js's on a page from data; each page's pixels read once at most)
      expect(data.counts.text.slice(1), order.join()).toEqual([0, 0, 0])
      expect(data.counts.annots.slice(1), order.join()).toEqual([0, 0, 0])
      expect(data.counts.render.slice(1).every(n => n <= 1), order.join()).toBe(true)
      const st = run.drawStats!
      expect(st.data.slice().sort()).toEqual([1, 2, 3])
      expect(st.live).toEqual([])
    }
    // (the drawings asked in any order are one drawing: S3)
    const [a, ...rest] = [...want.values()]
    for (const b of rest) expect({ pages: b.pages, stats: b.stats, skipped: b.skipped }).toEqual({ pages: a!.pages, stats: a!.stats, skipped: a!.skipped })
  })

  it('a page asked first reads its own pixels and those of the pages a step reads the ink of, and paints a page it does not read later', async () => {
    const P = await paper()
    const data = docsOf(SPEC)
    const D = await docsOf(SPEC).draws()
    const { run } = await runOf(P, data.doc, [2], async p => D[p - 1]!)
    expect(run.ready(2)).toBe(true)
    const st = run.drawStats!
    // (page 2 asked; page 1's ink read by the long paragraph's lay, which borrows below its lines there: laid again once read)
    expect(st.pixels).toEqual({ 1: 'freeFor', 2: 'asked' })
    expect(st.retries).toBeGreaterThan(0)
    expect(data.counts.render.slice(1)).toEqual([1, 1, 0])
    // (page 3's part of the paragraph running on to it is not painted until page 3 is laid: no pixels of it read)
    expect(run.ready(3)).toBe(false)
    expect(run.rows[2]!.ops).toEqual([])
    await run.layFor(3)
    expect(run.ready(3)).toBe(true)
    expect(data.counts.render.slice(1)).toEqual([1, 1, 1])
    expect(run.drawStats!.pixels).toEqual({ 1: 'freeFor', 2: 'asked', 3: 'asked' })
  })

  it('reads a page live where its draw is none, the ask throws or the draw is refused, every other page from data', async () => {
    const P = await paper()
    const live = docsOf(SPEC)
    const want = drawing((await runOf(P, live.doc, [1, 2, 3])).run)
    const data = docsOf(SPEC)
    const D = await docsOf(SPEC).draws()
    const { run } = await runOf(P, data.doc, [1, 2, 3], async p => {
      if (p === 2) return null
      if (p === 3) throw new Error('the left part did not come')
      return D[p - 1]!
    })
    expect(drawing(run)).toEqual(want)
    expect(data.counts.text.slice(1)).toEqual([0, 1, 1])
    expect(data.counts.annots.slice(1)).toEqual([0, 1, 1])
    expect(run.drawStats!.data).toEqual([1])
    expect(run.drawStats!.live.slice().sort()).toEqual([2, 3])
  })

  it('reads a page live whose draw does not come within DRAW_WAIT_MS of its drawing (a fetch that does not settle)', async () => {
    const P = await paper()
    const live = docsOf(SPEC)
    const want = drawing((await runOf(P, live.doc, [1, 2, 3])).run)
    const data = docsOf(SPEC)
    const D = await docsOf(SPEC).draws()
    const t0 = performance.now()
    const { run } = await runOf(P, data.doc, [1, 2, 3], p => (p === 2 ? new Promise<Draw | null>(() => {}) : Promise.resolve(D[p - 1]!)))
    const { DRAW_WAIT_MS } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    expect(performance.now() - t0).toBeGreaterThanOrEqual(DRAW_WAIT_MS - 50)
    expect(drawing(run)).toEqual(want)
    expect(run.drawStats!.late).toEqual([2])
    expect(run.drawStats!.live).toEqual([2])
    expect(data.counts.text.slice(1)).toEqual([0, 1, 0])
  })

  it('without drawOf, and with the checker\'s copy, reads every page as today', async () => {
    const P = await paper()
    const data = docsOf(SPEC)
    const { run } = await runOf(P, data.doc, [1, 2, 3])
    expect(run.drawStats).toBeNull()
    expect(data.counts.text.slice(1)).toEqual([1, 1, 1])
    expect(data.counts.render.slice(1)).toEqual([1, 1, 1])
    // (a copy kept, the checker's, reads every page's pixels as it is drawn: the draws are not asked for)
    const copied = docsOf(SPEC)
    const D = await docsOf(SPEC).draws()
    const { run: kept, asked } = await runOf(P, copied.doc, [1, 2, 3], async p => D[p - 1]!, { copy: true })
    expect(kept.drawStats).toBeNull()
    expect(asked).toEqual([])
    expect(copied.counts.text.slice(1)).toEqual([1, 1, 1])
  })
})

describe('NeedPixels', () => {
  it('is what an ink read of a page drawn from data with no pixels yet throws, never an undefined map', async () => {
    const { NeedPixels } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const e = new NeedPixels(3, 'freeFor')
    expect(e).toBeInstanceOf(Error)
    expect([e.name, e.page, e.why]).toEqual(['NeedPixels', 3, 'freeFor'])
  })
})

describe('fontReaders: a page\'s fonts read live or from its draw, the same answers', () => {
  const item = (str: string, fontName: string | null, o: Record<string, unknown> = {}) => ({ str, dir: 'ltr', transform: [10, 0, 0, 10, 72, 700], width: 6 * Math.max(1, [...str].length), height: 10, fontName, hasEOL: false, ...o })
  const font = (o: Record<string, unknown> = {}) => ({ name: 'CMR10', isType3Font: false, missingFile: false, toUnicode: { _map: [...'abcdefxyz'] }, ...o })
  function pageOf(o: { items: unknown[]; styles?: Record<string, unknown>; fonts?: Record<string, unknown>; annots?: unknown[]; rotate?: number }) {
    return {
      rotate: o.rotate ?? 0,
      getTextContent: async () => ({ items: o.items, styles: o.styles ?? {} }),
      getAnnotations: async () => o.annots ?? [],
      commonObjs: { get: (n: string) => { if (!o.fonts || !(n in o.fonts)) throw new Error('not resolved'); return o.fonts[n] } },
    }
  }
  /** a page's characters and annotations as the run reads them, live and from its draw (the draw as a left part carries it) */
  async function bothOf(page: ReturnType<typeof pageOf>) {
    const { fontReaders, pageReadOf } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const tc = (await page.getTextContent()) as unknown as TextContentLike
    const L = fontReaders().live(page, tc.styles)
    const live = pageReadOf(tc, L.fontOf, L.mapOf, await page.getAnnotations())
    const { draw, why } = await drawDataOf(page)
    if (draw === null) return { live, data: null, why }
    const x = fontReaders().draw(checkDraw(JSON.parse(JSON.stringify(draw))))
    return { live, data: pageReadOf(x.tc, x.fontOf, x.mapOf, x.raw), why }
  }

  it('explicit dests by reference and by index, quads of 8 numbers and not, a url, a named dest', async () => {
    const annots = [
      { subtype: 'Link', rect: [70, 698, 90, 712], dest: [{ num: 12, gen: 0 }, { name: 'XYZ' }, 72, 700, null], overlaidText: 'ab', borderStyle: { width: 1, style: 1 }, color: new Uint8ClampedArray([255, 0, 0]) },
      { subtype: 'Link', rect: [70, 698, 90, 712], dest: [3, { name: 'Fit' }], overlaidText: '', borderStyle: { width: 0, style: 1 }, color: null },
      { subtype: 'Link', rect: [70, 698, 120, 712], quadPoints: new Float32Array([70, 712, 90, 712, 70, 698, 90, 698]), url: 'https://example.org/a', borderStyle: { width: 1, style: 2 }, color: new Uint8ClampedArray([0, 0, 255]) },
      { subtype: 'Link', rect: [70, 698, 120, 712], quadPoints: new Float32Array([70, 712, 90, 712, 70]), dest: 'eq.1', borderStyle: { width: 0, style: 1 } },
      { subtype: 'Widget', rect: [0, 0, 1, 1] },
    ]
    const r = await bothOf(pageOf({ items: [item('abc def', 'f1')], styles: { f1: { fontFamily: 'serif' } }, fonts: { f1: font() }, annots }))
    expect(r.why).toBeNull()
    expect(r.data).toEqual(r.live)
    expect(r.live.read!.list.filter(a => !a.unsupported).length).toBe(4)
  })

  it('a rotated page, an empty item, a lone surrogate, an error font, a Type3 font\'s map, a math font\'s unmapped glyph', async () => {
    const items = [
      item('ab', 'f1'), item('', 'f1'), item('x\ud800y', 'f1'), item('q', 'gone'), item('az', 't3'), item('aÍb', 'mi'),
      item('turned', 'f1', { transform: [0, 10, -10, 0, 300, 100] }),
    ]
    const fonts = { f1: font(), t3: font({ name: 'T3Font', isType3Font: true, toUnicode: { _map: ['a'] } }), mi: font({ name: 'CMMI10', toUnicode: { _map: ['a', 'b'] } }) }
    const r = await bothOf(pageOf({ items, styles: { f1: { fontFamily: 'serif' }, t3: { fontFamily: 'serif' }, mi: { fontFamily: 'serif' } }, fonts, rotate: 90 }))
    expect(r.why).toBeNull()
    expect(r.data).toEqual(r.live)
    // (the lone surrogate kept, its own character, which no map gives; the Type3 font's map read as the live reading reads it,
    // R1: its 'z' marked no reading of its glyph; the math font's 'Í' too)
    expect(r.live.chars.filter(c => c.nu).map(c => c.ch)).toEqual(['\ud800', 'z', 'Í'])
  })

  it('a page with a non-embedded CIDFontType2 ships no draw (E1): the browser reads it', async () => {
    const r = await bothOf(pageOf({ items: [item('ab', 'cid')], styles: { cid: { fontFamily: 'sans-serif' } }, fonts: { cid: font({ name: 'ArialUnicodeMS', missingFile: true }) } }))
    expect(r.data).toBeNull()
    expect(r.why).toBe('font')
  })

  it('keys a draw\'s font by its content, apart from loaded names; a key read before with another row refuses that draw', async () => {
    const { fontReaders } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const draw = (name: string): Draw => ({ fonts: [[name, 'serif', 0, ['a']]], items: [['a', 10, 0, 10, 72, 700, 6, 10, 0]], links: [] })
    const R = fontReaders()
    const x = R.draw(draw('CMR10')), key = x.tc.items[0]!.fontName!
    expect(key).toMatch(/^axt-draw-[0-9a-f]{16}-\d+$/)
    expect(R.draw(draw('CMR10')).fontOf(key)).toBe(x.fontOf(key))
    expect(R.draw(draw('CMBX10')).tc.items[0]!.fontName).not.toBe(key)
    keys.one = true
    try {
      const S = fontReaders()
      expect(S.draw(draw('CMR10')).fontOf('axt-draw-one').name).toBe('CMR10')
      expect(() => S.draw(draw('CMBX10'))).toThrow(/another font/)
      expect(S.draw(draw('CMR10')).fontOf('axt-draw-one').name).toBe('CMR10')
    } finally { keys.one = false }
  })

  it('a run reads live the page whose draw names a font key read before with another font', async () => {
    const P = await paper()
    const live = docsOf(SPEC)
    const want = drawing((await runOf(P, live.doc, [1, 2, 3])).run)
    const data = docsOf(SPEC)
    const D = await docsOf(SPEC).draws()
    // (page 3's draw: its font row another, under the key the others' reads)
    const other = (d: Draw): Draw => ({ ...d, fonts: d.fonts.map(f => ['CMBX10', f[1], f[2], f[3]] as Draw['fonts'][number]) })
    keys.one = true
    try {
      const { run } = await runOf(P, data.doc, [1, 2, 3], async p => (p === 3 ? other(D[2]!) : D[p - 1]!))
      expect(drawing(run)).toEqual(want)
      expect(run.drawStats!.refused).toEqual([3])
      expect(run.drawStats!.live).toEqual([3])
      expect(data.counts.text.slice(1)).toEqual([0, 0, 1])
      // (page 3's pixels read once its draw came, the draw then refused: its live reading takes its ink from them, drawn once)
      expect(data.counts.render[3]).toBe(1)
    } finally { keys.one = false }
  })
})
