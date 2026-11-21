// Two elements the row sets with nothing between them, which the source sets side by side (consecutive pieces), each drawn as
// its crop: they keep TeX's own distance between their starts, not two padded crop boxes, and the line's justification puts no
// slack between them (the pair is one word to break.ts's inWord). The case: a caption's word TeX set in two highlights,
// `\hlyellow{high}\hlblue{lighted}`, whose inks overlap by 0.25 pt; drawn with each crop's 0.4 pt margins and a CJK line's
// slack between them, 0.97 pt of white stood between the two colours. Parts made by hand, words of our own: a justified line
// of CJK at 10 pt on a 228 pt measure (72-300), two element crops on the line below, set by TeX one right after the other.
import type { El, Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { type TokensInput, type TRes, tokens } from '../../src/breaker/tokens.ts'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Item, Laid, Metrics, Rows } from '../../src/types.ts'

const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
}
const rules = rulesFor('zh')
// (no page fill: the lines as the fit lays them)
const still: typeof rules = { ...rules, set: { ...rules.set, adaptiveFill: false } as unknown as typeof rules.set }
const id = 'b'.repeat(64)
// (TeX's two boxes on the original's second line: the first word's ink 150-166.51, the second's from 166.26, overlapping 0.25)
const A: [number, number, number, number, number, number] = [1, 150, 686, 166.51, 695, 688]
const B: [number, number, number, number, number, number] = [1, 166.26, 686, 192, 695, 688]
const els = (a = A, b = B): [string, El][] => [
  ['3', { kind: 'other', copy: 'one', text: 'one', ink: [a] }],
  ['4', { kind: 'other', copy: 'word', text: 'word', ink: [b] }],
]
const member = (o: Partial<Placed> = {}): Placed => ({
  ord: 0,
  kind: 'caption',
  text: id,
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'j',
  lines: [
    [1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
    [1, 0, 72, 200, 688, 695, 686, 72, 300, 0, 10],
  ],
  room: { below: 0, next: 300, runs: [[1, 200, 30]], sep: 12 },
  els: els(),
  ...o,
})
const part = (m: Placed): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: [[m]],
})
const rowOf = (content: (Row & { ok: true })['content']): Rows => {
  const r: Row = { id, ok: true, by: 'test', content }
  return { get: (k) => (k === id ? r : undefined), done: true }
}
const lay = (m: Placed, content: (Row & { ok: true })['content']): Laid =>
  layPage(part(m), rowOf(content), still, metrics).members[0]!
type Crop = Item & { src: number[]; x: number; w: number; piece: string }
const cropsOf = (laid: Laid) =>
  laid.lines.flatMap(([y, , , items]) =>
    items.filter((it): it is Crop => 'src' in it).map((c) => ({ y, x: c.x, src: c.src, piece: c.piece })),
  )
// (a CJK text whose first line, justified, holds the two crops, its end on the second line)
const before = '编'.repeat(20)
const after = '辑'.repeat(25)

describe('two elements the source sets side by side keep TeX’s distance between them', () => {
  it('drawn at TeX’s distance between their starts, the pair inside a word: no slack of the justified line between them', () => {
    const laid = lay(member(), [
      { t: 'text', s: before },
      { t: 'el', id: '3' },
      { t: 'el', id: '4' },
      { t: 'text', s: after },
    ])
    expect(laid.state).toBe('laid')
    const [a, b] = cropsOf(laid)
    // (the row's pieces 1 and 2: the elements 3 and 4)
    expect([a?.piece, b?.piece]).toEqual(['1', '2'])
    // (the first line holds both, justified: its other gaps took slack)
    expect([a!.y, b!.y]).toEqual([700, 700])
    // (its characters set wider apart than the last line's, which is not justified)
    const pitch = (n: number) =>
      (laid.lines[n]![3].find((it) => !('src' in it)) as Item & { dx?: number[] }).dx?.[1] ?? 0
    expect(pitch(0)).toBeGreaterThan(pitch(1))
    // (TeX's distance between their starts: 166.26 - 150, where two padded boxes side by side stood 17.31 apart)
    expect(b!.x - a!.x).toBeCloseTo(B[1] - A[1], 5)
  })
  it('two elements the source does not set side by side (other pieces between them there) keep their own boxes', () => {
    const laid = lay(member({ els: [els()[0]!, ['6', els()[1]![1]]] }), [
      { t: 'text', s: before },
      { t: 'el', id: '3' },
      { t: 'el', id: '6' },
      { t: 'text', s: after },
    ])
    const [a, b] = cropsOf(laid)
    expect(b!.x - a!.x).toBeGreaterThanOrEqual(a!.src[3]! - a!.src[1]! - 1e-9)
  })
  it('a pair TeX set on two lines keeps its own boxes (no distance between starts on one line)', () => {
    const below: typeof B = [1, 72, 674, 97.74, 683, 676]
    const laid = lay(member({ els: els(A, below) }), [
      { t: 'text', s: before },
      { t: 'el', id: '3' },
      { t: 'el', id: '4' },
      { t: 'text', s: after },
    ])
    const [a, b] = cropsOf(laid)
    if (a!.y === b!.y) expect(b!.x - a!.x).toBeGreaterThanOrEqual(a!.src[3]! - a!.src[1]! - 1e-9)
  })
})

describe('the side-by-side rule reads only what both elements draw', () => {
  // (B.tokens over hand-made pieces: an element drawn as its crop, then, consecutive in the source and the row, one that is a
  // forced break: its newline is a control token, never glued, never tight; a crop and a text after it are)
  const face = { family: 'f', weight: 400, style: 'normal', oblique: 0, stand: '', caps: false, size: 10 }
  const input = (second: TRes) =>
    ({
      unit: {
        kind: 'para',
        pieces: [
          { t: 'text', s: 'ab' },
          { t: 'ph', src: '{=3}', k: 3 },
          { t: 'ph', src: '{=4}', k: 4 },
        ],
      },
      resolved: {
        get: (k: number) =>
          k === 1 ? ({ mode: 'crop', crop: [150, 686, 166.51, 695], gap: null } as TRes) : k === 2 ? second : undefined,
        orig: { size: 10 },
      },
      colourOf: () => null,
      fillOf: () => null,
      fills: new Map(),
      smallCaps: new Map(),
      cls2: [],
      spacedSource: false,
      to: 'zh',
      base: {},
      designs: { serif: 's', sans: 's', mono: 'm' },
      P: {
        keepAll: false,
        cjkQuotes: true,
        latinPatterns: '',
        cyrillicPatterns: '',
        hyphenation: { minWord: 5 },
        noStart: '',
        noEnd: '',
        autospace: 0,
        compressMax: 1,
        hyphen: false,
      },
      lead: null,
      faces: { of: () => face, ownSmallCaps: () => false },
      tagWords: false,
    }) as unknown as TokensInput
  it('a forced break after a crop: its newline neither glued nor tight', () => {
    const out = tokens(input({ mode: 'none', text: '', brk: true, room: 1, brkAt: 1 } as TRes)).tokens
    const nl = out.find((t) => t.newline !== undefined)
    expect(nl).toBeDefined()
    expect([nl!.glue, nl!.tight]).toEqual([undefined, undefined])
  })
  it('a text drawn after a crop: glued and tight', () => {
    const out = tokens(input({ mode: 'orig-text', text: 'word' } as TRes)).tokens
    const w = out.find((t) => t.s === 'word')
    expect([w!.glue, w!.tight]).toEqual([true, true])
  })
})
