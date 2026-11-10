// A figure's paragraphs (src/locate/figure-paras.ts, F3, PDF-READER §18.28): lines of prose joined where the text goes on by a
// fact of the text (TeX's hyphen, a justified block), never ragged lines by their shape, never across an item's enumerator, a
// blank line, a change of face or edge, or two lines each led by ink of its own. Synthetic lines.
import { describe, expect, it } from 'vitest'
import { type ParaLine, parasOf } from '../src/locate/figure-paras.ts'

/** a line of prose at size 10: its extent, its baseline; the rest a paragraph line's defaults (uniform word spaces of 2.5) */
const line = (x0: number, x1: number, y: number, o: Partial<ParaLine> = {}): ParaLine => ({
  fig: 'f1:0',
  y,
  x0,
  x1,
  size: 10,
  band: 10.3,
  face: 'Times',
  bold: false,
  fill: 0,
  uniform: true,
  wordSpace: 2.5,
  marker: false,
  leaders: new Set(),
  ...o,
})
const none = () => 'space' as const
const drop = () => 'drop' as const
const joined = (ls: ParaLine[], end: (a: number, b: number) => 'space' | 'join' | 'drop' = none) =>
  parasOf(ls, end).map((p) => [p.lines, p.ev])

describe('figure-paras: the strong joins', () => {
  it('joins a justified block: two full lines whose word spaces differ, each reaching the right edge, and its short last line', () => {
    const ls = [line(100, 300, 700, { wordSpace: 2.5 }), line(100, 300, 688, { wordSpace: 3.6 }), line(100, 180, 676)]
    expect(joined(ls)).toEqual([
      [
        [0, 1, 2],
        ['justified', 'justified'],
      ],
    ])
    expect(parasOf(ls, none)[0]!.justified).toBe(true)
  })
  it('joins at TeX’s hyphen, dropped, and at a word’s own, kept: two lines are enough', () => {
    const ls = [line(100, 290, 700), line(100, 200, 688)]
    expect(joined(ls, drop)).toEqual([[[0, 1], ['hyphen-drop']]])
    expect(joined(ls, () => 'join')).toEqual([[[0, 1], ['hyphen-join']]])
  })
  it('keeps an indented first line and a hanging one in their paragraph, the lines after on the block’s edge', () => {
    const indent = [
      line(112, 300, 700, { wordSpace: 2.5 }),
      line(100, 300, 688, { wordSpace: 3.4 }),
      line(100, 300, 676, { wordSpace: 2.9 }),
      line(100, 150, 664),
    ]
    expect(joined(indent)).toEqual([
      [
        [0, 1, 2, 3],
        ['justified', 'justified', 'justified'],
      ],
    ])
    const hanging = [line(100, 290, 700), line(112, 296, 688), line(112, 180, 676)]
    expect(joined(hanging, drop)).toEqual([
      [
        [0, 1, 2],
        ['hyphen-drop', 'hyphen-drop'],
      ],
    ])
  })
})

describe('figure-paras: what is never joined', () => {
  it('joins no ragged lines by their shape, two or three of them: stacked legend entries read so (the coordinator’s decisions)', () => {
    expect(joined([line(100, 290, 700), line(100, 160, 688)])).toEqual([])
    expect(joined([line(100, 290, 700), line(100, 296, 688), line(100, 160, 676)])).toEqual([])
  })
  it('begins an item at a line that opens with an enumerator, and ends the paragraph before it', () => {
    const ls = [
      line(100, 290, 700),
      line(100, 296, 688),
      line(100, 160, 676),
      line(100, 290, 664, { marker: true }),
      line(100, 200, 652),
    ]
    expect(joined(ls, drop)).toEqual([
      [
        [0, 1, 2],
        ['hyphen-drop', 'hyphen-drop'],
      ],
      [[3, 4], ['hyphen-drop']],
    ])
  })
  it('joins nothing over a blank line, a change of face, size, weight or fill, or of the left edge inside the block', () => {
    const three = (o: Partial<ParaLine>, y2 = 688) => [
      line(100, 290, 700),
      line(100, 296, y2, o),
      line(100, 160, y2 - 12, o),
    ]
    expect(joined(three({}, 660), drop)).toEqual([[[1, 2], ['hyphen-drop']]])
    expect(joined(three({ face: 'Helvetica' }), drop)).toEqual([[[1, 2], ['hyphen-drop']]])
    expect(joined(three({ size: 9 }), drop)).toEqual([[[1, 2], ['hyphen-drop']]])
    expect(joined(three({ bold: true }), drop)).toEqual([[[1, 2], ['hyphen-drop']]])
    expect(joined(three({ fill: 0xa73a3a }), drop)).toEqual([[[1, 2], ['hyphen-drop']]])
    // (the third line off the block's edge: the first two alone)
    expect(joined([line(100, 290, 700), line(100, 296, 688), line(130, 200, 676)], drop)).toEqual([
      [[0, 1], ['hyphen-drop']],
    ])
  })
  it('never joins two lines each led by ink of its own (a legend’s samples); a frame’s side leading both is no such ink', () => {
    const ls = (a: number[], b: number[]) => [
      line(100, 290, 700, { leaders: new Set(a) }),
      line(100, 200, 688, { leaders: new Set(b) }),
    ]
    expect(joined(ls([1], [2]), drop)).toEqual([])
    expect(joined(ls([7], [7]), drop)).toEqual([[[0, 1], ['hyphen-drop']]])
  })
  it('reads each figure apart, and two columns side by side apart', () => {
    const a = [line(100, 290, 700), line(100, 200, 688, { fig: 'f2:0' })]
    expect(joined(a, drop)).toEqual([])
    const cols = [line(100, 200, 700), line(220, 320, 700), line(100, 180, 688), line(220, 300, 688)]
    expect(joined(cols, drop)).toEqual([
      [[0, 2], ['hyphen-drop']],
      [[1, 3], ['hyphen-drop']],
    ])
  })
})
