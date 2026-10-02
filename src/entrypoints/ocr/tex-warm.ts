// The TeX page's warm-up, in the offscreen document (DESIGN §16.6): the page framed, asked to download what a first
// visit in the reader's language fetches ahead, and its files kept in the extension's store (pdf-reader/engine/
// tex-store.mjs), from which the reader hands them to its own page — the page the reader frames over arXiv's PDF page
// has a cache of its own, which nothing run here could fill. One warm-up at a time, and none while a reader that
// typesets is open: the lock is taken alone, and only when it is free, so that the two never download a file twice; a
// reader that needs the page while one runs has it stopped (through the background), and takes what the store holds.
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
  /** stops the warm-up: what came is kept (a file being written is finished first), nothing is pruned */
  signal?: AbortSignal
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
      /** settled: what the page says after is not heard */
      let over = false
      const end = (result: TexWarmResult | Promise<TexWarmResult>) => { if (over) return; over = true; clearTimeout(timer); resolve(result) }
      const fail = (error: string, network?: string[]) => end({ ok: false, lang, error, ...(network?.length ? { network } : {}) })
      /** a page that says `ready` and no more takes no warm-up: one of protocol 2 from before it (the review's M3) */
      const unsupported = (versions: string) => end({ ok: false, lang, error: 'the TeX page takes no warm-up', unsupported: true, versions })
      const within = (ms: number, then: () => void) => { clearTimeout(timer); timer = setTimeout(then, ms) }
      within(answerMs, () => fail(`the TeX page at ${site} did not answer`))
      /** the files given, written in turn: the warm-up is done once the last is kept */
      let writes = Promise.resolve()
      // stopped (another language is wanted, or a reader needs the page): the file being written is finished first, so
      // that a reader waiting for the lock finds it in the store
      const stopped = () => end(writes.then(() => ({ ok: false as const, lang, error: typeof deps.signal?.reason === 'string' ? deps.signal.reason : 'stopped', stopped: true as const })))
      if (deps.signal?.aborted) return stopped()
      deps.signal?.addEventListener('abort', stopped, { once: true })
      let versions: string | null = null
      /** every file the hints name, as the page asked which the store holds: what the store keeps */
      let named: string[] | null = null
      frame.listen(data => {
        const m = data as PageMessage
        if (over) return
        if (m?.type === 'ready') {
          if ((m.protocol ?? 1) < 2) return unsupported('1')
          const seen = [m.cv, m.eid, m.tid, m.index].join('/')
          versions = seen
          within(answerMs, () => unsupported(seen))
          frame.post({ type: 'warm', protocol: 2, engines, fonts, store: true })
          return
        }
        if (versions === null || !m?.type) return
        within(quietMs, () => fail('the TeX page fell silent'))
        if (m.type === 'want' && Array.isArray(m.files)) {
          const want = { id: m.id ?? 0, files: m.files, bytes: m.bytes === true }
          if (!want.bytes) named = want.files
          void answerWant(site, want, caches).then(({ message, transfer }) => frame.post(message, transfer))
        } else if (m.type === 'keep' && typeof m.url === 'string' && m.bytes instanceof ArrayBuffer) {
          const keep = { url: m.url, bytes: m.bytes }
          // a file given is written, even once stopped; a store that cannot keep it (a full disk) stops the warm-up,
          // rather than download what it cannot keep and be taken for done (the review's M2)
          writes = writes.then(async () => { if (!(await keepFile(site, keep, caches))) fail(`the extension's store could not keep ${keep.url.slice(keep.url.lastIndexOf('/') + 1)}`) })
        } else if (m.type === 'warm-done') {
          clearTimeout(timer)
          void writes.then(async () => {
            if (over) return
            if (m.error) return fail(String(m.error).slice(0, 200), m.network)
            if (named) await pruneStore(site, named, caches)
            end({ ok: true, lang, versions: versions ?? '', files: Number(m.files) || 0, bytes: Number(m.bytes) || 0, ms: Math.round(now() - t0) })
          })
        }
      })
    })
  } finally {
    frame.remove()
  }
}

/**
 * One warm-up at a time in the document: a second for the language running is let go (→ false), and one for another
 * language takes the place of the running one, which is stopped first — a reader opened now would wait for files no
 * longer wanted. The place is taken before the stop, so that the document is not let go between the two. Each result
 * is `report`ed once its place is free: the background's answer to a report may wait for its own next request to the
 * document, which must not wait for that answer (the review's M1: a warm-up done as another language was asked for held
 * both sides until Chrome stopped the worker). `idle` runs once the last warm-up has ended and been reported
 */
export function warmSlot(run: (request: TexWarmRequest, signal: AbortSignal) => Promise<TexWarmResult>, { report, idle }: { report: (result: TexWarmResult) => Promise<unknown>; idle: () => void }) {
  let current: { lang: string; stop: AbortController; done: Promise<void> } | null = null
  return {
    get running() { return current !== null },
    /** the running warm-up stopped, whatever its language: a reader needs the page (it takes what the store holds) →
     *  whether one ran */
    stop(): boolean {
      if (!current) return false
      current.stop.abort('a reader needs the TeX page')
      return true
    },
    async start(request: TexWarmRequest): Promise<boolean> {
      if (current?.lang === request.lang) return false
      const stop = new AbortController()
      let settle = () => {}
      const replaced = current
      const mine = { lang: request.lang, stop, done: new Promise<void>(resolve => { settle = resolve }) }
      current = mine
      if (replaced) {
        replaced.stop.abort('another language is wanted')
        await replaced.done
      }
      // another language asked for in turn while this one waited
      if (stop.signal.aborted) {
        settle()
        return false
      }
      void run(request, stop.signal)
        .catch((e: unknown): TexWarmResult => ({ ok: false, lang: request.lang, error: e instanceof Error ? e.message : String(e) }))
        .then(async result => {
          settle()
          const last = current === mine
          if (last) current = null
          await report(result).catch(() => undefined)
          if (last && current === null) idle()
        })
      return true
    },
  }
}
