// words.mjs's types: the page's word table (1b-E; the 1b design §4, reader-interface-note §5)
import type { KeptLine, Layout, Token } from './layer2.mjs'

/** the page's drawn tokens in drawing order, in PDF units of the page (the identity map) and the frame of a left part's table
 *  (`ReadLeftPart.table`): `l`, `r` the token's slot, the layout's x and x + width (an opening mark a compressed line shifts is
 *  in its slot, so that neighbours tile; where a CJK line is justified between characters, tokens of one face the drawing sets
 *  as one run are placed by the layout, which the browser's own flow of that run may differ from by a fraction), `y` the
 *  baseline, `h` the size drawn, `top` and `bottom` the ascent and descent: a Times-like face's (0.75, -0.22 em, the left's
 *  default) or, for a CJK token, its em box (0.88, -0.12). A space is no token */
export interface WordsTable { n: number; l: Float32Array; r: Float32Array; y: Float32Array; h: Float32Array; top: Float32Array; bottom: Float32Array }
/** what a page keeps of its words and what a host is handed (a copy, its arrays its own to transfer or free) */
export interface PageWords {
  tokens: WordsTable
  /** per token: the index of its word among anchors.mjs `tokens(plainTranslated(row.pieces))`, which a sentence start counts in
   *  (`row.sentences.tr`); -1 for a crop, a kept line, a lead or label, a placeholder's rendering and a mark alone, and for every
   *  token of a unit whose text the layer cannot place exactly in that string (a source piece drawn other than shown, a text
   *  NFKC does not fold cluster by cluster). A drawn token carries the index of the first word it covers: a token of several words
   *  ('First.Second', a Korean word of several syllables) leaves the later ones with no token. A sentence starts at a word that
   *  begins a token: on the 30 outputs 0 of 7,472 sentence starts (the records' `sentences.tr`) lack a token carrying their index,
   *  though 0.3% to 2% of the words (62% of Korean's) do (the lab's `--door` counts both) */
  word: Int32Array
  /** per token: its place in plainTranslated(row.pieces), which a sentence's offsets count in (`row.sentences.tr`): a text
   *  token's own; a crop's (every part of a formula TeX broke over lines alike), a placeholder's rendering's and a kept line's
   *  the place of its placeholder's piece, the space it becomes (words.mjs pieceOffsets); a lead's, a label's, and that of a
   *  token the layer cannot place, the place of the unit's token before it, else of the one after it; -1 where the unit has
   *  none. The view reads a token's sentence from it where the token has no word (view/highlight.mjs) */
  at: Int32Array
  /** each unit painted on the page: [id, ranges], ranges [first, count] pairs into the tokens as a left part's spans are, rising,
   *  but the spans themselves in PAINT order, not by id, and with empty ranges for a unit painted on the page with no line on it
   *  (unlike the left's, which are rising by id with at least one range each) */
  spans: [id: number, ranges: number[]][]
  /** the units with lines on the page that have no span on it, rising: skipped, unfit, withheld with their table group, refused,
   *  and untranslated (a row lost, none, kept or never come), all shown as the original's; the view copies their tokens from the left */
  original: number[]
  /** the rows on the page of each unit the layout lays, [id, [x0, y0, x1, y1, …]] by id rising, our page's PDF units, y up (empty
   *  for one laid only on other pages): a copy of the left's tokens of a unit shown as the original stands on its own rows alone,
   *  and a unit laid nowhere none on another's (view/shapes.mjs layerShapes) */
  rows?: [id: number, rects: number[]][]
  /** whether the page's lines moved (a unit's pages on the left not its rows' pages here): no copy of a unit laid nowhere */
  drift?: boolean
}
/** the offsets of a unit's text in plainTranslated(pieces) */
export declare function plainTracker(): { gap(): void; text(s: string): Int32Array; space(): number; next(): number }
/** the shown-string index of each character of a translated piece's raw text, or null where the shown string is not `expected` */
export declare function escapeMap(raw: string, expected: string): Int32Array | null
/** the map of a text piece to its transformed string (tokensOf2's), or null where `out` is not `expected` */
export declare function transformMap(s: string, expected: string): { from: number[]; span: number[] } | null
/** the word index of a range of plain text among anchors.mjs tokens(plain), -1 for none */
export declare function wordIndexer(plain: string): (at: number, end: number) => number
/** a unit's plain translated text (plainTranslated's) */
export declare function plainOfPieces(pieces: readonly { t: string; s?: string; tr?: boolean }[]): string
/** each piece's place in plainTranslated(pieces): a text piece's first character that is no blank, any other the space it becomes */
export declare function pieceOffsets(pieces: readonly { t: string; s?: string; tr?: boolean }[]): Int32Array
/** the page's table as it is built */
export interface OpenWords { n: number; cap: number; l: Float32Array; r: Float32Array; y: Float32Array; h: Float32Array; top: Float32Array; bottom: Float32Array; word: Int32Array; at: Int32Array; spans: [number, number[]][] }
export declare function newWords(): OpenWords
/** a text token's band on a line whose baseline is `by`: the baseline it is drawn on, the size drawn, its face's ascent and descent over and under it */
export declare function tokenBand(t: Token, L: Layout, by: number): { y: number; h: number; top: number; bottom: number }
/** a unit's tokens on a page appended to the table in its text's order, as one span; `kept`: the original's lines it keeps
 *  (layer2.mjs keptLines), each written where the text passes it; `pieceAt`: each piece's place in the translation (pieceOffsets) */
export declare function addUnitWords(W: OpenWords, L: Layout, page: number, id: number, wordOf: ((at: number, end: number) => number) | null, kept?: readonly KeptLine[], drawnCrop?: (crop: { page: number }) => boolean, pieceAt?: ArrayLike<number> | null, shown?: readonly import('./hide.mjs').ShownInk[]): void
/** a unit the layer shows as the original's: its layout boxes on the page as its tokens, its displays under their hover ids */
export declare function addBoxWords(W: OpenWords, page: number, id: number, lu: { lines?: ArrayLike<number>; labels?: ArrayLike<number>; ph?: Map<number, { kind: string; segs: ArrayLike<number> }> } | null, displayIds?: Map<number, number>): void
/** the record a page keeps */
/** a drawn thing's tokens (a babel name, a figure's label), one a segment, appended under `id` as a unit's span */
export declare function addSegWords(W: OpenWords, id: number, segs: readonly { x: number; w: number; y: number; h: number; base: number; size: number }[]): void
export declare function freezeWords(W: OpenWords | null, original: Iterable<number>, rows?: readonly (readonly [number, readonly number[]])[], drift?: boolean): PageWords
/** a copy of a kept record */
export declare function copyWords(w: PageWords): PageWords
export type { Token }
