// lab/pdf/prepare-back/glyphs-at.mjs: the glyphs of a page at points (PDF units), as pageInk reads them, with their show's place
// and whether the wrap split that show (A against A + its add-on: an A show whose glyphs W shows in more than one), their
// font and its kind as PDF.js loaded it.
//   node --import tsx lab/pdf/prepare-back/glyphs-at.mjs <candidate out> <papers.tsv> <id> <page> <x,y> …
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pageInk } from '@readarxiv/engine'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

const [OUT, LIST, ID, PAGE, ...pts] = process.argv.slice(2)
const dirs = new Map(readFileSync(LIST, 'utf8').split('\n').filter(Boolean).map(l => l.split('\t')))
const A = new Uint8Array(readFileSync(join(dirs.get(ID), 'arxiv.pdf')))
const bdir = join(OUT, 'bundles', ID)
const add = readFileSync(join(bdir, readdirSync(bdir).find(f => f.endsWith('.addon'))))
const W = new Uint8Array(A.length + add.length)
W.set(A)
W.set(add, A.length)
const read = async bytes => {
  const task = getDocument({ data: bytes.slice(), verbosity: 0 }), doc = await task.promise, page = await doc.getPage(Number(PAGE))
  const ops = await page.getOperatorList()
  const ink = pageInk(OPS, ops, page.commonObjs, { rotate: page.rotate, indices: true, turned: true })
  const fonts = new Map()
  for (const g of ink.glyphs) if (!fonts.has(g.font)) { try { const f = page.commonObjs.get(ops.argsArray[ops.fnArray.indexOf(OPS.setFont)]?.[0]); void f } catch {} fonts.set(g.font, null) }
  await task.destroy()
  return ink
}
const a = await read(A), w = await read(W)
const shows = new Map()
a.glyphs.forEach((g, j) => (shows.get(g.n) ?? shows.set(g.n, new Set()).get(g.n)).add(w.glyphs[j]?.n))
for (const pt of pts) {
  const [x, y] = pt.split(',').map(Number)
  const hits = a.glyphs.map((g, j) => [g, j]).filter(([g]) => x >= Math.min(g.x0, g.ix0) - 0.6 && x <= Math.max(g.x1, g.ix1) + 0.6 && y >= g.bottom - 0.6 && y <= g.top + 0.6)
  console.log(pt, JSON.stringify(hits.map(([g, j]) => ({ j, u: g.u, font: g.font, n: g.n, k: g.k, size: +g.size.toFixed(2), split: (shows.get(g.n)?.size ?? 0) > 1, nW: w.glyphs[j]?.n }))))
}
