import { describe, expect, it, vi } from 'vitest'
import { indexLayout, LAYOUT_SCHEMA, parseLayout } from '@/pdf-reader/engine/layout/file.mjs'
import { fitFigure, sameAsSource } from '@/pdf-reader/engine/layer-proto/figure-fit.mjs'
import { openProto } from '@/pdf-reader/engine/layer-proto/run.mjs'
import { withGroups } from './helpers/groups'

// The figures' text drawn by the layer (the content class `figures`, run.mjs paintFigures): each figure unit a page's parts carry
// (its row: figure-rows.mjs) drawn in its translation where the reader shows figures translated, its ink hidden by its own group
// (`f<k>`), its words in its run's box by the fit rule (figure-fit.mjs), turned as it was; with the switch off, left the
// original's from the same rows. A page of one paragraph and one figure unit, with stubbed canvases and faces (an em a CJK
// character, half one any other). CJK text is written as \u escapes

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
/** a figure unit's row as a part's reader gives it (figure-rows.mjs checkFigures): unit 1, group f0, its run at (60, 120), 60 long */
const row = (o: Record<string, unknown> = {}) => ({ id: 1, group: 'f0', page: 1, x: 60, y: 120, ux: 1, uy: 0, length: 60, size: 10, ascent: 0.88, descent: -0.2, anchor: 'centre', fill: 0x2040a0, font: 'ABCDEF+ArialMT', ...o })
/** the page: a paragraph's line at y = 200 the layout file does not lay, and the figure's unit (its translation `text`) */
function paper({ text = '\u4fe1\u53f7\u5f3a\u5ea6', src = 'Signal strength', state = 'whole' } = {}) {
  const viewportOf = (scale: number) => ({ width: 300 * scale, height: H * scale, scale, transform: [scale, 0, 0, -scale, 0, H * scale], convertToViewportPoint: (px: number, py: number) => [px * scale, (H - py) * scale], convertToPdfPoint: (px: number, py: number) => [px / scale, H - py / scale] })
  const items = [{ str: 'Alpha beta gamma', transform: [10, 0, 0, 10, 20, 200], width: 100, height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false }]
  const page = { view: [0, 0, 300, H], getViewport: ({ scale }: { scale: number }) => viewportOf(scale), getTextContent: async () => ({ items, styles: { f1: { fontFamily: 'serif', ascent: 0.7, descent: -0.2 } } }), render: () => ({ promise: Promise.resolve() }), cleanup() {}, commonObjs: { get: () => ({ name: 'NimbusRomNo9L-Regu' }) } }
  const file = {
    schema: LAYOUT_SCHEMA, lineskip: null, layout: '5', pdfjs: '6.3.289', paper: { id: '2610.00001', version: 1, pages: 1 }, left: '', views: [0, 0, 300, 300], fonts: ['NimbusRomNo9L-Regu'],
    units: [], lines: [], frames: [], erase: [], ph: [], labels: [], headings: [], pageText: [], held: [], names: [],
  }
  return {
    doc: withGroups({ numPages: 1, getPage: async () => page }),
    geometry: { schema: 1, kinds: ['para', 'inkfigures'], left: { pages: [[0, 0, 300, 300]], units: [[0, 0, [[1, 20, 197.85, 120, 206.83]]]] } },
    units: [
      { kind: 'para', src: 'Alpha beta gamma', state: 'whole', pieces: [{ t: 'text', tr: true, s: '\u6c49\u5b57' }] },
      { kind: 'inkfigures', src, state, pieces: state === 'whole' ? [{ t: 'text', tr: true, s: text }] : undefined },
    ],
    tex: { index: indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(file)))), pieces: new Map() },
  }
}
const hiding = (shown: boolean, rows = [row()]) => ({ unhidden: () => null, labelKept: () => false, rules: () => undefined, figures: (pg: number) => (pg === 1 ? rows : []), figuresShown: shown })
const open = (o: object = {}, p = paper()) => openProto({ ...p, target: 'zh', pages: 1, scale: 1, dpr: 1, copy: false, labels: { captions: null }, ...o } as never)
type Run = Awaited<ReturnType<typeof open>> & { figures: { id: number; group: string; drawn: boolean; why: string | null; text?: string; size?: number; x?: number; y?: number; w?: number }[] }
const offOf = (run: Run) => [...(run.rows[0] as unknown as { off: Set<string> }).off]

describe('the figures\' text drawn by the layer (run.mjs paintFigures)', () => {
  it('shown: the unit drawn in its translation in its run\'s box, its anchor kept, its group hidden, in its fill', async () => {
    const run = await open({ hiding: hiding(true) }) as Run
    await run.until(1)
    // (four CJK characters an em each at 10: 40 of the box's 60, centred: from 70)
    expect(run.figures).toEqual([expect.objectContaining({ id: 1, group: 'f0', drawn: true, why: null, text: '\u4fe1\u53f7\u5f3a\u5ea6', size: 10, x: 70, y: 120, w: 40 })])
    expect(offOf(run)).toContain('f0')
    const g = run.svgOf(1).querySelector('[data-f="f0"]')
    expect(g?.textContent).toBe('\u4fe1\u53f7\u5f3a\u5ea6')
    expect(g?.querySelector('tspan')?.getAttribute('fill')).toBe('#2040a0')
    expect(g?.querySelector('text')?.getAttribute('transform')).toBe(`translate(70 ${H - 120})`)
    expect(run.rows[0]!.ops.some(o => o.op === 'hidden')).toBe(true)
    // (its words in the page's text layer under its unit's id, as a source unit's are: the hover lights it and its original)
    const words = run.textOf(1).items.filter(i => i.from === 'translated' && i.str === '\u4fe1\u53f7\u5f3a\u5ea6')
    expect(words.map(i => i.unit)).toEqual([1])
    // (and in the page's word table under its id, one token over its box: the hover's right pane)
    const table = run.wordsOf(1) as unknown as { spans: [number, number[]][]; tokens: { l: Float32Array } }
    const span = table.spans.find(([id]) => id === 1)
    expect(span?.[1][1]).toBe(1)
    expect(table.tokens.l[span![1][0]!]).toBeCloseTo(70, 3)
  })

  it('off: the same row taken, nothing of the figure drawn nor hidden: its ink the original\'s', async () => {
    const run = await open({ hiding: hiding(false) }) as Run
    await run.until(1)
    expect(run.figures).toEqual([])
    expect(offOf(run)).not.toContain('f0')
    expect(run.svgOf(1).querySelector('[data-f]')).toBeNull()
  })

  it('a turned label keeps its turn; one set from its end keeps its end', async () => {
    const turned = await open({ hiding: hiding(true, [row({ ux: 0, uy: 1, x: 40, y: 80, anchor: 'end' })]) }) as Run
    await turned.until(1)
    // (40 of 60 from its end: its start 20 along its direction, up the page)
    expect(turned.figures[0]).toMatchObject({ drawn: true, x: 40, y: 100 })
    expect(turned.svgOf(1).querySelector('[data-f="f0"] text')?.getAttribute('transform')).toBe(`translate(40 ${H - 100}) rotate(-90)`)
    // (its words in no text layer, which holds upright text alone: the figure's float lights it, figure-rows.mjs levelRun)
    expect(turned.textOf(1).items.some(i => i.unit === 1)).toBe(false)
    expect((turned.wordsOf(1) as unknown as { spans: [number, number[]][] }).spans.some(([id]) => id === 1)).toBe(false)
  })

  it('leaves the original\'s a translation that would pass the floor, one that says its source again, one with no group', async () => {
    // (twelve characters, 120 at 10, in a box of 60: half the size, past the floor 0.6)
    const long = await open({ hiding: hiding(true) }, paper({ text: '\u4fe1'.repeat(12) })) as Run
    await long.until(1)
    expect(long.figures[0]).toMatchObject({ drawn: false, why: 'unfit' })
    expect(offOf(long)).not.toContain('f0')
    const same = await open({ hiding: hiding(true) }, paper({ text: 'signal  Strength' })) as Run
    await same.until(1)
    expect(same.figures[0]).toMatchObject({ drawn: false, why: 'same' })
    const p = paper()
    const missing = await open({ hiding: hiding(true), doc: withGroups({ numPages: 1, getPage: (p.doc as { getPage: () => unknown }).getPage }, { missing: ['f0'] }) }, p) as Run
    await missing.until(1)
    expect(missing.figures[0]).toMatchObject({ drawn: false, why: 'unhidden' })
  })

  it('no row of a translation: its ink the original\'s', async () => {
    const run = await open({ hiding: hiding(true) }, paper({ state: 'none' })) as Run
    await run.until(1)
    expect(run.figures[0]).toMatchObject({ drawn: false, why: 'untranslated' })
  })

  it('a page of figures alone is ready once its figures are painted, not while a face they wait for loads', async () => {
    let release = () => {}
    const held = new Promise<void>(r => { release = r })
    const fonts = document.fonts as unknown as { load: (font: string, text: string) => Promise<unknown> }
    const was = fonts.load
    fonts.load = async (_font, text) => { if (text.includes('\u4fe1')) await held; return [] }
    try {
      // (the page's paragraph placed nowhere: no unit of the page's own to wait for)
      const p = paper()
      p.geometry.left.units = []
      const run = await open({ hiding: hiding(true) }, p) as Run
      const laid = run.until(1)
      for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 0))
      expect(run.svgOf(1).querySelector('[data-f]')).toBeNull()
      expect(run.ready(1)).toBe(false)
      release()
      await laid
      expect(run.ready(1)).toBe(true)
      expect(run.svgOf(1).querySelector('[data-f="f0"]')?.textContent).toBe('\u4fe1\u53f7\u5f3a\u5ea6')
    } finally { fonts.load = was }
  })
})

describe('the fit rule (figure-fit.mjs)', () => {
  const f = (anchor: 'start' | 'centre' | 'end') => ({ length: 60, size: 10, anchor })
  it('keeps the size where the translation fits, its anchor\'s place along the box', () => {
    expect(fitFigure(f('start'), 4, 0.6)).toEqual({ size: 10, offset: 0, width: 40 })
    expect(fitFigure(f('centre'), 4, 0.6)).toEqual({ size: 10, offset: 10, width: 40 })
    expect(fitFigure(f('end'), 4, 0.6)).toEqual({ size: 10, offset: 20, width: 40 })
  })
  it('shrinks to the box down to the floor, and no further', () => {
    expect(fitFigure(f('start'), 8, 0.6)).toMatchObject({ size: 7.5, offset: 0, width: 60 })
    expect(fitFigure(f('start'), 10, 0.6)).toMatchObject({ size: 6, width: 60 })
    expect(fitFigure(f('start'), 10.5, 0.6)).toBeNull()
    expect(fitFigure(f('start'), 0, 0.6)).toBeNull()
  })
  it('tells a translation that says its source again', () => {
    expect(sameAsSource('Signal  STRENGTH', 'Signal strength')).toBe(true)
    expect(sameAsSource('\u4fe1\u53f7', 'Signal')).toBe(false)
  })
})
