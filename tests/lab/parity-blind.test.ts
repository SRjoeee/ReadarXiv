// @vitest-environment node
// The two measures the parity lacked for defects today and v2 share (lane parity-blind, 2026-11-09), each judging both sides
// against the original itself: `scripts`, the original's raised or lowered marks drawn flat (2610.20967v1 p1's "Song-Ze Yu¹"
// drawn with its mark flat by both), and `toggles`, a unit the toggles keep the original's drawn translated, its class read off the
// original (arXiv's metadata names the authors, hyperref's anchors the references), never off either reader's classification
// (the same page's names, translated by both with the author toggle off). Where both depart, a `both` entry: the shared defect
// the side-by-side verdict cannot see. Synthetic pages, each the geometry of 2610.20967v1 p1 or its references.
import * as PL from '@cantoo/pdf-lib'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { keptFacts, originalFacts, scriptsOf, scriptsPass } from '../../lab/typeset/parity/blind.mjs'
// @ts-expect-error — a plain node module of the lab
import { measurePage, summaryOf } from '../../lab/typeset/parity/verdict.mjs'

type Line = { y: number; x0: number; x1: number; size: number; n: number; bold: number; italic: number; word: number; letter: number; text: string }
const N = 1
const drawnLine = (x0: number, x1: number, y: number, text: string, size = 11.96): Line => ({ y, x0, x1, size, n: [...text].filter((c) => /\S/u.test(c)).length, bold: 0, italic: 0, word: 0.1, letter: 0, text })
/** a line of the part's facts on page N: [page, -, x0, x1, baseline, top, bottom, m0, m1, -, size] */
const factLine = (x0: number, x1: number, y: number, size = 11.96) => [N, 0, x0, x1, y, y + 0.8 * size, y - 0.2 * size, 54.43, 558.99, 0, size]
const rec = (o: { today?: object; v2?: object; runs?: unknown[][] } = {}) => ({
  page: N,
  original: { links: 0, runs: o.runs ?? RUNS, fonts: ['NimbusRomNo9L-ReguItal', 'CMR8', 'CMMI8'] },
  today: { units: [], figures: [], names: [], crops: [], links: 0, linksDrawn: 0, lit: [], litBoxes: {}, ...o.today },
  v2: { committed: true, units: [], crops: [], links: 0, linksDrawn: 0, lit: [], ...o.v2 },
  px: {},
})
// (2610.20967v1 p1's names as arXiv's page sets them, PDF.js's runs [x0, y0, x1, y1, base, size, font, text, turned]: the names
// at 11.96 pt on 648.87, each mark at 7.97 pt on 653.2, 4.33 pt over it; ",2" a math element)
const RUNS = [
  [191.54, 646.48, 245.9, 658.43, 648.87, 11.96, 0, 'Song-Ze Yu', 0],
  [245.9, 651.61, 250.13, 659.58, 653.2, 7.97, 1, '1', 0],
  [250.63, 646.48, 329.1, 658.43, 648.87, 11.96, 0, ', Fang-Duo Tsai', 0],
  [329.1, 651.61, 333.34, 659.58, 653.2, 7.97, 1, '1', 0],
  [333.34, 651.61, 335.69, 659.58, 653.2, 7.97, 2, ',', 0],
  [335.69, 651.61, 339.92, 659.58, 653.2, 7.97, 1, '2', 0],
  [340.42, 646.48, 417.15, 658.43, 648.87, 11.96, 0, ', Yi-Hsuan Yang', 0],
  [417.15, 651.61, 421.38, 659.58, 653.2, 7.97, 1, '1', 0],
]
// (the names: part member 124, joined to today's unit 123)
const NAMES = { ord: 124, kind: 'inknotes', align: 'c', style: { size: 11.9552, slant: 1 }, lines: [factLine(191.54, 421.38, 648.87)] }
const v2Of = (o: { members?: object[]; facts?: object[]; toggles?: string } = {}) => ({
  pages: { [N]: { members: o.members ?? [{ ord: 124, state: 'laid', lines: [] }], links: [] } },
  facts: { [N]: { members: o.facts ?? [NAMES], links: 0 } },
  today: { 124: { today: 123 } },
  ...(o.toggles ? { toggles: o.toggles } : {}),
})
const PREP = [{ ord: 123, kind: 'inknotes', text: 'Song-Ze Yu1, Fang-Duo Tsai1￼, Yi-Hsuan Yang1', lines: [{ page: N, x0: 191.54, x1: 421.38, baseline: 648.87, top: 658.51, bottom: 646.4, size: 11.96 }] }]
type Kept = { names: { today: Map<number, string[]>; part: Map<number, string[]> }; references: { today: Set<number>; part: Set<number> } }
const measure = (v2: ReturnType<typeof v2Of>, r: ReturnType<typeof rec>, kept?: Kept) =>
  measurePage('2610.20967v1-zh', v2, r, {
    prepByOrd: new Map(PREP.map((u) => [u.ord, u])),
    todayOf: new Map(Object.entries(v2.today).map(([k, t]) => [Number(k), t.today])),
    turned: new Set(),
    led: new Map(),
    top: new Set(),
    frame: null,
    groups: [],
    keptByGroup: new Set(),
    folios: new Set(),
    kept,
  })
type Side = { value: unknown; off: number | null }
type Entry = { flag: string; unit?: string; today: Side; v2: Side; worse?: boolean; nearer?: string }
const of = (flag: string) => (p: { diffs: Entry[] }) => p.diffs.filter((d) => d.flag === flag)
const bothOf = (flag: string) => (p: { both?: Entry[] }) => (p.both ?? []).filter((d) => d.flag === flag)
// (each side's drawing of the names: flat, every mark on the line's baseline at its size, as both drew them in round 6; or raised,
// the marks a run of their own at 7.97 pt on 653.2, as measure-dom reads a run off its line)
const FLAT = [drawnLine(220.9, 391.18, 648.87, '余宋泽1，蔡方多1，杨怡萱1')]
const RAISED = [drawnLine(220.9, 380, 648.87, '余宋泽，蔡方多，杨怡萱'), drawnLine(258, 384, 653.2, '11,21', 7.97)]

describe('scripts: the original\'s raised or lowered marks, read off arXiv\'s glyphs', () => {
  it('a run set smaller than its line\'s text and off its baseline is a script; the line\'s text, a run of its size on its baseline, an accent alone are none', () => {
    const lines = [{ x0: 191.54, x1: 421.38, y: 648.87, top: 658.4, bottom: 646.48, size: 11.96 }]
    const s = scriptsOf(RUNS, lines)
    expect(s.map((x: { text: string }) => x.text)).toEqual(['1', '1', ',', '2', '1'])
    expect(s.every((x: { rise: number }) => x.rise > 4 && x.rise < 4.5)).toBe(true)
    // (small capitals: smaller, on the baseline: no script; an accent set apart, raised: no script)
    const caps = [
      [100, 646.48, 110, 658.43, 648.87, 11.96, 0, 'Y', 0],
      [110, 646.48, 140, 656, 648.87, 9.6, 0, 'ANG', 0],
      [141, 652, 144, 660, 653.2, 7.97, 0, '¨', 0],
    ]
    expect(scriptsOf(caps, [{ x0: 100, x1: 150, y: 648.87, top: 658.4, bottom: 646.48, size: 11.96 }])).toEqual([])
    // (a figure's own text at 1.18 pt standing in a paragraph's line, 2602.23285v2 p9; a glyph PDF.js maps to no text, a rule's
    // piece in the private use area under a cell, 2610.10069v1 p12: no script TeX's sizes or a reader's text give)
    const stray = [
      [108, 274.88, 300, 283.85, 277.05, 9.96, 0, 'than the discrete predictor', 0],
      [120, 275, 130, 276.5, 275.43, 1.18, 0, 'view: -', 0],
      [140, 270, 147, 278, 272, 7.97, 0, '\uf8f6', 0],
    ]
    expect(scriptsOf(stray, [{ x0: 108, x1: 316, y: 277.05, top: 285, bottom: 270, size: 9.96 }])).toEqual([])
    // (a cell whose stated baseline is its superscript's, 2610.21880v1 p5: "Fitted T⋆s" read by its text's baseline at its size)
    const cell = [
      [151.74, 686.38, 154.36, 689.52, 687.01, 3.14, 1, 'T', 0],
      [157.79, 686.5, 164.37, 689.07, 687.01, 2.57, 0, 'Fitted', 0],
      [165.01, 686.38, 168.17, 689.52, 687.01, 3.14, 1, 'T ', 0],
      [168.17, 687.65, 170.48, 690.79, 688.28, 3.14, 1, '⋆', 0],
    ]
    expect(scriptsOf(cell, [{ x0: 151.74, x1: 170.48, y: 688.28, top: 689.83, bottom: 685.72, size: 3.14 }])).toEqual([])
    // (an author block in two columns, 2609.36054v2 p1: each place set smaller beside its name, its baseline 2.06 pt over the
    // name's, a column away; a script touches its nucleus, TeX setting no glue between them)
    const columns = [
      [109.33, 687.17, 162.02, 698.08, 689.35, 10.91, 0, 'Alan Chan*', 0],
      [220.83, 689.61, 243.66, 698.58, 691.41, 8.97, 0, 'GovAI', 0],
    ]
    expect(scriptsOf(columns, [{ x0: 109.33, x1: 243.66, y: 689.35, top: 697.31, bottom: 686, size: 10.91 }])).toEqual([])
    // (a footnote's label set a word space before its text, 2610.22065v1 p1: a script all the same)
    const label = [
      [182.6, 572.63, 259.84, 582.09, 574.52, 9.46, 0, 'Equal contribution.', 0],
      [269.31, 576.57, 271.86, 583.48, 577.96, 6.91, 0, '*', 0],
      [274.72, 572.63, 435.05, 582.09, 574.52, 9.46, 0, 'Corresponding author', 0],
    ]
    expect(scriptsOf(label, [{ x0: 182.6, x1: 435.05, y: 574.52, top: 583.5, bottom: 572.6, size: 9.46 }]).map((x: { text: string }) => x.text)).toEqual(['*'])
    // (a line whose characters are mostly a fraction's, set in script style over its baseline: its text TeX's line, its baseline
    // and size, never the size most of its characters take; the numerator's log₂ a script of it, raised, the numerator 0.61 of the
    // size over it, past a script's reach. 2608.25210v2 p9 t185)
    const frac = [
      [179.1, 251.74, 184.78, 260.71, 253.53, 8.97, 0, 'U', 0],
      [221.07, 257.72, 248.58, 264.3, 259.04, 6.58, 1, '1+8(mlog', 0],
      [248.64, 256.89, 251.19, 262.37, 257.98, 5.48, 2, '2', 0],
      [251.28, 257.72, 277.17, 264.3, 259.04, 6.58, 1, 'm−m+1)', 0],
    ]
    const f = scriptsOf(frac, [{ x0: 53, x1: 299, y: 253.53, top: 265, bottom: 251, size: 8.97 }])
    expect(f.map((x: { text: string }) => x.text)).toEqual(['2'])
    expect(f[0].rise).toBeCloseTo(4.45, 2)
  })
  it('a side that draws the marks flat departs by their characters; v2 drawing them raised where today draws them flat is nearer', () => {
    const p = measure(v2Of(), rec({ today: { units: [{ id: 123, lines: FLAT }] }, v2: { units: [{ id: 124, lines: RAISED }] } }))
    const [d] = of('scripts')(p)
    expect(d).toMatchObject({ nearer: 'v2', worse: false, original: 5 })
    expect(d?.today.off).toBe(5)
    expect(d?.v2.off).toBe(0)
    expect(bothOf('scripts')(p)).toEqual([])
    const back = measure(v2Of(), rec({ today: { units: [{ id: 123, lines: RAISED }] }, v2: { units: [{ id: 124, lines: FLAT }] } }))
    expect(of('scripts')(back)[0]).toMatchObject({ nearer: 'today', worse: true })
  })
  it('both drawing the marks flat is no difference between them, but a shared departure: a `both` entry, counted on the summary', () => {
    const p = measure(v2Of(), rec({ today: { units: [{ id: 123, lines: FLAT }] }, v2: { units: [{ id: 124, lines: FLAT }] } }))
    expect(of('scripts')(p)).toEqual([])
    expect(bothOf('scripts')(p)).toHaveLength(1)
    expect(bothOf('scripts')(p)[0]).toMatchObject({ unit: 't123 inknotes', original: 5, today: { off: 5 }, v2: { off: 5 } })
    expect(p.worse).toBe(0)
    const { summary } = summaryOf([p])
    expect(summary.scripts).toMatchObject({ worsePages: 0, bothPages: 1, bothUnits: 1 })
  })
  it('a crop cut from a mark\'s ink carries it where it stands off the drawn baseline as on A; set on the baseline, it is flat', () => {
    // (",2" a math element: today's crop of it drawn 4.33 pt lower than its source stands over its line, its bottom under the
    // baseline (round 6: 647.04 for 651.37); v2's at its source's rise. The other marks drawn flat on both)
    const text = [drawnLine(220.9, 391.18, 648.87, '余宋泽1，蔡方多1￼￼，杨怡萱1')]
    const today = { units: [{ id: 123, lines: text }], crops: [[123, 326.36, 647.04, 332.58, 654.48, '1', 333.67, 651.37, 339.89, 658.81, N]] }
    const v2 = { units: [{ id: 124, lines: text }], crops: [[124, 325.81, 651.3, 333.14, 658.89, '1', 332.97, 651.3, 340.3, 658.89, N]] }
    const [d] = of('scripts')(measure(v2Of(), rec({ today, v2 })))
    expect(d).toMatchObject({ nearer: 'v2', worse: false })
    expect([d?.today.off, d?.v2.off]).toEqual([5, 3])
  })
  it("a script in an element whose ink a side keeps in place (a display inside a theorem) is the original's, as TeX set it", () => {
    // (2610.30034v1 p7 t123: a theorem's text line, then a display line whose S_J's subscript J stands 1.49 pt under its
    // baseline at 6.97 pt; both draw the text line and keep the display's ink, or v2 drops it)
    const facts = [{ ord: 130, kind: 'theorem', align: 'j', style: { size: 9.96 }, lines: [factLine(48.96, 300, 714.02, 9.96), factLine(62.5, 300.55, 679.27, 9.96)], els: [['9', 'display', [[62.5, 676.4, 300.55, 686.74, 679.27]], 1, 1, 0, 0, 0]] }]
    const prep = { ord: 130, kind: 'theorem', text: 'Suppose…', lines: [], elements: [{ k: 9, kind: 'display', segs: [{ page: N, x0: 62.5, x1: 300.55, baseline: 679.27, top: 686.74, bottom: 676.4 }] }] }
    const runs = [
      [48.96, 712.03, 244.64, 721.99, 714.02, 9.96, 0, 'Suppose Assumption 3 holds. Then, for every', 0],
      [195.2, 677.28, 206.22, 687.24, 679.27, 9.96, 0, '{S', 0],
      [206.21, 676.38, 210.62, 683.36, 677.78, 6.97, 2, 'J', 0],
      [211.78, 677.28, 300.55, 687.24, 679.27, 9.96, 0, '(m + √ηw, P − η)}.', 0],
    ]
    const shown = (t: number, v: number) => ({ fidelity: { over: { today: {}, v2: {} }, dark: { today: {}, v2: {} }, orig: {}, parts: { today: [], v2: [] }, shown: { today: { '130:9': { ink: 100, shown: t } }, v2: { '130:9': { ink: 100, shown: v } } } } })
    const text = [drawnLine(48.96, 300, 714.02, '假设假设 3成立。然后，每一个', 9.96)]
    const page = (t: number, v: number) =>
      measurePage('2610.30034v1-zh', { pages: { [N]: { members: [{ ord: 130, state: 'laid', lines: [] }], links: [] } }, facts: { [N]: { members: facts, links: 0 } }, today: { 130: { today: 130 } } }, { ...rec({ runs, today: { units: [{ id: 130, lines: text }] }, v2: { units: [{ id: 130, lines: text }] } }), px: shown(t, v) }, {
        prepByOrd: new Map([[130, prep]]),
        todayOf: new Map([[130, 130]]),
        turned: new Set(),
        led: new Map(),
        top: new Set(),
        frame: null,
        groups: [],
        keptByGroup: new Set(),
        folios: new Set(),
      })
    const kept = page(98, 98)
    expect([...of('scripts')(kept), ...bothOf('scripts')(kept)]).toEqual([])
    const dropped = page(98, 0)
    expect(of('scripts')(dropped)[0]).toMatchObject({ worse: true, original: 1, today: { off: 0 }, v2: { off: 1 } })
  })
  it("a big operator, hung from the reference point TeX sets near its top, stands past a script's reach: no mark, drawn or not", () => {
    // (2610.10069v1 p10 t72: ∑ at 9.96 pt in a 11.96 pt line, its run's baseline 7.97 pt over the line's, its run's box 626.4 to
    // 636.36 over its ink 612 to 630, which the crop of its formula is cut from)
    const facts = [{ ord: 72, kind: 'para', align: 'j', style: { size: 11.96 }, lines: [[N, 0, 72, 540, 620.42, 637, 612, 54.43, 558.99, 0, 11.96]] }]
    const runs = [
      [72, 618.03, 130, 630, 620.42, 11.96, 0, 'with the probabilities', 0],
      [131, 626.4, 141, 636.36, 628.39, 9.96, 1, '∑', 0],
    ]
    const text = [drawnLine(72, 300, 620.42, '概率￼')]
    const crop = [72, 128, 612, 160, 630, '3', 128, 612, 160, 630, N]
    const page = (crops: unknown[][]) =>
      measurePage('2610.10069v1-zh', { pages: { [N]: { members: [{ ord: 72, state: 'laid', lines: [] }], links: [] } }, facts: { [N]: { members: facts, links: 0 } }, today: { 72: { today: 72 } } }, rec({ runs, today: { units: [{ id: 72, lines: text }], crops }, v2: { units: [{ id: 72, lines: text }], crops } }), {
        prepByOrd: new Map(),
        todayOf: new Map([[72, 72]]),
        turned: new Set(),
        led: new Map(),
        top: new Set(),
        frame: null,
        groups: [],
        keptByGroup: new Set(),
        folios: new Set(),
      })
    expect([...bothOf('scripts')(page([crop])), ...bothOf('scripts')(page([]))]).toEqual([])
  })
  it("a mark outside the side's own lines of the unit is the original's ink it never erased, in place", () => {
    // (2602.23285v2 p1 t182: the affiliation's ♠ at 115.4, today's unit's line from 122.12, after it: today leaves the mark's
    // ink as A set it; v2's member holds it and sets it as a crop at its rise, or loses it)
    const facts = [{ ord: 182, kind: 'affiliation', align: 'l', style: { size: 9.96 }, lines: [[N, 0, 115.4, 387.02, 623.93, 632.6, 621.76, 108, 504, 0, 9.96]] }]
    const prep = { ord: 182, kind: 'affiliation', text: 'Information Science…', lines: [{ page: N, x0: 122.12, x1: 387.02, baseline: 623.93, top: 631.9, bottom: 621.94, size: 9.96 }] }
    const runs = [
      [115.4, 626.15, 121.62, 633.13, 627.55, 6.97, 0, '♠', 0],
      [122.12, 621.94, 387.02, 631.9, 623.93, 9.96, 1, 'Information Science and Techinology, Hokkaido University, Japan', 0],
    ]
    const text = [drawnLine(122.12, 299.45, 623.93, '情報科学・技術学、北海道大学、日本', 9.96)]
    const page = (crops: unknown[][]) =>
      measurePage('2602.23285v2-ja', { pages: { [N]: { members: [{ ord: 182, state: 'laid', lines: [] }], links: [] } }, facts: { [N]: { members: facts, links: 0 } }, today: { 182: { today: 182 } } }, rec({ runs, today: { units: [{ id: 182, lines: text }] }, v2: { units: [{ id: 182, lines: text }], crops } }), {
        prepByOrd: new Map([[182, prep]]),
        todayOf: new Map([[182, 182]]),
        turned: new Set(),
        led: new Map(),
        top: new Set(),
        frame: null,
        groups: [],
        keptByGroup: new Set(),
        folios: new Set(),
      })
    const crop = page([[182, 115.43, 626.27, 122.4, 632.98, '1', 115.03, 626.27, 122, 632.98, N]])
    expect([...of('scripts')(crop), ...bothOf('scripts')(crop)]).toEqual([])
    expect(of('scripts')(page([]))[0]).toMatchObject({ worse: true, today: { off: 0 }, v2: { off: 1 } })
  })
  it('a crop drawn on another page carries the scripts of its source page: the paper\'s pass', () => {
    // (2608.16117v1 p3 t11: "The symbol (·)′" on A's page 3, its prime 4.33 pt over the line; both translations set the crop of
    // "(·)′" on page 4, where their text flows, at its rise over their line there)
    const one = (page: number, lines: number[][], drawn: Line[], crops: unknown[][], runs: unknown[][]) => {
      const facts = [{ ord: 11, kind: 'para', align: 'j', style: { size: 11.96 }, lines }]
      const v2 = { pages: { [page]: { members: [{ ord: 11, state: 'laid', lines: [] }], links: [] } }, facts: { [page]: { members: facts, links: 0 } }, today: { 11: { today: 11 } } }
      const r = { ...rec({ runs, today: { units: [{ id: 11, lines: drawn }], crops }, v2: { units: [{ id: 11, lines: drawn }], crops } }), page }
      return measurePage('2608.16117v1-de', v2, r, { prepByOrd: new Map(), todayOf: new Map([[11, 11]]), turned: new Set(), led: new Map(), top: new Set(), frame: null, groups: [], keptByGroup: new Set(), folios: new Set() })
    }
    const at = (page: number, x0: number, x1: number, y: number) => [page, 0, x0, x1, y, y + 0.8 * 11.96, y - 0.2 * 11.96, 72, 533, 0, 11.96]
    const p3 = one(3, [at(3, 79.37, 532.91, 70.87)], [drawnLine(79.37, 532.91, 85.31, 'Vektoren werden durch kleine, fette Buchstaben bezeichnet')], [], [
      [79.37, 68.47, 216.69, 80.43, 70.87, 11.96, 0, 'bold letters. The symbol (', 0],
      [216.69, 68.47, 220.01, 80.43, 70.87, 11.96, 2, '·', 0],
      [220.01, 68.47, 224.57, 80.43, 70.87, 11.96, 0, ')', 0],
      [224.57, 73.61, 226.86, 81.58, 75.2, 7.97, 3, '′', 0],
    ])
    const p4 = one(4, [], [drawnLine(79.37, 532.91, 744.62, '￼steht für die Ableitung bezüglich der unverformten Bogenlänge')], [[11, 79.4, 741.3, 94.9, 753.9, '14', 211.7, 67.6, 227.3, 80.1, 3]], [])
    // (page 3 alone: the prime is drawn nowhere on it, so both lose it)
    expect(bothOf('scripts')(p3)).toHaveLength(1)
    scriptsPass([p3, p4])
    expect([...of('scripts')(p3), ...bothOf('scripts')(p3), ...of('scripts')(p4), ...bothOf('scripts')(p4)]).toEqual([])
    expect(p3.faults.scripts).toBeUndefined()
  })
  it('a unit a side leaves the original\'s keeps its marks: only the side that draws them flat departs', () => {
    const p = measure(v2Of({ members: [{ ord: 124, state: 'unfit', lines: [] }] }), rec({ today: { units: [{ id: 123, lines: FLAT }] } }))
    expect(of('scripts')(p)[0]).toMatchObject({ nearer: 'v2', worse: false })
  })
})

describe('toggles: a unit the toggles keep, its class read off the original', () => {
  const kept = (o: { names?: boolean; references?: boolean } = {}): Kept => ({
    names: { today: new Map(o.names === false ? [] : [[123, ['Song-Ze Yu', 'Fang-Duo Tsai', 'Yi-Hsuan Yang']]]), part: new Map(o.names === false ? [] : [[124, ['Song-Ze Yu', 'Fang-Duo Tsai', 'Yi-Hsuan Yang']]]) },
    references: { today: new Set(o.references ? [123] : []), part: new Set(o.references ? [124] : []) },
  })
  it("the author's names arXiv's metadata states, translated by both under the default toggles (author block off): a shared departure", () => {
    const p = measure(v2Of(), rec({ today: { units: [{ id: 123, lines: FLAT }] }, v2: { units: [{ id: 124, lines: FLAT }] } }), kept())
    expect(of('toggles')(p)).toEqual([])
    expect(bothOf('toggles')(p)).toHaveLength(1)
    expect(bothOf('toggles')(p)[0]).toMatchObject({ unit: 't123 inknotes', original: 'names', today: { value: 'translated', off: 1 }, v2: { value: 'translated', off: 1 } })
    expect(p.faults.toggles).toMatchObject({ today: 1, v2: 1 })
  })
  it('v2 translating a unit the toggles keep that today leaves the original\'s is worse; a reference (hyperref\'s anchor) alike', () => {
    const p = measure(v2Of(), rec({ v2: { units: [{ id: 124, lines: FLAT }] } }), kept())
    expect(of('toggles')(p)[0]).toMatchObject({ worse: true, nearer: 'today', today: { value: "the original's", off: 0 }, v2: { value: 'translated', off: 1 } })
    const ref = measure(v2Of(), rec({ v2: { units: [{ id: 124, lines: FLAT }] } }), kept({ names: false, references: true }))
    expect(of('toggles')(ref)[0]).toMatchObject({ worse: true, original: 'references' })
  })
  it("v2 keeping what the toggles keep where today translates it is nearer, and no translation missing (`shown` not worse)", () => {
    const p = measure(v2Of({ members: [{ ord: 124, state: 'left', lines: [] }] }), rec({ today: { units: [{ id: 123, lines: FLAT }] } }), kept())
    expect(of('toggles')(p)[0]).toMatchObject({ worse: false, nearer: 'v2' })
    const [s] = of('shown')(p)
    expect(s).toMatchObject({ worse: false, nearer: 'v2' })
    expect(p.worse).toBe(0)
    // (without the fact, `shown` judges it as before: a translation missing)
    const blind = measure(v2Of({ members: [{ ord: 124, state: 'left', lines: [] }] }), rec({ today: { units: [{ id: 123, lines: FLAT }] } }))
    expect(of('shown')(blind)[0]).toMatchObject({ worse: true })
  })
  it("v2 keeping a piece of a reference that today cut apart is no translation missing, though no run of the original is the piece's alone", () => {
    // (2608.25210v2 p17's t518: arXiv's line one run, "Liu, … Mao. 2024. Benchmarking the text-to-sql", across the pieces today
    // cut; the words a side drew cannot be read against the piece's own, but its class is a reference's, by the anchor)
    const p = measure(
      v2Of({ members: [{ ord: 124, state: 'left', lines: [] }] }),
      rec({ runs: [], today: { units: [{ id: 123, lines: FLAT }] } }),
      kept({ names: false, references: true }),
    )
    expect(of('shown')(p)[0]).toMatchObject({ worse: false, nearer: 'v2' })
    expect(p.worse).toBe(0)
  })
  it("a unit drawn in the original's own words (its letters and digits in its order, elements cut as crops) is not translated", () => {
    const echo = [drawnLine(191.54, 421.38, 648.87, 'Song-Ze Yu1, Fang-Duo Tsai1￼, Yi-Hsuan Yang1')]
    const p = measure(v2Of(), rec({ today: { units: [{ id: 123, lines: echo }] }, v2: { units: [{ id: 124, lines: FLAT }] } }), kept())
    expect(of('toggles')(p)[0]).toMatchObject({ worse: true, today: { off: 0 }, v2: { off: 1 } })
  })
  it('every switch on: nothing the toggles keep, nothing judged; a paper without the facts: nothing judged', () => {
    const on = measure(v2Of({ toggles: 'on' }), rec({ today: { units: [{ id: 123, lines: FLAT }] }, v2: { units: [{ id: 124, lines: FLAT }] } }), kept())
    expect([...of('toggles')(on), ...bothOf('toggles')(on)]).toEqual([])
    const none = measure(v2Of(), rec({ today: { units: [{ id: 123, lines: FLAT }] }, v2: { units: [{ id: 124, lines: FLAT }] } }))
    expect([...of('toggles')(none), ...bothOf('toggles')(none)]).toEqual([])
  })
})

describe("the original's facts of a unit's class, read off arXiv's PDF", () => {
  // (2610.21106v1 p1: one run of PDF.js sets the three units of the author line, "NI XIANG AND YUNI XIONG"; arXiv's metadata
  // names "Yuni Xiang", whom the page never sets)
  const line = (page: number, x0: number, x1: number, y: number, size = 9.96) => ({ page, x0, x1, y, top: y + 0.8 * size, bottom: y - 0.2 * size })
  const pages = [
    {
      page: 1,
      runs: [
        [95.41, 681.61, 511.47, 693.56, 684, 11.96, 0, 'A CLASS OF SUM HESSIAN QUOTIENT EQUATIONS', 0],
        [230.72, 638.17, 371.58, 648.13, 640.16, 9.96, 1, 'NI XIANG AND YUNI XIONG', 0],
      ],
    },
    { page: 5, runs: [[74.33, 557, 300, 568, 559.5, 8.97, 1, 'Ni Xiang. Sum Hessian equations', 0]] },
  ]
  it("an author's name is the unit that holds its first occurrence on A, placed by its characters' share of the run", () => {
    const k = keptFacts({
      authors: ['Ni Xiang', 'Yuni Xiang'],
      cites: [],
      pages,
      today: [
        { ord: 1, lines: [line(1, 230.72, 278.94, 640.16)] },
        { ord: 98, lines: [line(1, 282.2, 305, 640.16)] },
        { ord: 3, lines: [line(1, 308.14, 371.58, 640.16)] },
        { ord: 40, lines: [line(5, 74.33, 300, 559.5)] },
      ],
      part: [{ ord: 2, lines: [line(1, 230.72, 278.94, 640.16)] }],
    })
    expect([...k.names.today]).toEqual([[1, ['Ni Xiang']]])
    expect([...k.names.part]).toEqual([[2, ['Ni Xiang']]])
    expect(k.found).toEqual(['Ni Xiang'])
  })
  it("a reference is the unit whose line starts nearest below and right of a cite.* anchor (hyperref's \\bibitem), not the other column's line at its height", () => {
    // (2610.20967v1 p5: cite.deezer2025aisurvey's anchor at (54.43, 570.54), its entry's first line at 559.5 from 74.33 after
    // its label; the right column's line at 570.4, the left column's line before it at 571.5)
    const k = keptFacts({
      authors: [],
      cites: [{ page: 5, x: 54.43, y: 570.54 }],
      pages,
      today: [
        { ord: 29, lines: [line(5, 74.33, 300, 571.5, 8.97)] },
        { ord: 30, lines: [line(5, 74.33, 300, 559.5, 8.97), line(5, 74.33, 200, 549.5, 8.97)] },
        { ord: 44, lines: [line(5, 315.21, 558.99, 570.4, 8.97)] },
      ],
      part: [{ ord: 31, lines: [line(5, 74.33, 300, 559.5, 8.97)] }],
    })
    expect([...k.references.today]).toEqual([30])
    expect([...k.references.part]).toEqual([31])
  })
  it("the entry's first line stands half a line or more under its anchor: the line of the entry before at its height is not it", () => {
    // (1512.03385v1 p9: entries with no space between them, the anchor of [12] at (50.11, 674.25), the last line of [11] 0.4 pt
    // over it and another 0.9 pt under one, its own first line 9.7 pt under it, both starting after the label at 67.5)
    const k = keptFacts({
      authors: [],
      cites: [{ page: 9, x: 50.11, y: 674.25 }],
      pages: [],
      today: [
        { ord: 322, lines: [line(9, 67.5, 290, 684.3, 7.97), line(9, 67.5, 200, 674.65, 7.97)] },
        { ord: 321, lines: [line(9, 67.5, 290, 673.35, 7.97)] },
        { ord: 323, lines: [line(9, 67.5, 290, 664.55, 7.97)] },
      ],
      part: [],
    })
    expect([...k.references.today]).toEqual([323])
  })
  it("a reference is also every unit standing on its entry's lines: a reader that split the entry draws its pieces there", () => {
    // (2608.25210v2 p17: today's reader cut [64] in two, t517 "[64] Bin Zhang, …" from the anchor and t518 ". Benchmarking the
    // text-to-sql" after the year on the entry's second line; the anchor names t517 alone, and t518, translated by today with the
    // references kept, read as a translation v2 misses. A line of TeX's paragraph is one entry's: a unit whose every line stands
    // on a line of the entry's first unit, its baseline, within that unit's lines across, is the entry's)
    const k = keptFacts({
      authors: [],
      cites: [{ page: 17, x: 307.28, y: 104.3 }],
      pages: [],
      today: [
        { ord: 516, lines: [line(17, 318.19, 558.2, 101.7, 8.97)] },
        { ord: 517, lines: [line(17, 317.96, 558.2, 93.86, 8.97), line(17, 334.39, 455.01, 86.01, 8.97)] },
        { ord: 518, lines: [line(17, 469.82, 558.2, 86.01, 8.97)] },
        { ord: 600, lines: [line(17, 72, 290, 86.01, 8.97)] },
      ],
      part: [],
    })
    expect([...k.references.today].sort()).toEqual([517, 518])
  })
  it("a unit level with an entry's line in the other column is no piece of it: the line's column is the bibliography's extent there", () => {
    // (round 8's default parity: three units read as references, each level with a line of an entry that crosses columns or
    // pages, whose lines' extent across, taken over all of them, spans both columns. 2608.06701 p11: an entry from the left
    // column's foot to the right column's head, a heading at the left column's head level with its right-column line;
    // 2610.22065 p7 alike; 1810.04805 p11-12: an entry from p11's right column to p12's left, a paragraph at p12's right
    // column's head level with its first line there)
    const of = (today: { ord: number; lines: ReturnType<typeof line>[] }[], cites: { page: number; x: number; y: number }[]) =>
      [...keptFacts({ authors: [], cites, pages: [], today, part: [] }).references.today].sort((a, b) => a - b)
    const crossing = of(
      [
        { ord: 283, lines: [line(11, 132.1, 236.4, 733.1, 9.96)] },
        { ord: 297, lines: [line(11, 70.5, 300, 87.5, 9.96), line(11, 70.5, 300, 75.6, 9.96), line(11, 333.6, 563, 733.1, 9.96), line(11, 333.6, 528.7, 721.1, 9.96)] },
        { ord: 298, lines: [line(11, 333.6, 563, 709.2, 9.96), line(11, 333.6, 480.2, 697.2, 9.96)] },
      ],
      [{ page: 11, x: 70.5, y: 96.5 }, { page: 11, x: 333.6, y: 718.2 }],
    )
    expect(crossing).toEqual([297, 298])
    const short = of(
      [
        { ord: 114, lines: [line(7, 70.3, 126.7, 698.4, 9.96)] },
        { ord: 127, lines: [line(7, 69.2, 295.2, 92.6, 7.97), line(7, 69.2, 294.7, 84.7, 7.97), line(7, 333.4, 365.1, 698.4, 7.97)] },
      ],
      [{ page: 7, x: 69.2, y: 99.8 }],
    )
    expect(short).toEqual([127])
    const paging = of(
      [
        { ord: 195, lines: [line(12, 329.1, 525.6, 768.1, 10.91), line(12, 329.1, 459.4, 754.6, 10.91)] },
        {
          ord: 330,
          lines: [line(11, 307.3, 525.6, 100.8, 9.96), line(11, 318.2, 525.6, 89.9, 9.96), line(12, 82.9, 290.3, 768.1, 9.96), line(12, 82.9, 145.4, 757.2, 9.96)],
        },
      ],
      [{ page: 11, x: 307.3, y: 109.8 }],
    )
    expect(paging).toEqual([330])
  })
  it("entries anchored in both columns of a balanced page stay references, a unit holding several of them among them", () => {
    // (2608.06007v1 pp. 16-17, biblatex: today's ink units in the right column each hold several entries, every entry's anchor
    // naming the unit below it; the left column's entries their own units)
    const k = keptFacts({
      authors: [],
      cites: [
        { page: 16, x: 53.8, y: 706.4 },
        { page: 16, x: 318, y: 706.4 },
        { page: 16, x: 318, y: 666.5 },
      ],
      pages: [],
      today: [
        { ord: 243, lines: [line(16, 318, 559.6, 698.4, 7.97), line(16, 335, 558.4, 688.4, 7.97)] },
        { ord: 244, lines: [line(16, 318, 559.1, 658.5, 7.97), line(16, 335, 407, 648.5, 7.97), line(16, 318, 559.6, 638.6, 7.97)] },
        { ord: 266, lines: [line(16, 53.8, 294.9, 698.4, 7.97), line(16, 70.2, 294.9, 688.4, 7.97), line(16, 70.9, 170, 658.5, 7.97)] },
      ],
      part: [],
    })
    expect([...k.references.today].sort((a, b) => a - b)).toEqual([243, 244, 266])
  })
  it("reads arXiv's metadata authors (its Info /Author, '; ' between names) and the cite.* destinations of the PDF", async () => {
    const doc = await PL.PDFDocument.create()
    doc.addPage([612, 792])
    const p2 = doc.addPage([612, 792])
    doc.setAuthor('Song-Ze Yu; Fang-Duo Tsai; Yi-Hsuan Yang')
    const dests = doc.context.obj({
      'cite.deezer2025aisurvey': [p2.ref, PL.PDFName.of('XYZ'), 54.43, 570.54, null],
      'section.1': [p2.ref, PL.PDFName.of('XYZ'), 54.43, 700, null],
    })
    doc.catalog.set(PL.PDFName.of('Dests'), dests)
    const f = await originalFacts(await doc.save())
    expect(f.authors).toEqual(['Song-Ze Yu', 'Fang-Duo Tsai', 'Yi-Hsuan Yang'])
    expect(f.cites).toEqual([{ page: 2, x: 54.43, y: 570.54 }])
  })
})
