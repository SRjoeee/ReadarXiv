// @vitest-environment node
// The export's chain (export/chain.ts) over a composed document of our own: arXiv's bytes stood in by a one-page document, the
// add-on by a section wrapping its first word in a group of ours, one laid page with a run of two CJK characters in a font of
// our own. Both files are read back by the engine's object layer and by PDF.js (its text: the translation's characters, the
// English the group held gone, the English beside it kept).
import * as PL from '@cantoo/pdf-lib'
import { openObjects, type PdfDict, type PdfLib, type PdfRawStream, type PdfRef } from '@readarxiv/engine'
import { brotliCompressSync, brotliDecompressSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import type { Page } from '../../src/compose/page.ts'
import { readCff } from '../../src/export/cff.ts'
import { exportPdf, type Glyphs } from '../../src/export/chain.ts'
import { readSfnt } from '../../src/export/fonts.ts'
import { sfntOfWoff2, woff2Payload } from '../../src/export/woff2.ts'
import { cs } from './cff-build.ts'
import { latin1, pdf, update } from './pdf-build.ts'
import { buildSfnt, buildTrueTypeWoff2 } from './sfnt-build.ts'

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
/** a TrueType face of ours (its glyf stored transformed in its WOFF2), for a run in `TT`: A and B */
const TT = '400 100px "axt-mono"'
const ttFont = (() => {
  const w = buildTrueTypeWoff2(
    {
      glyphs: [
        null,
        {
          contours: [
            [
              [0, 0, true],
              [500, 0, true],
              [250, 700, true],
            ],
          ],
        },
        {
          contours: [
            [
              [0, 0, true],
              [500, 0, true],
              [500, 700, true],
              [0, 700, true],
            ],
          ],
        },
      ],
      cmap: [
        [0x41, 1],
        [0x42, 2],
      ],
      advances: [600, 600, 600],
    },
    (b) => new Uint8Array(brotliCompressSync(b)),
  )
  const p = woff2Payload(w)!
  return readSfnt('mono', sfntOfWoff2(p, new Uint8Array(brotliDecompressSync(p.stream))))!
})()
const glyphs: Glyphs = {
  glyph: (face, cp) => {
    const f = face === FACE ? font : face === TT ? ttFont : null
    return f?.cmap.has(cp) ? { font: f, gid: f.cmap.get(cp)! } : null
  },
  offsets: (face, text) => [...text].map((_, i) => i * (face === TT ? 60 : 100)),
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
      lines: [
        [
          700,
          72,
          200,
          [
            { s, x: 72, face: FACE, size: 10 },
            { s: 'AB', x: 120, face: TT, size: 10 },
          ],
        ],
      ],
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
    expect(t).toContain('AB')
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
    expect([stats.fonts, stats.fontsWhole, stats.fontsTrueType, stats.glyphs, stats.missing]).toEqual([2, 0, 1, 3, 0])
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

describe('a file the export will not write', () => {
  it('refuses a translation with a character no slice of its face draws, rather than write a hole where the reader shows a letter', async () => {
    const c = composed()
    await expect(
      exportPdf({
        composed: c.bytes,
        seam: c.seam,
        pages: new Map([[1, laid('\u6587\u4e00')]]),
        glyphs,
        PL: L,
        form: 'translation',
      }),
    ).rejects.toMatchObject({ code: 'glyphs' })
  })
  it('stops at its next page once cancelled', async () => {
    const c = composed()
    const ac = new AbortController()
    ac.abort()
    await expect(
      exportPdf({
        composed: c.bytes,
        seam: c.seam,
        pages: new Map([[1, laid(ONE)]]),
        glyphs,
        PL: L,
        form: 'side-by-side',
        signal: ac.signal,
      }),
    ).rejects.toMatchObject({ code: 'aborted' })
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
