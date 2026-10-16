// lab/pdf/spikes/layer-gate/door-parts.mjs
// The layer gate's page for the door in parts (--door-parts; src/pdf-reader/engine/layer-proto/reader.mjs, BUNDLE 4; the door
// design's H3): a fixture cut into BUNDLE 4's objects by the driver (cut.mjs cutBundle at one schedule, with the chained add-on:
// each part's tail after the parts before it), read here as a host reads them (format.mjs: the units' chunks, the head,
// indexOf, each part against the chain), and its pages drawn twice, each in a page load of its own: door A, openLayer over the
// cut made whole again (mergeParts, BUNDLE 3's open, over arXiv's PDF and every tail), and door B, openLayer over the index with
// no part, each part told when the run waits for one (addPart: every part late, as a slow prepare tells them; a part with a tail
// with the composed document through it, opened beforehand). Door S (C') is BUNDLE 3's open of the bundle with its single tail,
// its copies drawn over door A's PNGs as door B's are (never over its own drawing of arXiv's page: a first drawing varies).
// The rows are the record's, all taken, then end().
// Each page's answer: its SVG's markup, its word table's digest (words.mjs, 1b-E), copyOf's pixels over the page as door A's load had PDF.js draw it (its PNG, so that both
// copies start from the same pixels), and the digest of the run's records of the units on the page (the run is reached through
// the driver's stand-in of run.mjs, which keeps each run it opens and tells this page what the run waits for); and once the
// pages are asked, every page's state and the units left and why. Door B then tells the parts its pages did not need and ends
// the parts, as a host does at the catalog's end, its states and units left read before endParts and after (the accounting of
// the units no page shows and of those nothing locates waits for the parts' end). Door B also keeps its log: each page's
// state as the door told it and each wait of the run, so the driver checks Q1 (a page told laying is ready before the run
// waits for a part)
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
/** a page's word table (src/pdf-reader/engine/layer-proto/words.mjs) as one digest: its columns' bytes, its spans and the units left
 *  the original's; the same table gives the same digest */
async function wordsDigest(w) {
  const t = w.tokens
  const parts = [new TextEncoder().encode(JSON.stringify([t.n, w.spans, w.original]))]
  for (const a of [t.l, t.r, t.y, t.h, t.top, t.bottom, w.word]) parts.push(new Uint8Array(a.buffer, a.byteOffset, a.byteLength))
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { all.set(p, at); at += p.length }
  return digest(all)
}
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
  return { F, index, parts, docs: c.docs ?? {}, composed: c.composed ?? null }
}
/** arXiv's PDF followed by `tail` */
const withTail = (original, tail) => { const out = new Uint8Array(original.length + tail.length); out.set(original); out.set(tail, original.length); return out }
/** each page's records of the units on it (timings aside), as a digest; the run's units left and why, sorted */
const recsOf = (run, p) => textDigest(JSON.stringify(run.stats.filter(r => r.pages.includes(p)).map(({ ms: _, ...r }) => r)))
const skippedOf = run => run.skipped.map(s => `${s.id}:${s.why}`).sort()
/** every page's state, as one string (w, l, r, f) */
const statesOf = (layer, N) => { let s = ''; for (let p = 1; p <= N; p++) s += layer.pageState(p)[0]; return s }

/** a door's pages asked for in turn, 1 to `pages`, each awaited; then each page's copy over `sourceOf(p)` and its records */
async function askEvery(R, layer, { target, pages, N, sourceOf }) {
  const run = () => window.__gateRuns.at(-1)
  const out = []
  for (let p = 1; p <= Math.min(pages, N); p++) {
    const { svg, w, h, words, links } = await layer.pageOf(p, { lang: target })
    const markup = svg.cloneNode(true)
    const lang = markup.getAttribute('lang')
    markup.removeAttribute('lang')
    const { png, source } = await sourceOf(p)
    const copy = await layer.copyOf(p, source, K)
    out.push({ p, svg: markup.outerHTML, lang, w, h, words: await wordsDigest(words), links: await textDigest(JSON.stringify(links ?? [])), copy: await pixelsOf(copy), ...(png ? { png: base64(png) } : {}) })
    for (const c of [source, copy]) { c.width = 0; c.height = 0 }
  }
  for (const e of out) e.recs = await recsOf(run(), e.p)
  return { pages: out }
}
/** what a door holds once its pages are asked: every page's state, the units left and why (sorted) */
const heldOf = (layer, N) => ({ states: statesOf(layer, N), skipped: skippedOf(window.__gateRuns.at(-1)) })

window.doorParts = {
  /** door A: BUNDLE 3's open over the cut made whole (mergeParts) and arXiv's PDF through every tail, or (`bundle3`) over BUNDLE
   *  3's bundle itself: with no add-on ('none', door C, `addon: null`) or with its single tail ('single', door S); each page's
   *  PDF.js drawing at K kept as PNG for door B (unless `png` is false). `shared`: each page's copy drawn over door A's PNG of
   *  it, as door B's is, not over this load's own drawing: PDF.js's first drawing of a page in a document is not always
   *  another load's (layer-gate/door.mjs head), so two loads' copies are compared over the same pixels or not at all */
  async whole({ name, target, rules, pages, bundle3 = false, png: keepPng = true, shared = false }) {
    const R = await import('/engine/layer-proto/reader.mjs')
    const { F, index, parts, composed } = await cutOf(name)
    const original = await bytes(`/fixtures/${name}/arxiv.pdf`)
    const three = bundle3 ? R.readBundle(await bytes(`/door/${name}/bundle.json`)) : null
    const bundle = bundle3 === 'none' ? { ...three, addon: null } : bundle3 === 'single' ? three : F.mergeParts(index, parts)
    const data = bundle3 === 'single' ? withTail(original, three.addon.tail) : bundle3 === false && composed ? await bytes(composed) : original
    const rows = await json(`/door/${name}/rows.json`)
    const doc = await pdfjs.getDocument({ data, ...PDF_ASSETS, ...R.PDF_OPTIONS }).promise
    const ruleSet = await ruleSetOf(rules)
    window.__gateRuns = []
    const layer = await R.openLayer({ bundle, doc, target, ...(ruleSet ? { rules: ruleSet } : {}), faceSources: await faceSourcesOf(), hyphUrl })
    layer.take(rows)
    layer.end()
    const sourceOf = async p => {
      if (shared) return { png: null, source: await canvasOfPng(await bytes(`/door/${name}/s${p}.png`)) }
      const page = await doc.getPage(p)
      const viewport = page.getViewport({ scale: K })
      const drawn = document.createElement('canvas')
      drawn.width = Math.floor(viewport.width)
      drawn.height = Math.floor(viewport.height)
      await page.render({ canvas: drawn, canvasContext: drawn.getContext('2d'), viewport }).promise
      const png = await pngOf(drawn)
      drawn.width = 0
      drawn.height = 0
      return { png: keepPng ? png : null, source: await canvasOfPng(png) }
    }
    const N = index.head.paper.pages
    const out = await askEvery(R, layer, { target, pages, N, sourceOf })
    const held = heldOf(layer, N)
    const stats = layer.stats()
    layer.dispose()
    await doc.loadingTask.destroy()
    return { ...out, ...held, parts: parts.map(p => p.pages), addon: bundle.addon !== null, drawn: stats.drawn }
  },

  /** door B: openLayer over the index, no part at the open, each told when the run waits for one */
  async parts({ name, target, rules, pages }) {
    const R = await import('/engine/layer-proto/reader.mjs')
    const { index, parts, docs } = await cutOf(name)
    const rows = await json(`/door/${name}/rows.json`)
    const doc = await pdfjs.getDocument({ data: await bytes(`/fixtures/${name}/arxiv.pdf`), ...PDF_ASSETS, ...R.PDF_OPTIONS }).promise
    // (the composed document through each part's tail, opened before the run: addPart is synchronous, as a host's is)
    const composed = new Map()
    for (const [i, path] of Object.entries(docs)) composed.set(Number(i), await pdfjs.getDocument({ data: await bytes(path), ...PDF_ASSETS, ...R.PDF_OPTIONS }).promise)
    const ruleSet = await ruleSetOf(rules)
    window.__gateRuns = []
    const log = []
    let next = 0
    const retired = []
    const layer = await R.openLayer({ index, doc, parts: [], target, ...(ruleSet ? { rules: ruleSet } : {}), faceSources: await faceSourcesOf(), hyphUrl, leftPart: async () => new Uint8Array(), onRetired: d => { retired.push(d) } })
    layer.onPage((p, state) => log.push(`${state}:${p}`))
    const tell = i => { const part = parts[i]; log.push(`part:${part.pages.join('-')}`); layer.addPart(part, ...(composed.has(i) ? [{ doc: composed.get(i) }] : [])) }
    window.__gateWait = what => {
      log.push(`wait:${what}`)
      if (what === 'part' && next < parts.length) tell(next++)
    }
    layer.take(rows)
    layer.end()
    const sourceOf = async p => ({ png: null, source: await canvasOfPng(await bytes(`/door/${name}/s${p}.png`)) })
    const N = index.head.paper.pages
    const out = await askEvery(R, layer, { target, pages, N, sourceOf })
    window.__gateWait = null
    // (the catalog's end, as a host has it: every part told, the rows ended already, then endParts)
    const needed = next
    while (next < parts.length) tell(next++)
    const before = heldOf(layer, N)
    layer.endParts()
    const after = heldOf(layer, N)
    const stats = layer.stats()
    layer.dispose()
    for (const d of new Set([doc, ...composed.values(), ...retired])) await d.loadingTask.destroy()
    return { ...out, before, after, log, needed, of: parts.length, parts: parts.map(p => p.pages), addons: parts.filter(p => p.addon !== null).length, tails: composed.size, drawn: stats.drawn }
  },
}
window.gateReady = true
