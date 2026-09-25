// The reader's anchoring against ground truth. Both sides compiled with every unit's start and end marked as a PDF
// destination (gt-orig.mjs; c1-mt.mjs with MARK=1). Per side, text-only anchoring and mark-bounded anchoring are
// compared with the marks: does the highlight start and end on the right line, how many lines does it add or miss.
// On the original side it also counts how many units' marks carry over to arXiv's own PDF (same word at the mark).
// Prints counts only, no paper text.
//   node spikes/gt-eval.mjs id [lang]
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { anchorUnits, boundsFromMarks, lineRects, markWords, tokenizeDocument } from '../../../src/pdf-reader/engine/anchors.mjs'
const root = new URL('..', import.meta.url).pathname
const [id, lang = 'zh'] = process.argv.slice(2)
const trDir = join(root, 'data/runs/c1-mt-marks', lang, id), orDir = join(root, 'data/runs/gt-orig', id)
const units = JSON.parse(readFileSync(join(trDir, 'units.json'), 'utf8'))
const pdfIn = d => join(d, readdirSync(d).find(f => f.endsWith('.pdf')))

async function load(file) {
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0, cMapUrl: `${root}node_modules/pdfjs-dist/cmaps/`, cMapPacked: true, standardFontDataUrl: `${root}node_modules/pdfjs-dist/standard_fonts/` }).promise
  const pages = []
  for (let p = 1; p <= pdf.numPages; p++) { const tc = await (await pdf.getPage(p)).getTextContent(); pages.push({ page: p, items: tc.items, styles: tc.styles }) }
  const marks = new Map()
  // PDF.js 6 returns the named destinations as a Map
  for (const [name, d] of await pdf.getDestinations()) if (/^axt-\d+[se]$/.test(name) && d) marks.set(name.slice(4), { page: (await pdf.getPageIndex(d[0])) + 1, x: d[2], y: d[3] })
  return { doc: tokenizeDocument(pages), marks }
}
const sameLine = (doc, a, b) => doc[a].page === doc[b].page && Math.abs(doc[a].y - doc[b].y) < Math.min(doc[a].h, doc[b].h) * 0.5
const overlap = (x, y) => x.page === y.page && Math.min(x.y1, y.y1) - Math.max(x.y0, y.y0) > 0.5 * Math.min(x.y1 - x.y0, y.y1 - y.y0) && Math.min(x.x1, y.x1) > Math.max(x.x0, y.x0)

/** truth lines of a unit: body-size tokens between its marks, less other units' marked ranges nested inside and the
 *  page furniture between two pages (what follows the unit's last word on a page, up to its first on the next) */
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

function score(doc, truth, anchors, key) {
  const r = { units: 0, notFound: 0, startOk: 0, endOk: 0, bothOk: 0, extraLines: 0, missingLines: 0, truthLines: 0 }
  for (const u of units) {
    if (u.kind === 'heading' || !u[key] || u[key].length < 40) continue
    const t = truth.get(String(u.i))
    if (!t) continue
    r.units++
    const a = anchors.get(u.i)
    if (!a) { r.notFound++; continue }
    const [gs, ge] = t
    const so = sameLine(doc, a.tokens[0], gs), eo = sameLine(doc, a.tokens.at(-1), ge)
    r.startOk += so; r.endOk += eo; r.bothOk += so && eo
    if (process.env.DEBUG_ENDS && !(so && eo)) { const d = k => `${doc[k].t}@p${doc[k].page},${Math.round(doc[k].x)},${Math.round(doc[k].y)}`; console.error(key, u.i, u.kind, 'start', so ? 'ok' : `${d(a.tokens[0])} want ${d(gs)}`, 'end', eo ? 'ok' : `${d(a.tokens.at(-1))} want ${d(ge)}`) }
    // page furniture judged from the unit's own words: its first and last word on each page it crosses
    const firstOn = new Map(), lastOn = new Map()
    for (const k of a.tokens) if (k >= gs && k <= ge) { if (!firstOn.has(doc[k].page)) firstOn.set(doc[k].page, k); lastOn.set(doc[k].page, k) }
    const want = truthRects(doc, truth, String(u.i), gs, ge, { firstOn, lastOn })
    const extra = a.rects.filter(g => !want.some(w => overlap(g, w))), missing = want.filter(w => !a.rects.some(g => overlap(g, w)))
    r.extraLines += extra.length; r.missingLines += missing.length
    if (process.env.DEBUG && (extra.length || missing.length)) console.error(key, u.i, u.kind, 'extra', extra.map(g => `p${g.page} ${Math.round(g.x0)}-${Math.round(g.x1)} y${Math.round(g.y0)}`).join(' '), '| missing', missing.map(g => `p${g.page} ${Math.round(g.x0)}-${Math.round(g.x1)} y${Math.round(g.y0)}`).join(' '))
    r.truthLines += want.length
  }
  return r
}

const report = { id }
for (const [side, dir, key] of [['original', orDir, 'src'], ['translation', trDir, 'tr']]) {
  const { doc, marks } = await load(pdfIn(dir))
  const truth = boundsFromMarks(doc, marks)
  const list = units.map(u => ({ id: u.i, text: u[key] }))
  const text = anchorUnits(doc, list), bounded = anchorUnits(doc, list, { bounds: truth })
  report[side] = { marked: truth.size, textOnly: score(doc, truth, text, key), withMarks: score(doc, truth, bounded, key) }
  if (side === 'original') {
    // arXiv's PDF with the marks of our compile, kept where both have the same word at the mark
    const arxiv = await load(join(root, 'data/corpus', id, 'arxiv.pdf'))
    report[side].carriedToArxiv = boundsFromMarks(arxiv.doc, markWords(doc, marks)).size
  }
}
console.log(JSON.stringify(report))
