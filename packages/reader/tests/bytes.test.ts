import { chunkDigests } from '@readarxiv/format'
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'
import { composedSource } from '../src/bytes/composed.ts'
import { type RangedLib, openRanged } from '../src/bytes/ranged.ts'
import { RangeRefusal, rangeSource, STALL_MS } from '../src/bytes/source.ts'
import { CHUNK, CHUNKS_IN_FLIGHT, chunkStore } from '../src/bytes/store.ts'
import { bytesOf, expectBytes, flush, manualTimers, rangedServer, type ServedObject } from './helpers/ranged-server.ts'

const A = bytesOf(5 * CHUNK + 1234, 7)
const ADD = bytesOf(2 * CHUNK + 99, 9)
const objects = () =>
  new Map<string, ServedObject>([
    ['/api/v2/o/arxiv/x.pdf', { bytes: A, etag: '"a1"' }],
    ['/api/v2/o/p/x/add-on', { bytes: ADD, etag: '"b2"' }],
    ['https://arxiv.org/pdf/x', { bytes: A, etag: null }],
  ])
const own = (fetch: ReturnType<typeof rangedServer>['fetch'], more = {}) =>
  rangeSource({ fetch, url: '/api/v2/o/arxiv/x.pdf', own: true, store: chunkStore(), ...more })

describe('the byte store and the ranged source', () => {
  it('asks our server a URL a chunk, and a foreign server its own URL with no-store', async () => {
    const s = rangedServer(objects())
    await own(s.fetch).read(0, CHUNK)
    expect(s.asks[0]?.url).toBe(`/api/v2/o/arxiv/x.pdf?r=0-${CHUNK - 1}`)
    const f = rangeSource({ fetch: s.fetch, url: 'https://arxiv.org/pdf/x', own: false })
    expect(await f.read(0, 10)).toEqual(A.slice(0, 10))
    expect(s.asks[1]?.url).toBe('https://arxiv.org/pdf/x')
    expect(s.asks[1]?.init?.cache).toBe('no-store')
  })
  it('learns the length from the first answer and holds every later answer to it', async () => {
    let n = 0
    const s = rangedServer(objects(), () => (n++ === 1 ? { kind: 'length', total: A.length + 1 } : null))
    const src = own(s.fetch)
    await src.read(0, CHUNK)
    expect(src.bound).toEqual({ total: A.length, etag: '"a1"' })
    await expect(src.read(CHUNK, 2 * CHUNK)).rejects.toMatchObject({ kind: 'bytes' })
    // (refused for good: nothing more is asked)
    const asked = s.asks.length
    await expect(src.read(0, CHUNK)).rejects.toBeInstanceOf(RangeRefusal)
    expect(s.asks.length).toBe(asked)
  })
  it('requires a strong entity-tag of our server and refuses another one later', async () => {
    const weak = rangedServer(new Map([['/api/v2/o/arxiv/x.pdf', { bytes: A, etag: 'W/"a1"' }]]))
    await expect(own(weak.fetch).read(0, CHUNK)).rejects.toMatchObject({ kind: 'bytes' })
    let n = 0
    const s = rangedServer(objects(), () => (n++ === 1 ? { kind: 'etag', etag: '"other"' } : null))
    const src = own(s.fetch)
    await src.read(0, CHUNK)
    await expect(src.read(CHUNK, 2 * CHUNK)).rejects.toMatchObject({ kind: 'bytes' })
  })
  it('refuses an answer of other bytes than asked', async () => {
    const s = rangedServer(objects(), () => ({ kind: 'shift' }))
    await expect(own(s.fetch).read(0, CHUNK)).rejects.toMatchObject({ kind: 'bytes' })
  })
  it('shares chunks between reads of one object, one ask a chunk, the asks in flight bounded', async () => {
    const s = rangedServer(objects())
    const src = own(s.fetch)
    await src.read(0, CHUNK)
    const [a, b] = await Promise.all([src.read(CHUNK, 3 * CHUNK), src.read(2 * CHUNK, 4 * CHUNK)])
    expectBytes(a, A.slice(CHUNK, 3 * CHUNK))
    expectBytes(b, A.slice(2 * CHUNK, 4 * CHUNK))
    // chunks 1, 2, 3 asked once each, after chunk 0
    expect(s.asks.map((x) => x.range[0] / CHUNK)).toEqual([0, 1, 2, 3])
    const big = bytesOf(40 * CHUNK, 3)
    let most = 0
    const store = chunkStore()
    const slow = rangedServer(new Map([['/big', { bytes: big, etag: '"g"' }]]))
    const watched: typeof slow.fetch = async (u, i) => {
      most = Math.max(most, store.asking)
      await flush()
      return slow.fetch(u, i)
    }
    const g = rangeSource({ fetch: watched, url: '/big', own: true, store })
    await g.read(0, CHUNK)
    expectBytes(await g.read(CHUNK, 40 * CHUNK), big.slice(CHUNK))
    expect(most).toBeLessThanOrEqual(CHUNKS_IN_FLIGHT)
  })
  it("joins the reads made before the object's length is known on the first one's ask: a file shorter than a chunk, a paper longer (L11 third round, gap 6)", async () => {
    // (the reader's own first read and PDF.js's, both out before the first answer: the website's gateway grants 16 file requests a
    // 33.6 s window, and a file shorter than one chunk was refused as other bytes than asked)
    const SMALL = bytesOf(1800, 5)
    for (const bytes of [SMALL, A]) {
      for (const store of [chunkStore(), null]) {
        const s = rangedServer(new Map([['/api/v2/o/arxiv/x.pdf', { bytes, etag: '"a1"' }]]))
        const refused: string[] = []
        const src = own(s.fetch, { store, refused: (e: RangeRefusal) => refused.push(e.kind) })
        const [a, b] = await Promise.all([src.read(0, CHUNK), src.read(0, CHUNK)])
        const head = bytes.slice(0, Math.min(CHUNK, bytes.length))
        expectBytes(a, head)
        expectBytes(b, head)
        expect([s.asks.length, refused, src.refusal]).toEqual([1, [], null])
      }
    }
    // (a read made once the first answer's head told the length, its body still coming: joined too)
    let send: () => void = () => {}
    const sent = new Promise<void>((r) => {
      send = r
    })
    const base = rangedServer(objects())
    const streaming: typeof base.fetch = async (u, i) => {
      const r = await base.fetch(u, i)
      const body = new Uint8Array(await r.arrayBuffer())
      const stream = new ReadableStream<Uint8Array>({
        async start(c) {
          await sent
          c.enqueue(body)
          c.close()
        },
      })
      return new Response(stream, { status: r.status, headers: r.headers })
    }
    const mid = own(streaming)
    const one = mid.read(0, CHUNK)
    await flush()
    expect(mid.bound?.total).toBe(A.length)
    const two = mid.read(0, CHUNK)
    send()
    expectBytes(await one, A.slice(0, CHUNK))
    expectBytes(await two, A.slice(0, CHUNK))
    expect(base.asks.length).toBe(1)
    // (another range read before the length is known: asked once it is, as any other)
    const s = rangedServer(objects())
    const src = own(s.fetch)
    const [a, b] = await Promise.all([src.read(0, CHUNK), src.read(CHUNK, 2 * CHUNK)])
    expectBytes(a, A.slice(0, CHUNK))
    expectBytes(b, A.slice(CHUNK, 2 * CHUNK))
    expect(s.asks.map((x) => x.range[0] / CHUNK)).toEqual([0, 1])
  })
  it("holds every answer of a read made before the object's length was known to that length: its first answer stalled after its head, asked again", async () => {
    // (the head of the first answer told the length; the read asked again past the end of a file shorter than a chunk, and its
    // answer, the whole file, was refused as other bytes than asked)
    const SMALL = bytesOf(1800, 5)
    const timers = manualTimers()
    let n = 0
    const s = rangedServer(new Map([['/api/v2/o/arxiv/x.pdf', { bytes: SMALL, etag: '"a1"' }]]), () =>
      n++ === 0 ? { kind: 'silent' } : null,
    )
    const src = own(s.fetch, { timers })
    const read = src.read(0, CHUNK)
    await flush()
    await flush()
    timers.advance(STALL_MS)
    expect(await read).toEqual(SMALL)
    expect([s.asks.length, src.refusal]).toEqual([2, null])
  })
  it('lets the least recently read chunks go past its bound', async () => {
    const store = chunkStore(2 * CHUNK)
    const s = rangedServer(objects())
    const src = own(s.fetch, { store })
    await src.read(0, CHUNK)
    await src.read(CHUNK, 3 * CHUNK)
    expect(store.bytes).toBe(2 * CHUNK)
    await src.read(0, CHUNK)
    expect(s.asks.length).toBe(4)
  })
  it('refuses a source whose address has no such object (a 404, a 410) as missing, at once, its owner told', async () => {
    for (const status of [404, 410]) {
      const s = rangedServer(objects(), () => ({ kind: 'status', status }))
      const refused: RangeRefusal[] = []
      const src = own(s.fetch, { refused: (e: RangeRefusal) => refused.push(e) })
      await expect(src.read(0, CHUNK)).rejects.toMatchObject({ kind: 'missing' })
      expect([s.asks.length, refused.map((e) => e.kind)]).toEqual([1, ['missing']])
    }
  })
  it("a 404 or a 410 once bytes of the object were read is the network's, asked again: a flaky answer mid-read recovers", async () => {
    for (const status of [404, 410]) {
      const timers = manualTimers()
      let flaky = 1
      const s = rangedServer(objects(), (a) =>
        a.range[0] === CHUNK && flaky-- > 0 ? { kind: 'status', status } : null,
      )
      const refused: RangeRefusal[] = []
      const src = own(s.fetch, { timers, refused: (e: RangeRefusal) => refused.push(e) })
      expect(await src.read(0, CHUNK)).toEqual(A.slice(0, CHUNK))
      const later = src.read(CHUNK, 2 * CHUNK)
      await flush()
      timers.advance(1000)
      expect(await later).toEqual(A.slice(CHUNK, 2 * CHUNK))
      expect([s.asks.length, refused.map((e) => e.kind), src.refusal]).toEqual([3, [], null])
    }
  })
  it("asks again a read the network failed, then refuses it as the network's", async () => {
    const timers = manualTimers()
    const s = rangedServer(objects(), () => ({ kind: 'status', status: 503 }))
    const refused: RangeRefusal[] = []
    const src = own(s.fetch, { timers, refused: (e: RangeRefusal) => refused.push(e) })
    const read = src.read(0, CHUNK)
    await flush()
    timers.advance(1000)
    await expect(read).rejects.toMatchObject({ kind: 'network' })
    expect(s.asks.length).toBe(2)
    expect(refused.map((e) => e.kind)).toEqual(['network'])
  })
  it('keeps reading for an owner that keeps reading, the pause doubling', async () => {
    const timers = manualTimers()
    let fail = 4
    const s = rangedServer(objects(), () => (fail-- > 0 ? { kind: 'reject' } : null))
    const src = own(s.fetch, { timers, keepReading: () => true })
    const read = src.read(0, CHUNK)
    for (const ms of [1000, 2000, 4000, 8000]) {
      await flush()
      timers.advance(ms)
    }
    expect(await read).toEqual(A.slice(0, CHUNK))
    expect(s.asks.length).toBe(5)
  })
  it('lets a read go where nothing comes for STALL_MS, and asks it again at once', async () => {
    const timers = manualTimers()
    let n = 0
    const s = rangedServer(objects(), () => (n++ === 0 ? { kind: 'silent' } : null))
    const src = own(s.fetch, { timers })
    const read = src.read(0, CHUNK)
    await flush()
    await flush()
    timers.advance(STALL_MS)
    expect(await read).toEqual(A.slice(0, CHUNK))
    expect(s.asks.length).toBe(2)
  })
  it("holds every chunk to the head's digests: those read before, and those read after before they are given", async () => {
    const s = rangedServer(objects())
    const src = own(s.fetch)
    await src.read(0, CHUNK)
    await src.read(CHUNK, 2 * CHUNK)
    expect(src.digested).toEqual({ chunks: 2, proven: 0 })
    expect(await src.prove(chunkDigests(A))).toBe(true)
    expect(src.digested).toEqual({ chunks: 2, proven: 2 })
    await src.read(5 * CHUNK, A.length)
    expect(src.digested.proven).toBe(3)
  })
  it('refuses the source where a chunk is not the one the layer was made over', async () => {
    const other = A.slice()
    other[3 * CHUNK + 5] = (other[3 * CHUNK + 5] as number) ^ 1
    const refused: string[] = []
    const s = rangedServer(new Map([['/api/v2/o/arxiv/x.pdf', { bytes: other, etag: '"a1"' }]]))
    const src = own(s.fetch, { refused: (e: RangeRefusal) => refused.push(e.kind), chunks: chunkDigests(A) })
    await src.read(0, CHUNK)
    await expect(src.read(3 * CHUNK, 4 * CHUNK)).rejects.toMatchObject({ kind: 'digest' })
    expect(refused).toEqual(['digest'])
    // and a chunk read before the head came: found at the proof
    const s2 = rangedServer(new Map([['/api/v2/o/arxiv/x.pdf', { bytes: other, etag: '"a1"' }]]))
    const late = own(s2.fetch)
    await late.read(0, CHUNK)
    await late.read(3 * CHUNK, 4 * CHUNK)
    expect(await late.prove(chunkDigests(A))).toBe(false)
    expect(late.refusal?.kind).toBe('digest')
  })
  it('holds a chunk read again, after the store let it go, to the digest the head names, else to the one first read', async () => {
    // (arXiv's server answers no entity-tag: a chunk asked again is the same object's by its length alone)
    const other = A.slice()
    other[5] = (other[5] as number) ^ 1
    let swap = false
    const foreign = (more = {}) => {
      const refused: string[] = []
      const s = rangedServer(objects(), (a) => (swap && a.range[0] === 0 ? { kind: 'swap', bytes: other } : null))
      const src = rangeSource({
        fetch: s.fetch,
        url: 'https://arxiv.org/pdf/x',
        own: false,
        store: chunkStore(CHUNK),
        refused: (e: RangeRefusal) => refused.push(e.kind),
        ...more,
      })
      return { s, src, refused }
    }
    for (const chunks of [chunkDigests(A), null]) {
      swap = false
      const { s, src, refused } = foreign(chunks ? { chunks } : {})
      expect(await src.read(0, CHUNK)).toEqual(A.slice(0, CHUNK))
      // (chunk 1 read: the store, one chunk large, lets chunk 0 go)
      await src.read(CHUNK, 2 * CHUNK)
      swap = true
      await expect(src.read(0, CHUNK)).rejects.toMatchObject({ kind: 'digest' })
      expect(s.asks.filter((a) => a.range[0] === 0)).toHaveLength(2)
      expect(refused).toEqual(['digest'])
      expect(src.refusal?.kind).toBe('digest')
    }
    // the same bytes asked again are given, and a chunk proven once is counted once
    swap = false
    const { src } = foreign({ chunks: chunkDigests(A) })
    await src.read(0, CHUNK)
    await src.read(CHUNK, 2 * CHUNK)
    expect(await src.read(0, CHUNK)).toEqual(A.slice(0, CHUNK))
    expect(src.digested).toEqual({ chunks: 2, proven: 2 })
  })
  it("holds a foreign server's entity-tag where it answers one, and needs none", async () => {
    const s = rangedServer(new Map([['https://arxiv.org/pdf/x', { bytes: A, etag: 'W/"weak"' }]]))
    const src = rangeSource({ fetch: s.fetch, url: 'https://arxiv.org/pdf/x', own: false, store: chunkStore() })
    await src.read(0, CHUNK)
    expect(src.bound?.etag).toBe('W/"weak"')
  })
  it('lets go: reads in flight and after refused as gone, never told', async () => {
    const refused: string[] = []
    const s = rangedServer(objects(), () => ({ kind: 'silent' }))
    const src = own(s.fetch, { refused: (e: RangeRefusal) => refused.push(e.kind) })
    const read = src.read(0, CHUNK)
    await flush()
    src.abort()
    await expect(read).rejects.toMatchObject({ kind: 'gone' })
    expect(refused).toEqual([])
    expect(src.refusal).toBeNull()
  })
})

describe("the composed document's source", () => {
  it('reads the original then the add-on, a range across the seam split there', async () => {
    const s = rangedServer(objects())
    const a = own(s.fetch)
    const add = rangeSource({ fetch: s.fetch, url: '/api/v2/o/p/x/add-on', own: true })
    const c = composedSource(a, A.length, add, ADD.length)
    expect(c.bound.total).toBe(A.length + ADD.length)
    const whole = new Uint8Array(A.length + ADD.length)
    whole.set(A)
    whole.set(ADD, A.length)
    await a.read(0, CHUNK)
    const k = Math.floor(A.length / CHUNK)
    expect(await c.read(k * CHUNK, (k + 1) * CHUNK)).toEqual(whole.slice(k * CHUNK, (k + 1) * CHUNK))
    expect(await c.read((k + 1) * CHUNK, (k + 2) * CHUNK)).toEqual(whole.slice((k + 1) * CHUNK, (k + 2) * CHUNK))
    const tail = Math.ceil(whole.length / CHUNK) - 1
    expect(await c.read(tail * CHUNK, whole.length)).toEqual(whole.slice(tail * CHUNK))
    // the original's part asked of the original's source, under its own URL and grid
    expect(s.asks.filter((x) => x.path === '/api/v2/o/arxiv/x.pdf').map((x) => x.range)).toEqual([
      [0, CHUNK],
      [k * CHUNK, A.length],
    ])
    // letting the composed source go leaves the original's
    c.abort()
    expect(await a.read(CHUNK, 2 * CHUNK)).toEqual(A.slice(CHUNK, 2 * CHUNK))
  })
})

describe('a ranged open', () => {
  // (each chunk's digest late by a turn of the timer and more, as a loaded machine gives it: crypto.subtle digests off the main
  // thread, and its answer comes when it comes. A wait that counted turns of the timer for a chunk read lost to it once, in a
  // whole run at load 143-194, 2026-11-13: the checks below wait for what they read)
  let slow: MockInstance | null = null
  beforeEach(() => {
    const subtle = globalThis.crypto.subtle
    const digest = subtle.digest.bind(subtle)
    slow = vi.spyOn(subtle, 'digest').mockImplementation(async (algorithm, data) => {
      await new Promise((r) => setTimeout(r, 20))
      return digest(algorithm, data)
    })
  })
  afterEach(() => {
    slow?.mockRestore()
    slow = null
  })
  /** a promise and what settles it: what the stand-in of PDF.js is told, awaited by the check that reads it */
  const told = () => {
    let go: () => void = () => {}
    const p = new Promise<void>((r) => {
      go = r
    })
    return { p, go }
  }
  /** `s`'s fetch, and a wait for its n-th ask to have gone out (an ask is recorded as its fetch is called) */
  const counting = (s: ReturnType<typeof rangedServer>) => {
    const waits: { n: number; go: () => void }[] = []
    const fetch: typeof s.fetch = (u, i) => {
      const p = s.fetch(u, i)
      for (const w of waits.filter((x) => s.asks.length >= x.n)) {
        waits.splice(waits.indexOf(w), 1)
        w.go()
      }
      return p
    }
    const until = (n: number) =>
      s.asks.length >= n ? Promise.resolve() : new Promise<void>((go) => waits.push({ n, go }))
    return { fetch, until }
  }
  /** every read of `src` kept, so that a check of what was told can wait for each to have settled */
  const keepReads = (src: ReturnType<typeof own>) => {
    const reads: Promise<unknown>[] = []
    const read = src.read.bind(src)
    src.read = (b, e) => {
      const p = read(b, e)
      reads.push(p)
      return p
    }
    return reads
  }
  it('gives PDF.js the first chunk, asks the end beside it, and every range whole at its begin, its chunks read one by one', async () => {
    const s = rangedServer(objects())
    const out = counting(s)
    const src = own(out.fetch)
    const given: [number, number][] = []
    let transport: {
      requestDataRange(b: number, e: number): void
      onDataRange(b: number, c: Uint8Array): void
    } | null = null
    let initial: Uint8Array | null = null
    const made = told(),
      gave = told()
    const lib: RangedLib = {
      PDFDataRangeTransport: class {
        constructor(_length: number, data: Uint8Array | null) {
          initial = data
          transport = this
          made.go()
        }
        requestDataRange() {}
        onDataRange(b: number, c: Uint8Array) {
          given.push([b, c.length])
          gave.go()
        }
        abort() {}
      } as unknown as RangedLib['PDFDataRangeTransport'],
      getDocument: () => ({ promise: new Promise(() => {}), destroy: async () => {}, onProgress: null }) as never,
    }
    const t = openRanged(lib, src, { options: {} })
    // (the transport made once the first chunk is read and digested, and the end's two chunks asked)
    await made.p
    await out.until(3)
    expect(initial).toEqual(A.slice(0, CHUNK))
    // chunks 4 and 5, the end, asked beside chunk 0
    expect(s.asks.map((x) => x.range[0] / CHUNK)).toEqual([0, 4, 5])
    ;(transport as unknown as { requestDataRange(b: number, e: number): void }).requestDataRange(2 * CHUNK, 6 * CHUNK)
    await gave.p
    expect(given).toEqual([[2 * CHUNK, A.length - 2 * CHUNK]])
    // the end's chunks taken from the early asks, not asked again
    expect(s.asks.map((x) => x.range[0] / CHUNK)).toEqual([0, 4, 5, 2, 3])
    await t.destroy()
    await expect(t.promise).rejects.toThrow()
  })
  it('tells its owner a range PDF.js asked for that the source refuses, once, so that the page waiting on it fails', async () => {
    let n = 0
    // (the fifth ask answers other bytes: chunks 0, 4, 5 at the open, then 1, then 2)
    const s = rangedServer(objects(), () => (++n === 5 ? { kind: 'shift' } : null))
    const src = own(s.fetch)
    const reads = keepReads(src)
    let transport: { requestDataRange(b: number, e: number): void } | null = null
    let made = told()
    const lib: RangedLib = {
      PDFDataRangeTransport: class {
        constructor() {
          transport = this
          made.go()
        }
        requestDataRange() {}
        onDataRange() {}
        abort() {}
      } as unknown as RangedLib['PDFDataRangeTransport'],
      getDocument: () => ({ promise: new Promise(() => {}), destroy: async () => {}, onProgress: null }) as never,
    }
    const refused: string[] = []
    const refusal = told()
    openRanged(lib, src, {
      options: {},
      refused: (e) => {
        refused.push(e.kind)
        refusal.go()
      },
    })
    await made.p
    const t = transport as unknown as { requestDataRange(b: number, e: number): void }
    t.requestDataRange(CHUNK, 3 * CHUNK)
    t.requestDataRange(3 * CHUNK, 4 * CHUNK)
    // (told, then once: every read settled, and the turn after the last, before the count)
    await refusal.p
    await Promise.allSettled(reads)
    await flush()
    expect(refused).toEqual(['bytes'])
    // (a source let go is no refusal: never told)
    const quiet: string[] = []
    const s2 = rangedServer(objects(), () => null)
    const src2 = own(s2.fetch)
    const reads2 = keepReads(src2)
    made = told()
    openRanged(lib, src2, { options: {}, refused: (e) => quiet.push(e.kind) })
    await made.p
    src2.abort()
    ;(transport as unknown as { requestDataRange(b: number, e: number): void }).requestDataRange(CHUNK, 2 * CHUNK)
    await Promise.allSettled(reads2)
    await flush()
    expect(quiet).toEqual([])
  })
})
