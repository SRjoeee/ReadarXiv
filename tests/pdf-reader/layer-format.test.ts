// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isMemoryError } from '@readarxiv/engine'

// BUNDLE 4's format (the prepare pipeline's bundle 4 contract and its amendments): the five kinds of object, each writer
// then its reader, each reader refusing in its order, the part chain, the keys. A small paper of four pages in three parts
// (tests/pdf-reader/helpers/format-paper.ts); the six papers' real data where this machine has it (AXT_LAB)

afterEach(() => { vi.restoreAllMocks() })

// isMemoryError (bundle 4 contract C8.4, amendment M7) is the web's predicate word for word (its container's):
// this is the web's own truth table (its container's test), as the spec

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
    const node22 = Object.assign(new Error('Failed to allocate memory'), { code: 'ERR_MEMORY_ALLOCATION_FAILED' })
    expect(isMemoryError(node22)).toBe(true)
    // (Node 22's is an Error, so PDF.js's wrapping of it says `Error: Failed to allocate memory`: CodeRabbit on #531)
    expect(isMemoryError(pdfjsWrapped(node22))).toBe(true)
  })

  it('Node 24 on: Buffer.allocUnsafe\'s RangeError of Node\'s own words and code, and PDF.js\'s wrapping of it, are a failed allocation', () => {
    // (as Node 26.13 throws it under RLIMIT_DATA: `RangeError: Failed to allocate memory`, `code: 'ERR_MEMORY_ALLOCATION_FAILED'`)
    const node = Object.assign(new RangeError('Failed to allocate memory'), { code: 'ERR_MEMORY_ALLOCATION_FAILED' })
    expect(isMemoryError(node)).toBe(true)
    expect(isMemoryError(pdfjsWrapped(node))).toBe(true)
    // (its words without its code, or wrapped from another error, are none)
    expect(isMemoryError(new RangeError('Failed to allocate memory'))).toBe(false)
    expect(isMemoryError(Object.assign(new Error('Failed to allocate memory'), { name: 'UnknownErrorException', details: 'FormatError: Failed to allocate memory' }))).toBe(false)
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

// ---------------------------------------------------------------- 1. round trips

// ---------------------------------------------------------------- 5. units chunks

// ---------------------------------------------------------------- 6. the chunk cut

// ---------------------------------------------------------------- 7. head and index

// ---------------------------------------------------------------- 8. parts, against the index

// ---------------------------------------------------------------- a part's record of why it has no layout (BUNDLE 6)

// ---------------------------------------------------------------- 9. parts, against the chain

// ---------------------------------------------------------------- 12. left parts

// ---------------------------------------------------------------- 13. the catalog

// ---------------------------------------------------------------- M15. the units' records

// ---------------------------------------------------------------- 15. keys

// ---------------------------------------------------------------- 16. writers never emit what readers refuse

// ---------------------------------------------------------------- seeded hostile mutations of every kind

// ---------------------------------------------------------------- the real papers (where this machine has them)
// AXT_LAB=<a lab/pdf directory> AXT_PACK=<a gate pack of LAYOUT 6> (helpers/lab-data.ts): each paper's units (openPaper over its source), its
// layout file (the layer gate's made fixtures) and its left (the p10 cut's geometry), cut at the doubling schedule, written,
// read against the chain and merged back; the units through the chunk writer and the reader
