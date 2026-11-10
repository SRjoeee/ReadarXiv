// lab/marks/replay.mjs: the equivalence gate again over what gate.mjs kept (`--keep`), no TeX and no PDF read: the new
// instrument (instrumentFromPlan) run over the kept B pages, plan and SourceDoc, against today's kept owners (lab/marks/
// compare.mjs). Valid while markSource writes the same marks (the kept B is that plan's compile); after a change to the
// writer, gate.sh again. Writes <out>/<id>.json as gate.mjs does (gate-sum.mjs sums them). Over run 6's kept inputs the gate
// is `node lab/marks/census.mjs <out>`: every class on every paper as lab/marks/census.json, the classes its owners accepted.
// Not shipped.
//   node --import tsx lab/marks/replay.mjs --keep=<dir> --out=<dir> [--only=id,…] [--show=<id>:<page>:<from>:<to>]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deserialize } from 'node:v8'
import { instrumentFromPlan } from '../../packages/engine/src/marks/instrument.ts'
import { compare, framedOf } from './compare.mjs'

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const KEEP = arg('keep'), OUT = arg('out')
mkdirSync(OUT, { recursive: true })
const only = arg('only')?.split(',') ?? null
const show = arg('show')?.split(':') ?? null
for (const f of readdirSync(KEEP).filter(f => f.endsWith('.v8')).sort()) {
  const id = f.slice(0, -3)
  if (only && !only.includes(id)) continue
  if (show && show[0] !== id) continue
  const k = deserialize(readFileSync(join(KEEP, f)))
  const t0 = performance.now()
  const mine = instrumentFromPlan({ ink: null, pages: k.mine.pages, plan: k.mine.plan, doc: k.mine.doc, log: k.mine.log, made: k.mine.made, inkless: k.mine.inkless, texts: k.mine.texts ?? null })
  const ms = Math.round(performance.now() - t0)
  const cmp = compare({ today: k.today, mine, same: k.same, chars: k.chars, guarded: k.guarded, frames: k.mine.pages.map(framedOf) })
  if (show) {
    const [, sp, sf, st] = show.map(Number)
    const own = (ins, j) => { const P = ins.glyphs[sp - 1], u = P.unit[j]; return u < 0 ? 'none' : `${ins.units[u].kind}:${ins.units[u].id.slice(0, 8)}:${P.role[j]}:${P.piece[j]}` }
    const G = k.mine.pages[sp - 1].glyphs
    for (let j = sf; j < Math.min(st, G.length); j++) console.log('SHOW', sp, j, JSON.stringify(G[j].u), G[j].x0.toFixed(1), G[j].y.toFixed(1), own(k.today, j), own(mine, j))
    for (const x of k.mine.pages[sp - 1].points) if (x.glyph >= sf && x.glyph <= st) console.log('POINT', x.name, x.glyph, x.box)
  }
  writeFileSync(join(OUT, `${id}.json`), JSON.stringify({ ...k.out, ms, compiles: { mine: { read: 0, made: 0, ms: 0 } }, ...cmp }, null, 1))
  const d = cmp.glyphs.compared - cmp.glyphs.same
  console.log(id, d, cmp.boxes.compared - cmp.boxes.same, `${ms} ms`)
}
