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
import type { Share } from './share.ts'

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

/** one of TeX's lines a run of members fills: its page, its baseline and its extent as TeX set it (its first glyph's start, the
 *  leading member's label's where it stands first on it, to its last glyph's end) */
export type RunRow = { page: number; baseline: number; x0: number; x1: number }
/**
 * A paragraph of TeX's that several members of a flow fill whole, one after the other (each joined to the one before on the line
 * that one ends: Placed.join, nothing of the page between them but the member's own label, which goes with it), which TeX set
 * centred or flush right (Placed.align, as its members' own marks state it: a member made on A, an ink unit, states no
 * alignment of TeX's, nor one read off the page): its members in order, its alignment, its lines as TeX set them (`rows`, top
 * down: one where it is a single line), and the room a member's line may take beside it (Room.side, its column, as U.decor's
 * widen reads it): the run's left the least of its members', its right the greatest
 */
export type RowLine = {
  ords: readonly number[]
  align: 'c' | 'r' | 'l'
  rows: readonly RunRow[]
  left: number
  right: number
}

/** the room a line of a run is laid in: centred, as far to either side of the line's middle as its room allows on both (U.decor's
 *  widen of a centred line), never narrower than TeX's line; flush right, from its room's left to the line's end; flush left,
 *  from the line's start to its room's right (§18.60) */
export function lineRoom(
  align: RowLine['align'],
  line: Pick<RunRow, 'x0' | 'x1'>,
  left: number,
  right: number,
): [number, number] {
  if (align === 'r') return [Math.min(left, line.x0), line.x1]
  if (align === 'l') return [line.x0, Math.max(right, line.x1)]
  const mid = (line.x0 + line.x1) / 2,
    half = Math.max((line.x1 - line.x0) / 2, Math.min(right - mid, mid - left))
  return [mid - half, mid + half]
}

/** how far a line of a run laid over [lo, hi] (its first glyph's start to its last one's end) moves to stand as TeX set the
 *  line: centred on the line's middle, ending at its end, or starting at its start */
export const lineShift = (align: RowLine['align'], line: Pick<RunRow, 'x0' | 'x1'>, lo: number, hi: number): number =>
  align === 'r' ? line.x1 - hi : align === 'l' ? line.x0 - lo : (line.x0 + line.x1) / 2 - (lo + hi) / 2

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
