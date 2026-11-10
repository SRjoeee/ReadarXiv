// @vitest-environment node
// What the parity reads back of a drawn line (lab/typeset/parity/measure-dom.mjs linesOfSvg): its word spaces and letter gaps.
// A synthetic SVG of the browser's text API (each character's advance box), one line of 11.96 pt drawn as three runs, each a
// <tspan> placed at its own x with no space character between them: a heading's lead ("Anhang", its label "C.") and its text,
// set apart by the typesetter's glue (2608.16117 p37: the original's 4.49 and 6.73 pt).
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { linesOfSvg } from '../../lab/typeset/parity/measure-dom.mjs'

/** a run: its text, its x, whether it is placed at its own x (a <tspan x>), and a gap between its letters */
type Run = { s: string; x: number; placed?: boolean; gap?: number }
const SIZE = 11.96
const W = 0.5 * SIZE
const identity = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse: identity, multiply: () => identity() })
/** a <text> of runs, each character W wide from its run's x, on the baseline y (SVG y down) */
function textOf(runs: Run[], y: number) {
  const chars = runs.flatMap((r) => [...r.s].map((ch, j) => ({ ch, x: r.x + j * (W + (r.gap ?? 0)) })))
  const spans = runs.map((r) => ({
    textContent: r.s,
    getNumberOfChars: () => r.s.length,
    getAttribute: (a: string) => (a === 'x' && r.placed !== false ? String(r.x) : null),
    hasAttribute: (a: string) => a === 'x' && r.placed !== false,
  }))
  return {
    getAttribute: () => null,
    getScreenCTM: identity,
    querySelectorAll: () => spans,
    getExtentOfChar: (i: number) => ({ x: chars[i]!.x, y: y - 0.75 * SIZE, width: W, height: SIZE }),
    getStartPositionOfChar: (i: number) => ({ x: chars[i]!.x, y }),
  }
}
const svgOf = (runs: Run[]) => {
  const g = { getAttribute: () => '108', querySelectorAll: () => [textOf(runs, 100)] }
  return { getScreenCTM: identity, querySelectorAll: () => [g] }
}
const style = { fontWeight: '700', fontStyle: 'normal', fontSize: `${SIZE}px`, fillOpacity: '1', visibility: 'visible', fill: '#000' }
;(globalThis as { getComputedStyle?: unknown }).getComputedStyle = () => style

describe('a drawn line read back: word spaces and letter gaps', () => {
  const line = (runs: Run[]) => linesOfSvg(svgOf(runs), 'data-axt-ord', [0, 0, 595, 842], 1)[0].lines[0]
  it("a run placed at its own x after the typesetter's glue begins a word: its gap is a word space, not a letter gap", () => {
    // ("Anhang" 79.37-115.25, "C." from 119.74, "Einaxiale" from 138.18: the glue 4.49 and 6.73 pt, no space character)
    const l = line([
      { s: 'Anhang', x: 79.37 },
      { s: 'C.', x: 79.37 + 6 * W + 4.49 },
      { s: 'Einaxiale', x: 79.37 + 8 * W + 4.49 + 6.73 },
    ])
    expect(l.letter).toBe(0)
    expect(l.word).toBeCloseTo(6.73 / SIZE, 2)
  })
  it('a gap between two letters of one run is a letter gap', () => {
    const l = line([{ s: 'Anhang', x: 79.37, gap: 3 }])
    expect(l.letter).toBeCloseTo(3 / SIZE, 2)
    expect(l.word).toBe(0)
  })
  it('a run not placed anew (no x of its own) goes on from the run before: a gap between them is a letter gap', () => {
    const l = line([
      { s: 'Anh', x: 79.37 },
      { s: 'ang', x: 79.37 + 3 * W + 3, placed: false },
    ])
    expect(l.letter).toBeCloseTo(3 / SIZE, 2)
    expect(l.word).toBe(0)
  })
})

describe("a drawn line's size read as the original's is: the size it was set at, its faked small capitals aside", () => {
  // (2608.06701v1 p4 t59, the merged el-facts tree: a line of the caption's translation holding two of the paper's macros in
  // faked small capitals, "GRAPHECTORY" and "LANGUTORY", 18 small capitals at 7.97 pt of 35 characters, read at their median
  // 7.97 where the original is read at its largest cased letter's 9.96 (fidelity.mjs originalOf): a size judged off by a fifth
  // that each side set at 9.96. One definition for every side: its largest cased letter's, else its median character's)
  type Sized = Run & { size: number }
  const sizedLine = (runs: Sized[]) => {
    const svg = svgOf(runs)
    // (each run's computed font size its own: a <tspan> at its share of the size, as the layer draws small capitals)
    ;(globalThis as { getComputedStyle?: unknown }).getComputedStyle = (span: { textContent?: string }) => ({
      ...style,
      fontSize: `${runs.find((x) => x.s === span.textContent)?.size ?? SIZE}px`,
    })
    try {
      return linesOfSvg(svg, 'data-axt-ord', [0, 0, 595, 842], 1)[0].lines[0]
    } finally {
      ;(globalThis as { getComputedStyle?: unknown }).getComputedStyle = () => style
    }
  }
  it('a line of CJK text and capitals at 9.96 with more small capitals at 7.97 is read at 9.96', () => {
    const l = sizedLine([
      { s: '\u56fe4:', x: 72, size: 9.96 },
      { s: 'G', x: 90, size: 9.96 },
      { s: 'RAPHECTORY', x: 96, size: 7.97 },
      { s: '\u548c', x: 150, size: 9.96 },
      { s: 'L', x: 160, size: 9.96 },
      { s: 'ANGUTORY', x: 166, size: 7.97 },
      { s: '\u6355\u6349', x: 210, size: 9.96 },
    ])
    expect(l.size).toBe(9.96)
  })
  it('a line of no cased letter is read at its median character', () => {
    const l = sizedLine([
      { s: '\u56fe\u56fe\u56fe', x: 72, size: 9.96 },
      { s: '\u548c', x: 120, size: 7.97 },
    ])
    expect(l.size).toBe(9.96)
  })
})
