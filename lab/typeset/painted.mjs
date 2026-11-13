// lab/typeset/painted.mjs: I11, every lit box painted whole, on both panes (the coordinator's ruling of 2026-11-13, lane
// display-highlight), read by the reader gate (gate-l1.mjs) over each page the entry lays. I10 judges Laid.lit (each piece in
// one sentence), not what the reader paints of it: the painter cut two boxes of one band at the middle of their overlap (the
// owner's report of 2026-11-13 on 2111.09276v1 p5, display (4): its second row on neither pane), and no gate could see it. Here
// each shape the reader paints of a member on a pane (each entry of Laid.lit's `left` or `right`, which the pointer lights alone
// or, lit whole, every one; each display piece of its `own`) is painted by the reader's own rows and outlines (packages/reader
// compose/highlight.ts paintRows, shapeOutlines: their corners before they are rounded) with the page's half leading on that pane
// (halfLeadingOf) and the cut by the page's other boxes in the member's column (apartRows, columnOf), in the reader's CSS px at
// its scale of one (96/72 CSS px a point: its pad of 3 CSS px, its corners' radius, its corners merged within 0.01 px); and each
// box of the shape is held inside the union of its outlines, to the drawing's own precision (the box less 0.01 CSS px a side, the
// painter's: it merges two corners that near and writes its path to the hundredth), exactly so (the box cut at the outlines'
// corners, every cell's middle inside one). A box of no area holds no ink and is
// not read; a member set along a direction (a turned figure text, Laid.lit's `dir`) is painted box by box, each its own turned
// band, and is counted apart. 0 boxes cut is the only passing value. Pure arithmetic over a Page; no DOM.
import { columnOf, halfLeadingOf, PAD, paintRows, RADIUS, shapeOutlines } from '../../packages/reader/src/compose/highlight.ts'

/** CSS px a point at the reader's scale of one, and the drawing's precision in them (highlight.ts cornersOf, shapePath's path) */
const K = 96 / 72
const EPS = 0.01

/** whether a point stands inside a polygon of corners (even-odd) */
function inPoly(x, y, poly) {
  let n = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) n = !n
  }
  return n
}
/** whether a box [x0, y0, x1, y1] (the outlines' frame, y down) stands wholly inside the union of `polys`: every cell the polygons'
 *  corners cut it into has its middle inside one */
export function holds(polys, [x0, y0, x1, y1]) {
  const xs = [x0, x1],
    ys = [y0, y1]
  for (const p of polys)
    for (const [x, y] of p) {
      if (x > x0 && x < x1) xs.push(x)
      if (y > y0 && y < y1) ys.push(y)
    }
  const ux = [...new Set(xs)].sort((a, b) => a - b),
    uy = [...new Set(ys)].sort((a, b) => a - b)
  for (let i = 1; i < ux.length; i++)
    for (let j = 1; j < uy.length; j++) {
      const cx = (ux[i - 1] + ux[i]) / 2,
        cy = (uy[j - 1] + uy[j]) / 2
      if (!polys.some((p) => inPoly(cx, cy, p))) return false
    }
  return true
}

/**
 * I11 over one laid page (layPage's Page): `shapes` painted, `boxes` held, `turned` boxes of members set along a direction (not
 * read), `cut`: each box not painted whole, [pane, ord, the lit state's s (an entry's index, -2 - piece for a display), its box]
 */
export function paintedOf(page) {
  const out = { shapes: 0, boxes: 0, turned: 0, cut: [] }
  for (const side of ['left', 'right']) {
    const members = page.members ?? []
    const lead = halfLeadingOf(members.map((m) => (m.lit.dir ? [] : m.lit[side])))
    const others = members.flatMap((m) => (m.lit.dir ? [] : [...m.lit[side].flat(), ...m.lit.own.flatMap(([, b]) => b)]))
    for (const m of members) {
      if (m.lit.dir) {
        out.turned += m.lit[side].flat().length
        continue
      }
      const pad = m.lit.band ? 0 : PAD,
        l = m.lit.band ? 0 : lead
      const column = columnOf(m.lit[side], m.lit.own)
      const shapes = [
        ...m.lit[side].map((boxes, s) => ({ s, boxes })),
        ...m.lit.own.filter(([k]) => /^\d+$/.test(k)).map(([k, boxes]) => ({ s: -2 - Number(k), boxes })),
      ]
      for (const { s, boxes } of shapes) {
        if (!boxes.length) continue
        out.shapes++
        // (the painter's frame: CSS px, y down, so that its rows stand from the top)
        const rows = paintRows(boxes, l, column ? { others, column } : undefined).map((r) => ({
          x0: r.box[0] * K - pad,
          x1: r.box[2] * K + pad,
          y0: -r.box[3] * K,
          y1: -r.box[1] * K,
          ...(r.apart ? { apart: true } : {}),
        }))
        const polys = shapeOutlines(rows, RADIUS)
        for (const b of boxes) {
          if (!(b[2] > b[0] && b[3] > b[1])) continue
          out.boxes++
          const inner = [b[0] * K + EPS, -b[3] * K + EPS, b[2] * K - EPS, -b[1] * K - EPS]
          if (inner[2] > inner[0] && inner[3] > inner[1] && !holds(polys, inner)) out.cut.push([side, m.ord, s, b])
        }
      }
    }
  }
  return out
}
