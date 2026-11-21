// lab/pdf/prepare-back/claims-sum.mjs <run out> [out.json]: claims.mjs's files summed over a run: per class the glyphs (blank ones
// apart), their runs, the members and papers holding them, their hunks' classes and what B holds there, and three runs each with
// the A stream's text around them. Not shipped.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [OUT, DEST] = process.argv.slice(2)
const dir = join(OUT, 'claims')
const S = {}
const members = {}
for (const f of readdirSync(dir).filter(x => x.endsWith('.json')).sort()) {
  const paper = f.replace(/\.json$/, '')
  const c = JSON.parse(readFileSync(join(dir, f), 'utf8'))
  for (const g of c.glyphs) {
    const k = g.cls
    const C = (S[k] ??= { glyphs: 0, blank: 0, runs: 0, members: new Set(), papers: new Set(), hunks: {}, bSide: {}, kinds: {}, examples: [] })
    if (g.blank) C.blank++
    else C.glyphs++
    C.members.add(`${paper}|${g.ord}`)
    C.papers.add(paper)
    C.hunks[g.hunk] = (C.hunks[g.hunk] ?? 0) + 1
    const bs = g.bSide.mine ? 'B: the unit\'s' : g.bSide.others ? 'B: another unit\'s' : g.bSide.none ? 'B: nobody\'s' : 'B: nothing'
    C.bSide[bs] = (C.bSide[bs] ?? 0) + 1
    C.kinds[g.kind] = (C.kinds[g.kind] ?? 0) + 1
    ;(members[`${paper}|${g.ord}`] ??= new Set()).add(k)
  }
  for (const r of c.runs) {
    const k = r.glyphs[0].cls
    const C = S[k]
    C.runs++
    if (C.examples.length < 6 && !C.examples.some(e => e.paper === paper)) C.examples.push({ paper, page: r.page, ord: r.ord, kind: r.glyphs[0].kind, text: r.text, context: `${r.before}[[${r.text}]]${r.after}`, font: r.glyphs[0].base, y: r.glyphs[0].y, x0: r.glyphs[0].x0, hunk: r.glyphs[0].hunk, bSide: r.glyphs[0].bSide })
  }
}
const out = Object.fromEntries(Object.entries(S).map(([k, C]) => [k, { ...C, members: C.members.size, papers: C.papers.size }]))
// (members by the classes they hold: what a rule that refuses a class costs in located units)
const combos = {}
for (const s of Object.values(members)) { const k = [...s].sort().join('+'); combos[k] = (combos[k] ?? 0) + 1 }
if (DEST) writeFileSync(DEST, `${JSON.stringify({ classes: out, members: combos }, null, 1)}\n`)
for (const [k, C] of Object.entries(out)) {
  console.log(`${k.padEnd(7)} glyphs ${C.glyphs} (+${C.blank} blank) runs ${C.runs} members ${C.members} papers ${C.papers}  hunks ${JSON.stringify(C.hunks)}  ${JSON.stringify(C.bSide)}`)
  console.log(`        kinds ${JSON.stringify(C.kinds)}`)
  for (const e of C.examples) console.log(`        ${e.paper} p${e.page} ord ${e.ord} ${e.kind} ${e.font} y ${e.y.toFixed(1)}: ${JSON.stringify(e.context)} ${e.hunk} ${JSON.stringify(e.bSide)}`)
}
console.log('members by classes', JSON.stringify(combos))
