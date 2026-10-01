// highlight.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { Anchor, DocToken } from './anchors.mjs'

/** a run's row: lines merged where they overlap, and the unit's reach across them (PDF units); lo, hi: its glyphs' */
export interface Row { y0: number; y1: number; x0: number; x1: number; lo: number; hi: number; r0: number | null; r1: number | null }
/** a unit's run: one page and one column of it, its extent inside the column's text edges, its rows, the boundaries
 *  between them, and the page's half leading; its tokens, the row each is on, and where the unit's head begins on it */
export interface Run { id: number; page: number; col: 'F' | 'L' | 'R'; x0: number; x1: number; top: number; bottom: number; hi: number; lo: number; lead: number; rows: Row[]; mids: number[]; toks: number[]; rowOf: number[]; head: number | null; sx0: number; sx1: number }
/** a side's layout (layoutOf): opaque to its callers */
export interface Layout { readonly pagesOf: Map<number, number[]> }

/** whether a kind of unit may light by sentence: running text */
export declare function bySentence(kind: string | undefined): boolean
export declare function layoutOf(doc: DocToken[], views: number[][], anchors: Map<number, Anchor | null>, kindOf?: (id: number) => string | undefined): Layout
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
/** a page's sentences worked out, each run's whose unit's starts `startsOf` gives */
export declare function pageSentences(layout: Layout, page: number, startsOf: (id: number) => Int32Array | null | undefined): void
/** one rounded outline of rectangles stacked from the top (CSS px, y down), as an SVG path */
export declare function shapePath(rects: { x0: number; x1: number; y0: number; y1: number }[], radius: number): string
export declare function clickOf(layout: Layout | null | undefined, page: number, x: number, y: number, padX: number): { id: number; line: number; f: number } | null
