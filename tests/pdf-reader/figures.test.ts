import { describe, expect, it } from 'vitest'
import { figureRegions } from '@/pdf-reader/engine/view/figures.mjs'

// A page's figures from PDF.js's operator list (figures.mjs figureRegions): each form drawn at the page's level, and
// each image, a rectangle in PDF units

const OPS = { save: 1, restore: 2, transform: 3, paintFormXObjectBegin: 4, paintFormXObjectEnd: 5, paintImageXObject: 6, paintInlineImageXObject: 7, paintImageMaskXObject: 8, beginGroup: 9, endGroup: 10, paintImageMaskXObjectGroup: 84, paintInlineImageXObjectGroup: 87, paintImageXObjectRepeat: 88, paintImageMaskXObjectRepeat: 89 }
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

  it('the display list\'s merged images (PDF.js 6.3.289\'s optimiser: runs of save, transform, image, restore made one operation): each image where its own transform puts it, as in the list unmerged', () => {
    // under a transform in force: three placements of one image (a Repeat: its scale, then each position), a mask's
    // placements turned a quarter (a mask Repeat: scaleX, skewX, skewY, scaleY, then each position), a group of masks
    // and one of inline images each with its own transform; a placement smaller than 30 a side left out, as unmerged
    const ctm = [2, 0, 0, 2, 10, 20], t = (a: number, b: number, c: number, d: number, e: number, f: number) => [a, b, c, d, e, f]
    const placed: [number, number[], unknown[]][] = [
      [OPS.paintImageXObject, t(40, 0, 0, 30, 0, 0), ['img_p1_1']], [OPS.paintImageXObject, t(40, 0, 0, 30, 50, 0), ['img_p1_1']], [OPS.paintImageXObject, t(40, 0, 0, 30, 100, 0), ['img_p1_1']],
      [OPS.paintImageMaskXObject, t(0, 35, -35, 0, 300, 100), [{ data: 'm' }]], [OPS.paintImageMaskXObject, t(0, 35, -35, 0, 300, 150), [{ data: 'm' }]],
      [OPS.paintImageMaskXObject, t(30, 0, 0, 40, 0, 300), [{ data: 'a' }]], [OPS.paintImageMaskXObject, t(10, 0, 0, 10, 50, 300), [{ data: 'b' }]],
      [OPS.paintInlineImageXObject, t(60, 0, 0, 45, 100, 300), [{}]], [OPS.paintInlineImageXObject, t(5, 0, 0, 5, 200, 300), [{}]],
    ]
    const unmerged = list([[OPS.transform, ctm], ...placed.flatMap(([fn, m, args]) => [[OPS.save, []], [OPS.transform, m], [fn, args], [OPS.restore, []]] as [number, unknown[]][])])
    const merged = list([
      [OPS.transform, ctm],
      [OPS.paintImageXObjectRepeat, ['img_p1_1', 40, 30, Float32Array.from([0, 0, 50, 0, 100, 0])]],
      [OPS.paintImageMaskXObjectRepeat, [{ data: 'm' }, 0, 35, -35, 0, Float32Array.from([300, 100, 300, 150])]],
      [OPS.paintImageMaskXObjectGroup, [[{ data: 'a', width: 8, height: 8, transform: t(30, 0, 0, 40, 0, 300) }, { data: 'b', width: 8, height: 8, transform: t(10, 0, 0, 10, 50, 300) }]]],
      [OPS.paintInlineImageXObjectGroup, [{ width: 70, height: 20 }, [{ transform: t(60, 0, 0, 45, 100, 300), x: 1, y: 1, w: 60, h: 18 }, { transform: t(5, 0, 0, 5, 200, 300), x: 63, y: 1, w: 5, h: 5 }]]],
    ])
    const regions = figureRegions(merged, OPS)
    expect(regions).toEqual(figureRegions(unmerged, OPS))
    expect(regions.map(r => [r.kind, ...box(r), r.image ?? null])).toEqual([
      ['raster', 10, 20, 90, 80, 'img_p1_1'], ['raster', 110, 20, 190, 80, 'img_p1_1'], ['raster', 210, 20, 290, 80, 'img_p1_1'],
      ['raster', 540, 220, 610, 290, null], ['raster', 540, 320, 610, 390, null],
      ['raster', 10, 620, 70, 700, null],
      ['raster', 210, 620, 330, 710, null],
    ])
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
