// The image overlay (DESIGN §15.2): the <img>'s next sibling `.axt-img`, one span per translated label inside;
// position and size are written as percentages of the normalised coordinates, the font size in container query
// units — all computed into strings in JS and written once, **reading no geometry**. The overlay carries no .axt-t
// (marks.ts says why under IMG_CLASS) and is inserted on success only; pending and failure have no DOM node. In
// keeping with §7.1: the <img> itself gains no attribute; restore removes the whole layer by INJECTED_SELECTOR.
import { IMG_CLASS } from '@/core/marks'
import { ANCHORS_ATTR, ANCHOR_ATTR, DIR_ATTR, FOR_ATTR, LANG_ATTR, MIRROR_CLASS, SPLIT_ROOT_ATTR } from './attrs'
import { dropMirror } from './mirror'
import { looseRootOf } from './side-layout'

/** The mode gate on <html>: the set of modes the reader ticked, space-separated; CSS matches the current mode with ~= (the §15 setting) */
export const IMG_MODES_ATTR = 'data-axt-img-modes'

export interface ImageTarget {
  id: string
  el: Element
  /**
   * A bitmap goes “bytes → OCR”, an external SVG figure reads the glyphs of its `contentDocument` directly (§15.5).
   * The two meet in `linesToBoxes`; the overlay, the cache and the scheduling after that are one and the same. An
   * inline TikZ picture is neither: its labels are HTML in the page, blocks of the text run (§15.6)
   */
  kind: 'raster' | 'svg'
}

/** One translated label: position and size in the image's normalised coordinates (0–1, top-left origin); lines is how many OCR lines were merged into it */
export interface ImageLabel {
  x: number
  y: number
  w: number
  h: number
  lines: number
  /** The OCR source text, shown on hover */
  source: string
  /** The translation */
  text: string
  /** Text direction in radians; absent means horizontal (§15.5) */
  angle?: number
  /** A tilted label's own length and thickness, both as fractions of the image's **width**; present with angle */
  len?: number
  thick?: number
}

/** The figure's own shape, which its labels are laid by */
export interface ImageFrame {
  /** Width over height: of a bitmap's pixels, of an SVG figure's `viewBox` */
  ratio: number
  /**
   * The drawing is fitted whole and centred into its element, as the browser fits an SVG figure (`core/svg`
   * `frameOf`): where the element has other proportions the overlay takes the drawing's rectangle inside it, not the
   * whole box. A bitmap fills its element, and says nothing
   */
  fitted?: boolean
}

/** The modes figures are translated in, as the page has them now — the display gate's own record, for what a style rule cannot do (split-figures.ts) */
export function imageModesOf(doc: Document): string[] {
  return doc.documentElement.getAttribute(IMG_MODES_ATTR)?.split(' ').filter(Boolean) ?? []
}

export function setImageModes(doc: Document, modes: readonly string[]): void {
  if (modes.length > 0) doc.documentElement.setAttribute(IMG_MODES_ATTR, modes.join(' '))
  else doc.documentElement.removeAttribute(IMG_MODES_ATTR)
}

/** The overlay the target already has (in the same parent, data-axt-for pointing at it) */
export function overlayOf(target: ImageTarget): Element | null {
  const parent = target.el.parentElement
  if (!parent) return null
  for (const child of Array.from(parent.children)) {
    if (child.classList.contains(IMG_CLASS) && child.getAttribute(FOR_ATTR) === target.id) return child
  }
  return null
}

export function clearImage(target: ImageTarget): boolean {
  const existing = overlayOf(target)
  if (!existing) return false
  dropOverlay(existing)
  return true
}

/**
 * The anchor marks the style sheet positions the overlay by (§15.2, DESIGN §7.2): the image before the overlay is the
 * anchor, their parent the positioned ancestor that scopes the anchor name. Written when an overlay is inserted,
 * here and inside a split copy, whose clone lost them with every other data-axt-*
 */
export function markAnchor(overlay: Element): void {
  overlay.previousElementSibling?.setAttribute(ANCHOR_ATTR, '')
  overlay.parentElement?.setAttribute(ANCHORS_ATTR, '')
}

/** Remove an overlay and the marks that served it; the parent, and a loose graphic's block, keep theirs while another overlay is inside */
function dropOverlay(overlay: Element): void {
  const parent = overlay.parentElement
  const root = overlay.closest(`[${SPLIT_ROOT_ATTR}]`)
  overlay.previousElementSibling?.removeAttribute(ANCHOR_ATTR)
  overlay.remove()
  if (parent && !parent.querySelector(`:scope > .${IMG_CLASS}`)) parent.removeAttribute(ANCHORS_ATTR)
  if (root && !root.querySelector(`.${IMG_CLASS}`)) root.removeAttribute(SPLIT_ROOT_ATTR)
}

/**
 * Roughly how many ems a run of text spans: one em per CJK character, 0.55 em for the rest (the average width of
 * Latin letters), 0.3 em for a space. Only an upper bound for the font size, not a measurement — the translation is
 * mostly Chinese and usually shorter than the source, and the box height decides the size
 */
export function emWidth(text: string): number {
  let width = 0
  for (const ch of text) {
    if (/\s/.test(ch)) width += 0.3
    else if (/[⺀-鿿가-힯豈-﫿＀-￯]/.test(ch)) width += 1
    else width += 0.55
  }
  return Math.max(width, 0.55)
}

/**
 * A label's inline style: position and size as percentages of the image, font size = min(by box height, by box
 * width), in container query units (the overlay is a size container: 1cqh is 1% of the image's height, 1cqw 1% of
 * its width). Line height 1.15, one line takes about 72% of the box height; a multi-line box shares it out by line
 * count. **No geometry is read**: the whole string is computed in JS and written once.
 *
 * **A vertical label (`angle`) cannot use percentages.** Rotated 90° about its centre, the box's width becomes the
 * vertical extent on screen and its height the horizontal thickness; `width: X%` is a percentage of the container's
 * **width**, wrong for the length whenever the container is not square. So a vertical label's width is written in
 * `cqh` (a percentage of the image height — the axis the text really runs along) and its height in `cqw`, with
 * left / top as `calc()` from the centre minus half — the two units subtract inside calc, both being percentages
 * of the same container.
 */
/**
 * The two bounds of a label's font size, in container query units: by the box across the text — 72 % of a line's
 * share of it, in `cqh` for an upright label and `cqw` for a turned one, whose box is in fractions of the width — and
 * by the text's length in `cqw`, 8 % kept as margin. One reckoning for the label's style and for its corner in the mask
 */
function fontBounds(label: ImageLabel): { turned: boolean; across: number; along: number } {
  const lines = Math.max(1, label.lines)
  const turned = !!(label.angle && label.len && label.thick)
  const [length, thickness] = turned ? [label.len as number, label.thick as number] : [label.w, label.h]
  // The text splits into `lines` rows of about emWidth / lines ems each
  return { turned, across: (72 * thickness) / lines, along: (92 * length * lines) / emWidth(label.text) }
}

export function labelStyle(label: ImageLabel): string {
  const pct = (v: number) => `${(v * 100).toFixed(3)}%`
  const cq = (v: number) => `${(v * 100).toFixed(3)}cqw`
  const font = fontBounds(label)
  if (font.turned && label.angle && label.len && label.thick) {
    // A tilted label sits along **its own axis**: the box is the text's own length and thickness (not the axis-aligned
    // bounding box — that one coincides with the text only at multiples of 90° and is a size larger at 5°), placed
    // centre on centre and then rotated as a whole. Both axes use cqw (a percentage of the image width, one length
    // unit), so one number is the same real length whichever way it points; `width: X%` would become “a percentage
    // of the container width”, wrong for the vertical length whenever the container is not square
    const cx = label.x + label.w / 2
    const cy = label.y + label.h / 2
    return `left:${pct(cx)};top:${pct(cy)};width:${cq(label.len)};height:${cq(label.thick)};`
      + `transform:translate(-50%,-50%) rotate(${((label.angle * 180) / Math.PI).toFixed(2)}deg);`
      + `font-size:min(${font.across.toFixed(2)}cqw,${font.along.toFixed(2)}cqw)`
  }
  return `left:${pct(label.x)};top:${pct(label.y)};width:${pct(label.w)};height:${pct(label.h)};font-size:min(${font.across.toFixed(2)}cqh,${font.along.toFixed(2)}cqw)`
}

/** The mask's width in its own units; the height follows from the figure's proportions */
const MASK_WIDTH = 1000

/**
 * Where the labels lie, as a mask image: what the overlay's one blur is cut to (image.css says why there is one and
 * not one a label). An SVG a thousand units wide and as high as the figure's proportions make it, stretched over the
 * overlay with it; a rounded rectangle for every label, from the same numbers `labelStyle` writes — an upright one by
 * its box, a turned one about its centre by its own length and thickness, the corner 0.2 em of its font. **The
 * proportions are needed for a turned label alone**, whose box is in fractions of the width on both its axes
 */
export function maskOf(labels: readonly ImageLabel[], ratio: number): string {
  const width = MASK_WIDTH
  const height = MASK_WIDTH / ratio
  const n = (v: number) => String(+v.toFixed(1))
  const rects = labels.map(label => {
    const font = fontBounds(label)
    if (font.turned && label.angle && label.len && label.thick) {
      const cx = (label.x + label.w / 2) * width
      const cy = (label.y + label.h / 2) * height
      const [w, h] = [label.len * width, label.thick * width]
      // Both bounds are in cqw, a hundredth of the width
      const corner = 0.2 * Math.min(font.across, font.along) * (width / 100)
      return `<rect x='${n(cx - w / 2)}' y='${n(cy - h / 2)}' width='${n(w)}' height='${n(h)}' rx='${n(corner)}' transform='rotate(${n((label.angle * 180) / Math.PI)} ${n(cx)} ${n(cy)})'/>`
    }
    const corner = 0.2 * Math.min(font.across * (height / 100), font.along * (width / 100))
    return `<rect x='${n(label.x * width)}' y='${n(label.y * height)}' width='${n(label.w * width)}' height='${n(label.h * height)}' rx='${n(corner)}'/>`
  })
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${n(width)} ${n(height)}' preserveAspectRatio='none'>${rects.join('')}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/**
 * Insert an image's overlay; idempotent, a re-render replaces rather than stacks. Returns the overlay node.
 * A mirror right after the image is removed first: mirrors run once per session, before OCR, and would sit between
 * the image and the overlay — the overlay must be the image's **next** sibling (anchors resolve to “the nearest
 * preceding node of that name”, and `img:has(+ .axt-img)` accepts an adjacent one only)
 */
export function renderImage(target: ImageTarget, labels: readonly ImageLabel[], frame: ImageFrame): Element {
  clearImage(target)
  const next = target.el.nextElementSibling
  if (next?.classList.contains(MIRROR_CLASS)) dropMirror(next)
  const doc = target.el.ownerDocument
  const node = doc.createElement('div')
  node.className = IMG_CLASS
  node.setAttribute(FOR_ATTR, target.id)
  // What the style sheet lays the overlay by, in its inline style, which a split copy's clone keeps where it loses
  // every `data-axt-*`: the drawing's proportions where it is fitted into its element, and the labels' mask
  node.setAttribute('style', `${frame.fitted ? `--axt-img-ratio:${+frame.ratio.toFixed(4)};` : ''}--axt-img-mask:${maskOf(labels, frame.ratio)}`)
  const lang = doc.documentElement.getAttribute(LANG_ATTR)
  // A label in an image needs `dir` as well: an Arabic label under an ltr base direction puts its punctuation at the wrong end (§7.5)
  const dir = doc.documentElement.getAttribute(DIR_ATTR)
  for (const label of labels) {
    const span = doc.createElement('span')
    span.textContent = label.text
    span.title = label.source
    if (lang) span.setAttribute('lang', lang)
    if (dir) span.setAttribute('dir', dir)
    span.setAttribute('style', labelStyle(label))
    node.append(span)
  }
  target.el.after(node)
  markAnchor(node)
  // A graphic in no figure: its block stands as one from here on, and side mode copies it with this overlay
  // (side-layout.ts `looseRootOf`). In the same breath as the overlay, so the sheet never shows it on the original
  looseRootOf(target.el)?.setAttribute(SPLIT_ROOT_ATTR, '')
  return node
}
