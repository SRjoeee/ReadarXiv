// X.further (design-b §1.5, T5, E27): the fit's further steps for a unit its states leave clipped, in the target's order
// (Rules.fit.further): 'widen', its single lines widened over the paper beside them, the fit run again in them (with its
// cell bands again over the widened lines); 'shrink', the size's steps on below the fit's floor, to floorMin. The first layout
// that sets every token, or none: the unit is never drawn in part. Ported from engine 065c1d973 run.mjs fitFurther
// RUN:1796-1814; its widening's room (widenOverPaper RUN:1738 over paperTo RUN:1699, the page's ink) is the input `wide`,
// stated by lane L1 as Room.side (F.room).
import type { Token } from '../breaker/tokens.ts'
import type { FitBlock, FitParams, Layout } from './types.ts'

type Walk = (
  tokens: readonly Token[],
  blocks: readonly FitBlock[],
  s: number,
  P: FitParams,
  failed?: FitParams | null,
) => Layout | null
export type FurtherInput = {
  /** the target's rules: its further steps, its floor and the floor's floor */
  rules: { further?: readonly string[]; floor: number; floorMin: number }
  tokens: readonly Token[]
  blocks: FitBlock[]
  s: number
  P: FitParams
  /** the fit's own walk at P set none of its states (its layout, blocks and P untouched since) */
  walked: boolean
  /** the unit's single-line blocks widened over the paper beside them, or null where none grows (Room.side) */
  wide: FitBlock[] | null
  /** a CJK cell's bands over the widened lines (U.params' cellBands), or null */
  clearOf: (blocks: FitBlock[]) => { cap: number } | null
}
export type Further = { layout: Layout; blocks: FitBlock[]; P?: FitParams; clear?: { cap: number } | null } | null

/** X.further (RUN:1796 fitFurther) */
export function fitFurther(i: FurtherInput, layoutUnit2: Walk): Further {
  for (const step of i.rules.further ?? []) {
    if (step === 'widen') {
      const wide = i.wide
      if (!wide) continue
      const clear = i.clearOf(wide)
      const { capScale: _, ...rest } = i.P
      const PW: FitParams = clear && clear.cap < 1 ? { ...rest, capScale: clear.cap } : rest
      const l = layoutUnit2(i.tokens, wide, i.s, PW)!
      if (!l.clipped) return { layout: { ...l, knob: 'widen' }, blocks: wide, P: PW, clear }
    } else if (step === 'shrink' && i.rules.floorMin < i.rules.floor - 1e-9) {
      const l = layoutUnit2(i.tokens, i.blocks, i.s, { ...i.P, floor: i.rules.floorMin }, i.walked ? i.P : null)
      if (l && !l.clipped) return { layout: { ...l, knob: 'below-floor' }, blocks: i.blocks }
    }
  }
  return null
}
