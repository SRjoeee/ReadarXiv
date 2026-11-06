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
// (each unit the baseline laid: laid alike, changed or not laid, by its setting's first differing field)
const verdicts = new Map(), examples = new Map()
/** the first difference beyond the baseline comparator's tolerance (diff.mjs: numbers within 0.01 pt are one) */
const nearDifference = (a, b, path) => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 0.01 + 1e-9 ? null : `${path}: ${a} against ${b}`
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}.length: ${a.length} against ${b.length}`
    for (let i = 0; i < a.length; i++) { const d = nearDifference(a[i], b[i], `${path}[${i}]`); if (d) return d }
    return null
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = nearDifference(a[k], b[k], `${path}.${k}`); if (d) return d }
    return null
  }
  return a === b || (a == null && b == null) ? null : `${path}: ${JSON.stringify(a)?.slice(0, 60)} against ${JSON.stringify(b)?.slice(0, 60)}`
}
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
  const mine = new Map(g.units.map(u => [u.ord, u]))
  for (const u of base.units) {
    const m = mine.get(u.ord)
    const cls = g.setting.get(u.ord) ?? 'not adapted'
    const pick = x => ({ size: x.size, leading: x.leading, lines: x.lines, elements: x.elements ?? [] })
    const d = m ? nearDifference(pick(m), pick(u), '') : 'not laid'
    // (how far a changed unit moved: its lines' count, else the largest difference of a line's ends, baseline or the size)
    const far = () => {
      if (m.lines.length !== u.lines.length) return 'lines: another count'
      const ds = [Math.abs((m.size ?? 0) - (u.size ?? 0)), ...m.lines.flatMap((l, j) => [Math.abs(l.x0 - u.lines[j].x0), Math.abs(l.x1 - u.lines[j].x1), Math.abs(l.baseline - u.lines[j].baseline)])]
      const x = Math.max(...ds)
      return x <= 0.1 ? 'at most 0.1 pt' : x <= 1 ? 'at most 1 pt' : 'more than 1 pt'
    }
    const why = !m ? (g.thrown.has(u.ord) ? 'its flow threw: MissingMeasure' : g.tieHeld.has(u.ord) ? 'its table group holds a cell not set' : g.setting.has(u.ord) ? 'left by the fit or its group' : 'not set') : null
    const v = d ? (m ? `changed (${far()}) | ${cls}` : `not laid (${why}) | ${cls}`) : `alike | ${cls}`
    add(verdicts, v)
    if (d && m && (examples.get(v)?.length ?? 0) < 3) (examples.get(v) ?? examples.set(v, []).get(v)).push(`${pair} ord ${u.ord} ${u.kind}: ${d.slice(0, 140)}`)
  }
  const left = (base.left ?? []).filter(l => !laid.has(l.ord))
  for (const u of base.units) if (!laid.has(u.ord)) left.push({ id: u.id, ord: u.ord, kind: u.kind, code: 'unadapted', why: 'not laid from L1’s part', pages: [] })
  writeFileSync(join(OUT, 'reader', `${pair}.reader.json`), JSON.stringify({ format: 'readarxiv-baseline/reader 1', paper: base.paper, target: base.target, units: g.units, left, notLaid: base.notLaid ?? [] }))
}
const top = m => [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join('; ')
console.log(JSON.stringify(count))
console.log(`not set by the adapter: ${top(stops)}`)
console.log(`setting against today's (first differing field): ${top(setting)}`)
console.log('the baseline\'s laid units, by verdict and the first differing field of their setting:')
for (const [v, n] of [...verdicts].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n} ${v}`)
  for (const x of examples.get(v) ?? []) console.log(`      ${x}`)
}
if (selfDiffer.length) console.log(`laid otherwise from another page's part: ${selfDiffer.slice(0, 10).join('; ')}`)
if (threw.length) console.log(`threw (${threw.length}): ${threw.slice(0, 8).join(' | ')}`)
console.log(`dumps: ${join(OUT, 'reader')}`)
