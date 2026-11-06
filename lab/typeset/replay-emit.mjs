// lab/typeset/replay-emit.mjs [<pair>…]: D.text's segments, D.sentences' table and D.links' placement replayed against today's
// own functions (engine 065c1d973 textlayer.mjs segsOfUnit, words.mjs addUnitWords, links.mjs placeUnit) on every laid unit's
// every page of the tap's 123 pairs (or those named), at its final layout (the chain from F2 and each page's fill:
// packages/typeset/tests/replay/emit.ts). Prints the counts and the first differences; writes nothing. Run from the
// worktree's root (heavy: through heavy-slot.sh test).
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { emitReplay } from '../../packages/typeset/tests/replay/emit.ts'
import { TAP } from '../../packages/typeset/tests/replay/tap.ts'

const pairs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(join(TAP, 'ledgers')).map(f => f.replace(/\.ledger\.json\.gz$/, '')).sort()
const sum = { pairs: 0, pages: 0, segs: 0, tokens: 0, linkUnits: 0, records: 0, differ: 0 }
const first = []
const t0 = performance.now()
for (const pair of pairs) {
  const r = await emitReplay(pair)
  sum.pairs++
  for (const k of ['pages', 'segs', 'tokens', 'linkUnits', 'records']) sum[k] += r[k]
  sum.differ += r.differ.length
  for (const d of r.differ.slice(0, 2)) if (first.length < 10) first.push(`${pair} ${d}`)
}
console.log(JSON.stringify({ ...sum, seconds: Math.round((performance.now() - t0) / 100) / 10 }))
for (const d of first) console.log(`  ${d}`)
process.exit(sum.differ ? 1 : 0)
