// U.decor on synthetic blocks: what the sample shows only in part (a carried label set by its line's own baseline, a centred
// line widened to the nearer side, a cell's centring undefined).
import { describe, expect, it } from 'vitest'
import type { Block } from '../../src/unit/blocks.ts'
import { carriedCrop, type DecorBlock, decorAfter, decorBefore, originalLines, widen } from '../../src/unit/decor.ts'

const block = (o: Partial<Block> = {}): DecorBlock => ({
  page: 1,
  rects: [[1, 100, 500, 200, 510]],
  x0: 100,
  x1: 200,
  top: 510,
  bottom: 500,
  h: 10,
  pitch: 12,
  indent: 0,
  centred: false,
  measures: null,
  after: 0,
  B: [502],
  exact: [true],
  sizes: [10],
  pitch0: null,
  free: 0,
  flow: 0,
  ...o,
})

describe('U.decor', () => {
  it('widens a centred single line as far to either side as the nearer allows', () => {
    const b = block({ centred: true })
    widen(b, { column: [50, 400], left: [80], right: [] })
    expect([b.x0, b.x1]).toEqual([80, 220])
    const r = block()
    widen(r, { column: [50, 400], left: [], right: [300] })
    expect([r.x0, r.x1]).toEqual([100, 300])
    const two = block({
      rects: [
        [1, 100, 500, 200, 510],
        [1, 100, 488, 200, 498],
      ],
    })
    widen(two, { column: [50, 400], left: [], right: [] })
    expect(two.x1).toBe(200)
  })

  it("widens a cell's single line as any single line (the checkpoint's \"Ours\": a column head set in its own ink's width wrapped)", () => {
    // (1810.04805v2 p7's \multicolumn{5}{c}{Ours}: its ink 172.42..189.85, the room beside it 72..290.27; the cell laid in its ink's
    // 17 pt, its translation wrapped to two lines where the original's one line had room on both sides)
    const cell = block({ centred: true, rects: [[1, 172.42, 650, 189.85, 659]], x0: 172.42, x1: 189.85 })
    const after = {
      title: false,
      front: false,
      luFlush: null,
      label: null,
      firstX0: undefined,
      s: 9,
      relabels: false,
      lead: false,
      labelHides: false,
      firstPage: 1,
      firstX: 172.42,
      kept: null,
      shortSkips: [],
      lineInfo: null,
    } as const
    decorAfter([cell], { ...after, kind: 'cell', side: () => ({ column: [72, 290.27], left: [], right: [] }) })
    expect([cell.x0, cell.x1]).toEqual([72, 290.27])
  })

  it('sets a carried label by its line’s own characters’ baseline, else its block’s', () => {
    const label = {
      x1: 120,
      text: '1.',
      chars: [
        { ch: '1', x0: 110, x1: 115, page: 1, yb: 503, size: 10 },
        { ch: '.', x0: 115, x1: 120, page: 1, yb: 503, size: 10 },
      ],
    }
    expect(carriedCrop(label, block(), undefined, 10, [502.5, 502.7, 502.6]).crop.baseline).toBe(502.6)
    const t = carriedCrop(label, block(), 130, 10, [])
    expect(t.crop).toEqual({ mode: 'crop', page: 1, crop: [109.6, 503 - 2.6, 129.6, 511], baseline: 502, text: '1.' })
    expect(t.cw).toBeCloseTo(20, 9)
  })

  it('centres a cell by its own lines where they tell, else as the file has the unit, undefined where neither tells', () => {
    const base = { kind: 'cell', label: null, relabels: false, labelKept: false, labelShown: false, rects: [] }
    expect(decorBefore({ ...base, byCell: undefined, luCentred: true }).centredFlag).toBeUndefined()
    expect(decorBefore({ ...base, byCell: null, luCentred: true }).centredFlag).toBe(true)
    expect(decorBefore({ ...base, byCell: false, luCentred: true }).centredFlag).toBe(false)
  })

  it('counts a block’s original lines by their baselines to a hundredth', () => {
    expect(originalLines({ B: [500, 500.001, 488] })).toBe(2)
  })
})
