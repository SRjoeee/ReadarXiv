// Our pages' content streams read as the wrap reads them (layout/wrap.mjs; docs/route/ocg-erasure.md §2): the streams lexed (lex),
// each page walked with its text state followed, each string split into its character codes by its font, and the walk aligned
// with PDF.js's own reading (alignOf: the n-th text-showing operation of the list is the n-th of the walk, its k-th glyph the k-th
// code, the character codes compared; the m-th painted path the m-th painting operator). A page that does not align is refused
// whole. What is left of the text-removed PDF's remover (Plan 8b, 2026-10-06/07): the add-on it wrote, its page sets and its
// tails are gone with the erasure by optional content (§4.2); its reading of a page stays, the wrap's.
//
// An original module (no port statement). It imports none of PDF.js: a page is aligned by its facts (alignOf) or a list given,
// and the PDF object layer (@cantoo/pdf-lib, MIT) and a tolerant inflate are given.
//
// Isolation, the caller's contract (the coordinator's ruling of 2026-10-07): arXiv's PDF, and ours made from its source, are
// untrusted, and the hard bound on what reading them may cost is the process it runs in, not this module. Its budgets (WALK_MAX,
// HELD_MAX, BYTES_MAX, FORM_DEPTH) refuse a page early and softly, the rest of the paper going on; PDF.js and the object layer may
// still exceed any of them: run it in the maker child, under a hard memory limit and a wall clock, one paper at a time.
const WS = new Uint8Array(256)
for (const c of [0, 9, 10, 12, 13, 32]) WS[c] = 1
const DL = new Uint8Array(256)
for (const c of '()<>[]{}/%') DL[c.charCodeAt(0)] = 1
/** the powers of ten a number of at most 15 digits divides by, each exact */
const POW10 = Array.from({ length: 16 }, (_, k) => 10 ** k)
/**
 * The number a token is ([+-]? then digits with at most one point, a digit at least: what PDF.js reads as one), or undefined
 * for any other token: its value read from its bytes, as Number reads its text. A token of at most 15 digits is an integer m
 * below 2^53 over 10^k (k at most 15), both exact, and IEEE division rounds m / 10^k correctly, as Number's reading of the text
 * is; a longer one is read by Number
 */
function numberAt(b, i, j) {
  let k = i, neg = false
  if (b[k] === 43 || b[k] === 45) { neg = b[k] === 45; k++ }
  let m = 0, digits = 0, frac = 0, point = false
  for (; k < j; k++) {
    const c = b[k]
    if (c >= 48 && c <= 57) { m = m * 10 + (c - 48); digits++; if (point) frac++ } else if (c === 46 && !point) point = true
    else return undefined
  }
  if (digits === 0) return undefined
  if (digits > 15) return Number(latin1(b.subarray(i, j)))
  const v = frac ? m / POW10[frac] : m
  return neg ? -v : v
}
/** the keywords a content stream is made of that are at most three bytes long (PDF 32000-1 Annex A), by their bytes packed (a
 *  token holds no byte 0, white space), so that reading one makes no string */
const SHORT = new Map()
for (const t of ['b', 'B', 'b*', 'B*', 'BDC', 'BI', 'BMC', 'BT', 'BX', 'c', 'cm', 'CS', 'cs', 'd', 'd0', 'd1', 'Do', 'DP', 'EI', 'EMC', 'ET', 'EX', 'f', 'F', 'f*', 'G', 'g', 'gs', 'h', 'i', 'ID', 'j', 'J', 'K', 'k', 'l', 'm', 'M', 'MP', 'n', 'q', 'Q', 're', 'RG', 'rg', 'ri', 's', 'S', 'SC', 'sc', 'SCN', 'scn', 'sh', 'T*', 'Tc', 'Td', 'TD', 'Tf', 'Tj', 'TJ', 'TL', 'Tm', 'Tr', 'Ts', 'Tw', 'Tz', 'v', 'w', 'W', 'W*', 'y', "'", '"']) {
  let key = 0
  for (let x = t.length - 1; x >= 0; x--) key = key * 256 + t.charCodeAt(x)
  SHORT.set(key, t)
}
/** a token's text: a short keyword's own string, any other short token's made from its bytes with no view of them */
function wordAt(b, i, j) {
  const len = j - i
  if (len > 3) return latin1(b.subarray(i, j))
  if (len === 0) return ''
  const key = len === 1 ? b[i] : len === 2 ? b[i] + 256 * b[i + 1] : b[i] + 256 * b[i + 1] + 65536 * b[i + 2]
  return SHORT.get(key) ?? (len === 1 ? String.fromCharCode(b[i]) : len === 2 ? String.fromCharCode(b[i], b[i + 1]) : String.fromCharCode(b[i], b[i + 1], b[i + 2]))
}
/** a hex digit's value by its byte, -1 for any other */
const DIGIT = new Int8Array(256).fill(-1)
for (let c = 0; c < 10; c++) DIGIT[48 + c] = c
for (let c = 0; c < 6; c++) { DIGIT[65 + c] = 10 + c; DIGIT[97 + c] = 10 + c }
const td = new TextDecoder('latin1')
/** bytes as the characters of their codes (ISO 8859-1, which TextDecoder's 'latin1', windows-1252, is not) */
const latin1 = u8 => { let out = ''; for (let k = 0; k < u8.length; k += 8192) out += String.fromCharCode.apply(null, u8.subarray(k, k + 8192)); return out }

/**
 * The heap a lexed token, and an event the walk records, is held in, in bytes, by its kind: each at least what 1 million
 * of it hold after a full collection (measured with this lexer: an operator 98, a number 10, a name 50 and its length, a
 * string 250 and a hex string 282 with their bytes, an array 42, a dictionary 81, a keyword in an array 74; the
 * re-review's round 2 measured the old lexer's strings at 271 with their bytes in JS arrays). An array or a dictionary is
 * counted as it opens, so that one never closed counts too. What the walk holds is these summed (lex's `bytes`, the
 * walk's `held`), never what it visits.
 */
export const COST = Object.freeze({ op: 128, num: 16, name: 64, str: 320, mark: 96, kw: 128, atom: 8, event: 160, code: 64 })
/** the operators the walk reads: every other one is lexed and let go with its operands */
const WALK_OPS = new Set(['q', 'Q', 'Tf', 'Tc', 'Tw', 'Tr', 'gs', 'Do', 'Tj', 'TJ', "'", '"', 'BI', 'sh', 'S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'n'])
/** a token longer than this is no operator, number or keyword PDF.js knows: it is read as an unknown one, not kept whole */
const TOKEN_MAX = 255

/**
 * A content stream's operators: { op, args, s, e } (s: the first operand's start, e: the operator's end), each string
 * operand { t: 'str', b: bytes, s, e }, each name { t: 'name', v }, an array as an array, a dictionary as { t: 'dict', v }.
 * An inline image is one operator, BI, from its parameters to its EI. Every pass of every loop here advances by a byte
 * at least or throws (an inline image's parameters holding a delimiter none starts with: `)`, `{`, `}`), so a stream
 * of n bytes is read in O(n) whatever it holds; a stream that throws is one the walk refuses its page for.
 * `limit`: the most bytes (COST) it may hold, past which it throws LexLimit, counted as each token is read (the
 * operands waiting for their operator too); the operators' `bytes`, what it holds. `keep`: the operators it keeps (the
 * walk's), every other one read and let go with its operands; null, every one.
 */
export function lex(b, limit = Infinity, keep = null) {
  const ops = []
  const n = b.length
  let i = 0, stack = [], start = -1, held = 0, pending = 0
  const marks = []
  const take = cost => { pending += cost; if (held + pending > limit) throw new LexLimit(limit) }
  const push = (v, s, cost) => { take(cost); if (start < 0) start = s; if (marks.length) marks.at(-1).items.push(v); else stack.push(v) }
  const operator = (op, s, e) => {
    if (!keep || keep.has(op)) {
      held += pending + COST.op
      if (held > limit) throw new LexLimit(limit)
      ops.push({ op, args: stack, s, e })
    }
    stack = []; start = -1; pending = 0
  }
  const tokenEnd = from => { let j = from; while (j < n && !WS[b[j]] && !DL[b[j]]) j++; return j }
  while (i < n) {
    const c = b[i]
    if (WS[c]) { i++; continue }
    if (c === 37) { while (i < n && b[i] !== 10 && b[i] !== 13) i++; continue }
    const s0 = i
    if (c === 40) {
      // (its end first, the paren that balances it, then its bytes into an array of at most that many)
      let j = i + 1, depth = 1
      while (j < n && depth > 0) { const d = b[j]; if (d === 92) { j += 2; continue } if (d === 40) depth++; else if (d === 41) depth--; j++ }
      j = Math.min(j, n)
      take(COST.str + (j - i))
      const out = new Uint8Array(Math.max(0, j - i))
      let o = 0
      depth = 1
      i++
      while (i < n && depth > 0) {
        const d = b[i]
        if (d === 92) {
          const e = b[i + 1]
          i += 2
          if (e === 110) out[o++] = 10; else if (e === 114) out[o++] = 13; else if (e === 116) out[o++] = 9; else if (e === 98) out[o++] = 8; else if (e === 102) out[o++] = 12
          else if (e === 40 || e === 41 || e === 92) out[o++] = e
          else if (e >= 48 && e <= 55) { let v = e - 48; for (let k = 0; k < 2 && b[i] >= 48 && b[i] <= 55; k++, i++) v = v * 8 + b[i] - 48; out[o++] = v & 255 }
          else if (e === 13) { if (b[i] === 10) i++ } else if (e === 10) { /* a line continued */ } else if (e !== undefined) out[o++] = e
          continue
        }
        if (d === 40) depth++
        if (d === 41) { depth--; if (depth === 0) { i++; break } }
        if (d === 13) { out[o++] = 10; i++; if (b[i] === 10) i++; continue }
        out[o++] = d
        i++
      }
      if (start < 0) start = s0
      const v = { t: 'str', b: out.subarray(0, o), s: s0, e: i }
      if (marks.length) marks.at(-1).items.push(v); else stack.push(v)
      continue
    }
    if (c === 60 && b[i + 1] !== 60) {
      // (its digits straight into bytes, as PDF.js reads them: white space and a character not a digit passed over, an
      // odd last digit its byte's high half)
      let j = i + 1, digits = 0
      while (j < n && b[j] !== 62) { if (DIGIT[b[j]] >= 0) digits++; j++ }
      take(COST.str + ((digits + 1) >> 1))
      const out = new Uint8Array((digits + 1) >> 1)
      let k = 0
      for (let q = i + 1; q < j; q++) { const h = DIGIT[b[q]]; if (h < 0) continue; if (k % 2 === 0) out[k >> 1] = h << 4; else out[k >> 1] |= h; k++ }
      i = j + 1
      if (start < 0) start = s0
      const v = { t: 'str', b: out, s: s0, e: i, hex: true }
      if (marks.length) marks.at(-1).items.push(v); else stack.push(v)
      continue
    }
    if (c === 60) { i += 2; take(COST.mark); if (start < 0) start = s0; marks.push({ items: [], s: s0 }); continue }
    if (c === 62 && b[i + 1] === 62) { i += 2; const m = marks.pop(); if (!m) take(COST.mark); const v = { t: 'dict', v: m ? m.items : [] }; if (marks.length) marks.at(-1).items.push(v); else stack.push(v); continue }
    if (c === 91) { i++; take(COST.mark); if (start < 0) start = s0; marks.push({ items: [], s: s0 }); continue }
    if (c === 93) { i++; const m = marks.pop(); if (!m) take(COST.mark); const v = m ? m.items : []; if (marks.length) marks.at(-1).items.push(v); else stack.push(v); continue }
    if (c === 47) {
      const j = tokenEnd(i + 1)
      take(COST.name + (j - i))
      const raw = wordAt(b, i + 1, j)
      i = j
      if (start < 0) start = s0
      const v = { t: 'name', v: raw.includes('#') ? raw.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : raw }
      if (marks.length) marks.at(-1).items.push(v); else stack.push(v)
      continue
    }
    if (c === 123 || c === 125) { i++; continue }
    const j = tokenEnd(i)
    if (j === i) { i++; continue }
    // (a token too long for any operator or number is an unknown one: not read whole; a number read from its bytes, no string
    // made of it)
    let t = '?'
    if (j - i <= TOKEN_MAX) {
      const v = numberAt(b, i, j)
      if (v !== undefined) { i = j; push(v, s0, COST.num); continue }
      t = wordAt(b, i, j)
    }
    i = j
    if (t === 'true' || t === 'false' || t === 'null') { push(t === 'true' ? true : t === 'false' ? false : null, s0, COST.atom); continue }
    if (marks.length) { take(COST.kw); marks.at(-1).items.push({ t: 'kw', v: t }); continue }
    if (t === 'BI') {
      // an inline image: its parameters to ID, its data to EI (white space either side, then an operator or the end)
      const s = start < 0 ? s0 : start
      // (each pass advances or throws: a comment skipped as anywhere else, 2026-10-07, where a `%` there held the loop on
      // its byte for ever; a delimiter no parameter starts with refused)
      while (i < n) {
        while (i < n && WS[b[i]]) i++
        if (i >= n) break
        if (b[i] === 73 && b[i + 1] === 68 && (WS[b[i + 2]] || i + 2 >= n)) { i += 3; break }
        if (b[i] === 37) { while (i < n && b[i] !== 10 && b[i] !== 13) i++; continue }
        if (b[i] === 47) { i++; while (i < n && !WS[b[i]] && !DL[b[i]]) i++; continue }
        if (b[i] === 40) { let d = 0; do { if (b[i] === 92) i++; else if (b[i] === 40) d++; else if (b[i] === 41) d--; i++ } while (i < n && d > 0); continue }
        if (b[i] === 91 || b[i] === 93 || b[i] === 60 || b[i] === 62) { i++; continue }
        if (DL[b[i]]) throw new Error(`an inline image's parameters hold "${String.fromCharCode(b[i])}" at ${i}`)
        while (i < n && !WS[b[i]] && !DL[b[i]]) i++
      }
      let e = i
      while (e < n) {
        if (b[e] === 69 && b[e + 1] === 73 && WS[b[e - 1]] && (e + 2 >= n || WS[b[e + 2]] || DL[b[e + 2]])) break
        e++
      }
      i = Math.min(n, e + 2)
      stack = []; pending = 0
      operator('BI', s, i)
      continue
    }
    operator(t, start < 0 ? s0 : start, i)
  }
  ops.bytes = held
  return ops
}
/** lex's refusal of a stream that holds more than it was allowed: the walk refuses its page */
export class LexLimit extends Error { constructor(limit) { super(`a content stream holding more than ${limit} bytes`); this.limit = limit } }
/** decode's refusal of a stream that decodes to more than it was allowed: the walk refuses its page */
export class DecodeLimit extends Error { constructor(limit) { super(`a stream decoding to more than ${limit} bytes`); this.limit = limit } }
/** a decoding stream's bytes, read a chunk at a time and no further than `limit` past (DecodeLimit), as bytes of their own: the
 *  stream's buffer grows by CHUNK and doubles past it, and its view would hold it all (a form of 2 KB held 128 KB), which the
 *  decoded streams' cache, bounded by the bytes it holds, kept for every stream it held: 2610.21924's page 9, 3,128 forms of a
 *  plot's markers, held 960 MB in a wrap of our final pass, and the maker died of its memory */
const CHUNK = 1 << 16
export function readAtMost(stream, limit) {
  let total = 0
  for (;;) {
    const got = stream.getBytes(CHUNK)
    if (!got.length) break
    total += got.length
    if (total > limit) throw new DecodeLimit(limit)
  }
  if (!total) return new Uint8Array(0)
  stream.reset()
  const out = stream.getBytes(total)
  return out.byteOffset === 0 && out.byteLength === out.buffer.byteLength ? out : out.slice()
}

const PAINT = new Set(['S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'n'])
/** a form nested deeper than this is not walked: the page is refused */
const FORM_DEPTH = 12
/** a glyph name that names a code, not a character (a generator's own numbering): its Unicode is not read from it */
const CODE_NAME = /^(?:g|G|glyph|cid|index|c|C)\d+$/
/** the operators a page's walk may visit, its forms' as often as they are painted (openRemover's `walkMax`), of those it
 *  keeps (WALK_OPS): past it the page is refused. Forms that paint each other ten times over, eight deep, are 10^8
 *  paints; the heaviest of the 2,793 pages of the 124 papers in data/corpus visits 66,344 (2608.27728 page 15) */
export const WALK_MAX = 2_000_000
/** what a page's walk may hold, its streams each lexed once however often they are painted (openRemover's `heldMax` and
 *  `bytesMax`): its operators and their operands, and the events it records, by their heap (COST), and its streams'
 *  decoded bytes. Past either the page is refused, never the paper. A soft, early refusal: the hard bound on hostile
 *  input is the process the remover runs in (the module's head). The heaviest of the corpus's 2,793 pages holds 12.5 MB
 *  by COST (2608.12606 page 5; 2608.27728 page 15's 12.2 MB measured 8.2 MB of heap) and 34.8 MB decoded (2608.02055 page
 *  28): 64 MiB, and 48 MiB */
export const HELD_MAX = 64 * 1024 * 1024, BYTES_MAX = 48 * 1024 * 1024
/** the highest code a font's /W names: a CID font's two-byte codes (a range [0 4294967295 w] was read code by code) */
const CODE_MAX = 0xffff

/**
 * The remover over one document: arXiv's bytes, read by `PL` (@cantoo/pdf-lib's exports), `inflate` (bytes, limit -> bytes,
 * no more than limit + 1 of them, or a throw: Node's zlib.inflateSync with maxOutputLength, a browser's inflater stopped
 * there;
 * tolerant of a damaged zlib stream, as PDF.js reads one; null: none), `walkMax` (WALK_MAX), `heldMax` and `bytesMax`
 * (HELD_MAX, BYTES_MAX). Returns { numPages, encrypted, walkPage,
 * alignPage, decode }.
 */
export async function openRemover(bytes, { PL, inflate = null, walkMax = WALK_MAX, heldMax = HELD_MAX, bytesMax = BYTES_MAX }) {
  const { PDFDocument, PDFName, PDFRef, PDFArray, PDFDict, PDFRawStream, PDFNumber, PDFStream, decodePDFRawStream, ParseSpeeds } = PL
  // (parsed in one go: the object layer's default, ParseSpeeds.Slow, waits for a timer every 100 objects, a yield that keeps a
  // page's events going; the maker child that wraps our pages has none to keep, and only waited, 50 to 320 ms a paper on one core)
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false, parseSpeed: ParseSpeeds.Fastest })
  const ctx = doc.context
  const encrypted = !!ctx.trailerInfo.Encrypt
  const look = v => (v instanceof PDFRef ? ctx.lookup(v) : v)
  const get = (d, k) => { if (!(d instanceof PDFDict) && !(d instanceof PDFStream)) return undefined; const dict = d instanceof PDFStream ? d.dict : d; return look(dict.get(PDFName.of(k))) }
  const num = v => (v instanceof PDFNumber ? v.asNumber() : typeof v === 'number' ? v : undefined)
  const nameOf = v => (v instanceof PDFName ? v.decodeText?.() ?? v.asString().slice(1) : undefined)
  // (the decoded streams kept for the document, at most 4 bytesMax: past that a stream is decoded again when asked, so
  // that pages refused at their budget do not pile up)
  const decoded = new Map()
  let decodedBytes = 0
  /**
   * A stream's bytes, decoded no further than `limit` (DecodeLimit past it): its filters run by the object layer's
   * streams (PDF.js's DecodeStream, ported), read a chunk at a time, which decode only as far as asked, in Node and in a
   * browser's worker alike; a Flate stream they refuse that PDF.js reads, by the given `inflate` within the limit. A
   * Flate bomb of gigabytes is read to its limit and let go: the page it is on refused, never the paper
   */
  const decode = (st, limit = Infinity) => {
    if (decoded.has(st)) { const out = decoded.get(st); if (out.length > limit) throw new DecodeLimit(limit); return out }
    let out
    if (st instanceof PDFRawStream) {
      try { out = readAtMost(decodePDFRawStream(st), limit) } catch (e) {
        if (e instanceof DecodeLimit) throw e
        // a stream the object layer's inflater refuses (a damaged zlib header, a stream cut short) that PDF.js reads:
        // inflated tolerantly, as PDF.js does, where the filter is Flate alone
        const f = st.dict.get(PDFName.of('Filter'))?.toString()
        if (!inflate || (f !== '/FlateDecode' && f !== '[ /FlateDecode ]' && f !== '[/FlateDecode]')) throw e
        out = inflate(st.contents, limit)
        if (out.length > limit) throw new DecodeLimit(limit)
      }
    } else {
      out = st.getContents()
      if (out.length > limit) throw new DecodeLimit(limit)
    }
    // (counted by what it holds: the buffer its view keeps, not the view's length)
    if ((decodedBytes += out.buffer.byteLength) <= 4 * bytesMax) decoded.set(st, out)
    return out
  }
  const pages = doc.getPages()

  // ---- fonts: how a string splits into codes, and each code's width
  const fontCache = new Map()
  function fontInfo(key, dict) {
    if (fontCache.has(key)) return fontCache.get(key)
    const sub = nameOf(get(dict, 'Subtype'))
    const info = { sub, type3: sub === 'Type3', bytes: 1, ranges: null, width: null, vertical: false, refused: null }
    if (sub === 'Type0') {
      const encv = get(dict, 'Encoding')
      const en = nameOf(encv)
      const desc = look(get(dict, 'DescendantFonts')?.get?.(0))
      if (en === 'Identity-H' || en === 'Identity-V') { info.bytes = 2; info.vertical = en === 'Identity-V' }
      else if (encv instanceof PDFStream) {
        let txt = ''
        try { txt = td.decode(decode(encv, bytesMax)) } catch (e) { if (!(e instanceof DecodeLimit)) throw e }
        // (each codespace from its opening to the next close, in one pass: the lazy pattern ran to the text's end from
        // every opening with no close after it, the square of their count, 22 s for a 13.6 KB CMap of 120,000)
        const ranges = []
        for (let at = 0; ;) {
          const open = txt.indexOf('begincodespacerange', at)
          if (open < 0) break
          const close = txt.indexOf('endcodespacerange', open)
          if (close < 0) break
          for (const r of txt.slice(open + 19, close).matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) ranges.push([r[1].length / 2, parseInt(r[1], 16), parseInt(r[2], 16)])
          at = close + 17
        }
        if (ranges.length) info.ranges = ranges; else info.refused = 'a CMap without a codespace'
        if (/\/WMode\s+1/.test(txt)) info.vertical = true
      } else info.refused = `the CMap ${en ?? '(none)'}`
      if (desc && en === 'Identity-H') {
        const dw = num(get(desc, 'DW')) ?? 1000
        const W = get(desc, 'W')
        // (a two-byte code's width by its place: a range is one fill, so that /W costs what its numbers are, not what its
        // ranges span; 20,000 ranges of every code took 22 s as a Map, code by code, against PDF.js's 1.5 s. Read as
        // PDF.js reads it (evaluator's /W): a first code not an integer, or a range's last, ends it; a width not a
        // number is passed over, the code keeping what it had. The array as wide as the codes /W names, as PDF.js's,
        // and none for a font without /W: a fixed array of every code was 512 KB a font, outside the heap, kept for
        // the document, the re-review's 3,000 fonts 1.5 GB)
        const entries = []
        let top = -1
        if (W instanceof PDFArray) {
          const a = W.asArray().map(look)
          for (let k = 0; k < a.length;) {
            const start = num(a[k])
            if (!Number.isInteger(start)) break
            if (a[k + 1] instanceof PDFArray) {
              const ws = a[k + 1].asArray().map(w => num(look(w)))
              entries.push([start, ws])
              top = Math.max(top, Math.min(start + ws.length - 1, CODE_MAX))
              k += 2
            } else {
              const end = num(a[k + 1]), w = num(a[k + 2])
              if (!Number.isInteger(end)) break
              k += 3
              if (typeof w !== 'number') continue
              entries.push([start, end, w])
              if (end >= start) top = Math.max(top, Math.min(end, CODE_MAX))
            }
          }
        }
        const widths = top >= 0 ? new Float64Array(top + 1).fill(Number.NaN) : null
        for (const e of widths ? entries : []) {
          if (e.length === 2) e[1].forEach((v, j) => { const c = e[0] + j; if (typeof v === 'number' && c >= 0 && c <= top) widths[c] = v })
          else { const first = Math.max(0, e[0]), last = Math.min(e[1], top); if (last >= first) widths.fill(e[2], first, last + 1) }
        }
        info.width = code => { const w = widths && code >= 0 && code < widths.length ? widths[code] : Number.NaN; return (Number.isNaN(w) ? dw : w) / 1000 }
      }
    } else {
      const first = num(get(dict, 'FirstChar'))
      const W = get(dict, 'Widths')
      const fd = get(dict, 'FontDescriptor')
      const missing = num(get(fd, 'MissingWidth')) ?? 0
      // a Type 3 glyph's advance as PDF.js draws it (canvas showType3Text): its width through the font matrix, [w 0]
      // transformed, its x: w * a + e, the matrix's translation in it (2026-10-07: w * a alone moved the glyphs after a
      // removed one by e * size). A matrix of other than six numbers gives no width: an edit in the font is refused
      let fm = [0.001, 0, 0, 0.001, 0, 0]
      if (info.type3) { const m = get(dict, 'FontMatrix'); if (m instanceof PDFArray) { const v = m.asArray().map(x => num(look(x))); fm = v.length === 6 && v.every(Number.isFinite) ? v : null } }
      if (W instanceof PDFArray && first !== undefined && fm) {
        const ws = W.asArray().map(v => num(look(v)))
        info.width = code => { const w = code >= first && code < first + ws.length ? ws[code - first] : missing; return info.type3 ? w * fm[0] + fm[4] : w / 1000 }
      }
    }
    info.unicode = unicodeOf(sub, dict)
    fontCache.set(key, info)
    return info
  }
  /**
   * Whether a font's codes have a Unicode a reader can trust (layout/figure-text.mjs: a figure's text in a font with none is
   * left the original's, counted): a /ToUnicode; else a simple font whose encoding names its glyphs (a standard encoding, a
   * /Differences whose every name is a glyph's name, not a code's — `g12`, `cid12`, `glyph12`, `index12`, `c12` —, or a Type 1
   * font's own encoding, which names its glyphs); else a composite font of a CMap that is no identity. A symbolic TrueType or a
   * Type 3 font with neither, and an Identity CMap with no /ToUnicode, give a code, not a character
   */
  function unicodeOf(sub, dict) {
    if (get(dict, 'ToUnicode') instanceof PDFStream) return true
    const en = get(dict, 'Encoding')
    if (sub === 'Type0') { const n = nameOf(en); return typeof n === 'string' && !/^Identity-[HV]$/.test(n) }
    if (en instanceof PDFName) return /^(?:WinAnsi|MacRoman|MacExpert|Standard)Encoding$/.test(nameOf(en) ?? '')
    if (en instanceof PDFDict) {
      const d = look(en.get(PDFName.of('Differences')))
      const names = d instanceof PDFArray ? d.asArray().map(look).filter(v => v instanceof PDFName).map(nameOf) : []
      return !names.some(n => typeof n !== 'string' || CODE_NAME.test(n))
    }
    return sub === 'Type1' || sub === 'MMType1'
  }
  const codesOf = (info, b) => {
    const out = []
    if (info.ranges) {
      for (let i = 0; i < b.length;) {
        let done = false
        for (let len = 1; len <= 4 && !done; len++) {
          if (i + len > b.length) break
          let v = 0
          for (let k = 0; k < len; k++) v = v * 256 + b[i + k]
          if (info.ranges.some(([l, lo, hi]) => l === len && v >= lo && v <= hi)) { out.push([i, i + len, v]); i += len; done = true }
        }
        // as PDF.js: one byte where no range matches
        if (!done) { out.push([i, i + 1, b[i]]); i++ }
      }
      return out
    }
    for (let i = 0; i + info.bytes <= b.length; i += info.bytes) { let v = 0; for (let k = 0; k < info.bytes; k++) v = v * 256 + b[i + k]; out.push([i, i + info.bytes, v]) }
    return out
  }

  const WALKED = 'forms that paint more than the walk allows', SELF = 'a form that paints itself', HELD = 'streams that hold more than the walk allows', DECODED = 'streams that decode to more than the walk allows'
  /**
   * A page walked: its containers (the page's content, each form where it is painted: { kind, key, ref, st, pieces,
   * ops, parent, name, res, depth }) and its events in order ({ kind: 'show' | 'paint' | 'image' | 'form', cont, pi, oi,
   * codes, state, child }), with how many times each form is painted on it (`uses`, by its object) and what could not be
   * walked (`problems`).
   */
  function walkPage(pageIndex) {
    const page = pages[pageIndex]
    const node = page.node
    const res = node.Resources()
    const raw = node.get(PDFName.of('Contents'))
    const contents = look(raw)
    const pieces = []
    if (contents instanceof PDFArray) for (const r of contents.asArray()) pieces.push({ ref: r instanceof PDFRef ? r : null, st: look(r) })
    else if (contents) pieces.push({ ref: raw instanceof PDFRef ? raw : null, st: contents })
    const events = [], containers = [], uses = new Map(), problems = []
    // (bounded: no deeper than FORM_DEPTH, no form within itself, as PDF.js ignores a circular one, and no more than
    // walkMax operators in all; each stops the walk and refuses the page)
    let walked = 0
    // each stream's operators once, however often the page or its forms paint it (read only: an edit in a form painted
    // more than once is refused), within heldMax tokens and bytesMax decoded bytes for the page
    const lexed = new Map()
    let held = 0, bytesHeld = 0
    const opsOf = st => {
      let got = lexed.get(st)
      if (got) return got
      try {
        const b = decode(st, bytesMax - bytesHeld)
        bytesHeld += b.length
        const ops = lex(b, heldMax - held, WALK_OPS)
        held += ops.bytes
        got = { ops }
      } catch (e) { got = e instanceof LexLimit ? { refused: HELD } : e instanceof DecodeLimit ? { refused: DECODED } : { failed: true } }
      if (got.refused && !problems.includes(got.refused)) problems.push(got.refused)
      lexed.set(st, got)
      return got
    }
    // (each event the walk records counts in what it holds: an event per visit of a painting operator, a show or a
    // form, which the re-review's round 2 fanned out to 20 million fontless shows of a 980 B page)
    const record = cost => {
      if ((held += cost) <= heldMax) return true
      if (!problems.includes(HELD)) problems.push(HELD)
      return false
    }
    function run(cont, res, state, depth) {
      if (depth > FORM_DEPTH) { problems.push('forms nested too deep'); return }
      const stack = []
      let s = { ...state }
      for (let pi = 0; pi < cont.pieces.length; pi++) {
        const ops = cont.ops[pi]
        if ((walked += ops.length) > walkMax) { if (!problems.includes(WALKED)) problems.push(WALKED); return }
        for (let oi = 0; oi < ops.length; oi++) {
          const o = ops[oi], a = o.args
          switch (o.op) {
            case 'q': stack.push({ ...s }); break
            case 'Q': if (stack.length) s = stack.pop(); break
            case 'Tf': {
              const fr = get(res, 'Font')?.get?.(PDFName.of(a[0]?.v))
              const fd = look(fr)
              s.font = fd ? fontInfo(fr instanceof PDFRef ? fr.toString() : fd, fd) : null
              s.size = typeof a[1] === 'number' ? a[1] : 0
              break
            }
            case 'Tc': s.Tc = typeof a[0] === 'number' ? a[0] : 0; break
            case 'Tw': s.Tw = typeof a[0] === 'number' ? a[0] : 0; break
            case 'Tr': s.Tr = typeof a[0] === 'number' ? a[0] : 0; break
            case 'gs': {
              const g = look(get(res, 'ExtGState')?.get?.(PDFName.of(a[0]?.v)))
              const f = get(g, 'Font')
              if (f instanceof PDFArray) { const fr = f.get(0); s.font = fontInfo(fr instanceof PDFRef ? fr.toString() : look(fr), look(fr)); s.size = num(look(f.get(1))) ?? 0 }
              break
            }
            case 'Do': {
              const xr = get(res, 'XObject')?.get?.(PDFName.of(a[0]?.v))
              const x = look(xr)
              if (x instanceof PDFStream && nameOf(get(x, 'Subtype')) === 'Form') {
                let within = false
                for (let c = cont; c && !within; c = c.parent) within = c.st === x
                if (within) { if (!problems.includes(SELF)) problems.push(SELF); break }
                if (problems.includes(WALKED) || problems.includes(HELD) || problems.includes(DECODED)) return
                uses.set(x, (uses.get(x) ?? 0) + 1)
                const own = get(x, 'Resources')
                const got = opsOf(x)
                if (got.refused) return
                if (got.failed) problems.push('a form that does not decode')
                const ops = got.ops ?? []
                const fc = { kind: 'form', key: xr instanceof PDFRef ? xr.toString() : `direct${containers.length}`, ref: xr instanceof PDFRef ? xr : null, st: x, pieces: [{ ref: xr instanceof PDFRef ? xr : null, st: x }], ops: [ops], parent: cont, name: a[0]?.v, res: own ?? res, ownRes: !!own, depth: depth + 1 }
                if (!record(COST.event + COST.op)) return
                containers.push(fc)
                events.push({ kind: 'form', cont, pi, oi, child: fc })
                stack.push({ ...s })
                run(fc, own ?? res, s, depth + 1)
                s = stack.pop()
              } else {
                if (!record(COST.event)) return
                events.push({ kind: 'image', cont, pi, oi })
              }
              break
            }
            case 'Tj': case 'TJ': case "'": case '"': {
              if (o.op === '"') { s.Tw = typeof a[0] === 'number' ? a[0] : 0; s.Tc = typeof a[1] === 'number' ? a[1] : 0 }
              const arr = o.op === 'TJ' ? a[0] : [a[o.op === '"' ? 2 : 0]]
              // (a show with no font set is PDF.js's to drop, and the walk's: no event, nothing to align or edit)
              if (!s.font) break
              const codes = []
              ;(Array.isArray(arr) ? arr : []).forEach((el, ei) => { if (el?.t === 'str') for (const [cs, ce, v] of codesOf(s.font, el.b)) codes.push({ ei, cs, ce, v }) })
              if (!record(COST.event + COST.code * codes.length)) return
              events.push({ kind: 'show', cont, pi, oi, codes, state: { ...s } })
              break
            }
            default:
              if (!PAINT.has(o.op) && o.op !== 'BI' && o.op !== 'sh') break
              if (!record(COST.event)) return
              events.push({ kind: PAINT.has(o.op) ? 'paint' : 'image', cont, pi, oi })
          }
        }
      }
    }
    const pc = { kind: 'page', key: `page${pageIndex + 1}`, ref: null, st: null, pieces, ops: [], parent: null, name: null, res, ownRes: true, depth: 0 }
    for (const p of pieces) {
      const got = p.st ? opsOf(p.st) : { ops: [] }
      if (got.failed) problems.push('a content stream that does not decode')
      pc.ops.push(got.ops ?? [])
    }
    containers.unshift(pc)
    if (!problems.includes(HELD) && !problems.includes(DECODED)) run(pc, res, { font: null, size: 0, Tc: 0, Tw: 0, Tr: 0 }, 0)
    return { page, node, pc, containers, events, uses, problems, walked, held, bytes: bytesHeld }
  }

  /**
   * One page against PDF.js's reading of it: `facts` (alignOf's, what the reading shows and paints), or PDF.js's
   * operator list itself (alignPage(i, OPS, opList), read by alignOf here). Returns { ok, why, walk, shows (the walk's
   * text-showing events by n), paints (its painting operators by m, null where they do not align) }. The n-th show of the
   * reading must be the n-th showing operator of the walk with as many glyphs, their character codes the same (a glyph
   * with no code compared with none); an annotation's own appearance is not the page's. Any difference refuses the page
   * (`why`): nothing on it is removed
   */
  function alignPage(pageIndex, facts, opList) {
    if (opList !== undefined) facts = alignOf(facts, opList)
    const walk = walkPage(pageIndex)
    const why = [...walk.problems]
    if (encrypted) why.push('an encrypted file')
    const shows = walk.events.filter(e => e.kind === 'show'), paints = walk.events.filter(e => e.kind === 'paint')
    const listed = facts.codes
    if (listed.length !== shows.length) why.push(`${shows.length} showing operators walked, ${listed.length} listed`)
    for (let n = 0; n < Math.min(listed.length, shows.length) && why.length < 4; n++) {
      const e = shows[n]
      if (e.state.font.refused) { why.push(`show ${n}: ${e.state.font.refused}`); continue }
      const gl = listed[n]
      if (gl.length !== e.codes.length) { why.push(`show ${n}: ${e.codes.length} codes, ${gl.length} glyphs`); continue }
      for (let k = 0; k < gl.length; k++) if (gl[k] !== null && gl[k] !== e.codes[k].v) { why.push(`show ${n}: codes differ`); break }
    }
    return { ok: why.length === 0, why, walk, shows, paints: facts.paths === paints.length ? paints : null }
  }

  /** what the remover keeps between pages let go: the decoded streams and the fonts read (a remover kept for a paper's
   *  asks holds the object layer's parse alone between them) */
  const release = () => { decoded.clear(); decodedBytes = 0; fontCache.clear() }

  return { doc, ctx, PL, numPages: pages.length, encrypted, walkPage, alignPage, decode, look, get, nameOf, release }
}

/**
 * What alignPage reads of PDF.js's operator list of a page (OPS, opList), its alignment facts: `codes`, for each
 * text-showing operation (showText, showSpacedText) outside an annotation's appearance, in order, its glyph objects'
 * character codes (`originalCharCode`; null for a glyph with none, which is not compared; -1 for one that is not a code,
 * which no code equals); `paths`, the number of constructPath operations outside an annotation and a soft mask's group. The facts are what a
 * remover with no PDF.js aligns a page by: the page is aligned by them exactly as by the list. Pure
 */
export function alignOf(OPS, opList) {
  const { fnArray, argsArray } = opList
  const codes = []
  let paths = 0, inAnnot = 0, inMask = 0
  // (a soft mask's group: PDF.js lists the content of an ExtGState's /SMask in a group of its own, which no content stream
  // the walk reads paints: not the page's, as an annotation's appearance is not; 2610.19159v1 p3)
  const groups = []
  for (let j = 0; j < fnArray.length; j++) {
    const fn = fnArray[j]
    if (fn === OPS.beginAnnotation) inAnnot++
    else if (fn === OPS.endAnnotation) inAnnot = Math.max(0, inAnnot - 1)
    else if (fn === OPS.beginGroup) { const m = !!argsArray[j]?.[0]?.smask; groups.push(m); if (m) inMask++ }
    else if (fn === OPS.endGroup) { if (groups.pop()) inMask-- }
    else if (inAnnot || inMask) continue
    else if (fn === OPS.showText || fn === OPS.showSpacedText) {
      const gl = (argsArray[j]?.[0] ?? []).filter(g => g && typeof g === 'object')
      const row = new Array(gl.length)
      for (let k = 0; k < gl.length; k++) {
        const c = gl[k].originalCharCode
        // (a code is a whole number below 2^32, as the walk splits a string; anything else is compared and never equal)
        row[k] = c === undefined ? null : Number.isInteger(c) && c >= 0 && c < CODE_LIMIT ? c : -1
      }
      codes.push(row)
    } else if (fn === OPS.constructPath) paths++
  }
  return { codes, paths }
}
/** a character code is below this (four bytes at most, as codesOf reads one) */
const CODE_LIMIT = 2 ** 32
