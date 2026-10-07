// lab/pdf/spikes/layer-gate/ref.mjs
// The fidelity gate's reference text area (Plan 8b, Task 12; the parity report's §6): per fixture, the original's text by
// unit, page and line, against which every rendering is scored. It is made once and frozen (ref.json beside the fixture's
// files, never in the repository: it is made of the paper), so that a layout that drops a unit cannot shrink what is
// counted. Each unit's lines are the fixture's own layout file's (the layout made for the fixture, data/layer-fixtures),
// and the units that file does not locate are taken from the approved prototype's geometry of the same paper (its
// anchors' rectangles, as the parity harness read them: a rectangle's baseline 0.24 of its height above its foot, its size
// its height over 0.894). A new reference is a deliberate act: `layer-gate.mjs --freeze` writes one only where none is;
// `--freeze=force --ref-layouts=<a later maker's fixtures>` refreshes it, that maker's lines first, then the fixture's
// own, then the prototype's, so that a unit a later maker locates is measured by its own lines.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join, sep } from 'node:path'

export const REF_SCHEMA = 1
const UNIT_KINDS = ['para', 'heading', 'caption', 'footnote', 'cell', 'abstract', 'theorem', 'figure', 'author']
/** the approved prototype's geometry (iteration 2's data, outside the repository); LAYER_GEOMETRY another (the same
 *  carried to another cut of the units: spikes/layer-cut.mjs) */
export const PROTO_GEOMETRY = process.env.LAYER_GEOMETRY ?? join(homedir(), 'Developer/readarxiv-research/2026-10-06-plan8/instant-layer/iteration-2/data')
/**
 * A local path as a record keeps it, with no user's name or machine's directory in it: relative to `base` where under it
 * ('.' for itself), `<scratch>/<its last name>` under a temporary directory, `~/…` under the home directory, else
 * `<local>/<its last name>`. Every path the gate and the cost budget write into a record goes through it
 */
export function shownPath(p, base = null) {
  if (typeof p !== 'string' || !p.startsWith('/')) return p
  const under = dir => p === dir || p.startsWith(dir.endsWith(sep) ? dir : dir + sep)
  if (base && under(base)) return p === base ? '.' : p.slice(base.length + 1)
  for (const t of [tmpdir(), '/private/tmp', '/tmp', '/private/var/folders', '/var/folders']) if (under(t)) return `<scratch>/${basename(p)}`
  const home = homedir()
  if (under(home)) return p === home ? '~' : `~/${p.slice(home.length + 1)}`
  return `<local>/${basename(p)}`
}
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

/** a fixture's name as its paper with its version, and its target */
export function nameOf(fixture) {
  const m = /^(.+v\d+)-([A-Za-z-]+)$/.exec(fixture)
  if (!m) throw new Error(`${fixture}: not <id>v<n>-<target>`)
  return { paper: m[1], target: m[2] }
}

/** the prototype's geometry file for a paper: the target's own, else the first of zh, ja, ko, de, ru (the original's
 *  anchors are the same whatever the target) */
export function geometryFile(fixture, dir = PROTO_GEOMETRY) {
  const { paper, target } = nameOf(fixture)
  return [target, 'zh', 'ja', 'ko', 'de', 'ru'].map(t => join(dir, `${paper}-${t}-geometry.json`)).find(f => existsSync(f)) ?? null
}

/**
 * The reference of a fixture: { schema, from, pages: { [page]: [[id, kind, lines]] } }, each line six numbers (x0, x1,
 * baseline, top, bottom, size). `layouts`: layout files' bytes (one, or several in order: a unit's lines are the first's
 * that locates it, so that a later maker that locates more of the original refreshes the reference with what it finds);
 * `geometry`: the prototype's file's, for the units none of them locates, or null
 */
export function makeRef(layouts, geometry, from = {}) {
  const files = (Array.isArray(layouts) ? layouts : [layouts]).map(b => JSON.parse(Buffer.from(b).toString('utf8')))
  const pages = {}, taken = new Set(), bySource = []
  const add = (p, id, kind, line) => {
    const list = (pages[p] ??= [])
    let row = list.find(r => r[0] === id)
    if (!row) list.push((row = [id, kind, []]))
    row[2].push(...line)
  }
  for (const L of files) {
    const kinds = new Map(L.units.map(u => [u[0], UNIT_KINDS[u[1]] ?? 'para']))
    let n = 0
    for (const [id, rows] of L.lines) {
      if (taken.has(id) || !kinds.has(id)) continue
      n++
      // page, x0, x1, baseline, top, bottom, size, font
      for (let i = 0; i + 7 < rows.length; i += 8) add(rows[i], id, kinds.get(id), [rows[i + 1], rows[i + 2], rows[i + 3], rows[i + 4], rows[i + 5], rows[i + 6]])
    }
    for (const [id] of L.lines) if (kinds.has(id)) taken.add(id)
    bySource.push(n)
  }
  let extra = 0
  if (geometry) {
    const g = JSON.parse(Buffer.from(geometry).toString('utf8'))
    for (const [id, , rects] of g.left.units) {
      if (taken.has(id)) continue
      extra++
      for (const [p, x0, y0, x1, y1] of rects) {
        const h = y1 - y0
        add(p, id, g.kinds[id] ?? 'para', [x0, x1, y0 + 0.24 * h, y1, y0, h / 0.894])
      }
    }
  }
  for (const list of Object.values(pages)) list.sort((a, b) => a[0] - b[0])
  const shas = (Array.isArray(layouts) ? layouts : [layouts]).map(b => sha256(b))
  return { schema: REF_SCHEMA, from: { ...from, layout: shas.at(-1), ...(shas.length > 1 ? { layouts: shas, units: bySource } : {}), extraUnits: extra }, pages }
}

/** the reference made from a fixture's folder and the prototype's geometry, as the bytes ref.json holds; `newer`: folders
 *  of fixtures made by a later maker, whose layout files go first */
export function refBytesOf(dir, fixture, geometryDir = PROTO_GEOMETRY, newer = []) {
  const gFile = geometryFile(fixture, geometryDir)
  const layouts = [...newer.map(d => join(d, fixture, 'layout.json')).filter(f => existsSync(f)), join(dir, 'layout.json')]
  const makers = newer.filter(d => existsSync(join(d, fixture, 'layout.json'))).map(d => { try { return JSON.parse(readFileSync(join(d, fixture, 'units.json'), 'utf8')).engine ?? null } catch { return null } })
  const ref = makeRef(layouts.map(f => readFileSync(f)), gFile ? readFileSync(gFile) : null, { geometry: gFile ? basename(gFile) : null, geometrySha: gFile ? sha256(readFileSync(gFile)) : null, ...(makers.length ? { makers } : {}) })
  return Buffer.from(JSON.stringify(ref))
}

/** a reference as the page reads it: by page, each unit { id, kind, orig: [{ x0, x1, baseline, top, bottom, size }] } */
export function refPages(ref) {
  const out = {}
  for (const [p, list] of Object.entries(ref.pages)) {
    out[p] = list.map(([id, kind, v]) => {
      const orig = []
      for (let i = 0; i + 5 < v.length; i += 6) orig.push({ x0: v[i], x1: v[i + 1], baseline: v[i + 2], top: v[i + 3], bottom: v[i + 4], size: v[i + 5] })
      return { id, kind, orig }
    })
  }
  return out
}
