// lab/typeset/gate.mjs [--out=<dir>] [<pair>…]: the gate's runner (contract stage2-typeset, deliverable 4) over the members
// as today prepared them (packages/typeset/tests/replay/gate.ts gatePair: every unit prepared from its last round's inputs in
// the tap, each page laid by the package's composition, layPagePrepared, from that page's own part, design-a §1.3). Writes
// each pair's reader dump in the baseline's format (FORMAT.md §4: the laid units' size, leading, lines with their text and
// crops; the units it does not lay, with the baseline's cause or its own; the baseline's notLaid as they are) under
// <dir>/reader/ (default lab-data lanes/L3/gate/today/), and counts risk 1 of the page decision: a member on two pages laid
// alike from each page's part. Then: node <baseline>/tools/diff.mjs <baseline> <dir> --scope=reader. The members from lane
// L1's parts (the adapter, Placed to Prepared) are this runner's next stage. Run from the worktree's root (heavy: through
// heavy-slot.sh test).
// --metrics=table: the tap's table alone, a measure it lacks throws MissingMeasure and leaves its unit unfit; default: the
// table, then the served measurer (served-metrics.mjs: the reader's faces, Skia's canvas) for a measure today never made, as
// gate-l1.mjs measures: the port's breaker cuts words today's walk never cut (round 8 B5's literal-fixes, 1a01e7206), whose
// widths the table cannot hold and the reader's canvas measures; --metrics=served: the measurer alone
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tableMetrics } from '../../packages/typeset/src/metrics/table.ts'
import { readerDump } from '../../packages/typeset/tests/replay/display.ts'
import { gatePair } from '../../packages/typeset/tests/replay/gate.ts'
import { LAB, readGz, TAP } from '../../packages/typeset/tests/replay/tap.ts'
import { layered, servedMetrics } from './served-metrics.mjs'

const args = process.argv.slice(2)
const METRICS = args.find(a => a.startsWith('--metrics='))?.slice(10) ?? 'layered'
const served = METRICS === 'table' ? null : servedMetrics()
const metricsOf = pair => (METRICS === 'served' ? served : layered(tableMetrics(readGz(join(TAP, 'metrics', `${pair}.metrics.json.gz`))), served))
const OUT = args.find(a => a.startsWith('--out='))?.slice(6) ?? join(LAB, 'refactor-2026-11', 'lanes', 'L3', 'gate', 'today')
const named = args.filter(a => !a.startsWith('--'))
const pairs = named.length ? named : readdirSync(join(TAP, 'ledgers')).map(f => f.replace(/\.ledger\.json\.gz$/, '')).sort()
mkdirSync(join(OUT, 'reader'), { recursive: true })
const count = { pairs: 0, prepared: 0, laid: 0, pages: 0, twoPages: 0, twoPagesDiffer: 0, ms: 0 }
const selfDiffer = []
const I5by = new Map(), byPaper = new Map(), below = []
const inv = { laid: 0, I3: 0, I4: 0, I5: 0 }, invEx = { I3: [], I4: [], I5: [] }
for (const pair of pairs) {
  count.pairs++
  const g = gatePair(pair, METRICS === 'table' ? {} : { metricsOf })
  count.prepared += g.prepared.size
  count.laid += g.units.length
  count.pages += g.pages
  count.twoPages += g.twoPages
  count.twoPagesDiffer += g.selfDiffer.length
  count.ms += g.ms
  for (const k of ['I3', 'I4', 'I5']) { inv[k] += g.inv[k].length; for (const x of g.inv[k]) if (invEx[k].length < 3) invEx[k].push(`${pair} ${x}`) }
  inv.laid += g.inv.laid
  for (const o of g.inv.below ?? []) below.push(`${pair} ${o}`)
  { const paper = pair.replace(/-[a-z]{2,3}(\.pack)?$/, ''), b = byPaper.get(paper) ?? byPaper.set(paper, { I3: 0, I4: 0 }).get(paper); b.I3 += g.inv.I3.length; b.I4 += g.inv.I4.length }
  for (const [k, b] of g.inv.I5by ?? []) { const t = I5by.get(k) ?? I5by.set(k, { n: 0, max: 0 }).get(k); t.n += b.n; t.max = Math.max(t.max, b.max) }
  for (const x of g.selfDiffer.slice(0, 3)) selfDiffer.push(`${pair} ${x}`)
  const base = readerDump(pair)
  const laid = new Set(g.units.map(u => u.ord))
  const left = (base.left ?? []).filter(l => !laid.has(l.ord))
  for (const u of base.units)
    if (!laid.has(u.ord))
      left.push({ id: u.id, ord: u.ord, kind: u.kind, code: g.prepared.has(u.ord) ? 'unfit' : 'unprepared', why: g.prepared.has(u.ord) ? 'left by the composition' : 'no member prepared from the tap', pages: [] })
  writeFileSync(join(OUT, 'reader', `${pair}.reader.json`), JSON.stringify({ format: 'readarxiv-baseline/reader 1', paper: base.paper, target: base.target, units: g.units, left, notLaid: base.notLaid ?? [], figures: base.figures ?? [], names: base.names ?? [] }))
}
console.log(JSON.stringify({ ...count, ms: Math.round(count.ms), msPerPage: Math.round((count.ms / count.pages) * 100) / 100 }))
console.log(`I3, I4 by paper: ${JSON.stringify(Object.fromEntries(byPaper))}`)
console.log(`under the fit's floor (X.further's shrink): ${below.length} members`)
if (process.env.AXT_GATE_BELOW) writeFileSync(process.env.AXT_GATE_BELOW, `${below.join('\n')}\n`)
console.log(`I5, each line past its slot by the placement's rule (count, largest excess pt): ${[...I5by].map(([k, b]) => `${k} ${b.n} (${b.max.toFixed(2)})`).join('; ')}`)
console.log(`invariants over the laid members: ${JSON.stringify(inv)}; ${['I3', 'I4', 'I5'].map(k => `${k}: ${invEx[k].join(' | ')}`).join('; ')}`)
if (selfDiffer.length) console.log(`laid otherwise from another page's part: ${selfDiffer.slice(0, 10).join('; ')}`)
console.log(`dumps: ${join(OUT, 'reader')}; metrics: ${METRICS === 'table' ? "the tap's table alone" : METRICS === 'served' ? 'the served faces alone' : "the tap's table, then the served faces"}`)
