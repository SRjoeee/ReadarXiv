// src/pdf-reader/engine/rules/text-symbols.mjs
// LaTeX's text symbols: one table for every reader of a placeholder that is one. The layout maker draws a symbol it cannot
// mark as its character where arXiv's page shows that character on the unit's line (layout/marks.mjs, make.mjs); the layer
// draws one from its source as text, whose glyph its line's erasing covers (layer-proto/layer2.mjs texToText2, textSymbol:
// the controller's text-symbol ruling of 2026-10-15). Two copies of it drifted apart: the layer knew none of
// \textbackslash, \textasciicircum and \textbar, which the maker's had, read them as a paper's own macros, and left their
// units the original's (2610.19159: 256 units, with \textquotesingle and \textquotedbl, which neither had). Imports nothing.

/**
 * The kernel's and textcomp's text symbols, as LaTeX defines them in every encoding, each the one character it sets
 * (\textquotesingle the straight quote ', \textquotedbl the straight double quote "); and the kernel's letters of Latin
 * scripts (\o, \ss, \ae, \l, the dotless \i and \j: latex.ltx and the encodings' own) and \slash (`/` and the permission to
 * break after it), which a paper writes inside a word (`F\o lner`, `and\slash or`), where no mark goes. Each is one character;
 * most are one glyph in every encoding, but OT1 sets \l, \L, \aa and \AA of two (a bar or a ring over a letter), which a page's
 * text then gives as two characters, not the one: there the maker finds none and the piece stays LOST, as it was
 */
export const TEXT_SYMBOLS = Object.freeze({
  '\\%': '%', '\\&': '&', '\\#': '#', '\\$': '$', '\\_': '_', '\\{': '{', '\\}': '}',
  '\\textbackslash': '\\', '\\textless': '<', '\\textgreater': '>', '\\textbar': '|', '\\textasciitilde': '~', '\\textasciicircum': '^',
  '\\textunderscore': '_', '\\textdollar': '$', '\\textbraceleft': '{', '\\textbraceright': '}', '\\textquotesingle': "'", '\\textquotedbl': '"',
  '\\S': '§', '\\P': '¶', '\\textsection': '§', '\\textparagraph': '¶', '\\dag': '†', '\\ddag': '‡',
  '\\textdagger': '†', '\\textdaggerdbl': '‡', '\\copyright': '©', '\\textcopyright': '©', '\\textregistered': '®',
  '\\texttrademark': '™', '\\pounds': '£', '\\textsterling': '£', '\\textdegree': '°', '\\textbullet': '•',
  '\\textperiodcentered': '·', '\\ldots': '…', '\\dots': '…', '\\textellipsis': '…', '\\textendash': '–', '\\textemdash': '—',
  '\\o': 'ø', '\\O': 'Ø', '\\ss': 'ß', '\\ae': 'æ', '\\AE': 'Æ', '\\oe': 'œ', '\\OE': 'Œ', '\\aa': 'å', '\\AA': 'Å',
  '\\l': 'ł', '\\L': 'Ł', '\\i': 'ı', '\\j': 'ȷ', '\\slash': '/',
})

/** a symbol's text: its source one of TEXT_SYMBOLS, alone or followed by an empty group (`\%{}`, `\dots{}`), else null */
export function symbolText(src) {
  const m = /^(\\(?:[A-Za-z]+|[%&#$_{}]))(?:\{\})?$/.exec(src ?? '')
  return m && Object.hasOwn(TEXT_SYMBOLS, m[1]) ? TEXT_SYMBOLS[m[1]] : null
}
