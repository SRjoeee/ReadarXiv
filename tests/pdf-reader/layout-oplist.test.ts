import { deflateSync } from 'node:zlib'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it, vi } from 'vitest'
import { giveUp, listWithin, OPS_MS, within } from '@/pdf-reader/engine/layout/oplist.mjs'
import { pagePlansOf, paperAddon } from '@/pdf-reader/engine/layout/addon.mjs'
import { readAnnots } from '@/pdf-reader/engine/layer-proto/links.mjs'
import { ALLOCATION_FAILED, isMemoryError } from '@/pdf-reader/engine/pipeline/memory.mjs'
import { installLiteWorker, LITE } from './helpers/lite-pdfjs'

// A page's operator list asked within OPS_MS (layout/oplist.mjs), and what a page given up on leaves: nothing of the list on the
// page proxy, on the pinned PDF.js and the lite worker as the server runs them, so that no count of pages given up is needed

const STANDARD_FONTS = join(dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')), 'standard_fonts/')
const latin1 = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0))
/** a PDF of pages each `content`, with image Im1 (1 pixel) and the standard fonts F0 (Helvetica) and F1 (Times-Roman) */
function pdfOf(contents: string[]): Uint8Array {
  const objs: (string | [string, Uint8Array])[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${contents.map((_, i) => `${6 + 2 * i} 0 R`).join(' ')}] /Count ${contents.length} >>`,
    ['/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode', new Uint8Array(deflateSync(new Uint8Array(1)))],
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>',
  ]
  contents.forEach((c, i) => {
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 3 0 R >> /Font << /F0 4 0 R /F1 5 0 R >> >> /Contents ${7 + 2 * i} 0 R >>`)
    objs.push(['', latin1(c)])
  })
  const parts: Uint8Array[] = [], offsets: number[] = []
  let size = 0
  const push = (x: string | Uint8Array) => { const b = typeof x === 'string' ? latin1(x) : x; parts.push(b); size += b.length }
  push('%PDF-1.7\n')
  objs.forEach((o, i) => {
    offsets.push(size)
    if (typeof o === 'string') push(`${i + 1} 0 obj\n${o}\nendobj\n`)
    else { push(`${i + 1} 0 obj\n<< ${o[0]} /Length ${o[1].length} >>\nstream\n`); push(o[1]); push('\nendstream\nendobj\n') }
  })
  const at = size
  push(`xref\n0 ${objs.length + 1}\n0000000000 65535 f\r\n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n\r\n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`)
  const out = new Uint8Array(size)
  let o = 0
  for (const b of parts) { out.set(b, o); o += b.length }
  return out
}
type PageProxy = Parameters<typeof listWithin>[0] & { _intentStates: Map<unknown, unknown> }

describe('listWithin, giveUp: a page\'s operator list within OPS_MS, a page given up on that page alone', () => {
  it('a list that comes is the list; one that never comes is null past the time, the page given up on and cleaned up; one that fails, null', async () => {
    expect(OPS_MS).toBe(10_000)
    const list = { fnArray: [1], argsArray: [[]] }
    const page = (ops: () => Promise<unknown>) => ({ getOperatorList: ops, cleanup: vi.fn(), _abortOperatorList: vi.fn(), _intentStates: new Map([['oplist', { renderTasks: new Set() }]]) })
    const seen = { warned: false, who: 'a test' }
    const ok = page(async () => list)
    expect(await listWithin(ok as never, seen)).toBe(list)
    expect(ok.cleanup).not.toHaveBeenCalled()
    vi.useFakeTimers()
    try {
      const stalled = page(() => new Promise(() => {}))
      const waited = listWithin(stalled as never, seen)
      await vi.advanceTimersByTimeAsync(OPS_MS - 1)
      expect(stalled.cleanup).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(2)
      expect(await waited).toBeNull()
      expect(stalled._abortOperatorList).toHaveBeenCalledWith(expect.objectContaining({ force: true }))
      expect(stalled.cleanup).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
    const failed = page(async () => { throw new Error('broken page') })
    expect(await listWithin(failed as never, seen)).toBeNull()
    expect(failed.cleanup).toHaveBeenCalledTimes(1)
  })

  it('a memory-class failure is no page given up on: within and listWithin throw it, and the add-on\'s plans end on it (C8.4)', async () => {
    // (PDF.js's wrapping of a worker-side allocation failure, pdf.mjs wrapReason, which isMemoryError takes; and V8's own)
    const oom = () => Object.assign(new Error(ALLOCATION_FAILED), { name: 'UnknownErrorException', details: `RangeError: ${ALLOCATION_FAILED}` })
    for (const e of [oom(), new RangeError(ALLOCATION_FAILED)]) {
      expect(isMemoryError(e)).toBe(true)
      await expect(within(Promise.reject(e), OPS_MS)).rejects.toBe(e)
      const page = { getOperatorList: () => Promise.reject(e), cleanup: vi.fn(), commonObjs: {}, rotate: 0 }
      await expect(listWithin(page as never, { warned: true })).rejects.toBe(e)
      // (thrown before any promise, as a synchronous allocation fails)
      await expect(listWithin({ getOperatorList: () => { throw e }, cleanup: vi.fn() } as never, { warned: true })).rejects.toBe(e)
      const doc = { numPages: 1, getPage: async () => page }
      const index = { file: { views: [0, 0, 612, 792], paper: { pages: 1 } }, onPage: () => [], names: () => [] }
      await expect(pagePlansOf({ doc: doc as never, OPS: {} as never, index: index as never })).rejects.toBe(e)
    }
    // (another failure is still a page given up on: null)
    await expect(within(Promise.reject(new RangeError('Invalid array buffer length')), OPS_MS)).resolves.toBeNull()
  })

  it('nor is it a page without links, or an add-on refused: readAnnots and paperAddon let it through, other failures as before', async () => {
    const oom = Object.assign(new Error(ALLOCATION_FAILED), { name: 'UnknownErrorException', details: `RangeError: ${ALLOCATION_FAILED}` })
    await expect(readAnnots({ getAnnotations: () => Promise.reject(oom) })).rejects.toBe(oom)
    await expect(readAnnots({ getAnnotations: () => { throw oom } })).rejects.toBe(oom)
    await expect(readAnnots({ getAnnotations: () => Promise.reject(new Error('broken page')) })).resolves.toBeNull()
    // (the add-on's maker, failing inside: an input it cannot read)
    const failing = (e: unknown) => new Proxy({}, { get: () => { throw e } })
    await expect(paperAddon(failing(oom) as never)).rejects.toBe(oom)
    await expect(paperAddon(failing(new Error('a broken input')) as never)).resolves.toMatchObject({ ok: false })
  })

  it('a PDF.js with no cancel: a warning once a reader, naming it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const seen = { warned: false, who: 'add-on plans' }
    giveUp({ getOperatorList: async () => null } as never, seen)
    giveUp({ getOperatorList: async () => null } as never, seen)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/^add-on plans: /)
    warn.mockRestore()
  })

  it('on the pinned PDF.js, a page given up on mid-parse holds nothing of its list; one only cleaned up holds it while its parse runs', async () => {
    await installLiteWorker()
    // each page: 20,000 image paints, then a text in a standard font (its data read from the main thread: the parse waits there,
    // so a timer fires mid-parse), then 20,000 more
    const paints = 'q 1 0 0 1 72 72 cm /Im1 Do Q '.repeat(20_000)
    const data = pdfOf([0, 1].map(f => `${paints}BT /F${f} 10 Tf 72 700 Td (x) Tj ET ${paints}`))
    const task = getDocument({ data, verbosity: 0, standardFontDataUrl: STANDARD_FONTS, useSystemFonts: false, ...LITE })
    try {
      const doc = await task.promise
      const seen = { warned: false }
      // page 1 given up at once (1 ms): its stream cancelled, its intent state dropped, the page cleaned up
      const one = (await doc.getPage(1)) as unknown as PageProxy
      expect(await listWithin(one, seen, 1)).toBeNull()
      expect(one._intentStates.size).toBe(0)
      // page 2 only cleaned up (no cancel): the page keeps its list's chunks while the parse runs (cleanup waits for its last
      // chunk), which is what giveUp's cancel lets go
      const two = (await doc.getPage(2)) as unknown as PageProxy & { cleanup(): unknown }
      const asked = two.getOperatorList()
      let timer: ReturnType<typeof setTimeout> | undefined
      const late = await Promise.race([asked.then(() => false), new Promise<boolean>(r => { timer = setTimeout(() => r(true), 1) })])
      clearTimeout(timer)
      expect(late).toBe(true)
      two.cleanup()
      expect(two._intentStates.size).toBe(1)
      await asked
    } finally { await task.destroy() }
  }, 60_000)
})
