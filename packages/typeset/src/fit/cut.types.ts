// The types of cut.mjs (X.cut, today's layoutCut moved as it is: lab/typeset/move-fit.mjs).
// @ts-ignore: JavaScript moved as it is, typed by this file alone (a package holds no declaration file)
import * as m from './cut.mjs'
import type { FitBlock, FitParams, Layout, Tokens } from './types.ts'

/** a unit laid over its frame breaks: its layout and the tokens it was laid from (L2:3952 layoutCut) */
export const layoutCut: (
  tokens: Tokens,
  blocks: readonly FitBlock[],
  s: number,
  P: FitParams,
) => { layout: Layout; tokens: Tokens } = m.layoutCut
