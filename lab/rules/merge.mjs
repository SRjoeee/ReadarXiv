// lab/rules/merge.mjs: raw records (recorder.mjs, one a process or a test file) summed into one recording: per site and
// per input (the record's `input`: `tests`, the corpus's runs, `holdout`; a test file that read the lab's data is
// `tests-lab`, the corpus again, not a case someone wrote: design-reduction §8.9), how often it ran and each outcome's count,
// the nearest case on each side of the bound, each list entry's hits, the tests per outcome; per rule, its sites' sums.
// A record made over another site map is refused. Pure but for reading the records. Not shipped.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { RAW_FORMAT } from './recorder.mjs'

export const RECORDING_FORMAT = 'readarxiv/rules-recording 1'
const TESTS_KEPT = 50

const recordsIn = dir =>
  statSync(dir).isDirectory()
    ? readdirSync(dir)
        .filter(f => f.endsWith('.json') && f !== 'recording.json' && f !== 'sites.json')
        .sort()
        .map(f => join(dir, f))
    : [dir]

/** a site's sums over the records */
const emptySite = () => ({ n: 0, t: 0, f: 0, nan: 0, near: [null, null], tests: [null, null], hits: null, reads: null, papers: 0 })
function addInto(m, r) {
  m.n += r.n
  m.t += r.t
  m.f += r.f
  m.nan += r.nan ?? 0
  for (const slot of [0, 1]) {
    const c = r.near?.[slot]
    if (c && (!m.near[slot] || c.d < m.near[slot].d)) m.near[slot] = c
    const t = r.tests?.[slot]
    if (t) {
      const into = (m.tests[slot] ??= { kept: [], more: 0 })
      for (const k of t.kept) if (!into.kept.includes(k)) into.kept.length < TESTS_KEPT ? into.kept.push(k) : into.more++
      into.more += t.more
    }
  }
  if (r.hits) for (const [k, v] of Object.entries(r.hits)) (m.hits ??= {})[k] = (m.hits[k] ?? 0) + v
  if (r.reads) for (const [k, v] of Object.entries(r.reads)) (m.reads ??= {})[k] = (m.reads[k] ?? 0) + v
  m.papers++
}

/** the recording: `map` the site map the records were made over, `dirs` folders (or files) of raw records */
export function mergeRecords(map, dirs) {
  const byInput = {}
  const inputs = {}
  let records = 0
  for (const file of dirs.flatMap(recordsIn)) {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    if (raw.format !== RAW_FORMAT) continue
    if (raw.map !== map.digest) throw new Error(`lab/rules: ${file} was recorded over another site map (${raw.map}, not ${map.digest})`)
    records++
    const input = raw.input === 'tests' && raw.labRead ? 'tests-lab' : (raw.input ?? 'corpus')
    const into = (byInput[input] ??= {})
    const meta = (inputs[input] ??= { records: 0, papers: new Set(), ms: 0 })
    meta.records++
    if (raw.paper) meta.papers.add(raw.paper)
    meta.ms += raw.ms ?? 0
    for (const [id, r] of Object.entries(raw.sites)) addInto((into[id] ??= emptySite()), r)
  }
  // (a rule: its sites' sums, per input; it ran where any of its sites did)
  const rules = {}
  for (const [key, rule] of Object.entries(map.rules)) {
    const per = {}
    for (const [input, sites] of Object.entries(byInput)) {
      const s = { n: 0, t: 0, f: 0, decisions: 0, reads: 0 }
      for (const id of rule.sites) {
        const r = sites[id]
        if (!r) continue
        if (map.sites[id].kind === 'val') s.reads += r.n
        else {
          s.n += r.n
          s.t += r.t
          s.f += r.f
        }
      }
      if (s.n || s.reads) per[input] = s
    }
    rules[key] = per
  }
  const all = Object.keys(map.rules)
  const ran = all.filter(k => Object.keys(rules[k]).length)
  const sitesRun = new Set(Object.values(byInput).flatMap(s => Object.keys(s)))
  const agreement = {
    rules: all.length,
    ran: ran.length,
    sites: map.sites.length,
    sitesRun: sitesRun.size,
    line: `${ran.length} of ${all.length} rules ran (${sitesRun.size} of ${map.sites.length} sites), inputs ${Object.entries(inputs)
      .map(([k, v]) => `${k} ${v.records} records, ${v.papers.size} papers`)
      .join('; ')}`,
  }
  return {
    format: RECORDING_FORMAT,
    map: map.digest,
    commit: map.commit,
    records,
    inputs: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, { records: v.records, papers: [...v.papers].sort(), ms: v.ms }])),
    agreement,
    sites: byInput,
    rules,
  }
}
