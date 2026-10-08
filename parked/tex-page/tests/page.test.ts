// The TeX page's protocol (experiments/pdf-bilingual/poc-site/tex-page.mjs), version 2 beside version 1: the reader of
// today (session.mjs openCompiler) sends { init, endpoint }, a project and compiles, and waits for init-done and
// compiled; version 2 adds `ready`'s versions, init's hints, progress during first downloads, and the network failures
// a compile met — the page's own downloads' too, which are retried, timed out and checked —, the warm-up (download what a
// first compile would fetch, compile nothing) and the framer's store (an extension keeps the page's files, since the
// page framed over arXiv has a cache of its own: warm-brief's probe), which keeps a handed file only when its SHA-256 is
// build.json's. BusyTeX's runner, the network, Cache Storage and the framer are fakes here; the page itself runs in a
// browser in tex-page/measure.mjs, network-check.mjs and xext-check.mjs (another extension's bytes refused)
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { type Build, mayDrive, texPage } from '../poc-site/tex-page.mjs'

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
// every file fetched ahead, by the SHA-256 of the bytes the fake network answers (zeros of its size; the index's text):
// what a file handed over by the framer is checked against
BUILD.sha256 = Object.fromEntries([...Object.entries(SIZES).map(([url, n]) => [url, new Uint8Array(n)] as const), [`/t/t1/${BUILD.index}`, new TextEncoder().encode(INDEX)] as const]
  .map(([url, bytes]) => [url, createHash('sha256').update(bytes).digest('hex')]))
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
      keys: async () => [...s.keys()].map(url => ({ url })),
    }
  }
  return { stores, caches: { open, keys: async () => [...stores.keys()], delete: async (name: string) => stores.delete(name) } }
}

/** a fake BusyTeX: the runner and its engines; `failNext` the names its next compile reports as failed, `failStart`
 *  makes the next runner's initialize throw */
function busytex() {
  const made: { config: Record<string, unknown>; registered: unknown[]; worker: { sent: unknown[] }; terminated: boolean; compiles: unknown[] }[] = []
  let failures: string[] = []
  let steps: Record<string, unknown>[] | null = null
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
      const logs = steps ?? [{ cmd: 'pdflatex x', aux: 'AUX', log: '' }]
      steps = null
      return { pdf: new Uint8Array([37, 80, 68, 70]), log: 'log', logs }
    }
  }
  const engine = (name: string) => class { runner: Runner; constructor(r: Runner) { this.runner = r } compile(o: Record<string, unknown>) { return this.runner.compile({ ...o, engine: name }) } }
  return { made, Runner, Engines: { PdfLatex: engine('pdflatex'), XeLatex: engine('xelatex'), LuaLatex: engine('lualatex') }, failNext: (names: string[]) => { failures = names }, failStart: () => { startFails = true }, stepsNext: (s: Record<string, unknown>[]) => { steps = s } }
}

const digest = async (bytes: Uint8Array) => createHash('sha256').update(bytes).digest()
/**
 * `framer`: the files the framing extension keeps (its store, by the page's URL), answered to the page's `want` and
 * added to by its `keep`; `silent`: a framer that never answers
 */
function page(over: { script?: Record<string, Outcome[]>; caches?: ReturnType<typeof cacheStorage>; build?: Build; framer?: Map<string, Uint8Array>; silent?: boolean; askMs?: number } = {}) {
  const net = network(over.script)
  const store = over.caches ?? cacheStorage()
  const bt = busytex()
  const sent: Msg[] = []
  const slept: number[] = []
  const p = texPage({ build: over.build ?? BUILD, Runner: bt.Runner, Engines: bt.Engines, fetch: net.fetch, caches: store.caches, digest, progressEvery: 0, stallMs: 20, askMs: over.askMs, sleep: async (ms: number) => { slept.push(ms) } })
  const framer = over.framer
  const send = (msg: Msg) => p.receive(msg, (data: Msg) => {
    sent.push(data)
    if (data.type === 'want' && framer && !over.silent) {
      const files: Record<string, ArrayBuffer | true> = {}
      for (const url of data.files as string[]) {
        const b = framer.get(url)
        if (b) files[url] = data.bytes ? b.slice().buffer : true
      }
      queueMicrotask(() => void p.receive({ type: 'have', id: data.id, files }, () => {}))
    }
    if (data.type === 'keep' && framer) framer.set(data.url as string, new Uint8Array(data.bytes as ArrayBuffer))
  })
  return { p, send, sent, net, store, bt, slept }
}
const FONT = '/t/t1/fonts/opentype/public/fandol/FandolSong-Regular.otf'
const INDEX_URL = `/t/t1/${BUILD.index}`
/** the page's one cache of the files it fetches ahead */
const kept = (t: { store: ReturnType<typeof cacheStorage> }) => [...(t.store.stores.get('tex-files')?.keys() ?? [])].sort()
/** every file a pdfLaTeX visit fetches ahead, as the network answers it */
const PDFLATEX_FILES = (): [string, Uint8Array][] => [['/e/e1/busytex.wasm', zeros(1000)], ['/e/e1/tl-common.data', zeros(100)], ['/e/e1/tl-pdftex.data', zeros(200)], ['/b/b0.bin', zeros(4)], ['/b/b1.bin', zeros(10)], [INDEX_URL, new TextEncoder().encode(INDEX)]]
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
  it('says the protocol and the versions of the page, the engine, the tree and its index: what a typesetting verdict holds for', () => {
    expect(page().p.ready).toEqual({ type: 'ready', protocol: 2, cv: 'c1', eid: 'e1', tid: 't1', index: BUILD.index })
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
    expect(t.sent.some(m => m.type === 'want')).toBe(false)
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
    expect(kept(t)).toContain(font)
  })

  it('keeps every file it fetches ahead — the engine, its preloads, the bundles, the index — in one Cache Storage cache, the engine\'s not in the HTTP cache too; a returning visit fetches none of them', async () => {
    const store = cacheStorage()
    const first = page({ caches: store })
    await first.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    expect(kept(first)).toEqual(PDFLATEX_FILES().map(([url]) => url).sort())
    expect(first.net.asked.filter(a => a.url.startsWith('/e/')).every(a => a.cache === 'no-store')).toBe(true)
    expect((await (await store.caches.open('tex-files')).match('/e/e1/busytex.wasm'))?.headers.get('content-type')).toBe('application/wasm')
    const again = page({ caches: store })
    await again.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    expect(again.net.urls()).toEqual([])
    expect(again.bt.made[0]?.registered).toEqual(first.bt.made[0]?.registered)
    expect(again.bt.made[0]?.worker.sent).toContainEqual({ axt_tree: { base: '/t/t1/', index: INDEX } })
  })

  it('deletes the caches of other versions, and the files no longer the build\'s', async () => {
    const store = cacheStorage(['tex-engine-old', 'tex-fonts-old', 'unrelated'])
    const files = await store.caches.open('tex-files')
    await files.put('/e/old/busytex.wasm', new Response('x'))
    await files.put(FONT, new Response(zeros(30)))
    const t = page({ caches: store })
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    expect([...store.stores.keys()].sort()).toEqual(['tex-files', 'unrelated'])
    expect(kept(t)).not.toContain('/e/old/busytex.wasm')
    // another script's faces are still the build's: kept for a visit in that language
    expect(kept(t)).toContain(FONT)
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
    expect(store.stores.get('tex-files')?.has('/e/e1/busytex.wasm')).toBe(false)
  })

  it('a font of the wrong length is neither kept nor handed to BusyTeX', async () => {
    const t = page({ script: { '/t/t1/fonts/opentype/public/fandol/FandolSong-Regular.otf': [{ length: 29 }, { length: 29 }] } })
    await t.send({ type: 'init', protocol: 2, engines: ['xelatex'], fonts: ['Hans'] })
    expect(t.bt.made[0]?.registered.some(f => (f as { name: string }).name === 'FandolSong-Regular.otf')).toBe(false)
    expect(t.store.stores.get('tex-files')?.has('/t/t1/fonts/opentype/public/fandol/FandolSong-Regular.otf')).toBe(false)
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

  it('answers with the bibliography BibTeX made, or biber for biblatex (2608.08872: every draft set each citation as its key)', async () => {
    for (const [cmd, bbl] of [['bibtex8 --8bit main.aux', 'BBL-BIBTEX'], ['biber main.bcf', 'BBL-BIBER']]) {
      const t = page()
      await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
      await t.send({ type: 'project', key: 'p', files: [{ path: 'main.tex', content: new Uint8Array([0]) }] })
      t.bt.stepsNext([{ cmd: 'pdflatex x', aux: 'AUX', log: '' }, { cmd, aux: bbl, log: '' }])
      await t.send({ ...compile, bibtex: true })
      expect(t.sent.find(m => m.type === 'compiled')).toMatchObject({ ok: true, aux: 'AUX', bbl })
    }
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

describe('warm', () => {
  it('downloads what a first compile with these hints would fetch — BusyTeX, the engines\' preloads, their bundles, the index, the script\'s faces — into its cache, and starts no BusyTeX', async () => {
    const t = page()
    await t.send({ type: 'warm', protocol: 2, engines: ['xelatex'], fonts: ['Hans'] })
    expect(t.sent.find(m => m.type === 'warm-done')).toMatchObject({ type: 'warm-done', protocol: 2, files: 7, bytes: 1000 + 100 + 300 + 4 + 20 + INDEX.length + 30 })
    expect(t.sent.find(m => m.type === 'warm-done')?.error).toBeUndefined()
    expect(t.bt.made).toHaveLength(0)
    expect(kept(t)).toEqual(['/b/b0.bin', '/b/b2.bin', '/e/e1/busytex.wasm', '/e/e1/tl-common.data', '/e/e1/tl-xetex.data', FONT, INDEX_URL].sort())
  })

  it('a visit after it downloads nothing ahead', async () => {
    const store = cacheStorage()
    await page({ caches: store }).send({ type: 'warm', protocol: 2, engines: ['pdflatex', 'xelatex'], fonts: ['Hans'] })
    const t = page({ caches: store })
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex', 'xelatex'], fonts: ['Hans'] })
    expect(t.sent.find(m => m.type === 'init-done')?.error).toBeUndefined()
    expect(t.net.urls()).toEqual([])
    expect(t.bt.made[0]?.registered).toContainEqual({ name: 'FandolSong-Regular.otf', format: 47, content: zeros(30) })
  })

  it('without hints: both engines, no faces, as an init without them', async () => {
    const t = page()
    await t.send({ type: 'warm', protocol: 2 })
    expect(kept(t)).toEqual(['/b/b0.bin', '/b/b1.bin', '/b/b2.bin', '/e/e1/busytex.wasm', '/e/e1/tl-common.data', '/e/e1/tl-pdftex.data', '/e/e1/tl-xetex.data', INDEX_URL].sort())
  })

  it('a second warm-up downloads nothing', async () => {
    const store = cacheStorage()
    await page({ caches: store }).send({ type: 'warm', protocol: 2, engines: ['pdflatex'] })
    const t = page({ caches: store })
    await t.send({ type: 'warm', protocol: 2, engines: ['pdflatex'] })
    expect(t.net.urls()).toEqual([])
    expect(t.sent.find(m => m.type === 'warm-done')).toMatchObject({ bytes: 0, files: 6 })
  })

  it('says how far it is, ending at the whole', async () => {
    const t = page()
    await t.send({ type: 'warm', protocol: 2, engines: ['pdflatex'] })
    const progress = t.sent.filter(m => m.type === 'progress')
    expect(progress.at(-1)).toEqual({ type: 'progress', phase: 'warm', loaded: 1314, total: 1314 })
    expect(t.sent.findIndex(m => m.type === 'warm-done')).toBeGreaterThan(t.sent.findLastIndex(m => m.type === 'progress'))
  })

  it('a file that cannot be fetched fails the warm-up as the network\'s; what came is kept', async () => {
    const t = page({ script: { '/b/b1.bin': ['drop', 'drop'] } })
    await t.send({ type: 'warm', protocol: 2, engines: ['pdflatex'] })
    expect(t.sent.find(m => m.type === 'warm-done')).toMatchObject({ type: 'warm-done', network: ['b1.bin'] })
    expect(t.sent.find(m => m.type === 'warm-done')?.error).toContain('b1.bin')
    expect(kept(t)).toContain('/e/e1/busytex.wasm')
    expect(kept(t)).not.toContain('/b/b1.bin')
  })

  it('an index whose bytes are not its name\'s is not kept, and fails the warm-up', async () => {
    const t = page({ build: { ...BUILD, index: 'index-000000000000.txt' } })
    await t.send({ type: 'warm', protocol: 2, engines: ['pdflatex'] })
    expect(t.sent.find(m => m.type === 'warm-done')).toMatchObject({ network: ['index-000000000000.txt'] })
    expect(kept(t)).not.toContain('/t/t1/index-000000000000.txt')
  })

  it('answers in turn with the compiles: a warm-up asked after an init waits for it', async () => {
    const t = page()
    const a = t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    const b = t.send({ type: 'warm', protocol: 2, engines: ['pdflatex'] })
    await Promise.all([a, b])
    expect(t.sent.filter(m => m.type === 'init-done' || m.type === 'warm-done').map(m => m.type)).toEqual(['init-done', 'warm-done'])
    expect(t.net.urls().filter(u => u === '/e/e1/busytex.wasm')).toHaveLength(1)
  })
})

describe('the framer\'s store (store: true): an extension keeps the files, since the page framed over arXiv has a cache of its own', () => {
  it('a warm-up asks which files the framer holds, downloads only the others, gives each to the framer and keeps none itself', async () => {
    const framer = new Map([['/e/e1/busytex.wasm', zeros(1000)]])
    const t = page({ framer })
    await t.send({ type: 'warm', protocol: 2, engines: ['pdflatex'], fonts: [], store: true })
    const want = t.sent.find(m => m.type === 'want')
    expect(want).toMatchObject({ bytes: false })
    expect([...((want?.files ?? []) as string[])].sort()).toEqual(PDFLATEX_FILES().map(([url]) => url).sort())
    expect(t.net.urls()).not.toContain('/e/e1/busytex.wasm')
    expect([...framer.keys()].sort()).toEqual(PDFLATEX_FILES().map(([url]) => url).sort())
    expect(framer.get(INDEX_URL)).toEqual(new TextEncoder().encode(INDEX))
    expect(kept(t)).toEqual([])
    expect(t.sent.find(m => m.type === 'warm-done')).toMatchObject({ type: 'warm-done', files: 6, bytes: 100 + 200 + 4 + 10 + INDEX.length })
  })

  it('an init takes the files its cache lacks from the framer, keeps them, and downloads only the rest', async () => {
    const framer = new Map(PDFLATEX_FILES().filter(([url]) => url !== '/e/e1/tl-pdftex.data'))
    const t = page({ framer })
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'], store: true })
    expect(t.sent.find(m => m.type === 'want')).toMatchObject({ bytes: true })
    expect(t.net.urls()).toEqual(['/e/e1/tl-pdftex.data'])
    expect(t.sent.find(m => m.type === 'init-done')?.error).toBeUndefined()
    expect(kept(t)).toEqual(PDFLATEX_FILES().map(([url]) => url).sort())
    expect(t.bt.made[0]?.registered).toEqual([{ name: 'article.cls', format: 26, content: zeros(10) }, { name: 'hyperref.sty', format: 26, content: zeros(4) }])
    expect(t.bt.made[0]?.worker.sent).toContainEqual({ axt_tree: { base: '/t/t1/', index: INDEX } })
  })

  it('a handed file of the wrong length, or an index whose bytes are not its name\'s, is downloaded instead', async () => {
    const framer = new Map(PDFLATEX_FILES())
    framer.set('/e/e1/tl-common.data', zeros(99))
    framer.set(INDEX_URL, new TextEncoder().encode('tex/latex/base/\nother.cls'))
    const t = page({ framer })
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'], store: true })
    expect(t.net.urls().sort()).toEqual([INDEX_URL, '/e/e1/tl-common.data'].sort())
    expect(t.bt.made[0]?.worker.sent).toContainEqual({ axt_tree: { base: '/t/t1/', index: INDEX } })
  })

  it('a handed file of the build\'s length but not its bytes is neither kept nor used: downloaded instead (another extension that frames the page over arXiv shares its partition: the warm-up review\'s I1)', async () => {
    const framer = new Map(PDFLATEX_FILES())
    framer.set('/e/e1/busytex.wasm', new Uint8Array(1000).fill(1))
    framer.set('/b/b1.bin', new Uint8Array(10).fill(1))
    framer.set('/e/e1/tl-pdftex.data', new Uint8Array(200).fill(1))
    const t = page({ framer })
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'], store: true })
    expect(t.net.urls().sort()).toEqual(['/b/b1.bin', '/e/e1/busytex.wasm', '/e/e1/tl-pdftex.data'])
    expect(t.sent.find(m => m.type === 'init-done')?.error).toBeUndefined()
    const cache = await t.store.caches.open('tex-files')
    for (const [url, n] of [['/e/e1/busytex.wasm', 1000], ['/b/b1.bin', 10], ['/e/e1/tl-pdftex.data', 200]] as const) {
      expect(new Uint8Array(await (await cache.match(url))!.arrayBuffer())).toEqual(zeros(n))
    }
    expect(t.bt.made[0]?.registered).toContainEqual({ name: 'article.cls', format: 26, content: zeros(10) })
  })

  it('a file the build names no SHA-256 for is never taken from the framer', async () => {
    const { '/e/e1/busytex.wasm': _, ...rest } = BUILD.sha256 ?? {}
    const t = page({ framer: new Map(PDFLATEX_FILES()), build: { ...BUILD, sha256: rest } })
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'], store: true })
    expect(t.net.urls()).toEqual(['/e/e1/busytex.wasm'])
  })

  it('an init whose cache holds every file asks the framer nothing', async () => {
    const store = cacheStorage()
    await page({ caches: store }).send({ type: 'warm', protocol: 2, engines: ['pdflatex'] })
    const t = page({ caches: store, framer: new Map() })
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'], store: true })
    expect(t.sent.some(m => m.type === 'want')).toBe(false)
  })

  it('a framer that does not answer: the page goes on by itself', async () => {
    const t = page({ framer: new Map(PDFLATEX_FILES()), silent: true, askMs: 5 })
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'], store: true })
    expect(t.sent.find(m => m.type === 'init-done')?.error).toBeUndefined()
    expect(t.net.urls()).toContain('/e/e1/busytex.wasm')
  })

  it('an engine switch takes the added engine\'s files from the framer too', async () => {
    const framer = new Map<string, Uint8Array>([...PDFLATEX_FILES(), ['/e/e1/tl-xetex.data', zeros(300)], ['/b/b2.bin', zeros(20)]])
    const t = page({ framer })
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'], store: true })
    await t.send({ type: 'project', key: 'p', files: [] })
    await t.send({ type: 'compile', id: 1, key: 'p', main: 'main.tex', engine: 'xelatex', rerun: false, bibtex: false, overrides: [{ path: 'main.tex', content: new Uint8Array([1]) }] })
    expect(t.net.urls()).toEqual([])
    expect(t.sent.find(m => m.type === 'compiled')).toMatchObject({ ok: true })
    expect(t.bt.made[1]?.registered).toContainEqual({ name: 'fontspec.sty', format: 26, content: zeros(20) })
  })

  it('a have for no question asked is let be', async () => {
    const t = page()
    await t.p.receive({ type: 'have', id: 99, files: { '/e/e1/busytex.wasm': new ArrayBuffer(3) } }, () => {})
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    expect(t.net.urls()).toContain('/e/e1/busytex.wasm')
  })
})
