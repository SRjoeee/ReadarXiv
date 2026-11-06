// The types of cuts.mjs (B.cuts, today's pageCutsOf and withPageBreaks moved as they are: lab/typeset/move-fit.mjs), each
// value re-exported with its type.
// @ts-ignore: JavaScript moved as it is, typed by this file alone (a package holds no declaration file)
import * as m from './cuts.mjs'
import type { FitBlock, FitParams, LaidLine, Tokens } from '../fit/types.ts'
import type { Token } from './tokens.ts'

/** a cut: the page and frame a line begins, at a token (pageCutsOf) */
export type Cut = { page: number; frame: number; at: number }
/** a token that sets nothing of the text (L2:4162 textless) */
export const textless: (t: Token) => boolean = m.textless
/** where a unit's lines are cut at its frames' shares (L2:3894 pageCutsOf) */
export const pageCutsOf: (
  lines: readonly LaidLine[],
  blocks: readonly FitBlock[],
  tokens: readonly Token[],
  P: FitParams,
) => Cut[] = m.pageCutsOf
/** the tokens with a page-break token before each cut's (L2:3965 withPageBreaks) */
export const withPageBreaks: (tokens: Tokens, cuts: readonly Cut[]) => Tokens = m.withPageBreaks
