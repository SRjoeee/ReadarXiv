// @vitest-environment node
// The performance gates' rules (lab/release-check/perf.mjs): a side's value is the median over its repetitions and its spread
// the largest less the smallest; two sides differ only past the two spreads added (the speed check's rule), an exact measure
// (bytes, TeX's passes) past the speed check's tolerance; a visit that drew nothing counts as missing, never as fast; a batch is
// compared with the newest round recorded that passed or was accepted; and the gates read the lab's run by its last line.
import { describe, expect, it } from 'vitest'
import { GATES, TARGETS } from '../../lab/release-check/gates.mjs'
import { batchVerdict, compare, lastRound, MEASURES, perfOf, prepareRepOf, type Rep, repOf, storedToday, type Visit, WORK_TOLERANCE } from '../../lab/release-check/perf.mjs'
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

  it('counts a paper that drew no translated page as missing, never as fast', () => {
    const r = repOf([visit({ first: 700 }), { ...visit(), firstOk: false, firstTranslatedMs: null }])
    expect(r.drawn).toBe(1)
    expect(Number.isNaN(r.firstMs)).toBe(true)
  })

  it("reads a prepare's stored bytes as each side tells them, and a paper not made as missing", () => {
    const measured = { wallS: 40, cpuS: 39, memPeakMiB: 500, compiles: 3, passes: 5 }
    const today = { side: 'today' as const, ok: true, measured, told: [{ role: 'units', chunks: [['a', 'x', 100] as [string, string, number]] }, { role: 'part', bytes: 50, left: [[1, 'y', 7] as [number, string, number]] }, { role: 'delta', bytes: 30 }] }
    expect(storedToday(today)).toBe(187)
    const neu = { side: 'new' as const, ok: true, measured, objects: [{ bytes: 10 }, { bytes: 5 }], instrument: [{ bytes: 100 }] }
    expect(prepareRepOf([today, neu])).toMatchObject({ made: 2, wallS: 40, passes: 10, storedBytes: 187 + 115 })
    expect(Number.isNaN(prepareRepOf([today, { ...neu, ok: false }]).wallS)).toBe(true)
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
  })

  it('says a measure one side lacks is not measured, never equal', () => {
    expect(compare(reps([1, 2]), [{ reader: {} }]).first!.reading).toBe('not measured')
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

  it('names every measure once, lower being better for each', () => {
    const ids = MEASURES.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
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
