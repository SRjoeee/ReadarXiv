// tail.mjs's types
/** an object number at most (ISO 32000-1, annex C: 8,388,607) */
export declare const OBJECT_MAX: number
/** the `startxref` of a PDF (the last 1024 bytes); null where there is none */
export declare function startxrefOf(pdf: Uint8Array): number | null
