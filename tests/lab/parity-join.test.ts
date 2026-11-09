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
  it("a figure text whose glyphs set a run apart is today's unit of its text alone: today's figure reading states no run", () => {
    // (2608.25210v2 p2: "Data Extraction Task" a group of its own, set in its family's bold (locate/ink.ts); today's unit is the
    // one text of the line, its id the format's unitId over 'inkfigures' and that text)
    const runs = [
      { t: 'span', id: '0', style: 'bold', must: 1, content: text('Answer') },
      { t: 'text', s: ': Officer Anderson' },
    ] as unknown as Content
    const fig = bundle({ 1: [member(50, 'figure', G)] }, [{ id: G, kind: 'inkfigures', content: runs }])
    const got = todayJoin(pagesOf({ 1: [[50, 'laid']] }), fig, [{ ord: 61, id: unitId('inkfigures', text('Answer: Officer Anderson')) }])
    expect(got[50]).toEqual({ today: 61 })
  })
})

describe("a unit whose kept runs v2 holds as elements is today's unit of the same glyphs, read as today's read them", () => {
  // (2609.36054v2 p1 #28: v2's note holds each e-mail address as an element `\url{…}` (wire-tail), a content today's prepare
  // never made, so its id is no unit's of today; today's unit of those glyphs holds the addresses as text)
  const url = (a: string, id: string) => ({ t: 'el', id, kind: 'url', src: `\\url{${a}}` })
  const note = [
    { t: 'text', s: '*Correspondence to: ' },
    url('alan@gov.ai', '1'),
    { t: 'text', s: ' and ' },
    url('soren@casp.ac', '3'),
    { t: 'text', s: '. The views are ours.' },
  ] as unknown as Content
  const said = '*Correspondence to: alan@gov.ai and soren@casp.ac. The views are ours.'
  const lines = [[1, 0, 45.65, 473.09, 45.6], [1, 0, 46.99, 460.71, 34.64]]
  const at = (...ys: number[]) => ys.map((baseline) => ({ page: 1, baseline }))
  const prepared = (o: { text?: string; pieces?: object[]; lines?: object[] } = {}) =>
    new Map([
      [
        107,
        { ord: 107, id: Q, kind: 'inknotes', text: said, pieces: [{ kind: 'text', s: o.text ?? said }], lines: at(45.6, 34.64), ...o },
      ],
    ])
  const part = (kind = 'inknotes') => bundle({ 1: [member(108, kind, P, { lines })] }, [{ id: P, kind, content: note }])
  const pages = pagesOf({ 1: [[108, 'none']] })

  it("joins it to today's unit of its text, its addresses as their text, set on the same lines of A", () => {
    expect(todayJoin(pages, part(), [{ ord: 107, id: Q }], prepared())[108]).toEqual({ today: 107 })
  })
  it('joins it whatever kind each reading gave those glyphs (2610.21313 p1: an inknotes of today, an inknames of v2)', () => {
    expect(todayJoin(pages, part('inknames'), [{ ord: 107, id: Q }], prepared())[108]).toEqual({ today: 107 })
  })
  it('joins nothing to a unit of another text, or of the same text on other lines', () => {
    expect(todayJoin(pages, part(), [{ ord: 107, id: Q }], prepared({ text: `${said} More.` }))[108]).toBeUndefined()
    expect(todayJoin(pages, part(), [{ ord: 107, id: Q }], prepared({ lines: at(45.6, 30) }))[108]).toBeUndefined()
  })
  it('joins nothing to a unit of today another member is joined to by its id', () => {
    // (another member of v2's part of today's id Q, joined to it first)
    const both = bundle(
      { 1: [member(100, 'inknotes', Q), member(108, 'inknotes', P, { lines })] },
      [
        { id: Q, kind: 'inknotes', content: text(said) },
        { id: P, kind: 'inknotes', content: note },
      ],
    )
    const got = todayJoin(pagesOf({ 1: [[100, 'laid'], [108, 'none']] }), both, [{ ord: 107, id: Q }], prepared())
    expect(got).toEqual({ 100: { today: 107 } })
  })
  it('a unit holding no element read otherwise is joined by its id alone; one of another element, where today’s holds it too', () => {
    const plain = bundle({ 1: [member(108, 'inknotes', P, { lines })] }, [{ id: P, kind: 'inknotes', content: text(said) }])
    expect(todayJoin(pages, plain, [{ ord: 107, id: Q }], prepared())[108]).toBeUndefined()
    const math = [...note, { t: 'el', id: '5', kind: 'math', src: '$x$' }] as unknown as Content
    const withMath = bundle({ 1: [member(108, 'inknotes', P, { lines })] }, [{ id: P, kind: 'inknotes', content: math }])
    // (today's placeholder of the same source: the same element; of another, no reading of v2's)
    const mathOf = (src: string) => prepared({ text: `${said}￼`, pieces: [{ kind: 'text', s: said }, { kind: 'ph', src }] })
    expect(todayJoin(pages, withMath, [{ ord: 107, id: Q }], mathOf('$x$'))[108]).toEqual({ today: 107 })
    expect(todayJoin(pages, withMath, [{ ord: 107, id: Q }], mathOf('$y$'))[108]).toBeUndefined()
  })
  it("joins a unit whose scripts v2 holds as elements to today's unit that held them as text, or part text, part placeholder", () => {
    // (2610.20967v1 p1 t123: the names' marks under Times, today's text but for the math-italic comma's placeholder ",2")
    const math = (src: string, id: string) => ({ t: 'el', id, kind: 'math', src })
    const names = [
      { t: 'text', s: 'Song-Ze Yu' },
      math('$^{1}$', '1'),
      { t: 'text', s: ', Fang-Duo Tsai' },
      math('$^{1,2}$', '3'),
      { t: 'text', s: ', Yi-Hsuan Yang' },
      math('$^{1}$', '5'),
    ] as unknown as Content
    const v = bundle({ 1: [member(124, 'inknotes', P, { lines })] }, [{ id: P, kind: 'inknotes', content: names }])
    const t123 = (pieces: object[]) =>
      new Map([[123, { ord: 123, id: Q, kind: 'inknotes', text: '', pieces, lines: at(45.6, 34.64) }]])
    const split = [{ kind: 'text', s: 'Song-Ze Yu1, Fang-Duo Tsai1' }, { kind: 'ph', src: '$,2$' }, { kind: 'text', s: ', Yi-Hsuan Yang1' }]
    const p124 = pagesOf({ 1: [[124, 'none']] })
    expect(todayJoin(p124, v, [{ ord: 123, id: Q }], t123(split))[124]).toEqual({ today: 123 })
    expect(todayJoin(p124, v, [{ ord: 123, id: Q }], t123([{ kind: 'text', s: 'Song-Ze Yu1, Fang-Duo Tsai1,2, Yi-Hsuan Yang1' }]))[124]).toEqual({ today: 123 })
    // (another mark: no join)
    expect(todayJoin(p124, v, [{ ord: 123, id: Q }], t123([{ kind: 'text', s: 'Song-Ze Yu1, Fang-Duo Tsai1,3, Yi-Hsuan Yang1' }]))[124]).toBeUndefined()
    // (and a unit of today's the dump states no lines of, one it drew nothing of, joins nothing)
    const unlined = new Map<number, object>([...t123(split), [122, { ord: 122, id: R, kind: 'inknotes', text: '', pieces: split }]])
    expect(todayJoin(p124, v, [{ ord: 122, id: R }, { ord: 123, id: Q }], unlined)[124]).toEqual({ today: 123 })
  })
})
