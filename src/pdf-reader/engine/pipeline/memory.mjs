// Memory-class errors (the prepare pipeline's bundle 4 contract, C8.4 and amendment M7): the failures that mean a paper does
// not fit in this process, as V8 and Node name them. Every catch of the engine's that would turn an error into a verdict (a
// refused page, a dropped part) lets one of these through unchanged, so that the service sees a memory failure as one and not
// as a defect of the paper. The predicate is the web's own (container/src/run/memory.ts isMemoryError), reproduced word for
// word, so that the child and the service agree on what a memory failure is. Imports nothing: the readers and the writers of
// the layer's format take it.

/** V8's words for a backing store it could not allocate */
export const ALLOCATION_FAILED = 'Array buffer allocation failed'

/**
 * Whether `e` is a failed allocation: V8's RangeError of its exact words, PDF.js's wrapping of one from its worker (pdf.mjs
 * wrapReason: an UnknownErrorException of its message and its `toString()`), or Node's own ERR_MEMORY_ALLOCATION_FAILED. A
 * length no array may have (`Invalid typed array length`, `Invalid array buffer length`, `Invalid string length`), Node's
 * ERR_STRING_TOO_LONG and ERR_BUFFER_TOO_LARGE (a bounded inflate's refusal), a stack overflow, or the words in any other
 * error are none
 */
export function isMemoryError(e) {
  if (e instanceof RangeError) return e.message === ALLOCATION_FAILED
  if (typeof e !== 'object' || e === null) return false
  if (e.code === 'ERR_MEMORY_ALLOCATION_FAILED') return true
  return e.name === 'UnknownErrorException' && e.message === ALLOCATION_FAILED && e.details === `RangeError: ${ALLOCATION_FAILED}`
}
