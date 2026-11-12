// The types of slots.mjs (B.slots, today's slotsAt and its helpers moved as they are: lab/typeset/move-fit.mjs), each value
// re-exported with its type.
// @ts-ignore: JavaScript moved as it is, typed by this file alone (a package holds no declaration file)
import * as m from './slots.mjs'
import type { FitBlock, FitParams, FitState, LaidLine } from '../fit/types.ts'

/** a slot: a line a block holds at a state, before the breaker fills it */
export type Slot = Omit<LaidLine, 'items' | 'from'>
/** of a line's size: a display whose top stands under its baseline nearer than this is in reach of its descent */
export const SHORT_SKIP: number = m.SHORT_SKIP
/** of a line's size: how far before a display TeX's short skip asks the line over it to end */
export const PREDISPLAY: number = m.PREDISPLAY
/** the floor a state asks of the unit's last line, or null (L2:3150 footFloorOf) */
export const footFloorOf: (blocks: readonly FitBlock[], st: FitState, P: FitParams, s: number) => number | null =
  m.footFloorOf
/** the distance TeX set between a formula's line and the next or the one before (L2:3190 texRoomOf) */
export const texRoomOf: (
  blocks: readonly FitBlock[] | null,
  r: { crop: readonly number[]; page: number; baseline: number },
  below: boolean,
) => number = m.texRoomOf
/** the slots the blocks hold at a state (L2:3206 slotsAt) */
export const slotsAt: (blocks: readonly FitBlock[], st: FitState, P: FitParams, s: number) => Slot[] = m.slotsAt
/** two laid lines or slots of one flow (L2:3061 inFlow) */
export const inFlow: (a: { flow?: number }, b: { flow?: number }) => boolean = m.inFlow
/** the room under a block's last baseline at a state (§18.37: deeper at a state that borrows past TeX's bottom) */
export const roomOf: (b: FitBlock, st: FitState) => number = m.roomOf
