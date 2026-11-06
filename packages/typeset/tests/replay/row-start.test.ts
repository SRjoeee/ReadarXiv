// S.rowStart replayed on every call of the corpus: each F1 slot of a unit with a shared row (the ledgers'), its first block as
// U.decor's slot holds it, whether its label is carried, its row, the unit before's verdict and share, its own label on the
// row (the slot's rowLabel), and the unit before's blocks (its last round's F2 walkedBlocks, or its widened ones); against
// the start, startY, onLead, flowX, ledBy and onLeadOf today recorded. Whether a character of the page stays between the two
// units on the row (keptBetween, a page fact the tap does not hold) is taken from the slot's verdict where it decides it.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FitBlock } from '../../src/fit/types.ts'
import { type Row, rowStart } from '../../src/shared/row-start.ts'
import type { Share } from '../../src/shared/share.types.ts'
import { blockOfTap, num } from './fit-input.ts'
import { firstDifference, hasTap, type Ledger, ledger, TAP } from './tap.ts'

type Raw = Record<string, unknown>
const fin = (v: unknown) => (typeof v === 'number' ? (Number.isFinite(v) ? v : String(v)) : (v ?? null))
/** the blocks a unit was laid in at its last round: its widened ones where X.further widened them, else F2's */
const blocksOf = (L: Ledger, ord: number): FitBlock[] | null => {
  const u = L.units.find((x) => x.ord === ord)
  if (!u) return null
  const last = Math.max(...u.slots.map((s) => s.round))
  const at = (by: string) => u.slots.find((s) => s.round === last && s.by === by)?.value as Raw | undefined
  const raw = (at('X.further')?.widenedBlocks ?? at('X.cut')?.walkedBlocks) as Raw[] | undefined
  return raw ? (raw.map(blockOfTap) as FitBlock[]) : null
}

describe.skipIf(!hasTap)('S.rowStart: replayed on every call of the corpus', () => {
  it('starts every unit on its shared row as today did', () => {
    const differ: string[] = []
    const count = { slots: 0, applied: 0, label: 0, startY: 0, onLead: 0, flowX: 0 }
    for (const f of readdirSync(join(TAP, 'ledgers'))) {
      const pair = f.replace(/\.ledger\.json\.gz$/, '')
      const L = ledger(pair)
      for (const u of L.units)
        for (const s of u.slots) {
          const v = s.value as Raw | null
          if (s.by !== 'S.rowStart' || !v || !('applied' in v)) continue
          count.slots++
          const decor = u.slots.find((x) => x.round === s.round && x.by === 'U.decor' && 'blocks' in (x.value as Raw))
            ?.value as { blocks: Raw[]; carried: boolean } | undefined
          const b0 = decor?.blocks[0] ? (blockOfTap(decor.blocks[0]) as FitBlock) : undefined
          const row = v.row as Row | null
          const lead = v.lead as { refused: boolean; share: Raw | null } | null
          const share = lead?.share
            ? (Object.fromEntries(Object.entries(lead.share).map(([k, x]) => [k, num(x)])) as Share)
            : null
          const got = rowStart({
            row,
            b0,
            carried: !!decor?.carried,
            lead: lead ? { refused: lead.refused, share } : null,
            ownLabel: ((v.rowLabel as Raw | null)?.lb as number[] | undefined) ?? null,
            keptBetween: () => !v.applied,
            leadBlocks: row ? blocksOf(L, row.id) : null,
          })
          if (got.ledBy !== undefined) count.applied++
          if (got.rowLabel) count.label++
          if (b0?.startY !== undefined) count.startY++
          if (b0?.onLead) count.onLead++
          if (b0?.flowX) count.flowX++
          const mine = {
            applied: got.ledBy !== undefined,
            start: fin(b0?.start),
            startY: fin(b0?.startY),
            onLead: !!b0?.onLead,
            flowX: b0?.flowX
              ? { y: fin(b0.flowX.y), lead: [b0.flowX.lead?.page, fin(b0.flowX.lead?.x0), fin(b0.flowX.lead?.x1)] }
              : null,
            ledBy: got.ledBy ?? null,
            rowLabel: got.rowLabel ? { lb: got.rowLabel.lb.map(fin), baseline: fin(got.rowLabel.baseline) } : null,
            onLeadOf: got.onLeadOf ? { start: fin(got.onLeadOf.start), startY: fin(got.onLeadOf.startY) } : null,
          }
          const want = { ...v, row: undefined, lead: undefined }
          const d = firstDifference(mine, want)
          if (d) differ.push(`${pair} ord ${u.ord} round ${s.round}: ${d}`)
        }
    }
    expect(differ.slice(0, 10)).toEqual([])
    expect(count).toEqual({ slots: 1349, applied: 1260, label: 14, startY: 25, onLead: 25, flowX: 25 })
  })
})
