// The writing system a target is written in, which every rule of the engine is read by: the layout rules' scripts, the
// font roles, the units a target keeps, the TeX path's strategies; and the one class of CJK characters, by Unicode's
// properties, that the reader's modules read them by. A module of its own, importing nothing.

/** the scripts already worked out, by tag: Intl.Locale's maximize is some microseconds a call, and the font roles ask it for every
 *  run of every unit laid (faceFor), one tag a reading. A handful of tags a page's life; the map is bounded all the same */
const SCRIPTS = new Map()
const SCRIPTS_MAX = 256
/** the script a BCP 47 tag is written in: its likely script (zh-TW → Hant, sr → Cyrl). A tag Intl.Locale refuses throws, as
 *  before, and is kept by nothing */
export const scriptOf = lang => {
  const known = SCRIPTS.get(lang)
  if (known !== undefined) return known
  const script = new Intl.Locale(lang).maximize().script
  if (SCRIPTS.size >= SCRIPTS_MAX) SCRIPTS.clear()
  SCRIPTS.set(lang, script)
  return script
}

// ---- the CJK characters, by Unicode's properties: the one class the reader's modules read them by

/** Unicode's CJK blocks (its Block property), as code point ranges, whole: Hangul Jamo; the run from CJK Radicals Supplement to
 *  CJK Unified Ideographs (Kangxi Radicals, Ideographic Description Characters, CJK Symbols and Punctuation, Hiragana, Katakana,
 *  Bopomofo, Hangul Compatibility Jamo, Kanbun, Bopomofo Extended, CJK Strokes, Katakana Phonetic Extensions, Enclosed CJK
 *  Letters and Months, CJK Compatibility, Extension A, Yijing Hexagram Symbols); Hangul Jamo Extended-A; Hangul Syllables and
 *  Hangul Jamo Extended-B; CJK Compatibility Ideographs; Vertical Forms; CJK Compatibility Forms and Small Form Variants;
 *  Halfwidth and Fullwidth Forms; Ideographic Symbols and Punctuation; the kana's supplements (Kana Extended-B, Kana Supplement,
 *  Kana Extended-A, Small Kana Extension); Enclosed Ideographic Supplement; and the ideographic planes, 2 and 3. A block's code
 *  points not yet assigned are its own script's to come (a reader whose Unicode is older than the text still sets them as CJK) */
const CJK_BLOCKS = [[0x1100, 0x11ff], [0x2e80, 0x9fff], [0xa960, 0xa97f], [0xac00, 0xd7ff], [0xf900, 0xfaff], [0xfe10, 0xfe1f], [0xfe30, 0xfe6f], [0xff00, 0xffef], [0x16fe0, 0x16fff], [0x1aff0, 0x1b16f], [0x1f200, 0x1f2ff], [0x20000, 0x3ffff]]
/** a class's body of code point ranges */
const rangesOf = rs => rs.map(([a, b]) => (a === b ? `\\u{${a.toString(16)}}` : `\\u{${a.toString(16)}}-\\u{${b.toString(16)}}`)).join('')
/** a CJK character: a code point of Unicode's CJK blocks. What a token of a CJK script is (layer2.mjs tokensOf2: set by CJK rules,
 *  drawn in the CJK face), a babel name's box (textlayer.mjs) and the checker's runs (check.mjs) read */
export const CJK = new RegExp(`[${rangesOf(CJK_BLOCKS)}]`, 'u')
/** CJK, and the characters of `extra` (code points): the class a script's rules widen (layout-rules.json cjkQuotes) */
export const cjkClassWith = extra => new RegExp(`[${rangesOf([...CJK_BLOCKS, ...extra.map(c => [c, c])])}]`, 'u')
/** a letter of a CJK script, by its Script property: Han, Hiragana, Katakana, Hangul (warm.mjs counts them) */
export const CJK_LETTER = /[\p{sc=Han}\p{sc=Hira}\p{sc=Kana}\p{sc=Hang}]/u
/** a character a script that sets no spaces between its words (Chinese, Japanese) sets none beside: a CJK character but a
 *  Hangul one (Korean spaces its words), a full-width Latin letter (its Script Latin) or a digit of no script of its own (the
 *  full-width digits; U+3007 and the Suzhou numerals are Han's) (layer2.mjs tokensOf2) */
export const SPACELESS = new RegExp(`(?![\\p{sc=Hang}\\p{sc=Latn}])(?!(?=\\p{sc=Zyyy})\\p{N})[${rangesOf(CJK_BLOCKS)}]`, 'u')
