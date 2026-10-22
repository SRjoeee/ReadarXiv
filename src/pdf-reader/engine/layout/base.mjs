// Our compile as the base page (the layer route's step 2, design note §3.1 and §3.3): the checks a base page of ours passes
// before a layer is drawn over it, each a pure function over PDF.js documents (or their text) that the caller opens and
// destroys. The base page is the final pass of the marked original (layout/paper.mjs markedOfPaper `base`): the files the
// guard accepted with graphicx's draft option taken out, one TeX pass over the aux and lists the draft compile wrote.
//  - finalCheck: the final pass placed every mark where the draft did (its `axt-` destinations by name, page and position,
//    within MARK_TOL), on as many pages of the same boxes: the marks are read from the draft, the ink from the final pass, so
//    that the two must be one page;
//  - boxesCheck: every page of ours has arXiv's box, and there are as many (the reader's identity map between the left pane,
//    arXiv's PDF, and the right, ours);
//  - markTextOf: no mark of ours is printed as text (a mark macro inside \url sets its own name as characters: 2610.19860's
//    `\axt@pma{p176.4a}`), which a reader would see on the base page; the units its names name
//  - creationEpochOf / pdfDateEpoch: arXiv's PDF's /CreationDate as SOURCE_DATE_EPOCH, so that \today in our compiles is
//    the day arXiv's was made.
// An original module (no port statement). It imports the memory-class test alone: a host's PDF.js documents are read through
// their own methods.
import { isMemoryError } from '../pipeline/memory.mjs'

/** a mark's place in two compiles of one page is the same within this, PDF units (the design's 0.01 pt) */
export const MARK_TOL = 0.01
/** a page box's corner in two PDFs is the same within this, PDF units */
export const BOX_TOL = 0.01
/** the marks' destinations' prefix (marks.mjs MARK_DEF's \pdfdest names) */
const PREFIX = 'axt-'

/** a destination's page number (1-based), looked up once by its reference; null where it names none */
function pagesOf(doc) {
  const seen = new Map()
  return async ref => {
    if (Number.isInteger(ref)) return ref + 1
    const key = ref && typeof ref === 'object' ? `${ref.num}R${ref.gen}` : null
    if (key === null) return null
    if (!seen.has(key)) seen.set(key, doc.getPageIndex(ref).then(i => i + 1, e => { if (isMemoryError(e)) throw e; return null }))
    return seen.get(key)
  }
}

/** a document's `axt-` destinations: name → [page, x, y] (x and y as the destination gives them, null where it names none) */
export async function marksOfPdf(doc) {
  const dests = await doc.getDestinations()
  const pageOf = pagesOf(doc), out = new Map()
  for (const [name, d] of dests instanceof Map ? dests : Object.entries(dests ?? {})) {
    if (!name.startsWith(PREFIX) || !Array.isArray(d)) continue
    out.set(name, [await pageOf(d[0]), typeof d[2] === 'number' ? d[2] : null, typeof d[3] === 'number' ? d[3] : null])
  }
  return out
}

/** each page's box as PDF.js reads it, [x0, y0, x1, y1, rotate, userUnit] (its view: the CropBox within the MediaBox) */
export async function boxesOfPdf(doc) {
  const out = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const v = page.view ?? []
    out.push([v[0], v[1], v[2], v[3], page.rotate ?? 0, page.userUnit ?? 1])
  }
  return out
}

/** the first page whose box differs between two lists of boxesOfPdf's, its why; null where they are the same, page for page */
function boxesDiffer(a, b, what) {
  if (a.length !== b.length) return `${what[0]} has ${a.length} pages, ${what[1]} ${b.length}`
  for (let p = 0; p < a.length; p++) {
    const x = a[p], y = b[p]
    const off = [0, 1, 2, 3].some(i => !(Math.abs(x[i] - y[i]) < BOX_TOL)) || x[4] !== y[4] || x[5] !== y[5]
    if (off) return `page ${p + 1}'s box is [${x.slice(0, 4).join(' ')}] in ${what[0]}, [${y.slice(0, 4).join(' ')}] in ${what[1]}${x[4] !== y[4] ? ` (rotated ${x[4]} and ${y[4]})` : ''}`
  }
  return null
}

/**
 * The final pass against the draft it was made of (design §3.1, the exact check): { ok: true, marks } with the count of
 * `axt-` destinations, where both have the same pages and boxes and the same destinations, each on the same page within
 * MARK_TOL of the same place; else { ok: false, why }. `draft`, `final`: PDF.js documents of the two
 */
export async function finalCheck(draft, final) {
  const boxes = boxesDiffer(await boxesOfPdf(draft), await boxesOfPdf(final), ['the draft', 'the final pass'])
  if (boxes) return { ok: false, why: boxes }
  const a = await marksOfPdf(draft), b = await marksOfPdf(final)
  if (a.size !== b.size) return { ok: false, why: `the draft has ${a.size} marks, the final pass ${b.size}` }
  for (const [name, p] of a) {
    const q = b.get(name)
    if (!q) return { ok: false, why: `the final pass has no mark ${name.slice(PREFIX.length)}` }
    if (p[0] !== q[0]) return { ok: false, why: `the mark ${name.slice(PREFIX.length)} is on page ${p[0]} in the draft, ${q[0]} in the final pass` }
    for (const i of [1, 2]) {
      if (p[i] === null && q[i] === null) continue
      if (p[i] === null || q[i] === null || !(Math.abs(p[i] - q[i]) < MARK_TOL)) return { ok: false, why: `the mark ${name.slice(PREFIX.length)} moved from (${p[1]}, ${p[2]}) to (${q[1]}, ${q[2]}) on page ${p[0]}` }
    }
  }
  return { ok: true, marks: a.size }
}

/**
 * Our base page against arXiv's PDF (design §3.3.4): { equal: true, pages } where both have the same page count and every
 * page the same box (BOX_TOL, its rotation and unit too), else { equal: false, pages: [ours, arXiv's], why }. `ours`, `arxiv`:
 * PDF.js documents
 */
export async function boxesCheck(ours, arxiv) {
  const a = await boxesOfPdf(ours), b = await boxesOfPdf(arxiv)
  const why = boxesDiffer(a, b, ['ours', 'arXiv\'s PDF'])
  return why === null ? { equal: true, pages: [a.length, b.length] } : { equal: false, pages: [a.length, b.length], why }
}

/** a mark of ours printed as text: a mark macro's name (\axt…, or TeX's \axt@… inside a package's own) */
const MARK_TEXT = /\\axt|axt@/
/** whether a text holds a mark of ours printed (MARK_TEXT) */
export const hasMarkText = text => typeof text === 'string' && MARK_TEXT.test(text)
/** a mark's name inside it, `{name}`, and the unit a name is of: a unit's own mark ([th]?<id>[se]) or a piece's (p<id>.<k>[ab],
 *  a footnote's n<id>.<k>[ab]); a babel name's occurrence (n<occ>.<key>.[se]) and a figure frame's (g<n>[abt]) name none */
const NAMES = /\{([^{}\s]{1,64})\}/g
const UNIT_NAME = /^(?:[th]?(\d+)[se]|[pn](\d+)\.\d+[ab])$/
/** the hits kept at most, for the why */
const SAMPLES = 4

/**
 * Mark text in a PDF's text (design §3.3.2): `pages`, each page's text (its text items' strings joined, as PDF.js gives them),
 * in page order. Gives { pages, units, samples }: the pages whose text holds a mark of ours (MARK_TEXT), the units the names
 * printed there name (a mark inside the unit's own source: leaving the unit unmarked takes it away), and the first SAMPLES hits
 * ([page, text]); no page where none does
 */
export function markTextOf(pages) {
  const hit = [], units = new Set(), samples = []
  ;(pages ?? []).forEach((text, i) => {
    if (typeof text !== 'string' || !MARK_TEXT.test(text)) return
    hit.push(i + 1)
    for (const m of text.matchAll(/(?:\\axt|axt@)[^\s{}]*(?:\{[^{}\s]{1,64}\})?/g)) {
      if (samples.length < SAMPLES) samples.push([i + 1, m[0].slice(0, 80)])
      for (const n of m[0].matchAll(NAMES)) {
        const u = UNIT_NAME.exec(n[1])
        if (u) units.add(Number(u[1] ?? u[2]))
      }
    }
  })
  return { pages: hit, units, samples }
}

/** a page's text as markTextOf reads it: its text items' strings, in their order, each item's own (no space between: a mark's
 *  name set in one face is one item or several, never split by a space PDF.js adds) */
export const pageTextOf = tc => (Array.isArray(tc?.items) ? tc.items.map(it => (typeof it?.str === 'string' ? it.str : '')).join('') : '')

/** the text of every page of a PDF.js document, as markTextOf reads it: a page that cannot be read has none */
export async function textOfPdf(doc) {
  const out = []
  for (let p = 1; p <= doc.numPages; p++) {
    let text = ''
    try { text = pageTextOf(await (await doc.getPage(p)).getTextContent()) } catch (e) { if (isMemoryError(e)) throw e; text = '' }
    out.push(text)
  }
  return out
}

/**
 * A PDF date (`D:YYYYMMDDHHmmSSOHH'mm'`, every part after the year optional, PDF 32000-1 §7.9.4) as seconds since the epoch,
 * the offset applied (Z or none: UTC); null for what is not one. What SOURCE_DATE_EPOCH takes
 */
export function pdfDateEpoch(s) {
  if (typeof s !== 'string') return null
  const m = /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:([Z+-])(?:(\d{2})'?(?:(\d{2})'?)?)?)?$/.exec(s.trim())
  if (!m) return null
  const [y, mo = '01', d = '01', h = '00', mi = '00', se = '00'] = m.slice(1, 7).map(v => v ?? undefined)
  const n = [y, mo, d, h, mi, se].map(Number)
  if (n[1] < 1 || n[1] > 12 || n[2] < 1 || n[2] > 31 || n[3] > 23 || n[4] > 59 || n[5] > 59) return null
  let t = Date.UTC(n[0], n[1] - 1, n[2], n[3], n[4], n[5])
  if (m[7] === '+' || m[7] === '-') t -= (m[7] === '+' ? 1 : -1) * (Number(m[8] ?? 0) * 60 + Number(m[9] ?? 0)) * 60_000
  const sec = Math.floor(t / 1000)
  return Number.isSafeInteger(sec) && sec >= 0 ? sec : null
}

/** a PDF.js document's /CreationDate (its Info dictionary's) as seconds since the epoch (pdfDateEpoch), null where it has none */
export async function creationEpochOf(doc) {
  let info = null
  try { info = (await doc.getMetadata())?.info ?? null } catch (e) { if (isMemoryError(e)) throw e; info = null }
  return pdfDateEpoch(info?.CreationDate ?? null)
}
