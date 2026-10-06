// The layout marks of the marked original (Plan 8b, Task 1; the layout research of 2026-10-06): where on the page TeX
// sets each placeholder of a unit, each footnote call, each table cell and each heading, as named destinations beside
// the unit marks MARK_DEF already writes; and the marks file, what the layout maker reads from the marked original (its
// marks, its line counts, its words), kept so that a new layout is made from it with no compile.
//
// The marks are TeX put into every paper's original, and a mark that moves a line moves the readings the typesetting
// rule takes from it. So each is written to move nothing: a mark before a placeholder is set against the word before
// it, the space and tie after that word put back (cite.sty's \unskip and its penalty test see them as before); none is
// set in a contents list, a list of figures or the output routine's running heads (the gate); none goes after a paper's
// macro or a footnote's call, which may look at what follows, nor after a control word, whose following spaces TeX
// skips; and none is written to a file or a PDF string, so the
// aux, the lists and the bookmarks are byte for byte the paper's. The native cases (experiments/pdf-bilingual/spikes/
// layout-marks-cases.mjs) hold every text item of the page in place; the corpus check (Task 2) switches off a class
// that moves a line of any paper.
import { markUnits, NO_ARG_COMMANDS } from '../latex-front.mjs'
import { tokenizeDocument } from '../anchors.mjs'
import { readLines } from '../typeset/tex.mjs'
import { boundedJson, checkKeys, checkPages, checkViews, inView, isInteger, isNumber, LayoutRefusal } from './json.mjs'

// ---------------------------------------------------------------- the classes
/** every class, in this order */
export const MARK_CLASSES = Object.freeze(['math', 'display', 'cite', 'ref', 'eqref', 'code', 'url', 'footnote', 'macro'])
/** the classes the run marks when asked (Task 2 removes any class that moves a line of any paper) */
export const LAYOUT_CLASSES = Object.freeze([...MARK_CLASSES])

/** control words whose placeholder sets no ink, besides the declarations latex-front reads as taking no argument */
const INVISIBLE_WORDS = ['label', 'index', 'xspace', 'phantom', 'hphantom', 'vphantom', 'hspace', 'vspace', 'hskip', 'vskip', 'kern', 'color', 'nobreakspace', 'newline', 'linebreak', 'pagebreak', 'nopagebreak', 'footnotesize', 'normalsize']
/** a placeholder whose rendering is never ink: matched on its leading control sequence — a tie, a forced break, a space
 *  or kern of TeX's (a backslash before a line's end is its control space too), a discretionary hyphen, an italic
 *  correction, or a control word of the lists, followed by no letter */
export const INVISIBLE = new RegExp(String.raw`^(?:~|\\[\\,;:!/\s-]|\\(?:${[...NO_ARG_COMMANDS, ...INVISIBLE_WORDS].join('|')})(?![A-Za-z@]))`)
/** a character the scanner keeps as structure, with no ink of its own: an alignment's tab in a table it does not read as
 *  one (aastex's deluxetable between \\startdata and \\enddata), a stray brace, a parameter, a script mark */
const STRUCTURE = /^[&#^_{}]$/
/** a displayed formula's source */
export const DISPLAY = /^(?:\\\[|\$\$|\\begin\s*\{(?:equation|align|alignat|gather|multline|flalign|eqnarray|displaymath|dmath|IEEEeqnarray)\*?\})/
const MATH = /^(?:\$(?!\$)|\\\(|\\ensuremath(?![A-Za-z@]))/
const CITE = /^\\(?:[cC]ite[A-Za-z]*|(?:paren|text|auto)cites?)(?![A-Za-z@])/
const EQREF = /^\\eqref(?![A-Za-z@])/
const REF = /^\\(?:ref|autoref|[cC]ref|pageref|nameref)(?![A-Za-z@])/
const CODE = /^\\(?:texttt|verb|lstinline)(?![A-Za-z@])/
const URL = /^\\(?:url|href)(?![A-Za-z@])/
const FOOTNOTE_MARK = /^\\footnotemark(?![A-Za-z@])/

/** a piece's class, or null where it is not marked (text, a group's open or close, an invisible placeholder) */
export function classOf(piece) {
  if (piece?.t === 'nested') return 'footnote'
  if (piece?.t !== 'ph') return null
  const src = piece.src ?? ''
  if (INVISIBLE.test(src) || STRUCTURE.test(src)) return null
  if (DISPLAY.test(src)) return 'display'
  if (MATH.test(src)) return 'math'
  if (CITE.test(src)) return 'cite'
  if (EQREF.test(src)) return 'eqref'
  if (REF.test(src)) return 'ref'
  if (CODE.test(src)) return 'code'
  if (URL.test(src)) return 'url'
  if (FOOTNOTE_MARK.test(src)) return 'footnote'
  return 'macro'
}

// ---------------------------------------------------------------- the TeX
/**
 * The TeX that goes after MARK_DEF in the marked original. One line, no comment: the paper's lines keep their numbers
 * in the log. Allocates no register and writes nothing to the log: no line of it changes but pdfTeX's warnings of a
 * destination set twice. Each part keeps TeX's lists as the paper's, a destination (a whatsit) beside them:
 * - **The gate.** No mark is set while TeX sets a contents list or a list of figures or tables (\@starttoc, global: the
 *   list is read in a group), nor in the output routine (\@outputpage: its running heads, local to the routine's group).
 *   MARK_DEF's own \axtmark is gated too, so a caption's start mark is set where its float is and not first in the list
 *   of figures (2307.16209: 29 of 36 captions placed in it); the columns it notes are noted all the same.
 * - **The destination.** pdfTeX and LuaTeX set it as a FitR of no size, not MARK_DEF's XYZ: inside \pdfsetmatrix (a
 *   \resizebox) pdfTeX reckons an XYZ destination from a size it never sets, and a cell's mark landed 7 pt off its glyph,
 *   or 3,000 pt off its page, as the memory before it had it. PDF.js gives either as [page, kind, x, y, …].
 * - **\axtpma{name}, before a placeholder.** In horizontal mode the glue, penalties and kerns that end the list — the
 *   space before the placeholder, a tie's penalty and space, an italic correction — are taken off, the mark set against
 *   the last letter (\relax first: TeX sets the word before only once a command that does not expand comes), and each put
 *   back: a citation command that takes the space off (cite.sty's \unskip) and tests the penalty before it sees them as
 *   before, and no glue becomes a place to break that was not one. Never past a kern of nothing: LaTeX ends its leaders
 *   with one (\dotfill, \hrulefill), and leaders put back as glue lose their dots (e-TeX cannot tell them from glue);
 *   leaders with no such kern before a placeholder would still lose them. Glued to a letter, before a formula or a box, the mark
 *   goes in an \hbox: TeX never hyphenates a word a formula or a box follows, and does one a whatsit follows (2608.01890).
 *   On an empty list — the paragraph TeX resumes after a display — it sets nothing, and expands to nothing: a mark there
 *   would keep the empty paragraph between two displays a line, and would end the \ignorespaces amsmath's \] began
 *   (2608.20051, 2608.29782). In vertical mode it waits for the next mark that is set, the unit's start mark at the same
 *   place (layoutMarking marks only a placeholder at or after it).
 * - **\axtpm{name}, after one; \axthmark{name}, a heading's.** Set in horizontal mode only; \axtpm after the placeholder's
 *   last ink, its trailing glue, penalties and kerns put back after it, and on an empty list nothing: after a display,
 *   where TeX resumes the paragraph, a mark would open a line of its own where the paragraph ends, and TeX's skip of the
 *   space after a display must see past it, which it does, everything that decides so expanding.
 * - **The italic correction.** Where a mark is set against a letter that has one, an empty \vadjust after the mark says
 *   so, and \/ and LaTeX's \@@italiccorr add that letter's correction, measured when the mark was set, where they find
 *   it: TeX adds none after a whatsit, and cite.sty's [super] (\unskip then \/), \textup's left correction (\eqref),
 *   \textit and \textbf after their group set it on the letter before (0.14 pt after a "g" in cmr10, 1.45 pt after an
 *   italic "f"). The letter is a character, a ligature, or under XeTeX a word of a font of its own, which is a whatsit
 *   (\lastnodetype 9: TeX's \/ adds no correction after any other whatsit, so one there measures nothing). An adjust
 *   node is nothing to TeX's line breaking, hyphenation and pdfTeX's margin kerning, as a whatsit.
 *   A cell's marks do the same: its \axtmark.
 * - **Nothing written.** The three test \protect against \@typeset@protect and gobble their name otherwise, so written
 *   to a file (\protected@write: the aux's labels, the contents lists) or into a mark (running heads) they are gone; in a
 *   PDF string they are gobbled (\pdfstringdefDisableCommands); nameref's titles, which it keeps as strings, have them
 *   taken out first, at gettitlestring and where nameref sanitizes a title whoever set it (titlesec). What does the work
 *   is \protected, so an expansion (an \edef, a case change's) never runs it, and a case change leaves its name as it is
 *   (l3text's \l_text_case_exclude_arg_tl): a heading set in capitals keeps its marks' names.
 * What no TeX here can keep: a font kern between a heading's last letter and a full stop its class adds by expansion
 * (acmart's \@addpunct; 0.03-0.14 pt on that line), and a punctuation mark a superscript citation moves before itself by
 * looking past the closing mark (cite.sty's and natbib's [super]); and pdfTeX draws a virtual font's glyph after any
 * whatsit up to half a point from where TeX set it, though TeX's lists and places are the same
 */
export const LAYOUT_TEX = [
  '\\makeatletter\\newif\\ifaxt@off\\global\\let\\axt@pend\\@empty\\let\\axt@icr\\/\\def\\axt@icv{0pt}\\newif\\ifaxt@sig',
  '\\ifdefined\\XeTeXrevision\\else\\ifdefined\\pdfextension\\def\\axt@dest#1{\\pdfextension dest name{axt-#1} fitr width 0pt height 0pt depth 0pt\\relax}\\else\\ifdefined\\pdfdest\\def\\axt@dest#1{\\ifnum\\pdfoutput>0 \\pdfdest name{axt-#1} fitr width 0pt height 0pt depth 0pt\\relax\\fi}\\fi\\fi\\fi',
  '\\def\\axt@mark#1{\\axt@colseen\\ifaxt@off\\else\\axt@dest{#1}\\ifx\\axt@pend\\@empty\\else\\axt@dest{\\axt@pend}\\global\\let\\axt@pend\\@empty\\fi\\fi}',
  '\\def\\axt@icm{\\axt@icr\\ifnum\\lastnodetype=12 \\xdef\\axt@icv{\\the\\lastkern}\\unkern\\ifdim\\axt@icv=\\z@\\else\\global\\axt@sigtrue\\fi\\fi}',
  '\\def\\axt@ic{\\global\\axt@sigfalse\\ifcase\\lastnodetype\\axt@icm\\or\\or\\or\\or\\or\\or\\global\\axt@sigtrue\\or\\axt@icm\\or\\or\\axt@icm\\fi}',
  '\\def\\axt@put#1{\\axt@ic\\axt@mark{#1}\\ifaxt@sig\\vadjust{}\\fi}',
  '\\def\\axt@ift#1#2\\relax{\\if t#1\\expandafter\\@firstoftwo\\else\\expandafter\\@secondoftwo\\fi}',
  '\\protected\\def\\axtmark#1{\\ifaxt@off\\axt@colseen\\else\\ifhmode\\axt@ift#1\\relax{\\axt@put{#1}}{\\axt@mark{#1}}\\else\\axt@mark{#1}\\fi\\fi}',
  '\\protected\\def\\/{\\ifnum\\lastnodetype=6 \\ifdim\\axt@icv=\\z@\\axt@icr\\else\\kern\\axt@icv\\relax\\fi\\else\\axt@icr\\fi}\\let\\@@italiccorr\\/',
  '\\def\\axt@take{\\ifcase\\numexpr\\lastnodetype-10\\relax\\or\\expandafter\\axt@tg\\or\\expandafter\\axt@tk\\or\\expandafter\\axt@tp\\fi}',
  '\\def\\axt@tg{\\edef\\axt@back{\\hskip\\the\\lastskip\\relax\\axt@back}\\unskip\\axt@take}',
  '\\def\\axt@tk{\\ifdim\\lastkern=\\z@\\else\\edef\\axt@back{\\kern\\the\\lastkern\\relax\\axt@back}\\unkern\\expandafter\\axt@take\\fi}',
  '\\def\\axt@tp{\\edef\\axt@back{\\penalty\\the\\lastpenalty\\relax\\axt@back}\\unpenalty\\axt@take}',
  '\\def\\axt@set#1{\\relax\\let\\axt@back\\@empty\\axt@take\\axt@put{#1}\\axt@back}',
  '\\def\\axt@putbox#1{\\axt@ic\\hbox{\\axt@mark{#1}}\\ifaxt@sig\\vadjust{}\\fi}',
  '\\def\\axt@boxy{\\ifcat\\noexpand\\axt@next$1\\else\\ifx\\axt@next\\(1\\else\\ifx\\axt@next\\ensuremath1\\else\\ifx\\axt@next\\mbox1\\else\\ifx\\axt@next\\textsuperscript1\\else0\\fi\\fi\\fi\\fi\\fi}',
  '\\def\\axt@pmgo{\\ifx\\axt@back\\@empty\\ifcase\\lastnodetype\\axt@pmglued\\or\\or\\or\\or\\or\\or\\or\\axt@pmglued\\fi\\fi\\ifx\\axt@pmhow\\relax\\axt@put{\\axt@name}\\else\\axt@putbox{\\axt@name}\\fi\\let\\axt@pmhow\\relax\\axt@back}',
  '\\let\\axt@pmhow\\relax\\def\\axt@pmglued{\\ifnum\\axt@boxy=1 \\let\\axt@pmhow\\hbox\\fi}',
  '\\def\\axt@pmh{\\relax\\let\\axt@back\\@empty\\axt@take\\futurelet\\axt@next\\axt@pmgo}',
  '\\def\\axt@pmv#1{\\ifvmode\\xdef\\axt@pend{#1}\\fi}',
  '\\def\\axt@pmd#1{\\def\\axt@name{#1}\\axt@pmh}',
  '\\def\\axt@pmc{\\ifnum\\lastnodetype=-1 \\expandafter\\@gobble\\else\\expandafter\\axt@pmd\\fi}',
  '\\def\\axt@pmb{\\ifhmode\\expandafter\\axt@pmc\\else\\expandafter\\axt@pmv\\fi}',
  '\\protected\\def\\axt@pma{\\ifaxt@off\\expandafter\\@gobble\\else\\expandafter\\axt@pmb\\fi}',
  '\\protected\\def\\axt@pm#1{\\ifaxt@off\\else\\ifhmode\\ifnum\\lastnodetype=-1 \\else\\axt@set{#1}\\fi\\fi\\fi}',
  '\\protected\\def\\axt@hm#1{\\ifaxt@off\\else\\ifhmode\\relax\\axt@put{#1}\\fi\\fi}',
  '\\def\\axtpma{\\ifx\\protect\\@typeset@protect\\expandafter\\axt@pma\\else\\expandafter\\@gobble\\fi}',
  '\\def\\axtpm{\\ifx\\protect\\@typeset@protect\\expandafter\\axt@pm\\else\\expandafter\\@gobble\\fi}',
  '\\def\\axthmark{\\ifx\\protect\\@typeset@protect\\expandafter\\axt@hm\\else\\expandafter\\@gobble\\fi}',
  '\\ifdefined\\AddToHook\\AddToHook{cmd/@starttoc/before}{\\global\\axt@offtrue}\\AddToHook{cmd/@starttoc/after}{\\global\\axt@offfalse}\\AddToHook{cmd/@outputpage/before}{\\axt@offtrue}',
  '\\AddToHook{package/gettitlestring/after}{\\let\\axt@title@of\\GetTitleString\\long\\def\\GetTitleString#1{\\def\\axt@title{#1}\\axt@unmark\\axt@title\\expandafter\\axt@title@of\\expandafter{\\axt@title}}}',
  '\\AddToHook{package/nameref/after}{\\ifdefined\\NR@sanitize@labelname\\let\\axt@NRsanitize\\NR@sanitize@labelname\\def\\NR@sanitize@labelname{\\axt@unmark\\@currentlabelname\\axt@NRsanitize}\\fi}\\fi',
  '\\AtBeginDocument{\\ifdefined\\pdfstringdefDisableCommands\\pdfstringdefDisableCommands{\\let\\axtpma\\@gobble\\let\\axtpm\\@gobble\\let\\axthmark\\@gobble}\\fi}',
  '\\ifcsname l_text_case_exclude_arg_tl\\endcsname\\expandafter\\g@addto@macro\\csname l_text_case_exclude_arg_tl\\endcsname{\\axtmark\\axt@pma\\axt@pm\\axt@hm}\\fi',
  '\\ifdefined\\ExplSyntaxOn\\ExplSyntaxOn\\regex_const:Nn\\c__axt_marks_regex{\\c{axtpma|axtpm|axthmark}\\cB.\\c[^BE].*\\cE.}\\cs_new_protected:Npn\\axt@unmark#1{\\regex_replace_all:NnN\\c__axt_marks_regex{}#1}\\ExplSyntaxOff\\fi',
  '\\makeatother',
].join('')

/** every destination name the marked original may hold (without its 'axt-'): a unit's start or end (MARK_DEF), a page's
 *  columns, a cell's (t) or a heading's (h) start or end, a placeholder's (p) or a footnote call's (n) opening or closing
 *  mark by its unit and source piece index, a draft image frame's corner (g) */
export const MARK_NAME = /^(?:\d+[se]|c[12]-\d+|[th]\d+[se]|[pn]\d+\.\d+[ab]|g\d+[abt])$/

// ---------------------------------------------------------------- the marking
/** patch's own test of the pieces that are always set on the line, where a unit's start mark goes before one that opens
 *  the unit (latex-front.mjs INLINE: kept equal, which layout-marks.test.ts holds against patch itself) */
const INLINE = /^(?:\$|\\\(|\\ensuremath|\\(?:cite[a-z]*|ref|eqref|autoref|[cC]ref)(?![A-Za-z]))/
const WORD_END = /[\p{L}\p{N}]$/u
/** a source that ends an environment: \end skips the spaces after it where the environment says so (a display's,
 *  subequations' after a \label: 2608.12255), and a mark is the first thing it would not skip */
const ENDS_ENV = /\\end\s*\{[^{}]*\}\s*$/
/** a source that ends in a control sequence: TeX skips the spaces after a control word, and a macro of either may look
 *  ahead. Not LaTeX's \), which reads nothing after it */
const ENDS_IN_CS = /\\(?:[A-Za-z@]+\*?|[^A-Za-z@)])$/
/** a placeholder whose macro may look at what follows it: a paper's macro (\xspace, \@ifnextchar[ after its argument;
 *  \@esphack's \ignorespaces after \todo, \nocite, \marginpar), a footnote's call (fnpct's \footnote moves the
 *  punctuation after it), \xspace itself, and a prefix that applies to the next token (\protect\eqref: a mark between
 *  them takes the \protect, and is written to the list of figures as itself, 2608.23586). It gets no closing mark, and
 *  the piece right after it no mark at all, which its macro would see in that piece's place */
const LOOKS_AHEAD = p => {
  const cls = classOf(p)
  return cls === 'macro' || cls === 'footnote' || (p?.t === 'ph' && /\\(?:xspace\*?|protect|noexpand|expandafter|string|unexpanded|detokenize|global|long|outer|protected|immediate)$/.test(p.src ?? ''))
}

/**
 * Where a unit's start mark goes, as patch places it: the first piece at or after it, from `from`. The commands at the
 * unit's head that patch passes over — \noindent, a run-in heading's macro, a table row's \cline or \multicolumn — get
 * no mark: in vertical mode the opening mark would wait for the start mark set after them, at another place; at a table
 * row's start it would begin the cell before \cline's \noalign or \multicolumn's \omit, which TeX refuses. A unit that
 * opens with a footnote's call gets no start mark (patch); its pieces after the call are in the paragraph the call began
 */
function headEnd(pieces, from = 0) {
  for (let k = from; k < pieces.length; k++) {
    const p = pieces[k]
    if (p.t === 'text') {
      const s = !p.tr && p.src !== undefined ? p.src : p.s
      const w = /^[ \t\r\n]*(?=[^ \t\r\n])/.exec(s)
      if (!w) continue
      const prev = k > from ? pieces[k - 1] : null
      return w[0].length === 0 && prev?.t === 'ph' && /\\[A-Za-z@]+\*?$/.test(prev.src) ? k - 1 : k
    }
    if (p.t === 'open') continue
    if (p.t === 'ph') { if (INLINE.test(p.src)) return k; continue }
    return k + 1
  }
  return pieces.length
}
/** a forced break, which in a table the scanner does not read as one ends a row: what follows begins the next row */
const BREAK = /^\\(?:\\|(?:cr|crcr|tabularnewline)(?![A-Za-z@]))/
/** the pieces passed over, by index: at the unit's head (headEnd), and the same way after each forced break and each
 *  alignment tab, where a table's row or cell may begin in a table the scanner read as prose (aastex's deluxetable:
 *  \enddata after the last row's \\; tabularray's \SetCell, which must open its cell) */
function passedOver(pieces) {
  const out = new Set()
  const skip = from => { for (let k = from, end = headEnd(pieces, from); k < end; k++) out.add(k) }
  skip(0)
  pieces.forEach((p, k) => { if (p.t === 'ph' && (BREAK.test(p.src ?? '') || p.src === '&')) skip(k + 1) })
  return out
}

/**
 * The units with their layout marks as pieces of their own — each unit copied, a footnote's call pointing at its note's
 * copy, the paper's units untouched — and each unit's mark for patch(): MARK_DEF's for a marked unit (with \axtlines
 * when `lines`), a cell's and a heading's own. `mark` takes a unit or its copy.
 * A placeholder of a class in `classes`, at index k of unit i, in a unit with a mark, gets \axtpma{p<i>.<k>a} before it
 * and \axtpm{p<i>.<k>b} after it (`n` for a footnote's call), but where a mark would change what TeX does:
 * - none at a unit's head before its start mark, nor so after a forced break or an alignment's tab (passedOver);
 * - none right after a piece that may look ahead (LOOKS_AHEAD), and none for a paper's macro glued to the letters
 *   before it, which may be letters of the same word;
 * - the opening mark only for a piece that may look ahead, and where the closing one would follow a control sequence
 *   (TeX skips the spaces after a control word), white space (a mark there would stand on the next line, a blank one no
 *   paragraph's end any more: 2608.08350's `.\` before one) or an environment's \end
 */
export function layoutMarking(units, classes, { lines = false } = {}) {
  const on = new Set(classes)
  const base = markUnits(units)
  const index = new Map(units.map((u, i) => [u, i]))
  const own = u => {
    const i = index.get(u)
    if (u.kind === 'cell') return { start: `\\leavevmode\\axtmark{t${i}s}`, end: `\\axtend{t${i}e}` }
    if (u.kind === 'heading') return u.front ? null : { start: `\\axthmark{h${i}s}`, end: `\\axthmark{h${i}e}` }
    const m = base(u)
    return m && lines ? { ...m, before: `\\axtlines{${i}}` } : m
  }
  const copies = units.map(u => ({ ...u }))
  const copyOf = new Map(units.map((u, i) => [u, copies[i]]))
  units.forEach((u, i) => {
    const passed = own(u) ? passedOver(u.pieces) : null
    let last = null
    copies[i].pieces = u.pieces.flatMap((p, k) => {
      const piece = p.t === 'nested' ? { ...p, unit: copyOf.get(p.unit) ?? p.unit } : p
      const after = last
      if (p.t !== 'text' || /[^ \t\r\n]/.test(p.s)) last = p
      const cls = passed && !passed.has(k) && !LOOKS_AHEAD(after) ? classOf(p) : null
      if (!cls || !on.has(cls)) return [piece]
      // a paper's macro may set letters: glued to the word before, it is part of it (an accent, \\ss), and a mark would
      // part the word's hyphenation and kerns
      const before = u.pieces[k - 1]
      if (cls === 'macro' && before?.t === 'text' && WORD_END.test(before.s)) return [piece]
      const name = `${cls === 'footnote' ? 'n' : 'p'}${i}.${k}`
      const open = { t: 'ph', src: `\\axtpma{${name}a}` }
      if (LOOKS_AHEAD(p) || ENDS_IN_CS.test(p.src) || /\s$/.test(p.src) || ENDS_ENV.test(p.src)) return [open, piece]
      return [open, piece, { t: 'ph', src: `\\axtpm{${name}b}` }]
    })
  })
  const at = new Map([...index, ...copies.map((c, i) => [c, i])])
  return { units: copies, mark: u => (at.has(u) ? own(units[at.get(u)]) : null) }
}

// ---------------------------------------------------------------- the marks file
export const MARKS_CAP = 8 * 2 ** 20
export const MARKS_VALUES = 2_000_000
/** the deepest a marks file nests: its object, then marks or lines, then each entry, [name, page, x, y] or [id, count] */
export const MARKS_DEPTH = 3
const ENGINES = ['pdflatex', 'latex', 'xelatex', 'lualatex']
const KEYS = ['schema', 'engine', 'pages', 'views', 'columns', 'marks', 'dropped', 'lines', 'words', 'tokens']
const WORDS_MAX = 300_000, WORD_MAX = 200, LINES_MAX = 2000, BOX_MAX = 2000
const r2 = v => Math.round(v * 100) / 100

/** the names a log reports set twice: pdfTeX's and LuaTeX's warnings, dvipdfmx's, in every pass a log holds (a line TeX
 *  cut at 79 characters joined to the next) */
const duplicatesIn = log => {
  const text = (log ?? '').replace(/^(.{79})\n/gm, '$1'), out = new Set()
  for (const m of text.matchAll(/destination with the same identifier \(name\{axt-([^}\s]+)\}\)|duplicate destination with the name 'axt-([^'\s]+)'|Object @axt-(\S+?) already defined/g)) out.add(m[1] ?? m[2] ?? m[3])
  return [...out].filter(n => MARK_NAME.test(n))
}

/**
 * The marks file (internal, prep/<mid>/marks-<sha>.json) from a PDF.js document of the marked original and its last
 * TeX pass's log; the caller opens and destroys the document. Every destination MARK_NAME takes, by page (1-based) and
 * place, but one the log reports set twice (`dropped`: TeX kept the first, wherever that was) or off its page's view;
 * each page's view and columns (MARK_DEF's c<n>-<k>); each unit's line count (LINES_TEX's AXT-LINES); the document's
 * text tokens (tokenizeDocument), their words once each. A token whose word is the rest of one given in parts, longer
 * than a word may be, or off its page is left out. Numbers to a hundredth. What it gives, parseLayoutMarks takes
 */
export async function layoutMarksOf(marked, log, { engine }) {
  if (!ENGINES.includes(engine)) throw new LayoutRefusal('engine', `not one of ${ENGINES.join(', ')}`)
  const pdf = marked
  const pages = checkPages(pdf.numPages, 'pages')
  const views = [], text = []
  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p)
    views.push(...page.view.slice(0, 4).map(r2))
    const content = await page.getTextContent()
    text.push({ page: p, items: content.items, styles: content.styles })
  }
  checkViews(views, pages, 'views')
  const dropped = duplicatesIn(log), twice = new Set(dropped)
  const columns = new Array(pages).fill(0), marks = []
  // one page lookup a page, not one a destination: the worker answers each
  const pageOf = new Map()
  const pageNumber = async ref => {
    if (Number.isInteger(ref)) return ref + 1
    const key = ref && typeof ref === 'object' ? `${ref.num}R${ref.gen}` : null
    if (key === null) return null
    if (!pageOf.has(key)) pageOf.set(key, pdf.getPageIndex(ref).then(i => i + 1, () => null))
    return pageOf.get(key)
  }
  const dests = await pdf.getDestinations()
  for (const [full, d] of dests instanceof Map ? dests : Object.entries(dests ?? {})) {
    if (!full.startsWith('axt-') || !Array.isArray(d)) continue
    const name = full.slice(4)
    if (!MARK_NAME.test(name) || twice.has(name)) continue
    const page = await pageNumber(d[0]), x = d[2], y = d[3]
    if (!isInteger(page, 1, pages) || !isNumber(x) || !isNumber(y)) continue
    const c = /^c([12])-\d+$/.exec(name)
    if (c) columns[page - 1] = Number(c[1])
    if (!inView(views, page, r2(x), r2(y))) continue
    marks.push([name, page, r2(x), r2(y)])
  }
  marks.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const lines = [...readLines(log)].filter(([id, l]) => isInteger(id, 0, Number.MAX_SAFE_INTEGER) && isInteger(l.lines, 0, LINES_MAX)).sort((a, b) => a[0] - b[0]).map(([id, l]) => [id, l.lines])
  const words = [], wordOf = new Map(), tokens = []
  for (const t of tokenizeDocument(text)) {
    if (!t.t || t.t.length > WORD_MAX) continue
    const x = r2(t.x), y = r2(t.y), w = r2(t.w), h = r2(t.h)
    if (!inView(views, t.page, x, y) || !(w >= 0 && w <= BOX_MAX) || !(h >= 0 && h <= BOX_MAX)) continue
    let k = wordOf.get(t.t)
    if (k === undefined) {
      if (words.length >= WORDS_MAX) continue
      k = words.length
      words.push(t.t)
      wordOf.set(t.t, k)
    }
    tokens.push(t.page, x, y, w, h, k)
  }
  return { schema: 1, engine, pages, views, columns, marks, dropped, lines, words, tokens }
}

/** the marks file as written: the schema's keys in order, numbers to a hundredth */
export function encodeLayoutMarks(m) {
  const { schema, engine, pages, views, columns, marks, dropped, lines, words, tokens } = m
  return JSON.stringify({
    schema, engine, pages, views: views.map(r2), columns, marks: marks.map(([n, p, x, y]) => [n, p, r2(x), r2(y)]), dropped, lines, words,
    tokens: tokens.map((v, i) => (i % 6 === 0 || i % 6 === 5 ? v : r2(v))),
  })
}

/** bytes, then values and nesting, then JSON.parse, then every bound; throws LayoutRefusal, naming where */
export function parseLayoutMarks(bytes) {
  const m = checkKeys(boundedJson(bytes, { cap: MARKS_CAP, values: MARKS_VALUES, depth: MARKS_DEPTH }), KEYS, '')
  if (m.schema !== 1) throw new LayoutRefusal('schema', 'not 1')
  if (!ENGINES.includes(m.engine)) throw new LayoutRefusal('engine', `not one of ${ENGINES.join(', ')}`)
  const pages = checkPages(m.pages, 'pages')
  const views = checkViews(m.views, pages, 'views')
  if (!Array.isArray(m.columns) || m.columns.length !== pages) throw new LayoutRefusal('columns', `not ${pages} entries`)
  for (let i = 0; i < m.columns.length; i++) { const c = m.columns[i]; if (c !== 0 && c !== 1 && c !== 2) throw new LayoutRefusal(`columns[${i}]`, 'not 0, 1 or 2') }
  if (!Array.isArray(m.marks)) throw new LayoutRefusal('marks', 'not an array')
  const names = new Set()
  for (let i = 0; i < m.marks.length; i++) {
    const e = m.marks[i], at = `marks[${i}]`
    if (!Array.isArray(e) || e.length !== 4) throw new LayoutRefusal(at, 'not [name, page, x, y]')
    const [name, page, x, y] = e
    if (typeof name !== 'string' || !MARK_NAME.test(name)) throw new LayoutRefusal(`${at}[0]`, 'not a mark name')
    if (names.has(name)) throw new LayoutRefusal(`${at}[0]`, 'a name twice')
    names.add(name)
    if (!isInteger(page, 1, pages)) throw new LayoutRefusal(`${at}[1]`, `not a page 1 to ${pages}`)
    const o = 4 * (page - 1)
    if (!isNumber(x) || x < views[o] - 1 || x > views[o + 2] + 1) throw new LayoutRefusal(`${at}[2]`, 'not within its page')
    if (!isNumber(y) || y < views[o + 1] - 1 || y > views[o + 3] + 1) throw new LayoutRefusal(`${at}[3]`, 'not within its page')
  }
  if (!Array.isArray(m.dropped)) throw new LayoutRefusal('dropped', 'not an array')
  for (let i = 0; i < m.dropped.length; i++) { const n = m.dropped[i]; if (typeof n !== 'string' || !MARK_NAME.test(n)) throw new LayoutRefusal(`dropped[${i}]`, 'not a mark name') }
  if (!Array.isArray(m.lines)) throw new LayoutRefusal('lines', 'not an array')
  let id = -1
  for (let i = 0; i < m.lines.length; i++) {
    const e = m.lines[i]
    if (!Array.isArray(e) || e.length !== 2) throw new LayoutRefusal(`lines[${i}]`, 'not [id, count]')
    if (!isInteger(e[0], id + 1, Number.MAX_SAFE_INTEGER)) throw new LayoutRefusal(`lines[${i}][0]`, 'not an id above the last')
    if (!isInteger(e[1], 0, LINES_MAX)) throw new LayoutRefusal(`lines[${i}][1]`, `not a count 0 to ${LINES_MAX}`)
    id = e[0]
  }
  if (!Array.isArray(m.words) || m.words.length > WORDS_MAX) throw new LayoutRefusal('words', `not an array of at most ${WORDS_MAX}`)
  for (let i = 0; i < m.words.length; i++) { const w = m.words[i]; if (typeof w !== 'string' || w.length < 1 || w.length > WORD_MAX) throw new LayoutRefusal(`words[${i}]`, `not a word of 1 to ${WORD_MAX} code units`) }
  const t = m.tokens
  if (!Array.isArray(t) || t.length % 6 !== 0) throw new LayoutRefusal('tokens', 'not of stride 6')
  for (let i = 0; i < t.length; i += 6) {
    const page = t[i]
    if (!isInteger(page, 1, pages)) throw new LayoutRefusal(`tokens[${i}]`, `not a page 1 to ${pages}`)
    const o = 4 * (page - 1)
    if (!isNumber(t[i + 1]) || t[i + 1] < views[o] - 1 || t[i + 1] > views[o + 2] + 1) throw new LayoutRefusal(`tokens[${i + 1}]`, 'not within its page')
    if (!isNumber(t[i + 2]) || t[i + 2] < views[o + 1] - 1 || t[i + 2] > views[o + 3] + 1) throw new LayoutRefusal(`tokens[${i + 2}]`, 'not within its page')
    for (const j of [3, 4]) if (!isNumber(t[i + j]) || t[i + j] < 0 || t[i + j] > BOX_MAX) throw new LayoutRefusal(`tokens[${i + j}]`, `not 0 to ${BOX_MAX}`)
    if (!isInteger(t[i + 5], 0, m.words.length - 1)) throw new LayoutRefusal(`tokens[${i + 5}]`, 'not a word of words')
  }
  return m
}
