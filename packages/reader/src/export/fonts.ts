// A served slice's sfnt read for what a PDF font needs: its cmap, advances, units per em, metrics, and for a CFF-flavoured one
// its CFF's charset (the CIDs a CID-keyed CFF names its glyphs by); and written as a Type0 font (Identity-H) with a ToUnicode
// map of exactly the glyphs drawn, so that the text a reader selects, searches and copies is the translation's own characters
// (ISO 32000-1 §9.7, §9.10.3): a CIDFontType0 over the CFF subset to the glyphs drawn (FontFile3 /CIDFontType0C), or for a
// TrueType-flavoured one a CIDFontType2 over the font subset (FontFile2), its CIDs its glyph ids (CIDToGIDMap /Identity).
import { readCff, subsetCff } from './cff.ts'
import { glyphsOf, subsetTrueType, tablesOf } from './ttf.ts'

export interface SfntFont {
  key: string
  upem: number
  /** code point -> glyph id */
  cmap: Map<number, number>
  advance(gid: number): number
  /** glyph id -> CID (a CID-keyed CFF's charset; the glyph id otherwise, as a CIDFontType0C reads a name-keyed CFF) */
  cid(gid: number): number
  /** glyph id -> its small capital: what the face's smcp feature substitutes (GSUB), as the reader's class draws it */
  smcp: Map<number, number>
  /** what its outlines are: a CFF table (`cff`), or glyf's (`ttf`: `sfnt` the whole font) */
  kind: 'cff' | 'ttf'
  cff: Uint8Array
  sfnt: Uint8Array
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
/**
 * A face's small capitals, glyph by glyph: every single substitution (GSUB lookup type 1, or one an extension lookup, type 7,
 * holds) of the lookups its feature records tagged `smcp` name, applied lookup after lookup in the list's order, the first
 * subtable that covers a glyph its own (OpenType GSUB §6.2) — what a browser substitutes for a run asked small capitals in the
 * face (the reader's class: font-variant-caps over the face's feature). The served slices keep the feature and the glyphs it
 * reaches (@readarxiv/text font-caps.ts). A table that reads past its end gives none.
 */
export function smcpOf(g: Uint8Array | undefined): Map<number, number> {
  const out = new Map<number, number>()
  if (!g) return out
  const r16 = (i: number) => {
    if (i < 0 || i + 2 > g.length) throw new RangeError('GSUB read past its end')
    return u16(g, i)
  }
  try {
    const fl = r16(6),
      ll = r16(8)
    const ids = new Set<number>()
    for (let i = 0, n = r16(fl); i < n; i++) {
      const rec = fl + 2 + 6 * i
      if (String.fromCharCode(g[rec]!, g[rec + 1]!, g[rec + 2]!, g[rec + 3]!) !== 'smcp') continue
      const f = fl + r16(rec + 4)
      for (let k = 0, m = r16(f + 2); k < m; k++) ids.add(r16(f + 4 + 2 * k))
    }
    const steps: Map<number, number>[] = []
    for (const id of [...ids].sort((a, b) => a - b)) {
      const step = new Map<number, number>()
      const l = ll + r16(ll + 2 + 2 * id)
      const type = r16(l)
      for (let s = 0, n = r16(l + 4); s < n; s++) {
        let st = l + r16(l + 6 + 2 * s)
        let t = type
        if (t === 7) {
          t = r16(st + 2)
          st += (r16(st + 4) << 16) + r16(st + 6)
        }
        if (t !== 1) continue
        const fmt = r16(st)
        const c = st + r16(st + 2)
        // (the coverage, glyph by its index: a list (format 1) or ranges (format 2))
        const covered: [number, number][] = []
        if (r16(c) === 1) for (let i = 0, n = r16(c + 2); i < n; i++) covered.push([r16(c + 4 + 2 * i), i])
        else
          for (let i = 0, n = r16(c + 2); i < n; i++) {
            const at = c + 4 + 6 * i
            const [a, z, first] = [r16(at), r16(at + 2), r16(at + 4)]
            for (let gid = a; gid <= z; gid++) covered.push([gid, first + gid - a])
          }
        for (const [gid, i] of covered)
          if (!step.has(gid)) step.set(gid, fmt === 1 ? (gid + r16(st + 4)) & 0xffff : r16(st + 6 + 2 * i))
      }
      steps.push(step)
    }
    const reached = new Set(steps.flatMap((m) => [...m.keys()]))
    for (const gid of reached) {
      let to = gid
      for (const m of steps) to = m.get(to) ?? to
      if (to !== gid) out.set(gid, to)
    }
  } catch {
    return new Map()
  }
  return out
}

export function readSfnt(key: string, b: Uint8Array): SfntFont | null {
  const t = tablesOf(b)
  const cff = t.get('CFF ')
  const head = t.get('head'),
    hhea = t.get('hhea'),
    hmtx = t.get('hmtx'),
    cmap = t.get('cmap')
  if (!head || !hhea || !hmtx || !cmap) return null
  let cids: Uint16Array | null = null
  let cidKeyed = false
  try {
    if (cff) {
      const c = readCff(cff)
      cids = c.cids
      cidKeyed = c.cidKeyed
    } else glyphsOf(t)
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
    smcp: smcpOf(t.get('GSUB')),
    advance: (g) => u16(hmtx, 4 * Math.min(g, nh - 1)),
    cid: (g) => cids?.[g] ?? g,
    kind: cff ? 'cff' : 'ttf',
    cff: cff ?? new Uint8Array(0),
    sfnt: b,
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
    cidFont: `<< /Type /Font /Subtype /CIDFontType${f.kind === 'ttf' ? '2' : '0'} /BaseFont /${base} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${n.desc} 0 R /DW 1000 /W [${w}]${f.kind === 'ttf' ? ' /CIDToGIDMap /Identity' : ''} >>`,
    desc: `<< /Type /FontDescriptor /FontName /${base} /Flags 4 /FontBBox [${bb.join(' ')}] /ItalicAngle ${Math.round(f.italicAngle)} /Ascent ${Math.round(f.ascent * k)} /Descent ${Math.round(f.descent * k)} /CapHeight ${Math.round(f.capHeight * k)} /StemV 80 /FontFile${f.kind === 'ttf' ? '2' : '3'} ${n.file} 0 R >>`,
    toUnicode,
  }
}

/** the font file of `f` for the glyphs `gids` drawn: its bytes, the stream dictionary's entries of its kind, and whether the
 *  subset was refused (the font embedded whole) */
export function fontFileOf(
  f: SfntFont,
  gids: ReadonlySet<number>,
): { bytes: Uint8Array; dict: string; whole: boolean } {
  if (f.kind === 'ttf') {
    const bytes = subsetTrueType(f.sfnt, gids)
    return { bytes, dict: ` /Length1 ${bytes.length}`, whole: false }
  }
  const sub = subsetCff(f.cff, gids)
  return { bytes: sub ?? f.cff, dict: ' /Subtype /CIDFontType0C', whole: !sub }
}
