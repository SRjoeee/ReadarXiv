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
// layout-marks-cases.mjs) hold every text item of the page in place; the corpus check (Task 2) measures the layout
// lines they carry and lose, and fails on a loss of no accepted cause.
import { markUnits, NO_ARG_COMMANDS } from '../latex-front.mjs'
import { tokenizeDocument } from '../anchors.mjs'
import { plainTranslated } from '../mt.mjs'
import { readLines } from '../typeset/tex.mjs'
import { pageInk } from './ink.mjs'
import { boundedJson, checkKeys, checkPages, checkViews, countValues, inView, isInteger, isNumber, isObject, LayoutRefusal, told } from './json.mjs'
import { OWNED, OWNED_HOW, ownedOf, WANT } from './stream.mjs'

// ---------------------------------------------------------------- the classes
/** every class, in this order */
export const MARK_CLASSES = Object.freeze(['math', 'display', 'cite', 'ref', 'eqref', 'code', 'url', 'footnote', 'macro'])
/** the classes the run marks when asked: the global default, every class (Task 2's corpus check). The paper's own switch
 *  (layoutMarking's `switches`, what TeX answers to the mark probe) takes marks off a command's placeholders where TeX
 *  says they would change what follows them */
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
export const DISPLAY = /^(?:\\\[|\$\$|\\begin\s*\{(?:equation|align|alignat|gather|multline|flalign|eqnarray|displaymath|dmath|IEEEeqnarray|subequations)\*?\})/
const MATH = /^(?:\$(?!\$)|\\\(|\\ensuremath(?![A-Za-z@]))/
const CITE = /^\\(?:[cC]ite[A-Za-z]*|(?:paren|text|auto)cites?)(?![A-Za-z@])/
const EQREF = /^\\eqref(?![A-Za-z@])/
const REF = /^\\(?:ref|autoref|[cC]ref|pageref|nameref)(?![A-Za-z@])/
const CODE = /^\\(?:texttt|verb|lstinline)(?![A-Za-z@])/
const URL = /^\\(?:url|href)(?![A-Za-z@])/
/** a footnote's call: \footnotemark, and a \footnote whose note the scanner made no unit of (fewer than two letters: a
 *  number, a link) — a call all the same, which the layer places by its mark */
const FOOTNOTE_MARK = /^\\footnote(?:mark)?(?![A-Za-z@])/

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

// ---------------------------------------------------------------- the paper's own switch: TeX asked
/** what the mark probe sets after a placeholder: the six marks of punctuation a package may look for and set first
 *  (biblatex scans for all six; natmove, cite.sty and REVTeX for the first four), a word after a space, and for a
 *  footnote's call a second call */
export const FOLLOWERS = Object.freeze(['.', ',', ';', ':', '!', '?', 'word', 'call'])
const PUNCT = '.,;:!?'
/** the classes whose commands the probe asks about: a package may look past their closing brace (a paper's macro has
 *  its opening mark alone anyway: LOOKS_AHEAD) */
const ASKED = new Set(['cite', 'ref', 'eqref', 'url', 'footnote'])
/** the commands asked about at most, a paper */
export const PROBE_MAX = 16
/** a piece's leading command: \cite of \cite[p.~3]{a}, \footnote of a call; null for none */
export const commandOf = p => (p?.t === 'nested' ? /^\\[A-Za-z@]+/.exec(p.pre ?? '')?.[0] : p?.t === 'ph' ? /^\\[A-Za-z@]+/.exec(p.src ?? '')?.[0] : null) ?? null
/**
 * The mark probe's samples: each command of the asked classes the paper writes, once, by the first piece of it TeX can
 * set in a box (no comment or parameter sign, no \verb): a placeholder's own source (a citation of the keys the paper
 * cites), or a call with a note of its own words
 */
export function probeSamples(units) {
  const seen = new Map()
  for (const u of units) for (const p of u.pieces) {
    const cmd = commandOf(p), cls = classOf(p)
    if (!cmd || !ASKED.has(cls) || seen.has(cmd) || seen.size >= PROBE_MAX) continue
    const src = p.t === 'nested' ? `${p.pre}A note.${p.post}` : p.src
    if (/[%#]|\\(?:verb|lstinline)(?![A-Za-z@])/.test(src) || src.length > 400) continue
    seen.set(cmd, { command: cmd, src, call: cls === 'footnote' })
  }
  return [...seen.values()]
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
 * closing mark, 2 no mark (for `call`: 0 a mark may stand between the two calls, 2 none may); before each box a row
 * `punct-at <i> <j> <box>`, so that an error TeX logs is that box's (readMarkProbe). Each
 * box is set into a register voided first, and says whether it closed where it was meant to (\ifinner at its last
 * statement): a box an error ended early is never the box before it, still in the register (the re-review's I-new:
 * REVTeX's citeautoscript was answered every mark before `!`, `?` and a word). Every box starts from the
 * same state: the footnote counter as it was (a call's number of two digits is wider than one of one: 2608.27728), and
 * biblatex's citation trackers reset (a second citation of a key may be set short). Every box ends at a space,
 * where each package's lookahead stops (REVTeX's swap takes any token after the citation in a \csname); an empty
 * paragraph after each sample starts TeX's error count again. Writes nothing, ships out nothing
 */
export function punctuationSection(samples) {
  const box = (i, j, n, body) => `${probeRow('punct-at', i, j, n)}\\global\\setbox\\axt@qbox\\box\\voidb@x\\gdef\\axt@qn{}\\axt@qreset\\setbox\\axt@qbox\\hbox{way ${body} \\unskip\\xdef\\axt@qn{\\the\\lastnodetype\\ifinner\\ifhmode/in\\fi\\fi}}\\xdef\\axt@q${n}{\\the\\wd\\axt@qbox/\\the\\ht\\axt@qbox/\\the\\dp\\axt@qbox/\\axt@qn}`
  const put = d => `\\xdef\\axt@qo{\\axt@qo${d}}`
  const tests = samples.map(({ src, call }, i) => {
    const open = `\\axtpma{q${i}a}`, close = `\\axtpm{q${i}b}`
    const each = [...PUNCT, ' x'].map((f, j) => `\\begingroup${box(i, j, 'a', `${src}${f}`)}${box(i, j, 'b', `${src}{}${f}`)}${box(i, j, 'c', `${open}${src}${close}${f}`)}${box(i, j, 'd', `${open}${src}${f}`)}\\endgroup\\ifx\\axt@qa\\axt@qb\\ifx\\axt@qa\\axt@qd\\ifx\\axt@qa\\axt@qc${put(0)}\\else${put(1)}\\fi\\else${put(2)}\\fi\\else${put(2)}\\fi`).join('')
    const again = call ? `\\begingroup${box(i, 7, 'a', `${src}${src}`)}${box(i, 7, 'e', `${src}\\axtpma{q${i}c}${src}`)}\\endgroup\\ifx\\axt@qa\\axt@qe${put(0)}\\else${put(2)}\\fi` : put(0)
    return `${each}${again}${probeRow('punct', i, '\\axt@qo')}\\gdef\\axt@qo{}\\noindent\\par`
  })
  const reset = '\\edef\\axt@qfn{\\ifdefined\\c@footnote\\the\\c@footnote\\else0\\fi}\\def\\axt@qreset{\\ifdefined\\c@footnote\\global\\c@footnote=\\axt@qfn\\relax\\fi\\ifdefined\\citereset\\citereset\\fi}'
  return `\\begingroup\\newbox\\axt@qbox\\gdef\\axt@qo{}${reset}${tests.join('\n')}\\endgroup`
}
// ---- what a paper's macro sets: TeX asked
/** the distinct sources of the paper's macros the ink section asks about, at most */
export const INK_MAX = 64
/** a macro's source as the ink section asks about it, at most */
const INK_SRC_MAX = 200
/**
 * The ink section's samples: the source of each of the paper's macros (classOf 'macro'), once, in the order the paper
 * writes them, that TeX can set in a box of its own (no comment or parameter sign, no \verb, its braces balanced, no
 * environment, no paragraph's end), at most INK_MAX. A symbol the layout draws as text (TEXT_SYMBOLS) is not asked
 */
export function inkSamples(units) {
  const seen = new Set()
  for (const u of units) for (const p of u.pieces) {
    if (seen.size >= INK_MAX) return [...seen]
    if (p.t !== 'ph' || classOf(p) !== 'macro' || seen.has(p.src) || symbolText(p.src) !== null) continue
    const src = p.src ?? ''
    if (!src || src.length > INK_SRC_MAX || /[%#]|\\(?:verb|lstinline|begin|end|par)(?![A-Za-z@])/.test(src) || !balanced(src)) continue
    seen.add(src)
  }
  return [...seen]
}
const balanced = s => { let d = 0; for (let i = 0; i < s.length; i++) { if (s[i] === '\\') { i++; continue } if (s[i] === '{') d++; else if (s[i] === '}' && --d < 0) return false } return d === 0 }
/**
 * The ink section of the probe (`ink`): each sample set in a box of its own, in a group, and the box shown in the log
 * (\showbox, every node: TeX's own list of what it set), between a row `ink-at <i>` and a row `ink-end <i>`; an empty
 * paragraph after each starts TeX's error count again. Writes nothing, ships out nothing (readInkProbe)
 */
export function inkSection(samples) {
  const show = '\\begingroup\\showboxbreadth=100000 \\showboxdepth=100000 \\tracingonline=0 \\showbox\\axt@ibox\\endgroup'
  const tests = samples.map((src, i) => `${probeRow('ink-at', i)}\\begingroup\\global\\setbox\\axt@ibox\\box\\voidb@x\\setbox\\axt@ibox\\hbox{${src}}${show}\\endgroup${probeRow('ink-end', i)}\\noindent\\par`)
  return `\\begingroup\\newbox\\axt@ibox${tests.join('\n')}\\endgroup`
}
/** the probe document of the layout marks: its punctuation section, then its ink section */
export const markProbeTex = (samples, ink = []) => probeTex([punctuationSection(samples), ...(ink.length ? [inkSection(ink)] : [])])
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

// ---- what a paper's symbol sets: LaTeX's own
/**
 * LaTeX's text symbols (the kernel's and textcomp's commands, as LaTeX defines them in every encoding), each the one
 * character it sets: the layout draws one the marking cannot mark (glued to the word before it, at a unit's head) as
 * text, where arXiv's page shows that character on the unit's line (make.mjs). The prototype's texToText, for text
 */
export const TEXT_SYMBOLS = Object.freeze({
  '\\%': '%', '\\&': '&', '\\#': '#', '\\$': '$', '\\_': '_', '\\{': '{', '\\}': '}',
  '\\textbackslash': '\\', '\\textless': '<', '\\textgreater': '>', '\\textbar': '|', '\\textasciitilde': '~', '\\textasciicircum': '^',
  '\\textunderscore': '_', '\\textdollar': '$', '\\textbraceleft': '{', '\\textbraceright': '}',
  '\\S': '\u00a7', '\\P': '\u00b6', '\\textsection': '\u00a7', '\\textparagraph': '\u00b6', '\\dag': '\u2020', '\\ddag': '\u2021',
  '\\textdagger': '\u2020', '\\textdaggerdbl': '\u2021', '\\copyright': '\u00a9', '\\textcopyright': '\u00a9', '\\textregistered': '\u00ae',
  '\\texttrademark': '\u2122', '\\pounds': '\u00a3', '\\textsterling': '\u00a3', '\\textdegree': '\u00b0', '\\textbullet': '\u2022',
  '\\textperiodcentered': '\u00b7', '\\ldots': '\u2026', '\\dots': '\u2026', '\\textellipsis': '\u2026', '\\textendash': '\u2013', '\\textemdash': '\u2014',
})
/** a symbol's text: its source one of TEXT_SYMBOLS, alone or followed by an empty group (`\%{}`, `\dots{}`), else null */
export function symbolText(src) {
  const m = /^(\\(?:[A-Za-z]+|[%&#$_{}]))(?:\{\})?$/.exec(src ?? '')
  return m && Object.hasOwn(TEXT_SYMBOLS, m[1]) ? TEXT_SYMBOLS[m[1]] : null
}
/** a line TeX logs for an error: `! …`, or `<file>:<line>: …` under -file-line-error */
const TEX_ERROR = /^(?:! |[^\s:]+:\d+: )/
/**
 * What TeX answered, from the probe's log: per sample's command, its code a follower (FOLLOWERS), for layoutMarking's
 * `switches`. A box TeX logged an error in (after its `punct-at` row, before the next row) answers nothing: an error in
 * the box as the paper sets it or with `{}` leaves the follower no answer at all (`x`); in the box with its opening mark,
 * no mark (2); in the box with both marks, no closing mark (1); in a second call's, none between (2). A sample with no
 * row (the probe stopped short of it), a row of another schema or another shape is no answer at all. layoutMarking sets
 * no mark where there is no answer
 */
export function readMarkProbe(log, samples) {
  const out = {}, errored = new Map()
  let at = null
  for (const line of (log ?? '').split('\n')) {
    if (TEX_ERROR.test(line)) { if (at) (errored.get(at[0]) ?? errored.set(at[0], new Set()).get(at[0])).add(at[1]); continue }
    const [r] = readProbe(line)
    if (!r || r.schema !== PROBE_SCHEMA) continue
    if (r.tag === 'punct-at' && r.fields.length === 3) { at = [`${r.fields[0]}:${r.fields[1]}`, r.fields[2]]; continue }
    at = null
    if (r.tag !== 'punct' || r.fields.length !== 2) continue
    const i = r.fields[0], s = samples[Number(i)], codes = r.fields[1]
    if (!s || !/^[012]+$/.test(codes) || codes.length !== FOLLOWERS.length) continue
    out[s.command] = [...codes].map((c, j) => {
      const bad = errored.get(`${i}:${j}`)
      if (!bad) return c
      if (bad.has('a') || bad.has('b')) return 'x'
      if (bad.has('d') || bad.has('e')) return '2'
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
export const switchedOf = switches => Object.keys(switches ?? {}).filter(c => /[12x]/.test(switches[c].slice(0, FOLLOWERS.length - 1))).sort()

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
 * - **The points.** Beside each destination, a point (POINTS_TEX): a rendering intent named after it, `/axt-<name> ri`,
 *   in each engine's literal (pdfTeX's and LuaTeX's `direct`, xdvipdfmx's `pdf:code`), which PDF.js keeps in the operator
 *   list in its place among the glyphs (it drops DP and MP, and splits its text items at a BMC: tokens moved by up to
 *   14 pt) and its text layer passes over. So the content stream gives each piece's own ink between its points
 *   (layout/stream.mjs). And around each column's body (\@cclv in \@makecol, repacked to its own height and depth: a
 *   whatsit adds no height, and one last keeps the box's depth; the opening one with a \penalty10000 after it, for a
 *   whatsit before the body's first glue makes it a place to break, and \vsplit — balance.sty's last page — then takes
 *   an empty column; the closing one after the body's last box, its glue, kerns and penalties taken off and put back
 *   after it, so that no place to break is made or lost, and LaTeX's \@outputbox@removebskip still finds a \vfil
 *   last)
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
 *  body and each float's box */
export const POINTS_TEX = [
  '\\ifdefined\\XeTeXrevision\\def\\axt@point#1{\\special{pdf:code /axt-#1 ri}}\\else\\ifdefined\\pdfextension\\def\\axt@point#1{\\pdfextension literal direct{/axt-#1 ri}}\\else\\ifdefined\\pdfliteral\\def\\axt@point#1{\\ifnum\\pdfoutput>0 \\pdfliteral direct{/axt-#1 ri}\\fi}\\else\\def\\axt@point#1{}\\fi\\fi\\fi',
  '\\let\\axt@destonly\\axt@dest\\def\\axt@dest#1{\\axt@destonly{#1}\\axt@point{#1}}',
  '\\gdef\\axt@bn{0}\\def\\axt@bump{\\xdef\\axt@bn{\\the\\numexpr\\axt@bn+1\\relax}}',
  '\\def\\axt@vtake{\\ifcase\\numexpr\\lastnodetype-10\\relax\\or\\expandafter\\axt@vtg\\or\\expandafter\\axt@vtk\\or\\expandafter\\axt@vtp\\fi}\\def\\axt@vtg{\\edef\\axt@vback{\\vskip\\the\\lastskip\\relax\\axt@vback}\\unskip\\axt@vtake}\\def\\axt@vtk{\\edef\\axt@vback{\\kern\\the\\lastkern\\relax\\axt@vback}\\unkern\\axt@vtake}\\def\\axt@vtp{\\edef\\axt@vback{\\penalty\\the\\lastpenalty\\relax\\axt@vback}\\unpenalty\\axt@vtake}',
  '\\ifdefined\\AddToHook\\AddToHook{cmd/@makecol/before}{\\ifvoid\\@cclv\\else\\axt@bump\\begingroup\\boxmaxdepth\\dp\\@cclv\\global\\setbox\\@cclv\\vbox to\\ht\\@cclv{\\axt@point{bs\\axt@bn}\\penalty\\@M\\unvbox\\@cclv\\let\\axt@vback\\@empty\\axt@vtake\\axt@point{be\\axt@bn}\\axt@vback}\\endgroup\\fi}\\fi',
  '\\AtBeginDocument{\\ifdefined\\@endfloatbox\\let\\axt@efb\\@endfloatbox\\def\\@endfloatbox{\\axt@efb\\ifvoid\\@currbox\\else\\axt@bump\\begingroup\\boxmaxdepth\\dp\\@currbox\\global\\setbox\\@currbox\\vbox to\\ht\\@currbox{\\axt@point{fs\\axt@bn}\\unvbox\\@currbox\\axt@point{fe\\axt@bn}}\\endgroup\\fi}\\fi}',
].join('')

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
  POINTS_TEX,
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
 * - none right after a piece that may look ahead (LOOKS_AHEAD), unless TeX answered that a mark there changes nothing
 *   (`switches`: a footnote's call's `word`, or its `call` before another call), and none for a paper's macro glued to
 *   the letters before it, which may be letters of the same word;
 * - as TeX answered for the piece's command and what follows it (`switches`, the paper's own switch: readMarkProbe):
 *   none (a package sets the full stop before a citation against the word before it, where an opening mark would part
 *   them and lose their kern, and looks for it where the closing mark would stand: 2608.23865, up to 0.85 pt), or the
 *   opening mark alone (REVTeX's superscripts take the token after a citation in a \csname), or both;
 * - the opening mark only for a piece that may look ahead (but a footnote's call TeX answered for), and where the
 *   closing one would follow a control sequence (TeX skips the spaces after a control word), white space (a mark there
 *   would stand on the next line, a blank one no paragraph's end any more: 2608.08350's `.\` before one) or an
 *   environment's \end
 */
export function layoutMarking(units, classes, { lines = false, switches = null, inkless = null } = {}) {
  const on = new Set(classes)
  /** a paper's macro TeX said sets no ink (readInkProbe): no mark, as an invisible placeholder has none */
  const none = new Set(inkless ?? [])
  /** what TeX answered for a piece's command before what follows it: a code of readMarkProbe's ('x' no answer: no mark
   *  as '2'); with `switches` and no answer for an asked class's command, '2' too — no mark where TeX did not say one
   *  is safe (the re-review's m4); with no `switches` at all (the probe not run), undefined: the marks as before */
  const answer = (p, next) => {
    if (!switches) return undefined
    const codes = switches[commandOf(p)]
    if (!codes) return ASKED.has(classOf(p)) ? '2' : undefined
    const code = classOf(next) === 'footnote' && classOf(p) === 'footnote' ? (codes[7] === '0' ? codes[6] : codes[7] === 'x' ? 'x' : '1') : codes[next?.t === 'text' && next.s[0] && PUNCT.includes(next.s[0]) ? PUNCT.indexOf(next.s[0]) : 6]
    return code === 'x' ? '2' : code
  }
  /** whether a piece after one that may look ahead may have its marks: TeX answered so for a footnote's call */
  const free = (after, p) => classOf(after) === 'footnote' && !!switches?.[commandOf(after)] && (classOf(p) === 'footnote' ? switches[commandOf(after)][7] === '0' : switches[commandOf(after)][6] === '0')
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
      const cls = passed && !passed.has(k) && !(LOOKS_AHEAD(after) && !free(after, p)) ? classOf(p) : null
      if (!cls || !on.has(cls) || (cls === 'macro' && none.has(p.src))) return [piece]
      // a paper's macro may set letters: glued to the word before, it is part of it (an accent, \\ss), and a mark would
      // part the word's hyphenation and kerns
      const before = u.pieces[k - 1], next = u.pieces[k + 1]
      if (cls === 'macro' && before?.t === 'text' && WORD_END.test(before.s)) return [piece]
      const said = answer(p, next)
      if (said === '2') return [piece]
      const name = `${cls === 'footnote' ? 'n' : 'p'}${i}.${k}`
      const open = { t: 'ph', src: `\\axtpma{${name}a}` }
      if (said === '1' || (LOOKS_AHEAD(p) && !(cls === 'footnote' && said === '0')) || ENDS_IN_CS.test(p.src) || /\s$/.test(p.src) || ENDS_ENV.test(p.src)) return [open, piece]
      return [open, piece, { t: 'ph', src: `\\axtpm{${name}b}` }]
    })
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
 *  null where no probe ran, and the macros TeX said set no ink (`marking.inkless`) */
export const MARKS_SCHEMA = 3
const ENGINES = ['pdflatex', 'latex', 'xelatex', 'lualatex']
const KEYS = ['schema', 'engine', 'marking', 'pages', 'views', 'columns', 'marks', 'dropped', 'lines', 'words', 'tokens', 'chars', 'owned']
const MARKING_KEYS = ['classes', 'switches', 'inkless']
/** a piece's own ink at most: its glyphs, its rules; and a paper's in all (each 5 values) */
export const GLYPHS_PIECE = 20_000, RULES_PIECE = 2_000, OWNED_ALL = 250_000
/** the distinct characters of the owned glyphs at most, and the code units of one */
const CHARS_MAX = 65_536, CHAR_MAX = 32
/** a glyph's size within (0, SIZE_MAX] */
const SIZE_MAX = 200
/** a piece's opening mark: the name its own ink is kept under */
const OPENING = /^[pn]\d+\.\d+a$/
/** the paper's own switch as the marking takes it (readMarkProbe): null where the probe was not run (every mark as
 *  LAYOUT_TEX sets it), else at most PROBE_MAX commands, each a control word, its answer a code 0, 1, 2 or x (no answer)
 *  a follower; else a refusal at `path` */
function checkSwitches(v, path) {
  if (v === null) return null
  if (!isObject(v)) throw new LayoutRefusal(path, 'not null or an object')
  const keys = Object.keys(v)
  if (keys.length > PROBE_MAX) throw new LayoutRefusal(path, `more than ${PROBE_MAX} commands`)
  for (const k of keys) {
    if (!/^\\[A-Za-z@]{1,63}$/.test(k)) throw new LayoutRefusal(`${path}.${told(k)}`, 'not a control word')
    if (typeof v[k] !== 'string' || v[k].length !== FOLLOWERS.length || !/^[012x]+$/.test(v[k])) throw new LayoutRefusal(`${path}.${told(k)}`, `not ${FOLLOWERS.length} codes of 0, 1, 2 or x`)
  }
  return v
}
/** the macros TeX said set no ink (readInkProbe), as the marking takes them: null where no probe ran, else at most
 *  INK_MAX sources of 1 to INK_SRC_MAX code units, none twice; else a refusal at `path` */
function checkInkless(v, path) {
  if (v === null) return null
  if (!Array.isArray(v) || v.length > INK_MAX) throw new LayoutRefusal(path, `not null or an array of at most ${INK_MAX} sources`)
  const seen = new Set()
  v.forEach((src, i) => {
    if (typeof src !== 'string' || src.length < 1 || src.length > INK_SRC_MAX || seen.has(src)) throw new LayoutRefusal(`${path}[${i}]`, `not a source of 1 to ${INK_SRC_MAX} code units, once`)
    seen.add(src)
  })
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
 * characters of the text after it in its unit up to the next visible piece, its unit's next marks, and whether a visible
 * piece with no mark follows it with no text between
 */
function followsOf(units, names) {
  const nameOf = (i, k) => { const c = classOf(units[i]?.pieces[k]); return c ? `${c === 'footnote' ? 'n' : 'p'}${i}.${k}` : null }
  return name => {
    const m = /^([pn])(\d+)\.(\d+)a$/.exec(name)
    const i = m ? Number(m[2]) : -1, k = m ? Number(m[3]) : -1, u = units[i]
    if (!u || nameOf(i, k) !== name.slice(0, -1)) return null
    let after = '', q = k + 1
    for (; q < u.pieces.length && !classOf(u.pieces[q]); q++) if (u.pieces[q].t === 'text') after += plainTranslated([u.pieces[q]])
    const want = asSet(after).normalize('NFKC').toLowerCase().replace(/\s/g, '').slice(0, WANT)
    const next = q < u.pieces.length ? nameOf(i, q) : null
    return { closing: names.has(`${name.slice(0, -1)}b`), want, ends: [...(next ? [`${next}a`] : []), ...endsOf(i)], blocked: !!next && !names.has(`${next}a`) }
  }
}

/**
 * The marks file (internal, prep/<mid>/marks-<sha>.json) from a PDF.js document of the marked original and its last
 * TeX pass's log; the caller opens and destroys the document. Every destination MARK_NAME takes, by page (1-based) and
 * place, but one the log reports set twice (`dropped`: TeX kept the first, wherever that was) or off its page's view;
 * each page's view and columns (MARK_DEF's c<n>-<k>); each unit's line count (LINES_TEX's AXT-LINES); the document's
 * text tokens (tokenizeDocument), their words once each; what the marked original was marked with (`marking`: the
 * classes and the paper's own switch it was given to layoutMarking, null where no probe was run: the two mark
 * differently, layoutMarking setting no mark for an asked command TeX did not answer; and the paper's macros TeX said
 * set no ink, `inkless`, null where no probe was run), so that the maker knows which pieces have marks;
 * and, given the paper's `units` and PDF.js's operator codes `OPS`, each marked piece's own ink, read from the marked
 * compile's operator lists by its points (layout/stream.mjs ownedOf): `owned`, by its opening mark's name, how it was
 * found (OWNED_HOW) and, where it was, its glyphs (page, origin, baseline, size, a character of `chars`) and its rules
 * (page and box) in stream order; a piece of more than GLYPHS_PIECE glyphs or RULES_PIECE rules, or past OWNED_ALL in the
 * paper, or with ink off its page, is not owned. A token whose word is the rest of one given in parts (the second line's
 * part of a word cut by a hyphen) is written with word -1, after the token it is the rest of, for a paragraph whose last
 * line holds nothing else holds its end mark (layout/carry.mjs); a token longer than a word may be, or off its page, is
 * left out, and its rests with it. Numbers to a hundredth. What it gives, parseLayoutMarks takes
 */
export async function layoutMarksOf(marked, log, { engine, classes = LAYOUT_CLASSES, switches = null, inkless = null, units = null, OPS = null }) {
  if (!ENGINES.includes(engine)) throw new LayoutRefusal('engine', `not one of ${ENGINES.join(', ')}`)
  const sw = checkSwitches(switches, 'switches'), none = checkInkless(inkless, 'inkless')
  const marking = { classes: [...checkClasses(classes, 'classes')], switches: sw === null ? null : { ...sw }, inkless: none === null ? null : [...none] }
  const pdf = marked
  const pages = checkPages(pdf.numPages, 'pages')
  const views = [], text = [], stream = []
  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p)
    views.push(...page.view.slice(0, 4).map(r2))
    const content = await page.getTextContent()
    text.push({ page: p, items: content.items, styles: content.styles })
    if (units && OPS) stream.push({ ...pageInk(OPS, await page.getOperatorList(), page.commonObjs ?? { get: () => null }, { rotate: page.rotate ?? 0 }), view: page.view.slice(0, 4) })
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
  const dests = await pdf.getDestinations(), set = new Set(dropped)
  for (const [full, d] of dests instanceof Map ? dests : Object.entries(dests ?? {})) {
    if (!full.startsWith('axt-') || !Array.isArray(d)) continue
    const name = full.slice(4)
    if (!MARK_NAME.test(name)) continue
    set.add(name)
    if (twice.has(name)) continue
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
  // kept: whether the token before was written, so that a rest is written only after the word it is the rest of
  let kept = false
  for (const t of tokenizeDocument(text)) {
    const rest = t.t === ''
    if ((rest && !kept) || t.t.length > WORD_MAX) { kept = false; continue }
    const x = r2(t.x), y = r2(t.y), w = r2(t.w), h = r2(t.h)
    if (!inView(views, t.page, x, y) || !(w >= 0 && w <= BOX_MAX) || !(h >= 0 && h <= BOX_MAX)) { kept = false; continue }
    let k = rest ? -1 : wordOf.get(t.t)
    if (k === undefined) {
      if (words.length >= WORDS_MAX) { kept = false; continue }
      k = words.length
      words.push(t.t)
      wordOf.set(t.t, k)
    }
    tokens.push(t.page, x, y, w, h, k)
    kept = true
  }
  // each piece's own ink, by its points in the content stream
  const chars = [], owned = []
  if (units && OPS) {
    const charOf = new Map(), found = ownedOf(stream, { follows: followsOf(units, set), dropped })
    let all = 0
    const ok = (p, x, y) => inView(views, p, r2(x), r2(y))
    for (const name of [...found.keys()].sort()) {
      const e = found.get(name)
      if (e.how >= OWNED) { owned.push([name, e.how]); continue }
      const not = how => { const k = OWNED_HOW.indexOf(how); if (k < OWNED) throw new Error(`no how ${how} of a piece not owned`); owned.push([name, k]) }
      if (e.glyphs.length > GLYPHS_PIECE || e.boxes.length > RULES_PIECE) { not('more glyphs than a piece may own'); continue }
      if (all + e.glyphs.length + e.boxes.length > OWNED_ALL) { not('past the glyphs a paper may own'); continue }
      const gs = e.glyphs.map(([p, g]) => [p, stream[p - 1].glyphs[g]]), bs = e.boxes.map(([p, b]) => [p, stream[p - 1].boxes.slice(4 * b, 4 * b + 4)])
      if (gs.some(([p, g]) => !ok(p, g.x0, g.y) || !(r2(g.size) > 0 && g.size <= SIZE_MAX)) || bs.some(([p, b]) => !ok(p, b[0], b[1]) || !ok(p, b[2], b[3]))) { not('ink out of bounds'); continue }
      all += gs.length + bs.length
      const row = [name, e.how, gs.length]
      for (const [p, g] of gs) {
        let u = g.u.length > CHAR_MAX ? g.u.slice(0, /[\ud800-\udbff]/.test(g.u[CHAR_MAX - 1]) ? CHAR_MAX - 1 : CHAR_MAX) : g.u
        let c = charOf.get(u)
        if (c === undefined) {
          // the last place of `chars` kept for '', every character past it written so: the parser takes CHARS_MAX at
          // most (the 6b review's Minor 1: the 65,537th was pushed as '' past it)
          if (chars.length >= CHARS_MAX - 1 && !charOf.has('')) { charOf.set('', chars.length); chars.push('') }
          if (chars.length >= CHARS_MAX) u = ''
          c = charOf.get(u) ?? chars.length
          if (c === chars.length) { chars.push(u); charOf.set(u, c) }
        }
        row.push(p, r2(g.x0), r2(g.y), r2(g.size), c)
      }
      for (const [p, b] of bs) row.push(p, r2(b[0]), r2(b[1]), r2(b[2]), r2(b[3]))
      owned.push(row)
    }
  }
  return fitted({ schema: MARKS_SCHEMA, engine, marking, pages, views, columns, marks, dropped, lines, words, tokens, chars, owned })
}

/**
 * The marks file within what its own parser takes: past MARKS_CAP's bytes or MARKS_VALUES' values (OWNED_ALL's 250,000
 * glyphs beside the rest of a paper large enough to reach it), each owned piece from the last written as not owned
 * ('past the glyphs a paper may own') until it fits, so that a paper loses the own ink of its last pieces, never its
 * whole layer (the 6b review's Minor 1). The writer writes nothing the parser refuses
 */
function fitted(m) {
  const text = encodeLayoutMarks(m)
  let bytes = new TextEncoder().encode(text).length, values = countValues(text)
  if (bytes <= MARKS_CAP && values <= MARKS_VALUES) return m
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
  const { schema, engine, marking, pages, views, columns, marks, dropped, lines, words, tokens, chars, owned } = m
  return JSON.stringify({
    schema, engine, marking: { classes: marking.classes, switches: marking.switches, inkless: marking.inkless }, pages, views: views.map(r2), columns, marks: marks.map(([n, p, x, y]) => [n, p, r2(x), r2(y)]), dropped, lines, words,
    tokens: tokens.map((v, i) => (i % 6 === 0 || i % 6 === 5 ? v : r2(v))), chars,
    owned: owned.map(ownedRow),
  })
}
/** an owned row as written: a glyph's page and character, a rule's page, as they are; its coordinates to a hundredth */
const ownedRow = e => e.map((v, j) => (j < 3 || (j - 3) % 5 === 0 || (j < 3 + 5 * e[2] && (j - 3) % 5 === 4) ? v : r2(v)))

/** bytes, then values and nesting, then JSON.parse, then every bound; throws LayoutRefusal, naming where */
export function parseLayoutMarks(bytes) {
  const m = checkKeys(boundedJson(bytes, { cap: MARKS_CAP, values: MARKS_VALUES, depth: MARKS_DEPTH }), KEYS, '')
  if (m.schema !== MARKS_SCHEMA) throw new LayoutRefusal('schema', `not ${MARKS_SCHEMA}`)
  if (!ENGINES.includes(m.engine)) throw new LayoutRefusal('engine', `not one of ${ENGINES.join(', ')}`)
  const marking = checkKeys(m.marking, MARKING_KEYS, 'marking')
  checkClasses(marking.classes, 'marking.classes')
  checkSwitches(marking.switches, 'marking.switches')
  checkInkless(marking.inkless, 'marking.inkless')
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
  return m
}
