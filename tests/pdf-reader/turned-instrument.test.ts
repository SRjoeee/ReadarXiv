// @vitest-environment node
// RED (lane turned, the fix not built): the instrument over a marked compile of our own (pdf-lib, Helvetica, points written as a
// marked compile writes them, `/axt-<name> ri`), its pages read by PDF.js as the box reads them (readPdf with `turned`).
// (1) The spell check's verdict reaches the unit's statement: a unit the ownership refuses as `spell` stays the original's for
// THAT reason (InstrumentUnit.why), as one it refuses as `marks` does (instrument.ts states `why` for `marks` alone, so the
// prepare's dump reads `no ink` or `text past its source` for a spell refusal: the cause lost).
// (2) A table cell whose text TeX set turned (\rotatebox{90}{…}: a rotation in the content stream) is owned by its turned glyphs
// between its points, and the instrument states them its own (Instrument.turned), as it states a level glyph's owner.
import * as PL from '@cantoo/pdf-lib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import type { PdfJs } from '@readarxiv/engine'
import { instrumentOf } from '../../packages/engine/src/instrument/instrument.ts'
import { DOCUMENT_OPTIONS } from './helpers/ocg-pdfs'

const pdfjs = { getDocument, OPS } as unknown as PdfJs
/** a page of Helvetica, its content stream the given operators */
async function pdfOf(content: string): Promise<Uint8Array> {
  const doc = await PL.PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(PL.StandardFonts.Helvetica)
  page.node.setFontDictionary(PL.PDFName.of('F1'), font.ref)
  page.node.set(PL.PDFName.of('Contents'), doc.context.register(doc.context.flateStream(content)))
  return doc.save({ useObjectStreams: false })
}
const unitOf = (kind: string, s: string, more: Record<string, unknown> = {}) =>
  ({ file: 'main.tex', kind, start: 0, end: s.length, pieces: [{ t: 'text', s }], ...more }) as never
const run = async (content: string, units: never[]) =>
  instrumentOf({ paper: { units }, finalPdf: await pdfOf(content), pdfjs, documentOptions: DOCUMENT_OPTIONS, made: { compiler: 'pdflatex', tree: '2025', front: 'test' } })

describe('the spell check’s verdict (RED: the fix is not built)', () => {
  it('is the unit’s stated reason: a paragraph whose points hold words its source does not write', async () => {
    // (TeX set "Hello World" between the points of a unit whose source writes "Hello": no line of its own to let go, the
    // ownership refuses it as spell)
    const { instrument, today } = await run('/axt-0s ri BT /F1 10 Tf 72 700 Td (Hello World) Tj ET /axt-0e ri', [unitOf('para', 'Hello')])
    expect(today.own.units.get(0)?.unhidden).toBe('spell')
    expect(instrument.units[0]!.why).toBe('spell')
  })
})

describe('a table cell whose text TeX set turned (RED: the fix is not built)', () => {
  it('is owned by its turned glyphs between its points, which the instrument states its own', async () => {
    // (a header cell's word set a quarter turned, \rotatebox{90}: its text matrix rotated by the content stream's cm; a level
    // cell beside it)
    const content = [
      '/axt-t0s ri BT /F1 8 Tf 72 700 Td (Method) Tj ET /axt-t0e ri',
      '/axt-t1s ri q 0 1 -1 0 150 680 cm BT /F1 8 Tf 0 0 Td (Recall) Tj ET Q /axt-t1e ri',
    ].join('\n')
    const units = [unitOf('cell', ' Method ', { cell: { table: 0, row: 0, col: 0 } }), unitOf('cell', ' Recall ', { cell: { table: 0, row: 0, col: 1 } })]
    const { instrument, today } = await run(content, units)
    expect(today.own.units.get(0)?.unhidden).toBeNull()
    expect(instrument.ink.pages[0]!.turned?.map((t) => t.u).join('')).toBe('Recall')
    expect(today.own.units.get(1)?.unhidden).toBeNull()
    expect(instrument.units[1]!.why).toBeUndefined()
    expect([...(instrument.turned?.[0]?.unit ?? [])]).toEqual([1, 1, 1, 1, 1, 1])
  })
})
