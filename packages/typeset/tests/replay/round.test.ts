// A unit's lay replayed from F2 to its last word (round.ts: S.onLeadRetry, X.numbered, S.overFollower, X.further, X.runs, S.settle, S.share, the
// round's `out` and S.fill.leads, each from the step before) on every laid round of every unit the tap's samples name. The whole corpus:
// lab/typeset/replay-fit.mjs.
import { describe, expect, it } from 'vitest'
import { walkCase } from './fit-input.ts'
import { chain } from './round.ts'
import { hasDerived, hasTap, ledger, ruledIn, sample } from './tap.ts'
import { hasCache } from './today.ts'

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

describe.skipIf(!hasTap || !hasDerived('rules') || !hasCache)(
  'a unit’s lay: replayed on the tap from F2 to out',
  () => {
    it('chains every step of every sampled round as today did', { timeout: 120_000 }, () => {
      const differ: string[] = []
      const steps = new Map<string, number>(),
        stopped = new Map<string, number>()
      let cases = 0,
        ruled = 0
      const seen = new Set<string>()
      for (const rule of RULES)
        for (const e of sample(rule).entries) {
          const key = `${e.pair}|${e.ord}`
          if (seen.has(key)) continue
          seen.add(key)
          const u = ledger(e.pair).units.find((x) => x.ord === e.ord)
          // (a unit today laid with a borrowed line: the owner's ruling of 2026-11-08 removed the borrow, tap.ts ruledIn)
          const borrowed = ruledIn(e.pair).borrowed.has(e.ord)
          for (const r of new Set((u?.slots ?? []).filter((s) => s.by === 'X.cut').map((s) => s.round))) {
            const c = walkCase(e.pair, e.ord, r)
            if (typeof c === 'string') continue
            if (borrowed) {
              ruled++
              continue
            }
            cases++
            const got = chain(c)
            for (const s of got.steps) steps.set(s, (steps.get(s) ?? 0) + 1)
            if (got.stopped) stopped.set(got.stopped, (stopped.get(got.stopped) ?? 0) + 1)
            if (got.d) differ.push(`${key}|${r} at ${got.at}: ${got.d}`)
          }
        }
      expect(differ).toEqual([])
      // (S.onLeadRetry runs on no sampled unit: the corpus runner's; a chain stops where the tap holds no input of its next step)
      expect({ cases, ruled, steps: Object.fromEntries(steps), stopped: Object.fromEntries(stopped) }).toEqual({
        cases: 145,
        ruled: 19,
        steps: {
          F2: 145,
          F4: 2,
          F5: 8,
          'F6 further': 6,
          'F6 runs': 123,
          F7: 5,
          'F7 moved': 4,
          F8: 8,
          out: 144,
          L9: 144,
        },
        stopped: { 'left the original\u2019s (X.further found none)': 1 },
      })
    })
  },
)
