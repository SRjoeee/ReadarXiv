// lab/pdf/prepare-back/same.mjs: I6, the same inputs give the same bytes: two runs' outputs compared paper by paper, every
// bundle object (named by its digest, so the names alone say it; the bytes are compared too) and the prepare dump.
//   node lab/pdf/prepare-back/same.mjs <out 1> <out 2>
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const [X, Y] = process.argv.slice(2)
const sha = f => createHash('sha256').update(readFileSync(f)).digest('hex')
const out = { papers: 0, objects: 0, same: 0, differ: [], dumpsSame: 0, dumpsDiffer: [] }
for (const id of readdirSync(join(X, 'bundles')).sort()) {
  const a = join(X, 'bundles', id), b = join(Y, 'bundles', id)
  if (!existsSync(b)) { out.differ.push([id, 'missing']); continue }
  out.papers++
  const fa = readdirSync(a).filter(f => f !== 'B.pdf').sort(), fb = readdirSync(b).filter(f => f !== 'B.pdf').sort()
  if (fa.join() !== fb.join()) out.differ.push([id, 'other objects', fa.filter(f => !fb.includes(f)).slice(0, 3)])
  for (const f of fa) {
    if (!fb.includes(f)) continue
    out.objects++
    if (sha(join(a, f)) === sha(join(b, f))) out.same++
    else out.differ.push([id, f])
  }
  const da = join(X, 'prepare', `${id}.prepare.json`), db = join(Y, 'prepare', `${id}.prepare.json`)
  if (existsSync(da) && existsSync(db) && sha(da) === sha(db)) out.dumpsSame++
  else out.dumpsDiffer.push(id)
}
console.log(JSON.stringify(out))
process.exit(out.differ.length || out.dumpsDiffer.length ? 1 : 0)
