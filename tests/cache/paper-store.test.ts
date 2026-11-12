// The PDF reader's store of papers (src/cache/paper-store.ts): the version step from the old reader's store of layers, on a
// database made by that store's own schema, and what a build of that schema meets after it (the way back, PDF-READER §9.3);
// answers kept and checked against their digests, documents by version and by id, a layer made again, the cap
import Dexie from 'dexie'
import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { createLayerDb, createLayerStore } from '@/cache/layer-store'
import { createPaperDb, createPaperStore, type Kept, PAPER_DB, SHARED } from '@/cache/paper-store'

let n = 0
const name = () => `axt-paper-test-${++n}`
const options = { indexedDB, IDBKeyRange }
const bytes = (s: string) => new TextEncoder().encode(s)
const kept = (s: string, status = 200, headers: [string, string][] = [['etag', '"e"']]): Kept => ({ status, headers, bytes: bytes(s) })
const hex = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>))].map(x => x.toString(16).padStart(2, '0')).join('')

/** a database as the old reader's store made it: `axt-layer` at version 4 (cache/layer-store.ts), holding a paper's object
 *  and catalog */
async function oldStore(db: string): Promise<void> {
  const store = createLayerStore({ db: createLayerDb(db, options) })
  const object = bytes('an object of an old layer')
  await store.putObject('2600.00001v1', await hex(object), object)
  await store.putCatalog('2600.00001v1', bytes('{"catalog":1}'))
  expect(await store.usage()).toMatchObject({ count: 1 })
}

describe('the version step from the old reader\'s store of layers (hard rule 7)', () => {
  it('the database opens at version 5: the old reader\'s three tables gone with what they held, the two tables there and working', async () => {
    const db = name()
    await oldStore(db)
    const opened = createPaperDb(db, options)
    const store = createPaperStore({ db: opened })
    expect(await store.usage()).toEqual({ count: 0, bytes: 0 })
    await store.putAnswer('2600_00001v1', '/api/v2/o/p/2600_00001v1/0123456789abcdef/x', kept('x'))
    expect((await store.answer('/api/v2/o/p/2600_00001v1/0123456789abcdef/x'))?.bytes).toEqual(bytes('x'))
    expect(opened.verno).toBe(5)
    opened.close()
    const raw = new Dexie(db, options)
    await raw.open()
    expect(raw.tables.map(t => t.name).sort()).toEqual(['answers', 'versions'])
    raw.close()
  })
  it('the way back, measured: a build of version 4 meets the database of version 5 and works (Dexie 4 opens it at 5.1, the old tables made again beside the new); this build again works on its own rows, the old tables left beside them until a version step names them again', async () => {
    const shape = async (db: string) => {
      const d = new Dexie(db, options)
      await d.open()
      const r = { verno: d.verno, tables: d.tables.map(t => t.name).sort() }
      d.close()
      return r
    }
    const db = name()
    const v5 = createPaperDb(db, options)
    await createPaperStore({ db: v5 }).putAnswer(SHARED, '/static-fonts/index.json', kept('{}'))
    v5.close()
    const backDb = createLayerDb(db, options)
    const back = createLayerStore({ db: backDb })
    const object = bytes('kept by the build gone back to')
    await back.putObject('2600.00001v1', await hex(object), object)
    expect(await back.usage()).toMatchObject({ count: 1 })
    expect(await back.object(await hex(object))).toEqual(object)
    backDb.close()
    expect(await shape(db)).toEqual({ verno: 5.1, tables: ['answers', 'objects', 'papers', 'refs', 'versions'] })
    const forth = createPaperDb(db, options)
    expect((await createPaperStore({ db: forth }).answer('/static-fonts/index.json'))?.bytes).toEqual(bytes('{}'))
    forth.close()
    expect((await shape(db)).tables).toEqual(['answers', 'objects', 'papers', 'refs', 'versions'])
  })
  it('names the database the old reader\'s store named', () => {
    expect(PAPER_DB).toBe('axt-layer')
  })
})

describe('answers and documents', () => {
  it('an answer is given back as it was kept, its status and headers with it; bytes not the ones kept are a miss, and gone', async () => {
    const db = createPaperDb(name(), options)
    const store = createPaperStore({ db })
    const url = '/api/v2/o/arxiv/2600_00001v1.pdf?r=0-3'
    await store.putAnswer('2600_00001v1', url, kept('%PDF', 206, [['content-range', 'bytes 0-3/9'], ['etag', '"t"']]))
    expect(await store.answer(url)).toEqual({ status: 206, headers: [['content-range', 'bytes 0-3/9'], ['etag', '"t"']], bytes: bytes('%PDF') })
    await db.answers.update(url, { data: bytes('%PDX').buffer as ArrayBuffer })
    expect(await store.answer(url)).toBeUndefined()
    expect(await db.answers.get(url)).toBeUndefined()
    expect((await store.usage()).bytes).toBe(0)
  })
  it('a whole object whose address names its digest is kept only where its bytes are that object', async () => {
    const store = createPaperStore({ db: createPaperDb(name(), options) })
    const good = bytes('the object')
    const sha = await hex(good)
    await store.putAnswer('2600_00001v1', `/api/v2/o/p/2600_00001v1/0123456789abcdef/${sha}`, { status: 200, headers: [], bytes: good }, sha)
    await store.putAnswer('2600_00001v1', `/api/v2/o/p/2600_00001v1/0123456789abcdef/${'0'.repeat(64)}`, { status: 200, headers: [], bytes: good }, '0'.repeat(64))
    expect(await store.answer(`/api/v2/o/p/2600_00001v1/0123456789abcdef/${sha}`)).toBeDefined()
    expect(await store.answer(`/api/v2/o/p/2600_00001v1/0123456789abcdef/${'0'.repeat(64)}`)).toBeUndefined()
  })
  it('a document by its version, or by its id (the version opened last); a layer made again lets the objects of the one before go', async () => {
    let t = 1
    const store = createPaperStore({ db: createPaperDb(name(), options), now: () => t })
    const old = '/api/v2/o/p/2600_00001v1/aaaaaaaaaaaaaaaa/x', shared = '/api/v2/o/arxiv/2600_00001v1.pdf?r=0-3'
    await store.putAnswer('2600_00001v1', old, kept('old'))
    await store.putAnswer('2600_00001v1', shared, kept('%PDF'))
    await store.putDoc('2600_00001v1', '{"v1":1}', 'p/2600_00001v1/aaaaaaaaaaaaaaaa')
    t = 2
    await store.putDoc('2600_00001v2', '{"v2":1}', 'p/2600_00001v2/cccccccccccccccc')
    expect(await store.doc({ pv: '2600_00001v1' })).toBe('{"v1":1}')
    expect(await store.doc({ id: '2600_00001' })).toBe('{"v2":1}')
    t = 3
    await store.opened('2600_00001v1')
    expect(await store.doc({ id: '2600_00001' })).toBe('{"v1":1}')
    expect(await store.doc({ id: '2699_99999' })).toBeUndefined()
    await store.putDoc('2600_00001v1', '{"v1":2}', 'p/2600_00001v1/bbbbbbbbbbbbbbbb')
    expect(await store.answer(old)).toBeUndefined()
    expect(await store.answer(shared)).toBeDefined()
    expect(await store.doc({ pv: '2600_00001v1' })).toBe('{"v1":2}')
  })
})

describe('the cap', () => {
  it('past it, the paper versions opened least recently go first with all they hold, never the one opened, the faces last; the count leaves the faces out', async () => {
    let t = 1
    const store = createPaperStore({ db: createPaperDb(name(), options), maxBytes: 30, now: () => t })
    await store.putAnswer(SHARED, '/static-fonts/0123456789abcdef.woff2', kept('f'.repeat(8)))
    for (const pv of ['a_1v1', 'a_2v1', 'a_3v1']) {
      t++
      await store.putAnswer(pv, `/api/v2/o/p/${pv}/0123456789abcdef/x`, kept('o'.repeat(10)))
    }
    // 8 + 30 past 30: the version opened first goes, the faces stay
    expect(await store.answer('/api/v2/o/p/a_1v1/0123456789abcdef/x')).toBeUndefined()
    expect(await store.answer('/static-fonts/0123456789abcdef.woff2')).toBeDefined()
    expect(await store.usage()).toEqual({ count: 2, bytes: 28 })
    t++
    await store.opened('a_2v1')
    t++
    await store.putAnswer('a_4v1', '/api/v2/o/p/a_4v1/0123456789abcdef/x', kept('o'.repeat(10)))
    expect(await store.answer('/api/v2/o/p/a_3v1/0123456789abcdef/x')).toBeUndefined()
    expect(await store.answer('/api/v2/o/p/a_2v1/0123456789abcdef/x')).toBeDefined()
    await store.clear()
    expect(await store.usage()).toEqual({ count: 0, bytes: 0 })
  })
})
