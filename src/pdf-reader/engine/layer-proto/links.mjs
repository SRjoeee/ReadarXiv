// src/pdf-reader/engine/layer-proto/links.mjs
// The links of a laid page (3a; the 3a design, docs/ and the contract in reader.d.mts `LinkRecord`): the original's Link
// annotations read once as the page is drawn, owned by the unit whose rectangle holds their glyphs, and, once the page is final,
// frozen into the records `pageOf` answers. A pure leaf: no DOM, no clock, no PDF.js object but the plain data it is given.
//
// 3a-1 (this file) leaves a link where it stands: an annotation none of whose glyph points the page's operations left erased
// is a record over the original's own ink (`moved: false`, its rectangle or quads, PDF.js's overlaid text as its name); any
// other, unconsumed by a match, is dropped and counted, never left over erased paper. The seams of 3a-2 (a unit's match at its
// first paint, placement over the drawn pieces) are the `consumed` set and the `moved` list `freezeLinks` takes.
//
// Glyph points are PDF.js's own rule (its SingleIntersector, which fills `overlaidText`): a glyph's advance centre on its
// baseline, strictly inside the annotation's rectangle or one of its quads. Two sets are kept for each annotation: the page's
// text items cut into characters of equal advance (`pointsOf`: the gate's instrument reads the same rule,
// lab/pdf/spikes/layer-gate/links.mjs) and the engine's own characters' advance centres (`charPoints`: pageChars2's widths).
// Neither is PDF.js's own reading, and they differ (equal advance puts a narrow glyph's centre where a neighbour's is); a link
// is left in place only if no point of EITHER set is erased, so that the gate's check and the engine's own agree on a link kept.
//
// Bounds (a page may be hostile): at most MAX_LINKS Link annotations a page are read (the rest counted unsupported), one with
// more than MAX_GLYPHS glyph points is not carried, the glyph points are found through a grid (not links x points), and the
// freeze spends at most WORK_MAX point-against-operation comparisons, dropping what is left as `unplaced`.

/** the schemes a record's `url` may have (the contract's allow-list: PDF.js also lets ftp: and tel: through) */
export const LINK_SCHEMES = ['http:', 'https:', 'mailto:']
/** the border styles a record names (PDF.js's AnnotationBorderStyleType: 1 solid, 2 dashed, 5 underline) */
const BORDER_STYLES = { 1: 'solid', 2: 'dashed', 5: 'underline' }

/** the most Link annotations read on a page, the most glyph points one may hold, and the freeze's budget of point-against-box tests */
export const MAX_LINKS = 2000
export const MAX_GLYPHS = 200
export const WORK_MAX = 2e7

const finite = xs => xs.every(x => typeof x === 'number' && Number.isFinite(x))
const box4 = (a, b, c, d) => [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)]
const collapse = s => s.replace(/\s+/gu, ' ').trim()

/** whether `url` is one a record may carry */
export function urlAllowed(url) {
  if (typeof url !== 'string' || !url) return false
  try { return LINK_SCHEMES.includes(new URL(url).protocol) } catch { return false }
}

/**
 * A page's annotations as PDF.js reports them (`page.getAnnotations()`), or null: a throw, a rejection, a page object that has no
 * such call (the tests' fakes), a reply that is no list. Never rejects: a page never fails for its links (L6)
 */
export async function readAnnots(page) {
  try {
    if (typeof page?.getAnnotations !== 'function') return null
    const raw = await page.getAnnotations()
    return Array.isArray(raw) ? raw : null
  } catch { return null }
}

/**
 * The glyph points of a page's text items (PDF.js items: { str, width, transform }): each non-space character's advance centre
 * on its baseline, in the item's direction, as parallel columns { x, y, ch } in item order
 */
export function pointsOf(items) {
  const x = [], y = [], ch = []
  for (const it of items ?? []) {
    const s = it?.str, t = it?.transform
    if (!s || !(Array.isArray(t) || ArrayBuffer.isView(t)) || t.length < 6) continue
    if (!finite([...t, it.width])) continue
    const n = Math.hypot(t[0], t[1])
    if (!n || !(it.width > 0)) continue
    const ux = t[0] / n, uy = t[1] / n, cs = [...s]
    for (let k = 0; k < cs.length; k++) {
      if (!/\S/u.test(cs[k])) continue
      const along = ((k + 0.5) / cs.length) * it.width
      x.push(t[4] + ux * along)
      y.push(t[5] + uy * along)
      ch.push(cs[k])
    }
  }
  return { x, y, ch }
}

/** the advance centres of the engine's characters (layer2.mjs pageChars2: { ch, x0, x1, yb }) on their baselines, non-space only */
export function charPoints(chars) {
  const x = [], y = [], ch = []
  for (const c of chars ?? []) {
    if (!/\S/u.test(c.ch)) continue
    x.push((c.x0 + c.x1) / 2); y.push(c.yb); ch.push(c.ch)
  }
  return { x, y, ch }
}

const CELL = 16
const CLAMP = 1 << 20
const cellOf = v => Math.max(-CLAMP, Math.min(CLAMP, Math.floor(v / CELL)))
const keyOf = (cx, cy) => (cx + CLAMP) * 4194304 + (cy + CLAMP)
/** a grid over the glyph points, so that a box finds its points without a pass over all of them */
function gridOf(p) {
  const cells = new Map()
  let x0 = Number.POSITIVE_INFINITY, x1 = Number.NEGATIVE_INFINITY, y0 = x0, y1 = x1
  for (let k = 0; k < p.x.length; k++) {
    const cx = cellOf(p.x[k]), cy = cellOf(p.y[k]), key = keyOf(cx, cy)
    const list = cells.get(key)
    if (list) list.push(k); else cells.set(key, [k])
    if (cx < x0) x0 = cx
    if (cx > x1) x1 = cx
    if (cy < y0) y0 = cy
    if (cy > y1) y1 = cy
  }
  return { cells, x0, x1, y0, y1, p }
}
/** the indices (ascending) of the grid's points strictly inside one of the boxes, or null where there are more than `limit` */
function hitsIn(grid, boxes, limit) {
  const seen = new Set()
  const { p } = grid
  for (const b of boxes) {
    const xa = Math.max(cellOf(b[0]), grid.x0), xb = Math.min(cellOf(b[2]), grid.x1), ya = Math.max(cellOf(b[1]), grid.y0), yb = Math.min(cellOf(b[3]), grid.y1)
    for (let cx = xa; cx <= xb; cx++) {
      for (let cy = ya; cy <= yb; cy++) {
        for (const k of grid.cells.get(keyOf(cx, cy)) ?? []) {
          if (!inside(p.x[k], p.y[k], b)) continue
          seen.add(k)
          if (seen.size > limit) return null
        }
      }
    }
  }
  return [...seen].sort((a, b) => a - b)
}

/** a quad list (PDF.js's Float32Array of 8n numbers, or a plain list) as boxes [x0, y0, x1, y1], or null: none, or ill formed */
function quadBoxes(q) {
  if (!q || typeof q.length !== 'number' || !q.length) return null
  const flat = Array.from(q)
  if (flat.length % 8 || !finite(flat)) return null
  const out = []
  for (let i = 0; i < flat.length; i += 8) {
    const xs = [flat[i], flat[i + 2], flat[i + 4], flat[i + 6]], ys = [flat[i + 1], flat[i + 3], flat[i + 5], flat[i + 7]]
    out.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])
  }
  return out
}
const inside = (x, y, b) => x > b[0] && x < b[2] && y > b[1] && y < b[3]
const sound = b => b[0] < b[2] && b[1] < b[3]

/**
 * A page's Link annotations as the page keeps them until it is final, from PDF.js's list and the page's glyph points (`pointsOf`,
 * and the engine's own `charPoints` as `points2`). `i` is the rank among the page's Link annotations (any other subtype is not
 * counted), PDF.js's order: the number the gate's attribution names. One of: { i, unsupported: true } (no rectangle with an
 * area, a `url` outside the allow-list, a named action, JavaScript with no URL, an attachment, `unsafeUrl` alone, more than
 * MAX_GLYPHS glyph points: nothing the reader can carry), or { i, rect, boxes (its quads' boxes, else its rectangle: also where
 * its quads are ill formed), dest | url, ov (overlaid text, collapsed), border | null, g, g2: the two sets of glyph points
 * inside it as { x, y, ch } columns }. Past MAX_LINKS annotations a page the rest are counted unsupported and not kept
 */
export function annotsOf(raw, points, points2 = null) {
  const list = []
  const grid = gridOf(points), grid2 = points2 ? gridOf(points2) : null
  let i = 0, total = 0, unsupported = 0
  const pick = (p, idx) => ({ x: idx.map(k => p.x[k]), y: idx.map(k => p.y[k]), ch: idx.map(k => p.ch[k]) })
  for (const a of raw ?? []) {
    if (a?.subtype !== 'Link') continue
    const rank = i++
    if (rank >= MAX_LINKS) { unsupported++; continue }
    const rect = Array.isArray(a.rect) && a.rect.length === 4 && finite(a.rect) ? box4(...a.rect) : null
    const quads = a.quadPoints ? quadBoxes(a.quadPoints) : null
    const boxes = quads ?? (rect ? [rect] : [])
    let target = null
    if (typeof a.url === 'string' && a.url) { if (urlAllowed(a.url)) target = { url: a.url } }
    else if ((typeof a.dest === 'string' && a.dest) || (Array.isArray(a.dest) && a.dest.length)) target = { dest: a.dest }
    const hit = rect && sound(rect) && boxes.every(sound) && target ? hitsIn(grid, boxes, MAX_GLYPHS) : null
    const hit2 = hit && grid2 ? hitsIn(grid2, boxes, MAX_GLYPHS) : []
    if (!hit || !hit2) { list.push({ i: rank, unsupported: true }); unsupported++; continue }
    const bw = a.borderStyle?.width
    const color = a.color && a.color.length >= 3 ? [a.color[0], a.color[1], a.color[2]] : null
    const border = typeof bw === 'number' && Number.isFinite(bw) && bw > 0 && color ? { width: bw, rgb: color, style: BORDER_STYLES[a.borderStyle.style] ?? 'solid' } : null
    list.push({ i: rank, rect, boxes, ...target, ov: typeof a.overlaidText === 'string' ? collapse(a.overlaidText) : '', border, g: pick(points, hit), g2: grid2 ? pick(points2, hit2) : { x: [], y: [], ch: [] } })
    total++
  }
  return { list, total, unsupported }
}

/**
 * The erased area of a page as a question: whether a point (device pixels) lies where the drawing's operations (a page record's
 * `ops`, device pixels [x, y, w, h]) left the paper erased at the end. In their order: an erase, paper or swap rectangle erases;
 * a restore puts the page's pixels back in each of its boxes within its clip; a crop erases nothing
 */
export function erasedOf(ops) {
  const list = ops ?? []
  const within = (x, y, b) => x >= b[0] && x < b[0] + b[2] && y >= b[1] && y < b[1] + b[3]
  return (x, y) => {
    let erased = false
    for (const o of list) {
      if (o.op === 'erase') { if (within(x, y, o.box)) erased = true }
      else if (o.op === 'paper' || o.op === 'swap') { if (o.rects.some(b => within(x, y, b))) erased = true }
      else if (o.op === 'restore') { if (o.boxes.some(b => within(x, y, b)) && o.clip.some(b => within(x, y, b))) erased = false }
    }
    return erased
  }
}

/** an annotation's points for the questions asked of it: the points of both sets, else its rectangle's centre (a glyphless link) */
function pointsOfAnnot(a) {
  const n = a.g.x.length + a.g2.x.length
  if (!n) return [[(a.rect[0] + a.rect[2]) / 2, (a.rect[1] + a.rect[3]) / 2]]
  const out = []
  for (const g of [a.g, a.g2]) for (let k = 0; k < g.x.length; k++) out.push([g.x[k], g.y[k]])
  return out
}

/** the units of a page as ownership reads them: each with its rectangles on page q and their area */
function prepare(units, q) {
  return units.map(u => {
    const here = u.rects.filter(r => r[0] === q)
    return { u, here, area: here.reduce((s, r) => s + (r[3] - r[1]) * (r[4] - r[2]), 0) }
  })
}
function ownerIn(pts, prepared) {
  let best = null
  for (const e of prepared) {
    let n = 0
    for (const [x, y] of pts) if (e.here.some(r => x >= r[1] && x <= r[3] && y >= r[2] && y <= r[4])) n++
    if (!n) continue
    if (!best || n > best.n || (n === best.n && (e.area < best.area || (e.area === best.area && e.u.id < best.u.id)))) best = { u: e.u, n, area: e.area }
  }
  return best?.u ?? null
}
/**
 * The unit that owns an annotation (page q, order free): of `units` ({ id, stream, rects: [page, x0, y0, x1, y1] ... }, those
 * with lines on q), the one whose rectangles on q hold most of the annotation's points; a tie goes to the smaller area of
 * rectangles on q, then the smaller id (unitAt's rule). null where no unit holds any
 */
export function ownerOf(a, units, q) {
  return ownerIn(pointsOfAnnot(a), prepare(units, q))
}

/** a record over the original's own ink: the annotation's rectangle (or quads), named by PDF.js's overlaid text (the engine's
 *  characters under it where that is empty), not moved. `order` is set when the list is ranked */
export function inPlaceOf(a) {
  const name = a.ov || collapse(a.g2.ch.join(''))
  const rec = { boxes: a.boxes.flat(), ...(a.url !== undefined ? { url: a.url } : { dest: a.dest }), name, moved: false, order: 0 }
  if (a.border) rec.border = { width: a.border.width, rgb: [...a.border.rgb], style: a.border.style }
  return rec
}

/**
 * A page's links once it is final. `list`: the page's annotations (`annotsOf`'s, null where the read failed: then no link);
 * `ops`, `devOf(x, y)`: the page's operations and the map of a PDF point to their device pixels; `units`: the units with lines
 * on the page, those left the original's too; `consumed`: the annotations (by `i`) a unit's match took, with `moved` the records
 * those made (3a-2; each { rec, stream, sources }, in drawing order); `sources` asks for the attribution, the gate's.
 *
 * Each annotation not consumed: no point of either set erased by the operations -> in place; otherwise dropped, `unmatched`.
 * What is left once the work budget (WORK_MAX) is spent is dropped `unplaced`. The list is sorted and ranked: by the owner
 * unit's stream index (no owner: after every owned one), moved before in place, drawing order (moved) or PDF order (in place).
 * Returns { records, sources, inPlace, dropped, unplaced }
 */
export function freezeLinks({ list, q, ops, devOf, units, consumed = null, moved = [], sources = false }) {
  const erased = erasedOf(ops)
  const cost = (ops?.length ?? 0) + 1
  const prepared = prepare(units, q)
  const rects = prepared.reduce((s, e) => s + e.here.length, 0) + 1
  const entries = moved.map((m, seq) => ({ rec: m.rec, stream: m.stream ?? Infinity, kind: 0, seq, src: m.sources ?? null }))
  let dropped = 0, unplaced = 0, inPlace = 0, work = 0
  for (const a of list ?? []) {
    if (a.unsupported || consumed?.has(a.i)) continue
    const pts = pointsOfAnnot(a)
    work += pts.length * cost
    if (work > WORK_MAX) { unplaced++; continue }
    if (pts.some(([x, y]) => { const [dx, dy] = devOf(x, y); return erased(dx, dy) })) { dropped++; continue }
    inPlace++
    work += pts.length * rects
    entries.push({ rec: inPlaceOf(a), stream: (work > WORK_MAX ? null : ownerIn(pts, prepared))?.stream ?? Infinity, kind: 1, seq: a.i, src: { annots: [[q, a.i]], tier: 'place' } })
  }
  entries.sort((a, b) => (a.stream === b.stream ? a.kind - b.kind || a.seq - b.seq : a.stream < b.stream ? -1 : 1))
  entries.forEach((e, k) => { e.rec.order = k })
  return { records: entries.map(e => e.rec), sources: sources ? entries.map(e => e.src) : null, inPlace, dropped, unplaced }
}

/** a copy of a page's kept links, none of its objects the record's (L5): the host may keep, change or transfer it */
export function copyLinks(records) {
  return (records ?? []).map(r => {
    const out = { boxes: r.boxes.slice(), ...(r.url !== undefined ? { url: r.url } : { dest: typeof r.dest === 'string' ? r.dest : structuredClone(r.dest) }), name: r.name, moved: r.moved, order: r.order }
    if (r.border) out.border = { width: r.border.width, rgb: [...r.border.rgb], ...(r.border.style ? { style: r.border.style } : {}) }
    return out
  })
}
