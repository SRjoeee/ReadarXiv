// lab/pdf/spikes/link-anchor-check.mjs
// The pixel check of the link-anchor locator (layout/make.mjs phOf's `linked`): every placeholder the maker placed by its
// link annotations (its stats' `links.placed`) read again on arXiv's page by two readings the maker does not use, and each
// held to the text it should be:
//   - the text layer as poppler reads it (pdftotext -bbox: each word's box from its own glyphs): the words whose centre lies
//     inside the placeholder's segments read, letters and digits, as the file's page text; every link annotation whose glyphs
//     lie inside it (PDF.js's overlaid text) found in what they read, in order, one at least; before the first link one word at
//     most, one of the words a reference's name prints (EXPECTED: the corpus's words right before a reference link);
//   - the pixels (poppler's pdftoppm, 288 dpi, grey): ink inside each segment, and none in the column of pixels each of its
//     left and right edges falls in, over its height: an edge inside a glyph's ink would cut it (its own, or a neighbour's).
// Any mismatch is a failure: exit 1. With --crops=<dir>, each segment's crop (2 pt round it) is written there as a PNG for review.
//   node lab/pdf/spikes/link-anchor-check.mjs <arxiv.pdf> <layout.json> <stats.json> [--crops=<dir>] [--json]
// Reads local files alone; no request.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseLayout } from '../../../src/pdf-reader/engine/layout/file.mjs'

/** the words a reference's name prints before its number, case folded: those the corpus sets right before a reference
 *  link (both PDFs of the 25 papers of the drift study, 2026-10-17: the word on the link's baseline before its first glyph),
 *  less the running text's (in, and, see, of) */
export const EXPECTED = new Set(('table tables tab. tabs. figure figures fig. figs. section sections sec. secs. subsection appendix chapter chapters '
  + 'equation equations eq. eqs. proposition prop. corollary definition def. lemma lemmas theorem thm. algorithm algorithms alg. listing claim').split(' '))
/** the pixel grid: 288 dpi, 4 a point; a pixel darker than INK is ink */
const DPI = 288, PX = DPI / 72, INK = 160

const args = process.argv.slice(2)
const [pdfPath, layoutPath, statsPath] = args.filter(a => !a.startsWith('--'))
const crops = args.find(a => a.startsWith('--crops='))?.slice(8) ?? null
if (!pdfPath || !layoutPath || !statsPath) { console.error('usage: link-anchor-check.mjs <arxiv.pdf> <layout.json> <stats.json> [--crops=<dir>] [--json]'); process.exit(2) }
const NM = new URL('../../../node_modules/pdfjs-dist/', import.meta.url).pathname
const letters = s => s.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '')
const file = parseLayout(new Uint8Array(readFileSync(layoutPath)))
const stats = JSON.parse(readFileSync(statsPath, 'utf8'))
const placed = stats.stats?.links?.placed ?? stats.links?.placed ?? []
const task = getDocument({ data: new Uint8Array(readFileSync(pdfPath)), verbosity: 0, standardFontDataUrl: `${NM}standard_fonts/`, cMapUrl: `${NM}cmaps/`, cMapPacked: true })
const doc = await task.promise
if (crops) mkdirSync(crops, { recursive: true })

/** a page's text-layer points and Link annotations, read once */
const pages = new Map()
async function pageOf(p) {
  if (pages.has(p)) return pages.get(p)
  const page = await doc.getPage(p)
  const links = (await page.getAnnotations()).filter(a => a.subtype === 'Link')
  // its words as poppler reads them (pdftotext -bbox: each word's box from its glyphs, top-down), in PDF units y up
  const xml = execFileSync('pdftotext', ['-bbox', '-f', String(p), '-l', String(p), pdfPath, '-'], { maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8')
  const height = Number(/<page width="[\d.]+" height="([\d.]+)"/.exec(xml)?.[1] ?? page.view[3])
  const entity = t => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
  const words = [...xml.matchAll(/<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">([^<]*)<\/word>/g)].map(m => ({ t: entity(m[5]), x0: Number(m[1]), x1: Number(m[3]), y0: height - Number(m[4]), y1: height - Number(m[2]) }))
  const got = { view: page.view, words, links }
  pages.set(p, got)
  return got
}
/** a page region's grey pixels (PGM P5, pdftoppm), x0 y0 x1 y1 in PDF units */
function pixels(p, view, x0, y0, x1, y1) {
  const X = Math.floor((x0 - view[0]) * PX), Y = Math.floor((view[3] - y1) * PX), W = Math.ceil((x1 - x0) * PX), H = Math.ceil((y1 - y0) * PX)
  const out = execFileSync('pdftoppm', ['-f', String(p), '-l', String(p), '-r', String(DPI), '-x', String(X), '-y', String(Y), '-W', String(W), '-H', String(H), '-gray', pdfPath], { maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] })
  // P5\n<w> <h>\n<max>\n then the bytes
  const head = out.subarray(0, 64).toString('latin1'), m = /^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/.exec(head)
  if (!m) throw new Error('pdftoppm gave no PGM')
  const w = Number(m[1]), h = Number(m[2]), at = m[0].length
  return { X, Y, w, h, at: (px, py) => (px < 0 || py < 0 || px >= w || py >= h ? 255 : out[at + py * w + px]) }
}

/** a word's letters' and digits' centre across: their even share of its box (its punctuation at either end left out) */
function centreOf(w) {
  const cs = [...w.t], first = cs.findIndex(c => /[\p{L}\p{N}]/u.test(c)), last = cs.findLastIndex(c => /[\p{L}\p{N}]/u.test(c))
  if (first < 0) return (w.x0 + w.x1) / 2
  const step = (w.x1 - w.x0) / cs.length
  return w.x0 + ((first + last + 1) / 2) * step
}

const rows = []
let failures = 0
for (const [i, k] of placed) {
  const r = file.ph.find(e => e[0] === i && e[1] === k)
  const fail = why => { rows.push({ unit: i, k, ok: false, why }); failures++ }
  if (!r || r.length < 10) { fail('no segment in the file'); continue }
  const text = file.pageText.find(t => t[0] === i && t[1] === k)?.[2] ?? null
  if (text === null) { fail('no page text in the file'); continue }
  const segs = []
  for (let o = 4; o + 5 < r.length; o += 6) segs.push({ page: r[o], x0: r[o + 1], base: r[o + 2], x1: r[o + 3], top: r[o + 4], bottom: r[o + 5] })
  let why = null
  const words = [], linkTexts = []
  for (const s of segs) {
    const P = await pageOf(s.page)
    // poppler's words whose letters' centre lies inside the segment (punctuation glued to a word, "B).", is its neighbour's)
    for (const w of P.words) { const c = centreOf(w); if (c > s.x0 && c < s.x1 && (w.y0 + w.y1) / 2 >= s.bottom && (w.y0 + w.y1) / 2 <= s.top) words.push({ ...w, page: s.page }) }
    // the link annotations whose glyphs lie inside it: PDF.js's own reading of them
    for (const a of P.links) {
      const [ax0, ay0, ax1, ay1] = a.rect
      if (ax1 <= s.x0 || ax0 >= s.x1 || ay1 <= s.bottom || ay0 >= s.top || !letters(a.overlaidText ?? '')) continue
      linkTexts.push({ x: ax0, page: s.page, rect: a.rect, t: letters(a.overlaidText) })
    }
    // the pixels: ink inside; none in the column of pixels each edge falls in, over the segment's height (an edge in a
    // glyph's ink cuts it: its own, or a neighbour's let in)
    const px = pixels(s.page, P.view, s.x0 - 2, s.bottom, s.x1 + 2, s.top)
    const col = x => { const c = Math.floor((x - (P.view[0] + px.X / PX)) * PX); let darkest = 255; for (let y = 0; y < px.h; y++) darkest = Math.min(darkest, px.at(c, y)); return darkest }
    let inked = 0
    const c0 = Math.ceil((s.x0 - (P.view[0] + px.X / PX)) * PX), c1 = Math.floor((s.x1 - (P.view[0] + px.X / PX)) * PX)
    for (let c = c0; c < c1; c++) for (let y = 0; y < px.h; y++) if (px.at(c, y) < INK) inked++
    if (!inked) why ??= `no ink inside its segment on page ${s.page}`
    const left = col(s.x0), right = col(s.x1)
    if (left < INK) why ??= `ink in the column of its left edge (${left})`
    if (right < INK) why ??= `ink in the column of its right edge (${right})`
    if (crops) execFileSync('pdftoppm', ['-f', String(s.page), '-l', String(s.page), '-r', String(DPI), '-x', String(Math.floor((s.x0 - 2 - P.view[0]) * PX)), '-y', String(Math.floor((P.view[3] - s.top - 2) * PX)), '-W', String(Math.ceil((s.x1 - s.x0 + 4) * PX)), '-H', String(Math.ceil((s.top - s.bottom + 4) * PX)), '-png', '-singlefile', pdfPath, join(crops, `u${i}-k${k}-p${s.page}`)], { stdio: 'ignore' })
  }
  linkTexts.sort((a, b) => a.x - b.x)
  const R = letters(words.map(w => w.t).join('')), T = letters(text)
  if (R !== T) why ??= `the text layer reads ${JSON.stringify(R)}, the file ${JSON.stringify(T)}`
  if (!linkTexts.length) why ??= 'no link annotation inside it'
  // the links' texts in order; before the first, one word at most, a reference's name
  let at = 0
  for (const l of linkTexts) { const j = R.indexOf(l.t, at); if (j < 0) { why ??= `the link's text ${JSON.stringify(l.t)} not in what it reads`; break } at = j + l.t.length }
  // (the words before the first link: inside the segment, under no link's rectangle, left of the first)
  const under = w => linkTexts.some(l => l.page === w.page && w.x1 > l.rect[0] && w.x0 < l.rect[2])
  const lead = linkTexts.length ? words.filter(w => !under(w) && w.x1 <= linkTexts[0].rect[0] + 0.5) : []
  const word = lead.length === 1 ? (/^(\p{L}+\.?)$/u.exec(lead[0].t.normalize('NFKC').replace(/^[^\p{L}]+/u, '').replace(/[^\p{L}.]+$/u, ''))?.[1] ?? '') : ''
  if (lead.length > 1) why ??= `more than one word before its link: ${JSON.stringify(lead.map(w => w.t))}`
  else if (lead.length === 1 && /\p{L}/u.test(lead[0].t) && !EXPECTED.has(word.toLowerCase())) why ??= `the word before its link, ${JSON.stringify(lead[0].t)}, no reference's name`
  if (why) fail(why)
  else rows.push({ unit: i, k, ok: true, reads: R, word, links: linkTexts.map(l => l.t) })
}
await task.destroy()
if (args.includes('--json')) console.log(JSON.stringify({ placed: placed.length, failures, rows }))
else {
  for (const row of rows) console.log(`${row.ok ? 'ok  ' : 'FAIL'} u${row.unit}.${row.k} ${row.ok ? `${row.reads} (word ${row.word || '-'}, links ${row.links.join('|')})` : row.why}`)
  console.log(`${placed.length} placed, ${failures} failing`)
}
process.exit(failures ? 1 : 0)
