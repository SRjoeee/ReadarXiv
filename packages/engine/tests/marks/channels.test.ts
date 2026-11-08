// The marked compile's log channels (src/marks/channels.ts), which the front half's adapter reads (src/pdf-reader/engine/
// pipeline/instrument.mjs): each unit's alignment (AXT-ALIGN) and each page's text frame (AXT-BODY at its body's opening point).
import { describe, expect, it } from 'vitest'
import { framesOf, readAlign, readBodies } from '../../src/marks/channels.ts'

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
})
