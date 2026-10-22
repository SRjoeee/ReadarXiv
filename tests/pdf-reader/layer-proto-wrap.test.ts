import { beforeAll, describe, expect, it } from 'vitest'

// A line of a unit on the layout file's lines grows only up to the measure TeX set it to (E3d, 2026-10-20): beside a
// float wrapped on the right, a narrow line that is not its block's last grew, as a justified line, out to its block's
// widest edge, over the caption's label beside it that no unit's rectangle held ("Table 6: A", 2602.23285 page 18), and
// the grown line then set the measure of every narrow line of its run: the translation was laid over the caption and the
// table.

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
const grow = (beside?: string, at?: number, src = 'x') => {
  const { rects, page } = scene(beside, at)
  L2.extendRects2(rects as never, [page] as never, [] as never, src, L1.wordsOf, L1.norm, [[0, 0, 612, 792]] as never, [page] as never, rects[0] as never)
  return rects
}

describe("a file line grows only up to its own measure", () => {
  it('a narrow line beside a wrapped float takes no label past its measure, and its run keeps its measure', () => {
    const rects = grow()
    expect(rects.map(r => r[3])).toEqual([150, 150, 150, 150, 280, 280])
    const blocks = L2.blocksOf2(rects as never, [[0, 0, 612, 792]] as never)
    expect(blocks.length).toBe(1)
    expect(blocks[0]!.measures?.get(`1|${rects[1]!.slice(1).join()}`)).toEqual([20, 150])
  })
  it("past its measure a formula's tail that goes on from it is still the line's; math across the float's gap is not", () => {
    // ("=(1)" half an em past its end: the line's; "(12" a column gap (10 pt, \columnsep) past it, the table's or the
    // caption's digits: not)
    expect(grow('=(1)')[1]![3]).toBeCloseTo(175.01, 2)
    expect(grow('(12', 160)[1]![3]).toBe(150)
  })
  it("nor past it over a label that holds one of the unit's source words (the source-word growth bounded too, the review of #426)", () => {
    // ("Fig. 6: A" beside it, the source "as Fig. 6 shows": "Fig" is the source's)
    const rects = grow('Fig. 6: A', 155, 'as Fig. 6 shows')
    expect(rects.map(r => r[3])).toEqual([150, 150, 150, 150, 280, 280])
    expect(L2.blocksOf2(rects as never, [[0, 0, 612, 792]] as never)[0]!.measures?.get(`1|${rects[1]!.slice(1).join()}`)).toEqual([20, 150])
  })
  it("within its measure, a formula's tail a gap of under 1.2 em past the line is still taken (0.6 em only past the measure)", () => {
    // the fifth line (not its block's last, its run's measure 20 to 280) set to 200, and "=(1)" 9 pt past it
    const B = [700, 688, 676, 664, 652, 640], x1 = [150, 150, 150, 150, 200, 280]
    const rects = B.map((b, j) => [1, 20, b - 2, x1[j]!, b + 8])
    const page = [...B.flatMap((b, j) => item('x'.repeat((x1[j]! - 20) / 5), 20, b, j)), ...item('=(1)', 209, 652, 9)]
    L2.extendRects2(rects as never, [page] as never, [] as never, 'x', L1.wordsOf, L1.norm, [[0, 0, 612, 792]] as never, [page] as never, rects[0] as never)
    expect(rects[4]![3]).toBeCloseTo(229.01, 2)
  })
})
