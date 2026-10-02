// The extension's store of the TeX page's files (src/pdf-reader/engine/tex-store.mjs): what the warm-up keeps and the
// reader hands to its TeX page (the page's `store: true`, tex-page.mjs on exp/tex-page), and the lock that keeps the
// two from downloading a file twice. Cache Storage and the lock manager are fakes; tex-warm.test.ts and the warm-up's
// browser check run them for real
import { describe, expect, it } from 'vitest'
import { answerWant, keepFile, LOCK, pruneStore, STORE, shareLock } from '@/pdf-reader/engine/tex-store.mjs'

const SITE = 'https://tex.readarxiv.org'

/** a fake Cache Storage, by absolute URL as the browser keys it; `broken`: open() refuses; `full`: put() refuses */
function cacheStorage({ broken = false, full = false } = {}) {
  const stores = new Map<string, Map<string, Uint8Array>>()
  const open = async (name: string) => {
    if (broken) throw new DOMException('no', 'SecurityError')
    if (!stores.has(name)) stores.set(name, new Map())
    const s = stores.get(name)!
    return {
      match: async (url: string) => (s.has(url) ? new Response(s.get(url)!.slice()) : undefined),
      put: async (url: string, r: Response) => { const bytes = new Uint8Array(await r.arrayBuffer()); if (full) throw new DOMException('quota', 'QuotaExceededError'); s.set(url, bytes) },
      delete: async (url: string) => s.delete(url),
      keys: async () => [...s.keys()].map(url => ({ url })),
    }
  }
  return { stores, caches: { open } as unknown as CacheStorage }
}

describe('the store', () => {
  it('keeps a file the page gives, under the site\'s address, and says so', async () => {
    const c = cacheStorage()
    expect(await keepFile(SITE, { url: '/e/e1/busytex.wasm', bytes: new Uint8Array([1, 2, 3]).buffer }, c.caches)).toBe(true)
    expect([...(c.stores.get(STORE)?.keys() ?? [])]).toEqual([`${SITE}/e/e1/busytex.wasm`])
  })

  it('a store that cannot keep a file (a full disk) says so, and throws nothing: the warm-up stops (the review\'s M2)', async () => {
    expect(await keepFile(SITE, { url: '/b/b0.bin', bytes: new ArrayBuffer(1) }, cacheStorage({ full: true }).caches)).toBe(false)
    expect(await keepFile(SITE, { url: '/b/b0.bin', bytes: new ArrayBuffer(1) }, cacheStorage({ broken: true }).caches)).toBe(false)
  })

  it('answers a question about which files it holds with their names alone, and one for bytes with them, to be transferred', async () => {
    const c = cacheStorage()
    await keepFile(SITE, { url: '/e/e1/busytex.wasm', bytes: new Uint8Array([1, 2, 3]).buffer }, c.caches)
    const which = await answerWant(SITE, { type: 'want', id: 4, files: ['/e/e1/busytex.wasm', '/b/b0.bin'], bytes: false }, c.caches)
    expect(which).toEqual({ message: { type: 'have', id: 4, files: { '/e/e1/busytex.wasm': true } }, transfer: [] })
    const bytes = await answerWant(SITE, { type: 'want', id: 5, files: ['/e/e1/busytex.wasm', '/b/b0.bin'], bytes: true }, c.caches)
    expect(bytes.message.id).toBe(5)
    expect(Object.keys(bytes.message.files)).toEqual(['/e/e1/busytex.wasm'])
    expect(new Uint8Array(bytes.message.files['/e/e1/busytex.wasm'] as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]))
    expect(bytes.transfer).toEqual([bytes.message.files['/e/e1/busytex.wasm']])
  })

  it('no Cache Storage: nothing held, nothing kept, and no failure', async () => {
    const c = cacheStorage({ broken: true })
    await expect(keepFile(SITE, { url: '/b/b0.bin', bytes: new ArrayBuffer(1) }, c.caches)).resolves.toBe(false)
    expect(await answerWant(SITE, { type: 'want', id: 1, files: ['/b/b0.bin'], bytes: true }, c.caches)).toEqual({ message: { type: 'have', id: 1, files: {} }, transfer: [] })
  })

  it('pruned to the files named: another language\'s faces and an older version\'s engine go', async () => {
    const c = cacheStorage()
    for (const url of ['/e/old/busytex.wasm', '/e/e1/busytex.wasm', '/t/t1/fonts/opentype/public/fandol/FandolSong-Regular.otf']) await keepFile(SITE, { url, bytes: new ArrayBuffer(1) }, c.caches)
    await pruneStore(SITE, ['/e/e1/busytex.wasm', '/b/b0.bin'], c.caches)
    expect([...(c.stores.get(STORE)?.keys() ?? [])]).toEqual([`${SITE}/e/e1/busytex.wasm`])
  })
})

describe('shareLock', () => {
  it('a warm-up holds the lock: the reader asks it to stop (through the background), and is granted once it has (the review\'s M4)', async () => {
    let release: (() => void) | null = null
    const asked: { mode?: string; ifAvailable?: boolean }[] = []
    // a lock manager whose lock a warm-up holds alone until `release`
    const locks = {
      request: (_name: string, options: { mode?: string; ifAvailable?: boolean }, callback: (lock: unknown) => unknown) => {
        asked.push({ mode: options.mode, ifAvailable: options.ifAvailable })
        if (options.ifAvailable) return Promise.resolve(callback(null))
        return new Promise(done => { release = () => { done(callback({ name: LOCK })) } })
      },
    }
    let busy = 0, held = false
    const share = shareLock(locks as unknown as LockManager, () => { busy++ }).then(() => { held = true })
    await new Promise(r => setTimeout(r, 0))
    expect(busy).toBe(1)
    expect(held).toBe(false)
    expect(asked).toEqual([{ mode: 'shared', ifAvailable: true }, { mode: 'shared', ifAvailable: undefined }])
    ;(release as unknown as () => void)()
    await share
    expect(held).toBe(true)
  })

  it('the lock free: shared for the page\'s life, granted at once, and no warm-up asked to stop', async () => {
    let busy = 0
    const asked: { name: string; mode?: string; ifAvailable?: boolean }[] = []
    let holding: unknown = null
    const locks = { request: (name: string, options: { mode?: string; ifAvailable?: boolean }, callback: (lock: unknown) => unknown) => { asked.push({ name, ...options }); holding = callback({ name }); return Promise.resolve() } }
    await shareLock(locks as unknown as LockManager, () => { busy++ })
    expect(asked).toEqual([{ name: LOCK, mode: 'shared', ifAvailable: true }])
    expect(busy).toBe(0)
    // held while the page lives: the callback's promise never settles
    expect(await Promise.race([holding, new Promise(r => setTimeout(r, 5, 'still held'))])).toBe('still held')
  })

  it('no lock manager: granted at once', async () => {
    await expect(shareLock(undefined)).resolves.toBeUndefined()
  })
})
