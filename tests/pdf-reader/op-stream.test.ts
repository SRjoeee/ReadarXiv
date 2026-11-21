// @vitest-environment node
// A page's operator list read in the pieces PDF.js's worker sends it (packages/engine opstream.ts readOps, lane op-stream): readPdf
// holds no page's whole list (2610.40394v1's page 23, 510,506 operations, was 93 MiB held in one object, for A and for B alike),
// and every reader of the list (pageInk's, the alignment facts', the glyphs' tags) reads the pieces in their order to the same
// result as the whole list. PDF.js gives the pieces through its page's _renderPageChunk alone (6.3.289): the adapter's tests here
// fail if an upgrade takes that away.
import * as PL from '@cantoo/pdf-lib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import {
  alignOf,
  alignReader,
  inkReader,
  OPS_CAP,
  type PdfJs,
  pageInk,
  readArxiv,
  readOps,
  readPdf,
} from '@readarxiv/engine'
import { DOCUMENT_OPTIONS } from './helpers/ocg-pdfs'

const pdfjs = { getDocument, OPS } as unknown as PdfJs
type List = { fnArray: number[]; argsArray: unknown[] }
type Page = Awaited<ReturnType<Awaited<ReturnType<typeof getDocument>['promise']>['getPage']>>

/** a page of `lines` lines in two fonts, each line in a save of its own with a rule painted under it, so that the list runs to
 *  several of PDF.js's pieces (1,000 operations each) and a font's change, a show and a save fall on either side of their seams */
async function densePdf(lines: number): Promise<Uint8Array> {
  const doc = await PL.PDFDocument.create()
  const page = doc.addPage([612, 792])
  const fonts = { F1: await doc.embedFont(PL.StandardFonts.Helvetica), F2: await doc.embedFont(PL.StandardFonts.Courier) }
  page.node.setFontDictionary(PL.PDFName.of('F1'), fonts.F1.ref)
  page.node.setFontDictionary(PL.PDFName.of('F2'), fonts.F2.ref)
  const content: string[] = []
  for (let i = 0; i < lines; i++) {
    const y = 770 - (i % 90) * 8
    const x = 40 + Math.floor(i / 90) * 80
    content.push(`q 1 0 0 1 0 ${i % 3} cm BT /F${1 + (Math.floor(i / 7) % 2)} 6 Tf ${x} ${y} Td [(Line) -250 (${i})] TJ ET 0.${i % 10} g ${x} ${y - 2} 30 0.5 re f Q`)
  }
  page.node.set(PL.PDFName.of('Contents'), doc.context.register(doc.context.stream(content.join('\n'))))
  return doc.save({ useObjectStreams: false })
}
/** the document's first page, and its destroy */
async function firstPage(bytes: Uint8Array): Promise<{ page: Page; done: () => Promise<void> }> {
  const task = getDocument({ ...DOCUMENT_OPTIONS, data: bytes.slice() })
  const pdf = await task.promise
  return { page: await pdf.getPage(1), done: () => task.destroy() }
}
/** the page's whole list as PDF.js's getOperatorList gives it, asked afresh (a list it holds let go first, and the one it makes) */
async function wholeList(page: Page): Promise<List> {
  page.cleanup()
  const list = (await page.getOperatorList()) as unknown as List
  const out = { fnArray: [...list.fnArray], argsArray: [...list.argsArray] }
  page.cleanup()
  return out
}
/** PDF.js handed in with each page's lists, as its getOperatorList answered them, kept: what PDF.js itself held of them */
function spied(): { pdfjs: PdfJs; held: List[] } {
  const held: List[] = []
  const wrap = {
    OPS,
    getDocument(src: Record<string, unknown>) {
      const task = getDocument(src as never)
      const promise = task.promise.then((pdf) => {
        const getPage = pdf.getPage.bind(pdf)
        pdf.getPage = async (n: number) => {
          const page = await getPage(n)
          const own = page.getOperatorList.bind(page)
          page.getOperatorList = async (...a: Parameters<typeof own>) => {
            const list = await own(...a)
            held.push(list as unknown as List)
            return list
          }
          return page
        }
        return pdf
      })
      return { promise, destroy: () => task.destroy() }
    },
  }
  return { pdfjs: wrap as unknown as PdfJs, held }
}

describe('readPdf reads a page\'s operator list in PDF.js\'s pieces', () => {
  it('holds no page\'s whole list: the list PDF.js builds for it stays empty, its glyphs all read', async () => {
    const bytes = await densePdf(600)
    const { page, done } = await firstPage(bytes)
    expect((await wholeList(page)).fnArray.length).toBeGreaterThan(3000)
    await done()
    const { pdfjs: spy, held } = spied()
    const read = await readPdf(spy, bytes, { options: DOCUMENT_OPTIONS, turned: true })
    expect(held.map((l) => l.fnArray.length)).toEqual([0])
    // ("Line" and the line's number: 10 of one digit, 90 of two, 500 of three)
    expect(read.doc.pages[0]!.glyphs.length).toBe(600 * 4 + 10 + 90 * 2 + 500 * 3)
  })

  it('reads each page as pageInk and alignOf read the whole list', async () => {
    const bytes = await densePdf(600)
    const { page, done } = await firstPage(bytes)
    const list = await wholeList(page)
    const options = { rotate: 0, indices: true, turned: true, shapesAll: true, glyphsMax: 100_000, boxesMax: 500_000 }
    const whole = pageInk(OPS, list, page.commonObjs, options)
    await done()
    const read = await readArxiv(pdfjs, bytes, DOCUMENT_OPTIONS)
    const raw = read.pages[0]!.raw!
    expect(raw.glyphs.length).toBe(whole.glyphs.length)
    expect(raw).toEqual(whole)
    expect(read.pages[0]!.extra).toEqual(alignOf(OPS, list))
  })
})

describe('the list\'s readers, read in pieces', () => {
  it('pageInk\'s reader gives the whole list\'s ink whatever the pieces', async () => {
    const { page, done } = await firstPage(await densePdf(250))
    const list = await wholeList(page)
    const options = { rotate: 0, indices: true, turned: true, shapesAll: true, glyphsMax: 100_000, boxesMax: 500_000 }
    const whole = pageInk(OPS, list, page.commonObjs, options)
    for (const size of [1, 7, 999, 1000, list.fnArray.length]) {
      const r = inkReader(OPS, page.commonObjs, options)
      for (let i = 0; i < list.fnArray.length; i += size) r.read(list.fnArray.slice(i, i + size), list.argsArray.slice(i, i + size))
      expect(r.end()).toEqual(whole)
    }
    await done()
  })

  it('pageInk\'s reader caps a page past OPS_CAP operations counted across its pieces', () => {
    const none = { get: () => null }
    const capped = (n: number) => {
      const r = inkReader(OPS, none, { rotate: 0 })
      const half = Math.floor(n / 2)
      const piece = (k: number) => ({ fnArray: new Uint8Array(k), argsArray: { length: k } as ArrayLike<unknown> })
      for (const k of [half, n - half]) r.read(piece(k).fnArray, piece(k).argsArray)
      return r.end().capped
    }
    expect(capped(OPS_CAP)).toBe(false)
    expect(capped(OPS_CAP + 1)).toBe(true)
  })

  it('the alignment facts\' reader gives alignOf\'s whatever the pieces', async () => {
    const { page, done } = await firstPage(await densePdf(250))
    const list = await wholeList(page)
    await done()
    for (const size of [1, 13, 1000]) {
      const r = alignReader(OPS)
      for (let i = 0; i < list.fnArray.length; i += size) r.read(list.fnArray.slice(i, i + size), list.argsArray.slice(i, i + size))
      expect(r.end()).toEqual(alignOf(OPS, list))
    }
  })
})

describe('readOps, PDF.js\'s pieces of a page\'s list (6.3.289: its page\'s _renderPageChunk)', () => {
  it('hands on the list in the worker\'s pieces, each no more than its 1,000 operations, the whole list in order', async () => {
    const { page, done } = await firstPage(await densePdf(600))
    const list = await wholeList(page)
    const pieces: number[] = []
    const fns: number[] = []
    const args: unknown[] = []
    await readOps(page as never, OPS, (fnArray, argsArray) => {
      pieces.push(fnArray.length)
      for (let i = 0; i < fnArray.length; i++) {
        fns.push(fnArray[i]!)
        args.push(argsArray[i])
      }
    })
    expect(await wholeList(page)).toEqual(list)
    await done()
    expect(pieces.length).toBeGreaterThan(3)
    expect(Math.max(...pieces)).toBeLessThanOrEqual(1000)
    expect(fns).toEqual(list.fnArray)
    expect(args).toEqual(list.argsArray)
  })

  it('refuses a page PDF.js does not give its list in pieces through _renderPageChunk', async () => {
    const { page, done } = await firstPage(await densePdf(3))
    const take = () => {}
    await expect(readOps({ getOperatorList: () => page.getOperatorList(), commonObjs: page.commonObjs } as never, OPS, take)).rejects.toThrow(/_renderPageChunk/)
    // (a list PDF.js had made before: answered whole, and never through the pieces)
    await page.getOperatorList()
    await expect(readOps(page as never, OPS, take)).rejects.toThrow(/pieces/)
    await done()
  })

  it('hands on a piece once every font its operations set is resolved', async () => {
    const resolved = new Map<string, unknown>()
    const waiting = new Map<string, ((v: unknown) => void)[]>()
    const commonObjs = {
      has: (id: string) => resolved.has(id),
      get(id: string, callback?: (v: unknown) => void) {
        if (callback) {
          if (resolved.has(id)) callback(resolved.get(id))
          else waiting.set(id, [...(waiting.get(id) ?? []), callback])
          return null
        }
        if (!resolved.has(id)) throw new Error(`${id} not resolved`)
        return resolved.get(id)
      },
    }
    const resolve = (id: string) => {
      resolved.set(id, { name: id })
      for (const f of waiting.get(id) ?? []) f(resolved.get(id))
    }
    const seen: unknown[] = []
    const page = {
      commonObjs,
      _renderPageChunk(_chunk: unknown, _state: unknown) {},
      // (as PDF.js's worker: each font sent before the piece that sets it, resolved a little after, the list ended after both; a
      // third font resolved never)
      async getOperatorList() {
        this._renderPageChunk({ fnArray: [OPS.setFont], argsArray: [['g_d0_f1', 10]], length: 1, lastChunk: false }, null)
        this._renderPageChunk({ fnArray: [OPS.setGState], argsArray: [[[['Font', ['g_d0_f2', 9]]]]], length: 1, lastChunk: false }, null)
        this._renderPageChunk({ fnArray: [OPS.setFont], argsArray: [['g_d0_f3', 8]], length: 1, lastChunk: true }, null)
        setTimeout(() => resolve('g_d0_f1'), 5)
        setTimeout(() => resolve('g_d0_f2'), 10)
        await new Promise((r) => setTimeout(r, 20))
        return { fnArray: [], argsArray: [], lastChunk: true }
      },
    }
    await readOps(page as never, OPS, (fnArray, argsArray) => {
      const id = fnArray[0] === OPS.setFont ? (argsArray[0] as [string])[0] : 'g_d0_f2'
      try {
        seen.push(commonObjs.get(id))
      } catch {
        seen.push(null)
      }
    })
    // (the third, never resolved, handed on once the list has ended: unresolved, as a reader of the whole list found it)
    expect(seen).toEqual([{ name: 'g_d0_f1' }, { name: 'g_d0_f2' }, null])
  })
})
