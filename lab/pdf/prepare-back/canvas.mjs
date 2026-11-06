// lab/pdf/prepare-back/canvas.mjs: the add-on in the reader's canvas (stage 1a's exit; spike S1c's hazard H3): arXiv's page A
// and the composed document W (A + its add-on, every group ON) rendered by PDF.js in Chromium (Playwright's, the GPU canvas the
// readers draw on, scale 2), every page; the pixels that differ must lie inside the glyph boxes of the show operators the wrap
// split (+1 px) or on an image's edge (within 1 px), and inside the split glyphs they are counted against today's bound (the
// erasure's E4: at most 0.1 % of their boxes' pixels, max channel Δ 16; docs/route/ocg-erasure.md §7.1). A page that differs
// outside is rendered again up to three times (Chromium's own renders of a page may differ from each other), as ocg-gate.mjs.
// Which shows were split is read from the two documents, not from the plan: an A show whose glyphs W shows in more than one.
//   node --import tsx lab/pdf/prepare-back/canvas.mjs <candidate out> <papers.tsv> [--canvas=gpu|cpu] <id>…
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pageInk } from '@readarxiv/engine'
import { chromium } from 'playwright'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

const [OUT, LIST] = process.argv.slice(2)
const CANVAS = process.argv.find(a => a.startsWith('--canvas='))?.slice(9) ?? 'gpu'
const IDS = process.argv.slice(4).filter(a => !a.startsWith('--'))
// (--figures-off: also each page with its figure texts' groups OFF against A, the pixels changed outside their members' lines'
// boxes counted: whether PDF.js hides a figure text written inside its form exactly)
const FIGURES_OFF = process.argv.includes('--figures-off')
// (--self: A against A, opened twice and each page rendered by each: what the canvas itself does not give the same twice)
const SELF = process.argv.includes('--self')
// (--rows: each page that differs, inside the splits or outside them)
const ROWS = process.argv.includes('--rows')
// (--crop=<page>,<x0>,<y0>,<x1>,<y1>: that box of A's and W's renders (PDF units) written beside the outputs, 8 times larger)
const NORMALIZE = process.argv.includes('--normalize')
// (--flush: every draw call on the page's canvas rasterised at once, in both renders: see the page's `flush`)
const FLUSH = process.argv.includes('--flush')
const CROP = process.argv.find(a => a.startsWith('--crop='))?.slice(7).split(',').map(Number) ?? null
const dirs = new Map(readFileSync(LIST, 'utf8').split('\n').filter(Boolean).map(l => l.split('\t')))
const PDFJS = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
const OPTIONS = { cMapUrl: join(PDFJS, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(PDFJS, 'standard_fonts/'), verbosity: 0, useSystemFonts: false }

const PAGE = `<!doctype html><meta charset="utf-8"><script type="module">
import * as pdfjs from '/pdfjs/build/pdf.mjs'
pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.mjs'
const docs = new Map(), imgs = new Map()
const hwa = new URLSearchParams(location.search).get('hwa') === '1'
// (?normalize=1, the cause's experiment: every glyph's origin computed once in double precision and handed to the canvas as the
// matrix's translation with the glyph at 0, so that A and W give Skia the same float32 numbers for the same glyph whatever
// split PDF.js's pen position between the matrix and the argument)
if (new URLSearchParams(location.search).get('normalize') === '1') {
  const fill = CanvasRenderingContext2D.prototype.fillText
  CanvasRenderingContext2D.prototype.fillText = function (s, x, y, ...r) {
    const m = this.getTransform()
    this.save()
    this.setTransform(m.a, m.b, m.c, m.d, m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f)
    fill.call(this, s, 0, 0, ...r)
    this.restore()
  }
}
// (?flush=1: the canvas made to rasterise after every draw call on the page's canvas (a one-pixel read back), in A's render and
// W's alike. Chromium records a 2D canvas's calls and rasterises them in batches whose ends fall where the page's task yields
// (PDF.js's operator list arrives in chunks, W's longer by its marked content); the pixels of the same calls depend on where a
// batch ends (A against itself, flushed after every call or not: 7,566 pixels on 2610.20030v1 p10). Flushed after every call,
// the same calls give the same pixels, so what is left between A and W is what their calls differ by)
if (new URLSearchParams(location.search).get('flush') === '1') {
  const P = CanvasRenderingContext2D.prototype
  for (const name of ['drawImage', 'fillText', 'strokeText', 'fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'putImageData']) {
    const f = P[name]
    P[name] = function (...a) { const r = f.apply(this, a); if (this.canvas?.axtPage) this.getImageData(0, 0, 1, 1); return r }
  }
}
window.gate = {
  async open(id, name) { const data = new Uint8Array(await (await fetch('/pdf/' + name)).arrayBuffer()); docs.set(id, await pdfjs.getDocument({ data, cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', enableHWA: hwa, isImageDecoderSupported: false }).promise) },
  async render(id, n, key, off) {
    const doc = docs.get(id), page = await doc.getPage(n), vp = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height)
    canvas.axtPage = true
    const ctx = canvas.getContext('2d', { willReadFrequently: !hwa })
    const cfg = await doc.getOptionalContentConfig({ intent: 'display' })
    if (off) for (const [gid, g] of cfg) if (off.includes(g.name)) cfg.setVisibility(gid, false, false)
    await page.render({ canvasContext: ctx, canvas, viewport: vp, optionalContentConfigPromise: Promise.resolve(cfg) }).promise
    imgs.set(key, { w: canvas.width, h: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas })
    page.cleanup()
  },
  crop(key, x, y, w, h, k) {
    const c = document.createElement('canvas'); c.width = w * k; c.height = h * k
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(imgs.get(key).canvas, x, y, w, h, 0, 0, w * k, h * k)
    return c.toDataURL('image/png')
  },
  cmp(a, b, rects) {
    const A = imgs.get(a), B = imgs.get(b), w = A.w, m = new Uint8Array(w * A.h)
    for (const [x0, y0, x1, y1] of rects) for (let y = Math.max(0, Math.floor(y0) - 1); y < Math.min(A.h, Math.ceil(y1) + 1); y++) m.fill(1, y * w + Math.max(0, Math.floor(x0) - 1), y * w + Math.min(w, Math.ceil(x1) + 1))
    let inside = 0, outside = 0, maxIn = 0, maxOut = 0, region = 0
    const at = []
    for (let p = 0; p < m.length; p++) region += m[p]
    for (let i = 0, p = 0; i < A.data.length; i += 4, p++) {
      const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]), Math.abs(A.data[i + 3] - B.data[i + 3]))
      if (!d) continue
      if (m[p]) { inside++; maxIn = Math.max(maxIn, d); if (at.length < 12 && inside % 7 === 1) at.push([p % w, Math.floor(p / w), d]) } else { outside++; maxOut = Math.max(maxOut, d) }
    }
    return { inside, outside, maxIn, maxOut, region, at }
  },
}
</script>`

async function rectsOf(A, W) {
  const read = async bytes => {
    const task = getDocument({ ...OPTIONS, data: bytes.slice() }), doc = await task.promise, pages = []
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p), vp = page.getViewport({ scale: 2 })
      const ink = pageInk(OPS, await page.getOperatorList(), page.commonObjs, { rotate: page.rotate, indices: true, turned: true })
      pages.push({ ink, vp })
      page.cleanup()
    }
    await task.destroy()
    return pages
  }
  const a = await read(A), w = await read(W)
  return a.map(({ ink, vp }, i) => {
    const wi = w[i].ink
    const dev = (x0, y0, x1, y1) => { const [p, q] = vp.convertToViewportPoint(x0, y0), [r, s] = vp.convertToViewportPoint(x1, y1); return [Math.min(p, r), Math.min(q, s), Math.max(p, r), Math.max(q, s)] }
    const shows = new Map()
    ink.glyphs.forEach((g, j) => { if (g.n >= 0 && wi.glyphs[j]) (shows.get(g.n) ?? shows.set(g.n, new Set()).get(g.n)).add(wi.glyphs[j].n) })
    ;(ink.turned ?? []).forEach((t, j) => { if (t.n >= 0 && wi.turned?.[j]) (shows.get(t.n) ?? shows.set(t.n, new Set()).get(t.n)).add(wi.turned[j].n) })
    const split = new Set([...shows].filter(([, s]) => s.size > 1).map(([n]) => n))
    const image = []
    for (let b = 0; 4 * b + 3 < ink.boxes.length; b++) {
      if (ink.paths[b] !== -3) continue
      const [x0, y0, x1, y1] = dev(...ink.boxes.slice(4 * b, 4 * b + 4))
      image.push([x0 - 1, y0 - 1, x1 + 1, y0 + 1], [x0 - 1, y1 - 1, x1 + 1, y1 + 1], [x0 - 1, y0 - 1, x0 + 1, y1 + 1], [x1 - 1, y0 - 1, x1 + 1, y1 + 1])
    }
    const splitRects = ink.glyphs.filter(g => split.has(g.n)).map(g => dev(Math.min(g.x0, g.ix0), g.bottom, Math.max(g.x1, g.ix1), g.top))
    for (const t of ink.turned ?? []) if (split.has(t.n) && t.box >= 0) splitRects.push(dev(...ink.boxes.slice(4 * t.box, 4 * t.box + 4)))
    return { split: splitRects, image, splitShows: split.size, vp: (x, y) => vp.convertToViewportPoint(x, y), h: vp.height / 2 }
  })
}

const browser = await chromium.launch({ channel: 'chromium' })
try {
  for (const id of IDS) {
    const A = new Uint8Array(readFileSync(join(dirs.get(id), 'arxiv.pdf')))
    const bdir = join(OUT, 'bundles', id)
    const addOnFile = existsSync(bdir) ? readdirSync(bdir).find(f => f.endsWith('.addon')) : null
    if (!addOnFile) { console.log(JSON.stringify({ id, refused: 'no add-on' })); continue }
    const add = readFileSync(join(bdir, addOnFile))
    const W = new Uint8Array(A.length + add.length)
    W.set(A)
    W.set(add, A.length)
    const rects = await rectsOf(A, W)
    // (each page's figure members, from the bundle's parts: their groups' names and their lines' boxes)
    const figs = new Map()
    if (FIGURES_OFF) {
      const head = JSON.parse(readFileSync(join(bdir, 'head.json'), 'utf8'))
      head.parts.forEach((d, i) => {
        if (!d) return
        const part = JSON.parse(readFileSync(join(bdir, `${d}.part`), 'utf8'))
        const names = [], lines = []
        for (const flow of part.flows) for (const m of flow) if (m.kind === 'figure' && !m.why) for (const l of m.lines) if (l[0] === i + 1) { names.push(`axt:${m.ord}.${i + 1}.t`); lines.push([l[2], l[6], l[3], l[5]]) }
        figs.set(i + 1, { names, lines })
      })
    }
    const files = new Map([['a.pdf', A], ['w.pdf', SELF ? A : W]])
    const page = await browser.newPage()
    await page.route('http://canvas.local/**', route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/') return route.fulfill({ contentType: 'text/html', body: PAGE })
      if (path.startsWith('/pdf/')) return route.fulfill({ contentType: 'application/pdf', body: Buffer.from(files.get(path.slice(5))) })
      const f = join(PDFJS, path.slice('/pdfjs/'.length))
      return existsSync(f) ? route.fulfill({ contentType: f.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream', body: readFileSync(f) }) : route.fulfill({ status: 404 })
    })
    await page.goto(`http://canvas.local/?hwa=${CANVAS === 'gpu' ? 1 : 0}${NORMALIZE ? '&normalize=1' : ''}${FLUSH ? '&flush=1' : ''}`)
    await page.waitForFunction(() => window.gate)
    const call = (fn, ...a) => page.evaluate(([f, x]) => window.gate[f](...x), [fn, a])
    await call('open', 'A', 'a.pdf')
    await call('open', 'W', 'w.pdf')
    const rows = []
    for (let p = 1; p <= rects.length; p++) {
      const { split, image, splitShows } = rects[p - 1]
      let c
      for (let t = 0; t < 4; t++) { await call('render', 'A', p, 'a'); await call('render', 'W', p, 'w'); c = await call('cmp', 'a', 'w', [...split, ...image]); if (!c.outside) break }
      const inSplit = split.length ? await call('cmp', 'a', 'w', split) : { inside: 0, region: 0, maxIn: 0 }
      if (CROP && CROP[0] === p) {
        const [, x0, y0, x1, y1] = CROP, H = rects[p - 1].h
        for (const key of ['a', 'w']) {
          const url = await call('crop', key, Math.round(2 * x0), Math.round(2 * (H - y1)), Math.round(2 * (x1 - x0)), Math.round(2 * (y1 - y0)), 8)
          writeFileSync(join(OUT, `crop-${id}-p${p}-${key}.png`), Buffer.from(url.split(',')[1], 'base64'))
        }
      }
      const row = { p, outside: c.outside, any: c.inside + c.outside, splitShows, share: inSplit.region ? inSplit.inside / inSplit.region : 0, max: inSplit.maxIn, ...(ROWS && inSplit.at?.length ? { at: inSplit.at.map(([x, y, d]) => [+(x / 2).toFixed(1), +(rects[p - 1].h - y / 2).toFixed(1), d]) } : {}) }
      const fig = figs.get(p)
      if (FIGURES_OFF && fig?.names.length) {
        await call('render', 'W', p, 'f', fig.names)
        const vp = rects[p - 1].vp
        const boxes = fig.lines.map(([x0, y0, x1, y1]) => { const [a, b] = vp(x0, y0), [cc, d] = vp(x1, y1); return [Math.min(a, cc) - 1, Math.min(b, d) - 1, Math.max(a, cc) + 1, Math.max(b, d) + 1] })
        const f = await call('cmp', 'a', 'f', boxes)
        row.figOff = { inside: f.inside, outside: f.outside }
      }
      rows.push(row)
    }
    await page.close()
    if (ROWS) for (const r of rows) if (r.outside || r.share) console.log(JSON.stringify({ id, ...r }))
    console.log(JSON.stringify({ id, canvas: CANVAS, ...(SELF ? { self: true } : {}), ...(NORMALIZE ? { normalize: true } : {}), ...(FLUSH ? { flush: true } : {}), pages: rows.length, splitShows: rows.reduce((n, r) => n + r.splitShows, 0), outsidePages: rows.filter(r => r.outside).map(r => [r.p, r.outside]), differingPages: rows.filter(r => r.any).map(r => [r.p, r.any]), shareMax: Math.max(0, ...rows.map(r => r.share)), maxDelta: Math.max(0, ...rows.map(r => r.max)), pagesWithResidue: rows.filter(r => r.share > 0).length, ...(FIGURES_OFF ? { figuresOff: { pages: rows.filter(r => r.figOff).length, outsidePages: rows.filter(r => r.figOff?.outside).map(r => [r.p, r.figOff.outside]), inside: rows.reduce((n, r) => n + (r.figOff?.inside ?? 0), 0) } } : {}) }))
  }
} finally { await browser.close() }
