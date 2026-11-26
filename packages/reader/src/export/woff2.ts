// A served slice (WOFF2, https://www.w3.org/TR/WOFF2/) back to the sfnt it was made of, for the export's fonts. In two steps,
// so that one decoder's call takes every slice of a file: `woff2Payload` reads the table directory and gives the brotli
// stream; `sfntOfWoff2` lays the decoded tables out as an sfnt again. Only tables stored with no transform are rebuilt (a
// CFF-flavoured slice, 3,705 of the 3,839 served, holds none transformed); a slice whose glyf and loca, or hmtx, are stored
// transformed is refused (null), and the export draws none of its glyphs (counted).

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

/** a WOFF2's flavour, its tables in directory order (tag, length) and its brotli stream */
export interface Woff2Payload {
  flavor: number
  tables: { tag: string; length: number }[]
  stream: Uint8Array
}

/** the slice's directory and brotli stream; null where it is no WOFF2 or a table is stored transformed */
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
  const tables: Woff2Payload['tables'] = []
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
    // (glyf and loca: version 3 is their null transform; every other table's is version 0)
    const transformed = tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0
    if (transformed) return null
    tables.push({ tag, length })
  }
  if (i + compressed > b.length) return null
  return { flavor, tables, stream: b.subarray(i, i + compressed) }
}

/** the sfnt of a payload whose stream is `data`, decoded: its tables sorted by tag, each 4-byte aligned with its checksum */
export function sfntOfWoff2(p: Woff2Payload, data: Uint8Array): Uint8Array {
  let off = 0
  const tables = p.tables.map((t) => {
    const d = data.subarray(off, off + t.length)
    off += t.length
    return { ...t, data: d }
  })
  if (off !== data.length) throw new Error(`a WOFF2 whose tables take ${off} bytes of the ${data.length} decoded`)
  tables.sort((x, y) => (x.tag < y.tag ? -1 : x.tag > y.tag ? 1 : 0))
  const head = 12 + 16 * tables.length
  let size = head
  for (const t of tables) size += (t.length + 3) & ~3
  const out = new Uint8Array(size)
  const ov = new DataView(out.buffer)
  ov.setUint32(0, p.flavor)
  ov.setUint16(4, tables.length)
  let es = 0
  while (1 << (es + 1) <= tables.length) es++
  ov.setUint16(6, 16 * (1 << es))
  ov.setUint16(8, es)
  ov.setUint16(10, 16 * tables.length - 16 * (1 << es))
  let pos = head
  tables.forEach((t, k) => {
    const r = 12 + 16 * k
    for (let c = 0; c < 4; c++) out[r + c] = t.tag.charCodeAt(c)
    out.set(t.data, pos)
    let sum = 0
    for (let q = 0; q < ((t.length + 3) & ~3); q += 4) sum = (sum + ov.getUint32(pos + q)) >>> 0
    ov.setUint32(r + 4, sum)
    ov.setUint32(r + 8, pos)
    ov.setUint32(r + 12, t.length)
    pos += (t.length + 3) & ~3
  })
  return out
}
