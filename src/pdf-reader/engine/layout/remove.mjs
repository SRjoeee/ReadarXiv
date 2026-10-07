// The text-removed PDF (Plan 8b, the instant layer's text removal; the feasibility spike of 2026-10-06/07,
// pdf-remove-report.md): arXiv's PDF with chosen glyphs and rules taken out of its content streams, written as an
// incremental update, so that arXiv's file is a byte-for-byte prefix of the result and every other operator and byte
// stays as it was. The update appends page sets after arXiv's own N pages, each page p of a set at a fixed place (or,
// `compact`, only the pages it removes, each where the manifest's page entry names it, `at`):
//   R, at N + p: the translatable units' glyphs (and their inline placeholders' rules) removed, a display formula and
//      everything else kept: what the layer shows under a drawn unit's translation where kept ink lies under its
//      rectangles (the reader's add-on holds those pages alone, compact: elsewhere it fills them with paper);
// and, for a check only (the gate), P (the placeholders alone, every other glyph, rule, image and form left out), F (the
// removed glyphs alone: their footprint) and C (P with each crop's glyphs in a colour of its own). The layer cuts its
// crops from the original, each through its own glyphs' outline boxes, so that no reader needs P. One PDF.js document
// then serves the original and every set, its fonts parsed once.
//
// A glyph is named by where the content stream shows it, as PDF.js's operator list does (layout/ink.mjs pageInk's
// `indices`): its text-showing operation's place among the page's own (n) and its place among that operation's glyphs
// (k); a rule by its painted path's place (m). The page's content streams, and every form XObject where it is painted,
// are walked: the text state followed, each string split into its character codes by its font, and the walk aligned with
// PDF.js's own reading (the n-th text-showing operation of the list is the n-th of the walk, its k-th glyph the k-th code,
// the character codes compared; the m-th painted path the m-th painting operator). A page that does not align is refused
// whole: nothing on it is removed, and the layer draws its units the old way.
//
// A removed code becomes a TJ number of its exact advance, -(1000 w0 + 1000 (Tc + Tw') / Tfs), so that nothing after it
// moves; the width is the font's (/Widths, /W and /DW, a Type 3 font's /Widths through its /FontMatrix, its translation
// too, as PDF.js advances). A font that gives none (an embedded CMap's) shows the codes in render mode 3, which advances
// as painting does. A removed rule's painting operator becomes `n`: the path ends unpainted, a clip it sets kept.
// Refused, never mishandled: an edit inside a form the page paints more than once, a clipping text mode, a vertical
// font, a CMap that is neither Identity nor embedded, a Type 3 font without widths or with a font matrix of other than
// six numbers. A form that is edited is copied for the appended page (copy on write), with every form between it and the
// page, so that the original page draws as it did.
//
// An original module (no port statement). It imports nothing but the engine's own reading of a page's ink (checkPage's):
// the PDF object layer (@cantoo/pdf-lib, MIT), deflate and a tolerant inflate are given. It runs where the layout file is
// made, once a paper.

/** the remover's version: raised with any change to what it writes; it enters the add-on's key (2: compact sets; 3: a
 *  Type 3 glyph's removed advance with its font matrix's translation, an unusable matrix refused) */
export const REMOVAL = '3'
/** the page sets an add-on holds, in order after arXiv's own pages: R at N + p, then the check's (P, F, C) */
export const SETS = Object.freeze(['R'])
export const CHECK_SETS = Object.freeze(['P', 'F', 'C'])

const WS = new Uint8Array(256)
for (const c of [0, 9, 10, 12, 13, 32]) WS[c] = 1
const DL = new Uint8Array(256)
for (const c of '()<>[]{}/%') DL[c.charCodeAt(0)] = 1
const isNumTok = t => /^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)
/** a hex digit's value by its byte, -1 for any other */
const DIGIT = new Int8Array(256).fill(-1)
for (let c = 0; c < 10; c++) DIGIT[48 + c] = c
for (let c = 0; c < 6; c++) { DIGIT[65 + c] = 10 + c; DIGIT[97 + c] = 10 + c }
const td = new TextDecoder('latin1')
/** bytes as the characters of their codes (ISO 8859-1, which TextDecoder's 'latin1', windows-1252, is not) */
const latin1 = u8 => { let out = ''; for (let k = 0; k < u8.length; k += 8192) out += String.fromCharCode.apply(null, u8.subarray(k, k + 8192)); return out }
const enc = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b }

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
      const raw = latin1(b.subarray(i + 1, j))
      i = j
      if (start < 0) start = s0
      const v = { t: 'name', v: raw.includes('#') ? raw.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : raw }
      if (marks.length) marks.at(-1).items.push(v); else stack.push(v)
      continue
    }
    if (c === 123 || c === 125) { i++; continue }
    const j = tokenEnd(i)
    if (j === i) { i++; continue }
    // (a token too long for any operator or number is an unknown one: not read whole)
    const t = j - i > TOKEN_MAX ? '?' : latin1(b.subarray(i, j))
    i = j
    if (t !== '?' && isNumTok(t)) { push(Number(t), s0, COST.num); continue }
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

const PAINT = new Set(['S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'n'])
/** a form nested deeper than this is not walked: the page is refused */
const FORM_DEPTH = 12
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
const fmt = x => { if (Math.abs(x) < 5e-7) return '0'; let s = x.toFixed(6); s = s.replace(/0+$/, '').replace(/\.$/, ''); return s === '-0' ? '0' : s }
const HEX = Array.from({ length: 256 }, (_, v) => v.toString(16).padStart(2, '0'))
const hex = b => { let s = '<'; for (let i = 0; i < b.length; i++) s += HEX[b[i]]; return `${s}>` }
const concat = parts => { let n = 0; for (const p of parts) n += p.length; const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out }

/**
 * The remover over one document: arXiv's bytes, read by `PL` (@cantoo/pdf-lib's exports), `inflate` (bytes -> bytes,
 * tolerant of a damaged zlib stream, as PDF.js reads one; null: none), `walkMax` (WALK_MAX), `heldMax` and `bytesMax`
 * (HELD_MAX, BYTES_MAX). Returns { numPages, encrypted, walkPage,
 * alignPage, decode }.
 */
export async function openRemover(bytes, { PL, inflate = null, walkMax = WALK_MAX, heldMax = HELD_MAX, bytesMax = BYTES_MAX }) {
  const { PDFDocument, PDFName, PDFRef, PDFArray, PDFDict, PDFRawStream, PDFNumber, PDFStream, decodePDFRawStream } = PL
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false })
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
  const decode = st => {
    if (decoded.has(st)) return decoded.get(st)
    let out
    if (st instanceof PDFRawStream) {
      try { out = decodePDFRawStream(st).decode() } catch (e) {
        // a stream the object layer's inflater refuses (a damaged zlib header, a stream cut short) that PDF.js reads:
        // inflated tolerantly, as PDF.js does, where the filter is Flate alone
        const f = st.dict.get(PDFName.of('Filter'))?.toString()
        if (!inflate || (f !== '/FlateDecode' && f !== '[ /FlateDecode ]' && f !== '[/FlateDecode]')) throw e
        out = inflate(st.contents)
      }
    } else out = st.getContents()
    if ((decodedBytes += out.length) <= 4 * bytesMax) decoded.set(st, out)
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
        const txt = td.decode(decode(encv))
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
    fontCache.set(key, info)
    return info
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

  const WALKED = 'forms that paint more than the walk allows', SELF = 'a form that paints itself', HELD = 'streams that hold more than the walk allows'
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
        const b = decode(st)
        if ((bytesHeld += b.length) > bytesMax) got = { refused: true }
        else { const ops = lex(b, heldMax - held, WALK_OPS); held += ops.bytes; got = { ops } }
      } catch (e) { got = e instanceof LexLimit ? { refused: true } : { failed: true } }
      if (got.refused && !problems.includes(HELD)) problems.push(HELD)
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
                if (problems.includes(WALKED) || problems.includes(HELD)) return
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
    if (!problems.includes(HELD)) run(pc, res, { font: null, size: 0, Tc: 0, Tw: 0, Tr: 0 }, 0)
    return { page, node, pc, containers, events, uses, problems, walked, held, bytes: bytesHeld }
  }

  /**
   * One page against PDF.js's operator list of it (OPS, opList): { ok, why, walk, shows (the walk's text-showing events
   * by n), paints (its painting operators by m, null where they do not align) }. The n-th showText of the list must be
   * the n-th showing operator of the walk with as many glyphs, their character codes the same; an annotation's own
   * appearance is not the page's.
   */
  function alignPage(pageIndex, OPS, opList) {
    const walk = walkPage(pageIndex)
    const why = [...walk.problems]
    if (encrypted) why.push('an encrypted file')
    const shows = walk.events.filter(e => e.kind === 'show'), paints = walk.events.filter(e => e.kind === 'paint')
    const { fnArray, argsArray } = opList
    const listShows = [], listPaths = []
    let inAnnot = 0
    for (let j = 0; j < fnArray.length; j++) {
      const fn = fnArray[j]
      if (fn === OPS.beginAnnotation) inAnnot++
      else if (fn === OPS.endAnnotation) inAnnot = Math.max(0, inAnnot - 1)
      else if (inAnnot) continue
      else if (fn === OPS.showText || fn === OPS.showSpacedText) listShows.push(j)
      else if (fn === OPS.constructPath) listPaths.push(j)
    }
    if (listShows.length !== shows.length) why.push(`${shows.length} showing operators walked, ${listShows.length} listed`)
    for (let n = 0; n < Math.min(listShows.length, shows.length) && why.length < 4; n++) {
      const e = shows[n]
      if (e.state.font.refused) { why.push(`show ${n}: ${e.state.font.refused}`); continue }
      const gl = (argsArray[listShows[n]]?.[0] ?? []).filter(g => g && typeof g === 'object')
      if (gl.length !== e.codes.length) { why.push(`show ${n}: ${e.codes.length} codes, ${gl.length} glyphs`); continue }
      for (let k = 0; k < gl.length; k++) if (gl[k].originalCharCode !== undefined && gl[k].originalCharCode !== e.codes[k].v) { why.push(`show ${n}: codes differ`); break }
    }
    return { ok: why.length === 0, why, walk, shows, paints: listPaths.length === paints.length ? paints : null }
  }

  return { doc, ctx, PL, numPages: pages.length, encrypted, walkPage, alignPage, decode, look, get, nameOf }
}

/** a palette for the check's coloured set C: neighbours apart */
const PALETTE = [[255, 0, 0], [0, 160, 0], [0, 0, 255], [0, 200, 200], [200, 0, 200], [200, 200, 0]]

/**
 * A container's edits for one set: `codes` Map(show event -> Set of code indices to take out), `paints` Set(event)
 * to leave unpainted, `drop` [events] (an image, a form) to leave out, `colourOf(event, k)` (the check's set C): the
 * colour a kept code is shown in. Returns { edits: Map(container -> [{ pi, s, e, text }]), refused: [why], counts }.
 */
function editsOf(walk, { codes, paints, drop = [], colourOf = null, mode = 'cut' }) {
  const edits = new Map(), refused = [], counts = { cut: 0, hidden: 0, rules: 0, dropped: 0, ops: 0 }
  const edit = (cont, pi, s, e, text) => { (edits.get(cont) ?? edits.set(cont, []).get(cont)).push({ pi, s, e, text }) }
  const twice = cont => cont.kind === 'form' && (walk.uses.get(cont.st) ?? 0) > 1
  for (const [e, set] of codes) {
    if (!set.size && !colourOf) continue
    const o = e.cont.ops[e.pi][e.oi], s = e.state, f = s.font
    if (f.vertical) { refused.push('a vertical font'); continue }
    if (s.Tr >= 4) { refused.push('a clipping text mode'); continue }
    if (twice(e.cont)) { refused.push('a form painted more than once'); continue }
    let m = f.type3 ? 'cut' : mode
    const canCut = !!f.width && s.size !== 0
    if (m === 'cut' && !canCut) m = f.type3 ? null : 'hide'
    if (!m) { refused.push('a Type 3 font without widths'); continue }
    const arr = o.op === 'TJ' ? o.args[0] : [o.args[o.op === '"' ? 2 : 0]]
    const prefix = o.op === "'" ? 'T* ' : o.op === '"' ? `${fmt(o.args[0])} Tw ${fmt(o.args[1])} Tc T* ` : ''
    const items = []
    let ci = 0
    arr.forEach((el, ei) => {
      if (typeof el === 'number') { items.push({ num: el }); return }
      if (el?.t !== 'str') return
      while (ci < e.codes.length && e.codes[ci].ei === ei) { const c = e.codes[ci]; items.push({ code: c, k: ci, off: set.has(ci), b: el.b.subarray(c.cs, c.ce) }); ci++ }
    })
    let text = prefix
    if (m === 'cut') {
      const segs = [{ colour: null, out: [] }]
      let out = segs[0].out
      // (a run of kept codes collected, then joined once: joined code by code it cost the square of the string's length,
      // 172 s for 1.28 million codes, the review of round 3)
      const pushNum = v => { const l = out.at(-1); if (l && l.num !== undefined) l.num += v; else out.push({ num: v }) }
      const pushB = b => { const l = out.at(-1); if (l?.parts) l.parts.push(b); else out.push({ parts: [b] }) }
      for (const it of items) {
        if (it.num !== undefined) pushNum(it.num)
        else if (it.off) {
          const space = it.code.ce - it.code.cs === 1 && it.code.v === 32
          pushNum(-(1000 * f.width(it.code.v) + (1000 * (s.Tc + (space ? s.Tw : 0))) / s.size))
          counts.cut++
        } else {
          const c = colourOf ? colourOf(e, it.k) : null
          if (colourOf && c !== segs.at(-1).colour) { segs.push({ colour: c, out: [] }); out = segs.at(-1).out }
          pushB(it.b)
        }
      }
      text += segs.filter(g => g.out.length).map(g => `${g.colour ? `${g.colour} rg ${g.colour} RG ` : ''}[${g.out.map(x => (x.parts ? hex(concat(x.parts)) : fmt(x.num))).join(' ')}] TJ`).join(' ')
    } else {
      const chunks = []
      for (const it of items) {
        const hid = it.num !== undefined ? (chunks.at(-1)?.hid ?? false) : it.off
        if (!chunks.length || chunks.at(-1).hid !== hid) chunks.push({ hid, items: [] })
        chunks.at(-1).items.push(it)
        if (it.off) counts.hidden++
      }
      const body = c => {
        const out = []
        for (const it of c.items) { const l = out.at(-1); if (it.num !== undefined) { if (l && l.num !== undefined) l.num += it.num; else out.push({ num: it.num }) } else if (l?.parts) l.parts.push(it.b); else out.push({ parts: [it.b] }) }
        return `[${out.map(x => (x.parts ? hex(concat(x.parts)) : fmt(x.num))).join(' ')}] TJ`
      }
      text += chunks.map(c => (c.hid ? `3 Tr ${body(c)} ${fmt(s.Tr)} Tr` : body(c))).join(' ')
    }
    edit(e.cont, e.pi, o.s, o.e, text)
    counts.ops++
  }
  for (const e of paints) {
    const o = e.cont.ops[e.pi][e.oi]
    if (o.op === 'n') continue
    if (twice(e.cont)) { refused.push('a rule in a form painted more than once'); continue }
    edit(e.cont, e.pi, o.e - o.op.length, o.e, 'n')
    counts.rules++
  }
  for (const e of drop) {
    if (twice(e.cont)) { refused.push('an image in a form painted more than once'); continue }
    const o = e.cont.ops[e.pi][e.oi]
    edit(e.cont, e.pi, o.s, o.e, ' ')
    counts.dropped++
  }
  return { edits, refused, counts }
}

/** a stream's bytes with edits made ([{ s, e, text }]); the same edit twice is one */
function applyEdits(bytes, list) {
  list = list.slice().sort((a, b) => a.s - b.s || a.e - b.e)
  for (let i = list.length - 1; i > 0; i--) if (list[i].s === list[i - 1].s && list[i].e === list[i - 1].e && list[i].text === list[i - 1].text) list.splice(i, 1)
  const parts = []
  let at = 0
  for (const x of list) {
    if (x.s < at) throw new Error('overlapping edits')
    parts.push(bytes.subarray(at, x.s), enc(x.text))
    at = x.e
  }
  parts.push(bytes.subarray(at))
  return concat(parts)
}

/**
 * The add-on: arXiv's bytes with the sets appended as one incremental update. `R` is the remover (openRemover's);
 * `opListOf(p)` PDF.js's operator list of page p (1-based) of arXiv's PDF; `OPS` PDF.js's; `deflate` bytes -> zlib
 * bytes. `plan.pages[p]`: { units: [{ id, glyphs: [n, k, …], paths: [m, …] }], crops: [{ glyphs, paths }], shows?,
 * glyphs? } (shows and glyphs: the page's text-showing operations and its ink's glyphs as the planner read them, which
 * this reading must give too). `sets`: SETS, and CHECK_SETS for a check. `boxesOf(p, n, k)` and `pathBoxOf(p, m)`:
 * each glyph's and path's box on the page (the manifest's units), or null.
 * Returns { bytes, appended, manifest } where the manifest says, per page, whether it is removed (`ok`) or refused and
 * why, and each unit's removed boxes (x0, y0, x1, y1 stride 4, PDF units).
 */
export async function makeAddon({ R, bytes, OPS, opListOf, deflate, plan, sets = SETS, boxesOf = null, pathBoxOf = null, compact = false }) {
  const { PL, ctx, doc } = R
  const { PDFName, PDFRef, PDFDict, PDFRawStream } = PL
  const N = R.numPages
  const pagesOut = []
  const objects = [] // [ref, bytes]
  let next = ctx.largestObjectNumber + 1
  const alloc = () => PDFRef.of(next++, 0)
  const streamObj = (ref, dictText, data) => objects.push([ref, concat([enc(`${ref.objectNumber} ${ref.generationNumber} obj\n${dictText}\nstream\n`), data, enc('\nendstream\nendobj\n')])])
  const plainObj = (ref, text) => objects.push([ref, enc(`${ref.objectNumber} ${ref.generationNumber} obj\n${text}\nendobj\n`)])
  const dictText = entries => `<<${entries.map(([k, v]) => ` ${k} ${v}`).join('')} >>`
  // one empty content stream for every page of a set that shows nothing
  const empty = alloc()
  streamObj(empty, '<< /Length 0 >>', new Uint8Array(0))
  const manifest = { schema: 1, removal: REMOVAL, pages: N, sets: compact ? {} : Object.fromEntries(sets.map((s, i) => [s, (i + 1) * N])), page: {} }
  const stats = { removed: 0, rules: 0, cut: 0, hidden: 0, refused: 0, forms: 0, streams: 0 }
  const paletteOf = new Map()

  /**
   * The objects of page p in one set, given its walk and its edits: every edited container written anew and every
   * container between it and the page copied, each new form under its own object; returns the page's /Contents and
   * /Resources values as text
   */
  function writeSet(walk, edits) {
    // the containers that change: those edited, and every one above them
    const dirty = new Set()
    for (const c of edits.keys()) for (let x = c; x; x = x.parent) dirty.add(x)
    const newRef = new Map()
    const resText = c => {
      // the container's resources with each changed form it paints named by its copy
      const res = c.res instanceof PDFDict ? c.res : R.look(c.res)
      const kids = [...dirty].filter(x => x.parent === c)
      if (!kids.length || !(res instanceof PDFDict)) return res ? (c.res instanceof PDFRef ? c.res.toString() : res.toString()) : null
      const xo = R.look(res.get(PDFName.of('XObject')))
      const xEntries = xo instanceof PDFDict ? xo.entries().map(([k, v]) => { const kid = kids.find(x => x.name === k.decodeText?.() || `/${x.name}` === k.toString()); return [k.toString(), kid ? newRef.get(kid).toString() : v.toString()] }) : []
      const entries = res.entries().filter(([k]) => k.toString() !== '/XObject').map(([k, v]) => [k.toString(), v.toString()])
      entries.push(['/XObject', dictText(xEntries)])
      return dictText(entries)
    }
    // deepest first, so that a form's copy is named before the form above it is written
    const order = [...dirty].filter(c => c.kind === 'form').sort((a, b) => b.depth - a.depth)
    for (const c of order) newRef.set(c, alloc())
    for (const c of order) {
      const st = c.st, ref = newRef.get(c), list = edits.get(c)
      const keep = st.dict.entries().filter(([k]) => !['/Length', '/Filter', '/DecodeParms', '/DL', ...(c.ownRes ? ['/Resources'] : [])].includes(k.toString()))
      const entries = keep.map(([k, v]) => [k.toString(), v.toString()])
      // (a form without resources of its own reads its parent's: its copy names the parent's, changed where they change)
      const rt = resText(c)
      if (c.ownRes || [...dirty].some(x => x.parent === c)) { if (rt) entries.push(['/Resources', rt]) }
      let data
      if (list) { data = deflate(applyEdits(R.decode(st), list.map(x => x))); entries.push(['/Filter', '/FlateDecode']) }
      else if (st instanceof PDFRawStream) {
        data = st.contents
        for (const k of ['/Filter', '/DecodeParms']) { const v = st.dict.get(PDFName.of(k.slice(1))); if (v) entries.push([k, v.toString()]) }
      } else { data = deflate(R.decode(st)); entries.push(['/Filter', '/FlateDecode']) }
      entries.push(['/Length', String(data.length)])
      streamObj(ref, dictText(entries), data)
      stats.forms++
    }
    // the page's own pieces
    const pc = walk.pc, list = edits.get(pc) ?? []
    const refs = pc.pieces.map((p, pi) => {
      const mine = list.filter(x => x.pi === pi)
      if (!mine.length && p.ref) return p.ref.toString()
      const ref = alloc()
      const data = deflate(mine.length ? applyEdits(R.decode(p.st), mine) : R.decode(p.st))
      streamObj(ref, `<< /Filter /FlateDecode /Length ${data.length} >>`, data)
      stats.streams++
      return ref.toString()
    })
    return { contents: refs.length ? `[${refs.join(' ')}]` : empty.toString(), resources: resText(pc) }
  }

  for (let p = 1; p <= N; p++) {
    const entry = plan.pages?.[p] ?? null
    const out = { ok: false }
    manifest.page[p] = out
    // (a page the plan leaves alone is not read: each of its sets shows the original's, or nothing)
    if (!entry) {
      out.refused = 'not planned'
      pagesOut.push(Object.fromEntries(sets.map(s => [s, s === 'R' ? { contents: null, resources: null } : { contents: empty.toString(), resources: null }])))
      continue
    }
    const opList = await opListOf(p)
    const al = R.alignPage(p - 1, OPS, opList)
    const why = [...al.why]
    if (entry?.shows !== undefined && entry.shows !== al.shows.length) why.push(`the plan read ${entry.shows} showing operations, this reading ${al.shows.length}`)
    const glyphOf = (n, k) => { const e = al.shows[n]; return e && k >= 0 && k < e.codes.length ? e : null }
    const removeR = new Map(), paintsR = new Set(), keepP = new Map(), keepPaintsP = new Set(), keepF = new Map(), keepPaintsF = new Set()
    const add = (m, e, k) => (m.get(e) ?? m.set(e, new Set()).get(e)).add(k)
    const cropOfCode = new Map() // event -> Map(k -> crop index), the check's colours
    const units = {}
    if (entry && !why.length) {
      for (const u of entry.units ?? []) {
        const boxes = []
        for (let i = 0; i + 1 < u.glyphs.length; i += 2) {
          const n = u.glyphs[i], k = u.glyphs[i + 1], e = glyphOf(n, k)
          if (!e) { why.push(`unit ${u.id}: no glyph ${n}.${k}`); break }
          add(removeR, e, k); add(keepF, e, k)
          const b = boxesOf?.(p, n, k)
          if (b) boxes.push(...b)
        }
        for (const m of u.paths ?? []) {
          const e = al.paints?.[m]
          if (!e) { why.push(`unit ${u.id}: no path ${m}`); break }
          paintsR.add(e); keepPaintsF.add(e)
          const b = pathBoxOf?.(p, m)
          if (b) boxes.push(...b)
        }
        units[u.id] = boxes.map(v => Math.round(v * 100) / 100)
      }
      ;(entry.crops ?? []).forEach((c, ci) => {
        for (let i = 0; i + 1 < c.glyphs.length; i += 2) {
          const e = glyphOf(c.glyphs[i], c.glyphs[i + 1])
          if (!e) { why.push(`crop ${ci}: no glyph ${c.glyphs[i]}.${c.glyphs[i + 1]}`); break }
          add(keepP, e, c.glyphs[i + 1])
          ;(cropOfCode.get(e) ?? cropOfCode.set(e, new Map()).get(e)).set(c.glyphs[i + 1], ci)
        }
        for (const m of c.paths ?? []) { const e = al.paints?.[m]; if (!e) { why.push(`crop ${ci}: no path ${m}`); break } keepPaintsP.add(e) }
      })
    }
    // each set's edits: R takes out what the units hold; P, F and C keep only what they hold
    const keepOnly = (keep, keepPaints, colourOf = null) => {
      const codes = new Map(), paints = new Set(), drop = []
      // a form that holds nothing kept is left out whole; one that does is walked into
      const holds = new Set()
      for (const e of [...keep.keys(), ...keepPaints]) if (keep.get(e)?.size || keepPaints.has(e)) for (let x = e.cont; x; x = x.parent) holds.add(x)
      for (const e of al.walk.events) {
        if (e.cont.kind === 'form' && !holds.has(e.cont)) continue
        if (e.kind === 'show') { const k = keep.get(e) ?? new Set(), off = new Set(); e.codes.forEach((_, i) => { if (!k.has(i)) off.add(i) }); if (off.size || colourOf) codes.set(e, off) }
        else if (e.kind === 'paint' && !keepPaints.has(e)) paints.add(e)
        else if (e.kind === 'image') drop.push(e)
        else if (e.kind === 'form' && !holds.has(e.child)) drop.push(e)
      }
      return editsOf(al.walk, { codes, paints, drop, colourOf })
    }
    const plans = {
      R: () => editsOf(al.walk, { codes: removeR, paints: paintsR }),
      P: () => keepOnly(keepP, keepPaintsP),
      F: () => keepOnly(keepF, keepPaintsF),
      C: () => {
        // each crop a colour, its neighbours' apart (by its index's place in the palette, the page's crops in order)
        return keepOnly(keepP, keepPaintsP, (e, k) => { const ci = cropOfCode.get(e)?.get(k); if (ci === undefined) return null; const c = PALETTE[ci % PALETTE.length]; paletteOf.set(`${p}.${ci}`, c); return c.map(v => (v / 255).toFixed(3)).join(' ') })
      },
    }
    const made = {}
    if (!why.length && entry) for (const s of sets) { made[s] = plans[s](); if (made[s].refused.length) why.push(`${s}: ${[...new Set(made[s].refused)].join(', ')}`) }
    if (why.length || !entry) {
      if (entry) { out.refused = why.slice(0, 4).join('; '); stats.refused++ }
      else out.refused = 'not planned'
      pagesOut.push(Object.fromEntries(sets.map(s => [s, s === 'R' ? { contents: null, resources: null } : { contents: empty.toString(), resources: null }])))
      continue
    }
    out.ok = true
    out.units = units
    stats.removed += made.R.counts.cut + made.R.counts.hidden
    stats.cut += made.R.counts.cut
    stats.hidden += made.R.counts.hidden
    stats.rules += made.R.counts.rules
    const row = {}
    for (const s of sets) row[s] = writeSet(al.walk, made[s].edits)
    pagesOut.push(row)
  }

  // the appended pages, every set's page p at its place; and the root of the page tree holding them
  const cat = ctx.lookup(ctx.trailerInfo.Root), rootRef = cat.get(PDFName.of('Pages')), root = ctx.lookup(rootRef)
  const kids = []
  for (const s of sets) {
    for (let p = 1; p <= N; p++) {
      // (compact: a page it did not remove has no page in the set; one it did is named where it is)
      if (compact && !manifest.page[p].ok) continue
      if (compact) (manifest.page[p].at ??= {})[s] = N + kids.length + 1
      const node = doc.getPages()[p - 1].node, o = pagesOut[p - 1][s]
      const inh = k => { const v = node.getInheritableAttribute ? node.getInheritableAttribute(PDFName.of(k)) : node.get(PDFName.of(k)); return v ? ` /${k} ${v.toString()}` : '' }
      const own = k => { const v = node.get(PDFName.of(k)); return v ? ` /${k} ${v.toString()}` : '' }
      const contents = o.contents ?? node.get(PDFName.of('Contents'))?.toString() ?? empty.toString()
      const resources = o.resources ? ` /Resources ${o.resources}` : inh('Resources')
      const ref = alloc()
      plainObj(ref, `<< /Type /Page /Parent ${rootRef}${resources}${inh('MediaBox')}${inh('CropBox')}${inh('Rotate')}${own('Group')}${own('UserUnit')} /Contents ${contents} >>`)
      kids.push(ref.toString())
    }
  }
  const oldKids = root.get(PDFName.of('Kids')).asArray().map(r => r.toString())
  const count = R.look(root.get(PDFName.of('Count')))?.asNumber?.() ?? N
  const entries = root.entries().filter(([k]) => !['/Kids', '/Count'].includes(k.toString())).map(([k, v]) => [k.toString(), v.toString()])
  entries.push(['/Kids', `[${[...oldKids, ...kids].join(' ')}]`], ['/Count', String(count + kids.length)])
  objects.push([rootRef, enc(`${rootRef.objectNumber} ${rootRef.generationNumber} obj\n${dictText(entries)}\nendobj\n`)])

  // the update: the objects, then a cross-reference section of the original's kind with /Prev
  const chunks = [enc('\n')]
  let size = bytes.length + 1
  const offsets = []
  for (const [ref, b] of objects) { offsets.push([ref.objectNumber, ref.generationNumber, size]); chunks.push(b); size += b.length }
  const tail = td.decode(bytes.subarray(Math.max(0, bytes.length - 1024)))
  const prev = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(tail)?.[1] ?? /startxref\s+(\d+)/.exec(tail.slice(tail.lastIndexOf('startxref')))?.[1])
  const isStream = !/^\s*xref/.test(td.decode(bytes.subarray(prev, prev + 16)))
  const T = ctx.trailerInfo
  const tr = [`/Root ${T.Root}`, T.Info ? `/Info ${T.Info}` : '', T.ID ? `/ID ${T.ID}` : '', `/Prev ${prev}`].filter(Boolean).join(' ')
  let SIZE = Math.max(next, ctx.largestObjectNumber + 1)
  offsets.sort((a, b) => a[0] - b[0])
  const xrefAt = size
  if (!isStream) {
    chunks.push(enc(`xref\n${offsets.map(([n, g, o]) => `${n} 1\n${String(o).padStart(10, '0')} ${String(g).padStart(5, '0')} n\r\n`).join('')}trailer\n<< /Size ${SIZE} ${tr} >>\nstartxref\n${xrefAt}\n%%EOF\n`))
  } else {
    const xs = SIZE
    SIZE += 1
    const rows = [...offsets, [xs, 0, xrefAt]]
    const data = new Uint8Array(rows.length * 7)
    rows.forEach(([, g, o], r) => { data[7 * r] = 1; data[7 * r + 1] = (o >>> 24) & 255; data[7 * r + 2] = (o >>> 16) & 255; data[7 * r + 3] = (o >>> 8) & 255; data[7 * r + 4] = o & 255; data[7 * r + 5] = (g >> 8) & 255; data[7 * r + 6] = g & 255 })
    chunks.push(enc(`${xs} 0 obj\n<< /Type /XRef /Size ${SIZE} /W [1 4 2] /Index [${rows.map(([n]) => `${n} 1`).join(' ')}] ${tr} /Length ${data.length} >>\nstream\n`), data, enc(`\nendstream\nendobj\nstartxref\n${xrefAt}\n%%EOF\n`))
  }
  const update = concat(chunks)
  const out = concat([bytes, update])
  manifest.appended = update.length
  manifest.stats = stats
  if (paletteOf.size) manifest.colours = Object.fromEntries(paletteOf)
  return { bytes: out, appended: update.length, manifest }
}

/**
 * The add-on's page p checked by PDF.js's own reading, independent of the remover: `orig`, `removed` and `kept` are the
 * ink (layout/ink.mjs pageInk with `indices`) of arXiv's page and of its R and P pages; `entry` the plan's
 * page. R must lack exactly the planned glyphs and rules, every other glyph in the same order with the same character,
 * font and place, every other rule the same box; P must hold exactly the crops' glyphs and rules, and nothing else.
 * Returns the counts: removed, missed (planned, still there), other (not planned, gone), moved, extra; rules removed,
 * missed, other; P's own, missing and other.
 */
export function checkPage({ orig, removed, kept, entry }) {
  const key = g => `${g.n}.${g.k}`
  const planned = new Set(), plannedPaths = new Set(), crop = new Set(), cropPaths = new Set()
  for (const u of entry?.units ?? []) { for (let i = 0; i + 1 < u.glyphs.length; i += 2) planned.add(`${u.glyphs[i]}.${u.glyphs[i + 1]}`); for (const m of u.paths ?? []) plannedPaths.add(m) }
  for (const c of entry?.crops ?? []) { for (let i = 0; i + 1 < c.glyphs.length; i += 2) crop.add(`${c.glyphs[i]}.${c.glyphs[i + 1]}`); for (const m of c.paths ?? []) cropPaths.add(m) }
  const same = (x, y) => y && x.u === y.u && x.font === y.font && Math.abs(x.y - y.y) < 1e-6 && Math.abs(x.x0 - y.x0) < 0.01
  const out = { removed: 0, missed: 0, other: 0, moved: 0, extra: 0, maxMove: 0, rulesRemoved: 0, rulesMissed: 0, rulesOther: 0, pOwn: 0, pMissing: 0, pOther: 0 }
  // R: the original's glyphs that are not planned out, in order, each found in R as it was; what R holds besides is a
  // planned glyph left there (missed) or another (extra); one not found is gone (other) or found elsewhere (moved)
  const G = orig.glyphs, H = removed.glyphs
  const plannedHere = G.filter(g => planned.has(key(g)))
  let h = 0
  const leftOver = []
  for (const x of G) {
    if (planned.has(key(x))) continue
    let k = -1
    for (let q = h; q < Math.min(H.length, h + 64); q++) if (same(x, H[q])) { k = q; break }
    if (k < 0) {
      const near = H.slice(h, h + 64).findIndex(z => z.u === x.u && z.font === x.font && Math.abs(z.y - x.y) < 1e-6)
      if (near >= 0) { out.moved++; leftOver.push(...H.slice(h, h + near)); h += near + 1 } else out.other++
      continue
    }
    const d = Math.max(Math.abs(x.x0 - H[k].x0), Math.abs(x.x1 - H[k].x1), Math.abs(x.y - H[k].y))
    out.maxMove = Math.max(out.maxMove, d)
    if (d > 1e-6) out.moved++
    leftOver.push(...H.slice(h, k))
    h = k + 1
  }
  leftOver.push(...H.slice(h))
  for (const z of leftOver) { if (plannedHere.some(x => same(x, z))) out.missed++; else out.extra++ }
  out.removed = plannedHere.length - out.missed
  // R's rules: the original's painted paths that are not planned out, in order, each the same box in R
  const pathsOf = ink => { const out = []; ink.paths.forEach((m, b) => { if (m >= 0) out.push({ m, box: ink.boxes.slice(4 * b, 4 * b + 4) }) }); return out }
  const sameBox = (a, b) => b && a.every((v, i) => Math.abs(v - b[i]) < 1e-6)
  const OP = pathsOf(orig), RP = pathsOf(removed)
  let r = 0
  const rest = []
  for (const x of OP) {
    if (plannedPaths.has(x.m)) continue
    let k = -1
    for (let q = r; q < Math.min(RP.length, r + 64); q++) if (sameBox(x.box, RP[q].box)) { k = q; break }
    if (k < 0) { out.rulesOther++; continue }
    rest.push(...RP.slice(r, k))
    r = k + 1
  }
  rest.push(...RP.slice(r))
  const plannedBoxes = OP.filter(x => plannedPaths.has(x.m))
  for (const z of rest) if (plannedBoxes.some(x => sameBox(x.box, z.box))) out.rulesMissed++; else out.rulesOther++
  out.rulesRemoved = plannedBoxes.length - out.rulesMissed
  // P: the crops' glyphs, in order, and nothing else
  const P = kept.glyphs
  let q = 0
  for (const x of G) {
    if (!crop.has(key(x))) continue
    const k = P.slice(q, q + 64).findIndex(z => same(x, z))
    if (k < 0) { out.pMissing++; continue }
    out.pOther += k
    out.pOwn++
    q += k + 1
  }
  out.pOther += P.length - q
  // (and no box in P but the crops' rules: no other path, no image, no rotated glyph; a shading there is a soft mask's,
  // which PDF.js lists with the page's operations, and paints nothing of its own)
  out.pOther += Math.max(0, pathsOf(kept).length - cropPaths.size) + kept.paths.filter(m => m === -3 || m === -4).length
  return out
}
