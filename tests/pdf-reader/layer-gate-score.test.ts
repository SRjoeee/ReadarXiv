import { describe, expect, it } from 'vitest'
import { modelPage, type OrigLine, pixelPage, type UnitIn } from '../../lab/pdf/spikes/layer-gate/measure.mjs'
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
