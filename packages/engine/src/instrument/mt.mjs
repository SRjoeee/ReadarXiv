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

// ---------------------------------------------------------------- names
// The pipeline's cell rule (nameCells), kept apart from src/core/names.ts until a pipeline version moves
/**
 * Whether a short text (a table cell, a figure label) is only a name — a dataset, a model, a method — which, sent
 * alone and with no context, comes back as words (HellaSwag → 地狱之战, Magicoder → 魔法师), while the prose keeps
 * names as they are. At most three words, each of them a name: one with a digit or an inner capital (GSM8K,
 * DirectHarm4), all capitals (MATH, ASR), or a capitalised word the prose treats as a proper noun and never as a
 * common one — capitalised in the middle of a sentence (… and Aegis [16]) or as the start of a longer name (Beaver for
 * BeaverTails), and never in lower case. A capitalised word the prose writes in lower case too is a word, set in title
 * case in a heading or a term (Average, Score, Safety Dataset); one the prose never treats as a name is a word as well
 * (Compute). Of the two mistakes, translating a name (Aegis → 宙斯盾) misleads, leaving a word untranslated does not:
 * a doubtful case stays a name only on both kinds of evidence. `prose` is the running text.
 */
export function isName(text, prose) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  if (words.length > 3) return false
  const quote = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // (after a lower-case letter, a clause's punctuation or `&`, a conjunction no sentence begins after: 2610.37818v1's "Tanks &
  // Temples", whose `\\&` is a character of the text since 2026-11-11, and which as a placeholder stood in no text of the prose)
  const proper = w => new RegExp(`[a-z,;:)\\]&] ${quote(w)}(?![a-z])`).test(prose) || new RegExp(`(^|[^A-Za-z])${quote(w)}[A-Z]`).test(prose)
  const common = w => new RegExp(`(^|[^A-Za-z])${quote(w.toLowerCase())}($|[^A-Za-z])`).test(prose)
  const nameWord = w => { const bare = w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''); return !bare || /[0-9]/.test(bare) || /^[A-Z][^a-z]*$/.test(bare) || /^[A-Za-z][a-z]*[A-Z]/.test(bare) || (/^[A-Z][a-z]+$/.test(bare) && proper(bare) && !common(bare)) }
  return words.every(nameWord)
}
// ---------------------------------------------------------------- code
/** a markup token: a word in angle brackets, as a model's special tokens are written (<pad>, </s>, <|endoftext|>) */
const MARKUP_TOKEN = /^<\/?[^\s<>]+\/?>$/u
/**
 * Whether a short text is code, which keeps its source as a name does: every word a markup token (1706.03762v7's "<pad>", which
 * Microsoft gave back as a Chinese word for a cushion in angle brackets), or, given `code` (codeTextsOf: a figure's label against the paper's own), a text the paper sets as
 * code (2610.38366v1's ordering cue `after`, 2608.08350v2's `tanh`). A table's cell is held to the markup tokens alone: a cell's
 * words that the paper sets as code elsewhere are words there (2608.28697v1's "easy", "middle", "hard")
 */
export function isCode(text, code = null) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return false
  return t.split(' ').every(w => MARKUP_TOKEN.test(w)) || !!code?.has(t)
}
const shortUnit = u => u.kind === 'cell' || u.kind === 'figure'
const textOfUnit = u => u.pieces.filter(p => p.t === 'text').map(p => p.s).join(' ')
/** the running text isName reads a short text against: every unit's text but a table cell's and a figure's, and a
 *  bibliography's entries none of it (their titles are in title case, their names all proper nouns) */
export const proseOf = units => units.filter(u => u && !shortUnit(u) && u.kind !== 'reference' && u.kind !== 'refnames').map(textOfUnit).join('\n')
/** the table cells and figure texts that are only names (isName) or markup tokens (isCode): they keep their source */
export function nameCells(units) {
  const prose = proseOf(units)
  return new Set(units.filter(u => shortUnit(u) && (isName(textOfUnit(u), prose) || isCode(textOfUnit(u)))))
}

/** a text piece as the compiled PDF shows it: a translation's TeX escapes undone, the source's bytes as UTF-8.
 *  layer/pieces.mjs writes it again (the reader's layer may not import this module); a test holds the two equal */
export const shown = p => (p.tr ? p.s.replace(/\\(textbackslash|textasciitilde|textasciicircum)\{\}/g, ' ').replace(/\\([#$%&_{}])/g, '$1') : utf8(p.s))
const plain = (pieces, textOf) => pieces.map(p => (p.t === 'text' ? textOf(p) : ' ')).join('').replace(/\s+/g, ' ').trim()
/** a unit's plain text in its translation, as the compiled PDF shows it */
export const plainTranslated = pieces => plain(pieces, shown)
export { breaks, plain }
