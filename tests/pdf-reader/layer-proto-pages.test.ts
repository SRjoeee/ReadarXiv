import { beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// A unit that runs over a page break is laid so that each page holds the text its source sets there (E3c, 2026-10-20). The
// fit used to fill page A to capacity, and its translation's sentences from page B were drawn on page A (the sweep's
// invariant (i): 17 rows on 9 papers). The source's break is where the alignment finds the first source word on page B;
// the translation is cut in the sentence that holds it, at the share of that sentence the source has before it, and a
// page-break token there sends the text on to page B's first line where it is reached on page A (on page B already, it
// does nothing: no fit fails for it).

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
let L2: L2
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
})

const face = { id: 'serif', family: 'F', weight: 400, style: 'normal', size: 1 }
const word = (n: number, at?: number) => ({ s: 'x'.repeat(n), cls: 'latin', w100: 50 * n, st: {}, face, ...(at === undefined ? {} : { at, end: at + n }) })
const space = { space: true, w100: 25 }
const P = (to: string) => ({ ...resolveRules(BUILTIN_RULES, to).params, borrow: 0, hyphen: 0, leadBase: 1, leadFloor: 1, lineskip: null })
/** a block of n lines 12 pt apart from `from` on `page`, 100 pt wide, at size 10 */
const block = (page: number, from: number, n: number) => {
  const B = Array.from({ length: n }, (_, k) => from - 12 * k)
  return { page, rects: B.map(b => [page, 0, b - 2, 100, b + 8]), x0: 0, x1: 100, B, exact: B.map(() => true), sizes: B.map(() => 10), pitch0: 12, free: 0, indent: 0, after: 0, centred: false }
}
/** n words of two letters with a space between, their offsets in the plain text (3 a word and its space) */
const words = (n: number) => Array.from({ length: n }, (_, i) => (i ? [space, word(2, 3 * i)] : [word(2, 0)])).flat()

describe("where a later page of a unit begins in its source: the alignment's first source word there", () => {
  it('is the plain source offset of the first page word paired with the source on that page, in UTF-16', () => {
    // the unit's characters: "aa bb" on page 3, "cc dd" on page 4; its source "\u00e9 aa bb cc dd" (an accent first, one
    // code unit; and an astral letter would count two)
    const ch = (c: string, page: number, x: number) => ({ ch: c, page, x0: x, x1: x + 5, yb: 100, size: 10, item: 0, k: x, rect: [page, 0, 98, 100, 108] })
    const uc = [...'aa bb'].map((c, i) => ch(c, 3, i * 5)), uc4 = [...'cc dd'].map((c, i) => ch(c, 4, i * 5))
    const all = [...uc, { ch: '\n', sep: true, page: 3 }, ...uc4]
    const src = '\u{1D49C} aa bb cc dd'
    const S = [{ w: 'aa', start: 2 }, { w: 'bb', start: 5 }, { w: 'cc', start: 8 }, { w: 'dd', start: 11 }]
    const O = [{ w: 'aa', start: 0 }, { w: 'bb', start: 3 }, { w: 'cc', start: 6 }, { w: 'dd', start: 9 }]
    const starts = L2.pageStartsOf(all as never, O as never, S as never, Int32Array.from([0, 1, 2, 3]), src)
    // (S's starts are code points: "cc" is the 8th, at UTF-16 offset 9 after the astral letter)
    expect([...starts]).toEqual([[4, 9]])
    // a page none of whose words the alignment takes has none
    expect([...L2.pageStartsOf(all as never, O as never, S as never, Int32Array.from([0, 1, -1, -1]), src)]).toEqual([])
  })
})

describe("the translation's cut at a page's start", () => {
  // the source: two sentences, "aa bb cc dd. " and "ee ff gg hh." (the second at 13); the translation's two at 0 and 30
  const src = 'aa bb cc dd. ee ff gg hh.'
  const unit = (sentences: { src: number[]; tr: number[] } | null) => ({ src, sentences, pieces: [{ t: 'text', tr: true, s: 'x'.repeat(60) }] })
  it("is in the sentence that holds the source's break, at the share of it the source has before the break", () => {
    // page 4 begins at "gg" (19): 6 of the second sentence's 12 characters, half of it; the translation's second sentence is
    // 30 to 60, so the cut is at 45, the token at 45
    const tokens = words(20)
    const cut = L2.pageCutsOf(tokens as never, unit({ src: [13], tr: [30] }) as never, new Map([[4, 19]]), P('de') as never)
    expect(cut).toEqual([{ page: 4, at: tokens.findIndex(t => (t as { at?: number }).at === 45) }])
    // without sentences: the unit's own share, 19 of 25, of the translation's 60: 45.6, the token at 48
    const plain = L2.pageCutsOf(tokens as never, unit(null) as never, new Map([[4, 19]]), P('de') as never)
    expect(plain).toEqual([{ page: 4, at: tokens.findIndex(t => (t as { at?: number }).at === 48) }])
  })
  it('moves past a mark no line opens with, and past a token glued to the one before it', () => {
    const t = (s: string, at: number, o: object = {}) => ({ s, cls: 'cjk', w100: 100, st: {}, face, at, end: at + 1, ...o })
    const tokens = [t('\u7532', 0), t('\u4e59', 1), t('\u3002', 2), t('\u4e19', 3), t('\u4e01', 4, { glue: true }), t('\u620a', 5)]
    const cut = (o: number) => L2.pageCutsOf(tokens as never, { src: 'abcdef', sentences: null, pieces: [{ t: 'text', tr: true, s: '\u7532\u4e59\u3002\u4e19\u4e01\u620a' }] } as never, new Map([[2, o]]), P('zh') as never)
    expect(cut(1)).toEqual([{ page: 2, at: 1 }])
    // ("\u3002" at 2 opens no line: the cut moves to 3; "\u4e01" at 4 is glued to "\u4e19": to 5)
    expect(cut(2)).toEqual([{ page: 2, at: 3 }])
    expect(cut(4)).toEqual([{ page: 2, at: 5 }])
  })
})

describe('the page-break token', () => {
  it("reached on page A closes the line there, ragged, and the text goes on on page B's first line", () => {
    // page 3's three lines and page 4's three; the break after the first line's eight words
    const tokens = [...words(8), { pageBreak: 4, w100: 0 }, space, ...words(16).map(t => ({ ...t }))]
    const l = L2.layoutUnit2(tokens as never, [block(3, 500, 3), block(4, 700, 3)] as never, 10, P('de') as never)
    expect(l.clipped).toBe(false)
    expect(l.lines.map(x => [x.page, x.baseline])).toEqual([[3, 500], [4, 700], [4, 688]])
    expect(l.lines[0]!.mode).toBe('last')
  })
  it('reached on page B (page A already full) does nothing', () => {
    const tokens = [...words(32), { pageBreak: 4, w100: 0 }, space, ...words(8)]
    const l = L2.layoutUnit2(tokens as never, [block(3, 500, 3), block(4, 700, 3)] as never, 10, P('de') as never)
    expect(l.clipped).toBe(false)
    expect(l.lines.map(x => [x.page, x.baseline])).toEqual([[3, 500], [3, 488], [3, 476], [4, 700], [4, 688]])
  })
})
