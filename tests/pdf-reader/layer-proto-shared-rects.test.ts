import { beforeAll, describe, expect, it } from 'vitest'
import { indexLayout, parseLayout } from '@/pdf-reader/engine/layout/file.mjs'
import { build, installStubs, line, openRun, type Paper } from './helpers/order-paper'

// What the other units read of a unit (run.mjs: the page's rectangles, by which a unit's line another unit's rectangle covers
// is that unit's and is dropped, and its growth stops): a unit placed by the layout file's lines is read by those lines, not
// by the left's rectangles, which can point at another occurrence of its words (2610.19274's unit 140: its left rectangle
// over an italic "Results" 30 pt above the heading TeX set)

beforeAll(() => { installStubs() })

type Line = [number, number, number, boolean, string, number, number, number]
describe("a unit placed by the file's lines is the others' by those lines", () => {
  // (unit 0, a heading the file locates on its line at 270; the left gives it that line and one over unit 1's first line at
  // 200, another occurrence of its word. Unit 1, a paragraph the file does not hold, laid by the left's two lines at 200 and
  // 188: with unit 0 read by the left, its first line was unit 0's and dropped)
  const paper: Paper = {
    name: 'wrong left rectangle', pages: 1,
    specs: [
      { id: 0, kind: 'heading', lines: [line(1, 270, 'Results', 20, 80)], chars: 2, at: 0x4e00 },
      { id: 1, kind: 'para', lines: [line(1, 200, 'Alpha beta gamma delta'), line(1, 188, 'epsilon zeta eta theta')], chars: 40, at: 0x5000 },
    ],
  }
  const built = () => {
    const P = build(paper)
    // (unit 1 is no unit of the file's: v0 lays it by the left's rectangles)
    const layout = P.layout as unknown as Record<string, [number, unknown][]>
    for (const key of ['units', 'lines', 'frames', 'erase']) layout[key] = layout[key]!.filter(e => e[0] !== 1)
    P.index = indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(P.layout))))
    const g = P.geometry as { left: { units: unknown[] } }
    g.left.units = [[0, 0, [[1, 20, 268, 80, 277], [1, 20, 198, 280, 207]]], [1, 1, [[1, 20, 198, 280, 207], [1, 20, 186, 280, 195]]]]
    return P
  }
  it("the paragraph keeps both its lines: the heading's left rectangle over its first is no line of the heading's", async () => {
    const run = await openRun(built())
    await run.layFor(1)
    const heading = run.stats.find(x => x.id === 0)
    expect((heading?.lines as unknown as Line[] | undefined)?.map(l => l[1])).toEqual([270])
    const lines = (run.stats.find(x => x.id === 1)?.lines ?? []) as unknown as Line[]
    expect(lines.map(l => l[1])).toEqual([200, 188])
  })
})
