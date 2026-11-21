// What the breaker reads as one character, a grapheme cluster (breaker/script.ts: mayJoin, clustersOf, charsOf; PR #649's review
// 4593874142): the class of the code points that may join a neighbour held to the platform's own segmenter (Intl.Segmenter,
// granularity 'grapheme', UAX #29's extended clusters as the runtime's ICU gives them) over every assigned code point, and the
// clusters walked and counted on texts of our own.
import { describe, expect, it } from 'vitest'
import { charsOf, clustersOf, graphemesOf, mayJoin } from '../../src/breaker/script.ts'

const G = new Intl.Segmenter('en', { granularity: 'grapheme' })
/** whether the segmenter makes one cluster of `s` */
const one = (s: string) => {
  let n = 0
  for (const _ of G.segment(s)) if (++n > 1) return false
  return n === 1
}
/** whether code point `c` joins a neighbour, told by what it does (UAX #29): Other x it (Extend, ZWJ, SpacingMark), it x Other
 *  (Prepend), it x it (L, V, T, Regional_Indicator), CR x LF. LV and LVT join only beside an L, V or T, itself such a code
 *  point: every pair the rules keep together holds one of these on a side */
const joins = (c: string) => one(`a${c}`) || one(`${c}a`) || one(`${c}${c}`) || one(`${c}\n`) || one(`\r${c}`)

describe('mayJoin: the code points that may stand in a grapheme cluster beside another', () => {
  it('flags every assigned code point the platform’s segmenter joins to a neighbour', { timeout: 120_000 }, () => {
    // (an unassigned or private-use code point is Other or Control by UAX #29's defaults: it joins nothing; surrogates are no
    // code points of a text)
    const skip = /[\p{Cn}\p{Co}\p{Cs}]/u
    const missed: string[] = []
    let flagged = 0
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue
      const c = String.fromCodePoint(cp)
      if (skip.test(c)) continue
      if (mayJoin(c)) flagged++
      else if (joins(c)) missed.push(cp.toString(16))
    }
    expect(missed).toEqual([])
    expect(flagged).toBeGreaterThan(3000)
  })
})

describe('clustersOf and charsOf: a text’s characters, each a grapheme cluster', () => {
  const cases: [string, string, string[]][] = [
    ['composed Hangul', '한국어', ['한', '국', '어']],
    [
      'decomposed Hangul (L V T, L V T, L V)',
      '한국어'.normalize('NFD'),
      ['한', '국', '어'].map((s) => s.normalize('NFD')),
    ],
    ['a kana and its combining voiced mark', 'か\u{3099}く', ['か\u{3099}', 'く']],
    ['a Han character and its variation selectors', '辻\u{e0100}漢\u{fe00}', ['辻\u{e0100}', '漢\u{fe00}']],
    ['an emoji ZWJ sequence in a CJK line', '使用👩\u{200d}💻工具', ['使', '用', '👩\u{200d}💻', '工', '具']],
    ['a flag of two regional indicators', '🇯🇵日本', ['🇯🇵', '日', '本']],
    ['a letter and its combining accent', 'cafe\u{301}', ['c', 'a', 'f', 'e\u{301}']],
    ['a character beyond the BMP', '𠀀字', ['𠀀', '字']],
  ]
  for (const [name, text, want] of cases)
    it(name, () => {
      expect([...clustersOf(text)]).toEqual(want)
      expect(graphemesOf(text)).toEqual(want)
      expect(charsOf(text)).toBe(want.length)
    })
  it('a text that holds no joiner is walked by its code points, the text itself', () => {
    const text = '我们使用BERT模型（Devlin等，2019）。'
    expect(mayJoin(text)).toBe(false)
    expect(clustersOf(text)).toBe(text)
    expect(charsOf(text)).toBe([...text].length)
  })
})

describe('charsOf, clustersOf and mayJoin: the same answers wherever in a text a joiner stands, however often it is read', () => {
  // (each text's clusters counted and walked as the platform's segmenter gives them, and whether it may join: a joiner first,
  // inside, last; a base with marks; conjoining jamo; a code point beyond the BMP with a joiner and without; a lone surrogate.
  // The Han characters and the Hangul syllables written as escapes)
  const cases: [string, string, number, boolean][] = [
    ['an emoji ZWJ sequence after Han characters', '\u{4f7f}\u{7528}👩\u{200d}💻', 3, true],
    ['a ZWJ between two letters, joined to the first', 'a\u{200d}b', 2, true],
    ['a base with two marks, then a letter', 'e\u{301}\u{323}x', 2, true],
    ['a mark first, a cluster of its own', '\u{301}ab', 3, true],
    ['a mark last', 'abc\u{301}', 3, true],
    ['a Han character and an ideographic tone mark', '\u{5b57}\u{302a}\u{5b57}', 2, true],
    ['conjoining jamo: L V T, then L V', '\u{1112}\u{1161}\u{11ab}\u{1100}\u{1161}', 2, true],
    ['conjoining jamo after composed syllables', '\u{d55c}\u{ad6d}\u{1100}\u{1161}', 3, true],
    ['L L V, one cluster', '\u{1100}\u{1100}\u{1161}', 1, true],
    ['a leading consonant alone', '\u{1100}', 1, true],
    ['CR LF between two letters', 'a\r\nb', 3, true],
    ['a Prepend before a digit', '\u{600}1', 1, true],
    ['a Thai consonant and SARA AM', '\u{e01}\u{e33}', 1, true],
    ['a character beyond the BMP alone', '\u{20000}', 1, false],
    ['a character beyond the BMP among Han characters', '\u{5b57}\u{20000}\u{5b57}', 3, false],
    ['a flag of two regional indicators', '🇯🇵', 1, true],
    ['two flags', '🇯🇵🇰🇷', 2, true],
    ['an emoji and its skin tone', '👍\u{1f3fd}', 1, true],
    ['a Han character and a selector beyond the BMP', '\u{8fbb}\u{e0100}', 1, true],
    ['composed Hangul syllables', '\u{d55c}\u{ad6d}\u{c5b4}', 3, false],
    ['a Cyrillic word', 'слово', 5, false],
    ['a lone high surrogate before a letter', '\u{d800}a', 2, false],
    ['a lone low surrogate after a letter', 'a\u{dc00}', 2, false],
  ]
  for (const [name, text, n, joins] of cases)
    it(name, () => {
      for (let read = 0; read < 2; read++) {
        expect(charsOf(text)).toBe(n)
        expect(graphemesOf(text)).toHaveLength(n)
        expect([...clustersOf(text)]).toEqual(graphemesOf(text))
        expect(mayJoin(text)).toBe(joins)
      }
    })
  it('every assigned code point, alone and beside others: counted and walked as the platform’s segmenter', {
    timeout: 120_000,
  }, () => {
    const skip = /[\p{Cn}\p{Co}\p{Cs}]/u
    const apart: string[] = []
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue
      const c = String.fromCodePoint(cp)
      if (skip.test(c)) continue
      for (const text of [c, `a${c}`, `${c}a`, `\u{5b57}${c}\u{5b57}`, `${c}${c}`]) {
        const g = graphemesOf(text),
          w = [...clustersOf(text)]
        if (charsOf(text) !== g.length || w.length !== g.length || w.some((x, k) => x !== g[k])) apart.push(text)
      }
    }
    expect(apart).toEqual([])
  })
})
