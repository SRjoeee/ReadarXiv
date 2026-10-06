// ink.mjs's types (JavaScript until the engine's port), for the layout maker and its tests
/** a glyph as PDF.js's canvas places it: its character, its box in the page's user space (y up), baseline, size and the
 *  font's PostScript name (its subset tag kept: the font table strips it) */
export interface Glyph { u: string; x0: number; x1: number; y: number; top: number; bottom: number; size: number; font: string }
/** the operations read on a page at most */
export declare const OPS_CAP: number
/** a point of the marked compile (`/axt-<name> ri`): its name, and the glyphs and boxes the page showed before it */
export interface InkPoint { name: string; glyph: number; box: number }
/** a page's glyphs and graphics boxes (images, paths: x0, y0, x1, y1) from its operator list, in stream order, every
 *  painted glyph whatever its Unicode; the marked compile's points among them, and each glyph's boxes before it; `capped`
 *  when the walk stopped at OPS_CAP; `rotated` when the page's /Rotate is not 0 (then nothing is returned) */
export declare function pageInk(OPS: Record<string, number>, ops: { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> }, commonObjs: { get(id: string): unknown }, o: { rotate: number }): { glyphs: Glyph[]; boxes: number[]; points: InkPoint[]; boxAt: number[]; capped: boolean; rotated: boolean }
