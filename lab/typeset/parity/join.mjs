// lab/typeset/parity/join.mjs: the parity's join of v2's members to today's units, which v2.mjs writes into its file
// (`today`: part ord -> today's ord) and measure.mjs keys both sides by. Every member the entry's Pages carry is joined, laid
// or not and whatever gate-l1's runner did with it (its stops record nothing): the join is the part's and today's, not a lay's.
// The baseline's rule: a member's unit id, its rank among the part's members of that id by ord, today's unit of that id at
// that rank by ord. A member's unit id is its text, but an ink unit's that echoes a source unit: the part names the echoed
// unit's id as its text (packages/engine/src/bundle/bundle.ts placedOf, `echo ?? mem.id`: a contents line its heading's, a
// note its source footnote's, an author block's names their author's), its kind its own; locate made it of the echoed
// content (locate/ink.ts), so its own id is the format's unitId over its kind and that content, today's id of the ink unit.
// Echoes are ink units' alone (inkUnitsOf's kinds, INK_KIND): a figure text's placement, of kind 'figure' over its unit of
// kind 'inkfigures', names its own unit; one whose glyphs set a run in another face holds a group of it, today's unit its text
// alone, joined by that one's id (l1.ts todayUnitOf).
import { INK_KIND } from '../../../packages/engine/src/locate/today/ink-units.mjs'
import { unitId } from '../../../packages/format/src/ids.ts'
import { todayUnitOf } from '../../../packages/typeset/tests/replay/l1.ts'

const INK = new Set(Object.values(INK_KIND))
/** a member's own unit id: its text, or the ink unit's where its text names the source unit it echoes (`units` by id) */
function ownIdOf(m, units) {
  if (typeof m.text !== 'string') return null
  const named = units.get(m.text)
  if (named && INK.has(m.kind) && named.kind !== m.kind) return unitId(m.kind, named.content)
  return named ? todayUnitOf(named).id : m.text
}

/**
 * `pages` the entry's Pages by page (each `{ members: [{ ord, … }] }`), `bundle` the paper's L1 bundle (its parts' flows and
 * its units by id: l1Paper), `units` today's units ({ ord, id }: the ledger's). Returns `{ [part ord]: { today: today's ord } }`
 * for every member of the Pages that joins one.
 */
export function todayJoin(pages, bundle, units) {
  const byId = new Map()
  for (const u of [...units].sort((a, b) => a.ord - b.ord)) {
    if (!u.id) continue
    if (!byId.has(u.id)) byId.set(u.id, [])
    byId.get(u.id).push(u.ord)
  }
  // (every member of the part once, from the first page that holds it)
  const members = new Map()
  for (const part of bundle.parts.values()) for (const flow of part.flows) for (const m of flow) if (!members.has(m.ord)) members.set(m.ord, m)
  const join = new Map()
  const rank = new Map()
  for (const [ord, m] of [...members].sort((a, b) => a[0] - b[0])) {
    const id = ownIdOf(m, bundle.units)
    if (!id) continue
    const k = rank.get(id) ?? 0
    rank.set(id, k + 1)
    const t = byId.get(id)?.[k]
    if (t !== undefined) join.set(ord, t)
  }
  const out = {}
  for (const page of Object.values(pages)) for (const m of page.members) if (join.has(m.ord)) out[m.ord] = { today: join.get(m.ord) }
  return out
}
