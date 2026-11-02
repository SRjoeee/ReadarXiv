import { describe, expect, it } from 'vitest'
import { equalBytes, wordHash } from '@/pdf-reader/engine/layout/bytes.mjs'

// Byte arrays read a word at a time (layout/bytes.mjs): the delta's comparison of streams and its keyed hash, the wrap's read-back
// check. Each against a byte at a time, on arrays at every offset of their buffers, so that the same bytes are the same words
// wherever they stand

/** a seeded generator (mulberry32), so that a failure is the same run again */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
/** `bytes` placed at `offset` in a buffer of their own */
const at = (bytes: Uint8Array, offset: number) => { const buf = new Uint8Array(bytes.length + offset + 3); buf.set(bytes, offset); return buf.subarray(offset, offset + bytes.length) }
const byByte = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i])

describe('equalBytes: a word at a time, as a byte at a time says', () => {
  it('on random arrays at every offset: the same, one byte changed anywhere, cut short, of lengths 0 to 70', () => {
    const r = rng(20261102)
    for (let trial = 0; trial < 6000; trial++) {
      const n = Math.floor(r() * 71), a = Uint8Array.from({ length: n }, () => Math.floor(r() * 256))
      const b = a.slice()
      const what = r()
      if (what < 0.4 && n) { const k = Math.floor(r() * n); b[k] = (b[k] as number) ^ (1 + Math.floor(r() * 255)) }
      const other = what > 0.9 ? b.subarray(0, Math.max(0, n - 1)) : b
      const x = at(a, Math.floor(r() * 4)), y = at(other, Math.floor(r() * 4))
      expect(equalBytes(x, y)).toBe(byByte(x, y))
    }
  })
  it('two large arrays alike, then one bit apart at the end, past the last whole word, and at the start', () => {
    const a = Uint8Array.from({ length: (1 << 16) + 3 }, (_, i) => (i * 31) & 255)
    expect(equalBytes(at(a, 1), at(a, 2))).toBe(true)
    for (const k of [0, a.length - 4, a.length - 1]) { const b = a.slice(); b[k] = (b[k] as number) ^ 128; expect(equalBytes(at(a, 3), at(b, 0))).toBe(false) }
  })
})

describe('wordHash: the same bytes the same key at any offset; another seed another key', () => {
  it('the same bytes at offsets 0 to 3 hash alike, and a byte changed hashes otherwise (on these arrays)', () => {
    const r = rng(7), h = wordHash([0x12345678, 0x9abcdef0])
    for (let trial = 0; trial < 500; trial++) {
      const n = Math.floor(r() * 50), a = Uint8Array.from({ length: n }, () => Math.floor(r() * 256))
      const keys = [0, 1, 2, 3].map(o => h(at(a, o)))
      expect(new Set(keys).size).toBe(1)
      if (n) { const b = a.slice(), k = Math.floor(r() * n); b[k] = (b[k] as number) ^ 1; expect(h(b)).not.toBe(keys[0]) }
    }
  })
  it('the seeds are the key: one array, two seeds, two keys', () => {
    const a = new TextEncoder().encode('BT /F1 10 Tf (a stream) Tj ET')
    expect(wordHash([1, 2])(a)).not.toBe(wordHash([3, 4])(a))
  })
})
