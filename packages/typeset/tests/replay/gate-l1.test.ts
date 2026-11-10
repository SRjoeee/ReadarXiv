// The gate's runner on lane L1's parts (gate-l1.ts) on one pair: every member set or counted by what stops it, every page laid
// from its own part, a member on two pages laid alike from each page's part. Its numbers against the baseline are the corpus
// runner's (lab/typeset/gate-l1.mjs): here it is held to run whole.
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { tableMetrics } from '../../src/metrics/table.ts'
import { gatePair } from './gate.ts'
import { gateL1Pair } from './gate-l1.ts'
import { hasL1 } from './l1.ts'
import { hasDerived, hasTap, readGz, TAP } from './tap.ts'
import { hasCache } from './today.ts'

describe.skipIf(!hasTap || !hasDerived('rules') || !hasCache || !hasL1)('the gate on L1’s parts', () => {
  it('lays every page of 1706.03762v7-de.pack from its own L1 part', { timeout: 120_000 }, () => {
    const g = gateL1Pair('1706.03762v7-de.pack')
    expect(g.threw).toEqual([])
    expect(g.selfDiffer).toEqual([])
    expect(g.units.length).toBeGreaterThan(50)
    expect(g.setting.size).toBeGreaterThanOrEqual(g.units.length)
  })
  it('holds I4 and the restated I5 on its lays, the reading from the part; I3 no worse than today’s on the pair', {
    timeout: 120_000,
  }, () => {
    // (measured by the tap's table of today's measures: a measure today never made throws, that flow's members 'error')
    const g = gateL1Pair('1512.03385v1-de.pack', {
      reading: 'part',
      metricsOf: (pair) => tableMetrics(readGz(join(TAP, 'metrics', `${pair}.metrics.json.gz`)) as never),
    })
    expect(g.inputs.size).toBeGreaterThan(100)
    const today = gatePair('1512.03385v1-de.pack')
    // (I4: every element's crop drawn once; I5: a line past its slot only by its closing mark's blank half, or overfull)
    expect(g.inv.I4).toEqual([])
    expect(g.inv.I5).toEqual([])
    expect(g.inv.I3.length).toBeLessThanOrEqual(today.inv.I3.length)
    expect(g.selfDiffer).toEqual([])
  })
})
