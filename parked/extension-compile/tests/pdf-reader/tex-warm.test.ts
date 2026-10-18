// The offscreen document's warm-up (src/entrypoints/ocr/tex-warm.ts): the TeX page framed, asked to warm into the
// extension's store, its files kept, the frame gone. The page, Cache Storage and the lock manager are fakes here; in a
// browser against the built page it runs in parked/lab/spikes/reader-typeset.mjs (WARM=1)
import { describe, expect, it, vi } from 'vitest'
import { type TexFrame, warmPace, warmSlot, warmTexPage } from '@/entrypoints/ocr/tex-warm'
import { LOCK, STORE } from '@/pdf-reader/session/tex-store.mjs'
import type { TexWarmResult } from '@/shared/tex-warm'

const SITE = 'https://tex.readarxiv.org'
const READY = { type: 'ready', protocol: 2, cv: 'c1', eid: 'e1', tid: 't1', index: 'index-0.txt' }
const FILES = ['/e/e1/busytex.wasm', '/b/b0.bin', '/t/t1/index-0.txt']

/** `full`: every write refused (a full disk); `refuse`: the write of the file whose address ends so refused; `slow`: each
 *  write waits for `flush` */
function cacheStorage({ full = false, refuse = '', slow = false } = {}) {
  const stores = new Map<string, Map<string, Uint8Array>>()
  const pending: (() => void)[] = []
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const s = stores.get(name)!
    return {
      match: async (url: string) => (s.has(url) ? new Response(s.get(url)!.slice()) : undefined),
      put: async (url: string, r: Response) => {
        const bytes = new Uint8Array(await r.arrayBuffer())
        if (slow) await new Promise<void>(go => pending.push(go))
        if (full || (refuse && url.endsWith(refuse))) throw new DOMException('quota', 'QuotaExceededError')
        s.set(url, bytes)
      },
      delete: async (url: string) => s.delete(url),
      keys: async () => [...s.keys()].map(url => ({ url })),
    }
  }
  return { stores, caches: { open } as unknown as CacheStorage, held: () => [...(stores.get(STORE)?.keys() ?? [])].sort(), flush: () => { for (const go of pending.splice(0)) go() }, writing: () => pending.length }
}

/**
 * A fake TeX page in a frame: says `ready` (unless `silent`), and to a warm asks which files the store holds, gives the
 * others (`keep`), and says warm-done — or `fails` with the network's files, falls `mute` after its question, or, `endless`,
 * after giving its files
 */
function texPage(over: { silent?: boolean; protocol?: number; fails?: string[]; mute?: boolean; endless?: boolean; ignoresWarm?: boolean } = {}) {
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
          if (over.endless) return
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

  it('says how far the page is (its warm progress), for the pace a reader\'s need is weighed against', async () => {
    const seen: [number, number][] = []
    await warmTexPage(REQUEST, { frame: texPage().frame, caches: cacheStorage().caches, progress: (loaded, total) => { seen.push([loaded, total]) } })
    expect(seen).toEqual([[1, 1]])
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

  it('a page of protocol 1 (no warm-up): not tried, and said to take none, under its version (the review\'s M3)', async () => {
    const page = texPage({ protocol: 1 })
    const result = await warmTexPage(REQUEST, { frame: page.frame, caches: cacheStorage().caches, answerMs: 1000 })
    expect(result).toMatchObject({ ok: false, unsupported: true, versions: '1' })
    expect(page.made[0]?.got).toEqual([])
  })

  it('a page of protocol 2 that does not take the warm-up (one before it): said to take none, under its versions; a page that never answers is not', async () => {
    const ignores = await warmTexPage(REQUEST, { frame: texPage({ ignoresWarm: true }).frame, caches: cacheStorage().caches, answerMs: 10 })
    expect(ignores).toMatchObject({ ok: false, unsupported: true, versions: 'c1/e1/t1/index-0.txt' })
    const silent = await warmTexPage(REQUEST, { frame: texPage({ silent: true }).frame, caches: cacheStorage().caches, answerMs: 10 })
    expect(silent).toMatchObject({ ok: false })
    expect(silent).not.toHaveProperty('unsupported')
  })

  it('a store that cannot keep a file: stopped at once, not done, the frame gone (the review\'s M2: nothing downloaded that cannot be kept)', async () => {
    const page = texPage({ endless: true })
    const result = await warmTexPage(REQUEST, { frame: page.frame, caches: cacheStorage({ full: true }).caches, answerMs: 1000, quietMs: 60_000 })
    expect(result).toMatchObject({ ok: false, lang: 'zh' })
    expect((result as { error: string }).error).toMatch(/could not keep/)
    expect(page.made[0]?.removed).toBe(true)
  })

  it('stopped while a file is being written: the write is finished first, then the lock goes (a reader takes what the store holds)', async () => {
    const page = texPage({ endless: true }), c = cacheStorage({ slow: true }), stop = new AbortController()
    let settled = false
    const result = warmTexPage(REQUEST, { frame: page.frame, caches: c.caches, signal: stop.signal }).then(r => { settled = true; return r })
    for (let i = 0; i < 20 && !c.writing(); i++) await new Promise(r => setTimeout(r, 0))
    expect(c.writing()).toBe(1)
    stop.abort()
    await new Promise(r => setTimeout(r, 5))
    expect(settled).toBe(false)
    for (let i = 0; i < 20 && !settled; i++) { c.flush(); await new Promise(r => setTimeout(r, 0)) }
    await expect(result).resolves.toMatchObject({ ok: false, stopped: true })
    expect(c.held()).toEqual(FILES.map(f => `${SITE}${f}`).sort())
  })

  it('a store that cannot keep one file while others are queued: the failure is said once those are written, the lock held till then (Devin and Codex on #311: a replacement pruning beside stale writes)', async () => {
    const page = texPage({ endless: true }), c = cacheStorage({ slow: true, refuse: 'busytex.wasm' })
    let settled = false
    const result = warmTexPage(REQUEST, { frame: page.frame, caches: c.caches, locks: lockManager().locks, answerMs: 1000, quietMs: 60_000 }).then(r => { settled = true; return r })
    const writing = async () => { for (let i = 0; i < 20 && !c.writing(); i++) await new Promise(r => setTimeout(r, 0)) }
    await writing()
    // the first file's write refused; the second's then runs
    c.flush()
    await writing()
    expect(c.writing()).toBe(1)
    await new Promise(r => setTimeout(r, 5))
    expect(settled).toBe(false)
    for (let i = 0; i < 20 && !settled; i++) { c.flush(); await new Promise(r => setTimeout(r, 0)) }
    await expect(result).resolves.toMatchObject({ ok: false, lang: 'zh', error: expect.stringMatching(/could not keep busytex\.wasm/) })
    expect(c.held()).toEqual([`${SITE}/b/b0.bin`, `${SITE}/t/t1/index-0.txt`])
    expect(page.made[0]?.removed).toBe(true)
  })

  it('a page that falls silent while a file it gave is being written: given up once the write is done, not before', async () => {
    const page = texPage({ endless: true }), c = cacheStorage({ slow: true })
    let settled = false
    const result = warmTexPage(REQUEST, { frame: page.frame, caches: c.caches, answerMs: 1000, quietMs: 10 }).then(r => { settled = true; return r })
    await new Promise(r => setTimeout(r, 30))
    expect(c.writing()).toBe(1)
    expect(settled).toBe(false)
    for (let i = 0; i < 20 && !settled; i++) { c.flush(); await new Promise(r => setTimeout(r, 0)) }
    await expect(result).resolves.toMatchObject({ ok: false, error: 'the TeX page fell silent' })
    expect(c.held()).toEqual(FILES.map(f => `${SITE}${f}`).sort())
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

  it('stopped (another language is wanted now): given up at once, the frame gone, what came kept, nothing pruned', async () => {
    const page = texPage({ mute: true }), c = cacheStorage(), stop = new AbortController()
    const store = await c.caches.open(STORE)
    await store.put(`${SITE}/e/old/busytex.wasm`, new Response(new Uint8Array([1])))
    const result = warmTexPage(REQUEST, { frame: page.frame, caches: c.caches, signal: stop.signal })
    await new Promise(r => setTimeout(r, 5))
    stop.abort()
    await expect(result).resolves.toMatchObject({ ok: false, lang: 'zh', error: 'stopped', stopped: true })
    expect(page.made[0]?.removed).toBe(true)
    expect(c.held()).toContain(`${SITE}/e/old/busytex.wasm`)
  })
})

describe('warmSlot', () => {
  /** a warm-up that runs until it is stopped or `finish`ed */
  function runs() {
    const log: string[] = []
    const ends = new Map<string, () => void>()
    const run = (request: { site: string; lang: string }, signal: AbortSignal) => new Promise<TexWarmResult>(resolve => {
      log.push(`start ${request.lang}`)
      const end = (why: string) => { log.push(`${why} ${request.lang}`); resolve(why === 'done' ? { ok: true, lang: request.lang, versions: 'v', files: 1, bytes: 1, ms: 1 } : { ok: false, lang: request.lang, error: 'stopped', stopped: true }) }
      ends.set(request.lang, () => end('done'))
      signal.addEventListener('abort', () => end('stopped'), { once: true })
    })
    return { log, run, finish: (lang: string) => ends.get(lang)?.() }
  }
  const tick = () => new Promise(r => setTimeout(r, 0))
  const quiet = { report: async () => {} }

  it('one at a time: a second for the language running is let go; once done, the document may close', async () => {
    const r = runs(), idle = vi.fn()
    const slot = warmSlot(r.run, { ...quiet, idle })
    expect(await slot.start({ site: SITE, lang: 'zh' })).toBe(true)
    expect(await slot.start({ site: SITE, lang: 'zh' })).toBe(false)
    expect(slot.running).toBe(true)
    r.finish('zh')
    await tick()
    expect(slot.running).toBe(false)
    expect(idle).toHaveBeenCalledTimes(1)
    expect(r.log).toEqual(['start zh', 'done zh'])
  })

  it('another language takes the place of the running one, which is stopped first; the document is not let go between', async () => {
    const r = runs(), idle = vi.fn()
    const slot = warmSlot(r.run, { ...quiet, idle })
    await slot.start({ site: SITE, lang: 'zh' })
    expect(await slot.start({ site: SITE, lang: 'de' })).toBe(true)
    expect(r.log).toEqual(['start zh', 'stopped zh', 'start de'])
    expect(idle).not.toHaveBeenCalled()
    expect(slot.running).toBe(true)
  })

  it('three in quick turn: the last one alone runs', async () => {
    const r = runs(), idle = vi.fn()
    const slot = warmSlot(r.run, { ...quiet, idle })
    await slot.start({ site: SITE, lang: 'zh' })
    const de = slot.start({ site: SITE, lang: 'de' })
    const ja = slot.start({ site: SITE, lang: 'ja' })
    expect(await de).toBe(false)
    expect(await ja).toBe(true)
    expect(r.log).toEqual(['start zh', 'stopped zh', 'start ja'])
    expect(idle).not.toHaveBeenCalled()
  })

  it('the report goes out once the place is free: a request for another language is not held by the answer to it (the review\'s M1)', async () => {
    const r = runs(), idle = vi.fn(), reports: TexWarmResult[] = []
    // the background answers a report only once its own next request to this document — another language — is answered
    let slot: ReturnType<typeof warmSlot>
    const report = async (result: TexWarmResult) => { reports.push(result); if (result.ok) await slot.start({ site: SITE, lang: 'de' }) }
    slot = warmSlot(r.run, { report, idle })
    await slot.start({ site: SITE, lang: 'zh' })
    r.finish('zh')
    for (let i = 0; i < 10; i++) await tick()
    expect(r.log).toEqual(['start zh', 'done zh', 'start de'])
    expect(reports.map(x => x.lang)).toEqual(['zh'])
    expect(slot.running).toBe(true)
    expect(idle).not.toHaveBeenCalled()
  })

  it('a reader needs the page: a warm-up that would outlast the reader\'s patience at its pace is stopped (the review\'s M4), one nearly done is let finish — a stop loses the files in flight, which the reader\'s page fetches again', async () => {
    let clock = 0
    const runs = new Map<string, { progress: (loaded: number, total: number) => void }>()
    const run = (request: { site: string; lang: string }, signal: AbortSignal, progress: (loaded: number, total: number) => void) => new Promise<TexWarmResult>(resolve => {
      runs.set(request.lang, { progress })
      signal.addEventListener('abort', () => resolve({ ok: false, lang: request.lang, error: String(signal.reason), stopped: true }), { once: true })
    })
    const idle = vi.fn(), reports: TexWarmResult[] = []
    const slot = warmSlot(run, { report: async x => { reports.push(x) }, idle, now: () => clock })
    expect(slot.giveWay(120_000, 'zh')).toBe(false)
    await slot.start({ site: SITE, lang: 'zh' })
    // no byte yet: nothing to wait for
    expect(slot.giveWay(120_000, 'zh')).toBe(true)
    await tick()
    expect(reports).toMatchObject([{ ok: false, stopped: true, error: 'a reader needs the TeX page' }])
    expect(slot.running).toBe(false)
    expect(idle).toHaveBeenCalledTimes(1)
    // 10 s in, 40 % done: 15 s left — let finish
    await slot.start({ site: SITE, lang: 'zh' })
    clock += 10_000
    runs.get('zh')?.progress(40, 100)
    expect(slot.giveWay(120_000, 'zh')).toBe(false)
    expect(slot.running).toBe(true)
    // 60 s in, 30 % done: 140 s left — stopped
    clock += 50_000
    runs.get('zh')?.progress(30, 100)
    expect(slot.giveWay(120_000, 'zh')).toBe(true)
  })

  it('a reader that needs the page in another language stops the warm-up however near its end: none of its faces are the reader\'s (the re-review\'s m4)', async () => {
    let clock = 0
    const progress = new Map<string, (loaded: number, total: number) => void>()
    const run = (request: { site: string; lang: string }, signal: AbortSignal, seen: (loaded: number, total: number) => void) => new Promise<TexWarmResult>(resolve => {
      progress.set(request.lang, seen)
      signal.addEventListener('abort', () => resolve({ ok: false, lang: request.lang, error: String(signal.reason), stopped: true }), { once: true })
    })
    const reports: TexWarmResult[] = []
    const slot = warmSlot(run, { report: async x => { reports.push(x) }, idle: () => {}, now: () => clock })
    await slot.start({ site: SITE, lang: 'zh' })
    // 10 s in, 90 % done: about a second left — a Chinese reader waits for it, a German one does not
    clock += 10_000
    progress.get('zh')?.(90, 100)
    expect(slot.giveWay(120_000, 'zh')).toBe(false)
    expect(slot.giveWay(120_000, 'de')).toBe(true)
    await tick()
    expect(reports).toMatchObject([{ ok: false, lang: 'zh', stopped: true, error: 'a reader needs the TeX page in another language' }])
    expect(slot.running).toBe(false)
  })

  it('the pace: what is left at the speed so far, nothing known before a byte has come', () => {
    let clock = 1000
    const pace = warmPace(() => clock)
    expect(pace.remainingMs()).toBe(Number.POSITIVE_INFINITY)
    clock += 4000
    pace.seen(25, 100)
    expect(pace.remainingMs()).toBe(12_000)
    pace.seen(100, 100)
    expect(pace.remainingMs()).toBe(0)
  })
})
