// The types of break.mjs (B.break, today's breakLines and its helpers moved as they are: lab/typeset/move-fit.mjs), each
// value re-exported with its type.
// @ts-ignore: JavaScript moved as it is, typed by this file alone (a package holds no declaration file)
import * as m from './break.mjs'
import type { FitBlock, FitParams, FitState, LaidItem, LaidLine } from '../fit/types.ts'
import type { FitMeasure } from './measure.ts'
import type { Slot } from './slots.types.ts'
import type { Token } from './tokens.ts'

/** a breaking at a state: its lines, the tokens it laid from (its own copy where it cut one), how many it set of all */
export type Broken = { lines: LaidLine[]; tokens: Token[]; rest: number; total: number; spilled?: boolean }
/** the tokens broken into the slots of a state (L2:3365 breakLines) */
export const breakLines: (
  tokens: readonly Token[],
  slots: readonly Slot[],
  f: number,
  st: FitState,
  P: FitParams,
  scale: number,
  strict?: boolean,
  blocks?: readonly FitBlock[] | null,
) => Broken = m.breakLines
/** a laid line's extent over and under its baseline, its text's alone (L2:3300 lineExtent) */
export const lineExtent: (
  line: { items: readonly LaidItem[] },
  f: number,
  scale: number,
  measure: FitMeasure,
) => { a: number; d: number; text: { a: number; d: number } } = m.lineExtent
/** a mark that may stand at a line's edge: a laid item's token's mark class, and whether the mark has lost its blank half */
export type EdgeMark = { t: Pick<Token, 'punct'>; cut?: boolean } | null | undefined
/** an opening mark's leading blank half at a line's start, none of its ink, em: lost wherever the state compresses (break.mjs) */
export const leadOf: (it: EdgeMark, compress: number) => number = m.leadOf
/** the marks no line the breaker opens starts with, the target's rules' and UAX 14's: whether a character is one (break.mjs
 *  `barred`'s) */
export const noLineStart: (P: Pick<FitParams, 'noStart' | 'noEnd'>) => (ch: string) => boolean = m.noLineStart
/** a closing mark's trailing blank half at a line's end, none of its ink, em: hung past the line's edge (break.mjs) */
export const hangOf: (it: EdgeMark, compress: number) => number = m.hangOf
