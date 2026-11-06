// The types of at.mjs (X.at, today's layoutAt moved as it is: lab/typeset/move-fit.mjs).
// @ts-ignore: JavaScript moved as it is, typed by this file alone (a package holds no declaration file)
import * as m from './at.mjs'
import type { Token } from '../breaker/tokens.ts'
import type { FitBlock, FitParams, FitState, Layout } from './types.ts'

/** a unit laid at one state of the fit, with no search (L2:4263 layoutAt) */
export const layoutAt: (
  tokens: readonly Token[],
  blocks: readonly FitBlock[],
  s: number,
  P: FitParams,
  st: FitState,
) => Layout = m.layoutAt
