// Our base page read by ranges (session/ranges.ts; the layer route, design §3.2): every answer held to the base's length and the
// entity-tag (given, or the first answer's), a range across the seam split there, no read waiting for ever, PDF.js given the bytes
// through its range transport
import { afterEach, describe, expect, it, vi } from 'vitest'
import { composedRange, lengthBound, openRanged, RangeRefusal, rangeSource, RANGE_CHUNK, RETRY_MS, STALL_MS } from '@/pdf-reader/session/ranges'

const URL_OURS = `https://readarxiv.com/api/v1/base/2608.04322v1/${'ab'.repeat(32)}`
const TAG = '"5bf5251f12d575b58ced19bb84971986"'
const FILE = Uint8Array.from({ length: 300 }, (_, i) => i % 251)
const bound = { total: FILE.length, etag: TAG }
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

type Call = { url: string; init: RequestInit }
/** a server of `file` by ranges: 206s of exactly the bytes asked, its length and `tag`; `answer` overrides an ask */
function serving(file: Uint8Array = FILE, o: { tag?: string; answer?: (begin: number, end: number, n: number) => Response | Promise<Response> | null } = {}) {
  const calls: Call[] = []
  const answer = async (init: RequestInit, n: number): Promise<Response> => {
    const m = /^bytes=(\d+)-(\d+)$/.exec((init.headers as Record<string, string>)?.range ?? '')
    if (!m) return new Response(file as BodyInit, { status: 200 })
    const begin = Number(m[1]), end = Math.min(Number(m[2]) + 1, file.length)
    const over = o.answer?.(begin, end, n)
    if (over) return over
    return new Response(file.slice(begin, end) as BodyInit, { status: 206, headers: { 'content-range': `bytes ${begin}-${end - 1}/${file.length}`, etag: o.tag ?? TAG } })
  }
  // (as a fetch does: an abort of its signal rejects it, answered or not)
  const f = vi.fn((url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    const answered = answer(init, calls.length)
    return new Promise<Response>((resolve, reject) => {
      if (init.signal?.aborted) return reject(new DOMException('aborted', 'AbortError'))
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      answered.then(resolve, reject)
    })
  })
  return { f: f as unknown as typeof fetch, calls }
}
const ranged = (begin: number, end: number, total: number, tag: string, body: Uint8Array = FILE.slice(begin, end)) => new Response(body as BodyInit, { status: 206, headers: { 'content-range': `bytes ${begin}-${end - 1}/${total}`, etag: tag } })

describe('a range source bound by a length alone (a base of ours: the address names the digest of its bytes, no route names a tag)', () => {
  it('lengthBound: the base\'s bytes as a bound with no tag, none for a length that is none', () => {
    expect(lengthBound(300)).toEqual({ total: 300, etag: null })
    for (const bytes of [0, -1, 1.5, Number.NaN, '300', null, undefined]) expect(lengthBound(bytes), String(bytes)).toBeNull()
  })

  it('the first answer\'s strong tag is learnt and held for every answer after; the length is held from the first', async () => {
    const s = serving()
    const src = rangeSource(URL_OURS, lengthBound(FILE.length) as never, { fetch: s.f })
    expect([...(await src.read(0, 10))]).toEqual([...FILE.slice(0, 10)])
    expect([...(await src.read(10, 20))]).toEqual([...FILE.slice(10, 20)])
    expect(s.calls).toHaveLength(2)
    // a later answer of another tag, or another length: the source is refused whole, every read after it unasked
    for (const [what, answer] of [['another tag', () => ranged(20, 30, FILE.length, '"other"')], ['another length', () => ranged(20, 30, FILE.length + 1, TAG)]] as const) {
      const t = serving(FILE, { answer: (_b, _e, n) => (n >= 2 ? answer() : null) })
      const held = rangeSource(URL_OURS, lengthBound(FILE.length) as never, { fetch: t.f })
      await held.read(0, 10)
      const e = await held.read(20, 30).catch(x => x)
      expect([e instanceof RangeRefusal, (e as RangeRefusal).kind], what).toEqual([true, 'bytes'])
      const asked = t.calls.length
      await expect(held.read(0, 5), what).rejects.toBeInstanceOf(RangeRefusal)
      expect(t.calls, what).toHaveLength(asked)
    }
  })

  it('a first answer with no tag, or a weak one, refuses the source: there would be nothing to hold the rest to', async () => {
    for (const tag of ['W/"w"', 'nothing-quoted']) {
      const s = serving(FILE, { tag })
      const src = rangeSource(URL_OURS, lengthBound(FILE.length) as never, { fetch: s.f })
      const e = await src.read(0, 10).catch(x => x)
      expect([e instanceof RangeRefusal, (e as RangeRefusal).kind], tag).toEqual([true, 'bytes'])
    }
  })

  it('a range past the base\'s length is no range of it, and nothing is asked', async () => {
    const s = serving()
    const src = rangeSource(URL_OURS, lengthBound(FILE.length) as never, { fetch: s.f })
    await expect(src.read(290, 301)).rejects.toBeInstanceOf(RangeRefusal)
    expect(s.calls).toHaveLength(0)
  })

  it('PDF.js opens the base over its length alone, the tail after its last byte; a later range of another tag is never given to it', async () => {
    const big = Uint8Array.from({ length: RANGE_CHUNK + 100 }, (_, i) => i % 7)
    const s = serving(big, { answer: (b, e, n) => (n >= 3 ? ranged(b, e, big.length, '"other"', big.slice(b, e)) : null) })
    const given: [number, Uint8Array][] = []
    class PDFDataRangeTransport {
      constructor(readonly length: number, readonly initialData: Uint8Array) {}
      requestDataRange(_b: number, _e: number) {}
      onDataRange(b: number, chunk: Uint8Array) { given.push([b, chunk]) }
      abort() {}
    }
    const params: Record<string, unknown>[] = []
    const getDocument = vi.fn((p: Record<string, unknown>) => { params.push(p); return { promise: Promise.resolve({ numPages: 1 }), destroy: vi.fn(async () => {}), onProgress: null } })
    const tail = Uint8Array.from([1, 2, 3])
    const task = openRanged({ getDocument, PDFDataRangeTransport } as never, URL_OURS, { bound: lengthBound(big.length) as never, tail, options: {}, fetch: s.f })
    await task.promise
    const p = params[0] as { range: PDFDataRangeTransport & { requestDataRange(b: number, e: number): void } }
    expect(p.range.length).toBe(big.length + 3)
    expect([...p.range.initialData]).toEqual([...big.slice(0, RANGE_CHUNK)])
    p.range.requestDataRange(RANGE_CHUNK, big.length + 3)
    await vi.waitFor(() => expect(given).toHaveLength(1))
    expect([...(given[0]?.[1] ?? [])]).toEqual([...big.slice(RANGE_CHUNK), 1, 2, 3])
    // the third answer names another tag: refused, and the document is given nothing of it
    p.range.requestDataRange(0, 100)
    await new Promise(r => setTimeout(r, 50))
    expect(given).toHaveLength(1)
  })
})

describe('a range source: every answer held to the base', () => {
  it('reads exactly the bytes asked; a request carries a range alone, no credentials, no referrer', async () => {
    const s = serving()
    const src = rangeSource(URL_OURS, bound, { fetch: s.f })
    expect([...(await src.read(10, 20))]).toEqual([...FILE.slice(10, 20)])
    expect(s.calls).toHaveLength(1)
    expect(s.calls[0]?.url).toBe(URL_OURS)
    expect(s.calls[0]?.init.headers).toEqual({ range: 'bytes=10-19' })
    expect(s.calls[0]?.init.credentials).toBe('omit')
    expect(s.calls[0]?.init.referrerPolicy).toBe('no-referrer')
  })

  it('an answer that is not the object refuses the source: another tag, another length, other bytes than asked, a 200, more bytes than asked; every read after it refused unasked', async () => {
    const answers: [string, () => Response][] = [
      ['another tag', () => ranged(10, 20, FILE.length, '"other"')],
      ['another length', () => ranged(10, 20, FILE.length + 1, TAG)],
      ['other bytes', () => ranged(11, 21, FILE.length, TAG)],
      ['a 200', () => new Response(FILE as BodyInit, { status: 200 })],
      ['a weak tag', () => ranged(10, 20, FILE.length, `W/${TAG}`)],
      ['more than asked', () => ranged(10, 20, FILE.length, TAG, FILE.slice(10, 25))],
    ]
    for (const [what, answer] of answers) {
      const s = serving(FILE, { answer: () => answer() })
      const refused = vi.fn()
      const src = rangeSource(URL_OURS, bound, { fetch: s.f, refused })
      const e = await src.read(10, 20).catch(x => x)
      expect(e, what).toBeInstanceOf(RangeRefusal)
      expect((e as RangeRefusal).kind, what).toBe('bytes')
      expect(refused, what).toHaveBeenCalledTimes(1)
      const asked = s.calls.length
      await expect(src.read(0, 5), what).rejects.toBeInstanceOf(RangeRefusal)
      expect(s.calls.length, what).toBe(asked)
    }
    // a range past the object is no range of it, and nothing is asked
    const s = serving()
    await expect(rangeSource(URL_OURS, bound, { fetch: s.f }).read(290, 301)).rejects.toBeInstanceOf(RangeRefusal)
    expect(s.calls).toEqual([])
  })

  it('a 5xx, a body cut short, a network failure: asked once more after a pause; twice, the network\'s refusal; kept reading, asked on', async () => {
    vi.useFakeTimers()
    const once = serving(FILE, { answer: (_b, _e, n) => (n === 1 ? new Response('', { status: 503 }) : null) })
    const read = rangeSource(URL_OURS, bound, { fetch: once.f }).read(0, 10)
    await vi.advanceTimersByTimeAsync(RETRY_MS)
    expect([...(await read)]).toEqual([...FILE.slice(0, 10)])
    expect(once.calls).toHaveLength(2)
    const cut = serving(FILE, { answer: (b, e) => ranged(b, e, FILE.length, TAG, FILE.slice(b, e - 1)) })
    const twice = rangeSource(URL_OURS, bound, { fetch: cut.f }).read(0, 10).catch(x => x)
    await vi.advanceTimersByTimeAsync(RETRY_MS)
    const e = await twice
    expect(e).toBeInstanceOf(RangeRefusal)
    expect((e as RangeRefusal).kind).toBe('network')
    expect(cut.calls).toHaveLength(2)
    let n = 0
    const down = vi.fn(async () => { if (n++ < 4) throw new TypeError('Failed to fetch'); return ranged(0, 10, FILE.length, TAG) })
    const kept = rangeSource(URL_OURS, bound, { fetch: down as unknown as typeof fetch, keepReading: () => true }).read(0, 10)
    await vi.advanceTimersByTimeAsync(RETRY_MS * (1 + 2 + 4 + 8))
    expect([...(await kept)]).toEqual([...FILE.slice(0, 10)])
    expect(down).toHaveBeenCalledTimes(5)
  })

  it('a read with nothing from the server for STALL_MS is let go and asked again', async () => {
    vi.useFakeTimers()
    // (the first ask's answer never comes: the stall's abort is what lets it go)
    const s = serving(FILE, { answer: (_b, _e, n) => (n === 1 ? new Promise<Response>(() => {}) : null) })
    const read = rangeSource(URL_OURS, bound, { fetch: s.f }).read(0, 10)
    await vi.advanceTimersByTimeAsync(STALL_MS - 1)
    expect(s.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1 + RETRY_MS)
    expect([...(await read)]).toEqual([...FILE.slice(0, 10)])
    expect(s.calls).toHaveLength(2)
  })

  it('let go by its owner: reads in flight and after refused as gone, nothing told', async () => {
    const ac = new AbortController(), refused = vi.fn()
    const s = serving(FILE, { answer: () => new Promise<Response>(() => {}) })
    const src = rangeSource(URL_OURS, bound, { fetch: s.f, signal: ac.signal, refused })
    const read = src.read(0, 10).catch(x => x)
    ac.abort()
    expect(((await read) as RangeRefusal).kind).toBe('gone')
    expect(refused).not.toHaveBeenCalled()
  })
})

describe('the composed bytes: our copy, then the tails', () => {
  it('a range across the seam is split there: the copy\'s part asked, the tail\'s given', async () => {
    const s = serving()
    const src = rangeSource(URL_OURS, bound, { fetch: s.f })
    const tail = Uint8Array.from([7, 7, 7, 7])
    expect([...(await composedRange(src, 300, tail, 296, 302))]).toEqual([...FILE.slice(296, 300), 7, 7])
    expect([...(await composedRange(src, 300, tail, 301, 304))]).toEqual([7, 7, 7])
    expect(s.calls.map(c => (c.init.headers as Record<string, string>).range)).toEqual(['bytes=296-299'])
  })

  it('PDF.js opens it by its range transport: the first chunk as its initial data, each range it asks given back, the options kept', async () => {
    const big = Uint8Array.from({ length: RANGE_CHUNK + 100 }, (_, i) => i % 7)
    const s = serving(big)
    const given: [number, Uint8Array][] = []
    class PDFDataRangeTransport {
      constructor(readonly length: number, readonly initialData: Uint8Array) {}
      requestDataRange(_b: number, _e: number) {}
      onDataRange(b: number, chunk: Uint8Array) { given.push([b, chunk]) }
      abort() {}
    }
    const params: Record<string, unknown>[] = []
    const getDocument = vi.fn((p: Record<string, unknown>) => { params.push(p); return { promise: Promise.resolve({ numPages: 1 }), destroy: vi.fn(async () => {}), onProgress: null } })
    const tail = Uint8Array.from([1, 2, 3])
    const task = openRanged({ getDocument, PDFDataRangeTransport } as never, URL_OURS, { bound: { total: big.length, etag: TAG }, tail, options: { cMapPacked: true, disableAutoFetch: true }, fetch: s.f })
    await task.promise
    const p = params[0] as { range: PDFDataRangeTransport & { requestDataRange(b: number, e: number): void }; rangeChunkSize: number; disableStream: boolean; cMapPacked: boolean; disableAutoFetch: boolean }
    expect(p.range.length).toBe(big.length + 3)
    expect([...p.range.initialData]).toEqual([...big.slice(0, RANGE_CHUNK)])
    expect([p.rangeChunkSize, p.disableStream, p.cMapPacked, p.disableAutoFetch]).toEqual([RANGE_CHUNK, true, true, true])
    p.range.requestDataRange(RANGE_CHUNK, big.length + 3)
    await vi.waitFor(() => expect(given).toHaveLength(1))
    expect([...(given[0]?.[1] ?? [])]).toEqual([...big.slice(RANGE_CHUNK), 1, 2, 3])
  })

  it('a refusal before the document opens rejects it; PDF.js is never given a byte of it', async () => {
    const s = serving(FILE, { tag: '"another"' })
    const getDocument = vi.fn()
    const task = openRanged({ getDocument, PDFDataRangeTransport: class {} } as never, URL_OURS, { bound, options: {}, fetch: s.f })
    await expect(task.promise).rejects.toBeInstanceOf(RangeRefusal)
    expect(getDocument).not.toHaveBeenCalled()
  })
})
