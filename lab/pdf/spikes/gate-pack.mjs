// lab/pdf/spikes/gate-pack.mjs
// The fixture pack the rules gate runs from in CI (rules-as-data plan §8, Task R6). The layer gate's model tier reads the
// 29 outputs' inputs from lab/pdf/data and out/, which a runner does not have and a public repository may not hold: arXiv's
// PDFs, the layout files made from them and the PIPELINE translations are under arXiv's licence. The pack is those inputs
// and nothing else, made on the maintainer's machine, kept in a private bucket, and restored by digest:
//   pack/fixtures/<fx>/arxiv.pdf, layout.json     the made layout files (--fixtures)
//   pack/fixtures/<fx>/units.json, record.json    the PIPELINE translations, which the gate reads beside them (--records' files)
//   pack/refs/<fx>/ref.json, layout.json          the frozen reference text area and the instrument's kept layout (LAYER_REFS)
//   pack/geometry/<paper>-<target>-geometry.json  the geometry the gate resolves for each output (LAYER_GEOMETRY)
//   pack/data/fonts/<file>                        the served faces (AXT_DATA=pack/data)
//   pack/texmf/<tex/generic/...>                  the en and de hyphenation patterns (TEXMF_DIST=pack/texmf)
//   pack/manifest.json                            { schema, pipeline, made, digest, files: [{ path, sha256, bytes }] }
// The pack is a file set, not an archive: sorted, each file's mtime zeroed, and the listing digest (the paths, digests and
// sizes, not the clock) is the same on every make. lab/pdf/gate-pack.json is the committed copy of the manifest with each
// file's `url` in the bucket, a key of its digest, so that the several outputs of one paper share one object.
//
//   node lab/pdf/spikes/gate-pack.mjs make     [--out=<dir>] [--json=<gate-pack.json>] [--fixtures=<dir>] [--records=<dir>]
//                                              [--refs=<dir>] [--geometry=<dir>] [--fonts=<dir>] [--texmf=<dir>] [--engine=<dir>]
//   node lab/pdf/spikes/gate-pack.mjs restore  [--pack=<gate-pack.json>] [--out=<dir>]    READARXIV_CI_TOKEN, CF_ACCOUNT_ID
//   node lab/pdf/spikes/gate-pack.mjs verify   [--pack=<gate-pack.json>] [--out=<dir>]
//   node lab/pdf/spikes/gate-pack.mjs digest   [--pack=<gate-pack.json>]
//   node lab/pdf/spikes/gate-pack.mjs objects  [--pack=<gate-pack.json>] [--out=<dir>]    the objects to upload, once each
// `make` and `objects` read and write local files only; `restore` is the only command that touches the network, with a
// read-only token that it sends to Cloudflare's API and nowhere else, and never prints.
import { createHash } from 'node:crypto'
import { constants, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { geometryFile, nameOf } from './layer-gate/ref.mjs'

export const PACK_SCHEMA = 1
export const BUCKET = 'readarxiv-ci'
/** the pack's objects in the bucket: gate-pack/<sha256> */
export const KEY_PREFIX = 'gate-pack/'
/** the weights a CJK group's roles are built from (font-roles.mjs rolesFor): the body, the bold, and the lights and semibolds
 *  the rule `cjkFaces.light` switches between */
export const ROLE_WEIGHTS = ['light', 'regular', 'semibold', 'bold']

const here = new URL('.', import.meta.url).pathname
const REPO = resolve(here, '../../..')
const ENGINE = 'src/pdf-reader/engine'
/** where each input of a make is, unless a flag says otherwise: the fidelity record's run (the made layout files of the
 *  engine at the record, the PIPELINE 10 cut's translations, references and geometry) */
const DEFAULTS = {
  fixtures: 'lab/pdf/out/layer-gate/fixtures/41795914c3c84238', records: 'lab/pdf/out/layer-gate/cut-p10/records', refs: 'lab/pdf/out/layer-gate/cut-p10/refs',
  geometry: 'lab/pdf/out/layer-gate/cut-p10/geometry', fonts: 'lab/pdf/data/fonts', out: 'lab/pdf/out/gate-pack', json: 'lab/pdf/gate-pack.json',
}
const FIXTURE = /^[A-Za-z0-9._-]+v\d+-[A-Za-z-]+$/
const SHA = /^[0-9a-f]{64}$/

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
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
 * The font files the outputs can draw in. Every face of the role table that is no CJK face, whole (no rule picks a Latin
 * face, and the papers' families decide which are drawn); of a CJK group, only what a target of the pack names: the four
 * weights its roles are built from, so that a rule moving `cjkFaces.light` can be measured, and its Kai. `known` are the
 * CJK families (`{ group, kai }`) the built-in rule set names for any script, `used` those of the pack's targets. A group
 * or a Kai the pack's targets do not use (Traditional Chinese's, which has no fixture) is left out.
 */
export function fontFiles(faces, known, used) {
  const ids = Object.keys(faces)
  const cjk = new Set()
  for (const { group, kai } of known) {
    for (const id of ids) if (id.startsWith(`${group}-`)) cjk.add(id)
    if (kai) cjk.add(kai)
  }
  const want = new Set(ids.filter(id => !cjk.has(id)))
  const need = id => { if (!Object.hasOwn(faces, id)) throw new Error(`the role table has no face ${id}`); want.add(id) }
  for (const { group, kai } of used) {
    for (const w of ROLE_WEIGHTS) need(`${group}-${w}`)
    if (kai) need(kai)
  }
  return [...new Set([...want].map(id => faces[id].file))].sort()
}

/** the outputs of a made fixtures folder: <paper>v<n>-<target>, each with its PDF and layout file */
export function outputsOf(dir) {
  return readdirSync(dir).filter(n => FIXTURE.test(n) && existsSync(join(dir, n, 'layout.json')) && existsSync(join(dir, n, 'arxiv.pdf'))).sort()
}

/**
 * The pack's files as { path, from }, sorted by path. `o`: the folders of a make (fixtures, records, refs, geometry),
 * `fonts` the file names to take from the fonts folder, `fontsDir`, and `patterns` the hyphenation files ({ lang: relative
 * path under texmf }) with `texmf` their root. Throws naming everything missing, so that a pack is never partly made.
 */
export function entriesOf(o) {
  const names = outputsOf(o.fixtures)
  if (!names.length) throw new Error(`no output in ${o.fixtures}`)
  const out = new Map(), missing = []
  const add = (path, from) => {
    safePath(path)
    if (!existsSync(from)) { missing.push(from); return }
    if (out.has(path) && out.get(path) !== from) throw new Error(`${path}: two sources`)
    out.set(path, from)
  }
  for (const n of names) {
    add(`fixtures/${n}/arxiv.pdf`, join(o.fixtures, n, 'arxiv.pdf'))
    add(`fixtures/${n}/layout.json`, join(o.fixtures, n, 'layout.json'))
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
  if (missing.length) throw new Error(`the pack is missing ${missing.length} input${missing.length === 1 ? '' : 's'}:\n  ${missing.slice(0, 20).join('\n  ')}${missing.length > 20 ? '\n  …' : ''}`)
  return [...out].map(([path, from]) => ({ path, from })).sort(byPath)
}

/** the PIPELINE the translations of the outputs were made under: the one `pipeline` every units.json names */
export function pipelineOf(records, names) {
  const seen = new Set(names.map(n => String(readJson(join(records, n, 'units.json')).pipeline)))
  if (seen.size !== 1) throw new Error(`the translations are of ${seen.size === 0 ? 'no' : 'several'} PIPELINE version${seen.size === 1 ? '' : 's'} (${[...seen].join(', ')})`)
  return [...seen][0]
}

/** whether a directory holds a pack: a manifest.json of this schema whose digest is its listing's (a browser extension's manifest.json is no pack's) */
function isPack(dir) {
  try {
    const m = readJson(join(dir, 'manifest.json'))
    return m.schema === PACK_SCHEMA && Array.isArray(m.files) && typeof m.digest === 'string' && listingDigest(m.files) === m.digest
  } catch { return false }
}

/**
 * The pack written to `out`: each file copied (a clone where the filesystem has them), its mtime set to the epoch, its digest
 * and size read back from the copy; `manifest.json` last. An `out` that holds a pack is cleared first, one that holds anything else is refused. Returns the manifest.
 */
export function makePack({ entries, out, pipeline, made = new Date().toISOString() }) {
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
  const manifest = { schema: PACK_SCHEMA, pipeline, made, digest: listingDigest(files), files }
  writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`)
  return manifest
}

/** the committed copy of a manifest: each file with the url of its object, a key of its digest */
export function packJsonOf(manifest, bucket = BUCKET) {
  return { schema: manifest.schema, pipeline: manifest.pipeline, made: manifest.made, digest: manifest.digest, bucket, files: manifest.files.map(f => ({ ...f, url: `r2://${bucket}/${KEY_PREFIX}${f.sha256}` })) }
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

/** an object's url in the bucket as a read of Cloudflare's REST API: slashes of the key literal, as the API asks, the rest escaped */
export function objectUrl(account, url, bucket = BUCKET) {
  if (typeof account !== 'string' || !/^[0-9a-f]{32}$/.test(account)) throw new Error('CF_ACCOUNT_ID is not a Cloudflare account id')
  const m = /^r2:\/\/([a-z0-9][a-z0-9-]{1,62})\/([A-Za-z0-9._/-]+)$/.exec(String(url))
  if (!m || m[1] !== bucket || m[2].split('/').some(s => s === '' || s === '.' || s === '..')) throw new Error(`not an object of ${bucket}: ${JSON.stringify(String(url).slice(0, 80))}`)
  return `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${bucket}/objects/${m[2].split('/').map(encodeURIComponent).join('/')}`
}

const fileIs = (file, f) => { try { const b = readFileSync(file); return b.length === f.bytes && sha256(b) === f.sha256 } catch { return false } }
const sleep = ms => new Promise(ok => setTimeout(ok, ms))

/**
 * A pack restored into `dir` from the bucket: each distinct digest read once (a file already there with the right digest
 * is kept; the several outputs of one paper share an object), checked against the manifest's digest and size before it is
 * written, and a read that fails for want of the network or the server (not for a 4xx) tried again twice. Nothing the
 * token is in is printed or thrown: the errors say the status and the key.
 */
export async function restorePack({ pack, dir, token, account, fetchImpl = fetch, retryMs = 1000, log = () => {} }) {
  if (typeof token !== 'string' || !token) throw new Error('READARXIV_CI_TOKEN is not set')
  if (pack.schema !== PACK_SCHEMA) throw new Error(`gate-pack.json is schema ${pack.schema}, this script reads ${PACK_SCHEMA}`)
  const objects = new Map()
  for (const f of pack.files) {
    if (!SHA.test(f.sha256) || !Number.isInteger(f.bytes)) throw new Error(`${f.path}: not a digest and a size`)
    safePath(f.path)
    const e = objects.get(f.sha256) ?? { file: f, paths: [] }
    e.paths.push(f.path)
    objects.set(f.sha256, e)
  }
  const get = async (f, url) => {
    for (let attempt = 0; ; attempt++) {
      let res
      try { res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } }) } catch { res = null }
      if (res?.ok) return Buffer.from(await res.arrayBuffer())
      const retry = !res || res.status >= 500 || res.status === 429
      if (!retry || attempt >= 2) throw new Error(`${f.url}: ${res ? `HTTP ${res.status}` : 'the request failed'}${res?.status === 404 ? ' (is the pack uploaded?)' : res?.status === 401 || res?.status === 403 ? ' (does the token read this bucket?)' : ''}`)
      await sleep(retryMs * (attempt + 1))
    }
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
        bytes = await get(e.file, objectUrl(account, e.file.url, pack.bucket))
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
const where = (argv, name) => resolve(REPO, typeof arg(name, argv) === 'string' ? arg(name, argv) : DEFAULTS[name])
const mb = n => `${(n / 1048576).toFixed(1)} MB`

async function main(argv) {
  const [command] = argv
  const packFile = where(argv, 'json'), packArg = typeof arg('pack', argv) === 'string' ? resolve(arg('pack', argv)) : packFile
  if (command === 'make') {
    const engine = resolve(typeof arg('engine', argv) === 'string' ? arg('engine', argv) : REPO)
    const E = f => import(pathToFileURL(join(engine, ENGINE, f)).href)
    const [{ FACES }, { BUILTIN_RULES, resolveRules, SCRIPTS }, { TEX_PATTERN_FILES }] = await Promise.all([E('font-roles.mjs'), E('rules/layout.mjs'), E('layer-proto/hyph.mjs')])
    const fixtures = where(argv, 'fixtures'), records = where(argv, 'records')
    const names = outputsOf(fixtures)
    const targets = [...new Set(names.map(n => nameOf(n).target))].sort()
    const known = SCRIPTS.map(s => BUILTIN_RULES.scripts[s].cjkFaces).filter(Boolean)
    const used = [...new Map(targets.map(t => resolveRules(BUILTIN_RULES, t).cjkFaces).filter(Boolean).map(c => [`${c.group}|${c.kai}`, c])).values()]
    const texmf = resolve(typeof arg('texmf', argv) === 'string' ? arg('texmf', argv) : process.env.TEXMF_DIST ?? join(homedir(), 'Library/TinyTeX/texmf-dist'))
    const entries = entriesOf({ fixtures, records, refs: where(argv, 'refs'), geometry: where(argv, 'geometry'), fontsDir: where(argv, 'fonts'), fonts: fontFiles(FACES, known, used), patterns: TEX_PATTERN_FILES, texmf })
    const manifest = makePack({ entries, out: where(argv, 'out'), pipeline: pipelineOf(records, names) })
    writeFileSync(packFile, `${JSON.stringify(packJsonOf(manifest), null, 1)}\n`)
    const s = summaryOf(manifest.files)
    console.log(`pack ${manifest.digest} (PIPELINE ${manifest.pipeline}): ${s.files} files, ${mb(s.bytes)}; ${s.objects} distinct objects, ${mb(s.objectBytes)}`)
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
