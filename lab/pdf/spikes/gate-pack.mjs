// lab/pdf/spikes/gate-pack.mjs
// The fixture pack the rules gate runs from in CI (rules-as-data plan §8, Task R6). The layer gate's model tier reads the
// outputs' inputs from lab/pdf/data and out/, which a runner does not have and a public repository may not hold: arXiv's
// PDFs, the layout files made from them and the PIPELINE translations are under arXiv's licence. The pack is those inputs
// and nothing else, made on the maintainer's machine, kept in a private bucket, and restored by digest:
//   pack/fixtures/<fx>/arxiv.pdf, layout.json     the made layout files (--fixtures)
//   pack/fixtures/<fx>/base.pdf, base.json        our base page the layout file was made over, where it was (BUNDLE 8: the final
//                                                 pass of the marked original, layer-fixtures.mjs), and its record (baseRecordOf)
//   pack/fixtures/<fx>/units.json, record.json    the PIPELINE translations, which the gate reads beside them (--records' files)
//   pack/sources/<paper>/source.gz                each paper's source as arXiv serves it (--sources, <paper>/source.gz), where a
//                                                 fixture's base is ours: the layer gate wraps that base by optional content at
//                                                 load from the source's units (layer-gate/wrap.mjs, docs/PDF-READER.md §19.9)
//   pack/refs/<fx>/ref.json, layout.json          the frozen reference text area and the instrument's kept layout (LAYER_REFS)
//   pack/geometry/<paper>-<target>-geometry.json  the geometry the gate resolves for each output (LAYER_GEOMETRY)
//   pack/data/fonts/<file>                        the served faces (AXT_DATA=pack/data)
//   pack/texmf/<tex/generic/...>                  the hyphenation patterns, en, de, fr, es and pt (TEXMF_DIST=pack/texmf)
//   pack/manifest.json                            { schema, pipeline, layout: { schema, version }, compileImage, made, digest, files: [{ path, sha256, bytes }] }
// `compileImage` is the pack's year's entry of lab/pdf/compile-images.json (the one place the compile images are pinned, by digest and
// TeX Live year, shared with the web container), with `year`: a make refuses to run unless the local texlive image (`docker image
// inspect`) has that year's pinned digest, so the layouts the pack holds were made on it. One pack a year: gate-pack.json the default
// year's (made before the year was written, its year implicit), gate-pack.<year>.json each other's (make --year=<year>)
// `layout` names the layout files' schema and version (their `schema` field, which the reader refuses a file by when it is not its own, and their `layout` field, the maker's version, which the reader reads as a version token and does not compare): a make
// reads every fixtures/<fx>/layout.json (not refs/<fx>/layout.json, the instrument's kept layout, which no reader parses) and fails unless all of them are the --engine tree's own (file.mjs LAYOUT_SCHEMA and
// LAYOUT), and tests/scripts/gate-pack.test.ts holds the committed gate-pack.json to the engine, so that a change of the layout
// file cannot be merged while the pack is of the old one. `make` takes its inputs from the committed fidelity record
// (lab/pdf/records/layer-gate.json, its `inputs`: fixtures, records, refs, geometry), so that with no flag it makes the record's run.
// The outputs <fx> are the frozen references of the references folder (--refs): the set the gate itself requires. An output whose
// reference is there and any other of its files is not makes the make fail, naming each one; it never drops out unseen.
// The pack is a file set, not an archive: sorted, each file's mtime zeroed, and the listing digest (the paths, digests and
// sizes, not the clock) is the same on every make. lab/pdf/gate-pack.json is the committed copy of the manifest with each
// file's `url` in the bucket, a key of its digest, so that the several outputs of one paper share one object.
//
//   node lab/pdf/spikes/gate-pack.mjs make     [--year=<YYYY>] [--out=<dir>] [--json=<gate-pack.json>] [--record=<layer-gate.json>] [--fixtures=<dir>]
//                                              [--records=<dir>] [--refs=<dir>] [--geometry=<dir>] [--fonts=<dir>] [--texmf=<dir>] [--engine=<dir>]
//                                              [--sources=<dir>]
// --year: the pack's TeX Live year (packPathsOf: its json, its folder and its record, the default year's as before); every command takes it
//   node lab/pdf/spikes/gate-pack.mjs restore  [--pack=<gate-pack.json>] [--out=<dir>]    env READARXIV_CI_TOKEN, CF_ACCOUNT_ID
//   node lab/pdf/spikes/gate-pack.mjs verify   [--pack=<gate-pack.json>] [--out=<dir>]
//   node lab/pdf/spikes/gate-pack.mjs digest   [--pack=<gate-pack.json>]
//   node lab/pdf/spikes/gate-pack.mjs objects  [--pack=<gate-pack.json>] [--out=<dir>]    the objects to upload, once each
// `make` and `objects` read and write local files only; `restore` is the only command that touches the network. Its token (an
// R2 API token, Object Read on the bucket) is sent only to Cloudflare's token-verify endpoint, which answers the token's id;
// the objects are read from R2's S3 endpoint, each request signed (SigV4) with the key derived from the token (that id, and
// the SHA-256 of its value). Neither the token nor the derived secret is printed. The read itself (the derivation, the signer, the
// retry rule) is scripts/r2-read.mjs, which the fixtures fetch (scripts/fetch-fixtures.mjs) uses as well.
import { constants, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { accountOf, BUCKET, getObject, isKey, keyUrl, s3Credentials, sha256, tokenOf } from '../../../scripts/r2-read.mjs'
import { geometryFile, nameOf } from './layer-gate/ref.mjs'

export { BUCKET, sha256 }
export const PACK_SCHEMA = 2
/** the pack's objects in the bucket: gate-pack/<sha256> */
export const KEY_PREFIX = 'gate-pack/'
/** a CJK face of a catalog, by its family (rules/font-roles.mjs CJK_GROUPS): a group's (Source Han Serif's, Harano Aji's) or a
 *  Kai. Every engine's catalog writes them so */
const CJK_FAMILY = /^axt-(shs-|mincho|fandolkai|bkai00mp)/

const here = new URL('.', import.meta.url).pathname
const REPO = resolve(here, '../../..')
/** the compile images' pins, by digest and TeX Live year: one value for the gate packs' layouts and the web container */
export const COMPILE_IMAGES_FILE = join(import.meta.dirname, '..', 'compile-images.json')
const ENGINE = 'src/pdf-reader/engine'
/** the fidelity record a make takes its inputs from */
const RECORD = 'lab/pdf/records/layer-gate.json'
/** the inputs a make reads from the record (its `inputs`): the made layout files of the engine at the record, the translations,
 *  the references and the geometry. No digest or run is named in this file: the record names them */
export const RECORD_INPUTS = ['fixtures', 'records', 'refs', 'geometry']
/** where the rest is, unless a flag says otherwise (a year's pack, its folder and its record: packPathsOf) */
const DEFAULTS = { fonts: 'lab/pdf/data/fonts' }
/** a year's pack (`json`), its folder (`out`) and the record a make takes its inputs from: the default year's as before the year
 *  was named, another year's by its year (gate-pack.2023.json, out/gate-pack.2023, records/layer-gate.2023.json) */
export function packPathsOf(year, defaultYear) {
  const y = String(year)
  if (y === String(defaultYear)) return { json: 'lab/pdf/gate-pack.json', out: 'lab/pdf/out/gate-pack', record: RECORD }
  return { json: `lab/pdf/gate-pack.${y}.json`, out: `lab/pdf/out/gate-pack.${y}`, record: RECORD.replace(/\.json$/, `.${y}.json`) }
}
const FIXTURE = /^[A-Za-z0-9._-]+v\d+-[A-Za-z-]+$/
const SHA = /^[0-9a-f]{64}$/

const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
/** a path in code-unit order, so that no locale decides the listing */
const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)

/** the digest of a listing: the paths, digests and sizes in order of path, nothing the clock or the machine gave */
export function listingDigest(files) {
  return sha256([...files].sort(byPath).map(f => `${f.path}\t${f.sha256}\t${f.bytes}\n`).join(''))
}

/** a pack path: relative, no empty, dot or dot-dot segment, no backslash */
function safePath(path) {
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') || path.split('/').some(s => s === '' || s === '.' || s === '..')) throw new Error(`not a pack path: ${JSON.stringify(path)}`)
  return path
}

/**
 * The CJK faces an engine draws the pack's targets in, by its own role table: for each target its built-in rule set gives CJK
 * faces, the faces its `rolesFor` takes beside each English family it knows (an engine of schema 5 takes Light and SemiBold
 * beside Computer Modern and Garamond, and Regular and Bold beside the rest; one of schema 6 Regular and Bold beside every
 * family), and the faces those fall back to (Traditional Chinese's to Simplified's). A Kai is among them only where the
 * engine's roles draw one (an engine before 2026-10-19 drew emphasis in it; none since). `engine`: the engine's
 * { rolesFor, ENGLISH_FAMILIES } (rules/font-roles.mjs) and { BUILTIN_RULES, resolveRules } (rules/layout.mjs), as the make
 * imports them from the tree --engine names
 */
export function cjkRoleFaces({ rolesFor, ENGLISH_FAMILIES, BUILTIN_RULES, resolveRules }, targets) {
  const out = new Set()
  for (const target of targets) {
    const { cjkFaces } = resolveRules(BUILTIN_RULES, target)
    if (!cjkFaces) continue
    for (const family of ENGLISH_FAMILIES) {
      const roles = rolesFor(target, family, cjkFaces)
      for (const id of Object.values(roles.cjk ?? {})) {
        if (typeof id !== 'string') continue
        out.add(id)
        for (const fallback of roles.fallbacks?.[id] ?? []) out.add(fallback)
      }
    }
  }
  return out
}

/**
 * The font files the outputs can draw in. Every face of the role table that is no CJK face, whole (no rule picks a Latin
 * face, and the papers' families decide which are drawn); of the CJK faces, those the engine's roles draw the pack's
 * targets in (`roleFaces`, cjkRoleFaces'), so that a rule moving which family takes which of its weights can be measured.
 * A group the pack's targets do not draw in (Traditional Chinese's, which has no fixture), and a Kai no role draws, are left
 * out.
 */
export function fontFiles(faces, roleFaces) {
  const ids = Object.keys(faces)
  const want = new Set(ids.filter(id => !CJK_FAMILY.test(faces[id].family ?? '')))
  const need = id => { if (!Object.hasOwn(faces, id)) throw new Error(`the role table has no face ${id}`); want.add(id) }
  for (const id of roleFaces) need(id)
  return [...new Set([...want].map(id => faces[id].file))].sort()
}

/**
 * The outputs of the pack: <paper>v<n>-<target>, one for each frozen reference (`refs/<name>/ref.json`) of the references folder.
 * That is the set the layer gate itself requires (it refuses an output without a reference), so it is the expected set; taking
 * it from the made fixtures instead let an output with no layout file drop out of the pack unseen.
 */
export function outputsOf(refs) {
  return readdirSync(refs).filter(n => FIXTURE.test(n) && existsSync(join(refs, n, 'ref.json'))).sort()
}

/**
 * The pack's files as { path, from }, sorted by path. `o`: the folders of a make (fixtures, records, refs, geometry),
 * `fonts` the file names to take from the fonts folder, `fontsDir`, and `patterns` the hyphenation files ({ lang: relative
 * path under texmf }) with `texmf` their root, and `sources` the papers' sources (<paper>/source.gz), one a paper whose base is
 * ours. The outputs are those of the references (`outputsOf`); every file the gate reads
 * for each of them must be there. Throws naming everything missing, so that a pack is never partly made.
 */
export function entriesOf(o) {
  const names = outputsOf(o.refs)
  if (!names.length) throw new Error(`no frozen reference in ${o.refs}`)
  const out = new Map(), missing = []
  const add = (path, from) => {
    safePath(path)
    if (!existsSync(from)) { missing.push(`${path} (expected at ${from})`); return }
    if (out.has(path) && out.get(path) !== from) throw new Error(`${path}: two sources`)
    out.set(path, from)
  }
  for (const n of names) {
    add(`fixtures/${n}/arxiv.pdf`, join(o.fixtures, n, 'arxiv.pdf'))
    add(`fixtures/${n}/layout.json`, join(o.fixtures, n, 'layout.json'))
    // (our base page and its record, where the fixture has them: checked against each other and the layout file)
    let base = null
    try { base = baseRecordOf(join(o.fixtures, n)) } catch (e) { missing.push(`${n}: ${e.message}`) }
    if (base) add(`fixtures/${n}/base.json`, join(o.fixtures, n, 'base.json'))
    if (base?.source === 'ours') {
      add(`fixtures/${n}/base.pdf`, join(o.fixtures, n, 'base.pdf'))
      // (the paper's source, which the wrap reads its units from: one a paper, shared by its targets)
      const paper = n.replace(/-[A-Za-z-]+$/, '')
      if (!o.sources) missing.push(`sources/${paper}/source.gz (no --sources: a base of ours is wrapped from its paper's source)`)
      else add(`sources/${paper}/source.gz`, join(o.sources, paper, 'source.gz'))
    }
    add(`fixtures/${n}/units.json`, join(o.records, n, 'units.json'))
    add(`fixtures/${n}/record.json`, join(o.records, n, 'record.json'))
    add(`refs/${n}/ref.json`, join(o.refs, n, 'ref.json'))
    add(`refs/${n}/layout.json`, join(o.refs, n, 'layout.json'))
    const g = geometryFile(n, o.geometry)
    if (!g) missing.push(`${n}: no geometry in ${o.geometry}`)
    else add(`geometry/${basename(g)}`, g)
  }
  for (const f of o.fonts) add(`data/fonts/${f}`, join(o.fontsDir, f))
  for (const rel of Object.values(o.patterns)) add(`texmf/${rel}`, join(o.texmf, rel))
  if (missing.length) throw new Error(`the pack is missing ${missing.length} input${missing.length === 1 ? '' : 's'}:\n  ${missing.slice(0, 40).join('\n  ')}${missing.length > 40 ? '\n  …' : ''}`)
  return [...out].map(([path, from]) => ({ path, from })).sort(byPath)
}

/** base.json's schema (layer-fixtures.mjs BASE_RECORD_SCHEMA) */
export const BASE_RECORD_SCHEMA = 1
const SHA256 = /^[0-9a-f]{64}$/
const isSize = v => Number.isSafeInteger(v) && v > 0
/** whether a file is `want` ({ sha256, bytes }) */
const isFile = (file, want) => { const b = readFileSync(file); return b.length === want.bytes && sha256(b) === want.sha256 }
/**
 * A fixture's base page (BUNDLE 8, design note §3.1) as its record says (`dir` the fixture's folder): null where it has neither
 * base.json nor base.pdf (a fixture of before, the layer drawn over arxiv.pdf), else base.json, checked. `source` 'ours': base.pdf
 * is the record's `base` (its sha256 and bytes, with the head's xref, pages, tree and check), `image` (where named) the pinned
 * image of its tree's year (a pack's base pages are each made on the tree production compiles the paper on: the year it
 * declares, else that of arXiv's build), and layout.json the record's `layout`, the file made over it; 'arxiv': the paper refused a base page of ours (`why` the head's code, `detail` the refusal), no base.pdf,
 * and `layout` the layout file the pack keeps in its place, made over arXiv's PDF before (production has none). Throws naming
 * what does not hold: a base page with no record, a record of other bytes, a layout file not the one the record names
 */
export function baseRecordOf(dir) {
  const json = join(dir, 'base.json'), pdf = join(dir, 'base.pdf')
  if (!existsSync(json)) {
    if (existsSync(pdf)) throw new Error('base.pdf with no base.json: the record of what it is')
    return null
  }
  let r = null
  try { r = readJson(json) } catch { throw new Error('base.json is not JSON') }
  if (!isObject(r) || r.schema !== BASE_RECORD_SCHEMA) throw new Error(`base.json is not of schema ${BASE_RECORD_SCHEMA}`)
  const file = (what, f) => isObject(f) && SHA256.test(f.sha256) && isSize(f.bytes) ? f : (() => { throw new Error(`base.json's ${what} names no file (sha256, bytes)`) })()
  const layout = join(dir, 'layout.json')
  if (r.source === 'ours') {
    const b = file('base', r.base)
    if (!isSize(b.xref) || b.xref >= b.bytes || !isSize(b.pages) || !/^\d{4}$/.test(String(b.tree ?? '')) || !isObject(b.check)) throw new Error('base.json\'s base is not a head\'s base of ours (xref, pages, tree, check)')
    // (the image it was made on, where the record names it: the pin of the TeX Live year it was made on, compile-images.json's)
    if (r.image !== undefined) {
      const pin = (() => { try { return compileImagesOf().images[b.tree]?.texlive ?? null } catch { return null } })()
      if (typeof r.image !== 'string' || !IMAGE_REF.test(r.image) || r.image !== pin) throw new Error(`base.json's image is not the pinned image of TeX Live ${b.tree} (compile-images.json)`)
    }
    if (r.texts !== undefined && !(Array.isArray(r.texts) && r.texts.length % 2 === 0 && r.texts.length <= 20000 && r.texts.every(t => typeof t === 'string' && t.length <= 4096))) throw new Error('base.json\'s texts are not [macro source, text, …] pairs of strings')
    // (`inkless` as the marks file holds it: at most INK_MAX distinct macro sources of 1 to 200 code units — marks.mjs checkInkless)
    if (r.inkless !== undefined && !(Array.isArray(r.inkless) && r.inkless.length <= 64 && new Set(r.inkless).size === r.inkless.length && r.inkless.every(t => typeof t === 'string' && t.length >= 1 && t.length <= 200))) throw new Error('base.json\'s inkless is not a list of distinct macro sources')
    if (!existsSync(pdf)) throw new Error('base.json names our base page, and there is no base.pdf')
    if (!isFile(pdf, b)) throw new Error('base.pdf is not the page base.json names (sha256, bytes)')
    if (r.layout !== null && !(existsSync(layout) && isFile(layout, file('layout', r.layout)))) throw new Error('layout.json is not the layout base.json names, made over base.pdf')
    return r
  }
  if (r.source === 'arxiv') {
    if (typeof r.why !== 'string' || !/^[a-z]+$/.test(r.why)) throw new Error('base.json says arXiv\'s PDF with no why')
    if (existsSync(pdf)) throw new Error('base.json says arXiv\'s PDF, and there is a base.pdf')
    if (r.layout === null) throw new Error(`our base page was refused (${r.why}) and no layout file is kept in its place: base.json's layout`)
    if (!(existsSync(layout) && isFile(layout, file('layout', r.layout)))) throw new Error('layout.json is not the kept layout base.json names')
    return r
  }
  throw new Error('base.json names no source (ours, arxiv)')
}

/**
 * The record base.json holds for a fixture a make of the fixtures made (layer-fixtures.mjs; baseRecordOf reads it): `made` what
 * the make says of its base page ({ source: 'ours', head }, the head's base; or { source: 'arxiv', why, detail }), `layout` the
 * bytes of the layout file the fixture holds after the make (the one made over our page; where our page was refused, the one
 * kept in its place, keptLayoutOf; null where there is none), `image` the compile image our page was made on
 */
export function baseRecordOfMade({ made, layout, image = null, texts = null, inkless = null }) {
  const file = layout ? { sha256: sha256(layout), bytes: layout.length } : null
  if (made?.source === 'ours') {
    const { source, ...base } = made.head
    // (`texts`: the marks' `marking.texts` the base page was marked with, flat [macro source, text, …]: what the gate's wrap is
    // given, as the maker child gives production's (layout/wrap.mjs wrapFinal), for a cell's lead macro; `inkless`: the macros TeX
    // said set no ink, which the wrap reads as no placeholder of ink, as the maker does)
    return { schema: BASE_RECORD_SCHEMA, source, base, ...(image ? { image } : {}), layout: file, ...(texts ? { texts: [...texts] } : {}), ...(inkless ? { inkless: [...inkless] } : {}) }
  }
  return { schema: BASE_RECORD_SCHEMA, source: 'arxiv', why: made?.why, ...(made?.detail ? { detail: made.detail } : {}), layout: file }
}

/** the first LAYOUT whose file is written over a base page of ours (the marked final pass), not over arXiv's PDF: file.mjs LAYOUT 12 */
const FIRST_OUR_BASE_LAYOUT = 12

/**
 * The layout file a fixture keeps where its base page of ours is refused (`bytes` the file it held, `engineLayout` the engine's
 * LAYOUT): one an older maker made over arXiv's PDF (a LAYOUT below FIRST_OUR_BASE_LAYOUT), which the gate draws over arxiv.pdf as
 * before; never one made over a base page of ours (the engine's own, or an earlier engine's from LAYOUT 12 on), whose coordinates
 * are that page's and would be drawn over arxiv.pdf. Null for none
 */
export function keptLayoutOf(bytes, engineLayout) {
  if (!bytes) return null
  let v = null
  try { v = JSON.parse(new TextDecoder().decode(bytes))?.layout ?? null } catch { return null }
  // (the version is a token; its number is what orders it, and a token with none is no older maker's)
  return typeof v === 'string' && v !== engineLayout && Number.parseInt(v, 10) < FIRST_OUR_BASE_LAYOUT ? bytes : null
}

/** the PIPELINE the translations of the outputs were made under: the one `pipeline` every units.json names */
export function pipelineOf(records, names) {
  const seen = new Set(names.map(n => {
    const p = readJson(join(records, n, 'units.json')).pipeline
    if ((typeof p !== 'string' || !/^\d+$/.test(p)) && !Number.isInteger(p)) throw new Error(`${n}: units.json names no PIPELINE version`)
    return String(p)
  }))
  if (seen.size !== 1) throw new Error(`the translations are of ${seen.size === 0 ? 'no' : 'several'} PIPELINE version${seen.size === 1 ? '' : 's'} (${[...seen].join(', ')})`)
  return [...seen][0]
}

/**
 * The folders of a make as the record names them (`inputs.fixtures`, `records`, `refs`, `geometry`), each with one base: a
 * relative path is under lab/pdf (`root`, which the gate shows its paths relative to: it resolves every folder before it shows
 * it), `~/…` under the home directory, an absolute path as it is. A relative path is never tried under the repository too: a
 * name that exists under both would mean two folders. A flag in `flags` (a path, relative to the repository) takes the
 * place of the record's. A path the gate could not show (`<scratch>/…`, `<local>/…`) or that is not under its base names the
 * input and stops the make.
 */
export function inputsOfRecord(record, { root, repo, flags = {}, exists = existsSync, home = homedir() }) {
  const out = {}
  for (const name of RECORD_INPUTS) {
    if (typeof flags[name] === 'string') { out[name] = resolve(repo, flags[name]); continue }
    const v = record?.inputs?.[name]
    if (typeof v !== 'string' || !v) throw new Error(`the record names no inputs.${name}: give --${name}=<dir>`)
    if (v.startsWith('<')) throw new Error(`the record's inputs.${name} is ${JSON.stringify(v)}, which is no path: give --${name}=<dir>`)
    const found = v === '~' ? home : v.startsWith('~/') ? join(home, v.slice(2)) : v.startsWith('/') ? v : resolve(root, v)
    if (!exists(found)) throw new Error(`the record's inputs.${name} (${JSON.stringify(v)}) is not at ${found}: give --${name}=<dir>`)
    out[name] = found
  }
  return out
}

/** the engine's layout file version: the schema of the file and the maker's version (file.mjs LAYOUT_SCHEMA and LAYOUT) */
export const layoutOfEngine = async engine => {
  const { LAYOUT, LAYOUT_SCHEMA } = await import(pathToFileURL(join(engine, ENGINE, 'layout/file.mjs')).href)
  return { schema: LAYOUT_SCHEMA, version: LAYOUT }
}

/** whether a fixture's layout file is one kept where its base page of ours was refused (its base.json says arXiv's) */
const keptLayout = dir => { try { return readJson(join(dir, 'base.json')).source === 'arxiv' } catch { return false } }

/**
 * The layout files' version: the `schema` and `layout` fields every fixtures/<fx>/layout.json of the outputs names (but a layout
 * kept where our base page was refused: baseRecordOf) (the reader
 * refuses a file whose schema is not its own, and takes `layout` as a version token only), which must all be `expected` (the engine's own). Throws naming each output that is not, with
 * what its file says; a pack made of layout files of two makers, or of another maker than the engine's, is never made.
 */
export function layoutVersionOf(fixtures, names, expected) {
  const bad = []
  for (const n of names) {
    // (a layout kept where our base page was refused, base.json's: made over arXiv's PDF by the maker of before, whose version it names)
    if (keptLayout(join(fixtures, n))) continue
    let j = null
    try { j = readJson(join(fixtures, n, 'layout.json')) } catch { /* named below */ }
    const schema = j?.schema, version = j?.layout
    if (schema !== expected.schema || version !== expected.version) bad.push(`${n}: ${j === null ? 'not a layout file' : `schema ${JSON.stringify(schema)}, layout ${JSON.stringify(version)}`}`)
  }
  if (bad.length) throw new Error(`${bad.length} layout file${bad.length === 1 ? '' : 's'} not of the engine's version (schema ${expected.schema}, layout ${JSON.stringify(expected.version)}); make the fixtures again with the engine (layer gate, --layouts=made):\n  ${bad.slice(0, 40).join('\n  ')}${bad.length > 40 ? '\n  …' : ''}`)
  return { schema: expected.schema, version: expected.version }
}

const IMAGE_REF = /^[a-z0-9][a-z0-9./_-]*(?::[A-Za-z0-9._-]+)?@sha256:[0-9a-f]{64}$/
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)
/** the keys of one image's pin, in order */
const PIN_KEYS = ['texlive', 'base', 'node', 'aptSnapshot', 'texFormat']
/** what one OS refresh moves in every image at once: the same in each */
const SHARED_KEYS = ['base', 'node', 'aptSnapshot']
/**
 * The compile images' pins (lab/pdf/compile-images.json): { default, images }, `images` keyed by TeX Live year ('2025'), each
 * { texlive, base, node, aptSnapshot, texFormat }: the three images as `name[:tag]@sha256:<64 hex>`, `aptSnapshot` the dated apt
 * snapshot the web container installs from, or null where none is pinned, `texFormat` the TeX Live release (`texlive`, the
 * entry's year) and the format's tool versions. `default` names an entry (the year a paper is compiled on unless routed; the
 * font coverage's). The base, Node and the snapshot are the same in every entry: one OS refresh moves them all. Throws on a file
 * that is not that
 */
export function compileImagesOf(file = COMPILE_IMAGES_FILE) {
  const j = readJson(file)
  if (!isObject(j) || Object.keys(j).join() !== 'default,images') throw new Error(`${file}: the keys must be default, images`)
  if (!isObject(j.images) || !Object.keys(j.images).length) throw new Error(`${file}: images must be an object of the pins by TeX Live year`)
  for (const [year, pin] of Object.entries(j.images)) {
    const at = `${file}: images.${year}`
    if (!/^\d{4}$/.test(year)) throw new Error(`${file}: images are keyed by TeX Live year, not ${JSON.stringify(year)}`)
    if (!isObject(pin) || Object.keys(pin).join() !== PIN_KEYS.join()) throw new Error(`${at}: the keys must be ${PIN_KEYS.join(', ')}`)
    for (const k of ['texlive', 'base', 'node']) if (typeof pin[k] !== 'string' || !IMAGE_REF.test(pin[k])) throw new Error(`${at}: ${k} must be name[:tag]@sha256:<digest>`)
    if (pin.aptSnapshot !== null && (typeof pin.aptSnapshot !== 'string' || !/^\d{8}T\d{6}Z$/.test(pin.aptSnapshot))) throw new Error(`${at}: aptSnapshot must be null or a snapshot timestamp (YYYYMMDDTHHMMSSZ)`)
    if (!isObject(pin.texFormat)) throw new Error(`${at}: texFormat must be an object`)
    if (pin.texFormat.texlive !== Number(year)) throw new Error(`${at}: texFormat.texlive must be ${year}, the entry's year`)
  }
  if (typeof j.default !== 'string' || !Object.hasOwn(j.images, j.default)) throw new Error(`${file}: default must name one of the images (${Object.keys(j.images).join(', ')})`)
  for (const k of SHARED_KEYS) if (new Set(Object.values(j.images).map(pin => pin[k])).size > 1) throw new Error(`${file}: ${k} must be the same in every image (one OS refresh moves them all)`)
  return j
}

/** one TeX Live year's pin (compileImagesOf), the default year's where none is asked: { texlive, base, node, aptSnapshot,
 *  texFormat }. Throws where the file is not the pins, or no image is pinned for the year */
export function compileImageOf(year = null, file = COMPILE_IMAGES_FILE) {
  const j = compileImagesOf(file)
  const y = year === null || year === undefined ? j.default : String(year)
  if (!Object.hasOwn(j.images, y)) throw new Error(`${file}: no image is pinned for TeX Live ${y} (${Object.keys(j.images).join(', ')})`)
  return j.images[y]
}

/** the repo digests (`sha256:...`) the local docker has for an image reference, [] where there is none; throws where docker cannot be asked */
export function localImageDigests(ref, run = execFileSync) {
  let out
  try { out = run('docker', ['image', 'inspect', '--format', '{{json .RepoDigests}}', ref], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) } catch (e) {
    throw new Error(`cannot ask docker for ${ref} (${String(e?.stderr ?? e?.message ?? e).trim().split('\n')[0]}): the pack is made on the pinned compile image, which has to be there to be checked`)
  }
  const list = JSON.parse(out)
  return Array.isArray(list) ? list.map(x => String(x).slice(String(x).indexOf('@') + 1)) : []
}

/** throws unless the local image of a year's pinned texlive reference (compileImageOf) has the pinned digest, and the lab's
 *  compiles (COMPILE_IMAGE, COMPILE_YEAR: spikes/compile-image.mjs) name that image where they name one */
export function checkCompileImage(pinned, digests, env = process.env) {
  const year = String(pinned.texFormat?.texlive ?? '')
  if (env.COMPILE_IMAGE && env.COMPILE_IMAGE !== pinned.texlive) throw new Error(`COMPILE_IMAGE is not the pin of TeX Live ${year} (lab/pdf/compile-images.json): a pack is made on its year's pinned image alone`)
  if (env.COMPILE_YEAR && String(env.COMPILE_YEAR) !== year) throw new Error(`COMPILE_YEAR ${env.COMPILE_YEAR} is not the pack's year, ${year}: a pack is made on its year's pinned image alone (make --year)`)
  const want = pinned.texlive.slice(pinned.texlive.indexOf('@') + 1)
  if (!digests.includes(want)) throw new Error(`the local ${pinned.texlive.slice(0, pinned.texlive.indexOf('@'))} is ${digests.length ? digests.join(', ') : 'not there'}, not the pinned ${want} of TeX Live ${year} (lab/pdf/compile-images.json): pull the pinned image, or change the pin for the web container too`)
}

/** whether a directory holds a pack: a manifest.json of this schema or an earlier one (a make over the pack before a schema
 *  bump clears it) whose digest is its listing's (a browser extension's manifest.json is no pack's) */
function isPack(dir) {
  try {
    const m = readJson(join(dir, 'manifest.json'))
    return Number.isInteger(m.schema) && m.schema >= 1 && m.schema <= PACK_SCHEMA && Array.isArray(m.files) && typeof m.digest === 'string' && listingDigest(m.files) === m.digest
  } catch { return false }
}

/**
 * The pack written to `out`: each file copied (a clone where the filesystem has them), its mtime set to the epoch, its digest
 * and size read back from the copy; `manifest.json` last. An `out` that holds a pack is cleared first, one that holds anything else is refused. Returns the manifest.
 */
export function makePack({ entries, out, pipeline, layout, compileImage = null, made = new Date().toISOString() }) {
  if (!Number.isInteger(layout?.schema) || typeof layout?.version !== 'string') throw new Error('makePack: the layout files\' schema and version are needed (layoutVersionOf)')
  if (existsSync(out)) {
    if (isPack(out)) rmSync(out, { recursive: true })
    else if (readdirSync(out).length) throw new Error(`${out} holds files that are no pack's (no manifest.json of a pack): not touching them`)
  }
  mkdirSync(out, { recursive: true })
  const files = []
  for (const { path, from } of [...entries].sort(byPath)) {
    const to = join(out, safePath(path))
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(from, to, constants.COPYFILE_FICLONE)
    utimesSync(to, 0, 0)
    const bytes = readFileSync(to)
    files.push({ path, sha256: sha256(bytes), bytes: bytes.length })
  }
  const manifest = { schema: PACK_SCHEMA, pipeline, layout, ...(compileImage ? { compileImage } : {}), made, digest: listingDigest(files), files }
  writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`)
  return manifest
}

/** the committed copy of a manifest: each file with the url of its object, a key of its digest */
export function packJsonOf(manifest, bucket = BUCKET) {
  return { schema: manifest.schema, pipeline: manifest.pipeline, layout: manifest.layout, ...(manifest.compileImage ? { compileImage: manifest.compileImage } : {}), made: manifest.made, digest: manifest.digest, bucket, files: manifest.files.map(f => ({ ...f, url: `r2://${bucket}/${KEY_PREFIX}${f.sha256}` })) }
}

/** the pack's files grouped by what they are, for the listing the maintainer sees before an upload (counts and sizes only) */
export function summaryOf(files) {
  const kind = path => {
    const [top, , file] = path.split('/')
    if (top === 'fixtures') return `fixtures/${file}`
    if (top === 'refs') return `refs/${file}`
    return top
  }
  const by = new Map()
  for (const f of files) { const k = kind(f.path), e = by.get(k) ?? { files: 0, bytes: 0 }; e.files++; e.bytes += f.bytes; by.set(k, e) }
  const distinct = new Map(files.map(f => [f.sha256, f.bytes]))
  return { files: files.length, bytes: files.reduce((a, f) => a + f.bytes, 0), objects: distinct.size, objectBytes: [...distinct.values()].reduce((a, b) => a + b, 0), kinds: [...by].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([kind, v]) => ({ kind, ...v })) }
}

// ---------------------------------------------------------------- restoring

/** the S3 url of a manifest's `r2://<bucket>/<key>` object, which must be of the pack's bucket (the read is scripts/r2-read.mjs's) */
export function objectUrl(account, url, bucket = BUCKET) {
  accountOf(account)
  const m = /^r2:\/\/([a-z0-9][a-z0-9-]{1,62})\/(.+)$/.exec(String(url))
  if (!m || m[1] !== bucket || !isKey(m[2])) throw new Error(`not an object of ${bucket}: ${JSON.stringify(String(url).slice(0, 80))}`)
  return keyUrl(account, m[2], bucket)
}

const fileIs = (file, f) => { try { const b = readFileSync(file); return b.length === f.bytes && sha256(b) === f.sha256 } catch { return false } }

/**
 * A pack restored into `dir` from the bucket: each distinct digest read once (a file already there with the right digest
 * is kept; the several outputs of one paper share an object), checked against the manifest's digest and size before it is
 * written, and a read that fails for want of the network or the server (not for a 4xx) tried again twice. The S3 credentials
 * are derived once, by the first read that needs them (a restore that finds everything there asks Cloudflare nothing; one that
 * reads any object has verified the token first), and each read is signed with `now()`. Nothing the token, the secret or a
 * signature is in is printed or thrown: the errors say the status and the key.
 */
export async function restorePack({ pack, dir, token, account, fetchImpl = fetch, retryMs = 1000, now = () => new Date(), log = () => {} }) {
  tokenOf(token)
  if (pack.schema !== PACK_SCHEMA) throw new Error(`gate-pack.json is schema ${pack.schema}, this script reads ${PACK_SCHEMA}`)
  const objects = new Map()
  for (const f of pack.files) {
    if (!SHA.test(f.sha256) || !Number.isInteger(f.bytes)) throw new Error(`${f.path}: not a digest and a size`)
    safePath(f.path)
    const e = objects.get(f.sha256) ?? { file: f, paths: [] }
    e.paths.push(f.path)
    objects.set(f.sha256, e)
  }
  let credentials = null
  const get = async f => {
    const url = objectUrl(account, f.url, pack.bucket)
    credentials ??= s3Credentials({ token, account, fetchImpl, retryMs })
    const { res, value } = await getObject({ url, credentials: await credentials, fetchImpl, retryMs, now })
    if (!value) throw new Error(`${f.url}: ${res ? `HTTP ${res.status}` : 'the request failed'}${res?.status === 404 ? ' (is the pack uploaded?)' : res?.status === 401 || res?.status === 403 ? ' (does the token read this bucket?)' : ''}`)
    return value
  }
  const todo = [...objects.values()]
  let next = 0, fetched = 0, kept = 0
  const worker = async () => {
    for (let e; (e = todo[next++]); ) {
      const have = e.paths.filter(p => fileIs(join(dir, p), e.file))
      let bytes = null
      if (have.length === e.paths.length) { kept++; continue }
      if (have.length) bytes = readFileSync(join(dir, have[0]))
      else {
        bytes = await get(e.file)
        if (bytes.length !== e.file.bytes || sha256(bytes) !== e.file.sha256) throw new Error(`${e.file.url}: the bytes are not the manifest's (${bytes.length} bytes, expected ${e.file.bytes}, or another digest)`)
        fetched++
      }
      for (const p of e.paths) {
        if (have.includes(p)) continue
        mkdirSync(dirname(join(dir, p)), { recursive: true })
        writeFileSync(join(dir, p), bytes)
        utimesSync(join(dir, p), 0, 0)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, todo.length) }, worker))
  log(`restored ${pack.files.length} files: ${fetched} objects read, ${kept} already there`)
  return { files: pack.files.length, objects: objects.size, fetched, kept }
}

/** the pack in `dir` against its manifest: every file present with its digest and size, and no file the manifest does not list */
export function verifyPack({ pack, dir }) {
  const problems = []
  const listed = new Set(pack.files.map(f => f.path))
  for (const f of pack.files) if (!fileIs(join(dir, f.path), f)) problems.push(`${f.path}: ${existsSync(join(dir, f.path)) ? 'not the manifest\'s bytes' : 'missing'}`)
  const walk = (d, rel) => {
    for (const n of readdirSync(d).sort()) {
      const path = rel ? `${rel}/${n}` : n
      if (statSync(join(d, n)).isDirectory()) walk(join(d, n), path)
      else if (path !== 'manifest.json' && !listed.has(path)) problems.push(`${path}: not in the manifest`)
    }
  }
  if (existsSync(dir)) walk(dir, '')
  if (listingDigest(pack.files) !== pack.digest) problems.push('the manifest\'s digest is not its listing\'s')
  return problems
}

/** the objects to upload, once each: [{ key, sha256, bytes, path }] with the first local path of each */
export function objectsOf(pack, bucket = pack.bucket) {
  const seen = new Map()
  for (const f of pack.files) if (!seen.has(f.sha256)) seen.set(f.sha256, { key: f.url.replace(/^r2:\/\/[^/]+\//, ''), bucket, sha256: f.sha256, bytes: f.bytes, path: f.path })
  return [...seen.values()]
}

// ---------------------------------------------------------------- the command line

const arg = (name, argv = process.argv) => { const a = argv.find(x => x === `--${name}` || x.startsWith(`--${name}=`)); return a === undefined ? null : a.includes('=') ? a.slice(name.length + 3) : true }
/** the pack's TeX Live year: --year, else the pins' default */
const yearOf = argv => { const y = arg('year', argv); return typeof y === 'string' ? y : compileImagesOf().default }
const where = (argv, name) => resolve(REPO, typeof arg(name, argv) === 'string' ? arg(name, argv) : DEFAULTS[name] ?? packPathsOf(yearOf(argv), compileImagesOf().default)[name])
/** the four folders a make reads: the record's, a flag taking the place of each */
const recordInputs = argv => {
  const file = where(argv, 'record')
  if (!existsSync(file) && RECORD_INPUTS.some(n => typeof arg(n, argv) !== 'string')) throw new Error(`no ${file}: it names the inputs of a make`)
  const flags = Object.fromEntries(RECORD_INPUTS.map(n => [n, arg(n, argv)]))
  return inputsOfRecord(existsSync(file) ? readJson(file) : null, { root: resolve(REPO, 'lab/pdf'), repo: REPO, flags })
}
const mb = n => `${(n / 1048576).toFixed(1)} MB`

async function main(argv) {
  const [command] = argv
  const packFile = where(argv, 'json'), packArg = typeof arg('pack', argv) === 'string' ? resolve(arg('pack', argv)) : packFile
  if (command === 'make') {
    // (the layouts are made on the year's pinned compile image: refused before anything is read where the local one is another;
    // the manifest names the year)
    const year = yearOf(argv), pin = compileImageOf(year)
    checkCompileImage(pin, localImageDigests(pin.texlive))
    const compileImage = { year, ...pin }
    const engine = resolve(typeof arg('engine', argv) === 'string' ? arg('engine', argv) : REPO)
    const E = f => import(pathToFileURL(join(engine, ENGINE, f)).href)
    const [{ FACES, rolesFor, ENGLISH_FAMILIES }, { BUILTIN_RULES, resolveRules }, { TEX_PATTERN_FILES }] = await Promise.all([E('rules/font-roles.mjs'), E('rules/layout.mjs'), E('layer-proto/hyph.mjs')])
    const { fixtures, records, refs, geometry } = recordInputs(argv)
    const names = outputsOf(refs)
    const layout = layoutVersionOf(fixtures, names, await layoutOfEngine(engine))
    const targets = [...new Set(names.map(n => nameOf(n).target))].sort()
    const texmf = resolve(typeof arg('texmf', argv) === 'string' ? arg('texmf', argv) : process.env.TEXMF_DIST ?? join(homedir(), 'Library/TinyTeX/texmf-dist'))
    const sources = typeof arg('sources', argv) === 'string' ? resolve(arg('sources', argv)) : resolve(REPO, 'lab/pdf/data/corpus')
    const entries = entriesOf({ fixtures, records, refs, geometry, sources, fontsDir: where(argv, 'fonts'), fonts: fontFiles(FACES, cjkRoleFaces({ rolesFor, ENGLISH_FAMILIES, BUILTIN_RULES, resolveRules }, targets)), patterns: TEX_PATTERN_FILES, texmf })
    const manifest = makePack({ entries, out: where(argv, 'out'), pipeline: pipelineOf(records, names), layout, compileImage })
    writeFileSync(packFile, `${JSON.stringify(packJsonOf(manifest), null, 1)}\n`)
    const s = summaryOf(manifest.files)
    console.log(`pack ${manifest.digest} (PIPELINE ${manifest.pipeline}, layout schema ${layout.schema} version ${layout.version}): ${s.files} files, ${mb(s.bytes)}; ${s.objects} distinct objects, ${mb(s.objectBytes)}`)
    for (const k of s.kinds) console.log(`  ${k.kind.padEnd(24)} ${String(k.files).padStart(4)} files ${mb(k.bytes).padStart(10)}`)
    console.log(`  ${names.length} outputs of ${targets.length} targets (${targets.join(' ')}); written to ${where(argv, 'out')} and ${packFile}`)
    return 0
  }
  const pack = existsSync(packArg) ? readJson(packArg) : null
  if (!pack) throw new Error(`no ${packArg}`)
  const dir = where(argv, 'out')
  if (command === 'digest') { console.log(pack.digest); return 0 }
  if (command === 'restore') {
    await restorePack({ pack, dir, token: process.env.READARXIV_CI_TOKEN, account: process.env.CF_ACCOUNT_ID, log: console.log })
    return 0
  }
  if (command === 'verify') {
    const problems = verifyPack({ pack, dir })
    for (const p of problems.slice(0, 30)) console.log(`FAIL ${p}`)
    console.log(problems.length ? `FAIL the pack in ${dir} is not ${pack.digest} (${problems.length} problems)` : `the pack in ${dir} is ${pack.digest}: ${pack.files.length} files`)
    return problems.length ? 1 : 0
  }
  if (command === 'objects') {
    for (const o of objectsOf(pack)) console.log(`${o.key}\t${o.bytes}\t${o.sha256}\t${join(dir, o.path)}`)
    return 0
  }
  throw new Error('usage: gate-pack.mjs make | restore | verify | digest | objects')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(code => process.exit(code), e => { console.error(String(e?.message ?? e)); process.exit(2) })
}
