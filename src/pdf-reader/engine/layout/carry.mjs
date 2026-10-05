// The marked original's lines carried to arXiv's PDF, for the layout maker (Plan 8b, Task 5; the layout research of
// 2026-10-06, "Papers"). Our compile of the original is not arXiv's file: another TeX Live, another day, sometimes
// another page break, so the two are alike page by page on only some papers (38 of 2307.16209's 147 pages). Lines are,
// far more often: each line of the marked original (its words on one baseline) is matched to arXiv's line of the same
// words, and a position on it — a mark TeX set there — moves with its words:
//  - the same words at one offset (within WHOLE): the line moved whole, and the position moves by that offset (TeX Live
//    2023's 0.61 pt on 1706.03762, a line pushed onto the next page);
//  - the same words at other spaces: the position goes between the same two words' edges, as it stood between them;
//  - no line of the same words: the nearest line within WINDOW on its page (or on the next or the previous page)
//    holding FUZZY of its words in order (the longest common run), and the position goes between the words matched (a
//    footnote's number glued to the word after it in one PDF, apart in the other).
// A position on no line carried carries to null: a reflowed line carries nothing. Pure, and over tokens alone
// (anchors.mjs DocTokens: the marks file's for ours, tokenizeDocument's of arXiv's text layer for theirs).
// Imports nothing.

/** a line's tokens lie within this share of the smaller height of its first token's baseline */
const CLUSTER = 0.5
/** a token whose right edge lies this far left of its line's start begins a line of its own (the next column's) */
const LEFT = 30
/** the signature's words: within this share of their height of the line's baseline, at least this share of its median
 *  height (a raised mark, a footnote's number, joins a line in one PDF and not in the other) */
const SIG_BASE = 0.15, SIG_FLOOR = 0.85
/** a line moved whole: every word at the first word's offset from its partner within this, PDF units */
const WHOLE = 0.1
/** a line at the same place: its offset under this */
const SAME = 0.01
/** the longest common run of words holds this share of the longer line's words, and of at least two */
const FUZZY = 0.8, FUZZY_PAIRS = 2
/** a fuzzy partner on the line's own page lies within this of its baseline */
const WINDOW = 40
/** a line of more words than this is matched by its signature alone: the run between two lines costs their product */
const FUZZY_WORDS = 1000
/** a marks file's token box, as tokenizeDocument takes a face that gives no metrics */
const ASCENT = 0.75, DESCENT = -0.22

const r2 = v => Math.round(v * 100) / 100
const usable = t => !!t && typeof t.t === 'string' && t.t.length > 0 && Number.isInteger(t.page) && Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.w) && Number.isFinite(t.h)

/**
 * Tokens → lines, in the tokens' order: a token joins the line before it when on the same page, within CLUSTER of the
 * smaller height of the line's first token's baseline, and not left of the line's start by more than LEFT. A token with
 * no text (the rest of a word given in parts) or with a number that is not finite is no word of a line. A line's
 * baseline is the one most of its characters share (to a hundredth), its height its median one, its extent all of its
 * tokens'; `tokens` and `sig` are its words on that baseline (within SIG_BASE of their height, of at least SIG_FLOOR of
 * the median height; all its words when none is), `tokens` as indices into the given list
 */
export function linesOf(tokens) {
  const groups = []
  let cur = null
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k]
    if (!usable(t)) continue
    if (!cur || t.page !== cur.page || Math.abs(t.y - cur.y0) > CLUSTER * Math.min(t.h, cur.h0) || t.x + t.w < cur.x0 - LEFT) {
      cur = { page: t.page, y0: t.y, h0: t.h, x0: t.x, x1: t.x + t.w, all: [] }
      groups.push(cur)
    }
    cur.all.push(k)
    if (t.x < cur.x0) cur.x0 = t.x
    if (t.x + t.w > cur.x1) cur.x1 = t.x + t.w
  }
  return groups.map(({ page, x0, x1, all }) => {
    const chars = new Map()
    for (const k of all) { const y = r2(tokens[k].y); chars.set(y, (chars.get(y) ?? 0) + tokens[k].t.length) }
    let y = 0, most = -1
    for (const [v, c] of chars) if (c > most) { most = c; y = v }
    const hs = all.map(k => tokens[k].h).sort((p, q) => p - q), h = hs[hs.length >> 1]
    let on = all.filter(k => { const t = tokens[k]; return Math.abs(t.y - y) < SIG_BASE * t.h && t.h >= SIG_FLOOR * h })
    if (!on.length) on = all
    return { page, y, h, x0, x1, tokens: on, sig: on.map(k => tokens[k].t).join(' ') }
  })
}

/** the longest common run of two lines' words, in order, as index pairs into their `tokens` (Uint16 lengths: a line
 *  holds at most FUZZY_WORDS words) */
function commonRun(a, b, A, B) {
  const n = a.length, m = b.length, w = m + 1, L = new Uint16Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * w + j] = A[a[i]].t === B[b[j]].t ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1])
  const out = []
  for (let i = 0, j = 0; i < n && j < m;) {
    if (A[a[i]].t === B[b[j]].t) { out.push([i, j]); i++; j++ } else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) i++
    else j++
  }
  return out
}

/**
 * The marked original's lines matched to arXiv's (a Carrier). A marked line is matched to arXiv's line of the same
 * signature and word count on its page or the next or the previous: the nearest by page, then one that moved whole
 * before one that did not, then the nearest by distance; whole when every word stands at the first word's offset from
 * its partner within WHOLE. Else to the nearest arXiv line (by page, then by distance less the words matched) within
 * WINDOW of its baseline on its page, or anywhere on the next or the previous page, whose longest common run of words
 * holds FUZZY of the longer line's and at least FUZZY_PAIRS. `lines`: every marked line (`total`), and those carried,
 * each counted once: at the same place (`same`), moved whole (`moved`), the same words at other spaces (`respaced`),
 * matched by most of their words (`fuzzy`)
 */
export function carrierOf(marked, arxiv) {
  const ours = linesOf(marked), theirs = linesOf(arxiv)
  const bySig = new Map(), byPage = new Map()
  for (const c of theirs) {
    const key = `${c.page}\u0000${c.sig}`
    ;(bySig.get(key) ?? bySig.set(key, []).get(key)).push(c)
    ;(byPage.get(c.page) ?? byPage.set(c.page, []).get(c.page)).push(c)
  }
  const X = (ts, l, j) => ts[l.tokens[j]].x
  const match = new Map()
  const lines = { total: ours.length, same: 0, moved: 0, respaced: 0, fuzzy: 0 }
  for (const l of ours) {
    let best = null
    for (const p of [l.page, l.page + 1, l.page - 1]) {
      for (const c of bySig.get(`${p}\u0000${l.sig}`) ?? []) {
        if (c.tokens.length !== l.tokens.length) continue
        const dx = X(arxiv, c, 0) - X(marked, l, 0), dy = c.y - l.y
        const whole = l.tokens.every((k, j) => { const t = marked[k], u = arxiv[c.tokens[j]]; return Math.abs(u.x - t.x - dx) <= WHOLE && Math.abs(u.y - t.y - dy) <= WHOLE })
        const rank = [Math.abs(c.page - l.page), whole ? 0 : 1, Math.hypot(dx, dy)]
        if (!best || before(rank, best.rank)) best = { rank, to: c, page: c.page, dx, dy, whole, pairs: null, fuzzy: false }
      }
    }
    if (!best && l.tokens.length >= FUZZY_PAIRS && l.tokens.length <= FUZZY_WORDS) {
      const n = l.tokens.length
      for (const p of [l.page, l.page + 1, l.page - 1]) {
        for (const c of byPage.get(p) ?? []) {
          if (c.page === l.page && Math.abs(c.y - l.y) > WINDOW) continue
          const m = c.tokens.length
          // the run holds at most the shorter line's words: a pair it cannot reach is not looked at
          if (m > FUZZY_WORDS || Math.min(n, m) < FUZZY * Math.max(n, m)) continue
          const pairs = commonRun(l.tokens, c.tokens, marked, arxiv)
          if (pairs.length < FUZZY_PAIRS || pairs.length < FUZZY * Math.max(n, m)) continue
          const rank = [Math.abs(c.page - l.page), Math.abs(c.y - l.y) - pairs.length]
          if (!best || before(rank, best.rank)) {
            const [i, j] = pairs[0]
            best = { rank, to: c, page: c.page, dx: arxiv[c.tokens[j]].x - marked[l.tokens[i]].x, dy: c.y - l.y, whole: false, pairs, fuzzy: true }
          }
        }
      }
    }
    if (!best) continue
    match.set(l, best)
    if (best.fuzzy) lines.fuzzy++
    else if (!best.whole) lines.respaced++
    else if (best.page === l.page && Math.abs(best.dx) < SAME && Math.abs(best.dy) < SAME) lines.same++
    else lines.moved++
  }

  const oursOn = new Map()
  for (const l of ours) (oursOn.get(l.page) ?? oursOn.set(l.page, []).get(l.page)).push(l)
  /** the knots a position on a line not moved whole goes by: each matched word's two edges, ours → theirs, rising */
  const knotsOf = new Map()
  const knots = (l, m) => {
    let ks = knotsOf.get(l)
    if (ks) return ks
    ks = []
    const pairs = m.pairs ?? l.tokens.map((_, i) => [i, i])
    for (const [i, j] of pairs) {
      const a = marked[l.tokens[i]], b = arxiv[m.to.tokens[j]]
      for (const [p, q] of [[a.x, b.x], [a.x + a.w, b.x + b.w]]) {
        const last = ks.at(-1)
        // a word out of order on either line, or of no width, gives no knot
        if (!last || (p > last[0] && q >= last[1])) ks.push([p, q])
      }
    }
    knotsOf.set(l, ks)
    return ks
  }
  const mapX = (l, m, x) => {
    if (m.whole) return x + m.dx
    const ks = knots(l, m)
    const first = ks[0], last = ks.at(-1)
    if (!first || !last) return x + m.dx
    if (x <= first[0]) return x + (first[1] - first[0])
    for (let j = 1; j < ks.length; j++) {
      const [x0, y0] = ks[j - 1], [x1, y1] = ks[j]
      if (x <= x1) return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0)
    }
    return x + (last[1] - last[0])
  }
  return {
    lines,
    /** the marked line a position stands on — on its page, within half its height of its baseline, from its height
     *  before its start to twice its height past its end, the nearest by baseline — carried as that line was */
    carry(page, x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      let on = null
      for (const l of oursOn.get(page) ?? []) {
        const d = Math.abs(l.y - y)
        if (d < 0.5 * l.h && x >= l.x0 - l.h && x <= l.x1 + 2 * l.h && (!on || d < on.d)) on = { l, d }
      }
      const m = on && match.get(on.l)
      return m ? { page: m.page, x: mapX(on.l, m, x), y: y + m.dy, whole: m.whole } : null
    },
  }
}
const before = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false }

/** the marks file's tokens (page, x, y, w, h, word; stride 6) as DocTokens, in its order: a box's top and bottom as
 *  tokenizeDocument takes a face that gives no metrics, for the file keeps no face. `m` is a parsed marks file
 *  (parseLayoutMarks) */
export function tokensOfMarks(m) {
  const t = m.tokens, words = m.words, out = []
  for (let i = 0; i + 5 < t.length; i += 6) {
    const y = t[i + 2], h = t[i + 4]
    out.push({ t: words[t[i + 5]], page: t[i], x: t[i + 1], y, w: t[i + 3], h, top: y + ASCENT * h, bottom: y + DESCENT * h, sym: null, far: null })
  }
  return out
}
