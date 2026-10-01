// The highlight's floats: a table, an algorithm or a figure lit whole with its caption, on both sides (the maintainer's
// decision of 2026-10-01; round 1 of the highlight, T1 and T3). Pure — no DOM — so that the reader and the Node probes
// run the same code; the reader gives it what PDF.js draws a page by (its operator list) on the page's first drawing.
//
// A page's floats are made from its geometry (highlight.mjs pageGeometry: its lines, who owns each word, each caption's
// runs), its figures (figures.mjs figureRegions: the forms and images placed on it) and its paths (pathsOf: the rules
// and the other marks drawn on it outside any form). Each figure is given to its nearest caption only — the one just
// below it first, as the reader's captionNear does (a table's caption below a figure took that figure, round 1). From
// each caption a walk goes away from it, nearest first, over what lies across it: the lines no running text owns (a
// table's rows, an algorithm's, a figure's labels), the figures that are its own or no caption's, the marks drawn there
// (a chart's bars, a diagram's boxes), and the rules among them; it stops at the first line that is another's (running
// text, another caption), at another caption's figure, or at a gap, and goes no further than its own last rule: the rule
// just past its last line is its own, one a float's skip further on is the next float's (round 1's table I reached into
// the next column's algorithm title). A float that holds a figure or a drawing is a figure, outlined; one of text and
// rules is a table (or an algorithm), washed. The float is the caption's: it lights by the caption's id, which both
// sides share.

import { blockOf, pageGeometry } from './highlight.mjs'

/** kinds of unit a float holds: a table's cells, a drawing's text (TikZ); its walk goes on over them */
const HELD = new Set(['cell', 'figure'])
/** a rule is a painted path at most THIN across and at least RULE_H long (horizontal) or RULE_V tall (vertical) */
const THIN = 2, RULE_H = 20, RULE_V = 8
/** the walk from a caption, in its lines' heights: the first item within FIRST of the caption, each next one within
 *  GAP of the last; a rule past the last line within TRAIL of it (or of the rule before) is the float's own */
const FIRST = 2.5, GAP = 1.5, TRAIL = 0.8
/** from a figure's edge the walk reaches this share of its height (the rows of a grid of images, 2608.12502's figures 4
 *  and 5) */
const PANELS = 0.25
/** how far into the other column a column float's line or mark may reach (an overfull line, as highlight.mjs OVERHANG) */
const SPILL = 6
/** a float of text needs at least this many lines, a drawing this many marks (a stray line next to a caption is no
 *  table) */
const MIN_LINES = 2
/** a float is a drawing when the marks outside its text cover this share of it */
const DRAWN = 0.03

const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]

/**
 * A page's paths drawn at the page's level, in PDF units: `rules` [{ x0, y0, x1, y1, v }] — the thin filled or stroked
 * ones, `v` a vertical one (a table's \toprule, \midrule, \hline and its |, an algorithm's rules) — and `marks`, the
 * others (a chart's bars, a diagram's shapes, a cell's colour). Not inside a form (a figure's own lines) nor an
 * annotation. From the operator list PDF.js draws the page by: in PDF.js 6 a path is one constructPath whose args are
 * [op, data, minMax], minMax its box in the path's own space, under the transform in force (the CTM tracked through
 * save, restore and transform); a stroke's box widened by half the line width; a clip (endPath) paints nothing
 */
export function pathsOf({ fnArray, argsArray }, OPS) {
  const rules = [], marks = []
  let ctm = [1, 0, 0, 1, 0, 0], lw = 1, depth = 0
  const stack = []
  for (let k = 0; k < fnArray.length; k++) {
    const fn = fnArray[k]
    if (fn === OPS.save) stack.push([ctm, lw])
    else if (fn === OPS.restore) [ctm, lw] = stack.pop() ?? [ctm, lw]
    else if (fn === OPS.transform) ctm = mul(ctm, argsArray[k])
    else if (fn === OPS.setLineWidth) lw = argsArray[k][0]
    else if (fn === OPS.paintFormXObjectBegin || fn === OPS.beginAnnotation) { stack.push([ctm, lw]); depth++ }
    else if (fn === OPS.paintFormXObjectEnd || fn === OPS.endAnnotation) { [ctm, lw] = stack.pop() ?? [ctm, lw]; depth-- }
    else if (fn === OPS.constructPath && depth === 0) {
      const [op, , mm] = argsArray[k]
      // a path of moves alone keeps PDF.js's empty box, [Infinity, Infinity, −Infinity, −Infinity]
      if (!mm || op === OPS.endPath || !(mm[2] >= mm[0] && mm[3] >= mm[1])) continue
      const e = op === OPS.fill || op === OPS.eoFill ? 0 : lw / 2
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const [x, y] of [[mm[0] - e, mm[1] - e], [mm[2] + e, mm[1] - e], [mm[0] - e, mm[3] + e], [mm[2] + e, mm[3] + e]]) {
        const X = ctm[0] * x + ctm[2] * y + ctm[4], Y = ctm[1] * x + ctm[3] * y + ctm[5]
        if (X < x0) x0 = X
        if (X > x1) x1 = X
        if (Y < y0) y0 = Y
        if (Y > y1) y1 = Y
      }
      if (y1 - y0 <= THIN && x1 - x0 >= RULE_H) rules.push({ x0, y0, x1, y1, v: false })
      else if (x1 - x0 <= THIN && y1 - y0 >= RULE_V) rules.push({ x0, y0, x1, y1, v: true })
      else marks.push({ x0, y0, x1, y1 })
    }
  }
  return { rules, marks }
}

/** whether a page has a caption, and so may have floats: a page without one needs no operator list */
export function wantsFloats(L, p) {
  return !!L?.unitsOn[p]?.some(id => L.kindOf(id) === 'caption')
}

const overlapX = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
const overlapY = (a, b) => Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
const union = rs => {
  const u = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const r of rs) { if (r.x0 < u.x0) u.x0 = r.x0; if (r.y0 < u.y0) u.y0 = r.y0; if (r.x1 > u.x1) u.x1 = r.x1; if (r.y1 > u.y1) u.y1 = r.y1 }
  return u
}
/** the first index of a list, ordered so that `ok` is false and then true, where `ok` holds */
function firstAt(xs, ok) {
  let lo = 0, hi = xs.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (ok(xs[mid])) hi = mid; else lo = mid + 1 }
  return lo
}
const within = (r, g, e = 1) => r.x0 >= g.x0 - e && r.x1 <= g.x1 + e && r.y0 >= g.y0 - e && r.y1 <= g.y1 + e
const inside = (x, y, r) => x >= r.x0 - 1 && x <= r.x1 + 1 && y >= r.y0 - 1 && y <= r.y1 + 1

/**
 * The caption a figure (a rectangle, PDF units) goes to among a page's captions — [{ id, x0, x1, top, bottom, h, col }]:
 * their extent across, the top of their first line and the foot of their last on the page (NaN where it is on another),
 * their line's height and their column — or null. Within 3 of the caption's lines + 24 of the figure: one whose own
 * extent overlaps the figure across before one only sharing its column; just below it before just above it; the
 * nearest (a figure's own caption before the next float's under it, round 1's 06701 page 6); of captions in a row, as
 * near (within a unit), the one overlapping it most, then the one whose middle is nearer (subfigures side by side over
 * their subcaptions, two minipages' figures: each took the first caption of the row, the review of B4). The reader's
 * captionNear asks the same
 */
export function captionFor(r, caps) {
  let best = null
  for (const c of caps) {
    const over = Math.min(r.x1, c.x1) - Math.max(r.x0, c.x0)
    if (over <= 0 && overlapX(r, c.col) <= 0) continue
    const near = 3 * c.h + 24, down = r.y0 - c.top, up = c.bottom - r.y1
    const below = down > -2 && down < near, above = up > -2 && up < near
    if (!below && !above) continue
    const k = { across: over > 0 ? 0 : 1, side: below ? 0 : 1, gap: below ? down : up, over, mid: Math.abs((r.x0 + r.x1) / 2 - (c.x0 + c.x1) / 2) }
    if (!best || nearer(k, best.k)) best = { c, k }
  }
  return best?.c ?? null
}
const nearer = (k, b) => {
  if (k.across !== b.across) return k.across < b.across
  if (k.side !== b.side) return k.side < b.side
  if (Math.abs(k.gap - b.gap) > 1) return k.gap < b.gap
  if (k.over !== b.over) return k.over > b.over
  return k.mid < b.mid
}

/**
 * A page's floats, made once and kept on the layout: [{ id, page, kind: 'figure' | 'table', region, members, lead }]
 * — `id` the caption's, `region` the float's extent without its caption (PDF units), `members` the units it holds (its
 * cells, a drawing's text), `lead` the caption's half leading (the pad above and below). `regions` the page's figures
 * (figureRegions), `paths` its paths (pathsOf)
 */
export function pageFloats(L, p, regions = [], { rules = [], marks = [] } = {}) {
  const known = (L.floats ??= new Map())
  if (known.has(p)) return known.get(p)
  const g = pageGeometry(L, p), P = L.page[p], { lines, lineOf, owner, k0 } = g.at
  // each line: whether a unit of running text owns a word of it (a stop for every walk), and the captions that do
  const running = new Uint8Array(lines.length), capsOn = new Map()
  for (let i = 0, last = -1, kind; i < owner.length; i++) {
    const o = owner[i]
    if (o === -1) continue
    if (o !== last) { kind = L.kindOf(o); last = o }
    if (kind === 'caption') { const j = lineOf[i]; (capsOn.get(j) ?? capsOn.set(j, new Set()).get(j)).add(o) } else if (!HELD.has(kind)) running[lineOf[i]] = 1
  }
  const caps = []
  for (const [id, runs] of g.byId) {
    if (L.kindOf(id) !== 'caption' || !runs.length) continue
    const box = union(runs.map(r => ({ x0: r.x0, x1: r.x1, y0: r.bottom, y1: r.top })))
    const row = runs[0].rows[0]
    const side = runs[0].col
    caps.push({ id, runs, box, h: row.y1 - row.y0, lead: runs[0].lead, col: P.cols[side] ?? P.cols.F, side, other: side === 'L' ? P.cols.R : side === 'R' ? P.cols.L : null })
  }
  if (!caps.length) { known.set(p, []); return [] }
  // each figure to its caption (captionFor): a subfigure to its subcaption, figures in a row each to the caption under it
  const near = caps.map(c => ({ id: c.id, x0: c.box.x0, x1: c.box.x1, top: c.box.y1, bottom: c.box.y0, h: c.h, col: c.col }))
  const figOf = new Map()
  regions.forEach((r, k) => { const c = captionFor(r, near); if (c) figOf.set(k, c.id) })
  // what lies on the page, once for every caption's walk: each line (a free one inside a figure is the figure's; a
  // caption's, `cap`, is a stop for the others' walks), each figure, each mark, each horizontal rule
  const items = []
  lines.forEach((l, i) => {
    const caps = capsOn.get(i), cap = caps ? caps.values().next().value : null, free = !running[i] && cap === null
    if (free && regions.length && regions.some(r => within(l, r))) return
    items.push({ i, x0: l.x0, x1: l.x1, y0: l.y0, y1: l.y1, lo: l.lo, hi: l.hi, what: free ? 'line' : 'stop', cap, caps: caps ? [...caps] : null, running: !!running[i] })
  })
  regions.forEach((r, k) => items.push({ x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1, lo: r.y0, hi: r.y1, what: 'figure', fig: k }))
  for (const m of marks) items.push({ ...m, lo: m.y0, hi: m.y1, what: 'mark' })
  for (const r of rules) if (!r.v) items.push({ ...r, lo: r.y0, hi: r.y1, what: 'rule' })
  // nothing outside the text block is a float's: a running head, a page number
  const frame = frameOf(L, p)
  for (let i = items.length - 1; i >= 0; i--) if (items[i].y0 > frame.y1 + 1 || items[i].y1 < frame.y0 - 1) items.splice(i, 1)
  // in the order the walks meet them: down from the top, up from the foot
  const byTop = [...items].sort((a, b) => b.y1 - a.y1), byFoot = [...items].sort((a, b) => a.y0 - b.y0)
  // each caption's own figures, and its box: a main caption takes the subcaptions over (or under) it with their panels
  const figsOf = new Map()
  for (const [k, id] of figOf) (figsOf.get(id) ?? figsOf.set(id, []).get(id)).push(regions[k])
  const boxOf = new Map(caps.map(c => [c.id, c.box]))
  const ctx = { byTop, byFoot, figOf, figsOf, boxOf, at: { k0, lineOf, owner }, capsOn, tokens: id => L.anchors.get(id)?.tokens ?? [] }
  // each caption's walks, best first: toward its own figures where it has some; else the one holding its neighbour in
  // the page's stream (TeX sets a float's caption and its body in the order the source has them); else, the stream
  // setting it between two (a caption between two tables, or under a listing), the one under it — a table's caption
  // and an algorithm's stand over them, a figure's are told by their figures
  const options = new Map()
  for (const c of caps) {
    const ws = [walk(c, -1, ctx), walk(c, 1, ctx)].filter(enough).sort((a, b) => (b.own - a.own) || (b.adjacent - a.adjacent) || (a.dir - b.dir))
    if (ws.length) options.set(c, ws)
  }
  // two captions walking into each other (one stopped by the other, the other stopped by it or crossing its walk): one
  // turns to its other walk where that crosses nothing of the first's (a caption between two tables, set next to both
  // in the stream), else what lies between them parts (a table above a figure, its caption above it and the figure's
  // below), each keeping what the stream sets next to it and its own figures, at the widest gap
  const crosses = (a, b) => a.got.some(q => b.got.includes(q))
  for (const [c, [w]] of options) {
    const d = caps.find(x => x.id === w.stop), v = d && options.get(d)?.[0]
    if (!v || !(v.stop === c.id || crosses(v, w)) || v.dir === w.dir || options.get(c)[0] !== w || (v.stop === c.id && c.id > d.id)) continue
    const turn = [[d, w], [c, v]].find(([x, other]) => options.get(x)[1] && !crosses(options.get(x)[1], other))
    if (turn) { options.set(turn[0], options.get(turn[0]).slice(1)); continue }
    const [a, b] = split(c, w, d, v, ctx)
    for (const [x, y] of [[c, a], [d, b]]) { const ws = options.get(x).slice(1); if (enough(y)) ws.unshift(y); if (ws.length) options.set(x, ws); else options.delete(x) }
  }
  // an item is one float's: the captions with their own figures first, then those with fewer walks to choose from,
  // each taking its best walk that crosses none taken, else its best one up to where another has been
  // (a main caption shares its parts' items: its subcaptions' and their panels; the subfigures go first)
  const claimedBy = new Map()
  const out = []
  const order = [...options].sort(([, a], [, b]) => (b[0].own - a[0].own) || (a[0].parts.size - b[0].parts.size) || (a.length - b.length))
  for (const [c, ws] of order) {
    const others = parts => new Set([...claimedBy].filter(([, id]) => !parts.has(id)).map(([q]) => q))
    let w = ws.find(w => w.got.every(q => !claimedBy.has(q) || w.parts.has(claimedBy.get(q))))
    if (!w) { w = walk(c, ws[0].dir, ctx, others(ws[0].parts)); if (!enough(w)) continue }
    // no running text inside a float: where its extent holds a line of another's (a box drawn round paragraphs, a line
    // beside the float the walk passed before the float widened to it), it ends before that line
    let region = regionOf(c, w, rules)
    for (let n = 0; n < 3; n++) {
      const down = w.dir < 0, foreign = byTop.filter(q => q.what === 'stop' && !q.caps?.every(id => id === c.id || w.parts.has(id)) && inside((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2, region))
      if (!foreign.length) break
      const limit = down ? Math.max(...foreign.map(q => q.y1)) : Math.min(...foreign.map(q => q.y0))
      w = walk(c, w.dir, ctx, others(w.parts), limit)
      region = enough(w) ? regionOf(c, w, rules) : null
      if (!region) break
    }
    if (!region) continue
    for (const q of w.got) if (!claimedBy.has(q)) claimedBy.set(q, c.id)
    // what it holds: the cells and a drawing's text inside it
    const members = new Set()
    for (const [id, runs] of g.byId) if (HELD.has(L.kindOf(id)) && runs.every(r => inside((r.x0 + r.x1) / 2, (r.top + r.bottom) / 2, region))) members.add(id)
    // a float holding a drawing's text (TikZ, set on the page with no form) is a figure: its boxes round its words and
    // its arrows (rules) leave too little drawn outside the text to tell (the review of B4, I3)
    const drawing = [...members].some(id => L.kindOf(id) === 'figure')
    out.push({ id: c.id, page: p, kind: drawing ? 'figure' : floatKind(w, region), region, members, parts: w.parts, lead: c.lead })
  }
  known.set(p, out)
  return out
}

/**
 * The text block's top and foot on a page: the units' lines' extent, the document's for pages of its size (a page
 * whose top is a float has its first line lower; two-sided classes move the block across, not up or down) — the third
 * highest top and third lowest foot over those pages (with fewer pages, fewer left out: the second under eight, the
 * outermost under four), so that a word matched astray (in a running head) does not move it. Made once a layout
 */
function frameOf(L, p) {
  const frames = (L.frames ??= new Map()), key = L.page[p].size
  if (frames.has(key)) return frames.get(key)
  const tops = new Map(), feet = new Map()
  for (const a of L.anchors.values()) for (const r of a?.rects ?? []) {
    const Q = L.page[r.page]
    if (Q?.size !== key) continue
    if (!(tops.get(r.page) >= r.y1)) tops.set(r.page, r.y1)
    if (!(feet.get(r.page) <= r.y0)) feet.set(r.page, r.y0)
  }
  const nth = (xs, desc) => { const s = [...xs].sort((a, b) => (desc ? b - a : a - b)); return s[Math.min(2, s.length >> 2)] }
  const f = tops.size ? { y0: nth(feet.values(), false), y1: nth(tops.values(), true) } : { y0: -Infinity, y1: Infinity }
  frames.set(key, f)
  return f
}

/** a walk holds a float: a figure, or lines enough, or marks enough (a drawing) */
const enough = w => w.got.some(q => q.what === 'figure') || w.got.filter(q => q.what === 'line').length >= MIN_LINES || w.got.filter(q => q.what === 'mark').length >= MIN_LINES

/**
 * A caption's walk away from itself, downward (dir −1) or upward (+1): nearest first, the items across what it has
 * taken so far (the caption at first; a table's rules widen it to the table), the free lines, the marks, the figures
 * that are the caption's or no caption's, the rules among them — up to a gap, or the first line or figure that is
 * another's (`stop`: the caption it was, if one). `skip`: items another float has; `limit`: a height it does not pass.
 * { dir, got, rules, stop, own, adjacent }: `own` whether it holds one of the caption's figures, `adjacent` whether it holds the caption's
 * neighbour in the page's stream on its side (the line set just after the caption for the walk down, just before it
 * for the walk up)
 */
function walk(c, dir, { byTop, byFoot, figOf, figsOf, boxOf, at, capsOn, tokens }, skip = null, limit = null) {
  const h = c.h, down = dir < 0, order = down ? byTop : byFoot
  const got = [], rules = [], range = { x0: c.box.x0, x1: c.box.x1 }, parts = new Set()
  // subcaptions in a row, each of its own figures and set between this caption and them (subfigures over their
  // subcaptions, the main caption under them): this caption's parts, where this caption has no figure of its own and the
  // walk meets them first, and goes on meeting rows of them (a grid of subfigures). A single caption so met is the next
  // float's (a figure's caption over a table's)
  const bare = !figsOf.has(c.id)
  const partOf = id => bare && figsOf.get(id)?.every(f => (down ? f.y1 <= boxOf.get(id).y0 + 2 : f.y0 >= boxOf.get(id).y1 - 2))
  const inRow = id => { const b = boxOf.get(id); let n = 0; for (const [j, o] of boxOf) if (j !== id && Math.abs(o.y1 - b.y1) <= 2 && overlapX(o, b) <= 0 && partOf(j)) n++; return n > 0 }
  // the items past the caption's edge on this side: byTop falls by top, byFoot rises by foot
  const from = down ? firstAt(byTop, q => q.y1 <= c.box.y0 + 1) : firstAt(byFoot, q => q.y0 >= c.box.y1 - 1)
  let pending = [], edge = down ? c.box.y0 : c.box.y1, stop = null, wall = null, reach = FIRST * h, fig = null
  const widen = q => { if (q.x0 < range.x0) range.x0 = q.x0; if (q.x1 > range.x1) range.x1 = q.x1 }
  for (let k = from; k < order.length; k++) {
    const q = order[k]
    if (q.caps?.includes(c.id) || overlapX(q, range) <= 0) continue
    // at a figure's edge, as far as a quarter of its height: the space between a grid's rows of images
    const far = fig && (down ? edge >= fig.y0 - 1 : edge <= fig.y1 + 1) ? Math.max(reach, (fig.y1 - fig.y0) * PANELS) : reach
    if ((down ? edge - q.y1 : q.y0 - edge) > far || (limit !== null && (down ? q.y0 < limit : q.y1 > limit))) break
    const theirs = q.what === 'figure' && figOf.has(q.fig) && figOf.get(q.fig) !== c.id && !parts.has(figOf.get(q.fig))
    if (q.what === 'stop' && q.caps && !q.running && (parts.size || !got.length) && q.caps.every(id => parts.has(id) || (partOf(id) && inRow(id)))) {
      for (const id of q.caps) parts.add(id)
      got.push(q); widen(q)
      edge = down ? Math.min(edge, q.y0) : Math.max(edge, q.y1)
      continue
    }
    // on a page of two columns, a line or a mark reaching past what the walk has into the other column's text is not a
    // column float's (a title block across the page over a column's figure, 2608.06701's first page); a rule may (a
    // float across the page of two parts, each with its caption, 2608.02163's tables 3 and 4)
    const across = (q.what === 'line' || q.what === 'mark') && (c.side === 'L' ? q.x1 > range.x1 + 1 && q.x1 > c.other.x0 + SPILL : c.side === 'R' ? q.x0 < range.x0 - 1 && q.x0 < c.other.x1 - SPILL : false)
    if (q.what === 'stop' || theirs || across || skip?.has(q)) {
      stop = q.cap ?? (theirs ? figOf.get(q.fig) : null)
      // another float's: its caption, its figure, what it has taken
      if (q.cap != null || theirs || skip?.has(q)) wall = q
      break
    }
    if (q.what === 'rule') pending.push(q)
    else {
      rules.push(...pending); pending = []; got.push(q)
      reach = GAP * h
      if (q.what === 'figure') fig = q
    }
    widen(q)
    edge = down ? Math.min(edge, q.y0) : Math.max(edge, q.y1)
  }
  // the rules past the last item: each within TRAIL of it, or of the rule before, and nearer to it than to another
  // float's that stopped the walk (two floats a float's skip apart: the rule between is the nearer one's; a table's note
  // set tight under its rule leaves the rule the table's)
  if (got.length) {
    let end = down ? Math.min(...got.map(q => q.y0)) : Math.max(...got.map(q => q.y1))
    const last = end
    for (const q of pending) {
      const gap = down ? end - q.y1 : q.y0 - end
      if (gap > TRAIL * h || (wall && (down ? q.y0 - wall.y1 : wall.y0 - q.y1) < (down ? last - q.y1 : q.y0 - last))) break
      rules.push(q)
      end = down ? q.y0 : q.y1
    }
  }
  // the rules beyond the caption, against it: an algorithm's rule over its caption
  let end = down ? c.box.y1 : c.box.y0
  const back = down ? byFoot : byTop
  for (let k = down ? firstAt(byFoot, q => q.y0 >= c.box.y1 - 1) : firstAt(byTop, q => q.y1 <= c.box.y0 + 1); k < back.length; k++) {
    const q = back[k]
    if (q.caps?.includes(c.id) || overlapX(q, c.box) <= 0) continue
    if (q.what !== 'rule' || (down ? q.y0 - end : end - q.y1) > TRAIL * h) break
    rules.push(q)
    end = down ? q.y1 : q.y0
  }
  // the caption's neighbour in the stream: the line of the first token past it, on this side, that is not its own
  const { k0, lineOf, owner } = at, n = owner.length
  const mine = tokens(c.id).filter(k => k >= k0 && k < k0 + n)
  let near = -1
  if (mine.length) for (let k = down ? mine.at(-1) + 1 : mine[0] - 1; k >= k0 && k < k0 + n; k += down ? 1 : -1) if (!capsOn.get(lineOf[k - k0])?.has(c.id)) { near = lineOf[k - k0]; break }
  return { dir, got, rules, stop, parts, own: got.some(q => q.what === 'figure' && (figOf.get(q.fig) === c.id || parts.has(figOf.get(q.fig)))), adjacent: near >= 0 && got.some(q => q.i === near) }
}

/**
 * Two walks into each other, `w` from caption c and `v` from caption d: what both took, parted. Each caption keeps its
 * own figures, and the lines the page's stream sets next to it on its walk's side (through what both took), the part
 * coming at the widest gap between them, from c's caption to d's. Where the stream sets the same lines next to both
 * (c's caption, a table, d's caption, d's figure having no text in the stream), a caption with figures of its own keeps
 * them and what lies between them and itself, the other the rest; failing that, the widest gap. Each walks again,
 * stopping at the other's part
 */
function split(c, w, d, v, ctx) {
  const down = w.dir < 0
  const shared = [...new Set([...w.got, ...v.got])].sort((a, b) => (down ? b.y1 - a.y1 : a.y0 - b.y0))
  const lines = new Set(shared.map(q => q.i).filter(i => i != null))
  const ownBy = (q, x) => q.what === 'figure' && ctx.figOf.get(q.fig) === x.id
  let A = nextTo(c, w.dir, lines, ctx), B = nextTo(d, v.dir, lines, ctx)
  if ([...A].some(i => B.has(i))) {
    // the stream says nothing: a caption with figures of its own keeps them and what lies between them and itself
    A = B = new Set()
    const mine = shared.findLastIndex(q => ownBy(q, c)), theirs = shared.findIndex(q => ownBy(q, d))
    if ((mine < 0) !== (theirs < 0)) {
      const at = theirs >= 0 ? theirs : mine + 1
      return [walk(c, w.dir, ctx, new Set(shared.slice(at))), walk(d, v.dir, ctx, new Set(shared.slice(0, at)))]
    }
  }
  const mineOnly = q => (q.i != null && A.has(q.i)) || ownBy(q, c), theirsOnly = q => (q.i != null && B.has(q.i)) || ownBy(q, d)
  // the gap before each item, and before d's caption, from c's caption on
  const gaps = []
  let edge = down ? c.box.y0 : c.box.y1
  for (let s = 0; s <= shared.length; s++) {
    const next = s < shared.length ? (down ? shared[s].y1 : shared[s].y0) : down ? d.box.y1 : d.box.y0
    gaps.push(down ? edge - next : next - edge)
    if (s < shared.length) edge = down ? Math.min(edge, shared[s].y0) : Math.max(edge, shared[s].y1)
  }
  // a part at s is valid where nothing before it is only d's and nothing from it on only c's
  const n = shared.length, theirsBefore = new Uint8Array(n + 1), mineAfter = new Uint8Array(n + 1)
  for (let i = 0; i < n; i++) theirsBefore[i + 1] = theirsBefore[i] || theirsOnly(shared[i]) ? 1 : 0
  for (let i = n - 1; i >= 0; i--) mineAfter[i] = mineAfter[i + 1] || mineOnly(shared[i]) ? 1 : 0
  let best = -1
  for (let s = 0; s <= n; s++) if ((best < 0 || gaps[s] > gaps[best]) && !theirsBefore[s] && !mineAfter[s]) best = s
  if (best < 0) best = gaps.indexOf(Math.max(...gaps))
  return [walk(c, w.dir, ctx, new Set(shared.slice(best))), walk(d, v.dir, ctx, new Set(shared.slice(0, best)))]
}

/** the lines the page's stream sets next to a caption on a walk's side, through `lines`: from the caption's last token
 *  on (the walk down) or its first one back (up), while each token's line is the caption's own or one of `lines` */
function nextTo(c, dir, lines, { at: { k0, lineOf, owner }, capsOn, tokens }) {
  const out = new Set(), n = owner.length, mine = tokens(c.id).filter(k => k >= k0 && k < k0 + n)
  if (!mine.length) return out
  for (let k = dir < 0 ? mine.at(-1) + 1 : mine[0] - 1; k >= k0 && k < k0 + n; k += dir < 0 ? 1 : -1) {
    const j = lineOf[k - k0]
    if (capsOn.get(j)?.has(c.id)) continue
    if (!lines.has(j)) break
    out.add(j)
  }
  return out
}

/** a walk's extent: its items and rules, and the vertical rules standing in it, which may reach past its text */
function regionOf(c, w, rules) {
  let region = union([...w.got.map(q => ({ x0: q.x0, x1: q.x1, y0: q.lo, y1: q.hi })), ...w.rules])
  const h = c.h
  for (const r of rules) if (r.v && r.x0 >= region.x0 - 2 * h && r.x1 <= region.x1 + 2 * h && overlapY(r, region) >= 0.8 * (r.y1 - r.y0)) region = union([region, r])
  return region
}

/** a float that holds a figure, or marks drawn outside its text (a chart, a diagram), is a figure; else a table */
function floatKind(w, region) {
  if (w.got.some(q => q.what === 'figure')) return 'figure'
  const text = w.got.filter(q => q.what === 'line')
  let drawn = 0
  for (const q of w.got) if (q.what === 'mark' && !text.some(t => overlapX(t, q) > 0 && overlapY(t, q) > 0)) drawn += (q.x1 - q.x0) * (q.y1 - q.y0)
  return drawn >= DRAWN * (region.x1 - region.x0) * (region.y1 - region.y0) ? 'figure' : 'table'
}

/** the floats of a page already made (pageFloats), or undefined */
export const floatsOn = (L, p) => L?.floats?.get(p)

/** the float a unit belongs to on a side — its caption's, or the one holding it (a cell) — among the pages made */
export function floatOf(L, id) {
  for (const p of L?.pagesOf.get(id) ?? []) for (const f of L.floats?.get(p) ?? []) if (f.id === id || f.members.has(id)) return f
  return null
}

/**
 * What a float paints (PDF units): a table one wash over it and its caption, padded as a block is (`padX` beside, half
 * the caption's leading above and below); a figure its outline (`frame`) and its caption's blocks — a wash multiplied
 * into a figure would change its colours. [{ page, x0, y0, x1, y1, frame }], kept for the pad last asked (the pointer
 * asks every frame at one zoom)
 */
export function floatShapes(L, f, padX) {
  if (f.shapes?.padX === padX) return f.shapes.list
  const list = shapesOf(L, f, padX)
  f.shapes = { padX, list }
  return list
}
function shapesOf(L, f, padX) {
  const caps = (pageGeometry(L, f.page).byId.get(f.id) ?? []).map(run => blockOf(run, padX))
  const reg = { page: f.page, x0: f.region.x0 - padX, x1: f.region.x1 + padX, y0: f.region.y0 - f.lead, y1: f.region.y1 + f.lead }
  if (f.kind === 'table') return [{ page: f.page, ...union([reg, ...caps]), frame: false }]
  return [{ ...reg, frame: true }, ...caps.map(b => ({ ...b, frame: false }))]
}

/**
 * What a point of a page (PDF units) lights, floats included: `hit` the unit hitOf found there; a float whose painted
 * shape holds the point takes it — over its own caption and what it holds (a cell lights its table), and over another
 * unit's block where its shape is the smaller. { id, float } for a float, else `hit`
 */
export function floatHitOf(L, p, x, y, padX, hit) {
  const fs = L?.floats?.get(p)
  if (!fs?.length) return hit
  let best = null, area = Infinity
  for (const f of fs) for (const s of floatShapes(L, f, padX)) {
    if (x < s.x0 || x > s.x1 || y < s.y0 || y > s.y1) continue
    const a = (s.x1 - s.x0) * (s.y1 - s.y0)
    if (a < area) { area = a; best = f }
  }
  if (!best) return hit
  if (hit && hit.id !== best.id && !best.members.has(hit.id)) {
    const b = blockOf(hit.run, padX)
    if ((b.x1 - b.x0) * (b.y1 - b.y0) < area) return hit
  }
  return { id: best.id, float: best }
}
