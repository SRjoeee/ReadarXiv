// words.mjs's types: the page's word table (1b-E; the 1b design §4, reader-interface-note §5)
import type { Layout, Token } from './layer2.mjs'

/** the page's drawn tokens in drawing order, in PDF units of the page (the identity map) and the frame of a left part's table
 *  (`ReadLeftPart.table`): `l`, `r` the layout's x and x + width, `y` the baseline, `h` the size drawn, `top` and `bottom` the
 *  ascent and descent of the face. A space is no token */
export interface WordsTable { n: number; l: Float32Array; r: Float32Array; y: Float32Array; h: Float32Array; top: Float32Array; bottom: Float32Array }
/** what a page keeps of its words and what a host is handed (a copy, its arrays its own to transfer or free) */
export interface PageWords {
  tokens: WordsTable
  /** per token: the index of its word among anchors.mjs `tokens(plainTranslated(row.pieces))`, which a sentence start counts in
   *  (`row.sentences.tr`); -1 for a crop, a kept line, a lead or label, a placeholder's rendering and a mark alone */
  word: Int32Array
  /** each unit painted on the page: [id, ranges], ranges [first, count] pairs into the tokens as a left part's spans are, rising,
   *  in paint order (empty ranges for a unit painted on the page with no line on it) */
  spans: [id: number, ranges: number[]][]
  /** the units on the page left the original's (skipped, unfit, withheld, refused with a page), rising; the view copies their tokens from the left */
  original: number[]
}
/** the offsets of a unit's text in plainTranslated(pieces) */
export declare function plainTracker(): { gap(): void; text(s: string): Int32Array }
/** the map of a text piece to its transformed string (tokensOf2's), or null where `out` is not `expected` */
export declare function transformMap(s: string, expected: string): { from: number[]; span: number[] } | null
/** the word index of a range of plain text among anchors.mjs tokens(plain), -1 for none */
export declare function wordIndexer(plain: string): (at: number, end: number) => number
/** a unit's plain translated text (plainTranslated's) */
export declare function plainOfPieces(pieces: readonly { t: string; s?: string; tr?: boolean }[]): string
/** the page's table as it is built */
export interface OpenWords { n: number; cap: number; l: Float32Array; r: Float32Array; y: Float32Array; h: Float32Array; top: Float32Array; bottom: Float32Array; word: Int32Array; spans: [number, number[]][] }
export declare function newWords(): OpenWords
/** a unit's tokens on a page appended to the table, as one span; `kept`: the original's lines it keeps (layer2.mjs keptLines) */
export declare function addUnitWords(W: OpenWords, L: Layout, page: number, id: number, wordOf: ((at: number, end: number) => number) | null, kept?: readonly { x0: number; x1: number; baseline: number; size: number; top: number; bottom: number }[]): void
/** the record a page keeps */
export declare function freezeWords(W: OpenWords | null, original: Iterable<number>): PageWords
/** a copy of a kept record */
export declare function copyWords(w: PageWords): PageWords
export type { Token }
