// The bundle's units (src/instrument/units.ts bundleUnitsOf): a paper's units as the bundle holds them, their positions dropped,
// a nested unit named by its id, KEPT where the kept set the caller states holds the unit. Held here since lane c1-rewrites: its
// unit tests ran through today's wrapper (src/pdf-reader/engine/layer-proto/units.mjs, the kept set today's name rule's), which
// the cut-over deletes with today's engine
import { describe, expect, it } from 'vitest'
import { type BundleUnit, bundleUnitsOf, UNIT_FLAG_BITS, type UnitIn } from '../src/instrument/units.ts'

/** a paper as openPaper gives it: a title, a footnote nested in a paragraph that holds every kind of piece, a table's header (a
 *  name, kept) and a cell opened by \multirow{ and \shortstack{ that the next cell closes, a heading of the front matter written
 *  back in brackets, an author; and the kept set, the header's cell */
function paperOf(): { units: UnitIn[]; kept: Set<UnitIn> } {
  const note: UnitIn = { kind: 'footnote', pieces: [{ t: 'text', s: 'A note.' }] }
  const units: UnitIn[] = [
    { kind: 'heading', title: true, pieces: [{ t: 'text', s: 'A Title' }] },
    note,
    {
      kind: 'para',
      trail: 'xy',
      pieces: [
        { t: 'text', s: 'Text with ' },
        { t: 'open', id: 1, src: '\\textbf{' },
        { t: 'text', s: 'bold' },
        { t: 'close', id: 1, src: '}' },
        { t: 'ph', src: '$x$' },
        { t: 'text', s: ' caf\u00c3\u00a9', src: " caf\\'e" },
        { t: 'nested', pre: '\\footnote{', unit: note, post: '}' },
      ],
    },
    { kind: 'cell', cell: { table: 0, row: 0, col: 0, span: 1, head: true }, pieces: [{ t: 'text', s: 'Model' }] },
    {
      kind: 'cell',
      cell: { table: 0, row: 1, col: 0, span: 2, head: false },
      pieces: [
        { t: 'open', id: 58, src: '\\multirow{2}{*}{' },
        { t: 'open', id: 59, src: '\\shortstack{' },
        { t: 'text', s: 'ASR' },
      ],
    },
    {
      kind: 'cell',
      cell: { table: 0, row: 2, col: 0, span: 1, head: false },
      pieces: [
        { t: 'text', s: 'down' },
        { t: 'close', id: 59, src: '}' },
        { t: 'close', id: 58, src: '}' },
      ],
    },
    {
      kind: 'heading',
      depth: 1,
      front: true,
      bracketed: true,
      lead: 'a',
      inner: 'b c',
      pieces: [{ t: 'text', s: 'Intro' }],
    },
    { kind: 'author', pieces: [{ t: 'text', s: 'Ada' }] },
  ]
  return { units, kept: new Set([units[3] as UnitIn]) }
}
const UNITS: BundleUnit[] = [
  ['heading', UNIT_FLAG_BITS.TITLE, null, null, null, [[0, 'A Title']]],
  ['footnote', 0, null, null, null, [[0, 'A note.']]],
  [
    'para',
    0,
    null,
    null,
    { trail: 'xy' },
    [
      [0, 'Text with '],
      [2, 1, '\\textbf{'],
      [0, 'bold'],
      [3, 1, '}'],
      [1, '$x$'],
      [0, ' caf\u00c3\u00a9', " caf\\'e"],
      [4, '\\footnote{', 1, '}'],
    ],
  ],
  ['cell', UNIT_FLAG_BITS.KEPT, null, { table: 0, row: 0, col: 0, span: 1, head: true }, null, [[0, 'Model']]],
  [
    'cell',
    0,
    null,
    { table: 0, row: 1, col: 0, span: 2, head: false },
    null,
    [
      [2, 58, '\\multirow{2}{*}{'],
      [2, 59, '\\shortstack{'],
      [0, 'ASR'],
    ],
  ],
  [
    'cell',
    0,
    null,
    { table: 0, row: 2, col: 0, span: 1, head: false },
    null,
    [
      [0, 'down'],
      [3, 59, '}'],
      [3, 58, '}'],
    ],
  ],
  ['heading', UNIT_FLAG_BITS.FRONT | UNIT_FLAG_BITS.BRACKETED, 1, null, { lead: 'a', inner: 'b c' }, [[0, 'Intro']]],
  ['author', 0, null, null, null, [[0, 'Ada']]],
]

describe('bundleUnitsOf(paper, kept): the kept set stated by its caller', () => {
  it('gives each unit its kind, flags, depth, table cell, display edges and pieces, positions dropped, a nested unit by its id; KEPT where the kept set holds the unit', () => {
    const paper = paperOf()
    expect(bundleUnitsOf(paper, paper.kept)).toEqual(UNITS)
    // (no kept set, or an empty one: no unit KEPT, the rest as it was)
    const none = UNITS.map((u): BundleUnit => [u[0], u[1] & ~UNIT_FLAG_BITS.KEPT, u[2], u[3], u[4], u[5]])
    expect(bundleUnitsOf(paper, null)).toEqual(none)
    expect(bundleUnitsOf(paper, new Set())).toEqual(none)
    expect(bundleUnitsOf(paper)).toEqual(none)
    // language-independent, and the same twice
    const again = paperOf()
    expect(JSON.stringify(bundleUnitsOf(again, again.kept))).toBe(JSON.stringify(bundleUnitsOf(paper, paper.kept)))
  })

  it("throws on a piece the front end does not make, and on a nested unit that is not the paper's", () => {
    const paper = paperOf()
    ;(paper.units[7] as UnitIn & { pieces: unknown[] }).pieces.push({ t: 'other' })
    expect(() => bundleUnitsOf(paper, paper.kept)).toThrow()
    const stray = paperOf()
    ;(stray.units[7] as UnitIn & { pieces: unknown[] }).pieces.push({
      t: 'nested',
      pre: '',
      unit: { kind: 'footnote', pieces: [] },
      post: '',
    })
    expect(() => bundleUnitsOf(stray, stray.kept)).toThrow()
  })
})
