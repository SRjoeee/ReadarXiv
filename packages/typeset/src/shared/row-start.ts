// S.rowStart (design-b §1.5, E18, T34): a unit whose first row TeX set on the line another unit's last row ends (a shared
// line, need.mjs rowLeadOf: a run-in heading's text, a paragraph's part after the float that split it) starts where that
// unit's translation's ink ends on the row, the original's separation after it (`start`), on that unit's baseline where its
// text there stands off TeX's (`startY`), and flows on from that unit's last line where it ended above the row (`onLead`,
// `flowX`); its own label on the row goes with it (`rowLabel`). It stays where TeX set it where that unit is the original's,
// or something of the page stands between the two on the row. Ported from engine 065c1d973 run.mjs RUN:2152-2183.
//
// Its inputs: the shared row (Placed.join: the unit before's last row), the unit's first block as U.decor left it and
// whether its label is carried (U.decor), the unit before's verdict and its share of the row (S.share), its blocks (the one
// that holds the row: flowX); and two page facts lane L1 states: the unit's own label on the row (ownLabelOnRow RUN:1623,
// the file's label row: Placed.join, the label) and whether a character of the page stays between the two on the row
// (keptBetween RUN:1592: Placed.join kept).
import type { FitBlock } from '../fit/types.ts'
import type { Share } from './share.types.ts'

export type Row = { id: number; page: number; baseline: number; x0: number; x1: number; size: number }
export type RowStartInput = {
  row: Row | null
  /** the unit's first block, as U.decor left it (changed in place, as today's) */
  b0: FitBlock | undefined
  carried: boolean
  /** the unit before: whether it is left the original's, and its share of the row */
  lead: { refused: boolean; share: Share | null } | null
  /** the unit's own label row on the shared row (ownLabelOnRow's [kind, page, x0, baseline, x1, top, bottom]), or null */
  ownLabel: readonly number[] | null
  /** a character of the page stands on the row between the unit before's end and `x` (keptBetween) */
  keptBetween: (x: number) => boolean
  /** the unit before's blocks */
  leadBlocks: readonly FitBlock[] | null
}
export type RowStart = {
  ledBy?: number
  rowLabel: { lb: readonly number[]; baseline: number } | null
  onLeadOf: { start: number; startY: number | undefined } | null
}

/** S.rowStart: sets the first block's start, startY, onLead and flowX where the unit is laid from the row (RUN:2152) */
export function rowStart(i: RowStartInput): RowStart {
  const row = i.row,
    b = i.b0
  let rowLabel: RowStart['rowLabel'] = null,
    onLeadOf: RowStart['onLeadOf'] = null,
    ledBy: number | undefined
  if (row && b && !b.centred && !i.carried && b.page === row.page && Math.abs(b.B[0]! - row.baseline) < 0.05) {
    const share = i.lead && !i.lead.refused ? (i.lead.share ?? null) : null,
      x = b.x0 + b.indent
    const lb = i.ownLabel
    if (share && !share.kept && (lb || !i.keptBetween(x))) {
      if (lb) {
        rowLabel = { lb, baseline: row.baseline }
        b.indent = 0
      }
      b.start = share.end !== null ? share.ink! + Math.max(0, (lb ? lb[2]! : x) - row.x1) : row.x0
      if (share.end !== null && Math.abs(share.at! - b.B[0]!) >= 0.05) b.startY = share.at!
      if (share.above) {
        b.onLead = true
        onLeadOf = { start: row.x0, startY: undefined }
      } else if (b.startY !== undefined && b.startY > b.B[0]! + 0.05) {
        b.onLead = true
        onLeadOf = { start: b.start, startY: b.startY }
      }
      const lead = b.onLead
        ? i.leadBlocks?.find((q) => q.page === row.page && q.B.some((y) => Math.abs(y - row.baseline) < 0.05))
        : undefined
      if (lead) b.flowX = { y: row.baseline, lead }
      ledBy = row.id
    }
  }
  return { ...(ledBy !== undefined ? { ledBy } : {}), rowLabel, onLeadOf }
}
