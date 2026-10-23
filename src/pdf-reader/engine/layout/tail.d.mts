// tail.mjs's types
/** a part's tail at most, raw (layer-proto/format.mjs re-exports it) */
export declare const TAIL_CAP: number
/** an object number at most (ISO 32000-1, annex C: 8,388,607): a tail's numbers past it are read as no tail */
export declare const OBJECT_MAX: number
/** the `startxref` of a PDF as the remover reads it (the last 1024 bytes); null where there is none */
export declare function startxrefOf(pdf: Uint8Array): number | null
/** the last cross-reference section of the add-on's tail: where it starts in the document (`startxref`), the section it
 *  follows (`prev`), the page tree's root it rewrote (`root`, the least number it names) and the fresh numbers (`first` to
 *  `last`); `xrefAt` is where the section begins in the tail, which `startxref` must declare (less where the tail begins) */
export interface TailLinks { startxref: number; xrefAt: number; prev: number; root: number; first: number; last: number }
/** the tail's last cross-reference section, classic or stream, read from its last 256 KiB; null where the tail ends in
 *  none, or names the root alone. Never throws */
export declare function tailLinks(tail: Uint8Array): TailLinks | null
