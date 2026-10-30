// A stand-in of the layer API, which serves the repository's own sample paper (tests/fixtures/pdf/sample-1/) so that the
// reader's browser checks run with no server of ours. The API is the web's (readarxiv.com, `/api/v1/`); this imitates
// its contract and nothing else:
//
//   GET  /api/v1/layer/<id>v<n>/<vtag>          200 the bundle JSON (Cache-Control: public, max-age=31536000, immutable)
//                                               | 202 { position, stage, progress, retryAfterMs } (no-store)
//                                               | 404 { why }, why one of not-prepared (no-store), no-source, no-pdf,
//                                                 cannot-prepare, unknown-versions (max-age=300)
//                                               | 429 { retryAfterMs } (no-store)
//   POST /api/v1/layer/<id>v<n>/<vtag>/prepare  only `Content-Type: application/json` (parameters such as charset are
//                                               accepted, another type answers 415) with the body {} (JSON that is not {}
//                                               answers 400); 202 preparing (begun or joined) | 200 { ready: true }
//                                               | 404 { why } | 429 { retryAfterMs }
//   GET  /api/v1/original/<id>v<n>              200 application/pdf, range requests answered | 404 { why: 'no-pdf' }
//   GET  /api/v1/layer/<id>v<n>/<ctag>          BUNDLE 4 (where the stand-in is given the sample's objects, `layer4`): 200 the
//                                               catalog | 202 { position, stage, progress, retryAfterMs, layer: { units, head,
//                                               parts } }, the objects made so far (every part's `prev`), parts given as the
//                                               preparation's progress passes their share | 404, 429, faults as above
//   GET  /api/v1/layer/<id>v<n>/<ctag>/o/<sha256>  200 an object of the layer, by its whole digest (immutable) | 404
//                                               { why: 'not-prepared' } for a digest it does not hold
//   GET  /api/v1/layer/<id>v<n>/<ctag>/o/<sha256>.delta  200 the delta (layer-cut.mjs cutSample's `delta`) by its digest,
//                                               application/octet-stream, as the web serves it (its deltaPath) | 404 { why:
//                                               'not-prepared' } for any other digest; the delta's digest without the suffix is 404 too
//   GET  /api/v1/base/<id>v<n>/<sha256>         our base page a head of ours names (BUNDLE 8, `layer4`: layer-cut.mjs cutSample's
//                                               `base`), by its digest, no suffix: 200 application/pdf, 206 a range, 416 a range
//                                               it does not hold, a strong ETag, immutable | 404 { why: 'no-base' } for another
//
// The sample's layer is one over our own compile (a head of ours), which the Worker binds by the base's digest and names no
// original beside (no `X-Axt-Base-Etag`, design §3.2: only a layer over arXiv's PDF names one); `bound: true` names our copy's
// entity-tag beside the catalog and every object all the same, as a layer over arXiv's PDF had it. The original answers with that
// entity-tag (`ETag`, the MD5 of its bytes, as R2 tags an object written in one put), and our base page with its own.
//
// Every answer carries `Access-Control-Allow-Origin: *` (never credentials) and `X-Content-Type-Options: nosniff`; JSON
// answers carry `Content-Security-Policy: sandbox`; a miss is JSON, never an HTML page. The <vtag> is the engine's own
// (layer-proto/bundle.mjs VTAG, its order the engine's): a GET of another answers 404 unknown-versions. Where the
// contract names a field and not its values (`stage`), the values here are this stand-in's own.
//
// What the stand-in answers is the test's to say (`set`): the bundle ready, a preparation under way for a set time and then
// ready, a refusal (429), none (404, each why), a server error (5xx), or nothing at all (the connection reset, or no answer).
// Faults on the layer routes and on the original are set apart, since a paper's PDF and its layer fail on their own.
//
// The stand-in is a function of the request (`handle`): Playwright's router (`route`) and a local HTTP server (`listen`)
// both call it, so that a browser check and a test of the wire meet the same answers. `now` is the clock a preparation is
// timed by, which a test of its own may move.
//
// What it records is the request whole, since a later check that "nothing else was sent" reads the record and not the
// answer: its method, path and query string (a query is no reason to refuse a request: the answer does not depend on it, and
// the record shows it), every header the request carried (a cookie too, where the router gives it), and its body (its length
// and its text to BODY_TEXT_MAX characters), beside what it answered.
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { VTAG } from '../../../src/pdf-reader/engine/layer-proto/bundle.mjs'
import { CTAG5 } from '../../../src/pdf-reader/engine/layer-proto/format.mjs'

const SAMPLE_DIR = new URL('../../fixtures/pdf/sample-1/', import.meta.url)

/** the sample paper's stand-in PDF and bundle, and the paper's identity as the bundle names it */
export function loadSample(dir = SAMPLE_DIR) {
  const pdf = new Uint8Array(readFileSync(new URL('sample-1.pdf', dir)))
  const bundle = new Uint8Array(readFileSync(new URL('bundle.json', dir)))
  const { paper } = JSON.parse(new TextDecoder().decode(bundle))
  return { id: paper.id, version: paper.version, segment: `${paper.id.replace('/', '_')}v${paper.version}`, pdf, bundle }
}

/** why a paper may be answered 404 with: the contract's five */
export const WHY = Object.freeze(['not-prepared', 'no-source', 'no-pdf', 'cannot-prepare', 'unknown-versions'])

/** what the stand-in may be told to answer (`set`): a value of these, as the constructors make them */
export const mode = Object.freeze({
  /** the bundle is prepared */
  ready: () => ({ kind: 'ready' }),
  /** a preparation under way for `ms`, then ready. `begun` false: nothing is prepared until a prepare asks (GET 404
   *  not-prepared), and the preparation then runs for `ms`; true (the default): another reader's is under way already */
  preparing: (ms, { begun = true } = {}) => ({ kind: 'preparing', ms, begun }),
  /** 429 { retryAfterMs } */
  refused: (retryAfterMs = 5000) => ({ kind: 'refused', retryAfterMs }),
  /** 404 { why }, `why` one of WHY */
  none: why => ({ kind: 'none', why }),
  /** a server error */
  error: (status = 500) => ({ kind: 'error', status }),
  /** the connection reset */
  reset: () => ({ kind: 'reset' }),
  /** no answer at all */
  hang: () => ({ kind: 'hang' }),
})

const KINDS = ['ready', 'preparing', 'refused', 'none', 'error', 'reset', 'hang']
function checked(m) {
  if (typeof m === 'string') m = { kind: m }
  if (m === null || typeof m !== 'object' || !KINDS.includes(m.kind)) throw new TypeError(`layer API: not a mode: ${JSON.stringify(m)}`)
  if (m.kind === 'preparing' && !(Number.isFinite(m.ms) && m.ms >= 0)) throw new TypeError('layer API: preparing needs a time in ms, 0 or more')
  if (m.kind === 'none' && !WHY.includes(m.why)) throw new TypeError(`layer API: none needs a why of ${WHY.join(', ')}`)
  if (m.kind === 'error' && !(Number.isInteger(m.status) && m.status >= 500 && m.status <= 599)) throw new TypeError('layer API: error needs a status 500 to 599')
  return { ...(m.kind === 'preparing' ? { begun: true } : {}), ...m }
}

/** the three routes the stand-in serves: a layer's GET and prepare, and the original (the capture groups: the paper's
 *  segment, the version tag, and `/prepare` where the request is one) */
const LAYER_ROUTE = /^\/api\/v1\/layer\/([^/]+)\/([^/]+?)(\/prepare)?$/
const ORIGINAL_ROUTE = /^\/api\/v1\/original\/([^/]+)$/
/** our base page by its digest (the capture groups: the segment, the digest; no suffix: the Worker's route) */
const BASE_ROUTE = /^\/api\/v1\/base\/([^/]+)\/([0-9a-f]{64})$/
/** an object of BUNDLE 4's layer by its digest (the capture groups: the segment, the ctag, the digest) */
const OBJECT_ROUTE = /^\/api\/v1\/layer\/([^/]+)\/([^/]+)\/o\/([0-9a-f]{64})(\.delta)?$/
/** the served faces' table and its files (`/static-fonts/index.json`, `/static-fonts/<group>.json`, a slice's
 *  file `/static-fonts/<16 hex>.woff2`), and the hyphenation patterns (`/hyph/<lang>.json`) */
const FACES_ROUTE = /^\/static-fonts\/(index|[a-z0-9-]+)\.json$/
const FACE_FILE_ROUTE = /^\/static-fonts\/([0-9a-f]{16})\.woff2$/
const HYPH_ROUTE = /^\/hyph\/[a-z-]+\.json$/
/** the one group the stand-in serves every face in, and its one slice's file */
export const FACE_GROUP = 'e2e', FACE_FILE = '0123456789abcdef'
/** whether a path is one of the stand-in's routes: what a route table gives it, and answers no other path with it */
export const serves = path => LAYER_ROUTE.test(path) || ORIGINAL_ROUTE.test(path) || BASE_ROUTE.test(path) || OBJECT_ROUTE.test(path) || FACES_ROUTE.test(path) || FACE_FILE_ROUTE.test(path) || HYPH_ROUTE.test(path)
/** a request's body kept in the record: its text at most this long (the length is kept whole) */
const BODY_TEXT_MAX = 200
const NO_STORE = 'no-store'
const SHORT = 'public, max-age=300'
const IMMUTABLE = 'public, max-age=31536000, immutable'
const COMMON = { 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff' }
const bytes = text => new TextEncoder().encode(text)
const json = (status, value, cache, extra = {}) => ({ status, headers: { ...COMMON, 'content-type': 'application/json', 'content-security-policy': 'sandbox', 'cache-control': cache, ...extra }, body: bytes(JSON.stringify(value)) })
const missing = why => json(404, { why }, why === 'not-prepared' ? NO_STORE : SHORT)
/** the stages a preparation passes through, in thirds of its time: this stand-in's own names */
const STAGES = ['marks', 'layout', 'add-on']

/** a Range header on `size` bytes: [first, last], null for none asked, 'unsatisfiable' for one that holds no byte */
function rangeOf(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? '')
  if (!m || (m[1] === '' && m[2] === '')) return null
  // (bytes=-n is the last n bytes; bytes=a- runs to the end)
  const first = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1])
  const last = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  return first > last || first >= size ? 'unsatisfiable' : [first, last]
}

/**
 * The stand-in over a sample (`loadSample`). `vtag` is the one version tag it holds the bundle under, `pollMs` the longest
 * a preparing answer asks to wait before the next GET, `now` the clock. `layer4`: the sample's BUNDLE 4 objects
 * (layer-cut.mjs cutSample: `objects` by digest, `refs` as a job tells them, `catalog` its bytes), held under CTAG5
 */
export function layerApi({ sample = loadSample(), vtag = VTAG, pollMs = 500, now = Date.now, layer4 = null, faces = null, bound = false } = {}) {
  let layer = checked('ready'), original = checked('ready'), base = checked('ready')
  /** the original's entity-tag, and the header that names it beside BUNDLE 4's answers */
  const etag = `"${createHash('md5').update(sample.pdf).digest('hex')}"`
  const baseTag = bound ? { 'x-axt-base-etag': etag } : {}
  /** when the preparation began, ms on `now`'s clock; null until it has */
  let since = null
  const requests = []
  /** the routes of requests left unanswered, to be let go by `release` */
  const pending = new Set()
  const beginAt = () => { if (layer.kind === 'preparing' && layer.begun) since = now() }
  const state = {
    /** the mode of the layer routes, of the original route and of our base page's (each alone, the others as they were) */
    set({ layer: next, original: nextOriginal, base: nextBase } = {}) {
      if (next !== undefined) { layer = checked(next); since = null; beginAt() }
      if (nextOriginal !== undefined) original = checked(nextOriginal)
      if (nextBase !== undefined) base = checked(nextBase)
      return state
    },
    get mode() { return { layer, original, base } },
    /** every request answered, in order, each kept whole (the header comment): its method, path, query string, headers and
     *  body beside its answer (the status, or the fault) */
    requests,
    /** the original's entity-tag */
    etag,
  }

  /** the preparation's state at this moment: 'cold' (none begun), 'under way' with its progress, or 'done' */
  function preparation() {
    if (layer.kind !== 'preparing') return { state: 'done' }
    if (since === null) return { state: 'cold' }
    const elapsed = now() - since
    return elapsed >= layer.ms ? { state: 'done' } : { state: 'under way', elapsed, left: layer.ms - elapsed }
  }
  const preparing = ({ elapsed, left }, four = false) => {
    const progress = layer.ms === 0 ? 1 : Math.floor((elapsed / layer.ms) * 100) / 100
    // BUNDLE 4's objects made so far: the chunks and the head at once, each part once the progress passes its share
    const made = four ? { layer: { units: layer4.refs.units, head: layer4.refs.head, parts: layer4.refs.parts.slice(0, Math.floor(progress * (layer4.refs.parts.length + 1))) } } : {}
    // (the web's shape: a place in the queue is 1 or more, null where it is not known; layer-api.ts PreparingSchema)
    return json(202, { position: null, stage: STAGES[Math.min(STAGES.length - 1, Math.floor(progress * STAGES.length))], progress, retryAfterMs: Math.max(1, Math.min(pollMs, Math.ceil(left))), ...made }, NO_STORE)
  }

  function layerAnswer({ headers, body }, segment, tag, prepare) {
    const four = !!layer4 && tag === CTAG5
    if (tag !== vtag && !four) return missing('unknown-versions')
    if (prepare) {
      // (the media type alone: `application/json; charset=utf-8` is JSON; any other type is 415, and JSON that is not {} is 400)
      if ((headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') return json(415, { why: 'unsupported-media-type' }, NO_STORE)
      let empty = false
      try { const value = JSON.parse(new TextDecoder().decode(body ?? new Uint8Array())); empty = value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0 } catch { /* not JSON */ }
      if (!empty) return json(400, { why: 'bad-request' }, NO_STORE)
    }
    if (segment !== sample.segment) return missing('no-source')
    if (layer.kind === 'refused') return json(429, { retryAfterMs: layer.retryAfterMs }, NO_STORE)
    if (layer.kind === 'none') return missing(layer.why)
    let prep = preparation()
    if (prep.state === 'cold') {
      // nothing is prepared: a GET says so, and a prepare begins it
      if (!prepare) return missing('not-prepared')
      since = now()
      prep = preparation()
    }
    if (prep.state === 'under way') return preparing(prep, four)
    if (prepare) return json(200, { ready: true }, NO_STORE)
    return { status: 200, headers: { ...COMMON, 'content-type': 'application/json', 'content-security-policy': 'sandbox', 'cache-control': IMMUTABLE, ...(four ? baseTag : {}) }, body: four ? layer4.catalog : sample.bundle }
  }
  function objectAnswer(segment, tag, sha, delta) {
    const mine = segment === sample.segment && tag === CTAG5
    // (a delta, BUNDLE 8's base of ours as an update over the original: a bundle object by its digest and the suffix the web's
    // route names it by, PDF bytes, not JSON; under the bare digest, or the suffix on any other digest, nothing, as the web answers)
    if (delta) {
      if (mine && layer4?.delta && sha === layer4.delta.sha256) return { status: 200, headers: { ...COMMON, 'content-type': 'application/octet-stream', 'cache-control': IMMUTABLE, ...baseTag }, body: layer4.delta.data }
      return missing('not-prepared')
    }
    const bytes = mine ? layer4?.objects.get(sha) : null
    if (!bytes) return missing('not-prepared')
    return { status: 200, headers: { ...COMMON, 'content-type': 'application/json', 'content-security-policy': 'sandbox', 'cache-control': IMMUTABLE, ...baseTag }, body: bytes }
  }
  /** a PDF's bytes answered whole or by a range, tagged `etag` */
  function pdfAnswer(headers, pdf, extra = {}) {
    const size = pdf.length
    const range = rangeOf(headers.range, size)
    const h = { ...COMMON, 'content-type': 'application/pdf', 'accept-ranges': 'bytes', etag, 'access-control-expose-headers': 'Content-Length, Content-Range, Accept-Ranges, ETag', ...extra }
    if (range === 'unsatisfiable') return { status: 416, headers: { ...h, 'content-range': `bytes */${size}` }, body: new Uint8Array() }
    if (range === null) return { status: 200, headers: h, body: pdf }
    return { status: 206, headers: { ...h, 'content-range': `bytes ${range[0]}-${range[1]}/${size}` }, body: pdf.subarray(range[0], range[1] + 1) }
  }
  function originalAnswer({ headers }, segment) {
    if (segment !== sample.segment || original.kind === 'none') return missing('no-pdf')
    return pdfAnswer(headers, sample.pdf)
  }
  /** our base page a head of ours names: the cut's base, its bytes (the wrapped pass); another digest, or no cut, none */
  function baseAnswer({ headers }, segment, sha) {
    if (!layer4?.base || segment !== sample.segment || sha !== layer4.base.sha256 || base.kind === 'none') return missing('no-base')
    return pdfAnswer(headers, layer4.base.data, { 'cache-control': IMMUTABLE, etag: `"${createHash('md5').update(layer4.base.data).digest('hex')}"` })
  }

  /**
   * The answer to a request { method, path (the URL's pathname), search (its query string, with the `?`, or ''), headers
   * (lower-case names), body }: { status, headers, body }, or { fault: 'reset' | 'hang' } where the connection is to be reset
   * or left unanswered.
   */
  /** the faces' table: every face of `faces.ids` in one group of one slice (`faces.ranges`), its file `faces.bytes`; the
   *  hyphenation none (the layer draws without it). With no `faces`, none of it is served */
  function facesAnswer(path) {
    const table = FACES_ROUTE.exec(path), file = FACE_FILE_ROUTE.exec(path)
    if (HYPH_ROUTE.test(path)) return json(404, { why: 'none' }, SHORT)
    if (!faces) return missing('not-found')
    if (table?.[1] === 'index') return json(200, { schema: 1, fonts: 'e2e', groups: [FACE_GROUP], faces: Object.fromEntries(faces.ids.map(id => [id, { group: FACE_GROUP, sha256: '' }])), sources: {} }, IMMUTABLE)
    if (table?.[1] === FACE_GROUP) return json(200, { schema: 1, group: FACE_GROUP, plan: 'latin', slices: [faces.ranges], faces: Object.fromEntries(faces.ids.map(id => [id, [{ path: `static-fonts/${FACE_FILE}.woff2`, sha256: '', bytes: faces.bytes.length }]])), shared: null }, IMMUTABLE)
    if (file?.[1] === FACE_FILE) return { status: 200, headers: { ...COMMON, 'content-type': 'font/woff2', 'cache-control': IMMUTABLE }, body: faces.bytes }
    return missing('not-found')
  }
  function answer(request) {
    const { method, path } = request
    if (FACES_ROUTE.test(path) || FACE_FILE_ROUTE.test(path) || HYPH_ROUTE.test(path)) return method === 'GET' ? facesAnswer(path) : json(405, { why: 'method-not-allowed' }, NO_STORE, { allow: 'GET' })
    const objectRoute = OBJECT_ROUTE.exec(path)
    const layerRoute = objectRoute ? null : LAYER_ROUTE.exec(path)
    const originalRoute = ORIGINAL_ROUTE.exec(path), baseRoute = BASE_ROUTE.exec(path)
    const target = layerRoute || objectRoute ? layer : originalRoute ? original : baseRoute ? base : null
    // (a route's faults come before anything of the request is read: a server that is down is down for every request)
    if (target?.kind === 'reset' || target?.kind === 'hang') return { fault: target.kind }
    if (target?.kind === 'error') return json(target.status, { why: 'unavailable' }, NO_STORE)
    if (objectRoute) {
      if (method !== 'GET') return json(405, { why: 'method-not-allowed' }, NO_STORE, { allow: 'GET' })
      return objectAnswer(objectRoute[1], objectRoute[2], objectRoute[3], objectRoute[4] === '.delta')
    }
    if (layerRoute) {
      const prepare = layerRoute[3] === '/prepare'
      const allowed = prepare ? 'POST' : 'GET'
      if (method !== allowed) return json(405, { why: 'method-not-allowed' }, NO_STORE, { allow: allowed })
      return layerAnswer(request, layerRoute[1], layerRoute[2], prepare)
    }
    if (originalRoute) {
      if (method !== 'GET') return json(405, { why: 'method-not-allowed' }, NO_STORE, { allow: 'GET' })
      return originalAnswer(request, originalRoute[1])
    }
    if (baseRoute) {
      if (method !== 'GET') return json(405, { why: 'method-not-allowed' }, NO_STORE, { allow: 'GET' })
      return baseAnswer(request, baseRoute[1], baseRoute[2])
    }
    return missing('not-found')
  }
  function handle(request) {
    const whole = { ...request, search: request.search ?? '', headers: request.headers ?? {}, body: request.body ?? null }
    const done = answer(whole)
    const text = whole.body ? new TextDecoder().decode(whole.body.subarray(0, BODY_TEXT_MAX * 4)).slice(0, BODY_TEXT_MAX) : null
    requests.push({
      method: whole.method, path: whole.path, search: whole.search, headers: { ...whole.headers },
      body: whole.body ? { bytes: whole.body.length, text } : null,
      answered: done.fault ?? done.status,
    })
    return done
  }

  /** a Playwright route handler: the request answered, or its connection reset, or left unanswered until `release` */
  async function route(r) {
    const request = r.request()
    const url = new URL(request.url())
    // (the whole header set, a cookie included, where the browser gives it within a moment; else the ones a page sees)
    const headers = await Promise.race([request.allHeaders(), new Promise(resolve => setTimeout(resolve, 1000))]).catch(() => null) ?? request.headers()
    const done = handle({ method: request.method(), path: url.pathname, search: url.search, headers, body: request.postDataBuffer() })
    if (done.fault === 'reset') return r.abort('connectionreset')
    if (done.fault === 'hang') { pending.add(r); return undefined }
    return r.fulfill({ status: done.status, headers: done.headers, body: Buffer.from(done.body) })
  }
  /** the requests left unanswered, aborted as a network that never answered would end them */
  async function release() {
    for (const r of pending) await r.abort('timedout').catch(() => {})
    pending.clear()
  }

  /** a local HTTP server over `handle`, for a test of the wire: { origin, close() }. A reset destroys the socket, no answer
   *  leaves it open until `close` */
  function listen({ port = 0, host = '127.0.0.1' } = {}) {
    const sockets = new Set()
    const server = createServer((req, res) => {
      const chunks = []
      req.on('data', c => chunks.push(c))
      req.on('end', () => {
        const url = new URL(req.url, 'http://localhost')
        const body = Buffer.concat(chunks)
        const done = handle({ method: req.method, path: url.pathname, search: url.search, headers: req.headers, body: body.length ? new Uint8Array(body) : null })
        if (done.fault === 'reset') return req.socket.destroy()
        if (done.fault === 'hang') return undefined
        res.writeHead(done.status, done.headers)
        return res.end(Buffer.from(done.body))
      })
    })
    server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)) })
    return new Promise(resolve => server.listen(port, host, () => resolve({
      origin: `http://${host}:${server.address().port}`,
      close: () => new Promise(done => { for (const s of sockets) s.destroy(); server.close(() => done()) }),
    })))
  }

  return Object.assign(state, { handle, route, release, listen, sample, vtag })
}
