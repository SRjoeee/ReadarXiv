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
//       [--composite=source-over|darken] [--no-progress] [--panel-width=<px>] [--freeze[=force]]
//       [--engine-kind=layer|proto] [--proto-units=fixture|p7] [--progress=<name|path>] [--previous=<name|path>] [--panels-only] [--proto-panels=<dir>]
//       [--proto-faces=roles|prototype] [--proto-place=<file>] [--proto-order=<file>] [--dump=<dir>] [--write-floor]
//       [--proto-tex=ph|lines] [--proto-tex-only=no] [--proto-symbols=text|strict] [--proto-extents=v0|tex]
//       [--against=<record key>] [--proto-params=<json>] [--ruling=<file>]
//   --engine     the engine measured: <worktree>/src/pdf-reader/engine served as /engine/ (the checker, layer/check.mjs, is
//                always this repository's: the instrument is the same for every branch); default this repository
//   --layouts    made (the default): the layout files the engine's own maker makes from the fixtures' papers (spikes/
//                layer-fixtures.mjs --engine --offline, cached by the engine's files in out/layer-gate/fixtures/), so that
//                a change of the maker is measured end to end: with the paper's own switch where the engine's marks file
//                carries one (GATE_SWITCH=1 or 0 says otherwise), its marks read from each kept compile by its own reader;
//                fixed: the fixtures' own, as they were made for the lab
//   --records    (or LAYER_RECORDS) the translation alone (record.json, units.json) from another folder of the same layout:
//                spikes/table-groups.mjs --write's decided records over the engine's own layout files
//   --fixtures   (or LAYER_FIXTURES) the fixtures' layout.json, units.json and arxiv.pdf from another folder of the same
//                layout (the web's web/e2e/.fixtures/); the references stay data/layer-fixtures' (LAYER_REFS another)
//   --check      the merge rule against the last record (default <engine>/experiments/pdf-bilingual/records/
//                layer-fidelity.json, else this repository's): no measure worse on any fixture (shares by more than 0.2
//                points, ratios by 0.02, unit counts at all, defects as rates per 1,000 translated text cells at all);
//                every page whose measures moved listed; exit 1 on any regression, or where the inputs are not the record's
//   --record     the run as the record: layer-fidelity.json (per fixture and page, the totals, the prototype's floor) and
//                layer-fidelity.md beside it, and the brief's layer-gate.json and .md (the completeness by output); a whole
//                run only (no --only, no --pages); --ruling=<file> (with --record): a ruling of the maintainer's the
//                record is made under, where it stands against the merge rule (a JSON file: { date, by, on, quote, english,
//                measures, scope, why }), kept in the record with every earlier one and listed in its .md
//   --label      the progress folder's name (pixel tier): /Users/cheongzhiyan/Downloads/readarxiv-test/layer-progress/<NN>-<label>/
//                (LAYER_PROGRESS names another): per page of the controller's set an image of four panels in a 2 x 2
//                grid, each --panel-width wide (1,000 px): the original and the prototype above, this run and the previous
//                recorded run (of the same layout files where there is one, else the baseline) below; metrics.md and
//                index.html; default the engine's branch
//   --composite  how crops are drawn on the copy: darken (the default since the maker round: the prototype's drawing, and
//                the layer round's) or source-over (the lab's at first)
//   --freeze     the reference text area of every fixture that has none (=force: made again, a deliberate change;
//                --ref-layouts=<dir>,…: a later maker's fixtures' layout files first, the fixture's own, then the
//                prototype's geometry for the units none locates)
//   --write-floor  layer-gate/floor.json from this run: the prototype's floor as this gate measures it, v0 under the
//                floor's conditions at the gate's own text place (--engine=<exp/layer-proto> --engine-kind=proto
//                --proto-units=p7 --proto-faces=prototype --tier=pixel, the ten shared outputs; v0 at its port,
//                exp/layer-proto f654c05c, whose drawing is the live prototype's); the committed floor kept beside it as
//                "old", every earlier one in "history"
//   --proto-tex  the hybrid (layer-proto/tex.mjs): v0 with each unit the fixture's layout file locates whole taking the
//                file's geometry, every other unit v0's own: ph, each placeholder's ink by its segments; lines, the unit's
//                lines and label too, and the units the file locates whole that v0's geometry does not hold but table cells
//                (--proto-tex-only=no: those not); --proto-symbols=strict: a symbol v0 draws as text must be found too for a
//                unit to be located whole; --proto-extents=tex (with lines): the file's erase rectangles. Recorded
//                apart (<tier>-proto-tex-<ph|lines>, and each further choice)
//   --against    --check against another of the record's runs than this run's own (a hybrid against v0's, pixel-proto):
//                the inputs that make it another run (tex) are not compared
//   --engine-kind  layer (the default): the engine's layer entry (layer/layer.mjs) over a layout file; proto: the layer's
//                v0, the approved prototype ported into the engine (layer-proto/run.mjs), which has no layout file: it
//                reads the made output's geometry (the prototype's own, layer-gate/ref.mjs PROTO_GEOMETRY, by paper) and a
//                units file, and is measured on the same pages, fixtures, references and measures (layer-gate/proto.mjs).
//                Its runs are recorded apart (<tier>-proto), the fixtures' own layout files serving only the instrument
//   --proto-units  fixture (the default): v0 translates what the engine does, each fixture's record.json; p7: the
//                prototype's own staging output, which its floor was measured on (the ten shared outputs have one)
//   --progress   the progress folder: a name under the progress folders, or a path (default <NN>-<label>); --previous the
//                run whose engine panels and totals stand beside this one's (a name or a path; default the last recorded);
//                --panels-only writes the engine panels and run.json alone (a run to stand beside another);
//                --proto-panels the prototype's panels from a folder of <fixture>-p<n>.png (default each fixture's proto/)
//   --proto-faces  the faces v0 draws in: the role table's (its default) or the prototype's own (its floor's; recorded
//                apart, <tier>-proto-pf)
//   --proto-place, --proto-order, --dump  v0 against the live prototype (never recorded): each page's text where the
//                prototype's own page put it (its floor was measured there: the text's anti-aliasing at a fraction of a
//                pixel), each fixture's units in a live run's order, and v0's records, audit and page digests written out
// The consistency measures (the table-groups brief, 2026-10-07), checked with the completeness ones and each to be 0: a
// table group drawn partly (the record's translated cells of one `group`, some drawn and some not) and a float's label
// left in the source language where the final names it in the target's (the record's `captions`, caption-names.mjs's
// names); the fixtures carry groups and captions as spikes/table-groups.mjs --write gives them (--fixtures).
// Exits 1 on any completeness failure (the brief's gate; under --check the merge rule decides, each completeness count
// being one of its measures), on a regression under --check, or where a fixture could not be run.
import { execFile, execFileSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { constants as zlibConstants, gzipSync, inflateRawSync, inflateSync } from 'node:zlib'
import { availableParallelism } from 'node:os'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { chromium } from 'playwright'
import { captionNames } from '../../../src/pdf-reader/engine/caption-names.mjs'
import { encodePng } from './layer-gate/png.mjs'
import { geometryFile, nameOf, PROTO_GEOMETRY, refBytesOf, refPages, sha256 } from './layer-gate/ref.mjs'
import { compare, fixtureTotals, MEASURES, pageEntry, pooled, REPORTED } from './layer-gate/score.mjs'

const here = new URL('.', import.meta.url).pathname
const ROOT = resolve(here, '..')
const REPO = resolve(ROOT, '../..')
const DATA = process.env.AXT_DATA ?? join(ROOT, 'data')
const arg = name => { const a = process.argv.find(x => x === `--${name}` || x.startsWith(`--${name}=`)); return a === undefined ? null : a.includes('=') ? a.slice(name.length + 3) : true }
/** --perf: the costs (the maintainer's budget, 2026-10-07), on one worker, the model tier: per page, the first drawing,
 *  its steps, the drawing again at twice the resolution, the canvases held and the JS heap; per paper, the layout
 *  maker's time (and its operator lists'), the remover's beyond them, and the bytes the reader is sent (the layout file,
 *  the add-on, its manifest). One pass a run: spikes/layer-perf.mjs takes the medians of several runs and the budget */
const PERF = !!arg('perf')
const TIER = PERF ? 'model' : arg('tier') ?? 'model'
if (TIER !== 'model' && TIER !== 'pixel') throw new Error(`--tier=${TIER}: model or pixel`)
const ENGINE = resolve(typeof arg('engine') === 'string' ? arg('engine') : REPO)
/** the layer measured: the engine's layer entry over a layout file, or its v0 with none (proto.mjs) */
const KIND = arg('engine-kind') ?? 'layer'
if (!['layer', 'proto'].includes(KIND)) throw new Error(`--engine-kind=${KIND}: layer or proto`)
const PROTO = KIND === 'proto'
const PROTO_UNITS = arg('proto-units') ?? 'fixture'
if (!['fixture', 'p7'].includes(PROTO_UNITS)) throw new Error(`--proto-units=${PROTO_UNITS}: fixture or p7`)
/** --proto-faces=roles|prototype: the faces v0 draws in (its own default, the role table's, where not given) */
const PROTO_FACES = typeof arg('proto-faces') === 'string' ? arg('proto-faces') : null
if (PROTO_FACES && !['roles', 'prototype'].includes(PROTO_FACES)) throw new Error(`--proto-faces=${PROTO_FACES}: roles or prototype`)
/** --proto-tex=ph|lines: the hybrid, and its further choices */
const PROTO_TEX = typeof arg('proto-tex') === 'string' ? arg('proto-tex') : null
if (PROTO_TEX && !['ph', 'lines'].includes(PROTO_TEX)) throw new Error(`--proto-tex=${PROTO_TEX}: ph or lines`)
const TEX = PROTO_TEX ? { use: PROTO_TEX, texOnly: PROTO_TEX === 'lines' && arg('proto-tex-only') !== 'no', symbols: typeof arg('proto-symbols') === 'string' ? arg('proto-symbols') : 'text', extents: typeof arg('proto-extents') === 'string' ? arg('proto-extents') : 'v0' } : null
if (TEX && (!['strict', 'text'].includes(TEX.symbols) || !['v0', 'tex'].includes(TEX.extents))) throw new Error('--proto-symbols=text|strict, --proto-extents=v0|tex')
const TEX_KEY = TEX ? `-tex-${TEX.use}${TEX.use === 'lines' && !TEX.texOnly ? '-geometry' : ''}${TEX.symbols === 'strict' ? '-strict' : ''}${TEX.extents === 'tex' ? '-erase' : ''}` : ''
const AGAINST = typeof arg('against') === 'string' ? arg('against') : null
/** --removal=draw|measure: the text-removed PDF (layout/remove.mjs, layer-proto/removal.mjs), v0 only: the paper's add-on,
 *  one a paper whatever the target, its plan made from the layout file alone (removal.mjs pagePlan, in Node; cached by
 *  arXiv's bytes, the layout file and the remover), checked glyph by glyph by PDF.js's reading, and v0 opened over it:
 *  drawing by it (draw), or its own way (measure: the baseline the new measures are taken of, against the same add-on) */
const REMOVAL = typeof arg('removal') === 'string' ? arg('removal') : null
if (REMOVAL && !['draw', 'measure'].includes(REMOVAL)) throw new Error(`--removal=${REMOVAL}: draw or measure`)
/** --proto-params=<json>: v0's fit parameters over its defaults (layer2.mjs defaultParams), recorded with the run */
const PROTO_PARAMS = typeof arg('proto-params') === 'string' ? JSON.parse(arg('proto-params')) : null
const PROTO_PANELS = typeof arg('proto-panels') === 'string' ? resolve(arg('proto-panels')) : null
/** --proto-place=<file>: the place, by fixture and page, the prototype's own page gave each page's text (its .pg box,
 *  CSS px: { [fixture]: { [page]: [x, y] } }), which its floor was measured at; --dump=<dir>: v0's records, audit and
 *  page digests per fixture, to compare with the live prototype's */
const PROTO_PLACE = typeof arg('proto-place') === 'string' ? JSON.parse(readFileSync(resolve(arg('proto-place')), 'utf8')) : null
const DUMP = typeof arg('dump') === 'string' ? resolve(arg('dump')) : null
/** --ruling=<file>: the maintainer's ruling the record is made under (with --record) */
const RULING = typeof arg('ruling') === 'string' ? JSON.parse(readFileSync(resolve(arg('ruling')), 'utf8')) : null
/** --proto-order=<file>: an order to lay each fixture's units in, by page ({ [fixture]: [ids] }: a live run's, where its
 *  race between drawing and streaming went another way) */
const PROTO_ORDER = typeof arg('proto-order') === 'string' ? JSON.parse(readFileSync(resolve(arg('proto-order')), 'utf8')) : null
const REFS = resolve(process.env.LAYER_REFS ?? join(DATA, 'layer-fixtures'))
/** whose layout files the layer is given: the engine's own maker's (made), or the fixtures' as they were made (fixed) */
const GIVEN = typeof arg('fixtures') === 'string' ? arg('fixtures') : process.env.LAYER_FIXTURES ?? null
/** --records=<dir> (or LAYER_RECORDS): the translation (record.json, units.json) from another folder of the fixtures'
 *  layout, the layout files still made or given as --layouts says: spikes/table-groups.mjs --write's decided records
 *  (each cell's group, the captions) measured over the engine's own maker's layout files */
const RECORDS = typeof arg('records') === 'string' ? resolve(arg('records')) : process.env.LAYER_RECORDS ? resolve(process.env.LAYER_RECORDS) : null
/** a fixture's translation file: the --records folder's, else the fixtures' */
const trFile = (dir, file) => join(RECORDS ?? FIXTURES, dir, file)
/** an engine before Task 6 has no layout maker: its layer is given the fixtures' own layout files */
const HAS_MAKER = existsSync(join(ENGINE, 'src/pdf-reader/engine/layout/make.mjs'))
// v0 is given no layout file: the fixtures' own serve the instrument (the kept renderings), as they served the parity run's.
// The hybrid (--proto-tex) reads one, the engine's own maker's by default (made), as the layer does: a change of the maker
// is measured end to end through the hybrid too. The instrument stays the fixtures' own layout files either way
const LAYOUTS = GIVEN ? 'given' : PROTO && !TEX ? 'fixed' : arg('layouts') ?? (HAS_MAKER ? 'made' : 'fixed')
if ((!PROTO || TEX) && !GIVEN && !arg('layouts') && !HAS_MAKER) console.log('the engine has no layout maker (layout/make.mjs): its layer is given the fixtures\' own layout files (--layouts=fixed)')
/** the record's entry this run is: its tier, and the layout files it was given where they are not the engine's own */
const KEY = PROTO ? `${TIER}-proto${PROTO_UNITS === 'p7' ? '-p7' : ''}${PROTO_FACES === 'prototype' ? '-pf' : ''}${TEX_KEY}${REMOVAL ? `-removal-${REMOVAL}` : ''}` : LAYOUTS === 'made' ? TIER : `${TIER}-${LAYOUTS}`
if (REMOVAL && !PROTO) throw new Error('--removal: v0 only (--engine-kind=proto)')
if (!['made', 'fixed', 'given'].includes(LAYOUTS)) throw new Error(`--layouts=${LAYOUTS}: made or fixed`)
const MAKER = join(here, 'layer-fixtures.mjs')
/**
 * Whether the maker asks TeX for the paper's own switch (layer-fixtures.mjs --switch): where the engine's marks file
 * carries it (marks.mjs MARKS_SCHEMA 2 or more), so that its maker re-marks as the compile was marked; GATE_SWITCH=1 or 0
 * says otherwise. At Task 12's tip the maker re-marks without it, and the switch stays off
 */
const SWITCH = process.env.GATE_SWITCH ? process.env.GATE_SWITCH !== '0' : LAYOUTS === 'made' && HAS_MAKER && ((await import(join(ENGINE, 'src/pdf-reader/engine/layout/marks.mjs'))).MARKS_SCHEMA ?? 0) >= 2
const FONTS = resolve(join(DATA, 'fonts'))
const PDFJS = resolve(REPO, 'node_modules/pdfjs-dist')
const GATE = join(here, 'layer-gate')
const CHECKER = join(REPO, 'src/pdf-reader/engine/layer/check.mjs')
const PROGRESS = process.env.LAYER_PROGRESS ?? '/Users/cheongzhiyan/Downloads/readarxiv-test/layer-progress'
const ONLY = typeof arg('only') === 'string' ? arg('only').split(',').filter(Boolean) : null
const PAGES = typeof arg('pages') === 'string' ? Number(arg('pages')) : null
const WORKERS = PERF ? 1 : typeof arg('workers') === 'string' ? Number(arg('workers')) : Math.max(1, Math.min(6, Math.floor(availableParallelism() / 2)))
/** crops darkened in (the prototype's drawing, and the reader's since the layer round's fixes), or pasted source-over */
const COMPOSITE = arg('composite') ?? 'darken'
if (!['source-over', 'darken'].includes(COMPOSITE)) throw new Error(`--composite=${COMPOSITE}: source-over or darken`)
const FREEZE = arg('freeze')
/** --ref-layouts=<dir>,…: with --freeze=force, folders of fixtures a later maker made (out/layer-gate/fixtures/<key>),
 *  whose layout files the refreshed reference takes first */
const REF_LAYOUTS = typeof arg('ref-layouts') === 'string' ? arg('ref-layouts').split(',').filter(Boolean).map(d => resolve(d)) : []
/** TeX's files the prototype's host read from TinyTeX: Latin Modern's faces, the hyphenation patterns */
const TEXMF = process.env.TEXMF_DIST ?? join(process.env.HOME ?? '', 'Library/TinyTeX/texmf-dist')
/** the progress folder's run whose engine panels stand beside this one's (openProgress sets it) */
let PREVIOUS_DIR = null
/** --debug-lost=<fixture>:<page>: that page's lost-ink regions written as images (out/layer-gate/lost/) */
const DEBUG_LOST = arg('debug-lost')
/** the brief's exact values: 12 pages an output, every page of the thesis */
const PAGES_OF = 12, ALL_PAGES = new Set(['2307.16209v1'])
/** the progress images' pages (the controller's set) and their width */
const PANELS_SET = { '1512.03385v1-zh': [1, 2, 3], '1706.03762v7-ja': [1, 2], '2608.04322v1-de': [2], '1810.04805v2-ru': [2], '2307.16209v1-zh': [10] }
/** --panel-pages=<fixture>:<p>,<p>;<fixture>:<p>: the progress images' pages in place of the controller's set (a look at others) */
const PANELS = typeof arg('panel-pages') === 'string' ? Object.fromEntries(arg('panel-pages').split(';').filter(Boolean).map(x => { const [fx, ps] = x.split(':'); return [fx, ps.split(',').map(Number)] })) : process.env.GATE_PANELS ? JSON.parse(process.env.GATE_PANELS) : PANELS_SET
/** each panel's width in the progress images' 2 x 2 grid (the controller's: about 1,000 px) */
const PANEL_WIDTH = Number(arg('panel-width') ?? 1000), GAP = 12

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
    writeFileSync(file, refBytesOf(join(REFS, name), name, undefined, REF_LAYOUTS))
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
/** the prototype's own staging output of a fixture (its units file beside its geometry), or null */
const protoUnitsOf = name => { const { paper, target } = nameOf(name); const f = join(PROTO_GEOMETRY, `${paper}-${target}-units.json`); return existsSync(f) ? f : null }
/** v0's hyphenation patterns, read from TeX's files by the engine's own reading (layer-proto/hyph.mjs), once */
const HYPH = new Map()
if (PROTO) {
  const { patternsOfTex, TEX_PATTERN_FILES } = await import(join(ENGINE, 'src/pdf-reader/engine/layer-proto/hyph.mjs'))
  for (const [lang, rel] of Object.entries(TEX_PATTERN_FILES)) if (existsSync(join(TEXMF, rel))) HYPH.set(lang, JSON.stringify(patternsOfTex(readFileSync(join(TEXMF, rel), 'latin1'))))
}
function fileFor(path) {
  if (path.startsWith('/gate/')) return ['page.html', 'page.mjs', 'proto.mjs', 'measure.mjs'].includes(path.slice(6)) ? join(GATE, path.slice(6)) : null
  if (path.startsWith('/proto-fonts/')) return /^\/proto-fonts\/lm(?:roman|sans|mono)10-[a-z]+\.otf$/.test(path) ? join(TEXMF, 'fonts/opentype/public/lm', path.slice(13)) : null
  if (path === '/engine/layer/check.mjs') return CHECKER
  if (path.startsWith('/engine/')) return /\.(m?js|json)$/.test(path) ? under(join(ENGINE, 'src/pdf-reader/engine'), path.slice(8)) : null
  if (path.startsWith('/pdfjs/')) return /^\/pdfjs\/(build|cmaps|standard_fonts|wasm|iccs)\//.test(path) ? under(PDFJS, path.slice(7)) : null
  if (path.startsWith('/fonts/')) return /^\/fonts\/[A-Za-z0-9._-]+\.(otf|ttf)$/.test(path) ? under(FONTS, path.slice(7)) : null
  if (path.startsWith('/fixtures/')) {
    const [dir, file, ...rest] = path.slice(10).split('/')
    if (rest.length || !fixtures.includes(dir)) return null
    if (file === 'units.json') return trFile(dir, file)
    if (['arxiv.pdf', 'layout.json'].includes(file)) return join(FIXTURES, dir, file)
    // v0's inputs: the made output's geometry (the prototype's, by paper), the fixture's record (its units file), the
    // prototype's own units file
    if (PROTO && file === 'geometry.json') return geometryFile(dir)
    // the instrument's layout file (its kept renderings): the fixture's own, whichever the hybrid is given
    if (PROTO && file === 'kept-layout.json') return join(REFS, dir, 'layout.json')
    if (PROTO && file === 'record.json') return trFile(dir, 'record.json')
    if (PROTO && file === 'units-p7.json') return protoUnitsOf(dir)
    return null
  }
  if (path.startsWith('/removal/')) { const m = /^\/removal\/([A-Za-z0-9._-]+)\.pdf$/.exec(path); return m ? ADDONS.get(m[1]) ?? null : null }
  if (path.startsWith('/proto/')) { const m = /^\/proto\/([A-Za-z0-9._-]+)\/p(\d+)\.png$/.exec(path); return m && fixtures.includes(m[1]) ? (PROTO_PANELS ? join(PROTO_PANELS, `${m[1]}-p${m[2]}.png`) : join(REFS, m[1], 'proto', `p${m[2]}.png`)) : null }
  if (path.startsWith('/progress/')) { const m = /^\/progress\/([0-9]{2}-[a-z0-9-]+)\/engine\/([A-Za-z0-9._-]+\.png)$/.exec(path); return m ? join(PROGRESS, m[1], 'engine', m[2]) : null }
  if (path.startsWith('/previous/')) { const m = /^\/previous\/([A-Za-z0-9._-]+\.png)$/.exec(path); return m && PREVIOUS_DIR ? join(PREVIOUS_DIR, 'engine', m[1]) : null }
  return null
}
/** each fixture's arXiv PDF with its add-on (--removal), as made or cached: fixture -> file */
const ADDONS = new Map()
const server = createServer((req, res) => {
  let path
  try { path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname) } catch { res.writeHead(400); return res.end() }
  const hy = /^\/hyph\/([a-z]+)\.json$/.exec(path)
  if (PROTO && hy) {
    if (!HYPH.has(hy[1])) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found') }
    res.writeHead(200, { 'content-type': TYPES['.json'], 'cache-control': 'no-store' })
    return res.end(HYPH.get(hy[1]))
  }
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
  layouts: LAYOUTS, ...(LAYOUTS === 'made' ? { switch: SWITCH } : {}), fixtures: FIXTURES === REFS ? 'data/layer-fixtures' : FIXTURES.startsWith(ROOT) ? FIXTURES.slice(ROOT.length + 1) : FIXTURES, ...(RECORDS ? { records: RECORDS.startsWith(ROOT) ? RECORDS.slice(ROOT.length + 1) : RECORDS } : {}), chromium: browser.version(),
  pdfjs: readJson(join(PDFJS, 'package.json')).version, fonts: fontsDigest.slice(0, 16), checker: fileSha(CHECKER).slice(0, 16),
  // the instrument: the measures, their arithmetic, and the page that draws and accounts (lost ink's own glyphs)
  measures: sha256(['measure.mjs', 'score.mjs', PROTO ? 'proto.mjs' : 'page.mjs'].map(f => readFileSync(join(GATE, f))).join('\n')).slice(0, 16),
  ...(PROTO ? { kind: 'proto', protoUnits: PROTO_UNITS, place: PROTO_PLACE ? 'the prototype page\'s' : 'the gate\'s', order: PROTO_ORDER ? 'given' : 'layGroups', faces: PROTO_FACES ?? 'the engine\'s default', tex: TEX ? JSON.stringify(TEX) : 'none', params: PROTO_PARAMS ? JSON.stringify(PROTO_PARAMS) : 'none', hyphenation: sha256([...HYPH].map(([l, j]) => `${l}:${j}`).join('\n')).slice(0, 16), removal: REMOVAL ?? 'none', ...(REMOVAL ? { remover: removerDigest() } : {}) } : {}),
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
  // (the JS heap, as Chromium counts it, for --perf)
  const cdp = PERF ? await ctx.newCDPSession(page) : null
  if (cdp) await cdp.send('Performance.enable')
  page.cdp = cdp
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
  await page.goto(`${ORIGIN}/gate/page.html${PROTO ? '?kind=proto' : ''}`)
  await page.waitForFunction(() => window.gateReady === true)
  const meta = { ref: fileSha(refFile).slice(0, 16), layout: fileSha(join(FIXTURES, name, 'layout.json')).slice(0, 16), units: fileSha(trFile(name, 'units.json')).slice(0, 16) }
  if (PROTO) {
    const g = geometryFile(name), u = PROTO_UNITS === 'p7' ? protoUnitsOf(name) : trFile(name, 'record.json')
    if (!g || !u || !existsSync(u)) { failures.push(name); return { name, ready: false, why: !g ? 'no geometry for v0' : `no ${PROTO_UNITS === 'p7' ? "prototype's units file" : 'record.json'}`, meta } }
    Object.assign(meta, { geometry: fileSha(g).slice(0, 16), protoUnits: fileSha(u).slice(0, 16) })
  }
  // the text-removed PDF: the paper's add-on, made from its layout file alone (or cached), checked, and v0 opened over it
  const removal = REMOVAL ? await addonOf(name) : null
  if (removal) Object.assign(meta, { addon: removal.key })
  // (--perf: what a reader is sent, the R set and its manifest, no plan)
  const addon = removal ? (PERF ? { url: `/removal/${name}.pdf`, manifest: removal.shippedManifest, plan: null } : { url: `/removal/${name}.pdf`, manifest: removal.manifest, plan: removal.plan }) : null
  const info = await page.evaluate(o => window.gate.open(o), { name, target, ref: refPages(ref), composite: COMPOSITE, units: PROTO_UNITS, pages: PAGES ?? (ALL_PAGES.has(paper) ? 100000 : PAGES_OF), place: PROTO_PLACE?.[name] ?? null, dump: !!DUMP, order: PROTO_ORDER?.[name] ?? null, faces: PROTO_FACES, tex: TEX, params: PROTO_PARAMS, names: captionNames(target), removal: REMOVAL, addon, perf: PERF })
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
    if (removal) model.removalCheck = removal.check[p] ?? null
    const { entry, frames: f } = pageEntry(p, model, pixel)
    entry.ms = Math.round(model.ms)
    if (PERF) {
      entry.perf = await page.evaluate(q => window.gate.perf(q), p)
      // (the heap live at the page's end, collected first: what is held, not the garbage a collection had not reached yet,
      // which moved the peak by 80 MB from run to run)
      try { await page.cdp.send('HeapProfiler.collectGarbage') } catch {}
      const m = await page.cdp.send('Performance.getMetrics')
      entry.perf.jsHeap = m.metrics.find(x => x.name === 'JSHeapUsedSize')?.value ?? null
    }
    pages.push(entry)
    frames.push(f)
  }
  const summary = await page.evaluate(() => window.gate.summary())
  if (PROTO && DUMP) { mkdirSync(DUMP, { recursive: true }); writeFileSync(join(DUMP, `${name}.json`), JSON.stringify(await page.evaluate(() => window.gate.dump()))) }
  if (errors.length) summary.pageErrors = errors.splice(0).slice(0, 5)
  if (summary.inputsChanged) { failures.push(name); console.log(`FAIL ${name}: v0 changed its inputs (the geometry or the units) as it drew`) }
  if (removal) {
    summary.removal = { ...removal.summary, draw: await page.evaluate(() => window.gate.removalStats()) }
    // the exactness check's pixels (PDF.js in Node, which draws a page alike every time), each page's
    if (TIER === 'pixel') {
      const px = await removal.pixels
      for (const e of pages) { const r = px.pages[e.p]; if (r) Object.assign(e, { rmOutside: r.outside, rmDiffering: r.differing, ...(r.at ? { rmOutsideAt: r.at } : {}) }) }
      summary.removal.pixelMs = px.ms
    }
  }
  return { name, ready: true, info, meta, pages, totals: fixtureTotals(pages, frames, TIER), summary }
}

/** the remover's files, digested: a change of them makes every add-on again (the plan's, removal.mjs pagePlan, too) */
function removerDigest() {
  return sha256(['src/pdf-reader/engine/layout/remove.mjs', 'src/pdf-reader/engine/layout/ink.mjs', 'src/pdf-reader/engine/layout/file.mjs', 'src/pdf-reader/engine/layer-proto/removal.mjs'].map(f => readFileSync(join(ENGINE, f))).join('\n')).slice(0, 16)
}

/**
 * A paper's add-on (--removal), one a paper whatever the target: its plan made from the paper's layout file alone
 * (layer-proto/removal.mjs pagePlan over each page's ink as Node's PDF.js reads it, every glyph its outline's box), made
 * by the engine's remover over arXiv's PDF with the check's page sets (F, the removed glyphs alone; C, the crops'
 * placeholders coloured), checked page by page by PDF.js's own reading (layout/remove.mjs checkPage); the manifest
 * carries the paper's outline table (layout/ink.mjs outlineTable), so that the browser's reading owns as this one does.
 * Cached in out/layer-gate/removal/ by arXiv's bytes, the layout file and the remover, and once a run for the paper's
 * outputs. Returns { key, manifest, plan, check, summary, pixels }, and serves the PDF with it.
 */
const ADDON_RUNS = new Map()
function addonOf(name) {
  const pdfFile = join(FIXTURES, name, 'arxiv.pdf'), layoutFile = join(FIXTURES, name, 'layout.json')
  const bytes = new Uint8Array(readFileSync(pdfFile))
  const key = sha256([sha256(bytes), fileSha(layoutFile), removerDigest()].join('|')).slice(0, 24)
  if (!ADDON_RUNS.has(key)) ADDON_RUNS.set(key, makeAddonOf(key, bytes, layoutFile))
  return ADDON_RUNS.get(key).then(a => { ADDONS.set(name, PERF ? a.shippedFile : a.file); return a })
}
/**
 * The paper's add-on made in memory (the server's step, after the layout maker): its plan from the layout file, the
 * add-on (`shipped`: R and P; `out`: with the check's sets too, where `check`), the outline table; and each step's time,
 * ms: the remover's parse of arXiv's PDF, the operator lists (the maker reads them already: shared), the ink walk with
 * the remover's indices and outlines, the plan, the add-on made
 */
async function buildAddon(bytes, layoutFile, { check = true } = {}) {
  const { openRemover, makeAddon, SETS, CHECK_SETS } = await import(join(ENGINE, 'src/pdf-reader/engine/layout/remove.mjs'))
  const { pageInk, outlineTable } = await import(join(ENGINE, 'src/pdf-reader/engine/layout/ink.mjs'))
  const { indexLayout, parseLayout } = await import(join(ENGINE, 'src/pdf-reader/engine/layout/file.mjs'))
  const { pagePlan, pageDirty } = await import(join(ENGINE, 'src/pdf-reader/engine/layer-proto/removal.mjs'))
  const PL = await import('@cantoo/pdf-lib')
  const { OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { deflateSync } = await import('node:zlib')
  const ms = {}
  let t = performance.now()
  const R = await openRemover(bytes, { PL, inflate: inflateTolerant })
  ms.parse = performance.now() - t
  const doc = await openNode(bytes)
  const ops = [], inks = [], collected = new Map()
  // (the operator lists the layout maker reads already: the server's prepare reads them once for both)
  t = performance.now()
  for (let p = 1; p <= doc.numPages; p++) { const pg = await doc.getPage(p); ops[p] = await pg.getOperatorList() }
  ms.ops = performance.now() - t
  t = performance.now()
  for (let p = 1; p <= doc.numPages; p++) { const pg = await doc.getPage(p); inks[p] = pageInk(OPS, ops[p], pg.commonObjs, { rotate: pg.rotate, indices: true, collect: collected }) }
  ms.ink = performance.now() - t
  // the plan: every unit the layout file holds, page by page
  t = performance.now()
  const index = indexLayout(parseLayout(new Uint8Array(readFileSync(layoutFile))))
  const plan = { pages: {} }
  for (let p = 1; p <= doc.numPages; p++) {
    if (inks[p].rotated || inks[p].capped) continue
    const { own: _own, ...pp } = pagePlan(index, p, inks[p])
    if (pp.units.length) plan.pages[p] = pp
  }
  ms.plan = performance.now() - t
  const outlines = outlineTable(collected)
  // the shipped add-on, and the time it takes: each page's kept ink under its units' rectangles (pageDirty, the
  // manifest's `dirty`: where the reader swaps the removed page in), and the removed page, R, only where there is some.
  // A page with none is filled with paper over the file's rectangles alone: it needs no removed page, only the
  // manifest's word that the page is drawn so (ok, no dirty)
  t = performance.now()
  const dirty = {}
  for (const [p, pp] of Object.entries(plan.pages)) { const d = pageDirty(index, Number(p), inks[p], pp); if (d.length) dirty[p] = d }
  const swapped = { pages: Object.fromEntries(Object.entries(plan.pages).filter(([p]) => dirty[p])) }
  const shipped = await makeAddon({ R, bytes, OPS, opListOf: async p => ops[p], deflate: b => new Uint8Array(deflateSync(b)), plan: swapped, sets: SETS, compact: true })
  for (const [p, d] of Object.entries(dirty)) if (shipped.manifest.page[p]?.ok) shipped.manifest.page[p].dirty = d
  for (const p of Object.keys(plan.pages)) if (!dirty[p]) shipped.manifest.page[p] = { ok: true }
  ms.make = performance.now() - t
  let out = null
  if (check) {
    t = performance.now()
    out = await makeAddon({ R: await openRemover(bytes, { PL, inflate: inflateTolerant }), bytes, OPS, opListOf: async p => ops[p], deflate: b => new Uint8Array(deflateSync(b)), plan, sets: [...SETS, ...CHECK_SETS] })
    ms.makeWithCheck = performance.now() - t
    // (the check's manifest: the gate's own reading of the page's ink boxes each glyph by the outline table, as Node does)
    out.manifest.outlines = outlines
    for (const [p, d] of Object.entries(dirty)) if (out.manifest.page[p]?.ok) out.manifest.page[p].dirty = d
    // (the pages drawn by the add-on are the check's, every set of it made: the truth reads its planes)
    for (const p of Object.keys(plan.pages)) if (!out.manifest.page[p]?.ok) shipped.manifest.page[p] = { ok: false, refused: out.manifest.page[p]?.refused ?? 'refused' }
  }
  return { doc, inks, plan, shipped, out, collected, ms }
}
const inflateTolerant = b => { try { return new Uint8Array(inflateSync(b, { finishFlush: zlibConstants.Z_SYNC_FLUSH })) } catch { return new Uint8Array(inflateRawSync(b.subarray(2), { finishFlush: zlibConstants.Z_SYNC_FLUSH })) } }
const openNode = async data => (await import('pdfjs-dist/legacy/build/pdf.mjs')).getDocument({ data: data.slice(), verbosity: 0, cMapUrl: `${PDFJS}/cmaps/`, cMapPacked: true, standardFontDataUrl: `${PDFJS}/standard_fonts/`, useSystemFonts: false }).promise

async function makeAddonOf(key, bytes, layoutFile) {
  const dir = join(ROOT, 'out/layer-gate/removal', key)
  const file = join(dir, 'combined.pdf'), shippedFile = join(dir, 'shipped.pdf')
  if (!existsSync(join(dir, 'done.json')) || !existsSync(shippedFile)) {
    mkdirSync(dir, { recursive: true })
    const { checkPage } = await import(join(ENGINE, 'src/pdf-reader/engine/layout/remove.mjs'))
    const { pageInk } = await import(join(ENGINE, 'src/pdf-reader/engine/layout/ink.mjs'))
    const { OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const { doc, inks, plan, shipped, out, collected, ms } = await buildAddon(bytes, layoutFile)
    // the check: each removed page against the original, by PDF.js's reading of the new file
    const t = performance.now()
    const comb = await openNode(out.bytes)
    const check = {}, N = doc.numPages
    const inkAt = async q => { const pg = await comb.getPage(q); return pageInk(OPS, await pg.getOperatorList(), pg.commonObjs, { rotate: pg.rotate, indices: true }) }
    for (let p = 1; p <= N; p++) if (out.manifest.page[p]?.ok) check[p] = checkPage({ orig: inks[p], removed: await inkAt(out.manifest.sets.R + p), kept: await inkAt(out.manifest.sets.P + p), entry: plan.pages[p] })
    ms.check = performance.now() - t
    for (const d of [doc, comb]) { try { await d.loadingTask.destroy() } catch {} }
    writeFileSync(file, out.bytes)
    // (and what a reader is sent: arXiv's PDF with the R set alone, and its manifest; --perf opens these)
    writeFileSync(shippedFile, shipped.bytes)
    const shippedManifest = JSON.stringify(shipped.manifest)
    writeFileSync(join(dir, 'shipped-manifest.json'), shippedManifest)
    const summary = {
      pages: N, planned: Object.keys(plan.pages).length, removed: Object.values(out.manifest.page).filter(x => x.ok).length, refused: Object.entries(out.manifest.page).filter(([, x]) => !x.ok && x.refused !== 'not planned').map(([p, x]) => [Number(p), x.refused]),
      appended: shipped.appended, appendedWithCheck: out.appended, manifestBytes: shippedManifest.length, manifestGzip: gzipSync(shippedManifest).length, outlines: collected.size,
      stats: shipped.manifest.stats, ms: Object.fromEntries(Object.entries(ms).map(([k, v]) => [k, Math.round(v)])),
    }
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(out.manifest))
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan))
    writeFileSync(join(dir, 'check.json'), JSON.stringify(check))
    writeFileSync(join(dir, 'done.json'), JSON.stringify(summary))
  }
  // the pixels' check, made beside the run (a process of its own) once for the add-on
  const pxFile = join(dir, 'pixels.json')
  const pixels = TIER !== 'pixel' ? null : existsSync(pxFile) ? Promise.resolve(readJson(pxFile)) : new Promise((ok, fail) => {
    execFile(process.execPath, [join(GATE, 'removal-pixels.mjs'), file, join(dir, 'manifest.json'), pxFile], { maxBuffer: 1 << 24 }, e => (e ? fail(e) : ok(readJson(pxFile))))
  })
  return { key, file, shippedFile, manifest: readJson(join(dir, 'manifest.json')), shippedManifest: readJson(join(dir, 'shipped-manifest.json')), plan: readJson(join(dir, 'plan.json')), check: readJson(join(dir, 'check.json')), summary: readJson(join(dir, 'done.json')), pixels }
}

/**
 * A paper's server costs (--perf), measured afresh: the layout maker's time and its operator lists' (the engine's own
 * maker, layer-fixtures.mjs into a folder of its own, its compile kept from before: nothing is compiled), the remover's
 * beyond those lists (with --removal: buildAddon's parse, ink walk, plan and make), and the bytes the reader is sent
 * (the layout file, the add-on's appended bytes, its manifest), each raw and gzipped where it is sent so
 */
async function serverPerf(name) {
  const { paper, target } = nameOf(name)
  const dir = join(ROOT, 'out/layer-gate/perf-make', `${process.pid}-${name}`)
  mkdirSync(dir, { recursive: true })
  let maker = null, out = ''
  try {
    out = execFileSync(join(REPO, 'node_modules/.bin/tsx'), [MAKER, '--offline', ...(SWITCH ? ['--switch'] : []), `--engine=${ENGINE}`, `--only=${paper}:${target}`], { env: { ...process.env, LAYER_FIXTURES: dir }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch (e) { out = String(e?.stdout ?? '') }
  // (the maker times itself before the output's translation is looked for: an output whose cut the fixtures hold no
  // translation of, offline, still has its layout file made and timed)
  const m = /maker (\d+) ms, its operator lists (\d+) ms/.exec(out)
  if (m) maker = { ms: Number(m[1]), opsMs: Number(m[2]) }
  // the layout file the server sends: this maker's own, where it made one, else the fixtures'
  const made = join(dir, name, 'layout.json')
  const layoutFile = existsSync(made) ? made : join(FIXTURES, name, 'layout.json')
  const layoutBytes = statSync(layoutFile).size, layoutGzip = gzipSync(readFileSync(layoutFile)).length
  let remover = null, addonBytes = 0, manifestGzip = 0
  if (REMOVAL) {
    const built = await buildAddon(new Uint8Array(readFileSync(join(FIXTURES, name, 'arxiv.pdf'))), layoutFile, { check: false })
    try { await built.doc.loadingTask.destroy() } catch {}
    remover = Object.fromEntries(Object.entries(built.ms).map(([k, v]) => [k, Math.round(v)]))
    addonBytes = built.shipped.appended
    manifestGzip = gzipSync(JSON.stringify(built.shipped.manifest)).length
  }
  rmSync(dir, { recursive: true, force: true })
  return { maker, remover, layoutBytes, layoutGzip, addonBytes, manifestGzip, download: layoutGzip + addonBytes + manifestGzip, layoutOf: layoutFile === made ? 'made' : 'fixtures' }
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
  gate: { commit: git(REPO, ['rev-parse', 'HEAD']), dirty: !!git(REPO, ['status', '--porcelain', '--untracked-files=no', '--', 'experiments/pdf-bilingual/spikes/layer-gate', 'experiments/pdf-bilingual/spikes/layer-gate.mjs', 'src/pdf-reader/engine/layer/check.mjs', ':(exclude)experiments/pdf-bilingual/spikes/layer-gate/floor.json']) },
  engine: engineInfo, inputs,
  totals: { all: pooled(ran.map(r => r.totals), TIER), shared: pooled(ran.filter(r => floor.shared.includes(r.name)).map(r => r.totals), TIER) },
  fixtures: Object.fromEntries(ran.map(r => [r.name, { meta: r.meta, info: { pages: r.info.pages, units: r.info.units, located: r.info.located, even: r.info.even, family: r.info.family }, summary: r.summary, totals: r.totals, pages: r.pages.map(compact) }])),
  failed: [...results.values()].filter(r => !r.ready).map(r => ({ name: r.name, why: r.why })),
}
// the server's costs, a paper each (--perf): its first output's
if (PERF) {
  run.perf = { server: {} }
  for (const name of ran.map(r => r.name)) { const { paper } = nameOf(name); if (!run.perf.server[paper]) run.perf.server[paper] = await serverPerf(name) }
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
console.log(`completeness (spec §5): ${bad.length ? `${bad.length} of ${completeness.length} outputs fail: ${bad.map(c => `${c.name} [${c.fails.join(', ')}]`).join('; ')}` : `every one of ${completeness.length} outputs passes`}${bad.length && arg('check') ? ' (under --check the merge rule decides: each check is a measure of it)' : ''}`)
// the completeness gate exits 1 on its own; under --check its counts are measures of the merge rule, which a change that
// leaves them where the record has them passes
if (bad.length && !arg('check')) exit = 1

const recordAt = typeof arg('record') === 'string' ? resolve(arg('record')) : join(existsSync(recordDir(ENGINE)) ? recordDir(ENGINE) : recordDir(REPO), 'layer-fidelity.json')
const checkAt = typeof arg('check') === 'string' ? resolve(arg('check')) : [join(recordDir(ENGINE), 'layer-fidelity.json'), join(recordDir(REPO), 'layer-fidelity.json')].find(existsSync)
let verdict = null
if (arg('check')) {
  if (!checkAt || !existsSync(checkAt)) { console.log('FAIL --check: no record to check against'); exit = 1 }
  else {
    const record = readJson(checkAt)
    // the recorded run of the same tier and layouts; a model run is checked against a pixel run's model measures too
    const want = AGAINST ?? KEY
    const last = record.tiers[want] ?? (TIER === 'model' ? record.tiers[want.replace(/^model/, 'pixel')] : null)
    if (!last) { console.log(`FAIL --check: ${checkAt} holds no ${want} run (it holds ${Object.keys(record.tiers).join(', ')})`); exit = 1 }
    else {
      verdict = checkAgainst(last, run)
      if (verdict.failed) exit = 1
    }
  }
}
if (arg('record')) {
  if (PROTO_PLACE || PROTO_ORDER) { console.log('FAIL --record: --proto-place and --proto-order are comparisons with the live prototype, never a record'); exit = 1 }
  else if (ONLY || PAGES) { console.log('FAIL --record: a whole run only (no --only, no --pages)'); exit = 1 }
  else writeRecords(recordAt, run, completeness)
}
if (arg('write-floor')) {
  // the prototype's floor as this gate measures it: v0 under the floor's conditions (the prototype's own staging units
  // and faces) at the gate's own text place, the ten shared outputs, every page asked of them
  const shared = floor.shared ?? []
  const why = !PROTO ? 'not v0 (--engine-kind=proto)' : PROTO_UNITS !== 'p7' ? 'not its own units (--proto-units=p7)' : PROTO_FACES !== 'prototype' ? 'not its own faces (--proto-faces=prototype)' : PROTO_PLACE || PROTO_ORDER ? 'not at the gate\'s place and order' : TIER !== 'pixel' ? 'not the pixel tier' : PAGES ? 'not every page asked' : shared.some(n => !run.fixtures[n]) ? `not every shared output (${shared.filter(n => !run.fixtures[n]).join(' ')})` : null
  if (why) { console.log(`FAIL --write-floor: ${why}`); exit = 1 }
  else writeFloor(run, shared)
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
  // the layer's own modules make no layout (but the pieces, which the translation's units are read with), nor do v0's
  const used = files.filter(f => !(f.startsWith(join(engineDir, 'layer') + sep) || f.startsWith(join(engineDir, 'layer-proto') + sep)) || f.endsWith(`${sep}layer${sep}pieces.mjs`))
  const key = sha256([MAKER, ...used].map(f => `${f.slice(ENGINE.length)}\n`).join('') + [MAKER, ...used].map(f => fileSha(f)).join('\n') + (SWITCH ? '|switch' : '')).slice(0, 16)
  const dir = join(ROOT, 'out/layer-gate/fixtures', key)
  const want = readdirSync(REFS).filter(n => /^[A-Za-z0-9._-]+v\d+-[A-Za-z-]+$/.test(n) && existsSync(join(REFS, n, 'layout.json'))).filter(n => !ONLY || ONLY.includes(n))
  const missing = want.filter(n => !existsSync(join(dir, n, 'units.json')) || !(existsSync(join(dir, n, 'layout.json')) || existsSync(join(dir, n, 'refusal.json'))))
  if (missing.length) {
    console.log(`making ${missing.length} output${missing.length === 1 ? '' : 's'}' layouts with the engine at ${ENGINE === REPO ? 'this tree' : ENGINE} (${key})`)
    const t = Date.now()
    try {
      execFileSync(join(REPO, 'node_modules/.bin/tsx'), [MAKER, '--offline', ...(SWITCH ? ['--switch'] : []), `--engine=${ENGINE}`, `--only=${missing.map(n => { const { paper, target } = nameOf(n); return `${paper}:${target}` }).join(',')}`], { env: { ...process.env, LAYER_FIXTURES: dir }, stdio: ['ignore', 'inherit', 'inherit'] })
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
    // (the consistency checks, the table-groups brief: a table group drawn partly, a label the final names left in the
    // source language; each must be 0)
    const row = { name, pages: t.pages, missing: t.missing ?? 0, twice: t.twice ?? 0, brackets: t.brackets ?? 0, duplicated: t.duplicated ?? 0, numbers: [t.numbersShown, t.numbersTotal], clipped: t.clipped ?? 0, groupsSplit: t.groupsSplit ?? 0, labelsSource: t.labelsSource ?? 0 }
    if (TIER === 'pixel') row.lostInk = t.lostInk ?? 0
    row.fails = ['lostInk', 'missing', 'twice', 'brackets', 'duplicated', 'clipped', 'groupsSplit', 'labelsSource'].filter(k => row[k] > 0)
    if (t.numbersShown < t.numbersTotal) row.fails.push('numbers')
    return row
  })
}

/** the merge rule against a recorded run: the inputs first (a reference or a scale changed is no comparison), then
 *  every measure of every fixture, then the pages */
function checkAgainst(last, run) {
  const out = { failed: false, lines: [] }
  const say = s => { out.lines.push(s); console.log(s) }
  for (const k of ['layouts', 'scale', 'inkScale', 'inkMin', 'composite', 'pages', 'checker', 'measures', 'kind', 'protoUnits', 'place', 'order', 'hyphenation', ...(AGAINST ? [] : ['tex', 'removal'])].filter(k => !(AGAINST && PROTO && k === 'layouts'))) if (String(last.inputs[k] ?? (k === 'tex' || k === 'removal' ? 'none' : undefined)) !== String(run.inputs[k] ?? (k === 'tex' || k === 'removal' ? 'none' : undefined))) { say(`FAIL --check: the record's ${k} is ${last.inputs[k]}, this run's ${run.inputs[k]}: not comparable`); out.failed = true }
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
  // the maintainer's rulings the records were made under, each with the run it was given on, every earlier one kept
  const rulings = [...(had?.rulings ?? []), ...(RULING ? [{ ...RULING, record: KEY, commit: run.engine.commit?.slice(0, 8) ?? null }] : [])]
  const record = { schema: 1, what: 'the instant layer against the original page, per fixture and page (spikes/layer-gate.mjs)', floor: { what: floor.what, measured: floor.measured ?? null, shared: floor.shared, pooled: floor.pooled, byFixture: floor.byFixture, old: floor.old ?? null, history: floor.history ?? null }, tiers, ...(rulings.length ? { rulings } : {}) }
  // (ASCII throughout: a quoted ruling's words as \u escapes, as the English gate asks of a developer's file)
  writeFileSync(file, `${JSON.stringify(record, null, 0).replace(/\{"p":/g, '\n{"p":').replace(/[\u0080-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}\n`)
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
  const known = ['pixel', 'model', 'pixel-fixed', 'model-fixed', 'pixel-given', 'model-given', 'pixel-proto', 'model-proto', 'pixel-proto-pf', 'model-proto-pf', 'pixel-proto-p7', 'model-proto-p7', 'pixel-proto-p7-pf', 'model-proto-p7-pf']
  // (and the hybrids', after them)
  const keys = [...known.filter(k => record.tiers[k]), ...Object.keys(record.tiers).filter(k => !known.includes(k)).sort()]
  const run = record.tiers[keys[0]]
  const ms = MEASURES.filter(m => run.tier === 'pixel' || m[1] === 'model')
  const hybridOf = r => { const t = r.inputs.tex && r.inputs.tex !== 'none' ? JSON.parse(r.inputs.tex) : null; return t ? `; the hybrid: each unit the fixture's layout file locates whole takes ${t.use === 'lines' ? 'its lines, label and placeholders' : 'its placeholders'} from the file${t.texOnly ? ', with the units only the file holds (but cells)' : ''}${t.symbols === 'strict' ? ', a symbol drawn as text asked to be found too' : ''}${t.extents === 'tex' ? ', the file\'s erase rectangles' : ''}` : '' }
  const layoutsOf = r => (r.inputs.kind === 'proto' ? `v0 (the prototype in the engine), no layout file: the prototype's geometry and ${r.inputs.protoUnits === 'p7' ? "its own staging units" : "the fixtures' record.json"}, ${r.inputs.faces === 'prototype' ? "the prototype's own faces" : "the role table's faces"}${hybridOf(r)}` : r.inputs.layouts === 'made' ? "the engine's own layout files" : r.inputs.layouts === 'fixed' ? "the fixtures' layout files, as made for the layer lab" : `the layout files of ${r.inputs.fixtures}`)
  const L = []
  L.push('# The instant layer against the original: the fidelity record', '')
  L.push(`Written by \`spikes/layer-gate.mjs --record\`. Each run below: the engine at its commit, ${run.inputs.chromium ? `Chromium ${run.inputs.chromium}` : ''}, PDF.js ${run.inputs.pdfjs}; pages: ${run.inputs.pages}; the planes at ${run.inputs.scale} device px a PDF unit, lost ink at ${run.inputs.inkScale}x; crops drawn ${run.inputs.composite}.`, '')
  for (const k of keys) { const r = record.tiers[k]; L.push(`- **${k}**: the engine at \`${r.engine.commit?.slice(0, 8)}\` (${r.engine.branch}${r.engine.dirty ? ', with changes' : ''}), the gate at \`${r.gate.commit?.slice(0, 8)}\`${r.gate.dirty ? ' with changes' : ''}, ${r.made.slice(0, 10)}; ${layoutsOf(r)}; ${r.seconds} s.`) }
  L.push('', 'Every measure is against arXiv\'s original page, whose own value is the first column. The prototype\'s floor is the approved prototype as this gate measures it (v0, the prototype ported into the engine, under its own units and faces at the gate\'s text place); the floors it replaces stand beside it: the one before it, and the parity run\'s (measured at the prototype page\'s text place, 0.19 CSS px off, with coverage read from the translation\'s ink). Both are the ten outputs the prototype shares with the engine, pages 1-12. A defect is its count and, in brackets, its rate per 1,000 translated text cells (the model tier: per 1,000 cells of the drawn units\' frames), which is what the merge rule compares.', '')
  const fl = floorTotals(record.floor.pooled)
  const first = record.floor.history?.[0] ?? record.floor.old
  const cols = [['Prototype floor (v0, this gate), shared ten', fl], ...(record.floor.old ? [['The floor before it, shared ten', floorTotals(record.floor.old.pooled)]] : []), ...(first && first !== record.floor.old && record.floor.history?.length > 1 ? [['The parity run\'s floor, shared ten', floorTotals(first.pooled)]] : [])]
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
  if (record.rulings?.length) {
    // (a quote's own words as their \u escapes, the .md being ASCII like the .json)
    const esc = t => t.replace(/[\u0080-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
    L.push("## The maintainer's rulings", '', 'Where a record stands against the merge rule by the maintainer\'s choice: the ruling, the run it was given on, and the measures it covers.', '')
    for (const r of record.rulings) L.push(`- **${r.date}, ${r.by ?? 'the maintainer'}${r.on ? `, on ${r.on}` : ''}** (${r.record} at \`${r.commit}\`): "${r.english}"${r.quote ? ` (\`${esc(r.quote)}\`)` : ''}. ${r.measures?.length ? `Over the merge rule for ${r.measures.length > 1 ? `${r.measures.slice(0, -1).join(', ')} and ${r.measures.at(-1)}` : r.measures[0]}${r.scope ? ` ${r.scope}` : ''}.` : ''}${r.why ? ` ${r.why}` : ''}`)
    L.push('')
  }
  return `${L.join('\n')}\n`
}
/** what a floor keeps of a run's totals: the measures the prototype's floor has always had (v0's own checker and its own
 *  lost-ink accounting are not the engine's, and are left out) */
function floorOf(t) {
  const not = ['lostInk', 'lostInkPx', 'missing', 'twice', 'brackets', 'duplicated', 'numbersLost', 'numbersTotal', 'numbersShown', 'wrongPageText', 'droppedPh', 'modelCells', 'rates', 'modelRates', 'style']
  return Object.fromEntries(Object.entries(t).filter(([k]) => !not.includes(k)))
}
/** floor.json from v0's run under the floor's conditions at the gate's place, the floor before it kept beside it */
function writeFloor(run, shared) {
  // the floor it replaces: the committed one (git's HEAD), so that a floor written twice keeps the one before both;
  // GATE_FLOOR_BASE names another file
  const file = join(GATE, 'floor.json')
  const base = process.env.GATE_FLOOR_BASE ? readJson(resolve(process.env.GATE_FLOOR_BASE)) : JSON.parse(git(REPO, ['show', `HEAD:${file.slice(REPO.length + 1)}`]) ?? readFileSync(file, 'utf8'))
  const previous = { what: base.what, measured: base.measured ?? null, pooled: base.pooled, byFixture: base.byFixture }
  // every floor before it, the parity run's first
  const history = [...(base.history ?? (base.old ? [base.old] : [])), previous]
  const ref = Object.fromEntries(shared.map(n => [n, run.fixtures[n].meta.ref]))
  const out = {
    schema: 3,
    what: "the approved prototype's floor as this gate measures it: v0 (the prototype ported into the engine, exp/layer-proto, at its port: every record, erase, crop and SVG the live prototype's) under the floor's conditions (the prototype's own staging units and faces), at the gate's own text place, on the ten outputs it shares with the engine, by the gate's measures and references (layer-gate.mjs --engine-kind=proto --proto-units=p7 --proto-faces=prototype --write-floor)",
    measured: { made: run.made, engine: run.engine, gate: run.gate, inputs: run.inputs, ref },
    shared, pooled: floorOf(run.totals.shared), byFixture: Object.fromEntries(shared.map(n => [n, floorOf(run.fixtures[n].totals)])),
    old: previous, history,
  }
  writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`)
  console.log(`the floor: ${file} (the floor before it kept as "old", every one before in "history")`)
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
  L.push('| output | pages | lost ink | missing | twice | doubled brackets | duplications | equation numbers shown | clipped | groups drawn partly | labels left in the source | fails |', '|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const r of rows) L.push(`| ${r.name} | ${r.pages} | ${r.lostInk ?? '-'} | ${r.missing} | ${r.twice} | ${r.brackets} | ${r.duplicated} | ${r.numbers[0]} / ${r.numbers[1]} | ${r.clipped} | ${r.groupsSplit ?? 0} | ${r.labelsSource ?? 0} | ${r.fails.join(', ') || 'none'} |`)
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
  const asked = typeof arg('progress') === 'string' ? arg('progress') : null
  const dir = asked ? resolve(PROGRESS, asked) : join(PROGRESS, `${String(nn).padStart(2, '0')}-${label}`)
  const name = asked ? dir.slice(dir.lastIndexOf(sep) + 1) : `${String(nn).padStart(2, '0')}-${label}`
  const panelsOnly = !!arg('panels-only')
  mkdirSync(join(dir, 'engine'), { recursive: true })
  // the previous recorded run, else the baseline
  const runOf = n => { try { return { name: n, dir: join(PROGRESS, n), run: readJson(join(PROGRESS, n, 'run.json')) } } catch { return null } }
  const earlier = folders.map(runOf).filter(Boolean)
  // of those recorded, the last whose layout files were of the same kind as this run's; else the last recorded; else 00;
  // or the run asked for
  const recordedRuns = earlier.filter(e => e.run.recorded)
  const askedPrev = typeof arg('previous') === 'string' ? resolve(PROGRESS, arg('previous')) : null
  const previous = askedPrev ? (() => { try { return { name: askedPrev.slice(askedPrev.lastIndexOf(sep) + 1), dir: askedPrev, run: readJson(join(askedPrev, 'run.json')) } } catch { throw new Error(`--previous: no run.json in ${askedPrev}`) } })()
    : recordedRuns.filter(e => e.run.inputs?.layouts === LAYOUTS).at(-1) ?? recordedRuns.at(-1) ?? earlier.find(e => e.name.startsWith('00-')) ?? null
  PREVIOUS_DIR = previous?.dir ?? null
  const images = []
  const short = (engineInfo.commit ?? '').slice(0, 8)
  const engineOf = r => (r?.inputs?.kind === 'proto' ? 'v0 (the prototype in the engine)' : 'the engine')
  return {
    dir, name, previous,
    async panel(page, fixture, p) {
      const file = `${fixture}-p${p}.png`
      const protoFile = PROTO_PANELS ? join(PROTO_PANELS, file) : join(REFS, fixture, 'proto', `p${p}.png`)
      const proto = !panelsOnly && existsSync(protoFile) ? `${ORIGIN}/proto/${fixture}/p${p}.png` : null
      const prev = !panelsOnly && previous && existsSync(join(previous.dir, 'engine', file)) ? `${ORIGIN}/previous/${file}` : null
      const labels = ['Original', proto ? (PROTO_PANELS ? 'Prototype (approved), as its own page draws it' : 'Prototype (approved)') : 'Prototype: none for this output', `This run: ${name}, ${engineOf({ inputs })} at ${short}${engineInfo.dirty ? '+' : ''}`, prev ? `Previous: ${previous.name}, ${engineOf(previous.run)} at ${previous.run.engine?.commit?.slice(0, 8) ?? '?'}${previous.run.inputs?.layouts && previous.run.inputs.layouts !== LAYOUTS ? ` (layouts ${previous.run.inputs.layouts})` : ''}` : 'No previous run']
      const out = await page.evaluate(o => window.gate.panel(o), { pw: PANEL_WIDTH, gap: GAP, labels, proto, previous: prev })
      if (!panelsOnly) writeFileSync(join(dir, file), encodePng(Buffer.from(out.rgba, 'base64'), out.w, out.h))
      writeFileSync(join(dir, 'engine', file), encodePng(Buffer.from(out.engine.rgba, 'base64'), out.engine.w, out.engine.h))
      images.push({ file, fixture, p })
    },
    finish(run, verdict) {
      const recorded = !!arg('record') && !ONLY && !PAGES
      const prevRun = previous?.run ?? null
      writeFileSync(join(dir, 'run.json'), JSON.stringify({ name, recorded, made: run.made, engine: run.engine, inputs: run.inputs, totals: run.totals, fixtures: Object.fromEntries(Object.entries(run.fixtures).map(([n, f]) => [n, { meta: f.meta, totals: f.totals, pages: f.pages }])) }))
      if (panelsOnly) { console.log(`progress (panels): ${dir}`); return }
      const ms = MEASURES
      const kind = r => (r?.kind === 'proto' ? `no layout file (the prototype's geometry, ${r.protoUnits === 'p7' ? "the prototype's own staging units" : "the fixtures' record.json units"})` : r?.layouts === 'made' ? "the engine's own layout files" : r?.layouts === 'fixed' ? "the fixtures' layout files (the layer lab's)" : 'layout files given')
      const L = [`# ${name}`, '', `${engineOf(run)[0].toUpperCase()}${engineOf(run).slice(1)} at \`${short}\` (${engineInfo.branch}${engineInfo.dirty ? ', with changes' : ''}), on ${kind(run.inputs)}, ${run.made.slice(0, 16).replace('T', ' ')} UTC; compared with ${prevRun ? `\`${previous.name}\` (${engineOf(prevRun)} at \`${prevRun.engine.commit?.slice(0, 8)}\`, on ${kind(prevRun.inputs)})` : 'no earlier run'}. Every measure is against arXiv's original page. A defect is its count and, in brackets, its rate per 1,000 translated text cells.`, '']
      const fl = floorTotals(floor.pooled)
      const table = (title, rows) => {
        L.push(`## ${title}`, '', '| measure | Original | ' + rows.map(r => r[0]).join(' | ') + ' |', `|---|---|${rows.map(() => '---|').join('')}`)
        for (const m of ms) L.push(`| ${m[4]} | ${originalOf(m)} | ${rows.map(r => shown(r[1], m)).join(' | ')} |`)
        L.push('')
      }
      table('The ten shared outputs, pages 1-12', [['Prototype (floor, v0 through this gate)', fl], ...(prevRun ? [[`Previous (${previous.name})`, prevRun.totals.shared]] : []), ['This run', run.totals.shared]])
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
      const figs = images.sort((a, b) => a.file.localeCompare(b.file, 'en', { numeric: true })).map(im => `<figure><img src="${im.file}" alt="${esc(`${im.fixture} page ${im.p}`)}"><figcaption>${esc(`${im.fixture}, page ${im.p}. Above: the original, the prototype. Below: this run, ${prevRun ? previous.name : 'no previous run'}.`)}</figcaption></figure>`)
      writeFileSync(join(dir, 'index.html'), `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(name)}</title>\n<style>body{margin:16px;font:14px/1.4 -apple-system,"Helvetica Neue",Arial,sans-serif;color:#222;background:#fff}figure{margin:0 0 28px}img{display:block;max-width:100%;height:auto;border:1px solid #ddd}figcaption{margin-top:6px;color:#555}</style></head>\n<body><h1>${esc(name)}</h1><p>The engine at ${esc(short)} (${esc(engineInfo.branch ?? '')}). The measures are in <a href="metrics.md">metrics.md</a>.</p>\n${figs.join('\n')}\n</body></html>\n`)
      console.log(`progress: ${dir}`)
    },
  }
}
