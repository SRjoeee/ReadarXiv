// lab/pdf/spikes/layer-gate/speed.mjs
// The speed check of a batch of engine changes: head against base on the layer gate's `--perf` model runs (run-speed.sh makes
// them, interleaved three times so that drift and load fall on both sides alike), summarised with a verdict the owner's
// standing rule asks for. A clock is noisy, so the check has two kinds of evidence:
//   - time and memory, each held to the run-to-run spread: a metric (first page's draw time, per-page lay time, pages over
//     50 ms and over 100 ms, the heap's growth per laid page) FAILS when head's median over the repetitions is worse than
//     base's by more than the largest spread (max - min over the repetitions) of either side;
//   - the deterministic work counters (layer-proto/work.mjs: fit states tried, width measures, breaking passes, link-matching
//     work units, ink-map cells, drawing operations), which do not depend on the machine: ANY counter whose total grows by
//     more than 0.5 % FAILS, whatever the clock said. A base that has no counters (it predates them) leaves the counters
//     unmeasured, which is not a pass: the verdict is then INCOMPARABLE for them.
//   node lab/pdf/spikes/layer-gate/speed.mjs <logs dir> [--reps=3]
// reads <logs dir>/model-{head,base}-r<k>.log (each the log of one `layer-gate.mjs --tier=model --perf --workers=1` run, which
// names its run file: "the run in <file>.json"), prints the table and the verdict, and exits 1 on FAIL, 2 on INCOMPARABLE
// with no FAIL, else 0. Reading finished runs only: no browser, no clock.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** the work counters' keys, as layer-proto/work.mjs names them */
export const WORK_KEYS = ['fit', 'measures', 'breaks', 'linkTests', 'inkSteps', 'ops']
/** the growth of a work counter's total beyond which the check fails */
export const WORK_TOLERANCE = 0.005
/** the page step beyond which a page counts as slow (ms) */
export const SLOW_MS = [50, 100]

const finite = a => a.filter(Number.isFinite)

/** the q-th percentile (0 to 100) of a list by linear interpolation between ranks (NaN for no values) */
export function percentile(values, q) {
  const s = finite(values).sort((a, b) => a - b)
  if (!s.length) return Number.NaN
  const at = (q / 100) * (s.length - 1)
  const lo = Math.floor(at), hi = Math.ceil(at)
  return s[lo] + (s[hi] - s[lo]) * (at - lo)
}
export const median = values => percentile(values, 50)
/** the run-to-run spread of a metric: the largest value less the smallest over its repetitions */
export function spread(values) {
  const s = finite(values)
  return s.length ? Math.max(...s) - Math.min(...s) : Number.NaN
}
/** the least-squares slope of a series against its index (the unit of the series a step), NaN for fewer than two values */
export function slope(ys) {
  const v = finite(ys), n = v.length
  if (n < 2) return Number.NaN
  const mx = (n - 1) / 2, my = v.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  v.forEach((y, i) => { num += (i - mx) * (y - my); den += (i - mx) ** 2 })
  return num / den
}

/**
 * The numbers of one run (the model tier's run file with --perf): per page `perf` = { firstDraw, step, times: { lay, … },
 * work, jsHeap }. Returns { time: { <metric>: value }, work: { totals, perPage } | null }. The lay time is the page's `times.lay`,
 * the slow pages are counted on the page's `step`, the memory is the median over the outputs of the heap's growth a laid page
 * (bytes; the slope of `jsHeap` against the page's position in its output, outputs of fewer than 8 pages left out)
 */
export function summarizeRun(run) {
  const outs = Object.values(run.fixtures ?? {})
  const pages = outs.flatMap(f => (f.pages ?? []).map(p => p.perf).filter(Boolean))
  const first = outs.map(f => f.pages?.[0]?.perf?.firstDraw)
  const lay = pages.map(p => p.times?.lay)
  const step = pages.map(p => p.step)
  const slopes = outs.filter(f => (f.pages?.length ?? 0) >= 8).map(f => slope(f.pages.map(p => p.perf?.jsHeap)))
  const time = {
    'first page draw p50 (ms)': median(first),
    'first page draw p95 (ms)': percentile(first, 95),
    'page lay p50 (ms)': median(lay),
    'page lay p95 (ms)': percentile(lay, 95),
    ...Object.fromEntries(SLOW_MS.map(ms => [`pages over ${ms} ms (count)`, finite(step).filter(x => x > ms).length])),
    'heap growth per laid page (bytes)': median(slopes),
  }
  const withWork = pages.filter(p => p.work)
  let work = null
  if (withWork.length) {
    const totals = Object.fromEntries(WORK_KEYS.map(k => [k, withWork.reduce((a, p) => a + (p.work[k] ?? 0), 0)]))
    const perPage = Object.fromEntries(WORK_KEYS.map(k => [k, { p50: median(withWork.map(p => p.work[k] ?? 0)), p95: percentile(withWork.map(p => p.work[k] ?? 0), 95) }]))
    work = { totals, perPage, pages: withWork.length }
  }
  return { time, work }
}

/**
 * The verdict. `head`, `base`: the summaries of each repetition (summarizeRun's), in the same order. A time metric FAILS when
 * head's median over the repetitions exceeds base's by more than the larger of the two sides' spreads; a work counter FAILS
 * when its total (the repetitions agree: it is deterministic, the first is taken, and a side whose repetitions differ is
 * reported as `unstable`, a FAIL) grows by more than WORK_TOLERANCE. Returns { verdict: 'PASS' | 'FAIL' | 'INCOMPARABLE', time, work }.
 */
export function verdictOf(head, base) {
  const time = {}
  for (const name of Object.keys(head[0]?.time ?? {})) {
    const h = head.map(r => r.time[name]), b = base.map(r => r.time[name])
    const hm = median(h), bm = median(b), sp = Math.max(spread(h), spread(b))
    const worse = Number.isFinite(hm) && Number.isFinite(bm) && hm - bm > sp
    time[name] = { head: hm, base: bm, spread: sp, fail: worse }
  }
  const work = {}
  let comparable = true
  for (const k of WORK_KEYS) {
    const h = head.map(r => r.work?.totals[k]), b = base.map(r => r.work?.totals[k])
    if (h.some(x => x === undefined) || b.some(x => x === undefined)) { comparable = false; work[k] = { head: h[0], base: b[0], missing: true, fail: false }; continue }
    const unstable = new Set(h).size > 1 || new Set(b).size > 1
    const grew = b[0] > 0 ? (h[0] - b[0]) / b[0] > WORK_TOLERANCE : h[0] > 0
    work[k] = { head: h[0], base: b[0], unstable, fail: grew || unstable }
  }
  const failed = Object.values(time).some(m => m.fail) || Object.values(work).some(m => m.fail)
  return { verdict: failed ? 'FAIL' : comparable ? 'PASS' : 'INCOMPARABLE', time, work }
}

const f1 = x => (Number.isFinite(x) ? (Math.abs(x) >= 1e6 ? x.toExponential(2) : x.toFixed(Math.abs(x) < 10 ? 2 : 1)) : '-')

/** the report as lines of text */
export function report(v, head, base) {
  const out = []
  out.push(`speed check, head vs base, ${head.length} interleaved repetitions (median of the repetitions; spread = largest max - min of either side)`)
  out.push('', 'time and memory (lower is better; FAIL when head - base exceeds the spread)')
  for (const [name, m] of Object.entries(v.time)) out.push(`${m.fail ? 'FAIL' : 'ok  '} ${name.padEnd(36)} head ${f1(m.head).padStart(10)} | base ${f1(m.base).padStart(10)} | diff ${f1(m.head - m.base).padStart(9)} | spread ${f1(m.spread).padStart(8)}`)
  out.push('', `work counters (deterministic; FAIL when a total grows by more than ${WORK_TOLERANCE * 100} %)`)
  for (const k of WORK_KEYS) {
    const m = v.work[k]
    const h = head[0]?.work?.perPage[k], b = base[0]?.work?.perPage[k]
    const pct = m.base ? ` (${f1(((m.head - m.base) / m.base) * 100)} %)` : ''
    if (m.missing) { out.push(`n/a  ${k.padEnd(10)} head ${f1(m.head).padStart(12)} | base ${f1(m.base).padStart(12)}   not measured on one side: the base predates the counters`); continue }
    out.push(`${m.fail ? 'FAIL' : 'ok  '} ${k.padEnd(10)} total head ${f1(m.head).padStart(12)} | base ${f1(m.base).padStart(12)}${pct}${m.unstable ? '  UNSTABLE between repetitions' : ''} ; per page p50 ${f1(h?.p50)}/${f1(b?.p50)}, p95 ${f1(h?.p95)}/${f1(b?.p95)} (head/base)`)
  }
  out.push('', `verdict: ${v.verdict}${v.verdict === 'INCOMPARABLE' ? ' (the work counters could not be compared; the time metrics alone found no worsening)' : ''}`)
  return out
}

const runFile = file => {
  if (!existsSync(file)) return null
  const m = /the run in (\S+\.json)/.exec(readFileSync(file, 'utf8'))
  return m && existsSync(m[1]) ? JSON.parse(readFileSync(m[1], 'utf8')) : null
}

/** the repetitions of one side found in a logs folder: model-<side>-r1.log, -r2, … (those with a run file) */
export function repetitions(dir, side, reps) {
  const out = []
  for (let k = 1; k <= reps; k++) {
    const run = runFile(join(dir, `model-${side}-r${k}.log`))
    if (run) out.push(summarizeRun(run))
  }
  return out
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2]
  const reps = Number(process.argv.find(a => a.startsWith('--reps='))?.slice(7) ?? 3)
  if (!dir) { console.error('usage: speed.mjs <logs dir> [--reps=3]'); process.exit(64) }
  const head = repetitions(dir, 'head', reps), base = repetitions(dir, 'base', reps)
  if (!head.length || head.length !== base.length) { console.error(`the repetitions are not paired: head ${head.length}, base ${base.length}`); process.exit(64) }
  const v = verdictOf(head, base)
  console.log(report(v, head, base).join('\n'))
  process.exit(v.verdict === 'FAIL' ? 1 : v.verdict === 'INCOMPARABLE' ? 2 : 0)
}
