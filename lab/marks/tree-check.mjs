// lab/marks/tree-check.mjs: the engine's tree decision (packages/engine/src/compile/tree.ts) against the one the baseline and
// the gate took (lab/marks/today.mjs treeOf, the answers' `year`) on every corpus paper: the README read from the package, the
// banner from arXiv's PDF's Info dictionary. No TeX. Not shipped.
//   node --import tsx lab/marks/tree-check.mjs --papers=<papers.json> --set=87 --answers=<answers.json>
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { treeOf } from '../../packages/engine/src/compile/tree.ts'
import { PINS, tar } from './today.mjs'

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const papers = JSON.parse(readFileSync(arg('papers'), 'utf8')).papers.filter(p => p.sets.includes(arg('set') ?? '87'))
const answers = JSON.parse(readFileSync(arg('answers'), 'utf8'))
const served = Object.keys(PINS.images)
const tally = { same: 0, differ: [], why: {} }
for (const p of papers) {
  const { files } = await tar.unpackSource(new Uint8Array(readFileSync(join(p.dir, 'source.gz'))))
  const task = getDocument({ data: new Uint8Array(readFileSync(join(p.dir, 'arxiv.pdf'))), verbosity: 0 })
  const doc = await task.promise
  const banner = (await doc.getMetadata().catch(() => null))?.info?.Custom?.get?.('PTEX.Fullbanner') ?? null
  await task.destroy()
  const t = treeOf({ readme: files.get('00README.json') ?? null, banner, served, fallback: PINS.default })
  tally.why[t.why] = (tally.why[t.why] ?? 0) + 1
  if (t.tree === String(answers[p.id]?.year)) tally.same++
  else tally.differ.push(`${p.id}: engine ${t.tree} (${t.why}), gate ${answers[p.id]?.year}`)
}
console.log(JSON.stringify(tally))
