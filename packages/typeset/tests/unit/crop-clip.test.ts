// A crop carries its own piece's ink and no other's (the owner's comment #36 on 2610.21312v1-zh p5, t58: v2 not erased
// clean). The crop render holds every element and label of the page, so a rectangle cut whole carries whatever of another
// piece's ink stands in its margin: line 1's formula reached into the glyph tops of line 2's "det M = 1", drawn 5.8 pt lower,
// and the tops stayed behind as a row of dots. And a margin fixed in points is no glyph's antialiased edge at every zoom: that
// edge is a device pixel of the render the crop is cut from (round 5's parity, crop-edge). So the typesetter states the facts,
// each crop's own ink boxes and every piece's on its page, as the part states them, and the reader cuts each crop through its
// own ink and a device pixel round it, clear of the others' ink and theirs (paint.ts cropsOf).
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
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
type Crop = Extract<Item, { src: unknown }> & { ink?: Box[] }
const cropsOf = (p: ReturnType<typeof layPage>): Crop[] =>
  p.members.flatMap((m) => m.lines.flatMap((l) => l[3])).filter((it): it is Crop => 'src' in it)
const inside = (a: Box, b: Box) =>
  a[0] >= b[0] - 1e-9 && a[1] >= b[1] - 1e-9 && a[2] <= b[2] + 1e-9 && a[3] <= b[3] + 1e-9

describe('a crop states its own ink as TeX set it, the page every piece’s (2610.21312v1-zh p5 t58)', () => {
  it('states each crop’s own ink box, and the page each element’s ink box, as the part states them', () => {
    // (no margin of the typesetter's: the reader takes the antialiased edge of the render it cuts from, one device pixel,
    // round its own ink and round the others', paint.ts cropsOf)
    const p = layPage(part(member()), rowsOf(row), rules, metrics)
    const crops = cropsOf(p)
    // (each found by its ink: its source the element's box with its margin)
    const of = (b: Box) => crops.find((c) => inside(b, c.src.slice(1, 5) as Box))!
    const c0 = of(O),
      c2 = of(N)
    expect(c0 && c2 && c0 !== c2).toBeTruthy()
    expect(c0.ink).toEqual([O])
    expect(c2.ink).toEqual([N])
    expect(p.inks).toEqual(
      expect.arrayContaining([
        [1, ...O, 165.97],
        [1, ...N, 153.71],
      ]),
    )
  })
  it('states, of an element TeX set on two lines, the box of the line each crop is cut from', () => {
    const l1: Box = [250, 160.57, 300, 170],
      l2: Box = [73.2, 150, 120, 157]
    const broken = member({
      els: [
        [
          '0',
          {
            kind: 'other',
            ink: [
              [1, ...l1, 165.97],
              [1, ...l2, 153.71],
            ],
            copy: 'a + b + c + d',
          },
        ],
      ],
    })
    const one: Row = {
      ...row,
      content: [
        { t: 'text', s: 'Es gilt ' },
        { t: 'el', id: '0' },
        { t: 'text', s: ' und so fort.' },
      ],
    }
    const crops = cropsOf(layPage(part(broken), rowsOf(one), rules, metrics))
    expect(crops.length).toBe(2)
    for (const c of crops) expect(c.ink).toEqual([c.src[5] === 165.97 ? l1 : l2])
  })
  it('states the ink a crop is cut from: an element drawn without its own brackets, its ink between them', () => {
    // (2610.21312v1-zh p12 t200: "[784,256,256,10]" inside the translation's own brackets is drawn as its inner ink; its
    // brackets are the page's ink it leaves behind, stated apart (El.brackets), never its own)
    const box: Box = [163.74, 287.51, 237.35, 297.47]
    const left: Box = [163.74, 287.51, 166.51, 297.47],
      right: Box = [234.59, 287.51, 237.35, 297.47]
    const m = member({
      lines: [[1, 0, 72, 300, 290, 297.47, 287.51, 72, 300, 0, 9.96]],
      els: [
        [
          '1',
          {
            kind: 'other',
            ink: [[1, ...box, 290]],
            brackets: [
              [1, ...left, 290],
              [1, ...right, 290],
            ],
            copy: '[784,256,256,10]',
            text: '[784, 256, 256, 10]',
          },
        ],
      ],
    })
    const r: Row = {
      ...row,
      content: [
        { t: 'text', s: 'Die Eingabe hat die Form (' },
        { t: 'el', id: '1' },
        { t: 'text', s: ') und so fort.' },
      ],
    }
    const p = layPage(part(m), rowsOf(r), rules, metrics)
    const [c] = cropsOf(p)
    expect(c?.ink).toEqual([[left[2], box[1], right[0], box[3]]])
    expect(p.inks).toEqual(
      expect.arrayContaining([
        [1, ...left, 290],
        [1, ...right, 290],
      ]),
    )
  })
})
