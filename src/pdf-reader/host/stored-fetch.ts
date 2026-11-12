// The reader's network through this machine's store of papers (cache/paper-store.ts): the owner's rule of 2026-10-08, offline
// nothing new is drawn and a paper this machine keeps still opens (PDF-READER §9.3), kept at the Host's one seam, its fetch
// (interfaces/host DECISION: the host resolves our server's paths). Of our server's answers:
//   - what never changes at its address (an object or a range of one, `/api/v2/o/…`; a face's file, `/static-fonts/<16 hex>.woff2`)
//     is read here first, then asked, and kept as it is read through (a whole object whose address names its digest only where
//     its bytes are that object);
//   - what may change (the faces' tables and a language's patterns) is asked first, kept as it is read, and answered from here
//     where our server is out of reach;
//   - the paper's document (the open's answer, the follow's documents, JSON or a stream's frames) is asked first; the last one
//     with a layer kept for its paper version, and answered as JSON where our server is out of reach (a rejected fetch that is no
//     abort, or a 5xx), so that the reader opens the layer kept: the follow then reads a document as it reads our server's when
//     it answers no stream (session/client.ts follow), at its pace.
// arXiv's own bytes are never kept (the old reader's store did not keep them either). Nothing here is ever a reason a paper does
// not open: a store that fails is a miss and the network is asked, and a fetch the store cannot help fails as it would have.
import { PaperDoc } from '@readarxiv/format'
import type { Host } from '@readarxiv/reader'
import { type Kept, type PaperStore, SHARED } from '@/cache/paper-store'

const OBJECT = /^\/api\/v2\/o\//
const FACE_FILE = /^\/static-fonts\/[0-9a-f]{16}\.woff2$/
const TABLE = /^\/(?:static-fonts\/[a-z0-9-]+|hyph\/[a-zA-Z-]+)\.json$/
const PAPERS = /^\/api\/v2\/papers\/([^/]+)$/
/** an object's paper version, by its address (`p/<pv>/…` a prepare's, `r/<pv>/…` a target's rows, `arxiv/<pv>.pdf` our copy) */
const OBJECT_PV = /^\/api\/v2\/o\/(?:[pr]\/([^/]+)\/|arxiv\/([^/]+)\.pdf$)/
/** a whole object's digest, where its address ends in it */
const DIGEST_LAST = /\/([0-9a-f]{64})$/
/** the headers the reader reads of an answer (bytes/source.ts, session/client.ts): kept with it, given back with it */
const KEPT_HEADERS = ['content-type', 'content-range', 'etag']
/** a document's bytes at most (our server's are a few kilobytes) */
const DOC_MAX = 1024 * 1024


/** the answer's body read through as the caller reads it, `done` told its bytes once the caller has read it whole (never where
 *  the caller let it go, nor past `cap`, where nothing is told) */
function readThrough(r: Response, cap: number, done: (bytes: Uint8Array) => void, frame?: (text: string) => void): Response {
  if (!r.body) return r
  const chunks: Uint8Array[] = []
  let n = 0
  let past = false
  const decoder = frame ? new TextDecoder() : null
  const body = r.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, out) {
        out.enqueue(chunk)
        if (decoder && frame) frame(decoder.decode(chunk, { stream: true }))
        if (past) return
        n += chunk.byteLength
        if (n > cap) {
          past = true
          chunks.length = 0
          return
        }
        chunks.push(chunk)
      },
      flush() {
        if (past) return
        const bytes = new Uint8Array(n)
        let at = 0
        for (const c of chunks) {
          bytes.set(c, at)
          at += c.byteLength
        }
        done(bytes)
      },
    }),
  )
  return new Response(body, { status: r.status, statusText: r.statusText, headers: r.headers })
}

const keptResponse = (k: Kept) => new Response(k.bytes as Uint8Array<ArrayBuffer>, { status: k.status, headers: k.headers })
const jsonResponse = (text: string) => new Response(text, { status: 200, headers: { 'content-type': 'application/json' } })
const headersOf = (r: Response): [string, string][] => KEPT_HEADERS.flatMap(h => { const v = r.headers.get(h); return v === null ? [] : [[h, v] as [string, string]] })
/** the address an answer is kept under: its path and query, and a range asked by header alone */
function keyOf(u: URL, init: RequestInit | undefined): string {
  const range = new Headers(init?.headers).get('range')
  return `${u.pathname}${u.search}${range && !u.searchParams.has('r') ? `#${range}` : ''}`
}

export function storedFetch(o: { fetch: Host['fetch']; store: PaperStore | null; api: string }): Host['fetch'] {
  const { store } = o
  const ours = new URL(o.api).origin
  /** the paper versions this reader's page opened, each told to the store once (the last to be let go) */
  const told = new Set<string>()
  const opened = (pv: string) => {
    if (told.has(pv)) return
    told.add(pv)
    store?.opened(pv).catch(() => {})
  }
  /** the last catalog kept of each paper version this visit: a document is kept again only where its layer changed */
  const keptCatalog = new Map<string, string>()
  /** a document heard (format's PaperDoc, as the reader reads it): kept where it has a layer */
  const seen = (text: string) => {
    let d: PaperDoc | null = null
    try {
      const parsed = PaperDoc.safeParse(JSON.parse(text))
      d = parsed.success ? parsed.data : null
    } catch {
      return
    }
    const pv = d?.pv
    const catalog = d?.layer?.catalog.path
    if (!store || !pv || !catalog) return
    opened(pv)
    if (keptCatalog.get(pv) === catalog) return
    keptCatalog.set(pv, catalog)
    store.putDoc(pv, text, catalog.slice(0, catalog.lastIndexOf('/'))).catch(() => {})
  }
  /** a stream's frames (`data:` lines, a frame each blank line), each document seen */
  const frames = () => {
    let buf = ''
    return (text: string) => {
      buf += text
      let end = buf.indexOf('\n\n')
      while (end >= 0) {
        const data = buf.slice(0, end).split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n')
        buf = buf.slice(end + 2)
        if (data) seen(data)
        end = buf.indexOf('\n\n')
      }
    }
  }
  /** the document kept for an ask of our server's that cannot be answered: the open's (its body's paper and version), or the
   *  follow's (its segment) */
  async function keptDoc(u: URL, init: RequestInit | undefined): Promise<Response | null> {
    const text = await keptDocText(u, init).catch(() => undefined)
    if (text === undefined) return null
    try {
      const d = PaperDoc.safeParse(JSON.parse(text))
      if (!d.success) return null
      opened(d.data.pv)
    } catch {
      return null
    }
    return jsonResponse(u.pathname === '/api/v2/open' ? `{"doc":${text}}` : text)
  }
  async function keptDocText(u: URL, init: RequestInit | undefined): Promise<string | undefined> {
    if (!store) return undefined
    if (u.pathname === '/api/v2/open') {
      let ask: { paper?: unknown; version?: unknown } = {}
      try {
        ask = JSON.parse(typeof init?.body === 'string' ? init.body : '{}')
      } catch {
        return undefined
      }
      if (typeof ask.paper !== 'string') return undefined
      // (our server's segment of a paper: `.` and `/` as `_`, session/client.ts segOf)
      const id = ask.paper.replace(/[./]/g, '_')
      return store.doc(typeof ask.version === 'number' ? { pv: `${id}v${ask.version}` } : { id })
    }
    const seg = PAPERS.exec(u.pathname)?.[1]
    if (!seg) return undefined
    return store.doc(/v\d+$/.test(seg) ? { pv: seg } : { id: seg })
  }
  return async (url, init) => {
    let u: URL
    try {
      u = new URL(url, o.api)
    } catch {
      return o.fetch(url, init)
    }
    const method = (init?.method ?? 'GET').toUpperCase()
    if (!store || u.origin !== ours) return o.fetch(url, init)
    const path = u.pathname
    // what never changes at its address: here first
    if (method === 'GET' && (OBJECT.test(path) || FACE_FILE.test(path))) {
      const key = keyOf(u, init)
      const kept = await store.answer(key).catch(() => undefined)
      if (kept) return keptResponse(kept)
      const r = await o.fetch(url, init)
      if (r.status !== 200 && r.status !== 206) return r
      const m = OBJECT_PV.exec(path)
      const pv = m ? (m[1] ?? m[2] ?? SHARED) : SHARED
      const whole = r.status === 200 && !u.search ? DIGEST_LAST.exec(path)?.[1] : undefined
      return readThrough(r, Number.POSITIVE_INFINITY, bytes => void store.putAnswer(pv, key, { status: r.status, headers: headersOf(r), bytes }, whole).catch(() => {}))
    }
    const doc = (method === 'POST' && path === '/api/v2/open') || (method === 'GET' && PAPERS.test(path))
    const table = method === 'GET' && TABLE.test(path)
    if (!doc && !table) return o.fetch(url, init)
    // what may change: our server first, kept as it is read, here where our server is out of reach
    const fallback = async () => (doc ? keptDoc(u, init) : store.answer(keyOf(u, init)).then(k => (k ? keptResponse(k) : null), () => null))
    let r: Response
    try {
      r = await o.fetch(url, init)
    } catch (e) {
      if (init?.signal?.aborted) throw e
      const k = await fallback()
      if (k) return k
      throw e
    }
    if (r.status >= 500) {
      const k = await fallback()
      if (k) {
        void r.body?.cancel().catch(() => {})
        return k
      }
      return r
    }
    if (!r.ok) return r
    if (table) return readThrough(r, Number.POSITIVE_INFINITY, bytes => void store.putAnswer(SHARED, keyOf(u, init), { status: r.status, headers: headersOf(r), bytes }).catch(() => {}))
    // the document: the open's answer names it (`doc`), a follow answers it whole or as a stream's frames
    if ((r.headers.get('content-type') ?? '').startsWith('text/event-stream')) return readThrough(r, 0, () => {}, frames())
    return readThrough(r, DOC_MAX, bytes => {
      const text = new TextDecoder().decode(bytes)
      if (path !== '/api/v2/open') return seen(text)
      try {
        const v = JSON.parse(text) as { doc?: unknown }
        if (v?.doc) seen(JSON.stringify(v.doc))
      } catch {
        /* no document */
      }
    })
  }
}
