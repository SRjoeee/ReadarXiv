// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { median, percentile, slope, spread, summarizeRun, verdictOf, WORK_KEYS } from '../../lab/pdf/spikes/layer-gate/speed.mjs'

// The speed check's arithmetic (lab/pdf/spikes/layer-gate/speed.mjs), on synthetic numbers: percentiles, the run-to-run spread,
// the heap's slope, and the verdict (a time worse than the spread; a work counter that grew by more than 0.5 %)

const work = (n: number) => ({ fit: n, measures: 10 * n, breaks: 2 * n, linkTests: n, inkSteps: 100 * n, ops: 3 * n })
/** a run of one output of `pages` pages: every page `step` ms, its lay `lay` ms, a heap growing `grow` bytes a page */
const run = (o: { pages?: number; first?: number; step?: number; lay?: number; grow?: number; w?: ReturnType<typeof work> | null } = {}) => ({
  fixtures: { out: { pages: Array.from({ length: o.pages ?? 12 }, (_, i) => ({ perf: { firstDraw: o.first ?? 100, step: o.step ?? 20, times: { lay: o.lay ?? 10 }, jsHeap: 1e6 + i * (o.grow ?? 1000), ...(o.w === null ? {} : { work: o.w ?? work(5) }) } })) } },
})

describe('percentile, spread and slope', () => {
  it('interpolates between ranks, ignores non-numbers and says NaN for none', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3)
    expect(percentile([10, 20], 50)).toBe(15)
    expect(percentile([1, 2, 3, 4, 5], 95)).toBeCloseTo(4.8)
    expect(percentile([5, 1, 3], 0)).toBe(1)
    expect(percentile([5, 1, 3], 100)).toBe(5)
    expect(percentile([1, Number.NaN, 3], 50)).toBe(2)
    expect(percentile([], 50)).toBeNaN()
    expect(median([9, 1, 5])).toBe(5)
  })
  it('the spread is max less min, the slope a least-squares line against the index', () => {
    expect(spread([3, 7, 5])).toBe(4)
    expect(spread([2])).toBe(0)
    expect(spread([])).toBeNaN()
    expect(slope([5, 7, 9, 11])).toBeCloseTo(2)
    expect(slope([4, 4, 4])).toBe(0)
    expect(slope([1])).toBeNaN()
  })
})

describe('summarizeRun', () => {
  it('reads first draw, lay, slow pages, heap slope and the work counters of a run', () => {
    const s = summarizeRun(run({ first: 80, lay: 12, step: 60, grow: 2048, w: work(7) }))
    expect(s.time['first page draw p50 (ms)']).toBe(80)
    expect(s.time['page lay p95 (ms)']).toBe(12)
    expect(s.time['pages over 50 ms (count)']).toBe(12)
    expect(s.time['pages over 100 ms (count)']).toBe(0)
    expect(s.time['heap growth per laid page (bytes)']).toBeCloseTo(2048)
    expect(s.work?.totals.fit).toBe(12 * 7)
    expect(s.work?.perPage.measures).toEqual({ p50: 70, p95: 70 })
    expect(summarizeRun(run({ w: null })).work).toBeNull()
  })
})

describe('the verdict', () => {
  const reps = (f: (k: number) => ReturnType<typeof run>) => [0, 1, 2].map(k => summarizeRun(f(k)))
  it('passes when head is within the spread and its work is equal', () => {
    const base = reps(k => run({ lay: 10 + k }))
    const head = reps(k => run({ lay: 11 + k }))
    const v = verdictOf(head, base)
    expect(v.time['page lay p50 (ms)']).toMatchObject({ head: 12, base: 11, spread: 2, fail: false })
    expect(v.verdict).toBe('PASS')
  })
  it('fails a time worse than the largest spread, and a better one passes', () => {
    const base = reps(k => run({ lay: 10 + k }))
    expect(verdictOf(reps(k => run({ lay: 14 + k })), base)).toMatchObject({ verdict: 'FAIL', time: { 'page lay p50 (ms)': { fail: true } } })
    expect(verdictOf(reps(k => run({ lay: 5 + k })), base).verdict).toBe('PASS')
  })
  it('fails any growth of a work counter beyond 0.5 %, whatever the clock says, and passes less or equal work', () => {
    const base = reps(() => run({ w: work(1000) }))
    expect(verdictOf(reps(() => run({ w: work(1000) })), base).verdict).toBe('PASS')
    expect(verdictOf(reps(() => run({ w: work(900) })), base).verdict).toBe('PASS')
    expect(verdictOf(reps(() => run({ w: work(1004) })), base).verdict).toBe('PASS')
    const grown = verdictOf(reps(() => run({ w: { ...work(1000), measures: 10 * 1000 + 100 } })), base)
    expect(grown.verdict).toBe('FAIL')
    expect(Object.entries(grown.work).filter(([, m]) => m.fail).map(([k]) => k)).toEqual(['measures'])
    // (one more unit of work on a counter that was zero)
    expect(verdictOf(reps(() => run({ w: { ...work(1000), linkTests: 1 } })), reps(() => run({ w: { ...work(1000), linkTests: 0 } }))).verdict).toBe('FAIL')
  })
  it('fails a counter that differs between repetitions of one side, and is incomparable when the base has none', () => {
    const base = reps(() => run({ w: work(1000) }))
    expect(verdictOf(reps(k => run({ w: work(1000 + k) })), base).work.fit).toMatchObject({ unstable: true, fail: true })
    const v = verdictOf(reps(() => run({ w: work(1000) })), reps(() => run({ w: null })))
    expect(v.verdict).toBe('INCOMPARABLE')
    expect(WORK_KEYS.every(k => v.work[k]?.missing)).toBe(true)
    // (a counter the head counts and the base predates, `fills`: not measured on the base, never grown from 0; the others compared)
    const newer = verdictOf(reps(() => run({ w: { ...work(1000), fills: 5000 } as never })), base)
    expect(newer.verdict).toBe('INCOMPARABLE')
    expect(newer.work.fills).toMatchObject({ head: 12 * 5000, base: undefined, missing: true, fail: false })
    expect(newer.work.fit).toMatchObject({ fail: false })
    expect(newer.work.fit?.missing).toBeUndefined()
    // (but a time that got worse is a FAIL even where the counters cannot be compared)
    expect(verdictOf(reps(() => run({ w: work(1000), lay: 99 })), reps(() => run({ w: null }))).verdict).toBe('FAIL')
  })
})
