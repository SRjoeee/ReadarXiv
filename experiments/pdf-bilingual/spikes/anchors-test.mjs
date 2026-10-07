// The anchor module against both sides of a translated paper: arXiv's PDF with the units' source text, the compiled
// translation with their translated text. Prints shares located and the time; no paper text.
import { readFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { anchorUnits, tokenizeDocument } from '../../../src/pdf-reader/engine/anchors.mjs'
const [id, lang = 'zh'] = process.argv.slice(2)
const root = new URL('..', import.meta.url).pathname
const units = JSON.parse(readFileSync(`${root}data/runs/c1-mt/${lang}/${id}/units.json`, 'utf8'))
const main = JSON.parse(readFileSync(`${root}out/corpus-meta.json`, 'utf8')).find(m => m.id === id).main.split('/').pop().replace(/\.tex$/, '')
async function pagesOf(file) {
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0, cMapUrl: `${root}node_modules/pdfjs-dist/cmaps/`, cMapPacked: true, standardFontDataUrl: `${root}node_modules/pdfjs-dist/standard_fonts/` }).promise
  const pages = []
  for (let p = 1; p <= pdf.numPages; p++) { const tc = await (await pdf.getPage(p)).getTextContent(); pages.push({ page: p, items: tc.items, styles: tc.styles }) }
  return pages
}
for (const [side, file, key] of [['original', `${root}data/corpus/${id}/arxiv.pdf`, 'src'], ['translation', `${root}data/runs/c1-mt/${lang}/${id}/${main}.pdf`, 'tr']]) {
  const t0 = performance.now()
  const pages = await pagesOf(file)
  const t1 = performance.now()
  const doc = tokenizeDocument(pages)
  const a = anchorUnits(doc, units.map(u => ({ id: u.i, text: u[key] })))
  const t2 = performance.now()
  const long = units.filter(u => (u[key] ?? '').length >= 40)
  const found = long.filter(u => a.get(u.i)).length
  const byKind = {}
  for (const u of long) { const k = (byKind[u.kind] ??= [0, 0]); k[1]++; if (a.get(u.i)) k[0]++ }
  const multi = [...a.values()].filter(Boolean).filter(x => new Set(x.rects.map(r => r.page)).size > 1).length
  console.log(`${id} ${side.padEnd(11)} pages ${pages.length} tokens ${doc.length} | units ≥40 chars located ${found}/${long.length} ${JSON.stringify(byKind)} | across pages ${multi} | text ${Math.round(t1 - t0)} ms, anchors ${Math.round(t2 - t1)} ms`)
}
