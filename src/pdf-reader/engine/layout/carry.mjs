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
//    footnote's number glued to the word after it in one PDF, apart in the other);
//  - else the one longer line within WINDOW on its page holding all of its words together, once: arXiv's text layer runs
//    two things on one baseline into one line (two panel titles side by side, a heading and a figure's text beside it).
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
/** a line whose words occur more than once on its page, in either PDF, is carried only to a partner within this of where
 *  its neighbours put it, PDF units: of 3,540 such carries on the four researched papers, none that the lines around it
 *  in reading order contradict lies within 12 of that place, and a limit of 40 instead takes 2 more they confirm */
const NEAR = 5
/** the work a marked page may cost, and a paper: the words compared with a partner's, the lines looked at and the cells
 *  of the runs between two lines. On the four researched papers the heaviest page costs 88,874 and the heaviest paper
 *  666,069 (2307.16209, 147 pages); a page past PAGE_WORK, or once the paper is past PAPER_WORK, carries none of its lines
 *  (8,000 lines of one word alike on a page cost 64 million) */
const PAGE_WORK = 2_000_000, PAPER_WORK = 20_000_000
/** the lines near a position looked at, at most */
const SCAN = 64
/** a position past a line's last word that is the line's still, of its height: a formula ends a line with no word */
const PAST = 6
/** a marks file's token box, as tokenizeDocument takes a face that gives no metrics */
const ASCENT = 0.75, DESCENT = -0.22

const r2 = v => Math.round(v * 100) / 100
const usable = t => !!t && typeof t.t === 'string' && t.t.length > 0 && Number.isInteger(t.page) && Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.w) && Number.isFinite(t.h)

/**
 * Tokens → lines, in the tokens' order: a token joins the line before it when on the same page, within CLUSTER of the
 * smaller height of the line's first token's baseline, and not left of the line's start by more than LEFT; a line of one
 * token smaller than SIG_FLOOR of the next (a footnote's number, raised) takes the next within CLUSTER of its height, and
 * its baseline. A token with no text (the rest of a word given in parts) or with a number that is not finite is no word
 * of a line. A line's baseline is the one most of its characters share (to a hundredth), its height its median one, its
 * extent all of its tokens'; `tokens` and `sig` are its words on that baseline (within SIG_BASE of their height, of at
 * least SIG_FLOOR of the median height; all its words when none is), `tokens` as indices into the given list
 */
export function linesOf(tokens) {
  const groups = []
  let cur = null
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k]
    if (!usable(t)) continue
    // a line opened by a smaller token (a footnote's number, raised) is a line of the next one's baseline, within half
    // of that one's height
    const opened = cur && cur.all.length === 1 && t.page === cur.page && SIG_FLOOR * t.h > cur.h0 && Math.abs(t.y - cur.y0) <= CLUSTER * t.h && t.x >= cur.x0
    if (opened) { cur.y0 = t.y; cur.h0 = t.h } else if (!cur || t.page !== cur.page || Math.abs(t.y - cur.y0) > CLUSTER * Math.min(t.h, cur.h0) || t.x + t.w < cur.x0 - LEFT) {
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
 * its partner within WHOLE. A partner is taken at any distance only where the words occur once on the line's page, in
 * ours and at most once in arXiv's, and once on the partner's (unique); where they occur more than once, a partner is
 * taken only within NEAR of
 * where the line's neighbours put it — the offset of the nearest line before it and the nearest after it on its page
 * carried to a unique partner, or no offset where neither is — the nearest to that place (an equation's lone symbol,
 * a running head, a short line a page repeats: 2608.04322's one-symbol lines of a display found the same symbol 8.3 pt
 * away; 2608.08350's line of five words an identical one 575 pt away). Else to the nearest arXiv line (by page, then by
 * distance less the words matched) within WINDOW of its baseline on its page, or anywhere on the next or the previous
 * page, whose longest common run of words holds FUZZY of the longer line's and at least FUZZY_PAIRS. The work a marked
 * page and a paper cost is bounded (PAGE_WORK, PAPER_WORK): a page past it carries none of its lines and is listed in
 * `over`, which the maker takes as a page with no ink. `lines`: every marked line (`total`), and those carried, each
 * counted once: at the same place (`same`), moved whole (`moved`), the same words at other spaces (`respaced`), matched
 * by most of their words (`fuzzy`)
 */
export function carrierOf(marked, arxiv) {
  const ours = linesOf(marked), theirs = linesOf(arxiv)
  const bySig = new Map(), byPage = new Map(), counts = new Map()
  for (const c of theirs) {
    const key = `${c.page}\u0000${c.sig}`
    ;(bySig.get(key) ?? bySig.set(key, []).get(key)).push(c)
    ;(byPage.get(c.page) ?? byPage.set(c.page, []).get(c.page)).push(c)
  }
  const oursOn = new Map()
  for (const l of ours) {
    const key = `${l.page}\u0000${l.sig}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
    ;(oursOn.get(l.page) ?? oursOn.set(l.page, []).get(l.page)).push(l)
  }
  const X = (ts, l, j) => ts[l.tokens[j]].x
  const match = new Map(), over = []
  const lines = { total: ours.length, same: 0, moved: 0, respaced: 0, fuzzy: 0 }
  let spent = 0
  for (const page of [...oursOn.keys()].sort((a, b) => a - b)) {
    const ls = oursOn.get(page)
    let work = 0
    /** whether the page, or the paper, is past its work with n more */
    const spend = n => (work += n) > PAGE_WORK || spent + work > PAPER_WORK
    const found = spent > PAPER_WORK ? null : matchPage(ls, spend)
    spent += work
    if (found === null) { over.push(page); continue }
    for (const [l, best] of found) {
      match.set(l, best)
      if (best.fuzzy) lines.fuzzy++
      else if (!best.whole) lines.respaced++
      else if (best.page === l.page && Math.abs(best.dx) < SAME && Math.abs(best.dy) < SAME) lines.same++
      else lines.moved++
    }
  }

  /** one marked page's lines → their partners, or null where the page, or the paper, cost more than its bound */
  function matchPage(ls, spend) {
    const options = new Map(), unique = new Map()
    // the same words: every partner on the line's page and the two beside it, unique or not
    for (const l of ls) {
      // the words' count on its page, in ours and in arXiv's: more than one on either, and no partner is unique
      const list = [], mine = counts.get(`${l.page}\u0000${l.sig}`), here = bySig.get(`${l.page}\u0000${l.sig}`)?.length ?? 0
      for (const p of [l.page, l.page + 1, l.page - 1]) {
        const cs = bySig.get(`${p}\u0000${l.sig}`)
        if (!cs) continue
        if (spend(cs.length * l.tokens.length)) return null
        for (const c of cs) {
          if (c.tokens.length !== l.tokens.length) continue
          const dx = X(arxiv, c, 0) - X(marked, l, 0), dy = c.y - l.y
          const whole = l.tokens.every((k, j) => { const t = marked[k], u = arxiv[c.tokens[j]]; return Math.abs(u.x - t.x - dx) <= WHOLE && Math.abs(u.y - t.y - dy) <= WHOLE })
          list.push({ rank: [Math.abs(c.page - l.page), whole ? 0 : 1, Math.hypot(dx, dy)], to: c, page: c.page, dx, dy, whole, pairs: null, fuzzy: false, unique: mine === 1 && cs.length === 1 && here <= 1 })
        }
      }
      options.set(l, list)
      let best = null
      for (const o of list) if (o.unique && (!best || before(o.rank, best.rank))) best = o
      if (best) unique.set(l, best)
    }
    // each line's nearest neighbours before and after it carried to a unique partner, in two passes
    const prev = new Array(ls.length).fill(null), next = new Array(ls.length).fill(null)
    for (let i = 1; i < ls.length; i++) prev[i] = unique.get(ls[i - 1]) ?? prev[i - 1]
    for (let i = ls.length - 2; i >= 0; i--) next[i] = unique.get(ls[i + 1]) ?? next[i + 1]
    const found = new Map()
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i]
      if (spend(1)) return null
      let best = unique.get(l) ?? null
      // words that occur more than once: within NEAR of where the neighbours carried to a unique partner put the line
      const refs = [prev[i], next[i]].filter(r => r !== null)
      if (!refs.length) refs.push({ page: l.page, dx: 0, dy: 0 })
      let near = null
      for (const o of options.get(l)) {
        if (o.unique) continue
        for (const r of refs) {
          const d = r.page === o.page ? Math.hypot(o.dx - r.dx, o.dy - r.dy) : Infinity
          if (d <= NEAR && (!near || d < near.d)) near = { o, d }
        }
      }
      if (near && (!best || before(near.o.rank, best.rank))) best = near.o
      if (!best && l.tokens.length >= FUZZY_PAIRS && l.tokens.length <= FUZZY_WORDS) {
        const n = l.tokens.length
        for (const p of [l.page, l.page + 1, l.page - 1]) {
          const cs = byPage.get(p) ?? []
          if (spend(cs.length)) return null
          for (const c of cs) {
            // a line of the same words was the first step's to take or leave: a partner the words' repetition refused
            if (c.sig === l.sig || (c.page === l.page && Math.abs(c.y - l.y) > WINDOW)) continue
            const m = c.tokens.length
            // the run holds at most the shorter line's words: a pair it cannot reach is not looked at
            if (m > FUZZY_WORDS || Math.min(n, m) < FUZZY * Math.max(n, m)) continue
            if (spend(n * m)) return null
            const pairs = commonRun(l.tokens, c.tokens, marked, arxiv)
            if (pairs.length < FUZZY_PAIRS || pairs.length < FUZZY * Math.max(n, m)) continue
            const rank = [Math.abs(c.page - l.page), Math.abs(c.y - l.y) - pairs.length]
            if (!best || before(rank, best.rank)) {
              const [a, b] = pairs[0]
              best = { rank, to: c, page: c.page, dx: arxiv[c.tokens[b]].x - marked[l.tokens[a]].x, dy: c.y - l.y, whole: false, pairs, fuzzy: true }
            }
          }
        }
      }
      // a line of ours whose words stand, in order and together, once inside one longer arXiv line near it on its page,
      // the only such line: arXiv's text layer runs two things on one baseline into one line where ours keeps them apart
      // (1706's two panel titles side by side, "Scaled Dot-Product Attention" and "Multi-Head Attention"), or runs a
      // figure's own text on after a heading ("Attention Visualizations Input-Input Layer5": ours draws the figure as a
      // draft frame). The position goes between the words matched, as a fuzzy one does
      if (!best && l.tokens.length >= FUZZY_PAIRS && l.tokens.length <= FUZZY_WORDS) {
        const n = l.tokens.length, cs = byPage.get(l.page) ?? []
        if (spend(cs.length)) return null
        let only = null, many = false
        for (const c of cs) {
          if (c.tokens.length <= n || c.tokens.length > FUZZY_WORDS || Math.abs(c.y - l.y) > WINDOW) continue
          if (spend(c.tokens.length)) return null
          const at = runAt(l, c)
          if (at === -2) { many = true; break }
          if (at < 0) continue
          if (only) { many = true; break }
          only = { c, at }
        }
        if (only && !many) {
          const { c, at } = only, pairs = l.tokens.map((_, a) => [a, at + a])
          best = { rank: [0, Math.abs(c.y - l.y)], to: c, page: c.page, dx: arxiv[c.tokens[at]].x - marked[l.tokens[0]].x, dy: c.y - l.y, whole: false, pairs, fuzzy: true }
        }
      }
      if (best) found.set(l, best)
    }
    return found
  }
  /** where line `l`'s words begin as a run of `c`'s (an index into c's tokens), -1 where they are no run of it, -2 where
   *  they are one more than once */
  function runAt(l, c) {
    const n = l.tokens.length
    let at = -1
    for (let j = 0; j + n <= c.tokens.length; j++) {
      let k = 0
      while (k < n && arxiv[c.tokens[j + k]].t === marked[l.tokens[k]].t) k++
      if (k < n) continue
      if (at >= 0) return -2
      at = j
    }
    return at
  }

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
  // each page's lines by baseline, for the lines near a position
  const nearby = new Map()
  for (const [page, ls] of oursOn) {
    const by = [...ls].sort((a, b) => a.y - b.y)
    let h = 0
    for (const l of by) if (l.h > h) h = l.h
    nearby.set(page, { ys: Float64Array.from(by, l => l.y), by, h })
  }
  // the rest of each word given in parts (a token with no text after its first part's, tokenizeDocument), ours by page:
  // its first part's index and how many parts on it is, the first part on a line of ours
  const lineOf = new Map()
  for (const l of ours) for (const k of l.tokens) lineOf.set(k, l)
  const restsOn = new Map()
  for (let k = 1; k < marked.length; k++) {
    const r = marked[k]
    if (r.t !== '' || !Number.isInteger(r.page) || ![r.x, r.y, r.w, r.h].every(Number.isFinite)) continue
    let f = k - 1
    while (f >= 0 && marked[f].t === '') f--
    if (f < 0 || !usable(marked[f]) || !lineOf.has(f)) continue
    ;(restsOn.get(r.page) ?? restsOn.set(r.page, []).get(r.page)).push({ r, f, n: k - f })
  }
  /** a rest of ours carried as its first part's partner's same rest: arXiv's token as many on from the first part's
   *  partner, a rest of that token's, or null */
  const restCarried = ({ r, f, n }) => {
    const l = lineOf.get(f), m = match.get(l)
    if (!m) return null
    const i = l.tokens.indexOf(f)
    const pair = m.pairs ? m.pairs.find(([a]) => a === i) : [i, i]
    const g = pair ? m.to.tokens[pair[1]] : undefined
    if (g === undefined || arxiv[g]?.t !== marked[f].t) return null
    for (let j = g + 1; j <= g + n; j++) if (arxiv[j]?.t !== '') return null
    const R = arxiv[g + n]
    return Number.isInteger(R.page) && [R.x, R.y, R.w].every(Number.isFinite) ? { R, dx: R.x + R.w - (r.x + r.w), dy: R.y - r.y } : null
  }
  return {
    lines,
    over,
    /** the marked line a position stands on — on its page, within half its height of its baseline, from its height
     *  before its start to PAST of its height past its end (a unit's end mark after the formula its line ends with:
     *  1706's "… by 1/√dk", the formula no word), the nearest across of the SCAN lines nearest it, then by baseline —
     *  carried as that line was. Or the rest of a word given in parts that it stands on or past, by the same reach, where
     *  no line holds it or the line's nearest edge is a height further than the rest's: a paragraph whose last line is
     *  the rest of a word cut by a hyphen ("mod-" / "els."), which no line of words holds and where its end mark stands
     *  (six units of the shared ten), and one beside another column's line on its baseline — carried with the rest's
     *  partner, the rest of the first part's partner, by its right edge's offset; not where arXiv's word is whole */
    carry(page, x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      const n = nearby.get(page) ?? { ys: new Float64Array(0), by: [], h: 0 }
      let lo = 0, hi = n.ys.length
      while (lo < hi) { const mid = (lo + hi) >> 1; if (n.ys[mid] < y) lo = mid + 1; else hi = mid }
      let on = null
      // outwards from the position's baseline, both ways, while a line's baseline may still be within half a height
      for (let a = lo - 1, b = lo, seen = 0; seen < SCAN && (a >= 0 || b < n.ys.length); seen++) {
        const takeB = b < n.ys.length && (a < 0 || n.ys[b] - y <= y - n.ys[a])
        const i = takeB ? b++ : a--
        if (Math.abs(n.ys[i] - y) >= 0.5 * n.h) { if (takeB) b = n.ys.length; else a = -1; continue }
        const l = n.by[i], d = Math.abs(l.y - y), dx = x < l.x0 ? l.x0 - x : x > l.x1 ? x - l.x1 : 0
        if (d < 0.5 * l.h && x >= l.x0 - l.h && x <= l.x1 + PAST * l.h && (!on || dx < on.dx || (dx === on.dx && d < on.d))) on = { l, d, dx }
      }
      let rest = null
      for (const c of restsOn.get(page) ?? []) {
        const { r } = c, d = Math.abs(r.y - y), dx = x < r.x ? r.x - x : x > r.x + r.w ? x - r.x - r.w : 0
        if (d < 0.5 * r.h && x >= r.x - r.h && x <= r.x + r.w + PAST * r.h && (!rest || dx < rest.dx || (dx === rest.dx && d < rest.d))) rest = { c, d, dx }
      }
      if (rest && (!on || on.dx > rest.dx + on.l.h)) {
        const k = restCarried(rest.c)
        if (k) return { page: k.R.page, x: x + k.dx, y: y + k.dy, whole: false }
      }
      const m = on && match.get(on.l)
      return m ? { page: m.page, x: mapX(on.l, m, x), y: y + m.dy, whole: m.whole } : null
    },
  }
}
const before = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false }

/** the marks file's tokens (page, x, y, w, h, word; stride 6) as DocTokens, in its order: a box's top and bottom as
 *  tokenizeDocument takes a face that gives no metrics, for the file keeps no face; a token of word -1, the rest of the
 *  word before given in parts, with no text, as tokenizeDocument gives it. `m` is a parsed marks file
 *  (parseLayoutMarks) */
export function tokensOfMarks(m) {
  const t = m.tokens, words = m.words, out = []
  for (let i = 0; i + 5 < t.length; i += 6) {
    const y = t[i + 2], h = t[i + 4]
    out.push({ t: t[i + 5] === -1 ? '' : words[t[i + 5]], page: t[i], x: t[i + 1], y, w: t[i + 3], h, top: y + ASCENT * h, bottom: y + DESCENT * h, sym: null, far: null })
  }
  return out
}
