// @vitest-environment node
// The bitmap figures' pass (pipeline/ocr-pass.mjs, PDF-READER §19.15): every image our base page paints read by the recogniser the
// host gives (once a paper, its reading cached by its pixels' digest and the recogniser's version), its labels the units of one
// more chunk after the head's; a figure the pass cannot read stays the original's with its reason, never the paper's failure.
// A fake document: its pages' operator lists and images as PDF.js gives them, the recogniser's answers the test's
import { describe, expect, it } from 'vitest'
import { OCR_VERSION } from '@/core/ocr/version'
import type { OcrLine } from '@/shared/ocr'
import { readUnitsChunk } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { ocrKey, ocrPass, paintsOf } from '@/pdf-reader/engine/pipeline/ocr-pass.mjs'

const OPS = { save: 10, restore: 11, transform: 12, setLineWidth: 2, setGState: 9, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75, beginGroup: 76, clip: 29, eoClip: 30, constructPath: 91, stroke: 20, closeStroke: 21, fill: 22, eoFill: 23, fillStroke: 24, eoFillStroke: 25, closeFillStroke: 26, closeEOFillStroke: 27, endPath: 28, paintImageXObject: 85, paintImageXObjectRepeat: 88 }
const W = 400, H = 200
/** an image of a white ground and one dark bar where the recogniser reads its line */
function picture(seed = 0) {
  const data = new Uint8ClampedArray(W * H * 4).fill(255)
  for (let y = 85; y < 99; y++) for (let x = 105; x < 195; x++) { const i = 4 * (y * W + x); data[i] = data[i + 1] = data[i + 2] = 32 + seed }
  return { data, width: W, height: H, kind: 3 }
}
const LINE: OcrLine = { text: 'Validation loss', conf: 0.95, quad: [[100 / W, 80 / H], [200 / W, 80 / H], [200 / W, 104 / H], [100 / W, 104 / H]] }
/** a page painting images (id → its object, null where PDF.js decoded none), each [id, ctm] */
function pageOf(paints: [string, number[]][], objs: Record<string, unknown>) {
  const fnArray: number[] = [], argsArray: unknown[] = []
  for (const [id, ctm] of paints) { fnArray.push(OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore); argsArray.push(null, ctm, [id, W, H], null) }
  return { view: [0, 0, 612, 792], getOperatorList: async () => ({ fnArray, argsArray }), getTextContent: async () => ({ items: [] }), objs: { get: (id: string, cb: (v: unknown) => void) => cb(objs[id] ?? null) }, commonObjs: { get: (_: string, cb: (v: unknown) => void) => cb(null) }, cleanup() {} }
}
const docOf = (pages: ReturnType<typeof pageOf>[]) => ({ numPages: pages.length, getPage: async (n: number) => pages[n - 1]! })
const PAPER = { id: '2608.04322', version: 1 }
const at = (x: number, y: number, w = W, h = H) => [w, 0, 0, h, x, y]
/** the host's reader, as the cache key names it */
const READER = 'onnxruntime-web@1.30.0+napi-canvas@1.0.10'

describe('the bitmap figures\' pass (ocrPass)', () => {
  it('reads each image once a paper and writes its labels as one chunk after the head\'s units, each with its place', async () => {
    const seen: number[] = []
    const doc = docOf([pageOf([['a', at(50, 400)], ['a', at(50, 100)]], { a: picture() })])
    const r = await ocrPass({ doc, OPS, paper: PAPER, reader: READER, from: 30, recognise: async px => { seen.push(px.width); return [LINE] } })
    expect(seen).toEqual([W])
    expect(r.stats.images).toMatchObject({ painted: 2, read: 1, again: 1 })
    expect(r.stats.units).toBe(2)
    expect(r.chunks).toHaveLength(1)
    const c = await readUnitsChunk(r.chunks[0]!.bytes, { ref: r.chunks[0]!.ref })
    expect(c.from).toBe(30)
    expect(c.units.map(u => [u?.[0], u?.[5], (u as unknown[] | null)?.[7] && ((u as unknown[])[7] as number[])[0]])).toEqual([['inkocr', [[0, 'Validation loss']], 1], ['inkocr', [[0, 'Validation loss']], 1]])
  })

  it('leaves an image the cap kept from its pixels, one too small, one the recogniser refuses or gives up on: each counted, the paper read', async () => {
    const tiny = { data: new Uint8ClampedArray(20 * 20 * 4).fill(255), width: 20, height: 20, kind: 3 }
    const doc = docOf([pageOf([['big', at(50, 400)], ['small', at(50, 300, 20, 20)], ['tiny', at(50, 100)], ['bad', at(300, 100)], ['slow', at(300, 400)]], { tiny, bad: picture(1), slow: picture(2) })])
    const r = await ocrPass({ doc, OPS, paper: PAPER, reader: READER, from: 0, recognise: async px => { if (px.data[4 * (90 * W + 110)] === 33) throw new Error('the recogniser\'s'); throw Object.assign(new Error('late'), { name: 'TimeoutError' }) } })
    expect(r.stats.images).toMatchObject({ painted: 5, big: 1, small: 2, error: 1, timeout: 1, read: 0 })
    expect(r.chunks).toEqual([])
  })

  it('stops reading past its budget: the rest of the paper\'s images the original\'s (`budget`)', async () => {
    let t = 0
    const doc = docOf([pageOf([['a', at(50, 400)], ['b', at(50, 100)]], { a: picture(), b: picture(5) })])
    const r = await ocrPass({ doc, OPS, paper: PAPER, reader: READER, from: 0, budgetMs: 100, now: () => t, recognise: async () => { t += 150; return [LINE] } })
    expect(r.stats.images).toMatchObject({ read: 1, budget: 1 })
    expect(r.stats.units).toBe(1)
  })

  it('takes a reading from the cache by its key, the recogniser\'s version and the pixels\' digest, and puts what it reads; a cache that fails is none', async () => {
    const puts = new Map<string, unknown>()
    const cache = { get: async (k: string) => (puts.get(k) as never) ?? null, put: async (k: string, v: unknown) => { puts.set(k, v) } }
    const doc = () => docOf([pageOf([['a', at(50, 400)]], { a: picture() })])
    let reads = 0
    const recognise = async () => { reads++; return [LINE] }
    await ocrPass({ doc: doc(), OPS, paper: PAPER, reader: READER, from: 0, recognise, cache })
    const [key] = [...puts.keys()]
    expect(key).toBe(ocrKey(key!.split('|')[2]!, READER))
    expect(key!.startsWith(`${OCR_VERSION}|${READER}|`)).toBe(true)
    // (the pixels named by their size and kind, then their own digest: no copy of them made to hash them)
    expect(key!.split('|')[2]).toMatch(new RegExp(`^${W}x${H}k3\\.[0-9a-f]{64}$`))
    // (another canvas, another key: two readings never mixed)
    const other = await ocrPass({ doc: doc(), OPS, paper: PAPER, reader: 'onnxruntime-web@1.30.0+napi-canvas@1.0.11', from: 0, recognise, cache })
    expect(other.stats.images).toMatchObject({ read: 1, cached: 0 })
    expect(reads).toBe(2)
    reads = 1
    const again = await ocrPass({ doc: doc(), OPS, paper: PAPER, reader: READER, from: 0, recognise, cache })
    expect(reads).toBe(1)
    expect(again.stats.images).toMatchObject({ cached: 1, read: 0 })
    expect(again.stats.units).toBe(1)
    const broken = { get: async () => { throw new Error('no cache') }, put: async () => { throw new Error('no cache') } }
    const r = await ocrPass({ doc: doc(), OPS, paper: PAPER, reader: READER, from: 0, recognise, cache: broken })
    expect(r.stats).toMatchObject({ cacheFailed: 2, units: 1 })
  })

  it('names each label\'s set by the id of its first: two images\' labels on one page, each image\'s sets its own', async () => {
    const LOW: OcrLine = { ...LINE, text: 'Training loss', quad: [[100 / W, 150 / H], [200 / W, 150 / H], [200 / W, 174 / H], [100 / W, 174 / H]] }
    const two = (seed: number) => { const p = picture(seed); for (let y = 155; y < 169; y++) for (let x = 105; x < 195; x++) { const i = 4 * (y * W + x); p.data[i] = p.data[i + 1] = p.data[i + 2] = 32 + seed } return p }
    const doc = docOf([pageOf([['a', at(50, 450)], ['b', at(50, 100)]], { a: two(0), b: two(3) })])
    const r = await ocrPass({ doc, OPS, paper: PAPER, reader: READER, from: 40, recognise: async () => [LINE, LOW] })
    expect(r.stats.units).toBe(4)
    expect(r.units.map(u => ((u as unknown[])[7] as number[])[5])).toEqual([40, 40, 42, 42])
    expect(r.stats.sets).toMatchObject({ sets: 2, grouped: 4 })
  })

  it('lets each image of a page go after its last paint is read, and asks the host\'s collection after each image', async () => {
    const events: string[] = []
    const page = pageOf([['a', at(50, 450)], ['b', at(300, 450)], ['a', at(50, 100)]], { a: picture(), b: picture(4) })
    ;(page.objs as unknown as { delete: (id: string) => boolean }).delete = (id: string) => { events.push(`delete ${id}`); return true }
    const r = await ocrPass({ doc: docOf([page]), OPS, paper: PAPER, reader: READER, from: 0, recognise: async () => { events.push('read'); return [LINE] }, collect: () => { events.push('collect') } })
    expect(r.stats.images).toMatchObject({ painted: 3, read: 2, again: 1 })
    expect(events).toEqual(['read', 'collect', 'read', 'delete b', 'collect', 'delete a', 'collect'])
  })

  it('keeps a label of names as a table\'s cell of names is: its source, the KEPT flag', async () => {
    const doc = docOf([pageOf([['a', at(50, 400)]], { a: picture() })])
    const r = await ocrPass({ doc, OPS, paper: PAPER, reader: READER, from: 0, recognise: async () => [{ ...LINE, text: 'GPT-4o' }] })
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
})
