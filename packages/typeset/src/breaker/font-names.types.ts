// The types of font-names.mjs (today's readings of a font's name, moved as they are), each value re-exported with its type.
// @ts-ignore: JavaScript moved as it is, typed by this file alone (a package holds no declaration file)
import * as m from './font-names.mjs'

/** a glyph's style by its font's name, as today's reader reads it (fonts.mjs classifyFont) */
export type FontStyle = {
  fam: 'serif' | 'sans' | 'mono' | 'math'
  bold: boolean
  italic: boolean
  caps: boolean
  design: string
  known: boolean
  name: string
}
export const classifyFont: (name: string, fallbackFamily?: string) => FontStyle = m.classifyFont
/** the paper's English family from its fonts weighted by their glyphs (font-roles.mjs familyOfFonts) */
export const familyOfFonts: (names: readonly string[], weights: readonly number[]) => string = m.familyOfFonts
