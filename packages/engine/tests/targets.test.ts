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
type Spec = { kind: string; lines: Line[]; entry?: true; els?: [string, El][]; glyphs?: number[][] }
/** B's column bodies for the fake: each A glyph's B glyph (`toB`), each B page's glyph count and its body brackets' points */
type Bodies = { toB: Record<number, number>; pages: { n: number; points: [string, number][] }[] }
function workOf(specs: Spec[], frames: Map<number, TexFrame> = new Map(), pages = 2, bodies?: Bodies): Work {
  const units: InstrumentUnit[] = specs.map((s, i) => ({
    id: `${i}`.padStart(64, '0'),
    kind: s.kind,
    content: [],
    ...(s.entry ? { entry: true as const } : {}),
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
    const w = workOf([
      { kind: 'reference', entry: true, lines: [line(1, 639.82, 57.04, 300)] },
      { kind: 'reference', entry: true, lines: [line(1, 631.85, 57.04, 300)] },
    ])
    expect(targetsOf(w, dests({ 'cite.z': { page: 1, x: 57.04, y: 639.82 } }), [])).toMatchObject([
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
