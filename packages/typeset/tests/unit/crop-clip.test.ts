// A crop carries its own piece's ink and no other's (the owner's comment #36 on 2610.21312v1-zh p5, t58: v2 not erased
// clean). The crop render holds every element and label of the page, so a crop's rectangle, its ink and the antialiased
// margin round it, cut whole, carries whatever of another piece's ink stands in that margin: line 1's formula reached into
// the glyph tops of line 2's "det M = 1", whose ink was drawn 5.8 pt lower, and the tops stayed behind as a row of dots. The
// part states every piece's ink; where another's stands within a crop's rectangle the crop states the rectangles it is drawn
// through: its own ink's box whole, and the rest of its rectangle clear of the others' ink.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import { cropClip } from '../../src/unit/crops.ts'
import type { Item, Metrics, Rows } from '../../src/types.ts'

type Box = [number, number, number, number]
const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
}
const rules = rulesFor('de')
const id = 'a'.repeat(64)
/** 2610.21312v1 p5's item (i) of Proposition VI.3, its two formulas as the part states them: line 1's ink reaches down to
 *  160.57, line 2's up to 160.63 */
const O: Box = [73.2, 160.57, 278.69, 174.44]
const N: Box = [73.2, 153.6, 116.39, 160.63]
const member = (o: Partial<Placed> = {}): Placed => ({
  ord: 58,
  kind: 'theorem',
  text: id,
  lead: 11.96,
  style: { role: 'serif', size: 9.96, design: 'NimbusRomNo9L-Regu' },
  align: 'j',
  lines: [
    [1, 0, 73.2, 300.02, 165.97, 174.44, 160.57, 48.96, 300.02, 0, 9.96],
    [1, 0, 73.2, 300.02, 153.71, 160.63, 151.66, 48.96, 300.02, 0, 9.96],
    [1, 0, 73.2, 114.06, 141.76, 148.56, 139.71, 48.96, 300.02, 0, 9.96],
  ],
  els: [
    ['0', { kind: 'other', ink: [[1, ...O, 165.97]], copy: 'tr M = x' }],
    ['2', { kind: 'other', ink: [[1, ...N, 153.71]], copy: 'det M = 1' }],
  ],
  room: { below: 20, next: 24 },
  ...o,
})
const part = (m: Placed): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: [[m]],
})
const rowsOf = (r: Row): Rows => ({ get: (k) => (k === r.id ? r : undefined), done: true })
const row: Row = {
  id,
  ok: true,
  by: 'test',
  // (opened by text, so that a crop's piece, its place among the row's pieces, is not its element's id in the part)
  content: [
    { t: 'text', s: 'Es gilt ' },
    { t: 'el', id: '0' },
    { t: 'text', s: ' und ' },
    { t: 'el', id: '2' },
    { t: 'text', s: ': verschobene Diffusion der Residuen ohne Verzerrung.' },
  ],
}
type Crop = Extract<Item, { src: unknown }> & { clip?: Box[] }
const cropsOf = (p: ReturnType<typeof layPage>): Crop[] =>
  p.members.flatMap((m) => m.lines.flatMap((l) => l[3])).filter((it): it is Crop => 'src' in it)
const meet = (a: Box, b: Box): Box | null => {
  const x0 = Math.max(a[0], b[0]),
    y0 = Math.max(a[1], b[1]),
    x1 = Math.min(a[2], b[2]),
    y1 = Math.min(a[3], b[3])
  return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null
}
const inside = (a: Box, b: Box) =>
  a[0] >= b[0] - 1e-9 && a[1] >= b[1] - 1e-9 && a[2] <= b[2] + 1e-9 && a[3] <= b[3] + 1e-9
/** whether rectangles `rs` reach box `n` anywhere outside box `own` */
const reaches = (rs: Box[], n: Box, own: Box) =>
  rs.some((r) => {
    const m = meet(r, n)
    return !!m && !inside(m, own)
  })
/** whether rectangles `rs` cover box `b` whole (sampled on a grid of a hundredth of a point's tenth) */
const covers = (rs: Box[], b: Box) => {
  for (let x = b[0] + 0.005; x < b[2]; x += (b[2] - b[0]) / 97)
    for (let y = b[1] + 0.005; y < b[3]; y += (b[3] - b[1]) / 31)
      if (!rs.some((r) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3])) return false
  return true
}

describe('a crop carries its own ink and no other piece’s (2610.21312v1-zh p5 t58)', () => {
  it('is drawn through its own ink and the rest of its rectangle clear of another element’s ink a line under it', () => {
    const crops = cropsOf(layPage(part(member()), rowsOf(row), rules, metrics))
    // (each found by its ink: its source the element's box with its margin)
    const of = (b: Box) => crops.find((c) => inside(b, c.src.slice(1, 5) as Box))!
    const c0 = of(O),
      c2 = of(N)
    expect(c0 && c2 && c0 !== c2).toBeTruthy()
    // (its rectangle reaches the other's ink: the margin round its own, a third of a point, into the glyph tops under it)
    expect(meet(c0.src.slice(1, 5) as Box, N)).not.toBeNull()
    expect(c0.clip).toBeDefined()
    expect(reaches(c0.clip!, N, O)).toBe(false)
    expect(covers(c0.clip!, O)).toBe(true)
    // (and the formula under it likewise: none of line 1's ink outside its own)
    expect(c2.clip).toBeDefined()
    expect(reaches(c2.clip!, O, N)).toBe(false)
    expect(covers(c2.clip!, N)).toBe(true)
  })
  it('is cut whole where no other piece’s ink stands in its rectangle (no clip)', () => {
    const far = member({
      els: [
        ['0', { kind: 'other', ink: [[1, ...O, 165.97]], copy: 'tr M = x' }],
        ['2', { kind: 'other', ink: [[1, 73.2, 150, 116.39, 157, 153.71]], copy: 'det M = 1' }],
      ],
    })
    for (const c of cropsOf(layPage(part(far), rowsOf(row), rules, metrics))) expect(c.clip).toBeUndefined()
  })
})

describe('cropClip: the rectangles a crop is drawn through', () => {
  const src = (b: Box, base: number, page = 1): [number, number, number, number, number, number] => [
    page,
    b[0] - 0.4,
    b[1] - 0.3,
    b[2] + 0.4,
    b[3] + 0.3,
    base,
  ]
  it('keeps its own ink whole where another piece’s box overlaps it, and leaves the other’s outside its own', () => {
    // (two boxes of TeX's lines that meet by 0.06 pt: the overlap is ink of both, kept; the rest of the other's box is not, nor
    // the antialiased edge round it, a crop's own margin: 0.4 across, 0.3 up and down)
    const clip = cropClip(src(O, 165.97), [O], [N])!
    expect(covers(clip, O)).toBe(true)
    expect(reaches(clip, N, O)).toBe(false)
    expect(reaches(clip, [N[0] - 0.4, N[1] - 0.3, N[2] + 0.4, N[3] + 0.3], O)).toBe(false)
  })
  it('leaves out a label’s ink beside an element’s crop, and an element’s beside a label’s', () => {
    // (a carried label's crop reaches to its text's start, where its first formula's ink begins: 2610.21312v1 p5's "(i)")
    const label: Box = [57.82, 164.21, 67.23, 172.78]
    const labelSrc: [number, number, number, number, number, number] = [1, 57.42, 163.38, 72.8 + 0.6, 173.94, 165.97]
    const clip = cropClip(labelSrc, [label], [O])!
    expect(covers(clip, label)).toBe(true)
    expect(reaches(clip, O, label)).toBe(false)
  })
  it('leaves out its own element’s ink on another of TeX’s lines (a formula broken over lines: each line its crop)', () => {
    const l1: Box = [250, 160.57, 300, 170],
      l2: Box = [73.2, 150, 280, 160.5]
    const clip = cropClip(src(l1, 165.97), [l1], [l2])!
    expect(covers(clip, l1)).toBe(true)
    expect(reaches(clip, l2, l1)).toBe(false)
  })
  it('states nothing where no other ink stands in its rectangle, and where it knows no ink of its own', () => {
    expect(cropClip(src(O, 165.97), [O], [[73.2, 140, 116.39, 150]])).toBeUndefined()
    expect(cropClip(src(O, 165.97), [], [N])).toBeUndefined()
  })
})
