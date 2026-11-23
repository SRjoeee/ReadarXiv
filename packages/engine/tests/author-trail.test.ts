// @vitest-environment node
// An author's name followed by a mark of the class's command, `Ann Lee\inst{1} \and Bob Ray\inst{2}` (llncs): the unit's content
// is the name and the element `\inst{…}`, but its end mark is written after the last text (patch: `\axtend{<i>e}\inst{1}`), so
// TeX sets the mark's ink after the unit's end point, no unit's on B. Locate claims that ink as the member's trail (trails.ts:
// what TeX set on the author's line after it, element `~`), and the element `\inst` itself states no ink and no text: the reader's
// typesetter, which cannot tell an element that set nothing from one whose ink was not found, refuses the member `unproven`
// (packages/typeset unit/elements.ts crops) and every name of the block is drawn in the original, whatever the translator gave.
// One ink TeX set for one piece of the source: the element's, drawn where the translation puts it, nothing of it drawn twice.
// Content of our own, B read as A (no shift).
import { type Piece, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import type { Doc } from '../src/doc.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import { docOf } from './helpers/doc.ts'
import { locate } from './helpers/locate.ts'

/** an instrument over B whose units own B's glyphs line by line: `own[p][line]` the unit of that line (-1 none) */
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
/** an author unit: its name, then the class's mark command after it */
const author = (name: string, mark: string): InstrumentUnit => {
  const content: Piece[] = [
    { t: 'text', s: name },
    { t: 'el', id: '1', kind: 'other', src: `\\inst{${mark}}` },
  ]
  return {
    id: unitId('author', content),
    kind: 'author',
    content,
    classes: [['1', { cls: 'other', copy: mark, cmd: 'inst' }]],
  }
}

describe('the mark a class sets after an author’s name, past the unit’s end point', () => {
  // (the name's line at 10 pt; each mark raised as a script at 7 pt right after its name; the second author after the call)
  const B = docOf([
    {
      lines: [
        { text: 'Ann Lee', x: 72, y: 700 },
        { text: '1', x: 72 + 7 * 6, y: 703.6, size: 7 },
        { text: 'Bob Ray', x: 72 + 7 * 6 + 4.2 + 6, y: 700 },
        { text: '2', x: 72 + 7 * 6 + 4.2 + 6 + 7 * 6, y: 703.6, size: 7 },
      ],
      // (TeX's points: each name's start and end, the second author's call before its \and)
      points: [
        ['0s', 0],
        ['0e', 7],
        ['1c', 8],
        ['1s', 8],
        ['1e', 15],
      ],
    },
  ])
  const units = [author('Ann Lee', '1'), author('Bob Ray', '2')]
  const L = locate(instrumentOf(B, units, [[0, -1, 1, -1]]), B, align(B, B))

  it('is the element’s own ink, the one the source names after the name: stated, so that the member can be laid', () => {
    for (const [u, mark] of [
      [0, '1'],
      [1, '2'],
    ] as const) {
      const els = new Map(L.members.find((m) => m.unit === u)!.elements)
      const el = els.get('1')
      expect(el, `unit ${u}`).toBeDefined()
      // (its ink the mark's glyph TeX set after the name, or a text stated for it: never neither)
      expect(
        el!.ink.length > 0 || el!.text !== undefined,
        `unit ${u}: the element \\inst{${mark}} states no ink and no text`,
      ).toBe(true)
    }
  })
  it('is drawn once: no trail beside the element that holds it', () => {
    for (const u of [0, 1]) {
      const els = L.members.find((m) => m.unit === u)!.elements
      const ink = els.filter(([k, e]) => k !== '~' && e.ink.length).length + els.filter(([k]) => k === '~').length
      expect(ink, `unit ${u}: the mark's ink held ${ink} times`).toBe(1)
    }
  })
})

/** an author unit: its name, then the pieces its source writes after it, each `[src, class, copy]` (ids 1, 2, …) */
const authorWith = (name: string, after: [src: string, cls: string, copy: string][]): InstrumentUnit => {
  const content: Piece[] = [
    { t: 'text', s: name },
    ...after.map(([src], k): Piece => ({ t: 'el', id: String(k + 1), kind: 'other', src })),
  ]
  return {
    id: unitId('author', content),
    kind: 'author',
    content,
    classes: after.map(([src, cls, copy], k) => [String(k + 1), { cls, copy, cmd: src.slice(1).replace(/\{.*$/, '') }]),
  }
}
const elementsOf = (L: ReturnType<typeof locate>, u: number) => new Map(L.members.find((m) => m.unit === u)!.elements)

describe('the run TeX set after an author’s name for several pieces, no point between them', () => {
  // (`Ann Lee\inst{1}\orcidID{0000}` as llncs sets it: the institute's number and the ORCID's text one run past the end point)
  const B = docOf([
    {
      lines: [
        { text: 'Ann Lee', x: 72, y: 700 },
        { text: '1[0000]', x: 72 + 7 * 6, y: 703.6, size: 7 },
      ],
      points: [
        ['0s', 0],
        ['0e', 7],
      ],
    },
  ])
  const units = [
    authorWith('Ann Lee', [
      ['\\inst{1}', 'other', '1'],
      ['\\orcidID{0000}', 'other', '0000'],
    ]),
  ]
  const L = locate(instrumentOf(B, units, [[0, -1]]), B, align(B, B))
  const els = elementsOf(L, 0)

  it('is the first piece’s ink, the whole run in TeX’s order', () => {
    const first = els.get('1')!
    expect(first.ink.length, 'the first piece holds the run').toBe(1)
    const [, x0, , x1] = first.ink[0]!
    expect([x0, x1]).toEqual([72 + 7 * 6, 72 + 7 * 6 + 7 * 0.6 * 7])
  })
  it('states every other piece of it empty, so that the run is drawn once and the member is laid', () => {
    const second = els.get('2')!
    expect(second.ink).toEqual([])
    expect(second.text).toBe('')
    expect(els.has('~'), 'no trail beside the pieces').toBe(false)
  })
})

describe('a trail that is no piece’s', () => {
  it('stays the member’s trail where the source writes no piece after the name (a class’s own mark)', () => {
    const B = docOf([
      {
        lines: [
          { text: 'Ann Lee', x: 72, y: 700 },
          { text: '*', x: 72 + 7 * 6, y: 703.6, size: 7 },
        ],
        points: [
          ['0s', 0],
          ['0e', 7],
        ],
      },
    ])
    const L = locate(instrumentOf(B, [authorWith('Ann Lee', [])], [[0, -1]]), B, align(B, B))
    const els = elementsOf(L, 0)
    expect(els.get('~')?.ink.length).toBe(1)
  })
  it('stays the trail where the piece after the name owns its own ink: what TeX set past it is no piece’s', () => {
    // (`Ann Lee\textsuperscript{1}` with its own points: the mark the class sets after it, past the end point, a trail)
    const B = docOf([
      {
        lines: [
          { text: 'Ann Lee', x: 72, y: 700 },
          { text: '1', x: 72 + 7 * 6, y: 703.6, size: 7 },
          { text: '*', x: 72 + 7 * 6 + 4.2, y: 703.6, size: 7 },
        ],
        points: [
          ['0s', 0],
          ['p0.1a', 7],
          ['p0.1b', 8],
          ['0e', 8],
        ],
      },
    ])
    const units = [authorWith('Ann Lee', [['\\textsuperscript{1}', 'other', '1']])]
    // (the piece's glyph its own, ROLE.ph and its piece by the instrument)
    const ins = instrumentOf(B, units, [[0, 0, -1]])
    ins.glyphs[0]!.role[7] = ROLE.element
    ins.glyphs[0]!.piece[7] = 1
    const L = locate(ins, B, align(B, B))
    const els = elementsOf(L, 0)
    expect(els.get('1')?.ink.length, 'the piece’s own glyph').toBe(1)
    expect(els.get('~')?.ink.length, 'the class’s mark after it, a trail').toBe(1)
  })
})

describe('the run holds what TeX painted in it, a box too', () => {
  it('gives an icon the piece after the name draws, no glyph, to the run, with the mark TeX set after it', () => {
    // (`Ann Lee\orcidlink{0000}` and a class's mark after it, REVTeX's affiliation number: the icon a box TeX painted after the
    // name, then "2" past it. The run is the piece's ink, the icon in it, drawn once where the translation sets the piece; left
    // out, the icon stood where TeX set it beside a translation drawn without it)
    const B = docOf([
      {
        lines: [
          { text: 'Ann Lee', x: 72, y: 700 },
          { text: '2', x: 72 + 7 * 6 + 8, y: 703.6, size: 7 },
        ],
        boxes: [[7, 0, 72 + 7 * 6 + 1, 699, 72 + 7 * 6 + 7, 705]],
        points: [
          ['0s', 0],
          ['0e', 7],
        ],
      },
    ])
    const units = [authorWith('Ann Lee', [['\\orcidlink{0000}', 'other', '']])]
    const L = locate(instrumentOf(B, units, [[0, -1]]), B, align(B, B))
    const mem = L.members.find((m) => m.unit === 0)!
    expect(mem.elBoxes.get('1'), 'the icon listed as the piece’s').toEqual([[1, 0]])
    const el = new Map(mem.elements).get('1')!
    expect(el.ink.length).toBe(1)
    const [, x0, , x1] = el.ink[0]!
    expect([x0, x1], 'one box over the icon and the mark').toEqual([72 + 7 * 6 + 1, 72 + 7 * 6 + 8 + 0.6 * 7])
    expect(L.groups[0]!.boxes[0], 'the icon in the piece’s group').toBe(`${mem.ord}.1.e`)
  })
})
