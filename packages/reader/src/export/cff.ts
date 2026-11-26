// A served slice's CFF table (Adobe Technical Note #5176) subset for a file that draws a few of its glyphs: every glyph not
// drawn made empty (its charstring `endchar`) and every subroutine no kept glyph reaches made empty (`return`), glyph ids,
// CIDs, the charset, the Font DICTs and their selector kept as they are, so that the codes a page's text shows (the CIDs) need
// no renumbering; the font written again from its parts, each offset five bytes wide, so that no offset's width depends on
// another. Which subroutines a glyph reaches is read by walking its Type 2 charstring (Technical Note #5177): the operand
// before each call names it, a hint mask's bytes are skipped by the stems counted before it. Refused (null: the font goes
// whole) where the walk cannot tell: a call whose number the charstring computes, an `endchar` composing two glyphs by their
// standard codes (seac), a charstring type other than 2, a table it cannot read.

/** a CFF read into its parts: each glyph's charstring, the global and each Font DICT's local subroutines, and for a
 *  CID-keyed font each glyph's CID and Font DICT */
export interface CffRead {
  cidKeyed: boolean
  glyphs: Uint8Array[]
  gsubrs: Uint8Array[]
  /** the local subroutines of each Font DICT (a name-keyed font: one set) */
  lsubrs: Uint8Array[][]
  /** each glyph's CID (identity for a name-keyed font) */
  cids: Uint16Array
  /** each glyph's Font DICT (0 for a name-keyed font) */
  fds: Uint8Array
}

/** a DICT's entry: its operator (an escaped one 1200 + its second byte), its operands' values and their bytes */
interface Entry {
  op: number
  values: number[]
  raw: Uint8Array
}
interface Parsed {
  header: Uint8Array
  names: Uint8Array
  top: Entry[]
  strings: Uint8Array
  gsubrs: Uint8Array[]
  glyphs: Uint8Array[]
  charset: Uint8Array | null
  fdSelect: Uint8Array | null
  /** each Font DICT's entries, its Private DICT's entries and its local subroutines (a name-keyed font: one, its Top DICT's) */
  fonts: { dict: Entry[]; priv: Entry[]; subrs: Uint8Array[] }[]
  fds: Uint8Array
  cids: Uint16Array
  cidKeyed: boolean
}

class CffError extends Error {}
const u16 = (b: Uint8Array, i: number) => {
  if (i + 2 > b.length) throw new CffError('past the table')
  return (b[i]! << 8) | b[i + 1]!
}

/** an INDEX at `at`: its items (views of `b`) and where it ends */
function indexAt(b: Uint8Array, at: number): { items: Uint8Array[]; end: number } {
  const count = u16(b, at)
  if (count === 0) return { items: [], end: at + 2 }
  const os = b[at + 2]!
  if (os < 1 || os > 4) throw new CffError('an INDEX offset size')
  const off = (k: number) => {
    let v = 0
    for (let q = 0; q < os; q++) v = v * 256 + b[at + 3 + k * os + q]!
    return v
  }
  const base = at + 3 + (count + 1) * os - 1
  const items: Uint8Array[] = []
  for (let k = 0; k < count; k++) {
    const s = base + off(k),
      e = base + off(k + 1)
    if (e < s || e > b.length) throw new CffError('an INDEX item past the table')
    items.push(b.subarray(s, e))
  }
  return { items, end: base + off(count) }
}

/** a DICT's entries in order */
function dictOf(b: Uint8Array): Entry[] {
  const out: Entry[] = []
  let values: number[] = []
  let start = 0
  let i = 0
  while (i < b.length) {
    const b0 = b[i]!
    if (b0 <= 21) {
      const op = b0 === 12 ? 1200 + b[i + 1]! : b0
      out.push({ op, values, raw: b.subarray(start, i) })
      i += b0 === 12 ? 2 : 1
      values = []
      start = i
      continue
    }
    if (b0 === 28) {
      values.push((((b[i + 1]! << 8) | b[i + 2]!) << 16) >> 16)
      i += 3
    } else if (b0 === 29) {
      values.push((b[i + 1]! << 24) | (b[i + 2]! << 16) | (b[i + 3]! << 8) | b[i + 4]!)
      i += 5
    } else if (b0 === 30) {
      i++
      for (;;) {
        if (i >= b.length) throw new CffError('a real number past the DICT')
        const c = b[i++]!
        if ((c & 0xf) === 0xf || c >> 4 === 0xf) break
      }
      values.push(Number.NaN)
    } else if (b0 >= 32 && b0 <= 246) {
      values.push(b0 - 139)
      i++
    } else if (b0 >= 247 && b0 <= 250) {
      values.push((b0 - 247) * 256 + b[i + 1]! + 108)
      i += 2
    } else if (b0 >= 251 && b0 <= 254) {
      values.push(-(b0 - 251) * 256 - b[i + 1]! - 108)
      i += 2
    } else throw new CffError(`a DICT byte ${b0}`)
  }
  return out
}
const operandOf = (d: Entry[], op: number, k = 0): number | undefined => d.find((e) => e.op === op)?.values[k]

/** the charset's bytes at `at` for `n` glyphs (formats 0, 1, 2), and each glyph's SID or CID */
function charsetAt(b: Uint8Array, at: number, n: number): { bytes: Uint8Array; ids: Uint16Array } {
  const ids = new Uint16Array(n)
  const fmt = b[at]
  let i = at + 1,
    g = 1
  if (fmt === 0) for (; g < n; g++, i += 2) ids[g] = u16(b, i)
  else if (fmt === 1 || fmt === 2)
    while (g < n) {
      const first = u16(b, i)
      const left = fmt === 1 ? b[i + 2]! : u16(b, i + 2)
      i += fmt === 1 ? 3 : 4
      for (let k = 0; k <= left && g < n; k++) ids[g++] = first + k
    }
  else throw new CffError(`a charset format ${fmt}`)
  return { bytes: b.subarray(at, i), ids }
}

/** the FDSelect's bytes at `at` for `n` glyphs (formats 0 and 3), and each glyph's Font DICT */
function fdSelectAt(b: Uint8Array, at: number, n: number): { bytes: Uint8Array; fds: Uint8Array } {
  const fds = new Uint8Array(n)
  const fmt = b[at]
  if (fmt === 0) {
    fds.set(b.subarray(at + 1, at + 1 + n))
    return { bytes: b.subarray(at, at + 1 + n), fds }
  }
  if (fmt !== 3) throw new CffError(`an FDSelect format ${fmt}`)
  const ranges = u16(b, at + 1)
  for (let r = 0; r < ranges; r++) {
    const first = u16(b, at + 3 + 3 * r),
      fd = b[at + 5 + 3 * r]!,
      next = u16(b, at + 6 + 3 * r)
    for (let g = first; g < next && g < n; g++) fds[g] = fd
  }
  return { bytes: b.subarray(at, at + 5 + 3 * ranges), fds }
}

function parse(cff: Uint8Array): Parsed {
  const hdr = cff[2]!
  const names = indexAt(cff, hdr)
  const topIndex = indexAt(cff, names.end)
  if (topIndex.items.length !== 1) throw new CffError('a font set of more than one font')
  const top = dictOf(topIndex.items[0]!)
  const strings = indexAt(cff, topIndex.end)
  const gsubrs = indexAt(cff, strings.end)
  if ((operandOf(top, 1206) ?? 2) !== 2) throw new CffError('a charstring type other than 2')
  const csAt = operandOf(top, 17)
  if (!csAt) throw new CffError('no CharStrings')
  const glyphs = indexAt(cff, csAt).items
  const n = glyphs.length
  const cidKeyed = top.some((e) => e.op === 1230)
  const csetOff = operandOf(top, 15) ?? 0
  const cset = csetOff > 2 ? charsetAt(cff, csetOff, n) : null
  const privateOf = (d: Entry[]) => {
    const e = d.find((x) => x.op === 18)
    if (!e) return { priv: [] as Entry[], subrs: [] as Uint8Array[] }
    const [size, off] = e.values as [number, number]
    const priv = dictOf(cff.subarray(off, off + size))
    const subrsOff = operandOf(priv, 19)
    return { priv, subrs: subrsOff ? indexAt(cff, off + subrsOff).items : [] }
  }
  let fonts: Parsed['fonts']
  let sel: { bytes: Uint8Array; fds: Uint8Array } | null = null
  if (cidKeyed) {
    const fdArray = operandOf(top, 1236),
      fdSel = operandOf(top, 1237)
    if (!fdArray || !fdSel) throw new CffError('a CID-keyed font without its Font DICTs')
    fonts = indexAt(cff, fdArray).items.map((item) => {
      const dict = dictOf(item)
      return { dict, ...privateOf(dict) }
    })
    sel = fdSelectAt(cff, fdSel, n)
    if (sel.fds.some((fd) => fd >= fonts.length)) throw new CffError('a glyph of no Font DICT')
  } else fonts = [{ dict: [], ...privateOf(top) }]
  const cids = cidKeyed && cset ? cset.ids : Uint16Array.from({ length: n }, (_, g) => g)
  return {
    header: cff.subarray(0, hdr),
    names: cff.subarray(hdr, names.end),
    top,
    strings: cff.subarray(topIndex.end, strings.end),
    gsubrs: gsubrs.items,
    glyphs,
    charset: cset?.bytes ?? null,
    fdSelect: sel?.bytes ?? null,
    fonts,
    fds: sel?.fds ?? new Uint8Array(n),
    cids,
    cidKeyed,
  }
}

/** a CFF's parts (for the export's tests and the font's reading); throws where it cannot be read */
export function readCff(cff: Uint8Array): CffRead {
  const p = parse(cff)
  return {
    cidKeyed: p.cidKeyed,
    glyphs: p.glyphs,
    gsubrs: p.gsubrs,
    lsubrs: p.fonts.map((f) => f.subrs),
    cids: p.cids,
    fds: p.fds,
  }
}

const bias = (n: number) => (n < 1240 ? 107 : n < 33900 ? 1131 : 32768)
/** the arithmetic operators (12 x): [operands taken, values given]; the stack's other escaped operators (index, roll, put,
 *  get) move values by computed places, and refuse the walk */
const ARITH: Record<number, [number, number]> = {
  3: [2, 1], // and
  4: [2, 1], // or
  5: [1, 1], // not
  9: [1, 1], // abs
  10: [2, 1], // add
  11: [2, 1], // sub
  12: [2, 1], // div
  14: [1, 1], // neg
  15: [2, 1], // eq
  18: [1, 0], // drop
  22: [4, 1], // ifelse
  23: [0, 1], // random
  24: [2, 1], // mul
  26: [1, 1], // sqrt
  27: [1, 2], // dup
  28: [2, 2], // exch
}

/** the subroutines each kept glyph reaches: [global numbers, per Font DICT local numbers] */
function reached(p: Parsed, keep: ReadonlySet<number>): { g: Set<number>; l: Set<number>[] } {
  const g = new Set<number>()
  const l = p.fonts.map(() => new Set<number>())
  const gBias = bias(p.gsubrs.length)
  for (const gid of keep) {
    const glyph = p.glyphs[gid]
    if (!glyph) continue
    const fd = p.fds[gid] ?? 0
    const subrs = p.fonts[fd]?.subrs ?? []
    const lBias = bias(subrs.length)
    const stack: number[] = []
    let stems = 0
    let ended = false
    const run = (c: Uint8Array, depth: number): void => {
      if (depth > 10) throw new CffError('subroutines nested past ten')
      let i = 0
      while (i < c.length && !ended) {
        const b0 = c[i]!
        if (b0 >= 32 || b0 === 28) {
          if (b0 <= 246) {
            stack.push(b0 === 28 ? (((c[i + 1]! << 8) | c[i + 2]!) << 16) >> 16 : b0 - 139)
            i += b0 === 28 ? 3 : 1
          } else if (b0 <= 250) {
            stack.push((b0 - 247) * 256 + c[i + 1]! + 108)
            i += 2
          } else if (b0 <= 254) {
            stack.push(-(b0 - 251) * 256 - c[i + 1]! - 108)
            i += 2
          } else {
            stack.push(((c[i + 1]! << 24) | (c[i + 2]! << 16) | (c[i + 3]! << 8) | c[i + 4]!) / 65536)
            i += 5
          }
          continue
        }
        i++
        switch (b0) {
          case 1: // hstem
          case 3: // vstem
          case 18: // hstemhm
          case 23: // vstemhm
            stems += stack.length >> 1
            stack.length = 0
            break
          case 19: // hintmask
          case 20: // cntrmask
            stems += stack.length >> 1
            stack.length = 0
            i += (stems + 7) >> 3
            break
          case 10: // callsubr
          case 29: {
            // callgsubr
            const v = stack.pop()
            if (v === undefined || !Number.isInteger(v))
              throw new CffError('a subroutine number the charstring computes')
            const local = b0 === 10
            const k = v + (local ? lBias : gBias)
            const body = local ? subrs[k] : p.gsubrs[k]
            if (!body) throw new CffError('a call of no subroutine')
            ;(local ? l[fd]! : g).add(k)
            run(body, depth + 1)
            break
          }
          case 11: // return
            return
          case 14: // endchar
            // (four operands, five with the width: seac, two glyphs by their standard codes)
            if (stack.length >= 4) throw new CffError('an endchar composing two glyphs')
            ended = true
            return
          case 12: {
            const op = c[i++]!
            const arith = ARITH[op]
            if (arith) {
              if (stack.length < arith[0]) throw new CffError('an arithmetic operator short of operands')
              stack.length -= arith[0]
              for (let k = 0; k < arith[1]; k++) stack.push(Number.NaN)
            } else if (op === 20 || op === 21 || op === 29 || op === 30)
              throw new CffError('a stack operator moving values by computed places')
            else stack.length = 0
            break
          }
          default:
            stack.length = 0
        }
      }
    }
    run(glyph, 0)
  }
  return { g, l }
}

// ---- writing
const int5 = (v: number) => [29, (v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]
const opBytes = (op: number) => (op >= 1200 ? [12, op - 1200] : [op])
/** a DICT of `entries`, those of `rewrite` given new operands, five bytes each */
function writeDict(
  entries: Entry[],
  rewrite: Map<number, number[]>,
  drop: ReadonlySet<number> = new Set(),
): Uint8Array {
  const out: number[] = []
  for (const e of entries) {
    if (drop.has(e.op)) continue
    const nv = rewrite.get(e.op)
    if (nv) for (const v of nv) out.push(...int5(v))
    else out.push(...e.raw)
    out.push(...opBytes(e.op))
  }
  return new Uint8Array(out)
}
/** an INDEX of `items`, its offsets as narrow as its size allows */
function writeIndex(items: Uint8Array[]): Uint8Array {
  if (!items.length) return new Uint8Array([0, 0])
  const size = items.reduce((n, b) => n + b.length, 0) + 1
  const os = size < 0x100 ? 1 : size < 0x10000 ? 2 : size < 0x1000000 ? 3 : 4
  const out = new Uint8Array(3 + os * (items.length + 1) + size - 1)
  out[0] = items.length >> 8
  out[1] = items.length & 255
  out[2] = os
  let off = 1,
    at = 3 + os * (items.length + 1)
  const put = (k: number, v: number) => {
    for (let q = os - 1; q >= 0; q--, v = Math.floor(v / 256)) out[3 + k * os + q] = v & 255
  }
  items.forEach((b, k) => {
    put(k, off)
    out.set(b, at)
    at += b.length
    off += b.length
  })
  put(items.length, off)
  return out
}
const cat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
const ENDCHAR = new Uint8Array([14])
const RETURN = new Uint8Array([11])

/** `cff` with only the glyphs of `keep` (and glyph 0) and the subroutines they reach; null where it cannot be told which */
export function subsetCff(cff: Uint8Array, keep: ReadonlySet<number>): Uint8Array | null {
  let p: Parsed
  let r: ReturnType<typeof reached>
  const kept = new Set([0, ...keep])
  try {
    p = parse(cff)
    r = reached(p, kept)
  } catch (e) {
    if (e instanceof CffError || e instanceof RangeError) return null
    throw e
  }
  const glyphs = writeIndex(p.glyphs.map((c, g) => (kept.has(g) ? c : ENDCHAR)))
  const gsubrs = writeIndex(p.gsubrs.map((c, k) => (r.g.has(k) ? c : RETURN)))
  const fonts = p.fonts.map((f, fd) => ({
    f,
    subrs: f.subrs.length ? writeIndex(f.subrs.map((c, k) => (r.l[fd]!.has(k) ? c : RETURN))) : null,
  }))
  // (a Private DICT's size does not depend on its Subrs' offset, written five bytes wide: the subroutines right after it)
  const privs = fonts.map(({ f, subrs }) => {
    const len = writeDict(f.priv, new Map([[19, [0]]]), subrs ? new Set() : new Set([19])).length
    return { bytes: writeDict(f.priv, new Map([[19, [len]]]), subrs ? new Set() : new Set([19])), subrs }
  })
  // the layout: header, Name INDEX, Top DICT INDEX, String INDEX, global subroutines, charset, FDSelect, CharStrings, the Font
  // DICTs, each Private DICT with its local subroutines
  const DROP = new Set([16]) // (the encoding: a CIDFontType0C's glyphs are selected by CID, never by code)
  const topFor = (o: { charset: number; chars: number; fdArray: number; fdSelect: number; priv: number }) => {
    const m = new Map<number, number[]>([[17, [o.chars]]])
    if (p.charset) m.set(15, [o.charset])
    if (p.cidKeyed) {
      m.set(1236, [o.fdArray])
      m.set(1237, [o.fdSelect])
    } else if (p.top.some((e) => e.op === 18)) m.set(18, [privs[0]!.bytes.length, o.priv])
    return writeIndex([writeDict(p.top, m, DROP)])
  }
  const zero = { charset: 0, chars: 0, fdArray: 0, fdSelect: 0, priv: 0 }
  const header = new Uint8Array([p.header[0] ?? 1, p.header[1] ?? 0, 4, 4])
  let at = header.length + p.names.length + topFor(zero).length + p.strings.length + gsubrs.length
  const o = { ...zero }
  o.charset = at
  at += p.charset?.length ?? 0
  o.fdSelect = at
  at += p.fdSelect?.length ?? 0
  o.chars = at
  at += glyphs.length
  const fontDict = (fd: number, privAt: number) =>
    writeDict(p.fonts[fd]!.dict, new Map([[18, [privs[fd]!.bytes.length, privAt]]]))
  const fdArrayLen = p.cidKeyed ? writeIndex(p.fonts.map((_, fd) => fontDict(fd, 0))).length : 0
  o.fdArray = at
  at += fdArrayLen
  const privAts: number[] = []
  for (const pr of privs) {
    privAts.push(at)
    at += pr.bytes.length + (pr.subrs?.length ?? 0)
  }
  o.priv = privAts[0] ?? 0
  const fdArray = p.cidKeyed ? writeIndex(p.fonts.map((_, fd) => fontDict(fd, privAts[fd]!))) : new Uint8Array(0)
  return cat([
    header,
    p.names,
    topFor(o),
    p.strings,
    gsubrs,
    p.charset ?? new Uint8Array(0),
    p.fdSelect ?? new Uint8Array(0),
    glyphs,
    fdArray,
    ...privs.flatMap((pr) => (pr.subrs ? [pr.bytes, pr.subrs] : [pr.bytes])),
  ])
}
