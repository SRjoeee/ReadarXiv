// lab/pdf/spikes/layer-gate/door-parts.mjs
// The layer gate's page for the door in parts (--door-parts; src/pdf-reader/engine/layer-proto/reader.mjs, BUNDLE 4; the door
// design's H3): a fixture cut into BUNDLE 4's objects by the driver (cut.mjs cutBundle at one schedule, no chained add-on: a
// clean page's entry carried, a removed one refused), read here as a host reads them (format.mjs: the units' chunks, the head,
// indexOf, each part against the chain), and its pages drawn twice, each in a page load of its own: door A, openLayer over the
// cut made whole again (mergeParts, BUNDLE 3's open), and door B, openLayer over the index with no part, each part told when the
// run waits for one (addPart: every part late, as a slow prepare tells them). The rows are the record's, all taken, then end().
// Each page's answer: its SVG's markup, copyOf's pixels over the page as door A's load had PDF.js draw it (its PNG, so that both
// copies start from the same pixels), and the digest of the run's records of the units on the page (the run is reached through
// the driver's stand-in of run.mjs, which keeps each run it opens and tells this page what the run waits for). Door B also
// keeps its log: each page's state as the door told it and each wait of the run, so the driver checks Q1 (a page told laying
// is ready before the run waits for a part)
import * as pdfjs from 'pdfjs-dist'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.mjs'
const PDF_ASSETS = { cMapUrl: '/pdfjs/cmaps/', standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/' }
/** device pixels a PDF unit: the gate's, v0's canvases at scale 2.5 and dpr 1 */
const K = 2.5
const bytes = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()) }
const json = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json() }
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
const digest = async data => hex(await crypto.subtle.digest('SHA-256', data))
const textDigest = s => digest(new TextEncoder().encode(s))
/** a canvas as PNG (lossless), its bytes */
const pngOf = async c => new Uint8Array(await (await new Promise(ok => c.toBlob(ok, 'image/png'))).arrayBuffer())
const base64 = b => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s) }
/** PNG bytes drawn on a canvas of their size, pixel for pixel */
async function canvasOfPng(b) {
  const bmp = await createImageBitmap(new Blob([b], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  c.getContext('2d').drawImage(bmp, 0, 0)
  bmp.close()
  return c
}
const pixelsOf = async c => ({ W: c.width, H: c.height, sha: await digest(c.getContext('2d').getImageData(0, 0, c.width, c.height).data) })
/** one slice a face: its whole file over its coverage (the host's faceSources, the simplest plan) */
async function faceSourcesOf() {
  const [{ FACES }, { COVERAGE }] = await Promise.all([import('/engine/rules/font-roles.mjs'), import('/engine/rules/font-coverage.mjs')])
  return async id => (FACES[id] && COVERAGE[id] ? [{ url: `/fonts/${encodeURIComponent(FACES[id].file)}`, ranges: COVERAGE[id] }] : null)
}
const hyphUrl = lang => `/hyph/${lang}.json`
async function ruleSetOf(url) {
  return url ? (await (await import('/engine/rules/layout.mjs')).readRules(await bytes(url))).set : null
}
/** the cut read as a host reads it: the chunks in id order, the head, the index, each part against the chain */
async function cutOf(name) {
  const F = await import('/engine/layer-proto/format.mjs')
  const c = await json(`/door/${name}/cut.json`)
  const chunks = []
  for (const u of c.units) chunks.push(await F.readUnitsChunk(await bytes(u.path), { ref: u.ref, before: chunks.at(-1) ?? null }))
  const head = await F.readHead(await bytes(c.head.path), { ref: c.head.ref })
  const index = F.indexOf(head, chunks)
  const parts = []
  for (const p of c.parts) parts.push(await F.readPart(await bytes(p.path), { ref: p.ref, index, chain: parts.at(-1)?.chain ?? null }))
  return { F, index, parts }
}
/** each page's records of the units on it (timings aside), as a digest; the run's units left and why, sorted */
const recsOf = (run, p) => textDigest(JSON.stringify(run.stats.filter(r => r.pages.includes(p)).map(({ ms: _, ...r }) => r)))
const skippedOf = run => run.skipped.map(s => `${s.id}:${s.why}`).sort()

/** a door's pages asked for in turn, 1 to `pages`, each awaited; then each page's copy over `sourceOf(p)` and its records */
async function askEvery(R, layer, { target, pages, N, sourceOf }) {
  const run = () => window.__gateRuns.at(-1)
  const out = []
  for (let p = 1; p <= Math.min(pages, N); p++) {
    const { svg, w, h } = await layer.pageOf(p, { lang: target })
    const markup = svg.cloneNode(true)
    const lang = markup.getAttribute('lang')
    markup.removeAttribute('lang')
    const { png, source } = await sourceOf(p)
    const copy = await layer.copyOf(p, source, K)
    out.push({ p, svg: markup.outerHTML, lang, w, h, copy: await pixelsOf(copy), ...(png ? { png: base64(png) } : {}) })
    for (const c of [source, copy]) { c.width = 0; c.height = 0 }
  }
  for (const e of out) e.recs = await recsOf(run(), e.p)
  return { pages: out, skipped: await textDigest(skippedOf(run()).join('\n')), skippedCount: run().skipped.length }
}

window.doorParts = {
  /** door A: BUNDLE 3's open over the cut made whole (mergeParts); each page's PDF.js drawing at K kept as PNG for door B */
  async whole({ name, target, rules, pages }) {
    const R = await import('/engine/layer-proto/reader.mjs')
    const { F, index, parts } = await cutOf(name)
    const bundle = F.mergeParts(index, parts)
    const rows = await json(`/door/${name}/rows.json`)
    const doc = await pdfjs.getDocument({ data: await bytes(`/fixtures/${name}/arxiv.pdf`), ...PDF_ASSETS, ...R.PDF_OPTIONS }).promise
    const ruleSet = await ruleSetOf(rules)
    window.__gateRuns = []
    const layer = await R.openLayer({ bundle, doc, target, ...(ruleSet ? { rules: ruleSet } : {}), faceSources: await faceSourcesOf(), hyphUrl })
    layer.take(rows)
    layer.end()
    const sourceOf = async p => {
      const page = await doc.getPage(p)
      const viewport = page.getViewport({ scale: K })
      const drawn = document.createElement('canvas')
      drawn.width = Math.floor(viewport.width)
      drawn.height = Math.floor(viewport.height)
      await page.render({ canvas: drawn, canvasContext: drawn.getContext('2d'), viewport }).promise
      const png = await pngOf(drawn)
      drawn.width = 0
      drawn.height = 0
      return { png, source: await canvasOfPng(png) }
    }
    const out = await askEvery(R, layer, { target, pages, N: index.head.paper.pages, sourceOf })
    const stats = layer.stats()
    layer.dispose()
    await doc.loadingTask.destroy()
    return { ...out, parts: parts.map(p => p.pages), drawn: stats.drawn }
  },

  /** door B: openLayer over the index, no part at the open, each told when the run waits for one */
  async parts({ name, target, rules, pages }) {
    const R = await import('/engine/layer-proto/reader.mjs')
    const { index, parts } = await cutOf(name)
    const rows = await json(`/door/${name}/rows.json`)
    const doc = await pdfjs.getDocument({ data: await bytes(`/fixtures/${name}/arxiv.pdf`), ...PDF_ASSETS, ...R.PDF_OPTIONS }).promise
    const ruleSet = await ruleSetOf(rules)
    window.__gateRuns = []
    const log = []
    let next = 0
    const layer = await R.openLayer({ index, doc, parts: [], target, ...(ruleSet ? { rules: ruleSet } : {}), faceSources: await faceSourcesOf(), hyphUrl, leftPart: async () => new Uint8Array(), onRetired: () => {} })
    layer.onPage((p, state) => log.push(`${state}:${p}`))
    window.__gateWait = what => {
      log.push(`wait:${what}`)
      if (what === 'part' && next < parts.length) { const part = parts[next++]; log.push(`part:${part.pages.join('-')}`); layer.addPart(part) }
    }
    layer.take(rows)
    layer.end()
    const sourceOf = async p => ({ png: null, source: await canvasOfPng(await bytes(`/door/${name}/s${p}.png`)) })
    const out = await askEvery(R, layer, { target, pages, N: index.head.paper.pages, sourceOf })
    window.__gateWait = null
    const stats = layer.stats()
    layer.dispose()
    await doc.loadingTask.destroy()
    return { ...out, log, told: next, of: parts.length, drawn: stats.drawn }
  },
}
window.gateReady = true
