// @vitest-environment node
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PageInk } from '@readarxiv/engine'
import { figureUnitsOf } from '../../packages/engine/src/locate/figure-text.ts'
import { readArxiv } from '../../packages/engine/src/prepare.ts'
import { readPdf } from '../../packages/engine/src/read.ts'
import { type Obj, pdfOf } from './helpers/delta-pdfs'
import { installLiteWorker, LITE } from './helpers/lite-pdfjs'

// A figure's text is a unit only where the original page shows it (PDF-READER §19.12, §18.98). A PDF of our own making, one
// included figure (a form XObject, as pdfTeX includes a PDF), each of its rows a word pair that the page shows or hides in one
// way, read as the prepare reads arXiv's page (readArxiv: PDF.js's lite worker, no image's pixels decoded, each image's object a
// record of no pixels that says whether its samples carry alpha) and cut by the figure reading. Hidden: by the clip in force, by
// the text rendering mode (3, PDF 9.3.6), by an alpha constant of 0, and by an opaque paint after it: a fill (§18.98), an image
// XObject of no /SMask, no /Mask and no alpha in its data, painted at an alpha of 1 under Normal and no soft mask, which paints
// every point of its unit square (PDF 8.9.5, 11.6.4.3), as a screenshot pasted over a figure's vector mock of the same interface
// does (the owner's report of 2026-11-22 on 2606.07636v2's Figure 1), an inline image alike, and a stencil of one sample that
// paints (PDF.js's paintSolidColorImageMask) in an opaque colour. Shown: an image painted before the text (a label on a
// screenshot), an image the clip keeps clear of the text, and paints after it whose samples can let it through: an image with a
// soft mask, one whose JPX data holds its soft mask (/SMaskInData), one painted at an alpha of 0.5, a stencil of many samples
// (where it paints is its samples', which no box of the reading reads: it covers nothing, and a text under it stays shown). A run
// holding a glyph the page does not show makes no unit (§18.98), so a word an image covers in part, a glyph of it whole, is none.

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255)
const latin = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('')
const fromBase64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'))
/** an 8 x 8 JPX picture (OpenJPEG 2.5.4's opj_compress; the same bytes as tests/pdf-reader/sparse.test.ts') */
const JPX = fromBase64(
  '/0//UQAvAAAAAAAIAAAACAAAAAAAAAAAAAAACAAAAAgAAAAAAAAAAAADBwEBBwEBBwEB/1IADAAAAAEBAQQEAAH/XAAHQEBISFD/ZAAlAAFDcmVhdGVkIGJ5IE9wZW5KUEVHIHZlcnNpb24gMi41LjT/kAAKAAAAAABbAAH/k8+0OBDiOPgtKH0c7yKSSMyb34BIFTFrrB4pUAh/34BoBkGUjLQHNu5nGNP/f8D5AcHzgwAiGg8Df+uh9QGAAM/jw+oDh9QGIhoVAM/j/9k=',
)
const RGB2 = ' /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8'
const GRAY2 = ' /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8'
const PIXELS = Uint8Array.from([200, 30, 30, 30, 200, 30, 30, 30, 200, 220, 220, 30])
/** a row's words at baseline y, Helvetica 10 from x 20 */
const words = (s: string, y: number, pre = '') => `BT ${pre}/F1 10 Tf 20 ${y} Td (${s}) Tj ET\n`
/** an image XObject painted over [x0, x0 + w] x [y - 10, y + 15]: a row's band and more */
const over = (name: string, y: number, w = 150, x0 = 10, gs = '') => `q ${gs}${w} 0 0 25 ${x0} ${y - 10} cm /${name} Do Q\n`
/** each row: its words, whether the page shows them, and what the figure paints of it (given its baseline) */
const ROWS: { s: string; shown: boolean; paint: (y: number) => string }[] = [
  { s: 'Shown words', shown: true, paint: (y) => words('Shown words', y) },
  // (outside the clip in force: the clip ends below the row)
  { s: 'Clipped words', shown: false, paint: (y) => `q 0 0 400 ${y - 8} re W n\n${words('Clipped words', y)}Q\n` },
  // (the mode is the graphics state's: set inside q and Q, so that the rows after paint)
  { s: 'Invisible words', shown: false, paint: (y) => `q ${words('Invisible words', y, '3 Tr ')}Q\n` },
  { s: 'Faint words', shown: false, paint: (y) => `q /Zero gs\n${words('Faint words', y)}Q\n` },
  { s: 'Filled words', shown: false, paint: (y) => `${words('Filled words', y)}1 1 1 rg 10 ${y - 10} 150 25 re f 0 g\n` },
  // (an opaque image painted after: the screenshot over the mock)
  { s: 'Imaged words', shown: false, paint: (y) => words('Imaged words', y) + over('Img', y) },
  // (the same image over the first word alone, "Halved" from x 20: its glyphs whole up to 42)
  { s: 'Halved words', shown: false, paint: (y) => words('Halved words', y) + over('Img', y, 32) },
  // (an inline image, which PDF.js decodes into the list: its samples read there)
  {
    s: 'Inlined words',
    shown: false,
    paint: (y) => `${words('Inlined words', y)}q 150 0 0 25 10 ${y - 10} cm BI /W 2 /H 2 /CS /RGB /BPC 8 ID ${latin(PIXELS)} EI Q\n`,
  },
  // (a stencil of one sample that paints, in white: the colour inside the image's own q and Q)
  { s: 'Stamped words', shown: false, paint: (y) => `${words('Stamped words', y)}q 1 g ${over('Dot', y).slice(2)}` },
  // (a stencil of many samples, thin stripes: a stripe paints over part of each glyph, none whole)
  { s: 'Striped words', shown: true, paint: (y) => `${words('Striped words', y)}q 1 g ${over('Stripes', y).slice(2)}` },
  { s: 'Masked words', shown: true, paint: (y) => words('Masked words', y) + over('Soft', y) },
  { s: 'Painted words', shown: true, paint: (y) => words('Painted words', y) + over('Jpx', y) },
  { s: 'Lighter words', shown: true, paint: (y) => words('Lighter words', y) + over('Img', y, 150, 10, '/Half gs ') },
  // (the image the clip keeps below the row: it shows, and none of it reaches the words)
  { s: 'Clear words', shown: true, paint: (y) => `${words('Clear words', y)}q 0 0 400 ${y - 5} re W n\n${over('Img', y)}Q\n` },
  { s: 'Labelled words', shown: true, paint: (y) => over('Img', y) + words('Labelled words', y) },
]
const TOP = 30 * ROWS.length + 40
const yOf = (i: number) => TOP - 30 - 30 * i
const FIGURE = ROWS.map((r, i) => r.paint(yOf(i))).join('')

function objects(): Map<number, Obj> {
  return new Map<number, Obj>([
    [1, { text: '<< /Type /Catalog /Pages 2 0 R >>' }],
    [2, { text: `<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 400 ${TOP}] >>` }],
    [3, { text: '<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Fig 20 0 R >> >> /Contents 5 0 R >>' }],
    [5, { dict: '', data: enc('q 1 0 0 1 0 0 cm /Fig Do Q\n') }],
    [10, { text: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>' }],
    [
      20,
      {
        dict: ` /Type /XObject /Subtype /Form /BBox [0 0 400 ${TOP}] /Resources << /Font << /F1 10 0 R >> /XObject << /Img 30 0 R /Soft 31 0 R /Jpx 33 0 R /Dot 34 0 R /Stripes 35 0 R >> /ExtGState << /Zero 40 0 R /Half 41 0 R >> >>`,
        data: enc(FIGURE),
      },
    ],
    [30, { dict: RGB2, data: PIXELS }],
    [31, { dict: `${RGB2} /SMask 32 0 R`, data: PIXELS }],
    [32, { dict: GRAY2, data: Uint8Array.from([255, 0, 0, 255]) }],
    [33, { dict: ' /Type /XObject /Subtype /Image /Width 8 /Height 8 /Filter /JPXDecode /SMaskInData 1', data: JPX }],
    // (a stencil's sample 0 paints, its /Decode [0 1] by default)
    [34, { dict: ' /Type /XObject /Subtype /Image /Width 1 /Height 1 /BitsPerComponent 1 /ImageMask true', data: Uint8Array.from([0]) }],
    [35, { dict: ' /Type /XObject /Subtype /Image /Width 64 /Height 1 /BitsPerComponent 1 /ImageMask true', data: new Uint8Array(8).fill(0x55) }],
    [40, { text: '<< /Type /ExtGState /ca 0 /CA 0 >>' }],
    [41, { text: '<< /Type /ExtGState /ca 0.5 /CA 0.5 >>' }],
  ])
}

const STANDARD_FONTS = `${dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))}/standard_fonts/`
const PDFJS = { getDocument, OPS } as never
const OPTIONS = { verbosity: 0, standardFontDataUrl: STANDARD_FONTS, ...LITE }
type Read = PageInk & { view: number[] }
/** arXiv's page as the prepare reads it (readArxiv), and as a reading of no images reads it (B's: readPdf with `turned` alone) */
let page: Read, noImages: PageInk
beforeAll(async () => {
  await installLiteWorker()
  const bytes = pdfOf(objects(), { root: 1 })
  const a = await readArxiv(PDFJS, bytes, OPTIONS)
  page = { ...(a.pages[0]!.raw as PageInk), view: [0, 0, 400, TOP] }
  noImages = (await readPdf(PDFJS, bytes, { options: OPTIONS, turned: true })).pages[0]!.raw as PageInk
})
/** the glyphs of a row's words (its baseline), no blank */
const glyphsOf = (r: PageInk, s: string) => {
  const y = yOf(ROWS.findIndex((x) => x.s === s))
  return r.glyphs.filter((g) => !g.blank && Math.abs(g.y - y) < 0.01)
}
const unseenOf = (r: PageInk, s: string) => glyphsOf(r, s).map((g) => g.unseen ?? false)

describe('a figure text is a unit only where the original page shows it', () => {
  it('every row is read: its glyphs placed on its baseline, but those of a rendering mode that paints nothing', () => {
    for (const r of ROWS) expect(glyphsOf(page, r.s).map((g) => g.u).join(''), r.s).toBe(r.s.startsWith('Invisible') ? '' : r.s.replace(' ', ''))
  })
  it('the units are the rows the page shows, and none of those it hides', () => {
    const units = figureUnitsOf([page] as never, null).units.map((u) => u.text)
    expect(units.sort()).toEqual(ROWS.filter((r) => r.shown).map((r) => r.s).sort())
  })
  it('a glyph an opaque image painted after it covers whole is not shown (pageInk `unseen`), as one an opaque fill covers is', () => {
    const all = Array(11).fill(true)
    expect(unseenOf(page, 'Filled words')).toEqual(all)
    expect(unseenOf(page, 'Imaged words')).toEqual(all)
    expect(unseenOf(page, 'Inlined words')).toEqual([...all, true])
    expect(unseenOf(page, 'Stamped words')).toEqual([...all, true])
    // ("Halved": H, a, l, v inside the image's square [10, 42], the e across its edge and "words" past it)
    expect(unseenOf(page, 'Halved words')).toEqual([true, true, true, true, false, false, false, false, false, false, false])
  })
  it('a paint after the text whose samples can let it through covers nothing: a soft mask, a JPX soft mask, an alpha of 0.5, a stencil of many samples', () => {
    for (const s of ['Masked words', 'Painted words', 'Lighter words', 'Striped words']) expect(unseenOf(page, s).some(Boolean), s).toBe(false)
  })
  it('nor does an image the clip keeps clear of the text, nor one painted before it (a label on a screenshot)', () => {
    for (const s of ['Clear words', 'Labelled words']) expect(unseenOf(page, s).some(Boolean), s).toBe(false)
  })
  it('a reading given no images (B\'s) reads no image as covering: the fill alone hides', () => {
    expect(unseenOf(noImages, 'Filled words')).toEqual(Array(11).fill(true))
    for (const s of ['Imaged words', 'Halved words', 'Inlined words', 'Stamped words']) expect(unseenOf(noImages, s).some(Boolean), s).toBe(false)
  })
})
