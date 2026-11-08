// A table cell laid in its own room, its size its own (the owner's ruling of 2026-11-08: table cells sized as today). Today's
// cell is set in its own ink's width (run.mjs:2116, no widening of a cell's line), shrinks there down to its fit's floor, and
// only where it is clipped there runs on over the paper beside it (fitFurther's 'widen': half way to another unit's text,
// clear of a rule); and no letter spacing is a cell's (TeX never stretches a tabular entry's glue: the owner, "in the tables
// today's letter spacing is more natural", 2610.20967 p4).
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'

const metrics = (): Metrics => ({
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
})
const idOf = (n: number) => n.toString(16).padStart(64, '0')
/** a cell's line 60 pt wide at x0 (its ink), 20 pt of paper either side to the next ink (Room.side) */
const cell = (ord: number, x0: number, o: Partial<Placed> = {}): Placed => ({
  ord,
  kind: 'cell',
  text: idOf(ord + 1),
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'l',
  lines: [[1, 0, x0, x0 + 60, 700, 707, 698, 72, 500, 0, 10]],
  room: { below: 0, next: 300, side: [x0 - 20, x0 + 80] },
  ...o,
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
const laidOf = (ms: Placed[], rows: Rows, lang = 'de') => layPage(part(ms), rows, rulesFor(lang), metrics()).members

describe('a table cell in its own room (today’s cells: run.mjs:2116, fitFurther)', () => {
  it('shrinks a translation longer than its own ink there, never widening it at once into the paper beside it', () => {
    // (2608.25210v2-zh p14's Strategy column: today each cell in its own ink's width, shrunk; v2 set every cell at the
    // original's size, run on to its rules, the column crowded. 14 letters, 70 pt at the size, in 60)
    const [m] = laidOf([cell(0, 72)], rowsOf({ 0: 'x'.repeat(14) }))
    expect(m!.state).toBe('laid')
    expect(m!.fit!.size).toBeLessThan(10)
    expect(m!.fit!.size).toBeGreaterThanOrEqual(8)
    expect(m!.lines[0]![2]).toBeLessThanOrEqual(132 + 1e-9)
  })
  it('runs a translation it cannot set at its floor there on over its paper, at the largest size that sets it (X.further)', () => {
    // (16 letters: 64 pt at the floor 0.8, past its 60; its side 52-152, half its size clear of the ink there: to 147)
    const [m] = laidOf([cell(0, 72)], rowsOf({ 0: 'x'.repeat(16) }))
    expect(m!.state).toBe('laid')
    expect(m!.lines[0]![2]).toBeGreaterThan(132)
    expect(m!.lines[0]![2]).toBeLessThanOrEqual(147 + 1e-9)
    expect(m!.fit!.size).toBeGreaterThan(8)
  })
  it('widens a cell a quarter of its size off a wall and half way to a glyph, as today’s paperTo', () => {
    // (1706.03762v7-zh p10's Table 4, "WSJ only, discriminative" between its column's rules at 296.78 and 408.3: today's widening
    // kept a quarter of the size off each rule and set the translation at its floor, 7.97; half the size off them, v2's room was
    // 5 pt narrower and the cell fell under the floor, 7.47)
    const between = cell(0, 302.56, {
      align: 'c',
      lines: [[1, 0, 302.56, 402.52, 700, 707, 698, 107.53, 505.66, 0, 10]],
      room: { below: 0, next: 300, side: [296.78, 408.3], wall: 3 },
    })
    const [w] = laidOf([between], rowsOf({ 0: 'x'.repeat(26) }))
    expect(w!.state).toBe('laid')
    expect(w!.fit!.size).toBeCloseTo(8, 5)
    // (beside a glyph no member's, a number of the next column: half way to it, never nearer, as today's)
    const [g] = laidOf(
      [cell(0, 100, { room: { below: 0, next: 300, side: [80, 200] } })],
      rowsOf({ 0: 'x'.repeat(17) }),
    )
    expect(g!.state).toBe('laid')
    expect(g!.lines[0]![2]).toBeGreaterThan(160)
    expect(g!.lines[0]![2]).toBeLessThanOrEqual(180 + 1e-9)
  })
  it('keeps a centred cell centred on its own middle, widened or not (v2’s centring of header cells, endorsed)', () => {
    // (2608.25210v2-zh p14's header cells, centred in their column: the owner's "v2's automatic centring is surely right")
    const [short] = laidOf([cell(0, 72, { align: 'c' })], rowsOf({ 0: 'x'.repeat(6) }))
    // (the drawn text from its first run's start to its line's end)
    const middle = (m: typeof short) => {
      const l = m!.lines[0]!
      return ((l[3][0] as { x: number }).x + l[2]) / 2
    }
    expect(middle(short)).toBeCloseTo(102, 5)
    // (one it cannot set at its floor there, widened as far to either side: its ink 100-160, its paper 80-180)
    const [long] = laidOf([cell(0, 100, { align: 'c' })], rowsOf({ 0: 'x'.repeat(16) }))
    expect(long!.lines[0]![2]).toBeGreaterThan(160)
    expect(middle(long)).toBeCloseTo(130, 5)
  })
  it('gives a CJK cell no letter spacing from the page’s fill, as TeX stretches no entry of a tabular', () => {
    // (2610.20967v1-zh p4's t60 "Ours (MuScriptor roll, L2)": its widened room left room to fill, and the page's fill spread it
    // at 0.05 em; the owner: "in the tables today's letter spacing is more natural")
    const [m] = laidOf([cell(0, 72)], rowsOf({ 0: '\u6a21\u578b' }), 'zh')
    expect(m!.state).toBe('laid')
    expect(m!.fit!.track).toBeLessThanOrEqual(0)
  })
})
