// The worker the recogniser runs in (DESIGN §15.3): ONNX Runtime's WebAssembly build, one thread, every file from the
// extension's own package. The runtime is the `bundle` build, whose glue is in this chunk and whose `.wasm` the
// bundler emits beside it and points the runtime at — no `wasmPaths`, which would make the runtime `import()` its
// glue from that path and need a second copy of 14 MB there. One thread: more need the page cross-origin isolated,
// by manifest keys that would bind the popup and the settings page too, and a figure takes a third of a second as
// it is (measured).
import * as ort from 'onnxruntime-web/wasm'
import { createRecogniser, readFigure, type Recogniser } from '@/core/ocr'
import type { OcrWorkerReply, OcrWorkerRequest } from './protocol'

const asset = (name: string): string => new URL(`/ocr/${name}`, self.location.origin).href

let recogniser: Promise<Recogniser> | undefined
/** The recogniser has started: said with every answer, for the background gives a figure a longer budget until it has */
let warm = false
function ready(): Promise<Recogniser> {
  recogniser ??= (async () => {
    ort.env.wasm.numThreads = 1
    const [detection, recognition, dictionary] = await Promise.all([
      fetch(asset('PP-OCRv6_tiny_det.onnx')).then(r => r.arrayBuffer()),
      fetch(asset('PP-OCRv6_tiny_rec.onnx')).then(r => r.arrayBuffer()),
      fetch(asset('PP-OCRv6_tiny_dict.txt')).then(r => r.text()),
    ])
    const started = await createRecogniser({ ort, detection, recognition, dictionary })
    warm = true
    return started
  })()
  // A failed start is not remembered: the next figure tries again
  recogniser.catch(() => { recogniser = undefined })
  return recogniser
}

self.onmessage = async ({ data }: MessageEvent<OcrWorkerRequest>) => {
  const reply = (message: OcrWorkerReply) => self.postMessage(message)
  let image: Blob
  try {
    image = await (await fetch(`data:${data.mime};base64,${data.image}`)).blob()
  } catch {
    reply({ id: data.id, ok: false, kind: 'bad-request', message: 'the image bytes are not base64' })
    return
  }
  try {
    const result = await readFigure(image, ready)
    reply({ id: data.id, ok: true, result, warm })
  } catch (e) {
    // A file the browser cannot decode is the request's fault; anything else is the recogniser's
    const undecodable = e instanceof DOMException && (e.name === 'InvalidStateError' || e.name === 'EncodingError')
    reply({ id: data.id, ok: false, kind: undecodable ? 'bad-request' : 'unknown', message: e instanceof Error ? e.message : String(e) })
  }
}
