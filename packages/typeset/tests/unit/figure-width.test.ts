// A figure text keeps the original's size wherever its translation is no wider than the original (the owner, 2026-11-13;
// docs/PDF-READER.md §19.12, his words quoted there). Height is no test:
// drawn at the original's size a translation stands in the band the original's line stands in, so a stroke under the text, a line
// over it and a container's edge (the part's Room.under, Room.over) bound nothing. Width is the only test: one no wider than its
// original keeps its size; a wider one takes the free room beside it the part states, and where there is none it steps by what
// its width needs and no more. The width is the text's own: a set's tie carries no step to its other members (the owner's ruling
// of 2026-11-13 on a figure's sets, figure-untie.test.ts).
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { rolesFor } from '../../src/breaker/faces.ts'
import { figuresOf } from '../../src/lay/figures.ts'
import type { PaperReading } from '../../src/lay/read.ts'
import type { Item, Metrics, RuleParams, Rows } from '../../src/types.ts'

// (an ideograph a whole em, any other character half of one; every run's ink 0.7 of its size over its baseline and 0.2 under)
const CJK = /[　-〿一-鿿＀-￯]/u
const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, text) => [...text].reduce((a, c) => a + (CJK.test(c) ? size : size / 2), 0),
  ink: () => [70, 20, 0],
}
const R = { cjkQuotes: true, floorMin: 0.6, centredPunct: false, compressMax: 2 } as RuleParams
const paper = {
  designs: { serif: 'times', sans: 'helvetica', mono: 'courier' },
  roles: rolesFor('zh', 'times', { group: 'shs-sc' }),
} as unknown as PaperReading
/** a level figure text of size 10 on baseline 200 from x 100 to `x1`, set from its start, its room [side] and the part's
 *  vertical facts about it: `under` (a stroke under its text, its top that far under the baseline), `over` (a container's edge
 *  that far over it) */
const member = (ord: number, x1: number, room: Omit<Placed['room'], 'below'>, y = 200): Placed =>
  ({
    ord,
    kind: 'figure',
    text: `u${ord}`,
    plain: 'Original',
    lines: [[1, 0, 100, x1, y, y + 7, y - 2, 100, x1, 0, 10]],
    style: { role: 'serif', size: 10, design: 'Times-Roman' },
    room: { below: 0, ...room },
    align: 'l',
  }) as unknown as Placed
const rowsOf = (texts: Record<number, string>): Rows =>
  ({
    get: (k: string) => {
      const s = texts[Number(k.slice(1))]
      return s === undefined ? undefined : ({ ok: true, content: [{ t: 'text', s }] } as unknown as Row)
    },
  }) as unknown as Rows
/** each member's drawn size (null: left the original's) */
const sizes = (ms: Placed[], texts: Record<number, string>, tied = false) => {
  const part = { page: 1, ties: tied ? [{ rule: 'size', ords: ms.map((m) => m.ord) }] : [] } as unknown as Part
  const got = figuresOf(part, ms, rowsOf(texts), { paper, R, metrics })
  return ms.map((m) => {
    const items = (got.laid.get(m.ord)?.[0]?.[3] ?? []) as Item[]
    const s = [...new Set(items.flatMap((it) => ('size' in it ? [it.size] : [])))]
    return s.length === 1 ? s[0] : s.length ? s : null
  })
}

describe('a figure text keeps the original’s size wherever it is no wider than the original', () => {
  // (the original 60 long, 100 to 160; its translation three ideographs 30 wide at 10, its ink 2 under its baseline, 7 over)
  it('beside a stroke under its text that its translation’s ink would reach', () => {
    expect(sizes([member(1, 160, { side: [100, 160], under: 0.5 })], { 1: '概览图' })).toEqual([10])
  })
  it('under a line over it that its translation’s ink would reach', () => {
    expect(sizes([member(1, 160, { side: [100, 160], over: 6 })], { 1: '概览图' })).toEqual([10])
  })
  it('inside a tight frame, a container’s edge over it and its stroke under it', () => {
    expect(sizes([member(1, 160, { side: [100, 160], over: 6.5, under: 1 })], { 1: '概览图' })).toEqual([10])
  })
})

describe('a wider translation takes the free room beside it, and steps by its width alone where there is none', () => {
  // (its translation eight ideographs 80 wide at 10 in an original 60 long)
  it('draws one with room enough at the original’s size, a stroke under it or not', () => {
    expect(sizes([member(1, 160, { side: [100, 190], under: 0.5 })], { 1: '八个汉字八个汉字' })).toEqual([10])
  })
  it('steps one with no room by what its width needs, 60 of 80, and no more', () => {
    expect(sizes([member(1, 160, { side: [100, 160], under: 0.5 })], { 1: '八个汉字八个汉字' })).toEqual([7.5])
  })
})

describe('a set’s tie carries no member’s step to the others', () => {
  it('draws the member whose width needs 0.9 at 0.9 and its mate at the original’s size, a stroke under the mate', () => {
    // (one translation 90 wide in an original 81 long, no room: 0.9; its mate 30 wide in 60, a stroke under it)
    const ms = [member(1, 181, { side: [100, 181] }), member(2, 160, { side: [100, 160], under: 0.5 }, 180)]
    expect(sizes(ms, { 1: '九个汉字九个汉字九', 2: '概览图' }, true)).toEqual([9, 10])
  })
  it('draws the set at its size where no member’s width needs a step, whatever stands under or over them', () => {
    const ms = [member(1, 160, { side: [100, 160], under: 0.5 }), member(2, 160, { side: [100, 160], over: 6 }, 180)]
    expect(sizes(ms, { 1: '概览图', 2: '示意图' }, true)).toEqual([10, 10])
  })
})
