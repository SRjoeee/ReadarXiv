// carry.mjs's types (JavaScript until the engine's port), for the layout maker and its tests
import type { DocToken } from '../pipeline/anchors.mjs'
import type { LayoutMarks } from './marks.mjs'

/** a line of words on one baseline: its page, baseline, extent and words (anchors.mjs tokens on it) */
export interface TextLine { page: number; y: number; h: number; x0: number; x1: number; tokens: number[]; sig: string }
/** the lines of the tokens `from` to `to` (all of them by default) */
export declare function linesOf(tokens: readonly DocToken[], from?: number, to?: number): TextLine[]
/** the marked original's lines matched to arXiv's: each by the same words at one offset, else between the same words,
 *  else (80 % of its words in order) between the words matched */
export interface Carrier {
  readonly lines: { total: number; same: number; moved: number; respaced: number; fuzzy: number }
  /** each marked page added: its lines carried and its lines */
  readonly pageLines: ReadonlyMap<number, readonly [carried: number, total: number]>
  /** the lines found on their own page within LINE_PLACE (in place), and each page's [placed, total] */
  readonly placed: number
  readonly pagePlaced: ReadonlyMap<number, readonly [placed: number, total: number]>
  /** the marked original's pages that cost more work than a page may: none of their lines is carried */
  readonly over: readonly number[]
  /** the marked tokens `from` to `to` (`marked`'s indices), whole pages none of which was added: their lines matched */
  add(from?: number, to?: number): void
}
export declare function carrierOf(marked: readonly DocToken[], arxiv: readonly DocToken[]): Carrier
/** a line in place: found on its own page within this, PDF units */
export declare const LINE_PLACE: 0.5
/** the page-and-line check: the carrier's counts with the lines in place, and each page's [placed, total] */
export interface LineCheck {
  lines: { total: number; same: number; moved: number; respaced: number; fuzzy: number; placed: number }
  pageLines: ReadonlyMap<number, readonly [placed: number, total: number]>
}
export declare function lineCheckOf(ours: readonly DocToken[], arxiv: readonly DocToken[]): LineCheck
/** carrierOf a page at a time: arXiv's tokens whole, the marked ones added (`add`) as their pages are read */
export declare function carrier(marked: readonly DocToken[], arxiv: readonly DocToken[]): Carrier
/** the marks file's tokens as DocTokens (page, x, y, w, h, t) */
export declare function tokensOfMarks(m: LayoutMarks): DocToken[]
