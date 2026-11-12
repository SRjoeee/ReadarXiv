// lab/typeset/gate-l1.mjs [--out=<dir>] [<pair>…]: the gate's runner over lane L1's parts (contract stage2-typeset,
// deliverable 4; packages/typeset/tests/replay/gate-l1.ts gateL1Pair): every member of the paper's L1 bundle set by the
// adapter's first stage (src/lay/adapt.ts: U.blocks, U.decor, U.params from the part's facts, the flow's shared rows), its
// reading and tokens still today's (the tap's), each page laid by layPagePrepared from its own L1 part. Writes each pair's
// reader dump in the baseline's format under <dir>/reader/ (default lab-data lanes/L3/gate/l1/): the laid units; the units it
// does not lay, with the baseline's cause or what stopped the adapter; the baseline's notLaid as they are. Prints the
// members not set by what stops them, the first field of each adapted member's setting that differs from today's, and risk 1
// (a member laid alike from each page's part). Then: node <baseline>/tools/diff.mjs <baseline> <dir> --scope=reader. Run from
// the worktree's root (heavy: through heavy-slot.sh test).
// I5 (each line past its slot, gate-l1.ts invariantsOf) reads what is drawn past it: a crop that ends a line by the ink box the
// part states for it (its element's El.ink, its label's), not by the box it is cut with, whose antialiased margin (0.4 pt a side)
// stands past its ink (round B13, the coordinator's ruling (b): an end mark set flush to the measure's end, as TeX set it).
// With --entry, I6 across the pages' lays (gate-l1.ts, cross-lay.ts): each unit begun on a pass page as every page's lay that
// runs that pass lays it; one laid otherwise by another cause than the head pass's known one fails the run (exit 1).
// I3 (no unit's ink over another's, gate-l1.ts invariantsOf) reads a line from its first item to its last glyph's ink (the
// product's inkEndOf), a run's ink right the table lacks the served faces' (the google-lay lane, 2026-11-12).
// With --entry, the reads gate (docs/PDF-READER.md §19.15, round B16): each page laid again under the reader's default reading
// options and with every option on (the kinds their toggles leave, the reader's compose/classes.ts), every row id its lay reads
// held against the page's wait set; an id outside it fails the run (exit 1), no exemption.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readerDump } from '../../packages/typeset/tests/replay/display.ts'
import { gateL1Pair } from '../../packages/typeset/tests/replay/gate-l1.ts'
import { LAB, readGz, TAP } from '../../packages/typeset/tests/replay/tap.ts'
import { bundlesLine, headsFor } from '../../packages/typeset/tests/replay/bundles.ts'
import { L1_BUNDLES_DIR } from '../../packages/typeset/tests/replay/l1.ts'
import { tableMetrics } from '../../packages/typeset/src/metrics/table.ts'
import { layered, servedMetrics } from './served-metrics.mjs'
import { accept as acceptReading } from '../../packages/translate/src/accept.ts'
import { CLASS_DEFAULTS, leftKinds } from '../../packages/reader/src/compose/classes.ts'
import { unitInOf } from '../../packages/translate/src/bundle.ts'

const args = process.argv.slice(2)
const OUT = args.find(a => a.startsWith('--out='))?.slice(6) ?? join(LAB, 'refactor-2026-11', 'lanes', 'L3', 'gate', 'l1')
const named = args.filter(a => !a.startsWith('--'))
// (AXT_GATE_LIST=<class prefix>: each member whose setting's first difference starts so, printed with its pair and ord; `*` every member)
const LIST = process.env.AXT_GATE_LIST
const pairs = named.length ? named : readdirSync(join(TAP, 'ledgers')).map(f => f.replace(/\.ledger\.json\.gz$/, '')).sort()
// (the bundles served, named in the log; a pair named here that a named folder lacks is an error, bundles.ts; of the tap's every
// ledger, those the folder lacks are said and stopped as before, "no L1 bundle of the paper")
console.log(bundlesLine(L1_BUNDLES_DIR))
{
  const { missing } = headsFor(pairs, L1_BUNDLES_DIR, { listed: !named.length })
  if (missing.length) console.log(`the bundles hold no head of ${missing.length} of the ${pairs.length} pairs (each stopped, no L1 bundle): ${missing.join(', ')}`)
}
mkdirSync(join(OUT, 'reader'), { recursive: true })
// (--metrics=table: the tap's table alone, a measure it lacks throws MissingMeasure; default: the table, then the served
// measurer (served-metrics.mjs: the reader's faces, Skia's canvas) for a measure today never made; --metrics=served: the
// measurer alone)
const METRICS = args.find(a => a.startsWith('--metrics='))?.slice(10) ?? 'layered'
const served = METRICS === 'table' ? null : servedMetrics()
// (--reading=part: the reading and the tokens from the part (lay/read.ts), today's the oracle; default today's, the tap's)
const READING = args.find(a => a.startsWith('--reading='))?.slice(10) ?? 'today'
// (--subst=free,measure,next,side,all: a named correction's effect, today's value of those inputs in each member (gate-l1.ts
// substitute); then lab/typeset/effect.mjs compares the dumps with those of a run without it)
const SUBST = args.find(a => a.startsWith('--subst='))?.slice(8).split(',').filter(Boolean) ?? []
// (--entry: each page laid again by design-a's layPage over its part and the rows, compared with the runner's lay, and timed)
const ENTRY = args.includes('--entry')
// (the entry is laid over the door's rows, which the runner reads for the reading from the part alone: asked with today's
// reading it laid nothing, and I10 counted no piece, "0 faults")
if (ENTRY && READING !== 'part') {
  console.error("gate-l1.mjs: --entry needs --reading=part (the entry is laid over the door's rows, read for that reading alone)")
  process.exit(2)
}
/** the reading options the reads gate lays each page under: the reader's defaults and every option on */
const LEAVE = new Map([
  ['default', leftKinds(CLASS_DEFAULTS)],
  ['every option on', leftKinds({ figures: true, tables: true, heads: true, references: true, names: true })],
])
const reads = new Map([...LEAVE.keys()].map((k) => [k, { pages: 0, reads: 0, outside: 0, outsidePages: 0, ex: [] }]))
const entry = { paras: { stated: new Map(), anchor: new Map(), opened: 0, off: [], offBy: new Map(), notLaid: new Map(), openedEx: [], noneEx: [] }, crossLay: { units: 0, twice: 0, head: [], other: [] }, alike: 0, differ: 0, ex: [], ms: [], names: new Map(), links: new Map(), linkEx: new Map(), figures: new Map(), lit: { laid: 0, lines: 0, boxes: 0, apart: 0, empty: 0 }, cover: { members: 0, pieces: 0, faults: new Map(), ex: new Map(), byPair: new Map() } }
/** Whether the entry is given a door row. The rows are today's stored replies in today's reading; one that says nothing (the
 *  chain's rule, accept.ts: no letter or digit where the unit has a letter, 'empty') is no translation of its unit under any
 *  reading, and the chain makes no row of it whatever its translator: the entry is given none and leaves the unit the
 *  original's (given it, the entry hid the unit's text and drew nothing: three table cells of two pack pairs, I10's "right
 *  missing sentence"). A row the rule's other clauses refuse (a span lost, emptied or set otherwise than the unit nests it; an
 *  id, a span named by today's numbering; its length) the chain would ask again of the next translator; the door holds no
 *  other reply of its unit and the row still says its translation: given as it is, as the parity lays it on both sides,
 *  and counted by why (over the 123 pairs with round 8 B5's parts: 229 by a span, 6 by an id, 1 by its length) */
const judged = new Map(), unsaid = []
let judging = ''
const accept = (unit, content) => {
  const r = acceptReading(unitInOf(unit), content)
  if (r.ok) return true
  judged.set(r.why, (judged.get(r.why) ?? 0) + 1)
  if (r.why !== 'empty') return true
  unsaid.push(`${judging} ${unit.kind} ${unit.id.slice(0, 8)}`)
  return false
}
/** I10's counts (cover.ts) over the pairs: each fault's count by key, its examples, each pair's faults */
const addCover = (pair, c) => {
  const C = entry.cover
  C.members += c.members
  C.pieces += c.pieces
  let n = 0
  for (const [k, v] of c.faults) {
    C.faults.set(k, (C.faults.get(k) ?? 0) + v)
    C.ex.set(k, [...(C.ex.get(k) ?? []), ...(c.ex.get(k) ?? [])].slice(0, 8))
    n += v
  }
  if (n) C.byPair.set(pair, [...c.faults].map(([k, v]) => `${k} ${v}`).join(', '))
}
/** the paragraph points (paras-gate.ts) over the pairs */
const addParas = (x) => {
  const P = entry.paras
  for (const k of ['stated', 'anchor', 'notLaid', 'offBy']) for (const [a, n] of x[k]) P[k].set(a, (P[k].get(a) ?? 0) + n)
  P.opened += x.opened
  P.off.push(...x.off)
  P.openedEx.push(...x.openedEx.slice(0, Math.max(0, 6 - P.openedEx.length)))
  P.noneEx.push(...x.noneEx.slice(0, Math.max(0, 12 - P.noneEx.length)))
}
/** I6 across the pages' lays (cross-lay.ts) over the pairs: each unit laid otherwise, by its cause */
const addCrossLay = (pair, x) => {
  if (!x) return
  const X = entry.crossLay
  X.units += x.units
  X.twice += x.twice
  for (const d of x.differ) X[d.cause === 'head' ? 'head' : 'other'].push(`${pair} p${d.page} ord ${d.ord} by p${d.by.join('/p')}: ${d.what}`)
}
const metricsOf = pair => (METRICS === 'served' ? served : layered(tableMetrics(readGz(join(TAP, 'metrics', `${pair}.metrics.json.gz`))), served))
const count = { pairs: 0, laid: 0, adapted: 0, pages: 0, twoPages: 0, twoPagesDiffer: 0, threw: 0 }
const stops = new Map(), setting = new Map(), threw = [], selfDiffer = []
// (each unit the baseline laid: laid alike, changed or not laid, by its setting's first differing field)
const verdicts = new Map(), examples = new Map(), classes = new Map(), classEx = new Map()
const I5by = new Map(), byPaper = new Map(), below = []
const inv = { laid: 0, lines: 0, I3: 0, I4: 0, I5: 0 }, invEx = { I3: [], I4: [], I5: [] }
const pageMs = []
let adaptMs = 0, readMs = 0
// E1-E3 (the coordinator's exit): each unit the baseline lays by its inputs (equal, or the first that differs: E1), the units
// of equal inputs on pages whose every unit's inputs are equal (E2: laid as today), and those of equal inputs on a page another
// unit of which differs (E3: through the page's shared decision, each traced to the units of its page that differ)
const T1 = new Map(), T1ex = new Map(), E1 = new Map(), E1ex = new Map(), E2 = { alike: 0, changed: 0 }, E2ex = [], E3 = { alike: 0, changed: 0 }, E3by = new Map(), E3ex = new Map()
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
  if (process.env.AXT_GATE_OVER || process.env.AXT_GATE_PAIRS) console.log(`PAIR ${pair}`)
  let g
  judging = pair
  try { g = gateL1Pair(pair, { ...(METRICS === 'table' ? {} : { metricsOf, served }), reading: READING, substitute: SUBST, entry: ENTRY, accept, ...(ENTRY ? { leave: LEAVE } : {}) }) } catch (e) { threw.push(`${pair}: ${String(e?.stack ?? e).slice(0, 300)}`); count.threw++; continue }
  count.laid += g.units.length
  count.adapted += g.setting.size
  count.pages += g.pages
  pageMs.push(...g.ms)
  if (g.entry) { entry.alike += g.entry.alike; entry.differ += g.entry.differ; entry.ms.push(...g.entry.ms); for (const x of g.entry.ex) if (entry.ex.length < 8) entry.ex.push(`${pair} ${x}`); for (const [k, n] of g.entry.names) entry.names.set(k, (entry.names.get(k) ?? 0) + n); for (const [k, n] of g.entry.links) entry.links.set(k, (entry.links.get(k) ?? 0) + n); for (const [k, n] of g.entry.figures) entry.figures.set(k, (entry.figures.get(k) ?? 0) + n); for (const [k, xs] of g.entry.linkEx) entry.linkEx.set(k, [...(entry.linkEx.get(k) ?? []), ...xs].slice(0, 4)); for (const k of Object.keys(entry.lit)) entry.lit[k] += g.entry.lit[k]; addCover(pair, g.entry.cover); addCrossLay(pair, g.entry.crossLay); addParas(g.entry.paras); for (const [k, r] of g.entry.reads ?? []) { const t = reads.get(k); t.pages += r.pages; t.reads += r.reads; t.outside += r.outside; t.outsidePages += r.outsidePages; for (const x of r.ex) if (t.ex.length < 6) t.ex.push(`${pair} ${x}`) } }
  adaptMs += g.adaptMs
  readMs += g.readMs ?? 0
  inv.laid += g.inv.laid
  inv.lines += g.inv.lines
  // (the members set under the fit's floor, pair and today's ord: the checkpoint's (6))
  for (const o of g.inv.below ?? []) below.push(`${pair} ${o}`)
  { const paper = pair.replace(/-[a-z]{2,3}(\.pack)?$/, ''), b = byPaper.get(paper) ?? byPaper.set(paper, { I3: 0, I4: 0 }).get(paper); b.I3 += g.inv.I3.length; b.I4 += g.inv.I4.length }
  for (const [k, b] of g.inv.I5by ?? []) { const t = I5by.get(k) ?? I5by.set(k, { n: 0, max: 0 }).get(k); t.n += b.n; t.max = Math.max(t.max, b.max) }
  for (const k of ['I3', 'I4', 'I5']) {
    inv[k] += g.inv[k].length
    for (const x of g.inv[k]) if (invEx[k].length < 3) invEx[k].push(`${pair} ${x}`)
  }
  count.twoPages += g.twoPages
  count.twoPagesDiffer += g.selfDiffer.length
  for (const [k, n] of g.stops) add(stops, k, n)
  for (const [o, v] of g.setting) {
    add(setting, v.replace(/ \[.*$| [-\d.,]+$/, ''))
    if (LIST && (LIST === '*' || v.startsWith(LIST))) console.log(`LIST ${pair} ord ${o} ${v}`)
  }
  for (const t of g.threw) threw.push(`${pair} ${t}`)
  for (const why of g.thrown.values()) add(stops, `its flow's lay threw: ${why}`)
  for (const x of g.selfDiffer.slice(0, 2)) selfDiffer.push(`${pair} ${x}`)
  const base = readerDump(pair)
  const laid = new Set(g.units.map(u => u.ord))
  const mine = new Map(g.units.map(u => [u.ord, u]))
  // (each unit's difference first, then its class: a unit whose own setting equals today's but that a page of its holds
  // another unit laid otherwise is the page's fill's, which sets one size and lead for a page's units, T33)
  const diffOf = new Map()
  for (const u of base.units) {
    const m = mine.get(u.ord)
    const pick = x => ({ size: x.size, leading: x.leading, lines: x.lines, elements: x.elements ?? [] })
    diffOf.set(u.ord, m ? nearDifference(pick(m), pick(u), '') : 'not laid')
  }
  const pagesOf = u => [...new Set(u.lines.map(l => l.page))]
  const differs = new Set()
  for (const u of base.units) if (diffOf.get(u.ord)) for (const pg of pagesOf(u)) differs.add(pg)
  const othersDiffer = u => pagesOf(u).some(pg => base.units.some(v => v.ord !== u.ord && diffOf.get(v.ord) && pagesOf(v).includes(pg)))
  for (const u of base.units) {
    const m = mine.get(u.ord)
    let cls = (g.setting.get(u.ord) ?? 'not adapted').replace(/ \[.*$| [-\d.,]+$/, '')
    const d = diffOf.get(u.ord)
    if (d && m && cls === 'equal') cls = othersDiffer(u) ? 'equal: its page’s fill (another unit of its page laid otherwise)' : 'equal: its own lay'
    // (how far a changed unit moved: its lines' count, else the largest difference of a line's ends, baseline or the size)
    const far = () => {
      if (m.lines.length !== u.lines.length) return 'lines: another count'
      const ds = [Math.abs((m.size ?? 0) - (u.size ?? 0)), ...m.lines.flatMap((l, j) => [Math.abs(l.x0 - u.lines[j].x0), Math.abs(l.x1 - u.lines[j].x1), Math.abs(l.baseline - u.lines[j].baseline)])]
      const x = Math.max(...ds)
      return x <= 0.1 ? 'at most 0.1 pt' : x <= 1 ? 'at most 1 pt' : 'more than 1 pt'
    }
    const why = !m ? (g.thrown.has(u.ord) ? `its flow threw: ${g.thrown.get(u.ord)}` : g.tieHeld.has(u.ord) ? 'its table group holds a cell not set' : g.setting.has(u.ord) ? 'left by the fit or its group' : 'not set') : null
    const v = d ? (m ? `changed (${far()}) | ${cls}` : `not laid (${why}) | ${cls}`) : `alike | ${cls}`
    add(verdicts, v)
    if (d) add(classes, m ? cls : `not laid: ${why} | ${cls}`)
    // (an example: its paper, page, unit and box, the baseline's first line)
    const l0 = u.lines[0]
    const ex = `${pair} p${l0?.page ?? '?'} ord ${u.ord} ${u.kind} [${l0 ? [l0.x0, l0.baseline, l0.x1].join(', ') : ''}]: ${String(d).slice(0, 120)}`
    if (d && (examples.get(v)?.length ?? 0) < 3) (examples.get(v) ?? examples.set(v, []).get(v)).push(ex)
    const ck = m ? cls : `not laid: ${why} | ${cls}`
    if (d && (classEx.get(ck)?.length ?? 0) < 3) (classEx.get(ck) ?? classEx.set(ck, []).get(ck)).push(ex)
  }
  // (E1-E3: each unit's inputs; a page's differing units)
  const inputs = g.inputs?.size ? g.inputs : g.setting
  const inOf = u => { const v = inputs.get(u.ord); return v === undefined ? `not adapted: ${g.thrown.get(u.ord) ? 'its flow threw' : 'not set'}` : v.replace(/ \[.*$| [-\d.,]+$/, '') }
  const exOf = (u, d) => { const l0 = u.lines[0]; return `${pair} p${l0?.page ?? '?'} ord ${u.ord} ${u.kind} [${l0 ? [l0.x0, l0.baseline, l0.x1].join(', ') : ''}]${d ? `: ${String(d).slice(0, 110)}` : ''}` }
  const unequalOn = new Map()
  for (const u of base.units) if (inOf(u) !== 'equal') for (const pg of pagesOf(u)) (unequalOn.get(pg) ?? unequalOn.set(pg, []).get(pg)).push(u)
  for (const u of base.units) {
    const cls = inOf(u)
    add(E1, cls)
    const tv = g.tokens?.get(u.ord)
    if (tv !== undefined) { const k = tv.replace(/ \[.*$/, ''); add(T1, k); if (k !== 'equal' && (T1ex.get(k)?.length ?? 0) < 3) (T1ex.get(k) ?? T1ex.set(k, []).get(k)).push(exOf(u, tv)) }
    if ((E1ex.get(cls)?.length ?? 0) < 3 && cls !== 'equal') (E1ex.get(cls) ?? E1ex.set(cls, []).get(cls)).push(exOf(u, inputs.get(u.ord)))
    if (cls !== 'equal') continue
    const d = diffOf.get(u.ord)
    const others = pagesOf(u).flatMap(pg => (unequalOn.get(pg) ?? []).filter(v => v.ord !== u.ord))
    if (!others.length) { if (d) { E2.changed++; if (E2ex.length < 5) E2ex.push(exOf(u, d)) } else E2.alike++; continue }
    if (!d) { E3.alike++; continue }
    E3.changed++
    // (traced to the units of its pages whose inputs differ, by their classes)
    for (const k of new Set(others.map(inOf))) { add(E3by, k); if ((E3ex.get(k)?.length ?? 0) < 3) (E3ex.get(k) ?? E3ex.set(k, []).get(k)).push(`${exOf(u, d)} <- ord ${others.find(v => inOf(v) === k).ord}`) }
  }
  const left = (base.left ?? []).filter(l => !laid.has(l.ord))
  for (const u of base.units) if (!laid.has(u.ord)) left.push({ id: u.id, ord: u.ord, kind: u.kind, code: 'unadapted', why: 'not laid from L1’s part', pages: [] })
  writeFileSync(join(OUT, 'reader', `${pair}.reader.json`), JSON.stringify({ format: 'readarxiv-baseline/reader 1', paper: base.paper, target: base.target, units: g.units, left, notLaid: base.notLaid ?? [] }))
}
const top = m => [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join('; ')
console.log(JSON.stringify(count))
{
  const q = [...pageMs].sort((a, b) => a - b), at = f => Math.round(q[Math.min(q.length - 1, Math.floor(f * q.length))] * 100) / 100
  console.log(`a page's lay (layPagePrepared, L8-E1), ms: p50 ${at(0.5)}, p90 ${at(0.9)}, p99 ${at(0.99)}, max ${at(1)} over ${q.length} pages; the adapter (L6) ${Math.round(adaptMs)} ms in all, ${Math.round((adaptMs / q.length) * 100) / 100} a page`)
}
console.log(`not set by the adapter: ${top(stops)}`)
console.log(`I3, I4 by paper: ${JSON.stringify(Object.fromEntries(byPaper))}`)
console.log(`under the fit's floor (X.further's shrink): ${below.length} members`)
if (process.env.AXT_GATE_BELOW) writeFileSync(process.env.AXT_GATE_BELOW, `${below.join('\n')}\n`)
console.log(`I5, each line past its slot by the placement's rule (count, largest excess pt): ${[...I5by].map(([k, b]) => `${k} ${b.n} (${b.max.toFixed(2)})`).join('; ')}`)
console.log(`invariants over the laid members (page by page): ${JSON.stringify(inv)}; ${['I3', 'I4', 'I5'].map(k => `${k}: ${invEx[k].join(' | ')}`).join('; ')}`)
console.log(`setting against today's (first differing field): ${top(setting)}`)
console.log('the baseline\'s laid units, by verdict and the first differing field of their setting:')
for (const [v, n] of [...verdicts].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n} ${v}`)
  for (const x of examples.get(v) ?? []) console.log(`      ${x}`)
}
console.log('every unit not laid alike, by class (its setting\'s first differing field, or why it is not laid), with examples:')
for (const [k, n] of [...classes].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n} ${k}`)
  for (const x of classEx.get(k) ?? []) console.log(`      ${x}`)
}
console.log(`E1, every unit the baseline lays by its typesetter's inputs (reading: ${READING}; the setting's first difference, then the tokens'):`)
for (const [k, n] of [...E1].sort((a, b) => b[1] - a[1])) { console.log(`  ${n} ${k}`); for (const x of E1ex.get(k) ?? []) console.log(`      ${x}`) }
if (T1.size) { console.log('E1, the reading level alone (each unit\'s tokens against today\'s, whatever its setting):'); for (const [k, n] of [...T1].sort((a, b) => b[1] - a[1])) { console.log(`  ${n} ${k}`); for (const x of T1ex.get(k) ?? []) console.log(`      ${x}`) } }
console.log(`E2, equal inputs on a page whose every unit's are equal: ${E2.alike} laid alike, ${E2.changed} changed${E2ex.length ? `: ${E2ex.join(' | ')}` : ''}`)
console.log(`E3, equal inputs on a page another unit of which differs: ${E3.alike} laid alike, ${E3.changed} changed; the changed traced to their pages' differing units, by those units' classes:`)
for (const [k, n] of [...E3by].sort((a, b) => b[1] - a[1]).slice(0, 25)) { console.log(`  ${n} ${k}`); for (const x of E3ex.get(k) ?? []) console.log(`      ${x}`) }
console.log(`the reading (L5, L7 from the part) ${Math.round(readMs)} ms in all`)
if (ENTRY) {
  const q = [...entry.ms].sort((a, b) => a - b), at = f => Math.round(q[Math.min(q.length - 1, Math.floor(f * q.length))] * 100) / 100
  console.log(`the entry (layPage over each part and its rows): ${entry.alike} of the runner's members laid alike, ${entry.differ} not${entry.ex.length ? `: ${entry.ex.join(' | ')}` : ''}; a page, ms: p50 ${at(0.5)}, p90 ${at(0.9)}, p99 ${at(0.99)}, max ${at(1)} over ${q.length} pages`)
  console.log(`the entry's babel names (S.names over the part), by key and state: ${[...entry.names].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(', ')}`)
  console.log(`the entry's links (Page.links, lay/links.ts), by fate: ${[...entry.links].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}${entry.linkEx.has(k) ? ` (${entry.linkEx.get(k).join('; ')})` : ''}`).join(', ')}`)
  console.log(`the entry's figure texts (S.figures over the part), by turn and state: ${[...entry.figures].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(', ')}`)
  console.log(`the entry's boxes (Laid.lit): ${entry.lit.laid} members laid with lines, ${entry.lit.lines} lines, ${entry.lit.boxes} boxes on the right; panes' entries apart ${entry.lit.apart}; nothing on the right ${entry.lit.empty}`)
  const C = entry.cover, faults = [...C.faults.values()].reduce((a, b) => a + b, 0)
  console.log(`the entry's rows that say nothing (the chain's 'empty', accept.ts), given as no row: ${unsaid.length}${unsaid.length ? `: ${unsaid.join(' | ')}` : ''}; held to its other clauses, given as they are: ${[...judged].filter(([k]) => k !== 'empty').map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}`)
  console.log(`I10, the sentence cover (cover.ts): ${C.members} member-pages lit, ${C.pieces} pieces; ${faults} faults${faults ? ':' : ''}`)
  for (const [k, n] of [...C.faults].sort((a, b) => b[1] - a[1])) console.log(`  ${n} ${k}: ${(C.ex.get(k) ?? []).join(' | ')}`)
  for (const [pair, line] of C.byPair) console.log(`  ${pair}: ${line}`)
  // (the paragraph points, paras-gate.ts: each the part states (a group's open, an element, its first word) whose row carries
  // its anchor (the group or the element between its texts, else a sentence start paired with its first word) laid opening on
  // TeX's line; one not so laid fails the run. Those with no anchor flow on, counted by why)
  {
    const P = entry.paras, n = m => [...m.values()].reduce((a, b) => a + b, 0)
    const anchored = n(P.anchor) - [...P.anchor].filter(([k]) => k.startsWith('none') || k === 'no row').reduce((a, [, v]) => a + v, 0)
    console.log(`the paragraph points (paras-gate.ts): ${n(P.stated)} stated (${top(P.stated)}); ${anchored} with an anchor in their row (${top(P.anchor)}); of those, their member laid: ${P.opened} opened on TeX's line, ${P.off.length} NOT${P.off.length ? ` (${top(P.offBy)})` : ''}; not laid: ${top(P.notLaid) || 'none'}`)
    for (const x of P.off) console.log(`  not opened on TeX's line: ${x}`)
    for (const x of P.openedEx) console.log(`  opened, e.g.: ${x}`)
    for (const x of P.noneEx) console.log(`  no anchor, e.g.: ${x}`)
    if (P.off.length) process.exitCode = 1
  }
  // (I6 across the pages' lays, cross-lay.ts: a unit laid otherwise by two pages' lays fails the run, but where the head pass's
  // known cause tells it (headOf reading the paragraph over it filled by one lay, at its fit by the other: LATER.md), counted
  // and listed apart)
  const X = entry.crossLay
  console.log(`I6 across the pages' lays (cross-lay.ts): ${X.units} units begun on a pass page, ${X.twice} laid by two pages' lays or more; ${X.head.length + X.other.length} laid otherwise: ${X.head.length} by the head pass (known: headOf reads the paragraph over the unit as one lay filled it and the other did not), ${X.other.length} by another cause`)
  for (const x of X.head) console.log(`  head: ${x}`)
  for (const x of X.other) console.log(`  other: ${x}`)
  if (X.other.length) process.exitCode = 1
  // (the reads gate: an id a page's lay reads that the page does not wait for, under either option, fails the run)
  for (const [k, r] of reads) {
    console.log(`the reads gate, ${k} (${LEAVE.get(k).join(', ') || 'none left'}): ${r.pages} pages laid, ${r.reads} row ids read; ${r.outside} read outside the page's wait set, on ${r.outsidePages} pages${r.ex.length ? `: ${r.ex.join(' | ')}` : ''}`)
    if (r.outside) process.exitCode = 1
  }
}
// (an entry that laid nothing counted I10 over no piece: no count, the run fails)
if (ENTRY && !entry.cover.pieces) {
  console.log('the entry laid nothing: I10 not counted')
  process.exitCode = 1
}
if (selfDiffer.length) console.log(`laid otherwise from another page's part: ${selfDiffer.slice(0, 10).join('; ')}`)
if (threw.length) console.log(`threw (${threw.length}): ${threw.slice(0, 8).join(' | ')}`)
console.log(`dumps: ${join(OUT, 'reader')}`)
