// mt.mjs's types (JavaScript until the engine's port), for the reader's tests
type Piece = { t: string; s?: string; src?: string; tr?: boolean; id?: number }
/** a unit's plain text in the source, placeholders dropped */
export declare function plainSource(u: { pieces: Piece[] }): string
/** a unit's plain text in its translation, as the compiled PDF shows it */
export declare function plainTranslated(pieces: Piece[]): string
/** a unit's plain text (the translation's where the pieces are translated) and the offsets in it where a placeholder stood */
export declare function unitText(pieces: Piece[]): { text: string; gaps?: number[] }
/** a unit → the wire text of the markers format, and the table from marker id back to the original piece */
export declare function serialize(u: { pieces: Piece[] }): { wire: string; slots: Piece[]; lead: string; trail: string }
