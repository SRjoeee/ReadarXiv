// Whether a pipeline change keeps a paper's units: each paper's units opened by two engines (two checkouts of the
// repository, `--old` and `--new`), their sourceHash lists compared. A unit whose hash the new engine keeps is carried
// from a stored translation (live.mjs PIPELINE_CARRIES, matched by sourceHash); one it changes is asked again. Offline:
// it reads the sources it is given and nothing else.
//
//   node lab/pdf/spikes/unit-hash-diff.mjs --old <engine root> --new <engine root> <paper>/source.gz…
//
// A paper is named by the directory its source.gz is in. Per paper: one line, `same` (every unit's hash kept) or `changed`
// with the count, and each changed unit's index at the old engine (`-`) and at the new (`+`), its kind and its first words.
// Exits 1 where any paper changed or failed to open, 0 where every one is the same.
import { readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const flag = name => { const i = args.indexOf(name); if (i < 0 || !args[i + 1]) throw new Error(`${name} <engine root> is required`); const v = args[i + 1]; args.splice(i, 2); return resolve(v) }
const roots = { old: flag('--old'), new: flag('--new') }
if (!args.length) throw new Error('no source.gz given')

const engine = async root => {
  const load = rel => import(pathToFileURL(join(root, 'src/pdf-reader/engine', rel)).href)
  const [{ openPaper }, { gunzip, untar }, { sourceHash }, { plainSource }, { PIPELINE_VERSION }] = await Promise.all(['pipeline/live.mjs', 'source/tar.mjs', 'pipeline/cache.mjs', 'translate/mt.mjs', 'pipeline/versions.mjs'].map(load))
  return {
    pipeline: PIPELINE_VERSION,
    async units(src) {
      const raw = await gunzip(new Uint8Array(readFileSync(src)))
      let files
      try { files = untar(raw); if (!files.size) throw new Error('empty') } catch { files = new Map([['main.tex', raw]]) }
      return Promise.all(openPaper(files).units.map(async u => ({ hash: await sourceHash(u), kind: u.kind, text: plainSource(u) })))
    },
  }
}
const E = { old: await engine(roots.old), new: await engine(roots.new) }
console.log(`old ${roots.old} (PIPELINE ${E.old.pipeline})\nnew ${roots.new} (PIPELINE ${E.new.pipeline})`)

/** the units of `a` whose hash `b` does not hold, counted as a multiset (two equal units are two) */
const missing = (a, b) => {
  const left = new Map()
  for (const u of b) left.set(u.hash, (left.get(u.hash) ?? 0) + 1)
  return a.flatMap((u, i) => { const n = left.get(u.hash); if (n) { left.set(u.hash, n - 1); return [] } return [{ i, ...u }] })
}
let bad = 0
for (const src of args) {
  const id = basename(dirname(resolve(src)))
  try {
    const [A, B] = [await E.old.units(src), await E.new.units(src)]
    const gone = missing(A, B), added = missing(B, A)
    if (!gone.length && !added.length) { console.log(`${id}: same, ${A.length} units, every hash kept`); continue }
    bad++
    console.log(`${id}: changed, ${A.length} -> ${B.length} units, ${gone.length} hashes gone, ${added.length} new`)
    for (const u of gone) console.log(`  - #${u.i} ${u.kind}: ${u.text.slice(0, 100)}`)
    for (const u of added) console.log(`  + #${u.i} ${u.kind}: ${u.text.slice(0, 100)}`)
  } catch (e) { bad++; console.log(`${id}: failed, ${String(e?.message ?? e).slice(0, 200)}`) }
}
process.exit(bad ? 1 : 0)
