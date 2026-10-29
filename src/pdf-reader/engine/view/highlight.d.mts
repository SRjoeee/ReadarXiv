// highlight.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { UnitWire } from '../layer-proto/bundle.mjs'
import type { Anchor, DocToken } from '../pipeline/anchors.mjs'

/** a run's row: lines merged where they overlap, and the unit's reach across them (PDF units); lo, hi: its glyphs' */
export interface Row { y0: number; y1: number; x0: number; x1: number; lo: number; hi: number; r0: number | null; r1: number | null }
/** a unit's run: one page and one column of it, its extent inside the column's text edges, its rows, the boundaries
 *  between them, and the page's half leading; its tokens, the row each is on, and where the unit's head begins on it */
export interface Run { id: number; page: number; col: 'F' | 'L' | 'R'; x0: number; x1: number; top: number; bottom: number; hi: number; lo: number; lead: number; rows: Row[]; mids: number[]; toks: number[]; rowOf: number[]; head: number | null; sx0: number; sx1: number }
/** a side's layout (layoutOf): opaque to its callers */
export interface Layout { readonly pagesOf: Map<number, number[]> }

/** whether a kind of unit may light by sentence: running text and captions (a heading, a cell, a drawing's text whole) */
export declare function bySentence(kind: string | undefined): boolean
/** the kinds of a drawing's text, which no layout holds (only where it stands, its `drawings`): none lights */
export declare const DRAWING: ReadonlySet<string>
/** a table's cell no unit holds as a run of its own: its words' box, one row */
export declare function cellRunOf(id: number, page: number, col: Run['col'], box: { x0: number; y0: number; x1: number; y1: number; lo: number; hi: number }, lead: number): Run
/** each page's columns by a rule (pageColumns, today's: from the located units' lines; columnsOfTokens': the text's alone), [null,
 *  page 1, …]; layoutOf reads a rule given for the far push alone */
export type ColumnRule = (views: number[][], anchors: Map<number, Anchor | null>, kindOf?: (id: number) => string | undefined) => unknown[]
export declare const pageColumns: ColumnRule
/** each page's columns from the side's tokens alone (rule 4 of the page stream, made at step T): pageColumns' arithmetic over the
 *  text's lines — the tokens inside the frame (`inFrame`, anchors.mjs frameOfTokens' by default), cut also at a space wider than
 *  the taller token, kept with 4 body words and 60 % of their tokens body words — the columns by a vote; the same structure; a
 *  function of `doc` and `views` alone. As layoutOf's `columns` (the far push alone): `() => columnsOfTokens(doc, views)` */
export declare function columnsOfTokens(doc: readonly DocToken[], views: readonly (readonly number[] | null)[], inFrame?: (t: DocToken) => boolean): unknown[]
export declare function layoutOf(doc: DocToken[], views: number[][], anchors: Map<number, Anchor | null>, kindOf?: (id: number) => string | undefined, o?: { edges?: { l: ArrayLike<number>; r: ArrayLike<number> } | null; columns?: ColumnRule | null }): Layout
/** a page's tokens as a layout keeps them (format.mjs ReadLeftPart's table): ink across, baseline, size, the glyphs' top and foot */
export interface PageTable { n: number; l: Float32Array; r: Float32Array; y: Float32Array; h: Float32Array; top: Float32Array; bottom: Float32Array }
/** what the document part reads of a part (format.mjs ReadPart): its pages, the views of pages from its first (stride 4)
 *  and its units, their line rectangles; `quiet` units told by where the layout lays them, no part of the pages' columns */
export interface PartRects { readonly pages: readonly [number, number]; readonly views: readonly number[]; readonly left: readonly UnitWire[]; readonly quiet?: boolean }
/** a side's layout made page by page: empty until told (layoutParts, layoutPage) */
export declare function pageLayout(kindOf?: (id: number) => string | undefined): Layout
/** the document part made again with these parts' views and units, every page's geometry let go; false where they told
 *  nothing new, every page's geometry kept */
export declare function layoutParts(layout: Layout, parts: readonly PartRects[]): boolean
/** a page's part: its tokens, ids from `first`, and each unit's tokens there; false where it was given already; a
 *  RangeError where its ids reach into another page's */
export declare function layoutPage(layout: Layout, page: number, part: { first: number; table: PageTable; spans: readonly (readonly [number, ArrayLike<number>])[] }): boolean
/** units' tokens on a page given already: a unit told after its page came; false where the page is not in */
export declare function layoutSpans(layout: Layout, page: number, spans: readonly (readonly [number, ArrayLike<number>])[]): boolean
/** a unit's stream (its first token) told again where its pages bring it (the right's laid pages); false where the unit is
 *  not told or its stream is that already */
export declare function layoutStream(layout: Layout, id: number, stream: number): boolean
/** whether a unit's tokens are all in its layout (always for one made whole): its sentences wait for it */
export declare function tokensIn(layout: Layout | null | undefined, id: number): boolean
/** a page's runs; the units whose head it took and the words it filled in (for the gate) */
export declare function pageGeometry(layout: Layout, page: number): { runs: Run[]; byId: Map<number, Run[]>; heads: number[]; filled: number }
export declare function runsOf(layout: Layout | null | undefined, id: number): Run[]
export declare function blockOf(run: Run, padX: number): { page: number; x0: number; y0: number; x1: number; y1: number }
/** what a point lights: a unit and its run, and the sentence whose shape holds it (`s`, -1 for the whole unit) where
 *  `startsOf(id)` gives the unit's sentences' starts on both sides */
export declare function hitOf(layout: Layout | null | undefined, page: number, x: number, y: number, padX: number, startsOf?: (id: number) => Int32Array | null | undefined): { id: number; run: Run; s: number } | null
/** what sentence `s` of a run's unit paints in the run: a rectangle per row, rows of the same reach as one (PDF units) */
export declare function sentenceOf(layout: Layout, run: Run, starts: Int32Array, s: number, padX: number): { page: number; x0: number; x1: number; y0: number; y1: number }[]
/** whether a unit is lit by sentence on a side: running text, every run's shapes holding their words; `made`: from the
 *  pages whose geometry is made alone, undefined where one is not yet */
export declare function sentencesFit(layout: Layout, id: number, starts: Int32Array, made?: boolean): boolean | undefined
/** starts that know each token's sentence by the text (`of(token)`: a sentence, or -1 where the text does not tell): a run's
 *  sentences take it from there, the stream's order only for the rest; the starts given back, unchanged */
export declare function withSentences<T extends Int32Array | null | undefined>(starts: T, of: (token: number) => number): T
/** a page's sentences worked out, each run's whose unit's starts `startsOf` gives */
export declare function pageSentences(layout: Layout, page: number, startsOf: (id: number) => Int32Array | null | undefined): void
/** one rounded outline of rectangles stacked from the top (CSS px, y down), as an SVG path */
export declare function shapePath(rects: { x0: number; x1: number; y0: number; y1: number }[], radius: number): string
export declare function clickOf(layout: Layout | null | undefined, page: number, x: number, y: number, padX: number, startsOf?: (id: number) => Int32Array | null | undefined): { id: number; line: number; f: number } | null
