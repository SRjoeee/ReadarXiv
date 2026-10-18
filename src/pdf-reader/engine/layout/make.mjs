// The layout maker (Plan 8b, Task 6; spec §4.2 and §11's amendment of 2026-10-06; the layout research of 2026-10-06):
// a paper's layout file, from the marks file of its layout compile (the marked original with the layout marks, a compile
// of its own: marks.mjs) and arXiv's PDF. The marks are TeX's own places in our compile; the ink is arXiv's, read glyph
// by glyph from its operator lists (ink.mjs); the marks go over to arXiv's PDF by line (carry.mjs), and arXiv's text
// layer locates the units between them (anchors.mjs). Each located unit gets its lines (baseline, size and font from the
// glyphs), its frames (its lines by page and column, each with its share of the source and the room below it), the
// rectangles that erase it, each placeholder's rendering by its source piece index k, and its label (a heading's number,
// an item's mark, a caption's "Figure 1:", a footnote's mark). A placeholder's rendering is its own ink: the glyphs and
// rules the marked compile's content stream shows between its points (layout/stream.mjs, kept in the marks file), each
// carried and matched on arXiv's page (layout/match.mjs); found where every one is matched, or, a reference or a citation
// whose own words our compile set otherwise (cleveref's "Appendix C" where arXiv's set "Section C"), by its link annotations
// paired with arXiv's by destination (the link-anchor locator, phOf's `linked`), EMPTY where its points hold nothing, else
// LOST; a display group's later displays, which TeX gives no point, JOINED to its first, which owns the
// group's ink; a LOST piece outside the unit's lines (before its start mark, a display after its end mark) OUTSIDE; a
// citation's or a reference's own text with it, for the layer to set in the page's face. What
// cannot be placed is left out, and the layer leaves that unit as the original's: a line of the marked original not
// carried (a reflow of the layout compile costs only its own lines), a unit on a page whose ink is not whole (its
// operator list too long, too slow, its walk too deep or too long, or its carry over its bound), a placeholder whose own
// ink is not all found. The file is refused where too few lines are carried, where arXiv's page count is out of bounds,
// and where its own parser refuses it: a file the parser refuses is never returned.
// Arithmetic alone once the PDF is read: the same marks file and PDF give the same bytes, but for a page that passes a
// clock, its operator list not given within OPS_MS (`stats.timedOut`) or its ink's walk past its backstop (ink.mjs INK_MS,
// `stats.inkTimedOut`). No real page comes near either (the walk's own bound is counted, STEPS_MAX), and a page past one is
// dark, its units the original's: a slower machine may show a hostile page untranslated where a faster one reads it.
import { anchorUnits, boundsFromMarks, frameOfTokens, markWords, pageFrame, pageIndex, tokenAtMark, tokens } from '../pipeline/anchors.mjs'
import { rangedAnchors } from '../pipeline/left-part.mjs'
import { readArxivText } from './arxiv.mjs'
import { displayEdges, plainSource, shown as shownText, unitText } from '../translate/mt.mjs'
import { carrier as carrierFor, carrierOf, tokensOfMarks } from './carry.mjs'
import { encodeLayout, indexLayout, isPageText, LAYOUT, LAYOUT_SCHEMA, layoutPartRows, LayoutRefusal, MIXED_FILL, NAME_FLAG, NAME_KEYS, PAGE_TEXT_KINDS, parseLayout, PH_FLAG, PH_KINDS, UNIT_FLAG, UNIT_KINDS } from './file.mjs'
import { BOXES_PAGE, GLYPHS_PAGE, NO_FILL, packGlyphs, pageInk } from './ink.mjs'
import { listWithin, OPS_MS, within } from './oplist.mjs'
import { pagePlanOf } from './addon.mjs'
import { isMemoryError } from '../pipeline/memory.mjs'
import { drawDataOf } from '../pipeline/draw-data.mjs'
import { DRAW_HELD_MAX } from '../layer-proto/draw.mjs'
import { alignOf } from './remove.mjs'
import { asSet, classOf, colourPieceOf, destRect, followsOf, headEnd, layoutMarking, LINKS_MAX, linkablePiece, markAt, symbolText, vetoTwice } from './marks.mjs'
import { matcherOf } from './match.mjs'
import { OWNED, OWNED_HOW } from './stream.mjs'
import { annotsOf, linkKindOf, MAX_LINKS, readAnnots } from '../layer-proto/links.mjs'

/** the how of a later display of a display group (stream.mjs): its ink is the group's first display's */
const IN_GROUP = OWNED_HOW.indexOf('in the display before it')
/** an ownership whose two points were both read (stream.mjs): the one in which nothing between them is no ink */
const CLOSED = OWNED_HOW.indexOf('closed')

/** the share of the marked original's lines carried, at least, for a file (the researched papers carry 97.5–99.4 %) */
export const CARRY_MIN = 0.9
/** a page's operator list waited for at most (oplist.mjs OPS_MS: past it the page has no ink, that page alone) */
export { OPS_MS }
const PAGES_MAX = 10_000, COORD_MAX = 14_400
/** units TeX sets away from where the source has them (anchors.mjs `floating`) */
const FLOATING = new Set(['caption', 'footnote', 'cell', 'figure'])
/** a line's body glyphs: within this share of its median size */
const BODY = 0.15
/** a glyph on a line, scripts included: its baseline within this of the line's (and a placeholder's of its mark's) */
const SCRIPT = size => 0.6 * Math.max(size, 5) + 1.5
/** a glyph glued to a line's first or last word (a bracket, a stop, a hyphen), within this share of the line's size,
 *  is the line's: the text layer's words hold letters and digits alone */
const GLUE = 0.2
/** a label's glyphs: each within this many ems of the next, the last of the unit's start mark */
const LABEL_EM = 2
/** the room below a frame with nothing under it: down to the page view's foot and this */
const FOOT = 36
/** erase rectangles: merged within this share of their size, at most ERASE_MAX a line (the closest pair first) */
const MERGE = 0.5, ERASE_MAX = 16
/** an equation's number, within an em of its column's edge */
const NUMBER = /^\((?:[A-Z]?\d+(?:[.\-]\d+)*[a-z]?|[ivxl]+)\)$/
/** a line's band, by its glyphs' own ink: their centres between BAND_DOWN em below its baseline and BAND_UP above (a
 *  subscript's ink is centred near the baseline, a superscript's 0.6 em above it) */
const BAND_DOWN = 0.45, BAND_UP = 0.95
/** a row of glyphs smaller than this share of a line's, its baseline within their script window of the line's, is a
 *  script of that line */
const SCRIPT_SIZE = 0.85
/** a placeholder's ink raised or lowered: its baseline this share of its line's size off the line's */
const SHIFT = 0.2
/** a centred unit where TeX does not tell its alignment: every line's centre within CENTRE of its column's; a centred name's line
 *  shorter than SHORT of its column */
const CENTRE = 2, SHORT = 0.9
/** a one-line paragraph TeX set justified, centred by its own glue: off both edges of its column by more than INSET ems */
const INSET = 2
/** segments a placeholder may have: an inline one, a display */
const SEGS_INLINE = 4, SEGS_DISPLAY = 64
/** what a label reads as (the prototype's layer2.js LABEL): a mark of one to three digits or signs, an item's number or
 *  letter, a float's or a theorem's name and number */
const LABEL = /^(?:[\d*\u2217\u2020\u2021\u00a7\u00b6\u2022\u25e6\u25aa\u2013\u00b7]{1,3}|\(?[a-z0-9ivx]{1,4}[.)]|(?:Figure|Fig\.|FIGURE|FIG\.|Table|TABLE|Algorithm|ALGORITHM|Listing|Theorem|Lemma|Definition|Proposition|Corollary|Remark|Example|Assumption)[\dIVXL]+(?:\.\d+)?[a-z]?[.:]?)$/
/** a part of an inline placeholder's line (rowOfPart): its main glyphs those within PART_MAIN of its largest size;
 *  one sits on a line within PART_ON of the line's size of its baseline; with none on one, the line within PART_NEAR of
 *  their middle baseline */
const PART_MAIN = 0.85, PART_ON = 0.2, PART_NEAR = 0.6
/** an inline placeholder's glyphs in stream order are parts, one a line: a new part where arXiv's next glyph stands on
 *  another page, back left by BREAK_X and down by BREAK_Y (a line's end), up by more than BREAK_UP of its size or
 *  BREAK_FAR across (the next column); each part on the unit's line its own baseline stands on, the nearest within
 *  INK_OFF of the line's size (a limit, a raised big operator, a fraction's numerator stay with their line's part) */
const BREAK_X = 20, BREAK_Y = 4, BREAK_UP = 3, BREAK_FAR = 150, INK_OFF = 2.5
/** a part of a piece TeX broke over lines, on the line after its part before: its baseline below that one's by half
 *  their size to WRAP of it (a line's pitch is 1.2 of its size in a cell, a note or a column alike: 2609.26457's Table 3) */
const WRAP = 2.5
/** a space in a page text where two glyphs stand this share of their size apart (PDF.js's text layer, TRACKING_SPACE) */
const TEXT_SPACE = 0.102
/** the link-anchor locator (phOf's last tier: a reference or a citation the matcher did not find, its links paired with
 *  arXiv's): a piece's links at most; the word before its first link at most PREFIX_EM of its size wide (the corpus's widest
 *  reference word, "proposition", is 5.8 em: both PDFs of the 25 papers of the drift study, 2026-10-17) and at most GAP_EM
 *  from it; the characters after its last link at most SUFFIX_MAX */
const LINKS_PIECE = 8, PREFIX_EM = 6, GAP_EM = 1.2, SUFFIX_MAX = 8
/** a piece's glyph the matcher would find: a glyph of its character on arXiv's page within NEAR_X across and NEAR_Y up or
 *  down of where it is carried (the matcher's first glyph is looked for within 8 pt, the next at its neighbour's offset) */
const NEAR_X = 12, NEAR_Y = 3
/** the words a reference's name prints before its number (cleveref's default names, hyperref's \autoref's, the theorem
 *  names papers give them, and their abbreviations), case folded: the word arXiv's PDF sets where ours sets another
 *  ("Section C" for our "Appendix C") is one of them, or the piece stays LOST */
const VOCAB = new Set(('section sections sec. secs. subsection subsections subsubsection paragraph chapter chapters ch. chap. part parts '
  + 'appendix appendices app. apps. appx. figure figures fig. figs. subfigure table tables tab. tabs. equation equations eq. eqs. eqn. eqns. '
  + 'theorem theorems thm. thms. lemma lemmas lem. corollary corollaries cor. proposition propositions prop. definition definitions def. defn. '
  + 'example examples ex. remark remarks rem. algorithm algorithms alg. algs. line lines listing listings item items footnote footnotes page pages '
  + 'claim claims conjecture conjectures assumption assumptions step steps').split(' '))
const PAGE_TEXT = new Set(PAGE_TEXT_KINDS)
const LINES_UNIT = 2000, PIECES_MAX = 10_000, SIZE_MAX = 200, SRC_MAX = 4000, FONTS_MAX = 512, FONT_MAX = 128
/** a box covering most of a page (a background, a frame round it) is no ink below a frame */
const PAGE_BOX = 0.95
const KIND = new Map(UNIT_KINDS.map((k, i) => [k, i]))
const PH_KIND = new Map(PH_KINDS.map((k, i) => [k, i]))
const LABEL_OF = { heading: 0, caption: 2, footnote: 3 }
/** a glyph a babel name's occurrence holds (`owner`): no unit's, no label's, no head's */
const NAME_OWNER = -3
/** a name's occurrence (marks.mjs NAMES_TEX): its start mark, its occurrence number and its key */
const NAME_START = /^n(\d+)\.([a-z]+)\.s$/
/** a name's text as it is compared: letters and digits, folded */
const letters = s => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const EVEN = new Set(['para', 'abstract', 'theorem'])
/** the page stream's rules (E2b design §0: a rule of the whole run reads the whole document), each rule's values, the whole
 *  run's first: `frame` the pages' frame the anchors are placed under ('units': pageFrame of the located units; 'tokens':
 *  anchors.mjs frameOfTokens, arXiv's text alone, rule 1); `edges` the columns' text edges a page without its own takes ('all':
 *  those of every page like it; 'earlier': of the pages before it and its own alone, rule 3); `columns` the left side's far-push
 *  columns (the page pass's: 'units' pageColumns, 'tokens' columnsOfTokens, rule 4; the maker reads none); `floatSearch` a
 *  float's search of the whole document where it is not found between its neighbours ('whole': step T's match of it, anywhere;
 *  'forward': from the page of its last body neighbour on, a unit not written inside a float, rule 5: `inFloat` given) */
export const RULES = Object.freeze({ frame: Object.freeze(['units', 'tokens']), edges: Object.freeze(['all', 'earlier']), columns: Object.freeze(['units', 'tokens']), floatSearch: Object.freeze(['whole', 'forward']) })
/** the rules where none is given (P2, the coordinator's ruling of 2026-10-17): rules 1, 3 and 4, the page stream's, for every
 *  paper; rule 5 off (no accuracy rule: E2b's rule-5 note). The first part is told about three times sooner (3.3 s at arXiv's
 *  page 12 against 10.9 s on 2106.10165, 4.2 s at page 5 against 13.2 s on 2310.20360) for a whole job longer on those books:
 *  +2.1 % and +7.6 % with the draw off, +15.8 % and +23.9 % with it, the page pass's default (docs/PDF-READER.md §19.6) */
export const DEFAULT_RULES = Object.freeze({ frame: 'tokens', edges: 'earlier', columns: 'tokens', floatSearch: 'whole' })
/** the whole run's rules, each reading the whole document: next's before the page stream (c77550a1), which the lab's comparisons
 *  with it take */
export const WHOLE_RULES = Object.freeze({ frame: 'units', edges: 'all', columns: 'units', floatSearch: 'whole' })
/** a rule set checked, each rule DEFAULT_RULES' where it is not given */
export function rulesOf(rules = null) {
  if (rules !== null && (typeof rules !== 'object' || Array.isArray(rules))) throw new TypeError('rules: an object of the page stream\'s rules')
  const out = {}
  for (const k of Object.keys(rules ?? {})) if (!Object.hasOwn(RULES, k)) throw new TypeError(`rules.${k}: no rule of the page stream's`)
  for (const [k, values] of Object.entries(RULES)) {
    const v = rules?.[k] ?? DEFAULT_RULES[k]
    if (!values.includes(v)) throw new TypeError(`rules.${k}: ${String(v)} is none of ${values.join(', ')}`)
    out[k] = v
  }
  return out
}

const r2 = v => Math.round(v * 100) / 100
/** a number to a hundredth as the marks file writes it (marks.mjs: -0 written 0) */
const r2z = v => Math.round(v * 100) / 100 + 0
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1] }

/** a font's PostScript name as the file holds it: 1 to 128 printable ASCII characters, each other one a '?', cut at
 *  128; an empty name '?'. A name the PDF gives in other bytes, or a longer one, never gets the file refused */
export function fontName(name) {
  const s = typeof name === 'string' ? name : ''
  let out = ''
  for (let i = 0; i < s.length && out.length < FONT_MAX; i++) {
    const c = s.charCodeAt(i)
    out += c >= 0x20 && c <= 0x7e ? s[i] : '?'
  }
  return out || '?'
}

/** a page's view, x0 y0 x1 y1, as the file may hold it, or null */
function viewOf(v) {
  if (!v || !(v.length >= 4)) return null
  const [x0, y0, x1, y1] = [v[0], v[1], v[2], v[3]].map(r2)
  return [x0, y0, x1, y1].every(n => Number.isFinite(n) && Math.abs(n) <= COORD_MAX) && x0 < x1 && y0 < y1 ? [x0, y0, x1, y1] : null
}

/** a page's glyphs by baseline, rising, packed (ink.mjs packGlyphs: x0, x1, y, top, bottom, size, font, u; ix0 and ix1
 *  their ink across with their advance; top and bottom their own ink up and down), each glyph's owner and whether it is
 *  taken, and its boxes, each whether it is taken: a degraded page's merged boxes (from ink.mjs pageInk's `mergedAt`) are
 *  taken from the start, no rule's own box, so that no placeholder and no line takes one as its rule (its placeholder is
 *  LOST, its line's rule kept as the page's), while the room below a frame meets them as any ink */
function glyphsOf(got, fontIds) {
  const order = got.glyphs.map((_, i) => i).sort((a, b) => {
    const p = got.glyphs[a], q = got.glyphs[b]
    return p.y - q.y || p.x0 - q.x0 || a - b
  })
  const P = { ...packGlyphs(got.glyphs, { order, fontIds }), owner: new Int32Array(order.length).fill(-1), taken: new Uint8Array(order.length), boxes: [], boxTaken: new Uint8Array(got.boxes.length >> 2) }
  for (let i = 0; i + 3 < got.boxes.length; i += 4) P.boxes.push([got.boxes[i], got.boxes[i + 1], got.boxes[i + 2], got.boxes[i + 3]])
  if (Number.isInteger(got.mergedAt)) P.boxTaken.fill(1, got.mergedAt)
  // (read with the remover's indices: what the add-on's plan reads of the page besides, kept beside the maker's columns, so
  // that the page's one operator list gives both: each glyph's place in the stream, its showing operation and its place
  // there, whether it is blank, its own ink across as read; each box's path)
  if (got.paths) {
    const n = order.length, stream = new Int32Array(n), on = new Int32Array(n), at = new Int32Array(n), blank = new Uint8Array(n), rix0 = new Float64Array(n), rix1 = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const g = got.glyphs[order[i]]
      stream[i] = order[i]; on[i] = g.n; at[i] = g.k; blank[i] = g.blank ? 1 : 0; rix0[i] = g.ix0; rix1[i] = g.ix1
    }
    P.plan = { stream, on, at, blank, rix0, rix1, paths: Int32Array.from(got.paths), shows: got.shows }
  }
  return P
}

/** a page's ink as the add-on's plan reads it (pageInk with `indices`), made again of the maker's columns and the plan's
 *  (glyphsOf): its glyphs in stream order, each with what the plan reads of it, its boxes, paths and showing operations */
function planInkOf(P) {
  const { stream, on, at, blank, rix0, rix1, paths, shows } = P.plan, glyphs = new Array(P.n)
  for (let i = 0; i < P.n; i++) {
    const g = { u: P.u[i], x0: P.x0[i], x1: P.x1[i], y: P.y[i], top: P.top[i], bottom: P.bottom[i], size: P.size[i], ix0: rix0[i], ix1: rix1[i], n: on[i], k: at[i] }
    if (blank[i]) g.blank = true
    glyphs[stream[i]] = g
  }
  const boxes = []
  for (const b of P.boxes) boxes.push(b[0], b[1], b[2], b[3])
  return { glyphs, boxes, points: [], boxAt: [], paths: Array.from(paths), shows, capped: false, rotated: false }
}
/** a page's alignment facts (remove.mjs alignOf) packed: each showing operation's codes in one column (null as NaN), where
 *  each begins, and the paths' count; and back */
function packFacts({ codes, paths }) {
  let n = 0
  for (const row of codes) n += row.length
  const all = new Float64Array(n), from = new Int32Array(codes.length + 1)
  let i = 0
  codes.forEach((row, r) => { from[r] = i; for (const c of row) all[i++] = c === null ? Number.NaN : c })
  from[codes.length] = i
  return { all, from, paths }
}
function unpackFacts({ all, from, paths }) {
  const codes = []
  for (let r = 0; r + 1 < from.length; r++) { const row = []; for (let i = from[r]; i < from[r + 1]; i++) row.push(Number.isNaN(all[i]) ? null : all[i]); codes.push(row) }
  return { codes, paths }
}
/** the first index whose baseline is at least y */
function lowest(P, y) {
  let lo = 0, hi = P.n
  while (lo < hi) { const m = (lo + hi) >> 1; if (P.y[m] < y) lo = m + 1; else hi = m }
  return lo
}
/** the glyphs whose baseline lies within [lo, hi] */
function band(P, lo, hi) {
  const out = []
  for (let i = lowest(P, lo); i < P.n && P.y[i] <= hi; i++) out.push(i)
  return out
}
const mid = (P, i) => (P.x0[i] + P.x1[i]) / 2
/** the baseline most of the glyphs' characters share (to a hundredth), the one nearest `near` on a tie */
function baselineOf(P, gs, near) {
  const votes = new Map()
  for (const i of gs) { const y = r2(P.y[i]); votes.set(y, (votes.get(y) ?? 0) + Math.max(1, P.u[i].length)) }
  let best = null, most = -1
  for (const [y, c] of votes) if (c > most || (c === most && Math.abs(y - near) < Math.abs(best - near))) { best = y; most = c }
  return best
}
/** the glyphs within BODY of `size`, or all of them where none is */
const bodyOf = (P, gs, size) => { const b = gs.filter(i => Math.abs(P.size[i] - size) <= BODY * size); return b.length ? b : gs }
const charsOf = s => s.normalize('NFKC').toLowerCase()

/** tokens → line rectangles as anchors.mjs lineRects makes them, each with its tokens */
function rectsOf(doc, idx) {
  const rects = []
  let cur = null
  for (const k of idx) {
    const w = doc[k]
    if (!cur || w.page !== cur.page || Math.abs(w.y - cur.base) > cur.h * 0.5 || w.x + w.w < cur.x0 - cur.h * 30) {
      cur = { page: w.page, x0: w.x, x1: w.x + w.w, y0: w.bottom, y1: w.top, base: w.y, h: w.h, ks: [k] }
      rects.push(cur)
      continue
    }
    cur.x0 = Math.min(cur.x0, w.x); cur.x1 = Math.max(cur.x1, w.x + w.w)
    if (Math.abs(w.y - cur.base) < cur.h * 0.2) { cur.y0 = Math.min(cur.y0, w.bottom); cur.y1 = Math.max(cur.y1, w.top) }
    cur.ks.push(k)
  }
  return rects
}

/**
 * A line of a unit from arXiv's glyphs: its rectangle (rectsOf) gives its page and words; its baseline is the one most of
 * its body glyphs share, its glyphs every one on that baseline's window (scripts too) inside its words' extent and glued
 * to its ends, not left of `from` (the unit's start mark on its first line) nor right of `to` (its end mark on its last),
 * none another unit's. Null where it has no glyph
 */
function lineOf(P, r, from, to, unit) {
  // by its middle: a glyph is the unit's from its start mark on, to its end mark (set after the last glyph)
  const ok = i => (P.owner[i] === -1 || P.owner[i] === unit) && (from === null || mid(P, i) >= from - 0.05) && (to === null || mid(P, i) <= to + 0.05)
  const L = r.x0 - 0.5, R = r.x1 + 0.5
  const first = band(P, Math.min(r.y0, r.y1), Math.max(r.y0, r.y1)).filter(i => mid(P, i) >= L && mid(P, i) <= R && ok(i))
  if (!first.length) return null
  const mains = mainsOf(P, first)
  const size0 = median(mains.map(i => P.size[i]))
  const base = baselineOf(P, bodyOf(P, mains, size0), r.base)
  // by its own ink too: a glyph whose ink is centred off the line's band is no glyph of the line's text, whatever its
  // origin (a big delimiter of another cell's matrix hangs from a baseline by this one's, 1.5 em below it: 1512's
  // table; txexs's in 2307)
  // A line of such glyphs alone (a display's, which the anchor gave the unit) keeps them: it is its unit's, as before
  const onBand = i => { const c = (P.top[i] + P.bottom[i]) / 2; return c >= base - BAND_DOWN * size0 && c <= base + BAND_UP * size0 }
  const window = band(P, base - SCRIPT(P.most), base + SCRIPT(P.most)).filter(i => Math.abs(P.y[i] - base) < SCRIPT(P.size[i]) && (P.owner[i] === -1 || P.owner[i] === unit))
  const all = window.filter(ok)
  const banded = all.filter(onBand)
  const near = banded.some(i => mid(P, i) >= L && mid(P, i) <= R) ? banded : all
  const inside = near.filter(i => mid(P, i) >= L && mid(P, i) <= R)
  if (!inside.length) return null
  let x0 = Infinity, x1 = -Infinity
  for (const i of inside) { x0 = Math.min(x0, P.x0[i]); x1 = Math.max(x1, P.x1[i]) }
  const glue = GLUE * size0, taken = new Set(inside)
  // glued to its ends, or before its end mark (after its start mark) on its last line (its first): TeX set them on the
  // line before the mark, whatever the gap — a formula's scripts the window leaves out part a full stop from the line's
  // last word (1706's "… by 1/√dk.": its k a script too far below the baseline, the stop 5.5 pt past the d)
  const right = near.filter(i => !taken.has(i) && mid(P, i) > R).sort((a, b) => P.x0[a] - P.x0[b] || a - b)
  for (const i of right) { if (P.x0[i] - x1 > glue && to === null) break; taken.add(i); x1 = Math.max(x1, P.x1[i]) }
  // its closing punctuation glued past its end mark: a mark carried past its line's last word stands where the formula
  // before it ends in our compile, which arXiv's may set wider (1706's "… by 1/√dk." left its full stop standing)
  if (to !== null) {
    const after = window.filter(i => !taken.has(i) && mid(P, i) > to + 0.05 && /^[.,;:!?)\]]$/.test(P.u[i])).sort((a, b) => P.x0[a] - P.x0[b] || a - b)
    for (const i of after) { if (P.x0[i] - x1 > glue) break; taken.add(i); x1 = Math.max(x1, P.x1[i]) }
  }
  const left = near.filter(i => !taken.has(i) && mid(P, i) < L).sort((a, b) => P.x1[b] - P.x1[a] || a - b)
  for (const i of left) { if (x0 - P.x1[i] > glue && from === null) break; taken.add(i); x0 = Math.min(x0, P.x0[i]) }
  return rowOf(P, [...taken], r.page, r.ks, base)
}

/**
 * A line's text glyphs: those within PART_MAIN of its largest size, where they are a quarter of its characters or more,
 * else all of them. A line whose formulas set more script glyphs than it has words (1706's "and W^O ∈ R^{hd_v×d_model}.":
 * 7 of 18 at 10 pt, the rest scripts) is the line of its words, by their size and baseline, not of its scripts
 */
function mainsOf(P, gs) {
  let big = 0, all = 0, inBig = 0
  for (const i of gs) if (P.size[i] > big) big = P.size[i]
  const mains = gs.filter(i => P.size[i] >= PART_MAIN * big)
  for (const i of gs) all += Math.max(1, P.u[i].length)
  for (const i of mains) inBig += Math.max(1, P.u[i].length)
  return inBig >= MAINS_SHARE * all ? mains : gs
}
const MAINS_SHARE = 0.25
/** a line from its glyphs: its extent, the baseline most of its body glyphs share (glyphs within BODY of their median
 *  size; `near` breaks a tie), the extremes of its glyphs, their median size and the font most of its characters have */
function rowOf(P, glyphs, page, ks, near) {
  const gl = [...glyphs].sort((a, b) => P.x0[a] - P.x0[b] || P.y[a] - P.y[b] || a - b)
  let x0 = Infinity, x1 = -Infinity, top = -Infinity, bottom = Infinity
  for (const i of gl) { x0 = Math.min(x0, P.x0[i]); x1 = Math.max(x1, P.x1[i]); top = Math.max(top, P.top[i]); bottom = Math.min(bottom, P.bottom[i]) }
  const size = median(mainsOf(P, gl).map(i => P.size[i])), body = bodyOf(P, gl, size)
  const fonts = new Map()
  for (const i of body) fonts.set(P.font[i], (fonts.get(P.font[i]) ?? 0) + Math.max(1, P.u[i].length))
  let font = -1, most = -1
  for (const [f, c] of fonts) if (c > most || (c === most && f < font)) { font = f; most = c }
  return { page, x0, x1, base: baselineOf(P, body, near), top, bottom, size, font, gl, ks }
}

/** a rectangle that the file holds: to a hundredth, within its view, at least a hundredth across and high */
function solid(view, x0, y0, x1, y1) {
  const cx = v => Math.min(view[2], Math.max(view[0], r2(v))), cy = v => Math.min(view[3], Math.max(view[1], r2(v)))
  let a = cx(x0), b = cx(x1), c = cy(y0), d = cy(y1)
  if (b <= a) { if (a + 0.01 <= view[2]) b = r2(a + 0.01); else a = r2(b - 0.01) }
  if (d <= c) { if (c + 0.01 <= view[3]) d = r2(c + 0.01); else c = r2(d - 0.01) }
  return [a, c, b, d]
}

/** the token a mark stands at, as anchors.mjs boundsFromMarks finds it (tokenAtMark) */
const tokenAt = tokenAtMark
/** a footnote's number glued to a word in one PDF and apart in the other: the word with the digits before it (a start
 *  mark's word) or after it (an end mark's) taken off, where a letter remains */
const unglued = (w, start) => { const v = start ? w.replace(/^\d+/, '') : w.replace(/\d+$/, ''); return /\p{L}/u.test(v) ? v : null }
/**
 * The word a carried unit mark is checked against on arXiv's page (boundsFromMarks keeps a mark only where arXiv has its
 * word there): its word in our compile, or arXiv's word at the place where the two differ only by a footnote's number
 * glued to it in one of them (2307.16209's notes on arXiv's PDF: the number set on the line and read with the first
 * word, "1historically", which the text layer gives as that word's rest, of no text)
 */
function sameWord(doc, byPage, c, start, ours) {
  if (typeof ours !== 'string') return ours
  const k = tokenAt(doc, byPage, c, start)
  if (k === null || doc[k].t === ours) return ours
  let head = k
  while (head > 0 && doc[head].t === '') head--
  const theirs = doc[head].t, a = unglued(theirs, start), b = unglued(ours, start)
  return (a !== null && a === ours) || (b !== null && b === theirs) || (a !== null && a === b) ? doc[k].t : ours
}

/** stats before anything is read */
function blank(units) {
  return {
    lines: { carried: 0, total: 0, held: 0 },
    units: { located: 0, total: units.length, byKind: {}, unplaced: 0 },
    ph: { marked: 0, found: 0, empty: 0, lost: 0, joined: 0, outside: 0, byKind: {}, unmarked: 0, symbols: 0, inferred: 0, why: {}, textTaken: 0, owned: 0, matched: 0, unmatched: 0, twice: 0, foreign: 0, shared: 0, texts: 0, heads: [0, 0] },
    match: { same: 0, recoded: 0, loose: 0, vote: 0, rejected: 0, work: 0, over: 0, most: 0 },
    labels: {}, frames: { units: 0, split: 0, lineCountChecked: 0, lineCountEqual: 0 }, baselines: { first: [], last: [] },
    names: { marked: 0, located: 0, runIn: 0, why: {} },
    links: { tried: 0, placed: [], why: {} },
    // (the colour pieces of the units the file holds, and those whose run's fill TeX wrote: marks.mjs readColours)
    colours: { pieces: 0, evaluated: 0 },
    capped: [], timedOut: [], inkTimedOut: [], degraded: [], over: [], bytes: { raw: 0, gzip: 0 }, ms: { text: 0, ops: 0, carry: 0, anchor: 0, rows: 0 },
    // (the page stream's, the marked original read a page at a time: rows found after their unit's own ink was taken, and points
    // read twice after their unit's placeholders were matched; none on a paper read whole)
    late: { rows: 0, vetoes: 0 },
    // (rule 3: the pages and columns whose columns' edges are those of a later page, [page, column, that page])
    edgesAhead: [],
  }
}

/** the file's gzip size, where the platform can tell it (CompressionStream) */
async function gzipSize(bytes) {
  if (typeof CompressionStream === 'undefined') return 0
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
  return (await new Response(stream).arrayBuffer()).byteLength
}

/**
 * A paper's layout file, or why none is made: { file, stats } or { refused, stats }. `units` the paper's (ids their
 * indices); `marks` the marks file of its layout compile; `arxiv` a PDF.js document of arXiv's PDF, which the caller
 * opens and destroys, each of its pages cleaned up once read (page.cleanup: its operator list and images let go), so
 * that a caller that reads its operator lists again pays a parse again (the add-on relies on PDF.js keeping them, and
 * takes a document of its own: addon.mjs); `OPS` PDF.js's operator codes. `text`: arXiv's text as layout/arxiv.mjs
 * readArxivText read it from this document (the prepare's step T, read once for the left and the maker), else read here;
 * `floatMatch`: anchors.mjs floatMatches of its tokens and the units' texts, else each float's is searched here; `frame`: the
 * pages' frame's rule its anchors are placed under (anchors.mjs FrameRule), given; else the rule set's (`rules`, DEFAULT_RULES'
 * where not given: rule 1's frameOfTokens; pageFrame under rules.frame 'units', the whole paper alone: the page stream, which
 * places a range's units alone, needs the whole document's). `plans`:
 * the add-on's plans as well, { file, stats, plans }: each page's (addon.mjs pagePlanOf) of the ink and the alignment
 * facts read here of the page's one operator list, as pagePlansOf makes them of the list read again (null where they
 * fail, `plansFailed` why: the add-on's loss, never the file's). A page whose ink
 * passes GLYPHS_PAGE glyphs is capped (stats.capped), that page alone. `parts`: the file is cut into parts (layer-proto/
 * cut.mjs partCutter), which hold the bounds of what a part holds and the carry's share, each part's: the file is made
 * whatever share of the lines is carried (some), and checked without the bounds a part holds of its own (file.mjs
 * parseLayout `sized`); `lines` in the result, each marked page's lines [carried, total] (carry.mjs pageLines)
 */
export async function makeLayout(o) {
  const m = await makerOf(o)
  if (m.refused) return { refused: m.refused, stats: m.stats }
  for (let p = 1; p <= m.pages; p++) await m.readPage(p)
  return m.whole()
}

/**
 * The maker of a paper's layout file (makeLayout's), its work a page and a unit at a time: `readPage(p)` reads arXiv's page p's
 * ink (pages in order: a font's id is its first appearance's); `carrying()`, the marks carried to arXiv's PDF; `anchoring()`,
 * the units located on arXiv's tokens; then, a unit at a time and pass by pass, `place(i)` (its lines), the names (`nameAt`),
 * `phOf`, `heldOf`, `outsideOf`, `labelOf`, `rowsOf`; `bars()` and `assemble()` the file. `whole()` runs them in their order
 * over every unit. Each pass reads and writes the ink of its own pages alone. `columnEdges`: the columns' text edges (Map
 * `page|column`, `twoCols|parity|column` or `twoCols|column` to [x0, x1]) the names, the displays' numbers and the centred
 * flag read, given; else made of the placed units' body lines once the lines are placed (`columnEdgesOf`, by rules.edges)
 * `draw`: each page's draw geometry too (E-C: pipeline/draw-data.mjs), read right after the page's operator list (its text step T's,
 * `text.draw`, its annotations the page's one read), held as its encoded text until `drawJsonOf(p)` or `drawOf(p)` takes it (once),
 * at most `drawHeldMax` at a time; none for a page the read fails on, a font a host would read
 * differently, or past the budget. It reads no ink and writes none: the layout file is the same bytes with it on or off
 */
export async function makerOf({ units, marks, arxiv, OPS, paper, left, pdfjs, text = null, floatMatch = null, frame: frameGiven = null, plans: wantPlans = false, parts = false, columnEdges = null, check = false, rules: rulesGiven = null, inFloat = null, draw: wantDraw = false, drawHeldMax = DRAW_HELD_MAX }) {
  const rules = rulesOf(rulesGiven)
  // (rule 5: the units written inside a float, the source parse's, no body neighbour of a float's)
  if (rules.floatSearch === 'forward' && !Array.isArray(inFloat)) throw new TypeError('inFloat: the indices of the units written inside a float, for rules.floatSearch \'forward\'')
  const forward = rules.floatSearch === 'forward' ? new Set(inFloat) : null
  const stats = blank(units)
  for (const u of units) { const k = u.kind; stats.units.byKind[k] ??= [0, 0]; stats.units.byKind[k][1]++ }
  const pages = arxiv?.numPages
  if (!Number.isInteger(pages) || pages < 1 || pages > PAGES_MAX) return { refused: 'pages', stats }
  // ---------------------------------------------------------------- arXiv's text, page by page
  const t = now()
  const read = text ?? await readArxivText(arxiv, { draw: wantDraw })
  // (each page's text as its draw reads it, step T's: taken as the page's draw is read, and let go; none where the text was read
  // without it, the draw then reading the page's text itself)
  const drawTexts = wantDraw ? read.draw ?? null : null
  if (read.pages !== pages) throw new TypeError(`arXiv's text is of ${read.pages} pages, its document of ${pages}`)
  const views = [], dark = new Set()
  for (let p = 1; p <= pages; p++) {
    // a page that could not be had has no view; one whose text could not be read keeps its own
    let view = read.views[p - 1] == null ? null : viewOf(read.views[p - 1])
    if (!view) { view = views.length ? views.slice(-4) : [0, 0, 612, 792]; dark.add(p) }
    if (!read.ok[p - 1]) dark.add(p)
    views.push(...view)
  }
  // (the pages whose ink is never read: dark by their text alone; and those whose ink was read, whether or not it is held still)
  const unread = new Set(dark), inked = new Uint8Array(pages + 1)
  const doc = read.tokens
  // the frame's rule given (a whole run's, the oracle's), else the rule set's: rule 1's of arXiv's text, made once; the whole
  // run's (pageFrame) the whole paper's alone, none for the page stream (its ranges are placed from their own units)
  let tokensFrame = null
  const frame = frameGiven ?? (rules.frame === 'tokens' ? () => (tokensFrame ??= frameOfTokens(doc)) : null)
  const viewAt = p => views.slice(4 * (p - 1), 4 * p)
  stats.ms.text = now() - t
  // ---------------------------------------------------------------- arXiv's ink: glyphs and graphics, page by page
  // (`check`: a pass reading a page's ink outside the pages it was given throws, the pages a task in another order may run on
  // being exactly those: `allowed`, null where any page is a pass's)
  let allowed = null
  const pagesInk = new Array(pages + 1).fill(null), facts = new Array(pages + 1).fill(null), names = [], nameId = new Map()
  const ink = check ? new Proxy(pagesInk, {
    get(target, key, receiver) {
      if (allowed !== null && typeof key === 'string' && /^\d+$/.test(key) && !allowed.has(Number(key))) throw new RangeError(`a pass read page ${key}'s ink, outside its pages`)
      return Reflect.get(target, key, receiver)
    },
  }) : pagesInk
  const fontIds = raw => { const n = fontName(raw); if (!nameId.has(n)) { nameId.set(n, names.length); names.push(n) } return nameId.get(n) }
  const seen = { warned: false }
  // ---------------------------------------------------------------- the links, the link-anchor locator's (phOf)
  // Our compile's (the marks file's `links`: the pages a placeholder that names a link has a point on, document order) by page,
  // and arXiv's, read only on the pages the locator may pair a link on (`wanted`, made once the marks are carried: prepareWanted, judge)
  // and only where ours has any (theirLinks: undefined not asked, null not known, else its Link annotations that name a
  // destination, in PDF.js's order). Each link is paired by its order within its unit, both sides' (phOf's `linked`), so a
  // page's links are read for that page's units alone: PDF.js reads a page's annotations at a cost of its own
  // (the marks of a marked original read a page at a time hold no link yet: the paper's count and destinations are its head's,
  // marks.mjs marksOfHead, and each page's links are taken as it is read: takeLinks)
  const ourLinks = marks.links ?? [], linking = ourLinks.length > 0 || (marks.linkCount ?? 0) > 0
  const familyOf = d => { const at = d.indexOf('.'); return at > 0 ? d.slice(0, at) : d }
  const ourOnPage = new Map(), ourDests = new Set(marks.linkDests ?? [])
  ourLinks.forEach((L, j) => { ourDests.add(L[0]); (ourOnPage.get(L[1]) ?? ourOnPage.set(L[1], []).get(L[1])).push(j) })
  /** a marked page's links (markedPages' page `links`), taken after those of the pages before it: the marks file's order */
  const takeLinks = rows => { for (const L of rows ?? []) { const j = ourLinks.length; ourLinks.push(L); ourDests.add(L[0]); (ourOnPage.get(L[1]) ?? ourOnPage.set(L[1], []).get(L[1])).push(j) } }
  const theirLinks = new Array(pages + 1)
  let wanted = null
  /** the pages whose ink readPage has read, so far */
  const readSoFar = new Set()
  /** a page's Link annotations that name a destination, as the locator reads them: null where not read, or past MAX_LINKS;
   *  each one ours would hold (marks.mjs destRect, the one rule of both sides' order), so that an order is read over the same
   *  links in both PDFs */
  const theirsOf = (raw, p) => {
    if (!Array.isArray(raw)) return null
    const ls = raw.filter(a => a?.subtype === 'Link')
    if (ls.length > MAX_LINKS) return null
    return ls.filter(a => destRect(a) !== null).map(a => ({ page: p, dest: a.dest, raw: { subtype: 'Link', rect: [...a.rect], dest: a.dest, ...(a.quadPoints ? { quadPoints: Array.from(a.quadPoints) } : {}) } }))
  }
  /** page p's links read, once (readAnnots never rejects; one not answered within OPS_MS is not known, nor a page not had): those
   *  its draw's read held (heldTheirs), else read here */
  async function readTheirs(p) {
    if (!linking || theirLinks[p] !== undefined) return
    theirLinks[p] = null
    if (unread.has(p)) return
    if (heldTheirs.has(p)) { theirLinks[p] = heldTheirs.get(p); dropHeld(p); return }
    let page = null
    try { page = await arxiv.getPage(p) } catch (e) { if (isMemoryError(e)) throw e }
    if (page) theirLinks[p] = theirsOf(await within(readAnnots(page), OPS_MS), p)
  }
  /** page p's ink, read once, its time spent on the paper's `ms.ops` */
  async function readPage(p) {
    const t0 = now()
    await inkOf(p)
    readSoFar.add(p)
    // (the pieces whose pages are read judged, and the links of the pages wanted so far read: here once the marks are carried
    // first, the page stream's order; else by the passes' start, whole() and byTasks(), the same pages)
    if (pending) {
      judge(p)
      for (const q of [...wanted].sort((a, b) => a - b)) if (q <= p) await readTheirs(q)
    }
    stats.ms.ops += now() - t0
  }
  // A page's annotations are read once (PDF.js reads them anew at each ask, at a cost of their own): where its draw is read
  // (gatherDraw) with the draw, and what the locator takes of them (theirsOf) held for readTheirs until it reads that page's
  // links or no unit may want them (dropUnwanted, the passes' start), at most LINKS_MAX links (past it a page's are asked
  // again where wanted: a paper of that many is refused by our side's own bound)
  const annotsAsked = new Map(), heldTheirs = new Map()
  let heldLinks = 0
  const annotsOnce = (p, page) => { let a = annotsAsked.get(p); if (!a) { a = within(readAnnots(page), OPS_MS); annotsAsked.set(p, a) } return a }
  const holdTheirs = (p, rows) => { const k = rows ? rows.length : 0; if (heldLinks + k > LINKS_MAX) return; heldTheirs.set(p, rows); heldLinks += k }
  const dropHeld = p => { if (!heldTheirs.has(p)) return; const rows = heldTheirs.get(p); heldTheirs.delete(p); heldLinks -= rows ? rows.length : 0 }
  /** page p's draw geometry (pipeline/draw-data.mjs), held as its encoded text for the left part that will carry it (`drawOf`); none for
   *  a page past the held budget, one that cannot be read, or one whose font a host would read differently: the browser reads it */
  const draws = new Map(), drawStats = { pages: 0, none: 0, why: {}, bytes: 0, ms: 0 }
  let drawHeld = 0
  async function gatherDraw(p, page, tx) {
    const t0 = now()
    let r = null, timer
    try {
      r = await Promise.race([drawDataOf(page, () => annotsOnce(p, page), tx), new Promise(resolve => { timer = setTimeout(() => resolve({ draw: null, why: 'time' }), OPS_MS) })])
    } catch (e) {
      if (isMemoryError(e)) throw e
      r = { draw: null, why: 'read' }
    } finally { clearTimeout(timer) }
    drawStats.ms += now() - t0
    let why = r.why
    if (r.draw !== null) {
      // (in its encoded bytes, as the left part holds it)
      const text = r.text, bytes = r.bytes
      if (drawHeld + bytes > drawHeldMax) why = 'held'
      else { draws.set(p, { text, bytes }); drawHeld += bytes; drawStats.pages++; drawStats.bytes += bytes }
    }
    if (why !== null) { drawStats.none++; drawStats.why[why] = (drawStats.why[why] ?? 0) + 1 }
  }
  /** page p's draw as its JSON, once (wireText's, checked: what the left part holds, format.mjs writeLeftPart `drawText`; the held
   *  text is let go with it): null for none */
  const drawJsonOf = p => {
    const e = draws.get(p)
    if (e === undefined) return null
    draws.delete(p)
    drawHeld -= e.bytes
    return e.text
  }
  /** page p's draw, once: null for none */
  const drawOf = p => { const text = drawJsonOf(p); return text === null ? null : JSON.parse(text) }
  async function inkOf(p) {
    const tx = drawTexts ? drawTexts[p - 1] ?? null : null
    if (drawTexts) drawTexts[p - 1] = null
    if (unread.has(p)) return
    // (the page its text was read from: PDF.js keeps each page's proxy; a memory-class failure is no dark page, C8.4)
    let page = null
    try { page = await arxiv.getPage(p) } catch (e) { if (isMemoryError(e)) throw e }
    if (!page) { dark.add(p); return }
    // (within OPS_MS, else given up on and let go: that page alone, oplist.mjs)
    const ops = await listWithin(page, seen)
    if (!ops) { stats.timedOut.push(p); dark.add(p); return }
    // the page's draw geometry (E-C), read once its fonts are loaded, within the same limit, before the page is let go
    if (wantDraw) {
      await gatherDraw(p, page, tx)
      const asked = annotsAsked.get(p)
      annotsAsked.delete(p)
      if (asked && linking && theirLinks[p] === undefined) holdTheirs(p, theirsOf(await asked, p))
    }
    const got = pageInk(OPS, ops, page.commonObjs ?? { get: () => null }, { rotate: page.rotate ?? 0, indices: wantPlans, glyphsMax: GLYPHS_PAGE, boxesMax: BOXES_PAGE })
    // (the add-on's alignment facts read of the same list, before it is let go: `plans`)
    if (wantPlans && !got.capped && !got.timedOut && !got.rotated) facts[p] = packFacts(alignOf(OPS, ops))
    // its operator list and decoded images let go once its ink is read, so that PDF.js holds them for one page at a time,
    // not every page's to the document's end (48 MiB on 2303.18223's 144 pages; an image a late decode brings is dropped
    // with them). Nothing here reads a page's list again, and the callers destroy the document after the maker (the
    // add-on's plans are made of what was read here where `plans` asks, else of a document of its own: addon.mjs)
    page.cleanup?.()
    // (each page once, by what befell it: past a cap, past the walk's backstop (apart from a list that never came), or
    // read with its boxes past BOXES_PAGE merged by cell, its ink kept: its text is whole, ink.mjs pageInk)
    if (got.capped) stats.capped.push(p)
    else if (got.timedOut) stats.inkTimedOut.push(p)
    else if (got.degraded) stats.degraded.push(p)
    // a page whose ink is not whole has no ink: its units stay the original's, never erased in part
    if (got.capped || got.timedOut || got.rotated) { dark.add(p); return }
    ink[p] = glyphsOf(got, fontIds)
    inked[p] = 1
  }

  const texts = units.map((u, i) => ({ id: i, ...unitText(u.pieces), ...displayEdges(u) }))
  /** a line's column: 0 or 1 on a page of two columns, 2 for a line across both, 0 on a page of one */
  const twoCols = p => marks.columns[p - 1] === 2
  const middle = p => { const v = viewAt(p); return (v[0] + v[2]) / 2 }
  const columnOf = (p, x0, x1) => (!twoCols(p) ? 0 : x0 < middle(p) - 4 && x1 > middle(p) + 4 ? 2 : (x0 + x1) / 2 >= middle(p) ? 1 : 0)
  /** a column's x range on its page: its side of the page, or the page */
  const sideOf = (p, col) => { const v = viewAt(p); return !twoCols(p) || col === 2 ? [v[0], v[2]] : col === 1 ? [middle(p), v[2]] : [v[0], middle(p)] }
  /** two of a unit's rows one line: on one page and in one column, on one baseline, or the smaller a script of the other */
  const oneLine = (o, r) => {
    if (o.page !== r.page || columnOf(o.page, o.x0, o.x1) !== columnOf(r.page, r.x0, r.x1)) return false
    if (Math.abs(o.base - r.base) < 0.5 * Math.max(o.size, r.size)) return true
    const [small, big] = o.size < r.size ? [o, r] : [r, o]
    return small.size < SCRIPT_SIZE * big.size && Math.abs(small.base - big.base) < SCRIPT(small.size) && small.x0 < big.x1 + big.size && small.x1 > big.x0 - big.size
  }

  // ---------------------------------------------------------------- the marks carried to arXiv's PDF by line
  let at = null, ours = null, carrier = null, dropped = null, carry = null, markOf = null, anchorMarkOf = null, besideOf = null, matcher = null
  /** a draft image frame (graphicx's draft, g<n>a, g<n>b, g<n>t: no line of the paper's) whose start mark is `n` (at `a`): its
   *  box, [page, x0, y0, x1, y1], or null */
  const frameAt = (n, a) => {
    const g = /^g(\d+)a$/.exec(n)
    const b = g && at.get(`g${g[1]}b`), top = g && at.get(`g${g[1]}t`)
    return b && top && b.page === a.page && top.page === a.page ? [a.page, Math.min(a.x, b.x) - 1, Math.min(a.y, top.y) - 1, Math.max(a.x, b.x, top.x) + 1, Math.max(a.y, top.y) + 1] : null
  }
  const drawnOf = frames => tk => !frames.some(([p, x0, y0, x1, y1]) => tk.page === p && tk.x + tk.w / 2 >= x0 && tk.x + tk.w / 2 <= x1 && tk.y >= y0 && tk.y <= y1)
  /** the share of the marked original's lines carried: the file refused ('carry') where it is too small, else null */
  const shareOf = () => {
    const L = carrier.lines
    stats.lines.total = L.total
    stats.lines.carried = L.same + L.moved + L.respaced + L.fuzzy
    // (for parts, the share is the cut's verdict on each part's pages: `parts`)
    return L.total > 0 && (parts || stats.lines.carried >= CARRY_MIN * L.total) ? null : 'carry'
  }
  /** a marked page the carrier is over its bound on (carry.mjs `over`): no ink of arXiv's page of its number */
  const overFrom = from => { for (const p of carrier.over.slice(from)) { stats.over.push(p); if (p >= 1 && p <= pages) dark.add(p) } }
  /** the marks carried to arXiv's PDF by line: null, or 'carry' where too few of the marked original's lines are */
  function carrying() {
    const t = now()
    at = new Map(marks.marks.map(([n, page, x, y]) => [n, { page, x, y }]))
    const frames = []
    for (const [n, a] of at) { const f = frameAt(n, a); if (f) frames.push(f) }
    ours = tokensOfMarks(marks).filter(drawnOf(frames))
    carrier = carrierOf(ours, doc)
    overFrom(0)
    const refused = shareOf()
    stats.ms.carry = now() - t
    if (refused) return refused
    carryOver()
    // (the pages whose links the link-anchor locator may read: of the marks, their carrier and arXiv's ink alone)
    prepareWanted()
    return null
  }
  /** the carry's functions over the marks as they stand (`at`, `carrier`: the whole marked original's, or what of it is read) */
  function carryOver() {
    /** a position of the marked original on arXiv's PDF: carried by its line, on a page with ink, within its view */
    carry = (page, x, y) => {
      const c = carrier.carry(page, x, y)
      if (!c || !Number.isInteger(c.page) || c.page < 1 || c.page > pages || dark.has(c.page) || !inked[c.page]) return null
      const v = viewAt(c.page)
      return c.x >= v[0] - 1 && c.x <= v[2] + 1 && c.y >= v[1] - 1 && c.y <= v[3] + 1 ? c : null
    }
    dropped = new Set(marks.dropped)
    markOf = name => { const m = dropped.has(name) ? null : at.get(name); return m ? carry(m.page, m.x, m.y) : null }
    /** a unit's own mark as the anchors take it. The rule today: carried as every mark is, so none onto a page whose ink is not
     *  whole (past OPS_CAP, given up on, rotated, past the carry's bound): such a page drops its units' marks before anchoring,
     *  and moves the anchors (the page stream's design, Appendix A Q2). A page-local rule would carry them regardless and leave
     *  a dark page's units to the rows' own check (a unit with a line on a dark page is not placed): this function alone */
    anchorMarkOf = markOf
    /** a mark the carrier does not place (past its line's last word), on the line of its partner, which moved whole: by
     *  the partner's offset */
    besideOf = (partner, carried, name) => {
      const p = at.get(partner), m = dropped.has(name) ? null : at.get(name)
      if (!carried?.whole || !p || !m || p.page !== m.page || Math.abs(p.y - m.y) > 0.01) return null
      const x = m.x + carried.x - p.x, y = m.y + carried.y - p.y, v = viewAt(carried.page)
      return x >= v[0] - 1 && x <= v[2] + 1 && y >= v[1] - 1 && y <= v[3] + 1 ? { page: carried.page, x, y, whole: true } : null
    }
    matcher = matcherOf({ ink, carry })
  }

  // ---------------------------------------------------------------- the units located on arXiv's tokens
  let unitMarks = null, nameOf = null, carriedUnit = null, unplaced = null, linesTeX = null, alignTeX = null, anchors = null
  /** each unit's colour rows, [unit, k, 0xRRGGBB] by k rising (the marks file's `colours`: the fill TeX set each colour piece's
   *  run in), the file's `colours` for the units it holds */
  let coloursBy = null
  const coloursOf = list => { const by = new Map(); for (const r of list ?? []) (by.get(r[0]) ?? by.set(r[0], []).get(r[0])).push(r); return by }
  /** a unit's colour pieces counted, and those with a row (stats.colours) */
  const countColours = i => { for (const p of units[i]?.pieces ?? []) if (colourPieceOf(p)) stats.colours.pieces++; stats.colours.evaluated += coloursBy.get(i)?.length ?? 0 }
  /** the unit start marks by page: [key, mark, place], the place the key's first name's in the marks' order (the order the
   *  unit marks are met in), for the unit a babel name leads (leadAt) */
  let startsOn = new Map()
  const startOn = (k, m, pos) => (startsOn.get(m.page) ?? startsOn.set(m.page, []).get(m.page)).push([k, m, pos])
  const colAt = m => columnOf(m.page, m.x, m.x)
  /** the unit a babel name whose end mark is `b` leads: the first unit start after it on its line, in its column (the other
   *  column's first line may share its baseline), in our compile; of two at one place, the first in the marks' order */
  const leadAt = b => {
    let lead = -1, leadX = Infinity, leadPos = Infinity
    for (const [k, m, pos] of startsOn.get(b.page) ?? []) if (Math.abs(m.y - b.y) <= 0.5 && m.x >= b.x - 0.05 && colAt(m) === colAt(b) && (m.x < leadX || (m.x === leadX && pos < leadPos))) { lead = Number(k.slice(0, -1)); leadX = m.x; leadPos = pos }
    return lead
  }
  /** the units' own marks carried, and the units located on arXiv's tokens under them */
  function anchoring() {
    const t = now()
    unitMarks = new Map(); nameOf = new Map(); startsOn = new Map()
    const first = new Map()
    let pos = 0
    for (const [n, m] of at) {
      const r = /^[th]?(\d+)([se])$/.exec(n)
      if (r && Number(r[1]) < units.length) { const k = `${Number(r[1])}${r[2]}`; if (!first.has(k)) first.set(k, pos); unitMarks.set(k, m); nameOf.set(k, n) }
      pos++
    }
    for (const [k, m] of unitMarks) if (k.endsWith('s')) startOn(k, m, first.get(k))
    carriedUnit = new Map()
    const byPage = new Map(), withWords = markWords(ours, unitMarks), raw = new Map()
    doc.forEach((t, k) => (byPage.get(t.page) ?? byPage.set(t.page, []).get(t.page)).push(k))
    for (const [k] of withWords) raw.set(k, anchorMarkOf(nameOf.get(k)))
    // a unit's mark past its line's last word in the marks file (a heading in small capitals, whose words' rests the
    // file keeps no box of), on the line of its other mark: by that one's offset
    for (const [k] of withWords) {
      if (raw.get(k)) continue
      const other = `${k.slice(0, -1)}${k.endsWith('s') ? 'e' : 's'}`
      if (nameOf.has(other)) raw.set(k, besideOf(nameOf.get(other), raw.get(other), nameOf.get(k)))
    }
    for (const [k, m] of withWords) {
      const c = raw.get(k)
      if (c) carriedUnit.set(k, { page: c.page, x: c.x, y: c.y, t: sameWord(doc, byPage, c, k.endsWith('s'), m.t) })
    }
    const bounds = boundsFromMarks(doc, carriedUnit)
    // a unit whose own marks were set but not carried (its lines reflowed, or set otherwise on arXiv's), or not on the same
    // words there, stays the original's: arXiv's text alone would place it, maybe wrongly
    unplaced = new Set()
    for (let i = 0; i < units.length; i++) {
      const own = [`${i}s`, `${i}e`].filter(k => unitMarks.has(k))
      if (own.length && (own.some(k => !carriedUnit.has(k)) || (own.length === 2 && !bounds.has(String(i))))) unplaced.add(i)
    }
    linesTeX = new Map(marks.lines); alignTeX = new Map(marks.align ?? []); coloursBy = coloursOf(marks.colours)
    anchors = anchorUnits(doc, texts, { bounds, floating: id => FLOATING.has(units[id]?.kind ?? ''), floatMatch, frame: frame ?? pageFrame, forward })
    stats.ms.anchor = now() - t
  }

  // ---------------------------------------------------------------- each located unit's lines
  const placed = [], placedById = new Map()
  /** each unit placed, as it is (the page stream's rule 3 edges, which take its body lines a page at a time) */
  let onPlaced = null
  /** unit i's lines, of the ink of its anchor's pages, its glyphs taken there (`owner`); none where it has none */
  function place(i) {
    const u = units[i], a = anchors.get(i)
    if (a && unplaced.has(i)) stats.units.unplaced++
    if (!a || unplaced.has(i) || !KIND.has(u.kind) || u.pieces.length > PIECES_MAX) return
    const rects = rectsOf(doc, a.tokens)
    if (!rects.length || rects.length !== a.rects.length || rects.length > LINES_UNIT || rects.some(r => dark.has(r.page) || !inked[r.page])) return
    const S = carriedUnit.get(`${i}s`), E = carriedUnit.get(`${i}e`)
    const onRect = (m, r) => m && m.page === r.page && Math.abs(m.y - r.base) < 0.5 * r.h
    const rows = []
    for (let j = 0; j < rects.length; j++) {
      const r = rects[j]
      const from = j === 0 && onRect(S, r) ? S.x : null, to = j === rects.length - 1 && onRect(E, r) ? E.x : null
      const row = lineOf(ink[r.page], r, from, to, i)
      if (!row || !(r2(row.size) > 0 && row.size <= SIZE_MAX)) { rows.length = 0; break }
      rows.push(row)
    }
    if (!rows.length) return
    // the anchor's rectangles of one line (its tokens out of order: a script before its base, the line's two parts
    // either side of a formula, 1706.03762's note): one line, wherever the second begins
    // again over the merged rows until none is left to merge: a row may match one only once another merge has made it
    for (let merged = true; merged;) {
      merged = false
      for (let j = 1; j < rows.length; j++) {
        const r = rows[j]
        const q = rows.findIndex((o, n) => n < j && oneLine(o, r))
        if (q < 0) continue
        const o = rows[q]
        rows[q] = rowOf(ink[r.page], new Set([...o.gl, ...r.gl]), r.page, [...o.ks, ...r.ks], o.base)
        rows.splice(j--, 1)
        merged = true
      }
    }
    for (const row of rows) for (const g of row.gl) ink[row.page].owner[g] = i
    const one = { id: i, u, a, rows, S, E }
    placed.push(one)
    onPlaced?.(one)
    placedById.set(i, one)
  }
  // each column's text edges, the most common start and end of the body's lines (its own page's, else those of the
  // pages like it: the same columns, the same side of a spread, then the same columns; under rule 3, of those pages the ones
  // before it and its own alone, written under its own name: `<page><<key>`; and a page to which those give none in any column
  // (a cover page, before the body's lines) those of the pools as they stand with the first later page that gives it some:
  // `<page>><column>`, the page waiting for that one, `stats.edgesAhead` [page, column, that page])
  let edges = columnEdges
  const noteIn = seen => (key, x0, x1) => { const e = seen.get(key) ?? seen.set(key, { x0: new Map(), x1: new Map() }).get(key); const a = Math.round(x0), b = Math.round(x1); e.x0.set(a, (e.x0.get(a) ?? 0) + 1); e.x1.set(b, (e.x1.get(b) ?? 0) + 1) }
  const modeOf = (m, low) => { let best = null, most = 1; for (const [x, n] of m) if (n > most || (n === most && best !== null && (low ? x < best : x > best))) { best = x; most = n } return best }
  const edgeOf = e => { const x0 = modeOf(e.x0, true), x1 = modeOf(e.x1, false); return x0 !== null && x1 !== null && x0 < x1 ? [x0, x1] : null }
  const pooled = [p => `${twoCols(p)}|${p % 2}`, p => `${twoCols(p)}`]
  /**
   * Rule 3's edges a page at a time, into `out`: `page(p, lines)` with page p's body lines ([column, x0, x1], the placed units'
   * of EVEN kinds), pages in order: its own edges, its pools as they stand with it, and the cover pages': a page to which its
   * own and its pools give no edges in any column waits for the first later page whose pools give it some, then takes the pools
   * as they stand there in every column. `waiting()` the cover pages still to take theirs
   */
  function earlierEdges(out) {
    const seen = new Map(), note = noteIn(seen)
    const poolOf = (p, c) => { for (const k of pooled) { const e = seen.get(`${k(p)}|${c}`), v = e ? edgeOf(e) : null; if (v) return v } return null }
    let cover = []
    return {
      page(p, lines) {
        for (const [c, x0, x1] of lines) {
          note(`${p}|${c}`, x0, x1)
          for (const k of pooled) note(`${k(p)}|${c}`, x0, x1)
        }
        // (a cover page takes the pools as they stand with the first page that gives it some)
        if (cover.length && lines.length) cover = cover.filter(q => {
          const vs = [0, 1, 2].map(c => poolOf(q, c))
          if (vs.every(v => !v)) return true
          vs.forEach((v, c) => { if (v) { out.set(`${q}>${c}`, v); stats.edgesAhead.push([q, c, p]) } })
          return false
        })
        // (the pools as they stand with page p: page p's, each a page its pages before it and its own give)
        let any = false
        for (const c of [0, 1, 2]) for (const k of pooled) { const key = `${k(p)}|${c}`, e = seen.get(key), v = e ? edgeOf(e) : null; if (v) { out.set(`${p}<${key}`, v); any = true } }
        for (const c of [0, 1, 2]) { const e = seen.get(`${p}|${c}`), v = e ? edgeOf(e) : null; if (v) { out.set(`${p}|${c}`, v); any = true } }
        if (!any) cover.push(p)
      },
      waiting: () => cover,
    }
  }
  /** a placed unit's body lines as rule 3's edges read them: [column, x0, x1] by page */
  const bodyLinesOf = one => EVEN.has(one.u.kind) ? one.rows.map(r => [r.page, columnOf(r.page, r.x0, r.x1), r.x0, r.x1]) : []
  /** the columns' text edges of the placed units' body lines (`columnEdges` where none is given) */
  function columnEdgesOf() {
    edges = new Map()
    const seen = new Map(), note = noteIn(seen)
    if (rules.edges === 'earlier') {
      const on = new Map()
      for (const one of placed) for (const [p, ...line] of bodyLinesOf(one)) (on.get(p) ?? on.set(p, []).get(p)).push(line)
      const E = earlierEdges(edges)
      for (let p = 1; p <= pages; p++) E.page(p, on.get(p) ?? [])
      return
    }
    for (const { u, rows } of placed) {
      if (!EVEN.has(u.kind)) continue
      for (const r of rows) {
        const c = columnOf(r.page, r.x0, r.x1)
        for (const key of [`${r.page}|${c}`, ...pooled.map(k => `${k(r.page)}|${c}`)]) note(key, r.x0, r.x1)
      }
    }
    for (const [key, e] of seen) { const v = edgeOf(e); if (v) edges.set(key, v) }
  }
  const edgesBy = rules.edges === 'earlier'
    ? (p, c) => edges.get(`${p}|${c}`) ?? edges.get(`${p}<${twoCols(p)}|${p % 2}|${c}`) ?? edges.get(`${p}<${twoCols(p)}|${c}`) ?? edges.get(`${p}>${c}`) ?? null
    : (p, c) => edges.get(`${p}|${c}`) ?? edges.get(`${twoCols(p)}|${p % 2}|${c}`) ?? edges.get(`${twoCols(p)}|${c}`) ?? null
  /** a column's text edges; a line across two columns, the left one's start and the right one's end */
  const edgesOf = (p, c) => {
    const e = edgesBy(p, c)
    if (e || c !== 2) return e
    const l = edgesBy(p, 0), r = edgesBy(p, 1)
    return l && r ? [l[0], r[1]] : null
  }
  /** a page of two columns' text block, as a line across both is centred on it: on the middle of the two columns' centres (an
   *  abstract indented on its side moves its column's edges, not its centre: 1810.04805's first page, whose left column's
   *  start its abstract's lines give), as wide as the left one's start to the right one's end; the pool's own where the two
   *  are not both known */
  const blockEdges = p => {
    const l = edgesBy(p, 0), r = edgesBy(p, 1)
    if (!l || !r) return edgesOf(p, 2)
    const mid = (l[0] + l[1] + r[0] + r[1]) / 4, half = (r[1] - l[0]) / 2
    return [mid - half, mid + half]
  }

  // ---------------------------------------------------------------- babel's names, by their two marks
  /**
   * Each occurrence of a babel name TeX set (marks.mjs NAMES_TEX: n<occurrence>.<key>.s and .e), located as a unit is, by
   * its marks carried to arXiv's page and the text between them: both marks carried (a mark past its line's last word on
   * its partner's line by the partner's offset), on one line; the words our compile sets between them (the marks file's
   * tokens), arXiv's text layer between the carried ones, and arXiv's glyphs there that no unit holds, the same letters.
   * Located after the units' lines, which keep what they hold, and before the labels and the heads, which then never
   * take a name's glyphs (2608's abstract label was IEEEtran's "Abstract—"). Its row: its line box from its glyphs, their
   * size and font, centred where a unit is, in capitals where its glyphs' letters all are and its macro's own text is
   * not (the probe's answer: a case change, which the target's name takes too), and its TeX column's text edges (the
   * room it has: edgesOf, the pages like it where its own has no unit; where no page has a body line of its kind of
   * column, its own box: no room past it is known).
   * A name TeX sets right before a unit on that unit's first line (IEEEtran's "Abstract—Task…", amsthm's "Proof. The…")
   * leads it (RUN_IN, the unit in its row): the unit's start mark is the first after the name's end on that line (in its
   * column) in our compile, and carried on that line after the name's carried end on arXiv's page. Its joint, what TeX set between the
   * two (IEEEtran's dash), is the unit's label; its glue, the space after the joint before the unit's text (the unit's
   * carried start less the joint's last advance, none within the carry's 0.05 pt). A figure's or a table's name leading a
   * caption is its label (longtable's, whose captions set no \@captype), the label path's: no row
   */
  const named = []
  const ourWords = (page, x0, x1, y) => ours.filter(t => t.page === page && Math.abs(t.y - y) < 0.5 * t.h && t.x + t.w / 2 >= x0 - 0.5 && t.x + t.w / 2 <= x1 + 0.5).map(t => t.t).join('')
  const theirWords = (page, x0, x1, y) => doc.filter(t => t.page === page && Math.abs(t.y - y) < 0.5 * t.h && t.x + t.w / 2 >= x0 - 0.5 && t.x + t.w / 2 <= x1 + 0.5).map(t => t.t).join('')
  const why = w => { stats.names.why[w] = (stats.names.why[w] ?? 0) + 1 }
  /** the occurrence of a babel name whose start mark is `n` (at `a`), located, or why not (`stats.names.why`) */
  function nameAt(n, a) {
    const x = NAME_START.exec(n), key = x ? NAME_KEYS.indexOf(x[2]) : -1
    if (key < 0) return
    stats.names.marked++
    const e = `n${x[1]}.${x[2]}.e`, b = dropped.has(e) ? null : at.get(e)
    if (dropped.has(n) || !b) { why('a mark not set, or set twice'); return }
    if (b.page !== a.page || Math.abs(b.y - a.y) > 0.5 || b.x <= a.x) { why('not on one line'); return }
    const S0 = markOf(n), E0 = markOf(e)
    const S = S0 ?? besideOf(e, E0, n), E = E0 ?? besideOf(n, S0, e)
    if (!S || !E || S.page !== E.page || Math.abs(S.y - E.y) > 1 || E.x <= S.x) { why('not carried'); return }
    const want = letters(ourWords(a.page, a.x, b.x, a.y))
    if (!want || letters(theirWords(S.page, S.x, E.x, S.y)) !== want) { why("not arXiv's text there"); return }
    const P = ink[S.page]
    const gs = band(P, S.y - SCRIPT(P.most), S.y + SCRIPT(P.most)).filter(g => Math.abs(P.y[g] - S.y) < 0.25 * Math.max(P.size[g], 5) && mid(P, g) >= S.x - 0.05 && mid(P, g) <= E.x + 0.05)
    if (!gs.length || gs.some(g => P.owner[g] !== -1 || P.taken[g])) { why(gs.length ? "its glyphs another's" : 'no glyph'); return }
    if (letters(gs.slice().sort((g, h) => P.x0[g] - P.x0[h] || g - h).map(g => P.u[g]).join('')) !== want) { why("not arXiv's glyphs there"); return }
    const row = rowOf(P, gs, S.page, [], S.y)
    if (!(r2(row.size) > 0 && row.size <= SIZE_MAX)) { why('no size'); return }
    // the unit it leads (leadAt), carried after it on that line
    const lead = leadAt(b)
    let glue = 0
    if (lead >= 0) {
      const L = carriedUnit.get(`${lead}s`)
      if (!L || L.page !== E.page || Math.abs(L.y - E.y) > 1 || L.x < E.x - 0.05 || colAt(L) !== colAt(E)) { why('leading a unit, not carried'); return }
      if ((x[2] === 'figure' || x[2] === 'table') && units[lead].kind === 'caption') { why("a caption's label"); return }
      // its joint's last advance (IEEEtran's dash), else its own end; the glue past it to the unit's text
      let end = E.x
      for (const g of band(P, S.y - SCRIPT(P.most), S.y + SCRIPT(P.most))) if (Math.abs(P.y[g] - S.y) < 0.25 * Math.max(P.size[g], 5) && mid(P, g) > E.x && mid(P, g) < L.x) end = Math.max(end, P.x1[g])
      glue = L.x - end > 0.05 ? L.x - end : 0
    }
    // centred as a unit is (its one line's centre its column's, the line short of it)
    const col = columnOf(S.page, row.x0, row.x1), edge = edgesOf(S.page, col)
    const centred = !!edge && Math.abs((row.x0 + row.x1) / 2 - (edge[0] + edge[1]) / 2) <= CENTRE && row.x1 - row.x0 < SHORT * (edge[1] - edge[0])
    const cased = [...gs.map(g => P.u[g]).join('').normalize('NFKC')].filter(c => c.toUpperCase() !== c.toLowerCase())
    const capitals = cased.length >= 2 && cased.every(c => c === c.toUpperCase()) && marks.marking.names?.[x[2]] === 1
    for (const g of gs) P.owner[g] = NAME_OWNER
    named.push({ occurrence: Number(x[1]), key, row, flags: (centred ? NAME_FLAG.CENTRED : 0) | (capitals ? NAME_FLAG.CAPITALS : 0) | (lead >= 0 ? NAME_FLAG.RUN_IN : 0), lead, glue, column: edge ?? [row.x0, row.x1] })
  }

  // ---------------------------------------------------------------- placeholders, by unit and source piece index
  // which pieces the marked original marks: its marking, as the marks file records it (the classes and the paper's
  // own switch it was compiled with)
  const design = new Map()
  {
    const { units: copies } = layoutMarking(units, marks.marking.classes, { lines: false, switches: marks.marking.switches, inkless: marks.marking.inkless })
    copies.forEach((c, i) => {
      for (const p of c.pieces) {
        const m = p.t === 'ph' && /^\\axtpm[am]?\{[pn](\d+)\.(\d+)([ab])\}$/.exec(p.src ?? '')
        if (!m || Number(m[1]) !== i) continue
        const key = `${i}.${m[2]}`, d = design.get(key) ?? design.set(key, { open: false, close: false }).get(key)
        if (m[3] === 'a') d.open = true; else d.close = true
      }
    })
  }
  const classes = new Set(marks.marking.classes)
  /** the paper's macros TeX said set no ink (marks.mjs readInkProbe): no row, as an invisible placeholder has none */
  const inkless = new Set(marks.marking.inkless ?? [])
  /** the texts the probe showed the paper's macros set (marks.mjs readInkTexts): a head piece's, found by its letters */
  const shown = new Map()
  for (let j = 0, f = marks.marking.texts ?? []; j + 1 < f.length; j += 2) shown.set(f[j], f[j + 1])
  const ph = [], kept = new Map() // kept: page → the rectangles erasing leaves out (displays' segments, labels)
  const keep = (p, r) => (kept.get(p) ?? kept.set(p, []).get(p)).push(r)
  const ownInk = new Map(marks.owned.map(e => [e[0], e]))
  /** a piece's own glyphs, its marks file's row (owned, OWNED: a glyph's character an index into the marks' table, or the
   *  character itself, as the page stream hands a row on) */
  const itemsOfInk = e => {
    const items = []
    for (let j = 3; j < 3 + 5 * e[2]; j += 5) items.push({ page: e[j], x0: e[j + 1], y: e[j + 2], size: e[j + 3], u: typeof e[j + 4] === 'string' ? e[j + 4] : marks.chars[e[j + 4]] ?? '' })
    return items
  }
  /** a piece's links in our compile (the link-anchor locator's): those whose glyphs (page, baseline inside the rectangle,
   *  origin within the first and last glyph's) are all among its own glyphs, each one's consecutive, none sharing a glyph, of
   *  the piece's kind (a citation's `cite.<key>` of its keys, a reference's no `cite.`), in the piece's order: { mine: [{ j,
   *  from, to }] }, or { why } */
  const oursIn = (items, kind) => {
    const mine = [], inLink = new Int8Array(items.length)
    for (const p of new Set(items.map(it => it.page))) {
      for (const j of ourOnPage.get(p) ?? []) {
        const L = ourLinks[j], under = []
        items.forEach((it, q) => { if (it.page === p && it.y > L[3] && it.y < L[5] && it.x0 >= L[6] - 0.01 && it.x0 <= L[7] + 0.01) under.push(q) })
        if (!under.length) continue
        if (under.length !== L[8] || under.at(-1) - under[0] + 1 !== under.length || under.some(q => inLink[q])) return { why: 'ours: a link not wholly the piece\'s' }
        const cite = L[0].startsWith('cite.')
        if (kind?.kind === 'cite' ? !cite || !kind.keys.includes(L[0].slice(5)) : cite || /^Hfootnote\./.test(L[0])) return { why: 'ours: a link of another kind' }
        for (const q of under) inLink[q] = 1
        mine.push({ j, from: under[0], to: under.at(-1) })
      }
    }
    return { mine: mine.sort((a, b) => a.from - b.from) }
  }
  /** the glyphs of page ink P under a Link annotation (PDF.js's rule, layer-proto/links.mjs annotsOf: a glyph's advance centre on
   *  its baseline strictly inside its rectangle or a quad), across; null for none, or past MAX_GLYPHS */
  const glyphsUnder = (P, raw) => {
    const near = band(P, raw.rect[1] - 1, raw.rect[3] + 1).filter(g => /\S/u.test(P.u[g]))
    const { list } = annotsOf([raw], { x: near.map(g => mid(P, g)), y: near.map(g => P.y[g]), ch: near.map(g => P.u[g]), key: near })
    const e = list[0]
    return e && !e.unsupported && e.g.key.length ? [...e.g.key].sort((a, b) => P.x0[a] - P.x0[b] || a - b) : null
  }
  /**
   * The pages of arXiv's PDF whose links the locator may read (`wanted`): made of the marks, their carrier and arXiv's ink alone
   * (never of a pass's state: who owns or took a glyph), so that the same pages are wanted however the passes are run. A unit's
   * pages are wanted where it has a piece that names a link (marks.mjs linkablePiece) with one of our links wholly among its
   * own glyphs (oursIn) that the matcher would not find: one of its glyphs carried nowhere, or with no glyph of its character
   * on arXiv's page within NEAR_X across and NEAR_Y up or down of where it is carried (our compile set other words there).
   * Its pages: those its own marks and those pieces' points and glyphs are carried to. carrying() starts it (`pending`: each
   * piece to be judged once the pages its glyphs are carried to are read); readPage judges as pages come (the page stream),
   * readWanted() at the passes' start once all are (whole(), byTasks()). None where ours has no link: a paper whose references
   * and citations stand on arXiv's page as our compile set them asks for no page's links
   */
  let pending = null
  const needed = new Set()
  /** each unit's pieces pending (judge's), and what is told of a unit all of whose pieces are judged (the page stream's) */
  const pendingOf = new Int32Array(units.length)
  let onJudged = null
  function prepareWanted() {
    wanted = new Set(); pending = []; needed.clear(); pendingOf.fill(0)
    if (!linking) return
    units.forEach((u, i) => wantOf(i))
  }
  /** unit i's pieces that name a link with one of our links among their own glyphs: pending, or its pages wanted at once (a
   *  glyph carried nowhere); the stream's for a unit as its own marks and pieces' ink become known, prepareWanted's for each */
  function wantOf(i) {
    units[i].pieces.forEach((piece, k) => {
      if (!linkablePiece(piece)) return
      const e = ownInk.get(`p${i}.${k}a`)
      if (!e || e[1] >= OWNED || e[1] === IN_GROUP || !(e[2] > 0)) return
      const items = itemsOfInk(e)
      if (!oursIn(items, linkKindOf(piece)).mine?.length) return
      const cs = items.map(it => carrier.carry(it.page, it.x0, it.y))
      if (cs.some(c => !c || !Number.isInteger(c.page) || c.page < 1 || c.page > pages)) { need(i); return }
      pending.push({ i, k, items, cs, upTo: Math.max(...cs.map(c => c.page)) })
      pendingOf[i]++
    })
  }
  /** unit i's pages wanted: every page from the first to the last its own marks, and its pieces that name a link (their points
   *  and glyphs), are carried to, so that a page of its lines between them (a unit over three pages or more, its marks on its
   *  first and last) has its links read too: the order within the unit reads every one of its lines' pages */
  function need(i) {
    if (needed.has(i)) return
    needed.add(i)
    const [lo, hi] = rangeOf(i)
    for (let q = lo; q <= hi; q++) wanted.add(q)
  }
  /** the pages need(i) would want, [first, last] ([Infinity, -Infinity]: none) */
  function rangeOf(i) {
    let lo = Infinity, hi = -Infinity
    const add = (pg, x, y) => { const c = carriedPage(pg, x, y); if (c !== null) { lo = Math.min(lo, c); hi = Math.max(hi, c) } }
    for (const end of ['s', 'e']) for (const pre of ['', 't', 'h']) { const nm = `${pre}${i}${end}`, m = dropped.has(nm) ? null : at.get(nm); if (m) add(m.page, m.x, m.y) }
    units[i].pieces.forEach((piece, k) => {
      if (!linkablePiece(piece)) return
      for (const nm of [`p${i}.${k}a`, `p${i}.${k}b`]) { const m = dropped.has(nm) ? null : at.get(nm); if (m) add(m.page, m.x, m.y) }
      const e = ownInk.get(`p${i}.${k}a`)
      if (e && e[1] < OWNED && e[1] !== IN_GROUP) for (const it of itemsOfInk(e)) add(it.page, it.x0, it.y)
    })
    return [lo, hi]
  }
  /** the pieces pending whose glyphs' pages are all read by page `upTo`, judged: a glyph with no glyph of its character near
   *  where it is carried on arXiv's page (whose ink is read; a dark page's piece is never placed, and wants nothing) */
  function judge(upTo) {
    if (!pending) return
    const nf = s => s.normalize('NFKC').replace(/\s|\p{Variation_Selector}/gu, '')
    const judged = []
    pending = pending.filter(x => {
      if (x.upTo > upTo) return true
      pendingOf[x.i]--
      judged.push(x.i)
      if (needed.has(x.i)) return false
      const missing = x.items.some((it, j) => {
        const c = x.cs[j], P = pagesInk[c.page], u = nf(it.u)
        if (!P || !u) return false
        for (let g = lowest(P, c.y - NEAR_Y); g < P.n && P.y[g] <= c.y + NEAR_Y; g++) if (Math.abs(P.x0[g] - c.x) <= NEAR_X && (P.u[g] === it.u || nf(P.u[g]) === u)) return false
        return true
      })
      if (missing && x.cs.every(c => pagesInk[c.page])) need(x.i)
      return false
    })
    if (onJudged) for (const i of judged) onJudged(i)
  }
  /** every piece judged and the wanted pages' links read (whole() and byTasks(), after carrying(), every page read; the page
   *  stream judges and reads as its pages are read) */
  async function readWanted() {
    judge(Infinity)
    for (const p of [...(wanted ?? [])].sort((a, b) => a - b)) await readTheirs(p)
    for (const p of [...heldTheirs.keys()]) dropHeld(p)
  }
  /** unit i's pieces phOf reads the own ink and marks of (a class marked, its macro not one that sets no ink, its opening
   *  mark in the marking's design): [k, its opening mark's name, its closing one's] */
  const designedOf = i => {
    const out = []
    units[i].pieces.forEach((piece, k) => {
      const cls = classOf(piece)
      if (!cls || (cls === 'macro' && inkless.has(piece.src)) || !classes.has(cls) || !design.get(`${i}.${k}`)?.open) return
      const prefix = cls === 'footnote' ? 'n' : 'p'
      out.push([k, `${prefix}${i}.${k}a`, `${prefix}${i}.${k}b`])
    })
    return out
  }
  /** a found piece's matched glyphs, by its key: the twice bar's */
  const matchedBy = new Map()
  /** a placeholder's fill as its row holds it: the colour more than half its inked glyphs are filled with, 0xRRGGBB, where
   *  that is not black (PDF's default) nor one of no colour (a pattern's): null, none in the row; MIXED_FILL where no one
   *  colour holds more than half (a link inside coloured prose, a formula of two colours) */
  const fillOfGlyphs = gs => {
    const n = new Map()
    let all = 0
    for (const [p, g] of gs) {
      const P = ink[p]
      if (!P?.fill || !/\S/u.test(P.u[g] ?? '')) continue
      all++
      n.set(P.fill[g], (n.get(P.fill[g]) ?? 0) + 1)
    }
    if (!all) return null
    let best = null, most = 0
    for (const [f, c] of n) if (c > most) { best = f; most = c }
    if (2 * most <= all) return MIXED_FILL
    return best === 0 || best === NO_FILL ? null : best
  }
  /** unit i's placeholders, each found on arXiv's page (matched), LOST, EMPTY or JOINED, its rows' ink taken in */
  function phOf(one) {
    const { id: i, u, a, rows } = one
    /** whether a glyph is a letter of a word of the unit's text, as the anchor paired the word: running text, never a
     *  placeholder's (counted, `textTaken`). A word's box is its item's even share, so a bracket beside it may fall in it:
     *  the glyph's letter is the word's too */
    const paired = new Map()
    for (const k of a.pairs?.values() ?? []) { const t = doc[k]; if (t?.t) (paired.get(t.page) ?? paired.set(t.page, []).get(t.page)).push(t) }
    const inWord = (page, g) => {
      const P = ink[page], m = mid(P, g), c = charsOf(P.u[g])
      return /\p{L}/u.test(c) && (paired.get(page) ?? []).some(t => m >= t.x && m <= t.x + t.w && Math.abs(P.y[g] - t.y) < 0.5 * t.h && t.t.includes(c))
    }
    /** the unit's line a part of an inline placeholder's ink stands on (by its baseline, in its column or on a line
     *  across both), the nearest within INK_OFF of the line's size; -1 for none */
    const rowFor = (page, x0, x1, base) => {
      const col = columnOf(page, x0, x1)
      let best = -1, d = Infinity
      rows.forEach((r, j) => {
        if (r.page !== page) return
        const c = columnOf(r.page, r.x0, r.x1)
        if (c !== col && c !== 2 && col !== 2) return
        const dy = Math.abs(r.base - base)
        if (dy <= INK_OFF * r.size && dy < d) { best = j; d = dy }
      })
      return best
    }
    /**
     * The unit's line a part of an inline placeholder's ink sits on, by its own glyphs' baselines (the 6b review's I1):
     * the line most of its largest glyphs (within PART_MAIN of its largest size: not its scripts, which may stand on a
     * script row, nor a fraction's parts) sit on, within PART_ON of its size; on a tie, the line its carried mark (`mark`:
     * the piece's opening mark for its first part, its closing one for its last) stands on. Where none of them sits on a
     * line (a fraction, a raised sign alone), the mark's line, else the nearest line, within PART_NEAR of the line's
     * size of their middle baseline; -1 for none: a part on no line of the unit's (2307 128.5's line is not the unit's,
     * which the old nearest-in-2.5-em took the line 18 pt below for). A radical's origin is raised to its bar (1706
     * 31.8), a script-heavy formula's median glyph is a script (2307 162.7): neither decides
     */
    const rowOfPart = (part, mark) => {
      const P = ink[part.page]
      let x0 = Infinity, x1 = -Infinity, big = 0
      for (const g of part.gs) { x0 = Math.min(x0, P.x0[g]); x1 = Math.max(x1, P.x1[g]); big = Math.max(big, P.size[g]) }
      const mains = part.gs.filter(g => P.size[g] >= PART_MAIN * big)
      const col = columnOf(part.page, x0, x1)
      const cands = []
      rows.forEach((r, j) => {
        if (r.page !== part.page) return
        const c = columnOf(r.page, r.x0, r.x1)
        if (c === col || c === 2 || col === 2) cands.push(j)
      })
      if (!cands.length) return -1
      const marked = j => !!mark && mark.page === part.page && Math.abs(mark.y - rows[j].base) < 0.5 * rows[j].size
      let best = -1, most = 0
      for (const j of cands) {
        const r = rows[j]
        let n = 0
        for (const g of mains) if (Math.abs(P.y[g] - r.base) <= PART_ON * r.size) n++
        if (n > most || (n === most && n > 0 && marked(j) && !marked(best))) { best = j; most = n }
      }
      if (best >= 0) return best
      const mid = median(mains.map(g => P.y[g]))
      const near = j => Math.abs(rows[j].base - mid) <= PART_NEAR * rows[j].size
      const atMark = cands.find(j => marked(j) && near(j))
      if (atMark !== undefined) return atMark
      let d = Infinity
      for (const j of cands) { const e = Math.abs(rows[j].base - mid); if (near(j) && e < d) { d = e; best = j } }
      return best
    }
    /**
     * The line a part of an inline piece stands on where no line of the unit's holds it, when TeX broke the piece over
     * lines (its own two points on two lines of the marked compile: `broken`): its glyph run went on to the next line, a
     * line of the unit's that holds no word of its source (a citation after a table cell's last word, before which the
     * end mark stands, wrapped onto the cell's next line, or set whole there, TeX's break right after its opening point;
     * so in a narrow column or a note). The part is the piece's next line after `prev`, the line its part before stands
     * on (its first part's: the line its opening point stands on): on its page and in its column, below it within WRAP of
     * their size, no line of the unit's (`rows`, and those `wrapped` before it) between them or on its baseline; its
     * glyphs no other unit's; the unit within LINES_UNIT lines. The line is the part's glyphs (rowOf), no word of the
     * text layer's; null for none (the piece is LOST, as before)
     */
    const wrapOf = (part, prev, wrapped) => {
      if (rows.length + wrapped.length >= LINES_UNIT || part.page !== prev.page) return null
      const P = ink[part.page]
      if (part.gs.some(g => P.owner[g] !== -1 && P.owner[g] !== i)) return null
      const row = rowOf(P, part.gs, part.page, [], P.y[part.gs[0]])
      if (!(r2(row.size) > 0 && row.size <= SIZE_MAX)) return null
      const col = columnOf(part.page, row.x0, row.x1), size = Math.max(prev.size, row.size), drop = prev.base - row.base
      if (col !== columnOf(prev.page, prev.x0, prev.x1) || drop < 0.5 * size || drop > WRAP * size) return null
      for (const r of [...rows, ...wrapped.map(w => w.row)]) if (r !== prev && r.page === part.page && columnOf(r.page, r.x0, r.x1) === col && r.base > row.base - 0.5 * size && r.base < prev.base) return null
      return row
    }
    /** the glyphs of the unit's pieces found so far, by page: exactly matched, as the words the anchor paired are */
    const foundGs = new Set()
    /**
     * The link-anchor locator: a reference's or a citation's own glyphs the matcher did not all find on arXiv's page (our
     * compile set other words: cleveref's "Appendix C" where arXiv's set "Section C"), placed by its links. Its links in our
     * compile are those whose glyphs are all among its own; each is paired with arXiv's by its destination's name and rank
     * (the r-th of that name on arXiv's pages up to the unit's last line's, every page before it read), else, where those
     * pages hold none of that name (hyperref named an equation otherwise), by its family's name and rank, the partner's name
     * none of ours. The partners' glyphs (PDF.js's rule, links.mjs annotsOf) are the anchor: all on one line of the unit, left
     * to right, their text ours (or ours after one reference word each), exactly our characters between them and after the
     * last; before the first, from the last exactly matched glyph on the line's baseline (a letter or digit of a word the
     * anchor paired, a found piece's) or the line's start: the last characters of our text before the piece (the anchor need
     * not have paired them), then the reference's word, ours or one word of VOCAB where ours is one (never a word of our
     * text), at most PREFIX_EM of its size wide and GAP_EM from the link, then exactly our characters. Every glyph of the
     * run on that line's baseline and none off it inside the run, the unit's or no unit's, taken by no piece
     * (the matcher's own partial take of this piece, `took`, set aside), no letter or digit of a paired word. Its glyphs in x order
     * (taken by phOf once the piece is found on its line), or null (LOST, as before; `stats.links.why`): no glyph's state
     * changed
     */
    /** the unit's links in our compile, in the source's order: those wholly among the own glyphs of its pieces that name a link
     *  (oursIn), indices of ourLinks; made once, at the locator's first call on the unit */
    let unitOurs = null
    const oursOfUnit = () => {
      if (unitOurs) return unitOurs
      unitOurs = []
      u.pieces.forEach((p, k) => {
        if (!linkablePiece(p)) return
        const e = ownInk.get(`p${i}.${k}a`)
        if (e && e[1] < OWNED && e[1] !== IN_GROUP && e[2] > 0) for (const m of oursIn(itemsOfInk(e), linkKindOf(p)).mine ?? []) unitOurs.push(m.j)
      })
      return unitOurs
    }
    /** the unit's links on arXiv's page: each Link annotation of the pages of its lines whose glyphs (PDF.js's rule) stand on one
     *  line of the unit, by line then across, with its glyphs; null where a page of its lines has no links read */
    const theirsOfUnit = () => {
      const out = []
      for (const q of new Set(rows.map(r => r.page))) {
        const P = ink[q]
        if (!P || !Array.isArray(theirLinks[q])) return null
        for (const a of theirLinks[q]) {
          const gl = glyphsUnder(P, a.raw)
          if (!gl) continue
          let gx0 = Infinity, gx1 = -Infinity
          for (const g of gl) { gx0 = Math.min(gx0, P.x0[g]); gx1 = Math.max(gx1, P.x1[g]) }
          const col = columnOf(q, gx0, gx1)
          const on = rows.flatMap((r, j) => (r.page === q && gl.every(g => Math.abs(P.y[g] - r.base) <= PART_ON * r.size) && (columnOf(q, r.x0, r.x1) === col || columnOf(q, r.x0, r.x1) === 2) ? [j] : []))
          if (on.length === 1) out.push({ a, q, row: on[0], x: P.x0[gl[0]], gl })
        }
      }
      return out.sort((x, y) => x.row - y.row || x.x - y.x)
    }
    /**
     * The link-anchor locator: a reference's or a citation's own glyphs the matcher did not all find on arXiv's page (our
     * compile set other words: cleveref's "Appendix C" where arXiv's set "Section C"), placed by its links. Its links in our
     * compile are those whose glyphs are all among its own (oursIn); each is paired with arXiv's by its order within the unit:
     * the r-th link of its destination among the unit's in our compile (oursOfUnit) with the r-th of that name among the
     * links on the unit's lines on arXiv's page (theirsOfUnit), else, where those hold none of that name (hyperref named an
     * equation otherwise), the r-th of its family's (its name before the first '.'), the partner's name none of ours. The
     * partners' glyphs are the anchor: all on one line of the unit, left to right, their text ours (or ours after one reference
     * word each), exactly our characters between them and after the last; before the first, from the last exactly matched
     * glyph on the line's baseline (a letter or digit of a word the anchor paired, a found piece's) or the line's start: the
     * last characters of our text before the piece (the anchor need not have paired them), then the reference's word, ours or
     * one word of VOCAB where ours is one (never a word of our text), at most PREFIX_EM of its size wide and GAP_EM from the
     * link, then exactly our characters. Every glyph of the run on that line's baseline and none off it inside the run, the
     * unit's or no unit's, taken by no piece (the matcher's own partial take of this piece, `took`, set aside), no letter or
     * digit of a paired word. Its glyphs in x order (taken by phOf once the piece is found on its line), or null (LOST, as
     * before; `stats.links.why`): no glyph's state changed. The links of the unit's pages are read before its passes run where
     * the locator may want them (prepareWanted, judge); a page of its lines whose links were not read is no partner's
     */
    const linked = (k, piece, items, took) => {
      stats.links.tried++
      const no = why => { stats.links.why[why] = (stats.links.why[why] ?? 0) + 1; return null }
      const norm = s => s.normalize('NFKC').replace(/\s/gu, '')
      // ---- 1. ours: the links whose glyphs are all the piece's own, consecutive, none shared
      const own = oursIn(items, linkKindOf(piece))
      if (own.why) return no(own.why)
      const mine = own.mine
      if (!mine.length) return no('ours: no link')
      if (mine.length > LINKS_PIECE) return no('ours: too many links')
      const charsOfItems = (a, b) => norm(items.slice(a, b).map(it => it.u).join(''))
      const prefix = charsOfItems(0, mine[0].from), suffix = charsOfItems(mine.at(-1).to + 1, items.length)
      if (suffix.length > SUFFIX_MAX) return no('suffix: too long')
      // ---- 2. each one's partner on the unit's lines on arXiv's page, by its order within the unit: of its name, else its family
      const theirs = theirsOfUnit()
      if (!theirs) return no('pair: a page of the unit not read')
      const ours = oursOfUnit()
      const partnerOf = j => {
        const D = ourLinks[j][0], before = ours.slice(0, ours.indexOf(j))
        const named = theirs.filter(t => t.a.dest === D)
        if (named.length) return named[before.filter(x => ourLinks[x][0] === D).length] ?? null
        if (D.startsWith('cite.')) return null
        const F = familyOf(D), c = theirs.filter(t => familyOf(t.a.dest) === F)[before.filter(x => familyOf(ourLinks[x][0]) === F).length]
        return c && !ourDests.has(c.a.dest) ? c : null
      }
      const partners = mine.map(m => (ours.includes(m.j) ? partnerOf(m.j) : null))
      if (partners.some(c => !c)) return no('pair: no partner')
      const q = partners[0].q
      if (partners.some(c => c.row !== partners[0].row)) return no('link: not on one line of the unit')
      const P = ink[q]
      /** a letter or a digit of a word of the unit's text, as the anchor paired the word (inWord's, digits too) */
      const ofWord = g => {
        const m = mid(P, g), c = charsOf(P.u[g])
        return /[\p{L}\p{N}]/u.test(c) && (paired.get(q) ?? []).some(t => m >= t.x && m <= t.x + t.w && Math.abs(P.y[g] - t.y) < 0.5 * t.h && t.t.includes(c))
      }
      // (set aside: the glyphs the matcher took of this piece)
      const back = took.filter(([p, g]) => ink[p]?.taken[g])
      for (const [p, g] of back) ink[p].taken[g] = 0
      try {
        const free = g => (P.owner[g] === -1 || P.owner[g] === i) && !P.taken[g] && !ofWord(g)
        // ---- 3. the partners' glyphs, on one line of the unit
        const runs = partners.map(c => c.gl)
        const all = runs.flat()
        const r = rows[partners[0].row]
        if (!all.every(free)) return no('link: a glyph not free')
        const reWord = s => { for (let n = Math.min(s.length, 16); n >= 2; n--) if (VOCAB.has(s.slice(0, n).toLowerCase())) return s.slice(n); return null }
        const sameText = (ours, theirs) => ours === theirs || (reWord(ours) !== null && reWord(ours) !== '' && reWord(ours) === reWord(theirs))
        for (let m = 0; m < runs.length; m++) if (!sameText(norm(ourLinks[mine[m].j][9]), norm(runs[m].map(g => P.u[g]).join('')))) return no('link: its text not ours')
        // ---- 4. in our order, left to right, our gaps' characters between them; the run's glyphs on the line's baseline
        const [cx0, cx1] = sideOf(q, columnOf(q, r.x0, r.x1)), size = r.size
        const window = band(P, r.base - SCRIPT(P.most), r.base + SCRIPT(P.most)).filter(g => Math.abs(P.y[g] - r.base) < SCRIPT(P.size[g]) && /\S/u.test(P.u[g]) && mid(P, g) >= cx0 - 1 && mid(P, g) <= cx1 + 1).sort((a, b) => P.x0[a] - P.x0[b] || a - b)
        const onLine = window.filter(g => Math.abs(P.y[g] - r.base) <= PART_ON * size)
        const between = (xa, xb) => onLine.filter(g => mid(P, g) > xa && mid(P, g) < xb)
        const gaps = []
        for (let m = 1; m < runs.length; m++) {
          const a = runs[m - 1].at(-1), b = runs[m][0]
          if (P.x0[b] < P.x1[a] - 0.05) return no('order: links not left to right')
          const gs = between(mid(P, a), mid(P, b)).filter(g => !runs[m - 1].includes(g) && !runs[m].includes(g))
          if (norm(gs.map(g => P.u[g]).join('')) !== charsOfItems(mine[m - 1].to + 1, mine[m].from)) return no('order: a gap not ours')
          gaps.push(...gs)
        }
        // ---- 5. before the first link, from the last exactly matched glyph on the line (or its start): our text's last
        // characters, then the reference's word (ours, or one of VOCAB for ours), then exactly our characters after it
        const first = runs[0][0]
        const before = onLine.filter(g => mid(P, g) < mid(P, first) && !runs[0].includes(g))
        let lx = -Infinity
        for (const g of before) if (foundGs.has(`${q}|${g}`) || ofWord(g)) lx = Math.max(lx, P.x1[g])
        const lead = before.filter(g => mid(P, g) > lx), chars = gs => norm(gs.map(g => P.u[g]).join(''))
        const w = /^(\p{L}+\.?)?(.*)$/su.exec(prefix), ownWord = w[1] ?? '', rest = w[2]
        let n = lead.length, got = ''
        while (n > 0 && got.length < rest.length) got = norm(P.u[lead[--n]]) + got
        if (got !== rest) return no('prefix: its rest not ours')
        let m = n
        if (ownWord) {
          if (!VOCAB.has(ownWord.toLowerCase())) return no('prefix: ours no reference word')
          // its letters back to a word's gap (a stop after them its own), right before the rest
          if (m > 0 && norm(P.u[lead[m - 1]]) === '.') m--
          while (m > 0 && /^\p{L}+$/u.test(norm(P.u[lead[m - 1]])) && (m === n || P.x0[lead[m]] - P.x1[lead[m - 1]] < TEXT_SPACE * size)) m--
        }
        const text = lead.slice(0, m), word = lead.slice(m, n), theirs = chars(word)
        // (our text right before the piece: its text pieces and text symbols back to the piece before them, as TeX sets them)
        let T = ''
        for (let j = k - 1; j >= 0; j--) {
          const p = u.pieces[j], sym = p.t === 'ph' && classOf(p) === 'macro' ? symbolText(p.src) : null
          if (p.t === 'text') T = shownText(p) + T
          else if (sym !== null) T = sym + T
          else break
        }
        T = norm(asSet(T))
        if (!T.endsWith(chars(text)) || text.some(g => P.owner[g] !== -1 && P.owner[g] !== i)) return no('prefix: not our text before it')
        if (ownWord) {
          if (!word.length || !/^\p{L}+\.?$/u.test(theirs) || (theirs !== ownWord && !VOCAB.has(theirs.toLowerCase()))) return no('prefix: theirs no reference word')
          // (a word of our own text before the piece is never its rendering)
          if (T.endsWith(chars(text) + theirs)) return no('prefix: a word of our text')
          if (P.x1[word.at(-1)] - P.x0[word[0]] > PREFIX_EM * size) return no('prefix: too wide')
          if (P.x0[lead[n] ?? first] - P.x1[word.at(-1)] > GAP_EM * size) return no('prefix: too far from the link')
          // a word apart from what stands before it: a letter or a digit glued to it is of its word
          const left = text.at(-1)
          if (left !== undefined ? /[\p{L}\p{N}]/u.test(norm(P.u[left])) && P.x0[word[0]] - P.x1[left] < TEXT_SPACE * size : Number.isFinite(lx) && P.x0[word[0]] - lx < TEXT_SPACE * size) return no('prefix: no word apart')
        }
        // ---- 6. after the last link: exactly our characters, glued
        const tail = []
        if (suffix) {
          const lastG = runs.at(-1).at(-1)
          let got = '', edge = P.x1[lastG]
          for (const g of onLine) {
            if (got.length >= suffix.length) break
            if (mid(P, g) <= mid(P, lastG) || runs.at(-1).includes(g)) continue
            if (P.x0[g] - edge > GAP_EM * size) break
            got += norm(P.u[g]); tail.push(g); edge = Math.max(edge, P.x1[g])
          }
          if (got !== suffix) return no('suffix: not ours')
        }
        // ---- 7. every glyph of the run free, and none off the line's baseline inside it (a script it would crop)
        const run = [...lead.slice(m), ...all, ...gaps, ...tail]
        if (new Set(run).size !== run.length || !run.every(free)) return no('run: a glyph not free')
        let rx0 = Infinity, rx1 = -Infinity
        for (const g of run) { rx0 = Math.min(rx0, P.x0[g]); rx1 = Math.max(rx1, P.x1[g]) }
        if (window.some(g => !run.includes(g) && mid(P, g) > rx0 && mid(P, g) < rx1)) return no('run: a glyph off the line inside it')
        // (taken once the piece is found on its line: phOf)
        return run.sort((a, b) => P.x0[a] - P.x0[b] || a - b).map(g => [q, g])
      } finally {
        for (const [p, g] of back) ink[p].taken[g] = 1
      }
    }
    const head = headEnd(u.pieces, 0), last = u.pieces.findLastIndex(p => p.t === 'text' && /[^ \t\r\n]/.test(p.s ?? ''))
    /** whether the last visible piece is a display found, or one JOINED to a display found (a later display of the same
     *  group, stream.mjs, may then be JOINED); text and any other piece end the group */
    let groupFound = false
    const entries = ph.length
    for (let k = 0; k < u.pieces.length; k++) {
      // every visible piece has its row, found, LOST or EMPTY: no row is a piece that draws nothing (an invisible one, a
      // group's open or close), as the layer reads the file
      const piece = u.pieces[k], cls = classOf(piece)
      if (piece.t === 'text' && /\S/.test(piece.s ?? '')) groupFound = false
      if (!cls || (cls === 'macro' && inkless.has(piece.src))) continue
      const wasFound = groupFound
      groupFound = false
      const kind = PH_KIND.get(cls) ?? PH_KIND.get('other')
      const d = classes.has(cls) ? design.get(`${i}.${k}`) : null
      // a marked piece not found after the unit's end mark is a tail as an unmarked one is (besideMarks): \\renewcommand,
      // which looks ahead and has its opening mark alone, owns no ink between points
      const lost = why => {
        const entry = { row: [i, k, kind, PH_FLAG.LOST], cls, state: 'lost', why }
        ph.push(entry)
        if (cls === 'macro' && last >= 0 && k > last) (one.tails ??= []).push({ entry, k, src: piece.src })
      }
      // a piece the marked original gives no mark (at a unit's head, after a prefix or a control sequence's end, glued
      // to a word): its rendering is not known
      if (!d?.open) {
        // a LaTeX text symbol (marks.mjs TEXT_SYMBOLS) is drawn as its character where the unit's lines show it (below)
        const sym = cls === 'macro' ? symbolText(piece.src) : null
        const entry = { row: [i, k, kind, PH_FLAG.LOST], cls, state: 'unmarked' }
        ph.push(entry)
        if (sym !== null) (one.symbols ??= []).push({ entry, sym })
        else if (cls === 'macro' && k < head) (one.heads ??= []).push({ entry, k, src: piece.src })
        else if (cls === 'macro' && last >= 0 && k > last) (one.tails ??= []).push({ entry, k, src: piece.src })
        continue
      }
      const prefix = cls === 'footnote' ? 'n' : 'p', name = `${prefix}${i}.${k}a`, e = ownInk.get(name)
      // its own ink by its points in the marked compile's content stream (layout/stream.mjs), or why none is known
      if (!e) { lost('no own ink known'); continue }
      // a later display of a display group, which TeX gives no point (the empty paragraph after a display): its ink is the
      // group's, its first display's segments, where that was found (JOINED: no segments of its own)
      if (e[1] === IN_GROUP) {
        if (cls !== 'display' || !wasFound) { lost("its display group's first display not found"); continue }
        ph.push({ row: [i, k, kind, PH_FLAG.JOINED], cls, state: 'joined' })
        groupFound = true
        continue
      }
      if (e[1] >= OWNED) { lost(OWNED_HOW[e[1]] ?? 'no own ink known'); continue }
      const before = u.pieces[k - 1], after = u.pieces[k + 1]
      let flags = before?.t === 'text' && /[([]$/.test(before.s ?? '') && after?.t === 'text' && /^[)\]]/.test(after.s ?? '') ? PH_FLAG.SOURCE_BRACKETS : 0
      const n = e[2], items = itemsOfInk(e), rules = []
      for (let j = 3 + 5 * n; j < e.length; j += 5) rules.push({ page: e[j], x0: e[j + 1], y0: e[j + 2], x1: e[j + 3], y1: e[j + 4] })
      // EMPTY only where both its points hold nothing between them: TeX set nothing there, and the piece draws nothing. One
      // whose closing point was never read (an open ownership) that holds nothing says only that nothing stands before the
      // next point or the text after it, which may be at its own glyph (2610.19159: a \textquotedbl{} whose opening point
      // shares its glyph with another piece's, set late, the quote on arXiv's line): its ink is not known, LOST
      if (!items.length && !rules.length) {
        if (e[1] !== CLOSED) { lost('open, nothing owned'); continue }
        ph.push({ row: [i, k, kind, flags | PH_FLAG.EMPTY], cls, state: 'empty' })
        continue
      }
      // every owned glyph and rule carried to arXiv's PDF and matched there, or the piece is LOST
      let got = matcher.match(items, rules, at.get(name) ?? null, at.get(`${prefix}${i}.${k}b`) ?? null)
      // (a reference or a citation not found by its own glyphs: by its links, the link-anchor locator, where ours has any)
      let byLinks = false
      if (got.why && got.took && linking && !rules.length && linkablePiece(piece)) {
        const run = linked(k, piece, items, got.took)
        if (run) { got = { glyphs: run, boxes: [] }; byLinks = true }
      }
      if (got.why) { lost(got.why); continue }
      const gs = got.glyphs, bs = got.boxes
      let segs = []
      if (cls === 'display') {
        segs = displaySegments(gs, bs)
        if (!segs) { lost('more segments than a display may have'); continue }
        if (segs.numbered) flags |= PH_FLAG.NUMBERED
      } else {
        // one segment a line of the unit: the glyphs in stream order in parts (a line's end parts them), each part on the
        // line its baseline stands on, each rule with the part of the glyph nearest it
        const parts = []
        for (const [p, g] of gs) {
          const cur = parts.at(-1), P = ink[p], last = cur?.gs.at(-1)
          const dx = cur ? P.x0[g] - P.x0[last] : 0, dy = cur ? P.y[g] - P.y[last] : 0
          if (!cur || cur.page !== p || (dx < -BREAK_X && dy < -BREAK_Y) || dy > BREAK_UP * Math.max(P.size[g], P.size[last]) || Math.abs(dx) > BREAK_FAR) parts.push({ page: p, gs: [g] })
          else cur.gs.push(g)
        }
        // (each part's line by the line itself, not its index: a line the piece's run wraps onto enters the unit's lines
        // once the piece is found, after the line before it)
        const byRow = new Map(), partRow = [], wrapped = []
        let off = false
        const closeName = `${prefix}${i}.${k}b`, openAt = markOf(name), closeAt = markOf(closeName)
        // both its marks on one line of the unit: TeX broke no line between them, so the whole piece is in that line's box
        // (a fraction's numerator and denominator, a limit, whatever their baselines). A part the part rule puts on no
        // line goes there where its glyphs stand within the line's size of its baseline on arXiv's page; where arXiv's
        // page broke the line elsewhere (another TeX's compile), the part rule's own line stands
        const on = (M, j) => !!M && M.page === rows[j].page && Math.abs(M.y - rows[j].base) < 0.5 * rows[j].size
        const both = openAt && closeAt ? rows.findIndex((_, j) => on(openAt, j) && on(closeAt, j)) : -1
        const onLine = part => both >= 0 && part.page === rows[both].page && part.gs.every(g => Math.abs(ink[part.page].y[g] - rows[both].base) <= rows[both].size)
        // its two points on two lines of the marked compile: TeX broke the piece over lines (wrapOf)
        const pa = dropped.has(name) ? null : at.get(name), pb = dropped.has(closeName) ? null : at.get(closeName)
        const broken = !!pa && !!pb && (pa.page !== pb.page || Math.abs(pa.y - pb.y) > 0.5)
        // (the line its opening point stands on, where TeX broke the line right after it: its first part's line before)
        const openRow = broken && openAt ? (rows.find((_, j) => on(openAt, j)) ?? null) : null
        for (const [q, part] of parts.entries()) {
          let j = rowOfPart(part, q === 0 ? openAt : q === parts.length - 1 ? closeAt : null)
          if (j < 0 && onLine(part)) j = both
          const prev = q > 0 ? partRow[q - 1] : openRow
          const r = j >= 0 ? rows[j] : broken && prev ? wrapOf(part, prev, wrapped) : null
          if (!r) { off = true; break }
          if (j < 0) wrapped.push({ row: r, after: prev })
          partRow.push(r)
          ;(byRow.get(r) ?? byRow.set(r, { gs: [], boxes: [] }).get(r)).gs.push(...part.gs)
        }
        for (const [p, b] of off ? [] : bs) {
          const B = ink[p].boxes[b], cx = (B[0] + B[2]) / 2, cy = (B[1] + B[3]) / 2
          let r = null, d = Infinity
          parts.forEach((part, q) => { if (part.page !== p) return; const P = ink[p]; for (const g of part.gs) { const dd = Math.hypot(mid(P, g) - cx, P.y[g] - cy); if (dd < d) { d = dd; r = partRow[q] } } })
          if (!r) { const j = rowFor(p, B[0], B[2], cy); if (j >= 0) r = rows[j] }
          if (!r) { off = true; break }
          ;(byRow.get(r) ?? byRow.set(r, { gs: [], boxes: [] }).get(r)).boxes.push(B)
        }
        if (off) { lost("its ink on no line of the unit's"); continue }
        if (byRow.size > SEGS_INLINE) { lost('more lines than an inline placeholder may have'); continue }
        // the lines its run wrapped onto are the unit's from here on, each right after the line before it (the rows the
        // unit's boxes name moved with them)
        if (wrapped.length) {
          const boxed = (one.boxes ?? []).map(([j, B]) => [rows[j], B])
          for (const w of wrapped) rows.splice(rows.indexOf(w.after) + 1, 0, w.row)
          if (one.boxes) one.boxes = boxed.map(([r, B]) => [rows.indexOf(r), B])
        }
        const index = new Map([...byRow.keys()].map(r => [r, rows.indexOf(r)]))
        for (const r of [...byRow.keys()].sort((x, y) => index.get(x) - index.get(y))) {
          const j = index.get(r), P = ink[r.page], { gs: own, boxes } = byRow.get(r)
          let x0 = Infinity, x1 = -Infinity, top = -Infinity, bottom = Infinity
          for (const g of own) { x0 = Math.min(x0, P.ix0[g]); x1 = Math.max(x1, P.ix1[g]); top = Math.max(top, P.top[g]); bottom = Math.min(bottom, P.bottom[g]) }
          for (const b of boxes) { x0 = Math.min(x0, b[0]); x1 = Math.max(x1, b[2]); top = Math.max(top, b[3]); bottom = Math.min(bottom, b[1]) }
          const inkBase = own.length ? baselineOf(P, bodyOf(P, own, r.size), r.base) : r.base
          segs.push({ page: r.page, x0, base: r.base, x1, top, bottom, inkBase, size: r.size, row: j, boxes, gs: own })
        }
        const s0 = segs[0]
        if (s0.inkBase - s0.base >= SHIFT * s0.size) flags |= PH_FLAG.RAISED
        else if (s0.base - s0.inkBase >= SHIFT * s0.size) flags |= PH_FLAG.LOWERED
        // the unit's own ink, which its lines take in and erasing covers
        for (const sg of segs) {
          const r = rows[sg.row]
          r.extra = (r.extra ?? []).concat(sg.gs)
          r.x0 = Math.min(r.x0, sg.x0); r.x1 = Math.max(r.x1, sg.x1); r.top = Math.max(r.top, sg.top); r.bottom = Math.min(r.bottom, sg.bottom)
        }
        one.boxes = (one.boxes ?? []).concat(segs.flatMap(sg => sg.boxes.map(b => [sg.row, b])))
      }
      for (const [p, g] of gs) { ink[p].owner[g] = i; if (byLinks) ink[p].taken[g] = 1; if (cls !== 'display' && inWord(p, g)) stats.ph.textTaken++ }
      const row = [i, k, kind, flags]
      for (const s of segs) {
        const [x0, bottom, x1, top] = solid(viewAt(s.page), s.x0, s.bottom, s.x1, s.top)
        row.push(s.page, x0, Math.min(viewAt(s.page)[3], Math.max(viewAt(s.page)[1], r2(s.base))), x1, top, bottom)
        if (cls === 'display') keep(s.page, [x0, bottom, x1, top])
      }
      // (its glyphs' fill, the row's last number where it is not black: a link's colour, colorlinks' cite blue)
      const fill = fillOfGlyphs(gs)
      if (fill !== null) row.push(fill)
      const key = `${i}.${k}`
      matchedBy.set(key, gs)
      for (const [p, g] of gs) foundGs.add(`${p}|${g}`)
      // (the bars of the own ink are the matcher's: a piece placed by its links is counted there alone)
      if (byLinks) { const w = stats.links.placed.findIndex(([a, b]) => a > i || (a === i && b > k)); stats.links.placed.splice(w < 0 ? stats.links.placed.length : w, 0, [i, k]) }
      else {
        stats.ph.owned += items.length + rules.length
        stats.ph.matched += gs.length + bs.length
      }
      ph.push({ row, cls, state: 'found', inferred: e[1] !== 0, text: PAGE_TEXT.has(cls) ? pageTextOf(gs) : null })
      if (cls === 'display') groupFound = true
    }
    if (one.symbols) symbolsOf(one)
    if (one.heads) besideMarks(one, false)
    if (one.tails) besideMarks(one, true)
    // (its rows, for the pieces outside its lines: below)
    one.entries = [entries, ph.length]
    one.head = head
    one.last = last
  }
  // the bars: an arXiv glyph matched by two found pieces, an owned glyph of a found piece not matched (none, both; each
  // true by the matcher's own rule); and what the layer draws: an arXiv glyph inside a found inline piece's segments
  // (its crop) that is not its own (`foreign`), and one inside two found pieces' segments (`shared`), by its own ink,
  // half of it or more inside (none, both: the 6b review's I2)
  function bars() {
    const seen = new Map()
    for (const gs of matchedBy.values()) for (const [p, g] of gs) { const key = `${p}|${g}`; seen.set(key, (seen.get(key) ?? 0) + 1) }
    for (const n of seen.values()) if (n > 1) stats.ph.twice++
    stats.ph.unmatched = stats.ph.owned - stats.ph.matched
    const inside = new Map()
    for (const e of ph) {
      if (e.state !== 'found') continue
      const r = e.row, own = new Set((matchedBy.get(`${r[0]}.${r[1]}`) ?? []).map(([p, g]) => `${p}|${g}`))
      for (let o = 4; o + 5 < r.length; o += 6) {
        const page = r[o], x0 = r[o + 1], x1 = r[o + 3], top = r[o + 4], bottom = r[o + 5], P = ink[page]
        if (!P) continue
        for (const g of band(P, bottom - 2 * P.most, top + 2 * P.most)) {
          const w = Math.min(x1, P.ix1[g]) - Math.max(x0, P.ix0[g]), h = Math.min(top, P.top[g]) - Math.max(bottom, P.bottom[g])
          const area = (P.ix1[g] - P.ix0[g]) * (P.top[g] - P.bottom[g])
          if (w <= 0 || h <= 0 || !(area > 0) || w * h < 0.5 * area) continue
          const key = `${page}|${g}`
          const at = inside.get(key) ?? inside.set(key, new Set()).get(key)
          at.add(`${r[0]}.${r[1]}`)
          if (e.cls !== 'display' && !own.has(key)) stats.ph.foreign++
        }
      }
    }
    for (const at of inside.values()) if (at.size > 1) stats.ph.shared++
  }
  /** the bars of page q (bars' of the whole, a page at a time: each count a sum of its pages'), of the units `ids` whose
   *  pages it is among, once their placeholders are found and before anything else is (the heads and tails held) */
  function barsOn(q, ids) {
    const seen = new Map(), inside = new Map()
    for (const i of ids) {
      const one = placedById.get(i)
      if (!one?.entries) continue
      for (let x = one.entries[0]; x < one.entries[1]; x++) {
        const e = ph[x]
        if (e.state !== 'found') continue
        const r = e.row, mine = matchedBy.get(`${r[0]}.${r[1]}`) ?? [], own = new Set()
        for (const [p, g] of mine) if (p === q) { own.add(g); seen.set(g, (seen.get(g) ?? 0) + 1) }
        for (let o = 4; o + 5 < r.length; o += 6) {
          if (r[o] !== q) continue
          const x0 = r[o + 1], x1 = r[o + 3], top = r[o + 4], bottom = r[o + 5], P = ink[q]
          if (!P) continue
          for (const g of band(P, bottom - 2 * P.most, top + 2 * P.most)) {
            const w = Math.min(x1, P.ix1[g]) - Math.max(x0, P.ix0[g]), h = Math.min(top, P.top[g]) - Math.max(bottom, P.bottom[g])
            const area = (P.ix1[g] - P.ix0[g]) * (P.top[g] - P.bottom[g])
            if (w <= 0 || h <= 0 || !(area > 0) || w * h < 0.5 * area) continue
            const at = inside.get(g) ?? inside.set(g, new Set()).get(g)
            at.add(`${r[0]}.${r[1]}`)
            if (e.cls !== 'display' && !own.has(g)) stats.ph.foreign++
          }
        }
      }
    }
    for (const n of seen.values()) if (n > 1) stats.ph.twice++
    for (const at of inside.values()) if (at.size > 1) stats.ph.shared++
  }

  /**
   * A unit's head and tail pieces: the paper's macros it opens with, before its start mark, and those after its end mark,
   * past its last words, where no mark goes (marks.mjs headEnd and passedOver; patch's end mark after the last word:
   * 1810's \bert, "BERT", opening three paragraphs; a table row's \specialrule in 1706; a figure's \includegraphics
   * before the text under it in 2307, and in 1706 after a forced break after its panel's title), where the mark stands
   * on the unit's first line (its last). TeX set their ink before the start mark: on that line left of it, or on a line
   * before it (after the end mark: right of it, or on a line after it), never on the unit's own lines, which begin at
   * the one mark and end at the other. So, the piece nearest the mark first:
   * - a head: the glyphs right before the mark on its line, as a label's run takes them (each within LABEL_EM of the
   *   next), those of no unit's, whose characters are the text the probe showed the macro sets (marks.mjs readInkTexts):
   *   the piece is found there, a segment of the first line, which takes them in and erases them, and the layer draws
   *   them where the translation puts the piece;
   * - no glyph of no unit's within LABEL_EM beside the mark (or beside the head found next to it): the piece set nothing
   *   on the line beside the mark, and is EMPTY: the translation draws nothing for it, and its ink, wherever TeX set it,
   *   stays the original's, as the unit's lines never take it;
   * - else it stays LOST, and those beyond it: what the line shows there is not known as the piece's (a label, perhaps).
   * A tail is looked at only where the last line took nothing past the end mark (its closing punctuation)
   */
  function besideMarks(one, tail) {
    const { id: i, rows } = one, M = tail ? one.E : one.S, r = tail ? rows[rows.length - 1] : rows[0]
    if (!M || M.page !== r.page || Math.abs(M.y - r.base) >= 0.5 * r.size) return
    const P = ink[M.page], [cx0, cx1] = sideOf(M.page, columnOf(M.page, M.x, M.x))
    if (tail && [...r.gl, ...(r.extra ?? [])].some(g => mid(P, g) > M.x + 0.05)) return
    const beside = g => (tail ? P.x0[g] >= M.x - 0.05 && P.x1[g] <= cx1 + 1 : P.x1[g] <= M.x + 0.05 && P.x0[g] >= cx0 - 1)
    const cand = band(P, M.y - 0.35 * P.most, M.y + 0.75 * Math.max(P.most, 6)).filter(g => P.y[g] > M.y - 0.35 * P.size[g] && P.y[g] < M.y + 0.75 * Math.max(P.size[g], 6) && beside(g) && P.owner[g] === -1 && !P.taken[g]).sort((a, b) => (tail ? P.x0[a] - P.x0[b] : P.x1[b] - P.x1[a]) || a - b)
    // the run outwards from the mark, nearest first
    const run = []
    let edge = M.x
    for (const g of cand) {
      if ((tail ? P.x0[g] - edge : edge - P.x1[g]) > LABEL_EM * P.size[g]) break
      run.push(g)
      edge = tail ? Math.max(edge, P.x1[g]) : Math.min(edge, P.x0[g])
    }
    for (const h of [...(tail ? one.tails : one.heads)].sort((x, y) => (tail ? x.k - y.k : y.k - x.k))) {
      const { entry } = h, kind = entry.row[2]
      if (!run.length) { entry.row = [i, h.k, kind, PH_FLAG.EMPTY]; entry.state = 'empty'; entry.head = true; continue }
      const text = tail ? null : shown.get(h.src)
      if (!text) return
      let got = '', n = 0
      while (n < run.length && got.length < text.length) { got = charsOf(P.u[run[n]]).replace(/\s+/g, '') + got; n++ }
      if (got !== text.toLowerCase()) return
      const gs = run.splice(0, n)
      let x0 = Infinity, x1 = -Infinity, top = -Infinity, bottom = Infinity
      for (const g of gs) { x0 = Math.min(x0, P.ix0[g]); x1 = Math.max(x1, P.ix1[g]); top = Math.max(top, P.top[g]); bottom = Math.min(bottom, P.bottom[g]) }
      const inkBase = baselineOf(P, bodyOf(P, gs, r.size), r.base)
      const flags = inkBase - r.base >= SHIFT * r.size ? PH_FLAG.RAISED : r.base - inkBase >= SHIFT * r.size ? PH_FLAG.LOWERED : 0
      // the unit's own ink, which its first line takes in and erasing covers
      for (const g of gs) P.owner[g] = i
      r.extra = (r.extra ?? []).concat(gs)
      r.x0 = Math.min(r.x0, x0); r.x1 = Math.max(r.x1, x1); r.top = Math.max(r.top, top); r.bottom = Math.min(r.bottom, bottom)
      const view = viewAt(M.page), [sx0, sb, sx1, st] = solid(view, x0, bottom, x1, top)
      entry.row = [i, h.k, kind, flags, M.page, sx0, Math.min(view[3], Math.max(view[1], r2(r.base))), sx1, st, sb]
      entry.state = 'found'
      entry.head = true
      matchedBy.set(`${i}.${h.k}`, gs.map(g => [M.page, g]))
    }
  }

  /**
   * A unit's first line cut at its start mark, as lineOf cuts a first line (`from`), where the head drop made it the
   * first after its rows were taken: its glyphs left of the mark are no glyph of the unit's (TeX set them before it: a
   * head piece, or ink outside the unit's lines), and go free; its extent is its glyphs' again, with the found pieces'
   * ink it takes in (`extra` and the unit's boxes on it); its baseline stays, on which those pieces' segments stand.
   * But a head text symbol the unit draws as its character (PH_FLAG.TEXT: symbolsOf, which ran before the drop, counted
   * its glyph on this line) keeps its glyph, by symbolsOf's head rule: of its character, nearest the mark and within 1.5
   * em of it, as many as the unit has such symbols, so that it is erased once and drawn once
   */
  function cutAtStart(one) {
    const { id: i, u, rows, S } = one, r = rows[0], P = ink[r.page]
    if (!S || S.page !== r.page) return
    const nf = s => s.normalize('NFKC'), heads = new Map(), held = new Set()
    for (const x of one.symbols ?? []) {
      if (x.entry.state !== 'text' || !u.pieces.slice(0, x.entry.row[1]).every(p => p.t !== 'text' || !/\S/.test(p.s ?? ''))) continue
      heads.set(nf(x.sym), (heads.get(nf(x.sym)) ?? 0) + 1)
    }
    const left = r.gl.filter(g => mid(P, g) < S.x - 0.05 && P.x1[g] >= S.x - 1.5 * r.size).sort((a, b) => P.x1[b] - P.x1[a] || a - b)
    for (const g of left) { const c = nf(P.u[g]), n = heads.get(c) ?? 0; if (n > 0) { held.add(g); heads.set(c, n - 1) } }
    const keep = r.gl.filter(g => mid(P, g) >= S.x - 0.05 || held.has(g))
    if (!keep.length || keep.length === r.gl.length) return
    for (const g of held) (one.headSymbols ??= new Set()).add(g)
    const kept = new Set(keep)
    for (const g of r.gl) if (!kept.has(g) && P.owner[g] === i) P.owner[g] = -1
    const row = rowOf(P, keep, r.page, r.ks, r.base)
    row.base = r.base
    if (r.extra?.length) {
      row.extra = r.extra
      for (const g of r.extra) { row.x0 = Math.min(row.x0, P.ix0[g]); row.x1 = Math.max(row.x1, P.ix1[g]); row.top = Math.max(row.top, P.top[g]); row.bottom = Math.min(row.bottom, P.bottom[g]) }
    }
    for (const [j, B] of one.boxes ?? []) if (j === 0) { row.x0 = Math.min(row.x0, B[0]); row.x1 = Math.max(row.x1, B[2]); row.top = Math.max(row.top, B[3]); row.bottom = Math.min(row.bottom, B[1]) }
    rows[0] = row
  }

  /**
   * A unit's text symbols the marking gave no mark (glued to the word before, at the unit's head), each drawn as its
   * character (PH_FLAG.TEXT, its text the file's pageText) where the unit's own lines on arXiv's page hold that
   * character's ink: its glyphs there, those of no found placeholder of the unit, as many at least as the unit has such
   * symbols and its text pieces that character. The unit's erase takes the line's glyphs, so the character drawn as text
   * replaces the original's, once. LaTeX's \_ in OT1 is a rule, not a glyph: an unowned rule on the line's baseline, as
   * high as a rule of text and an em wide at most, taken into the erase. Any other stays LOST: its rendering not found
   */
  function symbolsOf(one) {
    const { id: i, u, rows } = one
    const theirs = new Set()
    for (const [key, gs] of matchedBy) if (key.startsWith(`${i}.`)) for (const [p, g] of gs) theirs.add(`${p}|${g}`)
    const nf = s => s.normalize('NFKC')
    const need = new Map()
    for (const { sym } of one.symbols) need.set(sym, (need.get(sym) ?? 0) + 1)
    for (const p of u.pieces) if (p.t === 'text') for (const ch of new Set(need.keys())) need.set(ch, need.get(ch) + (nf(p.s).split(nf(ch)).length - 1))
    const have = new Map(), rules = []
    rows.forEach((r, j) => {
      const P = ink[r.page]
      for (const g of r.gl) if (!theirs.has(`${r.page}|${g}`)) { const c = nf(P.u[g]); have.set(c, (have.get(c) ?? 0) + 1) }
      P.boxes.forEach((B, b) => {
        const h = B[3] - B[1], w = B[2] - B[0]
        if (!P.boxTaken[b] && h > 0 && h <= 0.15 * r.size && w > 0 && w <= r.size && B[1] >= r.base - 0.3 * r.size && B[3] <= r.base + 0.3 * r.size && B[0] >= r.x0 - 0.5 * r.size && B[2] <= r.x1 + 0.5 * r.size) rules.push({ j, b, B })
      })
    })
    // a symbol at the unit's head (passedOver: before its start mark) stands before the first line's first word: an
    // unowned glyph of it on that line's baseline, right before the line, is the unit's too
    const head = new Map()
    for (const x of one.symbols) {
      const k = x.entry.row[1]
      if (u.pieces.slice(0, k).every(p => p.t !== 'text' || !/\S/.test(p.s ?? ''))) head.set(x.sym, (head.get(x.sym) ?? 0) + 1)
    }
    const r0 = rows[0], P0 = ink[r0.page]
    for (const [sym, n] of head) {
      let short = need.get(sym) - (have.get(nf(sym)) ?? 0)
      if (short <= 0 || short > n) continue
      const cand = band(P0, r0.base - 0.25 * r0.size, r0.base + 0.25 * r0.size).filter(g => P0.owner[g] === -1 && !P0.taken[g] && nf(P0.u[g]) === nf(sym) && P0.x1[g] <= r0.x0 + 0.05 && P0.x1[g] >= r0.x0 - 1.5 * r0.size).sort((a, b) => P0.x1[b] - P0.x1[a] || a - b)
      for (const g of cand) {
        if (short <= 0) break
        r0.gl.push(g); P0.owner[g] = i; r0.x0 = Math.min(r0.x0, P0.x0[g]); (one.headSymbols ??= new Set()).add(g)
        have.set(nf(sym), (have.get(nf(sym)) ?? 0) + 1)
        short--
      }
    }
    let ruleAt = 0
    for (const [sym, n] of need) {
      const ok = (have.get(nf(sym)) ?? 0) >= n
      const asRule = !ok && sym === '_' && rules.length - ruleAt >= one.symbols.filter(x => x.sym === sym).length
      if (!ok && !asRule) continue
      for (const x of one.symbols) {
        if (x.sym !== sym) continue
        if (asRule) {
          const { j, b, B } = rules[ruleAt++]
          ink[rows[j].page].boxTaken[b] = 1
          one.boxes = (one.boxes ?? []).concat([[j, B]])
        }
        x.entry.row[3] = PH_FLAG.TEXT
        x.entry.state = 'text'
        x.entry.text = sym
      }
    }
  }

  /** a page-text placeholder's text (a citation's, a reference's, as the layer may draw it in the page's face): its
   *  matched glyphs' characters in stream order, a space where arXiv's glyphs stand apart (PDF.js's text layer's own
   *  rule: a gap of TEXT_SPACE of the size) or on another line; null where it is no page text (file.mjs isPageText: a
   *  control or bidi character, a lone surrogate, longer than TEXT_MAX) */
  function pageTextOf(gs) {
    let s = '', last = null
    for (const [p, g] of gs) {
      const P = ink[p]
      if (last) {
        const [o, h] = last, Q = ink[o]
        if (o !== p || Math.abs(P.y[g] - Q.y[h]) > 0.5 * Math.max(P.size[g], Q.size[h]) || P.x0[g] - Q.x1[h] > TEXT_SPACE * Math.max(P.size[g], Q.size[h])) s += ' '
      }
      s += P.u[g]
      last = [p, g]
    }
    s = s.replace(/ +/g, ' ').trim()
    return isPageText(s) ? s : null
  }

  /**
   * A display's segments: its matched glyphs and rules by page, each page's in rows of overlapping vertical extents, a
   * row a segment, and an equation's number at its column's edge on the last page its own last segment; null past
   * SEGS_DISPLAY
   */
  function displaySegments(gs, bs) {
    const pages = [...new Set([...gs.map(([p]) => p), ...bs.map(([p]) => p)])].sort((x, y) => x - y)
    const segs = []
    let numbered = false
    for (const page of pages) {
      const P = ink[page], items = []
      for (const [p, g] of gs) if (p === page) items.push({ g, x0: P.ix0[g], x1: P.ix1[g], top: P.top[g], bottom: P.bottom[g] })
      for (const [p, b] of bs) if (p === page) { const B = P.boxes[b]; items.push({ g: -1, x0: B[0], x1: B[2], top: B[3], bottom: B[1] }) }
      items.sort((x, y) => y.top - x.top || x.x0 - y.x0 || x.g - y.g)
      const lines = []
      for (const it of items) {
        const cur = lines.at(-1)
        if (cur && it.top >= cur.bottom) { cur.items.push(it); cur.bottom = Math.min(cur.bottom, it.bottom); cur.top = Math.max(cur.top, it.top) } else lines.push({ items: [it], top: it.top, bottom: it.bottom })
      }
      // the number: a run of glyphs reading (1), (2.3a), (iv) within an em of its column's text edge, the lowest found,
      // on the display's last page
      let number = null
      if (page === pages.at(-1)) {
        let gx0 = Infinity, gx1 = -Infinity
        for (const it of items) { gx0 = Math.min(gx0, it.x0); gx1 = Math.max(gx1, it.x1) }
        const col = columnOf(page, gx0, gx1), [cx0, cx1] = sideOf(page, col), [ex0, ex1] = edgesOf(page, col) ?? [cx0, cx1]
        for (let l = lines.length - 1; l >= 0 && !number; l--) {
          const glyphs = lines[l].items.filter(it => it.g >= 0).sort((x, y) => x.x0 - y.x0)
          if (!glyphs.length) continue
          const runs = [[glyphs[0]]]
          for (let q = 1; q < glyphs.length; q++) { if (glyphs[q].x0 - runs.at(-1).at(-1).x1 > 0.3 * P.size[glyphs[q].g]) runs.push([]); runs.at(-1).push(glyphs[q]) }
          for (const run of [runs.at(-1), runs[0]]) {
            const s = run.map(it => P.u[it.g]).join('').normalize('NFKC').replace(/\s/g, '')
            const em = median(run.map(it => P.size[it.g])), rx0 = run[0].x0, rx1 = Math.max(...run.map(it => it.x1))
            const edge = run === runs.at(-1) ? ex1 - rx1 <= em : rx0 - ex0 <= em
            if (NUMBER.test(s) && edge) { number = { l, run }; break }
          }
        }
      }
      const segOf = its => {
        let x0 = Infinity, x1 = -Infinity, top = -Infinity, bottom = Infinity
        for (const it of its) { x0 = Math.min(x0, it.x0); x1 = Math.max(x1, it.x1); top = Math.max(top, it.top); bottom = Math.min(bottom, it.bottom) }
        const own = its.filter(it => it.g >= 0).map(it => it.g)
        const base = own.length ? baselineOf(P, bodyOf(P, own, median(own.map(g => P.size[g]))), (top + bottom) / 2) : (top + bottom) / 2
        return { page, x0, x1, top, bottom, base }
      }
      lines.forEach((line, l) => {
        const its = number && number.l === l ? line.items.filter(it => !number.run.includes(it)) : line.items
        if (its.length) segs.push(segOf(its))
      })
      if (number) { segs.push(segOf(number.run)); numbered = true }
    }
    if (!segs.length || segs.length > SEGS_DISPLAY) return null
    segs.numbered = numbered
    return segs
  }

  // ---------------------------------------------------------------- the lines a unit's source does not write
  // A line of the unit's (its anchor's) after its first that carries none of its source's words and no ink of its
  // found placeholders, or a line of four words or more under a fifth of which are its source's, is not the unit's
  // text: a display its source does not hold (TeX set the unit's end mark after it: 1706 page 4, 2608 page 5), another
  // unit's line the anchor took. It is held, as the prototype keeps it (layer2.js): no slot, never erased; at the
  // unit's end it is no line of the unit's at all. A word counts as the source's where the anchor paired it, or where it
  // is a word of three letters or more of the source's text anywhere (a line out of reading order is the unit's still);
  // the rest of a word given in parts (a token of no text, tokenizeDocument) as its first part does: a paragraph's last
  // line that holds only the rest of a word cut by a hyphen ("mod-" / "els.") is the unit's. A word of its own hyphen
  // cut there is one word in the text layer ("fine-" / "tuning.": finetuning), so the source's words count joined too
  function heldOf(one) {
    const { id: i, a, rows } = one
    if (rows.length < 2) return
    const paired = new Set(a.pairs?.values() ?? [])
    const words = new Set([texts[i].text, texts[i].text.replace(/(?<=\p{L})-(?=\p{L})/gu, '')].flatMap(s => tokens(s).map(t => t.t)).filter(t => t.length >= 3 && /\p{L}/u.test(t)))
    const boxed = new Set((one.boxes ?? []).map(([row]) => row))
    /** a row's words, and those of them the source's */
    const wordsOn = r => {
      let n = 0, hits = 0
      for (const k0 of r.ks) {
        let k = k0
        while (k > 0 && doc[k]?.t === '') k--
        const t = doc[k]?.t
        if (!t || !/\p{L}/u.test(t)) continue
        n++
        if (paired.has(k) || words.has(t)) hits++
      }
      return { n, hits }
    }
    const free = r => { const P = ink[r.page]; for (const g of r.gl) if (P.owner[g] === i) P.owner[g] = -1 }
    // at the unit's head: the rows before its start mark's line (a display that opens it, before patch's start mark at
    // its first text) that carry none of its source's words and no ink of its found pieces are no line of the unit's
    // either, as the held rows at its end; then its start mark stands on its first line, which is cut at it as a first
    // line is (lineOf's `from`: no glyph left of the mark is the unit's, a head glued to its first word under GLUE too),
    // and the head pieces are looked for beside the mark there (besideMarks, which the per-unit pass ran on the row the
    // drop took away, the mark on none of its)
    const jS = one.S ? rows.findIndex(r => r.page === one.S.page && Math.abs(one.S.y - r.base) < 0.5 * r.size) : -1
    if (jS > 0 && rows.slice(0, jS).every((r, j) => !r.extra?.length && !boxed.has(j) && wordsOn(r).hits === 0)) {
      for (const r of rows.slice(0, jS)) free(r)
      rows.splice(0, jS)
      one.boxes = (one.boxes ?? []).filter(([row]) => row >= jS).map(([row, b]) => [row - jS, b])
      boxed.clear()
      for (const [row] of one.boxes) boxed.add(row)
      stats.lines.held += jS
      cutAtStart(one)
      if (one.heads) besideMarks(one, false)
    }
    if (rows.length < 2) return
    const held = new Set()
    rows.forEach((r, j) => {
      if (j === 0 || r.extra?.length || boxed.has(j)) return
      const { n, hits } = wordsOn(r)
      if (hits === 0 || (n >= 4 && hits < 0.2 * n)) held.add(j)
    })
    if (!held.size) return
    // held at the unit's end: no line of the unit's
    while (rows.length > 1 && held.has(rows.length - 1)) { free(rows.at(-1)); held.delete(rows.length - 1); rows.pop(); stats.lines.held++ }
    for (const j of held) free(rows[j])
    if (held.size) { one.held = [...held].sort((x, y) => x - y); stats.lines.held += held.size }
  }
  // a LOST piece outside the unit's lines (OUTSIDE): one TeX set before its start mark (the marking passes over it at its
  // head: patch sets the start mark at headEnd; a display, a \url opening a note), where that mark stands on the unit's
  // first line (the rows before it no line of the unit's: above), or a display after its end mark (it ends the unit,
  // after its last words: MARK_DEF sets the end mark before it), where that mark stands on its last line. No line of the
  // unit's holds its ink, which is never erased, and the layer draws it as nothing, its ink the original's
  function outsideOf(one) {
    const { id: i, u, rows, S, E } = one
    if (!one.entries || !rows.length) return
    const on = (M, r) => !!M && M.page === r.page && Math.abs(M.y - r.base) < 0.5 * r.size
    const tail = k => u.pieces.slice(k + 1).every(p => !classOf(p) || classOf(p) === 'display' || (p.t === 'text' && !/\S/.test(p.s ?? '')))
    for (let q = one.entries[0]; q < one.entries[1]; q++) {
      const x = ph[q], k = x.row[1]
      if (x.row[0] !== i || !(x.row[3] & PH_FLAG.LOST)) continue
      if ((k < one.head && on(S, rows[0])) || (x.cls === 'display' && one.last >= 0 && k > one.last && tail(k) && on(E, rows.at(-1)))) { x.row[3] |= PH_FLAG.OUTSIDE; x.outside = true }
    }
  }

  // ---------------------------------------------------------------- labels
  /**
   * A label the unit's first line begins with, before the first of its source's words: a footnote's mark, a bullet, an
   * item's number, set by the class where the unit's start mark stands before it (1706's notes: "∗Equal contribution",
   * "†Work performed …", erased as the note's text and drawn by nobody). Its glyphs, no found placeholder's and no text
   * symbol's, read as a label (LABEL: the prototype's, layer2.js), leave the line and are kept as the original's: the
   * label's row [unit, kind, page, x0, baseline, x1, top, bottom], or null
   */
  function headLabel(one) {
    const { id: i, u, a, rows } = one, r0 = rows[0], P = ink[r0.page]
    const paired = new Set(a.pairs?.values() ?? [])
    const words = new Set(tokens(texts[i].text).map(t => t.t))
    // where its text begins: its first word of the source's (paired, or a word of its text), or its first letter (a mark
    // glued to the first word in the text layer: "5The final model", one token)
    let first = Infinity
    for (const k of r0.ks) { const t = doc[k]; if (t?.t && (paired.has(k) || words.has(t.t))) first = Math.min(first, t.x) }
    for (const g of r0.gl) if (/\p{L}/u.test(P.u[g])) first = Math.min(first, P.x0[g])
    if (!Number.isFinite(first)) return null
    const theirs = new Set()
    for (const [key, gs] of matchedBy) if (key.startsWith(`${i}.`)) for (const [p, g] of gs) if (p === r0.page) theirs.add(g)
    const head = r0.gl.filter(g => P.x1[g] <= first + 0.05).sort((x, y) => P.x0[x] - P.x0[y] || x - y)
    if (!head.length || head.length > 4 || head.some(g => theirs.has(g) || one.headSymbols?.has(g))) return null
    if (!LABEL.test(head.map(g => P.u[g]).join('').normalize('NFKC').replace(/\s+/g, ''))) return null
    const out = new Set(head)
    r0.gl = r0.gl.filter(g => !out.has(g))
    if (!r0.gl.length) { r0.gl = [...out]; return null }
    let lx0 = Infinity
    for (const g of [...r0.gl, ...(r0.extra ?? [])]) lx0 = Math.min(lx0, P.x0[g])
    r0.x0 = lx0
    let x0 = Infinity, x1 = -Infinity, top = -Infinity, bottom = Infinity
    for (const g of head) { P.owner[g] = -1; x0 = Math.min(x0, P.ix0[g]); x1 = Math.max(x1, P.ix1[g]); top = Math.max(top, P.top[g]); bottom = Math.min(bottom, P.bottom[g]) }
    const view = viewAt(r0.page), [la, lc, lb, ld] = solid(view, x0, bottom, x1, top)
    const base = Math.min(ld, Math.max(lc, baselineOf(P, head, r0.base)))
    return [i, LABEL_OF[u.kind] ?? 1, r0.page, la, base, lb, ld, lc]
  }
  const labels = [], labelAt = new Map(), labelRows = new Map()
  const owned = (p, g, unit) => ink[p].owner[g] !== -1 && ink[p].owner[g] !== unit
  function labelOf(one) {
    const { id: i, u, rows, S } = one
    const r0 = rows[0]
    const headOf = () => {
      const head = headLabel(one)
      if (head) { labels.push(head); labelAt.set(head[0], head[3]); labelRows.set(head[0], head); keep(head[2], [head[3], head[7], head[5], head[6]]); one.label = true }
    }
    if (!S || S.page !== r0.page || Math.abs(S.y - r0.base) >= 0.5 * r0.size) { headOf(); return }
    one.label = false
    const P = ink[S.page], [cx0] = sideOf(S.page, columnOf(S.page, S.x, S.x))
    const cand = band(P, S.y - 0.35 * P.most, S.y + 0.75 * Math.max(P.most, 6)).filter(g => P.y[g] > S.y - 0.35 * P.size[g] && P.y[g] < S.y + 0.75 * Math.max(P.size[g], 6) && P.x1[g] <= S.x + 0.05 && P.x0[g] >= cx0 - 1 && !owned(S.page, g, -2) && !P.taken[g]).sort((a, b) => P.x0[a] - P.x0[b] || a - b)
    const run = []
    let edge = S.x
    for (let q = cand.length - 1; q >= 0; q--) { const g = cand[q]; if (edge - P.x1[g] > LABEL_EM * P.size[g]) break; run.unshift(g); edge = Math.min(edge, P.x0[g]) }
    // wholly left of the unit's first line
    const mine = run.filter(g => P.x1[g] <= r0.x0 + 0.01)
    // or the class's own mark that the first line begins with, the unit's start mark set before it
    if (!mine.length) { headOf(); return }
    let x0 = Infinity, x1 = -Infinity, top = -Infinity, bottom = Infinity
    for (const g of mine) { x0 = Math.min(x0, P.ix0[g]); x1 = Math.max(x1, P.ix1[g]); top = Math.max(top, P.top[g]); bottom = Math.min(bottom, P.bottom[g]) }
    const view = viewAt(S.page), [a, c, b, d] = solid(view, x0, bottom, x1, top)
    const base = Math.min(d, Math.max(c, baselineOf(P, mine, S.y)))
    labels.push([i, LABEL_OF[u.kind] ?? 1, S.page, a, base, b, d, c])
    labelAt.set(i, a)
    labelRows.set(i, labels.at(-1))
    keep(S.page, [a, c, b, d])
    one.label = true
  }

  // ---------------------------------------------------------------- erase, frames, rows
  const fontIndex = new Map(), fonts = []
  const fontOf = id => { if (!fontIndex.has(id)) { fontIndex.set(id, fonts.length); fonts.push(names[id]) } return fontIndex.get(id) }
  const outUnits = [], outLines = [], outFrames = [], outErase = [], outHeadings = [], outHeld = []
  const inside = (p, x, y) => (kept.get(p) ?? []).some(([a, c, b, d]) => x >= a && x <= b && y >= c && y <= d)
  const meets = (p, a, c, b, d) => (kept.get(p) ?? []).some(([e, f, g, h]) => a < g && b > e && c < h && d > f)
  function rowsOf(one) {
    const { id: i, u, rows } = one
    // the erase: each line's own glyphs and its placeholders' rules, but what erasing leaves out, merged
    const erase = []
    let refuse = false
    const heldRows = new Set(one.held ?? [])
    rows.forEach((r, j) => {
      // a held line is never erased
      if (heldRows.has(j)) return
      const P = ink[r.page], view = viewAt(r.page)
      const rects = []
      for (const g of new Set([...r.gl, ...(r.extra ?? [])])) if (!inside(r.page, mid(P, g), (P.top[g] + P.bottom[g]) / 2)) rects.push([P.ix0[g], P.bottom[g], P.ix1[g], P.top[g], P.size[g]])
      for (const [row, b] of one.boxes ?? []) if (row === j) rects.push([b[0], b[1], b[2], b[3], r.size])
      rects.sort((p, q) => p[0] - q[0] || p[1] - q[1])
      const merged = []
      for (const e of rects) {
        const last = merged.at(-1)
        const union = last && [Math.min(last[0], e[0]), Math.min(last[1], e[1]), Math.max(last[2], e[2]), Math.max(last[3], e[3]), Math.max(last[4], e[4])]
        if (last && e[0] - last[2] <= MERGE * Math.max(last[4], e[4]) && !meets(r.page, union[0], union[1], union[2], union[3])) merged[merged.length - 1] = union
        else merged.push(e)
      }
      // at most ERASE_MAX: the closest two merged first, where merging covers nothing kept
      while (merged.length > ERASE_MAX) {
        let best = -1, gap = Infinity
        for (let q = 0; q + 1 < merged.length; q++) {
          const a = merged[q], b = merged[q + 1], d = b[0] - a[2]
          if (d < gap && !meets(r.page, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3]))) { gap = d; best = q }
        }
        if (best < 0) { refuse = true; break }
        const a = merged[best], b = merged[best + 1]
        merged.splice(best, 2, [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3]), Math.max(a[4], b[4])])
      }
      for (const e of merged) erase.push(j, ...solid(view, e[0], e[1], e[2], e[3]))
    })
    if (refuse) return
    // lines (each its font's id; the file's index is admit's)
    const lines = []
    for (const r of rows) {
      const view = viewAt(r.page)
      const [x0, bottom, x1, top] = solid(view, r.x0, r.bottom, r.x1, r.top)
      const base = Math.min(top, Math.max(bottom, r2(r.base)))
      lines.push(r.page, x0, x1, base, top, bottom, r2(Math.min(SIZE_MAX, r.size)), r.font)
    }
    // frames: its lines by page and column, in reading order, each with its share of the source and the room below it
    const words = tokens(texts[i].text).length || 1
    const word = new Map()
    if (one.a.pairs) for (const [w, k] of one.a.pairs) if (!word.has(k)) word.set(k, w)
    const fs = []
    rows.forEach((r, j) => {
      const col = columnOf(r.page, r.x0, r.x1), last = fs.at(-1)
      if (last && last.page === r.page && last.col === col) last.n++
      else fs.push({ page: r.page, col, first: j, n: 1 })
    })
    const frames = []
    let share = -1
    for (const [q, f] of fs.entries()) {
      if (q > 0) {
        let w = null
        for (let j = f.first; j < f.first + f.n && w === null; j++) for (const k of rows[j].ks) if (word.has(k)) { w = word.get(k); break }
        share = Math.max(share, 0, w === null ? 0 : Math.min(1000, Math.round((1000 * w) / words)))
      }
      const fr = rows.slice(f.first, f.first + f.n), lastRow = fr.at(-1), P = ink[f.page], view = viewAt(f.page)
      let fx0 = Infinity, fx1 = -Infinity
      for (const r of fr) { fx0 = Math.min(fx0, r.x0); fx1 = Math.max(fx1, r.x1) }
      const foot = lastRow.bottom - 0.5
      let next = -Infinity
      for (let g = 0, end = lowest(P, foot); g < end; g++) if (P.top[g] < foot && P.x1[g] > fx0 && P.x0[g] < fx1 && P.top[g] > next) next = P.top[g]
      const W = view[2] - view[0], H = view[3] - view[1]
      for (const b of P.boxes) if (b[3] < foot && b[2] > fx0 && b[0] < fx1 && b[3] > next && !(b[2] - b[0] >= PAGE_BOX * W && b[3] - b[1] >= 0.75 * H)) next = b[3]
      const below = Math.min(H, Math.max(0, r2(lastRow.bottom - (Number.isFinite(next) ? next : view[1] + FOOT))))
      frames.push(f.page, f.col, f.first, f.n, q === 0 ? -1 : share, below)
    }
    // flags: centred as TeX set the unit's paragraph, where the marked original's log tells it (marks.mjs readAlign: its
    // \leftskip, \rightskip and \parfillskip when it ended; the author's own alignment). Where it does not (a caption
    // \@makecaption centres in an \hbox on one line, the title and front matter, which carry no marks, a cell): centred where
    // every line's centre is its column's and one line at least is short of it by an em; the first line from its label on
    // (a caption's "Figure 1." centred with its text), a line across both columns of a page of two by the text block
    // (blockEdges: the pool of such lines is a few, and 1810.04805's title read 8.7 pt off by its own). A justified one-line
    // paragraph centred by its own glue (\noindent\hfill X\hfill\null, whose skips are the paper's) is centred where its
    // line is on its column's middle and stands off both edges by more than INSET ems
    const told = alignTeX.get(i)
    let centred = rows.length > 0, short = false, inset = rows.length === 1
    rows.forEach((r, j) => {
      if (!centred) return
      const x0 = j === 0 && labelAt.has(i) ? Math.min(r.x0, labelAt.get(i)) : r.x0, em = r.size > 0 ? r.size : 10
      const c = columnOf(r.page, x0, r.x1), e = c === 2 ? blockEdges(r.page) : edgesOf(r.page, c)
      if (!e || Math.abs((x0 + r.x1) / 2 - (e[0] + e[1]) / 2) > CENTRE) { centred = false; return }
      if (e[1] - e[0] - (r.x1 - x0) > em) short = true
      if (!(x0 - e[0] > INSET * em && e[1] - r.x1 > INSET * em)) inset = false
    })
    const isCentred = told === undefined ? centred && short : told === 'c' || (told === 'j' && centred && inset)
    const flags = (u.title ? UNIT_FLAG.TITLE : 0) | (u.front ? UNIT_FLAG.FRONT : 0) | (isCentred ? UNIT_FLAG.CENTRED : 0)
    const depth = Number.isInteger(u.depth) && u.depth >= -1 && u.depth <= 5 ? u.depth : 9
    one.out = { unit: [i, KIND.get(u.kind), depth, flags, u.pieces.length], lines, frames, erase, splits: fs.length > 1 }
  }

  /**
   * Unit i's rows into the file, in the file's order of units (rowsOf's, where it made them): its lines' fonts given the
   * file's index of each; a unit whose faces would take the file past FONTS_MAX names stays the original's (a count never
   * gets it refused)
   */
  function admit(one) {
    const { id: i, u, rows, S, E, out } = one
    if (!out || fonts.length + new Set(rows.map(r => r.font).filter(f => !fontIndex.has(f))).size > FONTS_MAX) return false
    const { lines, frames, erase } = out
    for (let j = 7; j < lines.length; j += 8) lines[j] = fontOf(lines[j])
    outUnits.push(out.unit)
    outLines.push([i, lines])
    outFrames.push([i, frames])
    if (erase.length) outErase.push([i, erase])
    if (one.held?.length) outHeld.push([i, [...one.held]])
    if (u.kind === 'heading') {
      let src = plainSource(u)
      if (src.length > SRC_MAX) src = src.slice(0, /[\ud800-\udbff]/.test(src[SRC_MAX - 1]) ? SRC_MAX - 1 : SRC_MAX)
      outHeadings.push([i, src])
    }
    // stats
    stats.units.located++
    stats.units.byKind[u.kind][0]++
    stats.frames.units++
    if (out.splits) stats.frames.split++
    const n = linesTeX.get(i)
    if (n !== undefined && (u.kind === 'para' || u.kind === 'abstract') && !texts[i].lead && !texts[i].trail && !texts[i].inner) { stats.frames.lineCountChecked++; if (n === rows.length) stats.frames.lineCountEqual++ }
    if (S && S.page === rows[0].page && Math.abs(S.y - rows[0].base) < 0.5 * rows[0].size) stats.baselines.first.push(Math.abs(r2(rows[0].base) - S.y))
    if (E && E.page === rows.at(-1).page && Math.abs(E.y - rows.at(-1).base) < 0.5 * rows.at(-1).size) stats.baselines.last.push(Math.abs(r2(rows.at(-1).base) - E.y))
    return true
  }

  // ---------------------------------------------------------------- the file
  async function assemble() {
    // (all of them: the file's NAMES_MAX is a bound of what a file or a part holds, its refusal, never a truncation here)
    named.sort((p, q) => p.occurrence - q.occurrence)
    // what the file holds of the units it does not: nothing; their placeholders and labels go with them. Each by unit (in
    // the order of the passes over the units' ids, where they ran in it: a unit's own in the order its pass made them)
    const kept1 = new Set(outUnits.map(r => r[0]))
    const phs = ph.slice().sort((x, y) => x.row[0] - y.row[0]), labeled = labels.slice().sort((x, y) => x[0] - y[0])
    // the names, on a page with ink: a name whose face would take the file past FONTS_MAX names stays the original's, and
    // one leading a unit the file does not hold stays with it
    const outNames = []
    const nameWhy = w => { stats.names.why[w] = (stats.names.why[w] ?? 0) + 1 }
    for (const nm of named) {
      const r = nm.row
      if (nm.lead >= 0 && !kept1.has(nm.lead)) { nameWhy('leading a unit the file does not hold'); continue }
      if (!fontIndex.has(r.font) && fonts.length >= FONTS_MAX) { nameWhy('past the fonts a file may name'); continue }
      const view = viewAt(r.page), [x0, bottom, x1, top] = solid(view, r.x0, r.bottom, r.x1, r.top)
      const cx0 = Math.max(view[0] - 1, r2(nm.column[0])), cx1 = Math.min(view[2] + 1, r2(nm.column[1]))
      outNames.push([nm.occurrence, nm.key, r.page, x0, Math.min(top, Math.max(bottom, r2(r.base))), x1, top, bottom, r2(Math.min(SIZE_MAX, r.size)), fontOf(r.font), nm.flags, nm.lead, r2(nm.glue), cx0, cx1])
      stats.names.located++
      if (nm.lead >= 0) stats.names.runIn++
    }
    const file = {
      schema: LAYOUT_SCHEMA, layout: LAYOUT, pdfjs, paper: { id: paper.id, version: paper.version, pages }, left, views, fonts,
      units: outUnits, lines: outLines, frames: outFrames, erase: outErase,
      ph: phs.filter(p => kept1.has(p.row[0])).map(p => p.row), labels: labeled.filter(r => kept1.has(r[0])), headings: outHeadings,
      pageText: phs.filter(p => kept1.has(p.row[0]) && p.text).map(p => [p.row[0], p.row[1], p.text]),
      held: outHeld,
      names: outNames,
      // the paper's \lineskip and \lineskiplimit as TeX gave them (marks.mjs readSkipProbe), which the layer opens a line by
      lineskip: marks.marking.lineskip ?? null,
    }
    // each colour piece's run's fill (marks.mjs readColours), of the units it holds: a key only where one has a row
    const outColours = outUnits.flatMap(r => coloursBy.get(r[0]) ?? [])
    if (outColours.length) file.colours = outColours
    for (const r of outUnits) countColours(r[0])
    stats.ph.texts = file.pageText.length
    Object.assign(stats.match, matcher.stats)
    // the placeholders and labels counted as the file holds them
    for (const p of ph) {
      if (!kept1.has(p.row[0])) continue
      if (p.outside) stats.ph.outside++
      if (p.state === 'unmarked') { stats.ph.unmarked++; continue }
      if (p.state === 'text') { stats.ph.symbols++; continue }
      if (p.head) { stats.ph.heads[p.state === 'found' ? 0 : 1]++; continue }
      const tally = stats.ph.byKind[p.cls] ??= [0, 0]
      stats.ph.marked++
      tally[1]++
      if (p.state === 'found') { stats.ph.found++; tally[0]++; if (p.inferred) stats.ph.inferred++ } else if (p.state === 'empty') stats.ph.empty++
      else if (p.state === 'joined') stats.ph.joined++
      else { stats.ph.lost++; stats.ph.why[p.why] = (stats.ph.why[p.why] ?? 0) + 1 }
    }
    for (const one of placed) {
      if (!kept1.has(one.id) || one.label === undefined) continue
      const tally = stats.labels[one.u.kind] ??= [0, 0]
      tally[1]++
      if (one.label) tally[0]++
    }
    const bytes = new TextEncoder().encode(encodeLayout(file))
    stats.bytes.raw = bytes.length
    let parsed
    try { parsed = parseLayout(bytes, { sized: !parts }) } catch (e) {
      if (!(e instanceof LayoutRefusal)) throw e
      stats.refusal = { path: e.path, why: e.why }
      return { refused: 'bounds', stats }
    }
    stats.bytes.gzip = await gzipSize(bytes)
    const made = parts ? { file: parsed, stats, lines: carrier.pageLines } : { file: parsed, stats }
    if (!wantPlans) return made
    // ---------------------------------------------------------------- the add-on's plans, of the ink read above
    // (each page's as addon.mjs pagePlansOf makes it of the page's operator list read again: the same ink, the same facts)
    // (the plans failing are the add-on's alone, never the file's: `plans` null, why in `plansFailed`; a failed allocation the
    // paper's)
    try {
      const index = indexLayout(parsed), plans = new Map()
      for (let p = 1; p <= pages; p++) {
        if (!ink[p]?.plan) continue
        const plan = pagePlanOf(index, p, planInkOf(ink[p]), () => unpackFacts(facts[p]))
        if (plan) plans.set(p, plan)
      }
      return { ...made, plans }
    } catch (e) {
      if (isMemoryError(e)) throw e
      return { ...made, plans: null, plansFailed: String(e?.message ?? e).slice(0, 200) }
    }
  }

  /** the paper's file: every pass in its order over every unit (makeLayout's) */
  async function whole() {
    const refused = carrying()
    if (refused) return { refused, stats }
    await readWanted()
    anchoring()
    const t = now()
    for (let i = 0; i < units.length; i++) place(i)
    if (!columnEdges) columnEdgesOf()
    for (const [n, a] of at) nameAt(n, a)
    for (const one of placed) phOf(one)
    bars()
    for (const one of placed) heldOf(one)
    for (const one of placed) outsideOf(one)
    for (const one of placed) labelOf(one)
    for (const one of placed) { rowsOf(one); admit(one) }
    stats.ms.rows = now() - t
    return assemble()
  }

  // ---------------------------------------------------------------- the passes as tasks, in any order the whole order allows
  /** a carried position's page where the carrier puts it, whatever that page's ink (a superset of carry's) */
  const carriedPage = (page, x, y) => { const c = carrier.carry(page, x, y); return c && Number.isInteger(c.page) && c.page >= 1 && c.page <= pages ? c.page : null }
  /**
   * The pages unit i's passes read and write, rising: its anchor's, its own marks' carried pages, and every page its pieces'
   * own glyphs, rules and marks are carried to (the matcher's every start: carriedPage's, a superset of where it looks);
   * `carried` carriedPagesOf(i), where a caller made it already
   */
  function unitPages(i, carried = null) {
    const a = anchors.get(i)
    if (!a) return []
    const set = new Set(carried ?? carriedPagesOf(i))
    for (const k of a.tokens) set.add(doc[k].page)
    for (const end of ['s', 'e']) { const m = carriedUnit.get(`${i}${end}`); if (m) set.add(m.page) }
    return [...set].sort((x, y) => x - y)
  }
  /** the pages unit i's own marks and its pieces' own glyphs, rules and marks are carried to (carriedPage's), rising: those
   *  it may touch whatever its anchor (of the pieces phOf matches: designedOf's) */
  function carriedPagesOf(i) {
    const set = new Set()
    const add = v => { if (v !== null) set.add(v) }
    for (const end of ['s', 'e']) { const name = nameOf.get(`${i}${end}`), m = name === undefined || dropped.has(name) ? null : at.get(name); if (m) add(carriedPage(m.page, m.x, m.y)) }
    for (const [, a, b] of designedOf(i)) {
      const A = at.get(a) ?? null, B = at.get(b) ?? null
      for (const M of [A, B]) if (M) add(carriedPage(M.page, M.x, M.y))
      const e = ownInk.get(a)
      if (!e) continue
      const n = e[2]
      for (let j = 3; j < 3 + 5 * n; j += 5) {
        add(carriedPage(e[j], e[j + 1], e[j + 2]))
        for (const M of [A, B]) if (M && M.page === e[j]) add(carriedPage(e[j], e[j + 1], M.y))
      }
      for (let j = 3 + 5 * n; j + 4 < e.length; j += 5) add(carriedPage(e[j], e[j + 1], e[j + 2]))
    }
    return [...set].sort((x, y) => x - y)
  }
  /** the pages a babel name's occurrence reads and writes: its two marks' carried pages */
  function namePages(n) {
    const x = NAME_START.exec(n)
    if (!x) return []
    const set = new Set()
    for (const m of [n, `n${x[1]}.${x[2]}.e`]) { const c = markOf(m); if (c) set.add(c.page) }
    return [...set].sort((p, q) => p - q)
  }
  /**
   * Every pass's tasks, each with its key in the whole order ([pass, its place in it]) and its pages: each unit's place,
   * placeholders, held lines, outside pieces, labels and rows (its pages, unitPages'), each name's occurrence (namePages'),
   * each page's bars ({ q }: of the units whose pages q is among). After carrying() and anchoring(); the columns' edges given
   */
  function tasks() {
    if (!edges) throw new TypeError('the passes as tasks need the columns\' edges given (`columnEdges`)')
    const out = [], on = new Map()
    for (let i = 0; i < units.length; i++) {
      const pg = unitPages(i)
      for (const q of pg) (on.get(q) ?? on.set(q, []).get(q)).push(i)
      out.push({ key: [0, i], pages: pg, run: () => place(i) })
      for (const [x, f] of [[2, phOf], [4, heldOf], [5, outsideOf], [6, labelOf], [7, rowsOf]]) out.push({ key: [x, i], pages: pg, run: () => { const one = placedById.get(i); if (one) f(one) } })
    }
    let n = 0
    for (const [name, a] of at) if (NAME_START.test(name)) out.push({ key: [1, n++], pages: namePages(name), run: () => nameAt(name, a) })
    for (let q = 1; q <= pages; q++) { const ids = on.get(q) ?? []; out.push({ key: [3, q], pages: [q], run: () => barsOn(q, ids) }) }
    return out
  }
  /** a task run on its own pages alone (with `check`, any other's ink throws) */
  const confined = t => () => { allowed = new Set(t.pages); try { t.run() } finally { allowed = null } }
  /** the paper's file, its passes run as tasks in the order `pick` makes of those the whole order allows (runInOrder): the
   *  file whole() makes, the same bytes, where no bound of the paper's (FONTS_MAX) binds */
  async function byTasks(pick) {
    const refused = carrying()
    if (refused) return { refused, stats }
    await readWanted()
    anchoring()
    const t = now()
    runInOrder(tasks().map(x => ({ ...x, run: confined(x) })), pick)
    stats.ph.unmatched = stats.ph.owned - stats.ph.matched
    for (const one of [...placed].sort((x, y) => x.id - y.id)) admit(one)
    stats.ms.rows = now() - t
    return assemble()
  }

  // ---------------------------------------------------------------- the page stream (E2b; stage 2: the marked original too)
  /**
   * The maker a page at a time, the columns' edges given. arXiv's pages are read in order (`readPage(p)`, then `pageRead(p)`);
   * the marked original whole (carrying() first), or a page at a time as well (`marked`: markedPages' head; then each of its
   * pages in order, `markedPage(page)`, and its end, `markedEnd(end)`): each name's mark as its page is read (within that
   * page's view, as the marks file keeps it), the page's tokens drawn and carried (carry.mjs carrier, a page at a time), the
   * pieces found once it was read (stream.mjs ownedPages). A unit's own marks are known once every name that may give them is
   * read; its pieces' own ink once the window has found every piece whose opening point stands on its pieces' pages (the
   * page's `found`; TeX sets a point and its destination at one place), or at the end. As pages are read on both sides: every
   * unit whose own marks are known and carried to pages read (and whose marked pages, which tell those pages' darkness, are
   * read) has them carried (anchoring()'s, a unit at a time); the units are anchored by ranges of a page (pipeline/left-part.mjs
   * rangedAnchors, under `frame`); each anchored unit whose pieces' own ink is known has its passes run as tasks (byTasks'), a
   * task once its pages are decided (no unit or babel name that may touch them is still to be anchored or known) and read and
   * every task before it in the whole order on them has run; a page is let go (its ink and facts dropped) once its tasks have
   * run, its names are taken in and its plan is made (`plans`). A unit's rows are the file's (`layout()`, a unit's as the whole
   * file's parse holds them) once they are made. `finish()` after the last page of each. `released()` the pages from 1 let go;
   * `settled(i)` whether unit i's rows are made or it has none (never anchored, or not placed). With `marked`, the carry's
   * refusal is known at the marked original's end, or for parts once any line is carried (`carryKnown()`, `refused()`); a piece
   * found after its unit's own ink was taken, or a point read twice after its unit's placeholders were matched, is too late
   * (`stats.late`, rows and vetoes: the whole run's file but there)
   */
  function stream({ marked: mh = null } = {}) {
    // (the columns' edges given, a whole run's; or under rule 3 its own, a page at a time: a page's edges read only the pages
    // before it and its own, a cover page's the first later page of its own columns whose pools give it some)
    const ownEdges = !edges && rules.edges === 'earlier'
    if (!edges && !ownEdges) throw new TypeError('the page stream needs the columns\' edges given (`columnEdges`), or rule 3\'s (rules.edges \'earlier\')')
    let edgesTo = 0
    const held = new Set(), bodyOn = new Map()
    const E = ownEdges ? earlierEdges(edges = new Map()) : null
    if (ownEdges) onPlaced = one => { for (const [p, ...line] of bodyLinesOf(one)) (bodyOn.get(p) ?? bodyOn.set(p, []).get(p)).push(line) }
    // (its ranges are placed from their own units: pageFrame over them is not the whole paper's frame, so none is assumed)
    if (!frame) throw new TypeError('the page stream needs the whole document\'s frame rule given (`frame`)')
    // (its ranges are placed from their own units: pageFrame over them is not the whole paper's frame, so none is assumed)
    if (!frame) throw new TypeError('the page stream needs the whole document\'s frame rule given (`frame`)')
    // (the links the locator may want are read as their pages are, after carrying(): none of those pages read before)
    for (const p of wanted ?? []) if (readSoFar.has(p) && theirLinks[p] === undefined) throw new TypeError('the page stream reads arXiv\'s pages after carrying(): a wanted page was read before')
    const floating = id => FLOATING.has(units[id]?.kind ?? '')
    const n = units.length
    // ---- the marked original: whole (carrying() done), or as its pages come, its names first (the head's)
    const M = mh ? mh.pages : 0
    let markedTo = mh ? 0 : Infinity, ended = !mh, refusal = null, foundTo = 1
    const mViews = [], mWords = [], twiceSeen = new Set()
    const follows = mh ? followsOf(units, mh.set) : null
    if (mh) { at = new Map(); ours = []; carrier = carrierFor(ours, doc); carryOver() }
    let X = 0
    /** the last page from 1 read on both sides: arXiv's, and the marked original's that tells its darkness (carry.mjs `over`;
     *  a page past the marked original's last has none of it) */
    const readyTo = () => (markedTo >= M ? X : Math.min(X, markedTo))
    // ---- the names in their order (the marks file's): each page's, each unit key's ([th]?<id>[se]), the babel names', the
    // draft frames'
    unitMarks = new Map(); nameOf = new Map(); startsOn = new Map()
    carriedUnit = new Map(); unplaced = new Set(); linesTeX = new Map(marks.lines); alignTeX = new Map(marks.align ?? []); coloursBy = coloursOf(marks.colours); anchors = new Map()
    const byPage = pageIndex(doc), withWords = new Map(), oursOn = mh ? new Map() : pageIndex(ours)
    const byName = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
    const listed = mh ? mh.named.filter(([, page]) => Number.isInteger(page) && page >= 1 && page <= M).sort(byName) : [...at].map(([nm, m]) => [nm, m.page, m.x, m.y])
    const pageOfName = new Map(), namesOn = new Map(), gOn = new Map(), keyNames = new Map(), keysOn = new Map(), nameList = []
    const push = (map, key, v) => (map.get(key) ?? map.set(key, []).get(key)).push(v)
    listed.forEach(([nm, page, x, y], rank) => {
      pageOfName.set(nm, page)
      if (mh) push(namesOn, page, [nm, x, y])
      if (mh && /^g\d+a$/.test(nm)) push(gOn, page, nm)
      const r = /^[th]?(\d+)([se])$/.exec(nm)
      if (r && Number(r[1]) < n) {
        const k = `${Number(r[1])}${r[2]}`
        push(keyNames, k, [nm, page, rank])
        const on = keysOn.get(page) ?? keysOn.set(page, new Map()).get(page)
        on.set(k, (on.get(k) ?? 0) + 1)
      }
      if (NAME_START.test(nm)) nameList.push(nm)
    })
    // ---- each unit: its keys (final once every name of them is read), its pieces' own ink and marks (known once found)
    const R = rangedAnchors(doc, texts, { floating, floatMatch, frame, forward })
    const keyLeft = new Map([...keyNames].map(([k, list]) => [k, mh ? list.length : 0]))
    const keysLeft = new Int32Array(n), rowsLeft = new Int32Array(n), known = new Uint8Array(n), wantDecide = new Uint8Array(n), phRan = new Uint8Array(n)
    for (const k of keyNames.keys()) keysLeft[Number(k.slice(0, -1))]++
    const rowsAt = new Map(), abAt = new Map(), rowLeast = new Float64Array(n).fill(Infinity)
    if (mh) {
      // (a display group's later display, which TeX gives no point: its ink is found with its group's first)
      const groupHead = new Map()
      for (let i = 0; i < n; i++) for (const [, a] of designedOf(i)) for (const g of follows(a)?.group ?? []) groupHead.set(g, a)
      for (let i = 0; i < n; i++) for (const [, a, b] of designedOf(i)) {
        for (const nm of [a, b]) { const pg = pageOfName.get(nm); if (pg !== undefined) { rowsLeft[i]++; push(abAt, pg, i); rowLeast[i] = Math.min(rowLeast[i], pg) } }
        const rp = mh.pageOf.get(a) ?? (groupHead.has(a) ? mh.pageOf.get(groupHead.get(a)) : undefined)
        if (rp !== undefined) { rowsLeft[i]++; push(rowsAt, rp, i); rowLeast[i] = Math.min(rowLeast[i], rp) }
      }
    }
    // ---- the pages each unit or babel name may touch before it is decided, as a count of the least: an undecided unit's
    // carried pages once it is known (rawLow, its own marks' and pieces'), before, its names' pages but one (a mark of a
    // marked page is carried to arXiv's page of its number or one beside it, carry.mjs); a unit anchored but not known, its
    // anchor's first page too
    const lowCount = new Int32Array(pages + 2), lowOf = new Int32Array(n), counted = new Uint8Array(n)
    let lowAt = 1, decidedTo = 0
    const countLow = (i, v) => {
      v = Math.min(Math.max(1, v), pages + 1)
      if (counted[i]) lowCount[lowOf[i]]--
      lowOf[i] = v; lowCount[v]++; counted[i] = 1
      if (v <= decidedTo) throw new Error(`unit ${i} may touch page ${v}, decided already`)
      if (v < lowAt) lowAt = v
    }
    const decided = new Uint8Array(n)
    // (each known unit's carried pages, as becomeKnown made them: what they read is final once it is known — its marks' and
    // pieces' pages read and carried, a late row dropped — but where a point read twice takes a piece's ink (veto))
    const carriedKnown = new Map()
    // ---- the link-anchor locator's pages (`wanted`, whose links phOf may read: theirsOfUnit): the whole run's, a page's final once
    // no unit that may still want it is unsettled — known, and each of its pieces that name a link judged (judge) — counted by
    // the least page each unsettled unit may want (the pages its marks and pieces are carried to, or before it is known its
    // names' pages but one, as countLow's); a unit's placeholders (phOf) run once every page of theirs is final and its links,
    // where wanted, read (readPage, readLinks)
    const linkLow = new Int32Array(pages + 2), linkLowOf = new Int32Array(n), linkCounted = new Uint8Array(n)
    let linkAt = 1, linkRanTo = 0
    const setLinkLow = (i, v) => {
      v = Math.min(Math.max(1, v), pages + 1)
      if (linkCounted[i]) linkLow[linkLowOf[i]]--
      linkLowOf[i] = v; linkLow[v]++; linkCounted[i] = 1
      if (v <= linkRanTo) throw new Error(`unit ${i} may want page ${v}'s links, its placeholders' passes run already`)
      if (v < linkAt) linkAt = v
    }
    const settleLink = i => { if (linkCounted[i]) { linkLow[linkLowOf[i]]--; linkCounted[i] = 0 } }
    const linkFinal = () => { while (linkAt <= pages && linkLow[linkAt] === 0) linkAt++; return linkAt }
    /** whether a task may read the links of its pages: each final, and read where wanted */
    const linksReady = t => { const w = linkFinal(); return t.pages.every(q => q < w && (!wanted.has(q) || theirLinks[q] !== undefined)) }
    if (linking) {
      if (mh) { wanted = new Set(); pending = []; needed.clear(); pendingOf.fill(0) }
      // (a unit whose pieces wait to be judged: the least page it may want, its range's; the marks given, every unit is known)
      else for (let i = 0; i < n; i++) if (pendingOf[i] > 0) { const [lo] = rangeOf(i); if (lo !== Infinity) setLinkLow(i, lo) }
      onJudged = i => { if (known[i] && pendingOf[i] === 0) settleLink(i) }
    }
    /** unit i's pieces that name a link, made pending or wanted as its own marks and ink become known (the marked original read
     *  a page at a time), those whose pages are read judged */
    const linkKnown = i => {
      if (!linking || !mh || !units[i].pieces.some(linkablePiece)) return
      wantOf(i)
      judge(X)
      const [lo] = rangeOf(i)
      if (pendingOf[i] === 0 || lo === Infinity) settleLink(i)
      else setLinkLow(i, Math.max(lo, linkCounted[i] ? linkLowOf[i] : 1))
    }
    const becomeKnown = i => {
      if (known[i]) return
      known[i] = 1
      linkKnown(i)
      if (decided[i]) return
      const pg = carriedPagesOf(i)
      carriedKnown.set(i, pg)
      countLow(i, Math.min(pg.length ? pg[0] : pages + 1, wantDecide[i] ? lowOf[i] : Infinity))
      if (wantDecide[i]) decide(i)
    }
    const rowDone = i => { if (--rowsLeft[i] === 0 && !keysLeft[i]) becomeKnown(i) }
    // ---- a unit's own marks, carried once the pages they are carried to are read (anchoring()'s, a unit at a time)
    const waits = Array.from({ length: pages + 1 }, () => [])
    let wokeTo = -1
    const markUnit = i => {
      if (R.isMarked(i)) return
      const ks = [`${i}s`, `${i}e`].filter(k => withWords.has(k)), raw = new Map()
      for (const k of ks) raw.set(k, anchorMarkOf(nameOf.get(k)))
      for (const k of ks) {
        if (raw.get(k)) continue
        const other = `${i}${k.endsWith('s') ? 'e' : 's'}`
        if (nameOf.has(other)) raw.set(k, besideOf(nameOf.get(other), raw.get(other), nameOf.get(k)))
      }
      for (const k of ks) { const c = raw.get(k); if (c) carriedUnit.set(k, { page: c.page, x: c.x, y: c.y, t: sameWord(doc, byPage, c, k.endsWith('s'), withWords.get(k).t) }) }
      const b = boundsFromMarks(doc, new Map(ks.filter(k => carriedUnit.has(k)).map(k => [k, carriedUnit.get(k)])), byPage).get(String(i))
      const own = [`${i}s`, `${i}e`].filter(k => unitMarks.has(k))
      if (own.length && (own.some(k => !carriedUnit.has(k)) || (own.length === 2 && !b))) unplaced.add(i)
      R.mark(i, b ?? null)
    }
    /** unit i's own marks known: the pages they are carried to (where its bounds would begin and end), carried once read */
    const marksKnown = i => {
      let w = 0, lo = 0
      for (const end of ['s', 'e']) {
        const k = `${i}${end}`
        if (!withWords.has(k)) continue
        const name = nameOf.get(k), m = dropped.has(name) ? null : at.get(name), c = m ? carriedPage(m.page, m.x, m.y) : null
        if (c !== null) { w = Math.max(w, c); lo = lo ? Math.min(lo, c) : c }
      }
      R.own(i, lo, w)
      if (w <= wokeTo) markUnit(i)
      else waits[w].push(i)
      if (!rowsLeft[i]) becomeKnown(i)
    }
    /** a key's names all read: the last of them the key's mark (the first one's place its place), its word in our compile */
    const finalKey = k => {
      let first = null, last = null
      for (const c of keyNames.get(k)) if (at.has(c[0])) { first ??= c; last = c }
      if (last) {
        const m = at.get(last[0])
        unitMarks.set(k, m); nameOf.set(k, last[0])
        if (k.endsWith('s')) startOn(k, m, first[2])
        const tk = tokenAtMark(ours, oursOn, m, k.endsWith('s'))
        withWords.set(k, { ...m, t: tk == null ? null : ours[tk].t })
      }
      const i = Number(k.slice(0, -1))
      if (--keysLeft[i] === 0) marksKnown(i)
    }
    const wake = () => {
      const to = Math.min(readyTo(), pages)
      for (let q = wokeTo + 1; q <= to; q++) for (const i of waits[q]) markUnit(i)
      wokeTo = Math.max(wokeTo, to)
    }
    // ---- the tasks, a queue a page; a page's opened once it is decided and read
    const queue = new Map(), touching = new Map(), work = []
    const cmp = (x, y) => { for (let j = 0; j < Math.max(x.length, y.length); j++) { const d = (x[j] ?? -Infinity) - (y[j] ?? -Infinity); if (d) return d } return 0 }
    const insert = t => {
      for (const q of t.pages) {
        const Q = queue.get(q) ?? queue.set(q, { list: [], head: 0 }).get(q)
        // (a page's tasks are all known before any of them runs: it is decided after every unit that may touch it is)
        if (Q.head > 0 || q <= decidedTo) throw new Error(`a task of page ${q} came after the page was decided`)
        let at = Q.list.length
        while (at > 0 && cmp(Q.list[at - 1].key, t.key) > 0) at--
        Q.list.splice(at, 0, t)
      }
    }
    let decidedCount = 0, releasedTo = 0
    const settledU = new Uint8Array(n), released = new Uint8Array(pages + 2)
    const inFile = new Set(), unitRows = new Map(), nameRows = new Map(), namedOn = new Map()
    const plans = wantPlans ? new Map() : null
    let plansFailed = null
    /** unit i's rows as the whole file's parse holds them (encodeLayout's numbers, parseLayout's zeroes): the file's
     *  index of its lines' fonts the one `fonts` holds the names of */
    const fileRowsOf = one => {
      const i = one.id
      if (!admit(one)) return
      inFile.add(i)
      const last = (list, j = 0) => (list.at(-1)?.[j] === i ? [list.at(-1)] : [])
      const phs = [], texts_ = []
      for (let x = one.entries?.[0] ?? 0; x < (one.entries?.[1] ?? 0); x++) { phs.push(ph[x].row); if (ph[x].text) texts_.push([ph[x].row[0], ph[x].row[1], ph[x].text]) }
      const mini = { fonts: [], units: [outUnits.at(-1)], lines: [outLines.at(-1)], frames: [outFrames.at(-1)], erase: last(outErase), ph: phs, labels: labelRows.has(i) ? [labelRows.get(i)] : [], headings: last(outHeadings), pageText: texts_, held: last(outHeld), names: [], colours: coloursBy.get(i) ?? [] }
      unitRows.set(i, JSON.parse(JSON.stringify(layoutPartRows(mini))))
      // (admit's file of the whole holds none of them here: the stream's rows are unitRows')
      outUnits.length = 0; outLines.length = 0; outFrames.length = 0; outErase.length = 0; outHeld.length = 0; outHeadings.length = 0
    }
    /** a unit settled: what its passes held let go (its lines' glyphs, its anchor, its pieces' matches); its rows are the file's */
    const freeUnit = one => {
      for (let x = one.entries?.[0] ?? 0; x < (one.entries?.[1] ?? 0); x++) matchedBy.delete(`${ph[x].row[0]}.${ph[x].row[1]}`)
      anchors.delete(one.id)
      one.rows = null; one.a = null; one.boxes = null; one.out = null; one.heads = null; one.tails = null; one.symbols = null; one.headSymbols = null
    }
    /** the rows K reads of a unit told (layer-proto/cut.mjs entriesOf: its unit row, its lines' pages, its placeholders'
     *  segments' pages and its labels' pages), one row a page: what the cut of the parts after its own reads of it */
    const stubOf = (i, r) => {
      // (whole strides alone, as cut.mjs pagesAt reads them: a placeholder row's fill, last, is no segment's page)
      const pagesIn = (rows, at, stride) => { const set = new Set(); for (const v of rows) for (let j = at; j + stride <= v.length; j += stride) set.add(v[j]); return [...set] }
      const lines = pagesIn(r.lines.map(e => e[1]), 0, 8), segs = pagesIn(r.ph, 4, 6), labels = [...new Set(r.labels.map(l => l[2]))]
      return {
        units: r.units, lines: lines.length ? [[i, lines.flatMap(p => [p, 0, 0, 0, 0, 0, 0, 0])]] : [], ph: segs.length ? [[i, 0, 0, 0, ...segs.flatMap(p => [p, 0, 0, 0, 0, 0])]] : [],
        labels: labels.map(p => [i, 0, p, 0, 0, 0, 0, 0]), frames: [], erase: [], headings: [], pageText: [], held: [],
      }
    }
    /** unit i's anchor final: its passes as tasks on its pages (unitPages'), once its pieces' own ink is known; till then its
     *  anchor's first page kept from deciding */
    const decide = i => {
      if (decided[i]) return
      const a = anchors.get(i)
      if (a && !known[i]) {
        if (!wantDecide[i]) {
          wantDecide[i] = 1
          let least = Infinity
          for (const k of a.tokens) least = Math.min(least, doc[k].page)
          if (least < lowOf[i]) countLow(i, least)
        }
        return
      }
      decided[i] = 1
      decidedCount++
      if (counted[i]) { lowCount[lowOf[i]]--; counted[i] = 0 }
      if (!a) { settledU[i] = 1; return }
      const pg = unitPages(i, carriedKnown.get(i))
      carriedKnown.delete(i)
      for (const q of pg) (touching.get(q) ?? touching.set(q, []).get(q)).push(i)
      const of = f => () => { const one = placedById.get(i); if (one) f(one) }
      insert({ key: [0, i], pages: pg, run: () => place(i) })
      insert({ key: [2, i], pages: pg, run: () => { phRan[i] = 1; of(phOf)() } })
      for (const [x, f] of [[4, heldOf], [5, outsideOf], [6, labelOf]]) insert({ key: [x, i], pages: pg, run: of(f) })
      insert({ key: [7, i], pages: pg, run: () => { of(one => { rowsOf(one); fileRowsOf(one); freeUnit(one) })(); settledU[i] = 1 } })
    }
    const onAnchor = (id, an) => { anchors.set(id, an); decide(id) }
    /** the pages decided: before every range still to be anchored, and before the least page an undecided unit or babel name
     *  may touch */
    const decidable = () => {
      while (lowAt <= pages && lowCount[lowAt] === 0) lowAt++
      if (decidedCount === n) return Math.min(lowAt - 1, pages)
      return Math.min(R.am - 1, lowAt - 1, pages)
    }
    /** the last page of each column count (the marks' columns, known from the head): past it no page's pools of that count move */
    const lastOfColumns = new Map()
    if (ownEdges) for (let r = 1; r <= pages; r++) lastOfColumns.set(twoCols(r), r)
    /** page q's rule-3 edges, after every unit placed on it and the pages before it (their pools first, in page order); a cover
     *  page's passes after the place held until a later page's pools give it its edges (earlierEdges: the first later page of its
     *  own columns, not merely one with edges of its own), or until the last page of its columns has passed (its pools move no
     *  more: none will come), every one at the last page */
    const edgesTask = q => ({
      key: [0.5, q], pages: [q], edgesOf: q,
      run: () => {
        E.page(q, bodyOn.get(q) ?? [])
        bodyOn.delete(q)
        edgesTo = q
        const waiting = E.waiting()
        if (waiting.includes(q) && q < pages) held.add(q)
        for (const p of [...held]) if (q === pages || q >= lastOfColumns.get(twoCols(p)) || !waiting.includes(p)) { work.push(p); held.delete(p) }
        work.push(q + 1)
      },
    })
    const advance = () => {
      const to = decidable()
      for (let q = decidedTo + 1; q <= to; q++) {
        const ids = (touching.get(q) ?? []).slice().sort((x, y) => x - y)
        insert({ key: [3, q], pages: [q], run: () => barsOn(q, ids) })
        if (ownEdges) insert(edgesTask(q))
      }
      for (let q = decidedTo + 1; q <= to; q++) work.push(q)
      decidedTo = Math.max(decidedTo, to)
    }
    const open = q => q <= decidedTo && q <= readyTo()
    /** a page let go: its names taken into the file, its plan made, its ink and facts dropped */
    const release = q => {
      if (released[q] || !open(q)) return
      const Q = queue.get(q)
      if (Q && Q.head < Q.list.length) return
      for (const nm of namedOn.get(q) ?? []) nameRowOf(nm)
      if (plans && pagesInk[q]?.plan) {
        try {
          const ids = (touching.get(q) ?? []).filter(i => unitRows.has(i)).sort((x, y) => x - y)
          const plan = pagePlanOf(indexLayout(partOf(ids, [...(namedOn.get(q) ?? [])].map(nm => nameRows.get(nm.occurrence)).filter(Boolean))), q, planInkOf(pagesInk[q]), () => unpackFacts(facts[q]))
          if (plan) plans.set(q, plan)
        } catch (e) {
          if (isMemoryError(e)) throw e
          plansFailed ??= String(e?.message ?? e).slice(0, 200)
        }
      }
      pagesInk[q] = null
      facts[q] = null
      // (and what its tasks held: every one of them ran)
      queue.delete(q); touching.delete(q); namedOn.delete(q); kept.delete(q)
      released[q] = 1
      while (released[releasedTo + 1]) releasedTo++
    }
    const pump = () => {
      while (work.length) {
        const q = work.pop(), Q = queue.get(q)
        if (!open(q)) continue
        const t = Q?.list[Q.head]
        if (!t) { release(q); continue }
        if (!t.pages.every(p => open(p) && queue.get(p).list[queue.get(p).head] === t)) continue
        // (rule 3's edges a page at a time in page order; a cover page's passes after them held)
        if (t.edgesOf !== undefined && t.edgesOf !== edgesTo + 1) continue
        if (held.size && t.key[0] >= 1 && t.pages.some(p => held.has(p))) continue
        // (a unit's placeholders once the links of its pages are final and read: the link-anchor locator's)
        if (t.key[0] === 2 && linking) { if (!linksReady(t)) continue; for (const p of t.pages) if (p > linkRanTo) linkRanTo = p }
        allowed = new Set(t.pages)
        try { t.run() } finally { allowed = null }
        for (const p of t.pages) { queue.get(p).head++; work.push(p) }
      }
    }
    /** a name taken into the file as assemble takes it: the unit it leads held, its face within FONTS_MAX */
    const nameWhy = w => { stats.names.why[w] = (stats.names.why[w] ?? 0) + 1 }
    const nameRowOf = nm => {
      const r = nm.row
      if (nm.lead >= 0 && !inFile.has(nm.lead)) { nameWhy('leading a unit the file does not hold'); return }
      if (!fontIndex.has(r.font) && fonts.length >= FONTS_MAX) { nameWhy('past the fonts a file may name'); return }
      const view = viewAt(r.page), [x0, bottom, x1, top] = solid(view, r.x0, r.bottom, r.x1, r.top)
      const cx0 = Math.max(view[0] - 1, r2(nm.column[0])), cx1 = Math.min(view[2] + 1, r2(nm.column[1]))
      const row = [nm.occurrence, nm.key, r.page, x0, Math.min(top, Math.max(bottom, r2(r.base))), x1, top, bottom, r2(Math.min(SIZE_MAX, r.size)), fontOf(r.font), nm.flags, nm.lead, r2(nm.glue), cx0, cx1]
      nameRows.set(nm.occurrence, JSON.parse(JSON.stringify(layoutPartRows({ fonts: [], units: [], lines: [], frames: [], erase: [], ph: [], labels: [], headings: [], pageText: [], held: [], names: [row] }).names[0])))
      stats.names.located++
      if (nm.lead >= 0) stats.names.runIn++
    }
    /** the rows of units `ids` (rising) and names `rows`, as a layout file holds them (its views and pages the paper's) */
    const partOf = (ids, rows) => {
      const out = { schema: LAYOUT_SCHEMA, layout: LAYOUT, pdfjs, paper: { id: paper.id, version: paper.version, pages }, left, views, fonts: fonts.slice(), lineskip: marks.marking.lineskip ?? null }
      for (const key of ['units', 'lines', 'frames', 'erase', 'ph', 'labels', 'headings', 'pageText', 'held']) out[key] = []
      for (const i of ids) { const r = unitRows.get(i); for (const key of ['units', 'lines', 'frames', 'erase', 'ph', 'labels', 'headings', 'pageText', 'held']) out[key].push(...r[key]) }
      out.names = rows
      // (each colour piece's run's fill: a key only where a unit of the part has one)
      const colours = ids.flatMap(i => unitRows.get(i).colours ?? [])
      if (colours.length) out.colours = colours
      return out
    }
    // ---- the babel names, each a task on the pages its marks are carried to and those of the unit it would lead (nameAt
    // reads that unit's carried start mark), made once those marks are known: its two marks read, the unit starts on its end
    // mark's page known (the unit it leads, leadAt) and that unit's own marks
    const nameReady = nm => {
      if (pageOfName.get(nm) > markedTo) return false
      const x = NAME_START.exec(nm), e = `n${x[1]}.${x[2]}.e`, pe = pageOfName.get(e)
      if (pe !== undefined && pe > markedTo) return false
      const b = dropped.has(e) ? null : at.get(e)
      if (!b) return true
      for (const k of keysOn.get(b.page)?.keys() ?? []) if (k.endsWith('s') && keyLeft.get(k) > 0) return false
      const lead = leadAt(b)
      return lead < 0 || ['s', 'e'].every(end => !(keyLeft.get(`${lead}${end}`) > 0))
    }
    const nameTask = (nm, rank) => {
      // (a name with no mark of the file's is met by no pass)
      if (!at.has(nm)) return
      const a = at.get(nm), x = NAME_START.exec(nm)
      const set = new Set(), e = `n${x[1]}.${x[2]}.e`, b = dropped.has(e) ? null : at.get(e)
      for (const m of [nm, e]) { const p = dropped.has(m) ? null : at.get(m), c = p ? carriedPage(p.page, p.x, p.y) : null; if (c !== null) set.add(c) }
      if (b) {
        const lead = leadAt(b)
        if (lead >= 0) for (const end of ['s', 'e']) { const name = nameOf.get(`${lead}${end}`), m = name === undefined || dropped.has(name) ? null : at.get(name), c = m ? carriedPage(m.page, m.x, m.y) : null; if (c !== null) set.add(c) }
      }
      const t = {
        key: [1, rank], pages: [...set].sort((p, q) => p - q),
        run: () => {
          const before = named.length
          nameAt(nm, a)
          for (let j = before; j < named.length; j++) { const pg = named[j].row.page; (namedOn.get(pg) ?? namedOn.set(pg, []).get(pg)).push(named[j]) }
        },
      }
      // (a name carried to no page reads no ink: it is not located, whatever runs before it)
      if (t.pages.length) insert(t)
      else t.run()
    }
    /** the names still to be made a task, in their order, each with the least page it may touch counted (its marks' pages but
     *  one, and the end marks' of the units starting on its end mark's page) */
    const pendingNames = []
    const resolveNames = () => {
      let kept = 0
      for (const x of pendingNames) {
        if (!nameReady(x.nm)) { pendingNames[kept++] = x; continue }
        lowCount[x.low]--
        nameTask(x.nm, x.rank)
      }
      pendingNames.length = kept
    }
    // ---- the units' and names' state before any page (the whole marked original's: every one known)
    if (mh) {
      for (let i = 0; i < n; i++) {
        if (!keysLeft[i] && !rowsLeft[i]) continue
        let least = Infinity, most = -Infinity
        for (const k of [`${i}s`, `${i}e`]) for (const [, pg] of keyNames.get(k) ?? []) { least = Math.min(least, pg); most = Math.max(most, pg) }
        // (where its bounds may be, before its own marks are known: their pages and one beside)
        if (keysLeft[i] && R.lastPage) R.own(i, Math.min(Math.max(1, least - 1), R.lastPage), Math.min(most + 1, R.lastPage))
        least = Math.min(least, rowLeast[i])
        countLow(i, least === Infinity ? pages + 1 : least - 1)
      }
      // (the least page a unit with a piece that names a link may want, before it is known: its own marks' and those pieces'
      // points' pages but one, as countLow's; a piece's own glyphs stand between its points)
      if (linking) for (let i = 0; i < n; i++) {
        if (!units[i].pieces.some(linkablePiece)) continue
        let least = Infinity
        for (const k of [`${i}s`, `${i}e`]) for (const [, pg] of keyNames.get(k) ?? []) least = Math.min(least, pg)
        units[i].pieces.forEach((piece, k) => { if (linkablePiece(piece)) for (const nm of [`p${i}.${k}a`, `p${i}.${k}b`]) { const pg = pageOfName.get(nm); if (pg !== undefined) least = Math.min(least, pg) } })
        if (least !== Infinity) setLinkLow(i, least - 1)
      }
    }
    for (let i = 0; i < n; i++) if (!keysLeft[i]) marksKnown(i)
    for (const k of keyNames.keys()) if (!keyLeft.get(k)) finalKey(k)
    nameList.forEach((nm, rank) => {
      if (!mh) { nameTask(nm, rank); return }
      const x = NAME_START.exec(nm), e = `n${x[1]}.${x[2]}.e`, pe = pageOfName.get(e), ps = [pageOfName.get(nm)]
      if (pe !== undefined) {
        ps.push(pe)
        for (const k of keysOn.get(pe)?.keys() ?? []) if (k.endsWith('s')) for (const [, pg] of keyNames.get(`${k.slice(0, -1)}e`) ?? []) ps.push(pg)
      }
      const low = Math.min(Math.max(1, Math.min(...ps) - 1), pages + 1)
      lowCount[low]++
      if (low < lowAt) lowAt = low
      pendingNames.push({ nm, rank, low })
    })
    if (mh) resolveNames()
    wake()

    /** what is ready run: the units whose marks' pages are read carried, the ranges anchored, the pages decided, their tasks;
     *  `anchor` false, the ranges left to the step of arXiv's page read next (a marked page's, read before it: what the two
     *  steps anchor is the same, the second's at once) */
    const step = (anchor = true) => {
      if (refusal) return
      wake()
      if (anchor) R.run(onAnchor, decide)
      advance()
      for (let q = Math.max(1, releasedTo + 1); q <= Math.min(readyTo(), decidedTo); q++) work.push(q)
      pump()
      dropUnwanted()
    }
    /** the held links of the pages no unit may want now (each before the link frontier, and not wanted) let go */
    const dropUnwanted = () => {
      if (!heldTheirs.size) return
      const w = linking ? linkFinal() : Infinity
      for (const q of [...heldTheirs.keys()]) if (q < w && !wanted?.has(q)) dropHeld(q)
    }
    /** arXiv's page p read (after readPage(p), pages in order) */
    function pageRead(p) {
      X = p
      step()
    }
    // ---- the marked original's pages, as they are read
    const OPENING_ROW = /^[pn](\d+)\.(\d+)a$/
    /** a piece found: its row, but where its unit's own ink was taken already (too late: dropped, counted) */
    const takeRow = (name, row) => {
      const m = OPENING_ROW.exec(name), i = m ? Number(m[1]) : -1
      if (i >= 0 && i < n && known[i] && designedOf(i).some(([, a]) => a === name)) { stats.late.rows++; return }
      ownInk.set(name, row)
    }
    /** points read twice (stream.mjs `repeats`): 'a mark set twice' on their pieces, as readMarked sets it at the end
     *  (vetoTwice); counted where the piece's unit's placeholders were matched already */
    const veto = names => {
      for (const r of names) {
        twiceSeen.add(r)
        const o = /^[pn]\d+\.\d+b$/.test(r) ? `${r.slice(0, -1)}a` : r, m = OPENING_ROW.exec(o), i = m ? Number(m[1]) : -1
        if (i >= 0 && i < n && phRan[i]) stats.late.vetoes++
        // (the carried pages of its unit and of its group's displays' made again: their ink taken)
        if (i >= 0) carriedKnown.delete(i)
        for (const g of follows(o)?.group ?? []) { const x = OPENING_ROW.exec(g); if (x) carriedKnown.delete(Number(x[1])) }
      }
      vetoTwice(ownInk, twiceSeen, follows)
    }
    /** the marked original's page p (markedPages' page, pages in order) */
    function markedPage(page) {
      if (!mh || ended) throw new Error('the marked original is not read a page at a time here, or its end was given')
      const { p } = page
      if (p !== markedTo + 1) throw new RangeError(`the marked page ${p} after page ${markedTo}`)
      const t = now()
      for (const v of page.view) mViews.push(v)
      for (const w of page.words) mWords.push(w)
      // its marks, in the names' order, each on its page's view (the marks file's)
      for (const [nm, x, y] of namesOn.get(p) ?? []) if (markAt(mViews, M, p, x, y)) at.set(nm, { page: p, x: r2z(x), y: r2z(y) })
      // its draft frames, its tokens drawn, carried
      const frames = []
      for (const nm of gOn.get(p) ?? []) { const a = at.get(nm), f = a ? frameAt(nm, a) : null; if (f) frames.push(f) }
      const drawn = drawnOf(frames), from = ours.length, over = carrier.over.length
      for (const tk of tokensOfMarks({ tokens: page.tokens, words: mWords })) if (drawn(tk)) { push(oursOn, tk.page, ours.length); ours.push(tk) }
      carrier.add(from, ours.length)
      overFrom(over)
      markedTo = p
      // its links (the paper's where it has any: the head's verdict), the pieces found once it was read, and the points read again
      if (linking) takeLinks(page.links)
      for (const [name, row] of page.owned) takeRow(name, row)
      if (page.repeats.length) veto(page.repeats)
      else if (twiceSeen.size && page.owned.length) vetoTwice(ownInk, twiceSeen, follows)
      // what is known now: each key whose names are all read, the pieces' marks on it, the pieces before `found`
      for (const [k, c] of keysOn.get(p) ?? []) { const left = keyLeft.get(k) - c; keyLeft.set(k, left); if (left === 0) finalKey(k) }
      for (const i of abAt.get(p) ?? []) rowDone(i)
      for (; foundTo < page.found; foundTo++) for (const i of rowsAt.get(foundTo) ?? []) rowDone(i)
      resolveNames()
      stats.ms.carry += now() - t
      // (arXiv's page X + 1 is read next, while one is left: its step anchors)
      step(X >= pages)
    }
    /** the marked original's end (markedPages' end, after its last page): the pieces found at its end, its points read twice,
     *  every piece known; the carry's share */
    function markedEnd(end) {
      if (!mh || ended) throw new Error('the marked original is not read a page at a time here, or its end was given')
      if (markedTo !== M) throw new RangeError(`the marked original's end after page ${markedTo} of ${M}`)
      const t = now()
      ended = true
      for (const [name, row] of end.owned) takeRow(name, row)
      const more = [...end.twice].filter(r => !twiceSeen.has(r))
      if (more.length) veto(more)
      else if (twiceSeen.size && end.owned.length) vetoTwice(ownInk, twiceSeen, follows)
      for (; foundTo <= M; foundTo++) for (const i of rowsAt.get(foundTo) ?? []) rowDone(i)
      resolveNames()
      refusal = shareOf()
      stats.ms.carry += now() - t
      step()
    }
    /** every page read (and the marked original's end): the rest anchored, every task run, every page let go */
    function finish() {
      if (!ended) throw new Error('the marked original\'s end was not given')
      if (refusal) throw new Error(`the layout is refused: ${refusal}`)
      X = pages
      if (linking && pending?.length) throw new Error('a piece that names a link was never judged: every page is read')
      for (let i = 0; i < n; i++) if (!R.isMarked(i)) markUnit(i)
      R.run(onAnchor, decide)
      for (let u = 0; u < n; u++) decide(u)
      advance()
      for (let q = 1; q <= pages; q++) work.push(q)
      pump()
      for (const q of [...heldTheirs.keys()]) dropHeld(q)
      for (const [q, Q] of queue) if (Q.head < Q.list.length) throw new Error(`page ${q}'s tasks did not all run`)
      for (let q = 1; q <= pages; q++) if (!released[q]) throw new Error(`page ${q} was not let go`)
      stats.ph.unmatched = stats.ph.owned - stats.ph.matched
      // (the placeholders and labels counted as the file holds them: assemble's)
      for (const e of ph) {
        if (!inFile.has(e.row[0])) continue
        if (e.outside) stats.ph.outside++
        if (e.state === 'unmarked') { stats.ph.unmarked++; continue }
        if (e.state === 'text') { stats.ph.symbols++; continue }
        if (e.head) { stats.ph.heads[e.state === 'found' ? 0 : 1]++; continue }
        const tally = stats.ph.byKind[e.cls] ??= [0, 0]
        stats.ph.marked++
        tally[1]++
        if (e.state === 'found') { stats.ph.found++; tally[0]++; if (e.inferred) stats.ph.inferred++ } else if (e.state === 'empty') stats.ph.empty++
        else if (e.state === 'joined') stats.ph.joined++
        else { stats.ph.lost++; stats.ph.why[e.why] = (stats.ph.why[e.why] ?? 0) + 1 }
      }
      for (const one of placed) {
        if (!inFile.has(one.id) || one.label === undefined) continue
        const tally = stats.labels[one.u.kind] ??= [0, 0]
        tally[1]++
        if (one.label) tally[0]++
      }
      stats.ph.texts = [...unitRows.values()].reduce((m, r) => m + r.pageText.length, 0)
      for (const i of inFile) countColours(i)
      Object.assign(stats.match, matcher.stats)
    }
    return {
      pageRead, markedPage, markedEnd, finish, plans, plansFailed: () => plansFailed,
      /** the wanted pages' links read up to arXiv's page read last (readPage reads them as it reads a page): where no readPage
       *  follows a marked page, and before finish() */
      readLinks: async () => { for (const q of [...(wanted ?? [])].sort((a, b) => a - b)) if (q <= X) await readTheirs(q) },
      /** whether the carry's refusal is known: the marked original read whole, or to its end, or (for parts) a line carried */
      carryKnown: () => ended || (parts && carrier.lines.total > 0),
      /** the carry's refusal ('carry'), once the marked original's end is given; null else */
      carryRefusal: () => refusal,
      /** the file's rows of the units settled so far (`ids`, rising: those of them it holds) and the names taken in */
      layout: (ids = [...unitRows.keys()].sort((x, y) => x - y)) => partOf(ids.filter(i => unitRows.has(i)), [...nameRows.keys()].sort((x, y) => x - y).map(k => nameRows.get(k))),
      released: () => releasedTo,
      settled: i => settledU[i] === 1,
      /** units `ids` told by the parts through page `through`: their rows the stubs K reads (stubOf), the names on those pages
       *  and their plans let go */
      tell: (ids, through) => {
        for (const i of ids) { const r = unitRows.get(i); if (r && !r.stub) unitRows.set(i, { ...stubOf(i, r), stub: true }) }
        for (const [k, row] of nameRows) if (row[2] <= through) nameRows.delete(k)
        if (plans) for (const p of plans.keys()) if (p <= through) plans.delete(p)
      },
      /** where the stream stands: the page read last (and the marked original's), the pages anchored, decided and let go */
      progress: () => {
        let held = 0, glyphs = 0
        for (let q = 1; q <= pages; q++) if (pagesInk[q]) { held++; glyphs += pagesInk[q].n }
        return { read: X, ...(mh ? { marked: markedTo } : {}), anchored: R.am - 1, decided: decidedTo, released: releasedTo, held, glyphs }
      },
    }
  }
  /**
   * The paper's rows made a page at a time (stream's), every page read here: the stream, finished, or the carry's refusal.
   * `marked` { head, events }: the marked original read a page at a time as well (markedPages' head, and its events after it:
   * each page, then the end), its page p read before arXiv's page p; else it was read whole (the marks given), carried first
   */
  async function byStream(marked = null) {
    if (!marked) {
      const refused = carrying()
      if (refused) return { refused, stats }
    }
    const t = now()
    const st = stream(marked ? { marked: marked.head } : {})
    st.trace = []
    const it = marked ? marked.events[Symbol.asyncIterator]() : null
    const M = marked ? marked.head.pages : 0
    for (let p = 1; p <= Math.max(M, pages); p++) {
      if (p <= M) { const x = await it.next(); if (x.done || !x.value.page) throw new Error(`the marked original gave no page ${p}`); st.markedPage(x.value.page) }
      if (p <= pages) { await readPage(p); st.pageRead(p) } else await st.readLinks()
      st.trace.push(st.progress())
    }
    if (marked) {
      const x = await it.next()
      if (x.done || !x.value.end) throw new Error('the marked original gave no end')
      st.markedEnd(x.value.end)
      if (st.carryRefusal()) return { refused: st.carryRefusal(), stats }
    }
    await st.readLinks()
    st.finish()
    stats.ms.rows = now() - t
    return st
  }
  return { pages, stats, readPage, whole, byTasks, stream, byStream, carrying, edges: () => edges, pageLines: () => carrier?.pageLines ?? new Map(), drawOf, drawJsonOf, drawStats, draw: wantDraw }
}

/**
 * Tasks run in an order the whole order allows: each { key, pages, run }, `key` its place in the whole order (compared
 * element by element), `pages` what it reads and writes; a task runs once every task before it in the whole order that
 * shares a page with it has run (each page's tasks in the whole order), so that each page sees its tasks as the whole
 * order runs them. `pick(ready)` the index of the next among those that may run (the first by default). Throws where a task
 * cannot run (no task may wait for itself: the order is total)
 */
export function runInOrder(tasks, pick = () => 0) {
  const cmp = (x, y) => { for (let j = 0; j < Math.max(x.key.length, y.key.length); j++) { const d = (x.key[j] ?? -Infinity) - (y.key[j] ?? -Infinity); if (d) return d } return 0 }
  const order = tasks.slice().sort(cmp)
  const queues = new Map(), heads = new Map(), at = new Map()
  for (const t of order) for (const q of t.pages) (queues.get(q) ?? queues.set(q, []).get(q)).push(t)
  for (const t of order) at.set(t, 0)
  const ready = []
  for (const t of order) if (t.pages.length === 0) ready.push(t)
  for (const [q, list] of queues) { heads.set(q, 0); const t = list[0]; at.set(t, at.get(t) + 1); if (at.get(t) === t.pages.length) ready.push(t) }
  let done = 0
  while (ready.length) {
    const t = ready.splice(pick(ready), 1)[0]
    t.run()
    done++
    for (const q of t.pages) {
      const list = queues.get(q), h = heads.get(q) + 1
      heads.set(q, h)
      if (h < list.length) { const u = list[h]; at.set(u, at.get(u) + 1); if (at.get(u) === u.pages.length) ready.push(u) }
    }
  }
  if (done !== tasks.length) throw new Error(`${tasks.length - done} tasks never ran`)
}
