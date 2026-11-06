// The reader's client of our server's v2 routes (L5's routes: `GET /api/v2/papers/<seg>?t=&f=` follows, a whole document an
// answer or a stream frame, never starting work; `POST /api/v2/open` starts what is missing; `GET /api/v2/o/<path>` immutable
// bytes), over the host's fetch alone: one implementation for both hosts (interfaces/host DECISION: `follow`, `object` and the
// server's rows are the reader's over `fetch`). An object is read within its bounds and held to its digest before anything
// parses it (W layer/files.ts; open.ts bodyWithin: past a content-encoding, content-length is not the body's length).
import type { Fetch } from '../bytes/source.ts'
import { type Doc, FORMATS, type PaperRef, type Ref } from './machine.ts'

/** a paper version's segment (L5's Seg: `.` and `/` as `_`, its version) */
export const segOf = (p: PaperRef, version: number): string => `${p.id.replace(/[./]/g, '_')}v${version}`
/** a paper's segment for the follow: with its version where known, else the id alone (the server resolves the latest) */
export const followSegOf = (p: PaperRef): string => (p.version ? segOf(p, p.version) : p.id.replace(/[./]/g, '_'))

export class Refused extends Error {
  readonly why: string
  readonly retryAt: number | null
  readonly doc: Doc | null
  constructor(why: string, retryAt: number | null = null, doc: Doc | null = null) {
    super(why)
    this.why = why
    this.retryAt = retryAt
    this.doc = doc
  }
}

const sha256Hex = async (b: Uint8Array): Promise<string> => {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>))
  return [...d].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/** an object's bytes: read within its bound (`ref.bytes`), held to its digest; a Refused where they are not */
export async function object(fetch: Fetch, ref: Ref, signal?: AbortSignal): Promise<Uint8Array> {
  const r = await fetch(`/api/v2/o/${ref.path}`, { signal })
  if (r.status === 404) throw new Refused('gone')
  if (!r.ok || !r.body) throw new Refused(r.status >= 500 ? 'network' : 'bad')
  const out = new Uint8Array(ref.bytes)
  const reader = r.body.getReader()
  let at = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    if (at + value.byteLength > ref.bytes) {
      void reader.cancel().catch(() => {})
      throw new Refused('bad')
    }
    out.set(value, at)
    at += value.byteLength
  }
  if (at !== ref.bytes || (await sha256Hex(out)) !== ref.sha256) throw new Refused('bad')
  return out
}

/** the directory an object of a layer lies in, by its catalog: objects the catalog names by digest are at `<dir>/<sha256>` */
export const dirOf = (catalog: Ref): string => catalog.path.slice(0, catalog.path.lastIndexOf('/'))

/** a document as the server writes it, read for what the machine reads (unknown fields stripped) */
function docOf(x: unknown): Doc | null {
  const d = x as Partial<Doc> & { prepare?: Doc['prepare']; targets?: Doc['targets'] }
  if (!d || typeof d !== 'object' || typeof d.rev !== 'number' || !d.prepare) return null
  return {
    epoch: String(d.epoch ?? ''),
    rev: d.rev,
    prepare: d.prepare,
    layer: d.layer ?? null,
    targets: d.targets ?? {},
    position: d.position ?? null,
    progress: d.progress ?? null,
  }
}
const retryOf = (r: Response, now: number): number | null => {
  const s = Number(r.headers.get('retry-after'))
  return Number.isFinite(s) && s > 0 ? now + s * 1000 : null
}

/**
 * The paper followed: each whole document told (`onDoc`) as it comes, from a stream where the server gives one, else by polling
 * every `pollMs`, until `signal` ends it; the end of a follow that is not the signal's is a Refused (`not-opened`, `update`,
 * `busy`, `limit`, `network`), which the session turns into its input
 */
export async function follow(o: {
  fetch: Fetch
  paper: PaperRef
  target: string | null
  onDoc(d: Doc): void
  signal: AbortSignal
  now(): number
  pollMs?: number
}): Promise<never> {
  const q = new URLSearchParams({ f: FORMATS.join(',') })
  if (o.target) q.set('t', o.target)
  const url = `/api/v2/papers/${followSegOf(o.paper)}?${q}`
  for (;;) {
    let r: Response
    try {
      r = await o.fetch(url, { headers: { accept: 'text/event-stream' }, signal: o.signal })
    } catch (e) {
      if (o.signal.aborted) throw e
      throw new Refused('network')
    }
    if (r.status === 404) throw new Refused('not-opened')
    if (r.status === 426) throw new Refused('update')
    if (r.status === 429) {
      const body = await r.json().catch(() => null)
      throw new Refused(r.headers.get('x-axt-refused') === 'quota' ? 'limit' : 'busy', retryOf(r, o.now()), docOf(body))
    }
    if (!r.ok || !r.body) throw new Refused('network')
    if ((r.headers.get('content-type') ?? '').startsWith('text/event-stream')) {
      // the stream: `data:` lines, a frame each blank line; its end, a reconnect from the snapshot
      const reader = r.body.pipeThrough(new TextDecoderStream()).getReader()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += value
        let end = buf.indexOf('\n\n')
        while (end >= 0) {
          const frame = buf.slice(0, end)
          buf = buf.slice(end + 2)
          const data = frame
            .split('\n')
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trimStart())
            .join('\n')
          if (data) {
            const d = docOf(JSON.parse(data))
            if (d) o.onDoc(d)
          }
          end = buf.indexOf('\n\n')
        }
      }
      continue
    }
    const d = docOf(await r.json().catch(() => null))
    if (d) o.onDoc(d)
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, o.pollMs ?? 2000)
      o.signal.addEventListener(
        'abort',
        () => {
          clearTimeout(t)
          reject(o.signal.reason)
        },
        { once: true },
      )
    })
  }
}

/** the open: what the paper lacks started; its document, or a refusal for capacity with its time */
export async function open(o: {
  fetch: Fetch
  paper: PaperRef
  target: string | null
  signal: AbortSignal
  now(): number
  view?: number
}): Promise<{ doc: Doc | null; refused?: { why: 'quota' | 'busy'; retryAt: number } }> {
  const r = await o.fetch('/api/v2/open', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      paper: o.paper.id,
      ...(o.paper.version ? { version: o.paper.version } : {}),
      target: o.target,
      formats: [...FORMATS],
      view: o.view ?? 1,
    }),
    signal: o.signal,
  })
  const body = (await r.json().catch(() => null)) as {
    doc?: unknown
    refused?: { why: 'quota' | 'busy'; retryAfterS: number }
  } | null
  if (r.status === 429 || body?.refused) {
    const s = body?.refused?.retryAfterS ?? Number(r.headers.get('retry-after') ?? 30)
    return { doc: docOf(body?.doc), refused: { why: body?.refused?.why ?? 'busy', retryAt: o.now() + s * 1000 } }
  }
  if (!r.ok) throw new Refused(r.status === 426 ? 'update' : 'network')
  return { doc: docOf(body?.doc ?? body) }
}
