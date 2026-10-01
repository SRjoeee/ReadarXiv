// Anchors: where each translation unit sits in a PDF, found from the PDF.js text layer. Pure — no DOM, no Node — so
// the reader page and the Node tests run the same code.
// Two sources of truth, the better one first:
//  - marks: when we compiled the PDF ourselves, every unit's first word and last character carry a named destination
//    (latex-front.mjs, patch's `mark`). They bound the unit exactly; `boundsFromMarks` turns them into token ranges.
//  - text alone (REPORT §2, spike A): 3-gram anchors, the longest chain rising in both texts, a bounded fill between
//    anchors. Used inside the bounds when there are marks, on its own when there are none.

// CJK: unified ideographs with extension A, compatibility ideographs, kana, Hangul syllables. Written as escapes: typed as
// characters, the compatibility range's first (U+F900) was normalized into the unified U+8C48, and the range ran on over
// U+A000–U+F8FF — the private-use area with it, a bracket's pieces read as CJK words, and surrogates for this pattern.
// What the spans hold that is no letter or digit is no token, as outside them (125 code points: the katakana middle dot
// U+30FB between a compound's words, the sound marks U+3099–U+309C, U+30A0, the hexagrams U+4DC0–U+4DFF, and unassigned
// ones): punctuation, dropped alike on both sides
const CJK_SPANS = [[0x3400, 0x9fff], [0xf900, 0xfaff], [0x3040, 0x30ff], [0xac00, 0xd7af]]
const CJK = new RegExp(`[${CJK_SPANS.map(([a, b]) => `\\u${a.toString(16)}-\\u${b.toString(16)}`).join('')}]`, 'u')
const isCJK = c => CJK_SPANS.some(([a, b]) => c >= a && c <= b)
const TOKEN = /[\p{L}\p{N}]+/gu
const K = 3
/** the marks that only open (after NFKC, which folds the full-width brackets into these), and with the straight quotes,
 *  which open before a word and close after one, every mark that may open before a word */
const OPENS = new Set([...'([{\u2018\u201c\u201a\u201e\u00ab\u2039\u300a\u3008\u300c\u300e\u3010\u3014\u3016\u3018\u301a'].map(c => c.charCodeAt(0)))
const OPENING = new Set([...OPENS, 34, 39])
const LETTER = /[\p{L}\p{N}]/u
/** whether a character after a word stops the scan of the marks it sets against the word: white space, a letter or a
 *  digit (a word cut from the next where the script changes), or a mark that only opens. By code first: every word of
 *  the text layer is looked at, and a test of the letters' class for each of a translation's CJK characters made the
 *  scan up to half as slow again as tokenizing it (2608.08350) */
const stopsMarks = (s, i) => {
  const c = s.charCodeAt(i)
  if (c < 128) return c <= 32 || (c >= 48 && c <= 57) || (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 40 || c === 91 || c === 123
  if ((c >= 0x3040 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af)) return true
  // CJK punctuation (a full stop, a comma, a closing bracket), dashes, quotes, an ellipsis: marks, unless they open
  if ((c >= 0x3001 && c <= 0x303f) || (c >= 0x2010 && c <= 0x2027) || (c >= 0x2030 && c <= 0x205e)) return OPENS.has(c)
  return OPENS.has(c) || /\s/.test(s[i]) || LETTER.test(s[i])
}
/** whether a character opens before a word */
const opens = c => (c < 128 ? c === 40 || c === 91 || c === 123 || c === 34 || c === 39 : c <= 0x301a && OPENING.has(c))
/** what a word's marks count less: half an em for a CJK character's, which ink half of theirs */
const halfOf = (s, at, len) => (len === 1 && isCJKCode(s.charCodeAt(at)) ? 0.5 : 0)
const isCJKCode = c => (c >= 0x3400 && c <= 0x9fff) || (c >= 0x3040 && c <= 0x30ff) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0xf900 && c <= 0xfaff)

/** one token per CJK character, one per run of other letters and digits; lower case, compatibility forms folded. A run
 *  ends where a CJK character begins: CJK characters are letters too, and a run that took them in (a figure's number
 *  and the words after it, a name and a heading's words) was one token in a unit's text where the text layer, setting
 *  the two scripts in two fonts, has several — and a heading, found as a run of words, was never found (2608.08350) */
export function tokens(s) {
  const out = []
  for (const m of s.normalize('NFKC').toLowerCase().matchAll(TOKEN)) {
    const w = m[0]
    if (!CJK.test(w)) out.push({ t: w, at: m.index, len: w.length })
    else if (w.length === 1) out.push({ t: w, at: m.index, len: 1 })
    // a run of letters that holds CJK characters, cut into them and the runs between: matched as one class and cut
    // after, character by character, since a lookahead in the pattern, or the CJK ranges beside the letters' class,
    // cost the text layer's every character a test (5 to 10 % of tokenizing a heavy paper), and cutting with a second
    // pattern doubled a translation's (all BMP: a surrogate is never CJK)
    else {
      let from = -1
      for (let i = 0; i <= w.length; i++) {
        const cjk = i < w.length && isCJK(w.charCodeAt(i))
        if (from >= 0 && (cjk || i === w.length)) { out.push({ t: w.slice(from, i), at: m.index + from, len: i - from }); from = -1 }
        if (cjk) out.push({ t: w[i], at: m.index + i, len: 1 })
        else if (from < 0 && i < w.length) from = i
      }
    }
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
    // carry: the token the next one joins; last: the token holding the last word's text; prev: the last item's end;
    // inkOpen, inkEnd: whether an item of marks alone may still carry the last token's ink on, and from where
    let carry = null, last = null, prev = null, inkOpen = false, inkEnd = 0
    for (const it of items) {
      if (!it.str) continue
      const [a, b, c, d, x, y] = it.transform
      const size = Math.hypot(a, b) || it.height || Math.abs(d)
      if (prev && Math.abs(x - prev.x) < 0.1 * size && Math.abs(y - prev.y) < 0.05 * size && it.str === prev.str) continue
      const st = styles?.[it.fontName], asc = st?.ascent > 0 ? st.ascent : 0.75, desc = st?.descent < 0 ? st.descent : -0.22
      const perChar = it.str.length ? it.width / it.str.length : 0
      const toks = tokens(it.str)
      const flat = b === 0 && c === 0
      if (!carry && prev?.word && flat && prev.flat && Math.abs(y - prev.y) < 0.3 * Math.max(size, prev.size) && x - prev.end > -0.3 * size && x - prev.end < 0.12 * size && WORD_START.test(it.str) && !CJK.test(it.str[0])) carry = last
      for (const tk of toks) {
        // `item`: the text item the token was read from, for its ink (inkEdges); `sym`: where the items of marks alone
        // right after it end; `far`: where one set apart after it ends (NaN: more than one). Nothing more is worked out
        // here: the reader tokenizes a paper once, cold, and each test a token took here cost a heavy paper's first
        // tokenizing a third more (2608.02459, 38 → 52 ms)
        const w = { t: tk.t, page, x: x + perChar * tk.at, y, w: perChar * tk.len, h: size, top: y + asc * size, bottom: y + desc * size, item: it, sym: null, far: null }
        if (carry) { carry.t += w.t; w.t = ''; last = carry; carry = null } else last = w
        doc.push(w)
      }
      // an item of marks alone — a formula's closing bracket and full stop in a font of their own — on the last word's
      // baseline and right after it carries that word's ink to its end, and the next one on from there; a space or a
      // gap of over half an em ends the carry (a cell's word lit over three cells of a dash, 2608.02163). One set apart
      // is kept aside (`far`) for the layout, which takes it where it ends at the column's text edge (a proof's box set
      // flush right, highlight.mjs); a second one there is a row of cells, and neither is taken
      if (toks.length) { inkOpen = true; inkEnd = x + it.width }
      else if (doc.length) {
        const t = doc[doc.length - 1]
        if (t.page === page && Math.abs(y - t.y) < 0.5 * t.h && x + it.width > t.x) {
          if (!/\S/.test(it.str)) inkOpen = false
          else if (inkOpen && x - inkEnd <= 0.5 * t.h) { t.sym = Math.max(t.sym ?? -Infinity, x + it.width); inkEnd = x + it.width }
          else { inkOpen = false; t.far = t.far === null ? x + it.width : Number.NaN }
        }
      }
      const tail = it.str.trimEnd()
      carry = it.hasEOL && /[-­]$/.test(tail) && toks.length && !CJK.test(tail.at(-2) ?? '') ? last : null
      prev = { str: it.str, x, end: x + it.width, y, size, flat, word: !it.hasEOL && toks.length > 0 && WORD_END.test(it.str) && !CJK.test(it.str.at(-1)) }
    }
  }
  return doc
}

/**
 * Each token's ink across, { l, r }: its box widened over the marks its item sets against the word — the brackets and
 * quotes that open before it, the stops, commas and brackets that close after it, in its item — and to the end of an
 * item of marks alone after it on its baseline (`sym`), so that a highlight ends after a sentence's full stop and a
 * heading's colon. A CJK mark is set in a full em and inks half of it (the closing ones their left half, the opening
 * ones their right): NFKC folds the full-width marks into ASCII, so it is told by the word, a CJK character. Worked out
 * from each token's item (tokenizeDocument), when the highlight's layout is made and not as the paper is tokenized;
 * anchoring reads none of it. A token with no item has its box
 */
export function inkEdges(doc) {
  const n = doc.length, l = new Float32Array(n), r = new Float32Array(n)
  let item = null, s = '', perChar = 0, x0 = 0
  for (let k = 0; k < n; k++) {
    const w = doc[k], it = w.item
    let left = w.x, right = w.x + w.w
    if (it && it !== item) { item = it; s = it.str.normalize('NFKC').toLowerCase(); perChar = it.str.length ? it.width / it.str.length : 0; x0 = it.transform[4] }
    if (it && perChar > 0) {
      // the token's place in its item's text, as tokenizeDocument placed it: x = the item's x + perChar × its offset
      const at = Math.round((w.x - x0) / perChar), end = at + Math.round(w.w / perChar)
      // most words have a space or nothing on either side: only those that do not are scanned
      if (at > 0 && opens(s.charCodeAt(at - 1))) {
        let from = at - 1
        while (from > 0 && opens(s.charCodeAt(from - 1))) from--
        left = w.x - (at - from - halfOf(s, at, end - at)) * perChar
      }
      if (end < s.length && !stopsMarks(s, end)) {
        let to = end + 1
        while (to < s.length && !stopsMarks(s, to)) to++
        right = w.x + (to - at - halfOf(s, at, end - at)) * perChar
      }
    }
    if (w.sym != null && w.sym > right) right = w.sym
    l[k] = left; r[k] = right
  }
  return { l, r }
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
    // a carried word as it was, or as the tokenizer cuts it now (cut): the tokenizer still joins a word a hyphen cuts
    // at a line's end with the CJK character after it, as the carried word has it (the review of A1, M2)
    if ((s.t !== undefined && s.t !== doc[a].t && cut(s.t, true) !== doc[a].t) || (e.t !== undefined && e.t !== doc[b].t && cut(e.t, false) !== doc[b].t)) continue
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

/**
 * The longest chains of hits rising in both texts: for each hit of `win` (sorted by the unit's token, then the
 * document's), the length of the longest chain ending at it and the hit before it there — of the hits before it in
 * both texts, the earliest in `win` whose chain is longest. Pair by pair for a few hits; for more, a Fenwick tree over
 * the document's tokens keeps each prefix's best chain, the hits of one unit token all asked before any is added so
 * that no chain takes two of them — the same chains in O(n log n), where the pairs grew with the square of a long
 * unit's hits (a third of a translation's anchoring)
 */
function chainOf(win) {
  const n = win.length, len = new Int32Array(n), prev = new Int32Array(n)
  if (n <= 64) {
    for (let a = 0; a < n; a++) {
      len[a] = 1; prev[a] = -1
      for (let b = 0; b < a; b++) if (win[b][0] < win[a][0] && win[b][1][0] < win[a][1][0] && len[b] + 1 > len[a]) { len[a] = len[b] + 1; prev[a] = b }
    }
    return { len, prev }
  }
  const ds = [...new Set(win.map(h => h[1][0]))].sort((x, y) => x - y), rank = new Map(ds.map((d, r) => [d, r + 1]))
  const bestLen = new Int32Array(ds.length + 1), bestAt = new Int32Array(ds.length + 1).fill(-1)
  for (let g = 0; g < n;) {
    let e = g
    while (e < n && win[e][0] === win[g][0]) e++
    for (let a = g; a < e; a++) {
      let l = 0, at = -1
      for (let r = rank.get(win[a][1][0]) - 1; r > 0; r -= r & -r) if (bestLen[r] > l || (bestLen[r] === l && l > 0 && bestAt[r] < at)) { l = bestLen[r]; at = bestAt[r] }
      len[a] = l + 1; prev[a] = at
    }
    for (let a = g; a < e; a++) for (let r = rank.get(win[a][1][0]); r <= ds.length; r += r & -r) if (len[a] > bestLen[r] || (len[a] === bestLen[r] && a < bestAt[r])) { bestLen[r] = len[a]; bestAt[r] = a }
    g = e
  }
  return { len, prev }
}

/** the matched document token indices of one unit's tokens (`tokens`), and which unit token each is (`pairs`: unit
 *  token → document token), or null; only inside [lo, hi]. `exact`: [lo, hi] are the
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
  const { len, prev } = chainOf(win)
  let tail = 0
  for (let a = 1; a < win.length; a++) if (len[a] > len[tail]) tail = a
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
  return { tokens: [...at.values()].sort((a, b) => a - b), pairs: at }
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
/** a unit's words, and before which of them a placeholder stood (`gaps`, offsets in its text: mt.mjs unitText); a
 *  unit with no text (null: a cell a run left untranslated, as the spikes pass it) has none */
function unitWords(text, gaps) {
  if (!gaps?.length || !text) return { ws: tokens(text ?? '').map(x => x.t), gap: null }
  // the text cut at the offsets, which stand where a placeholder's space was, never inside a word: each piece's first
  // word has a placeholder before it
  const ws = [], at = []
  let from = 0
  for (const g of [...gaps, text.length]) {
    const ts = tokens(text.slice(from, g))
    if (ts.length) { at.push(ws.length); for (const t of ts) ws.push(t.t) }
    from = g
  }
  const gap = new Uint8Array(ws.length)
  for (let j = 1; j < at.length; j++) gap[at[j]] = 1
  return { ws, gap }
}

/** in a unit's body heights: how far from its edge line a display beyond its marks may begin (the display's skip, and
 *  its tallest glyphs, a bracket or a sum, which are no words); how far each next line of the body's size may stand
 *  from those taken; how far a smaller glyph may stand outside them (a limit, a script); and what counts as the body's
 *  size */
const FIRST = 3.5, GAP = 1.2, SMALL = 0.4, BODY = 0.95
/** how far from a word of the unit the part of a display across a page or a column break may begin: 1.6 body heights;
 *  and above the unit's first line on the next page, FLOAT_SKIP points at the most. TeX breaks no page before a display
 *  (\predisplaypenalty), so what stands there is the unit's own words, a display's rows a break was allowed between, or
 *  a float, whose skip (\textfloatsep, 20 pt less 4) is a length of its own at every body size: 1.6 heights of a 12 pt
 *  body reached a table's row 17 pt above the text (the re-review of A1, m3). On the 71 papers whose marks name
 *  today's units, the first lines taken there stand 14.5 pt away at the most; below a unit's last line on its page,
 *  where displays do stand, up to 19.1 pt at a 12 pt body, so no bound in points holds there */
const ACROSS = 1.6, FLOAT_SKIP = 16
/** a unit's own words at a break: how many of the unit's next words a word is looked for among, and the share of a line's
 *  words that must be found so (inOrder) */
const AHEAD = 4, OWN = 0.6
/** a line `fits` takes only if a line it takes outright comes after it (take) */
const HELD = 'held'

/**
 * The pages' frame, as the located units' words give it: across, where the text's lines begin and end on most pages;
 * down, the running head's and foot's baselines — the highest and the lowest word of a page, no unit's, above or below
 * the text on most pages, at one height on a quarter of the pages at least (a display that opens or closes a page is
 * none: it stands where the text does). Outside it are the margin (arXiv's stamp, line numbers) and the page's head and
 * foot, never a unit
 */
function pageFrame(doc, ms) {
  // arrays by page number, the document's tokens being in page order
  const pages = doc.length ? doc[doc.length - 1].page + 1 : 1
  const x0 = new Float64Array(pages).fill(Infinity), x1 = new Float64Array(pages).fill(-Infinity), y0 = new Float64Array(pages).fill(Infinity), y1 = new Float64Array(pages).fill(-Infinity)
  const located = new Uint8Array(doc.length)
  for (const m of ms) if (m) for (const k of m) {
    located[k] = 1
    const t = doc[k], p = t.page
    if (t.x < x0[p]) x0[p] = t.x
    if (t.x + t.w > x1[p]) x1[p] = t.x + t.w
    if (t.y < y0[p]) y0[p] = t.y
    if (t.y > y1[p]) y1[p] = t.y
  }
  const lowest = new Int32Array(pages).fill(-1), highest = new Int32Array(pages).fill(-1)
  const lowY = new Float64Array(pages).fill(Infinity), highY = new Float64Array(pages).fill(-Infinity)
  for (let k = 0; k < doc.length; k++) {
    const t = doc[k], p = t.page, y = t.y
    if (y < lowY[p]) { lowY[p] = y; lowest[p] = k }
    if (y > highY[p]) { highY[p] = y; highest[p] = k }
  }
  const seen = []
  for (let p = 0; p < pages; p++) if (x0[p] !== Infinity) seen.push(p)
  if (!seen.length) return () => true
  const at = (v, f) => { const s = seen.map(p => v[p]).sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(f * s.length))] }
  const left = at(x0, 0.1), right = at(x1, 0.9), low = at(y0, 0.25), high = at(y1, 0.75)
  let withText = 0
  for (const k of lowest) if (k >= 0) withText++
  const recurring = (ends, beyond) => {
    const votes = new Map()
    for (const k of ends) if (k >= 0 && !located[k] && beyond(doc[k])) { const y = Math.round(doc[k].y); votes.set(y, (votes.get(y) ?? 0) + 1) }
    let best = null
    for (const [y, n] of votes) if (n >= Math.max(2, Math.ceil(withText / 4)) && (!best || n > best[1])) best = [y, n]
    return best?.[0] ?? null
  }
  const foot = recurring(lowest, t => t.y < low - 0.5 * t.h), head = recurring(highest, t => t.y > high + 0.5 * t.h)
  return t => t.x >= left - t.h && t.x + t.w <= right + t.h && (foot == null || t.y > foot + 0.5 * t.h) && (head == null || t.y < head - 0.5 * t.h)
}

/**
 * Whether a word of the page can be a display's whose letters are `letters` (latex-front's displayLetters): its runs of
 * three letters or more, Greek set aside, stand in them, and so does a CJK character. A table's row, a listing's line,
 * a caption's words cannot (the review of A1: normal-size rows were taken where the display was not)
 */
const explained = (t, letters) => {
  if (!t) return true
  if (CJK.test(t)) return letters.includes(t)
  for (const run of t.replace(/\p{Script=Greek}/gu, ' ').match(/\p{L}{3,}/gu) ?? []) if (!letters.includes(run)) return false
  return true
}

/** a line one of two rules takes (either), or holds (HELD) */
const either = (a, b) => (ks, edge) => {
  const x = a(ks, edge)
  if (x === true) return true
  const y = b(ks, edge)
  return y === true || (x === HELD || y === HELD ? HELD : false)
}

/** a line a display's `letters` explain (explained); the edge's own line needs no explaining. A line with no letter —
 *  digits alone: a table's row of numbers, a page's number, or a display's row of digits — explains nothing: it is taken
 *  only between lines that are (take's HELD), not as the last one (the re-review of A1, m1) */
const byLetters = (doc, letters) => (ks, edge) => {
  if (edge) return true
  let words = false
  for (const j of ks) { const t = doc[j].t; if (!explained(t, letters)) return false; words ||= /\p{L}/u.test(t) }
  return words || HELD
}

/**
 * A line of the unit's own words, in the order its text has them: `words` are the unit's words between two of its
 * matched tokens — the words the text matching left there, at a page or column break — and the lines are met in stream
 * order after the first of them (`dir` 1) or before the second (-1). Each word of two letters or more on the line is
 * looked for among the next few of `words` (a word a hyphen cut at the break matches its first or its last part); a
 * placeholder's single letters and digits pass. The line is the unit's when OWN of its words are found so, and the
 * edge's own line is (what follows the last matched word on it, before the first: a placeholder's words, a word's half a
 * hyphen cut). A table's row that shares a word or two with the paragraph does not pass: its words are not the unit's
 * next ones
 */
function inOrder(doc, words, dir) {
  let p = dir > 0 ? 0 : words.length - 1
  return (ks, edge) => {
    let found = 0, all = 0
    for (const j of ks) {
      const t = doc[j].t
      if (!t || (!CJK.test(t) && !/\p{L}{2}/u.test(t.replace(/\p{Script=Greek}/gu, ' ')))) continue
      all++
      for (let q = p, n = 0; n < AHEAD && q >= 0 && q < words.length; q += dir, n++) {
        const w = words[q]
        if (w === t || (!CJK.test(t) && (dir > 0 ? w.startsWith(t) : w.endsWith(t)))) { found++; p = q + dir; break }
      }
    }
    return edge || (all > 0 && found / all >= OWN)
  }
}

/**
 * Takes for unit `u` the words past its edge token `k0` — after it (`dir` 1) or before it (-1) — that are no other
 * unit's: a display beyond its marks. The stream's lines are gathered up to a line another unit's words are on, a new
 * page, a new column (back up the page past the edge's line), the page's frame (pageFrame) or a line the display's
 * `letters` do not explain (explained); then taken by where they
 * stand, nearest first: the lines holding a glyph of the unit's body size, the first `first` body heights at most from
 * the edge's line (and `most` points), each next GAP at most from those taken; then the smaller glyphs among them, SMALL at most outside
 * them — a display's limits, scripts and fractions' parts. Further, or smaller and apart, is a float, a footnote, the
 * page's foot. What is taken becomes the unit's, so that no other unit takes it
 */
function walker(doc, ms, owner, line) {
  const inFrame = pageFrame(doc, ms)
  // which unit each line holds words of: -1 none, -2 several
  const lineOwner = new Int32Array((line[doc.length - 1] ?? 0) + 1).fill(-1)
  const own = (k, u) => { const l = line[k]; lineOwner[l] = lineOwner[l] === -1 || lineOwner[l] === u ? u : -2 }
  for (let k = 0; k < doc.length; k++) {
    const u = owner[k]
    if (u === -1) continue
    const l = line[k], o = lineOwner[l]
    if (o !== u) lineOwner[l] = o === -1 ? u : -2
  }
  const body = new Float64Array(ms.length)
  const bodyOf = u => { if (!body[u]) { const hs = ms[u].map(k => doc[k].h).sort((x, y) => x - y); body[u] = hs[hs.length >> 1] } return body[u] }
  function take(u, k0, dir, first, fits, most = Infinity) {
    const A = doc[k0], h = bodyOf(u), lines = [], held = []
    for (let k = k0 + dir, end = false; !end && k >= 0 && k < doc.length;) {
      const l = line[k], ks = []
      for (; k >= 0 && k < doc.length && line[k] === l; k += dir) {
        const t = doc[k]
        if (t.page !== A.page || (owner[k] !== -1 && owner[k] !== u) || (dir > 0 ? t.y > A.y + 0.5 * A.h : t.y < A.y - 0.5 * A.h) || !inFrame(t)) { end = true; break }
        ks.push(k)
      }
      // `fits` says whether the line can be the unit's, or only between lines that can (HELD: before a line taken in the
      // stream, or where the lines taken stand above and below it — an equation's number beside its rows); the edge's
      // own line is told apart (within half a line of it: the scripts of its last formula a little above or below)
      if (!ks.length || (lineOwner[l] !== -1 && lineOwner[l] !== u)) break
      const fit = fits ? fits(ks, Math.abs(doc[ks[0]].y - A.y) < 0.5 * A.h) : true
      if (!fit) break
      let top = -Infinity, bottom = Infinity, body = false
      for (const j of ks) { const t = doc[j]; top = Math.max(top, t.top); bottom = Math.min(bottom, t.bottom); body ||= t.h >= BODY * h }
      if (fit === HELD) held.push({ ks, top, bottom, body })
      else lines.push(...held.splice(0), { ks, top, bottom, body })
    }
    lines.push(...held.filter(x => lines.some(l => l.top >= x.bottom) && lines.some(l => l.bottom <= x.top)))
    let reach = dir > 0 ? A.bottom : A.top, n = 0
    for (const l of lines.filter(l => l.body).sort((x, y) => (dir > 0 ? y.top - x.top : x.bottom - y.bottom))) {
      if ((dir > 0 ? reach - l.top : l.bottom - reach) > (n ? GAP * h : Math.min(first * h, most))) break
      reach = dir > 0 ? Math.min(reach, l.bottom) : Math.max(reach, l.top)
      n++
    }
    if (!n) return []
    const edge = reach - dir * SMALL * h
    return lines.filter(l => (dir > 0 ? l.bottom >= edge : l.top <= edge)).flatMap(l => l.ks)
  }
  return {
    take,
    claim(u, k0, dir, first, fits) { const ks = take(u, k0, dir, first, fits); for (const k of ks) { owner[k] = u; own(k, u) } return ks },
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
    const b = hard[u]
    // where its placeholders stood matters to a unit found as a run of words, which a unit with marks never is
    const { ws, gap } = unitWords(text, b ? null : gaps)
    const [lo, hi] = b ?? (bounds?.size ? [Math.max(0, before[u] + 1 - MARGIN), Math.min(doc.length - 1, after[u] - 1 + MARGIN)] : [0, doc.length - 1])
    // a heading — no marks, in the text between its located neighbours: its words in a row in the gap between them
    // alone, no margin, the last place they come there, since a heading is followed by its own text; a running head
    // with its words comes before it, and the next section's text is past the gap. By 3-grams it was taken from a
    // paragraph beside it that has the same words (2608.02163 in Chinese: a heading of four characters the text
    // around it keeps using)
    let m = !b && bounds?.size && ws.length && !floating(id) ? inRow(doc, ws, before[u] + 1, after[u] - 1, true, gap) : null
    let pairs = null
    if (!m && ws.length >= K && lo <= hi) { const r = locate(doc, index, ws, lo, hi, !!b); if (r) { m = r.tokens; pairs = r.pairs } }
    // a float's text too short for 3-grams (a table's cell of one or two words): the words in a row, once, in the gap
    // between its located neighbours alone
    if (!m && !b && ws.length && ws.length < K && bounds?.size) m = inRow(doc, ws, before[u] + 1, after[u] - 1, false, gap)
    // a float's text that is not there: its float may stand anywhere, so the whole document, as with no marks at all —
    // the words of a located unit are that unit's (owner, below)
    if (!m && !b && ws.length >= K && bounds?.size && floating(id)) m = locate(doc, index, ws, 0, doc.length - 1, false)?.tokens ?? null
    // a run takes a placeholder's words besides the unit's own, which are all there
    const coverage = m ? Math.min(1, m.length / ws.length) : 0
    if (!b && (!m || coverage < minCoverage)) { found.push(null); return }
    // a unit with marks keeps its words and which of them were matched where, for a break (wordsBetween)
    found.push(b ? { m: m ?? [], coverage, bounded: b, ws, pairs } : { m: m ?? [], coverage, bounded: b })
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
  // a display a unit sets before its first words or after its last (latex-front's `lead`, `trail`: its letters) stands
  // outside its marks, which are in running text: it is taken from beyond them, the lines its letters explain — the
  // leading ones first, so that a unit's trailing walk stops at the display the next unit opens with
  const walk = walker(doc, ms, owner, line)
  const beyond = []
  for (const edge of ['lead', 'trail']) {
    units.forEach((unit, u) => {
      const b = found[u]?.bounded
      if (b && ms[u] && typeof unit[edge] === 'string') beyond[u] = (beyond[u] ?? []).concat(walk.claim(u, edge === 'lead' ? b[0] : b[1], edge === 'lead' ? -1 : 1, FIRST, byLetters(doc, unit[edge])))
    })
  }
  /** the unit's words between two of its tokens in the document, as its text has them: none were matched there. A
   *  bound's token not matched is still the unit's first or last word, and none of those between (the re-review of A1,
   *  m3: a last word alone on the next page counted itself, and a table's row repeating it passed) */
  const wordsBetween = (f, a, b) => {
    let i = a === f.bounded[0] ? 0 : -1, j = b === f.bounded[1] ? f.ws.length - 1 : f.ws.length
    if (f.pairs) for (const [w, k] of f.pairs) { if (k === a) i = w; if (k === b) j = w }
    return i < j ? f.ws.slice(i + 1, j) : []
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
      // and above the other on its own — not the page's head and foot, a footnote, a float (walker): the unit's own
      // words the text did not match there, in their order (inOrder) — a column's last words, a word a hyphen cut over
      // the page — and with a display between its words (latex-front's `inner`: its letters), the lines those letters
      // explain. Anything else of the unit's size a float's skip away would be taken — a table
      else if (f.bounded && (A.page !== B.page || B.y > A.y + A.h * 0.6)) {
        const inner = units[u].inner
        let down, up
        const words = wordsBetween(f, m[n], m[n + 1])
        // with a display: its lines (its letters) or the unit's own words left there — not any word of the paragraph's,
        // which a table's row at the break may share (the re-review of A1, m2)
        const fits = dir => (typeof inner === 'string' ? either(byLetters(doc, inner), inOrder(doc, words, dir)) : inOrder(doc, words, dir))
        down = walk.take(u, k, 1, ACROSS, fits(1)); up = walk.take(u, m[n + 1], -1, ACROSS, fits(-1), FLOAT_SKIP)
        const last = down.at(-1) ?? k
        idx.push(...down.filter(j => j < m[n + 1]), ...up.filter(j => j > last).reverse())
      }
    }
    const all = beyond[u]?.length ? [...new Set([...idx, ...beyond[u]])].sort((x, y) => x - y) : idx
    out.set(id, { rects: lineRects(doc, all), coverage: +f.coverage.toFixed(3), tokens: all, bounded: !!f.bounded })
  })
  return out
}
