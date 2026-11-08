// The page's composition (layPagePrepared: L8 layFlow, L9, L10, L11, E1) replayed against the baseline's reader dumps on three
// pairs: every page laid from its own part, each laid unit's size, leading, lines with their text and crops equal to the dump's,
// and each member on two pages laid alike from each page's part (risk 1 of the page decision); but a unit today laid with a
// borrowed line, and one on a page it stands on that the port lays otherwise (tap.ts ruledIn: the owner's ruling of 2026-11-08,
// the page's fill reads every unit on it), and one whose frames the port fills each at its own leading (pass.ts framed). The
// corpus: lab/typeset/gate.mjs.
import { describe, expect, it } from 'vitest'
import { readerDump } from './display.ts'
import { framed, laysOf } from './pass.ts'
import { gatePair } from './gate.ts'
import { firstDifference, hasDerived, hasTap, ruledIn } from './tap.ts'
import { hasCache } from './today.ts'

const PAIRS = ['2610.21377v1-zh', '1512.03385v1-ja.pack', '1706.03762v7-de.pack']

describe.skipIf(!hasTap || !hasDerived('rules') || !hasCache)(
  'layPagePrepared: replayed against the reader dumps',
  () => {
    for (const pair of PAIRS)
      it(`lays every page of ${pair} as today drew it`, { timeout: 120_000 }, () => {
        const got = gatePair(pair)
        const ruled = ruledIn(pair)
        // (a unit whose frames the port fills each at its own leading: pass.ts framed)
        const { lays } = laysOf(pair)
        const want = readerDump(pair).units.filter((u) => !ruled.borrowed.has(u.ord))
        const mine = new Map(got.units.filter((u) => !ruled.borrowed.has(u.ord)).map((u) => [u.ord, u]))
        const differ = want
          .map((u) => {
            const m = mine.get(u.ord)
            const d = m
              ? firstDifference(
                  { size: m.size, leading: m.leading, lines: m.lines, elements: m.elements ?? [] },
                  { size: u.size, leading: u.leading, lines: u.lines, elements: u.elements ?? [] },
                  `ord ${u.ord}`,
                )
              : `ord ${u.ord}: not laid`
            // (laid otherwise or not at all on a page the ruling changed: the borrowed unit's own flow laid at states today never
            // tried, whose widths the table metrics do not hold, throws MissingMeasure and leaves the flow unlaid)
            return d && (ruled.units.has(u.ord) || framed(lays.get(u.ord))) ? null : d
          })
          .filter((d) => d !== null)
        expect(differ).toEqual([])
        expect(want.filter((u) => !mine.has(u.ord) && !ruled.units.has(u.ord))).toEqual([])
        expect(got.selfDiffer).toEqual([])
        expect(got.twoPages).toBeGreaterThan(0)
      })
  },
)
