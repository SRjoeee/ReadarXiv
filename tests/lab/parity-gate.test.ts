// @vitest-environment node
// The display gate's measures judged against arXiv's page and the original's facts, not against v2's own (lane rc-gate,
// 2026-11-08): what the maintainer found by eye on the converge-7 sheet and no measure flagged. Synthetic pages, each the
// geometry of one of his cases.
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { measurePage, pastRoomPass, recount, sharePass, stylePass } from '../../lab/typeset/parity/verdict.mjs'
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
const v2Of = (
  o: {
    members?: object[]
    facts?: object[]
    today?: Record<number, { today: number }>
    more?: Record<number, object[]>
    fills?: object
    spaced?: Record<number, number>
  } = {},
) => ({
  pages: { [N]: { members: o.members ?? [], links: [] }, ...Object.fromEntries(Object.entries(o.more ?? {}).map(([pg, ms]) => [pg, { members: ms, links: [] }])) },
  facts: { [N]: { members: o.facts ?? [], links: 0 } },
  today: o.today ?? {},
  ...(o.fills ? { fills: o.fills } : {}),
  ...(o.spaced ? { spaced: { [N]: o.spaced } } : {}),
})
type Extra = { prep?: { ord: number }[]; pair?: string; frame?: object; groups?: object[]; keptByGroup?: Set<number>; folios?: Set<number>; ruled?: Set<number>; cellRooms?: Map<number, object>; floor?: number }
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
    ruled: x.ruled ?? new Set(),
    cellRooms: x.cellRooms ?? null,
    floor: x.floor ?? null,
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
const one = (ord: number, kind: string, lines: number[][], o: { els?: unknown[]; style?: object; label?: object; room?: object } = {}) =>
  v2Of({ members: [laid(ord)], facts: [{ ord, kind, align: 'j', style: { size: 10, ...o.style }, lines, ...(o.els ? { els: o.els } : {}), ...(o.label ? { label: o.label } : {}), ...(o.room ? { room: o.room } : {}) }], today: { [ord]: { today: ord } } })
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

describe("block: borrowing bounded by TeX's facts, the owner's ruling of 2026-11-08", () => {
  // (a paragraph of 4 lines on A, 700 to 664; the part states the room under its last line (Room.runs: [its line, the depth of
  // the next ink's baseline under it, the depth of TeX's text block bottom]) and its separation (Room.sep, \baselineskip and
  // \parskip): a translation may borrow down to that bottom, the next ink staying the separation under its lowest baseline)
  const ys = [700, 688, 676, 664]
  const lines = (sz: number, ...more: number[]) => [...ys, ...more].map((y) => drawnLine(72, 300, y, 'x'.repeat(20), sz))
  const para = (runs: number[][], sep = 12) => one(26, 'para', ys.map((y) => factLine(72, 300, y)), { room: { runs, sep } })
  it("a line past TeX's text block bottom is v2's fault, worse where today keeps within it", () => {
    // (the bottom 24 pt under its last line, at 640; the next ink 60 pt down: today's fifth line at 652 inside, v2's seventh at
    // 628 past it)
    const f = para([[3, 60, 24]])
    const p = measure(f, sides(26, lines(10, 652), lines(10, 652, 640, 628)))
    expect(of('block')(p)).toMatchObject([{ unit: 't26 para', worse: true, v2: { value: 1 }, today: { value: 0 } }])
    expect(p.faults.block.v2Says[0]).toMatch(/past TeX's text block bottom/)
  })
  it('a line bringing the next ink nearer than TeX’s paragraph separation is a fault', () => {
    // (the next ink's baseline 30 pt under its last line, the separation 12: a borrowed baseline no lower than 646)
    const f = para([[3, 30, 200]])
    const p = measure(f, sides(26, lines(10, 652), lines(10, 652, 640)))
    expect(of('block')(p)).toMatchObject([{ unit: 't26 para', worse: true }])
    expect(p.faults.block.v2Says[0]).toMatch(/nearer the next ink than TeX's paragraph separation/)
  })
  it("a line borrowed within TeX's room is no fault; v2's smaller size and fewer lines where today borrowed are judged as any", () => {
    // (today's fifth line inside the room at full size; v2 keeping the block, shrunk to 9.5: no ruling stands between them now)
    const f = para([[3, 60, 24]])
    const p = measure(f, sides(26, lines(10, 652), lines(9.5)), { ruled: new Set([26]) })
    expect(of('block')(p)).toEqual([])
    expect(of('size')(p)).toMatchObject([{ worse: true }])
    expect(p.diffs.filter((d: { nearer: string }) => d.nearer === 'ruling')).toEqual([])
  })
  it("today borrowing past TeX's text block bottom is today's fault: v2's smaller size and fewer lines inside the room are not worse", () => {
    // (2608.16117v1 p23 t86: today's last line 12 pt past TeX's bottom, on the page number; v2 keeps the room, shrunk. The
    // coordinator's call of 2026-11-09 under the owner's ruling: the size and line count today bought with a line past TeX's
    // room are today's fault, never v2's)
    const f = para([[3, 60, 24]])
    const p = measure(f, sides(26, lines(10, 652, 640, 628), lines(9.5, 652)))
    expect(of('block')(p)).toMatchObject([{ worse: false, nearer: 'v2' }])
    expect(of('size')(p)).toMatchObject([{ worse: false, nearer: 'v2' }])
    expect(p.faults.size.today).toBe(1)
    expect(p.faults.size.todaySays[0]).toMatch(/past TeX's room/)
    // (its line count too: today its 4 lines, the last one 36 pt under its third, past the bottom at 640; v2 3 inside it)
    const t4 = [700, 688, 676, 628].map((y) => drawnLine(72, 300, y, 'x'.repeat(20), 10))
    const r = measure(f, sides(26, t4, lines(9.5).slice(0, 3)))
    expect(of('line-count')(r)).toMatchObject([{ worse: false, nearer: 'v2' }])
    expect(r.faults['line-count'].today).toBe(1)
    // (unless v2 breaks the room itself: judged as any)
    const q = measure(f, sides(26, lines(10, 652, 640, 628), lines(9.5, 652, 640, 628)))
    expect(of('size')(q)).toMatchObject([{ worse: true }])
  })
  it("judges TeX's room to the precision its facts are stated at, not a visible step: a line 1 pt past the bottom is past it", () => {
    // (2602.23285v2 p9 t90, 2608.16117v1 p28 t99: today's last line 1.0 and 1.05 pt under the original's, which stands on TeX's
    // text block bottom (depth 0); v2 keeps the bottom, a size smaller. The bottom and the baselines are written to the
    // hundredth, and the stated bottom sits on the lines TeX set on it within 0.05 pt: a point past it is past it)
    const f = para([[3, 60, 0]])
    const t = [700, 688, 676, 663].map((y) => drawnLine(72, 300, y, 'x'.repeat(20), 10))
    const p = measure(f, sides(26, t, lines(9.5)))
    expect(of('block')(p)).toMatchObject([{ worse: false, nearer: 'v2', today: { value: 1 }, v2: { value: 0 } }])
    expect(p.faults.block.todaySays[0]).toMatch(/1 pt past TeX's text block bottom/)
    expect(of('size')(p)).toMatchObject([{ worse: false, nearer: 'v2' }])
    // (a line on the bottom to the lay's own precision, 0.03 under it, is on it)
    const on = [700, 688, 676, 663.97].map((y) => drawnLine(72, 300, y, 'x'.repeat(20), 10))
    expect(of('block')(measure(f, sides(26, on, lines(9.5))))).toEqual([])
  })
  it('a line over the unit’s own lower lines in its column is not judged: no borrowing under its last line', () => {
    // (2608.16117v1 p17 t57: its first line a row's tail at 700, its other lines under a figure from 600; a translation laid on
    // from the unit before over the rows it left draws lines between the two, 30 pt under the tail, by more than the room the
    // part states under the tail (the figure's top 12 pt down): those are no line under its last, which the measure judges)
    const f = one(26, 'para', [factLine(72, 300, 700), ...[600, 588, 576].map((y) => factLine(72, 300, y))], {
      room: { runs: [[0, 12, 600], [3, 60, 24]], sep: 12 },
    })
    const v = [700, 670, 600, 588, 576].map((y) => drawnLine(72, 300, y, 'x'.repeat(20), 10))
    expect(of('block')(measure(f, sides(26, v, v)))).toEqual([])
    expect(measure(f, sides(26, v, v)).faults.block).toBeUndefined()
  })
  it('a part that states no room under the run: no line is judged', () => {
    const f = one(26, 'para', ys.map((y) => factLine(72, 300, y)))
    expect(of('block')(measure(f, sides(26, lines(10), lines(10, 652, 640, 628))))).toEqual([])
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
  // (what a side drew of an element drawn as text, read off its drawn lines (measure-dom: a line a baseline, `sz` its characters'
  // sizes where they take two or more): 2608.06701v1 p2 t14's \approach, "LIVEPLAN" in faked small capitals on A, "L" and "P" at
  // 9.96, "IVE" and "LAN" at 7.97; v2 draws it as text at those two sizes, today cuts it as a crop. Read without the drawing,
  // every element drawn as text whose glyphs on A take two sizes was set flat, v2's among them)
  const caps = [
    [300, 598, 306, 608, 600, 9.96, 0, 'L', 0],
    [306, 598, 318, 606, 600, 7.97, 0, 'IVE', 0],
    [318, 598, 324, 608, 600, 9.96, 0, 'P', 0],
    [324, 598, 337, 606, 600, 7.97, 0, 'LAN', 0],
  ]
  const capsEls = [['1', 'macro', [[300, 597, 337, 609, 600]], 1, 1, 0, 0]]
  const capsCrop = [crop(14, '1', [300, 597, 337, 609], [300, 597, 337, 609])]
  const drawnCaps = (sz?: number[][]) => [{ ...drawnLine(72, 400, 600, 'mit LIVEPLAN gelöst'), ...(sz ? { sz } : {}) }]
  it('an element in small capitals drawn as text at its two sizes, as A sets them: not set flat', () => {
    const fe = one(14, 'para', [factLine(72, 540, 600)], { els: capsEls })
    const v = drawnCaps([[5, 9.96], [3, 7.97], [1, 9.96], [3, 7.97], [7, 9.96]])
    const p = measure(fe, sides(14, l, v, { today: { crops: capsCrop }, original: { runs: caps, fonts: ['NimbusRomNo9L-Regu'] } }))
    expect(of('elements')(p)).toEqual([])
    expect(p.faults.elements).toBeUndefined()
  })
  it('the same element drawn as text at one size, or not found in the drawn text: set flat, worse as before', () => {
    const fe = one(14, 'para', [factLine(72, 540, 600)], { els: capsEls })
    const flat = measure(fe, sides(14, l, drawnCaps(), { today: { crops: capsCrop }, original: { runs: caps, fonts: ['NimbusRomNo9L-Regu'] } }))
    expect(of('elements')(flat)).toMatchObject([{ unit: 't14 para', worse: true, v2: { value: 'element 1: its scripts or sizes set flat as text' } }])
    const lost = measure(fe, sides(14, l, l, { today: { crops: capsCrop }, original: { runs: caps, fonts: ['NimbusRomNo9L-Regu'] } }))
    expect(of('elements')(lost)).toMatchObject([{ unit: 't14 para', worse: true }])
  })
  it("an element whose glyphs on A stand on two baselines, drawn with its raised glyphs a line of their own over the rest: not set flat", () => {
    // (\kmsMpc's "km s" and "Mpc" on 600, each "−1" raised 3.6 pt at 7.97 pt: drawn as "km s Mpc" with "−1 −1" a run raised over it)
    const runs = [
      [300, 598, 318, 608, 600, 10.91, 0, 'km s', 0],
      [318, 601.6, 326, 609.6, 603.6, 7.97, 0, '−1', 0],
      [328, 598, 348, 608, 600, 10.91, 0, 'Mpc', 0],
      [348, 601.6, 356, 609.6, 603.6, 7.97, 0, '−1', 0],
    ]
    const fe = one(6, 'para', [factLine(72, 540, 600)], { els: [['19', 'umacro', [[300, 597, 356, 610, 600]], 1, 1, 0, 0]] })
    const raised = [drawnLine(72, 400, 600, 'Wert 70 kms Mpc', 10.91), drawnLine(330, 380, 603.6, '−1 −1', 7.97)]
    const p = measure(fe, sides(6, l, raised, { today: { crops: [crop(6, '19', [300, 597, 356, 610], [300, 597, 356, 610])] }, original: { runs, fonts: ['CMR10'] } }))
    expect(of('elements')(p)).toEqual([])
  })
  it('a URL TeX broke over two lines, drawn as text by design, has no scripts to set flat (2608.16117 p34 t202, 2610.22065 p7 t126)', () => {
    // (\url{https://link.aps.org/doi/10.1103/PhysRevE.110.014502}: its glyphs on A at the end of one line and the start of the
    // next, two baselines 14.45 apart at one size; the typesetter draws a literal element over lines as its text, every \url's
    // so, and today its `url` element so too: two lines of a URL are no scripts on either side)
    const runs = [
      [360.66, 674.14, 532.92, 685.17, 676.88, 9.96, 0, 'https://link.aps.org/doi/', 0],
      [91.08, 659.71, 238.73, 670.73, 662.43, 9.96, 0, '10.1103/PhysRevE.110.014502', 0],
    ]
    const ink = [
      [360.66, 674.14, 532.92, 685.17, 676.88],
      [91.08, 659.71, 238.73, 670.73, 662.43],
    ]
    const lines = [factLine(79.37, 532.92, 676.88), factLine(91.08, 434.09, 662.43)]
    const ll = [drawnLine(79.37, 532.92, 676.88, 'x'.repeat(40)), drawnLine(91.08, 434.09, 662.43, 'x'.repeat(30))]
    const crop = (ord: number, b: number[]) => [ord, ...b.slice(0, 4), '38', ...b.slice(0, 4), N]
    // (v2: the literal element drawn as its text, today's a crop of each line)
    const fe = one(202, 'reference', lines, { els: [['38', 'other', ink, 2, 1, 0, 0, 1]] })
    const v2Text = measure(fe, sides(202, ll, ll, { today: { crops: ink.map((b) => crop(202, b)) }, original: { runs, fonts: ['CMTT10'] } }))
    expect(of('elements')(v2Text)).toEqual([])
    // (today: its `url` element drawn as its text, v2's a crop of each line)
    const prep = [{ ord: 202, kind: 'reference', elements: [{ k: 38, kind: 'url', flags: [], segs: ink.map(([x0, y0, x1, y1, base]) => ({ page: N, x0, x1, baseline: base, top: y1, bottom: y0 })) }] }]
    const todayText = measure(fe, sides(202, ll, ll, { v2: { crops: ink.map((b) => crop(202, b)) }, original: { runs, fonts: ['CMTT10'] } }), { prep })
    expect(of('elements')(todayText)).toEqual([])
  })
  it("an element of a formula's class with no ink on the page is drawn as nothing even with a text: its points' ink lost (2608.25210 p7)", () => {
    // (the algorithm's El 4, an \\If block: no ink in the part, its copy stated; today's reading lost its ink (LOST))
    const els = [['4', 'other', [], 0, 1, 0, 0]]
    const fe = one(156, 'para', [factLine(320, 540, 678)], { els })
    const prep = [{ ord: 156, kind: 'para', elements: [{ k: 4, kind: 'math', flags: ['LOST'], segs: [] }] }]
    const ll = [drawnLine(320, 400, 678, 'x'.repeat(10))]
    expect(of('elements')(measure(fe, sides(156, ll, ll), { prep }))).toMatchObject([{ unit: 't156 para', worse: true, v2: { value: 'element 4: drawn as nothing where TeX set ink its reading did not find' } }])
  })
  it("an element whose lost ink stands outside its unit's lines stays the original's in place: no element missing (2610.20484 p1)", () => {
    const els = [['2', 'macro', [], 0, 0, 0, 0]]
    const fe = one(6, 'para', [factLine(113.3, 300, 289.63)], { els })
    const prep = [{ ord: 6, kind: 'para', elements: [{ k: 2, kind: 'macro', flags: ['LOST', 'OUTSIDE'], segs: [] }] }]
    const ll = [drawnLine(113.3, 300, 289.63, 'x'.repeat(10))]
    expect(of('elements')(measure(fe, sides(6, ll, ll), { prep }))).toEqual([])
  })
  it("an element drawn as nothing where TeX set ink (today's reading found it on the page): worse", () => {
    // (2610.21312 p2 t9: El 13 "d/n = 0.191" with no ink on p2 in v2's part, today's segment on p2)
    const els = [['13', 'other', [], 0, 0, 0, 0]]
    const fe = one(9, 'para', [factLine(101.3, 540, 600)], { els })
    const prep = [{ ord: 9, kind: 'para', elements: [{ k: 13, kind: 'math', flags: [], segs: [{ page: N, x0: 48.96, x1: 101.26, baseline: 600, top: 608, bottom: 598 }] }] }]
    const ll = [drawnLine(48.96, 400, 600, 'x'.repeat(20))]
    expect(of('elements')(measure(fe, sides(9, ll, ll), { prep }))).toMatchObject([{ unit: 't9 para', worse: true, v2: { value: 'element 13: drawn as nothing where TeX set ink' } }])
  })
  it("today's element of v2's is the one of its source where the two units' pieces were numbered otherwise: none missing (1810.04805 p4 t47)", () => {
    // (round 8 B8: today's t47 holds `\%` placeholders v2 writes as text (lane style-wire, (o)), so v2's piece 62 is the
    // \citet whose ink is on p5 and today's piece 62 a \ref on p4; read by its id, the cite was "drawn as nothing" on p4. By its
    // source, today's \citet is piece 66, on p5: nothing missing on p4. The \ref, v2's 58, keeps its own: drawn as nothing it is
    // missing still)
    const els = [
      ['58', 'ref', [], 0, 1, 0, 0, 0, '\\ref{sec:task_ablation}'],
      ['62', 'cite', [], 1, 1, 0, 0, 0, '\\citet{DBLP:journals/corr/JerniteBS17}'],
    ]
    const fe = one(47, 'para', [factLine(310, 540, 348.84)], { els })
    const seg = (page: number) => [{ page, x0: 320, x1: 360, baseline: 348.84, top: 356, bottom: 346 }]
    const pieces = [
      { k: 21, kind: 'ph', src: '\\%' },
      { k: 62, kind: 'ph', src: '\\ref{sec:task_ablation}' },
      { k: 66, kind: 'ph', src: '\\citet{DBLP:journals/corr/JerniteBS17}' },
    ]
    const prep = [{ ord: 47, kind: 'para', pieces, elements: [{ k: 62, kind: 'ref', flags: [], segs: seg(N) }, { k: 66, kind: 'cite', flags: [], segs: seg(N + 1) }] }]
    const ll = [drawnLine(310, 400, 348.84, 'x'.repeat(20))]
    expect(of('elements')(measure(fe, sides(47, ll, ll), { prep }))).toMatchObject([{ unit: 't47 para', worse: true, v2: { value: 'element 58: drawn as nothing where TeX set ink', off: 1 } }])
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
  it("a group today's decision kept whole, handed to v2 as rows already decided and drawn the same: not exercised, never worse", () => {
    // (the stored rows hold no translation for a group today kept, so v2's own decision cannot be exercised on it: recorded
    // apart, as the ruling's are)
    const r = rec({})
    const p = measure(v2Of({ members: [], facts: [] }), r, { prep, groups, keptByGroup: new Set([118, 121]) })
    expect(of('groups')(p)).toMatchObject([{ unit: 'group 3:h', worse: false, nearer: 'unexercised', v2: { value: '2 cells undecided' } }])
    expect(p.worse).toBe(0)
  })
  it('a group both sides draw the same, kept on both or translated on both, is no difference', () => {
    const cells = (s: string) => [118, 119, 120, 121].map((id, i) => ({ id, lines: [drawnLine(370 + 35 * i, 390 + 35 * i, 653, s, 9.96)] }))
    const v2 = v2Of({ members: [118, 119, 120, 121].map((o) => laid(o)), facts: [], today: Object.fromEntries([118, 119, 120, 121].map((o) => [o, { today: o }])) })
    const both = rec({ today: { units: cells('\u8bad\u7ec3') }, v2: { units: cells('\u8bad\u7ec3') } })
    expect(of('groups')(measure(v2, both, { prep, groups }))).toEqual([])
    expect(of('groups')(measure(v2Of({ members: [], facts: [] }), rec({}), { prep, groups }))).toEqual([])
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

describe("weight of a figure's texts: their darkness over each drawing's own regular weight, against the original's (2608.25210v2 p2)", () => {
  // (three figure texts on A: 50 set bold, a lead-in; 51 and 52 regular. A translation's script is lighter than A's at a size,
  // whatever its weight: the texts A sets regular and both draw regular read 0.59 on A and 0.44 drawn. Today draws 51 bold as well,
  // v2 draws 50 bold and the others regular: read against A's darkness, today's darker drawing was the nearer)
  const box = (x: number) => [x, 298, x + 40, 306]
  const facts = [50, 51, 52].map((ord, i) => ({ ord, kind: 'figure', align: 'l', style: { size: 8 }, lines: [factLine(100 + 60 * i, 140 + 60 * i, 300, 8)] }))
  const prep = [90, 91, 92].map((ord, i) => ({ ord, kind: 'figure', lines: [{ page: N, x0: 100 + 60 * i, x1: 140 + 60 * i, baseline: 300, top: 306.4, bottom: 298.4, size: 8 }] }))
  const v2 = v2Of({ members: [50, 51, 52].map((o) => ({ ord: o, state: 'laid', lines: [] })), facts })
  const runs = [0, 1, 2].map((i) => [...box(100 + 60 * i), 300, 8, i === 0 ? 0 : 1, 'xxxx', 0])
  // (the drawings in another script than A's, as a Chinese target's: Greek letters here)
  const drawnFig = (i: number, bold: boolean) => [{ ...drawnLine(100 + 60 * i, 140 + 60 * i, 300, '\u03b1\u03b2\u03b3\u03b4', 8), bold: bold ? 4 : 0 }]
  const dark = (mean: number) => ({ mean, pixels: 600 })
  const page = (t: [number, boolean][], v: [number, boolean][]) =>
    measure(
      v2,
      rec({
        today: { figures: t.map(([, b], i) => ({ id: `f${i}`, lines: drawnFig(i, b) })) },
        v2: { units: v.map(([, b], i) => ({ id: 50 + i, lines: drawnFig(i, b) })) },
        original: { runs, fonts: ['ABCDEF+LMSans10-Bold', 'ABCDEF+LMSans10-Regular'] },
        px: fid({
          dark: { today: Object.fromEntries(t.map(([m], i) => [`f:f${i}`, dark(m)])), v2: Object.fromEntries(v.map(([m], i) => [`p:${50 + i}`, dark(m)])) },
          orig: { 'p:50': dark(0.67), 'p:51': dark(0.6), 'p:52': dark(0.59) },
        }),
      }),
      { prep },
    )
  const weights = (p: { diffs: { flag: string; unit: string; worse: boolean; nearer: string }[] }) => p.diffs.filter((d) => d.flag === 'weight' && d.unit === 'figures').map((d) => [d.worse, d.nearer])
  it("today drawing a regular text bold is farther in weight than v2 drawing each at the original's: v2 nearer, not worse", () => {
    expect(weights(page([[0.55, true], [0.55, true], [0.44, false]], [[0.55, true], [0.44, false], [0.44, false]]))).toEqual([[false, 'v2']])
  })
  it('a text the original sets bold drawn regular by v2, bold by today: worse, as before', () => {
    expect(weights(page([[0.55, true], [0.44, false], [0.44, false]], [[0.44, false], [0.44, false], [0.44, false]]))).toEqual([[true, 'today']])
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

describe("style: a unit's share read over the pages it spans (the paper's pass)", () => {
  // (2610.20484v1 t62, a theorem in italics over pages 6 and 7: its equation number "(8)" is upright on A, on page 7; v2's
  // shorter translation draws it, upright, on page 6, where the original's one line is all italic: page 6 alone read v2's
  // share 0.81 against the original's 1, a style lost; over both pages each side and the original stand at about 0.99)
  type D = { flag: string; unit: string; st?: string; worse: boolean; nearer: string; original: unknown; today: { value: unknown; off: number }; v2: { value: unknown; off: number } }
  type Page = { page: number; worse: number; diffs: D[]; units: object[] }
  const recount = (p: Page) => {
    p.worse = p.diffs.filter((d) => d.worse).length
  }
  const side = (chars: number, italic: number, bold = 0) => ({ chars, italic, bold })
  const unit = (today: object, v2: object, orig: object) => ({ key: 't62', kind: 'theorem', sides: { today, v2 }, orig })
  const italicDiff = (t: number, v: number, o: number): D => ({ flag: 'style', unit: 't62 theorem', st: 'italic', worse: v > t, nearer: v > t ? 'today' : 'v2', original: 1, today: { value: o - t, off: t }, v2: { value: o - v, off: v } })
  it("v2 drawing on one page a word the original sets on the next: judged over both, no difference", () => {
    const pages: Page[] = [
      { page: 6, worse: 1, diffs: [italicDiff(0, 0.19, 1)], units: [unit(side(5, 5), side(16, 13), { chars: 16, bold: 0, italic: 1 })] },
      { page: 7, worse: 0, diffs: [], units: [unit(side(219, 219), side(208, 208), { chars: 420, bold: 0, italic: 417 / 420 })] },
    ]
    stylePass(pages, recount)
    expect(pages.map((p) => p.diffs.filter((d) => d.flag === 'style'))).toEqual([[], []])
    expect(pages[0]!.worse).toBe(0)
  })
  it('v2 setting a third of a unit bold over its two pages where the original and today set none: worse, as before', () => {
    const boldDiff: D = { flag: 'style', unit: 't62 theorem', st: 'bold', worse: true, nearer: 'today', original: 0, today: { value: 0, off: 0 }, v2: { value: 0.33, off: 0.33 } }
    const pages: Page[] = [
      { page: 6, worse: 1, diffs: [boldDiff], units: [unit(side(30, 0), side(30, 0, 10), { chars: 30, bold: 0, italic: 0 })] },
      { page: 7, worse: 0, diffs: [], units: [unit(side(200, 0), side(200, 0, 60), { chars: 200, bold: 0, italic: 0 })] },
    ]
    stylePass(pages, recount)
    expect(pages[0]!.diffs).toMatchObject([{ flag: 'style', worse: true, nearer: 'today', v2: { value: 0.3 } }])
  })
})

describe("a unit's size today bought past TeX's room on one page is today's fault on every page of it (the paper's pass)", () => {
  // (2608.16117v1 t86: today's line past TeX's text block bottom on page 23, its one size on pages 23 to 25: v2's smaller
  // size inside the room is no worse on page 25 than on page 23)
  type Page = { page: number; worse: number; diffs: { flag: string; unit?: string; worse: boolean; nearer?: string }[]; faults: Record<string, { today: number; v2: number; todaySays: string[]; v2Says: string[] }>; pastRoom?: { today: string[]; v2: string[] } }
  const recount = (p: Page) => {
    p.worse = p.diffs.filter((d) => d.worse).length
  }
  const size = (unit: string) => ({ flag: 'size', unit, worse: true, nearer: 'today' })
  it('converts the size on the unit’s other pages, unless v2 breaks the room on any of them', () => {
    const pages: Page[] = [
      { page: 23, worse: 0, diffs: [], faults: {}, pastRoom: { today: ['t86'], v2: [] } },
      { page: 25, worse: 2, diffs: [size('t86 para'), size('t90 para')], faults: {}, pastRoom: { today: [], v2: [] } },
    ]
    pastRoomPass(pages, recount)
    expect(pages[1]!.diffs).toMatchObject([{ unit: 't86 para', worse: false, nearer: 'v2' }, { unit: 't90 para', worse: true }])
    expect(pages[1]!.worse).toBe(1)
    expect(pages[1]!.faults.size!.today).toBe(1)
    const broken: Page[] = [
      { page: 23, worse: 0, diffs: [], faults: {}, pastRoom: { today: ['t86'], v2: ['t86'] } },
      { page: 25, worse: 1, diffs: [size('t86 para')], faults: {}, pastRoom: { today: [], v2: [] } },
    ]
    pastRoomPass(broken, recount)
    expect(broken[1]!.diffs).toMatchObject([{ worse: true }])
  })
})

describe("line-count: a unit a line shorter where a URL's line ends are joins (the coordinator's ruling of 2026-11-10, url-join)", () => {
  // (1810.04805v2-zh p14 t237: a paragraph holding two URLs TeX broke over lines; the engine reads each line end inside one as a
  // join, and the paragraph's translation takes a line fewer than today's, 5 for 6, the original's 7. A count is the ruling's
  // only where the pair laid with those line ends read as spaces again, v2.mjs's lay over unjoin.mjs, `unjoined`, sets today's
  // count on the page)
  type Diff = { unit: string; worse: boolean; nearer: string }
  const counts = (p: { diffs: { flag: string }[] }) => (of('line-count')(p) as unknown as Diff[]).map((d) => [d.unit, d.worse, d.nearer])
  const ys = Array.from({ length: 7 }, (_, i) => 700 - 12 * i)
  const facts = [{ ord: 237, kind: 'para', align: 'j', style: { size: 10 }, lines: ys.map((y) => factLine(72, 300, y)) }]
  const laidK = (k: number) => ({ ord: 237, state: 'laid', lines: ys.slice(0, k).map((y) => [y, 72, 300, []]), lit: { left: [], right: [], own: [] } })
  const drawn = (k: number) => ys.slice(0, k).map((y) => drawnLine(72, 300, y, 'x'.repeat(20)))
  /** the original's 7 lines, today's 6, v2's 5; `unjoined`: v2's count with the URLs' line ends read as spaces, none unrecorded */
  const page = (unjoined?: number) => {
    const v2 = Object.assign(
      v2Of({ members: [laidK(5)], facts, today: { 237: { today: 237 } } }),
      unjoined === undefined ? {} : { unjoined: { [N]: { 237: unjoined } } },
    )
    return measure(v2, sides(237, drawn(6), drawn(5)))
  }
  it("v2's count other than today's where the line ends read as spaces give today's: the ruling's, not worse", () => {
    expect(counts(page(6))).toEqual([['t237 para', false, 'ruling']])
  })
  it("the line ends read as spaces giving v2's own count (the joins not its cause): worse", () => {
    expect(counts(page(5))).toEqual([['t237 para', true, 'today']])
  })
  it('no lay with the line ends read as spaces recorded: worse', () => {
    expect(counts(page())).toEqual([['t237 para', true, 'today']])
  })
})

describe("lead: a paragraph set tighter than the original's leading while its block has room (1810.04805 p8, 2010.11929 p5)", () => {
  // (a paragraph of 4 lines on A at 10 pt, 12 pt apart; each side lays 3 lines at 10 pt: today 12 apart, v2 10 apart, its last
  // line 16 pt over the original's last, a line and more of room left)
  const f = one(140, 'para', [700, 688, 676, 664].map((y) => factLine(72, 300, y)))
  const at = (pitch: number) => [0, 1, 2].map((i) => drawnLine(72, 300, 700 - pitch * i, 'x'.repeat(20)))
  it('v2 tighter than the original where today keeps its leading: worse', () => {
    expect(of('lead')(measure(f, sides(140, at(12), at(10))))).toMatchObject([{ unit: 't140 para', worse: true }])
  })
  it("reads the original's leading as TeX's \\baselineskip where the part states it, not a gap TeX's \\lineskip rule opened", () => {
    // (2610.40645v1 p10 t66: its lines 13.54 and 15.70 apart, the second gap TeX's push under a tall formula, its \baselineskip
    // 13.55; the median of its gaps read 15.70 as its leading, and v2's lines 14.64 apart, looser than TeX's pitch, were judged
    // tighter. Here 12, 16 and 16 apart, \baselineskip 12 (Placed.lead, no 'lead' read): v2's three lines 13 apart, a line of
    // room under them, are no fault; read off the lines, they are)
    const lines = [700, 688, 672, 656].map((y) => factLine(72, 300, y))
    const three = (pitch: number) => [0, 1, 2].map((i) => drawnLine(72, 300, 700 - pitch * i, 'x'.repeat(20)))
    const stated = v2Of({ members: [laid(141)], facts: [{ ord: 141, kind: 'para', align: 'j', style: { size: 10 }, lines, pitch: 12 }], today: { 141: { today: 141 } } })
    expect(of('lead')(measure(stated, sides(141, three(16), three(13))))).toEqual([])
    expect(of('lead')(measure(one(141, 'para', lines), sides(141, three(16), three(13))))).toMatchObject([{ unit: 't141 para', worse: true }])
  })
  it('a paragraph tightened to fit a block it fills is no fault', () => {
    // (4 lines on each side: v2's at 11 apart end at 667, within a line of the original's last)
    const four = (pitch: number) => [0, 1, 2, 3].map((i) => drawnLine(72, 300, 700 - pitch * i, 'x'.repeat(20)))
    expect(of('lead')(measure(f, sides(140, four(12), four(11))))).toEqual([])
  })
  it("reads the original's size over the lines the unit lays, not a kept element's lines at their own size (2608.25210 p3 t55)", () => {
    // (round 8 B8: t55's description, two lines at 8.97 pt 10.8 apart, over a prompt box b5-fixes keeps as the original's ink,
    // nine lines of it at 7.97 pt; v2 lays the description alone at 8.97 and 10.8 apart, as the original sets it. Read over every
    // line, the original's size was the box's 7.97, so v2's leading 10.8 / 8.97 read tighter than 10.8 / 7.97, with the box's
    // lines as its room. Here two lines at 9 pt and four kept lines at 8 pt, TeX's \baselineskip 10.8)
    const text = [700, 689.2].map((y) => factLine(320, 550, y, 9))
    const box = [674, 664.2, 654.4, 644.6].map((y) => factLine(326, 550, y, 8))
    const kept = [['14', 'display', box.map((l) => [326, (l[6] as number) - 0.2, 550, (l[5] as number) + 0.2, l[4]]), 4, 1, 0, 1]]
    const v = v2Of({ members: [laid(55)], facts: [{ ord: 55, kind: 'para', align: 'j', style: { size: 9 }, lines: [...text, ...box], pitch: 10.8, els: kept }], today: { 55: { today: 55 } } })
    const two = [700, 689.2].map((y) => drawnLine(320, 550, y, 'x'.repeat(30), 9))
    const translatedBox = [700, 689.2, 678.4, 667.6, 656.8, 646].map((y) => drawnLine(320, 550, y, 'x'.repeat(30), 8))
    expect(of('lead')(measure(v, sides(55, translatedBox, two)))).toEqual([])
  })
})

describe("a unit today laid with a borrowed line is judged as any (the borrowing ruling of 2026-11-08 replaced no-borrowing's)", () => {
  // (a paragraph of 4 lines on A, 700 to 664 at 10 pt; today, its ledger says, laid it with a borrowed line in a round of its
  // page's fill; v2 4 lines at 9.4 pt from 2 pt under the original's first baseline: its size and anchor worse, as before the
  // no-borrowing ruling)
  const f = one(26, 'para', [700, 688, 676, 664].map((y) => factLine(72, 300, y)))
  const t = [700, 688, 676, 664].map((y) => drawnLine(72, 300, y, 'x'.repeat(20), 10)),
    v = [698, 686.7, 675.4, 664.1].map((y) => drawnLine(72, 300, y, 'x'.repeat(20), 9.4))
  it("v2's smaller size and its other anchor stay worse whatever today's ledger says", () => {
    const p = measure(f, sides(26, t, v), { ruled: new Set([26]) })
    expect(p.diffs.filter((d: { worse: boolean }) => d.worse).map((d: { flag: string }) => d.flag)).toEqual(expect.arrayContaining(['size', 'anchor']))
    expect(p.diffs.filter((d: { nearer: string }) => d.nearer === 'ruling')).toEqual([])
  })
})

describe("hl-sentence's page placement on a unit today laid with a borrowed line, judged as any", () => {
  // (a paragraph of 3 sentences on 4 lines, today lighting it by sentence: on arXiv's page each sentence a line's box; as drawn,
  // today's sentence 3 on the next page (its borrowed line moved it), v2's on this one)
  const lines = [700, 688, 676, 664].map((y) => drawnLine(72, 300, y, 'x'.repeat(20)))
  const box = (y: number) => [71, y - 3, 301, y + 9]
  const leftBy = [[box(700)], [box(688)], [box(676), box(664)]]
  const page = () =>
    rec({
      today: { units: [{ id: 26, lines }], lit: [26], litBoxes: { 26: { right: lines.map((l) => box(l.y)), left: lines.map((l) => box(l.y)), by: true, leftBy, rightBy: [[box(700)], [box(688), box(676), box(664)], []] } } },
      v2: { units: [{ id: 26, lines }], lit: [26] },
    })
  const v2With = (right: number[][][], left = leftBy) => v2Of({ members: [laid(26, { left, right })], facts: [{ ord: 26, kind: 'para', align: 'j', style: { size: 10 }, lines: [700, 688, 676, 664].map((y) => factLine(72, 300, y)) }], today: { 26: { today: 26 } } })
  const sentences = (p: { diffs: { what: string; worse: boolean; nearer: string }[] }) => p.diffs.filter((d) => /sentences paired one by one/.test(d.what))
  const placed = [[box(700)], [box(688), box(676)], [box(664)]]
  it('a sentence v2 draws on this page that today drew on the next is no difference: which page holds it is the layout\'s', () => {
    // (hl-sentence's 15dbb0f91: as drawn, v2 is judged on lighting the unit on a page where today does, not on which of its
    // sentences the page holds; rc-gate's 41f28ebf2 made this the ruling's, which it no longer needs to be)
    expect(sentences(measure(v2With(placed), page()))).toEqual([])
    expect(sentences(measure(v2With(placed), page(), { ruled: new Set([26]) }))).toEqual([])
  })
  it('v2 lighting nothing of the unit as drawn on a page today lights it is worse, wherever today borrowed', () => {
    // (its translation a reflow moved off this page: no ruling excuses it now, 2026-11-08)
    const none = [[], [], []]
    expect(sentences(measure(v2With(none), page()))).toMatchObject([{ worse: true }])
    expect(sentences(measure(v2With(none), page(), { ruled: new Set([26]) }))).toMatchObject([{ worse: true }])
  })
  it('the granularity stays judged: v2 lighting the unit whole is worse whatever today borrowed', () => {
    const whole = [[box(700), box(688), box(676), box(664)]]
    expect(sentences(measure(v2With(whole, [leftBy.flat()]), page(), { ruled: new Set([26]) }))).toMatchObject([{ worse: true }])
  })
})

describe("anchor: a paragraph under another's last line alone at its column's top starts lower by the gap it lacks (the owner's ruling of 2026-11-09)", () => {
  // (2610.20967v1-zh p4: t79 over the foot of the left column, its last line alone at the top of the right (TeX's widow), t85 a
  // pitch under it. v2 sets t79's left frame at its own leading, 18 a line here, and t85 lower by what the gap under t79's last
  // line lacks to that leading, 18 - 12 = 6; today keeps t85 on TeX's baseline. The owner, 2026-11-09: as recommended)
  const col1 = (ys: number[]) => ys.map((y) => factLine(54, 298, y))
  const col2 = (ys: number[]) => ys.map((y) => factLine(315, 558, y))
  type At = [y: number, x0: number, x1: number]
  const laidAt = (ord: number, ls: At[]) => ({ ord, state: 'laid', lines: ls.map(([y, x0, x1]) => [y, x0, x1, []]), lit: { left: [], right: [], own: [] } })
  const drawn = (ls: At[]) => ls.map(([y, x0, x1]) => drawnLine(x0, x1, y, 'x'.repeat(20)))
  /** t79's lines in the right column (its last at the column's top), t85 a pitch under its last, set `drop` lower by v2 */
  const page = (o: { upper?: number[]; drop?: number } = {}) => {
    const upper = o.upper ?? [400]
    const drop = o.drop ?? 6
    const q0 = upper.at(-1)! - 12
    const facts = [
      { ord: 79, kind: 'para', align: 'j', style: { size: 10 }, lines: [...col1([180, 168, 156, 144, 132]), ...col2(upper)] },
      { ord: 85, kind: 'para', align: 'j', style: { size: 10 }, lines: col2([q0, q0 - 12, q0 - 24, q0 - 36]) },
    ]
    const u: At[] = [[180, 54, 298], [162, 54, 298], [144, 54, 298], ...upper.map((y): At => [y, 315, 558])]
    const qT: At[] = [[q0, 330, 558], [q0 - 18, 315, 558]]
    const qV: At[] = [[q0 - drop, 330, 558], [q0 - drop - 18, 315, 558]]
    const v2 = v2Of({ members: [laidAt(79, u), laidAt(85, qV)], facts, today: { 79: { today: 79 }, 85: { today: 85 } } })
    const r = rec({
      today: { units: [{ id: 79, lines: drawn(u) }, { id: 85, lines: drawn(qT) }] },
      v2: { units: [{ id: 79, lines: drawn(u) }, { id: 85, lines: drawn(qV) }] },
    })
    return measure(v2, r)
  }
  type Diff = { unit: string; worse: boolean; nearer: string }
  const anchors = (p: ReturnType<typeof page>) => (of('anchor')(p) as unknown as Diff[]).map((d) => [d.unit, d.worse, d.nearer])
  it("v2's first line lower by what the gap under the line over it lacks: the ruling's, not worse", () => {
    expect(anchors(page())).toEqual([['t85 para', false, 'ruling']])
  })
  it('lower than the gap asks: worse', () => {
    expect(anchors(page({ drop: 9 }))).toEqual([['t85 para', true, 'today']])
  })
  it('the line over it no widow (two lines of its paragraph in that column): worse', () => {
    expect(anchors(page({ upper: [412, 400] }))).toEqual([['t85 para', true, 'today']])
  })
})

describe("line-count: the owner's ruling of 2026-11-10 (option (i), the frames' share bounded by the band, the borrowers voting)", () => {
  // (1512.03385v1-zh p7/p8 t153: TeX set 8 of its 10 lines on p7 and 2 on p8; v2's translation is 8 lines, 6 + 2, TeX's share
  // (8 x 8/10 = 6.4, 6); today's 7 + 1. On p7 v2 is a line further from the original's 8 than today's 7)
  type Diff = { unit: string; worse: boolean; nearer: string }
  const counts = (p: { diffs: { flag: string }[] }) => (of('line-count')(p) as unknown as Diff[]).map((d) => [d.unit, d.worse, d.nearer])
  const laidN = (ord: number, k: number, y0 = 700, o: object = {}) => ({ ord, state: 'laid', lines: Array.from({ length: k }, (_, i) => [y0 - 15 * i, 72, 300, []]), lit: { left: [], right: [], own: [] }, ...o })
  const drawnN = (k: number, y0 = 700) => Array.from({ length: k }, (_, i) => drawnLine(72, 300, y0 - 15 * i, 'x'.repeat(20)))
  /** page N measured, and the paper's pass over it and page N + 1 as each side drew the unit there (`todayNext` lines today) */
  const split = (onPage: number, next: number, todayOn = 7, todayNext = 1) => {
    const facts = [{ ord: 153, kind: 'para', align: 'j', style: { size: 10 }, lines: [...Array.from({ length: 8 }, (_, i) => factLine(72, 300, 700 - 12 * i)), [N + 1, 0, 72, 300, 700, 708, 698, 48, 300, 0, 10], [N + 1, 0, 72, 300, 688, 696, 686, 48, 300, 0, 10]] }]
    const v2 = v2Of({ members: [laidN(153, onPage)], facts, today: { 153: { today: 153 } }, more: { [N + 1]: [laidN(153, next)] } })
    const p = measure(v2, sides(153, drawnN(todayOn), drawnN(onPage)))
    const after = { diffs: [], units: [{ key: 't153', sides: { today: { lines: todayNext }, v2: { lines: next } } }] }
    sharePass([p, after], recount)
    return p
  }
  it("v2's lines on the page TeX's share of them, the same lines in all: the ruling's, not worse", () => {
    expect(counts(split(6, 2))).toEqual([['t153 para', false, 'ruling']])
  })
  it('a count that is not the share, or the same share of more or fewer lines than today sets: judged, worse', () => {
    expect(counts(split(5, 3))).toEqual([['t153 para', true, 'today']])
    expect(counts(split(6, 2, 7, 2))).toEqual([['t153 para', true, 'today']])
  })
  // (2610.20484v1-zh p8 t85: the pass's target 1.45 with the paragraphs that borrow room voting the leadings option (i) gave them,
  // 1.30 where the pair is laid without (i); t85, which does not borrow, its fill leading 1.6, set at the band's top over the
  // target, 1.50, 12 lines where without (i) it set 13 at 1.35, as today's, and TeX 19)
  const band = (o: { lead?: number; borrows?: number; before?: number; offLines?: number } = {}) => {
    const facts = [{ ord: 85, kind: 'para', align: 'j', style: { size: 10 }, lines: Array.from({ length: 19 }, (_, i) => factLine(72, 300, 700 - 12 * i)) }]
    const fills = { [N]: { target: 1.45, band: 0.05, units: { 85: [1.6, o.borrows ?? 0], 80: [1.3, 1] } } }
    const v2 = {
      ...v2Of({ members: [laidN(85, 12, 700, { fit: { size: 10, lead: o.lead ?? 1.5, track: 0, borrowed: 0 } })], facts, today: { 85: { today: 85 } }, fills }),
      before: { [N]: { target: o.before ?? 1.3, lines: { 85: o.offLines ?? 13 } } },
    }
    return measure(v2, sides(85, drawnN(13), drawnN(12)))
  }
  it('a paragraph at the band over a target the borrowing paragraphs moved by (i), held otherwise at their leadings before: the ruling\'s', () => {
    expect(counts(band())).toEqual([['t85 para', false, 'ruling']])
  })
  it('the target the same without (i), the paragraph borrowing itself, not at the band, or its count the same without (i): judged', () => {
    expect(counts(band({ before: 1.45 }))).toEqual([['t85 para', true, 'today']])
    expect(counts(band({ borrows: 1 }))).toEqual([['t85 para', true, 'today']])
    expect(counts(band({ lead: 1.4 }))).toEqual([['t85 para', true, 'today']])
    // (its line count the same without (i): the count not the band's (2610.40645v1-ja p32 t271, 5 lines at 1.19 and at 1.23))
    expect(counts(band({ offLines: 12 }))).toEqual([['t85 para', true, 'today']])
  })
})

describe("line-count: a unit a line shorter by the spaces beside a full-width mark (the coordinator's ruling of 2026-11-10)", () => {
  // (2610.30034v1-zh p3 t36: B.tokens sets no space beside a full-width mark's blank side, xeCJK's rule, and the paragraph's text
  // takes a line fewer than today's, the line it saves a lone character; the coordinator: "the parity's line-count measure is only
  // an instrument, so I accept them". A count is the ruling's only where the pair laid with those spaces put back, v2.mjs's first
  // lay, `spaced`, sets today's count on the page)
  const ys = [700, 688, 676, 664]
  const facts = [{ ord: 36, kind: 'para', align: 'j', style: { size: 10 }, lines: ys.map((y) => factLine(72, 300, y)) }]
  const laidAt = (ord: number, k: number) => ({ ord, state: 'laid', lines: ys.slice(0, k).map((y) => [y, 72, 300, []]), lit: { left: [], right: [], own: [] } })
  const drawn = (k: number) => ys.slice(0, k).map((y) => drawnLine(72, 300, y, 'x'.repeat(20)))
  /** the original's 4 lines, today's 3, v2's 2; `spaced`: v2's count with the spaces put back, none where not recorded */
  const page = (spaced?: number) =>
    measure(
      v2Of({ members: [laidAt(36, 2)], facts, today: { 36: { today: 36 } }, ...(spaced === undefined ? {} : { spaced: { 36: spaced } }) }),
      rec({ today: { units: [{ id: 36, lines: drawn(3) }] }, v2: { units: [{ id: 36, lines: drawn(2) }] } }),
    )
  type Diff = { unit: string; worse: boolean; nearer: string }
  const counts = (p: ReturnType<typeof page>) => (of('line-count')(p) as unknown as Diff[]).map((d) => [d.unit, d.worse, d.nearer])
  it("v2's count other than today's where the spaces put back give today's: the ruling's, not worse", () => {
    expect(counts(page(3))).toEqual([['t36 para', false, 'ruling']])
  })
  it("the spaces put back giving v2's own count (the rule not its cause): worse", () => {
    expect(counts(page(2))).toEqual([['t36 para', true, 'today']])
  })
  it('no lay with the spaces put back recorded: worse', () => {
    expect(counts(page())).toEqual([['t36 para', true, 'today']])
  })
})

describe("groups: a cell kept by a rule's mark, or one no row can serve, holds no group's state (the coordinator's rulings of 2026-11-10)", () => {
  // (2608.25210v2 Table 2: its cells of identifiers alone no unit of v2's, today's units stated so (`keptToday`); the others
  // translated on both sides. The group is judged on the cells both sides could translate)
  const cell = (ord: number, x0: number) => ({ ord, kind: 'cell', text: ['response', 'equal', 'human', 'example'][ord - 70], lines: [{ page: N, x0, x1: x0 + 20, baseline: 653, top: 660, bottom: 651, size: 9.96 }] })
  const prep = [cell(70, 370), cell(71, 405), cell(72, 440), cell(73, 480)]
  const groups = [{ group: '2:1', ids: [70, 71, 72, 73] }]
  const drawn = (ids: number[]) => ids.map((id, i) => ({ id, lines: [drawnLine(370 + 35 * i, 390 + 35 * i, 653, '\u8bad\u7ec3', 9.96)] }))
  const page = (marks: object) => {
    // (73 left the original's for want of a row, `none`)
    const members = [...[70, 71, 72].map((o) => laid(o)), { ord: 73, state: 'none', lines: [] }]
    const v2 = { ...v2Of({ members, facts: [], today: Object.fromEntries([70, 71, 72, 73].map((o) => [o, { today: o }])) }), ...marks }
    return measure(v2, rec({ today: { units: drawn([70, 71, 72, 73]) }, v2: { units: drawn([70, 71]) } }), { prep, groups })
  }
  it('mixed on v2 only by the cells a mark keeps or no row serves: no difference', () => {
    expect(of('groups')(page({ keptToday: [[72, 'identifier'], [73, 'identifier']] }))).toEqual([])
    expect(of('groups')(page({ identifier: [72], noRow: [73] }))).toEqual([])
  })
  it('mixed by any other cell: worse, as before', () => {
    expect(of('groups')(page({ keptToday: [[72, 'identifier']] }))).toMatchObject([{ unit: 'group 2:1', worse: true }])
  })
})

describe("frame: a cell's room is what the recorded rule gives it (PDF-READER §18.13; gate correction 16)", () => {
  // (1810.04805v2-zh p7 t129 "Dev": a centred \multicolumn header, its advances 443.39-458.11, the glyphs beside it ending at
  // 376.15 and starting at 465.58 (Room.side); v2's three characters at 7.62 pt (0.85 of 8.97) drawn 439.66-462.08: clipped at the floor
  // 0.8 in its own advances, widened half way to the glyph beside it, centred: its room 439.655-461.845)
  const facts = { ord: 129, kind: 'cell', align: 'c', style: { size: 8.97 }, lines: [[N, 1, 443.39, 458.11, 768.18, 774.12, 768.06, 307.28, 525.54, 0, 8.97]] }
  const v2 = v2Of({ members: [laid(129)], facts: [facts], today: { 129: { today: 129 } } })
  const page = (x0: number, x1: number, size: number, o: { side?: number[]; floor?: number } = {}) =>
    measure(v2, rec({ v2: { units: [{ id: 129, lines: [drawnLine(x0, x1, 768.18, '\u5f00\u53d1\u8005', size)] }] } }), {
      cellRooms: new Map([[129, { side: o.side ?? [376.15, 465.58], wall: 0 }]]),
      floor: o.floor ?? 0.8,
    })
  const frames = (p: { faults: { frame?: { v2: number } } }) => p.faults.frame?.v2 ?? 0
  it('a cell clipped at the floor in its own advances, drawn inside the half-way room: no line past its room', () => {
    expect(frames(page(439.66, 462.08, 7.62))).toBe(0)
  })
  it("one past the half-way room, or one drawn past its advances whose text fits them at the floor (widened above the floor): past its room", () => {
    // (centred 434-467: 5.2 pt past the half-way room's right edge)
    expect(frames(page(434, 467, 7.62))).toBe(1)
    // (a 14 pt line at 8.97 drawn 441-455 or 440-455: at the floor 11.2 wide, inside its 14.72 of advances: not widened, 2.4 and 3.4
    // pt past them)
    expect(frames(page(441, 455, 8.97, { side: [376.15, 465.58] })) + frames(page(440, 455, 8.97))).toBe(2)
  })
})
