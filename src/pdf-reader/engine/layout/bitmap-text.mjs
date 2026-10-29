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
// it from its first to its fourth; its length L and its thickness T. A label's patch is over its line, or, for a label of several
// lines, over the block they make (one patch: the room between two lines and a descender in it covered, no seam between two
// patches): its box grown by PATCH_PAD of T on each side (less where the image's edge is nearer: a patch never leaves its image),
// a side that fails drawn in, to none, then into the box by PATCH_PAD and twice it; its ring the band RING of T wide around it,
// its edge the band EDGE of T right outside it. A label is drawn only where:
//   - its ring is flat: RING_FLAT of the ring's pixels within NEAR of the ring's colour, the patch's ground (no ink reaches past
//     the patch: what it covers is its lines' ink whole, and nothing else of the figure's); a pixel of a box no line of the label
//     holds is not the ring's (that line's ink is its own label's, or kept), but at the patch's edge, where every pixel is read
//     within NEAR_EDGE (a glyph the patch's edge would cut, its faint antialiased tip);
//   - it covers no ink of another line: where it meets another line's box, the pixels there are the ground's (a number, a letter
//     alone, another label's text: kept);
//   - each line's box holds that line's ink alone: no more than CROWD of its pixels off the colours between the ground's and the
//     ink's (a marker of another colour, a line of the plot through the label);
//   - it is clear of the page's own ink over the image (its text, a path drawn after it, a fill holding it), which a patch would
//     cover, and of a patch another image drew on its page; inside the clip in force and the page; its frame not mirrored by its
//     placement.
// Else it stays the original's, its reason told (`busy`, `crowded`, `overlap`, `covered`, `clipped`, `mirrored`, `outside`,
// `long`, `past`). Its text size is the extension's (core/renderer/image.ts fontBounds: 72 % of its thinnest line's thickness),
// its colours the ground's and the ink's, and its anchor read as a vector figure's is (layout/figure-text.mjs): `start` where ink
// stands right before it along its baseline and none as near after it (a legend's marker), `end` the other way, else `centre`.
//
// An original module (no port statement).
import { linesToBoxes } from '../../../core/image/boxes.ts'

/** a patch grows each side of its line by this share of the line's thickness (a det box holds its line's ink with room; this is
 *  the antialiased edge and a descender's foot) */
export const PATCH_PAD = 0.08
/** the ring around a patch: this share of the line's thickness wide, at least RING_MIN_PX */
export const RING = 0.15
const RING_MIN_PX = 2
/** the band right outside a patch, this share of its lines' thickness (at least RING_MIN_PX), every pixel of which is read,
 *  another line's box or not: ink there is a glyph the patch's edge would cut */
const EDGE = 0.06
/** …of which this share at most is ink (a JPEG's noise; none in a band of fewer than 500 pixels): past it a glyph crosses the
 *  patch's edge */
const EDGE_OFF = 0.002
/** a pixel at a patch's edge is ink past this distance from the ground's colour: closer than NEAR, a glyph's faint tip */
const NEAR_EDGE = 20
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

// (a colour packed 0xRRGGBB, as the pixels are read: no array a pixel)
const NEAR2 = NEAR * NEAR
/** whether two packed colours are apart, past NEAR */
const apartC = (c, r, g, b) => { const dr = (c >>> 16) - r, dg = ((c >>> 8) & 255) - g, db = (c & 255) - b; return dr * dr + dg * dg + db * db > NEAR2 }
/** …past NEAR_EDGE: at a patch's edge a glyph's faint antialiased tip shows */
const NEAR_EDGE2 = NEAR_EDGE * NEAR_EDGE
const apartEdge = (c, r, g, b) => { const dr = (c >>> 16) - r, dg = ((c >>> 8) & 255) - g, db = (c & 255) - b; return dr * dr + dg * dg + db * db > NEAR_EDGE2 }
/** a packed colour's distance to the colours between two (antialiased ink on its ground lies there), squared, past NEAR */
function offSegment(c, a, b) {
  const pr = c >>> 16, pg = (c >>> 8) & 255, pb = c & 255
  const dr = b[0] - a[0], dg = b[1] - a[1], db = b[2] - a[2], dd = dr * dr + dg * dg + db * db
  const k = dd === 0 ? 0 : Math.max(0, Math.min(1, ((pr - a[0]) * dr + (pg - a[1]) * dg + (pb - a[2]) * db) / dd))
  const er = pr - a[0] - k * dr, eg = pg - a[1] - k * dg, eb = pb - a[2] - k * db
  return er * er + eg * eg + eb * eb > NEAR2
}
const rgbOf = c => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2])

/**
 * A pixel reader of an image as PDF.js decodes one (`kind` 1: one bit a pixel, rows padded to a byte, 1 white; 2: RGB; 3: RGBA),
 * each pixel as the page shows it over white: (x, y) → 0xRRGGBB, x and y integers inside the image
 */
export function pixelReader({ data, width, kind }) {
  if (kind === 1) {
    const row = (width + 7) >> 3
    return (x, y) => ((data[y * row + (x >> 3)] >> (7 - (x & 7))) & 1 ? 0xffffff : 0)
  }
  if (kind === 2) return (x, y) => { const i = 3 * (y * width + x); return (data[i] << 16) | (data[i + 1] << 8) | data[i + 2] }
  return (x, y) => {
    const i = 4 * (y * width + x), a = data[i + 3]
    if (a === 255) return (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
    const over = v => Math.round((v * a + 255 * (255 - a)) / 255)
    return (over(data[i]) << 16) | (over(data[i + 1]) << 8) | over(data[i + 2])
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
/** the side of patch `p` ([s0, t0, s1, t1]: start, top, end, foot) a point outside it stands past the most: 0 to 3 */
function farthestOut(p, s, t) {
  const d = [p[0] - s, p[1] - t, s - p[2], t - p[3]]
  let k = 0
  for (let j = 1; j < 4; j++) if (d[j] > d[k]) k = j
  return k
}
/** the side of patch `p` a point inside it is nearest */
function nearestIn(p, s, t) {
  const d = [s - p[0], t - p[1], p[2] - s, p[3] - t]
  let k = 0
  for (let j = 1; j < 4; j++) if (d[j] < d[k]) k = j
  return k
}
const quadOf = (f, r) => [at(f, r[0], r[1]), at(f, r[2], r[1]), at(f, r[2], r[3]), at(f, r[0], r[3])]
const holds = (r, s, t) => s >= r[0] && s <= r[2] && t >= r[1] && t <= r[3]

/** the pixels whose centres a quad's bounds hold, inside the image: [x0, y0, x1, y1] (x1, y1 exclusive) */
function boundsOf(q, W, H) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of q) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  return [Math.max(0, Math.floor(x0)), Math.max(0, Math.floor(y0)), Math.min(W, Math.ceil(x1)), Math.min(H, Math.ceil(y1))]
}

/** the colour most of a list of packed colours are (5 bits a channel), as their mean [r, g, b]; null for none */
function modeOf(colours, n = colours.length) {
  if (!n) return null
  const bins = new Map()
  for (let i = 0; i < n; i++) {
    const c = colours[i], r = c >>> 16, g = (c >>> 8) & 255, b = c & 255, k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    const e = bins.get(k)
    if (e) { e.n++; e.r += r; e.g += g; e.b += b } else bins.set(k, { n: 1, r, g, b })
  }
  let best = null
  for (const e of bins.values()) if (!best || e.n > best.n) best = e
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
 * Returns { units, left, sets }: `units` each { text, lines (count), size, anchor, bg, fg (0xRRGGBB), quads: [line quad, patch
 * quad] per line (PDF units, ↖ ↗ ↘ ↙ in the line's reading), set (the index among `units` of its set's first: setsOf) }; `left`
 * each { text, why } (OCR_WHYS); `sets` setsOf's counts
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
  /** the lines but `own` whose boxes meet bounds `b` */
  const near = (own, b) => lineBounds.flatMap((lb, j) => (!own.has(j) && lb && lb[0] < b[2] && lb[2] > b[0] && lb[1] < b[3] && lb[3] > b[1] ? [j] : []))
  const inLine = (js, x, y) => {
    for (const j of js) {
      const [s, t] = inFrame(frames[j], x, y)
      if (s >= 0 && s <= frames[j].L && t >= 0 && t <= frames[j].T) return true
    }
    return false
  }
  /**
   * A label's patch: over its line, or over the block its lines make (the box round them all, one patch, so that the room between
   * two lines, a descender of the first, is covered too and no seam between two patches shows). The largest it can hold: grown
   * PATCH_PAD of its lines' thickness each side, a side that fails drawn in — to none, then into the box by PATCH_PAD and twice it,
   * no more (a box holds its line's ink with room, and the ring tells whether a patch drawn in still holds it all) — until its ring
   * is flat, no ink stands right at its edge (a glyph it would cut: every pixel of the band read, whoever's box it is in) and it
   * covers no ink of another line (where it meets a box no line of the label's is, the pixels there are all its ground's colour:
   * a line's box has room round its ink, and two boxes that meet over ink are no two labels a patch can tell apart). `f` the
   * frame (a line's, or the block's), `T` its lines' thickness, `own` the label's lines. { why } or { patch, bg }
   */
  const readArea = (f, T, own) => {
    const pad = PATCH_PAD * T, ring = Math.max(RING_MIN_PX, RING * T), edge = Math.max(RING_MIN_PX, EDGE * T)
    const g = [pad, pad, pad, pad]
    const widest = patchOf(f, W, H, g)
    if (!widest) return { why: 'outside' }
    const ob = boundsOf(quadOf(f, [widest[0] - ring, widest[1] - ring, widest[2] + ring, widest[3] + ring]), W, H)
    const nearby = near(own, ob), mine = [...own]
    let bg = null, why = 'busy'
    const ringPx = new Int32Array(Math.max(16, (ob[2] - ob[0]) * (ob[3] - ob[1])))
    for (let step = 0; step < 8; step++) {
      const p = patchOf(f, W, H, g)
      if (!p) return { why: 'outside' }
      const outer = [p[0] - ring, p[1] - ring, p[2] + ring, p[3] + ring]
      const [x0, y0, x1, y1] = boundsOf(quadOf(f, outer), W, H)
      // (by side of the patch, start, top, end, foot: the ring's pixels and those off its colour, the edge's, the shared ink)
      const ringN = [0, 0, 0, 0], ringOff = [0, 0, 0, 0], edgeN = [0, 0, 0, 0], edgeOff = [0, 0, 0, 0], sharedOff = [0, 0, 0, 0]
      let n = 0
      const sides = []
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const [s0, t] = inFrame(f, x + 0.5, y + 0.5)
        if (s0 < outer[0] || s0 > outer[2] || t < outer[1] || t > outer[3]) continue
        const c = px(x, y), other = nearby.length ? inLine(nearby, x + 0.5, y + 0.5) : false
        if (s0 >= p[0] && s0 <= p[2] && t >= p[1] && t <= p[3]) {
          // (inside the patch and in another line's box: what the patch would cover of that line's)
          if (other) sides.push(-1 - nearestIn(p, s0, t), c)
          continue
        }
        const side = farthestOut(p, s0, t), d = Math.max(p[0] - s0, s0 - p[2], p[1] - t, t - p[3])
        if (d <= edge) { edgeN[side]++; sides.push(side, c) }
        // (a pixel of the label's own lines past the patch is its ink: the ring's to judge, as any)
        if (!other || inLine(mine, x + 0.5, y + 0.5)) { ringPx[n++] = c; ringN[side]++; sides.push(4 + side, c) }
      }
      if (n < RING_MIN) return { why: 'busy' }
      bg ??= modeOf(ringPx, n)
      const [r, gg, b] = bg
      for (let k = 0; k < sides.length; k += 2) {
        const at2 = sides[k], c = sides[k + 1]
        if (at2 < 0) { if (apartC(c, r, gg, b)) sharedOff[-1 - at2]++ } else if (at2 < 4) { if (apartEdge(c, r, gg, b)) edgeOff[at2]++ } else if (apartC(c, r, gg, b)) ringOff[at2 - 4]++
      }
      const ringTotal = ringN.reduce((a2, v) => a2 + v, 0), offTotal = ringOff.reduce((a2, v) => a2 + v, 0)
      const bad = [0, 1, 2, 3].filter(k => sharedOff[k] > 0 || edgeOff[k] > Math.floor(EDGE_OFF * edgeN[k]) || (ringOff[k] > (1 - RING_FLAT) * Math.max(ringN[k], 1) && ringOff[k] > 2))
      if (!bad.length && offTotal <= (1 - RING_FLAT) * ringTotal) return { patch: quadOf(f, p), bg }
      why = bad.some(k => sharedOff[k] > 0) ? 'overlap' : 'busy'
      // (each failing side drawn in by a step, none past twice PATCH_PAD into the box; a ring off as a whole with no side to blame
      // draws in every side)
      let moved = false
      for (const k of bad.length ? bad : [0, 1, 2, 3]) {
        const next = g[k] > 0 ? 0 : g[k] - pad
        if (next < -2 * pad - 1e-9) continue
        g[k] = next
        moved = true
      }
      if (!moved) break
    }
    return { why }
  }
  /** a line's ink under its label's ground: its colour, its inside crowded or not, the ink before and after its box along its
   *  baseline (pixels, its anchor's evidence) */
  const readInk = (i, bg, own) => {
    const f = frames[i], inside = []
    const [ix0, iy0, ix1, iy1] = boundsOf(lineQuads[i], W, H)
    for (let y = iy0; y < iy1; y++) for (let x = ix0; x < ix1; x++) {
      const [s0, t] = inFrame(f, x + 0.5, y + 0.5)
      if (s0 >= 0 && s0 <= f.L && t >= 0 && t <= f.T) inside.push(px(x, y))
    }
    const [r0, g0, b0] = bg
    const ink = inside.filter(c => apartC(c, r0, g0, b0))
    const fg = modeOf(ink)
    if (!fg) return { why: 'busy' }
    let off = 0
    for (const c of inside) if (offSegment(c, bg, fg)) off++
    if (off > CROWD * inside.length) return { why: 'crowded' }
    // (the ink nearest before its box along its band, and after it, within the reach, the label's own lines aside: a marker, an
    // axis, another word)
    const reach = ANCHOR_REACH * OCR_SIZE * f.T, mine = [...own]
    let before = Infinity, after = Infinity
    const strip = [-reach, 0, f.L + reach, f.T]
    const [sx0, sy0, sx1, sy1] = boundsOf(quadOf(f, strip), W, H)
    for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) {
      const [s0, t] = inFrame(f, x + 0.5, y + 0.5)
      if (t < 0 || t > f.T || (s0 >= 0 && s0 <= f.L) || s0 < strip[0] || s0 > strip[2]) continue
      if (!apartC(px(x, y), r0, g0, b0) || inLine(mine, x + 0.5, y + 0.5)) continue
      if (s0 < 0) before = Math.min(before, -s0)
      else after = Math.min(after, s0 - f.L)
    }
    return { why: null, fg, before, after }
  }
  for (const bx of boxes) {
    const text = bx.text.replace(/\s+/gu, ' ').trim()
    if (bx.members.length > OCR_LINES_MAX || text.length > OCR_TEXT_MAX) { left.push({ text, why: 'long' }); continue }
    if (units.length >= limit) { left.push({ text, why: 'past' }); continue }
    if (bx.members.some(i => !lineQuads[i])) { left.push({ text, why: 'outside' }); continue }
    const own = new Set(bx.members)
    // (one line's frame, or the block's: the box round every line of the label, upright as the extension merges them)
    const T = [...bx.members].map(i => frames[i].T).sort((x, y) => x - y)[(bx.members.length - 1) >> 1]
    let area
    if (bx.members.length === 1) area = frames[bx.members[0]]
    else {
      const pts = bx.members.flatMap(i => lineQuads[i])
      const x0 = Math.min(...pts.map(q => q[0])), y0 = Math.min(...pts.map(q => q[1])), x1 = Math.max(...pts.map(q => q[0])), y1 = Math.max(...pts.map(q => q[1]))
      area = frameOf([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])
    }
    const got = readArea(area, T, own)
    if (got.why) { left.push({ text, why: got.why }); continue }
    let why = null
    const read = []
    for (const i of bx.members) {
      const r = readInk(i, got.bg, own)
      if (r.why) { why = r.why; break }
      read.push({ i, patch: got.patch, bg: got.bg, ...r })
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
  const sets = setsOf(units)
  return { units, left, read: lines.length, member: member.size, sets }
}

/** labels share a column where their starts, ends or middles along their direction lie within this share of their size (the
 *  recogniser's boxes stand round their ink by a margin of their own, a pixel or two either way) */
export const SET_ALIGN = 0.3
/** …and lie on one baseline within it; labels join a set only where their sizes (the recogniser's lines' thickness, which a
 *  descender or a capital moves) are within this ratio of each other */
export const SET_SIZE = 1.35
/** two labels of one direction: their directions within this (radians' sine) */
const SET_TURN = 0.05
/** the edges a column may share, in the order a tie between them is broken (a column is read from its start) */
const SET_EDGES = Object.freeze(['start', 'end', 'centre'])

/**
 * One image's labels in their sets (the owner's rule of 2026-10-29 for a figure's labels, PDF-READER §19.12, as layout/
 * figure-text.mjs setsOf reads a vector figure's): a column is the labels of one direction whose starts, ends or middles along
 * it lie on one line across it, within SET_ALIGN of their size, sizes within SET_SIZE; a label in a column with another keeps
 * that column's edge as its anchor (the edge the most labels share; a tie, the one the most of them read alone, else the first
 * of SET_EDGES), whatever it read alone; a set is the labels of one column of one edge and the one-line labels on one baseline,
 * joined. A set's labels are drawn at one size, the median of their sizes (the recogniser's thickness puts one figure's labels
 * of one size apart: the Transformer's "Linear" boxes read 4.4, 5.0 and 5.3), and shrunk by one factor (layer-proto/ocr-fit.mjs).
 * Sets each unit's `set` (its set's first unit's index), `anchor` and `size`; returns { sets (of two labels or more), grouped
 * (labels in them), aligned (anchors the column changed), sized (sizes the median changed) }
 */
export function setsOf(units) {
  const out = { sets: 0, grouped: 0, aligned: 0, sized: 0 }
  units.forEach((u, i) => { u.set = i })
  if (units.length < 2) return out
  const geo = units.map(u => {
    const q = u.quads[0][0], L = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) || 1, ux = (q[1][0] - q[0][0]) / L, uy = (q[1][1] - q[0][1]) / L
    const along = u.quads.flatMap(([l]) => l.map(([x, y]) => x * ux + y * uy))
    const start = Math.min(...along), end = Math.max(...along)
    // (a line's baseline across its direction: its bottom edge's, the quad's fourth corner)
    return { ux, uy, start, end, centre: (start + end) / 2, base: q[3][1] * ux - q[3][0] * uy, one: u.quads.length === 1, size: u.size }
  })
  const like = (a, b) => Math.abs(geo[a].ux * geo[b].uy - geo[a].uy * geo[b].ux) < SET_TURN && geo[a].ux * geo[b].ux + geo[a].uy * geo[b].uy > 0 && Math.max(geo[a].size, geo[b].size) <= SET_SIZE * Math.min(geo[a].size, geo[b].size)
  const tol = (a, b) => SET_ALIGN * Math.min(geo[a].size, geo[b].size)
  const find = (parent, i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
  // (each edge's columns: every two labels alike on that edge joined)
  const cols = SET_EDGES.map(edge => {
    const parent = Int32Array.from(units, (_, i) => i)
    for (let a = 0; a < units.length; a++) for (let b = a + 1; b < units.length; b++) if (like(a, b) && Math.abs(geo[a][edge] - geo[b][edge]) <= tol(a, b)) parent[find(parent, b)] = find(parent, a)
    const size = new Map(), votes = new Map()
    units.forEach((u, i) => {
      const c = find(parent, i)
      size.set(c, (size.get(c) ?? 0) + 1)
      const v = votes.get(c) ?? votes.set(c, { start: 0, end: 0, centre: 0 }).get(c)
      v[u.anchor]++
    })
    return { edge, parent, size, votes }
  })
  // (each label's column: of those it shares with another, the one of the most labels; a tie, by its labels' readings alone of
  // that edge, then SET_EDGES' order)
  const chosen = units.map((_, i) => {
    let best = null
    for (const c of cols) {
      const r = find(c.parent, i), n = c.size.get(r)
      if (n < 2) continue
      const vote = c.votes.get(r)[c.edge]
      if (!best || n > best.n || (n === best.n && vote > best.vote)) best = { n, vote, edge: c.edge, id: `${c.edge}:${r}` }
    }
    return best
  })
  const parent = Int32Array.from(units, (_, i) => i)
  const join = (a, b) => { const x = find(parent, a), y = find(parent, b); if (x !== y) parent[Math.max(x, y)] = Math.min(x, y) }
  const firstOf = new Map()
  chosen.forEach((c, i) => { if (c) { if (firstOf.has(c.id)) join(firstOf.get(c.id), i); else firstOf.set(c.id, i) } })
  for (let a = 0; a < units.length; a++) for (let b = a + 1; b < units.length; b++) if (geo[a].one && geo[b].one && like(a, b) && Math.abs(geo[a].base - geo[b].base) <= tol(a, b)) join(a, b)
  const members = new Map()
  units.forEach((u, i) => {
    const c = chosen[i]
    if (c && c.edge !== u.anchor) { u.anchor = c.edge; out.aligned++ }
    u.set = find(parent, i)
    ;(members.get(u.set) ?? members.set(u.set, []).get(u.set)).push(u)
  })
  for (const list of members.values()) {
    if (list.length < 2) continue
    out.sets++; out.grouped += list.length
    const sizes = list.map(u => u.size).sort((a, b) => a - b), mid = sizes.length >> 1
    const median = sizes.length % 2 ? sizes[mid] : (sizes[mid - 1] + sizes[mid]) / 2
    for (const u of list) if (Math.abs(u.size - median) > 1e-9) { u.size = median; out.sized++ }
  }
  return out
}
