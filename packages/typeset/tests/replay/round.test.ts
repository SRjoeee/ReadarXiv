// A unit's lay replayed from F2 to its last word (round.ts: S.onLeadRetry, X.numbered, S.overFollower, X.further, X.runs, S.settle, S.share, the
// round's `out` and S.fill.leads, each from the step before) on every laid round of every unit the tap's samples name. The whole corpus:
// lab/typeset/replay-fit.mjs.
import { describe, expect, it } from 'vitest'
import { walkCase } from './fit-input.ts'
import { chain } from './round.ts'
import { hasDerived, hasTap, ledger, sample } from './tap.ts'
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
      let cases = 0
      const seen = new Set<string>()
      for (const rule of RULES)
        for (const e of sample(rule).entries) {
          const key = `${e.pair}|${e.ord}`
          if (seen.has(key)) continue
          seen.add(key)
          const u = ledger(e.pair).units.find((x) => x.ord === e.ord)
          for (const r of new Set((u?.slots ?? []).filter((s) => s.by === 'X.cut').map((s) => s.round))) {
            const c = walkCase(e.pair, e.ord, r)
            if (typeof c === 'string') continue
            cases++
            const got = chain(c)
            for (const s of got.steps) steps.set(s, (steps.get(s) ?? 0) + 1)
            if (got.stopped) stopped.set(got.stopped, (stopped.get(got.stopped) ?? 0) + 1)
            if (got.d) differ.push(`${key}|${r} at ${got.at}: ${got.d}`)
          }
        }
      expect(differ).toEqual([])
      // (S.onLeadRetry runs on no sampled unit: the corpus runner's; a chain stops where the tap holds no input of its next step)
      expect({ cases, steps: Object.fromEntries(steps), stopped: Object.fromEntries(stopped) }).toEqual({
        cases: 164,
        steps: {
          F2: 164,
          F4: 2,
          F5: 8,
          'F6 further': 6,
          'F6 runs': 139,
          // (runs whose tokens hold the frames' share's cut, counted without it: round.ts, the owner's of 2026-11-10)
          'F6 runs (share)': 3,
          F7: 5,
          'F7 moved': 4,
          F8: 8,
          out: 163,
          L9: 162,
          // (a round that borrowed room, its fill leadings option (i)'s: round.ts, the owner's of 2026-11-10)
          'L9 (i)': 1,
          // (rounds whose lines' ends differ from today's at 1e-13 alone, lane literal-fixes' rule moving a line's slack between its
          // gaps: round.ts glued, tap.ts wordGlued)
          'F2 (no glue in a word)': 7,
          'laidRuns (no glue in a word)': 3,
          'out (no glue in a word)': 7,
        },
        stopped: { 'left the original\u2019s (X.further found none)': 1 },
      })
    })
  },
)
