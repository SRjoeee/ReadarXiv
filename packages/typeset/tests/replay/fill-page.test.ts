// S.fill.page replayed on the tap: every pass of three pairs (a Chinese one laid in runs and grown, a Japanese one with CJK
// cells settled into their bands, a German one), each unit laid by the chain from F2 (round.ts), the pass by fillPass, every
// value the tap read compared (pass.ts), but a pass the no-borrowing ruling changes (pass.ts `ruled`). The German pair is
// 1810.04805v2's: every pass of 1706.03762v7's holds a unit today laid with a borrowed line. The whole corpus:
// lab/typeset/replay-fill.mjs.
import { describe, expect, it } from 'vitest'
import { laysOf, passesOf } from './pass.ts'
import { hasDerived, hasTap } from './tap.ts'
import { hasCache } from './today.ts'

const PAIRS = ['2610.21377v1-zh', '1512.03385v1-ja.pack', '1810.04805v2-de.pack']

describe.skipIf(!hasTap || !hasDerived('rules') || !hasCache)('S.fill.page: replayed on the tap', () => {
  for (const pair of PAIRS)
    it(`fills every page of ${pair} as today did`, { timeout: 120_000 }, () => {
      const { lays, differ } = laysOf(pair)
      expect(differ).toEqual([])
      const passes = passesOf(pair, lays)
      expect(passes.filter((r) => r.missing || r.d)).toEqual([])
      expect(passes.reduce((a, r) => a + r.filled, 0)).toBeGreaterThan(0)
    })
})
