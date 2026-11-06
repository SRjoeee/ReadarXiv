// U.elements on synthetic readings: the branches the corpus never takes (the lead mark T11, a citation learnt, a source
// drawn from its plain text, a macro learnt, a placeholder the file cannot draw: samples/branches.json counts 0 of each) and
// the row-dependent ones the replay holds to today (brackets, a kept display, the row's order).
import { describe, expect, it } from 'vitest'
import type { V0Piece } from '../../src/unit/breaks.ts'
import { bracketed, type ElementReading, elements, type Gap } from '../../src/unit/elements.ts'

const gap = (text: string, lines: string[], more: Partial<Gap> = {}): Gap => ({
  text,
  lines,
  nu: false,
  proof: true,
  n: text.length,
  ...more,
})
const reading = (src: string, cls: string, more: Partial<ElementReading> = {}): ElementReading => ({
  src,
  cls,
  fixed: null,
  inked: false,
  symbol: null,
  supSrc: false,
  source: { mode: 'source', text: src.replace(/\\/g, ''), math: cls === 'other', sup: false },
  srcText: '',
  gap: null,
  drawn: null,
  inner: null,
  display: null,
  cite: null,
  segs: [],
  rowText: null,
  ...more,
})
const t = (s: string): V0Piece => ({ t: 'text', s })
const ph = (src: string, k: number): V0Piece => ({ t: 'ph', src, k })
const run = (pieces: V0Piece[], readings: [number, ElementReading][], more = {}) =>
  elements({
    pieces,
    cls2: pieces.map((p, k) => (p.t === 'ph' ? (readings.find((r) => r[0] === k)?.[1].cls ?? null) : null)),
    readings: new Map(readings),
    held: [],
    macros: new Map(),
    touched: [],
    shown: 99,
    ...more,
  })

describe('U.brackets', () => {
  it('reads the translation’s own brackets round a piece, past spaces and TeX’s nothing', () => {
    const p = [t('Gl. （'), ph('\\,', 1), ph('\\eqref{a}', 2), t('）')]
    expect(bracketed(p, [null, 'space', 'num', null], 2)).toBe(true)
    expect(bracketed([t('Eqn. '), ph('\\eqref{a}', 1), t(' holds')], [null, 'num', null], 1)).toBe(false)
  })
  it('draws a rendering without its own brackets where the row brackets it', () => {
    const g = gap('(1)', ['1|10,690,20,700'])
    const r = reading('\\eqref{a}', 'num', {
      gap: g,
      drawn: { mode: 'orig-text', text: '(1)', sup: false },
      inner: {
        gap: gap('1', ['1|10,690,20,700'], { unbracketed: true }),
        drawn1: { mode: 'orig-text', text: '1', sup: false },
        drawn2: null,
      },
    })
    expect(run([t('Gl. ('), ph('\\eqref{a}', 1), t(')')], [[1, r]]).resolutions.get(1)).toMatchObject({
      text: '1',
      gap: { unbracketed: true },
    })
    expect(run([t('Gl. '), ph('\\eqref{a}', 1), t('.')], [[1, r]]).resolutions.get(1)).toMatchObject({
      text: '(1)',
      gap: { text: '(1)' },
    })
  })
})

describe('U.leadMark (T11)', () => {
  const star = reading('$^*$', 'symbol', {
    symbol: { leads: true, res: { mode: 'symbol', text: '*', math: true, sup: true } },
  })
  it('keeps a mark the unit starts with that the page shows before its first line', () => {
    expect(run([ph('$^*$', 0), t(' These authors contributed equally.')], [[0, star]]).resolutions.get(0)?.mode).toBe(
      'kept',
    )
  })
  it('draws it where the translation sets it after its text', () => {
    expect(run([t('Diese Autoren '), ph('$^*$', 1)], [[1, star]]).resolutions.get(1)?.mode).toBe('symbol')
  })
})

describe('U.render', () => {
  it('keeps a placeholder on a display’s lines only once the display is read before it, in the row’s order', () => {
    const disp = reading('\\[x\\]', 'display', { gap: gap('x', ['1|1,1,1,1']), display: ['1|1,1,1,1'] })
    const num = reading('\\ref{e}', 'num', {
      gap: gap('2', ['1|1,1,1,1']),
      drawn: { mode: 'orig-text', text: '2', sup: false },
    })
    const before = run(
      [t('a'), ph('\\[x\\]', 1), t('b'), ph('\\ref{e}', 3)],
      [
        [1, disp],
        [3, num],
      ],
    )
    expect([before.resolutions.get(1)?.mode, before.resolutions.get(3)?.mode]).toEqual(['kept', 'kept'])
    expect(before.keep).toEqual(['1|1,1,1,1'])
    const after = run(
      [t('a'), ph('\\ref{e}', 1), t('b'), ph('\\[x\\]', 3)],
      [
        [1, num],
        [3, disp],
      ],
    )
    expect(after.resolutions.get(1)?.mode).toBe('orig-text')
  })
  it('draws a citation not found as the unit wrote it before (and, with no ink of its own to crop, leaves it unproven)', () => {
    const cite = reading('\\cite{k}', 'cite', { cite: { mode: 'cite-map', text: '[4]' } })
    const got = run([t('a'), ph('\\cite{k}', 1)], [[1, cite]])
    expect([got.resolutions.get(1)?.mode, got.resolutions.get(1)?.text, got.unproven]).toEqual(['cite-map', '[4]', 1])
  })
  it('draws an unknown macro not found as its rendering taught the unit, then as the crop of its own ink', () => {
    const m1 = reading('\\me', 'umacro', {
      unknown: true,
      gap: gap('MyNet', ['1|a']),
      drawn: { mode: 'orig-text', text: 'MyNet' },
    })
    const m2 = reading('\\me', 'umacro', { unknown: true, source: { mode: 'source', text: '', sup: false } })
    const learnt = run(
      [t('a'), ph('\\me', 1), t('b'), ph('\\me', 3)],
      [
        [1, m1],
        [3, m2],
      ],
    )
    expect([learnt.resolutions.get(3)?.mode, learnt.resolutions.get(3)?.text, learnt.unproven]).toEqual([
      'source',
      'MyNet',
      3,
    ])
    const inked = run(
      [t('a'), ph('\\me', 1), t('b'), ph('\\me', 3)],
      [
        [1, m1],
        [3, { ...m2, segs: [1, 0, 0, 1, 1, 0] }],
      ],
    )
    expect([inked.resolutions.get(3)?.mode, inked.unproven]).toEqual(['crop', -1])
  })
  it('is unproven where a placeholder drawn from its source has no ink the file can crop', () => {
    const lost = reading('\\foo', 'other')
    expect(run([t('a'), ph('\\foo', 1)], [[1, lost]]).unproven).toBe(1)
    const past = reading('\\foo', 'other', { segs: [120, 0, 0, 1, 1, 0], rowText: 'foo' })
    const got = run([t('a'), ph('\\foo', 1)], [[1, past]], { shown: 12 })
    expect([got.unproven, got.resolutions.get(1)?.mode, got.resolutions.get(1)?.text]).toEqual([-1, 'source', 'foo'])
  })
})
