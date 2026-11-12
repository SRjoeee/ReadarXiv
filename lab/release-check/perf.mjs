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
 * The measures. `of(rep)`: the value of one repetition's summary (repOf / prepareRepOf); lower is better for every one;
 * `exact`: a measure with no noise (bytes, counts of work), judged by the tolerance, never by the spread; `judged: false`: reported
 * and never judged (the canvases' bytes: TODAY keeps its far drawings out of the document, where no query counts them, so the two
 * are not counted alike; the renderer's and the GPU's resident memory are judged instead).
 */
export const MEASURES = [
  { id: 'first', label: 'first translated page drawn, from the navigation (ms), median over the papers', of: (r) => r.reader?.firstMs, exact: false },
  { id: 'commitP50', label: "a page's commit at 1x, p50 over every page committed while the paper was scrolled (ms)", of: (r) => r.reader?.commitP50, exact: false },
  { id: 'commitP90', label: "a page's commit at 1x, p90 (ms)", of: (r) => r.reader?.commitP90, exact: false },
  { id: 'longTasks', label: 'long tasks while the whole paper was scrolled, summed over the papers (count)', of: (r) => r.reader?.longTasks, exact: false },
  { id: 'longestTask', label: 'the longest task while scrolling, the largest over the papers (ms)', of: (r) => r.reader?.longestTask, exact: false },
  { id: 'framesOver', label: 'frames over budget while scrolling (rAF intervals past 33.4 ms), per 1,000 frames', of: (r) => r.reader?.framesOverPerMille, exact: false },
  { id: 'heap', label: 'JS heap after the paper was scrolled once, after a GC (MiB), median over the papers', of: (r) => r.reader?.heapMiB, exact: false },
  { id: 'canvas', label: "the canvases in the document after the paper was scrolled once (MiB), median over the papers", of: (r) => r.reader?.canvasMiB, exact: false, judged: false },
  { id: 'renderer', label: "the renderer process's resident memory after the scroll (MiB), median over the papers", of: (r) => r.reader?.rendererMiB, exact: false },
  { id: 'gpu', label: "the GPU process's resident memory after the scroll (MiB), median over the papers", of: (r) => r.reader?.gpuMiB, exact: false },
  { id: 'mainToFirst', label: "the main thread's task time until the first translated page was drawn (ms, CDP TaskDuration), median over the papers", of: (r) => r.reader?.mainToFirstMs, exact: false },
  { id: 'page1Bytes', label: 'bytes on the wire to see page 1, everything (code, faces, layer, rows, PDF; the faces are equalised: reported, not judged), median over the papers', of: (r) => r.reader?.page1Bytes, exact: false, judged: false },
  { id: 'page1Data', label: "the paper's data on the wire to see page 1 (layer, rows, arXiv's PDF; JSON gzipped as the edge sends it), median over the papers", of: (r) => r.reader?.page1Data, exact: false },
  { id: 'wholeData', label: "the paper's data on the wire once the whole paper was scrolled, median over the papers", of: (r) => r.reader?.wholeData, exact: false },
  { id: 'codeBytes', label: 'script and worker bytes the reader page loaded (as served, every request)', of: (r) => r.reader?.codeBytes, exact: false },
  { id: 'switchMs', label: 'switching language: from the switch to the first page drawn in the new language (ms), median', of: (r) => r.reader?.switchMs, exact: false },
  { id: 'switchAgain', label: 'switching language: layer objects asked again (count, summed)', of: (r) => r.reader?.switchAgain, exact: false },
  { id: 'prepareWall', label: 'prepare in the box, wall (s), median over the papers', of: (r) => r.prepare?.wallS, exact: false },
  { id: 'prepareCpu', label: 'prepare in the box, CPU (s), median over the papers', of: (r) => r.prepare?.cpuS, exact: false },
  { id: 'prepareMem', label: "prepare in the box, the most memory no page cache could give back (anon + shmem, MiB, sampled during the measured prepare), median over the papers", of: (r) => r.prepare?.memPeakMiB, exact: false },
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
  // (the paper's data on the wire where the visit counted it so: JSON as the edge compresses it, binary as it is)
  const data = (b) => {
    if (!b) return NaN
    const w = b.wire ?? b
    return ['layer', 'rows', 'arxiv'].reduce((n, k) => n + (w[k] ?? 0), 0)
  }
  // (a value every visit must have: one that lacks it leaves the repetition's value none, never a smaller one)
  const every = (f, fold) => (visits.length && visits.every((v) => Number.isFinite(f(v))) ? fold(visits.map(f)) : NaN)
  const sum = (xs) => xs.reduce((a, x) => a + x, 0)
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
    longTasks: every((v) => v.scroll?.longTasks, sum),
    longestTask: every((v) => v.scroll?.longestTask, (xs) => Math.max(...xs)),
    framesOverPerMille: frames && visits.every((v) => v.scroll) ? round((over / frames) * 1000, 1) : NaN,
    heapMiB: every((v) => v.memory?.jsHeapMiB, median),
    canvasMiB: every((v) => v.memory?.canvasMiB, median),
    rendererMiB: every((v) => v.memory?.rendererMiB, median),
    gpuMiB: every((v) => v.memory?.gpuMiB, median),
    mainToFirstMs: every((v) => v.mainToFirstMs, median),
    page1Bytes: every((v) => v.page1?.wire?.all ?? v.page1?.all, median),
    page1Data: every((v) => data(v.page1), median),
    wholeData: every((v) => data(v.whole), median),
    codeBytes: every(code, median),
    switchMs: switched.length ? median(finite(switched.map((v) => v.switch.ms))) : NaN,
    switchAgain: switched.length ? switched.reduce((n, v) => n + (v.switch.askedAgain?.filter((a) => a[0] !== 'arxiv').length ?? 0), 0) : NaN,
  }
}

/** One repetition of prepares (prepare.sh's lines of one side, one a paper) as the measures read it; a paper not made counts as
 *  missing (the repetition's wall and CPU then none), never as fast */
export function prepareRepOf(runs) {
  // (a prepare counts where it was made, and, asked of a warm box, where the warming prepare was made too)
  const made = runs.filter((r) => r.ok && (!r.warm || r.warmOk === true))
  const all = made.length === runs.length && runs.length > 0
  const stored = (r) => (r.side === 'new' ? (r.objects ?? []).reduce((n, o) => n + o.bytes, 0) + (r.instrument ?? []).reduce((n, o) => n + o.bytes, 0) : storedToday(r))
  return {
    papers: runs.length,
    made: made.length,
    wallS: all ? median(made.map((r) => r.measured.wallS)) : NaN,
    cpuS: all ? median(made.map((r) => r.measured.cpuS)) : NaN,
    memPeakMiB: all ? median(made.map((r) => r.measured.anonShmemPeakMiB ?? r.measured.memPeakMiB)) : NaN,
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
    const ar = a.map(m.of),
      br = b.map(m.of)
    const av = finite(ar),
      bv = finite(br)
    // (neither side has it: this run did not measure it; one side lacks it, or some of its repetitions do: missing, which a
    // gate reads as a failure, never as equal)
    if (!av.length && !bv.length) {
      out[m.id] = { label: m.label, reading: 'not measured', a: null, b: null, judged: m.judged !== false }
      continue
    }
    if (!av.length || !bv.length || av.length < ar.length || bv.length < br.length) {
      out[m.id] = { label: m.label, reading: 'missing', a: av.length ? median(av) : null, b: bv.length ? median(bv) : null, n: [av.length, bv.length], judged: m.judged !== false }
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
      judged: m.judged !== false,
    }
  }
  return out
}

/** the measures a verdict fails on: a judged measure worse, or missing on a side (a measure this run did not take at all is
 *  neither) */
export const failingOf = (c) => Object.entries(c).filter(([, x]) => x.judged !== false && (x.reading === 'worse' || x.reading === 'missing')).map(([id]) => id)

/** the per-batch verdict: the head against the last round recorded, every measure the head has; FAIL where one is worse or missing */
export function batchVerdict(head, base) {
  const c = compare(head, base)
  const worse = failingOf(c)
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
