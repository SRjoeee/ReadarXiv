// The worker the reader's bitmap recogniser runs in: the extension's own recogniser (src/core/ocr, compiled into
// lib/axt by spikes/build-shared.mjs), ONNX Runtime's WebAssembly build, one thread, everything from the package.
// → { id, bitmap } ← { id, lines } (src/shared/ocr.ts OcrLine) or { id, error }
import * as ort from './lib/ocr/ort.wasm.bundle.min.mjs'
import { createRecogniser } from './lib/axt/ocr-core.mjs'

let recogniser = null
const asset = name => new URL(`./lib/ocr/${name}`, import.meta.url).href
function ready() {
  recogniser ??= (async () => {
    ort.env.wasm.numThreads = 1
    const [detection, recognition, dictionary] = await Promise.all([fetch(asset('PP-OCRv6_tiny_det.onnx')).then(r => r.arrayBuffer()), fetch(asset('PP-OCRv6_tiny_rec.onnx')).then(r => r.arrayBuffer()), fetch(asset('PP-OCRv6_tiny_dict.txt')).then(r => r.text())])
    return createRecogniser({ ort, detection, recognition, dictionary })
  })()
  recogniser.catch(() => { recogniser = null })
  return recogniser
}
self.onmessage = async ({ data }) => {
  try { self.postMessage({ id: data.id, lines: await (await ready()).recognise(data.bitmap) }) }
  catch (e) { self.postMessage({ id: data.id, error: String(e?.stack ?? e).slice(0, 300) }) }
  finally { data.bitmap.close?.() }
}
