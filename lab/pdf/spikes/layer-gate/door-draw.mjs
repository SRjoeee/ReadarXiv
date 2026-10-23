// lab/pdf/spikes/layer-gate/door-draw.mjs
// The layer gate's page for a page drawn from its draw geometry (--door-draw; E-C, the engine lane's ec-browser-design.md):
// the door over BUNDLE 5's parts, each left part carrying its page's draw as the prepare's container read it (the driver's
// Node child, layer-gate/draws.mjs), the run given it (run.mjs openProto `drawOf`, through reader.mjs), against the same door
// whose run is given none (the driver's stand-in of run.mjs takes `drawOf` away where `__gateNoDraw` is set): every page read
// live, today's path.
//   inputs  a paper's pages read in this browser as the run reads a page live (getTextContent, the page drawn, getAnnotations,
//           its fonts from commonObjs, its characters' fills off the list PDF.js drew it by: run.mjs liveFillsOf), against its
//           draws: the characters (layer2.mjs pageChars2) field by field, numbers by Object.is (the sign of zero aside: the wire
//           writes -0 as 0, counted), a character's font class and fill by value, and the Link
//           annotations as the run keeps them (links.mjs annotsOf). The run's own readers (run.mjs fontReaders, pageReadOf)
//   ref     the door with no drawOf, its parts told as the run waits for one, its pages asked in order; each page's PDF.js drawing
//           kept as PNG (every copy is drawn over it)
//   data    the same door with drawOf: each page compared with the reference's; PDF.js's calls on each page counted (getTextContent
//           and getAnnotations always, a drawing while a page is asked), with the run's own account (drawStats)
//   jump    a page asked first and alone in a fresh load, every part told at the open, with drawOf; J (what the ask read: the
//           pages from data and live, the pages whose pixels were read and why, PDF.js's calls) and with `perf` the time and the
//           longest task. `link` [rtt ms, bytes/s]: the document read through a range transport over a modelled link (each range
//           answered RTT after it is asked or after the link is free, in order, at the rate: the E-C handoff's sim2) and each
//           left part fetched over the same link, charged its gzip size; the document's first 64 KiB is given at once and not charged
//           (sim2's model: a host's first request is the open's, before the ask), so the link's bytes and time exclude it
import { answerOf, base64, bytes, faceSourcesOf, hyphUrl, json, K, lastRun, PDF_ASSETS, pdfjs, pngOf, recsOf, ruleSetOf, skippedOf, statesOf } from '/gate/door-common.mjs'

/** the cut as the driver served it, read as a host reads it: the chunks in id order, the head, the index, each part against the chain */
async function cutOf(name) {
  const F = await import('/engine/layer-proto/format.mjs')
  const c = await json(`/door/${name}/cut.json`)
  const chunks = []
  for (const u of c.units) chunks.push(await F.readUnitsChunk(await bytes(u.path), { ref: u.ref, before: chunks.at(-1) ?? null }))
  const head = await F.readHead(await bytes(c.head.path), { ref: c.head.ref })
  const index = F.indexOf(head, chunks)
  const parts = []
  for (const p of c.parts) parts.push(await F.readPart(await bytes(p.path), { ref: p.ref, index, chain: parts.at(-1)?.chain ?? null }))
  return { index, parts, gz: c.gz }
}

/** a link of `rtt` ms and `bps` bytes a second: each ask answered RTT after it is made or once the link is free, in turn */
function linkOf([rtt, bps], trace = null) {
  let free = 0, asked = 0, sent = 0
  const ask = (size, what) => new Promise(ok => {
    const now = performance.now(), start = Math.max(now + rtt, free), end = start + (size / bps) * 1000
    free = end
    asked++
    sent += size
    trace?.(`${what} ${size}`, now, end)
    setTimeout(ok, end - now)
  })
  return {
    ask,
    stats: () => ({ asked, bytes: sent }),
    /** a document over the link: its bytes asked range by range (PDF.js's own chunks), its first chunk given at once */
    async open(data, R) {
      const CHUNK = 65536
      const tr = new pdfjs.PDFDataRangeTransport(data.length, data.slice(0, CHUNK))
      tr.requestDataRange = (b, e) => { e = Math.min(e, data.length); void ask(e - b, `pdf ${b}`).then(() => tr.onDataRange(b, data.slice(b, e))) }
      return pdfjs.getDocument({ range: tr, rangeChunkSize: CHUNK, disableAutoFetch: true, ...PDF_ASSETS, ...R.PDF_OPTIONS }).promise
    },
  }
}

/** PDF.js's calls on the paper's own pages (1 to N), counted by page: getTextContent and getAnnotations always, a drawing while `on` */
function counter(N) {
  const c = { on: false, text: {}, annots: {}, render: {}, t0: 0, trace: [] }
  /** a span of the ask's (ms from its start), while it is counted */
  c.span = (what, from, to) => { if (c.on) c.trace.push([what, Math.round(from - c.t0), Math.round(to - c.t0)]) }
  const bump = (key, n) => { c[key][n] = (c[key][n] ?? 0) + 1 }
  c.wrap = doc => {
    const getPage = doc.getPage.bind(doc)
    doc.getPage = async n => {
      const t = performance.now()
      const page = await getPage(n)
      c.span(`getPage ${n}`, t, performance.now())
      if (n <= N && !page.__axtCounted) {
        page.__axtCounted = true
        const text = page.getTextContent.bind(page), annots = page.getAnnotations.bind(page), render = page.render.bind(page)
        page.getTextContent = (...a) => { bump('text', n); return text(...a) }
        page.getAnnotations = (...a) => { bump('annots', n); return annots(...a) }
        page.render = (...a) => {
          if (!c.on) return render(...a)
          bump('render', n)
          const t = performance.now(), task = render(...a)
          task.promise.then(() => c.span(`render ${n}`, t, performance.now()), () => {})
          return task
        }
      }
      return page
    }
    return doc
  }
  c.taken = () => ({ text: { ...c.text }, annots: { ...c.annots }, render: { ...c.render } })
  return c
}

/**
 * The door over the cut: its parts told as the run waits for one (`at` 'wait') or all at the open (`at` 'open'), the document the
 * wrapped page either way (base.pdf: no part carries a tail); `draw` false, the
 * run given no drawOf. Each left part fetched from the driver (and over `link`)
 */
async function openB({ name, target, rules, at, draw, link = null }) {
  const R = await import('/engine/layer-proto/reader.mjs')
  const { index, parts, gz } = await cutOf(name)
  const N = index.head.paper.pages
  const rows = await json(`/door/${name}/rows.json`)
  const counts = counter(N)
  const net = link ? linkOf(link, counts.span) : null
  const open = async path => counts.wrap(net ? await net.open(await bytes(path), R) : await pdfjs.getDocument({ data: await bytes(path), ...PDF_ASSETS, ...R.PDF_OPTIONS }).promise)
  const opened = []
  const doc = await open(`/fixtures/${name}/base.pdf`)
  opened.push(doc)
  const ruleSet = await ruleSetOf(rules)
  window.__gateRuns = []
  window.__gateNoDraw = !draw
  const retired = []
  let next = 0
  const leftPart = async page => {
    const t = performance.now()
    const b = await bytes(`/door/${name}/l${page}.json`)
    if (net) await net.ask(gz[page - 1], `left ${page}`)
    counts.span(`leftPart ${page}`, t, performance.now())
    return b
  }
  const layer = await R.openLayer({ index, doc, parts: at === 'open' ? parts : [], target, ...(ruleSet ? { rules: ruleSet } : {}), faceSources: await faceSourcesOf(), hyphUrl, OPS: pdfjs.OPS, leftPart, onRetired: d => { retired.push(d) } })
  const tell = i => layer.addPart(parts[i])
  if (at === 'wait') window.__gateWait = what => { if (what === 'part' && next < parts.length) tell(next++) }
  layer.take(rows)
  layer.end()
  return {
    layer, N, counts, net,
    /** every part told, the parts ended (the catalog's end), the layer let go and its documents destroyed */
    async done() {
      window.__gateWait = null
      if (at === 'wait') { while (next < parts.length) tell(next++); layer.endParts() }
      layer.dispose()
      for (const d of new Set([...opened, ...retired])) await d.loadingTask.destroy()
      window.__gateNoDraw = false
    },
  }
}

/** the run's account of the pages read from their draws (run.mjs drawStats), null where none were */
const drawStatsOf = () => lastRun().drawStats ?? null

window.doorDraw = {
  /** a paper's pages, live against its draws (served at /door/<paper>/draws.json): see the head */
  async inputs({ name, paper }) {
    const R = await import('/engine/layer-proto/reader.mjs')
    const { fontReaders, pageReadOf, liveFillsOf } = await import('/engine/layer-proto/run.mjs')
    const { checkDraw } = await import('/engine/layer-proto/draw.mjs')
    const LK = await import('/engine/layer-proto/links.mjs')
    const D = await json(`/door/${paper}/draws.json`)
    const doc = await pdfjs.getDocument({ data: await bytes(`/fixtures/${name}/base.pdf`), ...PDF_ASSETS, ...R.PDF_OPTIONS }).promise
    // (one reader each, as a run keeps its caches: pages in order)
    const live = fontReaders(), data = fontReaders()
    const out = { pages: doc.numPages, compared: 0, equal: 0, none: [], zeroSign: 0, differ: [], chars: 0, links: 0, nu: 0, overlaid: [], overlaidLost: 0 }
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      // (as drawPageOn reads a page live: its text asked, the page drawn, its annotations asked, the text in, its fonts from commonObjs)
      const viewport = page.getViewport({ scale: 1 })
      const c = document.createElement('canvas')
      c.width = Math.floor(viewport.width)
      c.height = Math.floor(viewport.height)
      const textP = page.getTextContent()
      await page.render({ canvas: c, canvasContext: c.getContext('2d'), viewport }).promise
      const annP = LK.readAnnots(page)
      const tc = await textP
      const L = live.live(page, tc.styles)
      // (an engine with no fills reads none)
      const fills = liveFillsOf ? await liveFillsOf(pdfjs.OPS, page, tc.items) : null
      const a = pageReadOf(tc, L.fontOf, L.mapOf, await annP, fills)
      out.overlaid.push(overlaidOf(p, a.read))
      page.cleanup()
      c.width = 0
      c.height = 0
      const d = D.pages[p - 1]
      if (!d?.draw) { out.none.push(`${p}:${d?.why ?? 'missing'}`); continue }
      const x = data.draw(checkDraw(d.draw))
      const b = pageReadOf(x.tc, x.fontOf, x.mapOf, x.raw, x.fills ?? null)
      out.compared++
      out.chars += a.chars.length
      out.links += a.read?.list.length ?? 0
      out.nu += a.chars.filter(c => c.nu).length
      const why = differs(a, b, out)
      if (why) out.differ.push(`p${p} ${why}`)
      else out.equal++
    }
    await doc.loadingTask.destroy()
    return out
  },

  /** the reference: the door with no drawOf, its pages asked in order, each page's PDF.js drawing at K kept as PNG */
  async ref({ name, target, rules, pages }) {
    const d = await openB({ name, target, rules, at: 'wait', draw: false })
    const out = []
    const R = await import('/engine/layer-proto/reader.mjs')
    const plain = await pdfjs.getDocument({ data: await bytes(`/fixtures/${name}/base.pdf`), ...PDF_ASSETS, ...R.PDF_OPTIONS }).promise
    for (let p = 1; p <= Math.min(pages, d.N); p++) {
      const got = await d.layer.pageOf(p, { lang: target })
      const page = await plain.getPage(p)
      const viewport = page.getViewport({ scale: K })
      const drawn = document.createElement('canvas')
      drawn.width = Math.floor(viewport.width)
      drawn.height = Math.floor(viewport.height)
      await page.render({ canvas: drawn, canvasContext: drawn.getContext('2d'), viewport }).promise
      page.cleanup()
      const png = await pngOf(drawn)
      drawn.width = 0
      drawn.height = 0
      out.push({ ...(await answerOf(d.layer, p, got, png)), png: base64(png) })
    }
    await plain.loadingTask.destroy()
    for (const e of out) e.recs = await recsOf(lastRun(), e.p)
    const held = { states: statesOf(d.layer, d.N), skipped: skippedOf(lastRun()), drawn: d.layer.stats().drawn, drawStats: drawStatsOf(), counts: d.counts.taken() }
    await d.done()
    return { pages: out, ...held }
  },

  /** the door with drawOf, its pages asked in order, each copy over the reference's PNG (served at /door/<name>/s<p>.png) */
  async data({ name, target, rules, pages }) {
    const d = await openB({ name, target, rules, at: 'wait', draw: true })
    const out = []
    for (let p = 1; p <= Math.min(pages, d.N); p++) {
      d.counts.on = true
      const got = await d.layer.pageOf(p, { lang: target })
      d.counts.on = false
      out.push(await answerOf(d.layer, p, got, await bytes(`/door/${name}/s${p}.png`)))
    }
    for (const e of out) e.recs = await recsOf(lastRun(), e.p)
    const held = { states: statesOf(d.layer, d.N), skipped: skippedOf(lastRun()), drawn: d.layer.stats().drawn, drawStats: drawStatsOf(), counts: d.counts.taken() }
    await d.done()
    return { pages: out, ...held }
  },

  /** a page asked first and alone, every part at the open, with drawOf (and over `link`) */
  async jump({ name, target, rules, page, perf = false, link = null, draw = true }) {
    const longTasks = []
    let observer = null
    const t0 = performance.now()
    const d = await openB({ name, target, rules, at: 'open', draw, link })
    const t1 = performance.now()
    if (perf && typeof PerformanceObserver === 'function') {
      observer = new PerformanceObserver(list => { for (const e of list.getEntries()) longTasks.push(e.duration) })
      observer.observe({ type: 'longtask' })
    }
    d.counts.on = true
    d.counts.t0 = performance.now()
    const net0 = d.net?.stats() ?? null
    const got = await d.layer.pageOf(page, { lang: target })
    const t2 = performance.now()
    d.counts.on = false
    // (what the ask read, at once: nothing else asks PDF.js for anything before this)
    const j = { drawStats: drawStatsOf(), counts: d.counts.taken(), units: d.layer.stats().drawn, trace: d.counts.trace.slice(), ...(d.net ? { link: { asked: d.net.stats().asked - net0.asked, bytes: d.net.stats().bytes - net0.bytes } } : {}) }
    const C = lastRun().closure(page)
    const read = [...(j.drawStats?.data ?? []), ...(j.drawStats?.live ?? [])]
    const closure = { draw: C.draw, within: read.every(q => C.draw.includes(q) || q === 1) }
    const answer = await answerOf(d.layer, page, got, await bytes(`/door/${name}/s${page}.png`))
    answer.recs = await recsOf(lastRun(), page)
    if (observer) { await new Promise(ok => setTimeout(ok, 0)); observer.takeRecords().forEach(e => longTasks.push(e.duration)); observer.disconnect() }
    await d.done()
    return { ...answer, j, closure, ...(perf ? { ms: { open: Math.round(t1 - t0), ask: Math.round(t2 - t1) }, longest: longTasks.length ? Math.round(Math.max(...longTasks)) : 0 } : {}) }
  },
}

/**
 * A page's Link annotations as the run keeps them (links.mjs annotsOf), PDF.js's overlaid text (`ov`, collapsed) against the text of
 * the layer's own glyph points inside each (`g2`, its characters joined, no spaces: charPoints keeps none): how many carry none,
 * how many are the same, the same but for white space, or other (each kind of difference counted, the first few kept)
 */
function overlaidOf(p, read) {
  const r = { p, n: 0, empty: 0, same: 0, space: 0, other: 0, kinds: {}, cases: [] }
  const collapse = t => t.replace(/\s+/gu, ' ').trim()
  for (const a of read?.list ?? []) {
    if (a.unsupported) continue
    r.n++
    const ov = a.ov, g = collapse(a.g2.ch.join(''))
    if (!ov) { r.empty++; continue }
    if (ov === g) { r.same++; continue }
    const bare = t => t.replace(/\s/gu, '')
    if (bare(ov) === bare(g)) { r.space++; continue }
    r.other++
    const kind = bare(ov).normalize('NFKC') === bare(g).normalize('NFKC') ? 'nfkc' : bare(ov).replace(/\u00ad/gu, '') === bare(g).replace(/\u00ad/gu, '') ? 'soft hyphen'
      : bare(ov).replace(/[-\u2010\u2011]/gu, '') === bare(g).replace(/[-\u2010\u2011]/gu, '') ? 'hyphen' : [...bare(ov)].sort().join('') === [...bare(g)].sort().join('') ? 'order'
        : bare(g).length < bare(ov).length ? 'fewer glyphs' : bare(g).length > bare(ov).length ? 'more glyphs' : 'other characters'
    r.kinds[kind] = (r.kinds[kind] ?? 0) + 1
    if (r.cases.length < 4) r.cases.push(`${JSON.stringify(ov)} | ${JSON.stringify(g)}`)
  }
  return r
}

/** where two readings of a page differ (null: equal): the characters field by field, numbers by Object.is but the sign of zero
 *  (counted in `out.zeroSign`), a font class by value; the annotations by value */
function differs(a, b, out) {
  if (a.chars.length !== b.chars.length) return `chars ${a.chars.length} against ${b.chars.length}`
  for (let i = 0; i < a.chars.length; i++) {
    const x = a.chars[i], y = b.chars[i]
    const keys = new Set([...Object.keys(x), ...Object.keys(y)])
    for (const k of keys) {
      const u = x[k], v = y[k]
      if (k === 'st') { if (JSON.stringify(u) !== JSON.stringify(v)) return `char ${i} st ${JSON.stringify(u)} against ${JSON.stringify(v)}`; continue }
      if (typeof u === 'number' && typeof v === 'number') {
        if (Object.is(u, v)) continue
        if (u === 0 && v === 0) { out.zeroSign++; continue }
      }
      if (!Object.is(u, v)) return `char ${i} ${k} ${String(u)} against ${String(v)}`
    }
  }
  const ann = r => JSON.stringify(r.read)
  if (ann(a) === ann(b)) return null
  // (the links alike but their overlaid text, which the draw lacks where PDF.js's live read has it: the server read the draw on
  // the lite worker with its links' text guard on (layout/pdf-lite.mjs TEXT_GUARD), the case the draw's read must opt out of)
  const blank = r => JSON.stringify({ ...r.read, list: r.read.list.map(x => ({ ...x, ov: '' })) })
  const lost = a.read && b.read ? a.read.list.filter((x, i) => x.ov && !b.read.list[i]?.ov).length : 0
  if (lost && blank(a) === blank(b)) {
    out.overlaidLost += lost
    return `the draw's links carry no overlaid text where PDF.js's live read has it (${lost} links): the draw was read on pdf-lite's worker with the links' text guard on (TEXT_GUARD), which the draw's read must turn off`
  }
  return `annotations ${ann(a).slice(0, 120)} against ${ann(b).slice(0, 120)}`
}
window.gateReady = true
