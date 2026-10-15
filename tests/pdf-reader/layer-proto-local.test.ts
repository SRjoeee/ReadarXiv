import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { indexLayout, parseLayout, UNIT_KINDS } from '@/pdf-reader/engine/layout/file.mjs'
import { trPiecesOf } from '@/pdf-reader/engine/layer/pieces.mjs'

// What a unit's laying and a page's painting read is their own (the 1b design, §2.1 and §2.3 C1, PR 1b-B): a crop is cut
// from any page of the paper that was read, whatever the host let go (S1); a unit learns its own citations and macros
// (S2); a unit's lines on a page are dropped and grown by that page's growth step alone (S4); a unit's fill leading is its
// fit's (C1); and a page is painted in one order, its painters' first pages ascending, whatever order their passes ran in.
// Over papers of their own making: a PDF.js document's shape (its text layer, its views; nothing drawn), v0's geometry and,
// where the hybrid reads it, a layout file

/** a canvas context that draws nothing and reads a white page */
const ctxStub = (canvas?: { width: number; height: number }) => new Proxy({} as Record<string | symbol, unknown>, {
  get(t, k) {
    if (k in t) return t[k]
    // (an em a CJK character, half one any other, at the context's font size)
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
  // no hyphenation patterns: none is needed for these lines
  g.fetch = async () => ({ ok: false, json: async () => null })
})
afterEach(() => { delete g.scheduler })

const H = 300, VIEW = [0, 0, 300, H]
/** a run of text on a line: its left edge and its characters, each 5 pt wide (10 pt type) */
type Item = [number, string]
/** a line: its page, its baseline and its runs of text */
interface Line { page: number; b: number; items: Item[] }
const line = (page: number, b: number, ...items: Item[]): Line => ({ page, b, items })
const spanOf = (l: Line) => [l.items[0]![0], Math.max(...l.items.map(([x, s]) => x + 5 * s.length))] as const
/** a translated piece of a row: a text, or a placeholder with its source and its k (the layout file's piece) */
type Piece = { t: 'text'; tr: true; s: string } | { t: 'ph'; src: string; k: number }
/** a unit of a paper: its source, its lines, where v0 reads them from (the layout file, or v0's geometry, `rects` in place of
 *  the lines' own), its translation and, in the file, its source's pieces and placeholders (k, kind, page, x0, baseline, x1,
 *  top, bottom) */
interface Spec { id: number; kind: string; src: string; lines: Line[]; from: 'file' | 'geometry'; tr: Piece[]; pieces?: number; ph?: number[][]; rects?: number[][] }
const CJK = (n: number, from = 0x4e00) => Array.from({ length: n }, (_, i) => String.fromCharCode(from + 7 * i)).join('')
const text = (s: string): Piece => ({ t: 'text', tr: true, s })

function paper(specs: Spec[], pages: number) {
  const all = Array.from({ length: pages }, (_, i) => i + 1)
  const items = all.map(p => specs.flatMap(s => s.lines.filter(l => l.page === p).flatMap(l => l.items.map(([x, str]) => ({ str, transform: [10, 0, 0, 10, x, l.b], width: 5 * str.length, height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false })))))
  const viewportOf = (scale: number) => ({ width: 300 * scale, height: H * scale, scale, transform: [scale, 0, 0, -scale, 0, H * scale], convertToViewportPoint: (x: number, y: number) => [x * scale, (H - y) * scale], convertToPdfPoint: (x: number, y: number) => [x / scale, H - y / scale] })
  const pageOf = (n: number) => ({ view: VIEW, getViewport: ({ scale }: { scale: number }) => viewportOf(scale), getTextContent: async () => ({ items: items[n - 1], styles: { f1: { fontFamily: 'serif', ascent: 0.7, descent: -0.2 } } }), render: () => ({ promise: Promise.resolve() }), commonObjs: { get: () => ({ name: 'Times-Roman' }) }, cleanup() {} })
  const doc = { numPages: pages, getPage: async (n: number) => pageOf(n) }
  const file = specs.filter(s => s.from === 'file')
  const layout = {
    schema: 4, lineskip: null, layout: '5', pdfjs: '6.3.289', paper: { id: '2610.00001', version: 1, pages }, left: '', views: all.flatMap(() => VIEW), fonts: ['F1'],
    units: file.map(s => [s.id, UNIT_KINDS.indexOf(s.kind as never), 9, 0, s.pieces ?? 1]),
    lines: file.map(s => [s.id, s.lines.flatMap(l => { const [x0, x1] = spanOf(l); return [l.page, x0, x1, l.b, l.b + 7, l.b - 2, 10, 0] })]),
    frames: file.map(s => [s.id, s.lines.flatMap((l, j) => [l.page, 0, j, 1, j ? 0 : -1, 0])]),
    erase: file.map(s => [s.id, s.lines.flatMap((l, j) => { const [x0, x1] = spanOf(l); return [j, x0, l.b - 2, x1, l.b + 7] })]),
    ph: file.flatMap(s => (s.ph ?? []).map(([k, kind, ...seg]) => [s.id, k, kind, 0, ...seg])), labels: [], headings: [], pageText: [], held: [], names: [],
  }
  const index = file.length ? indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(layout)))) : null
  const geometry = {
    schema: 1, kinds: specs.map(s => s.kind), left: { pages: all.map(() => VIEW), units: specs.filter(s => s.from === 'geometry').map(s => [s.id, s.id, s.rects ?? s.lines.map(l => { const [x0, x1] = spanOf(l); return [l.page, x0, l.b - 2.15, x1, l.b + 6.83] })]) },
  }
  const rows = new Map(specs.map(s => [s.id, { kind: s.kind, src: s.src, state: 'whole', pieces: s.tr }]))
  return { doc, index, geometry, rows, pages }
}

type Run = Awaited<ReturnType<typeof import('@/pdf-reader/engine/layer-proto/run.mjs').openProto>>
/** v0 over the paper, every unit at once (with the hybrid where the paper has a layout file); `order`, the ids' order a
 *  page's units are laid in */
async function open(P: ReturnType<typeof paper>, { order = null as number[] | null } = {}) {
  const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
  const units: unknown[] = []
  const pieces = new Map<number, unknown[]>()
  for (const [id, r] of P.rows) { units[id] = r; pieces.set(id, trPiecesOf(r.pieces, (p: unknown) => (p as { k: number }).k) ?? []) }
  return openProto({
    doc: P.doc, target: 'zh', pages: P.pages, scale: 1, dpr: 1, copy: false, geometry: P.geometry, units, order,
    tex: P.index ? { index: P.index, pieces, use: 'lines', texOnly: true, symbols: 'text', extents: 'v0' } : null,
  } as never) as Promise<Run>
}
const placedOf = (run: Run, id: number) => run.placed.find(p => p.id === id)!
/** the units painted on a page, in their order (its SVG's groups) */
const paintedOn = (run: Run, page: number) => [...run.rows[page - 1]!.svg.innerHTML.matchAll(/data-u="(\d+)"/g)].map(m => Number(m[1]))

describe('S1: a crop is cut from any page of the paper that was read', () => {
  // a paragraph from page 1 on to page 2, its formula on page 1: laid at page 2, as its last page is drawn, and painted then
  const specs: Spec[] = [
    { id: 0, kind: 'para', src: 'Kappa lambda', lines: [line(1, 200, [20, 'Kappa lambda'])], from: 'file', tr: [text(CJK(5))] },
    {
      id: 1, kind: 'para', src: 'Alpha $x^2$ beta gamma', lines: [line(1, 40, [20, 'Alpha'], [60, 'x2']), line(2, 270, [20, 'beta gamma'])], from: 'file', pieces: 3,
      ph: [[1, 0, 1, 60, 40, 70, 47, 38]], tr: [text(CJK(4, 0x4e10)), { t: 'ph', src: '$x^2$', k: 1 }, text(CJK(6, 0x4e30))],
    },
  ]
  const cropsFrom = (run: Run, page: number) => run.rows.flatMap(r => r.ops.filter(o => o.op === 'crop' && (o as { page: number }).page === page))
  it('draws it though the host let the page go (its row no longer `base`) before the unit is painted', async () => {
    const whole = await open(paper(specs, 2))
    await whole.until(2)
    const want = cropsFrom(whole, 1)
    expect(want.length).toBe(1)
    const run = await open(paper(specs, 2))
    // (page 1 drawn and its own units laid, the paragraph from it still to come; then page 1 let go, as release lets it)
    await run.until(1, () => run.drawnTo < 1)
    expect(run.drawnTo).toBe(1)
    expect(placedOf(run, 1).layout).toBeUndefined()
    run.rows[0]!.base = false
    await run.until(2)
    expect(cropsFrom(run, 1)).toEqual(want)
    expect(run.rows.map(r => JSON.stringify(r.ops))).toEqual(whole.rows.map(r => JSON.stringify(r.ops)))
  })
})

describe('S2: a unit learns its own citations', () => {
  // two paragraphs of page 1 citing one key: the first's rendering on the page ("[3]"), the second's not there
  const specs: Spec[] = [
    { id: 0, kind: 'para', src: 'Alpha \\cite{k} beta', lines: [line(1, 200, [20, 'Alpha'], [55, '[3]'], [80, 'beta'])], from: 'geometry', tr: [text(CJK(3)), { t: 'ph', src: '\\cite{k}', k: 1 }, text(CJK(2, 0x4e20))] },
    { id: 1, kind: 'para', src: 'Gamma \\cite{k} delta', lines: [line(1, 150, [20, 'Gamma'], [60, 'delta'])], from: 'geometry', tr: [text(CJK(3, 0x4e40)), { t: 'ph', src: '\\cite{k}', k: 1 }, text(CJK(2, 0x4e60))] },
  ]
  const resolutionOf = (run: Run, id: number) => { const r = placedOf(run, id).prep?.get(1) as { mode: string; text: string } | undefined; return r && { mode: r.mode, text: r.text } }
  it('resolves each placeholder as it is whatever the units laid before it', async () => {
    const first = await open(paper(specs, 1), { order: [0, 1] })
    await first.until(1)
    const second = await open(paper(specs, 1), { order: [1, 0] })
    await second.until(1)
    expect(first.order).toEqual([0, 1])
    expect(second.order).toEqual([1, 0])
    // (the first unit's citation found on the page, in both orders; the second's, which is not there, never another unit's)
    expect(resolutionOf(first, 0)?.mode).not.toBe('source')
    expect(resolutionOf(second, 0)).toEqual(resolutionOf(first, 0))
    expect(resolutionOf(first, 1)?.mode).not.toBe('cite-map')
    expect(resolutionOf(second, 1)).toEqual(resolutionOf(first, 1))
    expect(placedOf(second, 1).rec).toEqual({ ...placedOf(first, 1).rec, ms: expect.anything() })
  })
})

describe("S4: a unit's lines on a page are dropped and grown by that page alone", () => {
  // a paragraph over pages 1 and 2 whose line on page 1 another unit's rectangle covers (the anchors' mark carried there);
  // on page 2 another unit's rectangle covers its line too, or not
  const A = line(1, 200, [20, 'Alpha beta']), A2 = line(2, 200, [20, 'gamma delta'])
  const rectOf = (l: Line) => { const [x0, x1] = spanOf(l); return [l.page, x0, l.b - 2.15, x1, l.b + 6.83] }
  const specsOf = (claimedOn2: boolean): Spec[] => [
    { id: 0, kind: 'para', src: 'Alpha beta gamma delta', lines: [A, A2], from: 'geometry', tr: [text(CJK(8))] },
    { id: 1, kind: 'para', src: 'Other words', lines: [line(1, 120, [20, 'Other words'])], rects: [rectOf(A)], from: 'geometry', tr: [text(CJK(4, 0x4e40))] },
    ...(claimedOn2 ? [{ id: 2, kind: 'para', src: 'More words', lines: [line(2, 120, [20, 'More words'])], rects: [rectOf(A2)], from: 'geometry', tr: [text(CJK(4, 0x4e60))] } as Spec] : []),
  ]
  const pagesOf = (run: Run) => placedOf(run, 0).rects.map(r => r[0])
  it("drops a page's lines another unit's cover where another page keeps one, and keeps all where every line is another's", async () => {
    const free = await open(paper(specsOf(false), 2))
    await free.until(2)
    const claimed = await open(paper(specsOf(true), 2))
    await claimed.until(2)
    // (its first page's line another's, its second page's its own: laid on page 2 alone, as the whole unit's rule laid it,
    // never two translations on one line)
    expect(pagesOf(free)).toEqual([2])
    expect(placedOf(free, 0).rec?.dropped).toBe(1)
    // (every line another's, by the rectangles as placed: all kept, nothing saying which are its own)
    expect(pagesOf(claimed)).toEqual([1, 2])
    expect(placedOf(claimed, 0).rec?.dropped).toBe(0)
  })
  it('grows a line over its own words the anchors left out beside it, never over another unit\'s', async () => {
    // (the anchors took "beta" alone; "Alpha" before it is its own, and "Other" after it another unit's line)
    const specs: Spec[] = [
      { id: 0, kind: 'para', src: 'Alpha beta', lines: [line(1, 200, [20, 'Alpha beta'])], rects: [[1, 50, 200 - 2.15, 70, 200 + 6.83]], from: 'geometry', tr: [text(CJK(4))] },
      { id: 1, kind: 'para', src: 'Other', lines: [line(1, 200, [75, 'Other'])], from: 'geometry', tr: [text(CJK(2, 0x4e40))] },
    ]
    const run = await open(paper(specs, 1))
    await run.until(1)
    const [r] = placedOf(run, 0).rects
    expect(r![1]).toBeCloseTo(20, 1)
    expect(r![3]).toBeLessThanOrEqual(75)
  })
})

describe("C1: a unit's fill leading is its fit's", () => {
  // a paragraph of page 2, and one from page 2 on to page 3: page 2's pass waits for the second, laid at page 3
  const specs: Spec[] = [
    { id: 0, kind: 'para', src: 'Alpha beta gamma delta', lines: [line(2, 200, [20, 'Alpha beta']), line(2, 188, [20, 'gamma delta'])], from: 'file', tr: [text(CJK(12))] },
    { id: 1, kind: 'para', src: 'Epsilon zeta eta theta', lines: [line(2, 40, [20, 'Epsilon zeta']), line(3, 270, [20, 'eta theta'])], from: 'file', tr: [text(CJK(12, 0x4e40))] },
    { id: 2, kind: 'para', src: 'Iota kappa', lines: [line(1, 200, [20, 'Iota kappa'])], from: 'file', tr: [text(CJK(5, 0x4e80))] },
  ]
  it('is set as the unit is laid, before the pass of its page has run', async () => {
    const run = await open(paper(specs, 3))
    await run.until(2, () => run.drawnTo < 2)
    expect(run.drawnTo).toBe(2)
    expect(placedOf(run, 0).layout).toBeDefined()
    expect(placedOf(run, 1).layout).toBeUndefined()
    const lead = (placedOf(run, 0) as { fillLead?: number | null }).fillLead
    expect(lead).not.toBeUndefined()
    await run.until(3)
    expect((placedOf(run, 0) as { fillLead?: number | null }).fillLead).toBe(lead)
  })
})

describe("C1: a page is painted in the order its painters' first pages' passes run laid in order", () => {
  // page 3 is painted by a paragraph from page 1 (its line on page 2 none: a full page's float between), one from page 2,
  // and its own: the first two laid at page 3, as their last page is drawn, in either order (the lay order a recorded run
  // gives, `order`)
  const specs: Spec[] = [
    { id: 0, kind: 'para', src: 'Kappa lambda', lines: [line(1, 100, [20, 'Kappa lambda'])], from: 'file', tr: [text(CJK(5))] },
    { id: 1, kind: 'para', src: 'Alpha beta gamma', lines: [line(1, 200, [20, 'Alpha beta']), line(3, 270, [20, 'gamma'])], from: 'file', tr: [text(CJK(6, 0x4e20))] },
    { id: 2, kind: 'para', src: 'Mu nu', lines: [line(2, 100, [20, 'Mu nu'])], from: 'file', tr: [text(CJK(3, 0x4e40))] },
    { id: 3, kind: 'para', src: 'Delta epsilon zeta', lines: [line(2, 200, [20, 'Delta epsilon']), line(3, 250, [20, 'zeta'])], from: 'file', tr: [text(CJK(6, 0x4e60))] },
    { id: 4, kind: 'para', src: 'Xi omicron', lines: [line(3, 100, [20, 'Xi omicron'])], from: 'file', tr: [text(CJK(5, 0x4e80))] },
  ]
  it('by the rank of the last unit laid on each first page', async () => {
    const one = await open(paper(specs, 3), { order: [0, 1, 2, 3, 4] })
    await one.until(3)
    const two = await open(paper(specs, 3), { order: [0, 2, 3, 1, 4] })
    await two.until(3)
    // (page 3's group lays the paragraph from page 1 first in one, the one from page 2 first in the other: page 1's pass runs
    // first in one, page 2's in the other, and each page is painted in that order)
    expect(one.order.indexOf(1)).toBeLessThan(one.order.indexOf(3))
    expect(two.order.indexOf(3)).toBeLessThan(two.order.indexOf(1))
    expect(paintedOn(one, 3)).toEqual([1, 3, 4])
    expect(paintedOn(two, 3)).toEqual([3, 1, 4])
  })
  it("paints a page's part of a unit whose pages skip one as its pass runs, never waiting on a later page's", async () => {
    // (w on pages 1, 3 and 5; u on pages 2 and 3, laid at page 3, before w, laid at page 5)
    const five: Spec[] = [
      { id: 0, kind: 'para', src: 'Kappa lambda', lines: [line(1, 100, [20, 'Kappa lambda'])], from: 'file', tr: [text(CJK(5))] },
      { id: 1, kind: 'para', src: 'Alpha beta gamma delta', lines: [line(1, 200, [20, 'Alpha beta']), line(3, 270, [20, 'gamma']), line(5, 270, [20, 'delta'])], from: 'file', tr: [text(CJK(8, 0x4e20))] },
      { id: 2, kind: 'para', src: 'Mu nu', lines: [line(2, 100, [20, 'Mu nu'])], from: 'file', tr: [text(CJK(3, 0x4e40))] },
      { id: 3, kind: 'para', src: 'Delta epsilon zeta', lines: [line(2, 200, [20, 'Delta epsilon']), line(3, 250, [20, 'zeta'])], from: 'file', tr: [text(CJK(6, 0x4e60))] },
      { id: 4, kind: 'para', src: 'Xi omicron', lines: [line(3, 100, [20, 'Xi omicron'])], from: 'file', tr: [text(CJK(5, 0x4e80))] },
      { id: 5, kind: 'para', src: 'Pi rho', lines: [line(4, 100, [20, 'Pi rho'])], from: 'file', tr: [text(CJK(3, 0x4ea0))] },
      { id: 6, kind: 'para', src: 'Sigma tau', lines: [line(5, 100, [20, 'Sigma tau'])], from: 'file', tr: [text(CJK(4, 0x4ec0))] },
    ]
    const run = await open(paper(five, 5))
    await run.until(3, () => run.drawnTo < 3)
    expect(placedOf(run, 1).layout).toBeUndefined()
    // (u's part of page 3 painted already, and page 2 let go: no unit on it is still to be painted)
    expect(paintedOn(run, 3)).toEqual([3])
    run.release(2)
    expect(run.rows[1]!.released).toBe(true)
    await run.until(5)
    expect(paintedOn(run, 3)).toEqual([3, 1, 4])
  })
})
