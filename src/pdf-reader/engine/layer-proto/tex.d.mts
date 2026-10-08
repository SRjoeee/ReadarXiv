// tex.mjs's types: the layer's hybrid, v0's per-unit reading with its parts from the layout file where it locates a unit whole
import type { LayoutUnit } from '../layout/file.mjs'
import type { Rect } from './layer1.mjs'
import type { Char, Gap, Prepared, Unit, UnitParts } from './layer2.mjs'

/** locatedWhole's answer: whether the file locates the unit whole, why not, and each piece's source index */
export interface Whole { ok: boolean; why: 'unlocated' | 'pieces' | 'no row' | 'lost' | 'empty' | null; kOf?: number[] }
/** the unit's lines from the file as v0's rectangles, with each one's exact baseline and size and its line in the file */
export interface TexLines { rects: Rect[]; exact: Map<Rect, { baseline: number; size: number }>; lineOf: Map<Rect, number>; held: Rect[]; jOf: number[] }
/** each translated piece's source index from the units file's pieces (-1 for text), or null where they differ */
export declare function kOfPieces(unit: Unit, trPieces: readonly unknown[] | undefined): number[] | null
/** whether the file locates a unit whole: located, every placeholder v0 draws ink for found (a symbol drawn as text too
 *  only where `symbols` is 'strict'; with `held`, a LOST display its held lines cover) */
export declare function locatedWhole(lu: LayoutUnit | null, unit: Unit, trPieces: readonly unknown[] | undefined, o?: { symbols?: 'text' | 'strict'; held?: boolean }): Whole
/** the held run (its line indices) covering each inner displayed formula, by its piece index; empty where nothing pairs */
export declare function displayCover(lu: LayoutUnit, unit: Unit, kOf: readonly number[]): Map<number, number[]>
/** whether a placeholder sets no ink by the file: a text macro it holds no row for */
export declare function inklessOf(lu: LayoutUnit, kOf: readonly number[], p: { k: number; cls: string }): boolean
/** the unit's lines from the file, on the pages up to maxPage; `held` those its source does not write, kept */
export declare function texRects(lu: LayoutUnit, maxPage?: number): TexLines
/** a placeholder's rendering from its segments (stride 6): the unit's characters inside them and its ink's box */
export declare function renderingOf(segs: Float64Array, uc: readonly Char[], display: boolean): Gap | null
/** part 5 for any unit the hybrid draws: each crop cut from its placeholder's segment on its page, that segment's
 *  baseline its own; the k of a crop no segment proves (its unit stays the original's), else -1 */
export declare function cropsOf(lu: LayoutUnit | null, kOf: readonly number[] | null): (out: Prepared) => number
/** the unit's parts from the file: 'ph' its placeholders' renderings; 'lines' its lines and label too; extents 'tex' the
 *  file's erase rectangles; every use, its crops (cropsOf) */
export declare function texParts(lu: LayoutUnit, kOf: readonly number[], o: { use: 'ph' | 'lines'; lines?: TexLines | null; extents?: 'v0' | 'tex' }): UnitParts
