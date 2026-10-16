// The page pass (E2b, the prepare-pipeline design §2.2 steps T and 3 to 8): a paper's layer (bundle 4) made from the marked
// original's marks and arXiv's PDF, and told a part at a time to its host: the left (anchorUnits under the unit marks, leftSideOf),
// the layout file (makeLayout, its operator lists read once for the add-on's plans too), the add-on chained over the parts
// (layout/chain.mjs chainedAddon over the host's remover), and the cut (layer-proto/cut.mjs partCutter, cutBundle's own), each
// part judged as it is cut: the carry's share of the lines of its marked pages (CARRY_MIN) and its own reader's reading of it
// (readPart), a part refused either way the same pages with no layout. Under today's rules the frame, the column edges and the
// far-push columns read the whole document, so every part is cut once the whole is known (stage 1: one flush at the end); the
// parts are then cutBundle's of the same whole, byte for byte, wherever no verdict refuses one. What a part holds at most, and
// what the pass holds of arXiv's ink (GLYPHS_PAGE glyphs and OPS_CAP boxes a page, a page past either dark): docs/PDF-READER.md
// §19.6.
//
// An original module (no port statement). It imports the engine's own modules alone, by relative path.
import { BundleRefusal } from '../layer-proto/bundle.mjs'
import { PART_PAGES_MAX, partCutter, wholeCutter, wholeFrontier } from '../layer-proto/cut.mjs'
import { groupsOfUnits, indexOf, partTarget, readHead, readPart, readUnitsChunk, TOKEN_LIMIT, writeHead, writeUnitChunks } from '../layer-proto/format.mjs'
import { needBound } from '../layer-proto/need.mjs'
import { bundleUnitsOf } from '../layer-proto/units.mjs'
import { readArxivText } from '../layout/arxiv.mjs'
import { chainedAddon } from '../layout/chain.mjs'
import { CARRY_MIN, makerOf } from '../layout/make.mjs'
import { displayEdges, unitText } from '../translate/mt.mjs'
import { anchorUnits, boundsFromMarks, floatMatches, pageFrame } from './anchors.mjs'
import { leftSideOf } from './left-side.mjs'
import { isMemoryError } from './memory.mjs'

/** units TeX sets away from where the source has them (anchors.mjs `floating`), as the maker and the web's left take them */
const FLOATING = new Set(['caption', 'footnote', 'cell', 'figure'])
const why = e => String(e?.message ?? e).slice(0, 200)
/** a value a left part's wire carries: finite, within ±TOKEN_LIMIT */
const fits = v => Number.isFinite(v) && v >= -TOKEN_LIMIT && v <= TOKEN_LIMIT

/**
 * arXiv's tokens the left is anchored on: step T's, less any token a left part's wire cannot carry (a field not finite or past
 * ±TOKEN_LIMIT: a crafted transform's), each kept token's ink edges with it. Where none is dropped (every paper of the corpus),
 * step T's own arrays
 */
function fitted(text) {
  const { tokens, edges, spans } = text
  const keep = []
  for (let k = 0; k < tokens.length; k++) {
    const w = tokens[k]
    const x0 = Number.isFinite(spans.x0[k]) ? spans.x0[k] : w.x, x1 = Number.isFinite(spans.x1[k]) ? spans.x1[k] : x0
    if (fits(x0) && fits(x1) && fits(w.x) && fits(w.x + w.w) && (w.sym == null || fits(w.sym)) && fits(w.y) && fits(w.h) && fits(w.top) && fits(w.bottom)) keep.push(k)
  }
  if (keep.length === tokens.length) return { tokens, edges }
  return { tokens: keep.map(k => tokens[k]), edges: { l: Float64Array.from(keep, k => edges.l[k]), r: Float64Array.from(keep, k => edges.r[k]) } }
}

/**
 * A paper's layer made and told part by part. `paper` { id, version }; `source` openPaper's paper (its units, ids their
 * indices); `marks` layout/paper.mjs layoutMarksOfPaper's result ({ marks, unitMarks }, or { refused }: no layout, the left by
 * the units' text alone); `arxiv` { doc, text? }: a PDF.js document of arXiv's PDF (the caller's to open and destroy) and its
 * text as readArxivText read it (step T), else read here; `OPS` PDF.js's operator codes; `pdfjs` its version; `base` { bytes,
 * sha256, xref } of arXiv's PDF (the head's); `image` the compiler image's name; `remove({ from, to, plans })` the remover's
 * transport (chain.mjs), null for none (no part has an add-on, M20). `frame`: the frame's rule both anchorings are placed
 * under (anchors.mjs pageFrame, today's); `columns`: the left's far-push columns' rule (view/highlight.mjs, today's).
 * `verdicts` (default on): each part judged as it is cut, the carry's share of its marked pages' lines at least CARRY_MIN
 * (the last part's to the marked original's end) and its reader taking it; off, the parts are cutBundle's of the same whole.
 *
 * Under today's rules the maker's frame and the columns' edges read the whole document, so every part is cut at the end
 * (stage 1). `oracle` { frame, columnEdges } (tests and the lab: what a whole run of the same paper gave, `capture`'s): the
 * maker's frame predicate and edges given, the maker made a page at a time (layout/make.mjs stream), arXiv's ink let go as
 * its pages are done, and each part cut as soon as everything it reads is final (`stats.closed`: each part's pages and the
 * arXiv page read when it was cut); the same parts. `capture` (an object): the whole run's maker frame predicate and edges
 * written there, an oracle's
 *
 * Told in order: `onHead(head, units)` (the head and the units' chunks), then for each part its left parts (`onLeft(written)`,
 * each page's once) and the part (`onPart(written, note)`), each awaited. `note`: { pages, layout: 'kept' | 'none' |
 * { refused, ... }, lines: [carried, total] of its marked pages }. Returns { through, count, stats: { left, layout, plans,
 * addon } }, or { refused: 'anchors', why } before anything is told (arXiv's PDF read for no unit, or not read). A failed
 * allocation is thrown; a throw of the maker's is the layout's (none, `stats.layout`), never the paper's
 */
export async function layerOfPaper({ paper, source, marks, arxiv, OPS, pdfjs, base, image, remove = null, onHead = null, onLeft, onPart, verdicts = true, frame = pageFrame, columns = undefined, oracle = null, capture = null }) {
  if (typeof onLeft !== 'function' || typeof onPart !== 'function') throw new TypeError('onLeft, onPart: the host\'s sinks')
  if (!Number.isInteger(base?.bytes) || typeof base?.sha256 !== 'string' || !Number.isInteger(base?.xref)) throw new TypeError('base: arXiv\'s PDF\'s bytes, digest and startxref')
  const { doc } = arxiv
  const N = doc.numPages
  const text = arxiv.text ?? await readArxivText(doc)
  if (text.pages !== N) throw new TypeError(`arXiv's text is of ${text.pages} pages, its document of ${N}`)
  const units = source.units
  const texts = units.map((u, i) => ({ id: i, ...unitText(u.pieces), ...displayEdges(u) }))
  const floating = id => FLOATING.has(units[id]?.kind ?? '')
  const unitMarks = marks && 'marks' in marks ? marks.unitMarks : null

  // the left: anchored on arXiv's tokens the wire carries, under the unit marks (none: the units' text alone)
  const unread = text.views.findIndex((v, i) => v == null || !text.ok[i])
  if (unread >= 0) return { refused: 'anchors', why: `arXiv's PDF could not be read for the left: page ${unread + 1}` }
  const left = fitted(text)
  const leftFloats = left.tokens === text.tokens ? floatMatches(text.tokens, texts, floating) : floatMatches(left.tokens, texts, floating)
  const anchors = anchorUnits(left.tokens, texts, { ...(unitMarks ? { bounds: boundsFromMarks(left.tokens, unitMarks) } : {}), floating, floatMatch: leftFloats, frame })
  const side = leftSideOf({ doc: left.tokens, views: text.views, anchors, edges: left.edges, ...(columns ? { columns } : {}) })
  if (side.units.length === 0) return { refused: 'anchors', why: 'the anchors located no unit on arXiv\'s PDF' }
  const floatMatch = left.tokens === text.tokens ? leftFloats : floatMatches(text.tokens, texts, floating)
  const bundle = bundleUnitsOf(source)

  // the maker, of the marks and arXiv's PDF (its operator lists read once, for the plans too); its refusal, or its throw, the
  // layout's alone
  let made = null, maker = null
  if (marks && 'marks' in marks) {
    const makerFrame = oracle ? () => oracle.frame : capture ? (d, ms) => { capture.frame = frame(d, ms); return capture.frame } : frame
    try {
      maker = await makerOf({ units, marks: marks.marks, arxiv: doc, OPS, paper, left: '', pdfjs, text, floatMatch, frame: makerFrame, plans: true, parts: true, ...(oracle ? { columnEdges: oracle.columnEdges } : {}) })
      if (maker.refused) { made = { refused: maker.refused, stats: maker.stats }; maker = null }
    } catch (e) {
      if (isMemoryError(e)) throw e
      made = { refused: 'failed', why: why(e) }
      maker = null
    }
  } else made = { refused: marks?.refused ?? 'marks' }

  const ctx = { paper, N, base, image, remove, pdfjs, onHead, onLeft, onPart, verdicts, side, bundle, made }
  if (maker && oracle) {
    // (the maker's throws are the layout's, its own calls' alone: a sink's, the reader's or the cutter's go on as themselves)
    let st = null
    try {
      const refused = maker.carrying()
      if (refused) ctx.made = { refused, stats: maker.stats }
      else st = maker.stream()
    } catch (e) {
      if (isMemoryError(e)) throw e
      ctx.made = { refused: 'failed', why: why(e) }
    }
    if (st) return streamed(ctx, maker, st, marks.marks.marking.lineskip ?? null)
    return cutWhole(ctx, null)
  }
  // (stage 1: the whole made first)
  let r = null
  if (maker) {
    try {
      for (let p = 1; p <= N; p++) await maker.readPage(p)
      r = await maker.whole()
      if (capture) capture.columnEdges = maker.edges()
      ctx.made = 'file' in r ? { stats: r.stats, ...(r.plansFailed ? { plansFailed: r.plansFailed } : {}) } : { refused: r.refused, stats: r.stats }
    } catch (e) {
      if (isMemoryError(e)) throw e
      ctx.made = { refused: 'failed', why: why(e) }
      r = null
    }
  }
  return cutWhole(ctx, r && 'file' in r ? r : null)
}

/** the carry's share of the lines of marked pages a to b of N (to the marked original's end with the paper's last) */
function linesOf(lines, N, a, b) {
  let carried = 0, total = 0
  for (const [p, [c, t]] of lines) if (p >= a && (b === N || p <= b)) { carried += c; total += t }
  return [carried, total]
}

/** each part judged as it is cut (verdicts): its marked pages' carried share, then its reader reading it after the parts
 *  before (`state.chain`) against the head and chunks told (`state.index`); the reading kept (`state.read`) */
function verdictOf(state, lines, N) {
  return async ({ pages: [a, b], written }) => {
    const [carried, total] = linesOf(lines, N, a, b)
    if (total > 0 && carried < CARRY_MIN * total) return { refused: 'carry', lines: [carried, total] }
    try { state.read = await readPart(written.bytes, { ref: written.ref, index: state.index, chain: state.chain }) } catch (e) {
      if (isMemoryError(e) || !(e instanceof BundleRefusal)) throw e
      return { refused: 'read', why: why(e) }
    }
    return null
  }
}
/** the head and chunks read as a reader reads them: the index the parts are read against */
async function indexOfHead(head, chunks) {
  const told = []
  for (const c of chunks) told.push(await readUnitsChunk(c.bytes, { ref: c.ref, before: told.at(-1) ?? null }))
  return indexOf(await readHead(head.bytes, { ref: head.ref }), told)
}
/** a part told: its reading checked (a part the verdict refused is cut again with no layout: its reader must take that one,
 *  or the cut is wrong), its left parts, then the part */
async function tell(ctx, state, cutter, part, layout, lines) {
  const i = cutter.parts.length - 1, refused = cutter.verdicts[i]
  if (ctx.verdicts) {
    if (state.read?.sha256 !== part.sha256) {
      try { state.read = await readPart(part.bytes, { ref: part.ref, index: state.index, chain: state.chain }) } catch (e) {
        if (isMemoryError(e)) throw e
        throw new Error(`part ${i} (pages ${part.from} to ${part.to}) is refused by its own reader: ${why(e)}`)
      }
    }
    state.chain = state.read.chain
  }
  for (const l of part.leftParts) await ctx.onLeft(l)
  await ctx.onPart(part, { pages: [part.from, part.to], layout: refused ?? (layout ? 'kept' : 'none'), lines: linesOf(lines, ctx.N, part.from, part.to) })
}

/** stage 1: the parts of a paper made whole (`r`, the maker's, or null: no layout), cut by cutBundle's own cutter */
async function cutWhole(ctx, r) {
  const { paper, N, base, image, remove, pdfjs, side, bundle } = ctx
  const layout = r?.file ?? null, plans = r?.plans ?? null, lines = r?.lines ?? new Map()
  const hooks = layout && remove ? chainedAddon({ N, views: side.pages, base: { bytes: base.bytes, xref: base.xref }, planOf: p => plans?.get(p) ?? null, pdfjs, remove }) : null
  const state = { index: null, chain: null, read: null }
  const whole = { paper: { ...paper, pages: N }, base, versions: { image }, units: bundle, left: { pages: side.pages, units: side.units }, layout }
  const { units: chunks, head, cutter, known } = await wholeCutter(whole, { leftPages: side.leftPages, base, image, ...(hooks ? { chainAddon: hooks.chainAddon, acceptAddon: hooks.acceptAddon } : {}), verdict: ctx.verdicts ? verdictOf(state, lines, N) : null })
  if (ctx.verdicts) state.index = await indexOfHead(head, chunks)
  if (ctx.onHead) await ctx.onHead(head, chunks)
  for (;;) {
    state.read = null
    const part = await cutter.next(known)
    if (part === null) break
    await tell(ctx, state, cutter, part, layout, lines)
  }
  return { through: N, count: cutter.parts.length, stats: { left: side.stats, layout: ctx.made, plans: plans ? { pages: plans.size, dirty: [...plans.values()].filter(p => p.remove).length } : null, addon: hooks ? hooks.state() : null } }
}

/**
 * The oracle's pass: the maker made a page at a time (`maker`, carried: its stream), each part cut as soon as everything it
 * reads is final. What a part reads (layer-proto/cut.mjs partCutter): K's entries up to the frontier of its last page, their
 * table groups whole, its pages' need bounds, and every page those reach, with their indices in K; so a part is cut once
 * (1) every page it, its pages' need bounds and its entries reach (`R`) is let go by the maker and no unit still to settle
 * may have a left rectangle up to R, (2) no unit still to settle has a slot in K up to the last entry it takes or any entry
 * on those pages, and (3) every member of the table groups of those entries is settled. K, F and the need bounds are then
 * those of the whole paper on what the part reads (cutBundle's)
 */
async function streamed(ctx, maker, st, lineskip) {
  const { paper, N, base, image, remove, pdfjs, side, bundle } = ctx
  const lines = maker.pageLines()
  const units = await writeUnitChunks({ paper, units: bundle })
  const head = await writeHead({ paper: { ...paper, pages: N }, base: { bytes: base.bytes, sha256: base.sha256, xref: base.xref }, image, units, lineskip })
  const hooks = remove ? chainedAddon({ N, views: side.pages, base: { bytes: base.bytes, xref: base.xref }, planOf: p => st.plans?.get(p) ?? null, pdfjs, remove }) : null
  const state = { index: ctx.verdicts ? await indexOfHead(head, units) : null, chain: null, read: null }
  const cutter = partCutter({ paper, N, head, views: side.pages, leftPages: side.leftPages, addon: null, ...(hooks ? { chainAddon: hooks.chainAddon, acceptAddon: hooks.acceptAddon } : {}), verdict: ctx.verdicts ? verdictOf(state, lines, N) : null, retain: false })
  if (ctx.onHead) await ctx.onHead(head, units)
  // each unit's slot in K (a left unit's stream, a layout-only one the last left stream of a smaller id's, and a half), its
  // first left page, and its table group
  const n = bundle.length, slot = new Float64Array(n), leftFirst = new Int32Array(n).fill(N + 1)
  {
    const stream = new Map(side.units.map(w => [w[0], w[1]]))
    let before = -1
    for (let i = 0; i < n; i++) {
      const s = stream.get(i)
      slot[i] = s === undefined ? before + 0.5 : s
      if (s !== undefined && s > before) before = s
    }
    for (const w of side.units) for (const r of w[2]) leftFirst[w[0]] = Math.min(leftFirst[w[0]], r[0])
  }
  const grouped = groupsOfUnits(bundle), members = new Map()
  for (let i = 0; i < n; i++) { const g = grouped.of[i]; if (g >= 0) (members.get(g) ?? members.set(g, []).get(g)).push(i) }
  const closed = []
  let X = 0
  /** the pages done: let go by the maker, and before every unit still to settle's first left rectangle */
  const frontier = () => {
    let H = st.released()
    for (let i = 0; i < n; i++) if (!st.settled(i) && leftFirst[i] - 1 < H) H = leftFirst[i] - 1
    return H
  }
  const close = async final => {
    for (;;) {
      const a = cutter.from
      if (a > N) return
      const H = final ? N : frontier()
      if (!final && Math.min(partTarget(a, N), a + PART_PAGES_MAX - 1) > H) return
      const layout = st.layout()
      const whole = { paper: { ...paper, pages: N }, units: bundle, left: { pages: side.pages, units: side.units }, layout }
      const { K, F } = wholeFrontier(whole)
      const NB = needBound(K, N)
      if (!final && !closable(K, F, NB, a, H)) return
      state.read = null
      const part = await cutter.next({ K, F, NB, layout })
      if (part === null) return
      closed.push([part.from, part.to, X])
      await tell(ctx, state, cutter, part, layout, lines)
      // (what the parts after it read of the units it told is K's alone; its pages' names and plans are done)
      st.tell(K.slice(0, (part.to === N ? K.length - 1 : F[part.to]) + 1).map(e => e.id), part.to)
    }
  }
  /** what part from `a` reads is final (the conditions above), its target as the cutter makes it */
  const closable = (K, F, NB, a, H) => {
    let target = Math.min(partTarget(a, N), a + PART_PAGES_MAX - 1)
    const limit = Math.min(N, a + PART_PAGES_MAX - 1)
    for (let q = a, m = 0, turns = 0; turns <= N; turns++) {
      for (; q <= target; q++) m = Math.max(m, NB[q])
      const next = Math.min(m, limit)
      if (next <= target) break
      target = next
    }
    // (the paper's last page: the part takes every entry left, the whole)
    if (target >= N) return false
    const upTo = F[target]
    let R = target
    for (let q = a; q <= target; q++) R = Math.max(R, NB[q])
    for (let k = 0; k <= upTo; k++) R = Math.max(R, K[k].last)
    for (let grew = true; grew;) { grew = false; for (const e of K) if (e.first <= R && e.last > R) { R = e.last; grew = true } }
    if (R > H) return false
    let sigma = upTo >= 0 ? K[upTo].slot : -Infinity
    const groups = new Set()
    K.forEach((e, k) => {
      if (k > upTo && !(e.first <= R)) return
      if (e.slot > sigma) sigma = e.slot
      if (e.group !== null) groups.add(e.group)
    })
    for (let i = 0; i < n; i++) if (!st.settled(i) && slot[i] <= sigma) return false
    for (const g of groups) for (const i of members.get(g) ?? []) if (!st.settled(i)) return false
    return true
  }
  // the maker's calls alone caught: a throw of its own is the layout's, from then on (design §3): the parts not yet told cut
  // with none, the parts told standing; nothing is told twice
  let failed = null
  const making = async f => {
    try { await f() } catch (e) {
      if (isMemoryError(e)) throw e
      failed = why(e) || 'failed' // (a throw with no message is a failure all the same)
    }
  }
  for (let p = 1; p <= N && !failed; p++) {
    await making(async () => { await maker.readPage(p); X = p; st.pageRead(p) })
    if (!failed) await close(false)
  }
  if (!failed) await making(() => st.finish())
  if (!failed) await close(true)
  else {
    // (K as the settled units and the left give it: the prefix told stands, the rest is left entries and units settled)
    const layout = st.layout()
    const whole = { paper: { ...paper, pages: N }, units: bundle, left: { pages: side.pages, units: side.units }, layout }
    const { K, F } = wholeFrontier(whole)
    const known = { K, F, NB: needBound(K, N), layout: null }
    for (;;) {
      state.read = null
      const part = await cutter.next(known)
      if (part === null) break
      closed.push([part.from, part.to, X])
      await tell(ctx, state, cutter, part, null, lines)
    }
  }
  return { through: N, count: cutter.parts.length, stats: { left: side.stats, layout: failed ? { refused: 'failed', why: failed, stats: maker.stats } : { stats: maker.stats, ...(st.plansFailed() ? { plansFailed: st.plansFailed() } : {}) }, plans: st.plans ? { pages: st.plans.size, dirty: [...st.plans.values()].filter(q => q.remove).length } : null, addon: hooks ? hooks.state() : null, closed } }
}
