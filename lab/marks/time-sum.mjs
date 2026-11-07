// lab/marks/time-sum.mjs <today dir> <new dir>: the timings of lab/marks/time-today.mjs and lab/marks/time-new.mjs over the
// same papers, per stage: median and 90th percentile (nearest rank), in seconds; TeX by its in-container time and by the wall
// of its docker run (the slot's start and its wait for the shared slot included). Not shipped.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const [TODAY, NEW] = process.argv.slice(2)
const read = d => new Map(readdirSync(d).filter(f => f.endsWith('.json')).map(f => [f.slice(0, -5), JSON.parse(readFileSync(join(d, f), 'utf8'))]))
const A = read(TODAY), B = read(NEW)
const ids = [...A.keys()].filter(id => B.has(id)).sort()
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null }
const row = (name, f, rows) => { const xs = ids.map(id => f(rows.get(id))).filter(x => Number.isFinite(x)); return `${name.padEnd(34)} ${(q(xs, 0.5) / 1000).toFixed(2).padStart(7)} ${(q(xs, 0.9) / 1000).toFixed(2).padStart(7)}   (n ${xs.length})` }
const texOf = (r, k, w = 'ms') => r.tex?.[k]?.[w] ?? 0
const texAll = (r, w = 'ms') => Object.values(r.tex ?? {}).reduce((s, x) => s + (x[w] ?? 0), 0)
console.log(`papers ${ids.length}: ${ids.join(' ')}`)
console.log(`${'stage'.padEnd(34)} ${'median'.padStart(7)} ${'p90'.padStart(7)}  (seconds)`)
console.log('-- today (time-today.mjs)')
for (const k of ['bibliography', 'probe', 'marked', 'final', 'guard']) console.log(row(`TeX ${k}`, r => texOf(r, k), A))
console.log(row('TeX in all (in container)', r => texAll(r), A))
console.log(row('TeX in all (docker wall)', r => texAll(r, 'wall'), A))
for (const k of ['open', 'source', 'marking', 'read', 'wrap', 'pass']) console.log(row(`JS ${k}`, r => r.js?.[k], A))
console.log(row('JS in all', r => Object.values(r.js ?? {}).reduce((s, x) => s + x, 0), A))
// (the whole: JavaScript and TeX in the container, added; a run's wall holds its wait for the shared slot)
console.log(row('whole (JS + TeX in container)', r => Object.values(r.js ?? {}).reduce((s, x) => s + x, 0) + texAll(r), A))
console.log('-- new (time-new.mjs)')
for (const k of ['first', 'marked']) console.log(row(`TeX ${k}`, r => texOf(r, k), B))
console.log(row('TeX in all (in container)', r => texAll(r), B))
console.log(row('TeX in all (docker wall)', r => texAll(r, 'wall'), B))
for (const k of ['open', 'ask', 'source', 'marks', 'readB', 'instrument']) console.log(row(`JS ${k}`, r => r.js?.[k], B))
for (const k of ['read', 'align', 'locate', 'wrap', 'bundle']) console.log(row(`JS back ${k}`, r => r.back?.[k], B))
console.log(row('JS in all', r => Object.values(r.js ?? {}).reduce((s, x) => s + x, 0), B))
console.log(row('whole (JS + TeX in container)', r => Object.values(r.js ?? {}).reduce((s, x) => s + x, 0) + texAll(r), B))
