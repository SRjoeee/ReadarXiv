import { chunkDigests } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { composedSource } from '../src/bytes/composed.ts'
import { type RangedLib, openRanged } from '../src/bytes/ranged.ts'
import { RangeRefusal, rangeSource, STALL_MS } from '../src/bytes/source.ts'
import { CHUNK, CHUNKS_IN_FLIGHT, chunkStore } from '../src/bytes/store.ts'
import { bytesOf, flush, manualTimers, rangedServer, type ServedObject } from './helpers/ranged-server.ts'

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
    expect(a).toEqual(A.slice(CHUNK, 3 * CHUNK))
    expect(b).toEqual(A.slice(2 * CHUNK, 4 * CHUNK))
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
    expect(await g.read(CHUNK, 40 * CHUNK)).toEqual(big.slice(CHUNK))
    expect(most).toBeLessThanOrEqual(CHUNKS_IN_FLIGHT)
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
  it('gives PDF.js the first chunk, asks the end beside it, and every range a chunk at a time', async () => {
    const s = rangedServer(objects())
    const src = own(s.fetch)
    const given: [number, number][] = []
    let transport: {
      requestDataRange(b: number, e: number): void
      onDataRange(b: number, c: Uint8Array): void
    } | null = null
    let initial: Uint8Array | null = null
    const lib: RangedLib = {
      PDFDataRangeTransport: class {
        constructor(_length: number, data: Uint8Array | null) {
          initial = data
          transport = this
        }
        requestDataRange() {}
        onDataRange(b: number, c: Uint8Array) {
          given.push([b, c.length])
        }
        abort() {}
      } as unknown as RangedLib['PDFDataRangeTransport'],
      getDocument: () => ({ promise: new Promise(() => {}), destroy: async () => {}, onProgress: null }) as never,
    }
    const t = openRanged(lib, src, { options: {} })
    await flush()
    await flush()
    expect(initial).toEqual(A.slice(0, CHUNK))
    // chunks 4 and 5, the end, asked beside chunk 0
    expect(s.asks.map((x) => x.range[0] / CHUNK)).toEqual([0, 4, 5])
    ;(transport as unknown as { requestDataRange(b: number, e: number): void }).requestDataRange(2 * CHUNK, 6 * CHUNK)
    for (let i = 0; i < 6; i++) await flush()
    expect(given.map(([b]) => b / CHUNK).sort()).toEqual([2, 3, 4, 5])
    // the end's chunks taken from the early asks, not asked again
    expect(s.asks.map((x) => x.range[0] / CHUNK)).toEqual([0, 4, 5, 2, 3])
    await t.destroy()
    await expect(t.promise).rejects.toThrow()
  })
})
