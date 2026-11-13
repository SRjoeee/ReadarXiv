// latin1 (src/tail): the engine's one reading of bytes as latin-1, which the cross-reference reader, the delta's wire and the
// remover take from the tail. Each held a copy before: String.fromCharCode.apply over each slice of 8192 bytes, three of them
// ending a slice at Math.min(length, i + 8192) (tail's, xref's, delta-wire's) and one at i + 8192 (remove's). The shared
// reading calls String.fromCharCode by Reflect.apply over each slice (the same operation by the specification, which
// TypeScript lets take a typed array where it does not let apply). Both old copies are kept here as the reference it equals.
import { describe, expect, test } from 'vitest'
import { latin1 } from '../src/tail.types.ts'

// (each copy as it was, the cast its only addition: TypeScript types apply's arguments as an array, where apply takes any
// array-like, a typed array among them)
/** tail's, xref's and delta-wire's copy */
function clampedCopy(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 8192)
    s += String.fromCharCode.apply(null, b.subarray(i, Math.min(b.length, i + 8192)) as unknown as number[])
  return s
}
/** remove's copy */
function removeCopy(u8: Uint8Array): string {
  let out = ''
  for (let k = 0; k < u8.length; k += 8192)
    out += String.fromCharCode.apply(null, u8.subarray(k, k + 8192) as unknown as number[])
  return out
}

/** `n` bytes of every value, in no order (xorshift32 from a fixed seed) */
function bytesOf(n: number): Uint8Array {
  const b = new Uint8Array(n)
  let x = 2463534242
  for (let i = 0; i < n; i++) {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    b[i] = x & 255
  }
  return b
}

describe("latin1, the engine's one reading of bytes as latin-1", () => {
  test('each byte value is the character of its code, as both copies read it', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i)
    const s = latin1(all)
    expect([...s].map((c) => c.charCodeAt(0))).toEqual([...all])
    expect(s).toBe(clampedCopy(all))
    expect(s).toBe(removeCopy(all))
  })
  test.each([0, 1, 8191, 8192, 8193, 3 * 2 ** 20 + 4099])('%i bytes read as both copies read them', (n) => {
    const b = bytesOf(n)
    const s = latin1(b)
    expect(s.length).toBe(n)
    // (compared as booleans: a difference in megabytes of text is not printed)
    expect(s === clampedCopy(b)).toBe(true)
    expect(s === removeCopy(b)).toBe(true)
    expect([...s].every((c, i) => c.charCodeAt(0) === b[i])).toBe(true)
  })
  test('a view into larger bytes, from an offset to an end inside a slice, reads its own bytes alone', () => {
    const whole = bytesOf(40_000)
    const view = whole.subarray(1234, 1234 + 2 * 8192 + 517)
    const s = latin1(view)
    expect(s.length).toBe(view.length)
    expect(s).toBe(clampedCopy(view))
    expect(s).toBe(removeCopy(view))
    expect([...s].every((c, i) => c.charCodeAt(0) === whole[1234 + i])).toBe(true)
  })
})
