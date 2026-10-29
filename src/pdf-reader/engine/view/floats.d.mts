// floats.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { Layout, Run } from './highlight.mjs'

/** a box in PDF units */
export interface Box { x0: number; y0: number; x1: number; y1: number }
/** a page's paths drawn outside any form: its rules (`v` a vertical one) and its other marks */
export interface Paths { rules: (Box & { v: boolean })[]; marks: Box[] }
/** a table's cell no unit holds (numbers, a formula, one letter): its hover id (units.mjs tableCellId), its run, its tokens */
export interface Cell { id: number; run: Run; toks: number[] }
/** a float: the caption's id, its page, a figure or a table, its extent without the caption, the units it holds (cells, a
 *  drawing's text), the subcaptions it takes in (a main caption's), the caption's half leading and a table's cells no unit
 *  holds */
export interface Float { id: number; page: number; kind: 'figure' | 'table'; region: Box; members: Set<number>; parts: Set<number>; lead: number; cells: Cell[] }
/** a float's shape, in PDF units: where the pointer finds its picture or its cells (`frame` a figure's) */
export interface Shape extends Box { page: number; frame: boolean }

/** a caption of a page, for captionFor: its extent across, its first line's top and last line's foot there (NaN where on
 *  another page), its line's height and its column */
export interface CaptionBox { id: number; x0: number; x1: number; top: number; bottom: number; h: number; col: { x0: number; x1: number } }
export declare function captionFor<C extends CaptionBox>(r: Box, caps: C[]): C | null
export declare function pathsOf(ops: { fnArray: number[]; argsArray: unknown[] }, OPS: Record<string, number>): Paths
export declare function wantsFloats(layout: Layout | null | undefined, page: number): boolean
export declare function pageFloats(layout: Layout, page: number, regions?: Box[], paths?: Partial<Paths>): Float[]
export declare function floatsOn(layout: Layout | null | undefined, page: number): Float[] | undefined
export declare function floatOf(layout: Layout | null | undefined, id: number): Float | null
export declare function floatsAgree(layout: Layout | null | undefined, page: number, other: Layout | null | undefined): Float[]
export declare function floatShapes(layout: Layout, float: Float, padX: number): Shape[]
/** a table's cell no unit holds, by its hover id: its run, [] where its page's floats are not made */
export declare function cellRunsOf(layout: Layout | null | undefined, id: number): Run[]
export declare function floatHitOf<H extends { id: number }>(layout: Layout | null | undefined, page: number, x: number, y: number, padX: number, hit: H | null): H | { id: number; s: -1; run: Run } | null
