// @vitest-environment node
// The stand-in of our server's /api/v2 routes (tests/e2e/lib/v2-api.mjs) holds what a client of the routes may rely on, through
// HTTP alone: the routes' contract as the website states it (and runs against this stand-in through the engine it vendors),
// restated here only as far as a client sees it. And the reader package's client reads what it serves: a document, its layer's
// objects held to their digests, the original by ranges.
import { describe, expect, it } from 'vitest'
import { OpenAnswer, PaperDoc } from '../../../packages/format/src/index.ts'
import { docOf, objectStore } from '../../../packages/reader/src/session/client.ts'
import { loadFixture, segOf, v2Api } from './v2-api.mjs'

const EXT = 'chrome-extension://abcdefghijklmnop'
const BASE = 'https://readarxiv.com'
const SAME = { 'sec-fetch-site': 'same-origin' }
const make = () => {
  let t = 1_000
  const api = v2Api({ fixtures: [loadFixture('s1-columns'), loadFixture('s2-splits')], base: BASE, extension: EXT, prepareMs: 5_000, now: () => t })
  api.set({ prepared: [] })
  return { api, advance: (ms: number) => { t += ms } }
}
const post = (api: ReturnType<typeof v2Api>, body: unknown, headers: Record<string, string> = {}) =>
  api.fetch(new Request(`${BASE}/api/v2/open`, { method: 'POST', headers: { 'content-type': 'application/json', ...SAME, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }))
const get = (api: ReturnType<typeof v2Api>, path: string, headers: Record<string, string> = {}, method = 'GET') => api.fetch(new Request(`${BASE}${path}`, { method, headers: { ...SAME, ...headers } }))
async function refused(res: Response, status: number, error: string) {
  expect(res.status).toBe(status)
  expect(res.headers.get('content-type')).toBe('application/json')
  expect(res.headers.get('vary')).toContain('Origin')
  const body = (await res.json()) as Record<string, unknown>
  expect(body.error).toBe(error)
  expect(Object.keys(body).every(k => k === 'error' || k === 'retryAfterS')).toBe(true)
}

describe('POST /api/v2/open', () => {
  it('starts what is missing and answers the document, with where to follow it; asked again, the same epoch and a rev not lower', async () => {
    const { api } = make()
    const paper = api.known.paper
    const res = await post(api, { paper, target: null, formats: [1] })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    // (format's OpenAnswer: the contract's own reading of it)
    const a = OpenAnswer.parse(await res.json())
    expect(a.doc).toMatchObject({ v: 1, paper, version: api.known.latest, pv: segOf(paper, api.known.latest) })
    expect(a.doc.prepare.state).toBe('running')
    expect(a.follow).toBe(`/api/v2/papers/${a.doc.pv}?f=1`)
    const again = OpenAnswer.parse(await (await post(api, { paper, target: null, formats: [1] })).json())
    expect(again.doc.epoch).toBe(a.doc.epoch)
    expect(again.doc.rev).toBeGreaterThanOrEqual(a.doc.rev)
  })
  it('refuses: an unknown paper 404, no format the server writes 426, a malformed ask 400, a body past 1 KiB 413, another type 415, another method 405', async () => {
    const { api } = make()
    await refused(await post(api, { paper: api.unknown, target: null, formats: [1] }), 404, 'not-found')
    await refused(await post(api, { paper: api.known.paper, target: null, formats: [99] }), 426, 'update')
    await refused(await post(api, '{not json'), 400, 'bad-request')
    await refused(await post(api, { paper: 'not a paper', target: null, formats: [1] }), 400, 'bad-request')
    await refused(await post(api, { paper: api.known.paper, target: 'xx', formats: [1] }), 400, 'bad-request')
    await refused(await post(api, { paper: api.known.paper, target: null, formats: [1], pad: 'x'.repeat(1100) }), 413, 'too-large')
    await refused(await post(api, '{}', { 'content-type': 'text/plain' }), 415, 'wrong-type')
    const wrong = await get(api, '/api/v2/open')
    expect(wrong.headers.get('allow')).toBe('POST')
    await refused(wrong, 405, 'wrong-method')
  })
  it('origin: a cross-site page refused; the extension answered with its origin, and preflighted; the site named no origin back', async () => {
    const { api } = make()
    const ask = { paper: api.known.paper, target: null, formats: [1] }
    await refused(await post(api, ask, { 'sec-fetch-site': 'cross-site', origin: 'https://elsewhere.example' }), 403, 'cross-site')
    const ext = await post(api, ask, { 'sec-fetch-site': 'cross-site', origin: EXT })
    expect(ext.status).toBe(200)
    expect(ext.headers.get('access-control-allow-origin')).toBe(EXT)
    const pre = await get(api, '/api/v2/open', { origin: EXT, 'access-control-request-method': 'POST', 'sec-fetch-site': 'cross-site' }, 'OPTIONS')
    expect(pre.status).toBe(204)
    expect(pre.headers.get('access-control-allow-methods')).toBe('POST')
    expect((await post(api, ask)).headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('GET /api/v2/papers/<seg>', () => {
  it('never starts anything; answers the document as JSON (no-store) or as whole frames of a stream, `retry:` first and each frame\'s rev its `id:`', async () => {
    const { api, advance } = make()
    const also = segOf(api.known.also, 1)
    await refused(await get(api, `/api/v2/papers/${also}?f=1`), 404, 'not-opened')
    await refused(await get(api, `/api/v2/papers/${also}?f=1`), 404, 'not-opened')
    const opened = OpenAnswer.parse(await (await post(api, { paper: api.known.paper, target: null, formats: [1] })).json())
    const res = await get(api, `/api/v2/papers/${opened.doc.pv}?f=1`)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const doc = PaperDoc.parse(await res.json())
    expect(doc?.epoch).toBe(opened.doc.epoch)
    expect(doc?.layer).toBeNull()
    advance(5_000)
    const stream = await get(api, `/api/v2/papers/${opened.doc.pv}?f=1`, { accept: 'text/event-stream' })
    expect(stream.headers.get('content-type')).toBe('text/event-stream')
    const text = await stream.text()
    const lines = text.slice(0, text.indexOf('\n\n')).split('\n')
    expect(lines[0]).toMatch(/^retry: \d+$/)
    expect(lines.some(l => l.startsWith('event:'))).toBe(false)
    const framed = docOf(JSON.parse(lines.find(l => l.startsWith('data: '))?.slice(6) ?? 'null'))
    expect(lines).toContain(`id: ${framed?.rev}`)
    expect(framed?.prepare.state).toBe('done')
    expect(framed?.layer?.units.length).toBeGreaterThan(0)
  })
  it('refuses: a format the server does not write 426, a segment that is no paper 404, a target or a page that is none 400, another method 405', async () => {
    const { api } = make()
    const seg = segOf(api.known.paper, api.known.latest)
    await post(api, { paper: api.known.paper, target: null, formats: [1] })
    await refused(await get(api, `/api/v2/papers/${seg}?f=99`), 426, 'update')
    await refused(await get(api, '/api/v2/papers/2401.01234v2?f=1'), 404, 'not-found')
    await refused(await get(api, `/api/v2/papers/${seg}?t=xx&f=1`), 400, 'bad-request')
    await refused(await get(api, `/api/v2/papers/${seg}?f=one`), 400, 'bad-request')
    await refused(await get(api, `/api/v2/papers/${seg}?f=1`, {}, 'POST'), 405, 'wrong-method')
    for (const p of ['0', '-1', 'x', '10001', '1.5']) await refused(await get(api, `/api/v2/papers/${seg}?f=1&p=${p}`), 400, 'bad-request')
  })
})

describe('GET|HEAD /api/v2/o/<path>; /api/v1/*', () => {
  it('outside the grammar 404 not-found, an object never made 404 gone; an object whole and by ranges, immutable for a year, with an entity-tag', async () => {
    const { api } = make()
    const seg = segOf(api.known.paper, 1)
    await refused(await get(api, '/api/v2/o/p/../../secret'), 404, 'not-found')
    await refused(await get(api, `/api/v2/o/p/${seg}/0123456789abcdef/${'z'.repeat(64)}`), 404, 'not-found')
    await refused(await get(api, `/api/v2/o/p/${seg}/0123456789abcdef/${'cd'.repeat(32)}`), 404, 'gone')
    const path = `p/${seg}/0123456789abcdef/${'ab'.repeat(32)}`
    await api.put(path, new TextEncoder().encode('an immutable object of a prepare'))
    const whole = await get(api, `/api/v2/o/${path}`)
    expect(whole.status).toBe(200)
    expect(whole.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(whole.headers.get('etag')).toBeTruthy()
    const part = await get(api, `/api/v2/o/${path}`, { range: 'bytes=0-1' })
    expect(part.status).toBe(206)
    expect(part.headers.get('content-range')).toBe('bytes 0-1/32')
    expect(await part.text()).toBe('an')
    expect((await get(api, `/api/v2/o/${path}`, {}, 'HEAD')).headers.get('content-length')).toBe('32')
    await refused(await get(api, `/api/v2/o/${path}`, {}, 'POST'), 405, 'wrong-method')
    const pdf = await get(api, `/api/v2/o/arxiv/${seg}.pdf`, { range: 'bytes=0-3' })
    expect([pdf.status, await pdf.text()]).toEqual([206, '%PDF'])
    await refused(await get(api, `/api/v2/o/arxiv/${segOf(api.unknown, 1)}.pdf`), 404, 'not-found')
  })
  it('/api/v1/*: 404 unknown-versions for every path and method, a day at the edge, the extension\'s origin named', async () => {
    const { api } = make()
    for (const [path, method] of [['/api/v1/layer/2401.01234v2/abcde', 'GET'], ['/api/v1/anything', 'GET'], ['/api/v1/original/2401.01234v2', 'HEAD']] as const) {
      const res = await get(api, path, { origin: EXT }, method)
      expect(res.status).toBe(404)
      expect(res.headers.get('cache-control')).toBe('public, max-age=86400')
      expect(res.headers.get('access-control-allow-origin')).toBe(EXT)
      if (method !== 'HEAD') expect(await res.json()).toEqual({ why: 'unknown-versions' })
    }
  })
  it('the reader package\'s client reads the layer it serves: every object of a prepared paper held to its digest', async () => {
    const { api } = make()
    api.set({ prepared: [api.known.paper] })
    const opened = (await (await post(api, { paper: api.known.paper, target: null, formats: [1] })).json()) as { doc: unknown }
    const doc = docOf(opened.doc)
    expect(doc?.layer).not.toBeNull()
    const store = objectStore({ fetch: (url, init) => api.fetch(new Request(new URL(url, BASE), { ...init, headers: { ...SAME } })) })
    for (const ref of [doc!.layer!.catalog, ...doc!.layer!.units]) expect((await store.of(ref)).length).toBe(ref.bytes)
  })
})

describe('faults and static files', () => {
  it('a fault is every route\'s, the static files\' too: a server error, or the network (a fetch that rejects)', async () => {
    const { api } = make()
    api.set({ fault: 503 })
    expect((await post(api, { paper: api.known.paper, target: null, formats: [1] })).status).toBe(503)
    expect((await get(api, '/static-fonts/index.json')).status).toBe(503)
    api.set({ fault: 'reset' })
    await expect(get(api, '/static-fonts/index.json')).rejects.toThrow(TypeError)
    api.set({ fault: null })
    expect((await get(api, '/static-fonts/index.json')).status).toBe(200)
    expect((await get(api, '/hyph/de.json')).status).toBe(404)
  })
})
