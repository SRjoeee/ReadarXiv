// The offscreen document's warm-up (src/entrypoints/ocr/tex-warm.ts): the TeX page framed, asked to warm into the
// extension's store, its files kept, the frame gone. The page, Cache Storage and the lock manager are fakes here; the
// warm-up's browser check (experiments/pdf-bilingual/spikes/warm-check.mjs) runs it against the built page
import { describe, expect, it } from 'vitest'
import { type TexFrame, warmTexPage } from '@/entrypoints/ocr/tex-warm'
import { LOCK, STORE } from '@/pdf-reader/engine/tex-store.mjs'

const SITE = 'https://tex.readarxiv.org'
const READY = { type: 'ready', protocol: 2, cv: 'c1', eid: 'e1', tid: 't1', index: 'index-0.txt' }
const FILES = ['/e/e1/busytex.wasm', '/b/b0.bin', '/t/t1/index-0.txt']

function cacheStorage() {
  const stores = new Map<string, Map<string, Uint8Array>>()
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const s = stores.get(name)!
    return {
      match: async (url: string) => (s.has(url) ? new Response(s.get(url)!.slice()) : undefined),
      put: async (url: string, r: Response) => { s.set(url, new Uint8Array(await r.arrayBuffer())) },
      delete: async (url: string) => s.delete(url),
      keys: async () => [...s.keys()].map(url => ({ url })),
    }
  }
  return { stores, caches: { open } as unknown as CacheStorage, held: () => [...(stores.get(STORE)?.keys() ?? [])].sort() }
}

/**
 * A fake TeX page in a frame: says `ready` (unless `silent`), and to a warm asks which files the store holds, gives the
 * others (`keep`), and says warm-done — or `fails` with the network's files, or falls `mute` after its question
 */
function texPage(over: { silent?: boolean; protocol?: number; fails?: string[]; mute?: boolean; ignoresWarm?: boolean } = {}) {
  const made: { src: string; removed: boolean; got: unknown[] }[] = []
  const frame = (src: string): TexFrame => {
    const rec = { src, removed: false, got: [] as unknown[] }
    made.push(rec)
    let handler: (data: unknown) => void = () => {}
    const say = (data: unknown) => queueMicrotask(() => { if (!rec.removed) handler(data) })
    if (!over.silent) say({ ...READY, protocol: over.protocol ?? 2 })
    return {
      listen: h => { handler = h },
      remove: () => { rec.removed = true },
      post: message => {
        rec.got.push(message)
        const m = message as { type: string; files?: Record<string, unknown> }
        if (m.type === 'warm' && !over.ignoresWarm) say({ type: 'want', id: 1, files: FILES, bytes: false })
        if (m.type === 'have' && !over.mute) {
          for (const url of FILES) if (!m.files?.[url]) say({ type: 'keep', url, bytes: new Uint8Array([7]).buffer })
          say({ type: 'progress', phase: 'warm', loaded: 1, total: 1 })
          say(over.fails ? { type: 'warm-done', error: `could not fetch ${over.fails.join(', ')}`, network: over.fails } : { type: 'warm-done', protocol: 2, ms: 5, files: FILES.length, bytes: 3 })
        }
      },
    }
  }
  return { made, frame }
}

/** a lock manager whose lock a reader may hold */
function lockManager({ taken = false } = {}) {
  const asked: { name: string; mode?: string; ifAvailable?: boolean }[] = []
  return {
    asked,
    locks: { request: async (name: string, options: { mode?: string; ifAvailable?: boolean }, callback: (lock: unknown) => unknown) => { asked.push({ name, ...options }); return callback(taken ? null : { name }) } } as unknown as LockManager,
  }
}

const REQUEST = { site: SITE, lang: 'zh', engines: ['pdflatex', 'xelatex'], fonts: ['Hans'] }

describe('warmTexPage', () => {
  it('frames the page, asks it to warm into the store with the hints, keeps what it gives, and says what it did; the frame goes', async () => {
    const page = texPage(), c = cacheStorage(), l = lockManager()
    const result = await warmTexPage(REQUEST, { frame: page.frame, caches: c.caches, locks: l.locks })
    expect(result).toMatchObject({ ok: true, lang: 'zh', versions: 'c1/e1/t1/index-0.txt', files: 3, bytes: 3 })
    expect(page.made).toHaveLength(1)
    expect(page.made[0]?.src).toBe(`${SITE}/tex.html`)
    expect(page.made[0]?.got[0]).toEqual({ type: 'warm', protocol: 2, engines: ['pdflatex', 'xelatex'], fonts: ['Hans'], store: true })
    expect(c.held()).toEqual(FILES.map(f => `${SITE}${f}`).sort())
    expect(page.made[0]?.removed).toBe(true)
    expect(l.asked).toEqual([{ name: LOCK, mode: 'exclusive', ifAvailable: true }])
  })

  it('answers the page\'s question from the store: a file held is not given again, and what the page no longer names goes', async () => {
    const page = texPage(), c = cacheStorage()
    const store = await c.caches.open(STORE)
    await store.put(`${SITE}/e/e1/busytex.wasm`, new Response(new Uint8Array([1, 2])))
    await store.put(`${SITE}/e/old/busytex.wasm`, new Response(new Uint8Array([1])))
    await warmTexPage(REQUEST, { frame: page.frame, caches: c.caches })
    expect(page.made[0]?.got[1]).toEqual({ type: 'have', id: 1, files: { '/e/e1/busytex.wasm': true } })
    expect(c.held()).toEqual(FILES.map(f => `${SITE}${f}`).sort())
    expect(new Uint8Array(await (await store.match(`${SITE}/e/e1/busytex.wasm`))!.arrayBuffer())).toEqual(new Uint8Array([1, 2]))
  })

  it('a reader that typesets is open (the lock is taken): deferred, the page not even framed', async () => {
    const page = texPage()
    const result = await warmTexPage(REQUEST, { frame: page.frame, caches: cacheStorage().caches, locks: lockManager({ taken: true }).locks })
    expect(result).toMatchObject({ ok: false, deferred: true })
    expect(page.made).toHaveLength(0)
  })

  it('a page that does not answer, or one that does not take a warm-up: given up, the frame gone', async () => {
    for (const over of [{ silent: true }, { ignoresWarm: true }]) {
      const page = texPage(over)
      const result = await warmTexPage(REQUEST, { frame: page.frame, caches: cacheStorage().caches, answerMs: 10 })
      expect(result).toMatchObject({ ok: false, lang: 'zh' })
      expect(page.made[0]?.removed).toBe(true)
    }
  })

  it('a page of protocol 1 (no warm-up): not tried', async () => {
    const page = texPage({ protocol: 1 })
    const result = await warmTexPage(REQUEST, { frame: page.frame, caches: cacheStorage().caches, answerMs: 1000 })
    expect(result).toMatchObject({ ok: false })
    expect(page.made[0]?.got).toEqual([])
  })

  it('a page that falls silent midway: given up after quietMs', async () => {
    const page = texPage({ mute: true })
    const result = await warmTexPage(REQUEST, { frame: page.frame, caches: cacheStorage().caches, answerMs: 1000, quietMs: 10 })
    expect(result).toMatchObject({ ok: false })
    expect(page.made[0]?.removed).toBe(true)
  })

  it('the page could not fetch a file: not done, the network\'s files said, what came kept, nothing pruned', async () => {
    const page = texPage({ fails: ['b0.bin'] }), c = cacheStorage()
    const store = await c.caches.open(STORE)
    await store.put(`${SITE}/e/old/busytex.wasm`, new Response(new Uint8Array([1])))
    const result = await warmTexPage(REQUEST, { frame: page.frame, caches: c.caches })
    expect(result).toMatchObject({ ok: false, network: ['b0.bin'] })
    expect(c.held()).toContain(`${SITE}/e/old/busytex.wasm`)
    expect(c.held()).toContain(`${SITE}/e/e1/busytex.wasm`)
  })
})
