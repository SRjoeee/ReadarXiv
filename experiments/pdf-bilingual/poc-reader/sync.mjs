// Synchronised scrolling, the part with no DOM: the units both sides are read by, a coordinate through them that does
// not depend on either layout, and a map between the two sides' scroll positions, whose slope over the reader's view is
// the speed the "matched" mode moves the other side at. The reader (reader.js) measures the lines and moves the panes
// (REPORT, sixteenth addendum).
//
// The coordinate λ: the chain's k-th unit covers [k, k + 1), and on each side its i-th of n lines covers
// [k + i/n, k + (i + 1)/n). A side's position at λ is a height in its scroll coordinates, and the line at a height is a λ:
// the two sides meet in λ, whatever their layouts.

/**
 * The units the two sides are read by, in the order both read them: of `units` ([{ id, L, R }] in source order, each
 * side { stream, lines }), the heaviest run whose stream index — the text layer's reading order — rises on both sides,
 * weighed by lines. A unit found out of order on one side would fold the map back; ordered by height instead, the two
 * columns of a page interleave and most units drop out (72 of 132 kept on 2608.04322, measured)
 */
export function flowChain(units) {
  const n = units.length, best = new Array(n), prev = new Array(n).fill(-1)
  let tail = -1
  for (let a = 0; a < n; a++) {
    const w = units[a].L.lines.length + units[a].R.lines.length
    best[a] = w
    for (let b = 0; b < a; b++) {
      if (units[b].L.stream < units[a].L.stream && units[b].R.stream < units[a].R.stream && best[b] + w > best[a]) { best[a] = best[b] + w; prev[a] = b }
    }
    if (tail < 0 || best[a] > best[tail]) tail = a
  }
  const out = []
  for (let a = tail; a >= 0; a = prev[a]) out.unshift(units[a])
  return out
}

/** one side's lines of the chain in λ order: { lam0, lam1, top, bot, band, page, k } */
export function lineTable(chain, side) {
  const out = []
  chain.forEach((u, k) => {
    const lines = u[side].lines, n = lines.length
    lines.forEach((l, i) => out.push({ ...l, lam0: k + i / n, lam1: k + (i + 1) / n, k }))
  })
  return out
}

/** the line of a table that holds λ (the last one when λ is past the end), by bisection */
function lineIndex(table, lam) {
  let lo = 0, hi = table.length - 1
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (table[mid].lam0 <= lam) lo = mid; else hi = mid - 1 }
  return lo
}
/** a side's height at λ: down its line in proportion */
export function posAt(table, lam) {
  if (!table.length) return 0
  const l = table[lineIndex(table, lam)], f = Math.min(1, Math.max(0, (lam - l.lam0) / (l.lam1 - l.lam0)))
  return l.top + f * (l.bot - l.top)
}
/**
 * Knots (pairs of heights, left and right) of the map between the two sides: at every line boundary of either side —
 * within a unit, a line's end on one side meets the same λ on the other — where both sides' lines run across the page;
 * where either side sets the text in two columns no map keeps every paragraph level (reading order is not scroll order
 * there), and one knot per page of the left side stands for its lines: their mean height against the mean height of
 * their λ on the right. Kept only where both heights rise, between the two documents' ends
 */
export function knots(chain, L, R, { endL, endR }) {
  const raw = []
  const isDouble = k => chain[k].L.lines.some(l => l.band !== 'full') || chain[k].R.lines.some(l => l.band !== 'full')
  // a side's height just before λ (the end of the line that ends there) and just after it (the line that starts there)
  const before = (t, lam) => { const i = lineIndex(t, lam); return t[i].lam0 === lam && i > 0 ? t[i - 1].bot : posAt(t, lam) }
  const after = (t, lam) => posAt(t, lam)
  for (let k = 0; k < chain.length; k++) {
    if (isDouble(k)) {
      // a run of two-column units: one knot per left page, its ends tied to the units around it
      let e = k
      while (e + 1 < chain.length && isDouble(e + 1)) e++
      raw.push([after(L, k), after(R, k)])
      const byPage = new Map()
      for (const l of L) if (l.k >= k && l.k <= e) (byPage.get(l.page) ?? byPage.set(l.page, []).get(l.page)).push(l)
      for (const ls of byPage.values()) {
        const mean = f => ls.reduce((s, l) => s + f(l), 0) / ls.length
        raw.push([mean(l => (l.top + l.bot) / 2), mean(l => posAt(R, (l.lam0 + l.lam1) / 2))])
      }
      raw.push([before(L, e + 1), before(R, e + 1)])
      k = e
      continue
    }
    const cuts = new Set([k, k + 1])
    for (const t of [L, R]) for (const l of t) if (l.k === k && l.lam0 > k) cuts.add(l.lam0)
    for (const lam of [...cuts].sort((a, b) => a - b)) {
      if (lam > k) raw.push([before(L, lam), before(R, lam)])
      if (lam < k + 1) raw.push([after(L, lam), after(R, lam)])
    }
  }
  return rising(raw, endL, endR)
}

/**
 * The most knots that rise on both sides, between the two documents' ends: sorted by the left height, the longest run
 * rising on the right too. Taken greedily in reading order, one knot set too low on the right had dropped every knot
 * after it that stood higher (A followed at 2,910 px of the right's 7,273 on 2608.02163)
 */
function rising(raw, endL, endR) {
  const pts = raw.filter(p => p[0] > 0.5 && p[1] > 0.5 && p[0] < endL - 0.5 && p[1] < endR - 0.5)
  // by the left height, and at one left height the higher right first, so that one height gives at most one knot
  pts.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const tails = [], prev = new Array(pts.length).fill(-1)
  for (let i = 0; i < pts.length; i++) {
    let lo = 0, hi = tails.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (pts[tails[mid]][1] < pts[i][1] - 0.5) lo = mid + 1; else hi = mid }
    if (lo > 0) prev[i] = tails[lo - 1]
    tails[lo] = i
  }
  const out = []
  for (let i = tails.at(-1) ?? -1; i >= 0; i = prev[i]) out.unshift(pts[i])
  // two knots within half a pixel on the left would make the curve all but vertical there
  const kept = [[0, 0]]
  for (const p of out) if (p[0] > kept.at(-1)[0] + 0.5) kept.push(p)
  kept.push([endL, endR])
  return kept
}

/**
 * A map through knots, both ways, as a monotone C¹ curve (Steffen's tangents: no overshoot, so a slope taken over a view
 * is never negative). { ltr(y), rtl(y) }
 */
export function makeMap(pts) {
  const mono = (xs, ys) => {
    const n = xs.length, h = [], s = [], m = new Array(n).fill(0)
    for (let i = 0; i + 1 < n; i++) { h.push(xs[i + 1] - xs[i]); s.push((ys[i + 1] - ys[i]) / h[i]) }
    for (let i = 1; i + 1 < n; i++) {
      const p = (s[i - 1] * h[i] + s[i] * h[i - 1]) / (h[i - 1] + h[i])
      m[i] = (Math.sign(s[i - 1]) + Math.sign(s[i])) * Math.min(Math.abs(s[i - 1]), Math.abs(s[i]), 0.5 * Math.abs(p))
    }
    if (n > 1) { m[0] = s[0]; m[n - 1] = s[n - 2] }
    return x => {
      if (n < 2) return ys[0] ?? x
      let lo = 0, hi = n - 1
      if (x <= xs[0]) return ys[0] + (x - xs[0]) * s[0]
      if (x >= xs[hi]) return ys[hi] + (x - xs[hi]) * s[n - 2]
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid }
      const t = (x - xs[lo]) / h[lo], t2 = t * t, t3 = t2 * t
      return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h[lo] * m[lo] + (-2 * t3 + 3 * t2) * ys[hi] + (t3 - t2) * h[lo] * m[hi]
    }
  }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  return { ltr: mono(xs, ys), rtl: mono(ys, xs) }
}
