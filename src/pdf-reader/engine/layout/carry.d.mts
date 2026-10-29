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
  /** each marked line's partner's arXiv tokens, every one its line holds (null for a line of no partner), in the order added */
  readonly partnerTokens: readonly (readonly number[] | null)[]
  /** the marked tokens `from` to `to` (`marked`'s indices), whole pages none of which was added: their lines matched */
  add(from?: number, to?: number): void
}
export declare function carrierOf(marked: readonly DocToken[], arxiv: readonly DocToken[]): Carrier
/** a line in place: found on its own page within this, PDF units */
export declare const LINE_PLACE: 0.5
/** a page is drawable where at least this share of its words are arXiv's page's, in order */
export declare const PAGE_SAME: 0.98
/** a page whose lines moved across its breaks (compile drift) is drawn where at most this many moved at each of its two ends */
export declare const DRIFT_LINES: 4
/** the letters and digits a line of ours must hold for its finding on another page of arXiv's to make our page another's */
export declare const LINE_EVIDENCE: 4
/** the page-and-line check: may we draw, per page (`pages`, `undrawable`), and do the panes align, per line, information alone:
 *  the carrier's counts with the lines in place, each page's [placed, total], each of our lines' partner and verdict, each of
 *  our tokens' line (-1: none), the pages past their work */
export interface LineCheck {
  lines: { total: number; same: number; moved: number; respaced: number; fuzzy: number; placed: number }
  pageLines: ReadonlyMap<number, readonly [placed: number, total: number]>
  lineAt: readonly (LinePartner | null)[]
  inPlace: Uint8Array
  tokenLine: Int32Array
  /** may we draw, per page: its words against arXiv's page's (`overlap`, in order; null past the bound), our lines found on
   *  another page (`elsewhere`), drawable or not; and the pages that are not */
  pages: { page: number; words: [ours: number, arxiv: number]; overlap: number | null; sameWords?: true; elsewhere: number; drift?: [start: number, end: number]; drawable: boolean }[]
  undrawable: number[]
  over: number[]
  /** by arXiv's page, its tokens (indices into `arxiv`) whose line one of ours on another page was found on: lines moved across a
   *  break, with no partner on our page */
  moved: Map<number, Uint32Array>
}
export declare function lineCheckOf(ours: readonly DocToken[], arxiv: readonly DocToken[]): LineCheck
/** carrierOf a page at a time: arXiv's tokens whole, the marked ones added (`add`) as their pages are read */
export declare function carrier(marked: readonly DocToken[], arxiv: readonly DocToken[]): Carrier
/** the marks file's tokens as DocTokens (page, x, y, w, h, t) */
export declare function tokensOfMarks(m: LayoutMarks): DocToken[]
