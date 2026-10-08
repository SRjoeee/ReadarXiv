// lab/pdf/spikes/layer-gate/door.mjs
// The layer gate's page for the reader's door (--door; src/pdf-reader/engine/layer-proto/reader.mjs, A2's E4): a fixture's
// pages drawn twice, each run in a page load of its own (no module state, no cache of measures shared between them), and
// compared by the driver. `gate` is the gate's own call of v0 (run.mjs openProto) with the door's inputs: the geometry,
// the record's units given at once, the fixture's layout file and the units file's pieces, as this page's proto.mjs gives
// them, and the door's choices where they differ from the gate's recorded run (scale 2.5 at a device pixel ratio of 1,
// the same 2.5 device pixels a unit; every float labelled in the target's names, L7; the paper's shipped add-on in one
// document with arXiv's pages, as a reader opens it; one slice a face, its whole file over its coverage). `door` is a
// reader's: the bundle the driver made of the same parts, read by readBundle, the document composed from arXiv's bytes and
// the bundle's tail, openLayer over it, the rows the driver made of the record (rows.mjs rowOf) taken in parts, a
// macrotask apart, beside the pages asked for. Each page's answer: its SVG's markup, and its pixels' digests (SHA-256,
// and one FNV-1a hash a pixel row, to say where two differ): the gate's run's original and copy planes (v0's own canvases
// at 2.5 device pixels a unit), the page the door's document draws by PDF.js at 2.5, and copyOf(page, the gate's run's
// original, 2.5): the page as PDF.js drew it at 2.5, the same pixels for both copies (PDF.js's first drawing of a page in
// a document is not always its later ones')
import * as pdfjs from 'pdfjs-dist'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.mjs'
const PDF_ASSETS = { cMapUrl: '/pdfjs/cmaps/', standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/' }
/** device pixels a PDF unit: the gate's, v0's canvases at scale 2.5 and dpr 1 */
const K = 2.5
const bytes = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()) }
const json = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json() }
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
const digest = async data => hex(await crypto.subtle.digest('SHA-256', data))
/** a pixel row's FNV-1a hash, row by row */
function rowHashes(d, W, H) {
  const out = new Array(H)
  for (let y = 0; y < H; y++) {
    let h = 0x811c9dc5
    for (let i = 4 * W * y, end = i + 4 * W; i < end; i++) { h ^= d[i]; h = Math.imul(h, 0x01000193) >>> 0 }
    out[y] = h
  }
  return out
}
/** a canvas as PNG (lossless), base64 */
async function pngOf(c) {
  const b = new Uint8Array(await (await new Promise(ok => c.toBlob(ok, 'image/png'))).arrayBuffer())
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000))
  return btoa(s)
}
/** a PNG drawn on a canvas of its size, pixel for pixel */
async function canvasOfPng(url) {
  const bmp = await createImageBitmap(await (await fetch(url)).blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  c.getContext('2d').drawImage(bmp, 0, 0)
  bmp.close()
  return c
}
const pixelsOf = async c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; return { W: c.width, H: c.height, sha: await digest(d), rows: rowHashes(d, c.width, c.height) } }
/** one slice a face: its whole file over its coverage (the host's faceSources, the simplest plan) */
async function faceSourcesOf() {
  const [{ FACES }, { COVERAGE }] = await Promise.all([import('/engine/font-roles.mjs'), import('/engine/font-coverage.mjs')])
  return async id => (FACES[id] && COVERAGE[id] ? [{ url: `/fonts/${encodeURIComponent(FACES[id].file)}`, ranges: COVERAGE[id] }] : null)
}
const hyphUrl = lang => `/hyph/${lang}.json`
/** the layout rule set the run is given (the driver's --rules, else the engine's built-in), read by the engine's own reader */
async function ruleSetOf(url) {
  return url ? (await (await import('/engine/rules/layout.mjs')).readRules(await bytes(url))).set : null
}
/** the reader's document: arXiv's bytes, their fingerprint the bundle's, followed by the bundle's add-on */
async function composedOf(name, bundle) {
  const original = await bytes(`/fixtures/${name}/arxiv.pdf`)
  if (original.length !== bundle.base.bytes || (await digest(original)) !== bundle.base.sha256) throw new Error(`${name}: arXiv's bytes are not the bundle's base`)
  if (!bundle.addon) return original
  const out = new Uint8Array(original.length + bundle.addon.tail.length)
  out.set(original)
  out.set(bundle.addon.tail, original.length)
  return out
}
const macrotask = () => new Promise(ok => setTimeout(ok, 0))
/** the page's sheets but the faces' classes' (layer2.mjs faceClass: made once a page, for every run, and kept) */
const ownSheets = () => [...document.head.querySelectorAll('style')].filter(e => { const rules = [...(e.sheet?.cssRules ?? [])]; return !(rules.length && rules.every(r => /^\.axf\d+$/.test(r.selectorText ?? ''))) })

window.door = {
  /** the gate's own run with the door's inputs, its first `pages` pages in turn, those before each let go first; at the
   *  door's resolution (scale 2.5, dpr 1), or at another of the same device pixels a unit (the gate's recorded runs': 1.25
   *  at this page's dpr of 2), whose records and copy are compared with it */
  async gate({ name, target, rules, pages, scale = K, dpr = 1, png = true }) {
    const [R, V, F] = await Promise.all([import('/engine/layer-proto/reader.mjs'), import('/engine/layer-proto/run.mjs'), import('/engine/layout/file.mjs')])
    const base = `/fixtures/${name}/`
    const [bundleBytes, geometry, record, unitsFile, layout] = await Promise.all([bytes(`/door/${name}/bundle.json`), json(`${base}geometry.json`), json(`${base}record.json`), json(`${base}units.json`), bytes(`${base}layout.json`)])
    const bundle = R.readBundle(bundleBytes)
    const ruleSet = await ruleSetOf(rules)
    const doc = await pdfjs.getDocument({ data: await composedOf(name, bundle), ...PDF_ASSETS, ...R.PDF_OPTIONS }).promise
    const run = await V.openProto({
      doc, geometry, units: record.units, target, pages: Number.POSITIVE_INFINITY, scale, dpr, copy: true,
      tex: { use: 'lines', texOnly: true, symbols: 'text', extents: 'v0', index: F.indexLayout(F.parseLayout(layout)), pieces: new Map(unitsFile.units.map(u => [u.id, u.pieces])) },
      removal: bundle.addon ? { OPS: pdfjs.OPS, mode: 'draw', doc, manifest: bundle.addon.manifest } : null,
      labels: { captions: { figure: 'target', table: 'target' } },
      ...(ruleSet ? { rules: ruleSet } : {}), faceSources: await faceSourcesOf(), hyphUrl,
    })
    const out = []
    for (let p = 1; p <= Math.min(pages, run.N); p++) {
      for (let q = 1; q < p; q++) if (!run.rows[q - 1].released) run.release(q)
      await run.until(p)
      const row = run.rows[p - 1]
      // (each unit's record of its lay, timings aside, of the units on the page; and the original as v0 drew it, for the
      // door's copy to be drawn over: PDF.js's first drawing of a page in a document may differ from its later ones,
      // 2608.04322's page 3 by a few pixel rows from run to run)
      const recs = JSON.stringify(run.stats.filter(r => r.pages.includes(p)).map(({ ms: _, ...r }) => r))
      out.push({ p, svg: row.svg.outerHTML, w: row.w, h: row.h, recs: await digest(new TextEncoder().encode(recs)), o: await pixelsOf(row.left), c: await pixelsOf(row.right), ...(png ? { png: await pngOf(row.left) } : {}) })
    }
    const summary = { N: run.N, laid: run.stats.length, skipped: run.skipped.length }
    run.dispose()
    await doc.loadingTask.destroy()
    return { pages: out, summary }
  },

  /** the reader's door over the bundle, its rows taken `part` a part as they come, the same pages asked for in turn */
  async door({ name, target, rules, pages, part }) {
    const R = await import('/engine/layer-proto/reader.mjs')
    const [bundleBytes, rows] = await Promise.all([bytes(`/door/${name}/bundle.json`), json(`/door/${name}/rows.json`)])
    const bundle = R.readBundle(bundleBytes)
    const doc = await pdfjs.getDocument({ data: await composedOf(name, bundle), ...PDF_ASSETS, ...R.PDF_OPTIONS }).promise
    const sheets = ownSheets().length
    const ruleSet = await ruleSetOf(rules)
    const layer = await R.openLayer({ bundle, doc, target, ...(ruleSet ? { rules: ruleSet } : {}), faceSources: await faceSourcesOf(), hyphUrl })
    const complete = []
    const fed = (async () => {
      for (let i = 0; i < rows.length; i += part) { await macrotask(); complete.push(...layer.take(rows.slice(i, i + part)).complete) }
      await macrotask()
      layer.end()
    })()
    const out = []
    for (let p = 1; p <= Math.min(pages, bundle.paper.pages); p++) {
      const { svg, w, h } = await layer.pageOf(p, { lang: target })
      const markup = svg.cloneNode(true)
      const lang = markup.getAttribute('lang')
      markup.removeAttribute('lang')
      const page = await doc.getPage(p)
      const viewport = page.getViewport({ scale: K })
      // (sized as v0 sizes its own original, which it is compared with: drawCopy's pages of its own round up)
      const source = document.createElement('canvas')
      source.width = Math.floor(viewport.width)
      source.height = Math.floor(viewport.height)
      await page.render({ canvas: source, canvasContext: source.getContext('2d'), viewport }).promise
      // the copy drawn over the page as the gate's run drew it (its own original, as PNG), so that both copies start from
      // the same pixels; the page this load's PDF.js draws compared with it apart
      const original = await canvasOfPng(`/door/${name}/o${p}.png`)
      const copy = await layer.copyOf(p, original, K)
      out.push({ p, svg: markup.outerHTML, lang, w, h, source: await pixelsOf(source), original: await pixelsOf(original), copy: await pixelsOf(copy) })
      for (const c of [source, original, copy]) { c.width = 0; c.height = 0 }
    }
    await fed
    const stats = layer.stats()
    layer.dispose()
    await doc.loadingTask.destroy()
    // (the sheets before the open and after dispose: the run's own gone)
    return { pages: out, stats: { ...stats, pageMs: undefined }, complete: complete.length, rows: rows.length, sheets: [sheets, ownSheets().length] }
  },
}
window.gateReady = true
