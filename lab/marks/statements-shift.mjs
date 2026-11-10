// lab/marks/statements-shift.mjs <base keep dir> <with keep dir> [ids…]: what a statement of TeX's moves on B (stage 1b, step 2 of
// its fifth owner): per paper, the pages whose glyph sequence (outside the frames) differs from the base run's — a line
// broken otherwise —, and on the others the glyphs set more than 0.01 pt off, with the largest shift along and across a line.
// Not shipped.
import { readFileSync, readdirSync } from 'node:fs'
import { deserialize } from 'node:v8'
import { framedOf } from './compare.mjs'
const [a, b, ...ids] = process.argv.slice(2)
for (const id of ids.length ? ids : readdirSync(b).filter(f => f.endsWith('.v8')).map(f => f.slice(0, -3))) {
  const A = deserialize(readFileSync(`${a}/${id}.v8`)).mine.pages, B = deserialize(readFileSync(`${b}/${id}.v8`)).mine.pages
  let pages = 0, seqDiffer = 0, dyMax = 0, dxMax = 0, shifted = 0
  for (let p = 0; p < Math.max(A.length, B.length); p++) {
    if (!A[p] || !B[p]) { seqDiffer++; continue }
    const fa = framedOf(A[p]), fb = framedOf(B[p])
    const ga = A[p].glyphs.filter((_, j) => !fa.glyph[j]), gb = B[p].glyphs.filter((_, j) => !fb.glyph[j])
    if (ga.length !== gb.length || ga.some((g, j) => g.u !== gb[j].u)) { seqDiffer++; continue }
    let moved = false
    ga.forEach((g, j) => { const dx = Math.abs(g.x0 - gb[j].x0), dy = Math.abs(g.y - gb[j].y); if (dx > 0.011 || dy > 0.011) { moved = true; shifted++ } dxMax = Math.max(dxMax, dx); dyMax = Math.max(dyMax, dy) })
    if (moved) pages++
  }
  if (pages || seqDiffer) console.log(id, 'pages with a glyph off 0.01 pt', pages, 'pages whose glyph sequence differs', seqDiffer, 'glyphs off', shifted, 'max dx', dxMax.toFixed(3), 'max dy', dyMax.toFixed(3))
}
