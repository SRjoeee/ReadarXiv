import { beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// A unit that runs over a page break holds on each page its share of the paragraph (E3c, 2026-10-20; by height since
// 2026-10-30). The fit used to fill page A to capacity, and text the source sets on page B was drawn on page A. Its runs
// (the text between two displays) whose source lines stand on more than one page are cut before each later page at the
// nearest line end of the fit's lay to that page's share of the run's height (pageCutsOf): no sentence, no word of the
// alignment (the owner, 2026-10-30: blocks keep their place, sentences need not, the page changes at a natural line end,
// as LaTeX sets it). A page-break token there sends the text on to page B where it is reached on page A (on page B already,
// or before a display the text has not passed, it does nothing: no fit fails for it); the line that holds it ends where the
// breaker ends it, and where that line is its run's last, page B getting none of it, the breaker lays the line on page B.

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

/** the fit's lines as pageCutsOf reads them: [page, from, block] each */
const L = (...ls: [number, number, number][]) => ls.map(([page, from, block]) => ({ page, from, block }))

describe("the cut by height: each page's share of the paragraph, at the nearest line end of the fit's lay", () => {
  const tokens = words(40)
  it("is the line end nearest the source's lines before the page over all of them, rounded half up", () => {
    // the source: three lines on page 3, one on page 4 (a share of 3/4); the fit lays four lines, all on page 3: three of them
    // stay there, page 4 opens with the fourth
    const blocks = [block(3, 500, 3), block(4, 700, 1)] as never
    expect(L2.pageCutsOf(L([3, 0, 0], [3, 16, 0], [3, 32, 0], [3, 48, 0]), blocks, tokens as never, P('de') as never)).toEqual([{ page: 4, at: 48 }])
    // three lines: 2.25, two stay; two lines: 1.5, half up, but one line at least on page 4: one stays
    expect(L2.pageCutsOf(L([3, 0, 0], [3, 16, 0], [3, 32, 0]), blocks, tokens as never, P('de') as never)).toEqual([{ page: 4, at: 32 }])
    expect(L2.pageCutsOf(L([3, 0, 0], [3, 16, 0]), blocks, tokens as never, P('de') as never)).toEqual([{ page: 4, at: 16 }])
    // (an even split, 2 of 4: the third line opens page 4)
    expect(L2.pageCutsOf(L([3, 0, 0], [3, 16, 0], [3, 32, 0], [3, 48, 0]), [block(3, 500, 2), block(4, 700, 2)] as never, tokens as never, P('de') as never)).toEqual([{ page: 4, at: 32 }])
  })
  it('is none where the fit sets that line on the page already (its page A holds no more than its share), and never at the first token', () => {
    const blocks = [block(3, 500, 3), block(4, 700, 1)] as never
    expect(L2.pageCutsOf(L([3, 0, 0], [3, 16, 0], [3, 32, 0], [4, 48, 1]), blocks, tokens as never, P('de') as never)).toEqual([])
    // (a share under half a line: one line stays on page 3 all the same)
    expect(L2.pageCutsOf(L([3, 0, 0], [3, 16, 0], [3, 32, 0]), [block(3, 500, 1), block(4, 700, 9)] as never, tokens as never, P('de') as never)).toEqual([{ page: 4, at: 16 }])
  })
  it("is each run's own: a run on one page has none, a run over two is cut by its own lines", () => {
    // run 0 (after no display) on page 3 alone; run 1 over pages 3 and 4, its source two lines on each
    const blocks = [block(3, 500, 2), block(3, 460, 2, 1), block(4, 700, 2, 1)] as never
    const lines = L([3, 0, 0], [3, 10, 0], [3, 20, 1], [3, 30, 1])
    expect(L2.pageCutsOf(lines, blocks, tokens as never, P('de') as never)).toEqual([{ page: 4, at: 30 }])
  })
  it('over three pages: each later page at its share, rising', () => {
    // the source's lines 2, 1, 2 on pages 1, 2, 3; five lines laid on page 1: two stay (2/5 of five), the third opens page 2,
    // the fourth page 3 (3/5)
    const blocks = [block(1, 500, 2), block(2, 700, 1), block(3, 700, 2)] as never
    const lines = L([1, 0, 0], [1, 8, 0], [1, 16, 0], [1, 24, 0], [1, 32, 0])
    expect(L2.pageCutsOf(lines, blocks, tokens as never, P('de') as never)).toEqual([{ page: 2, at: 16 }, { page: 3, at: 24 }])
  })
  it("a run laid in one line is cut in it, at the share of its tokens, on one a line may open with: the one short line", () => {
    const blocks = [block(3, 500, 1), block(4, 700, 1)] as never
    // ten words in one line on page 3: the sixth word (half of them, past the fifth) opens page 4
    const ten = words(10)
    expect(L2.pageCutsOf(L([3, 0, 0]), blocks, ten as never, P('de') as never)).toEqual([{ page: 4, at: 10 }])
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
  it("where the text ends on the line that holds it, sends that line to page B, the line before it ending page A; on its run's first line there, ends that line at it", () => {
    // 11 words: page 3's first line takes eight; the break in the second line, the unit's last
    const tokens = [...words(9), { pageBreak: 4, w100: 0 }, space, ...words(2)]
    const l = L2.layoutUnit2(tokens as never, [block(3, 500, 3), block(4, 700, 3)] as never, 10, P('de') as never)
    expect(l.lines.map(x => [x.page, x.mode, x.items.filter(it => !(it.t as { space?: boolean }).space).length])).toEqual([[3, 'just', 8], [4, 'last', 3]])
    // the unit's one line: no line of the run before it on page 3, so the break stays at the token (page 3 keeps its share)
    const one = L2.layoutUnit2([...words(2), { pageBreak: 4, w100: 0 }, space, ...words(2)] as never, [block(3, 500, 3), block(4, 700, 3)] as never, 10, P('de') as never)
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

/** the breaker's own: a unit laid at the plain lay's state with page breaks before the cuts given (what layoutCut lays) */
const laidWith = (tokens: unknown[], cuts: { page: number; at: number }[], blocks: unknown, to = 'de') => {
  const plain = L2.layoutUnit2(tokens as never, blocks as never, 10, P(to) as never)
  const broken = L2.withPageBreaks(tokens as never, cuts)
  return { layout: L2.layoutAt(broken, blocks as never, 10, P(to) as never, plain.state), tokens: broken }
}
const pagesOf = (l: { lines: { page: number }[] }) => l.lines.map(x => x.page)
const counts = (l: { lines: { page: number; items: { t: unknown }[] }[] }) => l.lines.map(x => [x.page, x.items.filter(it => !(it.t as { space?: boolean }).space).length])

describe('the unit laid over its page breaks (layoutCut): the fit searched once, the cut laid at its state', () => {
  const blocks = () => [block(3, 500, 3), block(4, 700, 3)] as never
  const lay = (tokens: unknown[], bs: unknown = blocks()) => {
    const f0 = work.fit, b0 = work.breaks
    const r = L2.layoutCut(tokens as never, bs as never, 10, P('de') as never)
    return { ...r, fit: work.fit - f0, breaks: work.breaks - b0 }
  }
  it("where the lay without the cut sets more of the paragraph on page A than its share: laid once more, at that state, the cut kept", () => {
    // 16 words: two lines, both on page 3 without the cut; the source's lines three and three: one line each
    const tokens = words(16)
    const r = lay(tokens)
    expect([r.fit, r.layout.clipped, r.tokens.length]).toEqual([2, false, tokens.length + 1])
    expect(counts(r.layout)).toEqual([[3, 8], [4, 8]])
    expect(r.layout.tried).toBe(1)
  })
  it('where the lay holds page A to its share already, or where at that state the cut does not fit: as without it, no state tried again', () => {
    // 40 words: page 3's three lines and two of page 4's, three of five on page 3 by the share (2.5, half up): one lay
    const tokens = words(40)
    const on = lay(tokens)
    expect([on.fit, on.tokens]).toEqual([1, tokens])
    // page 4's one line, 30 pt wide, under the share: 24 words on page 3's three lines, the third would go to page 4 and does
    // not fit there: as without it, the fit's states tried once (the cut at its state the one more lay)
    const narrow = { ...block(4, 700, 1), x1: 30, rects: [[4, 0, 698, 30, 708]] }
    const over = lay(words(24), [block(3, 500, 3), narrow])
    expect([over.fit, over.tokens.length, pagesOf(over.layout)]).toEqual([2, 47, [3, 3, 3]])
  })
  it('on one page, or with no source lines past the first page, nothing: the plain lay', () => {
    const r = lay(words(16), [block(3, 500, 3)])
    expect([r.fit, pagesOf(r.layout)]).toEqual([1, [3, 3]])
  })
})

describe("the owner's cases of 2026-10-30: a Chinese paragraph over a page break ends page A at a natural line end", () => {
  // 1706.03762's Chinese §3.2.2, page 4 to 5: the source sets five lines on page 4 and two on page 5; the translation,
  // shorter, fits page 4's five slots in four lines (ten characters a line, 32 of them). The sentence share ended page 4 half
  // a line short and page 5 opened with the rest of a word ("output" split over the pages); the owner: there was room, and the
  // text was pushed to the next line, leaving the place empty (his words are in docs/PDF-READER.md). By height, three of the
  // four lines stay (4 × 5/7 = 2.9), full, and page 5 shows the few characters that are left
  const han = (n: number) => Array.from({ length: n }, (_, k) => ({ s: String.fromCodePoint(0x4e00 + k), cls: 'cjk', w100: 100, st: {}, face, at: k, end: k + 1 }))
  const blocks = () => [block(4, 500, 5), block(5, 700, 2)] as never
  const chars = (l: { items: { t: unknown }[] }) => l.items.map(it => (it.t as { s?: string }).s ?? '').join('')
  it("fills page 4's lines to the measure, and page 5 opens where the next line would have", () => {
    const tokens = han(32)
    const plain = L2.layoutUnit2(tokens as never, blocks(), 10, P('zh') as never)
    expect(plain.lines.map(l => [l.page, l.from])).toEqual([[4, 0], [4, 10], [4, 20], [4, 30]])
    const r = L2.layoutCut(tokens as never, blocks(), 10, P('zh') as never)
    expect(r.layout.clipped).toBe(false)
    expect(r.layout.lines.map(l => [l.page, l.mode, chars(l).length])).toEqual([[4, 'just', 10], [4, 'just', 10], [4, 'just', 10], [5, 'last', 2]])
    expect(chars(r.layout.lines[3]!)).toBe(String.fromCodePoint(0x4e00 + 30, 0x4e00 + 31))
  })
  it('keeps that at every state the unit is laid at again: the break moves with the line that holds it', () => {
    // the page fill lays a unit again from the tokens the cut returned (run.mjs fillPage): at a larger size, nine characters a
    // line, page 4's lines end full and page 5 holds what is left
    const r = L2.layoutCut(han(32) as never, blocks(), 10, P('zh') as never)
    const again = L2.layoutAt(r.tokens as never, blocks(), 10, P('zh') as never, { ...r.layout.state, scale: 1.1 })
    expect(again.clipped).toBe(false)
    expect(again.lines.filter(l => l.page === 4).every(l => l.mode === 'just')).toBe(true)
    expect(again.lines.filter(l => l.page === 5).length).toBeGreaterThan(0)
  })
})

describe("a held page break's fate is the breaker's, in every lay of the unit (the cloud review of #517)", () => {
  const han = (n: number) => Array.from({ length: n }, (_, k) => ({ s: String.fromCodePoint(0x4e00 + k), cls: 'cjk', w100: 100, st: {}, face, at: k, end: k + 1 }))
  it("where the line that holds a break is its run's last: the breaker lays that line on page B", () => {
    // 20 words, all on page 3's three lines without the break (8, 8, 4); the break in the third: it would end the unit's
    // last line and give page 4 nothing, so that line goes to page 4, and page 3 ends with its second line, full
    const r = laidWith(words(20), [{ page: 4, at: 36 }], [block(3, 500, 3), block(4, 700, 3)])
    expect(r.layout.lines.map(x => [x.page, x.mode])).toEqual([[3, 'just'], [3, 'just'], [4, 'last']])
  })
  it("never where text of the run goes on after that line: a kept region's placeholder inside the run is no run's end", () => {
    const tokens = words(20)
    tokens.splice(22, 0, { blockTo: 0, w100: 0 } as never)
    const r = laidWith(tokens, [{ page: 4, at: 18 }], [block(3, 500, 3), block(4, 700, 3)])
    expect(r.layout.lines.map(x => [x.page, x.mode])).toEqual([[3, 'just'], [3, 'just'], [4, 'last']])
  })
  it('two breaks in one line: each page gets its line, the later break held by the line the earlier one opened', () => {
    // pages 1, 2 and 3, ten characters a line, both breaks inside the first line: page 1's line ends full, page 2 takes the
    // next line, page 3 the rest
    const r = laidWith(han(30), [{ page: 2, at: 3 }, { page: 3, at: 6 }], [block(1, 500, 3), block(2, 700, 3), block(3, 700, 3)], 'zh')
    expect([r.layout.clipped, pagesOf(r.layout)]).toEqual([false, [1, 2, 3]])
    // (where the text left after page 2's line is none, page 3 gets none: page 2 is never skipped)
    const short = laidWith(words(14), [{ page: 4, at: 2 }, { page: 5, at: 6 }], [block(3, 500, 3), block(4, 700, 3), block(5, 700, 3)])
    expect(pagesOf(short.layout)).toEqual([3, 4])
  })
  it("a later lay that makes the line holding a break its run's last lays that line on the break's page (the page fill)", () => {
    // 21 characters, the break before the 20th: page 4's second line holds it and page 5 the last character; laid again at
    // 1.1 (nine a line), the third line holds it and is the unit's last: it goes to page 5 whole
    const bs = [block(4, 500, 5), block(5, 700, 3)]
    const r = laidWith(han(21), [{ page: 5, at: 19 }], bs, 'zh')
    expect(pagesOf(r.layout)).toEqual([4, 4, 5])
    const again = L2.layoutAt(r.tokens as never, bs as never, 10, P('zh') as never, { ...r.layout.state, scale: 1.1 })
    expect([again.clipped, pagesOf(again)]).toEqual([false, [4, 4, 5]])
  })
  it("a forced break ending the line that holds a break, the unit ending there: that line on the break's page", () => {
    const r = laidWith([...words(20), { newline: 0, room: 0, w100: 0 }], [{ page: 4, at: 36 }], [block(3, 500, 3), block(4, 700, 3)])
    expect(counts(r.layout)).toEqual([[3, 8], [3, 8], [4, 4]])
  })
})
