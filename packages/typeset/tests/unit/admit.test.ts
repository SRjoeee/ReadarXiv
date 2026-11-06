// U.admit on synthetic units: the verdicts the corpus's sample does not show (a row refused, its pieces not the file's, a
// placeholder with no row, a class the toggles hide, a unit past the pages shown, one cut by them).
import { describe, expect, it } from 'vitest'
import { type AdmitInput, admit } from '../../src/unit/admit.ts'

const lu = (
  pages: number[],
  ph: [number, { kind: string; flags: number; segs: number[] }][] = [],
): NonNullable<AdmitInput['lu']> => ({
  kind: 'para',
  pieces: 3,
  lines: pages.flatMap((p, j) => [p, 72, 300, 700 - 12 * j, 708 - 12 * j, 698 - 12 * j, 10, 0]),
  frames: [pages[0]!, 0, 0, pages.length, -1, 0],
  held: [],
  ph: new Map(ph),
})
const base = (more: Partial<AdmitInput> = {}): AdmitInput => ({
  row: {
    kind: 'para',
    src: 'A $x$ b.',
    state: 'whole',
    pieces: [
      { t: 'text', s: 'Ein ' },
      { t: 'ph', src: '$x$', k: 1 },
      { t: 'text', s: ' b.' },
    ],
  },
  lu: lu([1, 1], [[1, { kind: 'math', flags: 0, segs: [1, 100, 688, 110, 696, 686] }]]),
  pieces: [
    [0, 'Ein '],
    [1, 1],
    [0, ' b.'],
  ],
  clsProven: [null, 'other', null],
  kind: 'para',
  group: undefined,
  unhidden: null,
  textGroup: true,
  shown: true,
  rects: null,
  N: 10,
  symbols: 'text',
  unlaid: null,
  ...more,
})

describe('U.admit', () => {
  it('lays a unit the file locates whole, on the pages shown', () => {
    expect(admit(base())).toEqual({ ok: true, pages: [1], cut: false })
    expect(
      admit(base({ lu: lu([1, 2], [[1, { kind: 'math', flags: 0, segs: [1, 100, 688, 110, 696, 686] }]]), N: 1 })),
    ).toEqual({ ok: true, pages: [1], cut: true })
  })
  it('refuses a row that is not the unit’s, and one whose pieces the file does not hold one to one', () => {
    expect(admit(base({ kind: 'heading' }))).toEqual({ ok: false, code: 'refused', why: 'row: another kind' })
    expect(
      admit(
        base({
          pieces: [
            [0, 'Ein '],
            [1, 1],
          ],
        }),
      ),
    ).toMatchObject({ code: 'pieces', why: 'unanchored', missed: 'unanchored, pieces' })
  })
  it('leaves the original’s a placeholder the file has no row or no ink for, but a text macro', () => {
    expect(admit(base({ lu: lu([1]) }))).toMatchObject({ code: 'noRow', missed: 'unanchored, no row' })
    expect(admit(base({ lu: lu([1]), clsProven: [null, 'macro', null] }))).toMatchObject({ ok: true })
    expect(admit(base({ lu: lu([1], [[1, { kind: 'math', flags: 32, segs: [] }]]) }))).toMatchObject({ code: 'lost' })
  })
  it('leaves the original’s a unit the toggles hide, one past the pages shown, one whose ink the wrap cannot hide', () => {
    expect(admit(base({ shown: false }))).toEqual({ ok: false, code: 'hidden', why: 'unanchored' })
    expect(
      admit(base({ lu: lu([12], [[1, { kind: 'math', flags: 0, segs: [12, 100, 688, 110, 696, 686] }]]) })),
    ).toEqual({
      ok: false,
      code: 'offPages',
      why: 'unanchored',
    })
    expect(admit(base({ textGroup: false }))).toEqual({ ok: false, code: 'unhidden', why: 'unhidden: no group' })
    expect(admit(base({ lu: null, unlaid: 'noLine' }))).toEqual({
      ok: false,
      code: 'unlocated',
      why: 'unanchored',
      unlaid: 'noLine',
      missed: 'unanchored, unlocated',
    })
  })
})
