// U.marks replayed on the tap: every sampled round of tokensOf2 (U.marks' sample and B.tokens'), its tokens made by the
// B.tokens port from the same inputs as B.tokens' replay; the decisions it took on the way (Tokens.marks: the marks
// dropped after a display or a held line's mark, the tail merged) against the ledger's U.marks slot of that round, and the
// tokens against today's measured tokens.
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { measure } from '../../src/breaker/measure.ts'
import { tokens } from '../../src/breaker/tokens.ts'
import { type MeasureTable, tableMetrics } from '../../src/metrics/table.ts'
import { firstDifference, hasDerived, hasTap, ledgerRound, readGz, roundsOf, sample, slotOf, TAP } from './tap.ts'
import { type In, type Reading, tokenFacts, tokensInput } from './tokens-input.ts'

describe.skipIf(!hasTap || !hasDerived('B.tokens') || !hasDerived('U.breaks'))('U.marks: replayed on the tap', () => {
  it('drops and merges the marks today did, on every sampled round of the tokens', () => {
    const { facts, classes } = tokenFacts()
    const metrics = new Map<string, ReturnType<typeof tableMetrics>>()
    const differ: string[] = []
    const count = { rounds: 0, ofMarks: 0, givenUp: 0, display: 0, held: 0, tail: 0, merged: 0 }
    const seen = new Set<string>()
    for (const rule of ['U.marks', 'B.tokens'])
      for (const e of sample(rule).entries)
        for (const [round, c] of roundsOf(e)) {
          const a = c['B.tokens:in'] as In | undefined,
            want = c['B.tokens:out'] as Record<string, unknown>[] | undefined,
            e0 = c['U.elements:in'] as Reading | undefined
          const key = `${e.pair}|${e.ord}|${round}`
          if (!a || !want || !e0 || seen.has(key)) continue
          seen.add(key)
          const r = ledgerRound(e, round)
          if (r === null) {
            count.givenUp++
            continue
          }
          const f = facts[key],
            cls = classes[key]
          if (!f || !cls || r === undefined) {
            differ.push(`${key}: ${r === undefined ? 'its ledger round not told' : 'no derived facts'}`)
            continue
          }
          count.rounds++
          if (rule === 'U.marks') count.ofMarks++
          if (!metrics.has(e.pair))
            metrics.set(e.pair, tableMetrics(readGz(join(TAP, 'metrics', `${e.pair}.metrics.json.gz`)) as MeasureTable))
          const got = tokens(tokensInput(a, e0, f, cls.cls2))
          for (const [kind] of got.marks.drops) count[kind]++
          if (got.marks.tail) count.tail++
          if (got.marks.tail?.[1]) count.merged++
          const d =
            firstDifference(got.marks, slotOf(e.pair, e.ord, r, 'U.marks'), 'marks') ??
            firstDifference(measure(got.tokens, metrics.get(e.pair)!), [...want], 'tokens')
          if (d) differ.push(`${key}: ${d}`)
        }
    expect(differ).toEqual([])
    // (a held line's mark is dropped nowhere on the corpus: tests/unit/marks.test.ts)
    expect(count).toEqual({ rounds: 50, ofMarks: 11, givenUp: 0, display: 3, held: 0, tail: 9, merged: 3 })
  })
})
