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
// drawn or pointed at, since most pages of a long paper are never looked at in a visit.
// The look was chosen on a draft (round 1 of the highlight, 2026-10-01): one block per run, padded half the leading
// above and below and 3 px beside, one outline with 3 px corners. Where a unit's sentences are known on both sides
// (anchors.mjs sentenceStarts), a sentence instead: its first row from its start, the rows between across the run, its
// last row to its end with its punctuation, two sentences on one row meeting halfway through the space between them —
// one outline per run, the hit test the same shapes.

import { inkEdges } from './anchors.mjs'

/** kinds of unit that are no running text: what lies among their words is their float's, not theirs */
const NOT_RUNNING = new Set(['caption', 'heading', 'cell', 'figure'])
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
 * are ten times the copy (2608.02459: 9 and 11.6 MB a side)
 */
export function layoutOf(doc, views, anchors, kindOf = () => undefined) {
  const n = doc.length, pages = views.length
  const { l, r } = inkEdges(doc)
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

  // each page's columns: two where four long lines stand in each half, one where four cross the middle, else as most
  // pages have them; the lines are the units' (running heads, page numbers and floats' texts are no text block's)
  const page = [null]
  // size: the page's, for the edges' pool; gaps: the space between consecutive lines of a unit there, by its kind
  for (let p = 1; p <= pages; p++) { const v = views[p - 1]; page[p] = { mid: (v[0] + v[2]) / 2, width: v[2] - v[0], size: `${Math.round(v[2] - v[0])}x${Math.round(v[3] - v[1])}`, L: 0, R: 0, F: 0, x0: Infinity, x1: -Infinity, gaps: new Map() } }
  const long = []
  const unitsOn = Array.from({ length: pages + 2 }, () => [])
  const pagesOf = new Map()
  for (const [id, a] of anchors) {
    if (!a?.tokens?.length) continue
    const ps = [], kind = kindOf(id) ?? ''
    a.rects.forEach((r, i) => {
      const P = page[r.page]
      if (!P) return
      if (ps.at(-1) !== r.page) { ps.push(r.page); unitsOn[r.page].push(id) }
      if (r.x0 < P.x0) P.x0 = r.x0
      if (r.x1 > P.x1) P.x1 = r.x1
      // the leading: the space between a unit's consecutive lines of one size, less than a line apart
      const q = a.rects[i + 1], h = r.y1 - r.y0
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
    P.two = P.L >= COLUMN_LINES && P.R >= COLUMN_LINES ? true : P.F >= COLUMN_LINES ? false : null
    if (P.two === true) twos++
    else if (P.two === false) ones++
  }
  for (let p = 1; p <= pages; p++) if (page[p].two === null) page[p].two = twos > ones
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
  for (let p = 1; p <= pages; p++) for (const [kind, xs] of page[p].gaps) { (byKind.get(kind) ?? byKind.set(kind, []).get(kind)).push(...xs); every.push(...xs) }
  const kindLead = new Map([...byKind].map(([kind, xs]) => [kind, half(xs)])), docLead = every.length ? quartile(every) / 2 : 1
  for (let p = 1; p <= pages; p++) {
    const P = page[p]
    const at = col => { const e = edges.get(poolOf(p, col)); return { x0: e?.x0 ?? P.x0, x1: e?.x1 ?? P.x1 } }
    P.cols = P.two ? { L: at('L'), R: at('R') } : { F: at('F') }
    if (P.two) P.cols.F = { x0: P.cols.L.x0, x1: P.cols.R.x1 }
    const own = half([...P.gaps.values()].flat()) ?? docLead
    P.lead = new Map([...kindLead.keys()].map(kind => [kind, half(P.gaps.get(kind)) ?? kindLead.get(kind) ?? own]))
    P.lead.set(null, own)
    P.gaps = null
  }
  // a mark set apart after a token on its baseline (tokenizeDocument's `far`) is its ink where it ends at the token's
  // column's text edge: a proof's box set flush right
  for (const k of far) {
    const w = doc[k], P = page[w.page], e = P && (P.cols[colOf(P, w.x, w.x + w.w)] ?? P.cols.F)
    if (e && Math.abs(w.far - e.x1) < SNAP) r[k] = w.far
  }
  return { tok, pageStart, page, anchors, kindOf, unitsOn, pagesOf, cache: new Map() }
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
 * rows: [{ y0, y1, x0, x1 }], mids } in PDF units, `mids` the boundaries between its rows.
 */
export function pageGeometry(L, p) {
  let g = L.cache.get(p)
  if (g) return g
  const { tok } = L, P = L.page[p], k0 = L.pageStart[p], k1 = L.pageStart[p + 1]
  // the page's lines, as anchors.mjs lineRects has them: baselines within half a line of the first's, the line's
  // height its body text's (a script or a limit does not stretch it), its reach the ink of all its tokens; lo, hi:
  // the glyphs of all its tokens, a script's and an inline fraction's too
  const lines = [], lineOf = new Int32Array(k1 - k0)
  let cur = null
  for (let k = k0; k < k1; k++) {
    const l = tok.l[k], r = tok.r[k], y = tok.y[k], bottom = tok.bottom[k], top = tok.top[k]
    if (!cur || Math.abs(y - cur.base) > cur.h * 0.5 || r < cur.x0 - cur.h * 30) {
      cur = { x0: l, x1: r, y0: bottom, y1: top, lo: bottom, hi: top, base: y, h: tok.h[k], k0: k, col: 'F' }
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
  // who owns each of the page's tokens, and each of its lines: -1 none, a unit, -2 several
  const owner = new Int32Array(k1 - k0).fill(-1), mine = new Map()
  for (const id of L.unitsOn[p] ?? []) {
    const ts = L.anchors.get(id).tokens, on = ts.slice(lowerBound(ts, k0), lowerBound(ts, k1))
    if (!on.length) continue
    mine.set(id, on)
    for (const k of on) if (owner[k - k0] === -1) owner[k - k0] = id
  }
  const lineOwner = new Int32Array(lines.length).fill(-1)
  for (let i = 0; i < k1 - k0; i++) {
    const o = owner[i], j = lineOf[i]
    if (o !== -1) lineOwner[j] = lineOwner[j] === -1 || lineOwner[j] === o ? o : -2
  }
  const at = { k0, lines, lineOf, owner, lineOwner, heads: [], filled: 0 }
  const runs = [], byId = new Map()
  for (const [id, toks] of mine) {
    const rs = unitRuns(L, p, at, id, toks)
    byId.set(id, rs)
    runs.push(...rs)
  }
  g = { runs, byId, heads: at.heads, filled: at.filled }
  L.cache.set(p, g)
  return g
}

/** a unit's runs on page p, from its tokens there */
function unitRuns(L, p, at, id, toks) {
  const { k0, lines, lineOf, owner, lineOwner } = at
  const { l: inkL, r: inkR } = L.tok, P = L.page[p]
  const line = k => lineOf[k - k0]
  const lineOk = k => { const o = lineOwner[line(k)]; return o === -1 || o === id }
  // in running text, what stands between two of the unit's words in the stream, on their page and in their column, and
  // is no unit's is the unit's: an inline formula whose pieces anchorUnits' `between` refused for leaving the band of
  // the words around it (a limit under an arrow, 2608.08350). Not where another unit's words stand among them, nor on a
  // line holding another unit's words; not for a caption, a heading, a cell: their float would come with them
  let ks = toks
  if (!NOT_RUNNING.has(L.kindOf(id))) {
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
  // theorem's head, a list's label, a heading's number, a caption's label, all before the start mark
  let head = null
  const first = L.anchors.get(id).tokens[0]
  if (first === toks[0]) {
    for (let k = lines[line(first)].k0; k < first; k++) {
      if (owner[k - k0] !== -1) head = null
      else head = Math.min(head ?? Infinity, inkL[k])
    }
  }
  // by column, the unit's lines and each one's reach across (the unit's tokens on it), and the tokens on each
  const byCol = new Map()
  for (const k of ks) {
    const ln = line(k), col = lines[ln].col
    const m = byCol.get(col) ?? byCol.set(col, new Map()).get(col)
    const x = m.get(ln)
    if (x) { if (inkL[k] < x.x0) x.x0 = inkL[k]; if (inkR[k] > x.x1) x.x1 = inkR[k]; x.ks.push(k) } else m.set(ln, { x0: inkL[k], x1: inkR[k], ks: [k] })
  }
  let headAt = null
  if (head !== null) { const x = byCol.get(lines[line(first)].col)?.get(line(first)); if (x && head < x.x0) { x.x0 = head; at.heads.push(id); headAt = line(first) } }
  const runs = []
  for (const [col, m] of byCol) {
    const e = P.cols[col] ?? P.cols.F
    // rows: the lines from the top, merged where they overlap
    const ls = [...m.keys()].sort((a, b) => lines[b].y1 - lines[a].y1)
    const rows = [], rowOf = new Map()
    for (const i of ls) {
      const l = lines[i], x = m.get(i), row = rows.at(-1)
      if (row && l.y1 > row.y0 + OVERLAP) {
        if (l.y0 < row.y0) row.y0 = l.y0
        if (l.y1 > row.y1) row.y1 = l.y1
        if (x.x0 < row.x0) row.x0 = x.x0
        if (x.x1 > row.x1) row.x1 = x.x1
        if (l.lo < row.lo) row.lo = l.lo
        if (l.hi > row.hi) row.hi = l.hi
      } else rows.push({ y0: l.y0, y1: l.y1, x0: x.x0, x1: x.x1, lo: l.lo, hi: l.hi })
      rowOf.set(i, rows.length - 1)
    }
    // runs: the rows cut where another unit's line stands between two of them in the column (a float set inside a
    // paragraph, a footnote), and in a column of two where a line across both does, the unit's own too (a paragraph
    // around a full-width display, revtex's widetext: one run above and one below it, not one over it); a gap alone
    // is the unit's (a display)
    let start = 0
    for (let r = 1; r <= rows.length; r++) {
      if (r < rows.length && !interrupted(lines, lineOwner, col, id, rows[r - 1], rows[r])) continue
      const run = runOf(id, p, col, rows.slice(start, r), e, P.lead.get(L.kindOf(id) ?? '') ?? P.lead.get(null), !FLOATS.has(L.kindOf(id)))
      // its tokens in the stream's order and the row each is on, and where its head begins: its sentences' rows (segsOf)
      const ts = []
      for (const [ln, x] of m) { const w = rowOf.get(ln); if (w >= start && w < r) for (const k of x.ks) ts.push([k, w - start]) }
      ts.sort((a, b) => a[0] - b[0])
      run.toks = Int32Array.from(ts, t => t[0]); run.rowOf = Int32Array.from(ts, t => t[1])
      run.head = headAt !== null && rowOf.get(headAt) >= start && rowOf.get(headAt) < r ? head : null
      runs.push(run)
      start = r
    }
  }
  // in the order the unit's words come: a column's runs from the top, the columns as the stream meets them
  return runs
}

/** whether a line stands between two rows of a run in `col`, one above the other (its middle between them): another
 *  unit's in the column, or in a column of two any line across both */
function interrupted(lines, lineOwner, col, id, above, below) {
  if (above.y0 - below.y1 < Math.min(above.y1 - above.y0, below.y1 - below.y0)) return false
  for (let i = 0; i < lines.length; i++) {
    const o = lineOwner[i], l = lines[i]
    if (!(l.col === col ? o !== -1 && o !== id : col !== 'F' && l.col === 'F')) continue
    const y = (l.y0 + l.y1) / 2
    if (y < above.y0 && y > below.y1) return true
  }
  return false
}

/** a run: its rows' extent across, inside the column's text edges — up to OVERHANG past them (`clamp`: running text),
 *  and within SNAP of them on them — and down; the boundaries between its rows halfway between them, never rising */
function runOf(id, page, col, rows, e, lead, clamp) {
  let x0 = Infinity, x1 = -Infinity
  for (const r of rows) { if (r.x0 < x0) x0 = r.x0; if (r.x1 > x1) x1 = r.x1 }
  if (clamp) { x0 = Math.max(x0, e.x0 - OVERHANG); x1 = Math.min(x1, e.x1 + OVERHANG) }
  if (Math.abs(x0 - e.x0) < SNAP) x0 = e.x0
  if (Math.abs(x1 - e.x1) < SNAP) x1 = e.x1
  const mids = []
  for (let i = 1; i < rows.length; i++) mids.push(Math.min((rows[i - 1].y0 + rows[i].y1) / 2, i > 1 ? mids[i - 2] : Infinity))
  return { id, page, col, x0, x1, top: rows[0].y1, bottom: rows.at(-1).y0, hi: rows[0].hi, lo: rows.at(-1).lo, lead, rows, mids }
}

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
    if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue
    const a = (b.x1 - b.x0) * (b.y1 - b.y0)
    if (a >= area) continue
    const starts = NOT_RUNNING.has(L.kindOf(run.id)) ? null : startsOf(run.id)
    let s = -1
    if (starts) {
      const ys = edgesOf(run, padX)
      let i = 0
      while (i < run.rows.length - 1 && y < ys[i + 1]) i++
      const span = spansOf(segsOf(L, run, starts), run, i, padX).find(q => x >= q.x0 && x <= q.x1)
      if (!span) continue
      s = span.s
    }
    area = a; best = { id: run.id, run, s }
  }
  return best
}

/** a run's row boundaries, from the top (PDF y, falling): its block's top, the midpoints between its rows, its block's foot */
const edgesOf = (run, padX) => { const b = blockOf(run, padX); return [b.y1, ...run.mids, b.y0] }
/** each run's sentences' segments, kept for the starts they were made with */
const segsMade = new WeakMap()
/**
 * A run's sentences row by row (`starts`: the page tokens where its unit's sentences after the first begin): on each row
 * each sentence's ink across, from its tokens there — the head before the unit's first word in the first sentence —
 * kept inside the run's extent; and each sentence's first and last row in the run
 */
function segsOf(L, run, starts) {
  const made = segsMade.get(run)
  if (made?.starts === starts) return made
  const { l, r } = L.tok, rows = run.rows.map(() => []), first = [], last = []
  let s = 0
  while (s < starts.length && starts[s] <= run.toks[0]) s++
  for (let n = 0; n < run.toks.length; n++) {
    const k = run.toks[n], w = run.rowOf[n]
    while (s < starts.length && starts[s] <= k) s++
    const row = rows[w], g = row.find(q => q.s === s)
    if (g) { if (l[k] < g.x0) g.x0 = l[k]; if (r[k] > g.x1) g.x1 = r[k] } else row.push({ s, x0: l[k], x1: r[k] })
    if (first[s] === undefined) first[s] = w
    last[s] = w
  }
  if (run.head !== null) { const g = rows[run.rowOf[0]].find(q => q.s === 0); if (g && run.head < g.x0) g.x0 = run.head }
  for (const row of rows) { row.sort((a, b) => a.s - b.s); for (const g of row) { g.x0 = Math.max(g.x0, run.x0); g.x1 = Math.min(g.x1, run.x1) } }
  const out = { starts, rows, first, last }
  segsMade.set(run, out)
  return out
}
/**
 * What each sentence on row `i` of a run paints across (PDF units), tiling the row: two sentences meet halfway through
 * the space between them; one that goes on from the row before begins at the run's left edge and one that goes on to
 * the row after ends at its right — padded `padX` beyond the column's text —; a sentence's own start or end at neither
 * is padded `padX` beyond its ink, or is the run's edge within SNAP of it
 */
function spansOf(g, run, i, padX) {
  const row = g.rows[i], L = run.x0 - padX, R = run.x1 + padX
  return row.map((q, t) => ({
    s: q.s,
    x0: t > 0 ? (row[t - 1].x1 + q.x0) / 2 : i > g.first[q.s] || q.x0 - run.x0 < SNAP ? L : q.x0 - padX,
    x1: t < row.length - 1 ? (q.x1 + row[t + 1].x0) / 2 : i < g.last[q.s] || run.x1 - q.x1 < SNAP ? R : q.x1 + padX,
  }))
}

/**
 * What sentence `s` of a run's unit paints in the run (PDF units): a rectangle per row it is on, from the top — its
 * first row from its start, the rows between across the run (a display in the sentence among them), its last row to its
 * end, its final punctuation and closing marks in its ink (anchors.mjs inkEdges) — rows of the same reach as one; none
 * where the sentence is not in the run. `starts` as hitOf's
 */
export function sentenceOf(L, run, starts, s, padX) {
  const g = segsOf(L, run, starts), fa = g.first[s], la = g.last[s]
  if (fa === undefined) return []
  const ys = edgesOf(run, padX), out = []
  for (let i = fa; i <= la; i++) {
    const span = spansOf(g, run, i, padX).find(q => q.s === s) ?? { x0: run.x0 - padX, x1: run.x1 + padX }
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
  const pieces = [[rects[0]]]
  for (let i = 1; i < rects.length; i++) { const a = rects[i - 1], b = rects[i]; if (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 2 * radius) pieces.at(-1).push(b); else pieces.push([b]) }
  const f = v => +v.toFixed(2)
  let d = ''
  for (const p of pieces) {
    // the corners, clockwise from the top left: down the right side, then up the left
    const pts = [[p[0].x0, p[0].y0], [p[0].x1, p[0].y0]]
    for (let i = 0; i < p.length; i++) { pts.push([p[i].x1, p[i].y1]); if (p[i + 1]) pts.push([p[i + 1].x1, p[i].y1]) }
    pts.push([p.at(-1).x0, p.at(-1).y1])
    for (let i = p.length - 1; i > 0; i--) { pts.push([p[i].x0, p[i].y0]); pts.push([p[i - 1].x0, p[i].y0]) }
    // repeated and collinear points dropped: where two rows share an edge there is no corner
    const q = []
    for (const pt of pts) if (!q.length || Math.hypot(pt[0] - q.at(-1)[0], pt[1] - q.at(-1)[1]) > 0.01) q.push(pt)
    if (q.length > 1 && Math.hypot(q[0][0] - q.at(-1)[0], q[0][1] - q.at(-1)[1]) < 0.01) q.pop()
    const c = q.filter((pt, i) => { const a = q[(i - 1 + q.length) % q.length], b = q[(i + 1) % q.length]; return Math.abs((pt[0] - a[0]) * (b[1] - pt[1]) - (pt[1] - a[1]) * (b[0] - pt[0])) > 0.001 })
    c.forEach((P, i) => {
      const A = c[(i - 1 + c.length) % c.length], B = c[(i + 1) % c.length]
      const la = Math.hypot(A[0] - P[0], A[1] - P[1]), lb = Math.hypot(B[0] - P[0], B[1] - P[1]), r = Math.min(radius, la / 2, lb / 2)
      d += `${i ? 'L' : 'M'}${f(P[0] + ((A[0] - P[0]) * r) / la)} ${f(P[1] + ((A[1] - P[1]) * r) / la)}Q${f(P[0])} ${f(P[1])} ${f(P[0] + ((B[0] - P[0]) * r) / lb)} ${f(P[1] + ((B[1] - P[1]) * r) / lb)}`
    })
    d += 'Z'
  }
  return d
}

/**
 * What a click at a point of a page (PDF units) levels the two sides by (session.mjs alignClick): the unit lit there
 * (hitOf) and its line at the click's height in the block's column — the line whose band holds the height, else the
 * nearest — with how far down that line, 0 to 1. So a click anywhere in what is painted is the unit's: in a block's
 * pads, in the white space beside a display or between two of its lines, and on a float set inside a paragraph's
 * block (a wrapfigure) — levelled by the unit, where before the blocks (B1) they went by what is around them
 * (placeAt). Null where nothing is painted
 */
export function clickOf(L, p, x, y, padX) {
  const hit = hitOf(L, p, x, y, padX)
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
