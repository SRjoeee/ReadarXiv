// lab/marks/back-diff.mjs <base back dir> <other back dir>: the source units located on arXiv's page by two runs of
// lab/marks/back.sh, paper by paper over the papers both hold: located in both, lost (located in the base only), gained, and
// the members located in all. Not shipped.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const [A, B] = process.argv.slice(2)
const read = (d, f) => { try { return JSON.parse(readFileSync(join(d, f), 'utf8')) } catch { return null } }
const t = { papers: 0, both: 0, lost: 0, gained: 0, members: [0, 0], lostBy: [], gainedBy: [] }
for (const f of readdirSync(B).filter(f => /^\d.*\.json$/.test(f))) {
  const a = read(A, f), b = read(B, f)
  if (!a?.units || !b?.units) continue
  t.papers++
  t.members[0] += a.stats?.located ?? 0
  t.members[1] += b.stats?.located ?? 0
  const la = new Map(a.units), lb = new Map(b.units)
  let lost = 0, gained = 0
  for (const [id, ok] of la) if (ok && lb.get(id)) t.both++; else if (ok) lost++
  for (const [id, ok] of lb) if (ok && !la.get(id)) gained++
  t.lost += lost; t.gained += gained
  if (lost) t.lostBy.push(`${f.slice(0, -5)} ${lost}`)
  if (gained) t.gainedBy.push(`${f.slice(0, -5)} ${gained}`)
}
console.log(JSON.stringify(t))
