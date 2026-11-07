// The v2 client's asks, as today's (R session/server.ts `fetched`, `bodyWithin`): each bounded at 30 s, its answer and its body
// together; asked once more after a second where the network fails, a 5xx answers or nothing comes; a second failure our server
// out of reach. An object read within its bound, never by a content-length, held to its digest, fetched once while wanted. The
// follow's and the open's answers read as the session reads them.
import { describe, expect, it } from 'vitest'
import {
  bodyWithin,
  follow,
  object,
  objectStore,
  open,
  REQUEST_MS,
  Refused,
  RETRY_MS,
  request,
} from '../src/session/client.ts'
import type { Doc } from '../src/session/machine.ts'
import { flush, manualTimers } from './helpers/ranged-server.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const sha = async (b: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')
/** an answer that never comes: rejected once its ask is let go */
const never = (init?: RequestInit) =>
  new Promise<Response>((_, reject) =>
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true }),
  )
/** a body that gives `first`, then nothing more until its ask is let go */
const stalled = (first: Uint8Array, init?: RequestInit) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(first)
      init?.signal?.addEventListener('abort', () => c.error(init.signal?.reason), { once: true })
    },
  })
const settle = async (n = 6) => {
  for (let i = 0; i < n; i++) await flush()
}
const DOC = { epoch: 'e', rev: 3, prepare: { state: 'running', why: null, retryAt: null, stage: 'units', units: [] } }

describe('the client: every ask bounded and asked once more', () => {
  it('a network that fails is asked once more after a second; a second failure is our server out of reach', async () => {
    const timers = manualTimers()
    let asks = 0
    const p = request(
      {
        fetch: async () => {
          asks++
          throw new TypeError('network')
        },
        timers,
      },
      '/x',
      {},
      async () => 1,
    )
    p.catch(() => {})
    await settle()
    expect(asks).toBe(1)
    timers.advance(RETRY_MS)
    await expect(p).rejects.toMatchObject({ why: 'network' })
    expect(asks).toBe(2)
  })
  it('a 5xx is asked once more, and the second answer taken', async () => {
    const timers = manualTimers()
    const statuses = [503, 200]
    const p = request(
      { fetch: async () => new Response('ok', { status: statuses.shift() }), timers },
      '/x',
      {},
      async (r) => r.text(),
    )
    await settle()
    timers.advance(RETRY_MS)
    expect(await p).toBe('ok')
  })
  it('nothing within 30 s is let go and asked once more; nothing again is out of reach', async () => {
    const timers = manualTimers()
    let asks = 0
    const p = request(
      {
        fetch: (_u, init) => {
          asks++
          return never(init)
        },
        timers,
      },
      '/x',
      {},
      async () => 1,
    )
    p.catch(() => {})
    await settle()
    timers.advance(REQUEST_MS)
    await settle()
    timers.advance(RETRY_MS)
    await settle()
    expect(asks).toBe(2)
    timers.advance(REQUEST_MS)
    await expect(p).rejects.toMatchObject({ why: 'network' })
  })
  it('a body that stops is bounded with its answer: out of reach at 30 s, not asked again', async () => {
    const timers = manualTimers()
    let asks = 0
    const p = request(
      {
        fetch: async (_u, init) => {
          asks++
          return new Response(stalled(enc('{"a"'), init))
        },
        timers,
      },
      '/x',
      {},
      (r) => bodyWithin(r, 1000),
    )
    p.catch(() => {})
    await settle()
    timers.advance(REQUEST_MS - 1)
    await settle()
    expect(asks).toBe(1)
    timers.advance(1)
    await expect(p).rejects.toMatchObject({ why: 'network' })
    expect(asks).toBe(1)
  })
  it("the caller's abort is the caller's, never asked again", async () => {
    const timers = manualTimers()
    const ac = new AbortController()
    let asks = 0
    const p = request(
      {
        fetch: (_u, init) => {
          asks++
          return never(init)
        },
        timers,
        signal: ac.signal,
      },
      '/x',
      {},
      async () => 1,
    )
    p.catch(() => {})
    ac.abort(new Error('let go'))
    await expect(p).rejects.toThrow('let go')
    timers.advance(RETRY_MS + REQUEST_MS)
    await settle()
    expect(asks).toBe(1)
  })
})

describe('the client: objects', () => {
  it('is read within its bound and held to its digest, whatever a content-length says past a content-encoding', async () => {
    const bytes = enc('0123456789')
    const ref = { path: 'p/x/o', sha256: await sha(bytes), bytes: bytes.length }
    // (an edge that compressed the object says the length it sent)
    const gz = async () => new Response(bytes, { headers: { 'content-encoding': 'gzip', 'content-length': '4' } })
    expect(await object({ fetch: gz }, ref)).toEqual(bytes)
    const longer = async () => new Response(enc('0123456789abc'))
    await expect(object({ fetch: longer }, ref)).rejects.toMatchObject({ why: 'bad' })
    const other = async () => new Response(enc('9876543210'))
    await expect(object({ fetch: other }, ref)).rejects.toMatchObject({ why: 'bad' })
    const gone = async () => new Response('', { status: 404 })
    await expect(object({ fetch: gone }, ref)).rejects.toMatchObject({ why: 'gone' })
  })
  it('each is fetched once while wanted; one that failed is forgotten and asked again', async () => {
    const bytes = enc('abc')
    const ref = { path: 'p/x/o', sha256: await sha(bytes), bytes: 3 }
    let asks = 0,
      fail = true
    const store = objectStore({
      fetch: async () => {
        asks++
        return fail ? new Response('', { status: 404 }) : new Response(bytes)
      },
    })
    await expect(store.of(ref)).rejects.toBeInstanceOf(Refused)
    fail = false
    const [a, b] = await Promise.all([store.of(ref), store.of(ref)])
    expect(a).toEqual(bytes)
    expect(b).toBe(a)
    await store.of(ref)
    expect(asks).toBe(2)
  })
})

describe('the client: the follow and the open', () => {
  const sse = (frames: string[], o: { end?: boolean } = {}) =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          for (const f of frames) c.enqueue(enc(f))
          if (o.end !== false) c.close()
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    )
  it('reads a stream frame by frame, follows again a stream that ends, and polls a JSON answer', async () => {
    const timers = manualTimers()
    const ac = new AbortController()
    const told: number[] = []
    const answers = [
      () => sse([`data: ${JSON.stringify({ ...DOC, rev: 1 })}\n\n`, `data: ${JSON.stringify({ ...DOC, rev: 2 })}\n\n`]),
      () => new Response(JSON.stringify({ ...DOC, rev: 5 }), { headers: { 'content-type': 'application/json' } }),
    ]
    const asked: string[] = []
    const p = follow({
      fetch: async (u) => {
        asked.push(u)
        return (answers.shift() ?? (() => new Response(JSON.stringify({ ...DOC, rev: 9 }))))()
      },
      timers,
      signal: ac.signal,
      paper: { id: '2401.01234', version: 2 },
      target: 'ja',
      onDoc: (d: Doc) => told.push(d.rev),
      pollMs: 2000,
    })
    p.catch(() => {})
    await settle(12)
    expect(told).toEqual([1, 2, 5])
    expect(asked[0]).toBe('/api/v2/papers/2401_01234v2?f=1&t=ja')
    timers.advance(2000)
    await settle(12)
    expect(told).toEqual([1, 2, 5, 9])
    ac.abort()
    await expect(p).rejects.toBeDefined()
  })
  it('tells the stream lost before it asks again, never for a poll', async () => {
    const timers = manualTimers()
    const ac = new AbortController()
    const log: string[] = []
    const answers = [
      () => sse([`data: ${JSON.stringify({ ...DOC, rev: 1 })}\n\n`]),
      () => new Response(JSON.stringify({ ...DOC, rev: 2 }), { headers: { 'content-type': 'application/json' } }),
    ]
    const p = follow({
      fetch: async () => {
        log.push('ask')
        return (answers.shift() ?? (() => new Response(JSON.stringify({ ...DOC, rev: 3 }))))()
      },
      timers,
      signal: ac.signal,
      paper: { id: '2401.01234', version: 2 },
      target: null,
      onDoc: (d: Doc) => log.push(`doc ${d.rev}`),
      onQuiet: () => log.push('quiet'),
      pollMs: 2000,
    })
    p.catch(() => {})
    await settle(12)
    timers.advance(2000)
    await settle(12)
    ac.abort()
    expect(log).toEqual(['ask', 'doc 1', 'quiet', 'ask', 'doc 2', 'ask', 'doc 3'])
  })
  it('a stream silent for 30 s is followed again; two in a row that tell nothing are our server out of reach', async () => {
    const timers = manualTimers()
    let asks = 0
    const p = follow({
      fetch: async () => {
        asks++
        return sse([': beat\n\n'], { end: false })
      },
      timers,
      paper: { id: '2401.01234', version: null },
      target: null,
      onDoc: () => {},
    })
    p.catch(() => {})
    await settle()
    timers.advance(REQUEST_MS)
    await settle()
    timers.advance(RETRY_MS)
    await settle()
    expect(asks).toBe(2)
    timers.advance(REQUEST_MS)
    await expect(p).rejects.toMatchObject({ why: 'network' })
  })
  it("reads a 429's wait, its word and the document it carries; a 404's and a 426's words", async () => {
    const at = (r: Response) =>
      follow({ fetch: async () => r, paper: { id: '2401.01234', version: 1 }, target: null, onDoc: () => {} }).catch(
        (e) => e as Refused,
      )
    const limit = await at(
      new Response(JSON.stringify(DOC), { status: 429, headers: { 'retry-after': '30', 'x-axt-refused': 'quota' } }),
    )
    expect(limit).toMatchObject({ why: 'limit', afterMs: 30_000, doc: { rev: 3 } })
    const busy = await at(new Response('', { status: 429 }))
    expect(busy).toMatchObject({ why: 'busy', afterMs: null, doc: null })
    expect(await at(new Response(JSON.stringify({ error: 'not-found' }), { status: 404 }))).toMatchObject({
      why: 'not-found',
    })
    expect(await at(new Response(JSON.stringify({ error: 'not-opened' }), { status: 404 }))).toMatchObject({
      why: 'not-opened',
    })
    expect(await at(new Response('', { status: 426 }))).toMatchObject({ why: 'update' })
  })
  it('the open: its document, a refusal for capacity with its wait, and its other words', async () => {
    const at = (r: Response) => open({ fetch: async () => r, paper: { id: '2401.01234', version: 1 }, target: 'ja' })
    expect(await at(new Response(JSON.stringify({ doc: DOC })))).toMatchObject({ doc: { rev: 3 } })
    expect(
      await at(new Response(JSON.stringify({ refused: { why: 'quota', retryAfterS: 60 }, doc: DOC }), { status: 429 })),
    ).toMatchObject({ refused: { why: 'quota', afterMs: 60_000 }, doc: { rev: 3 } })
    await expect(at(new Response('', { status: 426 }))).rejects.toMatchObject({ why: 'update' })
    await expect(at(new Response('', { status: 404 }))).rejects.toMatchObject({ why: 'not-found' })
  })
})
