// Where two compiles of one paper part: the words of the first that do not stand at the same place (same page, within
// 1.5 pt) in the second, by line, how far the first few moved, and the words just before the first that moved.
//   node spikes/layout-diff.mjs a.pdf b.pdf
import { readFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { tokenizeDocument } from '../../../src/pdf-reader/engine/anchors.mjs'
const root = new URL('..', import.meta.url).pathname
async function tokensOf(file) {
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0, standardFontDataUrl: `${root}node_modules/pdfjs-dist/standard_fonts/` }).promise
  const pages = []
  for (let p = 1; p <= pdf.numPages; p++) { const tc = await (await pdf.getPage(p)).getTextContent(); pages.push({ page: p, items: tc.items, styles: tc.styles }) }
  return tokenizeDocument(pages)
}
const [a, b] = await Promise.all(process.argv.slice(2, 4).map(tokensOf))
const has = (t, doc) => doc.some(u => u.page === t.page && u.t === t.t && Math.abs(u.x - t.x) < 1.5 && Math.abs(u.y - t.y) < 1.5)
const miss = a.filter(t => !has(t, b))
const byLine = new Map()
for (const t of miss) { const k = `p${t.page} y${Math.round(t.y)}`; byLine.set(k, (byLine.get(k) ?? []).concat(t.t)) }
let n = 0
for (const [k, v] of byLine) { if (n++ > 25) break; console.log(k, v.slice(0, 12).join(' ')) }
console.log('lines', byLine.size, 'tokens', miss.length)
for (const t of miss.slice(0, 6)) { const c = b.filter(u => u.page === t.page && u.t === t.t).sort((p, q) => Math.hypot(p.x - t.x, p.y - t.y) - Math.hypot(q.x - t.x, q.y - t.y))[0]; console.log(t.t, 'a', Math.round(t.x), Math.round(t.y), 'b', c && Math.round(c.x), c && Math.round(c.y)) }
const firstA = a.findIndex(t => !has(t, b)); console.log('context before first moved token:', a.slice(Math.max(0, firstA - 12), firstA).map(t => `${t.t}@${Math.round(t.x)},${Math.round(t.y)}`).join(' '))
