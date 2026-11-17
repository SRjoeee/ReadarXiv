// A table cell of an m or a b column states where TeX stands its lines in its row (Placed.stand, docs/PDF-READER.md §18.92):
// the class LaTeX built the cell's column template from, as the marked compile's log states it (AXT-CELL <i> <class>, LaTeX's
// \@chnum: array.sty's c, l, r, m, p, b 0 to 5), read for m (3) and b (5) alone (marks/channels.ts readCellStands), carried by
// the instrument's cell (InstrumentUnit.cell.stand) onto every placement of the cell in a part. Logs and pages of our own.
import { type Piece, type Placed, read, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import { bundle } from '../src/bundle/bundle.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import { readCellStands } from '../src/marks/channels.ts'
import type { AddOn } from '../src/wrap/wrap.ts'
import { docOf } from './helpers/doc.ts'
import { locate } from './helpers/locate.ts'

describe('readCellStands: the cells TeX set in an m or a b column', () => {
  it('reads AXT-CELL’s 3 as m and 5 as b; none for c, l, r and p, nor for a record not of the form', () => {
    const log = [
      'AXT-CELL 10 0',
      'AXT-CELL 11 1',
      'AXT-CELL 12 2',
      // (an m column's cell: its text a paragraph of its own, whose alignment readAlign reads; its class read all the same)
      'AXT-ALIGN t13 p 1 1.0pt 1 1.0pt 0 0.0pt',
      'AXT-CELL 13 3',
      'AXT-CELL 14 4',
      'AXT-CELL 15 5',
      'AXT-CELL 17 6',
      'AXT-CELL 18',
      'AXT-CELL x 3',
    ].join('\n')
    expect(Object.fromEntries(readCellStands(log))).toEqual({ 13: 'm', 15: 'b' })
  })
  it('reads a cell’s first record: tabularx’s trial settings the same, a later record of another class none', () => {
    const log = [
      'AXT-CELL 16 3',
      'AXT-CELL 16 3',
      'AXT-CELL 19 4',
      'AXT-CELL 19 3',
      'AXT-CELL 20 5',
      'AXT-CELL 20 3',
    ].join('\n')
    expect(Object.fromEntries(readCellStands(log))).toEqual({ 16: 'm', 20: 'b' })
  })
})

// ---------------------------------------------------------------- through locate and the bundle, on a page made by hand
/** a table's row of four cells, each a unit of one line: an m cell, a b cell, a p cell and an l cell, its column's class `stand`
 *  where the instrument states one; every glyph its line's unit's text */
const B = docOf([
  {
    lines: [
      { text: 'Mcell', x: 72 },
      { text: 'Bcell', x: 72 },
      { text: 'Pcell', x: 72 },
      { text: 'Lcell', x: 72 },
    ],
  },
])
const cellOf = (s: string, col: number, stand?: 'm' | 'b'): InstrumentUnit => {
  const content: Piece[] = [{ t: 'text', s }]
  return {
    id: unitId('cell', content),
    kind: 'cell',
    content,
    cell: { table: 0, row: col, col: 0, ...(stand ? { stand } : {}) },
  }
}
const units: InstrumentUnit[] = [
  cellOf('Mcell', 0, 'm'),
  cellOf('Bcell', 1, 'b'),
  cellOf('Pcell', 2),
  cellOf('Lcell', 3),
]
const ins: Instrument = {
  ink: B,
  units,
  glyphs: B.pages.map((pg) => {
    const O = ownersOf(pg.glyphs.length)
    pg.glyphs.forEach((g, j) => {
      O.unit[j] = g.n
      O.role[j] = ROLE.text
    })
    return O
  }),
  boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
  tex: {},
  made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
}
/** every placement of the page's part, by ord */
function placed(): Map<number, Placed> {
  const L = locate(ins, B, align(B, B))
  const addOn: AddOn = {
    bytes: new Uint8Array([1, 2, 3]),
    pages: new Map([[1, { ok: true }]]),
    groups: new Set(L.groups.flatMap((g) => g.glyphs.filter((x): x is string => x !== null))),
    ocgs: new Map(),
    lost: new Set(),
    stats: {} as AddOn['stats'],
  }
  const parts = [
    ...bundle({
      ins,
      located: L,
      addOn,
      original: new Uint8Array(10),
      paper: { id: '2501.00001', version: 1, pages: 1 },
      made: 'test',
    }),
  ]
    .filter((o) => o.kind === 'part')
    .map((o) => read('part', o.bytes, o.digest))
  return new Map(parts.flatMap((p) => p.flows.flat()).map((m) => [m.ord, m]))
}

describe('the part states a cell’s stand where its column is m or b', () => {
  it('states `m` and `b` on those cells’ placements, none on a p cell’s nor an l cell’s', () => {
    const by = placed()
    expect([...by.values()].map((m) => [m.ord, m.kind, m.stand])).toEqual([
      [0, 'cell', 'm'],
      [1, 'cell', 'b'],
      [2, 'cell', undefined],
      [3, 'cell', undefined],
    ])
  })
})
