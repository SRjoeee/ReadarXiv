// @vitest-environment node
// A lead that is no label's form, standing apart from its unit's text, is released: its ink is left the original's
// (own/own.ts, `labelKept`, PDF-READER §19.9). The label's claim took the lead's glyphs and the painted boxes in its range
// (the one-ink law: a box TeX set with the lead is the lead's), so the release gives back both: a box left in the group of a
// label that is no longer drawn is erased with the unit and drawn by no crop, ink lost from the page.
// Content of our own: a page as a stream of points, glyphs and boxes, the units the ownership reads.
import { describe, expect, it } from 'vitest'
import { ownOf } from '../src/own/own.ts'

/** a line of two names: the second's lead a word of no label's form ("and"), apart from its text, with a painted rule under
 *  the word (a box of the page, painted before the second name's start) */
function line() {
  const glyphs: {
    n: number
    k: number
    u: string
    x0: number
    x1: number
    y: number
    size: number
    top: number
    bottom: number
  }[] = []
  const points: { name: string; glyph: number; box: number }[] = []
  const boxes: number[] = []
  const paths: number[] = []
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
  const y = 600
  points.push({ name: '0s', glyph: 0, box: 0 })
  run('AnnLee', 200, y, 10)
  points.push({ name: '0e', glyph: glyphs.length, box: 0 })
  run('and', 240, y, 10)
  // (the rule under "and": across the word, from under the baseline to over it, painted before the next name's start)
  boxes.push(240, y - 1, 255, y + 2)
  paths.push(0)
  points.push({ name: '1s', glyph: glyphs.length, box: boxes.length / 4 })
  run('BoRay', 262, y, 10)
  points.push({ name: '1e', glyph: glyphs.length, box: boxes.length / 4 })
  const boxAt = glyphs.map((g) => (g.x0 >= 262 ? 1 : 0))
  return { glyphs, points, boxes, paths, boxAt, view: [0, 0, 612, 792] as const }
}
const units = [
  { kind: 'author', src: 'Ann Lee' },
  { kind: 'author', src: 'Bo Ray' },
]

describe('a lead released from its unit (no label’s form, apart from its text)', () => {
  it('gives its boxes back to the original with its glyphs', () => {
    const pages = [line()]
    const r = ownOf(pages, { units })
    expect(r.units.get(1)?.labelKept).toBe(true)
    // (the word's glyphs are the original's: no group)
    const lead = pages[0]!.glyphs.flatMap((g, i) => (g.x0 >= 240 && g.x0 < 262 ? [r.glyphs[0]![i]] : []))
    expect(lead).toEqual([null, null, null])
    // (and so is the rule TeX painted with it)
    expect(r.boxes[0]![0]).toBeNull()
    expect([...r.units.get(1)!.groups]).not.toContain('u1.l')
  })
})
