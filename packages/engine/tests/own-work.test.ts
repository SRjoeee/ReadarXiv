// The work a paper's ownership may cost (own/stream.ts WORK, ownedOf: "A name set twice owns nothing, nor where the work is
// past its bound"): each piece's range costs its glyphs, and ranges that overlap cost them again. A page of pieces whose ranges
// all span the same glyphs (a figure's frame holding them, so that no piece keeps any) is past the bound after WORK visits:
// the pieces after that own nothing, 'past the glyphs a paper may own'; those before are read as ever
import { describe, expect, it } from 'vitest'
import { type Glyph, packGlyphs } from '../src/ink.ts'
import { type Follow, OWNED_HOW, ownedOf, STREAM_COLUMNS, type StreamPage } from '../src/own/stream.ts'

/** one page of `n` glyphs on a line, a figure's frame around them all (g1a, g1b), and `pieces` pieces each opened at the
 *  first glyph and closed after the last (p1.<k>a, p1.<k>b) */
function overlapping(n: number, pieces: number): StreamPage {
  const glyphs: Glyph[] = []
  for (let g = 0; g < n; g++) {
    const x = 72 + (g % 90) * 5,
      y = 700 - Math.floor(g / 90) * 0.01
    glyphs.push({
      u: 'a',
      x0: x,
      x1: x + 5,
      y,
      top: y + 7,
      bottom: y - 2,
      size: 10,
      font: 'F',
      ix0: x,
      ix1: x + 5,
    } as Glyph)
  }
  const at = (name: string, glyph: number) => ({ name, glyph, box: 0 })
  const ks = Array.from({ length: pieces }, (_, k) => k)
  return {
    glyphs: packGlyphs(glyphs, { columns: STREAM_COLUMNS }),
    boxes: [],
    points: [at('g1a', 0), ...ks.map((k) => at(`p1.${k}a`, 0)), ...ks.map((k) => at(`p1.${k}b`, n)), at('g1b', n)],
    boxAt: new Int32Array(n),
    view: [0, 0, 612, 792],
  } as StreamPage
}
const follow: Follow = { closing: false, want: '', ends: [], blocked: false }

describe("the work a paper's ownership may cost (WORK)", () => {
  it('owns nothing for the pieces past the bound, each before it read as ever', () => {
    // (20,000 glyphs a piece: the bound, 20,000,000 visits, is passed after the 1,001st piece)
    const out = ownedOf([overlapping(20_000, 1_003)], { follows: () => follow })
    const how = (k: number) => OWNED_HOW[out.get(`p1.${k}a`)!.how]
    expect([0, 1, 999, 1_000].map(how)).toEqual(['closed', 'closed', 'closed', 'closed'])
    expect([1_001, 1_002].map(how)).toEqual(['past the glyphs a paper may own', 'past the glyphs a paper may own'])
  })
})
