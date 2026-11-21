import { beforeAll, describe, expect, it } from 'vitest'
import { build, installStubs, line, openRun, type Paper } from './helpers/order-paper'

// A unit over a page break, laid by the run (E3c by height): each page holds its share of the paragraph's height, to a line
// end. The unit's source sets three lines on page 1 and three on page 2; its translation (60 characters, three lines of the
// measure) used to fill page 1's three slots, the text page 2 has in the source drawn on page 1.

beforeAll(() => { installStubs() })

const paper: Paper = {
  name: 'E3c a unit over a page break', pages: 2,
  specs: [{ id: 0, kind: 'para', lines: [line(1, 150, 'Alpha beta 10', 20, 280), line(1, 138, 'Alpha beta 11', 20, 280), line(1, 126, 'Alpha beta 12', 20, 280), line(2, 270, 'Alpha beta 20', 20, 280), line(2, 258, 'Alpha beta 21', 20, 280), line(2, 246, 'Alpha beta 22', 20, 280)], chars: 60, at: 0x4e00 + 64 }],
}
type Rec = [number, number, number, boolean, string, number, number, number]

describe('a unit over a page break, laid by the run', () => {
  it('holds on each page its share of the paragraph by height, page 1 ending at a line end, full', async () => {
    const run = await openRun(build(paper))
    await run.layFor(1)
    const rec = run.stats.find(x => x.id === 0) as unknown as { lines: Rec[]; clipped: boolean }
    expect(rec.clipped).toBe(false)
    // (half the source's lines on each page: two of the three lines on page 1, both to the measure, and the third on page 2)
    const on1 = rec.lines.filter(l => l[0] === 1), on2 = rec.lines.filter(l => l[0] === 2)
    expect([on1.length, on2.length]).toEqual([2, 1])
    expect(on1.map(l => [l[4], l[7]])).toEqual([['just', 280], ['just', 280]])
  })
  it("keeps the fit's own lay where it holds page 1 to its share already: its size and its lines", async () => {
    // three of the source's four lines on page 1: the fit, its text grown to 1.1, sets two lines on page 1 and one on page 2,
    // no more on page 1 than its share (three lines of four: 2.25)
    for (const tail of ['eta theta iota kappa lambda mu', 'eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau']) {
      const paper: Paper = { name: 'E3c a cut that costs the fit', pages: 2, specs: [{ id: 0, kind: 'para', lines: [line(1, 270, 'Alpha beta'), line(1, 258, 'gamma delta'), line(1, 246, 'epsilon zeta'), line(2, 270, tail)], chars: 60, at: 0x4e00 + 64 }] }
      const run = await openRun(build(paper))
      await run.layFor(1)
      const rec = run.stats.find(x => x.id === 0) as unknown as { lines: Rec[]; tried: number; knob: string; fitScale: number; clipped: boolean }
      expect([rec.clipped, rec.tried, rec.knob, rec.fitScale]).toEqual([false, 1, 'grow', 1.1])
      expect(rec.lines.map(l => l[0])).toEqual([1, 1, 2])
    }
  })
})
