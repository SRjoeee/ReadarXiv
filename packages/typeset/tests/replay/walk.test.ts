// X.walk replayed whole at today's smallest composite (TAP.md §4: layoutCut at F2, with B.slots, B.break, B.place, B.cuts,
// X.cut, X.at and X.lastLines inside it), on every laid round of every unit the tap's samples name: the walk's inputs from
// the ledger, the tokens file and the metrics table (fit-input.ts); its layout against F2's slot, every field the tap
// summarizes. The whole corpus: lab/typeset/replay-fit.mjs.
import { describe, expect, it } from 'vitest'
import { layoutCut } from '../../src/fit/cut.ts'
import type { FitBlock, FitParams, Tokens } from '../../src/fit/types.ts'
import { layoutOf, linesOf, walkCase } from './fit-input.ts'
import { borrowed, firstDifference, hasDerived, hasTap, ledger, sample } from './tap.ts'

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
    const count = { units: 0, cases: 0, ruled: 0, crops: 0, cut: 0, clipped: 0, shrunk: 0, opened: 0, lastLines: 0 }
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
          // (a round today laid borrowing lines: the owner's ruling of 2026-11-08 removed the borrow, tap.ts `ruled`)
          if (borrowed(c.want.layout)) {
            count.ruled++
            continue
          }
          count.cases++
          if (c.crops) count.crops++
          const got = layoutCut(c.tokens as Tokens, c.blocks as FitBlock[], c.s, c.P as FitParams)
          if (got.tokens.length !== c.tokens.length) count.cut++
          if (got.layout.clipped) count.clipped++
          if (got.layout.scale < 1) count.shrunk++
          if (got.layout.opened) count.opened++
          if (c.P.lastLines) count.lastLines++
          const d =
            firstDifference(layoutOf(got.layout), c.want.layout, 'layout') ??
            firstDifference(linesOf(got.layout), c.want.layoutLines, 'lines') ??
            firstDifference(got.tokens.length, c.want.cutTokens, 'cutTokens') ??
            firstDifference(c.tokens.length, c.want.tokens, 'tokens')
          if (d) differ.push(`${key}|${r}: ${d}`)
        }
      }
    expect(differ).toEqual([])
    // (the walk's branches among them: frame cuts, a clipped fit, a shrunk one, a line TeX's rule opened, a heading on its last
    // lines, crops' extents; and the rounds today laid with a borrowed line, the ruling's)
    expect(count).toEqual({
      units: 188,
      cases: 145,
      ruled: 19,
      crops: 44,
      cut: 3,
      clipped: 6,
      shrunk: 45,
      opened: 1,
      lastLines: 11,
    })
  })
})
