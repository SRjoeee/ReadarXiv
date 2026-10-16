// The cut (bundle 4 contract C3b/C3c): a paper made whole (BUNDLE 3's reading: units, the original's side, the layout file) and
// its left parts' data, cut into BUNDLE 4's objects: the units' chunks, the head, the parts at the doubling schedule (closed by
// page and by the stream's prefix) with a left part for every page. The prepare pipeline's temporary producer calls it after
// today's whole-document stages; the page stream replaces it. Pure but for the writers' hashing: the same input gives the same
// bytes and keys. Imports the format's writers, the door's need rule (need.mjs) and nothing that loads a canvas.
import { NAME_FLAG } from '../layout/file.mjs'
import { REMOVAL } from '../layout/addon-manifest.mjs'
import { BundleRefusal } from './bundle.mjs'
import { groupsOfUnits, partTarget, writeHead, writeLeftPart, writePart, writeUnitChunks } from './format.mjs'
import { needBound, needsOf } from './need.mjs'

const refuse = (kind, path, why, data) => new BundleRefusal(why, { kind, path, ...(data ? { data } : {}) })
const SIZE_BOUNDS = ['bytes', 'values', 'content', 'tail', 'rows']
/** the most pages a part is extended over (the need bound), and so the most a part holds: the web's bound on a part's pages (M21) */
export const PART_PAGES_MAX = 5000
/** a removed page's reason when the whole add-on's manifest is carried without its tail (one incremental update, not cuttable by
 *  bytes): its units are drawn the old way, erased and put back */
export const TAIL_NOT_CARRIED = 'tail not carried'

/**
 * The entry of one page when the whole add-on's manifest is carried without its tail: a clean planned page (`ok`, no removed
 * page of its own: no `at`, no `dirty` boxes) stays as it is; a removed page, whose bytes are in the tail, is refused; a page
 * the remover refused stays so. With a fixed-place R set (`sets.R`) every page has its removed page in the tail: all refused.
 */
function carriedEntry(manifest, p) {
  const e = manifest.page[p]
  if (e === undefined) return { ok: false, refused: 'not planned' }
  if (!e.ok) return structuredClone(e)
  if (Object.hasOwn(e, 'at') || Object.hasOwn(e, 'dirty') || Object.hasOwn(manifest.sets, 'R')) return { ok: false, refused: TAIL_NOT_CARRIED }
  return structuredClone(e)
}

/** the pages of a flat rows array: the value at `at` of every `stride` */
function pagesAt(rows, at, stride, into) {
  for (let j = at; j < rows.length; j += stride) into.push(rows[j])
}

/**
 * K over the whole paper (C3b): one entry for each unit v0 may place, a left unit at its stream and a layout-only unit at
 * `after + 0.5`, ordered by (slot, id). `after` is today's `before` (run.mjs): the largest stream of a left unit with a smaller
 * id over the whole paper, -1 for none. An entry is what needsOf reads (`lists`, `reach`, `rects`) and what the part is cut from
 */
function entriesOf(whole, N, grouped) {
  const left = new Map(whole.left.units.map(w => [w[0], w]))
  const layout = whole.layout ?? null
  const luOf = new Map(layout ? layout.units.map(u => [u[0], u]) : [])
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
  for (const id of ids) {
    const w = left.get(id) ?? null, lu = luOf.get(id) ?? null
    const rectPages = w ? w[2].map(r => r[0]) : []
    const lines = lu ? linePages.get(id) ?? [] : []
    const everything = lu ? [...rectPages, ...(allPages.get(id) ?? [])] : rectPages
    const lists = [shown(rectPages), shown(lines)].filter(l => l.length)
    const e = {
      id, slot: w ? w[1] : before + 0.5, after: w ? null : before, rects: w ? w[2] : null, left: w, lu,
      lists, reach: new Set([...rectPages, ...lines]),
      // (and what Need reads of it besides, as the door's K has it (run.mjs addUnits): its placeholders' segments' pages and its table group)
      reads: lu ? [...new Set((segPages.get(id) ?? []).filter(q => q >= 1 && q <= N))] : [], group: grouped.of[id] >= 0 ? grouped.of[id] : null,
      // the least page of its rects and its lines: where the reader says a part may no longer tell it
      first: Math.min(...rectPages, ...lines),
      // the last page its left rects reach, and the last page any of its rows does (what the part's views must reach)
      lastLeft: rectPages.length ? Math.max(...rectPages) : 0, last: everything.length ? Math.max(...everything) : 0,
    }
    entries.push(e)
    if (w && w[1] > before) before = w[1]
  }
  return entries.sort((a, b) => a.slot - b.slot || a.id - b.id)
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
 * sha256, xref } (`xref`: the original's startxref, which BUNDLE 3 does not carry: `o.base` may supply it), `units` (none
 * dropped), `left` { pages, units }, `layout` (the layout file or null) and, if `o.image` is not given, `versions.image`.
 * `o.target(a, N)`: the last page the part that begins at `a` is cut to, 'a' to N (default partTarget, the doubling
 * schedule); a harness cuts at any split with it. `o.leftPages(page)`: the page's { first, tokens, spans, pairs? } in the left part's input (null: a page with no tokens);
 * called once for each page, in page order, as the parts that cover it are cut. `o.frontier(K, N)`: F as an array indexed by
 * page 0 to N of indices into K (-1 for none), default needFrontier. `o.chainAddon(index, { pages, layout })`: the add-on
 * { manifest, tail } for a candidate range of the part, or null (the part's pages are refused, drawn by erase and restore);
 * the add-on takes part in the part's size, so the hook is called for each candidate range the size search tries (several
 * times for one index) and must have no effect until `o.acceptAddon(index, { pages })`, called once for each part that has a
 * layout, in order, when its range is final (a chained writer keeps its state there). A tail past TAIL_CAP shortens the part like
 * any size refusal; a page whose tail alone passes it ships with no layout. Without the hook, the part carries the whole's add-on manifest (`whole.addon`) without
 * its tail: clean pages as they are, removed pages TAIL_NOT_CARRIED, refused pages refused; with no add-on in the whole, no
 * add-on for any part (`addon: null`, M20: drawn by erase and restore). Throws BundleRefusal for a whole that
 * cannot be written (a dropped unit, a unit past the chunk caps) and `bound` for a page that no part can hold
 */
export async function cutBundle(whole, o) {
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
  const units = await writeUnitChunks({ paper, units: whole.units })
  const image = o.image ?? whole.versions?.image
  const base = o.base ?? whole.base
  const lineskip = 'lineskip' in o ? o.lineskip : whole.layout?.lineskip ?? null
  const head = await writeHead({ paper: { ...paper, pages: N }, base: { bytes: base.bytes, sha256: base.sha256, xref: base.xref }, image, units, lineskip })

  // K and its frontier
  const grouped = groupsOfUnits(whole.units)
  const K = entriesOf(whole, N, grouped)
  const given = frontier(K, N)
  if (!Array.isArray(given) || given.length !== N + 1) throw new TypeError(`frontier: an array of the ${N + 1} indices of pages 0 to ${N}`)
  for (let b = 0; b <= N; b++) if (!Number.isInteger(given[b]) || given[b] < -1 || given[b] >= K.length || (b > 0 && given[b] < given[b - 1])) throw new RangeError(`frontier: page ${b} is not an index of K, rising`)
  if (given[0] !== -1) throw new RangeError('frontier: page 0 is not -1')
  const F = closedOver(given, K, grouped)
  // each page's need bound (need.mjs: the last page whose part laying it reads), over the whole K, once
  const extend = o.extend !== false && !o.target
  const maxPages = o.partPagesMax ?? PART_PAGES_MAX
  const NB = extend ? needBound(K, N) : null

  // the left parts, written as the parts reach their pages
  const lefts = []
  let tokens = 0
  const leftTo = async b => {
    while (lefts.length < b) {
      const page = lefts.length + 1
      const got = await o.leftPages(page)
      const first = got ? got.first : tokens
      const t = got ? got.tokens : empty
      const w = await writeLeftPart({ paper, page, first, tokens: t, spans: got?.spans ?? [], pairs: got?.pairs ?? [] })
      lefts.push(w)
      tokens = first + t.perPage[0]
    }
  }

  const layout = whole.layout ?? null
  const fonts = layout?.fonts ?? []
  const views = whole.left.pages
  const parts = []
  let prev = null, taken = -1
  for (let a = 1; a <= N;) {
    let target = o.target ? o.target(a, N) : partTarget(a, N)
    if (!Number.isInteger(target) || target < a || target > N) throw new RangeError(`target: ${target} is not a last page from ${a} to ${N}`)
    // the schedule's target extended over the need bound (a preference, never a requirement: a part that does not fit is shortened
    // below as ever, and the door gates the page whose closure then reaches past it): the least b from the target on with b at least
    // the bound of every page a to b, within the paper and the cap on the pages of a part
    if (NB) {
      const limit = Math.max(target, a + maxPages - 1)
      for (let q = a, m = 0; ;) {
        for (; q <= target; q++) m = Math.max(m, NB[q])
        const next = Math.min(m, N, limit)
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
        part = {
          fonts: table, units: rows(layout.units), lines, frames: rows(layout.frames), erase: rows(layout.erase), ph: rows(layout.ph), labels: rows(layout.labels),
          headings: rows(layout.headings), pageText: rows(layout.pageText), held: rows(layout.held), names: named,
        }
      }
      return {
        have, mine, pages: [a, b], views: flat, part,
        left: mine.filter(e => e.left).map(e => e.left).sort((x, y) => x[0] - y[0]),
        fileOnly: lay.filter(e => !e.left).map(e => [e.id, e.after]).sort((x, y) => x[0] - y[0]),
      }
    }
    const addonOf = (b, withLayout, ad) => {
      if (!withLayout || !layout) return null
      if (ad) return ad
      // (no add-on in the whole and no hook to make one, a producer with no remover: no add-on for the part's pages (M20), drawn by
      // erase and restore as BUNDLE 3's bundle with none; a hook that answers null still plans them, as not planned)
      if (!o.chainAddon && !whole.addon) return null
      const carry = !o.chainAddon && whole.addon ? whole.addon.manifest : null
      const page = {}
      for (let p = a; p <= b; p++) page[p] = carry ? carriedEntry(carry, p) : { ok: false, refused: 'not planned' }
      return { manifest: { schema: 1, removal: REMOVAL, pages: N, sets: {}, page, appended: 0, stats: {} }, tail: null }
    }
    // the hook is consulted for each candidate range once (the add-on is part of the part's size), so it must be free of side
    // effects until `acceptAddon` tells it which range was kept
    const write = async (b, withLayout) => {
      await leftTo(b)
      const x = input(b, withLayout)
      if (!withLayout && layout) {
        // (without its layout a part tells its left units alone, and a layout-only unit of the range is lost to the stream: that is
        // the documented price of a page too big for a layout, but never for a table group, which would be told in part)
        const told = new Set(x.mine.map(e => e.id))
        const groupsTold = new Set(x.mine.map(e => grouped.of[e.id]).filter(g => g >= 0))
        for (const e of K.slice(taken + 1, Math.max(taken, upTo(b)) + 1)) {
          if (!told.has(e.id) && groupsTold.has(grouped.of[e.id])) throw refuse('part', 'pages', `unit ${e.id}, a member of a table group the part tells in part: page ${a} cannot be told whole without its layout`, { bound: 'part', page: a, unit: e.id })
        }
      }
      const ad = withLayout && layout && o.chainAddon ? await o.chainAddon(parts.length, { pages: [a, b], layout: x.part }) : null
      const w = await writePart({ paper, head: head.sha256, prev, pages: x.pages, views: x.views, left: x.left, fileOnly: x.fileOnly, layout: x.part, addon: addonOf(b, withLayout, ad), leftParts: lefts.slice(a - 1, b) })
      return { w, x }
    }
    // a size refusal is the cut's to answer (a shorter part), any other is a defect
    const tried = new Map()
    const fits = async (b, withLayout) => {
      const key = `${b}${withLayout ? 'L' : ''}`
      if (!tried.has(key)) {
        try { tried.set(key, await write(b, withLayout)) } catch (e) {
          if (!(e instanceof BundleRefusal && e.kind === 'part' && SIZE_BOUNDS.includes(e.data?.bound))) throw e
          tried.set(key, null)
        }
      }
      return tried.get(key)
    }
    let at = await fits(target, true), b = target, withLayout = true
    if (at === null) {
      // the longest run of pages from a that fits (a part only grows with its pages)
      let lo = a - 1, hi = target
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if ((await fits(mid, true)) === null) hi = mid
        else lo = mid
      }
      if (lo >= a) { b = lo; at = await fits(b, true) } else {
        // a page that alone does not fit ships without its layout: v0 draws its units from the left
        b = a
        withLayout = false
        at = await fits(b, false)
        if (at === null) throw refuse('part', 'pages', `page ${a} alone passes the bounds of a part, with no layout`, { bound: 'part', page: a })
      }
    }
    if (withLayout && layout && o.acceptAddon) await o.acceptAddon(parts.length, { pages: [a, b] })
    const { w } = at
    parts.push(Object.assign(w, { leftParts: lefts.slice(a - 1, b) }))
    prev = w.sha256
    taken = Math.max(taken, upTo(b))
    a = b + 1
  }
  return { units, head, parts, left: lefts, end: { through: N } }
}
