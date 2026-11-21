// A page's box as PDF.js lays it out (docs/PDF-READER.md §11.8, one frame a page). PDF.js draws a page view at its viewport's
// unrounded scale times its output scale, from the page's top-left corner, on a canvas it floors to whole CSS px (pdf_viewer.mjs
// PDFPageView.draw: the canvas `outputScale.sx × pageWidth`, pageWidth the viewport's width floored to a multiple of
// --scale-round-x, the remainder of the page cropped). The layer's copy is drawn so too (the door's copyOf, at the place's k on a
// canvas of the place's box), so that it maps pixel for pixel onto the place. The capture of the scale PDF.js drew a canvas at,
// for a copy taken from the left's canvas, went with that copy (docs/route/ocg-erasure.md §4.2): every copy is the composed
// document's render A.

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
