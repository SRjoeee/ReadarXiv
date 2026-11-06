// U.params replayed on the tap: on its sample, the unit's blocks, size, the target's rules and the label as today's run held
// them, the rules near its lines and the pages' characters (U.params:in), its edges read from those characters as today
// reads them (room.ts edgesOf), the CJK body face's size by B.faces' port, heading and numbered as U.decor decided them, TeX's
// \lineskip as the run held it; against the unit's P, its cell bands and the ledger's slot. And on every sampled reading
// (U.elements:in and :out, any rule's sample): the size the unit is laid at and its base style against the ledger's
// U.params slot of that round (its `s` and its `base`, an index into the ledger's styles).
import { describe, expect, it } from 'vitest'
import { faceOf } from '../../src/breaker/faces.ts'
import type { TokensInput } from '../../src/breaker/tokens.ts'
import type { Block } from '../../src/unit/blocks.ts'
import { baseStyleOf, type Original, type ParamsRules, params, sizeOf } from '../../src/unit/params.ts'
import type { Rect } from '../../src/util.ts'
import { edgesOf, type PageChar } from './room.ts'
import { firstDifference, hasTap, ledger, ledgerRound, pagesOf, readings, roundsOf, sample, slotOf } from './tap.ts'
import { rolesOf } from './tokens-input.ts'

type In = {
  blocks: Block[]
  s: number
  P: ParamsRules
  label: { drawn?: string } | null
  designs: { serif: string }
  kind: string
  rules: [number, number[] | null][]
  chars: number[]
}
type Out = { s: number; P: Record<string, unknown>; clear: unknown }
type Slot = {
  s: number
  base: number
  heading: boolean
  numbered: boolean
  fillable: boolean
  lineskip: number[] | null
}

describe.skipIf(!hasTap)('U.params: replayed on the tap', () => {
  it('sets the fit’s parameters as today did, on every sampled round', () => {
    const differ: string[] = []
    const count = {
      rounds: 0,
      givenUp: 0,
      leadBase: 0,
      trackStart: 0,
      edges: 0,
      head: 0,
      lastLines: 0,
      bands: 0,
      capScale: 0,
    }
    for (const e of sample('U.params').entries)
      for (const [round, c] of roundsOf(e)) {
        const a = c['U.params:in'] as In | undefined,
          want = c['U.params:out'] as Out | undefined
        if (!a || !want) continue
        const r = ledgerRound(e, round)
        if (r === null) {
          count.givenUp++
          continue
        }
        const slot = (r === undefined ? undefined : slotOf(e.pair, e.ord, r, 'U.params')) as Slot | undefined
        if (!slot) {
          differ.push(`${e.pair} ord ${e.ord} round ${round}: no U.params slot`)
          continue
        }
        count.rounds++
        const page = pagesOf(e.pair)
        const chars = Object.fromEntries(
          a.chars.map((q) => [q, (page[q] ?? null) as (PageChar & { size: number })[] | null]),
        )
        const rules = new Map(a.rules)
        const cjkSize = a.P.cjk
          ? faceOf(
              rolesOf(e.pair),
              { fam: 'serif', bold: false, italic: false, caps: false, design: a.designs.serif },
              'cjk',
            ).size
          : undefined
        const got = params({
          kind: a.kind,
          blocks: a.blocks,
          s: a.s,
          P: a.P,
          label: a.label,
          edges: edgesOf(a.kind, a.blocks, chars),
          rulesOf: (q) => rules.get(q),
          cjkSize,
          lineskip: slot.lineskip,
          heading: slot.heading,
          numbered: slot.numbered,
        })
        if (got.P.leadBase !== a.P.leadBase) count.leadBase++
        if (got.P.trackStart) count.trackStart++
        if (got.P.halfLead) count.edges++
        if (got.P.halfLead?.head) count.head++
        if (got.P.lastLines) count.lastLines++
        if (got.clear) count.bands++
        if (got.P.capScale !== undefined) count.capScale++
        // (the run's \lineskip is an array of TeX's log; the slot prints it as numbers)
        const d =
          firstDifference({ ...got.P, lineskip: undefined }, { ...want.P, lineskip: undefined }, 'P') ??
          firstDifference(got.clear, want.clear, 'clear') ??
          firstDifference(got.fillable, slot.fillable, 'fillable') ??
          firstDifference(a.s, want.s, 's')
        if (d) differ.push(`${e.pair} ord ${e.ord} round ${round}: ${d}`)
      }
    expect(differ).toEqual([])
    // (each branch the sample was drawn for: a leading off the script's, a Hangul face's tracking, edges, a head shared or
    // not, a heading on its last lines, a CJK cell's bands and its smaller size)
    expect(count).toEqual({
      rounds: 27,
      givenUp: 0,
      leadBase: 2,
      trackStart: 3,
      edges: 18,
      head: 11,
      lastLines: 3,
      bands: 6,
      capScale: 3,
    })
  })

  it('lays every sampled reading at today’s size in today’s base style', () => {
    const differ: string[] = []
    const count = { readings: 0, givenUp: 0, noGlyph: 0, caps: 0 }
    for (const x of readings()) {
      const r = ledgerRound(x.e, x.round)
      if (r === null) {
        count.givenUp++
        continue
      }
      const slot = (r === undefined ? undefined : slotOf(x.e.pair, x.e.ord, r, 'U.params')) as Slot | undefined
      if (!slot) continue
      count.readings++
      const L = ledger(x.e.pair)
      const i = x.c['U.elements:in'] as { unit: TokensInput['unit']; rects: Rect[] },
        prep = x.c['U.elements:out'] as Original
      if (!((prep.orig?.size ?? 0) > 0)) count.noGlyph++
      if (prep.orig?.st?.caps) count.caps++
      const s = sizeOf(prep, { cjk: !!L.info.cjk }, i.unit, i.rects)
      const base = baseStyleOf(prep, i.unit.kind, (L.info.paper as { designs: { serif: string } }).designs.serif)
      const styles = (L as unknown as { styles: unknown[] }).styles
      const d =
        firstDifference(s, slot.s, 's') ?? firstDifference(JSON.parse(JSON.stringify(base)), styles[slot.base], 'base')
      if (d) differ.push(`${x.key}: ${d}`)
    }
    expect(differ).toEqual([])
    // (a unit of no glyph read is laid at its lines' height: tests/unit/params.test.ts)
    expect(count).toEqual({ readings: 98, givenUp: 3, noGlyph: 0, caps: 3 })
  })
})
