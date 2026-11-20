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
