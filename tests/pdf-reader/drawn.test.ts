// The scale a page's canvas was drawn at, kept with the canvas (engine/view/drawn.mjs; docs/PDF-READER.md §11.8): read when
// PDF.js tells that it drew a page view whole, checked against the canvas's size as PDF.js gives it (pdf_viewer.mjs
// PDFPageView.draw), and never the canvas's width over the page's
import { describe, expect, it } from 'vitest'
import { drawn, drawnCanvas, drew, pageBox, scaleOf } from '@/pdf-reader/engine/view/drawn.mjs'

/** a page view of a page 612 × 792 PDF units at viewport scale `scale`, its canvas `width` × `height` at output scale sx, sy */
function view(scale: number, width: number, height: number, sx: number, sy = sx) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return { canvas, viewport: { scale, width: 612 * scale, height: 792 * scale }, outputScale: { sx, sy }, renderingState: 3 }
}

describe('drawn: the scale kept with the canvas PDF.js drew', () => {
  it('a page view drawn at 87.25 % and a pixel ratio of 2: its viewport\'s scale times its output scale, not 1422 / 612', () => {
    const pv = view(1.1633986928104574, 1422, 1842, 2)
    drawn(pv)
    expect(drawnCanvas(pv)).toEqual({ canvas: pv.canvas, k: 1.1633986928104574 * 2 })
    expect(scaleOf(pv.canvas)).not.toBe(1422 / 612)
  })

  it('a canvas PDF.js did not size so (another viewport\'s, or none of its) is kept with nothing', () => {
    // the canvas of 100 % told under a viewport of 110 %: its 816 CSS px are not 897 floored
    const pv = view(1.1 * 4 / 3, 816, 1056, 1)
    drawn(pv)
    expect(drawnCanvas(pv)).toBeNull()
    const odd = view(1.1633986928104574, 1421, 1842, 2)
    drawn(odd)
    expect(drawnCanvas(odd)).toBeNull()
  })

  it('a canvas resized since, one not finished, and one drawn at another scale across than down are no source', () => {
    const pv = view(1.1633986928104574, 1422, 1842, 2)
    drawn(pv)
    pv.renderingState = 1
    expect(drawnCanvas(pv)).toBeNull()
    pv.renderingState = 3
    pv.canvas.width = 0
    expect(drawnCanvas(pv)).toBeNull()
    const apart = view(1.1633986928104574, 1422, 1841, 2, 1841 / 920)
    drawn(apart)
    expect(drawnCanvas(apart)).toBeNull()
  })

  it('a canvas drawn here keeps the k it was drawn at', () => {
    const c = document.createElement('canvas')
    c.width = 1422
    c.height = 1842
    drew(c, 2.3267973856209148)
    expect(scaleOf(c)).toBe(2.3267973856209148)
    c.height = 1843
    expect(scaleOf(c)).toBeNull()
  })
})

describe('pageBox: a page\'s box as PDF.js lays it out', () => {
  it('the viewport\'s CSS px floored to the rounding across and down; a page turned a quarter takes its height\'s across', () => {
    expect(pageBox({ width: 711.9999999999999, height: 921.4117647058822, rotation: 0 })).toEqual({ width: 711, height: 921 })
    expect(pageBox({ width: 711.9999999999999, height: 921.4117647058822, rotation: 0 }, 2, 3)).toEqual({ width: 710, height: 921 })
    expect(pageBox({ width: 921.4117647058822, height: 711.9999999999999, rotation: 90 }, 2, 3)).toEqual({ width: 921, height: 710 })
  })
})
