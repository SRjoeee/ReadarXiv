// ink.mjs's types (JavaScript until the engine's port), for the layout maker and its tests
/** a glyph as PDF.js's canvas places it: its character, its advance across (x0, x1) and baseline, size and the font's
 *  PostScript name (its subset tag kept: the font table strips it); `top` and `bottom` its own ink up and down, `ix0` and
 *  `ix1` across, where PDF.js gives its outline (outlineBox), else its font's declared ascent and descent and its advance */
export interface Glyph {
  u: string; x0: number; x1: number; y: number; top: number; bottom: number; size: number; font: string; ix0: number; ix1: number
  /** its fill colour, 0xRRGGBB (black 0), or NO_FILL for none (a pattern's, a transparent one); none given, NO_FILL */
  fill?: number
  /** a Type 3 glyph whose procedure paints its own colours (d0, a fill in it): `fill` no reading of its ink */
  ownColour?: boolean
  /** with `indices`: its text-showing operation's place among the page's own (-1 in an annotation's appearance), its
   *  place among that operation's glyphs, whether its Unicode is blank, and whether it is shown inside a form XObject */
  n?: number; k?: number; blank?: boolean; form?: boolean
}
/** a glyph's fill of no colour (a pattern's, PDF.js's transparent) */
export declare const NO_FILL: -1
/** a glyph's outline box in em from its origin ([x0, y0, x1, y1], y up), [] for none drawn, null where PDF.js gives none */
export declare function outlineBox(commonObjs: unknown, font: unknown, fontChar: unknown): number[] | null
/** the operations read on a page at most: past it the page is capped */
export declare const OPS_CAP: number
/** the glyphs a page's ink holds at most where its reader asks (`glyphsMax`): past it the page is capped */
export declare const GLYPHS_PAGE: number
/** the boxes a page's ink holds at most, whatever its reader (an operation's many: a repeat's or a group's placements, a run of
 *  glyphs set turned): past it the page is capped; above the budget a dense page's boxes are merged under (BOXES_PAGE) */
export declare const BOXES_CAP: number
/** the steps a page's walk takes at most (`stepsMax`'s default): past it the page is capped */
export declare const STEPS_MAX: number
/** the boxes a page's ink keeps one by one at most where its reader asks (`boxesMax`): past it the page is degraded */
export declare const BOXES_PAGE: number
/** the walk's backstop, in milliseconds (`msMax`'s default): past it the page is timed out */
export declare const INK_MS: number
/** the graphics state's levels that hold a copy at most: past it a level holds none, and ink placed in a state a restore
 *  past it could not give back caps the page */
export declare const STACK_MAX: number
/** a merged box's kind in `paths` (a degraded page's): no path of the page's own */
export declare const MERGED: number
/** a point of the marked compile (`/axt-<name> ri`): its name, and the glyphs and boxes the page showed before it */
export interface InkPoint { name: string; glyph: number; box: number }
/** a page's glyphs and graphics boxes (images, paths: x0, y0, x1, y1) from its operator list, in stream order, every
 *  painted glyph whatever its Unicode; the marked compile's points among them, and each glyph's boxes before it; `capped`
 *  when the walk stopped at OPS_CAP, `stepsMax`, a state lost past STACK_MAX, `glyphsMax` or BOXES_CAP, `timedOut` when it stopped past `msMax`
 *  (INK_MS); `degraded` when the boxes past `boxesMax` were merged by the grid's cells (after the others, from `mergedAt`,
 *  each MERGED in `paths`); `rotated` when the page's /Rotate is not 0 (then nothing is returned) */
/** a paragraph's point (`q<n>`), kept apart from the marks' points */
export declare const PARA_POINT: RegExp
export declare function pageInk(OPS: Record<string, number>, ops: { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> }, commonObjs: { get(id: string): unknown }, o: { rotate: number; indices?: boolean; outlines?: ReadonlyMap<string, number[]> | null; collect?: Map<string, number[]> | null; glyphsMax?: number; boxesMax?: number; stepsMax?: number; msMax?: number; glyphsOnly?: boolean; turned?: boolean }): { glyphs: Glyph[]; boxes: number[]; points: InkPoint[]; boxAt: number[]; paras: InkPoint[]; paths?: number[]; shows?: number; turned?: TurnedGlyph[]; shapes?: Map<number, Shape>; pictures?: InkPoint[]; figures?: Map<string, [number, number, number, number]>; capped: boolean; timedOut: boolean; degraded: boolean; mergedAt: number | null; rotated: boolean }
/** a glyph set turned (pageInk's `turned`): its baseline from its origin to its advance's end, its direction, its size, its
 *  font's band in em, its own ink up and down from its baseline in em (`up`, `down`: its outline's, else its font's band), its
 *  box's index (-1 for none), the level glyphs and the pictures' points before it; `clipped` where its own ink (its outline,
 *  else its font's band, across its advance) is not wholly inside the clip in force */
export interface TurnedGlyph { u: string; n: number; k: number; ox: number; oy: number; ex: number; ey: number; ux: number; uy: number; size: number; ascent: number; descent: number; up: number; down: number; font: string; fill: number; box: number; at: number; pt: number; blank?: true; form?: true; clipped?: true; fid?: number; pid?: number }
/** a figure's painted path as its lines (pageInk's `turned`): its segments on the page (x0, y0, x1, y1 stride 4), whether it strokes
 *  and fills, its half line width on the page */
export interface Shape { segs: Float32Array; stroke: boolean; fill: boolean; hw: number }
/** a TikZ picture's points (marks.mjs POINTS_TEX) */
export declare const PICTURE_START: 'zs'
export declare const PICTURE_END: 'ze'
/** why a page's ink is not read whole: nothing read, past a cap, past the walk's backstop; null where it is read whole */
export type Unread = 'rotated' | 'capped' | 'timedOut'
export declare function unreadOf(ink: { rotated?: boolean; capped?: boolean; timedOut?: boolean } | null | undefined): Unread | null
/** a page's glyphs packed as columns (packGlyphs): the i-th of each the glyph `order[i]` (each in its own place where no
 *  order is given); `ix0` and `ix1` its ink across with its advance; `font` the id `fontIds` gives (-1 where none is
 *  asked); `most` the largest size */
export interface PackedGlyphs {
  n: number; x0: Float64Array; x1: Float64Array; y: Float64Array; top: Float64Array; bottom: Float64Array
  ix0: Float64Array; ix1: Float64Array; size: Float64Array; font: Int32Array; u: string[]; fill: Int32Array; most: number
}
/** a column packGlyphs may keep */
export type GlyphColumn = 'x0' | 'x1' | 'y' | 'top' | 'bottom' | 'ix0' | 'ix1' | 'size' | 'font' | 'u' | 'fill'
/** every column packGlyphs may keep, its default */
export declare const GLYPH_COLUMNS: readonly GlyphColumn[]
type PackOptions = { order?: readonly number[] | null; fontIds?: ((font: string) => number) | null }
/** pageInk's glyphs as the columns a reading keeps past its page: every column, or those asked for */
export declare function packGlyphs(glyphs: readonly Glyph[], o?: PackOptions & { columns?: undefined }): PackedGlyphs
export declare function packGlyphs<K extends GlyphColumn>(glyphs: readonly Glyph[], o: PackOptions & { columns: readonly K[] }): Pick<PackedGlyphs, 'n' | 'most' | K>
/** a glyph's key in an outline table: its font's PostScript name, its character and its advance */
export declare function outlineKey(font: unknown, fontId: string, g: { fontChar?: unknown; unicode?: unknown; width?: unknown }): string
/** the outline boxes collected (pageInk's `collect`) as the reader is sent them, in thousandths of an em, by font */
export declare function outlineTable(collected: ReadonlyMap<string, number[]>): Record<string, (string | number)[]>
/** an outline table back to the Map pageInk's `outlines` takes */
export declare function readOutlines(table: Record<string, (string | number)[]> | null | undefined): Map<string, number[]>
