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
// baseline, strictly inside the annotation's rectangle or one of its quads. They are cut from the page's text items, each cut
// into characters of equal advance, so that the engine and the gate's instrument (lab/pdf/spikes/layer-gate/links.mjs) read one
// rule.

/** the schemes a record's `url` may have (the contract's allow-list: PDF.js also lets ftp: and tel: through) */
export const LINK_SCHEMES = ['http:', 'https:', 'mailto:']
/** the border styles a record names (PDF.js's AnnotationBorderStyleType: 1 solid, 2 dashed, 5 underline) */
const BORDER_STYLES = { 1: 'solid', 2: 'dashed', 5: 'underline' }

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
    if (!s || !(Array.isArray(t) || ArrayBuffer.isView(t))) continue
    if (!finite([t[0], t[1], t[4], t[5], it.width])) continue
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
 * A page's Link annotations as the page keeps them until it is final, from PDF.js's list and the page's glyph points
 * (`pointsOf`). `i` is the rank among the page's Link annotations (any other subtype is not counted), PDF.js's order: the number
 * the gate's attribution names. One of: { i, unsupported: true } (no rectangle with an area, a `url` outside
 * the allow-list, a named action, JavaScript with no URL, an attachment, `unsafeUrl` alone: nothing the reader can carry), or
 * { i, rect, boxes (its quads' boxes, else its rectangle: also where its quads are ill formed), dest | url, ov (overlaid text, collapsed), border | null, g: the glyph
 * points inside it as { x, y, ch } columns }
 */
export function annotsOf(raw, points) {
  const list = []
  let i = 0, total = 0, unsupported = 0
  for (const a of raw ?? []) {
    if (a?.subtype !== 'Link') continue
    const rank = i++
    const rect = Array.isArray(a.rect) && a.rect.length === 4 && finite(a.rect) ? box4(...a.rect) : null
    const quads = a.quadPoints ? quadBoxes(a.quadPoints) : null
    const boxes = quads ?? (rect ? [rect] : [])
    let target = null
    if (typeof a.url === 'string' && a.url) { if (urlAllowed(a.url)) target = { url: a.url } }
    else if ((typeof a.dest === 'string' && a.dest) || (Array.isArray(a.dest) && a.dest.length)) target = { dest: a.dest }
    if (!rect || !sound(rect) || !boxes.every(sound) || !target) { list.push({ i: rank, unsupported: true }); unsupported++; continue }
    const g = { x: [], y: [], ch: [] }
    for (let k = 0; k < points.x.length; k++) {
      if (!boxes.some(b => inside(points.x[k], points.y[k], b))) continue
      g.x.push(points.x[k]); g.y.push(points.y[k]); g.ch.push(points.ch[k])
    }
    const bw = a.borderStyle?.width
    const color = a.color && a.color.length >= 3 ? [a.color[0], a.color[1], a.color[2]] : null
    const border = bw > 0 && color ? { width: bw, rgb: color, style: BORDER_STYLES[a.borderStyle.style] ?? 'solid' } : null
    list.push({ i: rank, rect, boxes, ...target, ov: typeof a.overlaidText === 'string' ? collapse(a.overlaidText) : '', border, g })
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

/** an annotation's points for the questions asked of it: its glyph points, else its rectangle's centre (a glyphless link) */
function pointsOfAnnot(a) {
  if (a.g.x.length) return a.g.x.map((x, k) => [x, a.g.y[k]])
  return [[(a.rect[0] + a.rect[2]) / 2, (a.rect[1] + a.rect[3]) / 2]]
}

/**
 * The unit that owns an annotation (page q, order free): of `units` ({ id, stream, rects: [page, x0, y0, x1, y1] ... }, those
 * placed on q), the one whose rectangles on q hold most of the annotation's points; a tie goes to the smaller area of rectangles
 * on q, then the smaller id (unitAt's rule). null where no unit holds any
 */
export function ownerOf(a, units, q) {
  const pts = pointsOfAnnot(a)
  let best = null
  for (const u of units) {
    let n = 0, area = 0
    const here = u.rects.filter(r => r[0] === q)
    for (const r of here) area += (r[3] - r[1]) * (r[4] - r[2])
    for (const [x, y] of pts) if (here.some(r => x >= r[1] && x <= r[3] && y >= r[2] && y <= r[4])) n++
    if (!n) continue
    if (!best || n > best.n || (n === best.n && (area < best.area || (area === best.area && u.id < best.u.id)))) best = { u, n, area }
  }
  return best?.u ?? null
}

/** a record over the original's own ink: the annotation's rectangle (or quads), named by PDF.js's overlaid text (the glyphs'
 *  characters where it has none to give), not moved. `order` is set when the list is ranked */
export function inPlaceOf(a) {
  const name = a.ov || collapse(a.g.ch.join(''))
  const rec = { boxes: a.boxes.flat(), ...(a.url !== undefined ? { url: a.url } : { dest: a.dest }), name, moved: false, order: 0 }
  if (a.border) rec.border = { width: a.border.width, rgb: [...a.border.rgb], style: a.border.style }
  return rec
}

/**
 * A page's links once it is final. `list`: the page's annotations (`annotsOf`'s, null where the read failed: then no link);
 * `ops`, `devOf(x, y)`: the page's operations and the map of a PDF point to their device pixels; `units`: the units placed on
 * the page; `consumed`: the annotations (by `i`) a unit's match took, with `moved` the records those made (3a-2; each
 * { rec, stream, sources }, in drawing order); `sources` asks for the attribution, the gate's.
 *
 * Each annotation not consumed: none of its points erased by the operations -> in place; otherwise dropped, `unmatched`. The
 * list is sorted and ranked: by the owner unit's stream index (no owner: after every owned one), moved before in place, drawing
 * order (moved) or PDF order (in place). Returns { records, sources, inPlace, dropped }
 */
export function freezeLinks({ list, q, ops, devOf, units, consumed = null, moved = [], sources = false }) {
  const erased = erasedOf(ops)
  const entries = moved.map((m, seq) => ({ rec: m.rec, stream: m.stream ?? Infinity, kind: 0, seq, src: m.sources ?? null }))
  let dropped = 0, inPlace = 0
  for (const a of list ?? []) {
    if (a.unsupported || consumed?.has(a.i)) continue
    if (pointsOfAnnot(a).some(([x, y]) => { const [dx, dy] = devOf(x, y); return erased(dx, dy) })) { dropped++; continue }
    inPlace++
    entries.push({ rec: inPlaceOf(a), stream: ownerOf(a, units, q)?.stream ?? Infinity, kind: 1, seq: a.i, src: { annots: [[q, a.i]], tier: 'place' } })
  }
  entries.sort((a, b) => (a.stream === b.stream ? a.kind - b.kind || a.seq - b.seq : a.stream < b.stream ? -1 : 1))
  entries.forEach((e, k) => { e.rec.order = k })
  return { records: entries.map(e => e.rec), sources: sources ? entries.map(e => e.src) : null, inPlace, dropped }
}

/** a copy of a page's kept links, none of its objects the record's (L5): the host may keep, change or transfer it */
export function copyLinks(records) {
  return (records ?? []).map(r => {
    const out = { boxes: r.boxes.slice(), ...(r.url !== undefined ? { url: r.url } : { dest: typeof r.dest === 'string' ? r.dest : structuredClone(r.dest) }), name: r.name, moved: r.moved, order: r.order }
    if (r.border) out.border = { width: r.border.width, rgb: [...r.border.rgb], ...(r.border.style ? { style: r.border.style } : {}) }
    return out
  })
}
