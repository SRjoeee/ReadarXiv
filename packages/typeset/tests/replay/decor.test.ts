// U.decor replayed on the tap's sample: before the blocks, the unit's centring and its label from U.blocks:in's facts and
// U.decor:in's; the blocks by the U.blocks port from blocks2's arguments (checked against U.blocks:out); after, the
// decorations from U.decor:in (the label, its first text, the size, the toggles, the shared row kept after it, the short
// skips, the lines) and each widened line's room from the page as today reads it (room.ts: the captured columns, text areas
// and pages' characters). Against U.decor:out (its flags and every block whole), and the carried label's crop token
// against its ledger slot.
import { describe, expect, it } from 'vitest'
import { type Block, type BlocksInput, blocks } from '../../src/unit/blocks.ts'
import {
  carriedCrop,
  type DecorBlock,
  type DecorChar,
  type DecorLabel,
  decorAfter,
  decorBefore,
  type KeptRow,
  type ShortSkip,
} from '../../src/unit/decor.ts'
import { type PageChar, sideOf } from './room.ts'
import { firstDifference, hasTap, pagesOf, roundsOf, sample } from './tap.ts'

type BIn = BlocksInput & { byCell: boolean | null | undefined; luCentred: boolean | undefined }
type DIn = {
  kind: string
  title: boolean
  luFlush: 'left' | 'right' | null
  label: DecorLabel | null
  firstX0: number | undefined
  s: number
  relabels: boolean
  labelKept: boolean
  labelGroup: boolean
  lead: boolean
  kept: KeptRow | null
  shortSkips: ShortSkip[]
  lineInfo: Map<string, { j?: number }>
  cols: Record<string, [number, number][]>
  areas: Record<string, [number, number]>
  chars: Record<string, unknown>
}
type DOut = {
  centredFlag: boolean | null
  byCell: boolean | null | 'undefined'
  labelHides: boolean
  carried: boolean
  heading: boolean
  numbered: boolean
  indented: boolean
  blocks: Block[]
}

describe.skipIf(!hasTap)('U.decor: replayed on the tap', () => {
  it('decorates the blocks as today did, on every sampled round', { timeout: 120_000 }, () => {
    const differ: string[] = []
    const count = {
      rounds: 0,
      labelHides: 0,
      carried: 0,
      crops: 0,
      flush: 0,
      widened: 0,
      stop: 0,
      shortSkips: 0,
      indented: 0,
      heading: 0,
      numbered: 0,
    }
    for (const e of sample('U.decor').entries)
      for (const [round, c] of roundsOf(e)) {
        const bIn = c['U.blocks:in'] as BIn | undefined,
          bOut = c['U.blocks:out'] as Block[] | undefined,
          dIn = c['U.decor:in'] as DIn | undefined,
          dOut = c['U.decor:out'] as DOut | undefined
        if (!bIn || !bOut || !dIn || !dOut) continue
        count.rounds++
        const key = `${e.pair} ord ${e.ord} round ${round}`
        const before = decorBefore({
          kind: dIn.kind,
          byCell: bIn.byCell,
          luCentred: bIn.luCentred,
          label: dIn.label,
          relabels: dIn.relabels,
          labelKept: dIn.labelKept,
          labelShown: dIn.labelGroup,
          rects: bIn.rects,
        })
        const bs = blocks(bIn) as DecorBlock[]
        const widths = bs.map((b) => b.x1 - b.x0)
        const page = pagesOf(e.pair)
        const facts = {
          cols: dIn.cols,
          areas: dIn.areas,
          chars: Object.fromEntries(
            (dIn.chars as unknown as number[]).map((q) => [q, (page[q] ?? null) as PageChar[] | null]),
          ),
        }
        const got = decorAfter(bs, {
          kind: dIn.kind,
          title: dIn.title,
          front: false,
          luFlush: dIn.luFlush,
          label: dIn.label,
          firstX0: dIn.firstX0,
          s: dIn.s,
          relabels: dIn.relabels,
          lead: dIn.lead,
          labelHides: before.labelHides,
          firstPage: bIn.rects[0]?.[0],
          firstX: bIn.rects[0]?.[1],
          side: (b) => sideOf(b, facts),
          kept: dIn.kept,
          shortSkips: dIn.shortSkips,
          lineInfo: dIn.lineInfo,
        })
        if (before.labelHides) count.labelHides++
        if (got.carried) count.carried++
        if (bs.some((b) => b.flush)) count.flush++
        if (bs.some((b, k) => b.x1 - b.x0 !== widths[k])) count.widened++
        if (bs.some((b) => b.stop)) count.stop++
        if (bs.some((b) => b.shortSkips)) count.shortSkips++
        if (got.indented) count.indented++
        if (got.heading) count.heading++
        if (got.numbered) count.numbered++
        const byCell = bIn.byCell === undefined ? 'undefined' : bIn.byCell
        let d =
          firstDifference(before.rects, bIn.rects, 'rects') ??
          firstDifference(blocks(bIn), bOut, 'U.blocks') ??
          firstDifference(
            {
              centredFlag: before.centredFlag ?? null,
              byCell,
              labelHides: before.labelHides,
              ...got,
              blocks: bs,
            },
            { ...dOut, kept: undefined },
            'decor',
          )
        // the carried label's crop token: its box, page and text; its baseline is the unit's own characters' on its first
        // line (the reading's, which U.decor's capture does not hold), else its first block's
        const slot = e.slots.find(
          (x) => x.round === round && x.by === 'U.decor' && 'carriedCrop' in (x.value as object),
        )?.value as { carriedCrop: { baseline: number } } | undefined
        if (got.carried) {
          count.crops++
          const crop = carriedCrop(
            dIn.label as DecorLabel & { chars: DecorChar[] },
            bs[0]!,
            dIn.firstX0,
            dIn.s,
            [],
          ).crop
          d ??=
            firstDifference({ ...crop, baseline: undefined }, { ...slot?.carriedCrop, baseline: undefined }, 'crop') ??
            (Math.abs(slot!.carriedCrop.baseline - crop.baseline) < 0.4 * dIn.s
              ? null
              : `crop baseline ${slot!.carriedCrop.baseline} far from the block's ${crop.baseline}`)
        } else if (slot) d ??= 'a crop token where none is carried'
        if (d) differ.push(`${key}: ${d}`)
      }
    expect(differ).toEqual([])
    // (every branch the sample was drawn for is among them; no sampled heading is front matter, which U.decor:in does not
    // record: `front` false)
    expect(count).toEqual({
      rounds: 39,
      labelHides: 15,
      carried: 3,
      crops: 3,
      flush: 8,
      widened: 19,
      stop: 6,
      shortSkips: 4,
      indented: 16,
      heading: 9,
      numbered: 3,
    })
  })
})
