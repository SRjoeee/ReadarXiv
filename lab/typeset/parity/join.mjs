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
import { HOLDER_JOIN } from '../../pdf/prepare-back/stated.mjs'
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

/** the causes stage 1a states a unit of today's held whole by one unit of the candidate's by, the statement naming the holder
 *  (stated.mjs's HOLDER_JOIN 'whole': (f), (b'), (f'), a names unit's stand-in of its ledger class (`order`), (l') `seen`, (k) by
 *  group `pitchGroup`, (o) `characters`): read from stage 1a's own table, so that a cause it states with a holder is joined as it
 *  declares (round 8 B8: this list, kept here by hand, had gained `pitchGroup` and not `characters`) */
const HOLDS = new Set(Object.keys(HOLDER_JOIN).filter((cause) => HOLDER_JOIN[cause] === 'whole'))
/** the causes the joined join reads: those and today's unit now wholly an element of the holder that keeps it as the original's
 *  ink, (k) on elements and (n) (HOLDER_JOIN 'element': `pitch`, `decoration`, lane fig-text): one of the units the holder holds
 *  in order, its text the element's */
const JOINS = new Set(Object.keys(HOLDER_JOIN))
/** the folder of the candidate's prepare dumps, stage 1a's statements in them: AXT_L1_DUMPS, else the one beside the bundles
 *  (a stage 1a run's `<run>/prepare`, its bundles `<run>/bundles`) */
export const L1_DUMPS = process.env.AXT_L1_DUMPS ?? join(L1_BUNDLES, '..', 'prepare')
/** a paper's statements of today's units the candidate does not make (its dump's `replaced` units with `stated`), none where
 *  lab-data holds no dump of it or the run stated none so */
export function candidateStated(paper, dumps = L1_DUMPS) {
  const f = join(dumps, `${paper}.prepare.json`)
  if (!existsSync(f)) return []
  return JSON.parse(readFileSync(f, 'utf8')).units.filter((u) => u.replaced && u.stated)
}
/**
 * The members the candidate's prepare keeps by a rule's mark `by` (its dump's `keptBy`, lab/pdf/prepare-back/run.mjs): 'pitch',
 * text set wholly in a face of one pitch (Rule 1, PDF-READER §18.22, the engine's InstrumentUnit `pitch`); 'address', a kept
 * block of e-mail addresses and their separators alone (the engine's `address`); 'identifier', a figure text kept for an
 * identifier it holds (the engine's `figure: identifier`, PDF-READER §18.25). By the member ords the run's located file joins
 * their dump ords to (`dumpOrds`); none where lab-data holds no dump or located file of it. The verdict reads no other unit v2
 * leaves the original's as kept by a rule (the owner's and the coordinator's rulings of 2026-11-10)
 */
export function candidateKept(paper, by, dumps = L1_DUMPS) {
  const f = join(dumps, `${paper}.prepare.json`),
    g = join(dumps, '..', 'located', `${paper}.json`)
  if (!existsSync(f) || !existsSync(g)) return []
  const ords = new Set(JSON.parse(readFileSync(f, 'utf8')).units.filter((u) => !u.replaced && u.keptBy === by).map((u) => u.ord))
  return (JSON.parse(readFileSync(g, 'utf8')).dumpOrds ?? []).filter(([d]) => ords.has(d)).map(([, m]) => m)
}
/**
 * The ink of the elements the candidate's prepare keeps as the original's, by member (the coordinator's ruling 1 on F0,
 * 2026-11-10): a figure text's element its dump marks `keptBy` 'pitch' (its run of one pitch, F0) or 'decoration' (a stretch a
 * frame, an underline or a tone holds, (n)). `[member ord, [page, x0, y0, x1, y1][]]`, each element's segments, by the member
 * its unit is joined to (`dumpOrds`); none where lab-data holds no dump or located file of it
 */
export function candidateKeptElements(paper, dumps = L1_DUMPS) {
  const f = join(dumps, `${paper}.prepare.json`),
    g = join(dumps, '..', 'located', `${paper}.json`)
  if (!existsSync(f) || !existsSync(g)) return []
  const KEPT = new Set(['pitch', 'decoration'])
  const ink = new Map()
  for (const u of JSON.parse(readFileSync(f, 'utf8')).units) {
    if (u.replaced) continue
    const boxes = (u.elements ?? [])
      .filter((e) => KEPT.has(e.keptBy))
      .flatMap((e) => (e.segs ?? []).map((k) => [k.page, k.x0, Math.min(k.top, k.bottom), k.x1, Math.max(k.top, k.bottom)]))
    if (boxes.length) ink.set(u.ord, boxes)
  }
  return (JSON.parse(readFileSync(g, 'utf8')).dumpOrds ?? []).filter(([d]) => ink.has(d)).map(([d, m]) => [m, ink.get(d)])
}
/** the members the candidate's prepare keeps for their text set wholly in a face of one pitch (candidateKept's 'pitch') */
export const candidatePitch = (paper, dumps = L1_DUMPS) => candidateKept(paper, 'pitch', dumps)
/** the members the candidate's prepare keeps as a line of e-mail addresses (candidateKept's 'address') */
export const candidateAddress = (paper, dumps = L1_DUMPS) => candidateKept(paper, 'address', dumps)
/**
 * Today's units the candidate's prepare states kept by a rule's mark, `[today's ord, mark]`: a statement of its dump's (stage
 * 1a's, stated.mjs) carrying `keptBy`, a unit of today's the candidate makes no unit of for the rule (a cell of identifiers
 * alone, a line of ink of them a kept block holds); none where lab-data holds no dump of it
 */
export function candidateKeptToday(paper, dumps = L1_DUMPS) {
  return candidateStated(paper, dumps)
    .filter((u) => u.keptBy)
    .map((u) => [u.stated.ord, u.keptBy])
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
 * How several of today's units say one unit of v2's (lane fig-text: F0's line, a figure paragraph; fig-smallcaps' word joined
 * across a size change, 2608.06701v1 p1's "…th" | "e…"), by the exact text: today's texts in their order (`texts`, each a
 * unit's text as the prepare dump states it), white space aside, are v2's unit's text (`content`, its pieces: its text, and each
 * element its source's text), each of today's a run of v2's text pieces or one element whole, a line-end hyphen of today's
 * standing where v2's text has none (a word TeX broke) left out. Returns the plan v2's row is said by, each piece of v2's in its
 * order: { t: 'today', i } (today's i-th unit's row: its text), { t: 'el', id } (v2's element, a kept one where today's said
 * it, else carried as v2 carries it); null where the texts are not one
 */
export function joinedPlan(texts, content) {
  // (v2's unit as a stream of characters, white space aside, each with what it is: a text piece's, or an element's)
  const stream = []
  const walk = (ps) => {
    for (const p of ps) {
      if (p.t === 'text') for (const c of p.s.replace(/\s+/gu, '')) stream.push({ c, el: null })
      else if (p.t === 'span') walk(p.content)
      else if (p.t === 'el') for (const c of (p.src ?? '').replace(/\s+/gu, '')) stream.push({ c, el: p.id })
    }
  }
  walk(content)
  // (each of today's in its order where it stands in the stream: its start, and what it is there)
  const pieces = []
  const used = new Set()
  let at = 0
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i].replace(/\s+/gu, '')
    if (!t) return null
    const from = at
    for (let j = 0; j < t.length; j++) {
      if (stream[at]?.c === t[j]) at++
      // (a line-end hyphen of today's, v2's text going on without it: TeX's break of a word)
      else if (j === t.length - 1 && /^[-‐­]$/u.test(t[j]) && i + 1 < texts.length) continue
      else return null
    }
    const els = new Set(stream.slice(from, at).map((x) => x.el))
    if (els.size !== 1) return null
    const [el] = els
    if (el !== null) {
      // (one element whole: today's unit its text alone)
      if (stream.filter((x) => x.el === el).length !== at - from || used.has(el)) return null
      used.add(el)
      pieces.push({ from, piece: { t: 'el', id: el } })
    } else pieces.push({ from, piece: { t: 'today', i } })
  }
  if (at !== stream.length) return null
  // (v2's elements today held in no unit of its own, each where it stands)
  stream.forEach((x, k) => {
    if (x.el !== null && !used.has(x.el)) {
      used.add(x.el)
      pieces.push({ from: k, piece: { t: 'el', id: x.el } })
    }
  })
  return pieces.sort((a, b) => a.from - b.from).map((x) => x.piece)
}

/**
 * The members `members` (no id or glyphs joined them) each of which stage 1a states holds two or more of today's units whole
 * (`stated`: candidateStated's, the statement naming its unit as the holder), the member alone of its id, and whose text is
 * theirs in order (joinedPlan): member ord -> { todays: today's ords in order, plan }. `units` the bundle's units by id,
 * `prepared` today's prepare dump's units by ord (their texts)
 */
export function joinedJoin(members, units, stated, free, prepared = null) {
  if (!prepared) return new Map()
  const open = new Set(free)
  const by = new Map()
  for (const s of stated)
    if (JOINS.has(s.stated.cause) && s.stated.holder && open.has(s.stated.ord)) {
      if (!by.has(s.stated.holder)) by.set(s.stated.holder, [])
      by.get(s.stated.holder).push(s.stated.ord)
    }
  // (the holder a statement names is the candidate's unit, its own id: a member's unit's id, or the id today's unit of it would
  // have (todayUnitOf: its kept runs read as text), each held by one member alone)
  const count = new Map()
  for (const m of members)
    for (const id of new Set([ownIdOf(m, units), typeof m.text === 'string' ? m.text : null]))
      if (id) count.set(id, (count.get(id) ?? 0) + 1)
  const out = new Map()
  for (const m of members) {
    const own = ownIdOf(m, units)
    const id = typeof m.text === 'string' && by.has(m.text) ? m.text : own
    const ts = id && count.get(id) === 1 ? (by.get(id) ?? []).sort((a, b) => a - b) : []
    if (ts.length < 2) continue
    const src = typeof m.text === 'string' ? units.get(m.text) : undefined
    const texts = ts.map((t) => prepared.get(t)?.text)
    if (!src || texts.some((t) => typeof t !== 'string')) continue
    const plan = joinedPlan(texts, src.content)
    if (plan) out.set(m.ord, { todays: ts, plan })
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
