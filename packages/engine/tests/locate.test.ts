import { read, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import { bundle } from '../src/bundle/bundle.ts'
import type { Doc } from '../src/doc.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import { locate } from '../src/locate/locate.ts'
import type { AddOn } from '../src/wrap/wrap.ts'
import { docOf, type PageSpec } from './helpers/doc.ts'

const text = (s: string) => ({ t: 'text' as const, s })
const unitOf = (kind: string, s: string, more: Partial<InstrumentUnit> = {}): InstrumentUnit => {
  const content = [text(s)]
  return { id: unitId(kind, content), kind, content, ...more }
}

/** an instrument over B whose units own B's glyphs line by line: `own[p][line]` the unit of that line (-1 none) */
function instrumentOf(B: Doc, units: InstrumentUnit[], own: number[][], roles: number[][] = []): Instrument {
  return {
    ink: B,
    units,
    glyphs: B.pages.map((pg, p) => {
      const O = ownersOf(pg.glyphs.length)
      // (docOf's glyph `n` is its line)
      pg.glyphs.forEach((g, j) => {
        O.unit[j] = own[p]?.[g.n] ?? -1
        O.role[j] = roles[p]?.[g.n] ?? ROLE.text
      })
      return O
    }),
    boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
    tex: {},
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
  }
}

const addOnOf = (located: ReturnType<typeof locate>, pages: number, refuse: number[] = []): AddOn => ({
  bytes: new Uint8Array([1, 2, 3]),
  pages: new Map(
    Array.from({ length: pages }, (_, i) => [
      i + 1,
      refuse.includes(i + 1) ? { ok: false, why: 'test' } : { ok: true },
    ]),
  ),
  groups: new Set(
    located.groups.flatMap((g, i) => (refuse.includes(i + 1) ? [] : g.glyphs.filter((x): x is string => x !== null))),
  ),
  ocgs: new Map(),
  stats: {} as AddOn['stats'],
})

describe('locate', () => {
  const pages: PageSpec[] = [{ lines: ['A first paragraph', 'that runs on'] }, { lines: ['a heading', 'second text'] }]
  const B = docOf(pages)
  const units = [
    unitOf('para', 'A first paragraph that runs on'),
    unitOf('heading', 'a heading'),
    unitOf('para', 'second text'),
  ]
  const ins = instrumentOf(B, units, [
    [0, 0],
    [1, 2],
  ])

  it('locates every unit whose glyphs all have partners, its lines read from A', () => {
    const A = docOf([
      {
        lines: [
          { text: 'A first paragraph', x: 80 },
          { text: 'that runs on', x: 80 },
        ],
      },
      pages[1]!,
    ])
    const L = locate(ins, A, align(B, A))
    expect(L.members.map((m) => m.located)).toEqual([true, true, true])
    expect(L.members[0]!.place).toBe('shifted')
    expect(L.members[1]!.place).toBe('same')
    expect(L.members[0]!.lines.map((l) => [l[0], l[2], l[4]])).toEqual([
      [1, 80, 700],
      [1, 80, 688],
    ])
    // (its groups, per member and page: what the wrap plans)
    expect(new Set(L.groups[0]!.glyphs)).toEqual(new Set(['0.1.t']))
    expect(new Set(L.groups[1]!.glyphs)).toEqual(new Set(['1.2.t', '2.2.t']))
  })
  it('leaves a unit not located where one of its glyphs has no partner, and says why', () => {
    const A = docOf([pages[0]!, { lines: ['a heading', 'second test'] }])
    const L = locate(ins, A, align(B, A))
    expect(L.members[2]).toMatchObject({ located: false, cause: 'content difference: char' })
    expect(L.members[0]!.located).toBe(true)
    expect(L.groups[1]!.glyphs.filter((g) => g?.startsWith('2.'))).toEqual([])
    expect(L.stats.unlocated).toEqual({ 'content difference: char': 1 })
  })
  it('makes a unit of text B never printed, born on A', () => {
    const A = docOf([pages[0]!, pages[1]!, { lines: ['a supplement page', 'of its own'] }])
    const L = locate(ins, A, align(B, A))
    expect([...L.born.values()].map((b) => b.content)).toEqual([[text('a supplement page of its own')]])
    expect(L.members.at(-1)).toMatchObject({ kind: 'inkorphan', located: true, unit: -1 })
  })
  it('chains members that share a TeX line into one flow', () => {
    const B2 = docOf([{ lines: [{ text: 'Head.', x: 72 }, { text: 'Body runs on', x: 110, y: 700 }, 'and on'] }])
    const units2 = [unitOf('heading', 'Head.'), unitOf('para', 'Body runs on and on')]
    const L = locate(instrumentOf(B2, units2, [[0, 1, 1]]), B2, align(B2, B2))
    expect(L.flows).toEqual([[0, 1]])
    expect(L.members[1]!.join?.[0]).toBeCloseTo(110 - (72 + 5 * 6), 5)
  })
})

describe('locate: the glyphs of A with no partner on B inside a unit', () => {
  const B = docOf([{ lines: ['a paragraph whose word', 'continues on its last line'] }])
  const ins = instrumentOf(B, [unitOf('para', 'a paragraph whose word continues on its last line')], [[0, 0]])
  it('claims a line-end hyphen arXiv sets where our compile does not break the word', () => {
    const A = docOf([{ lines: ['a paragraph whose word con-', 'tinues on its last line'] }])
    const L = locate(ins, A, align(B, A))
    const hyphen = 'a paragraph whose word con'.length
    expect(L.members[0]).toMatchObject({ located: true })
    expect(L.members[0]!.text).toContain(hyphen)
    expect(L.groups[0]!.glyphs[hyphen]).toBe('0.1.t')
    expect(L.born.size).toBe(0)
  })
  it('leaves an included figure that only A draws between two lines of a unit to the figure, not to the unit', () => {
    // (a float set "here" inside a paragraph: TeX puts it after the current line, and where B is a draft, its figure's own
    // glyphs are A's alone)
    const A = docOf([
      {
        lines: [
          'a paragraph whose word',
          { text: 'Loss', y: 640, form: true },
          { text: 'continues on its last line', y: 600 },
        ],
      },
    ])
    const L = locate(ins, A, align(B, A))
    const fig = ['a paragraph whose word'.length, 'a paragraph whose word'.length + 3]
    expect(L.members[0]).toMatchObject({ located: true })
    expect(L.members[0]!.text).not.toContain(fig[0])
    expect(L.groups[0]!.glyphs[fig[0]!]).not.toBe('0.1.t')
    expect([...L.born.values()]).toEqual([{ kind: 'inkfigures', content: [text('Loss')] }])
  })
  it('leaves a unit the original’s where A sets text inside it that our compile does not', () => {
    const A = docOf([{ lines: ['a paragraph whose (X) word', 'continues on its last line'] }])
    const L = locate(ins, A, align(B, A))
    expect(L.members[0]).toMatchObject({ located: false, cause: 'content difference: aonly' })
    expect(L.groups[0]!.glyphs.every((g) => g === null || !g.startsWith('0.'))).toBe(true)
  })
})

describe('bundle', () => {
  const B = docOf([
    { lines: ['page one text', 'runs on'] },
    { lines: ['to page two', 'then more'] },
    { lines: ['page three'] },
  ])
  const units = [
    unitOf('para', 'page one text runs on to page two'),
    unitOf('para', 'then more'),
    unitOf('para', 'page three'),
  ]
  const ins = instrumentOf(B, units, [[0, 0], [0, 1], [2]])
  const L = locate(ins, B, align(B, B))
  const original = new Uint8Array(70000).map((_, i) => i & 255)
  const objects = [
    ...bundle({
      ins,
      located: L,
      addOn: addOnOf(L, 3),
      original,
      paper: { id: '2501.00001', version: 1, pages: 3 },
      made: 'test',
    }),
  ]

  it('writes units first, a part a page that lays, the add-on, and the head last, each read back by its digest', () => {
    expect(objects.map((o) => o.kind)).toEqual(['units', 'part', 'part', 'part', 'addon', 'head'])
    for (const o of objects)
      if (o.kind !== 'addon') expect(() => read(o.kind === 'units' ? 'units' : o.kind, o.bytes, o.digest)).not.toThrow()
    const head = objects.at(-1) as Extract<(typeof objects)[number], { kind: 'head' }>
    expect(head.head.parts.filter(Boolean)).toHaveLength(3)
    expect(head.head.original).toMatchObject({ bytes: 70000, chunk: 65536 })
    expect(head.head.original.chunks).toHaveLength(44)
  })
  it('holds in a part every flow its page reads: its own, and those of the page a running-on member begins on', () => {
    const parts = objects.filter((o) => o.kind === 'part') as Extract<(typeof objects)[number], { kind: 'part' }>[]
    // page 2: unit 0 runs on from page 1 (a), and page 1's flows (b) are its own; unit 1's (a)
    expect(parts.map((p) => [p.page, p.flows])).toEqual([
      [1, { a: 1, b: 0, c: 0 }],
      [2, { a: 2, b: 0, c: 0 }],
      [3, { a: 1, b: 0, c: 0 }],
    ])
    const p2 = read('part', parts[1]!.bytes)
    expect(p2.flows.flat().map((m) => m.ord)).toEqual([0, 1])
  })
  it('states why a member stays the original’s: not located, its page refused', () => {
    const refused = [
      ...bundle({
        ins,
        located: L,
        addOn: addOnOf(L, 3, [3]),
        original,
        paper: { id: '2501.00001', version: 1, pages: 3 },
        made: 'test',
      }),
    ]
    const head = (refused.at(-1) as Extract<(typeof refused)[number], { kind: 'head' }>).head
    expect(head.refused).toEqual([[3, 'page']])
    expect(head.parts[2]).toBeNull()
  })
})
