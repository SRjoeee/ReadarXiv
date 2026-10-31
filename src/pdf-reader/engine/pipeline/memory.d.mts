// memory.mjs's types
/** V8's words for a backing store it could not allocate */
export declare const ALLOCATION_FAILED: 'Array buffer allocation failed'
/** whether `e` is a failed allocation: V8's RangeError of its exact words, Node's ERR_MEMORY_ALLOCATION_FAILED (an Error on Node
 *  22, a RangeError of its own words from Node 24 on), or PDF.js's UnknownErrorException wrapping of either; none of a length no
 *  array may have, a stack overflow, ERR_STRING_TOO_LONG or ERR_BUFFER_TOO_LARGE. The web's container/src/run/memory.ts
 *  isMemoryError, word for word */
export declare function isMemoryError(e: unknown): boolean
