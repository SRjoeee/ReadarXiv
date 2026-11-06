// lab/pdf/prepare-back/ranges.mjs: the add-on read by ranges (interfaces/page/DECISION.md, "from C" 2; stage 1a's exit): the
// composed document (arXiv's bytes followed by the add-on's) opened by PDF.js over a range transport that serves and records
// every range it asks (no auto-fetch, no stream, 64 KiB chunks, as a reader over the network), page 1 drawn's worth read (its
// operator list with the add-on's optional content set); the bytes it read of the add-on and of arXiv's file, against the
// add-on's size.
//   node --import tsx lab/pdf/prepare-back/ranges.mjs <candidate out> <papers.tsv> <id>…
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { getDocument, PDFDataRangeTransport } from 'pdfjs-dist/legacy/build/pdf.mjs'

const [OUT, LIST] = process.argv.slice(2)
const IDS = process.argv.slice(4)
const dirs = new Map(readFileSync(LIST, 'utf8').split('\n').filter(Boolean).map(l => l.split('\t')))
const PDFJS = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
const CHUNK = 65536
for (const id of IDS) {
  const A = new Uint8Array(readFileSync(join(dirs.get(id), 'arxiv.pdf')))
  const bdir = join(OUT, 'bundles', id)
  const addOnFile = existsSync(bdir) ? readdirSync(bdir).find(f => f.endsWith('.addon')) : null
  if (!addOnFile) { console.log(JSON.stringify({ id, refused: 'no add-on' })); continue }
  const add = readFileSync(join(bdir, addOnFile))
  const W = new Uint8Array(A.length + add.length)
  W.set(A)
  W.set(add, A.length)
  const asked = []
  // (the first chunk given with the document's length, as a reader's first range would be: the file's head)
  const transport = new PDFDataRangeTransport(W.length, W.subarray(0, CHUNK))
  transport.requestDataRange = (begin, end) => {
    asked.push([begin, end])
    queueMicrotask(() => transport.onDataRange(begin, W.subarray(begin, end)))
  }
  const task = getDocument({ range: transport, length: W.length, disableAutoFetch: true, disableStream: true, rangeChunkSize: CHUNK, cMapUrl: join(PDFJS, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(PDFJS, 'standard_fonts/'), verbosity: 0 })
  const doc = await task.promise
  const config = await doc.getOptionalContentConfig({ intent: 'display' })
  const page = await doc.getPage(1)
  await page.getOperatorList({ optionalContentConfigPromise: Promise.resolve(config) })
  await task.destroy()
  const ranges = [[0, CHUNK], ...asked]
  const inAddOn = ranges.reduce((n, [b, e]) => n + Math.max(0, Math.min(e, W.length) - Math.max(b, A.length)), 0)
  const inA = ranges.reduce((n, [b, e]) => n + Math.max(0, Math.min(e, A.length) - b), 0)
  console.log(JSON.stringify({ id, pages: doc.numPages, arxiv: A.length, addOn: add.length, ranges: ranges.length, addOnRead: inAddOn, addOnShare: +(inAddOn / add.length).toFixed(3), arxivRead: inA, arxivShare: +(inA / A.length).toFixed(3) }))
}
