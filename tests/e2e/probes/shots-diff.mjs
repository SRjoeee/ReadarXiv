// Two sets of interface shots (tests/e2e/probes/ui-shots.mjs) compared pixel by pixel: for each shot of the first set, the
// same path in the second, and the count of pixels that differ (any channel), the box they lie in and the largest step of a
// channel. A shot in one set alone is listed. Writes `<out>/diff.json` and `<out>/index.html` (each differing shot beside
// its pair, with its differences painted red over a grey copy of the first), and prints a summary.
//   node tests/e2e/probes/shots-diff.mjs <first dir> <second dir> [--out <dir>] [--tolerance <channel step>]
// A difference no larger than --tolerance (default 0: pixel-equal) in every channel is not counted.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
// pngjs, as Playwright bundles it (no dependency of our own for a probe)
const { PNG } = createRequire(createRequire(join(ROOT, 'package.json')).resolve('playwright'))('playwright-core/lib/utilsBundle')
const [A, B] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'))
if (!A || !B) throw new Error('usage: shots-diff.mjs <first dir> <second dir> [--out <dir>] [--tolerance n]')
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined }
const OUT = arg('--out') ?? join(B, '..', `diff-${relative(join(B, '..'), A).replace(/\W+/g, '_')}-${relative(join(B, '..'), B).replace(/\W+/g, '_')}`)
const TOLERANCE = Number(arg('--tolerance') ?? 0)

const pngs = dir => {
  const out = []
  const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.png')) out.push(relative(dir, p)) } }
  walk(dir)
  return out.sort()
}
const read = p => PNG.sync.read(readFileSync(p))

const rows = []
const inA = pngs(A), inB = new Set(pngs(B))
mkdirSync(OUT, { recursive: true })
for (const file of inA) {
  if (!inB.has(file)) { rows.push({ file, only: 'first' }); continue }
  inB.delete(file)
  const a = read(join(A, file)), b = read(join(B, file))
  if (a.width !== b.width || a.height !== b.height) { rows.push({ file, size: [`${a.width}x${a.height}`, `${b.width}x${b.height}`] }); continue }
  let n = 0, step = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
  const mask = new PNG({ width: a.width, height: a.height })
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]), Math.abs(a.data[i + 3] - b.data[i + 3]))
    const grey = Math.round((a.data[i] + a.data[i + 1] + a.data[i + 2]) / 3 * 0.35 + 165)
    if (d > TOLERANCE) {
      n++
      step = Math.max(step, d)
      const p = i / 4, x = p % a.width, y = (p - x) / a.width
      if (x < x0) x0 = x
      if (y < y0) y0 = y
      if (x > x1) x1 = x
      if (y > y1) y1 = y
      mask.data.set([230, 0, 0, 255], i)
    } else mask.data.set([grey, grey, grey, 255], i)
  }
  const row = { file, pixels: n, step, ...(n ? { box: [x0, y0, x1, y1] } : {}) }
  if (n) {
    const to = join(OUT, file.replace(/\.png$/, '.diff.png'))
    mkdirSync(dirname(to), { recursive: true })
    writeFileSync(to, PNG.sync.write(mask))
    row.diff = relative(OUT, to)
  }
  rows.push(row)
}
for (const file of inB) rows.push({ file, only: 'second' })

const differ = rows.filter(r => r.pixels || r.size || r.only)
writeFileSync(join(OUT, 'diff.json'), `${JSON.stringify({ first: A, second: B, tolerance: TOLERANCE, shots: rows.length, equal: rows.length - differ.length, rows }, null, 1)}\n`)
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const src = (dir, file) => relative(OUT, join(dir, file))
writeFileSync(join(OUT, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Shots compared</title>
<style>:root{font:13px/1.45 -apple-system,system-ui,sans-serif}body{margin:16px}.row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0 28px}img{width:100%;height:auto;border:1px solid #ccc}</style>
<h1>${differ.length} of ${rows.length} shots differ</h1><p>${esc(A)} against ${esc(B)}, tolerance ${TOLERANCE}</p>
${differ.map(r => `<h3>${esc(r.file)}: ${r.only ? `only in the ${r.only} set` : r.size ? `sizes ${r.size.join(' vs ')}` : `${r.pixels} px, step ≤ ${r.step}, box ${r.box.join(',')}`}</h3>${r.diff ? `<div class="row"><img src="${esc(src(A, r.file))}"><img src="${esc(src(B, r.file))}"><img src="${esc(r.diff)}"></div>` : ''}`).join('\n')}</html>\n`)
console.log(`${rows.length - differ.length} of ${rows.length} shots pixel-equal (tolerance ${TOLERANCE}); ${differ.length} differ`)
for (const r of differ.slice(0, 60)) console.log(`  ${r.file}: ${r.only ? `only in the ${r.only}` : r.size ? `size ${r.size.join(' vs ')}` : `${r.pixels} px, step ${r.step}, box ${r.box.join(',')}`}`)
if (!existsSync(OUT)) process.exit(1)
