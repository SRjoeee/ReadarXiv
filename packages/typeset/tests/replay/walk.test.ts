// X.walk replayed whole at today's smallest composite (TAP.md §4: layoutCut at F2, with B.slots, B.break, B.place, B.cuts,
// X.cut, X.at and X.lastLines inside it), on every laid round of every unit the tap's samples name: the walk's inputs from
// the ledger, the tokens file and the metrics table (fit-input.ts); its layout against F2's slot, every field the tap
// summarizes. The whole corpus: lab/typeset/replay-fit.mjs.
import { describe, expect, it } from 'vitest'
import { layoutCut } from '../../src/fit/cut.ts'
import type { FitBlock, FitParams, Tokens } from '../../src/fit/types.ts'
import { layoutOf, linesOf, walkCase } from './fit-input.ts'
import { isShare } from './round.ts'
import { firstDifference, hasDerived, hasTap, inWordOf, ledger, sample, wordGlued } from './tap.ts'

const RULES = [
  'U.admit',
  'U.elements',
  'U.breaks',
  'U.rename',
  'U.label',
  'U.lead',
  'U.marks',
  'U.blocks',
  'U.decor',
  'U.params',
  'B.tokens',
]

describe.skipIf(!hasTap || !hasDerived('rules'))('X.walk: replayed on the tap at F2', () => {
  it('lays every sampled unit’s every round as today did', { timeout: 120_000 }, () => {
    const differ: string[] = []
    const count = {
      units: 0,
      cases: 0,
      crops: 0,
      cut: 0,
      shared: 0,
      clipped: 0,
      shrunk: 0,
      borrowed: 0,
      opened: 0,
      lastLines: 0,
      glued: 0,
    }
    const seen = new Set<string>()
    for (const rule of RULES)
      for (const e of sample(rule).entries) {
        const key = `${e.pair}|${e.ord}`
        if (seen.has(key)) continue
        seen.add(key)
        count.units++
        const u = ledger(e.pair).units.find((x) => x.ord === e.ord)
        for (const r of new Set((u?.slots ?? []).filter((s) => s.by === 'X.cut').map((s) => s.round))) {
          const c = walkCase(e.pair, e.ord, r)
          if (typeof c === 'string') continue
          count.cases++
          if (c.crops) count.crops++
          const got = layoutCut(c.tokens as Tokens, c.blocks as FitBlock[], c.s, c.P as FitParams)
          // (the frames' share's cuts, where the fit set the share's first line in that frame or later (pageCutsOf `share`, the
          // owner's of 2026-11-10): tokens today's did not hold, which only the page fill's lay reads, counted apart as the
          // ruling's; the rest against today's cut tokens)
          const cut = got.tokens.filter((t) => !isShare(t)).length
          if (cut !== got.tokens.length) count.shared++
          if (cut !== c.tokens.length) count.cut++
          if (got.layout.clipped) count.clipped++
          if (got.layout.scale < 1) count.shrunk++
          if (got.layout.state.borrow) count.borrowed++
          if (got.layout.opened) count.opened++
          if (c.P.lastLines) count.lastLines++
          // (a round whose tokens hold an item that continues its word: its lines' ends read to a millionth of a point, lane
          // literal-fixes' rule moving a line's slack between its gaps and never its end, tap.ts wordGlued)
          const lines = linesOf(got.layout)
          let dl = firstDifference(lines, c.want.layoutLines, 'lines')
          if (
            dl &&
            inWordOf(c.tokens as unknown[]) &&
            !firstDifference(wordGlued(lines), wordGlued(c.want.layoutLines), 'lines')
          ) {
            dl = null
            count.glued++
          }
          const d =
            firstDifference(layoutOf(got.layout), c.want.layout, 'layout') ??
            dl ??
            firstDifference(cut, c.want.cutTokens, 'cutTokens') ??
            firstDifference(c.tokens.length, c.want.tokens, 'tokens')
          if (d) differ.push(`${key}|${r}: ${d}`)
        }
      }
    expect(differ).toEqual([])
    // (the walk's branches among them: frame cuts, the frames' share's, a clipped fit, a shrunk one, a borrowed line, a line
    // TeX's rule opened, a heading on its last lines, crops' extents)
    expect(count).toEqual({
      units: 188,
      cases: 164,
      crops: 52,
      cut: 3,
      shared: 18,
      clipped: 6,
      shrunk: 47,
      borrowed: 19,
      opened: 1,
      lastLines: 11,
      // (rounds whose lines' ends differ from today's at 1e-13 alone, lane literal-fixes' rule moving a line's slack between its
      // gaps: tap.ts wordGlued)
      glued: 7,
    })
  })
})
