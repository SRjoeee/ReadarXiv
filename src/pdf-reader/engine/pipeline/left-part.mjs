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
import { buildIndexOf, forwardSpans, matchUnits, pageStarts, placeUnits } from './anchors.mjs'

/** a unit without marks is searched this far past its marked neighbours (anchors.mjs MARGIN) */
const MARGIN = 100

/**
 * Where each unit may reach, as token intervals [lo, hi] (at most two), by the units' order: before any unit is matched,
 * from the bounds and the floats' whole-document matches alone. `bounds`, `floating`, `floatMatch`, `forward` anchorUnits'
 * (`floatMatch` floatMatches' of these units, every float of K words or more in it: one not in it is a shorter one's; under
 * rule 5, `forward`, a float's search of the whole document from the page of its last body neighbour on: the stretch that
 * search takes where `forwardSpan` (anchors.mjs forwardSpans') is given, else the document from that page)
 */
export function leftReach(doc, units, { bounds, floating = () => false, floatMatch = null, forward = null, forwardSpan = null }) {
  const N = doc.length
  const hard = units.map(u => bounds?.get(String(u.id)) ?? null)
  const before = [], after = [], body = []
  const inText = u => hard[u] && !floating(units[u].id)
  for (let u = 0, e = -1, b = -1; u < units.length; u++) { before[u] = e; body[u] = b; if (inText(u)) { e = hard[u][1]; if (forward && !forward.has(u)) b = hard[u][1] } }
  for (let u = units.length - 1, a = N; u >= 0; u--) { after[u] = a; if (inText(u)) a = hard[u][0] }
  const start = forward ? pageStarts(doc) : null
  return units.map(({ id }, u) => {
    if (hard[u]) return [hard[u]]
    if (!N) return []
    if (!bounds?.size) return [[0, N - 1]]
    const out = []
    const lo = Math.max(0, before[u] + 1 - MARGIN), hi = Math.min(N - 1, after[u] - 1 + MARGIN)
    if (lo <= hi) out.push([lo, hi])
    // a float's search over the whole document (one of K words or more): its match given (floatMatches makes one for each
    // such float, none for a shorter one, which is only looked for between its neighbours), else anywhere; under rule 5
    // (`forward`), from the page of its last body neighbour on (anchors.mjs matchUnits)
    if (floating(id) && forward) {
      // (the stretch its search from there takes, where its hits are known: forwardSpans'; else the document from there)
      if (!floatMatch || floatMatch.has(id)) { const from = start(body[u]), sp = forwardSpan ? forwardSpan(id, from) : { lo: from, hi: N - 1 }; if (sp) out.push([sp.lo, sp.hi]) }
    } else if (floating(id)) {
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
export function leftOfPart(doc, units, { bounds, floating = () => false, floatMatch = null, frame, minCoverage = 0.6, forward = null, wholeIndex = null }, [a, b], reach = leftReach(doc, units, { bounds, floating, floatMatch, forward })) {
  if (typeof frame !== 'function') throw new TypeError('leftOfPart: `frame`, the whole document\'s frame rule (pageFrame over a part\'s units is not the whole paper\'s)')
  const { C, V2 } = partSets(doc, units, [a, b], reach)
  return leftOfSets(doc, units, { bounds, floating, floatMatch, frame, minCoverage, forward, wholeIndex }, [a, b], C.units, V2.units)
}

/**
 * leftOfPart's place, its sets made (C's units and V2's, rising: partSets'), C's units alone placed. `matched` (a Map unit →
 * matchUnits' match, a caller's across its parts): the matches made already, each made once — a unit's match is a function of
 * its own bounds, its neighbours', its text and the document's tokens in its window, all final once its match is (a range's
 * units' are: rangedAnchors); `known` matchUnits', the caller's bounds and neighbours of those units
 */
function leftOfSets(doc, units, { bounds, floating, floatMatch, frame, minCoverage = 0.6, forward, wholeIndex, known = null }, [a, b], cUnits, read, matched = null) {
  const todo = matched ? read.filter(u => !matched.has(u)) : read
  const fresh = todo.length ? matchUnits(doc, units, { minCoverage, bounds, floating, floatMatch, only: new Set(todo), forward, wholeIndex, known }) : null
  if (matched) for (const u of todo) matched.set(u, fresh[u])
  const found = matched ? read.map(u => matched.get(u)) : read.map(u => fresh[u])
  const at = new Map(read.map((u, j) => [u, j]))
  const placed = placeUnits(doc, read.map(u => units[u]), found, { frame, only: new Set(cUnits.map(u => at.get(u))) })
  const out = new Map(), before = []
  for (const u of cUnits) {
    const { id } = units[u], anchor = placed.get(id)
    const first = anchor?.rects?.[0]?.page
    if (anchor && first >= a && first <= b) out.set(id, anchor)
    else if (anchor && first < a) before.push(id)
  }
  return { anchors: out, read, before }
}

/** each unit's reach (leftReach's) as page intervals, for partSets: made once for the parts that read one reach */
export const pageReach = (doc, reach) => reach.map(iv => iv.map(([lo, hi]) => [doc[lo].page, doc[hi].page]))

/**
 * What the left of pages a to b reads (leftOfPart's): the units that may touch those pages (C), those that may touch theirs
 * (V1), and those that may touch V1's (V2), each { units: indices into `units`, pages: a flag a page }, from `reach`
 * (leftReach's, or any reach that holds each unit's)
 */
export function partSets(doc, units, [a, b], reach, ivs = pageReach(doc, reach)) {
  const N = doc.length ? doc[doc.length - 1].page : 0
  /** the pages a unit may reach, as page intervals */
  const pagesOf = u => ivs[u]
  /** the units whose reach meets a set of pages (a flag a page), and the set of pages theirs makes */
  const meeting = pages => {
    const sum = new Int32Array(N + 2)
    for (let p = 1; p <= N; p++) sum[p] = sum[p - 1] + (pages[p] ? 1 : 0)
    // (the pages the units met reach, as a difference a page: a reach of the whole document costs two writes, not its pages)
    const units_ = [], diff = new Int32Array(N + 2), next = new Uint8Array(N + 2)
    for (let u = 0; u < units.length; u++) {
      const iv = pagesOf(u)
      if (!iv.some(([x, y]) => sum[Math.min(y, N)] - sum[Math.max(x, 1) - 1] > 0)) continue
      units_.push(u)
      for (const [x, y] of iv) { const a = Math.max(x, 1), b = Math.min(y, N); if (a <= b) { diff[a]++; diff[b + 1]-- } }
    }
    for (let p = 1, run = 0; p <= N; p++) { run += diff[p]; if (run > 0) next[p] = 1 }
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
 * given to onAnchor(id, anchor), each unit whose match is final and reaches no later page settled without one (onSettle(id));
 * past the last page every unit left is settled. A unit placed before the page anchored and not settled is a defect of the
 * readiness: thrown. `units` in the order TeX sets them (the text's: a unit's neighbours are read in it, as anchors.mjs
 * matchUnits reads them), each by its id in every call (`mark`, `own`, `isMarked`, `isSettled`, onAnchor's and onSettle's), its
 * place in `units` within; `forward` the places of the units written inside a float
 */
export function rangedAnchors(doc, units, { floating = () => false, floatMatch = null, frame, boundsKnown = null, forward = null } = {}) {
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
  // (what a run reads of each unit, as arrays a run reads without a lookup: its bounds once final, whether it floats and where
  // its match over the whole document lies (`floating` and floatMatch are the units' own, read once), each token's page)
  const unitOf = new Map(units.map((t, u) => [String(t.id), u]))
  const hasB = new Uint8Array(n), bS = new Int32Array(n), bE = new Int32Array(n)
  const isFloat = new Uint8Array(n), fA = new Int32Array(n).fill(-1), fB = new Int32Array(n).fill(-1), searched = new Uint8Array(n)
  for (let u = 0; u < n; u++) {
    const id = units[u].id
    if (!floating(id)) continue
    isFloat[u] = 1
    searched[u] = !floatMatch || floatMatch.has(id) ? 1 : 0
    if (!floatMatch) { fA[u] = 0; fB[u] = N - 1 } else {
      const m = floatMatch.get(id)
      if (m?.length) { let a = Infinity, b = -Infinity; for (const k of m) { if (k < a) a = k; if (k > b) b = k } fA[u] = a; fB[u] = b }
    }
  }
  const tokPage = new Int32Array(N)
  for (let k = 0; k < N; k++) tokPage[k] = doc[k].page
  // (the units in the text with bounds, a bit each: a unit's nearest such neighbours, leftReach's, found without a scan)
  const textBits = new Uint32Array((n + 31) >>> 5)
  const hard = new Array(n).fill(null)
  const setBounds = (k, b) => {
    bounds.set(k, b)
    const u = unitOf.get(k)
    if (u === undefined) return
    hasB[u] = 1; bS[u] = b[0]; bE[u] = b[1]; hard[u] = b
    if (!isFloat[u]) textBits[u >>> 5] |= 1 << (u & 31)
  }
  // (and the units not yet marked: a unit's nearest such one either side)
  const openBits = new Uint32Array((n + 31) >>> 5)
  for (let u = 0; u < n; u++) openBits[u >>> 5] |= 1 << (u & 31)
  const prevOf = (bitsOf, u) => {
    const i = u - 1
    if (i < 0) return -1
    let w = i >>> 5, bits = bitsOf[w] & (0xffffffff >>> (31 - (i & 31)))
    while (!bits) { if (--w < 0) return -1; bits = bitsOf[w] }
    return (w << 5) + 31 - Math.clz32(bits)
  }
  const nextOf = (bitsOf, u) => {
    const i = u + 1
    if (i >= n) return -1
    let w = i >>> 5, bits = bitsOf[w] & (~0 << (i & 31))
    while (!bits) { if (++w >= bitsOf.length) return -1; bits = bitsOf[w] }
    return (w << 5) + 31 - Math.clz32(bits & -bits)
  }
  const prevText = u => prevOf(textBits, u), nextText = u => nextOf(textBits, u)
  // (rule 5: a float's whole-document search from the page of its last body neighbour, a unit not written inside a float, on;
  // the whole document's index its searches read, made once)
  const start = forward ? pageStarts(doc) : null, wholeIndex = forward ? { index: null } : null
  const body = u => !forward?.has(u)
  // (the stretches a float's search from a page on takes, of its hits in the whole document's index, made once)
  let spans = null
  const forwardSpan = (id, from) => (spans ??= forwardSpans(doc, units, floating, (wholeIndex.index ??= buildIndexOf(doc))))(id, from)
  const pageAfter = k => { let q = k; while (q < N && doc[q].page === doc[k].page) q++; return q }
  // ---- the matches' finality and the reaches of the marks known now (a run's), each unit's reach as page intervals, flat:
  // unit u's are ivA[j], ivB[j] for j from ivOff[u] to ivOff[u + 1]; maxB[u] the last page any of them reaches (-1: none),
  // minA[u] the first (past the last page: none)
  const fin = new Uint8Array(n), maxB = new Int32Array(n), minA = new Int32Array(n), ivOff = new Int32Array(n + 1)
  let ivA = new Int32Array(4 * n + 16), ivB = new Int32Array(4 * n + 16), m = 0, finCount = 0
  const before = new Int32Array(n), after = new Int32Array(n), bodyEnd = new Int32Array(n)
  const pendBefore = new Uint8Array(n), pendAfter = new Uint8Array(n), lo = new Int32Array(n), hi = new Int32Array(n)
  const pendBody = forward ? new Uint8Array(n) : null, bodyLow = forward ? new Int32Array(n) : null, bodyHigh = forward ? new Int32Array(n) : null
  const push = (a, b) => {
    if (m === ivA.length) { const A = new Int32Array(2 * m), B = new Int32Array(2 * m); A.set(ivA); B.set(ivB); ivA = A; ivB = B }
    ivA[m] = tokPage[a]; ivB[m] = tokPage[b]; m++
  }
  // (the units before u0 are final, their reaches kept as the flat arrays' first part: a final unit's reach never changes, so a
  // run makes the reaches from u0 on, the first unit not final at the last one)
  let u0 = 0
  const reachNow = () => {
    // the scans' state at u0: every unit before it is marked, so none is pending; the end of the last bounded unit in the text
    // before it (and of its last body one, rule 5)
    const e0 = prevText(u0), E0 = e0 >= 0 ? bE[e0] : -1
    let B0 = -1
    if (forward) for (let v = u0 - 1; v >= 0; v--) if (hasB[v] && !isFloat[v] && !forward.has(v)) { B0 = bE[v]; break }
    // leftReach's neighbours: the end of the last bounded unit in the text before each unit (and of its last body one, rule 5);
    // whether a unit still to be marked lies between it and that neighbour, the earliest end it may get to (and under rule 5 the
    // same of its body neighbours)
    for (let u = u0, e = E0, b = B0, pend = 0, low = E0, pb = 0, lb = B0, hb = B0; u < n; u++) {
      before[u] = e; bodyEnd[u] = b; pendBefore[u] = pend; lo[u] = low
      if (forward) { pendBody[u] = pb; bodyLow[u] = lb; bodyHigh[u] = hb }
      const text = hasB[u] === 1 && isFloat[u] === 0
      if (text) { e = low = bE[u]; pend = 0; if (forward && !forward.has(u)) b = bE[u] } else if (!marked[u]) { pend = 1; if (!isFloat[u] && ownLow[u]) low = Math.min(low, firstTok[ownLow[u]]) }
      if (forward && body(u)) {
        if (text) { pb = 0; lb = hb = bE[u] } else if (!marked[u] && !isFloat[u] && ownLow[u]) { pb = 1; lb = Math.min(lb, firstTok[ownLow[u]]); hb = Math.max(hb, lastTok[ownHigh[u]]) } else if (!marked[u] && !isFloat[u]) pb = 1
      }
    }
    // the start of the first bounded unit after it; the same on that side, the latest start
    for (let u = n - 1, a = N, pend = 0, high = N; u >= u0; u--) {
      after[u] = a; pendAfter[u] = pend; hi[u] = high
      if (hasB[u] === 1 && isFloat[u] === 0) { a = high = bS[u]; pend = 0 } else if (!marked[u]) { pend = 1; if (!isFloat[u] && ownHigh[u]) high = Math.max(high, lastTok[ownHigh[u]]) }
    }
    m = ivOff[u0]; finCount = u0
    const any = bounds.size > 0
    for (let u = u0; u < n; u++) {
      const at = m
      ivOff[u] = at
      const float = isFloat[u] === 1
      // its reach were its match final (leftReach's): its bounds; with none, the window between its bounded neighbours and a
      // float's search over the whole document (rule 5: from its last body neighbour's page on); with no bounds at all, the
      // whole document
      if (hasB[u]) push(bS[u], bE[u])
      else if (N && !any) push(0, N - 1)
      else if (N) {
        const a = Math.max(0, before[u] + 1 - MARGIN), b = Math.min(N - 1, after[u] - 1 + MARGIN)
        if (a <= b) push(a, b)
        if (float && forward) { if (searched[u]) { const sp = forwardSpan(units[u].id, start(bodyEnd[u])); if (sp) push(sp.lo, sp.hi) } } else if (float && fA[u] >= 0) push(fA[u], fB[u])
      }
      fin[u] = marked[u] && (hasB[u] || (!pendBefore[u] && !pendAfter[u] && !(forward && float && pendBody[u]))) ? 1 : 0
      if (fin[u]) finCount++
      else {
        // (not final: the window it may yet have, its own marks' pages, and under rule 5 a float's search from each page its last
        // body neighbour may end on: the search from a page taking the same stretch while the page starts at or before its first
        // hit)
        const a = Math.max(0, lo[u] + 1 - MARGIN), b = Math.min(N - 1, hi[u] - 1 + MARGIN)
        if (a <= b) push(a, b)
        if (!marked[u] && ownLow[u] && firstTok[ownLow[u]] <= lastTok[ownHigh[u]]) push(firstTok[ownLow[u]], lastTok[ownHigh[u]])
        if (forward && float && N && searched[u]) {
          const top = start(bodyHigh[u])
          for (let from = start(bodyLow[u]); from <= top;) {
            const sp = forwardSpan(units[u].id, from)
            if (!sp) break
            if (sp.lo <= sp.hi) push(sp.lo, sp.hi)
            from = pageAfter(sp.first)
          }
        }
      }
      let mx = -1, mn = lastPage + 1
      for (let j = at; j < m; j++) { if (ivB[j] > mx) mx = ivB[j]; if (ivA[j] < mn) mn = ivA[j] }
      maxB[u] = mx; minA[u] = mn
    }
    ivOff[n] = m
    while (u0 < n && fin[u0]) u0++
  }
  // ---- partSets over the flat reach, its arrays made once: the units meeting the pages flagged (`list`, rising, where given)
  // and the pages their reach makes (`next`)
  const P = lastPage
  const sum = new Int32Array(P + 2), diff = new Int32Array(P + 2), F0 = new Uint8Array(P + 2), F1 = new Uint8Array(P + 2), F2 = new Uint8Array(P + 2)
  // (and the first and last page flagged: a unit whose reach lies wholly before or after them meets none, told without its
  // intervals)
  let fLo = 0, fHi = -1
  const prefix = pages => {
    fLo = P + 1; fHi = 0
    for (let p = 1; p <= P; p++) { sum[p] = sum[p - 1] + pages[p]; if (pages[p]) { if (p < fLo) fLo = p; fHi = p } }
  }
  const meets = u => {
    if (maxB[u] < fLo || minA[u] > fHi) return false
    for (let j = ivOff[u]; j < ivOff[u + 1]; j++) if (sum[Math.min(ivB[j], P)] - sum[Math.max(ivA[j], 1) - 1] > 0) return true
    return false
  }
  // (`final`: false, as soon as a unit not final meets them, where only that is asked)
  const meet = (pages, next, list, final = false) => {
    prefix(pages)
    diff.fill(0)
    for (let u = 0; u < n; u++) {
      if (!meets(u)) continue
      if (final && !fin[u]) return false
      if (list) list.push(u)
      for (let j = ivOff[u]; j < ivOff[u + 1]; j++) { const x = Math.max(ivA[j], 1), y = Math.min(ivB[j], P); if (x <= y) { diff[x]++; diff[y + 1]-- } }
    }
    next.fill(0)
    for (let p = 1, run = 0; p <= P; p++) { run += diff[p]; if (run > 0) next[p] = 1 }
    return true
  }
  const part = (a, b) => { F0.fill(0); for (let p = Math.max(a, 1); p <= Math.min(b, P); p++) F0[p] = 1 }
  /** whether every unit the left of pages a to b reads (V2) has its match final: C and V1 are in V2, so a unit of theirs not
   *  final answers before V2 is made */
  const ready = (a, b) => {
    part(a, b)
    if (!meet(F0, F1, null, true) || !meet(F1, F2, null, true)) return false
    prefix(F2)
    for (let u = 0; u < n; u++) if (!fin[u] && meets(u)) return false
    return true
  }
  /** the left of pages a to b's C and V2 (units, rising) */
  const setsOf = (a, b) => { const C = [], V2 = []; part(a, b); meet(F0, F1, C); meet(F1, F2, null); meet(F2, F0, V2); return [C, V2] }
  // ---- why the first page is not ready, kept (most runs fail there, waiting on one unit): a unit not final whose reach, as
  // far as it is known exactly without a run (a unit not yet marked: its own marks' pages, a float's match over the whole
  // document, its window between its bounded neighbours; one marked without bounds while a unit not yet marked stands between it
  // and a bounded neighbour: its window and a float's match), meets `am` or the pages final units alone link to it (those that
  // meet `am`, and those that meet their pages). A final unit's reach never changes again (its bounds and its neighbours' are
  // final), so while `am` stands and the unit still is so, it is in V2 of `am` and the page is not ready: a run stops there
  // without making the reach again
  let witness = null
  const ownPages = u => (ownLow[u] && firstTok[ownLow[u]] <= lastTok[ownHigh[u]] ? [tokPage[firstTok[ownLow[u]]], tokPage[lastTok[ownHigh[u]]]] : null)
  const floatPages = u => (isFloat[u] && !hasB[u] && !forward && N && fA[u] >= 0 && bounds.size > 0 ? [tokPage[fA[u]], tokPage[fB[u]]] : null)
  // (leftReach's window of a unit without bounds, between its nearest bounded neighbours in the text)
  const windowPages = u => {
    if (hasB[u] || !N || !bounds.size) return null
    const e = prevText(u), j = nextText(u)
    const a = Math.max(0, (e >= 0 ? bE[e] : -1) + 1 - MARGIN), b = Math.min(N - 1, (j >= 0 ? bS[j] : N) - 1 + MARGIN)
    return a <= b ? [tokPage[a], tokPage[b]] : null
  }
  const linked = (L, iv) => iv !== null && L[Math.min(iv[1], P)] - L[Math.max(iv[0], 1) - 1] > 0
  // (a unit marked without bounds is not final while a unit not yet marked stands between it and a bounded neighbour in the
  // text: that unit, -1 for none)
  const pendingBy = u => {
    const e = prevText(u), z = prevOf(openBits, u)
    if (z >= 0 && z > e) return z
    const j = nextText(u), y = nextOf(openBits, u)
    return y >= 0 && (j < 0 || y < j) ? y : -1
  }
  const waits = (L, u) => {
    if (!marked[u]) return linked(L, ownPages(u)) || linked(L, floatPages(u)) || linked(L, windowPages(u))
    return !hasB[u] && pendingBy(u) >= 0 && (linked(L, windowPages(u)) || linked(L, floatPages(u)))
  }
  const stillWaits = () => witness !== null && witness.am === am && waits(witness.L, witness.u)
  const findWitness = () => {
    witness = null
    // (the pages linked to `am` by final units: `am`, the pages of the final units meeting it, of those meeting theirs)
    const finalMeet = (pages, next) => {
      prefix(pages)
      diff.fill(0)
      for (let u = 0; u < n; u++) {
        if (!fin[u] || !meets(u)) continue
        for (let j = ivOff[u]; j < ivOff[u + 1]; j++) { const x = Math.max(ivA[j], 1), y = Math.min(ivB[j], P); if (x <= y) { diff[x]++; diff[y + 1]-- } }
      }
      next.fill(0)
      for (let p = 1, run = 0; p <= P; p++) { run += diff[p]; if (run > 0) next[p] = 1 }
    }
    part(am, am); finalMeet(F0, F1); finalMeet(F1, F2)
    const L = new Int32Array(P + 2)
    for (let p = 1; p <= P; p++) L[p] = L[p - 1] + (F0[p] | F1[p] | F2[p])
    for (let u = 0; u < n; u++) if (waits(L, u)) { witness = { am, u, L }; return }
  }
  // (a unit's place in `units` by its id, and its id by its place: every call takes and gives the id)
  const placeOf = id => { const u = unitOf.get(String(id)); if (u === undefined) throw new RangeError(`rangedAnchors: no unit ${id}`); return u }
  const settle = (u, f) => { if (settled[u]) return; settled[u] = 1; f(units[u].id) }
  // (the places by their units' ids rising: a range's units, and those settled with none, are told in their ids' order, whatever
  // order the units are given in, so that a caller who decides them as told (the layout maker) decides them as it did before)
  const byIds = Int32Array.from(units.keys()).sort((x, y) => units[x].id - units[y].id)
  // (whether a mark, a bound or a unit's own pages changed since a run found nothing more ready: what a run reads is that alone)
  let dirty = true
  // (each unit's match once made: a range reads only units whose matches are final)
  const matched = new Map()
  return {
    bounds, firstTok, lastTok, lastPage,
    /** a bound set outside `mark` (a pair of marks no unit's: bounds.size, matchUnits' switch) */
    bound(key, b) { setBounds(key, b); dirty = true },
    /** the first page not anchored yet */
    get am() { return am },
    /** unit `id`'s own marks' pages while its bounds are not final: the least and the last (0: it has none) */
    own(id, low, high) { const u = placeOf(id); if (ownLow[u] !== low || ownHigh[u] !== high) dirty = true; ownLow[u] = low; ownHigh[u] = high },
    /** unit `id`'s bounds final: [first token, last token], or null for none */
    mark(id, b) {
      const u = placeOf(id)
      if (marked[u]) return
      if (b) setBounds(String(units[u].id), b)
      marked[u] = 1
      openBits[u >>> 5] &= ~(1 << (u & 31))
      markedCount++
      dirty = true
    },
    isMarked: id => marked[placeOf(id)] === 1,
    isSettled: id => settled[placeOf(id)] === 1,
    run(onAnchor, onSettle) {
      if (am > lastPage || !(bounds.size > 0 || (boundsKnown ? boundsKnown() : markedCount === n))) {
        if (am > lastPage) for (const u of byIds) settle(u, onSettle)
        return
      }
      if (!dirty || stillWaits()) return
      dirty = false
      // (the matches' finality and the reaches are those of the marks known now, whatever page the ranges reach)
      reachNow()
      while (am <= lastPage) {
        // the pages from `am` anchored in one range as far as every unit the range reads has its match final (a range's
        // anchors are the whole paper's, as a page at a time would make them: leftOfPart)
        if (!ready(am, am)) { findWitness(); return }
        let to = am
        if (finCount === n) to = lastPage
        else while (to < lastPage && ready(am, to + 1)) to++
        const [C, V2] = setsOf(am, to)
        // (a range's units are final: their neighbours are the scans', fixed since they became so)
        const got = leftOfSets(doc, units, { bounds, floating, floatMatch, frame, forward, wholeIndex, known: { hard, before, after, body: forward ? bodyEnd : null } }, [am, to], C, V2, matched)
        for (const id of got.before) if (!settled[placeOf(id)]) throw new Error(`the page stream passed over unit ${id}: placed before page ${am}, never anchored`)
        for (const [id, an] of [...got.anchors].sort((x, y) => x[0] - y[0])) settle(placeOf(id), i => onAnchor(i, an))
        am = to + 1
        for (const u of byIds) if (!settled[u] && fin[u] && maxB[u] < am) settle(u, onSettle)
      }
      for (const u of byIds) settle(u, onSettle)
    },
  }
}
