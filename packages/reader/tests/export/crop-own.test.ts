// @vitest-environment node
// A crop holds its own ink and nothing else (lane export-select): a member's elements share one group of the add-on's, so the
// form a crop is drawn from is cut by place, never by group alone. Each crop's form keeps the shows and paths whose ink meets
// that crop's box, and none of another element's or the label's text: a copy clipped out of sight is still text a viewer
// selects and copies where the copy stands (the side-by-side file of a paper read in macOS Preview, 22,700 such characters
// on its 8 pages).
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as PL from '@cantoo/pdf-lib'
import { openObjects, type PdfDict, type PdfLib, type PdfRawStream, type PdfRef } from '@readarxiv/engine'
import { describe, expect, it } from 'vitest'
import type { Item, Page } from '../../src/compose/page.ts'
import { exportPdf, type Glyphs } from '../../src/export/chain.ts'
import { latin1, type Obj, pdf, update } from './pdf-build.ts'

const L = PL as unknown as PdfLib
const N = (s: string) => L.PDFName.of(s)
const glyphs: Glyphs = { glyph: () => null, offsets: (_f, t) => [...t].map((_, i) => i * 100) }
// (every character 500 wide, a bar 0 wide: a glyph of no advance, its ink beside its origin)
const widths = Array.from({ length: 95 }, (_, i) => (i + 32 === 0x7c ? 0 : 500)).join(' ')
const F1 = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FirstChar 32 /LastChar 126 /Widths [${widths}] >>`
const F2 = `<< /Type /Font /Subtype /Type1 /BaseFont /AXTTest /FirstChar 32 /LastChar 126 /Widths [${widths}] /FontDescriptor 9 0 R >>`
const DESC =
  '<< /Type /FontDescriptor /FontName /AXTTest /Flags 32 /FontBBox [0 -200 600 800] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >>'

/** arXiv's page drawing `content`, and the add-on's same page with `wrapped` in its place (groups /T, /E, /L: the member's
 *  text, its elements, its label) */
const doc = (content: string, wrapped: string) => {
  const objects: Obj[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 8 0 R >> /ExtGState << /GS1 << /Font [8 0 R 20] >> /GS2 << /LW 20 >> >> >> /Contents 4 0 R >>',
    { dict: '', data: content },
    F1,
    '<< >>',
    '<< >>',
    F2,
    DESC,
  ]
  const a = pdf(objects)
  const addOn: Record<number, Obj> = {
    1: '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [10 0 R 11 0 R 12 0 R] /D << /BaseState /ON /ON [10 0 R 11 0 R 12 0 R] >> >> >>',
    3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 8 0 R >> /ExtGState << /GS1 << /Font [8 0 R 20] >> /GS2 << /LW 20 >> >> /Properties << /T 10 0 R /E 11 0 R /L 12 0 R >> >> /Contents 6 0 R >>',
    6: { dict: '', data: wrapped },
    10: '<< /Type /OCG /Name (axt:1.1.t) >>',
    11: '<< /Type /OCG /Name (axt:1.1.e) >>',
    12: '<< /Type /OCG /Name (axt:1.1.l) >>',
  }
  return { bytes: update(a, addOn, 13), seam: a.length }
}
/** the member laid: its text and its elements off, each crop an element at its source box (x0, x1 on the line at 700) */
const page = (crops: [x0: number, x1: number, piece: string][]): Page => ({
  page: 1,
  wait: { rows: [], faces: [] },
  links: [],
  members: [
    {
      ord: 1,
      page: 1,
      state: 'laid',
      off: 7,
      lines: [
        [
          400,
          72,
          400,
          crops.map(
            ([x0, x1, piece], k): Item => ({ s: piece, x: 100 + 40 * k, src: [1, x0, 697, x1, 709, 700], k: 1, piece }),
          ),
        ],
      ],
      lit: { left: [], right: [], own: [] },
    },
  ],
})
async function fileOf(c: { bytes: Uint8Array; seam: number }, p: Page, form: 'translation' | 'side-by-side') {
  const r = await exportPdf({ composed: c.bytes, seam: c.seam, pages: new Map([[1, p]]), glyphs, PL: L, form })
  const file = new Uint8Array(r.parts.reduce((n, x) => n + x.length, 0))
  let at = 0
  for (const x of r.parts) {
    file.set(x, at)
    at += x.length
  }
  return file
}
async function cropTexts(c: { bytes: Uint8Array; seam: number }, p: Page) {
  const file = await fileOf(c, p, 'translation')
  const X = openObjects(file, { PL: L, objectsMax: 1e5, decodedMax: 1 << 24 })
  const look = (v: unknown) => (v instanceof L.PDFRef ? X.lookup(v as PdfRef) : v)
  const node = X.pages()[0]!.node
  const xo = look((look(node.get(N('Resources'))) as PdfDict).get(N('XObject'))) as PdfDict
  const text = latin1(L.decodePDFRawStream(look(node.get(N('Contents'))) as PdfRawStream).decode())
  // (each crop's form in the order the page draws them)
  return [...text.matchAll(/\/(AXTC\S+) Do/g)].map((m) =>
    latin1(L.decodePDFRawStream(look(xo.get(N(m[1]!))) as PdfRawStream).decode()),
  )
}
/** the characters a content shows, as their bytes in hexadecimal (a literal string read by its characters) */
const shown = (content: string) =>
  [...content.matchAll(/\((.*?)\)\s*Tj|<([0-9A-Fa-f]*)>/g)]
    .map((m) =>
      m[1] !== undefined
        ? [...m[1]].map((c) => c.charCodeAt(0).toString(16).toUpperCase()).join('')
        : m[2]!.toUpperCase(),
    )
    .join('')
const hex = (s: string) => [...s].map((c) => c.charCodeAt(0).toString(16).toUpperCase()).join('')

describe('a crop holds its own ink and nothing else', () => {
  it("two formulas of one paragraph: each crop's form shows its own formula's characters alone", async () => {
    // (Hello 72-102, x=1 102-117, " and " 117-142, y=2 142-157, "(1)" the label 300-315)
    const content = 'BT /F1 10 Tf 72 700 Td (Hello x=1 and y=2) Tj 228 0 Td ((1)) Tj ET'
    const wrapped =
      'BT /F1 10 Tf 72 700 Td /OC /T BDC (Hello ) Tj EMC /OC /E BDC (x=1) Tj EMC /OC /T BDC ( and ) Tj EMC /OC /E BDC (y=2) Tj EMC 228 0 Td /OC /L BDC ((1)) Tj EMC ET'
    const forms = await cropTexts(
      doc(content, wrapped),
      page([
        [101.6, 117.4, 'p0'],
        [141.6, 157.4, 'p1'],
        [299.6, 315.4, 'label'],
      ]),
    )
    expect(forms.map(shown)).toEqual([hex('x=1'), hex('y=2'), hex('(1)')])
    // (the lean form: a show of no code of the crop's is written as nothing, not even its advance; the next show written
    // first makes up the line's way to where it stood: "Hello x=1 and " is 70 units, at size 10 a TJ of -7000)
    expect(forms[1]).toMatch(/\[-7000\] TJ\n\(y=2\) Tj/)
    expect(forms.map((f) => f.match(/TJ/g)?.length ?? 0)).toEqual([1, 1, 0])
  })

  it('a show holding both formulas is cut between them: each crop keeps the codes whose advance meets its box', async () => {
    // (x=1 102-117, y=2 117-132, in one show)
    const content = 'BT /F1 10 Tf 72 700 Td (Hello x=1y=2) Tj ET'
    const wrapped = 'BT /F1 10 Tf 72 700 Td /OC /T BDC (Hello ) Tj EMC /OC /E BDC (x=1y=2) Tj EMC ET'
    const forms = await cropTexts(
      doc(content, wrapped),
      page([
        [102.4, 116.6, 'p0'],
        [117.4, 131.6, 'p1'],
      ]),
    )
    expect(forms.map(shown)).toEqual([hex('x=1'), hex('y=2')])
    // (what follows a code left out stands where it stood: the codes before it are an advance in its place)
    expect(forms[1]).toMatch(/\[-?[\d.]+ <793D32>\] TJ/)
  })

  it('a glyph whose advance meets no crop of its member is kept where its font box meets the crop: no ink is lost', async () => {
    // (a bar of no advance at 100, its ink to its right within its font's box (0 to 600), then x at 100-105, in F2; and a
    // second formula far off at 200)
    const content = 'BT /F2 10 Tf 100 700 Td (|x) Tj 100 0 Td (z) Tj ET'
    const wrapped = 'BT /F2 10 Tf 100 700 Td /OC /E BDC (|x) Tj EMC 100 0 Td /OC /E BDC (z) Tj EMC ET'
    const forms = await cropTexts(
      doc(content, wrapped),
      page([
        [100.4, 105.4, 'p0'],
        [199.6, 205.4, 'p1'],
      ]),
    )
    expect(forms.map(shown)).toEqual([hex('|x'), hex('z')])
  })

  it('a path is kept in the crop whose box its ink meets, and in no other', async () => {
    // (a fraction's rule under x=1, and one under y=2)
    const content = 'BT /F1 10 Tf 102 700 Td (x=1) Tj 40 0 Td (y=2) Tj ET 102 698 15 0.4 re f 142 698 15 0.4 re f'
    const wrapped =
      'BT /F1 10 Tf 102 700 Td /OC /E BDC (x=1) Tj EMC 40 0 Td /OC /E BDC (y=2) Tj EMC ET /OC /E BDC 102 698 15 0.4 re f EMC /OC /E BDC 142 698 15 0.4 re f EMC'
    const forms = await cropTexts(
      doc(content, wrapped),
      page([
        [101.6, 117.4, 'p0'],
        [141.6, 157.4, 'p1'],
      ]),
    )
    expect(forms[0]).toContain('102 698 15 0.4 re')
    expect(forms[0]).not.toContain('142 698 15 0.4 re')
    expect(forms[1]).toContain('142 698 15 0.4 re')
    expect(forms[1]).not.toContain('102 698 15 0.4 re')
  })
})

// (poppler, where installed: the words pdftotext reads on each file's page against pdftoppm's drawing of it, 144 dpi)
const poppler = spawnSync('pdftotext', ['-v']).status === 0 && spawnSync('pdftoppm', ['-v']).status === 0
describe("a crop's cut against #690's review", () => {
  it('a font chosen by a graphics state (gs /Font) stays chosen: no Tf of the content written over it (4712006427)', async () => {
    // (F1 at 10 set by Tf, then GS1 sets F2 at 20; the formula x=1 at 102, 10 units a character at 20)
    const content = 'BT /F1 10 Tf /GS1 gs 72 700 Td (Hello x=1) Tj ET'
    const wrapped = 'BT /F1 10 Tf /GS1 gs 72 700 Td /OC /T BDC (Hello ) Tj EMC /OC /E BDC (x=1) Tj EMC ET'
    const [form] = await cropTexts(doc(content, wrapped), page([[131.6, 162.4, 'p0']]))
    expect(form).toContain('/GS1 gs')
    expect(form).not.toMatch(/\/F1 [\d.]+ Tf/)
    // ("Hello " is 60 units at 20: the way along the line a TJ of -3000 at the gs's size)
    expect(form).toMatch(/\[-3000\] TJ\n\(x=1\) Tj/)
  })

  it('a rectangle turned is bounded by its four corners: a crop that meets only a corner keeps it (4712006434)', async () => {
    // (a 10-unit square turned 45 degrees about (150, 690): its corners at x 150, 157.07, 142.93, 150; a crop over its left
    // corner alone, 142 to 146)
    const content = 'q 0.7071 0.7071 -0.7071 0.7071 150 690 cm 0 0 10 10 re f Q'
    const wrapped = '/OC /E BDC q 0.7071 0.7071 -0.7071 0.7071 150 690 cm 0 0 10 10 re f Q EMC'
    const forms = await cropTexts(doc(content, wrapped), page([[142, 146, 'p0']]))
    expect(forms[0]).toContain('0 0 10 10 re')
  })

  it("a glyph of no advance goes by its font's box, wherever its origin stands (4712014293)", async () => {
    // (a bar of no advance at 100, its ink to its right within its font's box (0 to 6 units); its origin inside the crop
    // before it, which ends at 100.4, its ink in the crop after it, from 100.4)
    const content = 'BT /F2 10 Tf 95 700 Td (x|) Tj ET'
    const wrapped = 'BT /F2 10 Tf 95 700 Td /OC /E BDC (x|) Tj EMC ET'
    const forms = await cropTexts(
      doc(content, wrapped),
      page([
        [94.6, 100.4, 'p0'],
        [100.4, 106.4, 'p1'],
      ]),
    )
    expect(shown(forms[1]!)).toContain(hex('|'))
  })
})

describe("a crop's cut against #690's second review", () => {
  it("a graphics state's line width (gs /LW) is the stroke's reach (4712232455)", async () => {
    // (a stroke at x 100, 20 wide: its ink from 90 to 110; a crop from 108 to 112)
    const content = '/GS2 gs 100 690 m 100 710 l S'
    const wrapped = '/OC /E BDC /GS2 gs 100 690 m 100 710 l S EMC'
    const [form] = await cropTexts(doc(content, wrapped), page([[108, 112, 'p0']]))
    expect(form).toContain('100 710 l')
  })

  it("a font a form inherits is written in its caller's resources, never inside the form (4712232449)", async () => {
    // (the page sets F1 at 10 and draws a form of resources of its own, no font among them, whose element group holds x=1)
    const objects: Obj[] = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> /XObject << /Fm 6 0 R >> >> /Contents 4 0 R >>',
      { dict: '', data: '/F1 10 Tf q /Fm Do Q' },
      F1,
      { dict: '/Type /XObject /Subtype /Form /BBox [0 0 612 792] /Resources << >>', data: 'BT 102 700 Td (x=1) Tj ET' },
    ]
    const a = pdf(objects)
    const addOn: Record<number, Obj> = {
      1: '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [7 0 R 8 0 R 9 0 R] /D << /BaseState /ON /ON [7 0 R 8 0 R 9 0 R] >> >> >>',
      6: {
        dict: '/Type /XObject /Subtype /Form /BBox [0 0 612 792] /Resources << /Properties << /E 7 0 R >> >>',
        data: 'BT 102 700 Td /OC /E BDC (x=1) Tj EMC ET',
      },
      7: '<< /Type /OCG /Name (axt:1.1.e) >>',
      8: '<< /Type /OCG /Name (axt:1.1.t) >>',
      9: '<< /Type /OCG /Name (axt:1.1.l) >>',
    }
    const file = await fileOf(
      { bytes: update(a, addOn, 10), seam: a.length },
      page([[101.6, 117.4, 'p0']]),
      'translation',
    )
    const X = openObjects(file, { PL: L, objectsMax: 1e5, decodedMax: 1 << 24 })
    const look = (v: unknown) => (v instanceof L.PDFRef ? X.lookup(v as PdfRef) : v)
    const xo = (d: PdfDict, n: string) =>
      look((look((look(d.get(N('Resources'))) as PdfDict).get(N('XObject'))) as PdfDict).get(N(n))) as PdfRawStream
    const text = (st: PdfRawStream) => latin1(L.decodePDFRawStream(st).decode())
    const crop = xo(X.pages()[0]!.node, 'AXTC1_1_0')
    const copy = xo(crop.dict, 'AXTB0')
    expect(text(crop)).toMatch(/\/F1 10 Tf[\s\S]*\/AXTB0 Do/)
    expect(text(copy)).not.toContain('/F1')
    expect(text(copy)).toContain('(x=1) Tj')
  })
})

describe.skipIf(!poppler)('a paragraph of two formulas and a label, exported: what poppler reads stands on ink', () => {
  const content = 'BT /F1 10 Tf 72 700 Td (Hello x=1 and y=2) Tj 228 0 Td ((1)) Tj ET'
  const wrapped =
    'BT /F1 10 Tf 72 700 Td /OC /T BDC (Hello ) Tj EMC /OC /E BDC (x=1) Tj EMC /OC /T BDC ( and ) Tj EMC /OC /E BDC (y=2) Tj EMC 228 0 Td /OC /L BDC ((1)) Tj EMC ET'
  // (the member laid on its own line at 400, its crops at 100, 140, 180: each crop's own ink alone there)
  const crops: [number, number, string][] = [
    [101.6, 117.4, 'p0'],
    [141.6, 157.4, 'p1'],
    [299.6, 315.4, 'label'],
  ]
  for (const form of ['translation', 'side-by-side'] as const)
    it(`the ${form} file: every word on ink, none across the page's halves`, async () => {
      const dir = mkdtempSync(join(tmpdir(), 'axt-own-'))
      try {
        writeFileSync(join(dir, 'f.pdf'), await fileOf(doc(content, wrapped), page(crops), form))
        spawnSync('pdftotext', ['-bbox', join(dir, 'f.pdf'), join(dir, 'w.html')])
        spawnSync('pdftoppm', ['-r', '144', '-gray', '-singlefile', join(dir, 'f.pdf'), join(dir, 'p')])
        const html = readFileSync(join(dir, 'w.html'), 'utf8')
        const half = Number(/<page width="([\d.]+)"/.exec(html)?.[1]) / 2
        const b = readFileSync(join(dir, 'p.pgm'))
        const [, W, H] = latin1(b.subarray(0, 40)).split(/\s+/).map(Number) as [number, number, number]
        const px = b.subarray(b.length - W * H)
        const words = [
          ...html.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g),
        ].map((m) => ({ box: m.slice(1, 5).map(Number) as [number, number, number, number], text: m[5]! }))
        const inked = ([x0, y0, x1, y1]: [number, number, number, number]) => {
          for (let r = Math.floor(y0 * 2); r < Math.min(H, Math.ceil(y1 * 2)); r++)
            for (let c = Math.floor(x0 * 2); c < Math.min(W, Math.ceil(x1 * 2)); c++)
              if (px[r * W + c]! < 200) return true
          return false
        }
        expect(words.length).toBeGreaterThan(0)
        expect(words.filter((w) => !inked(w.box)).map((w) => w.text)).toEqual([])
        if (form === 'side-by-side')
          expect(words.filter((w) => w.box[0] < half - 0.5 && w.box[2] > half + 0.5).map((w) => w.text)).toEqual([])
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
})
