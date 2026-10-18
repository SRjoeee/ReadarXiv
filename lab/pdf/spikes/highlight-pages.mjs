// The highlight's layout made page by page (the shared reader view's contract §2.7, row SH1): a side whose layout was made
// whole (highlight.mjs layoutOf) is cut as the layer's wire carries it — its parts in page order by the doubling schedule,
// each with the views of its pages and the units first located in it (their line rectangles), and each page's left part
// (its tokens as the layout keeps them, the units' spans and their words' pairs) — and made again page by page through the
// view's shapes (shapes.mjs createShapes: the document part as the parts come, a page's part as its left part lands), the
// pages in a shuffled order and interleaved with the parts, some pages' geometry made before the parts that move the
// document part have come. Then every page's geometry and every sentence shape is held to the whole layout's, exactly.
// Used by highlight-gate.mjs on the ten papers, both sides, and by tests/pdf-reader/shapes.test.ts on a paper of its own.
import { partTarget } from '../../../src/pdf-reader/engine/layer-proto/format.mjs'
import { pageGeometry, runsOf, sentenceOf, sentencesFit } from '../../../src/pdf-reader/engine/view/highlight.mjs'
import { createShapes } from '../../../src/pdf-reader/engine/view/shapes.mjs'

/** a unit's tokens rising, each once, as page-local ranges [first, count, …] of the page whose tokens begin at `k0` */
function rangesOf(tokens, k0) {
  const out = []
  for (let i = 0; i < tokens.length; ) {
    let j = i + 1
    while (j < tokens.length && tokens[j] === tokens[j - 1] + 1) j++
    out.push(tokens[i] - k0, j - i)
    i = j
  }
  return out
}

/**
 * A side cut as the wire carries it, from its whole layout `L` (layoutOf's: `tok` and `pageStart`), the anchors it was
 * made of and its pages' views: { parts, lefts }. `parts` [{ pages: [a, b], views (stride 4, pages a … reach), left:
 * [id, stream, rects] }], each unit in the part holding its first rectangle's page, by id rising; `lefts[p]` page p's left
 * part as format.mjs readLeftPart gives it (its first token, its table, its spans and pairs), the table the whole layout's
 * own numbers. `pairsOf(id, anchor)`: the unit's word → token map shipped, null for none
 */
export function cutSide(L, anchors, views, { pairsOf = (_, a) => a.pairs ?? null } = {}) {
  const N = views.length
  const located = [...anchors].filter(([, a]) => a?.tokens?.length).sort((x, y) => x[0] - y[0])
  const parts = []
  for (let a = 1; a <= N; ) {
    const b = partTarget(a, N), left = []
    let reach = b
    for (const [id, u] of located) {
      const first = u.rects[0].page
      if (first < a || first > b) continue
      left.push([id, u.tokens[0], u.rects.map(r => [r.page, r.x0, r.y0, r.x1, r.y1])])
      for (const r of u.rects) if (r.page > reach) reach = r.page
    }
    parts.push({ pages: [a, b], views: views.slice(a - 1, reach).flat(), left })
    a = b + 1
  }
  const lefts = [null]
  for (let p = 1; p <= N; p++) {
    const k0 = L.pageStart[p], k1 = L.pageStart[p + 1], n = k1 - k0
    const table = { n }
    for (const f of ['l', 'r', 'y', 'h', 'top', 'bottom']) table[f] = L.tok[f].slice(k0, k1)
    const spans = [], pairs = []
    for (const [id, u] of located) {
      const on = u.tokens.filter(k => k >= k0 && k < k1)
      if (!on.length) continue
      spans.push([id, rangesOf(on, k0)])
      const map = pairsOf(id, u)
      if (!map) continue
      const ws = [...map].filter(([, k]) => k >= k0 && k < k1).sort((x, y) => x[0] - y[0])
      const runs = []
      for (const [w, k] of ws) {
        const last = runs.length - 3
        if (last >= 0 && runs[last] + runs[last + 2] === w && runs[last + 1] + runs[last + 2] === k - k0) runs[last + 2]++
        else runs.push(w, k - k0, 1)
      }
      if (runs.length) pairs.push([id, runs])
    }
    lefts.push({ kind: 'left', sha256: '', bytes: 0, page: p, first: k0, table, spans, pairs })
  }
  return { parts, lefts }
}

/** a seeded order (mulberry32), so that a gate's run is the same run again */
function shuffled(xs, seed) {
  let a = seed >>> 0
  const rand = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] }
  return out
}

/** where two values first differ (exactly: numbers by ===, typed arrays as arrays), as a path; null where they agree */
function differs(a, b, path = '') {
  if (a === b) return null
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return `${path}: ${a} against ${b}`
  if (ArrayBuffer.isView(a) || Array.isArray(a)) {
    if (!(ArrayBuffer.isView(b) || Array.isArray(b)) || a.length !== b.length) return `${path}: length ${a.length} against ${b?.length}`
    for (let i = 0; i < a.length; i++) { const d = differs(a[i], b[i], `${path}[${i}]`); if (d) return d }
    return null
  }
  if (a instanceof Map) {
    if (!(b instanceof Map) || a.size !== b.size) return `${path}: a map of ${a.size} against ${b?.size}`
    for (const [k, v] of a) { const d = differs(v, b.get(k), `${path}.get(${k})`); if (d) return d }
    return null
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) { const d = differs(a[k], b[k], `${path}.${k}`); if (d) return d }
  return null
}

/** a page's geometry as the comparison reads it: its runs, each unit's runs, the heads, the fills, and its lines and who
 *  owns each token and line (what its floats are made of) */
const geometryOf = g => ({ runs: g.runs, byId: g.byId, heads: g.heads, filled: g.filled, lines: g.at.lines, owner: g.at.owner, lineOwner: g.at.lineOwner })

/**
 * SH1. `L` the side's whole layout, `anchors` and `views` what it was made of, `kindOf` its units' kinds; `starts` the
 * units lit by sentence on it and their starts there (the whole layout's, anchors.mjs sentenceStarts), `sentences(id)` the
 * text and offsets they were found by, which the page-made side finds its own by (its units' pairs, shapes.mjs). `seed` the
 * pages' order. { pages, runs, sentences, starts, extra, differ }: what was compared, the units the page-made side finds
 * starts of that the whole did not (its pairs read where the whole refused them: the producer ships pairs only where the
 * whole reads them), and every difference, at most 20 listed
 */
export function pagesAgree(L, anchors, views, kindOf, { starts = new Map(), sentences = () => null, seed = 1, pairsOf } = {}) {
  const { parts, lefts } = cutSide(L, anchors, views, { pairsOf })
  const N = views.length, h = createShapes({ kindOf }), added = new Set(), differ = []
  // each part, then half the pages it covers not yet given, rounded up (their geometry made at once, under a document
  // part the later parts move)
  for (const [i, part] of parts.entries()) {
    h.addParts([part])
    const covered = []
    for (let p = 1; p <= part.pages[1]; p++) if (!added.has(p)) covered.push(p)
    for (const p of shuffled(covered, seed + i).slice(0, (covered.length + 1) >> 1)) { h.addPage(lefts[p]); added.add(p); pageGeometry(h.layout, p) }
  }
  for (const p of shuffled(Array.from({ length: N }, (_, i) => i + 1).filter(p => !added.has(p)), seed + parts.length)) h.addPage(lefts[p])
  const out = { pages: N, runs: 0, sentences: 0, starts: 0, extra: 0, differ }
  const note = d => { if (differ.length < 20) differ.push(d) }
  for (let p = 1; p <= N; p++) {
    const a = pageGeometry(L, p), b = pageGeometry(h.layout, p)
    out.runs += a.runs.length
    const d = differs(geometryOf(a), geometryOf(b), `page ${p}`)
    if (d) note(d)
  }
  for (const [id, st] of starts) {
    const s = sentences(id)
    const got = s && h.starts(id, s.text, s.offsets)
    out.starts++
    const d = differs(st, got, `#${id} starts`)
    if (d) { note(d); continue }
    if (sentencesFit(L, id, st) !== sentencesFit(h.layout, id, got)) note(`#${id}: fits ${sentencesFit(L, id, st)} against ${sentencesFit(h.layout, id, got)}`)
    const ra = runsOf(L, id), rb = runsOf(h.layout, id)
    for (let r = 0; r < ra.length; r++) for (let j = 0; j <= st.length; j++) {
      out.sentences++
      const e = differs(sentenceOf(L, ra[r], st, j, 2.25), rb[r] && sentenceOf(h.layout, rb[r], got, j, 2.25), `#${id} run ${r} sentence ${j}`)
      if (e) note(e)
    }
  }
  // the units whose pairs the page-made side reads where the whole did not
  for (const [id, a] of anchors) {
    if (starts.has(id) || !a?.pairs) continue
    const s = sentences(id)
    if (s && h.starts(id, s.text, s.offsets)) out.extra++
  }
  return out
}
