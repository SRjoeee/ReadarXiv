// lab/release-check/perf.mjs: how the performance gates (gates.mjs `perf-batch`, `perf-release`) read their measurements and
// judge them. Pure: no process is run and no file read here, so that tests/scripts/release-check-perf.test.ts holds the rules.
// The measuring itself is the lab's (its tools run the readers and the boxes on stored inputs, offline, in a quiet window: every
// heavy slot of the machine held, so that no other heavy job runs beside a timing); what reaches this module is numbers.
//
// The rule is the speed check's (lab/pdf/spikes/layer-gate/speed.mjs), the one the owner's standing rule asked for, applied to
// every measure: a run is repeated (repetitions interleaved between the two sides where both are measured), each repetition
// summarised over its papers, and a side's value is the median over its repetitions, its spread the largest less the smallest.
// Two sides differ only where their medians differ by more than the two spreads added (the difference of two medians moves by
// both sides' noise; with the larger alone, 3 + 3 runs of one engine failed on noise about 1 time in 10, speed.mjs's header). A
// measure that does not depend on the clock (bytes, TeX's passes, requests) has no noise: its repetitions agree, and it
// differs where it moves by more than the speed check's tolerance for its work counters (WORK_TOLERANCE, 0.5 %).
import { median, percentile, spread, WORK_TOLERANCE } from '../pdf/spikes/layer-gate/speed.mjs'

export { median, percentile, spread, WORK_TOLERANCE }

/**
 * The measures. `of(rep)`: the value of one repetition's summary (repOf / prepareRepOf); `lower`: lower is better (every
 * measure here); `exact`: a measure with no noise (bytes, counts of work), judged by the tolerance, never by the spread.
 */
export const MEASURES = [
  { id: 'first', label: 'first translated page drawn, from the navigation (ms), median over the papers', of: (r) => r.reader?.firstMs, exact: false },
  { id: 'commitP50', label: "a page's commit at 1x, p50 over every page committed while the paper was scrolled (ms)", of: (r) => r.reader?.commitP50, exact: false },
  { id: 'commitP90', label: "a page's commit at 1x, p90 (ms)", of: (r) => r.reader?.commitP90, exact: false },
  { id: 'longTasks', label: 'long tasks while the whole paper was scrolled, summed over the papers (count)', of: (r) => r.reader?.longTasks, exact: false },
  { id: 'longestTask', label: 'the longest task while scrolling, the largest over the papers (ms)', of: (r) => r.reader?.longestTask, exact: false },
  { id: 'framesOver', label: 'frames over budget while scrolling (rAF intervals past 33.4 ms), per 1,000 frames', of: (r) => r.reader?.framesOverPerMille, exact: false },
  { id: 'heap', label: 'JS heap after the paper was scrolled once, after a GC (MiB), median over the papers', of: (r) => r.reader?.heapMiB, exact: false },
  { id: 'canvas', label: "the canvases' bytes after the paper was scrolled once (MiB), median over the papers", of: (r) => r.reader?.canvasMiB, exact: false },
  { id: 'renderer', label: "the renderer process's resident memory after the scroll (MiB), median over the papers", of: (r) => r.reader?.rendererMiB, exact: false },
  { id: 'page1Bytes', label: 'bytes downloaded to see page 1 (everything: code, faces, layer, rows, PDF), median over the papers', of: (r) => r.reader?.page1Bytes, exact: false },
  { id: 'page1Data', label: "the paper's data downloaded to see page 1 (layer, rows, arXiv's PDF), median over the papers", of: (r) => r.reader?.page1Data, exact: false },
  { id: 'wholeData', label: "the paper's data downloaded once the whole paper was scrolled, median over the papers", of: (r) => r.reader?.wholeData, exact: false },
  { id: 'codeBytes', label: 'script and worker bytes the reader page loaded (as served, every request)', of: (r) => r.reader?.codeBytes, exact: false },
  { id: 'switchMs', label: 'switching language: from the switch to the first page drawn in the new language (ms), median', of: (r) => r.reader?.switchMs, exact: false },
  { id: 'switchAgain', label: 'switching language: layer objects asked again (count, summed)', of: (r) => r.reader?.switchAgain, exact: false },
  { id: 'prepareWall', label: 'prepare in the box, wall (s), median over the papers', of: (r) => r.prepare?.wallS, exact: false },
  { id: 'prepareCpu', label: 'prepare in the box, CPU (s), median over the papers', of: (r) => r.prepare?.cpuS, exact: false },
  { id: 'prepareMem', label: "prepare in the box, the container's memory peak (MiB), median over the papers", of: (r) => r.prepare?.memPeakMiB, exact: false },
  { id: 'compiles', label: 'TeX compiles a paper (jail runs), summed over the papers', of: (r) => r.prepare?.compiles, exact: true },
  { id: 'passes', label: "TeX's passes a paper (engine runs), summed over the papers", of: (r) => r.prepare?.passes, exact: true },
  { id: 'storedBytes', label: 'bytes the prepare stores (every object it hands the server), summed over the papers', of: (r) => r.prepare?.storedBytes, exact: true },
]

const finite = (xs) => xs.filter(Number.isFinite)
const round = (x, d = 2) => (Number.isFinite(x) ? +x.toFixed(d) : null)

/**
 * One repetition of the reader's visits (reader.mjs's lines of one side and one repetition, one a paper) as the measures read it:
 * the first page's time and the bytes by the median over the papers; the commits pooled over every page of every paper; the long
 * tasks summed; frames over budget per 1,000 frames; memory by the median. A visit that drew no translated page counts as missing,
 * never as fast: `drawn` says how many did.
 */
export function repOf(visits) {
  const drawn = visits.filter((v) => v.firstOk && Number.isFinite(v.firstTranslatedMs))
  const data = (b) => (b ? ['layer', 'rows', 'arxiv', 'object.head', 'object.units', 'object.part', 'object.addon', 'catalog', 'delta', 'base', 'follow', 'open'].reduce((n, k) => n + (b[k] ?? 0), 0) : NaN)
  const commits = visits.flatMap((v) => (v.scroll?.commitList ?? []).map(([task, render]) => task + render))
  const frames = visits.reduce((n, v) => n + (v.scroll?.frames ?? 0), 0)
  const over = visits.reduce((n, v) => n + (v.scroll?.framesOverBudget ?? 0), 0)
  const switched = visits.filter((v) => v.switch)
  const code = (v) => (v.code ?? []).reduce((n, [, b]) => n + b, 0)
  return {
    papers: visits.length,
    drawn: drawn.length,
    firstMs: drawn.length === visits.length ? median(drawn.map((v) => v.firstTranslatedMs)) : NaN,
    commitP50: commits.length ? round(percentile(commits, 50)) : NaN,
    commitP90: commits.length ? round(percentile(commits, 90)) : NaN,
    commits: commits.length,
    longTasks: visits.some((v) => v.scroll) ? visits.reduce((n, v) => n + (v.scroll?.longTasks ?? 0), 0) : NaN,
    longestTask: visits.some((v) => v.scroll) ? Math.max(...visits.map((v) => v.scroll?.longestTask ?? 0)) : NaN,
    framesOverPerMille: frames ? round((over / frames) * 1000, 1) : NaN,
    heapMiB: median(finite(visits.map((v) => v.memory?.jsHeapMiB))),
    canvasMiB: median(finite(visits.map((v) => v.memory?.canvasMiB))),
    rendererMiB: median(finite(visits.map((v) => v.memory?.rendererMiB))),
    page1Bytes: median(finite(visits.map((v) => v.page1?.all))),
    page1Data: median(finite(visits.map((v) => data(v.page1)))),
    wholeData: median(finite(visits.map((v) => data(v.whole)))),
    codeBytes: median(finite(visits.map(code))),
    switchMs: switched.length ? median(finite(switched.map((v) => v.switch.ms))) : NaN,
    switchAgain: switched.length ? switched.reduce((n, v) => n + (v.switch.askedAgain?.filter((a) => a[0] !== 'arxiv').length ?? 0), 0) : NaN,
  }
}

/** One repetition of prepares (prepare.sh's lines of one side, one a paper) as the measures read it; a paper not made counts as
 *  missing (the repetition's wall and CPU then none), never as fast */
export function prepareRepOf(runs) {
  const made = runs.filter((r) => r.ok)
  const all = made.length === runs.length && runs.length > 0
  const stored = (r) => (r.side === 'new' ? (r.objects ?? []).reduce((n, o) => n + o.bytes, 0) + (r.instrument ?? []).reduce((n, o) => n + o.bytes, 0) : storedToday(r))
  return {
    papers: runs.length,
    made: made.length,
    wallS: all ? median(made.map((r) => r.measured.wallS)) : NaN,
    cpuS: all ? median(made.map((r) => r.measured.cpuS)) : NaN,
    memPeakMiB: all ? median(made.map((r) => r.measured.memPeakMiB)) : NaN,
    compiles: all ? made.reduce((n, r) => n + r.measured.compiles, 0) : NaN,
    passes: all ? made.reduce((n, r) => n + r.measured.passes, 0) : NaN,
    storedBytes: all ? made.reduce((n, r) => n + stored(r), 0) : NaN,
  }
}

/** what TODAY's run told the server it made (prep-today: role, bytes; the units chunks and a part's left parts as lists) */
export function storedToday(r) {
  let n = 0
  for (const t of r.told ?? []) {
    if (t.role === 'units') n += (t.chunks ?? []).reduce((a, c) => a + (c[2] ?? 0), 0)
    else n += t.bytes ?? 0
    if (t.role === 'part') n += (t.left ?? []).reduce((a, l) => a + (l[2] ?? 0), 0)
  }
  return n
}

/**
 * Two sides compared on every measure: `a` and `b` each a list of repetitions' summaries ({ reader, prepare }). For each measure
 * both sides' medians and spreads, the difference a - b, and the reading: 'worse' (a's median above b's by more than the spreads
 * added; for an exact measure, by more than WORK_TOLERANCE of b's), 'better' (the same the other way), 'equal' (within), or
 * 'not measured' (a side has no value). Lower is better for every measure.
 */
export function compare(a, b, measures = MEASURES) {
  const out = {}
  for (const m of measures) {
    const av = finite(a.map(m.of)),
      bv = finite(b.map(m.of))
    if (!av.length || !bv.length) {
      out[m.id] = { label: m.label, reading: 'not measured', a: av.length ? median(av) : null, b: bv.length ? median(bv) : null }
      continue
    }
    const am = median(av),
      bm = median(bv)
    const sa = spread(av),
      sb = spread(bv)
    const bound = m.exact ? Math.abs(bm) * WORK_TOLERANCE : sa + sb
    const diff = am - bm
    out[m.id] = {
      label: m.label,
      a: round(am),
      b: round(bm),
      n: [av.length, bv.length],
      spreadA: round(sa),
      spreadB: round(sb),
      p90A: round(percentile(av, 90)),
      p90B: round(percentile(bv, 90)),
      diff: round(diff),
      bound: round(bound),
      reading: diff > bound ? 'worse' : -diff > bound ? 'better' : 'equal',
    }
  }
  return out
}

/** the per-batch verdict: the head against the last round recorded, every measure the head has; FAIL where one is worse */
export function batchVerdict(head, base) {
  const c = compare(head, base)
  const worse = Object.entries(c).filter(([, x]) => x.reading === 'worse').map(([id]) => id)
  return { pass: worse.length === 0, worse, measures: c }
}

/** the last round a batch is compared with: the newest record that passed (or was accepted), else none. `records`: { at, pass,
 *  accepted?, commit } each */
export function lastRound(records) {
  return [...records].filter((r) => r.pass || r.accepted).sort((x, y) => String(y.at).localeCompare(String(x.at)))[0] ?? null
}

/** the gate's line of the lab's run: its last line `{"perf": …}` (the run's verdict and numbers), or null */
export function perfOf(text) {
  const line = String(text)
    .split('\n')
    .reverse()
    .find((l) => l.startsWith('{"perf":'))
  if (!line) return null
  try {
    return JSON.parse(line).perf
  } catch {
    return null
  }
}
