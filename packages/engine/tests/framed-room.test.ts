// A paragraph TeX set inside a frame the page paints as ONE path round it (a ring of two fills, the frame's colour and the
// paper's inside it; or one stroke): the room the part states about its lines (Room.runs: the next ink across a run, "a glyph's
// baseline, a box's top"; Room.side and Room.stays: the ink beside a line on its band) is read from the page's painted boxes by
// their tops and their extents across a line, so a path that ENCLOSES the text is never under it nor beside it, and the lay
// borrows lines and widens a single line past the frame's border (the room under the run is the next ink's, a figure's under
// the frame). The frame's border is ink across the run under the last line and on each line's band beside it: the room ends
// there, as it ends at a rule the page paints apart (a box whose top stands under the line, a rule beside it). RED until the
// prepare reads a path that encloses a member's lines by its painted lines. Pages made by hand: each glyph 6 pt wide at 10 pt,
// the frame's paths given as boxes (each a rectangle, its lines its box's edges); B and A the same page; our own text.
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
/** the located members of a page laid out by `spec`, each line's unit `own` */
function membersOf(spec: PageSpec[], units: InstrumentUnit[], own: number[][]) {
  const B = docOf(spec)
  const tex = {
    frames: spec.map(() => ({
      block: [72, 540] as [number, number],
      columns: [[72, 540]] as [number, number][],
      foot: 100,
    })),
    skips: units.map((_, unit) => ({ unit, baselineskip: 12, parskip: 0, parskipShrink: 0 })),
  }
  return locate(instrumentOf(B, units, own, tex), B, align(B, B)).members
}
/** a frame painted as one ring of two fills round [x0, y0, x1, y1], its border `w` wide: the outer path in the frame's colour,
 *  the inner in the paper's over it (path indices 0 and 1, painted before the text, as a frame package paints its frame) */
const ring = (x0: number, y0: number, x1: number, y1: number, w = 1): NonNullable<PageSpec['boxes']> => [
  [0, 0, x0, y0, x1, y1],
  [0, 1, x0 + w, y0 + w, x1 - w, y1 - w],
]
/** a figure's picture under the frame (an image), the next ink a run would meet without the frame */
const figure: NonNullable<PageSpec['boxes']>[number] = [0, -3, 84, 560, 290, 620]
const para = unitOf('para', 'framed text one runs on and on in frame ends inside frame')
const lines = [
  { text: 'framed text one runs', x: 84, y: 700 },
  { text: 'on and on in frame', x: 84, y: 688 },
  { text: 'ends inside frame', x: 84, y: 676 },
]

describe('the room about a paragraph a frame of one painted path holds ends at the frame (Room.runs, Room.side, Room.stays)', () => {
  it('states the frame’s border as the next ink under a run it holds: no line borrowed past it', () => {
    // (the ring's band 660-661 under the last baseline, 676: its ink's top 15 under it; the figure's top 56 under it)
    const [m] = membersOf([{ lines, boxes: [...ring(72, 660, 300, 720), figure] }], [para], [[0, 0, 0]])
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
      [{ lines: [{ text: 'short line in frame', x: 84, y: 700 }], boxes: ring(72, 690, 300, 712) }],
      [one],
      [[0]],
    )
    const l = m!.lines[0]!
    // (how far the lay widens the line, lay/adapt.ts sideOf: its measure's end, Room.side's, the ink that stays after it)
    const right = Math.min(
      l[8],
      m!.room.side?.[1] ?? Number.POSITIVE_INFINITY,
      ...(m!.room.stays ?? []).filter((k) => k[0] === 0 && k[1] >= l[3]).map((k) => k[1]),
    )
    expect(right).toBeLessThanOrEqual(299.01)
  })
  it('keeps the room of a paragraph a fill under one of its words stands in (a highlight is no frame)', () => {
    const [m] = membersOf([{ lines, boxes: [[0, 0, 113, 686, 155, 697], figure] }], [para], [[0, 0, 0]])
    // (the next ink across the run: the figure's top, as before)
    expect(m!.room.runs?.find((e) => e[0] === 2)?.[1]).toBe(56)
  })
  it('keeps the room under a paragraph a frame holds with the figure under it: the figure stays the next ink', () => {
    const [m] = membersOf([{ lines, boxes: [...ring(72, 540, 300, 720), figure] }], [para], [[0, 0, 0]])
    expect(m!.room.runs?.find((e) => e[0] === 2)?.[1]).toBe(56)
  })
})
