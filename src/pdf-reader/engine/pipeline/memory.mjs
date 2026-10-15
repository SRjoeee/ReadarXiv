// Memory-class errors (the prepare pipeline's bundle 4 contract, C8.4): the failures that mean a paper does not fit in this
// process, as V8 and Node name them. Every catch of the engine's that would turn an error into a verdict (a refused page, a
// dropped part) lets one of these through unchanged, so that the service sees a memory failure as one and not as a defect of
// the paper. Imports nothing: the readers and the writers of the layer's format take it.

/** how many `cause`s down an error is looked at */
const CAUSES = 4
/** what a RangeError's message begins with when the heap or an array could not be had */
const RANGE_STARTS = ['Array buffer allocation failed', 'Invalid typed array length', 'Invalid array buffer length', 'Invalid string length', 'WebAssembly.Memory']
/** the codes Node gives a string or a buffer too large to build */
const CODES = ['ERR_STRING_TOO_LONG', 'ERR_BUFFER_TOO_LARGE']

/**
 * Whether `e` is a memory-class error: a RangeError whose message begins with one of V8's allocation messages, or an error
 * with code ERR_STRING_TOO_LONG or ERR_BUFFER_TOO_LARGE, or one that has such an error as its `cause`, up to 4 deep. Never
 * for `Maximum call stack size exceeded`, which is a defect of the code and not a lack of memory
 */
export function isMemoryError(e) {
  for (let depth = 0; depth <= CAUSES && typeof e === 'object' && e !== null; depth++) {
    if (e instanceof RangeError && typeof e.message === 'string' && RANGE_STARTS.some(s => e.message.startsWith(s))) return true
    if (typeof e.code === 'string' && CODES.includes(e.code)) return true
    e = e.cause
  }
  return false
}
