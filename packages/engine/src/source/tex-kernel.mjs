// src/pdf-reader/engine/rules/tex-kernel.mjs
// The control sequences TeX and the LaTeX kernel define to set no ink and to read nothing after them: one table for every
// reader of a placeholder that is one. The layout maker gives such a placeholder no mark (layout/marks.mjs INVISIBLE) and
// does not take it for a macro that may look ahead (so the placeholder after it, the `\ref` of "Fig.\@ \ref{x}", still gets
// its marks); the layer reads it as a placeholder that draws nothing (layer-proto/layer1.mjs phClass 'zero', through
// arg-roles.mjs textless). Two copies of it drifted apart: the maker's INVISIBLE lacked `\@` and the layer's ZERO lacked
// `\@`, `\/`, `\!`, `\indent` and `\leavevmode`, so a unit with "Fig.\@ \ref{x}" lost the `\ref`'s marks in the maker and
// was refused for a placeholder with no row in the layer (2602.23285: six units left in English). Imports nothing.
//
// What is in it is TeX's and LaTeX's own definition, as data, not a list made from a paper: an entry sets no character, rule
// or leaders (its nodes are glue, a kern, a penalty, a discretionary whose hyphen only a break sets, or none), and reads no
// token after it that could be the next piece's (it is not a macro that looks ahead, not a prefix, not one with an argument
// a following piece could be taken for). That is why the maker puts no mark round one: a mark is a whatsit, and set against
// glue, a kern or a penalty it would move what TeX breaks the line by, which marks.mjs promises never to do. A text symbol
// (text-symbols.mjs) is a different kind: it sets its character, so it is marked and its ink is read like any macro's, but it
// reads nothing after it either (marks.mjs LOOKS_AHEAD).
// tests/pdf-reader/tex-kernel.test.ts checks each entry against a real pdflatex's box: no character, rule or leaders in it.

/** control symbols (a backslash and one character that is no letter): latex.ltx `\@` = `\spacefactor\@m` (the space after
 *  a full stop is an ordinary one); TeX's italic correction `\/` (a kern after a letter, nothing after none) and discretionary
 *  hyphen `\-` (a hyphen only where a line breaks there); the math spaces `\,` `\:` `\;` and `\!` (kerns or glue in text,
 *  mu glue in math) and the control space `\ ` (a backslash before a space, a tab or a line's end: glue) */
export const INK_FREE_SYMBOLS = Object.freeze(['\\@', '\\/', '\\-', '\\,', '\\;', '\\:', '\\!', '\\ '])

/** control words with no argument: TeX's `\relax` (nothing), `\unskip` (takes the glue before it off), `\ignorespaces`
 *  (skips the spaces after it), `\noindent` and `\indent` (begin a paragraph without or with its indent: an empty box), and
 *  LaTeX's `\leavevmode` (`\unhbox\voidb@x`: begins one), `\nobreak` (`\penalty\@M`), `\allowbreak` (`\penalty\z@`) and
 *  `\newline` (ends the line: `\@normalcr\relax`, a break and no ink) */
export const INK_FREE_WORDS = Object.freeze(['relax', 'nobreak', 'allowbreak', 'ignorespaces', 'unskip', 'leavevmode', 'noindent', 'indent', 'newline'])

/** control words whose only argument is an optional priority from 0 to 4 (LaTeX's `\linebreak[2]`, a penalty): no ink, but a
 *  call carries its argument, so only a reader of arguments (arg-roles.mjs TEXTLESS) can say a source is one whole */
export const BREAK_HINTS = Object.freeze(['linebreak', 'nolinebreak', 'pagebreak', 'nopagebreak'])

/** control words that are a prefix of the next token alone and set nothing themselves: LaTeX's `\protect` (`\relax` where text
 *  is set, `\noexpand\protect\noexpand` in a moving argument, so that the command after it is stored as it is). A mark of the
 *  piece after one stands before it, never between the two: the pair is one command to TeX (a \thanks's `\protect\url{…}`) */
export const PREFIX_WORDS = Object.freeze(['protect'])
const PREFIX = new RegExp(String.raw`^\s*\\(?:${PREFIX_WORDS.join('|')})\s*$`)
/** whether a placeholder's whole source is one of PREFIX_WORDS (white space round it is none of it) */
export const prefixWord = src => PREFIX.test(src ?? '')

/** the symbols as a pattern: a control space is a backslash and any white space (a space, a tab or a line's end), and `\@` a
 *  symbol only where no letter follows it (`\@ifnextchar` is a macro of the kernel) */
const SYMBOL = `@(?![A-Za-z@])|[${INK_FREE_SYMBOLS.map(s => s[1]).filter(c => c !== '@' && c !== ' ').map(c => `\\${c}`).join('')}\\s]`
const WORD = `(?:${INK_FREE_WORDS.join('|')})(?![A-Za-z@])`
/** the leading control sequence of a source that is one of the three tables, as the pattern source of a regular expression (the
 *  maker's INVISIBLE reads a placeholder by it; the source may go on after it) */
export const INK_FREE_LEAD = String.raw`\\(?:${SYMBOL}|${WORD}|(?:${BREAK_HINTS.join('|')})(?![A-Za-z@]))`
/** a source that is one entry of INK_FREE_SYMBOLS or INK_FREE_WORDS, alone or followed by an empty group (`\relax{}`), as a
 *  placeholder's whole source is read: white space round it is none of it (a control space is a backslash and a space, which
 *  a trim would take off) */
const SOURCE = new RegExp(String.raw`^\s*\\(?:${SYMBOL}|${WORD})(?:\{\})?\s*$`)

/** whether a placeholder's whole source is one of INK_FREE_SYMBOLS or INK_FREE_WORDS (a source with an argument is not) */
export const inkFree = src => SOURCE.test(src ?? '')

// ---------------------------------------------------------------- what sets nothing among a unit's words
// Beside the tables above, which the maker and the layer read (a placeholder with no mark, one that draws nothing), what else
// LaTeX defines to set nothing where a unit's words stand: declarations that set no ink and change the font, the size or the
// paragraph's shape for the rest of their group, and commands whose arguments are no text and whose nodes are no character
// among the words. The wire (translate/mt.mjs INKLESS) sends none of them: each would be a marker that cuts its sentence.

/** LaTeX's declarations with no argument that set no ink: the font's (\rmfamily … \scshape, \normalfont, the two-letter
 *  forms \bf … \sl, \em), its size's (\tiny … \Huge, \normalsize, \selectfont), the paragraph's shape (\centering,
 *  \raggedright, \raggedleft), its line breaking's (\sloppy, \fussy), and an empty box: \strut (a rule of no width), \null
 *  (\hbox{}) */
export const DECLARATION_WORDS = Object.freeze(['centering', 'raggedright', 'raggedleft', 'normalfont', 'rmfamily', 'sffamily', 'ttfamily', 'bfseries', 'mdseries', 'itshape', 'upshape', 'slshape', 'scshape', 'em', 'bf', 'it', 'rm', 'sf', 'tt', 'sc', 'sl', 'normalsize', 'small', 'footnotesize', 'scriptsize', 'tiny', 'large', 'Large', 'LARGE', 'huge', 'Huge', 'selectfont', 'strut', 'null', 'sloppy', 'fussy'])
/** control words whose argument is a key, written to an auxiliary file (a whatsit, no ink): LaTeX's \label{…} (cleveref's
 *  optional type before it) and \index{…} */
export const AUX_WORDS = Object.freeze(['label', 'index'])
/** TeX's \penalty and its number: a break's cost (\nobreak is \penalty\@M, \allowbreak \penalty\z@) */
export const PENALTY_WORDS = Object.freeze(['penalty'])
/** what LaTeX and booktabs set between a table's rows, with their arguments (`\cline{2-3}`, `\cmidrule(lr){2-3}`,
 *  `\addlinespace[3pt]`): \noalign material, or \cline's row of its own, nothing in a cell's line */
export const ROW_RULES = Object.freeze(['hline', 'cline', 'toprule', 'midrule', 'bottomrule', 'cmidrule', 'specialrule', 'addlinespace', 'morecmidrules'])

// ---------------------------------------------------------------- a definition that sets one of its arguments alone
/** the kernel's macros that expand to one of their arguments and nothing else, by name: how many they take, and which they give
 *  (latex.ltx: \@firstofone and \@iden take one, \@firstoftwo and \@secondoftwo two). A .bbl defines its field commands by them
 *  (apsrev4-2's `\providecommand \bibinfo [0]{\@secondoftwo}`) */
const ARGUMENT_SELECTORS = Object.freeze({ '@firstofone': [1, 1], '@iden': [1, 1], '@firstoftwo': [2, 1], '@secondoftwo': [2, 2] })
/** the argument a definition expands to alone (`params`, the arguments it declares; `body`, its replacement text, its comments
 *  out as TeX takes them, each with its line's end), as { of, arg }: how many arguments a call takes and which one, from 1, it
 *  sets — `#2` of `[2]`, \@secondoftwo of `[0]`; null for a body that sets anything else (a style, a word, a box, a space) or
 *  nothing at all. White space is TeX's: a space or a line's end before or after a parameter is a space token the call sets
 *  (`{#1 }` sets its argument and a space, `{` and a line's end then `#1}` a space and its argument), and is no identity;
 *  after a control word TeX skips it (`{\@secondoftwo }`) */
export function selectsArgument(params, body) {
  if (!Number.isInteger(params) || typeof body !== 'string') return null
  const own = /^#([1-9])$/.exec(body)
  if (own) return Number(own[1]) <= params ? { of: params, arg: Number(own[1]) } : null
  const k = /^\\(@[A-Za-z]+)\s*$/.exec(body), sel = k && params === 0 && Object.hasOwn(ARGUMENT_SELECTORS, k[1]) ? ARGUMENT_SELECTORS[k[1]] : null
  return sel ? { of: sel[0], arg: sel[1] } : null
}

// ---------------------------------------------------------------- spaces
// TeX's and LaTeX's spaces in text, as data: what the kernel defines to set glue or a kern there and nothing else, so that it
// sets where the words around it fall and no ink. One table for every reader of a placeholder that is a space: the wire
// (translate/mt.mjs: what stands between the formulas of a run, what no space of the wire's goes before, what ends a display)
// and the layer's pieces (layer/pieces.mjs, a space drawn as one). Three readers kept three lists of it, and they disagreed: a
// control space before a line's end was a space between formulas and none before a marker; `\!` was one at a display's end and
// none elsewhere.

/** control symbols that are spaces: the tie `~` (an active character, \nobreakspace: a space no line breaks at), the control
 *  space `\ ` (a backslash and any white space: a space, a tab or a line's end), the math spaces `\,` (\thinspace), `\:`
 *  (\medspace), `\;` (\thickspace) and `\!` (\negthinspace, the one of negative width), each a kern or glue in text too */
export const SPACE_SYMBOLS = Object.freeze(['~', '\\ ', '\\,', '\\:', '\\;', '\\!'])
/** control words with no argument that are spaces: LaTeX's \enspace, \quad, \qquad, \thinspace and \nobreakspace */
export const SPACE_WORDS = Object.freeze(['enspace', 'quad', 'qquad', 'thinspace', 'nobreakspace'])
/** control words whose argument is the space's length: LaTeX's \hspace{…}, starred or not */
const SPACE_LENGTHS = Object.freeze(['hspace'])
/** the spaces of negative width among SPACE_SYMBOLS: what takes room away is no gap a space of the wire's or the layer's fills */
export const NEGATIVE_SPACES = Object.freeze(['\\!'])
/** a control symbol that is a space in math alone: amsmath's `\>` (\medspace); in text it is the tabbing environment's tab */
const MATH_SPACE_SYMBOLS = Object.freeze(['\\>'])

/** the symbols as alternatives of a pattern: a control space is a backslash and any white space; a symbol's backslash is no
 *  forced break's second (`\\` and a line's end is a break, read from a source's end as from its start) */
const spaceSymbol = symbols => symbols.map(s => (s === '~' ? '~' : s === '\\ ' ? '(?<!\\\\)\\\\\\s' : `(?<!\\\\)\\\\${s[1]}`)).join('|')
const SPACE_WORD = `\\\\(?:${SPACE_WORDS.join('|')})(?![A-Za-z@])`
const SPACE_LENGTH = `\\\\(?:${SPACE_LENGTHS.join('|')})\\*?\\s*\\{`
/** the leading space of a source, as the pattern source of a regular expression (the source may go on after it): a space of
 *  the table, a length's command up to its brace; `negative` the spaces of negative width too, `math` the math alone's too */
export const spaceLead = ({ negative = true, math = false } = {}) => {
  const symbols = SPACE_SYMBOLS.filter(s => negative || !NEGATIVE_SPACES.includes(s))
  return `(?:${spaceSymbol([...symbols, ...(math ? MATH_SPACE_SYMBOLS : [])])}|${SPACE_WORD}|${SPACE_LENGTH})`
}
/** a source that is one space of the table whole, as the pattern source of a regular expression: a symbol or a word, alone or
 *  before an empty group, a length's command and its length; `math` the math alone's too */
export const spaceSource = ({ math = false } = {}) => String.raw`(?:(?:${spaceSymbol([...SPACE_SYMBOLS, ...(math ? MATH_SPACE_SYMBOLS : [])])}|${SPACE_WORD})(?:\{\})?|\\(?:${SPACE_LENGTHS.join('|')})\*?\s*\{[^{}]*\})`
