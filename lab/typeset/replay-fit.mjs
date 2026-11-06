// lab/typeset/replay-fit.mjs [<pair>…]: X.walk replayed whole at today's smallest composite, layoutCut (F2), on every laid
// round of every unit of the tap's 123 ledgers (or the pairs named): the walk's inputs as packages/typeset/tests/replay/
// fit-input.ts makes them from the ledger, the tokens file and the metrics table; the port's layout against F2's slot (its
// summary: the state, size, knob, counts, each line's page, baseline, ends, mode, block and items). Prints the counts, the
// classes of difference by the first differing field, and up to five cases a class; writes nothing. Run from the worktree's
// root (heavy: through heavy-slot.sh test):
//   node lab/typeset/replay-fit.mjs
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { layoutCut } from '../../packages/typeset/src/fit/cut.mjs'
import { layoutOf, linesOf, walkCase } from '../../packages/typeset/tests/replay/fit-input.ts'
import { firstDifference, ledger, TAP } from '../../packages/typeset/tests/replay/tap.ts'

const pairs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(join(TAP, 'ledgers')).map(f => f.replace(/\.ledger\.json\.gz$/, '')).sort()
const count = { pairs: 0, cases: 0, equal: 0, differ: 0, threw: 0, withCrops: 0 }
const classes = new Map()
const t0 = performance.now()
for (const pair of pairs) {
  count.pairs++
  for (const u of ledger(pair).units) {
    const rounds = [...new Set(u.slots.filter(s => s.by === 'X.cut').map(s => s.round))]
    for (const r of rounds) {
      const c = walkCase(pair, u.ord, r)
      if (typeof c === 'string') continue
      count.cases++
      if (c.crops) count.withCrops++
      let d
      try {
        const got = layoutCut(c.tokens, c.blocks, c.s, c.P)
        d = firstDifference(layoutOf(got.layout), c.want.layout, 'layout') ??
          firstDifference(linesOf(got.layout), c.want.layoutLines, 'lines') ??
          firstDifference(got.tokens.length, c.want.cutTokens, 'cutTokens') ??
          firstDifference(c.tokens.length, c.want.tokens, 'tokens')
      } catch (e) {
        count.threw++
        d = `threw: ${String(e?.message ?? e).slice(0, 160)}`
      }
      if (!d) { count.equal++; continue }
      count.differ++
      const cls = d.replace(/\[\d+\]/g, '[]').replace(/:.*/, '')
      const list = classes.get(cls) ?? classes.set(cls, []).get(cls)
      list.push(`${pair} ord ${u.ord} round ${r}${c.crops ? ' (crops)' : ''}: ${d}`)
    }
  }
}
console.log(JSON.stringify({ ...count, seconds: Math.round((performance.now() - t0) / 100) / 10 }))
for (const [cls, list] of [...classes].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${list.length} ${cls}`)
  for (const x of list.slice(0, 5)) console.log(`  ${x}`)
}
process.exit(count.differ ? 1 : 0)
