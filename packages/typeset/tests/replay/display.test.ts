// D.display replayed against the baseline's reader dumps: every laid unit of three pairs (a Chinese one laid in runs and
// filled, a Japanese one with CJK cells and crops, a German one), laid by the chain from F2 and filled by its page's pass,
// drawn by D.display and read as the baseline's harness reads today's drawing (display.ts): size, leading, each line's page,
// x0, x1, baseline and text, each crop's piece and box. The whole corpus: lab/typeset/replay-display.mjs.
import { describe, expect, it } from 'vitest'
import { displayReplay } from './display.ts'
import { hasDerived, hasTap } from './tap.ts'
import { hasCache } from './today.ts'

const PAIRS = ['2610.21377v1-zh', '1512.03385v1-ja.pack', '1706.03762v7-de.pack']

describe.skipIf(!hasTap || !hasDerived('rules') || !hasCache)('D.display: replayed against the reader dumps', () => {
  for (const pair of PAIRS)
    it(`draws every laid unit of ${pair} as today did`, { timeout: 120_000 }, () => {
      const r = displayReplay(pair)
      expect(r.chains).toEqual([])
      expect(r.unlaid).toEqual([])
      expect(r.differ).toEqual([])
      expect(r.equal).toBe(r.units)
      expect(r.lines).toBeGreaterThan(r.units)
    })
})
