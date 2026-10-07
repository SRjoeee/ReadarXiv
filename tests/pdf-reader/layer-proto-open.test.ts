import { beforeAll, describe, expect, it } from 'vitest'
import { indexLayout, parseLayout } from '@/pdf-reader/engine/layout/file.mjs'

// v0 opened whole (layer-proto/run.mjs openProto) over a page of its own making: a PDF.js document's shape (its text
// layer, its views; nothing drawn), a layout file and a record, the text-removed PDF's manifest. What the page's drawing
// is made of is then read from its rows' operations, as the gate reads the copy's pixels

/** a canvas context that draws nothing and reads a white page */
const ctxStub = (canvas?: { width: number; height: number }) => new Proxy({} as Record<string | symbol, unknown>, {
  get(t, k) {
    if (k in t) return t[k]
    if (k === 'measureText') return (s: string) => ({ width: 5 * [...s].length, actualBoundingBoxAscent: 7, actualBoundingBoxDescent: 2 })
    if (k === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4).fill(255) })
    if (k === 'createImageData') return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4) })
    if (k === 'canvas') return canvas
    return () => {}
  },
  set(t, k, v) { t[k] = v; return true },
})

beforeAll(() => {
  const g = globalThis as Record<string, unknown>
  g.OffscreenCanvas = class { width = 8; height = 8; getContext() { return ctxStub(this) } }
  ;(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = function (this: HTMLCanvasElement) { return ctxStub(this) }
  g.FontFace = class { family: string; constructor(family: string) { this.family = family } load() { return Promise.resolve(this) } }
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add() {}, delete() {}, load: async () => [], check: () => true, ready: Promise.resolve() } })
  // no hyphenation patterns: none is needed for these lines
  g.fetch = async () => ({ ok: false, json: async () => null })
})

/** a page of 300 x 300 PDF units, its text layer the given words (each [text, x, baseline, width], 10 pt) */
function docOf(words: [string, number, number, number][]) {
  const H = 300
  const viewportOf = (scale: number) => ({ width: 300 * scale, height: H * scale, scale, transform: [scale, 0, 0, -scale, 0, H * scale], convertToViewportPoint: (x: number, y: number) => [x * scale, (H - y) * scale], convertToPdfPoint: (x: number, y: number) => [x / scale, H - y / scale] })
  const items = words.map(([str, x, y, width]) => ({ str, transform: [10, 0, 0, 10, x, y], width, height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false }))
  const page = { view: [0, 0, 300, H], getViewport: ({ scale }: { scale: number }) => viewportOf(scale), getTextContent: async () => ({ items, styles: { f1: { fontFamily: 'serif', ascent: 0.7, descent: -0.2 } } }), render: () => ({ promise: Promise.resolve() }), commonObjs: { get: () => ({ name: 'Times-Roman' }) }, cleanup() {} }
  return { numPages: 1, getPage: async () => page }
}

describe("a table group withheld beside one drawn, the whole run (openProto): the drawn group's fill keeps clear of the withheld text", () => {
  // Codex's review of PR A, finding 1, and the re-review's I2: three cells, A over x 10-40 in its column's group, B beside
  // it from x 40.1 and C under B in the next column's. C's translation cannot be set in its cell, so its group is
  // withheld and B keeps the original's text. Read once at the page's first paint, the protection counted B as drawn,
  // and A's fill, padded 0.6, reached x 40.6 into it. Each order the paper may hold the two groups in
  for (const first of ['A', 'B'] as const) {
    it(`stops A's padded fill short of B's text, ${first === 'A' ? "A's group" : "B's group"} first in the paper`, async () => {
      const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
      const named: [string, string, number, number, number, string][] = [['A', 'Alpha', 10, 40, 100, 'T:c0'], ['B', 'Betas', 40.1, 70, 100, 'T:c1'], ['C', 'Gamma', 40.1, 70, 80, 'T:c1']]
      const order = first === 'A' ? named : [named[1]!, named[2]!, named[0]!]
      const cells = order.map(([name, src, x0, x1, b, group], id) => ({ id, name, src, x0, x1, b, group }))
      const layout = {
        schema: 1, layout: '3', pdfjs: '6.3.289', paper: { id: '2610.00001', version: 1, pages: 1 }, left: '', views: [0, 0, 300, 300], fonts: ['F1'],
        units: cells.map(c => [c.id, 4, 9, 0, 1]),
        lines: cells.map(c => [c.id, [1, c.x0, c.x1, c.b, c.b + 7, c.b - 2, 10, 0]]),
        frames: cells.map(c => [c.id, [1, 0, 0, 1, -1, 0]]),
        erase: cells.map(c => [c.id, [0, c.x0, c.b - 2, c.x1, c.b + 7]]),
        ph: [], labels: [], headings: [], pageText: [], held: [],
      }
      const index = indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(layout))))
      const units = cells.map(c => ({ kind: 'cell', src: c.src, state: 'whole', group: c.group, pieces: [{ t: 'text', tr: true, s: c.name === 'C' ? '\u5f88'.repeat(400) : '\u6c49\u5b57' }] }))
      const doc = docOf(cells.map(c => [c.src, c.x0, c.b, c.x1 - c.x0]))
      const run = await openProto({
        doc, target: 'zh', pages: 1, scale: 1, dpr: 1, copy: false,
        geometry: { schema: 1, kinds: cells.map(() => 'cell'), left: { pages: [[0, 0, 300, 300]], units: [] } },
        units,
        tex: { index, pieces: new Map(cells.map(c => [c.id, [[0]]])), use: 'lines', texOnly: true, symbols: 'text', extents: 'v0' },
        removal: { OPS: {}, mode: 'draw', doc, manifest: { schema: 1, removal: '3', pages: 1, sets: {}, page: { 1: { ok: true } } } },
      } as never)
      await run.until(1)
      const idOf = (name: string) => cells.find(c => c.name === name)!.id
      // C could not be set, and its group with it; A is drawn by the file's rectangles
      expect(run.skipped.map((x: { id: number; why: string }) => `${x.id}:${x.why}`)).toEqual(expect.arrayContaining([`${idOf('C')}:unfit`, `${idOf('B')}:group: a cell unfit`]))
      expect(run.placed.map((p: { id: number }) => p.id)).toEqual([idOf('A')])
      // A's fill (device pixels at 1 a unit, y down) on its band: from its 0.6 pad, short of B's text at 40.1
      const paper = (run.rows[0]!.ops as unknown as { op: string; rects?: number[][] }[]).filter(o => o.op === 'paper').flatMap(o => o.rects ?? [])
      const band = paper.filter((r: number[]) => r[1]! < 300 - 98 && r[1]! + r[3]! > 300 - 107)
      expect(Math.min(...band.map((r: number[]) => r[0]!))).toBeCloseTo(9.4, 6)
      expect(Math.max(...band.map((r: number[]) => r[0]! + r[2]!))).toBeLessThanOrEqual(40.1 - 0.3 + 1e-6)
    })
  }
})
