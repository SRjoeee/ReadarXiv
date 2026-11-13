// lab/typeset/parity/production-rows.mjs [<pair>…]: whether the rows the parity's today's side reads for a pair are production's.
// Today's side lays a pair's door rows, the release's stored rows (packages/typeset/tests/replay/rows.ts: the sweep cache's
// `papers/<paper>-<target>/open.json` manifest and its row objects; an added pair's from its own cache, lab/typeset/added.mjs).
// Production writes those rows through one path of today's engine (065c1d973, AXT_TODAY): each unit's row, then
// `layer-proto/rows.mjs` layerRows over the paper's units, which decides the table groups (`translate/groups.mjs`
// decideGroups: a column kept as the original, a group held) and writes the rows it stores. Rows made another way, a unit's
// row alone without layerRows, are no production's: 2111.09276v1-zh and 2611.03953v2-zh were laid so until 2026-11-13 (11 rows
// production keeps that the lab's rows translated: lane cells-like-body), and the display gate read production's side from them.
// So, for each pair: the release's bundle units (the catalog's units chunks, `layer-proto/format.mjs` readUnitsChunk), the
// stored rows read back as results (a translated row's pieces by `unitOf`, any other its state), and layerRows over them: a set
// of rows production made is its own fixed point, and gives back every stored row, byte for byte, a kept row by its state
// (`rowsAgainst`). A row it moves, drops, adds or holds is a row production would not have stored. Prints a line a pair and the totals; exit 1 where a
// pair's rows are not production's or cannot be read, 2 on a usage error. Pairs default to the parity's 22 (pairs.mjs).
//   AXT_SWEEP_CACHE=<cache> AXT_TODAY=<today's engine> node lab/typeset/parity/production-rows.mjs [<pair>…]
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { todayFile } from '../../../packages/typeset/tests/replay/tap.ts'
import { CACHE, paperOf } from '../../../packages/typeset/tests/replay/today.ts'
import { PAIRS } from './pairs.mjs'

/** a row as it is compared: whole, but a kept row by its id, pieces and state alone. Production stores no translation of a unit
 *  it keeps (`[id, [], 'kept', translator, null, the translation's state]`), so read back its row says what was kept and not
 *  what the translator answered: the decision is compared, its echo of the answer cannot be */
const keyOf = (r) => JSON.stringify(r[2] === 'kept' ? r.slice(0, 3) : r)

/**
 * The stored rows against the rows production's path makes of them (`made`: layerRows' rows; `held`: the ids it holds back):
 * `same` rows equal byte for byte (a kept row by its state: keyOf); `missing` stored rows it makes none of; `extra` rows it
 * makes that are not stored; `moved` ids whose state it changes (`{ id, from, to }`); `differ` ids of the same state whose row
 * differs otherwise; `held` stored ids it would hold back. Production's rows are whole where every list is empty
 */
export function rowsAgainst(stored, made, held = []) {
  const byId = new Map(made.map((r) => [r[0], r]))
  const storedIds = new Set(stored.map((r) => r[0]))
  const heldSet = new Set(held)
  const out = { rows: stored.length, same: 0, missing: [], extra: [], moved: [], differ: [], held: [] }
  for (const s of stored) {
    const id = s[0]
    if (heldSet.has(id)) { out.held.push(id); continue }
    const m = byId.get(id)
    if (!m) { out.missing.push(id); continue }
    if (keyOf(m) === keyOf(s)) { out.same++; continue }
    if (m[2] !== s[2]) out.moved.push({ id, from: s[2], to: m[2] })
    else out.differ.push(id)
  }
  for (const m of made) if (!storedIds.has(m[0])) out.extra.push(m[0])
  return out
}

/** whether a pair's comparison found its rows production's */
export const isProduction = (c) => !c.missing.length && !c.extra.length && !c.moved.length && !c.differ.length && !c.held.length

/** a comparison's line: the rows, and each kind of difference with its first ids */
export function lineOf(pair, c) {
  const few = (xs) => `${xs.length}${xs.length ? ` (${xs.slice(0, 6).join(', ')}${xs.length > 6 ? ', …' : ''})` : ''}`
  const moves = new Map()
  for (const m of c.moved) moves.set(`${m.from} -> ${m.to}`, [...(moves.get(`${m.from} -> ${m.to}`) ?? []), m.id])
  const moved = [...moves].map(([k, ids]) => `${k} ${few(ids)}`).join('; ') || '0'
  return `${pair}: ${isProduction(c) ? "production's" : 'NOT production\'s'}: ${c.rows} stored rows, ${c.same} given back; moved ${moved}; differ ${few(c.differ)}; missing ${few(c.missing)}; extra ${few(c.extra)}; held ${few(c.held)}`
}

if (process.argv[1] === import.meta.filename) {
  const asked = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  if (process.argv.slice(2).some((a) => a.startsWith('--'))) {
    console.error('production-rows.mjs [<pair>…]')
    process.exit(2)
  }
  const pairs = asked.length ? asked : PAIRS
  const engine = (f) => import(pathToFileURL(todayFile(f)).href)
  const { readCatalog, readUnitsChunk } = await engine('layer-proto/format.mjs')
  const { layerRows, unitOf } = await engine('layer-proto/rows.mjs')
  console.log(`production's row path: today's engine at ${todayFile('')}; the rows of ${CACHE}`)
  const obj = (sha) => new Uint8Array(readFileSync(join(CACHE, 'objects', sha)))
  let bad = 0
  const total = { pairs: 0, rows: 0, same: 0 }
  for (const pair of pairs) {
    const paper = paperOf(pair)
    const target = pair.slice(paper.length + 1)
    const open = join(CACHE, 'papers', pair, 'open.json')
    const cat = join(CACHE, 'papers', paper, 'catalog.json')
    if (!existsSync(open) || !existsSync(cat)) {
      console.log(`${pair}: not read: ${existsSync(cat) ? 'no stored rows' : 'no catalog'} in the cache`)
      bad++
      continue
    }
    try {
      const catalog = await readCatalog(new Uint8Array(readFileSync(cat)))
      const units = []
      for (const r of catalog.units) {
        const c = await readUnitsChunk(obj(r.sha256), { ref: { kind: 'units', sha256: r.sha256, bytes: r.bytes, from: r.from, to: r.to }, before: null, dropped: [] })
        units.push(...c.units)
      }
      const bundle = { units }
      // (the stored rows in the manifest's order, a later row of an id replacing an earlier, as today's reader reads them)
      const byId = new Map()
      for (const ref of JSON.parse(readFileSync(open, 'utf8')).body.manifest.rows) for (const row of JSON.parse(readFileSync(join(CACHE, 'objects', ref.sha256), 'utf8')).rows) byId.set(row[0], row)
      const stored = [...byId.values()]
      // (each stored row read back as the result it was written from: a translated row's pieces as today's reader reads them,
      // any other row its state and translator)
      const results = new Map()
      for (const row of stored) {
        const [id, , state, by, sentences] = row
        if (state === 'whole' || state === 'partial') {
          const unit = unitOf(bundle, row)
          if (unit?.pieces) results.set(id, { state, by, sentences, pieces: unit.pieces })
        } else results.set(id, { state, by })
      }
      const { rows, held } = layerRows(bundle, results, target)
      const c = rowsAgainst(stored, rows, held)
      console.log(lineOf(pair, c))
      total.pairs++
      total.rows += c.rows
      total.same += c.same
      if (!isProduction(c)) bad++
    } catch (e) {
      console.log(`${pair}: not read: ${e?.message ?? e}`)
      bad++
    }
  }
  console.log(`production's rows: ${pairs.length - bad} of ${pairs.length} pairs; ${total.same} of ${total.rows} stored rows given back by production's own path`)
  process.exit(bad ? 1 : 0)
}
