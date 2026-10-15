// What laying a paper's pages reads of its units' rows: the rule the door's `waiting` state follows and the cutter's frontier
// (cut.mjs) closes a part by. A leaf with no imports, so that the server's entry may hold it (run.mjs, the door, cannot load in
// node); moved out of run.mjs unchanged.

/**
 * What laying a paper's pages reads of its units' rows, by page: the index into the units v0 may place, in the stream's
 * order (`K`: each with `lists`, the pages each of its sources would draw it on, and `reach`, every page their lines are
 * on), up to which every unit must be in and decided. `lay[g]`, to lay the units page g's drawing lays: layGroups'
 * groups up to g (every unit that may be on a page up to g, and so every one before it in the stream, whose batches
 * they are), the page passes' counts of the units on each, and the units only the file holds (`fileOnly`) on the pages
 * their lines read others on (rectsByPage). `done[p]`, to know the page after whose units page p is done (doneAt: the
 * units on p and, with a page pass (`passes`), on each one's first page). `complete[p]`, both, up to the latest page p
 * may be done after.
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
  return { lay, done, complete: done.map((d, p) => Math.max(d, lay[Math.min(bound[p], N)])) }
}
