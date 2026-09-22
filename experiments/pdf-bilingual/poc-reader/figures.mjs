// Text in a PDF's figures, found from the PDF itself: where each included figure sits on the page (an XObject — a
// form for a vector figure, an image for a bitmap — placed by the page's content stream), and which of the page's text
// lies inside it. Whatever class or package set the paper, an included figure is one of those two, so this needs
// nothing from the source. Pure: PDF.js's operator list and text items in, rectangles and labels out.
import { decode, escape, fromAlpha, toAlpha, WIRE } from './mt.mjs'

const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
function box(m, x0, y0, x1, y1) {
  const ps = [apply(m, x0, y0), apply(m, x1, y0), apply(m, x0, y1), apply(m, x1, y1)]
  return { x0: Math.min(...ps.map(p => p[0])), y0: Math.min(...ps.map(p => p[1])), x1: Math.max(...ps.map(p => p[0])), y1: Math.max(...ps.map(p => p[1])) }
}

/**
 * The figures placed on a page: [{ kind: 'vector' | 'raster', x0, y0, x1, y1, image? }] in PDF units — `image` the
 * bitmap's object id in page.objs, for reading its text. `ops` is
 * page.getOperatorList() (fnArray, argsArray), `OPS` PDF.js's operator codes. Forms nested in a form count as the
 * outer one; anything smaller than `min` points on a side (a logo, a bullet) is left out.
 */
export function figureRegions({ fnArray, argsArray }, OPS, { min = 30 } = {}) {
  const out = []
  let ctm = [1, 0, 0, 1, 0, 0], depth = 0
  const stack = []
  for (let k = 0; k < fnArray.length; k++) {
    const fn = fnArray[k], args = argsArray[k]
    if (fn === OPS.save) stack.push(ctm)
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm
    else if (fn === OPS.transform) ctm = mul(ctm, args)
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm)
      const [matrix, bbox] = args
      if (matrix) ctm = mul(ctm, matrix)
      if (depth++ === 0 && bbox) out.push({ kind: 'vector', ...box(ctm, bbox[0], bbox[1], bbox[2], bbox[3]) })
    } else if (fn === OPS.paintFormXObjectEnd) { ctm = stack.pop() ?? ctm; depth-- }
    else if ((fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) && depth === 0) out.push({ kind: 'raster', ...box(ctm, 0, 0, 1, 1), image: fn === OPS.paintImageXObject ? args[0] : undefined })
  }
  return out.filter(r => r.x1 - r.x0 >= min && r.y1 - r.y0 >= min)
}

/** a text item's box in PDF units, with the angle it runs at (degrees, 0 = left to right) */
function itemBox(it) {
  const [a, b, , , x, y] = it.transform
  const size = Math.hypot(a, b) || it.height, angle = Math.round((Math.atan2(b, a) * 180) / Math.PI)
  const w = it.width, cos = Math.cos((angle * Math.PI) / 180), sin = Math.sin((angle * Math.PI) / 180)
  // the run from its origin along its direction, and the size up from its baseline
  const xs = [x, x + w * cos, x - size * sin, x + w * cos - size * sin], ys = [y, y + w * sin, y + size * cos, y + w * sin + size * cos]
  return { x, y, w, size, angle, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}

/**
 * The labels inside figures: the text items whose middle lies inside a figure's rectangle, runs on one baseline that
 * touch joined into one label. [{ figure, text, x, y, w, size, angle, x0, y0, x1, y1 }] in PDF units.
 */
export function figureLabels(items, regions) {
  const inside = []
  for (const it of items) {
    if (!it.str?.trim()) continue
    const b = itemBox(it), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2
    const figure = regions.findIndex(r => cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1)
    if (figure >= 0) inside.push({ ...b, figure, text: it.str })
  }
  // join runs: same figure, same angle and size, same baseline, the next starting where the last ends
  const labels = []
  for (const r of inside) {
    const last = labels.at(-1)
    const along = last && ((r.x - last.x) * Math.cos((last.angle * Math.PI) / 180) + (r.y - last.y) * Math.sin((last.angle * Math.PI) / 180))
    const across = last && (-(r.x - last.x) * Math.sin((last.angle * Math.PI) / 180) + (r.y - last.y) * Math.cos((last.angle * Math.PI) / 180))
    if (last && last.figure === r.figure && last.angle === r.angle && Math.abs(last.size - r.size) < 0.5 && Math.abs(across) < r.size * 0.3 && along >= last.w - r.size * 0.2 && along <= last.w + r.size * 0.8) {
      const gap = along - last.w
      last.text += (gap > r.size * 0.15 && !/\s$/.test(last.text) ? ' ' : '') + r.text
      last.w = along + r.w
      last.x0 = Math.min(last.x0, r.x0); last.y0 = Math.min(last.y0, r.y0); last.x1 = Math.max(last.x1, r.x1); last.y1 = Math.max(last.y1, r.y1)
    } else labels.push({ ...r })
  }
  return labels.map(l => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }))
}

/**
 * A block's lines as one text for the engine, in the chain's wire format (mt.mjs WIRE), a placeholder numbered in order
 * between lines: markers `@a#`, `@b#` … escaped as a unit's text is, tags `<x id="1"/>` …. Every id once, as the
 * background's check wants before it caches a translation (Codex on #296). An engine that keeps no placeholder (runs)
 * gets no block: null, and the lines go one by one
 */
export function blockWire(texts, format = 'markers') {
  if (format === 'markers') return texts.map(escape).map((t, i) => (i ? `@${toAlpha(i)}# ${t}` : t)).join(' ')
  if (format === 'tags') return texts.map(t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')).map((t, i) => (i ? `<x id="${i}"/> ${t}` : t)).join(' ')
  return null
}
/** the engine's answer → one text per line, or null when the placeholders did not come back one for one, in order. A
 *  marker whose closing # the engine dropped still counts where no letter follows it, as a unit's tolerant reading does */
export function splitBlock(text, n, format = 'markers') {
  // markers as mt.mjs's tolerant reading has them: the closing # preferred, ids no longer than the block's last
  const L = toAlpha(Math.max(1, n - 1)).length
  const re = format === 'markers' ? new RegExp(`@@|\\s*@([a-z]{1,${L}})#\\s*|\\s*@([a-z]{1,${L}})(?![a-z#])\\s*`, 'g') : /\s*<x\s+id\s*=\s*["']?(\d+)["']?\s*\/?>(?:\s*<\/x>)?\s*/g
  const id = format === 'markers' ? fromAlpha : Number
  const parts = []
  let last = 0, m, want = 1
  while ((m = re.exec(text))) {
    if (m[0] === '@@') continue
    if (id(m[1] ?? m[2]) !== want++) return null
    parts.push(text.slice(last, m.index)); last = re.lastIndex
  }
  parts.push(text.slice(last))
  const texts = parts.map(t => (format === 'markers' ? WIRE.markers.unrun(t) : decode(t)).trim())
  return texts.length === n && texts.every(Boolean) ? texts : null
}

/**
 * A vector figure's labels (figureLabels, in PDF units) → lines as the extension's recogniser gives them for a bitmap
 * (src/shared/ocr.ts OcrLine): corners as fractions of the figure, origin top left, ↖ ↗ ↘ ↙; a turned line's direction
 * in radians as the page shows it (clockwise positive: a label read upwards is −π/2) with its own length and thickness
 * as fractions of the figure's width. From here on a vector figure and a bitmap take the same path.
 */
export function vectorLines(labels, region) {
  const W = region.x1 - region.x0, H = region.y1 - region.y0
  const at = (x, y) => [(x - region.x0) / W, (region.y1 - y) / H]
  return labels.map(l => {
    const a = (l.angle * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a)
    // the run's four corners: along its direction from the baseline origin, and up by its height (a little of it
    // below the baseline, for the descenders)
    const up = l.size * 0.95, down = l.size * 0.25
    const p = (s, t) => at(l.x + s * cos - t * sin, l.y + s * sin + t * cos)
    const quad = [p(0, up), p(l.w, up), p(l.w, -down), p(0, -down)]
    return l.angle ? { text: l.text, conf: 1, quad, angle: -a, len: l.w / W, thick: (up + down) / W } : { text: l.text, conf: 1, quad }
  })
}
