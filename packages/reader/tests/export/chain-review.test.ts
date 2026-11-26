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
const plain = (o: { pageExtra?: string; pagesExtra?: string; catalogExtra?: string } = {}) =>
  composedOf(
    [
      `<< /Type /Catalog /Pages 2 0 R ${o.catalogExtra ?? ''} >>`,
      `<< /Type /Pages /Kids [3 0 R] /Count 1 ${o.pagesExtra ?? ''} >>`,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ${o.pageExtra ?? ''} /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
      { dict: '', data: 'BT /F1 10 Tf 72 700 Td (Hello) Tj ( World) Tj ET' },
      F1,
    ],
    {
      1: `<< /Type /Catalog /Pages 2 0 R ${o.catalogExtra ?? ''} /OCProperties << /OCGs [7 0 R] /D << /BaseState /ON /ON [7 0 R] >> >> >>`,
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

describe('a named destination is written in the encoding PDF.js reads back as its name (#685: 4704253033)', () => {
  // (the name tree's keys: PDFDocEncoding's 0x84, an em dash; its 0xA0, the euro sign; UTF-16BE with its BOM for a CJK name and
  // for a no-break space, which PDFDocEncoding has no byte for. Sorted by their bytes, as a name tree keeps its keys)
  const names: [string, string][] = [
    ['(a\\204b)', 'a—b'],
    ['(x\\240y)', 'x€y'],
    // (UTF-16BE of a name PDFDocEncoding holds: PDF.js decodes both alike, poppler compares the bytes)
    ['<FEFF0061>', 'a'],
    ['<FEFF007800A00079>', 'x y'],
    ['<FEFF4E2D6587>', '\u4e2d\u6587'],
  ]
  const tree = `/Names << /Dests << /Names [${names.map(([k]) => `${k} [3 0 R /Fit]`).join(' ')}] >> >>`
  for (const form of ['translation', 'side-by-side'] as const)
    it(`each link of the ${form} file resolves through PDF.js to the page its name names`, async () => {
      const links: Page['links'] = names.map(([, name], i) => [
        [72, 600 + 20 * i, 100, 610 + 20 * i],
        { dest: JSON.stringify(name) },
      ])
      const { file } = await made(plain({ catalogExtra: tree }), laid([run('\u6587')], links), form)
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
      const task = pdfjs.getDocument({ data: file.slice() })
      const doc = await task.promise
      const annots = (await (await doc.getPage(1)).getAnnotations()).filter((a) => a.subtype === 'Link' && a.dest)
      const got = await Promise.all(
        annots.map(async (a) => [a.dest, ((await doc.getDestination(a.dest as string)) ?? [null])[1]?.name ?? null]),
      )
      await task.destroy()
      expect(got.sort()).toEqual(names.map(([, name]) => [name, 'Fit']).sort())
      // (byte for byte the tree's key, as a viewer that compares bytes looks a destination up: #686, 4705748922)
      const X = openObjects(file, { PL: L, objectsMax: 1e5, decodedMax: 1 << 24 })
      const annots2 = look(X, X.pages()[0]!.node.get(N('Annots'))) as PdfArray
      const written = annots2
        .asArray()
        .map((a) => (look(X, a) as PdfDict).get(N('Dest')))
        .filter((d) => !!d && !(d instanceof L.PDFArray))
        .map((d) => hexOfToken(String(d)))
      expect(written.sort()).toEqual(names.map(([k]) => hexOfToken(k)).sort())
    })
})

/** a PDF string token's bytes, as hex: a hexadecimal string's digits, a literal string's bytes with its escapes undone */
function hexOfToken(tok: string): string {
  if (tok.startsWith('<')) return tok.slice(1, -1).replace(/\s/g, '').toUpperCase()
  const out: number[] = []
  const body = tok.slice(1, -1)
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!
    if (c !== '\\') {
      out.push(c.charCodeAt(0) & 255)
      continue
    }
    const o = /^[0-7]{1,3}/.exec(body.slice(i + 1))
    if (o) {
      out.push(Number.parseInt(o[0], 8) & 255)
      i += o[0].length
    } else {
      const e = body[++i]!
      out.push({ n: 10, r: 13, t: 9, b: 8, f: 12 }[e] ?? e.charCodeAt(0))
    }
  }
  return out.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join('')
}

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

describe('a turned page set side by side in its upright frame (#685: 4704125905)', () => {
  // (the paper's own link on the page, a URI; the reader's laid link, a destination)
  const own =
    '/Annots [<< /Type /Annot /Subtype /Link /Rect [72 600 100 620] /Border [0 0 0] /A << /S /URI /URI (https://example.org/) >> >>]'
  const turned = (rotate: number) => plain({ pageExtra: `/Rotate ${rotate} ${own}` })
  const view = async (file: Uint8Array) => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task = pdfjs.getDocument({ data: file.slice() })
    const page = await (await task.promise).getPage(1)
    const vp = page.getViewport({ scale: 1 })
    const words = (await page.getTextContent()).items
      .filter((i) => 'str' in i && i.str.includes('World'))
      // (where the word ends: the item that holds it begins at Hello in a copy that draws it, after it in one that bakes it out)
      .map((i) => {
        const t = i as { transform: number[]; width: number }
        return vp.convertToViewportPoint(t.transform[4]! + t.width, t.transform[5]!)
      })
      .sort((a, b) => a[0]! - b[0]!)
    const annots = (await page.getAnnotations())
      .filter((a) => a.subtype === 'Link')
      .map((a) => {
        const r = a.rect as number[]
        const [x0] = vp.convertToViewportPoint(r[0]!, r[1]!)
        const [x1] = vp.convertToViewportPoint(r[2]!, r[3]!)
        return [
          a.url ? 'own' : 'laid',
          Math.min(x0!, x1!) >= vp.width / 2 ? 'right' : Math.max(x0!, x1!) <= vp.width / 2 ? 'left' : 'across',
        ] as const
      })
      .sort()
    await task.destroy()
    return { size: [vp.width, vp.height], words, annots }
  }
  for (const rotate of [0, 90, 180, 270])
    for (const laidPage of [true, false])
      it(`/Rotate ${rotate}, ${laidPage ? 'a laid page' : 'a page with nothing laid'}: twice as wide as it shows, the original on the left`, async () => {
        const [w, h] = rotate % 180 ? [792, 612] : [612, 792]
        const page = laidPage
          ? laid([run('\u6587')], [[[72, 690, 100, 710], { dest: JSON.stringify('x') }]])
          : { ...laid([]), members: [] }
        const { file } = await made(turned(rotate), page, 'side-by-side')
        const v = await view(file)
        expect(v.size).toEqual([2 * w, h])
        // (the same word of each copy: one page's width apart, on one line)
        expect(v.words).toHaveLength(2)
        expect(v.words[1]![0]! - v.words[0]![0]!).toBeCloseTo(w, 2)
        expect(v.words[1]![1]!).toBeCloseTo(v.words[0]![1]!, 2)
        expect(v.annots).toEqual(
          laidPage
            ? [
                ['laid', 'right'],
                ['own', 'left'],
              ]
            : [
                ['own', 'left'],
                ['own', 'right'],
              ],
        )
      })
})

describe('two characters one glyph draws are each read back as themselves (#686: 4705748606)', () => {
  // (a face whose small capitals draw i and dotless i with one glyph, I.sc: Computer Modern Unicode's; and a hyphen its cmap
  // gives two code points: the text a PDF reader takes back of each is its own, in either order)
  const shared: Glyphs = {
    glyph: (face, cp) =>
      face === FACE && [0x69, 0x131, 0x2d, 0x2010].includes(cp)
        ? { font, gid: cp === 0x2d || cp === 0x2010 ? 2 : 1 }
        : null,
    offsets: (_face, text) => [...text].map((_, i) => i * 100),
  }
  for (const order of [
    ['iı', 'ıi'],
    ['ıi', 'iı'],
  ])
    it(`reads back ${JSON.stringify(order)} as written, and both hyphens`, async () => {
      const page = laid([run(order[0]!, 72), run(order[1]!, 200), run('-‐', 300)])
      const c = plain()
      const r = await exportPdf({
        composed: c.bytes,
        seam: c.seam,
        pages: new Map([[1, page]]),
        glyphs: shared,
        PL: L,
        form: 'translation',
      })
      const file = new Uint8Array(r.parts.reduce((n, p) => n + p.length, 0))
      let at = 0
      for (const p of r.parts) {
        file.set(p, at)
        at += p.length
      }
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
      const task = pdfjs.getDocument({ data: file.slice() })
      const tc = await (await (await task.promise).getPage(1)).getTextContent()
      await task.destroy()
      const text = tc.items.map((i) => ('str' in i ? i.str : '')).join('')
      expect(text).toContain(order[0])
      expect(text).toContain(order[1])
      expect(text).toContain('-‐')
    })
})
