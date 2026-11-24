// @vitest-environment node
// A unit's head (its label, a placeholder TeX set before its start) owns the boxes TeX set in it as well as its glyphs: one ink
// (own/own.ts ownOf, the labels' pass). What TeX set in the head stands on the start's line BEFORE the start, as a glyph of the
// head does, so a box the head owns ends where the start begins, and a placed form is taken only with its whole placement
// (one included graphic is one ink). Two readings that broke without those bounds: a frame TeX painted round a theorem
// before its heading (a box behind its lines, across them) read as the heading label's, and a figure set beside a paragraph,
// one of its paths meeting the paragraph's first line, read as that paragraph's label, the rest of the figure no one's: the
// wrap refused the page ('a form partly owned').
// Content of our own: a page as a stream of points, glyphs and boxes, the units the ownership reads.
import { describe, expect, it } from 'vitest'
import { ownOf } from '../src/own/own.ts'

type Item =
  | { pt: string }
  | { s: string; y: number; size: number; x: number }
  | { box: [number, number, number, number]; form?: number }
/** a page from items in stream order: a point, a run of glyphs (each half its size wide), a painted box (its placed form, 0
 *  the page's own) */
function page(items: Item[]) {
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
  const boxes: number[] = [],
    paths: number[] = [],
    forms: number[] = [],
    boxAt: number[] = []
  for (const it of items) {
    if ('pt' in it) {
      points.push({ name: it.pt, glyph: glyphs.length, box: paths.length })
      continue
    }
    if ('box' in it) {
      boxes.push(...it.box)
      paths.push(paths.length)
      forms.push(it.form ?? 0)
      continue
    }
    let x = it.x
    const w = 0.5 * it.size
    for (const u of it.s) {
      boxAt.push(paths.length)
      glyphs.push({
        n: glyphs.length,
        k: 0,
        u,
        x0: x,
        x1: x + w,
        y: it.y,
        size: it.size,
        top: it.y + 0.68 * it.size,
        bottom: it.y - 0.02 * it.size,
      })
      x += w
    }
  }
  return { glyphs, points, boxes, paths, forms, boxAt, view: [0, 0, 612, 792] as const }
}
const boxGroups = (r: ReturnType<typeof ownOf>) => r.boxes[0]!
const units = [
  { kind: 'para', src: 'Our words before' },
  { kind: 'heading', src: 'Our result' },
]
const before: Item[] = [{ pt: '0s' }, { s: 'Ourwordsbefore', y: 700, size: 10, x: 60 }, { pt: '0e' }]

describe("a head's boxes are those TeX set in it, before its start, on its line", () => {
  it('an icon between the label and the start is the label’s', () => {
    const pages = [
      page([
        ...before,
        { s: 'Theorem1', y: 670, size: 10, x: 60 },
        { box: [101, 669, 107, 676] },
        { pt: '1s' },
        { s: 'Ourresult', y: 670, size: 10, x: 109 },
        { pt: '1e' },
      ]),
    ]
    expect(boxGroups(ownOf(pages, { units }))).toEqual(['u1.l'])
  })
  it('a frame painted round the heading’s lines before it is no ink of its label', () => {
    const pages = [
      page([
        ...before,
        { box: [50, 600, 560, 690] },
        { s: 'Theorem1', y: 670, size: 10, x: 60 },
        { box: [101, 669, 107, 676] },
        { pt: '1s' },
        { s: 'Ourresult', y: 670, size: 10, x: 109 },
        { pt: '1e' },
      ]),
    ]
    expect(boxGroups(ownOf(pages, { units }))).toEqual([null, 'u1.l'])
  })
  it('a placed form on the line is taken whole, its bar under the baseline with it; a figure set beside the lines is not', () => {
    const pages = [
      page([
        ...before,
        // (a figure TeX set in the stream before the heading, standing right of its lines: one of its paths meets the line,
        // the other stands below it)
        { box: [300, 560, 400, 680], form: 1 },
        { box: [300, 560, 400, 600], form: 1 },
        { s: 'Theorem1', y: 670, size: 10, x: 60 },
        // (a logo: two paths of one placement on the line)
        { box: [101, 669, 107, 676], form: 2 },
        { box: [101, 668.5, 107, 669.2], form: 2 },
        { pt: '1s' },
        { s: 'Ourresult', y: 670, size: 10, x: 109 },
        { pt: '1e' },
      ]),
    ]
    expect(boxGroups(ownOf(pages, { units }))).toEqual([null, null, 'u1.l', 'u1.l'])
  })
  it('a placement another claim holds a part of is not taken: one ink, one owner', () => {
    const pages = [
      page([
        { pt: '0s' },
        { s: 'Ourwordsbefore', y: 700, size: 10, x: 60 },
        // (one placement, its first path inside the unit before (between its marks), its second after that unit's end)
        { box: [60, 668.5, 66, 669.2], form: 1 },
        { pt: '0e' },
        { box: [60, 669, 66, 676], form: 1 },
        { s: 'Theorem1', y: 670, size: 10, x: 68 },
        { pt: '1s' },
        { s: 'Ourresult', y: 670, size: 10, x: 109 },
        { pt: '1e' },
      ]),
    ]
    expect(boxGroups(ownOf(pages, { units }))[1]).toBeNull()
  })
})
