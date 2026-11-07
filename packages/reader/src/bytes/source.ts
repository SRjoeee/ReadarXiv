// An object read by ranges through the host's fetch (interfaces/host DECISION: one implementation, from the website's
// `rangeSource`, readarxiv-web web/src/ranges.ts at 0bf496b5): every answer held to the object's length and validator, a read
// bounded by its progress and never by its length, and, for arXiv's PDF, every whole chunk held to the digest the layer's head
// names for it.
//
// - **Bound.** A 206 of exactly the bytes asked; its Content-Range's length the object's (given, or the first answer's and held
//   after). On our server (`own`) a strong entity-tag is required and held (R2's httpEtag). Elsewhere (arXiv's own server, the
//   extension's left) an entity-tag, where one is answered, is held for every answer after; none is required, since whether
//   arXiv answers one is stage 5's measurement (host DECISION, open 1) and the chunks' digests hold the bytes once the head is in.
// - **One URL a chunk on our server.** Chromium lets one request at a time write a URL's HTTP-cache entry, so that the ranges of
//   one URL were read one after the other (8 chunks: 1.3 to 1.5 s against 0.35 to 0.5 s a URL each, W ranges.ts:478-488); our
//   server reads the path alone. arXiv's URL is asked as it is, with `cache: 'no-store'` (unverified, host design-a §1.5).
// - **Digests.** The head carries each 64 KiB chunk's digest of the original the layer was made over (format's `chunkDigests`).
//   Every whole chunk fetched is digested as it comes, a chunk the store let go and fetched again too; once the digests are known
//   (`prove`), every chunk read before is compared, and every chunk after is compared before it is given; before they are known,
//   a chunk fetched again is compared with its first reading (a server that answers no entity-tag may answer other bytes of the
//   same length). One that disagrees refuses the source (`digest`): the session then reads our copy for both panes.
// - **Progress.** A read is let go where nothing comes for STALL_MS (no answer, or no byte of its body) and asked again at once;
//   one the network fails at once is asked again after a pause (1 s, doubling to 30 s; while the browser says it is offline,
//   until it says it is online). RANGE_TRIES failures refuse the source as the network's, unless its owner keeps reading (the
//   left, once its document is open). An answer that is not the object refuses it at once (`bytes`).
import { toBase64Url, sha256 } from '@readarxiv/format'
import { CHUNK, type ChunkStore } from './store.ts'

/** how long a read may go with nothing from the server before it is taken for stalled (W ranges.ts:16-29: a live link's silences
 *  are its round trip, a lossy one's TCP's backoff, 6.2 to 7 s; the one stall measured that came back lasted 9.5 s) */
export const STALL_MS = 10_000
/** how many times a range is asked, at most, where the network fails it, but by an owner that keeps reading */
export const RANGE_TRIES = 2
/** the pause before a read the network failed at once is asked again, doubled at each failure, to RETRY_MAX_MS */
export const RETRY_MS = 1_000
export const RETRY_MAX_MS = 30_000

/** why a source is refused: no such object at its address (`missing`: a 404 or a 410 before any byte of it was read, the
 *  paper not there; one after is the network's), its answers not the object (`bytes`), a chunk not the one the head names,
 *  or before the head not the one first read (`digest`), the network failing its reads (`network`), or the source let go by
 *  its owner (`gone`: never told) */
export type RefusalKind = 'missing' | 'bytes' | 'digest' | 'network' | 'gone'
export class RangeRefusal extends Error {
  readonly kind: RefusalKind
  readonly why: string
  constructor(kind: RefusalKind, why: string) {
    super(`the object is not read: ${why}`)
    this.name = 'RangeRefusal'
    this.kind = kind
    this.why = why
  }
}
class Stalled extends Error {}

/** what every answer of a source is of: the object's length and its entity-tag (null: not known yet, or none answered) */
export interface Bound {
  total: number
  etag: string | null
}

/** the browser's word on being online, and a wait for it (the reader's Env; the document's by default) */
export interface Online {
  now(): boolean
  /** resolves once the browser says it is online, or `signal` aborts */
  wait(signal: AbortSignal): Promise<void>
}
export interface Timers {
  later(f: () => void, ms: number): unknown
  clear(id: unknown): void
}
export const realTimers: Timers = {
  later: (f, ms) => setTimeout(f, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
}
export const browserOnline: Online = {
  now: () => (globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine !== false,
  wait: (signal) =>
    new Promise<void>((resolve) => {
      const g = globalThis as {
        addEventListener?: (t: string, f: () => void) => void
        removeEventListener?: (t: string, f: () => void) => void
      }
      const done = () => {
        g.removeEventListener?.('online', done)
        signal.removeEventListener('abort', done)
        resolve()
      }
      signal.addEventListener('abort', done, { once: true })
      if (typeof g.addEventListener === 'function') g.addEventListener('online', done)
      else resolve()
    }),
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export interface SourceOptions {
  /** the host's fetch: the reader's only network */
  fetch: Fetch
  /** the object's address: a path on our server (`own`) or arXiv's absolute URL */
  url: string
  /** our server: a strong entity-tag required, a URL a chunk; else arXiv's server as it is */
  own: boolean
  /** what every answer is held to; null: the first answer's length and tag, then held */
  bound?: Bound | null
  /** the chunks shared with the reader's other sources of the same object */
  store?: ChunkStore | null
  /** the head's chunk digests (format's chunkDigests), where already known; else given later by `prove` */
  chunks?: string | null
  signal?: AbortSignal
  /** told once, where the source is refused */
  refused?: (e: RangeRefusal) => void
  /** whether a read the network fails is asked again for as long as the source lives (read at each failure) */
  keepReading?: () => boolean
  /** told once, as the object's length and tag are first learnt */
  onBound?: (b: Bound) => void
  /** told the bytes received so far, as they come */
  onProgress?: (loaded: number) => void
  timers?: Timers
  online?: Online
}

export interface ByteSource {
  /** bytes [begin, end) of the object, one answer checked; a RangeRefusal where it is not (and for every read after) */
  read(begin: number, end: number): Promise<Uint8Array>
  /** the object's length and entity-tag: as given, else as the first answer told them; null until then */
  readonly bound: Bound | null
  /** why nothing more is read, or null */
  readonly refusal: RangeRefusal | null
  /** every read let go: those in flight and those after refused (`gone`) */
  abort(): void
}

export interface OriginalSource extends ByteSource {
  /** the head's chunk digests: every chunk read before is compared now, every chunk after before it is given. Resolves true
   *  where every chunk read so far is the one named (false: the source is refused, `digest`) */
  prove(chunks: string): Promise<boolean>
  /** the chunks read and digested so far, and how many of them were compared with the head's */
  readonly digested: { chunks: number; proven: number }
  /** the asks made and the bytes received (the probe's) */
  readonly counts: { asks: number; bytes: number; retries: number }
}

/** a strong entity-tag (RFC 9110 §8.8.3): what R2's httpEtag is */
const STRONG_ETAG = /^"[\x21\x23-\x7e]{1,200}"$/
const CONTENT_RANGE = /^bytes (\d+)-(\d+)\/(\d+)$/
const messageOf = (e: unknown): string => String((e as Error)?.message ?? e).slice(0, 300)
/** the address a range of an object on our server is asked at: its own, with the range in its query (`r=<first>-<last>`) */
export const chunkUrl = (url: string, begin: number, end: number): string =>
  `${url}${url.includes('?') ? '&' : '?'}r=${begin}-${end - 1}`

/** a chunk's digest as the head writes it: the first 16 bytes of its SHA-256, base64url (22 characters) */
export async function chunkDigest(bytes: Uint8Array): Promise<string> {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle
  if (subtle) {
    const d = new Uint8Array(await subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))
    return toBase64Url(d.subarray(0, 16))
  }
  return toBase64Url(sha256(bytes).subarray(0, 16))
}

/** an object at `o.url`, read by ranges (see the head of this file) */
export function rangeSource(o: SourceOptions): OriginalSource {
  const timers = o.timers ?? realTimers
  const online = o.online ?? browserOnline
  let bound: Bound | null = o.bound ?? null
  let dead: RangeRefusal | null = null
  const ac = new AbortController(),
    signal = ac.signal
  const counts = { asks: 0, bytes: 0, retries: 0 }
  /** each whole chunk's digest as first read, and the head's once known; the chunks found to be the head's */
  const seen = new Map<number, string>()
  let chunks: string | null = o.chunks ?? null
  const proven = new Set<number>()
  const letGo = () => {
    if (dead) return
    dead = new RangeRefusal('gone', 'let go')
    ac.abort(dead)
  }
  if (o.signal?.aborted) letGo()
  else o.signal?.addEventListener('abort', letGo, { once: true })
  const refuse = (kind: RefusalKind, why: string): RangeRefusal => {
    if (dead) return dead
    dead = new RangeRefusal(kind, why)
    ac.abort(dead)
    try {
      o.refused?.(dead)
    } catch {
      /* the listener's own */
    }
    return dead
  }
  /** the head's digest of chunk i, where it names one */
  const named = (i: number): string | null =>
    chunks && chunks.length >= 22 * (i + 1) ? chunks.slice(22 * i, 22 * i + 22) : null
  /** chunk i's digest compared with the head's where it is known, else with the one first read of it (a chunk the store let go
   *  and read again: a server that names no entity-tag may answer other bytes under the same length), and kept where it is the
   *  first: a refusal where it disagrees */
  const check = (i: number, d: string) => {
    const head = named(i)
    const first = seen.get(i) ?? null
    if (first === null) seen.set(i, d)
    if (head !== null && head !== d) throw refuse('digest', `chunk ${i} is not the one the layer was made over`)
    if (head === null && first !== null && first !== d)
      throw refuse('digest', `chunk ${i} read again is not the one first read`)
    if (head !== null) proven.add(i)
  }
  const pauseBefore = (n: number) =>
    new Promise<void>((resolve) => {
      if (!online.now()) {
        void online.wait(signal).then(resolve)
        return
      }
      const t = timers.later(resolve, Math.min(RETRY_MAX_MS, RETRY_MS * 2 ** (n - 1)))
      signal.addEventListener(
        'abort',
        () => {
          timers.clear(t)
          resolve()
        },
        { once: true },
      )
    })
  /** an answer's body, exactly `length` bytes, in one buffer of its own */
  async function bodyOf(r: Response, length: number, heard: () => void): Promise<Uint8Array> {
    const out = new Uint8Array(length)
    if (!r.body) throw new Error('an answer with no body')
    const reader = r.body.getReader()
    let at = 0
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      heard()
      if (at + value.byteLength > length) {
        void reader.cancel().catch(() => {})
        throw refuse('bytes', `more than the ${length} bytes asked`)
      }
      out.set(value, at)
      at += value.byteLength
      counts.bytes += value.byteLength
      o.onProgress?.(counts.bytes)
    }
    if (at < length) throw new Error(`the body ended at ${at} of its ${length} bytes`)
    return out
  }
  async function asked(begin: number, end: number, attempt: AbortSignal, heard: () => void): Promise<Uint8Array> {
    counts.asks++
    const init: RequestInit = { headers: { range: `bytes=${begin}-${end - 1}` }, signal: attempt }
    if (!o.own) init.cache = 'no-store'
    const r = await o.fetch(o.own ? chunkUrl(o.url, begin, end) : o.url, init)
    heard()
    if (r.status >= 500 || r.status === 408 || r.status === 429) {
      void r.body?.cancel().catch(() => {})
      throw new Error(`the server answered ${r.status}`)
    }
    const fail = (why: string, kind: RefusalKind = 'bytes') => {
      void r.body?.cancel().catch(() => {})
      return refuse(kind, why)
    }
    // (no such object: only where none of it was read yet, the first answers; once bytes of it came, a 404 or a 410 is a flaky
    // answer, the network's, asked again as one)
    if (r.status === 404 || r.status === 410) {
      if (counts.bytes === 0) throw fail(`the server has no such object (${r.status})`, 'missing')
      void r.body?.cancel().catch(() => {})
      throw new Error(`the server answered ${r.status} after bytes of the object were read`)
    }
    if (r.status !== 206) throw fail(`the server answered ${r.status} to a range`)
    const m = CONTENT_RANGE.exec(r.headers.get('content-range') ?? '')
    const etag = r.headers.get('etag')
    if (!m)
      throw fail(`a 206 whose Content-Range is ${JSON.stringify((r.headers.get('content-range') ?? '').slice(0, 80))}`)
    if (o.own && (etag === null || !STRONG_ETAG.test(etag)))
      throw fail(`an answer whose ETag is ${JSON.stringify((etag ?? '').slice(0, 80))}, not a strong one`)
    const first = Number(m[1]),
      last = Number(m[2]),
      total = Number(m[3])
    if (bound && (total !== bound.total || (bound.etag !== null && etag !== bound.etag)))
      throw fail(
        `an answer of ${total} bytes tagged ${etag}, not the ${bound.total} bytes${bound.etag === null ? '' : ` tagged ${bound.etag}`} it is bound to`,
      )
    // (the object's last byte where the range asks past it: only while its length is not known, the first read)
    const want = bound ? end : Math.min(end, total)
    if (first !== begin || last !== want - 1)
      throw fail(`the bytes ${first} to ${last}, not the ${begin} to ${want - 1} asked`)
    const learnt = !bound || (bound.etag === null && etag !== null)
    bound = { total: bound?.total ?? total, etag: bound?.etag ?? etag }
    if (learnt && o.onBound) {
      try {
        o.onBound(bound)
      } catch {
        /* the listener's own */
      }
    }
    return bodyOf(r, want - begin, heard)
  }
  /** one ask of the range, bounded by its progress */
  async function once(begin: number, end: number): Promise<Uint8Array> {
    const attempt = new AbortController()
    const leave = () => attempt.abort(dead)
    signal.addEventListener('abort', leave, { once: true })
    let silent: unknown,
      stalled = false
    const heard = () => {
      timers.clear(silent)
      silent = timers.later(() => {
        stalled = true
        attempt.abort(new Error('stalled'))
      }, STALL_MS)
    }
    heard()
    try {
      return await asked(begin, end, attempt.signal, heard)
    } catch (e) {
      if (stalled && !dead) throw new Stalled(`nothing from the server for ${STALL_MS / 1000} s`)
      throw e
    } finally {
      timers.clear(silent)
      signal.removeEventListener('abort', leave)
    }
  }
  /** bytes [begin, end) asked until read, refused or let go; each whole chunk digested and checked */
  async function fetched(begin: number, end: number): Promise<Uint8Array> {
    if (dead) throw dead
    const failed: string[] = []
    for (let n = 1; ; n++) {
      let stalled = false
      try {
        const bytes = await once(begin, end)
        if (dead) throw dead
        await digestChunks(begin, bytes)
        if (dead) throw dead
        return bytes
      } catch (e) {
        if (dead) throw dead
        if (e instanceof RangeRefusal) throw e
        stalled = e instanceof Stalled
        failed.push(messageOf(e))
      }
      if (n >= RANGE_TRIES && !o.keepReading?.())
        throw refuse(
          'network',
          `the bytes ${begin} to ${end - 1}: ${new Set(failed).size === 1 ? `${failed[0]}, ${RANGE_TRIES} times` : failed.join('; then ')}`,
        )
      counts.retries++
      if (!stalled) await pauseBefore(n)
      if (dead) throw dead
    }
  }
  /** the whole chunks of a read digested and checked, every time one is fetched (a read that is not whole chunks is not) */
  async function digestChunks(begin: number, bytes: Uint8Array) {
    const total = bound?.total
    if (total === undefined || begin % CHUNK !== 0) return
    const end = begin + bytes.byteLength
    if (end % CHUNK !== 0 && end !== total) return
    for (let at = 0; at < bytes.byteLength; at += CHUNK)
      check((begin + at) / CHUNK, await chunkDigest(bytes.subarray(at, Math.min(at + CHUNK, bytes.byteLength))))
  }
  const nameOf = (b: Bound) => `${o.url}|${b.etag ?? ''}|${b.total}`
  return {
    get bound() {
      return bound
    },
    get refusal() {
      return dead && dead.kind !== 'gone' ? dead : null
    },
    get counts() {
      return counts
    },
    get digested() {
      return { chunks: seen.size, proven: proven.size }
    },
    abort: letGo,
    async prove(c) {
      if (dead) return false
      chunks = c
      proven.clear()
      try {
        for (const [i, d] of seen) check(i, d)
      } catch {
        return false
      }
      return true
    },
    async read(begin, end) {
      if (dead) throw dead
      if (
        !Number.isSafeInteger(begin) ||
        !Number.isSafeInteger(end) ||
        begin < 0 ||
        end <= begin ||
        (bound && end > bound.total)
      )
        throw refuse('bytes', `no range of the object: ${begin} to ${end}`)
      const store = o.store
      // the object's length not known yet (the first read): asked, then its chunks kept under the name the answer gave
      if (!store || !bound) {
        const bytes = await fetched(begin, end)
        if (store && bound) store.keep(nameOf(bound), bound.total, begin, bytes)
        return bytes
      }
      const bytes = await store.read(nameOf(bound), bound.total, begin, end, fetched, signal)
      if (dead) throw dead
      return bytes
    },
  }
}
