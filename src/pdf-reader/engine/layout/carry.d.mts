// carry.mjs's types (JavaScript until the engine's port), for the layout maker and its tests
import type { DocToken } from '../pipeline/anchors.mjs'
import type { LayoutMarks } from './marks.mjs'

/** a line of words on one baseline: its page, baseline, extent and words (anchors.mjs tokens on it: `tokens` its words on its
 *  baseline, `all` every token it holds) */
export interface TextLine { page: number; y: number; h: number; x0: number; x1: number; tokens: number[]; sig: string; all: number[] }
/** a line's partner on arXiv's PDF: its page, the medians of its matched words' offsets (dx, dy), whether it moved whole, whether
 *  matched by most of its words (or a twin: the same words but for their characters outside ASCII, at its place), and the words
 *  matched as [ours, theirs] indices into the two lines' `tokens` (null: all of them, in order) */
export interface LinePartner { page: number; dx: number; dy: number; whole: boolean; fuzzy: boolean; pairs: [number, number][] | null; twin?: true }
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
  /** each marked line, in the order added: its partner (null for none), and whether in place (1, else 0) */
  readonly lineAt: readonly (LinePartner | null)[]
  readonly inPlace: readonly number[]
  /** each marked token's line (no entry for a token on no line) */
  readonly tokenLine: readonly number[]
  /** each marked rest of a word given in parts on a page carried: 1 where arXiv's rest stands within LINE_PLACE of it, else 0 */
  readonly rests: ReadonlyMap<number, number>
  /** each marked token a partner word matched: its offset from that word, x and y */
  readonly tokenDx: ReadonlyMap<number, number>
  readonly tokenDy: ReadonlyMap<number, number>
  /** the marked tokens `from` to `to` (`marked`'s indices), whole pages none of which was added: their lines matched */
  add(from?: number, to?: number): void
}
export declare function carrierOf(marked: readonly DocToken[], arxiv: readonly DocToken[]): Carrier
/** a line in place: found on its own page within this, PDF units */
export declare const LINE_PLACE: 0.5
/** the page-and-line check: the carrier's counts with the lines in place, and each page's [placed, total] (information); each
 *  of our lines' partner and verdict, each of our tokens' line (-1: none), each of our rests' verdict (1 in place), the pages
 *  past their work */
export interface LineCheck {
  lines: { total: number; same: number; moved: number; respaced: number; fuzzy: number; placed: number }
  pageLines: ReadonlyMap<number, readonly [placed: number, total: number]>
  lineAt: readonly (LinePartner | null)[]
  inPlace: Uint8Array
  tokenLine: Int32Array
  rests: Uint8Array
  /** each of our tokens a partner word matched: its offset from that word (NaN for none) */
  tokenDx: Float64Array
  tokenDy: Float64Array
  over: number[]
}
export declare function lineCheckOf(ours: readonly DocToken[], arxiv: readonly DocToken[]): LineCheck
/** carrierOf a page at a time: arXiv's tokens whole, the marked ones added (`add`) as their pages are read */
export declare function carrier(marked: readonly DocToken[], arxiv: readonly DocToken[]): Carrier
/** the marks file's tokens as DocTokens (page, x, y, w, h, t) */
export declare function tokensOfMarks(m: LayoutMarks): DocToken[]
