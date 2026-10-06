// The layout maker (Plan 8b, Task 6; spec §4.2 and §11's amendment of 2026-10-06; the layout research of 2026-10-06):
// a paper's layout file, from the marks file of its layout compile (the marked original with the layout marks, a compile
// of its own: marks.mjs) and arXiv's PDF. The marks are TeX's own places in our compile; the ink is arXiv's, read glyph
// by glyph from its operator lists (ink.mjs); the marks go over to arXiv's PDF by line (carry.mjs), and arXiv's text
// layer locates the units between them (anchors.mjs). Each located unit gets its lines (baseline, size and font from the
// glyphs), its frames (its lines by page and column, each with its share of the source and the room below it), the
// rectangles that erase it, each placeholder's rendering by its source piece index k, and its label (a heading's number,
// an item's mark, a caption's "Figure 1:", a footnote's mark). What cannot be placed is left out, and the layer leaves
// that unit as the original's: a line of the marked original not carried (a reflow of the layout compile costs only its
// own lines), a unit on a page whose ink is not whole (its operator list too long, too slow, or its carry over its bound),
// a placeholder whose marks are not both known. The file is refused where too few lines are carried, where arXiv's page
// count is out of bounds, and where its own parser refuses it: a file the parser refuses is never returned.
// Arithmetic alone once the PDF is read: the same marks file and PDF give the same bytes.
import { anchorUnits, boundsFromMarks, markWords, tokenizeDocument, tokens } from '../anchors.mjs'
import { displayEdges, plainSource, plainTranslated, unitText } from '../mt.mjs'
import { carrierOf, tokensOfMarks } from './carry.mjs'
import { encodeLayout, LAYOUT, LayoutRefusal, parseLayout, PH_FLAG, PH_KINDS, UNIT_FLAG, UNIT_KINDS } from './file.mjs'
import { pageInk } from './ink.mjs'
import { classOf, layoutMarking } from './marks.mjs'

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
/** a row of glyphs smaller than this share of a line's, its baseline within their script window of the line's, is a
 *  script of that line */
const SCRIPT_SIZE = 0.85
/** a placeholder's ink raised or lowered: its baseline this share of its line's size off the line's */
const SHIFT = 0.2
/** a centred unit: every line's centre within CENTRE of its column's, one line at least shorter than SHORT of it */
const CENTRE = 2, SHORT = 0.9
/** segments a placeholder may have: an inline one, a display */
const SEGS_INLINE = 4, SEGS_DISPLAY = 64
const LINES_UNIT = 2000, PIECES_MAX = 10_000, SIZE_MAX = 200, SRC_MAX = 4000, FONTS_MAX = 512, FONT_MAX = 128
/** a box covering most of a page (a background, a frame round it) is no ink below a frame */
const PAGE_BOX = 0.95
const KIND = new Map(UNIT_KINDS.map((k, i) => [k, i]))
const PH_KIND = new Map(PH_KINDS.map((k, i) => [k, i]))
const LABEL_OF = { heading: 0, caption: 2, footnote: 3 }
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

/** a page's glyphs by baseline, rising, in arrays (x0, x1, y, top, bottom, size, font, u), and its boxes */
function glyphsOf(got, fontIds) {
  const order = got.glyphs.map((_, i) => i).sort((a, b) => {
    const p = got.glyphs[a], q = got.glyphs[b]
    return p.y - q.y || p.x0 - q.x0 || a - b
  })
  const n = order.length, P = {
    n, x0: new Float64Array(n), x1: new Float64Array(n), y: new Float64Array(n), top: new Float64Array(n), bottom: new Float64Array(n),
    size: new Float64Array(n), font: new Int32Array(n), u: new Array(n), owner: new Int32Array(n).fill(-1), taken: new Uint8Array(n),
    boxes: [], most: 0,
  }
  order.forEach((g, i) => {
    const t = got.glyphs[g]
    P.x0[i] = t.x0; P.x1[i] = t.x1; P.y[i] = t.y; P.top[i] = t.top; P.bottom[i] = t.bottom; P.size[i] = t.size; P.u[i] = t.u
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
/** a carried mark stands a little off its glyph's edge: on the four researched papers 18 of 3,766 opening marks lie more
 *  than 0.1 pt inside a glyph, 4 inside the placeholder's own first glyph by 0.12–0.36 pt (2307.16209's $\Psi_0$,
 *  $\ell$) and 14 inside the glyph before it, 2.35 pt from its start or more; of 3,707 closing marks 52 lie inside a
 *  glyph, 46 the placeholder's last, its middle before the mark, and 6 the punctuation after it, its middle past the mark.
 *  So a placeholder's glyph begins no more than MARK_SLACK before its opening mark, and has its middle before its closing
 *  mark */
const MARK_SLACK = 0.4
const startsFrom = (P, g, x) => P.x0[g] >= x - MARK_SLACK
const endsBy = (P, g, x) => mid(P, g) <= x
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
  const size0 = median(first.map(i => P.size[i]))
  const base = baselineOf(P, bodyOf(P, first, size0), r.base)
  const near = band(P, base - SCRIPT(P.most), base + SCRIPT(P.most)).filter(i => Math.abs(P.y[i] - base) < SCRIPT(P.size[i]) && ok(i))
  const inside = near.filter(i => mid(P, i) >= L && mid(P, i) <= R)
  if (!inside.length) return null
  let x0 = Infinity, x1 = -Infinity
  for (const i of inside) { x0 = Math.min(x0, P.x0[i]); x1 = Math.max(x1, P.x1[i]) }
  const glue = GLUE * size0, taken = new Set(inside)
  const right = near.filter(i => !taken.has(i) && mid(P, i) > R).sort((a, b) => P.x0[a] - P.x0[b] || a - b)
  for (const i of right) { if (P.x0[i] - x1 > glue) break; taken.add(i); x1 = Math.max(x1, P.x1[i]) }
  const left = near.filter(i => !taken.has(i) && mid(P, i) < L).sort((a, b) => P.x1[b] - P.x1[a] || a - b)
  for (const i of left) { if (x0 - P.x1[i] > glue) break; taken.add(i); x0 = Math.min(x0, P.x0[i]) }
  return rowOf(P, [...taken], r.page, r.ks, base)
}

/** a line from its glyphs: its extent, the baseline most of its body glyphs share (glyphs within BODY of their median
 *  size; `near` breaks a tie), the extremes of its glyphs, their median size and the font most of its characters have */
function rowOf(P, glyphs, page, ks, near) {
  const gl = [...glyphs].sort((a, b) => P.x0[a] - P.x0[b] || P.y[a] - P.y[b] || a - b)
  let x0 = Infinity, x1 = -Infinity, top = -Infinity, bottom = Infinity
  for (const i of gl) { x0 = Math.min(x0, P.x0[i]); x1 = Math.max(x1, P.x1[i]); top = Math.max(top, P.top[i]); bottom = Math.min(bottom, P.bottom[i]) }
  const size = median(gl.map(i => P.size[i])), body = bodyOf(P, gl, size)
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

/** the token a mark stands at, as anchors.mjs boundsFromMarks finds it: for a start mark the word whose box is nearest
 *  it, for an end mark the last word that begins before it */
function tokenAt(doc, byPage, m, start) {
  let best = null
  for (const k of byPage.get(m.page) ?? []) {
    const t = doc[k]
    if (Math.abs(t.y - m.y) > t.h * 0.4) continue
    if (start) { const d = m.x < t.x ? t.x - m.x : m.x > t.x + t.w ? m.x - t.x - t.w : 0; if (d < 8 && (!best || d < best.d)) best = { k, d } }
    else if (t.x < m.x + 1 && (!best || t.x > doc[best.k].x)) best = { k }
  }
  return best?.k ?? null
}
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
/** the source pieces of a unit that TeX ligatures and LaTeX's quotes set as other characters, as the glyphs have them */
const asSet = s => s.replace(/---/g, '\u2014').replace(/--/g, '\u2013').replace(/``/g, '\u201c').replace(/''/g, '\u201d').replace(/`/g, '\u2018').replace(/'/g, '\u2019').replace(/[~\s]/g, '')

/** stats before anything is read */
function blank(units) {
  return {
    lines: { carried: 0, total: 0 },
    units: { located: 0, total: units.length, byKind: {}, unplaced: 0 },
    ph: { marked: 0, found: 0, empty: 0, lost: 0, byKind: {}, unmarked: 0, inferred: 0, why: {}, textTaken: 0 },
    labels: {}, frames: { units: 0, split: 0, lineCountChecked: 0, lineCountEqual: 0 }, baselines: { first: [], last: [] },
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

  // ---------------------------------------------------------------- placeholders, by unit and source piece index
  // which pieces the marked original marks: its marking, as the marks file records it (the classes and the paper's
  // own switch it was compiled with)
  const design = new Map()
  {
    const { units: copies } = layoutMarking(units, marks.marking.classes, { lines: false, movesPunctuation: marks.marking.movesPunctuation })
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
  const ph = [], kept = new Map() // kept: page → the rectangles erasing leaves out (displays' segments, labels)
  const below = new Map() // page|column → the located units' rows there, by top (belowOf)
  const keep = (p, r) => (kept.get(p) ?? kept.set(p, []).get(p)).push(r)
  for (const one of placed) {
    const { id: i, u, a, rows, E } = one
    /** the line of the unit a position stands on, nearest by baseline, or -1 */
    const rowAt = m => {
      let best = -1, d = Infinity
      rows.forEach((r, j) => {
        const dy = Math.abs(r.base - m.y)
        if (r.page === m.page && dy < 0.5 * r.size && m.x >= r.x0 - 2 * r.size && m.x <= r.x1 + 4 * r.size && dy < d) { best = j; d = dy }
      })
      return best
    }
    /** a position on one of the unit's lines, { j, x }, or null */
    const placeOf = m => { const j = rowAt(m); return j < 0 ? null : { j, x: m.x } }
    /** the glyphs on line j's baseline, scripts and all, on its side of the page, no other unit's, by origin */
    const seen = new Map()
    /** whether another of the unit's lines holds glyph g nearer than line j: its baseline nearer the glyph's, the glyph
     *  in its window and within an em of its extent (a big operator's row above a text line takes none of the line's) */
    const nearer = (j, g) => {
      const r = rows[j], P = ink[r.page], d = Math.abs(P.y[g] - r.base), m = mid(P, g)
      return rows.some((o, n) => n !== j && o.page === r.page && Math.abs(P.y[g] - o.base) < d && Math.abs(P.y[g] - o.base) < SCRIPT(P.size[g]) && m >= o.x0 - o.size && m <= o.x1 + o.size)
    }
    const onLine = j => {
      if (seen.has(j)) return seen.get(j)
      const r = rows[j], P = ink[r.page], [s0, s1] = sideOf(r.page, columnOf(r.page, r.x0, r.x1))
      const gs = band(P, r.base - SCRIPT(P.most), r.base + SCRIPT(P.most)).filter(g => Math.abs(P.y[g] - r.base) < SCRIPT(P.size[g]) && mid(P, g) >= s0 && mid(P, g) <= s1 && (P.owner[g] === -1 || P.owner[g] === i) && !nearer(j, g)).sort((x, y) => P.x0[x] - P.x0[y] || x - y)
      seen.set(j, gs)
      return gs
    }
    /** where the unit's text after piece k begins — its first word's first glyph, as the anchor paired the word, and
     *  back over the stops and brackets before it — as { j, x, line } (line: the word's line), or null where that is not
     *  known; a placeholder next: its opening mark; none: the unit's end mark */
    const nextText = k => {
      let lead = ''
      for (let q = k + 1; q < u.pieces.length; q++) {
        const p = u.pieces[q]
        if (p.t === 'text') {
          const s = plainTranslated([p]).normalize('NFKC')
          if (!tokens(s).length) { lead += s; continue }
          const w = tokens(plainTranslated(u.pieces.slice(0, q))).length, d = a.pairs?.get(w)
          const tk = d === undefined ? null : doc[d]
          const to = tk && placeOf({ page: tk.page, x: tk.x, y: tk.y })
          if (!to) return null
          let j = to.j, L = onLine(j), P = ink[rows[j].page]
          let at = -1
          for (let g = 0; g < L.length; g++) {
            const x = P.x0[L[g]]
            if (Math.abs(x - tk.x) > 0.6 * tk.h || !charsOf(P.u[L[g]]).startsWith(tk.t[0])) continue
            if (at < 0 || Math.abs(x - tk.x) < Math.abs(P.x0[L[at]] - tk.x)) at = g
          }
          if (at < 0) return null
          // the characters before the word in its piece and in the pieces of marks alone before it, glyph by glyph
          // back, onto the line before where they begin it
          const before = asSet(lead + s.slice(0, tokens(s)[0].at))
          for (let c = before.length - 1; c >= 0; c--) {
            if (at === 0) {
              if (j === 0) return null
              j--; L = onLine(j); P = ink[rows[j].page]; at = L.length
            }
            if (at === 0 || !charsOf(P.u[L[at - 1]]).endsWith(charsOf(before[c]))) return null
            at--
          }
          return { j, x: at < L.length ? P.x0[L[at]] : Infinity, line: to.j }
        }
        if ((p.t === 'ph' || p.t === 'nested') && classOf(p)) {
          // a placeholder next: where its own opening mark is, else the end is not known
          const o = markOf(`${classOf(p) === 'footnote' ? 'n' : 'p'}${i}.${q}a`)
          return o ? placeOf(o) : null
        }
      }
      return E ? placeOf(E) : null
    }
    /** the glyphs of the unit's line j from position x0 to x1 (by origin), or from x0 on (x1 null) or up to x1 (x0 null)
     *  as far as each is within an em of the next, none taken by a placeholder before */
    const inkOn = (j, x0, x1) => {
      const r = rows[j], P = ink[r.page], em = r.size
      const L = onLine(j).filter(g => !P.taken[g])
      // from an opening mark, the glyphs that begin no more than MARK_SLACK before it; up to a closing mark, those whose
      // middle is before it (startsFrom, endsBy)
      if (x0 !== null && x1 !== null) return L.filter(g => startsFrom(P, g, x0) && endsBy(P, g, x1))
      // to the line's end or from its start: as far as each glyph is within an em of the next, and the line's extent an
      // em at most
      if (x0 !== null) {
        const out = []
        let edge = x0
        for (const g of L) { if (!startsFrom(P, g, x0)) continue; if (P.x0[g] - edge > em || P.x0[g] > r.x1 + em) break; out.push(g); edge = Math.max(edge, P.x1[g]) }
        return out
      }
      const out = []
      let edge = x1
      for (let q = L.length - 1; q >= 0; q--) { const g = L[q]; if (!endsBy(P, g, x1)) continue; if ((Number.isFinite(edge) && edge - P.x1[g] > em) || P.x1[g] < r.x0 - em) break; out.unshift(g); edge = P.x0[g] }
      return out
    }
    /** whether nothing is drawn between two places on line j and the line's ink goes on either side of them: no glyph of
     *  any unit's, taken or not, has its middle between them, and one has its middle before them and one after */
    const drawsNothing = (j, x0, x1) => {
      const r = rows[j], P = ink[r.page], [s0, s1] = sideOf(r.page, columnOf(r.page, r.x0, r.x1))
      let before = false, after = false
      for (const g of band(P, r.base - SCRIPT(P.most), r.base + SCRIPT(P.most))) {
        if (Math.abs(P.y[g] - r.base) >= SCRIPT(P.size[g]) || mid(P, g) < s0 || mid(P, g) > s1) continue
        if (startsFrom(P, g, x0) && endsBy(P, g, x1)) return false
        if (!startsFrom(P, g, x0)) before = true
        else after = true
      }
      return before && after
    }
    /** whether a glyph is a letter of a word of the unit's text, as the anchor paired the word: running text, never a
     *  placeholder's (counted, `textTaken`). A word's box is its item's even share, so a bracket beside it may fall in it:
     *  the glyph's letter is the word's too */
    const paired = new Map()
    for (const k of a.pairs?.values() ?? []) { const t = doc[k]; if (t?.t) (paired.get(t.page) ?? paired.set(t.page, []).get(t.page)).push(t) }
    const inWord = (page, g) => {
      const P = ink[page], m = mid(P, g), c = charsOf(P.u[g])
      return /\p{L}/u.test(c) && (paired.get(page) ?? []).some(t => m >= t.x && m <= t.x + t.w && Math.abs(P.y[g] - t.y) < 0.5 * t.h && t.t.includes(c))
    }
    for (let k = 0; k < u.pieces.length; k++) {
      // every visible piece has its row, found, LOST or EMPTY: no row is a piece that draws nothing (an invisible one, a
      // group's open or close), as the layer reads the file
      const piece = u.pieces[k], cls = classOf(piece)
      if (!cls) continue
      const kind = PH_KIND.get(cls) ?? PH_KIND.get('other')
      const d = classes.has(cls) ? design.get(`${i}.${k}`) : null
      const lost = why => ph.push({ row: [i, k, kind, PH_FLAG.LOST], cls, state: 'lost', why })
      // a piece the marked original gives no mark (at a unit's head, after a prefix or a control sequence's end, glued
      // to a word): its rendering is not known
      if (!d?.open) { ph.push({ row: [i, k, kind, PH_FLAG.LOST], cls, state: 'unmarked' }); continue }
      const prefix = cls === 'footnote' ? 'n' : 'p', na = `${prefix}${i}.${k}a`, nb = `${prefix}${i}.${k}b`
      const A = markOf(na) ?? besideOf(nb, markOf(nb), na)
      const from = A && placeOf(A)
      if (!from) { lost(A ? 'opening mark on no line of the unit' : 'opening mark not carried'); continue }
      const B = markOf(nb) ?? besideOf(na, A, nb)
      const closed = B ? placeOf(B) : null
      const to = closed ?? (B ? null : nextText(k))
      if (!to) { lost(B ? 'closing mark on no line of the unit' : at.has(nb) ? 'closing mark not carried' : 'end not inferred'); continue }
      if (to.j < from.j || (to.j === from.j && to.x < from.x - 0.02)) { lost('marks out of order'); continue }
      const before = u.pieces[k - 1], after = u.pieces[k + 1]
      let flags = before?.t === 'text' && /[([]$/.test(before.s ?? '') && after?.t === 'text' && /^[)\]]/.test(after.s ?? '') ? PH_FLAG.SOURCE_BRACKETS : 0
      let segs = []
      if (cls === 'display') {
        segs = displaySegments(rows, from, { j: to.line ?? to.j }, one)
        if (segs === null) { lost(segs === null && to.j > from.j ? 'display across a page or a column, or no ink of its own' : 'display ending its unit, nothing below it, or no ink of its own'); continue }
        if (segs.numbered) flags |= PH_FLAG.NUMBERED
      } else {
        // the glyphs from the opening mark to the end, scripts and all, one segment a line, none another one's
        if (to.j - from.j >= SEGS_INLINE) { lost('more lines than an inline placeholder may have'); continue }
        const ra = rows[from.j], rb = rows[to.j]
        /** a row between the first and the last in the unit's order is the placeholder's only where it lies between their
         *  lines on the page: one the anchor gave out of order (a line above, a script row) is a text line, never its ink */
        const between = r => (r.page === ra.page ? r.base < ra.base - 0.5 * r.size : r.page > ra.page) && (r.page === rb.page ? r.base > rb.base + 0.5 * r.size : r.page < rb.page)
        for (let j = from.j; j <= to.j; j++) {
          const r = rows[j], P = ink[r.page]
          if (j !== from.j && j !== to.j && !between(r)) continue
          const gs = from.j === to.j ? inkOn(j, from.x, to.x) : j === from.j ? inkOn(j, from.x, null) : j === to.j ? inkOn(j, null, to.x) : inkOn(j, -Infinity, Infinity)
          if (!gs.length) continue
          let x0 = Infinity, x1 = -Infinity, top = -Infinity, bottom = Infinity
          for (const g of gs) { x0 = Math.min(x0, P.x0[g]); x1 = Math.max(x1, P.x1[g]); top = Math.max(top, P.top[g]); bottom = Math.min(bottom, P.bottom[g]) }
          // the rules and bars between them (a fraction's, a radical's)
          const boxes = P.boxes.filter(b => b[0] >= x0 - 0.5 && b[2] <= x1 + 0.5 && b[3] > r.base - SCRIPT(r.size) && b[1] < r.base + SCRIPT(r.size) && b[3] - b[1] <= 2 * SCRIPT(r.size))
          // a glyph past the window between the marks that meets one of them is the formula's too: a radical's sign,
          // whose origin TeX raises to its bar
          if (boxes.length) {
            const lo = from.j === j ? from.x : -Infinity, hi = to.j === j ? to.x : Infinity, has = new Set(gs)
            for (const g of band(P, r.base - 2 * SCRIPT(P.most), r.base + 2 * SCRIPT(P.most))) {
              if (has.has(g) || P.taken[g] || (P.owner[g] !== -1 && P.owner[g] !== i) || !startsFrom(P, g, lo) || !endsBy(P, g, hi)) continue
              if (boxes.some(b => P.x0[g] <= b[2] + 0.1 && P.x1[g] >= b[0] - 0.1 && P.bottom[g] <= b[3] + 0.1 && P.top[g] >= b[1] - 0.1)) { gs.push(g); x0 = Math.min(x0, P.x0[g]); x1 = Math.max(x1, P.x1[g]) }
            }
          }
          for (const b of boxes) { top = Math.max(top, b[3]); bottom = Math.min(bottom, b[1]) }
          for (const g of gs) { top = Math.max(top, P.top[g]); bottom = Math.min(bottom, P.bottom[g]) }
          for (const g of gs) { P.taken[g] = 1; P.owner[g] = i; if (inWord(r.page, g)) stats.ph.textTaken++ }
          segs.push({ page: r.page, x0, base: r.base, x1, top, bottom, inkBase: baselineOf(P, bodyOf(P, gs, r.size), r.base), size: r.size, row: j, boxes, gs })
        }
        if (segs.length) {
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
      }
      // EMPTY only where the piece draws nothing: its marks on one line, the line's ink either side of them and no glyph of
      // anyone's between; else its ink is somewhere it was not found, and it is LOST (its unit stays the original's)
      if (!segs.length) {
        if (cls !== 'display' && from.j === to.j && drawsNothing(from.j, from.x, to.x)) ph.push({ row: [i, k, kind, flags | PH_FLAG.EMPTY], cls, state: 'empty' })
        else lost(from.j === to.j ? 'ink between its marks not its own, or past its line' : 'no ink between its lines')
        continue
      }
      const row = [i, k, kind, flags]
      for (const s of segs) {
        const [x0, bottom, x1, top] = solid(viewAt(s.page), s.x0, s.bottom, s.x1, s.top)
        row.push(s.page, x0, Math.min(viewAt(s.page)[3], Math.max(viewAt(s.page)[1], r2(s.base))), x1, top, bottom)
        if (cls === 'display') keep(s.page, [x0, bottom, x1, top])
      }
      ph.push({ row, cls, state: 'found', inferred: !closed })
    }
  }

  /**
   * Where a display that ends its unit ends: the next line below its opening mark's in its column, another located
   * unit's, or the next unit's start mark there (a float's passed over), as the height the display's glyphs' middles
   * stand above; null where neither is on its page and in its column
   */
  function belowOf(one, ra, col) {
    let lo = null
    // the located units' rows of the page and column, by their tops falling, made once: the first below the line not
    // the unit's own is the nearest
    const key = `${ra.page}|${col}`
    if (!below.has(key)) below.set(key, placed.flatMap(o => o.rows.filter(r => r.page === ra.page && columnOf(r.page, r.x0, r.x1) === col).map(r => [r.top, o.id])).sort((p, q) => q[0] - p[0] || p[1] - q[1]))
    const tops = below.get(key)
    let a = 0, b = tops.length
    while (a < b) { const m = (a + b) >> 1; if (tops[m][0] >= ra.bottom) a = m + 1; else b = m }
    for (let q = a; q < tops.length; q++) if (tops[q][1] !== one.id) { lo = tops[q][0]; break }
    for (let n = one.id + 1; n < units.length; n++) {
      if (FLOATING.has(units[n].kind)) continue
      const S = carriedUnit.get(`${n}s`)
      if (S && S.page === ra.page && S.y < ra.base && columnOf(S.page, S.x, S.x) === col) { const y = S.y + 0.5 * ra.size; if (lo === null || y > lo) lo = y }
      break
    }
    return lo
  }

  /**
   * A display's segments: the rows of glyphs and graphics between the line of its opening mark and the line it ends on
   * (for one that ends its unit, belowOf), in the column of its opening mark, each a segment, an equation number at its
   * column's edge its own last one; null where the two lines are not on one page and in one column, or the end of a
   * display that ends its unit is not found
   */
  function displaySegments(rows, from, to, one) {
    const ra = rows[from.j], col = columnOf(ra.page, ra.x0, ra.x1)
    let lo
    if (to.j > from.j) {
      const rb = rows[to.j]
      if (rb.page !== ra.page || columnOf(rb.page, rb.x0, rb.x1) !== col) return null
      lo = rb.top
    } else {
      // the unit's end mark where its opening mark is: TeX set it on the line the display left
      lo = belowOf(one, ra, col)
      if (lo === null) return null
    }
    const P = ink[ra.page], [cx0, cx1] = sideOf(ra.page, col), hi = ra.bottom
    const items = []
    for (const g of band(P, lo - SCRIPT(P.most), hi + SCRIPT(P.most))) {
      const c = (P.top[g] + P.bottom[g]) / 2
      if (c >= hi || c <= lo || mid(P, g) < cx0 || mid(P, g) > cx1 || P.taken[g] || (P.owner[g] !== -1 && P.owner[g] !== one.id)) continue
      items.push({ g, x0: P.x0[g], x1: P.x1[g], top: P.top[g], bottom: P.bottom[g] })
    }
    for (const b of P.boxes) {
      const c = (b[1] + b[3]) / 2
      if (c < hi && c > lo && (b[0] + b[2]) / 2 >= cx0 && (b[0] + b[2]) / 2 <= cx1 && b[3] - b[1] < hi - lo) items.push({ g: -1, x0: b[0], x1: b[2], top: b[3], bottom: b[1] })
    }
    items.sort((x, y) => y.top - x.top || x.x0 - y.x0 || x.g - y.g)
    const lines = []
    for (const it of items) {
      const cur = lines.at(-1)
      if (cur && it.top >= cur.bottom) { cur.items.push(it); cur.bottom = Math.min(cur.bottom, it.bottom); cur.top = Math.max(cur.top, it.top) } else lines.push({ items: [it], top: it.top, bottom: it.bottom })
    }
    // the number: a run of glyphs reading (1), (2.3a), (iv) within an em of the column's text edge, the lowest found
    const [ex0, ex1] = edgesOf(ra.page, col) ?? [cx0, cx1]
    let number = null
    for (let l = lines.length - 1; l >= 0 && !number; l--) {
      const gs = lines[l].items.filter(it => it.g >= 0).sort((x, y) => x.x0 - y.x0)
      if (!gs.length) continue
      const runs = [[gs[0]]]
      for (let q = 1; q < gs.length; q++) { if (gs[q].x0 - runs.at(-1).at(-1).x1 > 0.3 * P.size[gs[q].g]) runs.push([]); runs.at(-1).push(gs[q]) }
      for (const run of [runs.at(-1), runs[0]]) {
        const s = run.map(it => P.u[it.g]).join('').normalize('NFKC').replace(/\s/g, '')
        const em = median(run.map(it => P.size[it.g])), rx0 = run[0].x0, rx1 = Math.max(...run.map(it => it.x1))
        const edge = run === runs.at(-1) ? ex1 - rx1 <= em : rx0 - ex0 <= em
        if (NUMBER.test(s) && edge) { number = { l, run }; break }
      }
    }
    const segs = []
    const segOf = its => {
      let x0 = Infinity, x1 = -Infinity, top = -Infinity, bottom = Infinity
      for (const it of its) { x0 = Math.min(x0, it.x0); x1 = Math.max(x1, it.x1); top = Math.max(top, it.top); bottom = Math.min(bottom, it.bottom) }
      const gs = its.filter(it => it.g >= 0).map(it => it.g)
      const base = gs.length ? baselineOf(P, bodyOf(P, gs, median(gs.map(g => P.size[g]))), (top + bottom) / 2) : (top + bottom) / 2
      return { page: ra.page, x0, x1, top, bottom, base }
    }
    // a row of graphics alone wider than the display's glyphs is not the display's: a footnote's rule under it, a frame
    let gx0 = Infinity, gx1 = -Infinity
    for (const line of lines) for (const it of line.items) if (it.g >= 0) { gx0 = Math.min(gx0, it.x0); gx1 = Math.max(gx1, it.x1) }
    const alien = line => line.items.every(it => it.g < 0) && line.items.some(it => it.x0 < gx0 - 1 || it.x1 > gx1 + 1)
    lines.forEach((line, l) => {
      if (alien(line)) return
      const its = number && number.l === l ? line.items.filter(it => !number.run.includes(it)) : line.items
      if (its.length) segs.push(segOf(its))
    })
    if (number) segs.push(segOf(number.run))
    // a display has ink: none of its own found (all another unit's, or none there) is no display found
    if (!segs.length || segs.length > SEGS_DISPLAY) return null
    for (const line of lines) if (!alien(line)) for (const it of line.items) if (it.g >= 0) P.taken[it.g] = 1
    segs.numbered = !!number
    return segs
  }

  // ---------------------------------------------------------------- labels
  const labels = []
  const owned = (p, g, unit) => ink[p].owner[g] !== -1 && ink[p].owner[g] !== unit
  for (const one of placed) {
    const { id: i, u, rows, S } = one
    const r0 = rows[0]
    if (!S || S.page !== r0.page || Math.abs(S.y - r0.base) >= 0.5 * r0.size) continue
    one.label = false
    const P = ink[S.page], [cx0] = sideOf(S.page, columnOf(S.page, S.x, S.x))
    const cand = band(P, S.y - 0.35 * P.most, S.y + 0.75 * Math.max(P.most, 6)).filter(g => P.y[g] > S.y - 0.35 * P.size[g] && P.y[g] < S.y + 0.75 * Math.max(P.size[g], 6) && P.x1[g] <= S.x + 0.05 && P.x0[g] >= cx0 - 1 && !owned(S.page, g, -2) && !P.taken[g]).sort((a, b) => P.x0[a] - P.x0[b] || a - b)
    const run = []
    let edge = S.x
    for (let q = cand.length - 1; q >= 0; q--) { const g = cand[q]; if (edge - P.x1[g] > LABEL_EM * P.size[g]) break; run.unshift(g); edge = Math.min(edge, P.x0[g]) }
    // wholly left of the unit's first line
    const mine = run.filter(g => P.x1[g] <= r0.x0 + 0.01)
    if (!mine.length) continue
    let x0 = Infinity, x1 = -Infinity, top = -Infinity, bottom = Infinity
    for (const g of mine) { x0 = Math.min(x0, P.x0[g]); x1 = Math.max(x1, P.x1[g]); top = Math.max(top, P.top[g]); bottom = Math.min(bottom, P.bottom[g]) }
    const view = viewAt(S.page), [a, c, b, d] = solid(view, x0, bottom, x1, top)
    const base = Math.min(d, Math.max(c, baselineOf(P, mine, S.y)))
    labels.push([i, LABEL_OF[u.kind] ?? 1, S.page, a, base, b, d, c])
    keep(S.page, [a, c, b, d])
    one.label = true
  }

  // ---------------------------------------------------------------- erase, frames, rows
  const fontIndex = new Map(), fonts = []
  const fontOf = id => { if (!fontIndex.has(id)) { fontIndex.set(id, fonts.length); fonts.push(names[id]) } return fontIndex.get(id) }
  const outUnits = [], outLines = [], outFrames = [], outErase = [], outHeadings = []
  const labelAt = new Map(labels.map(l => [l[0], l[3]]))
  const inside = (p, x, y) => (kept.get(p) ?? []).some(([a, c, b, d]) => x >= a && x <= b && y >= c && y <= d)
  const meets = (p, a, c, b, d) => (kept.get(p) ?? []).some(([e, f, g, h]) => a < g && b > e && c < h && d > f)
  for (const one of placed) {
    const { id: i, u, rows, S, E } = one
    // the erase: each line's own glyphs and its placeholders' rules, but what erasing leaves out, merged
    const erase = []
    let refuse = false
    rows.forEach((r, j) => {
      const P = ink[r.page], view = viewAt(r.page)
      const rects = []
      for (const g of new Set([...r.gl, ...(r.extra ?? [])])) if (!inside(r.page, mid(P, g), (P.top[g] + P.bottom[g]) / 2)) rects.push([P.x0[g], P.bottom[g], P.x1[g], P.top[g], P.size[g]])
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
  // what the file holds of the units it does not: nothing; their placeholders and labels go with them
  const kept1 = new Set(outUnits.map(r => r[0]))
  const file = {
    schema: 1, layout: LAYOUT, pdfjs, paper: { id: paper.id, version: paper.version, pages }, left, views, fonts,
    units: outUnits, lines: outLines, frames: outFrames, erase: outErase,
    ph: ph.filter(p => kept1.has(p.row[0])).map(p => p.row), labels: labels.filter(r => kept1.has(r[0])), headings: outHeadings,
  }
  // the placeholders and labels counted as the file holds them
  for (const p of ph) {
    if (!kept1.has(p.row[0])) continue
    if (p.state === 'unmarked') { stats.ph.unmarked++; continue }
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
