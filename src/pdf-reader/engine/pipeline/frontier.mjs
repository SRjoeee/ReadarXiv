// What the page stream cuts each part on (pipeline/page-pass.mjs streamed): K, its frontier F closed over the table groups
// (layer-proto/cut.mjs wholeFrontier) and each page's need bound (need.mjs needBound), over the units in K for good and the left
// as they stand when a part is tried. The stream tries one after every page, and a try may change nothing K is made of
// (2610.19159v1: 161 tries for 6 parts, 152 of them over the same units and left, made again each time from scratch, a third of
// its maker's time on one core). So K is made again only from what changed: the same units with the same rows and the same left
// give the last K, F and NB (each a function of them alone); a unit's rows are asked of the maker once (final once it is
// settled; a stub once it is told, asked again then), and its entry's own pages are read once a state, from its rows and its left
// rectangles (cut.mjs entriesOf `cache`). What a try that changed something makes again over the whole paper is the cheap part:
// K's order, each entry's lead on a shared line, F and NB.
//
// An original module (no port statement). It reads the left and asks the maker, and keeps what it read between calls.
import { wholeFrontier } from '../layer-proto/cut.mjs'
import { needBound } from '../layer-proto/need.mjs'

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
