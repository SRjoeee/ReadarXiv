// lab/pdf/spikes/layer-gate/door-common.mjs
// What the order pages share (door-order.mjs: --door-order; door-jump.mjs: --door-jump): the helpers the door pages of this
// folder each carry a copy of (digests, PNG round trips, the served faces), and the open of one layer over a fixture's
// bundle and rows, as door.mjs opens its door: BUNDLE 3's open (readBundle over the bundle the driver wrote, the composed
// document from arXiv's bytes and the bundle's tail), the rows the driver made of the record taken at once and ended, the
// run reached through the driver's stand-in of run.mjs (which keeps each run it opens and gives its units' records,
// layer-gate.mjs RUN_STAND_IN). Each page's answer is the same few numbers wherever it was asked: its SVG's markup (lang
// aside), its word table's digest (words.mjs), the digest of its link records (3a-0), copyOf's pixels over the PNG of the page as PDF.js drew it in the reference
// run (so that every run's copy starts from the same pixels: PDF.js's first drawing of a page in a document is not always
// another load's, door.mjs head) and the digest of the records of the units on the page
import * as pdfjs from 'pdfjs-dist'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.mjs'
export { pdfjs }
export const PDF_ASSETS = { cMapUrl: '/pdfjs/cmaps/', standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/' }
/** device pixels a PDF unit: the gate's, v0's canvases at scale 2.5 and dpr 1 */
export const K = 2.5
export const bytes = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()) }
export const json = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json() }
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
export const digest = async data => hex(await crypto.subtle.digest('SHA-256', data))
export const textDigest = s => digest(new TextEncoder().encode(s))
/** a page's word table (src/pdf-reader/engine/layer-proto/words.mjs) as one digest: its columns' bytes, its spans and the units left
 *  the original's; the same table gives the same digest */
export async function wordsDigest(w) {
  const t = w.tokens
  const parts = [new TextEncoder().encode(JSON.stringify([t.n, w.spans, w.original]))]
  for (const a of [t.l, t.r, t.y, t.h, t.top, t.bottom, w.word]) parts.push(new Uint8Array(a.buffer, a.byteOffset, a.byteLength))
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { all.set(p, at); at += p.length }
  return digest(all)
}
/** a canvas as PNG (lossless), its bytes */
export const pngOf = async c => new Uint8Array(await (await new Promise(ok => c.toBlob(ok, 'image/png'))).arrayBuffer())
export const base64 = b => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s) }
/** PNG bytes drawn on a canvas of their size, pixel for pixel */
export async function canvasOfPng(b) {
  const bmp = await createImageBitmap(new Blob([b], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  c.getContext('2d').drawImage(bmp, 0, 0)
  bmp.close()
  return c
}
export const pixelsOf = async c => ({ W: c.width, H: c.height, sha: await digest(c.getContext('2d').getImageData(0, 0, c.width, c.height).data) })
/** one slice a face: its whole file over its coverage (the host's faceSources, the simplest plan) */
export async function faceSourcesOf() {
  const [{ FACES }, { COVERAGE }] = await Promise.all([import('/engine/rules/font-roles.mjs'), import('/engine/rules/font-coverage.mjs')])
  return async id => (FACES[id] && COVERAGE[id] ? [{ url: `/fonts/${encodeURIComponent(FACES[id].file)}`, ranges: COVERAGE[id] }] : null)
}
export const hyphUrl = lang => `/hyph/${lang}.json`
export async function ruleSetOf(url) {
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
export const macrotask = () => new Promise(ok => setTimeout(ok, 0))
/** a 32-bit integer's bits mixed (murmur3's finaliser) */
const mix32 = x => { x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return (x ^ (x >>> 16)) >>> 0 }
/** a generator of numbers in [0, 1) from a seed (mulberry32): the same sequence on every run, so that a failure is the same each time */
export function rngOf(seed) {
  let s = mix32(Math.imul(seed + 1, 0x9e3779b1)) >>> 0
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
/** a list shuffled by `rnd` (Fisher-Yates) */
export function shuffled(list, rnd) {
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] }
  return out
}

/** the run the stand-in opened last */
export const lastRun = () => window.__gateRuns.at(-1)
/** the digest of the records of the units on page `p` (timings aside, sorted by unit id: `run.stats` is in lay order, which an
 *  ask-order change moves without moving a record), through the stand-in's run. A table cell's record is left
 *  out: it leaves the run's records with its group when the group is withheld (run.mjs settleGroup: a group on several pages, or
 *  with a cell unfit), as soon as the group's cells are all laid, which is no fact of a page; the drawing of a cell is compared by
 *  the page's SVG */
export const recsOf = (run, p) => textDigest(JSON.stringify(run.stats.filter(r => r.pages.includes(p) && r.kind !== 'cell').map(({ ms: _, ...r }) => r).sort((a, b) => a.id - b.id)))
/** the units left the original's and why, sorted */
export const skippedOf = run => run.skipped.map(s => `${s.id}:${s.why}`).sort()
/** every page's state, as one string (w, l, r, f) */
export const statesOf = (layer, N) => { let s = ''; for (let p = 1; p <= N; p++) s += layer.pageState(p)[0]; return s }

/**
 * One layer over a fixture's bundle: the composed document (its getPage counted: `drawn` holds the pages of the ORIGINAL
 * (1 to N) the layer asked PDF.js for, `extra` the removed pages beyond them), openLayer, the rows taken at once and ended.
 * `completes`: the pages `take` told complete for the rows given at once, against the pages the run says are complete then (the
 * pages left wait for end()): each exactly once, none missing, none more. `done()` lets the layer go and destroys the document
 */
export async function openDoor({ name, target, rules }) {
  const R = await import('/engine/layer-proto/reader.mjs')
  const [bundleBytes, rows] = await Promise.all([bytes(`/door/${name}/bundle.json`), json(`/door/${name}/rows.json`)])
  const bundle = R.readBundle(bundleBytes)
  const doc = await pdfjs.getDocument({ data: await composedOf(name, bundle), ...PDF_ASSETS, ...R.PDF_OPTIONS }).promise
  const N = bundle.paper.pages
  const drawn = new Set(), extra = new Set()
  const getPage = doc.getPage.bind(doc)
  doc.getPage = n => { (n <= N ? drawn : extra).add(n); return getPage(n) }
  const ruleSet = await ruleSetOf(rules)
  window.__gateRuns = []
  const layer = await R.openLayer({ bundle, doc, target, ...(ruleSet ? { rules: ruleSet } : {}), faceSources: await faceSourcesOf(), hyphUrl })
  const reported = layer.take(rows).complete
  const run = lastRun()
  const expected = []
  for (let p = 1; p <= N; p++) if (run.complete(p)) expected.push(p)
  layer.end()
  const completes = { reported, expected, ok: reported.length === new Set(reported).size && reported.slice().sort((a, b) => a - b).join() === expected.join() }
  return { layer, doc, N, drawn, extra, completes, async done() { layer.dispose(); await doc.loadingTask.destroy() } }
}

/** a laid page's answer, the numbers every run is compared by: its SVG's markup (lang aside), its size, its word table's digest
 *  and copyOf's pixels over `sourcePng`, the page as PDF.js drew it (the records' digest is taken once the run is done: a
 *  unit's record is made when the unit is laid) */
export async function answerOf(layer, p, got, sourcePng) {
  const { svg, w, h, words, links } = got
  const markup = svg.cloneNode(true)
  const lang = markup.getAttribute('lang')
  markup.removeAttribute('lang')
  const source = await canvasOfPng(sourcePng)
  const copy = await layer.copyOf(p, source, K)
  const out = { p, svg: markup.outerHTML, lang, w, h, words: await wordsDigest(words), links: await textDigest(JSON.stringify(links ?? [])), copy: await pixelsOf(copy) }
  for (const c of [source, copy]) { c.width = 0; c.height = 0 }
  return out
}
