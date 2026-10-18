// Gate: unit marks must not move a single word. Every C0-clean original compiled natively with marks (gt-orig.mjs)
// against the same patched source without marks, compiled the same way (PLAIN=1 gt-orig.mjs); prints the papers
// below full agreement. Both runs beforehand.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
const root = new URL('..', import.meta.url).pathname
const meta = JSON.parse(readFileSync(join(root, 'out/corpus-meta.json'), 'utf8'))
const ids = JSON.parse(readFileSync(join(root, 'out/c0-browser-patched-full.json'), 'utf8')).filter(r => r.result === 'pass').map(r => r.id)
const rows = []
for (const id of ids) {
  const m = meta.find(x => x.id === id), stem = m.main.split('/').pop().replace(/\.tex$/, '')
  const a = join(root, 'data/runs/gt-plain', id, `${stem}.pdf`), b = join(root, 'data/runs/gt-orig', id, `${stem}.pdf`)
  if (!existsSync(a) || !existsSync(b)) { rows.push({ id, missing: !existsSync(a) ? 'plain' : 'marked' }); continue }
  rows.push({ id, ...JSON.parse(execFileSync('node', [join(root, 'spikes/layout-same.mjs'), '--pair', a, b], { encoding: 'utf8' })) })
}
writeFileSync(join(root, 'out/marks-gate.json'), JSON.stringify(rows, null, 1))
const bad = rows.filter(r => r.missing || r.agree < 1)
console.log(`${rows.length - bad.length}/${rows.length} identical`)
for (const r of bad) console.log(JSON.stringify(r))
