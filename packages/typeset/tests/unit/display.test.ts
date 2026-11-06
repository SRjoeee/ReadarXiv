// D.display on hand-made lines: the runs a line is drawn in, where a run draws its text, the items, and the baseline
// harness's reading of them (a slanted superscript on a <text> of its own, two <text>s on one baseline one line, a crop with
// no copy text, a page whose view does not start at 0).
import { describe, expect, it } from 'vitest'
import type { Face, Token } from '../../src/breaker/tokens.ts'
import { displayLines, lineRuns, runEdge, type TextRun } from '../../src/emit/display.ts'
import type { LaidLine, Layout } from '../../src/fit/types.ts'
import { dumpUnit, viewport } from '../replay/display.ts'

const face = (o: Partial<Face> = {}): Face =>
  ({
    family: '"axt-nimbus-roman"',
    weight: 400,
    style: 'normal',
    oblique: 0,
    stand: 'serif',
    caps: false,
    size: 1,
    ...o,
  }) as Face
const SERIF = face(),
  CJK = face({ family: '"axt-shs-sc"' }),
  SLANT = face({ family: '"axt-shs-sc"', oblique: 12 })
const state = { lead: 1.2, scale: 1, track: 0.02, trackLatin: 0.01, compress: 1, borrow: 0, knob: 'none' }
const item = (t: Partial<Token>, x: number, w = 5, more: Record<string, unknown> = {}) => ({
  t: { w100: 0, ...t } as Token,
  x,
  w,
  ...more,
})
const layoutOf = (lines: Partial<LaidLine>[]): Layout =>
  ({
    lines: lines.map((l) => ({ page: 1, block: 0, from: 0, x0: 72, x1: 300, used: 100, ...l })),
    f: 10,
    s: 10,
    scale: 1,
    state,
  }) as unknown as Layout

describe('D.display: lineRuns', () => {
  it('joins single CJK characters in one run, each at its place, a space copied with the text before it', () => {
    const line = layoutOf([
      {
        baseline: 700,
        items: [
          item({ s: '\u4e2d', cls: 'cjk', face: CJK }, 72),
          item({ s: '\u6587', cls: 'cjk', face: CJK }, 82),
          item({ space: true, face: CJK }, 92),
          item({ s: 'ab', cls: 'latin', face: SERIF }, 95),
          item({ s: 'c', cls: 'latin', face: SERIF }, 105),
        ],
      },
    ]).lines[0]!
    const runs = lineRuns(line, layoutOf([]))
    expect(runs.map((r) => ('crop' in r ? 'crop' : [r.text, r.chars, r.xs]))).toEqual([
      ['\u4e2d\u6587 ', true, [72, 82, 92]],
      // (a word glued to the one before it flows on in its run; the line's last Latin word copies a space)
      ['abc ', false, [95]],
    ])
    expect((runs[1] as TextRun).track).toBe(0.01)
  })
  it('starts a run after a kern, at a break or a superscript, and copies a space after a wide kern; not after a cut word', () => {
    const L = layoutOf([
      {
        baseline: 700,
        items: [
          item({ s: 'a', cls: 'latin', face: SERIF }, 72, 5, { kern: 3 }),
          item({ s: 'b', cls: 'latin', face: SERIF }, 80),
          item({ s: '2', cls: 'latin', face: SERIF, sup: true }, 85),
          item({ s: 'cut', cls: 'latin', face: SERIF, hyphenated: true } as Partial<Token>, 90),
        ],
      },
    ])
    expect(lineRuns(L.lines[0]!, L).map((r) => ('crop' in r ? 'crop' : r.text))).toEqual(['a ', 'b', '2', 'cut'])
  })
})

describe('D.display: runEdge', () => {
  it('reads a run’s edge by its width and tracking, a single character’s by its place', () => {
    const L = layoutOf([
      {
        baseline: 700,
        items: [item({ s: 'ab', cls: 'latin', face: SERIF }, 72), item({ s: '\u4e2d', cls: 'cjk', face: CJK }, 90, 8)],
      },
    ])
    const [word, chars] = lineRuns(L.lines[0]!, L) as TextRun[]
    const w100 = (s: string) => 50 * s.length
    // (one character of 50 at 100 px, at size 10: 5; tracking 0.01 em of 10 a character)
    expect(runEdge(word!, 1, L.lines[0]!, L, w100)).toBeCloseTo(72 + 5 + 0.1, 9)
    expect(runEdge(chars!, 0, L.lines[0]!, L, w100)).toBe(90)
    expect(runEdge(chars!, 1, L.lines[0]!, L, w100)).toBe(98)
  })
})

describe('D.display: items and the harness\u2019s reading', () => {
  const crop = { mode: 'crop', page: 1, crop: [150, 698, 170, 712], baseline: 700, k: 4 }
  const L = layoutOf([
    {
      baseline: 700,
      items: [item({ s: '\u4e2d', cls: 'cjk', face: CJK }, 72), item({ crop: { ...crop, text: '' }, cw: 20 }, 150, 20)],
    },
    { baseline: 700, used: 10, x0: 200, items: [item({ s: 'y', cls: 'latin', face: SERIF }, 200)] },
    { baseline: 680, used: 10, items: [item({ s: 'x', cls: 'latin', face: SLANT, sup: true }, 72)] },
  ])
  it('gives each run its face, size, raise and slant, and each crop its ink, scale and piece', () => {
    const lines = displayLines(L, 1)
    expect(lines.map(([y, x0, x1]) => [y, x0, x1])).toEqual([
      [700, 72, 172],
      [700, 200, 210],
      [680, 72, 82],
    ])
    expect(lines[0]![3].map((i) => ('src' in i ? [i.piece, i.src, i.k, i.w] : [i.s, i.face, i.size]))).toEqual([
      ['\u4e2d', '100px "axt-shs-sc"', 10],
      ['4', [1, 150, 698, 170, 712, 700], 1, 20],
    ])
    const [x] = lines[2]![3]
    expect(x && !('src' in x) && [x.s, x.size, x.rise, x.skew, x.slant]).toEqual(['x ', 6.2, 10 * 0.36, 1, 12])
  })
  it('reads two lines on one baseline as one, a crop with no copy text as none, a slanted superscript off its line', () => {
    const view = [10, 20, 622, 812]
    const d = dumpUnit({ layout: L } as never, () => view)
    expect(d.lines).toEqual([
      { page: 1, x0: 72, x1: 172, baseline: 700, text: '\u4e2dy ' },
      { page: 1, x0: 200, x1: 210, baseline: 700, text: null },
      // (its <text> takes its tspan's raised y: no line of the drawing stands on its baseline)
      { page: 1, x0: 72, x1: 82, baseline: 680, text: null },
    ])
    expect(d.elements).toEqual([{ k: 4, page: 1, x0: 150, x1: 170, top: 712, bottom: 698 }])
    expect(viewport(view)(10, 812)).toEqual([0, 0])
  })
})
