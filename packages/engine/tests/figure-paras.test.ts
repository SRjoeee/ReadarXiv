// A figure's paragraphs (src/locate/figure-paras.ts, F3, PDF-READER §18.27): lines of prose joined where the text goes on by a
// fact (TeX's hyphen, a justified block, a ragged block of three lines or more), never two ragged lines alone, never across a
// marker, a blank line, a change of face or edge, or two lines each led by ink of its own. Synthetic lines.
import { describe, expect, it } from 'vitest'
import { type ParaLine, parasOf } from '../src/locate/figure-paras.ts'

/** a line of prose at size 10: its extent, its baseline; the rest a paragraph line's defaults (two words or more, uniform word
 *  spaces of 2.5, ending no sentence, beginning in lower case, a first word 20 wide) */
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
  space: 2.5,
  words: 6,
  marker: false,
  ended: false,
  firstWidth: 20,
  lead: 'lower case words',
  leaders: new Set(),
  ...o,
})
const none = () => 'space' as const
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
    expect(joined(ls, () => 'drop')).toEqual([[[0, 1], ['hyphen-drop']]])
    expect(joined(ls, () => 'join')).toEqual([[[0, 1], ['hyphen-join']]])
  })
  it('joins a ragged block of three lines or more: each line filled, ending no sentence, the next in lower case', () => {
    // (ragged right: 290, 296, then a short last line; the next line's first word, 20 wide, would not have fitted on either)
    const ls = [line(100, 290, 700), line(100, 296, 688), line(100, 160, 676)]
    expect(joined(ls)).toEqual([
      [
        [0, 1, 2],
        ['ragged', 'ragged'],
      ],
    ])
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
    expect(joined(hanging)).toEqual([
      [
        [0, 1, 2],
        ['ragged', 'ragged'],
      ],
    ])
  })
})

describe('figure-paras: what is never joined', () => {
  it('leaves two ragged lines alone as they were: stacked legend entries read so (the coordinator’s decision of 2026-11-10)', () => {
    expect(joined([line(100, 290, 700), line(100, 160, 688)])).toEqual([])
  })
  it('begins an item at a line that opens with a marker spelling no word, and ends the paragraph before it', () => {
    const ls = [
      line(100, 290, 700),
      line(100, 296, 688),
      line(100, 160, 676),
      line(100, 290, 664, { marker: true }),
      line(100, 200, 652),
    ]
    expect(joined(ls)).toEqual([
      [
        [0, 1, 2],
        ['ragged', 'ragged'],
      ],
    ])
  })
  it('joins nothing over a blank line, a change of face, size, weight or fill, or of the left edge inside the block', () => {
    const three = (o: Partial<ParaLine>, y2 = 688) => [
      line(100, 290, 700),
      line(100, 296, y2, o),
      line(100, 160, y2 - 12, o),
    ]
    expect(joined(three({}, 660))).toEqual([])
    expect(joined(three({ face: 'Helvetica' }))).toEqual([])
    expect(joined(three({ size: 9 }))).toEqual([])
    expect(joined(three({ bold: true }))).toEqual([])
    expect(joined(three({ fill: 0xa73a3a }))).toEqual([])
    // (the third line off the block's edge: the first two alone, ragged, no paragraph)
    expect(joined([line(100, 290, 700), line(100, 296, 688), line(130, 200, 676)])).toEqual([])
  })
  it('joins no line that ends a sentence, is not filled, or is followed by a capital or a digit, unless a hyphen or a justified line says so', () => {
    const base = () => [line(100, 290, 700), line(100, 296, 688), line(100, 160, 676)]
    const with1 = (o: Partial<ParaLine>, at = 0) => base().map((l, i) => (i === at ? { ...l, ...o } : l))
    expect(joined(with1({ ended: true }))).toEqual([])
    expect(joined(with1({ x1: 200 }))).toEqual([])
    expect(joined(with1({ lead: 'Upper case next' }, 1))).toEqual([])
    expect(joined(with1({ lead: '129 traces' }, 1))).toEqual([])
    expect(joined(with1({ words: 1 }))).toEqual([])
  })
  it('never joins two lines each led by ink of its own (a legend’s samples); a frame’s side leading both is no such ink', () => {
    const ls = (a: number[], b: number[]) => [
      line(100, 290, 700, { leaders: new Set(a) }),
      line(100, 200, 688, { leaders: new Set(b) }),
    ]
    expect(joined(ls([1], [2]), () => 'drop')).toEqual([])
    expect(joined(ls([7], [7]), () => 'drop')).toEqual([[[0, 1], ['hyphen-drop']]])
  })
  it('reads each figure apart, and two columns side by side apart', () => {
    const a = [line(100, 290, 700), line(100, 200, 688, { fig: 'f2:0' })]
    expect(joined(a, () => 'drop')).toEqual([])
    const cols = [line(100, 200, 700), line(220, 320, 700), line(100, 180, 688), line(220, 300, 688)]
    expect(joined(cols, () => 'drop')).toEqual([
      [[0, 2], ['hyphen-drop']],
      [[1, 3], ['hyphen-drop']],
    ])
  })
})
