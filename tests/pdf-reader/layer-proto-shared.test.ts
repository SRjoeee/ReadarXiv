import { beforeAll, describe, expect, it } from 'vitest'
import { fakeConfig } from './helpers/groups'
import { build, installStubs, line, openRun, PAPERS, type Paper, type Run, runSnap } from './helpers/order-paper'

// A shared line (need.mjs rowLeadOf): a unit whose first row TeX set on the line another unit's last row ends — a run-in
// heading and its text (1810.04805's "Model Architecture", 1706.03762's "Acknowledgements"), a paragraph's part after the
// float that split it (2608.16117's units 57 and 59). The second unit's first line starts where the first's translation ends
// on the row, the original's separation after it, never where the original's did (after the English words' end: a Chinese
// heading left a gap of 60 pt before its text). Over papers of their own making (helpers/order-paper.ts: 10 pt type, a CJK
// character an em): each record's lines are [page, baseline, target, exact, mode, overflow, x0, x1, block]

beforeAll(() => { installStubs() })

type RecLine = [number, number, number | null, boolean, string, number, number, number, number]
const linesOf = (run: Run, id: number) => (run.stats.find(r => r.id === id) as unknown as { lines: RecLine[] } | undefined)?.lines
async function laid(paper: Paper, edit: (P: ReturnType<typeof build>) => void = () => {}, o: Parameters<typeof openRun>[1] = {}) {
  const P = build(paper)
  edit(P)
  const run = await openRun(P, o)
  for (let p = 1; p <= paper.pages; p++) await run.layFor(p)
  return run
}

/** a run-in head (unit 0, its row [20, x1] at baseline 250) and its text (unit 1, its first row 10 pt after it on that row, then
 *  two full rows), the head's translation `chars` CJK characters */
const runIn = (chars: number, x1 = 80): Paper => ({
  name: `run-in, ${chars}`, pages: 1, specs: [
    { id: 0, kind: 'heading', lines: [line(1, 250, 'Model Architecture', 20, x1)], chars, at: 0x4e00 },
    { id: 1, kind: 'para', lines: [line(1, 250, 'The model is a stack', x1 + 10, 280), line(1, 238, 'of identical layers, each with', 20, 280), line(1, 226, 'two sub-layers and a residual', 20, 280)], chars: 30, at: 0x5100 },
  ],
})
/** the same, its page's lines ink on the page as drawn (the paper beside the heading's row ends where the next unit's English
 *  begins, as on a paper's page: on a white page a slot widens to the text area's edge) */
const inkedRunIn = (chars: number): Paper => ({ ...runIn(chars), ink: true })
/** a paragraph (unit 0: two full rows from baseline 250, its last [20, 150] at 226) and its part after a float (unit 1: its
 *  first row [160, 280] on that last row, then two full rows), the paragraph's translation `chars` CJK characters */
const split = (chars: number): Paper => ({
  name: `split, ${chars}`, pages: 1, specs: [
    { id: 0, kind: 'para', lines: [line(1, 250, 'Uniaxial tension experiments', 20, 280), line(1, 238, 'usually consider traction-free', 20, 280), line(1, 226, 'conditions. The', 20, 150)], chars, at: 0x4e00 },
    { id: 1, kind: 'para', lines: [line(1, 226, 'increasing trend', 160, 280), line(1, 214, 'of the volumetric stretch can', 20, 280), line(1, 202, 'be tuned by the slenderness', 20, 280)], chars: 30, at: 0x5100 },
  ],
})

/** two items of an inline list (inparaenum): unit 0 two full rows and its last [20, 150] at 226, the next item's label "(2)"
 *  [154, 166] on that row (no unit's: kept as the original's), unit 1 from 170 on it, then two full rows; unit 0's translation
 *  `chars` CJK characters */
const listed = (chars: number): Paper => ({
  ...split(chars), name: `inline list, ${chars}`,
  specs: split(chars).specs.map(s => (s.id === 1 ? { ...s, lines: [line(1, 226, 'Under the routed', 170, 280), ...s.lines.slice(1)] } : s)),
  extra: [line(1, 226, '(2)', 154, 166)],
})

describe('a shared line with something kept between the two units (2610.21098 p2: inparaenum\'s "(2)")', () => {
  it('the unit before it ends its text on the row where TeX did, and the next unit\'s first line stays where TeX set it', async () => {
    // (before: the unit's last line ran on to its block's edge over the label and the next item's first words, while the next
    // unit, refused the row because the label stands between, was set at TeX's place: two units drawn over each other)
    const run = await laid(listed(66))
    const a = linesOf(run, 0)!, [b] = linesOf(run, 1)!
    const onRow = a.filter(l => Math.abs(l[1] - 226) < 10)
    expect(onRow.length, 'a line of it on the shared row').toBeGreaterThan(0)
    expect(onRow.every(l => l[7] <= 150 + 0.01), `its lines on the row end at ${onRow.map(l => l[7])}`).toBe(true)
    expect([b![1], b![6]]).toEqual([226, 170])
  })

  it('a line the fill sets over the shared row, within an em of it, ends there too, though no slot stands on the row itself', async () => {
    // (the shared row the unit's last, its foot: a leading that spreads two lines over its three rows sets the second 8 pt over
    // the row, more than half its pitch, and its text ran over the label (2610.21098 p2 u15 over u16 under a stop of half a pitch))
    const spread: Paper = {
      name: 'inline list, spread', pages: 1, extra: [line(1, 228, '(2)', 154, 166)], specs: [
        { id: 0, kind: 'para', lines: [line(1, 250, 'Uniaxial tension experiments', 20, 280), line(1, 239, 'usually consider traction-free', 20, 280), line(1, 228, 'conditions. The', 20, 150)], chars: 40, at: 0x4e00 },
        { id: 1, kind: 'para', lines: [line(1, 228, 'Under the routed', 170, 280), line(1, 217, 'of the volumetric stretch can', 20, 280), line(1, 206, 'be tuned by the slenderness', 20, 280)], chars: 30, at: 0x5100 },
      ],
    }
    const run = await laid(spread)
    const a = linesOf(run, 0)!
    const near = a.filter(l => Math.abs(l[1] - 228) < 10)
    expect(near.every(l => l[7] <= 150 + 0.01), `its lines within an em of the row: ${near.map(l => `${l[1]}:${l[7]}`)}`).toBe(true)
    const [b] = linesOf(run, 1)!
    expect([b![1], b![6]]).toEqual([228, 170])
  })

  it('only its line nearest the shared row ends there, where its rows stand closer than an em (Devin\'s review of #460)', async () => {
    // (10 pt type on rows 8 pt apart: the row before the shared one is within an em of it, and was cut to the shared row's end
    // too, though nothing of the next item stands on it)
    const tight: Paper = {
      name: 'inline list, tight rows', pages: 1, extra: [line(1, 234, '(2)', 154, 166)], specs: [
        { id: 0, kind: 'para', lines: [line(1, 250, 'Uniaxial tension experiments', 20, 280), line(1, 242, 'usually consider traction-free', 20, 280), line(1, 234, 'conditions. The', 20, 150)], chars: 60, at: 0x4e00 },
        { id: 1, kind: 'para', lines: [line(1, 234, 'Under the routed', 170, 280), line(1, 226, 'of the volumetric stretch can', 20, 280), line(1, 218, 'be tuned by the slenderness', 20, 280)], chars: 30, at: 0x5100 },
      ],
    }
    const run = await laid(tight)
    const a = linesOf(run, 0)!
    const nearest = a.reduce((n, l) => (Math.abs(l[1] - 234) < Math.abs(n[1] - 234) ? l : n))
    expect(nearest[7], `the line nearest the row (${nearest[1]}) ends where TeX ended the unit there`).toBeLessThanOrEqual(150 + 0.01)
    const others = a.filter(l => l !== nearest && l !== a.at(-1))
    expect(others.length).toBeGreaterThan(0)
    expect(others.every(l => l[7] > 150 + 0.01), `the lines above it end at ${others.map(l => `${l[1]}:${l[7]}`)}`).toBe(true)
  })
})

/** the same list, the next item's "(2)" its own label (the file's label row of unit 1, make.mjs labelOf: what TeX set before its
 *  start mark), as enumitem's `enumerate*` and paralist's `inparaenum` set an item (2610.21085v1 p2, 2610.21098v1 p2) */
const labelled = (chars: number): Paper => ({
  ...split(chars), name: `inline list, its own label, ${chars}`,
  specs: split(chars).specs.map(s => (s.id === 1 ? { ...s, lines: [line(1, 226, 'Under the routed', 170, 280), ...s.lines.slice(1)], label: line(1, 226, '(2)', 154, 166) } : s)),
})

describe('a shared line whose next unit\'s own label stands between the two (an inline list\'s item: 2610.21085 p2)', () => {
  it('the label goes with its item: the item\'s first line starts after the unit before\'s text on the row, the original\'s separation before the label', async () => {
    // (56 characters of 10 pt on rows of 260: two full rows and 4 on the shared one, the unit's text ending there near 60 (63.8,
    // with the fill's tracking); its English ended at 150 and the label began at 154: the item laid from 4 pt after that end, its
    // label first, its text after. Kept as the original's, the label held the item at TeX's place, 170, after a blank of 100 pt)
    const run = await laid(labelled(56))
    const a = linesOf(run, 0)!, [b] = linesOf(run, 1)!
    const onRow = a.filter(l => Math.abs(l[1] - 226) < 0.05)
    expect(onRow.length).toBe(1)
    expect(onRow[0]![7]).toBeLessThan(70)
    expect(b![1]).toBe(226)
    expect(b![6]).toBeCloseTo(onRow[0]![7] + 4, 1)
  })

  it('a label its shared line holds without its first word is never left alone at that line\'s end: its item opens on a line of its own, the label at its start', async () => {
    // (2610.21098v1 p2's "(2)", alone at the end of item (1)'s last line, its text a line under it. 50 characters: the
    // paragraph's translation one full line and 24 characters of the next, more than an em over the row (its last line the
    // shared one), ending at 257.8: room after it for the label and its space (16 pt) and not for a character more. A pitch
    // under that line the item would end lower than laid from TeX's row, so it is laid there, from the row's start (the corner))
    const run = await laid(labelled(50))
    const last = linesOf(run, 0)!.at(-1)!, [b] = linesOf(run, 1)!
    expect(last[1]).toBeGreaterThan(226 + 10)
    expect(last[7]).toBeGreaterThan(280 - 26)
    expect(b![1]).toBeLessThan(last[1] - 0.05)
    expect([b![1], b![6]]).toEqual([226, 20])
  })

  it('a label with something else kept between it and its item\'s first word stays the original\'s, and its item where TeX set it (Devin\'s review of #589)', async () => {
    // (a mark of the page at 167-169, outside the label's box [154, 166] and before the item's first word at 170: no glyph the item
    // carries. Carried, the label and the word moved to the row's start and the mark stayed at TeX's place, cut off from both)
    const run = await laid({ ...labelled(56), extra: [line(1, 226, '†', 167, 169)] })
    const a = linesOf(run, 0)!, [b] = linesOf(run, 1)!
    const onRow = a.filter(l => Math.abs(l[1] - 226) < 10)
    expect(onRow.length, 'a line of it on the shared row').toBeGreaterThan(0)
    expect(onRow.every(l => l[7] <= 150 + 0.01), `its lines on the row end at ${onRow.map(l => l[7])}`).toBe(true)
    expect([b![1], b![6]]).toEqual([226, 170])
  })

  it('a label the wrap could not give a group of its own stays the original\'s, and its item where TeX set it', async () => {
    const run = await laid(labelled(56), P => { Object.defineProperty(P.doc, 'getOptionalContentConfig', { configurable: true, value: async () => fakeConfig({ missing: ['u1.l'] }) }) })
    const [b] = linesOf(run, 1)!
    expect([b![1], b![6]]).toEqual([226, 170])
  })
})

describe('a shared line: the next unit\'s first line starts where the translation before it ends on the row', () => {
  it('a heading shorter than its English: its text starts 10 pt after the heading\'s end, where the fill left it', async () => {
    const run = await laid(runIn(3))
    const [a] = linesOf(run, 0)!, [b] = linesOf(run, 1)!
    // (three characters of 10 pt from 20: the heading's own end, and the fill set no tracking that would take it further)
    expect(a![7]).toBe(50)
    expect([b![1], b![6]]).toEqual([250, 60])
  })

  it('a heading ending in a full-width stop: its text starts the original\'s separation after the stop\'s ink, not its blank half (2010.11929v2 p4)', async () => {
    // (four characters of 10 pt from 20, the last an ideographic full stop whose ink ends 3.4 pt into its em: the heading's advance
    // ends at 60, its ink at 53.4, and its text 10 pt on, where it began at 70, 16.6 pt after the ink, against the original's 10)
    const paper = runIn(4)
    paper.specs[0] = { ...paper.specs[0]!, tr: '\u4e00\u4e01\u4e03\u3002' }
    const run = await laid(paper)
    const [a] = linesOf(run, 0)!, [b] = linesOf(run, 1)!
    expect(a![7]).toBe(60)
    expect([b![1], b![6]]).toEqual([250, 63.4])
  })

  it('a heading as long as its English: its text starts where the original\'s did', async () => {
    const run = await laid(runIn(6))
    const [a] = linesOf(run, 0)!, [b] = linesOf(run, 1)!
    expect(a![7]).toBe(80)
    expect([b![1], b![6]]).toEqual([250, 90])
  })

  it('a heading longer than its English: its text starts later, its first line shorter', async () => {
    const run = await laid(runIn(7))
    const [a] = linesOf(run, 0)!, [b] = linesOf(run, 1)!
    expect(a![7]).toBeGreaterThan(80)
    expect(b![1]).toBe(250)
    expect(b![6]).toBeCloseTo(a![7] + 10, 1)
  })

  it('a heading its row holds only below its floor runs on over the row at its size, its text after it (the owner\'s ruling of 2026-11-03: 2610.19159v1 p7)', async () => {
    // (nine characters for a row of 60 pt, the next unit's English 10 pt after it as ink: in its row alone at 0.725 of its
    // size, below the floor; now over the next unit's first row at its size, 90 pt, and its text from 10 pt after it)
    const run = await laid(inkedRunIn(9))
    const head = (run.stats as unknown as { id: number; f: number }[]).find(r => r.id === 0)!
    const [a] = linesOf(run, 0)!, [b] = linesOf(run, 1)!
    expect([head.f, a![6], a![7]]).toEqual([10, 20, 110])
    expect([b![1], b![6]]).toEqual([250, 120])
  })

  it('a heading its row cannot hold at all is drawn over the row, not left the original\'s', async () => {
    // (thirteen characters: past the floor's least, 0.6, in its row alone, so skipped `unfit` and its English left beside its
    // translated text; 2610.19159v1 p7's "Node-level grading still separates agents." in Japanese, 34 em for 17)
    const run = await laid(inkedRunIn(13))
    const head = (run.stats as unknown as { id: number; f: number }[]).find(r => r.id === 0)!
    expect([head.f, linesOf(run, 0)![0]![7], linesOf(run, 1)![0]![6]]).toEqual([10, 150, 160])
    expect(run.skipped).toEqual([])
  })

  it('a heading its row holds shrunk within its floor stays in its row: its text keeps its first line\'s room', async () => {
    // (eight characters, at 0.825 of its size in its row. Taken over the row wherever a heading fit smaller, its text paid for
    // it: 1810.04805v2's Russian p4, a heading from 0.85 to 1 and its paragraph, already below its floor, from 0.73 to 0.70)
    const run = await laid(inkedRunIn(8))
    const head = (run.stats as unknown as { id: number; f: number }[]).find(r => r.id === 0)!
    expect([head.f, linesOf(run, 0)![0]![7], linesOf(run, 1)![0]![6]]).toEqual([8.25, 84.02, 94.02])
  })

  it('a heading laid over the next unit\'s first row, that unit left the original\'s: laid again in its row alone, as before', async () => {
    // (the next unit's 400 characters fit none of its three rows: unfit, its English standing; the heading is then laid where it
    // was before the ruling, below its floor in its own row, never over that unit's English first row)
    const heavy: Paper = { ...inkedRunIn(9), specs: inkedRunIn(9).specs.map(x => (x.id === 1 ? { ...x, chars: 400 } : x)) }
    const run = await laid(heavy)
    const head = (run.stats as unknown as { id: number; f: number }[]).find(r => r.id === 0)!
    expect(linesOf(run, 1)).toBeUndefined()
    expect([head.f, linesOf(run, 0)![0]![7]]).toEqual([7.25, 83.29])
    expect((run.skipped as unknown as { id: number; code: string }[]).map(x => [x.id, x.code])).toEqual([[1, 'unfit']])
  })

  it('a heading before a unit left the original\'s as it is decided (its row not translated) stays in its row, as before', async () => {
    // (that unit is never laid: its English first row stays where TeX set it, and nothing may run over it. 2610.22065v1 p1's
    // "and" between two author names kept ran on 2 pt over the second before the next unit's placing was asked)
    const run = await laid(inkedRunIn(9), P => { P.rows.get(1)!.state = 'failed' })
    const head = (run.stats as unknown as { id: number; f: number }[]).find(r => r.id === 0)!
    expect(linesOf(run, 1)).toBeUndefined()
    expect([head.f, linesOf(run, 0)![0]![7]]).toEqual([7.25, 83.29])
  })

  it('a heading before a unit one of whose pages fails (left the original\'s unlaid) is laid again in its row alone, as before', async () => {
    // (the next unit runs on to page 2, which cannot be read: it is refused as its page fails, after its heading was laid over
    // its first row, so never laid; the heading goes back to its own row, never over that unit's English first row)
    const base = inkedRunIn(9)
    const paper: Paper = { ...base, pages: 2, fail: 2, specs: base.specs.map(x => (x.id === 1 ? { ...x, lines: [...x.lines, line(2, 250, 'connection around each of the two', 20, 280)] } : x)) }
    const run = await laid(paper)
    const head = (run.stats as unknown as { id: number; f: number }[]).find(r => r.id === 0)!
    expect(linesOf(run, 1)).toBeUndefined()
    expect([head.f, linesOf(run, 0)![0]![7]]).toEqual([7.25, 83.29])
    expect((run.skipped as unknown as { id: number; code: string }[]).map(x => [x.id, x.code])).toEqual([[1, 'page']])
  })

  it('a heading that begins on the page before keeps its rows: that page\'s pass paints it before the unit after it is laid', async () => {
    // (its first row at the foot of page 1, its last on page 2 before its text: below its floor in its rows, and not run on over
    // page 2's row, which could not be undone once painted should the text after it be left the original's)
    const across: Paper = { ...inkedRunIn(16), name: 'run-in over two pages', pages: 2, specs: [
      { id: 0, kind: 'heading', lines: [line(1, 30, 'Model', 20, 80), line(2, 250, 'Architecture', 20, 80)], chars: 16, at: 0x4e00 },
      { ...inkedRunIn(16).specs[1]!, lines: inkedRunIn(16).specs[1]!.lines.map(l => ({ ...l, page: 2 })) },
    ] }
    const run = await laid(across)
    const head = (run.stats as unknown as { id: number; f: number }[]).find(r => r.id === 0)!
    const a = linesOf(run, 0)!
    expect([head.f, a.map(l => [l[0], l[7]])]).toEqual([7.5, [[1, 80], [2, 78.2]]])
    expect(linesOf(run, 1)![0]!.slice(0, 2).concat(linesOf(run, 1)![0]![6])).toEqual([2, 250, 88.2])
  })

  it('a heading whose text would fall under its floor for it keeps its row, and its text the row\'s room, as before', async () => {
    // (a text of one row, 110 pt of it for 11 characters: from 10 pt after the heading's row it fits at its size; laid from the
    // end of the heading run on over the row, only below its floor. No unit is taken under its floor to lift another)
    const run = await laid({ name: 'run-in, a one-row text', pages: 1, ink: true, specs: [
      { id: 0, kind: 'heading', lines: [line(1, 250, 'Model', 20, 80)], chars: 9, at: 0x4e00 },
      { id: 1, kind: 'para', lines: [line(1, 250, 'The model is a stack', 90, 200)], chars: 11, at: 0x5100 },
    ] })
    const f = (id: number) => (run.stats as unknown as { id: number; f: number }[]).find(r => r.id === id)!.f
    expect([f(0), linesOf(run, 0)![0]![7]]).toEqual([7.25, 83.29])
    expect([f(1), linesOf(run, 1)![0]![6]]).toEqual([10, 93.29])
  })

  it('three units on one row, the last left the original\'s: the two before it laid back in their rows, as before', async () => {
    // (the first laid over the second's row, the second over the third's; the third unfit, the second laid again in its row
    // from the first's end, unfit there, so the first laid back in its own row and the second again from its end)
    const run = await laid({ name: 'three on a row', pages: 1, ink: true, specs: [
      { id: 0, kind: 'heading', lines: [line(1, 250, 'Model', 20, 80)], chars: 9, at: 0x4e00 },
      { id: 1, kind: 'heading', lines: [line(1, 250, 'Architecture', 90, 160)], chars: 10, at: 0x4f00 },
      { id: 2, kind: 'para', lines: [line(1, 250, 'The model is', 170, 280), line(1, 238, 'of identical layers, each with', 20, 280), line(1, 226, 'two sub-layers and a residual', 20, 280)], chars: 400, at: 0x5100 },
    ] })
    const at = (id: number) => linesOf(run, id)![0]!
    expect([at(0)[6], at(0)[7], at(1)[6], at(1)[7]]).toEqual([20, 83.29, 93.29, 163.62])
    expect(linesOf(run, 2)).toBeUndefined()
    expect((run.skipped as unknown as { id: number; code: string }[]).map(x => [x.id, x.code])).toEqual([[2, 'unfit']])
  })

  it('a heading left the original\'s (not translated): its text starts where TeX set it', async () => {
    const run = await laid(runIn(3), P => { P.rows.get(0)!.state = 'failed' })
    expect(linesOf(run, 0)).toBeUndefined()
    expect(linesOf(run, 1)![0]!.slice(0, 2).concat(linesOf(run, 1)![0]![6])).toEqual([1, 250, 90])
  })

  it('a paragraph whose translation ends on the shared row: the part after it starts 10 pt after that end, on its line', async () => {
    const run = await laid(split(30))
    const a = linesOf(run, 0)!, [b] = linesOf(run, 1)!
    // (its last line within an em of the row: four characters there, 20 to 60)
    const last = a.at(-1)!
    expect(226 - 10 < last[1] && last[1] < 226 + 10, `last line at ${last[1]}`).toBe(true)
    expect(last[7]).toBe(60)
    expect([b![1], b![6]]).toEqual([last[1], 70])
  })

  it('a paragraph whose leading set its last line off the shared row: the part after it stands on that line, not on TeX\'s row', async () => {
    // (2608.16117 p39: unit 115's two lines spread over its three rows, its last 7.2 pt over the row unit 119's first shares,
    // and unit 119 set from its end on TeX's baseline: one line of the page drawn as two, a few points apart)
    const run = await laid(split(30))
    const last = linesOf(run, 0)!.at(-1)!, [b] = linesOf(run, 1)!
    expect(Math.abs(last[1] - 226), `the paragraph's last line at ${last[1]}, off the row`).toBeGreaterThan(0.05)
    expect(Math.abs(last[1] - 226)).toBeLessThan(10)
    // (on the paragraph's baseline, from its end; the row it continues still TeX's, 226)
    expect([b![0], b![1], b![2], b![6]]).toEqual([1, last[1], 226, last[7] + 10])
  })

  it('a paragraph whose leading set its last line over the shared row, within an em: the part after it flows on from that line', async () => {
    // (2610.21098v1 p2's item (3): its first line on item (2)'s last, 9.5 pt over the row, and its second laid from TeX's row
    // under it, 26.4 pt down at a pitch of 16.9. Here 56 characters after the paragraph's 30, whose last line stands 8.4 pt over
    // the row: three lines, each a pitch under the one before, the first the paragraph's)
    const paper: Paper = { ...split(30), specs: split(30).specs.map(s => (s.id === 1 ? { ...s, chars: 56 } : s)) }
    const run = await laid(paper)
    const last = linesOf(run, 0)!.at(-1)!, b = linesOf(run, 1)!
    expect(last[1] - 226).toBeGreaterThan(0.05)
    expect(last[1] - 226).toBeLessThan(10)
    expect(b[0]![1]).toBe(last[1])
    const steps = b.slice(1).map((l, i) => Math.round((b[i]![1] - l[1]) * 100) / 100)
    expect(steps.length).toBe(2)
    expect(Math.abs(steps[0]! - steps[1]!), `its lines' steps ${steps}`).toBeLessThanOrEqual(0.02)
  })

  it('a paragraph whose last line stands on the shared row: the part after it stays on TeX\'s baseline', async () => {
    // (56 characters: two full lines and a few on the third, on the original's rows at its pitch, set a little closer)
    const run = await laid(split(56))
    const last = linesOf(run, 0)!.at(-1)!, [b] = linesOf(run, 1)!
    expect(last[1]).toBe(226)
    expect([b![1], b![2]]).toEqual([226, 226])
    expect(b![6]).toBeCloseTo(last[7] + 10, 1)
  })

  it('a paragraph whose translation ends higher: the part after it goes on on its last line, after its ink, and flows on from there', async () => {
    // (20 characters on rows of 260: one row, ending at 220 on 250; the part after it from there, the original's 10 pt after
    // the paragraph's end, its lines on at its own pitch: one paragraph read on, as the original's. Laid on TeX's row under it,
    // it stood a line's height under a translation spread at its own leading: 2610.21085v1 p2's items, 12 pt at 11.95 pt type)
    const run = await laid(split(20))
    const a = linesOf(run, 0)!, b = linesOf(run, 1)!
    expect(a.length).toBe(1)
    expect(b[0]![1]).toBe(a[0]![1])
    expect(b[0]![6]).toBeCloseTo(a[0]![7] + 10, 1)
    const steps = b.slice(1).map((l, i) => Math.round((b[i]![1] - l[1]) * 100) / 100)
    expect(steps.every(d => Math.abs(d - steps[0]!) <= 0.02), `its lines' steps ${steps}`).toBe(true)
    expect(b.at(-1)![1]).toBeGreaterThan(202)
  })

  it('a part whose first block is the shared row alone (a float right after it): the lines it flows on over that row take the paragraph\'s measure, not the row\'s remainder', async () => {
    // (2608.16117v1 p19's u59: "The increasing-" at the end of the line before Figure 9, its text going on after the figure. Its
    // first block was that row's remainder alone, [160, 280] here, and the lines it flowed on from the paragraph's last line,
    // over the rows the shorter translation left, were laid at that measure: "and", "MacKintosh," each on a narrow line at the
    // column's right edge. Here the part's later rows stand under a float 100 pt down, a block of their own)
    const floated: Paper = { ...split(20), name: 'split by a float', specs: split(20).specs.map(s => (s.id === 1 ? { ...s, lines: [line(1, 226, 'increasing trend', 160, 280), line(1, 126, 'of the volumetric stretch can', 20, 280), line(1, 114, 'be tuned by the slenderness', 20, 280)] } : s)) }
    const run = await laid(floated)
    const a = linesOf(run, 0)!, b = linesOf(run, 1)!
    expect(b[0]![1]).toBe(a.at(-1)![1])
    const over = b.slice(1).filter(l => l[1] >= 226 - 0.05)
    expect(over.length, 'a line it flows on over the shared row').toBeGreaterThan(0)
    expect(over.map(l => l[6])).toEqual(over.map(() => 20))
    expect(over.every(l => l[7] > 200), `their ends ${over.map(l => l[7])}`).toBe(true)
  })

  it('a part whose measure TeX widened under a wrapfigure beside the shared row: the lines it flows on over the row take the measure beside the figure, not its block\'s widest', async () => {
    // (the review of #595: the two units' rows around the shared row end at 150 beside a figure, the part's rows under it at 280.
    // Laid at the bounds of the part's block, its widest rows', the lines it flowed on over the row ran on over the figure)
    const wrapped: Paper = {
      name: 'split beside a wrapfigure', pages: 1, specs: [
        { id: 0, kind: 'para', lines: [line(1, 250, 'Uniaxial tension experiments', 20, 150), line(1, 238, 'usually consider', 20, 150), line(1, 226, 'conditions.', 20, 100)], chars: 10, at: 0x4e00 },
        { id: 1, kind: 'para', lines: [line(1, 226, 'The', 110, 150), line(1, 214, 'increasing trend', 20, 150), line(1, 202, 'of the volumetric', 20, 150), line(1, 190, 'stretch can be tuned by the', 20, 280), line(1, 178, 'slenderness of the sample', 20, 280)], chars: 60, at: 0x5100 },
      ],
    }
    const run = await laid(wrapped)
    const a = linesOf(run, 0)!, b = linesOf(run, 1)!
    expect(a.at(-1)![1] - 226, 'the paragraph ends above the shared row').toBeGreaterThan(0.05)
    expect(b[0]![1]).toBe(a.at(-1)![1])
    const over = b.slice(1).filter(l => l[1] >= 226 - 0.05)
    expect(over.length, 'a line it flows on over the shared row').toBeGreaterThan(0)
    expect(over.every(l => l[7] <= 150 + 0.01), `their ends ${over.map(l => `${l[1]}:${l[7]}`)}`).toBe(true)
  })

  it('a shared row at a page\'s foot, no room on the line before it: the part after it keeps a line on that page, laid from TeX\'s row', async () => {
    // (2501.14787v1 p57's u423, "So here, we aren't thinking of a, b as numbers…" after u422's "…as seen in the diagram below:" on
    // p57's last line. u422's translation ended on the line over the row with no room after it, so u423 flowed on a pitch under
    // that line, which at its leading stood under the row, past the foot of its block on p57, the row alone: none of it was laid
    // on p57, its row was erased and drawn empty, and all its text went to p58. The check that lays it from TeX's row as before
    // read its first line, on p58, as higher than the line before on p57. Here the row is page 1's foot, the part's other rows
    // at the top of page 2, its rows 14 pt apart: the paragraph's 50 characters two lines, the second 11.7 pt over the row, more
    // than an em, and ending at 260)
    const overPage: Paper = {
      name: 'a shared row at a page\'s foot', pages: 2, specs: [
        { id: 0, kind: 'para', lines: [line(1, 254, 'Uniaxial tension experiments', 20, 280), line(1, 240, 'usually consider traction-free', 20, 280), line(1, 226, 'conditions. The', 20, 150)], chars: 50, at: 0x4e00 },
        { id: 1, kind: 'para', lines: [line(1, 226, 'increasing trend', 160, 280), line(2, 270, 'of the volumetric stretch can', 20, 280), line(2, 258, 'be tuned by the slenderness', 20, 280)], chars: 40, at: 0x5100 },
      ],
    }
    const run = await laid(overPage)
    const a = linesOf(run, 0)!, b = linesOf(run, 1)!
    expect(a.every(l => l[0] === 1 && l[1] > 226 + 0.05), `the paragraph's lines ${a.map(l => `${l[0]}/${l[1]}`)}`).toBe(true)
    const onPage1 = b.filter(l => l[0] === 1)
    expect(onPage1.map(l => l[1]), `the part's lines ${b.map(l => `${l[0]}/${l[1]}`)}`).toEqual([226])
    expect(onPage1[0]![6]).toBe(20)
  })

  it('a paragraph whose translation fills the shared row: the part after it starts on its next row', async () => {
    const run = await laid(split(51))
    const a = linesOf(run, 0)!, b = linesOf(run, 1)!
    expect(a.at(-1)![7]).toBeGreaterThan(280 - 10 - 15)
    // (no line of it on the shared row, all of it drawn below)
    expect(b.every(l => l[1] < 226 - 1), `first line at ${b[0]![1]}`).toBe(true)
    expect(run.skipped.map(s => s.id)).toEqual([])
  })
})

describe('a shared row as the unit before it leaves it (layer2.mjs shareOf, keepsShare): within an em of its baseline', () => {
  // (a block of three rows, the last the shared one at 226, 10 pt type: its band an em, 10 pt; a line is what the two read of a
  // laid line, its page, baseline, start and width)
  const blocks = [{ page: 1, B: [250, 238, 226], x0: 20, x1: 280 }] as never
  const row = { page: 1, baseline: 226, size: 10 }
  const L = (baseline: number, x0: number, used: number) => ({ page: 1, baseline, x0, used })
  type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  let L2: L2
  beforeAll(async () => { L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs') })

  it('a line just inside the em is on the row: its end and its own baseline, which the next unit stands on', () => {
    const share = L2.shareOf({ lines: [L(250, 20, 260), L(235.99, 20, 40)] } as never, blocks, row)!
    expect([share.end, share.at]).toEqual([60, 235.99])
  })

  it('a line an em away is not on the row: the unit\'s last line, it is the shared line above it, its end and its baseline', () => {
    const share = L2.shareOf({ lines: [L(250, 20, 260), L(236, 20, 40)] } as never, blocks, row)!
    expect([share.end, share.at, share.above]).toEqual([60, 236, true])
    // (its last line on another page, or another column's: the row is free)
    const away = L2.shareOf({ lines: [L(250, 20, 260), { ...L(236, 20, 40), page: 2 }] } as never, blocks, row)!
    expect([away.end, away.at, away.above]).toEqual([null, null, undefined])
    const beside = L2.shareOf({ lines: [L(250, 20, 260), L(236, 300, 40)] } as never, blocks, row)!
    expect([beside.end, beside.at]).toEqual([null, null])
  })

  it('a fill keeps a shared line above the row only where it stays the unit\'s last line, on its baseline, ending no further right', () => {
    const share = L2.shareOf({ lines: [L(250, 20, 260), L(236, 20, 40)] } as never, blocks, row)!
    expect(L2.keepsShare(share, { lines: [L(250, 20, 260), L(236, 20, 40)] } as never)).toBe(true)
    expect(L2.keepsShare(share, { lines: [L(250, 20, 260), L(236, 20, 30)] } as never)).toBe(true)
    expect(L2.keepsShare(share, { lines: [L(250, 20, 260), L(235, 20, 40)] } as never)).toBe(false)
    expect(L2.keepsShare(share, { lines: [L(250, 20, 260), L(236, 20, 41)] } as never)).toBe(false)
    expect(L2.keepsShare(share, { lines: [L(250, 20, 260), L(236, 20, 260), L(226, 20, 10)] } as never)).toBe(false)
    expect(L2.keepsShare(share, { lines: [L(250, 20, 260)] } as never)).toBe(false)
  })

  it('a line on TeX\'s row gives that row\'s baseline', () => {
    const share = L2.shareOf({ lines: [L(250, 20, 260), L(238, 20, 260), L(226, 20, 40)] } as never, blocks, row)!
    expect([share.end, share.at]).toEqual([60, 226])
  })

  it('a fill keeps the row only where its line there stays on the fit\'s baseline, ends no further right, and adds none', () => {
    const share = L2.shareOf({ lines: [L(250, 20, 260), L(232, 20, 40)] } as never, blocks, row)!
    expect(L2.keepsShare(share, { lines: [L(250, 20, 260), L(232, 20, 40)] } as never)).toBe(true)
    // (shorter there, or gone from the row: the next unit, laid from the fit's end, is still clear of it)
    expect(L2.keepsShare(share, { lines: [L(250, 20, 260), L(232, 20, 30)] } as never)).toBe(true)
    expect(L2.keepsShare(share, { lines: [L(250, 20, 260)] } as never)).toBe(true)
    // (moved within the em: the next unit's first line, on the fit's baseline, would stand a step from it)
    expect(L2.keepsShare(share, { lines: [L(250, 20, 260), L(231.5, 20, 40)] } as never)).toBe(false)
    expect(L2.keepsShare(share, { lines: [L(250, 20, 260), L(232, 20, 41)] } as never)).toBe(false)
    const free = L2.shareOf({ lines: [L(250, 20, 260)] } as never, blocks, row)!
    expect(L2.keepsShare(free, { lines: [L(250, 20, 200), L(230, 20, 10)] } as never)).toBe(false)
  })

  // (a laid line with its items: a CJK character an em at 10 pt, the last item's place `x` and width, and its face)
  const face = { family: 'serif', weight: 400, style: 'normal' }
  const T = (s: string, extra = {}) => ({ s, face, cls: 'cjk', ...extra })
  const laidLine = (baseline: number, items: { t: object; x: number; w: number }[]) => {
    const x0 = items[0]!.x, end = items.at(-1)!.x + items.at(-1)!.w
    return { page: 1, baseline, x0, used: end - x0, items }
  }
  const layoutOf = (lines: object[], state = { track: 0, trackLatin: 0 }) => ({ lines, f: 10, state }) as never

  it('its ink: a full-width stop at its end ends its ink 0.34 em into its em, its blank half no text (2010.11929v2 p4)', () => {
    const l = laidLine(226, [{ t: T('\u4e00'), x: 20, w: 10 }, { t: T('\u4e01'), x: 30, w: 10 }, { t: T('\u3002', { punct: 'close' }), x: 40, w: 10 }])
    const share = L2.shareOf(layoutOf([L(250, 20, 260), l]), blocks, row)!
    expect([share.end, share.at, share.ink]).toEqual([50, 226, 43.4])
  })

  it('its ink: the advance\'s end where the last glyph\'s ink reaches it, a crop\'s box, and none past the line\'s end', () => {
    const word = laidLine(226, [{ t: { s: 'ab', face, cls: 'latin' }, x: 20, w: 10 }])
    expect(L2.shareOf(layoutOf([word]), blocks, row)!.ink).toBe(30)
    const crop = laidLine(226, [{ t: T('\u4e00'), x: 20, w: 10 }, { t: { crop: [0, 0, 1, 1], cw: 14 }, x: 31, w: 14 }])
    expect(L2.shareOf(layoutOf([crop]), blocks, row)!.ink).toBe(45)
    // (a line with no items, as these cases' lines: its end)
    expect(L2.shareOf(layoutOf([L(226, 20, 40)]), blocks, row)!.ink).toBe(60)
    // (a word's tracking stands before its last character's ink, and after it: the line's end holds it, the ink does not)
    const tracked = laidLine(226, [{ t: { s: 'ab', face, cls: 'latin' }, x: 20, w: 12 }])
    expect(L2.shareOf(layoutOf([tracked], { track: 0, trackLatin: 0.1 }), blocks, row)!.ink).toBe(31)
  })

  it('a fill keeps the row only where the ink there ends no further right than the fit\'s', () => {
    const stop = (x: number, w = 10) => laidLine(226, [{ t: T('\u4e00'), x: x - 10, w: 10 }, { t: T('\u3002', { punct: 'close' }), x, w }])
    const share = L2.shareOf(layoutOf([stop(40)]), blocks, row)!
    expect([share.end, share.ink]).toEqual([50, 43.4])
    expect(L2.keepsShare(share, layoutOf([stop(40)]))).toBe(true)
    // (the stop moved 3 pt on and its blank half cut: its end 3 pt short of the fit's, its ink 3 pt past it)
    expect(L2.keepsShare(share, layoutOf([stop(43, 5)]))).toBe(false)
  })
})

describe("a shared line and the gap under a paragraph (layer2.mjs footFloorAt, run.mjs edgesOf): no line on the row moves", () => {
  type Half = { head: boolean; foot: boolean; below: number } | null
  const halfOf = (run: Run, id: number) => (run.placed.find(p => p.id === id) as unknown as { P: { halfLead: Half } }).P.halfLead
  const leadOf = (run: Run, id: number) => (run.placed.find(p => p.id === id) as unknown as { layout: { state: { lead: number } } }).layout.state.lead
  /** laid as `laid` lays it, the run keeping what it laid (its units' P and layout, which a run that lets go drops) */
  async function kept(paper: Paper, edit: (P: ReturnType<typeof build>) => void = () => {}) {
    const P = build(paper)
    edit(P)
    const run = await openRun(P, { free: false })
    for (let p = 1; p <= paper.pages; p++) await run.layFor(p)
    return run
  }

  it("keeps the next unit's first line on the shared row while its lines spread: the paragraph before it ends on the row, no floor raising it", async () => {
    const run = await kept(split(30))
    // (each shares the row with the other's ink, within its frame's span: the paragraph before is asked no floor (its foot),
    // and the part after it, whose first line no rule moves, is marked so too; it stands on the baseline the paragraph before
    // ends on, the shared row's (fix/shared-line-baseline), however far its own lines spread)
    expect([halfOf(run, 0)?.foot, halfOf(run, 1)?.head]).toEqual([false, false])
    expect(leadOf(run, 1)).toBeGreaterThan(1)
    expect(linesOf(run, 1)![0]![1]).toBe(linesOf(run, 0)!.at(-1)![1])
  })

  it("keeps a run-in heading's text on the heading's row while it spreads; the heading's frame of one line gives no room", async () => {
    const run = await kept(runIn(3))
    expect(halfOf(run, 1)?.head).toBe(false)
    expect(leadOf(run, 1)).toBeGreaterThan(1)
    expect([linesOf(run, 0)![0]![1], linesOf(run, 1)![0]![1]]).toEqual([250, 250])
  })

  it("keeps the row's baseline where the unit before it is left the original's: its ink still stands on the row", async () => {
    const run = await kept(runIn(3), P => { P.rows.get(0)!.state = 'failed' })
    expect(halfOf(run, 1)?.head).toBe(false)
    expect(linesOf(run, 1)![0]![1]).toBe(250)
  })
})

describe('a shared line in the order of the asks', () => {
  it('lays the unit before it first, whatever their ranks: the part after a float on page 2 of a paragraph from page 1', async () => {
    // (helpers/order-paper's S-E: unit 1's first row continues unit 0's last on page 2; unit 0 runs from page 1, so it ranks after
    // unit 1 on page 2; and the head of page 2 (2) and its text (3) running on to page 3, which page 4's closure lays)
    const { PAPERS } = await import('./helpers/order-paper')
    const paper = PAPERS.find(x => x.name === 'S-E shared line')!
    const run = await laid(paper)
    const a = linesOf(run, 0)!.at(-1)!, b = linesOf(run, 1)![0]!, h = linesOf(run, 2)![0]!, t = linesOf(run, 3)![0]!
    expect([a[0], a[1]]).toEqual([2, 258])
    expect([b[0], b[1], b[6]]).toEqual([2, 258, a[7] + 10])
    expect([t[0], t[1], t[6]]).toEqual([2, 60, h[7] + 10])
    // (laid in the order the shared lines need: 0 before 1, 2 before 3)
    expect(run.order.indexOf(0)).toBeLessThan(run.order.indexOf(1))
    for (const p of [2, 3, 4]) {
      const alone = await openRun(build(paper))
      await alone.layFor(p)
      const want = run.stats.filter(r => r.pages.includes(p)).map(({ ms: _, ...r }) => r)
      expect(alone.stats.filter(r => r.pages.includes(p)).map(({ ms: _, ...r }) => r), `page ${p} alone`).toEqual(want)
    }
  })
})

describe('the page fill keeps a shared row as it is drawn: each try settled before the row is read (fillPage)', () => {
  it('a try its settling moves off the row\'s baseline is not taken: the row stays one line', async () => {
    const { fillPage } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const run = await laid(split(56), undefined, { free: false })
    type Laid = { id: number; share: { at: number | null }; clear: unknown; layout: { lines: { baseline: number }[] } }
    const p = run.placed.find(u => u.id === 0) as unknown as Laid
    // (the paragraph's last line on the shared row, TeX's, which the part after it stands on: the fit's)
    expect([p.layout.lines.at(-1)!.baseline, p.share.at]).toEqual([226, 226])
    // (a rule 4 pt over the shared row's baseline, the row's band as cellBands makes it: the line's em box, 0.88 of its size
    // over the baseline, held under the rule, so settling lowers the line there to 221.2)
    p.clear = { cap: 1, bands: new Map([[0, [{ B: 226, lo: 200, hi: 230 }]]]) }
    fillPage([p] as never, run.P as never)
    expect(p.layout.lines.filter(l => Math.abs(l.baseline - 226) < 10).map(l => l.baseline)).toEqual([226])
  })
})

describe('a shared line under rules that lay a page in order: none, the next unit where TeX set it, however the paper is opened', () => {
  // (with no page pass a closure may leave the unit before it to a later one: it would set the row from none, by the order of
  // the asks)
  /** the built-in rules with Chinese's own fields changed */
  const rulesWith = async (o: Record<string, unknown>) => {
    const { BUILTIN_RULES } = await import('@/pdf-reader/engine/rules/layout.mjs')
    const set = structuredClone(BUILTIN_RULES) as unknown as { languages: Record<string, Record<string, unknown>> }
    Object.assign(set.languages.zh as Record<string, unknown>, o)
    return set
  }
  const modes: [string, Record<string, unknown>][] = [['no page pass', { adaptiveFill: null }]]
  for (const [mode, o] of modes) {
    it(`${mode}: a heading shorter than its English, its text where TeX set it; S-E's pages the same in every order`, async () => {
      const rules = await rulesWith(o)
      const run = await laid(runIn(3), undefined, { rules })
      expect(linesOf(run, 0)![0]![7]).toBeLessThan(80)
      expect(linesOf(run, 1)![0]!.slice(0, 2).concat(linesOf(run, 1)![0]![6])).toEqual([1, 250, 90])
      const paper = PAPERS.find(x => x.name === 'S-E shared line')!
      const pages = Array.from({ length: paper.pages }, (_, i) => i + 1)
      const inOrder = await laid(paper, undefined, { rules })
      // (each unit's first line on the row it shares, where TeX set it)
      expect([linesOf(inOrder, 1)![0]![6], linesOf(inOrder, 3)![0]![6]]).toEqual([160, 90])
      const want = pages.map(p => runSnap(inOrder, p))
      for (const order of [[4, 3, 2, 1], [2, 4, 1, 3], [2], [3], [4]]) {
        const run2 = await openRun(build(paper), { rules })
        for (const p of order) await run2.layFor(p)
        for (const p of order) expect(runSnap(run2, p), `${mode}, ${order}: page ${p}`).toEqual(want[p - 1])
      }
    })
  }
})

describe('a shared row painted with the unit before it first, wherever their parts fall', () => {
  /** S-F: a paragraph from page 1 to page 2 (unit 1) whose last row its part after a float continues (unit 2), and on page 1 a
   *  paragraph that skips page 2 for page 3 (unit 0: a full-page float between), which ranks page 1's pass after page 2's: so
   *  page 2's own part paints before page 1's part of it */
  const late: Paper = {
    name: 'S-F the unit before painted late', pages: 3, specs: [
      { id: 0, kind: 'para', lines: [line(1, 270, 'Alpha beta gamma'), line(1, 258, 'delta epsilon zeta'), line(3, 270, 'eta theta iota'), line(3, 258, 'kappa lambda mu')], chars: 60, at: 0x4e00 },
      // (most of its source on page 1, its translation's share there more than page 1's two lines hold: E3c's page cut, reached on
      // page 2, changes nothing)
      { id: 1, kind: 'para', lines: [line(1, 234, 'nu xi omicron pi rho sigma'), line(1, 222, 'tau upsilon phi chi psi omega'), line(2, 270, 'alpha'), line(2, 258, 'beta. The', 20, 150)], chars: 82, at: 0x5200 },
      { id: 2, kind: 'para', lines: [line(2, 258, 'omega alpha', 160, 280), line(2, 246, 'beta gamma delta'), line(2, 234, 'epsilon zeta eta')], chars: 30, at: 0x5600 },
    ],
  }
  type Entry = { what: string; unit: number | null; page: number; box: number[] }

  it('a paragraph from an earlier page whose part paints later: its erasing of the row never takes the part after it', async () => {
    const run = await laid(late)
    const a = linesOf(run, 1)!.at(-1)!, b = linesOf(run, 2)![0]!
    // (the part after the float set from the paragraph's end on its row, inside what the paragraph's erasing of the row covers)
    expect([a[0], b[0], b[1]]).toEqual([2, 2, a[1]])
    expect(b[6]).toBeCloseTo(a[7] + 10, 1)
    expect(b[6]).toBeLessThan(150)
    // (its first line's box in the page's pixels: 300 pt high, a pixel a point)
    const box = [b[6], 300 - (b[1] + 7), b[7], 300 - (b[1] - 2)]
    const meets = (e: Entry) => e.box[0]! < box[2]! && e.box[2]! > box[0]! && e.box[1]! < box[3]! && e.box[3]! > box[1]!
    const on2 = (run.audit as unknown as Entry[]).filter(e => e.page === 2)
    expect(on2.some(e => e.unit === 1 && e.what === 'erase' && meets(e)), 'the paragraph\'s erasing meets it').toBe(true)
    // (no other unit's erasing on the page after it is painted: its crops are never taken)
    const from = on2.findIndex(e => e.unit === 2)
    expect(from).toBeGreaterThanOrEqual(0)
    expect(on2.slice(from).filter(e => e.unit !== 2 && e.what === 'erase' && meets(e))).toEqual([])
    // (and page 2 asked first, alone, is the same page)
    const alone = await openRun(build(late))
    await alone.layFor(2)
    expect(runSnap(alone, 2)).toEqual(runSnap(run, 2))
  })
})
