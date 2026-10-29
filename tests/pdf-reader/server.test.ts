// What the extension asks our server (session/server.ts; Stage 5 Task 9's B1 to B4 on the client, and the layer API v1's
// shapes as the web names them, src/shared/layer-api.ts): every request over a recording fetch, every answer read within its
// bounds and by its status's shape, only the paper's id and version leaving the machine
import { describe, expect, it, vi } from 'vitest'
import { CATALOG_CAP, CTAG5, writeCatalog } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { askPrepare, basePath, bodyWithin, fetchObject, fetchOriginal, LayerUnreachable, layerPath, lookLayer, OBJECT_MARGIN, paperSegment, REQUEST_MS, RETRY_MS, sha256Of } from '@/pdf-reader/session/server'
import { made, N, PAPER } from './helpers/format-paper'

const API = 'https://readarxiv.com'
type Call = { url: string; init: RequestInit }
/** a fetch that records each request and answers from `answer` */
function recording(answer: (url: string, init: RequestInit, n: number) => Response | Promise<Response>) {
  const calls: Call[] = []
  const f = vi.fn(async (url: string, init: RequestInit = {}) => { calls.push({ url, init }); return answer(url, init, calls.length) })
  return { f: f as unknown as typeof fetch, calls }
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
const ref = (kind: string, sha: string, extra: object = {}) => ({ kind, sha256: sha.repeat(64).slice(0, 64), bytes: 10, ...extra })
async function catalogBytes() {
  const m = await made()
  const units = m.chunks.map(c => ({ from: c.from, to: c.to, sha256: c.sha256, bytes: c.bytes.length }))
  const parts = m.parts.map(p => ({ from: p.from, to: p.to, sha256: p.sha256, bytes: p.bytes.length }))
  const c = await writeCatalog({ head: m.readHead, units, parts, end: { through: N } } as never)
  return { m, bytes: c.bytes }
}

describe('B2: only the paper\'s id and version leave the machine', () => {
  it('every request names the paper version in its address alone: no query, no body but {} on the prepare, no header but its type, no credentials, no referrer', async () => {
    const { m, bytes } = await catalogBytes()
    const { f, calls } = recording(url => {
      if (url.endsWith('/prepare')) return json(202, { position: 2, stage: null, progress: null, retryAfterMs: 3000 })
      if (url.includes('/o/')) return new Response(new Uint8Array(10))
      if (url.includes('/original/')) return new Response(new Uint8Array([1, 2, 3]))
      return new Response(bytes as BodyInit)
    })
    await lookLayer(API, PAPER, { fetch: f })
    await askPrepare(API, PAPER, { fetch: f })
    await fetchObject(API, PAPER, { sha256: 'a'.repeat(64), bytes: 10 }, { fetch: f })
    await fetchOriginal(API, PAPER, { bytes: 3, sha256: await sha256Of(new Uint8Array([1, 2, 3])) }, { fetch: f })
    const seg = `${PAPER.id}v${PAPER.version}`
    expect(calls.map(c => c.url)).toEqual([
      `${API}/api/v1/layer/${seg}/${CTAG5}`, `${API}/api/v1/layer/${seg}/${CTAG5}/prepare`, `${API}/api/v1/layer/${seg}/${CTAG5}/o/${'a'.repeat(64)}`, `${API}/api/v1/original/${seg}`,
    ])
    for (const c of calls) {
      expect(new URL(c.url).search, c.url).toBe('')
      expect(c.init.credentials, c.url).toBe('omit')
      expect(c.init.referrerPolicy, c.url).toBe('no-referrer')
    }
    expect(calls.filter(c => c.init.body !== undefined).map(c => [c.init.method, c.init.body, c.init.headers])).toEqual([['POST', '{}', { 'content-type': 'application/json' }]])
    expect(calls.filter(c => c.init.method !== 'POST').every(c => c.init.headers === undefined)).toBe(true)
    expect(m.index.units.length).toBeGreaterThan(0)
  })

  it('our base page (the layer route, design §3.2): the paper version as one segment, then the digest that names its bytes; no address is made of a digest that is not one', () => {
    const sha = 'a1b2c3d4'.repeat(8)
    expect(basePath(API, PAPER, sha)).toBe(`${API}/api/v1/base/${PAPER.id}v${PAPER.version}/${sha}`)
    expect(basePath(API, { id: 'hep-th/9711200', version: 2 }, sha)).toBe(`${API}/api/v1/base/hep-th_9711200v2/${sha}`)
    for (const bad of ['', sha.slice(1), `${sha}0`, sha.toUpperCase(), '../x', `${sha.slice(2)}/x`]) expect(() => basePath(API, PAPER, bad), bad).toThrow(TypeError)
    expect(() => basePath(API, { id: '../x', version: 1 }, sha)).toThrow(TypeError)
  })

  it('the catalog is asked by the engine\'s own CTAG, the contract of BUNDLE 8: no request names the CTAG of a bundle of 7', () => {
    expect(CTAG5).toMatch(/^b12-j/)
    expect(layerPath(API, PAPER)).toBe(`${API}/api/v1/layer/${PAPER.id}v${PAPER.version}/${CTAG5}`)
    for (const path of [layerPath(API, PAPER), `${layerPath(API, PAPER)}/prepare`]) expect(path).not.toMatch(/\/b7-j/)
  })

  it('a paper version of either style as one segment; anything else no request', () => {
    expect(paperSegment({ id: 'hep-th/9711200', version: 2 })).toBe('hep-th_9711200v2')
    expect(paperSegment({ id: 'math.AG/0601001', version: 1 })).toBe('math.AG_0601001v1')
    for (const bad of [{ id: '../x', version: 1 }, { id: '2600.00001v2', version: 1 }, { id: '2600.00001', version: 0 }, { id: '2600.00001', version: 1.5 }]) expect(() => layerPath(API, bad), JSON.stringify(bad)).toThrow(TypeError)
  })
})

describe('B1: each answer within its bounds and of its status\'s shape', () => {
  it('a catalog is the engine\'s to read, its paper the one asked: another paper\'s is no catalog', async () => {
    const { bytes } = await catalogBytes()
    const ok = await lookLayer(API, PAPER, { fetch: recording(() => new Response(bytes as BodyInit)).f })
    expect(ok.kind).toBe('catalog')
    if (ok.kind === 'catalog') expect(ok.catalog.parts.length).toBe(3)
    await expect(lookLayer(API, { id: '2600.00009', version: 1 }, { fetch: recording(() => new Response(bytes as BodyInit)).f })).rejects.toBeInstanceOf(LayerUnreachable)
    // past its cap by its length, unread
    const cancel = vi.fn()
    const big = new Response(new ReadableStream({ pull: c => c.enqueue(new Uint8Array(1024)), cancel }), { headers: { 'content-length': String(CATALOG_CAP + 1) } })
    await expect(lookLayer(API, PAPER, { fetch: recording(() => big).f })).rejects.toThrow(/past/)
  })

  it('the catalog\'s and an object\'s answers name the original their layer is bound to: a strong entity-tag, else none', async () => {
    const { bytes } = await catalogBytes()
    const tag = '"5bf5251f12d575b58ced19bb84971986"'
    const look = await lookLayer(API, PAPER, { fetch: recording(() => new Response(bytes as BodyInit, { headers: { 'x-axt-base-etag': tag } })).f })
    expect(look.kind === 'catalog' && look.bound).toBe(tag)
    for (const [header, want] of [[tag, tag], [`W/${tag}`, null], ['5bf5251f', null], [null, null]] as const) {
      const got = await fetchObject(API, PAPER, { sha256: 'a'.repeat(64), bytes: 3 }, { fetch: recording(() => new Response(new Uint8Array(3), { headers: header ? { 'x-axt-base-etag': header } : {} })).f })
      expect(got.bound, String(header)).toBe(want)
      expect(got.bytes.length).toBe(3)
    }
  })

  it('a 202: its place, stage, progress, wait and the objects made so far, each rebuilt from its known fields; another shape is none of v1\'s', async () => {
    const layer = { units: [ref('units', 'a', { from: 0, to: 9, extra: 'x' })], head: ref('head', 'b'), parts: [ref('part', 'c', { from: 1, to: 2, prev: null })] }
    const a = await lookLayer(API, PAPER, { fetch: recording(() => json(202, { position: 4, stage: 'units', progress: 0.25, retryAfterMs: 2500, layer, more: true })).f })
    expect(a).toEqual({ kind: 'preparing', preparing: { position: 4, stage: 'units', progress: 0.25, retryAfterMs: 2500, layer: { units: [ref('units', 'a', { from: 0, to: 9 })], head: ref('head', 'b'), parts: [ref('part', 'c', { from: 1, to: 2, prev: null })] } } })
    for (const body of [{ position: 0, stage: null, progress: null, retryAfterMs: 1 }, { position: null, stage: null, progress: 2, retryAfterMs: 1 }, { position: null, stage: 'A B', progress: null, retryAfterMs: 1 }, { position: null, stage: null, progress: null }, { position: null, stage: null, progress: null, retryAfterMs: 1, layer: { units: [ref('part', 'a')], head: null, parts: [] } }]) {
      await expect(lookLayer(API, PAPER, { fetch: recording(() => json(202, body)).f }), JSON.stringify(body)).rejects.toBeInstanceOf(LayerUnreachable)
    }
  })

  it('a 404 says why of v1\'s five, a 429 its wait; any other status or shape is the server not to be had', async () => {
    for (const why of ['not-prepared', 'no-source', 'no-pdf', 'cannot-prepare', 'unknown-versions']) expect(await lookLayer(API, PAPER, { fetch: recording(() => json(404, { why })).f })).toEqual({ kind: 'none', why })
    expect(await lookLayer(API, PAPER, { fetch: recording(() => json(429, { retryAfterMs: 60_000 })).f })).toEqual({ kind: 'refused', retryAfterMs: 60_000 })
    for (const [status, body] of [[404, { why: 'gone' }], [429, {}], [418, {}], [301, {}]] as const) await expect(lookLayer(API, PAPER, { fetch: recording(() => json(status, body)).f }), String(status)).rejects.toBeInstanceOf(LayerUnreachable)
    await expect(lookLayer(API, PAPER, { fetch: recording(() => new Response('<html>', { status: 404 })).f })).rejects.toThrow(/not JSON/)
  })

  it('an object: no request for a ref that is none, no more read than its bytes and a margin; our copy: the base\'s bytes and digest exactly', async () => {
    const { f, calls } = recording(() => new Response(new Uint8Array(10 + OBJECT_MARGIN + 1)))
    for (const sha256 of ['../evil', 'A'.repeat(64), 'a'.repeat(63)]) await expect(fetchObject(API, PAPER, { sha256, bytes: 10 }, { fetch: f })).rejects.toThrow(TypeError)
    expect(calls).toEqual([])
    await expect(fetchObject(API, PAPER, { sha256: 'a'.repeat(64), bytes: 10 }, { fetch: f })).rejects.toThrow(/past/)
    await expect(fetchObject(API, PAPER, { sha256: 'a'.repeat(64), bytes: 10 }, { fetch: recording(() => new Response('', { status: 404 })).f })).rejects.toThrow(/404/)
    const bytes = new Uint8Array([9, 9, 9])
    const base = { bytes: 3, sha256: await sha256Of(bytes) }
    expect([...(await fetchOriginal(API, PAPER, base, { fetch: recording(() => new Response(bytes as BodyInit)).f }))]).toEqual([9, 9, 9])
    await expect(fetchOriginal(API, PAPER, base, { fetch: recording(() => new Response(new Uint8Array([9, 9, 8]))).f })).rejects.toThrow(/not the bytes/)
    await expect(fetchOriginal(API, PAPER, base, { fetch: recording(() => new Response(new Uint8Array(4))).f })).rejects.toThrow(/past/)
  })

  it('reads a body as it comes, never more than its cap', async () => {
    let sent = 0
    const cancel = vi.fn()
    const r = new Response(new ReadableStream<Uint8Array>({ pull(c) { sent += 1000; c.enqueue(new Uint8Array(1000)) }, cancel }))
    await expect(bodyWithin(r, 2500)).rejects.toThrow(/past/)
    expect(sent).toBeLessThanOrEqual(4000)
    expect(cancel).toHaveBeenCalled()
  })
})

describe('B4: a 5xx or a network that fails is asked once more after a second, then the server is not to be had', () => {
  it('asks again once, then gives up; a second answer that is the layer is taken', async () => {
    vi.useFakeTimers()
    try {
      const twice = recording((_u, _i, n) => (n === 1 ? new Response('', { status: 503 }) : json(404, { why: 'no-source' })))
      const a = lookLayer(API, PAPER, { fetch: twice.f })
      await vi.advanceTimersByTimeAsync(RETRY_MS)
      expect(await a).toEqual({ kind: 'none', why: 'no-source' })
      expect(twice.calls.length).toBe(2)
      const down = recording(() => { throw new TypeError('Failed to fetch') })
      const b = lookLayer(API, PAPER, { fetch: down.f }).catch(e => e)
      await vi.advanceTimersByTimeAsync(RETRY_MS)
      expect(await b).toBeInstanceOf(LayerUnreachable)
      expect(down.calls.length).toBe(2)
      // an abort of the caller's is the caller's, never asked again
      const ac = new AbortController()
      ac.abort()
      const aborted = recording(() => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }) })
      await expect(lookLayer(API, PAPER, { fetch: aborted.f, signal: ac.signal })).rejects.toThrow(/aborted/)
      expect(aborted.calls.length).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a request that never settles (no answer, or a body that stops) is let go at REQUEST_MS, asked once more, then the server is not to be had (Codex on #390)', async () => {
    vi.useFakeTimers()
    try {
      // a connection taken and never answered: the fetch hears only its signal
      const hung = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason))))
      const a = lookLayer(API, PAPER, { fetch: hung as unknown as typeof fetch }).catch(e => e)
      await vi.advanceTimersByTimeAsync(REQUEST_MS + RETRY_MS + REQUEST_MS)
      expect(await a).toBeInstanceOf(LayerUnreachable)
      expect(hung).toHaveBeenCalledTimes(2)
      // headers come, then the body stops: let go as well
      const stops = vi.fn(async (_u: string, init: RequestInit) => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{')); init.signal?.addEventListener('abort', () => c.error(init.signal?.reason)) } }), { status: 200 }))
      const b = lookLayer(API, PAPER, { fetch: stops as unknown as typeof fetch }).catch(e => e)
      await vi.advanceTimersByTimeAsync(REQUEST_MS + 10)
      expect(await b).toBeInstanceOf(LayerUnreachable)
    } finally {
      vi.useRealTimers()
    }
  })

  it('an answer read to its end lets go of its bound at once: no timer left, the caller\'s signal let go (Devin on #390)', async () => {
    vi.useFakeTimers()
    try {
      const { bytes } = await catalogBytes()
      const ac = new AbortController()
      const removed = vi.spyOn(ac.signal, 'removeEventListener')
      const look = await lookLayer(API, PAPER, { fetch: recording(() => new Response(bytes as BodyInit)).f, signal: ac.signal })
      expect(look.kind).toBe('catalog')
      expect(vi.getTimerCount()).toBe(0)
      expect(removed).toHaveBeenCalledWith('abort', expect.any(Function))
      // a body let go unread (a 404's JSON read whole too, an object's answer cancelled): the same
      await expect(fetchObject(API, PAPER, { sha256: 'a'.repeat(64), bytes: 10 }, { fetch: recording(() => new Response('', { status: 404 })).f })).rejects.toThrow(/404/)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a prepare\'s answers: ready, preparing, none, a wait', async () => {
    expect(await askPrepare(API, PAPER, { fetch: recording(() => json(200, { ready: true })).f })).toEqual({ kind: 'ready' })
    expect(await askPrepare(API, PAPER, { fetch: recording(() => json(404, { why: 'no-pdf' })).f })).toEqual({ kind: 'none', why: 'no-pdf' })
    expect(await askPrepare(API, PAPER, { fetch: recording(() => json(429, { retryAfterMs: 5 })).f })).toEqual({ kind: 'refused', retryAfterMs: 5 })
    await expect(askPrepare(API, PAPER, { fetch: recording(() => json(200, { ready: 'yes' })).f })).rejects.toBeInstanceOf(LayerUnreachable)
  })
})
