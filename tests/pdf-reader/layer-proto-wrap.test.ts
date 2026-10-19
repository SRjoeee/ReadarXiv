import { beforeAll, describe, expect, it } from 'vitest'

// A line of a unit on the layout file's lines grows only up to the measure TeX set it to (E3d, 2026-10-20): beside a
// float wrapped on the right, a narrow line that is not its block's last grew, as a justified line, out to its block's
// widest edge, over the caption's label beside it that no unit's rectangle held ("Table 6: A", 2602.23285 page 18), and
// the grown line then set the measure of every narrow line of its run: the translation was laid over the caption and the
// table. A unit on v0's anchors grows as before: its anchors fall short of its ink, which its growth repairs.

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
type L1 = typeof import('@/pdf-reader/engine/layer-proto/layer1.mjs')
let L2: L2
let L1: L1
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  L1 = await import('@/pdf-reader/engine/layer-proto/layer1.mjs')
})

/** a text item's characters, each 5 pt wide, from x on baseline yb at size 10 */
const item = (text: string, x: number, yb: number, n: number) => [...text].map((ch, k) => ({ ch, x0: x + 5 * k, x1: x + 5 * (k + 1), yb, size: 10, item: n, ix: x, k, st: { fam: 'serif' } }))
/** four narrow lines beside the float (20 to 150) and two under it (20 to 280), 12 pt apart from 700, each its own item's
 *  words filling it; the caption's label 5 pt past the second line's end, on its baseline, no unit's */
const scene = (beside = 'Table 6: A', at = 155) => {
  const B = [700, 688, 676, 664, 652, 640]
  const x1 = [150, 150, 150, 150, 280, 280]
  const rects = B.map((b, j) => [1, 20, b - 2, x1[j]!, b + 8])
  const chars = B.flatMap((b, j) => item('x'.repeat((x1[j]! - 20) / 5), 20, b, j))
  const label = item(beside, at, 688, 9)
  return { rects, page: [...chars, ...label] }
}
const grow = (measured: boolean, beside?: string, at?: number) => {
  const { rects, page } = scene(beside, at)
  L2.extendRects2(rects as never, [page] as never, [] as never, 'x', L1.wordsOf, L1.norm, [[0, 0, 612, 792]] as never, [page] as never, rects[0] as never, measured)
  return rects
}

describe("a file line grows only up to its own measure", () => {
  it('a narrow line beside a wrapped float takes no label past its measure, and its run keeps its measure', () => {
    const rects = grow(true)
    expect(rects.map(r => r[3])).toEqual([150, 150, 150, 150, 280, 280])
    const blocks = L2.blocksOf2(rects as never, [[0, 0, 612, 792]] as never)
    expect(blocks.length).toBe(1)
    expect(blocks[0]!.measures?.get(`1|${rects[1]!.slice(1).join()}`)).toEqual([20, 150])
  })
  it("past its measure a formula's tail that goes on from it is still the line's; math across the float's gap is not", () => {
    // ("=(1)" half an em past its end: the line's; "(12" a column gap (10 pt, \columnsep) past it, the table's or the
    // caption's digits: not, where v0's anchors take it, as before)
    expect(grow(true, '=(1)')[1]![3]).toBeCloseTo(175.01, 2)
    expect(grow(true, '(12', 160)[1]![3]).toBe(150)
    expect(grow(false, '(12', 160)[1]![3]).toBeCloseTo(175.01, 2)
  })
  it("v0's anchors grow as before: the justified line out over what stands beside it", () => {
    expect(grow(false)[1]![3]).toBeGreaterThan(200)
  })
})
