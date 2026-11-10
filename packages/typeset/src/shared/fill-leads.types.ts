// The types of fill-leads.mjs (S.fill.leads, today's fillLeadsOf, closerLead and guessCloser moved as they are:
// lab/typeset/move-fit.mjs).
// @ts-ignore: JavaScript moved as it is, typed by this file alone (a package holds no declaration file)
import * as m from './fill-leads.mjs'
import type { Token } from '../breaker/tokens.ts'
import type { FitBlock, FitParams, Layout } from '../fit/types.ts'

/** a unit (or a run of one) as its fill leadings are read: its tokens, blocks, size, parameters and layout; its fill leadings
 *  set on it */
export type FillUnit = {
  tokens: readonly Token[]
  blocks: readonly FitBlock[]
  s: number
  P: FitParams
  layout: Layout
  parent?: unknown
  fillLead?: number | null
  fillTop?: number
  fitLines?: number
  /** a unit over a page or column break: the fill leading of each frame before its last, by block, and of its last */
  fillLeads?: (number | undefined)[]
  lastLead?: number
  /** its frames at a state that holds the frames' share, and the leading each frame before the last holds it at */
  fillShare?: FillShare
}
/** a unit's frames at a state that holds the frames' share (frameShareOf): their leadings as fillLeads and lastLead, the
 *  leading each frame a cut follows is filled to holding it (null: it does not hold it), and the unit's fill leading `lo` */
export type FillShare = { leads: (number | undefined)[]; last: number; needs: (number | null)[]; lo: number }
/** the target's rules the fill leadings read */
export type FillRules = { fillLead: number | null; fillLeadRel: number | null; leadFloor?: number }
/** a unit's fill leadings set on it (RUN:512 fillLeadsOf) */
export const fillLeadsOf: (p: FillUnit, P: FillRules) => void = m.fillLeadsOf
/** the loosest leading of a closer search's grid at which a unit sets (RUN:569 closerLead) */
export const closerLead: (
  K: number,
  sets: (k: number) => Layout | null,
  guess: number | null,
) => { k: number; l: Layout } | null = m.closerLead
/** each block's frame (a page's, a column's, a paragraph's TeX states inside the unit), by block (S.fill.leads framesOf) */
export const framesOf: (blocks: readonly FitBlock[]) => number[] = m.framesOf
