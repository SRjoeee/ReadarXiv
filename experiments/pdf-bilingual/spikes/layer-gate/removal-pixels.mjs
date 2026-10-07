// experiments/pdf-bilingual/spikes/layer-gate/removal-pixels.mjs
// The text-removed PDF's exactness check in pixels (layer-gate.mjs --removal), apart from the browser: each removed page of
// an add-on drawn by PDF.js in Node at the gate's 2.5 device pixels a PDF unit (its canvas draws a page alike every time;
// the browser's flickers in a figure's pixels), against the original page, outside the removed glyphs' own ink (the
// footprint page, drawn on white and on black, a pixel around). Writes per page { differing, outside, at }.
//   node removal-pixels.mjs <combined.pdf> <manifest.json> <out.json>
import { readFileSync, writeFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { footprintOf, outsideOf } from './measure.mjs'

const [pdf, manifestFile, outFile] = process.argv.slice(2)
const PDFJS = new URL('../../../../node_modules/pdfjs-dist/', import.meta.url).pathname
const K = 2.5
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
const doc = await getDocument({ data: new Uint8Array(readFileSync(pdf)), verbosity: 0, cMapUrl: `${PDFJS}cmaps/`, cMapPacked: true, standardFontDataUrl: `${PDFJS}standard_fonts/`, useSystemFonts: false }).promise
const draw = async (n, bg = '#ffffff') => {
  const page = await doc.getPage(n), vp = page.getViewport({ scale: K })
  const cv = doc.canvasFactory.create(Math.floor(vp.width), Math.floor(vp.height))
  cv.context.fillStyle = bg
  cv.context.fillRect(0, 0, cv.canvas.width, cv.canvas.height)
  await page.render({ canvasContext: cv.context, canvas: cv.canvas, viewport: vp, background: bg }).promise
  return { d: cv.context.getImageData(0, 0, cv.canvas.width, cv.canvas.height).data, W: cv.canvas.width, H: cv.canvas.height, view: page.view }
}
const out = {}
const t0 = performance.now()
for (const [p, m] of Object.entries(manifest.page)) {
  if (!m.ok) continue
  const q = Number(p)
  const O = await draw(q), Rm = await draw(manifest.sets.R + q), Fw = await draw(manifest.sets.F + q), Fb = await draw(manifest.sets.F + q, '#000000')
  out[p] = outsideOf({ k: K, view: O.view, W: O.W, H: O.H, O: O.d, Rm: Rm.d, foot: footprintOf(Fw.d, Fb.d, O.W, O.H) })
}
writeFileSync(outFile, JSON.stringify({ ms: Math.round(performance.now() - t0), pages: out }))
await doc.loadingTask.destroy()
