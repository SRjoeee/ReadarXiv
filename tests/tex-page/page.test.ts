// The TeX page's protocol (experiments/pdf-bilingual/poc-site/tex-page.mjs), version 2 beside version 1: the reader of
// today (session.mjs openCompiler) sends { init, endpoint }, a project and compiles, and waits for init-done and
// compiled; version 2 adds `ready`'s versions, init's hints, progress during first downloads, and the network failures
// a compile met. BusyTeX's runner, the network and Cache Storage are fakes here; the page itself runs in a browser in
// tex-page/measure.mjs
import { describe, expect, it } from 'vitest'
import { type Build, texPage } from '../../experiments/pdf-bilingual/poc-site/tex-page.mjs'

type Msg = Record<string, unknown> & { type?: string }

const BUILD: Build = {
  cv: 'c1', eid: 'e1', tid: 't1',
  engine: '/e/e1/', tree: '/t/t1/',
  packages: { common: 100, pdftex: 200, xetex: 300, rest: 400 },
  wasm: 1000,
  engines: { pdflatex: ['common', 'pdftex'], xelatex: ['common', 'xetex'] },
  manifest: {
    engines: { pdflatex: [[26, 'article.cls', 'tex/latex/base/article.cls', 10]], xelatex: [[26, 'fontspec.sty', 'tex/latex/fontspec/fontspec.sty', 20]] },
    fonts: { Hans: [[47, 'FandolSong-Regular.otf', 'fonts/opentype/public/fandol/FandolSong-Regular.otf', 30]] },
  },
}

/** a fake network: every URL answers with bytes of its listed size, and the URLs asked are kept */
function network(sizes: Record<string, number> = {}, failing: string[] = []) {
  const asked: string[] = []
  const fetch = async (url: string) => {
    asked.push(url)
    if (failing.includes(url)) throw new TypeError('Failed to fetch')
    if (url.endsWith('/index.txt')) return new Response('tex/latex/base/\narticle.cls')
    if (url.endsWith('/extra/list.json')) return new Response('[]')
    const n = sizes[url] ?? 5
    return new Response(new Uint8Array(n), { headers: { 'content-type': url.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream' } })
  }
  return { fetch, asked }
}

/** a fake Cache Storage */
function cacheStorage(names: string[] = []) {
  const stores = new Map<string, Map<string, Response>>(names.map(n => [n, new Map()]))
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const s = stores.get(name)!
    return { match: async (url: string) => s.get(url)?.clone(), put: async (url: string, r: Response) => { s.set(url, r) } }
  }
  return { stores, caches: { open, keys: async () => [...stores.keys()], delete: async (name: string) => stores.delete(name), match: async (url: string) => { for (const s of stores.values()) if (s.has(url)) return s.get(url)!.clone() } } }
}

/** a fake BusyTeX: the runner and its engines; `network` the names its next compile reports as failed */
function busytex() {
  const made: { config: Record<string, unknown>; registered: unknown[]; worker: { sent: unknown[] }; terminated: boolean; compiles: unknown[] }[] = []
  let failures: string[] = []
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
    async initialize() {}
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
  return { made, Runner, Engines: { PdfLatex: engine('pdflatex'), XeLatex: engine('xelatex'), LuaLatex: engine('lualatex') }, failNext: (names: string[]) => { failures = names } }
}

function page(over: { sizes?: Record<string, number>; failing?: string[]; caches?: ReturnType<typeof cacheStorage> } = {}) {
  const net = network(over.sizes, over.failing)
  const store = over.caches ?? cacheStorage()
  const bt = busytex()
  const sent: Msg[] = []
  const p = texPage({ build: BUILD, Runner: bt.Runner, Engines: bt.Engines, fetch: net.fetch, caches: store.caches, progressEvery: 0 })
  const send = (msg: Msg) => p.receive(msg, (data: Msg) => { sent.push(data) })
  return { p, send, sent, net, store, bt }
}

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
    expect(t.net.asked.some(u => u.includes('elsewhere'))).toBe(false)
    expect(t.bt.made[0]?.worker.sent).toContainEqual({ axt_tree: { base: '/t/t1/', index: 'tex/latex/base/\narticle.cls' } })
  })

  it('version 2: only the engines hinted, their common files fetched and handed to BusyTeX before init-done', async () => {
    const t = page()
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'], fonts: [] })
    expect(t.bt.made[0]?.config.preloadDataPackages).toEqual(['/e/e1/tl-common.js', '/e/e1/tl-pdftex.js'])
    expect(t.bt.made[0]?.registered).toEqual([{ name: 'article.cls', format: 26, content: new Uint8Array(5) }])
    expect(t.net.asked).toContain('/t/t1/tex/latex/base/article.cls')
    expect(t.net.asked).not.toContain('/t/t1/tex/latex/fontspec/fontspec.sty')
  })

  it('fetches a script\'s fonts only when hinted, and keeps them in Cache Storage under the tree\'s version', async () => {
    const font = '/t/t1/fonts/opentype/public/fandol/FandolSong-Regular.otf'
    const without = page()
    await without.send({ type: 'init', protocol: 2, engines: ['xelatex'], fonts: [] })
    expect(without.net.asked).not.toContain(font)
    const t = page()
    await t.send({ type: 'init', protocol: 2, engines: ['xelatex'], fonts: ['Hans'] })
    expect(t.net.asked).toContain(font)
    expect(t.bt.made[0]?.registered).toContainEqual({ name: 'FandolSong-Regular.otf', format: 47, content: new Uint8Array(5) })
    expect([...(t.store.stores.get('tex-fonts-t1')?.keys() ?? [])]).toEqual([font])
  })

  it('keeps the engine and its preloads in Cache Storage under the engine\'s version, and a returning visit fetches neither', async () => {
    const store = cacheStorage()
    const first = page({ caches: store })
    await first.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    expect([...(store.stores.get('tex-engine-e1')?.keys() ?? [])].sort()).toEqual(['/e/e1/busytex.wasm', '/e/e1/tl-common.data', '/e/e1/tl-pdftex.data'])
    const again = page({ caches: store })
    await again.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    expect(again.net.asked.filter(u => u.startsWith('/e/'))).toEqual([])
  })

  it('deletes the caches of other versions', async () => {
    const store = cacheStorage(['tex-engine-old', 'tex-fonts-old', 'unrelated'])
    const t = page({ caches: store })
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    expect([...store.stores.keys()].sort()).toEqual(['tex-engine-e1', 'unrelated'])
  })

  it('says how far a first visit\'s downloads are, by phase, ending at the whole', async () => {
    const t = page({ sizes: { '/e/e1/busytex.wasm': 1000, '/e/e1/tl-common.data': 100, '/e/e1/tl-pdftex.data': 200, '/t/t1/tex/latex/base/article.cls': 10 } })
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    const progress = t.sent.filter(m => m.type === 'progress')
    expect(progress.filter(m => m.phase === 'engine').at(-1)).toEqual({ type: 'progress', phase: 'engine', loaded: 1300, total: 1300 })
    expect(progress.filter(m => m.phase === 'files').at(-1)).toEqual({ type: 'progress', phase: 'files', loaded: 10, total: 10 })
    expect(t.sent.findIndex(m => m.type === 'init-done')).toBeGreaterThan(t.sent.findLastIndex(m => m.type === 'progress'))
  })

  it('a common file that cannot be fetched is left for the compile to ask for: init still succeeds', async () => {
    const t = page({ failing: ['/t/t1/tex/latex/base/article.cls'] })
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    expect(t.sent.find(m => m.type === 'init-done')?.error).toBeUndefined()
    expect(t.bt.made[0]?.registered).toEqual([])
  })

  it('an engine that cannot be fetched fails the init, said in init-done', async () => {
    const t = page({ failing: ['/e/e1/busytex.wasm'] })
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    expect(String(t.sent.find(m => m.type === 'init-done')?.error)).toMatch(/busytex\.wasm/)
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
    t.bt.failNext(['cmr10'])
    await t.send(compile)
    expect(t.sent.find(m => m.type === 'compiled')?.network).toEqual(['cmr10'])
  })

  it('an engine whose preload was not hinted brings the page up again with it, the common files handed over again', async () => {
    const t = page()
    await t.send({ type: 'init', protocol: 2, engines: ['pdflatex'] })
    await t.send({ type: 'project', key: 'p', files: [] })
    await t.send({ ...compile, engine: 'xelatex' })
    expect(t.bt.made).toHaveLength(2)
    expect(t.bt.made[0]?.terminated).toBe(true)
    expect(t.bt.made[1]?.config.preloadDataPackages).toEqual(['/e/e1/tl-common.js', '/e/e1/tl-pdftex.js', '/e/e1/tl-xetex.js'])
    expect(t.bt.made[1]?.registered).toContainEqual({ name: 'article.cls', format: 26, content: new Uint8Array(5) })
    expect(t.bt.made[1]?.compiles[0]).toMatchObject({ engine: 'xelatex' })
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
