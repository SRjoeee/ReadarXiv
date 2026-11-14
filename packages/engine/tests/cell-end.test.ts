// A cell's piece ends where TeX ends its cell (docs/PDF-READER.md §18.74): an element's ink is what TeX set between its two
// points, and where TeX gives it no closing point, it ends where TeX ends what the element stands in, never later; for a piece of a
// table cell, that is the cell's end, the point `t<i>x` LAYOUT_TEX's template end sets (marks.ts \axt@te). The marked compile's
// stream as B ships a table's rows (each glyph 5 pt wide at 10 pt; no paper's text): a cell whose last piece stands after the cell's
// end mark with its opening point alone (its source ends in a control word, or its class may read ahead) is read by the marking's
// word for it (followsOf) and the stream's reading (ownedOf, the erasure's, as the ownership calls it). Before the cell's end was a
// point, its ink ran to the next unit's start: the row's other entries, the rules between the columns, the rules under the row (the
// three cells of round 3's E1: a `\checkmark` before a `\bottomrule`, a `\textsuperscript` before a row of numbers no unit is, a
// paper's macro ending a spanning header before two `\cmidrule`s)
import { describe, expect, it } from 'vitest'
import { type Glyph, packGlyphs } from '../src/ink.ts'
import { followsOf } from '../src/marks/marks.ts'
import { OWNED, OWNED_HOW, ownedOf, STREAM_COLUMNS, type StreamPage } from '../src/own/stream.ts'
import type { SourceUnit } from '../src/source/latex-front.ts'

type Item = string | { at: string } | { rule: [number, number, number, number] }
/** a page from items in stream order: a string is glyphs on the current line (a space 3 pt, `\t` a column's gap of 20 pt, `\n` the
 *  next row 12 pt down), `{ at }` a point, `{ rule }` a painted box */
function pageOf(items: readonly Item[]): StreamPage {
  const glyphs: Glyph[] = [],
    boxes: number[] = [],
    points: { name: string; glyph: number; box: number }[] = [],
    boxAt: number[] = []
  let x = 72,
    y = 700
  for (const it of items) {
    if (typeof it === 'string') {
      for (const u of it) {
        if (u === ' ') x += 3
        else if (u === '\t') x += 20
        else if (u === '\n') {
          x = 72
          y -= 12
        } else {
          glyphs.push({
            u,
            x0: x,
            x1: x + 5,
            y,
            top: y + 7,
            bottom: y - 2,
            size: 10,
            font: 'F',
            ix0: x,
            ix1: x + 5,
          } as Glyph)
          boxAt.push(boxes.length / 4)
          x += 5
        }
      }
    } else if ('at' in it) points.push({ name: it.at, glyph: glyphs.length, box: boxes.length / 4 })
    else boxes.push(...it.rule)
  }
  return {
    glyphs: packGlyphs(glyphs, { columns: STREAM_COLUMNS }),
    boxes,
    points,
    boxAt: Int32Array.from(boxAt),
    view: [0, 0, 612, 792],
  } as StreamPage
}
/** a unit of the source as the walk makes it (its pieces alone are read here) */
const unit = (kind: string, pieces: SourceUnit<null>['pieces']): SourceUnit<null> => ({
  file: null,
  kind,
  start: 0,
  end: 0,
  pieces,
})
const none = unit('para', [])
/** units by index: 1 a cell " flat, 4.5 \ok ", 2 the paragraph after the table, 3 a cell " Mod\textsuperscript{x} ", 4 the next
 *  row's first cell, 5 a spanning header's cell " A vs \B ", 6 the next row's first cell; the macros set one letter each (v, x, B) */
const UNITS = [
  none,
  unit('cell', [
    { t: 'text', s: ' flat, 4.5 ' },
    { t: 'ph', src: '\\ok' },
    { t: 'text', s: ' ' },
  ]),
  unit('para', [{ t: 'text', s: 'Next words' }]),
  unit('cell', [
    { t: 'text', s: ' Mod' },
    { t: 'ph', src: '\\textsuperscript{x}' },
    { t: 'text', s: ' ' },
  ]),
  unit('cell', [{ t: 'text', s: 'Base' }]),
  unit('cell', [
    { t: 'text', s: ' A vs ' },
    { t: 'ph', src: '\\B' },
    { t: 'text', s: ' ' },
  ]),
  unit('cell', [{ t: 'text', s: 'one' }]),
]
/** the three rows as B ships them; `end` the cell's end point, after the piece's ink, where the template's end sets it */
const ROWS = (end: boolean): [name: string, piece: string, items: Item[]][] => [
  // (a float's table, its last row: the cell, the row's `\\`, the table's bottom rule, the float's end, the paragraph after it)
  [
    'the last row: the rule under it',
    'p1.1a',
    [
      { at: 'bs1' },
      { at: 'fs1' },
      { at: 't1s' },
      'flat, 4.5',
      { at: 't1e' },
      { at: 'p1.1a' },
      'v',
      ...(end ? [{ at: 't1x' }] : []),
      { rule: [72, 690, 300, 690.8] },
      { at: 'fe1' },
      '\n\n',
      { at: '2s' },
      'Next words',
      { at: '2e' },
      { at: 'be1' },
    ],
  ],
  // (a row whose other cells are numbers no unit is, each column's rule between, then the next row's first cell)
  [
    'a row of entries no unit is: the other cells and the column rules',
    'p3.1a',
    [
      { at: 'bs1' },
      { at: 't3s' },
      'Mod',
      { at: 't3e' },
      { at: 'p3.1a' },
      'x',
      ...(end ? [{ at: 't3x' }] : []),
      { rule: [120, 698, 120.4, 708] },
      '\t1.0',
      { rule: [160, 698, 160.4, 708] },
      '\t2.0',
      '\n',
      { at: 't4s' },
      'Base',
      { at: 't4e' },
      ...(end ? [{ at: 't4x' }] : []),
      { at: 'be1' },
    ],
  ],
  // (a header spanning columns, the row's `\\`, two partial rules under it, one under columns it does not span)
  [
    'a spanning header: the partial rules under its row',
    'p5.1a',
    [
      { at: 'bs1' },
      { at: 't5s' },
      'A vs',
      { at: 't5e' },
      { at: 'p5.1a' },
      'B',
      ...(end ? [{ at: 't5x' }] : []),
      { rule: [72, 696, 100, 696.4] },
      { rule: [110, 696, 300, 696.4] },
      '\n',
      { at: 't6s' },
      'one',
      { at: 't6e' },
      ...(end ? [{ at: 't6x' }] : []),
      { at: 'be1' },
    ],
  ],
]
/** what a piece owns, as the marking and the stream read it: its glyphs as a string and its rule count, or its how */
function owns(items: readonly Item[], piece: string): [string, number] | string {
  const page = pageOf(items)
  const follows = followsOf(UNITS as never, new Set(page.points.map((p) => p.name)))
  const e = ownedOf([page], { follows, erasure: true }).get(piece)!
  return e.how < OWNED
    ? [e.glyphs.map(([, g]) => page.glyphs.u[g]).join(''), e.boxes.length]
    : (OWNED_HOW[e.how] as string)
}

describe("a cell's piece ends where TeX ends its cell", () => {
  it("owns what TeX set in its cell, its opening point alone after the cell's end mark (round 3's E1: the three rows)", () => {
    expect(ROWS(true).map(([, piece, items]) => owns(items, piece))).toEqual([
      ['v', 0],
      ['x', 0],
      ['B', 0],
    ])
  })

  it("the marking names the cell's end point among the ends of its cell's pieces, and of no other unit's", () => {
    const names = new Set(['t1s', 't1e', 'p1.1a', 't1x', '2s', '2e'])
    expect(followsOf(UNITS as never, names)('p1.1a')?.ends).toContain('t1x')
    const para = [
      none,
      unit('para', [
        { t: 'text', s: 'see ' },
        { t: 'ph', src: '\\ok' },
      ]),
    ]
    expect(followsOf(para as never, new Set(['1s', '1e', 'p1.1a']))('p1.1a')?.ends).not.toContain('t1x')
  })

  it("where TeX states no end of the cell (a table no template of LaTeX's sets: tblr, a plain \\halign), the reading is as before", () => {
    // (the other side: no point, so the piece's ink runs to its next mark, the next unit's start, as the reading had it)
    expect(ROWS(false).map(([, piece, items]) => owns(items, piece))).toEqual([
      ['v', 1],
      ['x1.02.0', 2],
      ['B', 2],
    ])
  })
})
