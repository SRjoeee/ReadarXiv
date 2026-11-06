// lab/marks/crops.mjs: for each class of difference a reader would see, three examples as page crops' coordinates (paper,
// page, box), so that the maintainer can look at one of each before it ships. Not shipped.
// From a front.mjs run's summary (gate-sum.mjs) and its kept inputs: each example's run of glyphs — the example glyph and its
// neighbours on its line whose two owners (today's, the new instrument's) are the example's — and that run's box on B's
// page, in PDF points (x0, y0, x1, y1; y up, the page's origin), the draft's page where the run is outside its frames.
//   node --import tsx lab/marks/crops.mjs --run=<front.mjs out dir> --today=<gate6 keep dir> --match=<regex> > crops.json
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deserialize } from 'node:v8'
import { instrumentFromPlan } from '../../packages/engine/src/marks/instrument.ts'

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const RUN = arg('run'), TODAY = arg('today'), match = new RegExp(arg('match') ?? '^glyph: (choice|correction|draft)')
const summary = JSON.parse(readFileSync(join(RUN, 'summary.json'), 'utf8'))
const cache = new Map()
const load = id => {
  if (cache.has(id)) return cache.get(id)
  const k6 = deserialize(readFileSync(join(TODAY, `${id}.v8`)))
  const k = deserialize(readFileSync(join(RUN, 'keep', `${id}.v8`)))
  const mine = instrumentFromPlan({ ink: null, pages: k.mine.pages, plan: k.mine.plan, doc: k.mine.doc, log: k.mine.log, made: k.mine.made, inkless: k.mine.inkless, texts: k.mine.texts ?? null })
  const v = { k6, k, mine }
  cache.clear()
  cache.set(id, v)
  return v
}
const ownerOf = (ins, p, j) => { const P = ins.glyphs[p]; const u = P?.unit[j] ?? -1; return u < 0 ? 'none' : `${ins.units[u].id.slice(0, 12)}:${P.role[j]}` }
const out = []
for (const c of summary.classes.filter(c => match.test(c.cls))) {
  const seen = new Set(), ex = []
  for (const e of c.ex) {
    if (ex.length >= 3 || e.page === undefined) continue
    if (seen.has(e.id) && c.papers > ex.length) continue
    seen.add(e.id)
    if (e.glyph === undefined && e.box !== undefined) {
      // (a box of today's final pass: its own coordinates there)
      const B = deserialize(readFileSync(join(TODAY, `${e.id}.v8`))).mine.pages[e.page - 1].boxes
      ex.push({ paper: e.id, page: e.page, box: [0, 1, 2, 3].map(i => Math.round(B[4 * e.box + i] * 10) / 10), today: e.today })
      continue
    }
    if (e.glyph === undefined) continue
    const { k6, k, mine } = load(e.id)
    const p = e.page - 1, j = e.glyph, jd = e.draft ?? e.glyph
    const D = k.mine.pages[p].glyphs, offset = jd - j
    const pair = (jj) => `${ownerOf(k6.today, p, jj)}|${ownerOf(mine, p, jj + offset)}`
    const want = pair(j)
    const G = D[jd]
    const on = g => g && Math.abs(g.y - G.y) < 0.5 * Math.max(g.size, G.size)
    let a = j, b = j
    while (a > 0 && on(D[a - 1 + offset]) && pair(a - 1) === want) a--
    while (b + 1 + offset < D.length && on(D[b + 1 + offset]) && pair(b + 1) === want) b++
    const run = D.slice(a + offset, b + 1 + offset)
    const box = [Math.min(...run.map(g => g.x0)), Math.min(...run.map(g => g.bottom ?? g.y - 0.2 * g.size)), Math.max(...run.map(g => g.x1)), Math.max(...run.map(g => g.top ?? g.y + 0.8 * g.size))].map(x => Math.round(x * 10) / 10)
    ex.push({ paper: e.id, page: e.page, box, text: run.map(g => g.u).join(''), today: e.today, mine: e.mine })
  }
  out.push({ cls: c.cls, n: c.n, papers: c.papers, examples: ex })
}
console.log(JSON.stringify(out, null, 1))
