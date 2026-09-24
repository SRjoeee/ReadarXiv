// The live reader's left side, rebuilt for every paper with a marked compile of its original (data/runs/gt-orig):
// arXiv's PDF, the marks of our compile carried over where both have the same word (markWords), each unit's source
// text anchored inside them — how many units of each kind are located. And on our own compile, where the marks are
// the truth, whether each marked unit's highlight starts and ends on the right line (the score of gt-eval.mjs).
// Counts only, no paper text.   node spikes/eval-anchor-kinds.mjs <label>   → out/eval-anchor-kinds-<label>.json
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
const { anchorUnits, boundsFromMarks, lineRects, markWords, tokenizeDocument } = await import(process.env.ANCHORS ?? '../../../src/pdf-reader/engine/anchors.mjs')
import { loadProject } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { analyze } from '../../../src/pdf-reader/engine/paper-meta.mjs'
import { plainSource } from '../../../src/pdf-reader/engine/mt.mjs'
const root = new URL('..', import.meta.url).pathname
const label = process.argv[2] ?? 'run'
const ids = readdirSync(join(root, 'data/runs/gt-orig')).filter(id => existsSync(join(root, 'data/corpus', id, 'arxiv.pdf')))

async function load(file) {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0, cMapUrl: `${root}node_modules/pdfjs-dist/cmaps/`, cMapPacked: true, standardFontDataUrl: `${root}node_modules/pdfjs-dist/standard_fonts/` })
  const pdf = await task.promise
  const pages = []
  for (let p = 1; p <= pdf.numPages; p++) { const tc = await (await pdf.getPage(p)).getTextContent(); pages.push({ page: p, items: tc.items, styles: tc.styles }) }
  const marks = new Map()
  for (const [name, d] of await pdf.getDestinations()) if (/^axt-\d+[se]$/.test(name) && d) marks.set(name.slice(4), { page: (await pdf.getPageIndex(d[0])) + 1, x: d[2], y: d[3] })
  await task.destroy()
  return { doc: tokenizeDocument(pages), marks }
}
const sameLine = (doc, a, b) => doc[a].page === doc[b].page && Math.abs(doc[a].y - doc[b].y) < Math.min(doc[a].h, doc[b].h) * 0.5
const overlap = (x, y) => x.page === y.page && Math.min(x.y1, y.y1) - Math.max(x.y0, y.y0) > 0.5 * Math.min(x.y1 - x.y0, y.y1 - y.y0) && Math.min(x.x1, y.x1) > Math.max(x.x0, y.x0)
function truthRects(doc, truth, key, gs, ge, own) {
  const hs = []
  for (let k = gs; k <= ge; k++) hs.push(doc[k].h)
  hs.sort((x, y) => x - y)
  const body = hs[hs.length >> 1]
  const nested = [...truth].filter(([k2, [a, b]]) => k2 !== key && a > gs && b < ge).map(([, r]) => r)
  const idx = []
  for (let k = gs; k <= ge; k++) {
    const t = doc[k]
    if (t.h < body * 0.85 || t.h > body * 1.2 || nested.some(([a, b]) => k >= a && k <= b)) continue
    if (t.page !== doc[gs].page && k < (own.firstOn.get(t.page) ?? Infinity)) continue
    if (t.page !== doc[ge].page && k > (own.lastOn.get(t.page) ?? -Infinity)) continue
    idx.push(k)
  }
  return lineRects(doc, idx)
}
function score(doc, truth, anchors, units) {
  const r = { units: 0, notFound: 0, bothOk: 0, extraLines: 0, missingLines: 0, truthLines: 0 }
  for (const u of units) {
    if (u.text.length < 40) continue
    const t = truth.get(String(u.id))
    if (!t) continue
    r.units++
    const a = anchors.get(u.id)
    if (!a) { r.notFound++; continue }
    const [gs, ge] = t
    r.bothOk += sameLine(doc, a.tokens[0], gs) && sameLine(doc, a.tokens.at(-1), ge)
    const firstOn = new Map(), lastOn = new Map()
    for (const k of a.tokens) if (k >= gs && k <= ge) { if (!firstOn.has(doc[k].page)) firstOn.set(doc[k].page, k); lastOn.set(doc[k].page, k) }
    const want = truthRects(doc, truth, String(u.id), gs, ge, { firstOn, lastOn })
    r.extraLines += a.rects.filter(g => !want.some(w => overlap(g, w))).length
    r.missingLines += want.filter(w => !a.rects.some(g => overlap(g, w))).length
    r.truthLines += want.length
  }
  return r
}
const out = []
for (const id of ids) {
  try {
    const src = join(root, 'data/corpus', id, 'src')
    const project = loadProject(src, analyze(src).main, { tables: true })
    const units = project.units.map((u, i) => ({ id: i, kind: u.kind, text: plainSource(u) }))
    const dir = join(root, 'data/runs/gt-orig', id)
    const ours = await load(join(dir, readdirSync(dir).find(f => f.endsWith('.pdf'))))
    const truth = boundsFromMarks(ours.doc, ours.marks)
    const gt = score(ours.doc, truth, anchorUnits(ours.doc, units, { bounds: truth }), units)
    const arxiv = await load(join(root, 'data/corpus', id, 'arxiv.pdf'))
    const bounds = boundsFromMarks(arxiv.doc, markWords(ours.doc, ours.marks))
    const located = anchorUnits(arxiv.doc, units, { bounds })
    const kinds = {}
    for (const u of units) { const k = (kinds[u.kind] ??= { n: 0, located: 0 }); k.n++; if (located.get(u.id)) k.located++ }
    out.push({ id, kinds, gt })
  } catch (e) { out.push({ id, error: String(e).slice(0, 120) }) }
}
writeFileSync(join(root, `out/eval-anchor-kinds-${label}.json`), JSON.stringify(out, null, 1))
const sum = {}, gsum = {}
for (const p of out) { if (p.error) continue; for (const [k, v] of Object.entries(p.kinds)) { sum[k] ??= { n: 0, located: 0 }; sum[k].n += v.n; sum[k].located += v.located } for (const [k, v] of Object.entries(p.gt)) gsum[k] = (gsum[k] ?? 0) + v }
console.log(JSON.stringify({ papers: out.filter(p => !p.error).length, errors: out.filter(p => p.error).length, located: sum, truth: gsum }))
