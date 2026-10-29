// Each placeholder's own ink in the marked compile, by content-stream order (Plan 8b, Task 6b; spec §4.2; the stream
// ownership spike of 2026-10-06). LAYOUT_TEX sets a point, `/axt-<name> ri`, beside each destination it sets
// (layout/marks.mjs), and points around each column's body (bs<n>, be<n>, in \@makecol, else at \@outputpage) and each float's box (fs<n>,
// fe<n>); pageInk reads them in order among the glyphs and the boxes (layout/ink.mjs). A piece's own ink is what the
// content stream shows between its two points: every glyph and rule TeX set for it, its scripts, limits, bars and
// radicals, and nothing of its neighbours', where geometry can only guess. What TeX ships between two points that is
// not the piece's — a page's footnotes and their rule, its running foot and the next page's head, a float shipped in
// mid-paragraph or at a column's head — lies outside the region of its opening point, and is cut: a region is in a
// column's body or not, at a depth of floats.
// Imports nothing: pure arithmetic over what pageInk read.

/** how a piece's ink was found, or why none was: the first OWNED are owned (its glyphs and rules, maybe none), the rest
 *  are not, and the maker writes the piece LOST — but 'in the display before it', a later display of a display group,
 *  whose ink is the group's first display's (the maker writes it JOINED) */
export const OWNED_HOW = Object.freeze([
  'closed',
  'open, to the text after it',
  "open, to its unit's next mark",
  "open, to its column's end",
  "open, past its column's end",
  'open, with the displays after it',
  'in the display before it',
  'marks out of order',
  'a mark set twice',
  'its marks in two regions',
  'across a page, unbracketed',
  'across a column, unbracketed',
  'closing point not read',
  'open, the next mark on another page',
  'open, an unmarked piece follows',
  "open, the next mark not its unit's",
  'open, the text after it not found',
  'open, nothing before the text after it',
  'more glyphs than a piece may own',
  'past the glyphs a paper may own',
  'ink out of bounds',
])
export const OWNED = 6
/** the glyph columns ownedOf reads of a page (ink.mjs packGlyphs), and the owned rows after it (marks.mjs): a glyph's
 *  origin, baseline, size and character */
export const STREAM_COLUMNS = Object.freeze(['x0', 'y', 'size', 'u'])
const HOW = Object.fromEntries(OWNED_HOW.map((h, i) => [h, i]))
/** a bracket's point: a column's body (b) or a float's box (f), its start (s) or end (e), by a number */
const BRACKET = /^([bf])([se])\d+$/
/** a babel name's point (marks.mjs NAMES_TEX): no piece's next mark, its text no unit's */
const NAME_POINT = /^n\d+\.[^.]+\.[se]$/
/** where other text begins that no unit's mark opens: a babel name's start (a heading's own word, "References") and a biblatex
 *  entry's (marks.mjs POINTS_TEX `bi<n>`): a piece alone at its unit's end owns nothing past one on its page */
const BEGINS = /^(?:n\d+\.[^.]+\.s|bi\d+)$/
/** a biblatex entry's point: no piece's next mark either, its entry no unit of the source */
const BIB_ITEM = /^bi\d+$/
/** a piece's opening point: a placeholder's (p) or a footnote call's (n), by its unit and source piece index */
const OPENING = /^([pn])(\d+)\.(\d+)a$/
/** a unit's start mark: MARK_DEF's, a cell's, a heading's */
const START = /^[th]?(\d+)s$/
/** a range in a region outside the column bodies (an output routine of its own: REVTeX's, multicol's) that goes from
 *  low on a page to high on it, and right by this share of the page's width and up by this share of its height, crossed
 *  into the next column: what TeX shipped between is in it, and cannot be told apart */
const JUMP_X = 0.25, JUMP_Y = 0.25
/** a piece alone at its unit's end owns its lines up to a gap this many of the page's line pitches deep, or more: TeX's skip
 *  before another block (an author block's affiliations below its names), never the leading of the lines a piece wraps over */
const BLOCK_GAP = 1.5
/** the baseline most of a line's glyphs stand on (to a tenth), the first met on a tie: its text's, not a mark's raised over it */
function lineBase(G, glyphs, from, to) {
  const n = new Map()
  let best = G.y[glyphs[from][1]], most = 0
  for (let q = from; q < to; q++) { const y = Math.round(G.y[glyphs[q][1]] * 10) / 10, c = (n.get(y) ?? 0) + 1; n.set(y, c); if (c > most) { most = c; best = y } }
  return best
}
/** a page's line pitch: the drop between consecutive lines' baselines that most of them have (to a half), where its glyphs run on
 *  a line's start (left by an em, down by half its size) and the drop is under three of its size; null where none */
function pitchOf(G) {
  const n = new Map()
  let best = null, most = 0, prev = -1
  for (let g = 0; g < G.n; g++) {
    if (prev >= 0) {
      const em = Math.min(G.size[prev], G.size[g]), drop = G.y[prev] - G.y[g]
      if (G.x0[g] < G.x0[prev] - em && drop > 0.5 * em && drop < 3 * Math.max(G.size[prev], G.size[g])) {
        const d = Math.round(drop * 2) / 2, c = (n.get(d) ?? 0) + 1
        n.set(d, c)
        if (c > most) { most = c; best = d }
      }
    }
    prev = g
  }
  return best
}
/** how many of `glyphs` ([page, g], stream order, one page) a piece alone at its unit's end owns: its lines up to the first that
 *  starts a gap BLOCK_GAP of the page's pitch or more below the line before (`anchor`, the baseline of its unit's line it opens
 *  on, the first line's where it opens on a line of its own), or all; a new line is one TeX set below the glyph before by half
 *  its size, at or left of where that glyph starts, or below it by a size or more wherever it starts (an indented block) */
function lineEnd(G, glyphs, anchor, pitch) {
  if (!pitch) return glyphs.length
  let from = 0, base = anchor
  for (let j = 1; j <= glyphs.length; j++) {
    const a = glyphs[j - 1][1], b = glyphs[j]?.[1]
    if (b !== undefined) {
      const em = Math.min(G.size[a], G.size[b]), drop = G.y[a] - G.y[b]
      // (a drop of a size or more is a line apart, wherever it starts: an indented or centred block after a short line)
      if (!(drop > 0.5 * em && (G.x0[b] <= G.x0[a] || drop > Math.max(G.size[a], G.size[b])))) continue
    }
    const y = lineBase(G, glyphs, from, j)
    if (from > 0 && base - y >= BLOCK_GAP * pitch) return from
    base = from === 0 && anchor !== null ? anchor : y
    from = j
  }
  return glyphs.length
}
/** the characters of the text after an opening point alone that it is found by */
export const WANT = 8
/** the glyph visits a paper's ownership may cost: real ranges never overlap, and cost the glyphs once */
const WORK = 20_000_000

/** a text's letters and digits, without their accents, lower case: the per-unit erasure's evidence that ink is a text's (own.mjs's
 *  spell check, the text after a piece told from the piece's own ink) */
// (a spacing accent — OT1's \\^ sets ˆ beside its letter, a modifier letter to Unicode: TeX's own, U+02C6, U+02C7 and
// U+02D8 to U+02DD, the others no letters already; not every modifier letter, CJK's prolonged sound mark and iteration mark among
// them — is no letter, and a dotless ı or ȷ under an accent is its letter: 2610.20595v1 "Ciˆencia", 2610.20581v1 "Estad´ısticas".
// A letter Unicode does not decompose is its base letters, so that a letter symbol reads the same whichever way the font maps
// it: \\o ø, \\ae æ, \\oe œ, \\l ł — OT1 sets \\l as a bar over an l, T1 as its own glyph —, \\ss ß, \\dh đ; and a final sigma
// is a sigma, the one letter whose lower case hangs on what follows it ("ΟΣ" lowers to "ος", its "Σ" alone to "σ"), so that a
// text spelled a glyph at a time spells as it does whole)
const BASE_LETTERS = { ß: 'ss', ı: 'i', ȷ: 'j', ø: 'o', æ: 'ae', œ: 'oe', ł: 'l', đ: 'd', ð: 'd', ħ: 'h', þ: 'th', ŋ: 'n', ς: 'σ' }
export const spellOf = s => s.normalize('NFKD').replace(/[\p{M}\u02c6\u02c7\u02d8-\u02dd]/gu, '').toLowerCase().replace(/[ßıȷøæœłđðħþŋς]/g, c => BASE_LETTERS[c]).replace(/[^\p{L}\p{N}]/gu, '')

/** a region's code: in a column's body or not, at a depth of floats */
const code = (body, depth) => depth * 2 + (body ? 1 : 0)

/** how far below every other glyph of its page a folio stands, in its size: LaTeX's running foot is \\footskip (30pt) below the
 *  text block's last baseline, a display's or a footnote's next line one baselineskip */
const FOLIO_GAP = 1.5
/** how far right of a footnote's own lines' start each line of a display that ends it starts, at least, in its size (an em) */
const FOOT_DISPLAY_INDENT = 2
/** how far apart two lines of a display that ends a footnote may stand, at most, in their size: a display's rows and its
 *  scripts lie within two, the page's foot \\footskip (30pt) below the text block */
const FOOT_DISPLAY_GAP = 2.5
/** a folio's characters: a page number, arabic or roman, maybe between dashes */
const FOLIO = /^[-\u2013\u2014]?(?:\d{1,4}|[ivxlcdm]{1,8})[-\u2013\u2014]?$/
/** where a page's folio begins among its glyphs (its glyph count where it has none, `regions` its regionsOf): the run of
 *  glyphs that ends its stream, on one baseline and outside the bodies, that spells a page number alone and stands below every
 *  other glyph of the page by FOLIO_GAP of its size or more */
export function folioOf(page, regions) {
  const G = page.glyphs, n = G.n
  if (!n) return 0
  let k = n - 1
  const y = G.y[k], size = G.size[k]
  while (k > 0 && Math.abs(G.y[k - 1] - y) < 0.5 * Math.max(size, G.size[k - 1])) k--
  let s = ''
  for (let g = k; g < n; g++) { if (regions.glyph[g] % 2 === 1) return n; s += charOf(G.u[g] ?? '') }
  if (!FOLIO.test(s)) return n
  for (let g = 0; g < k; g++) if (G.y[g] - y < FOLIO_GAP * size) return n
  return k
}
/** a glyph's character as the text after a piece is compared with it: NFKC, lower case, no white space, no variation
 *  selector */
const charOf = u => u.normalize('NFKC').toLowerCase().replace(/\s|\p{Variation_Selector}/gu, '')

/** each page's regions: of each glyph, of each box, at each point; every page begins outside any body */
export function regionsOf(page) {
  const { glyphs, points } = page, nBoxes = page.boxes.length / 4
  const glyph = new Int32Array(glyphs.n), box = new Int32Array(nBoxes), at = new Int32Array(points.length)
  let body = false, depth = 0, bodies = false
  const apply = name => {
    const m = BRACKET.exec(name)
    if (!m) return
    if (m[1] === 'b') { body = m[2] === 's'; bodies = true } else depth = m[2] === 's' ? depth + 1 : Math.max(0, depth - 1)
  }
  for (let q = 0, g = 0; g <= glyphs.n; g++) {
    while (q < points.length && points[q].glyph <= g) { apply(points[q].name); at[q] = code(body, depth); q++ }
    if (g < glyphs.n) glyph[g] = code(body, depth)
  }
  body = false; depth = 0
  for (let q = 0, b = 0; b < nBoxes; b++) {
    while (q < points.length && points[q].box <= b) apply(points[q++].name)
    box[b] = code(body, depth)
  }
  return { glyph, box, at, bodies }
}

/**
 * Each piece's own glyphs and rules in the marked compile, by its opening point's name: Map name → { how, glyphs, boxes }
 * (OWNED_HOW; glyphs and boxes [page, index] into the pages, in stream order, none where it is not owned). `pages`, page
 * by page (1-based at index 0), what pageInk read of the marked compile, its glyphs packed in stream order (ink.mjs
 * packGlyphs, STREAM_COLUMNS at least), with each page's view; `follows(name)`, for an opening point's name, what the
 * marking says of its piece ({ closing, want, ends, blocked, group }, Follow), or null for a name that is no piece of a
 * unit; `dropped`, the names the log reports set twice.
 * - Two points: the glyphs and boxes between them in the opening point's region; on another page only where it is a
 *   column's body (else what TeX shipped between cannot be cut: unbracketed), the two in one region; outside the
 *   bodies, not across a column (JUMP_X, JUMP_Y). A closing point expected (`closing`) and not read: none.
 * - An opening point alone: to the next mark's point on its page, in its region; where text follows the piece in its
 *   unit, to where that text's first WANT characters (`want`) begin, a hyphen passed over — and where the next point is its
 *   unit's next mark, so that the text after it runs to that point, the first such place from which the glyphs to the point
 *   spell that whole text (`rest`, spellOf: textTo), its first characters standing in the piece's own ink before (a display's
 *   \\text{for every} before "For", a URL's dots before the full stop after it); where none does, the next
 *   mark must be its unit's next one (`ends`), or a later unit's start mark — MARK_DEF sets a unit's end mark before a
 *   display that ends it — and then what stands on that mark's line before it is that unit's label (a heading's number,
 *   an item's mark), not the piece's; or, where that mark is outside the bodies (a footnote's), the column's body's end;
 *   no unmarked visible piece may come between (`blocked`). Past its unit's end mark (a display that ends its unit), it ends
 *   where a heading's babel name or a biblatex entry begins after it on its page, before any next mark, as at a later unit's
 *   start: that text is no unit's of the source, and none of it the piece's. Nothing at all before the
 *   next point is a piece of nothing; nothing before the text after it, with glyphs there, is none (REVTeX sets the
 *   punctuation after a citation before its number).
 * - Past its column's end (pastColumn): an opening point alone in a column's body whose next mark lies past that body's
 *   end — on another page, or a later unit's or a footnote's on its own — owns what its region holds from it on, through
 *   the bodies' breaks, up to the text after it (`want`), or with none to its body's end (or through to its unit's next
 *   mark there). TeX ships a column's body between its two points in the order it set it: what stands in the piece's
 *   region after its point and before its unit's next text is what TeX set for it (a display at a column's foot, its
 *   number, a display \allowdisplaybreaks breaks over a page). The rule is asked only where the one before it found
 *   nothing ('the next mark on another page', 'the text after it not found'), so no piece found otherwise moves.
 * - A display group (`group`, marks.mjs followsOf): displays with nothing visible between them whose later ones have no
 *   opening point, since TeX sets none on the empty list it resumes the paragraph with (a whatsit there would keep the
 *   empty paragraph between two displays a line). The first owns the whole group's ink, to the text after the last
 *   ('open, with the displays after it'); each later one is 'in the display before it'. Their split is not TeX's to give.
 * A name set twice owns nothing, nor where the work is past its bound.
 * `erasure` (own.mjs's, the per-unit erasure's reading; the maker's is without it, its layouts unchanged): a piece is found
 * where its ink is told exactly though the maker leaves it LOST — the text after it compared with TeX's quotes as one (`"`
 * set as ” by OT1); nothing before the text after it but rules, those rules its own (\\_ before \\allowbreak); an opening
 * alone followed by placeholders with no mark of their own and nothing else up to the next marked piece's opening
 * (`through`, marks.mjs followsOf), what stands between the two its own and theirs; and a later unit's opening next, as a
 * later unit's start mark is (that unit's label on its line left out). The sweep of 2026-10-24.
 * The maker's reading takes `through` too where the marking gives a `split` (marks.mjs followsOf: a paper's macro and the one
 * placeholder after it no mark could stand before, \\footnote after \\xspace, the macro's text known): the glyphs to the next
 * marked piece's point parted, the macro's those that set its text from the first, character for character (textedTo), the
 * placeholder's the rest, under the opening mark's name it would have had; where they do not set it, leave nothing, or the rest
 * runs on as the macro's word (runsOn), LOST as before.
 * - A display that ends a footnote (footEnd: a display, its unit's last visible piece, after the unit's end mark, outside the
 *   bodies, no mark after it on its page): what its region holds from it to the page's folio (folioOf), each of its lines
 *   indented from the footnote's own and near the one before; with no folio, a line at the footnote's edge (a note after it
 *   with no mark) or one apart (the page's foot), none (the release sweep of 2026-10-24, 2610.16663v1 p16u58: the maker left
 *   it LOST, the erasure the unit the original's).
 */
export function ownedOf(pages, { follows, dropped = [], erasure = false }) {
  const twice = new Set(dropped)
  const regions = pages.map(regionsOf)
  /** each page's line pitch (pitchOf), read once where a piece alone at its unit's end asks for it */
  const pitches = new Map()
  // every point by its name, in stream order: [page, index]; the mark points in stream order (brackets and names apart)
  const where = new Map(), seq = []
  pages.forEach((p, i) => p.points.forEach((pt, q) => {
    const list = where.get(pt.name)
    if (list) list.push([i + 1, q]); else where.set(pt.name, [[i + 1, q]])
    if (!BRACKET.test(pt.name) && !NAME_POINT.test(pt.name) && !BIB_ITEM.test(pt.name)) seq.push([i + 1, q])
  }))
  const rank = new Map()
  seq.forEach(([p, q], r) => rank.set(`${p}|${q}`, r))
  const out = new Map()
  let work = 0
  const none = how => ({ how, glyphs: [], boxes: [] })
  /** what a piece owns up to the glyph `end` of its glyphs ([page, index], stream order), and the boxes before it */
  const cut = (how, glyphs, boxes, end) => {
    if (end >= glyphs.length) return { how, glyphs, boxes }
    const [p, g] = glyphs[end], upTo = pages[p - 1].boxAt[g]
    return { how, glyphs: glyphs.slice(0, end), boxes: boxes.filter(([q, b]) => q < p || (q === p && b < upTo)) }
  }
  for (const [name, list] of where) {
    const m = OPENING.exec(name)
    if (!m) continue
    const f = follows(name)
    if (!f) continue
    const close = `${name.slice(0, -1)}b`, closes = where.get(close) ?? []
    if (list.length > 1 || closes.length > 1 || twice.has(name) || twice.has(close)) { out.set(name, none(HOW['a mark set twice'])); continue }
    if (work > WORK) { out.set(name, none(HOW['past the glyphs a paper may own'])); continue }
    const [pa, qa] = list[0], A = pages[pa - 1].points[qa], rA = regions[pa - 1].at[qa]
    /** the glyphs and boxes of page p from (g0, b0) to (g1, b1) in A's region, onto `glyphs` and `boxes` */
    const take = (glyphs, boxes, p, g0, g1, b0, b1) => {
      const R = regions[p - 1]
      work += g1 - g0 + b1 - b0
      for (let g = g0; g < g1; g++) if (R.glyph[g] === rA) glyphs.push([p, g])
      for (let b = b0; b < b1; b++) if (R.box[b] === rA) boxes.push([p, b])
    }
    /** what A's region holds from A to the point `to` ([page, index], null: the paper's end), page by page */
    const takeTo = to => {
      const glyphs = [], boxes = []
      const last = to ? to[0] : pages.length
      for (let p = pa; p <= last; p++) {
        const P = pages[p - 1], T = to && p === to[0] ? P.points[to[1]] : null
        take(glyphs, boxes, p, p === pa ? A.glyph : 0, T ? T.glyph : P.glyphs.n, p === pa ? A.box : 0, T ? T.box : P.boxes.length / 4)
      }
      return { glyphs, boxes }
    }
    /** a jump from low on a page to high and right on it, outside the bodies: across a column */
    const jumps = glyphs => {
      if (rA !== 0) return false
      for (let j = 1; j < glyphs.length; j++) {
        const [p, g] = glyphs[j], [o, h] = glyphs[j - 1]
        if (p !== o) continue
        const v = pages[p - 1].view, G = pages[p - 1].glyphs
        if (G.y[g] - G.y[h] > JUMP_Y * (v[3] - v[1]) && G.x0[g] - G.x0[h] > JUMP_X * (v[2] - v[0])) return true
      }
      return false
    }
    /** where the text after the piece begins among `glyphs`, which run to the point named `to` (textAt; where
     *  that point is its unit's next mark, so that the text after it runs to it: textTo) */
    const textEnd = (glyphs, to) => (typeof f.rest === 'string' && to !== null && f.ends.includes(to) ? textTo(pages, glyphs, f.want, f.rest, erasure) : textAt(pages, glyphs, f.want, erasure))
    if (closes.length) {
      const [pb, qb] = closes[0]
      if (pb < pa || (pb === pa && qb < qa)) { out.set(name, none(HOW['marks out of order'])); continue }
      if (regions[pb - 1].at[qb] !== rA) { out.set(name, none(HOW['its marks in two regions'])); continue }
      if (pb !== pa && rA % 2 === 0) { out.set(name, none(HOW['across a page, unbracketed'])); continue }
      let { glyphs, boxes } = takeTo([pb, qb])
      // (a punctuation mark its command set before its own ink, moved from after it (marks.mjs followsOf `moved`, TeX's 3: the
      // closing mark after that mark), the text's, not the piece's: its first glyph where that is the mark, more follow, and no such
      // mark stands right after the closing point — TeX's own output telling the moved mark from a piece's own ink that opens
      // with it: `\url{../data}.` keeps its dot, the full stop after its closing point, the review of #501)
      if (f.moved && glyphs.length > 1) {
        const [p0, g0] = glyphs[0], B = pages[pb - 1], G = B.glyphs
        let next = B.points[qb].glyph
        while (next < G.n && !setAs(G.u[next] ?? '')) next++
        if (pages[p0 - 1].glyphs.u[g0] === f.moved && !(next < G.n && G.u[next] === f.moved)) { const [p1, g1] = glyphs[1], from = pages[p1 - 1].boxAt[g1]; glyphs = glyphs.slice(1); boxes = boxes.filter(([q, b]) => q > p1 || (q === p1 && b >= from)) }
      }
      out.set(name, jumps(glyphs) ? none(HOW['across a column, unbracketed']) : { how: HOW.closed, glyphs, boxes })
      continue
    }
    if (f.closing) { out.set(name, none(HOW['closing point not read'])); continue }
    /** an opening point alone: to the next mark's point, on its page */
    /** the piece's ink up to the point N where other text begins on its page, a later unit's start: that text's label not the
     *  piece's — the glyphs on N's line before it, the boxes after the first of them */
    const toStart = (glyphs, boxes, N) => {
      const P = pages[pa - 1], G = P.glyphs, after = N.glyph
      // (a piece that is no display, alone at its unit's end, owns its lines up to TeX's skip before another block, no further:
      // the next unit may start many lines on — the last author's \\orcidlink of 2609.20976v1 ran to the abstract's label over
      // the affiliations and the e-mail below the names, which no unit then owned and no ink unit was made of; a reference's
      // \\Eprint wrapped over two lines, its entry's full stop on a third, keeps them, at the bibliography's leading)
      let line = glyphs.length
      if (!f.display && glyphs.length) {
        // (the unit's line it opens on: the glyph before its first, on that glyph's line)
        const g0 = glyphs[0][1], before = g0 - 1
        const anchor = before >= 0 && Math.abs(G.y[before] - G.y[g0]) < Math.max(G.size[before], G.size[g0]) ? G.y[before] : null
        line = lineEnd(G, glyphs, anchor, pitches.get(pa) ?? pitches.set(pa, pitchOf(G)).get(pa))
      }
      if (line < glyphs.length) { const upTo = P.boxAt[glyphs[line][1]]; glyphs = glyphs.slice(0, line); boxes = boxes.filter(([, b]) => b < upTo) }
      let end = glyphs.length
      while (after < G.n && end > 0 && Math.abs(G.y[glyphs[end - 1][1]] - G.y[after]) < 0.5 * Math.max(G.size[glyphs[end - 1][1]], G.size[after])) end--
      const upTo = end < glyphs.length ? P.boxAt[glyphs[end][1]] : N.box
      return { how: HOW["open, to its unit's next mark"], glyphs: glyphs.slice(0, end), boxes: boxes.filter(([, b]) => b < upTo) }
    }
    const alone = () => {
      // (past its unit's end mark — MARK_DEF sets it before a display that ends the unit —, nothing after it is its unit's: the
      // text that begins on its page after it with no unit's mark, a heading's babel name or a biblatex entry, is another's.
      // 2608.08872v1's proof ends in a display, and the whole bibliography after it on the page, its "References" and every
      // entry, was that display's ink. A name before the unit's end mark is the unit's own text)
      const past = !f.want && [`${m[2]}e`, `t${m[2]}e`, `h${m[2]}e`].some(n => (where.get(n) ?? []).some(([p, q]) => p < pa || (p === pa && q < qa)))
      if (past) {
        const pts = pages[pa - 1].points, next = seq[(rank.get(`${pa}|${qa}`) ?? -2) + 1]
        for (let q = qa + 1; q < pts.length && !(next && next[0] === pa && q >= next[1]); q++) {
          if (!BEGINS.test(pts[q].name)) continue
          const { glyphs, boxes } = takeTo([pa, q])
          if (jumps(glyphs)) return none(HOW['across a column, unbracketed'])
          if (f.blocked && (glyphs.length || boxes.length)) return none(HOW['open, an unmarked piece follows'])
          // (as to a later unit's start: a numeric entry's label, which the list's \\item set before its point, the entry's; a piece
          // that is no display, its lines to TeX's skip before another block)
          return toStart(glyphs, boxes, pts[q])
        }
      }
      const next = seq[(rank.get(`${pa}|${qa}`) ?? -2) + 1]
      if (!next || next[0] !== pa) return none(HOW['open, the next mark on another page'])
      const P = pages[pa - 1], N = P.points[next[1]]
      // nothing after it in its unit, its next mark outside the bodies (a footnote's, shipped below its column): the piece
      // ends with its column's body, where no body begins again before that mark
      if (!f.want && rA % 2 === 1 && regions[pa - 1].at[next[1]] % 2 === 0) {
        let E = null
        for (let q = qa + 1; q < next[1]; q++) { const n = P.points[q].name; if (/^be\d+$/.test(n)) E = q; else if (/^bs\d+$/.test(n)) E = null }
        if (E !== null) {
          const { glyphs, boxes } = takeTo([pa, E])
          return f.blocked && (glyphs.length || boxes.length) ? none(HOW['open, an unmarked piece follows']) : { how: HOW["open, to its column's end"], glyphs, boxes }
        }
      }
      let { glyphs, boxes } = takeTo(next)
      if (jumps(glyphs)) return none(HOW['across a column, unbracketed'])
      if (!glyphs.length && !boxes.length) return { how: HOW[f.want ? 'open, to the text after it' : "open, to its unit's next mark"], glyphs, boxes }
      if (!f.want) {
        // (the erasure's: a later unit's opening as its start mark only where that unit's start mark follows it on the page — the
        // opening is its lead placeholder's, on its first line; an end-only unit's opening may stand lines into it)
        const opening = erasure ? OPENING.exec(N.name) : null
        const startsAfter = id => [`${id}s`, `h${id}s`, `t${id}s`].some(n => (where.get(n) ?? []).some(([p, q]) => p === pa && q > next[1]))
        const later = START.exec(N.name) ?? (opening && startsAfter(opening[2]) ? [N.name, opening[2]] : null)
        const S = f.blocked ? f.split : null
        if (S && (S.ends ? S.ends.includes(N.name) : f.through && N.name === f.through)) {
          // (a paper's macro and the one unmarked piece right after it, which no mark could stand before (marks.mjs followsOf
          // `split`), their ink to the next marked piece's point — or, text after that piece, to where that text begins, as an
          // opening's ink runs to the text after it: a .bbl's `\\DOIprefix\\doi{…}.` at an entry's end —, the macro's the glyphs
          // that set the text TeX sets for it, character for character, the piece's the rest; but where the rest runs on as the
          // macro's word, which its text then did not hold whole, none. The maker's reading parts the two; the erasure's owns them
          // as the macro's, one ink of its unit's as `through` reads it)
          const end = textedTo(pages, glyphs, S.text)
          const stop = end > 0 && end < glyphs.length && !runsOn(pages, glyphs, end) ? (S.ends ? afterText(pages, glyphs, end, S, erasure) : glyphs.length) : -1
          if (stop > end) {
            if (erasure) return cut(HOW[S.ends ? 'open, to the text after it' : "open, to its unit's next mark"], glyphs, boxes, stop)
            const [p, g] = glyphs[end], from = pages[p - 1].boxAt[g], piece = cut(HOW["open, to its unit's next mark"], glyphs, boxes, stop)
            out.set(S.name, { how: piece.how, glyphs: piece.glyphs.slice(end), boxes: piece.boxes.filter(([q, b]) => q > p || (q === p && b >= from)) })
            return cut(HOW["open, to its unit's next mark"], glyphs, boxes, end)
          }
        }
        if (f.blocked) return erasure && f.through && N.name === f.through ? { how: HOW["open, to its unit's next mark"], glyphs, boxes } : none(HOW['open, an unmarked piece follows'])
        if (f.ends.includes(N.name)) return { how: HOW["open, to its unit's next mark"], glyphs, boxes }
        if (later && Number(later[1]) > Number(m[2])) return toStart(glyphs, boxes, N)
        return none(HOW["open, the next mark not its unit's"])
      }
      const end = textEnd(glyphs, N.name)
      if (end < 0) return none(HOW['open, the text after it not found'])
      if (end === 0) {
        // (the erasure's: rules alone before the text after it are the piece's ink — a glyph set there would be one, and
        // REVTeX's swapped punctuation sets none)
        // (a rule under or over the text after it — ulem's \\uline, soul's \\hl paint theirs before the word — is that text's, not
        // the piece's: none where a rule reaches past the first glyph of the text after it on its line)
        const [p0, g0] = glyphs[0], P0 = pages[p0 - 1], ruled = boxes.filter(([q, b]) => q < p0 || (q === p0 && b < P0.boxAt[g0]))
        const under = ([q, b]) => q === p0 && P0.boxes[4 * b + 2] > P0.glyphs.x0[g0] + 0.1 * P0.glyphs.size[g0] && P0.boxes[4 * b + 1] < P0.glyphs.y[g0] + P0.glyphs.size[g0] && P0.boxes[4 * b + 3] > P0.glyphs.y[g0] - 0.5 * P0.glyphs.size[g0]
        if (erasure && ruled.length && !ruled.some(under)) return { how: HOW['open, to the text after it'], glyphs: [], boxes: ruled }
        return none(HOW['open, nothing before the text after it'])
      }
      return cut(HOW['open, to the text after it'], glyphs, boxes, end)
    }
    /** an opening point alone in a column's body, its next mark past that body's end, or null where it is not so */
    const pastColumn = () => {
      if (rA % 2 !== 1) return null
      // its stop: the first mark after it in its region (a footnote's or a float's, shipped elsewhere, passed over)
      let stop = null
      for (let r = (rank.get(`${pa}|${qa}`) ?? -2) + 1; r >= 1 && r < seq.length && !stop; r++) if (regions[seq[r][0] - 1].at[seq[r][1]] === rA) stop = seq[r]
      // the first end of a body after it, before its stop
      let E = null
      for (let p = pa; p <= (stop ? stop[0] : pages.length) && !E; p++) {
        const pts = pages[p - 1].points
        for (let q = p === pa ? qa + 1 : 0; q < (stop && p === stop[0] ? stop[1] : pts.length); q++) if (/^be\d+$/.test(pts[q].name)) { E = [p, q]; break }
      }
      if (!E) return null
      if (f.want) {
        const { glyphs, boxes } = takeTo(stop)
        const end = textEnd(glyphs, stop ? pages[stop[0] - 1].points[stop[1]].name : null)
        return end > 0 ? cut(HOW["open, past its column's end"], glyphs, boxes, end) : null
      }
      if (f.blocked) return null
      // with no text after it: to its body's end, or through to its unit's next mark where that is its stop
      const stopName = stop ? pages[stop[0] - 1].points[stop[1]].name : null
      const through = stopName !== null && f.ends.includes(stopName)
      const { glyphs, boxes } = takeTo(through ? stop : E)
      return { how: HOW[through ? "open, past its column's end" : "open, to its column's end"], glyphs, boxes }
    }
    /** an opening point alone outside the bodies, its unit's last visible piece with no text after it, after its
     *  unit's end mark on its page (MARK_DEF sets the end mark before a display that ends a unit), no mark after it on its page:
     *  a display that ends a footnote (2610.16663v1 p16u58). What its region holds from it to the page's folio (folioOf) is what
     *  TeX set for it, where every line of it starts FOOT_DISPLAY_INDENT of its size or more right of where the footnote's own
     *  text starts its lines: a display is centred or indented in the footnote's measure, and a footnote after it with no mark
     *  of its own (a note of a URL alone) starts at that edge, its number within 1.8 em of it (LaTeX's \\@makefntext), and each
     *  line within FOOT_DISPLAY_GAP of its size of the one before it: a line of the page's foot above the folio (a copyright
     *  line, centred) stands \\footskip below the text block. None on a page with no folio to tell where it ends (a running
     *  foot's text would be hidden with it), where a line starts nearer or stands apart, or for a piece that is no display (an
     *  inline formula or a citation ends with its own ink, which this reading cannot tell from what follows it) */
    const footEnd = () => {
      if (!f.display || rA % 2 !== 0 || f.want || f.blocked || f.ends.some(n => OPENING.test(n))) return null
      const end = f.ends.flatMap(n => where.get(n) ?? []).find(([p, q]) => p === pa && q < qa)
      if (!end) return null
      const P = pages[pa - 1], G = P.glyphs, R = regions[pa - 1], stop = folioOf(P, R), glyphs = [], boxes = []
      if (stop < A.glyph || stop >= G.n) return null
      take(glyphs, boxes, pa, A.glyph, stop, A.box, P.boxAt[stop])
      if (!glyphs.length) return null
      // (the footnote's own text on this page: from its start mark there, else the page's start, to its end mark)
      const start = [`${m[2]}s`, `t${m[2]}s`, `h${m[2]}s`].flatMap(n => where.get(n) ?? []).find(([p, q]) => p === pa && q < end[1])
      let edge = Infinity
      for (let g = start ? P.points[start[1]].glyph : 0; g < P.points[end[1]].glyph; g++) if (R.glyph[g] === rA && /\S/.test(G.u[g] ?? '')) edge = Math.min(edge, G.x0[g])
      if (edge === Infinity) return null
      let before = null
      for (let j = 0; j < glyphs.length;) {
        let k = j, x0 = Infinity, size = 0
        const y = G.y[glyphs[j][1]]
        while (k < glyphs.length && Math.abs(G.y[glyphs[k][1]] - y) < 0.5 * Math.max(G.size[glyphs[k][1]], G.size[glyphs[j][1]])) { x0 = Math.min(x0, G.x0[glyphs[k][1]]); size = Math.max(size, G.size[glyphs[k][1]]); k++ }
        if (x0 < edge + FOOT_DISPLAY_INDENT * size) return null
        if (before && Math.abs(before.y - y) > FOOT_DISPLAY_GAP * Math.max(before.size, size)) return null
        before = { y, size }
        j = k
      }
      return { how: HOW["open, to its column's end"], glyphs, boxes }
    }
    let e = alone()
    if (e.how === HOW['open, the next mark on another page'] || e.how === HOW['open, the text after it not found']) e = pastColumn() ?? e
    if (e.how === HOW['open, the next mark on another page']) e = footEnd() ?? e
    if (f.group?.length && e.how < OWNED) {
      e = { ...e, how: HOW['open, with the displays after it'] }
      for (const g of f.group) if (!where.has(g)) out.set(g, none(HOW['in the display before it']))
    }
    out.set(name, e)
  }
  return out
}

/** a piece's closing point: a placeholder's (p) or a footnote call's (n) */
const CLOSING = /^[pn]\d+\.\d+b$/
/** a page of nothing, in a window's place for a page the window does not hold */
const EMPTY = Object.freeze({ glyphs: Object.freeze({ n: 0 }), boxes: Object.freeze([]), points: Object.freeze([]), boxAt: new Int32Array(0), view: Object.freeze([0, 0, 0, 0]) })

/**
 * ownedOf a page at a time (the page stream, E2a): the pages added in order, each piece found once every page it may read
 * is in, over a window of the pages held, and each page let go once no piece left to find may read it. A piece is found by
 * its opening point's page, in the pages' order and, on a page, as ownedOf meets them; it may read its own page, the page
 * of its closing point (its destination's, `closing(name)`: the two are one place in TeX's list, \axt@dest), and where it
 * has none, from its point on to the next point in its region (ownedOf's pastColumn; the document's end where there is
 * none); a closing point read on an earlier page than its opening one is put in the window as that one point (marks out
 * of order). What it finds is ownedOf's over the whole document, but that a piece's work is bounded per window (WORK) and
 * that a point read twice on pages apart is told by `twice()` (the caller's to apply: 'a mark set twice'), and a page at a
 * time by `repeats()`; `found()` the least page whose opening points are not all found yet.
 * `follows`, `dropped`: ownedOf's. `add(p, page, take)`: page p (1, 2, … in order), as ownedOf reads a page; `take(name,
 * e, pages)` is called for each piece found, `e` ownedOf's entry, `pages` the window (pages[p - 1] page p) while it is
 * held. `end(take)`: no page after; every piece left is found
 */
export function ownedPages({ follows, dropped = [], closing = () => null }) {
  const held = new Map(), regions = new Map(), counts = new Map(), opened = new Set(), early = new Map()
  /** the point names read a second time since `repeats()` was last asked */
  let fresh = []
  /** pages added, in order; their pieces, each { name, q, close, needPage, stop } */
  const queue = []
  let last = 0
  const seqPoint = name => !BRACKET.test(name) && !NAME_POINT.test(name)
  /** whether page pa's pieces can be found: every page each may read is in */
  const ready = (entry, ended) => {
    if (ended) return true
    for (const x of entry.pieces) {
      if (x.needPage !== null && last < x.needPage && !counts.has(x.close)) return false
      if (x.stop === false) return false
    }
    return true
  }
  /** the first point after (p, q) in region r on the pages held from p to the last: found where one is */
  const stopFrom = (p, q, r) => {
    for (let s = p; s <= last; s++) {
      const P = held.get(s), at = regions.get(s).at
      for (let k = s === p ? q + 1 : 0; k < P.points.length; k++) if (seqPoint(P.points[k].name) && at[k] === r) return true
    }
    return false
  }
  const find = (entry, take) => {
    const pa = entry.p, W = new Array(last).fill(EMPTY)
    for (let p = pa; p <= last; p++) W[p - 1] = held.get(p)
    const mine = new Set(entry.pieces.map(x => x.name))
    for (const x of entry.pieces) {
      const e = early.get(x.close)
      if (e && e[0] < pa && W[e[0] - 1] === EMPTY) W[e[0] - 1] = { ...EMPTY, points: [{ name: x.close, glyph: 0, box: 0 }] }
    }
    const out = ownedOf(W, { follows: name => (mine.has(name) ? follows(name) : null), dropped })
    for (const [name, e] of out) take(name, e, W)
  }
  const drain = (take, ended = false) => {
    while (queue.length && ready(queue[0], ended)) find(queue.shift(), take)
    // the pages no piece left may read
    const low = queue.length ? queue[0].p : last + 1
    for (const p of [...held.keys()]) if (p < low) { held.delete(p); regions.delete(p) }
  }
  return {
    add(p, page, take) {
      if (p !== last + 1) throw new RangeError(`page ${p} added after page ${last}`)
      last = p
      held.set(p, page)
      const R = regionsOf(page)
      regions.set(p, R)
      const pieces = []
      page.points.forEach((pt, q) => {
        const name = pt.name
        const seen = (counts.get(name) ?? 0) + 1
        counts.set(name, seen)
        if (seen === 2) fresh.push(name)
        if (CLOSING.test(name) && !opened.has(`${name.slice(0, -1)}a`) && !early.has(name)) early.set(name, [p, q])
        if (!OPENING.test(name) || opened.has(name)) return
        opened.add(name)
        const f = follows(name)
        if (!f) return
        const close = `${name.slice(0, -1)}b`, at = closing(name)
        // a closing point to wait for (its destination's page; with none known, the document's end), or a stop where it has none
        pieces.push({ name, q, close, needPage: f.closing ? (Number.isInteger(at) ? at : Infinity) : null, stop: f.closing || R.at[q] % 2 !== 1, r: R.at[q] })
      })
      // the stops looked for again with each page: the pieces' pages' and this one's
      for (const entry of [...queue, { p, pieces }]) for (const x of entry.pieces) if (x.stop === false && stopFrom(entry.p, x.q, x.r)) x.stop = true
      queue.push({ p, pieces })
      drain(take)
    },
    end(take) { drain(take, true) },
    /** the point names read more than once, on every page added */
    twice() { return new Set([...counts].filter(([, n]) => n > 1).map(([name]) => name)) },
    /** the point names read a second time since this was last asked, in the order read: `twice()` a page at a time */
    repeats() { const out = fresh; fresh = []; return out },
    /** the least page an opening point still to be found stands on (one past the last page added where none is): every
     *  piece whose opening point stands before it has been taken */
    found() { return queue.length ? queue[0].p : last + 1 },
  }
}

/** where the text `want` begins among the glyphs (indices into `glyphs`, [page, index] of `pages`): the first glyph from
 *  which their characters spell it (a hyphen the text has not passed over, white space never compared, the last glyph's
 *  characters past its end: a ligature), or from which they spell the start of it up to the last glyph (the text runs
 *  to the next point); -1 where it is nowhere */
function textAt(pages, glyphs, want, quotes = false) {
  for (const e of textStarts(pages, glyphs, want, quotes)) return e
  return -1
}

/** textAt where the text after a piece runs to the point its glyphs end at (its unit's next mark; `rest` the whole of that
 *  text as spellOf reads it): the first place textAt would take from which the glyphs to their end spell `rest` exactly, else
 *  textAt's. The first WANT characters of the text after a piece may stand in the piece's own ink first: a display's
 *  \\text{for every} before "For", a URL's dots before the full stop after it (2610.16663v1 p45u229, 2610.21376v1 p9u88) */
function textTo(pages, glyphs, want, rest, quotes) {
  const spelled = glyphs.map(([p, g]) => spellOf(pages[p - 1].glyphs.u[g] ?? ''))
  const at = new Array(glyphs.length)
  let n = 0
  for (let j = 0; j < glyphs.length; j++) { at[j] = n; n += spelled[j].length }
  const all = spelled.join('')
  let first = -1
  for (const e of textStarts(pages, glyphs, want, quotes)) {
    if (first < 0) first = e
    if (n - at[e] === rest.length && all.endsWith(rest)) return e
  }
  return first
}

/** one glyph of any text but none in a text the probe showed (marks.mjs INK_ANY: a formula's glyph no character spells) */
const INK_ANY = '\uFFFC'
/** a glyph's or a text's characters as the split reads them: NFKC, white space out */
const setAs = s => s.normalize('NFKC').replace(/\s/g, '')
/** the glyph after the first of `glyphs` that set `text` whole from their first, character for character (a glyph's own
 *  characters a run of the text's, a blank glyph passed over, INK_ANY one glyph of any text but none), the glyph that completes
 *  it the last; -1 where they do not begin so */
function textedTo(pages, glyphs, text) {
  const want = setAs(text)
  let n = 0
  for (let j = 0; j < glyphs.length && n < want.length; j++) {
    const [p, g] = glyphs[j], t = setAs(pages[p - 1].glyphs.u[g] ?? '')
    if (want[n] === INK_ANY) { if (!t) return -1; n++ } else if (!t) continue
    else if (want.startsWith(t, n) && !want.slice(n, n + t.length).includes(INK_ANY)) n += t.length
    else return -1
    if (n === want.length) return j + 1
  }
  return -1
}
/** where the text after a split's piece begins among `glyphs` from `end` on (textTo with its `rest`, the glyphs running to a
 *  piece of its unit's ends), as an index into `glyphs`; -1 where it is not found, or the piece would own nothing */
function afterText(pages, glyphs, end, S, quotes) {
  const e = textTo(pages, glyphs.slice(end), S.want, S.rest, quotes)
  return e > 0 ? end + e : -1
}
/** whether the glyph at `end` (the first not blank from it) runs on as the word the glyph before it ends: both a letter or a
 *  digit, on one page, on one baseline and at one size (within a twentieth of it) — the macro's text then ended inside its word
 *  (a state its probe's call did not have), and what follows is no other piece's ink alone */
function runsOn(pages, glyphs, end) {
  const word = /[\p{L}\p{N}]/u
  const [p0, g0] = glyphs[end - 1], G0 = pages[p0 - 1].glyphs
  let j = end
  while (j < glyphs.length && !setAs(pages[glyphs[j][0] - 1].glyphs.u[glyphs[j][1]] ?? '')) j++
  if (j >= glyphs.length) return false
  const [p1, g1] = glyphs[j], G1 = pages[p1 - 1].glyphs, a = setAs(G0.u[g0] ?? ''), b = setAs(G1.u[g1] ?? '')
  return p0 === p1 && word.test(a.at(-1) ?? '') && word.test(b[0] ?? '') && Math.abs(G0.y[g0] - G1.y[g1]) < 0.05 * G0.size[g0] && Math.abs(G0.size[g0] - G1.size[g1]) < 0.05 * G0.size[g0]
}

/** each place textAt's text begins at, in order */
function* textStarts(pages, glyphs, want, quotes) {
  // (`quotes`: TeX's quotes as one, a straight one set as a curly one by OT1 and the source's '' read as ”)
  const fold = c => (quotes ? c.replace(/[\u201c\u201d\u201e\u201f\u2033"]/g, '"').replace(/[\u2018\u2019\u201a\u201b\u2032']/g, "'") : c)
  want = fold(want)
  const chars = glyphs.map(([p, g]) => fold(charOf(pages[p - 1].glyphs.u[g])))
  for (let e = 0; e < chars.length; e++) {
    if (!chars[e]) continue
    let w = 0, h = e
    for (; h < chars.length && w < want.length; h++) {
      const c = chars[h]
      if (!c) continue
      // a glyph of several characters (a ligature) may run past the characters looked for
      if (want.startsWith(c, w) || (w + c.length > want.length && c.startsWith(want.slice(w)))) { w += c.length; continue }
      if ((c === '-' || c === '‐') && h > e) continue
      break
    }
    if (w >= want.length || (h === chars.length && w > 0)) yield e
  }
}
