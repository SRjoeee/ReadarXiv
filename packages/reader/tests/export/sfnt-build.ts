// OpenType fonts of our own for the export's tests: a CFF-flavoured sfnt (head, hhea, hmtx, maxp, cmap format 4, CFF ) over
// a CFF of cff-build.ts, and its WOFF2 (every table stored with no transform, the table data compressed by the brotli given).
import { buildCff, type CffParts } from './cff-build.ts'

const be16 = (v: number) => [(v >> 8) & 255, v & 255]
const be32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]

/** a cmap of one format 4 subtable (Windows Unicode BMP) mapping each code point to its glyph */
function cmap(map: [cp: number, gid: number][]): Uint8Array {
  const sorted = [...map].sort((a, b) => a[0] - b[0])
  const segs = [
    ...sorted.map(([cp, g]) => ({ start: cp, end: cp, delta: (g - cp) & 0xffff })),
    { start: 0xffff, end: 0xffff, delta: 1 },
  ]
  const n = segs.length
  const sub = [
    ...be16(4),
    ...be16(16 + 8 * n),
    ...be16(0),
    ...be16(2 * n),
    ...be16(0),
    ...be16(0),
    ...be16(0),
    ...segs.flatMap((s) => be16(s.end)),
    ...be16(0),
    ...segs.flatMap((s) => be16(s.start)),
    ...segs.flatMap((s) => be16(s.delta)),
    ...segs.flatMap(() => be16(0)),
  ]
  return new Uint8Array([...be16(0), ...be16(1), ...be16(3), ...be16(1), ...be32(12), ...sub])
}

export interface SfntParts extends CffParts {
  /** code point -> glyph */
  cmap: [cp: number, gid: number][]
  /** each glyph's advance, font units */
  advances: number[]
  upem?: number
  /** further tables, by tag (a GSUB of the test's own) */
  extra?: Record<string, Uint8Array>
}

export function buildSfnt(p: SfntParts): { sfnt: Uint8Array; tables: Map<string, Uint8Array> } {
  const upem = p.upem ?? 1000
  const n = p.glyphs.length
  const head = new Uint8Array(54)
  head.set([0, 1, 0, 0], 0)
  head.set(be16(upem), 18)
  head.set([...be16(0), ...be16(-200 & 0xffff), ...be16(1000), ...be16(900)], 36)
  const hhea = new Uint8Array(36)
  hhea.set([0, 1, 0, 0, ...be16(880), ...be16(-120 & 0xffff)], 0)
  hhea.set(be16(n), 34)
  const hmtx = new Uint8Array(p.advances.flatMap((a) => [...be16(a), 0, 0]))
  const maxp = new Uint8Array([0, 0, 0x50, 0, ...be16(n)])
  const tables = new Map<string, Uint8Array>([
    ['CFF ', buildCff(p)],
    ['cmap', cmap(p.cmap)],
    ['head', head],
    ['hhea', hhea],
    ['hmtx', hmtx],
    ['maxp', maxp],
    ...Object.entries(p.extra ?? {}),
  ])
  const tags = [...tables.keys()].sort()
  const dir = 12 + 16 * tags.length
  let at = dir
  const offs: number[] = []
  for (const t of tags) {
    offs.push(at)
    at += (tables.get(t)!.length + 3) & ~3
  }
  const out = new Uint8Array(at)
  out.set([...be32(0x4f54544f), ...be16(tags.length), 0, 0, 0, 0, 0, 0], 0)
  tags.forEach((t, k) => {
    const r = 12 + 16 * k
    out.set(
      [...t].map((c) => c.charCodeAt(0)),
      r,
    )
    out.set([...be32(0), ...be32(offs[k]!), ...be32(tables.get(t)!.length)], r + 4)
    out.set(tables.get(t)!, offs[k]!)
  })
  return { sfnt: out, tables }
}

/** the known table tags of WOFF2's directory (its flags' low six bits) */
const KNOWN = [
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
]
const base128 = (v: number) => {
  const out: number[] = []
  do {
    out.unshift(v & 0x7f)
    v = Math.floor(v / 128)
  } while (v > 0)
  return out.map((b, k) => (k < out.length - 1 ? b | 0x80 : b))
}

/** a WOFF2 of `tables`, each stored with no transform (hmtx: transform version 0, its null one), `compress` the brotli */
export function buildWoff2(tables: Map<string, Uint8Array>, compress: (b: Uint8Array) => Uint8Array): Uint8Array {
  const tags = [...tables.keys()]
  const dir: number[] = []
  for (const t of tags) {
    const known = KNOWN.indexOf(t)
    dir.push(known >= 0 ? known : 63)
    if (known < 0) dir.push(...[...t].map((c) => c.charCodeAt(0)))
    dir.push(...base128(tables.get(t)!.length))
  }
  const data = new Uint8Array(tags.reduce((n, t) => n + tables.get(t)!.length, 0))
  let at = 0
  for (const t of tags) {
    data.set(tables.get(t)!, at)
    at += tables.get(t)!.length
  }
  const z = compress(data)
  const total = 48 + dir.length + z.length
  const out = new Uint8Array(total)
  out.set(
    [
      ...be32(0x774f4632),
      ...be32(0x4f54544f),
      ...be32(total),
      ...be16(tags.length),
      0,
      0,
      ...be32(0),
      ...be32(z.length),
    ],
    0,
  )
  out.set(dir, 48)
  out.set(z, 48 + dir.length)
  return out
}

/** a glyph of a TrueType font of ours: contours of points [x, y, on curve], or components [glyph, dx, dy] */
export type TtGlyph = { contours: [number, number, boolean][][] } | { components: [number, number, number][] } | null

/** a TrueType-flavoured WOFF2 of `glyphs`, its glyf and loca stored transformed (WOFF2 §5.1: every point's delta in four bytes,
 *  a composite's box in the box stream), head, hhea, maxp, hmtx and cmap stored as they are */
export function buildTrueTypeWoff2(
  p: { glyphs: TtGlyph[]; cmap: [cp: number, gid: number][]; advances: number[] },
  compress: (b: Uint8Array) => Uint8Array,
): Uint8Array {
  const n = p.glyphs.length
  const { tables } = buildSfnt({ glyphs: [], gsubrs: [], lsubrs: [[]], cmap: p.cmap, advances: p.advances })
  tables.delete('CFF ')
  const maxp = new Uint8Array([0, 0, 0x50, 0, ...be16(n)])
  tables.set('maxp', maxp)
  const hhea = tables.get('hhea')!.slice()
  hhea.set(be16(n), 34)
  tables.set('hhea', hhea)
  const nContour: number[] = [],
    nPoints: number[] = [],
    flags: number[] = [],
    glyph: number[] = [],
    composite: number[] = [],
    boxes: number[] = []
  const bitmap = new Uint8Array(((n + 31) >> 5) << 2)
  p.glyphs.forEach((g, k) => {
    if (!g) {
      nContour.push(...be16(0))
      return
    }
    if ('contours' in g) {
      nContour.push(...be16(g.contours.length))
      let x = 0,
        y = 0
      for (const c of g.contours) {
        nPoints.push(c.length)
        for (const [px, py, on] of c) {
          const dx = px - x,
            dy = py - y
          flags.push((on ? 0 : 0x80) | (124 + (dx >= 0 ? 1 : 0) + (dy >= 0 ? 2 : 0)))
          glyph.push(...be16(Math.abs(dx)), ...be16(Math.abs(dy)))
          x = px
          y = py
        }
      }
      glyph.push(0)
    } else {
      nContour.push(...be16(-1 & 0xffff))
      g.components.forEach(([gid, dx, dy], i) => {
        const more = i < g.components.length - 1 ? 0x20 : 0
        composite.push(...be16(0x0001 | 0x0002 | more), ...be16(gid), ...be16(dx & 0xffff), ...be16(dy & 0xffff))
      })
      bitmap[k >> 3]! |= 0x80 >> (k & 7)
      boxes.push(...be16(0), ...be16(0), ...be16(1000), ...be16(1000))
    }
  })
  const streams = [nContour, nPoints, flags, glyph, composite, [...bitmap, ...boxes], []]
  const glyf = new Uint8Array([
    ...be16(0),
    ...be16(0),
    ...be16(n),
    ...be16(1),
    ...streams.flatMap((s) => be32(s.length)),
    ...streams.flat(),
  ])
  const order: [string, Uint8Array, number, number | null][] = [
    ...[...tables].map(([t, d]): [string, Uint8Array, number, number | null] => [t, d, KNOWN.indexOf(t), null]),
    ['glyf', glyf, 10, glyf.length],
    ['loca', new Uint8Array(0), 11, 0],
  ]
  const dir: number[] = []
  for (const [t, d, known, transformLength] of order) {
    dir.push(known >= 0 ? known : 63)
    if (known < 0) dir.push(...[...t].map((c) => c.charCodeAt(0)))
    dir.push(...base128(t === 'loca' ? 4 * (n + 1) : d.length))
    if (transformLength !== null) dir.push(...base128(transformLength))
  }
  const data = new Uint8Array(order.reduce((m, [, d]) => m + d.length, 0))
  let at = 0
  for (const [, d] of order) {
    data.set(d, at)
    at += d.length
  }
  const z = compress(data)
  const total = 48 + dir.length + z.length
  const out = new Uint8Array(total)
  out.set(
    [
      ...be32(0x774f4632),
      ...be32(0x00010000),
      ...be32(total),
      ...be16(order.length),
      0,
      0,
      ...be32(0),
      ...be32(z.length),
    ],
    0,
  )
  out.set(dir, 48)
  out.set(z, 48 + dir.length)
  return out
}
