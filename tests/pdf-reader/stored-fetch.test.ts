// The reader's network through this machine's store of papers (src/pdf-reader/host/stored-fetch.ts): what never changes read
// here first, what may change asked first and kept, the paper's document kept and answered where our server is out of reach
// (the owner's rule of 2026-10-08: offline, nothing new drawn, a kept paper still opens), arXiv's bytes never kept, a store that
// fails never a reason a paper does not open
import { OpenAnswer } from '@readarxiv/format'
import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { createPaperDb, createPaperStore, type PaperStore } from '@/cache/paper-store'
import { storedFetch } from '@/pdf-reader/host/stored-fetch'
import { open as openOf } from '../../packages/reader/src/session/client.ts'

const API = 'https://readarxiv.com'
let n = 0
const store = () => createPaperStore({ db: createPaperDb(`axt-stored-${++n}`, { indexedDB, IDBKeyRange }) })
const sha256 = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(x => x.toString(16).padStart(2, '0')).join('')
/** a network that answers by address, records every ask, and is out of reach where told */
function network(answers: Record<string, () => Response>) {
  const asked: string[] = []
  let down: 'reject' | 503 | null = null
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url, API)
    asked.push(`${init?.method ?? 'GET'} ${u.pathname}${u.search}`)
    if (down === 'reject') throw new TypeError('Failed to fetch')
    if (down === 503) return new Response('{"error":"unavailable"}', { status: 503 })
    const a = answers[u.pathname + u.search] ?? answers[u.pathname]
    return a ? a() : new Response('{"error":"gone"}', { status: 404 })
  })
  return { fetch, asked, down: (d: typeof down) => { down = d } }
}
/** a store's writes are not awaited by the reader: let them land */
const settled = () => new Promise(r => setTimeout(r, 50))
/** our server's document (format's PaperDoc), prepared with its layer or still running */
const doc = (layer: boolean) => ({
  v: 1,
  pv: '2600_00002v1',
  epoch: 'e2e000',
  rev: 1,
  paper: '2600.00002',
  version: 1,
  prepare: { attempt: 1, state: layer ? 'done' : 'running', why: null, retryAt: null, at: 0, build: 'b', stage: layer ? null : 'compiling', units: [], html: null },
  layer: layer ? { catalog: { path: 'p/2600_00002v1/0123456789abcdef/aa', sha256: 'a'.repeat(64), bytes: 1 }, units: [], format: 1, build: 'b', stale: false } : null,
  targets: {},
})
const open = (f: ReturnType<typeof storedFetch>, version?: number) => f('/api/v2/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paper: '2600.00002', ...(version ? { version } : {}), target: null, formats: [1] }) })

describe('what never changes at its address', () => {
  it('an object asked once: kept as the reader reads it through, then read here, its status and the headers the reader reads with it', async () => {
    const body = 'an object'
    const path = `/api/v2/o/p/2600_00002v1/0123456789abcdef/${await sha256(body)}`
    const net = network({ [path]: () => new Response(body, { headers: { 'content-type': 'application/octet-stream', etag: '"x"', 'x-other': 'y' } }) })
    const f = storedFetch({ fetch: net.fetch, store: store(), api: API })
    expect(await (await f(path)).text()).toBe(body)
    await settled()
    const again = await f(path)
    expect([again.status, again.headers.get('etag'), again.headers.get('x-other'), await again.text()]).toEqual([200, '"x"', null, body])
    expect(net.asked).toEqual([`GET ${path}`])
  })
  it('a range kept by its address (the range in its query); one not read through whole is not kept', async () => {
    const path = '/api/v2/o/arxiv/2600_00002v1.pdf'
    const net = network({ [`${path}?r=0-3`]: () => new Response('%PDF', { status: 206, headers: { 'content-range': 'bytes 0-3/9', etag: '"t"' } }), [`${path}?r=4-8`]: () => new Response('-1.7 ', { status: 206, headers: { 'content-range': 'bytes 4-8/9', etag: '"t"' } }) })
    const f = storedFetch({ fetch: net.fetch, store: store(), api: API })
    await (await f(`${path}?r=0-3`, { headers: { range: 'bytes=0-3' } })).arrayBuffer()
    await (await f(`${path}?r=4-8`, { headers: { range: 'bytes=4-8' } })).body?.cancel()
    await settled()
    const r = await f(`${path}?r=0-3`, { headers: { range: 'bytes=0-3' } })
    expect([r.status, r.headers.get('content-range'), await r.text()]).toEqual([206, 'bytes 0-3/9', '%PDF'])
    await f(`${path}?r=4-8`, { headers: { range: 'bytes=4-8' } })
    expect(net.asked.filter(a => a.endsWith('r=4-8'))).toHaveLength(2)
  })
  it('a whole object whose bytes are not the object its address names is not kept; a refusal (404 gone) neither', async () => {
    const path = `/api/v2/o/p/2600_00002v1/0123456789abcdef/${'0'.repeat(64)}`
    const net = network({ [path]: () => new Response('other bytes') })
    const f = storedFetch({ fetch: net.fetch, store: store(), api: API })
    await (await f(path)).text()
    await (await f('/api/v2/o/p/2600_00002v1/0123456789abcdef/missing')).text()
    await settled()
    await f(path)
    await f('/api/v2/o/p/2600_00002v1/0123456789abcdef/missing')
    expect(net.asked).toHaveLength(4)
  })
})

describe('the paper\'s document', () => {
  it('our server first: the last document with a layer kept, from the open\'s answer or a stream\'s frames; out of reach (a rejected fetch, a 5xx), the one kept answered as JSON, the open\'s as its answer', async () => {
    const frame = (d: unknown) => `retry: 1000\nid: 1\ndata: ${JSON.stringify(d)}\n\n`
    const net = network({
      '/api/v2/open': () => new Response(JSON.stringify({ doc: doc(false), follow: '/api/v2/papers/2600_00002v1?f=1' }), { headers: { 'content-type': 'application/json' } }),
      '/api/v2/papers/2600_00002v1': () => new Response(frame(doc(false)) + frame(doc(true)), { headers: { 'content-type': 'text/event-stream' } }),
    })
    const s = store()
    const f = storedFetch({ fetch: net.fetch, store: s, api: API })
    await (await open(f, 1)).json()
    await settled()
    expect(await s.doc({ pv: '2600_00002v1' })).toBeUndefined()
    expect(await (await f('/api/v2/papers/2600_00002v1?f=1', { headers: { accept: 'text/event-stream' } })).text()).toContain('"state":"done"')
    await settled()
    for (const down of ['reject', 503] as const) {
      net.down(down)
      const opened = await open(f, 1)
      expect([opened.status, opened.headers.get('content-type')]).toEqual([200, 'application/json'])
      expect(((await opened.json()) as { doc: { layer: unknown } }).doc.layer).not.toBeNull()
      // (an open that names no version: the version of the id opened last)
      expect(((await (await open(f)).json()) as { doc: { pv: string } }).doc.pv).toBe('2600_00002v1')
      const followed = await f('/api/v2/papers/2600_00002v1?f=1', { headers: { accept: 'text/event-stream' } })
      expect([followed.headers.get('content-type'), ((await followed.json()) as { pv: string }).pv]).toEqual(['application/json', '2600_00002v1'])
    }
  })
  it('out of reach, the open answered from here is an answer the reader reads (format\'s OpenAnswer, through the reader\'s own client): the document kept, not none', async () => {
    const net = network({ '/api/v2/papers/2600_00002v1': () => new Response(JSON.stringify(doc(true)), { headers: { 'content-type': 'application/json' } }) })
    const f = storedFetch({ fetch: net.fetch, store: store(), api: API })
    await (await f('/api/v2/papers/2600_00002v1?f=1')).text()
    await settled()
    for (const down of ['reject', 503] as const) {
      net.down(down)
      const read = await openOf({ fetch: f, paper: { id: '2600.00002', version: 1 }, target: null })
      expect([read.doc?.pv, read.doc?.layer?.catalog.path]).toEqual(['2600_00002v1', doc(true).layer?.catalog.path])
      expect(OpenAnswer.safeParse(await (await open(f, 1)).json()).success).toBe(true)
    }
  })
  it('none kept: the failure as it was; the reader\'s own abort is the reader\'s, nothing answered in its place', async () => {
    const net = network({})
    net.down('reject')
    const f = storedFetch({ fetch: net.fetch, store: store(), api: API })
    await expect(open(f, 1)).rejects.toThrow(TypeError)
    net.down(503)
    expect((await open(f, 1)).status).toBe(503)
    const ac = new AbortController()
    ac.abort()
    const aborting = storedFetch({ fetch: async () => { throw new DOMException('aborted', 'AbortError') }, store: store(), api: API })
    await expect(aborting('/api/v2/papers/2600_00002v1?f=1', { signal: ac.signal })).rejects.toThrow('aborted')
  })
})

describe('the rest', () => {
  it('the faces\' tables asked first and kept, answered from here where our server is out of reach; arXiv never kept', async () => {
    const net = network({ '/static-fonts/index.json': () => new Response('{"schema":1}', { headers: { 'content-type': 'application/json' } }) })
    const arxiv = vi.fn(async () => new Response('%PDF'))
    const f = storedFetch({ fetch: (url, init) => (new URL(url, API).origin === API ? net.fetch(url, init) : arxiv()), store: store(), api: API })
    await (await f('/static-fonts/index.json')).text()
    await (await f('https://arxiv.org/pdf/2600.00002v1')).text()
    await settled()
    net.down('reject')
    expect(await (await f('/static-fonts/index.json')).text()).toBe('{"schema":1}')
    await f('https://arxiv.org/pdf/2600.00002v1')
    expect(arxiv).toHaveBeenCalledTimes(2)
  })
  it('a store that fails is a miss: every ask goes to the network as it would have', async () => {
    const broken = new Proxy({}, { get: () => () => Promise.reject(new Error('the store is broken')) }) as PaperStore
    const body = 'an object'
    const path = `/api/v2/o/p/2600_00002v1/0123456789abcdef/${await sha256(body)}`
    const net = network({ [path]: () => new Response(body) })
    const f = storedFetch({ fetch: net.fetch, store: broken, api: API })
    expect(await (await f(path)).text()).toBe(body)
  })
})
