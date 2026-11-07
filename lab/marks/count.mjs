// lab/marks/count.mjs: stage 1b's count (S2; contract stage1b-compile.md, deliverable 3), over runs of lab/marks/front.mjs
// and today's kept owners. Not shipped. For each row — today (the probe's vetoes and the guard: gate run 6's kept owners
// over today's final pass, and its compile requests), and each front.mjs run given (the probe on or off, no guard, the
// bounded recovery) — papers with no layer, units delimited on B (a source unit owning a glyph of B: the instrument's,
// replayed from the run's kept inputs), compiles run, TeX seconds; and the units with no ink of their own today (the
// spike's 982: laid and drawn nowhere, `--lost`) that a row delimits, by kind and by the marks that delimit them.
//   node --import tsx lab/marks/count.mjs --today=<gate6 dir> --defs=<lanes/L2/defs> --times=<today-time.json>
//        --run=<name>:<dir> [--run=…] [--spike=<spike-s1 data dir>] > <out.json>
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deserialize } from 'node:v8'
import { instrumentFromPlan } from '../../packages/engine/src/marks/instrument.ts'
import { SOURCE_KINDS } from './compare.mjs'

const args = process.argv.slice(2)
const arg = n => args.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const runs = args.filter(a => a.startsWith('--run=')).map(a => a.slice(6).split(':'))
const TODAY = arg('today'), DEFS = arg('defs')
const times = arg('times') && existsSync(arg('times')) ? JSON.parse(readFileSync(arg('times'), 'utf8')) : {}
/** the units with no ink of their own today (the spike's 982: spike-s1 data/<id>/<id>.align.json, units neither located nor
 *  owning a glyph of B, laid or not): today's unit index, kind, laid or not */
const lost = new Map()
const SPIKE = arg('spike')
if (SPIKE)
  for (const id of readdirSync(SPIKE)) {
    const f = join(SPIKE, id, `${id}.align.json`)
    if (!existsSync(f)) continue
    const a = JSON.parse(readFileSync(f, 'utf8'))
    for (const u of a.units ?? []) if (SOURCE_KINDS.has(u.kind) && !u.located && !u.glyphs) (lost.get(id) ?? lost.set(id, []).get(id)).push({ unit: u.u, kind: u.kind, today: u.today })
  }
/** the source units owning a glyph of B, by id */
const delimited = ins => {
  const at = new Set()
  for (const P of ins.glyphs) for (let j = 0; j < P.unit.length; j++) {
    const u = P.unit[j]
    if (u >= 0 && SOURCE_KINDS.has(ins.units[u]?.kind)) at.add(u)
  }
  // (by index: units of one content share an id, a table's repeated cells)
  return { size: at.size, has: id => [...at].some(u => ins.units[u].id === id), ids: new Set([...at].map(u => ins.units[u].id)) }
}
const ids = readdirSync(join(TODAY, 'keep')).filter(f => f.endsWith('.v8')).map(f => f.slice(0, -3)).sort()
const rows = { today: { papers: 0, noLayer: [], delimited: 0, units: 0, compiles: 0, texMs: 0 } }
for (const [name] of runs) rows[name] = { papers: 0, noLayer: [], delimited: 0, units: 0, compiles: 0, texMs: 0, steps: {}, lost: { delimited: 0, byKind: {} } }
const lostToday = { n: 0, byKind: {} }
for (const id of ids) {
  const k6 = deserialize(readFileSync(join(TODAY, 'keep', `${id}.v8`)))
  const g6 = JSON.parse(readFileSync(join(TODAY, `${id}.json`), 'utf8'))
  const t = rows.today
  t.papers++
  const dT = delimited(k6.today)
  t.delimited += dT.size
  t.units += k6.today.units.filter(u => SOURCE_KINDS.has(u.kind)).length
  t.compiles += (g6.compiles?.today?.read ?? 0) + (g6.compiles?.today?.made ?? 0)
  t.texMs += times[id]?.ms ?? 0
  // (today's units with no ink of their own: their ids by today's index)
  const lostIds = (lost.get(id) ?? []).map(x => ({ ...x, uid: k6.today.units[x.unit]?.id })).filter(x => x.uid)
  for (const x of lostIds) { lostToday.n++; const k = `${x.today} ${x.kind}`; lostToday.byKind[k] = (lostToday.byKind[k] ?? 0) + 1 }
  const def = existsSync(join(DEFS, `${id}.json`)) ? JSON.parse(readFileSync(join(DEFS, `${id}.json`), 'utf8')) : {}
  for (const [name, dir] of runs) {
    const R = rows[name]
    R.papers++
    const f = join(dir, `${id}.json`)
    if (!existsSync(f)) { R.noLayer.push(`${id}: not run`); continue }
    const r = JSON.parse(readFileSync(f, 'utf8'))
    const attempts = r.attempts ?? []
    R.compiles += 1 + attempts.length
    R.texMs += (def.texMs ?? 0) + attempts.reduce((s, a) => s + (a.ms ?? 0), 0)
    const last = attempts.at(-1)?.step ?? 'marked'
    R.steps[r.why ? 'none' : last] = (R.steps[r.why ? 'none' : last] ?? 0) + 1
    if (r.why) { R.noLayer.push(`${id}: ${r.why}`); continue }
    const kf = join(dir, 'keep', `${id}.v8`)
    if (!existsSync(kf)) continue
    const k = deserialize(readFileSync(kf))
    const ins = instrumentFromPlan({ ink: null, pages: k.mine.pages, plan: k.mine.plan, doc: k.mine.doc, log: k.mine.log, made: k.mine.made, inkless: k.mine.inkless, texts: k.mine.texts ?? null })
    const d = delimited(ins)
    R.delimited += d.size
    R.units += ins.units.filter(u => SOURCE_KINDS.has(u.kind)).length
    for (const x of lostIds) if (d.ids.has(x.uid)) { R.lost.delimited++; const kk = `${x.today} ${x.kind}`; R.lost.byKind[kk] = (R.lost.byKind[kk] ?? 0) + 1 }
  }
}
console.log(JSON.stringify({ rows, lostToday }, null, 1))
