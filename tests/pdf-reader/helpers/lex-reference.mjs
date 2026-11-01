// The content-stream lexer as it was before it read numbers from their bytes (layout/remove.mjs `lex` at 42bf0cf7, line for line
// below its constants: each token made a string, a number read by a pattern and Number), kept here alone as the reference the
// lexer is held to: the same operators, operands, offsets, `bytes` and LexLimit refusals, value for value
// (tests/pdf-reader/layout-lex.test.ts). Imported by no module of the engine.
import { COST, LexLimit } from '../../../src/pdf-reader/engine/layout/remove.mjs'

const WS = new Uint8Array(256)
for (const c of [0, 9, 10, 12, 13, 32]) WS[c] = 1
const DL = new Uint8Array(256)
for (const c of '()<>[]{}/%') DL[c.charCodeAt(0)] = 1
const isNumTok = t => /^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)
/** a hex digit's value by its byte, -1 for any other */
const DIGIT = new Int8Array(256).fill(-1)
for (let c = 0; c < 10; c++) DIGIT[48 + c] = c
for (let c = 0; c < 6; c++) { DIGIT[65 + c] = 10 + c; DIGIT[97 + c] = 10 + c }
/** bytes as the characters of their codes (ISO 8859-1, which TextDecoder's 'latin1', windows-1252, is not) */
const latin1 = u8 => { let out = ''; for (let k = 0; k < u8.length; k += 8192) out += String.fromCharCode.apply(null, u8.subarray(k, k + 8192)); return out }
/** a token longer than this is no operator, number or keyword PDF.js knows: it is read as an unknown one, not kept whole */
const TOKEN_MAX = 255

/** the lexer of 42bf0cf7: `lex(b, limit, keep)` */
export function lexReference(b, limit = Infinity, keep = null) {
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
