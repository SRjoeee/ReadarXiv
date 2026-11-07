// lab/marks/statements-cost.mjs <base keep dir> <with keep dir>: what TeX's added statements cost (stage 1b, deliverable 2):
// per paper, the pages whose glyphs (outside the frames, places within 0.01 pt) differ between the base run and the run with
// the statements, the sentence marks written and the sentence points TeX set, the paragraph ends B holds, the figure units
// marked. Not shipped.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deserialize } from 'node:v8'
import { draftPage } from './compare.mjs'

const [BASE, WITH] = process.argv.slice(2)
const t = { papers: 0, pages: 0, moved: 0, movedPapers: [], sentences: { written: 0, set: 0, papersNone: [] }, paraEnds: { base: 0, with: 0 }, figures: { marked: 0, set: 0 } }
for (const f of readdirSync(WITH).filter(f => f.endsWith('.v8')).sort()) {
  if (!existsSync(join(BASE, f))) continue
  const a = deserialize(readFileSync(join(BASE, f))), b = deserialize(readFileSync(join(WITH, f)))
  t.papers++
  const A = a.mine.pages, B = b.mine.pages
  let moved = 0
  for (let p = 0; p < Math.max(A.length, B.length); p++) {
    t.pages++
    if (!A[p] || !B[p] || !draftPage(A[p], B[p]).same) moved++
  }
  if (moved) { t.moved += moved; t.movedPapers.push(`${a.id} ${moved}/${Math.max(A.length, B.length)}`) }
  const names = new Set(B.flatMap(pg => pg.points.map(x => x.name)))
  const written = b.mine.plan.marks.filter(m => m.kind === 'sentence')
  t.sentences.written += written.length
  const set = written.filter(m => names.has(m.name)).length
  t.sentences.set += set
  if (written.length && !set) t.sentences.papersNone.push(`${a.id} (${written.length} written)`)
  t.paraEnds.base += A.reduce((s, pg) => s + (pg.paraEnds?.length ?? 0), 0)
  t.paraEnds.with += B.reduce((s, pg) => s + (pg.paraEnds?.length ?? 0), 0)
  const figs = b.mine.plan.marks.filter(m => m.kind === 'start' && b.mine.doc.units[m.unit]?.kind === 'figure')
  t.figures.marked += figs.length
  t.figures.set += figs.filter(m => names.has(m.name)).length
}
console.log(JSON.stringify(t, null, 1))
