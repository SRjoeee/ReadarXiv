// The units record a translation is kept in (each unit's kind, source text, source hash and what was made of it: unitsOf), the
// seed a record gives a paper's units (seedFrom, matched by sourceHash), and a record's right-side texts (copyTexts). Once the
// reader's cache of compiled translations; what is left is the record the lab's fixtures hold (lab/pdf/spikes/layer-fixtures.mjs,
// pack-recut.mjs; the layer gate's sources, by sourceHash) and the web's fixture export reads (copyTexts). When a run writes,
// how a copy is reused and the copy's readings went with the compiled translation (2026-11-04, the rules audit's F4).
import { groupOf } from '../translate/groups.mjs'
import { displayEdges, plainSource, plainTranslated, sentencesKept, unitText } from '../translate/mt.mjs'

const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')
/** SHA-256 hex of a unit's source pieces: what a seed is matched by, whatever the unit's index */
export const sourceHash = async u => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(u.pieces))))

/**
 * The seed for this paper's units from a record: index → { pieces, by, tried, state, sentences?, inSource? } for each unit
 * whose source the record has a translation of, matched by hash. A unit cut differently since has none. Repeated
 * paragraphs (table cells, often) share a hash, and each takes the best translation of their source: whole before partial.
 * The hashes are kept for the record. `inSource` goes with the translation: the copy's PDF set that
 * translation in the source, and a run that sets no final keeps that PDF (inSourceOf).
 * A unit whose source is the record's but for the numbers of its pairs has the record's translation too, numbered as the
 * unit is (renumbered): a pair's id is its place among its file's pairs, and a pair the front end makes earlier in the
 * file — a front matter's unit, an argument it now reads as text — moves every one after it (the front end's round of
 * 2026-10-06: 1,471 units of the corpus's 117 papers the same but for their pairs' numbers)
 */
/**
 * The state of a unit's translation, whatever is shown of it: a cell of a table group kept whole (groups.mjs) is shown in
 * the source (`kept`) but keeps what the translator gave it (`translation`: whole, partial, none or lost), which decides
 * whether it is taken again as it is; undefined for a name kept without asking, and for a kept cell of a copy made
 * before kept cells kept it (a partial cell recorded only as `kept` was taken as whole on the next run)
 */
export const translationOf = u => (u?.state === 'kept' ? u.translation : u?.state)
const keptAs = u => (u?.state === 'kept' && u.translation ? { translation: u.translation } : {})
const rankOf = u => { const t = translationOf(u); return t === 'whole' && u.pieces ? 2 : t === 'partial' ? 1 : 0 }
export async function seedFrom(record, units) {
  const byHash = new Map(), bySrc = new Map()
  for (const u of record.units) if (u.pieces && rankOf(u) >= rankOf(byHash.get(u.hash) ?? { state: '' })) byHash.set(u.hash, u)
  for (const u of record.units) if (u.pieces && typeof u.src === 'string') (bySrc.get(u.src) ?? bySrc.set(u.src, []).get(u.src)).push(u)
  const hashes = await Promise.all(units.map(sourceHash))
  const seed = new Map()
  const seedOf = (i, u, pieces) => seed.set(i, { pieces: ownNested(units[i], pieces), by: u.by, tried: u.tried, state: u.state, ...keptAs(u), ...(u.sentences ? { sentences: u.sentences } : {}), ...inSourceOf(u) })
  for (const [i, h] of hashes.entries()) {
    const u = byHash.get(h)
    if (u) { seedOf(i, u, u.pieces); continue }
    const found = await renumbered(units[i], bySrc.get(plainSource(units[i])) ?? [])
    if (found) seedOf(i, found.unit, found.pieces)
  }
  return { seed, hashes }
}
/** the ids of the pairs in pieces, a nested unit's too, in the order of their numbers: the order they stand in. A close
 *  counts as its open does: a cell may end a group an earlier cell opened */
const pairIds = (pieces, out = new Set()) => { for (const p of pieces) { if (p.t === 'open' || p.t === 'close') out.add(p.id); else if (p.t === 'nested' && p.unit?.pieces) pairIds(p.unit.pieces, out) } return [...out].sort((a, b) => a - b) }
/** the pieces with each pair's id mapped (`to`), a nested unit's too */
const renumber = (pieces, to) => pieces.map(p => ((p.t === 'open' || p.t === 'close') && to.has(p.id) ? { ...p, id: to.get(p.id) } : p.t === 'nested' && p.unit?.pieces ? { ...p, unit: { ...p.unit, pieces: renumber(p.unit.pieces, to) } } : p))
/** the record's translation of a unit whose source is that record unit's but for its pairs' numbers — the unit's pieces
 *  numbered as the record's were hash to the record's hash, each pair the n-th of both —, numbered as the unit is: the
 *  best of the record's units with its text, or null */
async function renumbered(unit, candidates) {
  const mine = pairIds(unit.pieces)
  if (!mine.length) return null
  for (const c of [...candidates].sort((a, b) => rankOf(b) - rankOf(a))) {
    const theirs = pairIds(c.pieces)
    if (theirs.length !== mine.length) continue
    const old = renumber(unit.pieces, new Map(mine.map((id, k) => [id, theirs[k]])))
    if (hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(old)))) !== c.hash) continue
    return { unit: c, pieces: renumber(c.pieces, new Map(theirs.map((id, k) => [id, mine[k]]))) }
  }
  return null
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
 * A translation's mark that a final set it in the source (CachedUnit.inSource: the author block under CJKutf8), as a record's
 * unit carries it to its seed (seedFrom) and a result to the record (unitsOf)
 */
export const inSourceOf = u => (u?.inSource ? { inSource: true } : {})

/**
 * The units a record keeps, from a run's results by index: a name kept in the
 * source is `kept`; a cell of a table group kept whole (groups.mjs) is `kept` too, with the translation its group was
 * decided by, its state (`translation`) and its sentences — no `tr`, since nothing sets it; a unit with no result was not tried, and is `none` with no `tried`, so
 * never current. A cell carries its group (groups.mjs groupOf), which the layer keeps whole as the final does
 */
export function unitsOf(units, kept, hashes, results) {
  return units.map((u, i) => {
    // a heading's depth, and whether it is the title, for the contents a stored copy lists (outline.ts)
    // and its displays beyond its marks, which the anchors take on either side (displayEdges)
    const group = groupOf(u)
    const base = { kind: u.kind, src: plainSource(u), hash: hashes[i], ...(u.title ? { title: true } : {}), ...(u.depth !== undefined ? { depth: u.depth } : {}), ...displayEdges(u), ...(group ? { group } : {}) }
    if (kept.has(u)) return { ...base, state: 'kept' }
    const r = results.get(i)
    if (!r) return { ...base, state: 'none' }
    if (r.state === 'kept') return { ...base, ...(r.pieces ? { pieces: r.pieces, ...(r.sentences ? { sentences: r.sentences } : {}) } : {}), ...(r.by !== undefined ? { by: r.by } : {}), tried: r.tried, state: 'kept', ...keptAs(r) }
    // the sentences of the translation kept, which say where each sentence begins in `src` and `tr`
    // and a translation the final set in the source (the author block under CJKutf8): kept, but not what the right side shows
    return { ...base, ...(r.pieces ? { pieces: r.pieces, tr: plainTranslated(r.pieces), ...(r.sentences ? { sentences: r.sentences } : {}) } : {}), ...(r.by !== undefined ? { by: r.by } : {}), tried: r.tried, state: r.state, ...inSourceOf(r) }
  })
}

/**
 * The right side's texts of a stored copy, by unit (the web's scripts/export-fixture.mjs anchors its PDF by them): a unit's translation
 * made again from the pieces the copy keeps (unitText), which say where their placeholders stood; its source's plain
 * text where it has no translation, or where the final set its translation in the source (inSource). A copy made before
 * its units kept their displays beyond their marks (displayEdges) is anchored as it was then, and one made before they
 * kept their sentences is lit whole; their sentences only where of their shape and the text made again is the one they
 * were counted in (the review of B3, minor 5: a malformed field took the highlight off a side)
 */
export const copyTexts = units => units.map((u, i) => {
  const t = u.pieces && !u.inSource && u.state !== 'kept' ? unitText(u.pieces) : { text: u.src }, s = u.pieces && u.tr === t.text ? sentencesKept(u.sentences, u.src, t.text) : null
  return { id: i, ...t, ...displayEdges(u), ...(s ? { sentences: s } : {}) }
})
