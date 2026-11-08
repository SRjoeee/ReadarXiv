// @vitest-environment node
// The display gate's verdict (lab/typeset/parity/verdict.mjs, #629's review): a page is judged from what each side drew, and the
// gate passes only over the whole of what the run asked. Synthetic pages: one unit or figure text or link drawn or not, a
// unit's sentence boxes where today highlights it, where today draws it without, and where only v2 translates it, a head's
// label relabelled or kept, a size tie laid at one scale.
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { coverageOf, measurePage, staleOf, verdictOf } from '../../lab/typeset/parity/verdict.mjs'

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
const v2Of = (o: { members?: object[]; facts?: object[]; ties?: number[][]; today?: Record<number, { today: number }> } = {}) => ({
  pages: { [N]: { members: o.members ?? [], links: [] } },
  facts: { [N]: { members: o.facts ?? [], links: 0, ...(o.ties ? { ties: o.ties } : {}) } },
  today: o.today ?? {},
})
/** `prep`: today's prepare dump's units (the original's lines of today's units, its figure texts among them) */
/** `led`: the part's run-ins, follower ord -> its leader's (a member the part joins to the one before it in its flow, or the
 *  member a bound name leads: measure.mjs reads them off the part) */
const measure = (v2: ReturnType<typeof v2Of>, r: ReturnType<typeof rec>, prep: { ord: number }[] = [], led: Record<number, number> = {}) =>
  measurePage('p-zh', v2, r, {
    prepByOrd: new Map(prep.map((u) => [u.ord, u])),
    todayOf: new Map(Object.entries(v2.today).map(([k, t]) => [Number(k), t.today])),
    turned: new Set(),
    led: new Map(Object.entries(led).map(([f, h]) => [Number(f), h])),
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
    expect(p.diffs.filter((d) => d.flag === 'align')).toMatchObject([{ unit: 't11 author', nearer: 'v2' }])
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
