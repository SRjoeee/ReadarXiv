// The reader's client of our server's v2 routes (L5's routes: `GET /api/v2/papers/<seg>?t=&f=` follows, a whole document an
// answer or a stream frame, never starting work; `POST /api/v2/open` starts what is missing; `GET /api/v2/o/<path>` immutable
// bytes), over the host's fetch alone: one implementation for both hosts (interfaces/host DECISION: `follow`, `object` and the
// server's rows are the reader's over `fetch`).
//
// Every ask is today's (R session/server.ts `fetched`, `bodyWithin`): bounded at REQUEST_MS, its answer and its body together (a
// connection taken and never answered, or a body that stops, would otherwise hold the reader for good); a network that fails, a
// 5xx or nothing in time asked once more after RETRY_MS, and a second failure is told by its cause: the network itself (the
// fetch rejected, nothing in time, a body that broke: `Refused('network')`) or our server at fault (a 5xx: `Refused('server')`);
// the caller's abort is the caller's, never asked again. An object is read within its bound and held to its digest before
// anything parses it; past a content-encoding a response's content-length is the body's as sent, not the bytes read here, so
// only the read counts them (W open.ts bodyWithin, layer/files.ts).
import { BOUNDS } from '@readarxiv/format'
import { type Fetch, realTimers, type Timers } from '../bytes/source.ts'
import { type Doc, FORMATS, type PaperRef, type Ref, WAIT_MAX_MS } from './machine.ts'

/** how long one ask may take, its answer and its body together; how long a stream may be silent (the server beats every 15 s)
 *  (R server.ts REQUEST_MS: thirty seconds bring the largest object at 64 kbit/s) */
export const REQUEST_MS = 30_000
/** how long after a network failure, a 5xx or nothing in time an ask is made once more (R server.ts RETRY_MS); the least a
 *  follow waits before it asks again after a stream that ended */
export const RETRY_MS = 1_000
/** how long a follow waits before it asks again once the last document heard says nothing runs for what is followed (the
 *  prepare, the target's run): our server's own reconnection time for such a stream, whose last frame that document is
 *  (`retry: 60000`, server design-a "Followers"; worker v2 paper.ts `#tell`). Staging, 2026-11-07: a done paper asked again
 *  at once each time its one-frame stream ended, 18 to 50 times a second */
export const IDLE_MS = 60_000

/** a paper version's segment (L5's Seg: `.` and `/` as `_`, its version) */
export const segOf = (p: PaperRef, version: number): string => `${p.id.replace(/[./]/g, '_')}v${version}`
/** a paper's segment for the follow: with its version where known, else the id alone (the server resolves the latest) */
export const followSegOf = (p: PaperRef): string => (p.version ? segOf(p, p.version) : p.id.replace(/[./]/g, '_'))

/** why the server's answer is not what was asked: `not-opened` (a follow of a paper the server has not opened), `not-found`
 *  (no such paper), `update` (a deployment that reads no format of this reader's), `busy` / `rate` (a 429: at capacity, the
 *  visitor's rate of asks, as its body says; `afterMs` its Retry-After, `doc` the document it carried), `network` (the network
 *  itself failed: twice), `server` (our server at fault: a 5xx twice), `gone` / `bad` (an object deleted, or not its bytes) */
export class Refused extends Error {
  readonly why: string
  readonly afterMs: number | null
  readonly doc: Doc | null
  constructor(why: string, afterMs: number | null = null, doc: Doc | null = null) {
    super(why)
    this.why = why
    this.afterMs = afterMs
    this.doc = doc
  }
}

export interface Ask {
  fetch: Fetch
  signal?: AbortSignal | undefined
  timers?: Timers | undefined
}

const sha256Hex = async (b: Uint8Array): Promise<string> => {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>))
  return [...d].map((x) => x.toString(16).padStart(2, '0')).join('')
}
const sleep = (ms: number, a: Ask) =>
  new Promise<void>((resolve, reject) => {
    const timers = a.timers ?? realTimers
    if (a.signal?.aborted) return reject(a.signal.reason)
    const stop = () => {
      timers.clear(t)
      reject(a.signal?.reason)
    }
    const t = timers.later(() => {
      a.signal?.removeEventListener('abort', stop)
      resolve()
    }, ms)
    a.signal?.addEventListener('abort', stop, { once: true })
  })

/**
 * `url` asked and its answer read by `read`, the two within REQUEST_MS; the network, a 5xx or nothing in time asked once more
 * after RETRY_MS, a second failure `Refused('network')`; an answer under 500 the caller names (`askAgain`: the wait it gives)
 * asked once more after that wait, the one more ask's answer read as it is. A body that breaks or stops is the server out of
 * reach at once (today's rule: the answer came, so asking again is no better). An abort of the caller's is thrown as it is
 */
export async function request<T>(
  a: Ask,
  url: string,
  init: RequestInit,
  read: (r: Response) => Promise<T>,
  /** an answer under 500 the caller would ask once more: the wait before that ask, else null (read as it is) */
  askAgain?: (r: Response) => number | null,
): Promise<T> {
  const timers = a.timers ?? realTimers
  for (let again = true; ; again = false) {
    const ac = new AbortController()
    const stop = () => ac.abort(a.signal?.reason)
    if (a.signal?.aborted) throw a.signal.reason
    a.signal?.addEventListener('abort', stop, { once: true })
    const timer = timers.later(() => ac.abort(new Error(`nothing within ${REQUEST_MS / 1000} s`)), REQUEST_MS)
    const done = () => {
      timers.clear(timer)
      a.signal?.removeEventListener('abort', stop)
    }
    let r: Response
    try {
      r = await a.fetch(url, { ...init, signal: ac.signal })
    } catch (e) {
      done()
      if (a.signal?.aborted) throw e
      if (!again) throw new Refused('network')
      await sleep(RETRY_MS, a)
      continue
    }
    if (r.status >= 500) {
      done()
      void r.body?.cancel().catch(() => {})
      if (!again) throw new Refused('server')
      await sleep(RETRY_MS, a)
      continue
    }
    const wait = again ? (askAgain?.(r) ?? null) : null
    if (wait !== null) {
      done()
      void r.body?.cancel().catch(() => {})
      await sleep(wait, a)
      continue
    }
    try {
      return await read(r)
    } catch (e) {
      if (a.signal?.aborted) throw e
      if (e instanceof Refused) throw e
      // (the body broke, or stopped past the bound)
      throw new Refused('network')
    } finally {
      done()
    }
  }
}

/** a response's body within `cap` bytes, as it comes (never by its content-length: past a content-encoding that is the body as
 *  sent); past it, the read let go and `past()` thrown */
export async function bodyWithin(
  r: Response,
  cap: number,
  past: () => Error = () => new Refused('bad'),
): Promise<Uint8Array<ArrayBuffer>> {
  if (!r.body) {
    const b = new Uint8Array(await r.arrayBuffer())
    if (b.length > cap) throw past()
    return b
  }
  const reader = r.body.getReader()
  const chunks: Uint8Array[] = []
  let n = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    n += value.byteLength
    if (n > cap) {
      void reader.cancel().catch(() => {})
      throw past()
    }
    chunks.push(value)
  }
  const out = new Uint8Array(n)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.byteLength
  }
  return out
}
/** a JSON answer of a few kilobytes (a document, a refusal): null where it is none */
const jsonOf = async (r: Response): Promise<unknown> => {
  try {
    return JSON.parse(new TextDecoder().decode(await bodyWithin(r, BOUNDS.units.bytes)))
  } catch (e) {
    if (e instanceof Refused) throw e
    return null
  }
}

/** an object's bytes: read within its bound (`ref.bytes`), held to its digest; a Refused where they are not (`gone`: a 404) */
export function object(a: Ask, ref: Ref): Promise<Uint8Array> {
  return request(a, `/api/v2/o/${ref.path}`, {}, async (r) => {
    if (r.status === 404) throw new Refused('gone')
    if (!r.ok) throw new Refused('bad')
    const out = await bodyWithin(r, ref.bytes)
    if (out.length !== ref.bytes || (await sha256Hex(out)) !== ref.sha256) throw new Refused('bad')
    return out
  })
}
/** an object a catalog names by its digest alone (a part: its length is not in the head): read within `cap`, held to its digest */
export function objectOfDigest(a: Ask, path: string, sha256: string, cap: number): Promise<Uint8Array> {
  return request(a, `/api/v2/o/${path}`, {}, async (r) => {
    if (r.status === 404) throw new Refused('gone')
    if (!r.ok) throw new Refused('bad')
    const out = await bodyWithin(r, cap)
    if ((await sha256Hex(out)) !== sha256) throw new Refused('bad')
    return out
  })
}

/** the objects of a reader, by digest: each fetched once while it is wanted (one ask for every caller of it), held to its
 *  digest; one that failed is forgotten, so that the next want asks again */
export function objectStore(a: Ask) {
  const held = new Map<string, Promise<Uint8Array>>()
  const once = (sha256: string, make: () => Promise<Uint8Array>) => {
    let p = held.get(sha256)
    if (!p) {
      const q = make()
      held.set(sha256, q)
      q.catch(() => {
        if (held.get(sha256) === q) held.delete(sha256)
      })
      p = q
    }
    return p
  }
  return {
    of: (ref: Ref) => once(ref.sha256, () => object(a, ref)),
    ofDigest: (path: string, sha256: string, cap: number) => once(sha256, () => objectOfDigest(a, path, sha256, cap)),
  }
}

/** the directory an object of a layer lies in, by its catalog: objects the catalog names by digest are at `<dir>/<sha256>` */
export const dirOf = (catalog: Ref): string => catalog.path.slice(0, catalog.path.lastIndexOf('/'))

/** a document as the server writes it, read for what the machine reads (unknown fields stripped) */
export function docOf(x: unknown): Doc | null {
  const d = x as Partial<Doc> & { prepare?: Doc['prepare']; targets?: Doc['targets'] }
  if (!d || typeof d !== 'object' || typeof d.rev !== 'number' || !d.prepare) return null
  const prepare = d.prepare as Doc['prepare'] & { units: unknown }
  return {
    epoch: String(d.epoch ?? ''),
    rev: d.rev,
    ...(typeof d.version === 'number' ? { version: d.version } : {}),
    // (L5's prepare names its units one Ref; stage 2's fixtures a list of them)
    prepare: {
      ...prepare,
      units: Array.isArray(prepare.units) ? prepare.units : prepare.units ? [prepare.units as Ref] : [],
    },
    layer: d.layer
      ? { ...d.layer, units: Array.isArray(d.layer.units) ? d.layer.units : [d.layer.units as unknown as Ref] }
      : null,
    targets: d.targets ?? {},
  }
}
/** a 429's word, as our server's body says it: the visitor's rate of asks (worker v2 routes.ts `rate-limited`), else its
 *  capacity */
const rateOf = (v: unknown): 'rate' | 'busy' =>
  (v as { error?: unknown } | null)?.error === 'rate-limited' ? 'rate' : 'busy'
/** a 429's wait, as its Retry-After names it (seconds), or null where it names none */
const afterOf = (r: Response): number | null => {
  const s = Number(r.headers.get('retry-after'))
  return r.headers.has('retry-after') && Number.isFinite(s) && s >= 0 ? s * 1000 : null
}
/** a 404's word: `not-found` where the server says the paper is none, else a paper it has not opened */
const missOf = async (r: Response): Promise<string> =>
  ((await jsonOf(r)) as { error?: unknown } | null)?.error === 'not-found' ? 'not-found' : 'not-opened'

/** whether anything runs for what is followed: the prepare, or the target's run (our server's `busy`, worker v2 machine.ts: a
 *  work in flight is `running` in the document) */
const runs = (d: Doc, target: string | null): boolean =>
  d.prepare.state === 'running' || (target !== null && d.targets[target]?.state === 'running')

/**
 * The paper followed: each whole document told (`onDoc`) as it comes, from a stream where the server gives one, else by polling,
 * until `signal` ends it. Its pace is the last document's, as our server sets it: while something runs, a stream that ends is
 * followed again after the reconnection time its frames named (`retry:`, kept from stream to stream as an EventSource keeps it;
 * our server names a second), at least RETRY_MS, and a poll every `pollMs`; once nothing runs, both after IDLE_MS at least (the
 * stream then ended as our server ends it, after its last frame: nothing lost). One that is silent for REQUEST_MS, or breaks, is
 * followed again as any ask is (once more, then out of reach); two in a row that told nothing are the server out of reach. The
 * end of a follow that is not the signal's is a Refused (`not-opened`, `not-found`, `update`, `busy`, `rate`, `network`,
 * `server`), which the session turns into its input
 */
export async function follow(
  a: Ask & {
    paper: PaperRef
    target: string | null
    onDoc(d: Doc): void
    /** the stream ended or broke, and is asked again: told before the ask (the next document heard ends it) */
    onQuiet?(): void
    pollMs?: number
  },
): Promise<never> {
  const timers = a.timers ?? realTimers
  const q = new URLSearchParams({ f: FORMATS.join(',') })
  if (a.target) q.set('t', a.target)
  const url = `/api/v2/papers/${followSegOf(a.paper)}?${q}`
  const pollMs = a.pollMs ?? 2000
  let quiet = 0
  /** the reconnection time our server named (`retry:`), at most WAIT_MAX_MS: none until it names one */
  let named = 0
  /** the last document heard: whether anything runs in it sets the pace */
  let last: Doc | null = null
  const tell = (d: Doc) => {
    last = d
    a.onDoc(d)
  }
  const idle = () => last !== null && !runs(last, a.target)
  for (;;) {
    let told = false
    const outcome = await request(a, url, { headers: { accept: 'text/event-stream' } }, async (r) => {
      if (r.status === 404) throw new Refused(await missOf(r))
      if (r.status === 426) throw new Refused('update')
      if (r.status === 429) {
        const v = await jsonOf(r)
        throw new Refused(rateOf(v), afterOf(r), docOf(v))
      }
      if (!r.ok || !r.body) throw new Refused('network')
      if (!(r.headers.get('content-type') ?? '').startsWith('text/event-stream')) {
        const d = docOf(await jsonOf(r))
        if (d) tell(d)
        return 'poll' as const
      }
      return r
    })
    if (outcome === 'poll') {
      await sleep(idle() ? Math.max(IDLE_MS, pollMs) : pollMs, a)
      continue
    }
    // the stream: `data:` lines, a frame each blank line; each read within REQUEST_MS of silence
    const reader = outcome.body?.pipeThrough(new TextDecoderStream()).getReader()
    if (!reader) throw new Refused('network')
    // (the stream outlives its ask's bound: the caller's abort cancels it)
    const cancel = () => void reader.cancel().catch(() => {})
    a.signal?.addEventListener('abort', cancel, { once: true })
    let buf = ''
    try {
      for (;;) {
        let silent: unknown
        const next = await Promise.race([
          reader.read(),
          new Promise<'silent'>((resolve) => {
            silent = timers.later(() => resolve('silent'), REQUEST_MS)
          }),
        ]).finally(() => timers.clear(silent))
        if (next === 'silent') {
          void reader.cancel().catch(() => {})
          break
        }
        if (next.done) break
        buf += next.value
        let end = buf.indexOf('\n\n')
        while (end >= 0) {
          const lines = buf.slice(0, end).split('\n')
          buf = buf.slice(end + 2)
          // (the reconnection time, where a frame names it in digits alone, as an EventSource reads it)
          for (const l of lines) {
            const v = l.startsWith('retry:') ? l.slice(6).trimStart() : ''
            if (/^\d+$/.test(v)) named = Math.min(WAIT_MAX_MS, Number(v))
          }
          const data = lines
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trimStart())
            .join('\n')
          if (data) {
            let d: Doc | null = null
            try {
              d = docOf(JSON.parse(data))
            } catch {
              d = null
            }
            if (d) {
              told = true
              tell(d)
            }
          }
          end = buf.indexOf('\n\n')
        }
      }
    } catch (e) {
      if (a.signal?.aborted) throw e
      // (a stream broken by the network: followed again, as one that ended)
    } finally {
      a.signal?.removeEventListener('abort', cancel)
    }
    if (a.signal?.aborted) throw a.signal.reason
    quiet = told ? 0 : quiet + 1
    if (quiet >= 2) throw new Refused('network')
    // (a stream that told a document in which nothing runs ended as our server ends it: not lost, followed again at its pace)
    if (!told || !idle()) a.onQuiet?.()
    await sleep(Math.max(RETRY_MS, named, idle() ? IDLE_MS : 0), a)
  }
}

/** the open: what the paper lacks started; its document, or a refusal with its wait: of the work, for the visitor's new papers
 *  (`quota`) or our server's capacity (`busy`), in its answer; of the ask, for the visitor's rate of asks (`rate`, a 429 whose
 *  body says so). A refusal of the work names the instant it ends (`at`: the visitor's period's end, as our server's admission
 *  knows it exactly, on its clock: the time said; null where an older server names none) beside its wait (`afterMs`: that
 *  instant measured from the answer, which the session counts on its own clock, whatever the viewer's clock reads). A Refused
 *  for the rest: `update` a 426, `not-found` a 404, `network` / `server` out of reach */
export function open(
  a: Ask & { paper: PaperRef; target: string | null; view?: number },
): Promise<{
  doc: Doc | null
  refused?: { why: 'quota' | 'busy' | 'rate'; afterMs: number | null; at: number | null }
}> {
  const body = JSON.stringify({
    paper: a.paper.id,
    ...(a.paper.version ? { version: a.paper.version } : {}),
    target: a.target,
    formats: [...FORMATS],
    view: a.view ?? 1,
  })
  return request(
    a,
    '/api/v2/open',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body },
    async (r) => {
      if (r.status === 426) throw new Refused('update')
      if (r.status === 404) throw new Refused('not-found')
      const v = (await jsonOf(r)) as {
        doc?: unknown
        refused?: { why?: 'quota' | 'busy'; retryAfterS?: number; retryAt?: number }
      } | null
      if (r.status === 429 || v?.refused) {
        const s = v?.refused?.retryAfterS
        const at = v?.refused?.retryAt
        return {
          doc: docOf(v?.doc),
          refused: {
            why: v?.refused?.why ?? rateOf(v),
            afterMs: typeof s === 'number' && Number.isFinite(s) ? s * 1000 : afterOf(r),
            at: typeof at === 'number' && Number.isFinite(at) ? at : null,
          },
        }
      }
      if (!r.ok) throw new Refused('network')
      return { doc: docOf(v?.doc ?? v) }
    },
  )
}
