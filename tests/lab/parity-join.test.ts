// @vitest-environment node
// The parity's join of v2's members to today's units (lab/typeset/parity/join.mjs, written by v2.mjs into its file's `today`):
// every member the entry's Pages carry, whatever gate-l1's runner did with it, joined by its own unit's id and its rank among
// the part's members of that id, as today's units of that id by their order (the baseline's rule); an ink unit's placement
// whose text names the source unit it echoes (a contents line its heading, a note its source footnote: bundle.ts placedOf)
// joined by the ink unit's own id, the format's unitId over its kind and the echoed content. Synthetic parts and units.
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { todayJoin } from '../../lab/typeset/parity/join.mjs'
import { unitId } from '../../packages/format/src/ids.ts'

type Content = { t: 'text'; s: string }[]
const text = (s: string): Content => [{ t: 'text', s }]
/** a part member: its ord, kind and text (a unit's id), on a page, with whatever else the test gives it */
const member = (ord: number, kind: string, id: string, o: object = {}) => ({ ord, kind, text: id, lines: [[1]], ...o })
/** a paper's bundle as l1Paper reads it: its parts by page (one flow each here) and its units by id */
const bundle = (pages: Record<number, ReturnType<typeof member>[]>, units: { id: string; kind: string; content: Content }[]) => ({
  parts: new Map(Object.entries(pages).map(([pg, ms]) => [Number(pg), { flows: [ms] }])),
  units: new Map(units.map((u) => [u.id, u])),
})
/** the entry's Pages as v2.mjs keeps them: each page's members with their states */
const pagesOf = (pages: Record<number, [number, string][]>) =>
  Object.fromEntries(Object.entries(pages).map(([pg, ms]) => [pg, { members: ms.map(([ord, state]) => ({ ord, page: Number(pg), state })) }]))
const H = 'a'.repeat(64),
  P = 'b'.repeat(64),
  Q = 'c'.repeat(64),
  R = 'd'.repeat(64),
  F = 'e'.repeat(64),
  G = 'f'.repeat(64)

describe("every member the entry's Pages carry is joined, whatever the runner did with it", () => {
  // (a heading, a paragraph whose element ends a line (gate-l1's runner stops it, 'breaks (U.breaks not adapted)', and never
  // records its join; the entry lays it), a paragraph the entry leaves unproven, and a running head on two pages)
  const part = bundle(
    {
      1: [
        member(5, 'heading', H),
        member(8, 'para', P, { els: [['0', { kind: 'math', ends: [1] }]] }),
        member(9, 'para', Q),
        member(20, 'inkheads', R),
      ],
      2: [member(21, 'inkheads', R)],
    },
    [
      { id: H, kind: 'heading', content: text('Introduction') },
      { id: P, kind: 'para', content: text('A paragraph.') },
      { id: Q, kind: 'para', content: text('Another one.') },
      { id: R, kind: 'inkheads', content: text('A RUNNING HEAD') },
    ],
  )
  const today = [
    { ord: 5, id: H },
    { ord: 7, id: P },
    { ord: 9, id: Q },
    { ord: 30, id: R },
    { ord: 31, id: R },
  ]
  const pages = pagesOf({ 1: [[5, 'laid'], [8, 'laid'], [9, 'unproven'], [20, 'laid']], 2: [[21, 'laid']] })

  it("joins the member the runner stops and the entry lays, by its unit's id", () => {
    expect(todayJoin(pages, part, today)[8]).toEqual({ today: 7 })
  })
  it('joins a member the entry does not lay too: its state then names why v2 leaves it', () => {
    expect(todayJoin(pages, part, today)[9]).toEqual({ today: 9 })
  })
  it("joins equal ids by their order among the part's members, as today's units of that id by theirs", () => {
    const got = todayJoin(pages, part, today)
    expect([got[20], got[21]]).toEqual([{ today: 30 }, { today: 31 }])
  })
  it("joins only the members the entry's Pages carry", () => {
    expect(Object.keys(todayJoin(pagesOf({ 2: [[21, 'laid']] }), part, today))).toEqual(['21'])
  })
})

describe("an ink unit that echoes a source unit is joined by what it is: the ink unit's own id", () => {
  // (a contents line, the ink unit 40 whose text the part names as its heading's (5), and a note set as its source footnote,
  // 110, the footnote no member of its own; today's units: the heading and its contents line, the footnote and its note's ink)
  const content = text('Introduction'),
    note = text('Supported by a grant.')
  const part = bundle(
    { 1: [member(5, 'heading', H), member(40, 'inkcontents', H), member(110, 'inknotes', F)] },
    [
      { id: H, kind: 'heading', content },
      { id: F, kind: 'footnote', content: note },
    ],
  )
  const today = [
    { ord: 5, id: H },
    { ord: 6, id: F },
    { ord: 37, id: unitId('inkcontents', content) },
    { ord: 101, id: unitId('inknotes', note) },
  ]
  const pages = pagesOf({ 1: [[5, 'laid'], [40, 'laid'], [110, 'laid']] })

  it("a contents line laid under its heading's id is today's contents line, the heading today's heading", () => {
    const got = todayJoin(pages, part, today)
    expect(got[40]).toEqual({ today: 37 })
    expect(got[5]).toEqual({ today: 5 })
  })
  it("a note set as its source footnote is today's note, not today's footnote", () => {
    expect(todayJoin(pages, part, today)[110]).toEqual({ today: 101 })
  })
  it("a figure text's placement (kind 'figure', its unit 'inkfigures') echoes nothing: joined by its text", () => {
    const label = text('Encoder')
    const fig = bundle({ 1: [member(50, 'figure', G)] }, [{ id: G, kind: 'inkfigures', content: label }])
    // (today also holds a source unit of kind 'figure' with that text: a figure placement is not it)
    const got = todayJoin(pagesOf({ 1: [[50, 'laid']] }), fig, [
      { ord: 27, id: unitId('figure', label) },
      { ord: 60, id: G },
    ])
    expect(got[50]).toEqual({ today: 60 })
  })
})
