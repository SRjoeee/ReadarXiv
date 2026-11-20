// An element's ink as crops, one a line of TeX's (unit/crops.ts cropPartsOfSegments): its segments (El.ink in the layout
// file's form: page, x0, baseline, x1, top, bottom) are one line's where they stand on one page and meet across, on one
// baseline (within half a PDF unit, LINE_OF) or stacked, one over the other by more than half the smaller one's height.
// Segments made by hand at 10 pt.
import { describe, expect, it } from 'vitest'
import { cropPartsOfSegments } from '../../src/unit/crops.ts'

const r2 = (v: number) => Math.round(v * 100) / 100
const partsOf = (segs: number[]) => cropPartsOfSegments(segs)?.map((q) => [q.page, q.baseline, q.crop.map(r2)])

describe("an element's crops, one a line of TeX's", () => {
  it('joins two segments on one baseline whose inks meet by less than half the smaller one: one line, one crop', () => {
    // (the part states an element's ink as boxes, each with its baseline: two on one line of TeX's stand on that line's
    // baseline, as the prepare states an element outside its unit's own lines, cut into lines of its own each set on the
    // baseline of the unit's line it stands on, and a rule of its own beside its glyphs. Here the one raised over the
    // baseline at 500, x 150-170, top 508, bottom 499, the other lowered under it, x 180-200, top 499.5, bottom 494: their
    // inks meet by 0.5, under half the smaller one's height (5.5), so they stand stacked by too little to be read as one line
    // that way; on one baseline they are one line)
    expect(partsOf([1, 150, 500, 170, 508, 499, 1, 180, 500, 200, 499.5, 494])).toEqual([
      [1, 500, [149.6, 493.7, 200.4, 508.3]],
    ])
  })
  it("keeps the two lines of a formula TeX broke apart where a script of one reaches into the other's ink: two crops", () => {
    // (its first line at 500, a subscript down to 497.6; its second line at 488, up to 497.8: their inks meet by 0.2, their
    // baselines a line's pitch apart, 12: each its own crop on its own baseline)
    expect(partsOf([1, 150, 500, 200, 507, 497.6, 1, 72, 488, 100, 497.8, 486])).toEqual([
      [1, 500, [149.6, 497.3, 200.4, 507.3]],
      [1, 488, [71.6, 485.7, 100.4, 498.1]],
    ])
  })
})
