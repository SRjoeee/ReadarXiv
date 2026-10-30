// The highlight's geometry: what a unit paints on a side, and where the pointer lights it — the same shapes, so that a
// point lights a unit exactly when it is inside what the unit paints. Pure — no DOM — so that the reader and the Node
// probes run the same code.
//
// From the side's tokens (anchors.mjs tokenizeDocument; their ink's edges, inkEdges) and its anchors: the page's lines;
// each unit's runs (one page and one column each), and inside a run its rows (lines that overlap merged, so that a
// display's zig-zag of numerator, denominator, limits, scripts and number is one row); a run's block, across its rows
// inside the column's text edges. The edges are the document's (per page size, parity and column, from every page's
// long lines): a page of displays has too few lines of prose to give its own, a two-sided class shifts the text between
// odd and even pages, and a landscape page or one of another size has a measure of its own. The document's layout is made once a side is anchored; a page's runs when the page is first
// drawn or pointed at, since most pages of a long paper are never looked at in a visit. On the layer path the layout
// is made page by page (pageLayout): its document part from the parts' rectangles as they come, a page's tokens as its
// left part lands — the same layout once all are in (docs/PDF-READER.md §17.8).
// The look was chosen on a draft (round 1 of the highlight, 2026-10-01): one block per run, padded half the leading
// above and below and 3 px beside, one outline with 3 px corners. Where a unit's sentences are known on both sides
// (anchors.mjs sentenceStarts), a sentence instead: its first row from its start, the rows between across its unit's
// text in the column — over a column or a page break too —, its last row to its end with its punctuation, two
// sentences on one row meeting halfway through the space between them — one outline per run, the hit test the same
// shapes.

import { bodyMax, frameOfTokens, inkEdges } from '../pipeline/anchors.mjs'
import { FIGURE_KIND } from '../rules/content-classes.mjs'
// floats.mjs imports this module's geometry; its shapes are read here only when a sentence is drawn (reachAt)
import { floatShapes } from './floats.mjs'

/** kinds of unit that are no running text: what lies among their words is their float's, not theirs (a figure's ink unit, a
 *  label's: content-classes.mjs FIGURE_KIND); and a display, a block of its own lit whole (view/shapes.mjs: its segments' tokens,
 *  layer-proto/units.mjs displayBlockId; the owner, 2026-10-30) */
const NOT_RUNNING = new Set(['heading', 'cell', 'figure', FIGURE_KIND, 'display'])
/** kinds of unit a float holds or names, whose words' gaps hold the float's own (a caption's figure's labels between its words in
 *  the stream): nothing between two of their words is theirs (pageGeometry's filling). A caption lights by sentence, as a body unit
 *  does (the owner, 2026-10-30, docs/PDF-READER.md §17.1), but keeps out of its float's words */
const UNFILLED = new Set([...NOT_RUNNING, 'caption'])
/** whether a kind of unit may light by sentence: running text (hitOf, sentencesFit) */
export const bySentence = kind => !NOT_RUNNING.has(kind)
/** the kinds of a drawing's text (TikZ's words, a figure's labels the wrap made units): no layout here holds one (layoutOf,
 *  layoutParts, layoutPage), its words free, only where it stands kept (`drawings`: page → boxes), which a float takes for its
 *  own (floats.mjs pageFloats: a float holding one is a figure). So none lights, and none costs a page's geometry or a hit
 *  anything (the owner, 2026-10-30: a figure's labels not paired unless that is free; measured not to be, docs/PDF-READER.md
 *  §17.1) */
export const DRAWING = new Set(['figure', FIGURE_KIND])
/** a drawing's text's rectangles ({ page, x0, y0, x1, y1 }) kept where it stands */
function drawnAt(drawings, rects) {
  for (const { page, x0, y0, x1, y1 } of rects) (drawings.get(page) ?? drawings.set(page, []).get(page)).push({ x0, y0, x1, y1 })
}
/** kinds of unit a float holds, which may be wider than the measure (a table, a figure and its caption): their blocks
 *  keep their ink past the column's edge, where a cell past it was clamped to nothing (the review of B1's gate) */
const FLOATS = new Set(['caption', 'cell', 'figure'])
/** a text line is long when it spans a quarter of the page; a page has two columns when four long lines stand in
 *  each half; a column's edge is the outermost x that three long lines (and 5 % of them) share, to a unit */
const LONG = 0.25, COLUMN_LINES = 4, EDGE_LINES = 3, EDGE_SHARE = 0.05
/** how far past the column's edge a run's rows may reach (an overfull display), and within how far of it they are the edge's */
const OVERHANG = 6, SNAP = 3
/** lines overlapping by more than this (PDF units) are one row */
const OVERLAP = 0.5

const median = xs => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1] }
/** the lower quartile */
const quartile = xs => { const s = [...xs].sort((a, b) => a - b); return s[(s.length - 1) >> 2] }
/** the first index of a sorted array holding a value ≥ v */
function lowerBound(xs, v) {
  let lo = 0, hi = xs.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid] < v) lo = mid + 1; else hi = mid }
  return lo
}

/**
 * A side's layout, made once it is anchored: what a page's geometry needs of each token, kept compact (its ink across,
 * its baseline and size, its glyphs' height), and from the units' lines (anchorUnits' rects, a few thousand where the
 * tokens are tens of thousands) each page's columns, the document's column text edges and the half leading of each
 * kind of unit on each page; the units on each page. `doc` tokenizeDocument's tokens; `views` each page's box, [x0, y0, x1, y1]; `anchors`
 * anchorUnits' result; `kindOf(id)` a unit's kind. Nothing of `doc` is kept: its objects, with their words and items,
 * are ten times the copy (2608.02459: 9 and 11.6 MB a side). `o.edges`: the tokens' ink edges made already (inkEdges, as
 * layout/arxiv.mjs makes them a page at a time while the text items are there), copied, for tokens whose items are let
 * go; `o.columns`: the rule of the pages' columns the far push reads (pageColumns, today's: from every located unit's
 * lines; null: today's, the document part's; columnsOfTokens': arXiv's text alone), never the layout's own columns
 */
export function layoutOf(doc, views, anchors, kindOf = () => undefined, { edges = null, columns = null } = {}) {
  const n = doc.length, pages = views.length
  const { l, r } = edges ? { l: Float32Array.from(edges.l), r: Float32Array.from(edges.r) } : inkEdges(doc)
  const tok = { l, r, y: new Float32Array(n), h: new Float32Array(n), top: new Float32Array(n), bottom: new Float32Array(n) }
  // tokens are in page order: page p's are [pageStart[p], pageStart[p + 1])
  const pageStart = new Int32Array(pages + 2).fill(n), far = []
  for (let k = 0, last = 0; k < n; k++) {
    const w = doc[k]
    tok.y[k] = w.y; tok.h[k] = w.h; tok.top[k] = w.top; tok.bottom[k] = w.bottom
    if (w.page !== last) { pageStart[w.page] = k; last = w.page }
    if (w.far > r[k]) far.push(k)
  }
  for (let p = pages; p >= 1; p--) if (pageStart[p] > pageStart[p + 1]) pageStart[p] = pageStart[p + 1]
  const units = [], drawings = new Map()
  for (const [id, a] of anchors) if (a?.tokens?.length) { if (DRAWING.has(kindOf(id))) drawnAt(drawings, a.rects); else units.push([id, a.rects]) }
  const part = documentOf(views, units, kindOf), { page, unitsOn, pagesOf } = part
  // a mark set apart after a token on its baseline (tokenizeDocument's `far`) is its ink where it ends at the token's
  // column's text edge: a proof's box set flush right. The columns it is read by: the document part's, or a rule's given
  // (the whole left's for a part's units alone, the page stream's test; arXiv's text's alone, columnsOfTokens), which
  // reads the push alone: the layout's own columns are the document part's whatever the rule
  const push = columns ? columns(views, anchors, kindOf) : page
  for (const k of far) {
    const w = doc[k], P = push[w.page], e = P && (P.cols[colOf(P, w.x, w.x + w.w)] ?? P.cols.F)
    if (e && Math.abs(w.far - e.x1) < SNAP) r[k] = w.far
  }
  // each page's tokens as its geometry reads them (pageGeometry): views of the side's arrays, its tokens' ids from k0
  const pt = [null]
  for (let p = 1; p <= pages; p++) {
    const k0 = pageStart[p], k1 = pageStart[p + 1]
    pt[p] = { k0, n: k1 - k0, l: l.subarray(k0, k1), r: r.subarray(k0, k1), y: tok.y.subarray(k0, k1), h: tok.h.subarray(k0, k1), top: tok.top.subarray(k0, k1), bottom: tok.bottom.subarray(k0, k1) }
  }
  return { tok, pageStart, pt, page, anchors, kindOf, unitsOn, pagesOf, cache: new Map(), indents: new Map(), drawings }
}

/**
 * A side's layout made page by page (the shared reader view, its contract §2.7): nothing until it is told, then the
 * document part from the units' line rectangles and the pages' views as the parts come (layoutParts), and a page's part
 * from its tokens as they come (layoutPage). Once every part and page is in, it is the layout layoutOf makes of the same
 * tokens and rectangles, in every page's geometry and every sentence shape, whatever order the pages came in (the
 * highlight's gate, SH1). A page's tokens are a table of its own, their ids from the page's first (the left part's
 * `first`: the side's stream, as the parts' units name their streams), rising page by page
 */
export function pageLayout(kindOf = () => undefined) {
  return { tok: null, pageStart: null, pt: [null], page: [null], anchors: new Map(), kindOf, unitsOn: [], pagesOf: new Map(), cache: new Map(), indents: new Map(), views: [], told: new Map(), spans: new Map(), drawings: new Map(), drawn: new Set(), boxes: new Map(), inPlace: new Set() }
}

/**
 * The document part, as parts come (format.mjs ReadPart: its `pages` [a, b], `views` of pages a … reach, stride 4, and
 * `left`, its units [id, stream, rects], rects [page, x0, y0, x1, y1]): a page's view and a unit as first told, the
 * document part made again of every unit told so far, by id rising, and every page's geometry let go, to be made again
 * from it — the columns' edges, the half leadings and the floats' frames are the document's. A drawing's text (DRAWING) is
 * told where it stands alone. Parts that tell no view and no unit not told before change nothing, and keep every page's
 * geometry (false)
 */
export function layoutParts(L, parts) {
  let told = false
  for (const { pages, views, left, quiet = false } of parts) {
    for (let i = 0; 4 * i < views.length; i++) {
      const at = pages[0] - 1 + i
      if (!L.views[at]) { L.views[at] = views.slice(4 * i, 4 * i + 4); told = true }
    }
    for (const [id, stream, rects] of left) {
      // (a unit told from its boxes alone, quiet, gives way to its located telling, whichever comes first: view/shapes.mjs)
      const was = L.told.get(id)
      const rs = rects.map(([page, x0, y0, x1, y1]) => ({ page, x0, y0, x1, y1 }))
      // (a located unit's boxes on a page it is not located on: that page its own too, its rectangles there quiet — no part of the
      // page's columns, edges or leadings; view/shapes.mjs)
      if (was && quiet && !was.quiet && !L.drawn.has(id)) {
        const have = new Set(was.rects.map(r => r.page)), add = rs.filter(r => !have.has(r.page))
        if (!add.length) continue
        for (const r of add) r.quiet = true
        was.rects = [...was.rects, ...add]
        L.anchors.delete(id)
        told = true
        continue
      }
      if (L.drawn.has(id) || (was && (quiet || !was.quiet))) continue
      if (was) L.anchors.delete(id)
      if (DRAWING.has(L.kindOf(id))) { L.drawn.add(id); drawnAt(L.drawings, rs) } else L.told.set(id, { stream, rects: rs, ...(quiet ? { quiet } : {}) })
      told = true
    }
  }
  if (!told) return false
  const units = [...L.told].sort((a, b) => a[0] - b[0])
  Object.assign(L, documentOf(Array.from(L.views, v => v ?? null), units.map(([id, u]) => [id, u.rects, u.quiet === true]), L.kindOf))
  for (const [id, u] of units) if (!L.anchors.has(id)) L.anchors.set(id, { rects: u.rects, tokens: tokensOf(L, id, u.stream) })
  L.cache.clear()
  L.indents.clear()
  L.frames = undefined
  L.floats = undefined
  return true
}

/**
 * A page's part: its tokens (`table` { n, l, r, y, h, top, bottom }, as a layout keeps them — the ink after the closing
 * marks' push to the column's edge), their ids `first` … `first` + n − 1, and each unit's tokens there (`spans` [id,
 * tokens], each rising). The table is kept as given and never written. A page given again changes nothing (false); one
 * whose ids reach into another page's, or fall where the pages rise, is refused (a RangeError) and nothing of it kept
 */
export function layoutPage(L, p, { first, table, spans }) {
  if (!Number.isSafeInteger(p) || p < 1 || !Number.isSafeInteger(first) || first < 0) throw new RangeError(`not a page and its first token (${p}, ${first})`)
  if (L.pt[p]) return false
  const n = table.n
  for (let q = p - 1; q >= 1; q--) { const t = L.pt[q]; if (!t) continue; if (t.k0 + t.n > first) throw new RangeError(`page ${p}'s tokens from ${first} reach into page ${q}'s, to ${t.k0 + t.n}`); break }
  for (let q = p + 1; q < L.pt.length; q++) { const t = L.pt[q]; if (!t) continue; if (first + n > t.k0) throw new RangeError(`page ${p}'s tokens to ${first + n} reach into page ${q}'s, from ${t.k0}`); break }
  L.pt[p] = { k0: first, n, l: table.l, r: table.r, y: table.y, h: table.h, top: table.top, bottom: table.bottom }
  for (const [id, tokens] of spans) {
    if (DRAWING.has(L.kindOf(id))) continue
    ;(L.spans.get(id) ?? L.spans.set(id, new Map()).get(id)).set(p, tokens)
    const u = L.told.get(id)
    if (u) L.anchors.get(id).tokens = tokensOf(L, id, u.stream)
  }
  L.cache.delete(p)
  return true
}

/**
 * Units' tokens on a page given already (`spans` [id, tokens], each rising): a unit told after its page came (a babel name's,
 * view/shapes.mjs createShapes), its tokens made again, the page's geometry let go. False where the page is not in
 */
export function layoutSpans(L, p, spans) {
  if (!L.pt[p]) return false
  for (const [id, tokens] of spans) {
    if (DRAWING.has(L.kindOf(id))) continue
    ;(L.spans.get(id) ?? L.spans.set(id, new Map()).get(id)).set(p, tokens)
    const u = L.told.get(id)
    if (u) L.anchors.get(id).tokens = tokensOf(L, id, u.stream)
  }
  L.cache.delete(p)
  return true
}

/**
 * A unit's stream told again, in a layout whose units' first tokens come with their pages rather than with the parts (the
 * right's on the layer, whose tokens are a laid page's words: layerShapes): its tokens made again, its pages' geometry let go.
 * False where the unit is not told or its stream is that already
 */
export function layoutStream(L, id, stream) {
  const u = L.told?.get(id)
  if (!u || u.stream === stream) return false
  u.stream = stream
  L.anchors.get(id).tokens = tokensOf(L, id, stream)
  for (const p of L.pagesOf.get(id) ?? []) L.cache.delete(p)
  return true
}

/** a unit's tokens in a layout made page by page: those of every page given, rising, and its stream (its first token,
 *  which a page's geometry tells its head by, and its sentences whether one began before a run) */
function tokensOf(L, id, stream) {
  const on = L.spans.get(id), out = []
  if (on) for (const p of [...on.keys()].sort((a, b) => a - b)) for (const k of on.get(p)) out.push(k)
  const at = lowerBound(out, stream)
  if (out[at] !== stream) out.splice(at, 0, stream)
  return out
}

/**
 * Each page's columns, by today's rule: [null, page 1, …], each { mid, width, size, x0, x1, two, cols, lead }: the
 * document part's (documentOf) of the located units' line rectangles, so every page's columns read every unit's place. A
 * rule that read arXiv's text alone would make a page's columns before any unit is located (a rule change: layoutOf's
 * `columns`)
 */
export function pageColumns(views, anchors, kindOf = () => undefined) {
  const units = []
  for (const [id, a] of anchors) if (a?.tokens?.length) units.push([id, a.rects])
  return documentOf(views, units, kindOf).page
}

/**
 * Each page's columns from the side's tokens alone (the page stream's rule 4, made at step T before any unit is located):
 * pageColumns' arithmetic — the columns of each page, the text edges per page size, parity and column, the half leadings —
 * over the text's lines (textLines) in place of the located units' lines, a page's columns by their vote (documentOf's
 * `vote`). A function of `doc` and `views` alone — of every page's tokens, so final once the text is read, whatever the units
 * and their anchors; a rule of some pages' tokens is not that of the whole. Read by the far push alone (layoutOf's `columns`:
 * `() => columnsOfTokens(doc, views)`, made once)
 */
export function columnsOfTokens(doc, views, inFrame = frameOfTokens(doc)) {
  return documentOf(views, [[-1, textLines(doc, inFrame)]], () => undefined, { vote: true }).page
}

/** the share of a text line's tokens with text that must be words of the body (columnsOfTokens), and how many at least */
const LINE_WORDS = 0.6, LINE_WORDS_MIN = 4
const A_LETTER = /\p{L}/u

/**
 * The text's lines, as the lines of one unit of no kind: the tokens inside the pages' frame (`inFrame`, frameOfTokens' by
 * default: no running head or foot, no margin), cut as a unit's lines are (anchors.mjs lineRects) and where the space between
 * two tokens is more than the taller one's size (cells side by side, a table's columns, the two halves of a page), and kept
 * where LINE_WORDS_MIN of their tokens with text, and LINE_WORDS of them, are body words — a letter, at most anchors.mjs
 * bodyMax — so that a table's rows of numbers, a display's symbols and a figure's labels are none. What each prevents, as
 * measured on the 124 papers' pages with their columns drawn (2026-10-17): text that a figure clips, past the column, made its
 * edge; an all-table page's number column made the text's edge; two tables side by side, and a page of displays, made two
 * columns
 */
function textLines(doc, inFrame) {
  const big = bodyMax(doc), out = []
  let cur = null, prev = null
  const close = () => { if (cur && cur.words >= LINE_WORDS_MIN && cur.words >= LINE_WORDS * cur.n) out.push({ page: cur.page, x0: cur.x0, y0: cur.y0, x1: cur.x1, y1: cur.y1 }) }
  for (let k = 0; k < doc.length; k++) {
    const w = doc[k]
    if (!inFrame(w)) continue
    if (!cur || w.page !== cur.page || Math.abs(w.y - cur.base) > cur.h * 0.5 || w.x + w.w < cur.x0 - cur.h * 30 || (prev && w.x - (prev.x + prev.w) > Math.max(w.h, prev.h))) {
      close()
      cur = { page: w.page, x0: w.x, x1: w.x + w.w, y0: w.bottom, y1: w.top, base: w.y, h: w.h, n: 0, words: 0 }
    } else {
      cur.x0 = Math.min(cur.x0, w.x); cur.x1 = Math.max(cur.x1, w.x + w.w)
      // a line's box is its body text's: a sub- or superscript glyph does not stretch it (lineRects)
      if (Math.abs(w.y - cur.base) < cur.h * 0.2) { cur.y0 = Math.min(cur.y0, w.bottom); cur.y1 = Math.max(cur.y1, w.top) }
    }
    if (w.t) { cur.n++; if (A_LETTER.test(w.t) && w.h <= big) cur.words++ }
    prev = w
  }
  close()
  return out
}

/**
 * A side's document part (layoutOf's, and a layout's made page by page: pageLayout): from the units' line rectangles and
 * the pages' views alone — no token — each page's columns, its columns' text edges (the document's, per page size,
 * parity and column) and the half leading of each kind of unit on it; the units on each page and the pages of each
 * unit. `views` each page's box (null for a page not yet told: no page part, its rectangles none), `units` [id, rects]
 * in the order the layout takes them (a page's units in it: the first holding a token owns it)
 */
function documentOf(views, units, kindOf, { vote = false } = {}) {
  const pages = views.length
  // each page's columns: two where four long lines stand in each half, one where four cross the middle, else as most
  // pages have them; the lines are the units' (running heads, page numbers and floats' texts are no text block's)
  const page = [null]
  // size: the page's, for the edges' pool; gaps: the space between consecutive lines of a unit there, by its kind
  for (let p = 1; p <= pages; p++) { const v = views[p - 1]; page[p] = v ? { mid: (v[0] + v[2]) / 2, width: v[2] - v[0], size: `${Math.round(v[2] - v[0])}x${Math.round(v[3] - v[1])}`, L: 0, R: 0, F: 0, x0: Infinity, x1: -Infinity, gaps: new Map() } : null }
  const long = []
  const unitsOn = Array.from({ length: pages + 2 }, () => [])
  const pagesOf = new Map()
  for (const [id, rects, quiet] of units) {
    const ps = [], kind = kindOf(id) ?? ''
    rects.forEach((r, i) => {
      const P = page[r.page]
      if (!P) return
      if (ps.at(-1) !== r.page) { ps.push(r.page); unitsOn[r.page].push(id) }
      // (a unit told by where the layout lays it, not located on the side — view/shapes.mjs's cells —: on its pages, no part of
      // their columns, edges or leadings, which are the located units' as before it came)
      if (quiet || r.quiet) return
      if (r.x0 < P.x0) P.x0 = r.x0
      if (r.x1 > P.x1) P.x1 = r.x1
      // the leading: the space between a unit's consecutive lines of one size, less than a line apart
      const q = rects[i + 1], h = r.y1 - r.y0
      if (q && q.page === r.page && Math.abs(q.y1 - q.y0 - h) < h * 0.15 && r.y0 > q.y1 && r.y0 - q.y1 < h * 1.2) (P.gaps.get(kind) ?? P.gaps.set(kind, []).get(kind)).push(r.y0 - q.y1)
      if (r.x1 - r.x0 <= P.width * LONG) return
      long.push(r)
      if (r.x0 < P.mid - 1 && r.x1 > P.mid + 1) P.F++
      else if (r.x1 <= P.mid + 1) P.L++
      else P.R++
    })
    pagesOf.set(id, [...new Set(ps)].sort((x, y) => x - y))
  }
  let twos = 0, ones = 0
  for (let p = 1; p <= pages; p++) {
    const P = page[p]
    if (!P) continue
    // (by a vote, columnsOfTokens': two where the lines in either half are as many as those across, one where the lines across
    // are as many as the others; a page of displays has lines in both halves, and a table's page some across)
    P.two = vote
      ? P.L >= COLUMN_LINES && P.R >= COLUMN_LINES && P.L + P.R >= P.F ? true : P.F > 0 && P.F >= P.L + P.R ? false : null
      : P.L >= COLUMN_LINES && P.R >= COLUMN_LINES ? true : P.F >= COLUMN_LINES ? false : null
    if (P.two === true) twos++
    else if (P.two === false) ones++
  }
  for (let p = 1; p <= pages; p++) if (page[p]?.two === null) page[p].two = twos > ones
  // a long line's column for the edges' pool, before the columns' edges are known: the half it is in, both where it
  // crosses the middle
  const halfOf = (P, x0, x1) => (!P.two || (x0 < P.mid - 1 && x1 > P.mid + 1) ? 'F' : x1 <= P.mid + 1 ? 'L' : 'R')
  // the text block's edges, per page size, parity and column: the outermost that enough long lines share (justified
  // prose is flush on both sides; displays, lists and indents stand inside, an equation's number flush right)
  const poolOf = (p, col) => `${page[p].size} ${p % 2}${page[p].two ? 'T' : 'O'}${col}`
  const pool = new Map()
  for (const r of long) {
    const P = page[r.page], key = poolOf(r.page, halfOf(P, r.x0, r.x1))
    const q = pool.get(key) ?? pool.set(key, { x0s: [], x1s: [] }).get(key)
    q.x0s.push(r.x0); q.x1s.push(r.x1)
  }
  const edge = (xs, far) => {
    const count = new Map()
    for (const x of xs) { const b = Math.round(x); count.set(b, (count.get(b) ?? 0) + 1) }
    // (a case of the text's lines, columnsOfTokens', that passes this bound narrowly: on 2608.01890 its odd pages' right column
    // keeps 9 lines read to 586, against the 9.5 this asks, where the text ends at 562 — PDF.js reads text an inserted figure
    // clips. Its cause is that reading, not this share: neither is to be tuned to it)
    const need = Math.max(EDGE_LINES, xs.length * EDGE_SHARE)
    let best = null
    for (const b of count.keys()) if ((count.get(b - 1) ?? 0) + count.get(b) + (count.get(b + 1) ?? 0) >= need && (best === null || (far ? b > best : b < best))) best = b
    return best === null ? null : median(xs.filter(x => Math.abs(x - best) <= 1.5))
  }
  const edges = new Map([...pool].map(([key, q]) => [key, { x0: edge(q.x0s, false), x1: edge(q.x1s, true) }]))
  // each page's columns' edges, where the document gives none the page's own units' extent. The half leading of a kind
  // of unit on a page: its lines' there, else the kind's in the document, else the page's, else the document's — a
  // footnote set tighter than the body took the body's and overlapped its neighbour by up to 2 units (the review of B1).
  // The lower quartile of the gaps: the interline space is the least of a unit's gaps, its displays' skips and its
  // items' separations more. On the ten papers, runs whose pad overlaps another unit's block by over half a unit: 260
  // with the page's median, 294 with each kind's, 167 with each kind's lower quartile
  const half = xs => (xs && xs.length >= 3 ? quartile(xs) / 2 : null)
  const byKind = new Map(), every = []
  for (let p = 1; p <= pages; p++) for (const [kind, xs] of page[p]?.gaps ?? []) { (byKind.get(kind) ?? byKind.set(kind, []).get(kind)).push(...xs); every.push(...xs) }
  const kindLead = new Map([...byKind].map(([kind, xs]) => [kind, half(xs)])), docLead = every.length ? quartile(every) / 2 : 1
  for (let p = 1; p <= pages; p++) {
    const P = page[p]
    if (!P) continue
    const at = col => { const e = edges.get(poolOf(p, col)); return { x0: e?.x0 ?? P.x0, x1: e?.x1 ?? P.x1 } }
    P.cols = P.two ? { L: at('L'), R: at('R') } : { F: at('F') }
    if (P.two) P.cols.F = { x0: P.cols.L.x0, x1: P.cols.R.x1 }
    const own = half([...P.gaps.values()].flat()) ?? docLead
    P.lead = new Map([...kindLead.keys()].map(kind => [kind, half(P.gaps.get(kind)) ?? kindLead.get(kind) ?? own]))
    P.lead.set(null, own)
    P.gaps = null
  }
  return { page, unitsOn, pagesOf }
}

/** how far a unit's text stands inside its columns' text edges, on each side (PDF units): the least of its lines' —
 *  a list's item, a quotation, an indented theorem inside them, a paragraph not —, an indent within SNAP none. Where
 *  its sentences go on over a column or a page break, they reach its text edge there (unitRuns), whatever the run there
 *  holds: a display at a page's foot or head is in a paragraph's text, and the space beside it the paragraph's */
function indentOf(L, id) {
  let m = L.indents.get(id)
  if (m) return m
  let l = Infinity, r = Infinity
  for (const q of L.anchors.get(id)?.rects ?? []) {
    const P = L.page[q.page]
    if (!P) continue
    const e = P.cols[colOf(P, q.x0, q.x1)] ?? P.cols.F
    if (q.x0 - e.x0 < l) l = q.x0 - e.x0
    if (e.x1 - q.x1 < r) r = e.x1 - q.x1
  }
  m = { l: l < SNAP ? 0 : l, r: r < SNAP ? 0 : r }
  L.indents.set(id, m)
  return m
}

/** a line's column on a page: on two columns, both where it reaches into both columns' text by more than the
 *  overhang (a full-width display, a float across the page), and where it crosses the page's middle reaching into
 *  neither (a short heading centred on the gutter, which the left column's clamp cut at its edge + 6, the re-review of
 *  B1); else the one its middle stands in, so that an overfull display stays in its column, clamped (a display passing
 *  the middle made a block over both, doubling the wash) */
function colOf(P, x0, x1) {
  if (!P.two) return 'F'
  const inL = x0 < P.cols.L.x1 - OVERHANG, inR = x1 > P.cols.R.x0 + OVERHANG
  if (inL === inR && x0 < P.mid && x1 > P.mid) return 'F'
  return (x0 + x1) / 2 <= P.mid ? 'L' : 'R'
}

/**
 * A page's runs, made on the page's first use and kept: { runs, byId, heads, filled } — every run of every unit on the
 * page, and each unit's runs there; and what the geometry took beyond the anchors, which the gate holds to its
 * baseline: the units whose head it took, the words it filled in. A run: { id, page, col, x0, x1, top, bottom, lead,
 * rows: [{ y0, y1, x0, x1, r0, r1 }], mids, sx0, sx1 } in PDF units, `mids` the boundaries between its rows, a row's
 * r0 and r1 how far its sentences reach across (reachOf), sx0 and sx1 the furthest of them and of the run. A page whose
 * tokens a layout made page by page does not hold yet has none, and nothing of it is kept
 */
export function pageGeometry(L, p) {
  let g = L.cache.get(p)
  if (g) return g
  const P = L.page[p], tok = L.pt[p]
  if (!P || !tok) return emptyGeometry()
  const k0 = tok.k0, k1 = k0 + tok.n
  // the page's lines, as anchors.mjs lineRects has them: baselines within half a line of the first's, the line's
  // height its body text's (a script or a limit does not stretch it), its reach the ink of all its tokens; lo, hi:
  // the glyphs of all its tokens, a script's and an inline fraction's too
  const lines = [], lineOf = new Int32Array(k1 - k0)
  let cur = null
  for (let k = k0; k < k1; k++) {
    const i = k - k0, l = tok.l[i], r = tok.r[i], y = tok.y[i], bottom = tok.bottom[i], top = tok.top[i]
    if (!cur || Math.abs(y - cur.base) > cur.h * 0.5 || r < cur.x0 - cur.h * 30) {
      cur = { x0: l, x1: r, y0: bottom, y1: top, lo: bottom, hi: top, base: y, h: tok.h[i], k0: k, col: 'F' }
      lines.push(cur)
    } else {
      if (l < cur.x0) cur.x0 = l
      if (r > cur.x1) cur.x1 = r
      if (Math.abs(y - cur.base) < cur.h * 0.2) { if (bottom < cur.y0) cur.y0 = bottom; if (top > cur.y1) cur.y1 = top }
      if (bottom < cur.lo) cur.lo = bottom
      if (top > cur.hi) cur.hi = top
    }
    lineOf[k - k0] = lines.length - 1
  }
  for (const l of lines) l.col = colOf(P, l.x0, l.x1)
  // each block's boxes of our page, where the page is in place (view/shapes.mjs: our compile set it as arXiv's), as lines of the
  // block's own beside the tokens' (the owner's rule of 2026-10-30: a block lights on both panes or on neither): a box lights the
  // tokens under it where they are, and itself where none is — a formula drawn as paths, a bullet drawn as a mark. Apart from the
  // page's lines, which the floats walk (floats.mjs)
  const boxLines = []
  if (L.inPlace?.has(p)) for (const id of L.unitsOn[p] ?? []) for (const [x0, x1, top, bottom, kind] of L.boxes?.get(id)?.get(p) ?? []) boxLines.push({ id, kind, x0, x1, y0: bottom, y1: top, lo: bottom, hi: top, col: colOf(P, x0, x1) })
  const boxed = new Set(boxLines.map(b => b.id))
  // who owns each of the page's tokens, and each of its lines: -1 none, a unit, -2 several
  const owner = new Int32Array(k1 - k0).fill(-1), mine = new Map()
  for (const id of L.unitsOn[p] ?? []) {
    const ts = L.anchors.get(id).tokens, on = ts.slice(lowerBound(ts, k0), lowerBound(ts, k1))
    if (!on.length && !boxed.has(id)) continue
    mine.set(id, on)
    for (const k of on) if (owner[k - k0] === -1) owner[k - k0] = id
  }
  const lineOwner = new Int32Array(lines.length).fill(-1)
  for (let i = 0; i < k1 - k0; i++) {
    const o = owner[i], j = lineOf[i]
    if (o !== -1) lineOwner[j] = lineOwner[j] === -1 || lineOwner[j] === o ? o : -2
  }
  const at = { k0, tok, lines, lineOf, owner, lineOwner, boxLines, heads: [], filled: 0 }
  const runs = [], byId = new Map()
  for (const [id, toks] of mine) {
    const rs = unitRuns(L, p, at, id, toks)
    byId.set(id, rs)
    runs.push(...rs)
  }
  // `at`: the page's lines and who owns each token, for its floats (floats.mjs)
  g = { runs, byId, heads: at.heads, filled: at.filled, at }
  L.cache.set(p, g)
  return g
}
/** the geometry of a page with no tokens yet: no line, no run */
const emptyGeometry = () => ({ runs: [], byId: new Map(), heads: [], filled: 0, at: { k0: 0, tok: null, lines: [], lineOf: new Int32Array(0), owner: new Int32Array(0), lineOwner: new Int32Array(0), boxLines: [], heads: [], filled: 0 } })

/** a unit's runs on page p, from its tokens there */
function unitRuns(L, p, at, id, toks) {
  const { k0, lines, lineOf, owner, lineOwner, boxLines } = at
  // a line of the page's (its index) or one of a block's boxes (-1 - its index among the box lines)
  const lineBy = i => (i >= 0 ? lines[i] : boxLines[-1 - i])
  // the page's own: token k's at k - k0
  const { l: inkL, r: inkR } = at.tok, P = L.page[p]
  const line = k => lineOf[k - k0]
  const lineOk = k => { const o = lineOwner[line(k)]; return o === -1 || o === id }
  // in running text, what stands between two of the unit's words in the stream, on their page and in their column, and
  // is no unit's is the unit's: an inline formula whose pieces anchorUnits' `between` refused for leaving the band of
  // the words around it (a limit under an arrow, 2608.08350). Not where another unit's words stand among them, nor on a
  // line holding another unit's words; not for a caption, a heading, a cell: their float would come with them
  let ks = toks
  if (!UNFILLED.has(L.kindOf(id))) {
    ks = []
    for (let i = 0; i < toks.length; i++) {
      const a = toks[i], b = toks[i + 1]
      ks.push(a)
      if (b === undefined || b - a < 2 || lines[line(a)].col !== lines[line(b)].col) continue
      let foreign = false
      for (let k = a + 1; k < b && !foreign; k++) foreign = owner[k - k0] !== -1 && owner[k - k0] !== id
      if (foreign) continue
      for (let k = a + 1; k < b; k++) if (owner[k - k0] === -1 && lines[line(k)].col === lines[line(a)].col && lineOk(k)) { ks.push(k); at.filled++ }
    }
  }
  // the unit's head: the words before its first on its line that are no unit's, after any other unit's there — a
  // theorem's head, a list's label, a heading's number, a caption's label, all before the start mark. Never a cell's: the
  // words before it on its row are cells of their own (a table lights cell by cell, the owner's ruling of 2026-10-30;
  // floats.mjs cellsOf)
  let head = null
  const first = L.anchors.get(id).tokens[0]
  if (first === toks[0] && L.kindOf(id) !== 'cell') {
    for (let k = lines[line(first)].k0; k < first; k++) {
      if (owner[k - k0] !== -1) head = null
      else head = Math.min(head ?? Infinity, inkL[k - k0])
    }
  }
  // by column, the unit's lines and each one's reach across (the unit's tokens on it)
  const byCol = new Map()
  for (const k of ks) {
    const ln = line(k), col = lines[ln].col
    const m = byCol.get(col) ?? byCol.set(col, new Map()).get(col)
    const x = m.get(ln)
    const a = inkL[k - k0], b = inkR[k - k0]
    if (x) { if (a < x.x0) x.x0 = a; if (b > x.x1) x.x1 = b } else m.set(ln, { x0: a, x1: b })
  }
  // its boxes on the page (view/shapes.mjs, the page in place): each a line of its own in its column, merged with the tokens' it
  // stands on; a label's (a heading's number, a list's bullet, a caption's name: layout/file.mjs `labels`) the head where it stands on
  // the unit's first line, the first sentence's (the owner, 2026-10-30)
  boxLines.forEach((b, j) => {
    if (b.id !== id) return
    const m = byCol.get(b.col) ?? byCol.set(b.col, new Map()).get(b.col)
    m.set(-1 - j, { x0: b.x0, x1: b.x1 })
    if (b.kind === 'label' && first === toks[0] && toks.length) {
      const l = lines[line(first)], cy = (b.y0 + b.y1) / 2
      if (cy >= l.y0 - 1 && cy <= l.y1 + 1) head = Math.min(head ?? Infinity, b.x0)
    }
  })
  let headAt = null
  if (head !== null) { const x = byCol.get(lines[line(first)].col)?.get(line(first)); if (x && head < x.x0) { x.x0 = head; at.heads.push(id); headAt = line(first) } }
  const runs = []
  // each line's run and row in it, for the run's tokens (below)
  const lineAt = new Map()
  for (const [col, m] of byCol) {
    const e = P.cols[col] ?? P.cols.F
    // rows: the lines from the top, merged where they overlap
    const ls = [...m.keys()].sort((a, b) => lineBy(b).y1 - lineBy(a).y1)
    const rows = [], rowOf = new Map()
    for (const i of ls) {
      const l = lineBy(i), x = m.get(i), row = rows.at(-1)
      if (row && l.y1 > row.y0 + OVERLAP) {
        if (l.y0 < row.y0) row.y0 = l.y0
        if (l.y1 > row.y1) row.y1 = l.y1
        if (x.x0 < row.x0) row.x0 = x.x0
        if (x.x1 > row.x1) row.x1 = x.x1
        if (l.lo < row.lo) row.lo = l.lo
        if (l.hi > row.hi) row.hi = l.hi
      } else rows.push({ y0: l.y0, y1: l.y1, x0: x.x0, x1: x.x1, lo: l.lo, hi: l.hi, r0: null, r1: null })
      rowOf.set(i, rows.length - 1)
    }
    // how far each row's sentences may reach across where they go on from the row before or to the row after (segsOf,
    // spanStart): to the unit's text edge in the column (indentOf), but on a side where another unit's words stand
    // on the row — a caption's first line holding a word of the paragraph the float cut (2608.06701) — to its own ink
    if (!NOT_RUNNING.has(L.kindOf(id))) {
      const ind = indentOf(L, id), tx0 = e.x0 + ind.l, tx1 = Math.max(tx0, e.x1 - ind.r)
      for (const row of rows) reachOf(at, id, row, tx0, tx1)
    }
    // runs: the rows cut where another unit's line stands between two of them in the column (a float set inside a
    // paragraph, a footnote), and in a column of two where a line across both does, the unit's own too (a paragraph
    // around a full-width display, revtex's widetext: one run above and one below it, not one over it); a gap alone
    // is the unit's (a display)
    let start = 0
    for (let r = 1; r <= rows.length; r++) {
      if (r < rows.length && !interrupted(lines, lineOwner, col, id, rows[r - 1], rows[r], boxLines)) continue
      // (the unit's first row on its first page may hang past the column's edge by its label or its head: a list's or a theorem's item
      // set in the margin lights with it, on both panes alike)
      const hang = start === 0 && toks.length && first === toks[0] && lines[line(first)].col === col ? rows[0].x0 : null
      const run = runOf(id, p, col, rows.slice(start, r), e, P.lead.get(L.kindOf(id) ?? '') ?? P.lead.get(null), !FLOATS.has(L.kindOf(id)), hang)
      // where its unit's head begins on it, and (below) its tokens and the row each is on: its sentences' rows (segsOf)
      run.head = headAt !== null && rowOf.get(headAt) >= start && rowOf.get(headAt) < r ? head : null
      run.toks = []; run.rowOf = []; run.boxes = []
      // its sentences' reach across, the hit test's bounds for them (hitOf)
      for (const row of run.rows) { if (row.r0 != null && row.r0 < run.sx0) run.sx0 = row.r0; if (row.r1 != null && row.r1 > run.sx1) run.sx1 = row.r1 }
      for (const ln of m.keys()) { const w = rowOf.get(ln); if (w < start || w >= r) continue; if (ln >= 0) lineAt.set(ln, { run, w: w - start }); else { const b = boxLines[-1 - ln]; run.boxes.push({ w: w - start, x0: b.x0, x1: b.x1, kind: b.kind }) } }
      runs.push(run)
      start = r
    }
  }
  // the tokens in the stream's order, each to its line's run
  for (const k of ks) { const a = lineAt.get(line(k)); a.run.toks.push(k); a.run.rowOf.push(a.w) }
  // in the order the unit's words come: a column's runs from the top, the columns as the stream meets them
  return runs
}

/** a row's reach across for its sentences (unitRuns): `r0`, `r1` the unit's text edges, null on a side where another
 *  unit's words stand on the row (its lines', or theirs on a line it shares), and on both where they stand among its */
function reachOf(at, id, row, tx0, tx1) {
  const { k0, lines, owner, lineOwner } = at, { l: inkL, r: inkR } = at.tok
  row.r0 = tx0; row.r1 = tx1
  const other = (a, b) => {
    if (b <= row.x0 + 0.5) row.r0 = null
    else if (a >= row.x1 - 0.5) row.r1 = null
    else row.r0 = row.r1 = null
  }
  // the page's lines that are some unit's, in bands of BAND units by their foot, made on the page's first row: a scan
  // of every line for every row cost 60 % more of a page's geometry (2608.08350), a sort of them by their foot 20 %
  const { js, from, y, h } = at.owned ?? (at.owned = bands(lines, lineOwner))
  const b0 = Math.max(0, Math.floor((row.y0 - h - y) / BAND)), b1 = Math.min(from.length - 2, Math.floor((row.y1 - y) / BAND))
  for (let n = from[b0], end = b1 >= b0 ? from[b1 + 1] : n; n < end && (row.r0 !== null || row.r1 !== null); n++) {
    const j = js[n], o = lineOwner[j], l = lines[j]
    if (o === id || Math.min(l.y1, row.y1) - Math.max(l.y0, row.y0) <= OVERLAP || l.x1 < tx0 - OVERHANG || l.x0 > tx1 + OVERHANG) continue
    if (o >= 0) { other(l.x0, l.x1); continue }
    for (let k = l.k0, end = lines[j + 1]?.k0 ?? k0 + owner.length; k < end; k++) { const w = owner[k - k0]; if (w !== -1 && w !== id) other(inkL[k - k0], inkR[k - k0]) }
  }
  // (and another block's boxes on the row: its ink where no token of the page is)
  for (const b of at.boxLines ?? []) {
    if (row.r0 === null && row.r1 === null) break
    if (b.id === id || Math.min(b.y1, row.y1) - Math.max(b.y0, row.y0) <= OVERLAP || b.x1 < tx0 - OVERHANG || b.x0 > tx1 + OVERHANG) continue
    other(b.x0, b.x1)
  }
}

/** the band of a line's foot (reachOf), PDF units */
const BAND = 8
/** a page's lines that are some unit's, by the band of their foot: `js` the lines, `from[b]` where band b's begin in it */
function bands(lines, lineOwner) {
  let y = Infinity, top = -Infinity, h = 0, n = 0
  for (let j = 0; j < lines.length; j++) {
    if (lineOwner[j] === -1) continue
    const l = lines[j]
    n++
    if (l.y0 < y) y = l.y0
    if (l.y0 > top) top = l.y0
    if (l.y1 - l.y0 > h) h = l.y1 - l.y0
  }
  if (!n) return { js: new Int32Array(0), from: new Int32Array(2), y: 0, h: 0 }
  const from = new Int32Array(Math.floor((top - y) / BAND) + 2), js = new Int32Array(n)
  for (let j = 0; j < lines.length; j++) if (lineOwner[j] !== -1) from[Math.floor((lines[j].y0 - y) / BAND) + 1]++
  for (let b = 1; b < from.length; b++) from[b] += from[b - 1]
  const at = from.slice()
  for (let j = 0; j < lines.length; j++) if (lineOwner[j] !== -1) js[at[Math.floor((lines[j].y0 - y) / BAND)]++] = j
  return { js, from, y, h }
}

/** whether a line stands between two rows of a run in `col`, one above the other (its middle between them): another
 *  unit's in the column, or in a column of two any line across both */
function interrupted(lines, lineOwner, col, id, above, below, boxLines = []) {
  if (above.y0 - below.y1 < Math.min(above.y1 - above.y0, below.y1 - below.y0)) return false
  for (let i = 0; i < lines.length; i++) {
    const o = lineOwner[i], l = lines[i]
    if (!(l.col === col ? o !== -1 && o !== id : col !== 'F' && l.col === 'F')) continue
    const y = (l.y0 + l.y1) / 2
    if (y < above.y0 && y > below.y1) return true
  }
  // (another block's box between them: a display drawn as paths, no token of it)
  for (const b of boxLines) {
    if (b.id === id || !(b.col === col || (col !== 'F' && b.col === 'F'))) continue
    const y = (b.y0 + b.y1) / 2
    if (y < above.y0 && y > below.y1) return true
  }
  return false
}

/** a run: its rows' extent across, inside the column's text edges — up to OVERHANG past them (`clamp`: running text),
 *  and within SNAP of them on them — and down; the boundaries between its rows halfway between them, never rising */
function runOf(id, page, col, rows, e, lead, clamp, hang = null) {
  let x0 = Infinity, x1 = -Infinity
  for (const r of rows) { if (r.x0 < x0) x0 = r.x0; if (r.x1 > x1) x1 = r.x1 }
  if (clamp) { x0 = Math.max(x0, Math.min(e.x0 - OVERHANG, hang ?? Infinity)); x1 = Math.min(x1, e.x1 + OVERHANG) }
  if (Math.abs(x0 - e.x0) < SNAP) x0 = e.x0
  if (Math.abs(x1 - e.x1) < SNAP) x1 = e.x1
  const mids = []
  for (let i = 1; i < rows.length; i++) mids.push(Math.min((rows[i - 1].y0 + rows[i].y1) / 2, i > 1 ? mids[i - 2] : Infinity))
  return { id, page, col, x0, x1, top: rows[0].y1, bottom: rows.at(-1).y0, hi: rows[0].hi, lo: rows.at(-1).lo, lead, rows, mids, head: null, toks: null, rowOf: null, boxes: [], sx0: x0, sx1: x1 }
}

/** a table's cell no unit holds as a run of its own (view/floats.mjs pageFloats): its words' box, one row, lit whole as a cell unit
 *  is, its half leading the page's cells' */
export const cellRunOf = (id, page, col, box, lead) => runOf(id, page, col, [{ ...box, r0: null, r1: null }], { x0: -Infinity, x1: Infinity }, lead, false)

/** a unit's runs on a side, page by page (each page's geometry made on its first use) */
export function runsOf(L, id) {
  const out = []
  for (const p of L?.pagesOf.get(id) ?? []) out.push(...(pageGeometry(L, p).byId.get(id) ?? []))
  return out
}

/** what a run paints (PDF units): its extent padded `padX` beside and half the leading above and below — and over
 *  what hangs past its first and last lines, a script or an inline fraction's denominator, which lit nothing (the
 *  review of B1's gate: a theorem's last fraction, 0.5–0.9 units under its block) */
export function blockOf(run, padX) {
  return { page: run.page, x0: run.x0 - padX, x1: run.x1 + padX, y0: Math.min(run.bottom - run.lead, run.lo), y1: Math.max(run.top + run.lead, run.hi) }
}

/**
 * What a point of a page (PDF units) lights: the unit whose painted block holds it, the smallest where blocks overlap
 * (a heading run into its paragraph's first line), with the run it is in; null where nothing is painted. Where the
 * unit's sentences are known on both sides (`startsOf(id)`, anchors.mjs sentenceStarts; and its kind running text —
 * headings, captions, cells and a figure's text light whole), what it paints is its sentences, and the point lights the
 * one whose shape holds it (`s`; sentenceOf), or nothing of the unit where none does — before its first line, after its
 * last sentence's end. `s` -1: the whole unit. Arithmetic over the page's runs alone
 */
export function hitOf(L, p, x, y, padX, startsOf = () => null) {
  if (!L?.page[p]) return null
  let best = null, area = Infinity
  for (const run of pageGeometry(L, p).runs) {
    const b = blockOf(run, padX)
    // its sentences may reach past its block across, to its unit's text edge (spanStart)
    if (x < Math.min(b.x0, run.sx0 - padX) || x > Math.max(b.x1, run.sx1 + padX) || y < b.y0 || y > b.y1) continue
    const a = (b.x1 - b.x0) * (b.y1 - b.y0)
    if (a >= area) continue
    const starts = NOT_RUNNING.has(L.kindOf(run.id)) || !tokensIn(L, run.id) ? null : startsOf(run.id)
    if (!starts && (x < b.x0 || x > b.x1)) continue
    let s = -1
    if (starts) {
      // its row (the boundaries between rows are its mids), and the sentence whose span there holds the point
      let i = 0
      while (i < run.mids.length && y < run.mids[i]) i++
      s = sentenceAt(L, segsOf(L, run, starts), run, i, x, padX)
      if (s < 0) continue
    }
    area = a; best = { id: run.id, run, s }
  }
  return best
}

/** a run's row boundaries, from the top (PDF y, falling): its block's top, the midpoints between its rows, its block's foot */
const edgesOf = (run, padX) => { const b = blockOf(run, padX); return [b.y1, ...run.mids, b.y0] }
/** each run's sentences' segments, kept for the starts they were made with */
const segsMade = new WeakMap()
/** each side's starts with the sentence each of its unit's tokens is in by the text (withSentences) */
const bySentenceText = new WeakMap()
/**
 * Starts that know each token's sentence by the text: `of(k)` the sentence of the side's token k by its place in the unit's
 * text — a left token by the word it is paired with, a laid page's token by its word or its place in the translation
 * (shapes.mjs) —, or -1 where the text does not tell (a glyph no word is paired with). A run's sentences then take each
 * token's sentence from the text, the stream's order only for a token the text does not place (segsOf). The starts, given
 * back, are kept as they are: whatever reads them (their length, their tokens) reads the same
 */
export function withSentences(starts, of) {
  if (starts && typeof of === 'function') bySentenceText.set(starts, of)
  return starts
}
/**
 * A run's sentences row by row (`starts`: the page tokens where its unit's sentences after the first begin): on each row
 * each sentence's ink across, from its tokens there — the head before the unit's first word in the first sentence —
 * kept inside the run's extent; and each sentence's first and last row in the run. A token is its sentence's by the text
 * where its starts know it (withSentences: a word, a laid formula or display by its place in the translation), else by the
 * stream's order; and a token the text does not place, on a row below one where a later sentence has begun, is that later
 * one's: a script or a limit the text layer gives after the line it hangs from (2608.08350, a subscript under a line where
 * the next sentence began) would otherwise give a sentence a row inside the next one's, and the sentences would no longer
 * tile the run. Token order decides the rows and the runs, never the sentence of a token the text places (a display the
 * page's word table wrote after its unit's text had been the page's last sentence's, and every row below it with it)
 */
function segsOf(L, run, starts) {
  const made = segsMade.get(run)
  if (made?.starts === starts) return made
  // the run's page's tokens: token k's at k - k0
  // (a run of boxes alone, no token of the page in it, has no sentences: its unit lights whole, on both panes, sentencesFit)
  if (!run.toks?.length) { const none = { starts, rows: run.rows.map(() => []), first: [], last: [], from: -1, on: -1, of: new Int32Array(0), fits: false }; segsMade.set(run, none); return none }
  const T = L.pt[run.page], k0 = T.k0, { l, r } = T, rows = run.rows.map(() => []), first = [], last = []
  const byText = bySentenceText.get(starts) ?? null
  /** a token's sentence by the stream's order: the starts at or before it */
  const byOrder = k => { let lo = 0, hi = starts.length; while (lo < hi) { const m = (lo + hi) >> 1; if (starts[m] <= k) lo = m + 1; else hi = m } return lo }
  const sentenceOf = k => { const t = byText ? byText(k) : -1; return t >= 0 ? t : byOrder(k) }
  // each token's sentence by the text where it is known, else by the stream's order; then rows from the top, a token the text
  // does not place none before the latest begun above it
  const of = new Int32Array(run.toks.length), known = new Uint8Array(run.toks.length)
  let s = 0
  while (s < starts.length && starts[s] <= run.toks[0]) s++
  for (let n = 0; n < run.toks.length; n++) {
    while (s < starts.length && starts[s] <= run.toks[n]) s++
    const t = byText ? byText(run.toks[n]) : -1
    if (t >= 0) { of[n] = t; known[n] = 1 } else of[n] = s
  }
  const byRow = run.rows.map(() => [])
  for (let n = 0; n < run.toks.length; n++) byRow[run.rowOf[n]].push(n)
  let floor = 0
  byRow.forEach((ns, w) => {
    let top = floor
    for (const n of ns) {
      const k = run.toks[n], t = known[n] ? of[n] : Math.max(of[n], floor), row = rows[w], g = row.find(q => q.s === t)
      of[n] = t
      const a = l[k - k0], b = r[k - k0]
      if (g) { if (a < g.x0) g.x0 = a; if (b > g.x1) g.x1 = b } else row.push({ s: t, x0: a, x1: b })
      if (first[t] === undefined) first[t] = w
      last[t] = w
      if (t > top) top = t
    }
    floor = top
  })
  if (run.head !== null) { const g = rows[run.rowOf[0]].find(q => q.s === 0); if (g && run.head < g.x0) g.x0 = run.head }
  // each box of the block's on the row, where no token of the page is under it (a formula drawn as paths, a bullet drawn as a mark,
  // a number set alone on a line): the parts of it its row's tokens leave, each the sentence of the token beside it — the one before
  // it across, else the one after it; a label's the first sentence's; on a row of no token, the sentence the rows before it end in,
  // else the one the rows after it begin with. Where the tokens are, they light (the owner's rule of 2026-10-30: a box lights the
  // tokens under it where they are, itself where none is), so that two sentences on a row keep meeting between their words
  // (the row's tokens' sentences as they stand before any box is added: the neighbours a box's part takes its sentence from)
  const covered = rows.map(row => row.map(g => [g.x0, g.x1, g.s]).sort((p, q) => p[0] - q[0]))
  const lastBefore = w => { for (let i = w - 1; i >= 0; i--) if (covered[i].length) return covered[i].reduce((x, c) => (c[1] > x[1] ? c : x))[2]; return -1 }
  const firstAfter = w => { for (let i = w + 1; i < rows.length; i++) if (covered[i].length) return covered[i][0][2]; return -1 }
  const add = (w, t, x0, x1) => {
    const row = rows[w], g = row.find(q => q.s === t)
    if (g) { if (x0 < g.x0) g.x0 = x0; if (x1 > g.x1) g.x1 = x1 } else row.push({ s: t, x0, x1 })
    if (first[t] === undefined || w < first[t]) first[t] = w
    if (last[t] === undefined || w > last[t]) last[t] = w
  }
  for (const b of run.boxes ?? []) {
    const cov = covered[b.w]
    // (the box less what its row's tokens cover, to a point)
    const gaps = []
    let x = b.x0
    for (const [c0, c1] of cov) { if (c1 <= x) continue; if (c0 >= b.x1) break; if (c0 - x > 1) gaps.push([x, c0]); x = Math.max(x, c1) }
    if (b.x1 - x > 1) gaps.push([x, b.x1])
    for (const [g0, g1] of gaps) {
      let t = b.kind === 'label' && run.head !== null ? 0 : -1
      if (t < 0 && cov.length) {
        let before = null, after = null
        for (const c of cov) { if (c[1] <= g0 + 0.5 && (!before || c[1] > before[1])) before = c; if (c[0] >= g1 - 0.5 && (!after || c[0] < after[0])) after = c }
        t = (before ?? after ?? cov[0])[2]
      }
      if (t < 0) t = lastBefore(b.w)
      if (t < 0) t = firstAfter(b.w)
      if (t >= 0) add(b.w, t, g0, g1)
    }
  }
  // inside the run's extent, both ends: a word past the column's edge and the clamp (an overfull line's) is at the edge
  const inside = x => Math.min(run.x1, Math.max(run.x0, x))
  for (const row of rows) { row.sort((a, b) => a.s - b.s); for (const g of row) { g.x0 = inside(g.x0); g.x1 = inside(g.x1) } }
  // the sentence that began before the run (in a run before it in the stream: the column or the page before) and the
  // one that goes on after it, or -1: their rows here are rows between, their first's start and last's end beyond. The
  // unit's token before the run is in the sentence of the run's first, or the one after the run in that of its last
  const ts = L.anchors.get(run.id).tokens, t0 = run.toks[0], t1 = run.toks.at(-1)
  const s0 = sentenceOf(t0), s1 = sentenceOf(t1), at0 = lowerBound(ts, t0)
  const prev = at0 > 0 ? ts[at0 - 1] : undefined, next = ts[lowerBound(ts, t1 + 1)]
  const from = prev !== undefined && sentenceOf(prev) === s0 ? s0 : -1, on = next !== undefined && sentenceOf(next) === s1 ? s1 : -1
  const out = { starts, rows, first, last, from, on, of, fits: true }
  segsMade.set(run, out)
  // whether the shapes hold their words: each sentence's rows one after the other — a later sentence never begins above
  // an earlier one's last row: a row it spans paints across the run, and every row holds a token, so a row inside a
  // sentence's span then holds its words alone —, and each word's ink's centre in its own sentence's shape. By the stream's
  // order the first is so by construction; by the text where the drawing keeps the text's order (the text a layout runs on
  // above a display, 'flow', may not). Not where two lines of text are one row (a tall formula between them,
  // 2608.12502) and a sentence begins on the second: no boundary across divides them; nor where a glyph hangs past the
  // middle between its row and the next, and the next is another sentence's or none's there (a display's subscripts over the
  // row of its denominator, 2608.29181). The unit is lit whole then (sentencesFit): never another sentence's words. Two
  // sentences' ink may overlap a little on a row — a Latin word's box is an even share of its text item, a CJK full stop's
  // half em too — and the boundary halfway between still divides their words
  for (let t = 0, below = -1; t < first.length && out.fits; t++) {
    if (first[t] === undefined) continue
    if (first[t] < below) out.fits = false
    below = last[t]
  }
  if (out.fits) {
    const ys = edgesOf(run, 0), spans = rows.map((_, i) => spansOf(null, out, run, i, 0)), { top, bottom } = T
    for (let n = 0; n < run.toks.length && out.fits; n++) {
      const k = run.toks[n] - k0, x = (l[k] + r[k]) / 2, y = (top[k] + bottom[k]) / 2
      let i = 0
      while (i < rows.length - 1 && y < ys[i + 1]) i++
      const s = of[n]
      // its own sentence there: on its row's span, or a row inside its sentence's (spanning the run)
      const own = (first[s] < i || s === from) && (i < last[s] || s === on) ? true : spans[i].some(q => q.s === s && x >= q.x0 - FIT && x <= q.x1 + FIT)
      if (!own && x >= run.x0 && x <= run.x1) out.fits = false
    }
  }
  return out
}
/** how far a word's ink's centre may stand past its sentence's span (PDF units) */
const FIT = 0.5
/** whether a unit is lit by sentence on a side: running text (headings, captions, cells and a figure's text light
 *  whole), its tokens all in (a layout made page by page: tokensIn), every run's shapes hold their words, and no run's
 *  sentence paints over another run's word of another sentence (runsApart). `made`: from the pages whose geometry is made
 *  alone, undefined where one of the unit's is not yet — the caller makes them in a task of its own, never in the pointer's
 *  frame (a unit over two pages, its other page's geometry and every run's sentences made there: 3.6 ms, 2608.29181) */
export function sentencesFit(L, id, starts, made = false) {
  if (NOT_RUNNING.has(L.kindOf(id)) || !tokensIn(L, id)) return false
  if (made && (L.pagesOf.get(id) ?? []).some(p => !L.cache.has(p))) return undefined
  const runs = runsOf(L, id)
  return runs.every(run => segsOf(L, run, starts).fits) && runsApart(L, runs, starts)
}
/** how far inside a sentence's shape another run's word's ink's centre stands where it is painted over (PDF units) */
const OVER = 0.3
/**
 * Whether a unit's runs on a page keep their sentences off each other's words: a run's rows reach the column's text edge
 * where a sentence goes on, and two runs of one unit may stand side by side or over each other where its lines are read in
 * two columns (a line read across both beside lines read as the left one's: 2610.19282, 2610.22195; a label read apart from
 * its line: 2610.17024). Where a sentence of one run paints over a word of another sentence of another, its unit lights
 * whole. Runs whose painted extents do not meet are not looked into; the shapes are read without the page's floats, as each
 * run's own fit reads them
 */
function runsApart(L, runs, starts) {
  for (const a of runs) {
    let ext = null
    for (const b of runs) {
      if (b === a || b.page !== a.page) continue
      const bb = blockOf(b, 0)
      ext ??= { ...blockOf(a, 0), x0: Math.min(a.x0, a.sx0), x1: Math.max(a.x1, a.sx1) }
      if (bb.x0 > ext.x1 || bb.x1 < ext.x0 || bb.y0 > ext.y1 || bb.y1 < ext.y0) continue
      const T = L.pt[b.page], gb = segsOf(L, b, starts), ga = segsOf(L, a, starts)
      for (let s = 0; s < ga.first.length; s++) {
        if (ga.first[s] === undefined) continue
        // (with no float: the page's floats come late, and the reader keeps a unit's fit by its starts; a float only shortens a
        // row's reach, so shapes apart without them are apart with them)
        const rects = shapeOf(L, a, starts, s, 0, null)
        for (let n = 0; n < b.toks.length; n++) {
          if (gb.of[n] === s) continue
          const k = b.toks[n] - T.k0, x = (T.l[k] + T.r[k]) / 2, y = (T.top[k] + T.bottom[k]) / 2
          if (rects.some(r => x > r.x0 + OVER && x < r.x1 - OVER && y > r.y0 + OVER && y < r.y1 - OVER)) return false
        }
      }
    }
  }
  return true
}
/** a page's sentences worked out — each run's on it whose unit's starts `startsOf` gives —, as the page is first drawn
 *  or its unit's starts found: the pointer's frame then reads them made */
export function pageSentences(L, p, startsOf) {
  for (const run of pageGeometry(L, p).runs) { const st = tokensIn(L, run.id) && startsOf(run.id); if (st) segsOf(L, run, st) }
}
/** whether a unit's tokens are all in its layout: always for one made whole; for one made page by page, where every
 *  page the unit is on has given its tokens there (its left part's span). A run's sentences read the unit's tokens on
 *  the pages beyond it (segsOf: whether a sentence began before the run or goes on after it), and what they make is
 *  kept by the run: a unit still short of a page lights whole, and its sentences are made once it is whole */
export function tokensIn(L, id) {
  if (!L?.spans) return true
  const spans = L.spans.get(id)
  return !!spans && (L.pagesOf.get(id) ?? []).every(p => spans.has(p))
}
/**
 * What each sentence on row `i` of a run paints across (PDF units), tiling the row: two sentences meet halfway through
 * the space between them; one that goes on from the row before — in the run, or from the run before it in the stream
 * (the column or the page before) — begins at the unit's text edge in the column, and one that goes on to the row
 * after ends at it — padded `padX` beyond it —, or beyond the row's ink where that stands past it (an overfull line);
 * a sentence's own start or end at neither is padded `padX` beyond its ink, or is the edge within SNAP of it. The row's
 * reach (reachOf): where another unit's words stand on the row on that side, its own ink (the review of B3, I1: a
 * sentence over a page break was drawn as ending at the display that closed the page and beginning again at the one
 * that opened the next, and the run's extent, widened by an overfull display, left a 6-unit notch at a row's end); and
 * where a float's painted shape would be under the part past its ink, its own ink too (reachAt). `L` null: no float
 */
function spansOf(L, g, run, i, padX) {
  return g.rows[i].map((q, t) => ({ s: q.s, x0: spanStart(L, g, run, i, t, padX), x1: spanEnd(L, g, run, i, t, padX) }))
}
function spanStart(L, g, run, i, t, padX) {
  const row = g.rows[i], q = row[t]
  if (t > 0) return (row[t - 1].x1 + q.x0) / 2
  const e = reachAt(L, run, i, 0, q.x0, padX)
  if (i > g.first[q.s] || q.s === g.from) return Math.min(e ?? q.x0, q.x0) - padX
  return e != null && q.x0 - e < SNAP ? Math.min(e, q.x0) - padX : q.x0 - padX
}
function spanEnd(L, g, run, i, t, padX) {
  const row = g.rows[i], q = row[t]
  if (t < row.length - 1) return (q.x1 + row[t + 1].x0) / 2
  const e = reachAt(L, run, i, 1, q.x1, padX)
  if (i < g.last[q.s] || q.s === g.on) return Math.max(e ?? q.x1, q.x1) + padX
  return e != null && e - q.x1 < SNAP ? Math.max(e, q.x1) + padX : q.x1 + padX
}
/**
 * A row's reach on its left (`right` 0) or its right (1), past its ink at `ink`: reachOf's, or null where a float's
 * shape (floats.mjs floatShapes: a figure's picture, a table's body) stands in the part past the ink, across the row's
 * band — the pointer finds the float's cells or nothing there, and a sentence widened under it would be painted where it
 * is not lit (B3's follow-up: none on the ten papers; a figure beside a display that opens a page). The page's floats
 * come with its first drawing: until then none is seen, and the reader paints again when they come
 */
function reachAt(L, run, i, right, ink, padX) {
  const e = right ? run.rows[i].r1 : run.rows[i].r0
  const fs = e == null || (right ? e <= ink : e >= ink) ? null : L?.floats?.get(run.page)
  if (!fs?.length) return e
  const b = blockOf(run, padX), y1 = i === 0 ? b.y1 : run.mids[i - 1], y0 = i === run.rows.length - 1 ? b.y0 : run.mids[i]
  const x0 = right ? ink : e - padX, x1 = right ? e + padX : ink
  for (const f of fs) for (const s of floatShapes(L, f, padX)) if (s.x0 < x1 && s.x1 > x0 && s.y0 < y1 && s.y1 > y0) return null
  return e
}
/** the sentence whose span on row `i` holds x, or -1: spansOf's, with nothing made (the pointer's frame) */
function sentenceAt(L, g, run, i, x, padX) {
  const row = g.rows[i]
  for (let t = 0; t < row.length; t++) if (x <= spanEnd(L, g, run, i, t, padX)) return x >= spanStart(L, g, run, i, t, padX) ? row[t].s : -1
  return -1
}

/**
 * What sentence `s` of a run's unit paints in the run (PDF units): a rectangle per row it is on, from the top — its
 * first row from its start, the rows between across the run (a display in the sentence among them), its last row to its
 * end, its final punctuation and closing marks in its ink (anchors.mjs inkEdges) — rows of the same reach as one; none
 * where the sentence is not in the run. `starts` as hitOf's
 */
export function sentenceOf(L, run, starts, s, padX) {
  return shapeOf(L, run, starts, s, padX, L)
}
/** sentenceOf's rectangles, its rows' reach kept from under the floats of `F` (a layout, or null: none, the fit's) */
function shapeOf(L, run, starts, s, padX, F) {
  const g = segsOf(L, run, starts), fa = g.first[s], la = g.last[s]
  if (fa === undefined) return []
  const ys = edgesOf(run, padX), out = []
  for (let i = fa; i <= la; i++) {
    const span = spansOf(F, g, run, i, padX).find(q => q.s === s) ?? { x0: run.x0 - padX, x1: run.x1 + padX }
    const prev = out.at(-1)
    if (prev && Math.abs(prev.x0 - span.x0) < 0.01 && Math.abs(prev.x1 - span.x1) < 0.01) prev.y0 = ys[i + 1]
    else out.push({ page: run.page, x0: span.x0, x1: span.x1, y0: ys[i + 1], y1: ys[i] })
  }
  return out
}

/**
 * One outline of a shape's rectangles stacked from the top (CSS pixels, y down): an SVG path, every corner rounded to
 * `radius` (or half its shorter side), the inner ones too — round 1's join; rectangles that do not meet across by more
 * than two radii are outlines of their own in the one path (a sentence's first row right of its last)
 */
export function shapePath(rects, radius) {
  let d = ''
  for (let a = 0, b = 1; b <= rects.length; b++) {
    if (b < rects.length && Math.min(rects[b - 1].x1, rects[b].x1) - Math.max(rects[b - 1].x0, rects[b].x0) > 2 * radius) continue
    d += outline(rects, a, b, radius)
    a = b
  }
  return d
}
/** the corners of rects a..b-1, a flat list reused from one outline to the next (the paint makes one or two a light) */
const cx = [], cy = []
/** one outline of rects a..b-1: their corners clockwise from the top left — down the right side, then up the left —,
 *  the repeated and collinear ones dropped (where two rows share an edge there is no corner), each rounded */
function outline(rects, a, b, radius) {
  let n = 0
  const push = (x, y) => { if (n && Math.abs(x - cx[n - 1]) < 0.01 && Math.abs(y - cy[n - 1]) < 0.01) return; cx[n] = x; cy[n] = y; n++ }
  push(rects[a].x0, rects[a].y0); push(rects[a].x1, rects[a].y0)
  for (let i = a; i < b; i++) { push(rects[i].x1, rects[i].y1); if (i + 1 < b) push(rects[i + 1].x1, rects[i].y1) }
  push(rects[b - 1].x0, rects[b - 1].y1)
  for (let i = b - 1; i > a; i--) { push(rects[i].x0, rects[i].y0); push(rects[i - 1].x0, rects[i].y0) }
  if (n > 1 && Math.abs(cx[0] - cx[n - 1]) < 0.01 && Math.abs(cy[0] - cy[n - 1]) < 0.01) n--
  // the corners that turn: a point on the line through its neighbours is none
  const keep = []
  for (let i = 0; i < n; i++) {
    const p = (i - 1 + n) % n, q = (i + 1) % n
    if (Math.abs((cx[i] - cx[p]) * (cy[q] - cy[i]) - (cy[i] - cy[p]) * (cx[q] - cx[i])) > 0.001) keep.push(i)
  }
  const f = v => Math.round(v * 100) / 100
  let d = ''
  keep.forEach((i, k) => {
    const A = keep[(k - 1 + keep.length) % keep.length], B = keep[(k + 1) % keep.length]
    const ax = cx[A] - cx[i], ay = cy[A] - cy[i], bx = cx[B] - cx[i], by = cy[B] - cy[i]
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by), r = Math.min(radius, la / 2, lb / 2)
    d += `${k ? 'L' : 'M'}${f(cx[i] + (ax * r) / la)} ${f(cy[i] + (ay * r) / la)}Q${f(cx[i])} ${f(cy[i])} ${f(cx[i] + (bx * r) / lb)} ${f(cy[i] + (by * r) / lb)}`
  })
  return `${d}Z`
}

/**
 * What a click at a point of a page (PDF units) levels the two sides by (session.mjs alignClick): the unit lit there
 * (hitOf, by the side's sentence starts `startsOf` as the pointer's) and its line at the click's height in the block's
 * column — the line whose band holds the height, else the nearest — with how far down that line, 0 to 1. So a click
 * anywhere in what is painted is the unit's: in a block's pads, in the white space beside a display or between two of
 * its lines, on a float set inside a paragraph's block (a wrapfigure), and in a sentence's rows where they reach past
 * the block to the unit's text edge (the final review of the highlight, M4) — levelled by the unit, where before the
 * blocks (B1) they went by what is around them (placeAt). Null where nothing is painted. A float's body (floats.mjs) is
 * no unit's block: a click on it, off its cells' and its caption's, goes by what is around it (placeAt: a figure by its
 * twin, a table by its distance from its caption), finer than levelling the float by its caption
 */
export function clickOf(L, p, x, y, padX, startsOf = () => null) {
  const hit = hitOf(L, p, x, y, padX, startsOf)
  if (!hit) return null
  const { run } = hit, rects = L.anchors.get(hit.id)?.rects ?? []
  let line = -1, far = Infinity
  rects.forEach((r, k) => {
    if (r.page !== p || r.x1 < run.x0 || r.x0 > run.x1) return
    const d = y > r.y1 ? y - r.y1 : y < r.y0 ? r.y0 - y : 0
    if (d < far) { far = d; line = k }
  })
  if (line < 0) return null
  const r = rects[line]
  return { id: hit.id, line, f: Math.min(1, Math.max(0, (r.y1 - y) / Math.max(1, r.y1 - r.y0))) }
}
