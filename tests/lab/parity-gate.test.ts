// @vitest-environment node
// The display gate's measures judged against arXiv's page and the original's facts, not against v2's own (lane rc-gate,
// 2026-11-08): what the maintainer found by eye on the converge-7 sheet and no measure flagged. Synthetic pages, each the
// geometry of one of his cases.
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { measurePage } from '../../lab/typeset/parity/verdict.mjs'
// @ts-expect-error — a plain node module of the lab
import { frameOf, labelsPass, originalOf } from '../../lab/typeset/parity/fidelity.mjs'

type Line = { y: number; x0: number; x1: number; size: number; n: number; bold: number; italic: number; word: number; letter: number; text: string }
const N = 3
const drawnLine = (x0: number, x1: number, y: number, text: string, size = 10): Line => ({ y, x0, x1, size, n: text.length, bold: 0, italic: 0, word: 0.3, letter: 0, text })
/** a line of the part's facts on page N: [page, -, x0, x1, baseline, top, bottom, m0, m1, -, size] */
const factLine = (x0: number, x1: number, y: number, size = 10) => [N, 0, x0, x1, y, y + 0.8 * size, y - 0.2 * size, 48, 300, 0, size]
/** a page record as render.mjs writes it */
const rec = (o: { today?: object; v2?: object; original?: object; px?: object } = {}) => ({
  page: N,
  original: { links: 0, ...o.original },
  today: { units: [], figures: [], names: [], crops: [], links: 0, linksDrawn: 0, lit: [], litBoxes: {}, ...o.today },
  v2: { committed: true, units: [], crops: [], links: 0, linksDrawn: 0, lit: [], ...o.v2 },
  px: { ...o.px },
})
const v2Of = (o: { members?: object[]; facts?: object[]; today?: Record<number, { today: number }> } = {}) => ({
  pages: { [N]: { members: o.members ?? [], links: [] } },
  facts: { [N]: { members: o.facts ?? [], links: 0 } },
  today: o.today ?? {},
})
type Extra = { prep?: { ord: number }[]; pair?: string; frame?: object; groups?: object[]; keptByGroup?: Set<number>; folios?: Set<number> }
const measure = (v2: ReturnType<typeof v2Of>, r: ReturnType<typeof rec>, x: Extra = {}) =>
  measurePage(x.pair ?? 'p-zh', v2, r, {
    prepByOrd: new Map((x.prep ?? []).map((u) => [u.ord, u])),
    todayOf: new Map(Object.entries(v2.today).map(([k, t]) => [Number(k), t.today])),
    turned: new Set(),
    led: new Map(),
    top: new Set(),
    frame: x.frame ?? null,
    groups: x.groups ?? [],
    keptByGroup: x.keptByGroup ?? new Set(),
    folios: x.folios ?? new Set(),
  })
const of = (flag: string) => (p: { diffs: { flag: string }[] }) => p.diffs.filter((d) => d.flag === flag)
const laid = (ord: number, lit: object = {}) => ({ ord, state: 'laid', lines: [], lit: { left: [], right: [], own: [], ...lit } })

describe('the highlight: a crop is its own line\'s, and a full-width colon or question mark is a closing mark', () => {
  // (2610.40645 p21 t157: line 1 at 670 holds a formula crop 214.08–280.95 whose ink dips to 663.28, 0.46 pt into line 2's band
  // (its top 663.74 = 655.74 + 0.8 × 10); line 2, three CJK characters ending in a full stop, ends at 135. v2's sentence boxes cover each line's own extent)
  const ys = [670, 655.74]
  const facts = [{ ord: 157, kind: 'para', align: 'j', style: { size: 10 }, lines: ys.map((y) => factLine(72, 300, y)) }]
  const left = [ys.map((y) => [71, y - 3, 301, y + 9])]
  const page = (lines: Line[], crops: number[][], v2Right: number[][]) =>
    measure(
      v2Of({ members: [laid(157, { left, right: [v2Right] })], facts, today: { 157: { today: 157 } } }),
      rec({
        today: { units: [{ id: 157, lines }], lit: [157], litBoxes: { 157: { right: lines.map((l) => [69, l.y - 4, Math.max(l.x1, 282) + 2, l.y + 10]), left: left[0] } } },
        v2: { units: [{ id: 157, lines }], crops, lit: [157] },
      }),
    )

  it("a crop of line 1 whose ink dips into line 2's band widens line 1 alone", () => {
    const lines = [drawnLine(72, 214, 670, 'x'.repeat(20)), drawnLine(105.38, 135, 655.74, '\u307e\u3059\u3002')]
    const crops = [[157, 214.08, 663.28, 280.95, 678.4]]
    const right = [
      [69.75, 667, 283.2, 679],
      [103.13, 652.74, 132.25, 664.6],
    ]
    expect(of('highlight')(page(lines, crops, right))).toEqual([])
  })
  it("a raised script's crop on line 2 that reaches up into line 1's band is line 2's", () => {
    // (2610.21313 p4 t86, a cell of two lines at 6.58 pt: "[GOPS/mm\u00b2]" on 363.27 with its square a crop 346.63–351.71,
    // 365.25–370.08, 0.88 pt of it in the band of line 1 at 370.53, which ends at 338.42)
    const lines = [drawnLine(312.7, 338.42, 370.53, 'x'.repeat(4), 6.58), drawnLine(312.7, 353.33, 363.27, 'x'.repeat(10), 6.58)]
    const crops = [[157, 346.63, 365.25, 351.71, 370.08]]
    const right = [
      [312.7, 369.74, 338.22, 376.32],
      [312.7, 361.82, 353.33, 369.51],
    ]
    expect(of('highlight')(page(lines, crops, right))).toEqual([])
  })
  it("a last line ending in a full-width colon or question mark, its box stopping at the mark's ink, is covered", () => {
    for (const mark of ['\uff1a', '\uff1f']) {
      const lines = [drawnLine(72, 300, 670, 'x'.repeat(20)), drawnLine(72, 140, 655.74, `${'x'.repeat(6)}${mark}`)]
      const right = [
        [69.75, 667, 302.25, 679],
        [69.75, 652.74, 135, 664.6],
      ]
      expect(of('highlight')(page(lines, [], right))).toEqual([])
    }
  })
})

/** a unit both sides draw, member `ord` joined to today's `ord`, its original lines `lines` (factLine) */
const one = (ord: number, kind: string, lines: number[][], o: { els?: unknown[]; style?: object; label?: object } = {}) =>
  v2Of({ members: [laid(ord)], facts: [{ ord, kind, align: 'j', style: { size: 10, ...o.style }, lines, ...(o.els ? { els: o.els } : {}), ...(o.label ? { label: o.label } : {}) }], today: { [ord]: { today: ord } } })
const sides = (ord: number, t: Line[], v: Line[], o: { today?: object; v2?: object; original?: object; px?: object } = {}) =>
  rec({ today: { units: [{ id: ord, lines: t }], ...o.today }, v2: { units: [{ id: ord, lines: v }], ...o.v2 }, original: o.original, px: o.px })
/** render.mjs's fidelity readings of a page (analyse.mjs), every side's reading empty but those given */
const fid = (o: object = {}) => ({ fidelity: { over: { today: {}, v2: {} }, dark: { today: {}, v2: {} }, orig: {}, parts: { today: [], v2: [] }, shown: { today: {}, v2: {} }, ...o } })

describe("frame: a line past its column or the original's text block (2610.22065 p1)", () => {
  // (a two-column paper: its paragraphs' lines from 54 to 294 and from 318 to 558; the ACM reference line 2 of member 157, its
  // original 193.8–294.04; today draws it to 310.41, into the gutter, the owner's "this runs out of its range")
  const paras = (x0: number, x1: number) => Array.from({ length: 10 }, (_, i) => factLine(x0, x1, 700 - 12 * i))
  const frame = frameOf({ 1: { members: [{ ord: 1, kind: 'para', lines: paras(54, 294) }, { ord: 2, kind: 'para', lines: paras(318, 558) }] } })
  const f = one(157, 'para', [factLine(193.8, 294.04, 400, 7.81)])
  it("the paper's frame is its paragraphs' columns", () => {
    expect(frame).toEqual({ columns: [[54, 294], [318, 558]], block: [54, 558] })
  })
  it('today past the column, v2 inside it: v2 nearer; v2 past it where today is not: worse', () => {
    const t = [drawnLine(195.43, 310.41, 400, 'x'.repeat(20), 7.81)],
      v = [drawnLine(195.43, 287.42, 400, 'x'.repeat(20), 6.25)]
    expect(of('frame')(measure(f, sides(157, t, v), { frame }))).toMatchObject([{ unit: 't157 para', worse: false, nearer: 'v2' }])
    expect(of('frame')(measure(f, sides(157, v, t), { frame }))).toMatchObject([{ unit: 't157 para', worse: true }])
  })
  it("a cell's room is its own original's extent (the owner's ruling 3)", () => {
    // (2610.20967 p4 t60: the cell's original 54.43–152.55; v2 lays it to 173.4, today compresses it into its own)
    const cell = one(60, 'cell', [factLine(54.43, 152.55, 300, 8)])
    const t = [drawnLine(54.43, 152, 300, 'x'.repeat(20), 7.8)],
      v = [drawnLine(54.43, 173.4, 300, 'x'.repeat(20), 8)]
    expect(of('frame')(measure(cell, sides(60, t, v), { frame }))).toMatchObject([{ unit: 't60 cell', worse: true }])
  })
})

describe("block: no borrowing, the owner's ruling 1", () => {
  // (a paragraph of 4 lines on A, 700 to 664; today lays 5 lines at full size, its fifth in the gap under the original;
  // v2 keeps the block, 4 lines shrunk to 9.5)
  const f = one(26, 'para', [700, 688, 676, 664].map((y) => factLine(72, 300, y)))
  const t = [700, 688, 676, 664, 652].map((y) => drawnLine(72, 300, y, 'x'.repeat(20), 10)),
    v = [700, 688, 676, 664].map((y) => drawnLine(72, 300, y, 'x'.repeat(20), 9.5))
  it("today borrowing past the original's block and v2 shrinking: no size or line-count fault of v2's, the ruling's", () => {
    const p = measure(f, sides(26, t, v))
    expect(of('block')(p)).toMatchObject([{ unit: 't26 para', worse: false, nearer: 'v2' }])
    expect([...of('size')(p), ...of('line-count')(p)].filter((d) => (d as { worse?: boolean }).worse)).toEqual([])
    expect(of('size')(p)).toMatchObject([{ nearer: 'ruling' }])
  })
  it("v2 borrowing where today keeps the block: worse", () => {
    expect(of('block')(measure(f, sides(26, v, t)))).toMatchObject([{ unit: 't26 para', worse: true }])
  })
})

describe('over: text drawn over ink that stays (2609.36054 p13, 2608.06701 p8, 2610.20967 p4, 2610.21312 p2)', () => {
  const f = one(100, 'para', [factLine(46.99, 290, 700)])
  const l = [drawnLine(46.99, 290, 700, 'x'.repeat(20))]
  it("v2's text over the original's ink that stays where today's is clean: worse", () => {
    const p = measure(f, sides(100, l, l, { px: fid({ over: { today: {}, v2: { 'p:100': 238 } } }) }))
    expect(of('over')(p)).toMatchObject([{ unit: 't100 para', worse: true, v2: { value: 238 } }])
  })
  it('a few pixels where two strokes touch are no difference', () => {
    expect(of('over')(measure(f, sides(100, l, l, { px: fid({ over: { today: { 't:100': 12 }, v2: { 'p:100': 19 } } }) })))).toEqual([])
  })
})

describe("erased: the original's glyphs shown in part (2610.21312 p5, the owner's \"not erased cleanly\")", () => {
  const f = one(58, 'para', [factLine(73.2, 278.7, 160.6), factLine(73.2, 278.7, 148)])
  const l = [drawnLine(73.2, 278, 160.6, 'x'.repeat(20)), drawnLine(73.2, 200, 148, 'x'.repeat(12))]
  const sliver = (x: number) => ({ box: [x, 160.3, x + 3, 160.9], size: 80, shown: 10 })
  it('more slivers of the original inside its region on v2: worse', () => {
    const p = measure(f, sides(58, l, l, { px: fid({ parts: { today: [sliver(76), sliver(89)], v2: [sliver(76), sliver(89), sliver(112)] } }) }))
    expect(of('erased')(p)).toMatchObject([{ unit: 't58 para', worse: true, v2: { off: 3 }, today: { off: 2 } }])
  })
  it('a glyph shown whole (kept) or hardly at all (a neighbour within a pixel) is no sliver', () => {
    const p = measure(f, sides(58, l, l, { px: fid({ parts: { today: [], v2: [{ box: [76, 158, 79, 166], size: 80, shown: 79 }, { box: [90, 158, 93, 166], size: 80, shown: 2 }] } }) }))
    expect(of('erased')(p)).toEqual([])
  })
})

describe('elements: drawn otherwise than the original sets them', () => {
  // (2610.10069 p10 t71: member 71's element 5, an \overline{H}, cut by v2 into its glyphs [441.48, 657.89, 449.2, 666.09] and
  // its rule [441.48, 667.14, 449.2, 667.53], one over the other on A, drawn side by side; today draws it as one crop)
  const f = one(71, 'para', [factLine(72, 540, 660)])
  const l = [drawnLine(72, 400, 660, 'x'.repeat(20))]
  const crop = (ord: number, piece: string, at: number[], src: number[]) => [ord, ...at, piece, ...src, N]
  it('two pieces of one element TeX set on one line drawn apart: worse', () => {
    const v2Crops = [crop(71, '5', [300, 657.3, 308.9, 666.7], [440.88, 657.29, 449.8, 666.69]), crop(71, '5', [310, 659.4, 318.9, 660.6], [440.88, 666.54, 449.8, 668.13])]
    const todayCrops = [crop(71, '5', [300, 657.3, 308.9, 668.1], [440.88, 657.29, 449.8, 668.13])]
    const p = measure(f, sides(71, l, l, { today: { crops: todayCrops }, v2: { crops: v2Crops } }))
    expect(of('elements')(p)).toMatchObject([{ unit: 't71 para', worse: true }])
  })
  it("an element drawn as flat text whose glyphs on A stand on two baselines: v2's scripts flattened, worse", () => {
    // (2609.20976 p2 t6's \kmsMpc: "km s" and "Mpc" on 600, each "−1" raised 3.6 pt at 7.97 pt; v2 draws El.text flat, today
    // a crop)
    const runs = [
      [300, 598, 318, 608, 600, 10.91, 0, 'km s', 0],
      [318, 601.6, 326, 609.6, 603.6, 7.97, 0, '−1', 0],
      [328, 598, 348, 608, 600, 10.91, 0, 'Mpc', 0],
      [348, 601.6, 356, 609.6, 603.6, 7.97, 0, '−1', 0],
    ]
    const els = [['19', 'umacro', [[300, 597, 356, 610, 600]], 1, 1, 0, 0]]
    const fe = one(6, 'para', [factLine(72, 540, 600)], { els })
    const ll = [drawnLine(72, 400, 600, 'x'.repeat(20))]
    const p = measure(fe, sides(6, ll, ll, { today: { crops: [crop(6, '19', [300, 597, 356, 610], [300, 597, 356, 610])] }, original: { runs, fonts: ['CMR10'] } }))
    expect(of('elements')(p)).toMatchObject([{ unit: 't6 para', worse: true, v2: { value: 'element 19: its scripts or sizes set flat as text' } }])
  })
  it("an element drawn as nothing where TeX set ink (today's reading found it on the page): worse", () => {
    // (2610.21312 p2 t9: El 13 "d/n = 0.191" with no ink on p2 in v2's part, today's segment on p2)
    const els = [['13', 'other', [], 0, 0, 0, 0]]
    const fe = one(9, 'para', [factLine(101.3, 540, 600)], { els })
    const prep = [{ ord: 9, kind: 'para', elements: [{ k: 13, kind: 'math', flags: [], segs: [{ page: N, x0: 48.96, x1: 101.26, baseline: 600, top: 608, bottom: 598 }] }] }]
    const ll = [drawnLine(48.96, 400, 600, 'x'.repeat(20))]
    expect(of('elements')(measure(fe, sides(9, ll, ll), { prep }))).toMatchObject([{ unit: 't9 para', worse: true, v2: { value: 'element 13: drawn as nothing where TeX set ink' } }])
  })
})

describe("groups: a table's grid group translated or kept whole as today decides (the owner's ruling 3; 1706.03762 p9)", () => {
  // (Table 3's header: train 118, PPL 119, BLEU 120, params 121; today leaves the header whole, v2 translates 118 and 121 and
  // keeps the names 119 and 120)
  const cell = (ord: number, x0: number) => ({ ord, kind: 'cell', text: ['train', 'PPL', 'BLEU', 'params'][ord - 118], lines: [{ page: N, x0, x1: x0 + 20, baseline: 653, top: 660, bottom: 651, size: 9.96 }] })
  const prep = [cell(118, 370), cell(119, 405), cell(120, 440), cell(121, 480)]
  const v2 = v2Of({ members: [laid(118), laid(121)], facts: [], today: { 118: { today: 118 }, 121: { today: 121 } } })
  const groups = [{ group: '3:h', ids: [118, 119, 120, 121] }]
  it("v2's header part translated, part the original's, where today's is whole: worse", () => {
    const r = rec({ v2: { units: [{ id: 118, lines: [drawnLine(370, 380, 653, '\u5217\u8f66', 9.96)] }, { id: 121, lines: [drawnLine(480, 490, 653, '\u53c2\u6570', 9.96)] }] } })
    expect(of('groups')(measure(v2, r, { prep, groups }))).toMatchObject([{ unit: 'group 3:h', worse: true, v2: { value: 'mixed' }, today: { value: 'original' } }])
  })
  it("a group today's decision kept whole, handed to v2 already decided: v2 has no decision of its own", () => {
    const r = rec({})
    const p = measure(v2Of({ members: [], facts: [] }), r, { prep, groups, keptByGroup: new Set([118, 121]) })
    expect(of('groups')(p)).toMatchObject([{ unit: 'group 3:h', worse: true, v2: { value: '2 cells undecided' } }])
  })
})

describe("the original's style and size read off arXiv's glyphs, not the part", () => {
  it("faked small capitals: the size TeX was asked for is the capitals' (2610.21880 p5's REFERENCES)", () => {
    const runs = [
      [409.61, 449.3, 416.3, 459.3, 451.3, 9.96, 0, 'R', 0],
      [416.3, 449.7, 465.41, 457.7, 451.3, 7.97, 0, 'EFERENCES', 0],
    ]
    expect(originalOf(runs, ['NimbusRomNo9L-Regu'], [[409.61, 449.19, 465.41, 459.9]])).toMatchObject({ size: 9.96, bold: 0 })
  })
  it("a turned figure text set in a bold face is bold (2608.04322 p8's axis title)", () => {
    const runs = [[100, 300, 108, 380, 104, 5.11, 0, 'Refusal Rate (XSTest)', 1]]
    expect(originalOf(runs, ['ABCDEF+TimesNewRomanPS-BoldMT'], [[99, 299, 109, 381]])).toMatchObject({ bold: 1 })
  })
  it("a name both sides draw, joined by its box: v2 at the small capitals' size is worse than today at the capitals'", () => {
    const runs = [
      [409.61, 449.3, 416.3, 459.3, 451.3, 9.96, 0, 'R', 0],
      [416.3, 449.7, 465.41, 457.7, 451.3, 7.97, 0, 'EFERENCES', 0],
    ]
    const v2 = v2Of({ members: [laid(157)], facts: [{ ord: 157, kind: 'name', align: 'c', style: { size: 7.97, upper: 1 }, lines: [factLine(409.61, 465.41, 451.3, 7.97)] }] })
    const r = rec({
      today: { names: [{ id: 2, lines: [drawnLine(417.58, 457.42, 451.3, '\u53c2\u8003\u6587\u732e', 9.96)] }] },
      v2: { units: [{ id: 157, lines: [drawnLine(421.57, 453.45, 451.3, '\u53c2\u8003\u6587\u732e', 7.97)] }] },
      original: { runs, fonts: ['NimbusRomNo9L-Regu'] },
    })
    expect(of('size')(measure(v2, r))).toMatchObject([{ unit: 'p157 name', worse: true }])
  })
  it("a body text grown two steps over the original's where today keeps it: worse (2610.10069 p5)", () => {
    const f = one(32, 'para', [factLine(72, 540, 600, 11.96)])
    const runs = [[72, 597, 540, 609, 600, 11.9552, 0, 'Some body text', 0]]
    const p = measure(f, sides(32, [drawnLine(72, 540, 600, 'x'.repeat(30), 11.96)], [drawnLine(72, 540, 600, 'x'.repeat(30), 12.55)], { original: { runs, fonts: ['CMR12'] } }))
    expect(of('size')(p)).toMatchObject([{ unit: 't32 para', worse: true }])
  })
})

describe("page numbers keep their size, set right-aligned (the owner's ruling 6; 2609.36054 p13, p14)", () => {
  const f = one(228, 'inkheads', [factLine(494.57, 548.28, 34.64, 8.97)])
  it('v2 shrinking the page number where today keeps its size: worse', () => {
    const t = [drawnLine(494.57, 548.28, 34.64, 'x'.repeat(14), 8.97)],
      v = [drawnLine(494.57, 550.02, 34.64, 'x'.repeat(14), 7.4)]
    // (its size 7.4 of 8.97, and its end, laid from its start, 1.74 pt past the original's)
    expect(of('folio')(measure(f, sides(228, t, v), { folios: new Set([228]) }))).toMatchObject([{ worse: true }, { worse: true }])
  })
})

describe("ink: the PDF's own black (the owner's ruling 7)", () => {
  const f = one(5, 'para', [factLine(72, 540, 600)])
  const at = (fill: string) => [{ ...drawnLine(72, 540, 600, 'x'.repeat(30)), fill }]
  it('both sides in #141414 over black ink: a fault of each, no difference; v2 black where today is not: nearer', () => {
    const px = fid({ orig: { 'p:5': { mean: 0.7, pixels: 900, least: 0 } } })
    const p = measure(f, sides(5, at('rgb(20, 20, 20)'), at('rgb(20, 20, 20)'), { px }))
    expect(of('ink')(p)).toEqual([])
    expect(p.faults.ink).toMatchObject({ today: 1, v2: 1 })
    expect(of('ink')(measure(f, sides(5, at('rgb(20, 20, 20)'), at('rgb(0, 0, 0)'), { px })))).toMatchObject([{ worse: false, nearer: 'v2' }])
  })
})

describe("labels: the target word everywhere, consistent within a paper (the owner's ruling 4)", () => {
  const page = (n: number, labels: object[]) => ({ pair: 'p-zh', page: n, worse: 0, score: 0, diffs: [] as { worse: boolean }[], faults: {} as Record<string, unknown>, labels })
  const recount = (p: { diffs: { worse: boolean }[]; worse: number }) => {
    p.worse = p.diffs.filter((d) => d.worse).length
  }
  it("v2 keeping one caption's label in a paper whose others it translates, today translating all: worse there", () => {
    const pages = [page(1, [{ unit: 't3 caption', name: 'Table', today: 'translated', v2: 'translated' }]), page(2, [{ unit: 't9 caption', name: 'Table', today: 'translated', v2: 'kept' }])]
    labelsPass(pages, recount)
    expect(pages[0]!.worse).toBe(0)
    expect(pages[1]!.diffs).toMatchObject([{ flag: 'labels', unit: 't9 caption', worse: true }])
  })
})
