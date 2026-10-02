// The extension's store of the TeX page's files (src/pdf-reader/engine/tex-store.mjs): what the warm-up keeps and the
// reader hands to its TeX page (the page's `store: true`, tex-page.mjs on exp/tex-page), and the lock that keeps the
// two from downloading a file twice. Cache Storage and the lock manager are fakes; tex-warm.test.ts and the warm-up's
// browser check run them for real
import { describe, expect, it } from 'vitest'
import { answerWant, keepFile, LOCK, pruneStore, STORE, shareLock } from '@/pdf-reader/engine/tex-store.mjs'

const SITE = 'https://tex.readarxiv.org'

/** a fake Cache Storage, by absolute URL as the browser keys it; `broken`: open() refuses */
function cacheStorage({ broken = false } = {}) {
  const stores = new Map<string, Map<string, Uint8Array>>()
  const open = async (name: string) => {
    if (broken) throw new DOMException('no', 'SecurityError')
    if (!stores.has(name)) stores.set(name, new Map())
    const s = stores.get(name)!
    return {
      match: async (url: string) => (s.has(url) ? new Response(s.get(url)!.slice()) : undefined),
      put: async (url: string, r: Response) => { s.set(url, new Uint8Array(await r.arrayBuffer())) },
      delete: async (url: string) => s.delete(url),
      keys: async () => [...s.keys()].map(url => ({ url })),
    }
  }
  return { stores, caches: { open } as unknown as CacheStorage }
}

describe('the store', () => {
  it('keeps a file the page gives, under the site\'s address', async () => {
    const c = cacheStorage()
    await keepFile(SITE, { url: '/e/e1/busytex.wasm', bytes: new Uint8Array([1, 2, 3]).buffer }, c.caches)
    expect([...(c.stores.get(STORE)?.keys() ?? [])]).toEqual([`${SITE}/e/e1/busytex.wasm`])
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
    await expect(keepFile(SITE, { url: '/b/b0.bin', bytes: new ArrayBuffer(1) }, c.caches)).resolves.toBeUndefined()
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
  it('a reader shares the lock for the page\'s life; it is granted once no warm-up holds it alone', async () => {
    const asked: { name: string; mode?: string }[] = []
    let grant: (() => void) | null = null
    const locks = { request: (name: string, options: { mode?: string }, callback: () => Promise<void>) => { asked.push({ name, mode: options.mode }); return new Promise<void>(done => { grant = () => void callback().then(done) }) } }
    let held = false
    const share = shareLock(locks as unknown as LockManager).then(() => { held = true })
    await new Promise(r => setTimeout(r, 0))
    expect(asked).toEqual([{ name: LOCK, mode: 'shared' }])
    expect(held).toBe(false)
    grant!()
    await share
    expect(held).toBe(true)
  })

  it('no lock manager: granted at once', async () => {
    await expect(shareLock(undefined)).resolves.toBeUndefined()
  })
})
