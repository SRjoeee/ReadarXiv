// @vitest-environment node
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { LINK_TEXT_PIXELS, LITE_PDFJS, liteWorkerSource, NO_IMAGE_PIXELS } from '../../packages/engine/src/compile/pdf-lite.ts'
import { installLiteWorker, LITE } from './helpers/lite-pdfjs'

// PDF.js's worker without the images' pixels (layout/pdf-lite.mjs): the patch is pinned to the PDF.js it was made for, applies to a
// document that opts in and to no other, and leaves the operator list exactly as it was

const ANCHOR = 'imgData = await imageObj.createImageData(false, isOffscreenCanvasSupported);'
const TEXT_ANCHOR = '} else if (annotation.overlaysTextContent && isVisible) {'
const EXPORT_ANCHOR = 'export { WorkerMessageHandler };'

describe('liteWorkerSource', () => {
  it('adds the guard before the one image decode and the one on a link\'s overlaid text, exports FeatureTest, and nothing else', () => {
    const src = `a\n${ANCHOR}\nb\n${TEXT_ANCHOR}\nc\n${EXPORT_ANCHOR}\n`
    const out = liteWorkerSource(src)
    expect(out.startsWith('a\n')).toBe(true)
    expect(out.endsWith('\nexport { FeatureTest, WorkerMessageHandler };\n')).toBe(true)
    expect(out).not.toContain(EXPORT_ANCHOR)
    expect(out).toContain(`this.options.maxImageSize >= ${LINK_TEXT_PIXELS}`)
    expect(LINK_TEXT_PIXELS).toBe(NO_IMAGE_PIXELS - 1)
    expect(out).toContain(`annotation.overlaysTextContent && isVisible && this.evaluatorOptions.maxImageSize !== ${NO_IMAGE_PIXELS}) {`)
    expect(out).not.toContain(TEXT_ANCHOR)
    // (the three insertions alone: the guard with its record of no pixels, the text's condition, FeatureTest's export)
    expect(out.length).toBeLessThan(src.length + 400)
  })

  it('refuses a worker without the decode, with it twice, a source that is no string, and a PDF.js it was not made for', () => {
    expect(() => liteWorkerSource('nothing')).toThrow(/0 times/)
    expect(() => liteWorkerSource(`${ANCHOR}\n${ANCHOR}\n${TEXT_ANCHOR}\n${EXPORT_ANCHOR}`)).toThrow(/2 times/)
    // (the overlaid text's condition: none, or twice)
    expect(() => liteWorkerSource(`${ANCHOR}\n${EXPORT_ANCHOR}`)).toThrow(/overlaid text's condition 0 times/)
    expect(() => liteWorkerSource(`${ANCHOR}\n${TEXT_ANCHOR}\n${TEXT_ANCHOR}\n${EXPORT_ANCHOR}`)).toThrow(/overlaid text's condition 2 times/)
    // (the export statement FeatureTest is added to: none, or twice)
    expect(() => liteWorkerSource(`${ANCHOR}\n${TEXT_ANCHOR}`)).toThrow(/export statement 0 times/)
    expect(() => liteWorkerSource(`${ANCHOR}\n${TEXT_ANCHOR}\n${EXPORT_ANCHOR}\n${EXPORT_ANCHOR}`)).toThrow(/export statement 2 times/)
    expect(() => liteWorkerSource(1 as never)).toThrow(TypeError)
    expect(() => liteWorkerSource(`${ANCHOR}${TEXT_ANCHOR}${EXPORT_ANCHOR}`, { version: '9.9.9' })).toThrow(/made for PDF\.js/)
    expect(() => liteWorkerSource(`${ANCHOR}${TEXT_ANCHOR}${EXPORT_ANCHOR}`, { version: LITE_PDFJS })).not.toThrow()
  })

  it('is pinned: the installed worker is the version the patch was made for, holds the decode once, and the PDF.js the rebuilt reader ships (the repository\'s one pin of pdfjs-dist, its root manifest) is it', () => {
    const require = createRequire(import.meta.url)
    const version = (JSON.parse(readFileSync(require.resolve('pdfjs-dist/package.json'), 'utf8')) as { version: string }).version
    expect(version).toBe(LITE_PDFJS)
    const worker = readFileSync(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'), 'utf8')
    expect(worker.split(ANCHOR).length - 1).toBe(1)
    expect(worker.split(TEXT_ANCHOR).length - 1).toBe(1)
    expect(worker.split(EXPORT_ANCHOR).length - 1).toBe(1)
    expect(worker.trimEnd().split('\n').filter(l => l.startsWith('export ')).at(-1)).toBe(EXPORT_ANCHOR)
    expect(liteWorkerSource(worker, { version })).toContain('image pixels not decoded')
    // (packages/reader takes PDF.js from its host, the repository pinning it once: the reader's build serves that pin's files,
    // packages/reader/package.json "//", src/vite.ts pdfjsDist)
    const root = JSON.parse(readFileSync(join(import.meta.dirname, '../../package.json'), 'utf8')) as { dependencies: Record<string, string> }
    expect(root.dependencies['pdfjs-dist']).toBe(LITE_PDFJS)
  })

})

// a PDF of two pages and three big images: a Flate-less RGB raw one drawn twice (pages 1 and 2) and a Gray one, each
// `q w 0 0 h x y cm /Im Do Q`
const enc = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'))
function pdfOf(objects: (string | [string, string])[]): Uint8Array {
  let out = '%PDF-1.7\n'
  const offsets: number[] = []
  objects.forEach((o, i) => {
    offsets.push(out.length)
    out += Array.isArray(o) ? `${i + 1} 0 obj\n<< ${o[0]} /Length ${o[1].length} >>\nstream\n${o[1]}\nendstream\nendobj\n` : `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const at = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f\r\n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n\r\n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`
  return enc(out)
}
const SIDE = 600
const rgb = String.fromCharCode(0, 128, 255).repeat(SIDE * SIDE)
const gray = String.fromCharCode(200).repeat(SIDE * SIDE)
const IMAGES = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 5 0 R /Im2 6 0 R >> >> /Contents 7 0 R >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 8 0 R >>',
  [`/Type /XObject /Subtype /Image /Width ${SIDE} /Height ${SIDE} /ColorSpace /DeviceRGB /BitsPerComponent 8`, rgb],
  [`/Type /XObject /Subtype /Image /Width ${SIDE} /Height ${SIDE} /ColorSpace /DeviceGray /BitsPerComponent 8`, gray],
  ['', 'q 200 0 0 150 50 500 cm /Im1 Do Q q 100 0 0 100 300 300 cm /Im2 Do Q'],
  ['', 'q 120 0 0 120 72 72 cm /Im1 Do Q'],
])

async function read(data: Uint8Array, lite: boolean | 'links') {
  const task = getDocument({ data: data.slice(), verbosity: 0, ...(lite === 'links' ? { maxImageSize: LINK_TEXT_PIXELS } : lite ? LITE : {}) })
  const doc = await task.promise
  const out: { fn: number[]; args: unknown[]; decoded: unknown[] }[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const list = await page.getOperatorList()
    // what became of each image's pixels, once the worker has had its turn (an image on several pages is a common object; the
    // document's number in its id is the only thing a second document changes)
    const ids = list.argsArray.filter((a, i) => list.fnArray[i] === OPS.paintImageXObject && Array.isArray(a)).map(a => (a as unknown[])[0] as string)
    await new Promise(r => setTimeout(r, 300))
    const objs = (id: string) => (id.startsWith('g_') ? page.commonObjs : page.objs)
    // (each its pixels, a record of none that says whether its samples carry alpha (the lite worker's), or none (null); false
    // where nothing came)
    const decoded = ids.map(id => {
      if (!objs(id).has(id)) return false
      const o = objs(id).get(id) as { data?: { length: number }; bitmap?: unknown; alpha?: boolean } | null
      return o === null ? null : o.bitmap || (o.data?.length ?? 0) > 0 ? 'pixels' : { alpha: o.alpha }
    })
    out.push({ fn: Array.from(list.fnArray), args: JSON.parse(JSON.stringify(list.argsArray).replace(/_d\d+_/g, '_dN_')), decoded })
    page.cleanup()
  }
  await task.destroy()
  return { out }
}

describe('a document read without its images\' pixels', () => {
  beforeAll(async () => { await installLiteWorker() })

  it('has the operator list of the stock reading, bit for bit, the images placed as ever', async () => {
    const stock = await read(IMAGES, false), lite = await read(IMAGES, true)
    expect(lite.out.map(p => [p.fn, p.args])).toEqual(stock.out.map(p => [p.fn, p.args]))
    // (the images are there: the paint operators with their transforms before them)
    const paints = lite.out.flatMap(p => p.fn.filter(f => f === OPS.paintImageXObject))
    expect(paints.length).toBe(3)
  })

  it('decodes no pixel for it, while a document opened without the option in the same process decodes as ever', async () => {
    const stock = await read(IMAGES, false), lite = await read(IMAGES, true), links = await read(IMAGES, 'links')
    // stock: each image's pixels came; lite: a record of no pixels in their place, each of an image whose samples carry no alpha;
    // the draw's opt-in the same
    const opaque = { alpha: false }
    expect(stock.out.flatMap(p => p.decoded)).toEqual(['pixels', 'pixels', 'pixels'])
    expect(lite.out.flatMap(p => p.decoded)).toEqual([opaque, opaque, opaque])
    expect(links.out.flatMap(p => p.decoded)).toEqual([opaque, opaque, opaque])
    expect(links.out.map(p => [p.fn, p.args])).toEqual(stock.out.map(p => [p.fn, p.args]))
    // and a stock reading after a lite one in the same process still decodes
    const again = await read(IMAGES, false)
    expect(again.out.flatMap(p => p.decoded)).toEqual(['pixels', 'pixels', 'pixels'])
  })

  // (one page, six images side by side: an RGB one; one with a soft mask; one with a colour-key /Mask; one with a stencil /Mask; a
  // JPX of a /ColorSpace and no /SMaskInData; a JPX whose data holds its soft mask (/SMaskInData 1))
  const JPX = Buffer.from(
    '/0//UQAvAAAAAAAIAAAACAAAAAAAAAAAAAAACAAAAAgAAAAAAAAAAAADBwEBBwEBBwEB/1IADAAAAAEBAQQEAAH/XAAHQEBISFD/ZAAlAAFDcmVhdGVkIGJ5IE9wZW5KUEVHIHZlcnNpb24gMi41LjT/kAAKAAAAAABbAAH/k8+0OBDiOPgtKH0c7yKSSMyb34BIFTFrrB4pUAh/34BoBkGUjLQHNu5nGNP/f8D5AcHzgwAiGg8Df+uh9QGAAM/jw+oDh9QGIhoVAM/j/9k=',
    'base64',
  ).toString('latin1')
  const RGB = '/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8'
  const px = String.fromCharCode(10, 20, 30).repeat(4)
  const KINDS = pdfOf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /A 5 0 R /B 6 0 R /C 8 0 R /D 9 0 R /E 11 0 R /F 12 0 R >> >> /Contents 4 0 R >>',
    ['', ['A', 'B', 'C', 'D', 'E', 'F'].map((n, i) => `q 50 0 0 50 ${60 + 80 * i} 300 cm /${n} Do Q`).join(' ')],
    [RGB, px],
    [`${RGB} /SMask 7 0 R`, px],
    ['/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8', String.fromCharCode(255, 0, 0, 255)],
    [`${RGB} /Mask [10 10 20 20 30 30]`, px],
    [`${RGB} /Mask 10 0 R`, px],
    ['/Type /XObject /Subtype /Image /Width 2 /Height 2 /BitsPerComponent 1 /ImageMask true', String.fromCharCode(0x40, 0x80)],
    ['/Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceGray /Filter /JPXDecode', JPX],
    ['/Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceGray /Filter /JPXDecode /SMaskInData 1', JPX],
  ])
  it('states, with no pixel, whether each image\'s samples carry alpha: its soft mask, its mask (a colour key or a stencil), a JPX\'s soft mask in its data', async () => {
    const lite = await read(KINDS, true)
    expect(lite.out.flatMap(p => p.decoded)).toEqual([false, true, true, true, false, true].map(alpha => ({ alpha })))
    // (the same list as the stock reading's)
    const stock = await read(KINDS, false)
    expect(lite.out.map(p => [p.fn, p.args])).toEqual(stock.out.map(p => [p.fn, p.args]))
  })
})

// a page of text with a Link annotation over its last word, naming a destination
const LINKED = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R /Annots [6 0 R] >>',
  ['', 'BT /F1 12 Tf 72 700 Td (see Section C) Tj ET'],
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Type /Annot /Subtype /Link /Rect [70 695 200 712] /Border [0 0 0] /Dest (appendix.C) >>',
])
async function linksOf(lite: boolean | 'links') {
  const task = getDocument({ data: LINKED.slice(), verbosity: 0, ...(lite === 'links' ? { maxImageSize: LINK_TEXT_PIXELS } : lite ? LITE : {}) })
  const doc = await task.promise
  const page = await doc.getPage(1)
  const list = await page.getOperatorList()
  const annots = (await page.getAnnotations()).filter(a => a.subtype === 'Link').map(a => ({ dest: a.dest, rect: Array.from(a.rect as number[]), overlaidText: a.overlaidText }))
  await task.destroy()
  return { fn: Array.from(list.fnArray), annots }
}

describe("a document read without its images' pixels: its links", () => {
  beforeAll(async () => { await installLiteWorker() })

  it('come with their rectangle and destination, without the overlaid text PDF.js extracts the page\'s text again for', async () => {
    const stock = await linksOf(false), lite = await linksOf(true)
    expect(stock.annots).toHaveLength(1)
    expect(stock.annots[0]?.overlaidText).toBeTruthy()
    expect(lite.annots).toEqual(stock.annots.map(a => ({ ...a, overlaidText: undefined })))
    // (and the page's operator list is the same)
    expect(lite.fn).toEqual(stock.fn)
  })

  it('come with the overlaid text exactly as the stock worker makes it where the document is read for its draw (LINK_TEXT_PIXELS)', async () => {
    const stock = await linksOf(false), links = await linksOf('links')
    expect(links.annots).toEqual(stock.annots)
    expect(links.annots[0]?.overlaidText).toBe(stock.annots[0]?.overlaidText)
    expect(links.fn).toEqual(stock.fn)
  })
})
