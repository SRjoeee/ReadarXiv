// experiments/pdf-bilingual/spikes/layer-gate/score.mjs
// The layer gate's arithmetic (Plan 8b, Task 12): a page's measures as its record holds them, a fixture's totals, the
// totals pooled over fixtures, and the merge rule against a recorded run. Ported from the parity harness's
// summarize.py and pool.py (scratchpad parity/, 2026-10-06): the same definitions, so that the prototype's floor, which
// they computed, compares with what this gate computes. Pure: no file, no clock.
//
// The merge rule (the parity report's §6, as the controller set it): no measure worse on any fixture against the last
// record. Shares (a part of a whole) may move by 0.2 points, ratios by 0.02, counts of units not at all; the defect counts
// (cleanliness and completeness) are compared as rates per 1,000 translated text cells (the pixel tier's; the model tier's
// are its drawn units' cells, modelCells), so that a change that draws more is not blocked by the defects it uncovers.
// Every page whose measures moved is listed beside it, so that a total cannot hide a broken page.

/** what each measure is and which way is closer to the original: [key, tier, class, better, label] */
export const MEASURES = [
  ['textTranslated', 'pixel', 'share', 'up', 'text translated'],
  ['textEnglish', 'pixel', 'share', 'down', 'text English'],
  ['textBlank', 'pixel', 'share', 'down', 'text blank'],
  ['cellsTranslated', 'pixel', 'share', 'up', 'table cells translated'],
  ['unitsLeft', 'model', 'count', 'down', 'text units left English'],
  ['cellsLeft', 'model', 'count', 'down', 'cells left English'],
  ['fill', 'model', 'ratio', 'one', 'fill (median)'],
  ['blankLines', 'model', 'ratio', 'down', 'blank lines / frame'],
  ['framesBlank1', 'model', 'share', 'down', 'frames with a blank line'],
  ['pitchSpread', 'model', 'ratio', 'down', 'pitch spread'],
  ['scale', 'model', 'ratio', 'one', 'size (median)'],
  ['fullSize', 'model', 'share', 'up', 'full size'],
  ['scaleSpread', 'model', 'ratio', 'down', 'size spread'],
  ['overRight', 'model', 'share', 'down', 'frames past the right edge'],
  ['overlap', 'pixel', 'defect', 'down', 'overlap regions'],
  ['stray', 'pixel', 'defect', 'down', 'stray text'],
  ['residue', 'pixel', 'defect', 'down', 'residue regions'],
  ['bites', 'pixel', 'defect', 'down', 'erase bites'],
  ['vanished', 'pixel', 'defect', 'down', 'vanished math'],
  ['doubled', 'pixel', 'defect', 'down', 'doubled crops'],
  ['lostInk', 'pixel', 'defect', 'down', 'lost-ink regions'],
  ['graphicsErased', 'pixel', 'defect', 'down', 'graphics px erased'],
  ['graphicsOverdrawn', 'pixel', 'defect', 'down', 'graphics px overdrawn'],
  ['cropForeign', 'model', 'defect', 'down', 'crops with foreign ink'],
  ['wrongPageText', 'model', 'defect', 'down', 'wrong page text'],
  ['droppedPh', 'model', 'defect', 'down', 'dropped placeholders'],
  ['missing', 'model', 'defect', 'down', 'placeholders missing'],
  ['twice', 'model', 'defect', 'down', 'placeholders twice'],
  ['brackets', 'model', 'defect', 'down', 'doubled brackets'],
  ['duplicated', 'model', 'defect', 'down', 'duplications'],
  ['clipped', 'model', 'defect', 'down', 'clipped characters'],
  // the wire's syntax left in the drawn translation (measure.mjs markerResidueOf: a marker, its `#`, an entity, a tag)
  ['markerResidue', 'model', 'defect', 'down', 'marker syntax left in drawn text'],
  ['numbersLost', 'model', 'defect', 'down', 'equation numbers not shown'],
  // the text-removed PDF's (--removal): its removed page the truth of what stays (pdf-remove-report.md §3.1)
  ['trueResidue', 'pixel', 'defect', 'down', 'leftover English (true residue)'],
  ['traces', 'pixel', 'defect', 'down', 'faint leftovers (traces)'],
  ['trueBites', 'pixel', 'defect', 'down', 'kept ink destroyed (true bites)'],
  ['cropForeignInk', 'pixel', 'defect', 'down', 'crops carrying foreign ink (6 px or more)'],
  // and its exactness: the glyphs removed are the glyphs the layer replaces, nothing else removed or moved
  ['rmOutside', 'pixel', 'defect', 'down', 'pixels changed outside the removed glyphs'],
  ['rmMissed', 'model', 'defect', 'down', 'glyphs and rules replaced, not removed'],
  ['rmOther', 'model', 'defect', 'down', 'glyphs and rules removed, not replaced'],
  ['rmMoved', 'model', 'defect', 'down', 'kept glyphs moved'],
  ['rmPOther', 'model', 'defect', 'down', "placeholders' page: other ink or a crop's glyph missing"],
  ['rmMismatched', 'model', 'defect', 'down', "units whose removal is not the plan's"],
  ['rmRefused', 'model', 'defect', 'down', 'pages refused by the remover'],
  // the consistency measures (the table-groups brief, 2026-10-07): each must be 0
  ['groupsSplit', 'model', 'count', 'down', 'table groups drawn partly'],
  ['labelsSource', 'model', 'count', 'down', 'labels left in the source language the final names'],
]
/** recorded beside them, not gated: the pitch is the rules' (CJK's leading is 1.3 by rule), the top a position */
export const REPORTED = [['pitch', 'pitch ratio'], ['dTop', '|top shift| (pt)'], ['onGrid', 'lines on a layout baseline']]
export const TOLERANCE = { share: 0.002, ratio: 0.02, count: 0, defect: 0 }
/** the defects that are counts of things (their rates compared), and the counts each sums from a page */
const DEFECTS = MEASURES.filter(m => m[2] === 'defect').map(m => m[0])

/** the median, the two middle values' mean for an even count (Python's statistics.median, as summarize.py took it) */
const median = xs => { const s = xs.filter(x => x !== null && x !== undefined && Number.isFinite(x)).sort((a, b) => a - b); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : null }
const share = (a, b) => (b ? a / b : null)
const sum = (xs, f) => xs.reduce((a, x) => a + (f(x) ?? 0), 0)
const r = (v, d = 4) => (v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d)

/**
 * A page's entry in the record from what the page measured: the model's counts and frames, the checker's, and (pixel)
 * the planes'. The frames themselves are returned apart (`frames`), for the fixture's medians, and not recorded
 */
export function pageEntry(page, model, pixel) {
  const m = model.model
  const body = m.geo.filter(g => ['para', 'abstract', 'theorem'].includes(g.kind))
  const fills = m.fills.filter(f => ['para', 'abstract', 'theorem'].includes(f.kind) && f.n >= 3).map(f => f.fill)
  const pitches = body.map(g => g.pitch).filter(x => x)
  const scales = body.map(g => g.scale)
  const blanks = body.map(g => Math.max(0, g.blank))
  const e = {
    p: page,
    textOn: m.units.textOn, textDrawn: m.units.textDrawn, cellsOn: m.units.cellsOn, cellsDrawn: m.units.cellsDrawn, left: m.units.left,
    frames: body.length, fills: fills.length, fill: r(median(fills), 3), blankLines: r(blanks.length ? sum(blanks, x => x) / blanks.length : null, 3),
    framesBlank1: blanks.filter(b => b >= 1).length, pitch: r(median(pitches), 3), pitchSpread: pitches.length >= 2 ? r(Math.max(...pitches) - Math.min(...pitches), 3) : null,
    scale: r(median(scales), 3), fullSize: scales.filter(s => s >= 0.999).length, scaleSpread: scales.length >= 2 ? r(Math.max(...scales) - Math.min(...scales), 3) : null,
    dTop: r(median(body.map(g => Math.abs(g.dTop))), 2), overRight: body.filter(g => g.dRight > 1).length, onGrid: r(median(body.map(g => g.onGrid)), 3),
    cropForeign: m.cropForeign, wrongPageText: m.wrongPageText, droppedPh: m.droppedPh, modelCells: m.modelCells,
    missing: model.check.missing.length, twice: model.check.twice.length, brackets: model.check.brackets.length, duplicated: model.check.duplicated.length,
    clipped: model.check.clipped, markerResidue: model.check.markerResidue ?? 0, numbersTotal: model.check.numbers.total, numbersShown: model.check.numbers.shown, numbersLost: model.check.numbers.total - model.check.numbers.shown,
    where: model.where, style: model.style, drawn: model.drawn,
    groupsSplit: model.consistency?.groupsSplit ?? 0, labelsSource: model.consistency?.labelsSource ?? 0,
  }
  if (model.removal) Object.assign(e, { rmRefused: model.removal.refused, rmMismatched: model.removal.mismatched, rmUnits: model.removal.units, rmSwapped: model.removal.swapped })
  const ck = model.removalCheck
  if (ck) Object.assign(e, { rmRemoved: ck.removed + ck.rulesRemoved, rmMissed: ck.missed + ck.rulesMissed, rmOther: ck.other + ck.extra + ck.rulesOther, rmMoved: ck.moved, rmPOther: ck.pOther + ck.pMissing })
  if (pixel) {
    Object.assign(e, {
      textCells: pixel.coverage.text.cells, textTranslatedCells: pixel.coverage.text.translated, textEnglishCells: pixel.coverage.text.english, textBlankCells: pixel.coverage.text.blank,
      cellCells: pixel.coverage.cells.cells, cellTranslatedCells: pixel.coverage.cells.translated, neutral: pixel.neutral,
      overlap: pixel.overlap, overlapPx: pixel.overlapPx, stray: pixel.stray, residue: pixel.residue, residuePx: pixel.residuePx, bites: pixel.bites, bitePx: pixel.bitePx,
      vanished: pixel.vanished, doubled: pixel.doubled, graphicsPx: pixel.graphics.px, graphicsErased: pixel.graphics.erased, graphicsOverdrawn: pixel.graphics.overdrawn,
      lostInk: pixel.lostInk.regions, lostInkPx: pixel.lostInk.px, lostBoxes: pixel.lostInk.boxes, regionsAt: pixel.regionsAt,
    })
    const rm = pixel.removal
    if (rm) Object.assign(e, { trueResidue: rm.trueResidue, trueResiduePx: rm.trueResiduePx, traces: rm.traces, tracesPx: rm.tracesPx, trueBites: rm.trueBites, trueBitesPx: rm.trueBitesPx, cropForeignInk: rm.cropForeignInk, cropForeignInkPx: rm.cropForeignInkPx, rmCrops: rm.crops, truthAt: rm.at })
  }
  return { entry: e, frames: { body, fills, pitches, scales } }
}

/** a fixture's totals over its pages (summarize.py's): `pages` the entries, `frames` each page's frames (pageEntry's) */
export function fixtureTotals(pages, frames, tier) {
  const body = frames.flatMap(f => f.body), fills = frames.flatMap(f => f.fills)
  const blanks = body.map(g => Math.max(0, g.blank))
  const left = {}
  for (const p of pages) for (const [k, v] of Object.entries(p.left)) left[k] = (left[k] ?? 0) + v
  const textOn = sum(pages, p => p.textOn), textDrawn = sum(pages, p => p.textDrawn), cellsOn = sum(pages, p => p.cellsOn), cellsDrawn = sum(pages, p => p.cellsDrawn)
  const t = {
    pages: pages.length, textOn, textDrawn, unitsLeft: textOn - textDrawn, left, cellsOn, cellsDrawn, cellsLeft: cellsOn - cellsDrawn,
    frames: body.length, fillN: fills.length, fill: r(median(fills), 3), blankLines: r(blanks.length ? sum(blanks, x => x) / blanks.length : null, 3),
    framesBlank1: r(share(blanks.filter(b => b >= 1).length, blanks.length)), pitch: r(median(body.map(g => g.pitch)), 3),
    pitchSpread: r(median(frames.map(f => (f.pitches.length >= 2 ? Math.max(...f.pitches) - Math.min(...f.pitches) : null))), 3),
    scale: r(median(body.map(g => g.scale)), 3), fullSize: r(share(body.filter(g => g.scale >= 0.999).length, body.length)),
    scaleSpread: r(median(frames.map(f => (f.scales.length >= 2 ? Math.max(...f.scales) - Math.min(...f.scales) : null))), 3),
    dTop: r(median(body.map(g => Math.abs(g.dTop))), 2), overRight: r(share(body.filter(g => g.dRight > 1).length, body.length)), onGrid: r(median(body.map(g => g.onGrid)), 3),
    modelCells: sum(pages, p => p.modelCells), numbersTotal: sum(pages, p => p.numbersTotal), numbersShown: sum(pages, p => p.numbersShown),
    groupsSplit: sum(pages, p => p.groupsSplit), labelsSource: sum(pages, p => p.labelsSource),
    style: [sum(pages, p => p.style?.[0]), sum(pages, p => p.style?.[1])],
  }
  if (tier === 'pixel') {
    const tc = sum(pages, p => p.textCells), cc = sum(pages, p => p.cellCells)
    Object.assign(t, {
      textCells: tc, textTranslatedCells: sum(pages, p => p.textTranslatedCells), textEnglishCells: sum(pages, p => p.textEnglishCells), textBlankCells: sum(pages, p => p.textBlankCells),
      cellCells: cc, cellTranslatedCells: sum(pages, p => p.cellTranslatedCells),
      textTranslated: r(share(sum(pages, p => p.textTranslatedCells), tc)), textEnglish: r(share(sum(pages, p => p.textEnglishCells), tc)), textBlank: r(share(sum(pages, p => p.textBlankCells), tc)),
      cellsTranslated: r(share(sum(pages, p => p.cellTranslatedCells), cc)),
      overlapPx: sum(pages, p => p.overlapPx), residuePx: sum(pages, p => p.residuePx), bitePx: sum(pages, p => p.bitePx), lostInkPx: sum(pages, p => p.lostInkPx), graphicsPx: sum(pages, p => p.graphicsPx),
    })
  }
  // the text-removed PDF's sums, where the run has them
  for (const k of ['rmRemoved', 'rmUnits', 'rmSwapped', 'trueResiduePx', 'tracesPx', 'trueBitesPx', 'rmDiffering', 'cropForeignInkPx', 'rmCrops']) if (pages.some(p => p[k] !== undefined)) t[k] = sum(pages, p => p[k])
  for (const d of DEFECTS) if (pages.some(p => p[d] !== undefined)) t[d] = sum(pages, p => p[d])
  t.rates = ratesOf(t, tier)
  t.modelRates = ratesOf(t, 'model')
  return t
}

/** the defects per 1,000 translated text cells (pixel), or per 1,000 cells of the drawn units' frames (model) */
export function ratesOf(t, tier) {
  const base = tier === 'pixel' ? t.textTranslatedCells : t.modelCells
  const out = {}
  for (const d of DEFECTS) if (t[d] !== undefined) out[d] = base ? r((1000 * t[d]) / base, 3) : t[d] ? Infinity : 0
  return out
}

/** totals pooled over fixtures (pool.py's): shares over the pooled cells, the frame measures each fixture's weighted by its
 *  frames, counts summed */
export function pooled(list, tier) {
  if (!list.length) return null
  const w = (key, weight = 'frames') => {
    const xs = list.filter(t => t[key] !== null && t[key] !== undefined)
    const n = sum(xs, t => t[weight])
    return n ? r(sum(xs, t => t[key] * t[weight]) / n, 3) : null
  }
  const left = {}
  for (const t of list) for (const [k, v] of Object.entries(t.left)) left[k] = (left[k] ?? 0) + v
  const out = {
    outputs: list.length, pages: sum(list, t => t.pages), textOn: sum(list, t => t.textOn), textDrawn: sum(list, t => t.textDrawn), unitsLeft: sum(list, t => t.unitsLeft), left,
    cellsOn: sum(list, t => t.cellsOn), cellsDrawn: sum(list, t => t.cellsDrawn), cellsLeft: sum(list, t => t.cellsLeft), frames: sum(list, t => t.frames),
    fill: w('fill', 'fillN'), blankLines: w('blankLines'), framesBlank1: w('framesBlank1'), pitch: w('pitch'), pitchSpread: w('pitchSpread'),
    scale: w('scale'), fullSize: w('fullSize'), scaleSpread: w('scaleSpread'), dTop: w('dTop'), overRight: w('overRight'), onGrid: w('onGrid'),
    modelCells: sum(list, t => t.modelCells), numbersTotal: sum(list, t => t.numbersTotal), numbersShown: sum(list, t => t.numbersShown),
    groupsSplit: sum(list, t => t.groupsSplit), labelsSource: sum(list, t => t.labelsSource),
    style: [sum(list, t => t.style[0]), sum(list, t => t.style[1])],
  }
  if (tier === 'pixel') {
    const tc = sum(list, t => t.textCells), cc = sum(list, t => t.cellCells)
    Object.assign(out, {
      textCells: tc, textTranslatedCells: sum(list, t => t.textTranslatedCells), textEnglishCells: sum(list, t => t.textEnglishCells), textBlankCells: sum(list, t => t.textBlankCells),
      cellCells: cc, cellTranslatedCells: sum(list, t => t.cellTranslatedCells),
      textTranslated: r(share(sum(list, t => t.textTranslatedCells), tc)), textEnglish: r(share(sum(list, t => t.textEnglishCells), tc)), textBlank: r(share(sum(list, t => t.textBlankCells), tc)),
      cellsTranslated: r(share(sum(list, t => t.cellTranslatedCells), cc)),
      residuePx: sum(list, t => t.residuePx), lostInkPx: sum(list, t => t.lostInkPx),
    })
  }
  for (const d of DEFECTS) if (list.some(t => t[d] !== undefined)) out[d] = sum(list, t => t[d] ?? 0)
  for (const k of ['rmRemoved', 'rmUnits', 'rmSwapped', 'trueResiduePx', 'tracesPx', 'trueBitesPx', 'rmDiffering', 'cropForeignInkPx', 'rmCrops']) if (list.some(t => t[k] !== undefined)) out[k] = sum(list, t => t[k] ?? 0)
  out.rates = ratesOf(out, tier)
  out.modelRates = ratesOf(out, 'model')
  return out
}

/**
 * Whether `cur` is worse than `prev` on a measure, and by how much (positive: worse), by its class: a share by 0.2 points,
 * a ratio by 0.02, a count by any, a defect's rate by any (the model tier's rates per its own cells, whatever tier the
 * record was made in). Null where either has no value
 */
export function worse(m, prev, cur, tier = 'pixel') {
  const [key, , cls, better] = m
  const rk = tier === 'model' ? 'modelRates' : 'rates'
  const a = cls === 'defect' ? prev[rk]?.[key] : prev[key], b = cls === 'defect' ? cur[rk]?.[key] : cur[key]
  if (a === null || a === undefined || b === null || b === undefined) return null
  const d = better === 'up' ? a - b : better === 'down' ? b - a : Math.abs(b - 1) - Math.abs(a - 1)
  return { by: d, worse: d > TOLERANCE[cls] + 1e-9, better: d < -(TOLERANCE[cls] + 1e-9), from: a, to: b }
}

/** a page's values as a fixture's, for the rule: its shares from its cells, its frames' values as they are */
function pageView(p, tier) {
  const v = {
    unitsLeft: p.textOn - p.textDrawn, cellsLeft: p.cellsOn - p.cellsDrawn, fill: p.fill, blankLines: p.blankLines,
    framesBlank1: p.frames ? p.framesBlank1 / p.frames : null, pitchSpread: p.pitchSpread, scale: p.scale, fullSize: p.frames ? p.fullSize / p.frames : null,
    scaleSpread: p.scaleSpread, overRight: p.frames ? p.overRight / p.frames : null, modelCells: p.modelCells, textTranslatedCells: p.textTranslatedCells,
  }
  if (tier === 'pixel') Object.assign(v, { textTranslated: share(p.textTranslatedCells, p.textCells), textEnglish: share(p.textEnglishCells, p.textCells), textBlank: share(p.textBlankCells, p.textCells), cellsTranslated: share(p.cellTranslatedCells, p.cellCells) })
  for (const d of DEFECTS) if (p[d] !== undefined) v[d] = p[d]
  v.rates = ratesOf(v, tier)
  v.modelRates = ratesOf(v, 'model')
  return v
}

/**
 * The merge rule: every measure of `tier` worse on a fixture than the recorded run's (`prev`, `cur`: { [fixture]: { totals,
 * pages } }), every measure better, and every page whose measures moved (each with the measures). A fixture the recorded
 * run has not is listed apart, never compared
 */
export function compare(prev, cur, tier) {
  const ms = MEASURES.filter(m => tier === 'pixel' || m[1] === 'model')
  const out = { regressions: [], improvements: [], pages: [], unmatched: [] }
  for (const [fx, c] of Object.entries(cur)) {
    const p = prev[fx]
    if (!p) { out.unmatched.push(fx); continue }
    for (const m of ms) {
      const w = worse(m, p.totals, c.totals, tier)
      if (!w) continue
      if (w.worse) out.regressions.push({ fixture: fx, measure: m[0], label: m[4], from: w.from, to: w.to })
      else if (w.better) out.improvements.push({ fixture: fx, measure: m[0], label: m[4], from: w.from, to: w.to })
    }
    const before = new Map(p.pages.map(e => [e.p, e]))
    for (const e of c.pages) {
      const b = before.get(e.p)
      if (!b) continue
      const pv = pageView(b, tier), cv = pageView(e, tier), worseOn = [], betterOn = []
      for (const m of ms) {
        const w = worse(m, pv, cv, tier)
        if (w?.worse) worseOn.push(m[0])
        else if (w?.better) betterOn.push(m[0])
      }
      if (worseOn.length || betterOn.length) out.pages.push({ fixture: fx, page: e.p, worse: worseOn, better: betterOn })
    }
  }
  return out
}
