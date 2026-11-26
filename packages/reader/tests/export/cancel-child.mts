// Run by run.test.ts in a Node of its own (PDF.js's in-process worker, Node's, rejects "Worker was terminated" unhandled once a
// document it is loading is destroyed, which a test runner counts against the run; the browser's worker keeps that to itself):
// the pinned PDF.js 6.3.289 decodes a slice's brotli for fontsOnWorker on a PDFWorker of the caller's, as the reader's kit
// gives one; the first decoding is cancelled the moment its loading task has its transport and before its promise settles
// (#686, 4706206031), and a second is made after it. Prints what each came to, the worker's opens and closes, and whether
// every PDFWorker made was ended.
import { brotliCompressSync } from 'node:zlib'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { fontsOnWorker } from '../../src/export/run.ts'

process.on('unhandledRejection', () => {})
const made: { destroyed: boolean }[] = []
const log: string[] = []
const worker = {
  current: null as null | InstanceType<typeof pdfjs.PDFWorker>,
  open() {
    log.push('open')
    this.current = new pdfjs.PDFWorker()
    made.push(this.current)
    return { worker: this.current }
  },
  close() {
    log.push('close')
    this.current?.destroy()
  },
}
const tasks: { _transport?: unknown }[] = []
const spy = {
  getDocument: (src: Parameters<typeof pdfjs.getDocument>[0]) => {
    const t = pdfjs.getDocument(src)
    tasks.push(t as never)
    return t
  },
}
// (a slice the decoding reaches: WOFF2's signature and a directory of one table, its brotli stream a table's bytes)
const table = new Uint8Array(64).fill(7)
const stream = new Uint8Array(brotliCompressSync(table))
const head = new Uint8Array(48 + 6)
const v = new DataView(head.buffer)
v.setUint32(0, 0x774f4632)
v.setUint32(4, 0x00010000)
v.setUint16(12, 1)
v.setUint32(20, stream.length)
head.set([63, 0x7a, 0x7a, 0x7a, 0x7a, 64], 48)
const woff2 = new Uint8Array(head.length + stream.length)
woff2.set(head, 0)
woff2.set(stream, head.length)
const slices = [{ key: 'k', woff2 }]

const within = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p.then((x) => ({ x }), (e: Error) => ({ e: e.name || e.message })), new Promise((r) => setTimeout(() => r('hung'), ms))])
const a = new AbortController()
const first = fontsOnWorker(spy as never, worker, slices, a.signal)
let n = 0
for (; n < 200000 && !tasks[0]?._transport; n++) await Promise.resolve()
const transportSet = !!tasks[0]?._transport
a.abort()
const firstCame = await within(first, 3000)
const secondCame = await within(fontsOnWorker(spy as never, worker, slices, new AbortController().signal), 5000)
await new Promise((r) => setTimeout(r, 100))
console.log(
  JSON.stringify({
    transportSet,
    first: typeof firstCame === 'string' ? firstCame : 'e' in (firstCame as object) ? 'cancelled' : 'made',
    second: typeof secondCame === 'string' ? secondCame : 'e' in (secondCame as object) ? `failed` : 'made',
    log,
    allEnded: made.every((w) => w.destroyed),
  }),
)
process.exit(0)
