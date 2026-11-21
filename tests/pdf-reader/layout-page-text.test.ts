// @vitest-environment node
import { readFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { LINK_TEXT_PIXELS, NO_IMAGE_PIXELS } from '@/pdf-reader/engine/layout/pdf-lite.mjs'
import { textRecordDiffers, textRecordOf, textItemsBytes } from '@/pdf-reader/engine/layout/page-text.mjs'
import { installLiteWorker } from './helpers/lite-pdfjs'

// the box's worker, made lite (pdf-lite.mjs: no image's pixels decoded), before this file's first document is opened
await installLiteWorker()

// A page's text as the delta's proof compares it (layout/page-text.mjs): the page's box and one digest of its text items' exact
// values, so that a reading made once (readArxivText's `pageTexts`) stands in for the proof's own of the same document. Any bit of
// any item makes another page's text: one unit in the last place of one number is enough

/** the next float64 above x (one unit in the last place) */
const ulpUp = (x: number) => { const f = new Float64Array([x]), u = new BigInt64Array(f.buffer); u[0]! += x >= 0 ? 1n : -1n; return f[0]! }
const item = (o: Record<string, unknown> = {}) => ({ str: 'Words', dir: 'ltr', width: 31.5, height: 10, transform: [10, 0, 0, 10, 72, 700.25], fontName: 'g_d0_f1', hasEOL: false, ...o })
const page = { view: [0, 0, 612, 792], rotate: 0, userUnit: 1 }
const recordOf = (items: unknown[], p: Record<string, unknown> = page) => textRecordOf(p, { items })

describe('the canonical bytes and the record of a page\'s text', () => {
  it('holds the items with a string, in order, and nothing else of them (a marked content item, the font\'s name)', async () => {
    const a = textItemsBytes([item(), { type: 'beginMarkedContent', id: 'mc0' }, item({ str: 'more' })])
    expect(a.count).toBe(2)
    const b = textItemsBytes([item({ fontName: 'g_d1_f7' }), item({ str: 'more' })])
    expect(Array.from(a.bytes)).toEqual(Array.from(b.bytes))
    expect(await recordOf([item()])).toEqual({ ...page, count: 1, items: expect.stringMatching(/^[0-9a-f]{64}$/) })
  })

  it('any one field of one item in any bit is another page\'s text: each number one ulp up, the string, the direction, the line end', async () => {
    const base = await recordOf([item(), item({ str: 'two' })])
    const t = item().transform as number[]
    const changed = [
      ...t.map((v, i) => item({ transform: t.map((w, k) => (k === i ? ulpUp(v) : w)) })),
      item({ width: ulpUp(31.5) }), item({ height: ulpUp(10) }), item({ str: 'Wordz' }), item({ dir: 'rtl' }), item({ hasEOL: true }),
    ]
    for (const [k, c] of changed.entries()) {
      const other = await recordOf([c, item({ str: 'two' })])
      expect(other.items, String(k)).not.toBe(base.items)
      expect(textRecordDiffers(other, base), String(k)).toBe('its text items differ')
    }
    // (the same items again: the same record; the items' order is the text's)
    expect(textRecordDiffers(await recordOf([item(), item({ str: 'two' })]), base)).toBeNull()
    expect(textRecordDiffers(await recordOf([item({ str: 'two' }), item()]), base)).toBe('its text items differ')
  })

  it('a lone surrogate is itself: never one with U+FFFD, nor with the other half (a UTF-8 encoding would make all three one)', async () => {
    const records = await Promise.all(['x\uD800', 'x\uDC00', 'x\uFFFD'].map(str => recordOf([item({ str })])))
    expect(new Set(records.map(r => r.items)).size).toBe(3)
  })

  it('a string\'s bytes are behind its length: two items never read as one of their strings joined', async () => {
    const one = await recordOf([item({ str: 'ab' }), item({ str: 'c' })]), two = await recordOf([item({ str: 'a' }), item({ str: 'bc' })])
    expect(one.items).not.toBe(two.items)
  })

  it('the box within 0.01, its rotation and unit exactly; the count before the digest; a page not read is no page\'s', async () => {
    const base = await recordOf([item()])
    expect(textRecordDiffers(await recordOf([item()], { ...page, view: [0, 0, 612.005, 792] }), base)).toBeNull()
    expect(textRecordDiffers(await recordOf([item()], { ...page, view: [0, 0, 612.02, 792] }), base)).toBe('its box differs')
    expect(textRecordDiffers(await recordOf([item()], { ...page, rotate: 90 }), base)).toBe('its box differs')
    expect(textRecordDiffers(await recordOf([item()], { ...page, userUnit: 2 }), base)).toBe('its box differs')
    expect(textRecordDiffers(await recordOf([item(), item()]), base)).toBe('2 text items, not 1')
    expect(textRecordDiffers(null, base)).toBe('it was not read')
    expect(textRecordDiffers(base, undefined)).toBe('it was not read')
  })
})

describe('the records of one document opened the box\'s two ways (the lite worker: the draw\'s options, the proof\'s)', () => {
  it('the same records, page for page: the sample paper', async () => {
    const bytes = new Uint8Array(readFileSync(new URL('../fixtures/pdf/sample-1/sample-1.pdf', import.meta.url)))
    const recordsWith = async (o: Record<string, unknown>) => {
      const task = getDocument({ data: bytes.slice(), verbosity: 0, ...o })
      try {
        const doc = await task.promise, out = []
        for (let p = 1; p <= doc.numPages; p++) { const pg = await doc.getPage(p); out.push(await textRecordOf(pg, await pg.getTextContent())) }
        return out
      } finally { await task.destroy() }
    }
    // (the draw's: its links' overlaid text kept, its fonts' properties exported; the proof's: no image's pixels)
    const draw = await recordsWith({ maxImageSize: LINK_TEXT_PIXELS, fontExtraProperties: true }), proof = await recordsWith({ maxImageSize: NO_IMAGE_PIXELS })
    expect(draw).toHaveLength(4)
    expect(draw).toEqual(proof)
  })
})
