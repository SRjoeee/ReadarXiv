// Each placeholder's own ink in the marked compile, by content-stream order (Plan 8b, Task 6b; spec §4.2; the stream
// ownership spike of 2026-10-06). LAYOUT_TEX sets a point, `/axt-<name> ri`, beside each destination it sets
// (layout/marks.mjs), and points around each column's body (bs<n>, be<n>, in \@makecol) and each float's box (fs<n>,
// fe<n>); pageInk reads them in order among the glyphs and the boxes (layout/ink.mjs). A piece's own ink is what the
// content stream shows between its two points: every glyph and rule TeX set for it, its scripts, limits, bars and
// radicals, and nothing of its neighbours', where geometry can only guess. What TeX ships between two points that is
// not the piece's — a page's footnotes and their rule, its running foot and the next page's head, a float shipped in
// mid-paragraph or at a column's head — lies outside the region of its opening point, and is cut: a region is in a
// column's body or not, at a depth of floats.
// Imports nothing: pure arithmetic over what pageInk read.

/** how a piece's ink was found, or why none was: the first OWNED are owned (its glyphs and rules, maybe none), the rest
 *  are not, and the maker writes the piece LOST */
export const OWNED_HOW = Object.freeze([
  'closed',
  'open, to the text after it',
  "open, to its unit's next mark",
  "open, to its column's end",
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
export const OWNED = 4
const HOW = Object.fromEntries(OWNED_HOW.map((h, i) => [h, i]))
/** a bracket's point: a column's body (b) or a float's box (f), its start (s) or end (e), by a number */
const BRACKET = /^([bf])([se])\d+$/
/** a piece's opening point: a placeholder's (p) or a footnote call's (n), by its unit and source piece index */
const OPENING = /^([pn])(\d+)\.(\d+)a$/
/** a unit's start mark: MARK_DEF's, a cell's, a heading's */
const START = /^[th]?(\d+)s$/
/** a range in a region outside the column bodies (an output routine of its own: REVTeX's, multicol's) that goes from
 *  low on a page to high on it, and right by this share of the page's width and up by this share of its height, crossed
 *  into the next column: what TeX shipped between is in it, and cannot be told apart */
const JUMP_X = 0.25, JUMP_Y = 0.25
/** the characters of the text after an opening point alone that it is found by */
export const WANT = 8
/** the glyph visits a paper's ownership may cost: real ranges never overlap, and cost the glyphs once */
const WORK = 20_000_000

/** a region's code: in a column's body or not, at a depth of floats */
const code = (body, depth) => depth * 2 + (body ? 1 : 0)
/** a glyph's character as the text after a piece is compared with it: NFKC, lower case, no white space, no variation
 *  selector */
const charOf = u => u.normalize('NFKC').toLowerCase().replace(/\s|\p{Variation_Selector}/gu, '')

/** each page's regions: of each glyph, of each box, at each point; every page begins outside any body */
function regionsOf(page) {
  const { glyphs, points } = page, nBoxes = page.boxes.length / 4
  const glyph = new Int32Array(glyphs.length), box = new Int32Array(nBoxes), at = new Int32Array(points.length)
  let body = false, depth = 0, bodies = false
  const apply = name => {
    const m = BRACKET.exec(name)
    if (!m) return
    if (m[1] === 'b') { body = m[2] === 's'; bodies = true } else depth = m[2] === 's' ? depth + 1 : Math.max(0, depth - 1)
  }
  for (let q = 0, g = 0; g <= glyphs.length; g++) {
    while (q < points.length && points[q].glyph <= g) { apply(points[q].name); at[q] = code(body, depth); q++ }
    if (g < glyphs.length) glyph[g] = code(body, depth)
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
 * by page (1-based at index 0), what pageInk read of the marked compile, with each page's view; `follows(name)`, for an
 * opening point's name, what the marking says of its piece ({ closing, want, ends, blocked }, Follow), or null for a
 * name that is no piece of a unit; `dropped`, the names the log reports set twice.
 * - Two points: the glyphs and boxes between them in the opening point's region; on another page only where it is a
 *   column's body (else what TeX shipped between cannot be cut: unbracketed), the two in one region; outside the
 *   bodies, not across a column (JUMP_X, JUMP_Y). A closing point expected (`closing`) and not read: none.
 * - An opening point alone: to the next mark's point on its page, in its region; where text follows the piece in its
 *   unit, to where that text's first WANT characters (`want`) begin, a hyphen passed over; where none does, the next
 *   mark must be its unit's next one (`ends`), or a later unit's start mark — MARK_DEF sets a unit's end mark before a
 *   display that ends it — and then what stands on that mark's line before it is that unit's label (a heading's number,
 *   an item's mark), not the piece's; or, where that mark is outside the bodies (a footnote's), the column's body's end;
 *   no unmarked visible piece may come between (`blocked`). Nothing at all before the
 *   next point is a piece of nothing; nothing before the text after it, with glyphs there, is none (REVTeX sets the
 *   punctuation after a citation before its number).
 * A name set twice owns nothing, nor where the work is past its bound
 */
export function ownedOf(pages, { follows, dropped = [] }) {
  const twice = new Set(dropped)
  const regions = pages.map(regionsOf)
  // every point by its name, in stream order: [page, index]; the mark points in stream order (brackets apart)
  const where = new Map(), seq = []
  pages.forEach((p, i) => p.points.forEach((pt, q) => {
    const list = where.get(pt.name)
    if (list) list.push([i + 1, q]); else where.set(pt.name, [[i + 1, q]])
    if (!BRACKET.test(pt.name)) seq.push([i + 1, q])
  }))
  const rank = new Map()
  seq.forEach(([p, q], r) => rank.set(`${p}|${q}`, r))
  const out = new Map()
  let work = 0
  const none = how => ({ how, glyphs: [], boxes: [] })
  for (const [name, list] of where) {
    const m = OPENING.exec(name)
    if (!m) continue
    const f = follows(name)
    if (!f) continue
    const close = `${name.slice(0, -1)}b`, closes = where.get(close) ?? []
    if (list.length > 1 || closes.length > 1 || twice.has(name) || twice.has(close)) { out.set(name, none(HOW['a mark set twice'])); continue }
    if (work > WORK) { out.set(name, none(HOW['past the glyphs a paper may own'])); continue }
    const [pa, qa] = list[0], A = pages[pa - 1].points[qa], rA = regions[pa - 1].at[qa]
    const glyphs = [], boxes = []
    /** the glyphs and boxes of page p from (g0, b0) to (g1, b1) in A's region */
    const take = (p, g0, g1, b0, b1) => {
      const R = regions[p - 1]
      work += g1 - g0 + b1 - b0
      for (let g = g0; g < g1; g++) if (R.glyph[g] === rA) glyphs.push([p, g])
      for (let b = b0; b < b1; b++) if (R.box[b] === rA) boxes.push([p, b])
    }
    /** a jump from low on a page to high and right on it, outside the bodies: across a column */
    const jumps = () => {
      if (rA !== 0) return false
      for (let j = 1; j < glyphs.length; j++) {
        const [p, g] = glyphs[j], [o, h] = glyphs[j - 1]
        if (p !== o) continue
        const P = pages[p - 1], v = P.view, a = P.glyphs[h], b = P.glyphs[g]
        if (b.y - a.y > JUMP_Y * (v[3] - v[1]) && b.x0 - a.x0 > JUMP_X * (v[2] - v[0])) return true
      }
      return false
    }
    if (closes.length) {
      const [pb, qb] = closes[0], B = pages[pb - 1].points[qb]
      if (pb < pa || (pb === pa && qb < qa)) { out.set(name, none(HOW['marks out of order'])); continue }
      if (regions[pb - 1].at[qb] !== rA) { out.set(name, none(HOW['its marks in two regions'])); continue }
      if (pb !== pa && rA % 2 === 0) { out.set(name, none(HOW['across a page, unbracketed'])); continue }
      for (let p = pa; p <= pb; p++) {
        const P = pages[p - 1]
        take(p, p === pa ? A.glyph : 0, p === pb ? B.glyph : P.glyphs.length, p === pa ? A.box : 0, p === pb ? B.box : P.boxes.length / 4)
      }
      out.set(name, jumps() ? none(HOW['across a column, unbracketed']) : { how: HOW.closed, glyphs, boxes })
      continue
    }
    if (f.closing) { out.set(name, none(HOW['closing point not read'])); continue }
    // an opening point alone: to the next mark's point, on its page
    const next = seq[(rank.get(`${pa}|${qa}`) ?? -2) + 1]
    if (!next || next[0] !== pa) { out.set(name, none(HOW['open, the next mark on another page'])); continue }
    const P = pages[pa - 1], N = P.points[next[1]]
    // nothing after it in its unit, its next mark outside the bodies (a footnote's, shipped below its column): the piece
    // ends with its column's body, where no body begins again before that mark
    if (!f.want && rA % 2 === 1 && regions[pa - 1].at[next[1]] % 2 === 0) {
      let E = null
      for (let q = qa + 1; q < next[1]; q++) { const n = P.points[q].name; if (/^be\d+$/.test(n)) E = P.points[q]; else if (/^bs\d+$/.test(n)) E = null }
      if (E) {
        take(pa, A.glyph, E.glyph, A.box, E.box)
        out.set(name, f.blocked && (glyphs.length || boxes.length) ? none(HOW['open, an unmarked piece follows']) : { how: HOW["open, to its column's end"], glyphs, boxes })
        continue
      }
    }
    take(pa, A.glyph, N.glyph, A.box, N.box)
    if (jumps()) { out.set(name, none(HOW['across a column, unbracketed'])); continue }
    if (!glyphs.length && !boxes.length) { out.set(name, { how: HOW[f.want ? 'open, to the text after it' : "open, to its unit's next mark"], glyphs, boxes }); continue }
    if (!f.want) {
      const later = START.exec(N.name)
      if (f.blocked) out.set(name, none(HOW['open, an unmarked piece follows']))
      else if (f.ends.includes(N.name)) out.set(name, { how: HOW["open, to its unit's next mark"], glyphs, boxes })
      else if (later && Number(later[1]) > Number(m[2])) {
        // the next unit's label: the glyphs on its start mark's line before it, the boxes after the first of them
        const after = P.glyphs[N.glyph], size = g => P.glyphs[g].size
        let end = glyphs.length
        while (after && end > 0 && Math.abs(P.glyphs[glyphs[end - 1][1]].y - after.y) < 0.5 * Math.max(size(glyphs[end - 1][1]), after.size)) end--
        const upTo = end < glyphs.length ? P.boxAt[glyphs[end][1]] : N.box
        out.set(name, { how: HOW["open, to its unit's next mark"], glyphs: glyphs.slice(0, end), boxes: boxes.filter(([, b]) => b < upTo) })
      } else out.set(name, none(HOW["open, the next mark not its unit's"]))
      continue
    }
    const end = textAt(P, glyphs, f.want)
    if (end < 0) { out.set(name, none(HOW['open, the text after it not found'])); continue }
    if (end === 0) { out.set(name, none(HOW['open, nothing before the text after it'])); continue }
    const upTo = end < glyphs.length ? P.boxAt[glyphs[end][1]] : N.box
    out.set(name, { how: HOW['open, to the text after it'], glyphs: glyphs.slice(0, end), boxes: boxes.filter(([, b]) => b < upTo) })
  }
  return out
}

/** where the text `want` begins among the glyphs (indices into `glyphs`, all of page P): the first glyph from which
 *  their characters spell it (a hyphen the text has not passed over, white space never compared, the last glyph's
 *  characters past its end: a ligature), or from which they spell the start of it up to the last glyph (the text runs
 *  to the next point); -1 where it is nowhere */
function textAt(P, glyphs, want) {
  const chars = glyphs.map(([, g]) => charOf(P.glyphs[g].u))
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
    if (w >= want.length || (h === chars.length && w > 0)) return e
  }
  return -1
}
