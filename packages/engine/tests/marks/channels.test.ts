// The marked compile's log channels (src/marks/channels.ts), which the front half's adapter reads (src/pdf-reader/engine/
// pipeline/instrument.mjs): each unit's alignment (AXT-ALIGN), each page's text frame (AXT-BODY at its body's opening point)
// and each unit's paragraph skips (AXT-LINES).
import { describe, expect, it } from 'vitest'
import { boxedAlignOf, framesOf, readAlign, readBodies, readBoxAlign, readSkips } from '../../src/marks/channels.ts'

describe('readAlign: each unit’s alignment as TeX stated it at its end mark', () => {
  it('reads each unit’s alignment as its end mark states it, the first paragraph’s of one TeX set in two', () => {
    const log = [
      'AXT-ALIGN 3 p 1 0.0pt 1 0.0pt 0 0.0pt',
      'AXT-ALIGN 4 p 0 0.0pt 0 0.0pt 1 0.0pt',
      'AXT-ALIGN 5 p 0 0.0pt 0 0.0pt 1 0.0pt',
      'AXT-ALIGN 5 p 0 0.0pt 1 0.0pt 0 0.0pt',
    ].join('\n')
    expect([...readAlign(log)]).toEqual([
      [3, 'c'],
      [4, 'j'],
      [5, 'j'],
    ])
    // (2608.25210v2's title, unit 0 set as heading 0: centred at \maketitle, then set ragged right again in VLDB's reference
    // format block from the same \@title; its own the first, never dropped for the copy)
    const vldb =
      'AXT-ALIGN h0 p 1 1.0pt 1 1.0pt 0 0.0pt\nAXT-ALIGN 2 p 0 0.0pt 0 0.0pt 1 1.0pt\nAXT-ALIGN h0 p 0 0.0pt 1 1.0pt 1 1.0pt'
    expect(readAlign(vldb).get(0)).toBe('c')
    // (set as a paragraph then in an \hbox: none, the box's tells nothing)
    expect(readAlign('AXT-ALIGN 4 p 1 1.0pt 1 1.0pt 0 0.0pt\nAXT-ALIGN 4 h 0 0.0pt 0 0.0pt 1 1.0pt').has(4)).toBe(false)
  })

  it('reads a cell’s alignment from the class LaTeX built its column’s template from (AXT-CELL), its own paragraph’s first', () => {
    const log = [
      // (2602.23285v2 p7's "Acc", t61: a braced text in a siunitx S column, which is array's c; its \hbox's skips tell nothing)
      'AXT-ALIGN t61 h 0 0.0pt 0 0.0pt 1 1.0pt',
      'AXT-CELL 61 0',
      // (\multicolumn{3}{c}{\textbf{TUSZ}}: the multicolumn's own spec)
      'AXT-CELL 59 0',
      'AXT-CELL 70 1',
      'AXT-CELL 71 2',
      // (a p column: the class says nothing of its lines, its paragraph does: >{\centering}p{3cm} centred, a bare p justified)
      'AXT-ALIGN t72 p 1 1.0pt 1 1.0pt 0 0.0pt',
      'AXT-CELL 72 4',
      'AXT-ALIGN t73 p 0 0.0pt 0 0.0pt 1 1.0pt',
      'AXT-CELL 73 4',
      'AXT-CELL 74 3',
      'AXT-CELL 75 5',
      // (a \parbox{2cm}{\raggedright …} in a c column: its lines are the parbox's paragraph's)
      'AXT-ALIGN t76 p 0 0.0pt 1 1.0pt 1 1.0pt',
      'AXT-CELL 76 0',
      // (tabularx sets its table once for each trial width and once more: the cell's first)
      'AXT-CELL 77 0',
      'AXT-CELL 77 0',
      'AXT-CELL 77 0',
    ].join('\n')
    expect(Object.fromEntries(readAlign(log))).toEqual({
      59: 'c',
      61: 'c',
      70: 'l',
      71: 'r',
      72: 'c',
      73: 'j',
      76: 'l',
      77: 'c',
    })
    // (a unit's own end mark beside: a cell's paragraph is read as any unit's, by its index)
    expect(readAlign('AXT-ALIGN 3 p 1 1.0pt 1 1.0pt 0 0.0pt\nAXT-ALIGN t4 p 0 0.0pt 1 1.0pt 1 1.0pt').get(4)).toBe('l')
    // (a line not of the form, a class TeX has no letter of: none)
    expect(readAlign('AXT-CELL 80 6\nAXT-CELL 81\nAXT-CELL x 0').size).toBe(0)
    // (an author block's unit, no cell's, the one unit of its cell's line (1706.03762v7's names and places, each a row of
    // NeurIPS's tabular[t]{c}): its \hbox's skips tell nothing, its cell's class does; a name set again as a paragraph
    // (acmart's reference format) its paragraph's)
    expect(
      Object.fromEntries(
        readAlign(
          'AXT-ALIGN 176 h 1 1.0pt 1 1.0pt 0 0.0pt\nAXT-CELL 176 0\nAXT-ALIGN 4 h 1 1.0pt 1 1.0pt 0 0.0pt\nAXT-CELL 4 0\nAXT-ALIGN 4 p 0 0.0pt 0 0.0pt 1 1.0pt',
        ),
      ),
    ).toEqual({ 4: 'j', 176: 'c' })
  })
})

describe('a unit TeX set in a box inside a paragraph: its line’s alignment as the skips in force and the paragraph’s end state it', () => {
  // (2611.03953v2 p1, ICML 2026: \icmlauthor sets each name in \mbox{\bf #1} inside its author list's center environment, so
  // its end mark's record is an \hbox's (`h`), which readAlign takes for nothing: the skips in force are the paragraph's, both
  // stretching (1fil), and the paragraph TeX ends after the last name states `qe3c`, centred; the names were laid justified)
  const icml = [
    'AXT-ALIGN h0 p 1 1.0pt 1 1.0pt 0 0.0pt',
    'AXT-ALIGN 1 h 1 1.0pt 1 1.0pt 0 0.0pt',
    'AXT-ALIGN 2 h 1 1.0pt 1 1.0pt 0 0.0pt',
  ].join('\n')
  it('reads the skips in force at a unit’s end mark where its every record is an \\hbox’s, and a stretch on a side alone', () => {
    expect(readAlign(icml).has(1)).toBe(false)
    expect(Object.fromEntries(readBoxAlign(icml))).toEqual({ 1: 'c', 2: 'c' })
    // (an \hbox in a justified paragraph, its skips none: nothing stated; a unit set as a paragraph anywhere: its paragraph's,
    // readAlign's; flush left and right read as a paragraph's skips are)
    expect(readBoxAlign('AXT-ALIGN 3 h 0 0.0pt 0 0.0pt 1 1.0pt').size).toBe(0)
    expect(readBoxAlign('AXT-ALIGN 4 h 1 1.0pt 1 1.0pt 0 0.0pt\nAXT-ALIGN 4 p 0 0.0pt 0 0.0pt 1 1.0pt').size).toBe(0)
    expect(
      Object.fromEntries(readBoxAlign('AXT-ALIGN 5 h 0 0.0pt 1 1.0pt 1 1.0pt\nAXT-ALIGN 6 h 1 1.0pt 0 0.0pt 1 1.0pt')),
    ).toEqual({ 5: 'l', 6: 'r' })
    // (two boxes of the unit under two skips: none; a box in a table's cell, AXT-CELL, the cell's line and no paragraph's: none,
    // 1706.03762v7's names in \author's tabular, which readAlign reads by their column's class)
    expect(readBoxAlign('AXT-ALIGN 7 h 1 1.0pt 1 1.0pt 0 0.0pt\nAXT-ALIGN 7 h 0 0.0pt 1 1.0pt 1 1.0pt').size).toBe(0)
    expect(readBoxAlign('AXT-ALIGN 176 h 1 1.0pt 1 1.0pt 0 0.0pt\nAXT-CELL 176 0').size).toBe(0)
  })
  it('takes it where the paragraph the box stands in ends with the same alignment, nothing between but the units’ marks', () => {
    // (B's page as the stream holds it: each name's start and end marks, its marks' glyphs between, then the paragraph's end
    // `qe3c` past the last name's, before the body's bracket)
    const page = {
      points: [
        { name: 'h0e', glyph: 72 },
        { name: '1s', glyph: 72 },
        { name: '1e', glyph: 81 },
        { name: '2s', glyph: 83 },
        { name: '2e', glyph: 93 },
        { name: 'bs2', glyph: 176 },
      ],
      paras: [{ name: 'q9', glyph: 1107 }],
      paraEnds: [{ name: 'qe3c', glyph: 176, point: 5 }],
    }
    expect(Object.fromEntries(boxedAlignOf(readBoxAlign(icml), [page]))).toEqual({ 1: 'c', 2: 'c' })
    // (the paragraph's end another alignment: none; a body's or a float's bracket, a paragraph begun, or a cell's mark between
    // the unit's end and it: the box is no line of that paragraph's, none)
    const at = (o: object) => Object.fromEntries(boxedAlignOf(readBoxAlign(icml), [{ ...page, ...o }]))
    expect(at({ paraEnds: [{ name: 'qe3j', glyph: 176, point: 5 }] })).toEqual({})
    expect(at({ paraEnds: [{ name: 'qe3c', glyph: 176, point: 6 }] })).toEqual({})
    expect(at({ paras: [{ name: 'q4', glyph: 100 }] })).toEqual({})
    expect(
      at({
        points: [...page.points.slice(0, 5), { name: 't9e', glyph: 95 }, page.points[5]!],
        paraEnds: [{ name: 'qe3c', glyph: 176, point: 6 }],
      }),
    ).toEqual({})
    // (no paragraph's end on the unit's page: none)
    expect(at({ paraEnds: [] })).toEqual({})
  })
})

describe('framesOf: each page’s text frame as TeX shipped it (LAYOUT_TEX’s AXT-BODY at each body’s opening point)', () => {
  // (what pdfLaTeX, XeLaTeX, LuaLaTeX and latex + dvipdfmx each wrote for article's twocolumn on letter paper, a \twocolumn
  // title, then \onecolumn: a left column at 1 in, a right one at 311.77 pt, \columnwidth 229.5 pt, \textwidth 469 pt)
  const log = [
    'AXT-BODY 1 1 229.5pt 469.0pt 4736286',
    'AXT-BODY 2 2 229.5pt 469.0pt 20432158',
    '[1]',
    'AXT-BODY 3 2 229.5pt 469.0pt 20432158',
    '[2]',
    'AXT-BODY 7 0 469.0pt 469.0pt 4736286',
  ].join('\n')
  const pts = (...names: string[]) => ({ points: names.map((name) => ({ name })) })
  const bp = (pt: number) => Math.round(((pt * 72) / 72.27) * 100) / 100
  it('reads each statement in PDF units, the first of a serial; a line not of its form tells nothing', () => {
    const b = readBodies(`${log}\nAXT-BODY 1 1 1.0pt 1.0pt 1\nAXT-BODY 9 1 229.5pt 469.0pt \nAXT-BODY 10 3 1pt 2pt 3`)
    expect([...b.keys()]).toEqual([1, 2, 3, 7])
    expect(b.get(1)!.side).toBe(1)
    expect(b.get(1)!.x).toBeCloseTo(72, 4)
    expect(b.get(2)!.x).toBeCloseTo((20432158 / 65536) * (72 / 72.27), 6)
  })
  it('gives a two-column page its block and both columns, from a left column’s body or a right one’s alone', () => {
    const two = {
      block: [72, bp(72.27 + 469)],
      columns: [
        [72, bp(72.27 + 229.5)],
        [bp(311.77), bp(72.27 + 469)],
      ],
    }
    const f = framesOf([pts('c2-1', 'bs1', 'bs2'), pts('c2-2', 'bs3'), pts('c1-3', 'bs7'), pts('c1-4')], log)
    expect(f[0]).toEqual(two)
    // (page 2: its left column void, its right column's body tells the block, \textwidth less \columnwidth before it)
    expect(f[1]).toEqual(two)
    expect(f[2]).toEqual({ block: [72, bp(72.27 + 469)], columns: [[72, bp(72.27 + 469)]] })
    // (a page no stated body stands on: none)
    expect(f[3]).toBeNull()
  })
  it('splits a text block its class ships whole where TeX set the page in two columns, and states none it cannot split', () => {
    // (revtex's ltxgrid: no column made by \@makecol, the page's text block bracketed at \@outputpage, \columnwidth the
    // column's; multicol: one body, \columnwidth the block's, its columns set inside it, unstated)
    const grid = 'AXT-BODY 4 0 246.0pt 510.0pt 3946905\nAXT-BODY 5 0 510.0pt 510.0pt 3946905'
    const [g, mc, one] = framesOf([pts('c2-1', 'bs4'), pts('c2-2', 'bs5'), pts('c1-3', 'bs5')], grid)
    const x0 = Math.round((3946905 / 65536) * (72 / 72.27) * 100) / 100
    expect(g!.columns).toHaveLength(2)
    expect(g!.columns[0]).toEqual([x0, Math.round((x0 + bp(246)) * 100) / 100])
    expect(mc).toBeNull()
    expect(one!.columns).toEqual([one!.block])
  })
  it('states the page’s text block bottom where TeX states it: the depth of \\textheight’s foot under the page’s top', () => {
    // (the borrowing ruling of 2026-11-08: no translation's line past TeX's text block bottom in its column. LaTeX's
    // \@outputpage ships the text block an inch, \voffset, \topmargin, \headheight and \headsep under the page's top edge, its
    // bottom \textheight under that: what pdfLaTeX, XeLaTeX, LuaLaTeX and latex + dvipdfmx each wrote for one bare twocolumn
    // article on A4, whose right column, set flush to its bottom, ends at 169.14. A dimension, no saved position: every engine's
    // alike. A compile made before the statement states none)
    const told = [
      'AXT-BODY 1 1 229.5pt 469.0pt 4736286 675.26999pt',
      'AXT-BODY 2 2 229.5pt 469.0pt 20432158 675.26999pt',
      'AXT-BODY 3 0 469.0pt 469.0pt 4736286 675.26999pt',
    ].join('\n')
    expect(readBodies(told).get(1)!.foot).toBeCloseTo((675.26999 * 72) / 72.27, 6)
    const view = [0, 0, 595.28, 841.89]
    const [two, one] = framesOf(
      [
        { ...pts('c2-1', 'bs1', 'bs2'), view },
        { ...pts('c1-2', 'bs3'), view },
      ],
      told,
    )
    expect(two!.foot).toBe(169.14)
    expect(one!.foot).toBe(169.14)
    expect(framesOf([{ ...pts('c2-1', 'bs1', 'bs2'), view }], log)[0]!.foot).toBeUndefined()
  })
})

describe('readSkips: each unit’s \\baselineskip and \\parskip at its paragraph’s end (LINES_TEX’s AXT-LINES)', () => {
  it('reads both skips’ natural sizes in PDF units, by unit; a statement made before \\parskip was logged tells none', () => {
    const s = readSkips(
      [
        'AXT-LINES 3 5 13.6pt 10.95 0.0pt plus 1.0pt',
        'AXT-LINES 7 1 12.0pt 10',
        'AXT-LINES 8 2 12.0pt plus 1.0pt 10 5.5pt minus 1.0pt',
        'AXT-LINES 9 2 12.0pt 10 x',
      ].join('\n'),
    )
    expect([...s.keys()]).toEqual([3, 8])
    expect(s.get(3)![0]).toBeCloseTo((13.6 * 72) / 72.27, 6)
    expect(s.get(3)![1]).toBe(0)
    expect(s.get(8)![0]).toBeCloseTo((12 * 72) / 72.27, 6)
    expect(s.get(8)![1]).toBeCloseTo((5.5 * 72) / 72.27, 6)
  })
})
