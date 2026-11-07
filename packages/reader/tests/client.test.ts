// The v2 client's asks, as today's (R session/server.ts `fetched`, `bodyWithin`): each bounded at 30 s, its answer and its body
// together; asked once more after a second where the network fails, a 5xx answers or nothing comes; a second failure our server
// out of reach. An object read within its bound, never by a content-length, held to its digest, fetched once while wanted. The
// follow's and the open's answers read as the session reads them; the follow at our server's pace, counted over minutes against a
// stand-in of its paper object, and one follow for a visit whatever the session's state does.
import type { Head } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { DEFAULTS } from '../src/prefs.ts'
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
import { type Doc, type Input, init, type Ref, type Ticket } from '../src/session/machine.ts'
import { createRuntime, type Handlers } from '../src/session/runtime.ts'
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
const CATALOG: Ref = { path: 'p/1706_03762v7/x/catalog', sha256: 'c'.repeat(64), bytes: 1 }

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
  it('reads a stream frame by frame, follows again a stream that ends a second on, and polls a JSON answer', async () => {
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
    expect(told).toEqual([1, 2])
    expect(asked[0]).toBe('/api/v2/papers/2401_01234v2?f=1&t=ja')
    timers.advance(RETRY_MS)
    await settle(12)
    expect(told).toEqual([1, 2, 5])
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
    timers.advance(RETRY_MS)
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

/**
 * Our server's follow as its paper object answers it (worker v2 paper.ts `fetch`, `#tell`, contract.ts `frameOf`): a stream
 * whose first frame names `retry: 1000` while something runs for the view and `retry: 60000` when nothing does; a document in
 * which nothing runs is its stream's last frame; a beat every 15 s. The document runs until `doneAt` (ms on `timers`), then is
 * done. Past `cap` asks it answers nothing more, so that a follow that asks without end is counted, not run for ever
 */
function paperObject(
  timers: ReturnType<typeof manualTimers>,
  o: { doneAt: number; target: string; units?: Ref[]; cap?: number },
) {
  const at: number[] = []
  const units = o.units ?? []
  const running = {
    ...DOC,
    rev: 1,
    prepare: { ...DOC.prepare, units },
    targets: { [o.target]: { state: 'running', rows: [], done: 0, total: 9 } },
  }
  const done = {
    ...DOC,
    rev: 2,
    prepare: { ...DOC.prepare, state: 'done', stage: null, units },
    layer: { catalog: CATALOG, units, format: 1 },
    targets: { [o.target]: { state: 'done', rows: [], done: 9, total: 9 } },
  }
  const frame = (d: unknown, retry: number | null) =>
    enc(`${retry === null ? '' : `retry: ${retry}\n`}id: ${(d as Doc).rev}\ndata: ${JSON.stringify(d)}\n\n`)
  const fetch = async (_u: string, init?: RequestInit) => {
    if (at.length >= (o.cap ?? 2000)) return never(init)
    at.push(timers.now)
    const terminal = timers.now >= o.doneAt
    return new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(frame(terminal ? done : running, terminal ? 60_000 : 1000))
          if (terminal) return c.close()
          const beat = () => {
            c.enqueue(enc(': beat\n\n'))
            beats = timers.later(beat, 15_000)
          }
          let beats = timers.later(beat, 15_000)
          timers.later(() => {
            timers.clear(beats)
            c.enqueue(frame(done, null))
            c.close()
          }, o.doneAt - timers.now)
        },
      }),
      { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } },
    )
  }
  return { fetch, at }
}
/** the time moved on by `ms` a second at a time, what each second settles settled */
const run = async (timers: ReturnType<typeof manualTimers>, ms: number) => {
  for (let t = 0; t < ms; t += 1000) {
    timers.advance(1000)
    await settle()
  }
}

describe("the client: the follow's pace (staging, 2026-11-07: a done paper followed 30-50 times a second)", () => {
  it("a document in which nothing runs is its stream's last frame: asked again after the server's retry, a minute, never at once", async () => {
    const timers = manualTimers()
    const server = paperObject(timers, { doneAt: 90_000, target: 'zh' })
    const ac = new AbortController()
    const told: number[] = []
    let quiet = 0
    const p = follow({
      fetch: server.fetch,
      timers,
      signal: ac.signal,
      paper: { id: '1706.03762', version: 7 },
      target: 'zh',
      onDoc: (d: Doc) => told.push(d.rev),
      onQuiet: () => quiet++,
    })
    p.catch(() => {})
    await settle()
    // ten minutes: the run's one stream for its 90 s, then the done document once a minute
    await run(timers, 600_000)
    ac.abort()
    expect(server.at.length).toBeLessThanOrEqual(11)
    expect(server.at.slice(0, 3)).toEqual([0, 90_000 + 60_000, 90_000 + 120_000])
    // (a stream that ends as the server ends it, after a document in which nothing runs, is not lost: nothing "reconnecting")
    expect(quiet).toBe(0)
    expect(told.slice(0, 2)).toEqual([1, 2])
  })
  it('a JSON answer in which nothing runs is polled once a minute, one in which something runs every pollMs', async () => {
    const timers = manualTimers()
    const at: number[] = []
    const ac = new AbortController()
    const json = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'content-type': 'application/json' } })
    const p = follow({
      fetch: async (_u, init) => {
        if (at.length >= 50) return never(init)
        at.push(timers.now)
        return json(timers.now < 4000 ? DOC : { ...DOC, rev: 4, prepare: { ...DOC.prepare, state: 'done' } })
      },
      timers,
      signal: ac.signal,
      paper: { id: '2401.01234', version: 2 },
      target: null,
      onDoc: () => {},
      pollMs: 2000,
    })
    p.catch(() => {})
    await settle()
    await run(timers, 180_000)
    ac.abort()
    expect(at).toEqual([0, 2000, 4000, 64_000, 124_000])
  })
  it('a reconnection time our server names past a second is kept, from stream to stream, while something runs', async () => {
    const timers = manualTimers()
    const at: number[] = []
    const ac = new AbortController()
    const p = follow({
      fetch: async (_u, init) => {
        // (past fifty asks, nothing more: a follow that never waits is counted, not run for ever)
        if (at.length >= 50) return never(init)
        at.push(timers.now)
        const frame =
          at.length === 1 ? `retry: 5000\ndata: ${JSON.stringify(DOC)}\n\n` : `data: ${JSON.stringify(DOC)}\n\n`
        return new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(enc(frame))
              c.close()
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        )
      },
      timers,
      signal: ac.signal,
      paper: { id: '2401.01234', version: 2 },
      target: null,
      onDoc: () => {},
    })
    p.catch(() => {})
    await settle()
    await run(timers, 12_000)
    ac.abort()
    expect(at).toEqual([0, 5000, 10_000])
  })
  it('through the session: one follow for the visit whatever the state does, at its pace; a new one for a new target alone', async () => {
    const timers = manualTimers()
    const paper = { id: '1706.03762', version: 7 }
    const server = paperObject(timers, {
      doneAt: 90_000,
      target: 'zh',
      units: [{ ...CATALOG, sha256: 'b'.repeat(64) }],
    })
    const acquired: string[] = []
    const emits = new Map<Ticket, (x: Input) => void>()
    const inert = (slot: string) => (_spec: unknown, t: Ticket, emit: (x: Input) => void) => {
      acquired.push(slot)
      emits.set(t, emit)
      return undefined
    }
    const handlers = {
      ...Object.fromEntries(['original', 'open', 'code', 'composed', 'rows', 'html'].map((s) => [s, inert(s)])),
      timer: (spec: { at: number }, t: Ticket, emit: (x: Input) => void) => {
        const id = timers.later(() => emit({ i: 'time', t, now: timers.now }), Math.max(0, spec.at - timers.now))
        return () => timers.clear(id)
      },
      // (the reader's own link: reader.ts handlers.link, over the stand-in of our server's paper object)
      link: (spec: { target: string | null }, t: Ticket, emit: (x: Input) => void, signal: AbortSignal) => {
        acquired.push('link')
        follow({
          fetch: server.fetch,
          timers,
          signal,
          paper,
          target: spec.target,
          onDoc: (doc) => emit({ i: 'paper', t, doc }),
          onQuiet: () => emit({ i: 'link.quiet', t }),
        }).catch((e) => {
          if (!signal.aborted) emit({ i: 'follow.lost', t, why: e instanceof Refused ? e.why : 'network' })
        })
        return undefined
      },
    } as unknown as Handlers
    const crashes: unknown[] = []
    const rt = createRuntime({
      state: init({
        paper,
        here: false,
        defaults: { ...DEFAULTS, target: 'zh' },
        visit: { target: 'zh' },
        now: 0,
        visible: true,
        online: true,
      }),
      handlers,
      effect() {},
      crash: (e) => crashes.push(e),
      check: true,
      now: () => timers.now,
    })
    const tell = (slot: string, x: (t: Ticket) => Input) => {
      const t = [...rt.live].find(([, s]) => s === slot)?.[0] as Ticket
      emits.get(t)?.(x(t))
    }
    await settle()
    tell('original', (t) => ({ i: 'original.opened', t, pages: 4, bytes: 9 }))
    rt.input({ i: 'panes.drawn' })
    await run(timers, 100_000)
    expect(rt.state.layer.s).toBe('ready')
    // the website's session meanwhile (staging's: the layer ready, the rows complete, the host's hold, a preference)
    const head = {
      format: 1,
      paper: { id: paper.id, version: 7, pages: 4 },
      original: { bytes: 9, sha256: 'o'.repeat(64), chunk: 65536, chunks: '' },
      addOn: { digest: 'd'.repeat(64), bytes: 10 },
      units: [],
      parts: [],
    } as unknown as Head
    tell('code', (t) => ({ i: 'code.loaded', t }))
    rt.input({ i: 'head', digest: CATALOG.sha256, head })
    tell('composed', (t) => ({ i: 'composed.opened', t }))
    tell('rows', (t) => ({ i: 'rows.end', t, got: 9, total: 9, lost: 0 }))
    rt.input({ i: 'cmd.hold', on: true })
    rt.input({ i: 'cmd.hold', on: false })
    rt.input({ i: 'panes.laid', laid: 4, total: 4 })
    rt.input({ i: 'prefs.landed', value: { ...DEFAULTS, target: 'zh' } })
    rt.input({ i: 'cmd.set', prefs: { dim: false } })
    rt.input({ i: 'env.visible', on: true })
    rt.input({ i: 'env.online', on: true })
    rt.input({ i: 'paper.title', title: 'Attention Is All You Need' })
    await run(timers, 500_000)
    expect(rt.state).toMatchObject({ layer: { s: 'ready', open: true }, rows: { s: 'complete' }, link: { s: 'on' } })
    expect(rt.state.link).toMatchObject({ lost: false })
    // ten minutes: one follow, asked once for the run and once a minute after it
    expect(acquired.filter((s) => s === 'link')).toHaveLength(1)
    expect(server.at.length).toBeLessThanOrEqual(11)
    // (a new target is what is followed changed: the one new follow)
    rt.input({ i: 'cmd.set', prefs: { target: 'ja' } })
    await settle()
    expect(acquired.filter((s) => s === 'link')).toHaveLength(2)
    expect(crashes).toEqual([])
    await rt.dispose()
  })
})
