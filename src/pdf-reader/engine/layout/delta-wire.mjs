// Our base as an incremental update over arXiv's PDF (the delta; layout/delta.mjs builds and proves it): what the head says of
// it and what any holder of its bytes checks without a PDF object layer. The composed document is arXiv's bytes (O of them),
// the delta (D) and the remover's tails; the delta is ONE incremental-update section of the original's kind (layout/section.mjs)
// whose /Prev is the original's startxref and whose offsets are the composed document's. Its head (layer-proto/format.mjs:
// `base.kind` 'delta') names the pages it replaces as page ranges and counts what it reused and wrote. Imports the tail's
// startxref alone: the head's reader (a browser's), the page pass and the box read it alike.

/** a head's base of ours is a delta over arXiv's PDF or a whole PDF of ours (`full`: no `kind` on the wire) */
export const BASE_KINDS = Object.freeze(['delta', 'full'])
/** the delta's bytes at most (the reader holds it in memory beside the tails) */
export const DELTA_MAX_BYTES = 24 * 2 ** 20
/** the delta's share of our whole base page's bytes at most: past it a whole base (`full`) is kept, the delta saving little
 *  (a `latex` paper's fonts and images, re-encoded by another driver, match none of arXiv's) */
export const DELTA_MAX_SHARE = 0.35
/** the objects at most: of either document read, and of the delta written */
export const DELTA_OBJECTS_MAX = 200_000
/** the replaced pages' ranges a head names at most */
export const REPLACED_MAX = 4096
/** why a paper's base of ours is whole (`full`) where a delta was asked: the delta's builder or its proof refused it. `parse`
 *  a document it cannot read (the object layer, the page tree), `encrypted`, `xref` a cross-reference it will not read safely
 *  (hybrid, an entry not at its object, a section that does not parse), `stream` a stream whose /Length does not end at
 *  `endstream`, `pages` our pages more than arXiv's or a replaced page past ours, `bound` a bound of the builder's or of the
 *  delta (DELTA_MAX_BYTES, DELTA_MAX_SHARE, DELTA_OBJECTS_MAX, the held and decoded bytes), `empty` no page replaced, `proof`
 *  the structural proof failed, `shape` a delta the page pass was given that does not check (layer-proto's head reader would
 *  refuse it) */
export const DELTA_WHYS = Object.freeze(['delta-parse', 'delta-encrypted', 'delta-xref', 'delta-stream', 'delta-pages', 'delta-bound', 'delta-empty', 'delta-proof', 'delta-shape'])

/** pages (1-based, any order, repeats allowed) as ascending, non-overlapping ranges [[from, to], …], adjacent ones merged */
export function rangesOf(pages) {
  const s = [...new Set(pages)].sort((a, b) => a - b), out = []
  for (const p of s) { const last = out[out.length - 1]; if (last && last[1] + 1 === p) last[1] = p; else out.push([p, p]) }
  return out
}
/** the pages of ranges, rising */
export function pagesOf(ranges) {
  const out = []
  for (const [a, b] of ranges) for (let p = a; p <= b; p++) out.push(p)
  return out
}
/** the pages ranges hold */
export const countOf = ranges => ranges.reduce((n, [a, b]) => n + b - a + 1, 0)

/**
 * Why `ranges` is not a replaced-pages list within pages 1 to `last` (null where it is): an array of 1 to REPLACED_MAX pairs
 * [from, to] of integers, 1 <= from <= to <= last, ascending, non-overlapping and not adjacent (merged), where `path` names it
 */
export function replacedWhy(ranges, last) {
  if (!Array.isArray(ranges)) return 'not an array'
  if (ranges.length < 1 || ranges.length > REPLACED_MAX) return `not 1 to ${REPLACED_MAX} ranges (${ranges.length})`
  let after = 0
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i]
    if (!Array.isArray(r) || r.length !== 2 || !Number.isSafeInteger(r[0]) || !Number.isSafeInteger(r[1])) return `[${i}]: not a pair of integers`
    if (r[0] < 1 || r[1] < r[0] || r[1] > last) return `[${i}]: not a range within pages 1 to ${last}`
    if (r[0] <= after) return `[${i}]: not after the range before it`
    if (r[0] === after + 1 && i > 0) return `[${i}]: adjacent to the range before it (not merged)`
    after = r[1]
  }
  return null
}

const latin1 = u8 => { let s = ''; for (let k = 0; k < u8.length; k += 8192) s += String.fromCharCode.apply(null, u8.subarray(k, Math.min(u8.length, k + 8192))); return s }
/** the delta's startxref: the number before its final `%%EOF` (its last 1024 bytes, as tail.mjs startxrefOf reads one) */
function lastStartxref(delta) {
  const text = latin1(delta.subarray(Math.max(0, delta.length - 1024)))
  const m = /startxref\n(\d{1,15})\n%%EOF\n$/.exec(text)
  return m === null ? null : Number(m[1])
}

/**
 * The delta's own section, read from its bytes alone as section.mjs writes it: `delta` the bytes, `orig` { bytes, xref } arXiv's
 * PDF's length and startxref. { kind, startxref (composed), prev, size, rows: [[number, generation, offset (composed)], …] },
 * where it is one section of either kind, its /Prev the original's startxref, its startxref where the section begins, and
 * EVERY entry of it pointing exactly at its `n g obj` inside the delta (PDF.js forgives an offset moved onto whitespace, so its
 * silence proves none); else { why }. Never throws
 */
export function deltaSection(delta, orig) {
  const no = why => ({ why })
  if (!(delta instanceof Uint8Array) || delta.length < 1) return no('not bytes')
  if (!Number.isSafeInteger(orig?.bytes) || !Number.isSafeInteger(orig?.xref) || orig.xref < 0 || orig.xref >= orig.bytes) return no('no original to extend')
  const O = orig.bytes, sx = lastStartxref(delta)
  if (sx === null) return no('it does not end in startxref and %%EOF')
  const at = sx - O
  if (at < 1 || at >= delta.length) return no('its startxref is not inside it')
  const text = latin1(delta.subarray(at))
  let kind, rows = [], prev, size
  if (text.startsWith('xref\n')) {
    kind = 'table'
    let i = 5
    for (;;) {
      if (text.startsWith('trailer\n', i)) break
      const h = /^(\d{1,10}) (\d{1,10})\n/.exec(text.slice(i, i + 24))
      if (h === null) return no('a cross-reference subsection that does not read')
      const first = Number(h[1]), count = Number(h[2])
      i += h[0].length
      for (let k = 0; k < count; k++, i += 20) {
        const e = /^(\d{10}) (\d{5}) n\r\n$/.exec(text.slice(i, i + 20))
        if (e === null) return no('a cross-reference entry that does not read')
        rows.push([first + k, Number(e[2]), Number(e[1])])
      }
    }
    const tr = /^trailer\n<< \/Size (\d{1,10}) ([^\n]*)>>\nstartxref\n(\d{1,15})\n%%EOF\n$/.exec(text.slice(i))
    if (tr === null) return no('a trailer that does not read')
    size = Number(tr[1])
    const p = tr[2].match(/\/Prev (\d{1,15})/g)
    if (p === null || p.length !== 1 || /\/(Encrypt|XRefStm)\b/.test(tr[2])) return no('a trailer of other keys')
    prev = Number(p[0].slice(6))
  } else {
    kind = 'stream'
    const h = /^(\d{1,10}) 0 obj\n<< \/Type \/XRef \/Size (\d{1,10}) \/W \[1 4 2\] \/Index \[([\d ]+)\] ([^\n]*?) \/Length (\d{1,10}) >>\nstream\n/.exec(text)
    if (h === null) return no('no cross-reference stream as the delta writes one')
    size = Number(h[2])
    const p = h[4].match(/\/Prev (\d{1,15})/g)
    if (p === null || p.length !== 1 || /\/(Encrypt|XRefStm)\b/.test(h[4])) return no('a cross-reference stream of other keys')
    prev = Number(p[0].slice(6))
    const L = Number(h[5]), d0 = at + h[0].length
    if (d0 + L > delta.length || L % 7 !== 0 || latin1(delta.subarray(d0 + L)) !== `\nendstream\nendobj\nstartxref\n${sx}\n%%EOF\n`) return no('a cross-reference stream whose data does not end it')
    const idx = h[3].trim().split(' ').map(Number)
    if (idx.length % 2 !== 0) return no('an /Index of no pairs')
    let r = 0
    for (let j = 0; j < idx.length; j += 2) {
      for (let k = 0; k < idx[j + 1]; k++, r++) {
        const b = d0 + 7 * r
        if (b + 7 > d0 + L || delta[b] !== 1) return no('a cross-reference stream row that is no uncompressed object\'s')
        rows.push([idx[j] + k, (delta[b + 5] << 8) | delta[b + 6], delta[b + 1] * 2 ** 24 + (delta[b + 2] << 16) + (delta[b + 3] << 8) + delta[b + 4]])
      }
    }
    if (7 * r !== L) return no('a cross-reference stream longer than its /Index')
  }
  if (prev !== orig.xref) return no(`its /Prev ${prev} is not the original's startxref ${orig.xref}`)
  const numbers = new Set()
  for (const [n, g, off] of rows) {
    if (numbers.has(n)) return no(`object ${n} twice`)
    numbers.add(n)
    if (n >= size) return no(`object ${n} past its /Size ${size}`)
    const local = off - O
    if (local < 0 || local >= delta.length) return no(`the entry of object ${n} points outside the delta`)
    const head = `${n} ${g} obj`
    if (latin1(delta.subarray(local, local + head.length + 1)) !== `${head}\n`) return no(`the entry of object ${n} does not point at its object`)
    if (local > 0 && delta[local - 1] !== 10) return no(`object ${n} does not begin a line`)
  }
  if (kind === 'stream' && !rows.some(([n, , off]) => off === sx && n === size - 1)) return no('the cross-reference stream names no entry of its own')
  return { kind, startxref: sx, prev, size, rows }
}
