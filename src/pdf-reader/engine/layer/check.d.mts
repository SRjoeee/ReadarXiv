// check.mjs's types: the layer's completeness checker, for the gate and its test only (the reader never loads it)
import type { LayoutIndex } from '../layout/file.mjs'
import type { Laid, Tr } from './fit.mjs'

/** ink is a luminance below this (0-255, over white) */
export declare const INK: number
/** paper is a luminance of this or more */
export declare const PAPER: number
/** a region of the original's ink the layer's copy no longer shows: its page, box (device px: x0, y0, x1, y1, the end
 *  exclusive) and pixels */
export interface Lost { page: number; box: [number, number, number, number]; px: number }
/**
 * Lost ink: pixels that are ink in `orig` and paper in `copy` (the copy erased and its crops drawn, before the text), and
 * that no laid unit accounts for (`accounted`, 1 where a drawn unit's own source glyph boxes are: the ink its translation
 * replaces); each region of them (8-connected) of more than `min` pixels, the largest first. `orig` and `copy` are RGBA,
 * `w` × `h`; `page` is written into each region (0 where not given)
 */
export declare function lostInk(o: { w: number; h: number; orig: Uint8ClampedArray; copy: Uint8ClampedArray; accounted: Uint8Array; min: number; page?: number }): Lost[]
/**
 * The data-level checks of spec §5 over a page's laid units (the unfit ones are not drawn and are passed over):
 * - `missing`, `twice`: the k of each visible placeholder (a row neither EMPTY nor LOST) of a drawn unit whose first
 *   segment is on the page, drawn not once (as a crop on its own page, as page text, or kept), one entry each;
 * - `brackets`: the k of each placeholder drawn on the page whose rendering's own bracket the drawn text beside it
 *   repeats ('[' before a '[3]', ')' after an '(…)'), one entry each;
 * - `duplicated`: the unit's id for each run of Latin letters, digits or crops drawn twice in a row on the page (in the
 *   unit's drawn order) more often than the translation itself writes it, one entry each;
 * - `numbers`: the numbered displays (equation numbers) of every located unit on the page, and those shown once: kept in
 *   place, met by no drawn unit's erase and drawn by none;
 * - `clipped`: the characters a drawn unit sets on the page beyond its line's slot by more than half an em, or off the
 *   page's view.
 */
export declare function checkPage(file: LayoutIndex, page: number, laid: readonly Laid[], tr: ReadonlyMap<number, Tr>): { missing: number[]; twice: number[]; brackets: number[]; duplicated: number[]; numbers: { shown: number; total: number }; clipped: number }
