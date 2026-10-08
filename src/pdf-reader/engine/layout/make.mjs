// The layout maker (Plan 8b, Task 6; spec §4.2 and §11's amendment of 2026-10-06; the layout research of 2026-10-06):
// a paper's layout file, from the marks file of its layout compile (the marked original with the layout marks, a compile
// of its own: marks.mjs) and arXiv's PDF. The marks are TeX's own places in our compile; the ink is arXiv's, read glyph
// by glyph from its operator lists (ink.mjs); the marks go over to arXiv's PDF by line (carry.mjs), and arXiv's text
// layer locates the units between them (anchors.mjs). Each located unit gets its lines (baseline, size and font from the
// glyphs), its frames (its lines by page and column, each with its share of the source and the room below it), the
// rectangles that erase it, each placeholder's rendering by its source piece index k, and its label (a heading's number,
// an item's mark, a caption's "Figure 1:", a footnote's mark). A placeholder's rendering is its own ink: the glyphs and
// rules the marked compile's content stream shows between its points (layout/stream.mjs, kept in the marks file), each
// carried and matched on arXiv's page (layout/match.mjs); found where every one is matched, EMPTY where its points hold
// nothing, else LOST; a citation's or a reference's own text with it, for the layer to set in the page's face. What
// cannot be placed is left out, and the layer leaves that unit as the original's: a line of the marked original not
// carried (a reflow of the layout compile costs only its own lines), a unit on a page whose ink is not whole (its
// operator list too long, too slow, or its carry over its bound), a placeholder whose own ink is not all found. The file
// is refused where too few lines are carried, where arXiv's page count is out of bounds, and where its own parser refuses
// it: a file the parser refuses is never returned.
// Arithmetic alone once the PDF is read: the same marks file and PDF give the same bytes.
import { anchorUnits, boundsFromMarks, markWords, tokenAtMark, tokenizeDocument, tokens } from '../pipeline/anchors.mjs'
import { displayEdges, plainSource, unitText } from '../translate/mt.mjs'
import { carrierOf, tokensOfMarks } from './carry.mjs'
import { encodeLayout, isPageText, LAYOUT, LAYOUT_SCHEMA, LayoutRefusal, NAME_FLAG, NAME_KEYS, NAMES_MAX, PAGE_TEXT_KINDS, parseLayout, PH_FLAG, PH_KINDS, UNIT_FLAG, UNIT_KINDS } from './file.mjs'
import { pageInk } from './ink.mjs'
import { classOf, headEnd, layoutMarking, symbolText } from './marks.mjs'
import { matcherOf } from './match.mjs'
import { OWNED, OWNED_HOW } from './stream.mjs'

/** the share of the marked original's lines carried, at least, for a file (the researched papers carry 97.5–99.4 %) */
export const CARRY_MIN = 0.9
/** a page's operator list is waited for at most OPS_MS, and a paper's in all OPS_PAPER_MS: past either the page has no
 *  ink, and the page's parse is given up (giveUp). PDF.js parses a page's whole content stream before it answers: 0.9 to
 *  2.8 s for 2608.18626's page 8 (102,052 operations) on a laptop, 2 to 4 times that reckoned on one vCPU; the corpus's
 *  2,793 pages take 36.9 s in all, a paper's at most a few seconds */
export const OPS_MS = 10_000, OPS_PAPER_MS = 60_000
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
/** a centred unit: every line's centre within CENTRE of its column's, one line at least shorter than SHORT of it */
const CENTRE = 2, SHORT = 0.9
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
/** a space in a page text where two glyphs stand this share of their size apart (PDF.js's text layer, TRACKING_SPACE) */
const TEXT_SPACE = 0.102
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

const r2 = v => Math.round(v * 100) / 100
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

/** a promise's value, or null where it does not come within `ms` or fails */
function within(promise, ms) {
  let timer
  const late = new Promise(resolve => { timer = setTimeout(() => resolve(null), Math.max(0, ms)) })
  return Promise.race([Promise.resolve(promise).then(v => v, () => null), late]).finally(() => clearTimeout(timer))
}
/** a page's operator list given up on: PDF.js's own cancellation (its rendering's, PDFPageProxy._abortOperatorList on
 *  its _intentStates, read on the pinned PDF.js by layout-make.test.ts), so that the worker stops parsing. Where a PDF.js
 *  has none, a warning, once a paper (`seen`), and the maker goes on waiting: the worker parses the page to its end, the
 *  pages after it wait behind it, and each is still given up past OPS_MS and the paper past OPS_PAPER_MS */
function giveUp(page, seen) {
  if (typeof page?._abortOperatorList !== 'function' || !(page?._intentStates instanceof Map)) {
    if (!seen.warned) console.warn('layout maker: this PDF.js cancels no operator list; the pages after a slow one wait behind it')
    seen.warned = true
    return
  }
  try {
    for (const state of page._intentStates.values()) page._abortOperatorList({ intentState: state, reason: new Error('the layout maker gave up'), force: true })
  } catch {}
}

/** a page's view, x0 y0 x1 y1, as the file may hold it, or null */
function viewOf(v) {
  if (!v || !(v.length >= 4)) return null
  const [x0, y0, x1, y1] = [v[0], v[1], v[2], v[3]].map(r2)
  return [x0, y0, x1, y1].every(n => Number.isFinite(n) && Math.abs(n) <= COORD_MAX) && x0 < x1 && y0 < y1 ? [x0, y0, x1, y1] : null
}

/** a page's glyphs by baseline, rising, in arrays (x0, x1, y, top, bottom, size, font, u; ix0 and ix1 their ink across
 *  with their advance; top and bottom their own ink up and down, ink.mjs), and its boxes */
function glyphsOf(got, fontIds) {
  const order = got.glyphs.map((_, i) => i).sort((a, b) => {
    const p = got.glyphs[a], q = got.glyphs[b]
    return p.y - q.y || p.x0 - q.x0 || a - b
  })
  const n = order.length, P = {
    n, x0: new Float64Array(n), x1: new Float64Array(n), y: new Float64Array(n), top: new Float64Array(n), bottom: new Float64Array(n),
    ix0: new Float64Array(n), ix1: new Float64Array(n),
    size: new Float64Array(n), font: new Int32Array(n), u: new Array(n), owner: new Int32Array(n).fill(-1), taken: new Uint8Array(n),
    boxes: [], boxTaken: new Uint8Array(got.boxes.length >> 2), most: 0,
  }
  order.forEach((g, i) => {
    const t = got.glyphs[g]
    P.x0[i] = t.x0; P.x1[i] = t.x1; P.y[i] = t.y; P.top[i] = t.top; P.bottom[i] = t.bottom; P.size[i] = t.size; P.u[i] = t.u
    // its ink across: its outline's and its advance's together (ink.mjs: an italic's overhang past its advance)
    P.ix0[i] = Math.min(t.x0, t.ix0 ?? t.x0); P.ix1[i] = Math.max(t.x1, t.ix1 ?? t.x1)
    P.font[i] = fontIds(t.font)
    if (t.size > P.most) P.most = t.size
  })
  for (let i = 0; i + 3 < got.boxes.length; i += 4) P.boxes.push([got.boxes[i], got.boxes[i + 1], got.boxes[i + 2], got.boxes[i + 3]])
  return P
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
    ph: { marked: 0, found: 0, empty: 0, lost: 0, byKind: {}, unmarked: 0, symbols: 0, inferred: 0, why: {}, textTaken: 0, owned: 0, matched: 0, unmatched: 0, twice: 0, foreign: 0, shared: 0, texts: 0, heads: [0, 0] },
    match: { same: 0, recoded: 0, loose: 0, vote: 0, rejected: 0, work: 0, over: 0 },
    labels: {}, frames: { units: 0, split: 0, lineCountChecked: 0, lineCountEqual: 0 }, baselines: { first: [], last: [] },
    names: { marked: 0, located: 0, why: {} },
    capped: [], timedOut: [], over: [], bytes: { raw: 0, gzip: 0 }, ms: { text: 0, ops: 0, carry: 0, anchor: 0, rows: 0 },
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
 * opens and destroys; `OPS` PDF.js's operator codes
 */
export async function makeLayout({ units, marks, arxiv, OPS, paper, left, pdfjs }) {
  const stats = blank(units)
  for (const u of units) { const k = u.kind; stats.units.byKind[k] ??= [0, 0]; stats.units.byKind[k][1]++ }
  const pages = arxiv?.numPages
  if (!Number.isInteger(pages) || pages < 1 || pages > PAGES_MAX) return { refused: 'pages', stats }
  // ---------------------------------------------------------------- arXiv's text, page by page
  let t = now()
  const views = [], text = [], held = [], dark = new Set()
  for (let p = 1; p <= pages; p++) {
    let page = null, view = null, items = [], styles = {}
    try {
      page = await arxiv.getPage(p)
      view = viewOf(page.view)
      const tc = await page.getTextContent()
      items = Array.isArray(tc?.items) ? tc.items : []
      styles = tc?.styles ?? {}
    } catch { page = null }
    if (!view) { view = views.length ? views.slice(-4) : [0, 0, 612, 792]; dark.add(p) }
    if (!page) dark.add(p)
    views.push(...view)
    text.push({ page: p, items, styles })
    held.push(page)
  }
  const doc = tokenizeDocument(text)
  const viewAt = p => views.slice(4 * (p - 1), 4 * p)
  stats.ms.text = now() - t
  // ---------------------------------------------------------------- arXiv's ink: glyphs and graphics, page by page
  t = now()
  const ink = new Array(pages + 1).fill(null), names = [], nameId = new Map()
  const fontIds = raw => { const n = fontName(raw); if (!nameId.has(n)) { nameId.set(n, names.length); names.push(n) } return nameId.get(n) }
  let waited = 0
  const seen = { warned: false }
  for (let p = 1; p <= pages; p++) {
    const page = held[p - 1]
    if (!page || dark.has(p)) continue
    if (waited >= OPS_PAPER_MS) { stats.timedOut.push(p); dark.add(p); continue }
    const t0 = now()
    let ops = null
    try { ops = await within(page.getOperatorList(), Math.min(OPS_MS, OPS_PAPER_MS - waited)) } catch {}
    waited += now() - t0
    if (!ops) { giveUp(page, seen); stats.timedOut.push(p); dark.add(p); continue }
    const got = pageInk(OPS, ops, page.commonObjs ?? { get: () => null }, { rotate: page.rotate ?? 0 })
    if (got.capped) stats.capped.push(p)
    // a page whose ink is not whole has no ink: its units stay the original's, never erased in part
    if (got.capped || got.rotated) { dark.add(p); continue }
    ink[p] = glyphsOf(got, fontIds)
  }
  stats.ms.ops = now() - t
  // ---------------------------------------------------------------- the marks carried to arXiv's PDF by line
  t = now()
  // a draft image frame's name (graphicx's draft, g<n>a, g<n>b, g<n>t) is no line of the paper's
  const at = new Map(marks.marks.map(([n, page, x, y]) => [n, { page, x, y }]))
  const frames = []
  for (const [n, a] of at) {
    const g = /^g(\d+)a$/.exec(n)
    const b = g && at.get(`g${g[1]}b`), top = g && at.get(`g${g[1]}t`)
    if (b && top && b.page === a.page && top.page === a.page) frames.push([a.page, Math.min(a.x, b.x) - 1, Math.min(a.y, top.y) - 1, Math.max(a.x, b.x, top.x) + 1, Math.max(a.y, top.y) + 1])
  }
  const drawn = tk => !frames.some(([p, x0, y0, x1, y1]) => tk.page === p && tk.x + tk.w / 2 >= x0 && tk.x + tk.w / 2 <= x1 && tk.y >= y0 && tk.y <= y1)
  const ours = tokensOfMarks(marks).filter(drawn)
  const carrier = carrierOf(ours, doc)
  for (const p of carrier.over) { stats.over.push(p); if (p >= 1 && p <= pages) dark.add(p) }
  const L = carrier.lines
  stats.lines.total = L.total
  stats.lines.carried = L.same + L.moved + L.respaced + L.fuzzy
  stats.ms.carry = now() - t
  if (!(L.total > 0 && stats.lines.carried >= CARRY_MIN * L.total)) return { refused: 'carry', stats }
  /** a position of the marked original on arXiv's PDF: carried by its line, on a page with ink, within its view */
  const carry = (page, x, y) => {
    const c = carrier.carry(page, x, y)
    if (!c || !Number.isInteger(c.page) || c.page < 1 || c.page > pages || dark.has(c.page) || !ink[c.page]) return null
    const v = viewAt(c.page)
    return c.x >= v[0] - 1 && c.x <= v[2] + 1 && c.y >= v[1] - 1 && c.y <= v[3] + 1 ? c : null
  }
  const dropped = new Set(marks.dropped)
  const markOf = name => { const m = dropped.has(name) ? null : at.get(name); return m ? carry(m.page, m.x, m.y) : null }
  /** a mark the carrier does not place (past its line's last word), on the line of its partner, which moved whole: by
   *  the partner's offset */
  const besideOf = (partner, carried, name) => {
    const p = at.get(partner), m = dropped.has(name) ? null : at.get(name)
    if (!carried?.whole || !p || !m || p.page !== m.page || Math.abs(p.y - m.y) > 0.01) return null
    const x = m.x + carried.x - p.x, y = m.y + carried.y - p.y, v = viewAt(carried.page)
    return x >= v[0] - 1 && x <= v[2] + 1 && y >= v[1] - 1 && y <= v[3] + 1 ? { page: carried.page, x, y, whole: true } : null
  }

  // ---------------------------------------------------------------- the units located on arXiv's tokens
  t = now()
  const unitMarks = new Map(), nameOf = new Map()
  for (const [n, m] of at) {
    const r = /^[th]?(\d+)([se])$/.exec(n)
    if (r && Number(r[1]) < units.length) { unitMarks.set(`${Number(r[1])}${r[2]}`, m); nameOf.set(`${Number(r[1])}${r[2]}`, n) }
  }
  const carriedUnit = new Map(), byPage = new Map(), withWords = markWords(ours, unitMarks), raw = new Map()
  doc.forEach((t, k) => (byPage.get(t.page) ?? byPage.set(t.page, []).get(t.page)).push(k))
  for (const [k] of withWords) raw.set(k, markOf(nameOf.get(k)))
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
  const unplaced = new Set()
  for (let i = 0; i < units.length; i++) {
    const own = [`${i}s`, `${i}e`].filter(k => unitMarks.has(k))
    if (own.length && (own.some(k => !carriedUnit.has(k)) || (own.length === 2 && !bounds.has(String(i))))) unplaced.add(i)
  }
  const linesTeX = new Map(marks.lines)
  const texts = units.map((u, i) => ({ id: i, ...unitText(u.pieces), ...displayEdges(u) }))
  const anchors = anchorUnits(doc, texts, { bounds, floating: id => FLOATING.has(units[id]?.kind ?? '') })
  stats.ms.anchor = now() - t

  // ---------------------------------------------------------------- each located unit's lines
  t = now()
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
  const placed = []
  for (let i = 0; i < units.length; i++) {
    const u = units[i], a = anchors.get(i)
    if (a && unplaced.has(i)) stats.units.unplaced++
    if (!a || unplaced.has(i) || !KIND.has(u.kind) || u.pieces.length > PIECES_MAX) continue
    const rects = rectsOf(doc, a.tokens)
    if (!rects.length || rects.length !== a.rects.length || rects.length > LINES_UNIT || rects.some(r => dark.has(r.page) || !ink[r.page])) continue
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
    if (!rows.length) continue
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
    placed.push({ id: i, u, a, rows, S, E })
  }
  // each column's text edges, the most common start and end of the body's lines (its own page's, else those of the
  // pages like it: the same columns, the same side of a spread, then the same columns)
  const edges = new Map()
  {
    const seen = new Map()
    const note = (key, x0, x1) => { const e = seen.get(key) ?? seen.set(key, { x0: new Map(), x1: new Map() }).get(key); const a = Math.round(x0), b = Math.round(x1); e.x0.set(a, (e.x0.get(a) ?? 0) + 1); e.x1.set(b, (e.x1.get(b) ?? 0) + 1) }
    for (const { u, rows } of placed) {
      if (!EVEN.has(u.kind)) continue
      for (const r of rows) {
        const c = columnOf(r.page, r.x0, r.x1)
        for (const key of [`${r.page}|${c}`, `${twoCols(r.page)}|${r.page % 2}|${c}`, `${twoCols(r.page)}|${c}`]) note(key, r.x0, r.x1)
      }
    }
    const modeOf = (m, low) => { let best = null, most = 1; for (const [x, n] of m) if (n > most || (n === most && best !== null && (low ? x < best : x > best))) { best = x; most = n } return best }
    for (const [key, e] of seen) { const x0 = modeOf(e.x0, true), x1 = modeOf(e.x1, false); if (x0 !== null && x1 !== null && x0 < x1) edges.set(key, [x0, x1]) }
  }
  const edgesBy = (p, c) => edges.get(`${p}|${c}`) ?? edges.get(`${twoCols(p)}|${p % 2}|${c}`) ?? edges.get(`${twoCols(p)}|${c}`) ?? null
  /** a column's text edges; a line across two columns, the left one's start and the right one's end */
  const edgesOf = (p, c) => {
    const e = edgesBy(p, c)
    if (e || c !== 2) return e
    const l = edgesBy(p, 0), r = edgesBy(p, 1)
    return l && r ? [l[0], r[1]] : null
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
   * not (the probe's answer: a case change, which the target's name takes too)
   */
  const named = []
  {
    const ourWords = (page, x0, x1, y) => ours.filter(t => t.page === page && Math.abs(t.y - y) < 0.5 * t.h && t.x + t.w / 2 >= x0 - 0.5 && t.x + t.w / 2 <= x1 + 0.5).map(t => t.t).join('')
    const theirWords = (page, x0, x1, y) => doc.filter(t => t.page === page && Math.abs(t.y - y) < 0.5 * t.h && t.x + t.w / 2 >= x0 - 0.5 && t.x + t.w / 2 <= x1 + 0.5).map(t => t.t).join('')
    const why = w => { stats.names.why[w] = (stats.names.why[w] ?? 0) + 1 }
    for (const [n, a] of at) {
      const x = NAME_START.exec(n), key = x ? NAME_KEYS.indexOf(x[2]) : -1
      if (key < 0) continue
      stats.names.marked++
      const e = `n${x[1]}.${x[2]}.e`, b = dropped.has(e) ? null : at.get(e)
      if (dropped.has(n) || !b) { why('a mark not set, or set twice'); continue }
      if (b.page !== a.page || Math.abs(b.y - a.y) > 0.5 || b.x <= a.x) { why('not on one line'); continue }
      const S0 = markOf(n), E0 = markOf(e)
      const S = S0 ?? besideOf(e, E0, n), E = E0 ?? besideOf(n, S0, e)
      if (!S || !E || S.page !== E.page || Math.abs(S.y - E.y) > 1 || E.x <= S.x) { why('not carried'); continue }
      const want = letters(ourWords(a.page, a.x, b.x, a.y))
      if (!want || letters(theirWords(S.page, S.x, E.x, S.y)) !== want) { why("not arXiv's text there"); continue }
      const P = ink[S.page]
      const gs = band(P, S.y - SCRIPT(P.most), S.y + SCRIPT(P.most)).filter(g => Math.abs(P.y[g] - S.y) < 0.25 * Math.max(P.size[g], 5) && mid(P, g) >= S.x - 0.05 && mid(P, g) <= E.x + 0.05)
      if (!gs.length || gs.some(g => P.owner[g] !== -1 || P.taken[g])) { why(gs.length ? "its glyphs another's" : 'no glyph'); continue }
      if (letters(gs.slice().sort((g, h) => P.x0[g] - P.x0[h] || g - h).map(g => P.u[g]).join('')) !== want) { why("not arXiv's glyphs there"); continue }
      const row = rowOf(P, gs, S.page, [], S.y)
      if (!(r2(row.size) > 0 && row.size <= SIZE_MAX)) { why('no size'); continue }
      // centred as a unit is (its one line's centre its column's, the line short of it)
      const edge = edgesOf(S.page, columnOf(S.page, row.x0, row.x1))
      const centred = !!edge && Math.abs((row.x0 + row.x1) / 2 - (edge[0] + edge[1]) / 2) <= CENTRE && row.x1 - row.x0 < SHORT * (edge[1] - edge[0])
      const cased = [...gs.map(g => P.u[g]).join('').normalize('NFKC')].filter(c => c.toUpperCase() !== c.toLowerCase())
      const capitals = cased.length >= 2 && cased.every(c => c === c.toUpperCase()) && marks.marking.names?.[x[2]] === 1
      for (const g of gs) P.owner[g] = NAME_OWNER
      named.push({ occurrence: Number(x[1]), key, row, flags: (centred ? NAME_FLAG.CENTRED : 0) | (capitals ? NAME_FLAG.CAPITALS : 0) })
    }
    named.sort((p, q) => p.occurrence - q.occurrence)
    if (named.length > NAMES_MAX) named.length = NAMES_MAX
  }

  // ---------------------------------------------------------------- placeholders, by unit and source piece index
  // which pieces the marked original marks: its marking, as the marks file records it (the classes and the paper's
  // own switch it was compiled with)
  const design = new Map()
  {
    const { units: copies } = layoutMarking(units, marks.marking.classes, { lines: false, switches: marks.marking.switches, inkless: marks.marking.inkless })
    copies.forEach((c, i) => {
      for (const p of c.pieces) {
        const m = p.t === 'ph' && /^\\axtpma?\{[pn](\d+)\.(\d+)([ab])\}$/.exec(p.src ?? '')
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
  const matcher = matcherOf({ ink, carry })
  /** a found piece's matched glyphs, by its key: the twice bar's */
  const matchedBy = new Map()
  for (const one of placed) {
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
    const head = headEnd(u.pieces, 0), last = u.pieces.findLastIndex(p => p.t === 'text' && /[^ \t\r\n]/.test(p.s ?? ''))
    for (let k = 0; k < u.pieces.length; k++) {
      // every visible piece has its row, found, LOST or EMPTY: no row is a piece that draws nothing (an invisible one, a
      // group's open or close), as the layer reads the file
      const piece = u.pieces[k], cls = classOf(piece)
      if (!cls || (cls === 'macro' && inkless.has(piece.src))) continue
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
      if (e[1] >= OWNED) { lost(OWNED_HOW[e[1]] ?? 'no own ink known'); continue }
      const before = u.pieces[k - 1], after = u.pieces[k + 1]
      let flags = before?.t === 'text' && /[([]$/.test(before.s ?? '') && after?.t === 'text' && /^[)\]]/.test(after.s ?? '') ? PH_FLAG.SOURCE_BRACKETS : 0
      const n = e[2], items = [], rules = []
      for (let j = 3; j < 3 + 5 * n; j += 5) items.push({ page: e[j], x0: e[j + 1], y: e[j + 2], size: e[j + 3], u: marks.chars[e[j + 4]] ?? '' })
      for (let j = 3 + 5 * n; j < e.length; j += 5) rules.push({ page: e[j], x0: e[j + 1], y0: e[j + 2], x1: e[j + 3], y1: e[j + 4] })
      // EMPTY only where its points hold nothing between them: the piece draws nothing
      if (!items.length && !rules.length) { ph.push({ row: [i, k, kind, flags | PH_FLAG.EMPTY], cls, state: 'empty' }); continue }
      // every owned glyph and rule carried to arXiv's PDF and matched there, or the piece is LOST
      const got = matcher.match(items, rules, at.get(name) ?? null, at.get(`${prefix}${i}.${k}b`) ?? null)
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
        const byRow = new Map(), partRow = []
        let off = false
        const openAt = markOf(name), closeAt = markOf(`${prefix}${i}.${k}b`)
        for (const [q, part] of parts.entries()) {
          const j = rowOfPart(part, q === 0 ? openAt : q === parts.length - 1 ? closeAt : null)
          if (j < 0) { off = true; break }
          partRow.push(j)
          ;(byRow.get(j) ?? byRow.set(j, { gs: [], boxes: [] }).get(j)).gs.push(...part.gs)
        }
        for (const [p, b] of off ? [] : bs) {
          const B = ink[p].boxes[b], cx = (B[0] + B[2]) / 2, cy = (B[1] + B[3]) / 2
          let j = -1, d = Infinity
          parts.forEach((part, q) => { if (part.page !== p) return; const P = ink[p]; for (const g of part.gs) { const dd = Math.hypot(mid(P, g) - cx, P.y[g] - cy); if (dd < d) { d = dd; j = partRow[q] } } })
          if (j < 0) j = rowFor(p, B[0], B[2], cy)
          if (j < 0) { off = true; break }
          ;(byRow.get(j) ?? byRow.set(j, { gs: [], boxes: [] }).get(j)).boxes.push(B)
        }
        if (off) { lost("its ink on no line of the unit's"); continue }
        if (byRow.size > SEGS_INLINE) { lost('more lines than an inline placeholder may have'); continue }
        for (const j of [...byRow.keys()].sort((x, y) => x - y)) {
          const r = rows[j], P = ink[r.page], { gs: own, boxes } = byRow.get(j)
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
      for (const [p, g] of gs) { ink[p].owner[g] = i; if (cls !== 'display' && inWord(p, g)) stats.ph.textTaken++ }
      const row = [i, k, kind, flags]
      for (const s of segs) {
        const [x0, bottom, x1, top] = solid(viewAt(s.page), s.x0, s.bottom, s.x1, s.top)
        row.push(s.page, x0, Math.min(viewAt(s.page)[3], Math.max(viewAt(s.page)[1], r2(s.base))), x1, top, bottom)
        if (cls === 'display') keep(s.page, [x0, bottom, x1, top])
      }
      const key = `${i}.${k}`
      matchedBy.set(key, gs)
      stats.ph.owned += items.length + rules.length
      stats.ph.matched += gs.length + bs.length
      ph.push({ row, cls, state: 'found', inferred: e[1] !== 0, text: PAGE_TEXT.has(cls) ? pageTextOf(gs) : null })
    }
    if (one.symbols) symbolsOf(one)
    if (one.heads) besideMarks(one, false)
    if (one.tails) besideMarks(one, true)
  }
  // the bars: an arXiv glyph matched by two found pieces, an owned glyph of a found piece not matched (none, both; each
  // true by the matcher's own rule); and what the layer draws: an arXiv glyph inside a found inline piece's segments
  // (its crop) that is not its own (`foreign`), and one inside two found pieces' segments (`shared`), by its own ink,
  // half of it or more inside (none, both: the 6b review's I2)
  {
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
  for (const one of placed) {
    const { id: i, a, rows } = one
    if (rows.length < 2) continue
    const paired = new Set(a.pairs?.values() ?? [])
    const words = new Set([texts[i].text, texts[i].text.replace(/(?<=\p{L})-(?=\p{L})/gu, '')].flatMap(s => tokens(s).map(t => t.t)).filter(t => t.length >= 3 && /\p{L}/u.test(t)))
    const boxed = new Set((one.boxes ?? []).map(([row]) => row))
    const held = new Set()
    rows.forEach((r, j) => {
      if (j === 0 || r.extra?.length || boxed.has(j)) return
      let n = 0, hits = 0
      for (const k0 of r.ks) {
        let k = k0
        while (k > 0 && doc[k]?.t === '') k--
        const t = doc[k]?.t
        if (!t || !/\p{L}/u.test(t)) continue
        n++
        if (paired.has(k) || words.has(t)) hits++
      }
      if (hits === 0 || (n >= 4 && hits < 0.2 * n)) held.add(j)
    })
    if (!held.size) continue
    const free = r => { const P = ink[r.page]; for (const g of r.gl) if (P.owner[g] === i) P.owner[g] = -1 }
    // held at the unit's end: no line of the unit's
    while (rows.length > 1 && held.has(rows.length - 1)) { free(rows.at(-1)); held.delete(rows.length - 1); rows.pop(); stats.lines.held++ }
    for (const j of held) free(rows[j])
    if (held.size) { one.held = [...held].sort((x, y) => x - y); stats.lines.held += held.size }
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
  const labels = []
  const owned = (p, g, unit) => ink[p].owner[g] !== -1 && ink[p].owner[g] !== unit
  for (const one of placed) {
    const { id: i, u, rows, S } = one
    const r0 = rows[0]
    const headOf = () => {
      const head = headLabel(one)
      if (head) { labels.push(head); keep(head[2], [head[3], head[7], head[5], head[6]]); one.label = true }
    }
    if (!S || S.page !== r0.page || Math.abs(S.y - r0.base) >= 0.5 * r0.size) { headOf(); continue }
    one.label = false
    const P = ink[S.page], [cx0] = sideOf(S.page, columnOf(S.page, S.x, S.x))
    const cand = band(P, S.y - 0.35 * P.most, S.y + 0.75 * Math.max(P.most, 6)).filter(g => P.y[g] > S.y - 0.35 * P.size[g] && P.y[g] < S.y + 0.75 * Math.max(P.size[g], 6) && P.x1[g] <= S.x + 0.05 && P.x0[g] >= cx0 - 1 && !owned(S.page, g, -2) && !P.taken[g]).sort((a, b) => P.x0[a] - P.x0[b] || a - b)
    const run = []
    let edge = S.x
    for (let q = cand.length - 1; q >= 0; q--) { const g = cand[q]; if (edge - P.x1[g] > LABEL_EM * P.size[g]) break; run.unshift(g); edge = Math.min(edge, P.x0[g]) }
    // wholly left of the unit's first line
    const mine = run.filter(g => P.x1[g] <= r0.x0 + 0.01)
    // or the class's own mark that the first line begins with, the unit's start mark set before it
    if (!mine.length) { headOf(); continue }
    let x0 = Infinity, x1 = -Infinity, top = -Infinity, bottom = Infinity
    for (const g of mine) { x0 = Math.min(x0, P.ix0[g]); x1 = Math.max(x1, P.ix1[g]); top = Math.max(top, P.top[g]); bottom = Math.min(bottom, P.bottom[g]) }
    const view = viewAt(S.page), [a, c, b, d] = solid(view, x0, bottom, x1, top)
    const base = Math.min(d, Math.max(c, baselineOf(P, mine, S.y)))
    labels.push([i, LABEL_OF[u.kind] ?? 1, S.page, a, base, b, d, c])
    keep(S.page, [a, c, b, d])
    one.label = true
  }

  // ---------------------------------------------------------------- erase, frames, rows
  const fontIndex = new Map(), fonts = []
  const fontOf = id => { if (!fontIndex.has(id)) { fontIndex.set(id, fonts.length); fonts.push(names[id]) } return fontIndex.get(id) }
  const outUnits = [], outLines = [], outFrames = [], outErase = [], outHeadings = [], outHeld = []
  const labelAt = new Map(labels.map(l => [l[0], l[3]]))
  const inside = (p, x, y) => (kept.get(p) ?? []).some(([a, c, b, d]) => x >= a && x <= b && y >= c && y <= d)
  const meets = (p, a, c, b, d) => (kept.get(p) ?? []).some(([e, f, g, h]) => a < g && b > e && c < h && d > f)
  for (const one of placed) {
    const { id: i, u, rows, S, E } = one
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
    // a unit whose faces would take the file past FONTS_MAX names stays the original's: a count never gets it refused
    if (refuse || fonts.length + new Set(rows.map(r => r.font).filter(f => !fontIndex.has(f))).size > FONTS_MAX) continue
    // lines
    const lines = []
    for (const r of rows) {
      const view = viewAt(r.page)
      const [x0, bottom, x1, top] = solid(view, r.x0, r.bottom, r.x1, r.top)
      const base = Math.min(top, Math.max(bottom, r2(r.base)))
      lines.push(r.page, x0, x1, base, top, bottom, r2(Math.min(SIZE_MAX, r.size)), fontOf(r.font))
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
    // flags: centred where every line's centre is its column's and one line at least is short of it; the first line from
    // its label on (a caption's "Figure 1." centred with its text)
    let centred = rows.length > 0, short = false
    rows.forEach((r, j) => {
      if (!centred) return
      const x0 = j === 0 && labelAt.has(i) ? Math.min(r.x0, labelAt.get(i)) : r.x0
      const e = edgesOf(r.page, columnOf(r.page, x0, r.x1))
      if (!e || Math.abs((x0 + r.x1) / 2 - (e[0] + e[1]) / 2) > CENTRE) { centred = false; return }
      if (r.x1 - x0 < SHORT * (e[1] - e[0])) short = true
    })
    const flags = (u.title ? UNIT_FLAG.TITLE : 0) | (u.front ? UNIT_FLAG.FRONT : 0) | (centred && short ? UNIT_FLAG.CENTRED : 0)
    const depth = Number.isInteger(u.depth) && u.depth >= -1 && u.depth <= 5 ? u.depth : 9
    outUnits.push([i, KIND.get(u.kind), depth, flags, u.pieces.length])
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
    if (fs.length > 1) stats.frames.split++
    const n = linesTeX.get(i)
    if (n !== undefined && (u.kind === 'para' || u.kind === 'abstract') && !texts[i].lead && !texts[i].trail && !texts[i].inner) { stats.frames.lineCountChecked++; if (n === rows.length) stats.frames.lineCountEqual++ }
    if (S && S.page === rows[0].page && Math.abs(S.y - rows[0].base) < 0.5 * rows[0].size) stats.baselines.first.push(Math.abs(r2(rows[0].base) - S.y))
    if (E && E.page === rows.at(-1).page && Math.abs(E.y - rows.at(-1).base) < 0.5 * rows.at(-1).size) stats.baselines.last.push(Math.abs(r2(rows.at(-1).base) - E.y))
  }
  // the names, on a page with ink: a name whose face would take the file past FONTS_MAX names stays the original's
  const outNames = []
  for (const nm of named) {
    const r = nm.row
    if (!fontIndex.has(r.font) && fonts.length >= FONTS_MAX) { stats.names.why['past the fonts a file may name'] = (stats.names.why['past the fonts a file may name'] ?? 0) + 1; continue }
    const view = viewAt(r.page), [x0, bottom, x1, top] = solid(view, r.x0, r.bottom, r.x1, r.top)
    outNames.push([nm.occurrence, nm.key, r.page, x0, Math.min(top, Math.max(bottom, r2(r.base))), x1, top, bottom, r2(Math.min(SIZE_MAX, r.size)), fontOf(r.font), nm.flags])
    stats.names.located++
  }
  // what the file holds of the units it does not: nothing; their placeholders and labels go with them
  const kept1 = new Set(outUnits.map(r => r[0]))
  const file = {
    schema: LAYOUT_SCHEMA, layout: LAYOUT, pdfjs, paper: { id: paper.id, version: paper.version, pages }, left, views, fonts,
    units: outUnits, lines: outLines, frames: outFrames, erase: outErase,
    ph: ph.filter(p => kept1.has(p.row[0])).map(p => p.row), labels: labels.filter(r => kept1.has(r[0])), headings: outHeadings,
    pageText: ph.filter(p => kept1.has(p.row[0]) && p.text).map(p => [p.row[0], p.row[1], p.text]),
    held: outHeld,
    names: outNames,
  }
  stats.ph.texts = file.pageText.length
  Object.assign(stats.match, matcher.stats)
  // the placeholders and labels counted as the file holds them
  for (const p of ph) {
    if (!kept1.has(p.row[0])) continue
    if (p.state === 'unmarked') { stats.ph.unmarked++; continue }
    if (p.state === 'text') { stats.ph.symbols++; continue }
    if (p.head) { stats.ph.heads[p.state === 'found' ? 0 : 1]++; continue }
    const tally = stats.ph.byKind[p.cls] ??= [0, 0]
    stats.ph.marked++
    tally[1]++
    if (p.state === 'found') { stats.ph.found++; tally[0]++; if (p.inferred) stats.ph.inferred++ } else if (p.state === 'empty') stats.ph.empty++
    else { stats.ph.lost++; stats.ph.why[p.why] = (stats.ph.why[p.why] ?? 0) + 1 }
  }
  for (const one of placed) {
    if (!kept1.has(one.id) || one.label === undefined) continue
    const tally = stats.labels[one.u.kind] ??= [0, 0]
    tally[1]++
    if (one.label) tally[0]++
  }
  stats.ms.rows = now() - t
  const bytes = new TextEncoder().encode(encodeLayout(file))
  stats.bytes.raw = bytes.length
  let parsed
  try { parsed = parseLayout(bytes) } catch (e) {
    if (!(e instanceof LayoutRefusal)) throw e
    stats.refusal = { path: e.path, why: e.why }
    return { refused: 'bounds', stats }
  }
  stats.bytes.gzip = await gzipSize(bytes)
  return { file: parsed, stats }
}
