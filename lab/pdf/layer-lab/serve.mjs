// lab/pdf/layer-lab/serve.mjs
// The layer lab: a local bench for the instant layer, which draws a paper's translation straight into the original's
// layout. Pick a paper and a language; show any two of Original (arXiv's PDF), the quick view (the instant layer as the
// engine draws it: layer-lab/proto.mjs) and Final (a compiled translation already made beside the fixture, which the lab
// only reads: nothing here compiles) side by side, pages in step (an old link's `layer` still opens the retired early
// engine, layer-lab/layer.mjs); set the quick view's choices, and edit, save and load the layout rule set; keep notes. A
// static server on 127.0.0.1 with the rules routes (rules-api.mjs) and nothing else: the page (index.html, lab.mjs, lab.css,
// strings.mjs, rules-model.mjs, rules-panel.mjs, layer.mjs, proto.mjs) and the
// extension's tokens and controls it is drawn with (/styles/…, src/styles), the engine's modules as they are
// (/src/pdf-reader/engine/… and /proto-engine/…, every import relative), PDF.js's pinned modern build from the
// repository's node_modules (/pdfjs/…, by the page's import map), the role table's faces from the local font folder
// (/fonts/<file>, data/fonts), TinyTeX's Latin Modern faces and hyphenation patterns (TEXMF_DIST) at /proto-fonts/ and
// /hyph/, as the prototype's own host served them, and the fixtures (/fixtures/<id>v<n>-<target>/…).
//   node lab/pdf/layer-lab/serve.mjs [--port=8093]      then open http://127.0.0.1:8093/
// The layer gate's inputs (layer-lab/README.md has the one line), each a folder of <id>v<n>-<target>/ folders; a relative
// path is taken from where the server is started:
//   LAYER_FIXTURES  arXiv's PDF and the layout file (the gate's made fixtures, out/layer-gate/fixtures/<key>); default
//                   data/layer-fixtures, the lab's own
//   LAYER_RECORDS   the translation, units.json and record.json, where it is not beside them (the gate's records on the
//                   front end's cut, out/layer-gate/cut-p10/records)
//   LAYER_GEOMETRY  v0's geometry by paper, <id>v<n>-<target>-geometry.json (the cut's, out/layer-gate/cut-p10/geometry);
//                   default the gate's own (layer-gate/ref.mjs PROTO_GEOMETRY), the prototype's iteration 2 data
//   LAYER_FINALS    the compiled finals where the fixtures have none; default data/layer-fixtures
// LAYER_PROTO names another worktree whose engine the v0 view runs (default this one's); LAYER_ENTRY serves another file
// at layer/layer.mjs (a stand-in for the Layer view).
// The rule set: the quick view draws with the set the page holds (rules-panel.mjs), which a save writes to this worktree's
// src/pdf-reader/engine/rules/layout-rules.json, validated and canonical, by this worktree's own rules module whatever
// LAYER_PROTO names. LAYER_RULES_STAGING and LAYER_RULES_PRODUCTION give the URL of the web's current-set route for each
// environment (https://…/api/v1/rules/s1); the page loads and compares the published set through them, and shows one that
// was given no URL, or whose route answers 404 or is not there, as unavailable. The lab asks nothing else of the network.
// The text-removed PDF: the paper's add-on, one a paper whatever the target, made from its layout file alone as the
// server makes it (layout/addon.mjs paperAddon, the same function the gate's shipped half calls) and read as a reader
// reads it: arXiv's PDF with the add-on appended, one document, and its manifest (GET /api/addon/<fixture>, GET
// /addon/<key>.pdf). It is the gate's own where its cache holds one for the paper's bytes, layout file and remover
// (out/layer-gate/removal/<key>/, LAYER_ADDONS another), else made here once and kept in out/layer-lab/addon/<key>/.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { deflateSync, inflateRawSync, inflateSync, constants as Z } from 'node:zlib'
import { geometryFile, PROTO_GEOMETRY } from '../spikes/layer-gate/ref.mjs'
import { isOwnHost } from './own-host.mjs'
import { createRulesApi, RULES_PATH } from './rules-api.mjs'

const here = new URL('.', import.meta.url).pathname
const root = resolve(here, '..')
const REPO = resolve(root, '../..')
const DATA = process.env.AXT_DATA ?? join(root, 'data')
const LAB_FIXTURES = resolve(join(DATA, 'layer-fixtures'))
const FIXTURES = resolve(process.env.LAYER_FIXTURES ?? LAB_FIXTURES)
const RECORDS = process.env.LAYER_RECORDS ? resolve(process.env.LAYER_RECORDS) : null
const FINALS = resolve(process.env.LAYER_FINALS ?? LAB_FIXTURES)
const FONTS = resolve(join(DATA, 'fonts'))
const ENGINE = resolve(REPO, 'src/pdf-reader/engine')
const PDFJS = resolve(REPO, 'node_modules/pdfjs-dist')
/** the layout rules' validator (zod, the mini build), served at /zod/ for the page's import map */
const ZOD = resolve(REPO, 'node_modules/zod')
const ENTRY = process.env.LAYER_ENTRY ? resolve(process.env.LAYER_ENTRY) : null
const PORT = Number(process.argv.find(a => a.startsWith('--port='))?.slice(7) ?? 8093)
const PAGE_FILES = new Set(['index.html', 'lab.mjs', 'lab.css', 'strings.mjs', 'rules-model.mjs', 'rules-panel.mjs', 'layer.mjs', 'proto.mjs'])
/** the extension's style sheets the page is drawn with: its tokens (both themes) and its shared controls */
const STYLES = resolve(REPO, 'src/styles')
const STYLE_FILES = new Set(['tokens.css', 'controls.css'])
const FIXTURE_FILES = ['arxiv.pdf', 'layout.json', 'units.json', 'final.pdf', 'final.json', 'refusal.json', 'record.json']
/** where each of a fixture's files is looked for, in order: the translation in the records first, a final in the finals
 *  where the fixtures have none */
const SOURCES = { 'arxiv.pdf': [FIXTURES], 'layout.json': [FIXTURES], 'refusal.json': [FIXTURES], 'units.json': [RECORDS, FIXTURES], 'record.json': [RECORDS, FIXTURES], 'final.pdf': [FIXTURES, FINALS], 'final.json': [FIXTURES, FINALS] }
/** the engine the v0 view runs: this worktree's own, or LAYER_PROTO's */
const PROTO_ROOT = resolve(process.env.LAYER_PROTO ?? REPO)
const PROTO = join(PROTO_ROOT, 'src/pdf-reader/engine')
const TEXMF = process.env.TEXMF_DIST ?? join(process.env.HOME ?? '', 'Library/TinyTeX/texmf-dist')
/** the add-ons: the gate's cache, read only, and the lab's own */
const GATE_ADDONS = resolve(process.env.LAYER_ADDONS ?? join(root, 'out/layer-gate/removal'))
const LAB_ADDONS = resolve(root, 'out/layer-lab/addon')
/** v0's hyphenation patterns, read from TeX's files by v0's own reading (layer-proto/hyph.mjs) */
const HYPH = new Map()
{
  const { patternsOfTex, TEX_PATTERN_FILES } = await import(pathToFileURL(join(PROTO, 'layer-proto/hyph.mjs')).href)
  for (const [lang, rel] of Object.entries(TEX_PATTERN_FILES)) if (existsSync(join(TEXMF, rel))) HYPH.set(lang, JSON.stringify(patternsOfTex(readFileSync(join(TEXMF, rel), 'latin1'))))
}
/** v0's geometry of a fixture's paper: its target's own, else another target's, from the gate's own folder of them
 *  (layer-gate/ref.mjs: LAYER_GEOMETRY or its default); null for a name that is no fixture's */
const geometryOf = name => { try { return geometryFile(name) } catch { return null } }
/** the web's current-set route by environment (an http or https URL; any other value is ignored with a word) */
const publishedUrl = name => {
  const v = process.env[name]
  if (!v) return null
  try { if (/^https?:$/.test(new URL(v).protocol)) return v } catch {}
  console.warn(`layer lab: ${name} is not an http(s) URL, ignored`)
  return null
}
const PUBLISHED = { staging: publishedUrl('LAYER_RULES_STAGING'), production: publishedUrl('LAYER_RULES_PRODUCTION') }
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.pdf': 'application/pdf', '.otf': 'font/otf', '.ttf': 'font/ttf', '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.icc': 'application/octet-stream', '.map': 'application/json',
}

/** a path under a folder, or null for one that leaves it */
function under(dir, rel) {
  const file = resolve(dir, normalize(rel).replace(/^([/\\])+/, ''))
  return file === dir || file.startsWith(dir + sep) ? file : null
}
/** a fixture's file where it is found first, or null */
const fileOf = (name, file) => (SOURCES[file] ?? []).filter(Boolean).map(d => under(d, join(name, file))).find(f => f && existsSync(f)) ?? null
const git = (dir, args) => { try { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return null } }
const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null } }
const sha = b => createHash('sha256').update(b).digest('hex')

// ---- the paper's add-on
/** the remover's files, digested as the gate digests them (layer-gate.mjs removerDigest) */
const removerDigest = () => sha(['layout/remove.mjs', 'layout/ink.mjs', 'layout/file.mjs', 'layout/addon-manifest.mjs', 'layout/addon.mjs', 'layer-proto/removal.mjs'].map(f => readFileSync(join(PROTO, f))).join('\n')).slice(0, 16)
/** where a key's add-on is kept, the gate's first: { dir, from }, or null */
const keptAddon = key => [[join(GATE_ADDONS, key), 'the gate'], [join(LAB_ADDONS, key), 'the lab']].map(([dir, from]) => ({ dir, from })).find(({ dir }) => ['shipped.pdf', 'shipped-manifest.json', 'done.json'].every(f => existsSync(join(dir, f)))) ?? null
/** the remover's inflate: no more than `limit` + 1 bytes out, or a throw (its contract, layout/remove.mjs); a stream with no zlib header read raw */
const inflateTolerant = (b, limit = Infinity) => {
  const o = { finishFlush: Z.Z_SYNC_FLUSH, ...(Number.isFinite(limit) ? { maxOutputLength: limit + 1 } : {}) }
  try { return new Uint8Array(inflateSync(b, o)) } catch (e) { if (e?.code === 'ERR_BUFFER_TOO_LARGE') throw e; return new Uint8Array(inflateRawSync(b.subarray(2), o)) }
}
const ADDON_RUNS = new Map()
/** a fixture's add-on: { key, from, manifest, done }, made once where none is kept */
async function addonOf(name) {
  const pdfFile = fileOf(name, 'arxiv.pdf'), layoutFile = fileOf(name, 'layout.json')
  if (!pdfFile || !layoutFile) throw new Error(`${name}: no arXiv PDF or layout file`)
  const bytes = new Uint8Array(readFileSync(pdfFile))
  const key = sha([sha(bytes), sha(readFileSync(layoutFile)), removerDigest()].join('|')).slice(0, 24)
  let kept = keptAddon(key)
  if (!kept) {
    if (!ADDON_RUNS.has(key)) ADDON_RUNS.set(key, makeAddon(key, bytes, layoutFile).finally(() => ADDON_RUNS.delete(key)))
    await ADDON_RUNS.get(key)
    kept = keptAddon(key)
  }
  return { key, from: kept.from, manifest: readJson(join(kept.dir, 'shipped-manifest.json')), done: readJson(join(kept.dir, 'done.json')) }
}
/**
 * The add-on a reader is sent, made as the server makes it: the engine's paperAddon (layout/addon.mjs) over PDF.js's
 * reading of arXiv's PDF, the gate's shipped half (layer-gate.mjs buildAddon with check false) and nothing of its check.
 * A paper the maker refuses has no add-on here, as none is shipped for it
 */
async function makeAddon(key, bytes, layoutFile) {
  const t0 = performance.now()
  const E = f => import(pathToFileURL(join(PROTO, f)).href)
  const [{ paperAddon }, { indexLayout, parseLayout }] = await Promise.all([E('layout/addon.mjs'), E('layout/file.mjs')])
  const PL = await import('@cantoo/pdf-lib')
  const { OPS, getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await getDocument({ data: bytes.slice(), verbosity: 0, cMapUrl: `${PDFJS}/cmaps/`, cMapPacked: true, standardFontDataUrl: `${PDFJS}/standard_fonts/`, useSystemFonts: false }).promise
  try {
    const index = indexLayout(parseLayout(new Uint8Array(readFileSync(layoutFile))))
    const made = await paperAddon({ bytes, index, doc, OPS, PL, deflate: b => new Uint8Array(deflateSync(b)), inflate: inflateTolerant })
    if (!made.ok) throw new Error(`the add-on was refused: ${made.refused}`)
    const whole = new Uint8Array(bytes.length + made.tail.length)
    whole.set(bytes)
    whole.set(made.tail, bytes.length)
    const dir = join(LAB_ADDONS, key)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'shipped.pdf'), whole)
    writeFileSync(join(dir, 'shipped-manifest.json'), JSON.stringify(made.manifest))
    writeFileSync(join(dir, 'done.json'), JSON.stringify({ pages: doc.numPages, planned: Object.keys(made.manifest.page).length, appended: made.tail.length, checked: false, ms: Math.round(performance.now() - t0) }))
  } finally { await doc.loadingTask.destroy() }
}

/** a paper's title, the source of the unit its record marks as the title (null without one), read once a record file */
const TITLES = new Map()
function titleOf(name) {
  const file = fileOf(name, 'record.json')
  if (!file) return null
  const key = `${file}:${statSync(file).mtimeMs}`
  if (!TITLES.has(key)) TITLES.set(key, readJson(file)?.units?.find(u => u.title)?.src?.replace(/\s+/g, ' ').trim() || null)
  return TITLES.get(key)
}

/** every fixture: its paper, title and target, the files it has, where its translation came from, and its final's
 *  summary */
function fixtures() {
  if (!existsSync(FIXTURES)) return []
  return readdirSync(FIXTURES).filter(name => /^[A-Za-z0-9._-]+v\d+-[A-Za-z-]+$/.test(name) && statSync(join(FIXTURES, name)).isDirectory() && fileOf(name, 'units.json')).sort().map(name => {
    const units = readJson(fileOf(name, 'units.json')), finalFile = fileOf(name, 'final.json'), final = finalFile ? readJson(finalFile) : null
    const [, paper, version, target] = /^(.+)v(\d+)-([A-Za-z-]+)$/.exec(name)
    return {
      name, paper, version: Number(version), target, title: titleOf(name),
      files: FIXTURE_FILES.filter(f => fileOf(name, f)), geometry: !!geometryOf(name),
      translation: units ? { source: units.source, pipeline: units.pipeline ?? null, units: units.units?.length ?? 0, sentences: units.units?.filter(u => u.sentences?.length).length ?? 0, states: units.states ?? null, engine: units.engine ?? null, made: units.made ?? null, from: units.from ?? null } : null,
      final: final ? { from: finalFile.startsWith(FIXTURES + sep) ? 'fixtures' : 'finals', strategy: final.strategy, typeset: final.typeset, ok: final.ok, error: final.error ?? final.timeline?.filter(t => t[1] === 'final').at(-1)?.[2]?.error ?? null, engine: final.engine, image: final.image, faces: final.faces, settled: final.result?.settled ?? null, inSource: final.result?.inSource ?? null, ms: final.ms, made: final.made } : null,
    }
  })
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(body)
}
function sendFile(res, file, cache = 'no-store') {
  if (!file || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, 'not found')
  res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': statSync(file).size, 'cache-control': cache, 'x-content-type-options': 'nosniff' })
  createReadStream(file).pipe(res)
}
const rel = dir => (dir?.startsWith(REPO + sep) ? dir.slice(REPO.length + 1) : dir)
const info = () => ({
  commit: git(REPO, ['rev-parse', 'HEAD']), branch: git(REPO, ['rev-parse', '--abbrev-ref', 'HEAD']), subject: git(REPO, ['log', '-1', '--format=%s']), entry: ENTRY ? 'stand-in' : 'engine',
  proto: { root: PROTO_ROOT === REPO ? 'this worktree' : PROTO_ROOT, commit: git(PROTO_ROOT, ['rev-parse', 'HEAD']), dirty: !!git(PROTO_ROOT, ['status', '--porcelain', '--untracked-files=no', '--', 'src/pdf-reader/engine']), remover: removerDigest() },
  inputs: { fixtures: rel(FIXTURES), records: rel(RECORDS), geometry: rel(PROTO_GEOMETRY), finals: rel(FINALS) },
  rules: { path: RULES_PATH, staging: !!PUBLISHED.staging, production: !!PUBLISHED.production },
})

const rulesApi = createRulesApi({ root: REPO, origin: () => `http://127.0.0.1:${server.address().port}`, rules: await import(pathToFileURL(join(ENGINE, 'rules/layout.mjs')).href), published: PUBLISHED })
const server = createServer((req, res) => {
  // before anything is read or written: a request that names another host reached this server through a rebound name
  if (!isOwnHost(req.headers.host, server.address().port)) return send(res, 403, 'forbidden')
  let path
  try { path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname) } catch { return send(res, 400, 'bad path') }
  // the rules routes: a save is the one POST the lab takes
  if (path === '/api/rules' || path === '/api/rules/published') {
    rulesApi.handle(req, res).then(handled => { if (!handled) send(res, 404, 'not found') }, e => send(res, 500, String(e?.stack ?? e).slice(0, 2000)))
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'GET only')
  // the paper's add-on: its manifest (made first where none is kept), and the document a reader opens
  const ad = /^\/api\/addon\/([A-Za-z0-9._-]+)$/.exec(path)
  if (ad) {
    addonOf(ad[1]).then(a => send(res, 200, JSON.stringify(a), TYPES['.json']), e => send(res, 500, String(e?.stack ?? e).slice(0, 2000)))
    return
  }
  const af = /^\/addon\/([0-9a-f]{24})\.pdf$/.exec(path)
  if (af) { const kept = keptAddon(af[1]); return sendFile(res, kept ? join(kept.dir, 'shipped.pdf') : null) }
  if (path === '/') return sendFile(res, join(here, 'index.html'))
  if (path.startsWith('/lab/')) { const name = path.slice(5); return sendFile(res, PAGE_FILES.has(name) ? join(here, name) : null) }
  if (path.startsWith('/styles/')) { const name = path.slice(8); return sendFile(res, STYLE_FILES.has(name) ? join(STYLES, name) : null) }
  if (path === '/api/fixtures') return send(res, 200, JSON.stringify(fixtures()), TYPES['.json'])
  if (path === '/api/info') return send(res, 200, JSON.stringify(info()), TYPES['.json'])
  if (path.startsWith('/proto-engine/')) { const r = path.slice('/proto-engine/'.length); return sendFile(res, /\.(m?js|json)$/.test(r) ? under(PROTO, r) : null) }
  if (path.startsWith('/proto-fonts/')) { const name = path.slice('/proto-fonts/'.length); return sendFile(res, /^lm(?:roman|sans|mono)10-[a-z]+\.otf$/.test(name) ? join(TEXMF, 'fonts/opentype/public/lm', name) : null, 'max-age=3600') }
  if (path.startsWith('/hyph/')) { const lang = /^\/hyph\/([a-z]+)\.json$/.exec(path)?.[1]; return HYPH.has(lang) ? send(res, 200, HYPH.get(lang), TYPES['.json']) : send(res, 404, 'not found') }
  if (path.startsWith('/src/pdf-reader/engine/')) {
    const r = path.slice('/src/pdf-reader/engine/'.length)
    if (ENTRY && r === 'layer/layer.mjs') return sendFile(res, ENTRY)
    return sendFile(res, /\.(m?js|json)$/.test(r) ? under(ENGINE, r) : null)
  }
  if (path.startsWith('/zod/')) return sendFile(res, /^\/zod\/(?:mini|v4)\/[\w./-]+\.js$/.test(path) ? under(ZOD, path.slice('/zod/'.length)) : null, 'max-age=3600')
  if (path.startsWith('/pdfjs/')) {
    const r = path.slice('/pdfjs/'.length)
    return sendFile(res, /^(build|cmaps|standard_fonts|wasm|iccs)\//.test(r) ? under(PDFJS, r) : null, 'max-age=3600')
  }
  if (path.startsWith('/fonts/')) {
    const name = path.slice('/fonts/'.length)
    return sendFile(res, /^[A-Za-z0-9._-]+\.(otf|ttf)$/.test(name) ? under(FONTS, name) : null, 'max-age=3600')
  }
  if (path.startsWith('/fixtures/')) {
    const [dir, file, ...rest] = path.slice('/fixtures/'.length).split('/')
    if (rest.length || !/^[A-Za-z0-9._-]+$/.test(dir ?? '')) return send(res, 404, 'not found')
    if (file === 'geometry.json') return sendFile(res, geometryOf(dir))
    return sendFile(res, FIXTURE_FILES.includes(file) ? fileOf(dir, file) : null)
  }
  send(res, 404, 'not found')
})
server.listen(PORT, '127.0.0.1', () => {
  const n = fixtures().length, i = info()
  console.log(`layer lab: http://127.0.0.1:${PORT}/  (${n} fixture${n === 1 ? '' : 's'}; v0's engine ${i.proto.root} at ${i.proto.commit?.slice(0, 8)}${i.proto.dirty ? '+' : ''}, remover ${i.proto.remover}; ${JSON.stringify(i.inputs)}${ENTRY ? `; layer entry: ${ENTRY}` : ''})`)
})
