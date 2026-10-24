// lab/pdf/spikes/layer-gate/door.mjs
// The layer gate's page for the reader's door (--door; src/pdf-reader/engine/layer-proto/reader.mjs, A2's E4): a fixture's
// pages drawn twice, each run in a page load of its own (no module state, no cache of measures shared between them), and
// compared by the driver. `gate` is the gate's own call of v0 (run.mjs openProto) with the door's inputs: the geometry,
// the record's units given at once, the fixture's layout file and the units file's pieces, as this page's proto.mjs gives
// them, and the door's choices where they differ from the gate's recorded run (scale 2.5 at a device pixel ratio of 1,
// the same 2.5 device pixels a unit; every float labelled in the target's names, L7; the page our page wrapped by optional
// content, as a reader opens it; one slice a face, its whole file over its coverage). `door` is a reader's: the bundle the
// driver made of the same parts, read by readBundle, the wrapped page its document, openLayer over it, the rows the driver made of the record (rows.mjs rowOf) taken in parts, a
// macrotask apart, beside the pages asked for. The gate's run keeps every state it lays with (openProto's `free` off), the
// door's lets go of it as the reader's does (the 1b design §3): so the two equal also proves that letting go moves no drawing.
// Each page's answer: its SVG's markup, its word table's digest (words.mjs; the right pane's sentence highlight reads it, 1b-E: equal
// at the door and at the gate's own run, and at the gate's recorded scale), and its pixels' digests (SHA-256,
// and one FNV-1a hash a pixel row, to say where two differ): the gate's run's original and copy planes (v0's own canvases
// at 2.5 device pixels a unit), the page the door's document draws by PDF.js at 2.5, and copyOf(page, { k: 2.5 }) at the size
// of the gate's run's original: the page as a view draws it (render A, then its crops and pastes)
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
/** the bytes a page's word table keeps: its typed columns (the spans and the units left the original's, a few words, are not counted) */
const wordsBytes = w => [w.tokens.l, w.tokens.r, w.tokens.y, w.tokens.h, w.tokens.top, w.tokens.bottom, w.word].reduce((n, a) => n + a.byteLength, 0)
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
  const [{ FACES }, { COVERAGE }] = await Promise.all([import('/engine/rules/font-roles.mjs'), import('/engine/rules/font-coverage.mjs')])
  return async id => (FACES[id] && COVERAGE[id] ? [{ url: `/fonts/${encodeURIComponent(FACES[id].file)}`, ranges: COVERAGE[id] }] : null)
}
const hyphUrl = lang => `/hyph/${lang}.json`
/** the layout rule set the run is given (the driver's --rules, else the engine's built-in), read by the engine's own reader */
async function ruleSetOf(url) {
  return url ? (await (await import('/engine/rules/layout.mjs')).readRules(await bytes(url))).set : null
}
/** the reader's document: the page the layer is drawn over (base.pdf: our page wrapped by optional content where the driver could
 *  wrap it, layer-gate/wrap.mjs), its fingerprint the bundle's base */
async function composedOf(name, bundle) {
  const original = await bytes(`/fixtures/${name}/base.pdf`)
  if (original.length !== bundle.base.bytes || (await digest(original)) !== bundle.base.sha256) throw new Error(`${name}: the base page's bytes are not the bundle's base`)
  return original
}
const macrotask = () => new Promise(ok => setTimeout(ok, 0))
/** the page's sheets but the faces' classes' (layer2.mjs faceClass: made once a page, for every run, and kept) */
const ownSheets = () => [...document.head.querySelectorAll('style')].filter(e => { const rules = [...(e.sheet?.cssRules ?? [])]; return !(rules.length && rules.every(r => /^\.axf[0-9a-z-]+$/.test(r.selectorText ?? ''))) })

/**
 * Whether the words the translation has can be found in the page tables (1b-E; a sentence starts at a word, and the view finds the
 * token that carries its index): over the units laid whose pages are all among the first `limit`, the words of their plain
 * translated text (anchors.mjs tokens) and how many have no token carrying their index, and the same for the words sentences begin
 * at (the record's `sentences.tr` offsets, counted as sentenceStarts counts them).
 */
async function reachOf(run, finals, record, limit) {
  const [{ tokens }, { plainOfPieces }] = await Promise.all([import('/engine/pipeline/anchors.mjs'), import('/engine/layer-proto/words.mjs')])
  const r = { units: 0, words: 0, noToken: 0, starts: 0, startsNoToken: 0 }
  for (const u of run.placed) {
    if (u.refused || u.withheld || !u.unit?.pieces || u.pages.some(q => q > limit || !finals[q])) continue
    const plain = plainOfPieces(u.unit.pieces)
    const n = tokens(plain).length
    const has = new Set()
    for (const q of u.pages) {
      const f = finals[q], sp = f.spans.find(x => x[0] === u.id)
      if (!sp) continue
      for (let k = 0; k < sp[1].length; k += 2) for (let i = sp[1][k]; i < sp[1][k] + sp[1][k + 1]; i++) if (f.word[i] >= 0) has.add(f.word[i])
    }
    r.units++
    r.words += n
    r.noToken += n - has.size
    const tr = record.units[u.id]?.sentences?.tr
    if (Array.isArray(tr)) for (const o of tr) {
      if (!(o > 0 && o < plain.length)) continue
      const k = tokens(plain.slice(0, o)).length
      if (k >= n) continue
      r.starts++
      if (!has.has(k)) r.startsNoToken++
    }
  }
  return r
}
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
    // (the door's default toggles, as it gives the run them: rules/content-classes.mjs; an engine of before them has none)
    const classes = await import('/engine/rules/content-classes.mjs').catch(() => null)
    const toggles = classes?.defaultToggles?.() ?? null
    const run = await V.openProto({
      doc, geometry, units: record.units, target, pages: Number.POSITIVE_INFINITY, scale, dpr, copy: true,
      ...(toggles && classes.unitShown ? { shown: u => classes.unitShown(u, toggles) } : {}),
      tex: { use: 'lines', texOnly: true, symbols: 'text', extents: 'v0', index: F.indexLayout(F.parseLayout(layout)), pieces: new Map(unitsFile.units.map(u => [u.id, u.pieces])) },
      // (the cell rules the bundle carries, as the door reads them; a BUNDLE 3 bundle names no unit the wrap could not hide)
      hiding: { rules: q => bundle.rules?.[q] },
      labels: { captions: { figure: 'target', table: 'target' } },
      ...(ruleSet ? { rules: ruleSet } : {}), faceSources: await faceSourcesOf(), hyphUrl, OPS: pdfjs.OPS,
    })
    const out = [], finals = []
    for (let p = 1; p <= Math.min(pages, run.N); p++) {
      for (let q = 1; q < p; q++) if (!run.rows[q - 1].released) run.release(q)
      await run.until(p)
      const row = run.rows[p - 1]
      // (each unit's record of its lay, timings aside, of the units on the page; and the original as v0 drew it, for the
      // door's copy to be drawn over: PDF.js's first drawing of a page in a document may differ from its later ones,
      // 2608.04322's page 3 by a few pixel rows from run to run)
      const recs = JSON.stringify(run.stats.filter(r => r.pages.includes(p)).map(({ ms: _, ...r }) => r))
      out.push({ p, svg: run.svgOf(p).outerHTML, w: row.w, h: row.h, recs: await digest(new TextEncoder().encode(recs)), o: await pixelsOf(row.left), c: await pixelsOf(await run.copyCanvas(p)), ...(png ? { png: await pngOf(row.left) } : {}) })
      // (and the page's word table, a final page's: the pages its units run on to drawn first, after the page is read)
      const done = run.doneAt(p)
      if (Number.isFinite(done) && done > p) await run.until(done)
      const final = run.wordsOf(p)
      // (and its link records: the run's own, none before the engine's 3a, as the door's pageOf answers them)
      Object.assign(out.at(-1), { words: await wordsDigest(final), wordsBytes: wordsBytes(final), wordsTokens: final.tokens.n, links: await textDigest(JSON.stringify(run.linksOf ? run.linksOf(p) : [])) })
      finals[p] = final
    }
    const summary = { N: run.N, laid: run.stats.length, skipped: run.skipped.length, reach: await reachOf(run, finals, record, Math.min(pages, run.N)) }
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
    const layer = await R.openLayer({ bundle, doc, target, ...(ruleSet ? { rules: ruleSet } : {}), faceSources: await faceSourcesOf(), hyphUrl, OPS: pdfjs.OPS })
    const complete = []
    const fed = (async () => {
      for (let i = 0; i < rows.length; i += part) { await macrotask(); complete.push(...layer.take(rows.slice(i, i + part)).complete) }
      await macrotask()
      layer.end()
    })()
    const out = []
    for (let p = 1; p <= Math.min(pages, bundle.paper.pages); p++) {
      const { svg, w, h, words, links } = await layer.pageOf(p, { lang: target })
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
      // the copy as a view draws it (copyOf: render A of the wrapped page, then its crops and pastes), at the size of the gate's
      // run's own original (its PNG); the page this load's PDF.js draws compared with that original apart
      const original = await canvasOfPng(`/door/${name}/o${p}.png`)
      const copy = await layer.copyOf(p, { k: K, width: original.width, height: original.height })
      out.push({ p, svg: markup.outerHTML, lang, w, h, words: await wordsDigest(words), links: await textDigest(JSON.stringify(links ?? [])), source: await pixelsOf(source), original: await pixelsOf(original), copy: await pixelsOf(copy) })
      for (const c of [source, original, copy]) { c.width = 0; c.height = 0 }
    }
    await fed
    const stats = layer.stats()
    layer.dispose()
    await doc.loadingTask.destroy()
    // (the sheets before the open and after dispose: the run's own gone)
    // (the pages `take` told complete, as a set: the engine may tell them in no order the pages have, 1b-D; none twice. Which pages
    // it must tell is checked where the run is reached, door-common.mjs openDoor `completes`: the rest wait for end())
    return { pages: out, stats: { ...stats, pageMs: undefined }, complete: complete.length, completeOnce: new Set(complete).size === complete.length, rows: rows.length, sheets: [sheets, ownSheets().length] }
  },
}

window.door.memory = async function memory({ name, target, rules, scenario, pages: asked, every = 10 }) {
  // every canvas element the page makes from now on, held weakly: what it holds is the sum of those with pixels
  const made = new Set()
  const create = document.createElement.bind(document)
  document.createElement = (tag, options) => {
    const el = create(tag, options)
    if (typeof tag === 'string' && tag.toLowerCase() === 'canvas') made.add(new WeakRef(el))
    return el
  }
  const R = await import('/engine/layer-proto/reader.mjs')
  const [bundleBytes, rows] = await Promise.all([bytes(`/door/${name}/bundle.json`), json(`/door/${name}/rows.json`)])
  const bundle = R.readBundle(bundleBytes)
  const doc = await pdfjs.getDocument({ data: await composedOf(name, bundle), ...PDF_ASSETS, ...R.PDF_OPTIONS }).promise
  // (the jump asks for the page after the last one laid: a paper needs a page more than a sample's span, and the span is the
  // paper's at most; its page count is the bundle's, the composed document holding the removed pages too)
  const N = bundle.paper.pages
  if (N <= every) throw new Error(`${name}: ${N} pages, and the memory probe samples every ${every}`)
  const pages = Math.min(asked, N - 1)
  const ruleSet = await ruleSetOf(rules)
  const samples = []
  const sample = async laid => {
    window.gc()
    let canvases = 0, canvasBytes = 0
    for (const ref of made) {
      const c = ref.deref()
      if (!c) { made.delete(ref); continue }
      if (c.width * c.height > 0) { canvases++; canvasBytes += 4 * c.width * c.height }
    }
    samples.push({ laid, canvases, canvasBytes, heap: performance.memory.usedJSHeapSize, rss: await window.axtRss() })
  }
  // a jump: the engine stopped as it asks for the page after each tenth, when that many are laid and the host has let none go
  if (scenario === 'jump') {
    const getPage = doc.getPage.bind(doc)
    doc.getPage = async n => { if (n - 1 >= every && (n - 1) % every === 0 && n - 1 <= pages) await sample(n - 1); return getPage(n) }
  }
  const layer = await R.openLayer({ bundle, doc, target, ...(ruleSet ? { rules: ruleSet } : {}), faceSources: await faceSourcesOf(), hyphUrl, OPS: pdfjs.OPS })
  layer.take(rows)
  layer.end()
  // (the jump is to the page after the last one sampled, whose drawing the engine stops before: `pages` laid, none let go)
  if (scenario === 'jump') await layer.pageOf(pages + 1, { lang: target })
  else for (let p = 1; p <= pages; p++) { await layer.pageOf(p, { lang: target }); if (p % every === 0) await sample(p) }
  // (the host is done with the page: every page up to it let go; then the run let go)
  if (scenario === 'jump') await sample(pages + 1)
  layer.dispose()
  await doc.loadingTask.destroy()
  await sample('let go')
  return samples
}
window.gateReady = true
