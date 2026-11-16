// The separation TeX set under each member's last line by its class (Room.gap) and a heading's paragraph separation (Room.sep),
// read from what the marked compile states (Instrument.tex: heads, glues, skips) and from what stands under the member (locate/
// gaps.ts): documents of our own, B and A the same page.
import { unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import type { Doc } from '../src/doc.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import { docOf, type PageSpec } from './helpers/doc.ts'
import { locate } from './helpers/locate.ts'

const unitOf = (kind: string, s: string): InstrumentUnit => {
  const content = [{ t: 'text' as const, s }]
  return { id: unitId(kind, content), kind, content }
}
/** an instrument over B whose units own B's glyphs line by line (`own[p][line]`, -1 none), its TeX statements `tex` */
function instrumentOf(B: Doc, units: InstrumentUnit[], own: number[][], tex: Instrument['tex']): Instrument {
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
    tex,
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
  }
}
/** the members' rooms of a page laid out by `spec`, each line's unit `own`, with the statements `tex` */
function roomsOf(spec: PageSpec[], units: InstrumentUnit[], own: number[][], tex: Instrument['tex']) {
  const B = docOf(spec)
  const L = locate(instrumentOf(B, units, own, tex), B, align(B, B))
  return L.members.map((m) => m.room)
}
const frames = [{ block: [72, 540] as [number, number], columns: [[72, 540]] as [number, number][], foot: 100 }]
/** a paragraph's statement (AXT-LINES): \baselineskip 12, \parskip and its shrink */
const para = (unit: number, parskip = 0, parskipShrink = 0) => ({ unit, baselineskip: 12, parskip, parskipShrink })
/** a heading's statement (AXT-SECT): article's \section at 10 pt, signed as the class gives it */
const section = (unit: number) => ({
  unit,
  before: [-15.06, -3.44] as [number, number],
  after: [9.9, 0] as [number, number],
  baselineskip: 12,
  parskip: [0, 0] as [number, number],
})
/** the paper's separations at the document's start (AXT-GLUE 0) */
const glues0 = [
  { at: 0, name: 'textfloatsep' as const, natural: 20, shrink: 4 },
  { at: 0, name: 'floatsep' as const, natural: 12, shrink: 2 },
  { at: 0, name: 'intextsep' as const, natural: 12, shrink: 2 },
  { at: 0, name: 'dbltextfloatsep' as const, natural: 20, shrink: 4 },
  { at: 0, name: 'dblfloatsep' as const, natural: 12, shrink: 2 },
  { at: 0, name: 'fpsep' as const, natural: 8, shrink: 0 },
  { at: 0, name: 'abovecaptionskip' as const, natural: 10, shrink: 0 },
  { at: 0, name: 'belowcaptionskip' as const, natural: 0, shrink: 0 },
  { at: 0, name: 'footins' as const, natural: 9, shrink: 4 },
  { at: 0, name: 'footnotesep' as const, natural: 6.65, shrink: 0 },
]

describe('a heading’s separations (the display design’s F12, F40’s form 1)', () => {
  const spec: PageSpec[] = [
    {
      lines: [
        { text: 'para one ends', y: 700 },
        { text: 'Intro', y: 676 },
        { text: 'next para', y: 656 },
      ],
    },
  ]
  const units = [unitOf('para', 'para one ends'), unitOf('heading', 'Intro'), unitOf('para', 'next para')]
  it('states a heading’s after-skip under it and its paragraph separation, and its before-skip over it as TeX adds it', () => {
    const [p0, h, p2] = roomsOf(spec, units, [[0, 1, 2]], {
      frames,
      skips: [para(0), para(2)],
      heads: [section(1)],
    })
    // (the after-skip, then the \baselineskip and \parskip around the heading: 9.9 + 12 + 0)
    expect(h!.gap).toEqual(['afterskip', 9.9, 0])
    expect(h!.sep).toBe(21.9)
    // (article's before-skip, -3.5ex plus -1ex minus -.2ex: TeX adds it negated whole, and indents no first paragraph)
    expect(p0!.gap).toEqual(['beforeskip', 15.06, 3.44])
    // (a paragraph's own separation as before)
    expect(p0!.sep).toBe(12)
    expect(p2!.gap).toBeUndefined()
  })
  it('states nothing of a heading TeX set through no \\@startsection: no separation, no gap over it', () => {
    const [p0, h] = roomsOf(spec, units, [[0, 1, 2]], { frames, skips: [para(0), para(2)] })
    expect(h!.sep).toBeUndefined()
    expect(h!.gap).toBeUndefined()
    expect(p0!.gap).toBeUndefined()
  })
  it('states the skip after a title set in the line, the after-skip negated, and no separation under it', () => {
    const [h] = roomsOf(
      [
        {
          lines: [
            { text: 'Head.', x: 72, y: 700 },
            { text: 'Body runs on', x: 110, y: 700 },
            { text: 'and on', y: 688 },
          ],
        },
      ],
      [unitOf('heading', 'Head.'), unitOf('para', 'Body runs on and on')],
      [[0, 1, 1]],
      { frames, skips: [para(1)], heads: [{ ...section(0), after: [-9.96, 0] }] },
    )
    expect(h!.gap).toEqual(['runin', 9.96, 0])
    expect(h!.sep).toBeUndefined()
  })
})

describe('a paragraph’s separation over a paragraph (\\parskip, natural and shrink)', () => {
  const units = [unitOf('para', 'first para ends here'), unitOf('para', 'second para')]
  it('states the next paragraph’s \\parskip and its shrink', () => {
    const [p0] = roomsOf(
      [
        {
          lines: [
            { text: 'first para', y: 700 },
            { text: 'ends here', y: 688 },
            { text: 'second para', y: 664 },
          ],
        },
      ],
      units,
      [[0, 0, 1]],
      { frames, skips: [para(0), para(1, 2, 1)] },
    )
    expect(p0!.gap).toEqual(['parskip', 2, 1])
  })
  it('states none where ink no unit owns stands between, or where the next paragraph states no shrink', () => {
    const [p0] = roomsOf(
      [
        {
          lines: [
            { text: 'first para', y: 700 },
            { text: 'ends here', y: 688 },
            { text: 'second para', y: 650 },
          ],
          // (a rule across the column between them)
          boxes: [[19, 16, 72, 670, 300, 671]],
        },
      ],
      units,
      [[0, 0, 1]],
      { frames, skips: [para(0), para(1, 2, 1)] },
    )
    expect(p0!.gap).toBeUndefined()
    const [q0] = roomsOf(
      [
        {
          lines: [
            { text: 'first para', y: 700 },
            { text: 'ends here', y: 688 },
            { text: 'second para', y: 664 },
          ],
        },
      ],
      units,
      [[0, 0, 1]],
      { frames, skips: [para(0), { unit: 1, baselineskip: 12, parskip: 2 }] },
    )
    expect(q0!.gap).toBeUndefined()
  })
})

describe('a float’s separations (2c’s F-last and F-sep), read by TeX’s own case from the page', () => {
  const cap = (s: string) => unitOf('caption', s)
  const body = (s: string) => unitOf('para', s)
  /** a page's lines, each [text, y, unit], with the brackets `fs<n>`/`fe<n>` round the floats' lines (`floats`: [n, first line,
   *  last line]) and `bs<n>`/`be<n>` round the column bodies' (`bodies`, the same), in B's stream order: at one glyph a bracket
   *  that closes before one that opens, a body's opening after a float's closing (\@makecol sets the top list over the body) */
  const pageOf = (
    lines: [string, number][],
    floats: [number, number, number][],
    bodies: [number, number, number][] = [],
  ) => {
    const starts: number[] = []
    let k = 0
    for (const [t] of lines) {
      starts.push(k)
      k += t.length
    }
    starts.push(k)
    const points: [string, number, number][] = []
    for (const [n, a, b] of floats) points.push([`fs${n}`, starts[a]!, 2], [`fe${n}`, starts[b + 1]!, 0])
    for (const [n, a, b] of bodies) points.push([`bs${n}`, starts[a]!, 1], [`be${n}`, starts[b + 1]!, 0])
    points.sort((x, y) => x[1] - y[1] || x[2] - y[2])
    return {
      lines: lines.map(([text, y]) => ({ text, y })),
      points: points.map(([n, g]) => [n, g] as [string, number]),
    }
  }
  it('states a top float’s \\textfloatsep under its last member, a float set here its \\intextsep on both sides', () => {
    const [c0] = roomsOf(
      [
        pageOf(
          [
            ['Figure 1 caption', 700],
            ['body text', 660],
            ['more body', 636],
          ],
          [[1, 0, 0]],
          [[2, 1, 2]],
        ),
      ],
      [cap('Figure 1 caption'), body('body text'), body('more body')],
      [[0, 1, 2]],
      { frames, skips: [para(1), para(2)], glues: glues0 },
    )
    expect(c0!.gap).toEqual(['textfloatsep', 20, 4])
    const [b0, c1, b2] = roomsOf(
      [
        pageOf(
          [
            ['body above', 700],
            ['Figure 2 caption', 660],
            ['body below', 620],
          ],
          [[2, 1, 1]],
          [[1, 0, 2]],
        ),
      ],
      [body('body above'), cap('Figure 2 caption'), body('body below')],
      [[0, 1, 2]],
      { frames, skips: [para(0), para(2)], glues: glues0 },
    )
    expect(c1!.gap).toEqual(['intextsep', 12, 2])
    expect(b0!.gap).toEqual(['intextsep', 12, 2])
    expect(b2!.gap).toBeUndefined()
  })
  it('states the two \\intextsep TeX set between two floats set here one over the other, whole: natural sizes and shrinks added', () => {
    // (2608.04322v1 p9: float.sty's [H] Figures 7 and 8, \float@endH's `\vskip\intextsep \box \vskip\intextsep` each, the
    // second float's picture between the captions on A; the coordinator's ruling of 2026-11-16: the gap is the glue TeX set
    // between the two members whole, each float's own value; the second's under it, the body going on, its own one)
    const [b0, c1, c2, b3] = roomsOf(
      [
        {
          ...pageOf(
            [
              ['body above', 700],
              ['cap a', 660],
              ['cap b', 600],
              ['body below', 560],
            ],
            [
              [1, 1, 1],
              [2, 2, 2],
            ],
            [[3, 0, 3]],
          ),
          boxes: [[5, -3, 72, 612, 200, 650]] as [number, number, number, number, number, number][],
        },
      ],
      [body('body above'), cap('cap a'), cap('cap b'), body('body below')],
      [[0, 1, 2, 3]],
      { frames, skips: [para(0), para(3)], glues: [...glues0, { at: 2, name: 'intextsep', natural: 10, shrink: 1 }] },
    )
    expect(b0!.gap).toEqual(['intextsep', 12, 2])
    expect(c1!.gap).toEqual(['intextsep', 22, 3])
    expect(c2!.gap).toEqual(['intextsep', 10, 1])
    expect(b3!.gap).toBeUndefined()
  })
  it('states a bottom float’s \\textfloatsep over it, and nothing under it', () => {
    const [b0, c1] = roomsOf(
      [
        pageOf(
          [
            ['body above', 700],
            ['Figure 3 caption', 660],
          ],
          [[3, 1, 1]],
          [[2, 0, 0]],
        ),
      ],
      [body('body above'), cap('Figure 3 caption')],
      [[0, 1]],
      { frames, skips: [para(0)], glues: glues0 },
    )
    expect(b0!.gap).toEqual(['textfloatsep', 20, 4])
    expect(c1!.gap).toBeUndefined()
  })
  it('states \\floatsep between two floats of a column’s top list, the next one’s own ink between them, the values the float states', () => {
    // (two figures at the column's top, the second's picture between the two captions on A)
    const [c0, c1] = roomsOf(
      [
        {
          ...pageOf(
            [
              ['cap a', 700],
              ['cap b', 640],
              ['body', 610],
            ],
            [
              [1, 0, 0],
              [2, 1, 1],
            ],
            [[3, 2, 2]],
          ),
          // (the second float's picture, before its caption in its box)
          boxes: [[5, -3, 72, 652, 200, 690]] as [number, number, number, number, number, number][],
        },
      ],
      [cap('cap a'), cap('cap b'), body('body')],
      [[0, 1, 2]],
      // (the second float states a \textfloatsep of its own: in force from its serial on)
      { frames, skips: [para(2)], glues: [...glues0, { at: 2, name: 'textfloatsep', natural: 30, shrink: 0 }] },
    )
    expect(c0!.gap).toEqual(['floatsep', 12, 2])
    expect(c1!.gap).toEqual(['textfloatsep', 30, 0])
  })
  it('states \\@fpsep between two floats of a column of floats beside a column’s body, nothing under its last', () => {
    const two = [
      {
        block: [72, 540] as [number, number],
        columns: [
          [72, 300],
          [312, 540],
        ] as [number, number][],
        foot: 100,
      },
    ]
    const lines = [
      { text: 'cap a', x: 72, y: 700 },
      { text: 'cap b', x: 72, y: 600 },
      { text: 'right body', x: 330, y: 700 },
    ]
    const n = (k: number) => lines.slice(0, k).reduce((t, l) => t + l.text.length, 0)
    const [d0, d1] = roomsOf(
      [
        {
          lines,
          points: [
            ['fs1', 0],
            ['fe1', n(1)],
            ['fs2', n(1)],
            ['fe2', n(2)],
            ['bs3', n(2)],
            ['be3', n(3)],
          ],
        },
      ],
      [cap('cap a'), cap('cap b'), body('right body')],
      [[0, 1, 2]],
      { frames: two, skips: [para(2)], glues: glues0, bodySides: [[3, 2]] },
    )
    expect(d0!.gap).toEqual(['fpsep', 8, 0])
    expect(d1!.gap).toBeUndefined()
  })
  it('states no float’s separation on a page its output routine bracketed whole (a class’s own, a page of floats)', () => {
    const [b0, c1, c2] = roomsOf(
      [
        pageOf(
          [
            ['body above', 700],
            ['cap a', 660],
            ['cap b', 620],
          ],
          [
            [2, 1, 1],
            [3, 2, 2],
          ],
          [[1, 0, 2]],
        ),
      ],
      [body('body above'), cap('cap a'), cap('cap b')],
      [[0, 1, 2]],
      { frames, skips: [para(0)], glues: glues0, whole: [1] },
    )
    expect(b0!.gap).toBeUndefined()
    expect(c1!.gap).toBeUndefined()
    expect(c2!.gap).toBeUndefined()
  })
  it('states \\dblfloatsep between two floats over both columns and \\dbltextfloatsep under the last', () => {
    const left = ['left one', 'left two', 'left three'].map((t, i) => ({ text: t, x: 72, y: 600 - 12 * i }))
    const right = ['right one', 'right two', 'right three'].map((t, i) => ({ text: t, x: 330, y: 600 - 12 * i }))
    const capA = 'Figure 1: a caption across both of the columns'
    const capB = 'Figure 2: another caption across both columns'
    const lines = [{ text: capA, x: 72, y: 700 }, { text: capB, x: 72, y: 650 }, ...left, ...right]
    const L = (k: number) => lines.slice(0, k).reduce((t, l) => t + l.text.length, 0)
    const two = [
      {
        block: [72, 540] as [number, number],
        columns: [
          [72, 300],
          [312, 540],
        ] as [number, number][],
        foot: 100,
      },
    ]
    const [c0, c1] = roomsOf(
      [
        {
          lines,
          points: [
            ['fs1', 0],
            ['fe1', L(1)],
            ['fs2', L(1)],
            ['fe2', L(2)],
            ['bs3', L(2)],
            ['be3', L(5)],
            ['bs4', L(5)],
            ['be4', L(8)],
          ],
        },
      ],
      [cap(capA), cap(capB), body('left one left two left three'), body('right one right two right three')],
      [[0, 1, 2, 2, 2, 3, 3, 3]],
      {
        frames: two,
        skips: [para(2), para(3)],
        glues: glues0,
        bodySides: [
          [3, 1],
          [4, 2],
        ],
      },
    )
    expect(c0!.gap).toEqual(['dblfloatsep', 12, 2])
    expect(c1!.gap).toEqual(['dbltextfloatsep', 20, 4])
  })
  it('states a caption’s skips inside its float: over it \\abovecaptionskip, under it \\belowcaptionskip', () => {
    const [x0, c1, t2] = roomsOf(
      [
        pageOf(
          [
            ['inside text', 700],
            ['Table 1 caption', 676],
            ['cell', 652],
            ['body', 600],
          ],
          [[1, 0, 2]],
          [[2, 3, 3]],
        ),
      ],
      [body('inside text'), cap('Table 1 caption'), unitOf('cell', 'cell'), body('body')],
      [[0, 1, 2, 3]],
      { frames, skips: [para(0), para(3)], glues: glues0 },
    )
    expect(x0!.gap).toEqual(['abovecaptionskip', 10, 0])
    expect(c1!.gap).toEqual(['belowcaptionskip', 0, 0])
    expect(t2!.gap).toEqual(['textfloatsep', 20, 4])
  })
  it('states nothing under a float’s member where ink no unit owns stands under it: it may be the float’s own', () => {
    const page = pageOf(
      [
        ['Figure 4 caption', 700],
        ['body text', 600],
      ],
      [[4, 0, 0]],
    )
    const [c0] = roomsOf(
      [{ ...page, boxes: [[16, 2, 72, 640, 300, 690]] }],
      [cap('Figure 4 caption'), body('body text')],
      [[0, 1]],
      { frames, skips: [para(1)], glues: glues0 },
    )
    expect(c0!.gap).toBeUndefined()
  })
  it('states a float across both columns’ \\dbltextfloatsep', () => {
    const left = ['left one', 'left two', 'left three', 'left four'].map((t, i) => ({
      text: t,
      x: 72,
      y: 640 - 12 * i,
    }))
    const right = ['right one', 'right two', 'right three'].map((t, i) => ({ text: t, x: 330, y: 640 - 12 * i }))
    const capText = 'Figure 5: a caption across both of the columns'
    const lines = [{ text: capText, x: 72, y: 700 }, ...left, ...right]
    const [c0] = roomsOf(
      [
        {
          lines,
          // (the float over both columns, then each column's body: left, right)
          points: [
            ['fs5', 0],
            ['fe5', capText.length],
            ['bs6', capText.length],
            ['be6', capText.length + left.reduce((n, l) => n + l.text.length, 0)],
            ['bs7', capText.length + left.reduce((n, l) => n + l.text.length, 0)],
            ['be7', lines.reduce((n, l) => n + l.text.length, 0)],
          ],
        },
      ],
      [cap(capText), body('left one left two left three left four'), body('right one right two right three')],
      [[0, 1, 1, 1, 1, 2, 2, 2]],
      { frames, skips: [para(1), para(2)], glues: glues0 },
    )
    expect(c0!.gap).toEqual(['dbltextfloatsep', 20, 4])
  })
  it('reads a float’s place by TeX’s brackets: a top float under a two-column title block, the block no body text', () => {
    // (\twocolumn[…]'s title block over the columns, in no column's body; the float on the column's top list, its bracket
    // before the body's: TeX sets \textfloatsep under it, and no float's separation under the title block (2611.03953v2 p1))
    const [t0, c1] = roomsOf(
      [
        pageOf(
          [
            ['Title of the paper', 740],
            ['Figure 1 caption', 700],
            ['body text', 660],
            ['more body', 636],
          ],
          [[1, 1, 1]],
          [[2, 2, 3]],
        ),
      ],
      [unitOf('author', 'Title of the paper'), cap('Figure 1 caption'), body('body text'), body('more body')],
      [[0, 1, 2, 3]],
      { frames, skips: [para(2), para(3)], glues: glues0 },
    )
    expect(c1!.gap).toEqual(['textfloatsep', 20, 4])
    expect(t0!.gap).toBeUndefined()
  })
  it('reads a float the page builder met at the head of its column’s body as set here: \\intextsep under it', () => {
    // (an [h] float first in the main list: its bracket inside the body's, nothing of the body over it)
    const [c0] = roomsOf(
      [
        pageOf(
          [
            ['Figure 6 caption', 700],
            ['body text', 660],
            ['more body', 636],
          ],
          [[1, 0, 0]],
          [[2, 0, 2]],
        ),
      ],
      [cap('Figure 6 caption'), body('body text'), body('more body')],
      [[0, 1, 2]],
      { frames, skips: [para(1), para(2)], glues: glues0 },
    )
    expect(c0!.gap).toEqual(['intextsep', 12, 2])
  })
  it('states no float’s separation on a page whose compile states no column body', () => {
    const [c0, b1] = roomsOf(
      [
        pageOf(
          [
            ['Figure 7 caption', 700],
            ['body text', 660],
          ],
          [[1, 0, 0]],
        ),
      ],
      [cap('Figure 7 caption'), body('body text')],
      [[0, 1]],
      { frames, skips: [para(1)], glues: glues0 },
    )
    expect(c0!.gap).toBeUndefined()
    expect(b1!.gap).toBeUndefined()
  })
})

describe('the footnotes’ separations', () => {
  it('states \\skip\\footins over the footnotes (TeX’s rule between is its own) and \\footnotesep between two', () => {
    const [b0, n1] = roomsOf(
      [
        {
          lines: [
            { text: 'body ends', y: 700 },
            { text: 'note one', y: 620 },
            { text: 'note two', y: 608 },
          ],
          boxes: [[9, 16, 72, 640, 144, 640.4]],
        },
      ],
      [unitOf('para', 'body ends'), unitOf('footnote', 'note one'), unitOf('footnote', 'note two')],
      [[0, 1, 2]],
      { frames, skips: [para(0), para(1), para(2)], glues: glues0 },
    )
    expect(b0!.gap).toEqual(['footins', 9, 4])
    expect(n1!.gap).toEqual(['footnotesep', 6.65, 0])
  })
})
