// experiments/pdf-bilingual/spikes/layer-cut.mjs
// The layer gate's inputs carried to another cut of the units (the front end's round, PIPELINE 10, 2026-10-07). The gate's
// fixed inputs name units by their place in the paper's units (an id): the frozen reference (ref.json), the fixture's own
// layout file (the instrument's kept renderings), the prototype's geometry and staging units (v0's, and the floor's), and
// the fixtures' translations. A front end that cuts the units anew moves every id after a unit it adds, so each input is
// written again under the new cut's ids, nothing else changed:
//   - the map: the old cut's units (the fixed fixture's record.json, data/layer-fixtures) against the new (the made
//     fixture's record.json, --made), each a unit by its kind and plain source, matched in order (their longest common
//     subsequence: a unit the front end adds or cuts anew is matched to none);
//   - refs/<fixture>/ref.json: each old unit's lines under its new id, as frozen; a unit the old cut did not have measured
//     by the made layout file's lines (the text the new front end finds is the original's too, and is counted);
//   - refs/<fixture>/layout.json, record.json, units.json: the fixed fixture's, their ids mapped (the floor's translation,
//     which a unit the old cut did not have is none of); every other file of the fixture linked;
//   - geometry/<paper>-<target>-geometry.json and -units.json: the prototype's (layer-gate/ref.mjs PROTO_GEOMETRY), mapped
//     (a new unit has no rectangle of the prototype's); its other files linked;
//   - maps/<fixture>.json: old id -> new id, and the units each side alone has.
// The gate reads them with LAYER_REFS=<out>/refs and LAYER_GEOMETRY=<out>/geometry.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/layer-cut.mjs --made=<fixtures folder of the new cut> --out=<dir>
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PROTO_GEOMETRY } from './layer-gate/ref.mjs'

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const root = new URL('..', import.meta.url).pathname
const FIXED = join(process.env.AXT_DATA ?? join(root, 'data'), 'layer-fixtures')
const MADE = arg('made') ? resolve(arg('made')) : null
const OUT = arg('out') ? resolve(arg('out')) : null
if (!MADE || !OUT) throw new Error('--made=<the new cut\'s fixtures> --out=<dir>')
const UNIT_KINDS = ['para', 'heading', 'caption', 'footnote', 'cell', 'abstract', 'theorem', 'figure', 'author']
const readJson = f => JSON.parse(readFileSync(f, 'utf8'))

/** old id -> new id: the two cuts' units by kind and plain source, their longest common subsequence */
export function mapCuts(oldUnits, newUnits) {
  const key = u => `${u.kind}\u0000${u.src}`
  const a = oldUnits.map(key), b = newUnits.map(key)
  const n = a.length, m = b.length
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const map = new Map()
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] === b[j]) { map.set(i, j); i++; j++ }
    else if (L[i + 1][j] >= L[i][j + 1]) i++
    else j++
  }
  return map
}

const link = (from, to) => { if (!existsSync(to)) symlinkSync(from, to) }
const ids = (rows, map) => rows.flatMap(r => (map.has(r[0]) ? [[map.get(r[0]), ...r.slice(1)]] : []))
const sorted = rows => rows.sort((x, y) => x[0] - y[0])

rmSync(OUT, { recursive: true, force: true })
mkdirSync(join(OUT, 'maps'), { recursive: true })
const geometryMaps = new Map()
const summary = []
for (const name of readdirSync(FIXED).filter(n => /v\d+-[A-Za-z-]+$/.test(n) && existsSync(join(FIXED, n, 'record.json'))).sort()) {
  if (!existsSync(join(MADE, name, 'record.json'))) { console.log(`SKIP ${name}: not made in ${MADE}`); continue }
  const oldRec = readJson(join(FIXED, name, 'record.json')), newRec = readJson(join(MADE, name, 'record.json'))
  const map = mapCuts(oldRec.units, newRec.units)
  const added = newRec.units.map((_, j) => j).filter(j => ![...map.values()].includes(j))
  const dropped = oldRec.units.map((_, i) => i).filter(i => !map.has(i))
  writeFileSync(join(OUT, 'maps', `${name}.json`), JSON.stringify({ old: oldRec.units.length, new: newRec.units.length, map: [...map], added, dropped }))
  const dir = join(OUT, 'refs', name)
  mkdirSync(dir, { recursive: true })
  // the reference: the old units' lines under their new ids, then the new units' from the made layout file
  const ref = readJson(join(FIXED, name, 'ref.json'))
  const pages = {}
  for (const [p, list] of Object.entries(ref.pages)) pages[p] = list.filter(([id]) => map.has(id)).map(([id, kind, v]) => [map.get(id), kind, v])
  const madeLayout = readJson(join(MADE, name, 'layout.json'))
  const kinds = new Map(madeLayout.units.map(u => [u[0], UNIT_KINDS[u[1]] ?? 'para']))
  const addedSet = new Set(added)
  let measured = 0
  for (const [id, rows] of madeLayout.lines) {
    if (!addedSet.has(id) || !kinds.has(id)) continue
    measured++
    for (let i = 0; i + 7 < rows.length; i += 8) {
      const list = (pages[rows[i]] ??= [])
      let row = list.find(r => r[0] === id)
      if (!row) list.push((row = [id, kinds.get(id), []]))
      row[2].push(rows[i + 1], rows[i + 2], rows[i + 3], rows[i + 4], rows[i + 5], rows[i + 6])
    }
  }
  for (const list of Object.values(pages)) sorted(list)
  writeFileSync(join(dir, 'ref.json'), JSON.stringify({ ...ref, from: { ...ref.from, cut: { made: MADE, mapped: map.size, added: added.length, dropped: dropped.length, measuredAdded: measured } }, pages }))
  // the fixture's own layout file, its ids mapped
  const L = readJson(join(FIXED, name, 'layout.json'))
  for (const k of ['units', 'lines', 'frames', 'erase', 'ph', 'labels', 'headings', 'held']) if (Array.isArray(L[k])) L[k] = sorted(ids(L[k], map))
  writeFileSync(join(dir, 'layout.json'), JSON.stringify(L))
  // the old cut's translation under the new ids: what the floor drew
  const units = newRec.units.map((u, j) => ({ kind: u.kind, src: u.src, hash: u.hash, state: 'none' }))
  for (const [i, j] of map) units[j] = { ...oldRec.units[i], hash: newRec.units[j].hash }
  writeFileSync(join(dir, 'record.json'), JSON.stringify({ ...oldRec, units }))
  const lu = readJson(join(FIXED, name, 'units.json'))
  writeFileSync(join(dir, 'units.json'), JSON.stringify({ ...lu, cut: 'mapped (spikes/layer-cut.mjs)', units: lu.units.filter(u => map.has(u.id)).map(u => ({ ...u, id: map.get(u.id) })).sort((x, y) => x.id - y.id) }))
  for (const f of readdirSync(join(FIXED, name))) link(join(FIXED, name, f), join(dir, f))
  geometryMaps.set(name, { map, n: newRec.units.length, kinds: newRec.units.map(u => u.kind) })
  summary.push(`${name}: ${oldRec.units.length} -> ${newRec.units.length} units, ${map.size} mapped, ${added.length} new (${measured} measured by the made layout), ${dropped.length} gone`)
}
// the prototype's geometry and staging units, by paper and target, each mapped by its output's map (else the paper's)
mkdirSync(join(OUT, 'geometry'), { recursive: true })
for (const f of readdirSync(PROTO_GEOMETRY)) {
  const m = /^(.+v\d+)-([A-Za-z-]+)-(geometry|units)\.json$/.exec(f)
  const g = m && (geometryMaps.get(`${m[1]}-${m[2]}`) ?? [...geometryMaps].find(([n]) => n.startsWith(`${m[1]}-`))?.[1])
  if (!g) { link(join(PROTO_GEOMETRY, f), join(OUT, 'geometry', f)); continue }
  const j = readJson(join(PROTO_GEOMETRY, f))
  if (m[3] === 'geometry') {
    const kinds = g.kinds.slice()
    for (const [i, k] of g.map) kinds[k] = j.kinds[i] ?? kinds[k]
    for (const side of ['left', 'right']) if (j[side]?.units) j[side].units = sorted(ids(j[side].units, g.map))
    j.kinds = kinds
  } else {
    const units = Array.from({ length: g.n }, (_, k) => ({ kind: g.kinds[k], state: 'none' }))
    for (const [i, k] of g.map) if (j.units[i]) units[k] = j.units[i]
    j.units = units
  }
  writeFileSync(join(OUT, 'geometry', f), JSON.stringify(j))
}
console.log(summary.join('\n'))
console.log(`written: ${OUT} (LAYER_REFS=${join(OUT, 'refs')} LAYER_GEOMETRY=${join(OUT, 'geometry')})`)
