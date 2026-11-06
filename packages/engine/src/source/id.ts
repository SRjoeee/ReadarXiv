// A copy of packages/format's SHA-256, UTF-8 and unit id (rebuild/prepare: L1's format/src/bytes.ts and ids.ts), so that the
// source reader names its units before packages/format holds them on this branch. At the merge: delete this file and
// import `unitId` from @readarxiv/format, whose rule this is (the baseline's FORMAT.md §2).
import type { Piece } from './types.ts'

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
])

/** The SHA-256 digest of `data` (32 bytes) */
function sha256(data: Uint8Array): Uint8Array {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const w = new Uint32Array(64)
  const n = data.length
  // the message, padded: a 1 bit, zeros, its length in bits as 64 bits big-endian, to a multiple of 64 bytes
  const blocks = Math.ceil((n + 9) / 64)
  const tail = new Uint8Array(128)
  const full = Math.floor(n / 64)
  const rest = n - full * 64
  tail.set(data.subarray(full * 64))
  tail[rest] = 0x80
  const tailBlocks = blocks - full
  const bits = n * 8
  const end = tailBlocks * 64
  tail[end - 4] = (bits >>> 24) & 255
  tail[end - 3] = (bits >>> 16) & 255
  tail[end - 2] = (bits >>> 8) & 255
  tail[end - 1] = bits & 255
  const hi = Math.floor(n / 0x20000000)
  tail[end - 8] = (hi >>> 24) & 255
  tail[end - 7] = (hi >>> 16) & 255
  tail[end - 6] = (hi >>> 8) & 255
  tail[end - 5] = hi & 255
  for (let b = 0; b < blocks; b++) {
    const src = b < full ? data : tail
    const o = b < full ? b * 64 : (b - full) * 64
    for (let i = 0; i < 16; i++) {
      const j = o + 4 * i
      w[i] =
        ((src[j] as number) << 24) |
        ((src[j + 1] as number) << 16) |
        ((src[j + 2] as number) << 8) |
        (src[j + 3] as number)
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15] as number
      const y = w[i - 2] as number
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)
      w[i] = ((w[i - 16] as number) + s0 + (w[i - 7] as number) + s1) | 0
    }
    let a = h[0] as number
    let bb = h[1] as number
    let c = h[2] as number
    let d = h[3] as number
    let e = h[4] as number
    let f = h[5] as number
    let g = h[6] as number
    let hh = h[7] as number
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + S1 + ch + (K[i] as number) + (w[i] as number)) | 0
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      const maj = (a & bb) ^ (a & c) ^ (bb & c)
      const t2 = (S0 + maj) | 0
      hh = g
      g = f
      f = e
      e = (d + t1) | 0
      d = c
      c = bb
      bb = a
      a = (t1 + t2) | 0
    }
    h[0] = ((h[0] as number) + a) | 0
    h[1] = ((h[1] as number) + bb) | 0
    h[2] = ((h[2] as number) + c) | 0
    h[3] = ((h[3] as number) + d) | 0
    h[4] = ((h[4] as number) + e) | 0
    h[5] = ((h[5] as number) + f) | 0
    h[6] = ((h[6] as number) + g) | 0
    h[7] = ((h[7] as number) + hh) | 0
  }
  const out = new Uint8Array(32)
  for (let i = 0; i < 8; i++) {
    const v = h[i] as number
    out[4 * i] = v >>> 24
    out[4 * i + 1] = (v >>> 16) & 255
    out[4 * i + 2] = (v >>> 8) & 255
    out[4 * i + 3] = v & 255
  }
  return out
}

const HEX = Array.from({ length: 256 }, (_, v) => v.toString(16).padStart(2, '0'))
/** bytes as lowercase hexadecimal */
function toHex(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i++) s += HEX[b[i] as number]
  return s
}
/** the lowercase hexadecimal SHA-256 of `data`: an object's digest, a unit's id */
const sha256Hex = (data: Uint8Array): string => toHex(sha256(data))

/** bytes as base64url, unpadded */
function utf8(s: string): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1)
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00)
        i++
      } else c = 0xfffd
    } else if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  return Uint8Array.from(out)
}

/** UTF-8 bytes as a string, or null where they are not well-formed UTF-8 (an object of ours is; anything else is refused) */

/** a piece as the id's hash reads it: ["t", s] a text, ["p", src] an element, ["o", open] and ["c", close] around a span's
 *  content (either absent where the unit's edge cuts the group), ["n", pre, unit, post] a nested unit */
function tagged(content: readonly Piece[], out: unknown[]): unknown[] {
  // (an explicit stack: spans nest as deep as the source's groups do)
  const stack: { list: readonly Piece[]; k: number; close?: string }[] = [{ list: content, k: 0 }]
  while (stack.length) {
    const top = stack[stack.length - 1] as { list: readonly Piece[]; k: number; close?: string }
    if (top.k >= top.list.length) {
      stack.pop()
      if (top.close !== undefined) out.push(['c', top.close])
      continue
    }
    const p = top.list[top.k++] as Piece
    switch (p.t) {
      case 'text':
        out.push(['t', p.s])
        break
      case 'el':
        out.push(['p', p.src])
        break
      case 'span':
        if (p.open !== undefined) out.push(['o', p.open])
        stack.push(p.close !== undefined ? { list: p.content, k: 0, close: p.close } : { list: p.content, k: 0 })
        break
      case 'unit':
        out.push(['n', p.pre, p.unit, p.post])
        break
    }
  }
  return out
}

/** a unit's id: the lowercase hexadecimal SHA-256 of the UTF-8 bytes of `JSON.stringify([kind, P])`, P its pieces tagged in
 *  the source's order */
export const unitId = (kind: string, content: readonly Piece[]): string =>
  sha256Hex(utf8(JSON.stringify([kind, tagged(content, [])])))
