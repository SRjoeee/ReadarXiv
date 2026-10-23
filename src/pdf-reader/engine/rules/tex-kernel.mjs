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
