import { afterEach, describe, expect, it, vi } from 'vitest'
import { boundedJson, checkKeys, checkViews, countValues, LayoutRefusal, utf8Strict } from '@/pdf-reader/engine/layout/json.mjs'

// What both of the layout's parsers share: the values of a JSON text counted before it is parsed, and UTF-8 refused when
// malformed. The parsers' own bounds are tested with them (layout-marks.test.ts, layout-file.test.ts)

/** a small seeded generator, so that a failure is the same failure again */
function random(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const STRING_PARTS = ['a', 'quote "', 'back \\ slash', '\\"', '"\\', '\n', 'é', '\u{1f600}', '{[,:]}', 'true', '-1e5', ' ', '']
function value(r: () => number, depth: number): unknown {
  const k = Math.floor(r() * (depth > 3 ? 6 : 8))
  switch (k) {
    case 0: return null
    case 1: return r() < 0.5
    case 2: {
      // signs, fractions and exponents, as JSON.stringify writes them
      const forms = [0, -0, 7, -42, 3.25, -0.001, 1e21, -2.5e-7, 123456789, 1.5e300, -9.75e-300]
      return (forms[Math.floor(r() * forms.length)] ?? 0) * (r() < 0.5 ? 1 : -1)
    }
    case 3: case 4: case 5: return Array.from({ length: Math.floor(r() * 4) }, () => STRING_PARTS[Math.floor(r() * STRING_PARTS.length)]).join('')
    case 6: return Array.from({ length: Math.floor(r() * 5) }, () => value(r, depth + 1))
    default: return Object.fromEntries(Array.from({ length: Math.floor(r() * 5) }, (_, i) => [`${STRING_PARTS[Math.floor(r() * STRING_PARTS.length)]}${i}`, value(r, depth + 1)]))
  }
}
/** the nodes JSON.parse builds, a key counted as the string it is */
const walk = (v: unknown): number => {
  if (Array.isArray(v)) return 1 + v.reduce((n: number, x) => n + walk(x), 0)
  if (v !== null && typeof v === 'object') return 1 + Object.entries(v).reduce((n, [, x]) => n + 1 + walk(x), 0)
  return 1
}

afterEach(() => { vi.restoreAllMocks() })

describe('countValues', () => {
  it('countValues is the count JSON.parse makes', () => {
    const r = random(290)
    for (let i = 0; i < 200; i++) {
      const v = value(r, 0)
      for (const text of [JSON.stringify(v), JSON.stringify(v, null, 2)]) expect(countValues(text), text).toBe(walk(JSON.parse(text)))
    }
    // every kind of value at the top level, alone
    for (const text of ['null', 'true', 'false', '0', '-12.5e+3', '"x\\"y\\\\"', '[]', '{}']) expect(countValues(text), text).toBe(1)
  })
  it('countValues stops past max', () => {
    const text = `[${Array.from({ length: 1_000_000 }, (_, i) => i % 10).join(',')}]`
    const spy = vi.spyOn(String.prototype, 'charCodeAt')
    const n = countValues(text, 100)
    const calls = spy.mock.calls.length
    spy.mockRestore()
    expect(n).toBe(101)
    expect(calls).toBeLessThan(2000)
    expect(countValues(text)).toBe(1_000_001)
  })
  it('countValues refuses past maxDepth in the same pass, and never counts a bracket in a string', () => {
    expect(countValues('[[[]]]', Infinity, 3)).toBe(3)
    expect(countValues('[[[]],[[]],{"a":[]}]', Infinity, 3)).toBe(8)
    expect(countValues('{"a":[{"b":"[[[{{"}]}', Infinity, 3)).toBe(6)
    for (const text of ['[[[[]]]]', '{"a":[{"b":[]}]}', '[[],[[[0]]]]']) expect(() => countValues(text, Infinity, 3), text).toThrow(new LayoutRefusal('', 'nested more than 3 deep'))
    // given up at the first bracket past it
    const deep = '['.repeat(1_000_000)
    const spy = vi.spyOn(String.prototype, 'charCodeAt')
    expect(() => countValues(deep, Infinity, 3)).toThrow(LayoutRefusal)
    const calls = spy.mock.calls.length
    spy.mockRestore()
    expect(calls).toBe(4)
  })
})

describe('utf8Strict', () => {
  it('utf8Strict refuses malformed bytes', () => {
    expect(() => utf8Strict(new Uint8Array([0xc3, 0x28]))).toThrow(LayoutRefusal)
    for (const bad of [[0xff], [0xe2, 0x82], [0xed, 0xa0, 0x80], [0xc0, 0xaf]]) expect(() => utf8Strict(new Uint8Array(bad))).toThrow(LayoutRefusal)
    const text = 'plain, café, \u{1f600}, —'
    expect(utf8Strict(new TextEncoder().encode(text))).toBe(text)
  })
})

describe('boundedJson and checkViews', () => {
  it('refuses in order: bytes before decoding, UTF-8 before counting, values and nesting before JSON.parse', () => {
    const decode = vi.spyOn(TextDecoder.prototype, 'decode')
    expect(() => boundedJson(new Uint8Array(11), { cap: 10, values: 5 })).toThrow(/more than 10/)
    expect(decode).not.toHaveBeenCalled()
    const parse = vi.spyOn(JSON, 'parse')
    expect(() => boundedJson(new TextEncoder().encode('[1,2,3,4,5]'), { cap: 100, values: 5 })).toThrow(/more than 5 values/)
    expect(parse).not.toHaveBeenCalled()
    expect(() => boundedJson(new Uint8Array([0x5b, 0xc3, 0x28, 0x5d]), { cap: 100, values: 5 })).toThrow(/UTF-8/)
    expect(() => boundedJson(new TextEncoder().encode('[1,'), { cap: 100, values: 5 })).toThrow(/not JSON/)
    expect(boundedJson(new TextEncoder().encode('[1,2,3,4]'), { cap: 100, values: 5 })).toEqual([1, 2, 3, 4])
    // and nesting before JSON.parse
    parse.mockClear()
    expect(() => boundedJson(new TextEncoder().encode('[[1]]'), { cap: 100, values: 5, depth: 1 })).toThrow(/^nested more than 1 deep$/)
    expect(parse).not.toHaveBeenCalled()
    expect(boundedJson(new TextEncoder().encode('[[1]]'), { cap: 100, values: 5, depth: 2 })).toEqual([[1]])
  })
  it('tells a key of no schema by its first 20 code units, never a newline or a bidi control', () => {
    // a file made from a paper names its own keys: one of 100,000 code units, a line break and U+202E among them
    const key = `\n\u202e${'x'.repeat(100_000)}`
    let refusal: LayoutRefusal | null = null
    try { checkKeys({ a: 1, [key]: 2 }, ['a'], 'top') } catch (e) { refusal = e as LayoutRefusal }
    expect(refusal).toBeInstanceOf(LayoutRefusal)
    const said = `${refusal?.path} ${refusal?.message}`
    expect(refusal?.path.length).toBeLessThanOrEqual(4 + 40)
    expect(refusal?.message.length).toBeLessThan(120)
    expect(said).not.toMatch(/[\n\u202e]/)
    expect(refusal?.path).toBe('top.\\n\\u202exxxxxxxxxxxxxxxxxx')
  })
  it('a view is four finite numbers within the bound, not empty', () => {
    expect(checkViews([0, 0, 612, 792], 1, 'views')).toEqual([0, 0, 612, 792])
    const refused = (v: unknown, pages: number) => { try { checkViews(v, pages, 'views'); return null } catch (e) { return (e as LayoutRefusal).path } }
    expect(refused([0, 0, 612], 1)).toBe('views')
    expect(refused([0, 0, 0, 792], 1)).toBe('views[2]')
    expect(refused([0, 800, 612, 792], 1)).toBe('views[3]')
    expect(refused([0, 0, 14401, 792], 1)).toBe('views[2]')
    expect(refused([0, 0, Infinity, 792], 1)).toBe('views[2]')
    expect(refused([0, 0, '612', 792], 1)).toBe('views[2]')
  })
})
