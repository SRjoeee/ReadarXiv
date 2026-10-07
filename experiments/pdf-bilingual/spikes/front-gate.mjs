// Regression gate for the front end, no compiling: units, letters and files per paper for every C0-clean paper, against a
// stored snapshot. A paper whose units or letters move by more than 5 % is listed. --accept stores the current state.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadProject } from './latex-front.mjs'
import { analyze } from './paper-meta.mjs'
const root = new URL('..', import.meta.url).pathname
const ids = JSON.parse(readFileSync(join(root, 'out/c0-browser-patched-full.json'), 'utf8')).filter(r => r.result === 'pass').map(r => r.id)
const now = {}
for (const id of ids) {
  const dir = join(root, 'data/corpus', id, 'src')
  try {
    const p = loadProject(dir, analyze(dir).main)
    now[id] = { files: p.files.size, units: p.units.length, letters: p.units.reduce((a, u) => a + u.pieces.filter(x => x.t === 'text').map(x => x.s).join('').replace(/[^\p{L}]/gu, '').length, 0) }
  } catch (e) { now[id] = { error: String(e).slice(0, 120) } }
}
const file = join(root, 'out/front-gate.json')
if (process.argv.includes('--accept') || !existsSync(file)) { writeFileSync(file, JSON.stringify(now, null, 1)); console.log('snapshot stored for', ids.length, 'papers'); process.exit(0) }
const base = JSON.parse(readFileSync(file, 'utf8'))
const moved = ids.filter(id => { const a = base[id], b = now[id]; return !a || !b || a.error || b.error || a.files !== b.files || Math.abs(b.units - a.units) > 0.05 * a.units || Math.abs(b.letters - a.letters) > 0.05 * a.letters })
for (const id of moved) console.log(id, JSON.stringify(base[id]), '→', JSON.stringify(now[id]))
console.log(moved.length ? `${moved.length} papers moved` : 'no paper moved')
process.exit(moved.length ? 1 : 0)
