// The reader's side of its cache of compiled translations (REPORT, eighteenth addendum): the seed a translation made
// again starts from, the units a record keeps, when a run writes, the figures' keys. The store itself is the
// extension's (src/cache/pdf-store.ts). Pure but for the hash, so that experiments/pdf-bilingual/spikes/cache-cases.mjs
// runs it in Node.
import { displayEdges, plainSource, plainTranslated } from './mt.mjs'

const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')
/** SHA-256 hex of bytes: arXiv's PDF, the key of its record */
export const digestOf = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes))
/** SHA-256 hex of a unit's source pieces: what a seed is matched by, whatever the unit's index */
export const sourceHash = async u => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(u.pieces))))
/** the key of a figure's boxes in the record's `figures` and the reader's map of them: their source texts, whatever the wire format */
export const figureKeyOf = texts => JSON.stringify(texts)

/**
 * The seed for this paper's units from a record: index → { pieces, by, tried, state, sentences? } for each unit whose source the
 * record has a translation of, matched by hash. A unit cut differently since has none. Repeated paragraphs (table
 * cells, often) share a hash, and each takes the best translation of their source: whole before partial (Devin on
 * #298). The hashes are kept for the record
 */
const rankOf = u => (u.state === 'whole' ? 2 : u.state === 'partial' ? 1 : 0)
export async function seedFrom(record, units) {
  const byHash = new Map()
  for (const u of record.units) if (u.pieces && rankOf(u) >= rankOf(byHash.get(u.hash) ?? { state: '' })) byHash.set(u.hash, u)
  const hashes = await Promise.all(units.map(sourceHash))
  const seed = new Map()
  hashes.forEach((h, i) => {
    const u = byHash.get(h)
    if (u) seed.set(i, { pieces: u.pieces, by: u.by, tried: u.tried, state: u.state, ...(u.sentences ? { sentences: u.sentences } : {}) })
  })
  return { seed, hashes }
}

/**
 * A run again's seed: the copy's (seedFrom), with what the visit's last run made over it (runLive's results), so that
 * only the units still missing are asked again — each with its pieces, its provenance and its sentences, which the run
 * passes on to what it shows and to the record (a seeded unit without them lit whole, the final review of the
 * highlight, m3)
 */
export function seedAgain(seed, made) {
  const out = new Map(seed ?? [])
  for (const [i, r] of made ?? []) if (r.pieces) out.set(i, { pieces: r.pieces, by: r.by, tried: r.tried, state: r.state, ...(r.sentences ? { sentences: r.sentences } : {}) })
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
    return { ...base, ...(r.pieces ? { pieces: r.pieces, tr: plainTranslated(r.pieces), ...(r.sentences ? { sentences: r.sentences } : {}) } : {}), ...(r.by !== undefined ? { by: r.by } : {}), tried: r.tried, state: r.state }
  })
}

/**
 * The left side's marks a run can go by instead of compiling the marked original: a copy's, on the same pipeline, and
 * only if it has some — a copy whose marked original failed has none, and taken as known it would never get them
 * (final review)
 */
export const knownMarks = (cached, samePipeline) => (samePipeline && cached?.marks?.length ? new Map(cached.marks) : null)

/**
 * What a run writes (REPORT, eighteenth addendum, "Writing"): the whole record when it ended with a final that
 * settled and is on screen (`shown`), since the right side's marks are read from the document shown (Devin on #298);
 * with nothing typeset changed, the units' provenance alone, if it changed, or the left side's marks, if the
 * copy had none and this run compiled them; else nothing — a run ended before its final among them
 */
export function decideWrite({ result, cached, units, marks, shown }) {
  if (result.changed) return result.settled && shown ? 'full' : null
  if (!cached) return null
  // the units compared as a whole, not by hash: repeated paragraphs share one (Devin on #298)
  const tally = us => us.map(u => `${u.hash}|${u.state}|${u.by}|${u.tried}`).sort().join('\n')
  const marksGained = !cached.marks?.length && !!marks?.length
  return tally(cached.units) !== tally(units) || marksGained ? 'provenance' : null
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
