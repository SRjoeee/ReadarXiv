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
//   each drawn word, crop and kept line; freezeWords makes the record a page keeps.
import { shown } from '../layer/pieces.mjs'
import { tokens as wordsIn } from '../pipeline/anchors.mjs'

/** the white space `plainTranslated` collapses: `\s`, as its `replace(/\s+/g, ' ')` reads it */
const BLANK = /\s/

/**
 * The offsets of a unit's text in plainTranslated(pieces): every non-text piece a space, white space collapsed to one, the
 * whole trimmed. Fed in the pieces' order: `gap()` for a piece that is no text, `text(s)` for a text piece's shown string,
 * which answers an Int32Array giving, for each UTF-16 index of `s`, the offset of that character in the plain text (a blank
 * has the offset of the single space it collapses into, or of what follows when it is trimmed)
 */
export function plainTracker() {
  // (`space`: the plain text so far is empty or ends in a space: a blank adds nothing, which trims its start)
  let len = 0, space = true
  return {
    gap() { if (!space) { len++; space = true } },
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
 * The word index of a range of plain text: the index, in anchors.mjs tokens(plain), of the entry that covers the range's
 * start, else the first entry that begins inside the range (a word with a mark before it); -1 where there is none (a mark
 * alone). tokens() counts in the NFKC, lower-case string: where that has the plain text's length the offsets are the same,
 * else (an ellipsis or a ligature NFKC spells out) they are mapped character by character, and a text whose mapping does not
 * sum to the whole's gives -1 for every range (never a wrong word)
 */
export function wordIndexer(plain) {
  const entries = wordsIn(plain)
  if (!entries.length) return () => -1
  const folded = plain.normalize('NFKC').toLowerCase()
  let toFolded = null
  if (folded.length !== plain.length) {
    toFolded = new Int32Array(plain.length + 1)
    let n = 0
    for (let i = 0; i < plain.length;) {
      const cp = plain.codePointAt(i), w = cp > 0xffff ? 2 : 1
      const f = String.fromCodePoint(cp).normalize('NFKC').toLowerCase().length
      for (let q = 0; q < w; q++) toFolded[i + q] = n
      n += f
      i += w
    }
    toFolded[plain.length] = n
    if (n !== folded.length) return () => -1
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

/** a unit's plain translated text from its pieces: plainTranslated's (translate/mt.mjs), as layer/pieces.mjs writes it */
export function plainOfPieces(pieces) {
  return pieces.map(p => (p.t === 'text' ? shown(p) : ' ')).join('').replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------- the page's table
const ASC = 0.75, DESC = -0.22
const FIELDS = ['l', 'r', 'y', 'h', 'top', 'bottom']

/** a page's table as it is built: one growable column a field, in drawing order */
export function newWords() {
  return { n: 0, cap: 256, l: new Float32Array(256), r: new Float32Array(256), y: new Float32Array(256), h: new Float32Array(256), top: new Float32Array(256), bottom: new Float32Array(256), word: new Int32Array(256), spans: [] }
}
function push(W, l, r, y, h, top, bottom, word) {
  if (W.n === W.cap) {
    W.cap *= 2
    for (const f of FIELDS) { const a = new Float32Array(W.cap); a.set(W[f]); W[f] = a }
    const w = new Int32Array(W.cap)
    w.set(W.word)
    W.word = w
  }
  const i = W.n++
  W.l[i] = l; W.r[i] = r; W.y[i] = y; W.h[i] = h; W.top[i] = top; W.bottom[i] = bottom; W.word[i] = word
}

/**
 * The tokens of one unit on one page, appended to the page's table: its lines in their order, each line's items in theirs (the
 * walk svgOfUnit makes), then the original's lines it keeps in place. A text token is [x, x + the layout's width] on the line's
 * baseline (a superscript on the baseline it is drawn on), `h` the size it is drawn at and `top`, `bottom` the ascent and
 * descent of a Times-like face (the left's defaults); a crop is its drawn box (at the line's baseline, its height the crop's
 * times the layout's scale); a kept line the unit's original rectangle. `word` is the token's word in the unit's translation
 * (`wordOf(at, end)` over what tokensOf2 tagged: -1 for a lead, a label, a placeholder's rendering, a crop, a kept line and
 * a mark alone, which have none). A space is no token. The unit's tokens are one run of the table, recorded as its span (empty
 * ranges where the unit is painted on the page with no line on it: a paragraph that ran on to a page its text did not reach)
 */
export function addUnitWords(W, L, page, id, wordOf, kept = []) {
  const first = W.n
  for (const line of L.lines) {
    if (line.page !== page) continue
    const by = line.baseline
    for (const it of line.items) {
      const t = it.t
      if (t.space) continue
      if (t.crop) {
        const c = t.crop.crop, h = (c[3] - c[1]) * L.scale, top = by + (c[3] - t.crop.baseline) * L.scale
        push(W, it.x, it.x + it.w, by, h, top, top - h, -1)
        continue
      }
      if (typeof t.s !== 'string') continue
      const h = L.f * (t.sup ? 0.62 : 1) * (t.face.size ?? 1), y = t.sup ? by + 0.36 * L.f : by
      push(W, it.x, it.x + it.w, y, h, y + ASC * h, y + DESC * h, t.at === undefined || !wordOf ? -1 : wordOf(t.at, t.end))
    }
  }
  for (const k of kept) push(W, k.x0, k.x1, k.baseline, k.size, k.top, k.bottom, -1)
  W.spans.push([id, W.n > first ? [first, W.n - first] : []])
}

/** the record a page keeps: the table's columns cut to its tokens, its spans, and the units left the original's, rising */
export function freezeWords(W, original) {
  const n = W?.n ?? 0
  const col = (f, T) => (W ? W[f].slice(0, n) : new T(0))
  return {
    tokens: { n, l: col('l', Float32Array), r: col('r', Float32Array), y: col('y', Float32Array), h: col('h', Float32Array), top: col('top', Float32Array), bottom: col('bottom', Float32Array) },
    word: col('word', Int32Array),
    spans: W ? W.spans : [],
    original: [...original].sort((a, b) => a - b),
  }
}

/** a copy of a kept record, none of its arrays the record's (the view may transfer or free them) */
export function copyWords(w) {
  const t = w.tokens
  return {
    tokens: { n: t.n, l: t.l.slice(), r: t.r.slice(), y: t.y.slice(), h: t.h.slice(), top: t.top.slice(), bottom: t.bottom.slice() },
    word: w.word.slice(),
    spans: w.spans.map(([id, ranges]) => [id, ranges.slice()]),
    original: w.original.slice(),
  }
}
