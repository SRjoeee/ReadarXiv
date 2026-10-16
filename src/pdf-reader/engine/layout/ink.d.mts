// ink.mjs's types (JavaScript until the engine's port), for the layout maker and its tests
/** a glyph as PDF.js's canvas places it: its character, its advance across (x0, x1) and baseline, size and the font's
 *  PostScript name (its subset tag kept: the font table strips it); `top` and `bottom` its own ink up and down, `ix0` and
 *  `ix1` across, where PDF.js gives its outline (outlineBox), else its font's declared ascent and descent and its advance */
export interface Glyph {
  u: string; x0: number; x1: number; y: number; top: number; bottom: number; size: number; font: string; ix0: number; ix1: number
  /** with `indices`: its text-showing operation's place among the page's own (-1 in an annotation's appearance), its
   *  place among that operation's glyphs, and whether its Unicode is blank */
  n?: number; k?: number; blank?: boolean
}
/** a glyph's outline box in em from its origin ([x0, y0, x1, y1], y up), [] for none drawn, null where PDF.js gives none */
export declare function outlineBox(commonObjs: unknown, font: unknown, fontChar: unknown): number[] | null
/** the operations read on a page at most */
export declare const OPS_CAP: number
/** the glyphs a page's ink holds at most where its reader asks (`glyphsMax`): past it the page is capped */
export declare const GLYPHS_PAGE: number
/** a page's operator list waited for at most, in milliseconds (the layout maker's read of arXiv's PDF, the marked original's) */
export declare const OPS_MS: number
/** a paper's pages given up on (past OPS_MS) or capped, at most: past it every later page is dark unread (both readers) */
export declare const GIVEN_UP_MAX: number
/** a promise's value, or null where it does not come within `ms` or fails */
export declare function within<T>(promise: Promise<T> | T, ms: number): Promise<T | null>
/** a page's operator list given up on (PDF.js's own cancellation); where the PDF.js has none, a warning once (`seen`) */
export declare function giveUp(page: unknown, seen: { warned: boolean; who?: string }): void
/** the boxes a page's ink holds at most, whatever its reader (an operation's many: a repeat's or a group's placements, a run of
 *  glyphs set turned): past it the page is capped; above any budget a dense page's boxes are merged under (500,000) */
export declare const BOXES_CAP: number
/** a point of the marked compile (`/axt-<name> ri`): its name, and the glyphs and boxes the page showed before it */
export interface InkPoint { name: string; glyph: number; box: number }
/** a page's glyphs and graphics boxes (images, paths: x0, y0, x1, y1) from its operator list, in stream order, every
 *  painted glyph whatever its Unicode; the marked compile's points among them, and each glyph's boxes before it; `capped`
 *  when the walk stopped at OPS_CAP, past `glyphsMax` glyphs or past BOXES_CAP boxes (within an operation too); `rotated` when the page's /Rotate is not 0 (then nothing is returned) */
export declare function pageInk(OPS: Record<string, number>, ops: { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> }, commonObjs: { get(id: string): unknown }, o: { rotate: number; indices?: boolean; outlines?: ReadonlyMap<string, number[]> | null; collect?: Map<string, number[]> | null; glyphsMax?: number }): { glyphs: Glyph[]; boxes: number[]; points: InkPoint[]; boxAt: number[]; paths?: number[]; shows?: number; capped: boolean; rotated: boolean }
/** a page's glyphs packed as columns (packGlyphs): the i-th of each the glyph `order[i]` (each in its own place where no
 *  order is given); `ix0` and `ix1` its ink across with its advance; `font` the id `fontIds` gives (-1 where none is
 *  asked); `most` the largest size */
export interface PackedGlyphs {
  n: number; x0: Float64Array; x1: Float64Array; y: Float64Array; top: Float64Array; bottom: Float64Array
  ix0: Float64Array; ix1: Float64Array; size: Float64Array; font: Int32Array; u: string[]; most: number
}
/** a column packGlyphs may keep */
export type GlyphColumn = 'x0' | 'x1' | 'y' | 'top' | 'bottom' | 'ix0' | 'ix1' | 'size' | 'font' | 'u'
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
