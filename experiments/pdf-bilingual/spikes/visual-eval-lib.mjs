// experiments/pdf-bilingual/spikes/visual-eval-lib.mjs
// The visual evaluation's corpus, parameters and checks (plans/2026-09-27-geometry-lock-visual-eval-design.md): the
// locked column's suspicious pages and the catalog's entries. Pure: no files, no TeX.
export const LANGS = ['zh', 'ja', 'ko', 'de', 'ru']
/** unit leading and its floor, × the font size, per writing system */
export const PARAMS = { zh: { em: 1.3, min: 1.1 }, ja: { em: 1.2, min: 1.05 }, ko: { em: 1.2, min: 1.05 }, de: { em: 1.05, min: 1 }, ru: { em: 1.05, min: 1 } }
const GATE = ['2608.02163', '2608.05876', '2608.09746', '2608.12333', '2608.18090', '2608.23393', '2608.26528', '2608.29867', '2608.06701', '2608.15016', '2608.25750', '2608.06233', '2608.20847', '2608.23586', '2608.06007', '2608.24839', '2608.02785', '2608.24503', '2608.21180', '2608.15761', '2608.25928', '2608.09038', '2608.02991', '2608.12606']
const EIGHT = ['2608.05876', '2608.18090', '2608.06701', '2608.24839', '2608.02785', '2608.21180', '2608.15761', '2608.06233']
export const PAPERS = { zh: ['2212.06817', ...GATE], ja: EIGHT, ko: EIGHT, de: EIGHT, ru: EIGHT }
/** Active review columns, in keyboard order. Source keys stay stable for saved PDFs and flags. */
export const COLUMNS = [{ key: 'original', label: 'Original' }, { key: 'fit', label: 'FIT' }, { key: 'generic', label: 'Generic' }, { key: 'flow', label: 'Flow, first' }, { key: 'flow46fp8', label: 'Flow' }, { key: 'lockh', label: 'Locked (H rules)' }, { key: 'h', label: 'H' }]
/** the fit (lock.mjs fitLeads): the paper's factor on its leading held within [lo, hi] and each unit's own within
 *  1 ± band of it; a script that grows (the alphabets) is first set smaller, to minSize at most */
export const FIT = { cjk: { lo: 0.9, hi: 1.25, band: 0.08 }, alphabet: { lo: 0.95, hi: 1.1, band: 0.08 }, minSize: 0.93 }
/** the smallest a unit is set at in the "Locked, smaller type" column, × its size (the owner took 0.9, 2026-09-28) */
/** Locked by service H's rules (the owner, 2026-09-28): a block still taller than its original's box set smaller down
 *  to H's floor, aiming a little inside the box (a unit 3 pt over at a column's foot moved on whole and set the next
 *  page low: 2608.15761 in German), CJK text tracked as H tracks it */
export const H_RULES = { min: 0.6, margin: 0.02, track: 0.03 }
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
    pages: Object.fromEntries(COLUMNS.filter(c => index.columns.some(x => x.key === c.key)).map(c => [c.key, index.columns.find(x => x.key === c.key).pages ?? null])),
    lockh: index.numbers?.lockh ?? null, fit: index.numbers?.fit ?? null, generic: index.numbers?.generic ?? null, flow: index.numbers?.flow ?? null, flow46fp8: index.numbers?.flow46fp8 ?? null,
    failed: Object.fromEntries(COLUMNS.filter(c => index.failed?.[c.key]).map(c => [c.key, index.failed[c.key]])), flags: index.flags ?? [], untranslated: index.translation?.untranslated ?? 0,
  }
}
