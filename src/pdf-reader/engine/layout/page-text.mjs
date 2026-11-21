// A page's text as the delta's proof compares it (layout/delta.mjs proveDelta, PDF-READER §19.8): the page's view, rotation and
// user unit, and its text items (PDF.js's getTextContent, its defaults: each item with a string) held as one digest of their
// exact values — the string, the transform's six numbers, the width and the height bit for bit, the direction and the line
// end —, so that a reading made once for another purpose (arxiv.mjs readArxivText, of arXiv's PDF and of our base page) stands
// in for the proof's own reading of the same document. Two readings of the same bytes give the same items exactly (measured on
// the gate pack's 8 pairs, wrapped and not, 2026-10-24: 290 pages, every item equal in every field, whichever of the box's
// document options the document was opened with); a page whose items differ in any bit is another page's text.
// An original module (no port statement): pure, Web Crypto alone.

/** the canonical bytes of a page's text items, the items with a string in order: each its string (its UTF-16 code units, two bytes
 *  little-endian each, behind their count in four: a lone surrogate is itself, never U+FFFD), the transform's six numbers, its
 *  width and height (float64 little-endian; NaN for one that is no number), its direction (as its string, the same way) and its
 *  line end (one byte); with how many items it holds */
export function textItemsBytes(items) {
  const kept = items.filter(it => it && typeof it.str === 'string')
  const dirs = kept.map(it => String(it.dir ?? ''))
  let n = 0
  kept.forEach((it, k) => { n += 4 + 2 * it.str.length + 64 + 4 + 2 * dirs[k].length + 1 })
  const bytes = new Uint8Array(n), view = new DataView(bytes.buffer)
  const num = x => (typeof x === 'number' ? x : Number.NaN)
  let at = 0
  const units = s => {
    view.setUint32(at, s.length, true)
    at += 4
    for (let i = 0; i < s.length; i++, at += 2) view.setUint16(at, s.charCodeAt(i), true)
  }
  kept.forEach((it, k) => {
    const t = Array.isArray(it.transform) ? it.transform : []
    units(it.str)
    for (let i = 0; i < 6; i++, at += 8) view.setFloat64(at, num(t[i]), true)
    view.setFloat64(at, num(it.width), true)
    view.setFloat64(at + 8, num(it.height), true)
    at += 16
    units(dirs[k])
    bytes[at++] = it.hasEOL === true ? 1 : 0
  })
  return { bytes, count: kept.length }
}

/** lower-case hex of bytes */
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('')

/**
 * A page's text record, { view, rotate, userUnit, count, items }: its view (the CropBox within the MediaBox, PDF.js's `view`),
 * rotation and user unit, how many text items it has, and the SHA-256 of their canonical bytes (textItemsBytes). `page` a PDF.js
 * page, `content` its getTextContent's result
 */
export async function textRecordOf(page, content) {
  const { bytes, count } = textItemsBytes(Array.isArray(content?.items) ? content.items : [])
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))
  return { view: Array.from(page.view ?? [], Number), rotate: page.rotate ?? 0, userUnit: page.userUnit ?? 1, count, items: hex(digest) }
}

/** whether two views are one, each corner within 0.01 (the proof's tolerance for a box) */
const nearView = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 0.01)
/** why the text record `a` is not `b`'s page, or null: the box first (the view within 0.01, rotation and unit exactly), then the
 *  items (their count, then their digest: exactly the same items). A record missing (a page not read) is never a page's */
export function textRecordDiffers(a, b) {
  if (!a || !b) return 'it was not read'
  if (a.rotate !== b.rotate || a.userUnit !== b.userUnit || !nearView(a.view, b.view)) return 'its box differs'
  if (a.count !== b.count) return `${a.count} text items, not ${b.count}`
  return a.items === b.items ? null : 'its text items differ'
}
