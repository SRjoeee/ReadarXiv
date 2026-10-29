// @vitest-environment node
// A bitmap figure read from its own object (pipeline/ocr-image.mjs, PDF-READER §19.15): the source a stream is, the key of its bytes,
// and its pixels at a bounded resolution, area-averaged as they are decoded, a Flate stream a row at a time, a JPEG by PDF.js's own
// decoder; its masks composited over white. Each image a stream made here (@cantoo/pdf-lib's objects, node:zlib's deflate).
import { readFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import * as PL from '@cantoo/pdf-lib'
import { JpegImage } from 'pdfjs-dist/legacy/image_decoders/pdf.image_decoders.mjs'
import { describe, expect, it } from 'vitest'
import { OCR_JPEG_PIXELS, ocrSourceKey, ocrSourceOf, readOcrPixels, readSizeOf, refOf } from '@/pdf-reader/engine/pipeline/ocr-image.mjs'

const ctx = PL.PDFContext.create()
const store = new Map<number, unknown>()
let next = 1
const objects = { lookup: (r: unknown) => store.get((r as PL.PDFRef).objectNumber) }
/** a stream object of `dict` and `data`, its number's PDF.js name (`<n>R`) */
function put(dict: Record<string, unknown>, data: Uint8Array): string {
  const n = next++
  store.set(n, PL.PDFRawStream.of(ctx.obj(dict as never) as unknown as PL.PDFDict, data))
  return `${n}R`
}
const refTo = (name: string) => { const r = refOf(name)!; return PL.PDFRef.of(r.n, r.g) }
const Jpeg = JpegImage as never
/** PNG's Up filter over rows of `rowBytes` (each row its filter byte, 2, then its differences from the row above) */
function pngUp(raw: Uint8Array, rowBytes: number): Uint8Array {
  const rows = raw.length / rowBytes, out = new Uint8Array(rows * (rowBytes + 1))
  for (let y = 0; y < rows; y++) {
    out[y * (rowBytes + 1)] = 2
    for (let i = 0; i < rowBytes; i++) out[y * (rowBytes + 1) + 1 + i] = (raw[y * rowBytes + i]! - (y ? raw[(y - 1) * rowBytes + i]! : 0)) & 255
  }
  return out
}
const read = async (ref: string, w?: number, h?: number) => {
  const src = ocrSourceOf(objects, PL, ref)
  const [out] = await readOcrPixels(src, [{ x0: 0, y0: 0, x1: src.width, y1: src.height, width: w ?? src.width, height: h ?? src.height }], { Jpeg })
  return out!
}
const rgbAt = (o: { data: Uint8ClampedArray; width: number }, x: number, y: number) => Array.from(o.data.subarray(4 * (y * o.width + x), 4 * (y * o.width + x) + 3))

describe('an image read from its object (ocrSourceOf, readOcrPixels)', () => {
  it('a Flate stream of RGB rows under PNG\'s predictor, read whole, its pixels the rows\'', async () => {
    const w = 5, h = 3, raw = new Uint8Array(w * h * 3).map((_, i) => (i * 37) & 255)
    const ref = put({ Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'FlateDecode', DecodeParms: { Predictor: 12, Colors: 3, Columns: w, BitsPerComponent: 8 } }, deflateSync(pngUp(raw, w * 3)))
    const out = await read(ref)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) expect(rgbAt(out, x, y)).toEqual(Array.from(raw.subarray(3 * (y * w + x), 3 * (y * w + x) + 3)))
  })
  it('scaled down to its bound, each pixel the mean of those it covers; a window at its own pixels', async () => {
    // (a gray image of 8 × 4, its left half black and its right white, read at 4 × 2: two black, two white)
    const w = 8, h = 4, raw = new Uint8Array(w * h).map((_, i) => (i % w < 4 ? 0 : 255))
    const ref = put({ Width: w, Height: h, ColorSpace: 'DeviceGray', BitsPerComponent: 8, Filter: 'FlateDecode' }, deflateSync(raw))
    const out = await read(ref, 4, 2)
    expect([0, 1, 2, 3].map(x => rgbAt(out, x, 0)[0])).toEqual([0, 0, 255, 255])
    // (a column across the edge, of 3 to 5: read as one pixel, the mean)
    const src = ocrSourceOf(objects, PL, ref)
    const [col] = await readOcrPixels(src, [{ x0: 3, y0: 0, x1: 5, y1: 4, width: 1, height: 1 }], { Jpeg })
    expect(Math.abs(rgbAt(col!, 0, 0)[0]! - 127.5)).toBeLessThanOrEqual(0.5)
    expect(readSizeOf(9000, 6000, 16_000_000)).toEqual({ width: 4899, height: 3266, scale: expect.closeTo(0.5443, 3) })
  })
  it('Indexed of 4 bits, gray of 1 bit under a /Decode, CMYK: each pixel its colour', async () => {
    const idx = put({ Width: 2, Height: 1, ColorSpace: ['Indexed', 'DeviceRGB', 1, PL.PDFHexString.of('ff00000000ff')], BitsPerComponent: 4 }, new Uint8Array([0x01]))
    expect([rgbAt(await read(idx), 0, 0), rgbAt(await read(idx), 1, 0)]).toEqual([[255, 0, 0], [0, 0, 255]])
    const bits = put({ Width: 8, Height: 1, ColorSpace: 'DeviceGray', BitsPerComponent: 1, Decode: [1, 0] }, new Uint8Array([0b10100000]))
    const b1 = await read(bits)
    expect([0, 1, 2].map(x => rgbAt(b1, x, 0)[0])).toEqual([0, 255, 0])
    const cmyk = put({ Width: 1, Height: 1, ColorSpace: 'DeviceCMYK', BitsPerComponent: 8 }, new Uint8Array([0, 255, 255, 0]))
    expect(rgbAt(await read(cmyk), 0, 0)).toEqual([255, 0, 0])
  })
  it('its masks: a soft mask over white, a colour key and an explicit mask making the pixels they mask white', async () => {
    const smask = put({ Width: 2, Height: 1, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }, new Uint8Array([255, 0]))
    const soft = put({ Width: 2, Height: 1, ColorSpace: 'DeviceGray', BitsPerComponent: 8, SMask: refTo(smask) }, new Uint8Array([0, 0]))
    expect([rgbAt(await read(soft), 0, 0), rgbAt(await read(soft), 1, 0)]).toEqual([[0, 0, 0], [255, 255, 255]])
    const keyed = put({ Width: 2, Height: 1, ColorSpace: 'DeviceGray', BitsPerComponent: 8, Mask: [10, 20] }, new Uint8Array([15, 0]))
    expect([rgbAt(await read(keyed), 0, 0), rgbAt(await read(keyed), 1, 0)]).toEqual([[255, 255, 255], [0, 0, 0]])
    const stencil = put({ Width: 2, Height: 1, ImageMask: true }, new Uint8Array([0b01000000]))
    const masked = put({ Width: 2, Height: 1, ColorSpace: 'DeviceGray', BitsPerComponent: 8, Mask: refTo(stencil) }, new Uint8Array([0, 0]))
    expect([rgbAt(await read(masked), 0, 0), rgbAt(await read(masked), 1, 0)]).toEqual([[0, 0, 0], [255, 255, 255]])
  })
  it('a JPEG by PDF.js\'s own decoder: a dark bar on white, its pixels near the bar\'s', async () => {
    const jpg = new Uint8Array(readFileSync(new URL('../fixtures/ocr/bar.jpg', import.meta.url)))
    const ref = put({ Width: 16, Height: 8, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode' }, jpg)
    const out = await read(ref)
    expect(rgbAt(out, 8, 4).every(v => v < 40)).toBe(true)
    expect(rgbAt(out, 1, 1).every(v => v > 215)).toBe(true)
  })
  it('a stream cut short: the rows decoded, the rest white', async () => {
    const w = 4, h = 4, raw = new Uint8Array(w * h).fill(0)
    const whole = deflateSync(raw)
    const ref = put({ Width: w, Height: h, ColorSpace: 'DeviceGray', BitsPerComponent: 8, Filter: 'FlateDecode' }, whole.subarray(0, whole.length - 6))
    const out = await read(ref)
    expect(out.data.length).toBe(w * h * 4)
  })
  it('refuses what it does not read: a filter, a colour space, a JPEG past its bound, a paint naming no object', () => {
    const lzw = put({ Width: 2, Height: 2, ColorSpace: 'DeviceGray', BitsPerComponent: 8, Filter: 'LZWDecode' }, new Uint8Array(4))
    expect(() => ocrSourceOf(objects, PL, lzw)).toThrow(expect.objectContaining({ why: 'format' }))
    const lab = put({ Width: 2, Height: 2, ColorSpace: ['Lab', {}], BitsPerComponent: 8 }, new Uint8Array(12))
    expect(() => ocrSourceOf(objects, PL, lab)).toThrow(expect.objectContaining({ why: 'format' }))
    const side = Math.ceil(Math.sqrt(OCR_JPEG_PIXELS)) + 1
    const huge = put({ Width: side, Height: side, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode' }, new Uint8Array(4))
    expect(() => ocrSourceOf(objects, PL, huge)).toThrow(expect.objectContaining({ why: 'big' }))
    expect(() => ocrSourceOf(objects, PL, 'img_1')).toThrow(expect.objectContaining({ why: 'format' }))
  })
})

describe('an image\'s key (ocrSourceKey)', () => {
  it('names its bytes and what changes its pixels: the same bytes the same key, another mask or /Decode another', async () => {
    const data = new Uint8Array([0, 128, 255, 64])
    const a = put({ Width: 2, Height: 2, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }, data)
    const b = put({ Width: 2, Height: 2, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }, data.slice())
    const inverted = put({ Width: 2, Height: 2, ColorSpace: 'DeviceGray', BitsPerComponent: 8, Decode: [1, 0] }, data)
    const sm = put({ Width: 2, Height: 2, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }, new Uint8Array([255, 255, 0, 0]))
    const masked = put({ Width: 2, Height: 2, ColorSpace: 'DeviceGray', BitsPerComponent: 8, SMask: refTo(sm) }, data)
    const key = async (r: string) => ocrSourceKey(ocrSourceOf(objects, PL, r))
    expect(await key(a)).toMatch(/^r1\.2x2\.[0-9a-f]{64}$/)
    expect(await key(a)).toBe(await key(b))
    expect(new Set([await key(a), await key(inverted), await key(masked)]).size).toBe(3)
  })
})
