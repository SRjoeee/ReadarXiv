// @vitest-environment node
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { outlineBox } from '@/pdf-reader/engine/layout/ink.mjs'
import { float32Outlines, LITE_PDFJS, liteWorkerSource, NO_IMAGE_PIXELS } from '@/pdf-reader/engine/layout/pdf-lite.mjs'

// A glyph's outline as the engine's ink reading takes it (layout/ink.mjs outlineBox) is Float32 whatever the runtime
// (layout/pdf-lite.mjs float32Outlines): PDF.js 6.3.289 takes a Float16Array on both of its sides where the runtime has one, and
// half precision moves a glyph's ink in its last places. This file runs PDF.js where it takes one: the runtime's own (Node 26), or
// on Node 22, which has none, a stand-in set before PDF.js is loaded (its API module asks once, as it loads)

const runtimeHasOne = typeof (globalThis as { Float16Array?: unknown }).Float16Array === 'function'
if (!runtimeHasOne) (globalThis as { Float16Array?: unknown }).Float16Array = class Float16Array extends Float32Array {}
const api = await import('pdfjs-dist/legacy/build/pdf.mjs')
const require = createRequire(import.meta.url)
const PDFJS_DIR = dirname(require.resolve('pdfjs-dist/package.json'))
// (the module of the lite worker's text, made the process's PDF.js worker once: PDF.js keeps the first it takes)
const worker = await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(liteWorkerSource(readFileSync(join(PDFJS_DIR, 'legacy/build/pdf.worker.mjs'), 'utf8'), { version: LITE_PDFJS })).toString('base64')}`)
;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker

/** a page of one glyph, "R" in Times-Roman: PDF.js draws it from its Type 1 standard font (1000 units an em), whose points are no
 *  halves' (17/1000 em is 0.016998291015625 in half precision) */
const TIMES_R = (() => {
  const body = 'BT /F1 12 Tf 72 700 Td (R) Tj ET'
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>', `<< /Length ${body.length} >>\nstream\n${body}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>']
  let out = '%PDF-1.7\n'
  const at: number[] = []
  objects.forEach((o, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f\r\n${at.map(n => `${String(n).padStart(10, '0')} 00000 n\r\n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new Uint8Array(Buffer.from(out, 'latin1'))
})()
/** the glyph's outline as PDF.js gives it (its constructor's name) and its ink as the engine reads it, read as the box reads a page */
async function outlineOf() {
  const task = api.getDocument({ data: TIMES_R.slice(), verbosity: 0, maxImageSize: NO_IMAGE_PIXELS, standardFontDataUrl: join(PDFJS_DIR, 'standard_fonts/'), useSystemFonts: false })
  try {
    const page = await (await task.promise).getPage(1)
    const list = await page.getOperatorList()
    const name = (list.argsArray[list.fnArray.indexOf(api.OPS.setFont)] as [string])[0]
    const glyph = (list.argsArray[list.fnArray.indexOf(api.OPS.showText)] as [{ fontChar: string }[]])[0][0]!
    const path = (page.commonObjs.get(`${name}_path_${glyph.fontChar}`) as { path: ArrayLike<number> }).path
    return { kind: path.constructor.name, box: outlineBox(page.commonObjs, page.commonObjs.get(name), glyph.fontChar) }
  } finally { await task.destroy() }
}

describe('a glyph\'s outline, PDF.js\'s typed array', () => {
  it('is half precision, stock, where the runtime has a Float16Array (the case float32Outlines is for)', async () => {
    expect((await outlineOf()).kind).toBe('Float16Array')
  })

  it('is Float32 on both sides once float32Outlines has made it so, its points Float32\'s: the ink Node 22 reads', async () => {
    // (a module without a FeatureTest on either side: refused, and neither side changed)
    expect(() => float32Outlines(api, {})).toThrow(TypeError)
    expect(() => float32Outlines({}, worker)).toThrow(TypeError)
    expect(api.FeatureTest.isFloat16ArraySupported).toBe(true)
    float32Outlines(api, worker)
    const { kind, box } = await outlineOf()
    expect(kind).toBe('Float32Array')
    // ("R"'s extremes, 17 to 659 by 0 to 662 thousandths of an em, as a Float32 holds each)
    expect(box).toEqual([Math.fround(0.017), 0, Math.fround(0.659), Math.fround(0.662)])
  })
})
