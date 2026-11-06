// The types of runs.mjs (X.runs, today's runsOf, layoutRuns, joinRuns and keepsPages moved as they are:
// lab/typeset/move-fit.mjs).
// @ts-ignore: JavaScript moved as it is, typed by this file alone (a package holds no declaration file)
import * as m from './runs.mjs'
import type { Token } from '../breaker/tokens.ts'
import type { FitBlock, FitParams, LaidLine, Layout } from './types.ts'

/** a run of a unit between its kept regions: its first block, its blocks and its tokens */
export type Run = { bi0: number; blocks: FitBlock[]; tokens: Token[]; P?: FitParams; layout?: Layout }
/** a unit's runs between its displays, or null (L2:4171 runsOf) */
export const runsOf: (tokens: readonly Token[], blocks: readonly FitBlock[]) => Run[] | null = m.runsOf
/** a run's parameters (L2:4211 runParams) */
export const runParams: (P: FitParams, run: Run, last: boolean) => FitParams = m.runParams
/** a unit's runs each laid at its own state, or null (L2:4223 layoutRuns) */
export const layoutRuns: (
  tokens: readonly Token[],
  blocks: readonly FitBlock[],
  s: number,
  P: FitParams,
  fit?: readonly LaidLine[] | null,
) => { layout: Layout; runs: (Run & { layout: Layout })[] } | null = m.layoutRuns
/** the runs' layouts as the unit's one layout (L2:4252 joinRuns) */
export const joinRuns: (runs: readonly (Run & { layout: Layout })[]) => Layout = m.joinRuns
/** whether a layout keeps the pages its fit set its lines on (L2:4390 keepsPages) */
export const keepsPages: (
  fit: readonly LaidLine[],
  lines: readonly LaidLine[],
  tokens?: readonly Token[] | null,
) => boolean = m.keepsPages
