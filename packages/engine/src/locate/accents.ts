// COPIED as it is from src/pdf-reader/engine/layout/accents.mjs (abe884b5e) for today's ink makers beside it (deps.mjs), which locate runs over arXiv's page.
// A spacing accent TeX set as a glyph of its own, and its letter: one rule for every reading of text off a page's glyphs. TeX's
// \accent (OT1's, every Computer Modern text font's) sets the accent, moves back over it and sets the letter (or sets the letter
// and the accent over it), so a font's map reads the two apart: "F´ısica" for Física, "Cande`s" for Candès, "PE´REZ" for PÉREZ
// (2610.20716v1, 2610.35877v1, 2610.20285v1). The reader joins them on the page's text items (layer-proto/layer2.mjs
// joinAccents); the prepare on our page's glyphs (the ink units' words, layout/ink-units.mjs; the figures' runs,
// layout/figure-text.mjs), which this module tells. Imports nothing; an original module (no port statement).

/** a glyph as this module reads one (accentOver): its Unicode, font, size, its advance along its line (x0, x1), its baseline
 *  across (y) and its ink's top */
export interface AccentGlyph {
  u: string
  font: string
  size: number
  x0: number
  x1: number
  y: number
  top: number
}

/** each spacing accent's combining mark: grave, acute, circumflex, tilde, diaeresis, macron, breve, dot, ring, caron,
 *  cedilla, ogonek, double acute (Hungarian), as the fonts' ToUnicode maps write them (ASCII's three among them). Asked of a
 *  glyph's Unicode where there may be no glyph (`a?.u`): an absent key, undefined among them, has no mark */
export const COMBINING: ReadonlyMap<string | undefined, string> = new Map([
  ['`', '̀'],
  ['ˋ', '̀'],
  ['´', '́'],
  ['ˊ', '́'],
  ['^', '̂'],
  ['ˆ', '̂'],
  ['~', '̃'],
  ['˜', '̃'],
  ['¯', '̄'],
  ['ˉ', '̄'],
  ['˘', '̆'],
  ['˙', '̇'],
  ['¨', '̈'],
  ['˚', '̊'],
  ['˝', '̋'],
  ['ˇ', '̌'],
  ['¸', '̧'],
  ['˛', '̨'],
])
/** the marks set under a letter, which keep a dotless i dotless */
export const BELOW: ReadonlySet<string> = new Set(['̧', '̨'])

/** `letter` under the combining `mark` as one code point (NFC): a dotless ı or ȷ under a mark above it the dotted letter's
 *  (Loïc, Física); null where the two compose to none */
export function composed(letter: string, mark: string): string | null {
  const base = BELOW.has(mark) ? letter : letter === 'ı' ? 'i' : letter === 'ȷ' ? 'j' : letter
  const ch = (base + mark).normalize('NFC')
  return [...ch].length !== 1 || ch === base + mark ? null : ch
}

/** a glyph's slack about its letter, of the accent's size: a hair, so that only the move back puts the accent on its letter */
const SLACK = 0.05
const isLetter = (u: unknown): u is string => typeof u === 'string' && /^\p{L}$/u.test(u) && !COMBINING.has(u)

/**
 * Whether spacing accent `a` is set over letter `l` by TeX's \accent, each a glyph as the prepare reads it ({ u, font, size, x0,
 * x1: its advance along its line, y: its baseline across, top: its ink's top }): one font, the accent's advance centred on the
 * letter's advance (only the move back over the accent puts it there: an apostrophe, a quote or a formula's \hat in its own
 * font advances as any glyph does), and its baseline the letter's or raised over it by at most the letter's height (a capital's
 * accent, which TeX raises by the letter's height less the x-height). Its letter's accented form, or null
 */
export function accentOver(a: AccentGlyph | undefined, l: AccentGlyph | undefined): string | null {
  const mark = COMBINING.get(a?.u)
  // (`a!`: a mark is found only for a glyph, `!mark` returning first where there is none)
  if (!mark || !isLetter(l?.u) || a!.font !== l.font) return null
  const tol = SLACK * a!.size,
    mid = (a!.x0 + a!.x1) / 2,
    rise = a!.y - l.y
  if (mid < l.x0 - tol || mid > l.x1 + tol || rise < -tol || rise > Math.max(l.top - l.y, 0) + tol) return null
  return composed(l.u, mark)
}

/**
 * The text of each glyph of `gs` (indices into `G`, the glyphs in their stream order: TeX sets an accent right before its
 * letter, or right after it), each accent joined to its letter: a Map of the glyphs whose text is not their own character, the
 * accent's '' and its letter's its accented form. A glyph is joined once; every other keeps its character
 */
export function accentTexts(G: readonly (AccentGlyph | undefined)[], gs: readonly number[]): Map<number, string> {
  const out = new Map<number, string>(),
    mine = new Set(gs)
  for (const g of gs) {
    if (!COMBINING.has(G[g]?.u) || out.has(g)) continue
    for (const l of [g + 1, g - 1]) {
      if (!mine.has(l) || out.has(l)) continue
      const ch = accentOver(G[g], G[l])
      if (ch === null) continue
      out.set(g, '')
      out.set(l, ch)
      break
    }
  }
  return out
}
