import { describe, expect, it, vi } from 'vitest'
import { indexLayout, LAYOUT_SCHEMA, parseLayout } from '@/pdf-reader/engine/layout/file.mjs'
import { fitOcr, layOcr, ocrNeed, ocrSetFactor, piecesOf } from '@/pdf-reader/engine/layer-proto/ocr-fit.mjs'
import { OCR_ANCHORS } from '@/pdf-reader/engine/layout/bitmap-text.mjs'
import { placeOf } from '@/pdf-reader/engine/layer-proto/ocr-rows.mjs'
import { openProto } from '@/pdf-reader/engine/layer-proto/run.mjs'
import { withGroups } from './helpers/groups'

// The bitmap figures' labels drawn by the layer (the content class `ocr`, run.mjs paintOcr, PDF-READER §19.15): each label the
// layer's late chunk carries (its place in its unit: ocr-rows.mjs) drawn where the reader shows figures translated: a patch of
// its ground's colour over each of its lines, every patch of the page before any label's text, then its translation in its
// lines' boxes by the fit rule (ocr-fit.mjs); with the switch off, nothing of it drawn. A page of one paragraph and one label,
// with stubbed canvases and faces (an em a CJK character, half one any other). CJK text is written as \u escapes

vi.hoisted(() => {
  const ctxStub = (canvas?: { width: number; height: number }) => new Proxy({} as Record<string | symbol, unknown>, {
    get(t, k) {
      if (k in t) return t[k]
      if (k === 'measureText') return (s: string) => { const px = Number(/(\d+(?:\.\d+)?)px/.exec(String(t.font ?? ''))?.[1] ?? 10); return { width: [...s].reduce((w, ch) => w + (/[\u3000-\u9fff]/.test(ch) ? px : px / 2), 0), actualBoundingBoxAscent: 0.7 * px, actualBoundingBoxDescent: 0.2 * px, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * px } }
      if (k === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4).fill(255) })
      if (k === 'createImageData') return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4) })
      if (k === 'canvas') return canvas
      return () => {}
    },
    set(t, k, v) { t[k] = v; return true },
  })
  const g = globalThis as Record<string, unknown>
  g.OffscreenCanvas = class { width = 8; height = 8; getContext() { return ctxStub(this) } }
  ;(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = function (this: HTMLCanvasElement) { return ctxStub(this) }
  g.FontFace = class { family: string; constructor(family: string) { this.family = family } load() { return Promise.resolve(this) } }
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add() {}, delete() {}, load: async () => [], check: () => true, ready: Promise.resolve() } })
  g.fetch = async () => ({ ok: false, json: async () => null })
})

const H = 300
/** a label's place on page 1 (ocr-rows.mjs's numbers): its lines, each [quad, patch], 10 thick and `len` long from (x, top) */
function place({ lines = [[60, 130]], len = 60, bg = 0xfafafa, fg = 0x203040, anchor = 1, set = 1 }: { lines?: number[][]; len?: number; bg?: number; fg?: number; anchor?: number; set?: number } = {}) {
  const out = [1, bg, fg, anchor, 7.2, set]
  for (const [x, top] of lines) out.push(x!, top!, x! + len, top!, x! + len, top! - 10, x!, top! - 10, x! - 1, top! + 1, x! + len + 1, top! + 1, x! + len + 1, top! - 11, x! - 1, top! - 11)
  return out
}
const label = (o: Parameters<typeof place>[0] = {}) => ({ id: 1, ...placeOf(place(o))! })
function paper({ text = '\u4fe1\u53f7\u5f3a\u5ea6', src = 'Signal strength', state = 'whole' } = {}) {
  const viewportOf = (scale: number) => ({ width: 300 * scale, height: H * scale, scale, viewBox: [0, 0, 300, H], transform: [scale, 0, 0, -scale, 0, H * scale], convertToViewportPoint: (px: number, py: number) => [px * scale, (H - py) * scale], convertToPdfPoint: (px: number, py: number) => [px / scale, H - py / scale] })
  const items = [{ str: 'Alpha beta gamma', transform: [10, 0, 0, 10, 20, 200], width: 100, height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false }]
  const page = { view: [0, 0, 300, H], getViewport: ({ scale }: { scale: number }) => viewportOf(scale), getTextContent: async () => ({ items, styles: { f1: { fontFamily: 'serif', ascent: 0.7, descent: -0.2 } } }), render: () => ({ promise: Promise.resolve() }), cleanup() {}, commonObjs: { get: () => ({ name: 'NimbusRomNo9L-Regu' }) } }
  const file = {
    schema: LAYOUT_SCHEMA, lineskip: null, layout: '5', pdfjs: '6.3.289', paper: { id: '2610.00001', version: 1, pages: 1 }, left: '', views: [0, 0, 300, 300], fonts: ['NimbusRomNo9L-Regu'],
    units: [], lines: [], frames: [], erase: [], ph: [], labels: [], headings: [], pageText: [], held: [], names: [],
  }
  return {
    doc: withGroups({ numPages: 1, getPage: async () => page }),
    geometry: { schema: 1, kinds: ['para', 'inkocr'], left: { pages: [[0, 0, 300, 300]], units: [[0, 0, [[1, 20, 197.85, 120, 206.83]]]] } },
    units: [
      { kind: 'para', src: 'Alpha beta gamma', state: 'whole', pieces: [{ t: 'text', tr: true, s: '\u6c49\u5b57' }] },
      { kind: 'inkocr', src, state, pieces: state === 'whole' ? [{ t: 'text', tr: true, s: text }] : state === 'kept' ? [{ t: 'text', tr: false, s: src }] : undefined },
    ],
    tex: { index: indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(file)))), pieces: new Map() },
  }
}
const hiding = (shown: boolean, labels = [label()]) => ({ unhidden: () => null, labelKept: () => false, rules: () => undefined, figures: () => [], ocr: (pg: number) => (pg === 1 ? labels : []), figuresShown: shown })
const open = (o: object = {}, p = paper()) => openProto({ ...p, target: 'zh', pages: 1, scale: 1, dpr: 1, copy: false, labels: { captions: null }, ...o } as never)
type Run = Awaited<ReturnType<typeof open>> & { ocr: { id: number; drawn: boolean; why: string | null; text?: string; size?: number; lines?: number }[] }

describe('the bitmap figures\' labels drawn by the layer (run.mjs paintOcr)', () => {
  it('shown: a patch of the ground\'s colour over each line, then the translation in its line\'s box, in its ink\'s colour', async () => {
    const run = await open({ hiding: hiding(true) }) as Run
    await run.until(1)
    // (four CJK characters an em each at 7.2: 28.8 of the line's 60, centred)
    expect(run.ocr).toEqual([expect.objectContaining({ id: 1, drawn: true, why: null, text: '\u4fe1\u53f7\u5f3a\u5ea6', size: 7.2, lines: 1 })])
    const svg = run.svgOf(1)
    const [patches, text] = [...svg.querySelectorAll('[data-o="1"]')]
    expect(patches?.querySelectorAll('polygon')).toHaveLength(1)
    expect(patches?.querySelector('polygon')?.getAttribute('fill')).toBe('#fafafa')
    expect(patches?.querySelector('polygon')?.getAttribute('points')).toBe(`59,${H - 131} 121,${H - 131} 121,${H - 119} 59,${H - 119}`)
    expect(text?.textContent).toBe('\u4fe1\u53f7\u5f3a\u5ea6')
    expect(text?.querySelector('tspan')?.getAttribute('fill')).toBe('#203040')
    // (on the line's middle across it, the em box's middle 0.38 em above the baseline: 130 - 5 - 2.736)
    expect(text?.querySelector('text')?.getAttribute('transform')).toBe(`translate(75.6 ${H - 122.26})`)
    // (the image's ink is never hidden by a group: it is covered; the label is what the page's copy shows of the layer's own, so that
    // a page whose only translation is a bitmap label is shown laid, not as arXiv's page: run.hides)
    expect([...(run.rows[0] as unknown as { off: Set<string> }).off]).toEqual([])
    expect((run as unknown as { hides(pg: number): number }).hides(1)).toBe(1)
  })

  it('off: nothing of the label drawn, its image the original\'s', async () => {
    const run = await open({ hiding: hiding(false) }) as Run
    await run.until(1)
    expect(run.ocr).toEqual([])
    expect(run.svgOf(1).querySelector('[data-o]')).toBeNull()
    expect((run as unknown as { hides(pg: number): number }).hides(1)).toBe(0)
  })

  it('every patch of a page before any label\'s text: no patch covers a translation', async () => {
    const two = [label(), { ...label({ lines: [[60, 136]] }), id: 2 }]
    const p = paper()
    p.units.push({ kind: 'inkocr', src: 'Second', state: 'whole', pieces: [{ t: 'text', tr: true, s: '\u7b2c\u4e8c' }] })
    p.geometry.kinds.push('inkocr')
    const run = await open({ hiding: hiding(true, two) }, p) as Run
    await run.until(1)
    const order = [...run.svgOf(1).querySelectorAll('[data-o]')].map(g => `${g.getAttribute('data-o')}:${g.querySelector('polygon') ? 'patch' : 'text'}`)
    expect(order).toEqual(['1:patch', '2:patch', '1:text', '2:text'])
  })

  it('fills a label of two lines in their order, a word not split; a turned one keeps its turn', async () => {
    const two = open({ hiding: hiding(true, [label({ lines: [[60, 130], [60, 118]], len: 40 })]) }, paper({ text: 'alpha beta gamma delta' }))
    const run = await two as Run
    await run.until(1)
    // (Latin half an em a character: "alpha beta" 10 characters, 36 at 7.2 within 40 × 0.96; "gamma delta" 11, 39.6, past it, shrunk)
    expect(run.ocr[0]).toMatchObject({ drawn: true, lines: 2 })
    const lines = [...run.svgOf(1).querySelectorAll('[data-o="1"] text')].map(t => t.textContent)
    expect(lines).toEqual(['alpha beta', 'gamma delta'])
    const turned = placeOf([1, 0xffffff, 0, 1, 7.2, 2, 40, 60, 40, 120, 50, 120, 50, 60, 39, 59, 39, 121, 51, 121, 51, 59])!
    const fit = fitOcr(turned, '\u4fe1\u53f7', s => [...s].length, 0.6)
    expect(fit?.lines[0]?.angle).toBe(90)
  })

  it('lays a label of lines one above the other as one block: a short translation one line in their middle, a longer one in balanced lines, each within the block\'s longest line', () => {
    // (two centred lines, "Input" 20 long over "Embedding" 40, 10 apart; a character an em at size 7.2)
    const two = placeOf([1, 0xffffff, 0, OCR_ANCHORS.indexOf('centre'), 7.2, 3, 70, 130, 90, 130, 90, 122, 70, 122, 69, 131, 91, 131, 91, 121, 69, 121, 60, 120, 100, 120, 100, 112, 60, 112, 59, 121, 101, 121, 101, 111, 59, 111])!
    const em = (t: string) => [...t].length
    // (four characters, 28.8: past "Input" but within the block's 40: one line, at the two lines' middle, centred)
    const one = layOcr(two, '\u8f93\u5165\u5d4c\u5165', em, 1)!
    expect(one.lines.map(l => l.text)).toEqual(['\u8f93\u5165\u5d4c\u5165'])
    expect(one.lines[0]!.x).toBeCloseTo(80 - 28.8 / 2, 5)
    expect(one.lines[0]!.y).toBeCloseTo(121 - 0.38 * 7.2, 5)
    // (seven characters, 50.4: past one line; two, balanced, 4 and 3, not 5 and 2; at the lines' own middles)
    const both = layOcr(two, '\u8f93\u51fa\uff08\u5411\u53f3\u79fb\u4f4d', em, 1)!
    expect(both.lines.map(l => [...l.text].length)).toEqual([4, 3])
    expect(both.lines.map(l => l.y)).toEqual([126 - 0.38 * 7.2, 116 - 0.38 * 7.2].map(v => expect.closeTo(v, 5)))
    // (more lines than the label has: no fit at this size)
    expect(layOcr(two, '\u4fe1'.repeat(12), em, 1)).toBeNull()
  })

  it('lays a label of a frame not quite square where its quad is, far from the page\'s origin: by the frame\'s own coordinates', () => {
    // (a line at x 500 whose across leans 0.04 off square: its translation starts on the line's start, a third of the way down
    // across it plus the em's middle, wherever on the page)
    const ux = 1, uy = 0, dx = 0.04, dy = -Math.sqrt(1 - 0.04 ** 2), L = 40, T = 10
    const p0: [number, number] = [500, 700], q = [p0, [p0[0] + ux * L, p0[1] + uy * L], [p0[0] + ux * L + dx * T, p0[1] + uy * L + dy * T], [p0[0] + dx * T, p0[1] + dy * T]]
    const flat = q.flat()
    const lean = placeOf([1, 0xffffff, 0, OCR_ANCHORS.indexOf('start'), 7.2, 4, ...flat, ...flat])!
    const fit = layOcr(lean, '\u4fe1\u53f7', s => [...s].length, 1)!
    const at = T / 2 + 0.38 * 7.2
    expect(fit.lines[0]!.x).toBeCloseTo(p0[0] + dx * at, 6)
    expect(fit.lines[0]!.y).toBeCloseTo(p0[1] + dy * at, 6)
  })

  it('leaves the original\'s, its patches not drawn, a translation past the floor, its source again, one kept, none', async () => {
    const long = await open({ hiding: hiding(true) }, paper({ text: '\u4fe1'.repeat(16) })) as Run
    await long.until(1)
    expect(long.ocr[0]).toMatchObject({ drawn: false, why: 'unfit' })
    expect(long.svgOf(1).querySelector('[data-o]')).toBeNull()
    const same = await open({ hiding: hiding(true) }, paper({ text: 'signal  Strength' })) as Run
    await same.until(1)
    expect(same.ocr[0]).toMatchObject({ drawn: false, why: 'same' })
    const none = await open({ hiding: hiding(true) }, paper({ state: 'none' })) as Run
    await none.until(1)
    expect(none.ocr[0]).toMatchObject({ drawn: false, why: 'untranslated' })
    // (a place past its page's view: the original's)
    const off = await open({ hiding: hiding(true, [label({ lines: [[290, 130]] })]) }) as Run
    await off.until(1)
    expect(off.ocr[0]).toMatchObject({ drawn: false, why: 'outside' })
  })

  it('moves nothing else of the page: its markup but the labels\' is the page laid without them, its operations but theirs too', async () => {
    const without = await open({ hiding: hiding(true, []) }) as Run
    await without.until(1)
    const withLabel = await open({ hiding: hiding(true) }) as Run
    await withLabel.until(1)
    const rest = (run: Run) => { const svg = run.svgOf(1); for (const g of svg.querySelectorAll('[data-o]')) g.remove(); return svg.outerHTML }
    expect(withLabel.ocr[0]).toMatchObject({ drawn: true })
    expect(rest(withLabel)).toBe(rest(without))
    const ops = (run: Run) => JSON.stringify(run.rows[0]!.ops.filter(o => o.op !== 'hidden'))
    expect(ops(withLabel)).toBe(ops(without))
  })

  it('a level line\'s words in the page\'s text layer and word table under its unit\'s id (the hover); a line leaning under a degree drawn level', async () => {
    const run = await open({ hiding: hiding(true) }) as Run
    await run.until(1)
    expect(run.textOf(1).items.filter(i => i.from === 'translated' && i.str === '\u4fe1\u53f7\u5f3a\u5ea6').map(i => i.unit)).toEqual([1])
    const table = run.wordsOf(1) as unknown as { spans: [number, number[]][]; tokens: { l: Float32Array } }
    const span = table.spans.find(([id]) => id === 1)
    expect(span?.[1][1]).toBe(1)
    expect(table.tokens.l[span![1][0]!]).toBeCloseTo(75.6, 3)
    // (the recogniser's quad of a level line leans by its pixels: 0.3 over 60, a third of a degree)
    const lean = placeOf([1, 0xffffff, 0, 1, 7.2, 1, 60, 130, 120, 130.3, 120, 120.3, 60, 120, 59, 131, 121, 131.3, 121, 119.3, 59, 119])!
    expect(layOcr(lean, '\u4fe1\u53f7', s => [...s].length, 1)?.lines[0]?.angle).toBe(0)
    const steep = placeOf([1, 0xffffff, 0, 1, 7.2, 1, 60, 130, 120, 132, 120, 122, 60, 120, 59, 131, 121, 133, 121, 121, 59, 119])!
    expect(Math.abs(layOcr(steep, '\u4fe1\u53f7', s => [...s].length, 1)?.lines[0]?.angle ?? 0)).toBeGreaterThan(1)
  })

  it('a translation of two scripts is drawn in runs, its CJK in the CJK face and the rest in the Latin face (the served CJK faces hold no Latin letter)', async () => {
    const faceSources = async (id: string) => [id.startsWith('shs-') ? { url: 'https://faces.invalid/cjk.woff2', ranges: [0x3000, 0x9fff, 0xff00, 0xffef] } : { url: 'https://faces.invalid/latin.woff2', ranges: [32, 126] }]
    const run = await open({ hiding: hiding(true), faceSources }, paper({ text: '\u5bbd\u5ea6 MLP', src: 'Width MLP' })) as Run
    await run.until(1)
    expect(run.ocr[0]).toMatchObject({ drawn: true, why: null, text: '\u5bbd\u5ea6 MLP' })
    const spans = [...run.svgOf(1).querySelectorAll('[data-o="1"] tspan')]
    expect(spans.map(t => t.textContent)).toEqual(['\u5bbd\u5ea6', ' MLP'])
    expect(new Set(spans.map(t => t.getAttribute('class'))).size).toBe(2)
    expect(spans.map(t => t.getAttribute('x'))).toEqual(['0', null])
  })

  it('a set\'s labels at one size: the factor its tightest translation needs, a label of another set its own', async () => {
    // (three labels 40 long: 1 and 2 one set, 3 its own; four CJK characters, 28.8 at 7.2, fit 38.4; eight need 0.66 of it)
    const three = [label({ len: 40, set: 1 }), { ...label({ len: 40, lines: [[60, 150]], set: 1 }), id: 2 }, { ...label({ len: 40, lines: [[60, 170]], set: 3 }), id: 3 }]
    const p = paper()
    p.units.push({ kind: 'inkocr', src: 'Second', state: 'whole', pieces: [{ t: 'text', tr: true, s: '\u4fe1'.repeat(8) }] })
    p.units.push({ kind: 'inkocr', src: 'Third', state: 'whole', pieces: [{ t: 'text', tr: true, s: '\u7b2c\u4e09' }] })
    p.geometry.kinds.push('inkocr', 'inkocr')
    const run = await open({ hiding: hiding(true, three) }, p) as Run
    await run.until(1)
    const size = (id: number) => run.ocr.find(o => o.id === id)?.size
    expect(run.ocr.every(o => o.drawn)).toBe(true)
    expect(size(1)).toBe(size(2))
    expect(size(1)).toBeLessThan(7.2 * 0.7)
    expect(size(3)).toBe(7.2)
    // (the set's factor the least need of those that fit: one past the floor alone is left, the rest kept at theirs)
    expect(ocrSetFactor([1, 0.8, null])).toBe(0.8)
    expect(ocrSetFactor([null])).toBe(1)
    // (a floor off the steps' grid is tested itself: a text that fits at 0.65 and not at 0.68 fits at a floor of 0.65, where the
    // steps from 1 go from 0.68 to 0.64)
    const one = placeOf([1, 0xffffff, 0, 1, 10, 1, 0, 110, 100, 110, 100, 100, 0, 100, 0, 110, 100, 110, 100, 100, 0, 100])!
    const wide = (t: string) => t.length * 0.1
    expect(ocrNeed(one, 'x'.repeat(142), wide, 0.65)).toBe(0.65)
    expect(ocrNeed(one, 'x'.repeat(142), wide, 0.7)).toBeNull()
  })

  it('cuts a text between words, and between two characters of a script written without spaces, its closing marks kept', () => {
    expect(piecesOf('Validation loss rate')).toEqual(['Validation ', 'loss ', 'rate'])
    expect(piecesOf('\u9a8c\u8bc1\u3002\u635f\u5931')).toEqual(['\u9a8c', '\u8bc1\u3002', '\u635f', '\u5931'])
  })
})
