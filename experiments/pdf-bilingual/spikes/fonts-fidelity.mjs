// What the TeX Gyre mapping does to the layout: arXiv's PDF against the untranslated document under XeLaTeX + xeCJK,
// without the mapping (C1's xe-only+a) and with it (xe-only+a+f), for every paper whose probed faces have a clone.
// The share of arXiv's words standing at the same place (layout-same.mjs --pair).
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { latinFontsFor } from '../poc-reader/latex-front.mjs'
const root = new URL('..', import.meta.url).pathname
const fonts = JSON.parse(readFileSync(join(root, 'out/fonts.json'), 'utf8'))
const pdfIn = d => (existsSync(d) ? readdirSync(d).find(f => f.endsWith('.pdf') && !f.startsWith('.')) : null)
const agree = (a, b) => JSON.parse(execFileSync('node', [join(root, 'spikes/layout-same.mjs'), '--pair', a, b], { encoding: 'utf8' })).agree
const rows = []
for (const [id, probe] of Object.entries(fonts)) {
  if (!latinFontsFor(probe)) continue
  const arxiv = join(root, 'data/corpus', id, 'arxiv.pdf')
  const without = join(root, 'data/runs/c1', id, 'xe-only+a'), withF = join(root, 'data/runs/c1', id, 'xe-only+a+f')
  const a = pdfIn(without), b = pdfIn(withF)
  if (!a || !b) { rows.push({ id, rm: probe.rm, missing: !a ? 'xe-only+a' : 'xe-only+a+f' }); continue }
  rows.push({ id, rm: probe.rm, without: agree(arxiv, join(without, a)), with: agree(arxiv, join(withF, b)) })
  console.log(JSON.stringify(rows.at(-1)))
}
writeFileSync(join(root, 'out/fonts-fidelity.json'), JSON.stringify(rows, null, 1))
const ok = rows.filter(r => r.with != null), median = xs => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1] }
console.log(`papers ${ok.length}: median agreement without ${median(ok.map(r => r.without))}, with ${median(ok.map(r => r.with))}; ≥ 99 % without ${ok.filter(r => r.without >= 0.99).length}, with ${ok.filter(r => r.with >= 0.99).length}`)
