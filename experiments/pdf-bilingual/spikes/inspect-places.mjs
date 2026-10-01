// experiments/pdf-bilingual/spikes/inspect-places.mjs
// Where a paper's units landed in some columns against the original, page by page: how many of each original page's
// units stayed on it and how far they moved on average; with --page=N, each unit the original starts on page N with
// its place in every column (page@pt from the text block's top). Columns as the evaluation names them (visual-eval),
// or a compile's PDF by its path under the paper's folder (work/flow46fp8r5b-1/<stem>).
//   pnpm exec tsx experiments/pdf-bilingual/spikes/inspect-places.mjs <lang> <paper> <column>... [--page=N]
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { unpackSource } from '../../../src/pdf-reader/engine/tar.mjs'
import { openPaper } from '../../../src/pdf-reader/engine/live.mjs'
import { marksOf } from './lock.mjs'
import { drifts } from './alignment.mjs'

const root = new URL('..', import.meta.url).pathname
const args = process.argv.slice(2), page = Number(args.find(a => a.startsWith('--page='))?.slice(7) ?? 0)
const [lang, id, ...cols] = args.filter(a => !a.startsWith('--'))
const D = join(root, 'data/runs/visual-eval', lang, id)
const pdfIn = d => join(d, readdirSync(d).find(x => x.endsWith('.pdf') && readdirSync(d).includes(x.replace(/pdf$/, 'log'))))
const om = await marksOf(pdfIn(join(D, 'work/original')))
const ms = Object.fromEntries(await Promise.all(cols.map(async c => [c, await marksOf(join(D, `${c}.pdf`))])))
const top = m => Math.max(...[...m.marks.values()].map(v => v.y))
if (page) {
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(root, 'data/corpus', id, 'source.gz'))))
  const { units } = openPaper(files), T = top(om)
  const on = [...om.marks].filter(([n, v]) => n.endsWith('s') && v.page === page - 1).sort((a, b) => b[1].y - a[1].y)
  for (const [n, v] of on) {
    const cells = cols.map(c => { const t = ms[c].marks.get(n); return `${c}: ${t ? `p${t.page + 1}@${Math.round(top(ms[c]) - t.y)}` : '-'}` })
    console.log(`${n.slice(0, -1).padStart(4)} ${units[Number(n.slice(0, -1))].kind.padEnd(9)} original p${v.page + 1}@${Math.round(T - v.y)}  ${cells.join('  ')}`)
  }
} else {
  const ds = Object.fromEntries(cols.map(c => [c, drifts(om, ms[c])])), pages = new Map()
  for (const [n, v] of om.marks) if (n.endsWith('s')) { if (!pages.has(v.page)) pages.set(v.page, []); pages.get(v.page).push(n) }
  for (const [p, ns] of [...pages].sort((a, b) => a[0] - b[0])) {
    const cells = cols.map(c => { let same = 0, k = 0, s = 0; for (const n of ns) { const t = ms[c].marks.get(n); if (!t) continue; k++; if (t.page === p) same++; s += Math.abs(ds[c].get(Number(n.slice(0, -1))) ?? 0) } return `${c}: ${same}/${k} |d| ${String(Math.round(s / Math.max(k, 1))).padStart(4)}pt` })
    console.log(`p${String(p + 1).padStart(2)}  ${cells.join('   ')}`)
  }
}
