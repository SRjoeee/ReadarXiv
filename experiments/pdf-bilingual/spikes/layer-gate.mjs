// experiments/pdf-bilingual/spikes/layer-gate.mjs
// The instant layer's gate over the recorded fixtures (Plan 8b, Task 12), widened by the maintainer's rule: the layer is
// measured against arXiv's original page, never against a rule, and no change may move it further from it. One gate, two
// jobs, two tiers:
//   - the completeness checks of spec §5 (layer/check.mjs): no lost ink (regions of more than 4 device pixels at 2x), no
//     placeholder missing or drawn twice, no doubled bracket or duplication the layer made, every equation number shown
//     once, no clipped character;
//   - the fidelity measures against the original (the parity report, 2026-10-06, §6): the original's text area translated,
//     English or blank, table cells translated, units left English and why, fill and blank lines per frame, pitch spread
//     and full size, overlap and stray text, residue and erase bites, vanished math and crops carrying another line, wrong
//     page text and clipped characters.
// --tier=model (the default; seconds, every commit) lays every page and measures what needs no pixels; --tier=pixel
// (minutes, every merge) also draws each page and measures its planes: O, the original rendered by PDF.js at 2.5 device
// pixels a PDF unit (CSS 1.25 x dpr 2, the prototype's floor's scale); C, the copy erased and cropped before the text; T, the
// text alone, an element screenshot of the page's SVG; and lost ink at 2x.
//
// Fixed inputs: the layer lab's 29 fixtures (each arXiv's PDF and its translation, arxiv.pdf and units.json, which
// spikes/layer-fixtures.mjs made; the layout files are the engine's own, --layouts), a frozen reference text area per
// fixture (ref.json beside them: layer-gate/ref.mjs, made once with --freeze), the prototype's renders of the pages it
// shows beside the engine's (<fixture>/proto/p<n>.png, the parity run's of the approved prototype), the role
// table's served faces (data/fonts), Playwright's pinned Chromium, PDF.js from this repository's node_modules, and no
// network: a static server on 127.0.0.1 serves every file, and the browser aborts any other request. Pages: the first 12
// of each output, every page of the thesis (2307.16209v1).
//
//   pnpm exec tsx experiments/pdf-bilingual/spikes/layer-gate.mjs [--tier=model|pixel] [--engine=<worktree>] [--only=<fixture>,…]
//       [--layouts=made|fixed] [--fixtures=<dir>] [--pages=<n>] [--workers=<n>] [--check[=<record>]] [--record[=<record>]] [--label=<short>]
//       [--composite=source-over|darken] [--no-progress] [--freeze[=force]]
//   --engine     the engine measured: <worktree>/src/pdf-reader/engine served as /engine/ (the checker, layer/check.mjs, is
//                always this repository's: the instrument is the same for every branch); default this repository
//   --layouts    made (the default): the layout files the engine's own maker makes from the fixtures' papers (spikes/
//                layer-fixtures.mjs --engine --offline, cached by the engine's files in out/layer-gate/fixtures/), so that
//                a change of the maker is measured end to end; fixed: the fixtures' own, as they were made for the lab
//   --fixtures   (or LAYER_FIXTURES) the fixtures' layout.json, units.json and arxiv.pdf from another folder of the same
//                layout (the web's web/e2e/.fixtures/); the references stay data/layer-fixtures' (LAYER_REFS another)
//   --check      the merge rule against the last record (default <engine>/experiments/pdf-bilingual/records/
//                layer-fidelity.json, else this repository's): no measure worse on any fixture (shares by more than 0.2
//                points, ratios by 0.02, unit counts at all, defects as rates per 1,000 translated text cells at all);
//                every page whose measures moved listed; exit 1 on any regression, or where the inputs are not the record's
//   --record     the run as the record: layer-fidelity.json (per fixture and page, the totals, the prototype's floor) and
//                layer-fidelity.md beside it, and the brief's layer-gate.json and .md (the completeness by output); a whole
//                run only (no --only, no --pages)
//   --label      the progress folder's name (pixel tier): /Users/cheongzhiyan/Downloads/readarxiv-test/layer-progress/<NN>-<label>/
//                (LAYER_PROGRESS names another), with four-panel images (original | prototype | this run | the previous
//                recorded run), metrics.md and index.html; default the engine's branch
//   --composite  how crops are drawn on the copy: source-over (the lab's, as Plan 8d draws today) or darken
//   --freeze     the reference text area of every fixture that has none (=force: made again, a deliberate change)
// Exits 1 on any completeness failure (the brief's gate), on a regression under --check, or where
// a fixture could not be run.
import { execFileSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { availableParallelism } from 'node:os'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { chromium } from 'playwright'
import { encodePng } from './layer-gate/png.mjs'
import { nameOf, refBytesOf, refPages, sha256 } from './layer-gate/ref.mjs'
import { compare, fixtureTotals, MEASURES, pageEntry, pooled, REPORTED } from './layer-gate/score.mjs'

const here = new URL('.', import.meta.url).pathname
const ROOT = resolve(here, '..')
const REPO = resolve(ROOT, '../..')
const DATA = process.env.AXT_DATA ?? join(ROOT, 'data')
const arg = name => { const a = process.argv.find(x => x === `--${name}` || x.startsWith(`--${name}=`)); return a === undefined ? null : a.includes('=') ? a.slice(name.length + 3) : true }
const TIER = arg('tier') ?? 'model'
if (TIER !== 'model' && TIER !== 'pixel') throw new Error(`--tier=${TIER}: model or pixel`)
const ENGINE = resolve(typeof arg('engine') === 'string' ? arg('engine') : REPO)
const REFS = resolve(process.env.LAYER_REFS ?? join(DATA, 'layer-fixtures'))
/** whose layout files the layer is given: the engine's own maker's (made), or the fixtures' as they were made (fixed) */
const GIVEN = typeof arg('fixtures') === 'string' ? arg('fixtures') : process.env.LAYER_FIXTURES ?? null
/** an engine before Task 6 has no layout maker: its layer is given the fixtures' own layout files */
const HAS_MAKER = existsSync(join(ENGINE, 'src/pdf-reader/engine/layout/make.mjs'))
const LAYOUTS = GIVEN ? 'given' : arg('layouts') ?? (HAS_MAKER ? 'made' : 'fixed')
if (!GIVEN && !arg('layouts') && !HAS_MAKER) console.log('the engine has no layout maker (layout/make.mjs): its layer is given the fixtures\' own layout files (--layouts=fixed)')
/** the record's entry this run is: its tier, and the layout files it was given where they are not the engine's own */
const KEY = LAYOUTS === 'made' ? TIER : `${TIER}-${LAYOUTS}`
if (!['made', 'fixed', 'given'].includes(LAYOUTS)) throw new Error(`--layouts=${LAYOUTS}: made or fixed`)
const MAKER = join(here, 'layer-fixtures.mjs')
const FONTS = resolve(join(DATA, 'fonts'))
const PDFJS = resolve(REPO, 'node_modules/pdfjs-dist')
const GATE = join(here, 'layer-gate')
const CHECKER = join(REPO, 'src/pdf-reader/engine/layer/check.mjs')
const PROGRESS = process.env.LAYER_PROGRESS ?? '/Users/cheongzhiyan/Downloads/readarxiv-test/layer-progress'
const ONLY = typeof arg('only') === 'string' ? arg('only').split(',').filter(Boolean) : null
const PAGES = typeof arg('pages') === 'string' ? Number(arg('pages')) : null
const WORKERS = typeof arg('workers') === 'string' ? Number(arg('workers')) : Math.max(1, Math.min(6, Math.floor(availableParallelism() / 2)))
const COMPOSITE = arg('composite') ?? 'source-over'
if (!['source-over', 'darken'].includes(COMPOSITE)) throw new Error(`--composite=${COMPOSITE}: source-over or darken`)
const FREEZE = arg('freeze')
/** --debug-lost=<fixture>:<page>: that page's lost-ink regions written as images (out/layer-gate/lost/) */
const DEBUG_LOST = arg('debug-lost')
/** the brief's exact values: 12 pages an output, every page of the thesis */
const PAGES_OF = 12, ALL_PAGES = new Set(['2307.16209v1'])
/** the progress images' pages (the controller's set) and their width */
const PANELS = { '1512.03385v1-zh': [1, 2, 3], '1706.03762v7-ja': [1, 2], '2608.04322v1-de': [2], '1810.04805v2-ru': [2], '2307.16209v1-zh': [10] }
const PROGRESS_WIDTH = Number(arg('progress-width') ?? 1400), GAP = 8

const git = (dir, args) => { try { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return null } }
const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
const fileSha = file => sha256(readFileSync(file))
const recordDir = dir => join(dir, 'experiments/pdf-bilingual/records')

// ---------------------------------------------------------------- the fixtures and their references
const FIXTURES = LAYOUTS === 'given' ? resolve(GIVEN) : LAYOUTS === 'fixed' || FREEZE ? REFS : madeFixtures()
const fixtures = readdirSync(FIXTURES).filter(n => /^[A-Za-z0-9._-]+v\d+-[A-Za-z-]+$/.test(n) && existsSync(join(FIXTURES, n, 'units.json'))).sort()
for (const n of fixtures) if (!existsSync(join(FIXTURES, n, 'layout.json'))) console.log(`FAIL ${n}: no layout file (${existsSync(join(FIXTURES, n, 'refusal.json')) ? `refused: ${readJson(join(FIXTURES, n, 'refusal.json')).refused}` : 'none made'})`)
if (FREEZE) {
  let made = 0
  for (const name of readdirSync(REFS).filter(n => existsSync(join(REFS, n, 'layout.json'))).sort()) {
    const file = join(REFS, name, 'ref.json')
    if (existsSync(file) && FREEZE !== 'force') continue
    writeFileSync(file, refBytesOf(join(REFS, name), name))
    made++
    console.log(`ref  ${name}: ${fileSha(file).slice(0, 12)}`)
  }
  console.log(`${made} reference${made === 1 ? '' : 's'} made`)
  process.exit(0)
}
const asked = ONLY ? fixtures.filter(n => ONLY.includes(n)) : fixtures
if (ONLY && asked.length !== ONLY.length) throw new Error(`--only: no fixture ${ONLY.filter(n => !fixtures.includes(n)).join(', ')} in ${FIXTURES}`)
for (const name of asked) if (!existsSync(join(REFS, name, 'ref.json'))) throw new Error(`${name}: no frozen reference (${join(REFS, name, 'ref.json')}): run --freeze once`)

// ---------------------------------------------------------------- the server: every file the page asks for, from disk
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf', '.otf': 'font/otf', '.ttf': 'font/ttf', '.png': 'image/png', '.wasm': 'application/wasm', '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.icc': 'application/octet-stream',
}
const under = (dir, rel) => { const f = resolve(dir, normalize(rel).replace(/^([/\\])+/, '')); return f === dir || f.startsWith(dir + sep) ? f : null }
function fileFor(path) {
  if (path.startsWith('/gate/')) return ['page.html', 'page.mjs', 'measure.mjs'].includes(path.slice(6)) ? join(GATE, path.slice(6)) : null
  if (path === '/engine/layer/check.mjs') return CHECKER
  if (path.startsWith('/engine/')) return /\.(m?js|json)$/.test(path) ? under(join(ENGINE, 'src/pdf-reader/engine'), path.slice(8)) : null
  if (path.startsWith('/pdfjs/')) return /^\/pdfjs\/(build|cmaps|standard_fonts|wasm|iccs)\//.test(path) ? under(PDFJS, path.slice(7)) : null
  if (path.startsWith('/fonts/')) return /^\/fonts\/[A-Za-z0-9._-]+\.(otf|ttf)$/.test(path) ? under(FONTS, path.slice(7)) : null
  if (path.startsWith('/fixtures/')) {
    const [dir, file, ...rest] = path.slice(10).split('/')
    return !rest.length && fixtures.includes(dir) && ['arxiv.pdf', 'layout.json', 'units.json'].includes(file) ? join(FIXTURES, dir, file) : null
  }
  if (path.startsWith('/proto/')) { const m = /^\/proto\/([A-Za-z0-9._-]+)\/p(\d+)\.png$/.exec(path); return m && fixtures.includes(m[1]) ? join(REFS, m[1], 'proto', `p${m[2]}.png`) : null }
  if (path.startsWith('/progress/')) { const m = /^\/progress\/([0-9]{2}-[a-z0-9-]+)\/engine\/([A-Za-z0-9._-]+\.png)$/.exec(path); return m ? join(PROGRESS, m[1], 'engine', m[2]) : null }
  return null
}
const server = createServer((req, res) => {
  let path
  try { path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname) } catch { res.writeHead(400); return res.end() }
  const file = fileFor(path)
  if (!file || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found') }
  res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' })
  createReadStream(file).pipe(res)
})
await new Promise(ok => server.listen(0, '127.0.0.1', ok))
const ORIGIN = `http://127.0.0.1:${server.address().port}`

// ---------------------------------------------------------------- the run
const engineInfo = {
  root: ENGINE === REPO ? '.' : ENGINE, commit: git(ENGINE, ['rev-parse', 'HEAD']), branch: git(ENGINE, ['rev-parse', '--abbrev-ref', 'HEAD']),
  dirty: !!git(ENGINE, ['status', '--porcelain', '--untracked-files=no', '--', 'src/pdf-reader/engine']),
}
const fontsDigest = sha256(readdirSync(FONTS).sort().map(f => `${f}:${statSync(join(FONTS, f)).size}`).join('\n'))
const browser = await chromium.launch()
const inputs = {
  tier: TIER, pages: PAGES ? `the first ${PAGES}` : `the first ${PAGES_OF} of each output, every page of ${[...ALL_PAGES].join(', ')}`, scale: 2.5, inkScale: 2, inkMin: 4, composite: COMPOSITE,
  layouts: LAYOUTS, fixtures: FIXTURES === REFS ? 'data/layer-fixtures' : FIXTURES.startsWith(ROOT) ? FIXTURES.slice(ROOT.length + 1) : FIXTURES, chromium: browser.version(),
  pdfjs: readJson(join(PDFJS, 'package.json')).version, fonts: fontsDigest.slice(0, 16), checker: fileSha(CHECKER).slice(0, 16),
  measures: sha256(['measure.mjs', 'score.mjs'].map(f => readFileSync(join(GATE, f))).join('\n')).slice(0, 16),
}
const leaks = []
const t0 = Date.now()
const results = new Map()
const failures = []
const queue = asked.slice().sort((a, b) => (ALL_PAGES.has(nameOf(b).paper) ? 1 : 0) - (ALL_PAGES.has(nameOf(a).paper) ? 1 : 0) || a.localeCompare(b))
const progress = TIER === 'pixel' && !arg('no-progress') ? openProgress() : null

async function worker() {
  const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1600, height: 1200 } })
  await ctx.route('**/*', route => (route.request().url().startsWith(`${ORIGIN}/`) ? route.continue() : (leaks.push(route.request().url()), route.abort())))
  const page = await ctx.newPage()
  page.setDefaultTimeout(600_000)
  const errors = []
  page.on('pageerror', e => errors.push(String(e?.message ?? e)))
  try {
    for (let name; (name = queue.shift()); ) {
      const tf = Date.now()
      try { results.set(name, await runFixture(page, name, errors)) } catch (e) { failures.push(name); console.log(`FAIL ${name}: ${String(e?.stack ?? e).slice(0, 400)}`) }
      const r = results.get(name)
      if (r) console.log(`${r.ready ? 'ok  ' : 'FAIL'} ${name}: ${r.ready ? `${r.pages.length} pages, ${r.totals.textDrawn}/${r.totals.textOn} text units drawn` : r.why} (${((Date.now() - tf) / 1000).toFixed(1)} s)`)
    }
  } finally { await ctx.close() }
}

async function runFixture(page, name, errors) {
  const { paper, target } = nameOf(name)
  const refFile = join(REFS, name, 'ref.json')
  const ref = readJson(refFile)
  await page.goto(`${ORIGIN}/gate/page.html`)
  await page.waitForFunction(() => window.gateReady === true)
  const info = await page.evaluate(o => window.gate.open(o), { name, target, ref: refPages(ref), composite: COMPOSITE })
  const meta = { ref: fileSha(refFile).slice(0, 16), layout: fileSha(join(FIXTURES, name, 'layout.json')).slice(0, 16), units: fileSha(join(FIXTURES, name, 'units.json')).slice(0, 16) }
  if (!info.ready) { failures.push(name); return { name, ready: false, why: info.why, meta } }
  const n = Math.min(info.pages, PAGES ?? (ALL_PAGES.has(paper) ? info.pages : PAGES_OF))
  const pages = [], frames = []
  for (let p = 1; p <= n; p++) {
    const model = await page.evaluate(([p, pixel]) => window.gate.page(p, { pixel }), [p, TIER === 'pixel'])
    let pixel = null
    if (TIER === 'pixel') {
      const shot = await page.locator('#text').screenshot({ type: 'png' })
      pixel = await page.evaluate(b64 => window.gate.analyse(b64), shot.toString('base64'))
      if (progress && PANELS[name]?.includes(p)) await progress.panel(page, name, p)
      if (DEBUG_LOST === `${name}:${p}`) {
        const looks = await page.evaluate(() => window.gate.lostLook())
        const dir = join(ROOT, 'out/layer-gate/lost')
        mkdirSync(dir, { recursive: true })
        looks.forEach((l, i) => writeFileSync(join(dir, `${name}-p${p}-${i}.png`), encodePng(Buffer.from(l.rgba, 'base64'), l.w, l.h)))
        console.log(`lost ink of ${name} p${p}: ${looks.length} regions in ${dir} (each the original above the copy, the accounted area tinted)`)
      }
    }
    const { entry, frames: f } = pageEntry(p, model, pixel)
    entry.ms = Math.round(model.ms)
    pages.push(entry)
    frames.push(f)
  }
  const summary = await page.evaluate(() => window.gate.summary())
  if (errors.length) summary.pageErrors = errors.splice(0).slice(0, 5)
  return { name, ready: true, info, meta, pages, totals: fixtureTotals(pages, frames, TIER), summary }
}

await Promise.all(Array.from({ length: Math.min(WORKERS, queue.length) }, worker))
await browser.close()
server.close()
const seconds = Math.round((Date.now() - t0) / 100) / 10
if (leaks.length) { console.log(`FAIL requests that would have left the machine: ${leaks.slice(0, 5).join(' ')}`); failures.push('network') }

// ---------------------------------------------------------------- the totals, the record, the rule
const floor = readJson(join(GATE, 'floor.json'))
const ran = [...results.values()].filter(r => r.ready).sort((a, b) => a.name.localeCompare(b.name))
const run = {
  schema: 1, tier: TIER, made: new Date().toISOString(), seconds,
  gate: { commit: git(REPO, ['rev-parse', 'HEAD']), dirty: !!git(REPO, ['status', '--porcelain', '--untracked-files=no', '--', 'experiments/pdf-bilingual/spikes/layer-gate', 'experiments/pdf-bilingual/spikes/layer-gate.mjs', 'src/pdf-reader/engine/layer/check.mjs']) },
  engine: engineInfo, inputs,
  totals: { all: pooled(ran.map(r => r.totals), TIER), shared: pooled(ran.filter(r => floor.shared.includes(r.name)).map(r => r.totals), TIER) },
  fixtures: Object.fromEntries(ran.map(r => [r.name, { meta: r.meta, info: { pages: r.info.pages, units: r.info.units, located: r.info.located, even: r.info.even, family: r.info.family }, summary: r.summary, totals: r.totals, pages: r.pages.map(compact) }])),
  failed: [...results.values()].filter(r => !r.ready).map(r => ({ name: r.name, why: r.why })),
}
const completeness = completenessRows(run)
const outDir = join(ROOT, 'out/layer-gate')
mkdirSync(outDir, { recursive: true })
const runFile = join(outDir, `${TIER}-${(engineInfo.commit ?? 'none').slice(0, 8)}${engineInfo.dirty ? '+' : ''}-${run.made.replace(/[:.]/g, '-')}.json`)
writeFileSync(runFile, JSON.stringify(run))
printTable(run)
console.log(`\n${TIER} tier: ${ran.length} outputs, ${ran.reduce((a, r) => a + r.pages.length, 0)} pages in ${seconds} s on ${WORKERS} workers; the run in ${runFile}`)

let exit = failures.length ? 1 : 0
const bad = completeness.filter(c => c.fails.length)
console.log(`completeness (spec §5): ${bad.length ? `${bad.length} of ${completeness.length} outputs fail: ${bad.map(c => `${c.name} [${c.fails.join(', ')}]`).join('; ')}` : `every one of ${completeness.length} outputs passes`}`)
if (bad.length) exit = 1

const recordAt = typeof arg('record') === 'string' ? resolve(arg('record')) : join(existsSync(recordDir(ENGINE)) ? recordDir(ENGINE) : recordDir(REPO), 'layer-fidelity.json')
const checkAt = typeof arg('check') === 'string' ? resolve(arg('check')) : [join(recordDir(ENGINE), 'layer-fidelity.json'), join(recordDir(REPO), 'layer-fidelity.json')].find(existsSync)
let verdict = null
if (arg('check')) {
  if (!checkAt || !existsSync(checkAt)) { console.log('FAIL --check: no record to check against'); exit = 1 }
  else {
    const record = readJson(checkAt)
    // the recorded run of the same tier and layouts; a model run is checked against a pixel run's model measures too
    const last = record.tiers[KEY] ?? (TIER === 'model' ? record.tiers[KEY.replace(/^model/, 'pixel')] : null)
    if (!last) { console.log(`FAIL --check: ${checkAt} holds no ${KEY} run (it holds ${Object.keys(record.tiers).join(', ')})`); exit = 1 }
    else {
      verdict = checkAgainst(last, run)
      if (verdict.failed) exit = 1
    }
  }
}
if (arg('record')) {
  if (ONLY || PAGES) { console.log('FAIL --record: a whole run only (no --only, no --pages)'); exit = 1 }
  else writeRecords(recordAt, run, completeness)
}
if (progress) progress.finish(run, verdict)
process.exit(exit)

// ---------------------------------------------------------------- helpers

/**
 * The fixtures with the layout files the engine's own maker makes (spikes/layer-fixtures.mjs --engine --offline): its
 * marks, its layout maker, its pieces, over the same papers, arXiv's PDFs and translations, made once for the engine's
 * files as they are (out/layer-gate/fixtures/<their digest>/; the marks files cached by what they compile, so that only a
 * change of the marks compiles again, in Docker's TeX Live with no network). An output the maker refuses holds its
 * refusal in place of its layout file, and the layer is run as Plan 5's there: the gate counts it as failed
 */
function madeFixtures() {
  const engineDir = join(ENGINE, 'src/pdf-reader/engine')
  const files = []
  const walk = d => { for (const n of readdirSync(d).sort()) { const f = join(d, n); if (statSync(f).isDirectory()) walk(f); else if (/\.m?js$/.test(n)) files.push(f) } }
  walk(engineDir)
  // the layer's own modules make no layout (but the pieces, which the translation's units are read with)
  const used = files.filter(f => !f.startsWith(join(engineDir, 'layer') + sep) || f.endsWith(`${sep}pieces.mjs`))
  const key = sha256([MAKER, ...used].map(f => `${f.slice(ENGINE.length)}\n`).join('') + [MAKER, ...used].map(f => fileSha(f)).join('\n')).slice(0, 16)
  const dir = join(ROOT, 'out/layer-gate/fixtures', key)
  const want = readdirSync(REFS).filter(n => /^[A-Za-z0-9._-]+v\d+-[A-Za-z-]+$/.test(n) && existsSync(join(REFS, n, 'layout.json'))).filter(n => !ONLY || ONLY.includes(n))
  const missing = want.filter(n => !existsSync(join(dir, n, 'units.json')) || !(existsSync(join(dir, n, 'layout.json')) || existsSync(join(dir, n, 'refusal.json'))))
  if (missing.length) {
    console.log(`making ${missing.length} output${missing.length === 1 ? '' : 's'}' layouts with the engine at ${ENGINE === REPO ? 'this tree' : ENGINE} (${key})`)
    const t = Date.now()
    try {
      execFileSync(join(REPO, 'node_modules/.bin/tsx'), [MAKER, '--offline', `--engine=${ENGINE}`, `--only=${missing.map(n => { const { paper, target } = nameOf(n); return `${paper}:${target}` }).join(',')}`], { env: { ...process.env, LAYER_FIXTURES: dir }, stdio: ['ignore', 'inherit', 'inherit'] })
    } catch { console.log('FAIL the layout maker did not make every output') }
    console.log(`made in ${((Date.now() - t) / 1000).toFixed(1)} s`)
  }
  return dir
}

/** a page's entry as the record holds it: zeros, nulls and empty lists left out (read back as 0) */
function compact(e) {
  const out = {}
  for (const [k, v] of Object.entries(e)) {
    if (v === null || v === undefined || v === 0 || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) continue
    if (k === 'style' && !v[1]) continue
    out[k] = v
  }
  return out
}

/** the brief's completeness rows: per output, each check's count over its pages, and the checks that fail */
function completenessRows(run) {
  return Object.entries(run.fixtures).map(([name, f]) => {
    const t = f.totals
    const row = { name, pages: t.pages, missing: t.missing ?? 0, twice: t.twice ?? 0, brackets: t.brackets ?? 0, duplicated: t.duplicated ?? 0, numbers: [t.numbersShown, t.numbersTotal], clipped: t.clipped ?? 0 }
    if (TIER === 'pixel') row.lostInk = t.lostInk ?? 0
    row.fails = ['lostInk', 'missing', 'twice', 'brackets', 'duplicated', 'clipped'].filter(k => row[k] > 0)
    if (t.numbersShown < t.numbersTotal) row.fails.push('numbers')
    return row
  })
}

/** the merge rule against a recorded run: the inputs first (a reference or a scale changed is no comparison), then
 *  every measure of every fixture, then the pages */
function checkAgainst(last, run) {
  const out = { failed: false, lines: [] }
  const say = s => { out.lines.push(s); console.log(s) }
  for (const k of ['layouts', 'scale', 'inkScale', 'inkMin', 'composite', 'pages', 'checker', 'measures']) if (String(last.inputs[k]) !== String(run.inputs[k])) { say(`FAIL --check: the record's ${k} is ${last.inputs[k]}, this run's ${run.inputs[k]}: not comparable`); out.failed = true }
  for (const [name, f] of Object.entries(run.fixtures)) {
    const was = last.fixtures[name]
    if (was && was.meta.ref !== f.meta.ref) { say(`FAIL --check: ${name}'s reference is not the record's (${was.meta.ref} against ${f.meta.ref}): a new reference is a new baseline`); out.failed = true }
  }
  if (out.failed) return out
  const cmp = compare(last.fixtures, run.fixtures, run.tier)
  out.cmp = cmp
  const fmt = v => (typeof v !== 'number' ? String(v) : Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000))
  say(`\n--check against ${last.engine.commit?.slice(0, 8) ?? '?'} (${last.made}): ${cmp.regressions.length} regression${cmp.regressions.length === 1 ? '' : 's'}, ${cmp.improvements.length} improvement${cmp.improvements.length === 1 ? '' : 's'}${cmp.unmatched.length ? `, not in the record: ${cmp.unmatched.join(' ')}` : ''}`)
  const unit = r => (MEASURES.find(m => m[0] === r.measure)?.[2] === 'defect' ? ' a 1,000 cells' : '')
  for (const r of cmp.regressions) say(`  worse  ${r.fixture} ${r.label}: ${fmt(r.from)} -> ${fmt(r.to)}${unit(r)}`)
  for (const r of cmp.improvements) say(`  better ${r.fixture} ${r.label}: ${fmt(r.from)} -> ${fmt(r.to)}${unit(r)}`)
  const worsePages = cmp.pages.filter(p => p.worse.length)
  say(`pages that regressed: ${worsePages.length}`)
  for (const p of worsePages) say(`  ${p.fixture} p${p.page}: ${p.worse.join(', ')}${p.better.length ? ` (better: ${p.better.join(', ')})` : ''}`)
  if (cmp.regressions.length) out.failed = true
  return out
}

/** the totals and every fixture, printed */
function printTable(run) {
  const ms = MEASURES.filter(m => TIER === 'pixel' || m[1] === 'model')
  const cell = (t, m) => {
    const v = m[2] === 'defect' ? t[m[0]] : t[m[0]]
    if (v === undefined || v === null) return '-'
    return m[2] === 'share' ? `${(100 * v).toFixed(1)}%` : typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : String(v)
  }
  const head = ['output', ...ms.map(m => m[0])]
  console.log(head.join('\t'))
  for (const [name, f] of Object.entries(run.fixtures)) console.log([name, ...ms.map(m => cell(f.totals, m))].join('\t'))
  for (const [k, t] of Object.entries(run.totals)) if (t) console.log([`[${k}]`, ...ms.map(m => cell(t, m))].join('\t'))
}

/** the record: the run with the prototype's floor beside it (layer-fidelity.json and .md), and the completeness rows
 *  (layer-gate.json and .md) */
function writeRecords(file, run, rows) {
  mkdirSync(dirname(file), { recursive: true })
  const had = existsSync(file) ? readJson(file) : null
  const tiers = { ...(had?.tiers ?? {}) }
  tiers[KEY] = run
  if (run.tier === 'pixel') delete tiers[KEY.replace(/^pixel/, 'model')]
  const record = { schema: 1, what: 'the instant layer against the original page, per fixture and page (spikes/layer-gate.mjs)', floor: { what: floor.what, shared: floor.shared, pooled: floor.pooled, byFixture: floor.byFixture }, tiers }
  writeFileSync(file, `${JSON.stringify(record, null, 0).replace(/\{"p":/g, '\n{"p":')}\n`)
  writeFileSync(file.replace(/\.json$/, '.md'), fidelityMd(record))
  const gateFile = join(dirname(file), 'layer-gate.json')
  // the completeness rows are the engine's own layouts' where the record holds them
  if (LAYOUTS !== 'made' && tiers[TIER]) { console.log(`recorded: ${file}, ${file.replace(/\.json$/, '.md')}`); return }
  writeFileSync(gateFile, `${JSON.stringify({ schema: 1, tier: run.tier, made: run.made, engine: run.engine, inputs: run.inputs, rows: rows.map(r => ({ ...r, units: idsOf(run.fixtures[r.name]) })), summaries: Object.fromEntries(Object.entries(run.fixtures).map(([n, f]) => [n, typography(n, f)])) }, null, 1)}\n`)
  writeFileSync(gateFile.replace(/\.json$/, '.md'), gateMd(run, rows))
  console.log(`recorded: ${file}, ${file.replace(/\.json$/, '.md')}, ${gateFile}, ${gateFile.replace(/\.json$/, '.md')}`)
}

/** the units each completeness failure is in, by page */
function idsOf(f) {
  const out = {}
  for (const p of f.pages) for (const [k, ids] of Object.entries(p.where ?? {})) (out[k] ??= []).push([p.p, ...ids])
  return out
}

/** the brief's recorded typography of an output: full size and median size, style, unfit units against the bars, lines on
 *  a layout baseline, page 1's layer time and the slowest unit */
function typography(name, f) {
  const { target } = nameOf(name)
  const bar = /^(zh|zh-TW)$/.test(target) ? 0.01 : /^(ja|ko)$/.test(target) ? 0.02 : 0.03
  const s = f.summary
  const unfit = s.why ? Object.entries(s.why).filter(([k]) => k === 'floor').reduce((a, [, v]) => a + v, 0) : 0
  return {
    fullSize: s.fullSize === null ? null : Math.round(s.fullSize * 1000) / 1000, medianScale: s.medianScale, style: f.totals.style, onGrid: f.totals.onGrid,
    unfit: [unfit, s.laid], unfitShare: s.laid ? Math.round((1000 * unfit) / s.laid) / 1000 : null, bar, overBar: s.laid ? unfit / s.laid > bar : false,
    why: s.why, page1Ms: s.page1Ms === null ? null : Math.round(s.page1Ms), slowestUnitMs: s.slowestUnitMs === null ? null : Math.round(s.slowestUnitMs),
  }
}

function pct(v) { return v === null || v === undefined ? '-' : `${(Math.round(1000 * v) / 10).toFixed(1)} %` }
function num(v, d = 2) { return v === null || v === undefined ? '-' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(d)) : String(v) }
/** a measure's value as the tables show it: a share in per cent, a defect as its count and its rate */
function shown(t, m) {
  if (!t) return '-'
  const v = t[m[0]]
  if (m[2] === 'share') return pct(v)
  if (m[2] === 'defect') return v === undefined ? '-' : `${v}${t.rates?.[m[0]] !== undefined && t.rates[m[0]] !== Infinity ? ` (${num(t.rates[m[0]], 2)})` : ''}`
  if (m[0] === 'unitsLeft') return `${v} / ${t.textOn}`
  if (m[0] === 'cellsLeft') return `${v} / ${t.cellsOn}`
  return num(v, m[2] === 'ratio' ? 3 : 2)
}
/** the original's own value of a measure */
function originalOf(m) {
  const ORIGINAL = { textTranslated: 1, textEnglish: 0, textBlank: 0, cellsTranslated: 1, unitsLeft: 0, cellsLeft: 0, fill: 1, blankLines: 0, framesBlank1: 0, pitchSpread: 0, scale: 1, fullSize: 1, scaleSpread: 0, overRight: 0 }
  return m[2] === 'defect' ? '0' : m[2] === 'share' ? pct(ORIGINAL[m[0]]) : num(ORIGINAL[m[0]])
}

function fidelityMd(record) {
  const keys = ['pixel', 'model', 'pixel-fixed', 'model-fixed', 'pixel-given', 'model-given'].filter(k => record.tiers[k])
  const run = record.tiers[keys[0]]
  const ms = MEASURES.filter(m => run.tier === 'pixel' || m[1] === 'model')
  const layoutsOf = r => (r.inputs.layouts === 'made' ? "the engine's own layout files" : r.inputs.layouts === 'fixed' ? "the fixtures' layout files, as made for the layer lab" : `the layout files of ${r.inputs.fixtures}`)
  const L = []
  L.push('# The instant layer against the original: the fidelity record', '')
  L.push(`Written by \`spikes/layer-gate.mjs --record\`. Each run below: the engine at its commit, ${run.inputs.chromium ? `Chromium ${run.inputs.chromium}` : ''}, PDF.js ${run.inputs.pdfjs}; pages: ${run.inputs.pages}; the planes at ${run.inputs.scale} device px a PDF unit, lost ink at ${run.inputs.inkScale}x; crops drawn ${run.inputs.composite}.`, '')
  for (const k of keys) { const r = record.tiers[k]; L.push(`- **${k}**: the engine at \`${r.engine.commit?.slice(0, 8)}\` (${r.engine.branch}${r.engine.dirty ? ', with changes' : ''}), the gate at \`${r.gate.commit?.slice(0, 8)}\`${r.gate.dirty ? ' with changes' : ''}, ${r.made.slice(0, 10)}; ${layoutsOf(r)}; ${r.seconds} s.`) }
  L.push('', 'Every measure is against arXiv\'s original page, whose own value is the first column. The prototype is the approved prototype\'s floor (the parity run, 2026-10-06, on the ten outputs it shares with the engine, pages 1-12). A defect is its count and, in brackets, its rate per 1,000 translated text cells (the model tier: per 1,000 cells of the drawn units\' frames), which is what the merge rule compares.', '')
  const fl = floorTotals(record.floor.pooled)
  const cols = [['Prototype (floor), shared ten', fl]]
  for (const k of keys) { const r = record.tiers[k]; cols.push([`${k}, shared ten`, r.totals.shared], [`${k}, all ${r.totals.all?.outputs ?? ''}`, r.totals.all]) }
  L.push('## Against the original', '', `| measure | Original | ${cols.map(c => c[0]).join(' | ')} |`, `|---|---|${cols.map(() => '---|').join('')}`)
  for (const m of ms) L.push(`| ${m[4]} | ${originalOf(m)} | ${cols.map(c => shown(c[1], m)).join(' | ')} |`)
  for (const [key, label] of REPORTED) L.push(`| ${label} (not gated) | ${key === 'pitch' ? '1' : key === 'onGrid' ? '100.0 %' : '0'} | ${cols.map(c => (key === 'onGrid' ? pct(c[1]?.[key]) : num(c[1]?.[key], 3))).join(' | ')} |`)
  L.push('')
  const below = ms.filter(m => fl[m[0]] !== undefined && run.totals.shared && (() => { const w = closer(m, fl, run.totals.shared); return w !== null && w < 0 })())
  L.push(`**Below the prototype's floor on the shared ten** (${keys[0]}): ${below.length ? below.map(m => m[4]).join(', ') : 'none'}.`, '')
  const head = ['textTranslated', 'textEnglish', 'textBlank', 'cellsTranslated', 'unitsLeft', 'blankLines', 'fullSize', 'overlap', 'residue', 'bites', 'vanished', 'cropForeign', 'lostInk', 'wrongPageText', 'clipped'].map(k => MEASURES.find(m => m[0] === k)).filter(m => ms.includes(m))
  L.push(`## By output (${keys[0]})`, '', `| output | ${head.map(m => m[4]).join(' | ')} | why left |`, `|---|${head.map(() => '---|').join('')}---|`)
  for (const [name, f] of Object.entries(run.fixtures)) L.push(`| ${name} | ${head.map(m => shown(f.totals, m)).join(' | ')} | ${Object.entries(f.totals.left).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || '-'} |`)
  L.push('', 'Every measure of every output, and of every page, is in layer-fidelity.json.', '')
  return `${L.join('\n')}\n`
}
/** the prototype's pooled floor with its defects' rates per 1,000 translated text cells */
function floorTotals(f) {
  return { ...f, rates: Object.fromEntries(['overlap', 'stray', 'residue', 'bites', 'vanished', 'doubled', 'cropForeign', 'clipped', 'graphicsErased', 'graphicsOverdrawn'].map(k => [k, Math.round((1e6 * f[k]) / f.textTranslatedCells) / 1000])) }
}
/** how much closer to the original `b` is than `a` on a measure (positive: closer), or null */
function closer(m, a, b) {
  const [key, , cls, better] = m
  const x = cls === 'defect' ? a.rates?.[key] : a[key], y = cls === 'defect' ? b.rates?.[key] : b[key]
  if (x === undefined || x === null || y === undefined || y === null) return null
  return better === 'up' ? y - x : better === 'down' ? x - y : Math.abs(x - 1) - Math.abs(y - 1)
}

function gateMd(run, rows) {
  const L = ['# The instant layer\'s completeness gate (spec §5)', '']
  L.push(`Written by \`spikes/layer-gate.mjs --tier=${run.tier} --record\` on ${run.made.slice(0, 10)}, the engine at \`${run.engine.commit?.slice(0, 8)}\`. Pages: ${run.inputs.pages}; a check fails on any count above 0 (lost ink: regions of more than ${run.inputs.inkMin} device pixels at ${run.inputs.inkScale}x).`, '')
  L.push('| output | pages | lost ink | missing | twice | doubled brackets | duplications | equation numbers shown | clipped | fails |', '|---|---|---|---|---|---|---|---|---|---|')
  for (const r of rows) L.push(`| ${r.name} | ${r.pages} | ${r.lostInk ?? '-'} | ${r.missing} | ${r.twice} | ${r.brackets} | ${r.duplicated} | ${r.numbers[0]} / ${r.numbers[1]} | ${r.clipped} | ${r.fails.join(', ') || 'none'} |`)
  L.push('', '## Recorded, not gated (the brief\'s typography)', '')
  L.push('| output | full size | median size | style match | lines on a layout baseline | unfit (floor) | bar | page 1 ms | slowest unit ms |', '|---|---|---|---|---|---|---|---|---|')
  for (const [name, f] of Object.entries(run.fixtures)) {
    const t = typography(name, f)
    L.push(`| ${name} | ${pct(t.fullSize)} | ${num(t.medianScale, 3)} | ${t.style[1] ? `${t.style[0]} / ${t.style[1]}` : '-'} | ${pct(t.onGrid)} | ${t.unfit[0]} / ${t.unfit[1]} (${pct(t.unfitShare)})${t.overBar ? ' over' : ''} | ${pct(t.bar)} | ${num(t.page1Ms)} | ${num(t.slowestUnitMs)} |`)
  }
  L.push('', 'Iteration 3 beside them (the parity report and the brief): full size zh 0.968, ja/ko 0.648, de 0.305, ru 0.274; style 0.97. The faces are now the role table\'s.', '')
  return `${L.join('\n')}\n`
}

// ---------------------------------------------------------------- the progress folder (pixel tier)
function openProgress() {
  mkdirSync(PROGRESS, { recursive: true })
  const folders = readdirSync(PROGRESS).filter(n => /^\d{2}-[a-z0-9-]+$/.test(n)).sort()
  const nn = folders.length ? Math.max(...folders.map(n => Number(n.slice(0, 2)))) + 1 : 0
  const raw = typeof arg('label') === 'string' ? arg('label') : engineInfo.branch ?? 'run'
  const label = raw.toLowerCase().replace(/^exp\//, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'run'
  const name = `${String(nn).padStart(2, '0')}-${label}`
  const dir = join(PROGRESS, name)
  mkdirSync(join(dir, 'engine'), { recursive: true })
  // the previous recorded run, else the baseline
  const runOf = n => { try { return { name: n, run: readJson(join(PROGRESS, n, 'run.json')) } } catch { return null } }
  const earlier = folders.map(runOf).filter(Boolean)
  const previous = earlier.filter(e => e.run.recorded).at(-1) ?? earlier.find(e => e.name.startsWith('00-')) ?? null
  const images = []
  const short = (engineInfo.commit ?? '').slice(0, 8)
  return {
    dir, name, previous,
    async panel(page, fixture, p) {
      const file = `${fixture}-p${p}.png`
      const proto = existsSync(join(REFS, fixture, 'proto', `p${p}.png`)) ? `${ORIGIN}/proto/${fixture}/p${p}.png` : null
      const prev = previous && existsSync(join(PROGRESS, previous.name, 'engine', file)) ? `${ORIGIN}/progress/${previous.name}/engine/${file}` : null
      const pw = Math.floor((PROGRESS_WIDTH - 3 * GAP) / 4)
      const labels = ['Original', proto ? 'Prototype (approved)' : 'Prototype: no output for this', `Engine ${short}${engineInfo.dirty ? '+' : ''} (this run)`, prev ? `Engine, ${previous.name}` : 'No previous run']
      const out = await page.evaluate(o => window.gate.panel(o), { pw, gap: GAP, labels, proto, previous: prev })
      writeFileSync(join(dir, file), encodePng(Buffer.from(out.rgba, 'base64'), out.w, out.h))
      writeFileSync(join(dir, 'engine', file), encodePng(Buffer.from(out.engine.rgba, 'base64'), out.engine.w, out.engine.h))
      images.push({ file, fixture, p })
    },
    finish(run, verdict) {
      const recorded = !!arg('record') && !ONLY && !PAGES
      const prevRun = previous?.run ?? null
      writeFileSync(join(dir, 'run.json'), JSON.stringify({ name, recorded, made: run.made, engine: run.engine, inputs: run.inputs, totals: run.totals, fixtures: Object.fromEntries(Object.entries(run.fixtures).map(([n, f]) => [n, { meta: f.meta, totals: f.totals, pages: f.pages }])) }))
      const ms = MEASURES
      const L = [`# ${name}`, '', `The engine at \`${short}\` (${engineInfo.branch}${engineInfo.dirty ? ', with changes' : ''}), ${run.made.slice(0, 16).replace('T', ' ')} UTC; compared with ${prevRun ? `\`${previous.name}\` (the engine at \`${prevRun.engine.commit?.slice(0, 8)}\`)` : 'no earlier run'}. Every measure is against arXiv's original page. A defect is its count and, in brackets, its rate per 1,000 translated text cells.`, '']
      const fl = floorTotals(floor.pooled)
      const table = (title, rows) => {
        L.push(`## ${title}`, '', '| measure | Original | ' + rows.map(r => r[0]).join(' | ') + ' |', `|---|---|${rows.map(() => '---|').join('')}`)
        for (const m of ms) L.push(`| ${m[4]} | ${originalOf(m)} | ${rows.map(r => shown(r[1], m)).join(' | ')} |`)
        L.push('')
      }
      table('The ten shared outputs, pages 1-12', [['Prototype (floor)', fl], ...(prevRun ? [[`Previous (${previous.name})`, prevRun.totals.shared]] : []), ['This run', run.totals.shared]])
      table('All outputs', [...(prevRun ? [[`Previous (${previous.name})`, prevRun.totals.all]] : []), ['This run', run.totals.all]])
      if (prevRun) {
        const cmp = compare(prevRun.fixtures, run.fixtures, run.tier)
        L.push('## Pages that moved against the previous run', '')
        if (!cmp.pages.length) L.push('None.')
        for (const p of cmp.pages) L.push(`- ${p.fixture} p${p.page}: ${p.worse.length ? `worse ${p.worse.join(', ')}` : ''}${p.worse.length && p.better.length ? '; ' : ''}${p.better.length ? `better ${p.better.join(', ')}` : ''}`)
        L.push('')
      }
      if (verdict?.lines?.length) L.push('## The merge rule (--check)', '', '```', ...verdict.lines.map(s => s.trim()), '```', '')
      writeFileSync(join(dir, 'metrics.md'), `${L.join('\n')}\n`)
      const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
      const figs = images.sort((a, b) => a.file.localeCompare(b.file, 'en', { numeric: true })).map(im => `<figure><img src="${im.file}" alt="${esc(`${im.fixture} page ${im.p}`)}"><figcaption>${esc(`${im.fixture}, page ${im.p}: original | prototype | this run | ${prevRun ? previous.name : 'no previous run'}`)}</figcaption></figure>`)
      writeFileSync(join(dir, 'index.html'), `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(name)}</title>\n<style>body{margin:16px;font:14px/1.4 -apple-system,"Helvetica Neue",Arial,sans-serif;color:#222;background:#fff}figure{margin:0 0 28px}img{display:block;max-width:100%;height:auto;border:1px solid #ddd}figcaption{margin-top:6px;color:#555}</style></head>\n<body><h1>${esc(name)}</h1><p>The engine at ${esc(short)} (${esc(engineInfo.branch ?? '')}). The measures are in <a href="metrics.md">metrics.md</a>.</p>\n${figs.join('\n')}\n</body></html>\n`)
      console.log(`progress: ${dir}`)
    },
  }
}
