// Regression gate for the compile layer: reruns C0 on the 119 papers with the current compile layer, measures each PDF
// against arXiv's, and compares with the stored baseline. Exit 1 if any paper got worse.
//   node spikes/c0-gate.mjs            run and compare
//   node spikes/c0-gate.mjs --accept   run and store the result as the new baseline
//   node spikes/c0-gate.mjs <id ...>   only these papers (for trying the gate itself)
// The compile layer is chosen by the same variables as c0-browser.mjs: SITE, EXTRA_DIR, PRELOAD, ENDPOINT.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { overlap, profile } from './pdf-profile.mjs'

const root = new URL('..', import.meta.url).pathname
const accept = process.argv.includes('--accept')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const ids = process.argv.slice(2).filter(a => !a.startsWith('--'))
const dir = join(root, process.env.GATE_DIR ?? 'out/gate'); mkdirSync(dir, { recursive: true })
const runFile = join(dir, `run-${stamp}.json`), pdfDir = join(root, 'data/runs/gate', stamp)
rmSync(pdfDir, { recursive: true, force: true }); mkdirSync(pdfDir, { recursive: true })
execFileSync('node', [join(root, 'spikes/c0-browser.mjs'), ...ids], { stdio: 'inherit', env: { ...process.env, OUT: runFile.slice(root.length), PDF_DIR: pdfDir } })

const runs = JSON.parse(readFileSync(runFile, 'utf8'))
const now = runs.map(r => {
  const a = profile(join(root, 'data/corpus', r.id, 'arxiv.pdf')), b = profile(join(pdfDir, `${r.id}.pdf`))
  return { id: r.id, result: r.result, pages: b?.pages ?? null, words: a && b ? +overlap(a, b).toFixed(3) : null, unresolved: b ? b.unresolved - (a?.unresolved ?? 0) : null, images: b ? b.images - (a?.images ?? 0) : null, compileMs: r.compileMs ?? null, error: r.firstError || r.error || '' }
})
const clean = x => x.result === 'pass' && x.words >= 0.95 && x.unresolved <= 0 && x.images >= 0
const summary = { papers: now.length, pass: now.filter(x => x.result === 'pass').length, clean: now.filter(clean).length }
writeFileSync(join(dir, `result-${stamp}.json`), JSON.stringify({ summary, papers: now }, null, 1))
const baseFile = join(dir, 'baseline.json')
if (accept || !existsSync(baseFile)) { writeFileSync(baseFile, JSON.stringify({ stamp, env: { SITE: process.env.SITE, EXTRA_DIR: process.env.EXTRA_DIR, PRELOAD: process.env.PRELOAD }, summary, papers: now }, null, 1)); console.log('baseline stored', JSON.stringify(summary)); process.exit(0) }

const base = Object.fromEntries(JSON.parse(readFileSync(baseFile, 'utf8')).papers.map(x => [x.id, x]))
const worse = [], better = []
for (const x of now) {
  const b = base[x.id]; if (!b) continue
  const why = []
  if (clean(b) && !clean(x)) why.push(`clean → ${x.result}${x.error ? ` (${x.error.slice(0, 80)})` : ''}`)
  if (x.words != null && b.words != null && x.words < b.words - 0.01) why.push(`words ${b.words} → ${x.words}`)
  if (x.unresolved > b.unresolved) why.push(`unresolved +${x.unresolved - b.unresolved}`)
  if (x.images < b.images) why.push(`images ${x.images - b.images}`)
  if (why.length) worse.push(`${x.id}: ${why.join('; ')}`)
  else if (!clean(b) && clean(x)) better.push(x.id)
}
console.log(JSON.stringify({ summary, baseline: JSON.parse(readFileSync(baseFile, 'utf8')).summary }))
if (better.length) console.log('now clean:', better.join(' '))
if (worse.length) { console.log('WORSE:\n  ' + worse.join('\n  ')); process.exit(1) }
console.log('no paper got worse')
