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
import { CARRY_MIN, makerOf, rulesOf } from '../layout/make.mjs'
import { markedPages, marksOfHead, readMarked } from '../layout/marks.mjs'
import { displayEdges, unitText } from '../translate/mt.mjs'
import { columnsOfTokens, pageColumns } from '../view/highlight.mjs'
import { anchorUnits, boundsFromMarks, floatMatches, frameOfTokens, pageFrame, pageIndex } from './anchors.mjs'
import { rangedAnchors } from './left-part.mjs'
import { leftSideOf, leftSideStream } from './left-side.mjs'
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
 * under (anchors.mjs pageFrame, today's); `columns`: the left's far-push columns' rule (view/highlight.mjs, today's). `rules`
 * (layout/make.mjs RULES, today's each where not given): `frame` 'tokens' both anchorings under the frame of arXiv's text alone
 * (rule 1, anchors.mjs frameOfTokens, made once), `edges` 'earlier' the maker's columns' edges of the pages before a page and
 * its own alone (rule 3), `columns` 'tokens' the left's far push under the columns of arXiv's text alone (rule 4,
 * view/highlight.mjs columnsOfTokens); a rule given there is taken over `frame` and `columns`.
 * `verdicts` (default on): each part judged as it is cut, the carry's share of its marked pages' lines at least CARRY_MIN
 * (the last part's to the marked original's end) and its reader taking it; off, the parts are cutBundle's of the same whole.
 *
 * `marked` { doc, log, options } in place of `marks`: the marked original to be read here (a PDF.js document of it, the
 * caller's to open and destroy, its last pass's log, markedPages' options but the units and the operator codes): read whole
 * first (readMarked, as the prepare's marks stage reads it; its refusal the marks'), or under the oracle a page at a time.
 *
 * Under today's rules the maker's frame and the columns' edges read the whole document, so every part is cut at the end
 * (stage 1). `oracle` (tests and the lab: what a whole run of the same paper gave, `capture`'s): { frame, columnEdges }, the
 * maker's frame predicate and edges given, the maker made a page at a time (layout/make.mjs stream), arXiv's ink let go as
 * its pages are done, and each part cut as soon as everything it reads is final (`stats.closed`: each part's pages and the
 * arXiv page read when it was cut); the same parts. With `marked`, also { leftFrame, columns }, the left's frame predicate
 * and its pages' columns: the marked original read a page at a time beside arXiv's (its page p + 1 before arXiv's page p),
 * the left anchored by ranges as the unit marks' pages are read (stage 2's streaming; markedStream). `capture` (an object):
 * the whole run's four rules written there, an oracle's
 *
 * Told in order: `onHead(head, units)` (the head and the units' chunks), then for each part its left parts (`onLeft(written)`,
 * each page's once) and the part (`onPart(written, note)`), each awaited. `note`: { pages, layout: 'kept' | 'none' |
 * { refused, ... }, lines: [carried, total] of its marked pages }. Returns { through, count, stats: { left, layout, plans,
 * addon } }, or { refused: 'anchors', why } before anything is told (arXiv's PDF read for no unit, or not read). A failed
 * allocation is thrown; a throw of the maker's is the layout's (none, `stats.layout`), never the paper's
 */
export async function layerOfPaper({ paper, source, marks = null, marked = null, arxiv, OPS, pdfjs, base, image, remove = null, onHead = null, onLeft, onPart, verdicts = true, frame: frameGiven = pageFrame, columns: columnsGiven = undefined, rules: rulesGiven = null, oracle = null, capture = null }) {
  const rules = rulesOf(rulesGiven)
  if (typeof onLeft !== 'function' || typeof onPart !== 'function') throw new TypeError('onLeft, onPart: the host\'s sinks')
  if (marks && marked) throw new TypeError('marks or marked: the marked original read, or to be read here, not both')
  if (!Number.isInteger(base?.bytes) || typeof base?.sha256 !== 'string' || !Number.isInteger(base?.xref)) throw new TypeError('base: arXiv\'s PDF\'s bytes, digest and startxref')
  const { doc } = arxiv
  const N = doc.numPages
  const text = arxiv.text ?? await readArxivText(doc)
  if (text.pages !== N) throw new TypeError(`arXiv's text is of ${text.pages} pages, its document of ${N}`)
  const units = source.units
  const texts = units.map((u, i) => ({ id: i, ...unitText(u.pieces), ...displayEdges(u) }))
  const floating = id => FLOATING.has(units[id]?.kind ?? '')

  // the left: anchored on arXiv's tokens the wire carries, under the unit marks (none: the units' text alone)
  const unread = text.views.findIndex((v, i) => v == null || !text.ok[i])
  if (unread >= 0) return { refused: 'anchors', why: `arXiv's PDF could not be read for the left: page ${unread + 1}` }
  const left = fitted(text)
  const leftFloats = left.tokens === text.tokens ? floatMatches(text.tokens, texts, floating) : floatMatches(left.tokens, texts, floating)
  const floatMatch = left.tokens === text.tokens ? leftFloats : floatMatches(text.tokens, texts, floating)
  const bundle = bundleUnitsOf(source)
  // the rule set's frame and columns, of arXiv's text alone where it says so (rules 1 and 4: made once, at step T), each side's
  // of its own tokens; else the rules given (today's)
  const frameOn = tokens => (rules.frame === 'tokens' ? (F => () => F)(frameOfTokens(tokens)) : frameGiven)
  const frame = frameOn(text.tokens), leftFrameRule = left.tokens === text.tokens ? frame : frameOn(left.tokens)
  const columns = rules.columns === 'tokens' ? views => columnsOfTokens(left.tokens, views) : columnsGiven
  // (the marked original to be read here: a page at a time beside arXiv's under the oracle, else whole first, readMarked as the
  // prepare's marks stage reads it, its refusal or throw the marks' refusal)
  const markedOptions = marked ? { ...marked.options, units, OPS } : null
  if (marked && oracle) {
    const r = await markedStream({ paper, units, texts, floating, text, left, leftFloats, floatMatch, bundle, marked, markedOptions, doc, N, OPS, pdfjs, base, image, remove, onHead, onLeft, onPart, verdicts, oracle, rules })
    if (r) return r
    marks = { refused: 'marks' }
  } else if (marked) {
    try { marks = await readMarked(marked.doc, marked.log, markedOptions) } catch (e) {
      if (isMemoryError(e)) throw e
      marks = { refused: 'marks' }
    }
  }
  const unitMarks = marks && 'marks' in marks ? marks.unitMarks : null
  const leftFrame = capture ? (d, ms) => { capture.leftFrame = leftFrameRule(d, ms); return capture.leftFrame } : leftFrameRule
  const anchors = anchorUnits(left.tokens, texts, { ...(unitMarks ? { bounds: boundsFromMarks(left.tokens, unitMarks) } : {}), floating, floatMatch: leftFloats, frame: leftFrame })
  const leftColumns = capture ? (v, a, k) => { capture.columns = (columns ?? pageColumns)(v, a, k); return capture.columns } : columns
  const side = leftSideOf({ doc: left.tokens, views: text.views, anchors, edges: left.edges, ...(leftColumns ? { columns: leftColumns } : {}) })
  if (side.units.length === 0) return { refused: 'anchors', why: 'the anchors located no unit on arXiv\'s PDF' }

  // the maker, of the marks and arXiv's PDF (its operator lists read once, for the plans too); its refusal, or its throw, the
  // layout's alone
  let made = null, maker = null
  if (marks && 'marks' in marks) {
    const makerFrame = oracle ? () => oracle.frame : capture ? (d, ms) => { capture.frame = frame(d, ms); return capture.frame } : frame
    try {
      maker = await makerOf({ units, marks: marks.marks, arxiv: doc, OPS, paper, left: '', pdfjs, text, floatMatch, frame: makerFrame, plans: true, parts: true, rules, ...(oracle ? { columnEdges: oracle.columnEdges } : {}) })
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
    if (st) return streamed(ctx, { maker, st, lineskip: marks.marks.marking.lineskip ?? null, left: wholeLeft(side), drive: arxivDrive(maker, st, N) })
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

/** the left anchored whole before the maker (stage 1's oracle): every unit's anchor final */
const wholeLeft = side => ({ pages: side.pages, leftPages: side.leftPages, units: () => side.units, stats: side.stats, done: () => true, all: () => true, frontier: () => Infinity, firstTok: () => Infinity })

/**
 * The oracle's pass: the maker made a page at a time (`st`, its stream; null: no layout, the left alone), the left whole
 * (wholeLeft) or anchored by ranges as the marked original's pages are read (streamingLeft), each part cut as soon as everything
 * it reads is final. What a part reads (layer-proto/cut.mjs partCutter): K's entries up to the frontier of its last page, their
 * table groups whole, its pages' need bounds, and every page those reach, with their indices in K; so a part is cut once
 * (1) every page it, its pages' need bounds and its entries reach (`R`) is let go by the maker and anchored by the left, no unit
 * whose left anchor is final but whose rows are still to be made may have a left rectangle up to R, and none whose rows are
 * made but whose left anchor is not yet final has a row up to R; (2) no unit not yet in K for good (its rows or its left anchor
 * still to come) may get a slot up to the last entry the part takes or any entry on its pages (a left anchor not final: its
 * stream at least the left's first token still to be anchored, or the last stream of a smaller id's and a half), and no
 * layout-only entry there takes its slot after a unit whose left anchor is not final (it may still change); (3) every member
 * of the table groups of those entries is in K for good; and (4) the carry's refusal is known (the marked original read a page
 * at a time: for parts, once a line is carried). K, F and the need bounds are then those of the whole paper on what the part
 * reads (cutBundle's). The head is told once a unit is located on the left (else the paper is refused, telling nothing, as
 * the whole run refuses it). `drive({ making, close, read })` reads the pages: the maker's calls in `making` (a throw of its
 * own is the layout's), `close()` after each step, `read(p)` with arXiv's page p read
 */
async function streamed(ctx, { maker, st, lineskip, left, drive }) {
  const { paper, N, base, image, remove, pdfjs, bundle } = ctx
  const lines = maker ? maker.pageLines() : new Map()
  const units = await writeUnitChunks({ paper, units: bundle })
  const head = await writeHead({ paper: { ...paper, pages: N }, base: { bytes: base.bytes, sha256: base.sha256, xref: base.xref }, image, units, lineskip })
  const hooks = remove && st ? chainedAddon({ N, views: left.pages, base: { bytes: base.bytes, xref: base.xref }, planOf: p => st.plans?.get(p) ?? null, pdfjs, remove }) : null
  const state = { index: ctx.verdicts ? await indexOfHead(head, units) : null, chain: null, read: null }
  const cutter = partCutter({ paper, N, head, views: left.pages, leftPages: left.leftPages, addon: null, ...(hooks ? { chainAddon: hooks.chainAddon, acceptAddon: hooks.acceptAddon } : {}), verdict: ctx.verdicts ? verdictOf(state, lines, N) : null, retain: false })
  let headTold = false
  const tellHead = async () => {
    if (headTold) return true
    if (!left.units().length) return false
    if (ctx.onHead) await ctx.onHead(head, units)
    headTold = true
    return true
  }
  await tellHead()
  // each unit's table group
  const n = bundle.length
  const grouped = groupsOfUnits(bundle), members = new Map()
  for (let i = 0; i < n; i++) { const g = grouped.of[i]; if (g >= 0) (members.get(g) ?? members.set(g, []).get(g)).push(i) }
  const closed = []
  let X = 0
  const settled = i => !st || st.settled(i)
  /** whether unit i is in K for good: its left anchor final and its rows made (or none) */
  const inK = i => left.done(i) && settled(i)
  const kIds = () => { const out = []; for (let i = 0; i < n; i++) if (inK(i)) out.push(i); return out }
  /** where the left stands: each located unit's stream and first left page, the least slot in K each unit may get, and the
   *  smallest unit whose left anchor is not final */
  const leftNow = () => {
    const stream = new Map(), first = new Map()
    for (const w of left.units()) { stream.set(w[0], w[1]); let f = N + 1; for (const r of w[2]) f = Math.min(f, r[0]); first.set(w[0], f) }
    const slotLow = new Float64Array(n), low = left.firstTok(left.frontier())
    let uMin = n
    for (let i = 0, before = -1; i < n; i++) {
      const s = stream.get(i)
      if (!left.done(i)) { if (uMin === n) uMin = i; slotLow[i] = Math.min(low, before + 0.5) } else slotLow[i] = s === undefined ? before + 0.5 : s
      if (s !== undefined && s > before) before = s
    }
    return { first, slotLow, uMin }
  }
  /** the least page unit i's rows name (its lines', its placeholders' segments', its labels') */
  const rowLeast = i => {
    const L = st.layout([i])
    let m = N + 1
    for (const [, v] of L.lines) for (let j = 0; j < v.length; j += 8) m = Math.min(m, v[j])
    for (const r of L.ph) for (let j = 4; j < r.length; j += 6) m = Math.min(m, r[j])
    for (const r of L.labels) m = Math.min(m, r[2])
    return m
  }
  /** the pages done: let go by the maker and anchored by the left, before every unit's first left rectangle whose rows are
   *  still to be made, and before every row of a unit whose left anchor is not final */
  const frontier = now => {
    let H = st ? st.released() : N
    if (!left.all()) H = Math.min(H, left.frontier() - 1)
    for (let i = 0; i < n; i++) {
      if (left.done(i) && !settled(i)) { const f = now.first.get(i) ?? N + 1; if (f - 1 < H) H = f - 1 } else if (!left.done(i) && st && settled(i)) H = Math.min(H, rowLeast(i) - 1)
    }
    return H
  }
  const close = async final => {
    for (;;) {
      const a = cutter.from
      if (a > N) return
      if (!(await tellHead())) return
      if (!final && st && (!st.carryKnown() || st.carryRefusal())) return
      const now = leftNow()
      const H = final ? N : frontier(now)
      if (!final && Math.min(partTarget(a, N), a + PART_PAGES_MAX - 1) > H) return
      const layout = st ? st.layout(kIds()) : null
      const whole = { paper: { ...paper, pages: N }, units: bundle, left: { pages: left.pages, units: left.units() }, layout }
      const { K, F } = wholeFrontier(whole)
      const NB = needBound(K, N)
      if (!final && !closable(K, F, NB, a, H, now)) return
      state.read = null
      const part = await cutter.next({ K, F, NB, layout })
      if (part === null) return
      closed.push([part.from, part.to, X])
      await tell(ctx, state, cutter, part, layout, lines)
      // (what the parts after it read of the units it told is K's alone; its pages' names and plans are done)
      if (st) st.tell(K.slice(0, (part.to === N ? K.length - 1 : F[part.to]) + 1).map(e => e.id), part.to)
    }
  }
  /** what part from `a` reads is final (the conditions above), its target as the cutter makes it */
  const closable = (K, F, NB, a, H, now) => {
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
    for (let i = 0; i < n; i++) if (!inK(i) && now.slotLow[i] <= sigma) return false
    if (now.uMin < n) for (const e of K) if (e.slot <= sigma && !e.left && e.id > now.uMin) return false
    for (const g of groups) for (const i of members.get(g) ?? []) if (!inK(i)) return false
    return true
  }
  // the maker's calls alone caught: a throw of its own is the layout's, from then on (design §3): the parts not yet told cut
  // with none, the parts told standing; nothing is told twice
  let failed = null
  const making = async f => {
    if (failed || !st) return
    try { await f() } catch (e) {
      if (isMemoryError(e)) throw e
      failed = why(e) || 'failed' // (a throw with no message is a failure all the same)
    }
  }
  await drive({ making, close: () => (failed ? null : close(false)), read: p => { X = p }, failed: () => failed })
  // (the carry refused at the marked original's end: nothing was told with a layout, every part is cut with none)
  const carry = st && !failed ? st.carryRefusal() : null
  if (st && !failed && !carry) await making(() => st.finish())
  if (st && !failed && !carry) await close(true)
  else {
    // (K as the units in it for good and the left give it: the prefix told stands, the rest is left entries and units settled;
    // with no layout at all, the left's alone)
    if (!(await tellHead())) return { refused: 'anchors', why: 'the anchors located no unit on arXiv\'s PDF' }
    const layout = st && failed ? st.layout(kIds()) : null
    const whole = { paper: { ...paper, pages: N }, units: bundle, left: { pages: left.pages, units: left.units() }, layout }
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
  if (!headTold) return { refused: 'anchors', why: 'the anchors located no unit on arXiv\'s PDF' }
  const layoutStats = failed ? { refused: 'failed', why: failed, ...(maker ? { stats: maker.stats } : {}) } : carry ? { refused: carry, stats: maker.stats } : st ? { stats: maker.stats, ...(st.plansFailed() ? { plansFailed: st.plansFailed() } : {}) } : ctx.made
  return { through: N, count: cutter.parts.length, stats: { left: left.stats, layout: layoutStats, plans: st?.plans ? { pages: st.plans.size, dirty: [...st.plans.values()].filter(q => q.remove).length } : null, addon: hooks ? hooks.state() : null, closed } }
}

/** stage 1's oracle drive: arXiv's pages in order, each read and its stream told */
const arxivDrive = (maker, st, N) => async ({ making, close, read }) => {
  for (let p = 1; p <= N; p++) {
    await making(async () => { await maker.readPage(p); read(p); st.pageRead(p) })
    await close()
  }
}

/**
 * The left anchored by ranges as the marked original's pages are read (left-part.mjs rangedAnchors, under the oracle's frame of
 * the left), the side a unit at a time (left-side.mjs leftSideStream, under its columns): each unit's bounds those of its unit
 * marks (`<id>s`, `<id>e`: boundsFromMarks') once both their pages are read (their words read there); a unit with no pair of
 * them, or every unit where the marks are none (`unitMarks` null), unbounded from the start. `page(p)` the marked page p read;
 * `end()` every page read, or the reading given up (a mark not read has no word: no bounds)
 */
function streamingLeft({ doc, views, edges, texts, floating, floatMatch, oracle, unitMarks }) {
  const n = texts.length, byPage = pageIndex(doc)
  const side = leftSideStream({ doc, views, edges, columns: () => oracle.columns })
  const done = new Uint8Array(n)
  let doneCount = 0, pending = 0
  const pairs = new Map()
  const R = rangedAnchors(doc, texts, { floating, floatMatch, frame: () => oracle.leftFrame, boundsKnown: () => pending === 0 })
  const lastPage = R.lastPage, clamp = p => Math.min(Math.max(1, p), lastPage)
  const isUnit = id => /^(?:0|[1-9]\d*)$/.test(id) && Number(id) < n
  const paired = new Set()
  if (unitMarks) for (const [name, s] of unitMarks) {
    if (!name.endsWith('s')) continue
    const id = name.slice(0, -1), e = unitMarks.get(`${id}e`)
    if (!e) continue
    const at = Math.max(s.page, e.page)
    ;(pairs.get(at) ?? pairs.set(at, []).get(at)).push([id, s, e])
    pending++
    if (isUnit(id)) { paired.add(Number(id)); if (lastPage) R.own(Number(id), clamp(s.page), clamp(e.page)) }
  }
  for (let u = 0; u < n; u++) if (!paired.has(u)) R.mark(u, null)
  const resolve = list => {
    for (const [id, s, e] of list) {
      pending--
      const b = boundsFromMarks(doc, new Map([[`${id}s`, s], [`${id}e`, e]]), byPage).get(id) ?? null
      if (isUnit(id)) R.mark(Number(id), b)
      else if (b) R.bounds.set(id, b)
    }
  }
  const settle = u => { if (!done[u]) { done[u] = 1; doneCount++ } }
  const run = () => R.run((id, an) => { side.add(id, an); settle(id) }, u => { side.none(u); settle(u) })
  run()
  return {
    pages: side.pages, leftPages: side.leftPages, units: side.units, stats: side.stats,
    done: i => done[i] === 1, all: () => doneCount === n, frontier: () => R.am, firstTok: p => (p <= lastPage ? R.firstTok[p] : doc.length),
    page(p) { resolve(pairs.get(p) ?? []); pairs.delete(p); run() },
    end() { for (const list of pairs.values()) resolve(list); pairs.clear(); run() },
  }
}

/**
 * The oracle's pass with the marked original read here a page at a time (`marked` { doc, log, options }: markedPages'): its
 * head first; the maker of the head's marks (marksOfHead) fed each page as it comes (make.mjs stream `marked`), the left
 * anchored by ranges as the unit marks' pages are read (streamingLeft), the marked page p + 1 read before arXiv's page p (a
 * mark of the marked page p + 1 may be carried to arXiv's page p). The oracle holds a whole run's four rules: the maker's frame
 * and columns' edges, the left's frame and its pages' columns. A head that cannot be read is the marks' refusal (null: the
 * caller's whole path then, as readMarked's refusal is); a page that cannot be read after it is the layout's failure, the left
 * going on with the unit marks read (the whole path refuses the marks then, its left placed without them: not this one's)
 */
async function markedStream(o) {
  const { paper, units, texts, floating, text, left, leftFloats, floatMatch, bundle, marked, markedOptions, doc, N, OPS, pdfjs, base, image, remove, onHead, onLeft, onPart, verdicts, oracle, rules } = o
  for (const k of ['frame', 'columnEdges', 'leftFrame', 'columns']) if (oracle[k] === undefined) throw new TypeError(`oracle.${k}: a whole run's (capture), for the marked original read a page at a time`)
  const events = markedPages(marked.doc, marked.log, markedOptions)
  let head = null
  try { head = (await events.next()).value?.head ?? null } catch (e) { if (isMemoryError(e)) throw e }
  if (!head) return null
  const L = streamingLeft({ doc: left.tokens, views: text.views, edges: left.edges, texts, floating, floatMatch: leftFloats, oracle, unitMarks: head.unitMarks })
  let maker = null, st = null, made = null
  try {
    maker = await makerOf({ units, marks: marksOfHead(head, markedOptions.engine), arxiv: doc, OPS, paper, left: '', pdfjs, text, floatMatch, frame: () => oracle.frame, plans: true, parts: true, rules, columnEdges: oracle.columnEdges })
    if (maker.refused) { made = { refused: maker.refused, stats: maker.stats }; maker = null } else st = maker.stream({ marked: head })
  } catch (e) {
    if (isMemoryError(e)) throw e
    made = { refused: 'failed', why: why(e) }
    maker = null
  }
  const M = head.pages
  const ctx = { paper, N, base, image, remove, pdfjs, onHead, onLeft, onPart, verdicts, bundle, made }
  let broken = null
  const drive = async ({ making, close, read }) => {
    for (let t = 1; t <= Math.max(M, N) + 1; t++) {
      // the marked page t (the left's unit marks, the maker's marks and pieces), then arXiv's page t - 1
      if (t <= M && !broken) {
        let page = null
        try { const x = await events.next(); page = x.value?.page ?? null; if (!page) broken = `the marked original gave no page ${t}` } catch (e) {
          if (isMemoryError(e)) throw e
          broken = why(e) || 'the marked original could not be read'
        }
        if (page) { L.page(t); await making(() => st.markedPage(page)) }
        if (broken) { L.end(); await making(() => { throw new Error(broken) }) }
      }
      const p = t - 1
      if (p >= 1 && p <= N && st) await making(async () => { await maker.readPage(p); read(p); st.pageRead(p) })
      await close()
    }
    if (broken) return
    let end = null
    try { const x = await events.next(); end = x.value?.end ?? null; if (!end) broken = 'the marked original gave no end' } catch (e) {
      if (isMemoryError(e)) throw e
      broken = why(e) || 'the marked original could not be read'
    }
    L.end()
    if (end) await making(() => st.markedEnd(end))
    else await making(() => { throw new Error(broken) })
    await close()
  }
  return streamed(ctx, { maker, st, lineskip: head.marking.lineskip ?? null, left: L, drive })
}
