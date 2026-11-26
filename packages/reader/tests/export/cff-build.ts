// Compact Font Format fonts of our own for the export's tests (Adobe Technical Note #5176): an INDEX, a DICT of integer
// operands, a Type 2 charstring's numbers, and two whole fonts, one keyed by glyph names and one by CIDs over two Font DICTs,
// each with global and local subroutines. Nothing here is a real font's: the outlines are a few lines each.

/** an INDEX of `items`, its offsets four bytes wide (count 0: two bytes) */
export function index(items: Uint8Array[]): Uint8Array {
  if (!items.length) return new Uint8Array([0, 0])
  const size = items.reduce((n, b) => n + b.length, 0)
  const out = new Uint8Array(3 + 4 * (items.length + 1) + size)
  out[0] = items.length >> 8
  out[1] = items.length & 255
  out[2] = 4
  let off = 1,
    at = 3 + 4 * (items.length + 1)
  items.forEach((b, k) => {
    put4(out, 3 + 4 * k, off)
    out.set(b, at)
    at += b.length
    off += b.length
  })
  put4(out, 3 + 4 * items.length, off)
  return out
}
const put4 = (b: Uint8Array, at: number, v: number) => {
  b[at] = v >>> 24
  b[at + 1] = (v >>> 16) & 255
  b[at + 2] = (v >>> 8) & 255
  b[at + 3] = v & 255
}
/** a DICT integer, five bytes (so that a DICT's size does not depend on the offsets it holds) */
const int5 = (v: number) => [29, v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]
/** a DICT of [operator, operands] in order (an operator ≥ 1200 is escaped: 12, op − 1200) */
export function dict(entries: [number, number[]][]): Uint8Array {
  const out: number[] = []
  for (const [op, vs] of entries) {
    for (const v of vs) out.push(...int5(v))
    if (op >= 1200) out.push(12, op - 1200)
    else out.push(op)
  }
  return new Uint8Array(out)
}
/** a Type 2 charstring: numbers (−107..107 in one byte, else 28 and two) and operators by name */
const OPS: Record<string, number[]> = {
  hstem: [1],
  vstem: [3],
  rmoveto: [21],
  rlineto: [5],
  callsubr: [10],
  return: [11],
  endchar: [14],
  hstemhm: [18],
  hintmask: [19],
  callgsubr: [29],
  add: [12, 10],
}
export function cs(...parts: (number | string | { mask: number[] })[]): Uint8Array {
  const out: number[] = []
  for (const p of parts) {
    if (typeof p === 'number') {
      if (p >= -107 && p <= 107) out.push(p + 139)
      else out.push(28, (p >> 8) & 255, p & 255)
    } else if (typeof p === 'string') out.push(...(OPS[p] ?? []))
    else out.push(...p.mask)
  }
  return new Uint8Array(out)
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
const latin = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)))

export interface CffParts {
  glyphs: Uint8Array[]
  gsubrs: Uint8Array[]
  /** one local subroutine set a Font DICT (a name-keyed font: one) */
  lsubrs: Uint8Array[][]
  /** a CID-keyed font: each glyph's Font DICT, and each glyph's CID (glyph 0's is 0) */
  cid?: { fdOf: number[]; cids: number[] }
}

/** a whole font of `parts`: the Top DICT, its offsets and its Private DICTs laid out in two passes */
export function buildCff(p: CffParts): Uint8Array {
  const header = new Uint8Array([1, 0, 4, 4])
  const names = index([latin('AXTTEST')])
  const strings = index(p.cid ? [latin('Adobe'), latin('Identity')] : [])
  const gsubrs = index(p.gsubrs)
  const chars = index(p.glyphs)
  const n = p.glyphs.length
  const charset = p.cid
    ? cat([new Uint8Array([0]), ...p.cid.cids.slice(1).map((c) => new Uint8Array([c >> 8, c & 255]))])
    : new Uint8Array(0)
  const fdSelect = p.cid ? cat([new Uint8Array([0]), new Uint8Array(p.cid.fdOf)]) : new Uint8Array(0)
  const privs = p.lsubrs.map((subrs) => ({
    subrs: index(subrs),
    size: dict([[19, [0]]]).length + dict([[20, [0]]]).length,
  }))
  const top = (o: { charset: number; fdSelect: number; chars: number; fdArray: number; priv: [number, number] }) =>
    dict([
      ...(p.cid
        ? ([
            [1230, [391, 392, 0]],
            [1234, [n]],
          ] as [number, number[]][])
        : []),
      ...(p.cid ? ([[15, [o.charset]]] as [number, number[]][]) : []),
      [17, [o.chars]],
      ...(p.cid
        ? ([
            [1236, [o.fdArray]],
            [1237, [o.fdSelect]],
          ] as [number, number[]][])
        : ([[18, o.priv]] as [number, number[]][])),
    ])
  const topLen = index([top({ charset: 0, fdSelect: 0, chars: 0, fdArray: 0, priv: [0, 0] })]).length
  let at = header.length + names.length + topLen + strings.length + gsubrs.length
  const charsetAt = at
  at += charset.length
  const fdSelectAt = at
  at += fdSelect.length
  const charsAt = at
  at += chars.length
  // (each Private DICT: Subrs then nominalWidthX, its local subroutines right after it)
  const fontDict = (privAt: number, size: number) => dict([[18, [size, privAt]]])
  const fdArrayLen = p.cid ? index(privs.map(() => fontDict(0, 0))).length : 0
  const fdArrayAt = at
  at += fdArrayLen
  const privAts: number[] = []
  const privBytes: Uint8Array[] = []
  for (const pr of privs) {
    privAts.push(at)
    const d = dict([
      [19, [pr.size]],
      [20, [0]],
    ])
    privBytes.push(d, pr.subrs)
    at += d.length + pr.subrs.length
  }
  const topBytes = index([
    top({
      charset: charsetAt,
      fdSelect: fdSelectAt,
      chars: charsAt,
      fdArray: fdArrayAt,
      priv: [privs[0]!.size, privAts[0]!],
    }),
  ])
  const fdArray = p.cid ? index(privs.map((pr, k) => fontDict(privAts[k]!, pr.size))) : new Uint8Array(0)
  return cat([header, names, topBytes, strings, gsubrs, charset, fdSelect, chars, fdArray, ...privBytes])
}
