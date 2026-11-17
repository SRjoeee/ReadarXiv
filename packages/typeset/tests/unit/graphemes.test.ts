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
