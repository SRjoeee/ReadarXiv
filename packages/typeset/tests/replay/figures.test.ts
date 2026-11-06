// S.figures replayed on the baseline's reader dumps: every figure text of four pairs (a Chinese paper whose labels are left
// unfit, one with labels crowded over a stroke, one with turned labels, a Japanese one), each outcome against the dump's whole
// (figures.ts). The whole corpus: lab/typeset/replay-figures.mjs.
import { describe, expect, it } from 'vitest'
import { replayFigures } from './figures.ts'
import { hasDerived, hasTap } from './tap.ts'
import { hasCache } from './today.ts'

const PAIRS = ['2610.21377v1-zh', '2608.06701v1-zh', '1706.03762v7-es', '2610.19159v1-ja']

describe.skipIf(!hasTap || !hasDerived('rules') || !hasCache)('S.figures: replayed on the reader dumps', () => {
  for (const pair of PAIRS)
    it(`draws or leaves every figure text of ${pair} as today did`, () => {
      const r = replayFigures(pair)
      expect([...r.differ, ...r.extra]).toEqual([])
      expect(r.equal).toBe(r.total)
      expect(r.total).toBeGreaterThan(0)
    })
})
