// A paragraph's measure as TeX sets its lines (the compile move's F13: Instrument.tex.measures, STATEMENTS_TEX's AXT-MEASURE at
// each paragraph's end), carried into each of its lines' m0..m1 (locate/measures.ts): documents of our own, B and A the same.
import { unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import type { Doc } from '../src/doc.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import { docOf } from './helpers/doc.ts'
import { locate } from './helpers/locate.ts'

const unitOf = (kind: string, s: string): InstrumentUnit => {
  const content = [{ t: 'text' as const, s }]
  return { id: unitId(kind, content), kind, content }
}
type Measure = NonNullable<Instrument['tex']['measures']>[number]
/** two paragraphs of three lines each (units 0 and 1), TeX's ends `qe1j` and `qe2j` after each on B; the frame one column
 *  [72, 540] (or `columns`); the statements `measures` */
function measuresOf(measures: Measure[], frame = { block: [72, 540], columns: [[72, 540]] }) {
  const lines = [
    'first line of one',
    'second line of it',
    'third line of it',
    'first line of two',
    'second of two',
    'last',
  ]
  const B: Doc = docOf([{ lines: lines.map((text, i) => ({ text, x: 100, y: 700 - 12 * i })) }])
  const n = (k: number) => lines.slice(0, k).reduce((s, t) => s + t.length, 0)
  B.pages[0]!.marks = {
    paras: [],
    paraEnds: [
      { name: 'qe1j', glyph: n(3), box: 0, point: 0, para: 0 },
      { name: 'qe2j', glyph: n(6), box: 0, point: 0, para: 0 },
    ],
    regions: [],
    pictures: [],
  }
  const units = [unitOf('para', lines.slice(0, 3).join(' ')), unitOf('para', lines.slice(3).join(' '))]
  const own = [0, 0, 0, 1, 1, 1]
  const ins: Instrument = {
    ink: B,
    units,
    glyphs: B.pages.map((pg) => {
      const O = ownersOf(pg.glyphs.length)
      pg.glyphs.forEach((g, j) => {
        O.unit[j] = own[g.n] ?? -1
        O.role[j] = ROLE.text
      })
      return O
    }),
    boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
    tex: {
      frames: [{ block: frame.block as [number, number], columns: frame.columns as [number, number][], foot: 100 }],
      paragraphEnds: [[n(3), n(6)]],
      measures,
    },
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
  }
  const L = locate(ins, B, align(B, B))
  return L.members.map((m) => m.lines.map((l) => [l[7], l[8]]))
}
const plain = { hsize: 468, hangindent: 0, hangafter: 1, leftskip: 0, rightskip: 0 }

describe('a paragraph’s measure as TeX sets its lines (F13)', () => {
  it('states a list paragraph’s \\parshape of one line on each of its lines, a paragraph stating none its frame', () => {
    // (LaTeX's list: \parshape 1 \@totalleftmargin \linewidth)
    const [one, two] = measuresOf([{ para: 1, ...plain, shape: [[20, 400]] }])
    expect(one).toEqual([
      [92, 492],
      [92, 492],
      [92, 492],
    ])
    expect(two).toEqual([
      [72, 540],
      [72, 540],
      [72, 540],
    ])
  })
  it('states a shape of several lines line by line, its last for every line past it (wrapfig’s)', () => {
    const [one] = measuresOf([
      {
        para: 1,
        ...plain,
        shape: [
          [0, 300],
          [0, 300],
        ],
      },
      { para: 2, ...plain, shape: [[150, 318]] },
    ])
    expect(one).toEqual([
      [72, 372],
      [72, 372],
      [72, 372],
    ])
  })
  it('states \\hangindent after \\hangafter lines (on the left; a negative one on the right), and before them for a negative', () => {
    expect(measuresOf([{ para: 1, ...plain, hangindent: 30, hangafter: 1 }])[0]).toEqual([
      [72, 540],
      [102, 540],
      [102, 540],
    ])
    expect(measuresOf([{ para: 1, ...plain, hangindent: -30, hangafter: 2 }])[0]).toEqual([
      [72, 540],
      [72, 540],
      [72, 510],
    ])
    expect(measuresOf([{ para: 1, ...plain, hangindent: 30, hangafter: -2 }])[0]).toEqual([
      [102, 540],
      [102, 540],
      [72, 540],
    ])
  })
  it('takes \\leftskip’s and \\rightskip’s natural sizes off the line’s box', () => {
    expect(measuresOf([{ para: 1, ...plain, leftskip: 10, rightskip: 5 }])[0]![0]).toEqual([82, 535])
  })
  it('places it in the column whose width is the paragraph’s \\hsize, and states none for an \\hsize no column’s or block’s', () => {
    const two = {
      block: [72, 540],
      columns: [
        [72, 300],
        [312, 540],
      ],
    }
    // (a paragraph whose \hsize is the text block's, a two-column float's: placed at the block's left)
    expect(measuresOf([{ para: 1, ...plain, shape: [[20, 400]] }], two)[0]![0]).toEqual([92, 492])
    // (a minipage's paragraph: its \hsize 300, where it stands on the page TeX's statement does not say)
    expect(measuresOf([{ para: 1, ...plain, hsize: 300, shape: [[20, 200]] }])[0]![0]).toEqual([72, 540])
  })
})
