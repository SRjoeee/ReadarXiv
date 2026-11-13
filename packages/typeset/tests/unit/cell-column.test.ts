// A table cell's room is its column's box (the owner's decision of 2026-11-13, his words in docs/PDF-READER.md §18.13: a table's
// columns have bounds we know, so text that fits inside them at the original's size needs no shrinking). A single-line
// cell whose column's box the part states (Room.column: the left and right edge of what TeX set in that column of its tabular,
// every entry's) is laid in that box, in its column's own alignment, at the largest size not over the original's that fits it,
// and that is all: no step down in its own ink's width first, no room that opens only where it is clipped there (X.further's
// 'widen'), no half way to a neighbour. A cell whose column the part does not state is laid as before, and a part made before
// the field lays as before.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Laid, Metrics, Rows } from '../../src/types.ts'

/** every character half its size wide: a translation of n characters is 5n pt at the size 10, 5ns at the scale s */
const metrics = (): Metrics => ({
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
})
const idOf = (n: number) => n.toString(16).padStart(64, '0')
/** a single-line cell at size 10 on baseline `y`, its own line x0..x1 (what TeX set: the original's advances), the next ink
 *  beside it `side` (Room.side), its column's box `column` where the part states it */
const cell = (
  ord: number,
  [x0, x1]: [number, number],
  o: { align?: Placed['align']; side?: [number, number]; column?: [number, number]; y?: number; grid?: Placed['cell'] } = {},
): Placed => ({
  ord,
  kind: 'cell',
  text: idOf(ord + 1),
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: o.align ?? 'l',
  lines: [[1, 0, x0, x1, o.y ?? 700, (o.y ?? 700) + 7, (o.y ?? 700) - 2, 72, 500, 0, 10]],
  room: { below: 0, next: 300, side: o.side ?? [x0 - 20, x1 + 20], ...(o.column ? { column: o.column } : {}) },
  ...(o.grid ? { cell: o.grid } : {}),
})
const rowsOf = (by: Record<number, string>): Rows => {
  const m = new Map<string, Row>()
  for (const [o, s] of Object.entries(by))
    m.set(idOf(Number(o) + 1), { id: idOf(Number(o) + 1), ok: true, by: 'test', content: [{ t: 'text', s }] })
  return { get: (k) => m.get(k), done: true }
}
const part = (ms: Placed[]): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: ms.map((m) => [m]),
})
const layOf = (ms: Placed[], rows: Rows, lang = 'de') => layPage(part(ms), rows, rulesFor(lang), metrics()).members
/** the drawn text's extent on its line: its first run's start to the line's end */
const extentOf = (m: Laid): [number, number] => {
  const l = m.lines[0]!
  return [(l[3][0] as { x: number }).x, l[2]]
}
const byOrd = (ms: Laid[], ord: number) => ms.find((m) => m.ord === ord)!
/** a cell's column box stated or not: the same cell, the field dropped */
const unstated = (m: Placed): Placed => {
  const { column: _, ...room } = m.room as Placed['room'] & { column?: unknown }
  return { ...m, room }
}

// (the shapes, each a column of the owner's two tables of 2611.03953v2 and its Table 12, as the trace measured them: lanes
// cell-room.md A)
/** Table 11's: "base" in a column whose widest entry, "teacher", is longer; its translation a little wider than its own
 *  original (35 pt against 30), well inside the column (60) */
const t11 = () => cell(0, [100, 130], { column: [100, 160], side: [80, 175] })
/** Table 7's: "MOPD (TA init)" in its Method column, its translation (70 pt) wider than the column (60) even so; the next
 *  column's ink 15 pt past the column's edge, its blank between */
const t7 = () => cell(1, [100, 150], { column: [100, 160], side: [80, 175], y: 680 })
/** Table 12's header, three cells today's reader sizes by three paths: "Pre" in a room under 1.5 em (the breaker drops a
 *  slot that narrow, so its size steps down until 1.5 em of it fits), "Final" clipped at its floor in its own room and then
 *  widened half way to its neighbours (drawn at the original's size, past its column), "Step 100" fitted in its own room at 0.9 */
const t12 = () => [
  cell(2, [100, 112], { align: 'c', column: [94, 118], side: [80, 130], y: 660 }),
  cell(3, [200, 220], { align: 'c', column: [197, 223], side: [180, 245], y: 660 }),
  cell(4, [300, 327], { align: 'c', column: [295, 332], side: [285, 345], y: 660 }),
]
/** a centred column: its own line 115-145 (middle 130) in its column 100-160, the neighbours' ink 5 pt past it */
const centred = () => cell(5, [115, 145], { align: 'c', column: [100, 160], side: [95, 165], y: 640 })
/** a right-aligned column: its own line 130-160 in its column 100-160 */
const right = () => cell(6, [130, 160], { align: 'r', column: [100, 160], side: [95, 165], y: 620 })
/** a \multicolumn{2}{c}: its box the union of the two columns' it spans, 110-230, which the part states */
const spanning = () =>
  cell(7, [150, 190], { align: 'c', column: [110, 230], side: [100, 240], y: 600, grid: [0, 1, 2, 1] })
const ROWS = rowsOf({
  0: 'x'.repeat(7),
  1: 'x'.repeat(14),
  2: 'x'.repeat(2),
  3: 'x'.repeat(6),
  4: 'x'.repeat(6),
  5: 'x'.repeat(11),
  6: 'x'.repeat(10),
  7: 'x'.repeat(20),
})

describe('a table cell laid in its column’s box (Room.column; the owner’s decision of 2026-11-13)', () => {
  it('sets a translation a little wider than its own original at the original’s size where its column holds it (Table 11)', () => {
    const [m] = layOf([t11()], ROWS)
    expect(m!.state).toBe('laid')
    expect(m!.fit!.size).toBeCloseTo(10, 5)
    const [a, z] = extentOf(m!)
    expect(a).toBeCloseTo(100, 5)
    expect(z).toBeCloseTo(135, 5)
  })
  it('sets one wider than its column at the largest size that fits the column: not the floor, not past it (Table 7)', () => {
    // (70 pt at 1.0 in 60: 0.85 sets 59.5; 0.875 would set 61.25, past the column's edge into the next one's blank)
    const [m] = layOf([t7()], ROWS)
    expect(m!.state).toBe('laid')
    expect(m!.fit!.size).toBeCloseTo(8.5, 5)
    const [a, z] = extentOf(m!)
    expect(a).toBeCloseTo(100, 5)
    expect(z).toBeLessThanOrEqual(160 + 1e-9)
  })
  it('sizes three header cells by the one rule, each the largest size its own column holds (Table 12)', () => {
    const ms = layOf(t12(), ROWS)
    // ("Pre": 10 pt in its column of 24, no sliver of a room; "Final": 30 pt in 26, 0.85, where today ran it on past its
    // column at 1.0; "Step 100": 30 pt in 37, the original's size)
    const sizes = [2, 3, 4].map((o) => byOrd(ms, o).fit!.size)
    expect(sizes[0]).toBeCloseTo(10, 5)
    expect(sizes[1]).toBeCloseTo(8.5, 5)
    expect(sizes[2]).toBeCloseTo(10, 5)
    for (const [o, [b0, b1]] of [
      [2, [94, 118]],
      [3, [197, 223]],
      [4, [295, 332]],
    ] as const) {
      const [a, z] = extentOf(byOrd(ms, o))
      expect(a).toBeGreaterThanOrEqual(b0 - 1e-9)
      expect(z).toBeLessThanOrEqual(b1 + 1e-9)
      // (each centred on its column's middle, TeX's)
      expect((a + z) / 2).toBeCloseTo((b0 + b1) / 2, 5)
    }
  })
  it('centres a centred column’s cell on its column’s middle, its box both sides', () => {
    const [m] = layOf([centred()], ROWS)
    expect(m!.fit!.size).toBeCloseTo(10, 5)
    const [a, z] = extentOf(m!)
    expect(a).toBeCloseTo(102.5, 5)
    expect(z).toBeCloseTo(157.5, 5)
  })
  it('ends a right-aligned column’s cell at its column’s right edge, its room to the column’s left', () => {
    const [m] = layOf([right()], ROWS)
    expect(m!.fit!.size).toBeCloseTo(10, 5)
    const [a, z] = extentOf(m!)
    expect(a).toBeCloseTo(110, 5)
    expect(z).toBeCloseTo(160, 5)
  })
  it('lays a spanning cell in the union of the columns it spans, as the part states it', () => {
    const [m] = layOf([spanning()], ROWS)
    expect(m!.fit!.size).toBeCloseTo(10, 5)
    const [a, z] = extentOf(m!)
    expect(a).toBeCloseTo(120, 5)
    expect(z).toBeCloseTo(220, 5)
  })
  it('lays a cell whose column the part does not state exactly as before, beside cells whose columns it states', () => {
    // (Table 7's cell with no box: today's own room, clipped at the floor and run on half way to the next column's ink: 0.875,
    // past where its column ends)
    const alone = layOf([unstated(t7())], ROWS)
    const among = layOf([t11(), unstated(t7()), ...t12(), centred(), right(), spanning()], ROWS)
    expect(byOrd(among, 1)).toEqual(alone[0])
    expect(alone[0]!.fit!.size).toBeCloseTo(8.75, 5)
    expect(extentOf(alone[0]!)[1]).toBeCloseTo(161.25, 5)
  })
  it('lays a part made before the field exactly as before: each cell in its own room, widened only where clipped at its floor', () => {
    const ms = layOf([t11(), t7(), ...t12(), centred(), right(), spanning()].map(unstated), ROWS)
    const size = (o: number) => byOrd(ms, o).fit!.size
    // (its own 30 pt: 0.85; clipped at the floor in 50, widened to 162.5: 0.875; "Pre" stepped until its room is 1.5 em: 0.8;
    // "Final" widened: 1.0; "Step 100" in its own 27: 0.9; the centred one widened to 105-155: 0.9; the right one to 112.5: 0.95;
    // the spanning one widened to 125-215: 0.9)
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(size)).toEqual([8.5, 8.75, 8, 10, 9, 9, 9.5, 9].map((x) => expect.closeTo(x, 5)))
  })
})
