// Today's readings of a PDF font's name the typesetter takes (what the typesetter reads of the part's fonts, Style.design and
// Part.paper.faces, by them: no rule reads a page's characters), each held once in @readarxiv/text, which the engine reads
// too: a glyph's style as today's reader reads it, its `design` the Latin family whose face the reader draws in (today's
// layer-proto/fonts.mjs classifyFont: readFontStyle), and the paper's English family from its fonts weighted by their glyphs
// (today's rules/font-roles.mjs familyOfFonts, by the PostScript names' table). Held to today's by
// lab/typeset/tests/unit/font-names.test.ts.
export { familyOfFonts, readFontStyle as classifyFont } from '@readarxiv/text'
