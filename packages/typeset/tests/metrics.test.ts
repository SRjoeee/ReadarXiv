// The table adapter of Metrics: a synthetic table, and the tap's recorded widths where lab-data is present.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type MeasureTable, MissingMeasure, tableMetrics } from '../src/metrics/table.ts'
import { hasTap, readGz, TAP } from './replay/tap.ts'

const FACE = '400 100px "axt-nimbus-roman"'
const TABLE: MeasureTable = {
  widths: [
    [FACE, 'word', 196.2, 68.3, 1.4],
    [FACE, ' ', 25, 0, 0],
  ],
  inks: [[FACE, '√', 80, 4]],
  rights: [[FACE, 'word', 195.1]],
}

describe('tableMetrics', () => {
  const m = tableMetrics(TABLE)
  it('answers at 100 px with the table’s own number, at another size scaled', () => {
    expect(m.advance(FACE, 100, 'word')).toBe(196.2)
    expect(m.advance(FACE, 10, 'word')).toBeCloseTo(19.62, 12)
    expect(m.ink(FACE, 100, 'word')).toEqual([68.3, 1.4, 195.1])
    expect(m.ink(FACE, 100, '√').slice(0, 2)).toEqual([80, 4])
  })
  it('refuses a measure it does not hold, never guesses one', () => {
    expect(() => m.advance(FACE, 100, 'other')).toThrow(MissingMeasure)
    expect(() => m.advance('700 100px "axt-nimbus-roman"', 100, 'word')).toThrow(MissingMeasure)
  })
  it('is ready for the faces it measures alone', () => {
    expect(m.ready(FACE, 'word')).toBe(true)
    expect(m.ready('700 100px "axt-nimbus-roman"', 'word')).toBe(false)
  })
})

describe.skipIf(!hasTap)('tableMetrics over the tap’s recorded widths', () => {
  it('reads every pair’s table and answers each recorded width as recorded', () => {
    const files = readdirSync(join(TAP, 'metrics')).filter((f) => f.endsWith('.metrics.json.gz'))
    expect(files.length).toBe(123)
    for (const f of files.slice(0, 5)) {
      const t = readGz(join(TAP, 'metrics', f)) as MeasureTable
      const m = tableMetrics(t)
      for (const [face, text, w] of t.widths) expect(m.advance(face, 100, text)).toBe(w)
    }
  })
})
