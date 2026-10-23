// The add-on's tail, read from its bytes (the prepare pipeline's bundle 4 contract, C1.4): arXiv's PDF followed by the
// remover's incremental updates, each ending in a cross-reference section of the original's kind (layout/remove.mjs makeAddon
// writes it: classic `xref … trailer << … /Prev >> startxref`, or a cross-reference stream) that names the page tree's root,
// which it rewrote, and the fresh object numbers it allocated. The chain of tails is checked from these bytes alone, so that
// no field written beside a tail can disagree with it.
//
// The remover writes one such update a part (its chained tails, layout/remove.mjs makeAddon's `chain`): each section's /Prev
// the last one's, its offsets from the document's end so far, its fresh numbers after the last tail's, the same root; the
// reading is the same for each. Imports nothing: the readers of the layer's format and the remover's side take it.

/** a part's tail at most, raw (the largest today is 32.9 KB a whole paper): the part's reader (layer-proto/format.mjs, which
 *  re-exports it) and the remover's side (layout/remove.mjs removerOf, layout/chain.mjs) hold a tail to it */
export const TAIL_CAP = 2 ** 20
/** the last bytes of a tail that are looked at for its section */
const WINDOW = 256 * 1024
/** the bytes at the end of a PDF that are looked at for its `startxref` (remove.mjs reads the same 1024) */
const STARTXREF_WINDOW = 1024

/** bytes as a string, one character a byte (latin-1), in slices that fit an argument list */
function latin1(b) {
  let s = ''
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, Math.min(b.length, i + 8192)))
  return s
}

/**
 * The `startxref` of a PDF as the remover reads it (layout/remove.mjs, where it writes `/Prev`): in the last 1024 bytes, the
 * number before the final `%%EOF`, else the number after the last `startxref`. null where there is none
 */
export function startxrefOf(pdf) {
  const text = latin1(pdf.subarray(Math.max(0, pdf.length - STARTXREF_WINDOW)))
  const last = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text)?.[1] ?? /startxref\s+(\d+)/.exec(text.slice(text.lastIndexOf('startxref')))?.[1]
  const n = Number(last)
  return last !== undefined && Number.isSafeInteger(n) ? n : null
}

/**
 * The last cross-reference section of a tail, as the remover writes it, in the tail's last 256 KiB: `startxref`, the offset
 * the tail ends in (an offset into the whole document, arXiv's bytes first); `prev`, the section's `/Prev` (the startxref of
 * the document before it); `root`, the page tree's root, the least object number the section names (the tree is an object
 * of the document, rewritten, and the fresh objects are numbered above all it had); `first` and `last`, the least and
 * greatest of the fresh numbers (a remover's tail's: of a delta over arXiv's PDF, layout/delta.mjs, read the same way, `root`
 * and `first` mean nothing, the delta rewriting no page tree); `xrefAt`, where the section begins in the tail (the offset `startxref` declares, less where the
 * tail begins). null where the tail ends in no such section (or names the root alone). Never throws
 */
export function tailLinks(tail) {
  if (!(tail instanceof Uint8Array)) return null
  const text = latin1(tail.subarray(Math.max(0, tail.length - WINDOW)))
  const end = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text)
  if (end === null) return null
  const startxref = Number(end[1])
  if (!Number.isSafeInteger(startxref)) return null
  const body = text.slice(0, end.index)
  const section = body.endsWith('endobj\n') ? streamSection(body) : tableSection(body)
  if (section === null || section.prev === null) return null
  // the objects the section defines are defined inside the tail: each costs a byte of it at least
  const nums = summary(section.ranges, tail.length)
  if (nums === null || nums.total < 2) return null
  return { startxref, xrefAt: tail.length - text.length + section.at, prev: section.prev, root: nums.min, first: nums.second, last: nums.max }
}

/** an object number at most (ISO 32000-1, annex C: 8,388,607) */
const OBJECT_MAX = 8_388_607

/**
 * The least, the second least and the greatest object number of `ranges` ([first, count] each), in one pass over the ranges
 * and never over the numbers: null where a range is not a run of 1 or more object numbers within OBJECT_MAX, where two
 * overlap (a number twice), or where the numbers in all are more than `most`
 */
function summary(ranges, most) {
  if (ranges.length > most) return null
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0])
  let total = 0, max = -1
  for (let i = 0; i < sorted.length; i++) {
    const [first, count] = sorted[i]
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(count) || first < 0 || count < 1 || first + count - 1 > OBJECT_MAX) return null
    if (i > 0 && first <= max) return null
    total += count
    if (total > most) return null
    max = first + count - 1
  }
  if (total < 1) return null
  const [first, count] = sorted[0]
  return { min: first, second: count > 1 ? first + 1 : sorted[1]?.[0], max, total }
}

/** the section `xref\n(<first> <count>\n<count × 20 bytes>)… trailer\n<< … /Prev n … >>\n`, at the end of `body` */
function tableSection(body) {
  const trailerAt = body.lastIndexOf('trailer\n')
  if (trailerAt < 0) return null
  const found = body.lastIndexOf('\nxref\n', trailerAt)
  if (found < 0) return null
  const from = found + 6
  // the subsections must reach the trailer exactly: nothing but the table lies between, and each entry is 20 bytes of it
  const ranges = []
  let at = from
  while (at < trailerAt) {
    const head = /^(\d{1,9}) (\d{1,9})\n/.exec(body.slice(at, at + 24))
    if (head === null) return null
    const first = Number(head[1]), count = Number(head[2])
    at += head[0].length + 20 * count
    if (at > trailerAt) return null
    ranges.push([first, count])
  }
  if (at !== trailerAt) return null
  return { ranges, prev: prevOf(body.slice(trailerAt)), at: found + 1 }
}

/** the section `<n> 0 obj\n<< /Type /XRef … /Index [<first> <count> …] … /Prev n … /Length l >>\nstream\n…\nendstream\nendobj\n` */
function streamSection(body) {
  const dictAt = body.lastIndexOf(' obj\n<< /Type /XRef ')
  if (dictAt < 0) return null
  const streamAt = body.indexOf('>>\nstream\n', dictAt)
  if (streamAt < 0) return null
  const dict = body.slice(dictAt, streamAt)
  const index = /\/Index \[([\d ]+)\]/.exec(dict)?.[1]
  if (index === undefined) return null
  const pairs = index.trim().split(/\s+/).map(Number)
  if (pairs.length % 2 !== 0) return null
  const ranges = []
  for (let i = 0; i < pairs.length; i += 2) ranges.push([pairs[i], pairs[i + 1]])
  return { ranges, prev: prevOf(dict), at: body.lastIndexOf('\n', dictAt) + 1 }
}

/** the section's /Prev, an offset that is a safe integer; null otherwise */
function prevOf(text) {
  const prev = /\/Prev (\d+)/.exec(text)?.[1]
  const n = Number(prev)
  return prev !== undefined && Number.isSafeInteger(n) ? n : null
}
