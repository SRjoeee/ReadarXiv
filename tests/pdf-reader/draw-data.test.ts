// @vitest-environment node
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { checkDraw, drawInputsOf, inRuns, unmapped } from '@/pdf-reader/engine/layer-proto/draw.mjs'
import { drawDataOf, drawTextOf, mappedChars } from '@/pdf-reader/engine/pipeline/draw-data.mjs'
import { LINK_TEXT_PIXELS, NO_IMAGE_PIXELS } from '@/pdf-reader/engine/layout/pdf-lite.mjs'
import { installLiteWorker } from './helpers/lite-pdfjs'

// A page's draw geometry from PDF.js's page proxy (pipeline/draw-data.mjs): the calls it makes, the fonts it tells, the pages it sheds

// (the lite worker, as the server runs it, before this file's first document: one opened without its options reads as stock)
beforeAll(async () => { await installLiteWorker() })

const font = (o: Record<string, unknown> = {}) => ({ name: 'CMR10', isType3Font: false, missingFile: false, toUnicode: { _map: ['a', 'b', 'ﬁ'] }, ...o })
const item = (str: string, fontName: string | null, o: Record<string, unknown> = {}) => ({ str, dir: 'ltr', transform: [10, 0, 0, 10, 72, 700], width: 20, height: 10, fontName, hasEOL: false, ...o })
function pageOf(o: { items?: unknown[]; styles?: Record<string, unknown>; fonts?: Record<string, unknown>; annots?: unknown[]; textFails?: unknown; annotFails?: unknown } = {}) {
  const calls: string[] = []
  const page = {
    calls,
    getTextContent: async (...a: unknown[]) => { calls.push(`text${a.length ? '+args' : ''}`); if (o.textFails) throw o.textFails; return { items: o.items ?? [], styles: o.styles ?? {} } },
    getAnnotations: async (...a: unknown[]) => { calls.push(`ann${a.length ? '+args' : ''}`); if (o.annotFails) throw o.annotFails; return o.annots ?? [] },
    commonObjs: { get: (n: string) => { if (!o.fonts || !(n in o.fonts)) throw new Error('not resolved'); return o.fonts[n] } },
  }
  return page
}

describe('mappedChars', () => {
  it('is the layer\'s mappedOf: the characters as written and as NFKC folds them, null with no map', async () => {
    // (the layer opens a canvas at import, as a browser's modules may; node has none)
    ;(globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas ??= class { width = 8; height = 8; getContext() { return null } }
    const { mappedOf } = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
    for (const t of [{ _map: ['a', 'ﬁ', 'ab', 5] }, { _map: [] }, {}, null, undefined, { _map: 'x' }]) {
      expect(mappedChars(t) === null ? null : [...mappedChars(t)!].sort()).toEqual(mappedOf(t) === null ? null : [...mappedOf(t)!].sort())
    }
  })
})

describe('drawDataOf', () => {
  it('calls getTextContent and getAnnotations with their defaults, once each, and tells the items, the fonts it uses and the Link annotations', async () => {
    const page = pageOf({
      items: [item('hello', 'g_f1'), item('', 'g_f1'), item('x', 'g_f2'), item('y', null), item('z', 'unknown')],
      styles: { g_f1: { fontFamily: 'serif' }, g_f2: { fontFamily: 'sans-serif' } },
      fonts: { g_f1: font(), g_f2: font({ name: 'Type3Font', isType3Font: true, toUnicode: undefined }) },
      annots: [{ subtype: 'Link', rect: new Float32Array([1, 2, 3, 4]), dest: 'sec.1', url: null, overlaidText: 'x', borderStyle: { width: 0, style: 1 }, color: new Uint8ClampedArray([0, 255, 0]) }, { subtype: 'Widget', rect: [0, 0, 1, 1] }],
    })
    const { draw, why } = await drawDataOf(page)
    expect(page.calls).toEqual(['text', 'ann'])
    expect(why).toBeNull()
    // (no font's map in its row: each item its own unmapped characters instead, BUNDLE5 14; CMR10 maps a, b and ﬁ, so "hello"'s
    // h, e, l, l and o are unmapped; Type3Font has no map to read, so "x" is not)
    expect(draw!.fonts).toEqual([['CMR10', 'serif', 0], ['Type3Font', 'sans-serif', 1], [null, null, 2]])
    expect(draw!.items.map(i => [i[0], i[8], i[10] ?? null])).toEqual([['hello', 0, [0, 5]], ['', 0, null], ['x', 1, null], ['y', -1, null], ['z', 2, null]])
    // (no glyphs given: no fill told)
    expect(draw!.items[0]).toEqual(['hello', 10, 0, 10, 72, 700, 20, 10, 0, -1, [0, 5]])
    expect(draw!.links).toEqual([[[1, 2, 3, 4], null, null, 'sec.1', 'x', 0, 1, [0, 255, 0]]])
    expect(drawInputsOf(draw!).annots[0]).toMatchObject({ subtype: 'Link', dest: 'sec.1' })
  })

  it('tells each item\'s characters\' fills from the glyphs of the page\'s ink: one fill, runs by code point, none told for an item they do not spell', async () => {
    const page = pageOf({ items: [item('[16]', 'f', { width: 20 }), item('ab', 'f', { transform: [10, 0, 0, 10, 72, 680], width: 10 }), item('cd', 'f', { transform: [10, 0, 0, 10, 72, 660], width: 10 })], styles: { f: { fontFamily: 'serif' } }, fonts: { f: font() } })
    const g = (u: string, x: number, y: number, fill: number) => ({ u, x0: x, x1: x + 5, y, size: 10, fill })
    const glyphs = [g('[', 72, 700, 0), g('1', 77, 700, 0xff), g('6', 82, 700, 0xff), g(']', 87, 700, 0), g('a', 72, 680, 0x0c5388), g('b', 77, 680, 0x0c5388), g('c', 72, 660, 0)]
    const { draw } = await drawDataOf(page, null, null, glyphs)
    expect(draw!.items.map(i => i[9])).toEqual([[0, 0, 1, 0xff, 3, 0], 0x0c5388, -1])
  })

  it('tells a font with no map (null) apart from one with an empty map, an error font as 2, and a font the style table lacks as a font object-less row', async () => {
    const page = pageOf({
      items: [item('a', 'n'), item('b', 'e'), item('c', 'm'), item('d', 'none')],
      styles: { n: { fontFamily: 'serif' }, e: { fontFamily: 'serif' }, m: { fontFamily: 'serif' } },
      fonts: { n: font({ toUnicode: {} }), e: { fontName: 'error', loadedName: 'e' }, m: font({ toUnicode: { _map: [] } }) },
    })
    const { draw } = await drawDataOf(page)
    expect(draw!.fonts.map(f => f[2])).toEqual([0, 2, 0, 2])
    expect(draw!.items.map(i => i[8])).toEqual([0, 1, 2, 3])
    // (a font of no map, an error font and a font object-less row read none of a map; an empty map leaves every character unmapped)
    expect(draw!.items.map(i => i[10] ?? null)).toEqual([null, null, [0, 1], null])
  })

  it('ships nothing for a page that uses a font it cannot tell the same on every host: not embedded, not Type3', async () => {
    const page = pageOf({ items: [item('a', 'f')], styles: { f: { fontFamily: 'serif' } }, fonts: { f: font({ missingFile: true }) } })
    expect(await drawDataOf(page)).toEqual({ draw: null, why: 'font' })
    const type3 = pageOf({ items: [item('a', 'f')], styles: { f: {} }, fonts: { f: font({ isType3Font: true, missingFile: true }) } })
    expect((await drawDataOf(type3)).draw).not.toBeNull()
  })

  it('tells a Type3 font\'s map as the live reading does (fontMappedOf): its characters, null with none, the same under any type3 row', async () => {
    const page = pageOf({
      items: [item('a', 'm'), item('b', 'n'), item('c', 'e'), item('d', 'z')],
      styles: { m: { fontFamily: 'serif' }, n: { fontFamily: 'serif' }, e: { fontFamily: 'serif' }, z: { fontFamily: 'serif' } },
      fonts: {
        m: font({ name: 'T3', isType3Font: true, toUnicode: { _map: ['a', 'ﬁ'] } }),
        n: font({ name: 'T3b', isType3Font: true, toUnicode: undefined, missingFile: false }),
        e: { fontName: 'error', loadedName: 'e' },
        z: font({ name: 'T3c', isType3Font: true, toUnicode: { _map: [] } }),
      },
    })
    const { draw, why } = await drawDataOf(page)
    expect(why).toBeNull()
    expect(draw!.fonts.map(f => f[2])).toEqual([1, 1, 2, 1])
    // (T3 maps a: "a" read; T3b has none to read; an error font none; T3c's empty map leaves "d" unmapped)
    expect(draw!.items.map(i => i[10] ?? null)).toEqual([null, null, null, [0, 1]])
  })

  it('ships nothing when a call fails, or a font was opened without its extra properties; a memory error is thrown', async () => {
    expect(await drawDataOf(pageOf({ textFails: new Error('x') }))).toEqual({ draw: null, why: 'read' })
    expect(await drawDataOf(pageOf({ annotFails: new Error('x') }))).toEqual({ draw: null, why: 'read' })
    const bare = pageOf({ items: [item('a', 'f')], styles: { f: {} }, fonts: { f: { name: 'F', isType3Font: false, missingFile: false } } })
    expect(await drawDataOf(bare)).toEqual({ draw: null, why: 'props' })
    await expect(drawDataOf(pageOf({ textFails: Object.assign(new RangeError('Array buffer allocation failed'), {}) }))).rejects.toThrow(RangeError)
  })

  it('writes an item\'s origin, width and height and a link\'s numbers at a thousandth of a point, its fills read of them as they are; its scale as it is', async () => {
    const page = pageOf({
      items: [item('ab', 'f', { transform: [9.962599754333496, 0, 0, 9.962599754333496, 108.00000000000001, 701.3779999999999], width: 20.12345, height: 9.962599754333496 })],
      styles: { f: { fontFamily: 'serif' } }, fonts: { f: font() },
      annots: [{ subtype: 'Link', rect: new Float32Array([123.311, 115.328, 129.288, 127.821]), quadPoints: new Float32Array([1.00049, 2, 3, 4, 5, 6, 7, 8.0006]), dest: 'x', url: null, overlaidText: null, borderStyle: { width: 0.50049, style: 1 }, color: null }],
    })
    // (a glyph a hair inside the item's own place: the fills read of the item as PDF.js gives it)
    const { draw } = await drawDataOf(page, null, null, [{ u: 'a', x0: 108.00000000000001, x1: 118, y: 701.3779999999999, size: 9.962599754333496, fill: 0xff }, { u: 'b', x0: 118, x1: 128.12, y: 701.3779999999999, size: 9.962599754333496, fill: 0xff }])
    expect(draw!.items[0]!.slice(1, 10)).toEqual([9.962599754333496, 0, 9.962599754333496, 108, 701.378, 20.123, 9.963, 0, 0xff])
    expect(draw!.links[0]![0]).toEqual([123.311, 115.328, 129.288, 127.821])
    expect(draw!.links[0]![1]).toEqual([1, 2, 3, 4, 5, 6, 7, 8.001])
    expect(draw!.links[0]![5]).toBe(0.5)
  })

  it('sheds a page past a cap, and ships an empty page as a draw with empty arrays', async () => {
    const many = pageOf({ items: Array.from({ length: 6001 }, () => item('', null)) })
    expect(await drawDataOf(many)).toEqual({ draw: null, why: 'shed' })
    expect((await drawDataOf(pageOf())).draw).toEqual({ fonts: [], items: [], links: [] })
  })

  it('takes a rotated page, an explicit dest and quads as they come', async () => {
    const page = pageOf({
      items: [item('v', null, { transform: [0, 10, -10, 0, 100, 100] })],
      annots: [{ subtype: 'Link', rect: [0, 0, 5, 5], quadPoints: new Float32Array(8).fill(2), dest: [{ num: 4, gen: 0 }, { name: 'XYZ' }, 72, 600, null], borderStyle: undefined }],
    })
    const { draw } = await drawDataOf(page)
    expect(draw!.items[0]).toEqual(['v', 0, 10, 0, 100, 100, 20, 10, -1, -1])
    expect(draw!.links[0]![3]).toEqual([0, 4, 0, 'XYZ', 72, 600, null])
    expect(draw!.links[0]![1]).toHaveLength(8)
    expect(drawInputsOf(draw!).annots[0]!.dest).toEqual([{ num: 4, gen: 0 }, { name: 'XYZ' }, 72, 600, null])
  })
})

describe('drawDataOf over a real PDF (the sample paper), opened as the prepare opens it', () => {
  const dir = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
  const bytes = new Uint8Array(readFileSync(new URL('../fixtures/pdf/sample-1/sample-1.pdf', import.meta.url)))
  const open = async (extra: boolean, maxImageSize: number | null = null) => {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    return getDocument({ data: bytes.slice(), verbosity: 0, cMapUrl: join(dir, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(dir, 'standard_fonts/'), ...(extra ? { fontExtraProperties: true } : {}), ...(maxImageSize === null ? {} : { maxImageSize }) }).promise
  }

  it('tells every page: its items as getTextContent has them, its embedded fonts, each item\'s unmapped characters of their maps, its Link annotations', async () => {
    const doc = await open(true)
    const { fontMappedOf } = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      await page.getOperatorList()
      const { draw, why } = await drawDataOf(page)
      expect(why, `page ${p}`).toBeNull()
      expect(draw!.items).toHaveLength((await page.getTextContent()).items.filter(i => 'str' in i).length)
      expect(draw!.fonts.length).toBeGreaterThan(0)
      expect(draw!.fonts.every(f => f[2] === 0 && f.length === 3)).toBe(true)
      // (each item's unmapped characters are what the live reading reads of its font's map: layer2.mjs fontMappedOf, unmapped)
      const tc = await page.getTextContent(), its = tc.items.filter(i => 'str' in i) as { str: string; fontName: string }[]
      its.forEach((it, k) => {
        const mapped = fontMappedOf(page.commonObjs.get(it.fontName)), runs = (draw!.items[k]![10] as number[] | undefined) ?? null
        expect([...it.str].map((ch, j) => /\S/.test(ch) && inRuns(runs, j)), `page ${p} item ${k}`).toEqual([...it.str].map(ch => unmapped(ch, mapped)))
      })
      expect(() => checkDraw(JSON.parse(JSON.stringify(draw)))).not.toThrow()
    }
    await doc.loadingTask.destroy()
  })

  it('ships each link\'s overlaid text as the stock worker makes it, on the lite worker opened for the draw (LINK_TEXT_PIXELS); none under NO_IMAGE_PIXELS', async () => {
    const [stock, links, lite] = [await open(true), await open(true, LINK_TEXT_PIXELS), await open(true, NO_IMAGE_PIXELS)]
    let texts = 0
    for (let p = 1; p <= stock.numPages; p++) {
      const want = (await (await stock.getPage(p)).getAnnotations()).filter(a => a.subtype === 'Link').map(a => a.overlaidText ?? null)
      const drawOf = async (doc: typeof stock) => { const page = await doc.getPage(p); await page.getOperatorList(); return (await drawDataOf(page)).draw! }
      const got = await drawOf(links), bare = await drawOf(lite)
      expect(got.links.map(l => l[4]), `page ${p}`).toEqual(want)
      expect(drawInputsOf(got).annots.map(a => a.overlaidText)).toEqual(want)
      expect(bare.links.map(l => l[4])).toEqual(want.map(() => null))
      // (the rest of the draw the same)
      expect(JSON.stringify({ ...got, links: got.links.map(l => l.toSpliced(4, 1)) })).toBe(JSON.stringify({ ...bare, links: bare.links.map(l => l.toSpliced(4, 1)) }))
      texts += want.filter(t => typeof t === 'string' && t.length > 0).length
    }
    expect(texts, 'links with text under them on the sample').toBeGreaterThan(0)
    for (const d of [stock, links, lite]) await d.loadingTask.destroy()
  })

  it('takes the text step T read (drawTextOf of the same getTextContent): the same draw as one that reads the page\'s text itself', async () => {
    const doc = await open(true)
    const first = []
    for (let p = 1; p <= doc.numPages; p++) first.push(drawTextOf(await (await doc.getPage(p)).getTextContent()))
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      await page.getOperatorList()
      const own = await drawDataOf(page), given = await drawDataOf(page, null, first[p - 1])
      expect(given.text).toBe(own.text)
      expect(given.draw).toEqual(own.draw)
    }
    await doc.loadingTask.destroy()
  })

  it('a document opened without fontExtraProperties tells no page (the setup fault, named), and the operator lists are the same bytes either way', async () => {
    const [on, off] = [await open(true), await open(false)]
    for (let p = 1; p <= on.numPages; p++) {
      const [a, b] = [await on.getPage(p), await off.getPage(p)]
      const [la, lb] = [await a.getOperatorList(), await b.getOperatorList()]
      // (a font's loaded name carries its document's number: g_d0_f1, g_d1_f1)
      const same = (l: { fnArray: unknown; argsArray: unknown }) => JSON.stringify([l.fnArray, l.argsArray]).replace(/g_d\d+_/g, 'g_d_')
      expect(same(la)).toBe(same(lb))
      expect((await drawDataOf(b)).why).toBe('props')
    }
    await on.loadingTask.destroy()
    await off.loadingTask.destroy()
  })
})
