// The gate's runner on lane L1's parts (gate-l1.ts) on one pair: every member set or counted by what stops it, every page laid
// from its own part, a member on two pages laid alike from each page's part. Its numbers against the baseline are the corpus
// runner's (lab/typeset/gate-l1.mjs): here it is held to run whole.
import { describe, expect, it } from 'vitest'
import { gateL1Pair } from './gate-l1.ts'
import { hasL1 } from './l1.ts'
import { hasDerived, hasTap } from './tap.ts'
import { hasCache } from './today.ts'

describe.skipIf(!hasTap || !hasDerived('rules') || !hasCache || !hasL1)('the gate on L1’s parts', () => {
  it('lays every page of 1706.03762v7-de.pack from its own L1 part', () => {
    const g = gateL1Pair('1706.03762v7-de.pack')
    expect(g.threw).toEqual([])
    expect(g.selfDiffer).toEqual([])
    expect(g.units.length).toBeGreaterThan(50)
    expect(g.setting.size).toBeGreaterThanOrEqual(g.units.length)
  })
})
