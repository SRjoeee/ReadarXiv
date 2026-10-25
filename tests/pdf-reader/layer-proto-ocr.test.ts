import { describe, expect, it, vi } from 'vitest'
import { indexLayout, LAYOUT_SCHEMA, parseLayout } from '@/pdf-reader/engine/layout/file.mjs'
import { fitOcr, piecesOf } from '@/pdf-reader/engine/layer-proto/ocr-fit.mjs'
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
function place({ lines = [[60, 130]], len = 60, bg = 0xfafafa, fg = 0x203040, anchor = 1 }: { lines?: number[][]; len?: number; bg?: number; fg?: number; anchor?: number } = {}) {
  const out = [1, bg, fg, anchor, 7.2]
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
    // (the image's ink is never hidden by a group: it is covered)
    expect([...(run.rows[0] as unknown as { off: Set<string> }).off]).toEqual([])
  })

  it('off: nothing of the label drawn, its image the original\'s', async () => {
    const run = await open({ hiding: hiding(false) }) as Run
    await run.until(1)
    expect(run.ocr).toEqual([])
    expect(run.svgOf(1).querySelector('[data-o]')).toBeNull()
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
    const turned = placeOf([1, 0xffffff, 0, 1, 7.2, 40, 60, 40, 120, 50, 120, 50, 60, 39, 59, 39, 121, 51, 121, 51, 59])!
    const fit = fitOcr(turned, '\u4fe1\u53f7', s => [...s].length, 0.6)
    expect(fit?.lines[0]?.angle).toBe(90)
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

  it('cuts a text between words, and between two characters of a script written without spaces, its closing marks kept', () => {
    expect(piecesOf('Validation loss rate')).toEqual(['Validation ', 'loss ', 'rate'])
    expect(piecesOf('\u9a8c\u8bc1\u3002\u635f\u5931')).toEqual(['\u9a8c', '\u8bc1\u3002', '\u635f', '\u5931'])
  })
})
