/** whether two byte arrays hold the same bytes, compared a 32-bit word at a time */
export declare function equalBytes(a: Uint8Array, b: Uint8Array): boolean
/** a keyed hash of a byte array's words (the same for the same bytes at any offset): a bucket's key, never equality */
export declare function wordHash(seeds: readonly [number, number] | Uint32Array): (b: Uint8Array) => string
