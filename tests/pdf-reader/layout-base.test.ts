import * as PL from '@cantoo/pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { boxesCheck, creationEpochOf, finalCheck, hasMarkText, markTextOf, marksOfPdf, pageTextOf, pdfDateEpoch, textOfPdf, xmpDateEpoch, xmpDatesOf } from '@/pdf-reader/engine/layout/base.mjs'
import { ALLOCATION_FAILED } from '@/pdf-reader/engine/pipeline/memory.mjs'

// Our compile as the base page (layout/base.mjs; design note §3.1, §3.3): the final pass against the draft it was made of, our
// pages against arXiv's, no mark of ours printed as text, and arXiv's /CreationDate as the compiles' day.

type Dest = [{ num: number; gen: number }, { name: string }, number | null, number | null, number | null]
/** a PDF.js document of `pages` boxes and these destinations (a dest's page by its reference's number) */
function docOf(boxes: number[][], dests: Record<string, [page: number, x: number | null, y: number | null]>, o: { texts?: string[]; created?: string; rotate?: number[]; xmp?: string } = {}) {
  const wire: Record<string, Dest> = {}
  for (const [name, [page, x, y]] of Object.entries(dests)) wire[name] = [{ num: 100 + page, gen: 0 }, { name: 'XYZ' }, x, y, null]
  return {
    numPages: boxes.length,
    getPage: async (p: number) => ({ view: boxes[p - 1], rotate: o.rotate?.[p - 1] ?? 0, userUnit: 1, getTextContent: async () => ({ items: [{ str: o.texts?.[p - 1] ?? '' }] }) }),
    getDestinations: async () => wire,
    getPageIndex: async (ref: { num: number }) => ref.num - 101,
    getMetadata: async () => ({ info: o.created === undefined ? {} : { CreationDate: o.created }, metadata: o.xmp === undefined ? null : { getRaw: () => o.xmp } }),
  }
}
const A4 = [0, 0, 595.28, 841.89], LETTER = [0, 0, 612, 792]

describe('finalCheck: the final pass is the draft\'s page', () => {
  const marks = { 'axt-0s': [1, 72, 700] as [number, number, number], 'axt-0e': [1, 300.5, 650.25] as [number, number, number], 'axt-p0.1a': [2, 80, 600] as [number, number, number], 'axt-g1a': [2, 100, 400] as [number, number, number] }

  it('takes the same marks on the same pages within 0.01 pt, the same page count and boxes', async () => {
    const draft = docOf([LETTER, LETTER], marks)
    const shifted = Object.fromEntries(Object.entries(marks).map(([n, [p, x, y]]) => [n, [p, x + 0.004, y - 0.009]])) as typeof marks
    expect(await finalCheck(draft, docOf([LETTER, LETTER], shifted))).toEqual({ ok: true, marks: 4 })
    // (destinations of others than ours are not read)
    expect(await finalCheck(draft, docOf([LETTER, LETTER], { ...marks, 'section.1': [1, 0, 0] } as never))).toEqual({ ok: true, marks: 4 })
  })

  it('refuses a mark moved, on another page, missing or new, other pages, another box or rotation', async () => {
    const draft = docOf([LETTER, LETTER], marks)
    const cases: [ReturnType<typeof docOf>, RegExp][] = [
      [docOf([LETTER, LETTER], { ...marks, 'axt-0e': [1, 300.52, 650.25] }), /0e moved/],
      [docOf([LETTER, LETTER], { ...marks, 'axt-0e': [2, 300.5, 650.25] }), /0e is on page 1 in the draft, 2/],
      [docOf([LETTER, LETTER], { ...marks, 'axt-0e': [1, null, 650.25] }), /0e moved/],
      [docOf([LETTER, LETTER], { 'axt-0s': marks['axt-0s'], 'axt-0e': marks['axt-0e'], 'axt-p0.1a': marks['axt-p0.1a'] }), /4 marks, the final pass 3/],
      [docOf([LETTER, LETTER], { ...marks, 'axt-1s': [1, 0, 0] }), /4 marks, the final pass 5/],
      [docOf([LETTER, LETTER, LETTER], marks), /2 pages, the final pass 3/],
      [docOf([LETTER, A4], marks), /page 2's box/],
      [docOf([LETTER, LETTER], marks, { rotate: [0, 90] }), /rotated 0 and 90/],
    ]
    for (const [final, why] of cases) {
      const r = await finalCheck(draft, final)
      expect(r.ok, String(why)).toBe(false)
      expect('why' in r && r.why, String(why)).toMatch(why)
    }
  })

  it('reads a real PDF\'s named destinations through PDF.js: their pages by reference, x and y as the destination gives them', async () => {
    const pdf = await PL.PDFDocument.create()
    const p1 = pdf.addPage([612, 792]), p2 = pdf.addPage([612, 792])
    const xyz = (page: PL.PDFPage, x: number, y: number) => pdf.context.obj([page.ref, PL.PDFName.of('XYZ'), x, y, null])
    const names = pdf.context.obj({ Names: [PL.PDFHexString.fromText('axt-0s'), xyz(p1, 72.25, 700.5), PL.PDFHexString.fromText('axt-0e'), xyz(p2, 300, 100), PL.PDFHexString.fromText('other'), xyz(p1, 1, 1)] })
    pdf.catalog.set(PL.PDFName.of('Names'), pdf.context.obj({ Dests: names }))
    pdf.setCreationDate(new Date(Date.UTC(2026, 9, 15, 12, 30, 0)))
    const bytes = await pdf.save()
    const doc = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise
    try {
      expect(await marksOfPdf(doc as never)).toEqual(new Map([['axt-0s', [1, 72.25, 700.5]], ['axt-0e', [2, 300, 100]]]))
      expect(await finalCheck(doc as never, doc as never)).toEqual({ ok: true, marks: 2 })
      expect(await creationEpochOf(doc as never)).toBe(Date.UTC(2026, 9, 15, 12, 30, 0) / 1000)
    } finally { await doc.loadingTask.destroy() }
  })
})

describe('boxesCheck: every page of ours is arXiv\'s size', () => {
  it('equal pages and boxes, within 0.01 pt; else why, and both counts', async () => {
    expect(await boxesCheck(docOf([LETTER, LETTER], {}), docOf([[0, 0, 612.004, 792], LETTER], {}))).toEqual({ equal: true, pages: [2, 2] })
    expect(await boxesCheck(docOf([LETTER, LETTER], {}), docOf([LETTER], {}))).toMatchObject({ equal: false, pages: [2, 1], why: expect.stringMatching(/ours has 2 pages, arXiv's PDF 1/) })
    expect(await boxesCheck(docOf([LETTER, A4], {}), docOf([LETTER, LETTER], {}))).toMatchObject({ equal: false, pages: [2, 2], why: expect.stringMatching(/page 2's box is \[0 0 595\.28 841\.89\] in ours/) })
    expect(await boxesCheck(docOf([[0, 0, 612, 792]], {}), docOf([[10, 0, 622, 792]], {}))).toMatchObject({ equal: false })
  })
})

describe('markTextOf: no mark of ours printed as text (2610.19860)', () => {
  it('finds a mark macro set as characters (a mark inside \\url) and the unit its name names', () => {
    // (2610.19860 p. 16: the url package set the piece's opening mark of unit 176 as text before the address)
    const page16 = 'Code is available at \\axt@pma{p176.4a}https://github.com/example/repo.'
    const r = markTextOf(['A first page.', '', page16])
    expect(r.pages).toEqual([3])
    expect([...r.units]).toEqual([176])
    expect(r.samples).toEqual([[3, '\\axt@pma{p176.4a}']])
    expect(hasMarkText(page16)).toBe(true)
  })

  it('names the units of unit marks and of pieces, a footnote\'s too; a name\'s or a figure frame\'s none; nothing in plain text', () => {
    expect([...markTextOf(['\\axtmark{12s} \\axtmark{h3e} \\axtend{n7.0b}']).units].sort((a, b) => a - b)).toEqual([3, 7, 12])
    expect(markTextOf(['\\axtmark{n2.abstract.s}\\axtmark{g4a}'])).toMatchObject({ pages: [1], units: new Set() })
    expect(markTextOf(['AXT Inc. reported 12s and p176.4a in axt units.', null, undefined as never])).toEqual({ pages: [], units: new Set(), samples: [] })
    expect(hasMarkText('a taxt@ion')).toBe(true)
    expect(hasMarkText(null)).toBe(false)
  })

  it('reads a page\'s text as its items\' strings joined, every page of a document, a page that fails none', async () => {
    expect(pageTextOf({ items: [{ str: '\\axt@pm' }, { str: 'a{p1.0a}' }] })).toBe('\\axt@pma{p1.0a}')
    expect(pageTextOf(null)).toBe('')
    const doc = docOf([LETTER, LETTER], {}, { texts: ['one', 'two'] })
    expect(await textOfPdf(doc)).toEqual(['one', 'two'])
    const failing = { ...doc, getPage: async (p: number) => { if (p === 2) throw new Error('broken'); return doc.getPage(p) } }
    expect(await textOfPdf(failing)).toEqual(['one', ''])
    const memory = { ...doc, getPage: async () => { throw new RangeError(ALLOCATION_FAILED) } }
    await expect(textOfPdf(memory)).rejects.toThrow(ALLOCATION_FAILED)
  })
})

describe('the XMP dates, where arXiv\'s PDF has no /CreationDate (its PDFs of 2026, rewritten by pikepdf)', () => {
  // (2608.04322v1's packet: the dates in the attribute form, MetadataDate alone)
  const PIKEPDF = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:xmp="http://ns.adobe.com/xap/1.0/" rdf:about="" xmp:CreatorTool="arXiv GenPDF (tex2pdf:8def8d8)"/><rdf:Description xmlns:xmp="http://ns.adobe.com/xap/1.0/" rdf:about="" xmp:MetadataDate="2026-08-06T00:19:38.109123+00:00"/></rdf:RDF></x:xmpmeta>'
  const ELEMENTS = '<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreateDate>2026-08-05T23:10:00+02:00</xmp:CreateDate><xmp:MetadataDate>2026-08-06T00:19:38Z</xmp:MetadataDate></rdf:Description>'

  it('reads ISO 8601 as XMP writes it: the offset applied, a fraction of a second dropped, a date alone its midnight', () => {
    expect(xmpDateEpoch('2026-08-06T00:19:38.109123+00:00')).toBe(Date.UTC(2026, 7, 6, 0, 19, 38) / 1000)
    expect(xmpDateEpoch('2026-08-06T02:19:38+02:00')).toBe(Date.UTC(2026, 7, 6, 0, 19, 38) / 1000)
    expect(xmpDateEpoch('2026-08-05T19:19:38-05:00')).toBe(Date.UTC(2026, 7, 6, 0, 19, 38) / 1000)
    expect(xmpDateEpoch('2026-08-06T00:19Z')).toBe(Date.UTC(2026, 7, 6, 0, 19, 0) / 1000)
    expect(xmpDateEpoch('2026-08-06')).toBe(Date.UTC(2026, 7, 6) / 1000)
    expect(xmpDateEpoch('2026-08')).toBe(Date.UTC(2026, 7, 1) / 1000)
    for (const s of ['', '2026-13-01', '2026-08-32', '2026-08-06T25:00Z', 'D:20260806', 'yesterday', null, 7]) expect(xmpDateEpoch(s), String(s)).toBeNull()
  })

  it('finds xmp:CreateDate and xmp:MetadataDate in either form (an attribute, an element; xap, the old prefix), none in another packet', () => {
    expect(xmpDatesOf(PIKEPDF)).toEqual({ create: null, metadata: Date.UTC(2026, 7, 6, 0, 19, 38) / 1000 })
    expect(xmpDatesOf(ELEMENTS)).toEqual({ create: Date.UTC(2026, 7, 5, 21, 10, 0) / 1000, metadata: Date.UTC(2026, 7, 6, 0, 19, 38) / 1000 })
    expect(xmpDatesOf("<rdf:Description xap:CreateDate='2009-01-02T03:04:05Z'/>")).toEqual({ create: Date.UTC(2009, 0, 2, 3, 4, 5) / 1000, metadata: null })
    expect(xmpDatesOf('<rdf:Description xmp:ModifyDate="2026-08-06T00:00:00Z"/>')).toEqual({ create: null, metadata: null })
    expect(xmpDatesOf(null)).toEqual({ create: null, metadata: null })
  })

  it('takes, in order, the Info dictionary\'s /CreationDate, xmp:CreateDate, then xmp:MetadataDate; none, null', async () => {
    const info = "D:20260801120000Z"
    expect(await creationEpochOf(docOf([LETTER], {}, { created: info, xmp: ELEMENTS }))).toBe(Date.UTC(2026, 7, 1, 12) / 1000)
    expect(await creationEpochOf(docOf([LETTER], {}, { xmp: ELEMENTS }))).toBe(Date.UTC(2026, 7, 5, 21, 10, 0) / 1000)
    expect(await creationEpochOf(docOf([LETTER], {}, { xmp: PIKEPDF }))).toBe(Date.UTC(2026, 7, 6, 0, 19, 38) / 1000)
    expect(await creationEpochOf(docOf([LETTER], {}, { created: 'not a date', xmp: PIKEPDF }))).toBe(Date.UTC(2026, 7, 6, 0, 19, 38) / 1000)
    expect(await creationEpochOf(docOf([LETTER], {}, { xmp: '<x:xmpmeta/>' }))).toBeNull()
    const throwing = { ...docOf([LETTER], {}), getMetadata: async () => ({ info: {}, metadata: { getRaw: () => { throw new Error('broken') } } }) }
    expect(await creationEpochOf(throwing)).toBeNull()
  })

  it('reads a real PDF\'s XMP packet through PDF.js (no Info date: pdf-lib told to write none)', async () => {
    const pdf = await PL.PDFDocument.create({ updateMetadata: false })
    pdf.addPage([612, 792])
    const packet = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>${PIKEPDF}<?xpacket end="w"?>`
    const stream = pdf.context.stream(packet, { Type: 'Metadata', Subtype: 'XML' })
    pdf.catalog.set(PL.PDFName.of('Metadata'), pdf.context.register(stream))
    const doc = await getDocument({ data: (await pdf.save()).slice(), verbosity: 0 }).promise
    try {
      expect((await doc.getMetadata()).info).not.toHaveProperty('CreationDate')
      expect(await creationEpochOf(doc as never)).toBe(Date.UTC(2026, 7, 6, 0, 19, 38) / 1000)
    } finally { await doc.loadingTask.destroy() }
  })
})

describe('pdfDateEpoch: arXiv\'s /CreationDate as SOURCE_DATE_EPOCH', () => {
  it('reads the PDF date forms, the offset applied', () => {
    expect(pdfDateEpoch("D:20261015123000+02'00'")).toBe(Date.UTC(2026, 9, 15, 10, 30, 0) / 1000)
    expect(pdfDateEpoch("D:20261015123000-05'30'")).toBe(Date.UTC(2026, 9, 15, 18, 0, 0) / 1000)
    expect(pdfDateEpoch('D:20261015123000Z')).toBe(Date.UTC(2026, 9, 15, 12, 30, 0) / 1000)
    expect(pdfDateEpoch('D:20261015')).toBe(Date.UTC(2026, 9, 15) / 1000)
    expect(pdfDateEpoch('20261015123000')).toBe(Date.UTC(2026, 9, 15, 12, 30, 0) / 1000)
    expect(pdfDateEpoch('D:2026')).toBe(Date.UTC(2026, 0, 1) / 1000)
  })

  it('refuses what is not one', async () => {
    for (const s of ['', 'yesterday', 'D:20261315', 'D:20261032', 'D:20261015250000', null, 7]) expect(pdfDateEpoch(s), String(s)).toBeNull()
    expect(await creationEpochOf(docOf([LETTER], {}))).toBeNull()
    expect(await creationEpochOf(docOf([LETTER], {}, { created: "D:20261015123000+00'00'" }))).toBe(Date.UTC(2026, 9, 15, 12, 30, 0) / 1000)
  })
})
