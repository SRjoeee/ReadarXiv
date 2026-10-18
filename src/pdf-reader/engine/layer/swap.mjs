// The swap of the text-removed PDF (layout/remove.mjs; the instant layer's text removal): where the reader puts the
// removed page's pixels in for a drawn unit. The reader shows arXiv's page (O); its removed page (R) differs from it only
// inside the removed glyphs' outlines (the add-on's outline table gives every glyph's: layout/ink.mjs). A unit's swap is
// the outline boxes of the glyphs and rules it replaces, a little grown for their antialiased edges, less what reaches a
// removed glyph it does not replace (one a reading keeps, or another unit's, not drawn yet): so a swap never reaches
// another unit's glyphs, and is exact anywhere else, R being O there. Rectangles alone, in PDF units: drawn at any
// resolution, no pixel is read (it replaced a mask worked out over the two pages' pixels, 100 ms a page in the browser).
//
// Pure: no DOM, no clock. An original module (no port statement), importing nothing, so that the reader's bundle holds it.

/**
 * A drawn unit's swap as rectangles, with no pixel read (the add-on gives every glyph's outline box: layout/ink.mjs
 * outlineTable): the boxes of the glyphs and rules the unit replaces (`mine`), each grown by `pad` for its antialiased
 * edge, a line's run of them joined where they touch; less, wherever one reaches a removed glyph or rule the unit does
 * not replace (a line or a placeholder its reading keeps, another unit's), that one's box grown by half as much: what the
 * add-on removed and this drawing keeps is shown from the original. `avoid`: those boxes, or a function giving those of
 * them that meet a rectangle (a page's index, built once: avoidIndex). Every box is [x0, y0, x1, y1] in PDF units, y up;
 * so are the rectangles returned. A glyph's outline is its ink's extremes, so the removed page differs from the original
 * only inside its grown box: the swap is exact but where two glyphs come within `pad` of each other.
 */
export function swapRects(mine, avoid = [], pad = SWAP_PAD) {
  // a line's run: boxes on one band, sorted across, joined where they touch (a word's glyphs)
  const grown = mine.filter(b => b[2] > b[0] && b[3] > b[1]).map(b => [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]).sort((a, b) => a[1] - b[1] || a[0] - b[0])
  const runs = []
  for (const b of grown) {
    const r = runs.find(c => b[0] <= c[2] && b[2] >= c[0] && Math.min(b[3], c[3]) - Math.max(b[1], c[1]) > 0.6 * Math.min(b[3] - b[1], c[3] - c[1]))
    if (r) { r[0] = Math.min(r[0], b[0]); r[1] = Math.min(r[1], b[1]); r[2] = Math.max(r[2], b[2]); r[3] = Math.max(r[3], b[3]) }
    else runs.push(b.slice())
  }
  const near = typeof avoid === 'function' ? avoid : avoidIndex(avoid)
  const half = pad / 2
  const out = []
  for (const r of runs) {
    let parts = [r]
    for (const k of near(r)) {
      const a = [k[0] - half, k[1] - half, k[2] + half, k[3] + half]
      parts = parts.flatMap(p => {
        if (a[0] >= p[2] || a[2] <= p[0] || a[1] >= p[3] || a[3] <= p[1]) return [p]
        // p less a: what lies below it, above it, and either side of it within its band
        const left = []
        if (a[1] > p[1]) left.push([p[0], p[1], p[2], a[1]])
        if (a[3] < p[3]) left.push([p[0], a[3], p[2], p[3]])
        const y0 = Math.max(p[1], a[1]), y1 = Math.min(p[3], a[3])
        if (a[0] > p[0]) left.push([p[0], y0, a[0], y1])
        if (a[2] < p[2]) left.push([a[2], y0, p[2], y1])
        return left
      })
    }
    out.push(...parts)
  }
  return out
}

/** the swap's pad, PDF units: a glyph's antialiased edge past its outline, a device pixel and more at the reader's
 *  resolutions (2.5 device pixels a unit and up) */
export const SWAP_PAD = 0.6

/**
 * Boxes ([x0, y0, x1, y1], PDF units) indexed by a coarse grid (20 units a cell): a function giving those that meet a
 * rectangle, grown by `reach`, each once; `skip(i)` leaves the i-th out (a unit's own)
 */
export function avoidIndex(boxes, skip = null, reach = SWAP_PAD) {
  const CELL = 20, grid = new Map()
  boxes.forEach((b, i) => {
    if (!(b[2] >= b[0] && b[3] >= b[1])) return
    for (let gx = Math.floor((b[0] - reach) / CELL); gx <= Math.floor((b[2] + reach) / CELL); gx++) for (let gy = Math.floor((b[1] - reach) / CELL); gy <= Math.floor((b[3] + reach) / CELL); gy++) {
      const k = gx * 100003 + gy
      ;(grid.get(k) ?? grid.set(k, []).get(k)).push(i)
    }
  })
  return r => {
    const seen = new Set(), out = []
    for (let gx = Math.floor(r[0] / CELL); gx <= Math.floor(r[2] / CELL); gx++) for (let gy = Math.floor(r[1] / CELL); gy <= Math.floor(r[3] / CELL); gy++) {
      for (const i of grid.get(gx * 100003 + gy) ?? []) {
        if (seen.has(i) || skip?.(i)) continue
        seen.add(i)
        const b = boxes[i]
        if (b[0] - reach < r[2] && b[2] + reach > r[0] && b[1] - reach < r[3] && b[3] + reach > r[1]) out.push(b)
      }
    }
    return out
  }
}
