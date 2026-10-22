// The line check (Plan 8b, Task 5; the layout research of 2026-10-06, "Papers"; the layer route's step 2): our compile's lines
// found on arXiv's PDF. Our compile is not arXiv's file: another TeX Live, another day, sometimes another page break, so the two
// are alike page by page on only some papers. Lines are, far more often: each line of ours (its words on one baseline) is
// matched to arXiv's line of the same words:
//  - the same words at one offset (within WHOLE): the line moved whole (TeX Live 2023's 0.61 pt on 1706.03762, a line pushed
//    onto the next page);
//  - the same words at other spaces;
//  - no line of the same words: the nearest line within WINDOW on its page (or on the next or the previous page) holding FUZZY
//    of its words in order (the longest common run: a footnote's number glued to the word after it in one PDF, apart in the
//    other);
//  - else the one longer line within WINDOW on its page holding all of its words together, once: arXiv's text layer runs two
//    things on one baseline into one line (two panel titles side by side, a heading and a figure's text beside it).
// The page-and-line check of our compile as the base page (design note §3.3: CARRY_MIN, per paper and per part) is the share
// of our lines **in place** (lineCheckOf): found on their own page within LINE_PLACE, of any kind. A line found elsewhere is
// another TeX Live re-breaking the paper (2307.16209 on TeX Live 2025 against arXiv's 2023: 48 % of its lines moved, 80 % in
// place), and our page is to be arXiv's. No position is carried, our base page being the page the marks stand on. Pure, and over tokens alone
// (anchors.mjs DocTokens: tokenizeDocument's of each PDF's text layer, or a marks file's for ours).
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
/** a line in place, for the page-and-line check: found on its own page with its first word within this of its partner's, in
 *  x and in y, PDF units, whatever its kind. Measured (2026-10-22, our base pages against arXiv's PDFs): dvipdfmx's DVI against
 *  arXiv's dvips and ps2pdf sets a paper's words up to 0.42 pt apart (2608.22687: 97.6 % in place at 0.5 pt, 70.7 % counting
 *  whole lines alone), the same TeX Live 99.9 to 100 %, an older paper on a newer one 95.6 to 97.9 % (1810.04805, 1706.03762),
 *  and a paper re-broken by another year 80.2 % (2307.16209) and 88.6 % (2609.26457) */
export const LINE_PLACE = 0.5
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
/** the work a marked page may cost: the words compared with a partner's, the lines looked at and the cells of the runs
 *  between two lines. A page past PAGE_WORK carries none of its lines, that page alone (8,000 lines of one word alike on a page
 *  cost 64 million). The heaviest pages measured (2026-10-17, against their marked compiles): 182,407 (2310.20360, 737 pages,
 *  page 685), 116,994 (2106.10165, 471 pages), 110,461 (2608.16117) and 88,909 (2307.16209). No bound of the paper's: a
 *  paper's work grows with its pages (8.6 million for 2310.20360, 7.1 million for 2106.10165), so a paper-wide one would bind
 *  on a long book first, and the work is time alone, the host's deadline's; what a page carries hangs on its own lines and
 *  arXiv's on its page and the two beside it alone (a page is carried as soon as its tokens are read: the page stream) */
const PAGE_WORK = 2_000_000
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
 * least SIG_FLOOR of the median height; all its words when none is), `tokens` as indices into the given list. Of the tokens
 * `from` to `to` alone where they are given (a line never crosses a page, so a page's tokens make its own lines)
 */
export function linesOf(tokens, from = 0, to = tokens.length) {
  const groups = []
  let cur = null
  for (let k = from; k < to; k++) {
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
 * page costs is bounded (PAGE_WORK): a page past it finds none of its lines and is listed in `over`. `lines`: every marked
 * line (`total`), and those found, each counted once: at the same place (`same`), moved whole (`moved`), the same words at
 * other spaces (`respaced`), matched by most of their words (`fuzzy`); `pageLines`: each marked page's [found, total]; `placed`
 * and `pagePlaced` ([placed, total]): the lines found on their own page within LINE_PLACE, the page-and-line check's (lineCheckOf)
 */
export function carrierOf(marked, arxiv) {
  const c = carrier(marked, arxiv)
  c.add(0, marked.length)
  return c
}

/**
 * carrierOf a page at a time (the page stream, E2a): arXiv's tokens whole (the prepare's step T reads them before any marked
 * page), the marked original's added as they are read, `add(from, to)` the tokens of whole pages, none added before: a page's
 * lines are matched there, from its own lines and arXiv's on its page and the two beside it.
 * `marked` is the list the tokens are added to, read at the indices added. Added page by page in page order, or all at once,
 * it is carrierOf
 */
export function carrier(marked, arxiv) {
  const theirs = linesOf(arxiv)
  const bySig = new Map(), byPage = new Map(), counts = new Map()
  for (const c of theirs) {
    const key = `${c.page}\u0000${c.sig}`
    ;(bySig.get(key) ?? bySig.set(key, []).get(key)).push(c)
    ;(byPage.get(c.page) ?? byPage.set(c.page, []).get(c.page)).push(c)
  }
  const X = (ts, l, j) => ts[l.tokens[j]].x
  const over = [], added = new Set()
  const lines = { total: 0, same: 0, moved: 0, respaced: 0, fuzzy: 0 }
  // (each marked page's lines: [carried, total]; and in place, LINE_PLACE: [placed, total], their sum `placed`)
  const pageLines = new Map(), pagePlaced = new Map()
  let placed = 0

  /** the marked tokens `from` to `to`, whole pages none of which was added */
  function add(from = 0, to = marked.length) {
    const ours = linesOf(marked, from, to)
    const oursOn = new Map()
    for (const l of ours) {
      const key = `${l.page}\u0000${l.sig}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
      ;(oursOn.get(l.page) ?? oursOn.set(l.page, []).get(l.page)).push(l)
    }
    for (const page of oursOn.keys()) if (added.has(page)) throw new RangeError(`the marked page ${page} was added already`)
    lines.total += ours.length
    for (const page of [...oursOn.keys()].sort((a, b) => a - b)) {
      let work = 0
      /** whether the page is past its work with n more */
      const spend = n => (work += n) > PAGE_WORK
      const found = matchPage(oursOn.get(page), spend)
      pageLines.set(page, [found === null ? 0 : found.size, oursOn.get(page).length])
      if (found === null) { over.push(page); pagePlaced.set(page, [0, oursOn.get(page).length]); continue }
      let here = 0
      for (const [l, best] of found) {
        if (best.fuzzy) lines.fuzzy++
        else if (!best.whole) lines.respaced++
        else if (best.page === l.page && Math.abs(best.dx) < SAME && Math.abs(best.dy) < SAME) lines.same++
        else lines.moved++
        if (best.page === l.page && Math.abs(best.dx) <= LINE_PLACE && Math.abs(best.dy) <= LINE_PLACE) here++
      }
      pagePlaced.set(page, [here, oursOn.get(page).length])
      placed += here
    }
    for (const page of oursOn.keys()) added.add(page)
  }

  /** one marked page's lines → their partners, or null where the page cost more than its bound */
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

  return { lines, pageLines, get placed() { return placed }, pagePlaced, over, add }
}

/**
 * The page-and-line check of our base page's tokens (`ours`) over arXiv's (`arxiv`): the carrier's counts with `placed`, the
 * lines in place (LINE_PLACE), and `pageLines` each page's [placed, total], which the paper's share and each part's are taken
 * from (CARRY_MIN): what the page pass hands the maker as its `lineCheck`
 */
export function lineCheckOf(ours, arxiv) {
  const c = carrierOf(ours, arxiv)
  return { lines: { ...c.lines, placed: c.placed }, pageLines: c.pagePlaced }
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
