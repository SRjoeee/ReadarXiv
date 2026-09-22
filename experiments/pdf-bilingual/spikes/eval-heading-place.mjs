// Are the headings the anchor module locates on arXiv's PDF where a heading is: its tokens between the end of the
// located unit before it and the start of the one after it, in the stream. Per anchors module (baseline copy, new).
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { loadProject } from '../poc-reader/latex-front.mjs'
import { analyze } from '../poc-reader/paper-meta.mjs'
import { plainSource } from '../poc-reader/mt.mjs'
const root = new URL('..', import.meta.url).pathname
const mods = { base: await import('../out/anchors-base.mjs'), new: await import('../poc-reader/anchors.mjs') }
async function pages(file) {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0, cMapUrl: `${root}node_modules/pdfjs-dist/cmaps/`, cMapPacked: true, standardFontDataUrl: `${root}node_modules/pdfjs-dist/standard_fonts/` })
  const pdf = await task.promise
  const out = []
  for (let p = 1; p <= pdf.numPages; p++) { const tc = await (await pdf.getPage(p)).getTextContent(); out.push({ page: p, items: tc.items, styles: tc.styles }) }
  const marks = new Map()
  for (const [name, d] of await pdf.getDestinations()) if (/^axt-\d+[se]$/.test(name) && d) marks.set(name.slice(4), { page: (await pdf.getPageIndex(d[0])) + 1, x: d[2], y: d[3] })
  await task.destroy()
  return { pages: out, marks }
}
const ids = readdirSync(join(root, 'data/runs/gt-orig')).filter(id => existsSync(join(root, 'data/corpus', id, 'arxiv.pdf'))).slice(0, Number(process.env.N ?? 113))
const tally = {}
for (const id of ids) {
  const src = join(root, 'data/corpus', id, 'src')
  let units
  try { units = loadProject(src, analyze(src).main, { tables: true }).units.map((u, i) => ({ id: i, kind: u.kind, text: plainSource(u) })) } catch { continue }
  const dir = join(root, 'data/runs/gt-orig', id)
  const ours = await pages(join(dir, readdirSync(dir).find(f => f.endsWith('.pdf')))), arxiv = await pages(join(root, 'data/corpus', id, 'arxiv.pdf'))
  for (const [name, m] of Object.entries(mods)) {
    const od = m.tokenizeDocument(ours.pages), ad = m.tokenizeDocument(arxiv.pages)
    const located = m.anchorUnits(ad, units, { bounds: m.boundsFromMarks(ad, m.markWords(od, ours.marks)) })
    const t = (tally[name] ??= { headings: 0, located: 0, between: 0, outside: 0 })
    units.forEach((u, i) => {
      if (u.kind !== 'heading') return
      t.headings++
      const a = located.get(u.id)
      if (!a) return
      t.located++
      // the located neighbours: the nearest units before and after with a place
      let prev = null, next = null
      for (let j = i - 1; j >= 0 && !prev; j--) if (units[j].kind !== 'heading' && located.get(units[j].id)) prev = located.get(units[j].id)
      for (let j = i + 1; j < units.length && !next; j++) if (units[j].kind !== 'heading' && located.get(units[j].id)) next = located.get(units[j].id)
      const lo = prev ? Math.max(...prev.tokens) : -1, hi = next ? Math.min(...next.tokens) : Infinity
      if (Math.min(...a.tokens) > lo && Math.max(...a.tokens) < hi) t.between++; else t.outside++
    })
  }
}
console.log(JSON.stringify(tally))
