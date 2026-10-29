// lab/pdf/spikes/ocg-gate.mjs
// The per-unit erasure's lab gate (docs/PDF-READER.md §19.9; the design note docs/route/ocg-erasure.md §7): our final pass
// wrapped by optional content (layout/wrap.mjs wrapFinal, the paper's source units), then, per paper:
//   - in Node: the wrap's counts (pages wrapped and refused, units left the original's by why, labels kept, splits, groups), its
//     time, the wrapped base's growth, the delta over arXiv's PDF built from the wrapped bytes against the one of the unwrapped
//     pass (layout/delta.mjs deltaOf), and its proof (proveDelta);
//   - in Chromium (Playwright's, `--canvas=gpu` the production canvas, `cpu` the software one; PDF.js's modern build of the
//     repository, `isImageDecoderSupported: false`, scale 2; a mismatch rendered again up to three times, since Chromium's own
//     renders of a page may differ from each other), every page: G1, every group ON against our unwrapped page, the pixels
//     outside the split shows' glyph boxes (+1 px) and the image edges (within 1 px of an image's box) must be 0, and those
//     inside the split glyphs are counted (E4's bound: at most 0.1 % of the boxes' pixels, max channel Δ 16). (G2', the units'
//     text and labels OFF against the remover's cut of the same ownership, was measured while the remover was there, at
//     85fdc442: lab/pdf/records/ocg-gate.md; it went with the remover, its only oracle, when REMOVAL 8 deleted it.)
// It reads the gate pack's fixtures (`--pack`, lab/pdf/data/fixtures by default: <id>-zh/arxiv.pdf and base.pdf, our final
// pass), each paper's source (`--sources`, lab/pdf/data/corpus/<id>/source.gz: its units), and pairs given whole (`--pair=<id>=
// <arxiv.pdf>,<base.pdf>`, the 2602.23285v2 heavy pair, whose source is not read: no spell check); it writes nothing but its
// lines (one JSON line a paper, the pages' rows with `--rows`). The record of a run: lab/pdf/records/ocg-gate.md.
//   pnpm exec tsx lab/pdf/spikes/ocg-gate.mjs [--pack=<dir>] [--sources=<dir>] [--pair=<id>=<a>,<b>] [--canvas=gpu|cpu] [--rows] <id>…
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync, inflateSync } from 'node:zlib'
import * as PL from '@cantoo/pdf-lib'
import { chromium } from 'playwright'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { deltaOf, proveDelta } from '../../../src/pdf-reader/engine/layout/delta.mjs'
import { pageInk } from '../../../src/pdf-reader/engine/layout/ink.mjs'
import { liteWorkerSource, NO_IMAGE_PIXELS } from '../../../src/pdf-reader/engine/layout/pdf-lite.mjs'
import { wrapFinal } from '../../../src/pdf-reader/engine/layout/wrap.mjs'
import { openPaper } from '../../../src/pdf-reader/engine/pipeline/live.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/source/tar.mjs'

const LAB = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argOf = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const PACK = argOf('pack') ?? join(LAB, 'data/fixtures'), SOURCES = argOf('sources') ?? join(LAB, 'data/corpus')
const CANVAS = argOf('canvas') ?? 'gpu', ROWS = process.argv.includes('--rows')
const PAIRS = new Map(process.argv.filter(a => a.startsWith('--pair=')).map(a => { const [id, rest] = a.slice(7).split('='); const [orig, base] = rest.split(','); return [id, { orig, base }] }))
const IDS = process.argv.slice(2).filter(a => !a.startsWith('--'))
if (!IDS.length) { console.error('usage: ocg-gate.mjs [options] <id>…'); process.exit(2) }
const PDFJS = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
// (the box's PDF.js: its worker lite, no image's pixels decoded, as the container reads our pass)
globalThis.pdfjsWorker = await import(`data:text/javascript;base64,${Buffer.from(liteWorkerSource(readFileSync(join(PDFJS, 'legacy/build/pdf.worker.mjs'), 'utf8'), { version: JSON.parse(readFileSync(join(PDFJS, 'package.json'), 'utf8')).version })).toString('base64')}`)
const OPTIONS = { cMapUrl: join(PDFJS, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(PDFJS, 'standard_fonts/'), verbosity: 0, useSystemFonts: false, maxImageSize: NO_IMAGE_PIXELS }
const deflate = b => deflateSync(b, { level: 6 }), inflate = (b, l) => inflateSync(b, { maxOutputLength: l + 1 })

// ---- the page in Chromium: open, render with groups set, compare inside and outside rectangles
const PAGE = `<!doctype html><meta charset="utf-8"><script type="module">
import * as pdfjs from '/pdfjs/build/pdf.mjs'
pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.mjs'
const docs = new Map(), imgs = new Map()
const hwa = new URLSearchParams(location.search).get('hwa') === '1'
window.gate = {
  async open(id, name) { const data = new Uint8Array(await (await fetch('/pdf/' + name)).arrayBuffer()); docs.set(id, await pdfjs.getDocument({ data, cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', enableHWA: hwa, isImageDecoderSupported: false, verbosity: 0 }).promise) },
  async render(id, n, key, off) {
    const doc = docs.get(id), page = await doc.getPage(n), vp = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: !hwa })
    const cfg = await doc.getOptionalContentConfig({ intent: 'display' })
    for (const [gid, g] of cfg) cfg.setVisibility(gid, !(off ?? []).includes(g.name))
    await page.render({ canvasContext: ctx, canvas, viewport: vp, optionalContentConfigPromise: Promise.resolve(cfg) }).promise
    imgs.set(key, { w: canvas.width, h: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data })
  },
  cmp(a, b, rects) {
    const A = imgs.get(a), B = imgs.get(b), w = A.w, m = new Uint8Array(w * A.h)
    for (const [x0, y0, x1, y1] of rects) for (let y = Math.max(0, Math.floor(y0) - 1); y < Math.min(A.h, Math.ceil(y1) + 1); y++) m.fill(1, y * w + Math.max(0, Math.floor(x0) - 1), y * w + Math.min(w, Math.ceil(x1) + 1))
    let inside = 0, outside = 0, maxIn = 0, maxOut = 0, region = 0
    for (let p = 0; p < m.length; p++) region += m[p]
    for (let i = 0, p = 0; i < A.data.length; i += 4, p++) {
      const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]), Math.abs(A.data[i + 3] - B.data[i + 3]))
      if (!d) continue
      if (m[p]) { inside++; maxIn = Math.max(maxIn, d) } else { outside++; maxOut = Math.max(maxOut, d) }
    }
    return { inside, outside, maxIn, maxOut, region }
  },
  close(id) { return docs.get(id)?.loadingTask.destroy() },
}
</script>`

/** the marking's texts a fixture's base page was marked with (base.json's `texts`, the pack's), else null: the marks not in
 *  hand */
const inklessOf = base => { const f = join(dirname(base), 'base.json'); const t = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8'))?.inkless : null; return Array.isArray(t) ? t : null }
const textsOf = base => { const f = join(dirname(base), 'base.json'); const t = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8'))?.texts : null; return Array.isArray(t) ? t : null }

async function paper(id) {
  const pair = PAIRS.get(id) ?? { orig: join(PACK, `${id}-zh/arxiv.pdf`), base: join(PACK, `${id}-zh/base.pdf`) }
  const src = join(SOURCES, id, 'source.gz')
  const units = !PAIRS.has(id) && existsSync(src) ? openPaper((await unpackSource(new Uint8Array(readFileSync(src)))).files).units : null
  const bytes = new Uint8Array(readFileSync(pair.base)), orig = new Uint8Array(readFileSync(pair.orig))
  const t0 = performance.now()
  const r = await wrapFinal(bytes, { PL, getDocument, documentOptions: OPTIONS, OPS, units, ...(units ? {} : { follows: null }), texts: textsOf(pair.base), inkless: inklessOf(pair.base), deflate, inflate, keepOwned: true })
  const wrapMs = Math.round(performance.now() - t0)
  if (r.refused) return { id, refused: r.refused, why: r.why }
  const d = await deltaOf(orig, r.bytes, { PL }), d0 = await deltaOf(orig, bytes, { PL })
  const proof = d.refused ? d.refused : (await proveDelta(orig, d.delta, r.bytes, { PL, getDocument, documentOptions: OPTIONS, replaced: d.replaced })).ok ? 'ok' : 'failed'
  // the pages' split glyphs and image edges (device px at scale 2)
  const own = r.owned, rects = []
  const task = getDocument({ ...OPTIONS, data: bytes.slice() }), doc = await task.promise
  const N = doc.numPages
  for (let p = 1; p <= N; p++) {
    const page = await doc.getPage(p), vp = page.getViewport({ scale: 2 })
    const ink = pageInk(OPS, await page.getOperatorList(), page.commonObjs, { rotate: page.rotate, indices: true })
    const G = own.glyphs[p - 1] ?? []
    const byShow = new Map()
    ink.glyphs.forEach((g, i) => { if (g.n >= 0) (byShow.get(g.n) ?? byShow.set(g.n, new Set()).get(g.n)).add(G[i] ?? null) })
    const split = new Set([...byShow].filter(([, s]) => s.size > 1).map(([n]) => n))
    const dev = (x0, y0, x1, y1) => { const [a, b] = vp.convertToViewportPoint(x0, y0), [c, e] = vp.convertToViewportPoint(x1, y1); return [Math.min(a, c), Math.min(b, e), Math.max(a, c), Math.max(b, e)] }
    const image = []
    for (let b = 0; 4 * b + 3 < ink.boxes.length; b++) {
      if (ink.paths[b] !== -3) continue
      const [x0, y0, x1, y1] = dev(...ink.boxes.slice(4 * b, 4 * b + 4))
      image.push([x0 - 1, y0 - 1, x1 + 1, y0 + 1], [x0 - 1, y1 - 1, x1 + 1, y1 + 1], [x0 - 1, y0 - 1, x0 + 1, y1 + 1], [x1 - 1, y0 - 1, x1 + 1, y1 + 1])
    }
    rects.push({ split: ink.glyphs.filter(g => split.has(g.n)).map(g => dev(Math.min(g.x0, g.ix0), g.bottom, Math.max(g.x1, g.ix1), g.top)), image })
    page.cleanup()
  }
  await task.destroy()
  // Chromium
  const files = new Map([['plain.pdf', bytes], ['wrapped.pdf', r.bytes]])
  const browser = await chromium.launch({ channel: 'chromium' })
  try {
    const page = await browser.newPage()
    await page.route('http://ocg-gate.local/**', route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/') return route.fulfill({ contentType: 'text/html', body: PAGE })
      if (path.startsWith('/pdf/')) return route.fulfill({ contentType: 'application/pdf', body: Buffer.from(files.get(path.slice(5))) })
      const f = join(PDFJS, path.slice('/pdfjs/'.length))
      return existsSync(f) ? route.fulfill({ contentType: f.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream', body: readFileSync(f) }) : route.fulfill({ status: 404 })
    })
    await page.goto(`http://ocg-gate.local/?hwa=${CANVAS === 'gpu' ? 1 : 0}`)
    await page.waitForFunction(() => window.gate)
    const call = (fn, ...a) => page.evaluate(([f, x]) => window.gate[f](...x), [fn, a])
    await call('open', 'P', 'plain.pdf')
    await call('open', 'W', 'wrapped.pdf')
    const rows = []
    for (let p = 1; p <= N; p++) {
      const { split, image } = rects[p - 1], row = { p }
      const again = async (a, b, draw, all) => { let c; for (let t = 0; t < 4; t++) { await draw(); c = await call('cmp', a, b, all); if (!c.outside) break; if (!t) row.first = c.outside } return c }
      const g1 = await again('P', 'A', async () => { await call('render', 'P', p, 'P'); await call('render', 'W', p, 'A') }, [...split, ...image])
      const inSplit = split.length ? await call('cmp', 'P', 'A', split) : { inside: 0, region: 0, maxIn: 0 }
      Object.assign(row, { g1: g1.outside, splitShare: inSplit.region ? inSplit.inside / inSplit.region : 0, splitMax: inSplit.maxIn })
      rows.push(row)
    }
    const st = r.stats
    return {
      id, canvas: CANVAS, pages: N, wrapped: st.wrapped, refusedPages: st.refusedPages, unhidden: st.unhidden, labelKept: st.labelKept, split: st.split, groups: st.groups,
      wrapMs, baseBytes: [bytes.length, r.bytes.length], delta: d.refused ?? d.delta.length, deltaUnwrapped: d0.refused ?? d0.delta.length, proof,
      g1Pages: rows.filter(x => x.g1).map(x => [x.p, x.g1]), splitShareMax: Math.max(0, ...rows.map(x => x.splitShare)), splitMax: Math.max(0, ...rows.map(x => x.splitMax)),
      ...(ROWS ? { rows } : {}),
    }
  } finally { await browser.close() }
}

for (const id of IDS) console.log(JSON.stringify(await paper(id)))
