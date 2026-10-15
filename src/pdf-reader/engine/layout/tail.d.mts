// tail.mjs's types
/** the `startxref` of a PDF as the remover reads it (the last 1024 bytes); null where there is none */
export declare function startxrefOf(pdf: Uint8Array): number | null
/** the last cross-reference section of the add-on's tail: where it starts in the document (`startxref`), the section it
 *  follows (`prev`), the page tree's root it rewrote (`root`, the least number it names) and the fresh numbers (`first` to
 *  `last`) */
export interface TailLinks { startxref: number; prev: number; root: number; first: number; last: number }
/** the tail's last cross-reference section, classic or stream, read from its last 256 KiB; null where the tail ends in
 *  none, or names the root alone. Never throws */
export declare function tailLinks(tail: Uint8Array): TailLinks | null
