// @vitest-environment node
// A failed allocation is the paper's, never a page's (lane mem-errors; the bundle 4 contract, M7): near the box child's memory
// floor an allocation can fail anywhere the back half reads, and a catch of the engine's that took it for the page's own
// failure (its links none, its stream undecodable, its wrap refused) made a bundle with that page degraded, which the box would
// commit as the paper's. prepareBack throws it instead, as V8 throws it, as PDF.js hands it over from its worker (an
// UnknownErrorException of its words) and as Node throws its own (ERR_MEMORY_ALLOCATION_FAILED), at each step that reads: arXiv's
// PDF through PDF.js (a page's operator list, its annotations, the document's metadata), the wrap's reading of the page through
// the object layer (its content stream decoded, the wrap's own streams read back) and the wrap's attempt with a figure's groups.
// (A failure PDF.js's worker takes inside itself, a font made an ErrorFont or a page's list ended where its parse failed, reaches
// no catch of the engine's: not held here.)
import * as PL from '@cantoo/pdf-lib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import {
  alignOf,
  type Instrument,
  isMemoryError,
  type Located,
  ownersOf,
  type PdfJs,
  pageInk,
  prepareBack,
  type ReadPage,
  readPdf,
  ROLE,
  type Tally,
  unitId,
  wrap,
  wrapPageOf,
} from '@readarxiv/engine'
import { deflate, DOCUMENT_OPTIONS, inflate } from './helpers/ocg-pdfs'

/** V8's own failed allocation, as it throws one */
function v8Failure(): Error {
  try {
    void new ArrayBuffer(2 ** 50)
  } catch (e) {
    return e as Error
  }
  throw new Error('this machine gave a 1 PiB ArrayBuffer')
}
/** a failed allocation as PDF.js hands it over from its worker (pdf.mjs wrapReason: an UnknownErrorException of its words) */
const pdfjsWrapped = (e: Error): Error => Object.assign(new Error(e.message), { name: 'UnknownErrorException', details: e.toString() })
/** Node's own (from Node 24 on, Buffer.allocUnsafe and zlib's output: a RangeError of its words and its code) */
const nodeFailure = (): Error => Object.assign(new RangeError('Failed to allocate memory'), { code: 'ERR_MEMORY_ALLOCATION_FAILED' })

const LINES = ['The first line of a unit', 'and its second line', 'Another unit stands here']
/** a page of Helvetica lines, one show each, its content stream Flate-encoded, and a link over its first line */
async function pdfOf(lines: string[]): Promise<Uint8Array> {
  const doc = await PL.PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(PL.StandardFonts.Helvetica)
  page.node.setFontDictionary(PL.PDFName.of('F1'), font.ref)
  const content = lines.map((l, i) => `BT /F1 10 Tf 72 ${700 - 14 * i} Td (${l}) Tj ET`).join('\n')
  page.node.set(PL.PDFName.of('Contents'), doc.context.register(doc.context.flateStream(content)))
  const link = doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [72, 698, 200, 710], Border: [0, 0, 0], A: { S: 'URI', URI: PL.PDFString.of('https://arxiv.org/') } })
  page.node.set(PL.PDFName.of('Annots'), doc.context.obj([doc.context.register(link)]))
  return doc.save({ useObjectStreams: false })
}
const pdfjs = { getDocument, OPS } as unknown as PdfJs
/** B is A read as the box reads our final pass; its first two shows a paragraph's, its third another's */
async function instrumentOf(bytes: Uint8Array): Promise<Instrument> {
  const B = (await readPdf(pdfjs, bytes, { options: DOCUMENT_OPTIONS, turned: true })).doc
  const text = (s: string) => [{ t: 'text' as const, s }]
  const units = [text(`${LINES[0]} ${LINES[1]}`), text(LINES[2]!)].map((content) => ({ id: unitId('para', content), kind: 'para', content }))
  return {
    ink: B,
    units,
    glyphs: B.pages.map((pg) => {
      const O = ownersOf(pg.glyphs.length)
      pg.glyphs.forEach((g, j) => {
        O.unit[j] = g.n < 2 ? 0 : 1
        O.role[j] = ROLE.text
      })
      return O
    }),
    boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
    tex: {},
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
  }
}

/** where PDF.js's reading of A fails: a page's operator list, its annotations, or the document's metadata */
type PdfjsStep = 'ops' | 'annotations' | 'metadata'
/** PDF.js as prepareBack is handed it, its reading of A failing at `step` with `failure` (each call on PDF.js's own objects,
 *  whose private fields want them as `this`: only the failing call is replaced, on the object itself) */
function failingPdfjs(step: PdfjsStep, failure: () => Error): PdfJs {
  return {
    OPS,
    getDocument(src: Record<string, unknown>) {
      const task = getDocument(src as never)
      const promise = task.promise.then((doc) => {
        const d = doc as unknown as Record<string, unknown>
        if (step === 'metadata') d.getMetadata = () => Promise.reject(failure())
        const getPage = doc.getPage.bind(doc)
        d.getPage = async (n: number) => {
          const page = (await getPage(n)) as unknown as Record<string, unknown>
          if (step === 'ops') page.getOperatorList = () => Promise.reject(failure())
          if (step === 'annotations') page.getAnnotations = () => Promise.reject(failure())
          return page
        }
        return doc
      })
      return { promise, destroy: () => task.destroy() }
    },
  } as unknown as PdfJs
}

async function run(bytes: Uint8Array, deps: { pdfjs?: PdfJs; PL?: typeof PL; inflate?: (b: Uint8Array, limit: number) => Uint8Array } = {}): Promise<Tally> {
  const ins = await instrumentOf(bytes)
  let tally: Tally | null = null
  for await (const x of prepareBack(ins, bytes, { pdfjs: deps.pdfjs ?? pdfjs, pdfOptions: DOCUMENT_OPTIONS, PL: (deps.PL ?? PL) as never, deflate, inflate: deps.inflate ?? inflate, paper: { id: '2611.00001', version: 1 }, made: 'test' }))
    if (x.kind === 'tally') tally = x
  return tally as Tally
}
/** prepareBack's end: the failure it threw, or the tally of the bundle it made */
async function endOf(p: Promise<Tally>): Promise<{ threw: unknown } | { tally: Tally }> {
  try {
    return { tally: await p }
  } catch (e) {
    return { threw: e }
  }
}

describe('prepareBack over the page as it is', () => {
  it('reads the page whole: its units located, its link read, its stream wrapped', async () => {
    const tally = await run(await pdfOf(LINES))
    expect(tally.located.located).toBe(2)
    expect(tally.wrap).toEqual({ pagesRefused: 0, groups: expect.any(Number) })
    expect(tally.wrap.groups).toBeGreaterThan(0)
    expect(tally.locatedAll.links.get(1)?.length ?? 0).toBeGreaterThan(0)
  })
})

describe('a failed allocation in PDF.js\'s reading of A is the paper\'s', () => {
  for (const step of ['ops', 'annotations', 'metadata'] as const)
    for (const [form, failure] of [['V8\'s', v8Failure], ['PDF.js\'s wrapping of V8\'s', () => pdfjsWrapped(v8Failure())], ['PDF.js\'s wrapping of Node\'s', () => pdfjsWrapped(nodeFailure())]] as const)
      it(`${step}: ${form} is thrown, no bundle made without it`, async () => {
        const end = await endOf(run(await pdfOf(LINES), { pdfjs: failingPdfjs(step, failure) }))
        expect('threw' in end && isMemoryError(end.threw)).toBe(true)
      })
  it('any other failure of a page\'s annotations is its links\' alone: the page read, located and wrapped', async () => {
    const tally = await run(await pdfOf(LINES), { pdfjs: failingPdfjs('annotations', () => Object.assign(new Error('bad annotation'), { name: 'UnknownErrorException', details: 'FormatError: bad annotation' })) })
    expect(tally.located.located).toBe(2)
    expect(tally.wrap.pagesRefused).toBe(0)
  })
})

describe('a failed allocation in the wrap\'s reading of A is the paper\'s', () => {
  /** the object layer's decode of a stream (@cantoo/pdf-lib's decodePDFRawStream, which the remover is handed) failing */
  const decodeFailing = (failure: () => Error) => ({ ...PL, decodePDFRawStream: () => { throw failure() } })
  for (const [form, failure] of [['V8\'s', v8Failure], ['Node\'s', nodeFailure]] as const) {
    it(`the page's content stream decoded: ${form} is thrown, not read again by the inflater nor taken for a stream that does not decode`, async () => {
      const end = await endOf(run(await pdfOf(LINES), { PL: decodeFailing(failure) as never }))
      expect('threw' in end && isMemoryError(end.threw)).toBe(true)
    })
    it(`the page's content stream decoded and its inflater failing alike: ${form} is thrown, the page not refused for it`, async () => {
      const failingInflate = () => { throw failure() }
      const end = await endOf(run(await pdfOf(LINES), { PL: decodeFailing(failure) as never, inflate: failingInflate }))
      expect('threw' in end && isMemoryError(end.threw)).toBe(true)
    })
    it(`the wrap's stream read back (the host's inflater): ${form} is thrown`, async () => {
      // (the page's own stream decoded by the object layer; the inflater asked only to read back what the wrap wrote)
      const failingInflate = () => { throw failure() }
      const end = await endOf(run(await pdfOf(LINES), { inflate: failingInflate }))
      expect('threw' in end && isMemoryError(end.threw)).toBe(true)
    })
  }
  it('a stream the object layer cannot decode for another reason is still read by the inflater, as PDF.js reads it: the page wrapped', async () => {
    let asked = 0
    const refusing = { ...PL, decodePDFRawStream: () => { asked++; throw new Error('a damaged zlib header') } }
    const tally = await run(await pdfOf(LINES), { PL: refusing as never })
    expect(asked).toBeGreaterThan(0)
    expect(tally.wrap.pagesRefused).toBe(0)
  })
})

describe('a failed allocation in the wrap\'s attempt with a figure\'s groups is the paper\'s', () => {
  /** A's page read as the back half reads it: its first two shows a paragraph's text (`0.1.t`), its third a figure text's
   *  (`1.1.t`, one of locate's figure groups), so that the wrap tries the page with its figure first (wrap.mjs `page`) */
  async function figurePage(bytes: Uint8Array) {
    const task = getDocument({ ...DOCUMENT_OPTIONS, data: bytes.slice() } as never)
    const page = await (await task.promise).getPage(1)
    const ops = await page.getOperatorList()
    const facts = alignOf(OPS as unknown as Record<string, number>, ops)
    const ink = pageInk(OPS as unknown as Record<string, number>, ops, page.commonObjs, { rotate: 0, indices: true, turned: true })
    await task.destroy()
    const glyphs = ink.glyphs.map((g) => ((g.n ?? 0) < 2 ? '0.1.t' : '1.1.t'))
    const located = { groups: [{ glyphs, boxes: (ink.paths ?? []).map(() => null), turned: [] }], figureGroups: new Set(['1.1.t']) } as unknown as Located
    return { located, pagesA: [wrapPageOf({ raw: ink, extra: facts } as unknown as ReadPage<typeof facts>)] }
  }
  it('wraps the page with its figure\'s group, as it is', async () => {
    const bytes = await pdfOf(LINES)
    const { located, pagesA } = await figurePage(bytes)
    const addOn = await wrap(bytes, located, pagesA, { PL, deflate, inflate })
    if ('refused' in addOn) throw new Error(addOn.why)
    expect(addOn.pages.get(1)).toMatchObject({ ok: true })
    expect([...addOn.groups].sort()).toEqual(['0.1.t', '1.1.t'])
  })
  for (const [form, failure] of [['V8\'s', v8Failure], ['Node\'s', nodeFailure]] as const)
    it(`its stream read back with the figure's groups: ${form} is thrown, not taken for the figure's failure`, async () => {
      const bytes = await pdfOf(LINES)
      const { located, pagesA } = await figurePage(bytes)
      let calls = 0
      // (the first stream read back is the attempt with the figure's groups: wrap.mjs `page`, the ladder's first rung)
      const failingFirst = (b: Uint8Array, limit: number) => {
        if (++calls === 1) throw failure()
        return inflate(b, limit)
      }
      let threw: unknown = null
      try {
        await wrap(bytes, located, pagesA, { PL, deflate, inflate: failingFirst })
      } catch (e) {
        threw = e
      }
      expect(calls).toBe(1)
      expect(isMemoryError(threw)).toBe(true)
    })
})
