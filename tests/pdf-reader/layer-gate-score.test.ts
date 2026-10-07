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
