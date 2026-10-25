// The text inside a bitmap figure of our final pass (docs/route/orphan-text.md stage 6, the content class `ocr` under the toggle
// `figures`, PDF-READER §19.15): the lines the extension's recogniser reads in an image our compile placed on a page (DESIGN §15.3:
// PP-OCRv6 tiny, the same model files and code, its positions approved by the owner on 2026-10-25), merged into labels as the
// extension merges them (core/image/boxes.ts linesToBoxes: the same filter, the same merge), each label a unit of kind `inkocr`
// drawn in its own lines' boxes. Nothing of the image is rewritten: the reader draws over it, under each line of a label it draws,
// a patch of the background the line stands on (the extension's image translation covers a label so too), and the translation
// in the line's box. Pure arithmetic over one image's pixels and the lines read in it; the pass that reads the pages, decodes
// the images and asks the recogniser is pipeline/ocr-pass.mjs.
//
// Each line, in the image's pixels (origin top left, y down), is its quad in reading order (↖ ↗ ↘ ↙: a line read on its side
// has its first corner where its reading begins), so that it is a frame: along it from its first corner to its second, across
// it from its first to its fourth; its length L and its thickness T. Its patch is the quad grown by PATCH_PAD of T on each side
// (less where the image's edge is nearer: a patch never leaves its image), its ring the band RING of T wide around the patch.
// A label is drawn only where every one of its lines holds:
//   - its ring flat: RING_FLAT of the ring's pixels within NEAR of the ring's colour, the patch's (no ink reaches past the
//     patch: what the patch covers is the line's ink whole, and nothing else of the figure's); a pixel of another line's patch
//     is not the ring's (that line's ink is its own label's, or kept);
//   - its inside the line's ink alone: no more than CROWD of its pixels off the colours between the ring's and the ink's (a
//     marker of another colour, a line of the plot through the label);
//   - its patch clear of every other label's patch and of every line no label holds (a number, a letter alone: kept), and of the
//     page's own ink over the image (its text, a path drawn after it), which a patch would cover; inside the clip in force and
//     the page; its frame not mirrored by its placement.
// Else it stays the original's, its reason told (`busy`, `crowded`, `overlap`, `covered`, `clipped`, `mirrored`, `outside`,
// `long`, `past`). Its text size is the extension's (core/renderer/image.ts fontBounds: 72 % of a line's thickness), its colours
// the ring's (the patch's) and the ink's, and its anchor read as a vector figure's is (layout/figure-text.mjs): `start` where
// ink stands right before it along its baseline and none as near after it (a legend's marker), `end` the other way, else
// `centre`.
//
// An original module (no port statement).
import { linesToBoxes } from '../../../core/image/boxes.ts'

/** a patch grows each side of its line by this share of the line's thickness (a det box holds its line's ink with room; this is
 *  the antialiased edge and a descender's foot) */
export const PATCH_PAD = 0.08
/** the ring around a patch: this share of the line's thickness wide, at least RING_MIN_PX */
export const RING = 0.15
const RING_MIN_PX = 2
/** the band right outside a patch, this share of its line's thickness (at least RING_MIN_PX), whose every pixel the ring reads,
 *  another line's box or not: ink there is a glyph the patch's edge would cut */
const EDGE = 0.06
/** …of which this share at most is ink, or EDGE_OFF_MIN pixels (a JPEG's noise): past it a glyph crosses the patch's edge */
const EDGE_OFF = 0.002, EDGE_OFF_MIN = 2
/** a ring is flat where this share of its pixels at least are within NEAR of its colour */
export const RING_FLAT = 0.97
/** two colours alike: within this distance in RGB (0 to 441) */
export const NEAR = 32
/** a line's inside holds its ink alone where no more than this share of its pixels are off the colours between its ground's
 *  and its ink's */
export const CROWD = 0.03
/** the pixels a ring needs at least to be judged */
const RING_MIN = 12
/** a translation's size: this share of its line's thickness (the extension's: core/renderer/image.ts fontBounds' 72 %) */
export const OCR_SIZE = 0.72
/** ink right before or after a line along its baseline, within this many of its sizes, anchors it there */
export const ANCHOR_REACH = 1.5
/** …where the ink on one side of it is nearer than the other side's by this ratio at least */
export const ANCHOR_RATIO = 2
/** a label's lines at most (a longer one is a paragraph some figure holds: the original's), its text at most, code units */
export const OCR_LINES_MAX = 8, OCR_TEXT_MAX = 400
/** the labels an image may give at most, and a paper (past them the rest stay the original's, counted: `past`) */
export const OCR_UNITS_IMAGE = 400, OCR_UNITS_DOC = 4000
/** why a label read is not a unit drawn */
export const OCR_WHYS = Object.freeze(['busy', 'crowded', 'overlap', 'covered', 'clipped', 'mirrored', 'outside', 'long', 'past'])
/** the anchors, by their code in a place (layer-proto/ocr-rows.mjs) */
export const OCR_ANCHORS = Object.freeze(['start', 'centre', 'end'])

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
/** a colour's distance to the colours between two (antialiased ink on its ground lies there) */
function offSegment(p, a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]
  if (dd === 0) return dist(p, a)
  const k = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / dd))
  return Math.hypot(p[0] - a[0] - k * d[0], p[1] - a[1] - k * d[1], p[2] - a[2] - k * d[2])
}
const rgbOf = c => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2])

/**
 * A pixel reader of an image as PDF.js decodes one (`kind` 1: one bit a pixel, rows padded to a byte, 1 white; 2: RGB; 3: RGBA),
 * each pixel as the page shows it over white: (x, y) → [r, g, b], x and y integers inside the image
 */
export function pixelReader({ data, width, kind }) {
  if (kind === 1) {
    const row = (width + 7) >> 3
    return (x, y) => { const v = (data[y * row + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0; return [v, v, v] }
  }
  if (kind === 2) return (x, y) => { const i = 3 * (y * width + x); return [data[i], data[i + 1], data[i + 2]] }
  return (x, y) => {
    const i = 4 * (y * width + x), a = data[i + 3] / 255
    return [data[i] * a + 255 * (1 - a), data[i + 1] * a + 255 * (1 - a), data[i + 2] * a + 255 * (1 - a)]
  }
}

/** a line's frame in the image's pixels: its first corner, along (u) to its second, across (n) to its fourth, L and T */
function frameOf(q) {
  const [p0, p1, , p3] = q
  const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), T = Math.hypot(p3[0] - p0[0], p3[1] - p0[1])
  const ux = (p1[0] - p0[0]) / (L || 1), uy = (p1[1] - p0[1]) / (L || 1), nx = (p3[0] - p0[0]) / (T || 1), ny = (p3[1] - p0[1]) / (T || 1)
  const det = ux * ny - uy * nx
  return { ox: p0[0], oy: p0[1], ux, uy, nx, ny, L, T, det }
}
/** a point in a frame: along (s) and across (t), the frame's two directions oblique where the quad leans */
function inFrame(f, x, y) {
  const dx = x - f.ox, dy = y - f.oy
  return [(dx * f.ny - dy * f.nx) / f.det, (f.ux * dy - f.uy * dx) / f.det]
}
const at = (f, s, t) => [f.ox + f.ux * s + f.nx * t, f.oy + f.uy * s + f.ny * t]

/** how far a point may move along (dx, dy) and stay inside [0, W] × [0, H] */
function reachOf(p, dx, dy, W, H) {
  let k = Infinity
  if (dx > 1e-9) k = Math.min(k, (W - p[0]) / dx)
  else if (dx < -1e-9) k = Math.min(k, -p[0] / dx)
  if (dy > 1e-9) k = Math.min(k, (H - p[1]) / dy)
  else if (dy < -1e-9) k = Math.min(k, -p[1] / dy)
  return Math.max(0, k)
}

/**
 * A line's patch in its frame: [s0, t0, s1, t1], its quad grown by PATCH_PAD of its thickness on each side, each side's growth
 * no more than the image's edge allows (a quad the recogniser clamped to the image already); null where the quad itself leaves
 * the image by more than a pixel
 */
function patchOf(f, W, H, g) {
  const corners = [at(f, 0, 0), at(f, f.L, 0), at(f, f.L, f.T), at(f, 0, f.T)]
  if (corners.some(([x, y]) => x < -1 || y < -1 || x > W + 1 || y > H + 1)) return null
  // (each side's corners moved out along its normal in the frame: the start's along -u, the end's +u, the top's -n, the foot's +n;
  // a side's growth below 0 takes it into the box, no further than its box's middle)
  const side = (k, a, b, dx, dy) => (g[k] < 0 ? Math.max(g[k], -(k % 2 ? f.T : f.L) / 4) : Math.min(g[k], reachOf(a, dx, dy, W, H), reachOf(b, dx, dy, W, H)))
  return [-side(0, corners[0], corners[3], -f.ux, -f.uy), -side(1, corners[0], corners[1], -f.nx, -f.ny), f.L + side(2, corners[1], corners[2], f.ux, f.uy), f.T + side(3, corners[3], corners[2], f.nx, f.ny)]
}
/**
 * The patches a line tries, the largest first, as each side's growth in shares of its thickness [start, top, end, foot]: grown
 * PATCH_PAD all round, half of it, none; then, where those meet another line's ink, its sides drawn in toward its ink, one
 * side or two, by PATCH_PAD or twice it (a box holds its line's ink with room, and the ring tells whether a patch drawn in still
 * holds it all)
 */
const TRIES = (() => {
  const out = [[1, 1, 1, 1], [0.5, 0.5, 0.5, 0.5], [0, 0, 0, 0]]
  const ins = [0, -1, -2], more = []
  for (const a of ins) for (const b of ins) for (const c of [0, -1]) for (const d of [0, -1]) if (a || b || c || d) more.push([c, a, d, b])
  // (the larger first: the less taken off)
  more.sort((x, y) => y.reduce((n, v) => n + v, 0) - x.reduce((n, v) => n + v, 0))
  return Object.freeze([...out, ...more].map(t => Object.freeze(t.map(v => v * PATCH_PAD))))
})()
const quadOf = (f, r) => [at(f, r[0], r[1]), at(f, r[2], r[1]), at(f, r[2], r[3]), at(f, r[0], r[3])]
const holds = (r, s, t) => s >= r[0] && s <= r[2] && t >= r[1] && t <= r[3]

/** the pixels whose centres a quad's bounds hold, inside the image: [x0, y0, x1, y1] (x1, y1 exclusive) */
function boundsOf(q, W, H) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of q) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  return [Math.max(0, Math.floor(x0)), Math.max(0, Math.floor(y0)), Math.min(W, Math.ceil(x1)), Math.min(H, Math.ceil(y1))]
}

/** the colour most pixels of a list are (5 bits a channel), as their mean; null for none */
function modeOf(colours) {
  if (!colours.length) return null
  const bins = new Map()
  for (const c of colours) {
    const k = ((c[0] >> 3) << 10) | ((c[1] >> 3) << 5) | (c[2] >> 3)
    const b = bins.get(k)
    if (b) { b.n++; b.r += c[0]; b.g += c[1]; b.b += c[2] } else bins.set(k, { n: 1, r: c[0], g: c[1], b: c[2] })
  }
  let best = null
  for (const b of bins.values()) if (!best || b.n > best.n) best = b
  return [best.r / best.n, best.g / best.n, best.b / best.n]
}

/** whether two convex quads (corners in order) overlap: no axis of their edges separates them */
function quadsMeet(a, b) {
  for (const q of [a, b]) {
    for (let i = 0; i < 4; i++) {
      const p = q[i], r = q[(i + 1) % 4], ax = -(r[1] - p[1]), ay = r[0] - p[0]
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity
      for (const c of a) { const v = c[0] * ax + c[1] * ay; a0 = Math.min(a0, v); a1 = Math.max(a1, v) }
      for (const c of b) { const v = c[0] * ax + c[1] * ay; b0 = Math.min(b0, v); b1 = Math.max(b1, v) }
      if (a1 <= b0 || b1 <= a0) return false
    }
  }
  return true
}
/** whether a point stands in a convex quad (its corners in either turn), within half a PDF unit */
function inConvex(q, [x, y]) {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i], [bx, by] = q[(i + 1) % 4], l = Math.hypot(bx - ax, by - ay) || 1
    const c = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / l
    if (Math.abs(c) <= 0.5) continue
    const s = Math.sign(c)
    if (sign && s !== sign) return false
    sign = s
  }
  return true
}
/** whether a point stands inside a fill's closed edges (each [x0, y0, x1, y1, …]), even-odd */
function holdsEvenOdd(edges, [x, y]) {
  let inside = false
  for (const [x0, y0, x1, y1] of edges) if ((y0 > y) !== (y1 > y) && x < x0 + ((y - y0) * (x1 - x0)) / (y1 - y0)) inside = !inside
  return inside
}
/** whether a segment (with half a line width `w` about it) meets a convex quad */
function segmentMeets(q, x0, y0, x1, y1, w) {
  if (w > 0) {
    // (a stroke as its own quad: the segment widened by its half width both ways)
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * w, ny = (dx / l) * w, ex = (dx / l) * w, ey = (dy / l) * w
    return quadsMeet(q, [[x0 - ex + nx, y0 - ey + ny], [x1 + ex + nx, y1 + ey + ny], [x1 + ex - nx, y1 + ey - ny], [x0 - ex - nx, y0 - ey - ny]])
  }
  return quadsMeet(q, [[x0, y0], [x1, y1], [x1, y1], [x0, y0]])
}

/**
 * One placed image's labels. `image` { data, width, height, kind } (PDF.js's decoding); `lines` the recogniser's for it
 * (src/shared/ocr.ts OcrLine: normalised corners, origin top left, in reading order); `place` { page, ctm, clip, view }: the
 * transform its unit square is drawn by on its page (PDF units), the clip in force there (convex quads in PDF units, each of which
 * a patch must stand in, or 'complex' for a clip no quad is), the page's view; `others` the page's ink over the image a patch must
 * not cover: { boxes: [[x0, y0, x1, y1]] (its text), segs: [[x0, y0, x1, y1, halfWidth]] (the paths drawn after the image), fills
 * ([segs] of each fill among them) }, PDF units, or null where it is more than can be read (every label `covered`); `taken` the
 * patches already drawn on its page by the images before it (PDF units, each a quad), added to.
 * Returns { units, left }: `units` each { text, lines (count), size, anchor, bg, fg (0xRRGGBB), quads: [line quad, patch quad]
 * per line (PDF units, ↖ ↗ ↘ ↙ in the line's reading) }; `left` each { text, why } (OCR_WHYS)
 */
export function labelsOf({ image, lines, place, others = { boxes: [], segs: [], fills: [] }, taken = [], limit = OCR_UNITS_IMAGE }) {
  const W = image.width, H = image.height, px = pixelReader(image)
  const [a, b, c, d, e, f0] = place.ctm
  // (an image pixel's place on the page: its unit square from the image's bottom row up, PDF's)
  const toPage = ([x, y]) => [a * (x / W) + c * (1 - y / H) + e, b * (x / W) + d * (1 - y / H) + f0]
  const boxes = linesToBoxes(lines)
  const frames = lines.map(l => frameOf(l.quad.map(([x, y]) => [x * W, y * H])))
  const ok = f => f.L > 0 && f.T > 0 && Math.abs(f.det) > 1e-6
  // (every line's quad, the box its ink is in, whether a label holds it or not: a number, a letter alone is kept, its ink a patch
  // must not cover; and its bounds, so that a line asks only the lines near it)
  const lineQuads = frames.map(f => (ok(f) ? quadOf(f, [0, 0, f.L, f.T]) : null))
  const lineBounds = lineQuads.map(q => (q ? boundsOf(q, W, H) : null))
  const member = new Set(boxes.flatMap(bx => bx.members))
  const units = [], left = []
  const near = (i, b) => lineBounds.flatMap((lb, j) => (j !== i && lb && lb[0] < b[2] && lb[2] > b[0] && lb[1] < b[3] && lb[3] > b[1] ? [j] : []))
  const inLine = (js, x, y) => {
    for (const j of js) {
      const [s, t] = inFrame(frames[j], x, y)
      if (s >= 0 && s <= frames[j].L && t >= 0 && t <= frames[j].T) return true
    }
    return false
  }
  /**
   * A line's patch and its reading of its pixels: the first of TRIES whose ring is flat and that covers no ink of another line (where it meets another line's box, the pixels there
   * are all its ring's colour: a line's box has room round its ink, and two boxes that meet over ink are no two labels a patch
   * can tell apart); then its ink's
   * colour, its inside crowded or not, and the ink before and after it along its baseline (distances in pixels)
   */
  const readLine = i => {
    // (the ring's pixels in another line's box are that line's, but those right at the patch's edge: ink there is ink the patch's
    // edge cuts, its own line's or another's)
    const f = frames[i], ring = Math.max(RING_MIN_PX, RING * f.T), edge = Math.max(RING_MIN_PX, EDGE * f.T)
    let r = null, bg = null, why = 'busy'
    for (const k of TRIES) {
      const p = patchOf(f, W, H, k.map(v => v * f.T))
      if (!p) return { why: 'outside' }
      const outer = [p[0] - ring, p[1] - ring, p[2] + ring, p[3] + ring]
      const ob = boundsOf(quadOf(f, outer), W, H), nearby = near(i, ob)
      const ringPx = [], edgePx = [], shared = []
      for (let y = ob[1]; y < ob[3]; y++) for (let x = ob[0]; x < ob[2]; x++) {
        const [s, t] = inFrame(f, x + 0.5, y + 0.5)
        if (!holds(outer, s, t)) continue
        const mine = holds(p, s, t), other = inLine(nearby, x + 0.5, y + 0.5)
        // (inside the patch and in another line's box: what the patch would cover of that line's, which must be no ink of it)
        if (mine) { if (other) shared.push(px(x, y)); continue }
        const q = px(x, y)
        if (Math.max(p[0] - s, s - p[2], p[1] - t, t - p[3]) <= edge) edgePx.push(q)
        if (!other) ringPx.push(q)
      }
      if (ringPx.length < RING_MIN) { why = 'busy'; continue }
      const colour = modeOf(ringPx)
      let flat = 0, cut = 0
      for (const q of ringPx) if (dist(q, colour) <= NEAR) flat++
      if (flat < RING_FLAT * ringPx.length) { why = 'busy'; continue }
      for (const q of edgePx) if (dist(q, colour) > NEAR) cut++
      if (cut > Math.max(EDGE_OFF_MIN, EDGE_OFF * edgePx.length)) { why = 'busy'; continue }
      if (shared.some(q => dist(q, colour) > NEAR)) { why = 'overlap'; continue }
      // (a patch drawn in past where its own ink is leaves that ink at its edge: its ring is then no longer flat, above)
      r = p; bg = colour
      break
    }
    if (!r) return { why }
    const inside = []
    const [ix0, iy0, ix1, iy1] = boundsOf(lineQuads[i], W, H)
    for (let y = iy0; y < iy1; y++) for (let x = ix0; x < ix1; x++) {
      const [s, t] = inFrame(f, x + 0.5, y + 0.5)
      if (s >= 0 && s <= f.L && t >= 0 && t <= f.T) inside.push(px(x, y))
    }
    const ink = inside.filter(q => dist(q, bg) > NEAR)
    const fg = modeOf(ink)
    if (!fg) return { why: 'busy' }
    let off = 0
    for (const q of inside) if (offSegment(q, bg, fg) > NEAR) off++
    if (off > CROWD * inside.length) return { why: 'crowded' }
    // (the ink nearest before its patch along its band, and after it, within the reach: a marker, an axis, another word)
    const reach = ANCHOR_REACH * OCR_SIZE * f.T
    let before = Infinity, after = Infinity
    const strip = [r[0] - reach, 0, r[2] + reach, f.T]
    const [sx0, sy0, sx1, sy1] = boundsOf(quadOf(f, strip), W, H)
    for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) {
      const [s, t] = inFrame(f, x + 0.5, y + 0.5)
      if (t < 0 || t > f.T || (s >= r[0] && s <= r[2]) || s < strip[0] || s > strip[2]) continue
      if (dist(px(x, y), bg) <= NEAR) continue
      if (s < r[0]) before = Math.min(before, r[0] - s)
      else after = Math.min(after, s - r[2])
    }
    return { why: null, patch: quadOf(f, r), bg, fg, before, after }
  }
  for (const bx of boxes) {
    const text = bx.text.replace(/\s+/gu, ' ').trim()
    if (bx.members.length > OCR_LINES_MAX || text.length > OCR_TEXT_MAX) { left.push({ text, why: 'long' }); continue }
    if (units.length >= limit) { left.push({ text, why: 'past' }); continue }
    let why = null
    const read = []
    for (const i of bx.members) {
      if (!lineQuads[i]) { why = 'outside'; break }
      const r = readLine(i)
      if (r.why) { why = r.why; break }
      read.push({ i, ...r })
    }
    if (why) { left.push({ text, why }); continue }
    // (on the page: each line's quad and its patch, by its placement)
    const quads = read.map(({ i, patch }) => [lineQuads[i].map(toPage), patch.map(toPage)])
    // (a placement that mirrors the image turns its text over: its frame's across no longer at its along's right hand)
    const mirrored = quads.some(([q]) => { const ux = q[1][0] - q[0][0], uy = q[1][1] - q[0][1], dx = q[3][0] - q[0][0], dy = q[3][1] - q[0][1]; return ux * dy - uy * dx > 0 })
    if (mirrored) { left.push({ text, why: 'mirrored' }); continue }
    const V = place.view
    const off = ([x, y]) => (V && (x < Math.min(V[0], V[2]) - 0.5 || x > Math.max(V[0], V[2]) + 0.5 || y < Math.min(V[1], V[3]) - 0.5 || y > Math.max(V[1], V[3]) + 0.5))
    const C = place.clip
    const clipped = pt => C === 'complex' || (Array.isArray(C) && C.some(q => !inConvex(q, pt)))
    if (quads.some(([, p]) => p.some(clipped) || p.some(off))) { left.push({ text, why: 'clipped' }); continue }
    // (its patches clear of the patches another image's labels drew before it on its page, and of the page's own ink over the
    // image: its pixels are not this image's, and a patch would cover them)
    if (quads.some(([, p]) => taken.some(k => quadsMeet(p, k)))) { left.push({ text, why: 'overlap' }); continue }
    const box = q => [Math.min(...q.map(p => p[0])), Math.min(...q.map(p => p[1])), Math.max(...q.map(p => p[0])), Math.max(...q.map(p => p[1]))]
    const covered = others === null || quads.some(([, p]) => {
      const [bx0, by0, bx1, by1] = box(p)
      // (a fill drawn over the image that holds the patch whole: its edges meet none of it)
      const mid = [(p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2]
      if ((others.fills ?? []).some(edges => holdsEvenOdd(edges, mid))) return true
      if (others.boxes.some(([x0, y0, x1, y1]) => x1 > bx0 && x0 < bx1 && y1 > by0 && y0 < by1 && quadsMeet(p, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]))) return true
      return others.segs.some(([x0, y0, x1, y1, w]) => Math.max(x0, x1) + w > bx0 && Math.min(x0, x1) - w < bx1 && Math.max(y0, y1) + w > by0 && Math.min(y0, y1) - w < by1 && segmentMeets(p, x0, y0, x1, y1, w))
    })
    if (covered) { left.push({ text, why: 'covered' }); continue }
    // (its size the extension's share of its thinnest line on the page; its anchor its lines' where they agree, else the middle)
    const size = OCR_SIZE * Math.min(...quads.map(([q]) => Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1])))
    const anchors = read.map(({ i, before, after }, k) => {
      // (the ink's distances on the page: the line's pixels to PDF units across its thickness)
      const [q] = quads[k], scale = Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]) / (frames[i].T || 1)
      const b0 = before * scale, a0 = after * scale
      return Math.max(b0, 0) * ANCHOR_RATIO < Math.max(a0, 0) ? 'start' : Math.max(a0, 0) * ANCHOR_RATIO < Math.max(b0, 0) ? 'end' : 'centre'
    })
    const anchor = anchors.every(x => x === anchors[0]) ? anchors[0] : 'centre'
    // (its colours its first line's: a label is one ground and one ink)
    units.push({ text, lines: read.length, size, anchor, bg: rgbOf(read[0].bg), fg: rgbOf(read[0].fg), quads })
    for (const [, p] of quads) taken.push(p)
  }
  return { units, left, read: lines.length, member: member.size }
}
