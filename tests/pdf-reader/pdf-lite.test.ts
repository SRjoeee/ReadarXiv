// @vitest-environment node
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { LINK_TEXT_PIXELS, LITE_PDFJS, liteWorkerSource, NO_IMAGE_PIXELS } from '@/pdf-reader/engine/layout/pdf-lite.mjs'
import { PDFJS } from '@/pdf-reader/engine/pipeline/versions.mjs'
import { installLiteWorker, LITE } from './helpers/lite-pdfjs'

// PDF.js's worker without the images' pixels (layout/pdf-lite.mjs): the patch is pinned to the PDF.js it was made for, applies to a
// document that opts in and to no other, and leaves the operator list exactly as it was

const require = createRequire(import.meta.url)
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
    expect(out.length).toBeLessThan(src.length + 300)
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

  it('is pinned: the installed worker is the version the patch was made for, holds the decode once, and the engine\'s PDFJS is it', () => {
    const version = (JSON.parse(readFileSync(require.resolve('pdfjs-dist/package.json'), 'utf8')) as { version: string }).version
    expect(version).toBe(LITE_PDFJS)
    expect(PDFJS).toBe(LITE_PDFJS)
    const worker = readFileSync(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'), 'utf8')
    expect(worker.split(ANCHOR).length - 1).toBe(1)
    expect(worker.split(TEXT_ANCHOR).length - 1).toBe(1)
    expect(worker.split(EXPORT_ANCHOR).length - 1).toBe(1)
    expect(worker.trimEnd().split('\n').filter(l => l.startsWith('export ')).at(-1)).toBe(EXPORT_ANCHOR)
    expect(liteWorkerSource(worker, { version })).toContain('image pixels not decoded')
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
  const out: { fn: number[]; args: unknown[]; decoded: (boolean | null)[] }[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const list = await page.getOperatorList()
    // what became of each image's pixels, once the worker has had its turn (an image on several pages is a common object; the
    // document's number in its id is the only thing a second document changes)
    const ids = list.argsArray.filter((a, i) => list.fnArray[i] === OPS.paintImageXObject && Array.isArray(a)).map(a => (a as unknown[])[0] as string)
    await new Promise(r => setTimeout(r, 300))
    const objs = (id: string) => (id.startsWith('g_') ? page.commonObjs : page.objs)
    const decoded = ids.map(id => (objs(id).has(id) ? (objs(id).get(id) ? true : null) : false))
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
    // stock: each image's pixels came; lite: the decode failed (a null image) and nothing was kept; the draw's opt-in the same
    expect(stock.out.flatMap(p => p.decoded)).toEqual([true, true, true])
    expect(lite.out.flatMap(p => p.decoded)).toEqual([null, null, null])
    expect(links.out.flatMap(p => p.decoded)).toEqual([null, null, null])
    expect(links.out.map(p => [p.fn, p.args])).toEqual(stock.out.map(p => [p.fn, p.args]))
    // and a stock reading after a lite one in the same process still decodes
    const again = await read(IMAGES, false)
    expect(again.out.flatMap(p => p.decoded)).toEqual([true, true, true])
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
