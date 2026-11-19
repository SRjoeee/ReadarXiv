// An arXiv source body (source/tar.ts unpackSource): a gzipped tar, a single gzipped TeX file, or a PDF. A tar is told by its
// first header block's magic field, six bytes at offset 257 (POSIX.1's ustar format: "ustar" and a NUL, GNU tar's "ustar "); a
// body that ends before that field's last byte holds no header block, so it is a single file, whatever its last bytes read
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { unpackSource } from '../src/source/tar.ts'

const enc = new TextEncoder()
/** a ustar archive of `files` (each a 512-byte header, its data padded to 512, and the two zero blocks that end it) */
function tarOf(files: Record<string, string>): Uint8Array {
  const blocks: Uint8Array[] = []
  for (const [name, body] of Object.entries(files)) {
    const data = enc.encode(body)
    const h = new Uint8Array(512)
    h.set(enc.encode(name), 0)
    h.set(enc.encode('0000644\0'), 100)
    h.set(enc.encode(`${data.length.toString(8).padStart(11, '0')}\0`), 124)
    h[156] = 48 // '0': a regular file
    h.set(enc.encode('ustar\0'), 257)
    h.set(enc.encode('00'), 263)
    blocks.push(h, data, new Uint8Array((512 - (data.length % 512)) % 512))
  }
  blocks.push(new Uint8Array(1024))
  const out = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0))
  let at = 0
  for (const b of blocks) {
    out.set(b, at)
    at += b.length
  }
  return out
}
const textOf = (r: Awaited<ReturnType<typeof unpackSource>>) =>
  'files' in r ? Object.fromEntries([...r.files].map(([k, v]) => [k, new TextDecoder().decode(v)])) : r

describe("a source body: a tar by its header block's magic, else one TeX file", () => {
  it("reads a gzipped tar's files", async () => {
    const tar = tarOf({ 'main.tex': '\\documentclass{article}', 'sec/a.tex': 'A section.' })
    expect(textOf(await unpackSource(gzipSync(tar)))).toEqual({
      'main.tex': '\\documentclass{article}',
      'sec/a.tex': 'A section.',
    })
  })

  it('reads a single TeX file that ends before the magic field\'s last byte as that file, its bytes at 257 "ustar" or not', async () => {
    // (262 bytes, the field's first five "ustar": no header block fits in it)
    const tex = `${'%'.repeat(256)}\nustar`
    expect(enc.encode(tex).length).toBe(262)
    expect(textOf(await unpackSource(gzipSync(enc.encode(tex))))).toEqual({ 'main.tex': tex })
    // (and a short one, as arXiv sends a paper of one file)
    expect(textOf(await unpackSource(gzipSync(enc.encode('\\input{x}'))))).toEqual({ 'main.tex': '\\input{x}' })
    expect(textOf(await unpackSource(enc.encode('\\relax'), 'paper.tex'))).toEqual({ 'paper.tex': '\\relax' })
  })

  it('tells a PDF', async () => {
    expect(await unpackSource(enc.encode('%PDF-1.5\n'))).toEqual({ pdf: true })
  })
})
