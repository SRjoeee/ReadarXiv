// lab/pdf/layer-lab/v0-cost.mjs
// What the v0 view's drawing costs, in Playwright's Chromium at device pixel ratio 2, against a running lab server
// (serve.mjs with LAYER_PROTO naming the engine measured): every page of a fixture laid and drawn in turn as the view
// draws it at 100 % (a page's canvases let go once it is done), some pages drawn again at other zooms, and at the end
// the memory the run holds. An engine whose run has drawCopy is drawn as the view draws it now: the page rendered by
// PDF.js at the pane's device pixels, v0's drawing composed onto a copy of it; one without (before 2026-10-06) as the
// view drew it then: its copy at v0's own resolution encoded as a PNG and decoded as the page's image, kept for every
// page done. Times are medians and maxima in milliseconds; memory is the JS heap after a collection, the canvases and
// images the run and the view hold, and the browser's processes' resident memory (peak and at the end).
//   node lab/pdf/layer-lab/v0-cost.mjs --port=8093 --fixture=2307.16209v1-zh [--pages=<n>] [--again=8,2] [--zooms=2,4] [--out=<file.json>]
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const arg = (name, dflt) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? dflt
const PORT = Number(arg('port', 8093)), FIXTURE = arg('fixture', '2307.16209v1-zh'), PAGES = Number(arg('pages', 100000))
const AGAIN = arg('again', '').split(',').filter(Boolean).map(Number), ZOOMS = arg('zooms', '2,4').split(',').map(Number)
const OUT = arg('out', null)

/** the browser's processes' resident memory, KB: the browser and every process under it */
function rssOf(root) {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' }).trim().split('\n').map(l => l.trim().split(/\s+/).map(Number))
  const tree = new Set([root])
  for (let grew = true; grew; ) { grew = false; for (const [pid, ppid] of rows) if (tree.has(ppid) && !tree.has(pid)) { tree.add(pid); grew = true } }
  return rows.filter(([pid]) => tree.has(pid)).reduce((a, [, , rss]) => a + rss, 0)
}

// (a mark on the browser's command line, by which its process is found)
const MARK = `--axt-v0-cost=${process.pid}-${Date.now()}`
const browser = await chromium.launch({ args: ['--js-flags=--expose-gc', '--enable-precise-memory-info', MARK] })
const root = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).split('\n').map(l => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l)).filter(m => m?.[3].includes(MARK) && !m[3].includes('--type=')).map(m => Number(m[1]))[0] ?? null
const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1600, height: 1100 } })
const tab = await ctx.newPage()
tab.on('pageerror', e => console.log(`page error: ${e.message}`))
await tab.goto(`http://127.0.0.1:${PORT}/#f=${FIXTURE}&a=original&b=original&p=1&z=1&s=single`)
await tab.waitForSelector('html[data-ready="1"]', { timeout: 300_000 })
let peak = 0
const sampler = root ? setInterval(() => { try { peak = Math.max(peak, rssOf(root)) } catch {} }, 250) : null

const result = await tab.evaluate(async ({ fixture, pages, again, zooms }) => {
  const V = await import('/proto-engine/layer-proto/run.mjs')
  const pdfjs = await import('pdfjs-dist')
  const get = async (url, how) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r[how]() }
  const base = `/fixtures/${fixture}/`
  const [geometry, record, data] = await Promise.all([get(`${base}geometry.json`, 'json'), get(`${base}record.json`, 'json'), get(`${base}arxiv.pdf`, 'arrayBuffer')])
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), cMapUrl: '/pdfjs/cmaps/', standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/', ...V.PDF_OPTIONS }).promise
  const dpr = devicePixelRatio, PT = 96 / 72
  const run = await V.openProto({ doc, geometry, units: record.units, target: fixture.split('-').pop(), scale: 1.25, dpr, copy: false, faceUrl: f => `/fonts/${encodeURIComponent(f)}`, fontUrl: f => `/proto-fonts/${f}.otf`, hyphUrl: l => `/hyph/${l}.json` })
  const vector = typeof run.drawCopy === 'function'
  const N = Math.min(run.N, pages)
  const now = () => performance.now()
  /** the page as PDF.js renders it for a pane at zoom z (the lab's Pane.render), and the time it took */
  const source = async (p, z) => {
    const page = await doc.getPage(p)
    const vp = page.getViewport({ scale: z * PT * dpr })
    const c = document.createElement('canvas')
    c.width = Math.ceil(vp.width)
    c.height = Math.ceil(vp.height)
    const x = c.getContext('2d')
    x.fillStyle = '#ffffff'
    x.fillRect(0, 0, c.width, c.height)
    const t = now()
    await page.render({ canvasContext: x, viewport: vp }).promise
    // (one pixel read back: the rendering is done, not queued on the GPU)
    x.getImageData(0, 0, 1, 1)
    return { c, k: vp.scale, ms: now() - t }
  }
  const free = (...cs) => { for (const c of cs) if (c) { c.width = 0; c.height = 0 } }
  /** a page drawn as the view draws it: now, its copy composed at the pane's resolution; before, its image */
  const kept = new Map()
  const draw = async (p, z) => {
    const s = await source(p, z)
    const t = now()
    if (vector) {
      const copy = document.createElement('canvas')
      copy.width = s.c.width
      copy.height = s.c.height
      await run.drawCopy(p, copy.getContext('2d'), s.c, s.k)
      // (the copy read back once: the composition is done, not queued on the GPU)
      copy.getContext('2d').getImageData(0, 0, 1, 1)
      const ms = now() - t
      free(copy, s.c)
      return { render: s.ms, layer: ms }
    }
    let url = kept.get(p)?.url
    if (!url) {
      const blob = await new Promise(ok => run.rows[p - 1].right.toBlob(ok, 'image/png'))
      url = URL.createObjectURL(blob)
      kept.set(p, { url, bytes: blob.size })
    }
    const img = new Image()
    img.src = url
    await img.decode()
    const ms = now() - t
    free(s.c)
    return { render: s.ms, layer: ms }
  }
  const pageRows = [], done = new Set()
  for (let p = 1; p <= N; p++) {
    await run.until(p)
    // each page done (its last unit painted) drawn at 100 %, then let go: its lay is v0's own time for it (its rendering,
    // its characters, its units laid and painted)
    for (let q = 1; q <= N; q++) {
      if (done.has(q) || run.doneAt(q) > run.doneAt(p)) continue
      done.add(q)
      pageRows.push({ p: q, lay: run.pageMs[q], ...(await draw(q, 1)) })
      run.release(q)
    }
  }
  // the pages drawn again at other zooms after all are done (a released page, from its drawing's data)
  const later = []
  for (const p of again.filter(p => p <= N)) for (const z of zooms) later.push({ p, z, ...(await draw(p, z)) })
  globalThis.gc?.()
  await new Promise(ok => setTimeout(ok, 500))
  globalThis.gc?.()
  const canvases = run.rows.reduce((a, r) => a + [r.left, r.right].filter(Boolean).reduce((b, c) => b + c.width * c.height * 4, 0), 0)
  const ops = run.rows.reduce((a, r) => a + (r.ops?.length ?? 0), 0)
  const opsBytes = run.rows.reduce((a, r) => a + JSON.stringify(r.ops ?? []).length, 0)
  const svgBytes = run.rows.reduce((a, r) => a + r.svg.outerHTML.length, 0)
  const images = [...kept.values()].reduce((a, k) => a + k.bytes, 0)
  return { vector, N, pages: pageRows, later, memory: { heap: performance.memory?.usedJSHeapSize ?? null, canvases, images, ops, opsBytes, svgBytes } }
}, { fixture: FIXTURE, pages: PAGES, again: AGAIN, zooms: ZOOMS })

if (sampler) clearInterval(sampler)
const end = root ? rssOf(root) : null
await browser.close()
const stat = xs => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? { median: Math.round(s[Math.floor(s.length / 2)]), max: Math.round(s.at(-1)), total: Math.round(s.reduce((a, b) => a + b, 0)) } : null }
const MB = b => Math.round((b / 2 ** 20) * 10) / 10
const summary = {
  fixture: FIXTURE, path: result.vector ? 'vector (drawCopy at the pane\'s resolution)' : 'image (v0\'s copy at its own resolution, as a PNG)', pages: result.N,
  first: { lay: stat(result.pages.map(r => r.lay)), render: stat(result.pages.map(r => r.render)), layer: stat(result.pages.map(r => r.layer)), total: stat(result.pages.map(r => r.lay + r.render + r.layer)) },
  again: result.later.map(r => ({ page: r.p, zoom: r.z, render: Math.round(r.render), layer: Math.round(r.layer) })),
  memory: { heapMB: result.memory.heap && MB(result.memory.heap), canvasesMB: MB(result.memory.canvases), imagesMB: MB(result.memory.images), ops: result.memory.ops, opsMB: MB(result.memory.opsBytes), svgMB: MB(result.memory.svgBytes), rssPeakMB: peak ? Math.round(peak / 1024) : null, rssEndMB: end ? Math.round(end / 1024) : null },
}
console.log(JSON.stringify(summary, null, 1))
if (OUT) writeFileSync(OUT, JSON.stringify({ summary, pages: result.pages, later: result.later }, null, 1))
