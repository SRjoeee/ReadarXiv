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
  // (a frame past it by its hanging marks alone, by at most their own width, is no frame past it: it hangs, `hanging`
  // below, measure.mjs hangFromOf)
  ['overRight', 'model', 'share', 'down', 'frames past the right edge'],
  // the gaps between paragraphs (D6, 2026-10-08; measure.mjs paraGapsOf): the share of gaps a pitch or more wider than the
  // original's (a frame drawn short leaves its blank in the gap below it), and those narrower than the lines beside them (the
  // half-leading round, 2026-10-17: the drawn gap less the drawn leading short of the original's room past its pitch, capped
  // at a pitch, measure.mjs paraGapsOf `tight`; a defect compared as a rate, as the measures of TeX's file entered). The
  // drawn gap against the original's (paraGap, its median ratio) is reported, no longer gated (the maintainer, 2026-10-17):
  // it held a translation spread past the original's pitch to the original's gap, a pitch, which is tighter than its lines
  ['paraGapWide', 'model', 'share', 'down', 'paragraph gaps a pitch or more wider'],
  ['paraGapTight', 'model', 'defect', 'down', 'paragraph gaps tighter than the lines beside them'],
  ['overlap', 'pixel', 'defect', 'down', 'overlap regions'],
  ['stray', 'pixel', 'defect', 'down', 'stray text'],
  ['residue', 'pixel', 'defect', 'down', 'residue regions'],
  ['bites', 'pixel', 'defect', 'down', 'erase bites'],
  ['vanished', 'pixel', 'defect', 'down', 'vanished math'],
  ['doubled', 'pixel', 'defect', 'down', 'doubled crops'],
  ['lostInk', 'pixel', 'defect', 'down', 'lost-ink regions'],
  ['graphicsErased', 'pixel', 'defect', 'down', 'graphics px erased'],
  ['graphicsOverdrawn', 'pixel', 'defect', 'down', 'graphics px overdrawn'],
  // the translation's text on or a pixel from a rule's or a figure's ink (measure.mjs pixelPage graphics.touched)
  ['graphicsTouched', 'pixel', 'defect', 'down', 'text touching a rule or a figure'],
  ['cropForeign', 'model', 'defect', 'down', 'crops with foreign ink'],
  // where the crops sit (the math placement round, measure.mjs cropPlacementOf): over another drawn line's text or another
  // crop, and off the baseline TeX set them on; each must be 0
  ['cropTextOverlap', 'model', 'count', 'down', "crops over another line's text or another crop"],
  ['cropBaselineOff', 'model', 'count', 'down', 'crops off their TeX baseline'],
  ['wrongPageText', 'model', 'defect', 'down', 'wrong page text'],
  ['droppedPh', 'model', 'defect', 'down', 'dropped placeholders'],
  ['missing', 'model', 'defect', 'down', 'placeholders missing'],
  ['twice', 'model', 'defect', 'down', 'placeholders twice'],
  ['brackets', 'model', 'defect', 'down', 'doubled brackets'],
  ['duplicated', 'model', 'defect', 'down', 'duplications'],
  ['clipped', 'model', 'defect', 'down', 'clipped characters'],
  // the wire's syntax left in the drawn translation, and TeX's in a placeholder's rendering from its source (measure.mjs
  // markerResidueOf: a marker, its `#`, an entity, a tag; markupResidueOf: a backslash, a math shift, a brace)
  ['markerResidue', 'model', 'defect', 'down', 'marker or markup syntax left in drawn text'],
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
  // generated text left in the source language (D1a): the babel names the frozen reference holds (a generated heading:
  // Abstract, References, Contents, …) not drawn in the target's word, by kind (`generated`: `name`, the only kind yet)
  ['generatedLeft', 'model', 'count', 'down', 'generated text left in the source language (babel names)'],
  // the consistency measures (the table-groups brief, 2026-10-07): each must be 0
  ['groupsSplit', 'model', 'count', 'down', 'table groups drawn partly'],
  ['labelsSource', 'model', 'count', 'down', 'labels left in the source language the final names'],
  // TeX's file against the drawing (the 2608.16117 survey and the p59 finding, 2026-10-15; measure.mjs): a placeholder of a
  // drawn unit not shown exactly once, its ink its file row's segments (contentOf); a drawn line over a display's segment or
  // row (overDisplayOf); an empty slot between two drawn lines of a unit's frame (slotsSkippedOf); a drawn line opened by a
  // character UAX 14 keeps from a line's start where the original's is not (lineStartsOf); an erased glyph the strict rule
  // does not account for (glyphAccounted); a drawn unit's own text line left intact (pixelPage linesLeft). Each is a defect
  // compared as a rate against the run it is held to, as the others are, until the pull request that removes its cause
  // gates it at 0 (lab/pdf/README.md, the layer gate)
  ['contentLost', 'model', 'defect', 'down', 'placeholders not shown once (TeX\'s segments)'],
  ['textInDisplay', 'model', 'defect', 'down', 'drawn lines over a display'],
  ['slotsSkipped', 'model', 'defect', 'down', 'empty slots between two lines of a unit'],
  ['lineStartPunct', 'model', 'defect', 'down', 'lines opened by a mark UAX 14 keeps from a line start'],
  // (and the placeholders the content measure cannot place, LOST in the file or of a unit it does not hold: compared as
  // the others, so that a maker that loses more ink cannot lower the content measures by it)
  ['contentUnknown', 'model', 'defect', 'down', 'placeholders the content measure cannot place'],
  // the links (3a-0, the gate's measures first; links.mjs): the share of the original's links (the Link annotations the reader
  // can carry, T) that a record of the layer keeps with its own target, moved or in place on its rectangle; the share of the
  // moved records whose drawn text is the original's (PDF.js's overlaid text, the translation's pair text where the link text is
  // translated); and the records that are wrong (one in place over an erased glyph, one the attribution does not bear out, a url
  // outside the allow-list, an empty name with glyphs). Kept and true can only rise (no value where there is nothing to share: no
  // link, no moved record); wrong is 0 and gated at 0 (completenessRows below)
  ['linksKept', 'model', 'share', 'up', 'links kept / the original\'s links'],
  ['linksTrue', 'model', 'share', 'up', 'moved links whose drawn text is the original\'s'],
  ['linksWrong', 'model', 'defect', 'down', 'links that are wrong'],
  ['glyphsLost', 'pixel', 'defect', 'down', 'erased glyphs not accounted for (strict)'],
  ['linesLeft', 'pixel', 'defect', 'down', "a drawn unit's own lines left intact"],
]
/** recorded beside them, not gated: the pitch is the rules' (CJK's leading is 1.3 by rule), the top a position, and the
 *  most a page's drawn rhythm (its body frames' median line gap within a flow segment against the original's, measure.mjs
 *  rhythm) moves from the last page before it that has one (D6: the rhythm a reader sees, page to page) */
export const REPORTED = [['pitch', 'pitch ratio'], ['dTop', '|top shift| (pt)'], ['onGrid', 'lines on a layout baseline'], ['pageDrift', "page pitch's drift (most)"],
  // (the drawn gap between two paragraphs against the original's, the median ratio: gated until 2026-10-17, paraGapTight above)
  ['paraGap', "paragraph gap / the original's (median)"],
  // the crops with no TeX baseline to hold them to, and the lines TeX's rule opened, or would have where the paper has no values for it (layer2.mjs breakLines)
  ['cropNoTex', 'crops with no TeX baseline'], ['linesOpened', "lines TeX's rule opened"], ['linesUnopened', "lines TeX's rule would open, no values"],
  // (and the frames whose lines stand past the right edge by the marks no line starts with that end them alone, by at most
  // their own width: CJK's hanging punctuation, a closing mark's blank half the breaker hangs; a share of the body frames)
  ['hanging', 'frames past the right edge by hanging marks alone']]
/** a body frame past its right edge by more than a point: by what it holds before the marks it ends with (`over`), or by
 *  those marks alone (`hangs`; a frame measured before the distinction, with no `dBody`, by its lines as they end) */
const over = g => g.dRight > 1 && (g.dBody ?? g.dRight) > 1
const hangs = g => g.dRight > 1 && (g.dBody ?? g.dRight) <= 1
/** the reported counts a run's totals sum over its fixtures */
const REPORTED_COUNTS = ['cropNoTex', 'linesOpened', 'linesUnopened']
/** the content and line measures a page's model holds (measure.mjs) */
const FILE_MEASURES = ['contentLost', 'textInDisplay', 'slotsSkipped', 'lineStartPunct', 'contentUnknown']
/** the link counts a page's model holds (links.mjs linksPage), and the ones a fixture's totals sum: the shares are made of them */
export const LINK_COUNTS = ['linksTotal', 'linksUnsupported', 'linksPlaceable', 'linksKeptN', 'linksMoved', 'linksInPlace', 'linksTrueN', 'linksUnverified']
/** the placement counts, which a run without a layout file (v0 alone) has none of */
const PLACEMENT = ['cropTextOverlap', 'cropBaselineOff', 'cropNoTex']
export const TOLERANCE = { share: 0.002, ratio: 0.02, count: 0, defect: 0 }
/** the links' minimums per output (3a-2, the owner's ruling): links kept ÷ the original's links, and moved links whose drawn text
 *  is the reference's ÷ the moved links measured */
export const LINKS_MIN = { kept: 0.95, true: 0.98 }
/** the defects that are counts of things (their rates compared), and the counts each sums from a page */
const DEFECTS = MEASURES.filter(m => m[2] === 'defect').map(m => m[0])

/** the median, the two middle values' mean for an even count (Python's statistics.median, as summarize.py took it) */
const median = xs => { const s = xs.filter(x => x !== null && x !== undefined && Number.isFinite(x)).sort((a, b) => a - b); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : null }
const share = (a, b) => (b ? a / b : null)
const sum = (xs, f) => xs.reduce((a, x) => a + (f(x) ?? 0), 0)
const r = (v, d = 4) => (v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d)
/** the most a page's value (its drawn pitch) moves from the last page before it that has one (pages in order) */
const driftOf = values => { let last = null, most = null; for (const t of values) { if (t === null || t === undefined) continue; if (last !== null) most = Math.max(most ?? 0, Math.abs(t - last)); last = t } return most === null ? null : r(most, 3) }

/**
 * A page's entry in the record from what the page measured: the model's counts and frames, the checker's, and (pixel)
 * the planes'. The frames themselves are returned apart (`frames`), for the fixture's medians, and not recorded
 */
export function pageEntry(page, model, pixel) {
  const m = model.model
  const body = m.geo.filter(g => ['para', 'abstract', 'theorem'].includes(g.kind))
  const fills = m.fills.filter(f => ['para', 'abstract', 'theorem'].includes(f.kind) && f.n >= 3).map(f => f.fill)
  const pitches = body.map(g => g.pitch).filter(x => x)
  const rhythms = body.map(g => g.rhythm).filter(x => x)
  const scales = body.map(g => g.scale)
  const blanks = body.map(g => Math.max(0, g.blank))
  const gaps = m.gaps ?? []
  const e = {
    p: page,
    textOn: m.units.textOn, textDrawn: m.units.textDrawn, cellsOn: m.units.cellsOn, cellsDrawn: m.units.cellsDrawn, left: m.units.left,
    frames: body.length, fills: fills.length, fill: r(median(fills), 3), blankLines: r(blanks.length ? sum(blanks, x => x) / blanks.length : null, 3),
    framesBlank1: blanks.filter(b => b >= 1).length, pitch: r(median(pitches), 3), rhythm: r(median(rhythms), 3), pitchSpread: pitches.length >= 2 ? r(Math.max(...pitches) - Math.min(...pitches), 3) : null,
    scale: r(median(scales), 3), fullSize: scales.filter(s => s >= 0.999).length, scaleSpread: scales.length >= 2 ? r(Math.max(...scales) - Math.min(...scales), 3) : null,
    dTop: r(median(body.map(g => Math.abs(g.dTop))), 2), overRight: body.filter(over).length, hanging: body.filter(hangs).length, onGrid: r(median(body.map(g => g.onGrid)), 3),
    cropForeign: m.cropForeign, wrongPageText: m.wrongPageText, droppedPh: m.droppedPh, modelCells: m.modelCells,
    ...Object.fromEntries(PLACEMENT.filter(k => m[k] !== undefined).map(k => [k, m[k]])),
    ...Object.fromEntries(FILE_MEASURES.filter(k => m[k] !== undefined).map(k => [k, m[k]])),
    ...Object.fromEntries([...LINK_COUNTS, 'linksWrong'].filter(k => m[k] !== undefined).map(k => [k, m[k]])),
    missing: model.check.missing.length, twice: model.check.twice.length, brackets: model.check.brackets.length, duplicated: model.check.duplicated.length,
    clipped: model.check.clipped, markerResidue: model.check.markerResidue ?? 0, numbersTotal: model.check.numbers.total, numbersShown: model.check.numbers.shown, numbersLost: model.check.numbers.total - model.check.numbers.shown,
    where: model.where, style: model.style, drawn: model.drawn,
    groupsSplit: model.consistency?.groupsSplit ?? 0, labelsSource: model.consistency?.labelsSource ?? 0,
    paraGaps: gaps.length, paraGap: r(median(gaps.map(g => g.ratio)), 3), paraGapWide: gaps.filter(g => g.extra >= 1).length, paraGapTight: gaps.filter(g => g.tight === true).length,
    generated: model.generated ?? {}, generatedLeft: Object.values(model.generated ?? {}).reduce((a, n) => a + n, 0),
  }
  if (model.removal) Object.assign(e, { rmRefused: model.removal.refused, rmMismatched: model.removal.mismatched, rmUnits: model.removal.units, rmSwapped: model.removal.swapped })
  const ck = model.removalCheck
  if (ck) Object.assign(e, { rmRemoved: ck.removed + ck.rulesRemoved, rmMissed: ck.missed + ck.rulesMissed, rmOther: ck.other + ck.extra + ck.rulesOther, rmMoved: ck.moved, rmPOther: ck.pOther + ck.pMissing })
  if (pixel) {
    Object.assign(e, {
      textCells: pixel.coverage.text.cells, textTranslatedCells: r(pixel.coverage.text.translated, 3), textEnglishCells: r(pixel.coverage.text.english, 3), textBlankCells: r(pixel.coverage.text.blank, 3),
      // (areas, not counts: the coverage is the share of each cell drawn; measure.mjs pixelPage)
      cellCells: pixel.coverage.cells.cells, cellTranslatedCells: r(pixel.coverage.cells.translated, 3), neutral: pixel.neutral,
      overlap: pixel.overlap, overlapPx: pixel.overlapPx, stray: pixel.stray, residue: pixel.residue, residuePx: pixel.residuePx, bites: pixel.bites, bitePx: pixel.bitePx,
      vanished: pixel.vanished, doubled: pixel.doubled, graphicsPx: pixel.graphics.px, graphicsErased: pixel.graphics.erased, graphicsOverdrawn: pixel.graphics.overdrawn, graphicsTouched: pixel.graphics.touched,
      lostInk: pixel.lostInk.regions, lostInkPx: pixel.lostInk.px, lostBoxes: pixel.lostInk.boxes, regionsAt: pixel.regionsAt,
      ...(pixel.glyphsLost ? { glyphsLost: pixel.glyphsLost.regions, glyphsLostPx: pixel.glyphsLost.px, glyphsLostBoxes: pixel.glyphsLost.boxes } : {}),
      ...(pixel.linesLeft !== undefined ? { linesLeft: pixel.linesLeft } : {}),
    })
    if (pixel.linesLeftWhere?.length) e.where = { ...e.where, linesLeft: [...new Set(pixel.linesLeftWhere)] }
    const rm = pixel.removal
    if (rm) Object.assign(e, { trueResidue: rm.trueResidue, trueResiduePx: rm.trueResiduePx, traces: rm.traces, tracesPx: rm.tracesPx, trueBites: rm.trueBites, trueBitesPx: rm.trueBitesPx, cropForeignInk: rm.cropForeignInk, cropForeignInkPx: rm.cropForeignInkPx, rmCrops: rm.crops, truthAt: rm.at })
  }
  return { entry: e, frames: { body, fills, pitches, scales, gaps } }
}

/** a fixture's totals over its pages (summarize.py's): `pages` the entries, `frames` each page's frames (pageEntry's) */
export function fixtureTotals(pages, frames, tier) {
  const body = frames.flatMap(f => f.body), fills = frames.flatMap(f => f.fills), gaps = frames.flatMap(f => f.gaps ?? [])
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
    dTop: r(median(body.map(g => Math.abs(g.dTop))), 2), overRight: r(share(body.filter(over).length, body.length)), hanging: r(share(body.filter(hangs).length, body.length)), onGrid: r(median(body.map(g => g.onGrid)), 3),
    modelCells: sum(pages, p => p.modelCells), numbersTotal: sum(pages, p => p.numbersTotal), numbersShown: sum(pages, p => p.numbersShown),
    groupsSplit: sum(pages, p => p.groupsSplit), labelsSource: sum(pages, p => p.labelsSource),
    style: [sum(pages, p => p.style?.[0]), sum(pages, p => p.style?.[1])],
    paraGapN: gaps.length, paraGap: r(median(gaps.map(g => g.ratio)), 3), paraGapWide: r(share(gaps.filter(g => g.extra >= 1).length, gaps.length)),
    pageDrift: driftOf(pages.map(p => p.rhythm)),
    generated: kindsOf(pages), generatedLeft: sum(pages, p => p.generatedLeft),
  }
  for (const k of PLACEMENT) if (pages.some(p => p[k] !== undefined)) t[k] = sum(pages, p => p[k])
  Object.assign(t, linkTotals(pages))
  if (tier === 'pixel') {
    const tc = sum(pages, p => p.textCells), cc = sum(pages, p => p.cellCells)
    Object.assign(t, {
      textCells: tc, textTranslatedCells: sum(pages, p => p.textTranslatedCells), textEnglishCells: sum(pages, p => p.textEnglishCells), textBlankCells: sum(pages, p => p.textBlankCells),
      cellCells: cc, cellTranslatedCells: sum(pages, p => p.cellTranslatedCells),
      textTranslated: r(share(sum(pages, p => p.textTranslatedCells), tc)), textEnglish: r(share(sum(pages, p => p.textEnglishCells), tc)), textBlank: r(share(sum(pages, p => p.textBlankCells), tc)),
      cellsTranslated: r(share(sum(pages, p => p.cellTranslatedCells), cc)),
      overlapPx: sum(pages, p => p.overlapPx), residuePx: sum(pages, p => p.residuePx), bitePx: sum(pages, p => p.bitePx), lostInkPx: sum(pages, p => p.lostInkPx), graphicsPx: sum(pages, p => p.graphicsPx), glyphsLostPx: sum(pages, p => p.glyphsLostPx),
    })
  }
  // the text-removed PDF's sums, where the run has them
  for (const k of ['rmRemoved', 'rmUnits', 'rmSwapped', 'trueResiduePx', 'tracesPx', 'trueBitesPx', 'rmDiffering', 'cropForeignInkPx', 'rmCrops']) if (pages.some(p => p[k] !== undefined)) t[k] = sum(pages, p => p[k])
  for (const d of DEFECTS) if (pages.some(p => p[d] !== undefined)) t[d] = sum(pages, p => p[d])
  t.rates = ratesOf(t, tier)
  t.modelRates = ratesOf(t, 'model')
  return t
}

/** the link counts summed over pages (or fixtures) and the two shares made of them: kept ÷ the original's links, true ÷ moved
 *  records; null where there is nothing to share (no link, no moved record), which no comparison reads. Nothing where no entry
 *  has link counts (a record made before the measures) */
function linkTotals(list) {
  if (!list.some(p => p.linksTotal !== undefined || p.linksKeptN !== undefined)) return {}
  const t = {}
  for (const k of LINK_COUNTS) t[k] = sum(list, p => p[k])
  t.linksKept = r(share(t.linksKeptN, t.linksTotal))
  t.linksTrue = r(share(t.linksTrueN, t.linksMoved - (t.linksUnverified ?? 0)))
  return t
}

/** generated text left, by kind, summed over pages (or fixtures) */
const kindsOf = list => { const out = {}; for (const x of list) for (const [k, n] of Object.entries(x.generated ?? {})) out[k] = (out[k] ?? 0) + n; return out }

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
    scale: w('scale'), fullSize: w('fullSize'), scaleSpread: w('scaleSpread'), dTop: w('dTop'), overRight: w('overRight'), hanging: w('hanging'), onGrid: w('onGrid'),
    modelCells: sum(list, t => t.modelCells), numbersTotal: sum(list, t => t.numbersTotal), numbersShown: sum(list, t => t.numbersShown),
    groupsSplit: sum(list, t => t.groupsSplit), labelsSource: sum(list, t => t.labelsSource),
    style: [sum(list, t => t.style[0]), sum(list, t => t.style[1])],
    paraGapN: sum(list, t => t.paraGapN), paraGap: w('paraGap', 'paraGapN'), paraGapWide: w('paraGapWide', 'paraGapN'),
    pageDrift: list.some(t => t.pageDrift !== null && t.pageDrift !== undefined) ? Math.max(...list.map(t => t.pageDrift ?? 0)) : null,
    generated: kindsOf(list), generatedLeft: sum(list, t => t.generatedLeft),
  }
  for (const k of [...PLACEMENT, ...REPORTED_COUNTS]) if (list.some(t => t[k] !== undefined && t[k] !== null)) out[k] = sum(list, t => t[k] ?? 0)
  Object.assign(out, linkTotals(list))
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
    paraGap: p.paraGap ?? null, paraGapWide: p.paraGaps ? p.paraGapWide / p.paraGaps : null, generatedLeft: p.generatedLeft ?? 0,
    cropTextOverlap: p.cropTextOverlap ?? null, cropBaselineOff: p.cropBaselineOff ?? null,
    // (the link shares from their counts; a page of a record made before the measures has none)
    linksKept: p.linksTotal ? (p.linksKeptN ?? 0) / p.linksTotal : null, linksTrue: p.linksMoved - (p.linksUnverified ?? 0) > 0 ? (p.linksTrueN ?? 0) / (p.linksMoved - (p.linksUnverified ?? 0)) : null,
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

/** the brief's completeness rows: per output, each check's count over its pages, and the checks that fail (any count above 0;
 *  the pixel tier's lost ink too). Moved here from layer-gate.mjs (3a-0) so that its arithmetic is tested: `run.fixtures[name].totals` */
/** an add-on's ink read (layout/addon.mjs pagePlansOf's `ink`) as the row reports it: its pages, by what befell them, or null */
export function inkOf(ink) {
  if (!ink || typeof ink !== 'object') return null
  const pages = k => (Array.isArray(ink[k]) ? ink[k].filter(Number.isInteger) : [])
  return { capped: pages('capped'), timedOut: pages('timedOut'), degraded: pages('degraded') }
}

/** the ink line (the gate's, after the completeness line; names and numbers): every output's ink whole, or those whose is
 *  not, each with its counts; or that no output's add-on told */
export function inkLine(rows) {
  const told = rows.filter(r => r.ink)
  if (!told.length) return 'ink (the add-on\'s reading of arXiv\'s pages): not told by any output'
  const not = told.filter(r => r.ink.capped.length || r.ink.timedOut.length || r.ink.degraded.length)
  const untold = rows.length - told.length
  const head = `ink (the add-on's reading of arXiv's pages): ${not.length ? `${not.length} of ${told.length} outputs not whole: ${not.map(r => `${r.name} [capped ${r.ink.capped.length}, timed out ${r.ink.timedOut.length}, degraded ${r.ink.degraded.length}]`).join('; ')}` : `whole on every one of ${told.length} outputs`}`
  return untold ? `${head}; ${untold} not told` : head
}

export function completenessRows(run, tier) {
  return Object.entries(run.fixtures).map(([name, f]) => {
    const t = f.totals
    // (the consistency checks, the table-groups brief: a table group drawn partly, a label the final names left in the
    // source language; each must be 0. And the measures of TeX's file whose cause a pull request removed, gated at 0 in
    // it, README: a drawn line over a display, since the display grouping read from the file, 2026-10-15; a drawn line
    // opened by a mark UAX 14 keeps from a line's start, since the breaker keeps every such mark with the text before it,
    // 2026-10-17 (layer2.mjs breakLines); and a link that is wrong, gated at 0 from the first pull request of the links,
    // 3a-0: links.mjs linksPage)
    // (and a unit whose record the run could not make: drawn and measured by nothing, run.mjs recordErrors)
    const row = { name, pages: t.pages, missing: t.missing ?? 0, twice: t.twice ?? 0, brackets: t.brackets ?? 0, duplicated: t.duplicated ?? 0, numbers: [t.numbersShown, t.numbersTotal], clipped: t.clipped ?? 0, groupsSplit: t.groupsSplit ?? 0, labelsSource: t.labelsSource ?? 0, textInDisplay: t.textInDisplay ?? 0, lineStartPunct: t.lineStartPunct ?? 0, linksWrong: t.linksWrong ?? 0, recordErrors: f.summary?.recordErrors ?? 0 }
    if (tier === 'pixel') row.lostInk = t.lostInk ?? 0
    row.fails = ['lostInk', 'missing', 'twice', 'brackets', 'duplicated', 'clipped', 'groupsSplit', 'labelsSource', 'textInDisplay', 'lineStartPunct', 'linksWrong', 'recordErrors'].filter(k => row[k] > 0)
    if (t.numbersShown < t.numbersTotal) row.fails.push('numbers')
    // (and the links' two shares held to their minimums, 3a-2, the owner's ruling: none where there is nothing to share, no
    // link or no moved record; the misses listed, the annotations not kept (`linksLost`, page:rank) and the moved records whose
    // drawn text is not the reference's (`linksFalse`, page:rank))
    // (decided on the counts, never on the share rounded for the report: 18,999 of 20,000 is below 0.95; the share alone where a
    // record has no counts)
    const counts = { linksKept: [t.linksKeptN, t.linksTotal], linksTrue: [t.linksTrueN, (t.linksMoved ?? 0) - (t.linksUnverified ?? 0)] }
    for (const [k, min] of [['linksKept', LINKS_MIN.kept], ['linksTrue', LINKS_MIN.true]]) {
      if (t[k] === null || t[k] === undefined) continue
      row[k] = t[k]
      const [n, d] = counts[k]
      if ((Number.isFinite(n) && d > 0 ? n / d : t[k]) < min - 1e-12) row.fails.push(k)
    }
    // (and each wrong link's page, rank and reasons, links.mjs linksPage's `where`: names and numbers alone)
    if (row.linksWrong > 0) row.linksWrongAt = (f.pages ?? []).flatMap(p => (p.where?.linksWrong ?? []).map(x => `p${p.p}:${x}`))
    if (row.fails.includes('linksKept')) row.linksLost = f.summary?.linksLost ?? []
    if (row.fails.includes('linksTrue')) row.linksFalse = (f.pages ?? []).flatMap(p => (p.where?.linksTrue ?? []).map(x => `${p.p}:${x}`))
    // (and the pages of arXiv's PDF whose ink the add-on's walk did not read whole, capped or timed out (no unit drawn on
    // them), or read degraded (its boxes past ink.mjs BOXES_PAGE merged): reported, not gated; null where the run made no
    // add-on or its engine tells none)
    row.ink = inkOf(f.summary?.removal?.ink)
    return row
  })
}

/**
 * The outputs a record (layer-fidelity.json's) holds in the runs a new run of `key` would be recorded over, or held to,
 * that `fixtures` (the new run's output names) lacks: for a model run its own, else the pixel run of the same key (as
 * --check reads it); for a pixel run its own and the model run of the same key, which recording it deletes. A run
 * given another folder of references is whole by itself, and recorded it would drop those outputs unseen
 */
export function droppedOutputs(record, key, fixtures) {
  const t = record?.tiers ?? {}, model = key.replace(/^pixel/, 'model'), pixel = key.replace(/^model/, 'pixel')
  const runs = key.startsWith('model') ? [t[key] ?? t[pixel]] : [t[key], t[model]]
  const have = new Set(fixtures), out = new Set()
  for (const r of runs) for (const n of Object.keys(r?.fixtures ?? {})) if (!have.has(n)) out.add(n)
  return [...out].sort()
}
