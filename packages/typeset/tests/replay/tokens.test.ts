// B.tokens and B.measure replayed on the tap's sample: tokensOf2's inputs as today's run made them (B.tokens:in), the
// elements' fills and colours by the layout unit (U.elements:in's lu and kOf, as texParts makes them), the faces today's
// faceOf gave, now B.faces' port's (tests/replay/faces.test.ts holds the two equal), each rendering's runs of one fill and faked
// small capitals (lanes/L3/replay/B.tokens.json.gz), the pieces' classes (lanes/L3/replay/U.breaks.json.gz); measured from the pair's recorded widths (the table adapter). Against the
// tokens today measured (B.tokens:out), every field.
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cover } from '../../src/breaker/cover.ts'
import { measure } from '../../src/breaker/measure.ts'
import { type TStyle, tokens } from '../../src/breaker/tokens.ts'
import { type MeasureTable, tableMetrics } from '../../src/metrics/table.ts'
import { firstDifference, hasDerived, hasTap, readGz, roundsOf, sample, TAP } from './tap.ts'
import { type In, type Reading, rolesOf, tokenFacts, tokensInput } from './tokens-input.ts'

describe.skipIf(!hasTap || !hasDerived('B.tokens') || !hasDerived('U.breaks'))('B.tokens: replayed on the tap', () => {
  it('makes and measures today’s tokens on every sampled round', { timeout: 120_000 }, () => {
    const { facts, classes } = tokenFacts()
    const metrics = new Map<string, ReturnType<typeof tableMetrics>>()
    const differ: string[] = []
    let rounds = 0,
      count = 0,
      covers = 0
    const kinds = new Set<string>()
    for (const e of sample('B.tokens').entries)
      for (const [round, c] of roundsOf(e)) {
        const a = c['B.tokens:in'] as In | undefined,
          want = c['B.tokens:out'] as (Record<string, unknown>[] & { base?: TStyle }) | undefined,
          e0 = c['U.elements:in'] as Reading | undefined
        if (!a || !want || !e0) continue
        const key = `${e.pair}|${e.ord}|${round}`
        const f = facts[key],
          cls = classes[key]
        if (!f || !cls) {
          differ.push(`${key}: no derived facts`)
          continue
        }
        rounds++
        if (!metrics.has(e.pair))
          metrics.set(e.pair, tableMetrics(readGz(join(TAP, 'metrics', `${e.pair}.metrics.json.gz`)) as MeasureTable))
        const got = tokens(tokensInput(a, e0, f, cls.cls2, rolesOf(e.pair)))
        // (B.cover: every face of the round's runs measured in its pair's table, as its slot says: { ok: true })
        const covered = cover(got.tokens, metrics.get(e.pair)!)
        const slot = e.slots.find((s) => s.by === 'B.cover')?.value
        if (firstDifference(covered, slot ?? { ok: true }))
          differ.push(`${key}: B.cover ${JSON.stringify(covered).slice(0, 80)}`)
        else covers++
        const measured = measure(got.tokens, metrics.get(e.pair)!)
        count += measured.length
        for (const t of measured)
          for (const kind of [
            'crop',
            'newline',
            'blockTo',
            'sup',
            'space',
            'hyph',
            'at',
            'asp',
            'punct',
            'kernW',
            'sc',
            'leadEnd',
          ] as const)
            if (t[kind] !== undefined && t[kind] !== null) kinds.add(kind)
        const d = firstDifference(measured, [...want], 'tokens') ?? firstDifference(got.base, want.base, 'base')
        if (d) differ.push(`${key}: ${d}`)
        // (the comparison tells a width off by a billionth)
        const off = measured.map((t, j) => (j ? t : { ...t, w100: t.w100 + 1e-9 }))
        if (measured.length && !firstDifference(off, [...want])) differ.push(`${key}: a changed width went unseen`)
      }
    expect(differ).toEqual([])
    expect(rounds).toBe(42)
    expect(covers).toBe(42)
    expect(count).toBeGreaterThan(1000)
    // (every kind of token the sample was drawn for is among them)
    expect([...kinds].sort()).toEqual([
      'asp',
      'at',
      'blockTo',
      'crop',
      'hyph',
      'kernW',
      'leadEnd',
      'newline',
      'punct',
      'sc',
      'space',
      'sup',
    ])
  })
})
