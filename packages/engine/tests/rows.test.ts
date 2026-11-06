import { describe, expect, it } from 'vitest'
import type { DocGlyph } from '../src/doc.ts'
import { cutLines } from '../src/locate/lines.ts'
import { rowsOf } from '../src/locate/rows.ts'

/** a glyph at x on baseline y, its ink from `lo` to `hi` above the baseline (in sizes of 10 pt) */
const glyph = (u: string, x: number, y: number, lo = 0, hi = 0.43, w = 6): DocGlyph => ({
  u,
  code: u.codePointAt(0) as number,
  font: 'CMMI10',
  base: 'CMMI10',
  x0: x,
  x1: x + w,
  y,
  top: y + 10 * hi,
  bottom: y + 10 * lo,
  size: 10,
  ix0: x,
  ix1: x + w,
  n: 0,
  k: 0,
  form: false,
  blank: false,
  fill: 0,
})
const at = (gs: DocGlyph[]) => (i: number) => ({ page: 1, g: gs[i]! })

describe('a display’s rows', () => {
  // (TeX's \frac in a display: the numerator 6.8 pt over the baseline, the denominator 6.9 pt under it, the rule on the axis;
  // stream order x, =, the numerator, the denominator, the equation's number)
  const fraction = [
    glyph('x', 200, 500),
    glyph('=', 210, 500, 0.15, 0.37),
    ...[...'a+bc'].map((u, k) => glyph(u, 224 + 6 * k, 506.8)),
    glyph('d', 233, 493.1, 0, 0.69),
    glyph('(', 400, 500, -0.25, 0.75, 4),
    glyph('1', 404, 500, 0, 0.64),
    glyph(')', 410, 500, -0.25, 0.75, 4),
  ]
  it('holds a fraction’s parts in the row TeX set them in, which the text line rule cuts apart', () => {
    const list = fraction.map((_, i) => i)
    expect(cutLines(list, at(fraction)).length).toBeGreaterThan(1)
    const rows = rowsOf(list, at(fraction))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ page: 1, x0: 200, x1: 414, base: 500 })
    expect(rows[0]!.gs).toEqual(list)
  })
  it('joins a row’s parts that no ink of it reaches across where their places in the stream interleave', () => {
    // (the same fraction with a bare number after it: no ink spans the numerator, the row and the denominator, but the number
    // is shipped after both, in the row's box)
    const gs = [...fraction.slice(0, 7), glyph('2', 404, 500, 0, 0.64)]
    const list = gs.map((_, i) => i)
    expect(rowsOf(list, at(gs))).toHaveLength(1)
    // (and with nothing after the denominator, the parts are three bands that nothing joins: the reading's limit)
    expect(rowsOf([0, 1, 2, 3, 4, 5, 6], at(gs))).toHaveLength(3)
  })
  it('holds a row’s deep subscripts in it, their ink reaching into the row’s', () => {
    // (2307.16209v1 p43's shape: a formula whose parts at 182.59 and the subscripts 8.2 pt under them alternate in the stream)
    const gs = [
      glyph('V', 158, 182.59, -0.18, 1.39),
      glyph('i', 203, 174.39, -0.18, 0.97),
      glyph('W', 266, 182.59, -0.18, 1.39),
      glyph('j', 299, 174.39, -0.18, 0.97),
      glyph('Z', 359, 182.59, -0.18, 1.23),
    ]
    expect(rowsOf([0, 1, 2, 3, 4], at(gs))).toHaveLength(1)
  })
  it('cuts the rows of an alignment, each its own band shipped after the one before', () => {
    const gs = [
      glyph('a', 200, 520),
      glyph('=', 210, 520, 0.15, 0.37),
      glyph('b', 222, 520, 0, 0.69),
      glyph('=', 210, 505, 0.15, 0.37),
      glyph('c', 222, 505),
    ]
    const rows = rowsOf([0, 1, 2, 3, 4], at(gs))
    expect(rows.map((r) => [r.base, r.gs])).toEqual([
      [520, [0, 1, 2]],
      [505, [3, 4]],
    ])
  })
  it('joins a band its own rule reaches into, and makes no row of rules alone', () => {
    const gs = [glyph('x', 200, 500), glyph('y', 200, 489)]
    // (a rule from 488.5 to 500.5: the two glyphs' bands meet in it)
    const rows = rowsOf([0, 1], at(gs), [
      { page: 1, x0: 199, y0: 488.5, x1: 210, y1: 500.5 },
      { page: 1, x0: 0, y0: 100, x1: 10, y1: 101 },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ bottom: 488.5, top: 504.3 })
  })
})
