import { describe, expect, it } from 'vitest'
import { cropPlacementOf, modelPage, type OrigLine, pixelPage, type UnitIn } from '../../lab/pdf/spikes/layer-gate/measure.mjs'
import { compare, fixtureTotals, type Measure, MEASURES, pageEntry, pooled, type Totals, worse } from '../../lab/pdf/spikes/layer-gate/score.mjs'

// The layer gate's arithmetic (lab/pdf/spikes/layer-gate.mjs, Plan 8b Task 12): a page's model measures
// against the original, a fixture's totals, and the merge rule against a recorded run — shares within 0.2 points, ratios
// within 0.02, unit counts not at all, defects as rates per 1,000 translated text cells

const measure = (key: string): Measure => {
  const m = MEASURES.find(x => x[0] === key)
  if (!m) throw new Error(key)
  return m
}
/** n original lines of a frame, 12 apart from 700, 72 to 472, size 10 */
const lines = (n: number, top = 700): OrigLine[] => Array.from({ length: n }, (_, i) => ({ x0: 72, x1: 472, baseline: top - 12 * i, top: top - 12 * i + 7, bottom: top - 12 * i - 2.5, size: 10 }))
const unit = (o: Partial<UnitIn> & { id: number }): UnitIn => ({ kind: 'para', drawn: true, why: null, orig: lines(5), lines: [], erase: [], crops: [], ...o })

describe('the model measures of a page', () => {
  it('units left as the original are counted by why, the unlocated ones too, and a frame drawn short has its blank lines', () => {
    // unit 1 drawn in 3 of its 5 lines, unit 2 left (floor), unit 3 only in the reference, unit 4 untranslated
    const drawn = unit({ id: 1, lines: lines(3).map(l => ({ baseline: l.baseline, size: 10, x0: 72, x1: 472 })) })
    const m = modelPage({
      units: [drawn, unit({ id: 2, drawn: false, why: 'floor', orig: lines(4, 600) })],
      ref: [{ id: 1, kind: 'para', orig: lines(5) }, { id: 2, kind: 'para', orig: lines(4, 600) }, { id: 3, kind: 'para', orig: lines(2, 500) }, { id: 4, kind: 'para', orig: lines(2, 400) }],
      items: [], translated: new Set([1, 2, 3]),
    })
    expect(m.units).toEqual({ textOn: 3, textDrawn: 1, cellsOn: 0, cellsDrawn: 0, left: { floor: 1, unlocated: 1 } })
    expect(m.geo).toHaveLength(1)
    // two lines of a 12-unit pitch short: the foot 24 above the original's, two blank lines
    expect(m.geo[0]!.blank).toBeCloseTo(2, 5)
    expect(m.geo[0]!.scale).toBe(1)
    expect(m.fills[0]!.fill).toBeLessThan(0.65)
  })
})

describe('where the crops sit (the math placement round): over no other line nor crop, on their TeX baseline', () => {
  // two drawn lines 12 apart, their text 7 high and 2 deep; a crop on the first, cut from a box whose top is 8 over its
  // TeX baseline, drawn at its size
  const lines = [{ key: 'a', x0: 72, x1: 300, baseline: 500, a: 7, d: 2 }, { key: 'b', x0: 72, x1: 300, baseline: 488, a: 7, d: 2 }]
  const crop = (box: number[], o: object = {}) => ({ unit: 1, line: 'a', box, srcTop: 108, tex: 100, sc: 1, ...o })
  it('counts a crop hanging into the next line\'s text, or over another crop, by more than half a point', () => {
    // 4.5 deep: clear of the next line's text, whose top is 495
    expect(cropPlacementOf({ lines, crops: [crop([100, 495.5, 120, 508])] })).toMatchObject({ cropTextOverlap: 0, cropBaselineOff: 0, cropNoTex: 0 })
    // 1.5 below the next line's top (495): over its text
    expect(cropPlacementOf({ lines, crops: [crop([100, 493.5, 120, 508])] }).cropTextOverlap).toBe(1)
    // 0.4: within half a point
    expect(cropPlacementOf({ lines, crops: [crop([100, 494.6, 120, 508])] }).cropTextOverlap).toBe(0)
    // two crops whose boxes meet
    const two = cropPlacementOf({ lines, crops: [crop([100, 495.5, 120, 508]), crop([110, 495.5, 130, 508], { unit: 2 })] })
    expect([two.cropTextOverlap, two.cropWhere.cropTextOverlap]).toEqual([2, [1, 2]])
  })
  it('counts a crop drawn off its TeX baseline, at its drawn scale, and reports one with none', () => {
    // its top 8 over the line's baseline, as its box's is over TeX's
    expect(cropPlacementOf({ lines, crops: [crop([100, 494, 120, 508])] }).cropBaselineOff).toBe(0)
    // drawn 7.7 low (a radical's origin taken for its baseline)
    expect(cropPlacementOf({ lines, crops: [crop([100, 486.3, 120, 500.3])] }).cropBaselineOff).toBe(1)
    // at half its size: 4 over the line's
    expect(cropPlacementOf({ lines, crops: [crop([100, 497, 110, 504], { sc: 0.5 })] }).cropBaselineOff).toBe(0)
    expect(cropPlacementOf({ lines, crops: [crop([100, 494, 120, 508], { tex: null })] })).toMatchObject({ cropBaselineOff: 0, cropNoTex: 1 })
  })
  it("reads a crop's foreign text on the page it is cut from: the crops cut from this page, not those drawn on it", () => {
    // a crop drawn on this page, cut from the page before, over this page's text item of another line: none of its own
    const drawn = unit({ id: 1, crops: [{ k: 1, src: [100, 90, 120, 100], dst: [200, 300, 220, 310] }] })
    const items = [{ x0: 95, y0: 84, x1: 140, y1: 95, str: 'a word', math: false }]
    expect(modelPage({ units: [drawn], ref: [], items, translated: new Set([1]), cut: [] }).cropForeign).toBe(0)
    // the same box cut from this page: the item stands in it
    expect(modelPage({ units: [drawn], ref: [], items, translated: new Set([1]), cut: [{ src: [100, 90, 120, 100], unit: 1 }] }).cropForeign).toBe(1)
  })
})

describe('the gaps between paragraphs (paraGap, D6): the drawn gap against the original\'s, in one column, nothing between', () => {
  // a paragraph of 5 lines from 700 and the next of 4 lines from 640, one pitch after its last line (no paragraph skip):
  // the original's gap from the upper's foot (652 - 2.2) to the lower's top (640 + 7.5), 2.3
  const drawnOn = (orig: OrigLine[], n = orig.length) => orig.slice(0, n).map(l => ({ baseline: l.baseline, size: 10, x0: l.x0, x1: l.x1 }))
  const A = lines(5), B = lines(4, 640)
  const gapsOf = (o: { upper?: number; items?: { x0: number; y0: number; x1: number; y1: number; str: string; math: boolean }[]; more?: { id: number; kind: string; orig: OrigLine[] }[]; lower?: OrigLine[] } = {}) => {
    const lower = o.lower ?? B
    return modelPage({
      units: [unit({ id: 1, orig: A, lines: drawnOn(A, o.upper) }), unit({ id: 2, orig: lower, lines: drawnOn(lower) })],
      ref: [{ id: 1, kind: 'para', orig: A }, { id: 2, kind: 'para', orig: lower }, ...(o.more ?? [])], items: o.items ?? [], translated: new Set([1, 2]),
    }).gaps
  }

  it('is 1 where both are drawn on their own lines, and an upper frame drawn two lines short widens it by two pitches', () => {
    const same = gapsOf()
    expect(same).toHaveLength(1)
    expect(same[0]!.ratio).toBeCloseTo(1, 6)
    expect(same[0]!.extra).toBeCloseTo(0, 6)
    const short = gapsOf({ upper: 3 })
    expect(short[0]!.ratio).toBeCloseTo((2.3 + 24) / 2.3, 2)
    expect(short[0]!.extra).toBeCloseTo(2, 6)
  })

  it('takes no pair with something between: another unit\'s frame (a heading), a text item (a display), or a graphic\'s room', () => {
    // a heading's line at 646 between them, the lower paragraph moved down to 628
    const lower = lines(4, 628)
    expect(gapsOf({ lower, more: [{ id: 3, kind: 'heading', orig: [{ x0: 72, x1: 300, baseline: 640, top: 647, bottom: 637.5, size: 10 }] }] })).toEqual([])
    expect(gapsOf({ lower })).toHaveLength(1)
    // a display's item between them
    expect(gapsOf({ lower, items: [{ x0: 200, y0: 637.8, x1: 300, y1: 647.8, str: 'x', math: true }] })).toEqual([])
    // a lower paragraph more than three pitches below the upper's foot: a figure's room between them
    expect(gapsOf({ lower: lines(4, 600) })).toEqual([])
  })

  it("takes a paragraph's lines moved above its frame as its frame's (the leftover packed): its top's shift, its gap kept", () => {
    // (A ends two lines short; B moved up 24 under it: the original's gap, B's top 24 above its own)
    const m = modelPage({
      units: [unit({ id: 1, orig: A, lines: drawnOn(A, 3) }), unit({ id: 2, orig: B, lines: drawnOn(B).map(l => ({ ...l, baseline: l.baseline + 24 })) })],
      ref: [{ id: 1, kind: 'para', orig: A }, { id: 2, kind: 'para', orig: B }], items: [], translated: new Set([1, 2]),
    })
    expect(m.gaps).toHaveLength(1)
    expect(m.gaps[0]!.ratio).toBeCloseTo(1, 6)
    const geoB = m.geo.find(g => g.id === 2)!
    expect(geoB.dTop).toBeCloseTo(24, 6)
    expect(geoB.blank).toBeCloseTo(2, 6)
  })

  it("reads a frame's rhythm within its flow's segments: never across a held display, which its pitch does", () => {
    // (six lines 12 apart, a display of 30 between the third and the fourth; drawn: two lines 15 apart in the first block,
    // one after the display in the second)
    const orig = [700, 688, 676, 646, 634, 622].map(b => ({ x0: 72, x1: 472, baseline: b, top: b + 7, bottom: b - 2.5, size: 10 }))
    const drawn = [[700, 0], [685, 0], [646, 1]].map(([baseline, block]) => ({ baseline: baseline!, size: 10, x0: 72, x1: 472, block }))
    const m = modelPage({ units: [unit({ id: 1, orig, lines: drawn })], ref: [{ id: 1, kind: 'para', orig }], items: [], translated: new Set([1]) })
    expect(m.geo).toHaveLength(1)
    expect(m.geo[0]!.rhythm).toBeCloseTo(15 / 12, 6)
    expect(m.geo[0]!.pitch).toBeCloseTo(39 / 12, 3)
    // (a display of two stacked baselines 8.5 apart among the original's lines: the rhythm stays against the frame's own
    // pitch, 12, not the closest gap)
    const stacked = [700, 688, 676, 650, 641.5, 620, 608].map(b => ({ x0: 72, x1: 472, baseline: b, top: b + 7, bottom: b - 2.5, size: 10 }))
    const m2 = modelPage({ units: [unit({ id: 1, orig: stacked, lines: drawn })], ref: [{ id: 1, kind: 'para', orig: stacked }], items: [], translated: new Set([1]) })
    expect(m2.geo[0]!.rhythm).toBeCloseTo(15 / 12, 6)
  })

  it('pairs frames of one column only', () => {
    const right = B.map(l => ({ ...l, x0: 320, x1: 540 }))
    const left = A.map(l => ({ ...l, x1: 300 }))
    const m = modelPage({ units: [unit({ id: 1, orig: left, lines: drawnOn(left) }), unit({ id: 2, orig: right, lines: drawnOn(right) })], ref: [{ id: 1, kind: 'para', orig: left }, { id: 2, kind: 'para', orig: right }], items: [], translated: new Set([1, 2]) })
    expect(m.gaps).toEqual([])
  })

  it("totals each page's and fixture's median ratio and share of gaps a pitch or more wider, and the drawn pitch's drift", () => {
    // (a page's drawn rhythm: its body frames' median rhythm against the original's; none where no body frame has one)
    const geo = (rhythm: number | null) => (rhythm === null ? [] : [{ id: 1, kind: 'para', n: 5, dTop: 0, blank: 0, dRight: 0, pitch: rhythm, rhythm, onGrid: 1, scale: 1 }])
    const page = (p: number, gaps: { ratio: number; extra: number }[], pitch: number | null) => pageEntry(p, {
      model: { units: { textOn: 1, textDrawn: 1, cellsOn: 0, cellsDrawn: 0, left: {} }, fills: [], geo: geo(pitch), gaps, wrongPageText: 0, droppedPh: 0, cropForeign: 0, modelCells: 100 },
      check: { missing: [], twice: [], brackets: [], duplicated: [], numbers: { shown: 0, total: 0 }, clipped: 0 }, where: {}, style: [0, 0], drawn: 1,
    }, null)
    const es = [page(1, [{ ratio: 1, extra: 0 }, { ratio: 3, extra: 1.5 }], 1.4), page(2, [{ ratio: 1.1, extra: 0.1 }], null), page(3, [{ ratio: 2, extra: 1 }], 1.45), page(4, [], 1.38)]
    expect(es[0]!.entry).toMatchObject({ paraGaps: 2, paraGap: 2, paraGapWide: 1, rhythm: 1.4 })
    const t = fixtureTotals(es.map(e => e.entry), es.map(e => e.frames), 'model')
    // four gaps: 1, 1.1, 2, 3; two of them a pitch or more wider. The pitches 1.4, 1.45, 1.38: drifts 0.05 and 0.07
    expect(t).toMatchObject({ paraGapN: 4, paraGap: 1.55, paraGapWide: 0.5 })
    expect(t.pageDrift).toBeCloseTo(0.07, 6)
    const p = pooled([t, fixtureTotals([es[0]!.entry], [es[0]!.frames], 'model')], 'model')!
    expect(p.paraGapN).toBe(6)
    expect(p.paraGap).toBeCloseTo((1.55 * 4 + 2 * 2) / 6, 3)
    expect(p.pageDrift).toBeCloseTo(0.07, 6)
    // gated: closer to 1 is better, and fewer wide gaps
    expect(worse(measure('paraGap'), { paraGap: 2 }, { paraGap: 1.2 })?.better).toBe(true)
    expect(worse(measure('paraGapWide'), { paraGapWide: 0.1 }, { paraGapWide: 0.2 })?.worse).toBe(true)
  })
})

describe("the coverage of the original's text area", () => {
  // a 60 x 40 page at 1 px a unit: one reference line from 10 to 50 on baseline 20 at size 10, four cells of one em, each
  // with a block of the original's ink
  const W = 60, H = 40
  const planeOf = (paint: (x: number, y: number) => number) => {
    const a = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = paint(x, y); a.set([v, v, v, 255], 4 * (y * W + x)) }
    return a
  }
  // the ink: rows 14 to 19 (PDF y 21 to 26), in each cell's x 12-17, 22-27, 32-37, 42-47
  const inked = (x: number, y: number) => y >= 14 && y < 20 && (x - 10) % 10 >= 2 && (x - 10) % 10 < 8 && x >= 10 && x < 50
  const O = planeOf((x, y) => (inked(x, y) ? 0 : 255))
  const paper = planeOf(() => 255)
  const ref = [{ id: 1, kind: 'para', orig: [{ x0: 10, x1: 50, baseline: 20, top: 27, bottom: 17.5, size: 10 }] }]
  const measure = (o: { C: Uint8ClampedArray; T: Uint8ClampedArray; drawn: boolean; x1?: number }) => {
    const units: UnitIn[] = [{ id: 1, kind: 'para', drawn: o.drawn, why: null, orig: ref[0]!.orig, lines: o.drawn ? [{ baseline: 20, size: 10, x0: 10, x1: o.x1 ?? 50 }] : [], erase: [[10, 17.5, 50, 27]], crops: [] }]
    return (pixelPage({ k: 1, view: [0, 0, W, H], W, H, O, C: o.C, T: o.T, units, kept: [], items: [], ref, drawnText: '' }) as { coverage: { text: Record<string, number> } }).coverage.text
  }

  it('a face set on the same lines covers the same cells, whatever its stroke weight', () => {
    // the translation's text dark, and light enough that no pixel of it is ink: the same four cells translated
    const dark = planeOf((x, y) => (y >= 15 && y < 19 && x >= 11 && x < 49 && x % 3 === 0 ? 0 : 255))
    const light = planeOf((x, y) => (y >= 15 && y < 19 && x >= 11 && x < 49 && x % 3 === 0 ? 200 : 255))
    expect(measure({ C: paper, T: dark, drawn: true })).toEqual({ cells: 4, translated: 4, english: 0, blank: 0 })
    expect(measure({ C: paper, T: light, drawn: true })).toEqual({ cells: 4, translated: 4, english: 0, blank: 0 })
  })

  it('a line set shorter leaves blank cells, and the original left in place is English', () => {
    expect(measure({ C: paper, T: paper, drawn: true, x1: 30 })).toEqual({ cells: 4, translated: 2, english: 0, blank: 2 })
    expect(measure({ C: O, T: paper, drawn: false })).toEqual({ cells: 4, translated: 0, english: 4, blank: 0 })
  })

  it("a babel name's reference row is text: drawn in the target's word (names) translated, left in place English (D1a)", () => {
    const named = [{ id: 'name:1', kind: 'name', orig: ref[0]!.orig }]
    const of = (C: Uint8ClampedArray, names: { orig: typeof ref[0]['orig']; lines: { baseline: number; size: number; x0: number; x1: number }[]; erase: number[][] }[]) => (pixelPage({ k: 1, view: [0, 0, W, H], W, H, O, C, T: paper, units: [], names, kept: [], items: [], ref: named, drawnText: '' }) as { coverage: { text: Record<string, number> } }).coverage.text
    expect(of(paper, [{ orig: ref[0]!.orig, lines: [{ baseline: 20, size: 10, x0: 10, x1: 50 }], erase: [[10, 17.5, 50, 27]] }])).toEqual({ cells: 4, translated: 4, english: 0, blank: 0 })
    expect(of(O, [])).toEqual({ cells: 4, translated: 0, english: 4, blank: 0 })
  })
})

describe("the erase bites: the original's ink erased that no drawn unit owns", () => {
  // the same 60 x 40 page: a unit's line on baseline 20 (its own band PDF y 17 to 28.8), its erase from y 8, and a block of
  // the original's ink under the band (x 20-25, y 10-13: a radical's foot hanging under the line)
  const W = 60, H = 40
  const planeOf = (paint: (x: number, y: number) => number) => {
    const a = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = paint(x, y); a.set([v, v, v, 255], 4 * (y * W + x)) }
    return a
  }
  const O = planeOf((x, y) => (x >= 20 && x < 26 && y >= H - 13 && y < H - 10 ? 0 : 255))
  const paper = planeOf(() => 255)
  const orig = [{ x0: 10, x1: 50, baseline: 20, top: 27, bottom: 17.5, size: 10 }]
  const bites = (crops: { k: number; src: number[]; dst: number[] }[], cut: { src: number[]; unit: number }[]) =>
    (pixelPage({ k: 1, view: [0, 0, W, H], W, H, O, C: paper, T: paper, units: [{ id: 1, kind: 'para', drawn: true, why: null, orig, lines: [{ baseline: 20, size: 10, x0: 10, x1: 50 }], erase: [[10, 8, 50, 27]], crops } as UnitIn], kept: [], items: [], ref: [{ id: 1, kind: 'para', orig }], drawnText: '', cut }) as { bites: number }).bites
  it('counts ink erased beside no line and under no crop', () => {
    expect(bites([], [])).toBe(1)
  })
  it("does not count ink inside a crop's source, cut from this page and drawn elsewhere (a crop on its TeX baseline stands off its source)", () => {
    const crop = { k: 1, src: [18, 9, 28, 15], dst: [40, 17.5, 50, 25] }
    expect(bites([crop], [{ src: crop.src, unit: 1 }])).toBe(0)
    // (a crop whose source is elsewhere accounts for none of it)
    expect(bites([{ ...crop, src: [30, 9, 40, 15] }], [{ src: [30, 9, 40, 15], unit: 1 }])).toBe(1)
  })
  it('reads what a crop carries: the boxes of its own ink it is cut through, never the rest of its rectangle', () => {
    // the source [18, 9, 28, 15] holds the ink (x 20-25, device rows 27-29); cut through a box of its own ink that takes
    // only x 18-21 of it (device pixels [x, y, w, h]), the crop does not carry x 22-25: that ink is erased and lost
    const crop = { k: 1, src: [18, 9, 28, 15], dst: [40, 17.5, 50, 25] }
    expect(bites([crop], [{ src: crop.src, unit: 1, clip: [[18, H - 15, 4, 6]] } as never])).toBe(1)
    expect(bites([crop], [{ src: crop.src, unit: 1, clip: [[18, H - 15, 10, 6]] } as never])).toBe(0)
  })
  it('reads a crop with no boxes of its own by its source rectangle as it is cut, with no margin beyond it', () => {
    // at 10 device pixels a unit: the ink x 20-26, y 10-13; a source that ends 0.2 short of it, at 25.8, carries none of
    // the last 0.2 (two columns of 30 rows), which a margin of 0.4 around the source would have hidden
    const k = 10, w = 60 * k, h = 40 * k
    const plane = (ink: (x: number, y: number) => boolean) => {
      const a = new Uint8ClampedArray(w * h * 4)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = ink(x / k, (h - y - 0.5) / k) ? 0 : 255; a.set([v, v, v, 255], 4 * (y * w + x)) }
      return a
    }
    const O10 = plane((x, y) => x >= 20 && x < 26 && y >= 10 && y < 13), paper10 = plane(() => false)
    const crop = { k: 1, src: [18, 9, 25.8, 15], dst: [40, 17.5, 50, 25] }
    const run = (src: number[]) => (pixelPage({ k, view: [0, 0, 60, 40], W: w, H: h, O: O10, C: paper10, T: paper10, units: [{ id: 1, kind: 'para', drawn: true, why: null, orig, lines: [{ baseline: 20, size: 10, x0: 10, x1: 50 }], erase: [[10, 8, 50, 27]], crops: [{ ...crop, src }] } as UnitIn], kept: [], items: [], ref: [{ id: 1, kind: 'para', orig }], drawnText: '', cut: [{ src, unit: 1 }] }) as { bites: number; bitePx: number })
    expect(run(crop.src)).toMatchObject({ bites: 1, bitePx: 60 })
    expect(run([18, 9, 26, 15])).toMatchObject({ bites: 0, bitePx: 0 })
  })
})

describe('generated text left (D1a)', () => {
  it("counts a page's names left by kind, sums them a fixture and a pool, and gates them down", () => {
    const page = (p: number, generated: Record<string, number>) => pageEntry(p, {
      model: { units: { textOn: 1, textDrawn: 1, cellsOn: 0, cellsDrawn: 0, left: {} }, fills: [], geo: [], gaps: [], wrongPageText: 0, droppedPh: 0, cropForeign: 0, modelCells: 100 },
      check: { missing: [], twice: [], brackets: [], duplicated: [], numbers: { shown: 0, total: 0 }, clipped: 0 }, where: {}, style: [0, 0], drawn: 1, generated,
    }, null)
    const es = [page(1, { name: 2 }), page(2, {}), page(3, { name: 1 })]
    expect(es.map(e => e.entry.generatedLeft)).toEqual([2, 0, 1])
    const t = fixtureTotals(es.map(e => e.entry), es.map(e => e.frames), 'model')
    expect(t).toMatchObject({ generatedLeft: 3, generated: { name: 3 } })
    expect(pooled([t, t], 'model')).toMatchObject({ generatedLeft: 6, generated: { name: 6 } })
    expect(worse(measure('generatedLeft'), { generatedLeft: 2 }, { generatedLeft: 0 })?.better).toBe(true)
    expect(worse(measure('generatedLeft'), { generatedLeft: 0 }, { generatedLeft: 1 })?.worse).toBe(true)
  })
})

describe('the merge rule', () => {
  it('a share may move by 0.2 points, a ratio by 0.02, a unit count not at all', () => {
    const a: Totals = { textTranslated: 0.8, fill: 0.9, unitsLeft: 10 }
    expect(worse(measure('textTranslated'), a, { textTranslated: 0.7985 })?.worse).toBe(false)
    expect(worse(measure('textTranslated'), a, { textTranslated: 0.797 })?.worse).toBe(true)
    expect(worse(measure('textTranslated'), a, { textTranslated: 0.81 })?.better).toBe(true)
    // fill is closer the nearer it is to 1, from either side
    expect(worse(measure('fill'), a, { fill: 0.885 })?.worse).toBe(false)
    expect(worse(measure('fill'), a, { fill: 0.87 })?.worse).toBe(true)
    expect(worse(measure('fill'), a, { fill: 1.05 })?.better).toBe(true)
    expect(worse(measure('unitsLeft'), a, { unitsLeft: 11 })?.worse).toBe(true)
    expect(worse(measure('unitsLeft'), a, { unitsLeft: 9 })?.better).toBe(true)
  })

  it('defects are compared as rates per 1,000 translated text cells', () => {
    const at = (residue: number, cells: number) => ({ residue, textTranslatedCells: cells, rates: { residue: (1000 * residue) / cells } })
    // twice the residue over twice the translated text: no worse
    expect(worse(measure('residue'), at(10, 1000), at(20, 2000))?.worse).toBe(false)
    expect(worse(measure('residue'), at(10, 1000), at(11, 1000))?.worse).toBe(true)
    expect(worse(measure('residue'), at(10, 1000), at(10, 2000))?.better).toBe(true)
  })

  it('a fixture worse on any measure is a regression, and every page that moved is listed', () => {
    // a page's entry as the model measured it: one body frame drawn, a defect count, its cells
    const entry = (p: number, o: { textDrawn?: number; duplicated?: number } = {}) => {
      const model = {
        model: { units: { textOn: 2, textDrawn: o.textDrawn ?? 2, cellsOn: 0, cellsDrawn: 0, left: o.textDrawn === 1 ? { lost: 1 } : {} }, fills: [{ kind: 'para', n: 5, fill: 0.9 }], geo: [{ id: 1, kind: 'para', n: 5, dTop: 0, blank: 0.5, dRight: 0, pitch: 1, onGrid: 1, scale: 1 }], wrongPageText: 0, droppedPh: 0, cropForeign: 0, modelCells: 400 },
        check: { missing: [], twice: [], brackets: [], duplicated: Array(o.duplicated ?? 0).fill(1), numbers: { shown: 0, total: 0 }, clipped: 0 }, where: {}, style: [1, 1], drawn: 1,
      }
      return pageEntry(p, model, null)
    }
    const fixture = (es: ReturnType<typeof entry>[]) => ({ totals: fixtureTotals(es.map(e => e.entry), es.map(e => e.frames), 'model'), pages: es.map(e => e.entry) })
    const before = { a: fixture([entry(1), entry(2)]), b: fixture([entry(1), entry(2)]) }
    const same = compare(before, { a: fixture([entry(1), entry(2)]), b: fixture([entry(1), entry(2)]) }, 'model')
    expect(same.regressions).toEqual([])
    expect(same.pages).toEqual([])
    const after = { a: fixture([entry(1), entry(2, { textDrawn: 1 })]), b: fixture([entry(1, { duplicated: 1 }), entry(2)]), c: fixture([entry(1)]) }
    const cmp = compare(before, after, 'model')
    expect(cmp.regressions.map(r => `${r.fixture}:${r.measure}`).sort()).toEqual(['a:unitsLeft', 'b:duplicated'])
    expect(cmp.pages).toEqual([{ fixture: 'a', page: 2, worse: ['unitsLeft'], better: [] }, { fixture: 'b', page: 1, worse: ['duplicated'], better: [] }])
    expect(cmp.unmatched).toEqual(['c'])
    // pooled over fixtures: the counts summed
    expect(pooled([after.a.totals, after.b.totals], 'model')).toMatchObject({ outputs: 2, unitsLeft: 1, duplicated: 1, textOn: 8 })
  })
})

describe("the wire's syntax left in drawn text (measure.mjs markerResidueOf): what the protector's formats can leave", () => {
  it('a marker, its `#` alone (Microsoft\'s `(#)`), a tolerant remains, an escaped `@`, an entity, a tag; none in clean text', async () => {
    const { markerResidueOf } = await import('../../lab/pdf/spikes/layer-gate/measure.mjs')
    expect(markerResidueOf('\u81ea\u5df1\u56de\u5e30\u7684 [10] (#)\u3068\u306a\u308a')).toEqual(['#'])
    expect(markerResidueOf('el modelo @a# y @b, con @@ y &amp; o &#39;')).toEqual(['@a#', '@b', '@@', '&amp;', '&#39;'])
    expect(markerResidueOf('Wir <x id="2"/> sehen <t id="1">es</t>')).toEqual(['<x id="2"/>', '<t id="1">', '</t>'])
    // an address keeps its `@` (a letter follows within an id's length), and plain text is clean
    expect(markerResidueOf('kahe@microsoft.com, Table 2 (top), x (y) z')).toEqual([])
  })
})

describe("TeX's syntax left in a placeholder's rendering (measure.mjs markupResidueOf): beyond what its source escapes", () => {
  it("a control symbol's backslash, a math shift, a grouping brace; the escaped characters the source asks for are none", async () => {
    const { markupResidueOf } = await import('../../lab/pdf/spikes/layer-gate/measure.mjs')
    expect(markupResidueOf('\\', '\\&')).toEqual(['\\'])
    expect(markupResidueOf('D=l^\u03bc,\\', '$D=l^{{\\mu}},\\ \\Delta$')).toEqual(['\\'])
    expect(markupResidueOf('{a}$', '$\\mathbf{a}$')).toEqual(['{', '}', '$'])
    expect(markupResidueOf('&', '\\&')).toEqual([])
    expect(markupResidueOf('{\u03b8}', '$\\{\\theta\\}$')).toEqual([])
    expect(markupResidueOf('5%', '$5\\%$')).toEqual([])
  })
})


describe("a local path as the gate's records keep it (layer-gate/ref.mjs shownPath): no user's name, no machine's directory", () => {
  it("is relative under its base, `~/` under the home directory, `<scratch>/` under a temporary one, `<local>/` elsewhere", async () => {
    const { homedir, tmpdir } = await import('node:os')
    const { shownPath } = await import('../../lab/pdf/spikes/layer-gate/ref.mjs')
    expect(shownPath('/repo', '/repo')).toBe('.')
    expect(shownPath('/repo/out/layer-gate/fixtures/x', '/repo')).toBe('out/layer-gate/fixtures/x')
    expect(shownPath(`${homedir()}/Downloads/readarxiv-test`)).toBe('~/Downloads/readarxiv-test')
    expect(shownPath(`${tmpdir()}/claude-501/session/scratchpad/wt-old`)).toBe('<scratch>/wt-old')
    // (macOS's /private/tmp, a session's directory under it)
    expect(shownPath(['', 'private', 'tmp', 'claude-501', 'session', 'scratchpad', 'floor-v0'].join('/'))).toBe('<scratch>/floor-v0')
    expect(shownPath('/opt/elsewhere/checkout')).toBe('<local>/checkout')
    expect(shownPath('out/relative')).toBe('out/relative')
  })
})

describe("the frozen references' babel names (layer-gate/ref.mjs makeRef, withNames: D1a)", () => {
  // two makers' layout files of one paper: the old one locates units 0 and 2 and no name, the new one its own lines of
  // them and two names (the abstract's on page 1, the references' on page 2)
  const unitsOf = () => [[0, 0, 9, 0, 4], [2, 0, 9, 0, 4]]
  const nameAt = (occ: number, key: number, page: number, x0: number) => [occ, key, page, x0, 700, x0 + 40, 707, 697.5, 10, 0, 0, -1, 0, 72, 540]
  const old = { units: unitsOf(), lines: [[0, [1, 72, 300, 680, 687, 677.5, 10, 0, 1, 72, 300, 668, 675, 665.5, 10, 0]], [2, [2, 72, 200, 650, 657, 647.5, 10, 0]]], names: [] }
  const later = (names: number[][]) => ({ units: unitsOf(), lines: [[0, [1, 72, 301, 680, 687, 677.5, 10, 0]], [2, [2, 72, 201, 650, 657, 647.5, 10, 0]]], names })
  const bytes = (o: object) => new TextEncoder().encode(JSON.stringify(o))

  it("makeRef: the units' rows by id, then the names by occurrence, the names from the first file that locates any", async () => {
    const { makeRef } = await import('../../lab/pdf/spikes/layer-gate/ref.mjs')
    const ref = makeRef([bytes(later([nameAt(1, 0, 1, 120), nameAt(3, 1, 2, 72)])), bytes(old)], null)
    expect(ref.pages['1']).toEqual([[0, 'para', [72, 301, 680, 687, 677.5, 10]], ['name:1', 'name', [120, 160, 700, 707, 697.5, 10]]])
    expect(ref.pages['2']).toEqual([[2, 'para', [72, 201, 650, 657, 647.5, 10]], ['name:3', 'name', [72, 112, 700, 707, 697.5, 10]]])
    expect(ref.from.names).toBe(2)
  })

  it("withNames: every unit's rows byte for byte as they were, the later maker's names after them, earlier names replaced", async () => {
    const { makeRef, withNames } = await import('../../lab/pdf/spikes/layer-gate/ref.mjs')
    const ref = makeRef(bytes(old), null)
    const first = withNames(ref, [bytes(later([nameAt(1, 0, 1, 120), nameAt(3, 1, 2, 72)]))])
    const units = (r: { pages: Record<string, unknown[][]> }) => Object.fromEntries(Object.entries(r.pages).map(([p, l]) => [p, l.filter(x => x[1] !== 'name')]))
    expect(JSON.stringify(units(first))).toBe(JSON.stringify(ref.pages))
    expect(first.pages['1']?.map(r => r[0])).toEqual([0, 'name:1'])
    expect(first.pages['2']?.map(r => r[0])).toEqual([2, 'name:3'])
    // again with other names: those replace the first's, the units' rows still the same
    const again = withNames(first, [bytes(later([nameAt(2, 1, 2, 80)]))])
    expect(JSON.stringify(units(again))).toBe(JSON.stringify(ref.pages))
    expect(again.pages['1']?.map(r => r[0])).toEqual([0])
    expect(again.pages['2']?.map(r => r[0])).toEqual([2, 'name:2'])
    expect(again.from.names).toBe(1)
  })
})

describe("TeX's file against the drawing (the 2608.16117 survey and the p59 finding: measure.mjs, the fixture's layout file)", () => {
  // a layout file's rows: unit 3's three lines on page 1 (its second held, a display's row) and one on page 2; a math
  // placeholder with a segment on each page, a display on page 1, a LOST one; unit 4 one line on page 1
  const line = (p: number, x0: number, x1: number, base: number) => [p, x0, x1, base, base + 7, base - 2.5, 10, 0]
  const layout = {
    lines: [[3, [...line(1, 72, 472, 700), ...line(1, 200, 340, 680), ...line(1, 72, 472, 660), ...line(2, 72, 472, 700)]], [4, line(1, 72, 472, 600)]] as [number, number[]][],
    held: [[3, [1]]] as [number, number[]][],
    // unit, k, kind, flags, then per segment: page, x0, baseline, x1, top, bottom
    ph: [[3, 1, 0, 0, 1, 100, 700, 120, 707, 698, 2, 90, 700, 110, 707, 698], [3, 3, 1, 2, 1, 200, 680, 340, 688, 676], [3, 5, 1, 32]],
  }

  it('reads the file by page: each unit\'s placeholders with ink and lines there, the LOST ones on its first page, the displays', async () => {
    const { displayRowsOf, fileIndexOf } = await import('../../lab/pdf/spikes/layer-gate/measure.mjs')
    const f = fileIndexOf(layout)
    const u = f.get(1)!.units.get(3)!
    expect(u.phs).toEqual([{ k: 1, kind: 'math', segs: [[100, 698, 120, 707]] }, { k: 3, kind: 'display', segs: [[200, 676, 340, 688]] }])
    expect(u.lines.map(l => [l.j, l.held])).toEqual([[0, false], [1, true], [2, false]])
    expect(u.lines[0]!.box).toEqual([72, 697.5, 472, 707])
    expect(u.lost).toEqual([5])
    expect(f.get(2)!.units.get(3)).toMatchObject({ phs: [{ k: 1, segs: [[90, 698, 110, 707]] }], lost: [] })
    expect(f.get(1)!.displays).toEqual([[200, 676, 340, 688]])
    // the held line stands apart from the unit's text lines: a display's row; one that shares a band with one is not
    expect(displayRowsOf(f.get(1))).toEqual([[200, 677.5, 340, 687]])
    const shared = fileIndexOf({ ...layout, lines: [[3, [...line(1, 72, 190, 680), ...line(1, 200, 340, 680)]]], held: [[3, [1]]] })
    expect(displayRowsOf(shared.get(1))).toEqual([])
  })

  it('content: a placeholder is shown once by its own crop of its ink, its source drawn, its characters drawn, or its ink in place', async () => {
    const { contentOf } = await import('../../lab/pdf/spikes/layer-gate/measure.mjs')
    const ph = { unit: 3, k: 1, segs: [[100, 698, 120, 707]] }, erased = [[70, 695, 475, 710]]
    const crop = (src: number[], k = 1) => ({ unit: 3, k, src })
    // erased, and nothing drawn of it: lost
    expect(contentOf({ phs: [ph], erased })).toEqual({ contentLost: 1, contentWhere: [[3, 1, 0]] })
    // its crop whose source holds its segment's centre, or its source drawn as text: shown once
    expect(contentOf({ phs: [ph], erased, crops: [crop([99.6, 697.7, 120.4, 707.3])] }).contentLost).toBe(0)
    expect(contentOf({ phs: [ph], erased, texts: new Set(['3|1']) }).contentLost).toBe(0)
    // another placeholder's crop of its ink shows it no time
    expect(contentOf({ phs: [ph], erased, crops: [crop([99.6, 697.7, 120.4, 707.3], 3)] }).contentWhere).toEqual([[3, 1, 0]])
    // its crop cut beside it ("r" of "r,\u03b8" alone): its centre is not in it, so it is lost
    expect(contentOf({ phs: [ph], erased, crops: [crop([99.6, 697.7, 106, 707.3])] }).contentWhere).toEqual([[3, 1, 0]])
    // both its crop and its text: shown twice
    expect(contentOf({ phs: [ph], erased, crops: [crop([99.6, 697.7, 120.4, 707.3])], texts: new Set(['3|1']) }).contentWhere).toEqual([[3, 1, 2]])
    // its ink in place: never erased, on a line the drawing keeps, or its kept rendering's characters in it, once however often
    expect(contentOf({ phs: [ph] }).contentLost).toBe(0)
    expect(contentOf({ phs: [ph], erased, keptLines: [[72, 697.5, 472, 707]], kept: [{ unit: 3, k: 1, chars: [[110, 701]] }] }).contentLost).toBe(0)
    expect(contentOf({ phs: [ph], erased, kept: [{ unit: 3, k: 1, chars: [[110, 701]] }] }).contentLost).toBe(0)
    // another placeholder's kept rendering of its ink: not its own showing
    expect(contentOf({ phs: [ph], erased, kept: [{ unit: 3, k: 9, chars: [[110, 701]] }] }).contentLost).toBe(1)
    // left in place and drawn as text as well: twice (the kept citation line drawn again)
    expect(contentOf({ phs: [ph], erased, keptLines: [[72, 697.5, 472, 707]], texts: new Set(['3|1']) }).contentWhere).toEqual([[3, 1, 2]])
  })

  it("content: a rendering handed out one off shows every placeholder it passes as lost, its own ink's and the next's", async () => {
    const { contentOf } = await import('../../lab/pdf/spikes/layer-gate/measure.mjs')
    // k 1's rendering took k 9's ink ("(2.4)"); k 9's own rendering took nothing: neither is shown
    const a = { unit: 3, k: 1, segs: [[232, 201, 261, 206]] }, b = { unit: 3, k: 9, segs: [[200, 183, 223, 188]] }
    const erased = [[190, 180, 262, 207]]
    expect(contentOf({ phs: [a, b], erased, pageTexts: [{ unit: 3, k: 1, chars: [[201, 186.6], [206, 186.6]] }] }).contentWhere).toEqual([[3, 1, 0], [3, 9, 0]])
    // drawn from their own ink, each once
    expect(contentOf({ phs: [a, b], erased, pageTexts: [{ unit: 3, k: 1, chars: [[240, 204]] }, { unit: 3, k: 9, chars: [[206, 186.6]] }] }).contentLost).toBe(0)
  })

  it('a drawn line over a display: its text\'s ink meets a display\'s segment or row by more than half a point', async () => {
    const { overDisplayOf } = await import('../../lab/pdf/spikes/layer-gate/measure.mjs')
    const at = (baseline: number) => [{ unit: 198, x0: 289, x1: 315, baseline, a: 8, d: 2 }]
    expect(overDisplayOf({ lines: at(625.28), boxes: [[125, 605, 469, 738]] })).toEqual({ textInDisplay: 1, where: [198] })
    // its ink's foot 0.4 into the display's top: clear; 0.6 into it: over it
    expect(overDisplayOf({ lines: at(739.6), boxes: [[125, 605, 469, 738]] }).textInDisplay).toBe(0)
    expect(overDisplayOf({ lines: at(739.4), boxes: [[125, 605, 469, 738]] }).textInDisplay).toBe(1)
  })

  it("an empty slot between two drawn lines of a frame, beyond TeX's own room and the lines the drawing keeps", async () => {
    const { slotsSkippedOf } = await import('../../lab/pdf/spikes/layer-gate/measure.mjs')
    const orig = lines(6)
    const drawnAt = (bs: number[]) => bs.map(baseline => ({ baseline, size: 10, x0: 72, x1: 472, pitch: 12 }))
    // TeX's own lines at the original's pitch, 12: nothing set aside
    const tex = [700, 688, 676, 664, 652, 640]
    const of = (bs: number[], o: { tex?: number[]; keptRows?: number[] } = {}) => slotsSkippedOf([{ id: 8, orig, lines: drawnAt(bs), tex: o.tex ?? tex, texPitch: 12, keptRows: o.keptRows ?? [] }])
    expect(of([700, 688, 676, 664]).slotsSkipped).toBe(0)
    // a gap of two pitches holds one empty slot, three pitches two
    expect(of([700, 676, 664])).toEqual({ slotsSkipped: 1, where: [8] })
    expect(of([700, 664]).slotsSkipped).toBe(2)
    // the original's own blank line between two paragraphs of the unit (its lines 676 and 652): none left empty by the drawing
    expect(of([700, 688, 676, 652, 640], { tex: [700, 688, 676, 652, 640] }).slotsSkipped).toBe(0)
    // a display's rows between them (held, so no line of TeX's text there): its room the original's
    expect(of([700, 664], { tex: [700, 664] }).slotsSkipped).toBe(0)
    // the original's blank, and the line after it left empty too: one
    expect(of([700, 688, 676, 640], { tex: [700, 688, 676, 652, 640] }).slotsSkipped).toBe(1)
    // a line the drawing keeps as the original's (English left in place): its row is not empty
    expect(of([700, 676, 664], { keptRows: [690] }).slotsSkipped).toBe(0)
    // at a wider drawn pitch (1.3), the original's blank of one of its pitches sets aside its room, 12, not a drawn slot
    const wide = (bs: number[]) => bs.map(baseline => ({ baseline, size: 10, x0: 72, x1: 472, pitch: 15.6 }))
    expect(slotsSkippedOf([{ id: 8, orig, lines: wide([700, 684.4, 656.8]), tex: [700, 688, 676, 652, 640], texPitch: 12, keptRows: [] }]).slotsSkipped).toBe(0)
  })

  it("a line opened by a mark UAX 14 keeps from a line's start, unless the original's line opens with one", async () => {
    const { lineStartsOf, noStart } = await import('../../lab/pdf/spikes/layer-gate/measure.mjs')
    for (const c of ['\uff0c', '\u3002', '\u3001', ')', ',', '.', '!', '?', ';', ':', '\u300d', '\u30fb', '\u{1f679}']) expect(noStart(c)).toBe(true)
    for (const c of ['(', 'a', '\u4e2d', '\u2014', '%', '/', '[', '\u300c', null, '']) expect(noStart(c)).toBe(false)
    expect(lineStartsOf([{ unit: 28, first: '\uff0c', orig: 'w' }, { unit: 28, first: '\u5176', orig: 'w' }, { unit: 30, first: ',', orig: ',' }, { unit: 30, first: null, orig: null }, { unit: 31, first: '\u3002', orig: null }])).toEqual({ lineStartPunct: 2, where: [28, 31] })
  })

  it("the strict account of an erased glyph: TeX's text replaced, a placeholder's ink only where drawn from it, no leftover", async () => {
    const { glyphAccounted } = await import('../../lab/pdf/spikes/layer-gate/measure.mjs')
    const g = { cat: 'acc', inSeg: false, onLine: false, inGap: false, used: null, drawn: false }
    // a placeholder's ink (in its segment), even as a word the alignment matched ("and" of a reference): only where its
    // placeholder is drawn from its source or a rendering drawn as the page's own characters took it
    expect(glyphAccounted({ ...g, inSeg: true })).toBe(false)
    expect(glyphAccounted({ ...g, inSeg: true, fromSource: true })).toBe(true)
    expect(glyphAccounted({ ...g, inSeg: true, used: 'orig-text', drawn: true })).toBe(true)
    expect(glyphAccounted({ ...g, inSeg: true, used: 'orig-text', drawn: false })).toBe(false)
    // TeX's text on the unit's own line, a leftover of a gap too (the alignment missed it): replaced, unless kept
    expect(glyphAccounted({ ...g, onLine: true, cat: 'orphan', inGap: true })).toBe(true)
    expect(glyphAccounted({ ...g, onLine: true, cat: 'keep' })).toBe(false)
    // where the file has no line for it: the drawing's matched source word, never a leftover whose letters it draws elsewhere
    expect(glyphAccounted(g)).toBe(true)
    expect(glyphAccounted({ ...g, inGap: true })).toBe(false)
    expect(glyphAccounted({ ...g, used: 'crop' })).toBe(false)
  })

  it("unerased originals: a drawn unit's own line of TeX's file left intact, never one erased or drawn over", async () => {
    // a 60 x 40 page at 1 px a unit: one line from 10 to 50 on baseline 20, its ink rows 14 to 19
    const W = 60, H = 40
    const planeOf = (paint: (x: number, y: number) => number) => {
      const a = new Uint8ClampedArray(W * H * 4)
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = paint(x, y); a.set([v, v, v, 255], 4 * (y * W + x)) }
      return a
    }
    const O = planeOf((x, y) => (y >= 14 && y < 20 && x >= 12 && x < 48 && x % 4 < 2 ? 0 : 255)), paper = planeOf(() => 255)
    const of = (C: Uint8ClampedArray, T = paper, segs: number[][] = []) => pixelPage({ k: 1, view: [0, 0, W, H], W, H, O, C, T, units: [], kept: [], items: [], ref: [], drawnText: '', ownLines: [{ unit: 8, box: [10, 17.5, 50, 27] }], segs }) as { linesLeft: number; linesLeftWhere: number[] }
    expect(of(O)).toMatchObject({ linesLeft: 1, linesLeftWhere: [8] })
    expect(of(paper).linesLeft).toBe(0)
    // the translation's text over every pixel of it: not left, drawn over (overlap's)
    expect(of(O, O).linesLeft).toBe(0)
    // a placeholder the drawing keeps in place filling the line (a citation kept as the original's): its ink aside
    expect(of(O, paper, [[11, 18, 49, 26]]).linesLeft).toBe(0)
  })

  it('the segments a kept rendering leaves in place: those its characters stand in', async () => {
    const { keptSegsOf } = await import('../../lab/pdf/spikes/layer-gate/measure.mjs')
    const phs = [{ unit: 46, k: 1, segs: [[143, 418, 180, 427]] }, { unit: 46, k: 3, segs: [[200, 418, 230, 427]] }]
    expect(keptSegsOf({ phs, kept: [{ unit: 46, k: 1, chars: [[150, 421]] }] })).toEqual([[143, 418, 180, 427]])
    // another placeholder's kept rendering standing in its ink: not its own
    expect(keptSegsOf({ phs, kept: [{ unit: 46, k: 3, chars: [[150, 421]] }] })).toEqual([])
    expect(keptSegsOf({ phs })).toEqual([])
  })

  it('records each as a defect of its tier, its rate compared, what the content measure cannot place too', () => {
    for (const [key, tier] of [['contentLost', 'model'], ['contentUnknown', 'model'], ['textInDisplay', 'model'], ['slotsSkipped', 'model'], ['lineStartPunct', 'model'], ['glyphsLost', 'pixel'], ['linesLeft', 'pixel']] as const) {
      expect(measure(key).slice(1, 4)).toEqual([tier, 'defect', 'down'])
    }
    const model = (n: number) => ({
      model: { units: { textOn: 1, textDrawn: 1, cellsOn: 0, cellsDrawn: 0, left: {} }, fills: [], geo: [], gaps: [], wrongPageText: 0, droppedPh: 0, cropForeign: 0, modelCells: 1000, contentLost: n, textInDisplay: 0, slotsSkipped: 2, lineStartPunct: 1, contentUnknown: 3 },
      check: { missing: [], twice: [], brackets: [], duplicated: [], numbers: { shown: 0, total: 0 }, clipped: 0 }, where: {}, style: [0, 0], drawn: 1,
    })
    const es = [pageEntry(1, model(1), null), pageEntry(2, model(2), null)]
    expect(es[0]!.entry).toMatchObject({ contentLost: 1, slotsSkipped: 2, lineStartPunct: 1, contentUnknown: 3 })
    const t = fixtureTotals(es.map(e => e.entry), es.map(e => e.frames), 'model')
    expect(t).toMatchObject({ contentLost: 3, slotsSkipped: 4, contentUnknown: 6 })
    expect(t.modelRates).toMatchObject({ contentLost: 1.5, textInDisplay: 0 })
    expect(worse(measure('contentLost'), t, { ...t, modelRates: { ...t.modelRates, contentLost: 2 } }, 'model')?.worse).toBe(true)
  })
})
