// The cut (bundle 4 contract C3b/C3c): a paper made whole (BUNDLE 3's reading: units, the original's side, the layout file) and
// its left parts' data, cut into BUNDLE 4's objects: the units' chunks, the head, the parts at the doubling schedule (closed by
// page and by the stream's prefix) with a left part for every page. The prepare pipeline's temporary producer calls it after
// today's whole-document stages; the page stream replaces it. Pure but for the writers' hashing: the same input gives the same
// bytes and keys. Imports the format's writers, the door's need rule (need.mjs) and nothing that loads a canvas.
import { indexLayout, NAME_FLAG } from '../layout/file.mjs'
import { BundleRefusal } from './bundle.mjs'
import { chunkTotals, groupsOfUnits, partTarget, writeHead, writeLeftPart, writePart, writeUnitChunks } from './format.mjs'
import { needBound, needsOf, rowLeadOf } from './need.mjs'

const refuse = (kind, path, why, data) => new BundleRefusal(why, { kind, path, ...(data ? { data } : {}) })
const SIZE_BOUNDS = ['bytes', 'values', 'content', 'rows']
/** the most pages a part is extended over (the need bound), and so the most a part holds: the web's bound on a part's pages (M21) */
export const PART_PAGES_MAX = 5000
/** the pages of a flat rows array: the value at `at` of every `stride` */
function pagesAt(rows, at, stride, into) {
  // (whole strides alone: a placeholder row's fill, last, is no segment's)
  for (let j = at; j + stride <= rows.length; j += stride) into.push(rows[j])
}

/**
 * K over the whole paper (C3b): one entry for each unit v0 may place, a left unit at its stream and a layout-only unit at
 * `after + 0.5`, ordered by (slot, id). `after` is today's `before` (run.mjs): the largest stream of a left unit with a smaller
 * id over the whole paper, -1 for none. An entry is what needsOf reads (`lists`, `reach`, `rects`) and what the part is cut from.
 * `cache` (the page stream's, pipeline/frontier.mjs): what an entry holds of its unit alone (its pages, by its left rectangles and
 * its rows) kept from one call to the next, `entries` by id, under the left rectangles it was read from and `rows(id)`, the
 * caller's object of the unit's rows (a new one whenever they change); `built` counts those read
 */
function entriesOf(whole, N, grouped, cache = null) {
  const left = new Map(whole.left.units.map(w => [w[0], w]))
  const layout = whole.layout ?? null
  const luOf = new Map(layout ? layout.units.map(u => [u[0], u]) : [])
  // (the file's index, for the unit each one's first row continues on a shared line: need.mjs rowLeadOf)
  const index = layout ? indexLayout(layout) : null
  // the pages each unit's rows name, by table (a unit's lines are the pages it is framed on; the rest only widen the part's reach)
  const linePages = new Map(), allPages = new Map(), segPages = new Map()
  const pagesOf = (map, id) => map.get(id) ?? map.set(id, []).get(id)
  if (layout) {
    for (const [id, rows] of layout.lines) { pagesAt(rows, 0, 8, pagesOf(linePages, id)); pagesAt(rows, 0, 8, pagesOf(allPages, id)) }
    for (const r of layout.ph) { pagesAt(r, 4, 6, pagesOf(allPages, r[0])); pagesAt(r, 4, 6, pagesOf(segPages, r[0])) }
    for (const r of layout.labels) pagesOf(allPages, r[0]).push(r[2])
  }
  const ids = [...new Set([...left.keys(), ...luOf.keys()])].sort((a, b) => a - b)
  const shown = pages => [...new Set(pages.filter(p => p <= N))]
  const entries = []
  let before = -1
  /** what the entry of unit `id` holds of the unit alone: its left rectangles' pages and its rows' */
  const ownOf = (id, w, lu) => {
    const rectPages = w ? w[2].map(r => r[0]) : []
    const lines = lu ? linePages.get(id) ?? [] : []
    const everything = lu ? [...rectPages, ...(allPages.get(id) ?? [])] : rectPages
    return {
      lists: [shown(rectPages), shown(lines)].filter(l => l.length), reach: new Set([...rectPages, ...lines]),
      reads: lu ? [...new Set((segPages.get(id) ?? []).filter(q => q >= 1 && q <= N))] : [],
      first: Math.min(...rectPages, ...lines), lastLeft: rectPages.length ? Math.max(...rectPages) : 0, last: everything.length ? Math.max(...everything) : 0,
    }
  }
  for (const id of ids) {
    const w = left.get(id) ?? null, lu = luOf.get(id) ?? null
    let own
    if (cache) {
      const rects = w ? w[2] : null, rows = cache.rows(id), was = cache.entries.get(id)
      if (was && was.rects === rects && was.rows === rows) own = was.own
      else { own = ownOf(id, w, lu); cache.entries.set(id, { rects, rows, own }); cache.built++ }
    } else own = ownOf(id, w, lu)
    const e = {
      id, slot: w ? w[1] : before + 0.5, after: w ? null : before, rects: w ? w[2] : null, left: w, lu,
      lists: own.lists, reach: own.reach,
      // (and what Need reads of it besides, as the door's K has it (run.mjs addUnits): its placeholders' segments' pages and its table group)
      reads: own.reads, group: grouped.of[id] >= 0 ? grouped.of[id] : null,
      // (set once K is in order, below)
      follows: null,
      // the least page of its rects and its lines: where the reader says a part may no longer tell it
      first: own.first,
      // the last page its left rects reach, and the last page any of its rows does (what the part's views must reach)
      lastLeft: own.lastLeft, last: own.last,
    }
    entries.push(e)
    if (w && w[1] > before) before = w[1]
  }
  entries.sort((a, b) => a.slot - b.slot || a.id - b.id)
  // (a unit follows one before it in K alone, chosen among those, as the door's K holds it: run.mjs addUnits)
  const at = new Map(entries.map((e, i) => [e.id, i]))
  for (const e of entries) if (e.lu) e.follows = rowLeadOf(index, e.id, aid => at.get(aid) < at.get(e.id))?.id ?? null
  return entries
}

/** the frontier of the whole paper by the door's rule: F[b] is the index in K of the last entry page b's drawing may need */
export const needFrontier = (K, N) => needsOf(K, N, false, c => !c.rects).lay

/**
 * The frontier closed over the table groups (amendment M18): a group is read whole (a column across a page break is laid and
 * filled together), so every K entry of a group with an entry up to F(b) is told by the same part, and what is told is a
 * prefix of K: F(b) grows to the last of those, to a fixpoint (the last of one group may be the first of another's reach). Only
 * ever up, so an entry goes to an earlier part and never a later one.
 */
function closedOver(F, K, { members }) {
  const at = new Map(K.map((e, i) => [e.id, i]))
  // each group's first and last place in K, the groups by first place with the furthest last place up to each
  const spans = []
  for (const ids of members) {
    const places = ids.map(id => at.get(id)).filter(i => i !== undefined)
    if (places.length > 1) spans.push([Math.min(...places), Math.max(...places)])
  }
  spans.sort((x, y) => x[0] - y[0])
  const furthest = []
  let top = -1
  for (const [, last] of spans) { top = Math.max(top, last); furthest.push(top) }
  const reach = f => {
    for (;;) {
      // (the groups that begin at or before f)
      let lo = 0, hi = spans.length
      while (lo < hi) { const mid = (lo + hi) >> 1; if (spans[mid][0] <= f) lo = mid + 1; else hi = mid }
      const next = lo === 0 ? f : Math.max(f, furthest[lo - 1])
      if (next === f) return f
      f = next
    }
  }
  return F.map(f => (f < 0 ? f : reach(f)))
}

const empty = { perPage: [0], l: [], r: [], y: [], h: [], top: [], bottom: [] }

/**
 * The BUNDLE 4 objects of a paper made whole.
 *
 * `whole`: BUNDLE 3's reading (readBundle) or the object the producer holds: `paper` { id, version, pages }, `base` { bytes,
 * sha256, xref } (`xref`: the original's startxref, which BUNDLE 3 does not carry: `o.base` may supply it; BUNDLE 8's `source`
 * and the fields of a base of ours with it, `orig` beside it: format.mjs writeHead), `units` (none
 * dropped), `left` { pages, units }, `layout` (the layout file or null) and, if `o.image` is not given, `versions.image`.
 * `o.target(a, N)`: the last page the part that begins at `a` is cut to, 'a' to N (default partTarget, the doubling
 * schedule); a harness cuts at any split with it. `o.leftPages(page)`: the page's { first, tokens, spans, pairs?, lines? } in the left part's input (null: a page with no tokens);
 * called once for each page, in page order, as the parts that cover it are cut. `o.frontier(K, N)`: F as an array indexed by
 * page 0 to N of indices into K (-1 for none), default needFrontier. `whole.rules` (or `o.rules`): the rules near the paper's
 * table cells by page, which each part with a layout carries for its own pages. `o.verdict`, `o.recordOf`: partCutter's; `o.noLayout`
 * the record a part of a whole with no layout carries (partCutter's `known.noLayout`). Throws BundleRefusal for a
 * whole that cannot be written (a dropped unit, a unit past the chunk caps) and `bound` for a page that no part can hold. The
 * cut is partCutter's, fed the whole paper: a producer that feeds it a part at a time cuts the same parts
 */
export async function cutBundle(whole, o) {
  const { units, head, cutter, known, N } = await wholeCutter(whole, o)
  for (;;) if ((await cutter.next(known)) === null) break
  return { units, head, parts: cutter.parts, left: cutter.left, end: { through: N } }
}

/**
 * cutBundle's start: the whole checked, its units' chunks and its head written, and the cutter with what it cuts each part on
 * (`known`), for a producer that takes each part as it is cut (`cutter.next(known)` until null: cutBundle's parts). Throws as
 * cutBundle does before its first part
 */
export async function wholeCutter(whole, o) {
  if (typeof o?.leftPages !== 'function') throw new TypeError('leftPages: a function of the page')
  const frontier = o.frontier ?? needFrontier
  const { id, version, pages: N } = whole.paper
  const paper = { id, version }
  if (!Number.isSafeInteger(N) || N < 1) throw new RangeError('not a paper with pages')
  if (whole.left.pages.length !== N) throw refuse('part', 'left.pages', `${whole.left.pages.length} views, not the paper's ${N}`)
  if (whole.units.includes(null)) throw refuse('units', '', 'a dropped unit: the chunks hold what stands')
  for (const w of whole.left.units) if (!(w[0] < whole.units.length)) throw refuse('part', 'left.units', `unit ${w[0]} is not a unit of the paper`)
  if (whole.layout) for (const u of whole.layout.units) if (!(u[0] < whole.units.length)) throw refuse('part', 'layout.units', `unit ${u[0]} is not a unit of the paper`)

  // units and head
  // (the ink units after the source units' in chunks of their own from `inkFrom`, INK_UNITS_FORMAT: format.mjs writeUnitChunks `start`)
  const inkFrom = Number.isInteger(o.inkFrom) && o.inkFrom > 0 && o.inkFrom < whole.units.length ? o.inkFrom : null
  const src = await writeUnitChunks({ paper, units: inkFrom === null ? whole.units : whole.units.slice(0, inkFrom) })
  const units = inkFrom === null ? src : [...src, ...await writeUnitChunks({ paper, units: whole.units.slice(inkFrom), start: inkFrom, before: chunkTotals(src) })]
  const image = o.image ?? whole.versions?.image
  const base = o.base ?? whole.base
  const lineskip = 'lineskip' in o ? o.lineskip : whole.layout?.lineskip ?? null
  // (the base as given: arXiv's, or BUNDLE 8's of ours with its check, `orig` arXiv's beside it: format.mjs writeHead)
  const head = await writeHead({ paper: { ...paper, pages: N }, base, orig: o.orig ?? whole.orig ?? null, image, units, lineskip, draw: o.draw === true })

  // K and its frontier, then the parts
  const { K, F } = wholeFrontier(whole, frontier)
  const cutter = partCutter({
    paper, N, head, views: whole.left.pages, leftPages: o.leftPages, rules: o.rules ?? whole.rules ?? null, figures: o.figures ?? null,
    target: o.target ?? null, partPagesMax: o.partPagesMax, verdict: o.verdict ?? null, recordOf: o.recordOf ?? null,
  })
  // each page's need bound (need.mjs: the last page whose part laying it reads), over the whole K, once
  const known = { K, F, NB: o.extend !== false && !o.target ? needBound(K, N) : null, layout: whole.layout ?? null, noLayout: o.noLayout ?? null }
  return { units, head, cutter, known, N }
}

/**
 * K over the whole paper and its frontier closed over the table groups (what partCutter cuts a paper made whole on): `whole`
 * cutBundle's, `frontier(K, N)` F as an array of pages 0 to N (needFrontier's by default), checked: a TypeError or a
 * RangeError for one that is not an index of K for each page, rising from -1. `grouped` groupsOfUnits(whole.units), made by a
 * caller that asks for K more than once (the page stream: a function of the units alone), and `cache` entriesOf's, its own
 */
export function wholeFrontier(whole, frontier = needFrontier, grouped = groupsOfUnits(whole.units), cache = null) {
  const N = whole.paper.pages
  const K = entriesOf(whole, N, grouped, cache)
  const given = frontier(K, N)
  if (!Array.isArray(given) || given.length !== N + 1) throw new TypeError(`frontier: an array of the ${N + 1} indices of pages 0 to ${N}`)
  for (let b = 0; b <= N; b++) if (!Number.isInteger(given[b]) || given[b] < -1 || given[b] >= K.length || (b > 0 && given[b] < given[b - 1])) throw new RangeError(`frontier: page ${b} is not an index of K, rising`)
  if (given[0] !== -1) throw new RangeError('frontier: page 0 is not -1')
  return { K, F: closedOver(given, K, grouped) }
}

/**
 * The cut a part at a time (E2b): the state from one part to the next (the page the next part begins at, the last part's
 * digest, the K entries told, the left parts written), and `next(known)`, the part from that page cut on what `known` holds,
 * or null past the paper's last page. `known`: `K` (entriesOf's entries, in K order: every one the part may tell, those up to
 * F(b) of each page b it may end at), `F` the frontier closed over the table groups, `NB` each page's need bound (null: the
 * schedule's target taken as it is, not extended), `layout` the layout file's rows (a whole file, or one holding at least
 * every row of the units the part may tell and every babel name on its pages, in the file's order) or null. A part tells
 * exactly what cutBundle's tells of the same paper wherever `known` agrees with the whole paper's on what the part reads.
 * A part's layout holds the rows of the units it tells, and why each of them the file does not lay is the original's (the
 * file's `unlaid` of its K entries: a unit the left does not hold and the file does not lay is told by no part).
 *
 * `paper` { id, version }, `N` its pages, `head` the head written, `views` every page's view; `leftPages`, `target`, `partPagesMax`:
 * cutBundle's; `rules` the cell rules by page (an object or a Map of page to boxes; null: none), a part with a layout carrying its own
 * pages'; `figures` the figure units' rows by page (figure-rows.mjs figureRow's, an object or a Map; null: none), the same.
 * `verdict({ pages, input, written })`: of the part as cut with its layout, its pages' layout refused ({ refused, ...why }) or
 * kept (null); a part refused is the same pages with no layout (C1.4: its units drawn from the left, a table group's
 * layout-only cells too). With a verdict, a part its writer refuses with its layout for what that
 * holds (not a size: a row its part's check refuses) is the longest run of its pages that fits with none, { refused: 'part',
 * why }, where cutBundle without one throws. Each part's verdict is `verdicts[i]`: null, the hook's refusal, the writer's,
 * or { refused: 'part' } for a first page that alone passes a part's bounds with its layout (a part of one page, with none).
 * `retain` false: no part nor left part is kept once given (`parts` holds a null for each, `left` too): a stream's.
 * Why a part has no layout, as it records it in place of one (format.mjs LAYOUT_REFUSED): `known.noLayout`, the record of a
 * part cut with no layout file (the paper's refusal, or the maker's failure or the carry's from then on), and
 * `recordOf(refused)`, the record of a part a verdict or a part's bound refused its layout (`verdicts[i]`); null for either,
 * `layout: null` (no reason recorded: 5's shape)
 */
export function partCutter({ paper, N, head, views, leftPages, rules = null, figures = null, target: targetOf = null, partPagesMax, verdict = null, retain = true, recordOf = null }) {
  if (typeof leftPages !== 'function') throw new TypeError('leftPages: a function of the page')
  const maxPages = partPagesMax === undefined ? PART_PAGES_MAX : partPagesMax
  if (!Number.isSafeInteger(maxPages) || maxPages < 1) throw new RangeError(`partPagesMax: ${String(maxPages)} is not a positive whole number of pages`)

  // the left parts, written as the parts reach their pages
  const lefts = [], parts = [], verdicts = []
  let tokens = 0
  const leftTo = async b => {
    while (lefts.length < b) {
      const page = lefts.length + 1
      const got = await leftPages(page)
      // (a page with no tokens may come with its draw alone: its first token is the next page's, its tokens none)
      const first = got?.first ?? tokens
      const t = got?.tokens ?? empty
      const w = await writeLeftPart({ paper, page, first, tokens: t, spans: got?.spans ?? [], pairs: got?.pairs ?? [], lines: got?.lines ?? null, draw: got?.draw ?? null, drawText: got?.drawText ?? null })
      lefts.push(w)
      tokens = first + t.perPage[0]
    }
  }

  let prev = null, taken = -1, a = 1
  async function next({ K, F, NB = null, layout = null, noLayout = null }) {
    if (a > N) return null
    // (the record a part with no layout carries: the paper's, until a refusal of this part's own replaces it)
    let absent = noLayout
    const fonts = layout?.fonts ?? []
    let target = targetOf ? targetOf(a, N) : partTarget(a, N)
    if (!Number.isInteger(target) || target < a || target > N) throw new RangeError(`target: ${target} is not a last page from ${a} to ${N}`)
    // (no part is wider than partPagesMax, the extension or not: the target is clamped first)
    target = Math.min(target, a + maxPages - 1)
    // the schedule's target extended over the need bound (a preference, never a requirement: a part that does not fit is shortened
    // below as ever, and the door gates the page whose closure then reaches past it): the least b from the target on with b at least
    // the bound of every page a to b, within the paper and the cap on the pages of a part
    if (NB) {
      const limit = Math.min(N, a + maxPages - 1)
      // (target only grows, within the limit, so the loop ends; the count is a guard)
      for (let q = a, m = 0, turns = 0; turns <= N; turns++) {
        for (; q <= target; q++) m = Math.max(m, NB[q])
        const next = Math.min(m, limit)
        if (next <= target) break
        target = next
      }
    }
    // the part for pages a..b: K's entries after the last of the parts before, up to the frontier of b (the last part also
    // takes any entry past the frontier of N: no page needs it)
    const upTo = b => (b === N ? K.length - 1 : F[b])
    const input = (b, withLayout) => {
      const mine = K.slice(taken + 1, Math.max(taken, upTo(b)) + 1).filter(e => withLayout || e.left)
      const have = new Set(mine.map(e => e.id))
      for (const e of mine) if (e.first < a) throw new RangeError(`frontier: unit ${e.id}, first framed on page ${e.first}, is left for the part from page ${a}`)
      const lay = withLayout && layout ? mine.filter(e => e.lu) : []
      const ids = new Set(lay.map(e => e.id))
      const names = withLayout && layout ? layout.names.filter(r => (r[10] & NAME_FLAG.RUN_IN ? ids.has(r[11]) : r[2] >= a && r[2] <= b)) : []
      let reach = b
      for (const e of mine) reach = Math.max(reach, withLayout ? e.last : e.lastLeft)
      for (const r of names) reach = Math.max(reach, r[2])
      if (reach > N) throw refuse('part', 'views', `unit rows reach page ${reach}, past the paper's ${N}`)
      const flat = []
      for (let p = a; p <= reach; p++) flat.push(...views[p - 1])
      let part = null
      if (withLayout && layout) {
        const table = []
        const fontAt = i => { const name = fonts[i]; let at = table.indexOf(name); if (at < 0) { at = table.length; table.push(name) } return at }
        const rows = list => list.filter(r => ids.has(r[0]))
        const lines = rows(layout.lines).map(([uid, v]) => [uid, v.map((x, j) => (j % 8 === 7 ? fontAt(x) : x))])
        const named = names.map(r => r.map((x, j) => (j === 9 ? fontAt(x) : x)))
        // (each colour piece's run's fill of the part's units: a key only where one of them has a row, as the file's; and why each
        // unit the part tells that the file does not lay is the original's, a key only where one is not laid)
        const colours = rows(layout.colours ?? []), unlaid = (layout.unlaid ?? []).filter(r => have.has(r[0]))
        part = {
          fonts: table, units: rows(layout.units), lines, frames: rows(layout.frames), erase: rows(layout.erase), ph: rows(layout.ph), labels: rows(layout.labels),
          headings: rows(layout.headings), pageText: rows(layout.pageText), held: rows(layout.held), names: named, ...(colours.length ? { colours } : {}),
          ...(unlaid.length ? { unlaid } : {}),
        }
      }
      return {
        have, mine, pages: [a, b], views: flat, part,
        left: mine.filter(e => e.left).map(e => e.left).sort((x, y) => x[0] - y[0]),
        fileOnly: lay.filter(e => !e.left).map(e => [e.id, e.after]).sort((x, y) => x[0] - y[0]),
      }
    }
    /** the cell rules of pages a to b, where the part carries a layout: null where none of them has any */
    const rulesOf = (b, withLayout) => {
      if (!withLayout || !layout || !rules) return null
      const out = {}
      for (let p = a; p <= b; p++) { const r = rules instanceof Map ? rules.get(p) : rules[p]; if (r?.length) out[p] = r }
      return Object.keys(out).length ? out : null
    }
    // (its pages' figure units, figure-rows.mjs rows, where its layout is: a page's figures are drawn over our page as its units are)
    const figuresOf = (b, withLayout) => {
      if (!withLayout || !layout || !figures) return []
      const out = []
      for (let p = a; p <= b; p++) out.push(...((figures instanceof Map ? figures.get(p) : figures[p]) ?? []))
      return out
    }
    // without its layout a part tells its left units alone: a layout-only unit of the range is not told (C1.4: the reader draws the
    // part from the left, a table group's left cells among them, its layout-only cells not at all); that is the documented price of a
    // part with no layout
    const write = async (b, withLayout) => {
      await leftTo(b)
      const x = input(b, withLayout)
      const w = await writePart({ paper, head: head.sha256, prev, pages: x.pages, views: x.views, left: x.left, fileOnly: x.fileOnly, layout: x.part ?? absent, rules: rulesOf(b, withLayout), figures: figuresOf(b, withLayout), leftParts: lefts.slice(a - 1, b) })
      return { w, x }
    }
    // a size refusal is the cut's to answer (a shorter part), any other is a defect; but under a verdict, the writer's refusal of
    // a part with its layout for what that holds (a row its part's check refuses) is the part's layout refused, as the reader's
    // is: the same pages with none (`bad`)
    const tried = new Map()
    const fits = async (b, withLayout) => {
      const key = `${b}${withLayout && layout ? 'L' : `:${absent ? `${absent.refused}|${absent.why}` : ''}`}`
      if (!tried.has(key)) {
        try { tried.set(key, await write(b, withLayout)) } catch (e) {
          const refusal = e instanceof BundleRefusal && e.kind === 'part'
          if (refusal && SIZE_BOUNDS.includes(e.data?.bound)) tried.set(key, null)
          else if (refusal && verdict && withLayout && layout) tried.set(key, { bad: e.message })
          else throw e
        }
      }
      return tried.get(key)
    }
    const bad = got => got !== null && got.bad !== undefined
    /** the longest run of pages from a to the target that fits (a part only grows with its pages): { b, at }, null where page a
     *  alone does not, or the writer's refusal met on the way ({ bad }) */
    const longest = async withLayout => {
      const whole = await fits(target, withLayout)
      if (whole !== null) return bad(whole) ? whole : { b: target, at: whole }
      let lo = a - 1, hi = target
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        const got = await fits(mid, withLayout)
        if (bad(got)) return got
        if (got === null) hi = mid
        else lo = mid
      }
      return lo >= a ? { b: lo, at: await fits(lo, withLayout) } : null
    }
    let got = await longest(true), withLayout = true, refused = null
    if (got === null || bad(got)) {
      // a page that alone does not fit ships without its layout (v0 draws its units from the left); a layout its writer refuses,
      // the longest run without it
      withLayout = false
      if (layout) refused = got === null ? { refused: 'part' } : { refused: 'part', why: got.bad.slice(0, 200) }
      if (refused) absent = recordOf?.(refused) ?? absent
      got = got === null ? { b: a, at: await fits(a, false) } : await longest(false)
      if (got === null || got.at === null) throw refuse('part', 'pages', `page ${a} alone passes the bounds of a part, with no layout`, { bound: 'part', page: a })
    }
    let { b, at } = got
    // the producer's verdict on the part as cut with its layout (the carry's share of its pages, its reading): refused, the same
    // pages with none, which hold less than they did with it
    if (withLayout && layout && verdict) {
      const v = await verdict({ pages: [a, b], input: at.x, written: at.w })
      if (v) {
        refused = v
        withLayout = false
        absent = recordOf?.(v) ?? absent
        at = await fits(b, false)
        if (at === null) throw refuse('part', 'pages', `pages ${a} to ${b} pass the bounds of a part with no layout`, { bound: 'part', page: a })
      }
    }
    const { w } = at
    const part = Object.assign(w, { leftParts: lefts.slice(a - 1, b) })
    // (`retain` false: the part and its left parts are the caller's alone once given: a stream holds no part told)
    parts.push(retain ? part : null)
    if (!retain) for (let p = a - 1; p < b; p++) lefts[p] = null
    verdicts.push(refused)
    prev = w.sha256
    taken = Math.max(taken, upTo(b))
    a = b + 1
    return part
  }
  return { next, parts, left: lefts, verdicts, get from() { return a } }
}
