// lab/typeset/replay-figures.mjs [--marks=today] [<pair>…]: S.figures replayed on every figure text of the baseline's 123 reader
// dumps (or the pairs named): each page's figure units as today's bundle holds them, their rows as the door gave them, faces,
// widths and rules as today's run had them (packages/typeset/tests/replay/figures.ts), each outcome projected as the dump
// projects it and compared whole (unit, page, drawn, why, line: x0, baseline, turn, text). `--marks=today` sets a translation
// by its advance, as today's did (figures.ts); else by its ink, as v2 does. Prints the counts and the classes of difference by
// the first differing field, up to five cases a class, and the texts today left crowded over a stroke that the set's shrink
// now draws (`cleared`) and their sets' others (`stepped`), each listed, which are no difference (figures.ts); writes nothing. Run from the worktree's root (heavy: through
// heavy-slot.sh test):
//   node lab/typeset/replay-figures.mjs
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { replayFigures } from '../../packages/typeset/tests/replay/figures.ts'
import { LAB } from '../../packages/typeset/tests/replay/tap.ts'

const READER = join(LAB, 'refactor-2026-11', 'baseline', 'reader')
const args = process.argv.slice(2)
const marks = args.includes('--marks=today') ? 'today' : undefined
const named = args.filter(a => !a.startsWith('--'))
const pairs = named.length
  ? named
  : readdirSync(READER).filter(f => f.endsWith('.reader.json')).map(f => f.replace(/\.reader\.json$/, '')).sort()
const count = { pairs: 0, figures: 0, equal: 0, differ: 0, extra: 0, cleared: 0, stepped: 0, threw: 0 }
const ruled = []
const classes = new Map()
const t0 = performance.now()
for (const pair of pairs) {
  count.pairs++
  let r
  try { r = replayFigures(pair, { marks }) } catch (e) { count.threw++; console.log(`${pair} threw: ${e?.stack?.slice(0, 600) ?? e}`); continue }
  count.figures += r.total
  count.equal += r.equal
  count.differ += r.differ.length
  count.extra += r.extra.length
  count.cleared += r.cleared.length
  count.stepped += r.stepped.length
  for (const x of r.cleared) ruled.push(`${pair} ${x} cleared`)
  for (const x of r.stepped) ruled.push(`${pair} ${x} stepped`)
  for (const d of [...r.differ, ...r.extra]) {
    const cls = d.replace(/^ord \d+ p\d+/, '').replace(/^\d+\|\d+/, '').replace(/\[\d+\]/g, '[]').replace(/:.*/, '')
    const list = classes.get(cls) ?? classes.set(cls, []).get(cls)
    list.push(`${pair} ${d}`)
  }
}
console.log(JSON.stringify({ ...count, seconds: Math.round((performance.now() - t0) / 100) / 10 }))
for (const [cls, list] of [...classes].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${list.length} ${cls || '(root)'}`)
  for (const x of list.slice(0, 5)) console.log(`  ${x.slice(0, 400)}`)
}
for (const x of ruled) console.log(`ruled: ${x}`)
process.exit(count.differ || count.extra || count.threw ? 1 : 0)
