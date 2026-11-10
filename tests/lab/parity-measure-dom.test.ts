// @vitest-environment node
// What the parity reads back of a drawn line (lab/typeset/parity/measure-dom.mjs linesOfSvg): its word spaces and letter gaps.
// A synthetic SVG of the browser's text API (each character's advance box), one line of 11.96 pt drawn as three runs, each a
// <tspan> placed at its own x with no space character between them: a heading's lead ("Anhang", its label "C.") and its text,
// set apart by the typesetter's glue (2608.16117 p37: the original's 4.49 and 6.73 pt).
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { linesOfSvg } from '../../lab/typeset/parity/measure-dom.mjs'

/** a run: its text, its x, whether it is placed at its own x (a <tspan x>), a gap between its letters, its face's weight and
 *  style (the computed style's) */
type Run = { s: string; x: number; placed?: boolean; gap?: number; weight?: string; italic?: boolean }
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
    computed: { ...style, ...(r.weight ? { fontWeight: r.weight } : {}), ...(r.italic ? { fontStyle: 'italic' } : {}) },
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
;(globalThis as { getComputedStyle?: unknown }).getComputedStyle = (el: { computed?: typeof style }) => el.computed ?? style

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

describe("a drawn line read back: each character's face, for a share that leaves some of them out", () => {
  const line = (runs: Run[]) => linesOfSvg(svgOf(runs), 'data-axt-ord', [0, 0, 595, 842], 1)[0].lines[0]
  it("states each character's weight and slant beside its text (`st`: 1 bold, 2 slanted, 3 both, 0 neither, a space 0)", () => {
    // (a head drawn anew: its label "Satz 1 (" in a bold face, its note in a slanted one, the rest upright and regular)
    const l = line([
      { s: 'Satz 1 (', x: 72 },
      { s: 'Wohl', x: 72 + 8 * W, weight: '400', italic: true },
      { s: '). Es', x: 72 + 12 * W, weight: '400' },
    ])
    expect(l.text).toBe('Satz 1 (Wohl). Es')
    expect(l.st).toBe('11110101222200000')
    expect([l.bold, l.italic]).toEqual([6, 4])
  })
  it('a line with no bold and no slanted character states none', () => {
    expect(line([{ s: 'Es gilt', x: 72, weight: '400' }]).st).toBeUndefined()
  })
})
