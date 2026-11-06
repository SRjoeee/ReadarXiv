// wrapFinal: our final pass read, owned and wrapped (layout/wrap.mjs's, split from it when wrapOf and planOf moved into the
// engine package, stage 1a of the rebuild). Today's: it owns our final pass's ink by its marks (own.mjs), cuts the figure units
// (figure-text.mjs) and the ink units (ink-units.mjs), and wraps the pages by the package's wrapOf.
import { alignOf, BOXES_PAGE, GLYPHS_PAGE, isMemoryError, pageInk, planOf, rangesOf, UNHIDDEN_MAX, wrapOf } from '@readarxiv/engine'
import { FIGURE_WHYS, figureUnitsOf } from './figure-text.mjs'
import { claimInk, inkOff, inkUnitsOf, keptUnitsOf } from './ink-units.mjs'
import { inkLeft, ledgerOf, ledgerSummary } from './ledger.mjs'
import { followsOf } from './marks.mjs'
import { ownOf, UNHIDDEN } from './own.mjs'

/**
 * Our final pass read, owned and wrapped: the maker child's one call, before any document of its own is open (its delta is then
 * built from the bytes this returns, and the page pass given them). `finalBytes` our final pass; `units` the paper's units (their
 * ids their indices, the SOURCE units — pipeline/live.mjs openPaper's `units`, layerOfPaper's `source.units`, each { kind, pieces:
 * [{ t: 'text', s } | { t: 'ph', src } | …] }, never a translation's (a record's, whose text pieces are `tr`: a TypeError): own.mjs
 * spells each against its `src` where it has one, else its pieces' plain source text, and the marking's `follows` is made of
 * them and the points read, unless `follows` is given, or null for none); `getDocument` and `documentOptions` the engine's PDF.js and the host's options; `OPS`
 * its operator codes; `texts`, the marks file's `marking.texts` (flat [macro source, text, …], or a Map; null: only a text
 * symbol's text is known, own.mjs's cell leads); `inkless`, the marks file's `marking.inkless` (the macros TeX said set no ink,
 * which own.mjs reads as no placeholder of ink, as the maker does; null: none known); `names`, the paper's theorem-like
 * environments' printed names (openPaper's `theoremNames`, source/paper-names.mjs), each a name a head's label may hold, as
 * "Theorem" is (own.mjs labelFormOf; null: the standard names alone); `PL`, `deflate`, `inflate` wrapOf's. Every page our compile marks is wrapped; one PDF.js reads past its
 * bounds (capped, timed out, its boxes merged, rotated) is left unwrapped, its units the original's. Returns { bytes, xref,
 * sha256, stats, unhidden, labelKept } — `stats` { wrapped, refusedPages, unhidden: { marks, across, spell, page, bounds }, split,
 * groups, labelKept } (integers, the head's: every unit counted), `unhidden` [[unit id, code of UNHIDDEN], …] ascending and
 * `labelKept` the unit ids whose label is left the original's ink, each of the units with a group in the document alone (a
 * unit with none is the original's: no reader can hide it), `pages` the pages wrapped as ranges (the host's delta must replace
 * every one: layerOfPaper refuses a delta that does not), `own` own.mjs's stats (the record's), `ledger` the content classes'
 * counts and first orphans (layout/ledger.mjs ledgerSummary: the head's base `ledger`), `ink` the ink units (layout/ink-units.mjs:
 * { base, units }, the page pass's `ours.ink`, opaque to the host; their ids from `inkFrom` on, the bundle's units before them:
 * the source units' and the paper's structural names', layer-proto/units.mjs bundleUnitsOf; `units.length` where it is not
 * given), `owned` own.mjs's whole result and `ledgerWhole` the ledger's
 * where `keepOwned` (the lab's); `figures` the figure units drawn and their counts (layout/figure-text.mjs: each its group in the
 * document; `figureUnits` every unit cut, with why, where `keepOwned`), none asked with `figures` false (the lab's A/B);
 * `bounds` { groupsPage, sequencesPage, groupsDoc } wrapOf's (tests) — or { refused (WRAP_WHYS), why }: the paper's
 * base is then arXiv's PDF. Never throws but a failed allocation
 */
/** a point as ownership reads it: its name in lower case, as every mark's name is written (marks.mjs MARK_NAME): a class that
 *  sets a title or a heading by \\uppercase (spconf's \\section, amsart's \\title) sets its marks' names in capitals with it,
 *  `/axt-H0E ri` (2610.20967v1, 2610.20581v1), the same mark at the same place */
const lowerPoint = x => (/[A-Z]/.test(x.name) ? { ...x, name: x.name.toLowerCase() } : x)

export async function wrapFinal(finalBytes, { PL, getDocument, documentOptions = {}, OPS, units, follows: given = undefined, texts, inkless, names: theoremNames, deflate, inflate, keepOwned = false, bounds = {}, figures: withFigureText = true, inkFrom = null }) {
  // (units required: null alone, said, asks for no spell check, the lab's pair whose source is not read; deflate and inflate
  // required, the written bytes read back)
  if (units === undefined) throw new TypeError('units: the paper\'s source units, or null said for no spell check')
  if (typeof deflate !== 'function' || typeof inflate !== 'function') throw new TypeError('deflate, inflate: functions of bytes (inflate(bytes, limit))')
  // (texts required, as units are: the marks file's `marking.texts` where the caller holds the marks, null said where it does not —
  // a caller that drops them where it has them would leave every cell's lead macro the original's, unseen)
  if (texts === undefined) throw new TypeError('texts: the marks file\'s marking.texts (flat [source, text, …] or a Map), or null said where the marks are not in hand')
  // (inkless required as texts are: a title that opens with \\boldmath, read as a placeholder of ink with no mark of its own,
  // kept its lead's JCAP header line and was the original's, 2609.20976v1 u0)
  if (inkless === undefined) throw new TypeError('inkless: the marks file\'s marking.inkless (the macros TeX said set no ink: an array or a Set), or null said where the marks are not in hand')
  // (names required as texts are: a host that drops them leaves every head of a name the paper defines ("Recall 7 (") the
  // original's ink in no group, its translation drawn over it where a figure's text takes it, 2501.14787v1 pp10-11)
  if (theoremNames === undefined || (theoremNames !== null && !(Array.isArray(theoremNames) && theoremNames.every(n => typeof n === 'string')))) throw new TypeError('names: the paper\'s theorem-like environments\' printed names (openPaper\'s theoremNames: an array of strings), or null said where the source is not read')
  // (the paper's SOURCE units: a translation's (a record's units, its text pieces `tr`) holds no text after a placeholder to
  // find its ink's end by, nor the source text the spell check reads)
  if (units !== null && (!Array.isArray(units) || units.some(u => u?.pieces?.some?.(p => p?.tr)))) throw new TypeError('units: the paper\'s source units (live.mjs openPaper\'s, layerOfPaper\'s `source.units`), not a translation\'s')
  // (the ink units' first id: the bundle's units before them, at least the source units')
  if (inkFrom !== null && !(Number.isInteger(inkFrom) && inkFrom >= (units?.length ?? 0))) throw new TypeError(`inkFrom: the bundle's units before the ink units (bundleUnitsOf(paper).length), at least units.length, or null (${String(inkFrom)})`)
  const inkBase = units ? inkFrom ?? units.length : 0
  // (each unit one the spell check can read: a source text or pieces; a hole, or an entry with neither, is no paper's units.
  // null alone asks for no spell check, the lab's pair whose source is not read)
  if (units !== null) for (let i = 0; i < units.length; i++) {
    const u = units[i]
    if (!u || typeof u !== 'object' || !(typeof u.src === 'string' || Array.isArray(u.pieces))) throw new TypeError(`units[${i}]: no source text and no pieces`)
  }
  let task = null
  const pages = [], facts = []
  try {
    task = getDocument({ ...documentOptions, data: finalBytes.slice() })
    const doc = await task.promise
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const ops = await page.getOperatorList()
      const ink = pageInk(OPS, ops, page.commonObjs, { rotate: page.rotate ?? 0, indices: true, turned: true, glyphsMax: GLYPHS_PAGE, boxesMax: BOXES_PAGE })
      const unread = ink.rotated || ink.capped || ink.timedOut || ink.degraded
      pages.push(unread ? { glyphs: [], turned: [], shapes: new Map(), pictures: [], figures: new Map(), boxes: [], paths: [], points: [], boxAt: [], regions: [], view: [...page.view] } : { regions: ink.regions, glyphs: ink.glyphs.map(g => ({ n: g.n, k: g.k, u: g.u, x0: g.x0, x1: g.x1, ix0: g.ix0, ix1: g.ix1, y: g.y, size: g.size, top: g.top, bottom: g.bottom, font: g.font, fill: g.fill, ...(g.blank ? { blank: true } : {}), ...(g.form ? { form: true } : {}), ...(g.clipped ? { clipped: true } : {}), ...(g.unseen ? { unseen: true } : {}), ...(g.fid ? { fid: g.fid } : {}), ...(g.pid ? { pid: g.pid } : {}) })), turned: ink.turned, shapes: ink.shapes, pictures: ink.pictures, figures: ink.figures, unseen: ink.unseen, cut: ink.cut, boxes: ink.boxes, paths: ink.paths, points: ink.points.map(lowerPoint), paras: ink.paras ?? [], paraEnds: ink.paraEnds ?? [], boxAt: ink.boxAt, view: [...page.view] })
      facts.push(unread ? null : alignOf(OPS, ops))
      page.cleanup()
    }
  } catch (e) {
    if (isMemoryError(e)) throw e
    return { refused: 'wrap-parse', why: `PDF.js: ${String(e?.message ?? e)}`.slice(0, 300) }
  } finally { await task?.destroy?.().catch?.(() => {}) }
  const names = new Set(pages.flatMap(pg => pg.points.map(x => x.name)))
  // (the texts the marking's probe showed the paper's macros set: the marks file's `marking.texts`, flat [source, text, …]
  // pairs, or a Map; a cell's lead macro is owned by them alone, own.mjs; and a split piece's ink, after a macro, ends as the
  // maker's reading parts it: marks.mjs followsOf `split`)
  const shown = texts instanceof Map ? texts : Array.isArray(texts) ? new Map(Array.from({ length: Math.floor(texts.length / 2) }, (_, j) => [texts[2 * j], texts[2 * j + 1]]).filter(([a, b]) => typeof a === 'string' && typeof b === 'string')) : null
  const follows = given !== undefined ? given : units ? followsOf(units, names, shown, inkless) : null
  const own = ownOf(pages, { units, follows, texts: shown, inkless: inkless === null ? null : new Set(inkless), names: theoremNames })
  // (the text inside the vector figures, no source unit's: its figure units, each its own group f<k>, a crowded one none;
  // layout/figure-text.mjs), cut before the ink units so that a figure's text is the figures' class, never an ink unit's
  const fig = withFigureText ? figureUnitsOf(pages, own) : { units: [], glyphs: pages.map(() => new Map()), turned: pages.map(() => new Map()), stats: { letters: 0 } }
  // (the figures' paths as their lines are read by then: let go before the wrap reads the pages again)
  for (const pg of pages) { pg.shapes = null; pg.figures = null; pg.unseen = null; pg.cut = null }
  /** each page's owners with the figure units' groups: every one's (`all`: the ledger's, crowded or not) or the drawn ones' */
  const withFigures = all => own.glyphs.map((row, i) => {
    const m = fig.glyphs[i]
    if (!m?.size) return row
    const out = Array.from(row)
    for (const [g, k] of m) if (all || !fig.units[k].why) out[g] = fig.units[k].group
    return out
  })
  // (every glyph's content class: the record's counts, the sweep's orphans; layout/ledger.mjs: a figure unit's glyphs are the
  // figures', crowded or not), then the ink units, the text no unit owns made units of our glyphs (layout/ink-units.mjs), their
  // glyphs claimed before the wrap is planned, so that each is hidden by its own groups as any unit is; the ledger's orphans those
  // no unit owns still. None where the source is not read (units null: no id to start from, no echo)
  // (a display a unit opens with, which the marking passes over, in no group: its unit's for the ledger, so that no ink unit nor
  // kept block is made of it, own.mjs `leads`)
  const withLeads = rows => rows.map((row, i) => {
    const m = own.leads?.[i]
    if (!m?.size) return row
    const out = Array.from(row)
    for (const [g, group] of m) out[g] ??= group
    return out
  })
  const classed = ledgerOf(pages, { ...own, glyphs: withLeads(withFigures(true)) }, { units })
  const ink = units ? inkUnitsOf(pages, classed, { units, from: inkBase }) : []
  claimInk(own, ink, pages)
  const ledger = ink.length ? inkLeft(classed, { ...own, glyphs: withLeads(withFigures(true)) }, pages) : classed
  // (and the text no unit owns still, kept blocks after the ink units: never translated, lit as any unit is; their glyphs in no
  // group, so that the wrap and the ledger are as they were, and none is off where a page is not wrapped: nothing of it is hidden;
  // layout/ink-units.mjs rule 10)
  const kept = units ? keptUnitsOf(pages, classed, (p, g) => own.glyphs[p - 1]?.[g] ?? (fig.glyphs[p - 1]?.has(g) ? 'f' : null) ?? own.leads?.[p - 1]?.get(g) ?? null, { from: inkBase + ink.length }) : []
  const owners = withFigures(false)
  const plans = new Map()
  pages.forEach((pg, i) => {
    if (!facts[i] || !pg.points.length) return
    const plan = { facts: facts[i], ...planOf(pg.glyphs, owners[i], pg.paths, own.boxes[i], facts[i]) }
    // (a placeholder's image the page's images cannot be told by: its unit the original's, as a page not wrapped)
    for (const g of plan.lost) { const u = own.units.get(Number(/^u(\d+)/.exec(g)?.[1])); if (u && !u.unhidden) u.unhidden = 'page' }
    // (a turned glyph's group by its place in its show, as a level one's)
    for (const [j, k] of fig.turned[i] ?? []) {
      const u = fig.units[k], t = pg.turned[j]
      if (u.why || !(t.n >= 0)) continue
      let row = plan.shows.get(t.n)
      if (!row) plan.shows.set(t.n, (row = []))
      row[t.k] = u.group
    }
    plans.set(i + 1, plan)
  })
  const made = await wrapOf(finalBytes, plans, { PL, deflate, inflate, ...bounds })
  if (made.refused) return made
  // a figure unit drawn is one whose group the document holds; else why its ink stays the original's
  for (const u of fig.units) {
    if (u.why) continue
    const x = made.pages.get(u.page)
    u.why = !x?.ok ? 'page' : x.figureWhy?.get(u.group) ?? (made.groups.has(u.group) ? null : 'shared')
  }
  const figures = figureRecordOf(fig, made)
  // a unit on a page not wrapped, or with a placeholder where the page's groups were merged, is the original's
  for (const u of own.units.values()) {
    if (u.unhidden) continue
    for (const p of u.pages) {
      const x = made.pages.get(p)
      if (!x?.ok) { u.unhidden = 'page'; break }
      // (a merged page folds a unit's placeholders and its label into its text: neither can then be kept in place)
      if (x.merged && [...u.groups].some(g => g.endsWith('.p') || g.endsWith('.l'))) { u.unhidden = 'bounds'; break }
    }
  }
  const counts = Object.fromEntries(UNHIDDEN.map(k => [k, 0]))
  const unhidden = [], labelKept = []
  // (listed: the units with a group in the document, the only ones a reader could hide; one with none is the original's by
  // construction, counted alone. So the lists hold at most GROUPS_DOC, and a long paper's cut at it costs no base)
  const written = id => [...own.units.get(id).groups].some(g => made.groups.has(g))
  for (const [id, u] of [...own.units].sort((a, b) => a[0] - b[0])) {
    if (u.unhidden) { counts[u.unhidden]++; if (written(id)) unhidden.push([id, u.unhidden]) }
    else if (u.labelKept && written(id)) labelKept.push(id)
  }
  if (unhidden.length > UNHIDDEN_MAX || labelKept.length > UNHIDDEN_MAX) return { refused: 'wrap-bound', why: `${unhidden.length} units the original's, past ${UNHIDDEN_MAX}` }
  const stats = { ...made.stats, unhidden: counts, labelKept: labelKept.length }
  const wrappedPages = rangesOf([...made.pages].filter(([, x]) => x.ok).map(([p]) => p))
  return { bytes: made.bytes, xref: made.xref, sha256: made.sha256, stats, unhidden, labelKept, pages: wrappedPages, own: { ...own.stats, unhidden: counts }, ledger: ledgerSummary(ledger), ink: { base: inkBase, units: [...ink, ...kept].map(({ id, kind, cls, echo, pieces, rows, kept: k }) => ({ id, kind, cls, echo, pieces, rows, ...(k ? { kept: true } : {}) })), off: inkOff(ink, made.pages) }, figures, ...(keepOwned ? { owned: own, ledgerWhole: ledger, figureUnits: fig.units } : {}) }
}

/** the figure units as the page pass takes them: those drawn (their group in the document, `why` null), each { page, group,
 *  text, font, size, fill, angle, x, y, ux, uy, length, ascent, descent, anchor, form, set, before, after, and under where a stroke
 *  is under its text }, in the order of
 *  their groups; and the counts (the record's): units cut, drawn, each why, their letters, the forms written again, the sets of
 *  two units or more and the units in them, the units their column aligned */
function figureRecordOf(fig, made) {
  const stats = { units: fig.units.length, drawn: 0, letters: fig.stats.letters, forms: made.forms ?? 0, sets: fig.stats.sets ?? 0, grouped: fig.stats.grouped ?? 0, aligned: fig.stats.aligned ?? 0, ...Object.fromEntries(FIGURE_WHYS.map(w => [w, 0])) }
  const units = []
  for (const u of fig.units) {
    if (u.why) { stats[u.why]++; continue }
    stats.drawn++
    units.push({ page: u.page, group: u.group, text: u.text, font: u.font, size: u.size, fill: u.fill, angle: u.angle, x: u.x, y: u.y, ux: u.ux, uy: u.uy, length: u.length, ascent: u.ascent, descent: u.descent, anchor: u.anchor, form: u.form, set: u.set, before: u.before, after: u.after, ...(u.under != null ? { under: u.under } : {}) })
  }
  return { units, stats }
}
