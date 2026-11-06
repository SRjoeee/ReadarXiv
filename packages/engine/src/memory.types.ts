// The types of memory.mjs (today's module, moved as it is into the engine package, JavaScript until its port): what
// its declarations stated, now a TypeScript module of the package (which holds no declaration file), each value of the
// JavaScript re-exported with its type.
// @ts-ignore: JavaScript moved as it is, typed by this file alone
import * as memory_js from './memory.mjs'
/** V8's words for a backing store it could not allocate */
export const ALLOCATION_FAILED = memory_js.ALLOCATION_FAILED as 'Array buffer allocation failed'
/** whether `e` is a failed allocation: V8's RangeError of its exact words, Node's ERR_MEMORY_ALLOCATION_FAILED (an Error on Node
 *  22, a RangeError of its own words from Node 24 on), or PDF.js's UnknownErrorException wrapping of either; none of a length no
 *  array may have, a stack overflow, ERR_STRING_TOO_LONG or ERR_BUFFER_TOO_LARGE. The web's container/src/run/memory.ts
 *  isMemoryError, word for word */
export const isMemoryError = memory_js.isMemoryError as (e: unknown) => boolean
