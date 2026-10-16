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
 *   items let go), and `columns` the pages' columns' rule (highlight.mjs pageColumns, today's), both layoutOf's
 */
export function leftSideOf({ doc, views, anchors, edges = null, columns = undefined }) {
  const N = views.length, n = doc.length
  const pages = views.map(v => v.map(onGrid))

  // the units located, by id rising: tokens rising and unique, the first the stream, the rectangles on the grid
  const placed = []
  for (const [id, a] of [...anchors].sort((x, y) => x[0] - y[0])) {
    const tokens = a ? [...new Set(a.tokens)].sort((x, y) => x - y) : []
    const rects = a ? a.rects.map(r => [r.page, onGrid(r.x0), onGrid(r.y0), onGrid(r.x1), onGrid(r.y1)]) : []
    if (!tokens.length || !rects.length || !rects.every(r => r.every(Number.isFinite))) continue
    placed.push({ id, a, tokens: Int32Array.from(tokens), rects })
  }
  const units = placed.map(u => [u.id, u.tokens[0], u.rects])

  // the layout of what is shipped, as the reader makes it of the units it is given (the web's anchorsOf): their rectangles on the
  // grid and tokens
  const shipped = new Map(placed.map(u => [u.id, { rects: u.rects.map(([page, x0, y0, x1, y1]) => ({ page, x0, y0, x1, y1 })), tokens: u.tokens }]))
  const { tok } = layoutOf(doc, pages, shipped, undefined, { edges, ...(columns ? { columns } : {}) })

  // each page's first token: tokens are in page order, a page with none begins where the next does
  const start = new Int32Array(N + 2).fill(n)
  for (let k = 0, last = 0; k < n; k++) {
    const p = doc[k].page
    if (!Number.isInteger(p) || p < last || p > N) throw new RangeError(`token ${k} is on page ${p}, after page ${last} of ${N}: the tokens go page by page`)
    if (p !== last) { for (let q = last + 1; q <= p; q++) start[q] = k; last = p }
  }
  for (let p = N; p >= 1; p--) if (start[p] > start[p + 1]) start[p] = start[p + 1]

  // the units on each page, ids rising, and each unit's start runs
  const on = Array.from({ length: N + 1 }, () => [])
  const runsOf = new Map()
  const stats = { units: placed.length, tokens: n, paired: 0, runs: 0, gated: 0, filtered: 0 }
  placed.forEach((u, i) => {
    for (let k = 0, p = 1; k < u.tokens.length; k++) {
      while (p < N && start[p + 1] <= u.tokens[k]) p++
      if (on[p].at(-1) !== i) on[p].push(i)
    }
    const runs = startRuns(u.a)
    if (runs) {
      runsOf.set(i, runs)
      stats.paired++
      stats.runs += runs.length / 3
      let kept = 0
      for (let j = 2; j < runs.length; j += 3) kept += runs[j]
      stats.filtered += u.a.pairs.size - kept
    } else if (u.a.pairs) stats.gated++
  })

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
    const spans = [], pairs = []
    for (const i of on[page]) {
      const u = placed[i], ranges = []
      for (let j = lowerBound(u.tokens, first); j < u.tokens.length && u.tokens[j] < end; j++) {
        const t = u.tokens[j] - first, last = ranges.length - 2
        if (last >= 0 && ranges[last] + ranges[last + 1] === t) ranges[last + 1]++
        else ranges.push(t, 1)
      }
      spans.push([u.id, ranges])
      const runs = runsOf.get(i)
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

  return { pages, units, leftPages, stats }
}
