// The rows (the layer-only plan of 2026-10-08, §4.1; A2's E6): one translation path for the web reader and the extension.
// A language's translation travels as compact rows that refer to the bundle's units by index: each row is one unit as
// mt.mjs translateUnits gave it, every translated text the string the engine holds (TeX-escaped) and every other piece the
// index `k` of the unit's own source piece in the bundle (layer/pieces.mjs kOfSource), so that a row carries what the
// translation changed and nothing of the source. unitOf makes v0's unit of a row again; layerRows gives the rows the
// results so far allow, a table's group decided (groups.mjs) before any of its cells is given; toTranslate and batchesOf
// are what a language sends, and runRows is the whole loop for the extension.
//
// Everything here works on the bundle's `units` alone, whichever form the bundle has (the written one, or the read one
// with its dropped units null at their index): the source units mt.mjs and groups.mjs work on are rebuilt from them once
// per bundle (sourceUnitsOf). Imports no run (live.mjs), remover or layout maker: both readers load it. A bundle that
// did not go through readBundle is read with the same care a row is: a unit of no shape is a dropped one, a row of no
// shape is no row, and neither throws.
import { decideGroups, groupOf } from '../groups.mjs'
import { kOfSource } from '../layer/pieces.mjs'
import { plainSource, translateUnits } from '../mt.mjs'
import { authorsTranslated } from '../scripts.mjs'
import { UNIT_FLAG_BITS } from './bundle.mjs'

/** the characters of plain source a batch holds at most: the first small, so that it comes back soon, then larger (runLive
 *  sends the same) */
export const FIRST_BATCH = 2500
export const NEXT_BATCH = 12000
/** the states of a row, and those a translation gives (a kept one is a table cell held whole in its source) */
const STATES = new Set(['whole', 'partial', 'none', 'lost', 'kept'])
const GIVEN = new Set(['whole', 'partial', 'none', 'lost'])
const EDGES = ['lead', 'trail', 'inner']

/**
 * A batch: units from the front of `order`, as many as hold `max` characters (`sizeOf(i)` each), a unit never split and a
 * batch never empty (a unit over the limit goes alone). One rule for the extension's run (runLive's batches) and for
 * batchesOf
 */
export function batchOf(order, sizeOf, max) {
  const batch = []
  let chars = 0
  for (const i of order) {
    const n = sizeOf(i)
    if (batch.length && chars + n > max) break
    batch.push(i)
    chars += n
  }
  return batch
}

// ---------------------------------------------------------------- the bundle's source units
/** a piece as openPaper makes it, from the bundle's: the piece carries its index `k` among its unit's pieces, the one a
 *  row names it by. A nested piece's unit is the rebuilt unit before this one, if that stands; null where the piece has no
 *  shape of the six */
function pieceFrom(p, k, at, units) {
  if (!Array.isArray(p)) return null
  const str = i => typeof p[i] === 'string'
  switch (p[0]) {
    case 0: return p.length === 2 && str(1) ? { t: 'text', s: p[1], k } : p.length === 3 && str(1) && str(2) ? { t: 'text', s: p[1], src: p[2], k } : null
    case 1: return p.length === 2 && str(1) ? { t: 'ph', src: p[1], k } : null
    case 2: case 3: return p.length === 3 && Number.isInteger(p[1]) && str(2) ? { t: p[0] === 2 ? 'open' : 'close', id: p[1], src: p[2], k } : null
    case 4: return p.length === 4 && str(1) && Number.isInteger(p[2]) && p[2] >= 0 && p[2] < at && units[p[2]] && str(3) ? { t: 'nested', pre: p[1], unit: units[p[2]], post: p[3], k } : null
    default: return null
  }
}
/** a unit as openPaper makes it, from the bundle's [kind, flags, depth, cell, edges, pieces]; null where it has no shape */
function unitFrom(b, at, units) {
  if (!Array.isArray(b) || b.length !== 6) return null
  const [kind, flags, depth, cell, edges, list] = b
  if (typeof kind !== 'string' || !Number.isInteger(flags) || !Array.isArray(list)) return null
  const pieces = []
  for (let k = 0; k < list.length; k++) {
    const p = pieceFrom(list[k], k, at, units)
    if (!p) return null
    pieces.push(p)
  }
  const u = { kind, pieces }
  if (flags & UNIT_FLAG_BITS.TITLE) u.title = true
  if (flags & UNIT_FLAG_BITS.FRONT) u.front = true
  if (flags & UNIT_FLAG_BITS.BRACKETED) u.bracketed = true
  if (Number.isInteger(depth)) u.depth = depth
  if (cell !== null) {
    if (cell === undefined || typeof cell !== 'object' || ![cell.table, cell.row, cell.col, cell.span].every(Number.isInteger) || typeof cell.head !== 'boolean') return null
    u.cell = { table: cell.table, row: cell.row, col: cell.col, span: cell.span, head: cell.head }
  }
  if (edges !== null && edges !== undefined && typeof edges === 'object') for (const e of EDGES) if (typeof edges[e] === 'string') u[e] = edges[e]
  return u
}

const NOTHING = Object.freeze({ units: Object.freeze([]), kept: new Set(), keptAll: new Set(), cells: [], idOf: new Map(), plain: [] })
/** the source units of each bundle, built once: the units (null where dropped), the units the pipeline keeps (the KEPT
 *  flag: openPaper's `kept`), those with the author block's added, the table cells, each unit's id, and its plain
 *  source, worked out when asked */
const SOURCES = new WeakMap()
function sourceOf(bundle) {
  if (bundle === null || typeof bundle !== 'object') return NOTHING
  let s = SOURCES.get(bundle)
  if (s) return s
  const list = Array.isArray(bundle.units) ? bundle.units : []
  const units = new Array(list.length).fill(null), kept = new Set()
  for (let i = 0; i < list.length; i++) {
    const u = unitFrom(list[i], i, units)
    units[i] = u
    if (u && list[i][1] & UNIT_FLAG_BITS.KEPT) kept.add(u)
  }
  const present = units.filter(Boolean)
  s = { units, kept, keptAll: new Set([...kept, ...present.filter(u => u.kind === 'author')]), cells: present.filter(u => u.cell), idOf: new Map(units.flatMap((u, i) => (u ? [[u, i]] : []))), plain: new Array(units.length) }
  SOURCES.set(bundle, s)
  return s
}
/** a unit's plain source (mt.mjs plainSource), once */
const plainOf = (s, id) => (s.plain[id] ??= plainSource(s.units[id]))
/**
 * The bundle's units as the unit objects mt.mjs works on (serialize, rehydrate, plainSource, displayEdges) and groups.mjs
 * decides by, one per bundle unit and the same objects on every call: the units translateUnits is given, so that its
 * results' pieces are these objects by identity and kOfSource finds them. A unit the reader dropped, or of no shape, is
 * null at its index. Each piece carries its index `k` among its unit's pieces
 */
export const sourceUnitsOf = bundle => sourceOf(bundle).units

// ---------------------------------------------------------------- the ids a language translates
/** the units a translation into `lang` leaves as they are: live.mjs keptFor's rule, over the bundle's flags and kinds */
const keptOf = (s, lang) => (authorsTranslated(lang) ? s.kept : s.keptAll)
/** the ids a language translates, rising: the units that stand, but the names kept (the KEPT flag) and, where the language
 *  does not write them as the paper does (scripts.mjs authorsTranslated), the author block */
export function toTranslate(bundle, lang) {
  const s = sourceOf(bundle), kept = keptOf(s, lang), ids = []
  s.units.forEach((u, i) => { if (u && !kept.has(u)) ids.push(i) })
  return ids
}
/** a language's batches in source order: the first up to FIRST_BATCH characters of plain source, the rest up to NEXT_BATCH */
export function batchesOf(bundle, lang) {
  const s = sourceOf(bundle), out = []
  let left = toTranslate(bundle, lang)
  for (let first = true; left.length; first = false) {
    const batch = batchOf(left, i => plainOf(s, i).length, first ? FIRST_BATCH : NEXT_BATCH)
    out.push(batch)
    left = left.slice(batch.length)
  }
  return out
}

// ---------------------------------------------------------------- the rows
const isObject = v => v !== null && typeof v === 'object'
/**
 * A unit's result (one entry of translateUnits' results) as its row [id, pieces, state, by, sentences]: each translated
 * text the string the engine holds, every other piece its source piece's index in the bundle unit (kOfSource: the same
 * object, or an equal one). A text piece that is the unit's own source object (the runs path leaves the text it did not
 * send) is its index too; any other text — a translation, the white space the wire cut off the unit's ends — is written
 * out. Only a whole or partial result has pieces. A piece with no source piece in its unit, a result of no shape, a unit
 * the reader dropped or the bundle has not: a `none` row with no pieces, never a throw (the layer shows the original)
 */
export function rowOf(bundle, id, result) {
  const s = sourceOf(bundle), src = Number.isInteger(id) ? s.units[id] : null
  const none = [id, [], 'none', null, null]
  if (!src || !isObject(result) || !GIVEN.has(result.state)) return none
  const state = result.state, by = typeof result.by === 'string' ? result.by : null
  if (state === 'none' || state === 'lost') return [id, [], state, by, null]
  if (!Array.isArray(result.pieces)) return none
  const kOf = kOfSource(src.pieces), pieces = []
  for (const p of result.pieces) {
    if (!isObject(p)) return none
    if (p.t === 'text') {
      if (typeof p.s !== 'string') return none
      pieces.push(Number.isInteger(p.k) && src.pieces[p.k] === p ? p.k : p.s)
      continue
    }
    const k = kOf(p)
    if (k < 0) return none
    pieces.push(k)
  }
  const n = result.sentences
  const sentences = isObject(n) && Array.isArray(n.src) && Array.isArray(n.tr) && n.src.every(Number.isInteger) && n.tr.every(Number.isInteger) ? { src: [...n.src], tr: [...n.tr] } : null
  return [id, pieces, state, by, sentences]
}

/**
 * v0's unit of a row: `{ kind, src, pieces, state, title?, group? }` as openProto reads it. `src` is the source unit's
 * plainSource, `title` its flag, `group` its table cell's (groups.mjs groupOf). A whole or partial row's pieces are
 * rebuilt: a string a translated text piece, a number the bundle unit's own source piece — the same object, carrying its
 * `k` —, so that v0's take, which reads the hybrid's pieces by `trPiecesOf(unit.pieces, p => p.k)`, and kOfSource over
 * the source's pieces give the same TrPiece (a copy would be found by its equals, and a placeholder twice by the
 * order). The units of the other states have no pieces. Null where the row is no unit of the bundle's — a shape not a
 * row's, an id the bundle has not or dropped, a state not of the five, a piece that is neither a string nor a `k` of the
 * unit's source pieces: the layer leaves that unit the original's
 */
export function unitOf(bundle, row) {
  if (!Array.isArray(row) || row.length < 3) return null
  const [id, pieces, state] = row
  const s = sourceOf(bundle), src = Number.isInteger(id) ? s.units[id] : null
  if (!src || !STATES.has(state)) return null
  const group = groupOf(src)
  const unit = { kind: src.kind, src: plainOf(s, id), state, ...(src.title ? { title: true } : {}), ...(group ? { group } : {}) }
  if (state !== 'whole' && state !== 'partial') return unit
  if (!Array.isArray(pieces)) return null
  const out = []
  for (const p of pieces) {
    if (typeof p === 'string') out.push({ t: 'text', tr: true, s: p })
    else if (Number.isInteger(p) && p >= 0 && p < src.pieces.length) out.push(src.pieces[p])
    else return null
  }
  unit.pieces = out
  return unit
}

/**
 * The rows the results so far allow, rising by id, and the cells held. `results` is id → translateUnits' result. A unit
 * the language keeps has no row; a unit with a result has its row (rowOf). A table cell is given only once its group is
 * decided (groups.mjs decideGroups, over what has come in): a group translated whole gives each cell its row; a group
 * kept whole — a column of names, or a cell the translator could not take — gives each cell a `kept` row with no pieces
 * and, as the sixth value, its own translation's state; a group still waiting on a cell (not in yet, or lost to the
 * service) is held, every cell of it, in `held`, and has no row: the original rather than half a translation. The layer
 * owns the held cells; no caller withholds anything
 */
export function layerRows(bundle, results, lang) {
  const s = sourceOf(bundle), kept = keptOf(s, lang)
  const made = new Map(), ids = []
  s.units.forEach((u, id) => {
    if (!u || kept.has(u)) return
    ids.push(id)
    const r = results.get(id)
    if (isObject(r)) made.set(id, { row: rowOf(bundle, id, r), result: r })
  })
  // (a cell whose row is none — a result of no shape included — is a cell the translator could not take)
  const decided = s.cells.length ? decideGroups(s.cells, u => { const m = made.get(s.idOf.get(u)); return m && { state: m.row[2], pieces: m.row[2] === 'whole' || m.row[2] === 'partial' ? m.result.pieces : undefined } }, kept) : null
  const rows = [], held = []
  for (const id of ids) {
    const u = s.units[id]
    if (decided?.wait.has(u)) { held.push(id); continue }
    const m = made.get(id)
    if (!m) continue
    rows.push(decided?.keep.has(u) ? [id, [], 'kept', m.row[3], null, m.row[2]] : m.row)
  }
  return { rows, held }
}

// ---------------------------------------------------------------- the loop
/**
 * The whole run for the extension: a language's batches (batchOf, FIRST_BATCH then NEXT_BATCH), the unit nearest the
 * reading place first where `rank` says (rank(id): lower comes first, asked afresh for every batch; the source's order
 * where it is not given), each by translateUnits(units, send, format); after each, layerRows over every result so far, and
 * `onRows(rows, held)` gets the rows not given before or changed since, with the cells held now. The abort signal stops
 * the run before the next batch. A refusal for good — an error of the service with a `kind` (engine.mjs EngineError) —
 * stops it with what it has, as runLive's does, and so does a batch part of which the service lost (translateUnits'
 * `error`); any other error is a bug and is thrown. Resolves with the final rows by id, `lost` (the units the service
 * lost, and, after a refusal, those never asked) and `stopped` (the refusal's kind, 'aborted', or null)
 */
export async function runRows(bundle, { lang, send, format = 'markers', rank = i => i, onRows, signal }) {
  const s = sourceOf(bundle), todo = new Set(toTranslate(bundle, lang))
  const results = new Map(), given = new Map()
  let final = [], stopped = null
  /** units nearest the reader first, as `rank` has them now */
  const nearest = ids => ids.map(i => [i, rank(i)]).sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([i]) => i)
  for (let first = true; todo.size; first = false) {
    if (signal?.aborted) { stopped = 'aborted'; break }
    const batch = batchOf(nearest([...todo]), i => plainOf(s, i).length, first ? FIRST_BATCH : NEXT_BATCH)
    batch.forEach(i => todo.delete(i))
    let got, how
    try { ({ results: got, how } = await translateUnits(batch.map(i => s.units[i]), send, format)) } catch (e) {
      // a refusal for good (a key missing or refused) stops the run, as a failure of the service does
      if (!e?.kind) throw e
      stopped = e.kind
      for (const i of batch) todo.add(i)
      break
    }
    for (const i of batch) { const r = got.get(s.units[i]); if (r) results.set(i, r) }
    const { rows, held } = layerRows(bundle, results, lang)
    final = rows
    const changed = []
    for (const row of rows) {
      const key = JSON.stringify(row)
      if (given.get(row[0]) !== key) { given.set(row[0], key); changed.push(row) }
    }
    if (changed.length) onRows(changed, held)
    // a failure of the service, not of these texts (engine.mjs EngineError's `lost`): the batches after it would fail the same way
    if (how.error) { stopped = how.error; break }
  }
  const lost = [...results.values()].filter(r => r.state === 'lost').length + (stopped && stopped !== 'aborted' ? todo.size : 0)
  return { rows: new Map(final.map(r => [r[0], r])), lost, stopped }
}
