// removal.mjs's types: the layer's side of the text-removed PDF
import type { Glyph } from '../layout/ink.mjs'
import type { LayoutIndex, LayoutUnit } from '../layout/file.mjs'
import type { Char, Prepared } from './layer2.mjs'

export interface RemovalInk { glyphs: Glyph[]; boxes: number[]; paths: number[]; shows: number }
/** a page's ink as the remover names its glyphs and rules, each glyph its outline's box (this reading's, else `outlines`') */
export declare function inkOfPage(OPS: Record<string, number>, page: unknown, outlines?: ReadonlyMap<string, number[]> | null, collect?: Map<string, number[]> | null): Promise<RemovalInk>
/** the text layer's characters on a page carried to its glyphs, by `page|item|k` */
export declare function glyphsOfChars(chars: readonly Char[], ink: RemovalInk, page: number): Map<string, number>
/** the layout file's ownership of a page's glyphs (unit id or -1), their placeholders (source k or -1), and rules */
export interface FileOwnership { owner: Int32Array; ph: Int32Array; paths: Map<number, { id: number; k: number }>; linePaths: Map<number, number> }
export declare function fileOwnership(index: LayoutIndex, page: number, ink: RemovalInk): FileOwnership
/** what a drawn unit replaces on a page (indices into its ink), its crops' glyphs and rules there */
export declare function unitRemoval(o: {
  id: number; page: number; prep: Prepared; tex: { lu: LayoutUnit; kOf: readonly number[] } | null; own: FileOwnership
  charMap: Map<string, number>; unmapped: readonly number[]; ink: RemovalInk; claimed: Map<number, number>; fileDrawn: ReadonlySet<number>
}): { glyphs: number[]; paths: number[]; crops: { k: number; glyphs: number[]; paths: number[] }[]; taken: number; notOwned: number }
/** the page's glyphs no text-layer character is carried to */
export declare function unmappedOf(ink: RemovalInk, charMap: Map<string, number>): number[]
/** a removal as the plan names it */
export declare function planOf(ink: RemovalInk, glyphs: readonly number[], paths: readonly number[]): { glyphs: number[]; paths: number[] }
/** a plan's glyphs and rules back to indices into this reading's ink, or null for one it does not hold */
export declare function indicesOf(ink: RemovalInk, plan: { glyphs: readonly number[]; paths?: readonly number[] }): { glyphs: number[]; paths: number[] } | null
/** the paper's removal on a page from the layout file alone (the add-on's plan's page), and the ownership it was made from */
export declare function pagePlan(index: LayoutIndex, page: number, ink: RemovalInk, own?: FileOwnership): {
  units: { id: number; glyphs: number[]; paths: number[] }[]; crops: { id: number; k: number; glyphs: number[]; paths: number[] }[]
  shows: number; glyphs: number; own: FileOwnership & { label: Int32Array }
}
/** the ink the add-on keeps on a page that meets its units' rectangles (the manifest's `dirty`: x0, y0, x1, y1 stride 4) */
export declare function pageDirty(index: LayoutIndex, page: number, ink: RemovalInk, plan: { units: { glyphs: number[]; paths: number[] }[] } | undefined, pad?: number): number[]
/** the rules on a page near its table cells' lines (the manifest's `rules`: x0, y0, x1, y1 stride 4), its paths' thin boxes */
export declare function pageRules(index: LayoutIndex, page: number, ink: RemovalInk): number[]
/** a unit's drawing over the text-removed PDF from the layout file's rectangles: swapped, filled with paper, erased extra,
 *  its crops' clips; PDF units */
export declare function fileSwap(o: {
  page: number; lu: LayoutUnit; kOf: readonly number[]; lines: { rects: number[][]; lineOf: Map<number[], number>; jOf?: number[] }; prep: Prepared
  others?: number[][]; dirty?: number[][]; pad?: number
}): { swap: number[][]; fill: number[][]; extra: number[][]; clips: Map<number, { rects: number[][]; own: number[][] }>; lines: number[][] }
