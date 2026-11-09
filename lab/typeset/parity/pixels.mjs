// lab/typeset/parity/pixels.mjs: the pixel readings of the measures that judge each side's drawing against arXiv's page
// itself (lane rc-gate, 2026-11-08), pure functions over RGBA pixels (a canvas's ImageData `data`, `W` × `H`). render.mjs
// hands the module's source to the lab's blank page (each `export` dropped, the functions on `globalThis.parityPixels`), where
// analyse.mjs reads the shots with them; the tests call them on synthetic pixels. No imports: the browser takes it as it is.
//   overOf      a side's translated text drawn over other ink: its text-alone shot's ink where its text-less shot (the copy,
//               the original's ink it keeps, its crops) has ink too, at the same device pixel
//   darkOf      the mean darkness of the glyph pixels in a set of pixels: the weight a text is drawn at
//   partsOf     the original's glyphs a side shows in part (erasure slivers): each connected stroke of arXiv's ink inside the
//               side's translated units' regions, how much of it the side's text-less shot shows in place
//   shownOf     how much of arXiv's ink in a box a side's text-less shot shows in place (an element kept as the original's)

/** a pixel's darkness, 1 − its luminance (Rec. 709), RGBA at pixel `p` */
export function darkAt(d, p) {
  const i = p * 4
  return 1 - (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255
}

/** the pixels seen by the last pixelsOf call: one array of the page's size, stamped with a call's number, reused */
const SEEN = { stamp: new Int32Array(0), call: 0 }

/** the device pixels of PDF boxes [x0, y0, x1, y1] (y up) on a page drawn from `view`'s top-left corner at `scale` device px
 *  a point, each once (an Int32Array of indices) */
export function pixelsOf(boxes, view, scale, W, H) {
  if (SEEN.stamp.length !== W * H) SEEN.stamp = new Int32Array(W * H)
  const seen = SEEN.stamp
  const call = ++SEEN.call
  const out = []
  for (const [x0, y0, x1, y1] of boxes) {
    const c0 = Math.max(0, Math.floor((x0 - view[0]) * scale)),
      c1 = Math.min(W, Math.ceil((x1 - view[0]) * scale))
    const r0 = Math.max(0, Math.floor((view[3] - y1) * scale)),
      r1 = Math.min(H, Math.ceil((view[3] - y0) * scale))
    for (let r = r0; r < r1; r++)
      for (let c = c0; c < c1; c++) {
        const p = r * W + c
        if (seen[p] !== call) {
          seen[p] = call
          out.push(p)
        }
      }
  }
  return Int32Array.from(out)
}

/** the mask of PDF boxes (1 inside any) */
export function maskOf(boxes, view, scale, W, H) {
  const m = new Uint8Array(W * H)
  for (const p of pixelsOf(boxes, view, scale, W, H)) m[p] = 1
  return m
}

/** INK: a pixel is ink where its darkness is at least this (half the way to black: an antialiased edge's lighter half is not) */
export const INK = 0.5

/** how many of `px` hold ink in both shots: `t` the side's text alone, `c` its drawing without its text */
export function overOf(t, c, px) {
  let n = 0
  for (const p of px) if (darkAt(t, p) >= INK && darkAt(c, p) >= INK) n++
  return n
}

/** the mean darkness of the glyph pixels (darkness `min` or more) among `px`, outside `skip` where given, and their count */
export function darkOf(d, px, min = 0.1, skip = null) {
  let sum = 0,
    n = 0
  for (const p of px) {
    if (skip?.[p]) continue
    const k = darkAt(d, p)
    if (k >= min) {
      sum += k
      n++
    }
  }
  return { mean: n ? Math.round((sum / n) * 10000) / 10000 : null, pixels: n }
}

/** whether shot `c` holds ink at pixel p or within one device pixel of it (the same ink drawn a sub-pixel phase apart),
 *  none of it in `skip` (a moved crop's place: its ink is not arXiv's in place, there or a device pixel beside it) */
function inkNear(c, p, W, H, skip = null) {
  const x = p % W,
    y = (p / W) | 0
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx,
        Y = y + dy
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue
      const q = Y * W + X
      if (!skip?.[q] && darkAt(c, q) >= INK) return true
    }
  return false
}

/** a stroke of more pixels than this is no glyph's (a rule, a figure's frame) */
const STROKE_MAX = 20000

/**
 * The original's glyphs a side shows in part: each connected stroke (8-neighbours) of arXiv's ink (`a`) nine tenths or more
 * inside `region` (the side's translated units' original lines), with how many of its pixels the side's text-less shot (`c`)
 * shows in place (its ink there or within a device pixel), outside `skip` (the places a side draws a moved crop, whose ink
 * is not arXiv's in place: a pixel beside one is not shown by its ink either). Returns the strokes shown at all and not whole: { box: [c0, r0, c1, r1] device px, size, shown }
 */
export function partsOf(a, c, region, skip, W, H) {
  const label = new Int32Array(W * H)
  const out = []
  const stack = new Int32Array(W * H)
  let next = 0
  for (let p0 = 0; p0 < W * H; p0++) {
    if (!region[p0] || label[p0] || darkAt(a, p0) < INK) continue
    next++
    let top = 0,
      size = 0,
      inside = 0,
      shown = 0,
      c0 = W,
      r0 = H,
      c1 = 0,
      r1 = 0,
      big = false
    stack[top++] = p0
    label[p0] = next
    while (top) {
      const p = stack[--top]
      size++
      if (size > STROKE_MAX) big = true
      if (region[p]) inside++
      if (!skip?.[p] && inkNear(c, p, W, H, skip)) shown++
      const x = p % W,
        y = (p / W) | 0
      if (x < c0) c0 = x
      if (x > c1) c1 = x
      if (y < r0) r0 = y
      if (y > r1) r1 = y
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const X = x + dx,
            Y = y + dy
          if (X < 0 || Y < 0 || X >= W || Y >= H) continue
          const q = Y * W + X
          if (label[q] || darkAt(a, q) < INK) continue
          label[q] = next
          stack[top++] = q
        }
    }
    if (big || inside < 0.9 * size || !shown || shown >= size) continue
    out.push({ box: [c0, r0, c1 + 1, r1 + 1], size, shown })
  }
  return out
}

/** how much of arXiv's ink (`a`) among `px` the text-less shot `c` shows in place: { ink, shown } pixels */
export function shownOf(a, c, px, W, H) {
  let ink = 0,
    shown = 0
  for (const p of px) {
    if (darkAt(a, p) < INK) continue
    ink++
    if (inkNear(c, p, W, H)) shown++
  }
  return { ink, shown }
}
