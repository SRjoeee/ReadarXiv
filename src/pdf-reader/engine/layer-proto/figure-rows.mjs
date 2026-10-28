// The figure units a part carries (BUNDLE 10, the content class `figures`: docs/route/orphan-text.md stage 5): each a figure's
// ink unit (layout/figure-text.mjs), a unit of the paper's of kind `inkfigures` whose text the ink units' chunk holds and the reader
// translates as any unit's, its place on its page here: its run's first glyph's origin, its direction, its box's length along it,
// its size and its band, its anchor, its fill and its font's name. A part carries those of its pages; a reader checks each row
// before it is used, as every part's field is (format.mjs partShape), and refuses the part for a row of no shape.
// An original module (no port statement), importing the JSON bounds alone.
import { COORD_MAX, isInteger, isNumber, LayoutRefusal } from '../layout/json.mjs'

/** a row's values: [id, group, page, x, y, ux, uy, length, size, ascent, descent, anchor, fill, font], `group` its optional-content
 *  group's number (`axt:f<group>`, layout/wrap.mjs) */
export const FIGURE_ROW = 14
/** a figure unit's group, as the wrap names it (layout/figure-text.mjs figureGroup) */
export const figureGroupOf = k => `f${k}`
/** the groups a paper's figure units may hold at most (layout/figure-text.mjs FIGURE_UNITS_DOC, with room) */
const GROUP_MAX = 1_000_000
/** a unit's anchor, where a translation of another length keeps its place, by its code in a row */
export const ANCHORS = Object.freeze(['start', 'centre', 'end'])
/** a font's name in a row at most, in code units */
export const FONT_NAME_MAX = 64
/** a unit's size at most, PDF units, and its band's ascent and descent at most, em */
const SIZE_MAX = 1000, BAND_MAX = 4
/** an origin lies within its page's view by this, PDF units */
const SLACK = 1
const r3 = v => Math.round(v * 1000) / 1000
const r6 = v => Math.round(v * 1e6) / 1e6
const kindOf = v => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v)

/** whether a figure unit's run is level, read left to right (its direction (ux, uy)): its translation's words are then in the
 *  page's text layer and lit by the hover, its original anchored on the left (pipeline/ink-pass.mjs figureAnchors); a turned one's
 *  are not selectable, and the figure's float lights it */
export const levelRun = (ux, uy) => Math.abs(uy) < 1e-6 && ux > 0

/** a figure unit (layout/wrap.mjs wrapFinal's `figures.units`, with its unit's id) as its row */
export function figureRow(id, u) {
  return [id, Number(/^f(\d+)$/.exec(u.group ?? '')?.[1] ?? -1), u.page, r3(u.x), r3(u.y), r6(u.ux), r6(u.uy), r3(u.length), r3(u.size), r3(u.ascent), r3(u.descent), Math.max(0, ANCHORS.indexOf(u.anchor)), Number.isInteger(u.fill) ? u.fill : -1, String(u.font ?? '').slice(0, FONT_NAME_MAX)]
}

/**
 * A part's figure rows checked (`rows` as the part holds them): an array of rows, ids rising and each a unit of the paper's
 * (below `unitCount`), each on a page of the part's (a to b), its origin within that page's view (`views`, stride 4 from page a),
 * its direction a unit vector, its length and size positive, its band's ascent at least 0 and its descent at most 0, its anchor a
 * code of ANCHORS, its fill 0xRRGGBB or -1, its font a string. Returns each as { id, page, x, y, ux, uy, length, size, ascent,
 * descent, anchor, fill, font }, frozen. Throws LayoutRefusal at `figures[i]…`
 */
export function checkFigures(rows, { a, b, views, unitCount }) {
  const fail = (path, why) => new LayoutRefusal(path, why)
  if (!Array.isArray(rows)) throw fail('figures', `not an array (${kindOf(rows)})`)
  const out = []
  let last = -1
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], path = `figures[${i}]`
    if (!Array.isArray(r) || r.length !== FIGURE_ROW) throw fail(path, `not [id, group, page, x, y, ux, uy, length, size, ascent, descent, anchor, fill, font] (${kindOf(r)})`)
    // (each value named by its place in the row, as the wire holds it)
    const [id, group, page, x, y, ux, uy, length, size, ascent, descent, anchor, fill, font] = r
    if (!isInteger(id, last + 1, unitCount - 1)) throw fail(`${path}[0]`, 'not a unit\'s id above the last')
    last = id
    if (!isInteger(group, 0, GROUP_MAX)) throw fail(`${path}[1]`, 'not a group\'s number')
    if (!isInteger(page, a, b)) throw fail(`${path}[2]`, `not a page ${a} to ${b}`)
    const o = 4 * (page - a)
    if (!isNumber(x) || x < views[o] - SLACK || x > views[o + 2] + SLACK) throw fail(`${path}[3]`, 'not a number within its page\'s view')
    if (!isNumber(y) || y < views[o + 1] - SLACK || y > views[o + 3] + SLACK) throw fail(`${path}[4]`, 'not a number within its page\'s view')
    if (!isNumber(ux) || !isNumber(uy) || Math.abs(Math.hypot(ux, uy) - 1) > 1e-3) throw fail(`${path}[5]`, 'not a direction')
    if (!isNumber(length) || !(length > 0) || length > COORD_MAX) throw fail(`${path}[7]`, 'not a length above 0')
    if (!isNumber(size) || !(size > 0) || size > SIZE_MAX) throw fail(`${path}[8]`, `not a size above 0 and at most ${SIZE_MAX}`)
    if (!isNumber(ascent) || ascent < 0 || ascent > BAND_MAX) throw fail(`${path}[9]`, `not an ascent 0 to ${BAND_MAX}`)
    if (!isNumber(descent) || descent > 0 || descent < -BAND_MAX) throw fail(`${path}[10]`, `not a descent -${BAND_MAX} to 0`)
    if (!isInteger(anchor, 0, ANCHORS.length - 1)) throw fail(`${path}[11]`, 'not an anchor\'s code')
    if (!isInteger(fill, -1, 0xffffff)) throw fail(`${path}[12]`, 'not a fill, 0xRRGGBB or -1')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: a control character is what is refused
    if (typeof font !== 'string' || font.length > FONT_NAME_MAX || /[\u0000-\u001f\u007f]/.test(font)) throw fail(`${path}[13]`, `not a font's name of ${FONT_NAME_MAX} code units at most`)
    out.push(Object.freeze({ id, group: figureGroupOf(group), page, x, y, ux, uy, length, size, ascent, descent, anchor: ANCHORS[anchor], fill, font }))
  }
  return Object.freeze(out)
}
