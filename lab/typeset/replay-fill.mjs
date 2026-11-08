// lab/typeset/replay-fill.mjs [<pair>…]: the page's fill (S.fill.page, with S.fill.target and S.settle inside it) replayed on
// every pass of the tap's 123 ledgers (or the pairs named): every unit laid by the chain from F2 to its fill leadings
// (packages/typeset/tests/replay/round.ts, its last round), then each pass by fillPass (pass.ts), each answer against the
// tap's (the page's target, each unit's decision, the page's size, each unit filled, each begun unit's final layout). Prints
// the counts, the passes not replayed (a unit the chain did not lay) and the classes of difference, up to five cases a class;
// writes nothing. Run from the worktree's root (heavy: through heavy-slot.sh test):
//   node lab/typeset/replay-fill.mjs
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { laysOf, passesOf } from '../../packages/typeset/tests/replay/pass.ts'
import { TAP } from '../../packages/typeset/tests/replay/tap.ts'

const pairs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(join(TAP, 'ledgers')).map(f => f.replace(/\.ledger\.json\.gz$/, '')).sort()
const count = { pairs: 0, passes: 0, equal: 0, ruled: 0, differ: 0, notReplayed: 0, threw: 0, filled: 0, chainsDiffer: 0 }
const classes = new Map(), missing = []
const t0 = performance.now()
for (const pair of pairs) {
  count.pairs++
  const { lays, differ } = laysOf(pair)
  count.chainsDiffer += differ.length
  let results
  try { results = passesOf(pair, lays) } catch (e) { count.threw++; console.log(`${pair} threw: ${e?.stack ?? e}`); continue }
  for (const r of results) {
    count.passes++
    if (r.missing) { count.notReplayed++; missing.push(`${pair} p${r.page}: ${r.missing.join(',')}`); continue }
    count.filled += r.filled
    if (r.ruled) { count.ruled++; continue }
    if (!r.d) { count.equal++; continue }
    count.differ++
    const cls = r.d.replace(/\[\d+\]/g, '[]').replace(/ord \d+/, 'ord').replace(/:.*/, '')
    const list = classes.get(cls) ?? classes.set(cls, []).get(cls)
    list.push(`${pair} p${r.page}: ${r.d}`)
  }
}
console.log(JSON.stringify({ ...count, seconds: Math.round((performance.now() - t0) / 100) / 10 }))
if (missing.length) console.log(`not replayed (a unit the chain did not lay): ${missing.slice(0, 10).join('; ')}`)
for (const [cls, list] of [...classes].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${list.length} ${cls}`)
  for (const x of list.slice(0, 5)) console.log(`  ${x}`)
}
process.exit(count.differ || count.threw ? 1 : 0)
