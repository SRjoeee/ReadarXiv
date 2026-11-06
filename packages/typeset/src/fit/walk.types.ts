// The types of walk.mjs (X.walk, today's statesOf and layoutUnit2 moved as they are: lab/typeset/move-fit.mjs).
// @ts-ignore: JavaScript moved as it is, typed by this file alone (a package holds no declaration file)
import * as m from './walk.mjs'
import type { Token } from '../breaker/tokens.ts'
import type { FitBlock, FitParams, FitState, Layout } from './types.ts'

/** the fit's states, from the most natural (L2:4041 statesOf) */
export const statesOf: (P: FitParams, blocks: readonly FitBlock[], s: number) => Generator<FitState> = m.statesOf
/** a unit laid out at the first state at which every token is placed, else what fits at the last (L2:4102 layoutUnit2) */
export const layoutUnit2: (
  tokens: readonly Token[],
  blocks: readonly FitBlock[],
  s: number,
  P: FitParams,
  failed?: FitParams | null,
) => Layout | null = m.layoutUnit2
