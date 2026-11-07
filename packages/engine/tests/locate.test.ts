import { read, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import { bundle, stateOf } from '../src/bundle/bundle.ts'
import type { Doc, DocTurned } from '../src/doc.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import { eachBetweenPaired, locate } from '../src/locate/locate.ts'
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
  lost: new Set(),
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
    expect(L.born.size).toBe(0)
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
  it('chains a run-in head to its paragraph whose first line crosses the page middle, the head short at its left', () => {
    // (1706.03762v7 p10's "Acknowledgements We are grateful to …": a table's cells on both halves make the page read as two
    // columns, the head's line in the left half, its paragraph's first line over both; the columns as the names' binding
    // reads them, a line over both of either)
    const cells = ['WSJ only', 'semi', 'multi'].flatMap((t, k) => [
      { text: t, x: 120, y: 600 - 12 * k },
      { text: t, x: 400, y: 600 - 12 * k },
    ])
    const B2 = docOf([
      {
        lines: [
          { text: 'Acknowledgements', x: 108, y: 700 },
          { text: 'We are grateful to Nal Kalchbrenner and Stephan', x: 214, y: 700 },
          { text: 'Gouws for their fruitful comments and corrections and', x: 108, y: 688 },
          { text: 'inspiration.', x: 108, y: 676 },
          ...cells,
        ],
      },
    ])
    const units2 = [
      unitOf('heading', 'Acknowledgements'),
      unitOf(
        'para',
        'We are grateful to Nal Kalchbrenner and Stephan Gouws for their fruitful comments and corrections and inspiration.',
      ),
      ...cells.map((c, k) => unitOf('cell', `${c.text} ${k}`)),
    ]
    const own = [0, 1, 1, 1, ...cells.map((_, k) => 2 + k)]
    const L = locate(instrumentOf(B2, units2, [own]), B2, align(B2, B2))
    expect(L.members.slice(0, 2).map((m) => m.lines[0]![1])).toEqual([0, 2])
    expect(L.flows[0]).toEqual([0, 1])
    expect(L.members[1]!.join?.[0]).toBeCloseTo(214 - (108 + 16 * 6), 5)
  })
  it('keeps apart two members a tabular row sets side by side, one of them over the page middle (1706.03762v7 p1)', () => {
    // (the author block's three columns of names on one baseline, the middle one over the page's middle: no run-in head, two
    // boxes TeX set in one row, each its own flow)
    const cells = ['WSJ only', 'semi', 'multi'].flatMap((t, k) => [
      { text: t, x: 120, y: 600 - 12 * k },
      { text: t, x: 400, y: 600 - 12 * k },
    ])
    const B2 = docOf([
      {
        lines: [{ text: 'Ashish Vaswani', x: 120, y: 700 }, { text: 'Noam Shazeer', x: 280, y: 700 }, ...cells],
      },
    ])
    const units2 = [
      unitOf('author', 'Ashish Vaswani'),
      unitOf('author', 'Noam Shazeer'),
      ...cells.map((c, k) => unitOf('cell', `${c.text} ${k}`)),
    ]
    const L = locate(instrumentOf(B2, units2, [[0, 1, ...cells.map((_, k) => 2 + k)]]), B2, align(B2, B2))
    expect(L.members.slice(0, 2).map((m) => m.lines[0]![1])).toEqual([0, 2])
    expect(L.flows.slice(0, 2)).toEqual([[0], [1]])
  })
  it('chains a run-in head to its paragraph across a float and a footnote the stream sets between them', () => {
    // (2608.06701v1 p6: the head, then a table's caption and a footnote, each a paragraph of its own inside its insert, then the
    // head's paragraph on its row)
    const lines = [
      { text: 'Head.', x: 72, y: 700 },
      { text: 'Table 1: a caption', x: 72, y: 500 },
      { text: 'a note', x: 72, y: 80 },
      { text: 'Body runs on', x: 110, y: 700 },
      { text: 'and on', x: 72, y: 688 },
    ]
    const B2 = docOf([{ lines }])
    const units2 = [
      unitOf('heading', 'Head.'),
      unitOf('caption', 'Table 1: a caption'),
      unitOf('footnote', 'a note'),
      unitOf('para', 'Body runs on and on'),
    ]
    const ins2 = instrumentOf(B2, units2, [[0, 1, 2, 3, 3]])
    // (the caption's and the footnote's own paragraph ends, after their last glyphs)
    ins2.tex = { paragraphEnds: [[5 + 18, 5 + 18 + 6]] }
    const L = locate(ins2, B2, align(B2, B2))
    expect(L.flows).toEqual([[0, 3], [1], [2]])
    expect(L.members[3]!.join?.[0]).toBeCloseTo(110 - (72 + 5 * 6), 5)
    // (a paragraph end of the head's own, before the float: the head ends its paragraph, and the two are not one)
    ins2.tex = { paragraphEnds: [[5, 5 + 18, 5 + 18 + 6]] }
    expect(locate(ins2, B2, align(B2, B2)).flows).toEqual([[0], [1], [2], [3]])
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
    // (its A-only glyphs stay A's ink inside it: no unit is born of them)
    expect(L.born.size).toBe(0)
  })
  it('reads a run of A-only glyphs once, not once for each glyph of it (PR #620 review: a scan quadratic in the run)', () => {
    // (each glyph of a run of k A-only glyphs looked for its paired neighbours by walking the run: k² reads of the mapping)
    // (30 lines of 50 inside it: a line of 1,500 would run off the page, whose glyphs no unit claims)
    const A = docOf([
      {
        lines: [
          'a paragraph whose',
          ...Array.from({ length: 30 }, () => 'x'.repeat(50)),
          'word continues on its last line',
        ],
      },
    ])
    const m = align(B, A)
    let reads = 0
    const counted = <T extends Int32Array>(arr: T): T =>
      new Proxy(arr, {
        get(t, p) {
          if (typeof p === 'string' && /^\d+$/.test(p)) reads++
          const v = Reflect.get(t, p, t)
          return typeof v === 'function' ? v.bind(t) : v
        },
      })
    const L = locate(ins, A, { ...m, aToB: counted(m.aToB), bToA: counted(m.bToA) })
    expect(L.members[0]).toMatchObject({ located: false, cause: expect.stringMatching(/^content difference: /) })
    const glyphs = A.pages[0]!.glyphs.length + B.pages[0]!.glyphs.length
    expect(reads).toBeLessThan(20 * glyphs)
  })
})

describe('a babel name’s counter', () => {
  it('states the counter TeX set after a name that leads no unit (Word.counter), its own text the word alone', () => {
    // (IEEEtran's "APPENDIX A" over its title: the wrap gives the counter the name's group (own.mjs); the part stated the name's
    // text "APPENDIX A" and no counter, so S.names drew "ANHANG" over both and the counter was erased)
    const B = docOf([
      {
        lines: ['APPENDIX A', 'Body text here'],
        points: [
          ['n1.appendix.s', 0],
          ['n1.appendix.e', 8],
        ],
      },
    ])
    const units = [unitOf('para', 'Body text here'), { ...unitOf('name', 'Appendix'), name: 'appendix' }]
    const ins = instrumentOf(B, units, [[1, 0]], [[ROLE.name, ROLE.text]])
    const L = locate(ins, B, align(B, B))
    const o = [
      ...bundle({
        ins,
        located: L,
        addOn: addOnOf(L, 1),
        original: new Uint8Array(10),
        paper: { id: '2501.00001', version: 1, pages: 1 },
        made: 'test',
      }),
    ].find((x) => x.kind === 'part')!
    const name = read('part', o.bytes, o.digest)
      .flows.flat()
      .find((m) => m.kind === 'name')!
    expect(name.plain).toBe('APPENDIX')
    expect(name.text).toEqual({ name: 'appendix', counter: ['A', [1, 126, 698, 132, 707, 700]] })
  })
})

describe('a babel name that leads a unit (today’s RUN_IN, make.mjs leadAt)', () => {
  const partOf = (ins: Instrument, L: ReturnType<typeof locate>) => {
    const o = [
      ...bundle({
        ins,
        located: L,
        addOn: addOnOf(L, 1),
        original: new Uint8Array(10),
        paper: { id: '2501.00001', version: 1, pages: 1 },
        made: 'test',
      }),
    ].find((x) => x.kind === 'part')!
    return read('part', o.bytes, o.digest)
  }
  it('states the unit a name TeX set right before on its line leads: the name bound, before it in its flow', () => {
    // (amsthm's "Proof." on its paragraph's first row: the name, the paragraph's label "." (the joint), its text; the part stated
    // no relation, so the entry read one off any member to the right on the baseline)
    const B = docOf([
      {
        lines: [
          { text: 'Proof', y: 700 },
          { text: '.', x: 102, y: 700 },
          { text: 'The claim holds', x: 112, y: 700 },
          { text: 'on the next line', y: 688 },
        ],
      },
    ])
    const units = [
      unitOf('theorem', '. The claim holds on the next line'),
      { ...unitOf('name', 'Proof'), name: 'proof' },
    ]
    const ins = instrumentOf(B, units, [[1, 0, 0, 0]], [[ROLE.name, ROLE.label, ROLE.text, ROLE.text]])
    const L = locate(ins, B, align(B, B))
    const name = L.members.find((m) => m.kind === 'name')!
    const para = L.members.find((m) => m.kind === 'theorem')!
    expect(L.flows.find((f) => f.includes(para.ord))).toEqual([name.ord, para.ord])
    const flow = partOf(ins, L).flows.find((f) => f.some((m) => m.ord === para.ord))!
    expect(flow.map((m) => [m.kind, m.bound ?? 0])).toEqual([
      ['name', 1],
      ['theorem', 0],
    ])
    // (TeX's separation from the name to its text, the joint standing between: kept)
    expect(flow[1]!.join).toEqual([10, 1])
    // (the name's glyphs its lead's, not ink beside its first line: no PINNED by them, its room beside not stopped at them)
    expect(flow[1]!.lines[0]![9] & 2).toBe(0)
    expect(flow[1]!.room.side?.[0] ?? 0).toBeLessThan(72.01)
  })
  it('binds a name that shares its line with another name, the other kept in its own flow (Devin on #624)', () => {
    // (two names on one line, "Appendix" and "Proof", the second leading its theorem: binding it spliced out the whole flow
    // it was in, and the first was in no flow of the part. Every member stands in one flow, once)
    const B = docOf([
      {
        lines: [
          { text: 'Appendix', y: 700 },
          { text: 'Proof', x: 126, y: 700 },
          { text: '.', x: 156, y: 700 },
          { text: 'The claim holds', x: 166, y: 700 },
          { text: 'on the next line', y: 688 },
        ],
      },
    ])
    const units = [
      { ...unitOf('name', 'Appendix'), name: 'appendix' },
      { ...unitOf('name', 'Proof'), name: 'proof' },
      unitOf('theorem', '. The claim holds on the next line'),
    ]
    const ins = instrumentOf(B, units, [[0, 1, 2, 2, 2]], [[ROLE.name, ROLE.name, ROLE.label, ROLE.text, ROLE.text]])
    const L = locate(ins, B, align(B, B))
    const proof = L.members.find((m) => m.kind === 'name' && m.name === 'proof')!
    const appendix = L.members.find((m) => m.kind === 'name' && m.name === 'appendix')!
    const para = L.members.find((m) => m.kind === 'theorem')!
    const all = L.flows.flat()
    expect(all.filter((o) => o === appendix.ord).length).toBe(1)
    expect(all.filter((o) => o === proof.ord).length).toBe(1)
    expect(all.length).toBe(new Set(all).size)
    const flow = L.flows.find((f) => f.includes(para.ord))!
    expect(flow.slice(flow.indexOf(proof.ord))).toEqual([proof.ord, para.ord])
    // (no size tie names a member twice, nor the bound name with the members it left)
    for (const t of L.ties) if (t.rule === 'size') expect(t.ords.length).toBe(new Set(t.ords).size)
    expect(
      partOf(ins, L)
        .flows.flat()
        .map((m) => m.ord)
        .sort(),
    ).toEqual(L.members.map((m) => m.ord).sort())
  })
  it('leads no unit across the columns: a name whose next glyph in the stream is its column’s next line', () => {
    // (Devin on #623: a left column's "Abstract" at 72-120 and the right column's paragraph on its baseline, 700: the entry took
    // the right column for the name's run-in follower and left the name the original's)
    const B = docOf([
      {
        lines: [
          { text: 'Abstract', y: 700 },
          { text: 'The abstract text', y: 688 },
          { text: 'A right column paragraph', x: 320, y: 700 },
        ],
      },
    ])
    const units = [
      unitOf('abstract', 'The abstract text'),
      unitOf('para', 'A right column paragraph'),
      { ...unitOf('name', 'Abstract'), name: 'abstract' },
    ]
    const ins = instrumentOf(B, units, [[2, 0, 1]], [[ROLE.name, ROLE.text, ROLE.text]])
    const L = locate(ins, B, align(B, B))
    const name = L.members.find((m) => m.kind === 'name')!
    expect(L.flows.find((f) => f.includes(name.ord))).toEqual([name.ord])
    expect(
      partOf(ins, L)
        .flows.flat()
        .find((m) => m.kind === 'name')!.bound,
    ).toBeUndefined()
  })
  it('leads no unit in the other column, even on the name’s baseline: a left column’s last line and the right column’s first', () => {
    // (local Codex on #624: a name at the left column's end, y 700, and the right column's first unit on that baseline, next in
    // TeX's stream; same page, same baseline, to the right: bound across the columns before)
    const B = docOf([
      {
        lines: [
          { text: 'Left one', y: 724 },
          { text: 'Left two', y: 712 },
          { text: 'Abstract', y: 700 },
          { text: 'Right one', x: 320, y: 700 },
          { text: 'Right two', x: 320, y: 688 },
          { text: 'Right three', x: 320, y: 676 },
        ],
      },
    ])
    const units = [
      unitOf('para', 'Left one Left two'),
      unitOf('para', 'Right one Right two Right three'),
      { ...unitOf('name', 'Abstract'), name: 'abstract' },
    ]
    const ins = instrumentOf(
      B,
      units,
      [[0, 0, 2, 1, 1, 1]],
      [[ROLE.text, ROLE.text, ROLE.name, ROLE.text, ROLE.text, ROLE.text]],
    )
    const L = locate(ins, B, align(B, B))
    const name = L.members.find((m) => m.kind === 'name')!
    expect(L.flows.find((f) => f.includes(name.ord))).toEqual([name.ord])
  })
})

describe('eachBetweenPaired', () => {
  // (the walk of a unit made on A's glyphs for those B never printed between two it did: each looked for its paired neighbours by
  // walking its run back and forth, k² reads in a run of k; the sixth owner's finding after PR #620's, the class of its finding 1)
  const naive = (paired: boolean[]) => {
    const out: [number, number, number][] = []
    for (let i = 0; i < paired.length; i++) {
      if (paired[i]) continue
      const pv = paired.lastIndexOf(true, i)
      const nx = paired.indexOf(true, i)
      if (pv >= 0 && nx >= 0) out.push([i, pv, nx])
    }
    return out
  }
  const walk = (paired: boolean[], lo = 0, hi = paired.length - 1) => {
    let reads = 0
    const out: [number, number, number][] = []
    eachBetweenPaired(
      lo,
      hi,
      (i) => {
        reads++
        return paired[i] === true
      },
      (i, pv, nx) => out.push([i, pv, nx]),
    )
    return { out, reads }
  }
  it('gives each unpaired index between two paired ones with the two, none before the first or after the last', () => {
    const p = [false, true, false, false, true, true, false, true, false]
    expect(walk(p).out).toEqual([
      [2, 1, 4],
      [3, 1, 4],
      [6, 5, 7],
    ])
    expect(walk([false, false]).out).toEqual([])
    expect(walk([]).out).toEqual([])
    let seed = 7
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed / 2 ** 31
    }
    for (let t = 0; t < 200; t++) {
      const q = Array.from({ length: 1 + Math.floor(rnd() * 40) }, () => rnd() < 0.4)
      expect(walk(q).out).toEqual(naive(q))
    }
  })
  it('reads each index a bounded number of times: linear in a run of unpaired ones', () => {
    const k = 5000
    const p = [true, ...Array.from({ length: k }, () => false), true]
    const { out, reads } = walk(p)
    expect(out.length).toBe(k)
    expect(reads).toBeLessThan(3 * p.length)
  })
})

describe('a babel name’s text', () => {
  it('states a name’s own text on A (Placed.plain), so that S.names tells a target word the original’s already', () => {
    // (S.names leaves a name the original's where the target's word is its own text (today's nameInTarget over its characters);
    // the part stated its Word alone)
    const B = docOf([{ lines: ['Abstract', 'Body text here'] }])
    const units = [{ ...unitOf('name', 'Abstract'), name: 'abstract' }, unitOf('para', 'Body text here')]
    const ins = instrumentOf(B, units, [[0, 1]], [[ROLE.name, ROLE.text]])
    const L = locate(ins, B, align(B, B))
    expect(L.members.find((m) => m.kind === 'name')).toMatchObject({ name: 'abstract', plain: 'Abstract' })
    const objects = [
      ...bundle({
        ins,
        located: L,
        addOn: addOnOf(L, 1),
        original: new Uint8Array(10),
        paper: { id: '2501.00001', version: 1, pages: 1 },
        made: 'test',
      }),
    ]
    const o = objects.find((x) => x.kind === 'part')!
    const part = read('part', o.bytes, o.digest)
    expect(part.flows.flat().find((m) => m.kind === 'name')).toMatchObject({
      text: { name: 'abstract' },
      plain: 'Abstract',
    })
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

describe('locate: the room under a unit', () => {
  it('reads the next line under a unit across its last block, which spans both columns where its short last line does not', () => {
    // (a caption across the page whose last line keeps to the left column; under it the right column's text begins 14 pt
    // lower, the left column's 30 pt lower)
    const wide = 'w'.repeat(78)
    const B = docOf([
      {
        lines: [
          { text: wide, y: 700 },
          { text: wide, y: 688 },
          { text: 'short end', y: 676 },
          ...[662, 650, 638].map((y) => ({ text: 'right column text one', x: 320, y })),
          ...[646, 634, 622].map((y) => ({ text: 'left column text one', y })),
        ],
      },
    ])
    const units = [unitOf('caption', 'a caption'), unitOf('para', 'right'), unitOf('para', 'left')]
    const L = locate(instrumentOf(B, units, [[0, 0, 0, 1, 1, 1, 2, 2, 2]]), B, align(B, B))
    expect(L.members[0]!.lines.map((l) => l[1])).toEqual([2, 2, 0])
    expect(L.members[0]!.room.next).toBe(14)
    // (the room below is the whole block's, not its short last line's: a translation's lines span the block's measure, so a
    // line borrowed under it meets the right column's text 5 pt down, not the left column's 21 pt down: the checkpoint's free-11,
    // borrowed lines run into a display)
    expect(L.members[0]!.room.below).toBe(5)
  })
  it("reads no ink nothing of which is shown beside a unit or under it (the checkpoint's measure-9: a figure's clipped title)", () => {
    // (1706.03762v7 p13: "Attention Visualizations", and on its baseline's band to its right a figure's "Layer5", clipped out of
    // its form, nothing of it shown: Room.side stopped at it, the heading could not widen, and its translation was set at 70 %)
    const make = (unseen: boolean) => {
      const B = docOf([
        {
          lines: [
            { text: 'A heading', y: 700 },
            { text: 'Layer5', x: 140, y: 703, form: true },
            { text: 'hidden', x: 72, y: 690, form: true },
            { text: 'the body text', y: 650 },
          ],
        },
      ])
      if (unseen) for (const g of B.pages[0]!.glyphs) if (g.n === 1 || g.n === 2) g.unseen = true
      const units = [unitOf('heading', 'A heading'), unitOf('para', 'the body text')]
      return locate(instrumentOf(B, units, [[0, -1, -1, 1]]), B, align(B, B)).members[0]!.room
    }
    expect(make(false).side?.[1]).toBe(140)
    expect(make(false).below).toBe(1)
    expect(make(true).side?.[1]).not.toBe(140)
    expect(make(true).below).toBe(41)
  })
  it("ties at one size the units of one TeX paragraph a float cut in two, on the row they share (the checkpoint's free-9)", () => {
    // (2608.16117v1 p19: "… 8(d))." and "The increasing-" on one line, a figure set after it, "decreasing trend …" below: one
    // paragraph of TeX's the front end cut at the figure into two units, each fitted alone, the one at its size, the other shrunk;
    // one size for both. A paragraph end between them, or no row shared: no tie)
    const units = [
      unitOf('para', 'first part of it'),
      unitOf('caption', 'Figure 1: a caption'),
      unitOf('para', 'second part here'),
    ]
    const sizeTies = (second: { x: number; y: number }, ends: (n: (k: number) => number) => number[]) => {
      const B = docOf([
        {
          lines: [
            { text: 'first part of it', y: 700 },
            { text: 'Figure 1: a caption', y: 650 },
            { text: 'second part here', ...second },
          ],
        },
      ])
      const n = (k: number) => B.pages[0]!.glyphs.filter((g) => g.n < k).length
      const ins = { ...instrumentOf(B, units, [[0, 1, 2]]), tex: { paragraphEnds: [ends(n)] } }
      return locate(ins, B, align(B, B)).ties.filter((t) => t.rule === 'size')
    }
    // (the caption's own paragraph ends inside it, the second part's at its end)
    expect(sizeTies({ x: 172, y: 700 }, (n) => [n(2), n(3)])).toEqual([{ rule: 'size', ords: [0, 2] }])
    expect(sizeTies({ x: 172, y: 700 }, (n) => [n(1), n(2), n(3)])).toEqual([])
    expect(sizeTies({ x: 72, y: 638 }, (n) => [n(2), n(3)])).toEqual([])
  })
  it("holds the glyphs an element of no piece and a label cut from the text by them as A's ink, not the unit's text", () => {
    // (2610.37818v1 p14, the checkpoint's measure-4: the instrument gave sub-caption (b)'s unit the glyphs of sub-caption (a), which
    // has no unit, "(a)" as its label and "Dark rim band" as an element of no piece (today's u<id>.p with no placeholder's points
    // round them); read as the unit's text, its line ran over (a) and its text group erased (a)'s English with nothing drawn
    // there, its label crop "(a)" drawn before "(b)". They stay A's ink where they stand, as today's reader kept them)
    const B = docOf([
      {
        lines: [
          { text: '(a)', x: 100, y: 700 },
          { text: 'Dark rim band', x: 120, y: 700 },
          { text: '(b) Rim and edge', x: 300, y: 700 },
          { text: 'Figure 8: a caption under them', y: 680 },
        ],
      },
    ])
    const units = [unitOf('para', '(b) Rim and edge'), unitOf('caption', 'Figure 8: a caption under them')]
    const L = locate(
      instrumentOf(B, units, [[0, 0, 0, 1]], [[ROLE.label, ROLE.element, ROLE.text, ROLE.text]]),
      B,
      align(B, B),
    )
    const sub = L.members[0]!
    expect(sub.located).toBe(true)
    expect(sub.lines.map((l) => l[2])).toEqual([300])
    expect(sub.labelAt).toBeUndefined()
  })
  it("holds no float's glyphs as a line of a paragraph TeX set the float inside (L1's second held-line fault)", () => {
    // (2610.10492v1 ord 21: a float set between two lines of a paragraph, its glyphs no unit's, read as the paragraph's held
    // lines, KEPT; B's float brackets say they are the float's. A line the source does not write in the body stays held)
    const lines = ['para line one', 'Figure stuff', 'para line two']
    const B = docOf([{ lines: lines.map((text, i) => ({ text, x: i === 1 ? 80 : 72 })) }])
    const n = (k: number) => B.pages[0]!.glyphs.filter((g) => g.n < k).length
    const units = [unitOf('para', 'para line one para line two')]
    const keptOf = (points: [string, number][]) => {
      const d = docOf([{ lines: lines.map((text, i) => ({ text, x: i === 1 ? 80 : 72 })), points }])
      return locate(instrumentOf(d, units, [[0, -1, 0]]), d, align(d, d)).members[0]!.lines.filter((l) => l[9] & 1)
        .length
    }
    expect(
      keptOf([
        ['bs1', 0],
        ['be1', n(3)],
      ]),
    ).toBe(1)
    expect(
      keptOf([
        ['bs1', 0],
        ['fs1', n(1)],
        ['fe1', n(2)],
        ['be1', n(3)],
      ]),
    ).toBe(0)
  })
})

describe('review of #605', () => {
  const original = new Uint8Array(70000).map((_, i) => i & 255)
  it('places a unit of turned glyphs alone (a figure’s y-axis title) on its page, in that page’s part', () => {
    const withTurned = () => {
      const d = docOf([{ lines: ['a caption under it'] }])
      d.pages[0]!.turned = [...'Loss'].map(
        (u, j): DocTurned => ({
          u,
          code: u.codePointAt(0) as number,
          base: 'CMR10',
          n: 1,
          k: j,
          at: 18,
          box: -1,
          ox: 60,
          oy: 400 + 6 * j,
          ex: 60,
          ey: 406 + 6 * j,
          ux: 0,
          uy: 1,
          size: 10,
          ascent: 0.7,
          descent: -0.2,
          form: false,
        }),
      )
      return d
    }
    const B = withTurned()
    const A = withTurned()
    const units = [
      unitOf('caption', 'a caption under it'),
      unitOf('inkfigures', 'Loss', { figure: { set: 0, dir: [0, 1] } }),
    ]
    const ins: Instrument = {
      ...instrumentOf(B, units, [[0]]),
      turned: [
        { unit: Int32Array.from([1, 1, 1, 1]), role: Uint8Array.from([1, 1, 1, 1]), piece: new Int32Array(4).fill(-1) },
      ],
    }
    const L = locate(ins, A, align(B, A))
    expect(L.members[1]).toMatchObject({ located: true, pages: [1] })
    expect(L.members[1]!.lines).toHaveLength(1)
    expect(L.groups[0]!.turned).toEqual(['1.1.t', '1.1.t', '1.1.t', '1.1.t'])
    const addOn = {
      ...addOnOf(L, 1),
      groups: new Set([...L.groups[0]!.glyphs, ...L.groups[0]!.turned].filter((g): g is string => g !== null)),
    }
    expect(stateOf(L.members[1]!, addOn)).toMatchObject({ drawn: true })
    const objs = [
      ...bundle({ ins, located: L, addOn, original, paper: { id: '2501.00001', version: 1, pages: 1 }, made: 't' }),
    ]
    const part = objs.find((o) => o.kind === 'part') as Extract<(typeof objs)[number], { kind: 'part' }>
    expect(
      read('part', part.bytes)
        .flows.flat()
        .map((x) => x.ord),
    ).toEqual([0, 1])
  })
  it('lays no member one of whose images the wrap could not group (planOf’s lost)', () => {
    const B = docOf([{ lines: ['a unit with an image'] }])
    const L = locate(instrumentOf(B, [unitOf('para', 'a unit with an image')], [[0]]), B, align(B, B))
    const addOn = addOnOf(L, 1)
    expect(stateOf(L.members[0]!, addOn)).toMatchObject({ drawn: true })
    expect(stateOf(L.members[0]!, { ...addOn, lost: new Set(['0.1.e']) })).toEqual({
      why: 'unwrapped',
      drawn: false,
      fixed: 0,
    })
  })
  it('says a unit that owns an image and no glyph has no text: it stays the original’s, its image A’s ink in no group', () => {
    const B = docOf([{ lines: ['a paragraph'], boxes: [[11, -3, 72, 600, 172, 680]] }])
    const units = [unitOf('para', 'a paragraph'), unitOf('cell', 'x')]
    const ins = instrumentOf(B, units, [[0]])
    ins.boxes[0]!.unit[0] = 1
    ins.boxes[0]!.role[0] = ROLE.element
    const L = locate(ins, B, align(B, B))
    expect(L.members[1]).toMatchObject({ located: false, cause: 'no text' })
    expect(L.groups[0]!.boxes).toEqual([null])
  })
  it('reads a cell’s band between the table’s rules, no unit’s ink: an underscore TeX draws as a rule on a baseline', () => {
    // (1512.03385v1 p5's "conv2_x": OT1's \_ is a \vrule, the cell's own box on its baseline, read as the rule over it; and
    // 2610.21924v1 p21: the cells' of the rows above and below. The CJK cell's band shut at a baseline, its size cut, 5.80 for
    // 6.46: the entry against the runner's)
    const B = docOf([
      {
        lines: [
          { text: 'conv2x', y: 700 },
          { text: 'conv3x', y: 690 },
        ],
        boxes: [
          [0, 0, 60, 720, 300, 720.26],
          [5, 0, 102, 700, 104.2, 700.26],
          [11, 0, 102, 690, 104.2, 690.26],
          [12, 0, 60, 680, 300, 680.26],
        ],
      },
    ])
    const cell = (s: string, row: number) => unitOf('cell', s, { cell: { table: 0, row, col: 0 } })
    const ins = instrumentOf(B, [cell('conv2x', 0), cell('conv3x', 1)], [[0, 1]])
    ins.boxes[0]!.unit[1] = 0
    ins.boxes[0]!.role[1] = ROLE.text
    ins.boxes[0]!.unit[2] = 1
    ins.boxes[0]!.role[2] = ROLE.text
    const L = locate(ins, B, align(B, B))
    expect(L.members[0]!.room.band).toEqual([680.26, 720])
    expect(L.members[1]!.room.band).toEqual([680.26, 720])
  })
  it('gives a link to the member that owns most of the glyphs under it, and within it to the element that does', () => {
    // (two members on one line: x 72-90 and 96-150; a link over x 89-151 holds one glyph of the first and the second's nine)
    const B = docOf([
      {
        lines: [
          { text: 'see', x: 72 },
          { text: 'Figure 12', x: 96, y: 700 },
        ],
      },
    ])
    const units = [unitOf('para', 'see'), unitOf('para', 'Figure 12')]
    const link = { annotationType: 2, rect: [89, 695, 151, 708], dest: 'figure.12' }
    const L = locate(instrumentOf(B, units, [[0, 1]]), B, align(B, B), { annotations: [[link]] })
    expect(L.links.get(1)).toEqual([{ box: [89, 695, 151, 708], to: { dest: '"figure.12"' }, owner: [1, ''] }])
  })
})

describe('the element classes the part states', () => {
  it('states a text macro’s text from the unit’s glyphs between its two points, where none of them is the element’s', () => {
    // (1810.04805v2's \bert, set as "BERT": the instrument gives its glyphs to the unit's text, the element none, so the reading
    // drew nothing where today's draws the rendering it finds by it among the unit's characters; its two points on B (the
    // marked compile's p<unit>.<piece>a and b) say which they are)
    const B = docOf([{ lines: ['BERT is a model'] }])
    const content = [{ t: 'el' as const, id: '0', kind: 'other', src: '\\bert' }, text(' is a model')]
    const units: InstrumentUnit[] = [
      { id: unitId('para', content), kind: 'para', content, classes: [['0', { cls: 'umacro' }]] },
    ]
    const ins = {
      ...instrumentOf(B, units, [[0]]),
      places: [
        { unit: 0, piece: '0', page: 1, glyph: 0, end: false },
        { unit: 0, piece: '0', page: 1, glyph: 4, end: true },
      ],
    }
    const L = locate(ins, B, align(B, B))
    const mem = L.members.find((m) => m.unit === 0)!
    expect(mem.elements).toEqual([['0', { kind: 'other', ink: [], text: 'BERT', style: { role: 'serif', size: 10 } }]])
  })

  it('states a paper macro’s span empty where its two places hold no glyph, or where TeX said it sets none', () => {
    // (2610.19159v1's `Tool Output\trajectoryMark{}`: after the unit's end point, its point after the group it stands in, no glyph
    // between: TeX set none for it, El.text ''. A span with one side unstated says nothing; nor does a macro whose two places
    // hold a glyph that is not its own)
    const B = docOf([{ lines: ['Tool Output'] }])
    const content = [
      text('Tool Output'),
      { t: 'el' as const, id: '1', kind: 'macro', src: '\\trajectoryMark{}' },
      { t: 'el' as const, id: '2', kind: 'macro', src: '\\x' },
      { t: 'el' as const, id: '3', kind: 'macro', src: '\\y' },
      { t: 'el' as const, id: '4', kind: 'macro', src: '\\z' },
    ]
    const units: InstrumentUnit[] = [
      { id: unitId('para', content), kind: 'para', content, classes: [['1', { cls: 'umacro' }]] },
    ]
    const ins = {
      ...instrumentOf(B, units, [[0]]),
      places: [
        { unit: 0, piece: '1', page: 1, glyph: 10, end: false },
        { unit: 0, piece: '1', page: 1, glyph: 10, end: true },
        { unit: 0, piece: '2', page: 1, glyph: 10, end: false },
        { unit: 0, piece: '3', page: 1, glyph: 4, end: false },
        { unit: 0, piece: '3', page: 1, glyph: 6, end: true },
      ],
      empty: [{ unit: 0, piece: '4' }],
    }
    const L = locate(ins, B, align(B, B))
    const els = new Map(L.members.find((m) => m.unit === 0)!.elements)
    expect(els.get('1')).toMatchObject({ ink: [], text: '' })
    expect(els.get('2')!.text).toBeUndefined()
    expect(els.get('3')!.text).not.toBe('')
    expect(els.get('4')).toMatchObject({ ink: [], text: '' })
  })

  it('writes each element with its source’s class, copy text, a symbol’s drawing and a footnote’s mark (the instrument’s)', () => {
    const B = docOf([{ lines: ['see the result'] }])
    const content = [text('see '), { t: 'el' as const, id: '1', kind: 'cite', src: '\\cite{a}' }, text(' the result')]
    const units: InstrumentUnit[] = [
      {
        id: unitId('para', content),
        kind: 'para',
        content,
        classes: [['1', { cls: 'cite', copy: '[·]', sym: ['†', true], mark: true, unknown: true, literal: true }]],
      },
    ]
    const ins = instrumentOf(B, units, [[0]])
    const L = locate(ins, B, align(B, B))
    // (the element as locate made it, with the instrument's kind: the class replaces it in the part alone)
    const mem = L.members.find((m) => m.unit === 0)!
    mem.elements = [['1', { kind: 'cite', ink: [[1, 30, 700, 40, 708, 701]] }]]
    const objects = [
      ...bundle({
        ins,
        located: L,
        addOn: addOnOf(L, 1),
        original: new Uint8Array(10),
        paper: { id: '2501.00001', version: 1, pages: 1 },
        made: 't',
      }),
    ]
    const part = objects.find((o) => o.kind === 'part') as Extract<(typeof objects)[number], { kind: 'part' }>
    const els = read('part', part.bytes).flows.flat()[0]!.els
    expect(els).toEqual([
      [
        '1',
        {
          kind: 'cite',
          unknown: 1,
          copy: '[·]',
          sym: ['†', 1],
          mark: 1,
          literal: 1,
          ink: [[1, 30, 700, 40, 708, 701]],
        },
      ],
    ])
  })
})
