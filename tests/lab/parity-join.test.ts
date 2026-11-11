// @vitest-environment node
// The parity's join of v2's members to today's units (lab/typeset/parity/join.mjs, written by v2.mjs into its file's `today`):
// every member the entry's Pages carry, whatever gate-l1's runner did with it, joined by its own unit's id and its rank among
// the part's members of that id, as today's units of that id by their order (the baseline's rule); an ink unit's placement
// whose text names the source unit it echoes (a contents line its heading, a note its source footnote: bundle.ts placedOf)
// joined by the ink unit's own id, the format's unitId over its kind and the echoed content. Synthetic parts and units.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { candidateAddress, candidateKept, candidateKeptElements, candidateKeptToday, candidatePitch, heldJoin, joinedJoin, joinedPlan, todayJoin } from '../../lab/typeset/parity/join.mjs'
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

describe("a member no id joined to today's unit stage 1a states its unit holds whole ((f), (b'), (f'): its kind moved)", () => {
  // (2610.21106v1 p1's AND: today's inkorphan, v2's inknames, an ink unit's id naming its kind, so no id of today's is the
  // member's; stage 1a's statement of today's t98 names v2's unit holding it whole, which the parity joins by)
  const and = text('AND')
  const part = bundle({ 1: [member(107, 'inknames', P)] }, [{ id: P, kind: 'inknames', content: and }])
  const pages = pagesOf({ 1: [[107, 'left']] })
  const prepared = new Map([[98, { ord: 98, id: Q, kind: 'inkorphan', text: 'AND', pieces: [{ kind: 'text', s: 'AND' }], lines: [] }]])
  const stated = (cause: string, holder = P, ord = 98) => ({ id: Q, kind: 'inkorphan', replaced: true, stated: { ord, cause, holder } })

  it('joins it by the holder the statement names, for each cause of holding whole', () => {
    for (const c of ['held', 'names', 'heldBlock'])
      expect(todayJoin(pages, part, [{ ord: 98, id: Q }], prepared, [stated(c)])[107]).toEqual({ today: 98 })
  })
  it('joins it by the holder of a group kept for its pitch, today’s unit written as v2’s with that group an element, never its row (lane b5-fixes)', () => {
    // (stage 1a's (k) by group, stated.mjs `pitchGroup`: 1810.04805v2's `{\tt [CLS]}` and 2608.25210v2 p3's box, the unit's id moved
    // with its content; unjoined, today's translated unit read as missing on v2's pane, 7 pages of 1810.04805v2-zh newly worse.
    // The two contents differ, so today's row is not laid in v2's unit: `same` false)
    expect(todayJoin(pages, part, [{ ord: 98, id: Q }], prepared, [stated('pitchGroup')])[107]).toEqual({ today: 98 })
    const free = [...(part.parts.get(1)?.flows[0] ?? [])]
    const other = new Map([[98, { ...prepared.get(98)!, pieces: [{ kind: 'text', s: 'and' }] }]])
    expect([...heldJoin(free, part.units, [stated('pitchGroup')], [98], other)]).toEqual([[107, { today: 98, same: false }]])
  })
  it("joins it by the holder a names unit's stand-in of its ledger class names, its characters today's in another order (2610.30034v1)", () => {
    expect(todayJoin(pages, part, [{ ord: 98, id: Q }], prepared, [stated('order')])[107]).toEqual({ today: 98 })
  })
  it('joins none where the holder holds two of today\'s units, the cause is another, or today\'s unit is joined already', () => {
    expect(todayJoin(pages, part, [{ ord: 98, id: Q }, { ord: 99, id: R }], prepared, [stated('held'), stated('held', P, 99)])[107]).toBeUndefined()
    expect(todayJoin(pages, part, [{ ord: 98, id: Q }], prepared, [stated('trail')])[107]).toBeUndefined()
    const both = bundle({ 1: [member(100, 'inkorphan', Q), member(107, 'inknames', P)] }, [{ id: P, kind: 'inknames', content: and }, { id: Q, kind: 'inkorphan', content: and }])
    expect(todayJoin(pagesOf({ 1: [[100, 'laid'], [107, 'left']] }), both, [{ ord: 98, id: Q }], prepared, [stated('held')])[107]).toBeUndefined()
  })
  it("tells whether the two units' contents are one, so that today's row may be laid in v2's (heldJoin's `same`)", () => {
    const free = [...(part.parts.get(1)?.flows[0] ?? [])]
    expect([...heldJoin(free, part.units, [stated('held')], [98], prepared)]).toEqual([[107, { today: 98, same: true }]])
    const other = new Map([[98, { ...prepared.get(98)!, pieces: [{ kind: 'text', s: 'and' }] }]])
    expect([...heldJoin(free, part.units, [stated('held')], [98], other)]).toEqual([[107, { today: 98, same: false }]])
  })
})

describe("the members the candidate's prepare keeps as a line of e-mail addresses (the coordinator's ruling of 2026-11-10)", () => {
  // (stage 1a's run: its dump marks a kept block of addresses alone `keptBy: 'address'` (dump ords), and its located file joins
  // each dump ord to its member's ord, `dumpOrds`; the parity reads the members by them, nothing else)
  it("are the dump's units so marked, by their members' ords; none where the run holds no located file", () => {
    const run = mkdtempSync(join(tmpdir(), 'axt-address-'))
    try {
      mkdirSync(join(run, 'prepare'))
      mkdirSync(join(run, 'located'))
      const units = [
        { ord: 0, kind: 'affiliation', text: 'Institute of Things' },
        { ord: 1, kind: 'inknotes', kept: true, keptBy: 'address', text: '' },
        { ord: 2, kind: 'inkorphan', kept: true, text: '' },
        { ord: 3, kind: 'inknotes', kept: true, keptBy: 'pitch', text: '' },
      ]
      writeFileSync(join(run, 'prepare', 'p1.prepare.json'), JSON.stringify({ units }))
      writeFileSync(join(run, 'located', 'p1.json'), JSON.stringify({ dumpOrds: [[0, 10], [1, 11], [2, 12], [3, 13]] }))
      expect(candidateAddress('p1', join(run, 'prepare'))).toEqual([11])
      writeFileSync(join(run, 'prepare', 'p2.prepare.json'), JSON.stringify({ units }))
      expect(candidateAddress('p2', join(run, 'prepare'))).toEqual([])
    } finally {
      rmSync(run, { recursive: true, force: true })
    }
  })
})

describe("the members the candidate's prepare keeps for their text set wholly in a face of one pitch (Rule 1)", () => {
  // (stage 1a's run: its dump marks a unit so kept `keptBy: 'pitch'` (dump ords), and its located file joins each dump ord to
  // its member's ord, `dumpOrds`; the parity reads the members by them, nothing else)
  it("are the dump's units so marked, by their members' ords; none where the run holds no located file", () => {
    const run = mkdtempSync(join(tmpdir(), 'axt-pitch-'))
    try {
      mkdirSync(join(run, 'prepare'))
      mkdirSync(join(run, 'located'))
      const units = [
        { ord: 0, kind: 'para', text: 'a body paragraph' },
        { ord: 1, kind: 'para', kept: true, keptBy: 'pitch', text: '{ "key": 1 }' },
        { ord: 2, kind: 'code', kept: true, text: 'kept by its environment' },
        { ord: 3, kind: 'inkfigures', keptBy: 'pitch', text: 'x = f(y)' },
      ]
      writeFileSync(join(run, 'prepare', 'p1.prepare.json'), JSON.stringify({ units }))
      writeFileSync(join(run, 'located', 'p1.json'), JSON.stringify({ dumpOrds: [[0, 10], [1, 11], [2, 12], [3, 40]] }))
      expect(candidatePitch('p1', join(run, 'prepare'))).toEqual([11, 40])
      writeFileSync(join(run, 'prepare', 'p2.prepare.json'), JSON.stringify({ units }))
      expect(candidatePitch('p2', join(run, 'prepare'))).toEqual([])
    } finally {
      rmSync(run, { recursive: true, force: true })
    }
  })
})

describe("what the candidate's prepare keeps by a rule's mark: its members, and today's units it states so (the coordinator's ruling of 2026-11-10)", () => {
  // (lane literal-fixes: a figure text kept for an identifier, `keptBy: 'identifier'`, is a member of its own; a cell of
  // identifiers alone is no unit of the candidate's, its statement of today's unit carrying the mark: today's ord, `stated.ord`)
  it("are the members each mark names, and today's ords the statements so marked name; none where the run holds no file", () => {
    const run = mkdtempSync(join(tmpdir(), 'axt-kept-'))
    try {
      mkdirSync(join(run, 'prepare'))
      mkdirSync(join(run, 'located'))
      const units = [
        { ord: 0, kind: 'para', text: 'a body paragraph' },
        { ord: 1, kind: 'inkfigures', keptBy: 'identifier', text: 'niah_single_1' },
        { ord: 2, kind: 'para', kept: true, keptBy: 'pitch', text: '{ "key": 1 }' },
        { ord: 3, kind: 'cell', keptBy: 'identifier', text: 'llm_equal_human', state: 'unlaid', replaced: true, stated: { ord: 72, cause: 'identifier' } },
        { ord: 4, kind: 'cell', text: 'x', state: 'unlaid', replaced: true, stated: { ord: 73, cause: 'held', holder: 'b' } },
      ]
      writeFileSync(join(run, 'prepare', 'p1.prepare.json'), JSON.stringify({ units }))
      writeFileSync(join(run, 'located', 'p1.json'), JSON.stringify({ dumpOrds: [[0, 10], [1, 11], [2, 12]] }))
      expect(candidateKept('p1', 'identifier', join(run, 'prepare'))).toEqual([11])
      expect(candidateKept('p1', 'pitch', join(run, 'prepare'))).toEqual([12])
      expect(candidateKeptToday('p1', join(run, 'prepare'))).toEqual([[72, 'identifier']])
      expect(candidateKeptToday('p9', join(run, 'prepare'))).toEqual([])
    } finally {
      rmSync(run, { recursive: true, force: true })
    }
  })
})

describe('joinedPlan: several of today’s units saying one of v2’s, by the exact text (lane fig-text)', () => {
  it('pairs a word joined across a size change: today’s two pieces, v2’s one text (2608.06701v1 p1)', () => {
    expect(joinedPlan(['and retry viewing th', 'e file.'], [{ t: 'text', s: 'and retry viewing the file.' }])).toEqual([
      { t: 'today', i: 0 },
      { t: 'today', i: 1 },
    ])
  })
  it('pairs a label and its address, the address v2’s element (F0, 2611.03178v1 p1)', () => {
    const content = [{ t: 'text', s: 'Project Page: ' }, { t: 'el', id: '1', kind: 'code', src: 'site.io' }]
    expect(joinedPlan(['Project Page:', 'site.io'], content)).toEqual([
      { t: 'today', i: 0 },
      { t: 'el', id: '1' },
    ])
  })
  it('joins a word TeX broke at a line’s end, today’s hyphen left out', () => {
    expect(joinedPlan(['the foun-', 'dation models'], [{ t: 'text', s: 'the foundation models' }])).toEqual([
      { t: 'today', i: 0 },
      { t: 'today', i: 1 },
    ])
  })
  it('none where the texts are not one, or a piece of today’s straddles an element’s edge', () => {
    expect(joinedPlan(['and retry', 'the file.'], [{ t: 'text', s: 'and retry viewing the file.' }])).toBeNull()
    const content = [{ t: 'text', s: 'Page: ' }, { t: 'el', id: '1', kind: 'code', src: 'site.io' }]
    expect(joinedPlan(['Page: site', '.io'], content)).toBeNull()
  })
})

describe('joinedJoin: today’s run of one pitch stage 1a states kept as an element of v2’s line, (k) on elements (lane fig-text)', () => {
  // (2608.06701v1 p1's "Action:" and its typewriter command, today's two units; F0's one figure text, the command its element:
  // stage 1a states "Action:" held whole and the command kept for its pitch, each naming the text as its holder)
  const content = [
    { t: 'text', s: 'Action: ' },
    { t: 'el', id: '1', kind: 'code', src: 'view x.py' },
  ]
  const part = bundle({ 1: [member(107, 'figure', P)] }, [{ id: P, kind: 'inkfigures', content: content as unknown as Content }])
  const prepared = new Map([
    [98, { ord: 98, id: Q, kind: 'inkfigures', text: 'Action:', pieces: [{ kind: 'text', s: 'Action:' }], lines: [] }],
    [99, { ord: 99, id: R, kind: 'inkfigures', text: 'view x.py', pieces: [{ kind: 'text', s: 'view x.py' }], lines: [] }],
  ])
  const stated = (cause: string, ord: number) => ({ id: Q, kind: 'inkfigures', replaced: true, stated: { ord, cause, holder: P } })
  it('joins both to the line by the holder named, the command the element', () => {
    const free = [...(part.parts.get(1)?.flows[0] ?? [])]
    expect([...joinedJoin(free, part.units, [stated('held', 98), stated('pitch', 99)], [98, 99], prepared)]).toEqual([
      [107, { todays: [98, 99], plan: [{ t: 'today', i: 0 }, { t: 'el', id: '1' }] }],
    ])
    // (kept as an element of a decoration's, (n), alike; another cause none)
    expect(joinedJoin(free, part.units, [stated('held', 98), stated('decoration', 99)], [98, 99], prepared).size).toBe(1)
    expect(joinedJoin(free, part.units, [stated('held', 98), stated('trail', 99)], [98, 99], prepared).size).toBe(0)
  })
})

describe("the ink of the elements the candidate's prepare keeps as the original's, by member (the coordinator's ruling 1 on F0, 2026-11-10)", () => {
  // (rebuild/fig-text F0: the dump marks an element of a figure text `keptBy` 'pitch' (its run of one pitch) or 'decoration' (a
  // stretch a frame, an underline or a tone holds); the verdict reads the original's style without their ink)
  it("are each marked element's segments as boxes [page, x0, y0, x1, y1], by the member its unit is joined to; none else", () => {
    const run = mkdtempSync(join(tmpdir(), 'axt-kept-els-'))
    try {
      mkdirSync(join(run, 'prepare'))
      mkdirSync(join(run, 'located'))
      const seg = (x0: number, x1: number) => ({ page: 1, x0, x1, baseline: 300, top: 307, bottom: 297 })
      const units = [
        { ord: 0, kind: 'inkfigures', text: 'Action: view x.py', elements: [{ k: 1, kind: 'code', flags: [], keptBy: 'pitch', segs: [seg(145, 200)] }] },
        { ord: 1, kind: 'inkfigures', text: 'a name on a tone', elements: [{ k: 1, kind: 'other', flags: [], keptBy: 'decoration', segs: [seg(10, 40), seg(42, 60)] }] },
        { ord: 2, kind: 'para', text: 'a formula', elements: [{ k: 1, kind: 'math', flags: [], segs: [seg(5, 9)] }] },
        { ord: 3, kind: 'inkfigures', text: 'x', state: 'unlaid', replaced: true, elements: [{ k: 1, kind: 'code', flags: [], keptBy: 'pitch', segs: [seg(1, 2)] }] },
      ]
      writeFileSync(join(run, 'prepare', 'p1.prepare.json'), JSON.stringify({ units }))
      writeFileSync(join(run, 'located', 'p1.json'), JSON.stringify({ dumpOrds: [[0, 10], [1, 11], [2, 12], [3, 13]] }))
      expect(candidateKeptElements('p1', join(run, 'prepare'))).toEqual([
        [10, [[1, 145, 297, 200, 307]]],
        [11, [[1, 10, 297, 40, 307], [1, 42, 297, 60, 307]]],
      ])
      expect(candidateKeptElements('p9', join(run, 'prepare'))).toEqual([])
    } finally {
      rmSync(run, { recursive: true, force: true })
    }
  })
})
