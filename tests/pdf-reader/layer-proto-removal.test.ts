import { beforeAll, describe, expect, it } from 'vitest'
import type { Glyph } from '@/pdf-reader/engine/layout/ink.mjs'
import { fileOwnership, glyphsOfChars, indicesOf, pageMasks, planOf, type RemovalInk, unitRemoval, unmappedOf } from '@/pdf-reader/engine/layer-proto/removal.mjs'

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

describe("each unit's share of the pixels the removed page changes", () => {
  // a 20 x 10 page: unit 0's glyph box over x 2-5, unit 1's over x 10-13; the removed ink differs at x 3-4 and 11-12, and
  // unit 0's glyph has a tail below its box (rows 7-8)
  const W = 20, H = 10
  const plane = (on: (x: number, y: number) => boolean) => { const d = new Uint8ClampedArray(W * H * 4).fill(255); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) d.fill(0, 4 * (y * W + x), 4 * (y * W + x) + 3); return d }
  const O = plane((x, y) => (x >= 3 && x <= 4 && y >= 2 && y <= 8) || (x >= 11 && x <= 12 && y >= 2 && y <= 6) || (x === 17 && y === 5)), R = plane((x, y) => x === 17 && y === 5)
  it("grows a unit's share over its glyph's ink past its box, a pixel around, never into another's", () => {
    const m = pageMasks(O, R, W, H, [{ boxes: [[2, 1, 6, 7]] }, { boxes: [[10, 1, 14, 7]] }])
    expect(m.unclaimed).toBe(0)
    const cover = (rects: number[][], x: number, y: number) => rects.some(r => x >= r[0]! && x < r[0]! + r[2]! && y >= r[1]! && y < r[1]! + r[3]!)
    // unit 0: its ink and its tail (row 8), a pixel around; not unit 1's ink, nor the kept dot at 17
    for (let y = 2; y <= 8; y++) expect(cover(m.rects[0]!, 3, y)).toBe(true)
    expect(cover(m.rects[0]!, 2, 9)).toBe(true)
    expect(cover(m.rects[0]!, 11, 3)).toBe(false)
    expect(cover(m.rects[1]!, 12, 6)).toBe(true)
    expect(cover(m.rects[1]!, 3, 3)).toBe(false)
    expect([...m.rects[0]!, ...m.rects[1]!].some(r => cover([r], 17, 5))).toBe(false)
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
  it("removalOps: the swap over the unit's own rectangles, its crops from the placeholders' page where its source page is removed", () => {
    const px = (x: number, y: number) => [x * 2, (200 - y) * 2] as [number, number]
    const L = { scale: 1, lines: [{ page: 1, baseline: 100, items: [{ x: 20, w: 10, t: { crop: { crop: [40, 50, 50, 60], page: 1, baseline: 52, k: 3 } } }] }] } as never
    const audit: Record<string, unknown>[] = []
    const ops = L2.removalOps(L, 1, { px, k: 2, hasSource: () => true, pxOf: () => px, rects: [[1, 2, 3, 4]], lines: [[10, 98, 60, 108]], removed: () => true, audit: audit as never, id: 7 })
    expect(ops).toEqual([{ op: 'swap', page: 1, rects: [[1, 2, 3, 4]] }, { op: 'crop', page: 1, plane: 'P', src: [80, 280, 20, 20], dst: [40, 184, 20, 20] }])
    expect(audit.map(a => a.what)).toEqual(['erase', 'crop'])
    expect(L2.removalOps(L, 1, { px, k: 2, hasSource: () => true, pxOf: () => px, rects: [], removed: () => false }).map(o => (o as { plane?: string }).plane ?? o.op)).toEqual(['O'])
  })
  it("drawOps: a swap is the removed page's pixels clipped to its rectangles; a crop cut from its plane", () => {
    const { ctx, calls } = recorder()
    const O = { id: 'O' } as unknown as CanvasImageSource, R = { id: 'R' } as unknown as CanvasImageSource, P = { id: 'P' } as unknown as CanvasImageSource
    L2.drawOps(ctx, [{ op: 'swap', page: 1, rects: [[1, 2, 3, 4]] }, { op: 'crop', page: 1, plane: 'P', src: [1, 1, 1, 1], dst: [2, 2, 2, 2] }], 2, (_p, plane) => (plane === 'R' ? R : plane === 'P' ? P : O))
    expect(calls).toEqual([
      ['save'], ['=fillStyle', '#fff'],
      ['save'], ['beginPath'], ['rect', 2, 4, 6, 8], ['clip'], ['drawImage', R, 0, 0], ['restore'],
      ['=globalCompositeOperation', 'darken'], ['drawImage', P, 2, 2, 2, 2, 4, 4, 4, 4], ['=globalCompositeOperation', 'source-over'],
      ['restore'],
    ])
  })
})
