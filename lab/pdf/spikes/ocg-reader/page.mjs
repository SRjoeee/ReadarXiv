// lab/pdf/spikes/ocg-reader/page.mjs
// The reader's side of the per-unit optional-content erasure in a real browser (docs/route/ocg-erasure.md §4, §7.3, §8): a
// fixture's pages laid by the engine (run.mjs openProto) over our wrapped page, each page's copy drawn as a view draws it
// (drawCopy: render A, the units drawn there hidden by their groups, and its crops and pastes), and measured against the page:
//   G1   all ON against our unwrapped page: 0 px (outside image edges);
//   G3a  render A against all ON: the pixels that change outside the hidden rectangles the layout file gives the drawn units
//        (their lines' erase rectangles, moved placeholders' segments, labels and names drawn anew), grown by 2 device px: the
//        ink render A hides that the copy shows again (its kept placeholders and displays, from B; its kept characters, from C);
//   G3   the copy (render A, its pastes and crops) against all ON: 0 px differing outside those rectangles;
//   time render A cold (a fresh document) and warm against our unwrapped page's at the same k.
// The driver (../ocg-reader.mjs) serves the engine, PDF.js and the fixture; nothing here is measured from the network.
import * as pdfjs from 'pdfjs-dist'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.mjs'
const ASSETS = { cMapUrl: '/pdfjs/cmaps/', standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/', isImageDecoderSupported: false }
const bytes = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()) }
const json = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json() }
async function faceSourcesOf() {
  const [{ FACES }, { COVERAGE }] = await Promise.all([import('/engine/rules/font-roles.mjs'), import('/engine/rules/font-coverage.mjs')])
  return async id => (FACES[id] && COVERAGE[id] ? [{ url: `/fonts/${encodeURIComponent(FACES[id].file)}`, ranges: COVERAGE[id] }] : null)
}
const open = async data => pdfjs.getDocument({ data, ...ASSETS, cMapPacked: true, enableHWA: true, disableStream: true, fontExtraProperties: true }).promise
/** page p of `doc` at k on a canvas of the page's size, the groups `off` hidden (visibility.mjs) */
async function draw(V, doc, p, k, off = []) {
  const page = await doc.getPage(p), viewport = page.getViewport({ scale: k })
  const c = document.createElement('canvas')
  c.width = Math.ceil(viewport.width); c.height = Math.ceil(viewport.height)
  const t0 = performance.now()
  await V.visibilityOf(doc).render(page, { canvas: c, canvasContext: c.getContext('2d', { alpha: false }), viewport }, off)
  const ms = performance.now() - t0
  page.cleanup()
  return { c, ms, data: c.getContext('2d').getImageData(0, 0, c.width, c.height).data }
}
const apart = (a, b, inside = null) => {
  let n = 0, out = 0
  const W = a.c.width
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i] === b.data[i] && a.data[i + 1] === b.data[i + 1] && a.data[i + 2] === b.data[i + 2]) continue
    n++
    if (inside && !inside((i / 4) % W, Math.floor(i / 4 / W))) out++
  }
  return { n, out }
}
window.ocg = {
  async run({ name, target, pages, k = 2.5, png = [], explain = false }) {
    const [V, F] = await Promise.all([import('/engine/layer-proto/visibility.mjs'), import('/engine/layout/file.mjs')])
    const P = await import('/engine/layer-proto/run.mjs')
    const fx = `/fx/${name}/`
    const [wrappedBytes, baseBytes, geometry, record, unitsFile, layout, head] = await Promise.all([bytes(`${fx}wrapped.pdf`), bytes(`${fx}base.pdf`), json(`${fx}geometry.json`), json(`${fx}record.json`), json(`${fx}units.json`), bytes(`${fx}layout.json`), json(`${fx}wrapped.json`)])
    const unhidden = new Map(head.unhidden), labelKept = new Set(head.labelKept)
    const doc = await open(wrappedBytes.slice()), base = await open(baseBytes.slice())
    const t0 = performance.now()
    const run = await P.openProto({
      doc, geometry, units: record.units, target, pages: Number.POSITIVE_INFINITY, scale: k, dpr: 1, copy: false, records: true,
      tex: { symbols: 'text', extents: 'v0', index: F.indexLayout(F.parseLayout(layout)), pieces: new Map(unitsFile.units.map(u => [u.id, u.pieces])) },
      labels: { captions: { figure: 'target', table: 'target' } },
      hiding: { unhidden: id => unhidden.get(id) ?? null, labelKept: id => labelKept.has(id) },
      faceSources: await faceSourcesOf(), hyphUrl: lang => `/hyph/${lang}.json`, OPS: pdfjs.OPS,
    })
    const out = { N: run.N, groups: V.visibilityOf(doc).size, pages: [] }
    for (const p of pages) {
      if (p > run.N) continue
      await run.until(p)
      const row = run.rows[p - 1], off = [...row.off]
      let on = await draw(V, doc, p, k), unwrapped = await draw(V, base, p, k), A = await draw(V, doc, p, k, off)
      const A2 = await draw(V, doc, p, k, off), base2 = await draw(V, base, p, k)
      // the hidden rectangles of the page's drawn units (the 'hidden' operations, v0's device pixels at k), grown by 2 px
      const rects = row.ops.filter(o => o.op === 'hidden').flatMap(o => o.rects).map(([x, y, w, h]) => [x - 2, y - 2, x + w + 2, y + h + 2])
      const inside = (x, y) => rects.some(r => x >= r[0] && x < r[2] && y >= r[1] && y < r[3])
      // (Chromium's renders of a page with images may differ from each other: a mismatch is rendered again, up to three times, as
      // lab/pdf/spikes/ocg-gate.mjs does)
      let g1 = apart(on, unwrapped)
      for (let t = 0; t < 3 && g1.n; t++) { on = await draw(V, doc, p, k); unwrapped = await draw(V, base, p, k); g1 = apart(on, unwrapped) }
      const g3 = apart(on, A, inside)
      // the copy as a view draws it (render A, then its crops and pastes)
      const copy = document.createElement('canvas')
      copy.width = on.c.width; copy.height = on.c.height
      const tc = performance.now()
      await run.drawCopy(p, copy.getContext('2d', { alpha: false }), k)
      const copyMs = performance.now() - tc
      // (G3, what a reader sees: the copy against all ON, every pixel that differs inside the hidden rectangles; a crop or a paste
      // lands in its unit's own, the rest of the page is the page's)
      const copied = { c: copy, data: copy.getContext('2d').getImageData(0, 0, copy.width, copy.height).data }
      const g3copy = apart(on, copied, inside)
      // (G3's spill: a pixel the copy changes where render A left the page's own ink as it is, outside every rectangle the copy
      // draws into (hidden, pasted, cropped to): a paste or a crop reaching ink not its unit's. Must be 0)
      const box = r => [Math.min(r[0], r[0] + r[2]) - 2, Math.min(r[1], r[1] + r[3]) - 2, Math.max(r[0], r[0] + r[2]) + 2, Math.max(r[1], r[1] + r[3]) + 2]
      const into = [...rects, ...row.ops.filter(o => o.op === 'paste').flatMap(o => o.rects).map(box), ...row.ops.filter(o => o.op === 'crop').map(o => box(o.dst))]
      const spillOf = () => {
        let n = 0
        const W = on.c.width
        for (let i = 0; i < on.data.length; i += 4) {
          const same = (a, b) => a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2]
          if (same(on.data, copied.data) || !same(on.data, A.data)) continue
          const x = (i / 4) % W, y = Math.floor(i / 4 / W)
          if (!into.some(r => x >= r[0] && x < r[2] && y >= r[1] && y < r[3])) n++
        }
        return n
      }
      // (and the ink render A hides outside every rectangle the copy draws into and that the copy does not show again: a unit's own
      // ink past the layout file's rectangles, hidden with its groups, with nothing of the translation over it; counted, with its boxes)
      let lost = 0
      const lostCells = new Map()
      { const W = on.c.width, C = 10 * k
        for (let i = 0; i < on.data.length; i += 4) {
          const same = (a, b) => a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2]
          if (same(on.data, copied.data) || same(on.data, A.data)) continue
          const x = (i / 4) % W, y = Math.floor(i / 4 / W)
          if (into.some(r => x >= r[0] && x < r[2] && y >= r[1] && y < r[3])) continue
          lost++
          const key = `${Math.floor(x / C) * 10},${Math.floor(y / C) * 10}`
          lostCells.set(key, (lostCells.get(key) ?? 0) + 1)
        } }
      let spill = spillOf()
      for (let t = 0; t < 3 && spill; t++) { on = await draw(V, doc, p, k); A = await draw(V, doc, p, k, off); spill = Math.min(spill, spillOf()) }
      let copyCells = null
      if (explain && g3copy.out) {
        const cells = new Map(), W = on.c.width, C = 10 * k
        for (let i = 0; i < on.data.length; i += 4) {
          if (on.data[i] === copied.data[i] && on.data[i + 1] === copied.data[i + 1] && on.data[i + 2] === copied.data[i + 2]) continue
          const x = (i / 4) % W, y = Math.floor(i / 4 / W)
          if (inside(x, y)) continue
          const key = `${Math.floor(x / C) * 10},${Math.floor(y / C) * 10}`
          cells.set(key, (cells.get(key) ?? 0) + 1)
        }
        copyCells = [...cells].sort((a, b) => b[1] - a[1]).slice(0, 12)
      }
      const ops = {}
      for (const o of row.ops) ops[o.op] = (ops[o.op] ?? 0) + 1
      const rec = { p, off: off.length, ops, g1: g1.n, a: g3.n, aOutside: g3.out, copyOutside: g3copy.out, spill, lost, ...(lost ? { lostCells: [...lostCells].sort((a, b) => b[1] - a[1]).slice(0, 8) } : {}), aNoise: apart(A, A2).n, ...(explain && g3copy.out ? { copyCells } : {}), ms: { a: A.ms, aWarm: A2.ms, base: unwrapped.ms, baseWarm: base2.ms, copy: copyMs } }
      // (where A hides ink outside the rectangles: each drawn group alone, the pixels outside it changes and their box, in PDF units)
      if (explain && g3.out) {
        rec.outside = []
        for (const g of off) {
          const one = await draw(V, doc, p, k, [g])
          let n = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
          const W = on.c.width
          for (let i = 0; i < on.data.length; i += 4) {
            if (on.data[i] === one.data[i] && on.data[i + 1] === one.data[i + 1] && on.data[i + 2] === one.data[i + 2]) continue
            const x = (i / 4) % W, y = Math.floor(i / 4 / W)
            if (inside(x, y)) continue
            n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
          }
          if (n) rec.outside.push({ g, n, box: [x0 / k, y0 / k, x1 / k, y1 / k].map(v => Math.round(v * 10) / 10) })
        }
      }
      if (png.includes(p)) {
        const holder = document.createElement('div')
        holder.id = `page-${p}`
        holder.style.cssText = `position:relative;width:${copy.width}px;height:${copy.height}px`
        const svg = run.svgOf(p)
        svg.style.cssText = 'position:absolute;left:0;top:0'
        holder.append(copy, svg)
        document.body.append(holder)
      }
      out.pages.push(rec)
    }
    out.ms = performance.now() - t0
    out.hiding = run.hidingStats()
    out.skipped = {}
    for (const s of run.skipped) out.skipped[s.why] = (out.skipped[s.why] ?? 0) + 1
    out.drawn = run.drawn
    return out
  },
  /** render A's cost alone on every page (the heaviest fixture, no lay): cold (a fresh document a page) and warm, with every unit's
   *  text group hidden, against our unwrapped page's */
  async timing({ name, pages, k = 2.5 }) {
    const V = await import('/engine/layer-proto/visibility.mjs')
    const fx = `/fx/${name}/`
    const [w, b] = await Promise.all([bytes(`${fx}wrapped.pdf`), bytes(`${fx}base.pdf`)])
    const rows = []
    const first = await open(w.slice())
    const tCfg = performance.now()
    await V.visibilityOf(first).ready
    const configMs = performance.now() - tCfg
    const allText = g => g.startsWith('u') && !g.includes('.')
    const docA = first, docB = await open(b.slice())
    for (const p of pages) {
      const a = await draw(V, docA, p, k, allText), a2 = await draw(V, docA, p, k, allText), b1 = await draw(V, docB, p, k), b2 = await draw(V, docB, p, k)
      rows.push({ p, a: a.ms, aWarm: a2.ms, base: b1.ms, baseWarm: b2.ms })
    }
    return { configMs, groups: V.visibilityOf(docA).size, rows }
  },
}
