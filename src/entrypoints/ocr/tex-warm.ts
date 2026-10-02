// The TeX page's warm-up, in the offscreen document (DESIGN §16.6): the page framed, asked to download what a first
// visit in the reader's language fetches ahead, and its files kept in the extension's store (pdf-reader/engine/
// tex-store.mjs), from which the reader hands them to its own page — the page the reader frames over arXiv's PDF page
// has a cache of its own, which nothing run here could fill. One warm-up at a time, and none while a reader that
// typesets is open: the lock is taken alone, and only when it is free, so that the two never download a file twice.
import { answerWant, keepFile, LOCK, pruneStore } from '@/pdf-reader/engine/tex-store.mjs'
import type { TexWarmRequest, TexWarmResult } from '@/shared/tex-warm'

/** a warm-up: the request, with the page's protocol 2 hints for its language (scripts.mjs texHints) */
export type TexWarmJob = TexWarmRequest & { engines: string[]; fonts: string[] }

/** the page in a frame, as the warm-up talks to it */
export interface TexFrame {
  post(message: unknown, transfer?: Transferable[]): void
  /** what the page says, from that frame and the page's origin only */
  listen(handler: (data: unknown) => void): void
  remove(): void
}

export interface TexWarmDeps {
  /** a hidden frame of that address */
  frame(src: string): TexFrame
  locks?: LockManager
  caches?: CacheStorage
  /** how long the page has to say `ready`, and to take the warm-up once asked */
  answerMs?: number
  /** how long the page may then be silent — its own downloads give up after 30 s without a byte, twice */
  quietMs?: number
  now?: () => number
}

interface PageMessage {
  type?: string
  protocol?: number
  cv?: string
  eid?: string
  tid?: string
  index?: string
  id?: number
  files?: string[] | number
  bytes?: boolean | number | ArrayBuffer
  url?: string
  error?: unknown
  network?: string[]
}

const ANSWER_MS = 10_000
const QUIET_MS = 120_000

/** a warm-up, or `deferred` when the lock is not free: a reader that typesets is open, or another warm-up runs */
export async function warmTexPage(request: TexWarmJob, deps: TexWarmDeps): Promise<TexWarmResult> {
  const run = () => warm(request, deps)
  if (!deps.locks?.request) return run()
  return deps.locks.request(LOCK, { mode: 'exclusive', ifAvailable: true }, lock => (lock ? run() : { ok: false as const, lang: request.lang, deferred: true as const, error: 'the TeX page is in use' }))
}

async function warm({ site, lang, engines, fonts }: TexWarmJob, deps: TexWarmDeps): Promise<TexWarmResult> {
  const now = deps.now ?? (() => performance.now())
  const caches = deps.caches ?? globalThis.caches
  const answerMs = deps.answerMs ?? ANSWER_MS
  const quietMs = deps.quietMs ?? QUIET_MS
  const t0 = now()
  const frame = deps.frame(`${site}/tex.html`)
  try {
    return await new Promise<TexWarmResult>(resolve => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const fail = (error: string, network?: string[]) => { clearTimeout(timer); resolve({ ok: false, lang, error, ...(network?.length ? { network } : {}) }) }
      const within = (ms: number, what: string) => { clearTimeout(timer); timer = setTimeout(() => fail(what), ms) }
      within(answerMs, `the TeX page at ${site} did not answer`)
      let versions: string | null = null
      /** every file the hints name, as the page asked which the store holds: what the store keeps */
      let named: string[] | null = null
      /** the files given, written in turn: the warm-up is done once the last is kept */
      let writes = Promise.resolve()
      frame.listen(data => {
        const m = data as PageMessage
        if (m?.type === 'ready') {
          if ((m.protocol ?? 1) < 2) return fail('the TeX page takes no warm-up (protocol 1)')
          versions = [m.cv, m.eid, m.tid, m.index].join('/')
          within(answerMs, 'the TeX page did not take the warm-up')
          frame.post({ type: 'warm', protocol: 2, engines, fonts, store: true })
          return
        }
        if (versions === null || !m?.type) return
        within(quietMs, 'the TeX page fell silent')
        if (m.type === 'want' && Array.isArray(m.files)) {
          const want = { id: m.id ?? 0, files: m.files, bytes: m.bytes === true }
          if (!want.bytes) named = want.files
          void answerWant(site, want, caches).then(({ message, transfer }) => frame.post(message, transfer))
        } else if (m.type === 'keep' && typeof m.url === 'string' && m.bytes instanceof ArrayBuffer) {
          const keep = { url: m.url, bytes: m.bytes }
          writes = writes.then(() => keepFile(site, keep, caches))
        } else if (m.type === 'warm-done') {
          clearTimeout(timer)
          void writes.then(async () => {
            if (m.error) return fail(String(m.error).slice(0, 200), m.network)
            if (named) await pruneStore(site, named, caches)
            resolve({ ok: true, lang, versions: versions ?? '', files: Number(m.files) || 0, bytes: Number(m.bytes) || 0, ms: Math.round(now() - t0) })
          })
        }
      })
    })
  } finally {
    frame.remove()
  }
}
