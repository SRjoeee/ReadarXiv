// The background's side of the recogniser (DESIGN §15.3): it opens the offscreen document when a figure needs
// reading, hands figures over one at a time, and gives up on one that does not come back. The document closes itself
// when idle (entrypoints/ocr/main.ts), so "is it there" is asked before every figure rather than remembered.
import { OCR_VERSION } from '@/core/ocr/version'
import type { OcrRunResponse } from '@/shared/ocr'
import { type OcrBackend, OcrBackendError } from './ocr-backend'

export interface RecogniserClientDeps {
  /** `chrome.offscreen`, narrowed to what is used */
  offscreen: {
    has(): Promise<boolean>
    create(): Promise<void>
    close(): Promise<void>
  }
  /**
   * Send a figure to the offscreen document. With no extension page open at all the send rejects; with another one
   * open — the popup, the settings page — it is heard, left unanswered, and resolves to nothing
   */
  run(request: { image: string; mime: string }): Promise<OcrRunResponse | undefined>
  /** One figure: a third of a second as measured, two on the slowest of the sample */
  timeoutMs?: number
  /** The first figure in a document also pays for compiling 14 MB of WebAssembly and loading the models */
  firstTimeoutMs?: number
}

interface Job {
  request: { image: string; mime: string }
  scope: string | undefined
  resolve: (result: Extract<OcrRunResponse, { ok: true }>['result']) => void
  reject: (error: OcrBackendError) => void
  /** Settled already — withdrawn or timed out — while the worker still has it: its answer is nobody's */
  settled: boolean
}

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_FIRST_TIMEOUT_MS = 90_000

export function createRecogniserClient(deps: RecogniserClientDeps): OcrBackend {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const firstTimeoutMs = deps.firstTimeoutMs ?? DEFAULT_FIRST_TIMEOUT_MS
  const queue: Job[] = []
  let current: Job | null = null
  /** A figure has come back from the document that is open now: its start-up is paid for */
  let warmed = false
  let opening: Promise<void> | null = null

  const settle = (job: Job, outcome: () => void): void => {
    if (job.settled) return
    job.settled = true
    outcome()
  }

  /** The document, opened if it is not there. Two figures arriving together open one */
  const ensure = (): Promise<void> => {
    opening ??= (async () => {
      if (await deps.offscreen.has()) return
      warmed = false
      await deps.offscreen.create()
    })().finally(() => { opening = null })
    return opening
  }

  /** The figure sent; once more when nobody answered — the document may close itself between the asking and the sending */
  const send = async (request: Job['request']): Promise<OcrRunResponse> => {
    await ensure()
    const answer = await deps.run(request).catch(() => undefined)
    if (answer) return answer
    await ensure()
    const again = await deps.run(request)
    if (!again) throw new Error('no page answered')
    return again
  }

  const pump = (): void => {
    if (current) return
    const job = queue.shift()
    if (!job) return
    current = job
    const next = (): void => {
      current = null
      pump()
    }
    const budget = warmed ? timeoutMs : firstTimeoutMs
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      settle(job, () => job.reject(new OcrBackendError('timeout', `the recogniser did not answer within ${budget} ms`)))
      // Whatever it is doing, it is not coming back: the document is closed, and only then is there a worker to give
      // the next figure to — a fresh one
      void deps.offscreen.close().catch(() => undefined).finally(next)
    }, budget)
    send(job.request).then(
      reply => {
        if (reply.ok) warmed = true
        settle(job, () => (reply.ok ? job.resolve(reply.result) : job.reject(new OcrBackendError(reply.kind, `recogniser: ${reply.message}`))))
      },
      (e: unknown) => settle(job, () => job.reject(new OcrBackendError('network', `the recogniser could not be reached: ${e instanceof Error ? e.message : String(e)}`))),
    ).finally(() => {
      clearTimeout(timer)
      // After a timeout the closing of the document moves the queue on, not this late answer
      if (!timedOut) next()
    })
  }

  return {
    version: OCR_VERSION,

    ocr: (request, scope) => new Promise((resolve, reject) => {
      queue.push({ request, scope, resolve, reject, settled: false })
      pump()
    }),

    cancel(scope) {
      let dropped = 0
      for (let i = queue.length - 1; i >= 0; i--) {
        const job = queue[i] as Job
        if (job.scope !== scope) continue
        queue.splice(i, 1)
        settle(job, () => job.reject(new OcrBackendError('aborted', 'session withdrawn')))
        dropped++
      }
      // The one in the worker cannot be called back: it is answered now, and its result dropped when it comes
      if (current && current.scope === scope && !current.settled) {
        const job = current
        settle(job, () => job.reject(new OcrBackendError('aborted', 'session withdrawn')))
        dropped++
      }
      return dropped
    },
  }
}
