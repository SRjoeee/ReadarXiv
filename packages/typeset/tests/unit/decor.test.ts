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

  it("never widens a cell's single line: a cell is set in its own ink's width, widened only where clipped there (today's RUN:2116)", () => {
    // (1810.04805v2 p7's \multicolumn{5}{c}{Ours}: its ink 172.42..189.85, the room beside it 72..290.27. The checkpoint's
    // measure-10 widened every cell at once, so that the translation, clipped in its ink's 17 pt, had room; today's widens a
    // cell only as its fit's further step (fitFurther 'widen', the adapter's `wide`: the owner's ruling of 2026-11-08, table
    // cells sized as today), so that a column's cells keep their own widths)
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
    expect([cell.x0, cell.x1]).toEqual([172.42, 189.85])
    // (any other single line, as before)
    const head = block({ centred: true, rects: [[1, 172.42, 650, 189.85, 659]], x0: 172.42, x1: 189.85 })
    decorAfter([head], { ...after, kind: 'heading', side: () => ({ column: [72, 290.27], left: [], right: [] }) })
    expect([head.x0, head.x1]).toEqual([72, 290.27])
  })

  it('keeps a cell’s flush as TeX set its column, as any unit’s: an r column’s cell ends where its original ends', () => {
    // (2610.17024v1 p14's "Points", a header over right-aligned numbers, the class LaTeX built its column from r: its translation
    // ends at the original's end and, clipped there, widens to its left; a cell of an l column is never justified)
    const after = {
      title: false,
      front: false,
      label: null,
      firstX0: undefined,
      s: 9,
      relabels: false,
      lead: false,
      labelHides: false,
      firstPage: 1,
      firstX: 300,
      kept: null,
      shortSkips: [],
      lineInfo: null,
      side: () => undefined,
    } as const
    const right = block({ rects: [[1, 300, 650, 330, 659]], x0: 300, x1: 330 })
    decorAfter([right], { ...after, kind: 'cell', luFlush: 'right' })
    expect(right.flush).toBe('right')
    widen(right, { column: [250, 340], left: [270], right: [] })
    expect([right.x0, right.x1]).toEqual([270, 330])
    const left = block({ rects: [[1, 300, 650, 330, 659]], x0: 300, x1: 330 })
    decorAfter([left], { ...after, kind: 'cell', luFlush: 'left' })
    expect(left.flush).toBe('left')
    // (a cell centred by its column keeps its centring: a flush is never set over it)
    const centred = block({ centred: true, rects: [[1, 300, 650, 330, 659]], x0: 300, x1: 330 })
    decorAfter([centred], { ...after, kind: 'cell', luFlush: 'right' })
    expect(centred.flush).toBeUndefined()
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
