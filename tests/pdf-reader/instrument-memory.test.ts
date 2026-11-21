// @vitest-environment node
// What the front half's adapter holds of B (pipeline/instrument.mjs instrumentOf, lane mem-front): one copy of B's glyphs, the Doc's.
// readPdf lets a page's raw glyphs go once its Doc page is made (`rawGlyphs: false`), and the ownership reads the Doc's glyphs,
// which it never writes: the adapter's own copy of every glyph, and pageInk's, were two more of B's at once.
import * as PL from '@cantoo/pdf-lib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { type PdfJs, readPdf } from '@readarxiv/engine'
import { DOCUMENT_OPTIONS } from './helpers/ocg-pdfs'

const pdfjs = { getDocument, OPS } as unknown as PdfJs
async function pdfOf(lines: string[]): Promise<Uint8Array> {
  const doc = await PL.PDFDocument.create()
  const font = await doc.embedFont(PL.StandardFonts.Helvetica)
  for (const page of [doc.addPage([612, 792]), doc.addPage([612, 792])]) {
    page.node.setFontDictionary(PL.PDFName.of('F1'), font.ref)
    const content = lines.map((l, i) => `BT /F1 10 Tf 72 ${700 - 14 * i} Td (${l}) Tj ET`).join('\n')
    page.node.set(PL.PDFName.of('Contents'), doc.context.register(doc.context.stream(content)))
  }
  return doc.save({ useObjectStreams: false })
}

describe('readPdf without raw glyphs', () => {
  it('lets each page\'s raw glyphs go once its Doc page is made, the Doc and the rest of the raw page as they are', async () => {
    const bytes = await pdfOf(['A line of text', 'and another'])
    const all = await readPdf(pdfjs, bytes, { options: DOCUMENT_OPTIONS, turned: true })
    const lean = await readPdf(pdfjs, bytes, { options: DOCUMENT_OPTIONS, turned: true, rawGlyphs: false })
    expect(lean.pages.map((p) => p.raw?.glyphs.length)).toEqual([0, 0])
    expect(all.pages.map((p) => p.raw?.glyphs.length)).toEqual([25, 25])
    const fields = (g: Record<string, unknown>) => ['u', 'code', 'font', 'base', 'x0', 'x1', 'y', 'top', 'bottom', 'size', 'ix0', 'ix1', 'n', 'k', 'form', 'blank', 'fill'].map((f) => g[f])
    expect(lean.doc.pages.map((p) => p.glyphs.map((g) => fields(g as never)))).toEqual(all.doc.pages.map((p) => p.glyphs.map((g) => fields(g as never))))
    const { glyphs: _a, ...restAll } = all.pages[0]!.raw!
    const { glyphs: _l, ...restLean } = lean.pages[0]!.raw!
    expect(restLean).toEqual(restAll)
  })
})
