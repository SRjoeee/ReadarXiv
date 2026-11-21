// The readings of a PDF font's name the typesetter takes (what the typesetter reads of the part's fonts, Style.design and
// Part.paper.faces, by them: no rule reads a page's characters), each held once in @readarxiv/text, which the engine reads
// too: a glyph's style, its `design` the Latin family whose face the reader draws in (readFontStyle), and the paper's English
// family from its fonts weighted by their glyphs (familyOfFonts, by the PostScript names' table). Held by
// lab/typeset/tests/unit/font-names.test.ts.
export { familyOfFonts, readFontStyle as classifyFont } from '@readarxiv/text'
