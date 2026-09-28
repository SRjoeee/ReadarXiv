// experiments/pdf-bilingual/spikes/visual-eval-lib.mjs
// The visual evaluation's corpus, parameters and checks (plans/2026-09-27-geometry-lock-visual-eval-design.md): the
// locked column's suspicious pages and the catalog's entries. Pure: no files, no TeX.
export const LANGS = ['zh', 'ja', 'ko', 'de', 'ru']
/** unit leading and its floor, × the font size, per writing system */
export const PARAMS = { zh: { em: 1.3, min: 1.1 }, ja: { em: 1.2, min: 1.05 }, ko: { em: 1.2, min: 1.05 }, de: { em: 1.05, min: 1 }, ru: { em: 1.05, min: 1 } }
const GATE = ['2608.02163', '2608.05876', '2608.09746', '2608.12333', '2608.18090', '2608.23393', '2608.26528', '2608.29867', '2608.06701', '2608.15016', '2608.25750', '2608.06233', '2608.20847', '2608.23586', '2608.06007', '2608.24839', '2608.02785', '2608.24503', '2608.21180', '2608.15761', '2608.25928', '2608.09038', '2608.02991', '2608.12606']
const EIGHT = ['2608.05876', '2608.18090', '2608.06701', '2608.24839', '2608.02785', '2608.21180', '2608.15761', '2608.06233']
export const PAPERS = { zh: ['2212.06817', ...GATE], ja: EIGHT, ko: EIGHT, de: EIGHT, ru: EIGHT }
/** the page's columns, in the order of their number keys; `before` is Today as it was until 2026-09-28 (the whole
 *  document's CJK \\linespread, no English hyphenation), kept beside the fixed one for the owner, shown when its PDF
 *  is there */
export const COLUMNS = [{ key: 'original', label: 'Original' }, { key: 'today', label: 'Today' }, { key: 'locked', label: 'Locked' }, { key: 'h', label: 'H' }, { key: 'before', label: 'Today before 09-28' }]
/** a sync point's inserted space worth a look: about two lines */
export const GAP_PT = 24

/** the locked column's pages worth a look, one entry per page and kind, in page order (pages 1-based) */
export function suspiciousPages({ events, leads, min, lockedMarks, lockedCompare }) {
  const out = []
  for (const b of events.breaks) out.push({ page: b.page, kind: 'forced break', detail: 'a sync point ended the column or page here' })
  for (const g of events.gaps) if (g.pt > GAP_PT) out.push({ page: g.page, kind: 'large gap', detail: `${Math.round(g.pt)} pt inserted` })
  for (const [i, f] of leads) {
    const m = lockedMarks.marks.get(`${i}s`)
    if (m && f <= min + 0.02) out.push({ page: m.page + 1, kind: 'tight leading', detail: `unit ${i} at ${f.toFixed(2)} × the font size` })
  }
  for (const r of lockedCompare.offPage) out.push({ page: r.page + 1, kind: 'drift', detail: `unit ${r.i} is here, on page ${r.origPage + 1} in the original` })
  const seen = new Set()
  return out.filter(x => { const k = `${x.page} ${x.kind}`; if (seen.has(k)) return false; seen.add(k); return true }).sort((a, b) => a.page - b.page || a.kind.localeCompare(b.kind))
}

/** overfull vertical boxes in a TeX log: content taller than its page or column */
export const overfullCount = log => (log.match(/^Overfull \\vbox/gm) ?? []).length

/** a paper's line in the catalog: page counts per column, the two compiles' numbers, what failed */
export function catalogEntry(index) {
  return {
    paper: index.paper, cls: index.cls,
    pages: Object.fromEntries(index.columns.map(c => [c.key, c.pages ?? null])),
    today: index.numbers?.today ?? null, locked: index.numbers?.locked ?? null,
    failed: index.failed ?? {}, flags: index.flags ?? [], untranslated: index.translation?.untranslated ?? 0,
  }
}
