// The reader's side of its cache of compiled translations (REPORT, eighteenth addendum): the seed a translation made
// again starts from, the units a record keeps, when a run writes, the figures' entries. The store itself is the
// extension's (src/cache/pdf-store.ts, through lib/axt/extension.mjs). Pure but for the hash, so that
// spikes/cache-cases.mjs runs it in Node.
import { plainSource, plainTranslated } from './mt.mjs'

const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')
/** SHA-256 hex of bytes: arXiv's PDF, the key of its record */
export const digestOf = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes))
/** SHA-256 hex of a unit's source pieces: what a seed is matched by, whatever the unit's index */
export const sourceHash = async u => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(u.pieces))))
/** the key of a figure's text in the record's `figures` and in the reader's map of them */
export const figureKey = (format, wire) => `${format}\n${wire}`

/**
 * The seed for this paper's units from a record: index → { pieces, by, tried, state } for each unit whose source the
 * record has a translation of, matched by hash. A unit cut differently since has none. The hashes are kept for the record
 */
export async function seedFrom(record, units) {
  const byHash = new Map(record.units.filter(u => u.pieces).map(u => [u.hash, u]))
  const hashes = await Promise.all(units.map(sourceHash))
  const seed = new Map()
  hashes.forEach((h, i) => {
    const u = byHash.get(h)
    if (u) seed.set(i, { pieces: u.pieces, by: u.by, tried: u.tried, state: u.state })
  })
  return { seed, hashes }
}

/**
 * The units a record keeps (src/cache/pdf-record.ts CachedUnit), from a run's results by index: a name kept in the
 * source is `kept`; a unit with no result was not tried, and is `none` with no `tried`, so never current
 */
export function unitsOf(units, kept, hashes, results) {
  return units.map((u, i) => {
    const base = { kind: u.kind, src: plainSource(u), hash: hashes[i] }
    if (kept.has(u)) return { ...base, state: 'kept' }
    const r = results.get(i)
    if (!r) return { ...base, state: 'none' }
    return { ...base, ...(r.pieces ? { pieces: r.pieces, tr: plainTranslated(r.pieces) } : {}), ...(r.by !== undefined ? { by: r.by } : {}), tried: r.tried, state: r.state }
  })
}

/**
 * What a run writes (REPORT, eighteenth addendum, "Writing"): the whole record when it ended with a final that
 * settled; with nothing typeset changed, the units' provenance alone, if it changed; else nothing — a run ended
 * before its final among them
 */
export function decideWrite({ result, cached, units }) {
  if (result.changed) return result.settled ? 'full' : null
  if (!cached) return null
  const before = new Map(cached.units.map(u => [u.hash, `${u.state}|${u.by}|${u.tried}`]))
  return units.some(u => before.get(u.hash) !== `${u.state}|${u.by}|${u.tried}`) ? 'provenance' : null
}
