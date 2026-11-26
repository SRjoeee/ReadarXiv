// Where each glyph of a run stands (export/measure.ts), against a measure of our own with a known kern pair: A and V 600 units
// each, the pair AV kerned by -80, as a browser sets a kerned run whole. A glyph stands where the kerned run places it: V after
// A at 600 - 80, never at A's width alone (#685: 4704036106); the run's end, the last glyph's place and its advance, is the
// whole run's width.
import { describe, expect, it } from 'vitest'
import { type Measure, offsetsOf } from '../../src/export/measure.ts'

const ADV: Record<string, number> = { A: 600, V: 600, o: 500, f: 300, i: 250, '\u{1D400}': 700 }
const KERN: Record<string, number> = { AV: -80, VA: -80, Vo: -40 }
/** a kerned run's width: its characters' advances and the kern of each adjacent pair */
const measure: Measure = (_font, text) => {
  const cs = [...text]
  let w = 0
  cs.forEach((c, k) => {
    w += ADV[c] ?? 500
    if (k) w += KERN[`${cs[k - 1]}${c}`] ?? 0
  })
  return w
}
const FACE = '400 100px "axt-test"'

describe("a glyph's place in a run, as the browser sets it", () => {
  it('stands each glyph where the kerned run places it: V after A at 520, not at 600', () => {
    expect(offsetsOf(measure, FACE, 'AV')).toEqual([0, 520])
    expect(offsetsOf(measure, FACE, 'AVA')).toEqual([0, 520, 1040])
  })

  it("ends the run at its whole width: the last glyph's place and its advance", () => {
    for (const s of ['AV', 'VAVo', 'Vo', 'AoA']) {
      const offs = offsetsOf(measure, FACE, s)
      const last = [...s].at(-1) as string
      expect([s, (offs.at(-1) ?? 0) + (ADV[last] ?? 500)]).toEqual([s, measure(FACE, s)])
    }
  })

  it('places a character beyond the BMP by its code point, both halves of its pair at its place', () => {
    const s = 'A\u{1D400}V'
    const offs = offsetsOf(measure, FACE, s)
    expect([offs[0], offs[1], offs[3]]).toEqual([0, 600, 1300])
  })
})
