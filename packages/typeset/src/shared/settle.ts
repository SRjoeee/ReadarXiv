// S.settle (design-b §1.5, T35): a unit's layout made final, a CJK cell's lines moved into their bands between the rules over
// and under them at the size it is drawn at. Every step that lays a unit anew (its fit, the page's fill) ends here. Ported from
// engine 065c1d973 run.mjs settleLayout RUN:305-307 and layer2.mjs clearLines L2:387-392; the bands are U.params' (cellBands,
// over the page's rules: lane L1's Room.band). As today, the lines of the layout it is given are moved in place: the layout is
// the caller's own, laid by it just before (a fit's, a fill's try).
import type { Band } from '../unit/params.ts'

/** a line as clearLines reads and moves it */
type Settled = { block?: number | null; baseline: number }

/**
 * Each laid line that stands on one of the original's lines (its baseline the original's) moved into that line's band at
 * the size `f` it is drawn at, by the least that keeps its em box inside; a line the fit set on a pitch of its own stands on
 * none and is not moved (L2:387 clearLines)
 */
export function clearLines(lines: readonly Settled[], bands: ReadonlyMap<number, readonly Band[]>, f: number): void {
  for (const l of lines) {
    const on = bands.get(l.block as number)?.find((r) => Math.abs(r.B - l.baseline) < 0.01)
    if (on) l.baseline = Math.min(Math.max(l.baseline, on.lo + 0.12 * f), on.hi - 0.88 * f)
  }
}

/** S.settle: the unit's layout settled into its bands, where it has them (RUN:305 settleLayout) */
export function settleLayout(
  p: { clear?: { bands: ReadonlyMap<number, readonly Band[]> } | null; s: number },
  layout: { lines?: readonly Settled[]; scale?: number },
): void {
  if (p.clear) clearLines(layout.lines ?? [], p.clear.bands, p.s * (layout.scale ?? 1))
}
