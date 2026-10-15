// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isMemoryError } from '@/pdf-reader/engine/pipeline/memory.mjs'

// isMemoryError (bundle 4 contract C8.4, amendment M7) is the web's predicate word for word (container/src/run/memory.ts):
// this is the web's own truth table (container/tests/memory.test.ts), as the spec

/** a real failed allocation, as V8 throws it */
function failedAllocation(): unknown {
  try { void new ArrayBuffer(2 ** 50) } catch (e) { return e }
  throw new Error('this machine gave a 1 PiB ArrayBuffer')
}
/** a failed allocation as PDF.js hands it over from its worker (pdf.mjs wrapReason: an UnknownErrorException of its words) */
const pdfjsWrapped = (e: Error) => Object.assign(new Error(e.message), { name: 'UnknownErrorException', details: e.toString() })

describe('isMemoryError (the web\'s truth table)', () => {
  it('V8\'s own RangeError, PDF.js\'s wrapping of it, and Node\'s ERR_MEMORY_ALLOCATION_FAILED are a failed allocation', () => {
    const real = failedAllocation()
    expect(real).toBeInstanceOf(RangeError)
    expect(isMemoryError(real)).toBe(true)
    expect(isMemoryError(pdfjsWrapped(real as Error))).toBe(true)
    expect(isMemoryError(Object.assign(new Error('Failed to allocate memory'), { code: 'ERR_MEMORY_ALLOCATION_FAILED' }))).toBe(true)
  })

  it('nothing else is: a stack overflow, a length no array may have, the words without V8\'s error, PDF.js\'s other failures', () => {
    let overflow: unknown
    const deep = (n: number): number => deep(n + 1) + 1
    try { deep(0) } catch (e) { overflow = e }
    let length: unknown
    try { void new Uint8Array(-1) } catch (e) { length = e }
    const not = [
      overflow, length, new RangeError('Array buffer allocation failed, said a PDF'), new Error('Array buffer allocation failed'),
      Object.assign(new Error('Array buffer allocation failed'), { name: 'UnknownErrorException', details: 'FormatError: Array buffer allocation failed' }),
      Object.assign(new Error('Invalid PDF structure.'), { name: 'InvalidPDFException' }), null, 'Array buffer allocation failed', undefined,
      // (amendment M7: these are a bounded inflate's or a length's refusal, not the process's memory)
      new RangeError('Invalid typed array length: 4294967296'), new RangeError('Invalid array buffer length'), new RangeError('Invalid string length'),
      Object.assign(new Error('x'), { code: 'ERR_STRING_TOO_LONG' }), Object.assign(new Error('x'), { code: 'ERR_BUFFER_TOO_LARGE' }),
    ]
    for (const e of not) expect(isMemoryError(e), String((e as Error)?.message ?? e)).toBe(false)
  })
})
