// The left of a part (the page stream, E2a; the design note of 2026-10-15 §2.2 step 5, Appendix A Q7): the anchors of the
// units first framed on pages a to b of arXiv's PDF, made from the units that may touch those pages and theirs, not the
// whole paper, and equal to the whole paper's anchors of those units (anchors.mjs anchorUnits).
//
// Why a window is exact. A unit's match (matchUnits) is a function of its own bounds, its neighbours' and the tokens of its
// window, so it is made for any unit alone. Its place (placeUnits) reads the tokens' owners on its pages, which only the
// units whose matches reach those pages set (a bounded unit's range, an unbounded one's matched words), and the walks of the
// units with an edge on those pages (a walk never leaves its edge's page), whose own words read the owners on their pages in
// turn. So the units that may touch the part's pages (C), the units that may touch theirs (V1), and those that may touch
// V1's (V2) are all a part's place reads: placeUnits over V2 places C's units as over the whole. Where each unit may reach is
// known before it is matched: a bounded unit its bounds; one without marks the window it is searched in, between its marked
// neighbours and MARGIN beyond (a float: that window, and its match over the whole document, floatMatches', made at step
// T); with no marks at all, the whole document. Two things are the whole document's still, and given: the frame (`frame`,
// pageFrame's rule reads every located unit, so pageFrame over a part's units alone is another frame: there is no default;
// anchors.mjs frameOfTokens', of arXiv's text alone, is final at step T and reads none) and, for a float, the marks of its
// neighbours (its search between them comes first). A unit is told in the part of its
// first rectangle's page.
//
// An original module (no port statement). Pure: no PDF.js, no `node:*` module.
import { matchUnits, placeUnits } from './anchors.mjs'

/** a unit without marks is searched this far past its marked neighbours (anchors.mjs MARGIN) */
const MARGIN = 100

/**
 * Where each unit may reach, as token intervals [lo, hi] (at most two), by the units' order: before any unit is matched,
 * from the bounds and the floats' whole-document matches alone. `bounds`, `floating`, `floatMatch` anchorUnits' (`floatMatch`
 * floatMatches' of these units, every float of K words or more in it: one not in it is a shorter one's)
 */
export function leftReach(doc, units, { bounds, floating = () => false, floatMatch = null }) {
  const N = doc.length
  const hard = units.map(u => bounds?.get(String(u.id)) ?? null)
  const before = [], after = []
  const inText = u => hard[u] && !floating(units[u].id)
  for (let u = 0, e = -1; u < units.length; u++) { before[u] = e; if (inText(u)) e = hard[u][1] }
  for (let u = units.length - 1, a = N; u >= 0; u--) { after[u] = a; if (inText(u)) a = hard[u][0] }
  return units.map(({ id }, u) => {
    if (hard[u]) return [hard[u]]
    if (!N) return []
    if (!bounds?.size) return [[0, N - 1]]
    const out = []
    const lo = Math.max(0, before[u] + 1 - MARGIN), hi = Math.min(N - 1, after[u] - 1 + MARGIN)
    if (lo <= hi) out.push([lo, hi])
    // a float's search over the whole document (one of K words or more): its match given (floatMatches makes one for each
    // such float, none for a shorter one, which is only looked for between its neighbours), else anywhere
    if (floating(id)) {
      if (!floatMatch) out.push([0, N - 1])
      else {
        const m = floatMatch.get(id)
        if (m?.length) { let a = Infinity, b = -Infinity; for (const k of m) { if (k < a) a = k; if (k > b) b = k } out.push([a, b]) }
      }
    }
    return out
  })
}

/**
 * The left of the part of pages a to b: Map id → Anchor of the units whose first rectangle stands on a page from a to b,
 * each as anchorUnits over the whole paper places it, under the frame `frame` gives: required, a rule whose frame is the
 * whole document's (one made over the whole paper's units, or one of arXiv's text alone), never pageFrame over the part's
 * units, which reads only the located units it is given (a TypeError where none is given). `reach` leftReach's (made once
 * for every part). Also the units the place was made of (`read`, indices into `units`), for the record, and the ids of
 * those placed with their first rectangle before page a (`before`: a part's that came before, or, cut a range at a time, a
 * unit its ranges passed over)
 */
export function leftOfPart(doc, units, { bounds, floating = () => false, floatMatch = null, frame, minCoverage = 0.6 }, [a, b], reach = leftReach(doc, units, { bounds, floating, floatMatch })) {
  if (typeof frame !== 'function') throw new TypeError('leftOfPart: `frame`, the whole document\'s frame rule (pageFrame over a part\'s units is not the whole paper\'s)')
  const { C, V2 } = partSets(doc, units, [a, b], reach)
  const read = V2.units
  const found = matchUnits(doc, units, { minCoverage, bounds, floating, floatMatch, only: new Set(read) })
  const placed = placeUnits(doc, read.map(u => units[u]), read.map(u => found[u]), { frame })
  const out = new Map(), before = []
  for (const u of C.units) {
    const { id } = units[u], anchor = placed.get(id)
    const first = anchor?.rects?.[0]?.page
    if (anchor && first >= a && first <= b) out.set(id, anchor)
    else if (anchor && first < a) before.push(id)
  }
  return { anchors: out, read, before }
}

/**
 * What the left of pages a to b reads (leftOfPart's): the units that may touch those pages (C), those that may touch theirs
 * (V1), and those that may touch V1's (V2), each { units: indices into `units`, pages: a flag a page }, from `reach`
 * (leftReach's, or any reach that holds each unit's)
 */
export function partSets(doc, units, [a, b], reach) {
  const pageOf = k => doc[k].page
  const N = doc.length ? doc[doc.length - 1].page : 0
  /** the pages a unit may reach, as page intervals */
  const pagesOf = u => reach[u].map(([lo, hi]) => [pageOf(lo), pageOf(hi)])
  /** the units whose reach meets a set of pages (a flag a page), and the set of pages theirs makes */
  const meeting = pages => {
    const sum = new Int32Array(N + 2)
    for (let p = 1; p <= N; p++) sum[p] = sum[p - 1] + (pages[p] ? 1 : 0)
    const units_ = [], next = new Uint8Array(N + 2)
    for (let u = 0; u < units.length; u++) {
      const iv = pagesOf(u)
      if (!iv.some(([x, y]) => sum[Math.min(y, N)] - sum[Math.max(x, 1) - 1] > 0)) continue
      units_.push(u)
      for (const [x, y] of iv) for (let p = Math.max(x, 1); p <= Math.min(y, N); p++) next[p] = 1
    }
    return { units: units_, pages: next }
  }
  const part = new Uint8Array(N + 2)
  for (let p = Math.max(a, 1); p <= Math.min(b, N); p++) part[p] = 1
  const C = meeting(part), V1 = meeting(C.pages)
  return { C, V1, V2: meeting(V1.pages) }
}

/**
 * The units anchored by ranges of a page (the page stream, E2b design §1.2): as each unit's bounds become final (`mark`),
 * the pages from `am` on are anchored a page at a time, each once every unit its left reads (partSets' V2 of the page,
 * under a conservative reach) has its match final, each by leftOfPart under the whole document's frame (`frame`), so that
 * every unit's anchor is anchorUnits' over the whole paper. A unit's match is final when its bounds are and, where it has
 * none, every unit between it and its nearest bounded neighbour in the text either side has them too (anchors.mjs
 * neighbours). The reach of a unit whose match is not final (conservative): its own marks' pages (`own`: where its bounds
 * would be, 0 for none) and the window it would have unbounded between the neighbours it may yet have, from the earliest end
 * any unit still to be marked between it and its last bounded neighbour may get to the latest start any on its other side
 * may (a figure's text box, a paragraph by kind, is set after the text that follows it: the units' order is not their
 * bounds' order), with its MARGIN, and a float's match over the whole document (leftReach's). `boundsKnown()`: whether every
 * bound the paper may have is known (matchUnits' switch between a whole-document search and one between neighbours; by
 * default every unit marked). `run(onAnchor, onSettle)`: the ranges anchored while ready, each unit first framed on the page
 * given to onAnchor(id, anchor), each unit whose match is final and reaches no later page settled without one (onSettle(u));
 * past the last page every unit left is settled. A unit placed before the page anchored and not settled is a defect of the
 * readiness: thrown. The units' ids are their indices
 */
export function rangedAnchors(doc, units, { floating = () => false, floatMatch = null, frame, boundsKnown = null } = {}) {
  if (typeof frame !== 'function') throw new TypeError('rangedAnchors: `frame`, the whole document\'s frame rule (leftOfPart\'s)')
  const n = units.length, N = doc.length
  const bounds = new Map(), marked = new Uint8Array(n), settled = new Uint8Array(n), ownLow = new Int32Array(n), ownHigh = new Int32Array(n)
  let markedCount = 0, am = 1
  const lastPage = N ? doc[N - 1].page : 0
  // each page's first token and last (the tokens are in page order): a page's tokens, as a reach's interval
  const firstTok = new Int32Array(lastPage + 2).fill(N), lastTok = new Int32Array(lastPage + 2).fill(-1)
  doc.forEach((t, k) => { if (k < firstTok[t.page]) firstTok[t.page] = k; lastTok[t.page] = k })
  for (let p = lastPage; p >= 1; p--) if (firstTok[p] === N) firstTok[p] = firstTok[p + 1] ?? N
  for (let p = 1; p <= lastPage; p++) if (lastTok[p] < 0) lastTok[p] = lastTok[p - 1] ?? -1
  const key = u => String(units[u].id)
  const inText = u => bounds.has(key(u)) && !floating(units[u].id)
  const finalOf = () => {
    const fin = new Uint8Array(n), out = leftReach(doc, units, { bounds, floating, floatMatch })
    const pendBefore = new Uint8Array(n), pendAfter = new Uint8Array(n), lo = new Int32Array(n), hi = new Int32Array(n)
    for (let u = 0, pend = 0, low = -1; u < n; u++) {
      pendBefore[u] = pend; lo[u] = low
      if (inText(u)) { pend = 0; low = bounds.get(key(u))[1] } else if (!marked[u]) { pend = 1; if (!floating(units[u].id) && ownLow[u]) low = Math.min(low, firstTok[ownLow[u]]) }
    }
    for (let u = n - 1, pend = 0, high = N; u >= 0; u--) {
      pendAfter[u] = pend; hi[u] = high
      if (inText(u)) { pend = 0; high = bounds.get(key(u))[0] } else if (!marked[u]) { pend = 1; if (!floating(units[u].id) && ownHigh[u]) high = Math.max(high, lastTok[ownHigh[u]]) }
    }
    for (let u = 0; u < n; u++) {
      fin[u] = marked[u] && (bounds.has(key(u)) || (!pendBefore[u] && !pendAfter[u])) ? 1 : 0
      if (fin[u]) continue
      const more = [[Math.max(0, lo[u] + 1 - MARGIN), Math.min(N - 1, hi[u] - 1 + MARGIN)]]
      if (!marked[u] && ownLow[u]) more.push([firstTok[ownLow[u]], lastTok[ownHigh[u]]])
      out[u] = [...out[u], ...more.filter(([a, b]) => a <= b)]
    }
    return { fin, reach: out }
  }
  const settle = (u, f) => { if (settled[u]) return; settled[u] = 1; f(u) }
  return {
    bounds, firstTok, lastTok, lastPage,
    /** the first page not anchored yet */
    get am() { return am },
    /** unit u's own marks' pages while its bounds are not final: the least and the last (0: it has none) */
    own(u, low, high) { ownLow[u] = low; ownHigh[u] = high },
    /** unit u's bounds final: [first token, last token], or null for none */
    mark(u, b) {
      if (marked[u]) return
      if (b) bounds.set(key(u), b)
      marked[u] = 1
      markedCount++
    },
    isMarked: u => marked[u] === 1,
    isSettled: u => settled[u] === 1,
    run(onAnchor, onSettle) {
      while (am <= lastPage) {
        if (!(bounds.size > 0 || (boundsKnown ? boundsKnown() : markedCount === n))) return
        const { fin, reach } = finalOf()
        if (!partSets(doc, units, [am, am], reach).V2.units.every(u => fin[u])) return
        const got = leftOfPart(doc, units, { bounds, floating, floatMatch, frame }, [am, am], reach)
        for (const id of got.before) if (!settled[id]) throw new Error(`the page stream passed over unit ${id}: placed before page ${am}, never anchored`)
        for (const [id, an] of got.anchors) settle(id, u => onAnchor(u, an))
        am++
        reach.forEach((iv, u) => { if (!settled[u] && fin[u] && iv.every(([, hi]) => doc[hi].page < am)) settle(u, onSettle) })
      }
      for (let u = 0; u < n; u++) settle(u, onSettle)
    },
  }
}
