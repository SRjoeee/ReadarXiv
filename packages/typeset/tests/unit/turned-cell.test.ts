// RED (lane turned, the fix not built): a table cell the original sets turned (a header's \rotatebox{90}{…}: Placed.dir and its
// run, as a turned figure text states them) is laid along its run and drawn at its angle, as the translated TeX would set its
// translation in the same \rotatebox: its line from its run's origin up the page, its items turned (`dir`), lit in its run's
// frame. A cell laid level would stand across the cell's upright box over the columns beside it.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import type { TextItem } from '../../src/emit/display.ts'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'

const metrics = (): Metrics => ({
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
})
const id = 'c'.repeat(64)
/** a header cell "Recall" set a quarter turned: its run from (150, 380) up for 30, 20 of room before and after along it; its
 *  line on A its box on the page, upright (x 144-152, y 380-410) */
const turnedCell = (o: Partial<Placed> = {}): Placed => ({
  ord: 0,
  kind: 'cell',
  text: id,
  plain: 'Recall',
  lead: 10,
  style: { role: 'serif', size: 8, design: 'NimbusRomNo9L-Regu' },
  align: 'l',
  cell: [0, 1, 1, 1],
  lines: [[1, 0, 144, 152, 380, 410, 380, 144, 152, 0, 8]],
  room: { below: 0, next: 40, side: [140, 156] },
  dir: [0, 1],
  run: [150, 380, 30, 20, 20],
  ...o,
})
const part = (m: Placed): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: [[m]],
})
const rows = (s: string): Rows => {
  const r: Row = { id, ok: true, by: 'test', content: [{ t: 'text', s }] }
  return { get: (k) => (k === id ? r : undefined), done: true }
}

describe('a table cell set turned (RED: the fix is not built)', () => {
  it('is laid along its run, its items drawn at its angle', () => {
    const [m] = layPage(part(turnedCell()), rows('Rappel'), rulesFor('fr'), metrics()).members
    expect(m!.state).toBe('laid')
    const [, x0, , items] = m!.lines[0]!
    // (from its run's origin along (0, 1): its line's places are along the run, from 150)
    expect(x0).toBeCloseTo(150, 6)
    expect((items as TextItem[]).every((it) => 'dir' in it && it.dir?.[0] === 0 && it.dir?.[1] === 1)).toBe(true)
    expect(m!.lit.dir).toEqual([0, 1])
  })
})
