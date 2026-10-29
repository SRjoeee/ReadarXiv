// A bitmap figure as the recogniser reads it (PDF-READER §19.15): from the image's own object in the PDF, never from PDF.js's
// decoded pixels. Its key is its stream's bytes as they sit in the PDF with whatever else changes its pixels (ocrSourceKey):
// a paper's image read once is a lookup at every later prepare, with nothing decoded. Its pixels (readOcrPixels) are read at
// OCR_READ_PIXELS at most, area-averaged as they are decoded: a Flate stream inflated as a stream, a row at a time, so that
// the memory is that of the pixels read, whatever the image's own size; a JPEG decoded whole by PDF.js's own decoder (the
// host's JpegImage, pdfjs-dist's image_decoders), the largest the 183 surveyed papers hold 18.6 million pixels, up to
// OCR_JPEG_PIXELS. A window of an image (a line read again at full resolution) is read the same way, its other rows passed over.
//
// What it reads: the filters FlateDecode (PNG predictors, TIFF's for 8 bits) and DCTDecode, alone or Flate then DCT; the colour
// spaces DeviceGray, DeviceRGB, DeviceCMYK, CalGray, CalRGB, ICCBased (by its N: the profile is no input of a reading, the
// recogniser reads ink against ground), Indexed over any of those; 1, 2, 4, 8 and 16 bits; /Decode; an /SMask (composited
// over white, as the page's ground), a colour-key /Mask and an explicit one; an /ImageMask. The 3,552 images of the survey
// (2026-10-29) are all of these. Anything else is no source (`format`, counted), its figure the original's. Pure but for the
// host's decoder and WebCrypto's digest; an original module (no port statement), importing nothing.

/** the reading's version: what the pixels read are (the scaling, the colours, the masks), a part of the key */
export const OCR_READ_VERSION = '1'
/** the pixels an image is read at, at most: one larger is read scaled down to them, area-averaged (the detector works at 960
 *  pixels a side whatever it is given; the recogniser cuts each line from these, and a line read too small here is read again
 *  from the image's own pixels: ocr-pass.mjs OCR_LINE_MIN_PX) */
export const OCR_READ_PIXELS = 16_000_000
/** a JPEG's own pixels, at most: PDF.js's decoder holds some 6 bytes a pixel while it decodes (3 a component plane, 3 its RGB),
 *  so 40 million are some 240 MB at their peak, twice the largest of the survey; one past it is no source (`big`) */
export const OCR_JPEG_PIXELS = 40_000_000
/** an image's sides and the depth of its references at most (a source past them is no source) */
const SIDE_MAX = 1 << 16, DEPTH_MAX = 8

/** why an image is no source the reader reads: its encoding (`format`), its size (`big`) */
export class OcrSourceRefusal extends Error {
  constructor(why, detail) { super(detail); this.why = why }
}

/** a ref as PDF.js names it (`12R`, `12R3` for generation 3) → { n, g }, or null */
export function refOf(s) {
  const m = typeof s === 'string' ? /^(\d{1,10})R(\d{0,5})$/.exec(s) : null
  return m ? { n: Number(m[1]), g: m[2] ? Number(m[2]) : 0 } : null
}

/**
 * The image an object of the PDF is, as the reader reads it: { width, height, bpc, comps, color, decode, filters, parms, data,
 * smask, mask, maskKey, imageMask }, or an OcrSourceRefusal thrown. `objects` the PDF's objects (layout/xref.mjs openObjects:
 * `lookup` a ref's object, a stream's data its exact bytes), `PL` @cantoo/pdf-lib's exports, `ref` PDF.js's name of it.
 */
export function ocrSourceOf(objects, PL, ref) {
  const { PDFRef, PDFRawStream } = PL
  const r = refOf(ref)
  if (!r) throw new OcrSourceRefusal('format', `no object named by ${String(ref).slice(0, 20)}`)
  const s = objects.lookup(PDFRef.of(r.n, r.g))
  if (!(s instanceof PDFRawStream)) throw new OcrSourceRefusal('format', `object ${ref} is no stream`)
  return sourceOfStream(objects, PL, s, 0, false)
}

function sourceOfStream(objects, PL, s, depth, isMask) {
  const { PDFDict, PDFArray, PDFName, PDFNumber, PDFRef, PDFBool, PDFRawStream, PDFString, PDFHexString } = PL
  if (depth > DEPTH_MAX) throw new OcrSourceRefusal('format', 'masks nested too deep')
  const N = n => PDFName.of(n)
  const get = v => { for (let k = 0; v instanceof PDFRef && k < DEPTH_MAX; k++) v = objects.lookup(v); return v }
  const d = s.dict
  const num = (dict, k, dflt = null) => { const v = get(dict.get(N(k))); return v instanceof PDFNumber ? v.asNumber() : dflt }
  const name = v => (v instanceof PDFName ? v.decodeText() : null)
  const width = num(d, 'Width') ?? num(d, 'W'), height = num(d, 'Height') ?? num(d, 'H')
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > SIDE_MAX || height > SIDE_MAX) throw new OcrSourceRefusal('format', `an image of ${width} × ${height}`)
  const imageMask = isMask || get(d.get(N('ImageMask'))) instanceof PDFBool && get(d.get(N('ImageMask'))).asBoolean()
  // (its filters, each a name, and their parameters, one each or none)
  let filters = get(d.get(N('Filter'))) ?? get(d.get(N('F')))
  filters = filters instanceof PDFArray ? filters.asArray().map(x => name(get(x))) : filters ? [name(filters)] : []
  const short = { Fl: 'FlateDecode', DCT: 'DCTDecode' }
  filters = filters.map(f => short[f] ?? f)
  let parms = get(d.get(N('DecodeParms'))) ?? get(d.get(N('DP')))
  parms = parms instanceof PDFArray ? parms.asArray().map(get) : [parms]
  const parmsOf = i => { const p = parms[i]; return p instanceof PDFDict ? p : null }
  const ok = filters.length === 0 || (filters.length === 1 && (filters[0] === 'FlateDecode' || filters[0] === 'DCTDecode')) || (filters.length === 2 && filters[0] === 'FlateDecode' && filters[1] === 'DCTDecode')
  if (!ok) throw new OcrSourceRefusal('format', `filters ${filters.join('+') || 'none'}`)
  const flateAt = filters.indexOf('FlateDecode'), fp = flateAt >= 0 ? parmsOf(flateAt) : null
  const predictor = fp ? { pred: num(fp, 'Predictor', 1), colors: num(fp, 'Colors', 1), bpc: num(fp, 'BitsPerComponent', 8), columns: num(fp, 'Columns', 1) } : null
  if (predictor && !(predictor.pred === 1 || predictor.pred === 2 || (predictor.pred >= 10 && predictor.pred <= 15))) throw new OcrSourceRefusal('format', `a predictor ${predictor.pred}`)
  const dctAt = filters.indexOf('DCTDecode'), dp = dctAt >= 0 ? parmsOf(dctAt) : null
  const colorTransform = dp ? num(dp, 'ColorTransform', -1) : -1
  // (its colour: a kind, its components, and for Indexed its base, its highest index and its table)
  const color = imageMask ? { kind: 'gray', comps: 1 } : colorOf(get(d.get(N('ColorSpace')) ?? d.get(N('CS'))))
  function colorOf(cs, deep = 0) {
    cs = get(cs)
    if (deep > 2) throw new OcrSourceRefusal('format', 'a colour space nested too deep')
    const n = name(cs)
    if (n === 'DeviceGray' || n === 'G' || n === 'CalGray') return { kind: 'gray', comps: 1 }
    if (n === 'DeviceRGB' || n === 'RGB' || n === 'CalRGB') return { kind: 'rgb', comps: 3 }
    if (n === 'DeviceCMYK' || n === 'CMYK') return { kind: 'cmyk', comps: 4 }
    if (cs instanceof PDFArray) {
      const a = cs.asArray().map(get), head = name(a[0])
      if (head === 'CalGray') return { kind: 'gray', comps: 1 }
      if (head === 'CalRGB') return { kind: 'rgb', comps: 3 }
      if (head === 'ICCBased' && a[1] instanceof PDFRawStream) {
        const k = num(a[1].dict, 'N')
        if (k === 1) return { kind: 'gray', comps: 1 }
        if (k === 3) return { kind: 'rgb', comps: 3 }
        if (k === 4) return { kind: 'cmyk', comps: 4 }
        const alt = a[1].dict.get(N('Alternate'))
        if (alt) return colorOf(alt, deep + 1)
      }
      if ((head === 'Indexed' || head === 'I') && a.length === 4) {
        const base = colorOf(a[1], deep + 1), hival = a[2] instanceof PDFNumber ? a[2].asNumber() : -1
        if (base.kind === 'indexed' || !Number.isSafeInteger(hival) || hival < 0 || hival > 255) throw new OcrSourceRefusal('format', 'an Indexed colour space out of shape')
        const t = a[3]
        const table = t instanceof PDFString || t instanceof PDFHexString ? t.asBytes() : t instanceof PDFRawStream ? (t.dict.get(N('Filter')) ? null : t.contents) : null
        if (!table || table.length < (hival + 1) * base.comps) throw new OcrSourceRefusal('format', 'an Indexed table that cannot be read')
        return { kind: 'indexed', comps: 1, base, hival, table: table.subarray(0, (hival + 1) * base.comps) }
      }
    }
    throw new OcrSourceRefusal('format', `a colour space ${n ?? name(get(cs?.asArray?.()?.[0])) ?? 'unread'}`)
  }
  const bpc = imageMask ? 1 : filters.at(-1) === 'DCTDecode' ? 8 : num(d, 'BitsPerComponent') ?? num(d, 'BPC')
  if (![1, 2, 4, 8, 16].includes(bpc)) throw new OcrSourceRefusal('format', `${bpc} bits a component`)
  let decode = get(d.get(N('Decode'))) ?? get(d.get(N('D')))
  decode = decode instanceof PDFArray ? decode.asArray().map(x => { x = get(x); return x instanceof PDFNumber ? x.asNumber() : Number.NaN }) : null
  if (decode && (decode.length !== 2 * color.comps || decode.some(x => !Number.isFinite(x)))) decode = null
  if (decode && filters.at(-1) === 'DCTDecode' && !decode.every((x, i) => x === (i % 2 ? 1 : 0))) throw new OcrSourceRefusal('format', 'a JPEG with a /Decode')
  // (its masks: a soft mask, an explicit one, or a colour key, each read the same way)
  const smaskObj = get(d.get(N('SMask')))
  const smask = !isMask && smaskObj instanceof PDFRawStream ? sourceOfStream(objects, PL, smaskObj, depth + 1, false) : null
  if (smask && smask.color.kind !== 'gray') throw new OcrSourceRefusal('format', 'a soft mask of colour')
  const maskObj = isMask ? null : get(d.get(N('Mask')))
  const mask = maskObj instanceof PDFRawStream ? sourceOfStream(objects, PL, maskObj, depth + 1, true) : null
  const maskKey = maskObj instanceof PDFArray ? maskObj.asArray().map(x => { x = get(x); return x instanceof PDFNumber ? x.asNumber() : Number.NaN }) : null
  if (maskKey && (maskKey.length !== 2 * color.comps || maskKey.some(x => !Number.isFinite(x)))) throw new OcrSourceRefusal('format', 'a colour key out of shape')
  if (filters.at(-1) === 'DCTDecode' && width * height > OCR_JPEG_PIXELS) throw new OcrSourceRefusal('big', `a JPEG of ${width * height} pixels`)
  return { width, height, bpc, comps: color.comps, color, decode, imageMask, filters, predictor, colorTransform, data: s.contents, smask, mask, maskKey }
}

const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')
const sha256 = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes))
/** what of a source changes its pixels as the reader reads them, but its bytes: the reader's own (its version, its bound) and the
 *  dictionary's (as the source holds it) */
const shapeOf = src => ({ w: src.width, h: src.height, bpc: src.bpc, color: src.color.kind === 'indexed' ? { kind: 'indexed', base: src.color.base.kind, hival: src.color.hival, table: hex(src.color.table) } : src.color.kind, decode: src.decode, imageMask: src.imageMask, filters: src.filters, predictor: src.predictor, colorTransform: src.colorTransform, maskKey: src.maskKey })
/**
 * The name of a source's pixels in the reading's key (the engine's ocrKey `pixels`): `r<OCR_READ_VERSION>.<w>x<h>.<sha256>`,
 * the digest over the reader's bound, the source's shape and the digests of its bytes and of its masks' (each its own shape and
 * bytes): the image's pixels as this reader reads them are a function of these alone
 */
export async function ocrSourceKey(src) {
  const part = async s => (s ? { shape: shapeOf(s), data: await sha256(s.data), smask: await part(s.smask), mask: await part(s.mask) } : null)
  const all = { read: OCR_READ_VERSION, max: OCR_READ_PIXELS, ...(await part(src)) }
  return `r${OCR_READ_VERSION}.${src.width}x${src.height}.${await sha256(new TextEncoder().encode(JSON.stringify(all)))}`
}

/** the output a read of the whole image takes: its own size, or scaled down to OCR_READ_PIXELS (its aspect kept) */
export function readSizeOf(width, height, max = OCR_READ_PIXELS) {
  const s = Math.min(1, Math.sqrt(max / (width * height)))
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)), scale: s }
}

/** a stream's bytes inflated, a chunk at a time (a zlib stream, or a bare deflate one where it holds no zlib head); a stream
 *  that breaks ends where it broke, as PDF.js reads one */
async function* inflated(bytes) {
  const zlib = bytes.length >= 2 && (bytes[0] & 0x0f) === 8 && ((bytes[0] << 8) | bytes[1]) % 31 === 0
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(zlib ? 'deflate' : 'deflate-raw')).getReader()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return
      if (value?.length) yield value
    }
  } catch { /* (the rows decoded before the break stand; the rest are the ground's) */ } finally { reader.releaseLock?.() }
}

/** the source's samples, a row at a time (bytes, `rowBytes` each: `bpc` bits a component, `comps` components a pixel), its
 *  filters and predictor undone; a JPEG through `Jpeg` (PDF.js's JpegImage), 8-bit RGB or gray rows */
async function* rowsOf(src, Jpeg) {
  const { width, height } = src
  if (src.filters.at(-1) === 'DCTDecode') {
    let data = src.data
    if (src.filters[0] === 'FlateDecode') { const parts = []; let n = 0; for await (const c of inflated(data)) { parts.push(c); n += c.length } data = new Uint8Array(n); let at = 0; for (const c of parts) { data.set(c, at); at += c.length } }
    const j = new Jpeg({ colorTransform: src.colorTransform })
    j.parse(data)
    // (its rows gray where the JPEG is of one component, else RGB: the JPEG's own count, whatever the colour space names)
    const comps = j.numComponents === 1 ? 1 : 3
    const out = j.getData({ width, height, forceRGB: comps === 3, isSourcePDF: true })
    for (let y = 0; y < height; y++) yield out.subarray(y * width * comps, (y + 1) * width * comps)
    return
  }
  const rowBytes = Math.ceil((width * src.comps * src.bpc) / 8)
  const p = src.predictor ?? { pred: 1 }
  const png = p.pred >= 10, bpp = png ? Math.max(1, Math.ceil(((p.colors ?? src.comps) * (p.bpc ?? src.bpc)) / 8)) : 0
  const stride = png ? Math.ceil(((p.columns ?? width) * (p.colors ?? src.comps) * (p.bpc ?? src.bpc)) / 8) + 1 : rowBytes
  let prev = new Uint8Array(stride), cur = new Uint8Array(stride), fill = 0, y = 0
  const chunks = src.filters[0] === 'FlateDecode' ? inflated(src.data) : (async function* () { yield src.data })()
  for await (const chunk of chunks) {
    let at = 0
    while (at < chunk.length && y < height) {
      const n = Math.min(stride - fill, chunk.length - at)
      cur.set(chunk.subarray(at, at + n), fill)
      fill += n; at += n
      if (fill < stride) break
      let row
      if (png) {
        const t = cur[0], r = cur.subarray(1), up = prev.subarray(1)
        for (let i = 0; i < r.length; i++) {
          const a = i >= bpp ? r[i - bpp] : 0, b = up[i], c = i >= bpp ? up[i - bpp] : 0
          if (t === 1) r[i] = (r[i] + a) & 255
          else if (t === 2) r[i] = (r[i] + b) & 255
          else if (t === 3) r[i] = (r[i] + ((a + b) >> 1)) & 255
          else if (t === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); r[i] = (r[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255 }
        }
        row = r
      } else row = cur
      if (p.pred === 2 && src.bpc === 8) for (let i = src.comps; i < rowBytes; i++) row[i] = (row[i] + row[i - src.comps]) & 255
      yield row.subarray(0, rowBytes)
      y++
      ;[prev, cur] = [cur, prev]
      fill = 0
    }
    if (y >= height) break
  }
  // (a stream cut short: its missing rows none, read as the ground's, white)
  for (; y < height; y++) yield null
}

const clamp = x => (x <= 0 ? 0 : x >= 1 ? 255 : Math.round(x * 255))
/** component values in [0, 1] (`v`, from `at`) of colour `kind` into `out` at `o` as RGB, 0 to 255 (CMYK by its complement) */
function putRGB(kind, v, at, out, o) {
  if (kind === 'gray') { out[o] = out[o + 1] = out[o + 2] = clamp(v[at]) }
  else if (kind === 'rgb') { out[o] = clamp(v[at]); out[o + 1] = clamp(v[at + 1]); out[o + 2] = clamp(v[at + 2]) }
  else { const k = 1 - v[at + 3]; out[o] = clamp((1 - v[at]) * k); out[o + 1] = clamp((1 - v[at + 1]) * k); out[o + 2] = clamp((1 - v[at + 2]) * k) }
}
/** a row's pixels into `out` as RGB, 0 to 255 (each sample of `bpc` bits under the source's /Decode, an index of Indexed its
 *  table's colour, an image mask's painted samples black), and whether each pixel is masked out by the colour key (`keyed`) */
function pixelsOfRow(src, row, out, keyed) {
  const { width, comps, bpc, color, decode, maskKey, imageMask } = src
  const max = (1 << bpc) - 1, smax = bpc === 16 ? 65535 : max
  const sample = bpc === 8 ? i => row[i] : bpc === 16 ? i => (row[2 * i] << 8) | row[2 * i + 1] : i => (row[(i * bpc) >> 3] >> (8 - bpc - ((i * bpc) & 7))) & max
  const v = new Float64Array(4), base = color.kind === 'indexed' ? color.base : null, t = base ? color.table : null
  for (let x = 0; x < width; x++) {
    let key = !!maskKey
    for (let c = 0; c < comps; c++) {
      const s = sample(x * comps + c)
      if (key && (s < maskKey[2 * c] || s > maskKey[2 * c + 1])) key = false
      v[c] = decode ? decode[2 * c] + (s * (decode[2 * c + 1] - decode[2 * c])) / smax : base ? s : s / smax
    }
    if (keyed) keyed[x] = key ? 1 : 0
    if (imageMask) out[3 * x] = out[3 * x + 1] = out[3 * x + 2] = v[0] < 0.5 ? 0 : 255
    else if (base) {
      const i = Math.max(0, Math.min(color.hival, Math.round(v[0]))), bc = base.comps
      for (let c = 0; c < bc; c++) v[c] = t[bc * i + c] / 255
      putRGB(base.kind, v, 0, out, 3 * x)
    } else putRGB(color.kind, v, 0, out, 3 * x)
  }
}

/**
 * A source's pixels in `views` (each { x0, y0, x1, y1 }: a window of the image in its own pixels, and { width, height }: the
 * pixels it is read into, area-averaged; the whole image by readSizeOf, a line's window at its own pixels), read in one pass of
 * its stream: [{ data (RGBA, opaque: a soft mask composited over white, a masked pixel white), width, height }]. `Jpeg` PDF.js's
 * JpegImage, for a DCT stream.
 */
export async function readOcrPixels(src, views, { Jpeg }) {
  const outs = views.map(v => ({ ...v, sums: new Float64Array(v.width * 4), row: -1, data: new Uint8ClampedArray(v.width * v.height * 4).fill(255), xs: Int32Array.from({ length: Math.max(0, v.x1 - v.x0) }, (_, i) => Math.min(v.width - 1, Math.floor((i * v.width) / (v.x1 - v.x0)))) }))
  const flush = o => {
    if (o.row < 0) return
    const base = o.row * o.width * 4
    for (let x = 0; x < o.width; x++) {
      const n = o.sums[4 * x + 3]
      if (n) for (let c = 0; c < 3; c++) o.data[base + 4 * x + c] = o.sums[4 * x + c] / n
    }
    o.sums.fill(0)
  }
  const rgb = new Uint8Array(src.width * 3), keyed = src.maskKey ? new Uint8Array(src.width) : null
  const dct = src.filters.at(-1) === 'DCTDecode'
  let y = 0
  for await (const row of rowsOf(src, Jpeg)) {
    const want = outs.filter(o => y >= o.y0 && y < o.y1)
    if (want.length) {
      if (row === null) { rgb.fill(255); keyed?.fill(0) }
      else if (dct) { if (row.length === src.width) for (let x = 0; x < src.width; x++) rgb[3 * x] = rgb[3 * x + 1] = rgb[3 * x + 2] = row[x]; else rgb.set(row) }
      else pixelsOfRow(src, row, rgb, keyed)
      for (const o of want) {
        const oy = Math.min(o.height - 1, Math.floor(((y - o.y0) * o.height) / (o.y1 - o.y0)))
        if (oy !== o.row) { flush(o); o.row = oy }
        for (let x = o.x0; x < o.x1; x++) {
          const ox = o.xs[x - o.x0], k = 4 * ox
          if (keyed?.[x]) { o.sums[k] += 255; o.sums[k + 1] += 255; o.sums[k + 2] += 255 } else { o.sums[k] += rgb[3 * x]; o.sums[k + 1] += rgb[3 * x + 1]; o.sums[k + 2] += rgb[3 * x + 2] }
          o.sums[k + 3]++
        }
      }
    }
    y++
    if (!outs.some(o => y < o.y1)) break
  }
  for (const o of outs) flush(o)
  // (the masks: each read into the same windows, scaled to its own size, and the pixels it masks out made the ground's, white)
  for (const [m, soft] of [[src.smask, true], [src.mask, false]]) {
    if (!m) continue
    const sx = m.width / src.width, sy = m.height / src.height
    const lo = (a, s0, n) => Math.min(n - 1, Math.floor(a * s0)), hi = (a, b, s0, n) => Math.min(n, Math.max(lo(a, s0, n) + 1, Math.ceil(b * s0)))
    const mv = views.map(v => ({ x0: lo(v.x0, sx, m.width), y0: lo(v.y0, sy, m.height), x1: hi(v.x0, v.x1, sx, m.width), y1: hi(v.y0, v.y1, sy, m.height), width: v.width, height: v.height }))
    const got = await readOcrPixels({ ...m, smask: null, mask: null }, mv, { Jpeg })
    outs.forEach((o, i) => {
      const a = got[i].data
      for (let p = 0; p < o.width * o.height; p++) {
        // (a soft mask's gray is its alpha; an explicit mask's sample 1, white once read, masks the pixel out)
        const alpha = soft ? a[4 * p] / 255 : 1 - a[4 * p] / 255
        for (let c = 0; c < 3; c++) o.data[4 * p + c] = 255 - alpha * (255 - o.data[4 * p + c])
      }
    })
  }
  return outs.map(o => ({ data: o.data, width: o.width, height: o.height }))
}
