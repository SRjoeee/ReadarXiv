import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES } from '@/pdf-reader/engine/rules/layout.mjs'
import { indexLayout, parseLayout, UNIT_KINDS } from '@/pdf-reader/engine/layout/file.mjs'
import { trPiecesOf } from '@/pdf-reader/engine/layer/pieces.mjs'

// What a unit's laying and a page's painting read is their own (the 1b design, §2.1 and §2.3 C1, PR 1b-B): a crop is cut
// from any page of the paper that was read, whatever the host let go (S1); a unit learns its own citations and macros
// (S2); a unit's lines on a page are dropped and grown by that page's growth step alone (S4); a unit's fill leading is its
// fit's (C1); and a page is painted in one order, its painters' first pages ascending, whatever order their passes ran in.
// Over papers of their own making: a PDF.js document's shape (its text layer, its views; nothing drawn), v0's geometry and,
// where the hybrid reads it, a layout file. Each paper is laid again by a run that lets go of what it has laid, as the
// reader's does (`free`, the 1b design §3, PR 1b-A): it draws every page alike, and holds nothing of a page or a unit after (M2)

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
async function open(P: ReturnType<typeof paper>, { order = null as number[] | null, free = false, rules = undefined as unknown } = {}) {
  const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
  const units: unknown[] = []
  const pieces = new Map<number, unknown[]>()
  for (const [id, r] of P.rows) { units[id] = r; pieces.set(id, trPiecesOf(r.pieces, (p: unknown) => (p as { k: number }).k) ?? []) }
  return openProto({
    doc: P.doc, target: 'zh', pages: P.pages, scale: 1, dpr: 1, copy: false, geometry: P.geometry, units, order, free, ...(rules ? { rules } : {}),
    tex: P.index ? { index: P.index, pieces, use: 'lines', texOnly: true, symbols: 'text', extents: 'v0' } : null,
  } as never) as Promise<Run>
}
const placedOf = (run: Run, id: number) => run.placed.find(p => p.id === id)!
/** every paper of this file, its pages and the lay orders it is laid in (M2) */
const PAPERS: [string, Spec[], number, (number[] | null)[]][] = []
/** the units painted on a page, in their order (its SVG's groups) */
const paintedOn = (run: Run, page: number) => [...run.svgOf(page).innerHTML.matchAll(/data-u="(\d+)"/g)].map(m => Number(m[1]))

describe('S1: a crop is cut from any page of the paper that was read', () => {
  // a paragraph from page 1 on to page 2, its formula on page 1, and a paragraph of page 3: page 3's closure draws page 1 (its
  // setup) and lays none of page 1's units
  const specs: Spec[] = [
    { id: 0, kind: 'para', src: 'Kappa lambda', lines: [line(1, 200, [20, 'Kappa lambda'])], from: 'file', tr: [text(CJK(5))] },
    {
      id: 1, kind: 'para', src: 'Alpha $x^2$ beta gamma', lines: [line(1, 40, [20, 'Alpha'], [60, 'x2']), line(2, 270, [20, 'beta gamma'])], from: 'file', pieces: 3,
      ph: [[1, 0, 1, 60, 40, 70, 47, 38]], tr: [text(CJK(4, 0x4e10)), { t: 'ph', src: '$x^2$', k: 1 }, text(CJK(6, 0x4e30))],
    },
    { id: 2, kind: 'para', src: 'Mu nu', lines: [line(3, 200, [20, 'Mu nu'])], from: 'file', tr: [text(CJK(3, 0x4e60))] },
  ]
  PAPERS.push(['S1', specs, 3, [null]])
  const cropsFrom = (run: Run, page: number) => run.rows.flatMap(r => r.ops.filter(o => o.op === 'crop' && (o as { page: number }).page === page))
  it('draws it though the host let the page go (its row no longer `base`) before the unit is painted', async () => {
    const whole = await open(paper(specs, 3))
    await whole.until(3)
    const want = cropsFrom(whole, 1)
    expect(want.length).toBe(1)
    const run = await open(paper(specs, 3))
    // (page 1 drawn for page 3's closure, the paragraph from it still to come; then page 1 let go, as a host lets a page go)
    await run.layFor(3)
    expect([1, 2, 3].map(q => run.ready(q))).toEqual([false, false, true])
    expect(placedOf(run, 1).layout).toBeUndefined()
    run.rows[0]!.base = false
    await run.until(3)
    expect(cropsFrom(run, 1)).toEqual(want)
    expect(run.rows.map(r => JSON.stringify(r.ops))).toEqual(whole.rows.map(r => JSON.stringify(r.ops)))
  })
})

describe('L2: a unit is laid once every page it reads is drawn, its placeholders\' too', () => {
  // a paragraph of page 1 whose formula the layout file places on page 2 (a placeholder's segment past its last page), and a
  // paragraph of page 2: page 1's closure draws page 2 before the paragraph is laid, in order too, so that whether its crop's
  // page is drawn is never the order's (the hybrid leaves such a unit the original's, unproven: nothing proves a crop it has no
  // line beside; what it reads is drawn all the same)
  const specs: Spec[] = [
    { id: 0, kind: 'para', src: 'Alpha $x^2$ beta', lines: [line(1, 200, [20, 'Alpha'], [80, 'beta'])], from: 'file', pieces: 3, ph: [[1, 0, 2, 60, 150, 70, 157, 148]], tr: [text(CJK(3)), { t: 'ph', src: '$x^2$', k: 1 }, text(CJK(2, 0x4e20))] },
    { id: 1, kind: 'para', src: 'Gamma delta x2', lines: [line(2, 250, [20, 'Gamma delta']), line(2, 150, [60, 'x2'])], from: 'file', tr: [text(CJK(5, 0x4e40))] },
  ]
  PAPERS.push(['L2', specs, 2, [null]])
  /** the paper, each page's read logged with the units laid by then */
  const logged = () => {
    const P = paper(specs, 2), get = P.doc.getPage, log: string[] = []
    let run: Run | null = null
    P.doc.getPage = async (n: number) => { log.push(`read ${n} after ${run?.order.join(',') ?? ''}`); return get(n) }
    return { P, log, bind: (r: Run) => { run = r } }
  }
  it('draws the page of its placeholder before it is laid, whatever page is asked first', async () => {
    const want = await open(paper(specs, 2))
    expect(want.closure(1).draw).toEqual([1, 2])
    await want.until(2)
    for (const first of [1, 2]) {
      const { P, log, bind } = logged()
      const run = await open(P)
      bind(run)
      await run.layFor(first)
      await run.until(2)
      expect(log, `page ${first} first`).toEqual(['read 1 after ', 'read 2 after '])
      expect(run.rows.map(r => JSON.stringify(r.ops)), `page ${first} first`).toEqual(want.rows.map(r => JSON.stringify(r.ops)))
      expect(run.skipped, `page ${first} first`).toEqual(want.skipped)
    }
  })
})

describe('S2: a unit learns its own citations', () => {
  // two paragraphs of page 1 citing one key: the first's rendering on the page ("[3]"), the second's not there
  const specs: Spec[] = [
    { id: 0, kind: 'para', src: 'Alpha \\cite{k} beta', lines: [line(1, 200, [20, 'Alpha'], [55, '[3]'], [80, 'beta'])], from: 'geometry', tr: [text(CJK(3)), { t: 'ph', src: '\\cite{k}', k: 1 }, text(CJK(2, 0x4e20))] },
    { id: 1, kind: 'para', src: 'Gamma \\cite{k} delta', lines: [line(1, 150, [20, 'Gamma'], [60, 'delta'])], from: 'geometry', tr: [text(CJK(3, 0x4e40)), { t: 'ph', src: '\\cite{k}', k: 1 }, text(CJK(2, 0x4e60))] },
  ]
  PAPERS.push(['S2', specs, 1, [[0, 1], [1, 0]]])
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
  PAPERS.push(['S4, a page its own', specsOf(false), 2, [null]], ['S4, every page another\'s', specsOf(true), 2, [null]])
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
    PAPERS.push(['S4, grown', specs, 1, [null]])
    const run = await open(paper(specs, 1))
    await run.until(1)
    const [r] = placedOf(run, 0).rects
    expect(r![1]).toBeCloseTo(20, 1)
    expect(r![3]).toBeLessThanOrEqual(75)
  })
})

describe('S4 with a first page all another\'s: the first line is the first placed page\'s, whatever page grew first (L4)', () => {
  // q (unit 1) is laid by v0's geometry on pages 2 and 3, its line on page 2 another unit's rectangle covers (dropped there),
  // its line on page 3 anchored mid-word; u (unit 3) runs from page 3 to 4 and v (unit 4) from 4 to 5. Page 5's closure lays u
  // and v, and u's growth on page 3 grows q there before q's own page 2 is reached: the first line q's page-3 growth reads
  // was its page-2 line (not yet dropped), where laid in order it was its page-3 line (the page-2 one dropped), and its edge
  // snapped. The first line is the first placed page's, read on that page alone, so both orders draw page 3 alike
  const rectOf = (l: Line, x0 = spanOf(l)[0]) => [l.page, x0, l.b - 2.15, spanOf(l)[1], l.b + 6.83]
  const Q2 = line(2, 200, [20, 'Alpha beta']), Q3 = line(3, 200, [20, 'gamma delta'])
  const specs: Spec[] = [
    { id: 0, kind: 'para', src: 'Kappa lambda', lines: [line(1, 200, [20, 'Kappa lambda'])], from: 'geometry', tr: [text(CJK(5))] },
    { id: 1, kind: 'para', src: 'Alpha beta gamma delta', lines: [Q2, Q3], rects: [rectOf(Q2), rectOf(Q3, 30)], from: 'geometry', tr: [text(CJK(8, 0x4e20))] },
    { id: 2, kind: 'para', src: 'Other words', lines: [line(2, 120, [20, 'Other words'])], rects: [rectOf(Q2)], from: 'geometry', tr: [text(CJK(4, 0x4e40))] },
    { id: 3, kind: 'para', src: 'Mu nu xi omicron', lines: [line(3, 60, [20, 'Mu nu']), line(4, 270, [20, 'xi omicron'])], from: 'geometry', tr: [text(CJK(8, 0x4e60))] },
    { id: 4, kind: 'para', src: 'Pi rho sigma tau', lines: [line(4, 60, [20, 'Pi rho']), line(5, 270, [20, 'sigma tau'])], from: 'geometry', tr: [text(CJK(8, 0x4e80))] },
  ]
  PAPERS.push(['S4, a first page dropped', specs, 5, [null]])
  const pageOf = (run: Run, q: number) => ({ markup: run.rows[q - 1]!.markup, ops: JSON.stringify(run.rows[q - 1]!.ops) })
  it('draws every page alike laid in order, page 5 first, reversed, or each page alone', async () => {
    const want = await open(paper(specs, 5))
    await want.until(5)
    // (q's page-2 line dropped as another's: its lines are its page 3's alone)
    expect(placedOf(want, 1).rects.map(r => r[0])).toEqual([3])
    for (const first of [[5], [5, 4, 3, 2, 1], [3], [4]]) {
      const run = await open(paper(specs, 5))
      for (const p of first) await run.layFor(p)
      await run.until(5)
      for (let q = 1; q <= 5; q++) expect(pageOf(run, q), `${first} first, page ${q}`).toEqual(pageOf(want, q))
      expect(placedOf(run, 1).rects, `${first} first`).toEqual(placedOf(want, 1).rects)
    }
  })
})

describe('S4 with a first page all another\'s: the first line grows over the math before it by the first placed page alone (L4, the first line itself)', () => {
  // as above, but q's page-3 lines are two of one block: "(1)=" stands before the first of them, which the unit's rectangle
  // starts after. A line that is not the unit's first grows left over such math; the unit's first line does not. q's first
  // line is its first placed page's (page 2, whose line another unit covers and drops), so its page-3 line is not the first
  // whatever order the pages grow in: it grows over "(1)=" in order and when page 3 grows before page 2 is reached
  const rectOf = (l: Line, x0 = spanOf(l)[0], x1 = spanOf(l)[1]) => [l.page, x0, l.b - 2.15, x1, l.b + 6.83]
  const Q2 = line(2, 200, [20, 'Alpha beta']), Q3a = line(3, 200, [20, '(1)='], [40, 'gamma delta']), Q3b = line(3, 188, [20, 'epsilon zeta eta theta iota kappa lambda mu nu xi'])
  const specs: Spec[] = [
    { id: 0, kind: 'para', src: 'Kappa lambda', lines: [line(1, 200, [20, 'Kappa lambda'])], from: 'geometry', tr: [text(CJK(5))] },
    { id: 1, kind: 'para', src: 'Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi', lines: [Q2, Q3a, Q3b], rects: [rectOf(Q2), rectOf(Q3a, 40, 95), rectOf(Q3b)], from: 'geometry', tr: [text(CJK(10, 0x4e20))] },
    { id: 2, kind: 'para', src: 'Other words', lines: [line(2, 120, [20, 'Other words'])], rects: [rectOf(Q2)], from: 'geometry', tr: [text(CJK(4, 0x4e40))] },
    { id: 3, kind: 'para', src: 'Mu nu xi omicron', lines: [line(3, 60, [20, 'Mu nu']), line(4, 270, [20, 'xi omicron'])], from: 'geometry', tr: [text(CJK(8, 0x4e60))] },
    { id: 4, kind: 'para', src: 'Pi rho sigma tau', lines: [line(4, 60, [20, 'Pi rho']), line(5, 270, [20, 'sigma tau'])], from: 'geometry', tr: [text(CJK(8, 0x4e80))] },
  ]
  PAPERS.push(['S4, a first page dropped, math before the surviving line', specs, 5, [null]])
  it('grows the surviving page-3 line over "(1)=" laid in order, page 5 first, reversed, or each page alone', async () => {
    const want = await open(paper(specs, 5))
    await want.until(5)
    // (q's page-2 line dropped as another's; its page-3 line is not its first and has taken the math before it)
    const rects3 = placedOf(want, 1).rects.filter(r => r[0] === 3)
    expect(placedOf(want, 1).rects.map(r => r[0])).toEqual([3, 3])
    expect(rects3[0]![1]).toBeLessThan(25)
    // (the block is wide enough that extendFirstLines' far-in rule leaves the line at its words, 40: the math is what moved it)
    for (const first of [[5], [5, 4, 3, 2, 1], [3], [4], [1, 2, 3], [2], [2, 3]]) {
      const run = await open(paper(specs, 5))
      for (const p of first) await run.layFor(p)
      await run.until(5)
      expect(placedOf(run, 1).rects, `${first} first`).toEqual(placedOf(want, 1).rects)
    }
  })
})

describe('the work counters (work.mjs): integer counts of what a page cost, the same for the same input', () => {
  const Q2 = line(2, 200, [20, 'Alpha beta']), Q3 = line(3, 200, [20, 'gamma delta'])
  const specs: Spec[] = [
    { id: 0, kind: 'para', src: 'Kappa lambda', lines: [line(1, 200, [20, 'Kappa lambda'])], from: 'geometry', tr: [text(CJK(5))] },
    { id: 1, kind: 'para', src: 'Alpha beta gamma delta', lines: [Q2, Q3], rects: [[2, 20, 197.85, 70, 206.83], [3, 20, 197.85, 80, 206.83]], from: 'geometry', tr: [text(CJK(8, 0x4e20))] },
    { id: 2, kind: 'para', src: 'Mu nu xi omicron', lines: [line(3, 60, [20, 'Mu nu']), line(4, 270, [20, 'xi omicron'])], from: 'geometry', tr: [text(CJK(8, 0x4e60))] },
  ]
  const KEYS = ['fit', 'measures', 'breaks', 'linkTests', 'inkSteps', 'ops', 'edges']
  const laid = async (order: number[]) => {
    const run = await open(paper(specs, 4))
    for (const p of order) await run.layFor(p)
    await run.until(4)
    return run
  }
  it('are integers for every page, counted for the lay, the measures, the breaks, the ink map and the operations, and a rerun gives the same counts', async () => {
    const a = await laid([1, 2, 3, 4]), b = await laid([1, 2, 3, 4])
    const total = a.workTotal() as unknown as Record<string, number>
    expect(Object.keys(total)).toEqual(KEYS)
    for (const k of ['fit', 'measures', 'breaks', 'inkSteps', 'ops']) expect(total[k], k).toBeGreaterThan(0)
    for (const w of a.pageWork) if (w) for (const k of KEYS) expect(Number.isInteger((w as unknown as Record<string, number>)[k]), k).toBe(true)
    expect(a.pageWork).toEqual(b.pageWork)
    expect(b.workTotal()).toEqual(a.workTotal())
  })
  it("leave no mark on a unit: a property added to every unit object put each in dictionary mode, 800 bytes a unit the gate keeps", async () => {
    // (the speed check of 2026-10-17: the heap's growth a laid page +4.5 KB over the base, one property store of 800 bytes a
    // unit on 1512.03385 in Chinese, from the work mark the run set on each unit it laid)
    const run = await laid([1, 2, 3, 4])
    expect(run.placed.length).toBeGreaterThan(0)
    for (const p of run.placed) expect(Object.hasOwn(p as object, 'workMark'), `unit ${(p as { id: number }).id}`).toBe(false)
  })
  it('add up to the same total whatever order the pages were asked in', async () => {
    const want = (await laid([1, 2, 3, 4])).workTotal()
    for (const order of [[4], [3, 1], [4, 3, 2, 1]]) expect((await laid(order)).workTotal(), `${order} first`).toEqual(want)
  })
  it("read a page's characters for its units' edges once, not once a unit (run.mjs edgesOf): each edge a band of baselines", async () => {
    // (eight paragraphs of two lines on one page, each line's 11 characters; every unit reads its first line's baseline, its
    // last's and the next line under it. Read by scanning the page for each, eight units cost 3 x 8 x 176 visits; by the
    // page's index of its characters, its 176 once and the few in each band)
    const words = ['Alpha beta', 'gamma delt', 'epsilon ze', 'eta theta ', 'iota kappa', 'lambda mu ', 'nu xi omic', 'ron pi rho']
    const many: Spec[] = words.map((w, i) => ({ id: i, kind: 'para', src: `${w} ${w}`, lines: [line(1, 280 - 30 * i, [20, `${w}x`]), line(1, 268 - 30 * i, [20, `${w}y`])], from: 'geometry', tr: [text(CJK(6, 0x4e00 + 40 * i))] }))
    const run = await open(paper(many, 1))
    await run.until(1)
    const chars = many.reduce((n, u) => n + u.lines.reduce((m, l) => m + l.items.reduce((k, [, t]) => k + t.length, 0), 0), 0)
    const edges = (run.pageWork[1] as unknown as { edges: number }).edges
    expect(edges).toBeGreaterThan(0)
    expect(edges).toBeLessThanOrEqual(chars + many.length * 3 * 2 * 11)
  })
})

describe('L1: a unit left the original\'s for a page that cannot be read grows on its other pages as a unit ranked after it there needs', () => {
  // q (unit 1, v0's geometry) on pages 2 and 3, its page-2 line anchored on "beta" alone ("Alpha" before it its own), page 3
  // unreadable: q is refused 'page' and never laid. u (unit 2) on pages 2 and 4 ranks after it on page 2 and grows it there
  // first (L1): in order too, where next's rule skipped a unit refused before it was reached
  const Q2 = line(2, 200, [20, 'Alpha beta'])
  const specs: Spec[] = [
    { id: 0, kind: 'para', src: 'Kappa lambda', lines: [line(1, 200, [20, 'Kappa lambda'])], from: 'geometry', tr: [text(CJK(5))] },
    { id: 1, kind: 'para', src: 'Alpha beta gamma', lines: [Q2, line(3, 200, [20, 'gamma'])], rects: [[2, 50, 200 - 2.15, 70, 200 + 6.83], [3, 20, 200 - 2.15, 45, 200 + 6.83]], from: 'geometry', tr: [text(CJK(6, 0x4e20))] },
    { id: 2, kind: 'para', src: 'Other words more text', lines: [line(2, 120, [20, 'Other words']), line(4, 270, [20, 'more text'])], from: 'geometry', tr: [text(CJK(8, 0x4e40))] },
  ]
  /** the paper, its page 3 unreadable */
  const failing = () => { const P = paper(specs, 4), get = P.doc.getPage; P.doc.getPage = async (n: number) => { if (n === 3) throw new Error('page 3 cannot be read'); return get(n) }; return P }
  const page2 = (run: Run) => ({ markup: run.rows[1]!.markup, ops: JSON.stringify(run.rows[1]!.ops) })
  it('is grown on page 2 in order and in every other order, the page drawn alike', async () => {
    const want = await open(failing())
    await want.until(4)
    expect(want.failed(3)).toBe(true)
    expect(want.skipped.filter(x => x.id === 1).map(x => x.why)).toEqual(['page'])
    // (its line grown over "Alpha", its own source's word: the anchors' x0 of 50 back to the line's 20)
    expect(placedOf(want, 1).rects.find(r => r[0] === 2)![1]).toBeCloseTo(20, 1)
    for (const first of [[4], [2], [4, 2, 1]]) {
      const run = await open(failing())
      for (const p of first) await run.layFor(p)
      await run.until(4)
      expect(page2(run), `${first} first`).toEqual(page2(want))
      expect(placedOf(run, 1).rects, `${first} first`).toEqual(placedOf(want, 1).rects)
    }
  })
  it('is grown alike by the run that lets go and the one that keeps, with no page pass too (a unit left the original\'s is let go only once its growth has run)', async () => {
    const noPass = structuredClone(BUILTIN_RULES) as unknown as { scripts: Record<string, Record<string, unknown>> }
    noPass.scripts.Hans!.adaptiveFill = null
    for (const rules of [undefined, noPass]) {
      const kept = await open(failing(), { rules })
      await kept.until(4)
      const freed = await open(failing(), { rules, free: true })
      await freed.until(4)
      const as = rules ? 'no page pass' : 'the built-in set'
      expect(placedOf(freed, 1).rects, as).toEqual(placedOf(kept, 1).rects)
      expect(placedOf(freed, 1).rects.find(r => r[0] === 2)![1], as).toBeCloseTo(20, 1)
      for (const q of [1, 2, 4]) expect(freed.rows[q - 1]!.ops, `${as} page ${q}`).toEqual(kept.rows[q - 1]!.ops)
    }
  })
})

describe("C1: a unit's fill leading is its fit's", () => {
  // a paragraph of page 2, and one from page 2 on to page 3: page 2's pass waits for the second, laid at page 3
  const specs: Spec[] = [
    { id: 0, kind: 'para', src: 'Alpha beta gamma delta', lines: [line(2, 200, [20, 'Alpha beta']), line(2, 188, [20, 'gamma delta'])], from: 'file', tr: [text(CJK(12))] },
    { id: 1, kind: 'para', src: 'Epsilon zeta eta theta', lines: [line(2, 40, [20, 'Epsilon zeta']), line(3, 270, [20, 'eta theta'])], from: 'file', tr: [text(CJK(12, 0x4e40))] },
    { id: 2, kind: 'para', src: 'Iota kappa', lines: [line(1, 200, [20, 'Iota kappa'])], from: 'file', tr: [text(CJK(5, 0x4e80))] },
  ]
  PAPERS.push(['C1, fill', specs, 3, [null]])
  it('is set as the unit is laid, before the pass of its page has run', async () => {
    const run = await open(paper(specs, 3))
    // (page 2's closure: its paragraph laid first, by its rank, then stopped before the one running on to page 3)
    await run.layFor(2, () => run.order.length < 1)
    expect(run.order).toEqual([0])
    expect(run.rows[1]!.fill).toBeNull()
    expect(placedOf(run, 0).layout).toBeDefined()
    expect(placedOf(run, 1).layout).toBeUndefined()
    const lead = (placedOf(run, 0) as { fillLead?: number | null }).fillLead
    expect(lead).not.toBeUndefined()
    await run.until(3)
    expect((placedOf(run, 0) as { fillLead?: number | null }).fillLead).toBe(lead)
  })
})

/** a paragraph of `n` lines on each of its pages `[page, top, n]`, its translation of `chars` characters from `at` */
const para = (id: number, pages: [number, number, number][], chars: number, at = 0x4e00): Spec => {
  const lines = pages.flatMap(([page, top, n]) => Array.from({ length: n }, (_, i) => line(page, top - 12 * i, [20, `Alpha beta ${page}${i}`])))
  return { id, kind: 'para', src: lines.map(l => l.items[0]![1]).join(' '), lines, from: 'file', tr: [text(CJK(chars, at))] }
}

describe("S3: a page's fill target is a function of its page", () => {
  // The fill leading of a paragraph is how loosely its translation can be spread over its original's frame: 1.0 for a long one
  // on a short frame, up to the script's top for a short one. Page 1 is a title page (one paragraph at 1.0), page 2 a fuller
  // page (1.25), page 3 two paragraphs at the top (1.667) and page 4 one at 1.5; a paragraph runs from page 2 to page 4, laid
  // as page 4 is drawn, so that page 3's pass runs before page 2's (on next, page 3 is held to the title page's
  // rhythm: the targets there depend on the order the passes run in)
  const specs: Spec[] = [
    para(0, [[1, 250, 4]], 20),
    para(1, [[2, 250, 6]], 28, 0x4e40),
    para(2, [[2, 100, 3], [4, 270, 2]], 30, 0x4e80),
    para(3, [[3, 250, 6]], 16, 0x4ec0),
    para(4, [[3, 120, 8]], 20, 0x4f00),
    para(5, [[4, 200, 4]], 16, 0x4f40),
  ]
  PAPERS.push(['S3, a skipped page', specs, 4, [null, [0, 1, 3, 4, 5, 2], [0, 1, 4, 3, 2, 5]]])
  /** what a page drew and recorded: its fill numbers, markup and operations */
  const pageOf = (run: Run, q: number) => ({ fill: run.rows[q - 1]!.fill, markup: run.rows[q - 1]!.markup, ops: JSON.stringify(run.rows[q - 1]!.ops) })
  it("is each page's own, held to its anchor alone: the targets are the pages' own, though page 3's pass runs before page 2's", async () => {
    const run = await open(paper(specs, 4))
    await run.until(4)
    // (page 3 is passed with page 1, before page 2 and page 4, which wait for the paragraph laid as page 4 is drawn: page 3 is
    // not held to the title page's 1.0, nor page 2 to anything)
    expect(run.rows.map(r => r.fill?.target)).toEqual([1, 1.25, 1.667, 1.5])
    expect(run.rows.map(r => r.fill?.anchor)).toEqual([1, 1.25, 1.667, 1.5])
    expect(Object.keys(run.rows[1]!.fill!).sort()).toEqual(['anchor', 'body', 'own', 'target'])
  })
  it('draws every page alike, the units of a page laid in any order: fill, markup and operations', async () => {
    const want = await open(paper(specs, 4))
    await want.until(4)
    for (const order of [[0, 1, 3, 4, 5, 2], [0, 1, 3, 4, 2, 5]]) {
      const run = await open(paper(specs, 4), { order })
      await run.until(4)
      // (the units' rank is the order given; the records are in it, whatever order the closures laid them in)
      expect(run.stats.map(r => r.id), `${order}`).toEqual(order)
      expect([...run.order].sort(), `${order}`).toEqual([...order].sort())
      for (const q of [1, 2, 3, 4]) expect(pageOf(run, q), `${order} page ${q}`).toEqual(pageOf(want, q))
    }
  })
})

describe('S3 with the even pass: a continuation enters its page\'s anchor at its fit', () => {
  // page 1's pass waits for unit 2 (pages 1 and 4, laid as page 4 is drawn); unit 1 runs from page 1 to page 2, so page 2's
  // pass (its units all laid at page 2) runs before page 1's, and so before the even pass has laid unit 1 anew. The even pass
  // itself reads the units of a page as the pass before left them, so the opens that set it lay in order (C1 unchanged); what
  // S3 reads of a continuation is its fit's, whether or not its first page has passed
  const evenRules = () => { const r = structuredClone(BUILTIN_RULES) as unknown as { scripts: Record<string, Record<string, unknown>> }; r.scripts.Hans!.even = 1; return r }
  const specsOf = (late: boolean): Spec[] => [
    para(0, [[1, 250, 4]], 44),
    para(1, [[1, 100, 3], [2, 270, 3]], 30, 0x4e40),
    para(2, late ? [[1, 40, 2], [4, 270, 2]] : [[1, 40, 2]], 12, 0x4e80),
    para(3, [[2, 200, 6]], 24, 0x4ec0),
    para(4, [[4, 120, 4]], 16, 0x4f00),
  ]
  PAPERS.push(['S3, even', specsOf(true), 4, [null]])
  type Fit = { fillLead: number; fit?: { fillLead: number; fitLines: number } }
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]!
  it("reads the continuation's fit leading for page 2's anchor, with page 1's pass before it or after it", async () => {
    const rules = evenRules()
    const late = await open(paper(specsOf(true), 4), { rules }), early = await open(paper(specsOf(false), 4), { rules })
    await late.until(4)
    await early.until(4)
    for (const run of [late, early]) {
      const u = placedOf(run, 1) as unknown as Fit, own = placedOf(run, 3) as unknown as Fit
      expect(u.fit?.fitLines).toBeGreaterThanOrEqual(2)
      expect(run.rows[1]!.fill!.anchor).toBe(median([own.fillLead, u.fit!.fillLead]))
    }
    // (in `early` the even pass laid the continuation anew on page 1 before page 2 passed: its leading is no longer its fit's)
    expect((placedOf(early, 1) as unknown as Fit).fillLead).not.toBe((placedOf(early, 1) as unknown as Fit).fit!.fillLead)
  })
})

describe('the rules that lay in order (the even pass; no page pass): a page asked lays the prefix, in the stream\'s order', () => {
  const specs: Spec[] = [
    para(0, [[1, 250, 4]], 44),
    para(1, [[1, 100, 3], [2, 270, 3]], 30, 0x4e40),
    para(2, [[1, 40, 2], [4, 270, 2]], 12, 0x4e80),
    para(3, [[2, 200, 6]], 24, 0x4ec0),
    para(4, [[3, 120, 4]], 16, 0x4f00),
    para(5, [[4, 120, 4]], 16, 0x4f40),
  ]
  const rulesOf = (how: 'even' | 'no pass') => {
    const r = structuredClone(BUILTIN_RULES) as unknown as { scripts: Record<string, Record<string, unknown>> }
    if (how === 'even') r.scripts.Hans!.even = 1
    else r.scripts.Hans!.adaptiveFill = null
    return r
  }
  it('bounds a closure by every page its units read, a placeholder\'s past the prefix\'s last page among them', async () => {
    // (the L2 paper: page 1's paragraph reads page 2 for its formula; laid in order, page 1's closure is page 1 alone, and
    // draws page 2 too and is bound by it, so that the part covering page 2 is in before page 1 is told laying)
    const L2specs = PAPERS.find(([name]) => name === 'L2')![1]
    for (const how of ['even', 'no pass'] as const) {
      const run = await open(paper(L2specs, 2), { rules: rulesOf(how) })
      expect(run.closure(1).pass, how).toEqual([1])
      expect(run.closure(1).draw, how).toEqual([1, 2])
      expect(run.closure(1).bound, how).toBe(2)
    }
  })
  for (const how of ['even', 'no pass'] as const) it(`${how}: page 3 asked first lays the prefix up to it, as laid in order`, async () => {
    const rules = rulesOf(how)
    const want = await open(paper(specs, 4), { rules })
    await want.until(4)
    const run = await open(paper(specs, 4), { rules })
    // (its closure is the prefix needsOf reads: pages 1 to the last page 3 may be done after, and every page those units read)
    expect(run.closure(3).pass.slice(0, 3)).toEqual([1, 2, 3])
    expect(run.closure(3).draw).toEqual(expect.arrayContaining(run.closure(3).pass))
    await run.layFor(3)
    // (page 3 ready, and every page done by it: page 1's paragraph that runs on to page 4 is laid with page 4)
    expect(run.ready(3)).toBe(true)
    expect(run.ready(1)).toBe(false)
    // (laid in the stream's order: the units' order is the run's laid in order, a prefix of it)
    expect(want.order.slice(0, run.order.length)).toEqual(run.order)
    await run.until(4)
    expect(run.order).toEqual(want.order)
    for (let q = 1; q <= 4; q++) expect(JSON.stringify(run.rows[q - 1]!.ops), `${how} page ${q}`).toEqual(JSON.stringify(want.rows[q - 1]!.ops))
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
  PAPERS.push(['C1, paint order', specs, 3, [[0, 1, 2, 3, 4], [0, 2, 3, 1, 4]]])
  it('by the rank of the last unit laid on each first page', async () => {
    const one = await open(paper(specs, 3), { order: [0, 1, 2, 3, 4] })
    await one.until(3)
    const two = await open(paper(specs, 3), { order: [0, 2, 3, 1, 4] })
    await two.until(3)
    // (page 3's group ranks the paragraph from page 1 first in one, the one from page 2 first in the other: page 1's pass runs
    // first in one, page 2's in the other, laid in order, and each page is painted in that order whatever order they were laid in)
    const rankOf = (run: Run) => run.stats.map(r => r.id)
    expect(rankOf(one).indexOf(1)).toBeLessThan(rankOf(one).indexOf(3))
    expect(rankOf(two).indexOf(3)).toBeLessThan(rankOf(two).indexOf(1))
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
    PAPERS.push(['C1, pages skipped', five, 5, [null]])
    const run = await open(paper(five, 5))
    // (page 2's closure: u laid, page 2 passed, its part of page 3 painted, w not laid)
    await run.layFor(2)
    expect(placedOf(run, 1).layout).toBeUndefined()
    // (u's part of page 3 painted already, and page 2 let go: no unit on it is still to be painted)
    expect(paintedOn(run, 3)).toEqual([3])
    run.release(2)
    expect(run.rows[1]!.released).toBe(true)
    await run.until(5)
    expect(paintedOn(run, 3)).toEqual([3, 1, 4])
  })
})

describe('M2: a run that lets go of what it has laid draws every paper of this file alike, and holds nothing of it after', () => {
  /** what a run drew: each page's operations and SVG, the order its units were laid in, their records, why each was left */
  const drawing = (run: Run) => ({
    pages: run.rows.map((r, i) => ({ ops: JSON.stringify(r.ops), svg: run.svgOf(i + 1).innerHTML })),
    order: run.order.slice(), stats: run.stats.map(({ ms: _, ...r }) => r), skipped: run.skipped.map(x => `${x.id}:${x.why}`).sort(),
  })
  it('every paper, every lay order: the same pages, records and units left; no page state and no unit state held', async () => {
    // (the papers registered as their describes are collected: S4's grown paper as its test runs, so after the file's other tests)
    expect(PAPERS.length).toBeGreaterThanOrEqual(7)
    for (const [name, specs, pages, orders] of PAPERS) for (const order of orders) {
      const kept = await open(paper(specs, pages), { order })
      await kept.until(pages)
      const run = await open(paper(specs, pages), { order, free: true })
      await run.until(pages)
      expect(drawing(run), `${name} ${order}`).toEqual(drawing(kept))
      for (let q = 1; q <= pages; q++) expect(run.held(q), `${name} ${order} page ${q}`).toEqual({ state: [], units: [], reads: 0 })
      for (const u of run.placed) for (const k of ['prep', 'tokens', 'layout', 'blocks', 'local', 'lead']) expect((u as unknown as Record<string, unknown>)[k], `${name} unit ${u.id} ${k}`).toBeUndefined()
    }
  })
})
