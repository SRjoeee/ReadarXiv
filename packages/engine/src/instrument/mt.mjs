// Moved into the engine package from src/pdf-reader/engine/translate/mt.mjs: the part of that module the moved front half calls, as it is; the rest
// stays there and imports this part back through its transition path.
import { AUX_WORDS, BREAK_HINTS, DECLARATION_WORDS, INK_FREE_SYMBOLS, INK_FREE_WORDS, PENALTY_WORDS, PREFIX_WORDS, ROW_RULES, SPACE_SYMBOLS, spaceSource } from '../source/tex-kernel.mjs'

// (the same function as the front end's latin1Bytes: loading a paper's front end, and the argument tables it reads, for this
// one line would put them in every reader that translates; a test holds the two equal)
const latin1Bytes = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff; return b }
/** source text is read byte for byte (latin1); its characters are UTF-8. Printable ASCII is its own decoding, and one decoder
 *  serves every call: a decoder made for each text piece was most of serialize's time (2610.19159's 2,645 units) */
const DECODER = new TextDecoder()
const ASCII = /^[\t\n\r -~]*$/
export const utf8 = s => (ASCII.test(s) ? s : DECODER.decode(latin1Bytes(s)))

// ---------------------------------------------------------------- what breaks the text, and a display
/** a displayed formula's source: the layer draws it as one crop (layout/marks.mjs classOf, which reads it here), and the wire's one
 *  reading of a display (its own stop, the text it breaks) */
export const DISPLAY = /^(?:\\\[|\$\$|\\begin\s*\{(?:equation|align|alignat|gather|multline|flalign|eqnarray|displaymath|dmath|IEEEeqnarray|subequations)\*?\})/
/** a forced line break, a list's item: `\\` (starred, with its room), \newline, \linebreak (its priority after it), \item */
const FORCED_BREAK = /^(?:\\\\\*?(?:\[[^\]]*\])?|\\(?:newline|linebreak|item)(?![A-Za-z@])(?:\[[^\]]*\])?)\s*$/
/** the placeholders that break the text where they stand: a forced line break, an item, a display (DISPLAY). An inline formula
 *  does not: the translator moves it with the words as one of them (`We fix the $\theta$ \textcolor{red}{matrix …}` kept would
 *  cut its noun phrase in two; the review of #415, 100 of the 109 units its clause changed over the sweep's papers) */
const breaks = src => typeof src === 'string' && (FORCED_BREAK.test(src) || DISPLAY.test(src))

// ---------------------------------------------------------------- a unit's styling on the wire
/**
 * A placeholder that sets no ink and that no translator needs, read from TeX's own tables (rules/tex-kernel.mjs): one of the
 * kernel's that set no ink and read nothing, but a space and a break (`\@`, `\/`, `\-`, \relax, \nobreak, \allowbreak,
 * \noindent, \protect, \nolinebreak…); LaTeX's declarations of a font, a size or a paragraph's shape (`\bfseries`, `\small`,
 * `\centering`, a strut) and `\color{red}`; a key written to an auxiliary file (`\label{…}`, `\index{…}`); a penalty; the
 * rules a table sets between its rows (`\midrule`, `\cmidrule(lr){2-3}`). Sent as a marker, each one cut the sentence it stood
 * in: Microsoft reads a marker as a hard boundary, and 2610.19159's 6,681 `\allowbreak{}` and 3,516 `\bfseries` (one before
 * every word of its coloured runs) went out as 13,000 markers. It goes on no wire: it is put back after the open of its
 * innermost group that went out (the unit's front, a kept pair's open) where it stood before that group's first word, else
 * before its close, in the source's order; next to a placeholder that goes as a marker, it rides in that marker, in its place
 * (planOf). A space (a tie, `\quad`, SPACING's), a forced break, a fill or a skip is not one of them: each sets where the words
 * around it fall (a fill taken to the end set 2608.10322's flush-right end of proof after its words), and goes as a marker where
 * it stands
 */
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const KERNEL_SYMBOLS = INK_FREE_SYMBOLS.filter(s => !SPACE_SYMBOLS.includes(s)).map(escapeRe)
const KERNEL_WORDS = [...INK_FREE_WORDS, ...PREFIX_WORDS, ...DECLARATION_WORDS].filter(w => !breaks(`\\${w}`))
const HINTS = BREAK_HINTS.filter(w => !breaks(`\\${w}`))
const INKLESS = new RegExp(String.raw`^(?:(?:${KERNEL_SYMBOLS.join('|')})|\\(?:${KERNEL_WORDS.join('|')})(?![A-Za-z@])(?:\s*\{\})?|\\(?:${HINTS.join('|')})(?![A-Za-z@])(?:\s*\[[^\]]*\])?|\\color\s*(?:\[[^\]]*\]\s*)?\{[^{}]*\}|\\(?:${AUX_WORDS.join('|')})\s*(?:\[[^\]]*\]\s*)?\{[^{}]*\}|\\(?:${PENALTY_WORDS.join('|')})\s*(?:[-+]?\d+|\\[A-Za-z@]+)|\\(?:${ROW_RULES.join('|')})(?![A-Za-z@])(?:\s*\[[^\]]*\]|\s*\((?:[^()]|\{[^{}]*\})*\)|\s*\{[^{}]*\})*)\s*$`)
/** whether a piece is a placeholder that sets no ink (INKLESS) */
export const isInkless = p => p?.t === 'ph' && typeof p.src === 'string' && p.src[0] === '\\' && INKLESS.test(p.src)
// ---------------------------------------------------------------- a display's own stop
/** the math environments a display holds, which end inside it before its own end: a display's, an alignment's, a case
 *  split's, an array's or a matrix's. No other (a picture, `\end{tikzpicture}`, whose `;` is its own syntax) */
const MATH_INNER = String.raw`(?:equation|align|alignat|gather|multline|flalign|eqnarray|displaymath|dmath|IEEEeqnarray|subequations|split|aligned|alignedat|gathered|multlined|cases|dcases|rcases|array|subarray|[pbBvV]?matrix|smallmatrix)\*?`
/** one thing at a display's end that sets none of its sentence's punctuation, read from the end: white space, a comment,
 *  the display's close and an inner math environment's, a label, a tag, a number's switch, `\qedhere`, a line break, a
 *  space or a fill of TeX's, an empty group, plain TeX's \eqno and what it numbers */
const DISPLAY_TAIL = new RegExp(String.raw`(?:[ \t\n\f\r]+|(?<!\\)%[^\n]*|\\\]|\$\$|\\end\s*\{${MATH_INNER}\}|\\(?:label|tag\*?)\s*\{[^{}]*\}|\\(?:nonumber|notag|qedhere|displaybreak|allowbreak|hfill)(?![A-Za-z@])(?:\[[^\]]*\])?|\\\\\*?(?:\[[^\]]*\])?|${spaceSource({ math: true })}|\{\}|\\l?eqno(?![A-Za-z@])[\s\S]*)$`)
/** the punctuation at that end: a stop, a comma, a semicolon or a colon, bare or alone in a group that sets it (`\text{.}`,
 *  never a phantom's); never an empty delimiter (`\right.`) or an escaped character (`\;` is a space) */
const DISPLAY_STOP = /\\(?:text|mbox|textrm|textnormal|mathrm|hbox)\s*\{\s*([.,;:])\s*\}$|(?<!\\(?:right|middle|left|[bB]igg?[lrm]?)\s*)(?<!\\)([.,;:])$/
/** the punctuation a display's source sets at its end, which is its sentence's (`x = y.\label{e}\end{equation}`), or null;
 *  read in its last 2,000 characters, where a display's end lies whatever its length */
export function displayStop(src) {
  if (typeof src !== 'string' || !DISPLAY.test(src)) return null
  let s = src.length > 2000 ? src.slice(-2000) : src
  for (let n = 0; n < 64; n++) {
    const m = DISPLAY_TAIL.exec(s)
    if (!m) break
    s = s.slice(0, m.index)
  }
  const m = DISPLAY_STOP.exec(s)
  return m ? (m[1] ?? m[2]) : null
}

/** a text piece as the compiled PDF shows it: a translation's TeX escapes undone, the source's bytes as UTF-8.
 *  layer/pieces.mjs writes it again (the reader's layer may not import this module); a test holds the two equal */
export const shown = p => (p.tr ? p.s.replace(/\\(textbackslash|textasciitilde|textasciicircum)\{\}/g, ' ').replace(/\\([#$%&_{}])/g, '$1') : utf8(p.s))
const plain = (pieces, textOf) => pieces.map(p => (p.t === 'text' ? textOf(p) : ' ')).join('').replace(/\s+/g, ' ').trim()
/** a unit's plain text in its translation, as the compiled PDF shows it */
export const plainTranslated = pieces => plain(pieces, shown)
export { breaks, plain }
