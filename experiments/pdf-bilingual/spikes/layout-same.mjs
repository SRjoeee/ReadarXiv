// Is our compile of an original laid out exactly like arXiv's PDF? Per paper: the share of arXiv's words that stand at
// the same place (same page, within 1.5 pt) in our compile, for the native TeX Live and the browser (BusyTeX) builds.
// If most papers agree to the word, positions recorded in our own compile (unit marks) carry over to arXiv's PDF.
//   node spikes/layout-same.mjs [gateDir]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { tokenizeDocument } from '../../../src/pdf-reader/engine/anchors.mjs'
const root = new URL('..', import.meta.url).pathname
const gate = process.argv[2] && process.argv[2] !== '--pair' ? process.argv[2] : join(root, 'data/runs/gate', readdirSync(join(root, 'data/runs/gate')).sort().at(-1))
const meta = JSON.parse(readFileSync(join(root, 'out/corpus-meta.json'), 'utf8'))
const ids = JSON.parse(readFileSync(join(root, 'out/c0-browser-patched-full.json'), 'utf8')).filter(r => r.result === 'pass').map(r => r.id)
async function tokensOf(file) {
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0, cMapUrl: `${root}node_modules/pdfjs-dist/cmaps/`, cMapPacked: true, standardFontDataUrl: `${root}node_modules/pdfjs-dist/standard_fonts/` }).promise
  const pages = []
  for (let p = 1; p <= pdf.numPages; p++) { const pg = await pdf.getPage(p), tc = await pg.getTextContent(); pages.push({ page: p, items: tc.items, styles: tc.styles }); pg.cleanup() }
  const n = pdf.numPages
  await pdf.loadingTask?.destroy?.()
  return { doc: tokenizeDocument(pages), pages: n }
}
function agree(a, b) {
  const grid = new Map()
  for (const t of b.doc) { const k = `${t.page}|${t.t}|${Math.round(t.x / 3)}|${Math.round(t.y / 3)}`; grid.set(k, (grid.get(k) ?? []).concat(t)) }
  let hit = 0
  for (const t of a.doc) {
    let found = false
    for (let dx = -1; dx <= 1 && !found; dx++) for (let dy = -1; dy <= 1 && !found; dy++) for (const u of grid.get(`${t.page}|${t.t}|${Math.round(t.x / 3) + dx}|${Math.round(t.y / 3) + dy}`) ?? []) if (Math.abs(u.x - t.x) < 1.5 && Math.abs(u.y - t.y) < 1.5) { found = true; break }
    if (found) hit++
  }
  return +(hit / Math.max(1, a.doc.length)).toFixed(4)
}
// --pair a.pdf b.pdf: the same measure for two given PDFs (does marking a compile move anything?)
if (process.argv[2] === '--pair') { const [a, b] = await Promise.all(process.argv.slice(3, 5).map(tokensOf)); console.log(JSON.stringify({ agree: agree(a, b), back: agree(b, a), pages: [a.pages, b.pages] })); process.exit(0) }
const rows = []
for (const id of ids) {
  const m = meta.find(x => x.id === id), stem = m.main.split('/').pop().replace(/\.tex$/, '')
  const arxiv = join(root, 'data/corpus', id, 'arxiv.pdf'), native = join(root, 'data/runs/native', id, `${stem}.pdf`), browser = join(gate, `${id}.pdf`)
  if (!existsSync(arxiv)) continue
  try {
    const a = await tokensOf(arxiv)
    const row = { id, tl: m.tlVersion ?? null, pages: a.pages }
    for (const [k, f] of [['native', native], ['browser', browser]]) if (existsSync(f)) { const b = await tokensOf(f); row[k] = agree(a, b); row[`${k}Pages`] = b.pages }
    rows.push(row)
    console.log(id, JSON.stringify(row))
  } catch (e) { console.log(id, 'error', e.message.slice(0, 80)) }
}
writeFileSync(join(root, 'out/layout-same.json'), JSON.stringify(rows, null, 1))
const share = (k, x) => rows.filter(r => r[k] != null && r[k] >= x).length + '/' + rows.filter(r => r[k] != null).length
console.log('native  ≥99%', share('native', 0.99), '≥95%', share('native', 0.95), '≥80%', share('native', 0.8))
console.log('browser ≥99%', share('browser', 0.99), '≥95%', share('browser', 0.95), '≥80%', share('browser', 0.8))
