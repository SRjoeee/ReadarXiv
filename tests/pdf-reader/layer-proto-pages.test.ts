import { beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// A unit that runs over a page break is laid so that each page holds the text its source sets there (E3c, 2026-10-20). The
// fit used to fill page A to capacity, and its translation's sentences from page B were drawn on page A (the sweep's
// invariant (i): 17 rows on 9 papers). The source's break is where the alignment finds the first source word on page B;
// the translation is cut in the sentence that holds it, at the share of that sentence the source has before it, and a
// page-break token there sends the text on to page B where it is reached on page A (on page B already, or before a display
// the text has not passed, it does nothing: no fit fails for it). The line that holds it ends where the breaker ends it,
// full, and page B opens at the next line's start: a paragraph over a page break never leaves a short line before it, as
// TeX never does (the owner, 2026-10-30: 1706.03762's Chinese §3.2.2 ended page 4 half a line short, the word for "output"
// split over pages 4 and 5). Where that line is its run's last, page B would get none of it: the line goes to page B whole.

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
let L2: L2
let work: { fit: number; breaks: number }
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  work = (await import('@/pdf-reader/engine/layer-proto/work.mjs')).work
})

const face = { id: 'serif', family: 'F', weight: 400, style: 'normal', size: 1 }
const word = (n: number, at?: number) => ({ s: 'x'.repeat(n), cls: 'latin', w100: 50 * n, st: {}, face, ...(at === undefined ? {} : { at, end: at + n }) })
const space = { space: true, w100: 25 }
const P = (to: string) => ({ ...resolveRules(BUILTIN_RULES, to).params, borrow: 0, hyphen: 0, leadBase: 1, leadFloor: 1, lineskip: null })
/** a block of n lines 12 pt apart from `from` on `page`, 100 pt wide, at size 10, after `after` kept regions */
const block = (page: number, from: number, n: number, after = 0) => {
  const B = Array.from({ length: n }, (_, k) => from - 12 * k)
  return { page, rects: B.map(b => [page, 0, b - 2, 100, b + 8]), x0: 0, x1: 100, B, exact: B.map(() => true), sizes: B.map(() => 10), pitch0: 12, free: 0, indent: 0, after, centred: false }
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
    // nor one whose first taken word is no later in the source than the page before's start (the alignment's pairs out of
    // order): page 5's "bb" (4) before page 4's "cc" (9)
    const uc5 = [...'ee'].map((c, i) => ch(c, 5, i * 5))
    const all5 = [...all, { ch: '\n', sep: true, page: 4 }, ...uc5]
    const O5 = [...O, { w: 'ee', start: 12 }]
    expect([...L2.pageStartsOf(all5 as never, O5 as never, S as never, Int32Array.from([0, 1, 2, 3, 1]), src)]).toEqual([[4, 9]])
    // nor any later page while the first has no word the alignment takes: page 4's start would be the unit's start
    expect([...L2.pageStartsOf(all as never, O as never, S as never, Int32Array.from([-1, -1, 0, 1]), src)]).toEqual([])
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
  it("is never at the unit's first token: a page break there would move none of the text and leave page A empty", () => {
    const unit = { src: 'ab cd ef gh ij', sentences: null, pieces: [{ t: 'text', tr: true, s: 'x'.repeat(14) }] }
    expect(L2.pageCutsOf(words(5) as never, unit as never, new Map([[4, 0]]), P('de') as never)).toEqual([])
    // (nor where the first token is untagged and the place is at the start)
    const untagged = [{ s: 'x', cls: 'latin', w100: 50, st: {}, face }, space, ...words(4)]
    expect(L2.pageCutsOf(untagged as never, unit as never, new Map([[4, 0]]), P('de') as never)).toEqual([])
  })
})

describe('the page-break token', () => {
  it("reached on page A, the line that holds it ends where the breaker ends it, and the text goes on on page B's first line", () => {
    // page 3's three lines and page 4's three; the break after the first line's eight words (97.5 of its 100 pt: justified)
    const tokens = [...words(8), { pageBreak: 4, w100: 0 }, space, ...words(16).map(t => ({ ...t }))]
    const l = L2.layoutUnit2(tokens as never, [block(3, 500, 3), block(4, 700, 3)] as never, 10, P('de') as never)
    expect(l.clipped).toBe(false)
    expect(l.lines.map(x => [x.page, x.baseline])).toEqual([[3, 500], [4, 700], [4, 688]])
    expect(l.lines[0]!.mode).toBe('just')
    // after three words: the line goes on to its eight, justified, never ended short (the break moved on by five words, the
    // rest of its line); page 4 opens at the ninth, where the next line would have opened
    const short = L2.layoutUnit2([...words(3), { pageBreak: 4, w100: 0 }, space, ...words(8)] as never, [block(3, 500, 3), block(4, 700, 3)] as never, 10, P('de') as never)
    expect(short.lines.map(x => [x.page, x.mode, x.items.filter(it => !(it.t as { space?: boolean }).space).length])).toEqual([[3, 'just', 8], [4, 'last', 3]])
  })
  it("a whole one sends the line that holds it to page B, the line before it ending page A; on its run's first line there, ends that line at it", () => {
    // 11 words: page 3's first line takes eight; the break in the second line, the unit's last
    const tokens = [...words(9), { pageBreak: 4, whole: true, w100: 0 }, space, ...words(2)]
    const l = L2.layoutUnit2(tokens as never, [block(3, 500, 3), block(4, 700, 3)] as never, 10, P('de') as never)
    expect(l.lines.map(x => [x.page, x.mode, x.items.filter(it => !(it.t as { space?: boolean }).space).length])).toEqual([[3, 'just', 8], [4, 'last', 3]])
    // the unit's one line: no line of the run before it on page 3, so the break stays at the token (page 3 keeps its share)
    const one = L2.layoutUnit2([...words(2), { pageBreak: 4, whole: true, w100: 0 }, space, ...words(2)] as never, [block(3, 500, 3), block(4, 700, 3)] as never, 10, P('de') as never)
    expect(one.lines.map(x => [x.page, x.mode])).toEqual([[3, 'ragged'], [4, 'last']])
  })
  it('before a display the text has not passed, does nothing (the source sets that text before the display)', () => {
    // page 3's three lines, then the display (region 0) at its foot; page 4's slots after it
    const pre = words(6), mid = words(6), post = words(6)
    const broken = [...pre, { pageBreak: 4, w100: 0 }, space, ...mid, { blockTo: 0, w100: 0 }, ...post]
    const l = L2.layoutUnit2(broken as never, [block(3, 500, 3), block(4, 700, 3, 1)] as never, 10, P('de') as never)
    expect([l.clipped, l.tried, !!l.spilled]).toEqual([false, 1, false])
    expect(l.lines.map(x => x.page)).toEqual([3, 3, 4])
  })
  it('reached on page B (page A already full) does nothing', () => {
    const tokens = [...words(32), { pageBreak: 4, w100: 0 }, space, ...words(8)]
    const l = L2.layoutUnit2(tokens as never, [block(3, 500, 3), block(4, 700, 3)] as never, 10, P('de') as never)
    expect(l.clipped).toBe(false)
    expect(l.lines.map(x => [x.page, x.baseline])).toEqual([[3, 500], [3, 488], [3, 476], [4, 700], [4, 688]])
  })
})

describe('the unit laid with its cuts (layoutCut): the fit searched once, the cut laid at its state', () => {
  const blocks = () => [block(3, 500, 3), block(4, 700, 3)] as never
  const lay = (tokens: unknown[], cuts: { page: number; at: number }[]) => {
    const f0 = work.fit, b0 = work.breaks
    const r = L2.layoutCut(tokens as never, cuts, blocks(), 10, P('de') as never)
    return { ...r, fit: work.fit - f0, breaks: work.breaks - b0 }
  }
  it('where the lay without the cut sets its token on an earlier page: laid once more, at that state, the cut kept', () => {
    // 16 words: page 3's two lines and page 4's; the cut at the ninth word, which the plain lay sets on page 3's second line
    const tokens = words(16)
    const r = lay(tokens, [{ page: 4, at: 16 }])
    expect([r.fit, r.layout.clipped, r.tokens.length]).toEqual([2, false, tokens.length + 1])
    expect(r.layout.lines.map(x => x.page)).toEqual([3, 4])
    expect(r.layout.tried).toBe(1)
  })
  it('where the cut is on its page already, or where at that state the cut does not fit: as without it, no state tried again', () => {
    // 40 words: page 3's three lines and page 4's three, two of them taken; the cut at the 25th word, on page 4 without it:
    // one lay
    const tokens = words(40)
    const on = lay(tokens, [{ page: 4, at: 48 }])
    expect([on.fit, on.tokens]).toEqual([1, tokens])
    // the cut after the first word: page 3's first line holds eight words and ends there, and the other 32 are more than page
    // 4's three lines hold at that state: as without it, the fit's states tried once (the cut at its state the one more lay)
    const over = lay(tokens, [{ page: 4, at: 2 }])
    expect([over.fit, over.tokens, over.layout.lines.map(x => x.page)]).toEqual([2, tokens, [3, 3, 3, 4, 4]])
  })
  it("where the line that holds the cut is its run's last: laid once more with the break whole, that line on page B", () => {
    // 20 words, all on page 3's three lines without the cut (8, 8, 4); the cut in the third: the break would end the unit's
    // last line and give page 4 nothing, so that line goes to page 4, and page 3 ends with its second line, full
    const tokens = words(20)
    const r = lay(tokens, [{ page: 4, at: 36 }])
    expect([r.fit, r.layout.clipped]).toEqual([3, false])
    expect(r.layout.lines.map(x => [x.page, x.mode])).toEqual([[3, 'just'], [3, 'just'], [4, 'last']])
    expect(r.tokens.filter(t => (t as { pageBreak?: number }).pageBreak !== undefined)).toEqual([{ pageBreak: 4, whole: true, w100: 0 }])
  })
  it("never where text of the run goes on after that line: a kept region's placeholder inside the run is no run's end", () => {
    // 20 words with a kept region's placeholder after the eleventh (a region no slot stands after: it breaks nothing); the
    // cut in the second line, whose end the break waits for: page 4 opens with the 17th word, no line laid whole
    const tokens = words(20)
    tokens.splice(22, 0, { blockTo: 0, w100: 0 } as never)
    const r = lay(tokens, [{ page: 4, at: 18 }])
    expect([r.fit, r.layout.clipped]).toEqual([2, false])
    expect(r.layout.lines.map(x => [x.page, x.mode])).toEqual([[3, 'just'], [3, 'just'], [4, 'last']])
    expect(r.tokens.filter(t => (t as { pageBreak?: number }).pageBreak !== undefined)).toEqual([{ pageBreak: 4, w100: 0 }])
  })
})

describe("the owner's case of 2026-10-30: a Chinese paragraph whose source's page break falls in the middle of a line", () => {
  // 1706.03762's Chinese §3.2.2, page 4 to 5: the source sets five lines on page 4 and a line and a part on page 5; the
  // translation, shorter, fits page 4's five slots, and the share of the sentence the source sets on page 4 ends in its
  // fourth line. The cut there ended page 4 half a line short and page 5 opened with the rest of its last word, "output" split
  // over the pages; the owner: there was room, and the text was pushed to the next line, leaving the place empty (his words
  // are in docs/PDF-READER.md). Ten characters a line, 42 of them
  const han = (n: number) => Array.from({ length: n }, (_, k) => ({ s: String.fromCodePoint(0x4e00 + k), cls: 'cjk', w100: 100, st: {}, face, at: k, end: k + 1 }))
  const blocks = (n4 = 5) => [block(4, 500, n4), block(5, 700, 3)] as never
  const chars = (l: { items: { t: unknown }[] }) => l.items.map(it => (it.t as { s?: string }).s ?? '').join('')
  it("fills page 4's lines to the measure, and page 5 opens where the next line would have", () => {
    const tokens = han(42)
    const plain = L2.layoutUnit2(tokens as never, blocks(), 10, P('zh') as never)
    expect(plain.lines.map(l => [l.page, l.from])).toEqual([[4, 0], [4, 10], [4, 20], [4, 30], [4, 40]])
    // the source's share: the 34th character, in the fourth line
    const r = L2.layoutCut(tokens as never, [{ page: 5, at: 33 }], blocks(), 10, P('zh') as never)
    expect(r.layout.clipped).toBe(false)
    expect(r.layout.lines.map(l => [l.page, l.mode, chars(l).length])).toEqual([[4, 'just', 10], [4, 'just', 10], [4, 'just', 10], [4, 'just', 10], [5, 'last', 2]])
    // (the characters on each page: page 5's first line opens with the 41st, the plain layout's fifth line)
    expect(chars(r.layout.lines[4]!)).toBe(String.fromCodePoint(0x4e00 + 40, 0x4e00 + 41))
  })
  it('keeps that at every state the unit is laid at again: the break moves with the line that holds it', () => {
    // the page fill lays a unit again from the tokens the cut returned (run.mjs fillPage): at a larger size, nine characters a
    // line, the line that holds the break is page 4's fourth still, and ends full
    const tokens = han(42)
    const r = L2.layoutCut(tokens as never, [{ page: 5, at: 33 }], blocks(), 10, P('zh') as never)
    const st = { ...r.layout.state, scale: 1.1 }
    const again = L2.layoutAt(r.tokens as never, blocks(), 10, P('zh') as never, st)
    expect(again.clipped).toBe(false)
    expect(again.lines.filter(l => l.page === 4).map(l => [l.mode, chars(l).length])).toEqual([['just', 9], ['just', 9], ['just', 9], ['just', 9]])
    expect(again.lines.filter(l => l.page === 5).map(l => chars(l).length)).toEqual([6])
  })
})
