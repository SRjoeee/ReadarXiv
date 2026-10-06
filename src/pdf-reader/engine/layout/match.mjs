// A placeholder's own ink carried to arXiv's PDF and matched there, glyph by glyph (Plan 8b, Task 6b; the stream
// ownership spike of 2026-10-06). The marks file holds each piece's own glyphs and rules as the marked compile set them
// (layout/stream.mjs, by content-stream order); each is carried by its line (carry.mjs) and matched to arXiv's glyph of
// the same character near where the carry puts it, as a sequence: the first within FIRST_X, each next at the previous
// match's offset first (a glyph's own carry can be another line's: a lone limit is a line of one token, which the
// carrier may pair with a copy of its letter elsewhere), then at its own carry with the run's correction (a respaced
// line's carry drifts with its word spacing), then anchored again within RE_X. The run is also tried from the carried
// opening mark, up to the carried closing mark, and from the next line's start or the previous line's end on arXiv's
// page (a line TeX broke elsewhere there), the run that matches most kept; one still short, a display's rows its
// carrier did not place, is registered as a rigid block by a vote. Two guards: a run prefers its neighbours' offset to
// a glyph's own carry, and a match whose offset jumps away from both its matched neighbours' is rejected. The
// character must be the same (NFKC), or the glyph the same at its place and size under another Unicode (arXiv's older
// TeX gives cmex and txexs glyphs raw codes: a sum as P or Í), or, loosely, at its x anywhere on its line (2307.16209's
// footnote numbers set on the line at the text's size). One arXiv glyph and box to one piece, in reading order.
// Imports nothing: arithmetic over the maker's arrays.

const FIRST_X = 8, RE_X = 3, NEXT_X = 1.2, Y_TOL = 0.6, SAME = 0.4, LOOSE_X = 1.5, LOOSE_Y = 6
/** a match off the run: its offset this far from each of its matched neighbours' (x, y), or on another page */
const OFF_X = 4, OFF_Y = 2
/** the vote: arXiv's glyphs of a character within VOTE_WIN of where an owned glyph is carried, their offsets to a fifth
 *  of a point; the winning offset's matches within VOTE_TOL; at least VOTE_MIN votes */
const VOTE_WIN = 80, VOTE_TOL = 0.4, VOTE_MIN = 3
/** a rule matched to arXiv's box at the offset of the owned glyph nearest it, each edge within RULE_TOL */
const RULE_TOL = 1.2
/** a glyph with no line of its own (a raised big operator) carried at a mark's line it stands within this of */
const SCRIPT = size => 0.6 * Math.max(size, 5) + 1.5
/** the glyph visits a paper's matching may cost: the real papers' heaviest costs a few million */
export const MATCH_WORK = 50_000_000

const NF = s => s.normalize('NFKC').replace(/\s/g, '')

/**
 * The matcher of a paper: `ink[page]` arXiv's glyphs (the maker's arrays, by baseline: n, x0, x1, y, size, u, taken)
 * and boxes (boxes, boxTaken); `carry(page, x, y)` a position of the marked compile on arXiv's page, or null.
 * `match(items, rules, A, B)` matches a piece's own glyphs ({ page, x0, y, size, u } of the marked compile, in stream
 * order) and rules ({ page, x0, y0, x1, y1 }), A and B its opening and closing marks ({ page, x, y } or null): every one
 * matched, { glyphs, boxes } ([page, index] on arXiv's PDF, in the items' order), or { why }. What it matched is taken,
 * whole or not. `stats`: the matches by kind, those rejected, and the work
 */
export function matcherOf({ ink, carry }) {
  const stats = { same: 0, recoded: 0, loose: 0, vote: 0, rejected: 0, work: 0, over: 0 }
  let work = 0
  const lowest = (P, y) => { let lo = 0, hi = P.n; while (lo < hi) { const m = (lo + hi) >> 1; if (P.y[m] < y) lo = m + 1; else hi = m } return lo }

  /** one glyph's match on arXiv's page near (X, Y), none taken nor in `local`: the same character within tx and ty;
   *  else the same glyph under another Unicode at its place (SAME) and of its size; with `loose`, the same character at
   *  its x within LOOSE_X and anywhere on its line (LOOSE_Y), of any size */
  function near(page, it, X, Y, tx, ty, local, loose) {
    const P = ink[page]
    if (!P) return null
    const u = NF(it.u)
    const scan = (yt, test) => {
      let best = -1, d = Infinity
      for (let g = lowest(P, Y - yt); g < P.n && P.y[g] <= Y + yt; g++) {
        work++
        if (P.taken[g] || local.has(`${page}|${g}`) || !test(g)) continue
        const dd = Math.abs(P.x0[g] - X) + Math.abs(P.y[g] - Y)
        if (dd < d) { d = dd; best = g }
      }
      return best
    }
    let g = scan(ty, h => Math.abs(P.x0[h] - X) <= tx && (P.u[h] === it.u || NF(P.u[h]) === u))
    if (g >= 0) return { g, how: 'same' }
    g = scan(SAME, h => Math.abs(P.x0[h] - X) <= SAME && Math.abs(P.y[h] - Y) <= SAME && Math.abs(P.size[h] / it.size - 1) <= 0.02)
    if (g >= 0) return { g, how: 'recoded' }
    if (loose) { g = scan(LOOSE_Y, h => Math.abs(P.x0[h] - X) <= LOOSE_X && (P.u[h] === it.u || NF(P.u[h]) === u)); if (g >= 0) return { g, how: 'loose' } }
    return null
  }

  /** where the carrier puts each owned glyph: at its own baseline, else at a mark's line it stands on, else by the
   *  offset of the nearest owned glyph carried on its page (a big operator's raised origin, a script) */
  function predict(items, A, B) {
    const cs = items.map(it => {
      let c = carry(it.page, it.x0, it.y)
      for (const d of [A, B]) if (!c && d && d.page === it.page && Math.abs(it.y - d.y) < SCRIPT(it.size)) { const f = carry(it.page, it.x0, d.y); if (f) c = { page: f.page, x: f.x, y: f.y + (it.y - d.y) } }
      return c ? { page: c.page, X: c.x, Y: c.y, dx: c.x - it.x0, dy: c.y - it.y } : null
    })
    const own = cs.map(c => c !== null)
    for (let j = 0; j < items.length; j++) {
      if (cs[j]) continue
      for (let d = 1; d < items.length && !cs[j]; d++) {
        for (const q of [j + d, j - d]) {
          if (cs[j] || !own[q] || items[q].page !== items[j].page) continue
          const b = cs[q]
          cs[j] = { page: b.page, X: items[j].x0 + b.dx, Y: items[j].y + b.dy, dx: b.dx, dy: b.dy }
        }
      }
    }
    return cs
  }

  /** the run matched from a start: each glyph at the previous match's offset first, then where the start puts it with
   *  the run's correction, then anchored again near either */
  function runFrom(items, start, loose) {
    const out = [], local = new Set()
    let cx = 0, cy = 0, first = true, last = null
    for (let j = 0; j < items.length; j++) {
      const it = items[j], c = start(j)
      if (!c) { out.push(null); continue }
      const X = c.X + cx, Y = c.Y + cy
      let m = null, pg = c.page
      if (last) { m = near(last.page, it, it.x0 + last.dx, it.y + last.dy, NEXT_X, Y_TOL, local, loose); if (m) pg = last.page }
      if (!m) { m = near(c.page, it, X, Y, first ? FIRST_X : NEXT_X, first ? 1 : Y_TOL, local, loose) ?? (first ? null : near(c.page, it, X, Y, RE_X, 1, local, false)); pg = c.page }
      if (!m && last) { m = near(last.page, it, it.x0 + last.dx, it.y + last.dy, RE_X, 1, local, false); if (m) pg = last.page }
      if (!m) { out.push(null); continue }
      const P = ink[pg]
      local.add(`${pg}|${m.g}`)
      out.push({ page: pg, g: m.g, how: m.how, ox: it.x0, oy: it.y })
      if (pg === c.page) { cx = P.x0[m.g] - c.X; cy = P.y[m.g] - c.Y }
      last = { page: pg, dx: P.x0[m.g] - it.x0, dy: P.y[m.g] - it.y }
      first = false
    }
    return out
  }

  /** the piece registered as a rigid block on arXiv's page: the offset most of its glyphs' characters agree on */
  function vote(items, cs, ca, A) {
    const pages = new Set(cs.filter(Boolean).map(c => c.page))
    if (ca) pages.add(ca.page)
    const votes = new Map()
    for (const page of pages) {
      const P = ink[page]
      if (!P) continue
      items.forEach((it, j) => {
        const guess = cs[j]?.page === page ? cs[j] : ca && ca.page === page && A ? { X: it.x0 + (ca.x - A.x), Y: it.y + (ca.y - A.y) } : null
        if (!guess) return
        const u = NF(it.u)
        for (let g = lowest(P, guess.Y - VOTE_WIN); g < P.n && P.y[g] <= guess.Y + VOTE_WIN; g++) {
          work++
          if (Math.abs(P.x0[g] - guess.X) > VOTE_WIN || P.taken[g] || (P.u[g] !== it.u && NF(P.u[g]) !== u)) continue
          const k = `${page}|${Math.round((P.x0[g] - it.x0) * 5)}|${Math.round((P.y[g] - it.y) * 5)}`
          votes.set(k, (votes.get(k) ?? 0) + 1)
        }
      })
    }
    let best = null, most = 0
    for (const [k, n] of votes) if (n > most) { most = n; best = k }
    if (!best || most < Math.min(VOTE_MIN, items.length)) return null
    const [page, kx, ky] = best.split('|').map(Number), local = new Set()
    return items.map(it => {
      const m = near(page, it, it.x0 + kx / 5, it.y + ky / 5, VOTE_TOL, VOTE_TOL, local, false)
      if (!m) return null
      local.add(`${page}|${m.g}`)
      return { page, g: m.g, how: 'vote', ox: it.x0, oy: it.y }
    })
  }

  /** a match whose offset jumps away from both its matched neighbours' is none */
  function rigid(out) {
    const idx = out.map((x, j) => (x ? j : -1)).filter(j => j >= 0)
    const off = x => [ink[x.page].x0[x.g] - x.ox, ink[x.page].y[x.g] - x.oy]
    const bad = []
    for (let q = 0; q < idx.length; q++) {
      const x = out[idx[q]], ns = [idx[q - 1], idx[q + 1]].filter(n => n !== undefined).map(n => out[n])
      if (!ns.length) continue
      const [ax, ay] = off(x)
      if (ns.every(n => { const [bx, by] = off(n); return n.page !== x.page || Math.abs(bx - ax) > OFF_X || Math.abs(by - ay) > OFF_Y })) bad.push(idx[q])
    }
    for (const j of bad) { out[j] = null; stats.rejected++ }
    return out
  }

  /** each owned rule matched to arXiv's box: at the offset of the matched glyph nearest it in the marked compile, or of
   *  the carried opening mark where it has none */
  function rules(list, items, out, ca, A) {
    const boxes = []
    for (const r of list) {
      let best = null, d = Infinity
      items.forEach((it, j) => {
        const x = out[j]
        if (!x || it.page !== r.page) return
        const dd = Math.hypot((r.x0 + r.x1) / 2 - it.x0, (r.y0 + r.y1) / 2 - it.y)
        if (dd < d) { d = dd; best = { page: x.page, dx: ink[x.page].x0[x.g] - it.x0, dy: ink[x.page].y[x.g] - it.y } }
      })
      if (!best && ca && A && A.page === r.page) best = { page: ca.page, dx: ca.x - A.x, dy: ca.y - A.y }
      if (!best) { const c = carry(r.page, r.x0, r.y0); if (c) best = { page: c.page, dx: c.x - r.x0, dy: c.y - r.y0 } }
      const P = best && ink[best.page]
      if (!P) return null
      const X0 = r.x0 + best.dx, Y0 = r.y0 + best.dy, X1 = r.x1 + best.dx, Y1 = r.y1 + best.dy
      let hit = -1, e = Infinity
      for (let b = 0; b < P.boxes.length; b++) {
        work++
        if (P.boxTaken[b]) continue
        const B = P.boxes[b], de = Math.abs(B[0] - X0) + Math.abs(B[1] - Y0) + Math.abs(B[2] - X1) + Math.abs(B[3] - Y1)
        if (Math.abs(B[0] - X0) <= RULE_TOL && Math.abs(B[1] - Y0) <= RULE_TOL && Math.abs(B[2] - X1) <= RULE_TOL && Math.abs(B[3] - Y1) <= RULE_TOL && de < e) { e = de; hit = b }
      }
      if (hit < 0) return null
      P.boxTaken[hit] = 1
      boxes.push([best.page, hit])
    }
    return boxes
  }

  function match(items, list, A, B) {
    if (work > MATCH_WORK) { stats.over++; return { why: "past the matcher's work bound" } }
    const cs = predict(items, A, B)
    const ca = A ? carry(A.page, A.x, A.y) : null, cb = B ? carry(B.page, B.x, B.y) : null
    const x0 = items[0], xl = items.at(-1)
    const starts = [j => cs[j]]
    if (ca && x0) starts.push(j => ({ page: ca.page, X: ca.x + (items[j].x0 - x0.x0), Y: ca.y + (items[j].y - x0.y) }))
    if (cb && xl) starts.push(j => ({ page: cb.page, X: cb.x - (xl.x0 + 0.5 * xl.size - items[j].x0), Y: cb.y + (items[j].y - xl.y) }))
    // or set on arXiv's next line (its start) or the line before (its end): the first character there
    const ref = ca ?? cb
    if (ref && x0 && ink[ref.page]) {
      const P = ink[ref.page], u = NF(x0.u), sz = x0.size
      let next = null, prev = null
      for (let g = lowest(P, ref.y - 3 * sz); g < P.n && P.y[g] <= ref.y + 3 * sz; g++) {
        work++
        if (NF(P.u[g]) !== u) continue
        const dy = P.y[g] - ref.y
        if (dy < -0.8 * sz && (!next || P.x0[g] < next.x)) next = { x: P.x0[g], y: P.y[g] }
        if (dy > 0.8 * sz && (!prev || P.x0[g] > prev.x)) prev = { x: P.x0[g], y: P.y[g] }
      }
      for (const o of [next, prev]) if (o) starts.push(j => ({ page: ref.page, X: o.x + (items[j].x0 - x0.x0), Y: o.y + (items[j].y - x0.y) }))
    }
    let best = null
    for (const loose of [false, true]) {
      for (const start of starts) {
        const out = runFrom(items, start, loose), n = out.filter(Boolean).length
        if (!best || n > best.n) best = { out, n }
        if (n === items.length) break
      }
      if (best.n === items.length) break
    }
    if (best.n < items.length) {
      const v = vote(items, cs, ca, A)
      const n = v ? v.filter(Boolean).length : 0
      if (v && n > best.n) best = { out: v, n }
    }
    const out = rigid(best.out)
    stats.work = work
    for (const x of out) if (x) { ink[x.page].taken[x.g] = 1; stats[x.how]++ }
    if (out.some(x => !x)) return { why: "its glyphs not all matched on arXiv's page" }
    const boxes = list.length ? rules(list, items, out, ca, A) : []
    if (!boxes) return { why: "a rule not matched on arXiv's page" }
    return { glyphs: out.map(x => [x.page, x.g]), boxes }
  }
  return { match, stats }
}
