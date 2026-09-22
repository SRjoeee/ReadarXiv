// Anchors: where each translation unit sits in a PDF, found from the PDF.js text layer. Pure — no DOM, no Node — so
// the reader page and the Node tests run the same code.
// Two sources of truth, the better one first:
//  - marks: when we compiled the PDF ourselves, every unit's first word and last character carry a named destination
//    (latex-front.mjs, patch's `mark`). They bound the unit exactly; `boundsFromMarks` turns them into token ranges.
//  - text alone (REPORT §2, spike A): 3-gram anchors, the longest chain rising in both texts, a bounded fill between
//    anchors. Used inside the bounds when there are marks, on its own when there are none.

const CJK = /[㐀-鿿豈-﫿぀-ヿ가-힯]/
const TOKEN = /[㐀-鿿豈-﫿぀-ヿ가-힯]|[\p{L}\p{N}]+/gu
const K = 3

/** one token per CJK character, one per run of other letters and digits; lower case, compatibility forms folded */
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
      prev = { end: x + it.width, y, size, flat, word: !it.hasEOL && toks.length > 0 && WORD_END.test(it.str) && !CJK.test(it.str.at(-1)) }
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
    if ((s.t !== undefined && s.t !== doc[a].t) || (e.t !== undefined && e.t !== doc[b].t)) continue
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

/** the token indices of `ws` found in a row in doc[lo..hi] (tokens with no text passed over), or null unless exactly once */
function once(doc, ws, lo, hi) {
  const live = []
  for (let k = Math.max(0, lo); k <= Math.min(doc.length - 1, hi); k++) if (doc[k].t) live.push(k)
  let found = null
  for (let m = 0; m + ws.length <= live.length; m++) {
    if (!ws.every((w, j) => doc[live[m + j]].t === w)) continue
    if (found) return null
    found = live.slice(m, m + ws.length)
  }
  return found
}

/**
 * Every unit's place in the document: { rects: [{ page, x0, y0, x1, y1 }], coverage, tokens, bounded } or null when
 * it was not found. `units` is [{ id, text }] in document order. With `bounds` (boundsFromMarks) a unit's first and
 * last token are known and its text is matched inside them only; a unit without marks is searched between its
 * marked neighbours. Without any marks the whole document is searched and a unit needs 60 % of its tokens matched.
 */
export function anchorUnits(doc, units, { minCoverage = 0.6, bounds } = {}) {
  const index = buildIndex(doc)
  const hard = units.map(u => bounds?.get(String(u.id)) ?? null)
  // a unit without marks — a heading, whose words are also in the running head of every page of its section — is
  // searched between its marked neighbours only, with room for a float or a footnote that the stream passes through
  const MARGIN = 100
  const before = [], after = []
  for (let u = 0, e = -1; u < units.length; u++) { before[u] = e; if (hard[u]) e = hard[u][1] }
  for (let u = units.length - 1, a = doc.length; u >= 0; u--) { after[u] = a; if (hard[u]) a = hard[u][0] }
  const found = []
  units.forEach(({ text }, u) => {
    const ws = tokens(text ?? '').map(x => x.t)
    const b = hard[u]
    const [lo, hi] = b ?? (bounds?.size ? [Math.max(0, before[u] + 1 - MARGIN), Math.min(doc.length - 1, after[u] - 1 + MARGIN)] : [0, doc.length - 1])
    let m = ws.length >= K && lo <= hi ? locate(doc, index, ws, lo, hi, !!b) : null
    // too short for 3-grams (a heading of one or two words): the words in a row, once, in the gap between its
    // located neighbours alone — no margin, where a running head or the next section's text would repeat them
    if (!m && !b && ws.length && ws.length < K && bounds?.size) m = once(doc, ws, before[u] + 1, after[u] - 1)
    const coverage = m ? m.length / ws.length : 0
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
  const out = new Map()
  units.forEach(({ id }, u) => {
    const f = found[u]
    if (!f) { out.set(id, null); return }
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
    if (!m.length) { out.set(id, null); return }
    const idx = []
    for (let n = 0; n < m.length; n++) {
      idx.push(m[n])
      if (n + 1 < m.length && between(doc, owner, u, m[n], m[n + 1])) for (let k = m[n] + 1; k < m[n + 1]; k++) idx.push(k)
    }
    out.set(id, { rects: lineRects(doc, idx), coverage: +f.coverage.toFixed(3), tokens: idx, bounded: !!f.bounded })
  })
  return out
}
