// What the extension asks our server, and only that (Stage 5 Task 9; the layer API v1, the web's src/shared/layer-api.ts
// recorded by tests/pdf-reader/server.test.ts): a paper version's layer by the reader's CTAG — its catalog, or the prepare
// under way with the objects made so far, or why there is none, or a wait —, its prepare, each object of it by its digest,
// our copy of arXiv's PDF of the version, and, where a layer is laid over our own compile (the layer route, design §3.2), that
// base page, named by the digest of its bytes.
//
//   GET  /api/v1/layer/<id>v<n>/<CTAG5>             200 the catalog | 202 Preparing | 404 { why } | 429 { retryAfterMs }
//   POST /api/v1/layer/<id>v<n>/<CTAG5>/prepare     (application/json, body {}) 202 Preparing | 200 { ready: true } | 404 | 429
//   GET  /api/v1/layer/<id>v<n>/<CTAG5>/o/<sha256>  200 the object, immutable
//   GET  /api/v1/layer/<id>v<n>/<CTAG5>/o/<sha256>.delta  200 our base as a delta over arXiv's PDF, immutable (the web's deltaPath)
//   GET  /api/v1/original/<id>v<n>                  200 application/pdf, or 206 for a range (ranges.ts)
//   GET  /api/v1/base/<id>v<n>/<sha256>             200 application/pdf, or 206 for a range: our base page, where a head says it is ours
//
// The catalog's and each object's answer name the original the layer was made over (BASE_ETAG_HEADER: our copy's entity-tag,
// which the server binds to the head's base as it commits the layer, the web's worker/src/layer/base.ts), so that our copy
// can be read by ranges, every answer held to that tag and the base's length, with no whole read hashed first (ranges.ts).
//
// Only the paper's id and version leave the machine, in the address: no query, no body but `{}` on the prepare, no header of
// ours but that one's type (and a range's), no cookie and no referrer (the reader's address holds more than the paper). Every answer is read
// within its bounds before anything parses it: the catalog by the engine's own reader (its cap, values and shape, the paper
// the one asked), the others within a few kilobytes and by their shape here; an object within the bytes its ref names; our
// copy within the base's bytes and checked against its digest. A 5xx or a network that fails is asked once more after a
// second; a second failure, or an answer not of its status's shape, is the server unreachable for now (LayerUnreachable).
import { CATALOG_CAP, CTAG5, readCatalog } from '../engine/layer.mjs'
import type { ReadCatalog, Ref } from '../engine/layer.mjs'
import type { TellRef } from '../engine/view.mjs'

/** the API's root, kept for every released extension */
export const API_ROOT = '/api/v1/'
/** why there is no layer to answer: none made yet (ask the prepare), the paper's source or PDF not to be had, a prepare that
 *  cannot succeed, or a CTAG the server makes no layer of */
export const LAYER_WHYS = ['not-prepared', 'no-source', 'no-pdf', 'cannot-prepare', 'unknown-versions'] as const
export type LayerWhy = (typeof LAYER_WHYS)[number]
/** a 202's, and a 404's or 429's, bytes at most: the objects made so far, as many as a catalog names; a few hundred bytes */
export const PREPARING_CAP = CATALOG_CAP
export const SMALL_CAP = 4096
/** how far an object's answer may pass its ref's bytes before it is refused unread (an encoded answer's own length) */
export const OBJECT_MARGIN = 1024
/** how long after a 5xx or a network failure an answer is asked once more */
export const RETRY_MS = 1000
/** how long one ask may take, its answer and its body together, before it is let go as a network failure is (asked once
 *  more, then the server not to be had): a connection taken and never answered, or a body that stops, would otherwise hold
 *  the reader in its look for good. Thirty seconds bring the largest object at 64 kbit/s */
export const REQUEST_MS = 30_000
/** our copy of the original read whole (no tag to read it by ranges): its own bound, a 46 MB copy at 80 KB/s */
export const ORIGINAL_MS = 600_000
/** a delta object (at most DELTA_MAX_BYTES, 24 MiB): 24 MiB at 400 KB/s */
export const DELTA_MS = 60_000
/** the header of the catalog's and the objects' answers that names the original the layer is bound to: our copy's entity-tag */
export const BASE_ETAG_HEADER = 'x-axt-base-etag'
/** a strong entity-tag (RFC 9110 §8.8.3), as R2 tags an object: the only kind a range is held to */
export const STRONG_ETAG = /^"[\x21\x23-\x7e]{1,200}"$/
/** the original an answer names its layer bound to (BASE_ETAG_HEADER), a strong entity-tag; null for none, or another kind */
export const boundOf = (r: Response): string | null => { const t = r.headers.get(BASE_ETAG_HEADER); return t !== null && STRONG_ETAG.test(t) ? t : null }

export interface Paper { id: string; version: number }
/** the prepare under way: its place in the queue, its stage, how far it has come (0 to 1), when to ask again, and the objects
 *  made so far (BUNDLE 4: the chunks, the head, the parts in page order) */
export interface Preparing { position: number | null; stage: string | null; progress: number | null; retryAfterMs: number; layer: { units: TellRef[]; head: TellRef | null; parts: TellRef[] } | null }
export type LayerLook =
  /** `bound`: the original its route names the layer bound to (boundOf), null where it names none */
  | { kind: 'catalog'; catalog: ReadCatalog; bytes: Uint8Array; bound: string | null }
  | { kind: 'preparing'; preparing: Preparing }
  | { kind: 'none'; why: LayerWhy }
  | { kind: 'refused'; retryAfterMs: number }
export type PrepareAnswer = { kind: 'ready' } | Exclude<LayerLook, { kind: 'catalog' }>

/** the server not to be had for now: the network, a 5xx twice, or an answer this reader does not know (developer's words) */
export class LayerUnreachable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LayerUnreachable'
  }
}

const DIGEST = /^[0-9a-f]{64}$/
/** a paper id as one segment of the API's address, of core/paper-id.ts's shapes with no version: an old-style id's slash
 *  written as `_` (the web's paperAt); then its version */
export function paperSegment(p: Paper): string {
  if (typeof p?.id !== 'string' || !/^(\d{4}\.\d{4,5}|[a-z-]+(\.[A-Za-z-]+)?\/\d{7})$/.test(p.id) || !Number.isSafeInteger(p.version) || p.version < 1) throw new TypeError(`not a paper version: ${String(p?.id).slice(0, 40)}v${String(p?.version).slice(0, 8)}`)
  return `${p.id.replace('/', '_')}v${p.version}`
}
export const layerPath = (api: string, p: Paper) => `${api}${API_ROOT}layer/${paperSegment(p)}/${CTAG5}`
export const objectPath = (api: string, p: Paper, sha256: string) => `${layerPath(api, p)}/o/${sha256}`
/** our base as a delta over arXiv's PDF, by its digest: the object route with the delta's own suffix, as the web serves it (its
 *  src/shared/layer-api.ts deltaPath; the engine's deltaKey names it so). The bare digest of a delta is a 404 there */
export const deltaPath = (api: string, p: Paper, sha256: string) => `${objectPath(api, p, sha256)}.delta`
export const originalPath = (api: string, p: Paper) => `${api}${API_ROOT}original/${paperSegment(p)}`
/** our base page of the version, where a head says its base is ours: the final pass of our compile, named by the SHA-256 of its
 *  bytes (so the address is the object and never another), read by ranges from any origin. A digest that is not 64 lower-case
 *  hex digits makes no address */
export function basePath(api: string, p: Paper, sha256: string): string {
  if (typeof sha256 !== 'string' || !DIGEST.test(sha256)) throw new TypeError(`not a SHA-256 digest: ${String(sha256).slice(0, 70)}`)
  return `${api}${API_ROOT}base/${paperSegment(p)}/${sha256}`
}

/** every request's options: no credentials, no referrer, nothing of ours but what the request is */
export const REQUEST: Readonly<RequestInit> = { credentials: 'omit', referrerPolicy: 'no-referrer' }
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason)
  const t = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve() }, ms)
  const stop = () => { clearTimeout(t); reject(signal?.reason) }
  signal?.addEventListener('abort', stop, { once: true })
})
const messageOf = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 200)

/** `url` asked, and once more after RETRY_MS where the network failed, the server answered 5xx or nothing came within
 *  REQUEST_MS; a second failure is LayerUnreachable. The bound holds over the answer's body too (its read is let go at
 *  REQUEST_MS: bodyWithin says so as LayerUnreachable). An abort of the caller's signal is the caller's, never asked again */
async function fetched(f: typeof fetch, url: string, init: RequestInit, ms = REQUEST_MS): Promise<Response> {
  for (let again = true; ; again = false) {
    const ac = new AbortController(), caller = init.signal ?? null
    const stop = () => ac.abort(caller?.reason)
    if (caller?.aborted) stop()
    else caller?.addEventListener('abort', stop, { once: true })
    const timer = setTimeout(() => ac.abort(Object.assign(new Error(`nothing within ${ms / 1000} s`), { name: 'TimeoutError' })), ms)
    const done = () => { clearTimeout(timer); caller?.removeEventListener('abort', stop) }
    try {
      const r = await f(url, { ...REQUEST, ...init, signal: ac.signal })
      // the bound runs on over the body's read, and is let go once the body ends, breaks or is cancelled
      if (r.status < 500) return boundBody(r, done)
      done()
      void r.body?.cancel().catch(() => {})
      if (!again) throw new LayerUnreachable(`the server answered ${r.status}`)
    } catch (e) {
      done()
      if (caller?.aborted) throw e
      if (e instanceof LayerUnreachable) throw e
      if (!again) throw new LayerUnreachable(`not fetched: ${messageOf(e)}`)
    }
    await sleep(RETRY_MS, caller ?? undefined)
  }
}
/** the statuses whose answers carry no body (a Response made with one throws) */
const NO_BODY = new Set([101, 103, 204, 205, 304])
/** `r` with `done` told once its body has ended, broken or been cancelled (at once where it has none) */
function boundBody(r: Response, done: () => void): Response {
  if (!r.body || NO_BODY.has(r.status)) { done(); return r }
  const reader = r.body.getReader()
  let told = false
  const end = () => { if (!told) { told = true; done() } }
  const body = new ReadableStream<Uint8Array>({
    async pull(c) {
      try {
        const { done: over, value } = await reader.read()
        if (over) { end(); c.close() } else c.enqueue(value)
      } catch (e) { end(); c.error(e) }
    },
    cancel(reason) { end(); return reader.cancel(reason) },
  })
  return new Response(body, { status: r.status, statusText: r.statusText, headers: r.headers })
}
/** an answer's body within `cap` bytes, as its length says and as it comes; past it, the read is let go */
export async function bodyWithin(r: Response, cap: number): Promise<Uint8Array> {
  const past = (n: number) => new LayerUnreachable(`an answer of ${n} bytes or more, past the ${cap} it is read within`)
  const length = Number(r.headers.get('content-length'))
  if (length > cap) { void r.body?.cancel().catch(() => {}); throw past(length) }
  if (!r.body) { const b = new Uint8Array(await r.arrayBuffer()); if (b.length > cap) throw past(b.length); return b }
  const reader = r.body.getReader(), chunks: Uint8Array[] = []
  let n = 0
  for (;;) {
    // a body that stops past its request's bound (fetched's REQUEST_MS), or breaks: the server not to be had; an abort of the
    // caller's stays one
    const { done, value } = await reader.read().catch((e: unknown) => {
      if ((e as Error)?.name === 'AbortError') throw e
      throw new LayerUnreachable(`the answer's body stopped: ${messageOf(e)}`)
    })
    if (done) break
    n += value.length
    if (n > cap) { void reader.cancel().catch(() => {}); throw past(n) }
    chunks.push(value)
  }
  const out = new Uint8Array(n)
  let k = 0
  for (const c of chunks) { out.set(c, k); k += c.length }
  return out
}
async function jsonOf(r: Response, cap: number): Promise<unknown> {
  const bytes = await bodyWithin(r, cap)
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { throw new LayerUnreachable('an answer that is not JSON') }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const wait = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0
const KINDS = new Set(['units', 'head', 'part', 'left'])
/** a ref as an answer names it, rebuilt from its known fields (what it carries besides is a newer writer's, left out), or null */
function refOf(v: unknown, kind: string): TellRef | null {
  if (!isObject(v) || v.kind !== kind || !KINDS.has(kind) || typeof v.sha256 !== 'string' || !DIGEST.test(v.sha256) || !Number.isSafeInteger(v.bytes) || (v.bytes as number) < 1) return null
  const out: Record<string, unknown> = { kind, sha256: v.sha256, bytes: v.bytes }
  for (const k of ['from', 'to', 'page'] as const) if (v[k] !== undefined) { if (!Number.isSafeInteger(v[k]) || (v[k] as number) < 0) return null; out[k] = v[k] }
  if (v.prev !== undefined) { if (v.prev !== null && (typeof v.prev !== 'string' || !DIGEST.test(v.prev))) return null; out.prev = v.prev }
  return out as unknown as TellRef
}
function refsOf(v: unknown, kind: string): TellRef[] | null {
  if (!Array.isArray(v)) return null
  const out = v.map(r => refOf(r, kind))
  return out.every(Boolean) ? (out as TellRef[]) : null
}
/** a 202's body as this reader reads it, or a throw */
function preparingOf(v: unknown): Preparing {
  const bad = () => new LayerUnreachable('a preparing answer of another shape')
  if (!isObject(v) || !wait(v.retryAfterMs)) throw bad()
  const position = v.position === null || v.position === undefined ? null : Number.isSafeInteger(v.position) && (v.position as number) >= 1 ? (v.position as number) : NaN
  const progress = v.progress === null || v.progress === undefined ? null : typeof v.progress === 'number' && v.progress >= 0 && v.progress <= 1 ? v.progress : NaN
  const stage = v.stage === null || v.stage === undefined ? null : typeof v.stage === 'string' && /^[a-z-]{1,32}$/.test(v.stage) ? v.stage : '!'
  if (Number.isNaN(position) || Number.isNaN(progress) || stage === '!') throw bad()
  let layer: Preparing['layer'] = null
  if (v.layer !== undefined) {
    const l = v.layer
    if (!isObject(l)) throw bad()
    const units = refsOf(l.units, 'units'), parts = refsOf(l.parts, 'part'), head = l.head === null ? null : refOf(l.head, 'head')
    if (!units || !parts || (l.head !== null && !head)) throw bad()
    layer = { units, head, parts }
  }
  return { position, stage, progress, retryAfterMs: v.retryAfterMs as number, layer }
}
/** a 404's or a 429's body, or a throw */
function missOf(status: number, v: unknown): LayerLook {
  if (status === 404 && isObject(v) && (LAYER_WHYS as readonly unknown[]).includes(v.why)) return { kind: 'none', why: v.why as LayerWhy }
  if (status === 429 && isObject(v) && wait(v.retryAfterMs)) return { kind: 'refused', retryAfterMs: v.retryAfterMs as number }
  throw new LayerUnreachable(`a ${status} of another shape`)
}

/**
 * The paper version's layer as the API answers now: its catalog (read by the engine's readCatalog, its paper the one asked), the
 * prepare under way, why there is none, or a wait. LayerUnreachable for the network or a 5xx twice, a status the route does not
 * answer, or an answer not of its status's shape
 */
export async function lookLayer(api: string, p: Paper, o: { fetch?: typeof fetch; signal?: AbortSignal } = {}): Promise<LayerLook> {
  const r = await fetched(o.fetch ?? fetch, layerPath(api, p), { signal: o.signal ?? null })
  if (r.status === 200) {
    const bytes = await bodyWithin(r, CATALOG_CAP)
    try { return { kind: 'catalog', catalog: await readCatalog(bytes, { paper: { id: p.id, version: p.version } }), bytes, bound: boundOf(r) } } catch (e) { throw new LayerUnreachable(`its catalog: ${messageOf(e)}`) }
  }
  if (r.status === 202) return { kind: 'preparing', preparing: preparingOf(await jsonOf(r, PREPARING_CAP)) }
  if (r.status === 404 || r.status === 429) return missOf(r.status, await jsonOf(r, SMALL_CAP))
  void r.body?.cancel().catch(() => {})
  throw new LayerUnreachable(`the layer's route answered ${r.status}`)
}
/** the paper version's prepare asked (once a visit: the caller's), its answer read as lookLayer's */
export async function askPrepare(api: string, p: Paper, o: { fetch?: typeof fetch; signal?: AbortSignal } = {}): Promise<PrepareAnswer> {
  const r = await fetched(o.fetch ?? fetch, `${layerPath(api, p)}/prepare`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: o.signal ?? null })
  if (r.status === 200) {
    const v = await jsonOf(r, SMALL_CAP)
    if (isObject(v) && v.ready === true) return { kind: 'ready' }
    throw new LayerUnreachable('a ready answer of another shape')
  }
  if (r.status === 202) return { kind: 'preparing', preparing: preparingOf(await jsonOf(r, PREPARING_CAP)) }
  if (r.status === 404 || r.status === 429) return missOf(r.status, await jsonOf(r, SMALL_CAP)) as PrepareAnswer
  void r.body?.cancel().catch(() => {})
  throw new LayerUnreachable(`the prepare's route answered ${r.status}`)
}
/** an object of the layer by its ref (`ms`: how long its ask may take, REQUEST_MS by default: a delta's is longer; `delta`: the
 *  ref is the head's delta, asked at deltaPath), no more of it read than its ref's bytes and OBJECT_MARGIN (the side's readers check
 *  its digest, values and shape), and the original its answer names it bound to (boundOf); a ref that is no ref refused
 *  before any request, any answer but a 200 refused */
export async function fetchObject(api: string, p: Paper, ref: Pick<Ref, 'sha256' | 'bytes'>, o: { fetch?: typeof fetch; signal?: AbortSignal; ms?: number; delta?: boolean } = {}): Promise<{ bytes: Uint8Array; bound: string | null }> {
  if (typeof ref?.sha256 !== 'string' || !DIGEST.test(ref.sha256) || !Number.isSafeInteger(ref.bytes) || ref.bytes < 1) throw new TypeError(`the layer's object: not a ref (${String(ref?.sha256).slice(0, 80)})`)
  const r = await fetched(o.fetch ?? fetch, (o.delta ? deltaPath : objectPath)(api, p, ref.sha256), { signal: o.signal ?? null }, o.ms ?? REQUEST_MS)
  if (r.status !== 200) { void r.body?.cancel().catch(() => {}); throw new Error(`the layer's object ${ref.sha256}: ${r.status}`) }
  return { bytes: await bodyWithin(r, ref.bytes + OBJECT_MARGIN), bound: boundOf(r) }
}
/** our copy of arXiv's PDF of the version, exactly the base's bytes and digest; any other answer, or other bytes, refused */
export async function fetchOriginal(api: string, p: Paper, base: { bytes: number; sha256: string }, o: { fetch?: typeof fetch; signal?: AbortSignal } = {}): Promise<Uint8Array> {
  const r = await fetched(o.fetch ?? fetch, originalPath(api, p), { signal: o.signal ?? null }, ORIGINAL_MS)
  if (r.status !== 200) { void r.body?.cancel().catch(() => {}); throw new Error(`our copy of the original: ${r.status}`) }
  const bytes = await bodyWithin(r, base.bytes)
  if (bytes.length !== base.bytes || (await sha256Of(bytes)) !== base.sha256) throw new Error('our copy of the original is not the bytes the layer extends')
  return bytes
}

/** a byte string's SHA-256, 64 lower-case hex digits */
export async function sha256Of(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))
  let out = ''
  for (const b of d) out += b.toString(16).padStart(2, '0')
  return out
}
