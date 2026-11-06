// S.figures on synthetic pages: the branches the corpus never takes (a kept or untranslated row, a unit the document holds no
// group of, a face no slice serves, a face not loaded yet), the fit's anchors and floor, and the font's class.
import { describe, expect, it } from 'vitest'
import type { Face } from '../../src/breaker/tokens.ts'
import { fitFigureSet, sameAsSource } from '../../src/shared/figure-fit.ts'
import { type FigureRow, figures, fontClassOf } from '../../src/shared/figures.ts'
import type { Metrics } from '../../src/types.ts'

const face = (family: string): Face =>
  ({
    family,
    weight: 400,
    style: 'normal',
    oblique: 0,
    stand: 'serif',
    caps: false,
    size: 1,
    id: 'x',
    ids: ['x'],
  }) as Face
const metricsOf = (ready: (font: string, text: string) => boolean | 'never' = () => true): Metrics => ({
  ready,
  // (each character 50 at 100 px: half its size)
  advance: (_f, size, text) => (50 * [...text].length * size) / 100,
  ink: () => [70, 20, 0],
})
const row = (id: number, o: Partial<FigureRow> = {}): FigureRow => ({
  id,
  group: `f${id}`,
  page: 1,
  x: 100,
  y: 200,
  ux: 1,
  uy: 0,
  length: 20,
  size: 10,
  anchor: 'start',
  ascent: 0.8,
  descent: -0.2,
  fill: -1,
  font: 'ABCDEF+NimbusSanL-Bold',
  set: `f${id}`,
  before: 0,
  after: 0,
  under: null,
  ...o,
})
const base = {
  src: () => 'Time',
  grouped: () => true,
  designs: { serif: 'times', sans: 'helvetica', mono: 'courier' },
  faceOf: () => face('"axt-x"'),
  rules: { cjkQuotes: true, floorMin: 0.6 },
}
const tr = (s: string) => ({ state: 'whole', pieces: [{ t: 'text', s, tr: true }] })

describe('S.figures', () => {
  it('tells why a unit stays the original’s where no translation is drawn', () => {
    const units = new Map<number, ReturnType<typeof tr> | { state: string }>([
      [2, { state: 'kept' }],
      [3, { state: 'none' }],
      [4, tr(' time ')],
      [5, tr('Zeit')],
    ])
    const got = figures({
      ...base,
      figures: [row(1), row(2), row(3), row(4), row(5)],
      unit: (id) => units.get(id) as never,
      grouped: (g) => g !== 'f5',
      metrics: metricsOf(),
    })
    expect(got.figures.map((f) => [f.id, f.drawn, f.why])).toEqual([
      [1, false, 'no row'],
      [2, false, 'kept'],
      [3, false, 'untranslated'],
      [4, false, 'same'],
      [5, false, 'unhidden'],
    ])
  })
  it('waits for a face not loaded, and leaves a unit no served face holds', () => {
    const one = { ...base, figures: [row(1)], unit: () => tr('Zeit') as never }
    const wait = figures({ ...one, metrics: metricsOf(() => false) })
    expect(wait.figures[0]!.why).toBe('waiting')
    expect(wait.wait).toEqual([['400 100px "axt-x"', 'Zeit']])
    expect(figures({ ...one, metrics: metricsOf(() => 'never') }).figures[0]!.why).toBe('served')
  })
  it('draws a set at one size from its anchor, in its fill', () => {
    const got = figures({
      ...base,
      figures: [row(1, { fill: 0xff0000, set: 'f1' }), row(2, { anchor: 'end', set: 'f1', x: 300 })],
      unit: (id) => tr(id === 1 ? 'Zeit' : 'Zeitpunkt') as never,
      metrics: metricsOf(),
    })
    // ("Zeitpunkt" 4.5 a size, 45 at 10 over 20: the set at 20/45 of its size, under the floor 0.6 for it alone: left unfit,
    // and "Zeit" (20 at 10) at its own size)
    expect(got.figures.map((f) => [f.drawn, f.why, f.size, f.fill])).toEqual([
      [true, null, 10, 0xff0000],
      [false, 'unfit', undefined, undefined],
    ])
  })
})

describe('S.figures’ fit', () => {
  const f = { length: 20, size: 10, anchor: 'centre' as const, before: 4, after: 2, under: null }
  it('shrinks the set by the least factor any needs, a centred one over the narrower room either side', () => {
    const got = fitFigureSet(
      [
        { f, width1: 2.4, depth1: 0.2 },
        { f: { ...f, anchor: 'end' as const }, width1: 2.2, depth1: 0.2 },
      ],
      0.6,
    )
    expect(got[0]).toEqual({ size: 10, offset: -2, width: 24 })
    expect(got[1]).toEqual({ size: 10, offset: -2, width: 22 })
  })
  it('leaves one reaching the stroke under its text crowded, and fits the rest again without it', () => {
    const got = fitFigureSet(
      [
        { f: { ...f, under: 1.1 }, width1: 2, depth1: 0.2 },
        { f, width1: 4, depth1: 0.1 },
      ],
      0.6,
    )
    expect(got[0]).toBe(false)
    expect(got[1]).toEqual({ size: 6, offset: -2, width: 24 })
  })
  it('reads a translation that says its source again as the same, and a font’s class by its name', () => {
    expect(sameAsSource('Time (s)', 'time s')).toBe(true)
    expect(fontClassOf('ABCDEF+CMMI10')).toEqual({ fam: 'math', bold: false, italic: true })
    expect(fontClassOf('NimbusMonL-Bold')).toEqual({ fam: 'mono', bold: true, italic: false })
    expect(fontClassOf('Times-Roman')).toEqual({ fam: 'serif', bold: false, italic: false })
  })
})
