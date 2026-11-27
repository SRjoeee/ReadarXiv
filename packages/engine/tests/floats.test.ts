// Each float's box on A from the brackets the marked compile makes round it (locate/floats.ts): documents of our own, B our
// compile and A arXiv's, the float's ink the glyphs and boxes between its `fs<n>` and `fe<n>` points on B, its box the union of
// their partners on A, refused on any doubt.
import { unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import type { Doc } from '../src/doc.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import type { FloatBox } from '../src/locate/floats.ts'
import { docOf, type PageSpec } from './helpers/doc.ts'
import { locate } from './helpers/locate.ts'

const unitOf = (kind: string, s: string, float?: string): InstrumentUnit => {
  const content = [{ t: 'text' as const, s }]
  return { id: unitId(kind, content), kind, content, ...(float ? { float } : {}) }
}
/** an instrument over B whose units own B's glyphs line by line (`own[p][line]`, -1 none) */
function instrumentOf(B: Doc, units: InstrumentUnit[], own: number[][]): Instrument {
  return {
    ink: B,
    units,
    glyphs: B.pages.map((pg, p) => {
      const O = ownersOf(pg.glyphs.length)
      pg.glyphs.forEach((g, j) => {
        O.unit[j] = own[p]?.[g.n] ?? -1
        O.role[j] = ROLE.text
      })
      return O
    }),
    boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
    tex: {},
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
  }
}
/** the first glyph of each line of a page spec (the docOf glyph index), and one past its last */
const startsOf = (spec: PageSpec): number[] => {
  const out: number[] = []
  let n = 0
  for (const l of spec.lines) {
    out.push(n)
    n += [...(typeof l === 'string' ? l : l.text)].length
  }
  out.push(n)
  return out
}
/** a doc of the specs with each named point's box index set by hand (`boxAt`: a point before a box at the same glyph) */
function docWith(specs: PageSpec[], boxes: Record<string, number> = {}): Doc {
  const d = docOf(specs)
  for (const pg of d.pages) for (const pt of pg.points) if (pt.name in boxes) pt.box = boxes[pt.name]!
  return d
}
function floatsOf(B: Doc, A: Doc, units: InstrumentUnit[], own: number[][]): FloatBox[] {
  return locate(instrumentOf(B, units, own), A, align(B, A)).floats
}

// A page: a body line, then a float (an image, a line of its text, its caption), then a body line
const IMAGE: [number, number, number, number] = [72, 655, 200, 690]
const lines = [
  { text: 'Body text above here', y: 720 },
  { text: 'Fig text', y: 645 },
  { text: 'Figure 1: A cat.', y: 630 },
  { text: 'Body text below here', y: 580 },
]
const at = startsOf({ lines })
const page = (o: { image?: boolean; points?: [string, number][]; extra?: PageSpec['boxes'] } = {}): PageSpec => ({
  lines,
  boxes: [
    ...(o.image === false ? [] : [[at[1]!, -3, ...IMAGE] as [number, number, number, number, number, number]]),
    ...(o.extra ?? []),
  ],
  points: o.points ?? [
    ['fs1', at[1]!],
    ['fe1', at[3]!],
  ],
})
const units = [
  unitOf('para', 'Body text above here'),
  unitOf('caption', 'Figure 1: A cat.', 'figure'),
  unitOf('para', 'Body text below here'),
]
const own = [[0, -1, 1, 2]]

describe('a float’s box from its brackets (floats.ts)', () => {
  it('a float whose glyphs and image all pair on A gets their union, its caption and type', () => {
    const B = docWith([page()], { fs1: 0 })
    const [f] = floatsOf(B, B, units, own)
    expect(f).toMatchObject({
      serial: 1,
      page: 1,
      caption: 1,
      captions: [1],
      type: 'figure',
      cause: null,
      foreign: 0,
      cut: 0,
    })
    // (the image's box and the text lines' ink: 'Fig text' and the caption, 0.6 of the size a glyph across, 0.2 down, 0.7 up)
    expect(f!.box).toEqual([72, 628, 200, 690])
  })
  it('a float with an image unpaired on A gets no box', () => {
    const B = docWith([page()], { fs1: 0 })
    const A = docWith([page({ image: false })])
    const [f] = floatsOf(B, A, units, own)
    expect(f).toMatchObject({ cause: 'unpaired', box: null, unpaired: 1 })
  })
  it('a float whose box holds another unit’s glyph gets no box', () => {
    // (a body line set beside the float, in its box's height, before its bracket in B's stream: a wrapped figure's text)
    const beside = [{ text: 'Body text above here', y: 720 }, { text: 'wrap', x: 150, y: 640 }, ...lines.slice(1)]
    const s = startsOf({ lines: beside })
    const spec: PageSpec = {
      lines: beside,
      boxes: [[s[2]!, -3, ...IMAGE]],
      points: [
        ['fs1', s[2]!],
        ['fe1', s[4]!],
      ],
    }
    const B = docWith([spec], { fs1: 0 })
    const [f] = floatsOf(B, B, [units[0]!, unitOf('para', 'wrap'), units[1]!, units[2]!], [[0, 1, -1, 2, 3]])
    expect(f).toMatchObject({ cause: 'foreign', box: null, foreign: 4 })
  })
  it('ink no member owns crossing the box’s edge refuses it; ink round it whole does not', () => {
    // (A paints a path of its own after the body line below, from inside the float's box to past its right edge)
    const B = docWith([page()], { fs1: 0 })
    const A = docWith([page({ extra: [[at[4]!, 0, 190, 640, 300, 645]] })], { fs1: 0 })
    const [f] = floatsOf(B, A, units, own)
    expect(f).toMatchObject({ cause: 'cut', box: null, cut: 1 })
    // (a frame round the whole page, painted first: no cut)
    const framed = docWith([page({ extra: [[0, 0, 20, 20, 590, 770]] })], { fs1: 1 })
    const [g] = floatsOf(framed, framed, units, own)
    expect(g).toMatchObject({ cause: null, cut: 0 })
  })
  it('a caption crossing its bracket’s end refuses the float', () => {
    const B = docWith(
      [
        page({
          points: [
            ['fs1', at[1]!],
            ['fe1', at[2]! + 4],
          ],
        }),
      ],
      { fs1: 0 },
    )
    const [f] = floatsOf(B, B, units, own)
    expect(f).toMatchObject({ cause: 'caption', box: null })
  })
  it('a caption of no bracket is stated with its type and no box', () => {
    const B = docWith([page({ points: [] })])
    const fs = floatsOf(B, B, [units[0]!, unitOf('caption', 'Figure 1: A cat.', 'table'), units[2]!], own)
    expect(fs).toEqual([
      expect.objectContaining({ serial: -1, page: 1, caption: 1, type: 'table', cause: 'unbracketed', box: null }),
    ])
  })
  it('nested brackets give the outer float, its caption the one no other caption’s part', () => {
    const nested: PageSpec = {
      lines: [
        { text: 'Body text above here', y: 720 },
        { text: 'Fig text', y: 645 },
        { text: '(a) A part.', y: 638 },
        { text: 'Figure 1: A cat.', y: 626 },
        { text: 'Body text below here', y: 580 },
      ],
    }
    const s = startsOf(nested)
    nested.boxes = [[s[1]!, -3, ...IMAGE]]
    nested.points = [
      ['fs1', s[1]!],
      ['fs2', s[1]!],
      ['fe2', s[3]!],
      ['fe1', s[4]!],
    ]
    const B = docWith([nested], { fs1: 0, fs2: 0 })
    const u = [
      units[0]!,
      unitOf('caption', '(a) A part.', 'subfigure'),
      unitOf('caption', 'Figure 1: A cat.', 'figure'),
      units[2]!,
    ]
    const fs = floatsOf(B, B, u, [[0, -1, 1, 2, 3]])
    expect(fs).toHaveLength(1)
    expect(fs[0]).toMatchObject({ serial: 1, caption: 2, captions: [1, 2], type: 'figure', cause: null })
    expect(fs[0]!.box).toEqual([72, 624, 200, 690])
  })
  it('a float of a type with no counter (fn<n>) is no float here', () => {
    const B = docWith(
      [
        page({
          points: [
            ['fs1', at[1]!],
            ['fn1', at[1]!],
            ['fe1', at[3]!],
          ],
        }),
      ],
      { fs1: 0, fn1: 0 },
    )
    expect(floatsOf(B, B, [units[0]!, unitOf('para', 'Figure 1: A cat.'), units[2]!], own)).toEqual([])
  })
  it('a float whose bracket TeX did not close on its page gets no box', () => {
    const B = docWith([page({ points: [['fs1', at[1]!]] })], { fs1: 0 })
    const fs = floatsOf(B, B, units, own)
    expect(fs.map((f) => [f.serial, f.cause])).toEqual([
      [1, 'unclosed'],
      [-1, 'unbracketed'],
    ])
  })
})
