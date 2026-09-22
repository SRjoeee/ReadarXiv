// Alignment spike: can each prose block of a paper's LaTeXML HTML be located as a region of the same version's PDF,
// using nothing but the PDF.js text layer? Prints statistics only; no paper text is written anywhere.
//   node spikes/align.mjs <fixture.html> <paper.pdf>
import { readFileSync } from 'node:fs'
import { parseHTML } from 'linkedom'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const [htmlPath, pdfPath] = process.argv.slice(2)
const GAP = '\u0000'
const norm = s => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

const t0 = performance.now()
// ---- PDF side: one stream of words in content-stream order, each with page and box
const pdf = await getDocument({ data: new Uint8Array(readFileSync(pdfPath)), verbosity: 0 }).promise
const words = []
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p)
  const { items } = await page.getTextContent()
  let carry = null // a word cut by a hyphen at the end of a line
  for (const it of items) {
    if (!it.str) continue
    const [, , , , x, y] = it.transform
    const parts = it.str.split(/(\s+)/)
    let offset = 0
    for (const part of parts) {
      const from = offset
      offset += part.length
      if (!part.trim()) { continue }
      const w = { t: norm(part), page: p, x: x + (it.width * from) / it.str.length, y, w: (it.width * part.length) / it.str.length, h: it.height }
      if (!w.t) continue
      if (carry) { carry.t += w.t; carry = null; continue }
      words.push(w)
    }
    const last = parts.filter(s => s.trim()).at(-1)
    if (it.hasEOL && last && /[-­]$/.test(last) && words.length) carry = words.at(-1)
    else if (it.hasEOL) carry = null
  }
}

const tPdf = performance.now()
// ---- HTML side: prose blocks, math taken out (the PDF shows it as loose glyphs), footnote bodies taken out
const { document } = parseHTML(readFileSync(htmlPath, 'utf8'))
const blocks = []
const seen = new Set()
for (const el of document.querySelectorAll('.ltx_p, .ltx_caption, .ltx_title, .ltx_abstract .ltx_p, .ltx_bibblock')) {
  if (seen.has(el) || el.closest('.ltx_note_content, nav, .ltx_page_footer, .ltx_TOC')) continue
  if (el.matches('.ltx_p') && el.closest('.ltx_caption, .ltx_title')) continue
  seen.add(el)
  const clone = el.cloneNode(true)
  for (const drop of clone.querySelectorAll('math, .ltx_note, .ltx_tag_note, svg')) drop.replaceWith(document.createTextNode(' \u0000 '))
  const ws = clone.textContent.split(/\s+/).map(w => (w === '\u0000' ? GAP : norm(w))).filter(Boolean)
  const kind = el.matches('.ltx_bibblock') ? 'bib' : el.matches('.ltx_caption') ? 'caption' : el.matches('.ltx_title') ? 'title' : el.closest('table, .ltx_tabular') ? 'cell' : 'para'
  const mathy = el.querySelectorAll('math').length
  if (ws.length) blocks.push({ kind, ws, mathy })
}

// ---- match: 3-gram votes pick a window, a greedy in-order walk measures coverage
const K = 3
const index = new Map()
for (let j = 0; j + K <= words.length; j++) {
  const key = words.slice(j, j + K).map(w => w.t).join(' ')
  ;(index.get(key) ?? index.set(key, []).get(key)).push(j)
}
function locate(ws) {
  const hits = []
  for (let i = 0; i + K <= ws.length; i++) {
    const gram = ws.slice(i, i + K)
    if (gram.includes(GAP)) continue
    for (const j of index.get(gram.join(' ')) ?? []) hits.push([i, j])
  }
  if (!hits.length) return null
  // the densest stretch of the PDF stream, then the longest chain of anchors rising in both texts
  hits.sort((a, b) => a[1] - b[1])
  const span = ws.length * 3 + 80
  let best = [0, 0, 0]
  for (let lo = 0, hi = 0; lo < hits.length; lo++) {
    while (hi < hits.length && hits[hi][1] - hits[lo][1] <= span) hi++
    if (hi - lo > best[0]) best = [hi - lo, lo, hi]
  }
  const win = hits.slice(best[1], best[2]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const len = win.map(() => 1), prev = win.map(() => -1)
  let tail = 0
  for (let a = 0; a < win.length; a++) {
    for (let b = 0; b < a; b++) if (win[b][0] < win[a][0] && win[b][1] < win[a][1] && len[b] + 1 > len[a]) { len[a] = len[b] + 1; prev[a] = b }
    if (len[a] > len[tail]) tail = a
  }
  const chain = []
  for (let a = tail; a !== -1; a = prev[a]) chain.unshift(win[a])
  const at = new Map() // block word -> pdf word
  for (const [i, j] of chain) for (let k = 0; k < K; k++) if (!at.has(i + k)) at.set(i + k, j + k)
  // between two anchored words the PDF interval is bounded: fill the rest in order inside it
  const anchored = [...at.keys()].sort((a, b) => a - b)
  const bounds = [[-1, at.get(anchored[0]) - (anchored[0] * 3 + 20)], ...anchored.map(i => [i, at.get(i)]), [ws.length, at.get(anchored.at(-1)) + (ws.length - anchored.at(-1)) * 3 + 20]]
  for (let b = 0; b + 1 < bounds.length; b++) {
    let j = Math.max(0, bounds[b][1] + 1)
    const stop = Math.min(words.length, bounds[b + 1][1])
    for (let i = bounds[b][0] + 1; i < bounds[b + 1][0]; i++) {
      if (ws[i] === GAP) continue
      for (let k = j; k < stop; k++) if (words[k].t === ws[i]) { at.set(i, k); j = k + 1; break }
    }
  }
  return { matched: [...at.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]), total: ws.filter(w => w !== GAP).length }
}
// fragments: a new one when the page changes or the text jumps back up the page (next column)
function fragments(matched) {
  let n = 1
  for (let i = 1; i < matched.length; i++) {
    const a = words[matched[i - 1]], b = words[matched[i]]
    if (b.page !== a.page || b.y > a.y + 40) n++
  }
  return n
}

const tIndex = performance.now()
const stat = {}
const claimed = new Set()
const rects = [] // RECTS=<path>: every located block as one box per fragment, in PDF points, origin bottom-left
function boxes(matched) {
  const out = []
  let cur = null
  for (let i = 0; i < matched.length; i++) {
    const w = words[matched[i]], prev = i ? words[matched[i - 1]] : null
    if (!cur || w.page !== prev.page || w.y > prev.y + 40) { cur = { page: w.page, x0: w.x, x1: w.x + w.w, y0: w.y, y1: w.y + w.h }; out.push(cur) }
    cur.x0 = Math.min(cur.x0, w.x); cur.x1 = Math.max(cur.x1, w.x + w.w); cur.y0 = Math.min(cur.y0, w.y); cur.y1 = Math.max(cur.y1, w.y + w.h)
  }
  return out
}
for (const b of blocks) {
  const s = (stat[b.kind] ??= { n: 0, short: 0, hi: 0, mid: 0, lo: 0, frag1: 0, frag2: 0, frag3: 0, mathyLo: 0 })
  s.n++
  const real = b.ws.filter(w => w !== GAP).length
  if (real < 6) { s.short++; b.short = true; continue }
  const r = locate(b.ws)
  const m = r?.matched
  const cov = r ? m.length / r.total : 0
  if (cov >= 0.85) { s.hi++; const f = fragments(m); f === 1 ? s.frag1++ : f === 2 ? s.frag2++ : s.frag3++; for (const k of m) claimed.add(k); b.span = [m[0], m.at(-1)]; const all = []; for (let k = m[0]; k <= m.at(-1); k++) all.push(k); rects.push({ kind: b.kind, boxes: boxes(m.at(-1) - m[0] < r.total * 4 + 40 ? all : m) }) }
  else if (cov >= 0.5) s.mid++
  else { s.lo++; if (b.mathy > 3) s.mathyLo++ }
}
// short blocks (headings, 'Proof.', short items): exact word run between the nearest located neighbours
let shortTried = 0, shortFound = 0
for (let n = 0; n < blocks.length; n++) {
  const b = blocks[n]
  if (!b.short || b.kind === 'bib' || b.kind === 'cell') continue
  const ws = b.ws.filter(w => w !== GAP)
  if (!ws.length) continue
  shortTried++
  let lo = 0, hi = words.length
  for (let a = n - 1; a >= 0; a--) if (blocks[a].span && blocks[a].kind !== 'caption') { lo = blocks[a].span[1] + 1; break }
  for (let a = n + 1; a < blocks.length; a++) if (blocks[a].span && blocks[a].kind !== 'caption') { hi = blocks[a].span[0]; break }
  if (hi - lo > 400 || hi <= lo) continue
  for (let j = lo; j + ws.length <= hi; j++) if (ws.every((w, k) => words[j + k].t === w)) { shortFound++; const all = ws.map((_, k) => j + k); rects.push({ kind: b.kind, boxes: boxes(all) }); break }
}
// are located paragraphs in the same order in both documents?
const paras = blocks.filter(b => b.span && b.kind === 'para')
let inOrder = 0
for (let n = 1; n < paras.length; n++) if (paras[n].span[0] > paras[n - 1].span[0]) inOrder++
const tEnd = performance.now()
if (process.env.RECTS) (await import('node:fs')).writeFileSync(process.env.RECTS, JSON.stringify(rects))
console.log(JSON.stringify({ pdf: pdfPath.split('/').pop(), pages: pdf.numPages, pdfWords: words.length, claimedShare: +(claimed.size / words.length).toFixed(3), short: { tried: shortTried, found: shortFound }, order: { pairs: paras.length - 1, inOrder }, ms: { pdfText: Math.round(tPdf - t0), htmlAndIndex: Math.round(tIndex - tPdf), match: Math.round(tEnd - tIndex) }, stat }, null, 1))
