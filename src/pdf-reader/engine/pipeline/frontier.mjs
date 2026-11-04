// What the page stream cuts each part on (pipeline/page-pass.mjs streamed): K, its frontier F closed over the table groups
// (layer-proto/cut.mjs wholeFrontier) and each page's need bound (need.mjs needBound), over the units in K for good and the left
// as they stand when a part is tried. The stream tries one after every page, and a try may change nothing K is made of
// (2610.19159v1: 161 tries for 6 parts, 152 of them over the same units and left, made again each time from scratch, a third of
// its maker's time on one core). So K is made again only from what changed: the same units with the same rows and the same left
// give the last K, F and NB (each a function of them alone); a unit's rows are asked of the maker once (final once it is
// settled; a stub once it is told, asked again then), and its entry's own pages are read once a state, from its rows and its left
// rectangles (cut.mjs entriesOf `cache`). What a try that changed something makes again over the whole paper is the cheap part:
// K's order, each entry's lead on a shared line, F and NB. And, as functions of what they are given, where the left stands and
// whether a part may be cut over them (leftBoundsOf, partClosable), which the page pass asks after every page.
//
// An original module (no port statement). It reads the left and asks the maker, and keeps what it read between calls.
import { PART_PAGES_MAX, wholeFrontier } from '../layer-proto/cut.mjs'
import { partTarget } from '../layer-proto/format.mjs'
import { leftStreams, needBound } from '../layer-proto/need.mjs'

/** the tables of a layout file whose rows are each one unit's (its id first): every one but the names */
const UNIT_TABLES = ['units', 'lines', 'frames', 'erase', 'ph', 'labels', 'headings', 'pageText', 'held', 'colours']

/**
 * K, F and NB as the page stream's pages come. `paper` { id, version }, `N` its pages, `bundle` its units, `grouped`
 * groupsOfUnits(bundle), `left` the left (`units()` its units as they stand), `st` the maker's stream (`layout(ids)` the rows of
 * units `ids`, make.mjs partOf's; null: no layout). Returns:
 * - `of(ids)`: { K, F, NB } over the units `ids` (rising: those in K for good) and the left's units, wholeFrontier's and
 *   needBound's over `st.layout(ids)`. The same units with the same rows and the same left as the call before: that call's.
 * - `told(ids)`: the units the maker was told (make.mjs `tell`): the rows of each told for the first time asked again (a stub).
 * - `work`: { made, rows, entries }, the times K was made, the units whose rows were asked, the entries' own pages read.
 */
export function frontierStream({ paper, N, bundle, grouped, left, st }) {
  const work = { made: 0, rows: 0, entries: 0 }
  /** each unit's rows (a table to its rows), asked once; and the file's own fields, a layout's but its rows */
  const rows = new Map()
  let frame = null
  /** the units in K now: a unit's rows are read for its entry only while it is one of them */
  let inK = new Set()
  const cache = { entries: new Map(), rows: id => (inK.has(id) ? rows.get(id) ?? null : null), built: 0 }
  /** the last call's units, left and what they gave */
  let last = null
  /** the units told so far */
  const stubs = new Set()
  /** the rows of units `ids` in one ask of the maker, split by unit (a row's first value is its unit's id) */
  const ask = ids => {
    const got = st.layout(ids)
    if (!frame) frame = { schema: got.schema, layout: got.layout, pdfjs: got.pdfjs, paper: got.paper, left: got.left, views: got.views, lineskip: got.lineskip }
    const per = new Map(ids.map(i => [i, Object.fromEntries(UNIT_TABLES.map(t => [t, []]))]))
    for (const t of UNIT_TABLES) for (const r of got[t] ?? []) per.get(r[0])?.[t].push(r)
    for (const [i, r] of per) rows.set(i, r)
    work.rows += ids.length
  }
  /** the layout of units `ids` as the maker's would hold their rows: each table their rows in order of id; no name (K reads
   *  none) */
  const layoutOf = ids => {
    const out = { ...frame, fonts: [], names: [] }
    for (const t of UNIT_TABLES) out[t] = []
    for (const i of ids) { const r = rows.get(i); for (const t of UNIT_TABLES) for (const x of r[t]) out[t].push(x) }
    return out
  }
  const same = (a, b) => a.length === b.length && a.every((x, k) => x === b[k])
  const sameLeft = (a, b) => a.length === b.length && a.every((w, k) => w[0] === b[k][0] && w[1] === b[k][1] && w[2] === b[k][2])
  return {
    work,
    of(ids) {
      const units = left.units()
      if (last && same(last.ids, ids) && sameLeft(last.units, units)) return last.made
      inK = new Set(ids)
      let layout = null
      if (st) {
        const want = ids.filter(i => !rows.has(i))
        if (want.length || !frame) ask(want)
        layout = layoutOf(ids)
      }
      const whole = { paper: { ...paper, pages: N }, units: bundle, left: { pages: left.pages, units }, layout }
      const before = cache.built
      const { K, F } = wholeFrontier(whole, undefined, grouped, cache)
      work.entries += cache.built - before
      work.made++
      last = { ids: ids.slice(), units, made: { K, F, NB: needBound(K, N) } }
      return last.made
    },
    told(ids) {
      // (a unit's rows become a stub once: told again, they stay as they are)
      for (const i of ids) if (!stubs.has(i)) { stubs.add(i); rows.delete(i); last = null }
    },
  }
}

/**
 * Where the left stands, for the page stream's parts (page-pass.mjs streamed), over its `n` units: `units` the left's units as
 * they stand ([id, stream, ...]), `done(i)` whether unit i's left anchor is final, `next` the left's next token (the first of the
 * page it has not anchored). Returns { slotLow, streamLow, uMin, streams }: the least slot in K each unit may get; the least
 * stream each may get as a left unit (its own, `next` for one not final, none for one the left holds no unit of); the smallest
 * unit whose left anchor is not final; and the final left units' streams (need.mjs leftStreams)
 */
export function leftBoundsOf({ units, done, next }, n) {
  const stream = new Map(), final = new Map()
  for (const w of units) stream.set(w[0], w[1])
  const slotLow = new Float64Array(n), streamLow = new Float64Array(n)
  let uMin = n
  for (let i = 0, before = -1; i < n; i++) {
    const s = stream.get(i)
    if (!done(i)) { if (uMin === n) uMin = i; slotLow[i] = Math.min(next, before + 0.5); streamLow[i] = next } else {
      slotLow[i] = s === undefined ? before + 0.5 : s
      streamLow[i] = s === undefined ? Infinity : s
      if (s !== undefined) final.set(i, s)
    }
    if (s !== undefined && s > before) before = s
  }
  return { slotLow, streamLow, uMin, streams: leftStreams(final) }
}

/**
 * Whether the page stream may cut the part from page `a` now, everything it reads final: the last page it takes (its target as
 * the cutter makes it), or 0. `K`, `F`, `NB` the frontier over the units in K for good (frontierStream's), `H` the pages done,
 * `N` the paper's pages and `n` its units, `now` leftBoundsOf's, `inK(i)` whether unit i is in K for good, `made` the pages the
 * maker let go (null: no layout), `members` each table group's units
 */
export function partClosable({ K, F, NB, a, H, N, n, now, inK, made, members }) {
  let target = Math.min(partTarget(a, N), a + PART_PAGES_MAX - 1)
  const limit = Math.min(N, a + PART_PAGES_MAX - 1)
  for (let q = a, m = 0, turns = 0; turns <= N; turns++) {
    for (; q <= target; q++) m = Math.max(m, NB[q])
    const next = Math.min(m, limit)
    if (next <= target) break
    target = next
  }
  // (the paper's last page: the part takes every entry left, the whole)
  if (target >= N) return 0
  const upTo = F[target]
  let R = target
  for (let q = a; q <= target; q++) R = Math.max(R, NB[q])
  for (let k = 0; k <= upTo; k++) R = Math.max(R, K[k].last)
  for (let grew = true; grew;) { grew = false; for (const e of K) if (e.first <= R && e.last > R) { R = e.last; grew = true } }
  if (R > H) return 0
  let sigma = upTo >= 0 ? K[upTo].slot : -Infinity
  const groups = new Set()
  K.forEach((e, k) => {
    if (k > upTo && !(e.first <= R)) return
    if (e.slot > sigma) sigma = e.slot
    if (e.group !== null) groups.add(e.group)
  })
  for (let i = 0; i < n; i++) if (!inK(i) && now.slotLow[i] <= sigma) return 0
  if (now.uMin < n) for (const e of K) if (e.slot <= sigma && !e.left && e.id > now.uMin) return 0
  // (a layout-only unit that shares one of TeX's lines with a left unit stands beside it, whatever its id (need.mjs lineAfterOf):
  // one whose line is not all made yet may still take such a place, beside a left unit not in K for good or one whose rows' pages
  // are not all let go, the least of which streams at `low`. After such a unit it stands past `low`; before it, a chain of them
  // the file's alone, each before the next, down to the stream right below that unit's and a half (fromRight: no lower, within
  // the room after the left unit before it), every left unit below `low` final. So no slot of the part's from there on: at worst
  // it waits for that unit's line, which every entry the part takes has already. With streams 10 and 12 two such units before
  // 12 stand 10.5 and 11.5: half a step below 12 alone let a part close at 10.5 that the first of them, smaller by id, sorts
  // before)
  if (made !== null) {
    let low = Infinity
    for (let i = 0; i < n; i++) if (!inK(i) && now.streamLow[i] < low) low = now.streamLow[i]
    for (const e of K) if (e.left && e.last > made && e.slot < low) low = e.slot
    if (low < Infinity && now.streams.below(low) + 0.5 <= sigma) return 0
  }
  for (const g of groups) for (const i of members.get(g) ?? []) if (!inK(i)) return 0
  return target
}
