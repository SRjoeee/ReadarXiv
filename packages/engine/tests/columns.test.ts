// A table column's box on arXiv's page (Room.column; the owner's decision of 2026-11-13, docs/PDF-READER.md §18.13): what TeX set
// in one column of one tabular, every entry's, read where the entries line up as the column's class sets them (locate/
// columns.ts); the class TeX states for each cell set in its template's own box (marks/channels.ts readCellBoxes), none for a cell
// whose text is a paragraph of its own.
import { unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import { type ColumnCell, columnBoxes, type FreeWord } from '../src/locate/columns.ts'
import { readCellBoxes } from '../src/marks/channels.ts'
import { docOf } from './helpers/doc.ts'
import { locate } from './helpers/locate.ts'

const at = (ord: number, col: number, cls: ColumnCell['cls'], x0: number, x1: number, o: Partial<ColumnCell> = {}) => ({
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
    // meets this column's cells nowhere, and one that does not end there, left out)
    const b = columnBoxes(
      [at(1, 2, 'r', 281.63, 311.04), at(2, 3, 'r', 330, 350)],
      [word(272.1, 311.04), word(290, 311.2), word(318, 350), word(300, 309)],
    )
    expect(b.get(1)).toEqual([272.1, 311.2])
    expect(b.get(2)).toEqual([318, 350])
  })
  it('takes in a c column’s numbers by their middles; one off its middle is no entry of it', () => {
    const b = columnBoxes([at(1, 2, 'c', 250.25, 279.63)], [word(255.3, 274.58), word(248, 281.88), word(260, 285)])
    expect(b.get(1)).toEqual([248, 281.88])
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
  it('centres a \\multicolumn{1}{c} cell of an l column in the column’s box, and joins no word to a column of two classes', () => {
    const b = columnBoxes([at(1, 0, 'c', 110, 140), at(2, 0, 'l', 100, 150), at(3, 0, 'l', 100, 120)], [word(100, 160)])
    expect(b.get(1)).toEqual([100, 150])
    expect(b.get(3)).toEqual([100, 150])
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

describe('locate states each cell’s column box as Room.column', () => {
  it('reads an l column of cells and an r column of a header over numbers no unit is', () => {
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
    expect(ms.slice(0, 4).map((m) => m.room.column)).toEqual([
      [100, 130],
      [148, 184],
      [100, 130],
      [100, 130],
    ])
  })
})
