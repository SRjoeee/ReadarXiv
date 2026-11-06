import { type Line, type Piece, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import type { DocGlyph } from '../src/doc.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import {
  alignOf,
  bandOf,
  breakEnd,
  cellCentred,
  classifyFont,
  fillOfGlyphs,
  labelParts,
  pinnedOf,
  shortSkipLines,
  sideOf,
  sourceEndMarks,
  styleOf,
  tailOf,
} from '../src/locate/facts.ts'
import { locate } from '../src/locate/locate.ts'
import { docOf, type PageSpec } from './helpers/doc.ts'

const g = (u: string, x = 72, y = 700, o: Partial<DocGlyph> = {}): DocGlyph => {
  const size = o.size ?? 10
  const base = o.base ?? 'CMR10'
  return {
    u,
    code: u.codePointAt(0) ?? 0,
    font: base,
    base,
    x0: x,
    x1: x + 0.6 * size,
    y,
    top: y + 0.7 * size,
    bottom: y - 0.2 * size,
    size,
    ix0: x,
    ix1: x + 0.6 * size,
    n: 0,
    k: 0,
    form: false,
    blank: !/\S/.test(u),
    fill: 0,
    ...o,
  }
}
const run = (s: string, x = 72, y = 700, o: Partial<DocGlyph> = {}) =>
  [...s].map((u, i) => g(u, x + 0.6 * (o.size ?? 10) * i, y, o))
/** a line: page, column, x0, x1, base, top, bottom, m0, m1, flags */
const L = (x0: number, x1: number, base: number, flags = 0, page = 1): Line => [
  page,
  0,
  x0,
  x1,
  base,
  base + 7,
  base - 2,
  x0,
  x1,
  flags,
]

describe('a unit’s style read off its glyphs (C5)', () => {
  it('takes the fonts’ class, weight and slant by their names, math glyphs aside, and the most common size', () => {
    expect(classifyFont('ABCDEF+CMBX10')).toMatchObject({ fam: 'serif', bold: true, italic: false })
    expect(classifyFont('NimbusSanL-Regu')).toMatchObject({ fam: 'sans' })
    expect(classifyFont('CMTT10')).toMatchObject({ fam: 'mono' })
    expect(classifyFont('CMMI10')).toMatchObject({ fam: 'math' })
    const gs = [...run('Theorem', 72, 700, { base: 'CMBX10' }), ...run('xy', 120, 700, { base: 'CMMI10' })]
    expect(styleOf(gs)).toMatchObject({ role: 'serif', size: 10, bold: 1 })
    expect(styleOf(run('ABSTRACT'))).toMatchObject({ upper: 1 })
    expect(styleOf(run('text', 72, 700, { base: 'CMTI10' }))).toMatchObject({ slant: 1 })
  })
  it('gives an element its fill where more than half its glyphs share one that is not black (B14)', () => {
    expect(fillOfGlyphs(run('[12]', 72, 700, { fill: 0x0000ff }))).toBe(0x0000ff)
    expect(fillOfGlyphs([...run('[1', 72, 700, { fill: 0x0000ff }), ...run('2]', 90, 700)])).toBeUndefined()
    expect(fillOfGlyphs(run('[12]'))).toBeUndefined()
  })
})

describe('the class’s tail (C20)', () => {
  const p = (s: string): Piece[] => [{ t: 'text', s }]
  it('takes the marks after the text that its source does not write, at most three', () => {
    // (amsthm's note: the source writes "the note", the class sets ")." after it)
    expect(tailOf(run(').'), sourceEndMarks(p('the note')))?.map(([t]) => t)).toEqual([')', '.'])
    // (a sentence's own stop is the source's: what is left is none)
    expect(tailOf(run('.'), sourceEndMarks(p('a sentence.')))).toBeNull()
    // (a reference's year bracket is the source's, the style's stop after it the class's)
    expect(tailOf(run(').'), sourceEndMarks(p('Smith (2025)')))?.map(([t]) => t)).toEqual(['.'])
    expect(tailOf(run('))).'), sourceEndMarks(p('x')))).toBeNull()
    expect(tailOf(run('.', 72, 700, { base: 'CMMI10' }), sourceEndMarks(p('x')))).toBeNull()
  })
  it('reads the source’s end marks through ligatures, spaces and inkless elements', () => {
    expect(sourceEndMarks(p("as ``said''."))).toEqual(['”', '.'])
    expect(sourceEndMarks([...p('word.'), { t: 'el', id: '1', kind: 'other', src: '\\label{x}' }])).toEqual(['.'])
    expect(sourceEndMarks([...p('cost'), { t: 'el', id: '1', kind: 'symbol', src: '\\%' }])).toBeNull()
  })
})

describe('a label’s parts (B16)', () => {
  it('cuts a float’s or a head’s label into its name, its number and its punctuation, each with its ink', () => {
    const parts = labelParts(run('Figure 3:'), 1)
    expect(parts.name?.[0]).toBe('Figure')
    expect(parts.num?.[0]).toBe('3')
    expect(parts.punct?.[0]).toBe(':')
    expect(labelParts(run('Theorem 2.1.'), 1)).toMatchObject({
      name: ['Theorem', expect.anything()],
      num: ['2.1', expect.anything()],
      punct: ['.', expect.anything()],
    })
    expect(labelParts(run('Table A.4'), 1).num?.[0]).toBe('A.4')
    expect(labelParts(run('[12]'), 1).num?.[0]).toBe('12')
    expect(labelParts(run('Proof.'), 1)).toMatchObject({
      name: ['Proof', expect.anything()],
      punct: ['.', expect.anything()],
    })
    expect(labelParts(run('Proof.'), 1).num).toBeUndefined()
  })
})

describe('forced breaks and the room after them (C14)', () => {
  it('states the line TeX ended and its room in pitches, by the unit’s other lines', () => {
    const lines = [L(72, 300, 700), L(72, 200, 688), L(72, 300, 664), L(72, 300, 652)]
    expect(breakEnd(lines, 1, new Set([1]))).toEqual([1, 1])
    expect(breakEnd(lines, 0, new Set([0]))).toEqual([0, 0])
    expect(breakEnd(lines, 3, new Set([3]))).toBeNull()
  })
})

describe('short skips (E15)', () => {
  it('flags the line a display stands under with TeX’s short skip: its top under the baseline by less than 0.3 of a size, the line ending 2 em before it', () => {
    const lines = [L(72, 150, 700), L(72, 300, 640)]
    expect([...shortSkipLines(lines, [[1, 180, 680, 260, 698, 690]], () => 10)]).toEqual([0])
    expect([...shortSkipLines(lines, [[1, 160, 680, 260, 698, 690]], () => 10)]).toEqual([])
    expect([...shortSkipLines(lines, [[1, 180, 680, 260, 690, 685]], () => 10)]).toEqual([])
  })
})

describe('room beside a line, a cell’s band, a line pinned (E13, E24, E23)', () => {
  it('reads the free paper on the line’s band to the nearest ink not its own, within its block', () => {
    const ink = [
      { x0: 40, x1: 60, y0: 698, y1: 706 },
      { x0: 400, x1: 420, y0: 698, y1: 706 },
      { x0: 200, x1: 300, y0: 600, y1: 610 },
    ]
    expect(
      sideOf(
        [L(100, 200, 700)],
        () => ink,
        () => [50, 500],
      ),
    ).toEqual([60, 400])
    expect(
      sideOf(
        [L(100, 200, 700)],
        () => [],
        () => [50, 500],
      ),
    ).toEqual([50, 500])
  })
  it('reads a cell’s band between the rules over and under its lines', () => {
    const rules = [
      { x0: 50, x1: 400, y0: 712, y1: 712.4 },
      { x0: 50, x1: 400, y0: 695, y1: 695.4 },
      { x0: 500, x1: 600, y0: 705, y1: 705.4 },
    ]
    expect(bandOf([L(100, 200, 700)], () => rules)).toEqual([695.4, 712])
    expect(bandOf([L(100, 200, 700)], () => [])).toBeUndefined()
  })
  it('pins a line whose baseline holds ink that stays beside it', () => {
    expect(pinnedOf(L(100, 200, 700), 10, [{ x0: 300, x1: 320, y: 700 }], [50, 500])).toBe(true)
    expect(pinnedOf(L(100, 200, 700), 10, [{ x0: 300, x1: 320, y: 690 }], [50, 500])).toBe(false)
    expect(pinnedOf(L(100, 200, 700), 10, [{ x0: 150, x1: 160, y: 700 }], [50, 500])).toBe(false)
  })
})

describe('alignment where TeX did not tell (B3, E8)', () => {
  it('reads a unit centred where every line’s centre is its column’s and one is short of it by an em', () => {
    const edges = (): [number, number] => [72, 540]
    expect(alignOf([L(200, 412, 700)], () => 10, edges)).toBe('c')
    expect(alignOf([L(72, 540, 700), L(72, 300, 688)], () => 10, edges)).toBe('j')
    // (TeX's justified one-line paragraph, centred by its own glue, off both edges by more than 2 em)
    expect(alignOf([L(200, 412, 700)], () => 10, edges, 'j')).toBe('c')
    expect(alignOf([L(80, 532, 700)], () => 10, edges, 'j')).toBe('j')
  })
  it('centres a single-line cell by its column’s cells: middles within 2 pt, widths spread over 4', () => {
    expect(
      cellCentred([
        [100, 120],
        [95, 125],
        [105, 115],
      ]),
    ).toBe(true)
    expect(
      cellCentred([
        [100, 120],
        [100, 140],
      ]),
    ).toBe(false)
    expect(
      cellCentred([
        [100, 120],
        [101, 121],
      ]),
    ).toBeNull()
    expect(cellCentred([[100, 120]])).toBeNull()
  })
})

// ---------------------------------------------------------------- through locate, on a page made by hand
const text = (s: string): Piece => ({ t: 'text', s })
function instrument(
  B: ReturnType<typeof docOf>,
  units: InstrumentUnit[],
  own: (p: number, n: number, k: number) => [number, number, number],
): Instrument {
  return {
    ink: B,
    units,
    glyphs: B.pages.map((pg, p) => {
      const O = ownersOf(pg.glyphs.length)
      pg.glyphs.forEach((gl, j) => {
        const [u, role, piece] = own(p, gl.n, j)
        O.unit[j] = u
        O.role[j] = role
        O.piece[j] = piece
      })
      return O
    }),
    boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
    tex: {},
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
  }
}

describe('locate states the facts on arXiv’s page', () => {
  it('keeps a line inside a unit that no unit owns (a held line) as KEPT, in its place', () => {
    const pages: PageSpec[] = [{ lines: ['first line of it', 'a held line here', 'last line of it'] }]
    const B = docOf(pages)
    const u: InstrumentUnit = {
      id: unitId('para', [text('x')]),
      kind: 'para',
      content: [text('first line of it last line of it')],
    }
    const ins = instrument(B, [u], (_, n) => (n === 1 ? [-1, 0, -1] : [0, ROLE.text, -1]))
    const M = locate(ins, B, align(B, B)).members[0]!
    expect(M.lines.map((l) => [l[4], l[9] & 1])).toEqual([
      [700, 0],
      [688, 1],
      [676, 0],
    ])
  })
  it('states a forced break’s line from its point on B, and the class’s tail', () => {
    const pages: PageSpec[] = [
      {
        lines: ['one line', 'two lines', 'three end).'],
        points: [
          ['p0.1a', 7],
          ['p0.1b', 7],
        ],
      },
    ]
    const B = docOf(pages)
    const content: Piece[] = [
      text('one line'),
      { t: 'el', id: '1', kind: 'other', src: '\\\\' },
      text('two lines three end'),
    ]
    const u: InstrumentUnit = { id: unitId('para', content), kind: 'para', content }
    const ins: Instrument = {
      ...instrument(B, [u], () => [0, ROLE.text, -1]),
      places: [
        { unit: 0, piece: '1', page: 1, glyph: 8, end: false },
        { unit: 0, piece: '1', page: 1, glyph: 8, end: true },
      ],
    }
    const located = locate(ins, B, align(B, B))
    const M = located.members[0]!
    expect(M.elements.find(([id]) => id === '1')?.[1].ends).toEqual([0, 0])
    expect(M.tail?.map(([t]) => t)).toEqual([')', '.'])
  })
  it('cuts a label into its parts and keeps an element outside the unit’s lines in no group', () => {
    const pages: PageSpec[] = [{ lines: ['Figure 1: a caption', { text: '*', x: 400, y: 600 }] }]
    const B = docOf(pages)
    const content: Piece[] = [text('a caption'), { t: 'el', id: '1', kind: 'footnote', src: '\\footnotemark' }]
    const u: InstrumentUnit = { id: unitId('caption', content), kind: 'caption', content }
    const ins = instrument(B, [u], (_, n, j) =>
      n === 1 ? [0, ROLE.element, 1] : j < 9 ? [0, ROLE.label, -1] : [0, ROLE.text, -1],
    )
    const located = locate(ins, B, align(B, B))
    const M = located.members[0]!
    expect(M.labelAt).toMatchObject({
      name: ['Figure', expect.anything()],
      num: ['1', expect.anything()],
      punct: [':', expect.anything()],
    })
    const el = M.elements.find(([id]) => id === '1')?.[1]
    expect(el?.keep).toBe(1)
    expect(located.groups[0]!.glyphs.at(-1)).toBeNull()
  })
})

describe('an element’s own brackets (T12’s stated half)', () => {
  it('states the ink of a citation’s brackets, its first and last glyphs where they pair', () => {
    const B = docOf([{ lines: ['see [12] here'] }])
    const content: Piece[] = [text('see '), { t: 'el', id: '1', kind: 'cite', src: '\\cite{a}' }, text(' here')]
    const u: InstrumentUnit = { id: unitId('para', content), kind: 'para', content }
    const ins = instrument(B, [u], (_, _n, j) => (j >= 4 && j <= 7 ? [0, ROLE.element, 1] : [0, ROLE.text, -1]))
    const el = locate(ins, B, align(B, B)).members[0]!.elements.find(([id]) => id === '1')?.[1]
    expect(el?.text).toBe('[12]')
    expect(el?.brackets?.map((b) => b[1])).toEqual([72 + 4 * 6, 72 + 7 * 6])
  })
})
