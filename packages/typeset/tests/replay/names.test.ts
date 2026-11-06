// S.names and S.nameLed replayed against today's run on four pairs (names.ts): every babel name of their pages set by the port
// over the page's characters as today read them off the page's draw, against the baseline's reader dump; S.nameLed's slot, and
// no start taken on any other laid round. The whole corpus: lab/typeset/replay-names.mjs.
import { describe, expect, it } from 'vitest'
import { namesOf } from './names.ts'
import { hasDerived, hasTap, hasToday } from './tap.ts'
import { hasCache } from './today.ts'

const PAIRS = ['2610.21377v1-zh', '1512.03385v1-ja.pack', '2608.04322v1-de.pack', '2501.14787v1-zh']

describe.skipIf(!hasTap || !hasToday || !hasCache || !hasDerived('rules'))('S.names: replayed against today', () => {
  for (const pair of PAIRS)
    it(`sets every name of ${pair} as today did`, async () => {
      const r = await namesOf(pair)
      expect(r.names.filter((n) => n.d || n.widths)).toEqual([])
      expect(r.names.length).toBeGreaterThan(0)
      expect(r.led.differ).toEqual([])
    })
})
