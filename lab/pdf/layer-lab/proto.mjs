// lab/pdf/layer-lab/proto.mjs
// The layer lab's v0 view: the instant layer as the engine draws it (src/pdf-reader/engine/layer-proto/run.mjs), with
// the layer gate's own inputs and choices (lab/pdf/spikes/layer-gate/proto.mjs, a pixel run of
// --engine-kind=proto --proto-tex=lines): the left's geometry of the paper (its anchors' line rectangles, the
// cut's), the fixture's record.json (the translation the units file carries), the fixture's layout file (the layer draws only
// from it: each unit it locates whole takes the file's lines, label and placeholders; any other unit is the original's;
// symbols 'text', extents 'v0'), the labels in the target's names where the final names them so (the rule set's labels, the record's captions), the
// role table's faces, and every choice made for the target: the layout rule set (rules/layout.mjs; D, adaptive fill, is its
// default, B an adaptiveFill of null).
// The text-removed PDF (the default): the paper's add-on (serve.mjs, the gate's), opened as a reader opens it, arXiv's
// pages and the add-on's in one document with its manifest; a unit the file locates whole is drawn over the file's own
// rectangles, filled with paper, or the removed page swapped in where the manifest says kept ink lies under them; no
// pixel is read. Without it, every unit is erased and put back.
// serve.mjs serves the engine at /proto-engine/. v0 lays each page at its own scale (1.25 CSS px a unit at the device's
// pixel ratio, the gate's) and keeps the page's drawing as data; the view draws the page at the pane's own resolution
// (run.mjs drawCopy): the wrapped page as PDF.js renders it for the pane, the drawn units' groups hidden, v0's pastes and crops, and the SVG
// over it at its own size, scaled by a transform (the identity at the gate's 2.5 device px a unit). A page done has v0's canvases let go and keeps its drawing and its SVG, so that a paper of any length
// fits.
import * as pdfjs from 'pdfjs-dist'

// (errors only: a run let go when a choice changes has its document destroyed under its tasks, which PDF.js warns of)
const ASSETS = { cMapUrl: '/pdfjs/cmaps/', standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/', verbosity: 0 }
const json = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status} ${(await r.text()).slice(0, 300)}`); return r.json() }
const bytes = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()) }
/** how the layout file is taken, the gate's (--proto-tex=lines) */
const TEX = { symbols: 'text', extents: 'v0' }

/** v0's driver and the layout rule set's module (the built-in set, and the reading of a target's rules), or why they are not there */
export async function loadProto() {
  try {
    const [V, R] = await Promise.all([import('/proto-engine/layer-proto/run.mjs'), import('/proto-engine/rules/layout.mjs')])
    return { ready: true, V, R }
  } catch (e) { return { ready: false, why: `no v0 engine: ${String(e?.message ?? e).slice(0, 200)}` } }
}

/** a fixture's v0 run: its pages, each done once, as { svg (markup), w, h, recs, ms }, and each drawn at a pane's
 *  resolution. `status` is told what the run waits on, by key ('addon': the paper's wrapped page is being made or read), for the
 *  page to say in its own language */
export class ProtoRun {
  static async open({ V, rules = null, name, target, faces, removal = true, tex = true, status = () => {} }) {
    const base = `/fixtures/${encodeURIComponent(name)}/`
    const [geometry, record, units, layout] = await Promise.all([json(`${base}geometry.json`), json(`${base}record.json`), tex ? json(`${base}units.json`) : null, tex ? bytes(`${base}layout.json`) : null])
    // the layout file read by the engine's own reader, the units file's pieces by unit (a fixture with none: the engine
    // refuses the open, the layer drawing only from the file)
    let texIn = null
    if (tex) {
      const F = await import('/proto-engine/layout/file.mjs')
      texIn = { ...TEX, index: F.indexLayout(F.parseLayout(layout)), pieces: new Map(units.units.map(u => [u.id, u.pieces])) }
    }
    // the document: the fixture's base page wrapped by optional content (serve.mjs /api/wrap, one document, as a reader opens
    // it; with `removal` off, its base unwrapped, every unit the original's). Its loading task is this function's until a
    // ProtoRun holds it: a failure from here on (the wrap, the engine refusing the paper or a face) destroys it, and so lets the
    // document's worker go, before the failure is passed on
    let task = null
    try {
      const load = async url => { task = pdfjs.getDocument({ data: await bytes(url), ...ASSETS, ...V.PDF_OPTIONS }); return task.promise }
      let doc, wrap = null
      if (removal) {
        status('addon')
        wrap = await json(`/api/wrap/${encodeURIComponent(name)}`)
        doc = await load(`/wrap/${wrap.key}.pdf`)
      } else doc = await load(`${base}base.pdf`).catch(() => load(`${base}arxiv.pdf`))
      const head = wrap?.head ?? {}
      const unhidden = new Map(head.unhidden ?? []), labelKept = new Set(head.labelKept ?? []), cellRules = new Map(Object.entries(head.rules ?? {}).map(([q, r]) => [Number(q), r]))
      const t0 = performance.now()
      const run = await V.openProto({
        doc, geometry, units: record.units, target, scale: 1.25, dpr: devicePixelRatio, ...(rules ? { rules } : {}), faces, copy: false,
        ...(texIn ? { tex: texIn } : {}), hiding: { unhidden: id => unhidden.get(id) ?? null, labelKept: id => labelKept.has(id), rules: q => cellRules.get(q) },
        labels: { captions: record.captions ?? null }, OPS: pdfjs.OPS,
        faceUrl: f => `/fonts/${encodeURIComponent(f)}`, fontUrl: f => `/proto-fonts/${f}.otf`, hyphUrl: l => `/hyph/${l}.json`,
      })
      return new ProtoRun(run, doc, { faces, wrap, rules: run.rules, openMs: performance.now() - t0, tex: !!texIn })
    } catch (e) {
      await Promise.resolve(task?.destroy()).catch(() => {})
      throw e
    }
  }
  constructor(run, doc, meta) { this.run = run; this.doc = doc; this.meta = meta; this.done = new Map() }
  /** the run let go (its sheet out of the page, its canvases freed, nothing drawn or laid after), then its document: done when
   *  the document is destroyed */
  async close() {
    this.run.dispose()
    await this.doc.loadingTask.destroy()
  }
  /** what the run hid and showed again (run.mjs hidingStats): units drawn, boxes pasted from renders B and C, crops */
  removal() { return this.run.hidingStats?.() ?? null }
  /** page p, done: every page up to the one that finishes it drawn, each page done on the way kept and let go. `wait`
   *  is how long this call waited for the engine (the pages it drew ahead, which the page pass needs, included) */
  async page(p) {
    const { run } = this
    if (this.done.has(p)) return this.done.get(p)
    const t0 = performance.now()
    await run.until(p)
    const wait = performance.now() - t0
    for (let q = 1; q <= run.N; q++) {
      if (this.done.has(q) || run.doneAt(q) > run.doneAt(p) || !run.rows[q - 1].base) continue
      const row = run.rows[q - 1]
      // (the SVG as the engine set it, made of its kept markup, its own size in v0's CSS px and no viewBox: a viewBox, even at
      // scale 1, rasterizes the text otherwise than the gate's SVG; the view scales it by a transform)
      const svg = run.svgOf(q)
      const units = row.ops.filter(o => o.op === 'hidden').length
      this.done.set(q, { svg: svg.outerHTML, w: row.w, h: row.h, recs: run.stats.filter(r => r.pages.includes(q)), ms: run.pageMs[q] ?? null, times: run.pageTimes?.[q] ?? null, wait: q === p ? wait : null, removal: this.meta.wrap ? { removed: !!this.meta.wrap.head?.wrapped && units > 0, units } : null })
      run.release(q)
    }
    return this.done.get(p) ?? null
  }
  /** a done page's copy at a pane's resolution: a canvas the size of `source`, the page rendered at `k` device pixels a unit
   *  with the groups of the units drawn there hidden, and v0's pastes and crops (run.mjs drawCopy) */
  async copy(p, source, k) {
    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    await this.run.drawCopy(p, canvas.getContext('2d'), k)
    return canvas
  }
}
