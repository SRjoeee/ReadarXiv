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
// known before it is matched, from the marked original's head (anchors.mjs searchHead): a bounded unit its bounds; one whose
// marks do not bound it its own marks' pages and DRIFT beside; one without marks the gap it is searched in, between its
// neighbours with marks, MARGIN past their bounds, within the stretch of their own pages (a float of K words or more: that
// stretch, and its match over the whole document, floatMatches', made at step T); with no marks at all, the whole document.
// One thing is the whole document's still, and given: the frame (`frame`, pageFrame's rule reads every located unit, so
// pageFrame over a part's units alone is another frame: there is no default; anchors.mjs frameOfTokens', of arXiv's text
// alone, is final at step T and reads none). A unit is told in the part of its first rectangle's page.
//
// An original module (no port statement). Pure: no PDF.js, no `node:*` module.
import { bodyStart, buildIndexOf, DRIFT, edgesOf, forwardSpans, matchUnits, ownOfBounds, ownPlaces, ownWindow, placeUnits, searchHead, threeGrams } from './anchors.mjs'

/** a unit without marks is searched this far past its marked neighbours (anchors.mjs MARGIN) */
const MARGIN = 100

/**
 * Where each unit may reach, as token intervals [lo, hi] (at most two), by the units' order: before any unit is matched,
 * from the bounds, the own pages (anchors.mjs searchHead's rule; `own` its, by default the bounds' pages) and the floats'
 * whole-document matches alone. `bounds`, `floating`, `floatMatch`, `forward` anchorUnits' (`floatMatch` floatMatches' of
 * these units, every float of K words or more in it: one not in it is a shorter one's; under rule 5, `forward`, a float's
 * search of the whole document from the page of its last body neighbour on: the stretch that search takes where `forwardSpan`
 * (anchors.mjs forwardSpans') is given, else the document from that page)
 */
export function leftReach(doc, units, { bounds, own = null, floating = () => false, floatMatch = null, forward = null, forwardSpan = null }) {
  const N = doc.length
  const hard = units.map(u => bounds?.get(String(u.id)) ?? null)
  const head = searchHead(doc, units, { own: own ?? ownOfBounds(doc, bounds), floating, inFloat: forward }), place = ownPlaces(doc, units, head)
  return units.map((unit, u) => {
    const { id } = unit
    if (hard[u]) return [hard[u]]
    if (!N) return []
    if (!head.any) return [[0, N - 1]]
    if (head.own[u]) return [ownWindow(head, head.own[u])]
    // its gap between its neighbours, MARGIN past their bounds, within its stretch
    const [e, s] = edgesOf(head, hard, u, place)
    const lo = Math.max(head.rlo[u], e + 1 - MARGIN), hi = Math.min(head.rhi[u], s - 1 + MARGIN)
    const out = lo <= hi ? [[lo, hi]] : []
    // and a float of K words or more, its search over the whole document: its match given (floatMatches makes one for each such
    // float, none for a shorter one, which is searched between its neighbours alone), else anywhere; under rule 5 (`forward`),
    // from the page of its last body neighbour on (anchors.mjs matchUnits)
    if (floating(id) && (floatMatch ? floatMatch.has(id) : threeGrams(unit))) {
      if (forward) {
        // (the stretch its search from there takes, where its hits are known: forwardSpans'; else the document from there)
        const from = bodyStart(head, hard, u, doc), sp = forwardSpan ? forwardSpan(id, from) : from < N ? { lo: from, hi: N - 1 } : null
        if (sp) out.push([sp.lo, sp.hi])
      } else if (!floatMatch) out.push([0, N - 1])
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
export function leftOfPart(doc, units, { bounds, own = null, floating = () => false, floatMatch = null, frame, minCoverage = 0.6, forward = null, wholeIndex = null }, [a, b], reach = leftReach(doc, units, { bounds, own, floating, floatMatch, forward })) {
  if (typeof frame !== 'function') throw new TypeError('leftOfPart: `frame`, the whole document\'s frame rule (pageFrame over a part\'s units is not the whole paper\'s)')
  const { C, V2 } = partSets(doc, units, [a, b], reach)
  return leftOfSets(doc, units, { bounds, own, floating, floatMatch, frame, minCoverage, forward, wholeIndex }, [a, b], C.units, V2.units)
}

/**
 * leftOfPart's place, its sets made (C's units and V2's, rising: partSets'), C's units alone placed. `matched` (a Map unit →
 * matchUnits' match, a caller's across its parts): the matches made already, each made once — a unit's match is a function of
 * its own bounds, its neighbours', its text and the document's tokens in its window, all final once its match is (a range's
 * units' are: rangedAnchors); `known` matchUnits', the caller's bounds and neighbours of those units
 */
function leftOfSets(doc, units, { bounds, own = null, floating, floatMatch, frame, minCoverage = 0.6, forward, wholeIndex, known = null }, [a, b], cUnits, read, matched = null) {
  const todo = matched ? read.filter(u => !matched.has(u)) : read
  const fresh = todo.length ? matchUnits(doc, units, { minCoverage, bounds, own, floating, floatMatch, only: new Set(todo), forward, wholeIndex, known }) : null
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
 * every unit's anchor is anchorUnits' over the whole paper under the same `own`. Where each unit is searched is known before
 * any mark is read (anchors.mjs searchHead's rule, of `own`: the head's own pages of every unit with marks, which every unit
 * that is ever bounded must have): a unit with bounds has its match final once it is marked; one without, searched in its gap
 * (a float of K words or more, then over the whole document; one with marks on its own pages), once it is marked and every
 * unit its gap's walk meets is (anchors.mjs edgesOf: its neighbours with marks within its stretch, out to the first that bounds
 * it), or at once where its stretch meets its own pages nowhere (under rule 5, `forward`, a float once its last body neighbour
 * is too). The reach of a unit whose match is not final (conservative): its own pages, DRIFT either side, which hold its
 * bounds; its stretch, its gap once that is known; a float's match over the whole document (under rule 5, its search from each
 * page its body neighbour may end on). A unit without bounds is matched as soon as its match is final, and reaches where that match stands
 * from then on: a float's gap and its match pages apart linked every page the one met to the other's units. So a page waits only for the units whose own pages, or whose neighbours' own pages, meet
 * it: never for a unit TeX set pages on, numbered among its units (an affiliation, a figure's units), nor for a window between
 * neighbours known only once a later unit's marks are read (2610.21884v1's page 1 waited for its affiliation's marks on page
 * 31). `run(onAnchor, onSettle)`: the ranges anchored while ready,
 * each unit first framed on the page given to onAnchor(id, anchor), each unit whose match is final and reaches no later page
 * settled without one (onSettle(id)); past the last page every unit left is settled. A unit placed before the page anchored
 * and not settled is a defect of the readiness: thrown; so is a unit marked with bounds outside its own pages and their DRIFT,
 * or with no own pages. `units` in the order TeX sets them (the text's: a unit's neighbours are read in it, as anchors.mjs
 * matchUnits reads them), each by its id in every call (`own`'s keys, `mark`, `isMarked`, `isSettled`, onAnchor's and
 * onSettle's), its place in `units` within; `forward` the places of the units written inside a float
 */
export function rangedAnchors(doc, units, { own = null, floating = () => false, floatMatch = null, frame, forward = null } = {}) {
  if (typeof frame !== 'function') throw new TypeError('rangedAnchors: `frame`, the whole document\'s frame rule (leftOfPart\'s)')
  const n = units.length, N = doc.length
  const head = searchHead(doc, units, { own, floating, inFloat: forward })
  const { first: firstTok, last: lastTok, P: lastPage } = head
  const bounds = new Map(), marked = new Uint8Array(n), settled = new Uint8Array(n)
  let am = 1
  const unitOf = new Map(units.map((t, u) => [String(t.id), u]))
  const hard = new Array(n).fill(null)
  const tokPage = new Int32Array(N)
  for (let k = 0; k < N; k++) tokPage[k] = doc[k].page
  // (each unit's search, searchHead's: OWN, within its bounds or on its own pages, or anywhere where no unit has marks — final
  // once marked; GAP, between its neighbours — once they are too; WHOLE, a float over the whole document — from the start, under
  // rule 5 once its body neighbour is marked; and a WHOLE float's match over the whole document, floatMatch's, [fA, fB])
  const OWN = 0, GAP = 1, WHOLE = 2
  const kind = new Uint8Array(n), fA = new Int32Array(n).fill(-1), fB = new Int32Array(n).fill(-1)
  for (let u = 0; u < n; u++) {
    const id = units[u].id
    if (!head.any || head.own[u]) continue
    if (!(floating(id) && (floatMatch ? floatMatch.has(id) : threeGrams(units[u])))) { kind[u] = GAP; continue }
    kind[u] = WHOLE
    if (!floatMatch) { fA[u] = 0; fB[u] = N - 1 } else {
      const m = floatMatch.get(id)
      if (m?.length) { let a = Infinity, b = -Infinity; for (const k of m) { if (k < a) a = k; if (k > b) b = k } fA[u] = a; fB[u] = b }
    }
  }
  /** whether the units unit u's search reads besides its own marks are marked: a unit without bounds those its gap's walk
   *  meets (its gap final then: gapKnown; none for one with marks whose stretch meets its own pages nowhere), under rule 5 a
   *  WHOLE float its body neighbour too (its search's start: startKnown); its match is final once it is marked too */
  const isMarked = v => marked[v] === 1
  // (the gap's edges once every unit its walk meets is marked: made then, and kept)
  const gapKnown = u => {
    if (edged[u]) return true
    const g = edgesOf(head, hard, u, place, isMarked)
    if (!g) return false
    before[u] = g[0]; after[u] = g[1]; edged[u] = 1
    return true
  }
  const startKnown = u => { const v = head.bodyOf[u]; return v < 0 || marked[v] === 1 }
  const around = u => (kind[u] === OWN ? !head.any || head.apart[u] === 1 || hard[u] !== null || gapKnown(u) : gapKnown(u) && (kind[u] !== WHOLE || !forward || startKnown(u)))
  const isFinal = u => marked[u] === 1 && around(u)
  // (where each unit with marks stands by its words alone: a neighbour's edge where its marks do not bound it)
  const place = ownPlaces(doc, units, head)
  // (rule 5: a float's whole-document search from the page of its last body neighbour on; the whole document's index its
  // searches read, made once, and the stretches a float's search from a page on takes, of its hits there)
  const wholeIndex = forward ? { index: null } : null
  let spans = null
  const forwardSpan = (id, from) => (spans ??= forwardSpans(doc, units, floating, (wholeIndex.index ??= buildIndexOf(doc))))(id, from)
  const pageAfter = k => { let q = k; while (q < N && doc[q].page === doc[k].page) q++; return q }
  // ---- the matches' finality and the reaches of the marks known now (a run's), each unit's reach as page intervals, flat:
  // unit u's are ivA[j], ivB[j] for j from ivOff[u] to ivOff[u + 1]; maxB[u] the last page any of them reaches (-1: none),
  // minA[u] the first (past the last page: none). A final unit's gap and rule 5 start (matchUnits' `known`), made as it becomes so
  const fin = new Uint8Array(n), maxB = new Int32Array(n), minA = new Int32Array(n), ivOff = new Int32Array(n + 1)
  let ivA = new Int32Array(4 * n + 16), ivB = new Int32Array(4 * n + 16), m = 0, finCount = 0
  const before = new Int32Array(n), after = new Int32Array(n), edged = new Uint8Array(n), body = forward ? new Int32Array(n) : null
  const known = { head, hard, before, after, body }
  // (each unit's match once made: a range reads only units whose matches are final)
  const matched = new Map()
  const push = (a, b) => {
    if (m === ivA.length) { const A = new Int32Array(2 * m), B = new Int32Array(2 * m); A.set(ivA); B.set(ivB); ivA = A; ivB = B }
    ivA[m] = tokPage[a]; ivB[m] = tokPage[b]; m++
  }
  // (the units before u0 are final, their reaches kept as the flat arrays' first part: a final unit's reach never changes, so a
  // run makes the reaches from u0 on, the first unit not final at the last one)
  let u0 = 0
  const reachNow = () => {
    // (each unit's finality, and the gap and rule 5 start of those whose search's other units are marked)
    for (let u = u0; u < n; u++) {
      if (head.any && !hard[u] && !head.apart[u]) gapKnown(u)
      if (kind[u] === WHOLE && forward && startKnown(u)) body[u] = bodyStart(head, hard, u, doc)
      fin[u] = isFinal(u) ? 1 : 0
    }
    // the units newly final without bounds matched now, in one call: such a unit's match is final, and its reach is where it
    // stands (a float's match in its stretch or over the whole document, two places far apart, would link their pages: the first
    // page waited for every unit the float's other place met). Each unit is matched once, here or by a range (`matched`)
    const fresh = []
    for (let u = u0; u < n; u++) if (fin[u] && !hard[u] && !matched.has(u)) fresh.push(u)
    if (fresh.length) {
      const got = matchUnits(doc, units, { bounds, floating, floatMatch, only: new Set(fresh), forward, wholeIndex, known })
      for (const u of fresh) matched.set(u, got[u])
    }
    m = ivOff[u0]; finCount = u0
    for (let u = u0; u < n; u++) {
      const at = m
      ivOff[u] = at
      const f = fin[u] === 1
      // its reach (leftReach's once the units its search reads are marked): its bounds; once final, where its match stands;
      // its own pages; its gap between its neighbours, MARGIN past their bounds, within its stretch (before they are marked: the
      // stretch), and a float's search over the whole document; with no marks anywhere, the whole document
      if (!N) { /* no reach */ } else if (hard[u]) push(hard[u][0], hard[u][1])
      else if (f) {
        const mm = matched.get(u)?.m
        if (mm?.length) { let a = Infinity, b = -Infinity; for (const k of mm) { if (k < a) a = k; if (k > b) b = k } push(a, b) }
      } else if (!head.any) push(0, N - 1)
      else if (head.own[u]) { const [a, b] = ownWindow(head, head.own[u]); if (a <= b) push(a, b) } else {
        // (its gap once its neighbours are marked, else its stretch)
        const g = gapKnown(u), a = g ? Math.max(head.rlo[u], before[u] + 1 - MARGIN) : head.rlo[u], b = g ? Math.min(head.rhi[u], after[u] - 1 + MARGIN) : head.rhi[u]
        if (a <= b) push(a, b)
        // (a float's search over the whole document: its match; under rule 5, its search from its body neighbour's last page on,
        // or before that is marked from each page its end may stand on, the search from each taking the same stretch while the
        // page starts at or before its first hit: its own pages, or with no bounds the page before its last)
        if (kind[u] === WHOLE && !forward) { if (fA[u] >= 0) push(fA[u], fB[u]) } else if (kind[u] === WHOLE && startKnown(u)) { const sp = body[u] < N ? forwardSpan(units[u].id, body[u]) : null; if (sp) push(sp.lo, sp.hi) } else if (kind[u] === WHOLE) {
          const o = head.own[head.bodyOf[u]], top = firstTok[o[1]]
          for (let from = firstTok[Math.max(1, Math.min(o[0], o[1] - DRIFT))]; from <= top && from < N;) {
            const sp = forwardSpan(units[u].id, from)
            if (!sp) break
            if (sp.lo <= sp.hi) push(sp.lo, sp.hi)
            from = pageAfter(sp.first)
          }
        }
      }
      if (f) finCount++
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
  // ---- why the first page is not ready, kept (most runs fail there, waiting on one unit): a unit not final whose reach meets
  // `am` or the pages final units alone link to it (those that meet `am`, and those that meet their pages). A unit's reach
  // changes only when the units its search reads are marked (around), and a final unit's never again, so while `am` stands
  // and the unit is still not final, those units as they were, it is in V2 of `am` and the page is not ready: a run stops
  // there without making the reach again
  let witness = null
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
    for (let p = 1; p <= P; p++) F0[p] |= F1[p] | F2[p]
    prefix(F0)
    for (let u = 0; u < n; u++) if (!fin[u] && meets(u)) { witness = { am, u, around: around(u) }; return }
  }
  const stillWaits = () => witness !== null && witness.am === am && !isFinal(witness.u) && around(witness.u) === witness.around
  // (a unit's place in `units` by its id, and its id by its place: every call takes and gives the id)
  const placeOf = id => { const u = unitOf.get(String(id)); if (u === undefined) throw new RangeError(`rangedAnchors: no unit ${id}`); return u }
  const settle = (u, f) => { if (settled[u]) return; settled[u] = 1; f(units[u].id) }
  // (the places by their units' ids rising: a range's units, and those settled with none, are told in their ids' order, whatever
  // order the units are given in, so that a caller who decides them as told (the layout maker) decides them as it did before)
  const byIds = Int32Array.from(units.keys()).sort((x, y) => units[x].id - units[y].id)
  // (whether a mark changed since a run found nothing more ready: what a run reads is that alone)
  let dirty = true
  return {
    bounds, firstTok, lastTok, lastPage,
    /** the first page not anchored yet */
    get am() { return am },
    /** unit `id`'s bounds final: [first token, last token], or null for none */
    mark(id, b) {
      const u = placeOf(id)
      if (marked[u]) return
      if (b) {
        // (its bounds stand on its own marks' pages: the reach it had before them, which the pages anchored already were read under)
        const o = head.own[u]
        if (!o || tokPage[b[0]] < o[0] - DRIFT || tokPage[b[1]] > o[1] + DRIFT) throw new RangeError(`rangedAnchors: unit ${id} bounded on pages ${tokPage[b[0]]}-${tokPage[b[1]]}, its own pages ${o ? o.join('-') : 'none'}`)
        bounds.set(String(units[u].id), b); hard[u] = b
      }
      marked[u] = 1
      dirty = true
    },
    isMarked: id => marked[placeOf(id)] === 1,
    isSettled: id => settled[placeOf(id)] === 1,
    run(onAnchor, onSettle) {
      if (am > lastPage) { for (const u of byIds) settle(u, onSettle); return }
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
        // (a range's units are final: their gaps are those made as they became so)
        const got = leftOfSets(doc, units, { bounds, floating, floatMatch, frame, forward, wholeIndex, known }, [am, to], C, V2, matched)
        for (const id of got.before) if (!settled[placeOf(id)]) throw new Error(`the page stream passed over unit ${id}: placed before page ${am}, never anchored`)
        for (const [id, an] of [...got.anchors].sort((x, y) => x[0] - y[0])) settle(placeOf(id), i => onAnchor(i, an))
        am = to + 1
        for (const u of byIds) if (!settled[u] && fin[u] && maxB[u] < am) settle(u, onSettle)
      }
      for (const u of byIds) settle(u, onSettle)
    },
  }
}
