import { describe, expect, it } from 'vitest'
import { boundsFromMarks, tokenizeDocument, uprightToken } from '@/pdf-reader/engine/pipeline/anchors.mjs'

// The layout marks a placeholder gets where what stands beside it was guessed at: the paper's own macro taken to look ahead
// (LOOKS_AHEAD: no closing mark on it, no mark at all on the piece after it), a macro glued to the word before taken for that
// word's letters (WORD_END), a unit whose start mark stands at no word (boundsFromMarks). Each guess is now read from what the
// paper says: a macro's definition (its arity, whether its body reads on) with TeX's answer for what follows a call of it (the
// mark probe), TeX's own box for a macro (whether it begins with a node apart from a word), the words on the mark's own line
// (the release-route sweep's 217 unanchored rows: 2610.21098, 2610.21547, 2610.21376, 2610.21201). Whether a mark so placed
// moves the page is checked under TeX by marks-invariant.test.ts

describe('boundsFromMarks with the maker\'s reach: a unit start mark that stands at no word', () => {
  // a line: a formula from x 100 to 160 (no token), then words; the unit's end mark after its last word
  const tok = (t: string, x: number, w = 20) => ({ t, page: 1, x, y: 500, w, h: 10 })
  const doc = [tok('Before', 40, 30), tok('is', 165), tok('a', 190, 8), tok('word.', 205, 30)]
  const reach = (_mk: { x: number }) => 1
  it('a start mark at no word, here and in its own compile (its word null): bounded by the word reached; else none, as before', () => {
    const marks = new Map([['7s', { page: 1, x: 100, y: 500, t: null }], ['7e', { page: 1, x: 236, y: 500, t: 'word.' }]])
    expect(boundsFromMarks(doc as never, marks).get('7')).toBeUndefined()
    expect(boundsFromMarks(doc as never, marks, undefined, reach).get('7')).toEqual([1, 3])
  })
  it('not where its own compile had a word there (a carried word that is not the page\'s): unplaced, as before', () => {
    const marks = new Map([['7s', { page: 1, x: 100, y: 500, t: 'Formula' }], ['7e', { page: 1, x: 236, y: 500, t: 'word.' }]])
    expect(boundsFromMarks(doc as never, marks, undefined, reach).get('7')).toBeUndefined()
  })
})

describe('boundsFromMarks with the maker\'s reachBack: a unit end mark that stands at no word', () => {
  // two lines: the unit's words, then a line of no word (a `\\}` set alone, a formula); the end mark on that second line
  const tok = (t: string, x: number, y: number, w = 20) => ({ t, page: 1, x, y, w, h: 10 })
  const doc = [tok('The', 40, 512), tok('unit', 65, 512), tok('ends.', 90, 512), tok('Next', 40, 480)]
  const reachBack = (_mk: { x: number }) => 2
  it('an end mark at no word, here and in its own compile (its word null): bounded by the word reached back; else none, as before', () => {
    const marks = new Map([['3s', { page: 1, x: 40, y: 512, t: 'The' }], ['3e', { page: 1, x: 30, y: 500, t: null }]])
    expect(boundsFromMarks(doc as never, marks).get('3')).toBeUndefined()
    expect(boundsFromMarks(doc as never, marks, undefined, null, reachBack).get('3')).toEqual([0, 2])
  })
  it('not where its own compile had a word there: unplaced, as before', () => {
    const marks = new Map([['3s', { page: 1, x: 40, y: 512, t: 'The' }], ['3e', { page: 1, x: 30, y: 500, t: 'brace' }]])
    expect(boundsFromMarks(doc as never, marks, undefined, null, reachBack).get('3')).toBeUndefined()
  })
})

describe('boundsFromMarks `either`, the maker\'s: a carried word on either side of the mark\'s token, read through the marked compile\'s shared boxes', () => {
  // the base page's exact boxes: `\schedforwardgap{}` sets "gap", the unit begins at "is" (2610.40394v1 u165)
  const tok = (t: string, x: number, w = 20) => ({ t, page: 1, x, y: 500, w, h: 10 })
  const doc = [tok('gap', 40), tok('is', 62.2, 10), tok('strongest', 74.2, 40), tok('here.', 118, 20)]
  // (the marked compile's one item a line put the mark into the next word's box: "strongest")
  const start = new Map([['5s', { page: 1, x: 62.22, y: 500, t: 'strongest' }], ['5e', { page: 1, x: 139, y: 500, t: 'here.' }]])
  it('a start mark whose carried word is the word after its token: the same word, with `either` alone', () => {
    expect(boundsFromMarks(doc as never, start).get('5')).toBeUndefined()
    expect(boundsFromMarks(doc as never, start, undefined, null, null, true).get('5')).toEqual([1, 3])
  })
  it('an end mark whose carried word is the word before its token, that token begun at the mark (2608.25210v2\'s "DOI:|10.14778", 0.02 pt past it)', () => {
    const line = [tok('see', 40, 15), tok('doi', 58, 10.38), tok('10', 68.4, 8), tok('14778', 77.6, 20)]
    const end = new Map([['6s', { page: 1, x: 40, y: 500, t: 'see' }], ['6e', { page: 1, x: 68.38, y: 500, t: 'doi' }]])
    expect(boundsFromMarks(line as never, end).get('6')).toBeUndefined()
    expect(boundsFromMarks(line as never, end, undefined, null, null, true).get('6')).toEqual([0, 2])
  })
  it('never further than the word beside its token', () => {
    const far = new Map([['5s', { page: 1, x: 62.22, y: 500, t: 'here.' }], ['5e', { page: 1, x: 139, y: 500, t: 'here.' }]])
    expect(boundsFromMarks(doc as never, far, undefined, null, null, true).get('5')).toBeUndefined()
  })
})

describe('uprightToken: the maker reaches only upright words (2610.19282 p15: a sideways caption, whose word at the mark\'s height is another line\'s)', () => {
  const styles = { F1: { ascent: 0.75, descent: -0.25, fontFamily: 'serif' } }
  const tokensOf = (transform: number[]) => tokenizeDocument([{ page: 1, items: [{ str: 'Bifurcations of the map', transform, width: 110, height: 10, fontName: 'F1', dir: 'ltr' }], styles }] as never) as { t: string }[]
  it('a word of an upright line is; of a line turned a quarter either way, or upside down, none is', () => {
    expect(tokensOf([10, 0, 0, 10, 72, 700]).map(uprightToken)).toEqual([true, true, true, true])
    for (const m of [[0, 10, -10, 0, 300, 400], [0, -10, 10, 0, 300, 400], [-10, 0, 0, -10, 400, 300]]) expect(tokensOf(m).map(uprightToken), JSON.stringify(m)).toEqual([false, false, false, false])
  })
})

