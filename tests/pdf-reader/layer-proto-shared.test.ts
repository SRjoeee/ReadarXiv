import { beforeAll, describe, expect, it } from 'vitest'
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
/** a paragraph (unit 0: two full rows from baseline 250, its last [20, 150] at 226) and its part after a float (unit 1: its
 *  first row [160, 280] on that last row, then two full rows), the paragraph's translation `chars` CJK characters */
const split = (chars: number): Paper => ({
  name: `split, ${chars}`, pages: 1, specs: [
    { id: 0, kind: 'para', lines: [line(1, 250, 'Uniaxial tension experiments', 20, 280), line(1, 238, 'usually consider traction-free', 20, 280), line(1, 226, 'conditions. The', 20, 150)], chars, at: 0x4e00 },
    { id: 1, kind: 'para', lines: [line(1, 226, 'increasing trend', 160, 280), line(1, 214, 'of the volumetric stretch can', 20, 280), line(1, 202, 'be tuned by the slenderness', 20, 280)], chars: 30, at: 0x5100 },
  ],
})

describe('a shared line: the next unit\'s first line starts where the translation before it ends on the row', () => {
  it('a heading shorter than its English: its text starts 10 pt after the heading\'s end, where the fill left it', async () => {
    const run = await laid(runIn(3))
    const [a] = linesOf(run, 0)!, [b] = linesOf(run, 1)!
    // (three characters of 10 pt from 20: the heading's own end, and the fill set no tracking that would take it further)
    expect(a![7]).toBe(50)
    expect([b![1], b![6]]).toEqual([250, 60])
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

  it('a paragraph whose last line stands on the shared row: the part after it stays on TeX\'s baseline', async () => {
    // (56 characters: two full lines and a few on the third, on the original's rows at its pitch, set a little closer)
    const run = await laid(split(56))
    const last = linesOf(run, 0)!.at(-1)!, [b] = linesOf(run, 1)!
    expect(last[1]).toBe(226)
    expect([b![1], b![2]]).toEqual([226, 226])
    expect(b![6]).toBeCloseTo(last[7] + 10, 1)
  })

  it('a paragraph whose translation ends higher: the row is free, and the part after it starts at the row\'s own start', async () => {
    const run = await laid(split(20))
    const a = linesOf(run, 0)!, [b] = linesOf(run, 1)!
    expect(a.at(-1)![1]).toBeGreaterThanOrEqual(226 + 10)
    expect([b![1], b![6]]).toEqual([226, 20])
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

  it('a line an em away is not: the row is free, no end and no baseline', () => {
    const share = L2.shareOf({ lines: [L(250, 20, 260), L(236, 20, 40)] } as never, blocks, row)!
    expect([share.end, share.at]).toEqual([null, null])
  })

  it('a line on TeX\'s row gives that row\'s baseline', () => {
    const share = L2.shareOf({ lines: [L(250, 20, 260), L(238, 20, 260), L(226, 20, 40)] } as never, blocks, row)!
    expect([share.end, share.at]).toEqual([60, 226])
  })

  it('a fill keeps the row only where its line there stays on the fit\'s baseline, ends no further right, and adds none', () => {
    const share = L2.shareOf({ lines: [L(250, 20, 260), L(232, 20, 40)] } as never, blocks, row)!
    expect(L2.keepsShare(share, [L(250, 20, 260), L(232, 20, 40)] as never)).toBe(true)
    // (shorter there, or gone from the row: the next unit, laid from the fit's end, is still clear of it)
    expect(L2.keepsShare(share, [L(250, 20, 260), L(232, 20, 30)] as never)).toBe(true)
    expect(L2.keepsShare(share, [L(250, 20, 260)] as never)).toBe(true)
    // (moved within the em: the next unit's first line, on the fit's baseline, would stand a step from it)
    expect(L2.keepsShare(share, [L(250, 20, 260), L(231.5, 20, 40)] as never)).toBe(false)
    expect(L2.keepsShare(share, [L(250, 20, 260), L(232, 20, 41)] as never)).toBe(false)
    const free = L2.shareOf({ lines: [L(250, 20, 260)] } as never, blocks, row)!
    expect(L2.keepsShare(free, [L(250, 20, 200), L(230, 20, 10)] as never)).toBe(false)
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
  // (the even pass and the leftover's packing lay a unit anew or move it once the unit after it has been laid from where it
  // ended on the row; with no page pass a closure may leave the unit before it to a later one: either would set the row from a
  // layout it is not drawn in, or from none, by the order of the asks)
  /** the built-in rules with Chinese's own fields changed */
  const rulesWith = async (o: Record<string, unknown>) => {
    const { BUILTIN_RULES } = await import('@/pdf-reader/engine/rules/layout.mjs')
    const set = structuredClone(BUILTIN_RULES) as unknown as { languages: Record<string, Record<string, unknown>> }
    Object.assign(set.languages.zh as Record<string, unknown>, o)
    return set
  }
  const modes: [string, Record<string, unknown>][] = [['the even pass', { even: 1 }], ['the leftover packed', { leftover: 'pack' }], ['no page pass', { adaptiveFill: null }]]
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
      { id: 1, kind: 'para', lines: [line(1, 234, 'nu xi omicron'), line(1, 222, 'pi rho sigma'), line(2, 270, 'tau upsilon phi'), line(2, 258, 'chi psi. The', 20, 150)], chars: 82, at: 0x5200 },
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
