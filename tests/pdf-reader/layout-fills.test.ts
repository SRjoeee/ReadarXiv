import { describe, expect, it } from 'vitest'
import { fillsByChar, isItemFills, itemFills, UNKNOWN } from '@/pdf-reader/engine/layout/fills.mjs'

// An item's characters' fills from the glyphs pageInk reads (layout/fills.mjs), never guessed

const BLUE = 0x0000ff, RED = 0xff0000, BLACK = 0
/** an item at x of n characters 5 pt each, size 10, on baseline y */
const item = (str: string, x = 72, y = 700, a = 10, b = 0, d = 10) => ({ str, transform: [a, b, 0, d, x, y], width: 5 * [...str].length, height: 10 })
/** glyphs of `text` from x, each 5 pt, in `fills` (one a character, or one for all) */
const glyphs = (text: string, x = 72, y = 700, fills: number | number[] = BLACK) => [...text].map((u, i) => ({ u, x0: x + 5 * i, x1: x + 5 * i + 5, y, size: 10, fill: Array.isArray(fills) ? fills[i]! : fills }))

describe('itemFills', () => {
  it('an item in one colour is that colour; one in black is 0', () => {
    expect(itemFills([item('Section 3')], glyphs('Section3', 72, 700, BLUE).map((g, i) => ({ ...g, x0: 72 + 5 * (i < 7 ? i : i + 1), x1: 77 + 5 * (i < 7 ? i : i + 1) })))).toEqual([BLUE])
    expect(itemFills([item('word')], glyphs('word'))).toEqual([BLACK])
  })

  it('"[16]" whose brackets are black and digits blue: runs by code point; a space takes the fill before it', () => {
    expect(itemFills([item('[16]')], glyphs('[16]', 72, 700, [BLACK, BLUE, BLUE, BLACK]))).toEqual([[0, BLACK, 1, BLUE, 3, BLACK]])
    const two = glyphs('(10)x', 72, 700, [BLACK, RED, RED, BLACK, BLACK]).map((g, i) => (i === 4 ? { ...g, x0: 97, x1: 102 } : g))
    expect(itemFills([item('(10) x')], two)).toEqual([[0, BLACK, 1, RED, 3, BLACK]])
  })

  it('a ligature glyph stands for its letters, across a change of colour after it', () => {
    // (the glyph "ﬀ" in red, then "i" in black: the item's "ffi")
    const g = [{ u: 'ﬀ', x0: 72, x1: 80, y: 700, size: 10, fill: RED }, { u: 'i', x0: 80, x1: 83, y: 700, size: 10, fill: BLACK }]
    expect(itemFills([{ ...item('ffi'), width: 11 }], g)).toEqual([[0, RED, 2, BLACK]])
    // (an item's own ligature character on two glyphs of two colours: no one fill is its)
    expect(itemFills([{ ...item('ﬁ'), width: 10 }], glyphs('fi', 72, 700, [RED, BLACK]))).toEqual([UNKNOWN])
    expect(itemFills([{ ...item('ﬁ'), width: 10 }], glyphs('fi', 72, 700, RED))).toEqual([RED])
  })

  it('a bold faked by painting each glyph again 0.015 em on reads its glyphs once; two colours there are no fill', () => {
    const once = glyphs('bold', 72, 700, BLUE), over = [...once, ...once.map(g => ({ ...g, x0: g.x0 + 0.15, x1: g.x1 + 0.15 })), ...once.map(g => ({ ...g, x0: g.x0 + 0.3, x1: g.x1 + 0.3 }))]
    expect(itemFills([item('bold'), item('bold', 72.15)], over)).toEqual([BLUE, BLUE])
    const mixed = [...once, ...once.map(g => ({ ...g, x0: g.x0 + 0.15, x1: g.x1 + 0.15, fill: RED }))]
    expect(itemFills([item('bold')], mixed)).toEqual([UNKNOWN])
  })

  it('never a guess: turned, uncovered, a glyph too many, a combined accent set as two glyphs, a right-to-left run', () => {
    expect(itemFills([item('word', 72, 700, 0, 10, 10)], glyphs('word'))).toEqual([UNKNOWN])
    expect(itemFills([item('word')], glyphs('wor'))).toEqual([UNKNOWN])
    expect(itemFills([item('word')], [...glyphs('word'), { u: 'x', x0: 79, x1: 80, y: 700, size: 10, fill: 0 }])).toEqual([UNKNOWN])
    expect(itemFills([item('ü')], [{ u: 'u', x0: 72, x1: 77, y: 700, size: 10, fill: BLUE }, { u: '¨', x0: 72.5, x1: 76, y: 703, size: 10, fill: BLUE }])).toEqual([UNKNOWN])
    expect(itemFills([item('שלום')], glyphs('םולש'))).toEqual([UNKNOWN])
    expect(itemFills([item('word')], null)).toEqual([UNKNOWN])
    // (a glyph of no colour, a pattern's: its character's fill not told)
    expect(itemFills([item('ab')], glyphs('ab', 72, 700, [BLUE, -1]))).toEqual([[0, BLUE, 1, UNKNOWN]])
  })

  it('the same input, the same output, whatever the glyphs\' order', () => {
    const g = [...glyphs('[16]', 72, 700, [BLACK, BLUE, BLUE, BLACK]), ...glyphs('more', 72, 688, RED)]
    const items = [item('[16]'), item('more', 72, 688)]
    const one = itemFills(items, g)
    expect(itemFills(items, [...g].reverse())).toEqual(one)
    expect(itemFills(items, g)).toEqual(one)
  })

  it('isItemFills and fillsByChar read what itemFills writes, and refuse what it never does', () => {
    expect(isItemFills(BLUE, 3)).toBe(true)
    expect(isItemFills([0, BLACK, 1, BLUE], 3)).toBe(true)
    for (const bad of [[0, BLACK], [1, BLACK, 2, BLUE], [0, BLACK, 0, BLUE], [0, BLUE, 1, BLUE], [0, BLACK, 3, BLUE], [0, 0x1000000, 1, 0], 0x1000000, -2, 1.5, 'x']) expect(isItemFills(bad, 3)).toBe(false)
    expect(fillsByChar([0, BLACK, 1, BLUE, 3, BLACK], 4)).toEqual([BLACK, BLUE, BLUE, BLACK])
    expect(fillsByChar(RED, 2)).toEqual([RED, RED])
    expect(fillsByChar(null, 2)).toEqual([UNKNOWN, UNKNOWN])
  })
})
