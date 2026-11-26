// A WOFF2 of a TrueType font, made here for the stand-in of our server (v2-api.mjs): its tables untransformed (glyf and loca
// at WOFF2's null transform, 3; every other table at 0) and brotli-compressed in one stream, as WOFF2 2.0 §5 lays them (the
// tables one after another, unpadded, loca right after glyf; the file padded to four bytes). Our served slices are WOFF2, and
// the PDF download decodes their brotli in PDF.js's worker (packages/reader/src/export/brotli.ts): a stand-in serving a bare
// TrueType kept that path from every test of a browser.
import { brotliCompressSync, constants } from 'node:zlib'

const u16 = (b, i) => (b[i] << 8) | b[i + 1]
const u32 = (b, i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]
const base128 = n => {
  const out = [n & 0x7f]
  for (n = Math.floor(n / 128); n > 0; n = Math.floor(n / 128)) out.unshift((n & 0x7f) | 0x80)
  return out
}

/** `ttf` (a TrueType sfnt) as a WOFF2 */
export function woff2Of(ttf) {
  const flavor = u32(ttf, 0)
  const n = u16(ttf, 4)
  const tables = []
  for (let k = 0; k < n; k++) {
    const r = 12 + 16 * k
    const tag = String.fromCharCode(ttf[r], ttf[r + 1], ttf[r + 2], ttf[r + 3])
    tables.push({ tag, data: ttf.subarray(u32(ttf, r + 8), u32(ttf, r + 8) + u32(ttf, r + 12)) })
  }
  tables.sort((a, b) => (a.tag < b.tag ? -1 : 1))
  // (loca right after glyf)
  const loca = tables.findIndex(t => t.tag === 'loca')
  if (loca >= 0) {
    const [l] = tables.splice(loca, 1)
    tables.splice(tables.findIndex(t => t.tag === 'glyf') + 1, 0, l)
  }
  const dir = tables.flatMap(t => [63 | ((t.tag === 'glyf' || t.tag === 'loca' ? 3 : 0) << 6), ...[...t.tag].map(c => c.charCodeAt(0)), ...base128(t.data.length)])
  const stream = new Uint8Array(tables.reduce((s, t) => s + t.data.length, 0))
  let at = 0
  for (const t of tables) {
    stream.set(t.data, at)
    at += t.data.length
  }
  const compressed = brotliCompressSync(stream, { params: { [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_FONT, [constants.BROTLI_PARAM_QUALITY]: 11 } })
  const sfntSize = 12 + 16 * n + tables.reduce((s, t) => s + ((t.data.length + 3) & ~3), 0)
  const length = (48 + dir.length + compressed.length + 3) & ~3
  const out = new Uint8Array(length)
  const v = new DataView(out.buffer)
  v.setUint32(0, 0x774f4632)
  v.setUint32(4, flavor)
  v.setUint32(8, length)
  v.setUint16(12, n)
  v.setUint32(16, sfntSize)
  v.setUint32(20, compressed.length)
  v.setUint16(24, 1)
  out.set(dir, 48)
  out.set(compressed, 48 + dir.length)
  return out
}
