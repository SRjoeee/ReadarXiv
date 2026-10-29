// src/pdf-reader/engine/layer-proto/words.mjs
// The page's word table (1b-E; the 1b design §4, reader-interface-note §5): where each word the layer draws on a page stands,
// for the right pane's sentence highlight. The engine returns tokens, never the rectangles of sentences: the view makes those
// (view/highlight.mjs) from this table and `word`.
//
// Three parts, none of which touches a drawing:
// - plainTracker: the offsets of a unit's drawn words in plainTranslated(pieces) (translate/mt.mjs; layer/pieces.mjs trText),
//   which tokensOf2 reads as it sets each text piece (a field `at` and `end` on the tokens it makes, nothing else changed);
// - wordIndexer: the index of the anchors.mjs `tokens()` entry that covers such a range, the word a side finds a sentence's
//   start by (sentenceStarts reads `row.sentences.tr` as counts of these entries);
// - the page's table: addUnitWords walks a unit's lines as svgOfUnit does (its line, then its item) and appends one token for
//   each drawn word, crop and kept line, each kept line where the text's flow passes it; freezeWords makes the record a page
//   keeps. Each token has its place in plainTranslated (`at`), from which the view reads its sentence (view/highlight.mjs).
import { shown } from '../layer/pieces.mjs'
import { tokens as wordsIn } from '../pipeline/anchors.mjs'

/** the white space `plainTranslated` collapses: `\s`, as its `replace(/\s+/g, ' ')` reads it */
const BLANK = /\s/

/**
 * The offsets of a unit's text in plainTranslated(pieces): every non-text piece a space, white space collapsed to one, the
 * whole trimmed. Fed in the pieces' order: `gap()` for a piece that is no text, `text(s)` for a text piece's shown string,
 * which answers an Int32Array giving, for each UTF-16 index of `s`, the offset of that character in the plain text (a blank
 * has the offset of the single space it collapses into, or of what follows when it is trimmed). `space()`: the offset of the
 * space the text so far ends in, which a piece that is no text becomes (0 while the text is empty: trimmed); `next()`: the
 * offset the next character would have
 */
export function plainTracker() {
  // (`space`: the plain text so far is empty or ends in a space: a blank adds nothing, which trims its start)
  let len = 0, space = true
  return {
    gap() { if (!space) { len++; space = true } },
    space: () => Math.max(0, len - 1),
    next: () => len,
    text(s) {
      const at = new Int32Array(s.length)
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i)
        if (c <= 32 || c > 126 ? BLANK.test(s[i]) : false) {
          at[i] = len
          if (!space) { len++; space = true }
        } else {
          at[i] = len++
          space = false
        }
      }
      return at
    },
  }
}

/**
 * The source of each text token's offsets in a piece of text the way tokensOf2 reads it: its transformed string (`out`: line
 * feeds, `---`, `--`, ` `` ` and `''` as pieces' text goes through them) and, for each character of it, the index of its first
 * character in the piece's shown string (`from`) and how many it stands for (`span`). Null where `out` is not `expected`, the
 * string tokensOf2 reads (the two are written apart; the caller then tags nothing, never a wrong place)
 */
export function transformMap(s, expected) {
  let out = ''
  const from = [], span = []
  for (let i = 0; i < s.length;) {
    const c = s[i]
    let ch = c, n = 1
    if (c === '-' && s[i + 1] === '-') { if (s[i + 2] === '-') { ch = '—'; n = 3 } else { ch = '–'; n = 2 } }
    else if (c === '`' && s[i + 1] === '`') { ch = '“'; n = 2 }
    else if (c === "'" && s[i + 1] === "'") { ch = '”'; n = 2 }
    else if (c === '\n') ch = ' '
    out += ch
    for (let q = 0; q < ch.length; q++) { from.push(i); span.push(n) }
    i += n
  }
  return out === expected ? { from, span } : null
}

/**
 * For a translated piece (TeX's escapes in its text), the index in its shown string (layer/pieces.mjs `shown`: `\%` as `%`,
 * `\textbackslash{}` as a space) of each UTF-16 index of the raw text, an escape's characters all at its one shown character.
 * Null where the string so made is not `expected` (the shown string): the caller then tags nothing
 */
export function escapeMap(raw, expected) {
  const at = new Int32Array(raw.length)
  let out = ''
  for (let i = 0; i < raw.length;) {
    let n = 1, ch = raw[i]
    if (ch === '\\') {
      const m = /^\\(?:textbackslash|textasciitilde|textasciicircum)\{\}/.exec(raw.slice(i, i + 20))
      if (m) { n = m[0].length; ch = ' ' } else if (i + 1 < raw.length && '#$%&_{}'.includes(raw[i + 1])) { n = 2; ch = raw[i + 1] }
    }
    for (let q = 0; q < n; q++) at[i + q] = out.length
    out += ch
    i += n
  }
  return out === expected ? at : null
}

/**
 * The word index of a range of plain text: the index, in anchors.mjs tokens(plain), of the entry that covers the range's
 * start, else the first entry that begins inside the range (a word with a mark before it); -1 where there is none (a mark
 * alone). tokens() counts in the NFKC, lower-case string. For plain ASCII that has the text's own offsets; otherwise each
 * code point with the combining marks after it is folded by itself (an ellipsis becomes three full stops, a ligature its
 * letters) and the offsets are mapped through those clusters, provided the clusters folded one by one are the whole text folded
 * (not so where a sequence composes across clusters, as Hangul jamo do): else every range has -1, never a wrong word
 */
export function wordIndexer(plain) {
  const entries = wordsIn(plain)
  if (!entries.length) return () => -1
  let toFolded = null
  if (/\P{ASCII}/u.test(plain)) {
    toFolded = new Int32Array(plain.length + 1)
    let n = 0, joined = ''
    for (let i = 0; i < plain.length;) {
      let j = i + (plain.codePointAt(i) > 0xffff ? 2 : 1)
      while (j < plain.length) { const c = plain.codePointAt(j); if (!MARK.test(String.fromCodePoint(c))) break; j += c > 0xffff ? 2 : 1 }
      const f = plain.slice(i, j).normalize('NFKC').toLowerCase()
      for (let q = i; q < j; q++) toFolded[q] = n
      joined += f
      n += f.length
      i = j
    }
    toFolded[plain.length] = n
    if (joined !== plain.normalize('NFKC').toLowerCase()) return () => -1
  }
  const starts = entries.map(e => e.at)
  return (at, end) => {
    const a = toFolded ? toFolded[at] : at, z = toFolded ? toFolded[Math.min(end, plain.length)] : end
    // the last entry that begins at or before a, then the entry after it where that one ends before a
    let lo = 0, hi = starts.length
    while (lo < hi) { const m = (lo + hi) >> 1; if (starts[m] <= a) lo = m + 1; else hi = m }
    let k = lo - 1
    if (k < 0 || entries[k].at + entries[k].len <= a) k++
    return k < entries.length && entries[k].at < z ? k : -1
  }
}
const MARK = /\p{M}/u

/** a unit's plain translated text from its pieces: plainTranslated's (translate/mt.mjs), as layer/pieces.mjs writes it */
export function plainOfPieces(pieces) {
  return pieces.map(p => (p.t === 'text' ? shown(p) : ' ')).join('').replace(/\s+/g, ' ').trim()
}

/**
 * Each piece's place in plainTranslated(pieces), as plainTracker counts it (tokensOf2's walk): a text piece's first character
 * that is no blank (where it has none, where the text goes on), any other piece the space it becomes (the one before it where
 * the text so far ends in one; 0 at the text's start, which is trimmed). A placeholder's rendering, its crop and a display's
 * kept lines are at their piece's place: a sentence of the translation holds them where it holds that space
 */
export function pieceOffsets(pieces) {
  const tracker = plainTracker(), out = new Int32Array(pieces.length)
  pieces.forEach((p, k) => {
    if (p.t !== 'text') { tracker.gap(); out[k] = tracker.space(); return }
    const s = shown(p), at = tracker.text(s), i = s.search(/\S/)
    out[k] = i >= 0 ? at[i] : tracker.next()
  })
  return out
}

// ---------------------------------------------------------------- the page's table
/** the face's ascent and descent in em: a Times-like face's (the left's default), and a CJK face's em box (Noto CJK's ideographic box) */
const ASC = 0.75, DESC = -0.22, CJK_ASC = 0.88, CJK_DESC = -0.12
const FIELDS = ['l', 'r', 'y', 'h', 'top', 'bottom']

/** a text token's band on a line whose baseline is `by` (L: its unit's layout): the baseline it is drawn on (a superscript's
 *  raised), the size drawn and the ascent and descent of a Times-like face, or of a CJK face's em box, over and under it: the
 *  word table's, and a moved link's (links.mjs) */
export function tokenBand(t, L, by) {
  const h = L.f * (t.sup ? 0.62 : 1) * (t.face.size ?? 1), y = t.sup ? by + 0.36 * L.f : by
  const cjk = t.cls === 'cjk'
  return { y, h, top: y + (cjk ? CJK_ASC : ASC) * h, bottom: y + (cjk ? CJK_DESC : DESC) * h }
}

/** a page's table as it is built: one growable column a field, in drawing order */
export function newWords() {
  return { n: 0, cap: 256, l: new Float32Array(256), r: new Float32Array(256), y: new Float32Array(256), h: new Float32Array(256), top: new Float32Array(256), bottom: new Float32Array(256), word: new Int32Array(256), at: new Int32Array(256), spans: [] }
}
function push(W, l, r, y, h, top, bottom, word, at) {
  if (W.n === W.cap) {
    W.cap *= 2
    for (const f of FIELDS) { const a = new Float32Array(W.cap); a.set(W[f]); W[f] = a }
    for (const f of ['word', 'at']) { const a = new Int32Array(W.cap); a.set(W[f]); W[f] = a }
  }
  const i = W.n++
  W.l[i] = l; W.r[i] = r; W.y[i] = y; W.h[i] = h; W.top[i] = top; W.bottom[i] = bottom; W.word[i] = word; W.at[i] = at
}

/**
 * The tokens of one unit on one page, appended to the page's table in the order of the unit's text: its lines in their order,
 * each line's items in theirs (the walk svgOfUnit makes), and each of the original's lines it keeps in place (`kept`,
 * layer2.mjs keptLines) where its text passes that line — a displayed formula between the text before it and the text after it,
 * which the view reads as the unit's reading order (view/highlight.mjs). A kept line of a region the text breaks at (`region`)
 * goes before the first line laid after the text passed the region (a line's `past`: breakLines', where the walk consumed it,
 * also where the text ran on above the display, 'flow'; a slot's `after` for a line laid with none); any other (`block`) before
 * the first line of the first block that follows it in the unit's rectangles; a region the page has no later line for, after
 * the lines.
 * A text token is the item's slot, [x, x + the layout's width] (an opening mark a compressed line shifts left of its slot is
 * still in it: the ink the slot holds, so that neighbours tile; a lead's last token without the original's glue after it), on
 * the line's baseline (a superscript on the baseline it is drawn on); `h` is the size drawn, and `top`, `bottom` the ascent and
 * descent of a Times-like face, or of a CJK face's em box. A crop is its drawn box (at the line's baseline, its height the
 * crop's times the layout's scale; each part of a formula TeX broke over lines its own, `crop.part`), none where `drawnCrop`
 * says it is not drawn; a kept line the unit's original rectangle. `word` is the token's word in the unit's translation
 * (`wordOf(at, end)` over what tokensOf2 tagged: -1 for a lead, a label, a placeholder's rendering, a crop, a kept line and a
 * mark alone, which have none). `at` is its place in plainTranslated(pieces): a text token's own (tokensOf2's), a crop's, a
 * rendering's and a kept line's its placeholder's piece's (`pieceAt`, pieceOffsets; every part of a crop its piece's), and a
 * token with none of its own (a lead, a label, a text the layer cannot place, a kept line no placeholder holds) the place of
 * the token before it in the unit's table, else of the one after it; -1 where the unit has none. A space is no token. The unit's
 * tokens are one run of the table, recorded as its span (empty ranges where the unit is painted on the page with no line on
 * it: a paragraph that ran on to a page its text did not reach)
 */
export function addUnitWords(W, L, page, id, wordOf, kept = [], drawnCrop = () => true, pieceAt = null) {
  const first = W.n
  const lines = L.lines.filter(line => line.page === page)
  const placeOf = k => (pieceAt && Number.isInteger(k) && k >= 0 && k < pieceAt.length ? pieceAt[k] : -1)
  // (each kept line by the laid line it is written before: lines.length after them all)
  const before = kept.map(k => {
    const j = k.region !== undefined ? lines.findIndex(line => (line.past ?? line.after ?? 0) > k.region) : k.block !== undefined ? lines.findIndex(line => (line.block ?? 0) >= k.block) : -1
    return j < 0 ? lines.length : j
  })
  const keptBefore = j => { kept.forEach((k, q) => { if (before[q] === j) push(W, k.x0, k.x1, k.baseline, k.size, k.top, k.bottom, -1, placeOf(k.k)) }) }
  lines.forEach((line, j) => {
    keptBefore(j)
    const by = line.baseline
    // (a line's size and scale its run's, where the unit's runs are laid apart: layer2.mjs layoutRuns)
    const LL = line.seg ?? L
    for (const it of line.items) {
      const t = it.t
      if (t.space) continue
      const l = it.x - (it.shift ?? 0)
      if (t.crop) {
        if (!drawnCrop(t.crop)) continue
        const c = t.crop.crop, h = (c[3] - c[1]) * LL.scale, top = by + (c[3] - t.crop.baseline) * LL.scale
        push(W, l, l + it.w, by, h, top, top - h, -1, placeOf(t.crop.k))
        continue
      }
      if (typeof t.s !== 'string') continue
      const { y, h, top, bottom } = tokenBand(t, LL, by)
      push(W, l, l + it.w - (t.kern ? (t.kernEm ?? 0) * LL.f : 0), y, h, top, bottom, t.at === undefined || !wordOf ? -1 : wordOf(t.at, t.end), t.at ?? placeOf(t.k))
    }
  })
  keptBefore(lines.length)
  // (a token with no place of its own: the one before it, else the one after it)
  for (let i = first + 1; i < W.n; i++) if (W.at[i] < 0) W.at[i] = W.at[i - 1]
  for (let i = W.n - 2; i >= first; i--) if (W.at[i] < 0) W.at[i] = W.at[i + 1]
  W.spans.push([id, W.n > first ? [first, W.n - first] : []])
}

/**
 * The tokens of a drawn thing no unit's layout lays (a babel name, a figure's label: run.mjs paintNames, paintFigures), one a drawn
 * segment (textlayer.mjs nameSeg's: its box, its baseline, its size), appended to the page's table under `id` as a unit's span, so
 * that the hover lights it and its original as it does a unit (view/shapes.mjs layerShapes); no word, no place (it lights whole)
 */
export function addSegWords(W, id, segs) {
  const first = W.n
  for (const s of segs) push(W, s.x, s.x + s.w, s.base, s.size, s.y + s.h, s.y, -1, -1)
  W.spans.push([id, W.n > first ? [first, W.n - first] : []])
}

/** the record a page keeps: the table's columns cut to its tokens, its spans, the units left the original's, rising, the rows
 *  on the page of each unit the layout lays (`rows`, [id, [x0, y0, x1, y1, …]] by id rising, our page's PDF units, y up; an
 *  empty list for one laid only on other pages), and whether the page's lines moved (`drift`): where a copy of the left's
 *  tokens may stand (view/shapes.mjs layerShapes) */
export function freezeWords(W, original, rows = [], drift = false) {
  const n = W?.n ?? 0
  const col = (f, T) => (W ? W[f].slice(0, n) : new T(0))
  return {
    tokens: { n, l: col('l', Float32Array), r: col('r', Float32Array), y: col('y', Float32Array), h: col('h', Float32Array), top: col('top', Float32Array), bottom: col('bottom', Float32Array) },
    word: col('word', Int32Array),
    at: col('at', Int32Array),
    spans: W ? W.spans : [],
    original: [...original].sort((a, b) => a - b),
    rows: rows.map(([id, rs]) => [id, [...rs]]).sort((a, b) => a[0] - b[0]),
    drift,
  }
}

/** a copy of a kept record, none of its arrays the record's (the view may transfer or free them) */
export function copyWords(w) {
  const t = w.tokens
  return {
    tokens: { n: t.n, l: t.l.slice(), r: t.r.slice(), y: t.y.slice(), h: t.h.slice(), top: t.top.slice(), bottom: t.bottom.slice() },
    word: w.word.slice(),
    at: w.at.slice(),
    spans: w.spans.map(([id, ranges]) => [id, ranges.slice()]),
    original: w.original.slice(),
    rows: (w.rows ?? []).map(([id, rs]) => [id, rs.slice()]),
    drift: !!w.drift,
  }
}
