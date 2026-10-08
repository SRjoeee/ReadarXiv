// The highlight's demo papers, the browser gate's PAPERS (spikes/highlight-gate-browser.mjs): for each paper arXiv's PDF
// on the left with our marked original's marks carried to it (original-marks.json), the run's translation on the right,
// its units (units.json: the source text, the translation, the display hints, and the sentences the Node gate makes again
// by the reader's path — sentences/<id>.json — where the source text is the one they were counted in) and its headings'
// levels. From the ten runs (data/runs/highlight-ten: final.pdf, final-texts.json, pieces/, original-marked.pdf) or the
// ground truth's four (data/runs/highlight-gt: T1.pdf, final-texts.json, O1.pdf). Papers stay on this machine: arXiv's
// may not be redistributed.
//   pnpm exec tsx lab/pdf/spikes/highlight-papers.mjs <out dir> [id …]   (default: the gate's papers —
//   checked 2608.02459 and 2608.06701, their floats 2608.12502 and 2608.02163 too, swept 2608.08350 and 2608.29181,
//   opened 2608.04322)
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { markWords, tokenizeDocument } from '../../../src/pdf-reader/engine/pipeline/anchors.mjs'
import { displayEdges, plainSource, unitText } from '../../../src/pdf-reader/engine/translate/mt.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/source/tar.mjs'
import { runPaper } from './highlight-runs.mjs'

const root = new URL('..', import.meta.url).pathname
const [out, ...asked] = process.argv.slice(2)
if (!out) { console.log('usage: highlight-papers.mjs <out dir> [id …]'); process.exit(1) }
const TEN = join(root, 'data/runs/highlight-ten'), GT = join(root, 'data/runs/highlight-gt')
const PDFJS = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))

/** a PDF's unit marks, each with the word it follows (anchors.mjs markWords), as the reader keeps a left side's */
async function marksOf(file) {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0, cMapUrl: join(PDFJS, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(PDFJS, 'standard_fonts/') })
  const pdf = await task.promise, pages = [], marks = new Map()
  for (let p = 1; p <= pdf.numPages; p++) { const tc = await (await pdf.getPage(p)).getTextContent(); pages.push({ page: p, items: tc.items, styles: tc.styles }) }
  for (const [name, d] of await pdf.getDestinations()) if (d && /^axt-\d+[se]$/.test(name)) marks.set(name.slice(4), { page: (await pdf.getPageIndex(d[0])) + 1, x: d[2], y: d[3] })
  await task.destroy()
  return markWords(tokenizeDocument(pages), marks)
}

for (const id of asked.length ? asked : ['2608.02459', '2608.06701', '2608.12502', '2608.02163', '2608.08350', '2608.29181', '2608.04322']) {
  // the ten runs first, the ground truth's otherwise
  const ten = existsSync(join(TEN, id, 'final.pdf')), runs = ten ? TEN : GT, dir = join(runs, id)
  if (!existsSync(dir)) { console.log(id, 'no run'); continue }
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(root, 'data/corpus', id, 'source.gz'))))
  const paper = runPaper(id, files), units = paper.units
  const pf = join(runs, 'pieces', `${id}.json`), typeset = existsSync(pf) ? JSON.parse(readFileSync(pf, 'utf8')) : {}
  const finals = new Map(JSON.parse(readFileSync(join(dir, 'final-texts.json'), 'utf8')).map(t => [t.id, t.text]))
  const sentences = JSON.parse(readFileSync(join(runs, 'sentences', `${id}.json`), 'utf8'))
  const at = join(out, id)
  mkdirSync(at, { recursive: true })
  copyFileSync(join(root, 'data/corpus', id, 'arxiv.pdf'), join(at, 'original.pdf'))
  copyFileSync(join(dir, ten ? 'final.pdf' : 'T1.pdf'), join(at, 'translation.pdf'))
  writeFileSync(join(at, 'original-marks.json'), JSON.stringify(Object.fromEntries(await marksOf(join(dir, ten ? 'original-marked.pdf' : 'O1.pdf')))))
  let n = 0
  const rows = units.map((u, i) => {
    const src = unitText(u.pieces).text, tr = typeset[i] ? unitText(typeset[i]).text : finals.get(i) ?? src
    const s = sentences[i] && plainSource(u) === src ? sentences[i] : null
    if (s) n++
    return { i, kind: u.kind, src, tr, ...displayEdges(u), ...(s ? { sentences: s } : {}) }
  })
  writeFileSync(join(at, 'units.json'), JSON.stringify(rows))
  writeFileSync(join(at, 'levels.json'), JSON.stringify(Object.fromEntries(units.flatMap((u, i) => (u.depth === undefined ? [] : [[i, u.depth]])))))
  console.log(id, `${rows.length} units, ${n} with sentences, from ${ten ? 'the ten runs' : 'the ground truth'}`)
}
