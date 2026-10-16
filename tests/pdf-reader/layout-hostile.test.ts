import { deflateSync } from 'node:zlib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { BOXES_CAP, GLYPHS_PAGE, OPS_CAP, pageInk } from '@/pdf-reader/engine/layout/ink.mjs'
import { installLiteWorker, LITE } from './helpers/lite-pdfjs'

// A page's ink is bounded whatever the page (E2b stage 1, the per-part memory ceiling): what the maker holds of a page is its
// glyphs, GLYPHS_PAGE at most, and its boxes, one an operation, OPS_CAP operations at most; past either the page is capped
// (dark: its units stay the original's, that page alone). Each page here is a hostile one, read by PDF.js as the server reads
// arXiv's PDF: the lite worker, no image's pixels decoded (layout/pdf-lite.mjs)

const latin1 = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0))
/** a PDF of `pages` content streams (each a string or the bytes of one), every page with font F1 and image Im1: an image of
 *  8000 by 8000 RGB pixels (192 MB decoded), its zeros deflated */
function hostile(pages: string[]): Uint8Array {
  const image = deflateSync(new Uint8Array(8000 * 8000 * 3))
  const parts: (string | Uint8Array)[] = []
  const offsets: number[] = []
  let size = 0
  const push = (x: string | Uint8Array) => { parts.push(x); size += typeof x === 'string' ? x.length : x.length }
  push('%PDF-1.7\n')
  const objs: (string | [string, Uint8Array])[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + 2 * i} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ['/Type /XObject /Subtype /Image /Width 8000 /Height 8000 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode', new Uint8Array(image)],
  ]
  pages.forEach((content, i) => {
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> /XObject << /Im1 4 0 R >> >> /Contents ${6 + 2 * i} 0 R >>`)
    objs.push(['', latin1(content)])
  })
  objs.forEach((o, i) => {
    offsets.push(size)
    if (typeof o === 'string') push(`${i + 1} 0 obj\n${o}\nendobj\n`)
    else { push(`${i + 1} 0 obj\n<< ${o[0]} /Length ${o[1].length} >>\nstream\n`); push(o[1]); push('\nendstream\nendobj\n') }
  })
  const at = size
  push(`xref\n0 ${objs.length + 1}\n0000000000 65535 f\r\n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n\r\n`).join('')}`)
  push(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`)
  const out = new Uint8Array(size)
  let o = 0
  for (const x of parts) { out.set(typeof x === 'string' ? latin1(x) : x, o); o += x.length }
  return out
}

describe('a hostile page\'s ink is bounded (the per-part memory ceiling)', () => {
  it('an image painted 100,000 times: one box an operation, within OPS_CAP, no pixel decoded; 150,001 operations: capped', async () => {
    await installLiteWorker()
    const paints = (n: number) => `q 1 0 0 1 72 72 cm ${'/Im1 Do '.repeat(n)}Q`
    const data = hostile([paints(100_000), paints(OPS_CAP)])
    const before = process.memoryUsage().arrayBuffers
    const task = getDocument({ data, verbosity: 0, ...LITE }), doc = await task.promise
    const inks = []
    let peak = 0
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const ops = await page.getOperatorList()
      inks.push({ ops: ops.fnArray.length, ...pageInk(OPS, ops, page.commonObjs, { rotate: 0, glyphsMax: GLYPHS_PAGE }) })
      peak = Math.max(peak, process.memoryUsage().arrayBuffers - before)
      page.cleanup()
    }
    await task.destroy()
    // (the 192 MB of the image's pixels never decoded: the lite worker)
    expect(peak).toBeLessThan(64 * 2 ** 20)
    const [many, past] = inks
    expect(many!.capped).toBe(false)
    expect(many!.boxes.length / 4).toBe(100_000)
    expect(many!.ops).toBeLessThanOrEqual(OPS_CAP)
    expect(past!.ops).toBeGreaterThan(OPS_CAP)
    expect(past!.capped).toBe(true)
    // capped, a page's boxes are still those of the operations read, OPS_CAP at most
    expect(past!.boxes.length / 4).toBeLessThanOrEqual(OPS_CAP)
  }, 120_000)

  it('one showText of twice GLYPHS_PAGE glyphs: the reading stops at GLYPHS_PAGE, the page capped', async () => {
    await installLiteWorker()
    const data = hostile([`BT /F1 1 Tf 72 700 Td (${'x'.repeat(2 * GLYPHS_PAGE)}) Tj ET`])
    const task = getDocument({ data, verbosity: 0, ...LITE }), doc = await task.promise
    const page = await doc.getPage(1)
    const ops = await page.getOperatorList()
    const got = pageInk(OPS, ops, page.commonObjs, { rotate: 0, glyphsMax: GLYPHS_PAGE })
    page.cleanup()
    await task.destroy()
    expect(ops.fnArray.length).toBeLessThan(10)
    expect(got.capped).toBe(true)
    expect(got.glyphs).toHaveLength(GLYPHS_PAGE)
  }, 120_000)

  // ---- an operation's many: what one operation places is bounded within it (a list as any caller may give: PDF.js's own for
  // getOperatorList holds no repeat or group, its queue optimiser off for it, but a run of glyphs set turned it does hold)
  const font = { name: 'F1', loadedName: 'F1', ascent: 0.8, descent: -0.2, fontMatrix: [0.001, 0, 0, 0.001, 0, 0] }
  const objs = { get: (id: string) => (id === 'F1' ? font : null), has: () => false }

  it('one image repeat placing BOXES_CAP + 1 images: the boxes stop at BOXES_CAP, the page capped', () => {
    // (one operation, well within OPS_CAP)
    const at = new Float32Array(2 * (BOXES_CAP + 1)).map((_, i) => (i % 2 ? 100 : 72) + (i >> 1) * 1e-4)
    const got = pageInk(OPS, { fnArray: [OPS.paintImageXObjectRepeat], argsArray: [['img', 1, 1, at]] }, objs, { rotate: 0, glyphsMax: GLYPHS_PAGE })
    expect(got.capped).toBe(true)
    expect(got.boxes.length / 4).toBe(BOXES_CAP)
    // a mask group and an inline image group alike
    const images = Array.from({ length: BOXES_CAP + 1 }, () => ({ transform: [1, 0, 0, 1, 72, 100] }))
    for (const [fn, args] of [[OPS.paintImageMaskXObjectGroup, [images]], [OPS.paintInlineImageXObjectGroup, [null, images]]] as const) {
      const g = pageInk(OPS, { fnArray: [fn], argsArray: [args] }, objs, { rotate: 0 })
      expect(g.capped).toBe(true)
      expect(g.boxes.length / 4).toBe(BOXES_CAP)
    }
  })

  it('one showText of BOXES_CAP + 1 glyphs set turned (a box each, no glyph): the boxes stop at BOXES_CAP, the page capped', () => {
    let read = 0
    const glyph = { unicode: 'x', fontChar: 'x', isSpace: false, get width() { read++; return 500 } }
    const ops = { fnArray: [OPS.setFont, OPS.setTextMatrix, OPS.showText], argsArray: [['F1', 10], [[0, 1, -1, 0, 300, 300]], [new Array(BOXES_CAP + 1).fill(glyph)]] }
    const got = pageInk(OPS, ops, objs, { rotate: 0, glyphsMax: GLYPHS_PAGE })
    expect(got.glyphs).toHaveLength(0)
    expect(got.capped).toBe(true)
    expect(got.boxes.length / 4).toBe(BOXES_CAP)
    // the operation's glyphs past the cap not walked
    expect(read).toBeLessThanOrEqual(BOXES_CAP + 1)
  })

  it('one showText past glyphsMax: the walk stops inside the operation, at the glyph past it', () => {
    let read = 0
    const glyph = { unicode: 'x', fontChar: 'x', isSpace: false, get width() { read++; return 500 } }
    const ops = { fnArray: [OPS.setFont, OPS.showText], argsArray: [['F1', 10], [new Array(1000).fill(glyph)]] }
    const got = pageInk(OPS, ops, objs, { rotate: 0, glyphsMax: 10 })
    expect(got.capped).toBe(true)
    expect(got.glyphs).toHaveLength(10)
    // (each glyph's width is read for its advance and its outline's key: twice a glyph walked, eleven walked)
    expect(read).toBeLessThanOrEqual(2 * 11)
    // a Type 3 font and a font PDF.js could not read alike
    for (const kind of [{ isType3Font: true }, { isInvalidPDFjsFont: true }]) {
      read = 0
      const f = { ...font, ...kind }
      const g = pageInk(OPS, ops, { get: (id: string) => (id === 'F1' ? f : null) }, { rotate: 0, glyphsMax: 10 })
      expect(g.capped).toBe(true)
      expect(read).toBeLessThanOrEqual(2 * 11)
    }
  })
})
