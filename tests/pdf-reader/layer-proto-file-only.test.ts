import { beforeAll, describe, expect, it } from 'vitest'
import { trPiecesOf } from '@/pdf-reader/engine/layer/pieces.mjs'
import { indexLayout, LAYOUT_SCHEMA, PH_FLAG, parseLayout, UNIT_KINDS } from '@/pdf-reader/engine/layout/file.mjs'

// The layer draws a unit only from the layout file (route step 2, 2026-10-22): a unit the file does not hold, or one with a
// visible piece the file has no position for (a placeholder LOST or with no row, but a text symbol, a macro that sets no ink,
// a space), is the original's. The whole run (openProto) over a page of its own making: a PDF.js document's shape (its text
// layer, its views; nothing drawn), the left's geometry holding every unit and the layout file all but one

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
  g.fetch = async () => ({ ok: false, json: async () => null })
})

const H = 300, VIEW = [0, 0, 300, H]
const CJK = (n: number, from = 0x4e00) => Array.from({ length: n }, (_, i) => String.fromCharCode(from + 7 * i)).join('')
const text = (s: string) => ({ t: 'text', tr: true, s })
const ph = (src: string, k: number) => ({ t: 'ph', src, k })
/** a unit of the page: its line's text and baseline (10 pt, x 20 to 280), its translation, and what the layout file holds of it:
 *  `file` false, nothing (the left's geometry alone holds it); else its source's piece count and its placeholders' rows
 *  [k, flags, segments (page, x0, baseline, x1, top, bottom)] */
interface Spec { id: number; src: string; b: number; tr: object[]; file: boolean; pieces?: number; rows?: [number, number, number[]][] }
const SPECS: Spec[] = [
  // held whole: text alone
  { id: 0, src: 'Alpha beta gamma', b: 270, tr: [text(CJK(6))], file: true },
  // the file does not hold it: the left's geometry alone
  { id: 1, src: 'Delta epsilon zeta', b: 250, tr: [text(CJK(6, 0x4e30))], file: false },
  // a formula whose row is LOST: no position for a visible piece
  { id: 2, src: 'Eta theta iota kappa', b: 230, tr: [text(CJK(3, 0x4e60)), ph('$x_i$', 1), text(CJK(3, 0x4e90))], file: true, pieces: 3, rows: [[1, PH_FLAG.LOST, []]] },
  // a formula with no row at all
  { id: 3, src: 'Lambda mu nu xi', b: 210, tr: [text(CJK(3, 0x4ec0)), ph('$y_j$', 1), text(CJK(3, 0x4ef0))], file: true, pieces: 3, rows: [] },
  // a text symbol, a space and a macro that sets no ink, none with a row: none blocks the unit
  {
    id: 4, src: 'Omicron pi rho sigma tau', b: 190, file: true, pieces: 7, rows: [],
    tr: [text(CJK(2, 0x5000)), ph('\\%', 1), text(CJK(2, 0x5030)), ph('~', 3), text(CJK(2, 0x5060)), ph('\\ours{}', 5), text(CJK(2, 0x5090))],
  },
  // a formula found: its row holds its own ink
  { id: 5, src: 'Upsilon phi chi psi omega', b: 170, tr: [text(CJK(3, 0x5100)), ph('$z$', 1), text(CJK(3, 0x5130))], file: true, pieces: 3, rows: [[1, 0, [1, 70, 170, 80, 177, 168]]] },
]

function paper(specs: Spec[]) {
  const items = specs.map(s => ({ str: s.src, transform: [10, 0, 0, 10, 20, s.b], width: 260, height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false }))
  const viewportOf = (scale: number) => ({ width: 300 * scale, height: H * scale, scale, transform: [scale, 0, 0, -scale, 0, H * scale], convertToViewportPoint: (x: number, y: number) => [x * scale, (H - y) * scale], convertToPdfPoint: (x: number, y: number) => [x / scale, H - y / scale] })
  const page = { view: VIEW, getViewport: ({ scale }: { scale: number }) => viewportOf(scale), getTextContent: async () => ({ items, styles: { f1: { fontFamily: 'serif', ascent: 0.7, descent: -0.2 } } }), render: () => ({ promise: Promise.resolve() }), cleanup() {}, commonObjs: { get: () => ({ name: 'Times-Roman' }) } }
  const held = specs.filter(s => s.file)
  const layout = {
    schema: LAYOUT_SCHEMA, lineskip: null, layout: '5', pdfjs: '6.3.289', paper: { id: '2610.00001', version: 1, pages: 1 }, left: '', views: VIEW, fonts: ['F1'],
    units: held.map(s => [s.id, UNIT_KINDS.indexOf('para'), 9, 0, s.pieces ?? 1]),
    lines: held.map(s => [s.id, [1, 20, 280, s.b, s.b + 7, s.b - 2, 10, 0]]),
    frames: held.map(s => [s.id, [1, 0, 0, 1, -1, 0]]),
    erase: held.map(s => [s.id, [0, 20, s.b - 2, 280, s.b + 7]]),
    ph: held.flatMap(s => (s.rows ?? []).map(([k, flags, segs]) => [s.id, k, 0, flags, ...segs])), labels: [], headings: [], pageText: [], held: [], names: [],
  }
  const index = indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(layout))))
  // (the left's geometry holds every unit, the file all but one)
  const geometry = { schema: 1, kinds: specs.map(() => 'para'), left: { pages: [VIEW], units: specs.map(s => [s.id, s.id, [[1, 20, s.b - 2.15, 280, s.b + 6.83]]]) } }
  const rows = specs.map(s => ({ kind: 'para', src: s.src, state: 'whole', pieces: s.tr }))
  return { doc: { numPages: 1, getPage: async () => page }, index, geometry, rows }
}

async function run(specs: Spec[] = SPECS) {
  const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
  const P = paper(specs)
  const pieces = new Map<number, unknown[]>(P.rows.map((r, id) => [id, trPiecesOf(r.pieces as never, (p: unknown) => (p as { k: number }).k) ?? []]))
  const r = await openProto({
    doc: P.doc, target: 'zh', pages: 1, scale: 1, dpr: 1, copy: false, geometry: P.geometry, units: P.rows, free: false, records: true,
    tex: { index: P.index, pieces, symbols: 'text', extents: 'v0' },
  } as never)
  await r.until(1)
  return r
}

describe('a unit is drawn only from the layout file', () => {
  it('draws the units the file holds whole and leaves the original\'s the rest, though the left holds them all', async () => {
    const r = await run()
    expect(r.placed.map(p => p.id)).toEqual([0, 4, 5])
    // (a unit the file does not hold, one with a formula LOST and one with a formula it has no row for: untouched)
    expect(r.skipped.map(s => `${s.id}:${s.why}`).sort()).toEqual(['1:unanchored', '2:unanchored', '3:unanchored'])
    const painted = [...r.svgOf(1).innerHTML.matchAll(/data-u="(\d+)"/g)].map(m => Number(m[1]))
    expect(painted).toEqual([0, 4, 5])
    // (nothing of theirs erased: no op is theirs)
    expect(r.audit.filter(a => [1, 2, 3].includes((a as { unit?: number }).unit as number))).toEqual([])
  })

  it('says why each is the original\'s: not held, a visible piece LOST, a visible piece with no row', async () => {
    const r = await run()
    expect(r.sources.why).toEqual({ 'unanchored, unlocated': 1, 'unanchored, lost': 1, 'unanchored, no row': 1 })
    expect(r.sources.tex).toEqual([0, 4, 5])
  })

  it('a text symbol, a space and a macro that sets no ink need no row: the unit is drawn, each by its class', async () => {
    const r = await run()
    const prep = r.placed.find(p => p.id === 4)!.prep!
    expect([1, 3, 5].map(k => (prep.get(k) as { mode: string }).mode)).toEqual(['symbol', 'none', 'none'])
    expect(prep.unproven).toBeUndefined()
  })

  it('a found formula is drawn from its row\'s ink', async () => {
    const r = await run()
    const prep = r.placed.find(p => p.id === 5)!.prep!
    expect((prep.get(1) as { mode: string }).mode).toBe('crop')
  })

  it('draws nothing where the file holds no unit: every unit the original\'s', async () => {
    const r = await run(SPECS.map(s => ({ ...s, file: false })))
    expect(r.placed).toEqual([])
    expect(r.stats).toEqual([])
    expect(r.skipped.map(s => s.why)).toEqual(Array(SPECS.length).fill('unanchored'))
    expect(r.svgOf(1).innerHTML).not.toContain('data-u')
  })
})
