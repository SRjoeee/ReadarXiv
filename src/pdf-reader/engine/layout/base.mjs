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
//  - creationEpochOf / pdfDateEpoch / xmpDateEpoch: arXiv's PDF's day as SOURCE_DATE_EPOCH, so that \today in our compiles is
//    the day arXiv's was made: its /CreationDate, else its XMP's (arXiv's PDFs of 2026, rewritten by pikepdf, carry no Info
//    date, their XMP the time of the rewrite).
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

/**
 * Our base page's M pages followed by arXiv's pages past them, as one PDF.js document (`numPages` arXiv's N): the composed
 * document a delta over arXiv's PDF makes of a paper of several toplevel sources whose first is compiled alone (the pages past
 * ours are the original's by construction), for the base page's checks and the maker to read as they read a whole base. Its
 * destinations, page indices and metadata are ours (the marks are our compile's)
 */
export function prefixDoc(ours, arxiv, m) {
  return {
    numPages: arxiv.numPages,
    getPage: p => (p <= m ? ours.getPage(p) : arxiv.getPage(p)),
    getDestinations: () => ours.getDestinations(),
    getPageIndex: ref => ours.getPageIndex(ref),
    getMetadata: () => ours.getMetadata(),
  }
}

/** a mark of ours printed as text: a mark macro's name (\axt…, or TeX's \axt@… inside a package's own) */
const MARK_TEXT = /(?:\\|\u201c)axt@?[a-z]+\s*(?:\{|\u2013)[^{}\u2013\u02dd\s]{1,64}(?:\}|\u02dd)/
/** the same, each mark's name (its argument) captured */
const MARKS_TEXT = /(?:\\|\u201c)axt@?[a-z]+\s*(?:\{|\u2013)([^{}\u2013\u02dd\s]{1,64})(?:\}|\u02dd)/g
/** whether a text holds a mark of ours printed (MARK_TEXT) */
export const hasMarkText = text => typeof text === 'string' && MARK_TEXT.test(text)
/** the unit a mark's name is of: a unit's own mark ([th]?<id>[se]) or a piece's (p<id>.<k>[ab], a footnote's n<id>.<k>[ab]); a
 *  babel name's occurrence (n<occ>.<key>.[se]) and a figure frame's (g<n>[abt]) name none */
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
  return marksIn(pages, () => true)
}

/** markTextOf over `pages`, each hit kept where `keep(page, hit)` */
function marksIn(pages, keep) {
  const hit = [], units = new Set(), samples = []
  ;(pages ?? []).forEach((text, i) => {
    if (typeof text !== 'string' || !MARK_TEXT.test(text)) return
    let any = false
    for (const m of text.matchAll(MARKS_TEXT)) {
      if (!keep(i + 1, m[0])) continue
      any = true
      if (samples.length < SAMPLES) samples.push([i + 1, m[0].slice(0, 80)])
      const u = UNIT_NAME.exec(m[1])
      if (u) units.add(Number(u[1] ?? u[2]))
    }
    if (any) hit.push(i + 1)
  })
  return { pages: hit, units, samples }
}

/**
 * The mark text on our pages (`ours`, each page's text) that arXiv's same page (`theirs`) does not hold: a paper that prints
 * what looks like a mark of ours, as its own text, prints it on arXiv's page too, and is no mark of ours. markTextOf's shape
 */
export function markTextBeyond(ours, theirs) {
  return marksIn(ours, (page, hit) => !(typeof theirs?.[page - 1] === 'string' && theirs[page - 1].includes(hit)))
}

/** a page's text as markTextOf reads it, page p of a PDF.js document; none where it cannot be read */
export async function pageTextAt(doc, p) {
  try { return pageTextOf(await (await doc.getPage(p)).getTextContent()) } catch (e) { if (isMemoryError(e)) throw e; return '' }
}

/**
 * The host's contract for a `latex` compile's driver (dvipdfmx, a step of the compile's own): after TeX's log, a line that is
 * DRIVER_OUTPUT_MARK alone, then the driver's terminal output; where the host's bound (generous: 4 MiB) cuts it, a line that is
 * DRIVER_OUTPUT_TRUNCATED alone after what it kept. Each a whole line, matched as one
 */
export const DRIVER_OUTPUT_MARK = 'axt-runner: dvipdfmx output'
export const DRIVER_OUTPUT_TRUNCATED = 'axt-runner: dvipdfmx output truncated'
const linesOf = log => (typeof log === 'string' ? log.split(/\r?\n/) : [])
/** whether a log holds the driver's output: a line that is DRIVER_OUTPUT_MARK */
export const driverOutputGiven = log => linesOf(log).includes(DRIVER_OUTPUT_MARK)
/** whether the driver's output a log holds was cut by the host: a line that is DRIVER_OUTPUT_TRUNCATED after the mark's */
export function driverOutputTruncated(log) {
  const lines = linesOf(log), at = lines.indexOf(DRIVER_OUTPUT_MARK)
  return at >= 0 && lines.indexOf(DRIVER_OUTPUT_TRUNCATED, at + 1) > at
}

/** what dvipdfmx says of a special it could not interpret: the failure, then where and what (`>> at page=…`, `>> xxx "…"`) */
const DRIVER_FAILED = /^dvipdfmx:warning: Interpreting special command .* failed\.\s*$/
const DRIVER_AT = /^dvipdfmx:warning: >> at page="(\d+)"/
const DRIVER_XXX = /^dvipdfmx:warning: >> xxx "(.*)"\s*$/
const DRIVER_IMAGE = /^dvipdfmx:warning: (Image inclusion failed for .*?)\s*$/
/** hyperref's dvips driver's specials (`ps:SDict begin …`: its links, anchors, outlines and the document's info, pdfmarks that
 *  set no ink), which dvipdfmx cannot interpret and loses nothing of the page by */
const DRIVER_NO_INK = /^ps:\s*SDict\s+begin\b/
/**
 * What dvipdfmx said it could not draw, in a log that holds its terminal (a `latex` compile's: the DVI drawn by dvipdfmx, where
 * arXiv's PDF is drawn by dvips and ps2pdf, which draw it): each special it could not interpret but hyperref's (DRIVER_NO_INK),
 * a PSTricks picture's or any PostScript of the page's, and each image it could not take in. { count, samples ([page or null,
 * text], the first SAMPLES) }; none in a log of another driver's (xdvipdfmx's own prefix) or of none
 */
export function driverLostInk(log) {
  const lines = typeof log === 'string' ? log.split(/\r?\n/) : [], samples = []
  let count = 0
  const lost = (page, text) => { count++; if (samples.length < SAMPLES) samples.push([page, text.slice(0, 60)]) }
  for (let i = 0; i < lines.length; i++) {
    const image = DRIVER_IMAGE.exec(lines[i])
    if (image) { lost(null, image[1]); continue }
    if (!DRIVER_FAILED.test(lines[i])) continue
    let page = null, what = null
    for (let j = i + 1; j < Math.min(lines.length, i + 5) && what === null; j++) {
      const at = DRIVER_AT.exec(lines[j]), xxx = DRIVER_XXX.exec(lines[j])
      if (at) page = Number(at[1])
      if (xxx) what = xxx[1]
    }
    if (what !== null && DRIVER_NO_INK.test(what)) continue
    lost(page, what ?? 'a special')
  }
  return { count, samples }
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

/**
 * An XMP date (ISO 8601 as XMP writes it: YYYY, YYYY-MM, YYYY-MM-DD, then THH:MM, :SS and a fraction, and Z or ±HH:MM) as
 * seconds since the epoch, the offset applied and a fraction of a second dropped; null where it is not one
 */
export function xmpDateEpoch(s) {
  if (typeof s !== 'string') return null
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/.exec(s.trim())
  if (!m) return null
  const n = [m[1], m[2] ?? '01', m[3] ?? '01', m[4] ?? '00', m[5] ?? '00', m[6] ?? '00'].map(Number)
  if (n[1] < 1 || n[1] > 12 || n[2] < 1 || n[2] > 31 || n[3] > 23 || n[4] > 59 || n[5] > 59) return null
  let t = Date.UTC(n[0], n[1] - 1, n[2], n[3], n[4], n[5])
  if (m[7] && m[7] !== 'Z') t -= (m[7][0] === '+' ? 1 : -1) * (Number(m[7].slice(1, 3)) * 60 + Number(m[7].slice(4, 6))) * 60_000
  const sec = Math.floor(t / 1000)
  return Number.isSafeInteger(sec) && sec >= 0 ? sec : null
}

/** an XMP packet's xmp:CreateDate and xmp:MetadataDate (xap, the old prefix, too), each as an attribute or an element, as
 *  seconds since the epoch (xmpDateEpoch); null each where the packet has none */
export function xmpDatesOf(raw) {
  const of = name => {
    if (typeof raw !== 'string') return null
    const m = new RegExp(`\\b(?:xmp|xap):${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')|<(?:xmp|xap):${name}>([^<]*)</(?:xmp|xap):${name}>`).exec(raw)
    return m ? xmpDateEpoch(m[1] ?? m[2] ?? m[3]) : null
  }
  return { create: of('CreateDate'), metadata: of('MetadataDate') }
}

/**
 * A PDF.js document's day, as seconds since the epoch: its Info dictionary's /CreationDate (pdfDateEpoch), else its XMP
 * packet's xmp:CreateDate, else its xmp:MetadataDate (arXiv's PDFs of 2026, rewritten by pikepdf, carry neither of the first
 * two: the rewrite's time, the compile's day); null where it has none of them
 */
export async function creationEpochOf(doc) {
  let meta = null
  try { meta = await doc.getMetadata() } catch (e) { if (isMemoryError(e)) throw e; meta = null }
  const info = pdfDateEpoch(meta?.info?.CreationDate ?? null)
  if (info !== null) return info
  let raw = null
  try { raw = meta?.metadata?.getRaw?.() ?? null } catch (e) { if (isMemoryError(e)) throw e; raw = null }
  const xmp = xmpDatesOf(raw)
  return xmp.create ?? xmp.metadata
}
