// pieces.mjs's types: a translated unit's pieces as the layer takes them (spec §4.3)
/** a translated unit's pieces as the layer takes them (spec §4.3): text as the compiled PDF shows it; a placeholder by its
 *  source piece index; a group's open with its style's flags; a group's close */
export type TrPiece = [0, text: string] | [1, k: number] | [2, k: number, style: number] | [3, k: number]
/** the style flags of a group's open (and of a switch, with SWITCH) */
export declare const STYLE: { readonly BOLD: 1; readonly ITALIC: 2; readonly EMPH: 4; readonly UPRIGHT: 8; readonly MONO: 16; readonly SANS: 32; readonly SERIF: 64; readonly CAPS: 128; readonly MEDIUM: 256; readonly NORMAL: 512; readonly SWITCH: 1024 }
/** a colour's index + 1 is held in the bits from COLOUR_SHIFT up; 0 is no colour */
export declare const COLOUR_SHIFT: 11
/** the closed colour table (the web's EARLY_COLOURS, in its order) */
export declare const LAYER_COLOURS: readonly string[]
/** the flags a source command sets: an open's source (`\textbf{`, `{\bf `) or a switch's (`\bfseries`) */
export declare function styleOf(src: string): number
/** each translated piece's source index: the same object's index in `source`; else (a piece read from JSON) the first
 *  unused source piece of the same t, src and id; -1 where none */
export declare function kOfSource(source: readonly unknown[]): (piece: unknown) => number
/** each slot's index in its unit's pieces (`slots`: mt.mjs serialize(unit).slots, which the caller makes): the early's
 *  slots carry these. A run's slot (`{ t: 'run', pieces }`, one marker for a formula split across inline formulas) has
 *  the indices of all its pieces in their order, formulas and the text between them; an edge's (`{ t: 'edge', pieces }`,
 *  a kept pair's open or close with what went on no wire beside it) its pieces' indices; -1 where a slot is none of the unit's */
export declare function slotKs(unit: { pieces: readonly unknown[] }, slots: readonly unknown[]): (number | number[])[]
/** the engine's translated pieces as TrPiece, or null where a non-text piece has no k */
export declare function trPiecesOf(pieces: readonly unknown[], kOf: (piece: unknown) => number): TrPiece[] | null
/** the text sentence offsets count in: plainTranslated's, from TrPiece (each non-text piece a space, white space
 *  collapsed, trimmed) */
export declare function trText(pieces: readonly TrPiece[]): string

/** mt.mjs shown: a text piece as the compiled PDF shows it, a translation's TeX escapes undone, a source's bytes as UTF-8 */
export declare function shown(p: { s: string; tr?: boolean }): string
/** a text piece as the layer draws it: a translation's TeX escapes undone, each its own character; a source's text as it is */
export declare function drawnText(p: { s: string; tr?: boolean }): string
