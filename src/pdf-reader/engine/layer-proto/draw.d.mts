// draw.mjs's types: a page's draw geometry (the E-C design note)
export declare const DRAW_ITEMS: number, DRAW_STRING: number, DRAW_STRINGS: number
export declare const DRAW_FONTS: number, DRAW_NAME: number, DRAW_FALLBACK: number, DRAW_MAPPED: number, DRAW_MAPPED_CHAR: number
export declare const DRAW_LINKS: number, DRAW_QUADS: number, DRAW_URL: number, DRAW_DEST: number, DRAW_ZOOM: number, DRAW_ARGS: number, DRAW_OVERLAID: number
export declare const DRAW_VALUES: number, DRAW_BYTES: number, DRAW_COORD: number, DRAW_HELD_MAX: number
/** [name, fallback, type3 (0 a font, 1 Type3, 2 no font object or an error font), mapped: null (no map), or the map's characters; [] = every char unmapped] */
export type DrawFont = [name: string | null, fallback: string | null, type3: 0 | 1 | 2, mapped: string[] | null]
/** [str, a, b, d, e, f (the transform's 0, 1, 3, 4, 5), width, height, font: an index into the page's fonts, or -1, fills: its
 *  characters' (layout/fills.mjs ItemFills: one fill for all, -1 none told, or runs by code point)] */
export type DrawItem = [str: string, a: number, b: number, d: number, e: number, f: number, width: number, height: number, font: number, fills: number | number[]]
/** a dest: null, a name, [0, num, gen, zoom, ...args] (page by reference) or [1, index, 0, zoom, ...args] (page by index) */
export type DrawDest = null | string | (string | number | null)[]
/** [rect, quads (8k numbers) | null, url, dest, overlaid text, border width, border style, colour] */
export type DrawLink = [rect: number[], quads: number[] | null, url: string | null, dest: DrawDest, overlaid: string | null, bw: number | null, bs: number | null, color: number[] | null]
export interface Draw { fonts: DrawFont[]; items: DrawItem[]; links: DrawLink[] }
/** a draw as the writer is given it, in PDF.js's own shapes: typed arrays for rects, quads and colours, an iterable `mapped`, a dest explicit as [{num,gen}|index, {name}, ...args] */
export interface DrawSource {
  fonts: readonly (readonly [string | null | undefined, string | null | undefined, 0 | 1 | 2, Iterable<string> | null | undefined])[]
  items: readonly (readonly [string, number, number, number, number, number, number, number, number, (number | readonly number[])?])[]
  links: readonly (readonly [ArrayLike<number>, ArrayLike<number> | null | undefined, string | null | undefined, unknown, string | null | undefined, number | null | undefined, number | null | undefined, ArrayLike<number> | null | undefined])[]
}
export declare class DrawRefusal extends Error { constructor(path: string, why: string); readonly path: string; readonly why: string }
/** a draw as received, checked (the value itself); throws DrawRefusal */
export declare function checkDraw(v: unknown, path?: string): Draw
/** a draw built from PDF.js's shapes, checked; null for any reason the reader would refuse it and for text past DRAW_BYTES (the writer sheds) */
export declare function wireOf(draw: DrawSource | Draw | null | undefined): Draw | null
/** wireOf's draw and its JSON (what a left part holds of it: format.mjs writeLeftPart `drawText`), or null */
export declare function wireText(draw: DrawSource | Draw | null | undefined, o?: { plainItems?: boolean }): { draw: Draw; text: string; bytes: number } | null
/** a font row's key by its content, in a namespace of its own */
export declare function drawFontKey(row: DrawFont): string
/** the layer's inputs back from a checked draw */
export declare function drawInputsOf(draw: Draw): {
  items: { str: string; transform: number[]; width: number; height: number; fontName: string | null }[]
  /** each item's characters' fills (layout/fills.mjs ItemFills) */
  fills: (number | number[])[]
  styles: Record<string, { fontFamily: string | null }>
  fonts: Map<string, { name: string | null; fallback: string | null; type3: 0 | 1 | 2; mapped: Set<string> | null }>
  annots: { subtype: 'Link'; rect: number[]; quadPoints: number[] | null; url: string | null; dest: unknown; overlaidText: string | null; borderStyle?: { width: number | null; style: number | null }; color: number[] | null }[]
}
