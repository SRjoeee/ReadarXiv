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
// skips; and none is written to a file or a PDF string, so that the aux, the lists and the bookmarks are byte for byte
// the paper's, but a babel name's (NAMES_TEX), which writes itself into the lists and the running heads it is copied
// into, and sets nothing there. The native cases (lab/pdf/spikes/
// layout-marks-cases.mjs) hold every text item of the page in place; the corpus check (Task 2) measures the layout
// lines they carry and lose, and fails on a loss of no accepted cause.
import { BACKREF_LIST, frontMarks, lastTexLog, markUnits, NO_ARG_COMMANDS } from '../source/latex-front.mjs'
import { textless } from '../rules/arg-roles.mjs'
import { symbolText } from '../rules/text-symbols.mjs'
import { INK_FREE_LEAD, prefixWord } from '../rules/tex-kernel.mjs'
import { tokenAtMark, tokenizeDocument } from '../pipeline/anchors.mjs'
import { DISPLAY, plainTranslated } from '../translate/mt.mjs'
import { readLines } from '../pipeline/typeset/tex.mjs'
import { annotsOf, linkKindOf, MAX_GLYPHS, MAX_LINKS, readAnnots } from '../layer-proto/links.mjs'
import { BOXES_PAGE, GLYPHS_PAGE, packGlyphs, pageInk } from './ink.mjs'
import { listWithin, OPS_MS, within } from './oplist.mjs'
import { isMemoryError } from '../pipeline/memory.mjs'
import { NAME_ENGLISH, NAME_KEYS } from './names.mjs'
import { fillOfColour } from './colour.mjs'
import { boundedJson, checkKeys, checkPages, checkViews, COORD_MAX, countValues, inView, isInteger, isNumber, isObject, LayoutRefusal, told } from './json.mjs'
import { OWNED, OWNED_HOW, ownedPages, spellOf, STREAM_COLUMNS, WANT } from './stream.mjs'

// ---------------------------------------------------------------- the classes
/** every class, in this order */
export const MARK_CLASSES = Object.freeze(['math', 'display', 'cite', 'ref', 'eqref', 'code', 'url', 'footnote', 'macro', 'number'])
/** the classes the run marks when asked: the global default, every class (Task 2's corpus check). The paper's own switch
 *  (layoutMarking's `switches`, what TeX answers to the mark probe) takes marks off a command's placeholders where TeX
 *  says they would change what follows them */
export const LAYOUT_CLASSES = Object.freeze([...MARK_CLASSES])

/** control words whose placeholder sets no ink, besides the declarations latex-front reads as taking no argument */
const INVISIBLE_WORDS = ['label', 'index', 'xspace', 'phantom', 'hphantom', 'vphantom', 'hspace', 'vspace', 'hskip', 'vskip', 'kern', 'color', 'nobreakspace', 'footnotesize', 'normalsize']
/** a placeholder whose rendering is never ink: matched on its leading control sequence — a tie, a forced break `\\`, one of
 *  TeX's and LaTeX's own that set no ink and read nothing after them (rules/tex-kernel.mjs: a space or kern, an italic
 *  correction, a discretionary hyphen, `\@`, a penalty, `\relax`…; none gets a mark, which would move a line), or a control
 *  word of the lists, followed by no letter */
export const INVISIBLE = new RegExp(String.raw`^(?:~|\\\\|${INK_FREE_LEAD}|\\(?:${[...NO_ARG_COMMANDS, ...INVISIBLE_WORDS].join('|')})(?![A-Za-z@]))`)
/** a character the scanner keeps as structure, with no ink of its own: an alignment's tab in a table it does not read as
 *  one (aastex's deluxetable between \\startdata and \\enddata), a stray brace, a parameter, a script mark */
const STRUCTURE = /^[&#^_{}]$/
/** a displayed formula's source: the wire's (mt.mjs), whose own stop it writes after the display's marker */
export { DISPLAY }
const MATH = /^(?:\$(?!\$)|\\\(|\\ensuremath(?![A-Za-z@]))/
const CITE = /^\\(?:[cC]ite[A-Za-z]*|(?:paren|text|auto)cites?)(?![A-Za-z@])/
const EQREF = /^\\eqref(?![A-Za-z@])/
const REF = /^\\(?:ref|autoref|[cC]ref|pageref|nameref)(?![A-Za-z@])/
const CODE = /^\\(?:texttt|verb|lstinline)(?![A-Za-z@])/
const URL = /^\\(?:url|href)(?![A-Za-z@])/
/** a number a bibliography entry keeps as the original's ink (latex-front.mjs keepNumbers): text of a digit and no letter, or
 *  a DOI written out, letters and all; none of TeX's special characters — no command, so it reads nothing after it and both its
 *  marks go */
const NUMBER = /^(?:[^\s\p{L}\\{}$%#&^_~]*\d[^\s\p{L}\\{}$%#&^_~]*|10\.\d{4,9}\/[^\s\\{}$%#&^_~]+)$/u
/** a footnote's call: \footnotemark, and a \footnote whose note the scanner made no unit of (fewer than two letters: a
 *  number, a link) — a call all the same, which the layer places by its mark */
const FOOTNOTE_MARK = /^\\footnote(?:mark)?(?![A-Za-z@])/

/** whether a piece is the list backref sets after a bibliography entry (latex-front.mjs BACKREF_LIST): no source of its own, its
 *  marks LAYOUT_TEX's around the list (layoutMarking's `\\axtbrname`), never a sample of the probe's */
export const backrefPiece = p => p?.t === 'ph' && p.src === BACKREF_LIST
/** a piece's class, or null where it is not marked (text, a group's open or close, an invisible placeholder) */
/** \\rule's call: what TeX's ink section measures, not the role table (a strut, \\rule{0pt}{2ex}, none; a bar, ink) */
export const RULE = /^\s*\\rule\b/
export function classOf(piece) {
  if (piece?.t === 'nested') return 'footnote'
  if (piece?.t !== 'ph') return null
  const src = piece.src ?? ''
  if (INVISIBLE.test(src) || STRUCTURE.test(src)) return null
  // a placeholder that can set no letters is no text rendering: never ink, never LOST — one of the commands the role
  // table proves so (arg-roles.mjs textless: rules, space, a length's or a counter's setting, a definition, a register's
  // assignment; a strut's \\rule{0pt}{2.2ex}, \\specialrule{1pt}{-1pt}{0pt}, \\addlinespace[2pt]), its arguments all there.
  // Not \\centerline, \\uppercase, \\noalign{\\hbox{…}} or a number printer. Read with no paper, by the kernel's forms and
  // those written out: a table's rule stays the page's own vector ink. Not \\rule either, which a box holds and TeX is
  // asked about (the ink section): a strut sets none, but a bar in a line (a legend's square) is ink that moves with it
  if (textless(src) && !RULE.test(src)) return null
  if (DISPLAY.test(src)) return 'display'
  if (MATH.test(src)) return 'math'
  if (CITE.test(src)) return 'cite'
  if (EQREF.test(src)) return 'eqref'
  if (REF.test(src)) return 'ref'
  if (CODE.test(src)) return 'code'
  if (URL.test(src)) return 'url'
  if (FOOTNOTE_MARK.test(src)) return 'footnote'
  if (NUMBER.test(src)) return 'number'
  return 'macro'
}

// ---------------------------------------------------------------- the paper's own switch: TeX asked
/** what the mark probe sets after a placeholder: the six marks of punctuation a package may look for and set first
 *  (biblatex scans for all six; natmove, cite.sty and REVTeX for the first four), a word after a space, and for a
 *  footnote's call a second call; for a paper's complete macro whose probed call is glued to a placeholder (probeSamples'
 *  `glued`), that placeholder in the last's place, else nothing there (0, as every other sample's) */
export const FOLLOWERS = Object.freeze(['.', ',', ';', ':', '!', '?', 'word', 'call'])
const PUNCT = '.,;:!?'
/** the punctuation marks a package may set before a citation's or a call's own ink, moved from after it (cite.sty's
 *  \\CiteMoveChars, natmove's, fnpct's): those the probe asks about (TeX answers 3 for those it moves, layoutMarking), a piece's
 *  closing mark after one of them holding it first (followsOf `moved`) */
const MOVED = PUNCT
/** the classes whose commands the probe asks about: a package may look past their closing brace (a paper's macro has its
 *  opening mark alone (LOOKS_AHEAD), but one that reads nothing past its arguments, which the probe asks about too) */
const ASKED = new Set(['cite', 'ref', 'eqref', 'url', 'footnote'])
/** the commands asked about at most, a paper; and of the paper's macros that read nothing past their arguments, apart (a
 *  paper may set its every number by one: 2610.21098 calls 316), each source at most COMPLETE_SRC_MAX long */
export const PROBE_MAX = 16, COMPLETE_PROBE_MAX = 512
const COMPLETE_SRC_MAX = 200
/** the pairs of a paper's macro and the placeholder right after it the probe asks about at most, a paper (aheadSamples) */
export const AHEAD_PROBE_MAX = 128
/** the classes of a placeholder after a paper's macro the probe asks about (aheadSamples): those the maker cannot find
 *  with no mark of their own (a paper's macro is found by the text TeX sets for it, a display is set in no box of a line) */
const AHEAD_FOLLOWS = new Set(['math', 'cite', 'ref', 'eqref', 'code', 'url', 'footnote', 'number'])
/** the white space between two pieces, as TeX reads it in a line: one space (any run of spaces, tabs and one line's end), or
 *  none; null for anything else (a blank line, a paragraph's end, a character) */
const gapOf = s => (s === '' ? '' : /^[ \t]*(?:\r?\n)?[ \t]*$/.test(s) ? ' ' : null)
/** the key of TeX's answer for a paper's macro and the placeholder it precedes (aheadSamples): the two sources and the white
 *  space between, joined by `#`, which neither holds (`fit`); never a control word, so no command's answer is one */
export const aheadKey = (src, gap, follows) => `${src}#${gap}#${follows}`
/** the complete macros as a map, name → arity, from the front end's pairs or the marking's object */
const completeMap = c => (c instanceof Map ? c : new Map(Array.isArray(c) ? c : Object.entries(c ?? {})))
/** a piece's leading command: \cite of \cite[p.~3]{a}, \footnote of a call; null for none */
/** the units in the order the probe's samples are taken: a bibliography's entries (latex-front.mjs bibliography: kinds
 *  `reference` and `refnames`) after every other unit, wherever they stand, so that the body's samples are the ones they were
 *  before entries were units, and an entry's takes what room the caps leave. A macro a .bbl defines (\\providecommand{\\doi}),
 *  unknown to the probe's preamble, is no answer there (an error), never a wrong one */
const BIB = u => u?.kind === 'reference' || u?.kind === 'refnames'
const sampleOrder = units => (units.some(BIB) ? [...units.filter(u => !BIB(u)), ...units.filter(BIB)] : units)
export const commandOf = p => (p?.t === 'nested' ? /^\\[A-Za-z@]+/.exec(p.pre ?? '')?.[0] : p?.t === 'ph' ? /^\\[A-Za-z@]+/.exec(p.src ?? '')?.[0] : null) ?? null
/**
 * The mark probe's samples: each command of the asked classes the paper writes, once, by the first piece of it TeX can
 * set in a box (no comment or parameter sign, no \verb): a placeholder's own source (a citation of the keys the paper
 * cites), or a call with a note of its own words; and each of the paper's macros that read nothing past their arguments
 * (`complete`: latex-front.mjs completeMacros), by its first call that holds them (completeCall), at most COMPLETE_PROBE_MAX:
 * what follows such a call may still be looked at by what its body sets (a citation under cite's superscripts, a footnote
 * under fnpct, a kern after its last letter), and only TeX's answer says a closing mark there moves nothing. The asked
 * classes' first, then the paper's own (`own`), which markProbeTex asks about last
 */
export function probeSamples(units, complete = null) {
  const seen = new Map(), own = new Map(), closed = completeMap(complete)
  const fit = src => !/[%#]|\\(?:verb|lstinline)(?![A-Za-z@])/.test(src) && src.length <= 400
  for (const u of sampleOrder(units)) for (const [k, p] of u.pieces.entries()) {
    const cmd = commandOf(p), cls = classOf(p)
    if (!cmd) continue
    if (ASKED.has(cls)) {
      if (seen.has(cmd) || seen.size >= PROBE_MAX) continue
      const src = p.t === 'nested' ? `${p.pre}A note.${p.post}` : p.src
      if (fit(src)) seen.set(cmd, { command: cmd, src, call: cls === 'footnote' })
    } else if (cls === 'macro' && !own.has(cmd) && own.size < COMPLETE_PROBE_MAX && completeCall(p, closed) && fit(p.src) && p.src.length <= COMPLETE_SRC_MAX) {
      // (the placeholder its call is glued to, where one stands right after it: `\\share{}\\%`, asked as its `call` follower)
      // (a percent or hash sign only escaped, as a text symbol writes it: `\\%`, an odd number of backslashes before it)
      const next = u.pieces[k + 1], glued = next?.t === 'ph' && typeof next.src === 'string' && fit(next.src.replace(/(?<!\\)((?:\\\\)*)\\[%#]/g, '$1')) && next.src.length <= COMPLETE_SRC_MAX ? next.src : null
      own.set(cmd, { command: cmd, src: p.src, call: false, own: true, ...(glued ? { glued } : {}) })
    }
  }
  return [...seen.values(), ...own.values(), ...aheadSamples(units)]
}
/** a source the probe sets in a box: no comment or parameter sign, no \verb, at most 400 code units (probeSamples' `fit`) */
const probeFit = src => typeof src === 'string' && !/[%#]|\\(?:verb|lstinline)(?![A-Za-z@])/.test(src) && src.length <= 400
/**
 * The look-ahead pairs' samples (`ahead`): each placeholder of the paper's own macros (classOf 'macro', not a text symbol)
 * followed, right after it or past white space alone, by a placeholder of AHEAD_FOLLOWS, paired with that placeholder, each
 * pair of sources (and the white space between) once, in the paper's order, at most AHEAD_PROBE_MAX, each source at most
 * COMPLETE_SRC_MAX long. Such a macro may look at what follows it (LOOKS_AHEAD: \\xspace, \\@ifnextchar), so the piece after it
 * gets no mark unless TeX says one there moves nothing; and that piece, unmarked, is LOST, its unit the original's
 * (2609.20976's \\snr, `\\ac{SNR}\\xspace`, before `$\\geq 50$`). Read from the units alone, whatever the paper's complete macros:
 * the samples are numbered by their own rows (aheadSection), the same for every reader of the probe's log. Asked last
 */
export function aheadSamples(units) {
  const out = new Map()
  for (const u of sampleOrder(units)) {
    const pieces = u.pieces ?? []
    for (let q = 0; q < pieces.length; q++) {
      if (out.size >= AHEAD_PROBE_MAX) return [...out.values()]
      const pair = pairOf(pieces, q), next = pieces[q]
      if (!pair || !AHEAD_FOLLOWS.has(classOf(next)) || prefixWord(next.src) || !probeFit(next.src) || !next.src.length || next.src.length > COMPLETE_SRC_MAX) continue
      const [m, gap] = pair, key = aheadKey(m.src, gap, next.src)
      if (!out.has(key)) out.set(key, { key, src: m.src, gap, follows: next.src, math: classOf(next) === 'math', ahead: true })
    }
  }
  return [...out.values()]
}
/** the paper's macro the placeholder at `q` of a unit's pieces follows right after it, or past one text piece of white space
 *  alone (gapOf), and that white space: [the macro's piece, ' ' or '', its index], or null — none for a text symbol (READS_NOTHING), a
 *  prefix (\protect: it is the next piece's), a macro after a prefix (whose marks stand before the prefix), a source the probe
 *  cannot set in a box, or one the marks file would not hold as a pair's key (AHEAD_KEY: a control sequence first) */
function pairOf(pieces, q) {
  const p = pieces[q]
  if (p?.t !== 'ph') return null
  const gapped = pieces[q - 1]?.t === 'text', at = gapped ? q - 2 : q - 1, m = pieces[at], gap = gapped ? gapOf(pieces[q - 1].s ?? '') : ''
  if (gap === null || at < 0 || m?.t !== 'ph' || classOf(m) !== 'macro' || READS_NOTHING(m) || prefixWord(m.src) || !probeFit(m.src) || !/^\\./.test(m.src) || m.src.length > COMPLETE_SRC_MAX) return null
  if (at > 0 && pieces[at - 1].t === 'ph' && prefixWord(pieces[at - 1].src)) return null
  return [m, gap, at]
}
// ---- the probe document: sections, each writing tagged rows
/** the probe's schema: raised when a row's shape changes; a new section adds rows of a tag of its own, and changes no
 *  other's */
export const PROBE_SCHEMA = 1
/** the TeX that writes one row: `LAYOUT-PROBE <schema> <tag> <fields…>`, fields separated by spaces, each written by
 *  TeX (a macro's expansion) or given here; never a line the run reads as a reading (no `AXT-`) */
export const probeRow = (tag, ...fields) => `\\typeout{LAYOUT-PROBE ${PROBE_SCHEMA} ${tag} ${fields.join(' ')}}`
/** the probe document's body, after \begin{document} of the font probe's compile (the paper's own preamble): its
 *  sections' TeX, each a self-contained group of tests that writes its own rows, in order */
export const probeTex = sections => `\\makeatletter${sections.join('\n')}\\makeatother\n`
/** every row a probe's log holds: { schema, tag, fields }, in order. Rows of another schema or of a tag the caller does
 *  not know are the caller's to pass over */
export function readProbe(log) {
  const out = []
  for (const m of (log ?? '').matchAll(/^LAYOUT-PROBE (\d+) ([a-z][a-z0-9-]*)((?: [^ \n]+)*) *$/gm)) out.push({ schema: Number(m[1]), tag: m[2], fields: m[3].trim().split(' ').filter(Boolean) })
  return out
}

/**
 * The punctuation section of the probe (`punct`). For each sample and
 * each follower, the sample set in a box after a word, as the paper sets it, then with `{}` between it and the follower
 * (does the command look at what follows?), with its two layout marks, with its opening mark alone, the boxes compared
 * by width, height, depth and their last node; for `call`, the call before a second one with an opening mark between
 * them or none. One row a sample, `punct <i> <a code a follower>`: 0 every mark as LAYOUT_TEX sets it, 1 no
 * closing mark, 2 no mark (for `call`: 0 a mark may stand between the two calls, 2 none may), 3 before a punctuation mark the
 * command looks at (the box with `{}` another), where the pair with a word after it is set the same with the opening mark before
 * the command and the closing mark after the mark (cite.sty's superscripts set `\\cite{x}.` as ".¹": both marks so, the mark
 * then its ink's first glyph, followsOf `moved`); before each box a row
 * `punct-at <i> <j> <box>`, so that an error TeX logs is that box's (readMarkProbe). Each
 * box is set into a register voided first, and says whether it closed where it was meant to (\ifinner at its last
 * statement): a box an error ended early is never the box before it, still in the register (the re-review's I-new:
 * REVTeX's citeautoscript was answered every mark before `!`, `?` and a word). Every box starts from the
 * same state: the footnote counter as it was (a call's number of two digits is wider than one of one: 2608.27728), and
 * biblatex's citation trackers reset (a second citation of a key may be set short). Every box ends at a space,
 * where each package's lookahead stops (REVTeX's swap takes any token after the citation in a \csname); an empty
 * paragraph after each sample starts TeX's error count again. Writes nothing, ships out nothing
 */
export function punctuationSection(samples, from = 0) {
  const box = (i, j, n, body) => `${probeRow('punct-at', i, j, n)}\\global\\setbox\\axt@qbox\\box\\voidb@x\\gdef\\axt@qn{}\\axt@qreset${PROBE_LEVEL}\\setbox\\axt@qbox\\hbox{way ${body} \\unskip\\xdef\\axt@qn{\\the\\lastnodetype\\ifinner\\ifhmode/in\\fi\\fi}}\\axt@unwind\\xdef\\axt@q${n}{\\the\\wd\\axt@qbox/\\the\\ht\\axt@qbox/\\the\\dp\\axt@qbox/\\axt@qn}`
  const put = d => `\\xdef\\axt@qo{\\axt@qo${d}}`
  const tests = samples.map(({ src, call, glued }, n) => {
    const i = from + n, open = `\\axtpma{q${i}a}`, close = `\\axtpm{q${i}b}`
    // (before a punctuation mark the command moves, a ≠ b: the pair as the paper sets it with a word after (m), and with the
    // opening mark before the command and the closing one after the mark it moves (p): equal, both marks go so, 3)
    const moved = f => (f === ' x' ? put(2) : `${box(i, PUNCT.indexOf(f), 'm', `${src}${f} x`)}${box(i, PUNCT.indexOf(f), 'p', `${open}${src}${f}${close} x`)}\\ifx\\axt@qm\\axt@qp${put(3)}\\else${put(2)}\\fi`)
    const each = [...PUNCT, ' x'].map((f, j) => `\\begingroup${box(i, j, 'a', `${src}${f}`)}${box(i, j, 'b', `${src}{}${f}`)}${box(i, j, 'c', `${open}${src}${close}${f}`)}${box(i, j, 'd', `${open}${src}${f}`)}\\ifx\\axt@qa\\axt@qb\\endgroup\\ifx\\axt@qa\\axt@qd\\ifx\\axt@qa\\axt@qc${put(0)}\\else${put(1)}\\fi\\else${put(2)}\\fi\\else${moved(f)}\\endgroup\\fi`).join('')
    const again = call ? `\\begingroup${box(i, 7, 'a', `${src}${src}`)}${box(i, 7, 'e', `${src}\\axtpma{q${i}c}${src}`)}\\endgroup\\ifx\\axt@qa\\axt@qe${put(0)}\\else${put(2)}\\fi`
      : glued ? `\\begingroup${box(i, 7, 'a', `${src}${glued}`)}${box(i, 7, 'b', `${src}{}${glued}`)}${box(i, 7, 'c', `${open}${src}${close}${glued}`)}\\endgroup\\ifx\\axt@qa\\axt@qb\\ifx\\axt@qa\\axt@qc${put(0)}\\else${put(1)}\\fi\\else${put(2)}\\fi`
      : put(0)
    return `${each}${again}${probeRow('punct', i, '\\axt@qo')}\\gdef\\axt@qo{}\\noindent\\par`
  })
  return `${PROBE_UNWIND}\\begingroup\\newbox\\axt@qbox\\gdef\\axt@qo{}${PROBE_RESET}${tests.join('\n')}\\endgroup`
}
/** each box of the punctuation, ink and look-ahead sections ends where it began: the group level before it saved
 *  (PROBE_LEVEL), and after its `}` (PROBE_UNWIND) each group its sample left open closed — a \\begingroup's by \\endgroup, a
 *  group of braces' or a box's by \\egroup —, so that the box after it is set as the paper sets it. A sample TeX gives up on
 *  part way may leave its own groups open, and everything they hold in force for the rest of the probe: 2010.11929v2's
 *  `\\tikz\\fill[natural] (0,0) circle (.5ex);`, cut in two, asks about \\tikz alone, which opens a picture it never closes,
 *  sixteen groups in which pgf's \\selectfont selects \\nullfont, and every box after it was set with no character at all (its
 *  \\natexlab{a} and \\doi{…} read as setting no ink, their rows none, 8 of its entries English; a pair's boxes, all empty, as
 *  a mark that moves nothing). A box TeX still sets a character in \\nullfont in is no answer (TEX_ERROR). In a probe of no such
 *  sample it changes nothing: each box closes its own groups */
const PROBE_LEVEL = '\\xdef\\axt@level{\\the\\currentgrouplevel}'
const PROBE_UNWIND = '\\gdef\\axt@unwind{\\global\\let\\axt@unwound\\relax\\ifnum\\currentgrouplevel>\\axt@level\\relax\\ifnum\\currentgrouptype=14 \\global\\let\\axt@unwound\\axt@unwind\\endgroup\\else\\ifnum\\currentgrouptype<6 \\ifnum\\currentgrouptype>0 \\global\\let\\axt@unwound\\axt@unwind\\egroup\\fi\\fi\\fi\\fi\\axt@unwound}'
/** each box of the punctuation and look-ahead sections starts from the same state: the footnote counter as it was, biblatex's
 *  citation trackers reset (punctuationSection) */
const PROBE_RESET = '\\edef\\axt@qfn{\\ifdefined\\c@footnote\\the\\c@footnote\\else0\\fi}\\def\\axt@qreset{\\ifdefined\\c@footnote\\global\\c@footnote=\\axt@qfn\\relax\\fi\\ifdefined\\citereset\\citereset\\fi}'
/** a placeholder before which LAYOUT_TEX's opening mark, glued to a letter, sets itself in a box (\\axt@boxy: a formula, \\mbox,
 *  \\textsuperscript), so that TeX hyphenates the word before it no more than before the placeholder itself */
const BOXY = /^(?:\$|\\\(|\\(?:ensuremath|mbox|textsuperscript)(?![A-Za-z@]))/
/**
 * The look-ahead section of the probe (`ahead`): for each pair of aheadSamples, the macro and the placeholder after it set in a
 * box after a word as the paper sets them (a), with the macro's two marks and the placeholder's opening one (c), and with the
 * macro's opening mark and the placeholder's (d), the boxes compared as the punctuation section's are (width, height, depth,
 * last node, closed where meant), each after the pair set once in a box of its own and let go (a first call's state spent:
 * acronym's \\ac sets its long form once, then the short one, so that the boxes are set from one state). A box cannot show
 * TeX's hyphenation, which a mark's whatsit right after a word changes: TeX never hyphenates a word a box, a rule or a formula
 * follows (a citation's box, `Transformer[1]`), and does one a whatsit follows. So a box (g) as d asks what the list ends with
 * where the placeholder's opening mark goes (\\lastnodetype): glue, a penalty, a box or nothing of a word (0); a letter, a
 * ligature or a font's kern, which the mark is set against (1); a discretionary or a whatsit, under XeTeX a word (2). One row
 * a pair, `ahead <j> <code>`: 0 every mark as LAYOUT_TEX sets it (a = c = d, the list not ending in a word), 1 the macro's
 * opening mark alone and the placeholder's (a = d, and the list not ending in a word, or ending in a letter before a
 * placeholder the mark boxes itself before: BOXY), 2 none on the placeholder; before each box a row `ahead-at <j> <box>` (w
 * the first, then a, c, d, g), so that an error TeX logs is that box's (readMarkProbe). An empty paragraph after each starts
 * TeX's error count again. Writes nothing, ships out nothing
 */
export function aheadSection(samples) {
  const box = (j, n, body) => `${probeRow('ahead-at', j, n)}\\global\\setbox\\axt@qbox\\box\\voidb@x\\gdef\\axt@qn{}\\axt@qreset${PROBE_LEVEL}\\setbox\\axt@qbox\\hbox{way ${body} \\unskip\\xdef\\axt@qn{\\the\\lastnodetype\\ifinner\\ifhmode/in\\fi\\fi}}\\axt@unwind\\xdef\\axt@q${n}{\\the\\wd\\axt@qbox/\\the\\ht\\axt@qbox/\\the\\dp\\axt@qbox/\\axt@qn}`
  const put = d => `\\xdef\\axt@qo{${d}}`
  const tests = samples.map(({ src, gap, follows, math }, j) => {
    const open = `\\axtpma{q${j}a}`, close = `\\axtpm{q${j}b}`, next = `\\${math ? 'axtpmm' : 'axtpma'}{q${j}c}`
    const boxes = `${box(j, 'w', `${src}${gap}${follows}`)}${box(j, 'a', `${src}${gap}${follows}`)}${box(j, 'c', `${open}${src}${close}${gap}${next}${follows}`)}${box(j, 'd', `${open}${src}${gap}${next}${follows}`)}\\gdef\\axt@qend{2}${box(j, 'g', `${open}${src}${gap}\\axt@qat${next}${follows}`)}`
    const word = BOXY.test(follows) ? put(1) : put(2)
    return `\\begingroup${boxes}\\endgroup\\ifx\\axt@qa\\axt@qd\\ifcase\\axt@qend\\relax\\ifx\\axt@qa\\axt@qc${put(0)}\\else${put(1)}\\fi\\or${word}\\else${put(2)}\\fi\\else${put(2)}\\fi${probeRow('ahead', j, '\\axt@qo')}\\gdef\\axt@qo{}\\noindent\\par`
  })
  // (what the list ends with where the placeholder's opening mark goes, by \\lastnodetype: 0 a character, 7 a ligature, 12 a kern
  // — 1; 8 a discretionary, 9 a whatsit — 2; any other — 0)
  const at = '\\def\\axt@qat{\\xdef\\axt@qend{\\ifcase\\lastnodetype 1\\or0\\or0\\or0\\or0\\or0\\or0\\or1\\or2\\or2\\or0\\or0\\or1\\else0\\fi}}'
  return `${PROBE_UNWIND}\\begingroup\\newbox\\axt@qbox\\gdef\\axt@qo{}${PROBE_RESET}${at}${tests.join('\n')}\\endgroup`
}
// ---- what a paper's macro sets: TeX asked
/** the distinct sources of the paper's macros the ink section asks about, at most */
export const INK_MAX = 64
/** a macro's source as the ink section asks about it, at most */
const INK_SRC_MAX = 200
/** the distinct samples the ink section asks about a bibliography's entries, past the body's INK_MAX: their own share, so that
 *  a body whose macros fill INK_MAX leaves no entry unasked (2608.25210v2: 101 macro sources, its entries' \\natexlab{} never
 *  asked, their entries English) */
export const ENTRY_INK_MAX = 64
/**
 * The ink section's samples: the source of each of the paper's macros (classOf 'macro'), once, in the order the paper
 * writes them, that TeX can set in a box of its own (no comment or parameter sign, no \verb, its braces balanced, no
 * environment, no paragraph's end): the body's at most INK_MAX, then a bibliography's entries' at most ENTRY_INK_MAX — first the
 * calls the room the body leaves of INK_MAX would have asked, in the paper's order, so that no entry is asked less than before;
 * then the entries' leads, whose ink only their own text finds (make.mjs besideMarks); then each further call, in order. A call
 * past them is no sample, as one past INK_MAX was: no answer of another call is carried to it (the reviews of #495 — no ink and
 * a box begun apart may hang on its argument's value, and a text carried may be a prefix of what it sets, which a split or a
 * lead read from one side would take as its end). A symbol the layout draws as text (TEXT_SYMBOLS) is not asked
 */
export function inkSamples(units) {
  const body = new Set(), calls = [], seen = new Set(), leads = new Set()
  for (const u of sampleOrder(units)) {
    const head = BIB(u) ? headEnd(u.pieces ?? [], 0) : 0
    u.pieces.forEach((p, k) => {
      if (p.t !== 'ph' || classOf(p) !== 'macro' || backrefPiece(p) || body.has(p.src) || symbolText(p.src) !== null || !boxable(p.src)) return
      if (!BIB(u)) { if (body.size < INK_MAX && !seen.has(p.src)) body.add(p.src); return }
      if (k < head) leads.add(p.src)
      if (seen.has(p.src)) return
      seen.add(p.src)
      calls.push(p.src)
    })
  }
  // (first the calls the body's room left would have asked, in the paper's order, so that no entry is asked less than it was;
  // then the entries' leads, whose ink only their own text finds (make.mjs besideMarks); then each further call, in order)
  const asked = new Set(calls.slice(0, Math.max(0, Math.min(ENTRY_INK_MAX, INK_MAX - body.size))))
  for (const src of calls) { if (asked.size >= ENTRY_INK_MAX) break; if (leads.has(src)) asked.add(src) }
  for (const src of calls) { if (asked.size >= ENTRY_INK_MAX) break; asked.add(src) }
  return [...body, ...calls.filter(src => asked.has(src))]
}
/** the ink section's answers from the probe's log, as the layout takes them: the macros TeX said set no ink (readInkProbe), the
 *  texts it showed they and the leads set (readInkTexts), those whose box it began apart (readInkApart), each the asked
 *  source's own. The one reader every caller takes them by: layout/paper.mjs, the lab's */
export function readInkAnswers(log, units) {
  const ink = inkSamples(units), leads = leadSamples(units, ink)
  return { inkless: readInkProbe(log, ink), texts: readInkTexts(log, [...ink, ...leads]), apart: readInkApart(log, ink) }
}
const balanced = s => { let d = 0; for (let i = 0; i < s.length; i++) { if (s[i] === '\\') { i++; continue } if (s[i] === '{') d++; else if (s[i] === '}' && --d < 0) return false } return d === 0 }
/** a source TeX can set in a box of its own: no comment or parameter sign, no \\verb, its braces balanced, no environment, no
 *  paragraph's end, at most INK_SRC_MAX long */
const boxable = src => !!src && src.length <= INK_SRC_MAX && !/[%#]|\\(?:verb|lstinline|begin|end|par)(?![A-Za-z@])/.test(src) && balanced(src)
/** the leads the ink section asks about past the paper's macros inkSamples takes, at most */
export const LEAD_MAX = 64
/**
 * The leads' samples: the placeholders at a unit's head, before its start mark (headEnd), where no mark goes, that inkSamples
 * does not ask about — inline code (classOf 'code': a cell's \\texttt{max\\_tokens}, 2610.21098v1 p13u138) and a paper's macro
 * past INK_MAX —, once, in the paper's order, each a source TeX can set in a box of its own, at most LEAD_MAX. What TeX sets
 * for one is its text (readInkTexts), by which the layout finds a lead's ink beside its unit's start (make.mjs besideMarks)
 * and the erasure a cell's (own.mjs, MR 5b): with no text, the unit is the original's. Asked last (markProbeTex)
 */
export function leadSamples(units, asked = inkSamples(units)) {
  const seen = new Set(asked), out = []
  for (const u of sampleOrder(units)) {
    const pieces = u.pieces ?? [], head = headEnd(pieces, 0)
    for (let k = 0; k < head; k++) {
      if (out.length >= LEAD_MAX) return out
      const p = pieces[k], cls = classOf(p)
      if ((cls !== 'macro' && cls !== 'code') || seen.has(p.src) || symbolText(p.src) !== null || !boxable(p.src)) continue
      seen.add(p.src)
      out.push(p.src)
    }
  }
  return out
}
/**
 * The ink section of the probe (`ink`): each sample set in a box of its own, in a group, and the box shown in the log
 * (\showbox, every node: TeX's own list of what it set), between a row `ink-at <i>` and a row `ink-end <i>` (`i` numbered on
 * from `from`); an empty paragraph after each starts TeX's error count again. Writes nothing, ships out nothing (readInkProbe)
 */
export function inkSection(samples, from = 0) {
  const show = '\\begingroup\\showboxbreadth=100000 \\showboxdepth=100000 \\tracingonline=0 \\showbox\\axt@ibox\\endgroup'
  const tests = samples.map((src, i) => `${probeRow('ink-at', from + i)}\\begingroup\\global\\setbox\\axt@ibox\\box\\voidb@x${PROBE_LEVEL}\\setbox\\axt@ibox\\hbox{${src}}\\axt@unwind${show}\\endgroup${probeRow('ink-end', from + i)}\\noindent\\par`)
  return `${PROBE_UNWIND}\\begingroup\\newbox\\axt@ibox${tests.join('\n')}\\endgroup`
}
/** the probe document of the layout marks: its punctuation section, then its ink section, its name section, its skip section,
 *  the punctuation section of the paper's own macros (probeSamples' `own`, numbered on from the asked ones), and last the ink
 *  section of the leads (leadSamples, numbered on from `ink`): a call of one of the paper's macros runs whatever its body does,
 *  which may be more errors than TeX goes on past (a hundred in one paragraph), and what it loses then is the answers after
 *  it, its own kind's, which the marking does without as before. 2610.21377's jnsao.cls defines \\and as ` and ` in a group at
 *  \\begin{document}, which completeMacros takes for the document's (a definition in a group or a hook is read as any other);
 *  the probe's \\and is the kernel's, \\end{tabular}…, and TeX stops there: the answers for \\N and \\defeq after it are lost,
 *  the ink answers before it stand. A paper with no lead to ask about has the document it had. After them all the look-ahead
 *  section (aheadSamples, numbered by its own rows): each pair's macro runs whatever its body does too, and what an error there
 *  loses is the pairs after it, whose pieces keep no mark as before. A paper with no such pair has the document it had */
export const markProbeTex = (samples, ink = [], leads = []) => {
  const listed = samples.filter(s => !s.ahead), ahead = samples.filter(s => s.ahead)
  const n = listed.findIndex(s => s.own), asked = n < 0 ? listed : listed.slice(0, n)
  return probeTex([punctuationSection(asked), ...(ink.length ? [inkSection(ink)] : []), nameSection(), skipSection(), ...(n < 0 ? [] : [punctuationSection(listed.slice(n), n)]), ...(leads.length ? [inkSection(leads, ink.length)] : []), ...(ahead.length ? [aheadSection(ahead)] : [])])
}
/** a node TeX lists that sets no ink: glue, a kern, a penalty, a math switch, a box (its own nodes listed below it), a
 *  mark, a colour stack, a write, a destination, a saved or restored matrix, an adjust's or a discretionary's head
 *  (theirs below), leaders' head (their box or rule below) */
const NO_INK_NODE = /^\.+\\(?:glue|kern|penalty|mathon|mathoff|[hv]box\(|mark|pdfcolorstack|write|openout|closeout|pdfdest|pdfsave|pdfrestore|pdfsetmatrix|vadjust|discretionary|leaders|cleaders|xleaders)/
/** a rule TeX lists: its height, depth and width (`*` running) */
const RULE_NODE = /^\.+\\rule\(([-\d.*]+)\+([-\d.*]+)\)x([-\d.*]+)$/
/**
 * The sources TeX set no ink for, from the probe's log (inkSection): each sample whose box TeX listed in full, of nodes
 * that set nothing — no character, no rule both wide and high (TeX ships no rule of no width or height: a strut), no
 * literal, special, insertion or node it lists otherwise — with no error between its rows but the listing's own `! OK.`.
 * A sample with no listing, an error, a line cut short or a node not known is no answer: what it sets is not known
 */
export function readInkProbe(log, samples) {
  const out = []
  let at = null, nodes = null, bad = false, done = false
  for (const line of (log ?? '').split('\n')) {
    const [r] = /^LAYOUT-PROBE /.test(line) ? readProbe(line) : []
    if (r && r.schema === PROBE_SCHEMA && (r.tag === 'ink-at' || r.tag === 'ink-end') && r.fields.length === 1) {
      const i = Number(r.fields[0])
      if (r.tag === 'ink-at') { at = i; nodes = null; bad = false; done = false; continue }
      if (at === i && nodes && !bad && samples[i] !== undefined) out.push(samples[i])
      at = null
      continue
    }
    if (at === null || done) continue
    // the listing's own end, `! OK.` (`<file>:<line>: OK.` under -file-line-error)
    if (/^(?:! |[^\s:]+:\d+: )OK\.$/.test(line)) { done = nodes !== null; if (!done) bad = true; continue }
    if (TEX_ERROR.test(line)) { bad = true; continue }
    if (/^> \\box\d+=/.test(line)) { nodes = []; continue }
    if (nodes === null) continue
    if (/^\\hbox\(/.test(line) && !nodes.length) { nodes.push(line); continue }
    if (NO_INK_NODE.test(line)) { nodes.push(line); continue }
    const rule = RULE_NODE.exec(line)
    if (rule && rule[3] !== '*' && Number(rule[3]) <= 0) { nodes.push(line); continue }
    if (rule && rule[1] !== '*' && rule[2] !== '*' && Number(rule[1]) + Number(rule[2]) <= 0) { nodes.push(line); continue }
    if (line === '') continue
    bad = true
  }
  return out
}

/** a macro's text as the ink section shows it set, at most */
export const INK_TEXT_MAX = 64
/** what a lead's text holds for a glyph of a formula's whose character it does not spell (readInkTexts): one glyph, whatever its
 *  text — U+FFFC, the object replacement character, which no glyph of TeX's text is */
export const INK_ANY = '\uFFFC'
/** a character node as TeX lists it, of a font of LaTeX's (its encoding, the rest of its name): the character as TeX prints it,
 *  and a ligature's characters */
const CHAR_NODE = /^\.+\\([A-Za-z0-9]+)\/\S+ (\S|\^\^[0-9a-f]{2}|\^\^.)(?: \(ligature (\S{2,3})\))?$/
/** the text encodings, whose letters and digits are ASCII's */
const TEXT_ENCODING = new Set(['OT1', 'T1', 'LY1', 'TU'])
/** the punctuation each text encoding sets as ASCII's character and TeX prints as it: every one's, and T1's and TU's more
 *  (OT1 sets ¡ ¿ ” “ ˙ – — at < > " \\ _ { |, and its italic £ at $; LY1 is taken at the first alone). Not `?`: the probe has
 *  no aux, and a macro's \\ref sets "??" there (2610.21098v1's \\figref{…}), never in the paper */
const PUNCT_ALL = '!#%&()*+,-./:;=@[]'
const PUNCT_WIDE = `${PUNCT_ALL}"$<>\\^_{|}~`
/** a node between a macro's characters that sets no ink: glue, a kern, a penalty, a math switch, a box's head */
const TEXT_PASS = /^\.+\\(?:glue|kern|penalty|mathon|mathoff|[hv]box\()/
/**
 * The text each sample sets, from the probe's log (inkSection): each sample whose box TeX listed in full with no error
 * between its rows, of characters with nothing else but nodes that set no ink between them (glue, kerns, penalties, a
 * formula's switches, boxes at any depth), as [source, text], the characters in TeX's order, at most INK_TEXT_MAX:
 * - a letter or a digit of a text font (OT1, T1, LY1, TU: those are ASCII's there), a ligature of them, and the punctuation
 *   the font sets as ASCII's (PUNCT_ALL; T1's and TU's PUNCT_WIDE): \\newcommand\\bert{BERT\\xspace}'s "BERT", a model's name
 *   with a subscript in small capitals "BERTBASE", 2610.21098v1's \\CompletionTokenCap{} = 1{,}024 "1,024", a cell's lead
 *   \\texttt{max\\_tokens} "max_tokens" (T1's underscore; OT1's is a rule: no answer);
 * - in a formula, between its \\mathon and \\mathoff, each character too: a text font's as above, a letter or a digit of math
 *   italic (OML, whose letters are ASCII's) as itself, any other — a symbol, a script's prime, a math comma (OML's, which TeX
 *   prints as `;`) — INK_ANY, one glyph whatever its text: 2610.21176v1's \\dprime{} = $d'$, "d" and INK_ANY.
 * A text that spells no character (a formula's symbols alone, $\\checkmark$) is no answer: nothing of it tells its ink from
 * another's; nor is anything else (a rule, an image, a text font's character of no such kind, a character of no text font
 * outside a formula, an error): what it sets is not known as text. The layout finds such a placeholder, set at a unit's head
 * where no mark goes, by its text (make.mjs besideMarks), and the erasure a cell's (own.mjs, MR 5b), each glyph by leadStep
 */
export function readInkTexts(log, samples) {
  const out = []
  let at = null, text = null, bad = false, done = false, math = 0
  for (const line of (log ?? '').split('\n')) {
    const [r] = /^LAYOUT-PROBE /.test(line) ? readProbe(line) : []
    if (r && r.schema === PROBE_SCHEMA && (r.tag === 'ink-at' || r.tag === 'ink-end') && r.fields.length === 1) {
      const i = Number(r.fields[0])
      if (r.tag === 'ink-at') { at = i; text = null; bad = false; done = false; math = 0; continue }
      if (at === i && done && !bad && text && text.length <= INK_TEXT_MAX && text.replaceAll(INK_ANY, '') !== '' && samples[i] !== undefined) out.push([samples[i], text])
      at = null
      continue
    }
    if (at === null || done) continue
    if (/^(?:! |[^\s:]+:\d+: )OK\.$/.test(line)) { done = text !== null && math === 0; if (!done) bad = true; continue }
    if (TEX_ERROR.test(line)) { bad = true; continue }
    if (/^> \\box\d+=/.test(line)) { text = ''; continue }
    if (text === null) continue
    if (/^\\hbox\(/.test(line) && !text) continue
    if (/^\.+\\mathon(?![A-Za-z])/.test(line)) math++
    else if (/^\.+\\mathoff(?![A-Za-z])/.test(line) && --math < 0) { bad = true; continue }
    const c = CHAR_NODE.exec(line)
    if (c) {
      const [, enc, ch, lig] = c, punct = enc === 'T1' || enc === 'TU' ? PUNCT_WIDE : PUNCT_ALL
      if (TEXT_ENCODING.has(enc) && (lig ? /^[A-Za-z0-9]+$/.test(lig) : /^[A-Za-z0-9]$/.test(ch) || (ch.length === 1 && punct.includes(ch)))) text += lig ?? ch
      else if (math > 0 && !lig && enc === 'OML' && /^[A-Za-z0-9]$/.test(ch)) text += ch
      else if (math > 0) text += INK_ANY
      else bad = true
      continue
    }
    if (TEXT_PASS.test(line) || line === '') continue
    bad = true
  }
  return out
}
/**
 * One glyph of a lead's ink read against its text from the end, nearest the unit's start first (make.mjs besideMarks,
 * own.mjs's cell lead): `want` the text up to `end` (exclusive), `t` the glyph's text, both as the reader normalises them,
 * white space taken out. An INK_ANY is one glyph of any text but none (a blank glyph is no formula's: the lead is not read
 * past it); every other character is spelled by the glyphs' own, a blank glyph passed over between them. Returns the end
 * past the glyph, or -1 where it is not the lead's
 */
export function leadStep(want, end, t) {
  if (end <= 0) return -1
  if (want[end - 1] === INK_ANY) return t ? end - 1 : -1
  if (!t) return end
  const k = end - t.length, part = k >= 0 ? want.slice(k, end) : null
  return part === t && !part.includes(INK_ANY) ? k : -1
}

/** a box's first node that no character before it can kern or join with, and that TeX's hyphenation takes as a word's end as it
 *  takes a mark's whatsit: glue, a kern, a penalty, a whatsit (a colour stack, a write, a special, a literal, a destination, a
 *  saved matrix), a mark. Not a box, a rule or a formula's start: TeX hyphenates no word that one of those follows, and does
 *  hyphenate one a mark's whatsit follows (`characterization\\mbox{$\\star$}` would break as charac-terization) */
const APART_NODE = /^\.\\(?:glue|kern|penalty|pdfcolorstack|write|openout|closeout|special|pdfliteral|pdfdest|pdfsave|pdfrestore|pdfsetmatrix|mark)/
/**
 * The samples whose box TeX began with a node apart from the word before it, from the probe's log (inkSection): each sample whose
 * box TeX listed in full with no error between its rows, its first node one of APART_NODE (`\\,pp`'s kern, a colour's stack).
 * Glued to the letters before it, such a macro is none of their word: no kern or ligature of theirs reaches past that node, and
 * their hyphenation ends at it as at a mark (layoutMarking `apart`). A sample whose box begins with a character, a box, a rule or
 * a formula, or is not listed, is not one
 */
export function readInkApart(log, samples) {
  const out = []
  let at = null, first = null, listed = false, bad = false, done = false
  for (const line of (log ?? '').split('\n')) {
    const [r] = /^LAYOUT-PROBE /.test(line) ? readProbe(line) : []
    if (r && r.schema === PROBE_SCHEMA && (r.tag === 'ink-at' || r.tag === 'ink-end') && r.fields.length === 1) {
      const i = Number(r.fields[0])
      if (r.tag === 'ink-at') { at = i; first = null; listed = false; bad = false; done = false; continue }
      if (at === i && done && !bad && first !== null && APART_NODE.test(first) && samples[i] !== undefined) out.push(samples[i])
      at = null
      continue
    }
    if (at === null || done) continue
    if (/^(?:! |[^\s:]+:\d+: )OK\.$/.test(line)) { done = listed; if (!done) bad = true; continue }
    if (TEX_ERROR.test(line)) { bad = true; continue }
    if (/^> \\box\d+=/.test(line)) { listed = true; continue }
    if (listed && first === null && /^\.(?!\.)/.test(line)) first = line
  }
  return out
}

// ---- babel's names: what each one's own text is, TeX asked
/** each name's macro, by key (file.mjs NAME_KEYS): babel's [captions], which a class defines as well */
export const NAME_MACROS = Object.freeze({ abstract: 'abstractname', ref: 'refname', bib: 'bibname', contents: 'contentsname', listfigure: 'listfigurename', listtable: 'listtablename', appendix: 'appendixname', index: 'indexname', proof: 'proofname', preface: 'prefacename', glossary: 'glossaryname', figure: 'figurename', table: 'tablename' })
/** each name's English value (names.mjs): what a style that writes a name literally writes (literalNames) */
export { NAME_ENGLISH }
/**
 * The name section of the probe (`name`): for each name the wrapper wrapped as the document began (NAMES_TEX keeps the
 * macro as it was, \axt@nmt@<key>), a row `name <key> <0 or 1>`: 1 where its own text, as a \protected@edef expands it,
 * holds a letter \uppercase changes, 0 where it holds none (a class's capitals, or no cased letter). The layout maker
 * takes a name's glyphs set in capitals as a case change only where its own text is not (NAME_FLAG.CAPITALS). Writes
 * nothing, ships out nothing (readNameProbe)
 */
export function nameSection() {
  return NAME_KEYS.map(k => `\\ifcsname axt@nmt@${k}\\endcsname\\begingroup\\protected@edef\\axt@qa{\\csname axt@nmt@${k}\\endcsname}\\uppercase\\expandafter{\\expandafter\\def\\expandafter\\axt@qb\\expandafter{\\axt@qa}}\\ifx\\axt@qa\\axt@qb${probeRow('name', k, 0)}\\else${probeRow('name', k, 1)}\\fi\\endgroup\\fi`).join('')
}
/** each name's answer from the probe's log (nameSection): { key: 1 its own text holds a lowercase letter, 0 not }, the
 *  keys TeX answered for; a row of another schema, shape or key is passed over */
export function readNameProbe(log) {
  const out = {}
  for (const r of readProbe(log)) if (r.schema === PROBE_SCHEMA && r.tag === 'name' && r.fields.length === 2 && NAME_KEYS.includes(r.fields[0]) && /^[01]$/.test(r.fields[1])) out[r.fields[0]] = Number(r.fields[1])
  return out
}

// ---- the paper's interline glue: TeX's \lineskip and \lineskiplimit
/** a TeX dimension as \the writes it (\the\dimexpr of a glue: its natural size), TeX points */
const TEX_PT = /^(-?\d+(?:\.\d+)?)pt$/
/** PDF units (big points) a TeX point */
const BP_PER_PT = 72 / 72.27
/** the most a skip may be, TeX's \maxdimen in big points, which \offinterlineskip sets \lineskiplimit to, as the file
 *  writes it (to a hundredth: 16322.79, over the exact 16322.7895 by the rounding), so that a value read is read back */
const SKIP_MAX = Math.round(16384 * BP_PER_PT * 100) / 100
/**
 * The skip section of the probe (`lineskip`): one row `lineskip <\lineskip> <\lineskiplimit>`, the glue's natural size
 * and the dimension, as \the writes them, at the document's start in its body size, where the paper's own settings stand
 * (LaTeX's 1pt and 0pt where it sets none): what TeX sets two lines apart by where the one's depth and the other's height
 * come nearer than the limit. The layer opens a line by it (layer2.mjs breakLines). (TeX eats the space after \relax:
 * the second field's own \space parts the two.) Writes nothing, ships out nothing (readSkipProbe). One pair a paper: the
 * probe's body follows the paper's preamble and none of its body, so a value the body sets, or a scope sets for its own
 * lines (an environment, a group: cvpr.sty's \lineskip .5em in its title's author block, 1512.03385), is not read, and the
 * layer applies the pair to every unit
 */
export const skipSection = () => probeRow('lineskip', '\\the\\dimexpr\\lineskip\\relax', '\\space\\the\\lineskiplimit')
/** the paper's \lineskip and \lineskiplimit from the probe's log (skipSection), in PDF units: [lineskip, limit], or null
 *  where no row of the schema and shape is there, one is twice, or a value is past TeX's \maxdimen (under 16384pt) */
export function readSkipProbe(log) {
  const rows = readProbe(log).filter(r => r.schema === PROBE_SCHEMA && r.tag === 'lineskip')
  if (rows.length !== 1 || rows[0].fields.length !== 2) return null
  const pt = rows[0].fields.map(f => Number(TEX_PT.exec(f)?.[1] ?? NaN))
  return pt.every(x => Number.isFinite(x) && Math.abs(x) <= 16384) ? pt.map(x => x * BP_PER_PT) : null
}

/** the constructs a style may write a babel name literally in, by the environment or command defined, and the keys of
 *  the names it would be made of */
const LITERAL_IN = Object.freeze({ abstract: ['abstract'], endabstract: ['abstract'], thebibliography: ['ref', 'bib'], tableofcontents: ['contents'], listoffigures: ['listfigure'], listoftables: ['listtable'], theindex: ['index'], proof: ['proof'] })
const CONSTRUCT = Object.keys(LITERAL_IN).join('|')
/** a construct's definition, its head: an environment's (LaTeX's, xparse's), a command's (LaTeX's, xparse's), a \def's */
const DEFINITION = new RegExp(String.raw`\\(?:(?:re)?newenvironment\*?\s*\{(${CONSTRUCT})\}|(?:New|Renew|Declare|Provide)DocumentEnvironment\s*\{(${CONSTRUCT})\}|(?:(?:renew|new|provide)command|DeclareRobustCommand)\*?\s*\{?\s*\\(${CONSTRUCT})(?![A-Za-z@])\s*\}?|(?:New|Renew|Declare|Provide)DocumentCommand\s*\{?\s*\\(${CONSTRUCT})(?![A-Za-z@])\s*\}?|[gex]?def\s*\\(${CONSTRUCT})(?![A-Za-z@]))`, 'g')
/** the commands whose arguments a literal there is no text set on the page in: a label, a reference, a message, a
 *  destination's name, a counter, an environment's name, a test; and \csname to its \endcsname */
const NOT_TEXT = /\\(?:label|ref|pageref|eqref|nameref|autoref|cite[A-Za-z]*|nocite|typeout|message|wlog|write|hypertarget|hyperdef|hyperlink|pdfbookmark|@namedef|@nameuse|@ifundefined|@ifpackageloaded|@ifclassloaded|ifthenelse|setcounter|addtocounter|newcounter|usecounter|refstepcounter|stepcounter|begin|end|(?:Package|Class|Generic)(?:Warning|WarningNoLine|Info|Error))(?![A-Za-z@])|\\csname(?![A-Za-z@])/g
/** past white space and comments from i */
const skipBlank = (t, i) => { for (;;) { while (i < t.length && /\s/.test(t[i])) i++; if (t[i] !== '%') return i; while (i < t.length && t[i] !== '\n') i++ } }
/** the end (one past its closing brace) of the brace group opening at i, escapes and comments skipped; -1 if unclosed */
function groupEnd(t, i) {
  if (t[i] !== '{') return -1
  let d = 0
  for (let j = i; j < t.length; j++) {
    const c = t[j]
    if (c === '\\') { j++; continue }
    if (c === '%') { while (j < t.length && t[j] !== '\n') j++; continue }
    if (c === '{') d++
    else if (c === '}' && --d === 0) return j + 1
  }
  return -1
}
/** past an optional argument's brackets at i (at the brace depth they open), or i itself */
function optionalEnd(t, i) {
  if (t[i] !== '[') return i
  let d = 0
  for (let j = i; j < t.length; j++) {
    const c = t[j]
    if (c === '\\') { j++; continue }
    if (c === '{') d++
    else if (c === '}') d--
    else if (c === ']' && d === 0) return j + 1
  }
  return i
}
/**
 * A babel name a style writes literally, in the definition of the very construct the name's macro would name (nips's
 * abstract environment, `{\large\bf Abstract}`; cvpr's and naacl's \abstract; naacl's thebibliography, `References`):
 * each such literal, where it equals the name's English value (NAME_ENGLISH), wrapped in the name's marks
 * (\axtnma{<key>}…\axtnmb{<key>}), in the definition's bodies — with no \relax before them, as a name's macro has
 * (NAMES_TEX): a literal is the construct's own text, set where it stands, never a name a class expands in an \if —,
 * but in a command's arguments that are no text set on the page (NOT_TEXT). The identity is the definition's, never the page's; what TeX prints is unchanged, so the carry is.
 * Returns the text, the same where it holds none
 */
export function literalNames(text) {
  const edits = []
  for (const m of text.matchAll(DEFINITION)) {
    const name = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5], keys = LITERAL_IN[name]
    // its bodies: an environment's two (xparse's after its argument specification), a command's one (after its
    // optional arguments, or xparse's specification), a \def's one (after its parameter text)
    let i = m.index + m[0].length, bodies = []
    const xparse = /Document(?:Environment|Command)/.test(m[0]), env = m[1] !== undefined || m[2] !== undefined
    if (m[5] !== undefined) {
      // (a parameter text holds no brace: #1, a delimiter)
      for (const end = Math.min(text.length, i + 200); i < end && text[i] !== '{';) i++
    } else {
      i = skipBlank(text, i)
      if (xparse) { const e = groupEnd(text, i); if (e < 0) continue; i = skipBlank(text, e) }
      else for (let n = 0; n < 2; n++) i = skipBlank(text, optionalEnd(text, i))
    }
    for (let n = 0; n < (env ? 2 : 1); n++) {
      i = skipBlank(text, i)
      const e = groupEnd(text, i)
      if (e < 0) break
      bodies.push([i + 1, e - 1])
      i = e
    }
    for (const [a, b] of bodies) {
      const body = text.slice(a, b)
      // the spans of the body no literal is wrapped in
      const off = []
      for (const x of body.matchAll(NOT_TEXT)) {
        let j = x.index + x[0].length
        if (x[0] === '\\csname') { const e = body.indexOf('\\endcsname', j); off.push([x.index, e < 0 ? body.length : e]); continue }
        for (let n = 0; n < 2; n++) {
          j = skipBlank(body, optionalEnd(body, skipBlank(body, j)))
          const e = groupEnd(body, j)
          if (e < 0) break
          off.push([x.index, e])
          j = e
        }
      }
      for (const key of keys) {
        const words = NAME_ENGLISH[key].split(' ').join(String.raw`\s+`)
        for (const l of body.matchAll(new RegExp(String.raw`(?<![\\A-Za-z@])${words}(?![A-Za-z@])`, 'g'))) {
          if (off.some(([s, e]) => l.index >= s && l.index < e)) continue
          edits.push([a + l.index, a + l.index + l[0].length, key])
        }
      }
    }
  }
  if (!edits.length) return text
  edits.sort((x, y) => y[0] - x[0])
  let out = text, last = Infinity
  for (const [s, e, key] of edits) {
    if (e > last) continue
    out = `${out.slice(0, s)}\\axtnma{${key}}${out.slice(s, e)}\\axtnmb{${key}}${out.slice(e)}`
    last = s
  }
  return out
}

// ---- what a paper's symbol sets: LaTeX's own
// LaTeX's text symbols (TEXT_SYMBOLS, each the one character it sets), the one table the layer reads too
// (rules/text-symbols.mjs): the layout draws one the marking cannot mark (glued to the word before it, at a unit's head) as
// text, where arXiv's page shows that character on the unit's line (make.mjs); symbolText, a symbol's text
export { symbolText, TEXT_SYMBOLS } from '../rules/text-symbols.mjs'
/** a line TeX logs for an error: `! …`, or `<file>:<line>: …` under -file-line-error; and a character it set no glyph for in
 *  \\nullfont, which a box is in only where a sample left TeX's state broken past what PROBE_UNWIND closes (a picture's own
 *  \\nullfont, in its box): that box's answer is none, never a box that sets no ink, nor one a mark leaves as it was */
const TEX_ERROR = /^(?:! |[^\s:]+:\d+: |Missing character: There is no .* in font nullfont!$)/
/**
 * What TeX answered, from the probe's log: per sample's command, its code a follower (FOLLOWERS), for layoutMarking's
 * `switches`. A box TeX logged an error in (after its `punct-at` row, before the next row) answers nothing: an error in
 * the box as the paper sets it or with `{}` leaves the follower no answer at all (`x`); in the box with its opening mark,
 * no mark (2); in the box with both marks, no closing mark (1); in a second call's, none between (2); in either box of a 3's
 * pair, no mark (2). A sample with no
 * row (the probe stopped short of it), a row of another schema or another shape is no answer at all. layoutMarking sets
 * no mark where there is no answer. And per look-ahead pair (aheadSamples, by its rows `ahead`), its key (aheadKey) and its
 * one code: an error in the box let go or as the paper sets it no answer (`x`), in the one with the two openings or the one
 * asking what the list ends with 2, in the one with every mark at most 1
 */
export function readMarkProbe(log, samples) {
  const out = {}, errored = new Map(), listed = samples.filter(s => !s.ahead), ahead = samples.filter(s => s.ahead)
  let at = null
  for (const line of (log ?? '').split('\n')) {
    if (TEX_ERROR.test(line)) { if (at) (errored.get(at[0]) ?? errored.set(at[0], new Set()).get(at[0])).add(at[1]); continue }
    const [r] = readProbe(line)
    if (!r || r.schema !== PROBE_SCHEMA) continue
    if (r.tag === 'punct-at' && r.fields.length === 3) { at = [`${r.fields[0]}:${r.fields[1]}`, r.fields[2]]; continue }
    if (r.tag === 'ahead-at' && r.fields.length === 2) { at = [`ahead:${r.fields[0]}`, r.fields[1]]; continue }
    at = null
    if (r.tag === 'ahead' && r.fields.length === 2) {
      const s = ahead[Number(r.fields[0])], code = r.fields[1]
      if (!s || !/^\d+$/.test(r.fields[0]) || !/^[012]$/.test(code)) continue
      const bad = errored.get(`ahead:${r.fields[0]}`)
      out[s.key] = !bad ? code : bad.has('w') || bad.has('a') ? 'x' : bad.has('d') || bad.has('g') ? '2' : code === '2' ? '2' : '1'
      continue
    }
    if (r.tag !== 'punct' || r.fields.length !== 2) continue
    const i = r.fields[0], s = listed[Number(i)], codes = r.fields[1]
    if (!s || !/^[0123]+$/.test(codes) || codes.length !== FOLLOWERS.length) continue
    out[s.command] = [...codes].map((c, j) => {
      const bad = errored.get(`${i}:${j}`)
      if (!bad) return c
      if (bad.has('a') || bad.has('b')) return 'x'
      if (bad.has('d') || bad.has('e') || c === '3') return '2'
      return c === '2' ? '2' : '1'
    }).join('')
  }
  return out
}
/** the commands of the asked classes a paper writes: those an answer is looked for (layoutMarking sets none for one TeX
 *  did not answer) */
export function askedCommands(units) {
  const out = new Set()
  for (const u of units) for (const p of u.pieces) { const cmd = commandOf(p); if (cmd && ASKED.has(classOf(p))) out.add(cmd) }
  return out
}
/** the commands whose marks TeX's answers take off anywhere but between two calls: the paper's own switch, on */
export const switchedOf = switches => Object.keys(switches ?? {}).filter(c => /^\\[A-Za-z@]+$/.test(c) && /[12x]/.test(switches[c].slice(0, FOLLOWERS.length - 1))).sort()

// ---------------------------------------------------------------- the TeX
/**
 * The TeX that goes after MARK_DEF in the marked original. One line, no comment: the paper's lines keep their numbers
 * in the log. Allocates no register and writes to the log one line a unit, its alignment (below), and else nothing: no
 * line of it changes but pdfTeX's warnings of a destination set twice. Each part keeps TeX's lists as the paper's, a
 * destination (a whatsit) beside them:
 * - **The alignment.** For a unit's or a heading's end mark (`<i>e`, `h<i>e`; not a cell's), a message to the log,
 *   `AXT-ALIGN <i> <mode> <lo> <ls> <ro> <rs> <po> <ps>`: the mode TeX is in (p a paragraph, h an \hbox's restricted
 *   horizontal mode, v vertical), and the stretch's order and amount of \leftskip, \rightskip and \parfillskip (readAlign):
 *   the author's own alignment, \centering's both skips infinite and its \parfillskip none. TeX breaks a paragraph's lines
 *   by the skips in force at its \par, not at the mark, so a paragraph's are read once it ends (a one-shot para/after hook
 *   set at the mark): `{\centering text}` and a blank line is set justified, the group closed before the paragraph ended.
 *   The paragraph is the next to end at the mark's group level or below, or one ending deeper inside ordinary groups (a
 *   list's \par, a font's group) whose groups close back to it in vertical mode, each followed by \aftergroup, as the
 *   lines probe's (latex-front.mjs PARA_END_TEX): one ending inside a box, a note or a cell is one inside the unit, and the
 *   hook waits for the next. A paragraph a box's close ends (a \vbox, \vtop, \insert or \vcenter closed in horizontal mode)
 *   TeX ends itself, with no \par where LaTeX sets no \partokencontext (TeX Live 2023's LaTeX: elsarticle's abstract,
 *   `\global\setbox\absbox=\vbox\bgroup … \egroup`), so no para/after hook runs for it: that box is watched where it closes
 *   (\aftergroup in the innermost box group, reached through ordinary groups as the paragraph goes on; none at the bottom
 *   level, where only a \par ends a paragraph), and where it closes before a \par has told the paragraph's skips, the skips
 *   at the mark are written, nothing of the unit being set after it. Each end mark's reading is written once (a serial), so
 *   the hook that runs later at another paragraph's \par writes nothing: it wrote the keywords' \raggedright for
 *   2608.16117v1's abstract. In an \hbox, or after the paragraph ended (v), the skips at the mark. Through \message, hooks
 *   and \aftergroup, which put nothing in any list
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
 *   place (layoutMarking marks only a placeholder at or after it), but a heading's or a babel name's (\axt@hold): a class
 *   that runs its heading or name into the paragraph sets it first, as the paragraph starts (\everypar, para/begin), and a
 *   point set there took the run-in text for the placeholder's (2610.19159's "Task specification." owned by the
 *   $\mathcal{T}$ that opens the paragraph after it: its row covered the heading, and the paragraph's first line began at
 *   the heading's start, so that no shared line was found).
 * - **\axtpmm{name}, before an inline formula** (its source begins $, \( or \ensuremath): \axtpma, but set on the empty
 *   list too. The formula's math-on node follows the mark at once, so the paragraph TeX resumes after a display is no
 *   empty one either way (no line is made), and no \ignorespaces is cut short of a space it would have skipped: the
 *   native case (lab/pdf/spikes/layout-marks-cases.mjs, 'an inline formula first after a display') holds every item in
 *   place. A display after a display keeps \axtpma's rule: it has no point, and stream.mjs gives its group's ink to the
 *   display before it.
 * - **\axtpm{name}, after one; \axthmark{name}, a heading's.** Set in horizontal mode only; \axtpm after the placeholder's
 *   last ink, its trailing glue, penalties and kerns put back after it, and on an empty list nothing: after a display,
 *   where TeX resumes the paragraph, a mark would open a line of its own where the paragraph ends, and TeX's skip of the
 *   space after a display must see past it, which it does, everything that decides so expanding.
 * - **The italic correction.** Where a mark is set against a letter that has one, an empty \vadjust after the mark says
 *   so, and \/ and LaTeX's \@@italiccorr add that letter's correction, measured when the mark was set, where they find
 *   it: TeX adds none after a whatsit, and cite.sty's [super] (\unskip then \/), \textup's left correction (\eqref),
 *   \textit, \textbf and \emph after their group set it on the letter before (0.14 pt after a "g" in cmr10, 1.45 pt after
 *   an italic "f"). The letter is a character, a ligature, or under XeTeX a word of a font of its own, which is a whatsit
 *   (\lastnodetype 9: TeX's \/ adds no correction after any other whatsit, so one there measures nothing). An adjust
 *   node is nothing to TeX's line breaking, hyphenation and pdfTeX's margin kerning, as a whatsit.
 *   Every \axtmark in horizontal mode does the same, a unit's own as a cell's: a unit that ends inside \emph{…} lost the
 *   correction \emph adds after its group, a quarter point on its line, which a centred line shows as half of it moved
 *   (2610.21880's IEEEtran author block, "Senior Member, IEEE").
 * - **The colour, at each colour piece** (\axtcolour{c<i>.<k>}, layoutMarking: right inside a \textcolor's group, right
 *   after a \color switch): a message to the log, `AXT-COLOUR c<i>.<k> <\current@color>`, the fill the driver paints the
 *   run with where TeX is (readColours): every colour the paper's own TeX accepts, defined anywhere (a body's \definecolor,
 *   a group's \colorlet), mixed (blue!60!black) or by a model, exactly as it is set. Through \message, which puts nothing
 *   in any list, gated as the marks are; nothing where no colour package is loaded. It ends in \ignorespaces: \color ends
 *   in one, which the mark, unexpandable, would stop short of the spaces after it (2503.06072's `\textcolor{red}{ \underline`
 *   moved its URL a space right)
 * - **Nothing written.** The three test \protect against \@typeset@protect and gobble their name otherwise, so written
 *   to a file (\protected@write: the aux's labels, the contents lists) or into a mark (running heads) they are gone; in a
 *   PDF string they are gobbled (\pdfstringdefDisableCommands); nameref's titles, which it keeps as strings, have them
 *   taken out first, at gettitlestring and where nameref sanitizes a title whoever set it (titlesec). What does the work
 *   is \protected, so an expansion (an \edef, a case change's) never runs it, and a case change leaves its name as it is
 *   (l3text's \l_text_case_exclude_arg_tl): a heading set in capitals keeps its marks' names.
 * - **The points.** Beside each destination, a point (POINTS_TEX): a rendering intent named after it, `/axt-<name> ri`,
 *   in each engine's literal (pdfTeX's and LuaTeX's `direct`, xdvipdfmx's `pdf:code`), which PDF.js keeps in the operator
 *   list in its place among the glyphs (it drops DP and MP, and splits its text items at a BMC: tokens moved by up to
 *   14 pt) and its text layer passes over. So the content stream gives each piece's own ink between its points
 *   (layout/stream.mjs). And around each column's body (\@cclv in \@makecol, repacked to its own height and depth: a
 *   whatsit adds no height, and one last keeps the box's depth; the opening one with a \penalty10000 after it, for a
 *   whatsit before the body's first glue makes it a place to break, and \vsplit — balance.sty's last page — then takes
 *   an empty column; the closing one after the body's last box, its glue, kerns and penalties taken off and put back
 *   after it, so that no place to break is made or lost, and LaTeX's \@outputbox@removebskip still finds a \vfil
 *   last);
 *   and where a page is shipped with no column's body bracketed since the last (a class whose output routine makes its
 *   columns without \@makecol: revtex4-2's ltxgrid, its \@makecolumn; 24 units of 5 papers of the release-route sweep), around
 *   its text block at LaTeX's \@outputpage, which every LaTeX output routine ships its page by (\@outputbox: the columns with
 *   their footnotes, a vertical box or two columns side by side in a horizontal one, repacked to its own size as the body is),
 *   so that every class's page has its body bracketed; its footnotes are inside that bracket (the debt of #299)
 *   and around each float's finished box (after \@endfloatbox, the box repacked as the body is: a point at the box's
 *   start would give its first paragraph a \parskip), points alone (bs, be, fs, fe and a count kept in a macro): a range
 *   across a page or a column, or one an [h] float is shipped into, is cut to its own.
 *   Every glyph, box and destination where it was (the stream spike of 2026-10-06: pdfLaTeX and XeLaTeX to 1e-12 pt on
 *   seven papers; LuaTeX's PDF writer sets the glyphs after a literal by an absolute matrix, ≤ 0.011 pt off: accepted)
 * What no TeX here can keep: a font kern between a heading's last letter and a full stop its class adds by expansion
 * (acmart's \@addpunct, amsart's and IEEEtran's run-in heads; 0.09 to 1.22 pt on that line, accepted: Task 2), and a
 * punctuation mark a package sets before a citation or a call by looking past it (natmove, cite.sty's super, biblatex's
 * \autocite, fnpct) — where TeX's answer to the mark probe takes the marks off (layoutMarking's `switches`). pdfTeX may
 * draw a virtual font's glyph after a whatsit off where TeX set it; no corpus paper shows it (Task 2's TeX boxes)
 */
/** the points (LAYOUT_TEX's last part): `\\axt@point{name}` in each engine, beside each destination; around each column's
 *  body and each float's box; and inside each pgf picture's own box (a TikZ or pgfplots picture: `zs` after pgf's
 *  \\pgfsys@beginpicture, `ze` before its \\pgfsys@endpicture, so that nothing outside the box moves), the figure's text between
 *  them (layout/figure-text.mjs) */
export const POINTS_TEX = [
  '\\ifdefined\\XeTeXrevision\\def\\axt@point#1{\\special{pdf:code /axt-#1 ri}}\\else\\ifdefined\\pdfextension\\def\\axt@point#1{\\pdfextension literal direct{/axt-#1 ri}}\\else\\ifdefined\\pdfliteral\\def\\axt@point#1{\\ifnum\\pdfoutput>0 \\pdfliteral direct{/axt-#1 ri}\\fi}\\else\\def\\axt@point#1{}\\fi\\fi\\fi',
  '\\let\\axt@destonly\\axt@dest\\def\\axt@dest#1{\\axt@destonly{#1}\\axt@point{#1}}',
  '\\gdef\\axt@bn{0}\\def\\axt@bump{\\xdef\\axt@bn{\\the\\numexpr\\axt@bn+1\\relax}}',
  '\\def\\axt@vtake{\\ifcase\\numexpr\\lastnodetype-10\\relax\\or\\expandafter\\axt@vtg\\or\\expandafter\\axt@vtk\\or\\expandafter\\axt@vtp\\fi}\\def\\axt@vtg{\\edef\\axt@vback{\\vskip\\the\\lastskip\\relax\\axt@vback}\\unskip\\axt@vtake}\\def\\axt@vtk{\\edef\\axt@vback{\\kern\\the\\lastkern\\relax\\axt@vback}\\unkern\\axt@vtake}\\def\\axt@vtp{\\edef\\axt@vback{\\penalty\\the\\lastpenalty\\relax\\axt@vback}\\unpenalty\\axt@vtake}',
  '\\newif\\ifaxt@bodied',
  '\\ifdefined\\AddToHook\\AddToHook{cmd/@makecol/before}{\\ifvoid\\@cclv\\else\\axt@bump\\begingroup\\boxmaxdepth\\dp\\@cclv\\global\\setbox\\@cclv\\vbox to\\ht\\@cclv{\\axt@point{bs\\axt@bn}\\penalty\\@M\\unvbox\\@cclv\\let\\axt@vback\\@empty\\axt@vtake\\axt@point{be\\axt@bn}\\axt@vback}\\endgroup\\global\\axt@bodiedtrue\\fi}\\fi',
  '\\ifdefined\\AddToHook\\AddToHook{cmd/@outputpage/before}{\\ifaxt@bodied\\else\\ifvoid\\@outputbox\\else\\axt@bump\\begingroup\\ifvbox\\@outputbox\\boxmaxdepth\\dp\\@outputbox\\global\\setbox\\@outputbox\\vbox to\\ht\\@outputbox{\\axt@point{bs\\axt@bn}\\penalty\\@M\\unvbox\\@outputbox\\let\\axt@vback\\@empty\\axt@vtake\\axt@point{be\\axt@bn}\\axt@vback}\\else\\global\\setbox\\@outputbox\\hbox to\\wd\\@outputbox{\\axt@point{bs\\axt@bn}\\unhbox\\@outputbox\\axt@point{be\\axt@bn}}\\fi\\endgroup\\fi\\fi\\global\\axt@bodiedfalse}\\fi',
  '\\AtBeginDocument{\\ifdefined\\@endfloatbox\\let\\axt@efb\\@endfloatbox\\def\\@endfloatbox{\\axt@efb\\ifvoid\\@currbox\\else\\axt@bump\\begingroup\\boxmaxdepth\\dp\\@currbox\\global\\setbox\\@currbox\\vbox to\\ht\\@currbox{\\axt@point{fs\\axt@bn}\\unvbox\\@currbox\\axt@point{fe\\axt@bn}}\\endgroup\\fi}\\fi}',
  '\\AtBeginDocument{\\ifdefined\\pgfsys@beginpicture\\let\\axt@pgfbp\\pgfsys@beginpicture\\def\\pgfsys@beginpicture{\\axt@pgfbp\\axt@point{zs}}\\let\\axt@pgfep\\pgfsys@endpicture\\def\\pgfsys@endpicture{\\axt@point{ze}\\axt@pgfep}\\fi}',
  // (each biblatex entry's start, `bi<n>` where \\printbibliography sets it: biblatex's per-entry hook, run after the list's \\item,
  // the entry's paragraph begun there first, so that a numeric style's label, which the \\item sets, stands before the point, a count
  // kept in a macro. The printed bibliography is biber's data and no text of the source: the ledger cuts it one entry a unit by
  // these (layout/ledger.mjs), whose class the references' toggle governs; 2610.35877v1's was orphan text, always translated.
  // And each bibliography's end, `bz<n>` after its last entry n (biblatex's \\blx@endbibliography, before the list's end, where
  // \\endtrivlist's \\unskip and the paragraph's end would take the entry's last glues: taken before the point instead, as many),
  // so that the next bibliography's heading of a title of its own is no entry's)
  '\\ifdefined\\AddToHook\\AddToHook{begindocument/end}{\\ifdefined\\blx@bibitem\\gdef\\axt@bi{0}\\gappto\\blx@hook@bibitem{\\axt@bipt}\\let\\axt@blxeb\\blx@endbibliography\\def\\blx@endbibliography{\\ifhmode\\unskip\\unskip\\axt@point{bz\\axt@bi}\\fi\\axt@blxeb}\\fi}\\fi\\def\\axt@bipt{\\leavevmode\\xdef\\axt@bi{\\the\\numexpr\\axt@bi+1\\relax}\\axt@point{bi\\axt@bi}}',
  // (each paragraph's start, q<n> at LaTeX's para/begin, inside its indentation box: \\IndentBox, not yet put back, wrapped
  // whole with the point before it, of its size; never a node of the paragraph's own, which would make a paragraph whose
  // indent a \\lastbox takes (wrapfig's \\WF@floathand, then \\@@par) or a \\noindent before $$ no longer empty, a line
  // of its own: 2609.26457 p8 on TeX Live 2023, 2026-10-25. A paragraph with no indent (\\noindent, an \\item's, the first
  // after a heading whose class takes it) carries none and reads as the one before; the ledger's blocks, orphan-text.md §4)
  '\\gdef\\axt@pq{0}\\ifdefined\\AddToHook\\ifdefined\\IndentBox\\AddToHook{para/begin}{\\ifvoid\\IndentBox\\else\\xdef\\axt@pq{\\the\\numexpr\\axt@pq+1\\relax}\\global\\setbox\\IndentBox\\hbox{\\axt@point{q\\axt@pq}\\box\\IndentBox}\\fi}\\fi\\fi',
].join('')

/**
 * The names (LAYOUT_TEX's, before its points): \axtnma{<key>} before a babel name's own text and \axtnmb{<key>} after it,
 * each a destination and a point named n<occurrence>.<key>.s and .e, the occurrence a count kept in a macro (no register).
 * - **Where.** In horizontal mode only, never while the gate is off (a contents list, the output routine): the start
 *   where TeX stands, after the glue before it (a whatsit after a glue makes no place to break, and its glyphs follow
 *   it: \centerline's \hss, which taken off and put back would leave the mark at the box's left), the end against the
 *   name's last letter, the glue, penalties and kerns after it taken off and put back (\axt@set, as a placeholder's
 *   closing mark); the end only where its start was set, so that an occurrence is never named by the one before it. A start in vertical mode (a
 *   chapter's title, `\Huge\bfseries #1`, which the name's first letter begins) waits for the paragraph that begins next
 *   (LaTeX's para/begin hook, once), unless the name's end comes first (an empty name). The hook runs before LaTeX puts
 *   the paragraph's indentation box back (ltpara: para/begin, then the indent), so the point lies a \parindent left of
 *   the name's first glyph: the maker's row is the glyphs' between the carried marks, which the indent holds none of.
 *   A figure's or a table's name only outside a float (\@captype undefined): a caption's label is the label path's
 *   (run.mjs labelInTarget); longtable's captions define no \@captype, and the maker leaves out a name leading a caption.
 * - **Written through.** Written to a file or into a mark (\protect not \@typeset@protect) they write themselves, so that
 *   a name copied into the contents or a running head is still a name there (the lists' and the heads' occurrences, a
 *   later step's); a case change leaves their keys (l3text's exclusion list: \MakeUppercase\refname); in a PDF string,
 *   and in nameref's and gettitlestring's titles, they are taken out.
 * - **The wrapper.** At \begin{document}, after every \AtBeginDocument (begindocument/end), and after every language
 *   switch babel makes once it has (its afterextras hook): each name macro the document defines, as a macro of no
 *   parameter, not \protected and not blank (a class may test a name for emptiness: REVTeX's jcp style sets no heading
 *   over an empty \refname, and a wrapped one would make it set an empty heading's room), set to
 *   \relax\axtnma{<key>}<its own text>\axtnmb{<key>}; the macro as it was kept
 *   (\axt@nmt@<key>, the probe's: nameSection) and the macro wrapped (\axt@nmd@<key>), so that one wrapped already is
 *   left as it is. Local, as babel's own captions are. polyglossia's switches are not followed (no paper of the corpus's
 *   five sets names through it). The \relax first: a class that tests a name's first token in an \if expands the name
 *   there (REVTeX's \@if@empty\@svsec, `\if!#1!`, over the section number "Appendix A"), and reads a token that sets
 *   nothing, never the marks' assignments, which ended the test in the middle of their macro: "Incomplete \iffalse", every
 *   revtex4-2 paper with a numbered appendix stopped (2610.21288, 2610.20595); typeset, the \relax does nothing
 */
export const NAMES_TEX = [
  '\\gdef\\axt@nmn{0}\\global\\let\\axt@nmopen\\@empty\\global\\let\\axt@nmwait\\@empty\\newif\\ifaxt@nmon\\newif\\ifaxt@nmgo\\def\\axt@nmfigure{figure}\\def\\axt@nmtable{table}',
  '\\def\\axt@nmok#1{\\axt@nmgotrue\\ifdefined\\@captype\\def\\axt@nmt{#1}\\ifx\\axt@nmt\\axt@nmfigure\\axt@nmgofalse\\fi\\ifx\\axt@nmt\\axt@nmtable\\axt@nmgofalse\\fi\\fi}',
  '\\def\\axt@nmstart#1{\\xdef\\axt@nmn{\\the\\numexpr\\axt@nmn+1\\relax}\\xdef\\axt@nmopen{#1}\\relax\\axt@holdtrue\\axt@put{n\\axt@nmn.#1.s}\\axt@holdfalse}',
  '\\def\\axt@nmlate{\\ifx\\axt@nmwait\\@empty\\else\\ifaxt@off\\else\\ifhmode\\expandafter\\axt@nmstart\\expandafter{\\axt@nmwait}\\fi\\fi\\global\\let\\axt@nmwait\\@empty\\fi}',
  '\\protected\\def\\axt@nma#1{\\ifaxt@off\\else\\axt@nmok{#1}\\ifaxt@nmgo\\ifhmode\\axt@nmstart{#1}\\else\\ifvmode\\ifdefined\\AddToHookNext\\xdef\\axt@nmwait{#1}\\AddToHookNext{para/begin}{\\axt@nmlate}\\fi\\fi\\fi\\fi\\fi}',
  '\\protected\\def\\axt@nmb#1{\\global\\let\\axt@nmwait\\@empty\\ifaxt@off\\else\\ifhmode\\def\\axt@nmt{#1}\\ifx\\axt@nmt\\axt@nmopen\\global\\let\\axt@nmopen\\@empty\\axt@holdtrue\\axt@set{n\\axt@nmn.#1.e}\\axt@holdfalse\\fi\\fi\\fi}',
  '\\def\\axtnma{\\ifx\\protect\\@typeset@protect\\expandafter\\axt@nma\\else\\protect\\axtnma\\fi}',
  '\\def\\axtnmb{\\ifx\\protect\\@typeset@protect\\expandafter\\axt@nmb\\else\\protect\\axtnmb\\fi}',
  '\\ifdefined\\ExplSyntaxOn\\ExplSyntaxOn',
  '\\cs_new_protected:Npn\\axt@nmw#1#2{\\cs_if_eq:NcF#1{axt@nmd@#2}{\\bool_lazy_all:nT{{\\token_if_macro_p:N#1}{!\\token_if_protected_macro_p:N#1}{!\\token_if_protected_long_macro_p:N#1}{\\str_if_eq_p:ee{\\cs_parameter_spec:N#1}{}}{!\\tl_if_blank_p:o{#1}}}{\\cs_set_eq:cN{axt@nmt@#2}#1\\cs_set:Npx#1{\\exp_not:N\\relax\\exp_not:N\\axtnma{#2}\\exp_not:o{#1}\\exp_not:N\\axtnmb{#2}}\\cs_set_eq:cN{axt@nmd@#2}#1}}}',
  '\\cs_new_protected:Npn\\axt@nmwrap#1#2{\\cs_if_exist:cT{#2}{\\exp_args:Nc\\axt@nmw{#2}{#1}}}',
  '\\ExplSyntaxOff',
  `\\def\\axt@nmall{\\ifaxt@nmon${NAME_KEYS.map(k => `\\axt@nmwrap{${k}}{${NAME_MACROS[k]}}`).join('')}\\fi}`,
  '\\AddToHook{begindocument/end}{\\global\\axt@nmontrue\\axt@nmall}\\AddToHook{package/babel/after}{\\AddBabelHook{axtnames}{afterextras}{\\axt@nmall}}',
  '\\AddToHook{package/gettitlestring/after}{\\ifdefined\\GetTitleStringDisableCommands\\GetTitleStringDisableCommands{\\let\\axtnma\\@gobble\\let\\axtnmb\\@gobble}\\fi}',
  '\\fi',
].join('')

/** the control sequences \axt@unmark takes out of a title's copy, each with its argument: the marks a heading or a caption
 *  can carry (\axtpma, \axtpmm, \axtpm, \axthmark) and a babel name's (\axtnma, \axtnmb). One list: UNMARK_TEX builds the regex's
 *  alternation and the prefilter from it, so the two cannot drift */
export const UNMARK_CS = ['axtpma', 'axtpmm', 'axtpm', 'axthmark', 'axtnma', 'axtnmb']

/** a babel name's marks as a pass writes them into the aux and the lists \@starttoc reads (NAMES_TEX: `\protect \axtnma {<key>}`
 *  and `\axtnmb`), inert where they are read (\@starttoc's \axt@off, pdfstringdef, the nameref names' unmark). Only these:
 *  a mark in text the paper writes itself and reads back (an .xmpdata that pdfx reads, a .tex it \input s) has an effect in
 *  the next pass, so a pass that differs there is not at latexmk's fixed point */
const NAME_MARKS = /(?:\\protect\s*)?\\axtnm[ab]\s*\{[^{}]*\}/g
/** the files a babel name's marks are written to: the aux and the lists (.toc .lof .lot and the common .loa .lol .lop) */
export const NAME_MARK_FILE = /\.(?:aux|toc|lof|lot|loa|lol|lop)$/
/** a file's text with its babel name marks, each with its own argument, taken out */
export const withoutNameMarks = text => text.replace(NAME_MARKS, '')

/** \axt@unmark<tl>: the regex that takes a mark and its argument out of a token list, behind a memory and a prefilter.
 *  The regex costs ~4 ms a run over a list that holds a mark (~50 µs a token) and ~3 ms over one that holds none, and the
 *  nameref and gettitlestring hooks call it ~450 times a pass on the thesis (M1: 4.36 s of its layout compile).
 *  - The prefilter looks for each name in the list as text: a control sequence prints as `\name` and a space (the escape
 *    character set to `\` for it, so that a paper's own change of \escapechar hides nothing), a delimited match in
 *    microseconds; the regex runs only on a hit. A miss holds none of UNMARK_CS, which the regex's `\c{...}` alternation
 *    could not have matched, so the result is the regex's.
 *  - The memory holds the last list the regex ran on and what it made of it, and a list the same macro (\tl_if_eq:NN, its
 *    \ifx) is set to that result. The regex is a function of the token list alone, so the result's tokens are the regex's.
 *    Its type is not: \regex_replace_all ends in \tl_set_eq, so the macro it leaves is plain, while a prefilter miss leaves
 *    a \long or \protected one as it was, and a memory hit sets the macro to the plain result. Neither caller can tell:
 *    \axt@title is always a \def, and \@currentlabelname goes straight into \@onelevel@sanitize.
 *    The hooks meet one list again and again where nameref's title is set past gettitlestring (titlesec, memoir: the
 *    thesis): the label hook cleans the heading's title on every label under it (the assignment is local to the label's
 *    group), and a caption's title goes through the title hook twice in a row. On the standard path (nameref ->
 *    GetTitleString) the title is clean already and the prefilter skips it. The thesis: 276 runs a pass on 61 distinct
 *    lists, 21,669 tokens read for 7,936 distinct.
 *  The regex stays as it was: `\c[^BE].*` is any run of tokens but a brace, so a match ends at its own argument's close
 *  and never reaches across a group (unmark-finding); every mark name is brace-free (MARK_NAME) */
const UNMARK_TEX = [
  '\\ifdefined\\ExplSyntaxOn\\ExplSyntaxOn',
  `\\regex_const:Nn\\c__axt_marks_regex{\\c{${UNMARK_CS.join('|')}}\\cB.\\c[^BE].*\\cE.}`,
  '\\bool_new:N\\g__axt_unmark_bool\\tl_new:N\\g__axt_unmark_in_tl\\tl_new:N\\g__axt_unmark_out_tl',
  `\\cs_new_protected:Npn\\axt@unmark#1{\\tl_if_eq:NNTF#1\\g__axt_unmark_in_tl{\\tl_set_eq:NN#1\\g__axt_unmark_out_tl}{\\group_begin:\\int_set:Nn\\tex_escapechar:D{92}\\bool_gset_false:N\\g__axt_unmark_bool${UNMARK_CS.map(n => `\\str_if_in:NnT#1{\\${n}}{\\bool_gset_true:N\\g__axt_unmark_bool}`).join('')}\\group_end:\\bool_if:NT\\g__axt_unmark_bool{\\tl_gset_eq:NN\\g__axt_unmark_in_tl#1\\regex_replace_all:NnN\\c__axt_marks_regex{}#1\\tl_gset_eq:NN\\g__axt_unmark_out_tl#1}}}`,
  '\\ExplSyntaxOff\\fi',
].join('')

/**
 * backref's lists marked (LAYOUT_TEX's part): an entry's text names its list's piece (`\axtbrname{p<i>.<k>}`, layoutMarking, after
 * the entry's end mark: an assignment, no node), and the list backref sets after the entry (\BR@backref, through \backrefalt or
 * \backref, whichever it calls) has that piece's opening mark before it and its closing mark after it, then the name is let go,
 * so that a list no entry named is marked by nobody's. Both printers are wrapped where the document begins, after every
 * package's and the class's own definitions (begindocument/end: myarxiv.cls redefines \backrefalt after hyperref loads backref),
 * each reading what it read (\backrefalt four arguments, \backref the list's macro after it) and handing it on as it was: the
 * list is set as before, the marks no node of its but the two whatsits each mark is. \backrefalt only where a package or the
 * paper defined one: backref tells which printer it calls by \backrefalt's being its own unused one (\BR@starttoc, at
 * \thebibliography), and wrapped, that one would be taken for the paper's and called, which sets nothing. Nothing where
 * backref is not loaded
 */
const BACKREF_TEX = [
  '\\gdef\\axt@brname{}\\protected\\def\\axtbrname#1{\\gdef\\axt@brname{#1}}',
  '\\def\\axt@bra{\\ifx\\axt@brname\\@empty\\else\\expandafter\\axt@brgo\\fi}\\def\\axt@brgo{\\expandafter\\axtpma\\expandafter{\\axt@brname a}}',
  '\\def\\axt@brb{\\ifx\\axt@brname\\@empty\\else\\expandafter\\axt@brend\\fi}\\def\\axt@brend{\\expandafter\\axtpm\\expandafter{\\axt@brname b}\\global\\let\\axt@brname\\@empty}',
  '\\long\\def\\axt@brAltW#1#2#3#4{\\axt@bra\\axt@brAlt{#1}{#2}{#3}{#4}\\axt@brb}\\long\\def\\axt@brOneW#1{\\axt@bra\\axt@brOne#1\\axt@brb}',
  '\\ifdefined\\AddToHook\\AddToHook{begindocument/end}{\\ifdefined\\BR@backref\\ifdefined\\backrefalt\\ifx\\backrefalt\\BR@BackrefAltUnused\\else\\let\\axt@brAlt\\backrefalt\\let\\backrefalt\\axt@brAltW\\fi\\fi\\ifdefined\\backref\\let\\axt@brOne\\backref\\let\\backref\\axt@brOneW\\fi\\fi}\\fi',
].join('')

export const LAYOUT_TEX = [
  '\\makeatletter\\newif\\ifaxt@off\\newif\\ifaxt@hold\\global\\let\\axt@pend\\@empty\\let\\axt@icr\\/\\def\\axt@icv{0pt}\\newif\\ifaxt@sig',
  '\\ifdefined\\XeTeXrevision\\else\\ifdefined\\pdfextension\\def\\axt@dest#1{\\pdfextension dest name{axt-#1} fitr width 0pt height 0pt depth 0pt\\relax}\\else\\ifdefined\\pdfdest\\def\\axt@dest#1{\\ifnum\\pdfoutput>0 \\pdfdest name{axt-#1} fitr width 0pt height 0pt depth 0pt\\relax\\fi}\\fi\\fi\\fi',
  '\\def\\axt@mark#1{\\axt@colseen\\ifaxt@off\\else\\axt@dest{#1}\\ifaxt@hold\\else\\ifx\\axt@pend\\@empty\\else\\axt@dest{\\axt@pend}\\global\\let\\axt@pend\\@empty\\fi\\fi\\fi}',
  '\\def\\axt@icm{\\axt@icr\\ifnum\\lastnodetype=12 \\xdef\\axt@icv{\\the\\lastkern}\\unkern\\ifdim\\axt@icv=\\z@\\else\\global\\axt@sigtrue\\fi\\fi}',
  '\\def\\axt@ic{\\global\\axt@sigfalse\\ifcase\\lastnodetype\\axt@icm\\or\\or\\or\\or\\or\\or\\global\\axt@sigtrue\\or\\axt@icm\\or\\or\\axt@icm\\fi}',
  '\\def\\axt@put#1{\\axt@ic\\axt@mark{#1}\\ifaxt@sig\\vadjust{}\\fi}',
  '\\def\\axt@ift#1#2\\relax{\\if t#1\\expandafter\\@firstoftwo\\else\\expandafter\\@secondoftwo\\fi}',
  '\\def\\axt@ags{\\the\\gluestretchorder\\leftskip\\space\\the\\gluestretch\\leftskip\\space\\the\\gluestretchorder\\rightskip\\space\\the\\gluestretch\\rightskip\\space\\the\\gluestretchorder\\parfillskip\\space\\the\\gluestretch\\parfillskip}',
  '\\def\\axt@agnow#1#2{\\message{^^JAXT-ALIGN #1 #2\\space\\axt@ags^^J}}\\def\\axt@agcap#1{\\expandafter\\xdef\\csname axt@ag@#1\\endcsname{\\axt@ags}}\\def\\axt@agmsg#1#2{\\ifcsname axt@agd@#2\\endcsname\\else\\expandafter\\gdef\\csname axt@agd@#2\\endcsname{}\\message{^^JAXT-ALIGN #1 p \\csname axt@ag@#2\\endcsname^^J}\\fi}',
  '\\def\\axt@agopen#1{\\ifcsname axt@agd@#1\\endcsname\\expandafter\\@gobble\\else\\expandafter\\@firstofone\\fi}\\gdef\\axt@agn{0}',
  '\\def\\axt@agplain{\\ifnum\\ifnum\\currentgrouptype=1 1\\else\\ifnum\\currentgrouptype=14 1\\else0\\fi\\fi=1 \\expandafter\\@firstoftwo\\else\\expandafter\\@secondoftwo\\fi}',
  '\\def\\axt@agbox{\\ifnum\\ifcase\\currentgrouptype 0\\or0\\or0\\or0\\or1\\or1\\or0\\or0\\or0\\or0\\or0\\or1\\or1\\else0\\fi=1 \\expandafter\\@firstoftwo\\else\\expandafter\\@secondoftwo\\fi}',
  '\\def\\axt@agover#1#2#3{\\axt@agopen{#3}{\\ifnum\\currentgrouplevel>#2 \\axt@agplain{\\axt@agcap{#3}\\axt@agafter{#1}{#2}{#3}}{\\AddToHookNext{para/after}{\\axt@agover{#1}{#2}{#3}}}\\else\\axt@agcap{#3}\\axt@agmsg{#1}{#3}\\fi}}',
  '\\def\\axt@agafter#1#2#3{\\expandafter\\gdef\\csname axt@agb@#3\\endcsname{\\axt@agback{#1}{#2}{#3}}\\expandafter\\aftergroup\\csname axt@agb@#3\\endcsname}',
  '\\def\\axt@agback#1#2#3{\\axt@agopen{#3}{\\ifnum\\currentgrouplevel>#2 \\axt@agplain{\\axt@agafter{#1}{#2}{#3}}{\\AddToHookNext{para/after}{\\axt@agover{#1}{#2}{#3}}}\\else\\ifhmode\\AddToHookNext{para/after}{\\axt@agover{#1}{#2}{#3}}\\else\\axt@agmsg{#1}{#3}\\fi\\fi}}',
  '\\def\\axt@agw#1#2{\\ifnum\\currentgrouplevel>\\z@\\axt@agbox{\\axt@agz{#1}{#2}\\axt@agmsg}{\\axt@agplain{\\axt@agz{#1}{#2}\\axt@agup}{}}\\fi}\\def\\axt@agz#1#2#3{\\expandafter\\gdef\\csname axt@agw@#2\\endcsname{#3{#1}{#2}}\\expandafter\\aftergroup\\csname axt@agw@#2\\endcsname}\\def\\axt@agup#1#2{\\axt@agopen{#2}{\\ifhmode\\axt@agw{#1}{#2}\\fi}}',
  '\\def\\axt@agpar#1{\\xdef\\axt@agn{\\the\\numexpr\\axt@agn+1}\\axt@agcap{\\axt@agn}\\edef\\axt@agt{\\noexpand\\AddToHookNext{para/after}{\\noexpand\\axt@agover{#1}{\\the\\currentgrouplevel}{\\axt@agn}}\\noexpand\\axt@agw{#1}{\\axt@agn}}\\axt@agt}',
  '\\def\\axt@alg#1e#2\\@nil{\\ifx\\relax#2\\relax\\else\\ifhmode\\ifinner\\axt@agnow{#1}h\\else\\ifdefined\\AddToHookNext\\axt@agpar{#1}\\fi\\fi\\else\\axt@agnow{#1}v\\fi\\fi}',
  '\\def\\axt@align#1{\\axt@ift#1\\relax{}{\\axt@alg#1e\\@nil}}',
  '\\protected\\def\\axtmark#1{\\ifaxt@off\\axt@colseen\\else\\axt@align{#1}\\ifhmode\\axt@put{#1}\\else\\axt@mark{#1}\\fi\\fi}',
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
  '\\def\\axt@pmn{\\ifhmode\\expandafter\\axt@pmd\\else\\expandafter\\axt@pmv\\fi}',
  '\\protected\\def\\axt@pmm{\\ifaxt@off\\expandafter\\@gobble\\else\\expandafter\\axt@pmn\\fi}',
  '\\protected\\def\\axt@pm#1{\\ifaxt@off\\else\\ifhmode\\ifnum\\lastnodetype=-1 \\else\\axt@set{#1}\\fi\\fi\\fi}',
  '\\protected\\def\\axt@hm#1{\\ifaxt@off\\else\\axt@align{#1}\\ifhmode\\relax\\axt@holdtrue\\axt@put{#1}\\axt@holdfalse\\fi\\fi}',
  '\\protected\\def\\axt@colour#1{\\ifaxt@off\\else\\ifdefined\\current@color\\message{^^JAXT-COLOUR #1 \\current@color^^J}\\fi\\fi\\ignorespaces}',
  '\\def\\axtpma{\\ifx\\protect\\@typeset@protect\\expandafter\\axt@pma\\else\\expandafter\\@gobble\\fi}',
  '\\def\\axtpmm{\\ifx\\protect\\@typeset@protect\\expandafter\\axt@pmm\\else\\expandafter\\@gobble\\fi}',
  '\\def\\axtpm{\\ifx\\protect\\@typeset@protect\\expandafter\\axt@pm\\else\\expandafter\\@gobble\\fi}',
  '\\def\\axthmark{\\ifx\\protect\\@typeset@protect\\expandafter\\axt@hm\\else\\expandafter\\@gobble\\fi}',
  '\\def\\axtcolour{\\ifx\\protect\\@typeset@protect\\expandafter\\axt@colour\\else\\expandafter\\@gobble\\fi}',
  '\\ifdefined\\AddToHook\\AddToHook{cmd/@starttoc/before}{\\global\\axt@offtrue}\\AddToHook{cmd/@starttoc/after}{\\global\\axt@offfalse}\\AddToHook{cmd/@outputpage/before}{\\axt@offtrue}',
  '\\AddToHook{package/gettitlestring/after}{\\let\\axt@title@of\\GetTitleString\\long\\def\\GetTitleString#1{\\def\\axt@title{#1}\\axt@unmark\\axt@title\\expandafter\\axt@title@of\\expandafter{\\axt@title}}}',
  '\\AddToHook{package/nameref/after}{\\ifdefined\\NR@sanitize@labelname\\let\\axt@NRsanitize\\NR@sanitize@labelname\\def\\NR@sanitize@labelname{\\axt@unmark\\@currentlabelname\\axt@NRsanitize}\\fi}\\fi',
  '\\AtBeginDocument{\\ifdefined\\pdfstringdefDisableCommands\\pdfstringdefDisableCommands{\\let\\axtmark\\@gobble\\let\\axtend\\@gobble\\let\\axtpma\\@gobble\\let\\axtpmm\\@gobble\\let\\axtpm\\@gobble\\let\\axthmark\\@gobble\\let\\axtcolour\\@gobble\\let\\axtnma\\@gobble\\let\\axtnmb\\@gobble\\let\\axt@nma\\@gobble\\let\\axt@nmb\\@gobble}\\fi}',
  '\\ifcsname l_text_case_exclude_arg_tl\\endcsname\\expandafter\\g@addto@macro\\csname l_text_case_exclude_arg_tl\\endcsname{\\axtmark\\axtend\\axt@pma\\axt@pmm\\axt@pm\\axt@hm\\axtcolour\\axt@colour\\axtnma\\axtnmb\\axt@nma\\axt@nmb}\\fi',
  BACKREF_TEX,
  UNMARK_TEX,
  NAMES_TEX,
  POINTS_TEX,
  '\\makeatother',
].join('')

/** POINTS_TEX's point under `latex` (latex-front.mjs dviEngine), where pdfTeX writes no PDF itself and its \\pdfliteral sets
 *  nothing: xdvipdfmx's, as POINTS_TEX sets it under XeTeX, a `pdf:code` special, the same rendering intent in the content
 *  stream; pdfTeX's where it writes the PDF. DVI_LAYOUT_TEX's last part */
export const DVI_POINTS_TEX = '\\let\\axt@pdfpoint\\axt@point\\def\\axt@point#1{\\ifnum\\pdfoutput>0 \\axt@pdfpoint{#1}\\else\\special{pdf:code /axt-#1 ri}\\fi}'
/**
 * LAYOUT_TEX under `latex` (latex-front.mjs dviEngine: arXiv's DVI compiler, the DVI made a PDF by dvipdfmx): where pdfTeX
 * writes no PDF itself, its destination and its points are xdvipdfmx's, as LAYOUT_TEX sets them under XeTeX — MARK_DEF's
 * XYZ `pdf:dest` (DVI_MARK_DEF's \\axt@dvidest, which goes before LAYOUT_TEX) and a `pdf:code` point (DVI_POINTS_TEX) —, and
 * where it does, LAYOUT_TEX's own (its FitR). Each kind of node TeX sets is the one it sets under XeTeX, a whatsit, so the
 * marks set nothing else (the native cases, lab/pdf/spikes/layout-marks-cases.mjs ONLY=dvi, hold every text item in place).
 * After LAYOUT_TEX, for such a paper alone (live.mjs originalFiles, probeFiles): every other engine's files are byte for byte
 * as before. One line, no comment
 */
export const DVI_LAYOUT_TEX = `\\makeatletter\\let\\axt@pdfdo\\axt@destonly\\def\\axt@destonly#1{\\ifnum\\pdfoutput>0 \\axt@pdfdo{#1}\\else\\axt@dvidest{#1}\\fi}${DVI_POINTS_TEX}\\makeatother`

/** a unit's alignment as the marks file holds it (readAlign): centred, flush left, flush right, justified */
export const ALIGN_CODES = Object.freeze(['c', 'l', 'r', 'j'])
/** the code of a paragraph's skips: both sides stretch and \parfillskip none past them, centred (\centering, a center
 *  environment, a class's centred heading); \rightskip alone, flush left (\raggedright, ragged2e's \RaggedRight); \leftskip
 *  alone, flush right; neither, justified (both sides with a \parfillskip as infinite as theirs: its last line not centred) */
const alignCode = (lo, ls, ro, rs, po, ps) => {
  const L = lo > 0 || ls > 0, R = ro > 0 || rs > 0, F = po > 0 || ps > 0
  if (L && R) return !F || po < Math.min(lo, ro) ? 'c' : 'j'
  return L ? 'r' : R ? 'l' : 'j'
}
/**
 * Each unit's alignment as TeX set its paragraph, from the marked original's log (LAYOUT_TEX's AXT-ALIGN at its end mark, the
 * last pass's: lastTexLog): [[unit, code]], ids rising, the code ALIGN_CODES'. A unit's last line counts (a caption measured
 * in a box and then set as a paragraph: the paragraph's). One TeX set in an \hbox (mode h: a caption \@makecaption centres
 * on one line, \centerline, a table's cell) tells nothing of its alignment, and has no entry; nor has one with no line. A
 * unit whose paragraphs TeX set in two alignments has none: its text set again elsewhere, from a file TeX wrote (an author's
 * name in an e-mail footnote, layout/guard.mjs copiesOutOfPlace), and the log does not say which paragraph is the unit's own,
 * as readColours takes a piece set in two colours. A line not of the form is passed over: a log cut short or a template that
 * redefines what the marks sit in gives fewer entries, never a refusal
 */
export function readAlign(log) {
  const last = new Map(), told = new Map()
  // (a line TeX wrapped at its 79 characters, max_print_line, joined back: the message starts a line of its own)
  const text = lastTexLog(typeof log === 'string' ? log : '').replace(/^(AXT-ALIGN .{69})\n/gm, '$1')
  // (an order 0 to 3 in pdfTeX and XeTeX, normal to filll; 0 to 4 in LuaTeX, whose fi is 1 and fil 2)
  for (const m of text.matchAll(/^AXT-ALIGN h?(\d{1,9}) ([phv]) ([0-4]) (-?[\d.]+)pt ([0-4]) (-?[\d.]+)pt ([0-4]) (-?[\d.]+)pt$/gm)) {
    const v = [m[3], m[4], m[5], m[6], m[7], m[8]].map(Number)
    if (!v.every(Number.isFinite)) continue
    const id = Number(m[1]), code = m[2] === 'h' ? null : alignCode(...v)
    last.set(id, code)
    if (code !== null) told.set(id, told.has(id) && told.get(id) !== code ? false : code)
  }
  return [...last].filter(([id, c]) => c !== null && told.get(id) !== false).sort((a, b) => a[0] - b[0])
}

/** a colour piece's name in the log, `c<unit>.<k>` */
const COLOUR_LINE = /^AXT-COLOUR c(\d{1,9})\.(\d{1,9}) (.*)$/
/** a log line TeX wraps at (max_print_line) */
const PRINT_LINE = 79
/**
 * Each colour piece's fill as TeX set its run, from the marked original's log (LAYOUT_TEX's AXT-COLOUR at the piece, the
 * last pass's: lastTexLog): [[unit, k, 0xRRGGBB]], rising by unit and k, the driver's colour string read by colour.mjs
 * fillOfColour. A piece TeX set twice in two colours (a moving argument typeset in two places) has no entry, nor has one
 * whose string is of no form known (a dvips named colour): its colour is not known. A line TeX wrapped at its 79 characters is
 * joined back
 */
export function readColours(log) {
  const lines = lastTexLog(typeof log === 'string' ? log : '').split('\n'), seen = new Map(), twice = new Set()
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    if (!line.startsWith('AXT-COLOUR ')) continue
    while (line.length % PRINT_LINE === 0 && i + 1 < lines.length && lines[i + 1] !== '') line += lines[++i]
    const m = COLOUR_LINE.exec(line)
    if (!m) continue
    const key = `${m[1]}.${m[2]}`, rgb = fillOfColour(m[3].trim())
    // (a piece set in two colours, or once in a form not known, has none, whatever comes after)
    if (seen.has(key) && seen.get(key) !== rgb) twice.add(key)
    seen.set(key, rgb)
  }
  const out = []
  for (const [key, rgb] of seen) if (rgb !== null && !twice.has(key)) { const [i, k] = key.split('.').map(Number); out.push([i, k, rgb]) }
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1])
}

/** every destination name the marked original may hold (without its 'axt-'): a unit's start or end (MARK_DEF), a page's
 *  columns, a cell's (t) or a heading's (h) start or end, a placeholder's (p) or a footnote call's (n) opening or closing
 *  mark by its unit and source piece index, a draft image frame's corner (g), a babel name's start or end by its
 *  occurrence and key (n<occurrence>.<key>.s, NAMES_TEX) */
export const MARK_NAME = /^(?:\d+[se]|c[12]-\d+|[th]\d+[se]|[pn]\d+\.\d+[ab]|g\d+[abt]|n\d+\.[a-z]{1,16}\.[se])$/

// ---------------------------------------------------------------- the marking
/** a colour piece: a \textcolor's open (`\textcolor{blue!60!black}{`, `\textcolor[rgb]{0,0,1}{`) or a \color switch
 *  (`\color{red}`, `\color[HTML]{245B60}`): its run's text is set in the colour, which the marked original writes at it
 *  (LAYOUT_TEX's AXT-COLOUR, readColours) */
const COLOUR_OPEN = /^\\textcolor\s*(?:\[[^\]]*\]\s*)?\{[^{}]*\}\s*\{$/, COLOUR_SWITCH = /^\\color\s*(?:\[[^\]]*\]\s*)?\{[^{}]*\}$/
export const colourPieceOf = p => (p?.t === 'open' && COLOUR_OPEN.test(p.src ?? '')) || (p?.t === 'ph' && COLOUR_SWITCH.test(p.src ?? ''))

/** patch's own test of the pieces that are always set on the line, where a unit's start mark goes before one that opens
 *  the unit (latex-front.mjs INLINE: kept equal, which layout-marks.test.ts holds against patch itself) */
const INLINE = /^(?:\$|\\\(|\\ensuremath|\\(?:cite[a-z]*|ref|eqref|autoref|[cC]ref)(?![A-Za-z]))/
const WORD_END = /[\p{L}\p{N}]$/u
/**
 * Whether a placeholder is a call of one of the paper's macros that reads nothing past its own arguments (`complete`, name →
 * arity: latex-front.mjs completeMacros, from the macro's definition) with those arguments all in it: the command, then as
 * many arguments as it takes, each a brace group or one token (TeX skips the spaces before each), and nothing after them
 * but white space, or an empty group for a macro of none (`\method{}`, as the front end keeps it)
 */
export function completeCall(p, complete) {
  if (!complete?.size || p?.t !== 'ph' || typeof p.src !== 'string') return false
  const m = /^\\([A-Za-z@]+)/.exec(p.src)
  const arity = m && complete.get(m[1])
  if (arity === undefined || arity === null) return false
  const s = p.src
  let k = m[0].length
  const spaces = () => { while (k < s.length && /\s/.test(s[k])) k++ }
  for (let n = 0; n < arity; n++) {
    spaces()
    if (k >= s.length || s[k] === '}') return false
    if (s[k] === '{') {
      let depth = 0, j = k
      for (; j < s.length; j++) { if (s[j] === '\\') { j++; continue } if (s[j] === '{') depth++; else if (s[j] === '}' && --depth === 0) break }
      if (j >= s.length) return false
      k = j + 1
    } else if (s[k] === '\\') { const c = /^\\(?:[A-Za-z@]+|.)/s.exec(s.slice(k)); k += c ? c[0].length : 1 } else k++
  }
  spaces()
  if (arity === 0 && s.startsWith('{}', k)) { k += 2; spaces() }
  return k === s.length
}
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
/** a placeholder that reads nothing after it, whatever else it is: a LaTeX text symbol (text-symbols.mjs: `\S`, `\%`, `\_`, each
 *  one character by the kernel's own definition, no argument and no look ahead), where LOOKS_AHEAD's class of a macro
 *  takes it for a paper's macro. The piece right after it keeps its marks ("\S\ref{sec:a}"); its ink is read as any macro's
 *  is, by the probe and its own rows. The ink-free ones (rules/tex-kernel.mjs) never come here: INVISIBLE has no class for them */
const READS_NOTHING = p => p?.t === 'ph' && symbolText(p.src) !== null

/** a group's opening by a command that reads that argument verbatim, as characters, whatever definition the front end
 *  read for it: url.sty's \url and \path, hyperref's \url and \nolinkurl, breakurl's \burl, hyperref's \href's first
 *  argument (its options before it; its second, the link's text, is text). A mark inside is printed as its own name:
 *  2610.19860's llncs.cls falls back to \def\url#1{#1} where \url is undefined, the front end read that as \url's
 *  definition and its argument as a group, and hyperref's \url, in force, set \axtpma{p176.4a} on page 16 */
const VERBATIM_ARG = /\\(?:url|nolinkurl|path|burl|href\s*(?:\[[^\]]*\])?)\s*\{$/
/**
 * Where a unit's start mark goes, as patch places it: the first piece at or after it, from `from`. The commands at the
 * unit's head that patch passes over — \noindent, a run-in heading's macro, a table row's \cline or \multicolumn — get
 * no mark: in vertical mode the opening mark would wait for the start mark set after them, at another place; at a table
 * row's start it would begin the cell before \cline's \noalign or \multicolumn's \omit, which TeX refuses. A unit that
 * opens with a footnote's call gets no start mark (patch); its pieces after the call are in the paragraph the call began
 */
export function headEnd(pieces, from = 0) {
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
 * (\axtpmm for an inline formula, set on the empty list after a display too) and \axtpm{p<i>.<k>b} after it (`n` for a
 * footnote's call), but where a mark would change what TeX does:
 * - none at a unit's head before its start mark, nor so after a forced break or an alignment's tab (passedOver);
 * - none right after a piece that may look ahead (LOOKS_AHEAD), unless it reads nothing after it (READS_NOTHING: a text
 *   symbol) or TeX answered that a mark there changes nothing (`switches`: a footnote's call's `word`, or its `call` before
 *   another call), and none for a paper's macro glued to
 *   the letters before it, which may be letters of the same word;
 * - as TeX answered for the piece's command and what follows it (`switches`, the paper's own switch: readMarkProbe):
 *   none (a package sets the full stop before a citation against the word before it, where an opening mark would part
 *   them and lose their kern, and looks for it where the closing mark would stand: 2608.23865, up to 0.85 pt), or the
 *   opening mark alone (REVTeX's superscripts take the token after a citation in a \csname), or both;
 * - the opening mark only for a piece that may look ahead (but a footnote's call TeX answered for), and where the
 *   closing one would follow a control sequence (TeX skips the spaces after a control word), white space (a mark there
 *   would stand on the next line, a blank one no paragraph's end any more: 2608.08350's `.\` before one) or an
 *   environment's \end
 * - none inside a group whose opening command reads that argument verbatim, as characters (VERBATIM_ARG), at any depth:
 *   a mark there would be printed as its own name
 */
export function layoutMarking(units, classes, { lines = false, switches = null, inkless = null, complete = null, apart = null } = {}) {
  const on = new Set(classes)
  /** a paper's macro TeX said sets no ink (readInkProbe): no mark, as an invisible placeholder has none */
  const none = new Set(inkless ?? [])
  /** the paper's macros that read nothing past their arguments (completeMacros): a call of one with all of them, which TeX
   *  answered for (the mark probe asks about them: probeSamples), looks at nothing after it as far as its own reading goes;
   *  what its body sets may (a citation, a footnote, a kern after its last letter), so its closing mark is TeX's answer, and the
   *  piece after it keeps its marks only past white space where TeX answered that a mark there moves nothing. A call TeX did
   *  not answer for looks ahead as any macro does */
  const closed = completeMap(complete)
  /** the call the probe asked about for each complete macro (probeSamples, over the same units): a call of it with other
   *  arguments may end in another glyph, which TeX kerns otherwise with what follows (`\\fmt{x}{V}.` under mathptmx, the
   *  probe's `\\fmt{x}{x}.`), so its answer is that call's, and a call of no arguments's at all */
  const asked = switches && closed.size ? probeSamples(units, closed).filter(s => s.own) : []
  const probed = new Map(asked.map(s => [s.command, s.src]))
  /** the placeholder each complete macro's probed call is glued to (probeSamples' `glued`), TeX's answer for it the `call`
   *  follower's: a call glued to a placeholder of that source has its closing mark where TeX answered that a mark between the
   *  two moves nothing (2610.21098's `\\HarnessLimitShare{}\\%`: a kern between the number's last digit and the next
   *  glyph, which a mark would take, is the font's to say) */
  const glued = new Map(asked.filter(s => s.glued).map(s => [s.command, s.glued]))
  const answered = p => completeCall(p, closed) && !!switches?.[commandOf(p)] && (closed.get(commandOf(p).slice(1)) === 0 || probed.get(commandOf(p)) === p.src)
  const looks = p => LOOKS_AHEAD(p) && !answered(p)
  const gluedTo = (p, next) => next?.t === 'ph' && answered(p) && glued.get(commandOf(p)) === next.src
  // (white space after a call that ends in a control word is none: TeX skips it, and the next piece stands against the call's
  // last letter, where its mark's whatsit would let TeX hyphenate the word a citation's box keeps whole: `\\tf \\cite{a}`)
  const opensAfter = (after, spaced) => spaced && !ENDS_IN_CS.test(after.src ?? '') && answered(after) && switches[commandOf(after)][6] === '0'
  /** the paper's macros whose box TeX began with a node apart from a word (readInkApart): glued to one, none of its letters */
  const parted = new Set(apart ?? [])
  /** what TeX answered for a piece's command before what follows it: a code of readMarkProbe's ('x' no answer: no mark
   *  as '2'); with `switches` and no answer for an asked class's command, '2' too — no mark where TeX did not say one
   *  is safe (the re-review's m4); with no `switches` at all (the probe not run), undefined: the marks as before */
  const answer = (p, next) => {
    if (!switches) return undefined
    const codes = switches[commandOf(p)]
    if (!codes) return ASKED.has(classOf(p)) ? '2' : undefined
    const code = classOf(next) === 'footnote' && classOf(p) === 'footnote' ? (codes[7] === '0' ? codes[6] : codes[7] === 'x' ? 'x' : '1') : gluedTo(p, next) ? codes[7] : codes[next?.t === 'text' && next.s[0] && PUNCT.includes(next.s[0]) ? PUNCT.indexOf(next.s[0]) : 6]
    return code === 'x' ? '2' : code
  }
  /** whether a piece after one that may look ahead may have its marks: TeX answered so for a footnote's call */
  const free = (after, p) => classOf(after) === 'footnote' && !!switches?.[commandOf(after)] && (classOf(p) === 'footnote' ? switches[commandOf(after)][7] === '0' : switches[commandOf(after)][6] === '0')
  /** TeX's answer for the placeholder at `q` of a unit's pieces and the paper's macro right before it, past white space alone
   *  or none (pairOf, aheadSamples; readMarkProbe: `0` every mark moves nothing, `1` the macro's opening mark alone and the
   *  placeholder's, `2` or `x` none on the placeholder), with that macro's piece; null where the pair was not asked about */
  const aheadSaid = (pieces, q) => {
    const pair = switches ? pairOf(pieces, q) : null, code = pair ? switches[aheadKey(pair[0].src, pair[1], pieces[q].src)] : undefined
    return code === undefined ? null : { m: pair[0], at: pair[2], code }
  }
  /** the paper's macros that got their opening mark, by piece: a placeholder after one is marked only so, as TeX was asked */
  const opened = new Set()
  const base = markUnits(units), front = frontMarks(units)
  const index = new Map(units.map((u, i) => [u, i]))
  const own = u => {
    const i = index.get(u)
    if (u.kind === 'cell') return { start: `\\leavevmode\\axtmark{t${i}s}`, end: `\\axtend{t${i}e}` }
    // (a front heading too, a class's command whose text it hands elsewhere as well — ICML's \\icmltitle, set in a box the class
    // measures and never ships, in its running head and in the PDF's title —: a heading's marks set nothing in the output
    // routine's heads, are gobbled in a PDF string and written to no file (the gate, LAYOUT_TEX), set no destination in a box
    // never shipped, and a title's end mark alone is set where TeX sets the title, its first occurrence the unit's where the
    // class sets it again (own.mjs MR 3). Left with no mark, the title's ink had no group: 2610.22195v1 p1u0 stayed English)
    if (u.kind === 'heading') return { start: `\\axthmark{h${i}s}`, end: `\\axthmark{h${i}e}` }
    // (the front matter's units: their unit marks, no line probe, which would act on the class's own paragraph)
    const f = front(u)
    if (f) return f
    const m = base(u)
    return m && lines ? { ...m, before: `\\axtlines{${i}}` } : m
  }
  const copies = units.map(u => ({ ...u }))
  const copyOf = new Map(units.map((u, i) => [u, copies[i]]))
  units.forEach((u, i) => {
    const passed = own(u) ? passedOver(u.pieces) : null
    // (a front matter unit's marks robust: a class may store its text with \protected@xdef before it sets it — \thanks, whose
    // note the title sets —, where \axtpma, which a moving argument's copy must not carry, takes its argument off; with
    // \protect before it, it is stored as it is and set where the note is: 2610.20484's \texttt and 2610.11256's \href in a
    // \thanks were LOST, their marks gone)
    const lead = front(u) ? '\\protect' : ''
    let last = null, gap = false, beforePrefix = null, gapBefore = false
    /** the pieces whose closing mark goes after the punctuation mark their command moves (TeX's 3), by index: that mark */
    const movedAt = new Map()
    /** the groups open at a piece, innermost last: whether each is, or is inside, an argument read verbatim */
    const verbatim = []
    const out = u.pieces.map((p, k) => {
      const piece = p.t === 'nested' ? { ...p, unit: copyOf.get(p.unit) ?? p.unit } : p
      // (backref's list after an entry, no byte of the source: the name of its marks, which LAYOUT_TEX's hook sets around the list
      // where TeX sets it, after the entry's end mark; none in a unit of no mark, nor with the paper's macros unmarked)
      if (backrefPiece(p)) return own(u) && on.has('macro') ? [{ t: 'ph', src: `\\axtbrname{p${i}.${k}}` }] : []
      // (`spaced`: white space alone between the piece before and this one; after a prefix (PREFIX_WORDS: \protect), the piece
      // before the prefix's, the pair one command whose marks stand before the prefix)
      const prefixed = k > 0 && prefixWord(u.pieces[k - 1].t === 'ph' ? u.pieces[k - 1].src : null)
      const after = prefixed ? beforePrefix : last, spaced = prefixed ? gapBefore : gap
      if (p.t !== 'text' || /[^ \t\r\n]/.test(p.s)) {
        if (p.t === 'ph' && prefixWord(p.src)) { beforePrefix = last; gapBefore = gap }
        last = p; gap = false
      } else gap = true
      if (p.t === 'open') verbatim.push(verbatim.at(-1) === true || VERBATIM_ARG.test(p.src ?? ''))
      else if (p.t === 'close') verbatim.pop()
      if (verbatim.at(-1) === true) return [piece]
      // (a colour piece: its colour written to the log right after it, inside its group, where its run is set: no node)
      if (colourPieceOf(p)) return [piece, { t: 'ph', src: `\\axtcolour{c${i}.${k}}` }]
      // (a placeholder right after a paper's macro that got its opening mark, past white space alone or none, has its marks where
      // TeX answered that its opening mark there moves nothing, the word before it hyphenated as before: aheadSamples. A complete
      // call's too, which its own answer leaves none there; its closing mark is its own answer's. Not in a front unit, whose marks
      // are robust and the probe's box sets none so)
      const pairSaid = lead ? null : aheadSaid(u.pieces, k)
      const ahead = !!pairSaid && pairSaid.m === after && opened.has(after) && (pairSaid.code === '0' || pairSaid.code === '1')
      const cls = passed && !passed.has(k) && !(LOOKS_AHEAD(after) && !READS_NOTHING(after) && !free(after, p) && !opensAfter(after, spaced) && !ahead) ? classOf(p) : null
      if (!cls || !on.has(cls) || (cls === 'macro' && none.has(p.src))) return [piece]
      // a paper's macro may set letters: glued to the word before, it is part of it (an accent, \\ss), and a mark would
      // part the word's hyphenation and kerns — but not one whose box TeX began with a node apart from it (`apart`: a kern, glue,
      // a colour), which no kern or ligature of the letters before it reaches and their hyphenation ends at (`0.58\\pp`, \\pp
      // `\\,pp`)
      // (the piece before a prefix's, past it: the pair is one command, glued to the word before it as the command alone would be)
      const before = u.pieces[prefixed ? k - 2 : k - 1], next = u.pieces[k + 1]
      if (cls === 'macro' && before?.t === 'text' && WORD_END.test(before.s) && !parted.has(p.src)) return [piece]
      // (a complete call keeps its opening mark whatever TeX answered for what follows, as any macro of the paper's has it: the
      // answer is the closing mark's and the next piece's alone. A call that ends in a control word is answered '2' before a word,
      // TeX's tokenizer skipping the space after it where `{}` keeps it, which says nothing of a mark before the call)
      // (TeX's answer for a paper's macro is its probed call's: a call of it the probe did not ask about, one short of its
      // arguments or with others, has its opening mark as any macro of the paper's, whatever was answered)
      // (3, before a punctuation mark the command moves in front of its own ink — cite.sty's superscripts, natmove, fnpct —, where
      // TeX answered that its opening mark and a closing one after that mark move nothing: both so, the closing one inside the text
      // after it, past its first character (`movedAt`); a paper's macro keeps its opening mark alone, as for 2; a text piece whose
      // source is not its text there (an accent's letter joined to it), none)
      const raw = cls === 'macro' && !answered(p) ? undefined : answer(p, next)
      const said = (raw === '2' || raw === '3') && cls === 'macro' ? '1' : raw === '3' && !(next?.t === 'text' && PUNCT.includes(next.s[0]) && (next.src === undefined || next.src[0] === next.s[0])) ? '2' : raw
      if (said === '2') return [piece]
      const name = `${cls === 'footnote' ? 'n' : 'p'}${i}.${k}`
      // (an inline formula's opening mark is set on the empty list too: \axtpmm, LAYOUT_TEX)
      const open = { t: 'ph', src: `${lead}\\${cls === 'math' ? 'axtpmm' : 'axtpma'}{${name}a}` }
      if (said === '3') { movedAt.set(k, { t: 'ph', src: `${lead}\\axtpm{${name}b}` }); return [open, piece] }
      if (cls === 'macro') opened.add(p)
      // a complete call's closing mark, where TeX answered for what follows (`said`), only before white space or punctuation, or at
      // the unit's end: before a letter or a digit it would stand inside a word (`\\tf{}s`: TeX would break Transform-ers no
      // more), before another piece against that piece's first character
      const closes = !answered(p) || next === undefined || (next.t === 'text' && /^[ \t\r\n.,;:!?]/.test(next.s)) || gluedTo(p, next)
      if (said === '1' || !closes || (looks(p) && !(cls === 'footnote' && said === '0')) || ENDS_IN_CS.test(p.src) || /\s$/.test(p.src) || ENDS_ENV.test(p.src)) return [open, piece]
      return [open, piece, { t: 'ph', src: `${lead}\\axtpm{${name}b}` }]
    })
    // (a closing mark after the punctuation mark its piece's command moves: the text after the piece cut after that mark)
    for (const [k, close] of movedAt) {
      const t = u.pieces[k + 1], cut = (a, b) => ({ ...t, s: t.s.slice(a, b), ...(t.src !== undefined ? { src: t.src.slice(a, b) } : {}) })
      out[k + 1] = [cut(0, 1), close, ...(t.s.length > 1 ? [cut(1)] : [])]
    }
    // (a paper's macro that looks ahead, with its opening mark alone, whose next piece past white space alone or none got its
    // opening mark where TeX answered 0 for the pair: its closing mark too, as TeX set it in the probe's box. Not where it ends in
    // white space, which may be a line's end before a blank one, or in an environment's \end, whose skip of the spaces after it
    // the probe's box cannot show)
    for (let q = 1; q < out.length && !lead; q++) {
      const said = aheadSaid(u.pieces, q), k = said?.at ?? -1, m = said?.m
      if (said?.code !== '0' || out[q].length < 2 || out[q][1] !== u.pieces[q] || out[k].length !== 2 || out[k][1] !== m || !opened.has(m) || !looks(m) || /\s$/.test(m.src) || ENDS_ENV.test(m.src)) continue
      out[k] = [...out[k], { t: 'ph', src: `\\axtpm{p${i}.${k}b}` }]
    }
    // (a prefixed piece's opening mark before its prefix)
    for (let k = 1; k < out.length; k++) {
      if (!prefixWord(u.pieces[k - 1].t === 'ph' ? u.pieces[k - 1].src : null) || out[k - 1].length !== 1 || out[k].length < 2 || out[k][0] === u.pieces[k]) continue
      out[k - 1] = [out[k][0], ...out[k - 1]]
      out[k] = out[k].slice(1)
    }
    copies[i].pieces = out.flat()
  })
  const at = new Map([...index, ...copies.map((c, i) => [c, i])])
  return { units: copies, mark: u => (at.has(u) ? own(units[at.get(u)]) : null) }
}

// ---------------------------------------------------------------- the marks file
export const MARKS_CAP = 8 * 2 ** 20
export const MARKS_VALUES = 2_000_000
/** the deepest a marks file nests: its object, then marks, lines or owned (or the marking's switch), then each entry,
 *  [name, page, x, y], [id, count] or a piece's own ink */
export const MARKS_DEPTH = 3
/** the marks file's schema: 2 holds each piece's own ink (`chars`, `owned`) and the switch TeX answered; 3 the switch
 *  null where no probe ran, the macros TeX said set no ink (`marking.inkless`) and the texts it showed they set
 *  (`marking.texts`), and the rest of a word given in parts (a token of word -1); 4 the babel names' marks (MARK_NAME's
 *  n<occurrence>.<key>) and whether each name's own text holds a lowercase letter (`marking.names`); 5 the paper's
 *  \lineskip and \lineskiplimit (`marking.lineskip`, PDF units, readSkipProbe: one pair, at the body's start); 6 an inline
 *  formula's opening mark set on the empty list after a display (\axtpmm), and `owned` by stream.mjs's OWNED_HOW of a
 *  piece past its column's end and of a display group (a later display of one 'in the display before it'); 7 the marked compile's Link annotations that name a destination (`links`:
 *  rectangle, the glyphs under it, their text), which a reference the matcher misses is placed by; 8 each unit's alignment as
 *  TeX set its paragraph (`align`: LAYOUT_TEX's AXT-ALIGN at its end mark, readAlign), which the maker's centred flag is,
 *  and each colour piece's fill as TeX set its run (`colours`: AXT-COLOUR at the piece, readColours); 9 the paper's macros
 *  that read nothing past their arguments (`marking.complete`, completeCalled: a call of one gets its closing mark, and the
 *  piece after it its marks) and those whose box TeX began with no character (`marking.apart`, readInkApart: glued to a
 *  word, marked all the same); 10 the texts as TeX sets them (`marking.texts`, readInkTexts): ASCII's punctuation a text font
 *  sets, a formula's glyphs it does not spell as INK_ANY, and the leads' (leadSamples: inline code at a unit's head, a macro
 *  past INK_MAX) past the macros', so that "1,024", "max_tokens" and $d'$ find their ink: a reader of 9 would refuse
 *  them as no letters and digits; 11 the class `number` (a bibliography entry's number, both its marks), which a reader of
 *  10 refuses as no class of MARK_CLASSES; 12 TeX's answers for the look-ahead pairs in the switch (`marking.switches`, keyed
 *  by aheadKey, one code each: a paper's macro and the placeholder right after it, which is marked where TeX said a mark
 *  there moves nothing), which a reader of 11 refuses as no control word; and in `owned` the ink of a placeholder no mark
 *  could stand before, parted from the macro before it by that macro's text (followsOf `split`), by the opening mark's name
 *  it would have had, which a maker of 11 would not read; 13 the entries' own share of samples past the body's (ENTRY_INK_MAX), so
 *  that `marking.inkless`, `marking.apart` and `marking.texts` name up to INK_ANSWERS_MAX sources (and LEAD_MAX more texts),
 *  which a reader of 12 refuses past INK_MAX; 14 a switch's code 3 before a punctuation mark (punctuationSection: the command
 *  sets that mark before its own ink, and its marks around the pair move nothing; layoutMarking sets its closing mark after the
 *  mark), which a reader of 13 refuses */
export const MARKS_SCHEMA = 14
const ENGINES = ['pdflatex', 'latex', 'xelatex', 'lualatex']
const KEYS = ['schema', 'engine', 'marking', 'pages', 'views', 'columns', 'marks', 'dropped', 'lines', 'align', 'words', 'tokens', 'chars', 'owned', 'links']
/** the keys a marks file holds: KEYS, and `colours` where a colour piece has a fill (a file of before, or of a paper with
 *  none, is the bytes it was) */
const keysOf = m => (isObject(m) && Object.hasOwn(m, 'colours') ? [...KEYS, 'colours'] : KEYS)
/** the marked compile's links (`links`, the link-anchor locator's: make.mjs phOf) at most: a paper's, past which it has none;
 *  a destination's name's code units; a link's text's, past which it is kept with no glyph (n 0: counted for the order, never
 *  an anchor) */
export const LINKS_MAX = 20_000
const DEST_MAX = 128, LINK_TEXT_MAX = 64
/** a link entry: [dest, page, x0, y0, x1, y1, a, b, n, text] */
const LINK_ROW = 10
const MARKING_KEYS = ['classes', 'switches', 'inkless', 'texts', 'names', 'lineskip', 'complete', 'apart']
/** a piece's own ink at most: its glyphs, its rules; and a paper's in all (each 5 values) */
export const GLYPHS_PIECE = 20_000, RULES_PIECE = 2_000, OWNED_ALL = 250_000
/** the distinct characters of the owned glyphs at most, and the code units of one */
const CHARS_MAX = 65_536, CHAR_MAX = 32
/** a glyph's size within (0, SIZE_MAX] */
const SIZE_MAX = 200
/** a piece's opening mark: the name its own ink is kept under */
const OPENING = /^[pn]\d+\.\d+a$/
/** a look-ahead pair's key as the marks file holds it (aheadKey): a paper's macro (a control sequence first), the white space
 *  after it (one space or none) and the placeholder it precedes, each source at most COMPLETE_SRC_MAX code units, neither
 *  holding `#` */
const AHEAD_KEY = new RegExp(`^\\\\[^#]{1,${COMPLETE_SRC_MAX - 1}}# ?#[^#]{1,${COMPLETE_SRC_MAX}}$`, 's')
/** the paper's own switch as the marking takes it (readMarkProbe): null where the probe was not run (every mark as
 *  LAYOUT_TEX sets it), else at most PROBE_MAX commands of the asked classes and COMPLETE_PROBE_MAX complete macros, each a
 *  control word, its answer a code 0, 1, 2 or x (no answer) a follower (or 3 before a punctuation mark), and at most
 *  AHEAD_PROBE_MAX look-ahead pairs, each by
 *  its key (AHEAD_KEY), its answer one such code; else a refusal at `path` */
function checkSwitches(v, path) {
  if (v === null) return null
  if (!isObject(v)) throw new LayoutRefusal(path, 'not null or an object')
  const keys = Object.keys(v), pairs = keys.filter(k => !/^\\[A-Za-z@]+$/.test(k)).length
  if (keys.length - pairs > PROBE_MAX + COMPLETE_PROBE_MAX) throw new LayoutRefusal(path, `more than ${PROBE_MAX + COMPLETE_PROBE_MAX} commands`)
  if (pairs > AHEAD_PROBE_MAX) throw new LayoutRefusal(path, `more than ${AHEAD_PROBE_MAX} look-ahead pairs`)
  for (const k of keys) {
    if (/^\\[A-Za-z@]+$/.test(k)) {
      if (k.length > 64) throw new LayoutRefusal(`${path}.${told(k)}`, 'not a control word')
      if (typeof v[k] !== 'string' || v[k].length !== FOLLOWERS.length || !/^[012x]+$/.test(v[k].slice(PUNCT.length)) || !/^[0123x]+$/.test(v[k].slice(0, PUNCT.length))) throw new LayoutRefusal(`${path}.${told(k)}`, `not ${FOLLOWERS.length} codes of 0, 1, 2 or x, or 3 before a punctuation mark`)
    } else {
      if (!AHEAD_KEY.test(k)) throw new LayoutRefusal(`${path}.${told(k)}`, 'not a control word or a look-ahead pair')
      if (typeof v[k] !== 'string' || !/^[012x]$/.test(v[k])) throw new LayoutRefusal(`${path}.${told(k)}`, 'not a code of 0, 1, 2 or x')
    }
  }
  return v
}
/** the macros TeX said set no ink (readInkProbe), as the marking takes them: null where no probe ran, else at most
 *  INK_MAX sources of 1 to INK_SRC_MAX code units, none twice; else a refusal at `path` */
/** the sources the ink section's answers name, at most: its samples', the body's and the entries' */
export const INK_ANSWERS_MAX = INK_MAX + ENTRY_INK_MAX
function checkInkless(v, path) {
  if (v === null) return null
  if (!Array.isArray(v) || v.length > INK_ANSWERS_MAX) throw new LayoutRefusal(path, `not null or an array of at most ${INK_ANSWERS_MAX} sources`)
  const seen = new Set()
  v.forEach((src, i) => {
    if (typeof src !== 'string' || src.length < 1 || src.length > INK_SRC_MAX || seen.has(src)) throw new LayoutRefusal(`${path}[${i}]`, `not a source of 1 to ${INK_SRC_MAX} code units, once`)
    seen.add(src)
  })
  return v
}
/** a text readInkTexts gives: letters, digits, the punctuation a text font sets as ASCII's and INK_ANY, one character spelled at
 *  least */
const INK_TEXT = new RegExp(`^(?=.*[^${INK_ANY}])[A-Za-z0-9${PUNCT_WIDE.replace(/[\\\]^-]/g, '\\$&')}${INK_ANY}]+$`, 'u')
/** the placeholders' texts the probe showed (readInkTexts), as the maker takes them: null where no probe ran, else a flat
 *  list of at most INK_MAX + LEAD_MAX pairs (the file nests no deeper: MARKS_DEPTH), each a source of 1 to INK_SRC_MAX code
 *  units, none twice, then its text of 1 to INK_TEXT_MAX code units (INK_TEXT); else a refusal at `path` */
function checkTexts(v, path) {
  if (v === null) return null
  if (!Array.isArray(v) || v.length % 2 !== 0 || v.length > 2 * (INK_ANSWERS_MAX + LEAD_MAX)) throw new LayoutRefusal(path, `not null or a list of at most ${INK_ANSWERS_MAX + LEAD_MAX} pairs`)
  const seen = new Set()
  for (let i = 0; i < v.length; i += 2) {
    const src = v[i], text = v[i + 1]
    if (typeof src !== 'string' || src.length < 1 || src.length > INK_SRC_MAX || seen.has(src)) throw new LayoutRefusal(`${path}[${i}]`, `not a source of 1 to ${INK_SRC_MAX} code units, once`)
    if (typeof text !== 'string' || !INK_TEXT.test(text) || text.length > INK_TEXT_MAX) throw new LayoutRefusal(`${path}[${i + 1}]`, `not 1 to ${INK_TEXT_MAX} letters, digits, ASCII's punctuation or a formula's glyphs, one spelled`)
    seen.add(src)
  }
  return v
}
/** the paper's macros a marking takes for reading nothing past their arguments, at most */
export const COMPLETE_MAX = 4096
/** the paper's macros that read nothing past their arguments (completeMacros, those its units call: completeCalled), as the
 *  marking takes them: null where the front end gave none, else an object of at most COMPLETE_MAX names (a control word's,
 *  without its backslash), each its arity 0 to 9; else a refusal at `path` */
function checkComplete(v, path) {
  if (v === null) return null
  if (!isObject(v)) throw new LayoutRefusal(path, 'not null or an object')
  const keys = Object.keys(v)
  if (keys.length > COMPLETE_MAX) throw new LayoutRefusal(path, `more than ${COMPLETE_MAX} macros`)
  for (const k of keys) {
    if (!/^[A-Za-z@]{1,63}$/.test(k)) throw new LayoutRefusal(`${path}.${told(k)}`, 'not a control word\'s name')
    if (!Number.isInteger(v[k]) || v[k] < 0 || v[k] > 9) throw new LayoutRefusal(`${path}.${k}`, 'not an arity of 0 to 9')
  }
  return v
}
/** of the paper's complete macros (latex-front.mjs completeMacros, [name, arity]), those its units call as placeholders,
 *  as the marking records them: an object by name, at most COMPLETE_MAX, the first by name; null for none given */
export function completeCalled(units, complete) {
  if (!Array.isArray(complete)) return null
  const called = new Set()
  for (const u of units) for (const p of u.pieces) { const c = p.t === 'ph' && /^\\([A-Za-z@]+)/.exec(p.src ?? ''); if (c) called.add(c[1]) }
  const out = {}
  let n = 0
  // (a name the file's check takes: a control word's of at most 63 letters, an arity of one digit)
  for (const [name, arity] of complete) if (called.has(name) && n < COMPLETE_MAX && /^[A-Za-z@]{1,63}$/.test(name) && Number.isInteger(arity) && arity >= 0 && arity <= 9) { out[name] = arity; n++ }
  return out
}
/** the names' answers the probe gave (readNameProbe), as the maker takes them: null where no probe ran, else an object
 *  of keys of NAME_KEYS, each 0 or 1; else a refusal at `path` */
function checkNames(v, path) {
  if (v === null) return null
  if (!isObject(v)) throw new LayoutRefusal(path, 'not null or an object')
  for (const k of Object.keys(v)) {
    if (!NAME_KEYS.includes(k)) throw new LayoutRefusal(`${path}.${told(k)}`, 'not a key of NAME_KEYS')
    if (v[k] !== 0 && v[k] !== 1) throw new LayoutRefusal(`${path}.${k}`, 'not 0 or 1')
  }
  return v
}
/** the paper's \lineskip and \lineskiplimit as the marking takes them (readSkipProbe): null where the probe gave none, else
 *  two finite numbers of PDF units, each within TeX's \maxdimen; else a refusal at `path` */
export function checkLineskip(v, path) {
  if (v === null) return null
  if (!Array.isArray(v) || v.length !== 2) throw new LayoutRefusal(path, 'not null or two numbers')
  for (let i = 0; i < 2; i++) if (typeof v[i] !== 'number' || !Number.isFinite(v[i]) || Math.abs(v[i]) > SKIP_MAX) throw new LayoutRefusal(`${path}[${i}]`, `not a number within ${Math.round(SKIP_MAX)}`)
  return v
}
/** a list of classes as the marking takes it: each one of MARK_CLASSES, none twice; else a refusal at `path` */
function checkClasses(v, path) {
  if (!Array.isArray(v) || v.length > MARK_CLASSES.length) throw new LayoutRefusal(path, `not an array of at most ${MARK_CLASSES.length} classes`)
  const seen = new Set()
  for (let i = 0; i < v.length; i++) {
    if (!MARK_CLASSES.includes(v[i])) throw new LayoutRefusal(`${path}[${i}]`, 'not a class of MARK_CLASSES')
    if (seen.has(v[i])) throw new LayoutRefusal(`${path}[${i}]`, 'a class twice')
    seen.add(v[i])
  }
  return v
}
const WORDS_MAX = 300_000, WORD_MAX = 200, LINES_MAX = 2000, BOX_MAX = 2000
const r2 = v => Math.round(v * 100) / 100

/** the names a log reports set twice: pdfTeX's and LuaTeX's warnings, dvipdfmx's, in every pass a log holds (a line TeX
 *  cut at 79 characters joined to the next) */
const duplicatesIn = log => {
  const text = (log ?? '').replace(/^(.{79})\n/gm, '$1'), out = new Set()
  for (const m of text.matchAll(/destination with the same identifier \(name\{axt-([^}\s]+)\}\)|duplicate destination with the name 'axt-([^'\s]+)'|Object @axt-(\S+?) already defined/g)) out.add(m[1] ?? m[2] ?? m[3])
  return [...out].filter(n => MARK_NAME.test(n))
}

/** the source pieces of a unit that TeX ligatures and LaTeX's quotes set as other characters, as the glyphs have them */
export const asSet = s => s.replace(/---/g, '\u2014').replace(/--/g, '\u2013').replace(/``/g, '\u201c').replace(/''/g, '\u201d').replace(/`/g, '\u2018').replace(/'/g, '\u2019').replace(/[~\s]/g, '')
/** a unit's end marks, any of which may be the next mark after its last piece */
const endsOf = i => [`${i}e`, `t${i}e`, `h${i}e`]
/**
 * What the marking says of each piece with an opening mark, for its own ink (layout/stream.mjs Follow): by its opening
 * mark's name, whether it has a closing mark (`names`: the destinations set and those dropped), the first WANT
 * characters of the text after it in its unit up to the next visible piece (and, `rest`, the whole of it as the spell check
 * reads one: stream.mjs spellOf), its unit's next marks, and whether a visible
 * piece with no mark follows it with no text between. A display's group (`group`): the displays right after it, with
 * nothing visible between, that have no opening mark (TeX sets none on the empty list it resumes the paragraph with
 * after a display: LAYOUT_TEX's \axt@pmc), by their opening marks' names; the text after it and its next piece are then
 * the group's last one's. With `texts` (the probe's: readInkTexts' pairs, flat, or a Map), a paper's macro whose next piece has
 * no mark of its own and is the only visible one before its unit's next marked piece, white space alone between
 * (`through`), or followed by text up to a piece of its unit's ends, is `split`: that piece's opening mark's name, which no point
 * sets, the text TeX sets for the macro (a letter or a digit in it), by which the maker's reading parts the two's ink,
 * character for character, and the text after that piece as an opening's (`want`, `rest`, `ends`), where its ink ends
 * (stream.mjs ownedOf): 2609.20976's `\lgnrm \footnote{…}`, before which \xspace sets no space and would before a mark
 * (aheadSamples' answer 2), and an elsarticle .bbl's `\DOIprefix\doi{…}.` at an entry's end
 */
export function followsOf(units, names, texts = null) {
  const shown = texts instanceof Map ? texts : Array.isArray(texts) ? new Map(Array.from({ length: Math.floor(texts.length / 2) }, (_, j) => [texts[2 * j], texts[2 * j + 1]])) : null
  const nameOf = (i, k) => { const c = classOf(units[i]?.pieces[k]); return c ? `${c === 'footnote' ? 'n' : 'p'}${i}.${k}` : null }
  return name => {
    const m = /^([pn])(\d+)\.(\d+)a$/.exec(name)
    const i = m ? Number(m[2]) : -1, k = m ? Number(m[3]) : -1, u = units[i]
    if (!u || nameOf(i, k) !== name.slice(0, -1)) return null
    const display = classOf(u.pieces[k]) === 'display', group = []
    let after = '', q = k + 1
    for (;;) {
      for (; q < u.pieces.length && !classOf(u.pieces[q]); q++) if (u.pieces[q].t === 'text') after += plainTranslated([u.pieces[q]])
      if (!display || q >= u.pieces.length || classOf(u.pieces[q]) !== 'display' || /\S/.test(after) || names.has(`${nameOf(i, q)}a`)) break
      group.push(`${nameOf(i, q)}a`)
      q++
    }
    const want = asSet(after).normalize('NFKC').toLowerCase().replace(/\s/g, '').slice(0, WANT)
    const next = q < u.pieces.length ? nameOf(i, q) : null
    const blocked = !!next && !names.has(`${next}a`)
    // (`through`, the erasure's: past the unmarked visible pieces right after it, nothing but white space between, the next
    // marked piece's opening; null where text or the unit's end comes first)
    let through = null, others = 0
    if (blocked && !/\S/.test(after)) {
      for (let r = q + 1; r < u.pieces.length; r++) {
        const p = u.pieces[r]
        if (p.t === 'text') { if (/\S/.test(plainTranslated([p]))) break; continue }
        const c = classOf(p)
        if (!c) continue
        if (names.has(`${nameOf(i, r)}a`)) { through = `${nameOf(i, r)}a`; break }
        others++
      }
    }
    // (`split`: the macro's text, where the one unmarked piece after it is a placeholder the maker cannot find with no mark
    // (AHEAD_FOLLOWS, or a paper's macro that is no text symbol: a .bbl's `\\DOIprefix\\doi{…}`), the next marked piece right after
    // that piece (`through`), or text after it, then a piece of its unit's ends (`want`, `rest`, `ends`, as an opening's): its ink
    // ends where that text begins)
    const F = blocked && !/\S/.test(after) ? u.pieces[q] : null, fcls = classOf(F)
    const parted = !!F && classOf(u.pieces[k]) === 'macro' && (AHEAD_FOLLOWS.has(fcls) || (fcls === 'macro' && symbolText(F.src) === null))
    let trail = null
    if (parted && !through) {
      let rest = '', r = q + 1
      for (; r < u.pieces.length && !classOf(u.pieces[r]); r++) if (u.pieces[r].t === 'text') rest += plainTranslated([u.pieces[r]])
      const fnext = r < u.pieces.length ? nameOf(i, r) : null
      if (/\S/.test(rest)) trail = { want: asSet(rest).normalize('NFKC').toLowerCase().replace(/\s/g, '').slice(0, WANT), rest: spellOf(rest), ends: [...(fnext ? [`${fnext}a`] : []), ...endsOf(i)] }
    }
    const text = shown && parted && ((through && !others) || trail) ? shown.get(u.pieces[k].src) : undefined
    const said = typeof text === 'string' && /[\p{L}\p{N}]/u.test(text) ? text : ''
    // (`rest`, the erasure's: the whole text after it up to its next visible piece, as the spell check reads one — its letters and
    // digits —, so that the text after it is told where it runs exactly to its unit's next mark, not where its first WANT
    // characters first stand: a display's \\text{for every}, a URL's dots)
    // (`moved`: the punctuation mark that opens the text after a piece of a command the probe asks about, which that command may
    // set before its own ink — cite.sty's superscripts, natmove, fnpct: `\\cite{a}.` set ".¹" — and where TeX answered so, the
    // piece's closing mark stands after it (layoutMarking's 3): the piece's ink is what its two marks hold but that mark first,
    // where none stands after them (stream.mjs ownedOf: a piece of 0 has the mark after its closing point, its own ink as it is)
    const moved = ASKED.has(classOf(u.pieces[k])) && MOVED.includes(after[0]) ? after[0] : null
    return { closing: names.has(`${name.slice(0, -1)}b`), want, rest: spellOf(after), display, ends: [...(next ? [`${next}a`] : []), ...endsOf(i)], blocked, through, group, ...(said ? { split: { name: `${next}a`, text: said, ...(trail ?? {}) } } : {}), ...(moved ? { moved } : {}) }
  }
}

/**
 * The display a unit opens with, which the marking passes over (headEnd: no mark goes before a unit's start mark at its head, where
 * one in vertical mode would begin a paragraph of its own), by the unit's start mark's name (MARK_DEF's, `<i>s`): the opening mark's
 * name the display would have had, and those of the displays right after it with nothing visible between (its group), none of
 * them a destination set (`names`); null for any other name, a unit whose first visible piece is not such a display, or one the
 * marking marked. TeX ships it right before the start mark: stream.mjs ownedOf reads its ink between the point before that mark
 * and the mark (headInk), where it was LOST, OUTSIDE its unit's lines, and its light no block's (2501.14787v1 p24u193)
 */
export function headsOf(units, names) {
  const textOf = p => (!p.tr && p.src !== undefined ? p.src : p.s) ?? ''
  return start => {
    const m = /^(\d+)s$/.exec(start), i = m ? Number(m[1]) : -1, pieces = units[i]?.pieces
    if (!Array.isArray(pieces)) return null
    const head = headEnd(pieces, 0)
    let k = 0
    for (; k < head; k++) { const p = pieces[k]; if (p.t === 'text' ? /\S/.test(textOf(p)) : classOf(p)) break }
    if (k >= head || classOf(pieces[k]) !== 'display' || names.has(`p${i}.${k}a`) || names.has(`p${i}.${k}b`)) return null
    const group = []
    for (let q = k + 1; q < head; q++) {
      const p = pieces[q]
      if (p.t === 'text') { if (/\S/.test(textOf(p))) break; continue }
      const c = classOf(p)
      if (!c) continue
      if (c !== 'display' || names.has(`p${i}.${q}a`)) break
      group.push(`p${i}.${q}a`)
    }
    return { name: `p${i}.${k}a`, group }
  }
}

/**
 * The marks file (internal, prep/<mid>/marks-<sha>.json) from a PDF.js document of the marked original and its last
 * TeX pass's log; the caller opens and destroys the document, each of its pages cleaned up once read (page.cleanup: its
 * operator list let go), so that a caller that reads its operator lists again pays a parse again. Every destination
 * MARK_NAME takes, by page (1-based) and place, but one the log reports set twice (`dropped`: TeX kept the first,
 * wherever that was) or off its page's view;
 * each page's view and columns (MARK_DEF's c<n>-<k>); each unit's line count (LINES_TEX's AXT-LINES); the document's
 * text tokens (tokenizeDocument), their words once each; what the marked original was marked with (`marking`: the
 * classes and the paper's own switch it was given to layoutMarking, null where no probe was run: the two mark
 * differently, layoutMarking setting no mark for an asked command TeX did not answer; and the paper's macros TeX said
 * set no ink, `inkless`, and the text the probe showed each set, `texts` (readInkTexts' pairs, written flat), each null
 * where no probe was run), so that the maker knows which pieces have marks and finds those that have none;
 * and, given the paper's `units` and PDF.js's operator codes `OPS`, each marked piece's own ink, read from the marked
 * compile's operator lists by its points (layout/stream.mjs ownedOf): `owned`, by its opening mark's name, how it was
 * found (OWNED_HOW) and, where it was, its glyphs (page, origin, baseline, size, a character of `chars`) and its rules
 * (page and box) in stream order; a piece of more than GLYPHS_PIECE glyphs or RULES_PIECE rules, or past OWNED_ALL in the
 * paper, or with ink off its page, is not owned. A token whose word is the rest of one given in parts (the second line's
 * part of a word cut by a hyphen) is written with word -1, after the token it is the rest of, for a paragraph whose last
 * line holds nothing else holds its end mark (layout/carry.mjs); a token longer than a word may be, or off its page, is
 * left out, and its rests with it. Numbers to a hundredth. What it gives, parseLayoutMarks takes
 */
export async function layoutMarksOf(marked, log, o) {
  return fitted((await readMarked(marked, log, { ...o, paper: true })).marks)
}

/** a number to a hundredth, as the file writes it (-0 written 0) */
const r2z = v => Math.round(v * 100) / 100 + 0

/** a placeholder whose source names a link (a citation's key, a reference's label: layer-proto/links.mjs linkKindOf) and whose
 *  class may hold it: the pieces whose links the link-anchor locator pairs (make.mjs), and whose pages' links the marks read */
export const linkablePiece = piece => ['cite', 'ref', 'eqref', 'macro'].includes(classOf(piece)) && ['cite', 'internal'].includes(linkKindOf(piece)?.kind)
/** a destination's name as the file holds it: 1 to DEST_MAX code units, no control character */
const isDest = d => {
  if (typeof d !== 'string' || d.length < 1 || d.length > DEST_MAX) return false
  for (let i = 0; i < d.length; i++) { const c = d.charCodeAt(i); if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) return false }
  return true
}
/**
 * A Link annotation as both PDFs' links are ranked by (the link-anchor locator, make.mjs: our compile's here, arXiv's there):
 * its rectangle's corners in order and to a hundredth, [x0, y0, x1, y1], where it names a destination the marks file can hold
 * (isDest) and its rectangle is four numbers within ±COORD_MAX with an area at a hundredth; else null, and it is no link of
 * either side's order. One rule for both, so that a link one side leaves out the other leaves out too: a rank of a
 * destination is then read over the same links in each (a zero-width link kept on one side alone paired every later link of
 * its destination with the one before it)
 */
export function destRect(a) {
  const r = a?.rect
  if (!isDest(a?.dest) || !Array.isArray(r) || r.length !== 4 || !r.every(v => isNumber(v) && Math.abs(v) <= COORD_MAX)) return null
  const [x0, y0, x1, y1] = [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])].map(r2z)
  return x0 < x1 && y0 < y1 ? [x0, y0, x1, y1] : null
}
/**
 * Page p's Link annotations that name a destination (a string `dest`: no URL, no explicit array; destRect's), in PDF.js's
 * order, as the marks file's `links` hold them: [dest, page, x0, y0, x1, y1, a, b, n, text], the rectangle's corners to a hundredth, and
 * the glyphs under it by PDF.js's rule (links.mjs annotsOf: a glyph's advance centre on its baseline strictly inside the
 * rectangle or a quad) over the page's own glyphs (pageInk's, `glyphs`): their least and greatest origin, their count and
 * their characters in stream order. One with none, with more than MAX_GLYPHS, or with a text past LINK_TEXT_MAX is kept with
 * n 0 (counted for the order, never an anchor). Null where the page's annotations could not be read (`raw` null) or it
 * holds more than MAX_LINKS Link annotations: then the paper has no links (a rank past it is not known)
 */
function linksOfPage(raw, glyphs, p) {
  if (raw === null) return null
  const ls = raw.filter(a => a?.subtype === 'Link')
  if (ls.length > MAX_LINKS) return null
  if (!ls.some(a => isDest(a.dest))) return []
  // (the glyphs a link may hold: those whose baseline lies inside one's rectangle, its height; no other is a point of any)
  const bands = ls.flatMap(a => (destRect(a) ? [[Math.min(a.rect[1], a.rect[3]), Math.max(a.rect[1], a.rect[3])]] : []))
  const pts = { x: [], y: [], ch: [], key: [] }
  glyphs.forEach((g, k) => { if (!g.blank && /\S/u.test(g.u) && bands.some(([lo, hi]) => g.y > lo && g.y < hi)) { pts.x.push((g.x0 + g.x1) / 2); pts.y.push(g.y); pts.ch.push(g.u); pts.key.push(k) } })
  const { list } = annotsOf(ls, pts)
  const out = []
  ls.forEach((a, i) => {
    const rect = destRect(a)
    if (!rect) return
    const [x0, y0, x1, y1] = rect
    const e = list[i], keys = e && !e.unsupported ? e.g.key : []
    const text = keys.map(k => glyphs[k].u).join('')
    if (!keys.length || keys.length > MAX_GLYPHS || text.length > LINK_TEXT_MAX) { out.push([a.dest, p, x0, y0, x1, y1, 0, 0, 0, '']); return }
    let lo = Infinity, hi = -Infinity
    for (const k of keys) { lo = Math.min(lo, glyphs[k].x0); hi = Math.max(hi, glyphs[k].x0) }
    out.push([a.dest, p, x0, y0, x1, y1, r2z(lo), r2z(hi), keys.length, text])
  })
  return out
}
/** a unit's start or end mark, MARK_DEF's (the web's pdfMarks: what the left is anchored by) */
const UNIT_MARK = /^\d+[se]$/

/**
 * The marked original read a page at a time (the page stream): an async generator of what each page gives, in page order.
 * - first `{ head }`: { pages, marking, dropped, set (every name of the destinations and the log's dropped ones), named
 *   ([name, page, x, y] of the destinations the marks keep, in the names' order, the place as given), destPage (name → page),
 *   pageOf (name → page of every destination MARK_NAME takes, a dropped one's too: TeX's first), lines (the log's, as the
 *   end gives them), unitMarks } — `unitMarks` the unit marks the left is anchored by (destinations `axt-<id>s`, `axt-<id>e`, a dropped one
 *   too: Map name → { page, x, y, t }, in the names' order), each one's word `t` filled as its page is read, or null where a
 *   unit mark's page could not be looked up. The names are read first, each page looked up once by its reference;
 * - then for each page p `{ page }`: { p, view (its four numbers to a hundredth, checked as the marks' views are), tokens
 *   (the marks' tokens of p, stride 6: page, x, y, w, h, word), words (the words first seen on p, appended to the table in
 *   order), owned (the pieces found once p was read: [name, row], each row [name, how] or [name, how, n, glyphs (page, x0,
 *   y, size, its character itself), rules (page, x0, y0, x1, y1)]), links (with `units` and `OPS`, its Link annotations that
 *   name a destination, linksOfPage's rows, where a placeholder that names a link has a point on it; [] without or elsewhere;
 *   null where they could not be read), dark (null, or why the page's ink was not read: 'timedOut', its operator list not
 *   given within OPS_MS and given up, or its ink's walk past its backstop; 'capped', past OPS_CAP, GLYPHS_PAGE or a guard of
 *   pageInk's own; 'degraded', its boxes past BOXES_PAGE merged. It has no ink then: no piece on it is owned), found (every
 *   piece whose opening point stands on a page before it has been given: stream.mjs ownedPages `found()`), repeats (the point
 *   names read a second time on p: `twice` a page at a time) }. Each page's view, text and, with `units` and `OPS`,
 *   its operator list are read once and the page cleaned up after (page.cleanup); its tokens (tokenizeDocument, which begins
 *   again on every page) are let go once read; its packed ink (packGlyphs, STREAM_COLUMNS) is held only until every piece
 *   that may read it is found (stream.mjs ownedPages);
 * - last `{ end }`: { owned (the pieces found at the document's end), twice (the point names read more than once on pages
 *   apart: each such piece is 'a mark set twice', and owns nothing, nor the displays of its group), lines (the log's) }.
 * A piece's row is bounded by itself (GLYPHS_PIECE, RULES_PIECE, its ink within its pages' views); with `paper`, by the
 * marks file's paper-wide bounds too, as the file's parser takes them (OWNED_ALL counted in the opening points' order,
 * WORDS_MAX): the lab's file (layoutMarksOf). `marked` a PDF.js document of the marked original, `log` its last pass's log;
 * the options are layoutMarksOf's
 */
export async function* markedPages(marked, log, { engine, classes = LAYOUT_CLASSES, switches = null, inkless = null, texts = null, names = null, lineskip = null, complete = null, apart = null, units = null, OPS = null, paper = false }) {
  if (!ENGINES.includes(engine)) throw new LayoutRefusal('engine', `not one of ${ENGINES.join(', ')}`)
  const sw = checkSwitches(switches, 'switches'), none = checkInkless(inkless, 'inkless')
  const said = texts === null ? null : checkTexts(Array.isArray(texts) ? texts.flat() : texts, 'texts')
  const cased = checkNames(names, 'names')
  const marking = { classes: [...checkClasses(classes, 'classes')], switches: sw === null ? null : { ...sw }, inkless: none === null ? null : [...none], texts: said === null ? null : [...said], names: cased === null ? null : Object.fromEntries(NAME_KEYS.filter(k => Object.hasOwn(cased, k)).map(k => [k, cased[k]])), lineskip: checkLineskip(lineskip, 'lineskip') === null ? null : lineskip.map(r2z), complete: checkComplete(complete, 'complete') === null ? null : { ...complete }, apart: checkInkless(apart, 'apart') === null ? null : [...apart] }
  const pdf = marked
  const pages = checkPages(pdf.numPages, 'pages')
  const dropped = duplicatesIn(log), twice = new Set(dropped)
  // ---- the names, read once: each page looked up once by its reference, the worker answering each
  const pageOf = new Map()
  const pageNumber = async ref => {
    if (Number.isInteger(ref)) return ref + 1
    const key = ref && typeof ref === 'object' ? `${ref.num}R${ref.gen}` : null
    if (key === null) return null
    if (!pageOf.has(key)) pageOf.set(key, pdf.getPageIndex(ref).then(i => i + 1, e => { if (isMemoryError(e)) throw e; return null }))
    return pageOf.get(key)
  }
  const dests = await pdf.getDestinations(), set = new Set(dropped)
  const named = [], destPage = new Map(), pageOfName = new Map()
  let unitMarks = new Map()
  /** the unit marks by page, for their words as each page is read */
  const unitsOn = new Map()
  for (const [full, d] of dests instanceof Map ? dests : Object.entries(dests ?? {})) {
    if (!full.startsWith('axt-')) continue
    const name = full.slice(4)
    // (the web's reading: any destination of the name, its page looked up, a failure the reading's)
    if (unitMarks && UNIT_MARK.test(name) && d) {
      const ref = d[0], page = ref && typeof ref === 'object' && !Number.isInteger(ref) ? await pageNumber(ref) : null
      if (page === null) unitMarks = null
      else {
        const mk = { page, x: d[2], y: d[3], t: null }
        unitMarks.set(name, mk)
        ;(unitsOn.get(page) ?? unitsOn.set(page, []).get(page)).push([name, mk])
      }
    }
    if (!Array.isArray(d) || !MARK_NAME.test(name)) continue
    set.add(name)
    const page = await pageNumber(d[0]), x = d[2], y = d[3]
    if (isInteger(page, 1, pages)) pageOfName.set(name, page)
    if (twice.has(name)) continue
    if (isInteger(page, 1, pages)) destPage.set(name, page)
    named.push([name, page, x, y])
  }
  // (the log's line counts and the units' alignments, read before any page: a maker reading the pages as they come takes them
  // with the head)
  const lines = [...readLines(log)].filter(([id, l]) => isInteger(id, 0, Number.MAX_SAFE_INTEGER) && isInteger(l.lines, 0, LINES_MAX)).sort((a, b) => a[0] - b[0]).map(([id, l]) => [id, l.lines])
  const align = readAlign(log), colours = readColours(log)
  // the pages whose links are read: those a placeholder that names a link (linkablePiece) has a point on, the pages between its
  // two points too. Any other page's links are no piece's, and the link-anchor locator never pairs them (make.mjs): PDF.js reads
  // a page's annotations at a cost of its own
  const linkPages = new Set()
  if (units && OPS) units.forEach((u, i) => u.pieces.forEach((piece, k) => {
    if (!linkablePiece(piece)) return
    const a = destPage.get(`p${i}.${k}a`) ?? destPage.get(`p${i}.${k}b`), b = destPage.get(`p${i}.${k}b`) ?? a
    if (a !== undefined) for (let q = Math.min(a, b); q <= Math.max(a, b); q++) linkPages.add(q)
  }))
  // their annotations read first, each page's within OPS_MS (a page not answered within it could not be read), and kept until
  // its page is read: what the paper's links are is a function of them alone, so it is told with the head (`links`: their count
  // and their destinations' names, or null where the paper has none: a page's could not be read, held more than MAX_LINKS, or
  // all were past LINKS_MAX), for a reader that takes the pages as they come (the page stream's maker) to know it before any page
  const annotsAt = new Map()
  let linkCount = 0, noLinks = false
  const linkDests = new Set()
  for (const q of [...linkPages].sort((a, b) => a - b)) {
    let page = null
    try { page = await pdf.getPage(q) } catch (e) { if (isMemoryError(e)) throw e }
    const raw = page ? await within(readAnnots(page), OPS_MS) : null
    annotsAt.set(q, raw)
    const ls = Array.isArray(raw) ? raw.filter(a => a?.subtype === 'Link') : null
    if (ls === null || ls.length > MAX_LINKS) { noLinks = true; break }
    for (const a of ls) if (destRect(a)) { linkCount++; linkDests.add(a.dest) }
    if (linkCount > LINKS_MAX) { noLinks = true; break }
  }
  // (a paper with no links reads no further page's and keeps none: each page's links are then none, as they would be)
  if (noLinks) annotsAt.clear()
  const links = noLinks ? null : { count: linkCount, dests: [...linkDests].sort() }
  yield { head: { pages, marking, dropped, set, named, destPage, pageOf: pageOfName, unitMarks, lines, align, colours, links } }
  // ---- each page, once
  const views = [], wordOf = new Map()
  let words = 0
  // kept: whether the token before was written, so that a rest is written only after the word it is the rest of
  let kept = false
  const follows = units ? followsOf(units, set, marking.texts) : null
  const stream = units && OPS ? ownedPages({ follows, dropped, heads: headsOf(units, set), closing: name => destPage.get(`${name.slice(0, -1)}b`) ?? null }) : null
  let all = 0, found = []
  const seen = { warned: false, who: 'marked read' }
  const take = (name, e, W) => {
    if (e.how >= OWNED) { found.push([name, [name, e.how]]); return }
    const not = how => { const k = OWNED_HOW.indexOf(how); if (k < OWNED) throw new Error(`no how ${how} of a piece not owned`); found.push([name, [name, k]]) }
    if (e.glyphs.length > GLYPHS_PIECE || e.boxes.length > RULES_PIECE) { not('more glyphs than a piece may own'); return }
    if (paper && all + e.glyphs.length + e.boxes.length > OWNED_ALL) { not('past the glyphs a paper may own'); return }
    const ok = (p, x, y) => inView(views, p, r2(x), r2(y))
    const bs = e.boxes.map(([p, b]) => [p, W[p - 1].boxes.slice(4 * b, 4 * b + 4)])
    // a glyph's own numbers: its page's columns (packGlyphs) at its index
    const off = ([p, g]) => { const G = W[p - 1].glyphs; return !ok(p, G.x0[g], G.y[g]) || !(r2(G.size[g]) > 0 && G.size[g] <= SIZE_MAX) }
    if (e.glyphs.some(off) || bs.some(([p, b]) => !ok(p, b[0], b[1]) || !ok(p, b[2], b[3]))) { not('ink out of bounds'); return }
    all += e.glyphs.length + bs.length
    const row = [name, e.how, e.glyphs.length]
    for (const [p, g] of e.glyphs) {
      const G = W[p - 1].glyphs
      let u = G.u[g]
      if (u.length > CHAR_MAX) u = u.slice(0, /[\ud800-\udbff]/.test(u[CHAR_MAX - 1]) ? CHAR_MAX - 1 : CHAR_MAX)
      // (its character itself: the file's table of them is made of the rows, in their order, by whoever writes the file)
      row.push(p, r2z(G.x0[g]), r2z(G.y[g]), r2z(G.size[g]), u)
    }
    for (const [p, b] of bs) row.push(p, r2z(b[0]), r2z(b[1]), r2z(b[2]), r2z(b[3]))
    found.push([name, row])
  }
  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p)
    const view = page.view.slice(0, 4).map(r2z)
    // (its view checked as checkViews checks the marks' views, there and now: a page's numbers are its own)
    for (let i = 0; i < 4; i++) {
      const at = 4 * (p - 1) + i
      if (!isNumber(view[i]) || Math.abs(view[i]) > COORD_MAX) throw new LayoutRefusal(`views[${at}]`, `not a number within ±${COORD_MAX}`)
      if (i >= 2 && view[i] <= view[i - 2]) throw new LayoutRefusal(`views[${at}]`, 'an empty view')
    }
    views.push(...view)
    const content = await page.getTextContent()
    let ink = null, links = []
    let dark = null
    if (stream) {
      // the columns of its glyphs ownedOf reads (ink.mjs packGlyphs, in stream order), not a Glyph object each, and each
      // glyph's boxes before it as 32-bit integers: held until every piece that may read the page is found. Bounded as the
      // layout maker's read of arXiv's PDF is (the compile is the paper's source, as untrusted): its operator list waited for
      // OPS_MS at most and given up past it (oplist.mjs: that page alone); a page past a bound of pageInk's own (`capped`,
      // `timedOut`), or read with its boxes past BOXES_PAGE merged (`degraded`: a piece's rule there would be left out of its
      // own ink, unseen), is unread: no ink, so that no piece on it is owned (each LOST to the maker, `dark` says why), and no
      // glyph under its links
      // (its annotations as the head read them, let go here)
      const raw = linkPages.has(p) ? annotsAt.get(p) ?? null : []
      annotsAt.delete(p)
      const ops = await listWithin(page, seen)
      const got = ops ? pageInk(OPS, ops, page.commonObjs ?? { get: () => null }, { rotate: page.rotate ?? 0, glyphsMax: GLYPHS_PAGE, boxesMax: BOXES_PAGE }) : null
      if (!ops) dark = 'timedOut'
      else if (got.capped) dark = 'capped'
      else if (got.timedOut) dark = 'timedOut'
      else if (got.degraded) dark = 'degraded'
      const { glyphs, boxes, points, boxAt } = dark ? { glyphs: [], boxes: [], points: [], boxAt: [] } : got
      ink = { glyphs: packGlyphs(glyphs, { columns: STREAM_COLUMNS }), boxes, points, boxAt: Int32Array.from(boxAt), view: page.view.slice(0, 4) }
      // its links, by the glyphs under them (linksOfPage): read where the operator list is
      links = linksOfPage(raw, glyphs, p)
    }
    // its operator list let go once its ink is read, so that PDF.js holds one page's, not every page's to the end; nothing
    // reads it again, and the caller destroys the document after (paper.mjs)
    page.cleanup?.()
    // its tokens: the marks', and the words of the unit marks on it
    const own = tokenizeDocument([{ page: p, items: content.items, styles: content.styles }])
    const tokens = [], fresh = []
    for (const t of own) {
      const rest = t.t === ''
      if ((rest && !kept) || t.t.length > WORD_MAX) { kept = false; continue }
      const x = r2z(t.x), y = r2z(t.y), w = r2z(t.w), h = r2z(t.h)
      if (!inView(views, t.page, x, y) || !(w >= 0 && w <= BOX_MAX) || !(h >= 0 && h <= BOX_MAX)) { kept = false; continue }
      let k = rest ? -1 : wordOf.get(t.t)
      if (k === undefined) {
        if (paper && words >= WORDS_MAX) { kept = false; continue }
        k = words++
        fresh.push(t.t)
        wordOf.set(t.t, k)
      }
      tokens.push(t.page, x, y, w, h, k)
      kept = true
    }
    if (unitMarks && unitsOn.has(p)) {
      const byPage = new Map([[p, own.map((_, k) => k)]])
      for (const [name, mk] of unitsOn.get(p)) { const k = tokenAtMark(own, byPage, mk, name.endsWith('s')); mk.t = k == null ? null : own[k].t }
    }
    if (stream) stream.add(p, ink, take)
    const owned = found
    found = []
    yield { page: { p, view, tokens, words: fresh, owned, links, dark, found: stream ? stream.found() : p + 1, repeats: stream ? stream.repeats() : [] } }
  }
  if (stream) stream.end(take)
  yield { end: { owned: found, twice: stream ? stream.twice() : new Set(), lines, align, colours } }
}

/**
 * The marked original read once, a page at a time (markedPages, drained): { marks, unitMarks }.
 * - `marks`: what layoutMarksOf gives, in memory, as parseLayoutMarks reads the file encodeLayoutMarks writes of it (numbers
 *   to a hundredth, no -0), but never trimmed to the file's own bounds (fitted: the server writes no marks file; the lab's
 *   file is layoutMarksOf's), and with `paper` alone bounded by the file's paper-wide bounds (OWNED_ALL counted in the
 *   opening points' order, WORDS_MAX). A point read twice on pages apart makes its piece 'a mark set twice' (ownedOf over the
 *   whole says so), and owns nothing, nor the displays of its group. The characters' table in the rows' order, as before.
 * - `unitMarks`: markedPages' (null where a unit mark's page could not be looked up).
 * - `dark`: the pages whose ink was not read (markedPages' `dark`): `timedOut`, their operator list given up past OPS_MS;
 *   `capped`, past OPS_CAP's operations or GLYPHS_PAGE's glyphs. No piece on them is owned; the marks file says nothing of
 *   them (its keys are exact), the run's stats do.
 * `marked` a PDF.js document of the marked original, `log` its last pass's log; the options are layoutMarksOf's
 */
export async function readMarked(marked, log, o) {
  let head = null, end = null
  const views = [], words = [], tokens = [], rows = new Map(), dark = { timedOut: [], capped: [], degraded: [] }
  // (the links, the pages' in order; none at all where a page's could not be read or past LINKS_MAX)
  let links = []
  for await (const x of markedPages(marked, log, o)) {
    if (x.head) head = x.head
    else if (x.page) {
      if (x.page.dark) dark[x.page.dark].push(x.page.p)
      views.push(...x.page.view)
      for (const w of x.page.words) words.push(w)
      for (const v of x.page.tokens) tokens.push(v)
      for (const [name, row] of x.page.owned) rows.set(name, row)
      if (links !== null && (x.page.links === null || links.length + x.page.links.length > LINKS_MAX)) links = null
      else if (links !== null) for (const e of x.page.links) links.push(e)
    } else if (x.end) {
      end = x.end
      for (const [name, row] of x.end.owned) rows.set(name, row)
    }
  }
  const { pages, marking, dropped, named, unitMarks } = head
  // ---- the marks, by the views now known
  const columns = columnsOf(head), marks = []
  for (const [name, page, x, y] of named) if (markAt(views, pages, page, x, y)) marks.push([name, page, r2z(x), r2z(y)])
  marks.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const chars = [], owned = []
  if (o.units && o.OPS) {
    const follows = followsOf(o.units, head.set, head.marking?.texts)
    vetoTwice(rows, end.twice, follows, headsOf(o.units, head.set))
    const charOf = new Map()
    for (const name of [...rows.keys()].sort()) {
      const row = rows.get(name)
      if (row.length > 2) {
        for (let j = 3 + 4; j < 3 + 5 * row[2]; j += 5) {
          let u = row[j]
          let c = charOf.get(u)
          if (c === undefined) {
            // the last place of `chars` kept for '', every character past it written so: the parser takes CHARS_MAX at
            // most (the 6b review's Minor 1: the 65,537th was pushed as '' past it)
            if (chars.length >= CHARS_MAX - 1 && !charOf.has('')) { charOf.set('', chars.length); chars.push('') }
            if (chars.length >= CHARS_MAX) u = ''
            c = charOf.get(u) ?? chars.length
            if (c === chars.length) { chars.push(u); charOf.set(u, c) }
          }
          row[j] = c
        }
      }
      owned.push(row)
    }
  }
  return { marks: { schema: MARKS_SCHEMA, engine: o.engine, marking, pages, views, columns, marks, dropped, lines: end.lines, align: end.align, colours: end.colours, words, tokens, chars, owned, links: links ?? [] }, unitMarks, dark }
}

/** whether a destination the head names is a mark of the marks file: on a page of the paper, at numbers within its view
 *  (`views` the pages' read so far, stride 4: its page's must be among them) */
export const markAt = (views, pages, page, x, y) => isInteger(page, 1, pages) && isNumber(x) && isNumber(y) && inView(views, page, r2(x), r2(y))
/** each page's columns as the marks file has them (MARK_DEF's c<n>-<k>, the last of a page's): of the head's names alone */
export function columnsOf(head) {
  const columns = new Array(head.pages).fill(0)
  for (const [name, page, x, y] of head.named) {
    if (!isInteger(page, 1, head.pages) || !isNumber(x) || !isNumber(y)) continue
    const c = /^c([12])-\d+$/.exec(name)
    if (c) columns[page - 1] = Number(c[1])
  }
  return columns
}
/**
 * The marks of a marked original whose pages are still to be read (the page stream's maker, layout/make.mjs stream with
 * `marked`): what its head tells — its marking, its pages' columns, the names the log dropped, its line counts, how many links
 * the paper holds and their destinations (`linkCount`, `linkDests`: no field of the file's) — and nothing of its pages: no
 * mark, token, word, owned piece or link yet, which the maker takes as each page comes
 */
export function marksOfHead(head, engine) {
  // (its links none yet, each page's added as it is read; how many the paper holds and their destinations' names the head's,
  // for the maker's link-anchor locator: none where the paper has no links)
  return { schema: MARKS_SCHEMA, engine, marking: head.marking, pages: head.pages, views: [], columns: columnsOf(head), marks: [], dropped: head.dropped, lines: head.lines, align: head.align, colours: head.colours ?? [], words: [], tokens: [], chars: [], owned: [], links: [], linkCount: head.links?.count ?? 0, linkDests: head.links?.dests ?? [] }
}

/** a point read twice on pages apart (markedPages' `twice`): its piece 'a mark set twice', owning nothing, nor the displays
 *  of its group (ownedOf's rule over the whole), on `rows` (name → row) in place */
export function vetoTwice(rows, twice, follows, heads = null) {
  const set2 = OWNED_HOW.indexOf('a mark set twice'), inGroup = OWNED_HOW.indexOf('in the display before it')
  for (const name of [...rows.keys()]) {
    if (!OPENING.test(name) || !(twice.has(name) || twice.has(`${name.slice(0, -1)}b`))) continue
    rows.set(name, [name, set2])
    for (const g of follows(name)?.group ?? []) if (rows.get(g)?.[1] === inGroup) rows.delete(g)
  }
  // (a display a unit opens with, found between the point before its start mark and that mark (headsOf): none where the mark was
  // set twice, as ownedOf over the whole finds none)
  if (heads) for (const start of twice) {
    const h = /^\d+s$/.test(start) ? heads(start) : null
    if (!h || !rows.has(h.name) || rows.get(h.name)[1] >= OWNED) continue
    rows.delete(h.name)
    for (const g of h.group) if (rows.get(g)?.[1] === inGroup) rows.delete(g)
  }
}

/**
 * The marks file as the lab writes it of the marks in memory (readMarked's, layoutMarksOfPaper's): encodeLayoutMarks of the
 * marks as they are, a file its parser takes and reads back as those marks. The marks in memory are bounded a page and a
 * piece, not by the file (the page pass's design, §3: MARKS_CAP, MARKS_VALUES, WORDS_MAX and OWNED_ALL are the file's
 * alone), so marks past one of the file's bounds are no file: the parser's LayoutRefusal is thrown, never a file trimmed to
 * other marks (fitted), which would make a layout of the file other than the layout made of them in memory. The lab's file
 * of a marked PDF itself, within its bounds as ever, is layoutMarksOf's
 */
export function marksFile(m) {
  const text = encodeLayoutMarks(m)
  parseLayoutMarks(new TextEncoder().encode(text))
  return text
}

/**
 * The marks file within what its own parser takes: past MARKS_CAP's bytes or MARKS_VALUES' values (OWNED_ALL's 250,000
 * glyphs beside the rest of a paper large enough to reach it), each owned piece from the last written as not owned
 * ('past the glyphs a paper may own') until it fits, so that a paper loses the own ink of its last pieces, never its
 * whole layer (the 6b review's Minor 1). The writer writes nothing the parser refuses
 */
function fitted(m) {
  let text = encodeLayoutMarks(m)
  let bytes = new TextEncoder().encode(text).length, values = countValues(text)
  if (bytes <= MARKS_CAP && values <= MARKS_VALUES) return m
  // (its links first: a paper past the bounds loses the link-anchor locator, before any piece's own ink)
  if (m.links.length) {
    m = { ...m, links: [] }
    text = encodeLayoutMarks(m)
    bytes = new TextEncoder().encode(text).length; values = countValues(text)
    if (bytes <= MARKS_CAP && values <= MARKS_VALUES) return m
  }
  const past = OWNED_HOW.indexOf('past the glyphs a paper may own'), owned = [...m.owned]
  for (let q = owned.length - 1; q >= 0 && (bytes > MARKS_CAP || values > MARKS_VALUES); q--) {
    const e = owned[q]
    if (e.length <= 2) continue
    const was = JSON.stringify(ownedRow(e)), now = JSON.stringify([e[0], past])
    bytes -= new TextEncoder().encode(was).length - new TextEncoder().encode(now).length
    values -= countValues(was) - countValues(now)
    owned[q] = [e[0], past]
  }
  return { ...m, owned }
}

/** the marks file as written: the schema's keys in order, numbers to a hundredth */
export function encodeLayoutMarks(m) {
  const { schema, engine, marking, pages, views, columns, marks, dropped, lines, align, colours, words, tokens, chars, owned, links } = m
  return JSON.stringify({
    schema, engine, marking: { classes: marking.classes, switches: marking.switches, inkless: marking.inkless, texts: marking.texts, names: marking.names, lineskip: marking.lineskip === null ? null : marking.lineskip.map(r2), complete: marking.complete, apart: marking.apart }, pages, views: views.map(r2), columns, marks: marks.map(([n, p, x, y]) => [n, p, r2(x), r2(y)]), dropped, lines, align, ...(colours?.length ? { colours } : {}), words,
    tokens: tokens.map((v, i) => (i % 6 === 0 || i % 6 === 5 ? v : r2(v))), chars,
    owned: owned.map(ownedRow),
    links: (links ?? []).map(e => e.map((v, j) => (j >= 2 && j <= 7 ? r2(v) : v))),
  })
}
/** an owned row as written: a glyph's page and character, a rule's page, as they are; its coordinates to a hundredth */
const ownedRow = e => e.map((v, j) => (j < 3 || (j - 3) % 5 === 0 || (j < 3 + 5 * e[2] && (j - 3) % 5 === 4) ? v : r2(v)))

/** bytes, then values and nesting, then JSON.parse, then every bound; throws LayoutRefusal, naming where */
export function parseLayoutMarks(bytes) {
  const json = boundedJson(bytes, { cap: MARKS_CAP, values: MARKS_VALUES, depth: MARKS_DEPTH })
  const m = checkKeys(json, keysOf(json), '')
  if (m.schema !== MARKS_SCHEMA) throw new LayoutRefusal('schema', `not ${MARKS_SCHEMA}`)
  if (!ENGINES.includes(m.engine)) throw new LayoutRefusal('engine', `not one of ${ENGINES.join(', ')}`)
  const marking = checkKeys(m.marking, MARKING_KEYS, 'marking')
  checkClasses(marking.classes, 'marking.classes')
  checkSwitches(marking.switches, 'marking.switches')
  checkInkless(marking.inkless, 'marking.inkless')
  checkTexts(marking.texts, 'marking.texts')
  checkNames(marking.names, 'marking.names')
  checkLineskip(marking.lineskip, 'marking.lineskip')
  checkComplete(marking.complete, 'marking.complete')
  checkInkless(marking.apart, 'marking.apart')
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
  if (!Array.isArray(m.align)) throw new LayoutRefusal('align', 'not an array')
  id = -1
  for (let i = 0; i < m.align.length; i++) {
    const e = m.align[i]
    if (!Array.isArray(e) || e.length !== 2) throw new LayoutRefusal(`align[${i}]`, 'not [id, code]')
    if (!isInteger(e[0], id + 1, Number.MAX_SAFE_INTEGER)) throw new LayoutRefusal(`align[${i}][0]`, 'not an id above the last')
    if (!ALIGN_CODES.includes(e[1])) throw new LayoutRefusal(`align[${i}][1]`, `not one of ${ALIGN_CODES.join(', ')}`)
    id = e[0]
  }
  // (each colour piece's fill: a key only where one has a row, none read as none)
  if (!Object.hasOwn(m, 'colours')) m.colours = []
  else if (!Array.isArray(m.colours) || m.colours.length === 0) throw new LayoutRefusal('colours', 'not an array of a row or more')
  for (let i = 0; i < m.colours.length; i++) {
    const e = m.colours[i], before = m.colours[i - 1]
    if (!Array.isArray(e) || e.length !== 3) throw new LayoutRefusal(`colours[${i}]`, 'not [id, k, rgb]')
    if (!isInteger(e[0], 0, Number.MAX_SAFE_INTEGER) || !isInteger(e[1], 0, Number.MAX_SAFE_INTEGER)) throw new LayoutRefusal(`colours[${i}]`, 'not a unit and a piece')
    if (before && (e[0] < before[0] || (e[0] === before[0] && e[1] <= before[1]))) throw new LayoutRefusal(`colours[${i}]`, 'not a piece after the last')
    if (!isInteger(e[2], 0, 0xffffff)) throw new LayoutRefusal(`colours[${i}][2]`, 'not a fill 0 to 0xFFFFFF')
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
    if (!isInteger(t[i + 5], 0, m.words.length - 1) && !(t[i + 5] === -1 && i > 0)) throw new LayoutRefusal(`tokens[${i + 5}]`, 'not a word of words, nor the rest of the word before (-1)')
  }
  if (!Array.isArray(m.chars) || m.chars.length > CHARS_MAX) throw new LayoutRefusal('chars', `not an array of at most ${CHARS_MAX}`)
  for (let i = 0; i < m.chars.length; i++) { const c = m.chars[i]; if (typeof c !== 'string' || c.length > CHAR_MAX) throw new LayoutRefusal(`chars[${i}]`, `not a string of at most ${CHAR_MAX} code units`) }
  // each piece's own ink: its opening mark's name, rising; how (OWNED_HOW); where owned, its glyphs (page, x0, baseline,
  // size, a character) and rules (page, x0, y0, x1, y1), each within its page's view by 1
  if (!Array.isArray(m.owned)) throw new LayoutRefusal('owned', 'not an array')
  const within = (page, x, y) => { const o = 4 * (page - 1); return x >= views[o] - 1 && x <= views[o + 2] + 1 && y >= views[o + 1] - 1 && y <= views[o + 3] + 1 }
  let last = '', all = 0
  for (let i = 0; i < m.owned.length; i++) {
    const e = m.owned[i], at = `owned[${i}]`
    if (!Array.isArray(e) || e.length < 2) throw new LayoutRefusal(at, 'not [name, how, …]')
    if (typeof e[0] !== 'string' || !OPENING.test(e[0])) throw new LayoutRefusal(`${at}[0]`, "not a piece's opening mark")
    if (e[0] <= last) throw new LayoutRefusal(`${at}[0]`, 'not a name above the last')
    last = e[0]
    if (!isInteger(e[1], 0, OWNED_HOW.length - 1)) throw new LayoutRefusal(`${at}[1]`, 'not a how of OWNED_HOW')
    if (e[1] >= OWNED) { if (e.length !== 2) throw new LayoutRefusal(at, 'not [name, how] for a piece not owned'); continue }
    const n = e[2]
    if (e.length < 3 || !isInteger(n, 0, GLYPHS_PIECE)) throw new LayoutRefusal(e.length < 3 ? at : `${at}[2]`, `not a glyph count 0 to ${GLYPHS_PIECE}`)
    const rules = (e.length - 3 - 5 * n) / 5
    if (!Number.isInteger(rules) || rules < 0) throw new LayoutRefusal(at, 'not 5 numbers a glyph and a rule')
    if (rules > RULES_PIECE) throw new LayoutRefusal(at, `more than ${RULES_PIECE} rules`)
    all += n + rules
    if (all > OWNED_ALL) throw new LayoutRefusal('owned', `more than ${OWNED_ALL} glyphs and rules`)
    for (let j = 3; j < e.length; j += 5) {
      const page = e[j]
      if (!isInteger(page, 1, pages)) throw new LayoutRefusal(`${at}[${j}]`, `not a page 1 to ${pages}`)
      for (let c = 1; c <= (j < 3 + 5 * n ? 2 : 4); c++) {
        const v = e[j + c], x = c % 2 === 1
        if (!isNumber(v) || !within(page, x ? v : views[4 * (page - 1)], x ? views[4 * (page - 1) + 1] : v)) throw new LayoutRefusal(`${at}[${j + c}]`, 'not a number within its page')
        if (c >= 3 && v < e[j + c - 2]) throw new LayoutRefusal(`${at}[${j + c}]`, `not ${x ? 'right' : 'above'} of its other edge`)
      }
      if (j < 3 + 5 * n) {
        if (!isNumber(e[j + 3]) || e[j + 3] <= 0 || e[j + 3] > SIZE_MAX) throw new LayoutRefusal(`${at}[${j + 3}]`, `not a size above 0 to ${SIZE_MAX}`)
        if (!isInteger(e[j + 4], 0, m.chars.length - 1)) throw new LayoutRefusal(`${at}[${j + 4}]`, 'not a character of chars')
      }
    }
  }
  checkLinks(m.links, pages)
  return m
}

/** the marked compile's links as the maker takes them (linksOfPage's rows): at most LINKS_MAX, pages rising, each
 *  [dest, page, x0, y0, x1, y1, a, b, n, text] within its bounds; else a refusal at `links[i]…` */
function checkLinks(v, pages) {
  if (!Array.isArray(v) || v.length > LINKS_MAX) throw new LayoutRefusal('links', `not an array of at most ${LINKS_MAX}`)
  let last = 1
  for (let i = 0; i < v.length; i++) {
    const e = v[i], at = `links[${i}]`
    if (!Array.isArray(e) || e.length !== LINK_ROW) throw new LayoutRefusal(at, 'not [dest, page, x0, y0, x1, y1, a, b, n, text]')
    if (!isDest(e[0])) throw new LayoutRefusal(`${at}[0]`, `not a destination's name of 1 to ${DEST_MAX} code units`)
    if (!isInteger(e[1], last, pages)) throw new LayoutRefusal(`${at}[1]`, `not a page from ${last} to ${pages}`)
    last = e[1]
    for (let j = 2; j <= 7; j++) if (!isNumber(e[j]) || Math.abs(e[j]) > COORD_MAX) throw new LayoutRefusal(`${at}[${j}]`, `not a number within ±${COORD_MAX}`)
    if (!(e[2] < e[4])) throw new LayoutRefusal(`${at}[4]`, 'not right of its other edge')
    if (!(e[3] < e[5])) throw new LayoutRefusal(`${at}[5]`, 'not above its other edge')
    if (!isInteger(e[8], 0, MAX_GLYPHS)) throw new LayoutRefusal(`${at}[8]`, `not a glyph count 0 to ${MAX_GLYPHS}`)
    if (!(e[6] <= e[7])) throw new LayoutRefusal(`${at}[7]`, 'not at or right of its first glyph')
    if (typeof e[9] !== 'string' || e[9].length > LINK_TEXT_MAX || (e[8] === 0) !== (e[9] === '')) throw new LayoutRefusal(`${at}[9]`, `not a text of at most ${LINK_TEXT_MAX} code units, empty with no glyph alone`)
  }
}
