// Each text item's characters' fills (E1 of the residuals' batch R2, 2026-10-19): the colour each character's glyph is painted
// in, layout/ink.mjs pageInk's `fill`, so that colour is an attribute of the original's characters as their font is. An item is
// told by the glyphs on its baseline within its extent, read in their order as its own text: its characters' text (NFKC, white
// space aside) must be theirs exactly, a ligature's glyph standing for its letters. An item they do not spell so — rotated, none
// there, one too many or too few, a combined accent set as two glyphs, a right-to-left run set in visual order, a character
// standing on two glyphs of two colours — is told nothing (UNKNOWN): never a guess. One function for the maker's draw
// (pipeline/draw-data.mjs, from the ink the maker reads) and the reader's page read live (layer-proto/run.mjs, from the page's own
// operator list), so that a page reads alike either way. Pure; imports the ink's NO_FILL alone.
import { NO_FILL } from './ink.mjs'

/** an item, or a character, whose fill is not told */
export const UNKNOWN = -1
/** a glyph stands on an item's baseline within this share of the item's size */
const ON_BASE = 0.1
/** and within the item's extent, this share of its size beyond either end (the text layer's widths are approximate) */
const PAST = 0.1
/** a glyph painted again over the one before it (a bold faked by overprinting: pdfLaTeX's CJK bold, \pmb) stands within this
 *  share of its size of it, the same character: read once */
const OVER = 0.1

const textOf = u => (typeof u === 'string' ? u.normalize('NFKC').replace(/\s+/g, '') : '')
const fillOfGlyph = g => (Number.isInteger(g.fill) && g.fill >= 0 && g.fill <= 0xffffff && g.fill !== NO_FILL ? g.fill : UNKNOWN)

/**
 * The fills of `items` (each { str, transform: [a, b, c, d, e, f], width, height }, PDF.js's text content items or the draw's
 * rows read as such) from `glyphs` (pageInk's: { u, x0, x1, y, size, fill }; null or none: every item UNKNOWN). One value an
 * item, in order:
 * - an integer, its every character's fill (0xRRGGBB; UNKNOWN for none told);
 * - or runs [offset, fill, offset, fill, …]: the code point each run begins at (0 first, rising), its fill unlike the run before.
 * A character with no text of its own (a space) takes the fill of the character before it, or after it at the item's start
 */
export function itemFills(items, glyphs) {
  const out = new Array(items.length).fill(UNKNOWN)
  if (!Array.isArray(glyphs) || !glyphs.length) return out
  // (the glyphs by baseline, then across: an item's are a band of them)
  const order = glyphs.map((_, i) => i).filter(i => Number.isFinite(glyphs[i].y) && Number.isFinite(glyphs[i].x0) && Number.isFinite(glyphs[i].x1))
  order.sort((p, q) => glyphs[p].y - glyphs[q].y || glyphs[p].x0 - glyphs[q].x0 || p - q)
  const ys = Float64Array.from(order, i => glyphs[i].y)
  const firstAt = y => { let lo = 0, hi = ys.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ys[m] < y) lo = m + 1; else hi = m } return lo }
  items.forEach((it, n) => { out[n] = fillsOfItem(it, glyphs, order, ys, firstAt) })
  return out
}

function fillsOfItem(it, glyphs, order, ys, firstAt) {
  const str = it?.str
  if (typeof str !== 'string' || !str.length || !Array.isArray(it.transform)) return UNKNOWN
  const [a, b, , d, x, y] = it.transform
  // (upright alone: a turned or mirrored item's glyphs run along another axis)
  if (!(a > 0) || !(d > 0) || Math.abs(b) > 0.01 * a || ![x, y, it.width].every(Number.isFinite)) return UNKNOWN
  const size = Math.hypot(a, b) || it.height
  if (!(size > 0)) return UNKNOWN
  const lo = x - PAST * size, hi = x + it.width + PAST * size
  const here = []
  for (let j = firstAt(y - ON_BASE * size); j < ys.length && ys[j] <= y + ON_BASE * size; j++) {
    const g = glyphs[order[j]], mid = (g.x0 + g.x1) / 2
    if (mid >= lo && mid <= hi && textOf(g.u)) here.push(order[j])
  }
  here.sort((p, q) => glyphs[p].x0 - glyphs[q].x0 || glyphs[p].y - glyphs[q].y || p - q)
  // (a glyph painted over the one before it, the same character within OVER of it: one glyph, where both are one colour)
  const kept = []
  for (const g of here) {
    const prev = kept.length ? glyphs[kept.at(-1)] : null, G = glyphs[g]
    if (prev && G.u === prev.u && Math.abs(G.x0 - prev.x0) < OVER * size && Math.abs(G.y - prev.y) < OVER * size) {
      if (fillOfGlyph(G) !== fillOfGlyph(prev)) return UNKNOWN
      continue
    }
    kept.push(g)
  }
  // (the glyphs' text, each code unit by its glyph; the item's, each code unit by its character)
  let gText = ''
  const owner = []
  for (const g of kept) { const t = textOf(glyphs[g].u); gText += t; for (let q = 0; q < t.length; q++) owner.push(g) }
  const chars = [...str]
  let iText = ''
  const startOf = []
  for (const ch of chars) { startOf.push(iText.length); iText += textOf(ch) }
  if (iText !== gText || !iText.length) return UNKNOWN
  // (each character's fill: its glyph's, one glyph alone; a character with no text, its neighbour's)
  const fills = new Array(chars.length).fill(null)
  for (let k = 0; k < chars.length; k++) {
    const t = textOf(chars[k])
    if (!t) continue
    const from = startOf[k], f = fillOfGlyph(glyphs[owner[from]])
    for (let q = from + 1; q < from + t.length; q++) if (owner[q] !== owner[from] && fillOfGlyph(glyphs[owner[q]]) !== f) return UNKNOWN
    fills[k] = f
  }
  for (let k = 1; k < chars.length; k++) if (fills[k] === null) fills[k] = fills[k - 1]
  for (let k = chars.length - 2; k >= 0; k--) if (fills[k] === null) fills[k] = fills[k + 1]
  const runs = []
  fills.forEach((f, k) => { if (!runs.length || runs.at(-1) !== f) runs.push(k, f) })
  return runs.length === 2 ? runs[1] : runs
}

/** whether `v` is an item's fills as itemFills writes them for a string of `n` code points: an integer -1 to 0xFFFFFF, or runs
 *  [offset, fill, …] of two at least, offsets from 0 rising within n, each fill -1 to 0xFFFFFF and unlike the one before */
export function isItemFills(v, n) {
  if (Number.isInteger(v)) return v >= UNKNOWN && v <= 0xffffff
  if (!Array.isArray(v) || v.length < 4 || v.length % 2 !== 0 || v.length > 2 * n || v[0] !== 0) return false
  for (let i = 0; i < v.length; i += 2) {
    const off = v[i], f = v[i + 1]
    if (!Number.isInteger(off) || off >= n || (i > 0 && off <= v[i - 2])) return false
    if (!Number.isInteger(f) || f < UNKNOWN || f > 0xffffff || (i > 0 && f === v[i - 1])) return false
  }
  return true
}

/** each code point's fill of a string of `n` code points from its item's fills (itemFills'): an array of n */
export function fillsByChar(v, n) {
  const out = new Array(n).fill(UNKNOWN)
  if (Number.isInteger(v)) return out.fill(v)
  if (!Array.isArray(v)) return out
  for (let i = 0; i < v.length; i += 2) out.fill(v[i + 1], v[i], i + 2 < v.length ? v[i + 2] : n)
  return out
}
