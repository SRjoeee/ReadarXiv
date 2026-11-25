// @vitest-environment node
// One line of names cut in two units by a \thanks between them (`Ann Lee\thanks{Lead author.}, Bo Chen, Cy Diaz`: the
// source reader cuts the author block at each note, latex-front.ts frontBlock): TeX sets them as one line, the note's mark after
// the first name in an \rlap (\maketitle's \thanks: a box of no width), so the comma after it stands under the mark. The two
// members share TeX's line, one paragraph with no end between them; locate's flows (locate/flows.ts flowsAndTies) puts the
// second in the first's flow only where its first line starts at or after the first's last line's end (`b[2] >= a[3] - 0.5`),
// and that end is the mark's ink (the member's trail, trails.ts), past the comma's start: two flows, each member centred on its
// own piece of TeX's line, a hole between the two where the second's translation is shorter than its original. RED until the
// order on the line is read as TeX set it. Content of our own, B read as A (no shift).
import { unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import type { Doc } from '../src/doc.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import { docOf } from './helpers/doc.ts'
import { locate } from './helpers/locate.ts'

/** an instrument over B whose units own B's glyphs line by line: `own[p][line]` the unit of that line (-1 none) */
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
const unitOf = (kind: string, s: string): InstrumentUnit => {
  const content = [{ t: 'text' as const, s }]
  return { id: unitId(kind, content), kind, content }
}
const FIRST = 'Ann Lee'
const REST = ', Bo Chen, Cy Diaz'
/** the names' line at 10 pt from x 190, the mark raised at 7 pt right after the first name, the rest of the line from `restAt`
 *  (the mark's start: the \rlap TeX set it in; its end: a mark of its own width); the note's text at the foot of the page */
const lineOf = (restAt: (end: number) => number) => {
  const end = 190 + FIRST.length * 6
  const B = docOf([
    {
      lines: [
        { text: FIRST, x: 190, y: 650 },
        { text: '*', x: end, y: 653.6, size: 7 },
        { text: REST, x: restAt(end), y: 650 },
        { text: 'Lead author.', x: 85, y: 70, size: 8 },
      ],
      // (TeX's points: each unit's start and end in B's stream, the note's text set in the footnote insert after the body)
      points: [
        ['0s', 0],
        ['0e', FIRST.length],
        ['2s', FIRST.length + 1],
        ['2e', FIRST.length + 1 + REST.length],
        ['1s', FIRST.length + 1 + REST.length],
        ['1e', FIRST.length + 1 + REST.length + 'Lead author.'.length],
      ],
    },
  ])
  const units = [unitOf('author', FIRST), unitOf('footnote', 'Lead author.'), unitOf('author', REST)]
  const L = locate(instrumentOf(B, units, [[0, -1, 2, 1]]), B, align(B, B))
  const first = L.members.find((m) => m.unit === 0)!
  const rest = L.members.find((m) => m.unit === 2)!
  return { flow: L.flows.find((f) => f.includes(rest.ord)), first: first.ord, rest: rest.ord }
}

describe('two units of one line of names, a \\thanks mark between them', () => {
  it('one flow where the mark is set in a box of no width, the comma after it under it', () => {
    const { flow, first, rest } = lineOf((end) => end)
    expect(flow).toEqual([first, rest])
  })
  it('one flow where the comma’s origin reads a ten-thousandth of a point before the mark’s (two fonts’ matrices, one place)', () => {
    const { flow, first, rest } = lineOf((end) => end - 0.0004)
    expect(flow).toEqual([first, rest])
  })
  it('one flow where the mark takes its own width, the comma after it (the other side of the order test)', () => {
    const { flow, first, rest } = lineOf((end) => end + 0.6 * 7)
    expect(flow).toEqual([first, rest])
  })
})
