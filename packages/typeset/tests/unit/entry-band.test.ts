// design-a's entry reads a CJK cell's bands over the rules its Room.band states, and a side Room.bandOpen states no rule stands on
// is none of them: today's cellBands (L2:352) found no rule there and capped nothing from that side (its em box's top at the
// original's baseline where no rule is over it), where the line's own top or bottom read as a rule capped the cell at about 0.9
// (2602.23285v2 p7 t55, p18 t159 and t166, 2610.10069v1 p12 t97, 2610.21880v1 p2 t17).
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
const id = 'a'.repeat(64)
const cellOf = (room: Placed['room']): Placed => ({
  ord: 0,
  kind: 'cell',
  text: id,
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'l',
  lines: [[1, 0, 72, 100, 700, 707, 698, 72, 400, 0, 10]],
  room,
})
const sizeOf = (room: Placed['room']) => {
  const part: Part = {
    format: 1,
    page: 1,
    paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
    flows: [[cellOf(room)]],
  }
  // ("Model" in Chinese, escaped)
  const r: Row = { id, ok: true, by: 'test', content: [{ t: 'text', s: '模型' }] }
  const rows: Rows = { get: (k) => (k === id ? r : undefined), done: true }
  const [m] = layPage(part, rows, rulesFor('zh'), metrics()).members
  expect(m!.state).toBe('laid')
  return m!.fit!.size
}

describe('a CJK cell’s band with a side no rule stands on (Room.bandOpen)', () => {
  it('reads no rule under the cell where none stands there, only the rule over it', () => {
    // (the rule over at 708.5 leaves its em box room; read as a rule, the line's own bottom (698) capped it at 0.95)
    expect(sizeOf({ below: 0, next: 300, band: [698, 708.5] })).toBeLessThan(10)
    expect(sizeOf({ below: 0, next: 300, band: [698, 708.5], bandOpen: 1 })).toBe(10)
  })
  it('reads no rule over the cell where none stands there, only the rule under it', () => {
    // (the line's own top (707) read as a rule over it capped it at 0.9; with none, its em box's top at its baseline)
    expect(sizeOf({ below: 0, next: 300, band: [690, 707] })).toBeLessThan(10)
    expect(sizeOf({ below: 0, next: 300, band: [690, 707], bandOpen: 2 })).toBe(10)
  })
})
