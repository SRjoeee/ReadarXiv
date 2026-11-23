// The part of this module that stays in the old engine: what the moved front half never calls. The rest moved into the engine
// package (packages/engine/src/marks/marks.ts); this path imports it back and re-exports its names through its transition path. The cut-over
// deletes this file.
import { lastTexLog } from '../source/latex-front.mjs'
import { tokenAtMark, tokenizeDocument } from '../pipeline/anchors.mjs'
import { DISPLAY } from '../translate/mt.mjs'
import { readLines } from '../pipeline/typeset/tex.mjs'
import { annotsOf, linkKindOf, MAX_GLYPHS, MAX_LINKS, readAnnots } from '../layer-proto/links.mjs'
import { BOXES_PAGE, GLYPHS_PAGE, packGlyphs, pageInk } from '@readarxiv/engine'
import { listOf, orNull } from './oplist.mjs'
import { isMemoryError } from '@readarxiv/engine'
import { NAME_ENGLISH, NAME_KEYS } from './names.mjs'
import { boundedJson, checkKeys, checkPages, checkViews, COORD_MAX, countValues, inView, isInteger, isNumber, isObject, LayoutRefusal, told } from './json.mjs'
import { OWNED, OWNED_HOW, ownedPages, STREAM_COLUMNS } from './stream.mjs'
import { MARK_CLASSES, LAYOUT_CLASSES, classOf, FOLLOWERS, PUNCT, ASKED, PROBE_MAX, COMPLETE_PROBE_MAX, COMPLETE_SRC_MAX, AHEAD_PROBE_MAX, commandOf, INK_BUDGET, INK_TEXT_MAX, INK_ANY, PUNCT_WIDE, BP_PER_PT, readColours, MARK_NAME, COMPLETE_MAX, duplicatesIn, followsOf, headsOf } from '@readarxiv/engine/today/marks/marks.ts'
export { MARK_CLASSES, LAYOUT_CLASSES, INVISIBLE, backrefPiece, RULE, classOf, FOLLOWERS, PROBE_MAX, COMPLETE_PROBE_MAX, AHEAD_PROBE_MAX, aheadKey, commandOf, probeSamples, aheadSamples, probeRow, probeTex, readProbe, punctuationSection, aheadSection, INK_BUDGET, inkSamples, readInkAnswers, leadSamples, inkSection, markProbeTex, readInkProbe, INK_TEXT_MAX, INK_ANY, readInkTexts, readInkDecorated, leadStep, readInkApart, NAME_MACROS, nameSection, readNameProbe, skipSection, readSkipProbe, literalNames, readMarkProbe, POINTS_TEX, NAMES_TEX, CLASS_NAMES, classNamesTex, UNMARK_CS, NAME_MARK_FILE, withoutNameMarks, regionsTex, LAYOUT_TEX, refKeyOf, refKeysOf, refsTex, DVI_POINTS_TEX, CALL_TEX, DVI_LAYOUT_TEX, readColours, MARK_NAME, colourPieceOf, completeCall, headEnd, layoutMarking, COMPLETE_MAX, completeCalled, duplicatesIn, asSet, followsOf, headsOf } from '@readarxiv/engine/today/marks/marks.ts'

/** a displayed formula's source: the wire's (mt.mjs), whose own stop it writes after the display's marker */
export { DISPLAY }
/** each name's English value (names.mjs): what a style that writes a name literally writes (literalNames) */
export { NAME_ENGLISH }
/** the most a skip may be, TeX's \maxdimen in big points, which \offinterlineskip sets \lineskiplimit to, as the file
 *  writes it (to a hundredth: 16322.79, over the exact 16322.7895 by the rounding), so that a value read is read back */
const SKIP_MAX = Math.round(16384 * BP_PER_PT * 100) / 100

// ---- what a paper's symbol sets: LaTeX's own
// LaTeX's text symbols (TEXT_SYMBOLS, each the one character it sets), the one table the layer reads too
// (rules/text-symbols.mjs): the layout draws one the marking cannot mark (glued to the word before it, at a unit's head) as
// text, where arXiv's page shows that character on the unit's line (make.mjs); symbolText, a symbol's text
export { symbolText, TEXT_SYMBOLS } from '../rules/text-symbols.mjs'
/** the commands of the asked classes a paper writes: those an answer is looked for (layoutMarking sets none for one TeX
 *  did not answer) */
export function askedCommands(units) {
  const out = new Set()
  for (const u of units) for (const p of u.pieces) { const cmd = commandOf(p); if (cmd && ASKED.has(classOf(p))) out.add(cmd) }
  return out
}
/** the commands whose marks TeX's answers take off anywhere but between two calls: the paper's own switch, on */
export const switchedOf = switches => Object.keys(switches ?? {}).filter(c => /^\\[A-Za-z@]+$/.test(c) && /[12x]/.test(switches[c].slice(0, FOLLOWERS.length - 1))).sort()

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
 * on one line, \centerline, a table's cell) tells nothing of its alignment, and has no entry; nor has one with no line (a
 * cell's own lines, `AXT-ALIGN t<i>`, and its column's class, AXT-CELL, are passed over: the engine's readAlign reads them). A
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
 *  mark), which a reader of 13 refuses; 15 every distinct call of the paper's macros asked of the ink section where their code
 *  units fit INK_BUDGET (no count, no length of one), so that `marking.inkless`, `marking.apart` and `marking.texts` name more
 *  than INK_ANSWERS_MAX sources or one past 200 code units, which a reader of 14 refuses */
export const MARKS_SCHEMA = 15
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
/** the macros TeX said set no ink (readInkProbe), as the marking takes them, or whose box it began apart (readInkApart): null
 *  where no probe ran, else sources of the ink section's, none twice, their code units INK_BUDGET at most in all; else a refusal
 *  at `path` */
function checkInkless(v, path) {
  if (v === null) return null
  if (!Array.isArray(v)) throw new LayoutRefusal(path, 'not null or an array of sources')
  const seen = new Set()
  let units = 0
  v.forEach((src, i) => {
    if (typeof src !== 'string' || src.length < 1 || seen.has(src) || (units += src.length) > INK_BUDGET) throw new LayoutRefusal(`${path}[${i}]`, `not a source, once, within ${INK_BUDGET} code units in all`)
    seen.add(src)
  })
  return v
}
/** a text readInkTexts gives: letters, digits, the punctuation a text font sets as ASCII's and INK_ANY, one character spelled at
 *  least */
const INK_TEXT = new RegExp(`^(?=.*[^${INK_ANY}])[A-Za-z0-9${PUNCT_WIDE.replace(/[\\\]^-]/g, '\\$&')}${INK_ANY}]+$`, 'u')
/** the placeholders' texts the probe showed (readInkTexts), as the maker takes them: null where no probe ran, else a flat
 *  list of pairs (the file nests no deeper: MARKS_DEPTH), each a source of the ink section's, none twice, their code units
 *  INK_BUDGET at most in all, then its text of 1 to INK_TEXT_MAX code units (INK_TEXT); else a refusal at `path` */
function checkTexts(v, path) {
  if (v === null) return null
  if (!Array.isArray(v) || v.length % 2 !== 0) throw new LayoutRefusal(path, 'not null or a list of pairs')
  const seen = new Set()
  let units = 0
  for (let i = 0; i < v.length; i += 2) {
    const src = v[i], text = v[i + 1]
    if (typeof src !== 'string' || src.length < 1 || seen.has(src) || (units += src.length) > INK_BUDGET) throw new LayoutRefusal(`${path}[${i}]`, `not a source, once, within ${INK_BUDGET} code units in all`)
    if (typeof text !== 'string' || !INK_TEXT.test(text) || text.length > INK_TEXT_MAX) throw new LayoutRefusal(`${path}[${i + 1}]`, `not 1 to ${INK_TEXT_MAX} letters, digits, ASCII's punctuation or a formula's glyphs, one spelled`)
    seen.add(src)
  }
  return v
}
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
 *   null where they could not be read), dark (null, or why the page's ink was not read: 'unread', its operator list failed (it is
 *   waited for however long it takes: oplist.mjs listOf); 'capped', past OPS_CAP, GLYPHS_PAGE or a guard of
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
  // their annotations read first, each page's however long it takes (a page whose read fails could not be read), and kept until
  // its page is read: what the paper's links are is a function of them alone, so it is told with the head (`links`: their count
  // and their destinations' names, or null where the paper has none: a page's could not be read, held more than MAX_LINKS, or
  // all were past LINKS_MAX), for a reader that takes the pages as they come (the page stream's maker) to know it before any page
  const annotsAt = new Map()
  let linkCount = 0, noLinks = false
  const linkDests = new Set()
  for (const q of [...linkPages].sort((a, b) => a - b)) {
    let page = null
    try { page = await pdf.getPage(q) } catch (e) { if (isMemoryError(e)) throw e }
    const raw = page ? await orNull(() => readAnnots(page)) : null
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
  const follows = units ? followsOf(units, set, marking.texts, marking.inkless) : null
  const stream = units && OPS ? ownedPages({ follows, dropped, heads: headsOf(units, set), closing: name => destPage.get(`${name.slice(0, -1)}b`) ?? null }) : null
  let all = 0, found = []
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
      // however long it takes, one that fails that page alone (oplist.mjs listOf); a page past a bound of pageInk's own (`capped`),
      // or read with its boxes past BOXES_PAGE merged (`degraded`: a piece's rule there would be left out of its
      // own ink, unseen), is unread: no ink, so that no piece on it is owned (each LOST to the maker, `dark` says why), and no
      // glyph under its links
      // (its annotations as the head read them, let go here)
      const raw = linkPages.has(p) ? annotsAt.get(p) ?? null : []
      annotsAt.delete(p)
      const ops = await listOf(page)
      const got = ops ? pageInk(OPS, ops, page.commonObjs ?? { get: () => null }, { rotate: page.rotate ?? 0, glyphsMax: GLYPHS_PAGE, boxesMax: BOXES_PAGE }) : null
      if (!ops) dark = 'unread'
      else if (got.capped) dark = 'capped'
      else if (got.degraded) dark = 'degraded'
      const { glyphs, boxes, points, boxAt, paras = [] } = dark ? { glyphs: [], boxes: [], points: [], boxAt: [] } : got
      // (and its paragraphs' points, where a display a unit opens with begins: stream.mjs headInk)
      ink = { glyphs: packGlyphs(glyphs, { columns: STREAM_COLUMNS }), boxes, points, boxAt: Int32Array.from(boxAt), view: page.view.slice(0, 4), paras }
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
 * - `dark`: the pages whose ink was not read (markedPages' `dark`): `unread`, their operator list failed;
 *   `capped`, past OPS_CAP's operations or GLYPHS_PAGE's glyphs. No piece on them is owned; the marks file says nothing of
 *   them (its keys are exact), the run's stats do.
 * `marked` a PDF.js document of the marked original, `log` its last pass's log; the options are layoutMarksOf's
 */
export async function readMarked(marked, log, o) {
  let head = null, end = null
  const views = [], words = [], tokens = [], rows = new Map(), dark = { unread: [], capped: [], degraded: [] }
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
    const follows = followsOf(o.units, head.set, head.marking?.texts, head.marking?.inkless)
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
