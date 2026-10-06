import { describe, expect, it } from 'vitest'
import { type DocToken, tokenizeDocument } from '@/pdf-reader/engine/anchors.mjs'
import { carrierOf, linesOf, tokensOfMarks } from '@/pdf-reader/engine/layout/carry.mjs'
import { encodeLayoutMarks, layoutMarksOf, parseLayoutMarks } from '@/pdf-reader/engine/layout/marks.mjs'

// The marked original's lines carried to arXiv's PDF: our compile is not arXiv's file (another TeX Live, another day), so
// each line is matched to arXiv's by its words, and a position on it moves with them. Token lists are written here

const H = 10
const tok = (t: string, page: number, x: number, y: number, w: number, h = H): DocToken => ({ t, page, x, y, w, h, top: y + 0.75 * h, bottom: y - 0.22 * h })
/** a line of words on one baseline from x: 5 pt a letter, `gap` between words (or each gap of `gap` when an array) */
function words(ws: string[], page: number, x: number, y: number, gap: number | number[] = 3): DocToken[] {
  let at = x
  return ws.map((t, i) => { const k = tok(t, page, at, y, 5 * t.length); at += 5 * t.length + (Array.isArray(gap) ? (gap[i] ?? 3) : gap); return k })
}
const end = (t: DocToken | undefined) => (t ? t.x + t.w : Number.NaN)
const at = (ts: DocToken[], i: number) => { const t = ts[i]; if (!t) throw new Error(`no token ${i}`); return t }
const TEN = ['the', 'model', 'of', 'vaswani', 'and', 'its', 'variants', 'we', 'use', 'here']

describe('linesOf', () => {
  it('a line is the tokens on one baseline; its signature its words on that baseline', () => {
    const ts = [
      tok('a', 1, 72, 700, 5), tok('b', 1, 80, 700, 5),
      // a footnote's number, raised and smaller: on the line, not in its signature
      tok('1', 1, 86, 703, 3, 7), tok('c', 1, 90, 700, 5),
      // the rest of a word given in parts: no word of its own
      tok('', 1, 96, 700, 4),
      tok('d', 1, 72, 688, 5),
      // more than 30 pt left of the line's start: a line of its own
      tok('e', 1, 20, 688, 5),
      tok('f', 2, 72, 700, 5),
    ]
    const ls = linesOf(ts)
    expect(ls.map(l => [l.page, l.y, l.sig, l.tokens])).toEqual([[1, 700, 'a b c', [0, 1, 3]], [1, 688, 'd', [5]], [1, 688, 'e', [6]], [2, 700, 'f', [7]]])
    expect(ls[0]).toMatchObject({ x0: 72, x1: 95, h: 10 })
  })

  it('its baseline is the one most of its characters share, to a hundredth', () => {
    const [l] = linesOf([tok('xx', 1, 72, 700, 10), tok('yyyyy', 1, 90, 699.5, 25), tok('z', 1, 120, 700.004, 5)])
    expect(l?.y).toBe(699.5)
    expect(l?.sig).toBe('xx yyyyy z')
  })

  it('a line opened by a raised footnote number holds the words after it', () => {
    // the number 3.6 above the line and smaller, its words after it; and a subscript later in the line
    const ts = [tok('8', 1, 101.88, 66.57, 3.6, 7.3), ...words(['we', 'will', 'label', 'the', 'angular', 'parameters'], 1, 106, 62.95), tok('ang', 1, 250, 61.45, 10, 7), ...words(['while', 'for', 'the', 'radial'], 1, 262, 62.95)]
    const ls = linesOf(ts)
    expect(ls).toHaveLength(1)
    expect(ls[0]?.y).toBe(62.95)
    expect(ls[0]?.sig).toBe('we will label the angular parameters while for the radial')
  })

  it('a line holding no word of the median height keeps all its words in its signature', () => {
    // the baseline most characters share is the small word's; the word of the median height is off it
    const [l] = linesOf([tok('aa', 1, 72, 700, 10, 10), tok('bbbbb', 1, 85, 702, 25, 4)])
    expect(l?.y).toBe(702)
    expect(l?.sig).toBe('aa bbbbb')
    const [m] = linesOf([tok('p', 1, 72, 700, 5, 4)])
    expect(m?.sig).toBe('p')
  })
})

describe('carrierOf', () => {
  it('a line moved whole carries by its offset', () => {
    const ws = ['attention', 'is', 'all', 'you', 'need']
    const marked = words(ws, 1, 72, 700), arxiv = words(ws, 1, 72, 699.39)
    const c = carrierOf(marked, arxiv)
    // a mark between the second word and the third
    const x = (end(at(marked, 1)) + at(marked, 2).x) / 2
    const to = c.carry(1, x, 700)
    expect(to).not.toBeNull()
    expect(to?.page).toBe(1)
    expect(to?.x).toBeCloseTo(x, 9)
    expect(to?.y).toBeCloseTo(699.39, 9)
    expect(to?.whole).toBe(true)
    expect(c.lines).toEqual({ total: 1, same: 0, moved: 1, respaced: 0, fuzzy: 0 })
  })

  it('a line moved whole within 0.1 pt a word is still whole; past it, it is respaced', () => {
    const ws = ['one', 'two', 'three']
    const near = words(ws, 1, 72.05, 700, [3.08, 3])
    expect(carrierOf(words(ws, 1, 72, 700), near).carry(1, 80, 700)?.whole).toBe(true)
    const far = words(ws, 1, 72, 700, [3.11, 3])
    expect(carrierOf(words(ws, 1, 72, 700), far).carry(1, 80, 700)?.whole).toBe(false)
  })

  it('a line set at other spaces carries between the same words', () => {
    const ws = ['we', 'propose', 'a', 'new', 'network']
    const marked = words(ws, 1, 72, 700, 3), arxiv = words(ws, 1, 72, 698, [4, 6, 2.5, 5])
    const c = carrierOf(marked, arxiv)
    // a third of the way from word 2's end to word 3's start
    const m0 = end(at(marked, 1)), m1 = at(marked, 2).x, a0 = end(at(arxiv, 1)), a1 = at(arxiv, 2).x
    const to = c.carry(1, m0 + (m1 - m0) / 3, 700)
    expect(to?.whole).toBe(false)
    expect(to?.x).toBeCloseTo(a0 + (a1 - a0) / 3, 9)
    expect(to?.y).toBeCloseTo(698, 9)
    // a word's own edges land on its partner's
    expect(c.carry(1, at(marked, 3).x, 700)?.x).toBeCloseTo(at(arxiv, 3).x, 9)
    // before the first word and after the last: by that word's offset
    expect(c.carry(1, 70, 700)?.x).toBeCloseTo(70, 9)
    expect(c.carry(1, end(at(marked, 4)) + 2, 700)?.x).toBeCloseTo(end(at(arxiv, 4)) + 2, 9)
    expect(c.lines).toEqual({ total: 1, same: 0, moved: 0, respaced: 1, fuzzy: 0 })
  })

  it('a line whose footnote number is glued to the next word in one PDF matches by 80 % of its words', () => {
    // ours: "vaswani 1and" with the number glued to the word after it; arXiv's: the number raised on its own
    const ours = [...TEN]
    ours[4] = '1and'
    const marked = words(ours, 1, 72, 700)
    const theirs = words(TEN, 1, 72, 699, 3.5)
    const raised = tok('1', 1, end(at(theirs, 3)) + 0.5, 702, 2.5, 7)
    const arxiv = [...theirs.slice(0, 4), raised, ...theirs.slice(4)]
    const c = carrierOf(marked, arxiv)
    const to = c.carry(1, end(at(marked, 3)) + 1, 700)
    expect(to).not.toBeNull()
    expect(to?.whole).toBe(false)
    expect(to?.y).toBeCloseTo(699, 9)
    // between the words matched around it: "vaswani" and "its"
    expect(to?.x).toBeGreaterThan(end(at(theirs, 3)))
    expect(to?.x).toBeLessThan(at(theirs, 5).x)
    // a matched word lands on its partner
    expect(c.carry(1, at(marked, 7).x, 700)?.x).toBeCloseTo(at(theirs, 7).x, 9)
    expect(c.lines).toEqual({ total: 1, same: 0, moved: 0, respaced: 0, fuzzy: 1 })
    // 7 of 10 words in order: not carried
    const seven = [...TEN]
    seven[1] = 'x1'; seven[4] = 'x2'; seven[7] = 'x3'
    const none = carrierOf(words(seven, 1, 72, 700), arxiv)
    expect(none.carry(1, 80, 700)).toBeNull()
    expect(none.lines).toEqual({ total: 1, same: 0, moved: 0, respaced: 0, fuzzy: 0 })
  })

  it('a line on the next page is found; one 41 pt away on its page is not, but for a match of the same signature', () => {
    const A = ['one', 'two', 'three', 'four', 'five'], C = ['red', 'green', 'blue', 'cyan']
    const B = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa']
    const D = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'eiusmod']
    const F = ['north', 'south', 'east', 'west', 'up', 'down', 'left', 'right', 'in', 'out']
    const one = (ws: string[], i: number, w: string) => ws.map((x, j) => (j === i ? w : x))
    const marked = [...words(A, 1, 72, 600), ...words(B, 1, 72, 500), ...words(C, 1, 72, 300), ...words(D, 1, 72, 200), ...words(F, 1, 72, 100)]
    const arxiv = [
      ...words(B.map((w, j) => (j === 5 ? 'zed' : w)), 1, 72, 459), // 9 of 10 words, 41 pt away
      ...words(C, 1, 72, 259), // the same words, 41 pt away
      ...words(one(D, 3, 'sat'), 1, 72, 160), // 9 of 10 words, 40 pt away
      ...words(A, 2, 72, 700), // the same words, on the next page
      ...words(one(F, 2, 'est'), 2, 72, 50), // 9 of 10 words on the next page, where its place on the page says nothing
    ]
    const c = carrierOf(marked, arxiv)
    expect(c.carry(1, 80, 600)).toMatchObject({ page: 2, y: 700, whole: true })
    expect(c.carry(1, 80, 500)).toBeNull()
    expect(c.carry(1, 80, 300)).toMatchObject({ page: 1, y: 259, whole: true })
    expect(c.carry(1, 80, 200)).toMatchObject({ page: 1, y: 160, whole: false })
    expect(c.carry(1, 80, 100)).toMatchObject({ page: 2, y: 50, whole: false })
    expect(c.lines).toEqual({ total: 5, same: 0, moved: 2, respaced: 0, fuzzy: 2 })
  })

  it('the partner nearest by page, then by distance', () => {
    const ws = ['results', 'on', 'imagenet']
    const marked = words(ws, 2, 72, 400)
    // twice on its page (within NEAR of where it was: 402), once on the pages beside it
    const arxiv = [...words(ws, 1, 72, 400), ...words(ws, 2, 72, 300), ...words(ws, 2, 72, 402), ...words(ws, 3, 72, 400)]
    expect(carrierOf(marked, arxiv).carry(2, 80, 400)).toMatchObject({ page: 2, y: 402 })
    expect(carrierOf(marked, [...words(ws, 1, 72, 400), ...words(ws, 3, 72, 402)]).carry(2, 80, 400)).toMatchObject({ page: 1, y: 400 })
    // two pages away: not looked at
    expect(carrierOf(marked, words(ws, 4, 72, 400)).carry(2, 80, 400)).toBeNull()
  })

  it('words that occur more than once on a page carry only near where their neighbours put them; once on each side, at any distance', () => {
    const ws = ['the', 'same', 'five', 'words', 'here'], A = ['alpha', 'beta', 'gamma', 'delta'], B = ['red', 'green', 'blue', 'cyan']
    // ours: a unique line, then the repeated one; arXiv: the same, 0.61 pt lower, and the repeated words again 575 pt away
    const marked = [...words(A, 1, 72, 700), ...words(ws, 1, 72, 686), ...words(B, 1, 72, 660)]
    const near = [...words(A, 1, 72, 699.39), ...words(ws, 1, 72, 685.39), ...words(B, 1, 72, 659.39), ...words(ws, 1, 72, 111)]
    expect(carrierOf(marked, near).carry(1, 80, 686)).toMatchObject({ page: 1, y: 685.39, whole: true })
    // the near one gone: the far one is not taken, the words being twice on arXiv's page
    const far = [...words(A, 1, 72, 699.39), ...words(B, 1, 72, 659.39), ...words(ws, 1, 72, 111), ...words(ws, 1, 72, 90)]
    expect(carrierOf(marked, far).carry(1, 80, 686)).toBeNull()
    // twice on our page, once on arXiv's: the far one is not taken either
    expect(carrierOf([...marked, ...words(ws, 1, 72, 300)], [...words(A, 1, 72, 699.39), ...words(B, 1, 72, 659.39), ...words(ws, 1, 72, 111)]).carry(1, 80, 686)).toBeNull()
    // once on each side: taken however far it is
    expect(carrierOf(marked, [...words(A, 1, 72, 699.39), ...words(B, 1, 72, 659.39), ...words(ws, 1, 72, 111)]).carry(1, 80, 686)).toMatchObject({ page: 1, y: 111, whole: true })
    // a page TeX Live set lower, its lines all 27 pt down: the repeated line goes with its neighbours, not to the nearer copy
    const shifted = [...words(A, 1, 72, 673), ...words(ws, 1, 72, 659), ...words(B, 1, 72, 633), ...words(ws, 1, 72, 684)]
    expect(carrierOf(marked, shifted).carry(1, 80, 686)).toMatchObject({ page: 1, y: 659 })
    // one symbol of a display, the same symbol 8.3 pt away on a page where nothing moved (2608.04322): not carried
    const sym = [...words(A, 1, 72, 700), tok('l', 1, 100, 686, 3), tok('l', 1, 300, 600, 3), ...words(B, 1, 72, 660)]
    const ours = [...words(A, 1, 72, 700), tok('l', 1, 100, 677.7, 3), tok('l', 1, 300, 600, 3), ...words(B, 1, 72, 660)]
    expect(carrierOf(ours, sym).carry(1, 101, 677.7)).toBeNull()
    expect(carrierOf(ours, sym).carry(1, 301, 600)).toMatchObject({ page: 1, y: 600 })
  })

  it('a page that costs more than its work bound carries none of its lines, and is listed', () => {
    // 8,000 lines of one word alike on a page: every pair of them compared would be 64 million comparisons
    const many = Array.from({ length: 8000 }, (_, i) => tok('x', 1, 72, 790 - i * 0.09, 3, 0.1))
    const other = words(['attention', 'is', 'all', 'you', 'need'], 2, 72, 700)
    const c = carrierOf([...many, ...other], [...many, ...other])
    expect(c.over).toEqual([1])
    expect(c.carry(1, 73, 790)).toBeNull()
    expect(c.carry(2, 80, 700)).toMatchObject({ page: 2, y: 700, whole: true })
    // two lines of 900 words with no signature alike, on 60 lines a page: the runs between them, 810,000 cells a pair
    const long = (seed: number, page: number, y: number) => Array.from({ length: 900 }, (_, i) => tok(`w${(i * seed) % 997}`, page, 72 + i * 0.5, y, 0.4, 2))
    const ours = Array.from({ length: 30 }, (_, i) => long(3 + i, 1, 700 - i * 2)).flat()
    const theirs = Array.from({ length: 30 }, (_, i) => long(5 + i, 1, 700 - i * 2)).flat()
    expect(carrierOf(ours, theirs).over).toEqual([1])
    expect(carrierOf(words(['a', 'b'], 1, 72, 700), words(['a', 'b'], 1, 72, 700)).over).toEqual([])
  })

  it('a position on no line carries to null', () => {
    const ws = ['attention', 'is', 'all', 'you', 'need']
    const c = carrierOf([...words(ws, 1, 72, 700), ...words(['not', 'in', 'arxiv'], 1, 72, 600)], words(ws, 1, 72, 700))
    expect(c.carry(1, 80, 700)).toMatchObject({ page: 1, x: 80, y: 700, whole: true })
    // no line there: between lines, off the line's end, on a page with no lines
    expect(c.carry(1, 80, 650)).toBeNull()
    expect(c.carry(1, 72 + 200 + 2 * H + 1, 700)).toBeNull()
    expect(c.carry(3, 80, 700)).toBeNull()
    // a line not carried
    expect(c.carry(1, 80, 600)).toBeNull()
    expect(c.carry(Number.NaN, 80, 700)).toBeNull()
    expect(c.carry(1, Number.NaN, 700)).toBeNull()
    // no tokens at all
    expect(carrierOf([], []).carry(1, 0, 0)).toBeNull()
    expect(carrierOf([], []).lines).toEqual({ total: 0, same: 0, moved: 0, respaced: 0, fuzzy: 0 })
  })

  it('counts', () => {
    const same = ['same', 'place', 'here'], moved = ['moved', 'down', 'whole'], spaced = ['set', 'at', 'other', 'spaces']
    const fuzzy = [...TEN], lost = ['reflowed', 'away', 'entirely']
    const marked = [...words(same, 1, 72, 700), ...words(moved, 1, 72, 650), ...words(spaced, 1, 72, 600), ...words(fuzzy.map((w, j) => (j === 4 ? '2and' : w)), 1, 72, 550), ...words(lost, 1, 72, 500)]
    const arxiv = [...words(same, 1, 72, 700), ...words(moved, 1, 72, 649.39), ...words(spaced, 1, 72, 600, 5), ...words(fuzzy, 1, 72, 550)]
    expect(carrierOf(marked, arxiv).lines).toEqual({ total: 5, same: 1, moved: 1, respaced: 1, fuzzy: 1 })
  })
})

describe('tokensOfMarks', () => {
  it('tokensOfMarks round-trips a marks file\'s tokens into DocTokens', async () => {
    const styles = { f1: { ascent: 0.8, descent: -0.2, fontFamily: 'serif' } }
    const item = (str: string, x: number, y: number, width: number, hasEOL = false) => ({ str, transform: [10, 0, 0, 10, x, y], width, height: 10, fontName: 'f1', hasEOL, dir: 'ltr' })
    const items = [
      item('Attention is all you need,', 72.004, 700, 120.333), item('and atten-', 200, 700, 46.5, true),
      item('tion is what we use.', 72, 688.125, 95), item('Attention', 72, 676, 44.4),
    ]
    const doc = {
      numPages: 1,
      getPage: async () => ({ view: [0, 0, 612, 792], getTextContent: async () => ({ items, styles }) }),
      getDestinations: async () => new Map(),
      getPageIndex: async () => 0,
    }
    const m = parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(await layoutMarksOf(doc, '', { engine: 'pdflatex' }))))
    // the word repeated is written once
    expect(m.words.filter(w => w === 'attention')).toHaveLength(1)
    const back = tokensOfMarks(m)
    const r2 = (v: number) => Math.round(v * 100) / 100
    const direct = tokenizeDocument([{ page: 1, items, styles }]).filter(t => t.t)
    expect(back.map(t => [t.t, t.page, t.x, t.y, t.w, t.h])).toEqual(direct.map(t => [t.t, t.page, r2(t.x), r2(t.y), r2(t.w), r2(t.h)]))
    // the word cut by a hyphen is one word
    expect(back.map(t => t.t)).toContain('attention')
    expect(back.map(t => t.t)).not.toContain('atten')
    for (const t of back) {
      expect(t.top).toBeCloseTo(t.y + 0.75 * t.h, 9)
      expect(t.bottom).toBeCloseTo(t.y - 0.22 * t.h, 9)
    }
    // and its lines are the document's
    expect(linesOf(back).map(l => [l.page, l.sig])).toEqual(linesOf(direct).map(l => [l.page, l.sig]))
    expect(linesOf(back).map(l => l.sig)).toEqual(['attention is all you need and attention', 'is what we use', 'attention'])
    // carried onto the same document: every line where it was
    expect(carrierOf(back, direct).lines).toMatchObject({ total: 3, same: 3 })
  })
})
