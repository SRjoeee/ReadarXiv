// A table column's box on arXiv's page (Room.column; the owner's decision of 2026-11-13, docs/PDF-READER.md §18.13): what TeX set
// in one column of one tabular, every entry's, read where the entries line up as the column's class sets them (locate/
// columns.ts); the class TeX states for each cell set in its template's own box (marks/channels.ts readCellBoxes), none for a cell
// whose text is a paragraph of its own.
import { unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import { type BandInk, type ColumnCell, columnBoxes, type FreeWord } from '../src/locate/columns.ts'
import { readCellBoxes } from '../src/marks/channels.ts'
import { docOf } from './helpers/doc.ts'
import { locate } from './helpers/locate.ts'

const at = (
  ord: number,
  col: number,
  cls: ColumnCell['cls'],
  x0: number,
  x1: number,
  o: Partial<ColumnCell> = {},
): ColumnCell => ({
  ord,
  page: 1,
  col,
  span: 1,
  cls,
  x0,
  x1,
  ...o,
})
const word = (x0: number, x1: number, page = 1): FreeWord => ({ page, x0, x1 })

describe('readCellBoxes: the class TeX set each cell’s text by in its column template’s own box', () => {
  it('reads AXT-CELL’s c, l and r, none for a cell whose text is a paragraph of its own or of a class of no box', () => {
    const log = [
      'AXT-ALIGN t61 h 0 0.0pt 0 0.0pt 1 1.0pt',
      'AXT-CELL 61 0',
      'AXT-CELL 70 1',
      'AXT-CELL 71 2',
      // (a p column, centred or justified: the paragraph's \hsize is its box, which no glyph shows)
      'AXT-ALIGN t72 p 1 1.0pt 1 1.0pt 0 0.0pt',
      'AXT-CELL 72 4',
      'AXT-CELL 74 3',
      'AXT-CELL 75 5',
      // (a \parbox{2cm}{\raggedright …} in a c column: its text a paragraph of its own)
      'AXT-ALIGN t76 p 0 0.0pt 1 1.0pt 1 1.0pt',
      'AXT-CELL 76 0',
      // (tabularx's trial settings: the first)
      'AXT-CELL 77 2',
      'AXT-CELL 77 2',
    ].join('\n')
    expect(Object.fromEntries(readCellBoxes(log))).toEqual({ 61: 'c', 70: 'l', 71: 'r', 77: 'r' })
  })
})

describe('columnBoxes: a column’s box from its entries, where they line up as its class sets them', () => {
  it('takes an l column’s box from its widest entry, every cell of it the same box (Table 11’s base, teacher, span)', () => {
    const b = columnBoxes(
      [at(1, 1, 'l', 212.41, 228.34), at(2, 1, 'l', 212.41, 238.29), at(3, 1, 'l', 212.41, 228.84)],
      [],
    )
    expect([...b]).toEqual([
      [1, [212.41, 238.29]],
      [2, [212.41, 238.29]],
      [3, [212.41, 238.29]],
    ])
  })
  it('takes in the entries no unit is where the column’s class sets them: an r column’s numbers by their ends', () => {
    // (a header "Wall (h)" over numbers wider than it, each ending at the column's right edge; a number of the next column, which
    // meets this column's cells nowhere, that one's)
    const b = columnBoxes(
      [at(1, 2, 'r', 281.63, 311.04), at(2, 3, 'r', 330, 350)],
      [word(272.1, 311.04), word(290, 311.2), word(318, 350)],
    )
    expect(b.get(1)).toEqual([272.1, 311.2])
    expect(b.get(2)).toEqual([318, 350])
  })
  it('takes in a c column’s numbers by their middles', () => {
    const b = columnBoxes([at(1, 2, 'c', 250.25, 279.63)], [word(255.3, 274.58), word(248, 281.88)])
    expect(b.get(1)).toEqual([248, 281.88])
  })
  it('states no box for a column holding a word its class does not set where it stands: an entry not read whole', () => {
    // (an r column's word ending short of its edge past the cells' hull; a c column's word off its middle past the hull)
    expect(columnBoxes([at(1, 2, 'r', 281.63, 311.04)], [word(272.1, 311.04), word(270, 300)]).size).toBe(0)
    expect(columnBoxes([at(1, 2, 'c', 250.25, 279.63)], [word(255.3, 274.58), word(260, 285)]).size).toBe(0)
    // (2602.23285v2 p7's "Acc" over a siunitx S column: TeX sets the numbers on their decimal marker, padded to the column's
    // format, so no word of "0.856 ± 0.012" but its ± stands on the column's middle; the ± alone, centred, is no column of TeX's
    // read whole, and a box of the header's own width was stated, the header's translation then too wide for it at any size)
    const acc = [at(1, 1, 'c', 194.43, 205.95)]
    const rows = [0, 1, 2].flatMap((): FreeWord[] => [word(178.95, 195.7), word(197.33, 203.05), word(204.69, 221.43)])
    expect(columnBoxes(acc, rows).size).toBe(0)
  })
  it('passes over a free word wholly inside the hull of its column’s unit cells, meeting no other column: part of an entry', () => {
    // (the coordinator's ruling (d) of 2026-11-14: the page does not state such an entry's own ends, a name set with a script or a
    // number with its ± in words of their own, and entries that line up by their class line up whatever their parts. "5.26 ± 0.3"
    // in an r column: its last word ends on the column's edge, an entry; the two before it inside the hull)
    expect(columnBoxes([at(1, 2, 'r', 281.63, 311.04)], [word(272.1, 311.04), word(300, 309)]).get(1)).toEqual([
      272.1, 311.04,
    ])
    // (2611.03953v2 p7 Table 1's "P²-MOPD" row in its l column: the P on the column's edge an entry, the raised 2 and "-MOPD"
    // inside the hull)
    const method = [at(1, 0, 'l', 73.17, 157.25), at(2, 0, 'l', 73.17, 101.06)]
    const p2 = [word(73.17, 78.65), word(78.65, 81.63), word(82.13, 112.51)]
    expect(columnBoxes(method, p2).get(2)).toEqual([73.17, 157.25])
    // (inside within ALIGNED of the hull's edge: a c column's word off its middle)
    expect(columnBoxes([at(1, 0, 'c', 100, 130), at(2, 0, 'c', 105, 125)], [word(99.7, 104)]).get(2)).toEqual([
      100, 130,
    ])
    // (as before: a word past the hull's edge speaks against the column; a column of one entry and words inside it has none)
    expect(columnBoxes([at(1, 0, 'l', 100, 130), at(2, 0, 'l', 100, 120)], [word(120, 135)]).size).toBe(0)
    expect(columnBoxes([at(1, 0, 'l', 100, 130)], [word(105, 112)]).size).toBe(0)
  })
  it('passes over a word inside the hull only where nothing on its baseline stands in the blank beside the hull (d′)', () => {
    // (the coordinator's ruling (d') of 2026-11-14: a word inside the hull says its entry is set in several words; where a free
    // word on its baseline stands in the blank between the hull and the hulls beside it, the rest of that entry may be set past
    // the hull, or a column no unit cell is stands there: the entry's ends are unstated and the column has none, as before.
    // 2608.23393v1 p16's "10 bps" over "5.3% / 0.27": the header the column's one unit cell, narrower than the numbers)
    const at2 = (y: number, x0: number, x1: number): FreeWord => ({ page: 1, x0, x1, y })
    const tenBps = [at(1, 0, 'l', 300, 380), at(2, 0, 'l', 300, 360), at(3, 1, 'r', 419.71, 445.87)]
    const row = (y: number, first: number) => [at2(y, first, 418), at2(y, 425, 428), at2(y, 431, 445.87)]
    expect(columnBoxes(tenBps, [...row(100, 404), ...row(90, 405)]).has(3)).toBe(false)
    // (the first word on another baseline than the inside one: the rest of no entry past the hull; the column stands)
    const apart = [at2(100, 404, 418), at2(101, 425, 428), at2(100, 431, 445.87), at2(90, 431, 445.87)]
    expect(columnBoxes(tenBps, apart).get(3)).toEqual([419.71, 445.87])
    // (a column no unit cell is, its number in the blank on the inside word's baseline: the column has none either)
    const two = [at(1, 0, 'l', 100, 130), at(2, 0, 'l', 100, 120), at(3, 1, 'l', 160, 190), at(4, 1, 'l', 160, 180)]
    expect(columnBoxes(two, [at2(100, 105, 112), at2(100, 140, 150)]).has(1)).toBe(false)
    expect(columnBoxes(two, [at2(100, 105, 112), at2(90, 140, 150)]).get(1)).toEqual([100, 130])
    // (p7 Table 1's "P²-MOPD": P and "-MOPD" on one baseline inside the hull, the raised 2 alone on its own; the number of the
    // next column on P's baseline meets that column's hull, in no blank: the column stands)
    const method = [
      at(1, 0, 'l', 73.17, 157.25),
      at(2, 0, 'l', 73.17, 101.06),
      at(3, 1, 'c', 165.23, 194.61),
      at(4, 1, 'c', 170, 190),
    ]
    const p2 = [at2(100, 73.17, 78.65), at2(102.5, 78.65, 81.63), at2(100, 82.13, 112.51), at2(100, 168, 192)]
    expect(columnBoxes(method, p2).get(2)).toEqual([73.17, 157.25])
  })
  it('leaves out a word that meets two columns’ cells, and a column of one entry', () => {
    const b = columnBoxes([at(1, 0, 'l', 100, 130), at(2, 1, 'l', 150, 170)], [word(100, 160)])
    expect(b.size).toBe(0)
  })
  it('states no box for a column whose cells do not line up as its class sets them: the walk’s column is not TeX’s', () => {
    // (2610.21176v1 p13: cells TeX set in other columns, the walk's column 3 from 109.47 to 502.53)
    const b = columnBoxes([at(1, 3, 'l', 109.47, 160), at(2, 3, 'l', 420, 502.53), at(3, 3, 'l', 109.47, 150)], [])
    expect(b.size).toBe(0)
    // (half a point is one edge: what a hundredth and an italic correction leave of TeX's equal positions)
    expect(columnBoxes([at(1, 0, 'l', 100, 130), at(2, 0, 'l', 100.4, 150)], []).get(1)).toEqual([100, 150])
  })
  it('states no box for a column holding a cell of no class: a paragraph of its own (p, m, b, X) or no template of LaTeX’s', () => {
    expect(columnBoxes([at(1, 0, 'l', 100, 130), at(2, 0, undefined, 100, 150)], []).size).toBe(0)
  })
  it('centres a \\multicolumn{1}{c} cell of an l column in the column’s box; a word in a column of two classes is set by neither', () => {
    const cells = [at(1, 0, 'c', 110, 140), at(2, 0, 'l', 100, 150), at(3, 0, 'l', 100, 120)]
    const b = columnBoxes(cells, [])
    expect(b.get(1)).toEqual([100, 150])
    expect(b.get(3)).toEqual([100, 150])
    expect(columnBoxes(cells, [word(100, 160)]).size).toBe(0)
  })
  it('gives a spanning cell the union of the columns it spans, each with a box, its class setting it there', () => {
    // (Table 12's \multicolumn{3}{c}{Step 25} over Merged, Pre and Post)
    const cells = [
      at(1, 2, 'c', 199.64, 226.79, { span: 3 }),
      at(2, 2, 'l', 165.26, 192.98),
      at(3, 2, 'l', 165.26, 213.85),
      at(4, 3, 'c', 223.69, 235.64),
      at(5, 4, 'c', 245.6, 261.05),
    ]
    const words = [word(221.2, 238.13), word(245.48, 261.17)]
    const b = columnBoxes(cells, words)
    expect(b.get(4)).toEqual([221.2, 238.13])
    expect(b.get(5)).toEqual([245.48, 261.17])
    expect(b.get(1)).toEqual([165.26, 261.17])
    // (one of the spanned columns with no box: none)
    expect(columnBoxes(cells, [word(221.2, 238.13)]).has(1)).toBe(false)
  })
  it('states no box for a column a spanning cell widened, nor for the spanning cell (TeX gives the excess to the last column)', () => {
    const cells = [
      at(1, 0, 'l', 100, 220, { span: 2 }),
      at(2, 0, 'l', 100, 140),
      at(3, 0, 'l', 100, 130),
      at(4, 1, 'l', 160, 190),
      at(5, 1, 'l', 160, 180),
    ]
    const b = columnBoxes(cells, [])
    expect(b.get(2)).toEqual([100, 140])
    expect(b.has(4)).toBe(false)
    expect(b.has(1)).toBe(false)
  })
  it('pools a table’s pages whose columns stand alike, and reads each page alone where they do not', () => {
    const cells = [
      at(1, 0, 'l', 100, 130),
      at(2, 0, 'l', 100, 150, { page: 2 }),
      at(3, 0, 'l', 100, 120),
      at(4, 0, 'l', 100, 125, { page: 2 }),
    ]
    expect(columnBoxes(cells, []).get(1)).toEqual([100, 150])
    // (a two-sided document's even page, its columns 20 pt to the right)
    const shifted = cells.map((c) => (c.page === 2 ? { ...c, x0: c.x0 + 20, x1: c.x1 + 20 } : c))
    const b = columnBoxes(shifted, [])
    expect(b.get(1)).toEqual([100, 130])
    expect(b.get(2)).toEqual([120, 170])
  })
})

describe('columnBoxes with the band’s ink: each cell’s room in its column, its box widened by the column’s share of the blank', () => {
  // (the share is half the blank between the box's edge and what stands next on the table's band on that side: TeX makes the
  // blank between two columns of each one's own \tabcolsep. Three columns, l, c and r, two entries each, 20 pt apart; the
  // table's rules end 6 pt past its outer columns)
  const three = (): ColumnCell[] => [
    at(1, 0, 'l', 100, 130),
    at(2, 0, 'l', 100, 120),
    at(3, 1, 'c', 150, 170),
    at(11, 1, 'c', 155, 165),
    at(4, 2, 'r', 190, 220),
    at(12, 2, 'r', 200, 220),
  ]
  const band = (o: Partial<BandInk> = {}): BandInk[] => [{ page: 1, ink: [], walls: [], edge: [94, 226], ...o }]
  /** a room to the part's hundredth, as the facts pass states it */
  const near = (b: readonly number[] | undefined) => b?.map((x) => Math.round(x * 100) / 100)
  it('grows an l cell to the right, an r cell to the left, a c cell both ways, each by half the blank to its neighbour', () => {
    const r = columnBoxes(three(), [], band())
    expect(near(r.get(1))).toEqual([100, 140])
    expect(near(r.get(2))).toEqual([100, 140])
    expect(near(r.get(3))).toEqual([140, 180])
    expect(near(r.get(4))).toEqual([180, 220])
    // (no band's ink handed: the boxes themselves, as before)
    expect(columnBoxes(three(), []).get(3)).toEqual([150, 170])
  })
  it('gives a c cell the smaller of its two shares on both sides, its middle the box’s', () => {
    const cells = three().map((c) => (c.ord === 4 ? { ...c, x0: 178 } : c))
    expect(near(columnBoxes(cells, [], band()).get(3))).toEqual([146, 174])
  })
  it('stops at a vertical rule and at a neighbour’s fill, painted edges alike: half the blank to the edge', () => {
    // (a rule between the first two columns)
    const r = columnBoxes(three(), [], band({ walls: [[139.8, 140.2]] }))
    expect(near(r.get(1))).toEqual([100, 134.9])
    expect(near(r.get(3))).toEqual([145.1, 174.9])
    // (the third column's cells filled, colortbl's ground over its cell box: an edge beside the second, the third's own ground)
    const f = columnBoxes(three(), [], band({ walls: [[184, 226]] }))
    expect(near(f.get(3))).toEqual([143, 177])
    expect(near(f.get(4))).toEqual([180, 220])
    // (a ground across every column, a row's colour, is no edge beside any; read at the part's hundredth, so that a \rowcolor
    // TeX painted from the first column's edge is its ground whatever its last digits: 2610.40394v1 p3's at 62.3621)
    expect(near(columnBoxes(three(), [], band({ walls: [[94, 226]] })).get(3))).toEqual([140, 180])
    expect(near(columnBoxes(three(), [], band({ walls: [[100.002, 226]] })).get(1))).toEqual([100, 140])
  })
  it('takes the table’s own edge where nothing stands on a side, where its rules end; no share where the page shows none', () => {
    const cells = [at(1, 0, 'r', 100, 130), at(2, 0, 'r', 110, 130), at(3, 1, 'l', 150, 170), at(4, 1, 'l', 150, 160)]
    const r = columnBoxes(cells, [], band())
    expect(near(r.get(1))).toEqual([97, 130])
    expect(near(r.get(3))).toEqual([150, 198])
    const none = columnBoxes(cells, [], band({ edge: undefined }))
    expect(near(none.get(1))).toEqual([100, 130])
    expect(near(none.get(3))).toEqual([150, 170])
  })
  it('stops at a word of free ink and at a glyph of a member that is no cell of the table, on any row of the band', () => {
    // (a number no unit is between the first two columns; a footnote's mark a paragraph owns, on the band)
    expect(near(columnBoxes(three(), [word(134, 138)], band()).get(1))).toEqual([100, 132])
    expect(near(columnBoxes(three(), [], band({ ink: [[136, 140]] })).get(1))).toEqual([100, 133])
    // (a glyph straddling the box's edge leaves no blank on that side: a c cell beside it grows neither way)
    expect(near(columnBoxes(three(), [], band({ ink: [[168, 172]] })).get(3))).toEqual([150, 170])
  })
  it('stops at the unit cells of a column with no box, and reads nothing past the table’s edge', () => {
    // (the third column one cell, no box: its cell stands next to the second)
    const one = three().filter((c) => c.ord !== 12 && c.ord !== 4)
    expect(near(columnBoxes([...one, at(4, 2, 'l', 178, 200)], [], band()).get(3))).toEqual([146, 174])
    // (a word of another table set beside this one, past this one's rules' end)
    const two = three().filter((c) => c.col < 2)
    expect(near(columnBoxes(two, [word(300, 320)], band({ edge: [94, 176] })).get(3))).toEqual([147, 173])
  })
  it('widens a spanning cell’s union by its first column’s left share and its last one’s right; it stands next to none', () => {
    const cells = [...three(), at(5, 0, 'c', 115, 155, { span: 2 }), at(6, 1, 'c', 165, 205, { span: 2 })]
    const r = columnBoxes(cells, [], band())
    expect(near(r.get(5))).toEqual([97, 173])
    expect(near(r.get(6))).toEqual([147, 223])
    // (the second spanning cell's ink crosses the blank between the second and third columns: the c cell keeps its shares)
    expect(near(r.get(3))).toEqual([140, 180])
  })
  it('never passes the cell’s own side: the widening cut at its Room.side, the box itself where the side stops short of it', () => {
    // (the first cell's line stops at TeX's measure at 136, a \cmidrule's end beside the third's at 175; the fourth's side short
    // of its box on the left, a mark TeX set in its entry: the box stands there, and the typesetter lays it in its own room)
    const sides: Record<number, readonly [number, number]> = { 1: [90, 136], 3: [120, 175], 4: [195, 230] }
    const cells = three().map((c) => (sides[c.ord] ? { ...c, side: sides[c.ord] } : c))
    const r = columnBoxes(cells, [], band())
    expect(near(r.get(1))).toEqual([100, 136])
    expect(near(r.get(2))).toEqual([100, 140])
    // (a c cell's cut alike on both sides: its middle stays the box's)
    expect(near(r.get(3))).toEqual([145, 175])
    expect(near(r.get(4))).toEqual([190, 220])
  })
  // (a table set over two pages whose columns stand alike, its entries pooled: the first page holds the three columns' cells, the
  // second the first column's cells and one of the second column's, or one of the second's and the third column's, and spanning
  // cells over two columns, one of which has no unit cell on that page: that column's box is the first page's)
  const pages = (o: { last: boolean }): ColumnCell[] => [
    ...three(),
    ...(o.last
      ? [at(21, 0, 'l', 100, 125, { page: 2 }), at(22, 0, 'l', 100, 115, { page: 2 })]
      : [at(24, 2, 'r', 190, 220, { page: 2 }), at(25, 2, 'r', 205, 220, { page: 2 })]),
    at(23, 1, 'c', 152, 168, { page: 2 }),
  ]
  const both = (): BandInk[] => [...band(), ...band().map((b) => ({ ...b, page: 2 }))]
  it('gives a spanning cell its room where its page holds no unit cell of its last column: no share there, the box stands', () => {
    // (Codex's shape, pull request #644: the union [150, 220] of the second and third columns, a c cell set on its middle on the
    // second page, which holds no unit cell of the third; the box is the cell's, so its room is too)
    const cells = [...pages({ last: true }), at(31, 1, 'c', 165, 205, { page: 2, span: 2 })]
    expect(columnBoxes(cells, []).get(31)).toEqual([150, 220])
    expect(near(columnBoxes(cells, [], both()).get(31))).toEqual([150, 220])
  })
  it('gives a spanning cell its room where its page holds no unit cell of its first column: no share there, the box stands', () => {
    const cells = [...pages({ last: false }), at(32, 0, 'c', 115, 155, { page: 2, span: 2 })]
    expect(columnBoxes(cells, []).get(32)).toEqual([100, 170])
    expect(near(columnBoxes(cells, [], both()).get(32))).toEqual([100, 170])
  })
  it('widens such a cell on the side its page states a share for, as its class grows: l right, r left, c by the smaller (0)', () => {
    // (the last column's share unstated on the second page, the second column's left share there half its 20 pt to the first's
    // box: an r cell grows left by it, an l cell grows right and so not at all, a c cell by the smaller, none)
    const last = [
      ...pages({ last: true }),
      at(31, 1, 'c', 165, 205, { page: 2, span: 2 }),
      at(33, 1, 'l', 150, 200, { page: 2, span: 2 }),
      at(34, 1, 'r', 170, 220, { page: 2, span: 2 }),
    ]
    const r = columnBoxes(last, [], both())
    expect([31, 33, 34].map((o) => near(r.get(o)))).toEqual([
      [150, 220],
      [150, 220],
      [140, 220],
    ])
    // (the first column's share unstated, the third's right share half its 6 pt to the table's edge: an l cell grows right by it)
    const first = [
      ...pages({ last: false }),
      at(32, 0, 'c', 115, 155, { page: 2, span: 2 }),
      at(35, 0, 'l', 100, 150, { page: 2, span: 2 }),
      at(36, 0, 'r', 120, 170, { page: 2, span: 2 }),
    ]
    const f = columnBoxes(first, [], both())
    expect([32, 35, 36].map((o) => near(f.get(o)))).toEqual([
      [100, 170],
      [100, 173],
      [100, 170],
    ])
  })
  it('gives every cell that has a box a room, and that room holds its box (generated tables, seeds 1 to 2000)', () => {
    // (one to three pages, tied or shifted as a two-sided document's; two to five columns of each class, zero to three unit cells
    // of each on each page, some of another class, of none or set off their edge; spanning cells, some wider than the union;
    // free words in a column or anywhere; the band's glyphs, walls and edge, or none; sides, some short of the box)
    const failed: number[] = []
    let reached = 0
    for (let seed = 1; seed <= 2000; seed++) {
      const { cells, words, bands } = tableOf(seed)
      const boxes = columnBoxes(cells, words)
      const rooms = columnBoxes(cells, words, bands)
      const hundredth = (v: number) => Math.round(v * 100) / 100
      if (
        cells.some(
          (c) =>
            c.span > 1 &&
            boxes.has(c.ord) &&
            [c.col, c.col + c.span - 1].some(
              (k) => !cells.some((s) => s.page === c.page && s.span === 1 && s.col === k),
            ),
        )
      )
        reached++
      for (const [ord, b] of boxes) {
        const room = rooms.get(ord)
        if (!room || room[0] > hundredth(b[0]) + 1e-9 || room[1] < hundredth(b[1]) - 1e-9) {
          failed.push(seed)
          break
        }
      }
    }
    // (the generator reaches the shape above: a spanning cell with a box on a page that holds no unit cell of an end column)
    expect(reached).toBeGreaterThan(0)
    expect(failed.slice(0, 10)).toEqual([])
  })
})

/** a seeded generator (mulberry32): the same numbers for a seed on every run */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** a table of the seed's: its cells on each of its pages, the free words on its band and what else stands there */
function tableOf(seed: number): { cells: ColumnCell[]; words: FreeWord[]; bands: BandInk[] } {
  const r = rng(seed)
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1))
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!
  const CLASSES = ['l', 'c', 'r'] as const
  const set = (cls: 'l' | 'c' | 'r', x0: number, x1: number, w: number): [number, number] =>
    cls === 'l' ? [x0, x0 + w] : cls === 'r' ? [x1 - w, x1] : [(x0 + x1 - w) / 2, (x0 + x1 + w) / 2]
  const cols: { x0: number; x1: number; cls: 'l' | 'c' | 'r' }[] = []
  let x = 100
  for (let k = int(2, 5); k > 0; k--) {
    const w = int(15, 50)
    cols.push({ x0: x, x1: x + w, cls: pick(CLASSES) })
    x += w + int(8, 24)
  }
  const end = cols.at(-1)!.x1
  const nPages = int(1, 3)
  const cells: ColumnCell[] = []
  const words: FreeWord[] = []
  const bands: BandInk[] = []
  let ord = 0
  const sideOf = (a: number, b: number) => (r() < 0.3 ? { side: [a - int(-2, 15), b + int(-2, 15)] as const } : {})
  for (let page = 1; page <= nPages; page++) {
    const s = page > 1 && r() < 0.25 ? int(-20, 20) : 0
    cols.forEach((c, col) => {
      for (let i = int(0, 3); i > 0; i--) {
        const cls = r() < 0.05 ? undefined : r() < 0.1 ? pick(CLASSES) : c.cls
        const w = r() < 0.5 ? c.x1 - c.x0 : int(5, c.x1 - c.x0)
        const off = r() < 0.1 ? int(-3, 3) : 0
        const [a, b] = set(cls ?? c.cls, c.x0 + s + off, c.x1 + s + off, w)
        cells.push({ ord: ord++, page, col, span: 1, cls, x0: a, x1: b, ...sideOf(a, b) })
      }
    })
    for (let i = int(0, 2); i > 0; i--) {
      const col = int(0, cols.length - 2)
      const span = int(2, cols.length - col)
      const u0 = cols[col]!.x0 + s
      const u1 = cols[col + span - 1]!.x1 + s
      const cls = r() < 0.1 ? undefined : pick(CLASSES)
      const w = r() < 0.15 ? u1 - u0 + int(1, 10) : int(10, u1 - u0)
      const [a, b] = set(cls ?? 'c', u0, u1, w)
      cells.push({ ord: ord++, page, col, span, cls, x0: a, x1: b, ...sideOf(a, b) })
    }
    for (let i = int(0, 3); i > 0; i--) {
      const c = pick(cols)
      const y = int(0, 3) * 10
      if (r() < 0.6) {
        const [a, b] = set(c.cls, c.x0 + s, c.x1 + s, int(3, c.x1 - c.x0))
        words.push({ page, x0: a, x1: b, y })
      } else {
        const a = int(90, end + 10) + s
        words.push({ page, x0: a, x1: a + int(2, 20), y })
      }
    }
    const some = (p: number, w: number) =>
      Array.from({ length: r() < p ? int(1, 2) : 0 }, () => {
        const a = int(90, end + 10) + s
        return [a, a + int(1, w)] as const
      })
    bands.push({
      page,
      ink: some(0.3, 6),
      walls: some(0.2, 40),
      ...(r() < 0.7 ? { edge: [94 + s, end + 6 + s] as const } : {}),
    })
  }
  return { cells, words, bands }
}

describe('locate states each cell’s room in its column as Room.column', () => {
  it('reads an l column of cells and an r column of a header over numbers no unit is, each widened by its share', () => {
    // (a header row, Model and Val; two rows under it, each a cell of the first column and a number of the second: glyphs 6 pt
    // wide, the numbers' ink owned by no unit)
    const B = docOf([
      {
        lines: [
          { text: 'Model', x: 100, y: 712 },
          { text: 'Val', x: 166, y: 712 },
          { text: 'Ours', x: 100, y: 700 },
          { text: '12.5', x: 160, y: 700 },
          { text: 'Base', x: 100, y: 688 },
          { text: '100.25', x: 148, y: 688 },
        ],
      },
    ])
    const cell = (s: string, row: number, col: number, boxed: 'l' | 'r'): InstrumentUnit => {
      const content = [{ t: 'text' as const, s }]
      return { id: unitId('cell', content), kind: 'cell', content, cell: { table: 0, row, col, boxed } }
    }
    const units = [cell('Model', 0, 0, 'l'), cell('Val', 0, 1, 'r'), cell('Ours', 1, 0, 'l'), cell('Base', 2, 0, 'l')]
    // (each glyph's unit, the numbers' none)
    const owner = [
      ...Array(5).fill(0),
      ...Array(3).fill(1),
      ...Array(4).fill(2),
      ...Array(4).fill(-1),
      ...Array(4).fill(3),
    ]
    const ins: Instrument = {
      ink: B,
      units,
      glyphs: B.pages.map((pg) => {
        const O = ownersOf(pg.glyphs.length)
        pg.glyphs.forEach((_, j) => {
          O.unit[j] = owner[j] ?? -1
          O.role[j] = ROLE.text
        })
        return O
      }),
      boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
      tex: {},
      made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
    }
    const ms = locate(ins, B, align(B, B)).members
    // (the l column grows right and the r column left, each by half the 18 pt between their boxes; no rule shows the table's
    // edge, so neither has a share on its outer side)
    expect(ms.slice(0, 4).map((m) => m.room.column)).toEqual([
      [100, 139],
      [139, 184],
      [100, 139],
      [100, 139],
    ])
  })
})
