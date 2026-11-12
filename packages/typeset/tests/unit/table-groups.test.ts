// A table's cells decided by group (the owner's ruling of 2026-11-08: judged the way the production site judges, today's
// decideGroups and settleGroup on TeX's grid): the part states each cell's grid place (Placed.cell) and its own text (Placed.plain); the entry
// groups a table's cells as today's groupOf (the header's cells, each column's, the cells spanning the same columns), keeps a
// body column whole where at least NAMES_SHARE of its cells came back from the translator as they went or were kept before
// asking (names: models, datasets), translates the header as a group, and holds and settles each group alone.
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
const rowsOf = (by: Record<number, string | null>, kept: number[] = []): Rows => {
  const m = new Map<string, Row>()
  for (const [o, s] of Object.entries(by))
    if (s !== null) m.set(idOf(Number(o) + 1), { id: idOf(Number(o) + 1), ok: true, by: 'test', content: text(s) })
  const k = new Set(kept.map((o) => idOf(o + 1)))
  return { get: (id) => m.get(id), done: false, kept: (id) => k.has(id) }
}
const states = (p: Part, rows: Rows) => layPage(p, rows, rules, metrics()).members.map((m) => m.state)

// (a header of two cells; a column of models, two of five of which come back as they went; a column of descriptions, one
// of five)
const header = [cell(0, [0, 0, 1, 1], 'Model'), cell(1, [0, 1, 1, 1], 'Training')]
const models = ['ByteNet', 'GNMT', 'ConvS2S', 'Transformer base', 'Transformer big'].map((s, k) =>
  cell(2 + k, [1 + k, 0, 1, 0], s),
)
const notes = ['fast', 'slow', 'large', 'small', 'BLEU'].map((s, k) => cell(7 + k, [1 + k, 1, 1, 0], s))
const table = tableOf([...header, ...models, ...notes])
const translated: Record<number, string> = {
  0: 'Modell',
  1: 'Training',
  2: 'ByteNet',
  3: 'GNMT',
  4: 'KonvS2S',
  5: 'Transformator Basis',
  6: 'Transformator groß',
  7: 'schnell',
  8: 'langsam',
  9: 'groß',
  10: 'klein',
  11: 'BLEU',
}

describe('a table decided by group (S.table.groups: today’s decideGroups over TeX’s grid)', () => {
  it('keeps a column whole where two of its five cells came back as they went; translates one with one in five', () => {
    // (1706.03762v7's Model column, today kept whole in Chinese: "ByteNet", "Deep-Att + PosUnk" in English beside "GNMT + RL
    // Ensemble" translated, the brief's failure; v2 laid each cell alone)
    expect(states(table, rowsOf(translated))).toEqual([
      // (the header: translated as a group, a cell of it back as it went among them)
      'laid',
      'laid',
      // (the models: 2 of 5 as they went, at NAMES_SHARE 0.4: the column of names kept whole)
      'cells',
      'cells',
      'cells',
      'cells',
      'cells',
      // (the descriptions: 1 of 5, translated whole)
      'laid',
      'laid',
      'laid',
      'laid',
      'laid',
    ])
  })
  it('counts a cell the paper keeps as it is (never asked) as one that came back as it went', () => {
    // (the paper's own name rule kept "ByteNet" and "GNMT" before asking: no row, never to come; the others translated)
    const rows = rowsOf({ ...translated, 2: null, 3: null, 4: 'KonvS2S', 5: 'Basis', 6: 'groß' }, [2, 3])
    expect(states(table, rows).slice(2, 7)).toEqual(['kept', 'kept', 'cells', 'cells', 'cells'])
  })
  it('never keeps the header as names: a header of names stays translated where it was', () => {
    const rows = rowsOf({ ...translated, 0: 'Model', 1: 'Training' })
    expect(states(table, rows).slice(0, 2)).toEqual(['laid', 'laid'])
  })
  it('withholds the group of a cell that cannot be set, and that group alone: the other groups are laid', () => {
    // (1706.03762v7-zh p9: today's header group left English, "(dev)" clipped past its floor, the body's base/big and row E
    // translated; v2 withheld the whole table)
    const rows = rowsOf({ ...translated, 1: 'Ein sehr langes Wort über die ganze Tabelle hinweg gesetzt' })
    const s = states(table, rows)
    expect(s[0]).toBe('cells')
    expect(s[1]).not.toBe('laid')
    expect(s.slice(7)).toEqual(['laid', 'laid', 'laid', 'laid', 'laid'])
  })
  it('decides the cells spanning the same columns as one group of their own, never with a column’s', () => {
    // (1706.03762v7 p9's row (E), "positional embedding instead of sinusoids" over four columns: group c1+4; a \multicolumn
    // cell is no column's)
    const span = cell(12, [6, 1, 2, 0], 'positional embedding instead of sinusoids')
    const t = tableOf([...header, ...models, ...notes.slice(0, 3), span])
    const rows = rowsOf({ ...translated, 7: 'fast', 8: 'slow', 12: 'Positionseinbettung' })
    // (the descriptions now 2 of 3 as they went: kept; the spanning cell its own group, translated)
    expect(states(t, rows).slice(7)).toEqual(['cells', 'cells', 'cells', 'laid'])
  })
  it('holds a group whose cell spanning columns the wrap cannot hide, as one stated spanning (its box the others’ too)', () => {
    const span = cell(7, [1, 0, 2, 0], 'all', { why: 'unwrapped' })
    const body = cell(8, [2, 0, 2, 0], 'none')
    const t = tableOf([...header, span, body])
    const rows = rowsOf({ ...translated, 7: 'alle', 8: 'keine' })
    expect(states(t, rows)).toEqual(['laid', 'laid', 'unwrapped', 'cells'])
  })
  it('keeps a table whose cells state no grid place as one group, as before', () => {
    const plain = tableOf([...header, ...models, ...notes].map(({ cell: _, ...c }) => c as Placed))
    expect(states(plain, rowsOf(translated)).every((s) => s === 'laid')).toBe(true)
  })
})
