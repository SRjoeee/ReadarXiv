// lab/typeset/replay-names.mjs [<pair>…]: S.names and S.nameLed replayed on the tap's 123 pairs (or the pairs named):
// every babel name of the pair's pages set by the port over the page's characters as today read them (the tap's, else today's
// reading of the page's draw: lab/typeset/tests/replay/today-names.ts), against the baseline's reader dump; every
// S.nameLed slot of the ledgers, every other laid round checked to take none (names.ts). Prints the counts, the names whose
// answer needs the design widths the tap does not record, and the classes of difference, up to five cases a class; writes
// nothing. Run from the worktree's root (heavy: through heavy-slot.sh test):
//   node lab/typeset/replay-names.mjs
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { namesOf } from './tests/replay/names.ts'
import { TAP } from '../../packages/typeset/tests/replay/tap.ts'

const pairs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(join(TAP, 'ledgers')).map(f => f.replace(/\.ledger\.json\.gz$/, '')).sort()
const count = { pairs: 0, names: 0, equal: 0, differ: 0, widths: 0, tapOther: 0, threw: 0, ledCases: 0, ledSlots: 0, ledDiffer: 0 }
const classes = new Map(), widths = [], tapOther = []
const t0 = performance.now()
for (const pair of pairs) {
  count.pairs++
  let r
  try { r = await namesOf(pair) } catch (e) { count.threw++; console.log(`${pair} threw: ${e?.stack ?? e}`); continue }
  for (const n of r.names) {
    count.names++
    if (n.tapOther) { count.tapOther++; tapOther.push(`${pair} occ ${n.occurrence} p${n.page}`) }
    if (n.widths) { count.widths++; widths.push(`${pair} occ ${n.occurrence} p${n.page}`); continue }
    if (!n.d) { count.equal++; continue }
    count.differ++
    const cls = n.d.replace(/\[\d+\]/g, '[]').replace(/:.*/, '')
    const list = classes.get(cls) ?? classes.set(cls, []).get(cls)
    list.push(`${pair} occ ${n.occurrence} p${n.page} (${n.chars}): ${n.d}`)
  }
  count.ledCases += r.led.cases
  count.ledSlots += r.led.slots
  count.ledDiffer += r.led.differ.length
  for (const d of r.led.differ) {
    const list = classes.get('S.nameLed') ?? classes.set('S.nameLed', []).get('S.nameLed')
    list.push(`${pair} ${d}`)
  }
}
console.log(JSON.stringify({ ...count, seconds: Math.round((performance.now() - t0) / 100) / 10 }))
if (widths.length) console.log(`needs the design widths: ${widths.slice(0, 10).join('; ')}`)
if (tapOther.length) console.log(`the tap's own page characters give another answer: ${tapOther.slice(0, 10).join('; ')}`)
for (const [cls, list] of [...classes].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${list.length} ${cls}`)
  for (const x of list.slice(0, 5)) console.log(`  ${x}`)
}
process.exit(count.differ || count.threw || count.ledDiffer ? 1 : 0)
