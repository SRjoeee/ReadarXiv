// highlight.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { Anchor, DocToken } from './anchors.mjs'

/** a run's row: lines merged where they overlap, and the unit's reach across them (PDF units) */
export interface Row { y0: number; y1: number; x0: number; x1: number }
/** a unit's run: one page and one column of it, its extent inside the column's text edges, its rows, the boundaries
 *  between them, and the page's half leading */
export interface Run { id: number; page: number; col: 'F' | 'L' | 'R'; x0: number; x1: number; top: number; bottom: number; lead: number; rows: Row[]; mids: number[] }
/** a side's layout (layoutOf): opaque to its callers */
export interface Layout { readonly pagesOf: Map<number, number[]> }

export declare function layoutOf(doc: DocToken[], views: number[][], anchors: Map<number, Anchor | null>, kindOf?: (id: number) => string | undefined): Layout
export declare function pageGeometry(layout: Layout, page: number): { runs: Run[]; byId: Map<number, Run[]> }
export declare function runsOf(layout: Layout | null | undefined, id: number): Run[]
export declare function blockOf(run: Run, padX: number): { page: number; x0: number; y0: number; x1: number; y1: number }
export declare function hitOf(layout: Layout | null | undefined, page: number, x: number, y: number, padX: number): { id: number; run: Run } | null
export declare function clickOf(layout: Layout | null | undefined, page: number, x: number, y: number, padX: number): { id: number; line: number; f: number } | null
