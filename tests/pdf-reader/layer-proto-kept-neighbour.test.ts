import { beforeAll, describe, expect, it } from 'vitest'
import { trPiecesOf } from '@/pdf-reader/engine/layer/pieces.mjs'
import { indexLayout, LAYOUT_SCHEMA, parseLayout, UNIT_KINDS } from '@/pdf-reader/engine/layout/file.mjs'
import { withGroups } from './helpers/groups'

// A unit the left does not locate (a table's cell: the file alone places it) and the layer leaves the original's (its row kept,
// or skipped) keeps its ink where TeX set it, so its lines are among the page's rectangles a neighbour's line may not grow over,
// as a located unit's are whether it is laid or not. 1810.04805v2's Table 8 (page 16): MNLI's "Fine-tune" kept, NER's beside it
// translated; NER's line grew over MNLI's identical words (layer2.mjs extendRects: the source's own words within 1.2 em), and
// its translation was laid from MNLI's start, over MNLI's original, its own place left erased and empty.

/** a canvas context that draws nothing and reads a white page */
const ctxStub = (canvas?: { width: number; height: number }) => new Proxy({} as Record<string | symbol, unknown>, {
  get(t, k) {
    if (k in t) return t[k]
    // (an em a CJK character, half one any other, at the context's font size)
    if (k === 'measureText') return (s: string) => { const px = Number(/(\d+(?:\.\d+)?)px/.exec(String(t.font ?? ''))?.[1] ?? 10); return { width: [...s].reduce((w, ch) => w + (/[　-鿿]/.test(ch) ? px : px / 2), 0), actualBoundingBoxAscent: 0.7 * px, actualBoundingBoxDescent: 0.2 * px } }
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
/** a unit of the page: its kind, its one line (x0 to x1 on baseline b, 10 pt, its own text item), whether the left locates it
 *  (`left`), and its row: a translation, or none (`kept`) */
interface Spec { id: number; kind: (typeof UNIT_KINDS)[number]; src: string; x0: number; x1: number; b: number; left: boolean; tr: object[] | null }
const PARA: Spec = { id: 0, kind: 'para', src: 'Alpha beta gamma delta epsilon', x0: 20, x1: 280, b: 270, left: true, tr: [text(CJK(8))] }
// (two cells of one row, the same words, 6 pt apart: within 1.2 em of each other)
const cell = (id: number, x0: number, kept: boolean): Spec => ({ id, kind: 'cell', src: 'Fine-tune', x0, x1: x0 + 36, b: 200, left: false, tr: kept ? null : [text(CJK(2, 0x5fae))] })

function paper(specs: Spec[]) {
  const items = specs.map(s => ({ str: s.src, transform: [10, 0, 0, 10, s.x0, s.b], width: s.x1 - s.x0, height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false }))
  const viewportOf = (scale: number) => ({ width: 300 * scale, height: H * scale, scale, transform: [scale, 0, 0, -scale, 0, H * scale], convertToViewportPoint: (x: number, y: number) => [x * scale, (H - y) * scale], convertToPdfPoint: (x: number, y: number) => [x / scale, H - y / scale] })
  const page = { view: VIEW, getViewport: ({ scale }: { scale: number }) => viewportOf(scale), getTextContent: async () => ({ items, styles: { f1: { fontFamily: 'serif', ascent: 0.7, descent: -0.2 } } }), render: () => ({ promise: Promise.resolve() }), cleanup() {}, commonObjs: { get: () => ({ name: 'Times-Roman' }) } }
  const layout = {
    schema: LAYOUT_SCHEMA, lineskip: null, layout: '5', pdfjs: '6.3.289', paper: { id: '2610.00001', version: 1, pages: 1 }, left: '', views: VIEW, fonts: ['F1'],
    units: specs.map(s => [s.id, UNIT_KINDS.indexOf(s.kind), 9, 0, 1]),
    lines: specs.map(s => [s.id, [1, s.x0, s.x1, s.b, s.b + 7, s.b - 2, 10, 0]]),
    frames: specs.map(s => [s.id, [1, 0, 0, 1, -1, 0]]),
    erase: specs.map(s => [s.id, [0, s.x0, s.b - 2, s.x1, s.b + 7]]),
    ph: [], labels: [], headings: [], pageText: [], held: [], names: [],
  }
  const index = indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(layout))))
  // (the left's geometry holds the paragraph alone: the cells are the file's, as most of a table's are)
  const geometry = { schema: 1, kinds: specs.map(s => s.kind), left: { pages: [VIEW], units: specs.filter(s => s.left).map(s => [s.id, s.id, [[1, s.x0, s.b - 2.15, s.x1, s.b + 6.83]]]) } }
  const rows = specs.map(s => (s.tr ? { kind: s.kind, src: s.src, state: 'whole', pieces: s.tr } : { kind: s.kind, src: s.src, state: 'kept' }))
  return { doc: withGroups({ numPages: 1, getPage: async () => page }), index, geometry, rows }
}

async function run(specs: Spec[]) {
  const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
  const P = paper(specs)
  const pieces = new Map<number, unknown[]>(P.rows.map((r, id) => [id, r.pieces ? trPiecesOf(r.pieces as never, (p: unknown) => (p as { k: number }).k) ?? [] : []]))
  const r = await openProto({
    doc: P.doc, target: 'zh', pages: 1, scale: 1, dpr: 1, copy: false, geometry: P.geometry, units: P.rows, free: false, records: true,
    tex: { index: P.index, pieces, symbols: 'text', extents: 'v0' },
  } as never)
  await r.until(1)
  return r
}

/** a placed unit's first line's left edge, as its growth left it */
const startOf = (r: { placed: { id: number; rects: number[][] }[] }, id: number) => r.placed.find(p => p.id === id)?.rects[0]?.[1]

describe('a unit left the original\'s keeps its place from its neighbours\' growth', () => {
  it('a kept cell the left does not locate: the next cell of the same words is laid from its own line, not over it', async () => {
    const r = await run([PARA, cell(1, 100, true), cell(2, 142, false)])
    expect(r.placed.map(p => p.id)).toEqual([0, 2])
    expect(startOf(r, 2)).toBeCloseTo(142, 1)
  })

  it('as where the kept cell is translated and laid too: each from its own line', async () => {
    const r = await run([PARA, cell(1, 100, false), cell(2, 142, false)])
    expect(r.placed.map(p => p.id)).toEqual([0, 1, 2])
    expect(startOf(r, 1)).toBeCloseTo(100, 1)
    expect(startOf(r, 2)).toBeCloseTo(142, 1)
  })
})
