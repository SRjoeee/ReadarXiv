// B.tokens and B.measure replayed on the tap's sample: tokensOf2's inputs as today's run made them (B.tokens:in), the
// elements' fills and colours by the layout unit (U.elements:in's lu and kOf, as texParts makes them), the faces today's
// faceOf gave and each rendering's runs of one fill and faked small capitals (lanes/L3/replay/B.tokens.json.gz), the pieces'
// classes (lanes/L3/replay/U.breaks.json.gz); measured from the pair's recorded widths (the table adapter). Against the
// tokens today measured (B.tokens:out), every field.
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { measure } from '../../src/breaker/measure.ts'
import { type Face, type TokensInput, tokens, type TStyle } from '../../src/breaker/tokens.ts'
import { type MeasureTable, tableMetrics } from '../../src/metrics/table.ts'
import type { LayoutUnit } from '../../src/unit/breaks.ts'
import { derived, firstDifference, hasDerived, hasTap, readGz, roundsOf, sample, TAP } from './tap.ts'

type Facts = {
  faces: [string, Face][]
  ownCaps: Record<string, boolean>
  fills: Record<string, { text: string; fill: number }[] | null>
  smallCaps: Record<string, boolean[] | null>
  spaced: boolean
}
type In = {
  unit: TokensInput['unit']
  prep: TokensInput['resolved']
  to: string
  base: TStyle
  designs: TokensInput['designs']
  P: TokensInput['P']
  lead: TokensInput['lead']
}
const faceKey = (st: TStyle, cls: string) => `${st.fam}|${st.design}|${!!st.bold}|${!!st.italic}|${!!st.caps}|${cls}`

describe.skipIf(!hasTap || !hasDerived('B.tokens') || !hasDerived('U.breaks'))('B.tokens: replayed on the tap', () => {
  it('makes and measures today’s tokens on every sampled round', () => {
    const facts = derived<{ cases: Record<string, Facts> }>('B.tokens').cases
    const classes = derived<{ cases: Record<string, { cls2: (string | null)[] }> }>('U.breaks').cases
    const metrics = new Map<string, ReturnType<typeof tableMetrics>>()
    const differ: string[] = []
    let rounds = 0,
      count = 0
    const kinds = new Set<string>()
    for (const e of sample('B.tokens').entries)
      for (const [round, c] of roundsOf(e)) {
        const a = c['B.tokens:in'] as In | undefined,
          want = c['B.tokens:out'] as (Record<string, unknown>[] & { base?: TStyle }) | undefined,
          e0 = c['U.elements:in'] as { lu: LayoutUnit & { colours?: Map<number, number> }; kOf: number[] } | undefined
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
        const faces = new Map(f.faces)
        const { lu, kOf } = e0
        const got = tokens({
          unit: a.unit,
          resolved: a.prep,
          colourOf: (k) => (kOf[k]! >= 0 ? (lu.colours?.get(kOf[k]!) ?? null) : null),
          fillOf: (k) =>
            kOf[k]! >= 0 ? ((lu.ph.get(kOf[k]!) as { fill?: number | null } | undefined)?.fill ?? null) : null,
          fills: new Map(Object.entries(f.fills).map(([k, v]) => [Number(k), v])),
          smallCaps: new Map(Object.entries(f.smallCaps).map(([k, v]) => [Number(k), v])),
          cls2: cls.cls2,
          spacedSource: f.spaced,
          to: a.to,
          base: a.base,
          designs: a.designs,
          P: a.P,
          lead: a.lead,
          faces: {
            of: (st, c) => {
              const face = faces.get(faceKey(st, c))
              if (!face) throw new Error(`no face of today's for ${faceKey(st, c)}`)
              return face
            },
            ownSmallCaps: (id) => !!f.ownCaps[id],
          },
          tagWords: true,
        })
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
