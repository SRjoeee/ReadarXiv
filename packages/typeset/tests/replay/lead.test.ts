// U.lead replayed on the tap's sample: the name that leads the unit as paintNames read it, the joint jointOf read where the
// unit's first line is on the name's page, the name's group shown and the label not kept, the label group's verdict and the
// first line's size in the file (U.lead:in), the paper's serif design (the ledger's info.paper); against the lead and the
// label today laid the unit with (U.lead:out), the name's record as it then stood, and the ledger's U.lead slot.
import { describe, expect, it } from 'vitest'
import { type LeadChar, lead, type NameLead } from '../../src/unit/lead.ts'
import { firstDifference, hasTap, ledger, ledgerRound, roundsOf, sample, slotOf } from './tap.ts'

type In = {
  ld: NameLead | null
  joint: LeadChar[] | null
  firstPage: number | null
  nameGroup: boolean | null
  labelKept: boolean
  relabels: boolean
  size0: number | null
}
type Out = { lead: unknown; label: { x1: number; text: string; chars: LeadChar[]; drawn?: string } | null }

describe.skipIf(!hasTap)('U.lead: replayed on the tap', () => {
  it('leads the unit with its name and joint as today did, on every sampled round', { timeout: 120_000 }, () => {
    const differ: string[] = []
    const count = { rounds: 0, led: 0, joint: 0, named: 0 }
    for (const e of sample('U.lead').entries)
      for (const [round, c] of roundsOf(e)) {
        const a = c['U.lead:in'] as In | undefined,
          want = c['U.lead:out'] as Out | undefined
        if (!a || !want) continue
        count.rounds++
        if (a.ld) count.named++
        const serif = (ledger(e.pair).info.paper as { designs: { serif: string } }).designs.serif
        const got = lead(
          {
            ld: a.ld,
            joint: a.joint,
            firstPage: a.firstPage,
            nameShown: !!a.nameGroup,
            labelKept: a.labelKept,
            relabels: a.relabels,
            size0: a.size0,
            serif,
          },
          null,
        )
        if (got) count.led++
        if (got?.lead.parts.length === 2) count.joint++
        const r = ledgerRound(e, round)
        const slot = r ? slotOf(e.pair, e.ord, r, 'U.lead') : undefined
        const mine = a.ld
          ? {
              name: a.ld.nm.occurrence ?? null,
              joint: a.joint ? a.joint.map((x) => x.ch).join('') : null,
              lead: got ? { parts: got.lead.parts.map((x) => x.text), gap: got.lead.gap } : null,
            }
          : null
        const d =
          firstDifference(got?.lead ?? null, want.lead, 'lead') ??
          // (a unit not led keeps the label it had, which this capture does not hold: only a lead's label is compared)
          (got ? firstDifference(got.label, want.label, 'label') : null) ??
          (got
            ? firstDifference(got.rec, {
                drawn: a.ld!.rec.drawn,
                why: a.ld!.rec.why,
                size: a.ld!.rec.size,
                x: a.ld!.rec.x,
                chars: a.ld!.rec.chars,
              })
            : null) ??
          firstDifference(mine, slot, 'slot')
        if (d) differ.push(`${e.pair} ord ${e.ord} round ${round}: ${d}`)
      }
    expect(differ).toEqual([])
    expect(count).toEqual({ rounds: 10, led: 6, joint: 3, named: 7 })
  })
})
