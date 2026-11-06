// lab/pdf/prepare-back/split-probe.mjs: where PDF.js's canvas puts each glyph, on arXiv's page A and on the composed document W
// (A + its add-on, every group ON), in Chromium: every fillText call recorded with the transform in force and its (x, y), so
// that the device position PDF.js computes for the same glyph with and without the wrap's split can be compared number for
// number. Per page: the glyphs whose device position differs at all, the largest difference, and the glyphs that change
// Skia's subpixel bucket (a quarter pixel across, Chromium's text positioning) or its whole pixel.
//   node --import tsx lab/pdf/prepare-back/split-probe.mjs <candidate out> <papers.tsv> <id> [pages a-b] [--list=<n>]
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright'

const [OUT, LIST, ID, RANGE] = process.argv.slice(2).filter(a => !a.startsWith('--'))
const LISTN = Number(process.argv.find(a => a.startsWith('--list='))?.slice(7) ?? 0)
const dirs = new Map(readFileSync(LIST, 'utf8').split('\n').filter(Boolean).map(l => l.split('\t')))
const PDFJS = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
const PAGE = `<!doctype html><meta charset="utf-8"><script type="module">
import * as pdfjs from '/pdfjs/build/pdf.mjs'
pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.mjs'
const docs = new Map()
let log = null
const fill = CanvasRenderingContext2D.prototype.fillText
CanvasRenderingContext2D.prototype.fillText = function (s, x, y, ...r) {
  if (log) { const m = this.getTransform(); log.push([s, x, y, m.a, m.b, m.c, m.d, m.e, m.f, String(this.fillStyle), this.font, this.globalAlpha, this.globalCompositeOperation]) }
  return fill.call(this, s, x, y, ...r)
}
window.probe = {
  async open(id, name) { const data = new Uint8Array(await (await fetch('/pdf/' + name)).arrayBuffer()); docs.set(id, await pdfjs.getDocument({ data, cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', isImageDecoderSupported: false }).promise); return docs.get(id).numPages },
  async glyphs(id, n) {
    const doc = docs.get(id), page = await doc.getPage(n), vp = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height)
    log = []
    await page.render({ canvasContext: canvas.getContext('2d'), canvas, viewport: vp }).promise
    const out = log; log = null; page.cleanup()
    return out
  },
}
</script>`

const A = new Uint8Array(readFileSync(join(dirs.get(ID), 'arxiv.pdf')))
const bdir = join(OUT, 'bundles', ID)
const add = readFileSync(join(bdir, readdirSync(bdir).find(f => f.endsWith('.addon'))))
const W = new Uint8Array(A.length + add.length)
W.set(A)
W.set(add, A.length)
const files = new Map([['a.pdf', A], ['w.pdf', W]])
const browser = await chromium.launch({ channel: 'chromium' })
try {
  const page = await browser.newPage()
  await page.route('http://probe.local/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: PAGE })
    if (path.startsWith('/pdf/')) return route.fulfill({ contentType: 'application/pdf', body: Buffer.from(files.get(path.slice(5))) })
    const f = join(PDFJS, path.slice('/pdfjs/'.length))
    return existsSync(f) ? route.fulfill({ contentType: f.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream', body: readFileSync(f) }) : route.fulfill({ status: 404 })
  })
  await page.goto('http://probe.local/')
  await page.waitForFunction(() => window.probe)
  const call = (fn, ...a) => page.evaluate(([f, x]) => window.probe[f](...x), [fn, a])
  const N = await call('open', 'A', 'a.pdf')
  await call('open', 'W', 'w.pdf')
  const [p0, p1] = RANGE ? RANGE.split('-').map(Number) : [1, N]
  for (let p = p0; p <= (p1 ?? p0); p++) {
    const a = await call('glyphs', 'A', p), w = await call('glyphs', 'W', p)
    const dev = r => [r[3] * r[1] + r[5] * r[2] + r[7], r[4] * r[1] + r[6] * r[2] + r[8]]
    let differ = 0, max = 0, bucket = 0, pixel = 0
    const shown = [], rounded = [], nearEdge = []
    for (let i = 0; i < Math.min(a.length, w.length); i++) {
      const [ax, ay] = dev(a[i]), [wx, wy] = dev(w[i])
      const d = Math.max(Math.abs(ax - wx), Math.abs(ay - wy))
      if (a[i][0] !== w[i][0]) { shown.push(['other glyph', i, a[i][0], w[i][0]]); break }
      // (and the state it is painted in: its fill, font, alpha, compositing)
      if (a[i].slice(9).join('|') !== w[i].slice(9).join('|') && shown.length < LISTN + 3) shown.push({ i, state: [a[i].slice(9), w[i].slice(9)] })
      if (d === 0) continue
      differ++
      if (d > max) max = d
      if (Math.floor(ax * 4) !== Math.floor(wx * 4) || Math.floor(ay * 4) !== Math.floor(wy * 4)) bucket++
      if (Math.floor(ax) !== Math.floor(wx) || Math.floor(ay) !== Math.floor(wy)) pixel++
      // (how near each device coordinate stands to where Skia's text positioning rounds it: a quarter pixel across, with an
      // eighth's bias, and a whole pixel up, at its half)
      const nearQ = v => { const f = (v * 4 + 0.5) % 1; return Math.min(f, 1 - f) / 4 }
      const nearH = v => { const f = (v + 0.5) % 1; return Math.min(f, 1 - f) }
      const crossQ = Math.floor(ax * 4 + 0.5) !== Math.floor(wx * 4 + 0.5), crossH = Math.floor(ay + 0.5) !== Math.floor(wy + 0.5) || Math.floor(ax + 0.5) !== Math.floor(wx + 0.5)
      if (crossQ || crossH) rounded.push({ i, ch: a[i][0], A: [ax, ay], W: [wx, wy], crossQ, crossH })
      // (within float32's reach of a boundary: Skia keeps the matrix and the glyph's origin in float32)
      const edge = v => Math.min(...[0, 0.125].map(b => { const f = ((v + b) * 4) % 1; return Math.min(f, 1 - f) / 4 }), (() => { const f = (v + 0.5) % 1; return Math.min(f, 1 - f) })())
      const near = Math.min(edge(ax), edge(ay), edge(wx), edge(wy))
      if (near < 2e-4) nearEdge.push({ i, ch: a[i][0], A: [ax, ay], W: [wx, wy], near })
      if (shown.length < LISTN) shown.push({ i, ch: a[i][0], A: { x: a[i][1], e: a[i][7], dev: [ax, ay] }, W: { x: w[i][1], e: w[i][7], dev: [wx, wy] }, d, nearQ: Math.min(nearQ(ax), nearQ(wx)), nearH: Math.min(nearH(ay), nearH(wy)) })
    }
    if (differ || a.length !== w.length) console.log(JSON.stringify({ page: p, glyphs: [a.length, w.length], differ, max, bucket, pixel, rounded: rounded.length, nearEdge: nearEdge.length, ...(nearEdge.length ? { nearAt: nearEdge.slice(0, 12) } : {}), ...(rounded.length ? { roundedAt: rounded.slice(0, 8) } : {}), ...(shown.length ? { shown } : {}) }))
  }
} finally { await browser.close() }
