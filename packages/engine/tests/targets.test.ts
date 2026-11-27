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
type Spec = { kind: string; lines: Line[]; entry?: true; els?: [string, El][] }
function workOf(specs: Spec[], frames: Map<number, TexFrame> = new Map(), pages = 2): Work {
  const units: InstrumentUnit[] = specs.map((s, i) => ({
    id: `${i}`.padStart(64, '0'),
    kind: s.kind,
    content: [],
    ...(s.entry ? { entry: true as const } : {}),
  }))
  const members = specs.map(
    (s, ord) =>
      ({ ord, unit: ord, kind: s.kind, located: true, lines: s.lines, elements: s.els ?? [] }) as unknown as Member,
  )
  const view: [number, number, number, number] = [0, 0, 612, 792]
  return {
    members,
    units,
    ix: { framesA: frames, inkA: { pages: Array.from({ length: pages }, () => ({ view })) } },
  } as unknown as Work
}
const dests = (o: Record<string, DestPoint | null>) => new Map(Object.entries(o))
const floatOf = (o: Partial<FloatBox>): FloatBox => ({
  serial: 1,
  page: 1,
  caption: null,
  captions: [],
  type: 'figure',
  box: null,
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
  it('a point between two references lands on the one below it; a point over a reference’s middle lands on it', () => {
    const t = targetsOf(
      workOf(refs),
      dests({ between: { page: 1, x: 72, y: 682 }, middle: { page: 1, x: 72, y: 690 } }),
      [],
    )
    expect(t).toEqual([
      { dest: 'between', kind: 'reference', page: 1, ord: 1, box: [80, 656, 300, 677] },
      { dest: 'middle', kind: 'reference', page: 1, ord: 0, box: [80, 686, 300, 707] },
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
    expect(t).toMatchObject({ dest: 'section.1', kind: 'heading', page: 1, ord: 0 })
    // (on the format's grid, outward)
    expect(t!.box).toEqual([72, Math.floor((607 - SECTION_WINDOW * 792) * 100) / 100, 300, 607])
    expect(t!.next).toBeUndefined()
  })
  it('a heading 60 pt over its page’s text foot runs on to the next page’s text head, in its column', () => {
    const frame = (foot: number): TexFrame => ({ block: [72, 540], columns: [[72, 540]], foot })
    const w = workOf(
      [
        { kind: 'heading', lines: [line(1, 160, 72, 140, 72, 540)] },
        { kind: 'para', lines: [line(2, 700, 72, 540, 72, 540), line(2, 688)] },
      ],
      new Map([
        [1, frame(107)],
        [2, frame(107)],
      ]),
    )
    const [t] = targetsOf(w, dests({ s: { page: 1, x: 72, y: 170 } }), [])
    const rest = 107 - (167 - SECTION_WINDOW * 792)
    expect(t).toMatchObject({ kind: 'heading', page: 1, box: [72, 107, 540, 167] })
    expect(t!.next![0]).toBe(2)
    expect(t!.next![1]).toEqual([72, Math.floor((707 - rest) * 100) / 100, 540, 707])
  })
  it('a display’s point lands on its ink, the paragraph’s measure the column it is found in', () => {
    const display: El = { kind: 'display', ink: [[1, 150, 600, 250, 630, 610]] }
    const w = workOf([{ kind: 'para', lines: [line(1, 650), line(1, 580)], els: [['e1', display]] }])
    const [t] = targetsOf(w, dests({ 'equation.1': { page: 1, x: 72, y: 640 } }), [])
    // (no line's band holds the point; the display's top is the first under it, within LAND_BELOW)
    expect(t).toEqual({ dest: 'equation.1', kind: 'display', page: 1, ord: 0, box: [150, 600, 250, 630] })
  })
  it('a figure’s point at its caption lands on the float’s box; a hypcap point at its top lands on the float', () => {
    const w = workOf([
      { kind: 'para', lines: [line(1, 720)] },
      { kind: 'caption', lines: [line(1, 630, 72, 168)] },
    ])
    const f = floatOf({ page: 1, caption: 1, captions: [1], box: [72, 628, 200, 690] })
    const t = targetsOf(w, dests({ caption: { page: 1, x: 72, y: 645 }, top: { page: 1, x: 72, y: 700 } }), [f])
    expect(t).toEqual([
      { dest: 'caption', kind: 'float', page: 1, ord: 1, box: [72, 628, 200, 690] },
      { dest: 'top', kind: 'float', page: 1, ord: 1, box: [72, 628, 200, 690] },
    ])
  })
  it('a float with no box lands nowhere, at its caption or at its top', () => {
    const w = workOf([{ kind: 'caption', lines: [line(1, 630, 72, 168)] }])
    const f = floatOf({ page: 1, caption: 0, captions: [0], box: null, cause: 'foreign' })
    expect(targetsOf(w, dests({ caption: { page: 1, x: 72, y: 645 } }), [f])).toEqual([])
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
    const [t] = targetsOf(w, dests({ right: { page: 1, x: 312, y: 712 } }), [])
    // (the left column's entry stands right under the point; the right column's 55 pt under it, past LAND_BELOW: nowhere)
    expect(t).toBeUndefined()
    const [u] = targetsOf(w, dests({ right: { page: 1, x: 312, y: 662 } }), [])
    expect(u).toMatchObject({ ord: 1, kind: 'reference' })
  })
})
