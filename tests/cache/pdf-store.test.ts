import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { createPdfDb, createPdfStore } from '@/cache/pdf-store'
import type { PdfRecordBody } from '@/cache/pdf-record'

let n = 0
const dbOf = () => createPdfDb(`axt-pdf-test-${++n}`, { indexedDB, IDBKeyRange })
const now = { identity: 'B', pipeline: '2' }
const pdfOf = (size: number, fill = 7) => {
  const b = new Uint8Array(size).fill(fill)
  b.set(new TextEncoder().encode('%PDF-1.7'))
  return b
}
const body = (digest: string, extra: Partial<PdfRecordBody> = {}): PdfRecordBody => ({
  digest, lang: 'zh-CN', paper: digest, engine: 'e', format: 'tags', pipeline: '2', context: {},
  units: [{ kind: 'para', src: 's', hash: 'h', state: 'whole', by: 'B', tried: 'B' }], marks: [], figures: [], ...extra,
})

describe('createPdfStore', () => {
  it('a record comes back as it went in; a miss is undefined', async () => {
    const s = createPdfStore({ db: dbOf() })
    expect(await s.get('d', 'zh-CN')).toBeUndefined()
    expect(await s.put({ ...body('d'), pdf: pdfOf(1000) }, now)).toBe(true)
    const got = await s.get('d', 'zh-CN')
    expect(got?.pdf).toEqual(pdfOf(1000))
    expect(got?.units[0]?.by).toBe('B')
  })

  it('what is stored is not the PDF', async () => {
    const db = dbOf()
    const s = createPdfStore({ db })
    await s.put({ ...body('d'), pdf: pdfOf(1000) }, now)
    const row = await db.bodies.get(['d', 'zh-CN'])
    const head = new TextDecoder().decode(new Uint8Array(row!.data).slice(0, 5))
    expect(head).not.toBe('%PDF-')
    expect(row!.iv.byteLength).toBe(12)
  })

  it('the key outlives the store: another store over the same database reads the record', async () => {
    const db = dbOf()
    await createPdfStore({ db }).put({ ...body('d'), pdf: pdfOf(100) }, now)
    expect((await createPdfStore({ db }).get('d', 'zh-CN'))?.pdf).toEqual(pdfOf(100))
  })

  it('a worse copy does not replace a better one; an equal one does', async () => {
    const s = createPdfStore({ db: dbOf() })
    await s.put({ ...body('d'), pdf: pdfOf(10, 1) }, now)
    expect(await s.put({ ...body('d', { units: [{ kind: 'para', src: 's', hash: 'h', state: 'whole', by: 'A', tried: 'A' }] }), pdf: pdfOf(10, 2) }, now)).toBe(false)
    expect((await s.get('d', 'zh-CN'))?.pdf).toEqual(pdfOf(10, 1))
    expect(await s.put({ ...body('d'), pdf: pdfOf(10, 3) }, now)).toBe(true)
    expect((await s.get('d', 'zh-CN'))?.pdf).toEqual(pdfOf(10, 3))
  })

  it('evicts the least recently opened beyond the cap, never the record just written', async () => {
    let t = 0
    const s = createPdfStore({ db: dbOf(), maxBytes: 2500, clock: () => ++t })
    await s.put({ ...body('a'), pdf: pdfOf(1000) }, now)
    await s.put({ ...body('b'), pdf: pdfOf(1000) }, now)
    await s.touch('a', 'zh-CN')
    await s.put({ ...body('c'), pdf: pdfOf(1000) }, now)
    expect(await s.get('b', 'zh-CN')).toBeUndefined()
    expect(await s.get('a', 'zh-CN')).toBeDefined()
    expect(await s.get('c', 'zh-CN')).toBeDefined()
    const small = createPdfStore({ db: dbOf(), maxBytes: 10 })
    expect(await small.put({ ...body('x'), pdf: pdfOf(1000) }, now)).toBe(true)
    expect(await small.get('x', 'zh-CN')).toBeDefined()
  })

  it('a record that does not decrypt is a miss, and is deleted', async () => {
    const db = dbOf()
    const s = createPdfStore({ db, warn: () => {} })
    await s.put({ ...body('d'), pdf: pdfOf(100) }, now)
    const row = (await db.bodies.get(['d', 'zh-CN']))!
    const torn = new Uint8Array(row.data.slice(0))
    torn[0] = torn[0]! ^ 0xff
    await db.bodies.put({ ...row, data: torn.buffer })
    expect(await s.get('d', 'zh-CN')).toBeUndefined()
    expect(await db.entries.get(['d', 'zh-CN'])).toBeUndefined()
  })

  it('a failing database is a miss: nothing throws', async () => {
    const db = dbOf()
    const s = createPdfStore({ db, warn: () => {} })
    db.close()
    expect(await s.get('d', 'zh-CN')).toBeUndefined()
    expect(await s.put({ ...body('d'), pdf: pdfOf(10) }, now)).toBe(false)
    await expect(s.touch('d', 'zh-CN')).resolves.toBeUndefined()
    await expect(s.patchFigures('d', 'zh-CN', [])).resolves.toBeUndefined()
  })

  it('patchFigures changes the figures alone; usage and clear', async () => {
    const s = createPdfStore({ db: dbOf() })
    await s.put({ ...body('d'), pdf: pdfOf(100) }, now)
    await s.patchFigures('d', 'zh-CN', [{ format: 'tags', wire: 'w', text: 't', by: 'B' }])
    const got = await s.get('d', 'zh-CN')
    expect(got?.figures).toEqual([{ format: 'tags', wire: 'w', text: 't', by: 'B' }])
    expect(got?.pdf).toEqual(pdfOf(100))
    expect((await s.usage()).count).toBe(1)
    await s.clear()
    expect(await s.usage()).toEqual({ count: 0, bytes: 0 })
  })

  it('encrypting 10 MB takes well under a second (a reading, printed)', async () => {
    const s = createPdfStore({ db: dbOf() })
    const t0 = performance.now()
    await s.put({ ...body('big'), pdf: pdfOf(10 * 1024 * 1024) }, now)
    const put = performance.now() - t0
    const t1 = performance.now()
    await s.get('big', 'zh-CN')
    // a reading, as tests/perf prints its own
    console.info(`[measure] pdf-store, 10 MB: put (encrypt, write) ${Math.round(put)} ms, get (read, decrypt) ${Math.round(performance.now() - t1)} ms`)
    expect(put).toBeLessThan(5000)
  })
})
