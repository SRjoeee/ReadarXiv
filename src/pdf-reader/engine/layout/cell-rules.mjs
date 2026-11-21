// src/pdf-reader/engine/layout/cell-rules.mjs
// The rules near a table's cells, page by page (the maker reads them of our page's ink; a part carries them; the reader keeps a
// CJK cell's text clear of them: layer2.mjs cellBands). Moved out of the text removal's modules (layer-proto/removal.mjs
// pageRules, layout/addon-manifest.mjs checkBoxes) when the removal went (docs/route/ocg-erasure.md §4.2): the rules are the
// PDF's own geometry, a consumer other than the removal, so they stay.
//
// Pure: no DOM, no clock. An original module (no port statement), importing only relative modules.
import { COORD_MAX, isNumber, LayoutRefusal } from './json.mjs'

/** a rule is no more than this across one way, PDF units, and at least RULE_LONG the other: a table's rule */
const RULE_THICK = 1.5, RULE_LONG = 2
/** a box lies within its page's view by this, PDF units (the layout file's slack) */
const SLACK = 1
const kindOf = v => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v)

/**
 * The rules on a page near its table cells' lines (x0, y0, x1, y1 stride 4, rounded to a hundredth): each painted path the page's
 * ink holds as a thin box (no more than RULE_THICK across one way, RULE_LONG or more the other) that stands above a cell's line in
 * the layout file, within 1.3 of its size over its baseline, or below it, within 0.8 under, across its extent, and not through its
 * own glyphs' band. `index` the layout file's (file.mjs indexLayout), `ink` the page's (ink.mjs pageInk: `boxes` and `paths`)
 */
export function pageRules(index, page, ink) {
  const lines = []
  for (const id of index.onPage(page)) {
    const u = index.unit(id)
    if (u?.kind !== 'cell') continue
    for (let j = 0; 8 * j + 7 < u.lines.length; j++) {
      const L = u.lines.subarray ? u.lines.subarray(8 * j, 8 * j + 8) : u.lines.slice(8 * j, 8 * j + 8)
      if (L[0] === page) lines.push(L)
    }
  }
  const out = []
  for (let b = 0; 4 * b + 3 < ink.boxes.length; b++) {
    if (!(ink.paths[b] >= 0)) continue
    const [x0, y0, x1, y1] = [ink.boxes[4 * b], ink.boxes[4 * b + 1], ink.boxes[4 * b + 2], ink.boxes[4 * b + 3]]
    const w = x1 - x0, h = y1 - y0
    if (Math.min(w, h) > RULE_THICK || Math.max(w, h) < RULE_LONG) continue
    const near = lines.some(L => {
      const [, lx0, lx1, base, top, bottom, size] = L
      if (Math.min(x1, lx1) - Math.max(x0, lx0) <= 0.5) return false
      if (y0 < top && y1 > bottom) return false
      return (y0 >= base && y0 <= base + 1.3 * size) || (y1 <= base && y1 >= base - 0.8 * size)
    })
    if (near) out.push(...[x0, y0, x1, y1].map(v => Math.round(v * 100) / 100))
  }
  return out
}

/**
 * Boxes x0, y0, x1, y1 (stride 4) on page `page`: finite numbers, each box not empty (x0 < x1, y0 < y1), within the page's view by
 * SLACK where `views` is given (4 × pages numbers, the layout file's form, from page `first`), else within ±COORD_MAX. Refused at
 * the number that breaks it, a LayoutRefusal; the boxes otherwise
 */
export function checkBoxes(v, page, views, path, first = 1) {
  if (!Array.isArray(v) || v.length % 4 !== 0) throw new LayoutRefusal(path, `not boxes of 4 numbers (${kindOf(v)})`)
  const o = 4 * (page - first)
  const xlo = views ? views[o] - SLACK : -COORD_MAX, ylo = views ? views[o + 1] - SLACK : -COORD_MAX
  const xhi = views ? views[o + 2] + SLACK : COORD_MAX, yhi = views ? views[o + 3] + SLACK : COORD_MAX
  for (let i = 0; i < v.length; i++) {
    const x = v[i], horizontal = i % 2 === 0
    if (!isNumber(x) || x < (horizontal ? xlo : ylo) || x > (horizontal ? xhi : yhi)) throw new LayoutRefusal(`${path}[${i}]`, `not a number within its page's view (${kindOf(x)})`)
    if (i % 4 >= 2 && x <= v[i - 2]) throw new LayoutRefusal(`${path}[${i}]`, 'an empty box')
  }
  return v
}
