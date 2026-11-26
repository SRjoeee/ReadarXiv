// A TrueType-flavoured slice (its glyf and loca rebuilt from WOFF2's transform, woff2.ts) subset for a file that draws a few of
// its glyphs, as a PDF's FontFile2 needs it (ISO 32000-1 §9.9: head, hhea, loca, maxp, cvt, prep, glyf, hmtx, fpgm): every
// glyph not drawn, and not a component of one drawn, made empty (no outline in glyf, its loca entry repeated), every glyph id
// kept, so that a CIDFontType2 with an identity CIDToGIDMap draws the code it is shown; loca written long.

const u16 = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!
const u32 = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!

/** the sfnt's tables by tag */
export function tablesOf(b: Uint8Array): Map<string, Uint8Array> {
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

/** each glyph's outline in glyf, by loca (the head's indexToLocFormat) */
export function glyphsOf(t: Map<string, Uint8Array>): Uint8Array[] {
  const head = t.get('head'),
    loca = t.get('loca'),
    glyf = t.get('glyf'),
    maxp = t.get('maxp')
  if (!head || !loca || !glyf || !maxp) throw new Error('a TrueType font without head, loca, glyf or maxp')
  const n = u16(maxp, 4)
  const long = u16(head, 50) === 1
  const at = (g: number) => (long ? u32(loca, 4 * g) : 2 * u16(loca, 2 * g))
  return Array.from({ length: n }, (_, g) => glyf.subarray(at(g), Math.max(at(g), at(g + 1))))
}

/** a composite glyph's components' glyph ids */
function componentsOf(g: Uint8Array): number[] {
  if (g.length < 10 || (((g[0]! << 8) | g[1]!) << 16) >> 16 >= 0) return []
  const out: number[] = []
  let i = 10
  let flags: number
  do {
    flags = u16(g, i)
    out.push(u16(g, i + 2))
    i += 4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 0x40 ? 4 : flags & 0x80 ? 8 : 0)
  } while (flags & 0x20 && i < g.length)
  return out
}

/** `sfnt` with only the glyphs of `keep` (glyph 0, and every component they hold) */
export function subsetTrueType(sfnt: Uint8Array, keep: ReadonlySet<number>): Uint8Array {
  const t = tablesOf(sfnt)
  const glyphs = glyphsOf(t)
  const kept = new Set<number>()
  const visit = (g: number) => {
    if (kept.has(g) || !glyphs[g]) return
    kept.add(g)
    for (const c of componentsOf(glyphs[g]!)) visit(c)
  }
  for (const g of [0, ...keep]) visit(g)
  const size = glyphs.reduce((n, b, g) => n + (kept.has(g) ? (b.length + 3) & ~3 : 0), 0)
  const glyf = new Uint8Array(size)
  const loca = new Uint8Array(4 * (glyphs.length + 1))
  const lv = new DataView(loca.buffer)
  let at = 0
  glyphs.forEach((b, g) => {
    lv.setUint32(4 * g, at)
    if (!kept.has(g)) return
    glyf.set(b, at)
    at += (b.length + 3) & ~3
  })
  lv.setUint32(4 * glyphs.length, at)
  const head = t.get('head')!.slice()
  head[50] = 0
  head[51] = 1
  // (the checksum adjustment of a font written anew: no viewer reads it, zero)
  head.fill(0, 8, 12)
  const tables = new Map<string, Uint8Array>([
    ['head', head],
    ['loca', loca],
    ['glyf', glyf],
  ])
  for (const tag of ['hhea', 'maxp', 'hmtx', 'cvt ', 'fpgm', 'prep']) {
    const d = t.get(tag)
    if (d) tables.set(tag, d)
  }
  return writeSfnt(0x00010000, tables)
}

/** an sfnt of `tables`, sorted by tag, each 4-byte aligned with its checksum */
export function writeSfnt(flavor: number, tables: Map<string, Uint8Array>): Uint8Array {
  const sorted = [...tables].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const dir = 12 + 16 * sorted.length
  let size = dir
  for (const [, d] of sorted) size += (d.length + 3) & ~3
  const out = new Uint8Array(size)
  const ov = new DataView(out.buffer)
  ov.setUint32(0, flavor)
  ov.setUint16(4, sorted.length)
  let es = 0
  while (1 << (es + 1) <= sorted.length) es++
  ov.setUint16(6, 16 * (1 << es))
  ov.setUint16(8, es)
  ov.setUint16(10, 16 * sorted.length - 16 * (1 << es))
  let pos = dir
  sorted.forEach(([tag, d], k) => {
    const r = 12 + 16 * k
    for (let c = 0; c < 4; c++) out[r + c] = tag.charCodeAt(c)
    out.set(d, pos)
    let sum = 0
    for (let q = 0; q < ((d.length + 3) & ~3); q += 4) sum = (sum + ov.getUint32(pos + q)) >>> 0
    ov.setUint32(r + 4, sum)
    ov.setUint32(r + 8, pos)
    ov.setUint32(r + 12, d.length)
    pos += (d.length + 3) & ~3
  })
  return out
}
