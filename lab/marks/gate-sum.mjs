// lab/marks/gate-sum.mjs <out>: the equivalence gate's papers (lab/marks/gate.mjs's <id>.json) summed: glyphs and boxes owned
// alike on the pages whose two B hold the same glyphs, pages that differ, the classes of difference with their counts, papers
// and examples. Writes <out>/summary.json.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.argv[2]
const t = { papers: 0, noB: [], pages: { today: 0, same: 0 }, glyphs: { compared: 0, same: 0 }, boxes: { compared: 0, same: 0 }, compiles: { made: 0, read: 0, ms: 0 }, perfect: 0 }
const classes = new Map()
const per = []
for (const f of readdirSync(OUT).filter(f => f.endsWith('.json') && f !== 'summary.json')) {
  const r = JSON.parse(readFileSync(join(OUT, f), 'utf8'))
  if (r.why) { t.noB.push(`${r.id}: ${r.why}`); continue }
  t.papers++
  t.pages.today += r.pages.today
  t.pages.same += r.pages.same
  t.glyphs.compared += r.glyphs.compared
  t.glyphs.same += r.glyphs.same
  t.boxes.compared += r.boxes.compared
  t.boxes.same += r.boxes.same
  t.compiles.made += r.compiles.mine.made
  t.compiles.read += r.compiles.mine.read
  t.compiles.ms += r.compiles.mine.ms
  if (r.glyphs.same === r.glyphs.compared && r.boxes.same === r.boxes.compared && r.pages.same === r.pages.today) t.perfect++
  per.push({ id: r.id, pages: r.pages, glyphs: r.glyphs, boxes: r.boxes, guard: !!r.guard })
  for (const [k, v] of Object.entries(r.classes ?? {})) {
    const c = classes.get(k) ?? classes.set(k, { n: 0, papers: [], ex: [] }).get(k)
    c.n += v.n
    c.papers.push(`${r.id} ${v.n}`)
    if (c.ex.length < 6) c.ex.push(...v.ex.slice(0, 2).map(x => ({ id: r.id, ...x })))
  }
}
const rows = [...classes].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => ({ cls: k, n: v.n, papers: v.papers.length, top: v.papers.sort((a, b) => Number(b.split(' ')[1]) - Number(a.split(' ')[1])).slice(0, 6), ex: v.ex }))
writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ totals: t, classes: rows, per }, null, 1))
console.log(JSON.stringify(t))
for (const r of rows) console.log(String(r.n).padStart(8), String(r.papers).padStart(3), 'p ', r.cls, ' top:', r.top.join(', '))
