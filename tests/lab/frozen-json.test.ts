// @vitest-environment node
// Today's outputs written as JSON and read back as they were made (lab/frozen-json.mjs): what a structured clone keeps, a JSON
// round trip keeps through it, so that a frozen answer or reading is the one today's code gave (a NaN read back null, or a Map
// read back {}, is another). Synthetic values.
import { describe, expect, it } from 'vitest'
import { decode, encode } from '../../lab/frozen-json.mjs'

const back = (v: unknown) => decode(JSON.parse(JSON.stringify(encode(v))))

describe('frozen-json', () => {
  it('keeps NaN, the infinities, -0 and undefined (its key, in its place)', () => {
    const v = { a: Number.NaN, b: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0, 0], c: undefined, d: 'x' }
    const r = back(v) as typeof v
    expect(Object.keys(r)).toEqual(['a', 'b', 'c', 'd'])
    expect(Number.isNaN(r.a)).toBe(true)
    expect(Object.is(r.b[2], -0)).toBe(true)
    expect(Object.is(r.b[3], 0)).toBe(true)
    expect(Object.hasOwn(r, 'c')).toBe(true)
    expect(r).toEqual(v)
  })
  it('keeps a Map, a Set and a typed array, nested, their entries and order', () => {
    const v = { glyphs: [new Map([[3, 0], [1, 2]])], seen: new Set(['b', 'a']), unit: new Int32Array([-1, 4]), role: new Uint8Array([1, 0]), at: new Map([['k', { m: new Set([Number.NaN]) }]]) }
    const r = back(v) as typeof v
    expect(r.glyphs[0]).toBeInstanceOf(Map)
    expect([...(r.glyphs[0] as Map<number, number>)]).toEqual([[3, 0], [1, 2]])
    expect([...r.seen]).toEqual(['b', 'a'])
    expect(r.unit).toBeInstanceOf(Int32Array)
    expect(r.role).toBeInstanceOf(Uint8Array)
    expect(r).toEqual(v)
  })
  it('refuses what it cannot keep, and an object naming its mark', () => {
    expect(() => encode({ f: () => 1 })).toThrow(/cannot keep/)
    expect(() => encode({ n: 1n })).toThrow(/cannot keep/)
    expect(() => encode({ $axt: 'Map' })).toThrow(/names the key/)
    expect(() => decode({ $axt: 'Date' })).toThrow(/unknown kept value/)
  })
})
