// @vitest-environment node
// The display gate's `elements` measure (fidelity.mjs): an element drawn otherwise than the original sets it. Three of its
// readings misread a right drawing (round c4, lane c4-gate): an element TeX broke over lines read as scripts by its lines'
// baselines (M1), an accent its font maps to no character read as a script (M2), and today's element of v2's matched by piece
// number across two prepares that number pieces otherwise (M3). Each mend with the defect the flag exists for, seeded beside
// it, still flagged. Synthetic pages, content of our own.
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { measurePage } from '../../lab/typeset/parity/verdict.mjs'

const N = 3
type Line = { y: number; x0: number; x1: number; size: number; n: number; bold: number; italic: number; word: number; letter: number; text: string }
const drawnLine = (x0: number, x1: number, y: number, text: string, size = 9.96): Line => ({ y, x0, x1, size, n: [...text].filter((c) => /\S/u.test(c)).length, bold: 0, italic: 0, word: 0.1, letter: 0, text })
/** a line of the part's facts on page `pg`: [page, -, x0, x1, baseline, top, bottom, m0, m1, -, size] */
const factLine = (x0: number, x1: number, y: number, size = 9.96, pg = N) => [pg, 0, x0, x1, y, y + 0.8 * size, y - 0.2 * size, 72, 540, 0, size]
/** a run of arXiv's glyphs as render.mjs's runsOf gives it: [x0, y0, x1, y1, base, size, font, text, turned] */
const run = (x0: number, x1: number, base: number, size: number, text: string, font = 0) => [x0, base - 0.2 * size, x1, base + 0.8 * size, base, size, font, text, 0]
const rec = (o: { runs: unknown[][]; today?: object; v2?: object }) => ({
  page: N,
  original: { links: 0, runs: o.runs, fonts: ['TestSerif-Regular', 'TestMathExtension', 'TestSerif-Small'] },
  today: { units: [], figures: [], names: [], crops: [], links: 0, linksDrawn: 0, lit: [], litBoxes: {}, ...o.today },
  v2: { committed: true, units: [], crops: [], links: 0, linksDrawn: 0, lit: [], ...o.v2 },
  px: {},
})
type Member = { ord: number; kind: string; lines: number[][]; els: unknown[][] }
const measure = (m: Member, r: ReturnType<typeof rec>, prep: object[] = []) =>
  measurePage(
    'p-zh',
    { pages: { [N]: { members: [{ ord: m.ord, state: 'laid', lines: [] }], links: [] } }, facts: { [N]: { members: [{ align: 'l', style: { size: 9.96 }, ...m }], links: 0 } }, today: { [m.ord]: { today: m.ord } } },
    r,
    {
      prepByOrd: new Map(prep.map((u) => [(u as { ord: number }).ord, u])),
      todayOf: new Map([[m.ord, m.ord]]),
      turned: new Set(),
      led: new Map(),
      top: new Set(),
      frame: null,
      groups: [],
      keptByGroup: new Set(),
      folios: new Set(),
    },
  )
type Diff = { flag: string; unit?: string; worse?: boolean; v2: { value: unknown; off: number | null } }
const elements = (p: { diffs: Diff[] }) => p.diffs.filter((d) => d.flag === 'elements')

describe('elements: an element TeX broke over lines is read a line at a time (M1)', () => {
  // (a cell whose citation TeX broke over two of its lines, one El.ink box a line, each on its own baseline 7.97 pt under the
  // one before: 2610.21084v1 p30's cells, "(Name and Name, 2024)" over six lines)
  const cite = ['4', 'cite', [[95.2, 577.2, 124.2, 584.2, 578.92], [75, 569.5, 134.9, 575.9, 570.95]], 2, 1, 0, 0, 0, '\\citep{ada2024,bo2024}']
  const cell = { ord: 50, kind: 'cell', lines: [factLine(75, 134.9, 578.92, 6.97), factLine(75, 134.9, 570.95, 6.97)], els: [cite] }
  const runs = [run(95.2, 124.2, 578.92, 6.97, '(Ada and Bo,'), run(75, 134.9, 570.95, 6.97, '2024; Cy et al., 2025)')]
  it('a citation over two lines, each its line\'s baseline at the text\'s size, holds no script: none set flat', () => {
    const drawn = [drawnLine(75, 134.9, 578.92, '方法 (Ada and Bo,', 6.97), drawnLine(75, 134.9, 570.95, '2024; Cy et al., 2025)', 6.97)]
    expect(elements(measure(cell, rec({ runs, v2: { units: [{ id: 50, lines: drawn }] } })))).toEqual([])
  })
  it('a script in one of its lines drawn flat is still set flat (the defect the flag exists for)', () => {
    // (the second line's "2025" set as a superscript, 6.97 pt over a 9.96 pt line: TeX's script; v2 draws it on the line)
    const formula = ['6', 'math', [[75, 600, 160, 612, 602], [75, 586, 120, 598, 588]], 2, 1, 0, 0, 0, '$a + b^{2025}$']
    const para = { ord: 51, kind: 'para', lines: [factLine(75, 300, 602), factLine(75, 300, 588)], els: [formula] }
    const scripted = [run(75, 160, 602, 9.96, 'a +'), run(75, 85, 588, 9.96, 'b'), run(85, 100, 591.5, 6.97, '2025', 2)]
    const flat = [drawnLine(75, 300, 602, '于是 a +'), drawnLine(75, 300, 588, 'b2025 成立')]
    const [d] = elements(measure(para, rec({ runs: scripted, v2: { units: [{ id: 51, lines: flat }] } })))
    expect(d).toMatchObject({ unit: 't51 para', worse: true, v2: { value: 'element 6: its scripts or sizes set flat as text', off: 1 } })
    // (and on one line, the script beside its nucleus)
    const one = ['7', 'math', [[75, 600, 120, 612, 602]], 1, 1, 0, 0, 0, '$x^{2}$']
    const line = { ord: 52, kind: 'para', lines: [factLine(75, 300, 602)], els: [one] }
    const [e] = elements(measure(line, rec({ runs: [run(75, 85, 602, 9.96, 'x'), run(85, 90, 605.5, 6.97, '2', 2)], v2: { units: [{ id: 52, lines: [drawnLine(75, 300, 602, '于是 x2 成立')] }] } })))
    expect(e).toMatchObject({ worse: true, v2: { off: 1 } })
  })
})

describe('elements: a glyph its font maps to no character is no script (M2)', () => {
  // (an accent set by \accent from a font whose encoding names no character for it: PDF.js gives its code, "\x01", 2.83 pt
  // under the line's baseline, inside a citation's box: 2610.21376v1 p9's "é" of a name)
  const cite = ['12', 'cite', [[260, 634, 324, 643, 636.17]], 1, 1, 0, 0, 0, '\\citet{demo2024}']
  const para = { ord: 85, kind: 'theorem', lines: [factLine(140.6, 504, 636.17)], els: [cite] }
  const line = run(140.6, 504, 636.17, 9.96, 'as in the convention of Demo et al. [5], and so')
  const drawn = [drawnLine(140.6, 504, 636.17, '按照 Démo et al. [5] 的约定')]
  it('an accent PDF.js reads as a control character holds no script', () => {
    const runs = [line, run(279.1, 283.7, 633.34, 9.96, '\x01', 1)]
    expect(elements(measure(para, rec({ runs, v2: { units: [{ id: 85, lines: drawn }] } })))).toEqual([])
  })
  it('a script beside it, a character a reader reads, is still set flat', () => {
    const runs = [line, run(279.1, 283.7, 633.34, 9.96, '\x01', 1), run(300, 304, 639.67, 6.97, '7', 2)]
    const [d] = elements(measure(para, rec({ runs, v2: { units: [{ id: 85, lines: drawn }] } })))
    expect(d).toMatchObject({ worse: true, v2: { value: 'element 12: its scripts or sizes set flat as text', off: 1 } })
  })
})

describe("elements: today's element of v2's is the same occurrence of its source, whatever its piece number (M3)", () => {
  // (a paragraph with three marks of one macro: v2's part numbers its pieces 7, 11, 41, today's prepare 7, 41, 71, so v2's
  // piece 41 is the third mark and today's piece 41 the second: 2610.21547v1 p17's `\cls{circle}`, the 7th of v2's piece 41
  // and the 5th of today's. The third mark's ink stands on the next page on both)
  const src = '\\mark{circle}'
  const els = [
    ['7', 'other', [[100, 600, 106, 606, 601]], 1, 1, 0, 0, 0, src],
    ['11', 'other', [[200, 600, 206, 606, 601]], 1, 1, 0, 0, 0, src],
    ['41', 'other', [], 1, 1, 0, 0, 0, src],
  ]
  const para = { ord: 237, kind: 'para', lines: [factLine(72, 540, 601)], els }
  const seg = (page: number, x0: number) => ({ page, x0, x1: x0 + 6, baseline: 601, top: 606, bottom: 600 })
  const today = (third: number) => ({
    ord: 237,
    kind: 'para',
    text: 'marks ￼ and ￼ and ￼',
    lines: [{ page: N, x0: 72, x1: 540, baseline: 601, top: 609, bottom: 599, size: 9.96 }],
    pieces: [7, 41, 71].map((k) => ({ k, kind: 'ph', src })),
    elements: [
      { k: 7, kind: 'macro', segs: [seg(N, 100)], flags: [] },
      { k: 41, kind: 'macro', segs: [seg(N, 200)], flags: [] },
      { k: 71, kind: 'macro', segs: [seg(third, 72)], flags: [] },
    ],
  })
  const drawn = { units: [{ id: 237, lines: [drawnLine(72, 540, 601, '标记 ￼ 和 ￼ 和')] }] }
  const runs = [run(72, 540, 601, 9.96, 'marks and and')]
  it("v2's third mark, on the next page on both, is not today's second mark drawn on this page", () => {
    expect(elements(measure(para, rec({ runs, v2: drawn }), [today(N + 1)]))).toEqual([])
  })
  it('the third mark drawn as nothing where today finds its ink on this page is still missing', () => {
    const [d] = elements(measure(para, rec({ runs, v2: drawn }), [today(N)]))
    expect(d).toMatchObject({ unit: 't237 para', worse: true, v2: { value: 'element 41: drawn as nothing where TeX set ink', off: 1 } })
  })
})
