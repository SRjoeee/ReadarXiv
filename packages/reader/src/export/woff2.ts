// A served slice (WOFF2, https://www.w3.org/TR/WOFF2/) back to the sfnt it was made of, for the export's fonts. In two steps,
// so that one decoder's call takes every slice of a file: `woff2Payload` reads the table directory and gives the brotli
// stream; `sfntOfWoff2` lays the decoded tables out as an sfnt again. A CFF-flavoured slice (3,705 of the 3,839 served) holds
// no table transformed; a TrueType-flavoured one (134: the faces bkai00mp, DejaVu Sans Mono's four, PT Mono's two) stores its
// glyf and loca transformed (WOFF2 §5.1), and maybe its hmtx (§5.4): rebuilt here, each glyph written in glyf's own form
// (its coordinates as two-byte deltas, its flags one a point), loca in its long form (the head's indexToLocFormat set to 1).

import { writeSfnt } from './ttf.ts'

const TAGS = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
]

/** a table of the directory: its tag, its length in the sfnt, whether it is stored transformed, and its bytes in the stream */
export interface Woff2Table {
  tag: string
  length: number
  transformed: boolean
  size: number
}
/** a WOFF2's flavour, its tables in directory order and its brotli stream */
export interface Woff2Payload {
  flavor: number
  tables: Woff2Table[]
  stream: Uint8Array
}

/** the slice's directory and brotli stream; null where it is no WOFF2, or holds a transform no part of WOFF2 2.0 names */
export function woff2Payload(b: Uint8Array): Woff2Payload | null {
  if (b.length < 48) return null
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  if (dv.getUint32(0) !== 0x774f4632) return null
  const flavor = dv.getUint32(4)
  const numTables = dv.getUint16(12)
  const compressed = dv.getUint32(20)
  let i = 48
  const base128 = () => {
    let v = 0
    for (let k = 0; k < 5; k++) {
      const c = b[i++]
      if (c === undefined) return null
      v = v * 128 + (c & 0x7f)
      if (!(c & 0x80)) return v
    }
    return null
  }
  const tables: Woff2Table[] = []
  for (let k = 0; k < numTables; k++) {
    const flags = b[i++]
    if (flags === undefined) return null
    const known = flags & 0x3f
    let tag: string
    if (known === 63) {
      tag = String.fromCharCode(b[i]!, b[i + 1]!, b[i + 2]!, b[i + 3]!)
      i += 4
    } else tag = TAGS[known]!
    const version = flags >> 6
    const length = base128()
    if (length === null) return null
    // (glyf and loca: version 0 is their transform, 3 none; every other table's none is 0, and hmtx's transform 1)
    const glyf = tag === 'glyf' || tag === 'loca'
    const transformed = glyf ? version === 0 : version !== 0
    if (transformed && !glyf && !(tag === 'hmtx' && version === 1)) return null
    const size = transformed ? base128() : length
    if (size === null) return null
    tables.push({ tag, length, transformed, size })
  }
  if (i + compressed > b.length) return null
  return { flavor, tables, stream: b.subarray(i, i + compressed) }
}

const u16 = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!
const u32 = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!

/** a reader of one of the transformed glyf's streams */
class Stream {
  at = 0
  readonly b: Uint8Array
  constructor(b: Uint8Array) {
    this.b = b
  }
  byte() {
    if (this.at >= this.b.length) throw new Error('a transformed glyf stream read past its end')
    return this.b[this.at++]!
  }
  u16() {
    return (this.byte() << 8) | this.byte()
  }
  i16() {
    return (this.u16() << 16) >> 16
  }
  /** a 255UInt16 (WOFF2 §6.1.1) */
  u255() {
    const c = this.byte()
    return c === 253 ? this.u16() : c === 254 ? this.byte() + 506 : c === 255 ? this.byte() + 253 : c
  }
  take(n: number) {
    if (this.at + n > this.b.length) throw new Error('a transformed glyf stream read past its end')
    const out = this.b.subarray(this.at, this.at + n)
    this.at += n
    return out
  }
}

/** a transformed glyf (WOFF2 §5.1) as glyf's glyphs, and each glyph's xMin (for a transformed hmtx), the number of glyphs */
function glyfOf(t: Uint8Array): { glyphs: Uint8Array[]; xMins: number[] } {
  const numGlyphs = u16(t, 4)
  const sizes = [0, 1, 2, 3, 4, 5, 6].map((k) => u32(t, 8 + 4 * k))
  let at = 36
  const parts = sizes.map((n) => {
    const s = t.subarray(at, at + n)
    at += n
    return s
  })
  const overlap = u16(t, 2) & 1 ? t.subarray(at, at + ((numGlyphs + 7) >> 3)) : null
  const nContours = new Stream(parts[0]!),
    nPoints = new Stream(parts[1]!),
    flagS = new Stream(parts[2]!),
    glyphS = new Stream(parts[3]!),
    compS = new Stream(parts[4]!),
    bboxAll = parts[5]!,
    instrS = new Stream(parts[6]!)
  const bitmapSize = ((numGlyphs + 31) >> 5) << 2
  const bboxS = new Stream(bboxAll.subarray(bitmapSize))
  const hasBox = (g: number) => !!(bboxAll[g >> 3]! & (0x80 >> (g & 7)))
  const glyphs: Uint8Array[] = []
  const xMins: number[] = []
  for (let g = 0; g < numGlyphs; g++) {
    const n = nContours.i16()
    if (n === 0) {
      glyphs.push(new Uint8Array(0))
      xMins.push(0)
      continue
    }
    const out: number[] = []
    const put16 = (v: number) => out.push((v >> 8) & 255, v & 255)
    let box: number[] | null = hasBox(g) ? [bboxS.i16(), bboxS.i16(), bboxS.i16(), bboxS.i16()] : null
    if (n < 0) {
      // a composite: its components as glyf holds them, copied from the composite stream; its box from the box stream
      if (!box) throw new Error(`composite glyph ${g} without its box`)
      const start = compS.at
      let flags: number
      let instr = false
      do {
        flags = compS.u16()
        compS.take(2)
        compS.take(flags & 1 ? 4 : 2)
        if (flags & 8) compS.take(2)
        else if (flags & 0x40) compS.take(4)
        else if (flags & 0x80) compS.take(8)
        if (flags & 0x100) instr = true
      } while (flags & 0x20)
      put16(n)
      for (const v of box) put16(v)
      out.push(...compS.b.subarray(start, compS.at))
      if (instr) {
        const len = glyphS.u255()
        put16(len)
        out.push(...instrS.take(len))
      }
    } else {
      // a simple glyph: its contours' ends, its points by their triplets, its instructions
      const ends: number[] = []
      let end = -1
      for (let c = 0; c < n; c++) {
        end += nPoints.u255()
        ends.push(end)
      }
      const count = end + 1
      const xs: number[] = [],
        ys: number[] = [],
        on: boolean[] = []
      let x = 0,
        y = 0
      for (let p = 0; p < count; p++) {
        const raw = flagS.byte()
        on.push(!(raw & 0x80))
        const f = raw & 0x7f
        const sign = (bit: number, v: number) => (bit & 1 ? v : -v)
        let dx: number, dy: number
        if (f < 10) {
          dx = 0
          dy = sign(f, ((f & 14) << 7) + glyphS.byte())
        } else if (f < 20) {
          dx = sign(f, (((f - 10) & 14) << 7) + glyphS.byte())
          dy = 0
        } else if (f < 84) {
          const b0 = f - 20,
            b1 = glyphS.byte()
          dx = sign(f, 1 + (b0 & 0x30) + (b1 >> 4))
          dy = sign(f >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f))
        } else if (f < 120) {
          const b0 = f - 84
          dx = sign(f, 1 + (Math.floor(b0 / 12) << 8) + glyphS.byte())
          dy = sign(f >> 1, 1 + (((b0 % 12) >> 2) << 8) + glyphS.byte())
        } else if (f < 124) {
          const a = glyphS.byte(),
            b2 = glyphS.byte(),
            c2 = glyphS.byte()
          dx = sign(f, (a << 4) + (b2 >> 4))
          dy = sign(f >> 1, ((b2 & 0x0f) << 8) + c2)
        } else {
          const a = glyphS.u16(),
            b2 = glyphS.u16()
          dx = sign(f, a)
          dy = sign(f >> 1, b2)
        }
        x += dx
        y += dy
        xs.push(x)
        ys.push(y)
      }
      const len = glyphS.u255()
      const instructions = instrS.take(len)
      box ??= [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
      put16(n)
      for (const v of box) put16(v)
      for (const e of ends) put16(e)
      put16(len)
      out.push(...instructions)
      // (each point's flag: on curve, overlap on the first where the bitmap says so; x and y as two-byte deltas)
      const lap = overlap && overlap[g >> 3]! & (0x80 >> (g & 7)) ? 0x40 : 0
      for (let p = 0; p < count; p++) out.push((on[p] ? 1 : 0) | (p === 0 ? lap : 0))
      for (let p = 0; p < count; p++) put16(xs[p]! - (p ? xs[p - 1]! : 0))
      for (let p = 0; p < count; p++) put16(ys[p]! - (p ? ys[p - 1]! : 0))
    }
    xMins.push(box[0]!)
    glyphs.push(new Uint8Array(out))
  }
  return { glyphs, xMins }
}

/** a transformed hmtx (WOFF2 §5.4) as hmtx: its advances, its side bearings stated or the glyphs' xMin */
function hmtxOf(t: Uint8Array, numberOfHMetrics: number, xMins: number[]): Uint8Array {
  const flags = t[0]!
  const s = new Stream(t.subarray(1))
  const n = xMins.length
  const adv = Array.from({ length: numberOfHMetrics }, () => s.u16())
  const lsb = flags & 1 ? xMins.slice(0, numberOfHMetrics) : Array.from({ length: numberOfHMetrics }, () => s.i16())
  const rest = flags & 2 ? xMins.slice(numberOfHMetrics) : Array.from({ length: n - numberOfHMetrics }, () => s.i16())
  const out = new Uint8Array(4 * numberOfHMetrics + 2 * (n - numberOfHMetrics))
  const dv = new DataView(out.buffer)
  for (let k = 0; k < numberOfHMetrics; k++) {
    dv.setUint16(4 * k, adv[k]!)
    dv.setInt16(4 * k + 2, lsb[k]!)
  }
  rest.forEach((v, k) => {
    dv.setInt16(4 * numberOfHMetrics + 2 * k, v)
  })
  return out
}

/** the sfnt of a payload whose stream is `data`, decoded: its tables sorted by tag, each 4-byte aligned with its checksum */
export function sfntOfWoff2(p: Woff2Payload, data: Uint8Array): Uint8Array {
  let off = 0
  const raw = new Map<string, { t: Woff2Table; data: Uint8Array }>()
  for (const t of p.tables) {
    raw.set(t.tag, { t, data: data.subarray(off, off + t.size) })
    off += t.size
  }
  if (off !== data.length) throw new Error(`a WOFF2 whose tables take ${off} bytes of the ${data.length} decoded`)
  const tables = new Map<string, Uint8Array>()
  for (const [tag, r] of raw) if (!r.t.transformed) tables.set(tag, r.data)
  const glyf = raw.get('glyf')
  let xMins: number[] = []
  if (glyf?.t.transformed) {
    const g = glyfOf(glyf.data)
    xMins = g.xMins
    // (each glyph 4-byte aligned; loca long)
    const size = g.glyphs.reduce((n, b) => n + ((b.length + 3) & ~3), 0)
    const gl = new Uint8Array(size)
    const loca = new Uint8Array(4 * (g.glyphs.length + 1))
    const lv = new DataView(loca.buffer)
    let at = 0
    g.glyphs.forEach((b, k) => {
      lv.setUint32(4 * k, at)
      gl.set(b, at)
      at += (b.length + 3) & ~3
    })
    lv.setUint32(4 * g.glyphs.length, at)
    tables.set('glyf', gl)
    tables.set('loca', loca)
    const head = tables.get('head')
    if (head) {
      const h = head.slice()
      h[50] = 0
      h[51] = 1
      tables.set('head', h)
    }
  }
  const hmtx = raw.get('hmtx')
  if (hmtx?.t.transformed) {
    const hhea = tables.get('hhea')
    if (!hhea || !xMins.length) throw new Error('a transformed hmtx without its glyf')
    tables.set('hmtx', hmtxOf(hmtx.data, u16(hhea, 34), xMins))
  }
  return writeSfnt(p.flavor, tables)
}
