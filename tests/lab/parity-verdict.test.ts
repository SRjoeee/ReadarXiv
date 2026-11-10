// @vitest-environment node
// The display gate's verdict (lab/typeset/parity/verdict.mjs, #629's review): a page is judged from what each side drew, and the
// gate passes only over the whole of what the run asked. Synthetic pages: one unit or figure text or link drawn or not, a
// unit's sentence boxes where today highlights it, where today draws it without, and where only v2 translates it, a head's
// label relabelled or kept, a size tie laid at one scale.
import { describe, expect, it } from 'vitest'
import type { Placed } from '@readarxiv/format'
// @ts-expect-error — a plain node module of the lab
import { coverageOf, measurePage, staleOf, verdictOf } from '../../lab/typeset/parity/verdict.mjs'
import { rowLinesOf } from '../../packages/typeset/src/index.ts'

type Line = { y: number; x0: number; x1: number; size: number; n: number; bold: number; italic: number; word: number; letter: number; text: string }
const line = (y: number, n = 12): Line => ({ y, x0: 72, x1: 300, size: 10, n, bold: 0, italic: 0, word: 0.3, letter: 0, text: 'x'.repeat(n) })
const N = 3
/** a page record as render.mjs writes it: today's and v2's drawn units, figure texts, links */
const rec = (o: { today?: object; v2?: object; original?: number } = {}) => ({
  page: N,
  original: { links: o.original ?? 0 },
  today: { units: [], figures: [], names: [], crops: [], links: 0, linksDrawn: 0, lit: [], litBoxes: {}, ...o.today },
  v2: { committed: true, units: [], crops: [], links: 0, linksDrawn: 0, lit: [], ...o.v2 },
  px: {},
})
/** v2.mjs's file of a pair: the page's members (Page) and the part's facts, the join to today's ords */
const v2Of = (o: { members?: object[]; facts?: object[]; ties?: number[][]; today?: Record<number, { today: number }>; pitch?: number[] } = {}) => ({
  pages: { [N]: { members: o.members ?? [], links: [] } },
  facts: { [N]: { members: o.facts ?? [], links: 0, ...(o.ties ? { ties: o.ties } : {}) } },
  today: o.today ?? {},
  ...(o.pitch ? { pitch: o.pitch } : {}),
})
/** `prep`: today's prepare dump's units (the original's lines of today's units, its figure texts among them) */
/** `led`: the part's run-ins, follower ord -> its leader's (a member the part joins to the one before it in its flow, or the
 *  member a bound name leads: measure.mjs reads them off the part); `top`: the part's title and front matter (Placed.title,
 *  Placed.front) */
/** `rows`: the lines of TeX's several members share whole, set centred or flush right, as the lay reads them (the typesetter's
 *  rowLinesOf over the part's flows: measure.mjs hands them in) */
const measure = (
  v2: ReturnType<typeof v2Of>,
  r: ReturnType<typeof rec>,
  prep: { ord: number }[] = [],
  led: Record<number, number> = {},
  top: number[] = [],
  rows?: ReturnType<typeof rowLinesOf>,
) =>
  measurePage('p-zh', v2, r, {
    prepByOrd: new Map(prep.map((u) => [u.ord, u])),
    todayOf: new Map(Object.entries(v2.today).map(([k, t]) => [Number(k), t.today])),
    turned: new Set(),
    led: new Map(Object.entries(led).map(([f, h]) => [Number(f), h])),
    top: new Set(top),
    ...(rows ? { rows } : {}),
  })
const worse = (p: { diffs: { flag: string; worse: boolean }[] }) => p.diffs.filter((d) => d.worse).map((d) => d.flag)

describe('a page measured from what each side drew', () => {
  it('a unit today shows translated that no member of v2 is joined to is a translation missing', () => {
    const p = measure(v2Of(), rec({ today: { units: [{ id: 7, lines: [line(400)] }] } }))
    expect(worse(p)).toEqual(['shown'])
    expect(p.diffs[0].v2.value).toBe("no member of v2's part joined to it")
  })
  it("a unit v2's member leaves the original's names that member's state", () => {
    const v2 = v2Of({ members: [{ ord: 11, state: 'unfit', lines: [] }], facts: [{ ord: 11, kind: 'para', align: 'j', style: { size: 10 }, lines: [] }], today: { 11: { today: 7 } } })
    const p = measure(v2, rec({ today: { units: [{ id: 7, lines: [line(400)] }] } }))
    expect(worse(p)).toEqual(['shown'])
    expect(p.diffs[0].v2.value).toBe('unfit')
  })
  it('figure texts are counted from the groups v2 drew, not the members its Page lays', () => {
    const fig = { ord: 50, kind: 'figure', align: 'l', style: { size: 8 }, lines: [] }
    const v2 = v2Of({ members: [{ ord: 50, state: 'laid', lines: [] }], facts: [fig] })
    const today = { figures: [{ id: 'f1', lines: [line(300, 4)] }] }
    const lost = measure(v2, rec({ today }))
    expect(worse(lost)).toEqual(['figures'])
    expect(lost.measures.figures).toEqual({ today: 1, v2: 0, v2Laid: 1 })
    const drawn = measure(v2, rec({ today, v2: { units: [{ id: 50, lines: [line(300, 4)] }] } }))
    expect(worse(drawn)).not.toContain('figures')
  })
  it('links are the anchors each side drew; a page today shows as arXiv\'s has the original\'s', () => {
    const lost = measure(v2Of(), rec({ original: 3, today: { links: 3, linksDrawn: 3 }, v2: { links: 3, linksDrawn: 2 } }))
    expect(worse(lost)).toEqual(['links'])
    expect(lost.measures.links).toMatchObject({ original: 3, today: 3, v2: 2, v2Laid: 3 })
    const asOriginal = measure(v2Of(), rec({ original: 3, today: { shownOriginal: true, links: 0, linksDrawn: 0 }, v2: { linksDrawn: 3 } }))
    expect(worse(asOriginal)).toEqual([])
  })
  it('links are counted per target per drawn line: a URL TeX broke over two lines is one link, however many lines each side draws it on', () => {
    // (2610.22065 p7 t126: its URL's two annotations on A, one at the end of a line and one at the start of the next (PDF units,
    // y up, 9.96 pt lines 11.96 apart), one after the other as TeX writes them (the 6th field: an annotation of A's); today draws
    // two anchors over two lines, v2 one over the one line it sets the URL on; a citation [5] of another target far under it)
    const url = 'https://arxiv.org/abs/1503.02531'
    const A = [
      [url, 420, 600, 540, 609.96, 1],
      [url, 72, 588.04, 160, 598, 1],
      ['#cite.5', 300, 400, 312, 409.96, 1],
    ]
    const T = [
      [url, 600, 300, 760, 315],
      [url, 100, 318, 220, 333],
      ['#cite.5', 400, 600, 416, 615],
    ]
    const V = [
      [url, 300, 300, 560, 315],
      ['#cite.5', 400, 600, 416, 615],
    ]
    const boxed = (o: object, boxes: unknown[][]) => ({ ...rec(o), original: { links: boxes.length, linkBoxes: boxes } })
    const one = measure(v2Of(), boxed({ today: { linksDrawn: 3, linkBoxes: T }, v2: { linksDrawn: 2, linkBoxes: V } }, A))
    expect(worse(one)).toEqual([])
    expect(one.measures.links).toMatchObject({ original: 2, today: 2, v2: 2 })
    // (a DOI TeX broke from the foot of the left column to the head of the right one: its two annotations one after the other on
    // A, far apart: one link; v2 draws the DOI on one line in two pieces, one link; today an anchor in each column, two lines not
    // one under the other, two: more than A's, none missing. 2610.22065 p7's s41928-018-0092-2)
    const doi = 'https://doi.org/10.1038/s41928-018-0092-2'
    const cols = measure(
      v2Of(),
      boxed(
        { today: { linkBoxes: [[doi, 189, 935, 208, 945], [doi, 443, 118, 488, 128]] }, v2: { linkBoxes: [[doi, 644, 353, 704, 361], [doi, 706, 354, 750, 360]] } },
        [[doi, 250, 72, 300, 80, 1], [doi, 320, 700, 360, 708, 1]],
      ),
    )
    expect(worse(cols)).toEqual([])
    expect(cols.measures.links).toMatchObject({ original: 1, today: 2, v2: 1 })
    // (the same target cited twice with another link between, on lines far apart: two links; v2 drawing one of them misses one)
    const twice = [...A, ['#cite.7', 300, 350, 312, 359.96, 1], ['#cite.5', 300, 300, 312, 309.96, 1]]
    const T2 = [...T, ['#cite.7', 400, 700, 416, 715], ['#cite.5', 400, 800, 416, 815]]
    const lost = measure(v2Of(), boxed({ today: { linkBoxes: T2 }, v2: { linkBoxes: [...V, ['#cite.7', 400, 700, 416, 715]] } }, twice))
    expect(worse(lost)).toEqual(['links'])
    expect(lost.measures.links).toMatchObject({ original: 4, today: 4, v2: 3 })
    // (a page today shows as arXiv's has the original's; a page v2 shows as arXiv's draws A's annotations, counted as A's)
    const asOriginal = measure(v2Of(), boxed({ today: { shownOriginal: true }, v2: { linkBoxes: A.map((b) => [...b.slice(0, 5), 1]) } }, A))
    expect(asOriginal.measures.links).toMatchObject({ original: 2, today: 2, v2: 2 })
  })
  it("link borders are the anchors each side drew with one, against the original's annotations PDF.js draws one round", () => {
    // (hyperref's boxes: three bordered annotations; v2 drawing its anchors with none is worse, whatever its links; a drawing of
    // before the borders were read judges none)
    const bordered = (o: object) => ({ ...rec(o), original: { links: 3, bordered: 3 } })
    const lost = measure(v2Of(), bordered({ today: { linksDrawn: 3, bordersDrawn: 3 }, v2: { linksDrawn: 3, bordersDrawn: 0 } }))
    expect(worse(lost)).toEqual(['borders'])
    expect(lost.measures.borders).toEqual({ original: 3, today: 3, v2: 0 })
    const kept = measure(v2Of(), bordered({ today: { linksDrawn: 3, bordersDrawn: 3 }, v2: { linksDrawn: 3, bordersDrawn: 3 } }))
    expect(worse(kept)).toEqual([])
    const asOriginal = measure(v2Of(), bordered({ today: { shownOriginal: true }, v2: { linksDrawn: 3, bordersDrawn: 2 } }))
    expect(worse(asOriginal)).toEqual(['borders'])
    const before = measure(v2Of(), rec({ original: 3, today: { linksDrawn: 3 }, v2: { linksDrawn: 3 } }))
    expect(worse(before)).toEqual([])
    expect(before.measures.borders).toBeNull()
  })
  it('a page either side did not draw is an error, not a page judged', () => {
    expect(measure(v2Of(), { ...rec(), error: 'screenshot failed' } as never).error).toBe('screenshot failed')
    // (a drawing of before today's sentence boxes were read: today's highlight cannot be judged on its cover)
    expect(measure(v2Of(), rec({ today: { lit: [7], litBoxes: undefined } })).error).toMatch(/sentence boxes not read/)
    expect(measure(v2Of(), rec({ today: { error: 'lay threw' } })).error).toBe("today's page not laid: lay threw")
    const { v2: _gone, ...noV2 } = rec()
    expect(measure(v2Of(), noV2 as never).error).toBe("v2's side not drawn")
  })
})

/** a line of the part's facts on page N: [page, -, x0, x1, baseline, top, bottom, m0, m1, -, size] */
const factLine = (x0: number, x1: number, y: number, size = 10) => [N, 0, x0, x1, y, y + 0.8 * size, y - 0.2 * size, 48, 300, 0, size]
const drawnLine = (x0: number, x1: number, y: number, text: string, size = 10): Line => ({ ...line(y, text.length), x0, x1, size, text })

describe("the highlight: today's feature for the units today highlights; elsewhere v2 judged on not drawing a wrong one", () => {
  // (a figure text v2 draws: its member laid, its one line drawn at 100–140 on 300, its original's line there on A)
  const fig = (lit: object) =>
    v2Of({
      members: [{ ord: 50, state: 'laid', lines: [], lit: { left: [], right: [], own: [], ...lit } }],
      facts: [{ ord: 50, kind: 'figure', align: 'l', style: { size: 8 }, lines: [factLine(100, 140, 300, 8)] }],
    })
  const v2Fig = { units: [{ id: 50, lines: [drawnLine(100, 140, 300, 'abcd', 8)] }] }
  const box = (x0: number, x1: number, y: number, size = 8) => [x0 - 0.5, y - 0.25 * size, x1 + 0.5, y + 0.9 * size]
  const right = { right: [[box(100, 140, 300)]], left: [[box(100, 140, 300)]] }
  const missLeft = { right: [[box(100, 140, 300)]], left: [[box(100, 140, 200)]] }
  const highlights = (p: { diffs: { flag: string }[] }) => p.diffs.filter((d) => d.flag === 'highlight')
  // (the same figure text translated by today too: its own group (g[data-f]) drawn at the figure's place, its unit in today's
  // prepare dump at the original's box)
  const todayFig = { figures: [{ id: 'f0', lines: [drawnLine(100, 146, 300, 'wxyz', 8)] }] }
  const prepFig = [{ ord: 90, kind: 'figure', lines: [{ page: N, x0: 100, x1: 140, baseline: 300, top: 306.4, bottom: 298.4, size: 8 }] }]

  describe('a unit only v2 translates (today left it English)', () => {
    it('no sentence boxes: no fault, today has none either', () => {
      expect(highlights(measure(fig({}), rec({ v2: v2Fig })))).toEqual([])
    })
    it('boxes covering its drawn line (right) and its original line (left): no fault', () => {
      expect(highlights(measure(fig(right), rec({ v2: v2Fig })))).toEqual([])
    })
    it("boxes that miss its original on the left, or part of its drawn line on the right: v2's fault, worse", () => {
      expect(highlights(measure(fig(missLeft), rec({ v2: v2Fig })))).toMatchObject([{ unit: 'p50 figure', worse: true }])
      const short = { right: [[box(100, 118, 300)]], left: [[box(100, 140, 300)]] }
      expect(highlights(measure(fig(short), rec({ v2: v2Fig })))).toMatchObject([{ unit: 'p50 figure', worse: true }])
    })
  })
  describe('a figure text both translate, matched by its original box (today has no highlight on figure texts)', () => {
    it('v2 without boxes: equal', () => {
      expect(highlights(measure(fig({}), rec({ today: todayFig, v2: v2Fig }), prepFig))).toEqual([])
    })
    it('v2 with boxes that cover it: better', () => {
      expect(highlights(measure(fig(right), rec({ today: todayFig, v2: v2Fig }), prepFig))).toMatchObject([{ unit: 'p50 figure', worse: false, nearer: 'v2' }])
    })
    it('v2 with boxes that miss: worse', () => {
      expect(highlights(measure(fig(missLeft), rec({ today: todayFig, v2: v2Fig }), prepFig))).toMatchObject([{ unit: 'p50 figure', worse: true }])
    })
  })
  describe('a unit both sides draw', () => {
    const v2 = (lit: object = {}) =>
      v2Of({ members: [{ ord: 11, state: 'laid', lines: [], lit: { left: [], right: [], own: [], ...lit } }], facts: [{ ord: 11, kind: 'para', align: 'j', style: { size: 10 }, lines: [factLine(72, 300, 400)] }], today: { 11: { today: 7 } } })
    // (today's sentence boxes as its page painted them, by its unit: render.mjs reads them off today's own shapes)
    const todayBoxes = { 7: { right: [[71, 397, 301, 409]], left: [[71, 397, 301, 409]] } }
    const page = (todayLit: number[], v2Lit: number[]) => rec({ today: { units: [{ id: 7, lines: [line(400)] }], lit: todayLit, litBoxes: todayBoxes }, v2: { units: [{ id: 11, lines: [line(400)] }], lit: v2Lit } })
    const its = { right: [[[71, 397, 301, 409]]], left: [[[71, 397, 301, 409]]] }
    it('today highlights it, v2 does not: worse (the highlight is a feature of today\'s there)', () => {
      expect(highlights(measure(v2(), page([7], [])))).toMatchObject([{ unit: 't7 para', worse: true }])
      expect(highlights(measure(v2(its), page([7], [11])))).toEqual([])
    })
    it('today does not highlight it: v2 none is equal, v2 covering it better, v2 missing it worse', () => {
      expect(highlights(measure(v2(), page([], [])))).toEqual([])
      expect(highlights(measure(v2(its), page([], [11])))).toMatchObject([{ unit: 't7 para', worse: false, nearer: 'v2' }])
      expect(highlights(measure(v2({ right: [[[71, 397, 150, 409]]], left: its.left }), page([], [11])))).toMatchObject([{ unit: 't7 para', worse: true }])
    })
  })
})

describe("a unit both sides draw that today highlights: judged on the lines each side's sentence boxes leave uncovered", () => {
  // (1810.04805 p8 t140's geometry: 13 drawn lines at 10.91 pt on 72–290.3, five of them reaching 295.7 and the fourth ending
  // at 126.5, a crop's ink past the text; v2's one sentence's boxes end at 290.3 and 121.1, so 6 of the 13 drawn lines stand
  // past them; its 18 original lines on A, which v2's boxes cover on the left)
  const ys = [523.5, 505.1, 486.6, 468.2, 438.2, 419.8, 401.4, 383, 364.5, 346.1, 327.7, 309.2, 290.8]
  const ends = [290.3, 290.3, 290.2, 126.5, 295.7, 272, 290.3, 295.7, 290.3, 295.7, 290.3, 290.3, 295.6]
  const boxEnds = [290.3, 290.3, 290.3, 121.1, 290.3, 266.6, 290.3, 290.3, 290.3, 290.3, 290.3, 290.3, 290.2]
  const drawn = ys.map((y, i) => drawnLine(72, ends[i]!, y, 'x'.repeat(20), 10.91))
  const orig = Array.from({ length: 18 }, (_, i) => factLine(72, 290, 700 - 12 * i, 10))
  const leftAll = [[71, 480, 291, 710]]
  const box = (x1: number, y: number) => [72, y - 1.3, x1, y + 9.6]
  const v2Boxes = (x1s: number[]) => ({ right: [ys.map((y, i) => box(x1s[i]!, y))], left: [leftAll] })
  const v2 = (lit: object) =>
    v2Of({ members: [{ ord: 140, state: 'laid', lines: [], lit: { left: [], right: [], own: [], ...lit } }], facts: [{ ord: 140, kind: 'para', align: 'j', style: { size: 10 }, lines: orig }], today: { 140: { today: 140 } } })
  const page = (f: ReturnType<typeof v2Of>, todayRight: number[][]) =>
    measure(f, rec({ today: { units: [{ id: 140, lines: drawn }], lit: [140], litBoxes: { 140: { right: todayRight, left: leftAll } } }, v2: { units: [{ id: 140, lines: drawn }], lit: [140] } }))
  const highlights = (p: { diffs: { flag: string }[] }) => p.diffs.filter((d) => d.flag === 'highlight')
  const todayCovers = ys.map((y, i) => box(ends[i]! + 2.25, y))

  it('v2 leaving 6 of 13 drawn lines uncovered where today covers them all is worse', () => {
    expect(highlights(page(v2(v2Boxes(boxEnds)), todayCovers))).toMatchObject([
      { unit: 't140 para', worse: true, v2: { value: '6 of 13 drawn, 0 of 18 original lines not covered' }, today: { value: '0 of 13 drawn, 0 of 18 original lines not covered' } },
    ])
  })
  it("today's own misses are not held against v2: as many lines uncovered on each side is no difference", () => {
    expect(highlights(page(v2(v2Boxes(boxEnds)), ys.map((y, i) => box(boxEnds[i]!, y))))).toEqual([])
  })
  it('v2 covering lines today leaves uncovered is nearer, never worse', () => {
    expect(highlights(page(v2(v2Boxes(ends.map((x) => x + 2.25))), ys.map((y, i) => box(boxEnds[i]!, y))))).toMatchObject([{ unit: 't140 para', worse: false, nearer: 'v2' }])
  })
  it('v2 with no sentence boxes leaves every line uncovered: worse', () => {
    expect(highlights(page(v2({}), todayCovers))).toMatchObject([{ unit: 't140 para', worse: true, v2: { value: '13 of 13 drawn, 18 of 18 original lines not covered' } }])
  })
})

describe('the highlight judged as the reader sees it: ink is ink, boxes as painted', () => {
  // (a unit both sides draw that today highlights, today's boxes covering it as its reader paints them; v2's Laid.lit box given
  // per test, which the measure paints as v2's reader does: 3 CSS px beside (2.25 pt at the parity's scale), half the page's
  // leading above and below)
  const at = (y: number, x1: number, text: string) => drawnLine(72, x1, y, text)
  const v2 = (boxes: number[][], ys: number[]) =>
    v2Of({
      members: [{ ord: 11, state: 'laid', lines: [], lit: { left: [ys.map((y) => [71, y - 3, 301, y + 9])], right: [boxes], own: [] } }],
      facts: [{ ord: 11, kind: 'para', align: 'j', style: { size: 10 }, lines: ys.map((y) => factLine(72, 300, y)) }],
      today: { 11: { today: 7 } },
    })
  const page = (f: ReturnType<typeof v2Of>, lines: Line[]) =>
    measure(
      f,
      rec({
        today: { units: [{ id: 7, lines }], lit: [7], litBoxes: { 7: { right: lines.map((l) => [69, l.y - 4, 305, l.y + 10]), left: lines.map((l) => [69, l.y - 4, 305, l.y + 10]) } } },
        v2: { units: [{ id: 11, lines }], lit: [11] },
      }),
    )
  const highlights = (p: { diffs: { flag: string; worse: boolean }[] }) => p.diffs.filter((d) => d.flag === 'highlight')

  it("a line ending in a CJK full stop, its box stopping at the mark's ink (the advance's first half), is covered", () => {
    // (the line drawn to 300, the full stop's advance 290-300 at 10 pt, its ink in 290-295: v2's box ends at 295)
    expect(highlights(page(v2([[71, 397, 295, 409]], [400]), [at(400, 300, `${'x'.repeat(20)}\u3002`)]))).toEqual([])
  })
  it('a box short of a line by less than the paint beside it is covered; by more, not', () => {
    expect(highlights(page(v2([[71, 397, 298, 409]], [400]), [at(400, 300, 'x'.repeat(20))]))).toEqual([])
    expect(highlights(page(v2([[71, 397, 295, 409]], [400]), [at(400, 300, 'x'.repeat(20))]))).toMatchObject([{ worse: true, v2: { value: '1 of 1 drawn, 0 of 1 original lines not covered' } }])
  })
  it("a box short of a line's band by less than half the page's leading is covered", () => {
    // (two lines 12 pt apart, their boxes 8 pt high: a gap of 4 between the rows, half the leading 2 above and below; each
    // box 0.5 pt above its line's band, which the half leading covers)
    const ys = [400, 388]
    expect(highlights(page(v2(ys.map((y) => [71, y - 0.5, 301, y + 7.5]), ys), ys.map((y) => at(y, 300, 'x'.repeat(20)))))).toEqual([])
  })
})

describe("a label in a translated unit: today's relabelled against v2's kept as the original's ink", () => {
  // (a numbered head "Proposition 1 (" set on the first line at 48.96–113.52, its name word to 98.04; the unit's text after it)
  const label = { ink: [N, 48.96, 256.26, 113.52, 265.18, 258.3], kind: 'head', name: ['Proposition', [N, 48.96, 256.26, 98.04, 265.18, 258.3]], num: ['1', [N, 101.63, 258.3, 106.61, 265.15, 258.3]] }
  const v2 = v2Of({
    members: [{ ord: 21, state: 'laid', lines: [], lit: { left: [], right: [], own: [] } }],
    facts: [{ ord: 21, kind: 'heading', align: 'l', style: { size: 10 }, label, lines: [factLine(48.96, 200, 258.3)] }],
    today: { 21: { today: 21 } },
  })
  const relabelled = drawnLine(48.96, 190, 258.3, 'Satz 1 (Wohlgestelltheit). ')
  const kept = drawnLine(113.52, 190, 258.3, 'Wohlgestelltheit). ')
  const english = drawnLine(48.96, 190, 258.3, 'Proposition 1 (Wohlgestelltheit). ')
  const page = (t: Line, v: Line) => measure(v2, rec({ today: { units: [{ id: 21, lines: [t] }], lit: [21] }, v2: { units: [{ id: 21, lines: [v] }] } }))
  const labels = (p: { diffs: { flag: string; worse: boolean; v2: { value: unknown } }[] }) => p.diffs.filter((d) => d.flag === 'shown' && d.v2.value === 'label')

  it("today relabels the head, v2 keeps the original's label: a translation missing, counted per unit", () => {
    const p = page(relabelled, kept)
    expect(labels(p)).toMatchObject([{ unit: 't21 heading', worse: true }])
    expect(p.worse).toBeGreaterThanOrEqual(1)
  })
  it('both relabel, both keep, or today draws the English word anew: no difference', () => {
    expect(labels(page(relabelled, relabelled))).toEqual([])
    expect(labels(page(kept, kept))).toEqual([])
    expect(labels(page(english, kept))).toEqual([])
  })
  it('v2 relabels a label today keeps: never judged worse', () => {
    expect(labels(page(kept, relabelled))).toEqual([])
  })
})

describe("a label read from the drawn text: drawn anew where the first line opens with a word and the label's number", () => {
  // (2610.30034's centred "Lemma 3 (": the label's ink 58.92–103.52, its name word to 88.25, the head's text after it to 244.25,
  // TeX's alignment centred; today draws the relabelled head from the label's start, v2 centres it, its first line starting
  // past the name's end)
  const lemma = { ink: [N, 58.92, 204.55, 103.52, 213.09, 206.36], kind: 'head', name: ['Lemma', [N, 58.92, 206.25, 88.25, 212.86, 206.36]], num: ['3', [N, 91.74, 206.29, 96.72, 213.09, 206.36]], punct: ['(', [N, 100.21, 204.55, 103.52, 213.02, 206.36]] }
  // (a caption "Fig. 4." whose number the part states with the abbreviation's stop, ".4": its name word to 59.6, its ink to 69.9)
  const fig = { ink: [N, 49, 600, 69.9, 607, 601], kind: 'caption', name: ['Fig', [N, 49, 600, 59.6, 607, 601]], num: ['.4', [N, 61, 600, 69.9, 607, 601]] }
  const v2 = (ord: number, kind: string, align: string, label: object, x0: number, y: number) =>
    v2Of({ members: [{ ord, state: 'laid', lines: [], lit: { left: [], right: [], own: [] } }], facts: [{ ord, kind, align, style: { size: 10 }, label, lines: [factLine(x0, 244.25, y)] }], today: { [ord]: { today: ord } } })
  const page = (f: ReturnType<typeof v2Of>, ord: number, t: Line, v: Line) =>
    measure(f, rec({ today: { units: [{ id: ord, lines: [t] }], lit: [ord] }, v2: { units: [{ id: ord, lines: [v] }] } }))
  const labels = (p: { diffs: { flag: string; v2: { value: unknown } }[] }) => p.diffs.filter((d) => d.flag === 'shown' && d.v2.value === 'label')

  it("a centred head v2 relabels, its line starting past the name's end, is relabelled, not kept", () => {
    const head = v2(81, 'heading', 'c', lemma, 103.52, 206.36)
    const today = drawnLine(58.24, 171.83, 206.36, 'Hilfssatz 3 (Zerlegung): ')
    const centred = drawnLine(94.51, 208.04, 206.36, 'Hilfssatz 3 (Zerlegung): ')
    expect(labels(page(head, 81, today, centred))).toEqual([])
  })
  it('a caption v2 keeps "Fig. 4." for, its line holding no label, is still a label kept', () => {
    const cap = v2(94, 'caption', 'j', fig, 69.9, 601)
    const today = drawnLine(49, 240, 601, 'Abb. 4. Ein Vergleich der Budgets')
    const kept = drawnLine(74.5, 240, 601, 'Ein Vergleich der Budgets')
    expect(labels(page(cap, 94, today, kept))).toMatchObject([{ unit: 't94 caption', worse: true }])
  })
  it("a kept label whose text opens with the label's number is no label drawn anew", () => {
    const head = v2(81, 'heading', 'c', lemma, 103.52, 206.36)
    const today = drawnLine(58.24, 171.83, 206.36, 'Hilfssatz 3 (3 Schritte): ')
    const kept = drawnLine(104, 208.04, 206.36, '3 Schritte): ')
    expect(labels(page(head, 81, today, kept))).toMatchObject([{ unit: 't81 heading', worse: true }])
  })
})

describe("a size tie (one paragraph's text is even) judged as one paragraph", () => {
  // (a run-in head, member 57, and its paragraph, member 59, set at 10 pt on A, which v2 ties to one scale; today lays them
  // independently)
  const v2 = (ties?: number[][]) =>
    v2Of({
      members: [57, 59].map((ord) => ({ ord, state: 'laid', lines: [], lit: { left: [], right: [], own: [] } })),
      facts: [
        { ord: 57, kind: 'heading', align: 'l', style: { size: 10 }, lines: [factLine(72, 120, 500)] },
        { ord: 59, kind: 'para', align: 'j', style: { size: 10 }, lines: [factLine(130, 300, 500), factLine(72, 300, 488)] },
      ],
      today: { 57: { today: 57 }, 59: { today: 59 } },
      ...(ties ? { ties } : {}),
    })
  const at = (size: number, x0: number, x1: number, y: number) => ({ ...drawnLine(x0, x1, y, 'x'.repeat(12), size) })
  const page = (t: [number, number], v: [number, number], ties?: number[][]) =>
    measure(
      v2(ties),
      rec({
        today: { units: [{ id: 57, lines: [at(t[0], 72, 120, 500)] }, { id: 59, lines: [at(t[1], 130, 300, 500), at(t[1], 72, 300, 488)] }], lit: [57, 59] },
        v2: { units: [{ id: 57, lines: [at(v[0], 72, 120, 500)] }, { id: 59, lines: [at(v[1], 130, 300, 500), at(v[1], 72, 300, 488)] }], lit: [57, 59] },
      }),
    )
  const sizes = (p: { diffs: { flag: string; unit: string | null; worse: boolean }[] }) => p.diffs.filter((d) => d.flag === 'size')

  it("today 0.9/1.0, v2's tie 0.9/0.9: its smallest member's size equal to today's smallest, no difference", () => {
    expect(sizes(page([9, 10], [9, 9], [[57, 59]]))).toEqual([])
  })
  it("a tie whose size is under today's smallest is worse, as one paragraph", () => {
    expect(sizes(page([9, 10], [8.5, 8.5], [[57, 59]]))).toMatchObject([{ unit: 'tie t57, t59', worse: true }])
  })
  it('members no tie holds are judged one by one, as before', () => {
    expect(sizes(page([9, 10], [9, 9]))).toMatchObject([{ unit: 't59 para', worse: true }])
  })
})

describe('gap: a follower the part states as run in after its leader, nothing else set on one line', () => {
  const gaps = (p: { diffs: { flag: string }[] }) => p.diffs.filter((d) => d.flag === 'gap')
  const laid = (ords: number[]) => ords.map((ord) => ({ ord, state: 'laid', lines: [], lit: { left: [], right: [], own: [] } }))
  // (two units on one line in one measure: e-mail addresses in two author columns, 2610.21313 p1; or a run-in head and its
  // paragraph)
  const pair = (kinds: [string, string]) =>
    v2Of({
      members: laid([10, 11]),
      facts: [
        { ord: 10, kind: kinds[0], align: 'l', style: { size: 10 }, lines: [factLine(72, 150, 700)] },
        { ord: 11, kind: kinds[1], align: 'l', style: { size: 10 }, lines: [factLine(160, 250, 700)] },
      ],
      today: { 10: { today: 10 }, 11: { today: 11 } },
    })
  const page = (f: ReturnType<typeof v2Of>, todayAt: number, v2At: number, led: Record<number, number> = {}) =>
    measure(
      f,
      rec({
        today: { units: [{ id: 10, lines: [drawnLine(72, 150, 700, 'x'.repeat(12))] }, { id: 11, lines: [drawnLine(todayAt, todayAt + 90, 700, 'x'.repeat(12))] }] },
        v2: { units: [{ id: 10, lines: [drawnLine(72, 150, 700, 'x'.repeat(12))] }, { id: 11, lines: [drawnLine(v2At, v2At + 90, 700, 'x'.repeat(12))] }] },
      }),
      [],
      led,
    )

  it('two units the part joins in no flow are no run-in: judged by their alignment, not by a gap', () => {
    const p = page(pair(['author', 'author']), 156.2, 160)
    expect(gaps(p)).toEqual([])
    expect(p.diffs.filter((d: { flag: string }) => d.flag === 'align')).toMatchObject([{ unit: 't11 author', nearer: 'v2' }])
  })
  it('a follower the part joins to its leader is judged by its gap', () => {
    expect(gaps(page(pair(['heading', 'para']), 160, 152, { 11: 10 }))).toMatchObject([{ unit: 't11 para after t10 heading', worse: true }])
  })
  it("a bound name v2 lays as its follower's lead (drawn in the follower's own line) has no gap of v2's to judge", () => {
    // (2608.16117 p37: the name "Appendix" 79.4–136.8 bound to the heading after it, 161.4–442.2; today keeps the name the
    // original's and draws the heading from 161.42; v2 draws "Anhang C. Einaxiale …" from 79.37, the name its lead)
    const f = v2Of({
      members: laid([236, 108]),
      facts: [
        { ord: 236, kind: 'name', align: 'j', style: { size: 11.96 }, lines: [factLine(79.4, 136.8, 739.5, 11.96)] },
        { ord: 108, kind: 'heading', align: 'j', style: { size: 11.96, bold: 1 }, lines: [factLine(161.4, 442.2, 739.5, 11.96)] },
      ],
      today: { 108: { today: 108 } },
    })
    const p = measure(
      f,
      rec({
        today: { units: [{ id: 108, lines: [drawnLine(161.42, 511.47, 739.48, 'Einaxiale Zugkraft', 11.96)] }] },
        v2: { units: [{ id: 108, lines: [drawnLine(79.37, 501.19, 739.48, 'AnhangC.Einaxiale Zugkraft', 11.96)] }] },
      }),
      [],
      { 108: 236 },
    )
    expect(gaps(p)).toEqual([])
  })
})

describe("anchor: a section heading set in fewer lines than the original's stands on its last lines", () => {
  // (1810.04805 p16 t265: a heading of two lines on A, 393.01 and 379.47 at 10.91 pt, each side's one line: today's 8.63 over
  // the first, v2's on the last (X.lastLines, the owner's ruling of 2026-10-19))
  const head = v2Of({
    members: [{ ord: 265, state: 'laid', lines: [], lit: { left: [], right: [], own: [] } }],
    facts: [{ ord: 265, kind: 'heading', align: 'l', style: { size: 10.91 }, lines: [factLine(72, 300, 393.01, 10.91), factLine(72, 200, 379.47, 10.91)] }],
    today: { 265: { today: 265 } },
  })
  const page = (t: Line[], v: Line[], top: number[] = []) =>
    measure(head, rec({ today: { units: [{ id: 265, lines: t }] }, v2: { units: [{ id: 265, lines: v }] } }), [], {}, top)
  const anchors = (p: { diffs: { flag: string }[] }) => p.diffs.filter((d) => d.flag === 'anchor')
  const one = (y: number) => [drawnLine(72, 250, y, 'x'.repeat(20), 10.91)]

  it("its last line against the original's last: v2 on it is nearer than today 8.63 over the first", () => {
    expect(anchors(page(one(401.64), one(379.47)))).toMatchObject([{ unit: 't265 heading', worse: false, nearer: 'v2' }])
  })
  it('the title and the front matter stay anchored at their first line', () => {
    expect(anchors(page(one(401.64), one(379.47), [265]))).toMatchObject([{ unit: 't265 heading', worse: true }])
  })
  it("a heading set in as many lines as the original's is read at its first line", () => {
    const two = (y: number) => [drawnLine(72, 250, y, 'x'.repeat(20), 10.91), drawnLine(72, 200, y - 13.54, 'x'.repeat(10), 10.91)]
    expect(anchors(page(two(393.01), two(379.47)))).toMatchObject([{ unit: 't265 heading', worse: true }])
  })
})

describe('the run judged whole', () => {
  const run = { id: 'r1', pairs: ['a-zh', 'b-ja'], done: true, stopped: null, missing: [] as { pair: string; why: string }[] }
  const raw = (pages: number[], expected: number[], o: object = {}) => ({ run: 'r1', v2: 'd1', expected, pages: pages.map((page) => ({ page })), ...o })
  const page = (pair: string, n: number, o: object = {}) => ({ pair, page: n, worse: 0, ...o })

  it('a raw file is measured only as this run drew it from the pages v2.mjs laid', () => {
    expect(staleOf({ ...run, missing: [{ pair: 'a-zh', why: 'no L1 bundle' }] }, 'a-zh', raw([1], [1]), 'd1')).toBe('not drawn (no L1 bundle)')
    expect(staleOf(run, 'a-zh', null, 'd1')).toBe('no raw file of this run')
    expect(staleOf(run, 'a-zh', raw([1], [1], { run: 'r0' }), 'd1')).toBe("its raw file is another run's")
    expect(staleOf(run, 'a-zh', raw([1], [1]), 'd2')).toBe("v2's pages were laid again after it was drawn")
    expect(staleOf(run, 'a-zh', raw([1], [1]), 'd1')).toBeNull()
  })
  it('nothing drawn, or no manifest, is not a pass', () => {
    expect(coverageOf(null, {})).toHaveLength(1)
    const none = coverageOf({ ...run, pairs: [] }, {})
    expect(none).toEqual(['no page measured'])
    expect(verdictOf(none, []).pass).toBe(false)
  })
  it('an asked pair not drawn, a page not drawn or failed, a drawing that did not finish: each fails the gate', () => {
    const drawn = new Map([['a-zh', raw([1, 2], [1, 2, 3])]])
    const pages = [page('a-zh', 1), page('a-zh', 2, { error: 'screenshot failed' })]
    const got = coverageOf({ ...run, done: false, stopped: 'the disk has under 12 GiB free' }, { notMeasured: new Map([['b-ja', 'not drawn (the disk has under 12 GiB free)']]), drawn, pages })
    expect(got).toEqual([
      'the drawing did not finish: the disk has under 12 GiB free',
      'a-zh p3: not drawn',
      'b-ja: not drawn (the disk has under 12 GiB free)',
      'a-zh p2: screenshot failed',
    ])
    expect(verdictOf(got, pages)).toMatchObject({ pass: false, worse: 0 })
  })
  it('the measure asked other pairs than the drawing drew', () => {
    const drawn = new Map([['a-zh', raw([1], [1])], ['b-ja', raw([1], [1])]])
    const pages = [page('a-zh', 1), page('b-ja', 1)]
    expect(coverageOf(run, { asked: ['a-zh'], drawn, pages })).toEqual(['the measure was asked a-zh, the drawing drew a-zh, b-ja'])
    expect(coverageOf(run, { asked: ['b-ja', 'a-zh'], drawn, pages })).toEqual([])
  })
  it('complete coverage passes with no page worse, and fails with one', () => {
    const drawn = new Map([['a-zh', raw([1], [1])], ['b-ja', raw([1], [1])]])
    const pages = [page('a-zh', 1), page('b-ja', 1)]
    expect(verdictOf(coverageOf(run, { drawn, pages }), pages)).toEqual({ pass: true, worse: 0, incomplete: [] })
    expect(verdictOf([], [page('a-zh', 1, { worse: 2 })])).toMatchObject({ pass: false, worse: 1 })
  })
})

describe("shown: a unit today draws in its own source's words misses no translation where v2 leaves the original's ink", () => {
  // (2608.25210 p1: an e-mail address alone, the stored row the address as it went; v2's part holds it as a kept line, its
  // ink the original's. 2610.21313 p1 t112: a row that translated the address's "bo", which v2 leaves)
  const prep = (text: string) => [{ ord: 499, kind: 'inknotes', text, lines: [{ page: N, x0: 92.47, x1: 192.23, baseline: 646.6, top: 653.55, bottom: 644.23, size: 9.96 }] }]
  const page = (drawn: string, source: string) =>
    measure(v2Of(), rec({ today: { units: [{ id: 499, lines: [drawnLine(92.47, 192.21, 646.6, drawn, 9.96)] }] } }), prep(source))
  const shown = (p: { diffs: { flag: string }[] }) => p.diffs.filter((d) => d.flag === 'shown')

  it("today's drawn text its source's letters and digits: no difference, the unit named apart", () => {
    const p = page('yiminglin@berkeley.edu ', 'yiminglin@berkeley.edu')
    expect(shown(p)).toEqual([])
    expect(p.measures.echoed).toEqual(['t499 inknotes'])
  })
  it("today's drawn text not its source's: a translation missing, as before", () => {
    expect(shown(page('博wang@sutd.edu.sg ', 'bo wang@sutd.edu.sg'))).toMatchObject([{ unit: 't499 inknotes', worse: true }])
  })
  it('a unit whose source holds no letter or digit is no echo: judged as before', () => {
    expect(shown(page('（）', '()'))).toMatchObject([{ unit: 't499 inknotes', worse: true }])
  })
})

describe("align: a drawn line's alignment is where its ink stands, a CJK mark's blank half no ink", () => {
  // (2608.25210 p13 t239, a centred cell ending with U+FF09 at 5.08 pt: v2's ink ends at its closing mark's ink, the first
  // half of its em, and stands on the original's middle; its advance box, a blank half past the ink, does not)
  const S = 10
  const cell = (align: string, x0: number, x1: number) =>
    v2Of({
      members: [{ ord: 239, state: 'laid', lines: [], lit: { left: [], right: [], own: [] } }],
      facts: [{ ord: 239, kind: 'cell', align, style: { size: S }, lines: [factLine(x0, x1, 700, S)] }],
      today: { 239: { today: 239 } },
    })
  type Crop = [number, number, number, number, number]
  const page = (f: ReturnType<typeof v2Of>, t: Line[], v: Line[], tc: Crop[] = [], vc: Crop[] = []) =>
    measure(f, rec({ today: { units: [{ id: 239, lines: t }], crops: tc }, v2: { units: [{ id: 239, lines: v }], crops: vc } }))
  const aligns = (p: { diffs: { flag: string }[] }) => p.diffs.filter((d) => d.flag === 'align')

  it("a centred line whose ink stands on the original's middle is nearer than one whose box does", () => {
    // (the original 100–200, middle 150; v2's box 97.5–207.5, its ink to 202.5: middle 150; today's box 95–205, middle 150 by
    // its box, its ink 95–200: 147.5)
    const p = page(cell('c', 100, 200), [drawnLine(95, 205, 700, 'x'.repeat(10) + '）', S)], [drawnLine(97.5, 207.5, 700, 'x'.repeat(10) + '）', S)])
    expect(aligns(p)).toMatchObject([{ unit: 't239 cell', worse: false, nearer: 'v2' }])
  })
  it("a right-aligned line ends where its closing mark's ink ends", () => {
    const p = page(cell('r', 100, 200), [drawnLine(100, 200, 700, 'x'.repeat(9) + '）', S)], [drawnLine(105, 205, 700, 'x'.repeat(9) + '）', S)])
    expect(aligns(p)).toMatchObject([{ unit: 't239 cell', worse: false, nearer: 'v2' }])
  })
  it("a line whose end is a crop's after a closing mark ends at the crop: the mark's blank half is no line's end", () => {
    // (2610.20484 p10 t97: v2's text ends with U+FF0C before a formula's crop that its text holds no stand-in for, today's holds
    // it as U+FFFC; both lines end at the crop's end, 200)
    const crop: Crop = [239, 185.5, 698, 200, 707]
    const p = page(cell('c', 100, 200), [drawnLine(100, 185, 700, '可行采样数，￼', S)], [drawnLine(100, 185, 700, '可行采样数，', S)], [crop], [crop])
    expect(aligns(p)).toEqual([])
    expect(p.faults.align?.v2 ?? 0).toBe(0)
  })
  it("a line whose start is a crop's before an opening mark starts at the crop", () => {
    // (2608.25210 p13 t320: a word in U+FF08 and U+FF09 after a formula's crop at 97–104; the original 97–140)
    const crop: Crop = [239, 97, 698, 104, 707]
    const t = [drawnLine(105, 145, 700, '￼￼（角色）', S)],
      v = [drawnLine(105, 145, 700, '（角色）', S)]
    const p = page(cell('c', 97, 140), t, v, [crop], [crop])
    expect(aligns(p)).toEqual([])
    expect(p.faults.align?.v2 ?? 0).toBe(0)
  })
  it("a raised mark after a closing mark ends the line: the line's end is the mark's ink", () => {
    // (a footnote mark "1" at 6 pt raised after U+3002, 190–194: the line's end is the mark's, not U+3002's blank half)
    const host = drawnLine(100, 190, 700, '实验结果。', S)
    const mark = { ...drawnLine(190, 194, 703, '1', 6), n: 1 }
    const p = page(cell('r', 100, 194), [host, mark], [host, mark])
    expect(p.faults.align?.v2 ?? 0).toBe(0)
    expect(p.units.find((u: { key: string }) => u.key === 't239').sides.v2.align.off).toBeCloseTo(0, 2)
  })
  it("a left line opening with a crop is held to the crop's start: an opening mark's blank half allowed only where it opens the line", () => {
    // (the original's start 72; today's crop at 72, v2's 5 pt in, each followed by U+FF08; before, the mark's allowance took
    // the crop's 5 pt off)
    const f = cell('l', 72, 300)
    const p = page(f, [drawnLine(80.5, 300, 700, '（甲乙丙）', S)], [drawnLine(85.5, 300, 700, '（甲乙丙）', S)], [[239, 72, 698, 80, 707]], [[239, 77, 698, 85, 707]])
    expect(aligns(p)).toMatchObject([{ unit: 't239 cell', worse: true }])
  })
  it("a left line opening with its own opening mark may set it at the margin or hang its blank half, as before", () => {
    const f = cell('l', 72, 300)
    const p = page(f, [drawnLine(72, 300, 700, '（甲乙丙）', S)], [drawnLine(67, 300, 700, '（甲乙丙）', S)])
    expect(aligns(p)).toEqual([])
  })
})

describe("cross: a drawn line over a rule or another unit by its ink, a CJK mark's blank half no ink", () => {
  // (2608.06701 p1 t351: a figure text set left by its ink, opening with U+201C at 3.56 pt; its box starts the mark's blank
  // half, 1.78 pt, before its ink, which starts where the original's does, 1.19 pt past the box's rule at 416.07; read by its
  // box, the line crossed the rule)
  const S = 10
  const f = v2Of({
    members: [{ ord: 351, state: 'laid', lines: [], lit: { left: [], right: [], own: [] } }],
    facts: [{ ord: 351, kind: 'figure', align: 'l', style: { size: S }, lines: [factLine(72, 140, 700, S)] }],
    today: { 351: { today: 351 } },
  })
  const page = (t: Line[], v: Line[], rules: number[][]) => {
    const r = rec({ today: { units: [{ id: 351, lines: t }] }, v2: { units: [{ id: 351, lines: v }] } })
    return measure(f, { ...r, px: { rules } })
  }
  const rule = [69.5, 650, 70, 750]
  it('a line whose opening mark hangs its blank half over a rule crosses none', () => {
    const p = page([drawnLine(72, 140, 700, '甲乙丙丁', S)], [drawnLine(67, 135, 700, '（甲乙丙）', S)], [rule])
    expect(p.faults.cross?.v2 ?? 0).toBe(0)
    expect(worse(p)).toEqual([])
  })
  it('a line whose ink is over a rule crosses it, as before', () => {
    const p = page([drawnLine(72, 140, 700, '甲乙丙丁', S)], [drawnLine(62, 130, 700, '甲乙丙丁', S)], [rule])
    expect(p.faults.cross?.v2).toBe(1)
    expect(worse(p)).toContain('cross')
  })
})

describe('a line of several members TeX centred (rowLinesOf) is judged by the line, not member by member', () => {
  // (TeX centres the whole line, so a member's place follows from the run: judged against its own original's middle, each name
  // of a line laid as one run is off by however much the other translations are shorter, and the per-member centring that made
  // the holes is the nearer. The line's run is judged instead, its middle against TeX's line's, and each separation by the gap)
  type M = { ord: number; kind: string; align: 'c' | 'j' | 'l' | 'r'; at: [number, number]; join?: number }
  /** the part's flow of the line's members, the facts v2.mjs states of them, and the lines rowLinesOf qualifies over that flow */
  const lineOf = (ms: M[], y: number, size: number, today: Record<number, number>) => {
    const placed = ms.map(
      (m): Placed => ({
        ord: m.ord,
        kind: m.kind,
        text: 'a'.repeat(64),
        lead: size * 1.2,
        style: { role: 'serif', size },
        align: m.align,
        lines: [factLine(m.at[0], m.at[1], y, size) as Placed['lines'][number]],
        room: { below: 20 },
        ...(m.join !== undefined ? { join: [m.join] as [number] } : {}),
      }),
    )
    const f = v2Of({
      members: laid(ms.map((m) => m.ord)),
      facts: ms.map((m) => ({ ord: m.ord, kind: m.kind, align: m.align, style: { size }, lines: [factLine(m.at[0], m.at[1], y, size)] })),
      today: Object.fromEntries(ms.map((m) => [m.ord, { today: today[m.ord] ?? m.ord }])),
    })
    const led = Object.fromEntries(ms.slice(1).map((m, k) => [m.ord, ms[k]!.ord]))
    return { f, led, rows: rowLinesOf([placed]) }
  }
  const laid = (ords: number[]) => ords.map((ord) => ({ ord, state: 'laid', lines: [], lit: { left: [], right: [], own: [] } }))
  const units = (ids: number[], at: [number, number][], y: number, size: number) =>
    ids.map((id, k) => ({ id, lines: [drawnLine(at[k]![0], at[k]![1], y, 'x'.repeat(4), size)] }))
  const aligns = (p: { diffs: { flag: string; unit: string; worse: boolean; nearer: string }[] }) =>
    p.diffs.filter((d) => d.flag === 'align').map((d) => [d.unit, d.worse, d.nearer])

  // (2610.21106v1 p1, toggles on: amsart's "NI XIANG AND YUNI XIONG", TeX's line 230.72-375.66 at 9.96 pt, the AND made on A
  // (part ord 107, today's 98); today centres each name on its own original's middle, the hole before the second name; v2 lays
  // the line as one run, centred)
  const amsart = lineOf(
    [
      { ord: 1, kind: 'author', align: 'c', at: [230.72, 278.94] },
      { ord: 107, kind: 'inkorphan', align: 'j', at: [282.27, 304.82], join: 3.83 },
      { ord: 3, kind: 'author', align: 'c', at: [308.14, 375.66], join: 3.89 },
    ],
    640.16,
    9.96,
    { 107: 98 },
  )
  const amsartPage = (v2At: [number, number][]) =>
    rec({
      today: { units: units([1, 98, 3], [[244.87, 264.79], [267.77, 287.7], [322.62, 353.51]], 640.16, 9.96) },
      v2: { units: units([1, 107, 3], v2At, 640.16, 9.96) },
    })
  const run: [number, number][] = [
    [263.04, 282.96],
    [286.8, 306.72],
    [310.36, 340.25],
  ]
  it('qualifies the line from the part, as the lay does', () => {
    expect([...amsart.rows.keys()]).toEqual([1, 107, 3])
    expect(amsart.rows.get(1)).toMatchObject({ ords: [1, 107, 3], align: 'c', rows: [{ baseline: 640.16, x0: 230.72, x1: 375.66 }] })
  })
  it('2610.21106v1 p1: judged member by member, its names are each off their own middles, worse than today', () => {
    expect(aligns(measure(amsart.f, amsartPage(run), [], amsart.led))).toEqual([
      ['t1 author', true, 'today'],
      ['t3 author', true, 'today'],
    ])
  })
  it('2610.21106v1 p1: judged by the line, its run stands nearer TeX’s middle than today’s, its gap TeX’s', () => {
    const p = measure(amsart.f, amsartPage(run), [], amsart.led, [], amsart.rows)
    expect(aligns(p)).toEqual([['line t1, t98, t3', false, 'v2']])
    expect(p.diffs.filter((d: { flag: string }) => d.flag === 'gap')).toMatchObject([{ unit: 't3 author after t98 inkorphan', worse: false, nearer: 'v2' }])
    expect(p.faults.align?.v2 ?? 0).toBe(0)
  })
  it('a line laid as one run but off TeX’s middle is still worse', () => {
    // (the same run 15 pt right of where TeX centred the line; today's 4 pt left of it)
    const off = run.map(([a, b]): [number, number] => [a + 15, b + 15])
    const p = measure(amsart.f, amsartPage(off), [], amsart.led, [], amsart.rows)
    expect(aligns(p)).toEqual([['line t1, t98, t3', true, 'today']])
    expect(p.faults.align?.v2).toBe(1)
  })

  // (2610.10069v1 p1, toggles on: article's \and, three names at 14.35 pt, TeX's line 121.60-495.22; today's names each about its
  // own middle, its gaps 21.23 and 42.26 where TeX's are 28.99; v2's run with TeX's separations)
  const article = lineOf(
    [
      { ord: 2, kind: 'author', align: 'c', at: [121.6, 222.6] },
      { ord: 4, kind: 'author', align: 'c', at: [251.59, 361.33], join: 29.56 },
      { ord: 6, kind: 'author', align: 'c', at: [390.32, 495.22], join: 29.57 },
    ],
    583,
    14.35,
    {},
  )
  const articlePage = rec({
    today: { units: units([2, 4, 6], [[121.6, 216.68], [237.91, 348.06], [390.32, 505.88]], 583, 14.35) },
    v2: { units: units([2, 4, 6], [[117.96, 208.74], [243.52, 348.65], [383.43, 493.25]], 583, 14.35) },
  })
  it('2610.10069v1 p1: judged member by member, its first name is off its own middle, worse than today', () => {
    expect(aligns(measure(article.f, articlePage, [], article.led)).filter(([, w]) => w)).toEqual([['t2 author', true, 'today']])
  })
  it('2610.10069v1 p1: judged by the line, nearer TeX’s middle than today’s', () => {
    expect(aligns(measure(article.f, articlePage, [], article.led, [], article.rows))).toEqual([['line t2, t4, t6', false, 'v2']])
  })
  it('a paragraph of several lines is judged line by line, each drawn line against TeX’s nearest it (2611.00342v1)', () => {
    // (IJCAI's names: TeX's two lines, 200-400 at 600 and 250-350 at 588, both centred on 300. Today's names each at their own
    // original's start, shorter: its lines 25 pt left of the middle; v2's run on one line, centred)
    const ms = [
      { ord: 2, at: [200, 300] as [number, number], y: 600 },
      { ord: 4, at: [304, 400] as [number, number], y: 600 },
      { ord: 6, at: [250, 350] as [number, number], y: 588 },
    ]
    const f = v2Of({
      members: laid(ms.map((m) => m.ord)),
      facts: ms.map((m) => ({ ord: m.ord, kind: 'author', align: 'c', style: { size: 10 }, lines: [factLine(m.at[0], m.at[1], m.y, 10)] })),
      today: Object.fromEntries(ms.map((m) => [m.ord, { today: m.ord }])),
    })
    const led = { 4: 2, 6: 4 }
    const line = {
      ords: [2, 4, 6],
      align: 'c' as const,
      rows: [
        { page: N, baseline: 600, x0: 200, x1: 400 },
        { page: N, baseline: 588, x0: 250, x1: 350 },
      ],
    }
    const rows = new Map(ms.map((m) => [m.ord, line]))
    const pg = rec({
      today: { units: [...units([2, 4], [[200, 260], [304, 350]], 600, 10), ...units([6], [[250, 300]], 588, 10)] },
      v2: { units: units([2, 4, 6], [[210, 270], [274, 330], [334, 390]], 600, 10) },
    })
    expect(aligns(measure(f, pg, [], led, [], rows))).toEqual([['line t2, t4, t6', false, 'v2']])
    // (a second line drawn off TeX's middle is the paragraph's fault, though the run's ends over both lines stand about it: v2's
    // first line centred, its second 30 pt right of the middle, today's 25 left)
    const off = rec({
      today: { units: [...units([2, 4], [[200, 260], [304, 350]], 600, 10), ...units([6], [[250, 300]], 588, 10)] },
      v2: { units: [...units([2, 4], [[220, 298], [302, 380]], 600, 10), ...units([6], [[300, 360]], 588, 10)] },
    })
    expect(aligns(measure(f, off, [], led, [], rows))).toEqual([['line t2, t4, t6', true, 'today']])
  })
  it('a line TeX set flush right is judged by its end', () => {
    const right = lineOf(
      [
        { ord: 2, kind: 'author', align: 'r', at: [300, 380] },
        { ord: 4, kind: 'author', align: 'r', at: [384, 480], join: 4 },
      ],
      583,
      10,
      {},
    )
    const page = (v: [number, number][]) =>
      rec({ today: { units: units([2, 4], [[310, 370], [400, 460]], 583, 10) }, v2: { units: units([2, 4], v, 583, 10) } })
    expect(aligns(measure(right.f, page([[350, 410], [414, 480]]), [], right.led, [], right.rows))).toEqual([['line t2, t4', false, 'v2']])
    expect(aligns(measure(right.f, page([[300, 360], [364, 430]]), [], right.led, [], right.rows))).toEqual([['line t2, t4', true, 'today']])
  })
})

describe("shown: a unit today draws on lines of the original that v2 draws translated as one of its own members misses none", () => {
  // (2608.25210v2 p17 with every toggle on: today cut reference [64] into two ink units, t517 "[64] Bin Zhang, …" and t518
  // ". Benchmarking the text-to-sql" after the year on the entry's second line; v2 lays the entry whole, its source unit 485,
  // translated over the same two lines. Joined by id, today's pieces have no member of v2's: read as two translations missing)
  const prep = [
    { ord: 517, kind: 'inknotes', lines: [{ page: N, x0: 317.96, x1: 558.2, baseline: 93.86, top: 98.77, bottom: 92.2, size: 6.97 }, { page: N, x0: 334.39, x1: 455.01, baseline: 86.01, top: 90.87, bottom: 84.35, size: 6.97 }] },
    { ord: 518, kind: 'inknotes', lines: [{ page: N, x0: 469.82, x1: 558.2, baseline: 86.01, top: 90.87, bottom: 84.35, size: 6.97 }] },
    { ord: 600, kind: 'inknotes', lines: [{ page: N, x0: 72, x1: 290, baseline: 86.01, top: 90.87, bottom: 84.35, size: 6.97 }] },
  ]
  const v2 = v2Of({
    members: [{ ord: 485, state: 'laid', lines: [] }],
    facts: [{ ord: 485, kind: 'reference', align: 'j', style: { size: 6.97 }, lines: [factLine(334.39, 558.2, 93.86, 6.97), factLine(334.39, 558.2, 86.01, 6.97)] }],
    today: { 485: { today: 485 } },
  })
  const today = {
    units: [
      { id: 517, lines: [drawnLine(317.96, 558.2, 93.86, 'abcdefgh', 6.97), drawnLine(334.39, 455.01, 86.01, 'abcd', 6.97)] },
      { id: 518, lines: [drawnLine(469.82, 558.2, 86.01, 'abcd', 6.97)] },
      { id: 600, lines: [drawnLine(72, 290, 86.01, 'abcd', 6.97)] },
    ],
  }
  const v2Units = { units: [{ id: 485, lines: [drawnLine(334.39, 558.2, 93.86, 'abcdefgh', 6.97), drawnLine(334.39, 558.2, 86.01, 'abcdefgh', 6.97)] }] }
  it("names them apart (`within`), no translation missing; a unit on a line v2 draws no member on stays one", () => {
    const p = measure(v2, rec({ today, v2: v2Units }), prep)
    const shown = (p.diffs as { flag: string; unit: string; worse: boolean }[]).filter((d) => d.flag === 'shown')
    expect(shown.map((d) => [d.unit, d.worse])).toEqual([['t600 inknotes', true]])
    expect(p.measures.within).toEqual(['t517 inknotes', 't518 inknotes'])
  })
})

describe("shown: a unit of the author block v2 leaves the original's with the names toggle off is the owner's ruling", () => {
  // (2610.21106v1 p1's AND, 2610.22065v1 p1's t147 and t150: today translated them; v2's members are the block's, which the
  // names toggle, off by default, keeps the original's: the owner's rulings of 2026-10-25 and 2026-11-09, PDF-READER §19.13)
  const page = (kind: string, toggles?: 'on') => {
    const v2 = {
      ...v2Of({ members: [{ ord: 11, state: 'left', lines: [] }], facts: [{ ord: 11, kind, align: 'c', style: { size: 10 }, lines: [] }], today: { 11: { today: 7 } } }),
      ...(toggles ? { toggles } : {}),
    }
    return measure(v2, rec({ today: { units: [{ id: 7, lines: [line(400)] }] } }))
  }
  const shown = (p: { diffs: { flag: string; worse: boolean; nearer: string }[] }) => p.diffs.filter((d) => d.flag === 'shown').map((d) => [d.worse, d.nearer])
  it("is the ruling's, not worse, for the block's kinds under the default toggles", () => {
    for (const k of ['inknames', 'author', 'affiliation']) expect(shown(page(k))).toEqual([[false, 'ruling']])
  })
  it('stays worse with every toggle on, and for a unit of another class (the block\'s data printed elsewhere: textnames)', () => {
    expect(shown(page('inknames', 'on'))).toEqual([[true, 'today']])
    expect(shown(page('textnames'))).toEqual([[true, 'today']])
    expect(shown(page('inkorphan'))).toEqual([[true, 'today']])
  })
})

describe("shown: a unit the prepare keeps as a line of e-mail addresses is the original's text (the coordinator's ruling of 2026-11-10)", () => {
  // (1512.03385v1 p1's `{ada, alan}@example.org` row, every toggle on: today sent its local parts and drew the reply; v2's prepare
  // keeps the line whole, a kept block its dump marks `keptBy: 'address'`, v2.mjs's `address` by member ord. An address is a
  // literal, never sent: the original's text, no translation missing. Today's unit is joined to the block or not (the block is a
  // new unit, ids apart): unjoined, it is the block's where every line of it lies on a line of the marked member's)
  type D = { flag: string; worse: boolean; nearer: string; ruling?: string }
  const shown = (p: { diffs: D[] }) => p.diffs.filter((d) => d.flag === 'shown').map((d) => [d.worse, d.nearer])
  const block = { ord: 371, kind: 'inknotes', align: 'c', style: { size: 10 }, lines: [factLine(195.49, 399.73, 599.46)] }
  const prepT = (x0: number, x1: number, y: number) => ({ ord: 321, kind: 'affiliation', lines: [{ page: N, x0, x1, baseline: y, top: y + 8, bottom: y - 2, size: 10 }] })
  const page = (o: { address?: number[]; joined?: boolean; y?: number; off?: boolean } = {}) => {
    const v2 = {
      ...v2Of({ members: [{ ord: 371, state: 'kept', lines: [] }], facts: [block], today: o.joined ? { 371: { today: 321 } } : {} }),
      ...(o.address ? { address: o.address } : {}),
      ...(o.off ? {} : { toggles: 'on' as const }),
    }
    return measure(v2, rec({ today: { units: [{ id: 321, lines: [drawnLine(195.49, 399.73, o.y ?? 599.46, 'wxyz')] }] } }), [prepT(195.49, 399.73, o.y ?? 599.46)])
  }
  it("is the ruling's, not worse, unjoined on the marked block's line or joined to it, whatever the toggles", () => {
    expect(shown(page({ address: [371] }))).toEqual([[false, 'ruling']])
    expect((page({ address: [371] }).diffs as D[]).find((d) => d.flag === 'shown')?.ruling).toMatch(/e-mail address/)
    expect(shown(page({ address: [371], joined: true }))).toEqual([[false, 'ruling']])
    expect(shown(page({ address: [371], off: true }))).toEqual([[false, 'ruling']])
  })
  it('stays worse with no mark, another member marked, or today\'s line not on the marked one', () => {
    expect(shown(page())).toEqual([[true, 'today']])
    expect(shown(page({ address: [372] }))).toEqual([[true, 'today']])
    expect(shown(page({ address: [371], y: 560 }))).toEqual([[true, 'today']])
  })
})

describe("shown, figures: a unit the prepare keeps for its text set wholly in a face of one pitch is the original's (the owner's ruling of 2026-11-10)", () => {
  // (2608.25210v2 p4's prompt boxes, set in a typewriter face: today translated them, keys and values garbled; v2's prepare keeps
  // them as the paper has them, Rule 1 (PDF-READER §18.21). The owner: translating or keeping are both fine, a garbled
  // translation never. The units it keeps are the ones the candidate's dump marks `keptBy: 'pitch'`, v2.mjs's `pitch`, by member
  // ord: no other unit v2 leaves the original's is ruled so)
  type D = { flag: string; worse: boolean; nearer: string; ruling?: string }
  const of = (flag: string) => (p: { diffs: D[] }) => p.diffs.filter((d) => d.flag === flag).map((d) => [d.worse, d.nearer])
  const unit = (pitch?: number[]) =>
    measure(
      v2Of({ members: [{ ord: 11, state: 'none', lines: [] }], facts: [{ ord: 11, kind: 'para', align: 'l', style: { size: 9 }, lines: [] }], today: { 11: { today: 7 } }, ...(pitch ? { pitch } : {}) }),
      rec({ today: { units: [{ id: 7, lines: [line(400)] }] } }),
    )
  it("a unit today translates that v2's prepare kept so: the ruling's, not worse", () => {
    expect(of('shown')(unit([11]))).toEqual([[false, 'ruling']])
    expect((unit([11]).diffs as D[]).find((d) => d.flag === 'shown')?.ruling).toMatch(/one pitch/)
  })
  it('a unit not so kept, or no mark recorded: a translation missing, worse', () => {
    expect(of('shown')(unit([12]))).toEqual([[true, 'today']])
    expect(of('shown')(unit())).toEqual([[true, 'today']])
  })
  // (two figure texts today translates, each its own group over its original's box; v2's figure members on those boxes, 50 kept
  // so by v2's prepare and 51 drawn translated, or not)
  const figFact = (ord: number, x0: number) => ({ ord, kind: 'figure', align: 'l', style: { size: 8 }, lines: [factLine(x0, x0 + 40, 300, 8)] })
  const prepFig = (ord: number, x0: number) => ({ ord, kind: 'figure', lines: [{ page: N, x0, x1: x0 + 40, baseline: 300, top: 306.4, bottom: 298.4, size: 8 }] })
  const figs = (o: { pitch?: number[]; v2Draws51: boolean }) =>
    measure(
      v2Of({ members: [{ ord: 50, state: 'none', lines: [] }, { ord: 51, state: 'laid', lines: [] }], facts: [figFact(50, 100), figFact(51, 200)], ...(o.pitch ? { pitch: o.pitch } : {}) }),
      rec({
        today: { figures: [{ id: 'f0', lines: [drawnLine(100, 140, 300, 'wxyz', 8)] }, { id: 'f1', lines: [drawnLine(200, 240, 300, 'wxyz', 8)] }] },
        v2: { units: o.v2Draws51 ? [{ id: 51, lines: [drawnLine(200, 240, 300, 'abcd', 8)] }] : [] },
      }),
      [prepFig(90, 100), prepFig(91, 200)],
    )
  it("figure texts fewer than today's by those v2's prepare kept so: the ruling's, not worse", () => {
    expect(of('figures')(figs({ pitch: [50], v2Draws51: true }))).toEqual([[false, 'ruling']])
  })
  it('fewer by more than those: worse; none so kept, or another member marked: worse', () => {
    expect(of('figures')(figs({ pitch: [50], v2Draws51: false }))).toEqual([[true, 'today']])
    expect(of('figures')(figs({ v2Draws51: true }))).toEqual([[true, 'today']])
    expect(of('figures')(figs({ pitch: [52], v2Draws51: true }))).toEqual([[true, 'today']])
  })
})
