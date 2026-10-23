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
 *   unit, to where that text's first WANT characters (`want`) begin, a hyphen passed over; where none does, the next
 *   mark must be its unit's next one (`ends`), or a later unit's start mark — MARK_DEF sets a unit's end mark before a
 *   display that ends it — and then what stands on that mark's line before it is that unit's label (a heading's number,
 *   an item's mark), not the piece's; or, where that mark is outside the bodies (a footnote's), the column's body's end;
 *   no unmarked visible piece may come between (`blocked`). Nothing at all before the
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
 * A name set twice owns nothing, nor where the work is past its bound
 */
export function ownedOf(pages, { follows, dropped = [] }) {
  const twice = new Set(dropped)
  const regions = pages.map(regionsOf)
  // every point by its name, in stream order: [page, index]; the mark points in stream order (brackets and names apart)
  const where = new Map(), seq = []
  pages.forEach((p, i) => p.points.forEach((pt, q) => {
    const list = where.get(pt.name)
    if (list) list.push([i + 1, q]); else where.set(pt.name, [[i + 1, q]])
    if (!BRACKET.test(pt.name) && !NAME_POINT.test(pt.name)) seq.push([i + 1, q])
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
    if (closes.length) {
      const [pb, qb] = closes[0]
      if (pb < pa || (pb === pa && qb < qa)) { out.set(name, none(HOW['marks out of order'])); continue }
      if (regions[pb - 1].at[qb] !== rA) { out.set(name, none(HOW['its marks in two regions'])); continue }
      if (pb !== pa && rA % 2 === 0) { out.set(name, none(HOW['across a page, unbracketed'])); continue }
      const { glyphs, boxes } = takeTo([pb, qb])
      out.set(name, jumps(glyphs) ? none(HOW['across a column, unbracketed']) : { how: HOW.closed, glyphs, boxes })
      continue
    }
    if (f.closing) { out.set(name, none(HOW['closing point not read'])); continue }
    /** an opening point alone: to the next mark's point, on its page */
    const alone = () => {
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
      const { glyphs, boxes } = takeTo(next)
      if (jumps(glyphs)) return none(HOW['across a column, unbracketed'])
      if (!glyphs.length && !boxes.length) return { how: HOW[f.want ? 'open, to the text after it' : "open, to its unit's next mark"], glyphs, boxes }
      if (!f.want) {
        const later = START.exec(N.name)
        if (f.blocked) return none(HOW['open, an unmarked piece follows'])
        if (f.ends.includes(N.name)) return { how: HOW["open, to its unit's next mark"], glyphs, boxes }
        if (later && Number(later[1]) > Number(m[2])) {
          // the next unit's label: the glyphs on its start mark's line before it, the boxes after the first of them
          const G = P.glyphs, after = N.glyph
          let end = glyphs.length
          while (after < G.n && end > 0 && Math.abs(G.y[glyphs[end - 1][1]] - G.y[after]) < 0.5 * Math.max(G.size[glyphs[end - 1][1]], G.size[after])) end--
          const upTo = end < glyphs.length ? P.boxAt[glyphs[end][1]] : N.box
          return { how: HOW["open, to its unit's next mark"], glyphs: glyphs.slice(0, end), boxes: boxes.filter(([, b]) => b < upTo) }
        }
        return none(HOW["open, the next mark not its unit's"])
      }
      const end = textAt(pages, glyphs, f.want)
      if (end < 0) return none(HOW['open, the text after it not found'])
      if (end === 0) return none(HOW['open, nothing before the text after it'])
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
        const end = textAt(pages, glyphs, f.want)
        return end > 0 ? cut(HOW["open, past its column's end"], glyphs, boxes, end) : null
      }
      if (f.blocked) return null
      // with no text after it: to its body's end, or through to its unit's next mark where that is its stop
      const stopName = stop ? pages[stop[0] - 1].points[stop[1]].name : null
      const through = stopName !== null && f.ends.includes(stopName)
      const { glyphs, boxes } = takeTo(through ? stop : E)
      return { how: HOW[through ? "open, past its column's end" : "open, to its column's end"], glyphs, boxes }
    }
    let e = alone()
    if (e.how === HOW['open, the next mark on another page'] || e.how === HOW['open, the text after it not found']) e = pastColumn() ?? e
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
function textAt(pages, glyphs, want) {
  const chars = glyphs.map(([p, g]) => charOf(pages[p - 1].glyphs.u[g]))
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
