// src/pdf-reader/engine/layer-proto/no-start.mjs
// The characters UAX 14 does not let a line start with, one place: the breaker never breaks before one (layer2.mjs
// breakLines, with the target's rules' own marks), the drawing drops a translation's such mark opening the text after a
// displayed formula where the original's line opens with none (layer2.mjs tokensOf2, the maintainer's fix 4 of
// 2026-10-15), and the layer gate's measure lineStartPunct counts a drawn line that opens with one (the gate imports this
// file: lab/pdf/spikes/layer-gate/measure.mjs); and the pairs it keeps together, which the drawing glues (tokensOf2).
// Imports nothing.

/**
 * The code points UAX 14 does not let a line start with: its classes CL, CP, IS, EX and NS (a closing mark, a closing
 * parenthesis, a comma or full stop between numbers, an exclamation or question mark, a non-starter), as ranges of hex
 * code points from LineBreak-17.0.0.txt (TeX Live 2026's unicode-data, the file's own field `;CL` … `;NS`)
 */
export const NO_START = ('21 29 2c 2e 3a-3b 3f 5d 7d 37e 589 5c6 60c-60d 61b 61d-61f 6d4 7f8-7f9 f0d-f11 f14 f3b f3d 169c 17d6 1802-1803 '
  + '1808-1809 1944-1945 203c-203d 2044 2046-2049 207e 208e 2309 230b 232a 2762-2763 2769 276b 276d 276f 2771 2773 2775 27c6 '
  + '27e7 27e9 27eb 27ed 27ef 2984 2986 2988 298a 298c 298e 2990 2992 2994 2996 2998 29d9 29db 29fd 2cf9 2cfe 2e23 2e25 2e27 '
  + '2e29 2e2e 2e53-2e54 2e56 2e58 2e5a 2e5c 3001-3002 3005 3009 300b 300d 300f 3011 3015 3017 3019 301b-301c 301e-301f '
  + '303b-303c 309b-309e 30a0 30fb 30fd-30fe a015 a60e a876-a877 fd3e fe10-fe16 fe18 fe36 fe38 fe3a fe3c fe3e fe40 fe42 '
  + 'fe44 fe48 fe50 fe52 fe54-fe57 fe5a fe5c fe5e ff01 ff09 ff0c ff0e ff1a-ff1b ff1f ff3d ff5d ff60-ff61 ff63-ff65 '
  + 'ff9e-ff9f 115c4-115c5 11c71 1325b-1325d 13282 13287 13289 1337a-1337b 13438 1343d 1343f 145cf 16fe0-16fe3 16ff2-16ff3 '
  + '1f679-1f67b').split(' ').map(r => r.split('-').map(h => Number.parseInt(h, 16))).map(([a, b]) => [a, b ?? a])
/** whether a character (its first code point) is one UAX 14 does not let a line start with (the ranges are in order and
 *  apart: a binary search, since the breaker asks it of every token it may break before) */
export const noStart = ch => {
  const c = typeof ch === 'string' && ch ? ch.codePointAt(0) : -1
  let lo = 0, hi = NO_START.length - 1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (c < NO_START[m][0]) hi = m - 1
    else if (c > NO_START[m][1]) lo = m + 1
    else return true
  }
  return false
}


/** UAX 14's pairs no line breaks inside, whatever the target's rules: LB17's B2 × B2 (two em dashes, the dash Chinese and
 *  Japanese write as two U+2014, which a CJK run takes as two characters of its own; the two- and three-em dashes) and, of
 *  LB22's × IN, two of IN (two ellipses, two two-dot leaders), from LineBreak-17.0.0.txt's B2 and IN */
const B2 = [0x2014, 0x2e3a, 0x2e3b], IN = [0x2024, 0x2025, 0x2026, 0x22ef, 0xfe19, 0x10af6]
/** whether no line may break between `a`'s last character and `b`'s first: a pair UAX 14 keeps together (the breaker asks it
 *  of every two tokens it lays side by side: the last code point read from its surrogates, if it is one) */
export const keptPair = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false
  const lo = a.charCodeAt(a.length - 1), x = lo >= 0xdc00 && lo <= 0xdfff && a.length > 1 ? a.codePointAt(a.length - 2) : lo, y = b.codePointAt(0)
  return (B2.includes(x) && B2.includes(y)) || (IN.includes(x) && IN.includes(y))
}
