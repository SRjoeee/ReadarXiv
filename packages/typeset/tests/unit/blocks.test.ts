// U.blocks on synthetic lines: the shapes today's blocks2 gives (the replay holds it to today on real units).
import { describe, expect, it } from 'vitest'
import { blocks, evenGridOf, type LineInfo, measuresOf } from '../../src/unit/blocks.ts'
import { type Rect, rectKey } from '../../src/util.ts'

/** a unit's line at baseline `base`, size 10, from x0 to x1, its row `j` in frame 0 */
const line = (base: number, x0: number, x1: number, j: number): [Rect, LineInfo] => [
  [1, x0, base - 2.15, x1, base + 6.83],
  { baseline: base, size: 10, top: base + 7.5, bottom: base - 2.5, exact: true, file: true, j, frame: 0 },
]
const input = (ls: [Rect, LineInfo][], more: object = {}) => ({
  rects: ls.map((l) => l[0]),
  pageViews: [],
  keep: null,
  lineInfo: new Map(ls.map(([r, i]) => [rectKey(r), i])),
  centred: false,
  ...more,
})

describe('U.blocks', () => {
  it('sets a paragraph’s lines in one block on the original’s baselines, its pitch the mean of equal gaps', () => {
    const ls = [line(700, 72, 300, 0), line(688, 72, 300, 1), line(676, 72, 240, 2)]
    const [b, ...rest] = blocks(input(ls))
    expect(rest).toEqual([])
    expect(b!.B).toEqual([700, 688, 676])
    expect(b!.pitch0).toBe(12)
    expect(b!.flow).toBe(0)
    expect(b!.after).toBe(0)
  })
  it('splits around a kept line and counts the kept region the text passes', () => {
    const ls = [line(700, 72, 300, 0), line(688, 120, 250, 1), line(676, 72, 300, 2)]
    const kept = rectKey(ls[1]![0])
    const bs = blocks(input(ls, { keep: new Set([kept]), regionOf: new Map([[kept, 0]]), referenced: new Set([0]) }))
    expect(bs.map((b) => b.B)).toEqual([[700], [676]])
    expect(bs.map((b) => b.after)).toEqual([0, 1])
    // (a kept region between them: two flows)
    expect(bs.map((b) => b.flow)).toEqual([0, 1])
  })
  it('closes a gap TeX’s \\lineskip rule opened to the block’s pitch (the even grid, 2026-10-29)', () => {
    expect(evenGridOf([700, 688, 673, 661], [false, true, false], 12)).toEqual([700, 688, 676, 664])
    const ls = [line(700, 72, 300, 0), line(688, 72, 300, 1), line(673, 72, 300, 2), line(661, 72, 300, 3)]
    // (line 2 is tall: its top 3 over the usual, so the rule's gap is 2.5 + 10.5 + 1 = 14, and 15 is not within it)
    ls[2]![1].top = 683.5
    expect(blocks(input(ls, { lineskip: [1, 0] }))[0]!.E).toBeUndefined()
    ls[2]![1].top = 684.5
    expect(blocks(input(ls, { lineskip: [1, 0] }))[0]!.E).toEqual([700, 688, 676, 664])
  })
  it('reads a change of measure in a paragraph of four lines or more', () => {
    const rs: Rect[] = [700, 688, 676, 664, 652, 640].map((b, i) => [1, 72, b - 2.15, i < 3 ? 283 : 533, b + 6.83])
    const m = measuresOf(rs)
    expect([...new Set(m!.values())]).toEqual([
      [72, 283],
      [72, 533],
    ])
  })
})
