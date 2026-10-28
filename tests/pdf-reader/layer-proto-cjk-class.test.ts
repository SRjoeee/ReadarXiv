import { beforeAll, describe, expect, it } from 'vitest'
import { noStart } from '@/pdf-reader/engine/layer-proto/no-start.mjs'

// The characters a CJK run takes (layer2.mjs cjkClassRe): CJK, the full-width forms, Hangul, and where the rules say so
// (cjkQuotes: Chinese and Japanese) the curly quotes, dashes, ellipsis and middle dot. A character of the class is laid in
// the target's CJK face and broken after as a CJK character; any other in the Latin face. The class once held U+8C48 to
// U+FAFF where U+F900 to U+FAFF (the compatibility ideographs) was meant, the range's first character typed as itself and
// normalized into the unified ideograph it stands for: Yi, Lisu, Vai, Cyrillic Extended-B, Latin Extended-D, the
// surrogates and the private-use area went to the CJK face.

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
let L2: L2
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * [...s].length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
})

const at = (c: number) => String.fromCodePoint(c)
/** [what, code point, CJK without the rules' quotes, CJK with them, UAX 14 keeps it from a line's start] */
const TABLE: [string, number, boolean, boolean, boolean][] = [
  ['exclamation mark', 0x21, false, false, true], ['number sign', 0x23, false, false, false], ['per cent sign', 0x25, false, false, false],
  ['left parenthesis', 0x28, false, false, false], ['right parenthesis', 0x29, false, false, true], ['comma', 0x2c, false, false, true],
  ['hyphen-minus', 0x2d, false, false, false], ['full stop', 0x2e, false, false, true], ['colon', 0x3a, false, false, true],
  ['question mark', 0x3f, false, false, true], ['commercial at', 0x40, false, false, false], ['right square bracket', 0x5d, false, false, true],
  ['tilde', 0x7e, false, false, false], ['no-break space', 0xa0, false, false, false], ['degree sign', 0xb0, false, false, false],
  ['plus-minus sign', 0xb1, false, false, false], ['middle dot', 0xb7, false, true, false], ['multiplication sign', 0xd7, false, false, false],
  ['em dash', 0x2014, false, true, false], ['left single quotation mark', 0x2018, false, true, false], ['right double quotation mark', 0x201d, false, true, false],
  ['horizontal ellipsis', 0x2026, false, true, false], ['per mille sign', 0x2030, false, false, false],
  ['Hangul jamo', 0x1100, true, true, false], ['CJK radical', 0x2e80, true, true, false], ['ideographic full stop', 0x3002, true, true, true],
  ['hiragana', 0x3042, true, true, false], ['Hangul compatibility jamo', 0x3131, true, true, false], ['CJK unified ideograph', 0x6c49, true, true, false],
  ['the unified ideograph U+8C48', 0x8c48, true, true, false], ['the last unified ideograph of the BMP block', 0x9fff, true, true, false],
  // (U+A000 to U+F8FF: none of them CJK but Hangul, its syllables and its extended jamo)
  ['Yi syllable', 0xa000, false, false, false], ['Yi radical', 0xa490, false, false, false], ['Lisu letter', 0xa4d0, false, false, false],
  ['Vai syllable', 0xa500, false, false, false], ['Cyrillic Extended-B letter', 0xa640, false, false, false], ['Bamum letter', 0xa6a0, false, false, false],
  ['modifier tone letter', 0xa700, false, false, false], ['Latin Extended-D letter', 0xa722, false, false, false], ['Syloti Nagri letter', 0xa800, false, false, false],
  ['Phags-pa letter', 0xa840, false, false, false], ['Devanagari Extended letter', 0xa8e0, false, false, false], ['Hangul jamo extended-A', 0xa960, true, true, false],
  ['Javanese letter', 0xa984, false, false, false], ['Cham letter', 0xaa00, false, false, false], ['Meetei Mayek letter', 0xabc0, false, false, false],
  ['Hangul syllable', 0xac00, true, true, false], ['the last Hangul syllable', 0xd7a3, true, true, false], ['Hangul jamo extended-B', 0xd7b0, true, true, false],
  ['a high surrogate, alone', 0xd800, false, false, false], ['a low surrogate, alone', 0xdc00, false, false, false],
  ['private use', 0xe000, false, false, false], ['private use, a font\'s icon', 0xf0e0, false, false, false], ['the last private use', 0xf8ff, false, false, false],
  ['CJK compatibility ideograph', 0xf900, true, true, false], ['the last CJK compatibility ideograph block', 0xfaff, true, true, false],
  ['Latin small ligature ff', 0xfb00, false, false, false], ['full-width comma', 0xff0c, true, true, true], ['half-width katakana', 0xff76, true, true, false],
  ['mathematical bold capital A', 0x1d400, false, false, false], ['CJK extension B', 0x20000, true, true, false], ['CJK extension G', 0x30000, true, true, false],
]

describe('the CJK class', () => {
  for (const [what, c, plain, quoted, barred] of TABLE) {
    it(`U+${c.toString(16).toUpperCase().padStart(4, '0')} (${what}): ${plain ? 'CJK' : 'not CJK'}, ${quoted ? 'CJK' : 'not CJK'} where the rules set the quotes as CJK's`, () => {
      expect(L2.cjkClassRe(false).test(at(c))).toBe(plain)
      expect(L2.cjkClassRe(true).test(at(c))).toBe(quoted)
      expect(noStart(at(c))).toBe(barred)
    })
  }
  it('holds no character of U+A000 to U+F8FF but Hangul: every code point there', () => {
    const hangul = (c: number) => (c >= 0xa960 && c <= 0xa97f) || (c >= 0xac00 && c <= 0xd7ff)
    for (const quotes of [false, true]) {
      const re = L2.cjkClassRe(quotes)
      const wrong: string[] = []
      for (let c = 0xa000; c <= 0xf8ff; c++) if (re.test(at(c)) !== hangul(c)) wrong.push(c.toString(16))
      expect(wrong, `quotes ${quotes}`).toEqual([])
    }
  })
  it('is one pattern a setting: the same object on every call', () => {
    expect(L2.cjkClassRe(true)).toBe(L2.cjkClassRe(true))
    expect(L2.cjkClassRe(false)).toBe(L2.cjkClassRe(false))
    expect(L2.cjkClassRe(false).flags).toBe('u')
  })
})
