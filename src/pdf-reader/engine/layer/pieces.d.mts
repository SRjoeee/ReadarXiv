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
 *  slots carry these */
export declare function slotKs(unit: { pieces: readonly unknown[] }, slots: readonly unknown[]): number[]
/** the engine's translated pieces as TrPiece, or null where a non-text piece has no k */
export declare function trPiecesOf(pieces: readonly unknown[], kOf: (piece: unknown) => number): TrPiece[] | null
/** the text sentence offsets count in: plainTranslated's, from TrPiece (each non-text piece a space, white space
 *  collapsed, trimmed) */
export declare function trText(pieces: readonly TrPiece[]): string
