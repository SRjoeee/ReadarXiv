// What the breaker reads of a script: the CJK characters, the characters a script that sets no spaces between its words sets
// none beside, the line-break marks (UAX 14's no-start class and the rule set's lists). Ported from engine 065c1d973:
// rules/script.mjs (CJK_BLOCKS, CJK, cjkClassWith, SPACELESS), layer-proto/no-start.mjs (NO_START, noStart, keptPair),
// layer-proto/layer1.mjs:197-219 (lastOf, kinsokuOf), layer-proto/layer2.mjs:2096-2104 (PUNCT_CLOSE, PUNCT_OPEN, cjkClassRe).
// A mark's blank half is its face's measure (markOf, lane cjk-punct), no longer today's class by character.
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
export const cjkClassWith = (extra: number[]) =>
  new RegExp(`[${rangesOf([...CJK_BLOCKS, ...extra.map((c): [number, number] => [c, c])])}]`, 'u')
/** the characters a script that sets no spaces between its words sets none beside: Han, kana, Bopomofo and the CJK blocks'
 *  marks, but Hangul's, Latin's and a common number */
export const SPACELESS = new RegExp(
  `(?![\\p{sc=Hang}\\p{sc=Latn}])(?!(?=\\p{sc=Zyyy})\\p{N})[${rangesOf(CJK_BLOCKS)}]`,
  'u',
)

/** the curly quotes, dashes, ellipsis and middle dot a CJK run takes where the rules set them as CJK's (L2:2101) */
const CJK_QUOTES = [0x201c, 0x201d, 0x2018, 0x2019, 0x2014, 0x2026, 0xb7]
const CJK_CLASS = [CJK, cjkClassWith(CJK_QUOTES)] as const
/** `quotes` (the rules' cjkQuotes): whether the curly quotes, dashes, ellipsis and middle dot are CJK's too (L2:2104) */
export const cjkClassRe = (quotes: boolean) => CJK_CLASS[quotes ? 1 : 0]
export const PUNCT_CLOSE =
  /^[\u3001\u3002\uFF0C\uFF0E\uFF1A\uFF1B\uFF01\uFF1F\uFF09\u300D\u300F\u3011\u3015\u3009\u300B\u3019\u3017”’]$/
export const PUNCT_OPEN = /^[\uFF08\u300C\u300E\u3010\u3014\u3008\u300A\u3018\u3016“‘]$/
/** a full-width mark's side by what it does in the text (L2:2096-2104): `close` for the marks that close or end something (the
 *  white a space after it would double is its), `open` for those that open something (the white before it); null for any other
 *  character. Where its face draws its ink is no part of it: that is markOf's. The space rule's alone (tokens.ts markBlankEdge) */
export const punctOf = (s: string): 'open' | 'close' | null =>
  PUNCT_CLOSE.test(s) ? 'close' : PUNCT_OPEN.test(s) ? 'open' : null
/** a mark's side where it is full-width: a mark of the CJK blocks (CJK: the full-width and wide forms, East Asian Width F or W)
 *  wherever it stands; a curly quote (East Asian Width A, ambiguous) only where the target sets it in its CJK face (`cjkFace`),
 *  an em wide, never where an alphabet's target sets it in its Latin face, proportional (lane cjk-space, B.tokens). None for any
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
 * A mark's blank half as the face that draws it has one (the tokens' `punct`; docs/PDF-READER.md §18.47): `close` where its
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

/** UAX 14's characters no line may start with (classes CL, CP, EX, IS, NS), Unicode 16 (no-start.mjs NO_START) */
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
/** whether a character may not start a line (no-start.mjs noStart) */
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
/** UAX 14's pairs a line never breaks between: two B2 (em dashes), two IN (ellipses) (no-start.mjs keptPair) */
const B2 = [0x2014, 0x2e3a, 0x2e3b],
  IN = [0x2024, 0x2025, 0x2026, 0x22ef, 0xfe19, 0x10af6]
export const keptPair = (a: string | undefined, b: string | undefined): boolean => {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false
  const lo = a.charCodeAt(a.length - 1),
    x = lo >= 0xdc00 && lo <= 0xdfff && a.length > 1 ? a.codePointAt(a.length - 2)! : lo,
    y = b.codePointAt(0)!
  return (B2.includes(x) && B2.includes(y)) || (IN.includes(x) && IN.includes(y))
}

/** the code point a string ends with, -1 for none (layer1.mjs lastOf) */
const lastOf = (s: string) => {
  const n = s.length
  if (n === 0) return -1
  const c = s.charCodeAt(n - 1),
    hi = n > 1 ? s.charCodeAt(n - 2) : 0
  return c >= 0xdc00 && c <= 0xdfff && hi >= 0xd800 && hi <= 0xdbff ? s.codePointAt(n - 2)! : c
}
export type Kinsoku = { starts(s: string): boolean; ends(s: string): boolean }
/** the rule set's line-break marks (layer1.mjs kinsokuOf): whether a token begins with a mark no line starts with, or ends with
 *  one no line ends with. Today's caches it by its lists; made again each call here, the typesetter holding no module state */
export function kinsokuOf(noStartList: string, noEndList: string): Kinsoku {
  const start = new Set([...noStartList].map((ch) => ch.codePointAt(0))),
    end = new Set([...noEndList].map((ch) => ch.codePointAt(0)))
  return { starts: (s) => start.has(s.codePointAt(0)), ends: (s) => end.has(lastOf(s)) }
}
