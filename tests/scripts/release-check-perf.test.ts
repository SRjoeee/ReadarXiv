// @vitest-environment node
// The performance gates' rules (lab/release-check/perf.mjs): a side's value is the median over its repetitions and its spread
// the largest less the smallest; two sides differ only past the two spreads added (the speed check's rule), an exact measure
// (bytes, TeX's passes) past the speed check's tolerance; a visit that drew nothing counts as missing, never as fast; a batch is
// compared with the newest round recorded that passed or was accepted; and the gates read the lab's run by its last line.
import { describe, expect, it } from 'vitest'
import { GATES, TARGETS } from '../../lab/release-check/gates.mjs'
import { batchVerdict, compare, lastRound, MEASURES, perfOf, prepareRepOf, type Rep, repOf, stallOf, storedToday, type Visit, voidOf, WORK_TOLERANCE } from '../../lab/release-check/perf.mjs'
import { targetLines } from '../../lab/release-check/verdict.mjs'

const visit = (o: Partial<Visit> & { first?: number; commits?: [number, number][] } = {}): Visit => ({
  rep: 1,
  firstOk: o.first !== undefined ? Number.isFinite(o.first) : true,
  firstTranslatedMs: o.first ?? 700,
  page1: { all: 9e6, layer: 4e5, rows: 5e4, arxiv: 3e5, code: 2e6 },
  whole: { all: 12e6, layer: 5e5, rows: 5e4, arxiv: 1e6 },
  scroll: { commitList: o.commits ?? [[20, 8], [10, 5]], frames: 1000, framesOverBudget: 12, longTasks: 3, longestTask: 60 },
  memory: { jsHeapMiB: 20, canvasMiB: 30, rendererMiB: 700 },
  code: [['/assets/reader.js', 600_000], ['/pdfjs/pdf.worker.min.mjs', 1_265_413]],
  ...o,
})
const reps = (xs: number[], key: 'firstMs' | 'commitP50' = 'firstMs'): Rep[] => xs.map((x) => ({ reader: { [key]: x } }))

describe('a repetition, summarised', () => {
  it("pools the commits of every paper, sums the long tasks, and reads the paper's data apart from the code", () => {
    const r = repOf([visit({ commits: [[20, 8]] }), visit({ commits: [[30, 10], [5, 5]] })])
    expect(r.commits).toBe(3)
    expect(r.commitP50).toBe(28)
    expect(r.longTasks).toBe(6)
    expect(r.framesOverPerMille).toBe(12)
    expect(r.page1Data).toBe(4e5 + 5e4 + 3e5)
    expect(r.codeBytes).toBe(600_000 + 1_265_413)
  })

  it('counts a paper that drew no translated page, or a visit that took no scroll, as missing, never as fast or small', () => {
    const r = repOf([visit({ first: 700 }), { ...visit(), firstOk: false, firstTranslatedMs: null, page1: null }])
    expect(r.drawn).toBe(1)
    expect([r.firstMs, r.page1Data].every(Number.isNaN)).toBe(true)
    const { scroll: _, ...unscrolled } = visit()
    expect(Number.isNaN(repOf([visit(), unscrolled]).longTasks)).toBe(true)
  })

  it('reads the data on the wire where the visit counted it so', () => {
    const v = visit({ page1: { all: 9e6, layer: 4e5, rows: 5e4, arxiv: 3e5, wire: { all: 1e6, layer: 1e5, rows: 1e4, arxiv: 3e5 } } })
    expect(repOf([v]).page1Data).toBe(1e5 + 1e4 + 3e5)
  })

  it("reads a prepare's stored bytes as each side tells them, and a paper not made as missing", () => {
    const measured = { wallS: 40, cpuS: 39, memPeakMiB: 500, compiles: 3, passes: 5 }
    const today = { side: 'today' as const, ok: true, measured, told: [{ role: 'units', chunks: [['a', 'x', 100] as [string, string, number]] }, { role: 'part', bytes: 50, left: [[1, 'y', 7] as [number, string, number]] }, { role: 'delta', bytes: 30 }] }
    expect(storedToday(today)).toBe(187)
    const neu = { side: 'new' as const, ok: true, measured, objects: [{ bytes: 10 }, { bytes: 5 }], instrument: [{ bytes: 100 }] }
    expect(prepareRepOf([today, neu])).toMatchObject({ made: 2, wallS: 40, passes: 10, storedBytes: 187 + 115 })
    expect(Number.isNaN(prepareRepOf([today, { ...neu, ok: false }]).wallS)).toBe(true)
    // (asked of a warm box whose warming prepare was not made: missing too)
    expect(Number.isNaN(prepareRepOf([today, { ...neu, warm: true, warmOk: false }]).wallS)).toBe(true)
  })
})

describe('two sides compared', () => {
  it('says worse or better only past the two spreads added, else equal', () => {
    // (a: 100..110, spread 10; b: 80..84, spread 4; the medians 105 and 82 differ by 23 > 14: worse)
    expect(compare(reps([100, 105, 110]), reps([80, 82, 84])).first!).toMatchObject({ a: 105, b: 82, spreadA: 10, spreadB: 4, reading: 'worse' })
    expect(compare(reps([80, 82, 84]), reps([100, 105, 110])).first!.reading).toBe('better')
    // (a difference of 8 within spreads of 10 and 4: equal)
    expect(compare(reps([90, 95, 100]), reps([85, 87, 89])).first!.reading).toBe('equal')
  })

  it('judges an exact measure by the tolerance, not by a spread it does not have', () => {
    const passes = (n: number): Rep[] => [{ prepare: { passes: n } }, { prepare: { passes: n } }]
    expect(compare(passes(1000 + 1000 * WORK_TOLERANCE * 2), passes(1000)).passes!.reading).toBe('worse')
    expect(compare(passes(1000), passes(1000)).passes!.reading).toBe('equal')
    expect(compare(passes(4), passes(5)).passes!.reading).toBe('better')
    // (the code and the whole paper's data: the same bytes every visit, so a few bytes more is equal and 1 % more is worse)
    const code = (n: number): Rep[] => [{ reader: { codeBytes: n } }, { reader: { codeBytes: n } }]
    expect(compare(code(2_833_346), code(2_833_224)).codeBytes!.reading).toBe('equal')
    expect(compare(code(2_833_224 * 1.01), code(2_833_224)).codeBytes!.reading).toBe('worse')
    const whole = (n: number): Rep[] => [{ reader: { wholeData: n } }, { reader: { wholeData: n } }]
    expect(compare(whole(1_000_100), whole(1_000_000)).wholeData!.reading).toBe('equal')
  })

  it('says a measure one side lacks, or lacks in a repetition, is missing, and fails the batch on it; one neither side took is not measured', () => {
    expect(compare(reps([1, 2]), [{ reader: {} }]).first!.reading).toBe('missing')
    expect(compare(reps([1, 2]), [{ reader: { firstMs: 1 } }, { reader: { firstMs: Number.NaN } }]).first!.reading).toBe('missing')
    expect(compare([{ reader: {} }], [{ reader: {} }]).first!.reading).toBe('not measured')
    expect(batchVerdict(reps([20, 21], 'commitP50'), [{ reader: {} }, { reader: {} }])).toMatchObject({ pass: false, worse: ['commitP50'] })
    // (a measure reported and never judged: the canvases, counted otherwise on the two sides)
    const canvas = (x: number): Rep[] => [{ reader: { canvasMiB: x } }, { reader: { canvasMiB: x } }]
    expect(batchVerdict(canvas(90), canvas(10))).toMatchObject({ pass: true, worse: [] })
  })

  it('fails a batch on any measure worse than the last round, and names it', () => {
    const v = batchVerdict(reps([40, 41, 42], 'commitP50'), reps([20, 21, 22], 'commitP50'))
    expect(v).toMatchObject({ pass: false, worse: ['commitP50'] })
    expect(batchVerdict(reps([20, 22, 21], 'commitP50'), reps([20, 21, 22], 'commitP50')).pass).toBe(true)
  })

  it('compares a batch with the newest round that passed or was accepted', () => {
    const rounds = [
      { at: '2026-11-10T00:00:00Z', pass: true, commit: 'a' },
      { at: '2026-11-12T00:00:00Z', pass: false, commit: 'c' },
      { at: '2026-11-11T00:00:00Z', pass: false, accepted: true, commit: 'b' },
    ]
    expect(lastRound(rounds)?.commit).toBe('b')
    expect(lastRound([{ at: 'x', pass: false }])).toBe(null)
  })

  it('never compares a batch with a round marked void', () => {
    const rounds = [
      { at: '2026-11-12T10:45:00Z', pass: true, commit: 'round 1' },
      { at: '2026-11-12T11:05:00Z', pass: true, commit: 'round 2', void: 'repetition 2 stalled' },
    ]
    expect(lastRound(rounds)?.commit).toBe('round 1')
  })

  it('names every measure once, lower being better for each', () => {
    const ids = MEASURES.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('a repetition that measured the machine, not the reader', () => {
  // (the fixture: round 2 of 2026-11-12 as it was recorded, the per-batch gate's papers, three repetitions; repetition 2 met a
  // stall of the machine: a 22,927 ms task on the shortest paper, a 1,599 ms one on the next, the same minute)
  const scrolled = (pair: string, rep: number, ms: number, longestTask: number): Visit => visit({ pair, rep, scroll: { ...visit().scroll, ms, longestTask } })
  const round = [
    [scrolled('2608.08481v1-zh', 1, 7059, 60), scrolled('2610.21491v1-zh', 1, 11083, 83), scrolled('2610.37818v1-zh', 1, 42200, 218)],
    [scrolled('2608.08481v1-zh', 2, 30954, 22927), scrolled('2610.21491v1-zh', 2, 15429, 1599), scrolled('2610.37818v1-zh', 2, 28060, 140)],
    [scrolled('2608.08481v1-zh', 3, 7018, 59), scrolled('2610.21491v1-zh', 3, 11113, 77), scrolled('2610.37818v1-zh', 3, 28100, 141)],
  ]

  it('voids the repetition whose task outlasted the rest of its own scroll, and no other', () => {
    expect(round.map((visits) => voidOf(visits).length)).toEqual([0, 1, 0])
    expect(voidOf(round[1]!)[0]).toEqual({ pair: '2608.08481v1-zh', rep: 2, taskMs: 22927, scrollMs: 30954, ownMs: 8027 })
    // (a long task inside a long scroll is the reader's: the slowest visit of round 1, 340 ms in 49,351)
    expect(stallOf(scrolled('2610.37818v1-zh', 2, 49351, 340))).toBe(null)
    // (the bound is the visit's own: the same task in a scroll twice its length measured the reader)
    expect(stallOf(scrolled('x', 1, 2 * 22927 + 1, 22927))).toBe(null)
    // (a visit that took no scroll has nothing to void)
    expect(stallOf({ ...visit(), scroll: undefined })).toBe(null)
  })

  it('would have left the longest task unjudged had the void repetition been counted', () => {
    const longest = (visits: Visit[][]): Rep[] => visits.map((v) => ({ reader: repOf(v) }))
    const counted = compare(longest(round), longest(round)).longestTask!
    expect(counted.spreadA).toBeGreaterThan(20000)
    const valid = round.filter((v) => !voidOf(v).length)
    expect(compare(longest(valid), longest(valid)).longestTask!.spreadA).toBe(218 - 141)
  })

  it('reads a round the machine could not measure as skipped, never as a pass or a fail', () => {
    const batch = GATES.find((g) => g.id === 'perf-batch')!
    const line = '{"perf":{"mode":"batch","pass":false,"unmeasured":"repetition 2 stalled twice: 2608.08481v1-zh repetition 2: a 22927 ms task in a 30954 ms scroll (its own 8027 ms)"}}'
    const r = batch.judge!({} as never, [{ cmd: [], exit: 3, ms: 0, log: '', text: line }])
    expect(r).toMatchObject({ skip: expect.stringMatching(/^the machine could not measure: repetition 2 stalled twice/) })
    expect(r.pass).toBeUndefined()
  })
})

describe('the gates', () => {
  it("read the lab's run by its last {\"perf\": …} line", () => {
    expect(perfOf('noise\n{"perf":{"mode":"batch","pass":true}}\n')).toEqual({ mode: 'batch', pass: true })
    expect(perfOf('no verdict')).toBe(null)
  })

  it("pass only on the run's own exit and verdict, the measures reaching the targets' rows", () => {
    const batch = GATES.find((g) => g.id === 'perf-batch')!
    const line = '{"perf":{"mode":"batch","pass":true,"worse":[],"m":{"commitP50":[18.5,19,"equal"],"commitP90":[30,31,"equal"]}}}'
    const ok = batch.judge!({} as never, [{ cmd: [], exit: 0, ms: 0, log: '', text: line }])
    expect(ok.pass).toBe(true)
    expect(batch.judge!({} as never, [{ cmd: [], exit: 1, ms: 0, log: '', text: line }]).pass).toBe(false)
    const commit = targetLines({ 'perf-batch': { status: 'pass', numbers: ok.numbers } }).find((t) => t.id === 'commit')
    expect(commit).toMatchObject({ status: 'met' })
    expect(GATES.find((g) => g.id === 'perf-release')?.cutover).toBe(true)
  })

  it('reads each performance row from a performance gate', () => {
    for (const id of ['prepare-box', 'tex-runs', 'reprepare', 'commit', 'switch', 'first-page', 'reader-bytes', 'reader-smooth'])
      expect([id, TARGETS.find((t) => t.id === id)?.from]).toEqual([id, id === 'commit' ? 'perf-batch' : 'perf-release'])
  })
})
