// A paragraph's measure as TeX sets its lines (the compile move's F13: Instrument.tex.measures, STATEMENTS_TEX's AXT-MEASURE at
// each paragraph's end), carried into each of its lines' m0..m1 (locate/measures.ts): documents of our own, B and A the same.
import { unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import type { Doc } from '../src/doc.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import { measureKept } from '../src/locate/measures.ts'
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
/** lines each [text, unit], one under the other; TeX's ends with a point on B (`ends`: [serial, the line it ends after]); the
 *  statements `measures` and the units' paragraphs by TeX's order (`paras`: [unit, serial]); the members' lines' measures */
function measuredOf(
  lines: [string, number, number?][],
  ends: [number, number][],
  measures: Measure[],
  paras: [number, number][],
) {
  const B: Doc = docOf([{ lines: lines.map(([text, , x], i) => ({ text, x: x ?? 100, y: 700 - 12 * i })) }])
  const n = (k: number) => lines.slice(0, k).reduce((t, [x]) => t + x.length, 0)
  B.pages[0]!.marks = {
    paras: [],
    paraEnds: ends.map(([serial, line]) => ({ name: `qe${serial}j`, glyph: n(line + 1), box: 0, point: 0, para: 0 })),
    regions: [],
    pictures: [],
  }
  const count = Math.max(...lines.map(([, u]) => u)) + 1
  const units = Array.from({ length: count }, (_, u) =>
    unitOf(
      'para',
      lines
        .filter(([, v]) => v === u)
        .map(([t]) => t)
        .join(' '),
    ),
  )
  const own = lines.map(([, u]) => u)
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
      frames: [{ block: [72, 540], columns: [[72, 540]], foot: 100 }],
      paragraphEnds: [ends.map(([, line]) => n(line + 1))],
      measures,
      paras,
    },
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
  }
  const L = locate(ins, B, align(B, B))
  return L.members.map((m) => m.lines.map((l) => [l[7], l[8]]))
}

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
  it('reads a paragraph TeX ended after a box as its own, not the next one’s: no other paragraph’s measure, no line counted to it', () => {
    // (unit 0's paragraph ends in a box, no point on B; unit 1's is hung after its first line; TeX pairs each unit with its own)
    const [zero, one] = measuredOf(
      [
        ['first line of one', 0],
        ['second line of it', 0],
        ['last of it', 0],
        ['first line of two', 1],
        ['second of two', 1],
        ['last', 1],
      ],
      [[2, 5]],
      [{ para: 2, ...plain, hangindent: 30, hangafter: 1 }],
      [
        [0, 1],
        [1, 2],
      ],
    )
    expect(zero).toEqual([
      [72, 540],
      [72, 540],
      [72, 540],
    ])
    expect(one).toEqual([
      [72, 540],
      [102, 540],
      [102, 540],
    ])
  })
  it('states no paragraph’s measure for a line TeX set in no paragraph (a one-line caption in an \\hbox) between two ends', () => {
    const [, cap] = measuredOf(
      [
        ['a paragraph', 0],
        ['Figure 1: a one-line caption', 1],
        ['an item of a list', 2],
      ],
      [
        [1, 0],
        [2, 2],
      ],
      [{ para: 2, ...plain, shape: [[20, 400]] }],
      [
        [0, 1],
        [2, 2],
      ],
    )
    expect(cap).toEqual([[72, 540]])
  })
  it('reads a unit of three paragraphs whose second ends in a box: its first one’s lines alone', () => {
    const [unit] = measuredOf(
      [
        ['first paragraph one', 0],
        ['first paragraph two', 0],
        ['second paragraph', 0],
        ['third paragraph one', 0],
        ['third paragraph two', 0],
      ],
      [
        [1, 1],
        [3, 4],
      ],
      [
        { para: 1, ...plain, shape: [[10, 400]] },
        { para: 2, ...plain, shape: [[20, 400]] },
        { para: 3, ...plain, shape: [[30, 400]] },
      ],
      [[0, 3]],
    )
    expect(unit).toEqual([
      [82, 482],
      [82, 482],
      [72, 540],
      [72, 540],
      [72, 540],
    ])
  })
  it('reads a one-line proof that ends in a box, a run-in head on its line, as its own paragraph: the next heading’s hang is none of its', () => {
    // (2610.40645v1 p19: ord 144's paragraph and the proof's (ords 145, 146) end in amsthm's box; the section heading after them
    // is hung after its first line)
    const [p0, head, proof, section] = measuredOf(
      [
        ['an earlier proof ends', 0],
        ['in its box', 0],
        ['Proof.', 1],
        ['Combine the lemmas.', 2],
        ['3 A section heading', 3],
      ],
      [[3, 4]],
      [{ para: 3, ...plain, hangindent: 24.21, hangafter: 1 }],
      [
        [0, 1],
        [2, 2],
        [3, 3],
      ],
    )
    expect(p0).toEqual([
      [72, 540],
      [72, 540],
    ])
    expect(head).toEqual([[72, 540]])
    expect(proof).toEqual([[72, 540]])
    expect(section).toEqual([[72, 540]])
  })
  it('states none for a unit TeX’s statement pairs with the paragraph that ended before it (its own a display ended, stating none)', () => {
    // (2010.11929v2 p13: a paragraph before an align display; its unit's statement comes after the heading's AXT-MEASURE alone)
    const [heading, para] = measuredOf(
      [
        ['A Heading', 0],
        ['a paragraph that a display', 1],
        ['ends without a par', 1],
        ['the next paragraph', 2],
      ],
      [
        [1, 0],
        [2, 3],
      ],
      [{ para: 1, ...plain, shape: [[30, 400]] }],
      [
        [0, 1],
        [1, 1],
        [2, 2],
      ],
    )
    expect(heading).toEqual([[102, 502]])
    expect(para).toEqual([
      [72, 540],
      [72, 540],
    ])
  })
  it('states none for a unit TeX’s statement pairs with a paragraph that ends after another end B shows after its lines', () => {
    // (2111.09276v1's conclusion: its paragraph ended inside `{\small …}` by the bibliography's heading, its statement written
    // where the group closed, after the last reference's AXT-MEASURE)
    const [conclusion] = measuredOf(
      [
        ['the conclusion one', 0],
        ['the conclusion two', 0],
        ['References', 1],
        ['[1] a reference', 2],
      ],
      [
        [2, 2],
        [3, 3],
      ],
      [{ para: 3, ...plain, shape: [[20, 400]] }],
      [
        [0, 3],
        [1, 2],
        [2, 3],
      ],
    )
    expect(conclusion).toEqual([
      [72, 540],
      [72, 540],
    ])
  })
  it('states none for a unit paired with a paragraph whose end stands before its line on B, though B shows a lower serial between', () => {
    // (2501.14787v1 p75: a heading's end (592) on p74, a paragraph TeX ended earlier (590) standing after it on B, then the line
    // of a unit a display ended, paired with the heading's paragraph)
    const [, , para] = measuredOf(
      [
        ['A Heading', 0],
        ['a note TeX ended before', 1],
        ['the line after a display', 2],
      ],
      [
        [2, 0],
        [1, 1],
      ],
      [{ para: 2, ...plain, shape: [[30, 400]] }],
      [
        [0, 2],
        [1, 1],
        [2, 2],
      ],
    )
    expect(para).toEqual([[72, 540]])
  })
  it('reads a paragraph TeX ended before others that B shows first: REVTeX’s abstract, boxed before the title’s paragraphs', () => {
    // (2610.10492v1 p1: the abstract's paragraph ends first (serial 1), then the title's and the authors' (2, 3), which B shows
    // before the abstract's lines; the abstract's measure is TeX's, its own end after its lines)
    const [title, author, abstract] = measuredOf(
      [
        ['A Title', 0],
        ['An Author', 1],
        ['the abstract one', 2],
        ['the abstract two', 2],
      ],
      [
        [2, 0],
        [3, 1],
        [1, 3],
      ],
      [{ para: 1, ...plain, shape: [[36, 396]] }],
      [
        [0, 2],
        [1, 3],
        [2, 1],
      ],
    )
    expect(title).toEqual([[72, 540]])
    expect(author).toEqual([[72, 540]])
    expect(abstract).toEqual([
      [108, 504],
      [108, 504],
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
    // (a minipage's paragraph: its \hsize 300, where it stands on the page TeX's statement does not say, and no line of the page
    // set at that width fills it: no wider measure than its own lines, their ink's extent; never its frame's)
    expect(measuresOf([{ para: 1, ...plain, hsize: 300, shape: [[20, 200]] }])[0]![0]).toEqual([100, 202])
  })
})

describe('a paragraph set at an \hsize no column has (a box’s): placed by the page’s lines set at that width (the coordinator’s ruling 2 of 2026-11-20)', () => {
  const box = { ...plain, hsize: 300 }
  it('a paragraph in a framed box narrower than its column: the box’s measure where its lines’ spread is its \hsize', () => {
    // (2610.19159v1's mdframed boxes: every line stated the page's text block, 72..540 here, a single line widened onto the
    // box's rule; a box at 100 of \hsize 300, a paragraph of two full lines and a short last one, and a one-line paragraph
    // after it in the same box)
    const [one, two] = measuredOf(
      [
        ['x'.repeat(50), 0],
        ['x'.repeat(50), 0],
        ['x'.repeat(20), 0],
        ['y'.repeat(12), 1],
      ],
      [
        [1, 2],
        [2, 3],
      ],
      [
        { para: 1, ...box },
        { para: 2, ...box },
      ],
      [
        [0, 1],
        [1, 2],
      ],
    )
    expect(one).toEqual([
      [100, 400],
      [100, 400],
      [100, 400],
    ])
    // (the lone line takes the box's measure from its sibling's lines: it may widen to the box's edge, never past it)
    expect(two).toEqual([[100, 400]])
  })
  it('a paragraph of its column’s own width as before', () => {
    const [one] = measuredOf(
      [
        ['x'.repeat(50), 0],
        ['x'.repeat(20), 0],
      ],
      [[1, 1]],
      [{ para: 1, ...plain }],
      [[0, 1]],
    )
    expect(one).toEqual([
      [72, 540],
      [72, 540],
    ])
  })
  it('the instrument keeps a box’s statement of no shape: an \\hsize no page’s frame has; a column’s full width as before', () => {
    const frames = [
      {
        block: [72, 540],
        columns: [
          [72, 300],
          [312, 540],
        ],
      },
    ]
    expect(measureKept({ ...plain, hsize: 228 }, frames)).toBe(false)
    expect(measureKept({ ...plain, hsize: 468 }, frames)).toBe(false)
    expect(measureKept({ ...plain, hsize: 428.03 }, frames)).toBe(true)
    expect(measureKept({ ...plain, hsize: 228, leftskip: 10 }, frames)).toBe(true)
    // (no frame stated: nothing to tell a box's width from, as before)
    expect(measureKept({ ...plain, hsize: 428.03 }, [null])).toBe(false)
  })
  it('a lone line with no sibling of its width: no wider measure than itself, so that it is never widened past its ink', () => {
    const [one] = measuredOf([['z'.repeat(12), 0]], [[1, 0]], [{ para: 1, ...box }], [[0, 1]])
    expect(one).toEqual([[100, 172]])
    // (a line TeX set overfull past the frame: its own extent, never wider than the frame's measure)
    const [over] = measuredOf([['z'.repeat(80), 0]], [[1, 0]], [{ para: 1, ...box }], [[0, 1]])
    expect(over).toEqual([[100, 540]])
  })
  it('the box’s left is where its unindented lines start: a glyph protruded left of them moves it not', () => {
    // (2610.19159v1 p41: one line's first glyph at 82.43, the box's lines at 83.62; placed at the leftmost, the box's right
    // stood 1.2 pt short of its lines' ends)
    const [one] = measuredOf(
      [
        ['x'.repeat(50), 0],
        ['x'.repeat(50), 0, 99],
        ['x'.repeat(50), 0],
        ['x'.repeat(20), 0, 106],
      ],
      [[1, 3]],
      [{ para: 1, ...box }],
      [[0, 1]],
    )
    expect(one.map((l) => l[0])).toEqual([100, 100, 100, 100])
    expect(one.map((l) => l[1])).toEqual([400, 400, 400, 400])
  })
  it('a line TeX set overfull in a box fills nothing: the box placed by a line that fills it (2610.19159v1 p45’s)', () => {
    const [one] = measuredOf(
      [
        ['x'.repeat(50), 0],
        ['x'.repeat(60), 0],
        ['x'.repeat(20), 0],
      ],
      [[1, 2]],
      [{ para: 1, ...box }],
      [[0, 1]],
    )
    expect(one).toEqual([
      [100, 400],
      [100, 400],
      [100, 400],
    ])
  })
})
