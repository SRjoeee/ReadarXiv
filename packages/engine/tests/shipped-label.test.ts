// @vitest-environment node
// A paragraph that crosses a column, the column's notes shipped inside the body between its two parts (a class that sets a
// column's footnotes inside the body it brackets, REVTeX's grid): the note's whole unit stands inside the paragraph's range, and
// the note's text is the note's (an earlier unit's text first), but its label, the number before its start on the note's own
// line, fell to the paragraph's text. The paragraph laid a line of its translation there, over the note (2611.16683v1 p3).
// The glyphs right before such a unit's start on its start's line, a label's form, the paragraph setting nothing more on that
// line, are that unit's label, no text of the enclosing unit's. Content of our own: a page as a stream of points and glyphs.
import { describe, expect, it } from 'vitest'
import { ownOf } from '../src/own/own.ts'

type G = {
  n: number
  k: number
  u: string
  x0: number
  x1: number
  y: number
  size: number
  top: number
  bottom: number
}
/** the paragraph (unit 1) and a unit TeX shipped inside its range (unit 0): `inline`, set on the paragraph's own line after
 *  its words; else a note at the column's foot, its number first on its line */
function page(o: { inline?: boolean } = {}) {
  const glyphs: G[] = []
  const points: { name: string; glyph: number; box: number }[] = []
  // (TeX's paragraph starts, `q<n>`: the paragraph's alone; REVTeX's notes state none of their own)
  const paras: { name: string; glyph: number; box: number }[] = [{ name: 'q1', glyph: 0, box: 0 }]
  const run = (s: string, x: number, y: number, size: number) => {
    const w = 0.5 * size
    for (const u of s) {
      glyphs.push({
        n: glyphs.length,
        k: 0,
        u,
        x0: x,
        x1: x + w,
        y,
        size,
        top: y + 0.68 * size,
        bottom: y - 0.02 * size,
      })
      x += w
    }
  }
  points.push({ name: '1s', glyph: 0, box: 0 })
  run('Ourparagraph', 72, 700, 10)
  run('goeson', 72, 688, 10)
  if (o.inline) {
    run('with', 110, 688, 10)
    points.push({ name: '0s', glyph: glyphs.length, box: 0 })
    run('Inner', 135, 688, 10)
    points.push({ name: '0e', glyph: glyphs.length, box: 0 })
  } else {
    run('2', 56, 95, 6)
    points.push({ name: '0s', glyph: glyphs.length, box: 0 })
    run('Anoteofours.', 62, 92, 8)
    points.push({ name: '0e', glyph: glyphs.length, box: 0 })
  }
  run('andends.', 317, 730, 10)
  points.push({ name: '1e', glyph: glyphs.length, box: 0 })
  return { glyphs, points, paras, boxes: [], paths: [], boxAt: glyphs.map(() => 0), view: [0, 0, 612, 792] as const }
}
// (the note an earlier unit than the paragraph, as the source holds them: a note written before the paragraph that crosses the
// column, its text claimed first)
const units = [
  { kind: 'footnote', src: 'A note of ours.' },
  { kind: 'para', src: 'Our paragraph goes on and ends.' },
]
/** each glyph's owner, as text: the glyphs of `s` (their order on the page) */
const ownersOf = (s: string, o: { inline?: boolean } = {}) => {
  const pg = page(o)
  const r = ownOf([pg], { units })
  const at = pg.glyphs
    .map((g) => g.u)
    .join('')
    .indexOf(s)
  return [...s].map((_, j) => r.glyphs[0]![at + j])
}

describe("a unit TeX shipped inside another's range, its start opening a line of its own", () => {
  it("the number before the note's start on the note's line is the note's label, not the paragraph's text", () => {
    expect(ownersOf('2')).toEqual(['u0.l'])
    expect(ownersOf('Anote')).toEqual(['u0', 'u0', 'u0', 'u0', 'u0'])
    expect(ownersOf('andends')).toEqual(Array(7).fill('u1'))
  })

  it("the other side: a unit set on the paragraph's own line after its words: those words stay the paragraph's", () => {
    expect(ownersOf('with', { inline: true })).toEqual(['u1', 'u1', 'u1', 'u1'])
  })
})
