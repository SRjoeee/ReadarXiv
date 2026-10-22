// src/pdf-reader/engine/rules/text-piece.mjs
// A text piece: a placeholder whose plain text is its whole rendering, TeX setting its characters as they are written. One
// rule for both of its readers: the layer draws one as page text, never as a formula's crops (layer-proto/layer2.mjs formulaOf),
// and the layout maker finds one the matcher missed,
// set over two lines in one PDF and on one in the other, by its characters on the unit's own lines (layout/make.mjs, the
// tolerant match). Imports nothing.

/** the commands whose one argument TeX sets in the typewriter face as its own characters: \texttt; and verbatim, \url
 *  and \path (url.sty's, a character at a time), \lstinline in braces */
const TYPEWRITER_ARG = /^\\texttt\s*\{([^{}]*)\}$/, VERBATIM_GROUP = /^\\(?:url|path|lstinline)\s*\{([^{}]*)\}$/
/** \verb and \lstinline between two of a character: verbatim, in the typewriter face (not \verb*, which shows its spaces) */
const VERBATIM_ARG = /^\\(?:verb|lstinline)([^A-Za-z\s*{])([^\n]*?)\1$/
/** what no literal argument holds: a command, a group, math, a tie; and outside a verbatim one, the characters TeX reads as
 *  math's scripts, a comment, an alignment tab or a parameter */
const NOT_LITERAL = /[\\{}$~]/, NOT_LITERAL_TEXT = /[\\{}$~^_%&#]/
/** what TeX sets as other characters than they are outside the typewriter face: a dash or quote ligature, and OT1's
 *  substitutes (< > as ¡ ¿, " as a closing quote, | as a dash) */
const NOT_ITSELF = /--|``|''|[<>"|]/

/**
 * A text piece (the soundness round of 2026-10-19): a placeholder whose plain text is its whole rendering, TeX setting its
 * characters as they are written. A code or URL mark (\texttt, \verb, \lstinline, \url, \path) or a plain-text source (no
 * command), its argument literal: no command, group, math or tie (nor, but verbatim, a script mark, a comment, an
 * alignment tab or a parameter); outside the typewriter face (a plain-text source) no dash or quote ligature and none of
 * OT1's substitutes. No citation, reference, footnote mark, formula, display, paper's macro or \textsuperscript is one.
 * Returns { text } (its plain text, as written), or null.
 */
export function textPieceOf(src) {
  if (typeof src !== 'string') return null
  const tt = TYPEWRITER_ARG.exec(src), group = !tt && VERBATIM_GROUP.exec(src), delimited = !tt && !group && VERBATIM_ARG.exec(src)
  const arg = tt ? tt[1] : group ? group[1] : delimited ? delimited[2] : src
  if (!/\S/.test(arg) || (group || delimited ? NOT_LITERAL : NOT_LITERAL_TEXT).test(arg)) return null
  // (a plain-text source, set in the text's face)
  if (!tt && !group && !delimited && NOT_ITSELF.test(arg)) return null
  return { text: arg }
}
