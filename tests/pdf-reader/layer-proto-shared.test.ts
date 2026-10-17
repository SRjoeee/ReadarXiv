import { beforeAll, describe, expect, it } from 'vitest'
import { build, installStubs, line, openRun, type Paper, type Run } from './helpers/order-paper'

// A shared line (need.mjs rowLeadOf): a unit whose first row TeX set on the line another unit's last row ends — a run-in
// heading and its text (1810.04805's "Model Architecture", 1706.03762's "Acknowledgements"), a paragraph's part after the
// float that split it (2608.16117's units 57 and 59). The second unit's first line starts where the first's translation ends
// on the row, the original's separation after it, never where the original's did (after the English words' end: a Chinese
// heading left a gap of 60 pt before its text). Over papers of their own making (helpers/order-paper.ts: 10 pt type, a CJK
// character an em): each record's lines are [page, baseline, target, exact, mode, overflow, x0, x1, block]

beforeAll(() => { installStubs() })

type RecLine = [number, number, number | null, boolean, string, number, number, number, number]
const linesOf = (run: Run, id: number) => (run.stats.find(r => r.id === id) as unknown as { lines: RecLine[] } | undefined)?.lines
async function laid(paper: Paper, edit: (P: ReturnType<typeof build>) => void = () => {}) {
  const P = build(paper)
  edit(P)
  const run = await openRun(P)
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

  it('a paragraph whose translation ends on the shared row: the part after it starts 10 pt after that end', async () => {
    const run = await laid(split(30))
    const a = linesOf(run, 0)!, [b] = linesOf(run, 1)!
    // (its last line within an em of the row: four characters there, 20 to 60)
    const last = a.at(-1)!
    expect(226 - 10 < last[1] && last[1] < 226 + 10, `last line at ${last[1]}`).toBe(true)
    expect(last[7]).toBe(60)
    expect([b![1], b![6]]).toEqual([226, 70])
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

describe('a shared line and the half-leading (layer2.mjs lineBoxes, run.mjs edgesOf): neither edge on the row takes it', () => {
  type Half = { head: boolean; foot: boolean } | null
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

  it("keeps the next unit's first line on the shared row while its lines spread: the paragraph before it ends on the row, the next begins on it", async () => {
    const run = await kept(split(30))
    // (each shares the row with the other's ink, within its frame's span: the paragraph before keeps its last baseline, the
    // part after it its first)
    expect([halfOf(run, 0)?.foot, halfOf(run, 1)?.head]).toEqual([false, false])
    // (the part after it is spread past the original's pitch, so a head's half-leading would have moved its first line off the row)
    expect(leadOf(run, 1)).toBeGreaterThan(1)
    expect(linesOf(run, 1)![0]![1]).toBe(226)
  })

  it("keeps a run-in heading's text on the heading's row while it spreads; the heading's frame of one line gives no room", async () => {
    const run = await kept(runIn(3))
    // (the heading's own ink is in the text's frame: its first line keeps its baseline. The text is outside the heading's frame,
    // so the heading's foot is asked, but a frame of one line has no room to give: the heading stays on its baseline too)
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
