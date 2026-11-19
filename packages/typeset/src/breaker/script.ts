// What the breaker reads of a script: the CJK characters, the characters a script that sets no spaces between its words sets
// none beside, the line-break marks (UAX 14's no-start class and the rule set's lists). A mark's blank half is its face's measure (markOf, docs/PDF-READER.md §18.48), not a class by character. A character is a
// grapheme cluster (graphemesOf, clustersOf, charsOf; docs/PDF-READER.md §18.93), its class its first code point's (cjkLeadRe).
import { MARK_INK } from '../data/marks.ts'

/** Unicode's CJK blocks, Hangul's among them, and its full-width forms (rules/script.mjs) */
const CJK_BLOCKS: [number, number][] = [
  [0x1100, 0x11ff],
  [0x2e80, 0x9fff],
  [0xa960, 0xa97f],
  [0xac00, 0xd7ff],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe1f],
  [0xfe30, 0xfe6f],
  [0xff00, 0xffef],
  [0x16fe0, 0x16fff],
  [0x1aff0, 0x1b16f],
  [0x1f200, 0x1f2ff],
  [0x20000, 0x3ffff],
]
const rangesOf = (rs: [number, number][]) =>
  rs.map(([a, b]) => (a === b ? `\\u{${a.toString(16)}}` : `\\u{${a.toString(16)}}-\\u{${b.toString(16)}}`)).join('')
export const CJK = new RegExp(`[${rangesOf(CJK_BLOCKS)}]`, 'u')
const cjkClassWith = (extra: number[]) =>
  new RegExp(`[${rangesOf([...CJK_BLOCKS, ...extra.map((c): [number, number] => [c, c])])}]`, 'u')
/** the characters a script that sets no spaces between its words sets none beside: Han, kana, Bopomofo and the CJK blocks'
 *  marks, but Hangul's, Latin's and a common number */
export const SPACELESS = new RegExp(
  `(?![\\p{sc=Hang}\\p{sc=Latn}])(?!(?=\\p{sc=Zyyy})\\p{N})[${rangesOf(CJK_BLOCKS)}]`,
  'u',
)

/** the curly quotes, dashes, ellipsis and middle dot a CJK run takes where the rules set them as CJK's */
const CJK_QUOTES = [0x201c, 0x201d, 0x2018, 0x2019, 0x2014, 0x2026, 0xb7]
const CJK_CLASS = [CJK, cjkClassWith(CJK_QUOTES)] as const
/** `quotes` (the rules' cjkQuotes): whether the curly quotes, dashes, ellipsis and middle dot are CJK's too */
export const cjkClassRe = (quotes: boolean) => CJK_CLASS[quotes ? 1 : 0]
const CJK_LEAD = CJK_CLASS.map((re) => new RegExp(`^${re.source}`, 'u'))
/** cjkClassRe held to a text's first code point: the class of a grapheme cluster, which is its first code point's */
export const cjkLeadRe = (quotes: boolean) => CJK_LEAD[quotes ? 1 : 0]!

/** the platform's grapheme clusters (UAX #29's extended grapheme clusters, as the runtime's ICU gives them), made once */
const GRAPHEMES = new Intl.Segmenter('en', { granularity: 'grapheme' })
/** a text's grapheme clusters, each a string: what a reader sees as one character (a letter and the marks over it, a decomposed
 *  Hangul syllable, a kana and its voiced mark, a character and its variation selector, an emoji sequence, a flag) */
export const graphemesOf = (t: string): string[] => Array.from(GRAPHEMES.segment(t), (g) => g.segment)
/**
 * The code points that may stand in a grapheme cluster beside another: those whose Grapheme_Cluster_Break (UAX #29) lets them
 * join a neighbour, CR and LF, Extend (Grapheme_Extend, Emoji_Modifier), ZWJ, SpacingMark, Prepend, Regional_Indicator and the
 * conjoining jamo L, V and T (their three blocks), every pair UAX #29 keeps together holding one of them (LV and LVT join only
 * beside an L, V or T). Written in the properties ECMAScript names (a mark, a format character among them every
 * Prepended_Concatenation_Mark), and the letters (Lo) of those classes no such property names, as Unicode 17 classes them: Thai's
 * and Lao's SARA AM (SpacingMark), the Prepend letters of Indic_Syllabic_Category Consonant_Preceding_Repha and
 * Consonant_Prefixed, Kirat Rai's vowel signs. A text that holds none is its code points, each a cluster of its own; held to the
 * platform's own segmenter over every assigned code point by packages/typeset/tests/unit/graphemes.test.ts. Sticky: it reads
 * the one code point of a text that starts at its lastIndex (pointsOf)
 */
const JOINS =
  /[\r\n\p{M}\p{Grapheme_Extend}\p{Emoji_Modifier}\p{Regional_Indicator}\p{Cf}\u{1100}-\u{11ff}\u{a960}-\u{a97f}\u{d7b0}-\u{d7ff}\u{d4e}\u{e33}\u{eb3}\u{111c2}\u{111c3}\u{113d1}\u{1193f}\u{11941}\u{11a84}-\u{11a89}\u{11d46}\u{11f02}\u{16d63}\u{16d67}-\u{16d6a}]/uy
/**
 * JOINS's answer for each code unit of the Basic Multilingual Plane, read the first time a text holds it (pointsOf): 1 where it
 * joins nothing, 2 where it may join, 0 not read yet. The class's own answers and nothing else, the same whatever was read
 * before, so no input of a lay is kept. A text is so read by one load a code unit rather than by the class's test at every
 * call: a token's count is asked at every width the breaker and the fit's bound compute (break.ts tokW), and the class tested
 * over a text of two-byte code units (Han, Hangul, Cyrillic) cost two to four times the code-point count it replaced
 */
const UNITS = new Uint8Array(0x10000)
/** a text's code points where none of them may join another (JOINS), -1 where one may: each read by its code unit (UNITS), a
 *  code point beyond the BMP (its two units) or a lone surrogate by JOINS read at it */
function pointsOf(t: string): number {
  let n = 0
  for (let i = 0; i < t.length; i++, n++) {
    const c = t.charCodeAt(i)
    const bmp = c < 0xd800 || c > 0xdfff
    let k = bmp ? UNITS[c]! : 0
    if (k === 0) {
      JOINS.lastIndex = i
      k = JOINS.test(t) ? 2 : 1
      if (bmp) UNITS[c] = k
    }
    if (k === 2) return -1
    if (!bmp && t.codePointAt(i)! > 0xffff) i++
  }
  return n
}
/** whether a text may hold a grapheme cluster of two code points or more (JOINS: none where it holds no such code point) */
export const mayJoin = (t: string): boolean => pointsOf(t) < 0
/** a text's grapheme clusters, walked as `for (const g of clustersOf(t))`: the text itself (its code points, each its own
 *  cluster) where it holds no code point that joins another (mayJoin), else the platform's clusters (graphemesOf) */
export const clustersOf = (t: string): Iterable<string> => (pointsOf(t) < 0 ? graphemesOf(t) : t)
/** how many characters a reader sees in a text: its grapheme clusters (clustersOf), counted without a list where each code point
 *  is one (its code points, pointsOf) */
export function charsOf(t: string): number {
  const n = pointsOf(t)
  return n < 0 ? graphemesOf(t).length : n
}
const PUNCT_CLOSE =
  /^[\u3001\u3002\uFF0C\uFF0E\uFF1A\uFF1B\uFF01\uFF1F\uFF09\u300D\u300F\u3011\u3015\u3009\u300B\u3019\u3017”’]$/
const PUNCT_OPEN = /^[\uFF08\u300C\u300E\u3010\u3014\u3008\u300A\u3018\u3016“‘]$/
/** a full-width mark's side by what it does in the text: `close` for the marks that close or end something (the
 *  white a space after it would double is its), `open` for those that open something (the white before it); null for any other
 *  character. Where its face draws its ink is no part of it: that is markOf's. The space rule's alone (tokens.ts markBlankEdge) */
export const punctOf = (s: string): 'open' | 'close' | null =>
  PUNCT_CLOSE.test(s) ? 'close' : PUNCT_OPEN.test(s) ? 'open' : null
/** a mark's side where it is full-width: a mark of the CJK blocks (CJK: the full-width and wide forms, East Asian Width F or W)
 *  wherever it stands; a curly quote (East Asian Width A, ambiguous) only where the target sets it in its CJK face (`cjkFace`),
 *  an em wide, never where an alphabet's target sets it in its Latin face, proportional (B.tokens). None for any
 *  other character */
export const fullWidthPunctOf = (s: string, cjkFace: boolean): 'open' | 'close' | null =>
  CJK.test(s) || cjkFace ? punctOf(s) : null

/** each CJK face's marks by character: its ink's left and right edges, thousandths of its advance (data/marks.ts) */
const MARKS: ReadonlyMap<string, ReadonlyMap<string, readonly [number, number]>> = new Map(
  Object.entries(MARK_INK).map(([id, a]) => {
    const m = new Map<string, readonly [number, number]>()
    for (let i = 0; i + 2 < a.length; i += 3) m.set(String.fromCodePoint(a[i]!), [a[i + 1]!, a[i + 2]!])
    return [id, m]
  }),
)
/**
 * A mark's blank half as the face that draws it has one (the tokens' `punct`; docs/PDF-READER.md §18.48): `close` where its
 * glyph's ink lies within the first half of its advance (its second half blank: the half a line's end hangs past the measure,
 * a mark after it takes, a compressed line takes), `open` where within the second (its first half blank); null where its ink
 * crosses the middle, or the face holds no measure of it: it keeps its whole box. The face is the first of `ids` (a run's
 * faces, Face.ids) whose marks were measured: the target's CJK face, in its own file (data/marks.ts, each face's default
 * glyph, the one the reader draws); an alphabet's face holds none. The same character in the same face so has one place in
 * its box wherever it stands: 2611.03953v2's colon in Japanese, whose Mincho draws it in the middle of its em, was cut by
 * half under the digits after it; Traditional Chinese's face draws its comma, full stop and colon in the middle
 */
export function markOf(ch: string, ids: readonly string[] | undefined): 'open' | 'close' | null {
  const id = ids?.find((f) => MARKS.has(f))
  const ink = id === undefined ? undefined : MARKS.get(id)!.get(ch)
  return !ink ? null : ink[1] <= 500 ? 'close' : ink[0] >= 500 ? 'open' : null
}

/** UAX 14's characters no line may start with (classes CL, CP, EX, IS, NS), Unicode 16 */
const NO_START: [number, number][] = (
  '21 29 2c 2e 3a-3b 3f 5d 7d 37e 589 5c6 60c-60d 61b 61d-61f 6d4 7f8-7f9 f0d-f11 f14 f3b f3d 169c 17d6 1802-1803 ' +
  '1808-1809 1944-1945 203c-203d 2044 2046-2049 207e 208e 2309 230b 232a 2762-2763 2769 276b 276d 276f 2771 2773 2775 27c6 ' +
  '27e7 27e9 27eb 27ed 27ef 2984 2986 2988 298a 298c 298e 2990 2992 2994 2996 2998 29d9 29db 29fd 2cf9 2cfe 2e23 2e25 2e27 ' +
  '2e29 2e2e 2e53-2e54 2e56 2e58 2e5a 2e5c 3001-3002 3005 3009 300b 300d 300f 3011 3015 3017 3019 301b-301c 301e-301f ' +
  '303b-303c 309b-309e 30a0 30fb 30fd-30fe a015 a60e a876-a877 fd3e fe10-fe16 fe18 fe36 fe38 fe3a fe3c fe3e fe40 fe42 ' +
  'fe44 fe48 fe50 fe52 fe54-fe57 fe5a fe5c fe5e ff01 ff09 ff0c ff0e ff1a-ff1b ff1f ff3d ff5d ff60-ff61 ff63-ff65 ' +
  'ff9e-ff9f 115c4-115c5 11c71 1325b-1325d 13282 13287 13289 1337a-1337b 13438 1343d 1343f 145cf 16fe0-16fe3 16ff2-16ff3 ' +
  '1f679-1f67b'
)
  .split(' ')
  .map((r) => r.split('-').map((h) => Number.parseInt(h, 16)))
  .map(([a, b]) => [a!, b ?? a!])
/** whether a character may not start a line */
export const noStart = (ch: string | null | undefined): boolean => {
  const c = typeof ch === 'string' && ch ? ch.codePointAt(0)! : -1
  let lo = 0,
    hi = NO_START.length - 1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (c < NO_START[m]![0]) hi = m - 1
    else if (c > NO_START[m]![1]) lo = m + 1
    else return true
  }
  return false
}
/** UAX 14's pairs a line never breaks between: two B2 (em dashes), two IN (ellipses) */
const B2 = [0x2014, 0x2e3a, 0x2e3b],
  IN = [0x2024, 0x2025, 0x2026, 0x22ef, 0xfe19, 0x10af6]
export const keptPair = (a: string | undefined, b: string | undefined): boolean => {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false
  const lo = a.charCodeAt(a.length - 1),
    x = lo >= 0xdc00 && lo <= 0xdfff && a.length > 1 ? a.codePointAt(a.length - 2)! : lo,
    y = b.codePointAt(0)!
  return (B2.includes(x) && B2.includes(y)) || (IN.includes(x) && IN.includes(y))
}

/** the code point a string ends with, -1 for none */
const lastOf = (s: string) => {
  const n = s.length
  if (n === 0) return -1
  const c = s.charCodeAt(n - 1),
    hi = n > 1 ? s.charCodeAt(n - 2) : 0
  return c >= 0xdc00 && c <= 0xdfff && hi >= 0xd800 && hi <= 0xdbff ? s.codePointAt(n - 2)! : c
}
type Kinsoku = { starts(s: string): boolean; ends(s: string): boolean }
/** the rule set's line-break marks: whether a token begins with a mark no line starts with, or ends with one no line ends
 *  with; made again each call, the typesetter holding no module state */
export function kinsokuOf(noStartList: string, noEndList: string): Kinsoku {
  const start = new Set([...noStartList].map((ch) => ch.codePointAt(0))),
    end = new Set([...noEndList].map((ch) => ch.codePointAt(0)))
  return { starts: (s) => start.has(s.codePointAt(0)), ends: (s) => end.has(lastOf(s)) }
}
