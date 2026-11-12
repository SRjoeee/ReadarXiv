import { describe, expect, it } from 'vitest'
import { type Hole, PACKED_MAGIC, pack, unpack } from '../src/sparse.ts'

// B stored without its images' pixels (sparse.ts): pack keeps the bytes outside the holes behind a header that says the
// size and the holes; unpack gives the bytes back with zeros in the holes, and refuses what pack did not make. The holes
// themselves (holesOf, which reads the cross-reference) are held by tests/pdf-reader/sparse.test.ts, beside PDF.js

const bytesOf = (n: number) => Uint8Array.from({ length: n }, (_, i) => ((i * 7 + 3) & 255) | 1)
const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(at)

describe('pack and unpack', () => {
  it('keeps every byte outside the holes, gives zeros in them, and the size whole', () => {
    const b = bytesOf(100)
    const holes: Hole[] = [
      [0, 4],
      [10, 20],
      [31, 1],
      [90, 10],
    ]
    const back = unpack(pack(b, holes))
    expect(back.length).toBe(100)
    const inHole = (i: number) => holes.some(([s, l]) => i >= s && i < s + l)
    for (let i = 0; i < 100; i++) expect(back[i]).toBe(inHole(i) ? 0 : b[i])
  })

  it('writes the magic, the size, the holes, then the bytes outside them in order', () => {
    const b = bytesOf(40)
    const p = pack(b, [
      [5, 10],
      [20, 5],
    ])
    expect(new TextDecoder().decode(p.subarray(0, 8))).toBe(PACKED_MAGIC)
    expect(PACKED_MAGIC.length).toBe(8)
    expect(u32(p, 8)).toBe(40)
    expect(u32(p, 12)).toBe(2)
    expect([u32(p, 16), u32(p, 20), u32(p, 24), u32(p, 28)]).toEqual([5, 10, 20, 5])
    expect(p.length).toBe(32 + 40 - 15)
    expect(Array.from(p.subarray(32))).toEqual([...b.subarray(0, 5), ...b.subarray(15, 20), ...b.subarray(25)])
  })

  it('packs a document with no hole as its bytes whole behind the header, and an empty one', () => {
    const b = bytesOf(33)
    const p = pack(b, [])
    expect(p.length).toBe(16 + 33)
    expect(Array.from(unpack(p))).toEqual(Array.from(b))
    expect(unpack(pack(new Uint8Array(0), [])).length).toBe(0)
    // (a hole over the whole document keeps nothing but the header)
    expect(pack(b, [[0, 33]]).length).toBe(24)
    expect(Array.from(unpack(pack(b, [[0, 33]])))).toEqual(new Array(33).fill(0))
  })

  it('gives a copy: neither the bytes packed nor the pack is changed', () => {
    const b = bytesOf(20)
    const before = Array.from(b)
    const p = pack(b, [[2, 3]])
    const pBefore = Array.from(p)
    const back = unpack(p)
    back.fill(9)
    expect(Array.from(b)).toEqual(before)
    expect(Array.from(p)).toEqual(pBefore)
  })

  it('refuses holes out of order, overlapping, empty, past the end, or not whole numbers', () => {
    const b = bytesOf(50)
    const bad: Hole[][] = [
      [
        [10, 5],
        [2, 3],
      ],
      [
        [2, 5],
        [6, 3],
      ],
      [[4, 0]],
      [[45, 6]],
      [[-1, 3]],
      [[1.5, 2]],
      [[2, Number.NaN]],
    ]
    for (const holes of bad) expect(() => pack(b, holes)).toThrow(RangeError)
    // (touching holes are two holes, in order)
    expect(() =>
      pack(b, [
        [2, 3],
        [5, 1],
      ]),
    ).not.toThrow()
  })

  it('refuses to unpack what pack did not make: another magic, a header cut short, holes the size does not hold, a byte too many or too few', () => {
    const b = bytesOf(60)
    const p = pack(b, [
      [10, 10],
      [30, 5],
    ])
    const changed = (at: number, v: number) => {
      const q = p.slice()
      new DataView(q.buffer).setUint32(at, v)
      return q
    }
    const notOurs = [
      // (a PDF as it was stored before: no magic)
      b,
      p.subarray(0, 15),
      p.subarray(0, 20),
      changed(12, 3),
      changed(8, 34),
      changed(16, 40),
      changed(24, 15),
      changed(28, 0),
      p.subarray(0, p.length - 1),
      Uint8Array.from([...p, 0]),
    ]
    for (const q of notOurs) expect(() => unpack(q)).toThrow(TypeError)
    const otherMagic = p.slice()
    otherMagic[7] = 50
    expect(() => unpack(otherMagic)).toThrow(TypeError)
    expect(Array.from(unpack(p).subarray(35))).toEqual(Array.from(b.subarray(35)))
  })
})
