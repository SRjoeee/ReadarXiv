// The TeX page, framed by the reader (an extension page): BusyTeX in this origin, with its own caches. tex.js wires it
// to the frame's messages; this module is the protocol, so that it can be tested with fakes.
//
// Protocol 2, by postMessage, from extension pages only:
//   ← { type: 'ready', protocol: 2, cv, eid, tid }      on load: the page's, the engine's and the tree's versions
//   → { type: 'init', protocol: 2, engines, fonts }     hints: the engines the visit will use (pdflatex, xelatex,
//                                                       lualatex; default the first two) and the scripts whose CJK
//                                                       faces it will set (Hans, Hant, Jpan, Kore; default none)
//   ← { type: 'progress', phase, loaded, total }        during downloads, an engine switch's too: 'engine' (BusyTeX
//                                                       and its preloads), 'files' (the common files, and the fonts
//                                                       hinted); bytes
//   ← { type: 'init-done', protocol: 2, ms } | { type: 'init-done', error, network }
//                                                       error: no compiler. network: the page's own downloads that
//                                                       failed for a network reason, by file name (empty: the failure
//                                                       is not the network's)
//   → { type: 'project', key, files: [{ path, content }] }   the package's files, kept for every compile of it
//   → { type: 'compile', id, key, main, engine, rerun, bibtex, overrides: [{ path, content }] }
//   ← { type: 'compiled', id, ok, ms, pdf (transferred), aux, bbl, log, network } | { type: 'compiled', id, ok: false,
//     error, network }                                  network: the files the compile could not fetch for a network
//                                                       reason (no answer, a timeout, a server's error, a 404 for a
//                                                       file the index lists), each asked twice, by the tree's path;
//                                                       never a file the tree does not have. error: the page
//                                                       failed, not TeX — no log; network as init-done's (an engine
//                                                       switch's downloads)
//   A compile after an init that failed brings BusyTeX up first, with that init's hints. An engine switch brings up a
//   new BusyTeX with the added engine's preload and common files before the running one goes, which stays when the new
//   one cannot be brought up.
// Protocol 1 (the reader of 2026-10-01) is answered too: its init's `endpoint` is ignored — the page reaches its own
// tree — and it reads none of the new fields.
//
// What makes it fast (stage 3, D2): BusyTeX's preloaded tier is split by engine (tl-common, tl-pdftex, tl-xetex,
// tl-rest: tex-page/build.mjs), and only the hinted engines' parts are loaded; the files most compiles of an engine
// fetch from the tree (the manifest) are downloaded at start-up — in a bundle for each engine and one of the files
// both share (b/, content-addressed), the hinted scripts' CJK faces one by one — and handed to BusyTeX before the
// first compile; a request for any other file goes to the tree only when the index (tex-tree.mjs) has the file, so a
// file the tree lacks costs no request. BusyTeX, its preloads and the fonts are kept in Cache Storage under their
// versions, and the caches of other versions are deleted; everything else is left to the browser's HTTP cache.
// Compiles run one at a time, in the order they were asked for.
//
// The page's own downloads: each is tried twice (after the server's Retry-After, at most 10 s, when it asks for one),
// given up after 30 s without a byte, and its length checked against the build's — the index's bytes against its
// name — before it is used or kept. The engine's files stream into Cache Storage as they come; a cache that cannot be
// written (a full disk) fails nothing, since the bytes in hand go on.

export const PROTOCOL = 2
const DEFAULT_ENGINES = ['pdflatex', 'xelatex']
/** the engine a compile names → BusyTeX's: classic LaTeX and any other name are compiled by pdfLaTeX, as before */
const ENGINE_OF = { pdflatex: 'pdflatex', latex: 'pdflatex', xelatex: 'xelatex', lualatex: 'lualatex' }
const engineOf = name => ENGINE_OF[name] ?? 'pdflatex'
const ENGINE_CLASS = { pdflatex: 'PdfLatex', xelatex: 'XeLatex', lualatex: 'LuaLatex' }
const CACHE_PREFIX = 'tex-'

/** a download that failed for a network reason — no answer, a stall, a server's error, the wrong bytes: `what` is
 *  the file, for the answer's `network` */
class NetworkFailure extends Error {
  constructor(what, why) {
    super(`${what}: ${why}`)
    this.what = what
  }
}
const nameOf = url => decodeURIComponent(url.slice(url.lastIndexOf('/') + 1))
/** a Cache Storage entry's type, by the file's extension: the wasm must be application/wasm, whatever the server said */
const typeOf = url => (url.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream')

/**
 * `build`: the build's description (build.json: versions, addresses, sizes, manifest); `Runner`, `Engines`:
 * texlyre-busytex's BusyTexRunner and { PdfLatex, XeLatex, LuaLatex }; `fetch`, `caches`, `digest` (SHA-256 of bytes):
 * the browser's. `stallMs`: a download with no byte for that long is given up (and tried once more).
 * → { ready, receive(msg, reply) }: `reply(data, transfer)` answers the sender; receive's promise settles once the
 * message is answered
 */
export function texPage({ build, Runner, Engines, fetch, caches, digest = bytes => crypto.subtle.digest('SHA-256', bytes), progressEvery = 250, stallMs = 30000, sleep = ms => new Promise(r => setTimeout(r, ms)), now = () => performance.now() }) {
  const engineCache = `${CACHE_PREFIX}engine-${build.eid}`
  const fontCache = `${CACHE_PREFIX}fonts-${build.tid}`
  const order = Object.keys(build.packages)
  const projects = new Map()
  let queue = Promise.resolve()
  /** the running BusyTeX: { runner, packages }; what every start hands it: the index's text, the common files */
  let state = null
  let shared = null
  /** the last init's hints, for an init that failed and is tried again by the next compile */
  let hints = null

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
      add: n => { loaded += n; if (n > 0) say(false) },
      // the whole, once a download was long enough to be said at all (a revisit's caches answer at once)
      end: () => { if (said) { loaded = total; say(true) } },
    }
  }

  /**
   * One try of a download: the body read with `progress`, given up after stallMs without a byte, its decoded length
   * checked against `size` and its bytes by `check` → the bytes, or nothing when `sink` (a Cache Storage entry) takes the
   * body as it comes: then the bytes are never held whole here, and the entry is deleted again if they were wrong
   */
  async function once(url, { size, progress, check, sink }) {
    const controller = new AbortController()
    let timer = null
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(new Error(`no data for ${Math.round(stallMs / 1000)} s`)), stallMs) }
    arm()
    let counted = 0
    try {
      const r = await fetch(url, { signal: controller.signal, ...(sink ? { cache: 'no-store' } : {}) })
      if (!r.ok) {
        const e = new Error(`HTTP ${r.status}`)
        const after = Number(r.headers.get('retry-after'))
        if ((r.status === 429 || r.status === 503) && Number.isFinite(after) && after >= 0) e.retryAfter = after * 1000
        throw e
      }
      let body = r.body, stored = null
      if (sink) {
        const [a, b] = body.tee()
        body = b
        stored = sink.cache.put(url, new Response(a, { headers: { 'content-type': typeOf(url) } })).catch(() => {})
      }
      const reader = body.getReader()
      const chunks = []
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        arm()
        counted += value.length
        progress?.add(value.length)
        if (!sink) chunks.push(value)
      }
      await stored
      if (size != null && counted !== size) {
        if (sink) await sink.cache.delete(url).catch(() => {})
        throw new Error(`${counted} bytes, not the ${size} the build says`)
      }
      if (sink) return null
      const bytes = new Uint8Array(counted)
      let at = 0
      for (const c of chunks) { bytes.set(c, at); at += c.length }
      if (check && !(await check(bytes))) throw new Error('not the bytes its name says')
      return bytes
    } catch (e) {
      progress?.add(-counted)
      throw controller.signal.aborted && controller.signal.reason ? controller.signal.reason : e
    } finally { clearTimeout(timer) }
  }
  /** a download, tried twice (after the server's Retry-After, at most 10 s, when it asks); throws NetworkFailure */
  async function download(url, options = {}) {
    let failure = null
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return await once(url, options) } catch (e) {
        failure = e
        if (attempt === 0 && e?.retryAfter) await sleep(Math.min(e.retryAfter, 10000))
      }
    }
    throw new NetworkFailure(nameOf(url), failure?.message ?? String(failure))
  }

  /** each [url, size] in Cache Storage `name`: what it holds answers, the rest is downloaded into it (and kept in
   *  memory as well when `keep`) → Map url → bytes when `keep`. An entry that cannot be written is no failure: the
   *  bytes in hand go on, and the worker's own fetch falls back to the network */
  async function cached(items, name, progress, keep) {
    const out = new Map()
    if (!items.length) return out
    const cache = await caches.open(name).catch(() => null)
    // no Cache Storage: what is not kept here is left to the worker's own fetch (and the HTTP cache)
    if (!cache && !keep) return out
    const missing = []
    await Promise.all(items.map(async ([url, size]) => {
      const hit = cache ? await cache.match(url).catch(() => undefined) : undefined
      if (hit) { if (keep) out.set(url, new Uint8Array(await hit.arrayBuffer())); return }
      missing.push([url, size])
      progress.expect(size)
    }))
    await Promise.all(missing.map(async ([url, size]) => {
      if (keep || !cache) {
        const bytes = await download(url, { size, progress })
        if (cache) await cache.put(url, new Response(bytes, { headers: { 'content-type': typeOf(url) } })).catch(() => {})
        if (keep) out.set(url, bytes)
      } else await download(url, { size, progress, sink: { cache } })
    }))
    return out
  }

  const dropOldCaches = async () => {
    for (const name of await caches.keys()) if (name.startsWith(CACHE_PREFIX) && name !== engineCache && name !== fontCache) await caches.delete(name)
  }

  /** the index's text, checked against its name (index-<the first 12 hex digits of SHA-256 of its text and a NUL>) */
  const indexText = async () => {
    const expected = /^index-([0-9a-f]{12})\.txt$/.exec(build.index)?.[1]
    const check = async bytes => {
      if (!expected) return true
      const withNul = new Uint8Array(bytes.length + 1)
      withNul.set(bytes)
      const hex = [...new Uint8Array(await digest(withNul))].map(b => b.toString(16).padStart(2, '0')).join('')
      return hex.slice(0, 12) === expected
    }
    return new TextDecoder().decode(await download(`${build.tree}${build.index}`, { check }))
  }

  /**
   * The manifest's files for these engines and scripts → [{ name, format, content }]: the engines' from their bundles
   * (one object each — the files both engines' manifests name, and each engine's own: a handful of requests, not
   * hundreds; a bundle in `fetched` already is not fetched again, and one fetched now is added), the scripts' faces
   * each from the tree into Cache Storage. A bundle or a face that cannot be fetched is left out: the compile asks for
   * its files if it needs them
   */
  async function manifestFiles(engines, scripts, progress, fetched = new Set()) {
    const wanted = [...new Set(engines.map(engineOf))].filter(e => build.manifest.engines[e])
    const bundles = build.manifest.bundles ?? {}
    const names = (wanted.length ? ['common', ...wanted] : []).filter(b => bundles[b] && !fetched.has(b))
    const bytes = new Map() // path → bytes
    for (const b of names) progress.expect(bundles[b].size)
    const url = path => build.tree + path.split('/').map(encodeURIComponent).join('/')
    const fonts = scripts.flatMap(s => build.manifest.fonts[s] ?? [])
    const fontUrls = [...new Map(fonts.map(([, , path, size]) => [url(path), size])).entries()]
    await Promise.all([
      ...names.map(b => download(bundles[b].url, { size: bundles[b].size, progress }).then(all => {
        fetched.add(b)
        for (const [path, offset, size] of bundles[b].files) bytes.set(path, all.subarray(offset, offset + size))
      }, () => {})),
      cached(fontUrls, fontCache, progress, true).then(m => { for (const [, , path] of fonts) if (m.has(url(path))) bytes.set(path, m.get(url(path))) }, () => {}),
    ])
    progress.end()
    const out = []
    for (const [format, name, path] of [...wanted.flatMap(e => build.manifest.engines[e]), ...fonts]) {
      const b = bytes.get(path)
      if (b && !out.some(f => f.name === name && f.format === format)) out.push({ name, format, content: b })
    }
    return out
  }

  /** BusyTeX with these packages, its index and common files handed over; one that fails to come up is let go */
  const start = async packages => {
    const runner = new Runner({ busytexBasePath: build.engine.replace(/\/$/, ''), preloadDataPackages: packages.map(p => `${build.engine}tl-${p}.js`) })
    try {
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
    } catch (e) {
      runner.terminate()
      throw e
    }
  }
  const engineAssets = packages => [[`${build.engine}busytex.wasm`, build.wasm], ...packages.map(p => [`${build.engine}tl-${p}.data`, build.packages[p]])]

  /** BusyTeX brought up for these hints: its engine and preloads, the index and the common files, in parallel */
  async function bringUp({ engines, scripts }, reply) {
    const packages = packagesFor(engines)
    const dropped = dropOldCaches().catch(() => {})
    const engineProgress = reporter(reply, 'engine')
    const engineP = cached(engineAssets(packages), engineCache, engineProgress, false).then(() => engineProgress.end())
    const fetched = new Set()
    shared = {
      index: indexText(),
      files: manifestFiles(engines, scripts, reporter(reply, 'files'), fetched),
      fetched,
      extra: Promise.all((build.extra ?? []).map(async path => ({ path, content: await download(`${build.page}extra/${path}`) }))),
      engines: new Set(engines.map(engineOf)),
    }
    shared.index.catch(() => {})
    shared.extra.catch(() => {})
    try {
      await engineP
      await shared.index
      state = await start(packages)
    } catch (e) {
      shared = null
      throw e
    }
    await dropped
  }

  async function init(msg, reply) {
    if (state) return { type: 'init-done', protocol: PROTOCOL, ms: 0 }
    const t0 = now()
    const v2 = msg.protocol >= 2
    hints = {
      engines: v2 && Array.isArray(msg.engines) && msg.engines.length ? msg.engines : DEFAULT_ENGINES,
      scripts: v2 && Array.isArray(msg.fonts) ? msg.fonts : [],
    }
    await bringUp(hints, reply)
    return { type: 'init-done', protocol: PROTOCOL, ms: Math.round(now() - t0) }
  }

  /** the running BusyTeX has the engine's packages, or a new one is brought up with them added — and with the added
   *  engine's common files — before the old one goes: a failure leaves the old one running */
  async function ensureEngine(engine, reply) {
    const need = packagesFor([engine])
    if (need.every(p => state.packages.includes(p))) return
    const packages = order.filter(p => need.includes(p) || state.packages.includes(p))
    const engineProgress = reporter(reply, 'engine')
    await cached(engineAssets(packages), engineCache, engineProgress, false)
    engineProgress.end()
    if (!shared.engines.has(engineOf(engine))) {
      const before = await shared.files
      const added = await manifestFiles([engine], [], reporter(reply, 'files'), shared.fetched)
      shared.files = Promise.resolve([...before, ...added.filter(f => !before.some(g => g.name === f.name && g.format === f.format))])
      shared.engines.add(engineOf(engine))
    }
    const next = await start(packages)
    state.runner.terminate()
    state = next
  }

  async function compile(msg, reply) {
    // an init that failed is tried again, with its hints, before the compile
    if (!state) await bringUp(hints ?? { engines: DEFAULT_ENGINES, scripts: [] }, reply)
    await ensureEngine(msg.engine, reply)
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
  /** a page-side failure in protocol 2's terms: what failed for a network reason, in `network` */
  const failed = e => ({ error: error(e), network: e instanceof NetworkFailure ? [e.what] : [] })
  return {
    ready: { type: 'ready', protocol: PROTOCOL, cv: build.cv, eid: build.eid, tid: build.tid },
    receive(msg, reply) {
      if (msg?.type === 'project') { projects.set(msg.key, new Map(msg.files.map(f => [f.path, f.content]))); return Promise.resolve() }
      if (msg?.type === 'init') return (queue = queue.then(() => init(msg, reply)).then(d => reply(d), e => reply({ type: 'init-done', ...failed(e) })))
      if (msg?.type === 'compile') return (queue = queue.then(() => compile(msg, reply)).then(([d, t]) => reply(d, t), e => reply({ type: 'compiled', id: msg.id, ok: false, ...failed(e) })))
      return Promise.resolve()
    },
  }
}
