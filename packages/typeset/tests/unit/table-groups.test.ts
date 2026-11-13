// A table's cells (the owner, 2026-11-13: a table's cell is text like any other; the translator decides a name). Each cell is
// judged alone, by its own row, as a paragraph is: its translation laid, or the original's where it has no row, a row that
// failed, or a reason of the part's. A reply equal to its source is a translation like any other. A cell that cannot be drawn
// in its translation (unfit, a row that failed, the wrap cannot hide it) stays the original's by itself, as a paragraph does
// (the coordinator's ruling (c) of 2026-11-13); what still binds a cell to the others of its group (the header's cells, a
// column's, the cells spanning the same columns: TeX's grid, Placed.cell) is geometry alone: a cell that spans holds its group
// where it cannot be drawn (its box is the others' too), and a group on two pages is withheld whole (page-wait.test.ts).
import type { OutPiece, Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'

const metrics = (): Metrics => ({
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
})
const rules = rulesFor('de')
const idOf = (n: number) => n.toString(16).padStart(64, '0')
/** a cell at grid place [row, col, span, head], its own text `plain`, its line 60 pt wide at x0, 20 pt clear either side */
const cell = (ord: number, at: [number, number, number, 0 | 1], plain: string, o: Partial<Placed> = {}): Placed => {
  const x0 = 72 + 100 * at[1]
  const y = 700 - 14 * at[0]
  return {
    ord,
    kind: 'cell',
    text: idOf(ord + 1),
    lead: 12,
    style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
    align: 'l',
    lines: [[1, 0, x0, x0 + 60, y, y + 7, y - 2, 72, 500, 0, 10]],
    room: { below: 0, next: 300, side: [x0 - 20, x0 + 80] },
    cell: at,
    plain,
    ...o,
  }
}
const tableOf = (cells: Placed[]): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: cells.map((c) => [c]),
  ties: [{ rule: 'cells', cells: cells.map((c) => [c.ord]), head: 1 }],
})
const text = (s: string): OutPiece[] => [{ t: 'text', s }]
/** each cell's row: its translation's text by ord (a missing ord, no row: `kept` names those the paper keeps) */
const rowsOf = (by: Record<number, string | null>, kept: number[] = [], who = 'test'): Rows => {
  const m = new Map<string, Row>()
  for (const [o, s] of Object.entries(by))
    if (s !== null) m.set(idOf(Number(o) + 1), { id: idOf(Number(o) + 1), ok: true, by: who, content: text(s) })
  const k = new Set(kept.map((o) => idOf(o + 1)))
  return { get: (id) => m.get(id), done: false, kept: (id) => k.has(id) }
}
const laidOf = (p: Part, rows: Rows) => layPage(p, rows, rules, metrics()).members
const states = (p: Part, rows: Rows) => laidOf(p, rows).map((m) => m.state)
/** a laid member's text, its lines' items joined */
const textOfLaid = (m: ReturnType<typeof laidOf>[number]) =>
  m.lines
    .flatMap((l) => l[3])
    .map((i) => ('s' in i ? i.s : ''))
    .join('')
    .trim()

// (a header of two cells; a column of datasets and one label under them, the paper's Table 2 of 2611.03953v2 in its shape; a
// column of scores' descriptions)
const header = [cell(0, [0, 0, 1, 1], 'Dataset'), cell(1, [0, 1, 1, 1], 'Note')]
const names = ['MedQA', 'CaseHOLD', 'FinQA', 'IFBench', 'Avg. Recovery'].map((s, k) => cell(2 + k, [1 + k, 0, 1, 0], s))
const notes = ['fast', 'slow', 'large', 'small', 'mean'].map((s, k) => cell(7 + k, [1 + k, 1, 1, 0], s))
const table = tableOf([...header, ...names, ...notes])
const translated: Record<number, string> = {
  0: 'Datensatz',
  1: 'Hinweis',
  2: 'MedQA',
  3: 'CaseHOLD',
  4: 'FinQA',
  5: 'IFBench',
  6: 'Mittlere Erholung',
  7: 'schnell',
  8: 'langsam',
  9: 'groß',
  10: 'klein',
  11: 'Mittel',
}

describe('a table’s cell is text like any other: each laid by its own row', () => {
  it('a column of names with one label: the names laid as the translator wrote them, the label in its translation', () => {
    // (the column rule kept the whole column the original's where 0.4 of its cells came back as they went: "Avg. Recovery"
    // stayed English beside the names; no column is read for what its cells are now)
    const members = laidOf(table, rowsOf(translated))
    expect(members.map((m) => m.state)).toEqual(Array(12).fill('laid'))
    expect(textOfLaid(members[6]!)).toBe('Mittlere Erholung')
  })
  it('a reply equal to its source is an ordinary row: laid, its column’s other cells laid by theirs', () => {
    const all = rowsOf({ ...translated, 6: 'Avg. Recovery', 7: 'fast', 8: 'slow', 9: 'large', 10: 'small', 11: 'mean' })
    const members = laidOf(table, all)
    expect(members.map((m) => m.state)).toEqual(Array(12).fill('laid'))
    expect(members.slice(2, 7).map(textOfLaid)).toEqual(['MedQA', 'CaseHOLD', 'FinQA', 'IFBench', 'Avg. Recovery'])
  })
  it('a header row with a name in it: each of its cells laid by its own row, the name as the translator wrote it', () => {
    const t = tableOf([cell(0, [0, 0, 1, 1], 'Model'), cell(1, [0, 1, 1, 1], 'EM'), ...names.slice(0, 2)])
    const members = laidOf(t, rowsOf({ 0: 'Modell', 1: 'EM', 2: 'MedQA', 3: 'CaseHOLD' }))
    expect(members.map((m) => m.state)).toEqual(['laid', 'laid', 'laid', 'laid'])
    expect(members.slice(0, 2).map(textOfLaid)).toEqual(['Modell', 'EM'])
  })
  it('a unit the chain answered itself (no letter: `self`, never sent) is laid as its row says, as any row', () => {
    // (chain.ts outcomeOf: a unit with no letter is answered by the chain with its own content; the front end makes no unit of a
    // text of fewer than two letters, so such a row reaches an ink unit only: held here, nothing done about it, the coordinator's
    // word of 2026-11-13)
    const t = tableOf([cell(0, [0, 0, 1, 1], 'Model'), cell(1, [1, 0, 1, 0], '0.2')])
    const rows: Rows = {
      get: (id) =>
        id === idOf(1)
          ? { id, ok: true, by: 'test', content: text('Modell') }
          : id === idOf(2)
            ? { id, ok: true, by: 'self', content: text('0.2') }
            : undefined,
      done: false,
      kept: () => false,
    }
    expect(states(t, rows)).toEqual(['laid', 'laid'])
  })
  it('a cell the paper keeps (Unit.kept: a fact of its source) is the original’s alone: its column’s others are laid', () => {
    const rows = rowsOf({ ...translated, 2: null, 3: null }, [2, 3])
    expect(states(table, rows).slice(2, 7)).toEqual(['kept', 'kept', 'laid', 'laid', 'laid'])
  })
  it('a cell with no row is the original’s alone: it holds nothing (never sent, or a reply not come by the rows’ end)', () => {
    const rows = { ...rowsOf({ ...translated, 4: null }), done: true }
    expect(states(table, rows).slice(2, 7)).toEqual(['laid', 'laid', 'none', 'laid', 'laid'])
  })
})

describe('a cell that cannot be drawn stays the original’s alone; its group is held where the geometry needs it', () => {
  it('a cell whose reply does not fit it is the original’s alone, as a paragraph’s would be: its header’s other cells laid', () => {
    // (the coordinator's ruling (c) of 2026-11-13: 1810.04805v2-zh p6, QNLI's reply, a library's name, unfit in its cell, held
    // Table 1's header English whole, System and Average with it, which today translates)
    const rows = rowsOf({ ...translated, 1: 'Ein sehr langes Wort über die ganze Tabelle hinweg gesetzt' })
    expect(states(table, rows)).toEqual(['laid', 'unfit', ...Array(10).fill('laid')])
  })
  it('a cell whose row failed (a Row not ok) is the original’s alone: its column’s other cells laid', () => {
    const base = rowsOf(translated)
    const rows: Rows = {
      ...base,
      get: (id) => (id === idOf(10) ? { id, ok: false, why: { kind: 'refused' } } : base.get(id)),
    }
    expect(states(table, rows).slice(7)).toEqual(['laid', 'laid', 'refused', 'laid', 'laid'])
  })
  it('a spanning cell whose reply does not fit it still holds its group: its box is the others’ too', () => {
    // (a header cell set over two rows, \multirow: the tie states it spanning)
    const t: Part = { ...table, ties: [{ ...table.ties![0]!, spanning: [1] } as NonNullable<Part['ties']>[number]] }
    const rows = rowsOf({ ...translated, 1: 'Ein sehr langes Wort über die ganze Tabelle hinweg gesetzt' })
    expect(states(t, rows)).toEqual(['cells', 'unfit', ...Array(10).fill('laid')])
  })
  it('holds a group whose cell spanning columns the wrap cannot hide, as one stated spanning (its box the others’ too)', () => {
    const span = cell(7, [1, 0, 2, 0], 'all', { why: 'unwrapped' })
    const body = cell(8, [2, 0, 2, 0], 'none')
    const t = tableOf([...header, span, body])
    const rows = rowsOf({ ...translated, 7: 'alle', 8: 'keine' })
    expect(states(t, rows)).toEqual(['laid', 'laid', 'unwrapped', 'cells'])
  })
  it('a cell the wrap cannot hide, its box its own, is the original’s alone; its group laid (the ruling of 2026-10-24)', () => {
    const lone = cell(12, [6, 1, 1, 0], 'left', { why: 'unwrapped' })
    const t = tableOf([...header, ...notes, lone])
    const rows = rowsOf({ ...translated, 12: 'links' })
    expect(states(t, rows)).toEqual(['laid', 'laid', 'laid', 'laid', 'laid', 'laid', 'laid', 'unwrapped'])
  })
  it('decides the cells spanning the same columns as one group of their own, never with a column’s', () => {
    // (1706.03762v7 p9's row (E), "positional embedding instead of sinusoids" over four columns: group c1+4; a \multicolumn
    // cell is no column's: its failure holds its own group alone)
    const span = cell(12, [6, 1, 2, 0], 'positional embedding instead of sinusoids')
    const t = tableOf([...header, ...names, ...notes.slice(0, 3), span])
    const base = rowsOf({ ...translated, 12: 'Positionseinbettung' })
    const rows: Rows = {
      ...base,
      get: (id) => (id === idOf(13) ? { id, ok: false, why: { kind: 'refused' } } : base.get(id)),
    }
    expect(states(t, rows).slice(7)).toEqual(['laid', 'laid', 'laid', 'refused'])
  })
  it('keeps a table whose cells state no grid place as one group, as before', () => {
    const plain = tableOf([...header, ...names, ...notes].map(({ cell: _, ...c }) => c as Placed))
    expect(states(plain, rowsOf(translated)).every((s) => s === 'laid')).toBe(true)
  })
})

describe('a group on two pages is withheld whole, whatever its cells’ states (its pages read off every cell of it)', () => {
  // (a column of two cells, a table TeX broke over a page: its first cell on page 1, its second on page 2; each page's part holds
  // both, the bundle's closure over its ties, and lays the one on the page)
  const onPage = (c: Placed, page: number): Placed => ({
    ...c,
    lines: c.lines.map((l) => [page, ...l.slice(1)] as typeof l),
  })
  const top = cell(0, [1, 0, 1, 0], 'fast')
  const foot = onPage(cell(1, [2, 0, 1, 0], 'slow'), 2)
  const column = tableOf([top, foot])
  const both = { 0: 'schnell', 1: 'langsam' }
  const refusedOf = (ord: number): Rows => {
    const base = rowsOf(both)
    return { ...base, get: (id) => (id === idOf(ord + 1) ? { id, ok: false, why: { kind: 'refused' } } : base.get(id)) }
  }
  /** each cell's state as the lay of its own page draws it */
  const drawn = (rows: Rows) => [
    laidOf({ ...column, page: 1 }, rows)[0]!.state,
    laidOf({ ...column, page: 2 }, rows)[1]!.state,
  ]
  it('both cells set: the group withheld whole on either page', () => {
    expect(drawn(rowsOf(both))).toEqual(['cells', 'cells'])
  })
  it('the cell on page 2 not set before its lay (its row failed): the cell on page 1 withheld with it', () => {
    expect(drawn(refusedOf(1))).toEqual(['cells', 'refused'])
  })
  it('the cell on page 1 not set before its lay (its row failed): the cell on page 2 withheld with it', () => {
    expect(drawn(refusedOf(0))).toEqual(['refused', 'cells'])
  })
  it('the cell on page 2 not set for a reason of the part’s (the wrap cannot hide it): the cell on page 1 withheld with it', () => {
    const t = tableOf([top, { ...foot, why: 'unwrapped' }])
    const rows = rowsOf(both)
    expect([laidOf({ ...t, page: 1 }, rows)[0]!.state, laidOf({ ...t, page: 2 }, rows)[1]!.state]).toEqual([
      'cells',
      'unwrapped',
    ])
  })
  it('a cell never to be translated holds nothing: the group’s cells on one page are laid', () => {
    // (no row with every row in: a cell no translator was sent; it is the original's in a group drawn, wherever it stands)
    expect(drawn({ ...rowsOf({ 0: 'schnell' }), done: true })).toEqual(['laid', 'none'])
  })
})
