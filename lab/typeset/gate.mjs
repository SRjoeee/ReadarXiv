// lab/typeset/gate.mjs [--out=<dir>] [<pair>…]: the gate's runner (contract stage2-typeset, deliverable 4) over the members
// as today prepared them (packages/typeset/tests/replay/gate.ts gatePair: every unit prepared from its last round's inputs in
// the tap, each page laid by the package's composition, layPagePrepared, from that page's own part, design-a §1.3). Writes
// each pair's reader dump in the baseline's format (FORMAT.md §4: the laid units' size, leading, lines with their text and
// crops; the units it does not lay, with the baseline's cause or its own; the baseline's notLaid as they are) under
// <dir>/reader/ (default lab-data lanes/L3/gate/today/), and counts risk 1 of the page decision: a member on two pages laid
// alike from each page's part. Then: node <baseline>/tools/diff.mjs <baseline> <dir> --scope=reader. The members from lane
// L1's parts (the adapter, Placed to Prepared) are this runner's next stage. Run from the worktree's root (heavy: through
// heavy-slot.sh test).
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readerDump } from '../../packages/typeset/tests/replay/display.ts'
import { gatePair } from '../../packages/typeset/tests/replay/gate.ts'
import { LAB, TAP } from '../../packages/typeset/tests/replay/tap.ts'

const args = process.argv.slice(2)
const OUT = args.find(a => a.startsWith('--out='))?.slice(6) ?? join(LAB, 'refactor-2026-11', 'lanes', 'L3', 'gate', 'today')
const named = args.filter(a => !a.startsWith('--'))
const pairs = named.length ? named : readdirSync(join(TAP, 'ledgers')).map(f => f.replace(/\.ledger\.json\.gz$/, '')).sort()
mkdirSync(join(OUT, 'reader'), { recursive: true })
const count = { pairs: 0, prepared: 0, laid: 0, pages: 0, twoPages: 0, twoPagesDiffer: 0, ms: 0 }
const selfDiffer = []
for (const pair of pairs) {
  count.pairs++
  const g = gatePair(pair)
  count.prepared += g.prepared.size
  count.laid += g.units.length
  count.pages += g.pages
  count.twoPages += g.twoPages
  count.twoPagesDiffer += g.selfDiffer.length
  count.ms += g.ms
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
if (selfDiffer.length) console.log(`laid otherwise from another page's part: ${selfDiffer.slice(0, 10).join('; ')}`)
console.log(`dumps: ${join(OUT, 'reader')}`)
