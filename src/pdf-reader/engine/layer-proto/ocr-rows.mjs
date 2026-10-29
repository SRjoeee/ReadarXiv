// The place of a bitmap figure's label on its page (the content class `ocr`, PDF-READER §19.15): an ink unit of kind `inkocr`
// (layout/bitmap-text.mjs) carries it as its tuple's eighth element in the units chunk the maker writes after its parts
// (pipeline/ocr-pass.mjs), since no part that is told before it can: [page, bg, fg, anchor, size, set, …lines], each line 16
// numbers, its quad (↖ ↗ ↘ ↙ in its reading, PDF units) and its patch's (the quad grown or drawn in, which the reader fills with
// `bg` before any label's text is drawn); `set` the id of its set's first label (layout/bitmap-text.mjs setsOf: the labels the
// reader fits at one size, as a vector figure's set, PDF-READER §19.12). A reader checks a place's shape where it checks the
// unit's (units.mjs unitStands), and its page and view where it lays it (run.mjs paintOcr).
// An original module (no port statement), importing the JSON bounds alone.
import { COORD_MAX, isInteger, isNumber, PAGES_MAX } from '../layout/json.mjs'

/** a place's values before its lines: page, bg, fg, anchor, size, set */
export const OCR_PLACE_HEAD = 6
/** a set's id at most (a unit's id: units.mjs UNIT_ID_MAX's bound, the view's Int32 owners below it) */
const SET_MAX = 2 ** 31 - 1
/** a line's values: its quad's four corners, then its patch's */
export const OCR_LINE = 16
/** a label's lines at most (layout/bitmap-text.mjs OCR_LINES_MAX) */
export const OCR_PLACE_LINES = 8
/** the anchors, by their code (layout/bitmap-text.mjs OCR_ANCHORS) */
export const OCR_ANCHOR_CODES = Object.freeze(['start', 'centre', 'end'])
/** a label's size at most, PDF units */
const SIZE_MAX = 1000
const r3 = v => Math.round(v * 1000) / 1000

/** a label (layout/bitmap-text.mjs labelsOf's unit) on page `page` as its place, `set` its set's first label's id */
export function ocrPlace(page, u, set) {
  const out = [page, u.bg, u.fg, Math.max(0, OCR_ANCHOR_CODES.indexOf(u.anchor)), r3(u.size), set]
  for (const [quad, patch] of u.quads) for (const [x, y] of [...quad, ...patch]) out.push(r3(x), r3(y))
  return out
}

/** whether `v` is a place's shape: a page, two colours, an anchor's code, a size, a set's id, and one to OCR_PLACE_LINES lines
 *  of numbers within ±COORD_MAX */
export function placeStands(v) {
  if (!Array.isArray(v) || v.length < OCR_PLACE_HEAD + OCR_LINE || (v.length - OCR_PLACE_HEAD) % OCR_LINE !== 0) return false
  if ((v.length - OCR_PLACE_HEAD) / OCR_LINE > OCR_PLACE_LINES) return false
  if (!isInteger(v[0], 1, PAGES_MAX) || !isInteger(v[1], 0, 0xffffff) || !isInteger(v[2], 0, 0xffffff) || !isInteger(v[3], 0, OCR_ANCHOR_CODES.length - 1)) return false
  if (!isNumber(v[4]) || !(v[4] > 0) || v[4] > SIZE_MAX || !isInteger(v[5], 0, SET_MAX)) return false
  for (let i = OCR_PLACE_HEAD; i < v.length; i++) if (!isNumber(v[i]) || Math.abs(v[i]) > COORD_MAX) return false
  return true
}

/** a place read: { page, bg, fg, anchor, size, set, lines: [{ quad, patch }] } (each a quad of four [x, y]), frozen; null where
 *  it has no shape */
export function placeOf(v) {
  if (!placeStands(v)) return null
  const lines = []
  for (let i = OCR_PLACE_HEAD; i < v.length; i += OCR_LINE) {
    const pt = k => Object.freeze([v[i + 2 * k], v[i + 2 * k + 1]])
    lines.push(Object.freeze({ quad: Object.freeze([pt(0), pt(1), pt(2), pt(3)]), patch: Object.freeze([pt(4), pt(5), pt(6), pt(7)]) }))
  }
  return Object.freeze({ page: v[0], bg: v[1], fg: v[2], anchor: OCR_ANCHOR_CODES[v[3]], size: v[4], set: v[5], lines: Object.freeze(lines) })
}
