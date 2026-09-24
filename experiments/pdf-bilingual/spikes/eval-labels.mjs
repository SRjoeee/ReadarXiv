// Figure text for the evaluation of two changes to the extension's image translation: the labels of every included
// vector figure in the corpus (arXiv's PDF, the text layer; the same figures arXiv's HTML shows as SVG), as the
// extension's recogniser shapes lines, merged into boxes by the extension's own rule, with the paper's prose for the
// name rule. Writes out/eval-labels.json: [{ id, figure, lines: [text], boxes: [{ text, lines: [i] }] }] and prose.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { figureLabels, figureRegions, vectorLines } from '../../../src/pdf-reader/engine/figures.mjs'
import { linesToBoxes } from '../../../src/core/image/boxes.ts'
import { loadProject } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { analyze } from '../../../src/pdf-reader/engine/paper-meta.mjs'
import { plainSource } from '../../../src/pdf-reader/engine/mt.mjs'
const root = new URL('..', import.meta.url).pathname
const ids = JSON.parse(readFileSync(join(root, 'out/c0-browser-patched-full.json'), 'utf8')).filter(r => r.result === 'pass').map(r => r.id)
const out = []
for (const id of ids) {
  const src = join(root, 'data/corpus', id, 'src'), pdfFile = join(root, 'data/corpus', id, 'arxiv.pdf')
  if (!existsSync(pdfFile)) continue
  let prose = ''
  try { const p = loadProject(src, analyze(src).main, { tables: true }); prose = p.units.filter(u => !['cell', 'figure'].includes(u.kind)).map(plainSource).join('\n') } catch { continue }
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(pdfFile)), verbosity: 0, standardFontDataUrl: `${root}node_modules/pdfjs-dist/standard_fonts/` }).promise
  const figures = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const [ops, text] = await Promise.all([page.getOperatorList(), page.getTextContent()])
    const regions = figureRegions(ops, OPS), labels = figureLabels(text.items, regions)
    regions.forEach((region, k) => {
      if (region.kind !== 'vector') return
      const lines = vectorLines(labels.filter(l => l.figure === k), region)
      if (!lines.length) return
      figures.push({ figure: `p${n}f${k}`, lines })
    })
    page.cleanup()
  }
  await pdf.loadingTask?.destroy?.()
  if (figures.length) out.push({ id, prose, figures })
  process.stdout.write(`${id} ${figures.length} figures ${figures.reduce((a, f) => a + f.lines.length, 0)} lines\n`)
}
writeFileSync(join(root, 'out/eval-labels.json'), JSON.stringify(out))
const lines = out.flatMap(p => p.figures.flatMap(f => f.lines)), boxes = out.flatMap(p => p.figures.flatMap(f => linesToBoxes(f.lines)))
console.log(`papers ${out.length}, figures ${out.reduce((a, p) => a + p.figures.length, 0)}, lines ${lines.length}, boxes the extension would translate ${boxes.length}`)
