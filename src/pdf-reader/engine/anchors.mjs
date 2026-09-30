// Anchors: where each translation unit sits in a PDF, found from the PDF.js text layer. Pure — no DOM, no Node — so
// the reader page and the Node tests run the same code.
// Two sources of truth, the better one first:
//  - marks: when we compiled the PDF ourselves, every unit's first word and last character carry a named destination
//    (latex-front.mjs, patch's `mark`). They bound the unit exactly; `boundsFromMarks` turns them into token ranges.
//  - text alone (REPORT §2, spike A): 3-gram anchors, the longest chain rising in both texts, a bounded fill between
//    anchors. Used inside the bounds when there are marks, on its own when there are none.

const CJK = /[㐀-鿿豈-﫿぀-ヿ가-힯]/
const TOKEN = /[㐀-鿿豈-﫿぀-ヿ가-힯]|(?:(?![㐀-鿿豈-﫿぀-ヿ가-힯])[\p{L}\p{N}])+/gu
const K = 3

/** one token per CJK character, one per run of other letters and digits; lower case, compatibility forms folded. A run
 *  ends where a CJK character begins: CJK characters are letters too, and a run that took them in (a figure's number
 *  and the words after it, a name and a heading's words) was one token in a unit's text where the text layer, setting
 *  the two scripts in two fonts, has several — and a heading, found as a run of words, was never found (2608.08350) */
export function tokens(s) {
  const out = []
  for (const m of s.normalize('NFKC').toLowerCase().matchAll(TOKEN)) {
    if (CJK.test(m[0])) out.push({ t: m[0], at: m.index, len: 1 })
    else out.push({ t: m[0], at: m.index, len: m[0].length })
  }
  return out
}

/**
 * The document as one stream of tokens in content order, each with its page and box in PDF units (origin at the
 * bottom left). `pages` is [{ page, items, styles }] from getTextContent. A word the text layer gives in two parts is
 * joined back into the first part's token — cut by a hyphen at a line end, or cut on its line where the font changes
 * inside it (a heading's small capitals after its capital letter: E + XPERIMENTAL), the second part beginning where
 * the first ends with no space between; the second part keeps its own box with no text, so a line's box still starts
 * where its text does. An item's width is shared evenly between its characters, so a Latin word's box is approximate.
 * An item that repeats the one before it on its baseline, less than a tenth of its size further on, is that item
 * printed over itself to look bold, and is read once: pdfLaTeX's CJK bold prints each character three times 0.015 em
 * apart (2608.02991, 2608.29181), which made a bold heading's every character three tokens; the same string again as
 * text of its own stands a third of an em further at least.
 */
export function tokenizeDocument(pages) {
  const doc = []
  const WORD_END = /[\p{L}\p{N}]$/u, WORD_START = /^[\p{L}\p{N}]/u
  for (const { page, items, styles } of pages) {
    // carry: the token the next one joins; last: the token holding the last word's text; prev: the last item's end
    let carry = null, last = null, prev = null
    for (const it of items) {
      if (!it.str) continue
      const [a, b, c, d, x, y] = it.transform
      const size = Math.hypot(a, b) || it.height || Math.abs(d)
      if (prev && it.str === prev.str && Math.abs(y - prev.y) < 0.05 * size && Math.abs(x - prev.x) < 0.1 * size) continue
      const st = styles?.[it.fontName], asc = st?.ascent > 0 ? st.ascent : 0.75, desc = st?.descent < 0 ? st.descent : -0.22
      const perChar = it.str.length ? it.width / it.str.length : 0
      const toks = tokens(it.str)
      const flat = b === 0 && c === 0
      if (!carry && prev?.word && flat && prev.flat && Math.abs(y - prev.y) < 0.3 * Math.max(size, prev.size) && x - prev.end > -0.3 * size && x - prev.end < 0.12 * size && WORD_START.test(it.str) && !CJK.test(it.str[0])) carry = last
      for (const tk of toks) {
        const w = { t: tk.t, page, x: x + perChar * tk.at, y, w: perChar * tk.len, h: size, top: y + asc * size, bottom: y + desc * size }
        if (carry) { carry.t += w.t; w.t = ''; last = carry; carry = null } else last = w
        doc.push(w)
      }
      const tail = it.str.trimEnd()
      carry = it.hasEOL && /[-­]$/.test(tail) && toks.length && !CJK.test(tail.at(-2) ?? '') ? last : null
      prev = { str: it.str, x, end: x + it.width, y, size, flat, word: !it.hasEOL && toks.length > 0 && WORD_END.test(it.str) && !CJK.test(it.str.at(-1)) }
    }
  }
  return doc
}

// ---------------------------------------------------------------- marks
/** the token a mark sits right after, on the mark's baseline: for a start mark the word whose box is nearest it, for
 *  an end mark the last word that begins before it (boxes are approximate, see tokenizeDocument) */
function tokenAtMark(doc, byPage, mk, start) {
  let best = null
  for (const k of byPage.get(mk.page) ?? []) {
    const t = doc[k]
    if (Math.abs(t.y - mk.y) > t.h * 0.4) continue
    if (start) { const d = mk.x < t.x ? t.x - mk.x : mk.x > t.x + t.w ? mk.x - t.x - t.w : 0; if (d < 8 && (!best || d < best.d)) best = { k, d } }
    else if (t.x < mk.x + 1 && (!best || t.x > doc[best.k].x)) best = { k }
  }
  return best?.k ?? null
}

/** each mark with the word it follows in `doc`, the document the marks were recorded in: { page, x, y, t } */
export function markWords(doc, marks) {
  const byPage = pageIndex(doc), out = new Map()
  for (const [name, mk] of marks) { const k = tokenAtMark(doc, byPage, mk, name.endsWith('s')); out.set(name, { ...mk, t: k == null ? null : doc[k].t }) }
  return out
}
const pageIndex = d => { const m = new Map(); d.forEach((t, k) => (m.get(t.page) ?? m.set(t.page, []).get(t.page)).push(k)); return m }
/** a carried word as `tokens` cuts it now: a copy on this machine keeps the words its marks were carried with, and one
 *  kept when a Latin run still took the CJK characters after it in is the start mark's first part or the end mark's
 *  last */
const cut = (t, start) => (t && t.length > 1 && CJK.test(t) ? ((start ? tokens(t)[0] : tokens(t).at(-1))?.t ?? t) : t)

/**
 * Marks → Map id → [first token, last token]. `marks` is Map `${id}s` / `${id}e` → { page, x, y, t? }. A mark that
 * carries the word it followed where it was recorded (`t`, from markWords) is kept only where `doc` has the same word
 * there: the marks of our own compile of the original then serve arXiv's PDF wherever the two are laid out alike,
 * and nowhere else.
 */
export function boundsFromMarks(doc, marks) {
  const byPage = pageIndex(doc), out = new Map()
  for (const [name, s] of marks) {
    if (!name.endsWith('s')) continue
    const id = name.slice(0, -1), e = marks.get(`${id}e`)
    if (!e) continue
    const a = tokenAtMark(doc, byPage, s, true), b = tokenAtMark(doc, byPage, e, false)
    if (a == null || b == null || b < a) continue
    if ((s.t !== undefined && cut(s.t, true) !== doc[a].t) || (e.t !== undefined && cut(e.t, false) !== doc[b].t)) continue
    out.set(id, [a, b])
  }
  return out
}

// ---------------------------------------------------------------- text matching
/** the document's 3-grams → the token indices of each occurrence; over the tokens with text, since the second part of a
 *  word joined across two items keeps a box and no text (tokenizeDocument), and would break every 3-gram through it */
function buildIndex(doc) {
  const index = new Map()
  const live = []
  for (let k = 0; k < doc.length; k++) if (doc[k].t) live.push(k)
  for (let m = 0; m + K <= live.length; m++) {
    const js = live.slice(m, m + K)
    const key = js.map(j => doc[j].t).join('\u0001')
    const list = index.get(key)
    if (list) list.push(js); else index.set(key, [js])
  }
  return index
}

/** the matched document token indices of one unit's tokens, or null; only inside [lo, hi]. `exact`: [lo, hi] are the
 *  unit's own first and last token (marks), so every hit inside counts — no densest stretch, no split — and a float
 *  the unit runs around (a full-width table between its two pages) cannot cost it either part */
function locate(doc, index, ws, lo, hi, exact) {
  const hits = []
  for (let i = 0; i + K <= ws.length; i++) {
    const list = index.get(ws[i] + '\u0001' + ws[i + 1] + '\u0001' + ws[i + 2])
    if (list) for (const js of list) if (js[0] >= lo && js[K - 1] <= hi) hits.push([i, js])
  }
  if (!hits.length) return null
  // the densest stretch of the document, then the longest chain of anchors rising in both texts
  hits.sort((a, b) => a[1][0] - b[1][0])
  const span = exact ? Infinity : ws.length * 3 + 80
  let best = [0, 0, 0]
  for (let l = 0, h = 0; l < hits.length; l++) {
    while (h < hits.length && hits[h][1][0] - hits[l][1][0] <= span) h++
    if (h - l > best[0]) best = [h - l, l, h]
  }
  let win = hits.slice(best[1], best[2]).sort((a, b) => a[0] - b[0] || a[1][0] - b[1][0])
  if (win.length > 1500) win = win.filter((_, n) => n % Math.ceil(win.length / 1500) === 0)
  const len = win.map(() => 1), prev = win.map(() => -1)
  let tail = 0
  for (let a = 0; a < win.length; a++) {
    for (let b = 0; b < a; b++) if (win[b][0] < win[a][0] && win[b][1][0] < win[a][1][0] && len[b] + 1 > len[a]) { len[a] = len[b] + 1; prev[a] = b }
    if (len[a] > len[tail]) tail = a
  }
  let chain = []
  for (let a = tail; a !== -1; a = prev[a]) chain.unshift(win[a])
  // the chain split where the document jumps much further than the unit does; the largest piece is the unit
  if (!exact) {
    const pieces = [[chain[0]]]
    for (let n = 1; n < chain.length; n++) {
      const du = chain[n][0] - chain[n - 1][0], dd = chain[n][1][0] - chain[n - 1][1][0]
      if (dd > du * 3 + 15) pieces.push([chain[n]]); else pieces.at(-1).push(chain[n])
    }
    chain = pieces.reduce((a, b) => (b.length > a.length ? b : a))
  }
  const at = new Map()
  for (const [i, js] of chain) for (let k = 0; k < K; k++) if (!at.has(i + k)) at.set(i + k, js[k])
  // between two anchored tokens the document interval is bounded: fill the rest in order inside it
  const anchored = [...at.keys()].sort((a, b) => a - b)
  for (let b = 0; b + 1 < anchored.length; b++) {
    const [i0, i1] = [anchored[b], anchored[b + 1]]
    let j = at.get(i0) + 1
    const stop = at.get(i1)
    for (let i = i0 + 1; i < i1; i++) for (let k = j; k < stop; k++) if (doc[k].t === ws[i]) { at.set(i, k); j = k + 1; break }
  }
  // before the first anchor and after the last: outwards from the anchor, nearest occurrence first, on the anchor's
  // page, within a loose bound. Filled from the far end, the same words would be taken from a neighbour (a title
  // that opens with the abstract's first words); a tight bound cut the unit's real last line
  const edge = (from, to, dir, limit) => {
    let j = at.get(from)
    const page = doc[j].page
    for (let i = from + dir; i !== to; i += dir) {
      for (let k = j + dir; dir < 0 ? k > limit : k < limit; k += dir) { if (doc[k].page !== page) break; if (doc[k].t === ws[i]) { at.set(i, k); j = k; break } }
    }
  }
  edge(anchored[0], -1, -1, Math.max(lo - 1, at.get(anchored[0]) - (anchored[0] * 3 + 20)))
  edge(anchored.at(-1), ws.length, 1, Math.min(hi + 1, at.get(anchored.at(-1)) + (ws.length - anchored.at(-1)) * 3 + 20))
  return [...at.values()].sort((a, b) => a - b)
}

/** tokens → one rectangle per line: same page, baselines within half a line of each other */
export function lineRects(doc, idx) {
  const rects = []
  let cur = null
  for (const k of idx) {
    const w = doc[k]
    if (!cur || w.page !== cur.page || Math.abs(w.y - cur.base) > cur.h * 0.5 || w.x + w.w < cur.x0 - cur.h * 30) {
      cur = { page: w.page, x0: w.x, x1: w.x + w.w, y0: w.bottom, y1: w.top, base: w.y, h: w.h }
      rects.push(cur)
      continue
    }
    cur.x0 = Math.min(cur.x0, w.x); cur.x1 = Math.max(cur.x1, w.x + w.w)
    // a line's box is its body text's: a sub- or superscript glyph does not stretch it
    if (Math.abs(w.y - cur.base) < cur.h * 0.2) { cur.y0 = Math.min(cur.y0, w.bottom); cur.y1 = Math.max(cur.y1, w.top) }
  }
  return rects.map(({ page, x0, y0, x1, y1 }) => ({ page, x0, y0, x1, y1 }))
}

/**
 * What lies between two of a unit's matched tokens belongs to it — the glyphs of a formula, a displayed equation —
 * when it is on the same page, owned by no other unit, and stands between them on the page. Not when the second
 * token is higher than the first: the unit went on at the top of the next column, and between them are the
 * footnotes and floats of the column break.
 */
function between(doc, owner, self, a, b) {
  const A = doc[a], B = doc[b]
  if (A.page !== B.page || B.y > A.y + A.h * 0.6) return false
  const top = A.y + A.h * 0.8, bottom = B.y - B.h * 0.6
  for (let k = a + 1; k < b; k++) { const t = doc[k]; if ((owner[k] !== -1 && owner[k] !== self) || t.y > top || t.y < bottom) return false }
  return true
}

/** the token indices of `ws` found in a row in doc[lo..hi] (tokens with no text passed over): `last`, the last place
 *  they come; else only if they come exactly once; or null. Where `gap[j]`, a placeholder stood before `ws[j]`: up to
 *  FOREIGN words the text does not have may stand there — a formula's, a citation's — and are the unit's */
function inRow(doc, ws, lo, hi, last, gap) {
  const live = []
  for (let k = Math.max(0, lo); k <= Math.min(doc.length - 1, hi); k++) if (doc[k].t) live.push(k)
  /** the run of `ws` from live[m] on, as the live indices it takes, or null */
  const at = m => {
    let p = m
    for (let j = 0; j < ws.length; j++, p++) {
      if (j && gap?.[j]) for (let f = 0; f < FOREIGN && p < live.length && doc[live[p]].t !== ws[j]; f++) p++
      if (p >= live.length || doc[live[p]].t !== ws[j]) return null
    }
    return live.slice(m, p)
  }
  let found = null
  for (let m = live.length - ws.length; m >= 0; m--) {
    const run = at(m)
    if (!run) continue
    if (last) return run
    if (found) return null
    found = run
  }
  return found
}
const FOREIGN = 8
const SLOT = '\uFFFC'
/** a unit's words, and before which of them a placeholder stood (`gaps`, offsets in its text: mt.mjs unitText); a
 *  unit with no text (null: a cell a run left untranslated, as the spikes pass it) has none */
function unitWords(text, gaps) {
  if (!gaps?.length || !text) return { ws: tokens(text ?? '').map(x => x.t), gap: null }
  let s = text
  for (let g = gaps.length - 1; g >= 0; g--) s = s.slice(0, gaps[g]) + SLOT + s.slice(gaps[g])
  const n = s.normalize('NFKC').toLowerCase(), ts = tokens(s), gap = new Uint8Array(ts.length)
  let from = 0
  ts.forEach((t, i) => { if (n.slice(from, t.at).includes(SLOT)) gap[i] = 1; from = t.at + t.len })
  return { ws: ts.map(x => x.t), gap }
}

/** in a unit's body heights: how far from its edge line a display beyond its marks may begin (the display's skip, and
 *  its tallest glyphs, a bracket or a sum, which are no words); how far from a word of the unit the part of a display
 *  across a page or a column break may begin (a float's skip is further); how far each next line of the body's size may
 *  stand from those taken; how far a smaller glyph may stand outside them (a limit, a script); and what counts as the
 *  body's size */
const FIRST = 3.5, ACROSS = 1.6, GAP = 1.2, SMALL = 0.4, BODY = 0.95

/**
 * The pages' frame, as the located units' words give it: across, where the text's lines begin and end on most pages;
 * down, the running head's and foot's baselines — the highest and the lowest word of a page, no unit's, above or below
 * the text on most pages, at one height on a quarter of the pages at least (a display that opens or closes a page is
 * none: it stands where the text does). Outside it are the margin (arXiv's stamp, line numbers) and the page's head and
 * foot, never a unit
 */
function pageFrame(doc, ms) {
  const extent = new Map(), located = new Uint8Array(doc.length)
  for (const m of ms) if (m) for (const k of m) {
    located[k] = 1
    const t = doc[k], e = extent.get(t.page)
    if (!e) extent.set(t.page, [t.x, t.x + t.w, t.y, t.y])
    else { e[0] = Math.min(e[0], t.x); e[1] = Math.max(e[1], t.x + t.w); e[2] = Math.min(e[2], t.y); e[3] = Math.max(e[3], t.y) }
  }
  if (!extent.size) return () => true
  const at = (i, f) => { const v = [...extent.values()].map(e => e[i]).sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.floor(f * v.length))] }
  const left = at(0, 0.1), right = at(1, 0.9), low = at(2, 0.25), high = at(3, 0.75)
  const lowest = new Map(), highest = new Map()
  doc.forEach((t, k) => {
    const lo = lowest.get(t.page), hi = highest.get(t.page)
    if (lo == null || t.y < doc[lo].y) lowest.set(t.page, k)
    if (hi == null || t.y > doc[hi].y) highest.set(t.page, k)
  })
  const recurring = (ends, outside) => {
    const votes = new Map()
    for (const k of ends.values()) if (!located[k] && outside(doc[k])) { const y = Math.round(doc[k].y); votes.set(y, (votes.get(y) ?? 0) + 1) }
    let best = null
    for (const [y, n] of votes) if (n >= Math.max(2, Math.ceil(ends.size / 4)) && (!best || n > best[1])) best = [y, n]
    return best?.[0] ?? null
  }
  const foot = recurring(lowest, t => t.y < low - 0.5 * t.h), head = recurring(highest, t => t.y > high + 0.5 * t.h)
  return t => t.x >= left - t.h && t.x + t.w <= right + t.h && (foot == null || t.y > foot + 0.5 * t.h) && (head == null || t.y < head - 0.5 * t.h)
}

/**
 * Takes for unit `u` the words past its edge token `k0` — after it (`dir` 1) or before it (-1) — that are no other
 * unit's: a display beyond its marks. The stream's lines are gathered up to a line another unit's words are on, a new
 * page, a new column (back up the page past the edge's line) or the page's frame (pageFrame); then taken by where they
 * stand, nearest first: the lines holding a glyph of the unit's body size, the first `first` body heights at most from
 * the edge's line, each next GAP at most from those taken; then the smaller glyphs among them, SMALL at most outside
 * them — a display's limits, scripts and fractions' parts. Further, or smaller and apart, is a float, a footnote, the
 * page's foot. What is taken becomes the unit's, so that no other unit takes it
 */
function walker(doc, ms, owner, line) {
  const inFrame = pageFrame(doc, ms)
  // which unit each line holds words of: -1 none, -2 several
  const lineOwner = new Int32Array((line[doc.length - 1] ?? 0) + 1).fill(-1)
  const own = (k, u) => { const l = line[k]; lineOwner[l] = lineOwner[l] === -1 || lineOwner[l] === u ? u : -2 }
  for (let k = 0; k < doc.length; k++) if (owner[k] !== -1) own(k, owner[k])
  const bodyOf = u => { const hs = ms[u].map(k => doc[k].h).sort((x, y) => x - y); return hs[hs.length >> 1] }
  function take(u, k0, dir, first) {
    const A = doc[k0], h = bodyOf(u), lines = []
    for (let k = k0 + dir, end = false; !end && k >= 0 && k < doc.length;) {
      const l = line[k], ks = []
      for (; k >= 0 && k < doc.length && line[k] === l; k += dir) {
        const t = doc[k]
        if (t.page !== A.page || (owner[k] !== -1 && owner[k] !== u) || (dir > 0 ? t.y > A.y + 0.5 * A.h : t.y < A.y - 0.5 * A.h) || !inFrame(t)) { end = true; break }
        ks.push(k)
      }
      if (!ks.length || (lineOwner[l] !== -1 && lineOwner[l] !== u)) break
      let top = -Infinity, bottom = Infinity, body = false
      for (const j of ks) { const t = doc[j]; top = Math.max(top, t.top); bottom = Math.min(bottom, t.bottom); body ||= t.h >= BODY * h }
      lines.push({ ks, top, bottom, body })
    }
    let reach = dir > 0 ? A.bottom : A.top, n = 0
    for (const l of lines.filter(l => l.body).sort((x, y) => (dir > 0 ? y.top - x.top : x.bottom - y.bottom))) {
      if ((dir > 0 ? reach - l.top : l.bottom - reach) > (n ? GAP : first) * h) break
      reach = dir > 0 ? Math.min(reach, l.bottom) : Math.max(reach, l.top)
      n++
    }
    if (!n) return []
    const edge = reach - dir * SMALL * h
    return lines.filter(l => (dir > 0 ? l.bottom >= edge : l.top <= edge)).flatMap(l => l.ks)
  }
  return {
    take,
    claim(u, k0, dir, first) { const ks = take(u, k0, dir, first); for (const k of ks) { owner[k] = u; own(k, u) } return ks },
  }
}

/**
 * Every unit's place in the document: { rects: [{ page, x0, y0, x1, y1 }], coverage, tokens, bounded } or null when
 * it was not found. `units` is [{ id, text, gaps? }] in document order (`gaps`: mt.mjs unitText). With `bounds` (boundsFromMarks) a unit's first and
 * last token are known and its text is matched inside them only; a unit without marks is searched between its
 * marked neighbours. Without any marks the whole document is searched and a unit needs 60 % of its tokens matched.
 * `floating(id)`: a unit TeX sets away from where the source has it — a caption, with its float; a footnote, at the
 * foot of the page — which is no neighbour to search between: a heading's neighbours in the source were a caption
 * placed a column later, and the heading was searched in a range that ended before it began (2608.02163, Japanese).
 */
export function anchorUnits(doc, units, { minCoverage = 0.6, bounds, floating = () => false } = {}) {
  const index = buildIndex(doc)
  const hard = units.map(u => bounds?.get(String(u.id)) ?? null)
  // a unit without marks — a heading, whose words are also in the running head of every page of its section — is
  // searched between its marked neighbours in the text only, with room for a float or a footnote that the stream
  // passes through
  const MARGIN = 100
  const before = [], after = []
  const inText = u => hard[u] && !floating(units[u].id)
  for (let u = 0, e = -1; u < units.length; u++) { before[u] = e; if (inText(u)) e = hard[u][1] }
  for (let u = units.length - 1, a = doc.length; u >= 0; u--) { after[u] = a; if (inText(u)) a = hard[u][0] }
  const found = []
  units.forEach(({ id, text, gaps }, u) => {
    const { ws, gap } = unitWords(text, gaps)
    const b = hard[u]
    const [lo, hi] = b ?? (bounds?.size ? [Math.max(0, before[u] + 1 - MARGIN), Math.min(doc.length - 1, after[u] - 1 + MARGIN)] : [0, doc.length - 1])
    // a heading — no marks, in the text between its located neighbours: its words in a row in the gap between them
    // alone, no margin, the last place they come there, since a heading is followed by its own text; a running head
    // with its words comes before it, and the next section's text is past the gap. By 3-grams it was taken from a
    // paragraph beside it that has the same words (2608.02163 in Chinese: a heading of four characters the text
    // around it keeps using)
    let m = !b && bounds?.size && ws.length && !floating(id) ? inRow(doc, ws, before[u] + 1, after[u] - 1, true, gap) : null
    if (!m && ws.length >= K && lo <= hi) m = locate(doc, index, ws, lo, hi, !!b)
    // a float's text too short for 3-grams (a table's cell of one or two words): the words in a row, once, in the gap
    // between its located neighbours alone
    if (!m && !b && ws.length && ws.length < K && bounds?.size) m = inRow(doc, ws, before[u] + 1, after[u] - 1, false, gap)
    // a float's text that is not there: its float may stand anywhere, so the whole document, as with no marks at all —
    // the words of a located unit are that unit's (owner, below)
    if (!m && !b && ws.length >= K && bounds?.size && floating(id)) m = locate(doc, index, ws, 0, doc.length - 1, false)
    // a run takes a placeholder's words besides the unit's own, which are all there
    const coverage = m ? Math.min(1, m.length / ws.length) : 0
    if (!b && (!m || coverage < minCoverage)) { found.push(null); return }
    found.push({ m: m ?? [], coverage, bounded: b })
  })
  // who owns each token: a marked unit its whole range, the innermost range winning (a footnote inside a paragraph
  // is the footnote's); an unmarked unit its matched words
  const owner = new Int32Array(doc.length).fill(-1)
  const ranged = found.map((f, u) => [f?.bounded, u]).filter(([b]) => b).sort((x, y) => (y[0][1] - y[0][0]) - (x[0][1] - x[0][0]))
  for (const [[a, b], u] of ranged) owner.fill(u, a, b + 1)
  found.forEach((f, u) => { if (f && !f.bounded) for (const k of f.m) if (owner[k] === -1) owner[k] = u })
  // a unit's words on a line where they are few count only next to a line where they are most: its first line after a
  // theorem's label or its last line of formula stay, three words it shares with a table row it passes by go (lines
  // are runs of the stream on one baseline, so two columns never share one)
  const line = new Int32Array(doc.length)
  for (let k = 1, n = 0; k < doc.length; k++) {
    const a = doc[k - 1], b = doc[k]
    if (b.page !== a.page || Math.abs(b.y - a.y) > Math.min(a.h, b.h) * 0.5 || b.x + b.w < a.x - a.h * 30) n++
    line[k] = n
  }
  const lineSize = new Map()
  for (let k = 0; k < doc.length; k++) lineSize.set(line[k], (lineSize.get(line[k]) ?? 0) + 1)
  // each located unit's words
  const ms = units.map((_, u) => {
    const f = found[u]
    if (!f) return null
    const mine = f.m.filter(k => owner[k] === u || (!f.bounded && owner[k] === -1))
    const perLine = new Map()
    for (const k of mine) perLine.set(line[k], (perLine.get(line[k]) ?? 0) + 1)
    const most = l => perLine.get(l) >= Math.min(3, lineSize.get(l)) * 0.5 && perLine.get(l) / lineSize.get(l) >= 0.4
    const keep = l => most(l) || (perLine.has(l - 1) && most(l - 1)) || (perLine.has(l + 1) && most(l + 1))
    let kept = mine.filter(k => keep(line[k]))
    if (!kept.length) kept = mine
    // a unit's words share one size: inside its marked range, words of another size are a float it runs around (a
    // listing or a table set smaller), whatever phrase they share with it
    if (f.bounded && kept.length > 4) {
      const hs = kept.map(k => doc[k].h).sort((x, y) => x - y), body = hs[hs.length >> 1]
      const same = kept.filter(k => Math.abs(doc[k].h - body) <= body * 0.15)
      if (same.length) kept = same
    }
    const m = f.bounded ? [...new Set([f.bounded[0], ...kept, f.bounded[1]])].sort((x, y) => x - y) : kept
    return m.length ? m : null
  })
  // a display a unit sets before its first words or after its last (latex-front's `lead`, `trail`) stands outside its
  // marks, which are in running text: it is taken from beyond them — the leading ones first, so that a unit's trailing
  // walk stops at the display the next unit opens with
  const walk = walker(doc, ms, owner, line)
  const beyond = []
  for (const edge of ['lead', 'trail']) {
    units.forEach((unit, u) => {
      const b = found[u]?.bounded
      if (b && ms[u] && unit[edge]) beyond[u] = (beyond[u] ?? []).concat(walk.claim(u, edge === 'lead' ? b[0] : b[1], edge === 'lead' ? -1 : 1, FIRST))
    })
  }
  const out = new Map()
  units.forEach(({ id }, u) => {
    const f = found[u], m = ms[u]
    if (!m) { out.set(id, null); return }
    const idx = []
    for (let n = 0; n < m.length; n++) {
      let k = m[n]
      idx.push(k)
      // the rest of a word the text layer gives in parts, which has a box and no text (tokenizeDocument): matched by
      // its text, a small-caps title was lit over its first capital alone, and a last word cut by a hyphen missed its
      // line's end
      while (k + 1 < doc.length && !doc[k + 1].t && (n + 1 === m.length || k + 1 < m[n + 1])) idx.push(++k)
      if (n + 1 === m.length) continue
      const A = doc[m[n]], B = doc[m[n + 1]]
      if (between(doc, owner, u, m[n], m[n + 1])) for (k++; k < m[n + 1]; k++) idx.push(k)
      // the unit goes on over a page or at the head of the next column: what stands below the one word on its page,
      // and above the other on its own, as far as the unit's lines go — a display's parts; not the page's head and foot,
      // a footnote, a float (walker)
      else if (f.bounded && (A.page !== B.page || B.y > A.y + A.h * 0.6)) {
        const down = walk.take(u, k, 1, ACROSS), up = walk.take(u, m[n + 1], -1, ACROSS)
        const last = down.at(-1) ?? k
        idx.push(...down.filter(j => j < m[n + 1]), ...up.filter(j => j > last).reverse())
      }
    }
    const all = beyond[u]?.length ? [...new Set([...idx, ...beyond[u]])].sort((x, y) => x - y) : idx
    out.set(id, { rects: lineRects(doc, all), coverage: +f.coverage.toFixed(3), tokens: all, bounded: !!f.bounded })
  })
  return out
}
