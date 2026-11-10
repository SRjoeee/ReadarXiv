// @vitest-environment node
// A failure PDF.js's worker recovers from while the back half reads a document (lane mem-errors): PDF.js answers the read as
// whole (a page's list ended where its parse failed: 2609.19644v1's page 70 read empty at 880 MiB, 77 objects committed; a font
// read as none), and no call of its API fails for it. readPdf hears PDF.js's warnings (packages/engine/src/warnings.ts): a
// failed allocation among them is thrown, as isMemoryError takes one, and prepareBack makes no bundle; any other recovery is
// stated in the head (`recovered`), by document and site, with its first reason. The worker here is pdfjs-dist's own with two
// hooks: one where its parse reads a page's operation, one where it translates a font; each throws V8's real failed allocation
// (or another error) where PDF.js would meet one.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import * as PL from '@cantoo/pdf-lib'
import { describe, expect, it } from 'vitest'
import {
  ALLOCATION_FAILED,
  type Instrument,
  isMemoryError,
  isMemoryText,
  ownersOf,
  type PdfJs,
  prepareBack,
  RECOVER_SITES,
  readPdf,
  ROLE,
  type Tally,
  unitId,
} from '@readarxiv/engine'
import type { Head } from '@readarxiv/format'
import { deflate, DOCUMENT_OPTIONS, inflate } from './helpers/ocg-pdfs'

const require = createRequire(import.meta.url)
const WORKER = readFileSync(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'), 'utf8')
/** the parse loop of getOperatorList (PartialEvaluator), where it reads each operation; and the start of translateFont */
const LIST = '        operation.args = null;\n        if (!preprocessor.read(operation)) {\n          break;\n        }\n        let args = operation.args;\n        let fn = operation.fn;\n        switch (fn | 0) {\n          case OPS.paintXObject:'
const FONT = '    const isType3Font = type === "Type3";\n    if (!descriptor) {'
const hook = (text: string, anchor: string, call: string): string => {
  const parts = text.split(anchor)
  if (parts.length !== 2) throw new Error(`an anchor stands ${parts.length - 1} times in pdf.worker.mjs: read getOperatorList and translateFont again`)
  return `${parts[0]}${call}${anchor}${parts[1]}`
}
const hooked = hook(hook(WORKER, LIST, '        globalThis.__axtFault?.("list", task.name);\n'), FONT, '    globalThis.__axtFault?.("font", "");\n')
// (PDF.js under Node runs its worker on this thread, taking `globalThis.pdfjsWorker` where one is set, before its first document)
;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(hooked).toString('base64')}`)
const api = await import('pdfjs-dist/legacy/build/pdf.mjs')
const pdfjs = { getDocument: api.getDocument, OPS: api.OPS } as unknown as PdfJs
/** the documents' options as the box and the lab runner open them: PDF.js's own standard fonts and character maps (without
 *  them PDF.js reads a standard font as none it has data for, and says so: a recovery of its own, the `error` site) */
const PDFJS_DIR = dirname(require.resolve('pdfjs-dist/package.json'))
const OPTIONS = { ...DOCUMENT_OPTIONS, standardFontDataUrl: `${PDFJS_DIR}/standard_fonts/`, cMapUrl: `${PDFJS_DIR}/cmaps/`, cMapPacked: true }

/** V8's own failed allocation, as it throws one */
function v8Failure(): Error {
  try {
    void new ArrayBuffer(2 ** 50)
  } catch (e) {
    return e as Error
  }
  throw new Error('this machine gave a 1 PiB ArrayBuffer')
}
/** the hooks: where armed, the `at`-th call of `where` (a page's operation read, page 0's; a font's translation) throws */
const fault = { where: null as null | 'list' | 'font', at: 1, calls: 0, fired: 0, error: v8Failure as () => Error }
;(globalThis as { __axtFault?: (where: string, task: string) => void }).__axtFault = (where, task) => {
  if (where !== fault.where || (where === 'list' && task !== 'GetOperatorList: page 0')) return
  if (++fault.calls === fault.at) {
    fault.fired++
    throw fault.error()
  }
}
const armed = (where: 'list' | 'font', at: number, error: () => Error = v8Failure) => Object.assign(fault, { where, at, calls: 0, fired: 0, error })
const disarmed = () => Object.assign(fault, { where: null })

const LINES = ['The first line of a unit', 'and its second line', 'Another unit stands here']
async function pdfOf(lines: string[]): Promise<Uint8Array> {
  const doc = await PL.PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(PL.StandardFonts.Helvetica)
  page.node.setFontDictionary(PL.PDFName.of('F1'), font.ref)
  page.node.set(PL.PDFName.of('Contents'), doc.context.register(doc.context.stream(lines.map((l, i) => `BT /F1 10 Tf 72 ${700 - 14 * i} Td (${l}) Tj ET`).join('\n'))))
  return doc.save({ useObjectStreams: false })
}
/** B is A read as the box reads our final pass (its recoveries the instrument's, as the adapter keeps them) */
async function instrumentOf(bytes: Uint8Array): Promise<Instrument> {
  const read = await readPdf(pdfjs, bytes, { options: OPTIONS, turned: true })
  const B = read.doc
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
    ...(read.recovered?.length ? { recovered: read.recovered } : {}),
  }
}
async function run(bytes: Uint8Array, ins: Instrument): Promise<{ tally: Tally; head: Head }> {
  let tally: Tally | null = null
  let head: Head | null = null
  for await (const x of prepareBack(ins, bytes, { pdfjs, pdfOptions: OPTIONS, PL: PL as never, deflate, inflate, paper: { id: '2611.00001', version: 1 }, made: 'test' })) {
    if (x.kind === 'tally') tally = x
    if (x.kind === 'head') head = x.head
  }
  return { tally: tally as Tally, head: head as Head }
}
/** prepareBack's end over A with the fault armed only while it runs (B read as it is) */
async function endOf(arm: () => void): Promise<unknown> {
  const bytes = await pdfOf(LINES)
  const ins = await instrumentOf(bytes)
  arm()
  try {
    return await run(bytes, ins)
  } catch (e) {
    return e
  } finally {
    disarmed()
  }
}

describe('a failure PDF.js\'s worker recovers from while the back half reads A', () => {
  it('the page as it is: read whole, nothing recovered, nothing stated, console.warn as it was', async () => {
    const warn = console.warn
    const bytes = await pdfOf(LINES)
    const { tally, head } = await run(bytes, await instrumentOf(bytes))
    expect(tally.located.located).toBe(2)
    expect(tally.recovered).toBeUndefined()
    expect(head.recovered).toBeUndefined()
    expect(console.warn).toBe(warn)
  })
  for (const at of [1, 4])
    it(`a failed allocation parsing the page's list (its operation ${at}): prepareBack throws it, no bundle made with the page cut short`, async () => {
      const warn = console.warn
      const end = await endOf(() => armed('list', at))
      expect(fault.fired).toBe(1)
      expect(isMemoryError(end)).toBe(true)
      expect(console.warn).toBe(warn)
    })
  it('a failed allocation translating the page\'s font: prepareBack throws it, no bundle made with the font read as none', async () => {
    const end = await endOf(() => armed('font', 1))
    expect(fault.fired).toBe(1)
    expect(isMemoryError(end)).toBe(true)
  })
  it('any other failure PDF.js recovers from is stated in the head, by document and site, with its first reason; no refusal', async () => {
    const end = (await endOf(() => armed('list', 4, () => new Error('an operator PDF.js cannot read')))) as { tally: Tally; head: Head }
    expect(fault.fired).toBe(1)
    expect(end.head.recovered).toEqual([['A', 'list', 1, 'Error: an operator PDF.js cannot read']])
    expect(end.tally.recovered).toEqual(end.head.recovered)
  })
  it('one met reading B is the instrument\'s, stated as B\'s', async () => {
    const bytes = await pdfOf(LINES)
    armed('font', 1, () => new Error('a font program PDF.js cannot read'))
    const ins = await instrumentOf(bytes).finally(disarmed)
    const { head } = await run(bytes, ins)
    expect(head.recovered).toEqual([['B', 'font-translate', 1, 'Error: a font program PDF.js cannot read']])
  })
  it('a failed allocation met reading B is thrown by the read', async () => {
    armed('list', 1)
    let end: unknown = null
    try {
      await instrumentOf(await pdfOf(LINES))
    } catch (e) {
      end = e
    } finally {
      disarmed()
    }
    expect(isMemoryError(end)).toBe(true)
  })
})

describe('a failed allocation as text (isMemoryText), isMemoryError\'s own words', () => {
  it('is exactly V8\'s: its RangeError\'s text, which PDF.js prints as a warning\'s reason', () => {
    expect(isMemoryText(String(v8Failure()))).toBe(true)
    expect(isMemoryText(`RangeError: ${ALLOCATION_FAILED}`)).toBe(true)
    for (const t of [ALLOCATION_FAILED, `FormatError: ${ALLOCATION_FAILED}`, `RangeError: ${ALLOCATION_FAILED}.`, `"RangeError: ${ALLOCATION_FAILED}"`, 'RangeError: Failed to allocate memory', 'Error: Failed to allocate memory', 'RangeError: Invalid typed array length: -1', '', null, undefined])
      expect(isMemoryText(t), String(t)).toBe(false)
  })
  it('PDF.js\'s wrapping of a worker\'s failure is a failed allocation exactly where its text is one', () => {
    const wrapped = (details: string) => Object.assign(new Error(ALLOCATION_FAILED), { name: 'UnknownErrorException', details })
    for (const d of [`RangeError: ${ALLOCATION_FAILED}`, `Error: ${ALLOCATION_FAILED}`, `FormatError: ${ALLOCATION_FAILED}`]) expect(isMemoryError(wrapped(d)), d).toBe(isMemoryText(d))
  })
})

describe('the recover branches readPdf hears (RECOVER_SITES)', () => {
  it('each warns with its words in the PDF.js the engine pins: a PDF.js that rewords one fails here', () => {
    for (const [site, words] of RECOVER_SITES) expect(WORKER.includes(words), `${site}: ${words}`).toBe(true)
  })
})
