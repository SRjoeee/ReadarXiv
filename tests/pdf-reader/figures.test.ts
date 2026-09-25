import { describe, expect, it } from 'vitest'
import { figureRegions } from '@/pdf-reader/engine/figures.mjs'

// A page's figures from PDF.js's operator list (figures.mjs figureRegions): each form drawn at the page's level, and
// each image, a rectangle in PDF units

const OPS = { save: 1, restore: 2, transform: 3, paintFormXObjectBegin: 4, paintFormXObjectEnd: 5, paintImageXObject: 6, paintInlineImageXObject: 7, paintImageMaskXObject: 8, beginGroup: 9, endGroup: 10 }
const list = (ops: [number, unknown[]][]) => ({ fnArray: ops.map(o => o[0]), argsArray: ops.map(o => o[1]) })
const at = (x: number, y: number) => [1, 0, 0, 1, x, y]
const box = (r: { x0: number; y0: number; x1: number; y1: number }) => [r.x0, r.y0, r.x1, r.y1]

describe('figureRegions', () => {
  it('a form drawn on the page: its box, where the form\'s matrix puts it', () => {
    const regions = figureRegions(list([[OPS.paintFormXObjectBegin, [at(50, 60), [0, 0, 200, 100]]], [OPS.paintFormXObjectEnd, []]]), OPS)
    expect(regions.map(r => [r.kind, ...box(r)])).toEqual([['vector', 50, 60, 250, 160]])
  })

  it('a form that is a transparency group: PDF.js gives its box to the group, and the form none — the figure is still found (1706.03762\'s attention figures, as the translation typesets them)', () => {
    const regions = figureRegions(list([
      [OPS.beginGroup, [{ bbox: [0, 0, 200, 100], matrix: at(50, 60), isolated: false, knockout: false }]],
      [OPS.paintFormXObjectBegin, [at(50, 60), null]],
      // the figure's own groups inside it are its parts, not figures
      [OPS.beginGroup, [{ bbox: [0, 0, 40, 40], matrix: at(0, 0) }]],
      [OPS.paintFormXObjectBegin, [at(0, 0), null]],
      [OPS.paintFormXObjectEnd, []],
      [OPS.endGroup, [{}]],
      [OPS.paintFormXObjectEnd, []],
      [OPS.endGroup, [{}]],
    ]), OPS)
    expect(regions.map(r => [r.kind, ...box(r)])).toEqual([['vector', 50, 60, 250, 160]])
  })

  it('a group that is not a form\'s (a soft mask\'s, say) gives its box to no later form', () => {
    const regions = figureRegions(list([
      [OPS.beginGroup, [{ bbox: [0, 0, 200, 100], matrix: at(0, 0) }]],
      [OPS.endGroup, [{}]],
      [OPS.paintFormXObjectBegin, [at(0, 0), null]],
      [OPS.paintFormXObjectEnd, []],
    ]), OPS)
    expect(regions).toEqual([])
  })
})
