// accents.mjs's types
/** each spacing accent's combining mark, as the fonts' ToUnicode maps write the accent */
export declare const COMBINING: ReadonlyMap<string, string>
/** the marks set under a letter, which keep a dotless i dotless */
export declare const BELOW: ReadonlySet<string>
/** `letter` under the combining `mark` as one code point (NFC), a dotless ı or ȷ under a mark above it the dotted letter's;
 *  null where the two compose to none */
export declare function composed(letter: string, mark: string): string | null
/** a glyph as the prepare reads it: its character, its font, its size, its advance along its line, its baseline across, its
 *  ink's top */
export interface AccentGlyph {
  u: string
  font?: string | null
  size: number
  x0: number
  x1: number
  y: number
  top: number
}
/** whether spacing accent `a` is set over letter `l` by TeX's \accent: its letter's accented form, or null */
export declare function accentOver(a: AccentGlyph, l: AccentGlyph): string | null
/** the text of each glyph of `gs` (indices into `G`, in stream order) where it is not its own character: an accent joined to
 *  its letter '', the letter its accented form */
export declare function accentTexts(G: readonly (AccentGlyph | undefined)[], gs: readonly number[]): Map<number, string>
