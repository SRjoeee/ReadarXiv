// The marked compile's log channels (src/marks/channels.ts), which the front half's adapter reads (src/pdf-reader/engine/
// pipeline/instrument.mjs): each unit's alignment (AXT-ALIGN), each page's text frame (AXT-BODY at its body's opening point)
// and each unit's paragraph skips (AXT-LINES).
import { describe, expect, it } from 'vitest'
import { framesOf, readAlign, readBodies, readRefNames, readSkips } from '../../src/marks/channels.ts'

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

describe('readRefNames: each reference’s item type and the full name the paper gives it (AXT-REF, AXT-REFNAME)', () => {
  it('takes the first of the names TeX wrote that is plain words and no abbreviation, in the order it wrote them', () => {
    const log = [
      'AXT-REF 0 figure',
      // (cleveref's capitalised name, its abbreviated one, hyperref's, LaTeX's: the first full one)
      'AXT-REFNAME 0 C macro:->Fig.',
      'AXT-REFNAME 0 c macro:->fig.',
      'AXT-REFNAME 0 a macro:->Figure',
      'AXT-REFNAME 0 n macro:->Figure',
      'AXT-REF 1 section',
      'AXT-REFNAME 1 a macro:->section',
      // (a type no name of which TeX knows: stated, no name)
      'AXT-REF 2 section*',
      // (a name that is no plain words: a command in it, refused)
      'AXT-REF 3 table',
      'AXT-REFNAME 3 n macro:->\\scshape Table',
      'AXT-REF 4 equation',
      'AXT-REFNAME 4 a \\long macro:->Equation',
    ].join('\n')
    expect([...readRefNames(log)]).toEqual([
      [0, { type: 'figure', name: 'Figure' }],
      [1, { type: 'section', name: 'section' }],
      [2, { type: 'section*' }],
      [3, { type: 'table' }],
      [4, { type: 'equation', name: 'Equation' }],
    ])
  })
  it('reads a name TeX wrote as UTF-8 bytes (the log read byte for byte) and one it wrote in ^^ notation', () => {
    const latin1 = (s: string) => String.fromCharCode(...new TextEncoder().encode(s))
    const log = [
      'AXT-REF 0 figure',
      `AXT-REFNAME 0 n macro:->${latin1('Abbildung')}`,
      'AXT-REF 1 figure',
      `AXT-REFNAME 1 n macro:->${latin1('Ilustración')}`,
      'AXT-REF 2 table',
      'AXT-REFNAME 2 n macro:->Tabla^^c3^^b3n',
    ].join('\n')
    const got = readRefNames(log)
    expect(got.get(0)?.name).toBe('Abbildung')
    expect(got.get(1)?.name).toBe('Ilustración')
    expect(got.get(2)?.name).toBe('Tablaón')
  })
  it('states nothing where TeX wrote nothing (a log of before, a paper with no reference)', () => {
    expect(readRefNames('AXT-ALIGN 3 p 1 0.0pt 1 0.0pt 0 0.0pt').size).toBe(0)
  })
})
