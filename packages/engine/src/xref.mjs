// A PDF's objects as PDF.js reads them (layout/delta.mjs, the delta's builder and its proof): by the cross-reference sections,
// newest first along /Prev (a classic table or a cross-reference stream, its PNG predictors undone), each object parsed where
// its entry says it is (an uncompressed one at its offset, its `n g obj` exactly there; one in an object stream by its index
// there) and a stream's data the bytes its RESOLVED /Length names from the line after `stream` (an indirect /Length followed),
// never a scan for `endstream`, which reads a stream ending in CR or LF one byte short (1810.04805v2: six images). The object
// layer (@cantoo/pdf-lib, MIT, given) parses each object's syntax alone; its own loader reads a file in file order and takes no
// cross-reference, so where the two orders disagree (an object defined twice, an entry past the object's last definition) it
// would hold another object than PDF.js shows. Refused, never guessed: an encrypted document, a hybrid one (/XRefStm), an entry
// that does not point at its object, a section that does not parse, a stream whose /Length does not end at `endstream`, a
// predictor other than PNG's, more objects or decoded bytes than the bounds. An original module (no port statement); imports
// the tail's startxref alone.
import { startxrefOf } from './tail.mjs'

/** the refusal of a document this reader will not read: `code` the delta's why (delta.mjs DELTA_WHYS) */
export class XrefRefusal extends Error {
  constructor(code, why) { super(why); this.code = code }
}
/** the sections followed along /Prev at most, and an object stream's or a cross-reference stream's decoded bytes at most */
const SECTIONS_MAX = 4096
const DEPTH_MAX = 64
const latin1 = u8 => { let s = ''; for (let k = 0; k < u8.length; k += 8192) s += String.fromCharCode.apply(null, u8.subarray(k, Math.min(u8.length, k + 8192))); return s }
const WS = new Uint8Array(256)
for (const c of [0, 9, 10, 12, 13, 32]) WS[c] = 1
const CHUNK = 1 << 16

/** a decoding stream's bytes, read a chunk at a time and no further than `limit` (a refusal past it) */
function readAtMost(stream, limit) {
  let total = 0
  for (;;) {
    const got = stream.getBytes(CHUNK)
    if (!got.length) break
    total += got.length
    if (total > limit) throw new XrefRefusal('delta-bound', `a stream decoding to more than ${limit} bytes`)
  }
  if (!total) return new Uint8Array(0)
  stream.reset()
  return stream.getBytes(total)
}

/** PNG's row predictors (ISO 32000-1 §7.4.4.4, Predictor 10 to 15): each row's filter byte, then its bytes */
function unpredict(data, columns, colors, bits) {
  const bpp = Math.max(1, Math.ceil((colors * bits) / 8)), row = Math.ceil((columns * colors * bits) / 8)
  if (data.length % (row + 1) !== 0) throw new XrefRefusal('delta-xref', 'a predicted stream whose rows do not fill it')
  const rows = data.length / (row + 1), out = new Uint8Array(rows * row)
  for (let r = 0; r < rows; r++) {
    const f = data[r * (row + 1)], src = r * (row + 1) + 1, at = r * row, up = at - row
    for (let i = 0; i < row; i++) {
      const x = data[src + i], a = i >= bpp ? out[at + i - bpp] : 0, b = r > 0 ? out[up + i] : 0, c = r > 0 && i >= bpp ? out[up + i - bpp] : 0
      let v
      if (f === 0) v = x
      else if (f === 1) v = x + a
      else if (f === 2) v = x + b
      else if (f === 3) v = x + ((a + b) >> 1)
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) }
      else throw new XrefRefusal('delta-xref', `a PNG row filter ${f}`)
      out[at + i] = v & 255
    }
  }
  return out
}

/**
 * The objects of a PDF as PDF.js reads them. `bytes` the PDF; `PL` @cantoo/pdf-lib's exports; `objectsMax` the most entries,
 * `decodedMax` the most bytes its object streams and cross-reference streams decode to in all. Throws XrefRefusal where it
 * will not read the document (encrypted, hybrid, an entry or a section it cannot read safely, a bound). Returns { kind (the
 * newest section's, 'table' or 'stream'), startxref, size (the newest /Size, or one past the greatest number named),
 * trailer { root, info, id } (the newest section's that names each), own (the newest section's own, as written), lookup(ref) (the object, a stream's data its exact
 * bytes; undefined for a free or absent number, or another generation), numbers() (every number in use, rising), pages()
 * (each page's ref, dict and inherited /Resources, /MediaBox, /CropBox, /Rotate, in order), entryOf(n), dataAt(ref) (a stream's
 * data's offset and length in the bytes) }
 */
export function openObjects(bytes, { PL, objectsMax, decodedMax }) {
  const { PDFObjectParser, PDFContext, PDFDict, PDFRawStream, PDFRef, PDFName, PDFNumber, PDFArray, decodePDFRawStream } = PL
  const scratch = PDFContext.create()
  const N = name => PDFName.of(name)
  let decoded = 0
  const decode = (dict, data) => {
    const out0 = readAtMost(decodePDFRawStream(PDFRawStream.of(dict, data)), decodedMax - decoded)
    let out = out0
    let parms = dict.get(N('DecodeParms'))
    if (parms instanceof PDFArray) parms = parms.size() === 1 ? parms.get(0) : (() => { throw new XrefRefusal('delta-xref', 'a stream of several filters with parameters') })()
    if (parms instanceof PDFDict) {
      const num = k => { const v = parms.get(N(k)); return v instanceof PDFNumber ? v.asNumber() : undefined }
      const pred = num('Predictor') ?? 1
      if (pred >= 10) out = unpredict(out0, num('Columns') ?? 1, num('Colors') ?? 1, num('BitsPerComponent') ?? 8)
      else if (pred !== 1) throw new XrefRefusal('delta-xref', `a predictor ${pred}`)
    }
    decoded += out.length
    if (decoded > decodedMax) throw new XrefRefusal('delta-bound', `more than ${decodedMax} bytes of object and cross-reference streams decoded`)
    return out
  }
  const parser = (u8, at) => PDFObjectParser.forBytes(u8.subarray(at), scratch)
  const isKw = (at, kw) => { for (let i = 0; i < kw.length; i++) if (bytes[at + i] !== kw.charCodeAt(i)) return false; return true }
  const skipWs = at => { while (at < bytes.length && WS[bytes[at]]) at++; return at }

  /** the indirect object at `off`, its header `n g obj` exactly there: { n, g, value, data? } (a stream's data its [start,
   *  length] in the bytes, by its /Length resolved through `lengthOf`) */
  function objectAt(off, lengthOf) {
    const head = /^(\d{1,10})[\0\t\n\f\r ]+(\d{1,5})[\0\t\n\f\r ]+obj(?=[\0\t\n\f\r /<[(%]|$)/.exec(latin1(bytes.subarray(off, off + 48)))
    if (head === null) throw new XrefRefusal('delta-xref', `no object header at offset ${off}`)
    const n = Number(head[1]), g = Number(head[2])
    const at = off + head[0].length
    const p = parser(bytes, at)
    p.skipWhitespaceAndComments()
    const start = at + p.bytes.offset()
    if (!(bytes[start] === 60 && bytes[start + 1] === 60)) return { n, g, value: p.parseObject() }
    const dict = p.parseDict()
    p.skipWhitespaceAndComments()
    const after = at + p.bytes.offset()
    if (!isKw(after, 'stream')) return { n, g, value: dict }
    let s = after + 6
    if (bytes[s] === 13 && bytes[s + 1] === 10) s += 2
    else if (bytes[s] === 10 || bytes[s] === 13) s += 1
    else throw new XrefRefusal('delta-stream', `object ${n}: no end of line after \`stream\``)
    const L = lengthOf(dict.get(N('Length')), n)
    if (!Number.isSafeInteger(L) || L < 0 || s + L > bytes.length) throw new XrefRefusal('delta-stream', `object ${n}: a /Length past the file`)
    if (!isKw(skipWs(s + L), 'endstream')) throw new XrefRefusal('delta-stream', `object ${n}: its /Length does not end at endstream`)
    return { n, g, value: PDFRawStream.of(dict, bytes.subarray(s, s + L)), data: [s, L] }
  }

  // ---- the cross-reference sections, newest first: the first entry for a number is its own
  const entries = new Map()
  const trailer = { root: undefined, info: undefined, id: undefined, size: undefined }
  /** the newest section's own /Root, /Info and /ID (what an update's trailer says itself, before any older one fills in) */
  let own = null
  const startxref = startxrefOf(bytes)
  if (startxref === null || startxref >= bytes.length) throw new XrefRefusal('delta-xref', 'no startxref')
  let kind = null, maxNumber = -1
  const set = (n, e) => {
    if (!entries.has(n)) { entries.set(n, e); if (e.t !== 0 && n > maxNumber) maxNumber = n }
    if (entries.size > objectsMax) throw new XrefRefusal('delta-bound', `more than ${objectsMax} objects`)
  }
  const readTrailer = d => {
    if (d.get(N('Encrypt')) !== undefined) throw new XrefRefusal('delta-encrypted', 'an encrypted document')
    if (d.get(N('XRefStm')) !== undefined) throw new XrefRefusal('delta-xref', 'a hybrid cross-reference (/XRefStm)')
    own ??= { root: d.get(N('Root')), info: d.get(N('Info')), id: d.get(N('ID')) }
    for (const k of ['root', 'info', 'id']) { const v = d.get(N(k === 'id' ? 'ID' : k[0].toUpperCase() + k.slice(1))); if (trailer[k] === undefined && v !== undefined) trailer[k] = v }
    const size = d.get(N('Size'))
    if (trailer.size === undefined && size instanceof PDFNumber) trailer.size = size.asNumber()
    const prev = d.get(N('Prev'))
    if (prev === undefined) return null
    if (!(prev instanceof PDFNumber) || !Number.isSafeInteger(prev.asNumber()) || prev.asNumber() < 0 || prev.asNumber() >= bytes.length) throw new XrefRefusal('delta-xref', 'a /Prev that is no offset in the file')
    return prev.asNumber()
  }
  const seen = new Set()
  for (let o = startxref, k = 0; o !== null; k++) {
    if (seen.has(o) || k >= SECTIONS_MAX) throw new XrefRefusal('delta-xref', 'a /Prev chain that loops')
    seen.add(o)
    if (isKw(o, 'xref')) {
      kind ??= 'table'
      const text = latin1(bytes.subarray(o + 4, Math.min(bytes.length, o + 4 + 64)))
      if (!/^[\0\t\n\f\r ]/.test(text)) throw new XrefRefusal('delta-xref', `no cross-reference table at ${o}`)
      // (the table read as tokens: a subsection's first number and count, then each entry's offset, generation and n or f)
      let at = o + 4
      const token = () => { at = skipWs(at); const s = at; while (at < bytes.length && !WS[bytes[at]]) at++; return latin1(bytes.subarray(s, at)) }
      for (;;) {
        const save = at
        const t = token()
        if (t === 'trailer') { at = save; break }
        let first = Number(t)
        const count = Number(token())
        if (!/^\d{1,10}$/.test(t) || !Number.isSafeInteger(count) || count < 0 || count > objectsMax) throw new XrefRefusal('delta-xref', `a cross-reference subsection at ${save} that does not read`)
        for (let i = 0; i < count; i++) {
          const off = token(), gen = token(), type = token()
          if (!/^\d{1,10}$/.test(off) || !/^\d{1,5}$/.test(gen) || (type !== 'n' && type !== 'f')) throw new XrefRefusal('delta-xref', `a cross-reference entry in the table at ${o} that does not read`)
          // (PDF.js's own reading: a subsection from 1 whose first entry is free is read from 0)
          if (i === 0 && type === 'f' && first === 1) first = 0
          set(first + i, type === 'n' ? { t: 1, off: Number(off), g: Number(gen) } : { t: 0 })
        }
      }
      at = skipWs(at)
      if (!isKw(at, 'trailer')) throw new XrefRefusal('delta-xref', `no trailer after the table at ${o}`)
      const d = parser(bytes, at + 7).parseObject()
      if (!(d instanceof PDFDict)) throw new XrefRefusal('delta-xref', `a trailer at ${at} that is no dictionary`)
      o = readTrailer(d)
    } else {
      kind ??= 'stream'
      const x = objectAt(o, v => (v instanceof PDFNumber ? v.asNumber() : NaN))
      const d = x.value instanceof PDFRawStream ? x.value.dict : null
      if (d === null || d.get(N('Type')) !== N('XRef')) throw new XrefRefusal('delta-xref', `no cross-reference stream at ${o}`)
      const W = d.get(N('W')), size = d.get(N('Size'))
      if (!(W instanceof PDFArray) || W.size() !== 3 || !(size instanceof PDFNumber)) throw new XrefRefusal('delta-xref', `a cross-reference stream at ${o} without /W or /Size`)
      const w = W.asArray().map(v => (v instanceof PDFNumber ? v.asNumber() : -1))
      if (w.some(v => !Number.isInteger(v) || v < 0 || v > 8) || w[1] < 1) throw new XrefRefusal('delta-xref', `a cross-reference stream at ${o} with /W ${W}`)
      const Index = d.get(N('Index'))
      const idx = Index instanceof PDFArray ? Index.asArray().map(v => (v instanceof PDFNumber ? v.asNumber() : -1)) : [0, size.asNumber()]
      if (idx.length % 2 !== 0 || idx.some(v => !Number.isSafeInteger(v) || v < 0)) throw new XrefRefusal('delta-xref', `a cross-reference stream at ${o} with /Index ${Index}`)
      const data = decode(d, x.value.contents), rw = w[0] + w[1] + w[2]
      let r = 0
      const field = (at, width, dflt) => { if (width === 0) return dflt; let v = 0; for (let i = 0; i < width; i++) v = v * 256 + data[at + i]; return v }
      for (let j = 0; j < idx.length; j += 2) {
        if (idx[j + 1] > objectsMax) throw new XrefRefusal('delta-bound', `more than ${objectsMax} objects`)
        for (let i = 0; i < idx[j + 1]; i++, r++) {
          const at = r * rw
          if (at + rw > data.length) throw new XrefRefusal('delta-xref', `a cross-reference stream at ${o} shorter than its /Index`)
          const t = field(at, w[0], 1), f2 = field(at + w[0], w[1], 0), f3 = field(at + w[0] + w[1], w[2], 0)
          // (an entry type PDF.js does not know makes it read the whole file again, by its own scan: refused)
          if (t > 2) throw new XrefRefusal('delta-xref', `a cross-reference entry of type ${t}`)
          set(idx[j] + i, t === 1 ? { t: 1, off: f2, g: f3 } : t === 2 ? { t: 2, stm: f2, i: f3, g: 0 } : { t: 0 })
        }
      }
      o = readTrailer(d)
    }
  }
  if (trailer.root === undefined) throw new XrefRefusal('delta-xref', 'no /Root')
  // (PDF.js reads the whole file again where object 0 is in use)
  if (entries.has(0) && entries.get(0).t !== 0) throw new XrefRefusal('delta-xref', 'object 0 in use')

  // ---- the objects, parsed once each where their entries say
  const memo = new Map(), dataOf = new Map(), stms = new Map(), busy = new Set()
  const look = v => (v instanceof PDFRef ? lookup(v) : v)
  const lengthOf = (v, n) => {
    if (v instanceof PDFNumber) return v.asNumber()
    if (v instanceof PDFRef) {
      if (v.objectNumber === n) return NaN
      const L = lookup(v)
      return L instanceof PDFNumber ? L.asNumber() : NaN
    }
    return NaN
  }
  /** an object stream's members: number -> [offset in the decoded bytes], its data decoded once */
  function stmOf(s) {
    if (stms.has(s)) return stms.get(s)
    const e = entries.get(s)
    if (e?.t !== 1) throw new XrefRefusal('delta-xref', `object stream ${s} is not an uncompressed object`)
    const x = objectAt(e.off, lengthOf)
    if (x.n !== s || !(x.value instanceof PDFRawStream) || x.value.dict.get(N('Type')) !== N('ObjStm')) throw new XrefRefusal('delta-xref', `object ${s} is no object stream`)
    const d = x.value.dict, n = d.get(N('N')), first = d.get(N('First'))
    if (!(n instanceof PDFNumber) || !(first instanceof PDFNumber)) throw new XrefRefusal('delta-xref', `object stream ${s} without /N or /First`)
    const data = decode(d, x.value.contents)
    const head = latin1(data.subarray(0, Math.min(data.length, first.asNumber()))).trim().split(/[\0\t\n\f\r ]+/).map(Number)
    if (head.length < 2 * n.asNumber() || head.some(v => !Number.isSafeInteger(v))) throw new XrefRefusal('delta-xref', `object stream ${s}'s header does not read`)
    const out = { data, first: first.asNumber(), members: head.slice(0, 2 * n.asNumber()) }
    stms.set(s, out)
    return out
  }
  /** the object `ref` names (PDF.js's: by the newest entry for its number, of its generation), undefined for none */
  function lookup(ref) {
    const n = ref.objectNumber
    if (memo.has(n)) { const m = memo.get(n); return m.g === ref.generationNumber ? m.value : undefined }
    const e = entries.get(n)
    if (!e || e.t === 0) return undefined
    if (busy.has(n)) throw new XrefRefusal('delta-xref', `object ${n} is its own /Length`)
    busy.add(n)
    try {
      let value
      if (e.t === 1) {
        const x = objectAt(e.off, lengthOf)
        if (x.n !== n || x.g !== e.g) throw new XrefRefusal('delta-xref', `the entry of object ${n} points at object ${x.n} ${x.g}`)
        value = x.value
        if (x.data) dataOf.set(n, x.data)
      } else {
        const st = stmOf(e.stm)
        if (e.i * 2 + 1 >= st.members.length || st.members[2 * e.i] !== n) throw new XrefRefusal('delta-xref', `object ${n} is not where its entry says in object stream ${e.stm}`)
        value = parser(st.data, st.first + st.members[2 * e.i + 1]).parseObject()
      }
      memo.set(n, { g: e.g, value })
      return e.g === ref.generationNumber ? value : undefined
    } finally { busy.delete(n) }
  }
  const numbers = () => [...entries].filter(([, e]) => e.t !== 0).map(([n]) => n).sort((a, b) => a - b)
  function pages() {
    const out = [], visited = new Set()
    const cat = look(trailer.root)
    const root = cat instanceof PDFDict ? cat.get(N('Pages')) : undefined
    const INH = ['Resources', 'MediaBox', 'CropBox', 'Rotate']
    const walk = (ref, inherited, depth) => {
      if (!(ref instanceof PDFRef) || visited.has(ref.objectNumber) || depth > DEPTH_MAX) throw new XrefRefusal('delta-parse', 'a page tree that is no tree')
      visited.add(ref.objectNumber)
      const node = lookup(ref)
      if (!(node instanceof PDFDict)) throw new XrefRefusal('delta-parse', `page tree node ${ref} is no dictionary`)
      const inh = { ...inherited }
      for (const k of INH) { const v = node.get(N(k)); if (v !== undefined) inh[k] = v }
      const kids = look(node.get(N('Kids')))
      if (node.get(N('Type')) === N('Pages') || (node.get(N('Type')) !== N('Page') && kids instanceof PDFArray)) {
        if (!(kids instanceof PDFArray)) throw new XrefRefusal('delta-parse', `page tree node ${ref} without /Kids`)
        for (const k of kids.asArray()) walk(k, inh, depth + 1)
      } else out.push({ ref, node, inherited: inh })
    }
    walk(root, {}, 0)
    return out
  }
  const size = Math.max(trailer.size ?? 0, maxNumber + 1)
  return {
    kind, startxref, size, trailer, own, lookup, numbers, pages, entryOf: n => entries.get(n) ?? null,
    /** a stream's data in the bytes ([start, length]), once it is looked up */
    dataAt: ref => { lookup(ref); return dataOf.get(ref.objectNumber) ?? null },
  }
}
