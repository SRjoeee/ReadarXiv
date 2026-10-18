import { beforeAll, describe, expect, it } from 'vitest'
import { build, type Built, installStubs, line, openRun, type Paper, para, type Spec } from './helpers/order-paper'

// Where the layout file's centring is no unit's (run.mjs): a table cell, which TeX's probe does not read (a cell's marks carry
// none) and the page's column does not decide either, is centred by its own lines (several whose middles agree and whose
// widths do not: a makecell's) or, a single line, by its table's column on its page (its cells' middles agree and their
// widths do not: a c column's; an l column's share their start); and a unit of a part with no layout is centred by the page's
// column as before the file had a flag (centredInColumn: a caption under its figure in one column of two)

beforeAll(() => { installStubs() })

type Line = [number, number, number, boolean, string, number, number, number]
const kindsOf = (run: Awaited<ReturnType<typeof openRun>>, id: number) => ((run.stats.find(x => x.id === id)?.lines ?? []) as unknown as Line[]).map(l => l[4])
const cellSpec = (id: number, rows: [number, number, number][], group: string): Spec => ({ id, kind: 'cell', lines: rows.map(([b, x0, x1]) => line(1, b, `Cell ${id}${b}`, x0, x1)), chars: 1, at: 0x4e00 + 64 * id, group })

describe('a table cell is centred by its own lines or by its column', () => {
  // (page 1: a paragraph over 20 to 280; a c column of three single-line cells about 100, widths 40, 60 and 30; an l column of
  // three from 160; a cell of two lines about 100, widths 60 and 30)
  const paper: Paper = {
    name: 'cells', pages: 1,
    specs: [
      para(0, [[1, 270, 4]], 30),
      cellSpec(1, [[200, 80, 120]], '0:c0'), cellSpec(2, [[188, 70, 130]], '0:c0'), cellSpec(3, [[176, 85, 115]], '0:c0'),
      cellSpec(4, [[200, 160, 200]], '0:c1'), cellSpec(5, [[188, 160, 220]], '0:c1'), cellSpec(6, [[176, 160, 190]], '0:c1'),
      cellSpec(7, [[140, 70, 130], [128, 85, 115]], '1:c0'),
    ],
  }
  for (const groups of [true, false]) {
    it(`${groups ? 'the open\'s table groups' : 'the units\' own groups'}: the c column's cells centred, the l column's not, the cell of two centred lines centred`, async () => {
      const run = await openRun(build(paper), { groups })
      await run.layFor(1)
      expect([1, 2, 3].map(id => kindsOf(run, id))).toEqual([['centred'], ['centred'], ['centred']])
      expect([4, 5, 6].map(id => kindsOf(run, id))).toEqual([['last'], ['last'], ['last']])
      expect(kindsOf(run, 7)).toEqual(['centred'])
    })
  }
})

describe('a unit of a part with no layout is centred by the page\'s column', () => {
  it('a line on its column\'s middle, short of it, in one column of two: centred, as before the file had a flag', async () => {
    // (the left column 20 to 140, its middle 80: four paragraph lines over it; a line of 60 about 80, not the page's middle 150)
    const paper: Paper = { name: 'no layout', pages: 1, specs: [para(0, [[1, 270, 4]], 20), { id: 1, kind: 'caption', lines: [line(1, 200, 'Figure caption', 50, 110)], chars: 4, at: 0x4e00 + 64 }] }
    const P: Built = build(paper)
    for (const l of paper.specs[0]!.lines) l.x1 = 140
    const g = P.geometry as { left: { units: unknown[] } }
    g.left.units = paper.specs.map(s => [s.id, 10, s.lines.map(l => [l.page, l.x0, l.b - 2, l.x1, l.b + 7])])
    const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const units: unknown[] = []
    for (const [id, r] of P.rows) units[id] = r
    const run = await openProto({ doc: P.doc, target: 'zh', pages: 1, scale: 1, dpr: 1, copy: false, geometry: P.geometry, units, free: true, records: true } as never)
    await run.layFor(1)
    const lines = (run.stats.find(x => x.id === 1)?.lines ?? []) as unknown as Line[]
    expect(lines.map(l => l[4])).toEqual(['centred'])
  })
})
