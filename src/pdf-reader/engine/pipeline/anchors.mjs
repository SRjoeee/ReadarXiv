// Anchors: where each translation unit sits in a PDF, found from the PDF.js text layer. Pure — no DOM, no Node — so
// the reader page and the Node tests run the same code.
// Two sources of truth, the better one first:
//  - marks: when we compiled the PDF ourselves, every unit's first word and last character carry a named destination
//    (latex-front.mjs, patch's `mark`). They bound the unit exactly; `boundsFromMarks` turns them into token ranges.
//  - text alone (exp-freeze-2026-10-07:experiments/pdf-bilingual/REPORT.md §2, spike A): 3-gram anchors, the longest chain rising in both texts, a bounded fill between
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
 * joined back into the first part's token — cut by a hyphen at a line end (the end an item's own, or an empty item's after
 * it: PDF.js's where marked content closes), or cut on its line where the font changes
 * inside it (a heading's small capitals after its capital letter: E + XPERIMENTAL), the second part beginning where
 * the first ends with no space between; the second part keeps its own box with no text, so a line's box still starts
 * where its text does. An item's width is shared evenly between its characters, so a Latin word's box is approximate.
 * An item that repeats the one before it on its baseline, less than a tenth of its size further on, is that item
 * printed over itself to look bold, and is read once: pdfLaTeX's CJK bold prints each character three times 0.015 em
 * apart (2608.02991, 2608.29181), which made a bold heading's every character three tokens; the same string again as
 * text of its own stands a third of an em further at least.
 * An item set at an angle (its transform turns or mirrors its baseline: a landscape page's caption, arXiv's stamp up the
 * first page's margin, a figure's axis label) has its tokens along its baseline, each token's box the axis-aligned box of
 * its run of the baseline from the ascent to the descent along the glyphs' up (the transform's (c, d), scaled or slanted as
 * it is drawn), its `y` the middle of that run: the box and the place
 * of its glyphs on the page, where read along x they ran off the page (1406.1078v3's landscape caption, 645 units past its
 * page's right edge). An upright item's (rightwards, its glyphs up) are worked out as they always were, to the bit. A word
 * is joined across two items only where both run the same way, unskewed; a turned token's box takes the marks its item sets
 * against the word (its ink, which inkEdges reads across alone, is its box); the carry of an item of marks alone, read along
 * x, is that of text whose baseline runs rightwards alone
 */
/** how many items on a word a hyphen cut at its line's end waits for its line below */
const PENDING_ITEMS = 4
/** and how many of its size further along than its line's item its line below may start: a hanging label's width in (a list's
 *  bullet, 1.1 sizes, 2307.16209v1 p22's "inves-"/"tigate"; a list of figures' number, 2.3; a bibliography's label, 4), never a
 *  figure's text set to the right */
const HANG = 6
/** and how many past its line's end, above it, the next column's first line may start: a column's gutter (2.7 sizes at most in the
 *  two-column classes: ACM's 2pc at 9 pt), at its line's size within SAME_SIZE; never a figure's label in that column (2610.21765v1
 *  p7's "q", 15 sizes past "Sim-", and its axis's "0", 4.6, both smaller than the text) */
const GUTTER = 3, SAME_SIZE = 0.1
/** a hyphen's word waiting for its line below: the token, and where its item ended, along which direction, at what size */
const pendingOf = (token, at) => ({ token, x: at.x, y: at.y, ex: at.ex, ey: at.ey, ux: at.ux, uy: at.uy, size: at.size, left: PENDING_ITEMS })
export function tokenizeDocument(pages) {
  const doc = []
  const WORD_END = /[\p{L}\p{N}]$/u, WORD_START = /^[\p{L}\p{N}]/u
  for (const { page, items, styles } of pages) {
    // the page's monospaced faces (inkEdges: their items an even share), by name, a page's styles at once
    for (const name in styles) if (styles[name]?.fontFamily === 'monospace') { const m = monospaced.get(doc) ?? monospaced.set(doc, new Set()).get(doc); m.add(name) }
    // carry: the token the next one joins; last: the token holding the last word's text; prev: the last item's end;
    // inkOpen, inkEnd: whether an item of marks alone may still carry the last token's ink on, and from where; lastAcross:
    // whether the last token's item is read along x
    let carry = null, last = null, prev = null, inkOpen = false, inkEnd = 0, lastAcross = true, hyphened = null, pending = null
    for (const it of items) {
      // (an empty item that ends a line ends the item before's: PDF.js gives the line's end so where marked content closes after
      // the item, our wrapped page's groups, so that a word a hyphen cut there was read as two on our page and one on arXiv's,
      // and 2610.19274v1's list of figures fell under the line check's PAGE_SAME, its pages not drawn)
      if (!it.str) { if (it.hasEOL && prev) { if (hyphened) pending = pendingOf(hyphened, prev); prev.word = false } continue }
      const [a, b, c, d, x, y] = it.transform
      const along = Math.hypot(a, b), size = along || it.height || Math.abs(d)
      if (prev && Math.abs(x - prev.x) < 0.1 * size && Math.abs(y - prev.y) < 0.05 * size && it.str === prev.str) continue
      // (a word a hyphen cut at its line's end goes on in the line below, or at the next column's top, never in text set elsewhere
      // that the stream gives next: a figure's axis label in the next column, "Sim-" and "q" read as "simq" on 2610.21765v1 p7,
      // its page then another's to the line check; within PENDING_ITEMS items, those between read as they are)
      if (pending) {
        const z = Math.max(size, pending.size)
        const off = (y - pending.ey) * pending.ux - (x - pending.ex) * pending.uy, along = (x - pending.x) * pending.ux + (y - pending.y) * pending.uy
        const past = (x - pending.ex) * pending.ux + (y - pending.ey) * pending.uy
        // (below it by half a size to three across the line's direction, starting no further along it than its line's item did,
        // HANG sizes of slack: a line's start, a hanging label's width in at most; or above it, starting past its end by a
        // column's gutter at most, at its size: the next column's first line)
        const below = off < -0.5 * size && off > -3 * z && along <= HANG * z
        const column = off > 0.5 * size && past >= -size && past <= GUTTER * z && Math.abs(size - pending.size) <= SAME_SIZE * z
        if (below || column) { carry = pending.token; pending = null }
        else if (--pending.left <= 0) pending = null
      }
      const st = styles?.[it.fontName], asc = st?.ascent > 0 ? st.ascent : 0.75, desc = st?.descent < 0 ? st.descent : -0.22
      const perChar = it.str.length ? it.width / it.str.length : 0
      const toks = tokens(it.str)
      // the baseline's direction, a unit (ux, uy), and where the item ends along it (ex, ey); unskewed: its glyphs' up
      // square to it, so that two items' words may join
      const up = isUpright(a, b, d), across = up || readsAcross(a, b)
      const ux = up ? 1 : a / along, uy = up ? 0 : b / along, ex = up ? x + it.width : x + it.width * ux, ey = up ? y : y + it.width * uy
      const square = Math.abs(a * c + b * d) <= SKEW * (a * a + b * b)
      if (!carry && prev?.word && square && prev.square && Math.abs(ux * prev.uy - uy * prev.ux) <= SKEW && ux * prev.ux + uy * prev.uy > 0) {
        // the gap from the item before's end, along the baseline and across it (upright: x − its end, y − its y, exactly)
        const gap = (x - prev.ex) * prev.ux + (y - prev.ey) * prev.uy, off = (y - prev.ey) * prev.ux - (x - prev.ex) * prev.uy
        if (Math.abs(off) < 0.3 * Math.max(size, prev.size) && gap > -0.3 * size && gap < 0.12 * size && WORD_START.test(it.str) && !CJK.test(it.str[0])) carry = last
      }
      // a turned item's text as its tokens' places count it (tokens(): folded), for the marks set against a word (an item
      // read along x has them in its ink, inkEdges)
      const folded = across ? '' : it.str.normalize('NFKC').toLowerCase()
      for (const tk of toks) {
        // `item`: the text item the token was read from, for its ink (inkEdges); `sym`: where the items of marks alone
        // right after it end; `far`: where one set apart after it ends (NaN: more than one). Nothing more is worked out
        // here: the reader tokenizes a paper once, cold, and each test a token took here cost a heavy paper's first
        // tokenizing a third more (2608.02459, 38 → 52 ms)
        let w
        if (up) w = { t: tk.t, page, x: x + perChar * tk.at, y, w: perChar * tk.len, h: size, top: y + asc * size, bottom: y + desc * size, item: it, sym: null, far: null }
        else {
          // the run's ends on the baseline, and the box of its four corners at the ascent and the descent along the glyphs'
          // up, the transform's own (c, d): its size across, a mirror's side and a slant as they are drawn. The run takes the
          // marks its item sets against the word, as inkEdges widens an upright word's ink over them (the brackets that open
          // before it, the stops and brackets that close after it): the box is a turned token's ink, a token's ink is read
          // across alone
          let from = tk.at, to = tk.at + tk.len
          while (from > 0 && opens(folded.charCodeAt(from - 1))) from--
          if (to < folded.length && !stopsMarks(folded, to)) { to++; while (to < folded.length && !stopsMarks(folded, to)) to++ }
          const s0 = perChar * from, s1 = perChar * to
          const x0 = x + s0 * ux, y0 = y + s0 * uy, x1 = x + s1 * ux, y1 = y + s1 * uy
          const ax = asc * c, ay = asc * d, dx = desc * c, dy = desc * d
          const left = Math.min(x0 + ax, x0 + dx, x1 + ax, x1 + dx), right = Math.max(x0 + ax, x0 + dx, x1 + ax, x1 + dx)
          w = { t: tk.t, page, x: left, y: (y0 + y1) / 2, w: right - left, h: size, top: Math.max(y0 + ay, y0 + dy, y1 + ay, y1 + dy), bottom: Math.min(y0 + ay, y0 + dy, y1 + ay, y1 + dy), item: it, sym: null, far: null }
        }
        if (carry) { carry.t += w.t; w.t = ''; last = carry; carry = null } else last = w
        doc.push(w)
      }
      // an item of marks alone — a formula's closing bracket and full stop in a font of their own — on the last word's
      // baseline and right after it carries that word's ink to its end, and the next one on from there; a space or a
      // gap of over half an em ends the carry (a cell's word lit over three cells of a dash, 2608.02163). One set apart
      // is kept aside (`far`) for the layout, which takes it where it ends at the column's text edge (a proof's box set
      // flush right, highlight.mjs); a second one there is a row of cells, and neither is taken. Text whose baseline runs
      // rightwards alone (readsAcross): the ink is read along x
      if (toks.length) { inkOpen = true; inkEnd = x + it.width; lastAcross = across }
      else if (doc.length && across && lastAcross) {
        const t = doc[doc.length - 1]
        if (t.page === page && Math.abs(y - t.y) < 0.5 * t.h && x + it.width > t.x) {
          if (!/\S/.test(it.str)) inkOpen = false
          else if (inkOpen && x - inkEnd <= 0.5 * t.h) { t.sym = Math.max(t.sym ?? -Infinity, x + it.width); inkEnd = x + it.width }
          else { inkOpen = false; t.far = t.far === null ? x + it.width : Number.NaN }
        }
      }
      const tail = it.str.trimEnd()
      hyphened = /[-­]$/.test(tail) && toks.length && !CJK.test(tail.at(-2) ?? '') ? last : null
      carry = null
      // (one object a page, set again for every item: a heavy paper's every item made one more, of more fields, cost its
      // tokenizing a twentieth more)
      prev ??= { str: '', x: 0, y: 0, ex: 0, ey: 0, ux: 1, uy: 0, size: 0, square: true, word: false }
      prev.str = it.str; prev.x = x; prev.y = y; prev.ex = ex; prev.ey = ey; prev.ux = ux; prev.uy = uy; prev.size = size; prev.square = square
      prev.word = !it.hasEOL && toks.length > 0 && WORD_END.test(it.str) && !CJK.test(it.str.at(-1))
      if (it.hasEOL && hyphened) pending = pendingOf(hyphened, prev)
    }
  }
  return doc
}

/** how far from square a baseline and its glyphs' up may stand, or two baselines from parallel, and be read as such: a
 *  sine (a turned item's transform, rounded, is square to a few units in the last place) */
const SKEW = 1e-6
/** whether a transform sets its text upright — rightwards, its glyphs up (or has no direction): its tokens' boxes are made as
 *  they always were (tokenizeDocument) */
const isUpright = (a, b, d) => (b === 0 && a > 0 && d >= 0) || (a === 0 && b === 0)
/** whether a transform's baseline runs rightwards, to a sine of SKEW (a rotation's rounding, or a mirror's glyphs down): its
 *  ink, and an item of marks alone after it, are read along x (inkEdges, tokenizeDocument's carry), as layer2.mjs pageChars2
 *  reads such text, whatever its box. An upright transform is one */
const readsAcross = (a, b) => a > 0 && Math.abs(b) <= SKEW * a

/** a document's monospaced faces by name (getTextContent's fontName: one name a face, in every page's styles) */
const monospaced = new WeakMap()

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
  let item = null, s = '', perChar = 0, x0 = 0, cum = null, scale = 0, raw = null
  const mono = monospaced.get(doc)
  // where the item's text has passed `i` characters: their widths in a proportional face, scaled to the item's width
  const pos = i => x0 + cum[i] * scale
  // how much of a mark's width is not ink: half of a full-width one's (a CJK full stop inks its left half, an opening
  // bracket its right), told by the item's own character where folding kept the places, else by the word (B1's rule)
  const blank = (i, at, len) => (raw ? (wide(raw.charCodeAt(i)) ? 0.5 : 0) : halfOf(s, at, len))
  for (let k = 0; k < n; k++) {
    const w = doc[k], it = w.item
    let left = w.x, right = w.x + w.w
    if (it && it !== item) {
      // (an item set at an angle: its tokens' boxes, made along its baseline, are their ink; this reading is along x)
      const t = it.transform
      item = it; perChar = it.str.length && (isUpright(t[0], t[1], t[3]) || readsAcross(t[0], t[1])) ? it.width / it.str.length : 0
      if (perChar > 0) {
        s = it.str.normalize('NFKC').toLowerCase(); x0 = t[4]
        cum = shares(it.str, s.length, !!mono?.has(it.fontName)); scale = cum[s.length] ? it.width / cum[s.length] : 0
        raw = it.str.length === s.length ? it.str : null
      }
    }
    if (it && perChar > 0) {
      // the token's place in its item's text, as tokenizeDocument placed it: x = the item's x + perChar × its offset
      const at = Math.round((w.x - x0) / perChar), end = at + Math.round(w.w / perChar)
      left = pos(at); right = pos(end)
      // most words have a space or nothing on either side: only those that do not are scanned
      if (at > 0 && opens(s.charCodeAt(at - 1))) {
        let from = at - 1
        while (from > 0 && opens(s.charCodeAt(from - 1))) from--
        left = pos(from) + blank(from, at, end - at) * (pos(from + 1) - pos(from))
      }
      if (end < s.length && !stopsMarks(s, end)) {
        let to = end + 1
        while (to < s.length && !stopsMarks(s, to)) to++
        right = pos(to) - blank(to - 1, at, end - at) * (pos(to) - pos(to - 1))
      }
    }
    if (w.sym != null && w.sym > right) right = w.sym
    l[k] = left; r[k] = right
  }
  return { l, r }
}

/** a character's width in a proportional face, in thousandths of an em: Times-Roman's (its AFM) for printable ASCII, a
 *  full em for a CJK character, CJK punctuation and a full-width form, half an em for anything else */
const TIMES = [250, 333, 408, 500, 500, 833, 778, 180, 333, 333, 500, 564, 250, 333, 250, 278, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 278, 278, 564, 564, 564, 444, 921, 722, 667, 667, 722, 611, 556, 722, 722, 333, 389, 722, 611, 889, 722, 722, 556, 722, 667, 556, 611, 722, 722, 944, 722, 722, 611, 333, 278, 333, 469, 500, 333, 444, 500, 444, 500, 444, 333, 500, 500, 278, 278, 500, 278, 778, 500, 500, 500, 500, 333, 389, 278, 500, 500, 722, 500, 500, 444, 480, 200, 480, 541]
/** CJK punctuation and the full-width forms, set in a full em */
const wide = c => (c >= 0x3000 && c <= 0x303f) || (c >= 0xff00 && c <= 0xffef)
/** a UTF-16 code unit's width (a table of every code unit cost more to make than a heavy paper's text to read: 65 k
 *  characters on 2608.02459's translation) */
const widthOf = c => (c < 127 ? (c >= 32 ? TIMES[c - 32] : 500) : (c >= 0x3000 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xffef) ? 1000 : 500)
/**
 * The widths of an item's characters before each place, cumulated: what the text layer does not give — only the item's
 * width — estimated by a proportional face's widths (TIMES), where an even share put the boundary between two English
 * sentences inside the next one's first letter (on the canvas, 61 of 166 boundaries on four papers' first pages: "T|his",
 * "W|e"), and a Latin word set among CJK characters, a full em each, wide of its place. In an item mostly of CJK
 * characters the general punctuation's dashes, ellipsis and quotation marks (U+2010–206F) a full em too, as a CJK font
 * sets them (the review of B3: "——" half an em put the character after it up to 0.97 em off). Even for a monospaced
 * item, and where folding the text (NFKC) changed its length (the places are the folded text's)
 */
function shares(str, len, mono) {
  // one buffer for every item, each item's tokens being worked out before the next item's: no array an item
  if (shared.length <= len) shared = new Float64Array(Math.max(len + 1, shared.length * 2))
  const cum = shared
  if (mono || str.length !== len) { for (let i = 1; i <= len; i++) cum[i] = i; return cum }
  let cjk = 0, punct = false
  for (let i = 0, acc = 0; i < len; i++) {
    const c = str.charCodeAt(i), w = widthOf(c)
    if (w === 1000) cjk++
    else if (c >= 0x2010 && c <= 0x206f) punct = true
    acc += w; cum[i + 1] = acc
  }
  // the item's general punctuation again, a full em, where most of it is CJK: rare, and only then a second pass
  if (punct && 2 * cjk > len) for (let i = 0, acc = 0; i < len; i++) { const c = str.charCodeAt(i); acc += c >= 0x2010 && c <= 0x206f ? 1000 : widthOf(c); cum[i + 1] = acc }
  return cum
}
let shared = new Float64Array(256)


// ---------------------------------------------------------------- marks
/** a token whose baseline is within this share of its height of a mark's stands on the mark's own baseline */
const ON_BASE = 0.1
/** the token a mark stands at, on the mark's baseline: for a start mark the word whose box is nearest it of those it does not
 *  stand past (a start mark is set before its unit's first glyph: a word whose box holds the mark is its word), else of those it
 *  does; for an end mark, its mirror, the last word that begins before it (a point of slack: boxes are approximate, see
 *  tokenizeDocument; a last word's shared box may overrun the mark by a word's length, 2610.10069's "given by|" 9.8 pt), of
 *  the words within 0.4 of their height of the mark's
 *  baseline — those on its own baseline (ON_BASE) first: a figure's label set large 4.7 pt above a heading's baseline begins
 *  after the heading's last word and is no word of its line (1706's "Attention Visualizations" and the "Layer5" beside it).
 *  A start mark past a word's box and short of the next one's is the next word's: the boxes of one text item are its width
 *  shared by its characters, so that the gap after a caption's label ("Figure 1:", its \hskip) may fall either side of the
 *  mark, and the nearest box was the label's on a document read as one item and the caption's first word's on the same page
 *  read in items cut at the mark (our base page wrapped by optional content: 24 units of 11 papers, a start mark after a
 *  caption's label or a paragraph's run-in number, left the original's). No slack past a word's end: a label's digit is one
 *  narrow character, and half of one took 2610.22214's "9" (its box 1.4 pt short of the mark) for its caption's first word */
export function tokenAtMark(doc, byPage, mk, start) {
  let best = null, on = null
  const better = (cur, k, d, past) => !cur || (start ? (past !== cur.past ? !past : d < cur.d) : doc[k].x > doc[cur.k].x)
  for (const k of byPage.get(mk.page) ?? []) {
    const t = doc[k], dy = Math.abs(t.y - mk.y)
    if (dy > t.h * 0.4) continue
    let d = 0, past = false
    if (start) { past = mk.x > t.x + t.w; d = mk.x < t.x ? t.x - mk.x : past ? mk.x - t.x - t.w : 0; if (d >= 8) continue } else if (!(t.x < mk.x + 1)) continue
    if (better(best, k, d, past)) best = { k, d, past }
    if (dy <= ON_BASE * t.h && better(on, k, d, past)) on = { k, d, past }
  }
  return (on ?? best)?.k ?? null
}

/** whether a token (tokenizeDocument's) is upright: its `y` its baseline, nearer its box's bottom than its top, the font's
 *  descent below it and its ascent above; a turned token's `y` is the middle of its run, its box as high above it as below (a
 *  token may keep no item: layout/arxiv.mjs lets it go) */
export const uprightToken = t => typeof t?.top === 'number' && typeof t.bottom === 'number' && t.top - t.y > 1.5 * (t.y - t.bottom)
/** each mark with the word it follows in `doc`, the document the marks were recorded in: { page, x, y, t } */
export function markWords(doc, marks) {
  const byPage = pageIndex(doc), out = new Map()
  for (const [name, mk] of marks) { const k = tokenAtMark(doc, byPage, mk, name.endsWith('s')); out.set(name, { ...mk, t: k == null ? null : doc[k].t }) }
  return out
}
export const pageIndex = d => { const m = new Map(); d.forEach((t, k) => (m.get(t.page) ?? m.set(t.page, []).get(t.page)).push(k)); return m }
/** a carried word as `tokens` cuts it now: a copy on this machine keeps the words its marks were carried with, and one
 *  kept when a Latin run still took the CJK characters after it in is the start mark's first part or the end mark's
 *  last */
const cut = (t, start) => (t && t.length > 1 && CJK.test(t) ? ((start ? tokens(t)[0] : tokens(t).at(-1))?.t ?? t) : t)

/** whether a carried word is token k's (as it was, or as the tokenizer cuts it now), or that of the word beside k on its line the
 *  mark faces, before a start mark and after an end mark: the marked original's word boxes are approximate (one text item a
 *  line, its width shared by its characters) where the page the marks are carried to may have them exact (our base page,
 *  wrapped, read in items cut at its groups), so the marked original's word at a mark may be the one beside the mark (a start
 *  mark's nearer a caption's label; an end mark's the next word, its shared box begun before the mark: 2610.20716's "model|
 *  the", 2610.20581's "Theorem| 2.2", 2610.22195's cells) — never further */
function wordAt(doc, k, t, start) {
  const same = j => t === doc[j].t || cut(t, start) === doc[j].t
  if (same(k)) return true
  const step = start ? -1 : 1
  let j = k + step
  while (j >= 0 && j < doc.length && doc[j].t === '') j += step
  return j >= 0 && j < doc.length && doc[j].page === doc[k].page && Math.abs(doc[j].y - doc[k].y) <= 0.4 * doc[k].h && same(j)
}

/**
 * Marks → Map id → [first token, last token]. `marks` is Map `${id}s` / `${id}e` → { page, x, y, t? }. A mark that
 * carries the word it followed where it was recorded (`t`, from markWords) is kept only where `doc` has the same word
 * there: the marks of our own compile of the original then serve arXiv's PDF wherever the two are laid out alike,
 * and nowhere else. `byPage`: the tokens of each page (made here where not given: a caller that bounds a unit at a time makes
 * it once). `reach` (the layout maker's): a start mark that stands at no word, here and in the marks' own compile (its carried
 * word null: a unit that opens with a formula, a dash or a comma), is bounded by the word `reach(mark)` gives, or none (an end
 * mark has a word wherever one stands before it on its line); a reader's anchors keep tokenAtMark's word alone
 */
export function boundsFromMarks(doc, marks, byPage = pageIndex(doc), reach = null) {
  const out = new Map()
  for (const [name, s] of marks) {
    if (!name.endsWith('s')) continue
    const id = name.slice(0, -1), e = marks.get(`${id}e`)
    if (!e) continue
    let a = tokenAtMark(doc, byPage, s, true)
    const b = tokenAtMark(doc, byPage, e, false), reached = a == null && reach !== null && s.t === null
    if (reached) a = reach(s)
    if (a == null || b == null || b < a) continue
    // a carried word as it was, or as the tokenizer cuts it now (cut): the tokenizer still joins a word a hyphen cuts
    // at a line's end with the CJK character after it, as the carried word has it (the review of A1, M2); a reached start
    // has none to compare
    if ((!reached && s.t !== undefined && !wordAt(doc, a, s.t, true)) || (e.t !== undefined && !wordAt(doc, b, e.t, false))) continue
    out.set(id, [a, b])
  }
  return out
}

// ---------------------------------------------------------------- text matching
/** the document's 3-grams → the token indices of each occurrence; over the tokens with text, since the second part of a
 *  word joined across two items keeps a box and no text (tokenizeDocument), and would break every 3-gram through it.
 *  Over doc[from..to] alone: every 3-gram of tokens inside it, in the same order, so that a search inside it (locate's
 *  hits are only those inside [lo, hi]) finds what the whole document's index finds */
/** the document's 3-grams (buildIndex's), for a caller that keeps them: rule 5's searches of the document a range at a time */
export const buildIndexOf = doc => buildIndex(doc)
function buildIndex(doc, from = 0, to = doc.length - 1) {
  const index = new Map()
  const live = []
  for (let k = Math.max(0, from); k <= Math.min(doc.length - 1, to); k++) if (doc[k].t) live.push(k)
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
 * foot, never a unit. The frame's rule today (placeUnits' `frame`): it reads every located unit of the document, so a
 * place of the units of some pages is exact only under the whole document's frame
 */
export function pageFrame(doc, ms) {
  const located = new Uint8Array(doc.length)
  for (const m of ms) if (m) for (const k of m) located[k] = 1
  return frameOf(doc, located)
}

/**
 * The pages' frame from the document's tokens alone (the page stream's rule 1, made at step T while the marked original
 * compiles, before any unit is located): pageFrame's arithmetic, its percentiles and its head and foot votes, over the
 * document's body words (bodyWords) in place of the located units' words. A function of `doc` alone — of every page's
 * tokens, so final once arXiv's text is read, and the same whatever the units, the marks or the anchors; a frame of some
 * pages' tokens is not that of the whole. The verdict a token has, `(t) => boolean`, as pageFrame's; as placeUnits'
 * `frame` it is `() => frameOfTokens(doc)` made once
 */
export function frameOfTokens(doc) {
  return frameOf(doc, bodyWords(doc))
}

/** a letter, no digit: what a body word has (bodyWords) */
const A_LETTER = /\p{L}/u
/** a word set more than this many times the document's body size is no body word: arXiv's stamp at 20 pt beside a 10 pt body,
 *  a title */
const BODY_MAX = 1.5

/** the largest a body word is set: BODY_MAX times the document's body size, the height most of its tokens with text have, to
 *  a tenth (the smaller of two as common) */
export function bodyMax(doc) {
  const sizes = new Map()
  for (const t of doc) if (t.t) { const s = Math.round(t.h * 10); sizes.set(s, (sizes.get(s) ?? 0) + 1) }
  let size = 0, most = 0
  for (const [s, c] of sizes) if (c > most || (c === most && s < size)) { size = s; most = c }
  return (BODY_MAX * size) / 10
}

/**
 * The document's body words, a flag a token: what stands where the units' words stand, told from the text alone. A token
 * with a letter (a page's number, a line's, a row of digits are none), set at most BODY_MAX times the body size (bodyMax),
 * on a line that does not recur: a line (a run of the stream on one
 * baseline, as placeUnits cuts them) whose words, digits dropped, stand at the same baseline (rounded) on another page is a
 * running head or foot, which a unit never is
 */
function bodyWords(doc) {
  const n = doc.length, body = new Uint8Array(n)
  if (!n) return body
  const big = bodyMax(doc)
  // each line's words with a letter, digits dropped, its first such word's baseline and its page
  const line = linesOf(doc), words = new Map()
  for (let k = 0; k < n; k++) {
    const t = doc[k].t
    if (!t || !A_LETTER.test(t)) continue
    const w = t.replace(/\p{N}+/gu, ''), e = words.get(line[k])
    if (e) e.key += ` ${w}`
    else words.set(line[k], { key: `${Math.round(doc[k].y)} ${w}`, page: doc[k].page })
  }
  const pagesOf = new Map()
  for (const { key, page } of words.values()) (pagesOf.get(key) ?? pagesOf.set(key, new Set()).get(key)).add(page)
  for (let k = 0; k < n; k++) {
    const t = doc[k]
    if (!t.t || !A_LETTER.test(t.t) || t.h > big) continue
    if (pagesOf.get(words.get(line[k]).key).size >= 2) continue
    body[k] = 1
  }
  return body
}

/** each token's line: a run of the stream on one baseline — a new page, a baseline more than half a line away, or a word
 *  far back left of the one before begins another (placeUnits' lines) */
function linesOf(doc) {
  const line = new Int32Array(doc.length)
  for (let k = 1, n = 0; k < doc.length; k++) {
    const a = doc[k - 1], b = doc[k]
    if (b.page !== a.page || Math.abs(b.y - a.y) > Math.min(a.h, b.h) * 0.5 || b.x + b.w < a.x - a.h * 30) n++
    line[k] = n
  }
  return line
}

/** the frame's arithmetic over the words flagged in `located` (pageFrame's: the located units'; frameOfTokens': the body words) */
function frameOf(doc, located) {
  // arrays by page number, the document's tokens being in page order
  const pages = doc.length ? doc[doc.length - 1].page + 1 : 1
  const x0 = new Float64Array(pages).fill(Infinity), x1 = new Float64Array(pages).fill(-Infinity), y0 = new Float64Array(pages).fill(Infinity), y1 = new Float64Array(pages).fill(-Infinity)
  for (let k = 0; k < doc.length; k++) {
    if (!located[k]) continue
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
    let found = 0, all = 0, real = 0
    for (const j of ks) {
      const t = doc[j].t
      if (!t || (!CJK.test(t) && !/\p{L}{2}/u.test(t.replace(/\p{Script=Greek}/gu, ' ')))) continue
      // (a token of two letters the unit's next words do not hold is a formula's — dt, ln, a script — and no word: it does
      // not vote; a line of no word, a formula's or its scripts' row, is the unit's only between lines that are: HELD)
      let hit = false
      for (let q = p, n = 0; n < AHEAD && q >= 0 && q < words.length; q += dir, n++) {
        const w = words[q]
        if (w === t || (!CJK.test(t) && (dir > 0 ? w.startsWith(t) : w.endsWith(t)))) { found++; p = q + dir; hit = true; break }
      }
      const word = CJK.test(t) || /\p{L}{3}/u.test(t.replace(/\p{Script=Greek}/gu, ' '))
      if (hit || word) all++
      if (word) real++
    }
    // (a line with no word of three letters or more, nor a CJK one, is held whatever its two-letter tokens hit — `in` as the
    // start of `information`, a table's `No`, `et al`: held lines are released only by a line with a word that votes)
    return edge || (real === 0 ? HELD : found / all >= OWN)
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
function walker(doc, ms, owner, line, inFrame, lineOwner, owned, wrote) {
  // which unit each line holds words of: -1 none, -2 several (of the owned tokens, `owned`: disjoint [a, b] rising; `wrote`
  // keeps each token and line written, which the caller sets back)
  const own = (k, u) => { const l = line[k]; if (lineOwner[l] === -1) wrote.lines.push(l); lineOwner[l] = lineOwner[l] === -1 || lineOwner[l] === u ? u : -2 }
  for (const [a, b] of owned) {
    for (let k = a; k <= b; k++) {
      const u = owner[k]
      if (u === -1) continue
      const l = line[k], o = lineOwner[l]
      if (o === -1) wrote.lines.push(l)
      if (o !== u) lineOwner[l] = o === -1 ? u : -2
    }
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
    claim(u, k0, dir, first, fits) { const ks = take(u, k0, dir, first, fits); for (const k of ks) { owner[k] = u; wrote.tokens.push(k); own(k, u) } return ks },
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
 * `floatMatch`: floatMatches' of this `doc` and these units, taken in place of a float's search of the whole document.
 * `forward` (rule 5: a Set of the indices of the units written inside a float, the source parse's `inFloat`): a float's search
 * of the whole document begins at the page of its last body neighbour (pageStarts), `floatMatch` unread.
 * `frame(doc, ms)`: the pages' frame's rule (pageFrame, today's). The matching (matchUnits) and the placing (placeUnits),
 * one after the other
 */
export function anchorUnits(doc, units, { minCoverage = 0.6, bounds, floating = () => false, floatMatch = null, frame = pageFrame, forward = null } = {}) {
  return placeUnits(doc, units, matchUnits(doc, units, { minCoverage, bounds, floating, floatMatch, forward }), { frame })
}

/** the units' order TeX sets them in (openPaper's `texOrder`: their indices, each once), or null where it is their own; one that
 *  is not an order of the `n` units is refused, never read. The anchoring reads its units' order as the text's (anchorUnits'
 *  `units` "in document order", left-part.mjs rangedAnchors'): a caller gives them in this one, not in their numbers' */
export function orderOf(texOrder, n) {
  if (texOrder == null) return null
  if (!Array.isArray(texOrder) || texOrder.length !== n) throw new TypeError(`source.texOrder: not an order of the ${n} units`)
  const seen = new Uint8Array(n)
  for (const i of texOrder) { if (!Number.isInteger(i) || i < 0 || i >= n || seen[i]) throw new TypeError(`source.texOrder: not an order of the ${n} units`); seen[i] = 1 }
  return texOrder.every((i, k) => i === k) ? null : texOrder
}
/** the units of `ids` (their indices) as places in that order (null: their own) */
export const placesIn = (ids, order) => { if (!order) return new Set(ids); const at = new Map(order.map((i, k) => [i, k])); return new Set(ids.map(i => at.get(i))) }
/** a unit without marks — a heading, whose words are also in the running head of every page of its section — is searched
 *  between its marked neighbours in the text only, with room for a float or a footnote that the stream passes through:
 *  MARGIN tokens either side */
const MARGIN = 100
/** each unit's nearest marked neighbours in the text (no float: its marks are where TeX set it), by the units' order: the
 *  last token of the one before (-1 for none), the first token of the one after (doc.length for none); with `inFloat` (the
 *  indices of the units written inside a float), also `body`: the last token of the one before that is no unit written inside
 *  a float (rule 5's neighbour: a paragraph in a figure is set where its figure is) */
function neighbours(doc, units, hard, floating, inFloat = null) {
  const before = [], after = [], body = inFloat ? [] : null
  const inText = u => hard[u] && !floating(units[u].id)
  for (let u = 0, e = -1, b = -1; u < units.length; u++) {
    before[u] = e
    if (body) body[u] = b
    if (inText(u)) { e = hard[u][1]; if (body && !inFloat.has(u)) b = hard[u][1] }
  }
  for (let u = units.length - 1, a = doc.length; u >= 0; u--) { after[u] = a; if (inText(u)) a = hard[u][0] }
  return { before, after, body }
}
/**
 * Each page's first token (the tokens are in page order): `pageStarts(doc)(k)` the first token of token k's page, 0 for k -1.
 * Rule 5's start of a float's search of the whole document (the page stream's bound on where it may stand: E2b design §1.3) is
 * that of its last body neighbour's end (`body`, neighbours'): a float's source comes after that neighbour's, so TeX sets it on
 * that page or a later one (here, at the top, at the bottom, on a page of floats; a figure* the next page at the earliest; a
 * footnote at its call's page's foot or the next)
 */
export function pageStarts(doc) {
  const first = new Map()
  doc.forEach((t, k) => { if (!first.has(t.page)) first.set(t.page, k) })
  return k => (k < 0 ? 0 : first.get(doc[k].page))
}
/** where unit u's text is searched: its own bounds; with marks elsewhere, between its marked neighbours, MARGIN past them;
 *  with no marks at all, the whole document */
function windowOf(doc, u, hard, bounds, before, after) {
  return hard[u] ?? (bounds?.size ? [Math.max(0, before[u] + 1 - MARGIN), Math.min(doc.length - 1, after[u] - 1 + MARGIN)] : [0, doc.length - 1])
}

/**
 * Every floating unit's match over the whole document, as anchorUnits makes it where its search between its neighbours
 * found nothing: Map id → its tokens, or null (a float of fewer than K words has none). From the document and the units'
 * words alone, so made before any mark is known (the prepare's step T, beside the compile); its index built here and let go
 */
export function floatMatches(doc, units, floating = () => false) {
  const out = new Map()
  let index = null
  for (const { id, text, gaps } of units) {
    if (!floating(id)) continue
    const { ws } = unitWords(text, gaps)
    if (ws.length < K) continue
    index ??= buildIndex(doc)
    out.set(id, locate(doc, index, ws, 0, doc.length - 1, false)?.tokens ?? null)
  }
  return out
}

/**
 * Rule 5's reach of a float searched from a page on (the page stream's: where its forward search may stand, before its start
 * is known): `forwardSpans(doc, units, floating, index)` → `(id, from)` → the tokens its search of the document from token
 * `from` on may take, [first, last] (the pages of the densest stretch locate takes there: its matched tokens lie in them), and
 * the stretch's first hit (`first`: the search from any token up to it takes the same stretch), or null where it finds none
 * (fewer than K words, or no 3-gram of them there). `index` the whole document's 3-grams (buildIndex's), made by the caller once
 */
export function forwardSpans(doc, units, floating = () => false, index = buildIndex(doc)) {
  const N = doc.length, byId = new Map(units.map(u => [u.id, u])), memo = new Map()
  const first = new Map(), last = new Map()
  doc.forEach((t, k) => { if (!first.has(t.page)) first.set(t.page, k); last.set(t.page, k) })
  /** a float's hits (locate's), by their first token, with each stretch's count and the first best from each on */
  const of = id => {
    if (memo.has(id)) return memo.get(id)
    const u = byId.get(id), ws = u && floating(id) ? unitWords(u.text, u.gaps).ws : []
    let out = null
    if (ws.length >= K) {
      const hits = []
      for (let i = 0; i + K <= ws.length; i++) { const list = index.get(ws[i] + '\u0001' + ws[i + 1] + '\u0001' + ws[i + 2]); if (list) for (const js of list) hits.push(js) }
      hits.sort((a, b) => a[0] - b[0])
      const span = ws.length * 3 + 80, n = hits.length, ends = new Int32Array(n), best = new Int32Array(n + 1).fill(-1)
      for (let l = 0, h = 0; l < n; l++) { while (h < n && hits[h][0] - hits[l][0] <= span) h++; ends[l] = h }
      // (the first stretch of the most hits from each on, as locate's scan meets it: a later one only where it has more)
      for (let l = n - 1; l >= 0; l--) { const b = best[l + 1]; best[l] = b < 0 || ends[l] - l >= ends[b] - b ? l : b }
      out = { hits, ends, best }
    }
    memo.set(id, out)
    return out
  }
  return (id, from) => {
    const f = of(id)
    if (!f) return null
    let lo = 0, hi = f.hits.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (f.hits[mid][0] < from) lo = mid + 1; else hi = mid }
    const l = lo < f.hits.length ? f.best[lo] : -1
    if (l < 0) return null
    let top = -1
    for (let j = l; j < f.ends[l]; j++) top = Math.max(top, f.hits[j][K - 1])
    const a = f.hits[l][0]
    return { lo: first.get(doc[a].page), hi: Math.min(N - 1, last.get(doc[top].page)), first: a }
  }
}

/**
 * Each unit's match (anchorUnits' first half): an array by the units' order, each { m, coverage, bounded, ws?, pairs?,
 * textPairs? } or null. `only`: a Set of indices into `units`, the units matched (the others null), their neighbours still
 * read from every unit's bounds: a unit's match is a function of its own bounds, its neighbours', its text and the document's
 * tokens in its window. The 3-gram index is made over the windows searched alone and let go (a window's hits are those
 * inside it: locate). `forward`: anchorUnits' (rule 5); `wholeIndex` (a holder, { index }): the whole document's index
 * its forward searches read, made there once and kept (the page stream's, a range at a time), in place of one made a call.
 * `known` { hard, before, after, body }: each unit's bounds (`bounds`' of its id, or null) and its neighbours (neighbours'),
 * a caller's that keeps them (the page stream), true at least of the units `only` holds: a call is then of those units alone
 */
export function matchUnits(doc, units, { minCoverage = 0.6, bounds, floating = () => false, floatMatch = null, only = null, forward = null, wholeIndex = null, known = null } = {}) {
  const hard = known ? known.hard : units.map(u => bounds?.get(String(u.id)) ?? null)
  const { before, after, body } = known ?? neighbours(doc, units, hard, floating, forward)
  // (rule 5: a float's search of the whole document from the page of its last body neighbour on)
  const start = forward ? pageStarts(doc) : null
  const fromOf = u => start(body[u])
  // the units matched (`only`'s, rising; else every one), their words, and the span of the document their searches by
  // 3-grams read
  const list = only ? [...only].sort((a, b) => a - b) : units.map((_, u) => u)
  const words = new Array(units.length).fill(null)
  for (const u of list) words[u] = unitWords(units[u].text, hard[u] ? null : units[u].gaps)
  let from = Infinity, to = -Infinity
  for (const u of list) {
    const { id } = units[u], w = words[u]
    if (!w || w.ws.length < K) continue
    const [lo, hi] = windowOf(doc, u, hard, bounds, before, after)
    // (a float's search of the whole document, where no match of it is given; under rule 5 from its start, on an index of the
    // whole document's given where it is)
    const all = !hard[u] && bounds?.size && floating(id) && (forward ? !wholeIndex : !floatMatch?.has(id))
    from = Math.min(from, all ? (forward ? fromOf(u) : 0) : lo); to = Math.max(to, all ? doc.length - 1 : hi)
  }
  const index = from <= to ? buildIndex(doc, from, to) : new Map()
  const found = new Array(units.length).fill(null)
  for (const u of list) {
    const { id } = units[u]
    if (!words[u]) continue
    const b = hard[u]
    // where its placeholders stood matters to a unit found as a run of words, which a unit with marks never is
    const { ws, gap } = words[u]
    const [lo, hi] = windowOf(doc, u, hard, bounds, before, after)
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
    if (!m && !b && ws.length >= K && bounds?.size && floating(id)) {
      // (rule 5: from the page of its last body neighbour on, never step T's match of the whole document, which may stand before)
      if (forward) m = locate(doc, wholeIndex ? (wholeIndex.index ??= buildIndex(doc)) : index, ws, fromOf(u), doc.length - 1, false)?.tokens ?? null
      else m = (floatMatch?.has(id) ? floatMatch.get(id) : locate(doc, index, ws, 0, doc.length - 1, false)?.tokens) ?? null
    }
    // a run takes a placeholder's words besides the unit's own, which are all there
    const coverage = m ? Math.min(1, m.length / ws.length) : 0
    if (!b && (!m || coverage < minCoverage)) continue
    // a unit with marks keeps its words and which of them were matched where, for a break (wordsBetween); one found by
    // its text alone keeps the match's map too, for its sentences' starts before any marks come (sentenceStarts, B3c)
    found[u] = b ? { m: m ?? [], coverage, bounded: b, ws, pairs } : { m: m ?? [], coverage, bounded: b, textPairs: pairs }
  }
  return found
}

/** placeUnits' lines of the document (runs of the stream on one baseline) and each line's tokens, made once a document: a
 *  function of the tokens alone, which the page stream places a range at a time */
const linesMade = new WeakMap()
function placeLines(doc) {
  let made = linesMade.get(doc)
  if (made) return made
  const line = new Int32Array(doc.length)
  for (let k = 1, n = 0; k < doc.length; k++) {
    const a = doc[k - 1], b = doc[k]
    if (b.page !== a.page || Math.abs(b.y - a.y) > Math.min(a.h, b.h) * 0.5 || b.x + b.w < a.x - a.h * 30) n++
    line[k] = n
  }
  const counts = new Int32Array(doc.length ? line[doc.length - 1] + 1 : 0)
  for (let k = 0; k < doc.length; k++) counts[line[k]]++
  made = { line, lineSize: { get: l => counts[l] }, lines: counts.length }
  linesMade.set(doc, made)
  return made
}
/**
 * A marked unit's range as it owns tokens (placeWith): on one page, its marks' [first, last]; over a page break, on each page it
 * reaches, from its first own line there to its last, its marks' tokens on their own pages — never the page's text past its lines.
 * Its own lines are those its matched words are most of, or next to one that they are most of (placeWith's `keep`, the words it
 * keeps), and its marks' lines. A footnote over a page break is set at the foot of both pages, and the stream between its two
 * parts is the next page's column: 1810.04805v2's footnote 1, over pages 3 and 4, owned page 4's left column, and the three
 * headings there that no mark bounds, matched inside it, were the footnote's words and placed nowhere. The same for every unit
 * that runs over a break (a paragraph owns no more of its next page's head than its own first line on): `f` matchUnits' match
 * of the unit ({ bounded, m }), `line` and `lineSize` placeLines'. { ranges, own }: `own(k)` whether token k stands on one of the
 * unit's own lines (null for a unit on one page)
 */
function rangeOnPages(doc, f, line, lineSize) {
  const [a, b] = f.bounded
  if (doc[a].page === doc[b].page) return { ranges: [[a, b]], own: null }
  const per = new Map()
  for (const k of f.m) if (k >= a && k <= b) per.set(line[k], (per.get(line[k]) ?? 0) + 1)
  const most = l => per.get(l) >= Math.min(3, lineSize.get(l)) * 0.5 && per.get(l) / lineSize.get(l) >= 0.4
  const own = l => l === line[a] || l === line[b] || (per.has(l) && (most(l) || (per.has(l - 1) && most(l - 1)) || (per.has(l + 1) && most(l + 1))))
  const out = []
  let lo = -1, hi = -1
  for (let k = a; k <= b; k++) {
    if (lo >= 0 && doc[k].page !== doc[lo].page) { out.push([lo, hi]); lo = -1 }
    if (own(line[k])) { if (lo < 0) lo = k; hi = k }
  }
  if (lo >= 0) out.push([lo, hi])
  return { ranges: out, own: k => own(line[k]) }
}

/**
 * Every marked unit's ranges (rangeOnPages'), as [[first, last], unit], none of those over a page break begun or ended inside
 * another's range it would cross: a range its own lines shrank stops short of a range whose start it would hold and not its end,
 * or begins after one whose end it would hold and not its start. A unit's lines are its matched words' lines, and a caption set
 * above a paragraph's next lines may repeat its words densely enough to count as one of them: 2307.16209v1's paragraph 408, over
 * pages 114 and 115, began its page-115 range at the second line of caption 396 above it and took that line, where its whole
 * range held the caption's inside it. Shrunk so, it holds what its whole range held there, the caption the caption's
 */
function rangesOf(doc, found, line, lineSize) {
  const per = found.map(f => (f?.bounded ? rangeOnPages(doc, f, line, lineSize) : null))
  const all = per.flatMap((o, u) => (o ? o.ranges.map(r => [r, u]) : []))
  const out = []
  per.forEach((o, u) => {
    if (!o) return
    if (!o.own) { out.push([o.ranges[0], u]); return }
    for (let [lo, hi] of o.ranges) {
      // (a range of another unit's that this one would cross, its first token inside it and its last past it, or the reverse:
      // the nearest end of it moved past it, onto this one's own line beyond, until none crosses; none left, none)
      for (let moved = true; moved && lo <= hi;) {
        moved = false
        for (const [[c, d], v] of all) {
          if (v === u || c > hi || d < lo) continue
          if (c < lo && lo <= d && hi > d) { lo = d + 1; moved = true }
          else if (c <= hi && hi < d && lo < c) { hi = c - 1; moved = true }
          if (moved) { while (lo <= hi && !o.own(lo)) lo++; while (hi >= lo && !o.own(hi)) hi--; break }
        }
      }
      if (lo <= hi) out.push([[lo, hi], u])
    }
  })
  return out
}
/** placeUnits' owners of a document's tokens and of its lines (-1: none), kept a document and -1 throughout between calls
 *  (each call sets back what it wrote): a call reads and writes the tokens its units own, not the whole document's */
const ownersMade = new WeakMap()
function ownersOf(doc, lines) {
  let o = ownersMade.get(doc)
  if (!o) ownersMade.set(doc, o = { token: new Int32Array(doc.length).fill(-1), line: new Int32Array(Math.max(1, lines)).fill(-1) })
  return o
}
/**
 * The units' places from their matches (anchorUnits' second half): Map id → Anchor | null. `found` is matchUnits' for
 * these units, by their order; `units` may be any of the paper's units in their order, with their matches: a unit's place
 * reads the matches of the units whose tokens share its pages, and of those that share theirs (their walks), and the
 * frame (`frame(doc, ms)`, its rule: pageFrame, which reads every located unit). `only`: a Set of indices into `units`, the
 * units whose places the map holds (the page stream's range: the others are read, not placed); null, every unit's
 */
export function placeUnits(doc, units, found, { frame = pageFrame, only = null } = {}) {
  const { line, lineSize, lines } = placeLines(doc)
  const { token: owner, line: lineOwner } = ownersOf(doc, lines)
  const wrote = { tokens: [], lines: [] }, ranges = []
  try {
    return placeWith(doc, units, found, frame, only, line, lineSize, owner, lineOwner, wrote, ranges)
  } finally {
    for (const [a, b] of ranges) owner.fill(-1, a, b + 1)
    for (const k of wrote.tokens) owner[k] = -1
    for (const l of wrote.lines) lineOwner[l] = -1
  }
}
/** placeUnits' work (`only`: a Set of indices into `units`, the units whose places are made; every unit's words are owned
 *  and its displays taken all the same), its owners' arrays given, -1 throughout, and what it writes kept for the caller to set
 *  back: the ranges filled (`ranges`), the tokens and lines written one at a time (`wrote`) */
function placeWith(doc, units, found, frame, only, line, lineSize, owner, lineOwner, wrote, ranges) {
  // who owns each token: a marked unit its range, the innermost range winning (a footnote inside a paragraph is the
  // footnote's); an unmarked unit its matched words. A range on each page it reaches holds the unit's own lines there and
  // what stands between them, never the page's text past them (rangeOnPages)
  const ranged = rangesOf(doc, found, line, lineSize).sort((x, y) => (y[0][1] - y[0][0]) - (x[0][1] - x[0][0]))
  for (const [[a, b], u] of ranged) { owner.fill(u, a, b + 1); ranges.push([a, b]) }
  // two ranges that cross (neither apart nor one inside the other): a paragraph and a footnote both going on over a page,
  // the stream's order u's lines, v's first lines (the page's foot), u's next lines (the next page's head), v's last lines.
  // The overlap [v's start, u's end] holds lines of both: a line that holds the matched words of one of them alone is that
  // one's; a line that holds both's, or neither's, stays as the innermost range had it
  const crossed = ranged.map(([[a, b], u]) => [a, b, u]).sort((x, y) => x[0] - y[0] || y[1] - x[1])
  for (let p = 0; p < crossed.length; p++) {
    const [a, b, u] = crossed[p]
    for (let q = p + 1; q < crossed.length && crossed[q][0] <= b; q++) {
      const [c, d, v] = crossed[q]
      if (d <= b || c <= a) continue
      const mu = new Set(found[u].m), mv = new Set(found[v].m)
      for (let k = c; k <= b;) {
        const l = line[k]
        let e = k, nu = 0, nv = 0
        for (; e <= b && line[e] === l; e++) { if (mu.has(e)) nu++; if (mv.has(e)) nv++ }
        // (the line of v's first word is v's and that of u's last is u's, as their marks bound them; any other goes only from
        // a unit with no matched word on it: a footnote of few words its matcher found, a URL's, keeps its first line,
        // though the paragraph's matcher found the words it goes on with there)
        const w = l === line[c] ? v : l === line[b] ? u : nu > nv && nv === 0 ? u : nv > nu && nu === 0 ? v : -1
        if (w !== -1) for (let j = k; j < e; j++) if (owner[j] === u || owner[j] === v) owner[j] = w
        k = e
      }
    }
  }
  found.forEach((f, u) => { if (f && !f.bounded) for (const k of f.m) if (owner[k] === -1) { owner[k] = u; wrote.tokens.push(k) } })
  // (the tokens owned, as disjoint intervals rising: the line owners are made of them alone)
  const owned = []
  for (const [a, b] of [...ranges, ...wrote.tokens.map(k => [k, k])].sort((x, y) => x[0] - y[0])) {
    const last = owned.at(-1)
    if (last && a <= last[1] + 1) { if (b > last[1]) last[1] = b } else owned.push([a, b])
  }
  // a unit's words on a line where they are few count only next to a line where they are most: its first line after a
  // theorem's label or its last line of formula stay, three words it shares with a table row it passes by go (lines
  // are runs of the stream on one baseline, so two columns never share one)
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
  // leading ones first, so that a unit's trailing walk stops at the display the next unit opens with. Neither walk is
  // bounded by a float's skip (FLOAT_SKIP): on the 113 papers of the ground truth (recompiled 2026-10-01), the first
  // line a lead walk takes stands up to 19.6 pt above the unit's first line at a 10 pt body — 5 of 62 over 16 pt, each
  // a row of the display before it. So a table at a page's head, headed by single letters over rows of digits (which
  // no letters refuse), is still taken where the display closed the page before (the re-review of A1, n1: open)
  const walk = walker(doc, ms, owner, line, frame(doc, ms), lineOwner, owned, wrote)
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
    if (only && !only.has(u)) return
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
        const words = wordsBetween(f, m[n], m[n + 1])
        // with a display: its lines (its letters) or the unit's own words left there — not any word of the paragraph's,
        // which a table's row at the break may share (the re-review of A1, m2)
        const fits = dir => (typeof inner === 'string' ? either(byLetters(doc, inner), inOrder(doc, words, dir)) : inOrder(doc, words, dir))
        const down = walk.take(u, k, 1, ACROSS, fits(1)), up = walk.take(u, m[n + 1], -1, ACROSS, fits(-1), FLOAT_SKIP)
        const last = down.at(-1) ?? k
        idx.push(...down.filter(j => j < m[n + 1]), ...up.filter(j => j > last).reverse())
      }
    }
    const all = beyond[u]?.length ? [...new Set([...idx, ...beyond[u]])].sort((x, y) => x - y) : idx
    // a unit keeps where its text's words were matched on the page (`pairs`: a word's place in its text → the page
    // token; with marks, or by its text alone, B3c), so that its sentences can be found there whenever they are known
    // (sentenceStarts): on the left, a
    // translation that comes in after the side was anchored gives them. The match's own map, kept: an array of them
    // made for every unit cost a heavy paper's anchoring 2.7 ms, cold (the review of B3, minor 2: 2608.02459)
    const pairs = f.pairs ?? f.textPairs
    out.set(id, { rects: lineRects(doc, all), coverage: +f.coverage.toFixed(3), tokens: all, bounded: !!f.bounded, ...(pairs ? { pairs } : {}) })
  })
  return out
}

/**
 * Where each of a unit's sentences after the first begins on the page (report-B option X): the page token of its first
 * word, as the unit's own text match inside its marks found it — the sentence's second or third word it found where it
 * did not find the first, never a word of the next sentence. `anchor` the unit's place (anchorUnits: a unit with marks),
 * `text` the text it was anchored by, `offsets` where each sentence after the first begins in it (mt.mjs sentencesOf:
 * `src` on the left, `tr` on the right). An Int32Array rising, each start after the unit's first token and among its
 * tokens; empty for a unit of one sentence; null where a sentence's start is not found — nor among its next two words
 * (on the ten papers 9 of 4 230 starts were found late, six by two words and one by eight: a start so late puts the
 * words before it in the sentence before; the review of B3, minor 6) — the unit is lit whole then, on both sides.
 * A unit found by its text alone (arXiv's PDF before our marked original's marks are carried to it, B3c: the
 * sentences then come with the first preview, not near the end of a live run) has its starts where its match covers
 * TEXT_ONLY of its words or more, and none below: on the ten papers' arXiv PDFs, 1 702 starts found so all on the token
 * the marks give, 19 of 23 below; on the ground truth's, on the mark's line as often as with marks (98.6–100 %
 * against 98.9–100 %)
 */
export function sentenceStarts(anchor, text, offsets) {
  const pairs = anchor?.pairs
  if (!pairs || (!anchor.bounded && anchor.coverage < TEXT_ONLY)) return null
  // offsets of their shape, whole numbers rising inside the text: a copy's record is read as stored (mt.mjs sentencesKept)
  if (!Array.isArray(offsets) || !offsets.every((o, j) => Number.isInteger(o) && o > (j ? offsets[j - 1] : 0) && o < text.length)) return null
  const at = offsets.map(o => tokens(text.slice(0, o)).length), ts = anchor.tokens, out = new Int32Array(offsets.length)
  const has = k => { let lo = 0, hi = ts.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ts[m] < k) lo = m + 1; else hi = m } return ts[lo] === k }
  for (let j = 0; j < at.length; j++) {
    const end = Math.min(at[j] + 1 + LATE, j + 1 < at.length ? at[j + 1] : Infinity)
    let k = -1
    for (let i = at[j]; i < end && k < 0; i++) { const t = pairs.get(i); if (t !== undefined && has(t)) k = t }
    if (k < 0 || k <= (j ? out[j - 1] : ts[0])) return null
    out[j] = k
  }
  return out
}
/** how many words after a sentence's first its start may be found at */
const LATE = 2
/** the share of a unit's words its text match must cover for its starts, where it has no marks */
const TEXT_ONLY = 0.8

/**
 * The pairs sentenceStarts reads, as runs a left part carries: [word, token, count] triples (global tokens), word rising,
 * maximal (the next word on the next token extends a run). Only a unit sentenceStarts admits has any (the same gate: pairs, and
 * bounded or coverage of TEXT_ONLY), and only the pairs whose token is among the unit's own (the `has` filter); null where
 * there are none. A word map that is not monotone, or names a token twice, is carried as it is, in more runs. The Map's order
 * is the match's, not the words': the keys are sorted, so the same unit gives the same runs
 */
export function startRuns(anchor) {
  const pairs = anchor?.pairs
  if (!pairs || (!anchor.bounded && anchor.coverage < TEXT_ONLY)) return null
  const ts = anchor.tokens
  const has = k => { let lo = 0, hi = ts.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ts[m] < k) lo = m + 1; else hi = m } return ts[lo] === k }
  const out = []
  let word = -2, token = -2
  for (const w of [...pairs.keys()].sort((x, y) => x - y)) {
    const t = pairs.get(w)
    if (t === undefined || !has(t)) continue
    if (w === word + 1 && t === token + 1) out[out.length - 1]++
    else out.push(w, t, 1)
    word = w
    token = t
  }
  return out.length ? Int32Array.from(out) : null
}

/**
 * The anchor sentenceStarts reads as it reads the one startRuns came of, rebuilt from what a unit's left parts hold: `pieces` its
 * entry on each page it has tokens on, in page order, { first: the page's first token, ranges: [first, count, …] page-local,
 * runs?: [word, token, count, …] page-local }. The tokens are the unit's own, rising, and the pairs the runs' words; null where
 * no page has runs (the unit gave none to read: a sentence's start is not found). The gate was applied by the writer, so the
 * rebuilt anchor is bounded
 */
export function startsAnchor(pieces) {
  const tokens = [], pairs = new Map()
  let any = false
  for (const p of pieces) {
    for (let j = 0; j < p.ranges.length; j += 2) for (let k = 0; k < p.ranges[j + 1]; k++) tokens.push(p.first + p.ranges[j] + k)
    const runs = p.runs
    if (runs) for (let j = 0; j < runs.length; j += 3) for (let k = 0; k < runs[j + 2]; k++) { pairs.set(runs[j] + k, p.first + runs[j + 1] + k); any = true }
  }
  return any ? { rects: [], coverage: 1, tokens, bounded: true, pairs } : null
}
