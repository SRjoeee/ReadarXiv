// A font's weight read off its PostScript name as the weight its words name (packages/text/src/font-names.ts readFontName):
// Latin Modern's demi faces, LMRomanDemi10-Regular and LMSansDemiCond10-Regular, are its semibold (their Type 1 programs'
// /Weight "Demi"); the name rule read "demi" only before a word's end, and the design size after it ("Demi10") took it as
// regular: an author line set in it was drawn regular where its first name's `\bf` element turned the first name bold
// (2608.30730v1 p1). The PDF's FontDescriptor states no /FontWeight for them. A weight word inside another word stays none.
import { describe, expect, it } from 'vitest'
import { readFontName } from '../src/font-names.ts'

describe('a font’s weight by the words of its name', () => {
  it('reads Demi before a design size or a width as the weight it names', () => {
    for (const name of [
      'TCKCHX+LMRomanDemi10-Regular',
      'LMRomanDemi10-Oblique',
      'LMSansDemiCond10-Regular',
      'URWGothicL-Demi',
    ])
      expect(readFontName(name).bold, name).toBe(true)
  })
  it('keeps the regular faces of the same families regular', () => {
    for (const name of ['LMRoman10-Regular', 'LMSans10-Regular', 'LMRomanCaps10-Regular', 'LMRomanSlant10-Regular'])
      expect(readFontName(name).bold, name).toBe(false)
  })
  it('reads no weight in a word that holds the letters as part of it', () => {
    expect(readFontName('Demitasse-Regular').bold).toBe(false)
  })
})
