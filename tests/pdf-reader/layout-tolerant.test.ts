import { describe, expect, it } from 'vitest'
import { TOLERANT_MIN, TOLERANT_WORDS, wordsAt } from '@/pdf-reader/engine/layout/tolerant.mjs'
import { isReferenceWord, REFERENCE_WORDS } from '@/pdf-reader/engine/rules/reference-words.mjs'

// The tolerant match's words (layout/tolerant.mjs wordsAt): a unit's words beside its mark, found among arXiv's words in
// the unit's span, one of them at most standing for another at a reference's name (PR-D2, 2609.26457's units 28 and 71)

const ours = (s: string, refs: number[] = []) => s.split(' ').map((t, q) => ({ t, ref: refs.includes(q) }))
const theirs = (s: string) => {
  // (each line of `s` by a newline: its first and last words)
  const out: { t: string; first: boolean; last: boolean }[] = []
  for (const line of s.split('\n')) { const ws = line.split(' '); ws.forEach((t, q) => { out.push({ t, first: q === 0, last: q === ws.length - 1 }) }) }
  return out
}

describe("the unit's words where they stand on arXiv's page", () => {
  it("an end mark's: the place of the last word; a start mark's: of the first", () => {
    const T = theirs('x y benchmark of AI R&D\ntasks (see section B).')
    expect(wordsAt(ours('of AI R&D tasks (see section B).'), T, { end: true })).toEqual([{ at: 9, sub: -1 }])
    expect(wordsAt(ours('benchmark of AI R&D tasks'), T, { end: false })).toEqual([{ at: 2, sub: -1 }])
  })
  it("one word apart, a reference's name in its rendering, for a reference word of arXiv's", () => {
    const T = theirs('benchmark of AI R&D tasks (see appendix B).')
    expect(wordsAt(ours('of AI R&D tasks (see section B).', [5]), T, { end: true })).toEqual([{ at: 7, sub: 5 }])
    // (across arXiv's other line breaks: unit 71's last words, the name long before them)
    expect(wordsAt(ours('a3 a4 b0 b1 b2 b3 b4 done.'), theirs('a0 a1 see appendix C a2\na3 a4 b0 b1 b2\nb3 b4 done.'), { end: true, atLineEnd: true })).toEqual([{ at: 13, sub: -1 }])
  })
  it('never two words apart, the mark\'s own word, a word not a rendering\'s, nor a word not in the table', () => {
    const two = ours('tasks (see section B, section C).', [2, 4])
    expect(wordsAt(two, theirs('tasks (see appendix B, appendix C).'), { end: true })).toEqual([])
    // (the mark's own word: never another)
    expect(wordsAt(ours('w0 w1 w2 section', [3]), theirs('w0 w1 w2 appendix'), { end: true })).toEqual([])
    expect(wordsAt(ours('section w0 w1 w2', [0]), theirs('appendix w0 w1 w2'), { end: false })).toEqual([])
    // (a reference word of the text, not of a rendering)
    expect(wordsAt(ours('w0 tasks (see section B).'), theirs('w0 tasks (see appendix B).'), { end: true })).toEqual([])
    // (an unlisted word, either side's)
    expect(isReferenceWord('annex')).toBe(false)
    expect(wordsAt(ours('w0 tasks (see section B).', [3]), theirs('w0 tasks (see annex B).'), { end: true })).toEqual([])
    expect(wordsAt(ours('w0 tasks (see annex B).', [3]), theirs('w0 tasks (see section B).'), { end: true })).toEqual([])
  })
  it('every place it stands is given, its caller taking one alone; the line end where ours ends its line', () => {
    const T = theirs('w0 w1 w2 w3 done.\nw0 w1 w2 w3 done. and on')
    expect(wordsAt(ours('w0 w1 w2 w3 done.'), T, { end: true }).map(f => f.at)).toEqual([4, 9])
    // (where ours ends its line there: arXiv's must end its own)
    expect(wordsAt(ours('w0 w1 w2 w3 done.'), T, { end: true, atLineEnd: true }).map(f => f.at)).toEqual([4])
    expect(wordsAt(ours('done. and on x'), theirs('y done. and on x'), { end: false, atLineEnd: true })).toEqual([])
  })
  it(`at least ${TOLERANT_MIN} words and at most ${TOLERANT_WORDS}`, () => {
    expect(wordsAt(ours('a b c'), theirs('a b c'), { end: true })).toEqual([])
    expect(wordsAt(ours('a b c d'), theirs('a b c d'), { end: true })).toEqual([{ at: 3, sub: -1 }])
    expect(wordsAt(ours('a b c d e f g h i'), theirs('a b c d e f g h i'), { end: true })).toEqual([])
  })
  it("the reference words: one table, case folded, an abbreviation's stop kept", () => {
    for (const w of ['section', 'Section', 'APPENDIX', 'Fig.', 'eq.', 'Theorem', 'lemma']) expect(isReferenceWord(w), w).toBe(true)
    for (const w of ['annex', 'fig', 'see', 'the', '', 'B']) expect(isReferenceWord(w), w).toBe(false)
    expect(new Set(REFERENCE_WORDS).size).toBe(REFERENCE_WORDS.length)
    expect(REFERENCE_WORDS.every(w => w === w.toLowerCase())).toBe(true)
  })
})
