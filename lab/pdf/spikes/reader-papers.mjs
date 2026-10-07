// The reader prototype's paper files from the marked runs: arXiv's PDF on the left, with the marks of our own compile
// of the original as a small JSON (each mark's place and the word it follows); the marked translation on the right,
// whose marks the reader reads from the PDF itself; and the units' plain text. With partial-translation stages (c1-mt.mjs
// STAGES=…), those too, listed in stages.json for the reader's ?progressive=1.
//   node spikes/reader-papers.mjs id ...
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { markWords, tokenizeDocument } from '../../../src/pdf-reader/engine/anchors.mjs'
const root = new URL('..', import.meta.url).pathname
const pdfIn = d => join(d, readdirSync(d).find(f => f.endsWith('.pdf')))
for (const id of process.argv.slice(2)) {
  const out = join(root, 'poc-reader/papers', id), tr = join(root, 'data/runs/c1-mt-marks/zh', id)
  mkdirSync(out, { recursive: true })
  copyFileSync(join(root, 'data/corpus', id, 'arxiv.pdf'), join(out, 'original.pdf'))
  copyFileSync(pdfIn(tr), join(out, 'translation.pdf'))
  copyFileSync(join(tr, 'units.json'), join(out, 'units.json'))
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(pdfIn(join(root, 'data/runs/gt-orig', id)))), verbosity: 0, standardFontDataUrl: `${root}node_modules/pdfjs-dist/standard_fonts/` }).promise
  const pages = []
  for (let p = 1; p <= pdf.numPages; p++) { const tc = await (await pdf.getPage(p)).getTextContent(); pages.push({ page: p, items: tc.items, styles: tc.styles }) }
  const marks = new Map()
  for (const [name, d] of await pdf.getDestinations()) if (/^axt-\d+[se]$/.test(name) && d) marks.set(name.slice(4), { page: (await pdf.getPageIndex(d[0])) + 1, x: +d[2].toFixed(2), y: +d[3].toFixed(2) })
  const words = markWords(tokenizeDocument(pages), marks)
  writeFileSync(join(out, 'original-marks.json'), JSON.stringify(Object.fromEntries(words)))
  console.log(id, 'marks', words.size, 'bytes', JSON.stringify(Object.fromEntries(words)).length)
  const stagesDir = join(tr, 'stages')
  if (existsSync(stagesDir)) {
    const n = JSON.parse(readFileSync(join(tr, 'units.json'), 'utf8')).length
    const stages = readdirSync(stagesDir).map(Number).sort((a, b) => a - b).map(share => {
      const file = `stage-${share}.pdf`
      copyFileSync(pdfIn(join(stagesDir, String(share))), join(out, file))
      return { file, translated: Math.round(n * share) }
    })
    stages.push({ file: 'translation.pdf', translated: n })
    writeFileSync(join(out, 'stages.json'), JSON.stringify(stages))
    console.log(id, 'stages', stages.map(s => s.translated).join(' → '))
  }
}
