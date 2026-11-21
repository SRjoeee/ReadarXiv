// @vitest-environment node
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { pageInk } from '@readarxiv/engine'
import { figureUnitsOf } from '../../packages/engine/src/locate/figure-text.ts'
import { type Obj, pdfOf } from './helpers/delta-pdfs'
import { installLiteWorker, LITE } from './helpers/lite-pdfjs'

// A figure's text is a unit only where the original page shows it (PDF-READER §19.12, §18.98). A PDF of our own making, one
// included figure (a form XObject, as pdfTeX includes a PDF), each of its rows a word pair that the page shows or hides in one
// way, read as the box reads arXiv's page (PDF.js's lite worker: no image's pixels decoded; pageInk with `indices` and `turned`,
// as prepare.ts reads it) and cut by the figure reading. Hidden: by the clip in force, by the text rendering mode (3, PDF 9.3.6),
// by an alpha constant of 0, by an opaque fill painted after it (§18.98), and by an opaque image painted after it: an image
// XObject of no /SMask, no /Mask and no /SMaskInData, painted at an alpha of 1 under Normal and no soft mask, paints every point
// of its unit square (PDF 8.9.5, 11.6.4.3), as a screenshot pasted over a figure's vector mock of the same interface does
// (2606.07636v2's Figure 1). Shown: an image painted before the text (a label on a screenshot), and images painted after it whose
// samples can let it through: one with a soft mask, one whose JPX data holds its soft mask (/SMaskInData), one painted at an alpha
// of 0.5. A run holding a glyph the page does not show makes no unit (§18.98), so a word an image covers in part is none either.

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255)
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
/** each row: its words, its baseline, whether the page shows them */
const ROWS = [
  { s: 'Shown words', y: 370, shown: true },
  { s: 'Clipped words', y: 340, shown: false },
  { s: 'Invisible words', y: 310, shown: false },
  { s: 'Faint words', y: 280, shown: false },
  { s: 'Filled words', y: 250, shown: false },
  { s: 'Imaged words', y: 220, shown: false },
  { s: 'Halved words', y: 190, shown: false },
  { s: 'Masked words', y: 160, shown: true },
  { s: 'Painted words', y: 130, shown: true },
  { s: 'Lighter words', y: 100, shown: true },
  { s: 'Labelled words', y: 70, shown: true },
] as const
const FIGURE = [
  words('Shown words', 370),
  // (outside the clip in force: the clip [0, 300] up, the words at 340)
  `q 0 0 400 300 re W n\n${words('Clipped words', 340)}Q\n`,
  // (the mode is the graphics state's: set inside q and Q, so that the rows after paint)
  `q ${words('Invisible words', 310, '3 Tr ')}Q\n`,
  `q /Zero gs\n${words('Faint words', 280)}Q\n`,
  `${words('Filled words', 250)}1 1 1 rg 10 240 150 25 re f 0 g\n`,
  // (an opaque image painted after: the screenshot over the mock)
  words('Imaged words', 220) + over('Img', 220),
  // (the same image over the first word alone, "Halved" from x 20: its glyphs whole up to 42)
  words('Halved words', 190) + over('Img', 190, 32),
  words('Masked words', 160) + over('Soft', 160),
  words('Painted words', 130) + over('Jpx', 130),
  words('Lighter words', 100) + over('Img', 100, 150, 10, '/Half gs '),
  over('Img', 70) + words('Labelled words', 70),
].join('')

function objects(): Map<number, Obj> {
  return new Map<number, Obj>([
    [1, { text: '<< /Type /Catalog /Pages 2 0 R >>' }],
    [2, { text: '<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 400 400] >>' }],
    [3, { text: '<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Fig 20 0 R >> >> /Contents 5 0 R >>' }],
    [5, { dict: '', data: enc('q 1 0 0 1 0 0 cm /Fig Do Q\n') }],
    [10, { text: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>' }],
    [
      20,
      {
        dict: ' /Type /XObject /Subtype /Form /BBox [0 0 400 400] /Resources << /Font << /F1 10 0 R >> /XObject << /Img 30 0 R /Soft 31 0 R /Jpx 33 0 R >> /ExtGState << /Zero 40 0 R /Half 41 0 R >> >>',
        data: enc(FIGURE),
      },
    ],
    [30, { dict: RGB2, data: PIXELS }],
    [31, { dict: `${RGB2} /SMask 32 0 R`, data: PIXELS }],
    [32, { dict: GRAY2, data: Uint8Array.from([255, 0, 0, 255]) }],
    [33, { dict: ' /Type /XObject /Subtype /Image /Width 8 /Height 8 /Filter /JPXDecode /SMaskInData 1', data: JPX }],
    [40, { text: '<< /Type /ExtGState /ca 0 /CA 0 >>' }],
    [41, { text: '<< /Type /ExtGState /ca 0.5 /CA 0.5 >>' }],
  ])
}

const STANDARD_FONTS = `${dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))}/standard_fonts/`
type Read = ReturnType<typeof pageInk> & { view: number[] }
let page: Read
beforeAll(async () => {
  await installLiteWorker()
  const task = getDocument({ data: pdfOf(objects(), { root: 1 }), verbosity: 0, standardFontDataUrl: STANDARD_FONTS, ...LITE })
  try {
    const doc = await task.promise
    const p = await doc.getPage(1)
    const ink = pageInk(OPS, await p.getOperatorList(), p.commonObjs, { rotate: p.rotate, indices: true, turned: true, shapesAll: true })
    page = { ...ink, view: [...p.view] }
  } finally {
    await task.destroy()
  }
})
/** the glyphs of a row's words (its baseline), no blank */
const glyphsOf = (y: number) => page.glyphs.filter((g) => !g.blank && Math.abs(g.y - y) < 0.01)

describe('a figure text is a unit only where the original page shows it', () => {
  it('every row is read: its glyphs placed on its baseline, but those of a rendering mode that paints nothing', () => {
    for (const r of ROWS) expect(glyphsOf(r.y).map((g) => g.u).join(''), r.s).toBe(r.y === 310 ? '' : r.s.replace(' ', ''))
  })
  it('the units are the rows the page shows, and none of those it hides', () => {
    const units = figureUnitsOf([page] as never, null).units.map((u) => u.text)
    expect(units.sort()).toEqual(ROWS.filter((r) => r.shown).map((r) => r.s).sort())
  })
  it('a glyph an opaque image painted after it covers whole is not shown (pageInk `unseen`), as one an opaque fill covers is', () => {
    expect(glyphsOf(250).map((g) => g.unseen ?? false)).toEqual(Array(11).fill(true))
    expect(glyphsOf(220).map((g) => g.unseen ?? false)).toEqual(Array(11).fill(true))
    // ("Halved": H, a, l, v inside the image's square [10, 42], the e across its edge and "words" past it)
    expect(glyphsOf(190).map((g) => g.unseen ?? false)).toEqual([true, true, true, true, false, false, false, false, false, false, false])
  })
  it('an image painted after the text whose samples can let it through covers nothing: a soft mask, a JPX soft mask, an alpha of 0.5', () => {
    for (const y of [160, 130, 100]) expect(glyphsOf(y).some((g) => g.unseen), String(y)).toBe(false)
  })
  it('text painted after an image (a label on a screenshot) shows', () => {
    expect(glyphsOf(70).some((g) => g.unseen)).toBe(false)
  })
})
