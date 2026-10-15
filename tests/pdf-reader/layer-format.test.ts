// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isMemoryError } from '@/pdf-reader/engine/pipeline/memory.mjs'

// isMemoryError (bundle 4 contract C8.4): its truth table. That the readers and the writers of the format let one through
// unwrapped is checked in layer-format.test.ts

const range = (message: string) => new RangeError(message)
const coded = (code: string) => Object.assign(new Error('x'), { code })

describe('isMemoryError', () => {
  it('is true for a RangeError that begins with one of V8\'s allocation messages', () => {
    for (const m of ['Array buffer allocation failed', 'Invalid typed array length: 4294967296', 'Invalid array buffer length', 'Invalid string length', 'WebAssembly.Memory(): could not allocate memory']) {
      expect(isMemoryError(range(m)), m).toBe(true)
    }
  })

  it('is true for Node\'s codes ERR_STRING_TOO_LONG and ERR_BUFFER_TOO_LARGE, whatever the class', () => {
    expect(isMemoryError(coded('ERR_STRING_TOO_LONG'))).toBe(true)
    expect(isMemoryError(coded('ERR_BUFFER_TOO_LARGE'))).toBe(true)
    expect(isMemoryError(coded('ERR_OTHER'))).toBe(false)
  })

  it('is false for the stack overflow, another RangeError, an Error with a memory message, and what is no error', () => {
    expect(isMemoryError(range('Maximum call stack size exceeded'))).toBe(false)
    expect(isMemoryError(range('Invalid count value'))).toBe(false)
    expect(isMemoryError(range('the Array buffer allocation failed'))).toBe(false)
    expect(isMemoryError(new Error('Invalid string length'))).toBe(false)
    for (const v of [null, undefined, 'Invalid string length', 7, {}, []]) expect(isMemoryError(v)).toBe(false)
  })

  it('looks at the cause, up to 4 deep, and is not undone by a cycle', () => {
    const wrap = (cause: unknown) => new Error('wrapped', { cause })
    expect(isMemoryError(wrap(range('Invalid string length')))).toBe(true)
    expect(isMemoryError(wrap(wrap(wrap(wrap(range('Invalid string length'))))))).toBe(true)
    expect(isMemoryError(wrap(wrap(wrap(wrap(wrap(range('Invalid string length')))))))).toBe(false)
    expect(isMemoryError(wrap(range('Maximum call stack size exceeded')))).toBe(false)
    const loop = new Error('loop') as Error & { cause?: unknown }
    loop.cause = loop
    expect(isMemoryError(loop)).toBe(false)
  })
})
