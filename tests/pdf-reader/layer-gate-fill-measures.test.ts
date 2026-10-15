import { describe, expect, it } from 'vitest'
import { type DumpStat, fillMeasures, movedBetween } from '../../lab/pdf/spikes/layer-gate/fill-measures.mjs'

// The page-local fill's report (1b-C): the purity check recomputes each page's target from its units' records, and the
// steps and the spread are read from the targets and the drawn leadings.

type Stat = DumpStat
/** a unit of `n` lines, all on its first page (or its pages' in turn), its fill leading and the target recorded with it */
const unit = (id: number, kind: string, pages: number[], fillLead: number, target: number, lead = Math.min(fillLead, target + 0.05), n = 6): Stat => ({
  id, kind, pages, lead, lines: Array.from({ length: n }, (_, k) => [pages[k % pages.length]!, 0]), fill: { target, lead: fillLead },
})

describe('the page-local fill measures', () => {
  const dump = { stats: [
    unit(0, 'para', [1], 1.0, 1.0), unit(1, 'para', [2], 1.5, 1.5), unit(2, 'para', [2, 3], 1.3, 1.5), unit(3, 'para', [3], 1.7, 1.35),
  ] }
  it('finds a page whose recorded target is its own held to its anchor, and a page whose is not', () => {
    // (page 3: own 1.7 (unit 3), anchor the median of 1.7 and the continuing 1.3 = 1.7: the target is 1.7, recorded 1.35)
    const m = fillMeasures(dump)
    expect(m.purity.checked).toBe(3)
    expect(m.purity.mismatches).toEqual([{ page: 3, recorded: 1.35, recomputed: 1.7 }])
    const ok = { stats: dump.stats.map(s => (s.id === 3 ? unit(3, 'para', [3], 1.7, 1.7) : s)) }
    expect(fillMeasures(ok).purity.mismatches).toEqual([])
  })
  it('counts the target steps over the band between body pages, and reads the rhythm spread from the drawn leadings', () => {
    const m = fillMeasures({ stats: dump.stats.map(s => (s.id === 3 ? unit(3, 'para', [3], 1.7, 1.7) : s)) })
    // (targets 1.0, 1.5, 1.7: two steps over 0.05, the larger 0.5)
    expect(m.fillStep).toEqual({ steps: 2, max: 0.5 })
    expect(m.rhythmDrift).toBeGreaterThan(0)
    expect(m.rhythmSpread).toBeGreaterThan(0)
  })
  it('lists the pages and units that moved between two dumps', () => {
    const head = { stats: dump.stats.map(s => (s.id === 1 ? unit(1, 'para', [2], 1.5, 1.4) : s)) }
    expect(movedBetween(dump, head)).toEqual({ pages: ['2:1.5->1.4'], units: [1] })
  })
})
