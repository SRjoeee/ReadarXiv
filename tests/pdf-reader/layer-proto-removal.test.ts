import { beforeAll, describe, expect, it } from 'vitest'
import type { Glyph } from '@/pdf-reader/engine/layout/ink.mjs'
import { fileOwnership, fileSwap, glyphsOfChars, indicesOf, pageDirty, pagePlan, planOf, type RemovalInk, unitRemoval, unmappedOf } from '@/pdf-reader/engine/layer-proto/removal.mjs'
import { swapRects } from '@/pdf-reader/engine/layer/swap.mjs'

// The layer's side of the text-removed PDF (layer-proto/removal.mjs): the text layer's characters carried to glyphs, the
// layout file's ownership, what a unit replaces, and each unit's share of the pixels the removed page changes; and the
// drawing's swap (layer2.mjs drawOps, removalOps)

/** a glyph on a baseline, as pageInk gives it with `indices` */
const g = (u: string, x0: number, y: number, n: number, k: number, size = 10, x1 = x0 + 0.5 * size): Glyph => ({ u, x0, x1, y, top: y + 0.75 * size, bottom: y - 0.22 * size, size, font: 'F', ix0: x0, ix1: x1, n, k })
const inkOf = (glyphs: Glyph[], paths: [number[], number][] = []): RemovalInk => ({ glyphs, boxes: paths.flatMap(p => p[0]), paths: paths.map(p => p[1]), shows: Math.max(0, ...glyphs.map(x => (x.n ?? 0) + 1)) })
/** a text item's characters (pageChars2's), each its share of the item */
const chars = (text: string, x: number, yb: number, item: number, size = 10) => [...text].map((ch, k) => ({ ch, x0: x + 0.5 * size * k, x1: x + 0.5 * size * (k + 1), yb, size, item, ix: x, k, st: {} as never }))

describe("the text layer's characters carried to glyphs", () => {
  it('in order, a ligature one glyph for two characters, a blank glyph for none', () => {
    const ink = inkOf([g('o', 10, 100, 0, 0), g('ﬁ', 15, 100, 0, 1), g(' ', 20, 100, 0, 2), g('x', 25, 100, 0, 3)])
    ink.glyphs[2]!.blank = true
    const map = glyphsOfChars(chars('ofix', 10, 100, 4), ink, 3)
    expect([...map]).toEqual([['3|4|0', 0], ['3|4|1', 1], ['3|4|2', 1], ['3|4|3', 3]])
    expect(unmappedOf(ink, map)).toEqual([2])
  })
  it("an item's characters only to glyphs on its baseline and within its extent; an accent set apart by its place", () => {
    const ink = inkOf([g('Z', 10, 100, 0, 0), g('u', 15, 100, 0, 1), g('¨', 15.5, 100, 0, 2), g('r', 20, 100, 0, 3), g('Z', 10, 80, 1, 0)])
    const map = glyphsOfChars(chars('Zu¨r', 10, 100, 0), ink, 1)
    expect([...map.values()]).toEqual([0, 1, 2, 3])
  })
})

describe("the layout file's ownership", () => {
  // a unit (1) with one line at baseline 100 from x 10 to 60, its erase rectangle; an inline placeholder (k 2) over x
  // 30-40 with a rule; a label of unit 2 kept; another unit's line (3) below
  const lu = (id: number, lines: number[], erase: number[][], ph = new Map(), labels = new Float64Array(0)) => ({ id, kind: 'para', lines: Float64Array.from(lines), frames: new Float64Array(6), erase: erase.map(e => Float64Array.from(e)), ph, labels })
  const units = new Map([
    [1, lu(1, [5, 10, 60, 100, 107.5, 97.8, 10, 0], [[10, 97.8, 60, 107.5]], new Map([[2, { kind: 'math', flags: 0, segs: Float64Array.from([5, 30, 100, 40, 107.5, 97]) }]]))],
    [3, lu(3, [5, 10, 60, 80, 87.5, 77.8, 10, 0], [[10, 77.8, 60, 87.5]])],
  ])
  const index = { unit: (id: number) => units.get(id) ?? null, onPage: () => [1, 3] } as never
  const ink = inkOf([g('a', 10, 100, 0, 0), g('x', 31, 100, 1, 0), g('b', 50, 100, 2, 0), g('c', 10, 80, 3, 0), g('z', 70, 100, 4, 0)], [[[30, 104, 40, 104.4], 0], [[0, 0, 300, 1], 1]])
  it("a glyph is the line's it stands on, inside its erase; a placeholder's by its segment; a rule inside a segment the placeholder's", () => {
    const own = fileOwnership(index, 5, ink)
    expect([...own.owner]).toEqual([1, 1, 1, 3, -1])
    expect([...own.ph]).toEqual([-1, 2, -1, -1, -1])
    expect([...own.paths]).toEqual([[0, { id: 1, k: 2 }]])
  })
  it("a unit replaces its own glyphs and its placeholders' rules, less what its reading keeps; a crop's glyphs are the crop's", () => {
    const own = fileOwnership(index, 5, ink)
    const charMap = new Map([['5|0|0', 0], ['5|1|0', 1], ['5|2|0', 2]])
    const prep = Object.assign(new Map([[0, { mode: 'crop', k: 0, page: 5, crop: [29.6, 97, 40.4, 107.5] }]]), {
      uc: [{ ch: 'a', page: 5, item: 0, k: 0 }, { ch: 'x', page: 5, item: 1, k: 0 }, { ch: 'b', page: 5, item: 2, k: 0 }],
      cat: new Map([['5|0|0', 'acc'], ['5|1|0', 'acc'], ['5|2|0', 'keep']]),
    }) as never
    const claimed = new Map<number, number>()
    const r = unitRemoval({ id: 1, page: 5, prep, tex: { lu: units.get(1) as never, kOf: [2] }, own, charMap, unmapped: unmappedOf(ink, charMap), ink, claimed, fileDrawn: new Set([1, 3]) })
    expect(r.glyphs).toEqual([0, 1])
    expect(r.paths).toEqual([0])
    expect(r.crops).toEqual([{ k: 0, glyphs: [1], paths: [0] }])
    expect([...claimed]).toEqual([[0, 1], [1, 1]])
    // as the plan names them, and back
    const plan = planOf(ink, r.glyphs, r.paths)
    expect(plan).toEqual({ glyphs: [0, 0, 1, 0], paths: [0] })
    expect(indicesOf(ink, plan)).toEqual({ glyphs: [0, 1], paths: [0] })
  })
  it("v0's own unit replaces the glyphs of what it accounts for, never the file's units' glyphs", () => {
    const own = fileOwnership(index, 5, ink)
    const charMap = new Map([['5|3|0', 3], ['5|4|0', 4]])
    const prep = Object.assign(new Map(), { uc: [{ ch: 'c', page: 5, item: 3, k: 0, x0: 10, x1: 15, yb: 80, size: 10 }, { ch: 'z', page: 5, item: 4, k: 0, x0: 70, x1: 75, yb: 100, size: 10 }], cat: new Map([['5|3|0', 'acc'], ['5|4|0', 'acc']]) }) as never
    const r = unitRemoval({ id: 9, page: 5, prep, tex: null, own, charMap, unmapped: [], ink, claimed: new Map(), fileDrawn: new Set([3]) })
    expect(r.glyphs).toEqual([4])
    expect(r.taken).toBe(1)
  })
})

describe("a unit's swap as rectangles over its glyphs' outlines", () => {
  const inside = (rects: number[][], x: number, y: number) => rects.some(r => x >= r[0]! && x <= r[2]! && y >= r[1]! && y <= r[3]!)
  it("covers its glyphs' boxes grown by the pad, a word's run joined, and never a removed glyph it does not replace", () => {
    // a word of two glyphs on a line (x 10-14 and 14.5-18), a kept glyph right after it (x 18.6-21), a glyph of the line
    // below whose ascender comes within the pad (y up: its top at 99.5 against the word's bottom at 100)
    const word = [[10, 100, 14, 107], [14.5, 100, 18, 107]], kept = [[18.6, 100, 21, 107]], below = [[12, 92, 15, 99.5]]
    const r = swapRects(word, [...kept, ...below], 0.4)
    expect(inside(r, 9.7, 103)).toBe(true)
    expect(inside(r, 14.2, 103)).toBe(true)
    expect(inside(r, 18.3, 103)).toBe(true)
    // nothing of the kept glyph's box, grown by half the pad, nor of the glyph below
    expect(inside(r, 18.45, 103)).toBe(false)
    expect(inside(r, 19, 103)).toBe(false)
    expect(inside(r, 13, 99.6)).toBe(false)
    expect(inside(r, 13, 99.85)).toBe(true)
    // with nothing to avoid, one rectangle a run
    expect(swapRects(word)).toHaveLength(1)
  })
})

describe("a unit's drawing from the layout file's rectangles", () => {
  // one unit, two lines (baselines 100 and 88), each erased over x 10-60; a placeholder over x 30-40 on the first line
  const lu = { id: 7, lines: Float64Array.from([1, 10, 60, 100, 107, 98, 10, 0, 1, 10, 60, 88, 95, 86, 10, 0]), erase: [Float64Array.from([10, 98, 60, 107]), Float64Array.from([10, 86, 60, 95])], ph: new Map([[3, { kind: 'math', flags: 0, segs: Float64Array.from([1, 30, 100, 40, 107, 98]), text: null }]]), labels: new Float64Array(0) } as never
  const lines = { rects: [[1, 10, 97.85, 60, 106.83], [1, 10, 85.85, 60, 94.83]], lineOf: new Map(), jOf: [0, 1] }
  const prepOf = (keep: string[], kept: number[]) => Object.assign(new Map(kept.map(k => [k, { k, mode: 'kept' }])), { keep, uc: [], cat: new Map(), label: null }) as never
  const inside = (rects: number[][], x: number, y: number) => rects.some(r => x >= r[0]! && x <= r[2]! && y >= r[1]! && y <= r[3]!)
  it('fills its lines with paper, and swaps where kept ink lies under them', () => {
    const a = fileSwap({ page: 1, lu, kOf: [-1, -1, -1, 3], lines, prep: prepOf([], []) })
    expect(a.swap).toEqual([])
    expect(inside(a.fill, 20, 103) && inside(a.fill, 35, 103) && inside(a.fill, 20, 90)).toBe(true)
    const b = fileSwap({ page: 1, lu, kOf: [-1, -1, -1, 3], lines, prep: prepOf([], []), dirty: [[50, 89, 52, 91]] })
    expect(inside(b.swap, 51, 90)).toBe(true)
    expect(inside(b.fill, 20, 103)).toBe(true)
  })
  it('keeps clear of a placeholder and a line its reading keeps, and of the units the file draws otherwise', () => {
    const c = fileSwap({ page: 1, lu, kOf: [-1, -1, -1, 3], lines, prep: prepOf(['1|10,85.85,60,94.83'], [3]), others: [[55, 104, 70, 110]] })
    expect(inside(c.fill, 35, 103)).toBe(false)
    expect(inside(c.fill, 20, 90)).toBe(false)
    expect(inside(c.fill, 20, 103)).toBe(true)
    expect(inside(c.fill, 57, 106)).toBe(false)
  })
  it('keeps clear of a label its reading keeps where the file has no row for it, and leaves it out of the audit', () => {
    // a list's mark at x 10-13 on the first line, which the file's erase rectangle starts at (1512.03385's p11)
    const mark = { page: 1, item: 0, k: 0, ch: '+', x0: 10, x1: 13, yb: 100, size: 10, rect: [10, 97.85, 60, 106.83] }
    const prep = Object.assign(new Map(), { keep: [], uc: [mark], cat: new Map([['1|0|0', 'keep']]), label: { text: '+', chars: [mark], x1: 13 } }) as never
    const d = fileSwap({ page: 1, lu, kOf: [-1, -1, -1, 3], lines, prep })
    expect(inside(d.fill, 11.5, 101)).toBe(false)
    expect(inside(d.fill, 20, 101)).toBe(true)
    expect(inside(d.lines, 11.5, 101)).toBe(false)
    expect(inside(d.lines, 20, 101)).toBe(true)
    // drawn in the target's name, it is replaced with the rest
    const drawn = Object.assign(new Map(), { keep: [], uc: [mark], cat: new Map([['1|0|0', 'keep']]), label: { text: '+', chars: [mark], x1: 13, drawn: '-' } }) as never
    expect(inside(fileSwap({ page: 1, lu, kOf: [-1, -1, -1, 3], lines, prep: drawn }).fill, 11.5, 101)).toBe(true)
  })
  it("the add-on's kept ink under the page's units' rectangles (the manifest's)", () => {
    const index = { onPage: () => [7], unit: () => lu } as never
    // a glyph the plan removes (0.0, on the first line), one it keeps (1.0, under the second's rectangle), one far off
    const ink = inkOf([g('a', 12, 100, 0, 0), g('b', 20, 88, 1, 0), g('c', 200, 300, 2, 0)])
    expect(pageDirty(index, 1, ink, { units: [{ glyphs: [0, 0], paths: [] }] })).toEqual([20, 85.8, 25, 95.5])
    // a display formula's glyphs under its own rows are kept, and no reader draws over them (2307.16209: 20767 boxes)
    const shown = { ...(lu as object), erase: [], ph: new Map([[5, { kind: 'display', flags: 0, segs: Float64Array.from([1, 100, 120, 140, 130, 110]), text: null }]]) }
    const disp = { onPage: () => [7], unit: () => shown } as never
    expect(pageDirty(disp, 1, inkOf([g('d', 110, 115, 0, 0)]), { units: [] })).toEqual([])
  })
})

describe("the paper's plan, from the layout file alone", () => {
  it("removes every glyph the file gives a unit and its label's; the placeholders' page holds each placeholder's and the free ink", () => {
    // one unit, one line (baseline 100, x 10-60) erased over x 10-60, a placeholder over x 30-40; a label box before it
    const unit = { lines: Float64Array.from([1, 10, 60, 100, 107, 98, 10, 0]), erase: [Float64Array.from([10, 98, 60, 107])], ph: new Map([[3, { kind: 'math', flags: 0, segs: Float64Array.from([1, 30, 100, 40, 107, 98]), text: null }]]), labels: Float64Array.from([1, 1, 2, 100, 8, 107, 98]) }
    const index = { onPage: (p: number) => (p === 1 ? [7] : []), unit: () => unit } as never
    const ink = inkOf([g('L', 3, 100, 0, 0), g('a', 12, 100, 1, 0), g('x', 32, 100, 1, 1), g('b', 50, 100, 1, 2), g('z', 70, 100, 2, 0)])
    const plan = pagePlan(index, 1, ink)
    expect(plan.units).toEqual([{ id: 7, glyphs: [0, 0, 1, 0, 1, 1, 1, 2], paths: [] }])
    // (and the ink no unit's text is: the glyph past the line, for a crop the file does not find)
    expect(plan.crops).toEqual([{ id: -1, k: -1, glyphs: [2, 0], paths: [] }, { id: 7, k: 3, glyphs: [1, 1], paths: [] }])
  })
})

describe('the drawing over the text-removed PDF', () => {
  let L2: typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  beforeAll(async () => {
    const gl = globalThis as { OffscreenCanvas?: unknown }
    gl.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length }) } } }
    L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  })
  function recorder() {
    const calls: unknown[][] = []
    const ctx = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? {} : (...a: unknown[]) => calls.push([k, ...a])), set: (_t, k, v) => { calls.push([`=${String(k)}`, v]); return true } }) as unknown as CanvasRenderingContext2D
    return { ctx, calls }
  }
  it("removalOps: the swap where kept ink lies under the unit, the paper elsewhere in one path, its crops from the original through their clips", () => {
    const px = (x: number, y: number) => [x * 2, (200 - y) * 2] as [number, number]
    const L = { scale: 1, lines: [{ page: 1, baseline: 100, items: [{ x: 20, w: 10, t: { crop: { crop: [40, 50, 50, 60], page: 1, baseline: 52, k: 3 } } }] }] } as never
    const audit: Record<string, unknown>[] = []
    const clips = new Map([[3, { rects: [[80, 280, 10, 10]], own: [[81, 281, 8, 8]] }]]) as never
    const ops = L2.removalOps(L, 1, { px, k: 2, hasSource: () => true, pxOf: () => px, rects: [[1, 2, 3, 4]], erase: [[5, 6, 7, 8], [9, 10, 11, 12]], clips, lines: [[10, 98, 60, 108]], removed: () => true, audit: audit as never, id: 7 })
    expect(ops).toEqual([{ op: 'swap', page: 1, rects: [[1, 2, 3, 4]] }, { op: 'paper', rects: [[5, 6, 7, 8], [9, 10, 11, 12]] }, { op: 'crop', page: 1, plane: 'O', src: [80, 280, 20, 20], dst: [40, 184, 20, 20], clip: [[80, 280, 10, 10]] }])
    expect(audit.map(a => a.what)).toEqual(['erase', 'crop'])
    // (no clip for a crop the unit's placeholders do not name: its box whole)
    expect(L2.removalOps(L, 1, { px, k: 2, hasSource: () => true, pxOf: () => px, rects: [], removed: () => false }).map(o => (o as { plane?: string }).plane ?? o.op)).toEqual(['O'])
  })
  it("drawOps: a swap is the removed page's pixels clipped to its rectangles; the paper one path; a crop through its clip", () => {
    const { ctx, calls } = recorder()
    const O = { id: 'O' } as unknown as CanvasImageSource, R = { id: 'R' } as unknown as CanvasImageSource
    L2.drawOps(ctx, [{ op: 'swap', page: 1, rects: [[1, 2, 3, 4]] }, { op: 'paper', rects: [[1, 1, 1, 1], [2, 1, 1, 1]] }, { op: 'crop', page: 1, plane: 'O', src: [1, 1, 2, 2], dst: [4, 4, 2, 2], clip: [[1, 1, 1, 1]] }], 2, (_p, plane) => (plane === 'R' ? R : O))
    expect(calls).toEqual([
      ['save'], ['=fillStyle', '#fff'],
      ['save'], ['beginPath'], ['rect', 2, 4, 6, 8], ['clip'], ['drawImage', R, 0, 0], ['restore'],
      ['beginPath'], ['rect', 2, 2, 2, 2], ['rect', 4, 2, 2, 2], ['fill'],
      ['save'], ['beginPath'], ['rect', 8, 8, 2, 2], ['clip'],
      ['=globalCompositeOperation', 'darken'], ['drawImage', O, 2, 2, 4, 4, 8, 8, 4, 4], ['=globalCompositeOperation', 'source-over'],
      ['restore'],
      ['restore'],
    ])
  })
})
