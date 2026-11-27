// Where each destination lands (locate/targets.ts): a destination's point on A matched to what stands at it or first under it in
// its column, the kind that thing is the link's. Members of our own on a page of US Letter, two columns where a test says so.
import type { El, Line } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import type { InstrumentUnit, TexFrame } from '../src/instrument.ts'
import type { DestPoint } from '../src/locate/dests.ts'
import type { FloatBox } from '../src/locate/floats.ts'
import { LAND_BELOW, SECTION_WINDOW, targetsOf } from '../src/locate/targets.ts'
import type { Member, Work } from '../src/locate/work.ts'

/** a line: page, column, its ink across, its baseline, its band 7 up and 2 down, its measure */
const line = (page: number, y: number, x0 = 72, x1 = 300, m0 = 72, m1 = 300, column = 0): Line => [
  page,
  column,
  x0,
  x1,
  y,
  y + 7,
  y - 2,
  m0,
  m1,
  0,
]
type Spec = {
  kind: string
  lines: Line[]
  entry?: true
  els?: [string, El][]
  glyphs?: number[][]
  /** its label's ink: page, x0, y0, x1, y1, baseline */
  label?: [number, number, number, number, number, number]
  /** its unit's classes (the instrument's: what the bundle states each element's kind and text by) */
  classes?: [string, { cls: string; text?: string }][]
}
/** B's column bodies for the fake: each A glyph's B glyph (`toB`), each B page's glyph count and its body brackets' points */
type Bodies = { toB: Record<number, number>; pages: { n: number; points: [string, number][] }[] }
function workOf(specs: Spec[], frames: Map<number, TexFrame> = new Map(), pages = 2, bodies?: Bodies): Work {
  const units: InstrumentUnit[] = specs.map((s, i) => ({
    id: `${i}`.padStart(64, '0'),
    kind: s.kind,
    content: [],
    ...(s.entry ? { entry: true as const } : {}),
    ...(s.classes ? { classes: s.classes } : {}),
  }))
  const members = specs.map(
    (s, ord) =>
      ({
        ord,
        unit: ord,
        kind: s.kind,
        located: true,
        lines: s.lines,
        elements: s.els ?? [],
        lineGlyphs: s.glyphs ?? [],
        ...(s.label ? { labelAt: { kind: 'number', ink: s.label } } : {}),
      }) as unknown as Member,
  )
  const bp = bodies?.pages ?? []
  const offB = new Int32Array(bp.length + 1)
  bp.forEach((p, i) => {
    offB[i + 1] = offB[i]! + p.n
  })
  const aToB = new Int32Array(1000).fill(-1)
  for (const [a, b] of Object.entries(bodies?.toB ?? {})) aToB[Number(a)] = b
  const pageB = new Int32Array(offB[bp.length]!)
  bp.forEach((_, i) => {
    pageB.fill(i + 1, offB[i]!, offB[i + 1]!)
  })
  const B = {
    pages: bp.map((p) => ({
      glyphs: { length: p.n },
      points: p.points.map(([name, glyph]) => ({ name, glyph, box: 0 })),
    })),
  }
  const view: [number, number, number, number] = [0, 0, 612, 792]
  return {
    members,
    units,
    ix: {
      framesA: frames,
      inkA: { pages: Array.from({ length: pages }, () => ({ view })) },
      B,
      ins: { tex: {} },
      m: { aToB, offB },
      pageB,
    },
  } as unknown as Work
}
/** destinations by name, written as Link.to.dest writes them (PDF.js's dest as JSON) */
const dests = (o: Record<string, DestPoint | null>) =>
  new Map(Object.entries(o).map(([k, v]) => [JSON.stringify(k), v]))
const q = (name: string) => JSON.stringify(name)
const floatOf = (o: Partial<FloatBox>): FloatBox => ({
  serial: 1,
  page: 1,
  caption: null,
  captions: [],
  type: 'figure',
  box: null,
  union: null,
  cause: null,
  members: [],
  foreign: 0,
  cut: 0,
  outside: 0,
  unpaired: 0,
  ...o,
})

describe('where a destination lands (targets.ts)', () => {
  const refs: Spec[] = [
    { kind: 'reference', entry: true, lines: [line(1, 700, 80), line(1, 688, 90)] },
    { kind: 'reference', entry: true, lines: [line(1, 670, 80), line(1, 658, 90)] },
  ]
  it('a point between two references lands on the one below it; a point just over a reference’s first line lands on it', () => {
    const t = targetsOf(
      workOf(refs),
      dests({ 'cite.b': { page: 1, x: 72, y: 682 }, 'cite.a': { page: 1, x: 72, y: 703 } }),
      [],
    )
    expect(t).toEqual([
      { dest: q('cite.a'), kind: 'reference', page: 1, ord: 0, box: [80, 686, 300, 707] },
      { dest: q('cite.b'), kind: 'reference', page: 1, ord: 1, box: [80, 656, 300, 677] },
    ])
  })
  it('a point over no covered member lands nowhere: a theorem, a page anchor (no height), too far over the next line', () => {
    const w = workOf([
      { kind: 'theorem', lines: [line(1, 700)] },
      ...refs.map((r) => ({ ...r, lines: r.lines.map((l) => line(1, l[4] - 200, l[2])) })),
    ])
    const t = targetsOf(
      w,
      dests({
        theorem: { page: 1, x: 72, y: 708 },
        fit: { page: 1, x: null, y: null },
        far: { page: 1, x: 72, y: 500 + 7 + LAND_BELOW + 1 },
        gone: null,
      }),
      [],
    )
    expect(t).toEqual([])
  })
  it('a point just over a heading lands on it, its window across its measure', () => {
    const w = workOf(
      [{ kind: 'heading', lines: [line(1, 600, 72, 140, 72, 300)] }],
      new Map([[1, { block: [72, 540], columns: [[72, 300]], foot: 72 }]]),
    )
    const [t] = targetsOf(w, dests({ 'section.1': { page: 1, x: 72, y: 618 } }), [])
    expect(t).toMatchObject({ dest: q('section.1'), kind: 'heading', page: 1, ord: 0 })
    // (on the format's grid, outward)
    expect(t!.box).toEqual([72, Math.floor((607 - SECTION_WINDOW * 792) * 100) / 100, 300, 607])
    expect(t!.next).toBeUndefined()
  })
  it('a heading 60 pt over its page’s text foot runs on to the next page’s text head, in its column', () => {
    const frame = (foot: number): TexFrame => ({ block: [72, 540], columns: [[72, 540]], foot })
    const w = workOf(
      [
        { kind: 'heading', lines: [line(1, 160, 72, 140, 72, 540)] },
        { kind: 'para', lines: [line(2, 700, 72, 540, 72, 540), line(2, 688)], glyphs: [[101], [102]] },
      ],
      new Map([
        [1, frame(107)],
        [2, frame(107)],
      ]),
      2,
      {
        toB: { 101: 3, 102: 4 },
        pages: [
          { n: 0, points: [] },
          {
            n: 10,
            points: [
              ['bs1', 0],
              ['be1', 10],
            ],
          },
        ],
      },
    )
    const [t] = targetsOf(w, dests({ 'section.2': { page: 1, x: 72, y: 170 } }), [])
    const rest = 107 - (167 - SECTION_WINDOW * 792)
    expect(t).toMatchObject({ kind: 'heading', page: 1, box: [72, 107, 540, 167] })
    expect(t!.next![0]).toBe(2)
    expect(t!.next![1]).toEqual([72, Math.floor((707 - rest) * 100) / 100, 540, 707])
  })
  it('a display’s point lands on its ink, the paragraph’s measure the column it is found in', () => {
    const display: El = { kind: 'display', ink: [[1, 150, 600, 250, 630, 610]] }
    const w = workOf([{ kind: 'para', lines: [line(1, 650), line(1, 580)], els: [['e1', display]] }])
    const [t] = targetsOf(w, dests({ 'equation.1': { page: 1, x: 72, y: 625 } }), [])
    // (no line's band holds the point; the display's baseline is the first under it, within LAND_BELOW)
    expect(t).toEqual({ dest: q('equation.1'), kind: 'display', page: 1, ord: 0, box: [150, 600, 250, 630] })
  })
  it('a point raised over a display into the band of the short line before it lands on the display, not on that line', () => {
    // (hyperref raises an equation's anchor by \baselineskip from the display's baseline, at the display's left edge: here onto
    // the baseline of the paragraph's last line before it, whose ink ends left of the point)
    const display: El = { kind: 'display', ink: [[1, 150, 600, 250, 618, 607]] }
    const w = workOf([{ kind: 'para', lines: [line(1, 640), line(1, 625, 72, 131)], els: [['e1', display]] }])
    const [t] = targetsOf(w, dests({ 'equation.1': { page: 1, x: 150, y: 625 } }), [])
    expect(t).toMatchObject({ kind: 'display', box: [150, 600, 250, 618] })
  })
  it('a raised anchor in the band of the entry above, left of its ink, lands on the entry under it', () => {
    // (the entry above ends with a line at the point's height, indented past the point; the entry under begins 18 below it)
    const [t] = targetsOf(workOf(refs), dests({ 'cite.b': { page: 1, x: 80, y: 688 } }), [])
    expect(t).toMatchObject({ kind: 'reference', ord: 1 })
  })
  it('a point raised past the last line of the entry above lands on the entry under it: a line that begins nothing is passed', () => {
    // (the raise, 11.3, larger than the pitch from the entry above's last line, 10.5: that line's baseline stands 0.8 under the
    // point, the entry's first 11.3 under it)
    const w = workOf(
      [
        { kind: 'reference', entry: true, lines: [line(1, 151.66, 50), line(1, 141.2, 68)] },
        { kind: 'reference', entry: true, lines: [line(1, 130.4, 50), line(1, 119.9, 68)] },
      ],
      new Map([[1, { block: [50, 300], columns: [[50, 300]] }]]),
    )
    const [t] = targetsOf(w, dests({ 'cite.b': { page: 1, x: 50, y: 141.74 } }), [])
    expect(t).toMatchObject({ kind: 'reference', ord: 1 })
  })
  it('a point at the left edge of a line that begins nothing lands nowhere, not on the beginning under it', () => {
    // (an item of a list inside a paragraph's unit: its anchor raised over its line, at the line's left edge; a display under)
    const display: El = { kind: 'display', ink: [[1, 150, 665, 250, 676, 670]] }
    const w = workOf([{ kind: 'para', lines: [line(1, 700), line(1, 680, 90)], els: [['e1', display]] }])
    expect(targetsOf(w, dests({ 'Item.1': { page: 1, x: 90, y: 692 } }), [])).toEqual([])
  })
  it('a point at the left edge of an entry’s label lands on that entry, past a line under the point that begins elsewhere', () => {
    // (the entry above's last line, indented, 0.9 under the point; the label at the point's x 11.3 under it; no frame)
    const w = workOf([
      { kind: 'reference', entry: true, lines: [line(1, 151.66, 50), line(1, 141.2, 50)] },
      { kind: 'reference', entry: true, lines: [line(1, 130.4, 50), line(1, 119.9, 68)] },
    ])
    const [t] = targetsOf(w, dests({ 'cite.b': { page: 1, x: 50, y: 142.1 } }), [])
    // (both lines begin at 50: the higher under the point is the entry above's second line, which begins nothing: nowhere,
    // never the entry above)
    expect(t).toBeUndefined()
  })
  it('a destination set on a line, its point on that line’s ink at its baseline, lands on that line’s member', () => {
    const w = workOf([
      { kind: 'theorem', lines: [line(1, 700)] },
      { kind: 'footnote', lines: [line(1, 690)] },
    ])
    expect(targetsOf(w, dests({ 'thm.1': { page: 1, x: 100, y: 700 } }), [])).toEqual([])
  })
  it('a biblatex entry, one entry a unit made on A, is a reference', () => {
    const [t] = targetsOf(
      workOf([{ kind: 'inkreferences', lines: [line(1, 700, 80)] }]),
      dests({ 'cite.c': { page: 1, x: 72, y: 712 } }),
      [],
    )
    expect(t).toMatchObject({ kind: 'reference', ord: 0, box: [80, 698, 300, 707] })
  })
  it('a figure’s point at its caption lands on the float’s box; a hypcap point at its top lands on the float', () => {
    const w = workOf([
      { kind: 'para', lines: [line(1, 720)] },
      { kind: 'caption', lines: [line(1, 630, 72, 168)] },
    ])
    const f = floatOf({ page: 1, caption: 1, captions: [1], box: [72, 628, 200, 690] })
    const t = targetsOf(
      w,
      dests({ 'figure.1': { page: 1, x: 72, y: 645 }, 'figure.caption.1': { page: 1, x: 72, y: 700 } }),
      [f],
    )
    expect(t).toEqual([
      { dest: q('figure.1'), kind: 'float', page: 1, ord: 1, box: [72, 628, 200, 690] },
      { dest: q('figure.caption.1'), kind: 'float', page: 1, ord: 1, box: [72, 628, 200, 690] },
    ])
  })
  it('a float with no box lands nowhere, at its caption or at its top', () => {
    const w = workOf([{ kind: 'caption', lines: [line(1, 630, 72, 168)] }])
    const f = floatOf({ page: 1, caption: 0, captions: [0], box: null, cause: 'foreign' })
    expect(targetsOf(w, dests({ 'figure.1': { page: 1, x: 72, y: 645 } }), [f])).toEqual([])
  })
  it('a display of a paragraph across both columns is in its own column: a point in the other lands nowhere on it', () => {
    const frames = new Map([
      [
        1,
        {
          block: [72, 540] as [number, number],
          columns: [
            [72, 300],
            [312, 540],
          ] as [number, number][],
        },
      ],
    ])
    const display: El = { kind: 'display', ink: [[1, 150, 600, 250, 615, 607]] }
    const w = workOf(
      [
        {
          kind: 'para',
          lines: [line(1, 650, 72, 300, 72, 300, 0), line(1, 700, 312, 540, 312, 540, 1)],
          els: [['e', display]],
        },
      ],
      frames,
    )
    expect(targetsOf(w, dests({ 'equation.2': { page: 1, x: 312, y: 625 } }), [])).toEqual([])
  })
  it('a heading’s window runs on to the next page’s first line of TeX’s column body, past the running head over it', () => {
    const frame = (foot: number): TexFrame => ({ block: [72, 540], columns: [[72, 540]], foot })
    const w = workOf(
      [
        { kind: 'heading', lines: [line(1, 160, 72, 140, 72, 540)] },
        { kind: 'inkheads', lines: [line(2, 745, 72, 300, 72, 540)], glyphs: [[100]] },
        { kind: 'para', lines: [line(2, 700, 72, 540, 72, 540)], glyphs: [[101]] },
      ],
      new Map([
        [1, frame(107)],
        [2, frame(107)],
      ]),
      2,
      {
        toB: { 100: 0, 101: 5 },
        pages: [
          { n: 0, points: [] },
          {
            n: 10,
            points: [
              ['bs1', 2],
              ['be1', 10],
            ],
          },
        ],
      },
    )
    const [t] = targetsOf(w, dests({ 'section.2': { page: 1, x: 72, y: 170 } }), [])
    expect(t!.next![1][3]).toBe(707)
  })
  it('two columns: a point in the right column never lands on the left column’s member', () => {
    const frames = new Map([
      [
        1,
        {
          block: [72, 540] as [number, number],
          columns: [
            [72, 300],
            [312, 540],
          ] as [number, number][],
        },
      ],
    ])
    const w = workOf(
      [
        { kind: 'reference', entry: true, lines: [line(1, 700, 72, 300, 72, 300, 0)] },
        { kind: 'reference', entry: true, lines: [line(1, 650, 312, 540, 312, 540, 1)] },
      ],
      frames,
    )
    const [t] = targetsOf(w, dests({ 'cite.r': { page: 1, x: 312, y: 712 } }), [])
    // (the left column's entry stands right under the point; the right column's 55 pt under it, past LAND_BELOW: nowhere)
    expect(t).toBeUndefined()
    const [u] = targetsOf(w, dests({ 'cite.r': { page: 1, x: 312, y: 662 } }), [])
    expect(u).toMatchObject({ ord: 1, kind: 'reference' })
  })
})

describe('a landing is stated only on the engine’s own evidence (the lead’s ruling, 2026-11-27)', () => {
  const two = (gutter: [number, number]) =>
    new Map([
      [
        1,
        {
          block: [72, 540] as [number, number],
          columns: [
            [72, gutter[0]],
            [gutter[1], 540],
          ] as [number, number][],
        },
      ],
    ])
  it('a point in the gutter between two columns belongs to the column on its right: a label sticking out left of it', () => {
    // (the right column's entries begin at 330 with labels wider than their box: the anchor at 305, in the gutter 300..320)
    const w = workOf(
      [
        { kind: 'reference', entry: true, lines: [line(1, 690, 72, 300, 72, 300, 0)] },
        { kind: 'reference', entry: true, lines: [line(1, 692, 330, 540, 320, 540, 1)] },
      ],
      two([300, 320]),
    )
    const [t] = targetsOf(w, dests({ 'cite.r': { page: 1, x: 305, y: 704 } }), [])
    expect(t).toMatchObject({ kind: 'reference', ord: 1 })
  })
  it('a page anchor is a page, no thing on it: never stated, though a float stands first under it', () => {
    const w = workOf([{ kind: 'caption', lines: [line(1, 630, 72, 168)] }])
    const f = floatOf({ page: 1, caption: 0, captions: [0], box: [72, 628, 200, 690] })
    expect(targetsOf(w, dests({ 'page.1': { page: 1, x: 72, y: 700 } }), [f])).toEqual([])
  })
  it('a name of a class that says another kind than what the point lands on is never stated', () => {
    const w = workOf([{ kind: 'heading', lines: [line(1, 690)] }])
    expect(targetsOf(w, dests({ 'cite.x': { page: 1, x: 72, y: 702 } }), [])).toEqual([])
    // (the same point under a name of the heading's class: stated)
    expect(targetsOf(w, dests({ 'section.3': { page: 1, x: 72, y: 702 } }), [])).toHaveLength(1)
    // (a key holding a hyphen is still a citation's: the scheme is `cite.` and whatever follows)
    // (its point left of the entry's ink, at no edge: the name's claim is the only evidence)
    const r = workOf(
      [{ kind: 'reference', entry: true, lines: [line(1, 690)] }],
      new Map([[1, { block: [50, 300], columns: [[50, 300]] }]]),
    )
    expect(targetsOf(r, dests({ 'cite.dyer-rnng:16': { page: 1, x: 60, y: 702 } }), [])).toHaveLength(1)
  })
  it('a name that claims nothing (an item, a paper’s own counter, a compound name) is stated only where the edge confirms it', () => {
    const display: El = { kind: 'display', ink: [[1, 150, 600, 250, 618, 607]] }
    const w = workOf([{ kind: 'para', lines: [line(1, 640), line(1, 580)], els: [['e1', display]] }])
    // (its point at the display's left edge, the display's baseline the first under it: confirmed)
    for (const name of ['Item.1', 'lemma.2', 'equation.3-footnote.1'])
      expect(targetsOf(w, dests({ [name]: { page: 1, x: 150, y: 620 } }), [])).toMatchObject([{ kind: 'display' }])
    // (its point left of the display, at no edge: the rule alone lands it, and nothing confirms it)
    expect(targetsOf(w, dests({ 'Item.2': { page: 1, x: 90, y: 620 } }), [])).toEqual([])
  })
  it('an anchor at the origin of an entry’s first line (unraised, at its left edge and on its baseline) is that entry’s, past the next one’s edge under it', () => {
    // (the next entry 10 under it: this fake's bands, 9 high, would meet at a closer pitch, and a box meeting another's band is
    // never stated)
    const w = workOf([
      { kind: 'reference', entry: true, lines: [line(1, 639.82, 57.04, 300)] },
      { kind: 'reference', entry: true, lines: [line(1, 629.82, 57.04, 300)] },
    ])
    expect(targetsOf(w, dests({ 'cite.z': { page: 1, x: 57.04, y: 639.82 } }), [])).toMatchObject([
      { kind: 'reference', ord: 0 },
    ])
  })
  it('a point at a line’s left edge on the format’s grid stands on it, though it falls a fraction of the grid left of it', () => {
    // (the part states the line at 314.97; pdfTeX states the destination at 314.9697: one position on the grid)
    const w = workOf([
      { kind: 'reference', entry: true, lines: [line(1, 453.27, 314.97, 540)] },
      { kind: 'reference', entry: true, lines: [line(1, 443.31, 314.97, 540)] },
    ])
    expect(targetsOf(w, dests({ 'cite.y': { page: 1, x: 314.9697, y: 453.2701 } }), [])).toMatchObject([
      { kind: 'reference', ord: 0 },
    ])
  })
  it('a landing another member’s left edge at the point contradicts is never stated', () => {
    // (the point on a reference's first line, at its baseline, over its ink: the rule's landing; another entry's label begins at
    // the point's x 10 under it: the edge names that entry)
    const w = workOf([
      { kind: 'reference', entry: true, lines: [line(1, 700, 60, 300)] },
      { kind: 'reference', entry: true, lines: [line(1, 690, 100, 300)] },
    ])
    expect(targetsOf(w, dests({ 'cite.y': { page: 1, x: 100, y: 700 } }), [])).toEqual([])
  })
})

describe('a stated box holds the whole of what it names, or the target is not stated (the float rule, every kind)', () => {
  /** the landings and the refusals of one destination */
  const of = (w: Work, name: string, pt: DestPoint) => {
    const refused: Parameters<typeof targetsOf>[3] = []
    const t = targetsOf(w, dests({ [name]: pt }), [], refused)
    return { t, refused: refused.map(([, kind, cause]) => [kind, cause]) }
  }
  // (a note whose first line ends with a comma after a URL TeX set outside the unit's text: the line states the comma alone)
  const note = (url: El): Spec => ({
    kind: 'footnote',
    lines: [line(1, 100, 290, 292), line(1, 88, 72, 200)],
    els: [['u', url]],
  })
  it('a note holding an element TeX set whose ink the bundle does not state (kept, or not found) is stated with no box', () => {
    const kept: El = { kind: 'other', literal: 1, copy: 'http://x.org/', ink: [], keep: 1 }
    expect(of(workOf([note(kept)]), 'Hfootnote.1', { page: 1, x: 290, y: 110 })).toEqual({
      t: [],
      refused: [['footnote', 'unstated']],
    })
    const unfound: El = { kind: 'other', literal: 1, copy: 'http://x.org/', ink: [] }
    expect(of(workOf([note(unfound)]), 'Hfootnote.1', { page: 1, x: 290, y: 110 }).refused).toEqual([
      ['footnote', 'unstated'],
    ])
  })
  it('an element of no ink stated to set nothing, one whose text is its unit’s own, and a kept space leave the box stated', () => {
    for (const el of [
      { kind: 'umacro', ink: [], text: '' },
      { kind: 'umacro', ink: [], text: '. ' },
      { kind: 'space', ink: [], keep: 1 },
      { kind: 'zero', ink: [] },
    ] as El[])
      expect(of(workOf([note(el)]), 'Hfootnote.1', { page: 1, x: 290, y: 110 }).t).toEqual([
        { dest: q('Hfootnote.1'), kind: 'footnote', page: 1, ord: 0, box: [72, 86, 292, 107] },
      ])
  })
  it('an element is read as the bundle states it: by its unit’s class and the text its class states', () => {
    // (locate's element of no ink, of a kind of no ink, whose class the instrument states inked: no text, its ink not found)
    const url: El = { kind: 'symbol', ink: [] }
    const w = workOf([{ ...note(url), classes: [['u', { cls: 'other' }]] }])
    expect(of(w, 'Hfootnote.1', { page: 1, x: 290, y: 110 }).refused).toEqual([['footnote', 'unstated']])
    // (an inked element of no ink whose class states its text, a text macro's: its glyphs the unit's text)
    const mac: El = { kind: 'other', ink: [] }
    const v = workOf([{ ...note(mac), classes: [['u', { cls: 'umacro', text: 'x' }]] }])
    expect(of(v, 'Hfootnote.1', { page: 1, x: 290, y: 110 }).t).toHaveLength(1)
  })
  it('an element whose ink reaches past its line’s is inside the box', () => {
    const el: El = { kind: 'other', ink: [[1, 280, 697, 300.4, 708, 700]] }
    const w = workOf([{ kind: 'reference', entry: true, lines: [line(1, 700, 80, 300)], els: [['e', el]] }])
    expect(of(w, 'cite.a', { page: 1, x: 72, y: 712 }).t).toMatchObject([{ box: [80, 697, 300.4, 708] }])
  })
  it('a reference that goes on in the next column, or on the next page, is stated with no box', () => {
    const col = workOf([{ kind: 'reference', entry: true, lines: [line(1, 100, 72, 300), line(1, 700, 312, 540)] }])
    expect(of(col, 'cite.a', { page: 1, x: 72, y: 112 })).toEqual({ t: [], refused: [['reference', 'pieces']] })
    const page = workOf([{ kind: 'reference', entry: true, lines: [line(1, 100, 72, 300), line(2, 700, 72, 300)] }])
    expect(of(page, 'cite.a', { page: 1, x: 72, y: 112 }).refused).toEqual([['reference', 'pieces']])
  })
  it('a note whose box would hold another note set on its line is stated with no box', () => {
    const w = workOf([
      { kind: 'footnote', lines: [line(1, 100, 72, 300), line(1, 88, 72, 150)] },
      { kind: 'footnote', lines: [line(1, 88, 160, 300)] },
    ])
    expect(of(w, 'Hfootnote.1', { page: 1, x: 72, y: 112 })).toEqual({ t: [], refused: [['footnote', 'foreign']] })
  })
  it('a display whose ink goes on to the next page, or whose box another member’s line meets, is stated with no box', () => {
    const two: El = {
      kind: 'display',
      ink: [
        [1, 150, 80, 250, 100, 90],
        [2, 150, 700, 250, 720, 710],
      ],
    }
    const w = workOf([{ kind: 'para', lines: [line(1, 120)], els: [['e', two]] }])
    expect(of(w, 'equation.1', { page: 1, x: 150, y: 102 })).toEqual({ t: [], refused: [['display', 'pieces']] })
    const low: El = { kind: 'display', ink: [[1, 150, 598, 250, 630, 610]] }
    const v = workOf([
      { kind: 'para', lines: [line(1, 650)], els: [['e', low]] },
      { kind: 'theorem', lines: [line(1, 592)] },
    ])
    expect(of(v, 'equation.2', { page: 1, x: 150, y: 632 })).toEqual({ t: [], refused: [['display', 'foreign']] })
  })
  it('a heading’s window holds its own ink whole: its label hung left of its measure, its line past it', () => {
    const w = workOf(
      [
        { kind: 'heading', lines: [line(1, 600, 100, 302, 72, 300)], label: [1, 66, 598, 90, 608.5, 600] },
        // (a paragraph under it whose ink overhangs its measure, TeX's measure inside the window's: its section's text)
        { kind: 'para', lines: [line(1, 580, 71.5, 300.6, 72, 300)] },
      ],
      new Map([[1, { block: [72, 300], columns: [[72, 300]], foot: 72 }]]),
    )
    expect(of(w, 'section.1', { page: 1, x: 66, y: 618 }).t).toMatchObject([
      { kind: 'heading', box: [66, Math.floor((608.5 - SECTION_WINDOW * 792) * 100) / 100, 302, 608.5] },
    ])
  })
  it('a heading’s window that would hold a line of a wider measure, or one reaching above its top, is stated with no box', () => {
    const frames = new Map([
      [
        1,
        {
          block: [72, 540] as [number, number],
          columns: [
            [72, 300],
            [312, 540],
          ] as [number, number][],
          foot: 72,
        },
      ],
    ])
    // (a caption across both columns under a heading of the left one)
    const wide = workOf(
      [
        { kind: 'heading', lines: [line(1, 600, 72, 200, 72, 300)] },
        { kind: 'caption', lines: [line(1, 560, 72, 540, 72, 540, 2)] },
      ],
      frames,
    )
    expect(of(wide, 'section.1', { page: 1, x: 72, y: 612 })).toEqual({ t: [], refused: [['heading', 'foreign']] })
    // (the paragraph before it, its last line's descenders reaching under the heading's top)
    const above = workOf(
      [
        { kind: 'para', lines: [line(1, 608.5)] },
        { kind: 'heading', lines: [line(1, 600, 72, 140, 72, 300)] },
      ],
      frames,
    )
    expect(of(above, 'section.1', { page: 1, x: 72, y: 600 })).toEqual({ t: [], refused: [['heading', 'foreign']] })
  })
  it('a heading’s window holds whole what TeX set on its line: a paragraph run in on it, taller than the heading', () => {
    const frames = new Map([
      [1, { block: [72, 300] as [number, number], columns: [[72, 300]] as [number, number][], foot: 72 }],
    ])
    // (its text a little taller, a formula in it taller still, both on the heading's baseline)
    const formula: El = { kind: 'other', ink: [[1, 200, 597, 240, 609.25, 600]] }
    const runIn = workOf(
      [
        { kind: 'heading', lines: [line(1, 600, 72, 140, 72, 300)] },
        { kind: 'para', lines: [[1, 0, 150, 300, 600, 607.5, 598, 72, 300, 0], line(1, 588)], els: [['f', formula]] },
      ],
      frames,
    )
    expect(of(runIn, 'section.1', { page: 1, x: 72, y: 612 }).t).toMatchObject([
      { kind: 'heading', box: [72, Math.floor((609.25 - SECTION_WINDOW * 792) * 100) / 100, 300, 609.25] },
    ])
  })
  it('a member set turned is read on the page: its line, turned back, meeting a note’s box is foreign', () => {
    // (a line of a frame turned a quarter (its x axis the page's y): in the frame x 90..110 at height -160..-150, on the page
    // x 150..160, y 90..110: inside the note's box)
    const turned = { ...line(1, -158, 90, 110), 5: -150, 6: -160 } as Line
    const w = workOf([
      { kind: 'footnote', lines: [line(1, 100, 72, 300), line(1, 88, 72, 200)] },
      { kind: 'figure', lines: [turned] },
    ])
    ;(w.members[1] as { dir?: [number, number] }).dir = [0, 1]
    expect(of(w, 'Hfootnote.1', { page: 1, x: 72, y: 112 }).refused).toEqual([['footnote', 'foreign']])
  })
})
