// @vitest-environment node
import * as PL from '@cantoo/pdf-lib'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { deflateSync } from 'node:zlib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { openObjects, siteOf } from '@readarxiv/engine'
// (by path: the package's entry does not export it yet)
import { type Hole, holesOf, pack, unpack } from '../../packages/engine/src/sparse.ts'
import { concat, type Obj, pdfOf } from './helpers/delta-pdfs'
import { installLiteWorker, LITE } from './helpers/lite-pdfjs'

// B stored without its images' pixels (packages/engine/src/sparse.ts, the performance design's Q3): holesOf finds the data of
// every image XObject that is no stencil mask by the cross-reference and each stream's resolved /Length, and PDF.js's worker as
// the box runs it (pdf-lite.mjs: no image's pixels decoded) reads B and B packed and unpacked, its holes zeros, the same: the
// operator lists, each Type 3 glyph's list, every mask's bits, the text and the recoveries PDF.js tells, bit for bit. A stencil
// mask is read into the list itself and stays; the test shows a mask's bits do reach what is compared. Every image here is our own (an 8 x 8 picture
// encoded by OpenJPEG 2.5.4's opj_compress and libjpeg's cjpeg for this test, base64 below)

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255)
const latin = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('')
const fromBase64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'))
/** bytes of no pattern (a linear congruence from `seed`) */
const noise = (n: number, seed: number) => {
  const b = new Uint8Array(n)
  let x = seed
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) >>> 0
    b[i] = x >>> 24
  }
  return b
}
/** PNG's rows (filter byte 0) of `rows` rows of `row` bytes each, deflated: a PNG as pdfTeX includes one */
const png = (row: number, rows: number, seed: number) => {
  const raw = noise(row * rows, seed)
  const out: number[] = []
  for (let r = 0; r < rows; r++) out.push(0, ...raw.subarray(r * row, (r + 1) * row))
  return new Uint8Array(deflateSync(Uint8Array.from(out)))
}
const JPX = fromBase64(
  '/0//UQAvAAAAAAAIAAAACAAAAAAAAAAAAAAACAAAAAgAAAAAAAAAAAADBwEBBwEBBwEB/1IADAAAAAEBAQQEAAH/XAAHQEBISFD/ZAAlAAFDcmVhdGVkIGJ5IE9wZW5KUEVHIHZlcnNpb24gMi41LjT/kAAKAAAAAABbAAH/k8+0OBDiOPgtKH0c7yKSSMyb34BIFTFrrB4pUAh/34BoBkGUjLQHNu5nGNP/f8D5AcHzgwAiGg8Df+uh9QGAAM/jw+oDh9QGIhoVAM/j/9k=',
)
const JPEG = fromBase64(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/wAALCAAIAAgBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/AIbPSOny1//Z',
)
const RGB16 = ' /Type /XObject /Subtype /Image /Width 16 /Height 16 /ColorSpace /DeviceRGB /BitsPerComponent 8'
const GRAY16 = ' /Type /XObject /Subtype /Image /Width 16 /Height 16 /ColorSpace /DeviceGray /BitsPerComponent 8'
const MASK16 = ' /Type /XObject /Subtype /Image /Width 16 /Height 16 /BitsPerComponent 1'
/** each image's data: what holesOf must find (the six image XObjects and the soft mask), and the masks it must keep */
const DATA = {
  raw: noise(16 * 16 * 3, 1),
  png: png(16 * 3, 16, 2),
  soft: png(16 * 3, 16, 3),
  smask: png(16, 16, 4),
  inForm: png(16, 16, 5),
  jpx: JPX,
  dct: JPEG,
  glyphMask: Uint8Array.from({ length: 32 }, (_, i) => (i % 4 < 2 ? 0x0f : 0xf0)),
  pageMask: Uint8Array.from({ length: 32 }, (_, i) => (i * 37) & 255),
  // (a mask of one pixel, not painted: PDF.js tells a mask of one painted pixel by its bits, another operator)
  dot: Uint8Array.from([0x80]),
  imMask: Uint8Array.from({ length: 32 }, (_, i) => (i * 11) & 255),
  refMask: Uint8Array.from({ length: 32 }, (_, i) => (i * 13 + 5) & 255),
}
const HOLES = ['raw', 'png', 'soft', 'smask', 'inForm', 'jpx', 'dct'] as const
const KEPT = ['glyphMask', 'pageMask', 'dot', 'imMask', 'refMask'] as const
const PNG_PARMS = (colors: number) => ` /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors ${colors} /BitsPerComponent 8 /Columns 16 >>`
const content = (s: string): Obj => ({ dict: '', data: enc(s) })
const at = (name: string, x: number, y: number, s = 20) => `q ${s} 0 0 ${s} ${x} ${y} cm /${name} Do Q\n`

/** B as pdfTeX might write it: two pages, text in Helvetica and in a Type 3 font whose glyph paints a stencil mask (a bitmap
 *  font's glyph), a raw image (its /Length an indirect object) drawn on both pages, a PNG, an image with a soft mask, a JPX and
 *  a DCT image, a form holding an image, stencil masks on the page (one of one pixel, one flagged by `/IM`, one by an indirect
 *  `/ImageMask`) */
function objects(): Map<number, Obj> {
  return new Map<number, Obj>([
    [1, { text: '<< /Type /Catalog /Pages 2 0 R >>' }],
    [2, { text: '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 /MediaBox [0 0 300 300] >>' }],
    [
      3,
      {
        text: '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 10 0 R /T3 11 0 R >> /XObject << /Raw 20 0 R /Png 21 0 R /Soft 22 0 R /Jpx 24 0 R /Dct 25 0 R /Mask 26 0 R /Dot 27 0 R /Fm 28 0 R /Im 30 0 R /Ir 31 0 R >> >> /Contents 5 0 R >>',
      },
    ],
    [4, { text: '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 10 0 R >> /XObject << /Raw 20 0 R /Fm 28 0 R >> >> /Contents 6 0 R >>' }],
    [
      5,
      content(
        `BT /F1 12 Tf 20 270 Td (Images, kept in place) Tj ET\nBT /T3 12 Tf 20 250 Td (aaa) Tj ET\n${at('Raw', 20, 200)}${at('Png', 50, 200)}${at('Soft', 80, 200)}${at('Jpx', 110, 200)}${at('Dct', 140, 200)}${at('Mask', 170, 200)}${at('Dot', 200, 200, 4)}${at('Im', 20, 160)}${at('Ir', 50, 160)}q 1 0 0 1 80 140 cm /Fm Do Q\n`,
      ),
    ],
    [6, content(`BT /F1 12 Tf 20 270 Td (Page two) Tj ET\n${at('Raw', 20, 200, 40)}q 1 0 0 1 100 100 cm /Fm Do Q\n`)],
    [10, { text: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>' }],
    [
      11,
      {
        text: '<< /Type /Font /Subtype /Type3 /FontBBox [0 0 16 16] /FontMatrix [0.0625 0 0 0.0625 0 0] /CharProcs << /a 12 0 R >> /Encoding << /Type /Encoding /Differences [97 /a] >> /FirstChar 97 /LastChar 97 /Widths [16] /Resources << /XObject << /G 13 0 R >> >> >>',
      },
    ],
    [12, content('16 0 0 0 16 16 d1\nq 16 0 0 16 0 0 cm /G Do Q\n')],
    [13, { dict: `${MASK16} /ImageMask true`, data: DATA.glyphMask }],
    [20, { dict: RGB16, data: DATA.raw, length: '34 0 R' }],
    [34, { text: String(DATA.raw.length) }],
    [21, { dict: RGB16 + PNG_PARMS(3), data: DATA.png }],
    [22, { dict: `${RGB16 + PNG_PARMS(3)} /SMask 23 0 R`, data: DATA.soft }],
    [23, { dict: GRAY16 + PNG_PARMS(1), data: DATA.smask }],
    [24, { dict: ' /Type /XObject /Subtype /Image /Width 8 /Height 8 /Filter /JPXDecode', data: DATA.jpx }],
    [25, { dict: ' /Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode', data: DATA.dct }],
    [26, { dict: `${MASK16} /ImageMask true`, data: DATA.pageMask }],
    [27, { dict: ' /Type /XObject /Subtype /Image /Width 1 /Height 1 /BitsPerComponent 1 /ImageMask true', data: DATA.dot }],
    [28, { dict: ' /Type /XObject /Subtype /Form /BBox [0 0 40 40] /Resources << /XObject << /In 29 0 R >> >>', data: enc(at('In', 0, 0, 40)) }],
    [29, { dict: GRAY16 + PNG_PARMS(1), data: DATA.inForm }],
    [30, { dict: `${MASK16} /IM true`, data: DATA.imMask }],
    [31, { dict: `${MASK16} /ImageMask 32 0 R`, data: DATA.refMask }],
    [32, { text: 'true' }],
  ])
}
const PACKED = [1, 2, 3, 4, 10, 11, 32, 34]
const TABLE = pdfOf(objects(), { root: 1 })
const STREAM = pdfOf(objects(), { root: 1, kind: 'stream', packed: PACKED })

/** each image's object */
const NUMBER = { raw: 20, png: 21, soft: 22, smask: 23, inForm: 29, jpx: 24, dct: 25, glyphMask: 13, pageMask: 26, dot: 27, imMask: 30, refMask: 31 }
/** where `k`'s data stands in `bytes`: its stream's data as the cross-reference finds it, held to be the bytes written */
function rangeOf(bytes: Uint8Array, k: keyof typeof DATA): Hole {
  const at = openObjects(bytes, { PL, objectsMax: 1000, decodedMax: 1 << 20 }).dataAt(PL.PDFRef.of(NUMBER[k], 0))
  if (at === null || latin(bytes.subarray(at[0], at[0] + at[1])) !== latin(DATA[k])) throw new Error(`${k}'s data is not where its object says`)
  return at
}
const sorted = (holes: Hole[]) => [...holes].sort((a, b) => a[0] - b[0])
const merged = (holes: readonly Hole[], more: Hole[]) => sorted([...holes, ...more])

describe('holesOf: the data of every image that is no stencil mask, by the cross-reference', () => {
  it('finds exactly the six images\' data and the soft mask\'s, in either cross-reference, and nothing else', () => {
    for (const B of [TABLE, STREAM]) {
      const r = holesOf(B, { PL })
      expect(r.why).toBeNull()
      expect(r.holes).toEqual(sorted(HOLES.map((k) => rangeOf(B, k))))
      // (the masks, the content streams, the glyph's and the form's streams are left as they are)
      const kept = KEPT.map((k) => rangeOf(B, k))
      for (const [s, l] of kept) expect(r.holes.some(([hs, hl]) => s < hs + hl && hs < s + l)).toBe(false)
    }
  })

  it('stores whole a document the object layer will not read, or one past its bounds', () => {
    const swap = (b: Uint8Array, a: string, z: string) => enc(latin(b).replace(a, z))
    const encrypted = holesOf(swap(TABLE, '/Root 1 0 R', '/Root 1 0 R /Encrypt 9 0 R'), { PL })
    expect(encrypted.holes).toEqual([])
    expect(encrypted.why).toMatch(/encrypted/)
    // (an image whose /Length does not end at endstream: refused as the object is read)
    const o = objects()
    o.set(21, { dict: RGB16 + PNG_PARMS(3), data: DATA.png, length: String(DATA.png.length - 1) })
    const short = holesOf(pdfOf(o, { root: 1 }), { PL })
    expect(short.holes).toEqual([])
    expect(short.why).toMatch(/endstream/)
    const bound = holesOf(STREAM, { PL, objectsMax: 5 })
    expect(bound.holes).toEqual([])
    expect(bound.why).toMatch(/more than 5 objects/)
  })

  it('stores whole a document where an object stands inside an image\'s data', () => {
    // (object 41 is written inside the raw image's data, and the table says it is there)
    const hidden = enc('41 0 obj\n<< /Type /Hidden >>\nendobj\n')
    const o = objects()
    o.set(20, { dict: RGB16, data: concat([hidden, noise(DATA.raw.length - hidden.length, 9)]), length: '34 0 R' })
    o.set(42, { text: '<< /Type /Other >>' })
    const t = latin(pdfOf(o, { root: 1 }))
    const xref = t.lastIndexOf('\nxref\n') + 1
    const entry = xref + t.slice(xref).indexOf('\r\n') - 18 + 20 * 41
    expect(t.slice(entry, entry + 20)).toBe('0000000000 00000 f\r\n')
    const B = enc(`${t.slice(0, entry)}${String(t.indexOf('41 0 obj')).padStart(10, '0')} 00000 n\r\n${t.slice(entry + 20)}`)
    expect(() => openObjects(B, { PL, objectsMax: 1000, decodedMax: 1 << 20 }).lookup(PL.PDFRef.of(41, 0))).not.toThrow()
    const r = holesOf(B, { PL })
    expect(r.holes).toEqual([])
    expect(r.why).toMatch(/object 41/)
  })
})

/** what PDF.js's worker as the box runs it (no image's pixels) gives of a document: each page's operator list (fnArray,
 *  argsArray, a document's number in an object's id read alike), each Type 3 font's glyph lists, the bits of every mask the list
 *  paints, whether each image's pixels came, and the page's text; and the warnings PDF.js printed (`heard`), and of them the
 *  recoveries the engine's reading counts and the bundle's head states (`recovered`: warnings.ts siteOf) */
async function readingOf(bytes: Uint8Array) {
  const heard: string[] = []
  const warn = console.warn
  console.warn = (...a: unknown[]) => {
    const s = a.map(String).join(' ')
    if (s.startsWith('Warning: ')) heard.push(s.slice(9))
    else warn(...a)
  }
  try {
    return { pages: await pagesOf(bytes), heard, recovered: heard.map(siteOf).filter((x) => x !== null) }
  } finally {
    console.warn = warn
  }
}
/** the standard fonts' data, as the box gives PDF.js them (a font read without them is a recovery) */
const STANDARD_FONTS = `${dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))}/standard_fonts/`
async function pagesOf(bytes: Uint8Array) {
  const task = getDocument({ data: bytes.slice(), verbosity: 1, standardFontDataUrl: STANDARD_FONTS, ...LITE })
  const doc = await task.promise
  const pages: unknown[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const list = await page.getOperatorList()
    const args = list.argsArray as unknown[][]
    const ofKind = (op: number) => args.filter((_, i) => list.fnArray[i] === op)
    const settled = (objs: { get(id: string, cb: (d: unknown) => void): unknown }, id: string) =>
      new Promise<unknown>((resolve) => objs.get(id, resolve))
    const fonts: unknown[] = []
    for (const a of ofKind(OPS.setFont)) {
      const f = (await settled(page.commonObjs, a[0] as string)) as { charProcOperatorList?: unknown }
      if (f?.charProcOperatorList) fonts.push(f.charProcOperatorList)
    }
    const masks: unknown[] = []
    for (const a of ofKind(OPS.paintImageMaskXObject)) {
      const m = (await settled(page.objs, (a[0] as { data: string }).data)) as { data: Uint8Array; width: number; height: number }
      masks.push([m.width, m.height, Array.from(m.data)])
    }
    await new Promise((r) => setTimeout(r, 200))
    const decoded = ofKind(OPS.paintImageXObject).map((a) => {
      const id = a[0] as string
      const objs = id.startsWith('g_') ? page.commonObjs : page.objs
      return objs.has(id) ? (objs.get(id) ? 'pixels' : 'none') : 'pending'
    })
    const text = (await page.getTextContent()).items
    // (a Map, as a Type 3 font's glyph lists are, by its entries; a typed array by its values)
    const json = (v: unknown) =>
      JSON.stringify(v, (_, x) => (x instanceof Map ? [...x] : ArrayBuffer.isView(x) ? Array.from(x as Uint8Array) : x)).replace(/_d\d+_/g, '_dN_')
    pages.push({ fn: Array.from(list.fnArray), args: json(args), fonts: json(fonts), masks, decoded, text: json(text) })
    page.cleanup()
  }
  await task.destroy()
  return pages
}

describe('B packed and unpacked reads as B in PDF.js\'s worker without pixels', () => {
  beforeAll(async () => {
    await installLiteWorker()
  })

  it('gives the same operator lists, glyph lists, masks, text and recoveries, its images placed as ever', async () => {
    for (const B of [TABLE, STREAM]) {
      const { holes } = holesOf(B, { PL })
      const U = unpack(pack(B, holes))
      expect(U.length).toBe(B.length)
      // (the images' data are gone: zeros where they stood)
      for (const [s, l] of holes) expect(U.subarray(s, s + l).every((x) => x === 0)).toBe(true)
      const b = await readingOf(B)
      const u = await readingOf(U)
      expect(u.pages).toEqual(b.pages)
      // (a Flate image's zeros fail its header as PDF.js fetches it, a JPX image's in PDFImage: warnings of no recovery)
      expect(u.heard.some((w) => w.startsWith('Invalid stream: '))).toBe(true)
      expect(u.recovered).toEqual(b.recovered)
      expect(b.recovered).toEqual([])
      const fn = (b.pages as { fn: number[] }[]).flatMap((p) => p.fn)
      expect(fn.filter((f) => f === OPS.paintImageXObject).length).toBe(8)
      expect(fn.filter((f) => f === OPS.paintImageMaskXObject).length).toBe(4)
    }
  })

  it('would not, were a mask\'s bits taken: what is compared reads them', async () => {
    const B = TABLE
    const { holes } = holesOf(B, { PL })
    const b = await readingOf(B)
    for (const k of ['dot', 'glyphMask', 'pageMask'] as const) {
      const U = unpack(pack(B, merged(holes, [rangeOf(B, k)])))
      expect((await readingOf(U)).pages).not.toEqual(b.pages)
    }
  })
})
