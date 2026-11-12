// A stand-in of our server's /api/v2 routes (the reader package's client: packages/reader/src/session/client.ts), which serves
// papers of our own (the reader package's CC0 fixtures, packages/reader/e2e/fixtures/: each one's stand-in of arXiv's PDF and
// the bundle its prepare made) so that the extension's browser checks of its reader run with no server of ours. It answers as
// the routes' contract says a client may rely on, through HTTP alone, and nothing more:
//
//   POST /api/v2/open                 { paper, version?, target, formats, view? } -> 200 { doc, follow } (no-store): what the paper
//                                     lacks started, its document (v 1); 404 not-found (no such paper), 426 update (no format the
//                                     server writes), 400 bad-request (malformed: not JSON, no paper, a target that is none), 413
//                                     too-large (a body past 1 KiB), 415 wrong-type (not JSON), 405 wrong-method (allow: POST)
//   GET  /api/v2/papers/<seg>?f=&t=&p= the document as JSON (no-store), or a stream of whole documents as unnamed frames (`retry:`
//                                     first, each frame's `id:` its rev) where text/event-stream is accepted; never starts work:
//                                     404 not-opened (a paper nobody opened), 404 not-found (a segment that is no paper), 426, 400
//                                     (f, t or p that is none; p a page 1 to 10000), 405
//   GET  /api/v2/paper/<id>           the site's card of a paper and its latest version (public, max-age): the site's alone, an
//                                     extension's or another site's request refused 403 cross-site
//   GET|HEAD /api/v2/o/<path>         an object, whole or by ranges (206), immutable for a year, a strong ETag: `p/<seg>/<16 hex>/<64
//                                     hex>` a prepare's, `arxiv/<seg>.pdf` arXiv's PDF (filled through the gateway on a miss);
//                                     outside the grammar 404 not-found, an object never made (or retired) 404 gone, 405 another
//                                     method
//   /api/v1/*                         404 { why: 'unknown-versions' } (public, max-age=86400): the refusal the released extension
//                                     reads as "update"
// Every refusal is JSON { error, retryAfterS? } with `Vary: Origin`. A cross-site request is refused 403 cross-site unless it is
// the extension's (`Access-Control-Allow-Origin` its origin, preflighted: 204, `access-control-allow-methods: POST`); the site's
// own requests name no origin back.
//
// Every document it answers is format's (packages/format/src/doc.ts: PaperDoc, OpenAnswer), parsed before it goes out, so that
// the stand-in cannot answer what the contract does not state. The stand-in is the shape of the routes contract's target (`fetch(Request) -> Response`, `base`, `extension`, `put`, `known`,
// `unknown`): the website runs its own contract of the routes against it through the engine it vendors, which is what holds it
// to our server; this repository's test of it (v2-api.test.ts) restates only what a client sees. Beside the routes it serves
// our site's static files the reader's typesetter reads (compose/served.ts): the faces' tables and one slice (PDF.js's Liberation
// Sans, which node_modules holds, for every face), and no hyphenation patterns (404: the language hyphenates nothing).
//
// What it answers is the test's to say (`set`): each paper prepared already (its first open answers its layer) or prepared for
// `prepareMs` from its first open; and a fault on our server's every route, the static files included: a server error (5xx), the
// connection reset, or no answer at all. It records every request (method, path and query, the headers, the body's text).
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FORMATS, OpenAnswer, PaperDoc } from '../../../packages/format/src/index.ts'
import { TYPESET_TARGETS } from '../../../packages/reader/src/compose/targets.ts'
import { FACES } from '../../../packages/typeset/src/data/faces.ts'

const FIXTURES = fileURLToPath(new URL('../../../packages/reader/e2e/fixtures/', import.meta.url))
const LATIN_FACE = fileURLToPath(new URL('../../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf', import.meta.url))
const NO_STORE = 'no-store'
const IMMUTABLE = 'public, max-age=31536000, immutable'
/** the stand-in's own epoch and chain (our server's grammar: six of [a-z0-9]; twelve hex digits) */
const EPOCH = 'e2e000'
const CHAIN = '0e2e00000000'
const PAPER_ID = /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})$/
/** the faces' one group and the one slice file every face is served from */
export const FACE_GROUP = 'e2e'
export const FACE_FILE = '0123456789abcdef'
/** a paper's segment (`.` and `/` as `_`) and its version's */
export const segOf = (paper, version) => `${paper.replace(/[./]/g, '_')}${version === undefined ? '' : `v${version}`}`
const sha256Hex = b => createHash('sha256').update(b).digest('hex')
const text = s => new TextEncoder().encode(s)

/** a fixture of the reader package's: its paper, arXiv's PDF, and its bundle's objects by digest (the head's digest apart) */
export function loadFixture(name = 's1-columns') {
  const dir = join(FIXTURES, name)
  const bundle = join(dir, 'bundle')
  const head = JSON.parse(readFileSync(join(bundle, 'head.json'), 'utf8'))
  const objects = new Map()
  let catalog = null
  for (const file of readdirSync(bundle)) {
    const m = /^([0-9a-f]{64})\.(\w+)$/.exec(file)
    if (!m) continue
    objects.set(m[1], new Uint8Array(readFileSync(join(bundle, file))))
    if (m[2] === 'head') catalog = m[1]
  }
  if (!catalog) throw new Error(`no head in ${bundle}`)
  return { name, paper: head.paper.id, version: head.paper.version, pages: head.paper.pages, units: head.units, catalog, pdf: new Uint8Array(readFileSync(join(dir, 'arxiv.pdf'))), objects, rows: (t = 'de') => JSON.parse(readFileSync(join(dir, `${t}.rows.json`), 'utf8')) }
}

/** a Range header on `size` bytes: [first, last], null for none asked, 'unsatisfiable' for one that holds no byte */
function rangeOf(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? '')
  if (!m || (m[1] === '' && m[2] === '')) return null
  const first = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1])
  const last = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  return first > last || first >= size ? 'unsatisfiable' : [first, last]
}

/**
 * The stand-in over `fixtures` (loadFixture's), our server at `base`, the extension at `extension` (its origin, which the routes
 * answer cross-site). `prepareMs`: how long a paper not prepared yet is prepared from its first open (`set({ prepared })` names
 * those prepared already); `now`, the clock.
 */
export function v2Api({ fixtures = [loadFixture()], base = 'https://readarxiv.com', extension = 'chrome-extension://stand-in', prepareMs = 0, now = () => Date.now() } = {}) {
  const papers = new Map(fixtures.map(f => [f.paper, f]))
  /** the objects by address (`v2/` less, as GET /api/v2/o/ reads them): each fixture's prepare, and what `put` puts */
  const objects = new Map()
  const prepOf = f => sha256Hex(f.catalog).slice(0, 16)
  for (const f of fixtures) {
    const pv = segOf(f.paper, f.version)
    for (const [sha, bytes] of f.objects) objects.set(`p/${pv}/${prepOf(f)}/${sha}`, bytes)
  }
  const refOf = (f, sha) => ({ path: `p/${segOf(f.paper, f.version)}/${prepOf(f)}/${sha}`, sha256: sha, bytes: f.objects.get(sha).length })
  /** each paper version's state: opened (when), prepared (from when), its document's rev */
  const state = new Map()
  let options = { prepared: new Set(fixtures.map(f => f.paper)), fault: null, prepareMs, failed: {}, refuse: null }
  const requests = []

  /** the paper version's document as our server writes it (L5's PaperDoc, version 1) */
  function docOf(f, version, s) {
    const pv = segOf(f.paper, version)
    // (nothing started: a refusal's document; else running until its time, then done)
    const state = s.preparedAt === null ? 'none' : now() >= s.preparedAt ? 'done' : 'running'
    const done = state === 'done'
    const failed = options.failed[f.paper] ?? null
    if (failed) return { v: 1, pv, epoch: EPOCH, rev: s.rev, paper: f.paper, version, prepare: { attempt: 1, state: 'failed', why: failed, retryAt: null, at: s.openedAt, build: 'e2e', stage: null, units: [], html: false }, layer: null, targets: {} }
    return {
      v: 1,
      pv,
      epoch: EPOCH,
      rev: s.rev,
      paper: f.paper,
      version,
      prepare: { attempt: state === 'none' ? 0 : 1, state, why: null, retryAt: null, at: s.openedAt, build: state === 'none' ? null : 'e2e', stage: state === 'running' ? 'compiling' : null, units: done ? f.units.map(u => refOf(f, u)) : [], html: null },
      layer: done ? { catalog: refOf(f, f.catalog), units: f.units.map(u => refOf(f, u)), format: 1, build: 'e2e', stale: false } : null,
      targets: Object.fromEntries(Object.entries(s.targets).map(([t, view]) => [t, { attempt: 0, state: 'none', why: null, retryAt: null, at: s.openedAt, translator: CHAIN, units: null, rows: [], done: 0, total: 0, view }])),
    }
  }
  const stateOf = (f, version) => state.get(segOf(f.paper, version))
  function open(f, version, target, view) {
    const pv = segOf(f.paper, version)
    let s = state.get(pv)
    if (!s) {
      const at = now()
      s = { openedAt: at, preparedAt: options.prepared.has(f.paper) ? at : at + options.prepareMs, rev: 1, targets: {} }
      state.set(pv, s)
    } else s.rev++
    if (target) s.targets[target] = view ?? 1
    return docOf(f, version, s)
  }

  // ---- the answers
  const corsOf = origin => (origin === extension ? { 'access-control-allow-origin': extension, 'access-control-expose-headers': 'content-range, etag, content-length, retry-after' } : {})
  const answer = (status, headers, body = new Uint8Array()) => ({ status, headers, body })
  const json = (status, value, origin, extra = {}) => answer(status, { 'content-type': 'application/json', 'cache-control': NO_STORE, vary: 'Origin', ...corsOf(origin), ...extra }, text(JSON.stringify(value)))
  const refused = (status, error, origin, extra = {}) => json(status, { error }, origin, extra)
  /** a request from another site that is not the extension's */
  const crossSite = (h, origin) => h['sec-fetch-site'] === 'cross-site' && origin !== extension
  function objectAnswer(method, h, bytes, origin) {
    const tag = `"${sha256Hex(bytes).slice(0, 32)}"`
    const headers = { 'content-type': 'application/octet-stream', etag: tag, 'accept-ranges': 'bytes', 'cache-control': IMMUTABLE, ...corsOf(origin) }
    if (method === 'HEAD') return answer(200, { ...headers, 'content-length': String(bytes.length) })
    const r = rangeOf(h.range, bytes.length)
    if (r === 'unsatisfiable') return answer(416, { ...headers, 'content-range': `bytes */${bytes.length}` })
    if (!r) return answer(200, headers, bytes)
    return answer(206, { ...headers, 'content-range': `bytes ${r[0]}-${r[1]}/${bytes.length}` }, bytes.subarray(r[0], r[1] + 1))
  }
  const FACE_BYTES = new Uint8Array(readFileSync(LATIN_FACE))
  function staticAnswer(path) {
    if (/^\/hyph\/[a-zA-Z-]+\.json$/.test(path)) return answer(404, { 'content-type': 'application/json' }, text('{"error":"not-found"}'))
    if (path === '/static-fonts/index.json') return answer(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' }, text(JSON.stringify({ schema: 1, fonts: 'e2e', faces: Object.fromEntries(Object.keys(FACES).map(id => [id, { group: FACE_GROUP }])) })))
    if (path === `/static-fonts/${FACE_GROUP}.json`) return answer(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' }, text(JSON.stringify({ schema: 1, group: FACE_GROUP, slices: [[32, 126, 160, 255, 0x2010, 0x2027]], faces: Object.fromEntries(Object.keys(FACES).map(id => [id, [{ path: `static-fonts/${FACE_FILE}.woff2` }]])) })))
    if (path === `/static-fonts/${FACE_FILE}.woff2`) return answer(200, { 'content-type': 'font/woff2', 'cache-control': IMMUTABLE }, FACE_BYTES)
    return null
  }

  /** the answer to { method, path, search, headers (lower-case names), body }: { status, headers, body }, { fault } for a reset
   *  or no answer, or null where the stand-in names no answer for the path */
  function handle({ method, path, search = '', headers: h = {}, body = null }) {
    const origin = h.origin ?? null
    const isStatic = /^\/(?:static-fonts|hyph)\//.test(path)
    if (!isStatic && !path.startsWith('/api/')) return null
    requests.push({ method, path: path + search, headers: h, body: body ? new TextDecoder().decode(body).slice(0, 400) : null, at: now() })
    const fault = options.fault
    if (fault === 'reset' || fault === 'hang') return { fault }
    if (typeof fault === 'number') return json(fault, { error: 'unavailable' }, origin)
    if (isStatic) return staticAnswer(path)
    if (path.startsWith('/api/v1/')) return answer(404, { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400', ...corsOf(origin) }, method === 'HEAD' ? new Uint8Array() : text('{"why":"unknown-versions"}'))
    const q = new URLSearchParams(search)
    // the open
    if (path === '/api/v2/open') {
      if (method === 'OPTIONS') return origin === extension ? answer(204, { ...corsOf(origin), 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', vary: 'Origin' }) : refused(403, 'cross-site', origin)
      if (crossSite(h, origin)) return refused(403, 'cross-site', origin)
      if (method !== 'POST') return refused(405, 'wrong-method', origin, { allow: 'POST' })
      if (!/^application\/json\b/.test(h['content-type'] ?? '')) return refused(415, 'wrong-type', origin)
      if ((body?.length ?? 0) > 1024) return refused(413, 'too-large', origin)
      let ask
      try {
        ask = JSON.parse(new TextDecoder().decode(body ?? new Uint8Array()))
      } catch {
        return refused(400, 'bad-request', origin)
      }
      if (!ask || typeof ask.paper !== 'string' || !PAPER_ID.test(ask.paper) || !(ask.target === null || TYPESET_TARGETS.includes(ask.target)) || !Array.isArray(ask.formats)) return refused(400, 'bad-request', origin)
      if (!ask.formats.some(x => FORMATS.includes(x))) return refused(426, 'update', origin)
      const f = papers.get(ask.paper)
      if (!f) return refused(404, 'not-found', origin)
      const version = Number.isInteger(ask.version) && ask.version >= 1 && ask.version <= f.version ? ask.version : f.version
      // (our server refusing new work: the visitor's new papers spent, or its capacity; the open's answer says so, with its wait)
      if (options.refuse) {
        const ms = options.refuse.retryAfterS * 1000
        const none = { openedAt: now(), preparedAt: null, rev: 0, targets: {} }
        return json(200, OpenAnswer.parse({ doc: docOf(f, version, none), follow: null, refused: { why: options.refuse.why, retryAt: now() + ms, retryAfterMs: ms, retryAfterS: options.refuse.retryAfterS } }), origin)
      }
      const doc = open(f, version, ask.target, ask.view)
      return json(200, OpenAnswer.parse({ doc, follow: `/api/v2/papers/${doc.pv}?f=1` }), origin)
    }
    // the follow
    const follow = /^\/api\/v2\/papers\/([^/]+)$/.exec(path)
    if (follow) {
      if (crossSite(h, origin)) return refused(403, 'cross-site', origin)
      if (method !== 'GET') return refused(405, 'wrong-method', origin, { allow: 'GET' })
      const fs = q.get('f') ?? ''
      if (!/^\d+(,\d+)*$/.test(fs)) return refused(400, 'bad-request', origin)
      if (!fs.split(',').map(Number).some(x => FORMATS.includes(x))) return refused(426, 'update', origin)
      const t = q.get('t')
      if (t !== null && !TYPESET_TARGETS.includes(t)) return refused(400, 'bad-request', origin)
      const p = q.get('p')
      if (p !== null && !(/^\d+$/.test(p) && Number(p) >= 1 && Number(p) <= 10000)) return refused(400, 'bad-request', origin)
      const m = /^(.+?)(?:v(\d+))?$/.exec(follow[1])
      const f = [...papers.values()].find(x => segOf(x.paper) === m[1])
      if (!f || (m[2] !== undefined && Number(m[2]) > f.version)) return refused(404, 'not-found', origin)
      const version = m[2] === undefined ? f.version : Number(m[2])
      const s = stateOf(f, version)
      if (!s) return refused(404, 'not-opened', origin)
      if (t !== null && p !== null && t in s.targets) s.targets[t] = Number(p)
      const shown = { ...s, targets: t !== null && t in s.targets ? { [t]: s.targets[t] } : {} }
      const doc = PaperDoc.parse(docOf(f, version, shown))
      if ((h.accept ?? '').includes('text/event-stream')) {
        // (one frame, the document as it is: the stream ends after it, as our server's does once nothing runs; while the paper
        // is prepared, its reconnection time is a second)
        const done = doc.prepare.state !== 'running'
        return answer(200, { 'content-type': 'text/event-stream', 'cache-control': NO_STORE, ...corsOf(origin) }, text(`retry: ${done ? 60000 : 1000}\nid: ${doc.rev}\ndata: ${JSON.stringify(doc)}\n\n`))
      }
      return json(200, doc, origin)
    }
    // the site's card of a paper
    const card = /^\/api\/v2\/paper\/([^/]+)$/.exec(path)
    if (card) {
      if (h['sec-fetch-site'] === 'cross-site') return refused(403, 'cross-site', null)
      if (method !== 'GET') return refused(405, 'wrong-method', null, { allow: 'GET' })
      const id = decodeURIComponent(card[1]).replace(/v\d+$/, '')
      if (!PAPER_ID.test(id)) return refused(400, 'bad-request', null)
      const f = papers.get(id)
      if (!f) return refused(404, 'not-found', null)
      return json(200, { id: f.paper, version: f.version, title: f.name, authors: [], authorCount: 0, published: '2026-01-01', updated: '2026-01-01', category: null, withdrawn: false }, null, { 'cache-control': 'public, max-age=3600' })
    }
    // the objects
    if (path.startsWith('/api/v2/o/')) {
      if (method !== 'GET' && method !== 'HEAD') return refused(405, 'wrong-method', origin, { allow: 'GET, HEAD' })
      const rest = path.slice('/api/v2/o/'.length)
      const prepared = /^p\/([A-Za-z0-9_-]+v\d+)\/[0-9a-f]{16}\/[0-9a-f]{64}$/.exec(rest)
      const arxiv = /^arxiv\/([A-Za-z0-9_-]+)v(\d+)\.pdf$/.exec(rest)
      if (!prepared && !arxiv) return refused(404, 'not-found', origin)
      if (arxiv) {
        const f = [...papers.values()].find(x => segOf(x.paper) === arxiv[1] && Number(arxiv[2]) <= x.version)
        return f ? objectAnswer(method, h, f.pdf, origin) : refused(404, 'not-found', origin)
      }
      const bytes = objects.get(rest)
      return bytes ? objectAnswer(method, h, bytes, origin) : refused(404, 'gone', origin)
    }
    return refused(404, 'not-found', origin)
  }

  /** the routes contract's target: `fetch(Request) -> Response` over `handle` (a fault is a TypeError, as a fetch's network
   *  failure is) */
  async function fetch(req) {
    const url = new URL(req.url)
    const body = req.method === 'GET' || req.method === 'HEAD' ? null : new Uint8Array(await req.arrayBuffer())
    const done = handle({ method: req.method, path: url.pathname, search: url.search, headers: Object.fromEntries(req.headers), body: body?.length ? body : body && null })
    if (!done) return new Response(null, { status: 404 })
    if (done.fault) throw new TypeError(`the stand-in's fault: ${done.fault}`)
    return new Response(done.status === 204 || req.method === 'HEAD' ? null : done.body, { status: done.status, headers: done.headers })
  }
  /** the requests left unanswered (`hang`), aborted at the end of a run */
  const pending = new Set()
  /** a Playwright route's handler for our server's origin: false where the stand-in names no answer (the route table's
   *  violation) */
  async function route(r, url) {
    const request = r.request()
    const headers = await Promise.race([request.allHeaders(), new Promise(resolve => setTimeout(resolve, 1000))]).catch(() => null) ?? request.headers()
    const done = handle({ method: request.method(), path: url.pathname, search: url.search, headers, body: request.postDataBuffer() })
    if (!done) return false
    if (done.fault === 'reset') return r.abort('connectionreset')
    if (done.fault === 'hang') { pending.add(r); return undefined }
    return r.fulfill({ status: done.status, headers: done.headers, body: Buffer.from(done.body) })
  }
  async function release() {
    for (const r of pending) await r.abort('timedout').catch(() => {})
    pending.clear()
  }
  return {
    base,
    extension,
    fixtures,
    requests,
    handle,
    fetch,
    route,
    release,
    /** an object put where GET /api/v2/o/ reads it (the contract's `put`: `v2/` + path) */
    async put(path, bytes) { objects.set(path.replace(/^v2\//, ''), bytes) },
    /** the contract's papers: one the gateway knows, at its latest version, and another; one it does not */
    known: { paper: fixtures[0].paper, latest: fixtures[0].version, also: fixtures[1]?.paper ?? fixtures[0].paper },
    unknown: '2699.99999',
    /** what it answers from now: `prepared` the papers prepared already (the rest are prepared for `prepareMs` from their first
     *  open), `failed` a paper's prepare that cannot be made and why (`{ [paper]: 'no-source' }`), `refuse` new work refused
     *  (`{ why: 'quota' | 'busy', retryAfterS }`) or null, `fault` 500 to 599, 'reset', 'hang', or null; each paper's state
     *  forgotten where `fresh` */
    set(o) {
      options = { ...options, ...o, ...(o.prepared ? { prepared: new Set(o.prepared) } : {}) }
      if (o.fresh) state.clear()
    },
    /** the asks of a kind: `open`, `follow`, `object`, `static` */
    asked: kind => requests.filter(r => (kind === 'open' ? r.path === '/api/v2/open' : kind === 'follow' ? r.path.startsWith('/api/v2/papers/') : kind === 'object' ? r.path.startsWith('/api/v2/o/') : /^\/(?:static-fonts|hyph)\//.test(r.path))),
  }
}
