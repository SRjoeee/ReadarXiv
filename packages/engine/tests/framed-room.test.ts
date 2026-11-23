// A paragraph TeX set inside a frame the page paints as ONE path round it (a ring of two fills, the frame's colour and the
// paper's inside it; or one stroke): the room the part states about its lines (Room.runs: the next ink across a run, "a glyph's
// baseline, a box's top"; Room.side and Room.stays: the ink beside a line on its band) is read from the page's painted boxes by
// their tops and their extents across a line, so a path that ENCLOSES the text is never under it nor beside it, and the lay
// borrows lines and widens a single line past the frame's border (the room under the run is the next ink's, a figure's under
// the frame). The frame's border is ink across the run under the last line and on each line's band beside it: the room ends
// there, as it ends at a rule the page paints apart (a box whose top stands under the line, a rule beside it). A frame is a path
// a reader sees (frames.ts, docs/PDF-READER.md §18.111): a fill of the colour painted under it, no stroke, is none. Pages made
// by hand: each glyph 6 pt wide at 10 pt; the frame's paths given as boxes and, as the prepare reads arXiv's page, their lines
// and paint (each a rectangle, its lines its box's edges), read into the page's frames as locate reads them (framesOnPage); B
// and A the same page; our own text.
import { unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import type { Doc } from '../src/doc.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import { framesOnPage, type PaintedPage } from '../src/locate/frames.ts'
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
/** a path's paint: its fill's colour (none: a stroke alone), whether it strokes; its lines (x0, y0, x1, y1 each) where they are
 *  not its box's edges */
type Paint = { colour?: number; stroke?: boolean; segs?: number[] }
/** a page: its lines and boxes, and each path box's paint, by its index among the page's boxes in their order */
type Spec = PageSpec & { paint?: (Paint | null)[] }
/** a rectangle's lines, closed */
const edges = (x0: number, y0: number, x1: number, y1: number) =>
  Float32Array.from([x0, y0, x1, y0, x1, y0, x1, y1, x1, y1, x0, y1, x0, y1, x0, y0])
/** the page's paths as the prepare reads arXiv's (read.ts `raw`): each path box with a paint, its lines its box's edges */
function paintedOf(B: Doc, spec: Spec[]): PaintedPage[] {
  return B.pages.map((pg, p) => {
    const shapes = new Map<
      number,
      NonNullable<PaintedPage['shapes']> extends ReadonlyMap<number, infer S> ? S : never
    >()
    spec[p]?.paint?.forEach((paint, b) => {
      if (!paint) return
      const [x0, y0, x1, y1] = [0, 1, 2, 3].map((k) => pg.boxes[4 * b + k] as number) as [
        number,
        number,
        number,
        number,
      ]
      shapes.set(b, {
        segs: paint.segs ? Float32Array.from(paint.segs) : edges(x0, y0, x1, y1),
        stroke: !!paint.stroke,
        fill: paint.colour !== undefined,
        hw: 0.25,
        ...(paint.colour !== undefined ? { opaque: true as const, colour: paint.colour } : {}),
      })
    })
    return { shapes }
  })
}
/** the located members of a page laid out by `spec`, each line's unit `own`; the page's frames read off its paths' paint */
function membersOf(spec: Spec[], units: InstrumentUnit[], own: number[][]) {
  const B = docOf(spec)
  const tex = {
    frames: spec.map(() => ({
      block: [72, 540] as [number, number],
      columns: [[72, 540]] as [number, number][],
      foot: 100,
    })),
    skips: units.map((_, unit) => ({ unit, baselineskip: 12, parskip: 0, parskipShrink: 0 })),
  }
  const frames = paintedOf(B, spec).map((raw, p) => framesOnPage(raw, B.pages[p]!))
  return locate(instrumentOf(B, units, own, tex), B, align(B, B), { frames }).members
}
const BLUE = 0x1f3a93,
  WHITE = 0xffffff,
  GREY = 0xe6e6e6
/** a frame painted as one ring of two fills round [x0, y0, x1, y1], its border `w` wide: the outer path in the frame's colour,
 *  the inner in the paper's over it (painted before the text, as a frame package paints its frame) */
const ring = (x0: number, y0: number, x1: number, y1: number, w = 1): Spec => ({
  lines: [],
  boxes: [
    [0, 0, x0, y0, x1, y1],
    [0, 1, x0 + w, y0 + w, x1 - w, y1 - w],
  ],
  paint: [{ colour: BLUE }, { colour: WHITE }],
})
/** a page of `lines` with the frames and boxes given, in their order (each one's paint, null for none) */
const page = (ls: PageSpec['lines'], ...parts: Spec[]): Spec => ({
  lines: ls,
  boxes: parts.flatMap((q) => q.boxes ?? []),
  paint: parts.flatMap((q) => (q.boxes ?? []).map((_, k) => q.paint?.[k] ?? null)),
})
/** a figure's picture under the frame (an image), the next ink a run would meet without the frame */
const figure: Spec = { lines: [], boxes: [[0, -3, 84, 560, 290, 620]] }
const para = unitOf('para', 'framed text one runs on and on in frame ends inside frame')
const lines = [
  { text: 'framed text one runs', x: 84, y: 700 },
  { text: 'on and on in frame', x: 84, y: 688 },
  { text: 'ends inside frame', x: 84, y: 676 },
]
/** the next ink under a member's run ending at line `j` (Room.runs' second number) */
const nextInk = (m: { room: { runs?: [number, number, number][] } } | undefined, j: number) =>
  m?.room.runs?.find((e) => e[0] === j)?.[1]
/** how far the lay widens a member's single line, lay/adapt.ts sideOf: its measure's end, Room.side's, the ink that stays after it */
const widened = (m: { lines: number[][]; room: { side?: [number, number]; stays?: number[][] } }) => {
  const l = m.lines[0]!
  return Math.min(
    l[8]!,
    m.room.side?.[1] ?? Number.POSITIVE_INFINITY,
    ...(m.room.stays ?? []).filter((k) => k[0] === 0 && k[1]! >= l[3]!).map((k) => k[1]!),
  )
}

describe('the room about a paragraph a frame of one painted path holds ends at the frame (Room.runs, Room.side, Room.stays)', () => {
  it('states the frame’s border as the next ink under a run it holds: no line borrowed past it', () => {
    // (the ring's band 660-661 under the last baseline, 676: its ink's top 15 under it; the figure's top 56 under it)
    const [m] = membersOf([page(lines, ring(72, 660, 300, 720), figure)], [para], [[0, 0, 0]])
    const run = m!.room.runs?.find((e) => e[0] === 2)
    expect(run, 'a run ending at its last line').toBeDefined()
    expect(run![1]).toBeGreaterThanOrEqual(14.99)
    expect(run![1]).toBeLessThanOrEqual(16.01)
    // (the borrow's room as the lay reads it, adapt.ts: never past the frame; TeX's separation, 12, keeps it under one line)
    const free = Math.max(0, Math.min(run![2], run![1] - (m!.room.sep as number)))
    expect(676 - free - 0.2 * 10).toBeGreaterThan(661)
  })
  it('states the frame’s side as the ink beside a single line it holds: the line widened to the frame’s inside at most', () => {
    const one = unitOf('para', 'short line in frame')
    const [m] = membersOf(
      [page([{ text: 'short line in frame', x: 84, y: 700 }], ring(72, 690, 300, 712))],
      [one],
      [[0]],
    )
    expect(widened(m as never)).toBeLessThanOrEqual(299.01)
  })
  it('states a sloped frame’s sides where its path stands at the line’s own height: a diamond’s, beside a single line', () => {
    // (a stroked diamond (Devin's review on #672): vertices (90, 700), (160, 740), (230, 700), (160, 660); a line at 700 from 145
    // to 175, its fonts' box 698-707. Each edge's box reaches x 160, across the line: as boxes, none stands beside it. At the
    // line's height, 698-707 (and the stroke's half width, 0.25), the path stands at x 89.75-102.94 before it and 217.06-230.25
    // after it)
    const one = unitOf('para', 'abcde')
    const diamond: Spec = {
      lines: [],
      boxes: [[0, 0, 90, 660, 230, 740]],
      paint: [{ stroke: true, segs: [90, 700, 160, 740, 160, 740, 230, 700, 230, 700, 160, 660, 160, 660, 90, 700] }],
    }
    const [m] = membersOf([page([{ text: 'abcde', x: 145, y: 700 }], diamond)], [one], [[0]])
    expect(widened(m as never)).toBeCloseTo(217.06, 1)
    const before = (m!.room.stays ?? []).filter((k) => k[0] === 0 && k[3]! <= 145)
    expect(before.length).toBe(1)
    expect(before[0]![3]).toBeCloseTo(102.94, 1)
  })
  it('keeps the room of a paragraph a fill under one of its words stands in (a highlight is no frame)', () => {
    const hl: Spec = { lines: [], boxes: [[0, 0, 113, 686, 155, 697]], paint: [{ colour: GREY }] }
    const [m] = membersOf([page(lines, hl, figure)], [para], [[0, 0, 0]])
    // (the next ink across the run: the figure's top, as before)
    expect(nextInk(m, 2)).toBe(56)
  })
  it('keeps the room under a paragraph a frame holds with the figure under it: the figure stays the next ink', () => {
    const [m] = membersOf([page(lines, ring(72, 540, 300, 720), figure)], [para], [[0, 0, 0]])
    expect(nextInk(m, 2)).toBe(56)
  })
})

describe('a frame is a closed path a reader sees whose interior holds the member’s lines; the innermost one', () => {
  it('reads no frame of a fill of the colour painted under it, no stroke (a white ground on the white paper)', () => {
    const ground: Spec = { lines: [], boxes: [[0, 0, 72, 660, 300, 720]], paint: [{ colour: WHITE }] }
    const [m] = membersOf([page(lines, ground, figure)], [para], [[0, 0, 0]])
    expect(nextInk(m, 2)).toBe(56)
    // (the same ground in a colour, or stroked: seen, the frame)
    const grey: Spec = { ...ground, paint: [{ colour: GREY }] }
    expect(nextInk(membersOf([page(lines, grey, figure)], [para], [[0, 0, 0]])[0], 2)).toBe(16)
    const stroked: Spec = { ...ground, paint: [{ colour: WHITE, stroke: true }] }
    expect(nextInk(membersOf([page(lines, stroked, figure)], [para], [[0, 0, 0]])[0], 2)).toBe(15.75)
  })
  it('makes a fill under a heading’s words its frame, and a chip beside a heading none', () => {
    const head = unitOf('heading', 'After')
    // (a chip under the word: it holds the heading's line, whose translation is laid inside it)
    const under: Spec = { lines: [], boxes: [[0, 0, 80, 694, 116, 710]], paint: [{ colour: GREY }] }
    const [h1] = membersOf([page([{ text: 'After', x: 84, y: 700 }], under)], [head], [[0]])
    expect(widened(h1 as never)).toBeLessThanOrEqual(116.01)
    // (a chip beside it, before its word: no frame of the heading's; the heading's room as before, to its measure's end)
    const beside: Spec = { lines: [], boxes: [[0, 0, 66, 694, 80, 710]], paint: [{ colour: GREY }] }
    const [h2] = membersOf([page([{ text: 'After', x: 84, y: 700 }], beside)], [head], [[0]])
    expect(widened(h2 as never)).toBe(540)
  })
  it('makes one frame holding two paragraphs each one’s: the first’s next ink the second’s text, the second’s the border', () => {
    const two = [unitOf('para', 'first one inside'), unitOf('para', 'second one inside')]
    const [a, b] = membersOf(
      [
        page(
          [
            { text: 'first one inside', x: 84, y: 700 },
            { text: 'second one inside', x: 84, y: 676 },
          ],
          ring(72, 650, 300, 720),
          figure,
        ),
      ],
      two,
      [[0, 1]],
    )
    expect(nextInk(a, 0)).toBe(24)
    expect(nextInk(b, 0)).toBe(25)
  })
  it('reads the innermost of two frames round the paragraph: its border, not the outer one’s', () => {
    const [m] = membersOf([page(lines, ring(60, 630, 320, 730), ring(72, 660, 300, 720), figure)], [para], [[0, 0, 0]])
    expect(nextInk(m, 2)).toBe(15)
  })
})
