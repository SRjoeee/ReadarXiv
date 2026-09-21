// The offscreen document of image translation (DESIGN §15.3). A service worker cannot host the recogniser — ONNX
// Runtime loads its glue with `import()`, which a service worker refuses (measured) — so the background opens this
// page, which does one thing: keep a worker and pass figures to it. It closes itself once nothing has been asked of
// it for a while: the models and the runtime hold some 120 MB, and the background's own timers die with its worker.
import { onMessages } from '@/shared/messages'
import type { OcrWorkerReply } from './protocol'

/** Long enough to read on through a paper's figures without starting again, short enough not to keep 120 MB for a tab left open */
const IDLE_MS = 60_000

let worker: Worker | undefined
let next = 0
const waiting = new Map<number, (reply: OcrWorkerReply) => void>()
// Counted from the opening too: a document opened for a figure that then never arrived would otherwise stay for good
let idle: ReturnType<typeof setTimeout> | undefined = setTimeout(() => window.close(), IDLE_MS)

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

onMessages({
  'axt:ocr-run': message => {
    clearTimeout(idle)
    const id = next++
    return new Promise<OcrWorkerReply>(resolve => {
      waiting.set(id, resolve)
      engine().postMessage({ id, image: message.image, mime: message.mime })
    }).then(reply => {
      if (waiting.size === 0) idle = setTimeout(() => window.close(), IDLE_MS)
      return reply.ok ? { ok: true as const, result: reply.result } : { ok: false as const, kind: reply.kind, message: reply.message }
    })
  },
})
