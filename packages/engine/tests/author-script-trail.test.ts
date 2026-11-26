// @vitest-environment node
// The marks a class sets after an author's name are the name's trail (trails.ts), read on the name's line. REVTeX's
// `superscriptaddress` line, `Ann Lee,¹,* Bob Ray,¹,²,³ and Cy Day⁴`: the class sets the comma after each name, the
// affiliation marks raised and small after it, and "and" before the last name; only the names are the source's units.
// Two readings left the marks behind. (1) The name's line was the ink of its LAST GLYPH alone: a comma's ink stands at the
// baseline, so a mark TeX raised right after it was off that "line", and stayed where TeX set it, fencing the next name's join
// (the row was not laid as one run: a blank before the last name). (2) A run of marks past a thin space was cut back to its glued
// part where a word followed it ("and"): "2,3" went with "and" into one text sent to the translator. Content of our own, B read
// as A (no shift).
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
const author = (name: string): InstrumentUnit => {
  const content: Piece[] = [{ t: 'text', s: name }]
  return { id: unitId('author', content), kind: 'author', content }
}
const trailOf = (L: ReturnType<typeof locate>, u: number) =>
  L.members
    .find((m) => m.unit === u)!
    .elements.filter(([k]) => k === '~')
    .map(([, e]) => e.copy)
/** a comma's ink: at the baseline, below a raised mark's (docOf draws every glyph as tall as a letter) */
function lowComma(B: Doc, glyphs: number[]): void {
  for (const k of glyphs) {
    const g = B.pages[0]!.glyphs[k]!
    expect(g.u).toBe(',')
    Object.assign(g, { top: g.y + 1.4, bottom: g.y - 2 })
  }
}

describe('the marks a class sets after an author’s name, a comma before them', () => {
  // (one line at 10 pt; the marks 7 pt raised 3.6; a thin space (1.2 pt, past a word's gap at 7 pt) between two marks)
  const B = docOf([
    {
      lines: [
        { text: 'Ann Lee,', x: 72, y: 700 },
        { text: '1,*', x: 120, y: 703.6, size: 7 },
        { text: 'Bob Ray,', x: 136.2, y: 700 },
        { text: '1,', x: 184.2, y: 703.6, size: 7 },
        { text: '2,3', x: 193.8, y: 703.6, size: 7 },
        { text: 'and', x: 210.3, y: 700 },
        { text: 'Cy Day', x: 231.6, y: 700 },
        { text: '4', x: 267.6, y: 703.6, size: 7 },
      ],
      points: [
        ['0s', 0],
        ['0e', 8],
        ['1s', 11],
        ['1e', 19],
        ['2s', 27],
        ['2e', 33],
      ],
    },
  ])
  lowComma(B, [7, 18])
  const units = [author('Ann Lee,'), author('Bob Ray,'), author('Cy Day')]
  const L = locate(instrumentOf(B, units, [[0, -1, 1, -1, -1, -1, 2, -1]]), B, align(B, B))

  it('reads the name’s line as its own glyphs on its last baseline, not its comma’s ink: the marks after it its trail', () => {
    expect(trailOf(L, 0)).toEqual(['1,*'])
  })
  it('keeps a run of marks whole past a thin space inside it, where a word follows the run: the word alone is left', () => {
    expect(trailOf(L, 1)).toEqual(['1,2,3'])
    expect(trailOf(L, 2)).toEqual(['4'])
  })
})

describe('what TeX set after a name at the line’s text size on its baseline', () => {
  it('stays no trail where a word follows it past the gap (acmart’s reference format: "Ru Huang. 2027. ABNAT")', () => {
    const B = docOf([
      {
        lines: [
          { text: 'Ru Huang.', x: 72, y: 700 },
          { text: '2027. ABNAT', x: 72 + 9 * 6 + 2, y: 700 },
        ],
        points: [
          ['0s', 0],
          ['0e', 9],
        ],
      },
    ])
    const L = locate(instrumentOf(B, [author('Ru Huang.')], [[0, -1]]), B, align(B, B))
    expect(trailOf(L, 0)).toEqual([])
  })
  it('keeps a mark at the line’s size but raised, or small on the baseline, no script: cut back before the word as before', () => {
    // (a figure past the gap at the text's size raised (a capital's raised box), and one small on the baseline (a small
    // capital's): neither is a script (smaller AND off the baseline), so the word after them cuts the run back to its glued part)
    for (const [size, y] of [
      [10, 703.6],
      [7, 700],
    ] as const) {
      const B = docOf([
        {
          lines: [
            { text: 'Ann Lee', x: 72, y: 700 },
            { text: '1', x: 72 + 7 * 6 + 3.6, y, size },
            { text: 'and', x: 72 + 7 * 6 + 3.6 + 0.6 * size + 3.6, y: 700 },
            { text: 'Bob Ray', x: 72 + 7 * 6 + 3.6 + 0.6 * size + 3.6 + 18 + 3.6, y: 700 },
          ],
          points: [
            ['0s', 0],
            ['0e', 7],
            ['1s', 11],
            ['1e', 18],
          ],
        },
      ])
      const L = locate(instrumentOf(B, [author('Ann Lee'), author('Bob Ray')], [[0, -1, -1, 1]]), B, align(B, B))
      expect(trailOf(L, 0), `size ${size} at ${y}`).toEqual([])
    }
  })
})
