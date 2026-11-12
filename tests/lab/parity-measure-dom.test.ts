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
;/** each <tspan>'s computed style: a run's own weight and slant where it states them (`computed`), else the default's */
const computedOf = (el: { computed?: typeof style }) => el.computed ?? style
;(globalThis as { getComputedStyle?: unknown }).getComputedStyle = computedOf

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

describe("a drawn line's size read as the original's is: the size it was set at, its faked small capitals aside", () => {
  // (2608.06701v1 p4 t59, the merged el-facts tree: a line of the caption's translation holding two of the paper's macros in
  // faked small capitals, "GRAPHECTORY" and "LANGUTORY", 18 small capitals at 7.97 pt of 35 characters, read at their median
  // 7.97 where the original is read at its largest cased letter's 9.96 (fidelity.mjs originalOf): a size judged off by a fifth
  // that each side set at 9.96. One definition for every side: its largest letter's, else its median character's)
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
      ;(globalThis as { getComputedStyle?: unknown }).getComputedStyle = computedOf
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
  it('a CJK line holding a word wholly in small capitals is read at its CJK letters, set at the line\'s size', () => {
    // (2610.17024v1 p17 t366: "NONE/SUMZERO" in small capitals at 7.17 pt in a line of 8.97: its largest cased letter is a
    // small capital; a CJK character is a letter of the line's size, an uncased one)
    const l = sizedLine([
      { s: '\u5728', x: 72, size: 8.97 },
      { s: 'NONE/SUMZERO', x: 84, size: 7.17 },
      { s: '\u6700\u5927', x: 160, size: 8.97 },
    ])
    expect(l.size).toBe(8.97)
  })
  it('a line of no letter is read at its median character', () => {
    const l = sizedLine([
      { s: '1.0', x: 72, size: 9.96 },
      { s: '2', x: 100, size: 9.96 },
      { s: '(3)', x: 120, size: 7.97 },
    ])
    expect(l.size).toBe(9.96)
  })
  it('states its characters\' sizes beside its text where they take two or more (`sz`: runs of one size, [characters, size])', () => {
    // (2608.06701v1 p2 t14's \approach, "LIVEPLAN" in faked small capitals: what an element drawn as text carries of the
    // original's two sizes, `elements`)
    const l = sizedLine([
      { s: 'mit', x: 72, size: 9.96 },
      { s: 'L', x: 90, size: 9.96 },
      { s: 'IVE', x: 96, size: 7.97 },
      { s: 'P', x: 112, size: 9.96 },
      { s: 'LAN', x: 118, size: 7.97 },
    ])
    expect(l.text).toBe('mitLIVEPLAN')
    expect(l.sz).toEqual([[4, 9.96], [3, 7.97], [1, 9.96], [3, 7.97]])
    expect(sizedLine([{ s: 'LIVEPLAN', x: 90, size: 9.96 }]).sz).toBeUndefined()
  })
})

describe("a drawn line's extent read on its characters' advances, a slanted run's lean aside", () => {
  // (2610.21106v1 p7 t41 on the el-facts tree: a line ending in a slanted CJK run, the readers' oblique (a <text> skewed about
  // its baseline, paint.ts skewX(-12)), was read 2.36 pt past its laid end: each character's advance box mapped through the
  // skew, its top corner leaning right. A line's width is the sum of its advances, for TeX and for the lay; a slanted glyph's
  // top past its advance is its own overhang, as an italic's is at a line's end in the original (whose lines the part states
  // by their glyphs' advances). Read on the baseline, where the skew moves nothing)
  const lean = Math.tan((12 * Math.PI) / 180)
  const slanted = (runs: Run[], y: number) => {
    const t = textOf(runs, y)
    // (the skew about the baseline y, SVG's y down: x' = x + tan 12° (y - y'))
    const skew = { a: 1, b: 0, c: -lean, d: 1, e: lean * y, f: 0 }
    return { ...t, getAttribute: (a: string) => (a === 'transform' ? 'skewX(-12)' : null), getScreenCTM: () => skew }
  }
  it('a slanted run ends at its last advance, its italic share counted', () => {
    const g = { getAttribute: () => '108', querySelectorAll: () => [slanted([{ s: '\u662f\u7684', x: 100 }], 100)] }
    const svg = { getScreenCTM: () => ({ inverse: () => ({ multiply: (m: unknown) => m }) }), querySelectorAll: () => [g] }
    const l = linesOfSvg(svg, 'data-axt-ord', [0, 0, 595, 842], 1)[0].lines[0]
    expect([l.x0, l.x1, l.italic]).toEqual([100, Math.round((100 + 2 * W) * 100) / 100, 2])
  })
})
