// The PDF reader's store of papers' layers (cache/layer-store.ts; Stage 5 Task 10): objects by digest, checked against it before
// they are kept and each time they are read; the last catalog of each paper version; the papers opened least recently let go
// first beyond the cap; a slow read a miss
import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
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
