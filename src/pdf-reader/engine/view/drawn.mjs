// The scale a page's canvas was drawn at, kept with the canvas (docs/PDF-READER.md §11.8, one frame a page). PDF.js draws a
// page view at its viewport's unrounded scale times its output scale, from the page's top-left corner, on a canvas it floors
// to whole CSS px (pdf_viewer.mjs PDFPageView.draw: the canvas `outputScale.sx × pageWidth`, pageWidth the viewport's width
// floored to a multiple of --scale-round-x, the remainder of the page cropped). The scale is therefore never the canvas's
// width over the page's: that ratio is short by up to a CSS px over the page's width (0.14 % at 87 %), and an erase laid at
// it leaves the original's ink showing past it at the page's far corner. Nor is it the page view's scale read later: a zoom
// gives the page view its next viewport and output scale at once, keeps the canvas drawn at the last until PDF.js draws
// again (a CSS transform meanwhile), and under PDF.js's restricted scaling lets a drawing under way run on to its end
// (PDFPageView.update: no cancel where `onlyCssZoom`), so that what the page view holds when the drawing is told done is
// another drawing's. So the scale is read as the drawing begins (`pagerender`, told at the end of PDFPageView.draw, its
// canvas sized and its output scale set), checked against the canvas's size, and kept with the canvas once PDF.js tells
// that drawing done (`pagerendered`, neither a CSS transform nor a detail view; the canvas the same size: PDF.js may have
// put a copy of it in its place); a drawing cancelled tells no `pagerendered`, and the next one begun replaces it. A canvas
// drawn here (the layer side's, from the composed document) is kept with the scale it was drawn at.

/** each canvas drawn whole: the device pixels a PDF unit it was drawn at across and down, and its size then */
const drawnAt = new WeakMap()
/** each page view's drawing under way: its scale and its canvas's size as it began, until PDF.js tells it done */
const begun = new WeakMap()
/** the most CSS px PDF.js floors a page's width or height by (approximateFraction's denominator limit, its --scale-round-x) */
const ROUND_MAX = 8
const EPS = 1e-6

/** `size` CSS px of a page as PDF.js floors it at an output scale of `s`: a whole multiple of its rounding, `c / s` for its
 *  canvas's `c` px, within ROUND_MAX below the viewport's; false for a canvas PDF.js did not size so */
function floored(c, s, size) {
  const css = c / s
  return Math.abs(css - Math.round(css)) < EPS && css <= size + EPS && css > size - ROUND_MAX - EPS
}

/**
 * PDF.js has told that page view `pv` begins a drawing (`pagerender`): the scale it draws at (`viewport.scale` times
 * `outputScale.sx` across and `.sy` down, the device pixels a PDF unit, `outputScale` as PDF.js left it after sizing the
 * canvas: the canvas's width over the floored page's), kept until the drawing is told done. A canvas whose size is not the
 * one PDF.js gives that viewport and output scale is kept with nothing
 */
export function drawing(pv) {
  const c = pv?.canvas, vp = pv?.viewport, os = pv?.outputScale
  begun.delete(pv)
  if (!c?.width || !c.height || !(vp?.scale > 0) || !(os?.sx > 0) || !(os.sy > 0)) return
  if (!floored(c.width, os.sx, vp.width) || !floored(c.height, os.sy, vp.height)) return
  begun.set(pv, { kx: vp.scale * os.sx, ky: vp.scale * os.sy, w: c.width, h: c.height })
}

/** PDF.js has told that page view `pv` drew its canvas whole (`pagerendered`): the scale its drawing began at kept with its
 *  canvas, where the canvas is the size it began at; nothing else (a drawing whose beginning was not told) */
export function drawn(pv) {
  const c = pv?.canvas, at = begun.get(pv)
  begun.delete(pv)
  if (!c) return
  if (!at || c.width !== at.w || c.height !== at.h) { drawnAt.delete(c); return }
  drawnAt.set(c, at)
}

/** PDF.js's rounding of a page's CSS size before its floor (pdf_viewer.mjs calcRound): float32 where the browser's CSS
 *  round() computes in it, which PDF.js tells by this same probe; read once */
let cssRound = null
function calcRound(x) {
  cssRound ??= (() => {
    const e = document.createElement('div')
    e.style.width = 'round(down, calc(1.6666666666666665 * 792px), 1px)'
    return e.style.width === 'calc(1320px)' ? Math.fround : v => v
  })()
  return cssRound(x)
}
const floorTo = (x, d) => x - (x % d)
/** a page's box in CSS px as PDF.js lays it out for viewport `vp` (setLayerDimensions: `round(down, var(--total-scale-factor)
 *  × the page's size, --scale-round-x)`, and -y down; a page turned a quarter takes its height's rounding across), which is
 *  what its canvas covers: the page from its top-left corner, the rest cropped */
export function pageBox(vp, roundX = 1, roundY = 1) {
  const turned = (vp.rotation ?? 0) % 180 !== 0
  return { width: floorTo(calcRound(vp.width), turned ? roundY : roundX), height: floorTo(calcRound(vp.height), turned ? roundX : roundY) }
}

/** a canvas drawn here at `k` device pixels a PDF unit across and down (the layer side's own, from the composed document) */
export function drew(canvas, k) {
  drawnAt.set(canvas, { kx: k, ky: k, w: canvas.width, h: canvas.height })
}

/** the device pixels a PDF unit `canvas` was drawn at, where it is the same across and down and the canvas is as it was
 *  drawn; null else */
export function scaleOf(canvas) {
  const d = canvas ? drawnAt.get(canvas) : null
  return d && d.kx === d.ky && d.w === canvas.width && d.h === canvas.height ? d.kx : null
}

/** page view `pv`'s canvas where PDF.js has drawn it whole, with the device pixels a PDF unit it drew it at
 *  (`{ canvas, k }`); null where it is not drawn, its drawing was not told, or its scale across and down differ: PDF.js
 *  approximates the pixel ratio by a fraction of terms at most 8 and floors the width and the height each to its own, so
 *  they come apart at almost every zoom wherever the ratio is no such fraction (1.1, 0.9, 1.8, 2.2, 2.25, ...: Chrome at
 *  90 and 110 %, Windows at 225 %) and under its restricted scaling. Such a canvas is no copy's source (docs/PDF-READER.md
 *  §11.8: the copy is drawn from the document instead) */
export function drawnCanvas(pv) {
  if (pv?.renderingState !== 3) return null
  const canvas = pv.canvas, k = scaleOf(canvas)
  return k === null ? null : { canvas, k }
}
