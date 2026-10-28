// lab/pdf/layer-lab/serve.mjs
// The layer lab: a local bench for the instant layer, which draws a paper's translation straight into the original's
// layout. Pick a paper and a language; show any two of Original (arXiv's PDF), the quick view (the instant layer as the
// engine draws it: layer-lab/proto.mjs) and Final (a compiled translation already made beside the fixture, which the lab
// only reads: nothing here compiles) side by side, pages in step (an old link's `layer` still opens the retired early
// engine, layer-lab/layer.mjs); set the quick view's choices, and edit, save and load the layout rule set; keep notes. A
// static server on 127.0.0.1 with the rules routes (rules-api.mjs) and nothing else: the page (page-files.mjs lists its files) and the
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
// The page the layer is drawn over: the fixture's base page (base.pdf, our final pass; arXiv's PDF where there is none) wrapped
// by optional content as the maker child wraps it (docs/PDF-READER.md §19.9; layer-gate/wrap.mjs, the gate's own: its cache,
// out/layer-gate/wrap/<key>/, the gate's and the lab's alike), the paper's source units from data/layout/<id>/source.gz or
// data/corpus/<id>/source.gz (LAYER_SOURCES another folder of the same shape), and its head fields (what the wrap could not
// hide, the cell rules): GET /api/wrap/<fixture> (made first where none is kept), GET /wrap/<key>.pdf. A page with no source
// or whose wrap is refused (arXiv's PDF has no marks) is served unwrapped: every unit the original's.
import { execFileSync } from 'node:child_process'
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { geometryFile, PROTO_GEOMETRY } from '../spikes/layer-gate/ref.mjs'
import { wrapOf } from '../spikes/layer-gate/wrap.mjs'
import { isOwnHost } from './own-host.mjs'
import { PAGE_FILES, unservedImports } from './page-files.mjs'
import { createRulesApi, RULES_PATH } from './rules-api.mjs'

const here = new URL('.', import.meta.url).pathname
// (a module the page imports that is not served leaves the lab without its script: refused here, not found by opening it)
{
  const missing = unservedImports(here)
  if (missing.length) throw new Error(`layer lab: not served at /lab/ (page-files.mjs): ${missing.join(', ')}`)
}
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
/** the extension's style sheets the page is drawn with: its tokens (both themes) and its shared controls */
const STYLES = resolve(REPO, 'src/styles')
const STYLE_FILES = new Set(['tokens.css', 'controls.css'])
const FIXTURE_FILES = ['arxiv.pdf', 'base.pdf', 'layout.json', 'units.json', 'final.pdf', 'final.json', 'refusal.json', 'record.json']
/** where each of a fixture's files is looked for, in order: the translation in the records first, a final in the finals
 *  where the fixtures have none */
const SOURCES = { 'arxiv.pdf': [FIXTURES], 'base.pdf': [FIXTURES], 'layout.json': [FIXTURES], 'refusal.json': [FIXTURES], 'units.json': [RECORDS, FIXTURES], 'record.json': [RECORDS, FIXTURES], 'final.pdf': [FIXTURES, FINALS], 'final.json': [FIXTURES, FINALS] }
/** the engine the v0 view runs: this worktree's own, or LAYER_PROTO's */
const PROTO_ROOT = resolve(process.env.LAYER_PROTO ?? REPO)
const PROTO = join(PROTO_ROOT, 'src/pdf-reader/engine')
const TEXMF = process.env.TEXMF_DIST ?? join(process.env.HOME ?? '', 'Library/TinyTeX/texmf-dist')
/** the wrapped pages: the gate's cache, which the lab shares; the papers' sources the wrap reads */
const WRAP_CACHE = resolve(root, 'out/layer-gate/wrap')
const PAPER_SOURCES = [process.env.LAYER_SOURCES ? resolve(process.env.LAYER_SOURCES) : null, join(DATA, 'layout'), join(DATA, 'corpus')].filter(Boolean)
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

// ---- the page the layer is drawn over
const WRAP_RUNS = new Map(), WRAPPED = new Map()
/** a fixture's wrapped page: { key, head } (head: wrapped or why not, unhidden, labelKept, stats, rules), made once where none is kept */
async function wrapOfFixture(name) {
  const pdfFile = fileOf(name, 'base.pdf') ?? fileOf(name, 'arxiv.pdf'), layoutFile = fileOf(name, 'layout.json')
  if (!pdfFile || !layoutFile) throw new Error(`${name}: no base page or layout file`)
  const paper = name.replace(/-[A-Za-z-]+$/, '')
  const source = PAPER_SOURCES.map(d => join(d, paper, 'source.gz')).find(f => existsSync(f)) ?? null
  const w = await wrapOf({ engine: PROTO_ROOT, out: WRAP_CACHE, base: pdfFile, layoutFile, source, runs: WRAP_RUNS })
  WRAPPED.set(w.key, w.file)
  return { key: w.key, head: w.head }
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
  proto: { root: PROTO_ROOT === REPO ? 'this worktree' : PROTO_ROOT, commit: git(PROTO_ROOT, ['rev-parse', 'HEAD']), dirty: !!git(PROTO_ROOT, ['status', '--porcelain', '--untracked-files=no', '--', 'src/pdf-reader/engine']) },
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
  // the page the layer is drawn over: its head fields (wrapped first where none is kept), and the document a reader opens
  const wr = /^\/api\/wrap\/([A-Za-z0-9._-]+)$/.exec(path)
  if (wr) {
    wrapOfFixture(wr[1]).then(w => send(res, 200, JSON.stringify(w), TYPES['.json']), e => send(res, 500, String(e?.stack ?? e).slice(0, 2000)))
    return
  }
  const wf = /^\/wrap\/([0-9a-f]{24})\.pdf$/.exec(path)
  if (wf) return sendFile(res, WRAPPED.get(wf[1]) ?? null)
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
    // (and the engine's view sheet, view/engine.css, which the quick view is drawn with as the readers draw it)
    return sendFile(res, /\.(m?js|json)$/.test(r) || r === 'view/engine.css' ? under(ENGINE, r) : null)
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
  console.log(`layer lab: http://127.0.0.1:${PORT}/  (${n} fixture${n === 1 ? '' : 's'}; v0's engine ${i.proto.root} at ${i.proto.commit?.slice(0, 8)}${i.proto.dirty ? '+' : ''}; ${JSON.stringify(i.inputs)}${ENTRY ? `; layer entry: ${ENTRY}` : ''})`)
})
