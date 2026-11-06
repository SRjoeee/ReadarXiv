// lab/typeset/gate-l1.mjs [--out=<dir>] [<pair>…]: the gate's runner over lane L1's parts (contract stage2-typeset,
// deliverable 4; packages/typeset/tests/replay/gate-l1.ts gateL1Pair): every member of the paper's L1 bundle set by the
// adapter's first stage (src/lay/adapt.ts: U.blocks, U.decor, U.params from the part's facts, the flow's shared rows), its
// reading and tokens still today's (the tap's), each page laid by layPagePrepared from its own L1 part. Writes each pair's
// reader dump in the baseline's format under <dir>/reader/ (default lab-data lanes/L3/gate/l1/): the laid units; the units it
// does not lay, with the baseline's cause or what stopped the adapter; the baseline's notLaid as they are. Prints the
// members not set by what stops them, the first field of each adapted member's setting that differs from today's, and risk 1
// (a member laid alike from each page's part). Then: node <baseline>/tools/diff.mjs <baseline> <dir> --scope=reader. Run from
// the worktree's root (heavy: through heavy-slot.sh test).
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readerDump } from '../../packages/typeset/tests/replay/display.ts'
import { gateL1Pair } from '../../packages/typeset/tests/replay/gate-l1.ts'
import { LAB, TAP } from '../../packages/typeset/tests/replay/tap.ts'

const args = process.argv.slice(2)
const OUT = args.find(a => a.startsWith('--out='))?.slice(6) ?? join(LAB, 'refactor-2026-11', 'lanes', 'L3', 'gate', 'l1')
const named = args.filter(a => !a.startsWith('--'))
const pairs = named.length ? named : readdirSync(join(TAP, 'ledgers')).map(f => f.replace(/\.ledger\.json\.gz$/, '')).sort()
mkdirSync(join(OUT, 'reader'), { recursive: true })
const count = { pairs: 0, laid: 0, adapted: 0, pages: 0, twoPages: 0, twoPagesDiffer: 0, threw: 0 }
const stops = new Map(), setting = new Map(), threw = [], selfDiffer = []
const add = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n)
for (const pair of pairs) {
  count.pairs++
  let g
  try { g = gateL1Pair(pair) } catch (e) { threw.push(`${pair}: ${String(e?.stack ?? e).slice(0, 300)}`); count.threw++; continue }
  count.laid += g.units.length
  count.adapted += g.setting.size
  count.pages += g.pages
  count.twoPages += g.twoPages
  count.twoPagesDiffer += g.selfDiffer.length
  for (const [k, n] of g.stops) add(stops, k, n)
  for (const v of g.setting.values()) add(setting, v)
  for (const t of g.threw) threw.push(`${pair} ${t}`)
  for (const why of g.thrown.values()) add(stops, `its flow's lay threw: ${why}`)
  for (const x of g.selfDiffer.slice(0, 2)) selfDiffer.push(`${pair} ${x}`)
  const base = readerDump(pair)
  const laid = new Set(g.units.map(u => u.ord))
  const left = (base.left ?? []).filter(l => !laid.has(l.ord))
  for (const u of base.units) if (!laid.has(u.ord)) left.push({ id: u.id, ord: u.ord, kind: u.kind, code: 'unadapted', why: 'not laid from L1’s part', pages: [] })
  writeFileSync(join(OUT, 'reader', `${pair}.reader.json`), JSON.stringify({ format: 'readarxiv-baseline/reader 1', paper: base.paper, target: base.target, units: g.units, left, notLaid: base.notLaid ?? [] }))
}
const top = m => [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join('; ')
console.log(JSON.stringify(count))
console.log(`not set by the adapter: ${top(stops)}`)
console.log(`setting against today's (first differing field): ${top(setting)}`)
if (selfDiffer.length) console.log(`laid otherwise from another page's part: ${selfDiffer.slice(0, 10).join('; ')}`)
if (threw.length) console.log(`threw (${threw.length}): ${threw.slice(0, 8).join(' | ')}`)
console.log(`dumps: ${join(OUT, 'reader')}`)
