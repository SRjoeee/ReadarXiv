// PDF.js's worker without the images' pixels for the lab's ink reads (src/pdf-reader/engine/layout/pdf-lite.mjs). A spike that opens
// arXiv's PDF or a marked compile to read its ink imports this and spreads LITE into getDocument; AXT_STOCK_PDFJS=1 makes both a
// no-op (the stock reading, to compare). A spike that renders keeps stock PDF.js and does not import this.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { liteWorkerSource, NO_IMAGE_PIXELS } from '../../../src/pdf-reader/engine/layout/pdf-lite.mjs'

const require = createRequire(import.meta.url)
const stock = process.env.AXT_STOCK_PDFJS === '1'
/** getDocument's option for a document read without its images' pixels (empty when the stock reading is asked for) */
export const LITE = stock ? {} : { maxImageSize: NO_IMAGE_PIXELS }
/** getDocument's option for the lite reading whatever AXT_STOCK_PDFJS says (the comparison's own side) */
export const LITE_ALWAYS = { maxImageSize: NO_IMAGE_PIXELS }

/** the lite worker made the process's PDF.js worker, once, before the first getDocument */
async function install() {
  const version = JSON.parse(readFileSync(require.resolve('pdfjs-dist/package.json'), 'utf8')).version
  const source = liteWorkerSource(readFileSync(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'), 'utf8'), { version })
  globalThis.pdfjsWorker = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
await install()
