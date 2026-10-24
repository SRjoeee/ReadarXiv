// lab/pdf/spikes/text-layer-cost.mjs
// The text layer's cost on a laid page (docs/PDF-READER.md §11.11; the route note's §4 budget: at most 5 ms of main-thread time a
// page and 2000 nodes, the engine's step at most 3 ms), in Chromium (Playwright's), on real pages: each page's text content read by
// the repository's PDF.js, its items kept compact (textlayer.mjs itemsOf), the page then taken as wholly translated (the hardest
// case for the engine's step: every line of text a drawn line), its plan made from its own text: each text line (items on one
// baseline, in the stream's order) hidden by an operation of its own (layer2.mjs hideOps' `hidden`), six lines a unit, each unit's lines drawn as segments of the
// same text over the same boxes. Measured, the median of `--runs` (5):
//   - engine: textLayerOf's time (the door's textOf is this and a copy), its items by kind, the bytes its compact items hold;
//   - host: the view's textLayer (text-layer.mjs: PDF.js's own TextLayerBuilder over the items, the place's viewport) built, put in
//     a place of the page's size inside a PDF.js page box (pdf_viewer.css and engine.css loaded) and laid out (a forced layout
//     after), its nodes.
// Synthetic in its plan alone (no layout file, no translation: the pages' own text stands for both), so that it needs nothing but a
// PDF; the real door's plan has fewer operations (a unit's lines are erased by its rectangles, not one operation a line).
// `--plan=translated` (the default) draws every unit; `kept` none (every item kept: the host's hardest case, a span an item);
// `half` every other unit (kept and translated items interleaved, the reading order's work).
//   pnpm exec tsx lab/pdf/spikes/text-layer-cost.mjs <file.pdf>:<page>[,<page>...] ... [--runs=5] [--scale=2] [--plan=translated|kept|half]
// Prints one JSON line a page. The record of a run: lab/pdf/records/text-layer.md.
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const PDFJS = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
const argOf = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const RUNS = Number(argOf('runs') ?? 5), SCALE = Number(argOf('scale') ?? 2), PLAN = argOf('plan') ?? 'translated'
const JOBS = process.argv.slice(2).filter(a => !a.startsWith('--')).map(a => { const at = a.lastIndexOf(':'); return { file: resolve(a.slice(0, at)), pages: a.slice(at + 1).split(',').map(Number) } })
if (!JOBS.length || JOBS.some(j => !existsSync(j.file) || j.pages.some(p => !Number.isInteger(p) || p < 1))) { console.error('usage: text-layer-cost.mjs <file.pdf>:<page>[,<page>...] ... [--runs=5] [--scale=2]'); process.exit(2) }

const PAGE = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="/pdfjs/web/pdf_viewer.css"><link rel="stylesheet" href="/src/pdf-reader/engine/view/engine.css">
<body style="margin:0"><div class="pdfViewer" id="stack"></div>
<script type="module">
import * as pdfjs from '/pdfjs/build/pdf.mjs'
pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.mjs'
globalThis.pdfjsLib = pdfjs
const viewer = await import('/pdfjs/web/pdf_viewer.mjs')
const TL = await import('/src/pdf-reader/engine/layer-proto/textlayer.mjs')
const { textLayer } = await import('/src/pdf-reader/engine/view/text-layer.mjs')
const median = xs => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]
window.cost = {
  async page(name, n, runs, scale, plan) {
    const data = new Uint8Array(await (await fetch('/pdf/' + name)).arrayBuffer())
    // (the document let go once its page is measured, or the measure fails: no worker of a page before weighs on the next)
    const task = pdfjs.getDocument({ data, cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', verbosity: 0 })
    try { return await this.measure(await task.promise, n, runs, scale, plan) } finally { await task.destroy() }
  },
  async measure(doc, n, runs, scale, plan) {
    const page = await doc.getPage(n), tc = await page.getTextContent(), view = page.view
    const vp = page.getViewport({ scale: 2.5 }), devOf = (x, y) => vp.convertToViewportPoint(x, y)
    const t0 = performance.now(), items = TL.itemsOf(tc), tItems = performance.now() - t0
    // the plan: each text line hidden by an operation of its own, six lines a unit, each line drawn as a segment of its own text
    const lines = []
    for (let i = 0; i < items.n; i++) {
      const o = i * 6, x = items.num[o], base = items.num[o + 1], w = items.num[o + 2], size = items.num[o + 3]
      const last = lines.at(-1)
      if (last && Math.abs(last.base - base) < 0.3 * size) { last.x0 = Math.min(last.x0, x); last.x1 = Math.max(last.x1, x + w); last.str += items.str[i]; last.size = Math.max(last.size, size) }
      else lines.push({ x0: x, x1: x + w, base, size, str: items.str[i] })
    }
    const ops = [], owners = [], drawn = []
    lines.forEach((l, k) => {
      const [ax, ay] = devOf(l.x0 - 1, l.base + 0.9 * l.size), [bx, by] = devOf(l.x1 + 1, l.base - 0.3 * l.size)
      const u = Math.floor(k / 6)
      if (plan === 'kept' || (plan === 'half' && u % 2)) return
      if (!drawn[u]) { drawn[u] = { key: 'u' + u, unit: u, segs: [] }; owners.push([ops.length, ops.length, 'u' + u]) }
      ops.push({ op: 'hidden', rects: [[Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)]] })
      owners.at(-1)[1] = ops.length
      drawn[u].segs.push({ str: l.str, x: l.x0, y: l.base - 0.22 * l.size, w: l.x1 - l.x0, h: 0.97 * l.size, base: l.base, size: l.size, lx0: l.x0, lx1: l.x1 })
    })
    const engine = [], host = [], layout = []
    let out = null, nodes = 0
    for (let r = 0; r < runs; r++) {
      const a = performance.now()
      out = TL.textLayerOf({ n, items, view }, { ops, devOf, owners }, drawn.filter(Boolean))
      engine.push(performance.now() - a)
    }
    // the place: a PDF.js page box at the pane's scale, the layer's wrapper in it (engine.css: .axt-layer)
    const stack = document.getElementById('stack')
    stack.style.setProperty('--scale-factor', String(scale))
    const shown = page.getViewport({ scale: scale * 96 / 72 })
    for (let r = 0; r < runs; r++) {
      stack.replaceChildren()
      const place = document.createElement('div'), wrap = document.createElement('div')
      place.className = 'page'
      place.style.width = shown.width + 'px'; place.style.height = shown.height + 'px'
      wrap.className = 'axt-layer'
      wrap.style.setProperty('--axt-frame-w', 'calc(var(--total-scale-factor) * ' + (view[2] - view[0]) + 'px)')
      wrap.style.setProperty('--axt-frame-h', 'calc(var(--total-scale-factor) * ' + (view[3] - view[1]) + 'px)')
      place.append(wrap); stack.append(place)
      document.body.getBoundingClientRect()
      await new Promise(r => setTimeout(r, 30))
      const a = performance.now()
      const built = await textLayer(out, { viewport: shown, Builder: viewer.TextLayerBuilder, lang: 'zh' })
      const b = performance.now()
      // (a page with nothing to place has no layer: no host time to measure)
      if (!built) { nodes = 0; break }
      wrap.append(built.div)
      built.div.getBoundingClientRect()
      const c = performance.now()
      host.push(c - a); layout.push(c - b)
      nodes = built.div.querySelectorAll('*').length
      built.cancel()
    }
    const bytes = items.num.byteLength + items.str.reduce((s, x) => s + 2 * x.length + 40, 0)
    return { page: n, items: items.n, lines: lines.length, ops: ops.length, out: out.items.length, stats: out.stats, msItems: +tItems.toFixed(2), msEngine: +median(engine).toFixed(2), msHost: host.length ? +median(host).toFixed(2) : null, msLayout: layout.length ? +median(layout).toFixed(2) : null, nodes, bytes }
  },
}
window.ready = true
</script>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
const files = new Map(JOBS.map((j, i) => [`${i}.pdf`, j.file]))
const TYPES = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }
await page.route('http://text-layer-cost.local/**', route => {
  const path = new URL(route.request().url()).pathname
  if (path === '/') return route.fulfill({ contentType: 'text/html', body: PAGE })
  if (path.startsWith('/pdf/')) return route.fulfill({ contentType: 'application/pdf', body: readFileSync(files.get(path.slice(5))) })
  const f = path.startsWith('/pdfjs/') ? join(PDFJS, path.slice(7)) : path.startsWith('/src/') ? join(ROOT, path) : null
  return f && existsSync(f) ? route.fulfill({ contentType: TYPES[extname(f)] ?? 'application/octet-stream', body: readFileSync(f) }) : route.fulfill({ status: 404 })
})
await page.goto('http://text-layer-cost.local/')
await page.waitForFunction(() => window.ready, null, { timeout: 60_000 })
console.log(JSON.stringify({ chromium: browser.version(), runs: RUNS, scale: SCALE, plan: PLAN }))
for (const [i, j] of JOBS.entries()) for (const n of j.pages) console.log(JSON.stringify({ file: j.file.split('/').slice(-2).join('/'), ...(await page.evaluate(([name, n, runs, scale, plan]) => window.cost.page(name, n, runs, scale, plan), [`${i}.pdf`, n, RUNS, SCALE, PLAN])) }))
await browser.close()
