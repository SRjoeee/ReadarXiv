// The units no source unit is, made by locate on arXiv's page by today's rule (src/locate/ink.ts): ink units, kept blocks and
// figure texts from A's glyphs no source unit owns, B's marks carried onto A.
import { unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import type { Doc } from '../src/doc.ts'
import type { PageInk } from '../src/ink.types.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import { carry } from '../src/locate/ink.ts'
import { locate } from '../src/locate/locate.ts'
import { docOf, type PageSpec } from './helpers/doc.ts'

const text = (s: string) => ({ t: 'text' as const, s })
const unitOf = (kind: string, s: string): InstrumentUnit => {
  const content = [text(s)]
  return { id: unitId(kind, content), kind, content }
}
/** an instrument over B whose units own B's glyphs line by line (`own[p][line]`, -1 none) */
function instrumentOf(B: Doc, units: InstrumentUnit[], own: number[][]): Instrument {
  return {
    ink: B,
    units,
    glyphs: B.pages.map((pg, p) => {
      const O = ownersOf(pg.glyphs.length)
      pg.glyphs.forEach((g, j) => {
        O.unit[j] = own[p]?.[g.n] ?? -1
        O.role[j] = ROLE.text
      })
      return O
    }),
    boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
    tex: {},
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
  }
}
/** A's pages as pageInk would give them (read.ts `raw`): its glyphs, boxes and their kinds */
const rawOf = (doc: Doc): PageInk[] =>
  doc.pages.map(
    (pg) =>
      ({
        glyphs: pg.glyphs.map((g) => ({ ...g })),
        boxes: pg.boxes,
        paths: pg.kinds,
        boxAt: pg.boxAt,
        points: [],
        paras: [],
        paraEnds: [],
        regions: [],
        turned: [],
        pictures: [],
        shapes: new Map(),
        figures: new Map(),
        unseen: new Set(),
        cut: new Map(),
        capped: false,
        timedOut: false,
        degraded: false,
        mergedAt: null,
        rotated: false,
      }) as unknown as PageInk,
  )
/** B and A of one page spec: B with the marks' points, A (arXiv's) with none */
function pair(spec: PageSpec): { B: Doc; A: Doc } {
  const { points: _, ...plain } = spec
  return { B: docOf([spec]), A: docOf([plain]) }
}

describe('locate: the units no source unit is, made on A by today’s rule', () => {
  it('makes a running head an ink unit of today’s id, its glyphs its own group', () => {
    // (the head shipped before the page's first mark, outside the column's body: today's ledger's `heads`)
    const { B, A } = pair({
      lines: ['Running Title', 'Body text here'],
      points: [
        ['bs1', 13],
        ['be1', 27],
      ],
    })
    const ins = instrumentOf(B, [unitOf('para', 'Body text here')], [[-1, 0]])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const content = [text('Running Title')]
    expect(L.units.at(-1)).toEqual({ id: unitId('inkheads', content), kind: 'inkheads', content })
    const head = L.members.find((m) => m.kind === 'inkheads')!
    expect(head).toMatchObject({ located: true, unit: 1, place: 'same', fixed: false })
    expect(head.text).toEqual([0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12])
    expect(L.groups[0]!.glyphs[0]).toBe(`${head.ord}.1.t`)
    expect(L.born.size).toBe(0)
    expect(L.stats.made).toMatchObject({ ink: 1, kept: 0, figures: 0 })
  })

  it('makes a contents line an ink unit of its title alone, justified as today’s file sets a list', () => {
    // (the list's babel name ends before it: the contents' zone; its number, leaders and page number the original's ink)
    const { B, A } = pair({
      lines: ['1 Introduction . . . 3', 'Body text'],
      points: [
        ['bs1', 0],
        ['n0.contents.e', 0],
        ['be1', 31],
      ],
    })
    const ins = instrumentOf(B, [unitOf('para', 'Body text')], [[-1, 0]])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const content = [text('Introduction')]
    expect(L.units[1]).toEqual({ id: unitId('inkcontents', content), kind: 'inkcontents', content, align: 'j' })
    const entry = L.members.find((m) => m.kind === 'inkcontents')!
    expect(entry.text).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    // (what it leaves, the number, the leaders and the page number, is a kept block's or no unit's: never the entry's group)
    expect(L.groups[0]!.glyphs[0]).not.toBe(`${entry.ord}.1.t`)
    expect(L.groups[0]!.glyphs[21]).not.toBe(`${entry.ord}.1.t`)
  })

  it('makes a figure’s text inside its form a figure text, where only A draws it', () => {
    const B = docOf([{ lines: ['a paragraph whose word', 'continues on its last line'] }])
    const ins = instrumentOf(B, [unitOf('para', 'a paragraph whose word continues on its last line')], [[0, 0]])
    const A = docOf([
      {
        lines: [
          'a paragraph whose word',
          { text: 'Loss', y: 640, form: true },
          { text: 'continues on its last line', y: 600 },
        ],
      },
    ])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const content = [text('Loss')]
    expect(L.units[1]).toEqual({ id: unitId('inkfigures', content), kind: 'inkfigures', content, figure: { set: 0 } })
    const fig = L.members[1]!
    expect(fig).toMatchObject({ located: true, figure: true, fixed: false })
    const at = 'a paragraph whose word'.length
    expect(fig.text).toEqual([at, at + 1, at + 2, at + 3])
    expect(L.figureGroups.has(`${fig.ord}.1.t`)).toBe(true)
    // (today's rule makes it: no unit is born of it)
    expect(L.born.size).toBe(0)
    expect(L.members[0]).toMatchObject({ located: true })
  })

  it('echoes a heading a contents line repeats: the heading’s pieces, its index the echo', () => {
    const { B, A } = pair({
      lines: ['1 Method . . . 2', { text: 'Method', y: 600 }],
      points: [
        ['bs1', 0],
        ['n0.contents.e', 0],
        ['0s', 16],
        ['be1', 22],
      ],
    })
    const heading = unitOf('heading', 'Method')
    const ins = instrumentOf(B, [heading], [[-1, 0]])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    expect(L.units[1]).toMatchObject({ id: unitId('inkcontents', heading.content), content: heading.content, echo: 0 })
  })
})

describe('carry: B’s marks onto A’s stream', () => {
  it('stands a point before its glyph’s partner on A, A’s own glyphs before it counted', () => {
    const B = docOf([{ lines: ['abc def'], points: [['q1', 4]] }])
    const A = docOf([{ lines: ['xyz abc def'] }])
    B.pages[0]!.marks = { paras: [{ name: 'q1', glyph: 4, box: 0 }], paraEnds: [], regions: [], pictures: [] }
    const m = align(B, A)
    const pageA = new Int32Array(A.pages[0]!.glyphs.length).fill(1)
    const [c] = carry(B, A, m, pageA)
    expect(c!.points).toEqual([{ name: 'q1', glyph: 8, box: 0 }])
    expect(c!.paras).toEqual([{ name: 'q1', glyph: 8, box: 0 }])
  })
})
