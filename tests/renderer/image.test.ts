import { describe, expect, it } from 'vitest'
import { IMG_CLASS, T_CLASS } from '@/core/marks'
import { FOR_ATTR, LANG_ATTR, MIRROR_CLASS } from '@/core/renderer/attrs'
import { IMG_MODES_ATTR, clearImage, emWidth, labelStyle, maskOf, overlayOf, renderImage, setImageModes, type ImageLabel } from '@/core/renderer/image'
import { enable, restore } from '@/core/renderer/page'
import { splitFigures } from '@/core/renderer/split-figures'
import { docOf } from './helpers'

// The image overlay (DESIGN §15.2): the <img>'s next sibling, without axt-t, not one attribute added to the <img>, and the whole layer removed on restore

const FIGURE = '<figure class="ltx_figure" id="F1"><img class="ltx_graphics" src="a.png" id="F1.g1" width="476" height="357"><figcaption class="ltx_caption">Figure 1.</figcaption></figure>'
/** The figure of FIGURE: a bitmap 476 × 357, which fills its element */
const FRAME = { ratio: 476 / 357 }
const label = (text: string, source = text, extra: Partial<ImageLabel> = {}): ImageLabel => ({ x: 0.1, y: 0.2, w: 0.3, h: 0.05, lines: 1, source, text, ...extra })

function setup(html = FIGURE) {
  const doc = docOf(html)
  const el = doc.querySelector('img') as HTMLImageElement
  return { doc, target: { id: el.id, el, kind: 'raster' as const } }
}

describe('renderImage', () => {
  it('the overlay is the <img>\'s next sibling with data-axt-for and without axt-t; the <img> gains the anchor mark and nothing else, its parent the scope mark', () => {
    const { doc, target } = setup()
    const before = target.el.outerHTML
    const node = renderImage(target, [label('静态电荷', 'Static charge')], FRAME)
    expect(target.el.nextElementSibling).toBe(node)
    expect(node.classList.contains(IMG_CLASS)).toBe(true)
    expect(node.classList.contains(T_CLASS)).toBe(false)
    expect(node.getAttribute(FOR_ATTR)).toBe('F1.g1')
    // The style sheet anchors the overlay by these marks (§15.2, DESIGN §7.2); a `data-axt-*` attribute is what §7.1 allows an original to gain
    expect(target.el.getAttribute('data-axt-anchor')).toBe('')
    expect(target.el.parentElement!.getAttribute('data-axt-anchors')).toBe('')
    target.el.removeAttribute('data-axt-anchor')
    expect(target.el.outerHTML).toBe(before)
    expect(doc.querySelectorAll(`.${IMG_CLASS}`)).toHaveLength(1)
    // The marks go with the overlay
    expect(clearImage(target)).toBe(true)
    expect(target.el.hasAttribute('data-axt-anchor')).toBe(false)
    expect(target.el.parentElement!.hasAttribute('data-axt-anchors')).toBe(false)
  })

  it('a label: the translation as content, the source as title, lang from <html data-axt-lang>; the inline style uses percentages and container units only', () => {
    const { doc, target } = setup()
    doc.documentElement.setAttribute(LANG_ATTR, 'zh-CN')
    const node = renderImage(target, [label('静态电荷', 'Static charge'), label('过程', 'Processes', { x: 0.6, y: 0.03, w: 0.26, h: 0.035 })], FRAME)
    const spans = Array.from(node.children) as HTMLElement[]
    expect(spans).toHaveLength(2)
    expect(spans[0]!.textContent).toBe('静态电荷')
    expect(spans[0]!.title).toBe('Static charge')
    expect(spans[0]!.getAttribute('lang')).toBe('zh-CN')
    for (const span of spans) {
      const style = span.getAttribute('style') ?? ''
      expect(style).toMatch(/^left:[\d.]+%;top:[\d.]+%;width:[\d.]+%;height:[\d.]+%;font-size:min\([\d.]+cqh,[\d.]+cqw\)$/)
      expect(style).not.toMatch(/px/)
    }
  })

  it('a mirror right after the image is removed first: the overlay has to be the image\'s next sibling (anchor positioning relies on that structure)', () => {
    const { doc, target } = setup()
    const mirror = doc.createElement('img')
    mirror.className = `ltx_graphics ${T_CLASS} ${MIRROR_CLASS}`
    target.el.after(mirror)
    const node = renderImage(target, [label('译')], FRAME)
    expect(target.el.nextElementSibling).toBe(node)
    expect(doc.querySelector(`.${MIRROR_CLASS}`)).toBeNull()
  })

  it('rendering again replaces rather than stacks; clearImage removes it', () => {
    const { doc, target } = setup()
    renderImage(target, [label('一')], FRAME)
    renderImage(target, [label('二')], FRAME)
    expect(doc.querySelectorAll(`.${IMG_CLASS}`)).toHaveLength(1)
    expect(overlayOf(target)!.textContent).toBe('二')
    expect(clearImage(target)).toBe(true)
    expect(overlayOf(target)).toBeNull()
    expect(clearImage(target)).toBe(false)
  })

  it('restoring the original: the overlay and the mode gate on <html> are cleared together, the DOM equal byte for byte (§7.1)', () => {
    const { doc, target } = setup()
    const before = doc.documentElement.outerHTML
    enable(doc, 'stack')
    setImageModes(doc, ['side', 'stack'])
    expect(doc.documentElement.getAttribute(IMG_MODES_ATTR)).toBe('side stack')
    renderImage(target, [label('译')], FRAME)
    const result = restore(doc)
    expect(doc.documentElement.outerHTML).toBe(before)
    expect(result.removedNodes).toBe(1)
  })

  it('setImageModes with an empty set removes the attribute', () => {
    const { doc } = setup()
    setImageModes(doc, ['only'])
    setImageModes(doc, [])
    expect(doc.documentElement.hasAttribute(IMG_MODES_ATTR)).toBe(false)
  })
})

describe('labelStyle', () => {
  it('font size by box height: one line takes 72% of the box height, two lines half each; the width cap is shared by character count', () => {
    const one = labelStyle(label('静态电荷', 'Static charge', { h: 0.05, w: 0.3, lines: 1 }))
    const two = labelStyle(label('动态 电荷', 'Dynamical charge', { h: 0.05, w: 0.3, lines: 2 }))
    expect(one).toContain('font-size:min(3.60cqh,')
    expect(two).toContain('font-size:min(1.80cqh,')
    // 4 CJK characters = 4 em: width cap 92 × 0.3 / 4 = 6.9cqw
    expect(one).toContain('6.90cqw)')
  })

  it('emWidth: one em per CJK character, 0.55 for Latin, 0.3 for a space', () => {
    expect(emWidth('静态')).toBeCloseTo(2)
    expect(emWidth('ab')).toBeCloseTo(1.1)
    expect(emWidth('a b')).toBeCloseTo(1.4)
  })
})

describe('rotated labels (§15.5)', () => {
  // A tilted label carries its own length and thickness (both as fractions of the image **width**): the axis-aligned bounding box coincides with the text only at multiples of 90°,
  // at 5° it is a ring larger than the text, and drawing by it would spread the white box diagonally over the image
  const label = (over: Partial<ImageLabel> = {}): ImageLabel => ({ x: 0.1, y: 0.2, w: 0.05, h: 0.4, lines: 1, source: 'wall time', text: '每轮耗时', ...over })
  const rotated = (degrees: number, over: Partial<ImageLabel> = {}) =>
    labelStyle(label({ angle: (degrees * Math.PI) / 180, len: 0.4, thick: 0.05, ...over }))

  it('laid along the text\'s own axis: length and thickness in the same unit, rotated about the centre', () => {
    // `width: X%` is a percentage of the container **width**; rotated 90° that edge is vertical on screen, and with a non-square container the length is wrong.
    // cqw is a length unit (1% of the image width); one number is the same real length in every direction
    const style = rotated(-90)
    expect(style).toContain('width:40.000cqw')
    expect(style).toContain('height:5.000cqw')
    expect(style).toContain('transform:translate(-50%,-50%) rotate(-90.00deg)')
    // The position is the centre; the size carries no percentage (that would quietly become “percent of the width”)
    expect(style).toContain('left:12.500%;top:40.000%')
    expect(style).not.toMatch(/(width|height):[\d.]+%/)
  })

  it('any angle fits (the reheating label of 2609.10326v1 is at 6°)', () => {
    const style = rotated(6)
    expect(style).toContain('transform:translate(-50%,-50%) rotate(6.00deg)')
    expect(style).toContain('width:40.000cqw')
  })

  it('font size is computed from the thickness, not the length', () => {
    // 72 * thick is the cap on one line's height
    expect(rotated(-90)).toContain('font-size:min(3.60cqw,')
  })

  it('without a box of its own it falls back to the axis-aligned branch and does not draw by wrong dimensions', () => {
    // The OCR backend gives no len / thick; should a line with an angle but no box appear, drawing by the bounding box beats a wild rotation
    const style = labelStyle(label({ angle: -Math.PI / 2 }))
    expect(style).not.toContain('rotate')
    expect(style).toContain('left:10.000%;top:20.000%')
  })

  it('leaves upright labels exactly as they were', () => {
    const style = labelStyle(label())
    expect(style).toBe('left:10.000%;top:20.000%;width:5.000%;height:40.000%;font-size:min(28.80cqh,1.15cqw)')
    expect(style).not.toContain('transform')
  })
})

describe('the figure\'s frame and the one blur under its labels (§15.2)', () => {
  const upright: ImageLabel = { x: 0.1, y: 0.2, w: 0.3, h: 0.05, lines: 1, source: 'Static charge', text: '静态电荷' }
  // A y-axis label on a figure twice as wide as high: 0.2 of the width long is 0.4 of the height
  const turned: ImageLabel = { x: 0.1, y: 0.2, w: 0.05, h: 0.4, lines: 1, source: 'wall time', text: '每轮耗时', angle: -Math.PI / 2, len: 0.2, thick: 0.05 }
  const maskIn = (node: Element) => decodeURIComponent(/--axt-img-mask:url\("data:image\/svg\+xml,([^"]+)"\)/.exec(node.getAttribute('style') ?? '')?.[1] ?? '')

  it('an SVG figure fitted into a box of other proportions tells the overlay the drawing\'s; a bitmap fills its box and tells it nothing', () => {
    const { target } = setup()
    // The Transformer paper's Figure 4: a drawing of 319 × 217 in a box of 476 × 254, centred with air at both sides —
    // laid over the whole box, every label stood off its word, further the nearer the edge (reported 2026-09-21)
    expect(renderImage(target, [upright], { ratio: 319.181 / 216.666, fitted: true }).getAttribute('style')).toMatch(/^--axt-img-ratio:1\.4731;/)
    expect(renderImage(target, [upright], { ratio: 476 / 357 }).getAttribute('style')).not.toContain('--axt-img-ratio')
  })

  it('the overlay carries one mask, a rounded rectangle where each label lies: the blur is one layer for the figure, not one for every label', () => {
    const { target } = setup()
    const mask = maskIn(renderImage(target, [upright, turned], { ratio: 2 }))
    // A thousand units wide, as high as the figure's proportions make it, stretched over the overlay with it
    expect(mask).toContain('viewBox=\'0 0 1000 500\' preserveAspectRatio=\'none\'')
    // The corner is the label's own: 0.2 em of a font 3.6 % of the height
    expect(mask).toContain('<rect x=\'100\' y=\'100\' width=\'300\' height=\'25\' rx=\'3.6\'/>')
    expect(mask.match(/<rect /g)).toHaveLength(2)
  })

  it('a turned label is masked where it is drawn: about its centre, by its own length and thickness', () => {
    expect(decodeURIComponent(maskOf([turned], 2))).toContain('<rect x=\'25\' y=\'175\' width=\'200\' height=\'50\' rx=\'7.2\' transform=\'rotate(-90 125 200)\'/>')
  })

  it('the split copy keeps both: they are the overlay\'s inline style, which a clone does not lose', () => {
    const { doc, target } = setup()
    doc.documentElement.setAttribute('data-axt-img-modes', 'side')
    renderImage(target, [upright], { ratio: 2, fitted: true })
    splitFigures(doc)
    const copy = doc.querySelector(`.axt-split .${IMG_CLASS}`)
    expect(copy?.getAttribute('style')).toMatch(/^--axt-img-ratio:2;--axt-img-mask:url\(/)
  })
})
