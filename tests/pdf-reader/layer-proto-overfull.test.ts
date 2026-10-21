import { beforeAll, describe, expect, it } from 'vitest'
import { build, installStubs, line, openRun, type Paper, para } from './helpers/order-paper'

// A single line of a unit runs on to its column's edge (run.mjs widen), and the column's edge is where its lines end, but a
// line TeX set overfull: one that ends past the furthest end two lines share by less than an em is no edge (2608.16117-de's
// page 11: a line of a paragraph between two displays, no longer centred, ran 3.4 pt into the margin, widened to a line of
// the page TeX had let run past the column). A line past it by an em or more is the column's own (a wider paragraph's)

beforeAll(() => { installStubs() })

/** page 1: paragraph 0's six lines on the measure 20 to 280, its third `third` wide; paragraph 1's line of 100 on it, then
 *  three lines on page 2, its translation long enough to fill that line and run on (most of its source on page 1, so that
 *  the share of its translation page 1 holds, E3c's page cut, fills the widened line) */
const paperOf = (third: number): Paper => {
  const p0 = para(0, [[1, 270, 6]], 30)
  p0.lines = p0.lines.map((l, j) => line(1, l.b, `Alpha beta gamma delta ${j}`, 20, j === 2 ? third : 280))
  return {
    name: 'overfull', pages: 2,
    specs: [p0, { id: 1, kind: 'para', lines: [line(1, 150, 'Alpha beta', 20, 120), line(2, 270, '20', 20, 280), line(2, 258, '21', 20, 280), line(2, 246, '22', 20, 280)], chars: 60, at: 0x4e00 + 64 }],
  }
}
const firstLine = async (third: number) => {
  // (v0's geometry holding the paragraphs' lines, as a paper's does: the column of each page is read from them)
  const P = build(paperOf(third))
  ;(P.geometry as { left: { units: unknown[] } }).left.units = P.paper.specs.map(s => [s.id, 10, s.lines.map(l => [l.page, l.x0, l.b - 2, l.x1, l.b + 7])])
  const run = await openRun(P)
  await run.layFor(1)
  const lines = (run.stats.find(x => x.id === 1)?.lines ?? []) as unknown as [number, number, number, boolean, string, number, number, number][]
  return lines.find(l => l[0] === 1)
}

describe('a single line widened to its column\'s edge, an overfull line no edge', () => {
  it('a line 4 pt past the measure (under an em): the line widened to the measure, 280', async () => {
    const l = await firstLine(284)
    expect(l?.[4]).toBe('just')
    expect(l?.[7]).toBeCloseTo(280, 1)
  })

  it('a line 16 pt past it (more than an em): the column\'s own edge, 296', async () => {
    expect((await firstLine(296))?.[7]).toBeCloseTo(296, 1)
  })
})
