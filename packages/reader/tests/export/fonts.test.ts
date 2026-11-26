// @vitest-environment node
// A served slice to the font a file embeds (export/woff2.ts, export/fonts.ts): its WOFF2 back to the sfnt it was made of, by
// the brotli given, and the sfnt read for its cmap, advances, units and CIDs. Fonts of our own (sfnt-build.ts).
import { brotliCompressSync, brotliDecompressSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { readSfnt } from '../../src/export/fonts.ts'
import { glyphsOf, subsetTrueType, tablesOf } from '../../src/export/ttf.ts'
import { sfntOfWoff2, woff2Payload } from '../../src/export/woff2.ts'
import { cs } from './cff-build.ts'
import { buildSfnt, buildTrueTypeWoff2, buildWoff2 } from './sfnt-build.ts'

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

  it('rebuilds a TrueType slice whose glyf and loca are stored transformed: each point, contour and component as drawn', async () => {
    const w = buildTrueTypeWoff2(
      {
        glyphs: [
          null,
          {
            contours: [
              [
                [10, 0, true],
                [500, 0, true],
                [500, 700, false],
                [10, 700, true],
              ],
            ],
          },
          { components: [[1, 30, -20]] },
        ],
        cmap: [
          [0x41, 1],
          [0x42, 2],
        ],
        advances: [500, 600, 650],
      },
      (b) => new Uint8Array(brotliCompressSync(b)),
    )
    const [sfnt] = await brotliAll([w])
    const f = readSfnt('t', sfnt as Uint8Array)
    expect(f?.kind).toBe('ttf')
    expect(f?.cid(2)).toBe(2)
    expect(f?.advance(2)).toBe(650)
    const glyphs = glyphsOf(tablesOf(f?.sfnt as Uint8Array))
    const g1 = glyphs[1] as Uint8Array
    const dv = new DataView(g1.buffer, g1.byteOffset, g1.byteLength)
    // one contour, its box from its points, its end at point 3, no instructions, the flags (on, on, off, on), the deltas
    expect([0, 2, 4, 6, 8, 10, 12].map((o) => dv.getInt16(o))).toEqual([1, 10, 0, 500, 700, 3, 0])
    expect([...g1.subarray(14, 18)]).toEqual([1, 1, 0, 1])
    expect([0, 1, 2, 3].map((k) => dv.getInt16(18 + 2 * k))).toEqual([10, 490, 0, -490])
    expect([0, 1, 2, 3].map((k) => dv.getInt16(26 + 2 * k))).toEqual([0, 0, 700, 0])
    // the composite: its box from the box stream, its component glyph 1 moved (30, -20)
    const g2 = glyphs[2] as Uint8Array
    const d2 = new DataView(g2.buffer, g2.byteOffset, g2.byteLength)
    expect([0, 2, 4, 6, 8, 12, 14, 16].map((o) => d2.getInt16(o))).toEqual([-1, 0, 0, 1000, 1000, 1, 30, -20])
  })

  it('subsets a TrueType font to the glyphs drawn and their components, every glyph id kept', async () => {
    const w = buildTrueTypeWoff2(
      {
        glyphs: [
          null,
          {
            contours: [
              [
                [0, 0, true],
                [9, 9, true],
                [0, 9, true],
              ],
            ],
          },
          { components: [[1, 0, 0]] },
          {
            contours: [
              [
                [1, 1, true],
                [2, 2, true],
                [1, 2, true],
              ],
            ],
          },
        ],
        cmap: [[0x41, 2]],
        advances: [500, 500, 500, 500],
      },
      (b) => new Uint8Array(brotliCompressSync(b)),
    )
    const [sfnt] = await brotliAll([w])
    const sub = subsetTrueType(sfnt as Uint8Array, new Set([2]))
    const glyphs = glyphsOf(tablesOf(sub))
    expect(glyphs.map((g) => g.length > 0)).toEqual([false, true, true, false])
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
