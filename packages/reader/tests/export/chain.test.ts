// @vitest-environment node
// The export's chain (export/chain.ts) over a composed document of our own: arXiv's bytes stood in by a one-page document, the
// add-on by a section wrapping its first word in a group of ours, one laid page with a run of two CJK characters in a font of
// our own. Both files are read back by the engine's object layer and by PDF.js (its text: the translation's characters, the
// English the group held gone, the English beside it kept).
import * as PL from '@cantoo/pdf-lib'
import { openObjects, type PdfDict, type PdfLib, type PdfRawStream, type PdfRef } from '@readarxiv/engine'
import { describe, expect, it } from 'vitest'
import type { Page } from '../../src/compose/page.ts'
import { readCff } from '../../src/export/cff.ts'
import { exportPdf, type Glyphs } from '../../src/export/chain.ts'
import { readSfnt } from '../../src/export/fonts.ts'
import { cs } from './cff-build.ts'
import { latin1, pdf, update } from './pdf-build.ts'
import { buildSfnt } from './sfnt-build.ts'

const L = PL as unknown as PdfLib
const widths = Array.from({ length: 95 }, () => 500)
const original = () =>
  pdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    { dict: '', data: 'BT /F1 10 Tf 72 700 Td (Hello) Tj ( World) Tj ET' },
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FirstChar 32 /LastChar 126 /Widths [${widths.join(' ')}] >>`,
  ])
/** the add-on's shape: the catalog with its groups, the page with a content of its own wrapping "Hello" in group 7 */
const composed = () => {
  const a = original()
  const all = update(
    a,
    {
      1: '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [7 0 R] /D << /BaseState /ON >> >> >>',
      3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> /Properties << /G0 7 0 R >> >> /Contents 6 0 R >>',
      6: { dict: '', data: 'BT /F1 10 Tf 72 700 Td /OC /G0 BDC (Hello) Tj EMC ( World) Tj ET' },
      7: '<< /Type /OCG /Name (axt:1.1.t) >>',
    },
    8,
  )
  return { bytes: all, seam: a.length }
}
const FACE = '400 100px "axt-test"'
/** the run's two characters (U+6587, U+5B57), each a glyph of the font of ours */
const ONE = '\u6587'
const TWO = '\u6587\u5b57'
const font = readSfnt(
  'test',
  buildSfnt({
    glyphs: [
      cs('endchar'),
      cs(0, 0, 'rmoveto', 500, 0, 'rlineto', 'endchar'),
      cs(0, 0, 'rmoveto', 0, 500, 'rlineto', 'endchar'),
    ],
    gsubrs: [],
    lsubrs: [[]],
    cid: { fdOf: [0, 0, 0], cids: [0, 1200, 1300] },
    cmap: [
      [0x6587, 1],
      [0x5b57, 2],
    ],
    advances: [0, 1000, 1000],
  }).sfnt,
)!
const glyphs: Glyphs = {
  glyph: (face, cp) => (face === FACE && font.cmap.has(cp) ? { font, gid: font.cmap.get(cp)! } : null),
  offsets: (_face, text) => [...text].map((_, i) => i * 100),
}
const laid = (s: string): Page => ({
  page: 1,
  wait: { rows: [], faces: [] },
  links: [[[72, 690, 100, 710], { url: 'https://example.org/a b' }]],
  members: [
    {
      ord: 1,
      page: 1,
      state: 'laid',
      off: 1,
      lines: [[700, 72, 200, [{ s, x: 72, face: FACE, size: 10 }]]],
      lit: { left: [], right: [], own: [] },
    },
  ],
})

async function made(form: 'translation' | 'side-by-side', s = ONE) {
  const c = composed()
  const r = await exportPdf({ composed: c.bytes, seam: c.seam, pages: new Map([[1, laid(s)]]), glyphs, PL: L, form })
  const file = new Uint8Array(r.parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of r.parts) {
    file.set(p, at)
    at += p.length
  }
  return { file, stats: r.stats, prefix: r.parts[0], composed: c.bytes }
}
const contentOf = (file: Uint8Array) => {
  const X = openObjects(file, { PL: L, objectsMax: 1e5, decodedMax: 1 << 24 })
  const page = X.pages()[0]!
  const c = X.lookup(page.node.get(L.PDFName.of('Contents')) as PdfRef) as PdfRawStream
  return { X, page, text: latin1(L.decodePDFRawStream(c).decode()) }
}
async function pdfjsText(file: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: file.slice() })
  const tc = await (await (await task.promise).getPage(1)).getTextContent()
  await task.destroy()
  return tc.items.map((i) => ('str' in i ? i.str : '')).join('')
}

describe('the translated PDF', () => {
  it("is the composed document's bytes as given, and one section after them", async () => {
    const { file, prefix, composed: c } = await made('translation')
    expect(prefix).toBe(c)
    expect(latin1(file.subarray(c.length)).match(/startxref/g)).toHaveLength(1)
  })

  it('reads as the translation: its characters as text, the English its group held gone, the English beside it kept', async () => {
    const { file } = await made('translation', TWO)
    const t = await pdfjsText(file)
    expect(t).toContain(TWO)
    expect(t).not.toContain('Hello')
    expect(t).toContain('World')
  })

  it('draws the run in the slice as a Type0 font, its CFF subset to the glyphs drawn, its CIDs the slice’s', async () => {
    const { file, stats } = await made('translation')
    const { X, text } = contentOf(file)
    expect(text).toMatch(/\/AXTF0 10 Tf/)
    expect(text).toContain('<04B0>')
    const fontFile = X.numbers()
      .map((n) => X.lookup(L.PDFRef.of(n)))
      .find(
        (o) =>
          o instanceof L.PDFRawStream &&
          (o as PdfRawStream).dict.get(L.PDFName.of('Subtype'))?.toString() === '/CIDFontType0C',
      ) as PdfRawStream
    const cff = readCff(L.decodePDFRawStream(fontFile).decode())
    expect(cff.glyphs).toHaveLength(3)
    expect([...(cff.glyphs[2] ?? [])]).toEqual([14])
    expect([stats.fonts, stats.fontsWhole, stats.glyphs, stats.missing]).toEqual([1, 0, 1, 0])
  })

  it('turns the laid groups off in the default view and keeps its links where the reader draws them', async () => {
    const { file, stats } = await made('translation')
    const { X, page } = contentOf(file)
    const root = X.lookup(X.trailer.root as PdfRef) as PdfDict
    expect(root.get(L.PDFName.of('OCProperties'))?.toString()).toMatch(/\/OFF \[\s*7 0 R\s*\]/)
    expect(page.node.get(L.PDFName.of('Annots'))).toBeDefined()
    expect(stats.links).toBe(1)
  })
})

describe('the side-by-side PDF', () => {
  it('sets each page twice as wide: the original on the left, the translation on the right, its links moved', async () => {
    const { file } = await made('side-by-side')
    const { X, page, text } = contentOf(file)
    expect(page.node.get(L.PDFName.of('MediaBox'))?.toString()).toBe('[ 0 0 1224 792 ]')
    expect(text).toContain('/AXTL Do')
    expect(text).toContain('1 0 0 1 612 0 cm /AXTR Do')
    const annots = X.lookup(page.node.get(L.PDFName.of('Annots')) as PdfRef) ?? page.node.get(L.PDFName.of('Annots'))
    expect(annots?.toString()).toBeDefined()
    const t = await pdfjsText(file)
    expect(t).toContain('Hello')
    expect(t).toContain(ONE)
  })
})
