// The crops' canvas on the page view's pixel grid (compose/paint.ts cropGrid): its box the frame floored as PDF.js floors a page
// view's box, its pixels that box at the output scale, so that it is shown pixel for pixel over the page view's own canvas. The
// page view's rule restated from PDFPageView's draw (pdfjs-dist 6.3.289 pdf_viewer.mjs: approximateFraction, floorToDivide,
// outputScale = canvas px / page px) and the crops' compared with it.
import { describe, expect, it } from 'vitest'
import { cropGrid } from '../src/compose/paint.ts'

/** PDF.js's page view at a pixel ratio: its canvas's pixels, its box's CSS px, its output scale and its rounding */
function pageView(width: number, height: number, ratio: number) {
  // (approximateFraction's answer for the ratios tried: 2 → 2/1, 1.5 → 3/2, 1 → 1/1)
  const [a, b] = ratio === 2 ? [2, 1] : ratio === 1.5 ? [3, 2] : [1, 1]
  const floorTo = (x: number, d: number) => x - (x % d)
  const px = [floorTo(width * ratio, a), floorTo(height * ratio, a)]
  const css = [floorTo(width, b), floorTo(height, b)]
  return { px, css, scale: { sx: px[0]! / css[0]!, sy: px[1]! / css[1]! }, round: { x: b, y: b } }
}

describe("the crops' canvas on the page view's pixel grid", () => {
  for (const [what, w, h] of [
    ['A4 at 100 %', (595.276 * 4) / 3, (841.89 * 4) / 3],
    ['letter at the fit of a 1512 px window', 660, 854.109],
    ['a page of a third of a px', 509.67, 660],
  ] as const)
    for (const ratio of [2, 1.5, 1])
      it(`${what}, a pixel ratio of ${ratio}: the page view's pixels in the page view's box`, () => {
        const v = pageView(w, h, ratio)
        const g = cropGrid({ width: w, height: h }, v.scale, v.round)
        expect(g.px).toEqual(v.px)
        expect(g.css).toEqual(v.css)
        // (whole px a box, the box at the scale its pixels: shown pixel for pixel)
        for (const i of [0, 1]) {
          expect(Number.isInteger(g.css[i]! / v.round.x)).toBe(true)
          expect(g.css[i]! * (i ? v.scale.sy : v.scale.sx)).toBeCloseTo(g.px[i]!, 9)
        }
      })
  it("is never the frame's own size where the frame is a fraction of a px: that canvas would be resampled", () => {
    const g = cropGrid({ width: (595.276 * 4) / 3, height: (841.89 * 4) / 3 }, { sx: 2, sy: 2 })
    expect(g).toEqual({ css: [793, 1122], px: [1586, 2244] })
  })
})
