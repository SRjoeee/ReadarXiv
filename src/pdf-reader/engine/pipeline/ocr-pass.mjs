// The bitmap figures' pass (docs/route/orphan-text.md stage 6, PDF-READER §19.15): once a paper's layer is told whole — its head
// and every part, so that the first page waits for none of it — the host reads every image our compile placed on our base page,
// has the extension's recogniser read it (DESIGN §15.3: the same model files and the same code, src/core/ocr, which the host
// starts and hands in), and gets the labels layout/bitmap-text.mjs finds in it, each an ink unit of kind `inkocr` that carries
// its place, written as one more units chunk after the head's (ids from the head's last on). The host announces that chunk; the
// translation takes its units as any unit's; a reader opens the layer again with it, and draws each label under the toggle
// `figures`.
//
// A figure's text the pass cannot read stays the original's, never the paper's failure: an image under the pages' bounds or past
// OCR_PIXELS_MAX (`small`, `big`), one the recogniser refuses or does not answer in its host's time (`error`, `timeout`), one past
// the paper's budget (`budget`); a cache that cannot be read or written is no cache. Every reason is counted in the pass's
// `stats`, which the host records.
//
// What it reads of a page: PDF.js's operator list (each image's paint operator under the transform and the clip in force: the
// unit square of the image under it; the paths drawn after it, which a patch must not cover, flattened as figure-text's are: a
// curve as eight chords) and its text content (each item's box: the page's own text over an image is no image's), and each image's
// pixels as PDF.js decodes them (the document opened with `maxImageSize: OCR_IMAGE_PIXELS`, layout/pdf-lite.mjs: an image past the
// cap keeps its operator and gets no pixels). An image is read once a paper, however often it is painted (its digest), and once a
// version of the recogniser across papers where the host gives a cache: its key the recogniser's version and the digest of its
// pixels (OCR_VERSION, core/ocr/version.ts), its value the recogniser's lines (src/shared/ocr.ts OcrLine), which hold no paper's
// place.
//
// An original module (no port statement).
import { OCR_VERSION } from '../../../core/ocr/version.ts'
import { labelsOf, OCR_UNITS_DOC, OCR_UNITS_IMAGE } from '../layout/bitmap-text.mjs'
import { BundleRefusal } from '../layer-proto/bundle.mjs'
import { writeUnitChunks } from '../layer-proto/format.mjs'
import { ocrPlace } from '../layer-proto/ocr-rows.mjs'
import { ocrBundleUnit, UNIT_FLAG_BITS } from '../layer-proto/units.mjs'
import { isName, proseOf } from '../translate/mt.mjs'

/** the recogniser's time a paper may take, ms (its host's clock): past it the paper's other images stay the original's
 *  (`budget`). The owner's bound on the box's hold (2026-10-25): a paper's tail of figures is never unbounded */
export const OCR_BUDGET_MS = 60_000
/** an image painted smaller than this on a side, PDF units, is no figure (a logo, a bullet, an icon: view/figures.mjs's) */
export const OCR_MIN_SIDE = 30
/** …and one of fewer pixels than this on a side holds no line the recogniser reads */
export const OCR_MIN_PX = 32
/** the path segments a page may hold over its images at most; past them its images' labels are all `covered` */
export const OCR_SEGS_PAGE = 250_000
/** the images a paper's pass takes at most (past the size floors: each decoded, its digest made, looked up or read): past them
 *  the pass reads no more pages, and the image it meets is `many`. Above every paper of the 183 surveyed (2026-10-29: at most 120,
 *  p99 119, median 1), so that it bounds a PDF of thousands of tiles and no paper's figures */
export const OCR_IMAGES_MAX = 200
/** a reading's lines at most, as a cache gives it back (a reading of more is no reading: the recogniser's own are far fewer) */
export const OCR_LINES_MAX = 2000
/** why an image is not read */
export const OCR_IMAGE_WHYS = Object.freeze(['small', 'big', 'error', 'timeout', 'budget', 'many'])
/** the cache key of an image's reading: the recogniser's version, the host's reader (its runtime and its canvas, whose
 *  resampling the reading turns on: the same figure read in Chromium and in Node agreed on 431 of 484 lines, DESIGN §15.4, so
 *  that a canvas upgraded re-keys the cache rather than mixing two readings in it) and its pixels' name (digestOf) */
export const ocrKey = (pixels, reader) => `${OCR_VERSION}|${reader}|${pixels}`
/** a host's reader as the cache key names it: 1 to 64 characters of letters, digits and `.+-_@/` */
const READER = /^[0-9A-Za-z.+\-_@/]{1,64}$/
const unit = v => typeof v === 'number' && Number.isFinite(v)
/**
 * A cache's answer as a reading, or null where it is none (the recogniser's lines, core/ocr/recognise.ts: each its text, its
 * confidence, its quad in the image's fraction, and a turned line's angle, length and thickness): a cache is the host's store,
 * read back across prepares, and an entry out of shape is a miss, read again, never lines the labels are made of
 */
export function ocrLinesOf(v) {
  if (!Array.isArray(v) || v.length > OCR_LINES_MAX) return null
  for (const l of v) {
    if (!l || typeof l !== 'object' || typeof l.text !== 'string' || !l.text || l.text.length > 1000 || !unit(l.conf)) return null
    if (!Array.isArray(l.quad) || l.quad.length !== 4 || !l.quad.every(c => Array.isArray(c) && c.length === 2 && unit(c[0]) && unit(c[1]))) return null
    if (['angle', 'len', 'thick'].some(k => l[k] !== undefined && !unit(l[k]))) return null
  }
  return v
}

const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
const boxOfPoints = ps => [Math.min(...ps.map(p => p[0])), Math.min(...ps.map(p => p[1])), Math.max(...ps.map(p => p[0])), Math.max(...ps.map(p => p[1]))]
const meets = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]

/**
 * A page's images and the paths drawn after them, from its operator list ({ fnArray, argsArray }) and PDF.js's operator codes:
 * `images` each { k (its operator's index), id (its object), w, h, ctm, clips (convex quads in PDF units, every one of which a
 * patch must stand in; 'complex' where the clip in force is no such quad) }; `paths` each { k, segs: [[x0, y0, x1, y1, half
 * width]], fill (a fill's closed edges, for a patch inside one), box }, PDF units
 */
export function paintsOf({ fnArray, argsArray }, OPS) {
  const images = [], paths = []
  let ctm = [1, 0, 0, 1, 0, 0], clips = [], complex = false, lw = 1, pending = false
  const stack = []
  const push = () => stack.push({ ctm, clips, complex, lw })
  const pop = () => { const s = stack.pop(); if (s) ({ ctm, clips, complex, lw } = s) }
  const PAINT = new Set([OPS.stroke, OPS.closeStroke, OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke])
  const STROKES = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke])
  const FILLS = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke])
  const quadOfBox = (m, x0, y0, x1, y1) => [apply(m, x0, y0), apply(m, x1, y0), apply(m, x1, y1), apply(m, x0, y1)]
  for (let k = 0; k < fnArray.length; k++) {
    const fn = fnArray[k], a = argsArray[k]
    if (fn === OPS.save) push()
    else if (fn === OPS.restore) pop()
    else if (fn === OPS.transform) ctm = mul(ctm, a)
    else if (fn === OPS.setLineWidth) lw = a[0]
    else if (fn === OPS.setGState) { for (const [key, v] of a?.[0] ?? []) if (key === 'LW' && Number.isFinite(v)) lw = v }
    else if (fn === OPS.paintFormXObjectBegin) {
      push()
      // (a form's box clips what it shows: pdfTeX trims an included image so, its box the part shown; a transparency group's box is
      // given to the group PDF.js begins just before it)
      const [matrix, own] = a
      const bbox = own ?? (fnArray[k - 1] === OPS.beginGroup ? argsArray[k - 1]?.[0]?.bbox : null)
      if (matrix) ctm = mul(ctm, matrix)
      if (bbox) clips = [...clips, quadOfBox(ctm, bbox[0], bbox[1], bbox[2], bbox[3])]
    } else if (fn === OPS.paintFormXObjectEnd) pop()
    else if (fn === OPS.clip || fn === OPS.eoClip) pending = true
    else if (fn === OPS.constructPath) {
      const [op, wrapped] = a
      const data = wrapped?.[0] ?? wrapped
      const pieces = segmentsOf(data, ctm)
      if (pending) {
        // (a clip by a rectangle, under any transform, is a convex quad: TikZ's and pdfTeX's clips are; any other is `complex`)
        const rect = rectOf(data)
        if (rect) clips = [...clips, quadOfBox(ctm, ...rect)]
        else complex = true
        pending = false
      }
      if (PAINT.has(op) && pieces.length) {
        const scale = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]))
        const hw = STROKES.has(op) ? Math.max(lw * scale, 0.1) / 2 : 0
        const segs = pieces.map(([x0, y0, x1, y1]) => [x0, y0, x1, y1, hw])
        // (the extrema by a loop: a dense path's segments, a hundred thousand and more, are no arguments' list)
        const box = [Infinity, Infinity, -Infinity, -Infinity]
        for (const g of segs) { box[0] = Math.min(box[0], g[0], g[2]); box[1] = Math.min(box[1], g[1], g[3]); box[2] = Math.max(box[2], g[0], g[2]); box[3] = Math.max(box[3], g[1], g[3]) }
        box[0] -= hw; box[1] -= hw; box[2] += hw; box[3] += hw
        paths.push({ k, segs, fill: FILLS.has(op), box })
      }
    } else if (fn === OPS.paintImageXObject) images.push({ k, id: a[0], w: a[1], h: a[2], ctm, clips: complex ? 'complex' : clips })
    else if (fn === OPS.paintImageXObjectRepeat) {
      // ([id, scaleX, scaleY, positions]: one image at positions with one scale, PDF.js's optimiser's)
      const at = a[3] ?? []
      for (let i = 0; i + 1 < at.length; i += 2) images.push({ k, id: a[0], w: null, h: null, ctm: mul(ctm, [a[1], 0, 0, a[2], at[i], at[i + 1]]), clips: complex ? 'complex' : clips })
    }
  }
  return { images, paths }
}

/** a path's data (PDF.js 6's: an operation's code, then its coordinates) as segments under `m`, PDF units: a curve as eight chords */
function segmentsOf(data, m) {
  const out = []
  if (!data || typeof data.length !== 'number') return out
  let x = 0, y = 0, sx = 0, sy = 0
  const line = (x1, y1) => { const [a, b] = apply(m, x, y), [c, d] = apply(m, x1, y1); out.push([a, b, c, d]); x = x1; y = y1 }
  for (let i = 0; i < data.length;) {
    const op = data[i++]
    if (op === 0) { x = sx = data[i++]; y = sy = data[i++] }
    else if (op === 1) line(data[i++], data[i++])
    else if (op === 2 || op === 3) {
      const n = op === 2 ? 3 : 2, ps = []
      for (let j = 0; j < n; j++) ps.push([data[i++], data[i++]])
      const [p0, c1, c2, p3] = op === 2 ? [[x, y], ...ps] : [[x, y], ps[0], ps[0], ps[1]]
      for (let t = 1; t <= 8; t++) {
        const u = t / 8, v = 1 - u
        line(v * v * v * p0[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * p3[0], v * v * v * p0[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * p3[1])
      }
    } else if (op === 4) { if (x !== sx || y !== sy) line(sx, sy) }
    else break
  }
  return out
}
/** a path that is one rectangle (a move, three lines, a close; or a fourth line back): its [x0, y0, x1, y1] in its own space */
function rectOf(data) {
  if (!data) return null
  const d = Array.from(data)
  const shape = d.length === 12 && d[0] === 0 && d[3] === 1 && d[6] === 1 && d[9] === 1 ? d : d.length === 13 && d[0] === 0 && d[3] === 1 && d[6] === 1 && d[9] === 1 && d[12] === 4 ? d : null
  if (!shape) return null
  const xs = [d[1], d[4], d[7], d[10]], ys = [d[2], d[5], d[8], d[11]]
  const axis = (i, j) => xs[i] === xs[j] || ys[i] === ys[j]
  if (!(axis(0, 1) && axis(1, 2) && axis(2, 3) && axis(3, 0))) return null
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/** a text item's box in PDF units (view/figures.mjs's reading: its run from its origin along its direction, up by its size) */
function itemBox(it) {
  const [a, b, , , x, y] = it.transform
  const size = Math.hypot(a, b) || it.height, angle = Math.atan2(b, a), w = it.width, cos = Math.cos(angle), sin = Math.sin(angle)
  const xs = [x, x + w * cos, x - size * sin, x + w * cos - size * sin], ys = [y, y + w * sin, y + size * cos, y + w * sin + size * cos]
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/** an image's pixels as RGBA, as the recogniser takes them (PDF.js's kinds: 1 a bit a pixel, 1 white; 2 RGB; 3 RGBA) */
export function rgbaOf({ data, width, height, kind }) {
  if (kind === 3) return data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength)
  const out = new Uint8ClampedArray(width * height * 4)
  if (kind === 2) for (let i = 0, j = 0; i < width * height; i++, j += 3) { out[4 * i] = data[j]; out[4 * i + 1] = data[j + 1]; out[4 * i + 2] = data[j + 2]; out[4 * i + 3] = 255 }
  else {
    const row = (width + 7) >> 3
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const v = (data[y * row + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0, i = 4 * (y * width + x)
      out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255
    }
  }
  return out
}

/** an image's pixels as PDF.js decodes them, named: their size and kind, then the SHA-256 of the pixels as they are (no copy of
 *  them made here: an image is held at its whole size several times over between its decoding and its reading) */
async function digestOf({ data, width, height, kind }) {
  const d = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(data.buffer, data.byteOffset, data.byteLength)))
  return `${width}x${height}k${kind}.${Array.from(d, b => b.toString(16).padStart(2, '0')).join('')}`
}

/** an image object of a page's, as PDF.js resolves it once decoded (null where it was not: past the cap, or failed) */
const imageOf = (page, id) => new Promise(resolve => {
  try { (String(id).startsWith('g_') ? page.commonObjs : page.objs).get(id, v => resolve(v ?? null)) } catch { resolve(null) }
})
/** whether the recogniser's refusal is its host's time running out */
const isTimeout = e => e?.name === 'TimeoutError' || e?.code === 'timeout' || e?.kind === 'timeout'

/**
 * The paper's bitmap figures' labels. `doc` a PDF.js document of our base page (opened with `maxImageSize: OCR_IMAGE_PIXELS`), `OPS`
 * PDF.js's operator codes; `paper` { id, version }, `source` openPaper's paper (its running text tells a label of names, kept as a
 * table's cell of names is: mt.mjs isName); `from` the first id after the head's units, `before` the head's chunks' totals
 * (format.mjs chunkTotals), so that the chunk keeps every chunk of the paper within the bounds a head's are read by;
 * `recognise(pixels)` the host's recogniser ({ data RGBA, width, height } → src/shared/ocr.ts OcrLine[]; a TimeoutError where its
 * host gave up on it), `reader` what it runs on (its runtime's and its canvas's packages and versions: the cache key's); `cache` { get(key) → lines | null, put(key, lines) } or null (either may reject: no cache then);
 * `budgetMs` the recogniser's time the paper may take, by `now`; `until` the time by `now` past which no page is read and no image
 * decoded or read (`budget`: the host's clock on the whole pass, whose decoding and reading of a page's images the recogniser's
 * budget does not count — 2610.16663v1's 29 images of 16 to 30 million pixels, decoded under emulation, passed a box's clock);
 * `collect` the host's collection, called after each image is read
 * and let go (the box's maker child has one: an image's canvases are a server's native memory, which its heap does not count).
 * Returns { units (the bundle's tuples), chunks (written, ids from
 * `from`; none where there is no label, or where the chunk would pass a bound: `stats.refused`), stats }
 */
export async function ocrPass({ doc, OPS, paper, source = null, from, before = null, recognise, reader, cache = null, budgetMs = OCR_BUDGET_MS, until = Infinity, now = () => performance.now(), unitsDoc = OCR_UNITS_DOC, collect = null }) {
  if (typeof reader !== 'string' || !READER.test(reader)) throw new TypeError('reader: the host\'s recogniser, its runtime and canvas (onnxruntime-node@1.30.0+napi-canvas@1.0.10)')
  const prose = source?.units ? proseOf(source.units) : ''
  // (images: those painted, read by the recogniser, from the cache, the same as one read before, and each why one is not read)
  // (the labels the extension's merge made of the lines, `boxes`: each a unit drawn or left with its why, `labels`; and the time
  // each step took, ms by `now`: the pages' reading, the images' decoding, their digests, the recogniser, the labels)
  const stats = { pages: 0, pagesLeft: 0, pagesFailed: 0, images: { painted: 0, read: 0, cached: 0, again: 0, ...Object.fromEntries(OCR_IMAGE_WHYS.map(w => [w, 0])) }, lines: 0, boxes: 0, units: 0, kept: 0, labels: {}, recogniseMs: 0, cacheFailed: 0, refused: null, sets: { sets: 0, grouped: 0, aligned: 0, sized: 0 }, ms: { pages: 0, decode: 0, digest: 0, labels: 0 } }
  const lap = (k, t0) => { stats.ms[k] += now() - t0 }
  const units = []
  const seen = new Map()
  let spent = 0, took = 0
  for (let p = 1; p <= doc.numPages; p++) {
    // (past the host's clock, or the images a paper takes, no page is read: its images, each counted once its operators are
    // known, are not)
    if (now() >= until || took >= OCR_IMAGES_MAX) { stats.pagesLeft++; continue }
    let t = now()
    let page
    try { page = await doc.getPage(p) } catch { stats.pagesFailed++; continue }
    try {
      const { images, paths } = paintsOf(await page.getOperatorList(), OPS)
      lap('pages', t)
      stats.pages++
      if (!images.length) continue
      const view = page.view
      let boxes = null
      const taken = []
      /** one painted image read: its pixels, its reading, its labels */
      const readImage = async im => {
        stats.images.painted++
        const corners = [apply(im.ctm, 0, 0), apply(im.ctm, 1, 0), apply(im.ctm, 1, 1), apply(im.ctm, 0, 1)]
        const box = boxOfPoints(corners)
        if (Math.min(Math.hypot(corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]), Math.hypot(corners[3][0] - corners[0][0], corners[3][1] - corners[0][1])) < OCR_MIN_SIDE) { stats.images.small++; return }
        if (now() >= until) { stats.images.budget++; return }
        t = now()
        const image = await imageOf(page, im.id)
        lap('decode', t)
        if (!image?.data || !(image.width > 0) || !(image.height > 0)) { stats.images.big++; return }
        if (image.width < OCR_MIN_PX || image.height < OCR_MIN_PX) { stats.images.small++; return }
        if (took >= OCR_IMAGES_MAX) { stats.images.many++; return }
        took++
        t = now()
        const sha = await digestOf(image)
        lap('digest', t)
        let lines = seen.get(sha)
        if (lines) stats.images.again++
        else {
          const key = ocrKey(sha, reader)
          try { lines = cache ? await cache.get(key) : null } catch { stats.cacheFailed++; lines = null }
          if (lines !== null && lines !== undefined && !ocrLinesOf(lines)) { stats.cacheFailed++; lines = null }
          if (Array.isArray(lines)) stats.images.cached++
          else {
            if (spent >= budgetMs || now() >= until) { stats.images.budget++; return }
            const t0 = now()
            try { lines = await recognise({ data: rgbaOf(image), width: image.width, height: image.height }) } catch (e) {
              stats.images[isTimeout(e) ? 'timeout' : 'error']++
              return
            } finally { const dt = now() - t0; spent += dt; stats.recogniseMs += dt }
            stats.images.read++
            if (cache) { try { await cache.put(key, lines) } catch { stats.cacheFailed++ } }
          }
          seen.set(sha, lines)
        }
        stats.lines += lines.length
        if (!lines.length) return
        // (the page's own ink over the image: its text's boxes, read once a page, and the paths drawn after it that meet its box)
        boxes ??= (await page.getTextContent()).items.filter(it => it.str?.trim() && Array.isArray(it.transform)).map(itemBox)
        const near = paths.filter(q => q.k > im.k && meets(q.box, box))
        let n = 0
        for (const q of near) n += q.segs.length
        // (and the images painted after it over its box: a patch over one would draw a label of what it hides)
        const over = images.filter(j => j.k > im.k).map(j => [apply(j.ctm, 0, 0), apply(j.ctm, 1, 0), apply(j.ctm, 1, 1), apply(j.ctm, 0, 1)]).filter(q => meets(boxOfPoints(q), box))
        const others = n > OCR_SEGS_PAGE ? null : { boxes: boxes.filter(b => meets(b, box)), segs: near.flatMap(q => q.segs), fills: near.filter(q => q.fill).map(q => q.segs), images: over }
        const limit = Math.min(OCR_UNITS_IMAGE, unitsDoc - units.length)
        t = now()
        const got = labelsOf({ image, lines, place: { page: p, ctm: im.ctm, clip: im.clips, view }, others, taken, limit })
        lap('labels', t)
        stats.boxes += got.units.length + got.left.length
        for (const l of got.left) stats.labels[l.why] = (stats.labels[l.why] ?? 0) + 1
        // (each label's set the id of its set's first: its image's labels are written in order, from `from` on)
        const at = from + units.length
        for (const k of ['sets', 'grouped', 'aligned', 'sized']) stats.sets[k] += got.sets[k]
        for (const u of got.units) {
          const kept = isName(u.text, prose)
          if (kept) stats.kept++
          units.push(ocrBundleUnit(u.text, kept ? UNIT_FLAG_BITS.KEPT : 0, ocrPlace(p, u, at + u.set)))
          stats.units++
        }
      }
      // (each image's last paint on the page, after which its pixels are let go: PDF.js decodes a page's images together, and holds
      // them until the page is cleaned up. An image of the document's, `g_`, which PDF.js keeps once for the pages that paint it,
      // is the document's to let go)
      const last = new Map(images.map((im, k) => [im.id, k]))
      for (let k = 0; k < images.length; k++) {
        const im = images[k]
        try { await readImage(im) } finally {
          if (last.get(im.id) === k && !String(im.id).startsWith('g_')) { try { page.objs.delete?.(im.id) } catch { /* (a page's objects are PDF.js's to keep) */ } }
          if (collect) { try { collect() } catch { /* (a collection is the host's, never the pass's) */ } }
        }
      }
    } catch {
      // (a page whose operators, text or images cannot be read is skipped, its images the original's: never the pass's end)
      stats.pagesFailed++
    } finally {
      page.cleanup()
    }
  }
  let chunks = []
  if (units.length) {
    try { chunks = await writeUnitChunks({ paper, units, start: from, before, ink: true }) } catch (e) {
      if (!(e instanceof BundleRefusal)) throw e
      stats.refused = String(e.message).slice(0, 200)
      chunks = []
    }
  }
  return { units: chunks.length ? units : [], chunks, stats }
}
