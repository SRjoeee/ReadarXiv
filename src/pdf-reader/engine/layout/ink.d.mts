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
/** a point of the marked compile (`/axt-<name> ri`): its name, and the glyphs and boxes the page showed before it */
export interface InkPoint { name: string; glyph: number; box: number }
/** a page's glyphs and graphics boxes (images, paths: x0, y0, x1, y1) from its operator list, in stream order, every
 *  painted glyph whatever its Unicode; the marked compile's points among them, and each glyph's boxes before it; `capped`
 *  when the walk stopped at OPS_CAP; `rotated` when the page's /Rotate is not 0 (then nothing is returned) */
export declare function pageInk(OPS: Record<string, number>, ops: { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> }, commonObjs: { get(id: string): unknown }, o: { rotate: number; indices?: boolean }): { glyphs: Glyph[]; boxes: number[]; points: InkPoint[]; boxAt: number[]; paths?: number[]; shows?: number; capped: boolean; rotated: boolean }
