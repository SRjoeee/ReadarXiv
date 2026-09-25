import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
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
  units: [{ kind: 'para', src: 's', hash: 'h', state: 'whole', by: 'B', tried: 'B' }], marks: [], rightMarks: [], figures: [], ...extra,
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
    const row = await db.pdfs.get(['d', 'zh-CN'])
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

  it('two tabs writing at once beyond the cap keep one of their records, not neither (Devin on #298)', async () => {
    const db = dbOf()
    let t = 0
    const clock = () => ++t
    // room for one record: each tab's eviction, protecting its own, would otherwise remove the other's
    const [a, b] = [createPdfStore({ db, maxBytes: 1500, clock }), createPdfStore({ db, maxBytes: 1500, clock })]
    expect(await Promise.all([a.put({ ...body('a'), pdf: pdfOf(1000) }, now), b.put({ ...body('b'), pdf: pdfOf(1000) }, now)])).toEqual([true, true])
    expect((await a.usage()).count).toBe(1)
  })

  it('a record that does not decrypt is deleted only if no other tab has replaced it meanwhile (Devin on #298)', async () => {
    const db = dbOf()
    const reader = createPdfStore({ db, warn: () => {} }), writer = createPdfStore({ db })
    await writer.put({ ...body('d'), pdf: pdfOf(100, 1) }, now)
    // the decryption fails, and before it does another tab writes a good copy of the same paper
    const spy = vi.spyOn(crypto.subtle, 'decrypt').mockImplementationOnce(async () => {
      await writer.put({ ...body('d'), pdf: pdfOf(100, 2) }, now)
      throw new Error('tag mismatch')
    })
    expect(await reader.get('d', 'zh-CN')).toBeUndefined()
    spy.mockRestore()
    expect((await writer.get('d', 'zh-CN'))?.pdf).toEqual(pdfOf(100, 2))
  })

  it('a figures patch beyond the cap evicts as a write does, keeping the record patched (Devin on #298)', async () => {
    const db = dbOf()
    let t = 0
    const clock = () => ++t
    const open = createPdfStore({ db, clock })
    await open.put({ ...body('a'), pdf: pdfOf(1000) }, now)
    await open.put({ ...body('b'), pdf: pdfOf(1000) }, now)
    const capped = createPdfStore({ db, maxBytes: (await open.usage()).bytes + 50, clock })
    await capped.patchFigures('b', 'zh-CN', [{ key: '["w"]', texts: ['x'.repeat(200)], by: 'B' }])
    expect(await capped.get('a', 'zh-CN')).toBeUndefined()
    expect((await capped.get('b', 'zh-CN'))?.figures).toHaveLength(1)
  })

  it('a record that does not decrypt is a miss, and is deleted', async () => {
    const db = dbOf()
    const s = createPdfStore({ db, warn: () => {} })
    await s.put({ ...body('d'), pdf: pdfOf(100) }, now)
    const row = (await db.pdfs.get(['d', 'zh-CN']))!
    const torn = new Uint8Array(row.data.slice(0))
    torn[0] = torn[0]! ^ 0xff
    await db.pdfs.put({ ...row, data: torn.buffer })
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
    await s.patchFigures('d', 'zh-CN', [{ key: '["w"]', texts: ['t'], by: 'B' }])
    const got = await s.get('d', 'zh-CN')
    expect(got?.figures).toEqual([{ key: '["w"]', texts: ['t'], by: 'B' }])
    expect(got?.pdf).toEqual(pdfOf(100))
    expect((await s.usage()).count).toBe(1)
    await s.clear()
    expect(await s.usage()).toEqual({ count: 0, bytes: 0 })
  })

  it('a figures patch touches no PDF: the ciphertext has a table of its own (final review)', async () => {
    const db = dbOf()
    const s = createPdfStore({ db })
    await s.put({ ...body('d'), pdf: pdfOf(1000) }, now)
    expect(await db.pdfs.get(['d', 'zh-CN'])).toBeDefined()
    expect((await db.bodies.get(['d', 'zh-CN'])) as unknown as Record<string, unknown>).not.toHaveProperty('data')
    let pdfWrites = 0
    const put = db.pdfs.put.bind(db.pdfs)
    db.pdfs.put = ((...a: Parameters<typeof put>) => { pdfWrites++; return put(...a) }) as typeof db.pdfs.put
    await s.patchFigures('d', 'zh-CN', [{ key: 'k', texts: ['t'], by: 'B' }])
    expect(pdfWrites).toBe(0)
  })

  it('figures merge by key: a patch keeps the entries it does not name, and counts them in the record\'s bytes', async () => {
    const db = dbOf()
    const s = createPdfStore({ db })
    await s.put({ ...body('d', { figures: [{ key: 'a', texts: ['A'], by: 'B' }] }), pdf: pdfOf(100) }, now)
    const before = (await db.entries.get(['d', 'zh-CN']))!.bytes
    await s.patchFigures('d', 'zh-CN', [{ key: 'b', texts: ['B'.repeat(500)], by: 'B' }])
    expect((await s.get('d', 'zh-CN'))?.figures.map(f => f.key).sort()).toEqual(['a', 'b'])
    expect((await db.entries.get(['d', 'zh-CN']))!.bytes).toBeGreaterThan(before + 400)
  })

  it('a write keeps the stored figures it does not have, and replaces the ones it has', async () => {
    const s = createPdfStore({ db: dbOf() })
    await s.put({ ...body('d', { figures: [{ key: 'a', texts: ['old'], by: 'A' }, { key: 'c', texts: ['C'], by: 'B' }] }), pdf: pdfOf(100) }, now)
    expect(await s.put({ ...body('d', { figures: [{ key: 'a', texts: ['new'], by: 'B' }] }), pdf: pdfOf(100, 2) }, now)).toBe(true)
    const figures = (await s.get('d', 'zh-CN'))?.figures ?? []
    expect(Object.fromEntries(figures.map(f => [f.key, f.texts[0]]))).toEqual({ a: 'new', c: 'C' })
  })

  it('a failed read of the key is a miss, not a record deleted (final review)', async () => {
    const db = dbOf()
    await createPdfStore({ db }).put({ ...body('d'), pdf: pdfOf(100) }, now)
    const s = createPdfStore({ db, warn: () => {} })
    const get = db.keys.get.bind(db.keys)
    db.keys.get = (() => Promise.reject(new Error('the keys table cannot be read'))) as unknown as typeof db.keys.get
    expect(await s.get('d', 'zh-CN')).toBeUndefined()
    db.keys.get = get
    expect(await s.get('d', 'zh-CN')).toBeDefined()
  })

  it('usage and clear report a failure: the settings page says so rather than show an empty store (the reader\'s design, §9.3)', async () => {
    const db = dbOf()
    const s = createPdfStore({ db, warn: () => {} })
    db.entries.toArray = (() => Promise.reject(new Error('the entries cannot be read'))) as unknown as typeof db.entries.toArray
    await expect(s.usage()).rejects.toThrow('the entries cannot be read')
    db.transaction = (() => Promise.reject(new Error('the store cannot be written'))) as unknown as typeof db.transaction
    await expect(s.clear()).rejects.toThrow('the store cannot be written')
  })

  it('delete removes a record, whatever its state', async () => {
    const s = createPdfStore({ db: dbOf() })
    await s.put({ ...body('d'), pdf: pdfOf(100) }, now)
    await s.delete('d', 'zh-CN')
    expect(await s.get('d', 'zh-CN')).toBeUndefined()
    expect((await s.usage()).count).toBe(0)
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
