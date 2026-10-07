// A figure's labels translated one by one (the HTML mode's way with an engine that takes no context) against the same
// labels sent together, one text a figure with a marker between labels, split back. Over every vector figure of the
// corpus: whether the markers come back one for one, and, line by line, where the two differ — above all on the lines
// the name rule calls names (does context alone keep them?) and on the rest (does context keep words translated?).
// Writes out/eval-context-<lang>.json.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isName, translateTexts } from '../../../src/pdf-reader/engine/mt.mjs'
import { blockWire, splitBlock } from '../../../src/pdf-reader/engine/figures.mjs'
import { isTranslatable } from '../../../src/core/image/boxes.ts'
const root = new URL('..', import.meta.url).pathname
const lang = process.argv[2] ?? 'zh'
const papers = JSON.parse(readFileSync(join(root, 'out/eval-labels.json'), 'utf8'))
const order = lines => [...lines].sort((a, b) => { const ya = Math.min(...a.quad.map(p => p[1])), yb = Math.min(...b.quad.map(p => p[1])); return Math.abs(ya - yb) > 0.01 ? ya - yb : Math.min(...a.quad.map(p => p[0])) - Math.min(...b.quad.map(p => p[0])) })
const figures = []
for (const p of papers) for (const f of p.figures) {
  const lines = order(f.lines.filter(l => isTranslatable(l.text)))
  if (lines.length) figures.push({ id: p.id, figure: f.figure, prose: p.prose, texts: lines.map(l => l.text) })
}
// alone: every distinct text once
const distinct = [...new Set(figures.flatMap(f => f.texts))]
const aloneOut = await translateTexts(distinct, lang)
const alone = new Map(distinct.map((t, i) => [t, aloneOut[i]]))
// together: a figure at a time, at most 40 labels a text
const wires = [], owners = []
for (const f of figures) for (let k = 0; k < f.texts.length; k += 40) { const chunk = f.texts.slice(k, k + 40); if (chunk.length > 1) { wires.push(blockWire(chunk)); owners.push({ f, k, n: chunk.length }) } }
const togetherOut = await translateTexts(wires, lang)
const rows = []
let chunks = 0, split = 0
owners.forEach(({ f, k, n }, j) => {
  chunks++
  const parts = togetherOut[j] && splitBlock(togetherOut[j], n)
  if (parts) split++
  for (let i = 0; i < n; i++) rows.push({ id: f.id, figure: f.figure, text: f.texts[k + i], name: isName(f.texts[k + i], f.prose), alone: alone.get(f.texts[k + i]), together: parts ? parts[i] : null })
})
const norm = s => (s ?? '').replace(/\s+/g, '').replace(/[，,。.、：:;；（）()]/g, '').toLowerCase()
const same = (a, b) => norm(a) === norm(b)
const stats = { figures: figures.length, chunks, splitOk: split, lines: rows.length }
const named = rows.filter(r => r.name && r.together != null), words = rows.filter(r => !r.name && r.together != null)
Object.assign(stats, {
  names: named.length,
  namesChangedAlone: named.filter(r => !same(r.alone, r.text)).length,
  namesChangedTogether: named.filter(r => !same(r.together, r.text)).length,
  words: words.length,
  wordsKeptAlone: words.filter(r => same(r.alone, r.text)).length,
  wordsKeptTogether: words.filter(r => same(r.together, r.text)).length,
  wordsDiffer: words.filter(r => !same(r.alone, r.together)).length,
})
writeFileSync(join(root, `out/eval-context-${lang}.json`), JSON.stringify({ stats, rows }, null, 1))
console.log(stats)
