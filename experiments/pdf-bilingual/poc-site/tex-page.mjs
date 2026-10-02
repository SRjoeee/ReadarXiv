// The TeX page, framed by the reader (an extension page): BusyTeX in this origin, with its own caches. tex.js wires it
// to the frame's messages; this module is the protocol, so that it can be tested with fakes.
//
// Protocol 2, by postMessage, from the framing window only, and only when its origin may drive the page (mayDrive: the
// origins build.json names — the store's extension, the development one, the web app — or, when it names none, as a
// build on this machine, any extension page):
//   ← { type: 'ready', protocol: 2, cv, eid, tid, index }   on load: the page's, the engine's and the tree's versions,
//                                                       and the index's name (index-<its version>.txt): a verdict
//                                                       that a paper cannot be typeset holds for these only
//   → { type: 'init', protocol: 2, engines, fonts, store }   hints: the engines the visit will use (pdflatex, xelatex,
//                                                       lualatex; default the first two) and the scripts whose CJK
//                                                       faces it will set (Hans, Hant, Jpan, Kore; default none).
//                                                       store: the framer keeps the page's files (below)
//   ← { type: 'progress', phase, loaded, total }        during downloads, an engine switch's too: 'engine' (BusyTeX
//                                                       and its preloads), 'files' (the common files, and the fonts
//                                                       hinted), 'warm' (a warm-up's); bytes
//   ← { type: 'init-done', protocol: 2, ms } | { type: 'init-done', error, network }
//                                                       error: no compiler. network: the page's own downloads that
//                                                       failed for a network reason, by file name (empty: the failure
//                                                       is not the network's)
//   → { type: 'warm', protocol: 2, engines, fonts, store }   the files a first compile with these hints fetches ahead
//                                                       (the files init fetches: BusyTeX, the engines' preloads,
//                                                       their bundles, the index, the scripts' faces) downloaded and
//                                                       kept — by the page, or with `store` by the framer alone —,
//                                                       nothing started, nothing compiled
//   ← { type: 'warm-done', protocol: 2, ms, files, bytes } | { type: 'warm-done', error, network }
//                                                       files: how many the hints name; bytes: downloaded now
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
//   one cannot be brought up. Messages are answered in the order they came (a warm-up after an init waits for it).
// The framer's store (`store: true`): the page framed over arXiv's PDF page has a Cache Storage of its own (the
// browser partitions it by the top-level site), which a warm-up run anywhere else cannot fill; the extension's own
// storage is one wherever its pages are. So an extension that frames the page keeps its files and hands them over:
//   ← { type: 'want', id, files: [url], bytes }          the files the page would download: with `bytes`, those the
//                                                       framer holds, else only which it holds
//   → { type: 'have', id, files: { url: ArrayBuffer | true } }   (ArrayBuffers transferred). An init keeps what is
//                                                       handed in its own cache, checked as a download is; a file
//                                                       not handed, or wrong, is downloaded. Unanswered for askMs,
//                                                       the page goes on alone
//   ← { type: 'keep', url, bytes (transferred) }         a warm-up's file downloaded, for the framer to keep (the page
//                                                       keeps no copy)
//   The framer decides when it answers (an extension waits for its own warm-up, so that nothing is downloaded twice).
// Protocol 1 (the reader of 2026-10-01) is answered too: its init's `endpoint` is ignored — the page reaches its own
// tree — and it reads none of the new fields.
//
// What makes it fast (stage 3, D2): BusyTeX's preloaded tier is split by engine (tl-common, tl-pdftex, tl-xetex,
// tl-rest: tex-page/build.mjs), and only the hinted engines' parts are loaded; the files most compiles of an engine
// fetch from the tree (the manifest) are downloaded at start-up — in a bundle for each engine and one of the files
// both share (b/, content-addressed), the hinted scripts' CJK faces one by one — and handed to BusyTeX before the
// first compile; a request for any other file goes to the tree only when the index (tex-tree.mjs) has the file, so a
// file the tree lacks costs no request. Every file fetched ahead (BusyTeX, its preloads, the bundles, the index, the
// faces) is kept in one Cache Storage cache, `tex-files`, and a file the build no longer names is deleted from it, as
// are the caches of older pages; the tree's other files are left to the browser's HTTP cache.
// Compiles run one at a time, in the order they were asked for.
//
// The page's own downloads: each is tried twice (after the server's Retry-After, at most 10 s, when it asks for one),
// given up after 30 s without a byte, and its length checked against the build's — the index's bytes against its
// name — before it is used or kept. The engine's files stream into Cache Storage as they come; a cache that cannot be
// written (a full disk) fails nothing, since the bytes in hand go on.

export const PROTOCOL = 2

/** whether a window of `origin` may drive the page: one of `framers` (build.json's, tex-page/build.mjs FRAMERS), or,
 *  when the build names none, any extension page */
export const mayDrive = (framers, origin) => (framers?.length ? framers.includes(origin) : origin.startsWith('chrome-extension://'))
const DEFAULT_ENGINES = ['pdflatex', 'xelatex']
/** the engine a compile names → BusyTeX's: classic LaTeX and any other name are compiled by pdfLaTeX, as before */
const ENGINE_OF = { pdflatex: 'pdflatex', latex: 'pdflatex', xelatex: 'xelatex', lualatex: 'lualatex' }
const engineOf = name => ENGINE_OF[name] ?? 'pdflatex'
const ENGINE_CLASS = { pdflatex: 'PdfLatex', xelatex: 'XeLatex', lualatex: 'LuaLatex' }
const CACHE_PREFIX = 'tex-'
/** the one cache of the files fetched ahead */
const FILES = `${CACHE_PREFIX}files`

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
 * the browser's. `stallMs`: a download with no byte for that long is given up (and tried once more). `askMs`: how long
 * the framer's store is waited for before the page goes on alone (a safety net: the framer is the extension's own page,
 * which may wait for its warm-up).
 * → { ready, receive(msg, reply) }: `reply(data, transfer)` answers the sender; receive's promise settles once the
 * message is answered
 */
export function texPage({ build, Runner, Engines, fetch, caches, digest = bytes => crypto.subtle.digest('SHA-256', bytes), progressEvery = 250, stallMs = 30000, askMs = 300000, sleep = ms => new Promise(r => setTimeout(r, ms)), now = () => performance.now() }) {
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

  const urlOf = path => build.tree + path.split('/').map(encodeURIComponent).join('/')
  const engineAssets = packages => [[`${build.engine}busytex.wasm`, build.wasm], ...packages.map(p => [`${build.engine}tl-${p}.data`, build.packages[p]])]
  /** the index's bytes, checked against its name (index-<the first 12 hex digits of SHA-256 of its text and a NUL>) */
  const indexCheck = async bytes => {
    const expected = /^index-([0-9a-f]{12})\.txt$/.exec(build.index)?.[1]
    if (!expected) return true
    const withNul = new Uint8Array(bytes.length + 1)
    withNul.set(bytes)
    const hex = [...new Uint8Array(await digest(withNul))].map(b => b.toString(16).padStart(2, '0')).join('')
    return hex.slice(0, 12) === expected
  }
  const enginesOf = engines => [...new Set(engines.map(engineOf))].filter(e => build.manifest.engines[e])
  const bundleNames = engines => { const wanted = enginesOf(engines), bundles = build.manifest.bundles ?? {}; return (wanted.length ? ['common', ...wanted] : []).filter(b => bundles[b]) }
  const fontEntries = scripts => scripts.flatMap(s => build.manifest.fonts[s] ?? [])

  /**
   * The files a visit with these hints fetches ahead → [{ url, size, check, phase, whole }]: BusyTeX and the engines'
   * preloads ('engine'), the engines' bundles, the index and the scripts' faces ('files'). `whole`: used as bytes (the
   * rest BusyTeX's worker reads from the cache itself); `check`: the index's own
   */
  function filesFor({ engines, scripts }) {
    const out = engineAssets(packagesFor(engines)).map(([url, size]) => ({ url, size, phase: 'engine', whole: false }))
    const bundles = build.manifest.bundles ?? {}
    for (const b of bundleNames(engines)) out.push({ url: bundles[b].url, size: bundles[b].size, phase: 'files', whole: true })
    out.push({ url: `${build.tree}${build.index}`, size: null, check: indexCheck, phase: 'files', whole: true })
    for (const [, , path, size] of fontEntries(scripts)) if (!out.some(f => f.url === urlOf(path))) out.push({ url: urlOf(path), size, phase: 'files', whole: true })
    return out
  }
  /** every file the build fetches ahead for some visit: what the cache may hold */
  const buildFiles = () => new Set(filesFor({ engines: Object.keys(ENGINE_CLASS), scripts: Object.keys(build.manifest.fonts) }).map(f => f.url))

  const openFiles = () => caches.open(FILES).catch(() => null)
  const pathOf = url => new URL(url, 'https://page.invalid/').pathname
  /** the caches of older pages deleted, and the files the build no longer names */
  const dropOld = async () => {
    for (const name of await caches.keys()) if (name.startsWith(CACHE_PREFIX) && name !== FILES) await caches.delete(name)
    const cache = await openFiles()
    if (!cache?.keys) return
    const named = new Set([...buildFiles()].map(pathOf))
    for (const { url } of await cache.keys()) if (!named.has(pathOf(url))) await cache.delete(url)
  }
  /** a file in hand, kept: with the wasm's own type, whatever the server or the framer said */
  const put = (cache, url, bytes) => cache?.put(url, new Response(bytes, { headers: { 'content-type': typeOf(url) } })).catch(() => {})
  /** a file's bytes, as its build says they are: its length, and the index its name */
  const sound = async (f, bytes) => (f.size == null || bytes.length === f.size) && (!f.check || await f.check(bytes))

  /**
   * The files from the page's cache, the rest downloaded into it, in parallel → Map url → bytes of the `whole` ones. A
   * file that cannot be had is the network's failure: thrown (NetworkFailure) unless `failed` collects it. An entry
   * that cannot be written is no failure: the bytes in hand go on, and the worker's own fetch falls back to the
   * network. `progressOf(file)`: the reporter its bytes count in (a file of no known size, the index, counts in none);
   * `tally.bytes`: the bytes downloaded, added to
   */
  async function obtain(files, progressOf, failed = null, tally = { bytes: 0 }) {
    const out = new Map()
    const cache = await openFiles()
    const missing = []
    await Promise.all(files.map(async f => {
      const hit = cache ? await cache.match(f.url).catch(() => undefined) : undefined
      if (!hit) missing.push(f)
      else if (f.whole) out.set(f.url, new Uint8Array(await hit.arrayBuffer()))
    }))
    for (const f of missing) if (f.size != null) progressOf(f).expect(f.size)
    await Promise.all(missing.map(async f => {
      const progress = f.size == null ? null : progressOf(f)
      try {
        // no Cache Storage: what is not used whole here is left to the worker's own fetch (and the HTTP cache)
        if (!f.whole && cache) {
          await download(f.url, { size: f.size, progress, sink: { cache } })
          tally.bytes += f.size ?? 0
        } else if (f.whole) {
          const bytes = await download(f.url, { size: f.size, progress, check: f.check })
          tally.bytes += bytes.length
          await put(cache, f.url, bytes)
          out.set(f.url, bytes)
        }
      } catch (e) {
        if (!failed) throw e
        failed.push(e instanceof NetworkFailure ? e.what : nameOf(f.url))
      }
    }))
    return out
  }

  /** a question to the framer's store → its answer's files, {} when it does not answer within askMs */
  let asked = 0
  const answers = new Map()
  const ask = (reply, files, bytes) => new Promise(resolve => {
    const id = ++asked
    const timer = setTimeout(() => { answers.delete(id); resolve({}) }, askMs)
    answers.set(id, files => { clearTimeout(timer); answers.delete(id); resolve(files ?? {}) })
    reply({ type: 'want', id, files, bytes })
  })
  /** the files the page's cache lacks, asked of the framer's store: those it hands over, sound, kept as downloads are */
  async function handedOver(files, reply) {
    const cache = await openFiles()
    if (!cache) return
    const missing = []
    for (const f of files) if (!(await cache.match(f.url).catch(() => undefined))) missing.push(f)
    if (!missing.length) return
    const handed = await ask(reply, missing.map(f => f.url), true)
    await Promise.all(missing.map(async f => {
      const buffer = handed[f.url]
      if (!(buffer instanceof ArrayBuffer)) return
      const bytes = new Uint8Array(buffer)
      if (await sound(f, bytes)) await put(cache, f.url, bytes)
    }))
  }

  /** the bundles' and the faces' files for these hints, from the bytes obtained → [{ name, format, content }] */
  function manifestFiles(engines, scripts, bytesOf) {
    const bundles = build.manifest.bundles ?? {}
    const bytes = new Map() // path → bytes
    for (const b of bundleNames(engines)) {
      const all = bytesOf.get(bundles[b].url)
      if (all) for (const [path, offset, size] of bundles[b].files) bytes.set(path, all.subarray(offset, offset + size))
    }
    const fonts = fontEntries(scripts)
    for (const [, , path] of fonts) if (bytesOf.has(urlOf(path))) bytes.set(path, bytesOf.get(urlOf(path)))
    const out = []
    for (const [format, name, path] of [...enginesOf(engines).flatMap(e => build.manifest.engines[e]), ...fonts]) {
      const b = bytes.get(path)
      if (b && !out.some(f => f.name === name && f.format === format)) out.push({ name, format, content: b })
    }
    return out
  }

  /**
   * The files for these hints, fetched in parallel → { engine, index, files }, three promises: BusyTeX's and the
   * preloads in the cache (rejected when one cannot be had), the index's text (likewise; null when `index` is false: an
   * engine switch has it), and the bundles' and faces' files for BusyTeX — a bundle or a face that cannot be fetched is
   * left out: the compile asks for its files if it needs them
   */
  function obtainFor({ engines, scripts }, reply, { index = true } = {}) {
    const indexUrl = `${build.tree}${build.index}`
    const files = filesFor({ engines, scripts })
    const engine = reporter(reply, 'engine'), common = reporter(reply, 'files')
    const progressOf = f => (f.phase === 'engine' ? engine : common)
    const got = {
      engine: obtain(files.filter(f => f.phase === 'engine'), progressOf).finally(() => engine.end()),
      index: index ? obtain(files.filter(f => f.url === indexUrl), progressOf).then(m => new TextDecoder().decode(m.get(indexUrl))) : Promise.resolve(null),
      files: obtain(files.filter(f => f.phase === 'files' && f.url !== indexUrl), progressOf, []).finally(() => common.end()).then(rest => manifestFiles(engines, scripts, rest)),
    }
    got.index.catch(() => {})
    got.files.catch(() => {})
    return got
  }

  /** BusyTeX with these packages, its index and common files handed over — those once its worker is up, which they may
   *  still be downloading meanwhile; one that fails to come up is let go */
  const start = async packages => {
    const runner = new Runner({ busytexBasePath: build.engine.replace(/\/$/, ''), preloadDataPackages: packages.map(p => `${build.engine}tl-${p}.js`) })
    try {
      await runner.initialize(true)
      const { index } = shared
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

  /** BusyTeX brought up for these hints: its engine and preloads, the index and the common files, in parallel; from
   *  the framer's store first when it keeps them */
  async function bringUp({ engines, scripts, store }, reply) {
    const dropped = dropOld().catch(() => {})
    if (store) await handedOver(filesFor({ engines, scripts }), reply)
    const extra = Promise.all((build.extra ?? []).map(async path => ({ path, content: await download(`${build.page}extra/${path}`) })))
    extra.catch(() => {})
    const got = obtainFor({ engines, scripts }, reply)
    try {
      await got.engine
      shared = { index: await got.index, files: got.files, extra }
      state = await start(packagesFor(engines))
    } catch (e) {
      shared = null
      throw e
    }
    await dropped
  }

  const hintsOf = msg => {
    const v2 = msg.protocol >= 2
    return {
      engines: v2 && Array.isArray(msg.engines) && msg.engines.length ? msg.engines : DEFAULT_ENGINES,
      scripts: v2 && Array.isArray(msg.fonts) ? msg.fonts : [],
      store: v2 && msg.store === true,
    }
  }

  async function init(msg, reply) {
    if (state) return { type: 'init-done', protocol: PROTOCOL, ms: 0 }
    const t0 = now()
    hints = hintsOf(msg)
    await bringUp(hints, reply)
    return { type: 'init-done', protocol: PROTOCOL, ms: Math.round(now() - t0) }
  }

  /**
   * The files a first compile with these hints fetches ahead, downloaded and kept, nothing started: by the page in its
   * own cache, or with `store` by the framer alone — the page asks which it holds, and gives it the others as they
   * come. A file that cannot be had fails the warm-up as the network's; what came is kept
   */
  async function warm(msg, reply) {
    const t0 = now()
    const { engines, scripts, store } = hintsOf(msg)
    const files = filesFor({ engines, scripts })
    const progress = reporter(reply, 'warm')
    const failed = []
    let bytes = 0
    if (store) {
      const held = await ask(reply, files.map(f => f.url), false)
      const missing = files.filter(f => !held[f.url])
      for (const f of missing) if (f.size != null) progress.expect(f.size)
      await Promise.all(missing.map(async f => {
        try {
          const b = await download(f.url, { size: f.size, progress: f.size == null ? null : progress, check: f.check })
          bytes += b.length
          reply({ type: 'keep', url: f.url, bytes: b.buffer }, [b.buffer])
        } catch (e) { failed.push(e instanceof NetworkFailure ? e.what : nameOf(f.url)) }
      }))
    } else {
      await dropOld().catch(() => {})
      const tally = { bytes: 0 }
      await obtain(files, () => progress, failed, tally)
      bytes = tally.bytes
    }
    progress.end()
    if (failed.length) return { type: 'warm-done', error: `could not fetch ${failed.join(', ')}`, network: failed }
    return { type: 'warm-done', protocol: PROTOCOL, ms: Math.round(now() - t0), files: files.length, bytes }
  }

  /** the running BusyTeX has the engine's packages, or a new one is brought up with them added — and with the added
   *  engine's common files, from the framer's store first when it keeps them — before the old one goes: a failure
   *  leaves the old one running */
  async function ensureEngine(engine, reply) {
    const need = packagesFor([engine])
    if (need.every(p => state.packages.includes(p))) return
    const packages = order.filter(p => need.includes(p) || state.packages.includes(p))
    const added = { engines: [engine], scripts: [] }
    if (hints?.store) await handedOver(filesFor(added).filter(f => f.url !== `${build.tree}${build.index}`), reply)
    const got = obtainFor(added, reply, { index: false })
    await got.engine
    const before = await shared.files, files = await got.files
    shared.files = Promise.resolve([...before, ...files.filter(f => !before.some(g => g.name === f.name && g.format === f.format))])
    const next = await start(packages)
    state.runner.terminate()
    state = next
  }

  async function compile(msg, reply) {
    // an init that failed is tried again, with its hints, before the compile
    if (!state) await bringUp(hints ?? { engines: DEFAULT_ENGINES, scripts: [], store: false }, reply)
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
    // the bibliography a compile made, BibTeX's or biber's (biblatex): the next draft reads it, its citations set rather
    // than each shown as its key, and BibTeX or biber is not run again
    const bib = steps.filter(l => /^(?:bibtex|biber)/.test(l.cmd ?? '')).at(-1)
    // an empty PDF is no PDF: BusyTeX returns one after a fatal error (a font whose metrics it cannot find)
    const pdf = r.pdf?.byteLength ? r.pdf.slice().buffer : null
    return [{ type: 'compiled', id: msg.id, ok: !!pdf, ms: Math.round(now() - t0), pdf, aux: tex?.aux ?? null, bbl: bib?.aux ?? null, log: String(r.log ?? ''), network: [...new Set(network)] }, pdf ? [pdf] : []]
  }

  const error = e => String(e?.stack ?? e).slice(0, 400)
  /** a page-side failure in protocol 2's terms: what failed for a network reason, in `network` */
  const failed = e => ({ error: error(e), network: e instanceof NetworkFailure ? [e.what] : [] })
  return {
    ready: { type: 'ready', protocol: PROTOCOL, cv: build.cv, eid: build.eid, tid: build.tid, index: build.index },
    receive(msg, reply) {
      if (msg?.type === 'project') { projects.set(msg.key, new Map(msg.files.map(f => [f.path, f.content]))); return Promise.resolve() }
      // the framer's answer, out of turn: the message it answers is waiting for it
      if (msg?.type === 'have') { answers.get(msg.id)?.(msg.files); return Promise.resolve() }
      if (msg?.type === 'warm') return (queue = queue.then(() => warm(msg, reply)).then(d => reply(d), e => reply({ type: 'warm-done', ...failed(e) })))
      if (msg?.type === 'init') return (queue = queue.then(() => init(msg, reply)).then(d => reply(d), e => reply({ type: 'init-done', ...failed(e) })))
      if (msg?.type === 'compile') return (queue = queue.then(() => compile(msg, reply)).then(([d, t]) => reply(d, t), e => reply({ type: 'compiled', id: msg.id, ok: false, ...failed(e) })))
      return Promise.resolve()
    },
  }
}
