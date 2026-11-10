// A server of immutable objects answering ranges as R2 does (206, Content-Range, a strong ETag), with faults on demand: the
// byte layer's tests' network.
import type { Fetch } from '../../src/bytes/source.ts'

export interface ServedObject {
  bytes: Uint8Array
  /** the entity-tag answered; null: none (arXiv's server, perhaps) */
  etag: string | null
}
export type Fault =
  | { kind: 'status'; status: number }
  | { kind: 'etag'; etag: string }
  | { kind: 'length'; total: number }
  | { kind: 'shift' }
  | { kind: 'reject' }
  /** the answer's headers come, then nothing of its body */
  | { kind: 'silent' }
  | { kind: 'swap'; bytes: Uint8Array }

export interface Ask {
  url: string
  path: string
  range: [number, number]
  init: RequestInit | undefined
}

/** a fetch over `objects` by path (the query names a chunk and is ignored, as the Worker ignores it); `faults(ask)` a fault for
 *  one ask, or none */
export function rangedServer(objects: Map<string, ServedObject>, faults: (a: Ask) => Fault | null = () => null) {
  const asks: Ask[] = []
  const fetch: Fetch = async (url, init) => {
    const path = url.split('?')[0] as string
    const header = new Headers(init?.headers).get('range') ?? ''
    const m = /^bytes=(\d+)-(\d+)$/.exec(header)
    const range: [number, number] = m ? [Number(m[1]), Number(m[2]) + 1] : [0, 0]
    const ask = { url, path, range, init }
    asks.push(ask)
    const f = faults(ask)
    if (f?.kind === 'reject') throw new TypeError('network')
    if (init?.signal?.aborted) throw init.signal.reason
    const o = objects.get(path)
    if (!o) return new Response('not found', { status: 404 })
    if (f?.kind === 'status') return new Response('', { status: f.status })
    const bytes = f?.kind === 'swap' ? f.bytes : o.bytes
    const total = f?.kind === 'length' ? f.total : bytes.length
    const begin = range[0] + (f?.kind === 'shift' ? 1 : 0)
    const end = Math.min(range[1], bytes.length)
    const body = bytes.slice(begin, end)
    const headers = new Headers({
      'content-range': `bytes ${begin}-${end - 1}/${total}`,
      'content-length': String(body.length),
    })
    const etag = f?.kind === 'etag' ? f.etag : o.etag
    if (etag !== null) headers.set('etag', etag)
    if (f?.kind === 'silent') {
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          init?.signal?.addEventListener('abort', () => c.error(init.signal?.reason), { once: true })
        },
      })
      return new Response(stream, { status: 206, headers })
    }
    return new Response(body, { status: 206, headers })
  }
  return { fetch, asks }
}

/** `n` bytes of a pattern no two chunks share */
export function bytesOf(n: number, seed = 1): Uint8Array {
  const b = new Uint8Array(n)
  let x = seed >>> 0 || 1
  for (let i = 0; i < n; i++) {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    b[i] = x & 255
  }
  return b
}

/** a manual clock for the sources' timers */
export function manualTimers() {
  let now = 0
  const due = new Map<number, { at: number; f: () => void }>()
  let next = 1
  return {
    later(f: () => void, ms: number) {
      const id = next++
      due.set(id, { at: now + ms, f })
      return id
    },
    clear(id: unknown) {
      due.delete(id as number)
    },
    /** time moved on by `ms`, every timer due meanwhile run in order */
    advance(ms: number) {
      const until = now + ms
      for (;;) {
        let first: [number, { at: number; f: () => void }] | null = null
        for (const e of due) if (e[1].at <= until && (!first || e[1].at < first[1].at)) first = e
        if (!first) break
        due.delete(first[0])
        now = first[1].at
        first[1].f()
      }
      now = until
    },
    get pending() {
      return due.size
    },
    /** the time on this clock (ms from its start) */
    get now() {
      return now
    },
  }
}

export const flush = () => new Promise((r) => setTimeout(r, 0))
