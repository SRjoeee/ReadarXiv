// experiments/pdf-bilingual/spikes/layer-gate/png.mjs
// A small PNG writer for the gate's progress images (Plan 8b, Task 12): RGBA pixels as an indexed PNG, its colours
// reduced to a palette of 256 (a 6 x 6 x 6 colour cube and 40 greys more: the pages are text, whose edges are grey,
// and the figures' colours stay recognisable), each row filtered by the PNG filter that leaves the least to compress, deflated at level 9. No library:
// the repository holds no image encoder for Node.
import { deflateSync } from 'node:zlib'

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'latin1')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

// the palette: 6 reds x 6 greens x 6 blues, then 40 greys between the cube's six
const R = 6, G = 6, B = 6
const level = (v, n) => Math.round((v / 255) * (n - 1))
const PALETTE = []
for (let r = 0; r < R; r++) for (let g = 0; g < G; g++) for (let b = 0; b < B; b++) PALETTE.push([Math.round((255 * r) / (R - 1)), Math.round((255 * g) / (G - 1)), Math.round((255 * b) / (B - 1))])
for (let i = 1; PALETTE.length < 256; i++) { const v = Math.round((i * 255) / 47); if (v % 51) PALETTE.push([v, v, v]) }
const GREYS = PALETTE.map((c, i) => [c, i]).filter(([c]) => c[0] === c[1] && c[1] === c[2])

/** a pixel's palette index: a grey to its nearest grey, any other colour to the cube */
function indexOf(r, g, b) {
  if (Math.abs(r - g) < 12 && Math.abs(g - b) < 12) {
    const v = (r + g + b) / 3
    let best = 0, d = Infinity
    for (const [c, i] of GREYS) { const e = Math.abs(c[0] - v); if (e < d) { d = e; best = i } }
    return best
  }
  return (level(r, R) * G + level(g, G)) * B + level(b, B)
}

/** RGBA (`w` x `h`, over white where not opaque) as an indexed PNG's bytes */
export function encodePng(rgba, w, h) {
  const raw = Buffer.alloc(h * (w + 1))
  const row = Buffer.alloc(w), prev = Buffer.alloc(w)
  const cand = [0, 1, 2, 4].map(() => Buffer.alloc(w))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = 4 * (y * w + x), a = rgba[i + 3] / 255
      const over = v => Math.round(255 - a * (255 - v))
      row[x] = indexOf(over(rgba[i]), over(rgba[i + 1]), over(rgba[i + 2]))
    }
    // filters 0 (none), 1 (sub), 2 (up), 4 (Paeth) on the indices, a byte a pixel; the one with the smallest sum
    let best = 0, bestSum = Infinity
    ;[0, 1, 2, 4].forEach((f, q) => {
      const out = cand[q]
      let s = 0
      for (let x = 0; x < w; x++) {
        const left = x ? row[x - 1] : 0, up = y ? prev[x] : 0, ul = x && y ? prev[x - 1] : 0
        let pred = 0
        if (f === 1) pred = left
        else if (f === 2) pred = up
        else if (f === 4) { const p = left + up - ul, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - ul); pred = pa <= pb && pa <= pc ? left : pb <= pc ? up : ul }
        const v = (row[x] - pred) & 0xff
        out[x] = v
        s += v < 128 ? v : 256 - v
      }
      if (s < bestSum) { bestSum = s; best = q }
    })
    raw[y * (w + 1)] = [0, 1, 2, 4][best]
    cand[best].copy(raw, y * (w + 1) + 1)
    row.copy(prev)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 3
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', Buffer.from(PALETTE.flat())),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
