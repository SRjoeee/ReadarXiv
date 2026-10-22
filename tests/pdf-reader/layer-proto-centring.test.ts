import { beforeAll, describe, expect, it } from 'vitest'
import { indexLayout, parseLayout, UNIT_FLAG } from '@/pdf-reader/engine/layout/file.mjs'
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

describe('a column whose cells share a start or an end is not centred, whatever its widths', () => {
  // (an l column at 160 of widths 20, 22 and 25, its middles 2.5 apart; an r column ending at 250 of the same widths: each
  // middle within 2 of the median, the widths 5 apart, which a test of each middle against the median had called centred)
  const paper: Paper = {
    name: 'flush columns', pages: 1,
    specs: [
      para(0, [[1, 270, 4]], 30),
      cellSpec(1, [[200, 160, 180]], '0:c1'), cellSpec(2, [[188, 160, 182]], '0:c1'), cellSpec(3, [[176, 160, 185]], '0:c1'),
      cellSpec(4, [[200, 230, 250]], '0:c2'), cellSpec(5, [[188, 228, 250]], '0:c2'), cellSpec(6, [[176, 225, 250]], '0:c2'),
    ],
  }
  for (const groups of [true, false]) {
    it(`${groups ? 'the open\'s table groups' : 'the units\' own groups'}: the l and the r column's cells not centred`, async () => {
      const run = await openRun(build(paper), { groups })
      await run.layFor(1)
      expect([1, 2, 3, 4, 5, 6].map(id => kindsOf(run, id))).toEqual([['last'], ['last'], ['last'], ['last'], ['last'], ['last']])
    })
  }
})

describe('a cell its column cannot decide is drawn as the layout file\'s flag says', () => {
  // (a header cell, whose group names no column, and a body cell alone in its column, each flagged CENTRED; a lone cell not
  // flagged: the column decides none of them, the flag does)
  const paper: Paper = {
    name: 'undecided cells', pages: 1,
    specs: [para(0, [[1, 270, 4]], 30), cellSpec(1, [[220, 60, 110]], '0:h'), cellSpec(2, [[200, 60, 110]], '0:c0'), cellSpec(3, [[180, 160, 200]], '0:c1')],
  }
  const flagged = () => {
    const P = build(paper)
    const layout = P.layout as unknown as { units: number[][] }
    layout.units = layout.units.map(u => (u[0] === 1 || u[0] === 2 ? [u[0], u[1], u[2], UNIT_FLAG.CENTRED, u[4]] : u)) as never
    P.index = indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(P.layout))))
    return P
  }
  for (const groups of [true, false]) {
    it(`${groups ? 'the open\'s table groups' : 'the units\' own groups'}: the flagged header and lone cell centred, the lone cell not flagged not`, async () => {
      const run = await openRun(flagged(), { groups })
      await run.layFor(1)
      expect([1, 2, 3].map(id => kindsOf(run, id))).toEqual([['centred'], ['centred'], ['last']])
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

describe("a centred line on a page with no paragraph is laid in its column's measure (2610.16663's figure pages)", () => {
  // (page 1: a paragraph over 20 to 280; page 2: a figure's caption alone, centred, one line of ink 100 to 200 about 150, its
  // translation 250 wide: on page 2 the page's own lines give no column, and the caption's own ink was its measure, so the
  // caption went on two lines)
  const paper: Paper = {
    name: 'figure page', pages: 2,
    specs: [para(0, [[1, 270, 4]], 30), { id: 1, kind: 'caption', lines: [line(2, 150, 'Figure S1: BIST', 100, 200)], chars: 25, at: 0x4e00 + 64 }],
  }
  const built = () => {
    const P = build(paper)
    for (const l of paper.specs[0]!.lines) l.x1 = 280
    const layout = P.layout as unknown as { units: number[][]; lines: [number, number[]][] }
    layout.units = layout.units.map(u => (u[0] === 1 ? [u[0], u[1], u[2], UNIT_FLAG.CENTRED, u[4]] : u)) as never
    layout.lines = layout.lines.map(([id, rows]) => [id, id === 0 ? rows.map((v, i) => (i % 8 === 2 ? 280 : v)) : rows]) as never
    P.index = indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(P.layout))))
    const g = P.geometry as { left: { units: unknown[] } }
    g.left.units = paper.specs.map(s => [s.id, s.id, s.lines.map(l => [l.page, l.x0, l.b - 2, l.x1, l.b + 7])])
    return P
  }
  it('on one line about its own centre, as wide as the column there allows', async () => {
    const run = await openRun(built())
    await run.layFor(2)
    const lines = (run.stats.find(x => x.id === 1)?.lines ?? []) as unknown as Line[]
    expect(lines.map(l => l[4])).toEqual(['centred'])
    // (its slot about the caption's own centre, 150, from the column's edge to its mirror: 20 to 280)
    expect(lines[0]![6]).toBe(20)
  })
})
