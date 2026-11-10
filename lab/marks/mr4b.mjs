// lab/marks/mr4b.mjs <keep dir>…: how often the instrument's MR 4b has to guess (a unit whose last word is followed only by
// footnote calls that have no marks: the raised glyphs after its end point, by SHIFT 0.2 and CELL_ABUT 0.6 of a size), per
// front.mjs run's kept plans; and what the plan states instead where the calls are marked. Not shipped.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deserialize } from 'node:v8'
import { classOf } from '../../packages/engine/src/marks/classes.ts'

for (const dir of process.argv.slice(2)) {
  const t = { papers: 0, units: 0, guessed: 0, marked: 0, byPaper: {} }
  for (const f of readdirSync(dir).filter(f => f.endsWith('.v8'))) {
    const k = deserialize(readFileSync(join(dir, f)))
    const { plan, doc } = k.mine
    // (a call's mark written and its point set on B: the reading's `w.opening`/`w.closing`)
    const read = new Set(k.mine.pages.flatMap(pg => pg.points.map(x => x.name)))
    const marked = new Set(plan.marks.filter(m => (m.kind === 'open' || m.kind === 'close') && read.has(m.name)).map(m => `${m.unit}.${m.piece}`))
    t.papers++
    doc.units.forEach((u, id) => {
      const ps = u.pieces ?? []
      const last = ps.findLastIndex(x => x.t === 'text' && /\S/.test(x.s))
      const tails = ps.map((x, k) => [x, k]).filter(([x, k]) => k > last && classOf(x) !== null)
      if (last < 0 || !tails.length || !tails.every(([x]) => classOf(x) === 'footnote')) return
      t.units++
      if (tails.every(([, k]) => !marked.has(`${id}.${k}`))) { t.guessed++; t.byPaper[k.id] = (t.byPaper[k.id] ?? 0) + 1 }
      else t.marked++
    })
  }
  console.log(dir, JSON.stringify(t))
}
