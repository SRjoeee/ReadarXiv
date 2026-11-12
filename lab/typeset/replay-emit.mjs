// lab/typeset/replay-emit.mjs [<pair>…]: D.text's segments, D.sentences' table and D.links' placement replayed against today's
// own functions (engine 065c1d973 textlayer.mjs segsOfUnit, words.mjs addUnitWords, links.mjs placeUnit) on every laid unit's
// every page of the tap's 123 pairs (or those named), at its final layout (the chain from F2 and each page's fill:
// lab/typeset/tests/replay/emit.ts). Prints the counts and the first differences; writes nothing. A pair whose chain or fill
// throws (a text the tap's table lacks: MissingMeasure) is counted `threw` and named, the others replayed, as replay-display.mjs
// does. Run from the worktree's root (heavy: through heavy-slot.sh test).
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { emitReplay } from './tests/replay/emit.ts'
import { TAP } from '../../packages/typeset/tests/replay/tap.ts'

const pairs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(join(TAP, 'ledgers')).map(f => f.replace(/\.ledger\.json\.gz$/, '')).sort()
const sum = { pairs: 0, pages: 0, segs: 0, tokens: 0, linkUnits: 0, records: 0, differ: 0, threw: 0 }
const first = []
const t0 = performance.now()
for (const pair of pairs) {
  sum.pairs++
  let r
  try { r = await emitReplay(pair) } catch (e) { sum.threw++; console.log(`${pair} threw: ${e?.stack ?? e}`); continue }
  for (const k of ['pages', 'segs', 'tokens', 'linkUnits', 'records']) sum[k] += r[k]
  sum.differ += r.differ.length
  for (const d of r.differ.slice(0, 2)) if (first.length < 10) first.push(`${pair} ${d}`)
}
console.log(JSON.stringify({ ...sum, seconds: Math.round((performance.now() - t0) / 100) / 10 }))
for (const d of first) console.log(`  ${d}`)
process.exit(sum.differ || sum.threw ? 1 : 0)
