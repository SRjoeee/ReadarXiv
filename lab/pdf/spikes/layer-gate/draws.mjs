// lab/pdf/spikes/layer-gate/draws.mjs
// The draw geometry of each page of arXiv's PDF (E-C: src/pdf-reader/engine/pipeline/draw-data.mjs), read as the prepare's
// container reads it, for the layer gate's --door-draw: the measured engine's lite worker made this process's PDF.js worker
// (layout/pdf-lite.mjs: no image's pixels decoded, a link's overlaid text as that worker gives it), the document opened with
// maxImageSize NO_IMAGE_PIXELS, useSystemFonts false, fontExtraProperties and the packed cMaps, each page's draw read once its
// operator list is (its fonts are in commonObjs only then). A process of its own: PDF.js takes a process's worker at its first
// document, and the gate's own reads keep the stock one.
//   node lab/pdf/spikes/layer-gate/draws.mjs <engine worktree> <arxiv.pdf> <out.json>
// Writes { pdfjs, pages: [{ draw, why }] }, page 1 first: `draw` the draw as a left part carries it (draw.mjs, the writer's
// wireOf), or null with drawDataOf's why.
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const [engine, pdf, out] = process.argv.slice(2)
if (!engine || !pdf || !out) throw new Error('usage: draws.mjs <engine worktree> <arxiv.pdf> <out.json>')
const require = createRequire(import.meta.url)
const E = f => join(engine, 'src/pdf-reader/engine', f)
const version = JSON.parse(readFileSync(require.resolve('pdfjs-dist/package.json'), 'utf8')).version
const { liteWorkerSource, NO_IMAGE_PIXELS } = await import(E('layout/pdf-lite.mjs'))
globalThis.pdfjsWorker = await import(`data:text/javascript;base64,${Buffer.from(liteWorkerSource(readFileSync(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'), 'utf8'), { version })).toString('base64')}`)
const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
const { drawDataOf } = await import(E('pipeline/draw-data.mjs'))
const NM = dirname(require.resolve('pdfjs-dist/package.json'))
const task = getDocument({ data: new Uint8Array(readFileSync(pdf)), maxImageSize: NO_IMAGE_PIXELS, verbosity: 0, cMapUrl: `${NM}/cmaps/`, cMapPacked: true, standardFontDataUrl: `${NM}/standard_fonts/`, useSystemFonts: false, fontExtraProperties: true })
const doc = await task.promise
const pages = []
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p)
  await page.getOperatorList()
  pages.push(await drawDataOf(page))
  page.cleanup()
}
await task.destroy()
writeFileSync(out, JSON.stringify({ pdfjs: version, pages }))
