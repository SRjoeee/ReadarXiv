// What laying a paper's pages reads of its units' rows: the rule the door's `waiting` state follows and the cutter's frontier
// (cut.mjs) closes a part by. A leaf with no imports, so that the server's entry may hold it (run.mjs, the door, cannot load in
// node); moved out of run.mjs unchanged. Two rules: needsOf, what laying the pages in order reads (a prefix of the stream), and
// closureOf, what laying one page alone reads (Need(p), the 1b-D design §1), which the door lays a page asked by. And one read
// of a unit's lay by another's that both hold their K by: a shared line (rowLeadOf, `follows`).

// ---- a shared line: a unit whose first row TeX set on the line another unit's last row ends (a run-in heading and its text,
// a paragraph's two parts a float split, a head set apart from its text), laid from where that unit's translation ends on the
// line (run.mjs layout2): its lay reads that unit's, which Need lays with it (`follows`)

/** a shared line's separation at most, in em of the row's size: a run-in head's \quad, a float split's word space */
export const SHARED_SEP = 3
/** the kinds whose rows share a baseline by their own placing, never as one line of text: a table's cells (each at its
 *  column's place in its alignment) and a figure's text */
const OWN_PLACE = new Set(['cell', 'figure'])
/** the column (the frame's) of a unit's row j in the layout file, -1 for none */
function columnOf(u, j) {
  const F = u.frames
  for (let f = 0; f + 5 < F.length; f += 6) if (j >= F[f + 2] && j < F[f + 2] + F[f + 3]) return F[f + 1]
  return -1
}
/**
 * The unit a unit's first row continues on one of TeX's lines, by the layout file (`index`: layout/file.mjs indexLayout's, or
 * the door's facade over it): of the units framed on that row's page before it in the lay order (`before(aid)`: an entry of K
 * before its own; with none given, before it in the paper, a smaller id), the one whose last row is on the row's
 * baseline in its column (the frames'), ends at or before its start and no more than SHARED_SEP em of its size from it, the
 * nearest. Neither unit a table's cell or a figure's text (OWN_PLACE), and neither row held (its ink stays the original's: a
 * translation set over it would cover it). Returns the lead's last row { id, page, baseline, x0, x1, size }, or null.
 * 1810.04805's "Model Architecture" and its text, 10.9 pt apart on one row (a \quad of 10.91 pt type). The run and the cut
 * pass `before`: the entries of K before a unit's are all told with it (a part tells a prefix of K, each entry with its
 * layout rows), so the door's facade answers as the whole layout does however the parts come, where a smaller id told by a
 * later part would have changed the answer between a streamed and a whole opening. The order is K's alone then, not the ids':
 * an ink unit is numbered after every source unit, and a theorem's head whose note is a citation is one (own.mjs `labelKept`,
 * ink-pass.mjs labelsOverInk), before its text in the stream: 2610.40645v1 p15's "Theorem 3.3 ([Ang, Theorem 1.1]).", u380,
 * and u110's text after it on the row, which was laid where the English head ended, a blank after the translated head
 */
export function rowLeadOf(index, id, before = null) {
  const b = index?.unit(id)
  if (!b?.lines.length || OWN_PLACE.has(b.kind) || b.held.includes(0)) return null
  const L = b.lines, page = L[0], x0 = L[1], base = L[3], size = L[6], col = columnOf(b, 0)
  let best = null
  for (const aid of index.onPage(page)) {
    if (before ? !before(aid) : !(aid < id)) continue
    const a = index.unit(aid)
    if (!a?.lines.length || OWN_PLACE.has(a.kind)) continue
    const j = a.lines.length / 8 - 1, o = 8 * j, A = a.lines
    // (one of TeX's lines: one baseline, as the file writes it to a hundredth)
    if (A[o] !== page || Math.abs(A[o + 3] - base) > 0.005 || a.held.includes(j) || columnOf(a, j) !== col) continue
    const x1 = A[o + 2]
    if (x1 > x0 + 0.5 || x0 - x1 > SHARED_SEP * size) continue
    if (!best || x1 > best.x1) best = { id: aid, page, baseline: A[o + 3], x0: A[o + 1], x1, size: A[o + 6] }
  }
  return best
}

/**
 * What laying a paper's pages reads of its units' rows, by page: the index into the units v0 may place, in the stream's
 * order (`K`: each with `lists`, the pages each of its sources would draw it on, and `reach`, every page their lines are
 * on), up to which every unit must be in and decided. `lay[g]`, to lay the units page g's drawing lays: layGroups'
 * groups up to g (every unit that may be on a page up to g, and so every one before it in the stream, whose batches
 * they are), the page passes' counts of the units on each, and the units only the file holds (`fileOnly`) on the pages
 * their lines read others on (rectsByPage). `done[p]`, to know the page after whose units page p is done (doneAt: the
 * units on p and, with a page pass (`passes`), on each one's first page). `complete[p]`, both, up to the latest page p
 * may be done after, which is `bound[p]`.
 */
export function needsOf(K, N, passes, fileOnly) {
  const lp = new Array(N + 1).fill(-1), dp = new Array(N + 1).fill(-1), far = Array.from({ length: N + 1 }, (_, p) => p)
  const fileOn = new Map(), on = Array.from({ length: N + 1 }, () => [])
  K.forEach((c, i) => { if (fileOnly(c) && c.lists.length) for (const x of c.reach) fileOn.set(x, i) })
  K.forEach((c, i) => {
    if (!c.lists.length) return
    const pages = [...new Set(c.lists.flat())], last = Math.max(...pages)
    lp[Math.min(...pages)] = i
    let dep = -1
    for (const x of c.reach) dep = Math.max(dep, fileOn.get(x) ?? -1)
    // (its lay reads the file's units on its lines' pages: wanted from the first page whose drawing may lay it)
    const soonest = Math.min(...c.lists.map(l => Math.max(...l)))
    dp[soonest] = Math.max(dp[soonest], dep)
    for (const x of pages) { far[x] = Math.max(far[x], last); on[x].push(c) }
  })
  for (let g = 1; g <= N; g++) { lp[g] = Math.max(lp[g], lp[g - 1]); dp[g] = Math.max(dp[g], dp[g - 1]) }
  const lay = lp.map((v, g) => Math.max(v, dp[g]))
  // doneAt's first part, a page's units' last pages, is at most far; a page pass adds the first page's doneAt, final
  // where it is before the page, its first part where after
  const done = lp.slice(), bound = far.slice()
  if (passes) for (let p = 1; p <= N; p++) {
    done[p] = Math.max(done[p], done[p - 1])
    for (const c of on[p]) for (const l of c.lists) {
      const f = l[0]
      if (f > p) { done[p] = Math.max(done[p], lp[f]); bound[p] = Math.max(bound[p], far[f]) }
      else if (f < p) bound[p] = Math.max(bound[p], bound[f])
    }
  }
  return { lay, done, complete: done.map((d, p) => Math.max(d, lay[Math.min(bound[p], N)])), bound }
}

// ---- Need(p): what laying page p reads, whatever page was laid before it (the 1b-D design §1.2). After 1b-A to 1b-C every
// read a unit's lay or a page's pass makes of another page is one of four: the unit's own pages (its lines' and its
// placeholders' segments', R1, R8), its growth pages' units as ranked there (S4's page step, R2, R3), its first page's pass
// (S3, R4, R5) and page 1's setup (R11). Need(p) is closed over those, one level deep (a pass reads its units' fits and only
// fit-time numbers of a unit running on to it, so pass(q) never needs pass(q − 1))

/** each K, the index closureOf reads it by: the entries listing each page (U), those whose lines reach it (Ur), the members of
 *  each table group, and lp (the last entry first framed by each page, needsOf's) */
const indexes = new WeakMap()
function indexOf(K, N, fileOnly) {
  const was = indexes.get(K)
  if (was && was.n === K.length && was.N === N && was.fileOnly === fileOnly) return was
  const U = Array.from({ length: N + 1 }, () => []), Ur = new Map(), members = new Map(), lp = new Int32Array(N + 1).fill(-1), at = new Map()
  K.forEach((c, i) => {
    if (c.id !== undefined) at.set(c.id, i)
    const pages = new Set()
    for (const l of c.lists) for (const q of l) if (q >= 1 && q <= N) pages.add(q)
    for (const q of pages) U[q].push(i)
    for (const g of c.reach) (Ur.get(g) ?? Ur.set(g, []).get(g)).push(i)
    if (c.group !== undefined && c.group !== null) (members.get(c.group) ?? members.set(c.group, []).get(c.group)).push(i)
    if (c.lists.length) { const m = Math.min(...c.lists.flat()); if (m >= 1 && m <= N) lp[m] = i }
  })
  for (let g = 1; g <= N; g++) lp[g] = Math.max(lp[g], lp[g - 1])
  // (each entry's `follows` as an index of K: the unit whose lay its own reads, which comes before it in K)
  const follows = K.map(c => (c.follows === undefined || c.follows === null ? -1 : at.get(c.follows) ?? -1))
  const index = { n: K.length, N, fileOnly, U, Ur, members, lp, follows }
  indexes.set(K, index)
  return index
}
const DEFAULT_FILE_ONLY = c => !c.rects
const ascending = s => [...s].sort((a, b) => a - b)

/** pass(q): q and the first page of every unit listed on it (the pages whose passes set the units drawn on q) */
function passOf(K, X, q) {
  const out = new Set([q])
  for (const i of X.U[q] ?? []) for (const l of K[i].lists) out.add(l[0])
  return out
}

/**
 * Need(p) over K (each entry `lists`, `reach`, `rects`, and those the door and the cutter both hold: `reads`, the pages of its
 * placeholders' segments, `group`, its table group, and `id` and `follows`, the id of the entry before it whose last row its
 * first continues on a shared line), for a paper of N pages. The pages and entries laying page p reads,
 * whatever was laid before it:
 * - `pass`: p and the first page of every unit on p, the passes whose units p draws;
 * - `lay`: every entry on a pass page (K indices), and the entry each one `follows` (its first row continues that one's last on
 *   a shared line: its lay reads that one's, rowLeadOf), and so on: of them the placed units are laid, the rest only decided;
 * - `draw`: page 1 (its setup: the designs, the family, the faces), p, and every page a `lay` entry reads, its lines' (`reach`)
 *   and its placeholders' segments' (`reads`), in page order;
 * - `rows`: the entries decided (K indices): `lay`; every entry whose lines reach a page a `lay` entry grows on (its rank
 *   peers: a unit grows on a page after every unit ranked before it there, S4); every entry only the layout file holds
 *   (`fileOnly`) whose lines reach a page a peer's lines do (keepAll reads the units placed on those pages); every member of
 *   the table group of any of these; and, where a peer runs on from page 1 to page x, every entry up to the last first framed
 *   by x (layGroups' first batches: the rank of a unit framed on page 1 against one framed on x depends on whether a batch of
 *   eight holds both, so on how many units before them are placed). That last rule is taken over every peer, not only over
 *   those whose page x is a growth page: two peers' order on a growth page is their order on x before it;
 * - `ready`: the pages of `draw` whose own closure lies inside this one (pass(q) ⊆ pass(p)), p among them: laid with p;
 * - `bound`: the last page whose part this closure reads, the last of `draw` and of the pages the peers' lines reach (a page
 *   reached by any entry not told yet would add a peer or a layout-only unit). An entry the cut has not told is first framed
 *   past every page a part covers (C3b), so once the parts cover `bound` the closure over K so far is the paper's: the batch
 *   rule's entries are a prefix of the stream told with the page they are framed by, and a table group is told whole (M18).
 * `o.orderFree` false (rules whose page pass reads a unit running on to it laid, `even` > 0 or the leftover packed, or that
 * paint as each unit is laid, no pass at all): the prefix needsOf lays in order, `o.passes` its page passes: pages 1 to B
 * (B: needsOf's `bound[p]`, the latest page p may be done after) passed, K up to `complete[p]` decided and laid, those pages
 * and every page those entries read drawn (its bound the last of them), the pages that are done by B ready.
 */
export function closureOf(K, N, p, { fileOnly = DEFAULT_FILE_ONLY, orderFree = true, passes = true } = {}) {
  if (!orderFree) {
    const need = needsOf(K, N, passes, fileOnly), B = need.bound[p], upTo = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i)
    const rows = upTo(0, need.complete[p])
    // (and every page its entries read, as the order-free closure's draw is: a unit of the prefix may cut a crop from a page
    // past B, or have the lines of its other source there)
    const draw = new Set(upTo(1, B))
    for (const i of rows) {
      const c = K[i]
      if (!c) continue
      for (const q of [...c.reach, ...(c.reads ?? [])]) if (q >= 1 && q <= N) draw.add(q)
    }
    const pages = ascending(draw)
    return { pass: upTo(1, B), lay: rows, draw: pages, rows: rows.slice(), ready: upTo(1, B).filter(q => need.bound[q] <= B), bound: Math.max(B, pages.at(-1) ?? B) }
  }
  const X = indexOf(K, N, fileOnly)
  const pass = passOf(K, X, p)
  const lay = new Set()
  for (const f of pass) for (const i of X.U[f] ?? []) lay.add(i)
  // (and the unit each one's first row continues on a shared line, and so on along the line: its lay reads theirs)
  for (const i of [...lay]) for (let j = X.follows[i]; j >= 0 && !lay.has(j); j = X.follows[j]) lay.add(j)
  const draw = new Set([1, p]), grows = new Set()
  for (const i of lay) {
    const c = K[i]
    for (const q of c.reach) { grows.add(q); if (q >= 1 && q <= N) draw.add(q) }
    for (const q of c.reads ?? []) if (q >= 1 && q <= N) draw.add(q)
  }
  const peers = new Set(lay)
  for (const g of grows) for (const i of X.Ur.get(g) ?? []) peers.add(i)
  const reached = new Set()
  for (const i of peers) for (const q of K[i].reach) reached.add(q)
  const rows = new Set(peers)
  for (const q of reached) for (const i of X.Ur.get(q) ?? []) if (fileOnly(K[i])) rows.add(i)
  for (const i of [...rows]) { const g = K[i].group; if (g !== undefined && g !== null) for (const j of X.members.get(g)) rows.add(j) }
  for (const i of peers) for (const l of K[i].lists) if (l[0] === 1 && l.length > 1 && l[1] <= N) for (let j = 0; j <= X.lp[l[1]]; j++) rows.add(j)
  let bound = Math.max(...draw)
  for (const q of reached) if (q <= N && q > bound) bound = q
  const ready = []
  for (const q of ascending(draw)) { let inside = true; for (const f of passOf(K, X, q)) if (!pass.has(f)) { inside = false; break } if (inside) ready.push(q) }
  return { pass: ascending(pass), lay: ascending(lay), draw: ascending(draw), rows: ascending(rows), ready, bound }
}

/** each page's closure bound (closureOf's `bound`), page 0's 0: what the cut closes a part over so that every page it covers
 *  is laid with no later part (the cutter's B3) */
export function needBound(K, N, { fileOnly = DEFAULT_FILE_ONLY } = {}) {
  const out = new Int32Array(N + 1)
  for (let p = 1; p <= N; p++) out[p] = closureOf(K, N, p, { fileOnly }).bound
  return out
}
