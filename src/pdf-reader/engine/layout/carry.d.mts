// carry.mjs's types (JavaScript until the engine's port), for the layout maker and its tests
import type { DocToken } from '../anchors.mjs'
import type { LayoutMarks } from './marks.mjs'

/** a line of words on one baseline: its page, baseline, extent and words (anchors.mjs tokens on it) */
export interface TextLine { page: number; y: number; h: number; x0: number; x1: number; tokens: number[]; sig: string }
export declare function linesOf(tokens: readonly DocToken[]): TextLine[]
/** the marked original's lines matched to arXiv's: each by the same words at one offset, else between the same words,
 *  else (80 % of its words in order) between the words matched */
export interface Carrier {
  /** a position of the marked original on arXiv's PDF, or null where its line was not carried */
  carry(page: number, x: number, y: number): { page: number; x: number; y: number; whole: boolean } | null
  readonly lines: { total: number; same: number; moved: number; respaced: number; fuzzy: number }
  /** the marked original's pages that cost more work than a page or the paper may: none of their lines is carried */
  readonly over: readonly number[]
}
export declare function carrierOf(marked: readonly DocToken[], arxiv: readonly DocToken[]): Carrier
/** the marks file's tokens as DocTokens (page, x, y, w, h, t) */
export declare function tokensOfMarks(m: LayoutMarks): DocToken[]
