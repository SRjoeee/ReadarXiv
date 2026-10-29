// @vitest-environment node
// The bitmap figures' pass (pipeline/ocr-pass.mjs, PDF-READER §19.15): every image our base page paints read from its own object by
// the recogniser the host gives (once a paper, its reading cached by its object's bytes, the reader's version and the recogniser's),
// its labels the units of one more chunk after the head's; a figure the pass cannot read stays the original's with its reason,
// never the paper's failure. A fake document: its pages' operator lists as PDF.js gives them under the OCR opt-in (each paint
// naming its object), its images real image objects (uncompressed RGB streams, @cantoo/pdf-lib's), the recogniser's answers the
// test's
import * as PL from '@cantoo/pdf-lib'
import { JpegImage } from 'pdfjs-dist/legacy/image_decoders/pdf.image_decoders.mjs'
import { describe, expect, it } from 'vitest'
import { OCR_VERSION } from '@/core/ocr/version'
import type { OcrLine } from '@/shared/ocr'
import { readUnitsChunk } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { OCR_IMAGES_MAX, OCR_LINES_MAX, ocrKey, ocrLinesOf, ocrPass, ocrReadingOf, paintsOf } from '@/pdf-reader/engine/pipeline/ocr-pass.mjs'

const OPS = { save: 10, restore: 11, transform: 12, setLineWidth: 2, setGState: 9, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75, beginGroup: 76, clip: 29, eoClip: 30, constructPath: 91, stroke: 20, closeStroke: 21, fill: 22, eoFill: 23, fillStroke: 24, eoFillStroke: 25, closeFillStroke: 26, closeEOFillStroke: 27, endPath: 28, paintImageXObject: 85, paintImageXObjectRepeat: 88 }
const W = 400, H = 200
type Picture = { data: Uint8ClampedArray; width: number; height: number }
/** an image of a white ground and one dark bar where the recogniser reads its line */
function picture(seed = 0, w = W, h = H): Picture {
  const data = new Uint8ClampedArray(w * h * 4).fill(255)
  for (let y = 85; y < Math.min(h, 99); y++) for (let x = 105; x < Math.min(w, 195); x++) { const i = 4 * (y * w + x); data[i] = data[i + 1] = data[i + 2] = 32 + seed }
  return { data, width: w, height: h }
}
const LINE: OcrLine = { text: 'Validation loss', conf: 0.95, quad: [[100 / W, 80 / H], [200 / W, 80 / H], [200 / W, 104 / H], [100 / W, 104 / H]] }
/** the document's image objects: each picture an RGB stream of its own number */
const ctx = PL.PDFContext.create()
const numbers = new WeakMap<Picture, number>(), streams = new Map<number, unknown>()
let next = 10
function objectOf(pic: Picture): number {
  const had = numbers.get(pic)
  if (had) return had
  const n = next++, rgb = new Uint8Array(pic.width * pic.height * 3)
  for (let i = 0; i < pic.width * pic.height; i++) { rgb[3 * i] = pic.data[4 * i]!; rgb[3 * i + 1] = pic.data[4 * i + 1]!; rgb[3 * i + 2] = pic.data[4 * i + 2]! }
  streams.set(n, PL.PDFRawStream.of(ctx.obj({ Type: 'XObject', Subtype: 'Image', Width: pic.width, Height: pic.height, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 }), rgb))
  numbers.set(pic, n)
  return n
}
const objects = { lookup: (ref: unknown) => streams.get((ref as PL.PDFRef).objectNumber) }
/** a page painting images (id → its picture, none where the document holds no object for it), each [id, ctm]: its paint naming
 *  its object as the OCR opt-in does (`<id>~<n>R`) */
function pageOf(paints: [string, number[]][], objs: Record<string, Picture | undefined>) {
  const fnArray: number[] = [], argsArray: unknown[] = []
  for (const [id, ctm] of paints) {
    const pic = objs[id]
    fnArray.push(OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore)
    argsArray.push(null, ctm, [pic ? `${id}~${objectOf(pic)}R` : id, pic?.width ?? W, pic?.height ?? H], null)
  }
  return { view: [0, 0, 612, 792], getOperatorList: async () => ({ fnArray, argsArray }), getTextContent: async () => ({ items: [] }), cleanup() {} }
}
const docOf = (pages: ReturnType<typeof pageOf>[]) => ({ numPages: pages.length, getPage: async (n: number) => pages[n - 1]! })
/** the pass over a fake document, its objects and decoders the test file's */
const pass = (o: Omit<Parameters<typeof ocrPass>[0], 'objects' | 'PL' | 'Jpeg'>) => ocrPass({ objects, PL: PL as never, Jpeg: JpegImage as never, ...o })
const PAPER = { id: '2608.04322', version: 1 }
const at = (x: number, y: number, w = W, h = H) => [w, 0, 0, h, x, y]
/** the host's reader, as the cache key names it */
const READER = 'onnxruntime-web@1.30.0+napi-canvas@1.0.10'

describe('the bitmap figures\' pass (ocrPass)', () => {
  it('reads each image once a paper and writes its labels as one chunk after the head\'s units, each with its place', async () => {
    const seen: number[] = []
    const doc = docOf([pageOf([['a', at(50, 400)], ['a', at(50, 100)]], { a: picture() })])
    const r = await pass({ doc, OPS, paper: PAPER, reader: READER, from: 30, recognise: async px => { seen.push(px.width); return [LINE] } })
    expect(seen).toEqual([W])
    expect(r.stats.images).toMatchObject({ painted: 2, read: 1, again: 1 })
    expect(r.stats.units).toBe(2)
    expect(r.chunks).toHaveLength(1)
    const c = await readUnitsChunk(r.chunks[0]!.bytes, { ref: r.chunks[0]!.ref })
    expect(c.from).toBe(30)
    expect(c.units.map(u => [u?.[0], u?.[5], (u as unknown[] | null)?.[7] && ((u as unknown[])[7] as number[])[0]])).toEqual([['inkocr', [[0, 'Validation loss']], 1], ['inkocr', [[0, 'Validation loss']], 1]])
  })

  it('leaves an image whose object it cannot read, one too small, one the recogniser refuses or gives up on: each counted, the paper read', async () => {
    const tiny = picture(0, 20, 20)
    const doc = docOf([pageOf([['none', at(50, 400)], ['small', at(50, 300, 20, 20)], ['tiny', at(50, 100)], ['bad', at(300, 100)], ['slow', at(300, 400)]], { small: picture(3), tiny, bad: picture(1), slow: picture(2) })])
    const r = await pass({ doc, OPS, paper: PAPER, reader: READER, from: 0, recognise: async px => { if (px.data[4 * (90 * W + 110)] === 33) throw new Error('the recogniser\'s'); throw Object.assign(new Error('late'), { name: 'TimeoutError' }) } })
    // (a paint naming no object read the document's: `format`)
    expect(r.stats.images).toMatchObject({ painted: 5, format: 1, small: 2, error: 1, timeout: 1, read: 0 })
    expect(r.chunks).toEqual([])
  })

  it('stops reading past its budget: the rest of the paper\'s images the original\'s (`budget`)', async () => {
    let t = 0
    const doc = docOf([pageOf([['a', at(50, 400)], ['b', at(50, 100)]], { a: picture(), b: picture(5) })])
    const r = await pass({ doc, OPS, paper: PAPER, reader: READER, from: 0, budgetMs: 100, now: () => t, recognise: async () => { t += 150; return [LINE] } })
    expect(r.stats.images).toMatchObject({ read: 1, budget: 1 })
    expect(r.stats.units).toBe(1)
  })

  it('reads no page and no image past the host\'s clock (`until`), whatever the recogniser\'s budget: those images past it (`budget`), those pages unread', async () => {
    let t = 0
    const doc = docOf([pageOf([['a', at(50, 400)], ['b', at(50, 100)]], { a: picture(), b: picture(5) }), pageOf([['c', at(50, 400)]], { c: picture(7) })])
    const r = await pass({ doc, OPS, paper: PAPER, reader: READER, from: 0, until: 100, now: () => t, recognise: async () => { t += 150; return [LINE] } })
    expect(r.stats.images).toMatchObject({ painted: 2, read: 1, budget: 1 })
    expect([r.stats.pages, r.stats.pagesLeft]).toEqual([1, 1])
    expect(r.stats.units).toBe(1)
  })

  it('takes a reading from the cache by its key, the recogniser\'s version and the image\'s bytes, and puts what it reads, its labels with it; a cache that fails is none', async () => {
    const puts = new Map<string, unknown>()
    const cache = { get: async (k: string) => (puts.get(k) as never) ?? null, put: async (k: string, v: unknown) => { puts.set(k, v) } }
    const doc = () => docOf([pageOf([['a', at(50, 400)]], { a: picture() })])
    let reads = 0
    const recognise = async () => { reads++; return [LINE] }
    await pass({ doc: doc(), OPS, paper: PAPER, reader: READER, from: 0, recognise, cache })
    const [key] = [...puts.keys()]
    expect(key).toBe(ocrKey(key!.split('|')[2]!, READER))
    expect(key!.startsWith(`${OCR_VERSION}|${READER}|`)).toBe(true)
    // (the image named by the reader's version, its size, and the digest of its bytes as the PDF holds them: no pixel decoded for it)
    expect(key!.split('|')[2]).toMatch(new RegExp(`^r1\\.${W}x${H}\\.[0-9a-f]{64}$`))
    // (another canvas, another key: two readings never mixed)
    const other = await pass({ doc: doc(), OPS, paper: PAPER, reader: 'onnxruntime-web@1.30.0+napi-canvas@1.0.11', from: 0, recognise, cache })
    expect(other.stats.images).toMatchObject({ read: 1, cached: 0 })
    expect(reads).toBe(2)
    reads = 1
    const again = await pass({ doc: doc(), OPS, paper: PAPER, reader: READER, from: 0, recognise, cache })
    expect(reads).toBe(1)
    expect(again.stats.images).toMatchObject({ cached: 1, read: 0 })
    expect(again.stats.units).toBe(1)
    const broken = { get: async () => { throw new Error('no cache') }, put: async () => { throw new Error('no cache') } }
    const r = await pass({ doc: doc(), OPS, paper: PAPER, reader: READER, from: 0, recognise, cache: broken })
    expect(r.stats).toMatchObject({ cacheFailed: 2, units: 1 })
    // (an empty reading is a reading: an image with no text is looked up, never read again)
    const none = { get: async () => ({ lines: [], labels: { boxes: [], read: 0, member: 0 } }), put: async () => {} }
    reads = 0
    const empty = await pass({ doc: doc(), OPS, paper: PAPER, reader: READER, from: 0, recognise, cache: none })
    expect([reads, empty.stats.images.cached, empty.stats.units]).toEqual([0, 1, 0])
    // (an entry out of shape is a miss: read again, the cache's failure counted, never lines the labels are made of)
    const labels = { boxes: [], read: 1, member: 0 }
    for (const bad of [{ lines: [{ text: 'x', conf: 0.9, quad: [[0, 0], [1, 0], [1, 1]] }], labels }, { lines: [{ text: '', conf: 0.9, quad: LINE.quad }], labels }, { lines: [{ ...LINE, conf: 'high' }], labels }, { lines: [LINE] }, [LINE], { lines: [LINE], labels: { boxes: [{ text: 'x', why: 'covered' }], read: 1, member: 1 } }, { lines: [LINE], labels: { boxes: [{ text: 'x', lines: [{ quad: LINE.quad, patch: LINE.quad, bg: [255, 255, 255], fg: [0, 0, 300], before: null, after: null }] }], read: 1, member: 1 } }]) {
      reads = 0
      const out = await pass({ doc: doc(), OPS, paper: PAPER, reader: READER, from: 0, recognise, cache: { get: async () => bad, put: async () => {} } })
      expect([reads, out.stats.cacheFailed, out.stats.images.cached, out.stats.units]).toEqual([1, 1, 0, 1])
    }
    expect(ocrLinesOf([LINE])).toEqual([LINE])
    // (what the pass put is a reading: the lines and the labels as the pixels gave them, placed on any page)
    const put = puts.get(key!) as { lines: unknown; labels: { boxes: unknown[] } }
    expect(ocrReadingOf(put)).toBe(put)
    expect(put.labels.boxes).toHaveLength(1)
    expect(ocrLinesOf(Array.from({ length: OCR_LINES_MAX + 1 }, () => LINE))).toBeNull()
  })

  it('takes OCR_IMAGES_MAX images a paper: past them the images met on its page are `many`, and no page more is read', async () => {
    // (one image a page, then a page of three, the bound met at its first; a page after it)
    const pages = Array.from({ length: OCR_IMAGES_MAX - 1 }, (_, k) => pageOf([['a', at(50, 400)]], { a: picture(k) }))
    pages.push(pageOf([['a', at(50, 400)], ['b', at(50, 250)], ['c', at(50, 100)]], { a: picture(201), b: picture(202), c: picture(203) }), pageOf([['a', at(50, 400)]], { a: picture(204) }))
    let reads = 0
    const r = await pass({ doc: docOf(pages), OPS, paper: PAPER, reader: READER, from: 0, budgetMs: 1e9, recognise: async () => { reads++; return [] } })
    expect(r.stats.images).toMatchObject({ painted: OCR_IMAGES_MAX + 2, read: OCR_IMAGES_MAX, many: 2 })
    expect(reads).toBe(OCR_IMAGES_MAX)
    expect([r.stats.pages, r.stats.pagesLeft]).toEqual([OCR_IMAGES_MAX, 1])
  })

  it('names each label\'s set by the id of its first: two images\' labels on one page, each image\'s sets its own', async () => {
    const LOW: OcrLine = { ...LINE, text: 'Training loss', quad: [[100 / W, 150 / H], [200 / W, 150 / H], [200 / W, 174 / H], [100 / W, 174 / H]] }
    const two = (seed: number) => { const p = picture(seed); for (let y = 155; y < 169; y++) for (let x = 105; x < 195; x++) { const i = 4 * (y * W + x); p.data[i] = p.data[i + 1] = p.data[i + 2] = 32 + seed } return p }
    const doc = docOf([pageOf([['a', at(50, 450)], ['b', at(50, 100)]], { a: two(0), b: two(3) })])
    const r = await pass({ doc, OPS, paper: PAPER, reader: READER, from: 40, recognise: async () => [LINE, LOW] })
    expect(r.stats.units).toBe(4)
    expect(r.units.map(u => ((u as unknown[])[7] as number[])[5])).toEqual([40, 40, 42, 42])
    expect(r.stats.sets).toMatchObject({ sets: 2, grouped: 4 })
  })

  it('asks the host\'s collection after each image, an image painted twice read once', async () => {
    const events: string[] = []
    const a = picture(), b = picture(4)
    const page = pageOf([['a', at(50, 450)], ['b', at(300, 450)], ['a', at(50, 100)]], { a, b })
    const r = await pass({ doc: docOf([page]), OPS, paper: PAPER, reader: READER, from: 0, recognise: async () => { events.push('read'); return [LINE] }, collect: () => { events.push('collect') } })
    expect(r.stats.images).toMatchObject({ painted: 3, read: 2, again: 1 })
    expect(events).toEqual(['read', 'collect', 'read', 'collect', 'collect'])
  })

  it('covers a label an image painted after it hides; skips a page that cannot be read; reads a path of a hundred thousand segments', async () => {
    // (two opaque images at one place: the first's label is under the second, none drawn of it)
    const same = await pass({ doc: docOf([pageOf([['a', at(50, 400)], ['b', at(50, 400)]], { a: picture(), b: picture(9) })]), OPS, paper: PAPER, reader: READER, from: 0, recognise: async () => [LINE] })
    expect(same.stats.labels).toMatchObject({ covered: 1 })
    expect(same.stats.units).toBe(1)
    // (a page whose operators throw: skipped, the next read)
    const broken = { ...pageOf([], {}), getOperatorList: async () => { throw new Error('a stream PDF.js cannot read') } }
    const skipped = await pass({ doc: docOf([broken as never, pageOf([['a', at(50, 400)]], { a: picture() })]), OPS, paper: PAPER, reader: READER, from: 0, recognise: async () => [LINE] })
    expect([skipped.stats.pagesFailed, skipped.stats.units]).toEqual([1, 1])
    // (one path of 130,000 segments: its box by a loop, no arguments' list past the stack)
    const data = [0, 0, 0]
    for (let i = 1; i <= 130_000; i++) data.push(1, i % 500, i % 700)
    expect(() => paintsOf({ fnArray: [OPS.constructPath], argsArray: [[OPS.stroke, [new Float32Array(data)]]] }, OPS)).not.toThrow()
  })

  it('reads an image past its bound scaled down: a line read too small there read again in its window at the image\'s own pixels, its labels judged there too, as an image within its bound is', async () => {
    // (the bound a quarter of the image's pixels: read at 200 × 100, its line 12 pixels across, under OCR_LINE_MIN_PX)
    const sizes: number[][] = []
    const recognise = async (px: { width: number; height: number }) => {
      sizes.push([px.width, px.height])
      // (in a window, the line where the window holds it: its bar from x 105 to 195, y 85 to 99 of the image's own pixels)
      if (px.width !== 200) return [{ ...LINE, quad: LINE.quad.map(([x, y]) => [x! * W, y! * H]).map(([x, y]) => [(x! - 88) / px.width, (y! - 68) / px.height]) as unknown as OcrLine['quad'] }]
      return [LINE]
    }
    const doc = docOf([pageOf([['a', at(50, 400)]], { a: picture() })])
    const scaled = await pass({ doc, OPS, paper: PAPER, reader: READER, from: 0, recognise, readPixels: 20_000 })
    expect(sizes[0]).toEqual([200, 100])
    expect(sizes).toHaveLength(2)
    expect(scaled.stats).toMatchObject({ reread: 1, relabelled: 1, units: 1 })
    // (the label as an image read whole gives it: its place the same)
    const whole = await pass({ doc: docOf([pageOf([['a', at(50, 400)]], { a: picture() })]), OPS, paper: PAPER, reader: READER, from: 0, recognise: async () => [LINE] })
    const placeOfUnit = (u: unknown) => ((u as unknown[])[7] as number[]).map(v => Math.round(v))
    expect(placeOfUnit(scaled.units[0])).toEqual(placeOfUnit(whole.units[0]))
  })

  it('reads no window past the host\'s clock: a scaled image\'s lines and labels left as its scaled read gave them', async () => {
    let t = 0
    const doc = docOf([pageOf([['a', at(50, 400)]], { a: picture() })])
    // (the clock passes as the scaled read is recognised: no window is decoded or read after it)
    const r = await pass({ doc, OPS, paper: PAPER, reader: READER, from: 0, readPixels: 20_000, until: 100, now: () => t, recognise: async () => { t += 150; return [LINE] } })
    expect(r.stats).toMatchObject({ reread: 0, relabelled: 0 })
    expect(r.stats.images.read).toBe(1)
  })

  it('leaves the labels of an image of a mask painted over other ink the original\'s: what shows through it is not the white it was read over', async () => {
    // (a soft mask, gray: opaque where its value is 255)
    const n = next++, m = next++
    streams.set(m, PL.PDFRawStream.of(ctx.obj({ Width: W, Height: H, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }) as unknown as PL.PDFDict, new Uint8Array(W * H).fill(255)))
    const pic = picture(), rgb = new Uint8Array(W * H * 3)
    for (let i = 0; i < W * H; i++) { rgb[3 * i] = pic.data[4 * i]!; rgb[3 * i + 1] = pic.data[4 * i + 1]!; rgb[3 * i + 2] = pic.data[4 * i + 2]! }
    streams.set(n, PL.PDFRawStream.of(ctx.obj({ Width: W, Height: H, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, SMask: PL.PDFRef.of(m) }) as unknown as PL.PDFDict, rgb))
    const page = (under: boolean) => {
      const fnArray: number[] = [], argsArray: unknown[] = []
      if (under) { fnArray.push(OPS.constructPath); argsArray.push([OPS.fill, [new Float32Array([0, 40, 390, 1, 460, 390, 1, 460, 610, 1, 40, 610, 4])], null]) }
      fnArray.push(OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore)
      argsArray.push(null, at(50, 400), [`a~${n}R`, W, H], null)
      return { view: [0, 0, 612, 792], getOperatorList: async () => ({ fnArray, argsArray }), getTextContent: async () => ({ items: [] }), cleanup() {} }
    }
    const over = await pass({ doc: docOf([page(true)]), OPS, paper: PAPER, reader: READER, from: 0, recognise: async () => [LINE] })
    expect([over.stats.units, over.stats.labels]).toEqual([0, { covered: 1 }])
    const alone = await pass({ doc: docOf([page(false)]), OPS, paper: PAPER, reader: READER, from: 0, recognise: async () => [LINE] })
    expect(alone.stats.units).toBe(1)
  })

  it('keeps a label of names as a table\'s cell of names is: its source, the KEPT flag', async () => {
    const doc = docOf([pageOf([['a', at(50, 400)]], { a: picture() })])
    const r = await pass({ doc, OPS, paper: PAPER, reader: READER, from: 0, recognise: async () => [{ ...LINE, text: 'GPT-4o' }] })
    expect(r.stats.kept).toBe(1)
    expect(r.units[0]?.[1]).toBe(8)
  })
})

describe('a page\'s paints (paintsOf)', () => {
  it('reads each image under its transform and the clip in force: a form\'s box, a rectangle\'s, none other', () => {
    const rect = new Float32Array([0, 10, 10, 1, 110, 10, 1, 110, 60, 1, 10, 60, 4])
    const curve = new Float32Array([0, 0, 0, 2, 10, 0, 20, 10, 20, 20, 4])
    const list = {
      fnArray: [OPS.paintFormXObjectBegin, OPS.paintImageXObject, OPS.paintFormXObjectEnd, OPS.save, OPS.clip, OPS.constructPath, OPS.paintImageXObject, OPS.restore, OPS.save, OPS.clip, OPS.constructPath, OPS.paintImageXObject, OPS.restore, OPS.paintImageXObject, OPS.constructPath],
      argsArray: [[[1, 0, 0, 1, 5, 5], [0, 0, 50, 40]], ['a', 2, 2], [], null, null, [OPS.endPath, [rect], null], ['b', 2, 2], null, null, null, [OPS.endPath, [curve], null], ['c', 2, 2], null, ['d', 2, 2], [OPS.stroke, [rect], null]],
    }
    const { images, paths } = paintsOf(list, OPS)
    expect(images.map(i => i.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(images[0]!.clips).toEqual([[[5, 5], [55, 5], [55, 45], [5, 45]]])
    expect(images[1]!.clips).toEqual([[[10, 10], [110, 10], [110, 60], [10, 60]]])
    expect(images[2]!.clips).toBe('complex')
    // (a restore undoes a clip)
    expect(images[3]!.clips).toEqual([])
    // (a path painted: its segments, after the image it is drawn after)
    expect(paths).toHaveLength(1)
    expect(paths[0]!.k).toBe(14)
    expect(paths[0]!.segs).toHaveLength(4)
  })
  it('closes a fill\'s subpaths as PDF does, and leaves a stroke\'s open', () => {
    const open = new Float32Array([0, 0, 0, 1, 10, 0, 1, 10, 10])
    const fill = paintsOf({ fnArray: [OPS.constructPath], argsArray: [[OPS.fill, [open], null]] }, OPS).paths[0]!
    expect(fill.segs).toHaveLength(3)
    expect(fill.segs[2]!.slice(0, 4)).toEqual([10, 10, 0, 0])
    expect(paintsOf({ fnArray: [OPS.constructPath], argsArray: [[OPS.stroke, [open], null]] }, OPS).paths[0]!.segs).toHaveLength(2)
  })
})
