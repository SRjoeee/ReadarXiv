// @vitest-environment node
// A crop of the parity's drawing in place or moved (lab/typeset/parity/fidelity.mjs inPlace, which render.mjs reads to set a
// moved crop's drawn place aside from the `erased` reading): in place only within one device pixel of its source at the
// drawing's scale, the bound the pixel comparison reads a glyph shown by (analyse.mjs partsOf: its ink there or within a device
// pixel). 2608.25210v2-zh p3 t56 on the fresh rows' sheet: the crop of `[sentence_2]` drawn 0.43 pt right of its source, in
// place by half a point and 1.15 device px off by the comparison, read its whole "[" as the original's shown in part.
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { DEVICE_PT, inPlace } from '../../lab/typeset/parity/fidelity.mjs'

/** a crop as render.mjs records it: [group, x0, y0, x1, y1 (drawn), piece, sx0, sy0, sx1, sy1 (its source on A), source page] */
const crop = (dx: number, page = 3) => [55, 498.77 + dx, 368.55, 545.3 + dx, 377.33, '11', 498.77, 368.55, 545.3, 377.33, page]

describe('a crop in place is one drawn within a device pixel of its source', () => {
  it('reads a device pixel at the drawing’s scale: PDF.js’s scale 1 at device scale 2, 0.375 pt', () => {
    expect(DEVICE_PT).toBeCloseTo(0.375, 6)
  })
  it('a crop 0.43 pt off its source is moved (its place set aside), one 0.3 pt off in place', () => {
    expect(inPlace(crop(0.43), 3)).toBe(false)
    expect(inPlace(crop(0.3), 3)).toBe(true)
    expect(inPlace(crop(0), 3)).toBe(true)
  })
  it('a crop of another page’s source is moved, wherever it stands', () => {
    expect(inPlace(crop(0, 4), 3)).toBe(false)
  })
})
