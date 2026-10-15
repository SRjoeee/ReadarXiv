// The add-on's tail, read from its bytes (the prepare pipeline's bundle 4 contract, C1.4): arXiv's PDF followed by the
// remover's incremental updates, each ending in a cross-reference section of the original's kind (layout/remove.mjs makeAddon
// writes it: classic `xref … trailer << … /Prev >> startxref`, or a cross-reference stream) that names the page tree's root,
// which it rewrote, and the fresh object numbers it allocated. The chain of tails is checked from these bytes alone, so that
// no field written beside a tail can disagree with it.
//
// This is today's form, read as the remover writes it; the chained tails of the remover's next version (E3) replace the
// reading, not the two functions' meaning. Imports nothing: the readers of the layer's format take it.

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
 * greatest of the fresh numbers. null where the tail ends in no such section (or names the root alone). Never throws
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
  if (section === null || section.prev === null || section.numbers.length < 2) return null
  const numbers = section.numbers.sort((a, b) => a - b)
  return { startxref, prev: section.prev, root: numbers[0], first: numbers[1], last: numbers[numbers.length - 1] }
}

/** the section `xref\n(<first> <count>\n<count × 20 bytes>)… trailer\n<< … /Prev n … >>\n`, at the end of `body` */
function tableSection(body) {
  const trailerAt = body.lastIndexOf('trailer\n')
  if (trailerAt < 0) return null
  let from = body.lastIndexOf('\nxref\n', trailerAt)
  if (from < 0) return null
  from += 6
  // the subsections must reach the trailer exactly: nothing but the table lies between
  const numbers = []
  let at = from
  while (at < trailerAt) {
    const head = /^(\d{1,9}) (\d{1,9})\n/.exec(body.slice(at, at + 24))
    if (head === null) return null
    const first = Number(head[1]), count = Number(head[2])
    at += head[0].length + 20 * count
    if (count > 1_000_000 || at > trailerAt) return null
    for (let i = 0; i < count; i++) numbers.push(first + i)
  }
  if (at !== trailerAt) return null
  const prev = /\/Prev (\d+)/.exec(body.slice(trailerAt))?.[1]
  return { numbers, prev: prev === undefined ? null : Number(prev) }
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
  const numbers = []
  for (let i = 0; i < pairs.length; i += 2) {
    if (pairs[i + 1] > 1_000_000) return null
    for (let k = 0; k < pairs[i + 1]; k++) numbers.push(pairs[i] + k)
  }
  const prev = /\/Prev (\d+)/.exec(dict)?.[1]
  return { numbers, prev: prev === undefined ? null : Number(prev) }
}
