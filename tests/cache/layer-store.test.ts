// The PDF reader's store of papers' layers (cache/layer-store.ts; Stage 5 Task 10): objects by digest, checked against it before
// they are kept and each time they are read; the last catalog of each paper version; the papers opened least recently let go
// first beyond the cap; a slow read a miss
import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { createLayerDb, createLayerStore } from '@/cache/layer-store'

let n = 0
const dbOf = () => createLayerDb(`axt-layer-test-${++n}`, { indexedDB, IDBKeyRange })
const sha = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>))].map(x => x.toString(16).padStart(2, '0')).join('')
const bytes = (size: number, fill: number) => new Uint8Array(size).fill(fill)

describe('the layer store', () => {
  it('keeps an object only when its bytes are the ones its digest names, and gives it back as it went in', async () => {
    const s = createLayerStore({ db: dbOf() })
    const b = bytes(100, 1), d = await sha(b)
    expect(await s.object(d)).toBeUndefined()
    await s.putObject('2600.00001v1', d, b)
    expect(await s.object(d)).toEqual(b)
    // bytes that are not the digest's are not kept
    await s.putObject('2600.00001v1', 'f'.repeat(64), bytes(10, 2))
    expect(await s.object('f'.repeat(64))).toBeUndefined()
    expect(await s.usage()).toEqual({ count: 1, bytes: 100 })
  })

  it('a stored object whose bytes no longer match its digest is a miss, and is dropped', async () => {
    const db = dbOf()
    const s = createLayerStore({ db })
    const b = bytes(50, 3), d = await sha(b)
    await s.putObject('p1', d, b)
    await db.objects.update(d, { data: bytes(50, 4).buffer })
    expect(await s.object(d)).toBeUndefined()
    expect(await db.objects.get(d)).toBeUndefined()
    expect((await s.usage()).bytes).toBe(0)
  })

  it('a read that does not answer within its budget is a miss, its late answer let go', async () => {
    const db = dbOf()
    const s = createLayerStore({ db, budgetMs: 20 })
    const stuck = { get: () => new Promise(() => {}) }
    Object.defineProperty(db, 'objects', { value: stuck })
    const t0 = Date.now()
    expect(await s.object('a'.repeat(64))).toBeUndefined()
    expect(Date.now() - t0).toBeLessThan(1000)
  })

  it('beyond the cap the papers opened least recently go first, their objects with them; the paper being opened stays', async () => {
    let t = 0
    const s = createLayerStore({ db: dbOf(), maxBytes: 250, now: () => ++t })
    const put = async (paper: string, fill: number) => { const b = bytes(100, fill); await s.putObject(paper, await sha(b), b); return sha(b) }
    const a = await put('a', 1)
    const b = await put('b', 2)
    await s.opened('a')
    const c = await put('c', 3)
    // a was opened after b: b goes
    expect(await s.object(b)).toBeUndefined()
    expect(await s.object(a)).toBeDefined()
    expect(await s.object(c)).toBeDefined()
    expect(await s.usage()).toEqual({ count: 2, bytes: 200 })
  })

  it('an object two papers hold (one digest) is kept for each: the first let go, the second still reads it (Codex on #390)', async () => {
    let t = 0
    // (each paper counts the bytes it holds, a shared object under each: the cap is kept conservatively)
    const s = createLayerStore({ db: dbOf(), maxBytes: 350, now: () => ++t })
    const shared = bytes(100, 7), d = await sha(shared)
    await s.putObject('a', d, shared)
    await s.putObject('b', d, shared)
    const own = bytes(100, 8)
    await s.putObject('b', await sha(own), own)
    // past the cap: a, opened first, goes; the object b holds too stays
    const more = bytes(100, 9)
    await s.putObject('c', await sha(more), more)
    expect(await s.object(d)).toEqual(shared)
    expect((await s.usage()).count).toBe(2)
    // b let go as well: the object no paper holds goes with it
    await s.opened('c')
    const last = bytes(100, 10)
    await s.putObject('d', await sha(last), last)
    expect(await s.object(d)).toBeUndefined()
  })

  it('every holder of a shared object counts, the first too: the later holder let go while the first keeps it, the object stays (Devin on #390)', async () => {
    let t = 0
    const s = createLayerStore({ db: dbOf(), maxBytes: 350, now: () => ++t })
    const shared = bytes(100, 11), d = await sha(shared)
    await s.putObject('a', d, shared)
    await s.putObject('b', d, shared)
    await s.opened('a')
    const own = bytes(100, 12), more = bytes(100, 13)
    await s.putObject('c', await sha(own), own)
    await s.putObject('c', await sha(more), more)
    // past the cap: b, the oldest, goes; a holds the object still
    expect(await s.object(d)).toEqual(shared)
  })

  it('a holder let go and kept again holds the object again: its membership restored, the object kept while it lasts (Devin on #390)', async () => {
    let t = 0
    const s = createLayerStore({ db: dbOf(), maxBytes: 350, now: () => ++t })
    const shared = bytes(100, 14), d = await sha(shared)
    await s.putObject('a', d, shared)
    await s.putObject('b', d, shared)
    const fill = async (paper: string, n: number) => { const b = bytes(100, n); await s.putObject(paper, await sha(b), b) }
    await fill('c', 15)
    await fill('c', 16)
    // a, the oldest, went; b holds the object
    expect((await s.usage()).count).toBe(2)
    expect(await s.object(d)).toEqual(shared)
    // a kept again: it holds the object again, and b, now the oldest, goes; the object stays with a
    await s.putObject('a', d, shared)
    expect((await s.usage()).count).toBe(2)
    expect(await s.object(d)).toEqual(shared)
    // c next (kept before a was again): a still holds it
    await fill('e', 17)
    expect(await s.object(d)).toEqual(shared)
  })

  it('a store of an earlier schema (version 1, 2 or 3) opens empty, cleared, a cache made again as papers are read; a put and a read work then (Devin, Codex on #391)', async () => {
    for (const schema of [1, 2, 3]) {
      const name = `axt-layer-test-${++n}`
      const old = new Dexie(name, { indexedDB, IDBKeyRange })
      old.version(1).stores({ objects: 'sha256, paper', papers: 'paper, openedAt' })
      if (schema >= 2) old.version(2).stores({ refs: '[paper+sha256], sha256, paper' })
      if (schema === 3) old.version(3).stores({})
      const kept = bytes(100, 31), d = await sha(kept)
      await old.table('objects').put({ sha256: d, paper: 'a', bytes: 100, data: kept.slice().buffer })
      await old.table('papers').put({ paper: 'a', openedAt: 1, bytes: 100, catalog: null })
      if (schema >= 2) await old.table('refs').put({ paper: 'b', sha256: d })
      old.close()
      const db = createLayerDb(name, { indexedDB, IDBKeyRange })
      const s = createLayerStore({ db })
      expect(await s.object(d), `version ${schema}`).toBeUndefined()
      expect(await s.usage(), `version ${schema}`).toEqual({ count: 0, bytes: 0 })
      expect(await db.table('refs').count(), `version ${schema}`).toBe(0)
      const b = bytes(50, 32), e = await sha(b)
      await s.putObject('c', e, b)
      expect(await s.object(e), `version ${schema}`).toEqual(b)
      expect(await s.usage(), `version ${schema}`).toEqual({ count: 1, bytes: 50 })
      db.close()
    }
  })

  it('the last catalog of a paper version, counted in its bytes; usage counts paper versions; clear leaves nothing', async () => {
    const s = createLayerStore({ db: dbOf() })
    await s.putCatalog('2600.00001v1', bytes(30, 5))
    await s.putCatalog('2600.00001v1', bytes(40, 6))
    expect(await s.catalog('2600.00001v1')).toEqual(bytes(40, 6))
    const b = bytes(10, 7)
    await s.putObject('2600.00001v2', await sha(b), b)
    expect(await s.usage()).toEqual({ count: 2, bytes: 50 })
    await s.clear()
    expect(await s.usage()).toEqual({ count: 0, bytes: 0 })
    expect(await s.catalog('2600.00001v1')).toBeUndefined()
  })
})
