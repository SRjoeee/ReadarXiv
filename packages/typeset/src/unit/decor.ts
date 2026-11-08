// U.decor (design-b §1.5): what the unit's blocks are set with besides their lines. Before the blocks (U.blocks) are read:
// the unit centred as its cell or the file has it, and a label kept as the original's ink that the unit's text group hides
// (`labelHides`), whose first rectangle then starts at the label where the unit is centred by the file's flag (E8, E9).
// After: TeX's flush alignment kept (E12), a hidden label on a centred or flush-right first line carried with it (E9, its
// crop token T30), a single line widened to its column's edge or the next glyph on its baseline (E13; a cell's never, today's
// RUN:2116: its widening is X.further's), a line that stops
// where a page's character stays on the shared row after it (E14), the short skips over a display (E15), the first line
// indented after a label kept as the original's (E16), a heading and a numbered heading (E17). Ported from engine
// 065c1d973: RUN:2101-2137, widen RUN:1576-1587 (its room: `Side`), keptAfter's use RUN:2118-2121, shortSkipsTo L2:3048-3056,
// originalLines L2:4316, the carried label's crop token RUN:2225-2238, INK_UNIT_KINDS RUN:239.
//
// Its inputs, and the field each comes from once lane L1 states it:
// - `byCell`: a cell centred by its own lines (cellCentred RUN:1508: F.align.cell); `luCentred`, `luFlush`: the file's
//   UNIT_FLAG.CENTRED and FLUSH_* ← Placed.align
// - `label`, `firstX0`: the label the class set before the unit's first line and where its text starts (U.label, U.lead,
//   prepareUnit) ← Placed.label, Line.x0
// - `relabels`, `labelKept`, `labelShown` (the label's own group shown), `lead`: the toggles, the wrap and U.lead
// - `side`: each widened block's room: its column's edges (columnOf RUN:1557, the page's paragraph lines) and the next
//   glyphs on its baseline (RUN:1580-1582, the page's characters) ← Room.side (F.room)
// - `kept`: the shared row after the unit where a page's character stays between it and the next unit (keptAfter RUN:1596,
//   the page's characters) ← Placed.join kept
// - `shortSkips`: the displays TeX set with its short skip (shortSkipsOf TEX:328) ← F.shortSkips
// - `lineInfo`: the reading's per-line facts (each rectangle's line index in the file)
import { median, type Rect, rectKey } from '../util.ts'
import type { Block } from './blocks.ts'

/** the units of text our compile set that no source unit owns (RUN:239 INK_UNIT_KINDS) */
export const INK_UNIT_KINDS: readonly string[] = Object.freeze([
  'inkheads',
  'inkcontents',
  'inknotes',
  'inkorphan',
  'inknames',
  'inkreferences',
])
const INK_UNITS = new Set(INK_UNIT_KINDS)

/** a label's character as the rule reads it */
export type DecorChar = { ch: string; x0: number; x1: number; page: number; yb: number; size: number }
export type DecorLabel = { x1: number; text: string; chars?: readonly DecorChar[]; drawn?: string }
/** a display TeX set with its short skip under line `line` of the file (shortSkipsOf TEX:328) */
export type ShortSkip = { page: number; x0: number; x1: number; top: number; bottom: number; line: number }
/** the shared row after the unit where something of the page stays (keptAfter RUN:1596) */
export type KeptRow = { page: number; baseline: number; x1: number; size: number; byLabel?: boolean }
/** a widened line's room: its column's edges, and the glyphs on its baseline left and right of its rectangle, each as the
 *  edge it leaves (half its size off them) */
export type Side = { column: readonly [number, number]; left: readonly number[]; right: readonly number[] }
/** a block as U.decor sets it: U.blocks' block with its alignment kept, its stop and its short skips */
export type DecorBlock = Block & {
  flush?: 'left' | 'right'
  stop?: { y: number; band: number; x1: number }
  shortSkips?: ShortSkip[]
}

export type DecorBeforeInput = {
  kind: string
  byCell: boolean | null | undefined
  luCentred: boolean | undefined
  label: DecorLabel | null | undefined
  relabels: boolean
  labelKept: boolean
  labelShown: boolean
  rects: readonly Rect[]
}
/** before the blocks are read: how the unit is centred, whether its label goes with its text, and its rectangles then */
export type DecorBefore = { centredFlag: boolean | undefined; labelHides: boolean; rects: Rect[] }

/** U.decor before U.blocks (RUN:2101-2109) */
export function decorBefore(i: DecorBeforeInput): DecorBefore {
  const centredFlag = i.byCell !== null ? i.byCell : i.luCentred
  const r00 = i.rects[0]
  const chars = i.label?.chars
  const labelHides =
    !!chars?.length &&
    !i.label!.drawn &&
    !!r00 &&
    chars.every((c) => c.page === r00[0]) &&
    (i.relabels ||
      (INK_UNITS.has(i.kind) &&
        !i.labelKept &&
        !i.labelShown &&
        chars.every((c) => c.x0 >= r00[1] - 0.5 && c.x1 <= r00[3] + 0.5)))
  const rects = i.rects.map((r) => r.slice() as Rect)
  if (labelHides && centredFlag === true) {
    const lx0 = Math.min(...chars!.map((c) => c.x0))
    if (lx0 < r00![1]) rects[0] = [r00![0], lx0, r00![2], r00![3], r00![4]]
  }
  return { centredFlag, labelHides, rects }
}

/** a single line run on to its column's edge or the next glyph on its baseline; a centred one as far to either side
 *  (RUN:1576 widen, its room stated: `side`); one set flush right back to its left, its end kept (TeX's \hfil before it: the
 *  room a flush-right line has is before it; the owner's ruling of 2026-11-08, a page number keeps its size and its end) */
export function widen(b: DecorBlock, side: Side | undefined): void {
  if (b.rects.length !== 1 || !side) return
  const r = b.rects[0]!
  const right = Math.min(side.column[1], ...side.right)
  const left = Math.max(side.column[0], ...side.left)
  if (b.centred) {
    const mid = (r[1] + r[3]) / 2,
      half = Math.min(right - mid, mid - left)
    if (half > (r[3] - r[1]) / 2) {
      b.x0 = mid - half
      b.x1 = mid + half
    }
  } else if (b.flush === 'right') {
    if (left < b.x0) b.x0 = left
  } else if (right > b.x1) b.x1 = right
}

/** each block's displays TeX set with its short skip under one of its own lines (L2:3048 shortSkipsTo) */
export function shortSkipsTo(
  blocks: DecorBlock[],
  skips: readonly ShortSkip[],
  lineInfo: ReadonlyMap<string, { j?: number }> | null,
): void {
  if (!skips.length) return
  const info = (r: Rect) => lineInfo?.get(rectKey(r)) ?? lineInfo?.get(`${r[0]}|${r[2]}|${r[3]}|${r[4]}`)
  for (const b of blocks) {
    const own = new Set(b.rects.map((r) => info(r)?.j).filter(Number.isInteger))
    const mine = skips.filter((d) => own.has(d.line))
    if (mine.length) b.shortSkips = mine
  }
}

/** how many of the original's baselines a block stands on (L2:4316 originalLines) */
export const originalLines = (b: Pick<Block, 'B'>): number => new Set(b.B.map((v) => Math.round(v * 100))).size

export type DecorAfterInput = {
  kind: string
  title: boolean
  front: boolean
  luFlush: 'left' | 'right' | null
  label: DecorLabel | null | undefined
  firstX0: number | undefined
  s: number
  relabels: boolean
  lead: boolean
  labelHides: boolean
  /** the unit's first rectangle as the reading had it, before the label moved it (its page) */
  firstPage: number | undefined
  /** the unit's first rectangle as the blocks were read from it (its x0) */
  firstX: number | undefined
  side: ReadonlyMap<DecorBlock, Side> | ((b: DecorBlock, k: number) => Side | undefined)
  kept: KeptRow | null
  shortSkips: readonly ShortSkip[]
  lineInfo: ReadonlyMap<string, { j?: number }> | null
}
export type DecorAfter = { carried: boolean; heading: boolean; numbered: boolean; indented: boolean }

/** U.decor after U.blocks: each block's decorations set on it, in today's order (RUN:2112-2137) */
export function decorAfter(blocks: DecorBlock[], i: DecorAfterInput): DecorAfter {
  if (i.luFlush && i.kind !== 'cell') for (const b of blocks) if (!b.centred) b.flush = i.luFlush
  const b0 = blocks[0]
  const carried = i.labelHides && !!b0 && b0.page === i.firstPage && (b0.centred || b0.flush === 'right')
  const sideOf = (b: DecorBlock, k: number) => (typeof i.side === 'function' ? i.side(b, k) : i.side.get(b))
  // (but a cell's, as today's widened none (RUN:2116): a cell is set in its own ink's width at its own size, shrunk there to its
  // fit's floor, and runs on over the paper beside it only where it is clipped there, X.further's 'widen' (the adapter's
  // `wide`): the owner's ruling of 2026-11-08, table cells sized as today. Widened at once, a column's every cell was set at
  // the original's size run on to its rules, the column crowded (2608.25210v2-zh p14), and a cell left room for the page's
  // fill to spread (2610.20967v1-zh p4))
  blocks.forEach((b, k) => {
    if (i.kind !== 'cell') widen(b, sideOf(b, k))
  })
  const kept = i.kept
  if (kept)
    for (const b of blocks)
      if (b.page === kept.page && b.B.some((y) => Math.abs(y - kept.baseline) < 0.05))
        b.stop = { y: kept.baseline, band: kept.size, x1: kept.x1 }
  shortSkipsTo(blocks, i.shortSkips, i.lineInfo)
  const label = i.label
  if (label && !label.drawn && b0 && i.firstX !== undefined) {
    if (label.x1 > i.firstX + 0.1)
      b0.indent = Math.max(
        b0.indent,
        (i.firstX0 !== undefined && i.firstX0 > label.x1 ? i.firstX0 : label.x1 + 0.25 * i.s) - b0.x0,
      )
  }
  const heading = i.kind === 'heading' && !i.title && !i.front
  const numbered =
    heading &&
    !carried &&
    !i.lead &&
    i.relabels &&
    blocks.length === 1 &&
    originalLines(b0!) > 1 &&
    !!label?.chars?.length &&
    !label.drawn &&
    label.chars.every((c) => c.page === b0!.page)
  return { carried, heading, numbered, indented: !!(label && !label.drawn) }
}

/** a crop token as the breaker sets it before the unit's first line */
export type LabelCrop = {
  crop: { mode: 'crop'; page: number; crop: [number, number, number, number]; baseline: number; text: string }
  cw: number
  glue: false
  w100: 0
}
/** a carried label as its first line's start: its ink's crop, the original's space after it to its text kept, set by its
 *  line's baseline (`ownBaselines`: the unit's own characters on its first line, the page's; else the block's first
 *  baseline) (RUN:2225-2238) */
export function carriedCrop(
  label: DecorLabel & { chars: readonly DecorChar[] },
  b0: Pick<Block, 'page' | 'B'>,
  firstX0: number | undefined,
  s: number,
  ownBaselines: readonly number[],
): LabelCrop {
  const cs = label.chars
  const start = firstX0 !== undefined && firstX0 > label.x1 ? firstX0 : label.x1 + 0.25 * s
  const x0 = Math.min(...cs.map((c) => c.x0)) - 0.4,
    x1 = Math.max(Math.max(...cs.map((c) => c.x1)) + 0.4, start - 0.4)
  const crop = {
    mode: 'crop' as const,
    page: b0.page,
    crop: [
      x0,
      Math.min(...cs.map((c) => c.yb - 0.26 * c.size)),
      x1,
      Math.max(...cs.map((c) => c.yb + 0.8 * c.size)),
    ] as [number, number, number, number],
    baseline: ownBaselines.length ? median(ownBaselines) : b0.B[0]!,
    text: label.text,
  }
  return { crop, cw: x1 - x0, glue: false, w100: 0 }
}
