// @vitest-environment node
// wrapOf over arXiv's own files (stage 1a, packages/engine): the two tolerances spike S1c found its producers need, each on a
// page made for it. (1) An inline image inside a group of ours: the dvips + Ghostscript chain paints every TeX rule as an
// image mask (BI … EI), which the wrap's proof refused as a group "over BI". (2) An empty stream with /FlateDecode: arXiv's
// rewrite (pikepdf) writes an empty form so, which the object layer's inflater refuses while PDF.js reads it as empty.
import * as PL from '@cantoo/pdf-lib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { alignOf, type Located, pageInk, planOf, type ReadPage, wrap, wrapOf, wrapPageOf } from '@readarxiv/engine'
import { deflate, DOCUMENT_OPTIONS, inflate } from './helpers/ocg-pdfs'

/** a one-page PDF: Helvetica as /F1, the page's content `content`, and a form /Fx1 of `form` (raw stream bytes and dict) */
async function pdfOf(content: string, form?: { bytes: Uint8Array; filter?: string }): Promise<Uint8Array> {
  const doc = await PL.PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(PL.StandardFonts.Helvetica)
  page.node.setFontDictionary(PL.PDFName.of('F1'), font.ref)
  if (form) {
    const dict = doc.context.obj({ Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 100], ...(form.filter ? { Filter: form.filter } : {}) })
    const ref = doc.context.register(PL.PDFRawStream.of(dict as PL.PDFDict, form.bytes))
    page.node.setXObject(PL.PDFName.of('Fx1'), ref)
  }
  page.node.set(PL.PDFName.of('Contents'), doc.context.register(doc.context.stream(content)))
  return doc.save({ useObjectStreams: false })
}

/** the page wrapped with every glyph and every image of it in group `g` */
async function wrappedOf(bytes: Uint8Array, g = '0.1.t') {
  const task = getDocument({ ...DOCUMENT_OPTIONS, data: bytes.slice() })
  const doc = await task.promise
  const page = await doc.getPage(1)
  const ops = await page.getOperatorList()
  const facts = alignOf(OPS as unknown as Record<string, number>, ops)
  const ink = pageInk(OPS as unknown as Record<string, number>, ops, page.commonObjs, { rotate: 0, indices: true, turned: true })
  await task.destroy()
  const paths = ink.paths ?? []
  const plan = planOf(ink.glyphs, ink.glyphs.map(() => g), paths, paths.map(k => (k === -3 ? g : null)), facts)
  const made = await wrapOf(bytes, new Map([[1, { facts, ...plan }]]), { PL, deflate, inflate })
  if ('refused' in made) throw new Error(`${made.refused}: ${made.why}`)
  return { made, images: paths.filter(k => k === -3).length }
}

describe('wrapOf over arXiv’s producers', () => {
  it('wraps an inline image (a rule as Ghostscript paints it) inside a group of ours', async () => {
    const bytes = await pdfOf('BT /F1 10 Tf 72 700 Td (a rule under) Tj ET\nq 90 0 0 0.4 72 690 cm BI /W 1 /H 1 /IM true /D [1 0] ID \u0000 EI Q\n')
    const { made, images } = await wrappedOf(bytes)
    expect(images).toBe(1)
    expect(made.pages.get(1)).toMatchObject({ ok: true })
    expect([...made.groups.keys()]).toEqual(['0.1.t'])
  })
  it('reads an empty stream with /FlateDecode as empty, as PDF.js does: its page is wrapped', async () => {
    const bytes = await pdfOf('BT /F1 10 Tf 72 700 Td (beside a form) Tj ET\nq /Fx1 Do Q\n', { bytes: new Uint8Array(0), filter: 'FlateDecode' })
    const { made } = await wrappedOf(bytes)
    expect(made.pages.get(1)).toMatchObject({ ok: true })
  })
  it('names the groups whose image the page’s images cannot tell apart, so that their members stay the original’s', async () => {
    // (a unit's text and its image, where the image boxes the walk saw are not as many as PDF.js's reading of the page: planOf
    // wraps none of them and names the group `lost`, which the add-on carries; today's wrapFinal makes such a unit unhidden)
    const bytes = await pdfOf('BT /F1 10 Tf 72 700 Td (text and its image) Tj ET\nq 90 0 0 0.4 72 690 cm BI /W 1 /H 1 /IM true /D [1 0] ID \u0000 EI Q\n')
    const task = getDocument({ ...DOCUMENT_OPTIONS, data: bytes.slice() })
    const page = await (await task.promise).getPage(1)
    const ops = await page.getOperatorList()
    const facts = alignOf(OPS as unknown as Record<string, number>, ops)
    const ink = pageInk(OPS as unknown as Record<string, number>, ops, page.commonObjs, { rotate: 0, indices: true, turned: true })
    await task.destroy()
    const paths = ink.paths ?? []
    const located = { groups: [{ glyphs: ink.glyphs.map(() => '0.1.t'), boxes: paths.map(k => (k === -3 ? '0.1.e' : null)), turned: [] }], figureGroups: new Set<string>() } as unknown as Located
    const pagesA = [wrapPageOf({ raw: ink, page: { glyphs: ink.glyphs }, extra: { ...facts, images: facts.images + 1 } } as unknown as ReadPage<typeof facts>)]
    const addOn = await wrap(bytes, located, pagesA, { PL, deflate, inflate })
    if ('refused' in addOn) throw new Error(addOn.why)
    expect([...addOn.lost]).toEqual(['0.1.e'])
    expect(addOn.groups.has('0.1.e')).toBe(false)
  })
})

describe('wrapOf: a show two groups share, as its producer wrote it', () => {
  // (a figure text's element cuts a show of the figure's form where its text and its element meet (F0, F1); the split writes
  // each chunk's codes and adjustments, and its proof reads the chunks joined against the show. Two shows of arXiv's producers
  // the proof refused, the page's figures then left the original's: 2610.20967v1 p2 (a show opening with an empty string) and
  // 2610.21098v1 p8, 2610.42112v1 p29 (an adjustment halfway between two millionths))
  /** the page wrapped, each glyph in the group `groupOf` gives it by its place on the page */
  async function splitOf(bytes: Uint8Array, groupOf: (i: number) => string) {
    const task = getDocument({ ...DOCUMENT_OPTIONS, data: bytes.slice() })
    const page = await (await task.promise).getPage(1)
    const ops = await page.getOperatorList()
    const facts = alignOf(OPS as unknown as Record<string, number>, ops)
    const ink = pageInk(OPS as unknown as Record<string, number>, ops, page.commonObjs, { rotate: 0, indices: true, turned: true })
    await task.destroy()
    const paths = ink.paths ?? []
    const plan = planOf(ink.glyphs, ink.glyphs.map((_, i) => groupOf(i)), paths, paths.map(() => null), facts)
    const made = await wrapOf(bytes, new Map([[1, { facts, ...plan }]]), { PL, deflate, inflate })
    if ('refused' in made) throw new Error(`${made.refused}: ${made.why}`)
    return made
  }
  it('splits a show that opens with an empty string: it draws nothing, and the proof reads it as nothing (2610.20967v1 p2)', async () => {
    const made = await splitOf(await pdfOf('BT /F1 10 Tf 72 700 Td [() -334 (ab) 10 (cd)] TJ ET\n'), (i) => (i < 2 ? '0.1.t' : '1.1.t'))
    expect(made.pages.get(1)).toMatchObject({ ok: true })
    expect([...made.groups.keys()].sort()).toEqual(['0.1.t', '1.1.t'])
  })
  it('splits a show whose adjustment stands halfway between two millionths: read at the precision the split writes it', async () => {
    const made = await splitOf(await pdfOf('BT /F1 10 Tf 72 700 Td [(ab) -0.5859375 (cd)] TJ ET\n'), (i) => (i < 2 ? '0.1.t' : '1.1.t'))
    expect(made.pages.get(1)).toMatchObject({ ok: true })
    expect([...made.groups.keys()].sort()).toEqual(['0.1.t', '1.1.t'])
  })
})

describe('wrapOf for the prepare: the section alone', () => {
  // (the back half's wrap keeps the add-on alone: the section appended to A, never A and it composed, nor a digest of the whole,
  // which nothing of the prepare reads. Composing them held a copy of A as long as A, and the digest's job another, at the
  // wrap's end: 33.5 MiB on 2609.19644v1, lane mem-back)
  it('gives the composed document\'s own tail, its xref and pages, and no whole', async () => {
    const bytes = await pdfOf('BT /F1 10 Tf 72 700 Td (a rule under) Tj ET\nq 90 0 0 0.4 72 690 cm BI /W 1 /H 1 /IM true /D [1 0] ID \u0000 EI Q\n')
    const { made } = await wrappedOf(bytes)
    const task = getDocument({ ...DOCUMENT_OPTIONS, data: bytes.slice() })
    const page = await (await task.promise).getPage(1)
    const ops = await page.getOperatorList()
    const facts = alignOf(OPS as unknown as Record<string, number>, ops)
    const ink = pageInk(OPS as unknown as Record<string, number>, ops, page.commonObjs, { rotate: 0, indices: true, turned: true })
    await task.destroy()
    const paths = ink.paths ?? []
    const plan = planOf(ink.glyphs, ink.glyphs.map(() => '0.1.t'), paths, paths.map(k => (k === -3 ? '0.1.t' : null)), facts)
    const alone = await wrapOf(bytes, new Map([[1, { facts, ...plan }]]), { PL, deflate, inflate, compose: false })
    if ('refused' in alone || !('section' in alone)) throw new Error('refused')
    expect(Buffer.from(alone.section).equals(Buffer.from(made.bytes.subarray(bytes.length)))).toBe(true)
    expect(alone.xref).toBe(made.xref)
    expect([...alone.groups]).toEqual([...made.groups])
    expect('bytes' in alone || 'sha256' in alone).toBe(false)
  })
  it('gives an empty section where no page is wrapped', async () => {
    const bytes = await pdfOf('BT /F1 10 Tf 72 700 Td (no group) Tj ET\n')
    const alone = await wrapOf(bytes, new Map(), { PL, deflate, inflate, compose: false })
    if ('refused' in alone || !('section' in alone)) throw new Error('refused')
    expect(alone.section.length).toBe(0)
    expect(alone.unwrapped).toBe(true)
  })
})
