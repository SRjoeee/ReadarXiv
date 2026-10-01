// The TeX page, framed by the reader (an extension page): BusyTeX in this origin, with its own caches. tex.js wires it
// to the frame's messages; this module is the protocol, so that it can be tested with fakes.
//
// Protocol 2, by postMessage, from extension pages only:
//   ← { type: 'ready', protocol: 2, cv, eid, tid }      on load: the page's, the engine's and the tree's versions
//   → { type: 'init', protocol: 2, engines, fonts }     hints: the engines the visit will use (pdflatex, xelatex,
//                                                       lualatex; default the first two) and the scripts whose CJK
//                                                       faces it will set (Hans, Hant, Jpan, Kore; default none)
//   ← { type: 'progress', phase, loaded, total }        during downloads: 'engine' (BusyTeX and its preloads),
//                                                       'files' (the common files, and the fonts hinted); bytes
//   ← { type: 'init-done', protocol: 2, ms } | { type: 'init-done', error }
//   → { type: 'project', key, files: [{ path, content }] }   the package's files, kept for every compile of it
//   → { type: 'compile', id, key, main, engine, rerun, bibtex, overrides: [{ path, content }] }
//   ← { type: 'compiled', id, ok, ms, pdf (transferred), aux, bbl, log, network }
//                                                       network: the files the compile could not fetch for a network
//                                                       reason (no answer, a timeout, a server's error), each asked
//                                                       twice; never a file the tree does not have
// Protocol 1 (the reader of 2026-10-01) is answered too: its init's `endpoint` is ignored — the page reaches its own
// tree — and it reads none of the new fields.
//
// What makes it fast (stage 3, D2): BusyTeX's preloaded tier is split by engine (tl-common, tl-pdftex, tl-xetex,
// tl-rest: tex-page/build.mjs), and only the hinted engines' parts are loaded; the files most compiles of an engine
// fetch from the tree (the manifest) are downloaded in parallel at start-up and handed to BusyTeX before the first
// compile; a request for any other file goes to the tree only when the index (tex-tree.mjs) has the file, so a file
// the tree lacks costs no request. BusyTeX, its preloads and the fonts are kept in Cache Storage under their
// versions, and the caches of other versions are deleted; everything else is left to the browser's HTTP cache.
// Compiles run one at a time, in the order they were asked for.

export const PROTOCOL = 2
const DEFAULT_ENGINES = ['pdflatex', 'xelatex']
/** the engine a compile names → BusyTeX's: classic LaTeX and any other name are compiled by pdfLaTeX, as before */
const ENGINE_OF = { pdflatex: 'pdflatex', latex: 'pdflatex', xelatex: 'xelatex', lualatex: 'lualatex' }
const engineOf = name => ENGINE_OF[name] ?? 'pdflatex'
const ENGINE_CLASS = { pdflatex: 'PdfLatex', xelatex: 'XeLatex', lualatex: 'LuaLatex' }
const CACHE_PREFIX = 'tex-'

/**
 * `build`: the build's description (build.json: versions, addresses, package sizes, manifest); `Runner`, `Engines`:
 * texlyre-busytex's BusyTexRunner and { PdfLatex, XeLatex, LuaLatex }; `fetch`, `caches`: the browser's.
 * → { ready, receive(msg, reply) }: `reply(data, transfer)` answers the sender; receive's promise settles once the
 * message is answered
 */
export function texPage({ build, Runner, Engines, fetch, caches, progressEvery = 250, now = () => performance.now() }) {
  const engineCache = `${CACHE_PREFIX}engine-${build.eid}`
  const fontCache = `${CACHE_PREFIX}fonts-${build.tid}`
  const order = Object.keys(build.packages)
  const projects = new Map()
  let queue = Promise.resolve()
  /** the running BusyTeX: { runner, packages }, and what every start hands it: the index's text, the common files */
  let state = null
  let shared = null

  const packagesFor = engines => {
    const want = new Set()
    for (const e of engines) for (const p of build.engines[engineOf(e)] ?? order) want.add(p)
    return order.filter(p => want.has(p))
  }

  /** progress of one phase: the bytes of its downloads, said at most every progressEvery ms */
  const reporter = (reply, phase) => {
    let loaded = 0, total = 0, last = now(), said = false
    const say = force => {
      const t = now()
      if (!force && t - last < progressEvery) return
      last = t
      said = true
      reply({ type: 'progress', phase, loaded, total })
    }
    return {
      expect: n => { total += n },
      add: n => { loaded += n; say(false) },
      // the whole, once a download was long enough to be said at all (a revisit's caches answer at once)
      end: () => { if (said) { loaded = total; say(true) } },
    }
  }

  const readAll = async (response, progress) => {
    const reader = response.body.getReader()
    const chunks = []
    let n = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      n += value.length
      progress?.add(value.length)
    }
    const out = new Uint8Array(n)
    let at = 0
    for (const c of chunks) { out.set(c, at); at += c.length }
    return out
  }
  const get = async (url, progress) => {
    const r = await fetch(url).catch(e => { throw new Error(`${url}: ${e?.message ?? e}`) })
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
    return { bytes: await readAll(r, progress), type: r.headers.get('content-type') ?? 'application/octet-stream' }
  }
  /** each [url, size] in Cache Storage `name`, fetched when missing; → Map url → bytes when `keep` */
  const cached = async (items, name, progress, keep) => {
    const out = new Map()
    if (!items.length) return out
    const cache = await caches.open(name)
    const missing = []
    await Promise.all(items.map(async ([url, size]) => {
      const hit = await cache.match(url)
      if (hit) { if (keep) out.set(url, new Uint8Array(await hit.arrayBuffer())); return }
      missing.push(url)
      progress.expect(size)
    }))
    await Promise.all(missing.map(async url => {
      const { bytes, type } = await get(url, progress)
      await cache.put(url, new Response(bytes, { headers: { 'content-type': type } }))
      if (keep) out.set(url, bytes)
    }))
    return out
  }

  const dropOldCaches = async () => {
    for (const name of await caches.keys()) if (name.startsWith(CACHE_PREFIX) && name !== engineCache && name !== fontCache) await caches.delete(name)
  }

  /** the manifest's entries for these engines and scripts, fetched in parallel → [{ name, format, content }]; an entry
   *  whose file cannot be fetched is left out: the compile asks for it if it needs it */
  const commonFiles = async (engines, scripts, progress) => {
    const plain = [], fonts = []
    for (const e of new Set(engines.map(engineOf))) plain.push(...(build.manifest.engines[e] ?? []))
    for (const s of scripts) fonts.push(...(build.manifest.fonts[s] ?? []))
    const url = path => build.tree + path.split('/').map(encodeURIComponent).join('/')
    const bytes = new Map()
    const fontUrls = [...new Map(fonts.map(([, , path, size]) => [url(path), size])).entries()]
    const fontsP = cached(fontUrls, fontCache, progress, true).then(m => { for (const [u, b] of m) bytes.set(u, b) }, () => {})
    const plainUrls = [...new Map(plain.map(([, , path, size]) => [url(path), size])).entries()].filter(([u]) => !fontUrls.some(([f]) => f === u))
    for (const [, size] of plainUrls) progress.expect(size)
    await Promise.all([fontsP, ...plainUrls.map(([u]) => get(u, progress).then(r => { bytes.set(u, r.bytes) }, () => {}))])
    progress.end()
    const out = []
    for (const [format, name, path] of [...plain, ...fonts]) {
      const b = bytes.get(url(path))
      if (b && !out.some(f => f.name === name && f.format === format)) out.push({ name, format, content: b })
    }
    return out
  }

  /** BusyTeX with these packages, its index and common files handed over */
  const start = async packages => {
    const runner = new Runner({ busytexBasePath: build.engine.replace(/\/$/, ''), preloadDataPackages: packages.map(p => `${build.engine}tl-${p}.js`) })
    await runner.initialize(true)
    const index = await shared.index
    await new Promise(resolve => {
      const ack = e => { if (e.data?.axt_tree_ready) { runner.worker.removeEventListener('message', ack); resolve() } }
      runner.worker.addEventListener('message', ack)
      runner.worker.postMessage({ axt_tree: { base: build.tree, index } })
    })
    const files = await shared.files
    if (files.length) await runner.writeTexliveRemoteFiles(files)
    return { runner, packages }
  }
  const engineAssets = packages => [[`${build.engine}busytex.wasm`, build.wasm], ...packages.map(p => [`${build.engine}tl-${p}.data`, build.packages[p]])]

  async function init(msg, reply) {
    if (state) return { type: 'init-done', protocol: PROTOCOL, ms: 0 }
    const t0 = now()
    const v2 = msg.protocol >= 2
    const engines = v2 && Array.isArray(msg.engines) && msg.engines.length ? msg.engines : DEFAULT_ENGINES
    const scripts = v2 && Array.isArray(msg.fonts) ? msg.fonts : []
    const packages = packagesFor(engines)
    const dropped = dropOldCaches().catch(() => {})
    const engineProgress = reporter(reply, 'engine')
    const engineP = cached(engineAssets(packages), engineCache, engineProgress, false).then(() => engineProgress.end())
    shared = {
      index: fetch(`${build.tree}index.txt`).then(r => { if (!r.ok) throw new Error(`the tree's index: HTTP ${r.status}`); return r.text() }),
      files: commonFiles(engines, scripts, reporter(reply, 'files')),
      extra: Promise.all((build.extra ?? []).map(async path => ({ path, content: (await get(`${build.page}extra/${path}`)).bytes }))),
    }
    shared.index.catch(() => {})
    shared.extra.catch(() => {})
    await engineP
    state = await start(packages)
    await dropped
    return { type: 'init-done', protocol: PROTOCOL, ms: Math.round(now() - t0) }
  }

  /** the running BusyTeX has the engine's packages, or is started again with them added */
  async function ensureEngine(engine) {
    const need = packagesFor([engine])
    if (need.every(p => state.packages.includes(p))) return
    const packages = order.filter(p => need.includes(p) || state.packages.includes(p))
    await cached(engineAssets(packages), engineCache, reporter(() => {}, 'engine'), false)
    state.runner.terminate()
    state = await start(packages)
  }

  async function compile(msg) {
    if (!state) throw new Error('compile before init')
    await ensureEngine(msg.engine)
    const t0 = now()
    const files = new Map(projects.get(msg.key) ?? [])
    for (const o of msg.overrides ?? []) files.set(o.path, o.content)
    const input = files.get(msg.main)
    files.delete(msg.main)
    const extra = await shared.extra.catch(() => [])
    const Engine = Engines[ENGINE_CLASS[engineOf(msg.engine)]]
    const { runner } = state
    const network = []
    const failures = e => { if (e.data?.axt_network) network.push(...e.data.axt_network) }
    runner.worker.addEventListener('message', failures)
    let r
    try {
      r = await new Engine(runner).compile({ input, mainTexPath: msg.main, additionalFiles: [...[...files].map(([path, content]) => ({ path, content })), ...extra], bibtex: msg.bibtex, rerun: msg.rerun, verbose: 'silent' })
    } finally { runner.worker.removeEventListener('message', failures) }
    const steps = r.logs ?? []
    const tex = steps.filter(l => !/^(bibtex|biber|makeindex|xdvipdfmx)/.test(l.cmd ?? '')).at(-1)
    const bib = steps.filter(l => /^bibtex/.test(l.cmd ?? '')).at(-1)
    // an empty PDF is no PDF: BusyTeX returns one after a fatal error (a font whose metrics it cannot find)
    const pdf = r.pdf?.byteLength ? r.pdf.slice().buffer : null
    return [{ type: 'compiled', id: msg.id, ok: !!pdf, ms: Math.round(now() - t0), pdf, aux: tex?.aux ?? null, bbl: bib?.aux ?? null, log: String(r.log ?? ''), network: [...new Set(network)] }, pdf ? [pdf] : []]
  }

  const error = e => String(e?.stack ?? e).slice(0, 400)
  return {
    ready: { type: 'ready', protocol: PROTOCOL, cv: build.cv, eid: build.eid, tid: build.tid },
    receive(msg, reply) {
      if (msg?.type === 'project') { projects.set(msg.key, new Map(msg.files.map(f => [f.path, f.content]))); return Promise.resolve() }
      if (msg?.type === 'init') return (queue = queue.then(() => init(msg, reply)).then(d => reply(d), e => reply({ type: 'init-done', error: error(e) })))
      if (msg?.type === 'compile') return (queue = queue.then(() => compile(msg)).then(([d, t]) => reply(d, t), e => reply({ type: 'compiled', id: msg.id, ok: false, error: error(e), network: [] })))
      return Promise.resolve()
    },
  }
}
