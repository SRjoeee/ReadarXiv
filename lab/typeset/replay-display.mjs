// lab/typeset/replay-display.mjs [<pair>…]: D.display replayed against the baseline's reader dumps on the tap's 123 pairs (or
// the pairs named): every unit laid by the chain from F2 and filled by its page's pass (packages/typeset/tests/replay/pass.ts),
// drawn by D.display and read as the baseline's harness reads today's drawing (tests/replay/display.ts dumpUnit), against the
// dump's laid units: size, leading, each line's page, x0, x1, baseline and text, each crop's piece and box. Prints the counts
// and the classes of difference, up to five cases a class; writes nothing. Run from the worktree's root (heavy: through
// heavy-slot.sh test):
//   node lab/typeset/replay-display.mjs
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { displayReplay } from '../../packages/typeset/tests/replay/display.ts'
import { TAP } from '../../packages/typeset/tests/replay/tap.ts'

const pairs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(join(TAP, 'ledgers')).map(f => f.replace(/\.ledger\.json\.gz$/, '')).sort()
const count = { pairs: 0, units: 0, equal: 0, differ: 0, unlaid: 0, lines: 0, elements: 0, threw: 0, chains: 0 }
const classes = new Map(), unlaid = [], chains = []
const t0 = performance.now()
for (const pair of pairs) {
  count.pairs++
  let r
  try { r = displayReplay(pair) } catch (e) { count.threw++; console.log(`${pair} threw: ${e?.stack ?? e}`); continue }
  count.units += r.units; count.equal += r.equal; count.lines += r.lines; count.elements += r.elements
  count.unlaid += r.unlaid.length; count.chains += r.chains.length
  for (const o of r.unlaid) unlaid.push(`${pair} ord ${o}`)
  for (const c of r.chains) chains.push(`${pair} ${c}`)
  for (const { ord, d } of r.differ) {
    count.differ++
    const cls = d.replace(/\[\d+\]/g, '[]').replace(/:.*/, '')
    const list = classes.get(cls) ?? classes.set(cls, []).get(cls)
    list.push(`${pair} ord ${ord}: ${d}`)
  }
}
console.log(JSON.stringify({ ...count, seconds: Math.round((performance.now() - t0) / 100) / 10 }))
if (unlaid.length) console.log(`not laid by the chain: ${unlaid.slice(0, 10).join('; ')}`)
if (chains.length) console.log(`chains or crops off: ${chains.slice(0, 10).join('; ')}`)
for (const [cls, list] of [...classes].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${list.length} ${cls}`)
  for (const x of list.slice(0, 5)) console.log(`  ${x}`)
}
process.exit(count.differ || count.threw ? 1 : 0)
