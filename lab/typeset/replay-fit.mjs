// lab/typeset/replay-fit.mjs [<pair>…]: a unit's lay replayed from F2 to its last word on every laid round of every unit of
// the tap's 123 ledgers (or the pairs named): X.walk whole at today's smallest composite, layoutCut (F2), then each step of the
// round from the one before (packages/typeset/tests/replay/round.ts: S.onLeadRetry, X.numbered, X.further, X.runs, S.share,
// `out`), the inputs as fit-input.ts makes them from the ledger, the tokens file and the metrics table; each step's answer
// against its slot (the tap's summary: the state, size, knob, counts, each line's page, baseline, ends, mode, block and
// items). Prints the counts, the steps replayed, where chains stopped and why, the classes of difference by the step and the
// first differing field, up to five cases a class; writes nothing. Run from the worktree's root (heavy: through
// heavy-slot.sh test):
//   node lab/typeset/replay-fit.mjs
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { walkCase } from '../../packages/typeset/tests/replay/fit-input.ts'
import { chain } from '../../packages/typeset/tests/replay/round.ts'
import { ledger, TAP } from '../../packages/typeset/tests/replay/tap.ts'

const pairs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(join(TAP, 'ledgers')).map(f => f.replace(/\.ledger\.json\.gz$/, '')).sort()
const count = { pairs: 0, cases: 0, equal: 0, differ: 0, threw: 0, withCrops: 0, f2Equal: 0 }
const steps = new Map(), stopped = new Map()
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
        const got = chain(c)
        for (const s of got.steps) steps.set(s, (steps.get(s) ?? 0) + 1)
        if (got.steps.includes('F2')) count.f2Equal++
        if (got.stopped) stopped.set(got.stopped, (stopped.get(got.stopped) ?? 0) + 1)
        d = got.d ? `${got.at} ${got.d}` : null
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
console.log(`steps ${JSON.stringify(Object.fromEntries(steps))}`)
console.log(`stopped ${JSON.stringify(Object.fromEntries(stopped))}`)
for (const [cls, list] of [...classes].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${list.length} ${cls}`)
  for (const x of list.slice(0, 5)) console.log(`  ${x}`)
}
process.exit(count.differ ? 1 : 0)
