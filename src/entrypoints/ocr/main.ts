// The offscreen document (DESIGN §15.3, §16). A service worker cannot host the recogniser — ONNX Runtime loads its glue
// with `import()`, which a service worker refuses (measured) — nor frame a page, so the background opens this page,
// which does two things: keep a worker and pass figures to it, and run the TeX page's warm-up (./tex-warm.ts), the page
// framed here. It closes itself once nothing has been asked of it for a while — the models and the runtime hold some
// 120 MB, and the background's own timers die with its worker —, and at once after a warm-up when no figure has been
// read in it.
import { onMessages, sendMessage } from '@/shared/messages'
import type { TexWarmResult } from '@/shared/tex-warm'
import type { OcrWorkerReply } from './protocol'
import { type TexFrame, warmTexPage } from './tex-warm'

/** Long enough to read on through a paper's figures without starting again, short enough not to keep 120 MB for a tab left open */
const IDLE_MS = 60_000

let worker: Worker | undefined
let next = 0
const waiting = new Map<number, (reply: OcrWorkerReply) => void>()
/** a warm-up of the TeX page runs: the document stays */
let warming = false
const closeIfIdle = () => { if (!warming && waiting.size === 0) window.close() }
// Counted from the opening too: a document opened for a figure that then never arrived would otherwise stay for good
let idle: ReturnType<typeof setTimeout> | undefined = setTimeout(closeIfIdle, IDLE_MS)

function engine(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data }: MessageEvent<OcrWorkerReply>) => {
    waiting.get(data.id)?.(data)
    waiting.delete(data.id)
  }
  // The worker itself failed — its script did not load, or it ran out of memory: everyone waiting is told, and the
  // next figure starts a new one
  worker.onerror = event => {
    for (const [id, settle] of waiting) settle({ id, ok: false, kind: 'unknown', message: event.message || 'the recognition worker failed' })
    waiting.clear()
    worker?.terminate()
    worker = undefined
  }
  return worker
}

/** the TeX page in a hidden frame; what it says heard from that frame and its origin only */
function texFrame(src: string): TexFrame {
  const frame = Object.assign(document.createElement('iframe'), { src, hidden: true })
  const origin = new URL(src).origin
  let handler: (data: unknown) => void = () => {}
  const listener = (e: MessageEvent) => { if (e.source === frame.contentWindow && e.origin === origin) handler(e.data) }
  addEventListener('message', listener)
  document.body.append(frame)
  return {
    post: (message, transfer = []) => frame.contentWindow?.postMessage(message, origin, transfer),
    listen: h => { handler = h },
    remove: () => { removeEventListener('message', listener); frame.remove() },
  }
}

onMessages({
  'axt:ocr-run': message => {
    clearTimeout(idle)
    const id = next++
    return new Promise<OcrWorkerReply>(resolve => {
      waiting.set(id, resolve)
      engine().postMessage({ id, image: message.image, mime: message.mime })
    }).then(reply => {
      if (waiting.size === 0) idle = setTimeout(closeIfIdle, IDLE_MS)
      return reply.ok ? { ok: true as const, result: reply.result, warm: reply.warm } : { ok: false as const, kind: reply.kind, message: reply.message }
    })
  },
  // Answered at once; how it ended is reported apart (axt:tex-warmed), since a warm-up outlasts any answer's wait
  'axt:tex-warm': ({ type: _, ...request }) => {
    if (warming) return Promise.resolve({ started: false })
    warming = true
    clearTimeout(idle)
    // the hints a pdfLaTeX paper's visit in that language sends, as the reader makes them; the typesetting's module
    // loaded for it alone, apart from the recogniser's
    void import('@/pdf-reader/engine/scripts.mjs')
      .then(({ texHints }) => warmTexPage({ ...request, ...texHints({ compiler: 'pdflatex' }, request.lang) }, { frame: texFrame, locks: navigator.locks, caches }))
      .catch((e: unknown): TexWarmResult => ({ ok: false, lang: request.lang, error: e instanceof Error ? e.message : String(e) }))
      .then(result => sendMessage({ type: 'axt:tex-warmed', result }).catch(() => undefined))
      .finally(() => {
        warming = false
        // no figure read here: nothing to keep; else the figures' own minute
        if (!worker) closeIfIdle()
        else if (waiting.size === 0) idle = setTimeout(closeIfIdle, IDLE_MS)
      })
    return Promise.resolve({ started: true })
  },
})
