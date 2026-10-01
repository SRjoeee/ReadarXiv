// Where a compile sets each unit against where the original does (records/typesetting.md in experiments/pdf-bilingual):
// pages; drift — where each unit starts in reading order, as page, column and height down the text block, against
// where the original starts it, in columns (one column is half a page in two columns, a page in one); block size — a
// unit's height over its original's, where both lie within one column. From unit marks (marksOf). A unit the original
// has and the compile lacks is counted as missing, not dropped. Each page's columns are what its own compile set it in
// (marksOf), so a paper whose body is in two columns and its appendix in one is read page by page in either document.
const q = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.round(p * (s.length - 1))] }
/** the column a place is in on its page: the right one of a page set in two columns, past the page's middle */
export const columnOf = (m, at) => (m.columns[at.page] === 2 && at.x >= m.width / 2 ? 1 : 0)
// the columns before each page, a page with no reading counted as one
const firsts = new WeakMap()
const columnsBefore = m => {
  if (!firsts.has(m)) { let n = 0; firsts.set(m, Array.from({ length: m.pages + 1 }, (_, p) => { const at = n; n += m.columns[p] === 2 ? 2 : 1; return at })) }
  return firsts.get(m)
}
/** each page's text block, from the original's marks: its highest and its lowest; a page with too few marks to tell, or
 *  one the original does not have, takes the median block. Heights are measured in it, so that a column's foot and the
 *  next column's top stand next to each other, as a reader meets them, whatever the margins and a title block take */
function blocks(om) {
  const byPage = new Map()
  for (const m of om.marks.values()) { const b = byPage.get(m.page) ?? { top: -Infinity, bottom: Infinity }; b.top = Math.max(b.top, m.y); b.bottom = Math.min(b.bottom, m.y); byPage.set(m.page, b) }
  const tall = [...byPage.values()].filter(b => b.top - b.bottom >= 100)
  const fallback = tall.length ? { top: q(tall.map(b => b.top), 0.5), bottom: q(tall.map(b => b.bottom), 0.5) } : { top: om.height, bottom: 0 }
  return page => { const b = byPage.get(page); return b && b.top - b.bottom >= 100 ? b : fallback }
}
/** a place in reading order, in columns: the columns before it, and its height down its text block — held within the
 *  block for the metric, as it may not be for a correction (drifts) */
const place = (m, at, block, held = true) => { const b = block(at.page), f = (b.top - at.y) / (b.top - b.bottom); return columnsBefore(m)[at.page] + columnOf(m, at) + (held ? Math.min(1, Math.max(0, f)) : f) }

export function alignment(om, tm) {
  const block = blocks(om)
  const starts = [...om.marks.keys()].filter(k => k.endsWith('s'))
  const drift = [], size = []
  let matched = 0
  for (const k of starts) {
    const o = om.marks.get(k), t = tm.marks.get(k)
    if (!t) continue
    matched++
    drift.push(Math.abs(place(tm, t, block) - place(om, o, block)))
    const oe = om.marks.get(k.replace(/s$/, 'e')), te = tm.marks.get(k.replace(/s$/, 'e'))
    if (!oe || !te || o.page !== oe.page || t.page !== te.page || columnOf(om, o) !== columnOf(om, oe) || columnOf(tm, t) !== columnOf(tm, te)) continue
    const ho = o.y - oe.y, ht = t.y - te.y
    if (ho >= 20 && ht > 0) size.push(ht / ho)
  }
  const share = (xs, ok) => (xs.length ? xs.filter(ok).length / xs.length : null)
  return {
    pages: tm.pages - om.pages, matched, missing: starts.length - matched,
    drift: { values: drift, median: q(drift, 0.5), p90: q(drift, 0.9), within: share(drift, d => d <= 0.1 + 1e-9) },
    size: { values: size, median: q(size, 0.5), p10: q(size, 0.1), p90: q(size, 0.9), within: share(size, r => Math.abs(r - 1) <= 0.15 + 1e-9) },
  }
}

/** each unit's start against the original's, signed (a later start positive), in points of the original's text block
 *  on the unit's page (TeX points, as a compile's heights are): what a translation's final setting corrects from the
 *  preview it measured (flow.mjs flowType `measured`). Not held within the block: a start above the
 *  original's highest mark on its page is ahead by that much (Korean 2608.21180's abstract, 56 pt, which the metric's
 *  clamp read as level). Units the compile lacks are left out */
export function drifts(om, tm) {
  const block = blocks(om), out = new Map()
  for (const [k, o] of om.marks) {
    if (!k.endsWith('s')) continue
    const t = tm.marks.get(k)
    if (!t) continue
    const b = block(o.page)
    out.set(Number(k.slice(0, -1)), ((place(tm, t, block, false) - place(om, o, block, false)) * (b.top - b.bottom) * 72.27) / 72)
  }
  return out
}

/**
 * Every unit's start and end mark — the axt-<n>s / axt-<n>e destinations MARK_DEF writes (page 0-based, PDF points) —
 * from a PDF.js document, the reader's or pdfjs-dist's; the page's width and height; and each page's columns, 1 or 2,
 * as MARK_DEF's axt-c<n>-<k> on the page says its compile set it, 0 where the page has none (a compile without
 * LaTeX's shipout hooks: places.mjs then counts the page as one column, and the rule takes no plan from it, plan.mjs).
 * Read from TeX, not judged from the marks: a page's starts in its right half are no measure of its columns — a run-in
 * label or a centred caption puts a start there on a one-column page (Chinese 2608.02991, three of six starts on nine
 * pages), and a right column of one paragraph or one float puts none there (2608.06233's fifth page)
 */
export async function marksOf(pdf) {
  const dests = await pdf.getDestinations()
  const marks = new Map(), columns = new Array(pdf.numPages).fill(0)
  for (const [name, d] of dests instanceof Map ? dests : Object.entries(dests)) {
    if (!d) continue
    if (/^axt-\d+[se]$/.test(name)) marks.set(name.slice(4), { page: await pdf.getPageIndex(d[0]), x: d[2], y: d[3] })
    else { const c = /^axt-c([12])-\d+$/.exec(name); if (c) columns[await pdf.getPageIndex(d[0])] = Number(c[1]) }
  }
  const [x0, y0, x1, y1] = (await pdf.getPage(1)).view
  return { pages: pdf.numPages, width: x1 - x0, height: y1 - y0, columns, marks }
}
