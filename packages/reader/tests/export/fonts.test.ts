// @vitest-environment node
// A served slice to the font a file embeds (export/woff2.ts, export/fonts.ts): its WOFF2 back to the sfnt it was made of, by
// the brotli given, and the sfnt read for its cmap, advances, units and CIDs. Fonts of our own (sfnt-build.ts).
import { brotliCompressSync, brotliDecompressSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { readSfnt } from '../../src/export/fonts.ts'
import { sfntOfWoff2, woff2Payload } from '../../src/export/woff2.ts'
import { cs } from './cff-build.ts'
import { buildSfnt, buildWoff2 } from './sfnt-build.ts'

const font = () =>
  buildSfnt({
    glyphs: [cs('endchar'), cs(500, 0, 0, 'rmoveto', 'endchar'), cs(600, 0, 0, 'rmoveto', 'endchar')],
    gsubrs: [],
    lsubrs: [[]],
    cid: { fdOf: [0, 0, 0], cids: [0, 1200, 1300] },
    cmap: [
      [0x6587, 1],
      [0x5b57, 2],
    ],
    advances: [0, 1000, 920],
  })
const brotli = async (parts: Uint8Array[]) => parts.map((b) => new Uint8Array(brotliDecompressSync(b)))

describe("a served slice's sfnt", () => {
  it('is its WOFF2 decoded, every table as it was', async () => {
    const { tables } = font()
    const w = buildWoff2(tables, (b) => new Uint8Array(brotliCompressSync(b)))
    const [sfnt] = await brotliAll([w])
    const f = readSfnt('k', sfnt as Uint8Array)
    expect(f).not.toBeNull()
    expect([...(f?.cff ?? [])]).toEqual([...(tables.get('CFF ') ?? [])])
  })

  it("gives the brotli stream alone to the decoder, so that one decoder's call takes many slices", () => {
    const { tables } = font()
    const w = buildWoff2(tables, (b) => new Uint8Array(brotliCompressSync(b)))
    const payload = woff2Payload(w)
    expect(payload).not.toBeNull()
    expect(new Uint8Array(brotliDecompressSync(payload?.stream as Uint8Array)).length).toBe(
      [...tables.values()].reduce((n, t) => n + t.length, 0),
    )
  })

  it('refuses a slice whose outlines are stored transformed (a TrueType glyf), as no table of ours rebuilds it', () => {
    const { tables } = font()
    const t = new Map([...tables].filter(([k]) => k !== 'CFF '))
    t.set('glyf', new Uint8Array(8))
    t.set('loca', new Uint8Array(8))
    // (glyf and loca under transform version 0: transformed)
    const w = buildWoff2(t, (b) => new Uint8Array(brotliCompressSync(b)))
    expect(woff2Payload(w)).toBeNull()
  })

  it('is read for its glyphs by code point, their advances and their CIDs', () => {
    const f = readSfnt('k', font().sfnt)
    expect(f?.cmap.get(0x6587)).toBe(1)
    expect(f?.cmap.get(0x5b57)).toBe(2)
    expect(f?.advance(2)).toBe(920)
    expect(f?.upem).toBe(1000)
    expect(f?.cid(1)).toBe(1200)
    expect(f?.cid(2)).toBe(1300)
    expect(f?.cidKeyed).toBe(true)
  })
})

/** WOFF2 files to their sfnts, the brotli streams decoded in one call */
async function brotliAll(files: Uint8Array[]): Promise<(Uint8Array | null)[]> {
  const payloads = files.map(woff2Payload)
  const decoded = await brotli(payloads.filter((p) => p !== null).map((p) => p.stream))
  let k = 0
  return payloads.map((p) => (p ? sfntOfWoff2(p, decoded[k++] as Uint8Array) : null))
}
