// A served slice's sfnt (a CFF-flavoured OpenType) read for what a PDF font needs: its cmap, advances, units per em, metrics,
// and its CFF's charset (the CIDs a CID-keyed CFF names its glyphs by); and written as a Type0 font (Identity-H, a CIDFontType0
// over the CFF subset to the glyphs drawn, FontFile3 /CIDFontType0C) with a ToUnicode map of exactly the glyphs drawn, so that
// the text a reader selects, searches and copies is the translation's own characters (ISO 32000-1 §9.7, §9.10.3).
import { readCff } from './cff.ts'

export interface SfntFont {
  key: string
  upem: number
  /** code point -> glyph id */
  cmap: Map<number, number>
  advance(gid: number): number
  /** glyph id -> CID (a CID-keyed CFF's charset; the glyph id otherwise, as a CIDFontType0C reads a name-keyed CFF) */
  cid(gid: number): number
  cff: Uint8Array
  cidKeyed: boolean
  ascent: number
  descent: number
  capHeight: number
  bbox: [number, number, number, number]
  italicAngle: number
  /** the font's name in the file, of the slice's key */
  name: string
}

const u16 = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!
const i16 = (b: Uint8Array, i: number) => {
  const v = u16(b, i)
  return v & 0x8000 ? v - 0x10000 : v
}
const u32 = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!

function tablesOf(b: Uint8Array): Map<string, Uint8Array> {
  const n = u16(b, 4)
  const out = new Map<string, Uint8Array>()
  for (let k = 0; k < n; k++) {
    const r = 12 + 16 * k
    const tag = String.fromCharCode(b[r]!, b[r + 1]!, b[r + 2]!, b[r + 3]!)
    const off = u32(b, r + 8),
      len = u32(b, r + 12)
    if (off + len <= b.length) out.set(tag, b.subarray(off, off + len))
  }
  return out
}

/** the cmap's Unicode subtable (format 12 over 4), code point -> glyph */
function cmapOf(t: Uint8Array): Map<number, number> {
  const n = u16(t, 2)
  let best = -1,
    bestFmt = 0
  for (let k = 0; k < n; k++) {
    const pid = u16(t, 4 + 8 * k),
      eid = u16(t, 6 + 8 * k)
    const off = u32(t, 8 + 8 * k)
    const fmt = u16(t, off)
    if (!(pid === 0 || (pid === 3 && (eid === 1 || eid === 10)))) continue
    if (fmt === 12 && bestFmt !== 12) {
      best = off
      bestFmt = 12
    } else if (fmt === 4 && bestFmt === 0) {
      best = off
      bestFmt = 4
    }
  }
  const m = new Map<number, number>()
  if (best < 0) return m
  if (bestFmt === 4) {
    const segX2 = u16(t, best + 6)
    const ends = best + 14,
      starts = ends + segX2 + 2,
      deltas = starts + segX2,
      ranges = deltas + segX2
    for (let s = 0; s < segX2 / 2; s++) {
      const end = u16(t, ends + 2 * s),
        start = u16(t, starts + 2 * s)
      const delta = i16(t, deltas + 2 * s),
        ro = u16(t, ranges + 2 * s)
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g: number
        if (ro === 0) g = (c + delta) & 0xffff
        else {
          g = u16(t, ranges + 2 * s + ro + 2 * (c - start))
          if (g) g = (g + delta) & 0xffff
        }
        if (g) m.set(c, g)
      }
    }
  } else {
    const groups = u32(t, best + 12)
    for (let k = 0; k < groups; k++) {
      const r = best + 16 + 12 * k
      const a = u32(t, r),
        z = u32(t, r + 4),
        g0 = u32(t, r + 8)
      for (let c = a; c <= z; c++) m.set(c, g0 + c - a)
    }
  }
  return m
}

/** a slice's sfnt read; null where it is no CFF-flavoured font, or its CFF cannot be read */
export function readSfnt(key: string, b: Uint8Array): SfntFont | null {
  const t = tablesOf(b)
  const cff = t.get('CFF ')
  const head = t.get('head'),
    hhea = t.get('hhea'),
    hmtx = t.get('hmtx'),
    cmap = t.get('cmap')
  if (!cff || !head || !hhea || !hmtx || !cmap) return null
  let cids: Uint16Array
  let cidKeyed: boolean
  try {
    const c = readCff(cff)
    cids = c.cids
    cidKeyed = c.cidKeyed
  } catch {
    return null
  }
  const upem = u16(head, 18)
  const nh = u16(hhea, 34)
  const os2 = t.get('OS/2')
  const post = t.get('post')
  return {
    key,
    upem,
    cmap: cmapOf(cmap),
    advance: (g) => u16(hmtx, 4 * Math.min(g, nh - 1)),
    cid: (g) => cids[g] ?? g,
    cff,
    cidKeyed,
    ascent: i16(hhea, 4),
    descent: i16(hhea, 6),
    capHeight: os2 && u16(os2, 0) >= 2 && os2.length >= 90 ? i16(os2, 88) : i16(hhea, 4),
    bbox: [i16(head, 36), i16(head, 38), i16(head, 40), i16(head, 42)],
    italicAngle: post ? i16(post, 4) + u16(post, 6) / 65536 : 0,
    name: `AXT${key.replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 60),
  }
}

const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, '0')
const utf16hex = (s: string) => {
  let o = ''
  for (let i = 0; i < s.length; i++) o += hex4(s.charCodeAt(i))
  return o
}

/** the object numbers a font's five objects take */
export interface FontNumbers {
  type0: number
  cidFont: number
  desc: number
  file: number
  toUni: number
}

/** a font's objects for the CIDs drawn (`used`: CID -> [glyph id, its text]): its Type0, CIDFont, descriptor (their bodies)
 *  and its ToUnicode CMap's text; the font file's bytes are the caller's (the CFF subset) */
export function fontBodies(
  f: SfntFont,
  used: ReadonlyMap<number, readonly [gid: number, text: string]>,
  n: FontNumbers,
): { type0: string; cidFont: string; desc: string; toUnicode: string } {
  const k = 1000 / f.upem
  const cids = [...used.keys()].sort((a, b) => a - b)
  const w = cids.map((c) => `${c} [${Math.round(f.advance(used.get(c)![0]) * k * 100) / 100}]`).join(' ')
  // (a subset's tag: six capitals, ISO 32000-1 §9.6.4, the same for the same font)
  const base = `AXTEXP+${f.name}`
  const lines: string[] = []
  for (let i = 0; i < cids.length; i += 100) {
    const part = cids.slice(i, i + 100)
    lines.push(`${part.length} beginbfchar`)
    for (const c of part) lines.push(`<${hex4(c)}> <${utf16hex(used.get(c)![1])}>`)
    lines.push('endbfchar')
  }
  const toUnicode = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${lines.join('\n')}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n`
  const bb = f.bbox.map((v) => Math.round(v * k))
  return {
    type0: `<< /Type /Font /Subtype /Type0 /BaseFont /${base} /Encoding /Identity-H /DescendantFonts [${n.cidFont} 0 R] /ToUnicode ${n.toUni} 0 R >>`,
    cidFont: `<< /Type /Font /Subtype /CIDFontType0 /BaseFont /${base} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${n.desc} 0 R /DW 1000 /W [${w}] >>`,
    desc: `<< /Type /FontDescriptor /FontName /${base} /Flags 4 /FontBBox [${bb.join(' ')}] /ItalicAngle ${Math.round(f.italicAngle)} /Ascent ${Math.round(f.ascent * k)} /Descent ${Math.round(f.descent * k)} /CapHeight ${Math.round(f.capHeight * k)} /StemV 80 /FontFile3 ${n.file} 0 R >>`,
    toUnicode,
  }
}
