// anchors.mjs's types (JavaScript until the engine's port), for the reader's tests
/** a token of the document: its text (empty for the rest of a word given in parts), page and box in PDF units, the text
 *  item it was read from, and where an item of marks alone after it on its baseline ends (inkEdges) */
export interface DocToken { t: string; page: number; x: number; y: number; w: number; h: number; top: number; bottom: number; item?: unknown; sym?: number | null; far?: number | null }
/** a page's text as getTextContent gives it */
export interface TextPage { page: number; items: unknown[]; styles?: Record<string, unknown> }
export interface Rect { page: number; x0: number; y0: number; x1: number; y1: number }
/** a unit's place: its line rectangles and the document tokens they are made of; with marks, the page token each word of
 *  its text was matched to, or -1 */
export interface Anchor { rects: Rect[]; coverage: number; tokens: number[]; bounded: boolean; pairs?: Map<number, number> }
/** a unit as the reader passes it: its text as that PDF has it, the offsets in it where a placeholder stood, and the
 *  letters of the displays it sets before its first words, after its last and between them (latex-front's
 *  displayOutside) */
export interface UnitText { id: number; text: string; gaps?: number[]; lead?: string; trail?: string; inner?: string }

export declare function tokens(s: string): { t: string; at: number; len: number }[]
export declare function tokenizeDocument(pages: TextPage[]): DocToken[]
/** marks (`${id}s` / `${id}e` → where, and the word carried with it) → id → [first token, last token] */
/** whether a token is upright: its baseline nearer its box's bottom than its top */
export declare const uprightToken: (t: unknown) => boolean
export declare function boundsFromMarks(doc: DocToken[], marks: Map<string, { page: number; x: number; y: number; t?: string | null }>, byPage?: Map<number, number[]>, reach?: ((mark: { page: number; x: number; y: number }) => number | null) | null): Map<string, [number, number]>
/** each page's tokens, by index */
export declare function pageIndex(doc: readonly DocToken[]): Map<number, number[]>
/** each mark with the word it stands by in `doc`, the document the marks were recorded in */
/** the token a mark sits right after on its baseline (its index in `doc`), or null: `byPage` each page's token indices */
export declare function tokenAtMark(doc: readonly DocToken[], byPage: Map<number, number[]>, mk: { page: number; x: number; y: number }, start: boolean): number | null
export declare function markWords(doc: DocToken[], marks: Map<string, { page: number; x: number; y: number }>): Map<string, { page: number; x: number; y: number; t: string | null }>
/** the pages' frame's rule: (doc, every unit's located tokens) → whether a token is inside the frame (pageFrame, today's) */
export type FrameRule = (doc: DocToken[], ms: readonly (number[] | null)[]) => (t: DocToken) => boolean
export declare const pageFrame: FrameRule
/** the pages' frame from the document's tokens alone (rule 1 of the page stream, made at step T): pageFrame's arithmetic over the
 *  body words (a letter; at most 1.5 times the body size; on no line that recurs at its baseline on another page), the same
 *  verdict's shape; a function of `doc` alone. As placeUnits' `frame`: `() => frameOfTokens(doc)` */
export declare function frameOfTokens(doc: readonly DocToken[]): (t: DocToken) => boolean
/** the largest a body word is set: 1.5 times the document's body size (the height most of its tokens with text have, to a tenth) */
export declare function bodyMax(doc: readonly DocToken[]): number
/** a unit's match (matchUnits): its matched tokens, coverage, bounds where it has marks, and the word → token map */
export interface UnitMatch { m: number[]; coverage: number; bounded: [number, number] | null; ws?: string[]; pairs?: Map<number, number> | null; textPairs?: Map<number, number> | null }
/** `forward` (rule 5): the indices of the units written inside a float (the source parse's `inFloat`); a float's search of the
 *  whole document then begins at the page of its last body neighbour (a unit not in it), `floatMatch` unread */
export interface MatchOptions { minCoverage?: number; bounds?: Map<string, [number, number]>; floating?: (id: number) => boolean; floatMatch?: Map<number, number[] | null> | null; forward?: ReadonlySet<number> | null }
export declare function anchorUnits(doc: DocToken[], units: UnitText[], options?: MatchOptions & { frame?: FrameRule }): Map<number, Anchor | null>
/** the units' order TeX sets them in (openPaper's `texOrder`), or null where it is their own; a TypeError where it is no order of `n` */
export declare function orderOf(texOrder: readonly number[] | null | undefined, n: number): readonly number[] | null
/** the units of `ids` (their indices) as places in `order` (null: their own) */
export declare function placesIn(ids: readonly number[], order: readonly number[] | null): Set<number>
/** every floating unit's match over the whole document (id → its tokens, or null), from the document and the words alone */
export declare function floatMatches(doc: DocToken[], units: UnitText[], floating?: (id: number) => boolean): Map<number, number[] | null>
/** anchorUnits' first half: each unit's match by the units' order (null: not found, or not in `only`) */
/** a caller's units' bounds and neighbours (matchUnits' `known`), true at least of the units matched */
export interface KnownNeighbours { hard: readonly ([number, number] | null | undefined)[]; before: ArrayLike<number>; after: ArrayLike<number>; body: ArrayLike<number> | null }
export declare function matchUnits(doc: DocToken[], units: UnitText[], options?: MatchOptions & { only?: ReadonlySet<number> | null; wholeIndex?: { index: unknown } | null; known?: KnownNeighbours | null }): (UnitMatch | null)[]
/** each page's first token: the first token of token k's page (0 for k -1): rule 5's start of a float's search, its last body
 *  neighbour's end's */
export declare function pageStarts(doc: readonly DocToken[]): (k: number) => number
/** the document's 3-grams, for a caller that keeps them (rule 5's searches a range at a time) */
export declare function buildIndexOf(doc: readonly DocToken[]): unknown
/** rule 5's reach of a float: the stretch its search of the document from token `from` on takes ([lo, hi], the pages it holds,
 *  and its first hit: the search from any token up to it takes the same), or null where it finds none */
export declare function forwardSpans(doc: readonly DocToken[], units: readonly UnitText[], floating?: (id: number) => boolean, index?: unknown): (id: number, from: number) => { lo: number; hi: number; first: number } | null
/** anchorUnits' second half, over these units and their matches */
export declare function placeUnits(doc: DocToken[], units: UnitText[], found: readonly (UnitMatch | null)[], options?: { frame?: FrameRule; only?: ReadonlySet<number> | null }): Map<number, Anchor | null>
/** where each of a unit's sentences after the first begins on the page: the page token of its first word found, rising */
export declare function sentenceStarts(anchor: Anchor | null | undefined, text: string, offsets: number[] | undefined): Int32Array | null
/** the pairs sentenceStarts reads as runs [word, token, count, …] (global tokens, word rising, maximal): only for a unit it admits, and
 *  only pairs on the unit's own tokens; null where there are none */
export declare function startRuns(anchor: Anchor | null | undefined): Int32Array | null
/** the anchor sentenceStarts reads as it reads the one startRuns came of, from the unit's entry on each of its pages in page order
 *  ({ first, ranges: [first, count, …] page-local, runs?: [word, token, count, …] page-local }); null where no page has runs */
export declare function startsAnchor(pieces: readonly { first: number; ranges: readonly number[]; runs?: readonly number[] }[]): Anchor | null
/** each token's ink across, its box widened over the marks its item sets against it (a full stop, a bracket) */
export declare function inkEdges(doc: DocToken[]): { l: Float32Array; r: Float32Array }
/** tokens → one rectangle per line: same page, baselines within half a line of each other */
export declare function lineRects(doc: DocToken[], idx: number[]): Rect[]
