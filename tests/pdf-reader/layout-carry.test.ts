import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { type DocToken, tokenizeDocument } from '@/pdf-reader/engine/pipeline/anchors.mjs'
import { readArxivText } from '@/pdf-reader/engine/layout/arxiv.mjs'
import { carrier, carrierOf, DRIFT_LINES, LINE_PLACE, lineCheckOf, linesOf, PAGE_SAME, tokensOfMarks } from '@/pdf-reader/engine/layout/carry.mjs'
import { encodeLayoutMarks, layoutMarksOf, parseLayoutMarks } from '@/pdf-reader/engine/layout/marks.mjs'

// The line check (carry.mjs): our compile's lines found on arXiv's PDF. Our compile is not arXiv's file (another TeX Live,
// another day), so each line is matched to arXiv's by its words; the share found is the check, no position is carried (our
// compile is the base page). Token lists are written here

const H = 10
const tok = (t: string, page: number, x: number, y: number, w: number, h = H): DocToken => ({ t, page, x, y, w, h, top: y + 0.75 * h, bottom: y - 0.22 * h })
/** a line of words on one baseline from x: 5 pt a letter, `gap` between words (or each gap of `gap` when an array) */
function words(ws: string[], page: number, x: number, y: number, gap: number | number[] = 3): DocToken[] {
  let at = x
  return ws.map((t, i) => { const k = tok(t, page, at, y, 5 * t.length); at += 5 * t.length + (Array.isArray(gap) ? (gap[i] ?? 3) : gap); return k })
}
const end = (t: DocToken | undefined) => (t ? t.x + t.w : Number.NaN)
const at = (ts: DocToken[], i: number) => { const t = ts[i]; if (!t) throw new Error(`no token ${i}`); return t }
/** the lines found, of all kinds */
const found = (c: { lines: { same: number; moved: number; respaced: number; fuzzy: number } }) => c.lines.same + c.lines.moved + c.lines.respaced + c.lines.fuzzy
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
  it('a line moved whole is found, moved', () => {
    const ws = ['attention', 'is', 'all', 'you', 'need']
    const c = carrierOf(words(ws, 1, 72, 700), words(ws, 1, 72, 699.39))
    expect(c.lines).toEqual({ total: 1, same: 0, moved: 1, respaced: 0, fuzzy: 0 })
    expect(c.pageLines.get(1)).toEqual([1, 1])
    expect(carrierOf(words(ws, 1, 72, 700), words(ws, 1, 72, 700)).lines).toMatchObject({ total: 1, same: 1 })
  })

  it('a line moved whole within 0.1 pt a word is still whole; past it, it is respaced', () => {
    const ws = ['one', 'two', 'three']
    expect(carrierOf(words(ws, 1, 72, 700), words(ws, 1, 72.05, 700, [3.08, 3])).lines).toMatchObject({ moved: 1, respaced: 0 })
    expect(carrierOf(words(ws, 1, 72, 700), words(ws, 1, 72, 700, [3.11, 3])).lines).toMatchObject({ moved: 0, respaced: 1 })
  })

  it('a line set at other spaces is found between the same words', () => {
    const ws = ['we', 'propose', 'a', 'new', 'network']
    expect(carrierOf(words(ws, 1, 72, 700, 3), words(ws, 1, 72, 698, [4, 6, 2.5, 5])).lines).toEqual({ total: 1, same: 0, moved: 0, respaced: 1, fuzzy: 0 })
  })

  it('a line whose footnote number is glued to the next word in one PDF matches by 80 % of its words', () => {
    // ours: "vaswani 1and" with the number glued to the word after it; arXiv's: the number raised on its own
    const ours = [...TEN]
    ours[4] = '1and'
    const theirs = words(TEN, 1, 72, 699, 3.5)
    const raised = tok('1', 1, end(at(theirs, 3)) + 0.5, 702, 2.5, 7)
    const arxiv = [...theirs.slice(0, 4), raised, ...theirs.slice(4)]
    expect(carrierOf(words(ours, 1, 72, 700), arxiv).lines).toEqual({ total: 1, same: 0, moved: 0, respaced: 0, fuzzy: 1 })
    // 7 of 10 words in order: not found
    const seven = [...TEN]
    seven[1] = 'x1'; seven[4] = 'x2'; seven[7] = 'x3'
    expect(carrierOf(words(seven, 1, 72, 700), arxiv).lines).toEqual({ total: 1, same: 0, moved: 0, respaced: 0, fuzzy: 0 })
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
    expect(c.lines).toEqual({ total: 5, same: 0, moved: 2, respaced: 0, fuzzy: 2 })
    expect(c.pageLines.get(1)).toEqual([4, 5])
  })

  it('the partner nearest by page; two pages away none', () => {
    const ws = ['results', 'on', 'imagenet']
    const marked = words(ws, 2, 72, 400)
    expect(carrierOf(marked, [...words(ws, 1, 72, 400), ...words(ws, 2, 72, 300), ...words(ws, 2, 72, 402), ...words(ws, 3, 72, 400)]).lines).toMatchObject({ total: 1, moved: 1 })
    expect(carrierOf(marked, [...words(ws, 1, 72, 400), ...words(ws, 3, 72, 402)]).lines).toMatchObject({ total: 1, moved: 1 })
    expect(found(carrierOf(marked, words(ws, 4, 72, 400)))).toBe(0)
  })

  it('words that occur more than once on a page are found only near where their neighbours put them; once on each side, at any distance', () => {
    const ws = ['the', 'same', 'five', 'words', 'here'], A = ['alpha', 'beta', 'gamma', 'delta'], B = ['red', 'green', 'blue', 'cyan']
    // ours: a unique line, then the repeated one; arXiv: the same, 0.61 pt lower, and the repeated words again 575 pt away
    const marked = [...words(A, 1, 72, 700), ...words(ws, 1, 72, 686), ...words(B, 1, 72, 660)]
    expect(found(carrierOf(marked, [...words(A, 1, 72, 699.39), ...words(ws, 1, 72, 685.39), ...words(B, 1, 72, 659.39), ...words(ws, 1, 72, 111)]))).toBe(3)
    // the near one gone: the far one is not taken, the words being twice on arXiv's page
    expect(found(carrierOf(marked, [...words(A, 1, 72, 699.39), ...words(B, 1, 72, 659.39), ...words(ws, 1, 72, 111), ...words(ws, 1, 72, 90)]))).toBe(2)
    // twice on our page, once on arXiv's: the far one is not taken either
    expect(found(carrierOf([...marked, ...words(ws, 1, 72, 300)], [...words(A, 1, 72, 699.39), ...words(B, 1, 72, 659.39), ...words(ws, 1, 72, 111)]))).toBe(2)
    // once on each side: taken however far it is
    expect(found(carrierOf(marked, [...words(A, 1, 72, 699.39), ...words(B, 1, 72, 659.39), ...words(ws, 1, 72, 111)]))).toBe(3)
    // one symbol of a display, the same symbol 8.3 pt away on a page where nothing moved (2608.04322): not found
    const sym = [...words(A, 1, 72, 700), tok('l', 1, 100, 686, 3), tok('l', 1, 300, 600, 3), ...words(B, 1, 72, 660)]
    const ours = [...words(A, 1, 72, 700), tok('l', 1, 100, 677.7, 3), tok('l', 1, 300, 600, 3), ...words(B, 1, 72, 660)]
    expect(carrierOf(ours, sym).pageLines.get(1)).toEqual([3, 4])
  })

  it('a page that costs more than its work bound finds none of its lines, and is listed', () => {
    // 8,000 lines of one word alike on a page: every pair of them compared would be 64 million comparisons
    const many = Array.from({ length: 8000 }, (_, i) => tok('x', 1, 72, 790 - i * 0.09, 3, 0.1))
    const other = words(['attention', 'is', 'all', 'you', 'need'], 2, 72, 700)
    const c = carrierOf([...many, ...other], [...many, ...other])
    expect(c.over).toEqual([1])
    expect(c.pageLines.get(1)).toEqual([0, 8000])
    expect(c.pageLines.get(2)).toEqual([1, 1])
    // two lines of 900 words with no signature alike, on 60 lines a page: the runs between them, 810,000 cells a pair
    const long = (seed: number, page: number, y: number) => Array.from({ length: 900 }, (_, i) => tok(`w${(i * seed) % 997}`, page, 72 + i * 0.5, y, 0.4, 2))
    const ours = Array.from({ length: 30 }, (_, i) => long(3 + i, 1, 700 - i * 2)).flat()
    const theirs = Array.from({ length: 30 }, (_, i) => long(5 + i, 1, 700 - i * 2)).flat()
    expect(carrierOf(ours, theirs).over).toEqual([1])
    expect(carrierOf(words(['a', 'b'], 1, 72, 700), words(['a', 'b'], 1, 72, 700)).over).toEqual([])
  })

  it('a line not on arXiv\'s page is not found; no tokens, no line', () => {
    const ws = ['attention', 'is', 'all', 'you', 'need']
    const c = carrierOf([...words(ws, 1, 72, 700), ...words(['not', 'in', 'arxiv'], 1, 72, 600)], words(ws, 1, 72, 700))
    expect(c.lines).toEqual({ total: 2, same: 1, moved: 0, respaced: 0, fuzzy: 0 })
    expect(carrierOf([], []).lines).toEqual({ total: 0, same: 0, moved: 0, respaced: 0, fuzzy: 0 })
  })

  it('a line whose words stand together once inside one longer arXiv line near it is found', () => {
    // 1706's two panel titles on one baseline: ours keeps them two lines (the figure's frame between them in its order),
    // arXiv's text layer one
    const a = ['scaled', 'dot', 'product', 'attention'], b = ['multi', 'head', 'attention']
    const ours = [...words(a, 4, 147.8, 713.3), ...words(['frame'], 4, 200, 600), ...words(b, 4, 363.6, 713.3)]
    const theirs = [...words([...a, ...b], 4, 150, 713.3, [3, 3, 3, 98, 3, 3])]
    expect(carrierOf(ours, theirs).lines.fuzzy).toBe(2)
    // a heading arXiv runs on into a figure's own text, which ours draws as a frame
    expect(carrierOf(words(['attention', 'visualizations'], 13, 108, 710), words(['attention', 'visualizations', 'input', 'input', 'layer5'], 13, 108, 710)).lines.fuzzy).toBe(1)
    // not: the words twice in the line, two such lines, one word alone, a line beyond WINDOW
    expect(found(carrierOf(words(['the', 'model'], 1, 72, 700), words(['the', 'model', 'and', 'the', 'model'], 1, 72, 700)))).toBe(0)
    expect(found(carrierOf(words(['the', 'model'], 1, 72, 700), [...words(['the', 'model', 'is'], 1, 72, 700), ...words(['of', 'the', 'model'], 1, 72, 690)]))).toBe(0)
    expect(found(carrierOf(words(['model'], 1, 72, 700), words(['the', 'model', 'is'], 1, 72, 700)))).toBe(0)
    expect(found(carrierOf(words(['the', 'model'], 1, 72, 700), words(['the', 'model', 'is'], 1, 72, 650)))).toBe(0)
  })

  it('counts', () => {
    const same = ['same', 'place', 'here'], moved = ['moved', 'down', 'whole'], spaced = ['set', 'at', 'other', 'spaces']
    const fuzzy = [...TEN], lost = ['reflowed', 'away', 'entirely']
    const marked = [...words(same, 1, 72, 700), ...words(moved, 1, 72, 650), ...words(spaced, 1, 72, 600), ...words(fuzzy.map((w, j) => (j === 4 ? '2and' : w)), 1, 72, 550), ...words(lost, 1, 72, 500)]
    const arxiv = [...words(same, 1, 72, 700), ...words(moved, 1, 72, 649.39), ...words(spaced, 1, 72, 600, 5), ...words(fuzzy, 1, 72, 550)]
    expect(carrierOf(marked, arxiv).lines).toEqual({ total: 5, same: 1, moved: 1, respaced: 1, fuzzy: 1 })
  })
})

// The page-and-line check judges each line in place or not (the layer route's step 2): our base page is to be arXiv's page, so a
// line found elsewhere (another TeX Live re-breaking the paper: 2307.16209's thesis, 48 % of its lines moved on TeX Live 2025)
// is found but not in place; in place, the median of its words' offsets within LINE_PLACE on its own page, of any kind
// (dvipdfmx's DVI against arXiv's dvips sets words up to 0.42 pt apart: respaced, in place). The maker lays a unit by them
describe('lineCheckOf: the lines in place', () => {
  it('counts a line found on its page within LINE_PLACE, whole or respaced; one moved further, or onto another page, is found and not in place', () => {
    expect(LINE_PLACE).toBe(0.5)
    const A = ['alpha', 'beta', 'gamma'], B = ['delta', 'eps', 'zeta'], C = ['eta', 'theta', 'iota'], D = ['kappa', 'lambda', 'mu']
    const ours = [...words(A, 1, 72, 700), ...words(B, 1, 72, 680), ...words(C, 1, 72, 660), ...words(D, 1, 72, 640)]
    // (A in place; B 0.4 pt off at its first word, 0.2 at the others, respaced; C moved 12 pt; D onto page 2)
    const arxiv = [...words(A, 1, 72, 700), ...words(B, 1, 72.4, 680, [2.8, 3]), ...words(C, 1, 72, 648), ...words(D, 2, 72, 640)]
    const got = lineCheckOf(ours, arxiv)
    expect(got.lines).toMatchObject({ total: 4, same: 1, respaced: 1, moved: 2, placed: 2 })
    expect(got.pageLines.get(1)).toEqual([2, 4])
    expect([...got.inPlace]).toEqual([1, 1, 0, 0])
    expect(got.lineAt.map(p => p && [p.page, Math.round(p.dx * 100) / 100, Math.round(p.dy * 100) / 100])).toEqual([[1, 0, 0], [1, 0.2, 0], [1, 0, -12], [2, 0, 0]])
    // (the carrier's own counts, every line found, as before)
    expect(carrierOf(ours, arxiv).pageLines.get(1)).toEqual([4, 4])
    expect(lineCheckOf(ours, ours).lines).toMatchObject({ total: 4, same: 4, placed: 4 })
    expect(lineCheckOf([], []).lines).toMatchObject({ total: 0, placed: 0 })
  })

  it('page by page it is the same as at once', () => {
    const ours = [...words(TEN, 1, 72, 700), ...words(TEN, 2, 72, 700)], arxiv = [...words(TEN, 1, 72, 700), ...words(TEN, 2, 72, 690)]
    const c = carrier(ours, arxiv)
    c.add(0, TEN.length)
    c.add(TEN.length, ours.length)
    expect([...c.pagePlaced]).toEqual([...lineCheckOf(ours, arxiv).pageLines])
    expect(c.placed).toBe(1)
  })

  it('a line is in place by the median of its words\' offsets: a label set apart alone is no line moved; words that drift across it are', () => {
    // 2610.19159's list: the item's label 0.6 pt left, the rest of its line where it was (first word's offset 0.6: not in place)
    const item = ['12.', 'the', 'model', 'is', 'trained', 'here']
    const ours = words(item, 1, 72, 700), label = words(item, 1, 72, 700).map((t, j) => (j === 0 ? { ...t, x: t.x - 0.6 } : t))
    expect([...lineCheckOf(ours, label).inPlace]).toEqual([1])
    expect(lineCheckOf(ours, label).lineAt[0]).toMatchObject({ page: 1, dx: 0, dy: 0, whole: false, fuzzy: false, pairs: null })
    // 2608.16117's line of glyphs set wider: its words 3.2 pt left at its start, none at its end (median 1.6: not in place)
    const drift = words(item, 1, 72, 700).map((t, j) => ({ ...t, x: t.x - 3.2 * (1 - j / (item.length - 1)) }))
    expect([...lineCheckOf(ours, drift).inPlace]).toEqual([0])
    expect(lineCheckOf(ours, drift).lineAt[0]?.dx).toBeCloseTo(-1.6, 5)
    // a line moved whole 0.6 pt: not in place, by its median as by its first word
    expect([...lineCheckOf(ours, words(item, 1, 72.6, 700)).inPlace]).toEqual([0])
    // the median of the words matched, for a fuzzy partner: the one word told otherwise is not counted
    const fuzzy = words(item.map((w, j) => (j === 3 ? '1is' : w)), 1, 72, 700.2)
    expect(lineCheckOf(ours, fuzzy).lineAt[0]).toMatchObject({ fuzzy: true, dy: expect.closeTo(0.2, 5) })
    expect([...lineCheckOf(ours, fuzzy).inPlace]).toEqual([1])
  })

  it('a line of no partner of the same words is in place where its twin stands: the same words but for their characters outside ASCII, at its baseline and both ends', () => {
    // 2610.21765: arXiv's text layer gives ε as "ǫ" (U+01EB), ours as ε: a line of one such word has a fuzzy partner (most of
    // its words), in place; a line of two of six has none, and its twin
    const one = lineCheckOf(words(['for', 'every', 'ε', 'the', 'bound', 'holds'], 1, 72, 700), words(['for', 'every', 'ǫ', 'the', 'bound', 'holds'], 1, 72, 700))
    expect(one.lineAt[0]).toMatchObject({ fuzzy: true })
    expect(one.lineAt[0]?.twin).toBeUndefined()
    expect([...one.inPlace]).toEqual([1])
    const ours = words(['let', 'ε', 'and', 'δε', 'be', 'small'], 1, 72, 700)
    const theirs = words(['let', 'ǫ', 'and', 'δǫ', 'be', 'small'], 1, 72, 700.3)
    const got = lineCheckOf(ours, theirs)
    expect([...got.inPlace]).toEqual([1])
    expect(got.lineAt[0]).toMatchObject({ page: 1, twin: true, fuzzy: true, dx: 0, dy: expect.closeTo(0.3, 5), pairs: null })
    expect(got.lines).toMatchObject({ total: 1, fuzzy: 1, placed: 1 })
    // a symbol alone too: "ǫ" and ε, both nothing within ASCII, at the same place
    expect([...lineCheckOf(words(['ε'], 1, 300, 650), words(['ǫ'], 1, 300, 650)).inPlace]).toEqual([1])
    // but not 0.6 pt off, at one end or at its baseline, or of other words within ASCII
    expect([...lineCheckOf(ours, words(['let', 'ǫ', 'and', 'δǫ', 'be', 'small'], 1, 72, 700.6)).inPlace]).toEqual([0])
    expect([...lineCheckOf(ours, words(['let', 'ǫ', 'and', 'δǫ', 'be', 'small'], 1, 72, 700, [3, 3, 3, 3, 3.6])).inPlace]).toEqual([0])
    expect([...lineCheckOf(ours, words(['let', 'ǫ', 'and', 'δǫ', 'be', 'smal'], 1, 72, 700, [3, 3, 3, 3, 8])).inPlace]).toEqual([0])
    // a line re-broken by another TeX Live keeps its ends (justified) but its words shift by one: never its twin
    const A = ['we', 'train', 'the', 'model', 'on', 'eight', 'gpus']
    const before = words(A.slice(0, 6), 1, 72, 700), after = words(A.slice(1, 7), 1, 72, 700)
    // (both lines justified to one measure)
    const right = (ts: DocToken[]) => end(ts.at(-1)), justify = (ts: DocToken[], to: number) => { const d = (to - right(ts)) / (ts.length - 1); return ts.map((t, j) => ({ ...t, x: t.x + d * j })) }
    const rebroken = justify(after, right(before))
    expect(Math.abs(end(rebroken.at(-1)) - end(before.at(-1)))).toBeLessThan(0.01)
    expect([...lineCheckOf(before, rebroken).inPlace]).toEqual([0])
    expect(lineCheckOf(before, rebroken).lineAt[0]?.twin).toBeUndefined()
  })

  it('a twin is a known text-layer substitution only (NFKC, and arXiv\'s "\u01eb" for \u03b5): distinct symbols at the same place are none (review of #437)', () => {
    const ours = words(['let', '\u03b5', 'and', '\u03b4\u03b5', 'be', 'small'], 1, 72, 700)
    // (\u03b4 for \u03b5 at the very same place: another symbol, not a glyph mapped otherwise)
    expect([...lineCheckOf(ours, words(['let', '\u03b4', 'and', '\u03b4\u03b4', 'be', 'small'], 1, 72, 700)).inPlace]).toEqual([0])
    expect([...lineCheckOf(words(['\u03b5'], 1, 300, 650), words(['\u03b4'], 1, 300, 650)).inPlace]).toEqual([0])
    // (NFKC's own equivalents: the lunate epsilon, a ligature)
    expect([...lineCheckOf(ours, words(['let', '\u03f5', 'and', '\u03b4\u03f5', 'be', 'small'], 1, 72, 700)).inPlace]).toEqual([1])
    expect([...lineCheckOf(words(['the', '\ufb01rst', 'of', '\u03b5', 'a', '\u03b5'], 1, 72, 700), words(['the', 'first', 'of', '\u01eb', 'a', '\u01eb'], 1, 72, 700, [3, -2, 3, 3, 3])).inPlace]).toEqual([1])
  })

  it('each of our tokens on its line, the rest of a word given in parts on none', () => {
    // a line with a raised footnote number (off its baseline, on the line), then a line holding the rest of a word alone
    const ours = [...words(['the', 'robustness', 'of', 'mod'], 1, 72, 700), tok('1', 1, 160, 703, 3, 7), tok('', 1, 72, 688, 20)]
    expect([...lineCheckOf(ours, ours).tokenLine]).toEqual([0, 0, 0, 0, 0, -1])
  })
})

// May we draw, per page (the split of 2026-10-23): a page is drawable where its words are arXiv's page's, PAGE_SAME of them in
// order, and none of its lines is found on another page; a line's offset, a re-break by a word, never refuses a page
describe('lineCheckOf: the pages that may be drawn', () => {
  const W = Array.from({ length: 100 }, (_, i) => `w${i}`)
  /** 100 words over 10 lines of a page */
  const page = (ws: string[], p: number, y = 700, x = 72) => ws.flatMap((_, j) => (j % 10 ? [] : words(ws.slice(j, j + 10), p, x, y - 12 * (j / 10))))
  it('a page of the same words is drawable whatever its lines\' offsets or breaks: moved, re-broken by a word', () => {
    expect(PAGE_SAME).toBe(0.98)
    const ours = page(W, 1)
    expect(lineCheckOf(ours, ours).pages).toEqual([{ page: 1, words: [100, 100], overlap: 1, elsewhere: 0, drawable: true }])
    // (every line 3 pt lower: not in place, drawable)
    const lower = lineCheckOf(ours, page(W, 1, 697))
    expect(lower.lines.placed).toBe(0)
    expect(lower.undrawable).toEqual([])
    // (re-broken by a word: lines of 9 and 11 words, the same words in order)
    const rebroken = [...words(W.slice(0, 9), 1, 72, 700), ...words(W.slice(9, 20), 1, 72, 688), ...page(W.slice(20), 1, 676)]
    expect(lineCheckOf(ours, rebroken).undrawable).toEqual([])
  })
  it('a page of other words is not: under PAGE_SAME of them in common, in order', () => {
    const ours = page(W, 1)
    // (one word of 100 other: 0.99; two: 0.98, still drawable; three: 0.97, not)
    const other = (n: number) => page(W.map((w, i) => (i < n ? `x${i}` : w)), 1)
    expect(lineCheckOf(ours, other(1)).pages[0]).toMatchObject({ overlap: 0.99, drawable: true })
    expect(lineCheckOf(ours, other(2)).pages[0]).toMatchObject({ overlap: 0.98, drawable: true })
    expect(lineCheckOf(ours, other(3)).pages[0]).toMatchObject({ overlap: 0.97, drawable: false })
    // (in order: two lines swapped, 0.9, but the same words, every one as many times: the same page)
    const swapped = page([...W.slice(10, 20), ...W.slice(0, 10), ...W.slice(20)], 1)
    expect(lineCheckOf(ours, swapped).pages[0]).toMatchObject({ overlap: 0.9, sameWords: true, drawable: true })
    // (two lines swapped and one word other: neither)
    const swappedOther = page([...W.slice(10, 20), ...W.slice(0, 10), ...W.slice(20, 99), 'x'], 1)
    expect(lineCheckOf(ours, swappedOther).pages[0]?.drawable).toBe(false)
    // (a word but for a known substitute is the same word; another symbol is not; case and punctuation are no word's)
    const eps = W.map((w, i) => (i === 5 ? '\u03b5' : i === 6 ? 'Word,' : w))
    expect(lineCheckOf(page(eps, 1), page(eps.map((w, i) => (i === 5 ? '\u01eb' : i === 6 ? 'word' : w)), 1)).pages[0]?.overlap).toBe(1)
    expect(lineCheckOf(page(eps, 1), page(eps.map((w, i) => (i === 5 ? '\u03b4' : w)), 1)).pages[0]?.overlap).toBe(0.99)
  })
  it('arXiv\'s stamp up its first page\'s margin is no word of the page', () => {
    const title = words(['isomonodromy', 'method', 'and', 'black', 'holes', 'brazil', '2023'], 1, 72, 700)
    // (as the text layer gives its tokens: the stamp's words, up the margin)
    const stamp = ['arXiv', '2307', '16209v1', 'hep', 'th', '30', 'Jul', '2023'].map((t, i) => tok(t, 1, 17, 253 + 50 * i, 19, 20))
    expect(lineCheckOf(title, [...title, ...stamp]).pages[0]).toMatchObject({ overlap: 1, drawable: true })
    const old = ['arXiv', 'hep', 'th', '9901001v1', '4', 'Jan', '1999'].map((t, i) => tok(t, 1, 17, 253 + 50 * i, 19, 20))
    expect(lineCheckOf(title, [...title, ...old]).pages[0]).toMatchObject({ overlap: 1, drawable: true })
    // (a citation of the paper's own text that reads like the stamp, on both pages, is kept on both: the page matches whole)
    const cite = words(['see', 'arxiv', '2301', '00001v2', 'cs', 'cl', '3', 'jan', '2023', 'for', 'details'], 1, 72, 650)
    expect(lineCheckOf([...title, ...cite], [...title, ...cite]).pages[0]).toMatchObject({ overlap: 1, drawable: true })
    expect(lineCheckOf([...title, ...cite].map(t => ({ ...t, page: 2 })), [...title, ...cite].map(t => ({ ...t, page: 2 }))).pages[0]).toMatchObject({ overlap: 1, drawable: true })
    // (and a stamp's words on a later page, in arXiv's alone, are no stamp: only the first page carries it)
    expect(lineCheckOf(title.map(t => ({ ...t, page: 2 })), [...title, ...stamp].map(t => ({ ...t, page: 2 }))).pages[0]?.drawable).toBe(false)
    // (words of the paper's that read alike are kept)
    expect(lineCheckOf(title, [...title, ...words(['arxiv', 'is', 'a', 'server'], 1, 72, 600)]).pages[0]?.drawable).toBe(false)
  })

  it('a page whose lines moved across its breaks is drawn, at most DRIFT_LINES at each end: compile drift (2610.30854v1, the owner\'s ruling of 2026-10-30)', () => {
    expect(DRIFT_LINES).toBe(4)
    // (our page 1's last line is arXiv's page 2's first: our compile sets a line more on page 1, as 30854's kernel did; both
    // pages are arXiv's but for that line, each drawn, the line alone with no partner on the page beside ours)
    const V = W.map(w => `v${w}`)
    const ours = [...page(W, 1), ...page(V, 2)]
    const theirs = [...page(W.slice(0, 90), 1), ...words(W.slice(90), 2, 72, 712), ...page(V, 2)]
    const got = lineCheckOf(ours, theirs)
    expect(got.pages.map(p => [p.page, p.elsewhere, p.drift, p.drawable])).toEqual([[1, 1, [0, 1], true], [2, 0, [1, 0], true]])
    expect(got.undrawable).toEqual([])
    // (arXiv's tokens of that line, which our page 1 holds: what the hover must not copy onto our page 2)
    expect([...(got.moved.get(2) ?? [])].map(k => theirs[k]?.t)).toEqual(W.slice(90))
    // (four lines at an end: drawn; five: not, on either side of the break)
    const behind = (n: number) => lineCheckOf([...page(W, 1), ...page(V, 2)], [...page(W.slice(0, 100 - 10 * n), 1), ...page(W.slice(100 - 10 * n), 2, 712 + 12 * (n - 1)), ...page(V, 2)])
    expect(behind(4).undrawable).toEqual([])
    expect(behind(4).pages.map(p => p.drift)).toEqual([[0, 4], [4, 0]])
    expect(behind(5).undrawable).toEqual([1, 2])
  })
  it('but not a page whose rest differs, nor one whose line is found two pages away', () => {
    const V = W.map(w => `v${w}`), U = W.map(w => `u${w}`)
    // (the moved line taken out, a line of other words besides: under PAGE_SAME)
    const other = [...page(W.slice(0, 90), 1), ...words(W.slice(90), 2, 72, 712), ...page(V.map((w, i) => (i < 10 ? `x${i}` : w)), 2)]
    expect(lineCheckOf([...page(W, 1), ...page(V, 2)], other).undrawable).toEqual([2])
    // (our page 1's last line on arXiv's page 3: no drift, a paper read in another order)
    const ours = [...page(W, 1), ...page(V, 2), ...page(U, 3)]
    const theirs = [...page(W.slice(0, 90), 1), ...page(V, 2), ...words(W.slice(90), 3, 72, 712), ...page(U, 3)]
    expect(lineCheckOf(ours, theirs).undrawable).toEqual([1, 3])
  })
  it("but a line too short to be evidence, a figure's one-letter axis label, decides nothing (2610.21765v1 p7's \"q\" on arXiv's p6)", () => {
    // (our page 2's "q", an axis label, is a line of its own; arXiv's page 1 has one, its page 2 none — read into the word before
    // it — and the carrier pairs our "q" with arXiv's page 1)
    const ours = [...page(W, 1), ...page(W.map(w => `v${w}`), 2), ...words(['q'], 2, 300, 200)]
    const theirs = [...page(W, 1), ...words(['q'], 1, 300, 200), ...page(W.map(w => `v${w}`), 2)]
    const got = lineCheckOf(ours, theirs)
    expect(got.undrawable).toEqual([])
    expect(got.pages.find(p => p.page === 2)).toMatchObject({ elsewhere: 0, drawable: true })
  })
  it('a page past its work, or past its words\' bound, is not', () => {
    const many = Array.from({ length: 8000 }, (_, i) => tok('x', 1, 72, 790 - i * 0.09, 3, 0.1))
    const other = words(['attention', 'is', 'all', 'you', 'need'], 2, 72, 700)
    const got = lineCheckOf([...many, ...other], [...many, ...other])
    expect(got.over).toEqual([1])
    expect(got.undrawable).toEqual([1])
    expect(got.inPlace[8000]).toBe(1)
  })
})

describe('carrierOf, the review of 2026-10-06', () => {
  it('a page of words each repeated finds every line its neighbours once, not by a search a line', () => {
    // 64,000 one-word lines, each word twice on each side: no line unique, each looking for a unique neighbour
    const ts = Array.from({ length: 64000 }, (_, i) => tok(`w${i >> 1}`, 1, 72, 790 - i * 0.01, 3, 0.005))
    const c = carrierOf(ts, ts)
    expect(c.lines.total).toBe(64000)
    expect(c.lines.same).toBe(64000)
    // a search a line took 11.3 s on a laptop, the neighbours found once 0.2 s: the bound is the test's time
  }, 3000)

  it("a page's work is bounded on its own: no bound of the paper's makes a later page carry nothing, at once or page by page", () => {
    // 1,400 one-word lines alike on each page: about 2 million each, under the page's bound; twelve of them, 23.5 million in
    // all, every one carried (a long book's real work grows with its pages: 8.6 million on 2310.20360's 737 pages)
    const page = (p: number) => Array.from({ length: 1400 }, (_, i) => tok(`x${p}`, p, 72, 790 - i * 0.5, 3, 0.4))
    expect(carrierOf(page(1), page(1)).over).toEqual([])
    const all = Array.from({ length: 12 }, (_, p) => page(p + 1)).flat()
    const whole = carrierOf(all, all)
    expect(whole.over).toEqual([])
    expect(whole.pageLines.get(12)).toEqual([1400, 1400])
    const paged = carrier(all, all)
    for (const [a, b] of pageRanges(all)) paged.add(a, b)
    expect(paged.over).toEqual([])
    expect(paged.lines).toEqual(whole.lines)
    // a page past its own bound alone: 3,000 such lines on page 5
    const heavy = Array.from({ length: 3000 }, (_, i) => tok('x5', 5, 72, 790 - i * 0.25, 3, 0.2))
    const mixed = [...page(4), ...heavy, ...page(6)]
    expect(carrierOf(mixed, mixed).over).toEqual([5])
    // about 70 million steps by design: seconds alone, longer in the full suite on a loaded machine; the row holds the
    // bound's effect, not its speed
  }, 120_000)

  it("words twice on arXiv's page are not unique there, whatever the page beside it holds", () => {
    const ws = ['results', 'on', 'imagenet']
    // twice on its own page, both far; once on the next page: not found at all
    const c = carrierOf(words(ws, 2, 72, 400), [...words(ws, 2, 72, 300), ...words(ws, 2, 72, 380), ...words(ws, 3, 72, 700)])
    expect(found(c)).toBe(0)
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
    const direct = tokenizeDocument([{ page: 1, items, styles }])
    expect(back.map(t => [t.t, t.page, t.x, t.y, t.w, t.h])).toEqual(direct.map(t => [t.t, t.page, r2(t.x), r2(t.y), r2(t.w), r2(t.h)]))
    // the word cut by a hyphen is one word, its rest a token of no text after it (word -1 in the file)
    expect(back.map(t => t.t)).toContain('attention')
    expect(back.map(t => t.t)).not.toContain('atten')
    const k = back.findIndex(t => t.t === '')
    expect(back[k - 1]?.t).toBe('attention')
    expect(back[k]).toMatchObject({ x: 72, y: 688.13 })
    expect(m.tokens[6 * k + 5]).toBe(-1)
    for (const t of back) {
      expect(t.top).toBeCloseTo(t.y + 0.75 * t.h, 9)
      expect(t.bottom).toBeCloseTo(t.y - 0.22 * t.h, 9)
    }
    // and its lines are the document's
    expect(linesOf(back).map(l => [l.page, l.sig])).toEqual(linesOf(direct).map(l => [l.page, l.sig]))
    expect(linesOf(back).map(l => l.sig)).toEqual(['attention is all you need and attention', 'is what we use', 'attention'])
    // checked against the same document: every line where it was
    expect(carrierOf(back, direct).lines).toMatchObject({ total: 3, same: 3 })
  })
})

// the carrier a page at a time (the page stream, E2a): arXiv's tokens whole, the marked pages added as they are read
/** the marked tokens' page ranges, in their order (the tokens go page by page) */
const pageRanges = (ts: readonly DocToken[]) => {
  const out: [number, number][] = []
  ts.forEach((t, k) => { if (!out.length || ts[k - 1]?.page !== t.page) out.push([k, k + 1]); else (out.at(-1) as [number, number])[1] = k + 1 })
  return out
}
/** carrierOf's and the page-by-page carrier's lines found, of all and of each page: the number of pages compared */
function sameCarry(marked: DocToken[], arxiv: DocToken[]) {
  const whole = carrierOf(marked, arxiv), paged = carrier(marked, arxiv)
  for (const [a, b] of pageRanges(marked)) paged.add(a, b)
  expect(paged.lines).toEqual(whole.lines)
  expect(paged.over).toEqual(whole.over)
  expect([...paged.pageLines]).toEqual([...whole.pageLines])
  // (each line's partner and verdict, each token's line)
  expect(paged.lineAt).toEqual(whole.lineAt)
  expect(paged.inPlace).toEqual(whole.inPlace)
  expect(paged.tokenLine).toEqual(whole.tokenLine)
  return whole.pageLines.size
}

describe('carrier: carrierOf a page at a time', () => {
  it('three pages, a line moved to the next page, a respaced line, a fuzzy one, a word given in parts', () => {
    const marked = [
      ...words(TEN, 1, 72, 700), ...words(['attention', 'is', 'all', 'you', 'need'], 1, 72, 688),
      ...words(['we', 'propose', 'a', 'new', 'network'], 2, 72, 700), tok('archi', 2, 72, 688, 25), tok('', 2, 97, 688, 20),
      ...words(['the', 'last', 'page', 'line'], 3, 72, 700),
    ]
    const ours = [...TEN]
    ours[4] = '1and'
    const arxiv = [
      ...words(ours, 1, 72, 699), ...words(['we', 'propose', 'a', 'new', 'network'], 1, 72, 600, [4, 6, 2.5, 5]),
      ...words(['attention', 'is', 'all', 'you', 'need'], 2, 72, 699.4), tok('architecture', 2, 72, 680, 45),
      ...words(['the', 'last', 'page', 'line'], 3, 72, 700),
    ]
    expect(sameCarry(marked, arxiv)).toBe(3)
  })

  it('a page added twice, or a range that is not whole pages, is refused', () => {
    const marked = [...words(TEN, 1, 72, 700), ...words(TEN, 2, 72, 700)]
    const c = carrier(marked, words(TEN, 1, 72, 700))
    c.add(0, 10)
    expect(() => c.add(5, 10)).toThrow(RangeError)
    c.add(10, 20)
    expect(c.lines.total).toBe(2)
  })
})

// the lab's papers (AXT_LAB): each marks file's tokens and arXiv's PDF read by step T
const LAB = process.env.AXT_LAB
const labIds = LAB && existsSync(join(LAB, 'data/layout')) ? readdirSync(join(LAB, 'data/layout')).filter(id => existsSync(join(LAB, 'data/layout', id, 'arxiv.pdf')) && existsSync(join(LAB, 'data/layout', id, 'marks.json'))) : []
describe.skipIf(!labIds.length)('carrier over the lab\'s papers: the same carry, page by page', () => {
  for (const id of labIds) {
    it(id, async () => {
      // (the tokens and words alone: an older marks file's schema need not be this engine's)
      const m = JSON.parse(readFileSync(join(LAB as string, 'data/layout', id, 'marks.json'), 'utf8'))
      const marked = tokensOfMarks(m)
      const task = getDocument({ data: new Uint8Array(readFileSync(join(LAB as string, 'data/layout', id, 'arxiv.pdf'))), verbosity: 0 })
      try {
        const { tokens } = await readArxivText((await task.promise) as never)
        expect(sameCarry(marked, tokens)).toBeGreaterThan(0)
      } finally { await task.destroy() }
    }, 300_000)
  }
})
