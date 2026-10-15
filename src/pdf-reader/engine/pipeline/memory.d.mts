// memory.mjs's types
/** whether `e` is a memory-class error: a RangeError of V8's allocation messages (`Array buffer allocation failed`, `Invalid
 *  typed array length`, `Invalid array buffer length`, `Invalid string length`, `WebAssembly.Memory`), an error coded
 *  ERR_STRING_TOO_LONG or ERR_BUFFER_TOO_LARGE, or one with such an error as its `cause`, up to 4 deep; never a stack overflow */
export declare function isMemoryError(e: unknown): boolean
