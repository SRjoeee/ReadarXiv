// How close a compile's layout is to the original's, in the terms the owner judges by (plans/2026-09-30-generic-type.md):
// pages; drift — where each unit starts in reading order, as page, column and height down the text block, against
// where the original starts it, in columns (one column is half a page in two columns, a page in one); block size — a unit's
// height over its original's, where both lie within one column. From unit marks (lock.mjs marksOf). A unit the
// original has and the compile lacks is counted as missing, not dropped.
const q = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.round(p * (s.length - 1))] }
const column = (m, at) => (m.twoColumn && at.x >= m.width / 2 ? 1 : 0)
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
/** a place in reading order, in columns: the columns before it, and its height down its text block */
const place = (m, at, block) => { const b = block(at.page); return at.page * (m.twoColumn ? 2 : 1) + column(m, at) + Math.min(1, Math.max(0, (b.top - at.y) / (b.top - b.bottom))) }

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
    if (!oe || !te || o.page !== oe.page || t.page !== te.page || column(om, o) !== column(om, oe) || column(tm, t) !== column(tm, te)) continue
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

/** how even the type of translated paragraphs is: the spread (standard deviation over mean) of each paragraph's leading
 *  as a multiple of its size, over paragraphs of three lines or more; `lines` readLines of the compile's log */
export function uniformity(lines, units) {
  const f = []
  for (const [i, l] of lines) if (units[i]?.kind === 'para' && l.lines >= 3 && l.size) f.push(l.bs / l.size)
  if (!f.length) return { n: 0, spread: null }
  const mean = f.reduce((a, b) => a + b, 0) / f.length
  return { n: f.length, mean, spread: Math.sqrt(f.reduce((a, b) => a + (b - mean) ** 2, 0) / f.length) / mean }
}
