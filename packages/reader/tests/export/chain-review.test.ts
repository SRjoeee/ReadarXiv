// @vitest-environment node
// The export's chain against #685's review, each finding on a document of our own: what the paper says written into our section
// only as PDF strings and names; the left half of a side-by-side page drawn from arXiv's own objects, never the add-on's
// rewritten forms; a page's boxes widened whatever it inherits; objects written again under their own generations; the paper's
// own optional content kept as it set it; a formula's crop drawn between the words it stands among.
import * as PL from '@cantoo/pdf-lib'
import {
  openObjects,
  type PdfArray,
  type PdfDict,
  type PdfLib,
  type PdfRawStream,
  type PdfRef,
} from '@readarxiv/engine'
import { describe, expect, it } from 'vitest'
import type { Item, Page } from '../../src/compose/page.ts'
import { exportPdf, type Glyphs } from '../../src/export/chain.ts'
import { readSfnt } from '../../src/export/fonts.ts'
import { cs } from './cff-build.ts'
import { latin1, type Obj, pdf, update } from './pdf-build.ts'
import { buildSfnt } from './sfnt-build.ts'

const L = PL as unknown as PdfLib
const N = (s: string) => L.PDFName.of(s)
const FACE = '400 100px "axt-test"'
const font = readSfnt(
  'review',
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
const widths = Array.from({ length: 95 }, () => 500).join(' ')
const F1 = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FirstChar 32 /LastChar 126 /Widths [${widths}] >>`

/** one page laid: a member whose text group is off, its line's items given */
const laid = (items: Item[], links: Page['links'] = []): Page => ({
  page: 1,
  wait: { rows: [], faces: [] },
  links,
  members: [
    { ord: 1, page: 1, state: 'laid', off: 1, lines: [[700, 72, 400, items]], lit: { left: [], right: [], own: [] } },
  ],
})
const run = (s: string, x = 72): Item => ({ s, x, face: FACE, size: 10 })

/** arXiv's document (`objects`, 1 the catalog) and the add-on over it (`addOn`, by number), the document's size after it */
const composedOf = (objects: Obj[], addOn: Record<number, Obj>, size: number) => {
  const a = pdf(objects)
  return { bytes: update(a, addOn, size), seam: a.length }
}
async function made(c: { bytes: Uint8Array; seam: number }, page: Page, form: 'translation' | 'side-by-side') {
  const r = await exportPdf({ composed: c.bytes, seam: c.seam, pages: new Map([[1, page]]), glyphs, PL: L, form })
  const file = new Uint8Array(r.parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of r.parts) {
    file.set(p, at)
    at += p.length
  }
  const X = openObjects(file, { PL: L, objectsMax: 1e5, decodedMax: 1 << 24 })
  return { X, file, section: latin1(file.subarray(c.bytes.length)) }
}
const look = (X: ReturnType<typeof openObjects>, v: unknown) => (v instanceof L.PDFRef ? X.lookup(v as PdfRef) : v)
const decoded = (X: ReturnType<typeof openObjects>, v: unknown) =>
  latin1(L.decodePDFRawStream(look(X, v) as PdfRawStream).decode())

/** the plain document: a page of Helvetica text, its first word wrapped by the add-on in group 7 (axt:1.1.t) */
const plain = (o: { pageExtra?: string; pagesExtra?: string } = {}) =>
  composedOf(
    [
      '<< /Type /Catalog /Pages 2 0 R >>',
      `<< /Type /Pages /Kids [3 0 R] /Count 1 ${o.pagesExtra ?? ''} >>`,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ${o.pageExtra ?? ''} /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
      { dict: '', data: 'BT /F1 10 Tf 72 700 Td (Hello) Tj ( World) Tj ET' },
      F1,
    ],
    {
      1: '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [7 0 R] /D << /BaseState /ON /ON [7 0 R] >> >> >>',
      3: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ${o.pageExtra ?? ''} /Resources << /Font << /F1 5 0 R >> /Properties << /G0 7 0 R >> >> /Contents 6 0 R >>`,
      6: { dict: '', data: 'BT /F1 10 Tf 72 700 Td /OC /G0 BDC (Hello) Tj EMC ( World) Tj ET' },
      7: '<< /Type /OCG /Name (axt:1.1.t) >>',
    },
    8,
  )

describe('what the paper says is written as PDF strings and names, never as PDF syntax (#685: 4703881927)', () => {
  const annotOf = async (dest: string) => {
    const { X } = await made(plain(), laid([run('\u6587')], [[[72, 690, 100, 710], { dest }]]), 'translation')
    const annots = look(X, X.pages()[0]!.node.get(N('Annots'))) as PdfArray
    return look(X, annots.get(0)) as PdfDict
  }
  it('a named destination of a document with no name tree: one name, its delimiters escaped', async () => {
    const a = await annotOf(JSON.stringify('sec 1/JS>> /A <<'))
    expect(a.get(N('Dest'))?.toString()).toBe('/sec#201#2FJS#3E#3E#20#2FA#20#3C#3C')
    expect(
      a
        .entries()
        .map(([k]) => k.toString())
        .sort(),
    ).toEqual(['/Border', '/Dest', '/Rect', '/Subtype', '/Type'])
  })
  it('an explicit destination: its names escaped, its numbers numbers, and anything else null', async () => {
    const a = await annotOf(JSON.stringify([{ num: 3, gen: 0 }, { name: 'XY Z' }, null, ') /JS (x', 700]))
    expect(a.get(N('Dest'))?.toString()).toBe('[ 3 0 R /XY#20Z null null 700 ]')
  })
})

describe("the left half of a side-by-side page is arXiv's own drawing (#685: 4703877261, 4703881297)", () => {
  it("draws a figure form the add-on wrote again from arXiv's own revision of it, under a number of its own", async () => {
    const figure = 'BT /F1 10 Tf 72 600 Td (FigText) Tj ET'
    const c = composedOf(
      [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources 8 0 R /Contents 4 0 R >>',
        { dict: '', data: 'BT /F1 10 Tf 72 700 Td (Hello) Tj ET /Fm Do' },
        F1,
        {
          dict: '/Type /XObject /Subtype /Form /BBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >>',
          data: figure,
        },
        '<< >>',
        '<< /Font << /F1 5 0 R >> /XObject << /Fm 6 0 R >> >>',
      ],
      {
        1: '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [10 0 R] /D << /BaseState /ON /ON [10 0 R] >> >> >>',
        3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> /XObject << /Fm 6 0 R >> /Properties << /G0 10 0 R >> >> /Contents 9 0 R >>',
        6: {
          dict: '/Type /XObject /Subtype /Form /BBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> /Properties << /G0 10 0 R >> >>',
          data: 'BT /F1 10 Tf 72 600 Td /OC /G0 BDC (FigText) Tj EMC ET',
        },
        9: { dict: '', data: 'BT /F1 10 Tf 72 700 Td (Hello) Tj ET /Fm Do' },
        10: '<< /Type /OCG /Name (axt:1.1.t) >>',
      },
      11,
    )
    const { X } = await made(c, laid([run('\u6587')]), 'side-by-side')
    const xo = look(X, look(X, X.pages()[0]!.node.get(N('Resources'))) as PdfDict) as PdfDict
    const left = look(X, (look(X, xo.get(N('XObject'))) as PdfDict).get(N('AXTL'))) as PdfRawStream
    const res = look(X, left.dict.get(N('Resources'))) as PdfDict
    const fm = (look(X, res.get(N('XObject'))) as PdfDict).get(N('Fm')) as PdfRef
    expect(fm.objectNumber).not.toBe(6)
    const text = decoded(X, fm)
    expect([text.includes('(FigText) Tj'), text.includes('BDC')]).toEqual([true, false])
  })
})

describe("a side-by-side page's boxes are its own, widened, whatever it inherits (#685: 4703877269, 4703881152)", () => {
  it('writes the crop box it inherits and its own bleed, trim and art boxes twice as wide', async () => {
    const c = plain({
      pagesExtra: '/CropBox [0 0 612 792]',
      pageExtra: '/BleedBox [0 0 612 792] /TrimBox [0 0 612 792] /ArtBox [0 0 612 792]',
    })
    const { X } = await made(c, laid([run('\u6587')]), 'side-by-side')
    const node = X.pages()[0]!.node
    for (const box of ['MediaBox', 'CropBox', 'BleedBox', 'TrimBox', 'ArtBox'])
      expect([box, node.get(N(box))?.toString()]).toEqual([box, '[ 0 0 1224 792 ]'])
  })
})

describe('objects written again keep their generation (#685: 4703881235)', () => {
  it('a page and a catalog of generation 2: written again as generation 2, every reference to them still theirs', async () => {
    const c = composedOf(
      [
        { gen: 2, obj: '<< /Type /Catalog /Pages 2 0 R >>' },
        '<< /Type /Pages /Kids [3 2 R] /Count 1 >>',
        {
          gen: 2,
          obj: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
        },
        { dict: '', data: 'BT /F1 10 Tf 72 700 Td (Hello) Tj ( World) Tj ET' },
        F1,
      ],
      {
        1: {
          gen: 2,
          obj: '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [7 0 R] /D << /BaseState /ON /ON [7 0 R] >> >> >>',
        },
        3: {
          gen: 2,
          obj: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> /Properties << /G0 7 0 R >> >> /Contents 6 0 R >>',
        },
        6: { dict: '', data: 'BT /F1 10 Tf 72 700 Td /OC /G0 BDC (Hello) Tj EMC ( World) Tj ET' },
        7: '<< /Type /OCG /Name (axt:1.1.t) >>',
      },
      8,
    ).bytes
    // (the trailer's /Root names the catalog's generation)
    const bytes = Uint8Array.from(latin1(c).replaceAll('/Root 1 0 R', '/Root 1 2 R'), (ch) => ch.charCodeAt(0))
    const seam = latin1(bytes).indexOf('%%EOF') + 6
    const { X, section } = await made({ bytes, seam }, laid([run('\u6587')]), 'translation')
    expect(section).toMatch(/\b3 2 obj\b/)
    expect(section).toMatch(/\b1 2 obj\b/)
    expect(X.pages()).toHaveLength(1)
    expect(decoded(X, X.pages()[0]!.node.get(N('Contents')))).toContain('AXTF0')
  })
})

describe("the paper's own optional content stays as it set it; only ours go off (#685: 4703881388)", () => {
  it("keeps the paper's group off and its ink in its own marks, and turns ours off, out of the ON list", async () => {
    const c = composedOf(
      [
        '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [9 0 R] /D << /OFF [9 0 R] >> >> >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> /Properties << /P0 9 0 R >> >> /Contents 4 0 R >>',
        { dict: '', data: 'BT /F1 10 Tf 72 700 Td (Hello) Tj /OC /P0 BDC (Secret) Tj EMC ET' },
        F1,
        '<< >>',
        '<< >>',
        '<< >>',
        '<< /Type /OCG /Name (axt:9.1.t) >>',
      ],
      {
        1: '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [9 0 R 10 0 R] /D << /ON [10 0 R] /OFF [9 0 R] >> >> >>',
        3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> /Properties << /P0 9 0 R /G0 10 0 R >> >> /Contents 11 0 R >>',
        10: '<< /Type /OCG /Name (axt:1.1.t) >>',
        11: { dict: '', data: 'BT /F1 10 Tf 72 700 Td /OC /G0 BDC (Hello) Tj EMC /OC /P0 BDC (Secret) Tj EMC ET' },
      },
      12,
    )
    const { X } = await made(c, laid([run('\u6587')]), 'translation')
    const root = X.lookup(X.trailer.root as PdfRef) as PdfDict
    const d = look(X, (look(X, root.get(N('OCProperties'))) as PdfDict).get(N('D'))) as PdfDict
    expect(d.get(N('OFF'))?.toString()).toBe('[ 9 0 R 10 0 R ]')
    expect(d.get(N('ON'))?.toString() ?? '[ ]').toBe('[ ]')
    const text = decoded(X, X.pages()[0]!.node.get(N('Contents')))
    expect(text).toMatch(/\/OC \/P0 BDC\s+\(Secret\) Tj\s+EMC/)
  })
})

describe("a formula's crop is drawn between the words it stands among (#685: 4703881576)", () => {
  it('writes the crop between the runs before and after it, in the line’s order', async () => {
    const crop: Item = { s: 'x', x: 90, src: [1, 200, 690, 220, 710, 700], k: 1, piece: 'p0' }
    const { X } = await made(plain(), laid([run('\u6587', 72), crop, run('\u5b57', 130)]), 'translation')
    const text = decoded(X, X.pages()[0]!.node.get(N('Contents')))
    const a = text.indexOf('<04B0>'),
      b = text.indexOf('Do'),
      z = text.indexOf('<0514>')
    expect(a >= 0 && b > a && z > b).toBe(true)
  })
})
