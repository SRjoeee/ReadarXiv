// src/pdf-reader/engine/rules/text-symbols.mjs
// LaTeX's text symbols: one table for every reader of a placeholder that is one. The layout maker draws a symbol it cannot
// mark as its character where arXiv's page shows that character on the unit's line (layout/marks.mjs, make.mjs); the layer
// draws one from its source as text, whose glyph its line's erasing covers (layer-proto/layer2.mjs texToText2, textSymbol:
// the controller's text-symbol ruling of 2026-10-15). Two copies of it drifted apart: the layer knew none of
// \textbackslash, \textasciicircum and \textbar, which the maker's had, read them as a paper's own macros, and left their
// units the original's (2610.19159: 256 units, with \textquotesingle and \textquotedbl, which neither had). Imports nothing.

/**
 * The kernel's and textcomp's text symbols, as LaTeX defines them in every encoding, each the one character it sets
 * (\textquotesingle the straight quote ', \textquotedbl the straight double quote ")
 */
export const TEXT_SYMBOLS = Object.freeze({
  '\\%': '%', '\\&': '&', '\\#': '#', '\\$': '$', '\\_': '_', '\\{': '{', '\\}': '}',
  '\\textbackslash': '\\', '\\textless': '<', '\\textgreater': '>', '\\textbar': '|', '\\textasciitilde': '~', '\\textasciicircum': '^',
  '\\textunderscore': '_', '\\textdollar': '$', '\\textbraceleft': '{', '\\textbraceright': '}', '\\textquotesingle': "'", '\\textquotedbl': '"',
  '\\S': '§', '\\P': '¶', '\\textsection': '§', '\\textparagraph': '¶', '\\dag': '†', '\\ddag': '‡',
  '\\textdagger': '†', '\\textdaggerdbl': '‡', '\\copyright': '©', '\\textcopyright': '©', '\\textregistered': '®',
  '\\texttrademark': '™', '\\pounds': '£', '\\textsterling': '£', '\\textdegree': '°', '\\textbullet': '•',
  '\\textperiodcentered': '·', '\\ldots': '…', '\\dots': '…', '\\textellipsis': '…', '\\textendash': '–', '\\textemdash': '—',
})

/** a symbol's text: its source one of TEXT_SYMBOLS, alone or followed by an empty group (`\%{}`, `\dots{}`), else null */
export function symbolText(src) {
  const m = /^(\\(?:[A-Za-z]+|[%&#$_{}]))(?:\{\})?$/.exec(src ?? '')
  return m && Object.hasOwn(TEXT_SYMBOLS, m[1]) ? TEXT_SYMBOLS[m[1]] : null
}
