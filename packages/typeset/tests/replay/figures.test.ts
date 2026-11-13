// S.figures replayed on the baseline's reader dumps: every figure text of four pairs (a Chinese paper whose labels are left
// unfit, one with labels crowded over a stroke, one with turned labels, a Japanese one), each outcome against the dump's whole
// (figures.ts): with today's marks (a translation set by its advance) every one today's; with the target's own (set by its
// ink, the blank halves of the marks at its edges past its anchor's edge) each one drawn or left as today, on its baseline,
// in its text, only where it starts moved; but a text today left crowded over a stroke under it that S.figures draws now (the
// owner's rule of 2026-11-13, F41: width is the fit's only test), and its set's others where they start, each listed here. The
// whole corpus: lab/typeset/replay-figures.mjs [--marks=today].
import { describe, expect, it } from 'vitest'
import { replayFigures } from './figures.ts'
import { hasDerived, hasTap } from './tap.ts'
import { hasCache } from './today.ts'

const PAIRS = ['2610.21377v1-zh', '2608.06701v1-zh', '1706.03762v7-es', '2610.19159v1-ja']
/** the texts today left crowded over a stroke under them that S.figures draws now, at the size their width allows (today's
 *  bundle states a stroke under 2608.06701v1 p2's two labels and p9's one), and their sets' others that step: none, their sets'
 *  widths needing no more than before */
const CLEARED: Record<string, { cleared: string[]; stepped: string[] }> = {
  '2608.06701v1-zh': { cleared: ['ord 392 p2', 'ord 401 p2', 'ord 671 p9'], stepped: [] },
}

describe.skipIf(!hasTap || !hasDerived('rules') || !hasCache)('S.figures: replayed on the reader dumps', () => {
  for (const pair of PAIRS) {
    it(`draws or leaves every figure text of ${pair} as today did, by today's marks`, { timeout: 120_000 }, () => {
      const r = replayFigures(pair, { marks: 'today' })
      expect([...r.differ, ...r.extra]).toEqual([])
      expect({ cleared: r.cleared, stepped: r.stepped.sort() }).toEqual(CLEARED[pair] ?? { cleared: [], stepped: [] })
      expect(r.equal + r.cleared.length + r.stepped.length).toBe(r.total)
      expect(r.total).toBeGreaterThan(0)
    })
    it(`moves no figure text of ${pair} but where its line starts, by its ink`, { timeout: 120_000 }, () => {
      const r = replayFigures(pair)
      expect(r.extra).toEqual([])
      expect(r.differ.filter((d) => !/^ord \d+ p\d+\.line\.x0: /.test(d))).toEqual([])
    })
  }
})
