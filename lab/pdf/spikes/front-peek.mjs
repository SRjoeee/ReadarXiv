// Look at what the front end extracts from one paper: unit counts by kind, skipped environments, a few units as the
// translator would see them (first 160 characters). For checking the front end by eye; prints no whole paragraphs.
import { loadProject, unitText } from './latex-front.mjs'
import { analyze } from './paper-meta.mjs'
const id = process.argv[2]
const dir = new URL(`../data/corpus/${id}/src`, import.meta.url).pathname
const meta = analyze(dir)
const p = loadProject(dir, meta.main)
const kinds = p.units.reduce((a, u) => ((a[u.kind] = (a[u.kind] ?? 0) + 1), a), {})
const letters = p.units.reduce((a, u) => a + u.pieces.filter(x => x.t === 'text').map(x => x.s).join('').replace(/[^\p{L}]/gu, '').length, 0)
console.log(id, meta.documentclass, 'files', p.files.size, 'units', p.units.length, JSON.stringify(kinds), 'letters', letters, 'skipped', JSON.stringify(p.skipped))
for (const k of ['heading', 'para', 'caption', 'footnote', 'abstract', 'theorem']) {
  const u = p.units.find(x => x.kind === k)
  if (u) console.log(`  [${k}] ${unitText(u).replace(/\s+/g, ' ').slice(0, 160)}`)
}
