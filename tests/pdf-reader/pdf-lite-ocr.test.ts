// @vitest-environment node
// The recogniser's opt-in to PDF.js's lite worker (layout/pdf-lite.mjs OCR_IMAGE_PIXELS, PDF-READER §19.15 Bounds): an image of
// its cap's pixels at most decoded, a page's images up to the page's cap in all, in the order the page paints them, each later one
// kept as an operator with no pixels; a page's sum its own. A worker of small caps, this file's alone (each test file its own
// process): two images of 600 × 600 (360,000 pixels), a cap of 400,000 an image and 500,000 a page
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
  const source = liteWorkerSource(readFileSync(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'), 'utf8'), { ocr: { image: 400_000, page: 500_000 } })
  ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
})

/** each page's images painted, in order, by whether their pixels came */
async function decoded(maxImageSize: number) {
  const task = getDocument({ data: PDF.slice(), verbosity: 0, maxImageSize })
  const doc = await task.promise
  const out: (boolean | null)[][] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const { fnArray, argsArray } = await page.getOperatorList()
    const ids = fnArray.flatMap((f, i) => (f === OPS.paintImageXObject ? [(argsArray[i] as [string])[0]] : []))
    out.push(await Promise.all(ids.map(id => new Promise<boolean | null>(r => (id.startsWith('g_') ? page.commonObjs : page.objs).get(id, (v: { data?: unknown } | null) => r(v?.data ? true : null))))))
  }
  await task.destroy()
  return out
}

describe('the recogniser\'s opt-in (OCR_IMAGE_PIXELS)', () => {
  it('decodes an image within its cap and a page\'s images within the page\'s, in the order painted; the next page\'s sum its own', async () => {
    // (page 1: A 360,000, B would make 720,000 past 500,000, C 490,000 past 400,000 alone; page 2: B again, the image PDF.js keeps
    // once for the two pages that paint it, refused on the first and so on both; D 360,000, page 2's sum its own)
    expect(await decoded(OCR_IMAGE_PIXELS)).toEqual([[true, null, null], [null, true]])
  })
  it('leaves a document opened without it as it was: every image decoded', async () => {
    expect(await decoded(-1)).toEqual([[true, true, true], [true, true]])
  })
})
