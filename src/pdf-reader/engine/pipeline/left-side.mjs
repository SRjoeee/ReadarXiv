// The original's side, made a page at a time for the prepare (left-pages design, 2026-10-15): from the tokens arXiv's PDF
// was anchored on and the units' anchors (anchors.mjs anchorUnits), the whole located left the cutter takes (`pages`, `units`:
// each unit's stream and rectangles) and each page's left part input (`leftPages`: that page's tokens as the highlight's layout
// keeps them, each unit's spans on it and its start runs), all from one input, so that a span's first range is its unit's
// stream whatever page is asked for. A page is a pure function of the page: asked in any order, any number of times.
//
// The tokens are those layoutOf (view/highlight.mjs) makes of the located units, coded as the left part's wire codes them: each
// field to an integer of TOKEN_SCALE and the difference from the token before it, the first of a page from 0. The pairs are
// anchors.mjs startRuns, clipped to the page. Nothing is kept of `doc` or of the anchors but what a page needs: the tokens'
// six Float32 fields, each unit's tokens and runs, and the units on each page.
//
// An original module (no port statement). It imports the engine's own pure modules: no canvas, no `node:*` one.
import { TOKEN_FIELDS, TOKEN_LIMIT, TOKEN_SCALE, onGrid } from '../layer-proto/format.mjs'
import { layoutOf } from '../view/highlight.mjs'
import { startRuns } from './anchors.mjs'

const LIMIT = TOKEN_LIMIT * TOKEN_SCALE

/** the index of the first of the rising `xs` that is at least `v` */
function lowerBound(xs, v) {
  let lo = 0, hi = xs.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid] < v) lo = mid + 1; else hi = mid }
  return lo
}

/**
 * @param {{ doc: readonly object[], views: readonly (readonly number[])[], anchors: ReadonlyMap<number, object | null> }} o
 *   `doc` the tokens the anchors were made on (tokenizeDocument's, fitted), in page order; `views` each page's box as PDF.js gives
 *   it, pages 1 to N; `anchors` anchorUnits' result; `edges` the tokens' ink edges made already (layout/arxiv.mjs: the tokens'
 *   items let go), and `columns` the rule of the pages' columns the far push reads (highlight.mjs pageColumns, today's;
 *   columnsOfTokens', arXiv's text alone, made once: `() => columns`), both layoutOf's
 */
export function leftSideOf({ doc, views, anchors, edges = null, columns = undefined }) {
  // the layout of what is shipped, as the reader makes it of the units it is given (the web's anchorsOf): their rectangles on the
  // grid and tokens
  const pages = views.map(v => v.map(onGrid))
  const side = sideOf(doc, pages, shipped => layoutOf(doc, pages, shipped, undefined, { edges, ...(columns ? { columns } : {}) }).tok, [...anchors].sort((x, y) => x[0] - y[0]))
  return { pages, units: side.units(), leftPages: side.leftPages, stats: side.stats }
}

/**
 * leftSideOf a unit at a time (the page stream, stage 2): each unit given as its anchor is final (`add(id, anchor)`, in any
 * order; `none(id)` for one with none), and a page's left part input (`leftPages(page)`) once every unit with a token on it is
 * given, that page's as leftSideOf's of the whole: the tokens' layout is made before any unit is given, so `columns` (the pages'
 * columns' rule, a whole run's: the far push reads every located unit under today's) must be given. `units()` the units given
 * that are located, ids rising; `done()` how many units were given, located or not
 */
export function leftSideStream({ doc, views, edges = null, columns }) {
  if (typeof columns !== 'function') throw new TypeError('columns: the pages\' columns\' rule, given: the tokens\' layout is made before any unit is')
  const pages = views.map(v => v.map(onGrid))
  const side = sideOf(doc, pages, () => layoutOf(doc, pages, new Map(), undefined, { edges, columns }).tok, [])
  return { pages, add: side.add, none: side.none, units: side.units, leftPages: side.leftPages, stats: side.stats, done: side.done }
}

/** the side of `doc` on the grid `pages`, its tokens' layout `tokOf(shipped)` (of the units `first` give, the rest added after) */
function sideOf(doc, pages, tokOf, first) {
  const N = pages.length, n = doc.length
  // the units located, by id: tokens rising and unique, the first the stream, the rectangles on the grid
  const placed = new Map()
  const located = (id, a) => {
    const tokens = a ? [...new Set(a.tokens)].sort((x, y) => x - y) : []
    const rects = a ? a.rects.map(r => [r.page, onGrid(r.x0), onGrid(r.y0), onGrid(r.x1), onGrid(r.y1)]) : []
    if (!tokens.length || !rects.length || !rects.every(r => r.every(Number.isFinite))) return null
    return { id, a, tokens: Int32Array.from(tokens), rects }
  }
  const given = []
  for (const [id, a] of first) { const u = located(id, a); if (u) given.push(u) }
  const shipped = new Map(given.map(u => [u.id, { rects: u.rects.map(([page, x0, y0, x1, y1]) => ({ page, x0, y0, x1, y1 })), tokens: u.tokens }]))
  const tok = tokOf(shipped)

  // each page's first token: tokens are in page order, a page with none begins where the next does
  const start = new Int32Array(N + 2).fill(n)
  for (let k = 0, last = 0; k < n; k++) {
    const p = doc[k].page
    if (!Number.isInteger(p) || p < last || p > N) throw new RangeError(`token ${k} is on page ${p}, after page ${last} of ${N}: the tokens go page by page`)
    if (p !== last) { for (let q = last + 1; q <= p; q++) start[q] = k; last = p }
  }
  for (let p = N; p >= 1; p--) if (start[p] > start[p + 1]) start[p] = start[p + 1]

  // the units on each page (ids; rising when a page is asked for), each unit's start runs
  const on = Array.from({ length: N + 1 }, () => [])
  const stats = { units: 0, tokens: n, paired: 0, runs: 0, gated: 0, filtered: 0 }
  // (the pages a unit was added to since they were last asked for: their units sorted again)
  const unsorted = new Set()
  let done = 0
  const take = u => {
    placed.set(u.id, u)
    stats.units++
    for (let k = 0, p = 1, last = 0; k < u.tokens.length; k++) {
      while (p < N && start[p + 1] <= u.tokens[k]) p++
      if (last !== p) { on[p].push(u.id); unsorted.add(p); last = p }
    }
    u.runs = startRuns(u.a)
    if (u.runs) {
      stats.paired++
      stats.runs += u.runs.length / 3
      let kept = 0
      for (let j = 2; j < u.runs.length; j += 3) kept += u.runs[j]
      stats.filtered += u.a.pairs.size - kept
    } else if (u.a.pairs) stats.gated++
  }
  for (const u of given) { take(u); done++ }

  const leftPages = page => {
    if (!Number.isInteger(page) || page < 1 || page > N) throw new RangeError(`not a page 1 to ${N}`)
    const first = start[page], end = start[page + 1], count = end - first
    if (count === 0) return null
    const tokens = { perPage: [count] }
    for (const f of TOKEN_FIELDS) {
      const v = tok[f], out = new Array(count)
      for (let k = first, prev = 0; k < end; k++) {
        const q = Math.round(v[k] * TOKEN_SCALE)
        if (!(q >= -LIMIT && q <= LIMIT)) throw new RangeError(`token ${k}, field ${f}: ${v[k]} is not a number within ±${TOKEN_LIMIT}`)
        out[k - first] = q - prev + 0
        prev = q
      }
      tokens[f] = out
    }
    if (unsorted.delete(page)) on[page].sort((x, y) => x - y)
    const spans = [], pairs = []
    for (const id of on[page]) {
      const u = placed.get(id), ranges = []
      for (let j = lowerBound(u.tokens, first); j < u.tokens.length && u.tokens[j] < end; j++) {
        const t = u.tokens[j] - first, last = ranges.length - 2
        if (last >= 0 && ranges[last] + ranges[last + 1] === t) ranges[last + 1]++
        else ranges.push(t, 1)
      }
      spans.push([u.id, ranges])
      const runs = u.runs
      if (!runs) continue
      const clipped = []
      for (let j = 0; j < runs.length; j += 3) {
        const w = runs[j], t = runs[j + 1], c = runs[j + 2]
        const t2 = Math.max(t, first), c2 = Math.min(t + c, end) - t2
        if (c2 >= 1) clipped.push(w + t2 - t, t2 - first, c2)
      }
      if (clipped.length) pairs.push([u.id, clipped])
    }
    return { first, tokens, spans, pairs }
  }

  return {
    leftPages, stats,
    add(id, a) { const u = located(id, a); if (u) take(u); done++ },
    none() { done++ },
    units: () => [...placed.values()].sort((x, y) => x.id - y.id).map(u => [u.id, u.tokens[0], u.rects]),
    done: () => done,
  }
}
