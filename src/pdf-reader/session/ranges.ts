// Our copy of arXiv's PDF read by ranges, each answer held to the layer's base (the reader's base check, run.ts bind): the
// same contract as the web's reader (readarxiv-web web/src/ranges.ts), written for the extension's run.
//
// The layer's composed document was arXiv's PDF read whole (PDF.js's getData waits for every byte of it), hashed, copied and
// parsed again: on 2608.16117v1 (46 MB) the first page was laid 9.5 s after the original was on screen, the rest of arXiv's
// file still coming (lab/pdf/records/layer-extension.md). Read by ranges instead, the document asks our copy for what its pages need and
// nothing more, and the bytes after the original's last are the layer's tails. What the hash held, our server holds: it
// commits a layer only over the copy whose length and SHA-256 are the head's base, and names that copy's entity-tag beside
// the catalog and every object (server.ts BASE_ETAG_HEADER). Every answer here is held to it: a 206 of exactly the bytes
// asked, its Content-Range's length the base's bytes, its ETag the one named. An answer that is not refuses the source
// (RangeRefusal `bytes`): nothing more is read, no byte of another object reaches PDF.js.
//
// No read waits for ever: a read is let go where nothing comes from the server for STALL_MS (no answer, or no byte of its
// body; the web measured one range body that never finished), and asked once more after RETRY_MS; a second failure refuses
// the source as the network's (`network`). A page of a refused document stays unread, and the layer side shows that page's
// original (its stall, PAGE_MS): the reader's original is never ours to lose.
import type * as Lib from 'pdfjs-dist'
import type { DocumentTask } from '../engine/view.mjs'
import { bodyWithin, REQUEST, STRONG_ETAG } from './server'

/** PDF.js's own chunk (its default rangeChunkSize): the first read is one */
export const RANGE_CHUNK = 65_536
/** how long a read may go with nothing from the server before it is taken for stalled (the web's measure: a live read's
 *  silences are a round trip, a lossy link's TCP backoff a few seconds) */
export const STALL_MS = 10_000
/** how many times a range is asked, at most */
export const RANGE_TRIES = 2
/** the pause before a failed read is asked again, doubled at each ask after, to RETRY_MAX_MS (a source kept reading) */
export const RETRY_MS = 1000
export const RETRY_MAX_MS = 30_000

/** what every answer of the source is held to: the object's length and its entity-tag. A tag not known beforehand (`etag` null:
 *  a base page of ours, named by the digest of its bytes, whose bound is its length alone) is the first answer's, and held from it */
export interface Bound { total: number; etag: string | null }
/** why a source is refused: its answers not the object (`bytes`), the network failing a read twice (`network`), or the
 *  source let go by its owner (`gone`, never told) */
export type RefusalKind = 'bytes' | 'network' | 'gone'
export class RangeRefusal extends Error {
  readonly kind: RefusalKind
  constructor(kind: RefusalKind, why: string) {
    super(`our copy of the original is not read: ${why}`)
    this.name = 'RangeRefusal'
    this.kind = kind
  }
}
export interface RangeSource {
  /** bytes [begin, end) of the object, one answer checked; a RangeRefusal where it is not (and for every read after) */
  read(begin: number, end: number): Promise<Uint8Array>
  /** every read let go */
  abort(): void
}
export interface RangeSourceOptions {
  fetch?: typeof fetch
  /** let go with it */
  signal?: AbortSignal
  /** told once, where the source is refused (not where it is let go) */
  refused?: (e: RangeRefusal) => void
  /** whether a read the network fails is asked again for as long as the source lives, rather than refused after RANGE_TRIES
   *  (read at each failure: the left's document of our copy once it is open, whose pages are the reader's original) */
  keepReading?: () => boolean
}

/** a bound as a layer gives it: the base's bytes and the entity-tag its route names; null where either is none */
export const boundFrom = (bytes: unknown, etag: string | null): Bound | null =>
  Number.isSafeInteger(bytes) && (bytes as number) > 0 && etag !== null && STRONG_ETAG.test(etag) ? { total: bytes as number, etag } : null
/** a bound by the base's length alone, for a base page of ours (no route names its tag: its address is its digest); null where
 *  the length is none */
export const lengthBound = (bytes: unknown): Bound | null => (Number.isSafeInteger(bytes) && (bytes as number) > 0 ? { total: bytes as number, etag: null } : null)

const CONTENT_RANGE = /^bytes (\d+)-(\d+)\/(\d+)$/
const messageOf = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 200)
const pause = (ms: number, signal: AbortSignal) => new Promise<void>(resolve => {
  const t = setTimeout(done, ms)
  function done() { clearTimeout(t); signal.removeEventListener('abort', done); resolve() }
  signal.addEventListener('abort', done, { once: true })
})

/** the object at `url` read by ranges, every answer held to `bound` (see the head of this file) */
export function rangeSource(url: string, bound: Bound, o: RangeSourceOptions = {}): RangeSource {
  const f = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  /** the tag every answer is held to: the bound's, else the first answer's (a base of ours is bound by its length alone) */
  let held = bound.etag
  let dead: RangeRefusal | null = null
  const ac = new AbortController()
  const letGo = () => { if (!dead) { dead = new RangeRefusal('gone', 'let go'); ac.abort(dead) } }
  if (o.signal?.aborted) letGo()
  else o.signal?.addEventListener('abort', letGo, { once: true })
  const refuse = (kind: RefusalKind, why: string): RangeRefusal => {
    if (dead) return dead
    dead = new RangeRefusal(kind, why)
    ac.abort(dead)
    o.refused?.(dead)
    return dead
  }
  /** an answer's body, exactly `length` bytes, in a buffer of its own (PDF.js takes it to its worker) */
  async function bodyOf(r: Response, length: number, heard: () => void): Promise<Uint8Array> {
    const out = new Uint8Array(length)
    if (!r.body) throw new Error('an answer with no body')
    const reader = r.body.getReader()
    let at = 0
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      heard()
      if (at + value.byteLength > length) { void reader.cancel().catch(() => {}); throw refuse('bytes', `more than the ${length} bytes asked`) }
      out.set(value, at)
      at += value.byteLength
    }
    if (at < length) throw new Error(`the body ended at ${at} of its ${length} bytes`)
    return out
  }
  /** one ask of the range, let go where nothing comes for STALL_MS; a RangeRefusal for an answer that is not the object's,
   *  any other throw the network's */
  async function once(begin: number, end: number): Promise<Uint8Array> {
    const attempt = new AbortController()
    const leave = () => attempt.abort()
    ac.signal.addEventListener('abort', leave, { once: true })
    let silent: ReturnType<typeof setTimeout> | undefined, stalled = false
    const heard = () => { clearTimeout(silent); silent = setTimeout(() => { stalled = true; attempt.abort() }, STALL_MS) }
    heard()
    try {
      const r = await f(url, { ...REQUEST, headers: { range: `bytes=${begin}-${end - 1}` }, signal: attempt.signal })
      heard()
      const drop = () => { void r.body?.cancel().catch(() => {}) }
      if (r.status >= 500) { drop(); throw new Error(`the server answered ${r.status}`) }
      if (r.status !== 206) { drop(); throw refuse('bytes', `the server answered ${r.status} to a range`) }
      const m = CONTENT_RANGE.exec(r.headers.get('content-range') ?? ''), etag = r.headers.get('etag')
      // (no tag known yet: the first answer's, if it is a strong one, is the one every answer after is held to)
      const tagOk = held === null ? etag !== null && STRONG_ETAG.test(etag) : etag === held
      if (!m || Number(m[1]) !== begin || Number(m[2]) !== end - 1 || Number(m[3]) !== bound.total || !tagOk) {
        drop()
        throw refuse('bytes', `an answer of ${(r.headers.get('content-range') ?? 'no range').slice(0, 60)} tagged ${(etag ?? 'nothing').slice(0, 80)}, not the bytes ${begin} to ${end - 1} of ${bound.total}${held === null ? ' tagged strongly' : ` tagged ${held}`}`)
      }
      held ??= etag
      return await bodyOf(r, end - begin, heard)
    } catch (e) {
      if (dead) throw dead
      if (stalled) throw new Error(`nothing from the server for ${STALL_MS / 1000} s`)
      throw e
    } finally {
      clearTimeout(silent)
      ac.signal.removeEventListener('abort', leave)
    }
  }
  return {
    async read(begin, end) {
      if (dead) throw dead
      if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(end) || begin < 0 || end <= begin || end > bound.total) throw refuse('bytes', `no range of the object: ${begin} to ${end}`)
      let last = ''
      for (let n = 1; ; n++) {
        try {
          return await once(begin, end)
        } catch (e) {
          if (dead) throw dead
          if (e instanceof RangeRefusal) throw e
          last = messageOf(e)
        }
        if (n >= RANGE_TRIES && !o.keepReading?.()) throw refuse('network', `the bytes ${begin} to ${end - 1}: ${last}`)
        await pause(Math.min(RETRY_MAX_MS, RETRY_MS * 2 ** (n - 1)), ac.signal)
        if (dead) throw dead
      }
    },
    abort: letGo,
  }
}

/** the bytes [begin, end) of the source's object followed by `tail` (its first byte at the object's length): a range that
 *  spans the seam is split there, its first part asked of the source, its rest the tail's */
export async function composedRange(source: RangeSource, total: number, tail: Uint8Array | null, begin: number, end: number): Promise<Uint8Array> {
  if (!tail || end <= total) return source.read(begin, end)
  const out = new Uint8Array(end - begin)
  if (begin < total) out.set(await source.read(begin, total), 0)
  const from = Math.max(begin, total)
  out.set(tail.subarray(from - total, end - total), from - begin)
  return out
}

/** how much of the file's end the base check compares at most */
export const ENDS_MAX = 262_144
/** where the end the base check compares begins: the base's startxref (its last cross-reference section, which holds every
 *  object's offset, then the trailer with the file's /ID), else its last kilobyte; within ENDS_MAX of the end */
export function endsFrom(base: { bytes: number; xref?: number }): number {
  const x = base.xref
  const at = Number.isSafeInteger(x) && (x as number) >= 0 && (x as number) < base.bytes ? (x as number) : base.bytes - Math.min(1024, base.bytes)
  return Math.max(at, base.bytes - ENDS_MAX)
}
/**
 * Whether arXiv's PDF at `theirs` ends as our copy at `ours` does: its length the base's, and its bytes from endsFrom to the
 * end the same as our copy's, each read by one range. `other` where its length or those bytes differ (it is not the base,
 * for certain); `alike` where both agree (evidence, not proof: run.ts proves it once the left's bytes are all in); null where
 * either could not be read (arXiv answered no range, the network, our copy refused)
 */
export async function endsAlike(theirs: string, ours: string, base: { bytes: number; xref?: number }, bound: Bound, o: { fetch?: typeof fetch; signal?: AbortSignal } = {}): Promise<'alike' | 'other' | null> {
  const f = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const ac = new AbortController()
  const leave = () => ac.abort()
  if (o.signal?.aborted) return null
  o.signal?.addEventListener('abort', leave, { once: true })
  const from = endsFrom(base), length = base.bytes - from
  try {
    const mine = rangeSource(ours, bound, { fetch: f, signal: ac.signal }).read(from, base.bytes).catch(() => null)
    // arXiv's ask is let go where it says nothing for STALL_MS, as rangeSource lets go of ours (the end is small, so one clock
    // for the answer and its body); the verdict is then null, as for any ask that fails
    const attempt = new AbortController(), silent = setTimeout(() => attempt.abort(), STALL_MS)
    const leaveAttempt = () => attempt.abort()
    ac.signal.addEventListener('abort', leaveAttempt, { once: true })
    const arxiv = await (async (): Promise<Uint8Array | 'other' | null> => {
      const r = await f(theirs, { ...REQUEST, headers: { range: `bytes=${from}-${base.bytes - 1}` }, signal: attempt.signal })
      const m = r.status === 206 ? CONTENT_RANGE.exec(r.headers.get('content-range') ?? '') : null
      const verdict = !m ? null : Number(m[3]) !== base.bytes ? 'other' : Number(m[1]) !== from || Number(m[2]) !== base.bytes - 1 ? null : undefined
      if (verdict !== undefined) { void r.body?.cancel().catch(() => {}); return verdict }
      const b = await bodyWithin(r, length)
      return b.length === length ? b : null
    })().catch(() => null).finally(() => { clearTimeout(silent); ac.signal.removeEventListener('abort', leaveAttempt) })
    if (arxiv === null || arxiv === 'other') return arxiv
    const b = await mine
    if (!b) return null
    for (let i = 0; i < length; i++) if (arxiv[i] !== b[i]) return 'other'
    return 'alike'
  } finally {
    o.signal?.removeEventListener('abort', leave)
    ac.abort()
  }
}

/** PDF.js as a ranged document needs it: the reader's build, or a test's stand-in */
export type RangedPdfJs = Pick<typeof Lib, 'getDocument' | 'PDFDataRangeTransport'>
export interface RangedOptions {
  bound: Bound
  /** the bytes after the original's last (the layer's tails); none: the original alone */
  tail?: Uint8Array | null
  /** getDocument's other options (the view's assets, the side's PDF_OPTIONS and disableAutoFetch) */
  options: Readonly<Record<string, unknown>>
  fetch?: typeof fetch
  signal?: AbortSignal
  /** told once, where the source is refused: before the document opens (its promise rejects too) or after */
  refused?: (e: RangeRefusal) => void
  /** once the document is open, a read the network fails is asked again until it is read or the document let go (the left's
   *  document); before it opens, as any: an open that cannot read its first chunk fails */
  keepReading?: boolean
}

/**
 * PDF.js's document over our copy at `url` read by ranges, followed by `tail` where given: its first chunk read here and given
 * as the transport's initial data, then every range PDF.js asks for through composedRange
 */
export function openRanged(lib: RangedPdfJs, url: string, o: RangedOptions): DocumentTask {
  let refusal: RangeRefusal | null = null, stop: (e: unknown) => void = () => {}, opened = false
  const source = rangeSource(url, o.bound, { fetch: o.fetch, signal: o.signal, refused: e => { refusal = e; stop(e); o.refused?.(e) }, keepReading: () => !!o.keepReading && opened })
  const total = o.bound.total, tail = o.tail ?? null, length = total + (tail?.length ?? 0)
  let task: ReturnType<RangedPdfJs['getDocument']> | null = null, destroyed = false
  const self = {
    promise: null as unknown as Promise<unknown>,
    onProgress: null as ((p: { loaded: number; total: number }) => void) | null,
    async destroy() {
      destroyed = true
      source.abort()
      stop(new Error('the document was let go'))
      await task?.destroy()
    },
  }
  const opening = (async () => {
    const initial = await composedRange(source, total, tail, 0, Math.min(RANGE_CHUNK, length))
    if (destroyed) throw new Error('the document was let go')
    const transport = new lib.PDFDataRangeTransport(length, initial)
    let cancelled = false
    transport.requestDataRange = (begin: number, end: number) => {
      composedRange(source, total, tail, begin, end).then(chunk => {
        if (refusal || destroyed || cancelled) return
        // (its reader let go meanwhile, PDF.js's own cancel: the bytes are no one's)
        try { transport.onDataRange(begin, chunk) } catch { /* PDF.js's */ }
      }, () => {})
    }
    transport.abort = () => { cancelled = true; source.abort() }
    // (disableStream: the transport gives ranges alone, never a stream of the file from its first byte)
    task = lib.getDocument({ ...o.options, range: transport, rangeChunkSize: RANGE_CHUNK, disableStream: true } as Parameters<RangedPdfJs['getDocument']>[0])
    task.onProgress = (p: { loaded: number; total: number }) => self.onProgress?.(p)
    return task.promise
  })()
  self.promise = new Promise((resolve, reject) => { stop = reject; opening.then(doc => { opened = true; resolve(doc) }, reject) })
  return self as unknown as DocumentTask
}
