// The types of fill-page.mjs (S.fill.page, today's fillUnitsOf and fillPage moved as they are: lab/typeset/move-fit.mjs).
// @ts-ignore: JavaScript moved as it is, typed by this file alone (a package holds no declaration file)
import * as m from './fill-page.mjs'
import type { Token } from '../breaker/tokens.ts'
import type { FitBlock, FitParams, FitState, Layout } from '../fit/types.ts'
import type { Band } from '../unit/params.ts'
import type { FillRules } from './fill-leads.types.ts'
import type { FillTarget } from './fill-target.ts'
import type { Share } from './share.ts'

/** a unit (or a run of one) as the page's fill reads and lays it anew: what its lay left, its fill leadings, its row */
export type FillLaid = {
  id: number
  unit: { kind: string }
  refused: boolean
  tokens: readonly Token[]
  blocks: readonly FitBlock[]
  s: number
  P: FitParams
  layout: Layout
  share: Share | null
  clear: { bands: ReadonlyMap<number, readonly Band[]> } | null
  /** a run of a unit laid in runs: the unit; its index */
  parent?: FillLaid
  run?: number
  /** a unit laid in runs: its runs */
  runs?: FillLaid[]
  fillLead?: number | null
  fillTop?: number
  fitLines?: number
  /** the layout S.fill.leads found at the unit's fill leading (FillLeads.laid) */
  fillLaid?: { state: FitState; lead: number | null; l: Layout }
  [more: string]: unknown
}
/** the run's rules the fill reads (P.adaptiveFill, the script, the size's step, the fill leadings') */
export type PageRules = FillRules & {
  adaptiveFill: { band: number; track: number; size: number }
  cjk?: boolean
  step: number
}
/** what a pass hands the fill: the units filled, the units its target reads, those running on to the page */
export type FillUnits = { units: FillLaid[]; voters: FillLaid[]; continuing: FillLaid[] }

/** RUN:325 fillUnitsOf */
export const fillUnitsOf: (begun: FillLaid[], continuing: FillLaid[]) => FillUnits = m.fillUnitsOf
/** RUN:365 fillPage: each unit filled is laid anew in place (its P, its layout), then `onFilled(p, target)` */
export const fillPage: (
  units: FillLaid[],
  P: PageRules,
  onFilled?: (p: FillLaid, target: number) => void,
  o?: { continuing?: FillLaid[]; voters?: FillLaid[] | null; trace?: FillTrace | null },
) => FillTarget | null = m.fillPage
/** a unit's decision in the fill (the tap's passes[].units): skipped, or its leading, the next paragraph's, and what it took */
export type FillDecision =
  | { skip: 'no fill leading' }
  | { skip: 'not set'; lead: number; next: number | null }
  | {
      lead: number
      next: number | null
      same: boolean
      closer: boolean
      short: boolean
      full: boolean
      tracked: number
    }
/** what the fill tells a trace, where the tap's probes read it: each unit's decision, the page's size, each unit filled */
export type FillTrace = {
  unit(p: FillLaid, v: FillDecision): void
  size(ok: number, scale: number, grown: [id: number, run: number | null, grew: boolean][]): void
  filled(p: FillLaid, st: FitState, l: Layout, target: number): void
}
