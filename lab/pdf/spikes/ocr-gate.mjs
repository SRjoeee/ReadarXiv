// lab/pdf/spikes/ocr-gate.mjs
// The bitmap figures' gate (docs/route/orphan-text.md stage 6, the content class `ocr`, PDF-READER §19.15): each paper's base page
// read by the bitmap figures' pass (pipeline/ocr-pass.mjs) with the extension's recogniser run here as the web's box runs it
// (core/ocr/recognise.ts on onnxruntime-web's WebAssembly build and @napi-rs/canvas, the package's three model files), its labels
// counted by what became of each image and each label, and every page holding a drawn one rendered by PDF.js in Node at SCALE, the
// labels' patches painted over the render as the reader paints them (every patch of the page before any text, in its ground's
// colour), and held to:
//   P   every patch inside an image the page paints (its unit square under its transform, within half a point): no patch outside
//       its image;
//   L   no two labels' lines (the boxes their translations are set in) overlap;
//   C   no patch covers ink of another colour than its label's: on the render, inside a patch, no more than CROWD of its pixels
//       off the colours between its ground's and its ink's (a marker, a plot's line of its own colour, a coloured word);
//   D   no stroke crosses a patch's edge: on the render, at every point along each patch's sides, the pixel a device pixel inside
//       and the one a device pixel outside are not both ink (off the ground's colour) — a glyph the patch cuts, its descender or
//       its ascender, would be left half drawn (double ink), and a line over the image the patch covers (the page's own ink, a
//       plot's line) would leave its ends either side;
//   A   every image and every label accounted for: the images painted are those read, from the cache, read before, and each one
//       not read with its why (small, big, error, timeout, budget); the labels the extension's merge made are the units drawn and
//       those left the original's with their why.
// Each is counted and its failures listed by paper, page and label; `--check` exits 1 on any. Reads the gate pack's fixtures
// (`--pack`, <dir>/<id>-zh/base.pdf) or bases given (`--bases`, <dir>/<id>/base.pdf), each a PDF of our final pass (or, for the
// pass alone, any PDF); `--cache=<dir>` keeps each image's reading by its key, so that a run again reads nothing; `--shots=<dir>`
// writes each checked page's render with its patches (PNG) for the eye; `--ort-node=<file>` runs the recogniser on the
// onnxruntime-node build the web's box runs (its dist/index.js, a package this repository does not hold: the two builds read the
// same text, DESIGN §15.4), one thread, in place of onnxruntime-web's WebAssembly. One JSON line a paper, counts only.
//   pnpm exec tsx lab/pdf/spikes/ocr-gate.mjs (--pack=<dir> | --bases=<dir>) [--cache=<dir>] [--shots=<dir>] [--ort-node=<file>] [--check] <id>…
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRecogniser } from '../../../src/core/ocr/recognise.ts'
import { liteWorkerSource, OCR_IMAGE_PIXELS } from '../../../src/pdf-reader/engine/layout/pdf-lite.mjs'
import { placeOf } from '../../../src/pdf-reader/engine/layer-proto/ocr-rows.mjs'
import { ocrPass, paintsOf } from '../../../src/pdf-reader/engine/pipeline/ocr-pass.mjs'

const argOf = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const PACK = argOf('pack'), BASES = argOf('bases'), CACHE = argOf('cache'), SHOTS = argOf('shots'), ORT_NODE = argOf('ort-node'), CHECK = process.argv.includes('--check')
const IDS = process.argv.slice(2).filter(a => !a.startsWith('--'))
if ((!PACK && !BASES) || !IDS.length) { console.error('usage: ocr-gate.mjs (--pack=<dir> | --bases=<dir>) [--cache=<dir>] [--shots=<dir>] [--check] <id>…'); process.exit(2) }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const require = createRequire(join(ROOT, 'package.json'))
const PDFJS = dirname(require.resolve('pdfjs-dist/package.json'))
const canvas = require('@napi-rs/canvas')
// (PDF.js's worker made lite in memory, as the box's: an image past OCR_PIXELS_MAX keeps its operator and gets no pixels)
globalThis.pdfjsWorker = await import(`data:text/javascript;base64,${Buffer.from(liteWorkerSource(readFileSync(join(PDFJS, 'legacy/build/pdf.worker.mjs'), 'utf8'))).toString('base64')}`)
const { getDocument, OPS } = await import(join(PDFJS, 'legacy/build/pdf.mjs'))
// (onnxruntime-web's Node build, the extension's own WebAssembly, its one .wasm read from the package; or the box's native build)
const ort = ORT_NODE ? await import(ORT_NODE).then(m => m.default ?? m) : await import('onnxruntime-web')
if (!ORT_NODE) ort.env.wasm.numThreads = 1
const SESSION = ORT_NODE ? { executionProviders: ['cpu'], intraOpNumThreads: 1, interOpNumThreads: 1 } : undefined
// (what the recogniser runs on, the cache key's: the runtime's and the canvas's versions, read from their packages)
const versionOf = name => JSON.parse(readFileSync(join(dirname(require.resolve(name)), name === 'onnxruntime-web' ? '..' : '.', 'package.json'), 'utf8')).version
const READER = ORT_NODE
  ? `onnxruntime-node@${JSON.parse(readFileSync(join(dirname(ORT_NODE), '..', 'package.json'), 'utf8')).version}+napi-canvas@${versionOf('@napi-rs/canvas')}`
  : `onnxruntime-web@${ort.env.versions?.web ?? versionOf('onnxruntime-web')}+napi-canvas@${versionOf('@napi-rs/canvas')}`
const OPTIONS = { cMapUrl: join(PDFJS, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(PDFJS, 'standard_fonts/'), verbosity: 0, useSystemFonts: false, isImageDecoderSupported: false }
const SCALE = 2, NEAR = 32, CROWD = 0.03, STEP = 0.5, CROSS_ALLOW = 2

let recogniser = null
const recognise = async pixels => {
  recogniser ??= createRecogniser({
    ort, session: SESSION, canvas: (w, h) => canvas.createCanvas(w, h), imageData: (d, w, h) => new canvas.ImageData(d, w, h),
    detection: readFileSync(join(ROOT, 'public/ocr/PP-OCRv6_tiny_det.onnx')), recognition: readFileSync(join(ROOT, 'public/ocr/PP-OCRv6_tiny_rec.onnx')), dictionary: readFileSync(join(ROOT, 'public/ocr/PP-OCRv6_tiny_dict.txt'), 'utf8'),
  })
  return (await recogniser).recognisePixels(pixels)
}
const cache = CACHE ? {
  get: async key => { const f = join(CACHE, `${key.replace(/[^0-9A-Za-z.]/g, '_')}.json`); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null },
  put: async (key, lines) => { mkdirSync(CACHE, { recursive: true }); writeFileSync(join(CACHE, `${key.replace(/[^0-9A-Za-z.]/g, '_')}.json`), JSON.stringify(lines)) },
} : null

/** whether a point stands in a convex quad, within `slack` */
function inQuad(q, [x, y], slack = 0) {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i], [bx, by] = q[(i + 1) % 4], l = Math.hypot(bx - ax, by - ay) || 1
    const c = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / l
    if (Math.abs(c) <= slack) continue
    if (sign && Math.sign(c) !== sign) return false
    sign = Math.sign(c)
  }
  return true
}
/** whether two convex quads overlap by more than `slack` (an axis separates them otherwise) */
function quadsMeet(a, b, slack = 0) {
  for (const q of [a, b]) for (let i = 0; i < 4; i++) {
    const p = q[i], r = q[(i + 1) % 4], l = Math.hypot(r[0] - p[0], r[1] - p[1]) || 1, ax = -(r[1] - p[1]) / l, ay = (r[0] - p[0]) / l
    const span = s => s.reduce(([lo, hi], c) => { const v = c[0] * ax + c[1] * ay; return [Math.min(lo, v), Math.max(hi, v)] }, [Infinity, -Infinity])
    const [a0, a1] = span(a), [b0, b1] = span(b)
    if (a1 <= b0 + slack || b1 <= a0 + slack) return false
  }
  return true
}
const rgb = v => [v >> 16, (v >> 8) & 255, v & 255]
const apart = (d, o, c) => Math.hypot(d[o] - c[0], d[o + 1] - c[1], d[o + 2] - c[2]) > NEAR
/** a pixel's distance to the colours between a ground and an ink, past NEAR */
function offSegment(d, o, a, b) {
  const dr = b[0] - a[0], dg = b[1] - a[1], db = b[2] - a[2], dd = dr * dr + dg * dg + db * db
  const k = dd === 0 ? 0 : Math.max(0, Math.min(1, ((d[o] - a[0]) * dr + (d[o + 1] - a[1]) * dg + (d[o + 2] - a[2]) * db) / dd))
  return Math.hypot(d[o] - a[0] - k * dr, d[o + 1] - a[1] - k * dg, d[o + 2] - a[2] - k * db) > NEAR
}

let failed = false
for (const id of IDS) {
  const base = PACK ? join(PACK, `${id}-zh`, 'base.pdf') : join(BASES, id, 'base.pdf')
  if (!existsSync(base)) { console.log(JSON.stringify({ id, missing: base })); failed = true; continue }
  const bytes = new Uint8Array(readFileSync(base))
  const task = getDocument({ ...OPTIONS, data: bytes.slice(), maxImageSize: OCR_IMAGE_PIXELS })
  const doc = await task.promise
  const t0 = performance.now(), c0 = process.cpuUsage()
  let out
  try { out = await ocrPass({ doc, OPS, paper: { id: id.replace(/v\d+$/, ''), version: Number(/v(\d+)$/.exec(id)?.[1] ?? 1) }, from: 1, recognise, reader: READER, cache }) } finally { await task.destroy() }
  const ms = Math.round(performance.now() - t0), cpu = process.cpuUsage(c0), s = out.stats
  const fails = { P: [], L: [], C: [], D: [], A: [] }
  // A: the images and the labels accounted for
  const im = s.images
  const outcomes = im.read + im.cached + im.again + im.small + im.big + im.error + im.timeout + im.budget
  if (outcomes !== im.painted) fails.A.push(`images: ${im.painted} painted, ${outcomes} accounted`)
  const left = Object.values(s.labels).reduce((a, b) => a + b, 0)
  if (s.units + left !== s.boxes) fails.A.push(`labels: ${s.boxes} made, ${s.units} drawn and ${left} left`)
  // the drawn labels by page, each its place
  const byPage = new Map()
  out.units.forEach((u, k) => { const o = placeOf(u[7]); if (o) (byPage.get(o.page) ?? byPage.set(o.page, []).get(o.page)).push({ k, text: u[5][0][1], ...o }) })
  const render = getDocument({ ...OPTIONS, data: bytes.slice() })
  const rdoc = await render.promise
  try {
    for (const [p, list] of [...byPage].sort((a, b) => a[0] - b[0])) {
      const page = await rdoc.getPage(p), vp = page.getViewport({ scale: SCALE })
      // P: each patch inside an image the page paints
      const { images } = paintsOf(await page.getOperatorList(), OPS)
      const squares = images.map(i => [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => [i.ctm[0] * x + i.ctm[2] * y + i.ctm[4], i.ctm[1] * x + i.ctm[3] * y + i.ctm[5]]))
      for (const u of list) for (const l of u.lines) if (!squares.some(q => l.patch.every(pt => inQuad(q, pt, 0.5)))) fails.P.push(`p${p} ${JSON.stringify(u.text)}`)
      // L: no two labels' lines overlap
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        if (list[i].lines.some(a => list[j].lines.some(b => quadsMeet(a.quad, b.quad, 0.25)))) fails.L.push(`p${p} ${JSON.stringify(list[i].text)} meets ${JSON.stringify(list[j].text)}`)
      }
      const { canvas: cv, context } = rdoc.canvasFactory.create(Math.ceil(vp.width), Math.ceil(vp.height))
      await page.render({ canvasContext: context, viewport: vp, canvas: cv }).promise
      const W = cv.width, H = cv.height
      const before = context.getImageData(0, 0, W, H).data
      const dev = ([x, y]) => vp.convertToViewportPoint(x, y)
      // the patches painted as the reader paints them
      for (const u of list) for (const l of u.lines) {
        context.beginPath()
        l.patch.map(dev).forEach(([x, y], i) => (i ? context.lineTo(x, y) : context.moveTo(x, y)))
        context.closePath()
        context.fillStyle = `#${u.bg.toString(16).padStart(6, '0')}`
        context.fill()
      }
      const at = (_d, x, y) => { const X = Math.floor(x), Y = Math.floor(y); return X >= 0 && Y >= 0 && X < W && Y < H ? 4 * (Y * W + X) : -1 }
      for (const u of list) {
        const ground = rgb(u.bg), ink = rgb(u.fg)
        let inside = 0, off = 0, crossings = 0
        for (const l of u.lines) {
          const q = l.patch.map(dev)
          // C: the patch's pixels off the colours between its ground's and its ink's, on the render before it is painted
          const xs = q.map(p => p[0]), ys = q.map(p => p[1])
          for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(H - 1, Math.ceil(Math.max(...ys))); y++) for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(W - 1, Math.ceil(Math.max(...xs))); x++) {
            if (!inQuad(q, [x + 0.5, y + 0.5])) continue
            inside++
            const o = 4 * (y * W + x)
            if (offSegment(before, o, ground, ink)) off++
          }
          // D: along each side, a device pixel in and out of it, both ink: a stroke the patch's edge crosses
          const cx = xs.reduce((a2, v) => a2 + v, 0) / 4, cy = ys.reduce((a2, v) => a2 + v, 0) / 4
          for (let i = 0; i < 4; i++) {
            const [ax, ay] = q[i], [bx, by] = q[(i + 1) % 4], len = Math.hypot(bx - ax, by - ay) || 1
            let nx = -(by - ay) / len, ny = (bx - ax) / len
            // (the side's normal outward: away from the patch's middle)
            if (nx * ((ax + bx) / 2 - cx) + ny * ((ay + by) / 2 - cy) < 0) { nx = -nx; ny = -ny }
            for (let t = STEP; t < len - STEP; t += STEP) {
              const px = ax + ((bx - ax) * t) / len, py = ay + ((by - ay) * t) / len
              const o1 = at(before, px - nx, py - ny), o2 = at(before, px + nx, py + ny)
              if (o1 < 0 || o2 < 0) continue
              // (outside it, a pixel another of the label's patches covers is no crossing: two lines' patches meet)
              if (u.lines.some(m => m !== l && inQuad(m.patch.map(dev), [px + nx, py + ny]))) continue
              if (apart(before, o1, ground) && apart(before, o2, ground)) crossings++
            }
          }
        }
        if (off > CROWD * inside) fails.C.push(`p${p} ${JSON.stringify(u.text)}: ${off} of ${inside} px off its colours`)
        if (crossings > CROSS_ALLOW * u.lines.length) fails.D.push(`p${p} ${JSON.stringify(u.text)}: ${crossings} crossings of its patch's edge`)
      }
      if (SHOTS) {
        mkdirSync(SHOTS, { recursive: true })
        writeFileSync(join(SHOTS, `${id}-p${p}.png`), cv.toBuffer('image/png'))
      }
      page.cleanup()
    }
  } finally { await render.destroy() }
  console.log(JSON.stringify({ id, reader: READER, ms, cpuMs: Math.round((cpu.user + cpu.system) / 1000), images: im, lines: s.lines, labels: s.boxes, drawn: s.units, kept: s.kept, left: s.labels, recogniseMs: Math.round(s.recogniseMs), sets: s.sets, steps: Object.fromEntries(Object.entries(s.ms).map(([k, v]) => [k, Math.round(v)])), pages: byPage.size, P: fails.P.length, L: fails.L.length, C: fails.C.length, D: fails.D.length, A: fails.A.length }))
  for (const [k, list] of Object.entries(fails)) for (const f of list.slice(0, 10)) console.log(`  ${k} ${f}`)
  if (CHECK && Object.values(fails).some(l => l.length)) failed = true
}
process.exit(failed ? 1 : 0)
