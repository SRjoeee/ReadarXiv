import { describe, expect, it, vi } from 'vitest'
import { indexLayout, LAYOUT_SCHEMA, parseLayout } from '@/pdf-reader/engine/layout/file.mjs'
import { fitFigure, fitFigureSet, sameAsSource } from '@/pdf-reader/engine/layer-proto/figure-fit.mjs'
import { checkFigures, FIGURE_ROW, FIGURE_ROW_10, figureRow } from '@/pdf-reader/engine/layer-proto/figure-rows.mjs'
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
/** a figure unit's row as a part's reader gives it (figure-rows.mjs checkFigures): unit 1, group f0, its run at (60, 120), 60 long,
 *  its own set, no room */
const row = (o: Record<string, unknown> = {}) => ({ id: 1, group: 'f0', page: 1, x: 60, y: 120, ux: 1, uy: 0, length: 60, size: 10, ascent: 0.88, descent: -0.2, anchor: 'centre', fill: 0x2040a0, font: 'ABCDEF+ArialMT', set: 'f0', before: 0, after: 0, ...o })
/** the page: a paragraph's line at y = 200 the layout file does not lay, and the figure's units (each its translation `text`: one
 *  given alone, or `figs`, units 1 … n) */
function paper({ text = '\u4fe1\u53f7\u5f3a\u5ea6', src = 'Signal strength', state = 'whole', figs = null as { text: string; src: string }[] | null } = {}) {
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
      ...(figs ?? [{ text, src }]).map(f => ({ kind: 'inkfigures', src: f.src, state, pieces: state === 'whole' ? [{ t: 'text', tr: true, s: f.text }] : undefined })),
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

describe('a figure\'s set drawn at one size, each label from its edge into its room (the owner\'s rule of 2026-10-29)', () => {
  /** a set's rows: unit i + 1, group f<i>, its set f0, each 14 below the last, from (60, 120) */
  const setOf = (rows: Record<string, unknown>[]) => rows.map((o, i) => row({ id: i + 1, group: `f${i}`, set: 'f0', y: 120 - 14 * i, ...o }))
  const drawn = async (rows: ReturnType<typeof row>[], figs: { text: string; src: string }[]) => {
    const run = await open({ hiding: hiding(true, rows) }, paper({ figs })) as Run
    await run.until(1)
    return run.figures
  }
  // (an em a CJK character in the stubbed face: two at size 10 are 20 wide)
  const ALL = { text: '\u5168\u90e8', src: 'All' }, DEPTH = { text: '\u6df1\u5ea6', src: 'Depth' }, PATCH = { text: '\u8865\u4e01\u5927\u5c0f', src: 'Patch size' }

  it('a short label whose translation is wider takes the free line after it, at its own size', async () => {
    // ("All", 15 long, 25 free after it: its translation, 20 at 10, drawn whole from its start; with no room it had shrunk to 7.5)
    expect((await drawn([row({ length: 15, anchor: 'start', after: 25 })], [ALL]))[0]).toMatchObject({ drawn: true, size: 10, x: 60, w: 20 })
    expect((await drawn([row({ length: 15, anchor: 'start' })], [ALL]))[0]).toMatchObject({ drawn: true, size: 7.5, x: 60, w: 15 })
  })

  it('a legend\'s entries are drawn at one size: the one factor its tightest entry needs, each from its start', async () => {
    // ("All" has no room: 15 for 20, 0.75; "Depth" and "Patch size" fit whole, and are drawn at 0.75 with it, from their start)
    const figs = await drawn(setOf([{ length: 15, anchor: 'start' }, { length: 25, anchor: 'start' }, { length: 50, anchor: 'start' }]), [ALL, DEPTH, PATCH])
    expect(figs.map(f => [f.drawn, f.size, f.x, f.w])).toEqual([[true, 7.5, 60, 15], [true, 7.5, 60, 15], [true, 7.5, 60, 30]])
    // (each its own set, as BUNDLE 10 drew them: three sizes)
    const alone = await drawn(setOf([{ length: 15, anchor: 'start', set: 'f0' }, { length: 25, anchor: 'start', set: 'f1' }, { length: 50, anchor: 'start', set: 'f2' }]), [ALL, DEPTH, PATCH])
    expect(alone.map(f => f.size)).toEqual([7.5, 10, 10])
  })

  it('a right-aligned set keeps its end and shrinks as one; a narrower translation ends where its original did', async () => {
    // (six characters, 60 at 10, in 50: 5/6 for the set; "Depth"'s two, 20, then 16.7 wide, ending at 90 as its original)
    const figs = await drawn(setOf([{ length: 50, anchor: 'end' }, { length: 30, anchor: 'end' }]), [{ text: '\u4fe1'.repeat(6), src: 'Validation loss' }, DEPTH])
    expect(figs.map(f => [f.drawn, f.size])).toEqual([[true, 8.33], [true, 8.33]])
    expect(figs[1]!.x! + figs[1]!.w!).toBeCloseTo(90, 0)
    expect(figs[0]!.x).toBe(60)
  })

  it('a label that would pass the floor is the original\'s, and the rest of its set keeps the one factor the others need', async () => {
    // (twelve characters in 60: 0.5, past the floor; four in 32: 0.8; two in 25: whole)
    const figs = await drawn(setOf([{ length: 60, anchor: 'start' }, { length: 32, anchor: 'start' }, { length: 25, anchor: 'start' }]), [{ text: '\u4fe1'.repeat(12), src: 'A long label' }, PATCH, DEPTH])
    expect(figs.map(f => [f.drawn, f.why, f.size ?? null])).toEqual([[false, 'unfit', null], [true, null, 8], [true, null, 8]])
  })
})

describe('the figure rows on the wire (figure-rows.mjs)', () => {
  const unit = { group: 'f7', page: 1, x: 10, y: 20, ux: 1, uy: 0, length: 30, size: 8, ascent: 0.88, descent: -0.2, anchor: 'start' as const, fill: 0, font: 'ArialMT' }
  const check = (rows: unknown[], format?: string) => checkFigures(rows, { a: 1, b: 1, views: [0, 0, 300, 300], unitCount: 10, ...(format ? { format } : {}) })
  it('a row carries its set and its room (BUNDLE 11), its room rounded down; a unit of no set is its own', () => {
    expect(FIGURE_ROW).toBe(17)
    expect(figureRow(3, { ...unit, set: 5, before: 1.23456, after: 7.8889 }).slice(14)).toEqual([5, 1.234, 7.888])
    expect(figureRow(3, unit).slice(14)).toEqual([7, 0, 0])
    expect(check([figureRow(3, { ...unit, set: 5, before: 2, after: 4 })])[0]).toMatchObject({ group: 'f7', set: 'f5', before: 2, after: 4 })
  })
  it('a part of 10\'s rows is read each unit its own set with no room, and a row of 11\'s shape is no row of 10\'s', () => {
    expect(FIGURE_ROW_10).toBe(14)
    const old = figureRow(3, unit).slice(0, FIGURE_ROW_10)
    expect(check([old], '10')[0]).toMatchObject({ group: 'f7', set: 'f7', before: 0, after: 0 })
    expect(() => check([old])).toThrow()
    expect(() => check([figureRow(3, unit)], '10')).toThrow()
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
  it('takes a unit\'s room on the side its anchor grows to, a middle one\'s the same either side', () => {
    expect(fitFigure({ length: 60, size: 10, anchor: 'start', before: 50, after: 20 }, 8, 0.6)).toEqual({ size: 10, offset: 0, width: 80 })
    expect(fitFigure({ length: 60, size: 10, anchor: 'end', before: 20, after: 50 }, 8, 0.6)).toEqual({ size: 10, offset: -20, width: 80 })
    // (a middle one: 5 a side, 70 of line for 80, 7/8)
    expect(fitFigure({ length: 60, size: 10, anchor: 'centre', before: 5, after: 40 }, 8, 0.6)).toMatchObject({ size: 8.75, offset: -5, width: 70 })
  })
  it('fits a set at one factor, the least its drawn units need', () => {
    const set = fitFigureSet([{ f: f('start'), width1: 8 }, { f: f('start'), width1: 4 }, { f: f('start'), width1: 20 }], 0.6)
    expect(set.map(x => x?.size ?? null)).toEqual([7.5, 7.5, null])
  })
  it('tells a translation that says its source again', () => {
    expect(sameAsSource('Signal  STRENGTH', 'Signal strength')).toBe(true)
    expect(sameAsSource('\u4fe1\u53f7', 'Signal')).toBe(false)
  })
})
