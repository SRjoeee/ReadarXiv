// A table cell set on several lines, now one unit (docs/PDF-READER.md §18.74, the owner's decision of 2026-11-15): each of its
// lines is laid in the cell's room in its column (Room.column), whichever line it is, so that no cell is drawn smaller than
// today for having become one unit; the cell has one size, the largest not over the original's at which every line fits; the
// lines stand as TeX set them in the cell's box: the box (as wide as its widest line) in the room by the cell's class, each line in
// the box by its own (Placed.inner, read off arXiv's page; absent, the cell's class). A paragraph cell (no column box), a held
// line and a side short of the box are laid in their own rooms as before.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Laid, Metrics, Rows } from '../../src/types.ts'

/** every character half its size wide: a text of n characters is 5n pt at the size 10 */
const metrics = (): Metrics => ({
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
})
const idOf = (n: number) => n.toString(16).padStart(64, '0')
/** a cell of two lines at size 10 (baselines 700 and 688), its lines' own extents `own`, a forced break between them (El.ends:
 *  TeX ended its first line there), its column's room `column` where the part states it, the box's line alignment `inner` */
const cell = (
  ord: number,
  own: [[number, number], [number, number]],
  o: {
    align?: Placed['align']
    inner?: 'l' | 'c' | 'r'
    column?: [number, number]
    side?: [number, number]
    held?: boolean
  } = {},
): Placed =>
  ({
    ord,
    kind: 'cell',
    text: idOf(ord + 1),
    lead: 12,
    style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
    align: o.align ?? 'c',
    ...(o.inner ? { inner: o.inner } : {}),
    lines: [
      [1, 0, own[0][0], own[0][1], 700, 707, 698, 72, 500, 0, 10],
      [1, 0, own[1][0], own[1][1], 688, 695, 686, 72, 500, o.held ? 1 : 0, 10],
    ],
    els: [['1', { kind: 'space', brk: 1, ends: [0, 0], ink: [] }]],
    room: { below: 0, next: 300, side: o.side ?? [95, 165], ...(o.column ? { column: o.column } : {}) },
  }) as Placed
/** its row: `a` before the break, `b` after it (a break at the start or end where one is empty) */
const rowsOf = (by: Record<number, [string, string]>): Rows => {
  const m = new Map<string, Row>()
  for (const [o, [a, b]] of Object.entries(by)) {
    const content: Row['content'] = [
      ...(a ? [{ t: 'text' as const, s: a }] : []),
      { t: 'el' as const, id: '1' },
      ...(b ? [{ t: 'text' as const, s: b }] : []),
    ]
    m.set(idOf(Number(o) + 1), { id: idOf(Number(o) + 1), ok: true, by: 'test', content } as Row)
  }
  return { get: (k) => m.get(k), done: true }
}
const part = (ms: Placed[]): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: ms.map((m) => [m]),
})
const layOf = (ms: Placed[], rows: Rows) => layPage(part(ms), rows, rulesFor('de'), metrics()).members
/** each drawn line's extent: its first run's start to its end */
const extents = (m: Laid): [number, number][] => m.lines.map((l) => [(l[3][0] as { x: number }).x, l[2]])
const unstated = (m: Placed): Placed => {
  const { column: _, ...room } = m.room as Placed['room'] & { column?: unknown }
  return { ...m, room }
}

describe('a cell of two lines laid in its room in its column (§18.74)', () => {
  // (its own lines 30 and 36 pt wide in a column 60 pt wide; its translation's lines 50 and 55 pt at the original's size)
  const narrow: [[number, number], [number, number]] = [
    [115, 145],
    [112, 148],
  ]
  const rows = rowsOf({ 0: ['x'.repeat(10), 'y'.repeat(11)] })
  it("lays every line at the original's size where the column holds it, each centred in its centred column", () => {
    const [m] = layOf([cell(0, narrow, { column: [100, 160] })], rows)
    expect(m!.state).toBe('laid')
    expect(m!.fit!.size).toBeCloseTo(10, 5)
    const [l1, l2] = extents(m!)
    expect(l1![0]).toBeCloseTo(105, 5)
    expect(l1![1]).toBeCloseTo(155, 5)
    expect(l2![0]).toBeCloseTo(102.5, 5)
    expect(l2![1]).toBeCloseTo(157.5, 5)
  })
  it('lays the cell at one size, the largest at which its widest line fits the column', () => {
    // (its second line 70 pt in 60: 0.85 sets 59.5; the first, 40 pt, at the same size)
    const [m] = layOf([cell(1, narrow, { column: [100, 160] })], rowsOf({ 1: ['x'.repeat(8), 'y'.repeat(14)] }))
    expect(m!.fit!.size).toBeCloseTo(8.5, 5)
    for (const [a, z] of extents(m!)) {
      expect(a).toBeGreaterThanOrEqual(100 - 1e-9)
      expect(z).toBeLessThanOrEqual(160 + 1e-9)
    }
  })
  it('sets its box in the room by the cell’s class and each line in the box by its own: a centred box flush left', () => {
    // (the box as wide as its widest line, 55 pt, from the room's left edge; the first line, 50 pt, centred in it)
    const [m] = layOf(
      [cell(2, narrow, { align: 'l', inner: 'c', column: [100, 160] })],
      rowsOf({ 2: ['x'.repeat(10), 'y'.repeat(11)] }),
    )
    const [l1, l2] = extents(m!)
    expect(l2![0]).toBeCloseTo(100, 5)
    expect(l2![1]).toBeCloseTo(155, 5)
    expect(l1![0]).toBeCloseTo(102.5, 5)
    expect(l1![1]).toBeCloseTo(152.5, 5)
  })
  it('fills its lines in the room where the reply sets the break at its end', () => {
    const [m] = layOf([cell(3, narrow, { column: [100, 160] })], rowsOf({ 3: ['xxxxx xxxxx yyyyy yyyyy', ''] }))
    expect(m!.state).toBe('laid')
    expect(m!.fit!.size).toBeCloseTo(10, 5)
    for (const [a, z] of extents(m!)) {
      expect(a).toBeGreaterThanOrEqual(100 - 1e-9)
      expect(z).toBeLessThanOrEqual(160 + 1e-9)
    }
  })
})

describe('the other side: laid in their own rooms as before', () => {
  const narrow: [[number, number], [number, number]] = [
    [115, 145],
    [112, 148],
  ]
  const rows = rowsOf({ 4: ['x'.repeat(10), 'y'.repeat(11)] })
  it('a cell of several lines whose column the part does not state (a paragraph cell): its lines’ own rooms', () => {
    const [m] = layOf([cell(4, narrow)], rows)
    expect(m!.fit!.size).toBeLessThan(10)
  })
  it('a cell with a held line: as with no column stated', () => {
    const held = cell(4, narrow, { column: [100, 160], held: true })
    expect(layOf([held], rows)[0]).toEqual(layOf([unstated(held)], rows)[0])
  })
  it('a cell whose side stops short of its column’s box: as with no column stated', () => {
    const short = cell(4, narrow, { column: [100, 160], side: [105, 165] })
    expect(layOf([short], rows)[0]).toEqual(layOf([unstated(short)], rows)[0])
  })
})
