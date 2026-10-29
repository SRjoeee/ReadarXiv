// @vitest-environment node
// The bitmap figures' opt-in to PDF.js's lite worker (layout/pdf-lite.mjs OCR_IMAGE_PIXELS, PDF-READER §19.15): no image's pixels
// decoded, and each image's paint operator naming its object (its id ending `~` and PDF.js's ref), the one shared across pages too,
// so that the pass reads each image from the PDF's own object (pipeline/ocr-image.mjs). A document opened without it is as it was.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { liteWorkerSource, OCR_IMAGE_PIXELS } from '@/pdf-reader/engine/layout/pdf-lite.mjs'

const require = createRequire(import.meta.url)
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
const gray = (side: number, v: number) => [`/Type /XObject /Subtype /Image /Width ${side} /Height ${side} /ColorSpace /DeviceGray /BitsPerComponent 8`, String.fromCharCode(v).repeat(side * side)] as [string, string]
// (page 1 paints A, B, then C past the image's cap; page 2 paints B again, and D alone)
const PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /A 5 0 R /B 6 0 R /C 7 0 R >> >> /Contents 8 0 R >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /B 6 0 R /D 10 0 R >> >> /Contents 9 0 R >>',
  gray(600, 40), gray(600, 80), gray(700, 120),
  ['', 'q 200 0 0 200 50 500 cm /A Do Q q 200 0 0 200 300 500 cm /B Do Q q 200 0 0 200 50 200 cm /C Do Q'],
  ['', 'q 200 0 0 200 50 500 cm /B Do Q q 200 0 0 200 300 200 cm /D Do Q'],
  gray(600, 160),
])

beforeAll(async () => {
  const source = liteWorkerSource(readFileSync(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'), 'utf8'))
  ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
})

/** each page's images painted, in order: the object each names, and whether its pixels came */
async function painted(maxImageSize: number) {
  const task = getDocument({ data: PDF.slice(), verbosity: 0, maxImageSize })
  const doc = await task.promise
  const out: [string | null, boolean | null][][] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const { fnArray, argsArray } = await page.getOperatorList()
    const args = fnArray.flatMap((f, i) => (f === OPS.paintImageXObject ? [argsArray[i] as [string, number, number]] : []))
    out.push(await Promise.all(args.map(([id]) => new Promise<[string | null, boolean | null]>(r => (id.startsWith('g_') ? page.commonObjs : page.objs).get(id, (v: { data?: unknown } | null) => r([id.includes('~') ? id.slice(id.lastIndexOf('~') + 1) : null, v?.data ? true : null]))))))
  }
  await task.destroy()
  return out
}

describe('the bitmap figures\' opt-in (OCR_IMAGE_PIXELS)', () => {
  it('decodes no image, and names each painted image\'s object, the one two pages paint on both', async () => {
    expect(await painted(OCR_IMAGE_PIXELS)).toEqual([[['5R', null], ['6R', null], ['7R', null]], [['6R', null], ['10R', null]]])
  })
  it('leaves a document opened without it as it was: every image decoded, no object named', async () => {
    expect(await painted(-1)).toEqual([[[null, true], [null, true], [null, true]], [[null, true], [null, true]]])
  })
})
