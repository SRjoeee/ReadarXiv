// I6 on table metrics (design-a §1.4, design-b §1.8): the composition is deterministic. A pair laid page by page twice from the
// same prepared members (gate.ts gatePair) gives deep-equal dumps, and each member on two pages is laid alike from each page's
// part. Not yet whole: the walk writes `free` on the blocks it is handed (today's), which the TypeScript port of walk.mjs
// copies first (the lane file's Next).
import { describe, expect, it } from 'vitest'
import { gatePair } from './gate.ts'
import { hasDerived, hasTap } from './tap.ts'
import { hasCache } from './today.ts'

describe.skipIf(!hasTap || !hasDerived('rules') || !hasCache)('I6: the composition is deterministic', () => {
  it('lays a pair twice alike', () => {
    const a = gatePair('2610.21377v1-zh'),
      b = gatePair('2610.21377v1-zh')
    expect(b.units).toEqual(a.units)
    expect(a.selfDiffer).toEqual([])
    expect(a.twoPages).toBeGreaterThan(0)
  })
})
