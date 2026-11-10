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
// alone, joined by that one's id (l1.ts todayUnitOf). A member whose unit holds kept runs as elements that today's held otherwise
// (its addresses, today's text; an ink unit's scripts in a text face, today's text or text and a placeholder) joins no id of
// today's: it is joined, after the ids, to today's unit of its glyphs, the same reading set on the same lines of A (l1.ts
// keptJoin, over today's prepare dump). A member neither joins is joined, last, to today's unit stage 1a states its unit holds
// whole (lab/pdf/prepare-back/stated.mjs: held whole (f), by the author block (b'), by the block's units on its line (f'), a names
// unit's stand-in of its ledger class with today's characters, the statement naming the holder): a unit whose kind moved, its id with it (an ink unit's id names its kind: rebuild/author-toggle's
// AND, today's inkorphan, v2's inknames), the coordinator's ruling of 2026-11-10, heldJoin.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { INK_KIND } from '../../../packages/engine/src/locate/today/ink-units.mjs'
import { unitId } from '../../../packages/format/src/ids.ts'
import { sourcePieces } from '../../../packages/typeset/src/lay/read.ts'
import { keptJoin, L1_BUNDLES, todayUnitOf } from '../../../packages/typeset/tests/replay/l1.ts'

const INK = new Set(Object.values(INK_KIND))
/** a member's own unit id: its text, or the ink unit's where its text names the source unit it echoes (`units` by id) */
function ownIdOf(m, units) {
  if (typeof m.text !== 'string') return null
  const named = units.get(m.text)
  if (named && INK.has(m.kind) && named.kind !== m.kind) return unitId(m.kind, named.content)
  return named ? todayUnitOf(named).id : m.text
}

/** the causes stage 1a states a unit of today's held whole by one unit of the candidate's by (stated.mjs's keys); `order` where
 *  the statement names its holder: a names unit's stand-in of its ledger class, today's characters in another order (its kind
 *  moved; the coordinator's ruling of 2026-11-10, round 8 B2b) */
const HOLDS = new Set(['held', 'names', 'heldBlock', 'order'])
/** the folder of the candidate's prepare dumps, stage 1a's statements in them: AXT_L1_DUMPS, else the one beside the bundles
 *  (a stage 1a run's `<run>/prepare`, its bundles `<run>/bundles`) */
export const L1_DUMPS = process.env.AXT_L1_DUMPS ?? join(L1_BUNDLES, '..', 'prepare')
/** a paper's statements of today's units the candidate does not make (its dump's `replaced` units with `stated`), none where
 *  lab-data holds no dump of it or the run stated none so */
export function candidateStated(paper) {
  const f = join(L1_DUMPS, `${paper}.prepare.json`)
  if (!existsSync(f)) return []
  return JSON.parse(readFileSync(f, 'utf8')).units.filter((u) => u.replaced && u.stated)
}
/**
 * The members `members` (no id or glyphs joined them), each joined to the unit of today's (`free`, today's ords no member is
 * joined to) that stage 1a states its unit holds whole (`stated`: candidateStated's), the statement naming its unit as the
 * holder: one of today's for one member; where several members of one id hold as many of today's units, by their order, as
 * the baseline joins equal ids. `same`: the two units' contents one (today's prepare dump's flat pieces, `prepared` by ord, and
 * the unit's source pieces, each its text or its element's source), so that today's row says v2's unit: the rows the lay is
 * given (gate-l1's `held`) take those alone. `units` the bundle's units by id. Returns member ord -> { today, same }
 */
export function heldJoin(members, units, stated, free, prepared = null) {
  const open = new Set(free)
  const by = new Map()
  for (const s of stated)
    if (HOLDS.has(s.stated.cause) && s.stated.holder && open.has(s.stated.ord)) {
      if (!by.has(s.stated.holder)) by.set(s.stated.holder, [])
      by.get(s.stated.holder).push(s.stated.ord)
    }
  const mine = new Map()
  for (const m of [...members].sort((a, b) => a.ord - b.ord)) {
    const id = ownIdOf(m, units)
    if (!id || !by.has(id)) continue
    if (!mine.has(id)) mine.set(id, [])
    mine.get(id).push(m)
  }
  const out = new Map()
  for (const [id, ms] of mine) {
    const ts = by.get(id).sort((a, b) => a - b)
    if (ts.length !== ms.length) continue
    ms.forEach((m, k) => {
      const t = prepared?.get(ts[k])
      const src = typeof m.text === 'string' ? units.get(m.text) : undefined
      const flat = src ? sourcePieces(todayUnitOf(src).content) : null
      const same =
        !!t &&
        !!flat &&
        t.pieces.length === flat.length &&
        t.pieces.every((p, j) => p.kind === flat[j].t && (p.kind === 'text' ? p.s === flat[j].s : (p.src ?? null) === (flat[j].src ?? null)))
      out.set(m.ord, { today: ts[k], same })
    })
  }
  return out
}

/**
 * `pages` the entry's Pages by page (each `{ members: [{ ord, … }] }`), `bundle` the paper's L1 bundle (its parts' flows and
 * its units by id: l1Paper), `units` today's units ({ ord, id }: the ledger's), `prepared` today's prepare dump's units by ord
 * (l1.ts todayPrepared; none, no join by the glyphs), `stated` the candidate's statements of today's units (candidateStated;
 * none, no join by them). Returns `{ [part ord]: { today: today's ord } }` for every member of the Pages that joins one.
 */
export function todayJoin(pages, bundle, units, prepared = null, stated = []) {
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
  // (then the members no id joined, by their glyphs: today's units no member joined, as the ledger holds them)
  if (prepared) {
    const joined = new Set(join.values())
    const ledgered = new Set(units.map((u) => u.ord))
    const free = [...members.values()].filter((m) => !join.has(m.ord))
    const left = [...prepared.values()].filter((t) => ledgered.has(t.ord) && !joined.has(t.ord))
    for (const [ord, t] of keptJoin(free, bundle.units, left)) join.set(ord, t)
  }
  // (last, the members no id or glyphs joined, by stage 1a's statement of today's unit their unit holds whole)
  if (stated.length) {
    const joined = new Set(join.values())
    const free = [...members.values()].filter((m) => !join.has(m.ord))
    const left = units.map((u) => u.ord).filter((o) => !joined.has(o))
    for (const [ord, { today }] of heldJoin(free, bundle.units, stated, left, prepared)) join.set(ord, today)
  }
  const out = {}
  for (const page of Object.values(pages)) for (const m of page.members) if (join.has(m.ord)) out[m.ord] = { today: join.get(m.ord) }
  return out
}
