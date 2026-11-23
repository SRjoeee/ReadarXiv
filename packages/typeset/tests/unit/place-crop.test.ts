// D.links' placeCrop (emit/links.ts): a link over a piece drawn as a crop is placed over the crops of that piece, and over
// nothing else of the line. A crop names its element by `k`; a label's crop names none (unit/decor.ts carriedCrop, the
// numbered heading's number), and so does the label's target (lay/links.ts: `{ draw: 'crop' }`). A word, a space or a control
// token is no crop, whatever its absent `k` reads as: before, the label's target took every such item of the line and the
// placement threw on the first (`crop` of undefined), the whole page's lay with it.
import { describe, expect, it } from 'vitest'
import { placeUnit } from '../../src/emit/links.ts'

/** a label's crop drawn at x 10, 10 wide (its source ink 10..20 on page 1, baseline 100), and a word after it */
const label = {
  t: { crop: { mode: 'crop', page: 1, crop: [10, 98, 20, 108], baseline: 100, text: '1' } },
  x: 10,
  w: 10,
}
const word = { t: { s: 'word' }, x: 24, w: 30 }
const space = { t: { space: true, s: ' ' }, x: 20, w: 4 }
const place = (items: unknown[], to: { k?: number; draw: 'crop' }) =>
  placeUnit({
    groups: [
      { to, annots: [{ q: 1, a: { i: 0, rect: [9, 97, 21, 109], g2: { x: [], y: [], ch: [] } }, tier: 'geometry' }] },
    ],
    lines: [{ line: { page: 1, baseline: 100, items } as never, runs: [] }],
    edge: () => 0,
    band: () => ({ top: 108, bottom: 98 }),
    scale: 1,
  })

describe('placeCrop: over the crops of the target’s piece alone', () => {
  it('places a link over the label’s crop whatever else its line holds', () => {
    for (const items of [[label], [label, space, word], [word, space, label]]) {
      const got = place(items, { draw: 'crop' })
      expect(got.tried).toEqual([])
      expect(got.records).toHaveLength(1)
      // (over the crop's drawn box, the annotation's own box mapped into it: 10..20 across)
      const [x0, , x1] = got.records[0]!.rec.boxes
      expect(x0).toBeGreaterThanOrEqual(10)
      expect(x1).toBeLessThanOrEqual(20)
    }
  })
  it('places nothing where the line holds no crop of the piece: an element’s link never over the label’s crop or a word', () => {
    expect(place([word, space, word], { draw: 'crop' })).toEqual({
      records: [],
      tried: [{ q: 1, i: 0, why: 'unplaced' }],
    })
    expect(place([label, space, word], { k: 3, draw: 'crop' })).toEqual({
      records: [],
      tried: [{ q: 1, i: 0, why: 'unplaced' }],
    })
  })
})
