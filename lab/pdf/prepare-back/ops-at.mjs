// lab/pdf/prepare-back/ops-at.mjs: PDF.js's operator list of a page of A and of A + its add-on around a show (its place among
// the page's shows), side by side: what the wrap wrote around a split.
//   node --import tsx lab/pdf/prepare-back/ops-at.mjs <candidate out> <papers.tsv> <id> <page> <show> [span]
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

const [OUT, LIST, ID, PAGE, SHOW, SPAN = '3'] = process.argv.slice(2)
const dirs = new Map(readFileSync(LIST, 'utf8').split('\n').filter(Boolean).map(l => l.split('\t')))
const A = new Uint8Array(readFileSync(join(dirs.get(ID), 'arxiv.pdf')))
const bdir = join(OUT, 'bundles', ID)
const add = readFileSync(join(bdir, readdirSync(bdir).find(f => f.endsWith('.addon'))))
const W = new Uint8Array(A.length + add.length)
W.set(A)
W.set(add, A.length)
const NAME = Object.fromEntries(Object.entries(OPS).map(([k, v]) => [v, k]))
for (const [tag, bytes, show] of [['A', A, Number(SHOW)], ['W', W, null]]) {
  const task = getDocument({ data: bytes.slice(), verbosity: 0 }), doc = await task.promise, page = await doc.getPage(Number(PAGE))
  const ops = await page.getOperatorList()
  // (the op index of the show asked: in W the first show holding the same glyphs' codes as A's show)
  let n = -1, at = -1
  const shows = []
  for (let i = 0; i < ops.fnArray.length; i++) if (ops.fnArray[i] === OPS.showText || ops.fnArray[i] === OPS.showSpacedText) shows.push(i)
  at = show !== null ? shows[show] : globalThis.__wAt
  if (tag === 'A') { const codes = ops.argsArray[at][0].filter(g => typeof g === 'object').map(g => g.originalCharCode).join(','); globalThis.__codes = codes }
  if (tag === 'W') { at = shows.find(i => { const c = ops.argsArray[i][0].filter(g => typeof g === 'object').map(g => g.originalCharCode).join(','); return globalThis.__codes.startsWith(c) && c.length > 2 }) ?? -1 }
  n = Number(SPAN)
  console.log(`---- ${tag} op ${at}`)
  for (let i = Math.max(0, at - n); i <= Math.min(ops.fnArray.length - 1, at + 2 * n); i++) {
    const a = ops.argsArray[i]
    const show = Array.isArray(a?.[0]) ? a[0].map(g => (typeof g === 'number' ? g : g?.unicode ?? '?')).join('|') : JSON.stringify(a)?.slice(0, 80)
    console.log(i, NAME[ops.fnArray[i]], show)
  }
  await task.destroy()
}
