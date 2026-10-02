// The reader's side of its cache of compiled translations (REPORT, eighteenth addendum): the seed a translation made
// again starts from, the units a record keeps, when a run writes, the figures' keys. The store itself is the
// extension's (src/cache/pdf-store.ts). Pure but for the hash, so that experiments/pdf-bilingual/spikes/cache-cases.mjs
// runs it in Node.
import { displayEdges, plainSource, plainTranslated, sentencesKept, unitText } from './mt.mjs'

const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')
/** SHA-256 hex of bytes: arXiv's PDF, the key of its record */
export const digestOf = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes))
/** SHA-256 hex of a unit's source pieces: what a seed is matched by, whatever the unit's index */
export const sourceHash = async u => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(u.pieces))))
/** the key of a figure's boxes in the record's `figures` and the reader's map of them: their source texts, whatever the wire format */
export const figureKeyOf = texts => JSON.stringify(texts)

/**
 * The seed for this paper's units from a record: index → { pieces, by, tried, state, sentences?, inSource? } for each unit
 * whose source the record has a translation of, matched by hash. A unit cut differently since has none. Repeated
 * paragraphs (table cells, often) share a hash, and each takes the best translation of their source: whole before partial
 * (Devin on #298). The hashes are kept for the record. `inSource` goes with the translation: the copy's PDF set that
 * translation in the source, and a run that sets no final keeps that PDF (inSourceOf)
 */
const rankOf = u => (u.state === 'whole' ? 2 : u.state === 'partial' ? 1 : 0)
export async function seedFrom(record, units) {
  const byHash = new Map()
  for (const u of record.units) if (u.pieces && rankOf(u) >= rankOf(byHash.get(u.hash) ?? { state: '' })) byHash.set(u.hash, u)
  const hashes = await Promise.all(units.map(sourceHash))
  const seed = new Map()
  hashes.forEach((h, i) => {
    const u = byHash.get(h)
    if (u) seed.set(i, { pieces: ownNested(units[i], u.pieces), by: u.by, tried: u.tried, state: u.state, ...(u.sentences ? { sentences: u.sentences } : {}), ...inSourceOf(u) })
  })
  return { seed, hashes }
}
/**
 * A record's pieces with each nested piece the unit's own again. A unit nested in another — a footnote in a paragraph,
 * an author's \thanks — is set where the outer unit's piece stands, by that piece's own unit (latex-front.mjs patch);
 * the record holds a copy of it, by which no translation is found: a seeded paragraph set its note in the source, its
 * marks unnamed, on every re-set (2608.02163's authors' notes in English where its first visit set them in Chinese).
 * Matched by what the piece stands for — its braces and its unit's source —, each own piece once, as the translation
 * placed them; the same source matched by hash has the same nested pieces
 */
const ownNested = (unit, pieces) => {
  if (!pieces.some(p => p.t === 'nested')) return pieces
  const own = unit.pieces.filter(p => p.t === 'nested'), used = new Set()
  const same = (a, b) => a.pre === b.pre && a.post === b.post && JSON.stringify(a.unit?.pieces) === JSON.stringify(b.unit?.pieces)
  return pieces.map(p => {
    if (p.t !== 'nested') return p
    const k = own.findIndex((q, j) => !used.has(j) && same(q, p))
    if (k < 0) return p
    used.add(k)
    return own[k]
  })
}

/**
 * A translation's mark that a final set it in the source (CachedUnit.inSource: the author block under CJKutf8), as a seed
 * or a run's result carries it (Devin and Codex on #309): the mark is the PDF's, and a run that sets no final writes the
 * units' provenance over the copy's PDF (decideWrite), which still sets that translation in the source. So it goes with
 * the translation, from the record to the seed (seedFrom), to the run again's seed (seedAgain) and to the run's results
 * (live.mjs runLive), and only a final that sets the unit again says anew whether it set it in the source
 */
export const inSourceOf = u => (u?.inSource ? { inSource: true } : {})

/**
 * A run again's seed: the copy's (seedFrom), with what the visit's last run made over it (runLive's results), so that
 * only the units still missing are asked again — each with its pieces, its provenance, its sentences and its mark of a
 * final that set it in the source, which the run passes on to what it shows and to the record (a seeded unit without
 * its sentences lit whole, the final review of the highlight, m3)
 */
export function seedAgain(seed, made) {
  const out = new Map(seed ?? [])
  for (const [i, r] of made ?? []) if (r.pieces) out.set(i, { pieces: r.pieces, by: r.by, tried: r.tried, state: r.state, ...(r.sentences ? { sentences: r.sentences } : {}), ...inSourceOf(r) })
  return out
}

/**
 * The seeds a run takes as they are, never asking the service again (`current`; the evaluation's ruling 4,
 * 2026-10-01: a change to the typesetting alone sent about a third of a paper's characters again, answered only where the
 * background's 30-day cache still held them). A seed is taken when it is whole, made by the identity that would answer
 * now, and of the wire the unit is sent as now: the visit's own last run's (`made`), or the copy's when the copy was
 * made by this translation pipeline in this wire format (`copyWire`) — the same pipeline cuts the same units and writes
 * the same wire for the same source, which its hash matched. Any other seed is sent again, its translation shown meanwhile
 */
export function reusable(seed, { identity, copyWire, made = null }) {
  const out = new Map()
  for (const [i, s] of seed ?? []) out.set(i, { ...s, current: s.state === 'whole' && !!s.pieces && s.by === identity && (copyWire || !!made?.get(i)?.pieces) })
  return out
}

/**
 * The units a record keeps (src/cache/pdf-record.ts CachedUnit), from a run's results by index: a name kept in the
 * source is `kept`; a unit with no result was not tried, and is `none` with no `tried`, so never current
 */
export function unitsOf(units, kept, hashes, results) {
  return units.map((u, i) => {
    // a heading's depth, and whether it is the title, for the contents a stored copy lists (outline.ts)
    // and its displays beyond its marks, which the anchors take on either side (displayEdges)
    const base = { kind: u.kind, src: plainSource(u), hash: hashes[i], ...(u.title ? { title: true } : {}), ...(u.depth !== undefined ? { depth: u.depth } : {}), ...displayEdges(u) }
    if (kept.has(u)) return { ...base, state: 'kept' }
    const r = results.get(i)
    if (!r) return { ...base, state: 'none' }
    // the sentences of the translation kept, which say where each sentence begins in `src` and `tr`
    // and a translation the final set in the source (the author block under CJKutf8): kept, but not what the right side shows
    return { ...base, ...(r.pieces ? { pieces: r.pieces, tr: plainTranslated(r.pieces), ...(r.sentences ? { sentences: r.sentences } : {}) } : {}), ...(r.by !== undefined ? { by: r.by } : {}), tried: r.tried, state: r.state, ...inSourceOf(r) }
  })
}

/**
 * The right side's texts of a stored copy, by unit (session.mjs showCached anchors its PDF by them): a unit's translation
 * made again from the pieces the copy keeps (unitText), which say where their placeholders stood; its source's plain
 * text where it has no translation, or where the final set its translation in the source (inSource). A copy made before
 * its units kept their displays beyond their marks (displayEdges) is anchored as it was then, and one made before they
 * kept their sentences is lit whole; their sentences only where of their shape and the text made again is the one they
 * were counted in (the review of B3, minor 5: a malformed field took the highlight off a side)
 */
export const copyTexts = units => units.map((u, i) => {
  const t = u.pieces && !u.inSource ? unitText(u.pieces) : { text: u.src }, s = u.pieces && u.tr === t.text ? sentencesKept(u.sentences, u.src, t.text) : null
  return { id: i, ...t, ...displayEdges(u), ...(s ? { sentences: s } : {}) }
})

/**
 * The left side's marks a run can go by instead of compiling the marked original: a copy's, on the same pipeline, and
 * only if it has some — a copy whose marked original failed has none, and taken as known it would never get them
 * (final review)
 */
export const knownMarks = (cached, samePipeline) => (samePipeline && cached?.marks?.length ? new Map(cached.marks) : null)

/**
 * The marked original's readings (live.mjs readingsOf) as the store keeps them, one per paper (src/cache/pdf-record.ts
 * OriginalReadings), with the left side's marks, under the versions `made` { pipeline, typesetting, page } that made
 * them: JSON, the marks' Map as its entries
 */
export const originalRow = (readings, left, made) => ({ pipeline: made.pipeline, typesetting: made.typesetting, page: made.page, log: readings.log, cites: readings.cites, labels: readings.labels, bbl: readings.bbl, marks: { ...readings.marks, marks: [...readings.marks.marks] }, left })
/**
 * A stored original's readings and left marks, { readings, left }, where this pipeline (the units the marks name), this
 * typesetting (the original's TeX, how its PDF is read) and this TeX page made them, and the left side's marks are
 * there: a run with them compiles no original (live.mjs runLive `original`); else null, and the original is compiled
 */
export const knownOriginal = (row, now) => (row && row.pipeline === now.pipeline && row.typesetting === now.typesetting && row.page === now.page && row.left?.length ? { readings: { log: row.log, cites: row.cites, labels: row.labels, bbl: row.bbl, marks: { ...row.marks, marks: new Map(row.marks.marks) } }, left: row.left } : null)

/**
 * What a run writes (REPORT, eighteenth addendum, "Writing"): the whole record when it ended with a final that
 * settled and is on screen (`shown`: this run's own final), since the right side's marks are read from the document shown
 * (Devin on #298); with nothing typeset changed — every unit's text the copy's PDF sets —, the units' provenance alone, if
 * it changed, or the left side's marks, if the copy had none and this run compiled them; else nothing — a run ended
 * before its final among them
 */
export function decideWrite({ result, cached, units, marks, shown }) {
  if (result.changed) return result.settled && shown ? 'full' : null
  if (!cached) return null
  // the units compared as a whole, not by hash: repeated paragraphs share one (Devin on #298)
  const tally = us => us.map(u => `${u.hash}|${u.state}|${u.by}|${u.tried}`).sort().join('\n')
  // a provenance write keeps the copy's PDF, so only units that set what it sets — the same text, set in the source or
  // not as there — are written over it: a run that changed nothing against its seed may still hold a translation the
  // copy's PDF does not set (C1 of #309's fix round: a run again seeded with a last run's translation whose final never
  // reached the screen wrote it over a PDF that sets the old one, labelled current)
  const typeset = us => us.map(u => `${u.hash}|${u.tr ?? ''}|${u.inSource ? 1 : 0}`).sort().join('\n')
  if (typeset(cached.units) !== typeset(units)) return null
  const marksGained = !cached.marks?.length && !!marks?.length
  return tally(cached.units) !== tally(units) || marksGained ? 'provenance' : null
}

/**
 * What a visit holds between its runs (C1 of #309's fix round): whether the translation its last runs made is one no PDF
 * on hand sets. A run whose translation changed (runLive's `changed`) and whose own final did not reach the screen
 * (`shown`: the TeX page down, a final that did not settle) leaves the next run seeded with that translation
 * (seedAgain), which it would find unchanged; so it is held until a run's own final is shown — a final an earlier run
 * showed sets an earlier translation
 */
export const unsetAfter = (unset, result, shown) => (unset || !!result?.changed) && !shown
/**
 * Whether a seeded run that changes nothing typeset compiles nothing (runLive's `pipelineCurrent`): its seed is what a PDF
 * on hand sets — the copy's, set by this pipeline and typesetting (`copy`), or a final this visit showed (`finalShown`) —
 * and the visit holds no translation that none sets (`unset`, unsetAfter)
 */
export const pipelineCurrentFor = ({ copy, finalShown, unset }) => !unset && (copy || finalShown)

/**
 * The versions a write labels its record with (`how`, decideWrite's), or null where it writes nothing (the F2 review's
 * M3): a full write this run's — with no typesetting where a passing failure kept the rule from its final (live.mjs
 * runLive `passing`), so that the next visit sets it again, asking the service nothing —; a provenance write keeps the
 * copy's PDF, and so the copy's typesetting, and is made only on the copy's own pipeline, whose units these are
 */
export function labelOf(how, { pipeline, typesetting, passing, cached }) {
  if (how === 'full') return { pipeline, typesetting: passing ? undefined : typesetting }
  if (how === 'provenance' && cached?.pipeline === pipeline) return { pipeline, typesetting: cached.typesetting }
  return null
}

/**
 * Whether a run whose translation none of the ways could set may leave the untypeset mark under `identity`, the one that
 * would answer now: only when every unit the run tried came back whole from it, and there is one. The mark answers the
 * next visit on that identity alone (src/cache/pdf-record.ts stillUntypeset), so it must stand for that service's whole
 * translation, as a copy is current only when every unit is (unitIsCurrent). The rule errs toward asking again: a retry
 * wasted is cheaper than a wrong "cannot typeset", which the visits after it would never question.
 * - A unit left `none` or `lost`, or `partial`, leaves none: the run did not make the whole translation, and another
 *   try could (Codex 6 on #306). The run's results hold every unit it tried — the mark is left only once translation
 *   has ended and was not stopped (live.mjs awaits it), so every unit sent has its result.
 * - A run a hand-over or a demotion mixed — the reader's key refused midway and the free service finishing — leaves
 *   none: the service that would answer then never translated the whole paper (the final review of Codex 1 on #306).
 * - A run with nothing tried leaves none: its failure was not a translation's.
 * - Names kept in the source (nameCells) are never sent (live.mjs `todo`), so they have no result and do not block.
 */
export function allTranslatedBy(results, identity) {
  const tried = [...results.values()]
  return tried.length > 0 && tried.every(r => r.state === 'whole' && r.by === identity)
}
