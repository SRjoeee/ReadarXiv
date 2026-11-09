// lab/pdf/prepare-back/restate.mjs: a stage 1a run's dumps with the baseline's units it does not make stated again (stated.mjs),
// with no compile and no prepare: each dump's own units kept as they are, the statements run.mjs's --baseline wrote dropped and
// made again (with the trails its bundles' parts carry), numbered after the dump's own units as run.mjs numbers them, its counts
// made again. For a change to how the statement reads (an acceptance ruling) measured on a run already made; the differential
// then reads <out>.
//   node --import tsx lab/pdf/prepare-back/restate.mjs <baseline prepare dir> <run dir> <out dir>
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { statedOf, trailsOf } from './stated.mjs'

const [BASELINE, RUN, OUT] = process.argv.slice(2)
if (!BASELINE || !RUN || !OUT) {
  console.error('restate.mjs <baseline prepare dir> <run dir> <out dir>')
  process.exit(2)
}
mkdirSync(join(OUT, 'prepare'), { recursive: true })
let papers = 0,
  stated = 0
for (const f of readdirSync(join(RUN, 'prepare')).filter((f) => f.endsWith('.prepare.json')).sort()) {
  const dump = JSON.parse(readFileSync(join(RUN, 'prepare', f), 'utf8'))
  const units = dump.units.filter((u) => !u.replaced)
  if (existsSync(join(BASELINE, f))) {
    const base = JSON.parse(readFileSync(join(BASELINE, f), 'utf8')).units
    // (the trails the run's parts' members carry, as locate's members carried them to run.mjs)
    const dir = join(RUN, 'bundles', f.slice(0, -'.prepare.json'.length))
    const els = existsSync(dir)
      ? readdirSync(dir)
          .filter((p) => p.endsWith('.part'))
          .flatMap((p) => JSON.parse(readFileSync(join(dir, p), 'utf8')).flows.flat().flatMap((m) => m.els ?? []))
      : []
    let ord = units.reduce((m, u) => Math.max(m, u.ord + 1), 0)
    for (const { u, why } of statedOf(base, units, { trails: trailsOf(els), displays: dump.displays ?? [] })) {
      units.push({ id: u.id, ord: ord++, kind: u.kind, text: u.text, pieces: u.pieces, state: 'unlaid', why, replaced: true })
      stated++
    }
  }
  const counts = { ...dump.counts, units: units.length, drawn: 0, laid: 0, unlaid: 0, byKind: {} }
  for (const u of units) {
    counts[u.state]++
    const k = (counts.byKind[u.kind] ??= { drawn: 0, laid: 0, unlaid: 0 })
    k[u.state]++
  }
  writeFileSync(join(OUT, 'prepare', f), `${JSON.stringify({ ...dump, counts, units })}\n`)
  papers++
}
console.log(JSON.stringify({ papers, stated }))
