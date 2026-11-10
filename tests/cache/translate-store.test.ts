// The background's stores of translation (src/cache/translate-store.ts): the version step from the old per-text cache, on
// a database made by that cache's own schema, and today's bounds per table
import Dexie from 'dexie'
import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { createTranslateDb, createTranslateStore } from '@/cache/translate-store'

let n = 0
const name = () => `axt-store-test-${++n}`
const options = { indexedDB, IDBKeyRange }

/** a database as the extension's cache made it before this release: `axt-translation-cache` at version 2 (src/cache/store.ts
 *  of 1d804a770), holding an HTML block's entry and a PDF reader's text */
async function oldCache(db: string): Promise<void> {
  const old = new Dexie(db, options)
  old.version(1).stores({ entries: '&key, paper, createdAt, expiresAt, lastAccessedAt' })
  old.version(2).stores({ entries: '&key, paper, createdAt, expiresAt, lastAccessedAt, byteSize' })
  const now = Date.now()
  const record = (key: string, translation: string) => ({ key, paper: '2410.00260', translation, createdAt: now, lastAccessedAt: now, expiresAt: now + 1e9, byteSize: 64 })
  await old.table('entries').bulkPut([record('html-block', 'a translation'), record('pdf-text', 'another translation')])
  expect(await old.table('entries').count()).toBe(2)
  old.close()
}

describe('the version step from the per-text cache (hard rules 4 and 7)', () => {
  it("a database of today's schema opens at version 3: the old entries dropped once, the three tables there and working", async () => {
    const db = name()
    await oldCache(db)
    const opened = createTranslateDb(db, options)
    const store = createTranslateStore({ db: opened })
    await store.answers.write([['t1|microsoft:x|zh|h|-', '{"text":"an answer"}']])
    expect(await store.answers.read(['t1|microsoft:x|zh|h|-', 'missing'])).toEqual(['{"text":"an answer"}', null])
    expect(opened.verno).toBe(3)
    expect(opened.tables.map(t => t.name).sort()).toEqual(['answers', 'ocr', 'rows'])
    opened.close()
    // the database itself has no table of the old cache any more
    const raw = new Dexie(db, options)
    await raw.open()
    expect(raw.tables.map(t => t.name).sort()).toEqual(['answers', 'ocr', 'rows'])
    raw.close()
  })
  it('a fresh profile opens the same three tables', async () => {
    const opened = createTranslateDb(name(), options)
    const store = createTranslateStore({ db: opened })
    await store.rows.write([['r', 'v']])
    expect(await store.rows.read(['r'])).toEqual(['v'])
    expect(opened.tables.map(t => t.name).sort()).toEqual(['answers', 'ocr', 'rows'])
  })
})

describe("today's bounds, per table", () => {
  it('an entry older than 30 days is a miss, and the sweep deletes it', async () => {
    let now = 1_000
    const store = createTranslateStore({ db: createTranslateDb(name(), options), now: () => now })
    await store.answers.write([['a', '1']])
    now += 29 * 86_400_000
    expect(await store.answers.read(['a'])).toEqual(['1'])
    now += 2 * 86_400_000
    expect(await store.answers.read(['a'])).toEqual([null])
    expect(await store.cleanup()).toBe(1)
    expect((await store.stats()).entries).toBe(0)
  })
  it('past the cap of entries the least recently read go first', async () => {
    let now = 0
    const store = createTranslateStore({ db: createTranslateDb(name(), options), now: () => ++now, limits: { maxEntries: 3 } })
    await store.answers.write([['a', '1'], ['b', '2'], ['c', '3']])
    await store.answers.read(['a'])
    // (the reading time is written back apart)
    await new Promise(r => setTimeout(r, 20))
    await store.answers.write([['d', '4']])
    expect(await store.answers.read(['a', 'b', 'c', 'd'])).toEqual(['1', null, '3', '4'])
  })
  it('writes that start together on a store not yet counted share one count: the cap holds', async () => {
    let now = 0
    const db = createTranslateDb(name(), options)
    const store = createTranslateStore({ db, now: () => ++now, limits: { maxEntries: 3 } })
    // a page's batches end together: each write found the totals not counted and counted its own
    await Promise.all(['a', 'b', 'c', 'd'].map(k => store.rows.write([[k, '1']])))
    await store.rows.write([['e', '1']])
    // the table itself, not the store's own count of it
    expect(await db.rows.count()).toBeLessThanOrEqual(3)
    expect((await store.stats()).entries).toBe(await db.rows.count())
  })
  it('a write that holds one key twice keeps one entry and counts one, the last value', async () => {
    const db = createTranslateDb(name(), options)
    const store = createTranslateStore({ db })
    // rows are keyed by a unit's content: equal plain units of one call write one key twice, new or already kept
    await store.rows.write([['r', 'first'], ['r', 'second'], ['s', '1']])
    await store.rows.write([['s', 'again'], ['s', 'last']])
    const kept = await db.rows.toArray()
    expect(kept.map(e => [e.key, e.value])).toEqual([['r', 'second'], ['s', 'last']])
    expect(await store.stats()).toEqual({ entries: 2, bytes: kept.reduce((n, e) => n + e.bytes, 0) })
  })
  it('a value over its cap is not kept; an OCR reading may be larger than an answer', async () => {
    const store = createTranslateStore({ db: createTranslateDb(name(), options) })
    const big = 'x'.repeat(100 * 1024)
    await store.answers.write([['a', big]])
    await store.ocr.write([['o', big]])
    expect(await store.answers.read(['a'])).toEqual([null])
    expect(await store.ocr.read(['o'])).toEqual([big])
  })
  it('the counts and bytes the settings page shows, and a clear of every table', async () => {
    const store = createTranslateStore({ db: createTranslateDb(name(), options) })
    await store.answers.write([['a', '1']])
    await store.rows.write([['r', '2']])
    await store.ocr.write([['o', '3']])
    // S-O-70 counts translated passages (the rows): a raw answer and a figure's reading are not passages, their bytes are held
    const s = await store.stats()
    expect(s.entries).toBe(1)
    expect(s.bytes).toBeGreaterThan(await (async () => { const x = (await store.rows.read(['r']))[0] ?? ''; return x.length })())
    expect(await store.clear()).toBe(3)
    expect(await store.stats()).toEqual({ entries: 0, bytes: 0 })
  })
  it('a database that cannot be opened is a miss and keeps nothing, never a throw', async () => {
    const broken = createTranslateDb(name(), { indexedDB: { open: () => { throw new Error('no IndexedDB') } } as unknown as IDBFactory, IDBKeyRange })
    const store = createTranslateStore({ db: broken })
    await expect(store.answers.write([['a', '1']])).resolves.toBeUndefined()
    expect(await store.answers.read(['a'])).toEqual([null])
  })
})
