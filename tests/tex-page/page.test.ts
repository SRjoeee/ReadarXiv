// The TeX page's protocol (experiments/pdf-bilingual/poc-site/tex-page.mjs), version 2 beside version 1: the reader of
// today (session.mjs openCompiler) sends { init, endpoint }, a project and compiles, and waits for init-done and
// compiled; version 2 adds `ready`'s versions, init's hints, progress during first downloads, and the network failures
// a compile met — the page's own downloads' too, which are retried, timed out and checked. BusyTeX's runner, the network and Cache Storage are fakes here; the
// page itself runs in a browser in tex-page/measure.mjs and network-check.mjs
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { type Build, mayDrive, texPage } from '../../experiments/pdf-bilingual/poc-site/tex-page.mjs'

type Msg = Record<string, unknown> & { type?: string }

const INDEX = 'tex/latex/base/\narticle.cls'
const iid = createHash('sha256').update(`${INDEX}\0`).digest('hex').slice(0, 12)
const BUILD: Build = {
  cv: 'c1', eid: 'e1', tid: 't1',
  page: '/c/c1/', engine: '/e/e1/', tree: '/t/t1/', index: `index-${iid}.txt`,
  packages: { common: 100, pdftex: 200, xetex: 300, rest: 400 },
  wasm: 1000,
  engines: { pdflatex: ['common', 'pdftex'], xelatex: ['common', 'xetex'] },
  manifest: {
    engines: { pdflatex: [[26, 'article.cls', 'tex/latex/base/article.cls', 10], [26, 'hyperref.sty', 'tex/latex/hyperref/hyperref.sty', 4]], xelatex: [[26, 'fontspec.sty', 'tex/latex/fontspec/fontspec.sty', 20], [26, 'hyperref.sty', 'tex/latex/hyperref/hyperref.sty', 4]] },
    fonts: { Hans: [[47, 'FandolSong-Regular.otf', 'fonts/opentype/public/fandol/FandolSong-Regular.otf', 30]] },
    bundles: {
      common: { url: '/b/b0.bin', size: 4, files: [['tex/latex/hyperref/hyperref.sty', 0, 4]] },
      pdflatex: { url: '/b/b1.bin', size: 10, files: [['tex/latex/base/article.cls', 0, 10]] },
      xelatex: { url: '/b/b2.bin', size: 20, files: [['tex/latex/fontspec/fontspec.sty', 0, 20]] },
    },
  },
}
const SIZES: Record<string, number> = {
  '/e/e1/busytex.wasm': 1000, '/e/e1/tl-common.data': 100, '/e/e1/tl-pdftex.data': 200, '/e/e1/tl-xetex.data': 300, '/e/e1/tl-rest.data': 400,
  '/b/b0.bin': 4, '/b/b1.bin': 10, '/b/b2.bin': 20,
  '/t/t1/fonts/opentype/public/fandol/FandolSong-Regular.otf': 30,
}
/** one answer of the fake network: the file, a dropped connection, a status (with Retry-After), the wrong length, or a
 *  body that never ends */
type Outcome = 'ok' | 'drop' | 'stall' | { status: number; retryAfter?: number } | { length: number }

/** a fake network: each URL answers its size in bytes, or, while a script for it lasts, its next scripted outcome */
function network(script: Record<string, Outcome[]> = {}) {
  const asked: { url: string; cache?: string }[] = []
  const fetch = async (url: string, init: { signal?: AbortSignal; cache?: string } = {}) => {
    asked.push({ url, cache: init.cache })
    const outcome = script[url]?.shift() ?? 'ok'
    if (outcome === 'drop') throw new TypeError('Failed to fetch')
    if (url === `/t/t1/${BUILD.index}`) return new Response(INDEX)
    if (outcome === 'stall') {
      const body = new ReadableStream({ start(c) { init.signal?.addEventListener('abort', () => c.error(init.signal?.reason)) } })
      return new Response(body)
    }
    if (typeof outcome === 'object' && 'status' in outcome) return new Response('', { status: outcome.status, headers: outcome.retryAfter != null ? { 'retry-after': String(outcome.retryAfter) } : {} })
    const n = typeof outcome === 'object' && 'length' in outcome ? outcome.length : (SIZES[url] ?? 5)
    return new Response(new Uint8Array(n), { headers: { 'content-type': 'application/octet-stream' } })
  }
  return { fetch, asked, urls: () => asked.map(a => a.url) }
}

/** a fake Cache Storage, whose writes can be refused (a full disk) */
function cacheStorage(names: string[] = [], { refuse = false } = {}) {
  const stores = new Map<string, Map<string, Response>>(names.map(n => [n, new Map()]))
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const s = stores.get(name)!
    return {
      match: async (url: string) => s.get(url)?.clone(),
      put: async (url: string, r: Response) => {
        const body = await r.arrayBuffer()
        if (refuse) throw new DOMException('quota', 'QuotaExceededError')
        s.set(url, new Response(body, { headers: r.headers }))
      },
      delete: async (url: string) => s.delete(url),
    }
  }
  return { stores, caches: { open, keys: async () => [...stores.keys()], delete: async (name: string) => stores.delete(name) } }
}

/** a fake BusyTeX: the runner and its engines; `failNext` the names its next compile reports as failed, `failStart`
 *  makes the next runner's initialize throw */
function busytex() {
  const made: { config: Record<string, unknown>; registered: unknown[]; worker: { sent: unknown[] }; terminated: boolean; compiles: unknown[] }[] = []
  let failures: string[] = []
  let startFails = false
  class Runner {
    rec: (typeof made)[number]
    listeners: ((e: { data: unknown }) => void)[] = []
    worker: { postMessage: (m: unknown) => void; addEventListener: (t: string, f: (e: { data: unknown }) => void) => void; removeEventListener: (t: string, f: (e: { data: unknown }) => void) => void }
    constructor(config: Record<string, unknown>) {
      this.rec = { config, registered: [], worker: { sent: [] }, terminated: false, compiles: [] }
      made.push(this.rec)
      this.worker = {
        postMessage: (m: unknown) => {
          this.rec.worker.sent.push(m)
          if ((m as { axt_tree?: unknown }).axt_tree) queueMicrotask(() => { for (const f of this.listeners) f({ data: { axt_tree_ready: true } }) })
        },
        addEventListener: (_t, f) => { this.listeners.push(f) },
        removeEventListener: (_t, f) => { this.listeners = this.listeners.filter(g => g !== f) },
      }
    }
    async initialize() { if (startFails) { startFails = false; throw new Error('the worker did not start') } }
    async writeTexliveRemoteFiles(files: unknown[]) { this.rec.registered.push(...files) }
    terminate() { this.rec.terminated = true }
    async compile(options: Record<string, unknown>) {
      this.rec.compiles.push(options)
      const f = failures
      failures = []
      if (f.length) for (const l of this.listeners) l({ data: { axt_network: f } })
      return { pdf: new Uint8Array([37, 80, 68, 70]), log: 'log', logs: [{ cmd: 'pdflatex x', aux: 'AUX', log: '' }] }
    }
  }
  const engine = (name: string) => class { runner: Runner; constructor(r: Runner) { this.runner = r } compile(o: Record<string, unknown>) { return this.runner.compile({ ...o, engine: name }) } }
  return { made, Runner, Engines: { PdfLatex: engine('pdflatex'), XeLatex: engine('xelatex'), LuaLatex: engine('lualatex') }, failNext: (names: string[]) => { failures = names }, failStart: () => { startFails = true } }
}

const digest = async (bytes: Uint8Array) => createHash('sha256').update(bytes).digest()
function page(over: { script?: Record<string, Outcome[]>; caches?: ReturnType<typeof cacheStorage>; build?: Build } = {}) {
  const net = network(over.script)
  const store = over.caches ?? cacheStorage()
  const bt = busytex()
  const sent: Msg[] = []
  const slept: number[] = []
  const p = texPage({ build: over.build ?? BUILD, Runner: bt.Runner, Engines: bt.Engines, fetch: net.fetch, caches: store.caches, digest, progressEvery: 0, stallMs: 20, sleep: async (ms: number) => { slept.push(ms) } })
  const send = (msg: Msg) => p.receive(msg, (data: Msg) => { sent.push(data) })
  return { p, send, sent, net, store, bt, slept }
}
const zeros = (n: number) => new Uint8Array(n)

describe('mayDrive', () => {
  it('the origins the build names may drive the page, and no other', () => {
    const framers = ['chrome-extension://llohepijpkbbfhjolcichpamiokeecab', 'https://app.readarxiv.org']
    expect(mayDrive(framers, 'chrome-extension://llohepijpkbbfhjolcichpamiokeecab')).toBe(true)
    expect(mayDrive(framers, 'https://app.readarxiv.org')).toBe(true)
    expect(mayDrive(framers, 'chrome-extension://aaaabbbbccccddddeeeeffffgggghhhh')).toBe(false)
    expect(mayDrive(framers, 'https://evil.example')).toBe(false)
  })

  it('a build that names none (on this machine): any extension page, nothing else', () => {
    for (const framers of [undefined, []]) {
      expect(mayDrive(framers, 'chrome-extension://aaaabbbbccccddddeeeeffffgggghhhh')).toBe(true)
      expect(mayDrive(framers, 'https://evil.example')).toBe(false)
      expect(mayDrive(framers, 'null')).toBe(false)
    }
  })
})

describe('ready', () => {
  it('says the protocol and the versions of the page, the engine and the tree', () => {
    expect(page().p.ready).toEqual({ type: 'ready', protocol: 2, cv: 'c1', eid: 'e1', tid: 't1' })
  })
})

describe('init', () => {
  it('version 1 (an endpoint, no hints): both engines\' preloads, the engine from its version, init-done', async () => {
    const t = page()
    await t.send({ type: 'init', endpoint: 'http://localhost:8070' })
    const done = t.sent.find(m => m.type === 'init-done')
    expect(done).toMatchObject({ type: 'init-done', protocol: 2 })
    expect(done?.error).toBeUndefined()
    expect(t.bt.made[0]?.config).toMatchObject({ busytexBasePath: '/e/e1', preloadDataPackages: ['/e/e1/tl-common.js', '/e/e1/tl-pdftex.js', '/e/e1/tl-xetex.js'] })
  })

  it('takes no endpoint: the tree is the page\'s own, and its index goes to the worker', async () => {
    const t = page()
    await t.send({ type: 'init', endpoint: 'http://elsewhere.example' })
    expect(t.net.urls().some(u => u.includes('elsewhere'))).toBe(false)
    expect(t.bt.made[0]?.worker.sent).toContainEqual({ axt_tree: { base: '/t/t1/', index: INDEX } })
  })

  it('version 2: only the engines hinted, their common files fetched in bundles and handed to BusyTeX before init-done', async () => {
    const t = page()
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'], fonts: [] })
    expect(t.bt.made[0]?.config.preloadDataPackages).toEqual(['/e/e1/tl-common.js', '/e/e1/tl-pdftex.js'])
    expect(t.bt.made[0]?.registered).toEqual([{ name: 'article.cls', format: 26, content: zeros(10) }, { name: 'hyperref.sty', format: 26, content: zeros(4) }])
    expect(t.net.urls().filter(u => u.startsWith('/b/')).sort()).toEqual(['/b/b0.bin', '/b/b1.bin'])
    expect(t.net.urls().filter(u => u.startsWith('/t/t1/tex/'))).toEqual([])
  })

  it('fetches a script\'s fonts only when hinted, and keeps them in Cache Storage under the tree\'s version', async () => {
    const font = '/t/t1/fonts/opentype/public/fandol/FandolSong-Regular.otf'
    const without = page()
    await without.send({ type: 'init', protocol: 2, engines: ['xelatex'], fonts: [] })
    expect(without.net.urls()).not.toContain(font)
    const t = page()
    await t.send({ type: 'init', protocol: 2, engines: ['xelatex'], fonts: ['Hans'] })
    expect(t.net.urls()).toContain(font)
    expect(t.bt.made[0]?.registered).toContainEqual({ name: 'FandolSong-Regular.otf', format: 47, content: zeros(30) })
    expect([...(t.store.stores.get('tex-fonts-t1')?.keys() ?? [])]).toEqual([font])
  })

  it('keeps the engine and its preloads in Cache Storage under the engine\'s version, not in the HTTP cache too; a returning visit fetches neither', async () => {
    const store = cacheStorage()
    const first = page({ caches: store })
    await first.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    expect([...(store.stores.get('tex-engine-e1')?.keys() ?? [])].sort()).toEqual(['/e/e1/busytex.wasm', '/e/e1/tl-common.data', '/e/e1/tl-pdftex.data'])
    expect(first.net.asked.filter(a => a.url.startsWith('/e/')).every(a => a.cache === 'no-store')).toBe(true)
    expect((await (await store.caches.open('tex-engine-e1')).match('/e/e1/busytex.wasm'))?.headers.get('content-type')).toBe('application/wasm')
    const again = page({ caches: store })
    await again.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    expect(again.net.urls().filter(u => u.startsWith('/e/'))).toEqual([])
  })

  it('deletes the caches of other versions', async () => {
    const store = cacheStorage(['tex-engine-old', 'tex-fonts-old', 'unrelated'])
    const t = page({ caches: store })
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    expect([...store.stores.keys()].sort()).toEqual(['tex-engine-e1', 'unrelated'])
  })

  it('says how far a first visit\'s downloads are, by phase, ending at the whole', async () => {
    const t = page()
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    const progress = t.sent.filter(m => m.type === 'progress')
    expect(progress.filter(m => m.phase === 'engine').at(-1)).toEqual({ type: 'progress', phase: 'engine', loaded: 1300, total: 1300 })
    expect(progress.filter(m => m.phase === 'files').at(-1)).toEqual({ type: 'progress', phase: 'files', loaded: 14, total: 14 })
    expect(t.sent.findIndex(m => m.type === 'init-done')).toBeGreaterThan(t.sent.findLastIndex(m => m.type === 'progress'))
  })

  it('a bundle that cannot be fetched is left for the compile to ask for: init still succeeds', async () => {
    const t = page({ script: { '/b/b1.bin': ['drop', 'drop'] } })
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    expect(t.sent.find(m => m.type === 'init-done')?.error).toBeUndefined()
    expect(t.bt.made[0]?.registered).toEqual([{ name: 'hyperref.sty', format: 26, content: zeros(4) }])
  })

  it('a download that fails is tried once more', async () => {
    const t = page({ script: { '/e/e1/busytex.wasm': ['drop'] } })
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    expect(t.sent.find(m => m.type === 'init-done')?.error).toBeUndefined()
    expect(t.net.urls().filter(u => u === '/e/e1/busytex.wasm')).toHaveLength(2)
  })

  it('a download that stalls is given up and tried once more', async () => {
    const t = page({ script: { '/e/e1/tl-pdftex.data': ['stall'] } })
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    expect(t.sent.find(m => m.type === 'init-done')?.error).toBeUndefined()
    expect(t.net.urls().filter(u => u === '/e/e1/tl-pdftex.data')).toHaveLength(2)
  })

  it('a server that asks to wait (429 with Retry-After) is waited for, at most 10 s, then asked again', async () => {
    const t = page({ script: { '/b/b0.bin': [{ status: 429, retryAfter: 3 }], '/e/e1/busytex.wasm': [{ status: 503, retryAfter: 60 }] } })
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    expect(t.sent.find(m => m.type === 'init-done')?.error).toBeUndefined()
    expect(t.slept.sort((a, b) => a - b)).toEqual([3000, 10000])
  })

  it('a Cache Storage that refuses to keep a file (a full disk) fails nothing: the bytes in hand go on', async () => {
    const t = page({ caches: cacheStorage([], { refuse: true }) })
    await t.send({ type: 'init', protocol: 2, engines: ['xelatex'], fonts: ['Hans'] })
    expect(t.sent.find(m => m.type === 'init-done')?.error).toBeUndefined()
    expect(t.bt.made[0]?.registered).toContainEqual({ name: 'FandolSong-Regular.otf', format: 47, content: zeros(30) })
  })

  it('an engine file of the wrong length is not kept, tried again, and then fails the init as the network\'s', async () => {
    const store = cacheStorage()
    const t = page({ caches: store, script: { '/e/e1/busytex.wasm': [{ length: 7 }, { length: 7 }] } })
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    expect(t.sent.find(m => m.type === 'init-done')).toMatchObject({ type: 'init-done', network: ['busytex.wasm'] })
    expect(t.sent.find(m => m.type === 'init-done')?.error).toContain('busytex.wasm: 7 bytes, not the 1000 the build says')
    expect(store.stores.get('tex-engine-e1')?.has('/e/e1/busytex.wasm')).toBe(false)
  })

  it('a font of the wrong length is neither kept nor handed to BusyTeX', async () => {
    const t = page({ script: { '/t/t1/fonts/opentype/public/fandol/FandolSong-Regular.otf': [{ length: 29 }, { length: 29 }] } })
    await t.send({ type: 'init', protocol: 2, engines: ['xelatex'], fonts: ['Hans'] })
    expect(t.bt.made[0]?.registered.some(f => (f as { name: string }).name === 'FandolSong-Regular.otf')).toBe(false)
    expect(t.store.stores.get('tex-fonts-t1')?.size ?? 0).toBe(0)
  })

  it('an index whose bytes are not the ones its name says fails the init as the network\'s', async () => {
    const t = page({ build: { ...BUILD, index: 'index-000000000000.txt' } })
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    expect(t.sent.find(m => m.type === 'init-done')).toMatchObject({ type: 'init-done', network: ['index-000000000000.txt'] })
  })

  it('a BusyTeX that does not start fails the init, not as the network\'s', async () => {
    const t = page()
    t.bt.failStart()
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    expect(t.sent.find(m => m.type === 'init-done')).toMatchObject({ type: 'init-done', network: [] })
    expect(t.sent.find(m => m.type === 'init-done')?.error).toContain('the worker did not start')
    expect(t.bt.made[0]?.terminated).toBe(true)
  })
})

describe('compile', () => {
  const compile = { type: 'compile', id: 1, key: 'p', main: 'main.tex', engine: 'pdflatex', rerun: false, bibtex: false, overrides: [{ path: 'main.tex', content: new Uint8Array([1]) }] }

  it('compiles the project with the overrides and answers as version 1 did, with the network failures added', async () => {
    const t = page()
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    await t.send({ type: 'project', key: 'p', files: [{ path: 'main.tex', content: new Uint8Array([0]) }, { path: 'fig.pdf', content: new Uint8Array([2]) }] })
    await t.send(compile)
    const r = t.sent.find(m => m.type === 'compiled')
    expect(r).toMatchObject({ type: 'compiled', id: 1, ok: true, aux: 'AUX', bbl: null, log: 'log', network: [] })
    expect(r?.pdf).toBeInstanceOf(ArrayBuffer)
    expect(t.bt.made[0]?.compiles[0]).toMatchObject({ input: new Uint8Array([1]), mainTexPath: 'main.tex', additionalFiles: [{ path: 'fig.pdf', content: new Uint8Array([2]) }], engine: 'pdflatex' })
    expect(t.bt.made[0]?.compiles[0]).not.toHaveProperty('remoteEndpoint', expect.anything())
  })

  it('reports the files a compile could not fetch for a network reason', async () => {
    const t = page()
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    await t.send({ type: 'project', key: 'p', files: [] })
    t.bt.failNext(['fonts/tfm/public/cm/cmr10.tfm'])
    await t.send(compile)
    expect(t.sent.find(m => m.type === 'compiled')?.network).toEqual(['fonts/tfm/public/cm/cmr10.tfm'])
  })

  it('an engine whose preload was not hinted: a new BusyTeX with its part and its common files, said in progress, before the old one goes', async () => {
    const t = page()
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    await t.send({ type: 'project', key: 'p', files: [] })
    const said = t.sent.length
    await t.send({ ...compile, engine: 'xelatex' })
    expect(t.bt.made).toHaveLength(2)
    expect(t.bt.made[0]?.terminated).toBe(true)
    expect(t.bt.made[1]?.config.preloadDataPackages).toEqual(['/e/e1/tl-common.js', '/e/e1/tl-pdftex.js', '/e/e1/tl-xetex.js'])
    expect(t.bt.made[1]?.registered).toEqual(expect.arrayContaining([{ name: 'article.cls', format: 26, content: zeros(10) }, { name: 'fontspec.sty', format: 26, content: zeros(20) }]))
    expect(t.net.urls().filter(u => u.startsWith('/b/'))).toEqual(['/b/b0.bin', '/b/b1.bin', '/b/b2.bin'])
    expect(t.sent.slice(said).some(m => m.type === 'progress' && m.phase === 'engine')).toBe(true)
    expect(t.bt.made[1]?.compiles[0]).toMatchObject({ engine: 'xelatex' })
  })

  it('an engine that cannot be brought up is the network\'s failure, and the running one stays for the next compile', async () => {
    const t = page({ script: { '/e/e1/tl-xetex.data': ['drop', 'drop'] } })
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    await t.send({ type: 'project', key: 'p', files: [] })
    await t.send({ ...compile, engine: 'xelatex' })
    expect(t.sent.find(m => m.type === 'compiled')).toMatchObject({ id: 1, ok: false, network: ['tl-xetex.data'] })
    expect(t.bt.made[0]?.terminated).toBe(false)
    await t.send({ ...compile, id: 2 })
    expect(t.sent.find(m => m.type === 'compiled' && m.id === 2)).toMatchObject({ ok: true })
  })

  it('a new BusyTeX that does not start is let go, and the running one stays', async () => {
    const t = page()
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    await t.send({ type: 'project', key: 'p', files: [] })
    t.bt.failStart()
    await t.send({ ...compile, engine: 'xelatex' })
    expect(t.sent.find(m => m.type === 'compiled')).toMatchObject({ id: 1, ok: false, network: [] })
    expect(t.bt.made.map(r => r.terminated)).toEqual([false, true])
    await t.send({ ...compile, id: 2 })
    expect(t.sent.find(m => m.type === 'compiled' && m.id === 2)).toMatchObject({ ok: true })
    expect(t.bt.made[0]?.compiles).toHaveLength(1)
  })

  it('after an init that failed, a compile tries the init again with its hints', async () => {
    const t = page({ script: { '/e/e1/busytex.wasm': ['drop', 'drop'] } })
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    expect(t.sent.find(m => m.type === 'init-done')).toMatchObject({ network: ['busytex.wasm'] })
    await t.send({ type: 'project', key: 'p', files: [] })
    await t.send(compile)
    expect(t.sent.find(m => m.type === 'compiled')).toMatchObject({ ok: true })
    expect(t.bt.made.at(-1)?.config.preloadDataPackages).toEqual(['/e/e1/tl-common.js', '/e/e1/tl-pdftex.js'])
  })

  it('an engine with no slim preload (LuaLaTeX) gets every package: the whole of the preloaded tier', async () => {
    const t = page()
    await t.send({ type: 'init', protocol: 2, engines: ['lualatex'] })
    expect(t.bt.made[0]?.config.preloadDataPackages).toEqual(['/e/e1/tl-common.js', '/e/e1/tl-pdftex.js', '/e/e1/tl-xetex.js', '/e/e1/tl-rest.js'])
  })

  it('answers compiles in the order they came, after the init', async () => {
    const t = page()
    const a = t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    const b = t.send({ type: 'project', key: 'p', files: [] })
    const c = t.send(compile)
    const d = t.send({ ...compile, id: 2 })
    await Promise.all([a, b, c, d])
    expect(t.sent.filter(m => m.type === 'init-done' || m.type === 'compiled').map(m => m.type === 'compiled' ? m.id : m.type)).toEqual(['init-done', 1, 2])
  })
})
