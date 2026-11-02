// Byte arrays read a 32-bit word at a time: the delta's comparison of two streams' bytes and its keyed hash of a stream's bytes
// (layout/delta.mjs), and the wrap's check of a deflated stream read back (layout/wrap.mjs). A word is four bytes read little-endian
// wherever they stand in their buffer (DataView: any offset), so that the same bytes are the same words at any offset; the bytes past
// the last whole word are read one at a time. Measured on streams of 64 KiB to 8 MiB at odd offsets (2026-11-02, Node 22 and 26):
// the comparison 3 to 4 times faster, the hash 3.3 times, than a byte at a time.
//
// An original module (no port statement). Imports nothing.

/** whether two byte arrays hold the same bytes */
export function equalBytes(a, b) {
  if (a.length !== b.length) return false
  const n = a.length & ~3
  if (n) {
    const da = new DataView(a.buffer, a.byteOffset, a.byteLength), db = new DataView(b.buffer, b.byteOffset, b.byteLength)
    for (let i = 0; i < n; i += 4) if (da.getUint32(i, true) !== db.getUint32(i, true)) return false
  }
  for (let i = n; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** a hash of a byte array's words and its last bytes, two 32-bit lanes from `seeds` ([s1, s2], 32-bit): the same for the same
 *  bytes at any offset, of the seeds alone otherwise. A bucket's key, never equality, which is equalBytes' */
export function wordHash(seeds) {
  const [s1, s2] = seeds
  return b => {
    let h1 = s1 ^ 0x811c9dc5, h2 = s2 ^ 0x9e3779b9
    const n = b.length & ~3
    if (n) {
      const d = new DataView(b.buffer, b.byteOffset, b.byteLength)
      for (let i = 0; i < n; i += 4) {
        const w = d.getUint32(i, true)
        h1 = Math.imul(h1 ^ w, 0x01000193)
        h1 ^= h1 >>> 13
        h2 = Math.imul(h2 ^ w, 0x5bd1e995) ^ (h2 >>> 15)
      }
    }
    for (let i = n; i < b.length; i++) { h1 = Math.imul(h1 ^ b[i], 0x01000193); h2 = Math.imul(h2 ^ b[i], 0x5bd1e995) ^ (h2 >>> 15) }
    return `${h1 >>> 0}.${h2 >>> 0}`
  }
}
