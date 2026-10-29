// lab/pdf/spikes/layer-gate.mjs
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
// of each output, every page of the thesis (2307.16209v1) and of 2608.16117v1.
//
//   pnpm exec tsx lab/pdf/spikes/layer-gate.mjs [--tier=model|pixel] [--engine=<worktree>] [--only=<fixture>,…]
//       [--layouts=made|fixed] [--fixtures=<dir>] [--pages=<n>] [--workers=<n>] [--check[=<record>]] [--record[=<record>]] [--label=<short>]
//       [--composite=source-over|darken] [--no-progress] [--panel-width=<px>] [--freeze[=force]]
//       [--engine-kind=proto|layer] [--proto-units=fixture|p7] [--progress=<name|path>] [--previous=<name|path>] [--panels-only] [--proto-panels=<dir>]
//       [--proto-faces=roles|prototype] [--proto-place=<file>] [--proto-order=<file>] [--dump=<dir>] [--write-floor]
//       [--proto-tex=lines] [--proto-symbols=text|strict] [--proto-extents=v0|tex]
//       [--against=<record key>] [--rules=<file>] [--ruling=<file>] [--parts[=<n>]] [--slices[=blocks|alphabet]] [--door[=<n>]]
//       [--door-memory[=<pages>]] [--door-parts[=doubling|splits:<n>|seed:<s>]] [--sources=<dir>]
//       [--door-order=reverse|seed:<s>|burst:<s>] [--door-jump[=all|<fixture>:<page>,…]]
//       [--door-draw[=inputs|pages|jump:all|jump:<fixture>:<page>,…]] [--link=<rtt ms>:<bytes/s>]
//   --sources    the papers' sources (<dir>/<paper>/source.gz; default data/layout, then data/corpus): each fixture's base page is
//                wrapped by optional content in Node with them (layer-gate/wrap.mjs: the engine's wrapFinal over the paper's source
//                units, cached in out/layer-gate/wrap/), and the layer is drawn over the wrapped page with the head fields a
//                reader is given (what the wrap could not hide, the cell rules), as the reader draws (docs/PDF-READER.md §19.9). A
//                fixture with no source, or whose wrap is refused (arXiv's PDF has no marks), is drawn over its page unwrapped:
//                every unit then the original's, and the wrap line says so
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
//                layout (the web's web/e2e/.fixtures/); the references stay data/layer-fixtures' (LAYER_REFS another). A
//                fixture's base.pdf, where it has one (our base page, BUNDLE 8), is the page the layer is drawn over, its
//                add-on made over and its bundle's base: every read of that page, served as /fixtures/<fixture>/base.pdf
//                (arXiv's PDF where there is none); arxiv.pdf stays the left's
//   --check      the merge rule against the last record (default <engine>/lab/pdf/records/
//                layer-fidelity.json, else this repository's): no measure worse on any fixture (shares by more than 0.2
//                points, ratios by 0.02, unit counts at all, defects as rates per 1,000 translated text cells at all);
//                every page whose measures moved listed; exit 1 on any regression, or where the inputs are not the record's
//   --record     the run as the record: layer-fidelity.json (per fixture and page, the totals, the prototype's floor) and
//                layer-fidelity.md beside it, and the brief's layer-gate.json and .md (the completeness by output); a whole
//                run only (no --only, no --pages); --ruling=<file> (with --record): a ruling of the maintainer's the
//                record is made under, where it stands against the merge rule (a JSON file: { date, by, on, quote, english,
//                measures, scope, why }), kept in the record with every earlier one and listed in its .md
//   --label      the progress folder's name (pixel tier): ~/Downloads/readarxiv-test/layer-progress/<NN>-<label>/
//                (LAYER_PROGRESS names another): per page of the controller's set an image of four panels in a 2 x 2
//                grid, each --panel-width wide (1,000 px): the original and the prototype above, this run and the previous
//                recorded run (of the same layout files where there is one, else the baseline) below; metrics.md and
//                index.html; default the engine's branch
//   --composite  how crops are drawn on the copy: darken (the default since the maker round: the prototype's drawing, and
//                the layer round's) or source-over (the lab's at first)
//   --freeze     the reference text area of every fixture that has none (=force: made again, a deliberate change;
//                --ref-layouts=<dir>,…: a later maker's fixtures' layout files first, the fixture's own, then the
//                prototype's geometry for the units none locates; =names, with --ref-layouts: each reference as it stands
//                with the babel names of the first of those layout files that holds any, every unit's rows unchanged)
//   --write-floor  layer-gate/floor.json from this run: the prototype's floor as this gate measures it, v0 under the
//                floor's conditions at the gate's own text place (--engine=<exp/layer-proto> --engine-kind=proto
//                --proto-units=p7 --proto-faces=prototype --tier=pixel, the ten shared outputs; v0 at its port,
//                exp/layer-proto f654c05c, whose drawing is the live prototype's); the committed floor kept beside it as
//                "old", every earlier one in "history"
//   --proto-tex  the layout file as the layer's only source of a unit (layer-proto/tex.mjs; route step 2): each unit the
//                fixture's layout file locates whole takes its lines, label and placeholders from it, and the units it
//                locates that the left's geometry does not hold too (but table cells); any other unit is the original's. The
//                layer draws only from the file, so --engine-kind=proto needs it (refused at the arguments otherwise); the merge
//                base's engine, which drew such a unit by v0's own reading, is measured with it too: its hybrid, against this
//                checkout's file-only layer. --proto-symbols=strict: a symbol drawn as text must be found too for a unit to
//                be located whole; --proto-extents=tex: the file's erase rectangles. Recorded apart (<tier>-proto-tex-lines,
//                and each further choice)
//   --against    --check against another of the record's runs than this run's own (a hybrid against v0's, pixel-proto):
//                the inputs that make it another run (tex) are not compared
//   --engine-kind  proto (the default): the layer's v0, the approved prototype ported into the engine (layer-proto/run.mjs),
//                which has no layout file: it
//                reads the made output's geometry (the prototype's own, layer-gate/ref.mjs PROTO_GEOMETRY, by paper) and a
//                units file, and is measured on the same pages, fixtures, references and measures (layer-gate/proto.mjs).
//                Its runs are recorded apart (<tier>-proto), the fixtures' own layout files serving only the instrument. layer: the
//                first layer, the engine's layer entry (layer/layer.mjs) over a layout file, parked (parked/engine/layer/): refused
//                for an engine that has none, measured for an older worktree (--engine=<it>) that still has it
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
//   --parts      v0 (--engine-kind=proto) fed its units as a live run's deltas give them (never recorded): opened with
//                none and each unit's table group (the record's), each fixture's record rows, each non-text piece with its
//                k (the units file's), taken a part a macrotask beside the pages asked for, then end() (layer-proto/
//                run.mjs take, end); the parts cut in id order by the delta rule (a part closed once its rows' JSON reaches 384 KiB or 96,000 values, 32 parts at most)
//                or n units a part (--parts=<n>). Each page must draw as the open over every unit does (--dump, --check);
//                a fixture fails where a row came late, where take's pieces are not the units file's, or where a unit's
//                why left was read before its row came
//   --slices     v0 (--engine-kind=proto) given its role table faces as slices (faceSources), never recorded: each face's coverage
//                cut into slices of the one file, the CJK Unified Ideographs in 8 and every other Unicode block of it its own
//                (blocks, the default), or with the blocks whose letters are kerned together in one (alphabet); every slice the
//                whole file at a URL of its own that the browser draws within the slice's unicode-range (layer-gate/proto.mjs
//                sliceTable). With --dump, the dump is to equal the whole-file run's, lines and widths
//   --door       the reader's door (layer-proto/reader.mjs openLayer) against the gate's own v0 page, a proof as --parts is
//                (never recorded; --engine-kind=proto --proto-tex=lines, the door's choices): each fixture's
//                bundle made from its parts (writeBundle: the paper's units, openPaper's over its source; the geometry; the
//                layout file and its cell rules; its base the wrapped page) and its rows from its record (rows.mjs rowOf), and each page
//                drawn twice, each in a page load of its own (layer-gate/door.mjs): by the gate's own call of openProto with
//                the door's inputs, and by openLayer with the rows taken n a part (16 by default) as they come. Each page's
//                SVG markup (pageOf's, its lang aside) and word table (words.mjs, the digest of its columns, spans and units
//                left the original's; the run's own at the gate's recorded scale too) must equal the run's, the page PDF.js
//                draws at 2.5 device pixels a unit
//                v0's own original, and copyOf(page, that page, 2.5)'s pixels the run's copy plane; a fixture fails where
//                one does not, and the run is written to out/layer-gate/door-<commit>-<time>.json
//   --door-memory  what the reader's door holds while it lays a paper (a measurement of its own, never recorded; the door's
//                choices as --door has them, and --only for the paper): the door asked for the page after <pages> (40 by
//                default) at once, as a reader that jumps does, then for each page up to <pages> in turn. At every 10th page
//                laid, the engine stopped before the next page's drawing: the canvases the page holds (count and bytes),
//                its JS heap after a collection and the browser's resident memory. Written to
//                out/layer-gate/memory-<commit>-<time>.json
//   --door-parts  the door in parts (BUNDLE 4; never recorded; the door's choices as --door has them): each fixture's bundle as
//                --door makes it, cut by the cutter (layer-proto/cut.mjs, the head's base the wrapped page with its wrap's
//                fields, the parts carrying the cell rules) at the doubling schedule (the default), every <n> pages a part
//                (splits:<n>), or at part lengths of 1 to 4 drawn from <s> (seed:<s>), and its pages drawn twice, each in a page
//                load of its own (layer-gate/door-parts.mjs): door A over the cut made whole (mergeParts, BUNDLE 3's open), door
//                B over the index with no part, each part told when the run waits for one, both over the one wrapped page.
//                Each page's SVG markup, word table digest, copyOf's pixels over the page as door A's load drew it, and the
//                digest of the run's records of its units must be equal, the units left and why too, and no page told laying
//                may wait for a part before it is ready (Q1). The run is written to out/layer-gate/door-parts-<commit>-<time>.json
//   --door-order  the door asked for its pages in another order (the 1b-D design, §6 item 3, X2; never recorded; the door's choices
//                as --door has them): each fixture's bundle and rows as --door makes them, its pages asked in order in a page
//                load of its own (the reference: each page's PDF.js drawing kept as PNG), then ONE open of the door asked for
//                the same pages in reverse, in an order drawn from <s> (seed:<s>), or in bursts of concurrent asks with aborts
//                by signal and re-asks (burst:<s>; layer-gate/door-order.mjs), each page compared with the reference's: SVG
//                markup, word table digest, copyOf's pixels over the reference's PNG, the digest of the run's records of the
//                units on it (through the driver's stand-in of run.mjs), and the units left and why, the pages' states and the
//                units drawn. The run is written to out/layer-gate/door-order-<commit>-<time>.json
//   --door-jump  each page asked for first and alone, in a fresh page load (the 1b-D design, §6 items 4 and 6, X1 and J; never
//                recorded; the door's choices as --door has them): all = every page --door shows (the first 12 of each output, every page of
//                2307.16209v1 and 2608.16117v1; --pages=<n> says another count: 523 pages), or <fixture>:<page>,…
//                (a fixture's name, or its paper's, as 2307.16209:147 for 2307.16209v1-zh). Each compared with the reference
//                (as --door-order) and J reported, what the ask drew and laid before the page was ready (pages PDF.js was asked
//                for, units laid, held to the page's closure Need(p) where the engine exposes one: the pages drawn
//                among its draw, the units laid among its lay entries; 'closure: n/a' where it exposes none). The tasks (a fixture's pages, 6 to a task) are shared among --workers; with --perf also the time to the
//                page (a fresh open, then the ask) and the longest task of 50 ms or more, on one worker. The run is written to
//                out/layer-gate/door-jump-<commit>-<time>.json
//   --door-draw  a page drawn from its draw geometry (E-C: run.mjs openProto `drawOf`, the door's hand-off of the draw each left
//                part of BUNDLE 5 carries; never recorded; the door's choices as --door has them). Each paper's draws read in Node
//                as the prepare's container reads them (layer-gate/draws.mjs: the engine's lite worker, NO_IMAGE_PIXELS,
//                useSystemFonts false, fontExtraProperties, cMaps, each page after its operator list; cached in out/layer-gate/
//                draws/), each fixture's bundle as --door makes it cut as --door-parts cuts it (doubling), every
//                left part carrying its page's draw (layer-gate/door-draw.mjs). inputs: every page of each paper read in Chromium as
//                the run reads a page live against its draw, the characters field by field and the Link annotations as the run
//                keeps them (run.mjs fontReaders, pageReadOf), every page with no draw named with why. pages (the default): the
//                door over the cut, its parts told as its run waits for one, its pages asked in order, with drawOf against the
//                same door whose run is given none (the stand-in takes it away: every page read live): each page's SVG markup,
//                word table, link records, copyOf's pixels over the reference's PNG and records equal, the units left, the states
//                and the units drawn; no getTextContent or getAnnotations on a page read from its draw, and a page drawn by PDF.js
//                while one is asked only where the run read its pixels (drawStats), once. jump: each page asked first and alone in
//                a fresh load, every part told at the open (as --door-jump), against the pages reference, with J (the pages read
//                from data and live, the pages whose pixels were read and why); --link=<rtt>:<bytes/s> reads the document and
//                the left parts over a modelled link (the E-C handoff's sim2: FIFO, RTT after the ask, a left part its gzip size),
//                --perf the time to the page on one worker, --draw-off the same jump with no drawOf (every page read live), to time
//                against. The run is written to out/layer-gate/door-draw-<commit>-<time>.json
// The consistency measures (the table-groups brief, 2026-10-07), checked with the completeness ones and each to be 0: a
// table group drawn partly (the record's translated cells of one `group`, some drawn and some not) and a float's label
// left in the source language where the final names it in the target's (the record's `captions`, the layout rules' labels'
// names); the fixtures carry groups and captions as spikes/table-groups.mjs --write gives them (--fixtures).
// Exits 1 on any completeness failure (the brief's gate; under --check the merge rule decides, each completeness count
// being one of its measures), on a regression under --check, or where a fixture could not be run.
import { execFile, execFileSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { gzipSync } from 'node:zlib'
import { availableParallelism, homedir } from 'node:os'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { chromium } from 'playwright'
import { engineKindOf } from './layer-gate/kind.mjs'
import { encodePng } from './layer-gate/png.mjs'
import { geometryFile, nameOf, PROTO_GEOMETRY, refBytesOf, refPages, sha256, shownPath, withNames } from './layer-gate/ref.mjs'
import { compare, completenessRows, droppedOutputs, fixtureTotals, LINKS_MIN, MEASURES, pageEntry, pooled, REPORTED, wrapLine } from './layer-gate/score.mjs'
import { composedDiff } from './layer-gate/links.mjs'

const here = new URL('.', import.meta.url).pathname
const ROOT = resolve(here, '..')
const REPO = resolve(ROOT, '../..')
const DATA = process.env.AXT_DATA ?? join(ROOT, 'data')
const arg = name => { const a = process.argv.find(x => x === `--${name}` || x.startsWith(`--${name}=`)); return a === undefined ? null : a.includes('=') ? a.slice(name.length + 3) : true }
/** --perf: the costs (the maintainer's budget, 2026-10-07), on one worker, the model tier: per page, the first drawing,
 *  its steps, the drawing again at twice the resolution, the canvases held and the JS heap; per paper, the layout
 *  maker's time (and its operator lists'), the wrap's, and the bytes the reader is sent (the layout file). One pass a run: spikes/layer-perf.mjs takes the medians of several runs and the budget */
const PERF = !!arg('perf')
/** --ink (with --door and its proofs, never recorded): the wrap's ink units drawn too (docs/route/orphan-text.md): text no source unit
 *  owns, an echo with its source unit's row */
const INK = !!arg('ink')
/** --door-shots=<dir>:<fixture>:<page>,…: the door's copy plane (PNG) and drawing (SVG) of those pages written to <dir>, for the
 *  eye (a proof's aid, never recorded) */
const DOOR_SHOTS = (() => { const v = arg('door-shots'); if (!v) return null; const [dir, ...rest] = v.split(':'); const want = new Map(); for (const x of rest.join(':').split(',')) { const m = /^(.+):(\d+)$/.exec(x); if (m) (want.get(m[1]) ?? want.set(m[1], []).get(m[1])).push(Number(m[2])) } return { dir: resolve(dir), want } })()
if (INK && arg('record')) throw new Error('--ink: a proof of the ink units, never a record (no --record)')
const TIER = PERF ? 'model' : arg('tier') ?? 'model'
if (TIER !== 'model' && TIER !== 'pixel') throw new Error(`--tier=${TIER}: model or pixel`)
const ENGINE = resolve(typeof arg('engine') === 'string' ? arg('engine') : REPO)
/** the layer measured: the drawn layer over the layout file (proto.mjs), the default, or the first layer over one where the engine still has it */
const KIND = engineKindOf(arg('engine-kind'), ENGINE)
const PROTO = KIND === 'proto'
const PROTO_UNITS = arg('proto-units') ?? 'fixture'
if (!['fixture', 'p7'].includes(PROTO_UNITS)) throw new Error(`--proto-units=${PROTO_UNITS}: fixture or p7`)
/** --proto-faces=roles|prototype: the faces v0 draws in (its own default, the role table's, where not given) */
const PROTO_FACES = typeof arg('proto-faces') === 'string' ? arg('proto-faces') : null
if (PROTO_FACES && !['roles', 'prototype'].includes(PROTO_FACES)) throw new Error(`--proto-faces=${PROTO_FACES}: roles or prototype`)
/** --proto-tex=lines: the layout file as the layer's source, and its further choices (`use` and `texOnly` are the options of the
 *  engines before route step 2, which the merge base's engine is measured with; this checkout's engine ignores them) */
const PROTO_TEX = typeof arg('proto-tex') === 'string' ? arg('proto-tex') : null
if (PROTO_TEX && PROTO_TEX !== 'lines') throw new Error(`--proto-tex=${PROTO_TEX}: lines`)
const TEX = PROTO_TEX ? { use: PROTO_TEX, texOnly: true, symbols: typeof arg('proto-symbols') === 'string' ? arg('proto-symbols') : 'text', extents: typeof arg('proto-extents') === 'string' ? arg('proto-extents') : 'v0' } : null
if (TEX && (!['strict', 'text'].includes(TEX.symbols) || !['v0', 'tex'].includes(TEX.extents))) throw new Error('--proto-symbols=text|strict, --proto-extents=v0|tex')
if (PROTO && !TEX) throw new Error('--engine-kind=proto: --proto-tex=lines is needed (the layer draws only from the layout file; there is no layer without one)')
const TEX_KEY = TEX ? `-tex-${TEX.use}${TEX.symbols === 'strict' ? '-strict' : ''}${TEX.extents === 'tex' ? '-erase' : ''}` : ''
const AGAINST = typeof arg('against') === 'string' ? arg('against') : null
/** --rules=<file>: the layout rule set v0 draws by (rules/layout.mjs; default the engine's built-in, rules/layout-rules.json),
 *  read here by the engine's own reader before any minute is spent, served to the page, recorded with the run as
 *  inputs.rules = { version, sha256 }. Every choice v0 makes for a target is the set's; there is no per-field override */
const RULES_FILE = PROTO ? resolve(typeof arg('rules') === 'string' ? arg('rules') : join(ENGINE, 'src/pdf-reader/engine/rules/layout-rules.json')) : null
let RULES = null, RULES_SHA = null, RULES_LABELS = () => null
if (RULES_FILE) {
  const { readRules, resolveRules } = await import(join(ENGINE, 'src/pdf-reader/engine/rules/layout.mjs'))
  ;({ set: RULES, sha256: RULES_SHA } = await readRules(new Uint8Array(readFileSync(RULES_FILE))))
  RULES_LABELS = target => resolveRules(RULES, target).labels
}
const PROTO_PANELS = typeof arg('proto-panels') === 'string' ? resolve(arg('proto-panels')) : null
/** --proto-place=<file>: the place, by fixture and page, the prototype's own page gave each page's text (its .pg box,
 *  CSS px: { [fixture]: { [page]: [x, y] } }), which its floor was measured at; --dump=<dir>: v0's records, audit and
 *  page digests per fixture, to compare with the live prototype's */
const PROTO_PLACE = typeof arg('proto-place') === 'string' ? JSON.parse(readFileSync(resolve(arg('proto-place')), 'utf8')) : null
const DUMP = typeof arg('dump') === 'string' ? resolve(arg('dump')) : null
/** --parts[=<n>]: v0 fed its units in parts, by the delta rule or n a part (a proof, as --dump is: never recorded) */
const PARTS = arg('parts') === true ? 'delta' : typeof arg('parts') === 'string' ? Number(arg('parts')) : null
if (PARTS !== null && PARTS !== 'delta' && !(Number.isInteger(PARTS) && PARTS > 0)) throw new Error(`--parts=${arg('parts')}: a count of units a part`)
if (PARTS && (KIND !== 'proto' || arg('record'))) throw new Error('--parts: v0 only (--engine-kind=proto), and never a record (no --record)')
/** --slices: v0's role table faces served in slices (a proof, as --dump is: never recorded) */
const SLICES = arg('slices') === true ? 'blocks' : typeof arg('slices') === 'string' ? arg('slices') : null
if (SLICES && (KIND !== 'proto' || arg('record'))) throw new Error('--slices: v0 only (--engine-kind=proto), and never a record (no --record)')
if (SLICES && !['blocks', 'alphabet'].includes(SLICES)) throw new Error(`--slices=${SLICES}: blocks or alphabet`)
/** --door-memory[=<pages>]: the memory the door holds as it lays that many pages (a measurement: never recorded) */
const MEMORY = arg('door-memory') === true ? 40 : typeof arg('door-memory') === 'string' ? Number(arg('door-memory')) : null
if (MEMORY !== null && !(Number.isInteger(MEMORY) && MEMORY >= 10)) throw new Error(`--door-memory=${arg('door-memory')}: a count of pages, 10 or more`)
/** --door-parts[=doubling|splits:<n>|seed:<s>]: the door in parts against the door over the same cut made whole (a proof: never
 *  recorded), at the schedule given */
const DOOR_PARTS = arg('door-parts') === true ? 'doubling' : typeof arg('door-parts') === 'string' ? arg('door-parts') : null
if (DOOR_PARTS !== null && !/^(?:doubling|splits:[1-9]\d*|seed:\d+)$/.test(DOOR_PARTS)) throw new Error(`--door-parts=${DOOR_PARTS}: doubling, splits:<n> or seed:<s>`)
/** --door-order=reverse|seed:<s>|burst:<s>: the door asked for its pages in another order than 1 to N, every page compared with
 *  the page asked in order (a proof: never recorded) */
const DOOR_ORDER = typeof arg('door-order') === 'string' ? arg('door-order') : null
if (arg('door-order') !== null && (DOOR_ORDER === null || !/^(?:reverse|seed:\d+|burst:\d+)$/.test(DOOR_ORDER))) throw new Error(`--door-order=${arg('door-order')}: reverse, seed:<s> or burst:<s>`)
/** --door-jump[=all|<fixture>:<page>,…]: each page asked for first and alone in a fresh page load, compared with the page asked
 *  in order, and what the ask cost (a proof: never recorded) */
const DOOR_JUMP = arg('door-jump') === true ? 'all' : typeof arg('door-jump') === 'string' ? arg('door-jump') : null
if (DOOR_JUMP !== null && DOOR_JUMP !== 'all' && !/^[A-Za-z0-9._-]+:[1-9]\d*(?:,[A-Za-z0-9._-]+:[1-9]\d*)*$/.test(DOOR_JUMP)) throw new Error(`--door-jump=${DOOR_JUMP}: all, or <fixture>:<page>,…`)
/** --door-draw[=inputs|pages|jump:all|jump:<fixture>:<page>,…]: pages drawn from their draw geometry against the same door reading
 *  every page live (a proof: never recorded) */
const DOOR_DRAW = arg('door-draw') === true ? 'pages' : typeof arg('door-draw') === 'string' ? arg('door-draw') : null
if (DOOR_DRAW !== null && !/^(?:inputs|pages|jump:(?:all|[A-Za-z0-9._-]+:[1-9]\d*(?:,[A-Za-z0-9._-]+:[1-9]\d*)*))$/.test(DOOR_DRAW)) throw new Error(`--door-draw=${DOOR_DRAW}: inputs, pages, jump:all or jump:<fixture>:<page>,…`)
const DRAW_MODE = DOOR_DRAW === null ? null : DOOR_DRAW.startsWith('jump:') ? 'jump' : DOOR_DRAW
/** --link=<rtt ms>:<bytes/s>: --door-draw=jump's modelled link */
const LINK = typeof arg('link') === 'string' ? arg('link').split(':').map(Number) : null
if (arg('link') !== null && (DRAW_MODE !== 'jump' || !LINK || LINK.length !== 2 || !LINK.every(v => Number.isFinite(v) && v >= 0) || !(LINK[1] > 0))) throw new Error(`--link=${arg('link')}: <rtt ms>:<bytes/s>, with --door-draw=jump:…`)
/** --draw-off: --door-draw=jump's run with no drawOf (the stand-in takes it away: every page read live, as without E-C), to time against */
const DRAW_OFF = !!arg('draw-off')
if (DRAW_OFF && DRAW_MODE !== 'jump') throw new Error('--draw-off: with --door-draw=jump:…')
/** the pages a jump asks (--door-jump's, or --door-draw=jump's) */
const JUMP_SPEC = DOOR_JUMP ?? (DRAW_MODE === 'jump' ? DOOR_DRAW.slice(5) : null)
if ([MEMORY, DOOR_PARTS, DOOR_ORDER, DOOR_JUMP, DOOR_DRAW].filter(x => x !== null).length > 1) throw new Error('--door-memory, --door-parts, --door-order, --door-jump and --door-draw are proofs of their own: one at a time')
/** --door[=<n>]: the reader's door against the gate's own page, its rows taken n a part (a proof: never recorded) */
const DOOR = arg('door') === true || ((MEMORY !== null || DOOR_PARTS !== null || DOOR_ORDER !== null || DOOR_JUMP !== null || DOOR_DRAW !== null) && arg('door') === null) ? 16 : typeof arg('door') === 'string' ? Number(arg('door')) : null
if (DOOR !== null && !(Number.isInteger(DOOR) && DOOR > 0)) throw new Error(`--door=${arg('door')}: a count of rows a part`)
if (DOOR !== null && (KIND !== 'proto' || TEX?.use !== 'lines' || !TEX.texOnly || TEX.symbols !== 'text' || TEX.extents !== 'v0')) throw new Error("--door: the door's choices, --engine-kind=proto --proto-tex=lines")
if (DOOR !== null && (arg('record') || PARTS || SLICES || (PERF && DOOR_JUMP === null && DRAW_MODE !== 'jump') || DUMP || TIER !== 'model')) throw new Error('--door: a proof of its own, the model tier, never a record, nor with --parts, --slices, --perf (but --door-jump\'s and --door-draw=jump\'s) or --dump')
/** a TypeScript transform for the repository's own modules the door's closure names by the @/ alias (--door): esbuild, as
 *  tsx (this script's runner) has it; the repository's TypeScript 7 has no API to call */
const ESBUILD = DOOR !== null ? createRequire(realpathSync(join(REPO, 'node_modules/tsx/package.json')))('esbuild') : null
/** --ruling=<file>: the maintainer's ruling the record is made under (with --record) */
const RULING = typeof arg('ruling') === 'string' ? JSON.parse(readFileSync(resolve(arg('ruling')), 'utf8')) : null
/** --proto-order=<file>: an order to lay each fixture's units in, by page ({ [fixture]: [ids] }: a live run's, where its
 *  race between drawing and streaming went another way) */
const PROTO_ORDER = typeof arg('proto-order') === 'string' ? JSON.parse(readFileSync(resolve(arg('proto-order')), 'utf8')) : null
const REFS = resolve(process.env.LAYER_REFS ?? join(DATA, 'layer-fixtures'))
/** --sources=<dir>: the papers' sources the base pages are wrapped with (<dir>/<paper>/source.gz), then data/layout's and data/corpus's */
const SOURCES = [typeof arg('sources') === 'string' ? resolve(arg('sources')) : null, join(DATA, 'layout'), join(DATA, 'corpus')].filter(Boolean)
const sourceOf = paper => SOURCES.map(d => join(d, paper, 'source.gz')).find(f => existsSync(f)) ?? null
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
// The layer (--proto-tex) reads one, the engine's own maker's by default (made), as the layer does: a change of the maker
// is measured end to end through it too. The instrument stays the fixtures' own layout files either way
const LAYOUTS = GIVEN ? 'given' : arg('layouts') ?? (HAS_MAKER ? 'made' : 'fixed')
if ((!PROTO || TEX) && !GIVEN && !arg('layouts') && !HAS_MAKER) console.log('the engine has no layout maker (layout/make.mjs): its layer is given the fixtures\' own layout files (--layouts=fixed)')
/** the record's entry this run is: its tier, and the layout files it was given where they are not the engine's own */
const KEY = PROTO ? `${TIER}-proto${PROTO_UNITS === 'p7' ? '-p7' : ''}${PROTO_FACES === 'prototype' ? '-pf' : ''}${TEX_KEY}-ocg` : LAYOUTS === 'made' ? TIER : `${TIER}-${LAYOUTS}`
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
/** the layout rules' validator (zod, the mini build), served at /zod/ for the page's import map */
const ZOD = resolve(REPO, 'node_modules/zod')
const GATE = join(here, 'layer-gate')
const CHECKER = join(REPO, 'src/pdf-reader/engine/layer/check.mjs')
/** the UAX 14 table the measure reads (measure.mjs imports it by its address in this repository): this repository's, as
 *  the checker is, whichever engine is measured */
const NO_START_PATH = '/src/pdf-reader/engine/layer-proto/no-start.mjs', NO_START_FILE = join(REPO, NO_START_PATH.slice(1))
/** TeX's room after a forced break, the drawing's and the measure's one reading of it (measure.mjs imports it by its address
 *  in this repository): this repository's, as the UAX 14 table is */
const BREAK_ROOM_PATH = '/src/pdf-reader/engine/layer-proto/break-room.mjs', BREAK_ROOM_FILE = join(REPO, BREAK_ROOM_PATH.slice(1))
const PROGRESS = process.env.LAYER_PROGRESS ?? join(homedir(), 'Downloads/readarxiv-test/layer-progress')
const ONLY = typeof arg('only') === 'string' ? arg('only').split(',').filter(Boolean) : null
const PAGES = typeof arg('pages') === 'string' ? Number(arg('pages')) : null
// (--perf and --door-memory: one worker, so that a reading is the fixture's own and not its neighbours' in the one browser)
const WORKERS = PERF || MEMORY !== null ? 1 : typeof arg('workers') === 'string' ? Number(arg('workers')) : Math.max(1, Math.min(6, Math.floor(availableParallelism() / 2)))
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
/** TeX's file against the drawing (score.mjs, the 2608.16117 survey): the measures each output's records show apart */
const AGAINST_FILE = ['contentLost', 'contentUnknown', 'textInDisplay', 'slotsSkipped', 'lineStartPunct', 'glyphsLost', 'linesLeft']
/** the brief's exact values: 12 pages an output, every page of the thesis; and every page of 2608.16117v1, whose
 *  defects the maintainer saw on staging reach page 14 (the 2608.16117 survey, 2026-10-15) */
const PAGES_OF = 12, ALL_PAGES = new Set(['2307.16209v1', '2608.16117v1'])
/** the progress images' pages (the controller's set) and their width */
const PANELS_SET = { '1512.03385v1-zh': [1, 2, 3], '1706.03762v7-ja': [1, 2], '2608.04322v1-de': [2], '1810.04805v2-ru': [2], '2307.16209v1-zh': [10] }
/** --panel-pages=<fixture>:<p>,<p>;<fixture>:<p>: the progress images' pages in place of the controller's set (a look at others) */
const PANELS = typeof arg('panel-pages') === 'string' ? Object.fromEntries(arg('panel-pages').split(';').filter(Boolean).map(x => { const [fx, ps] = x.split(':'); return [fx, ps.split(',').map(Number)] })) : process.env.GATE_PANELS ? JSON.parse(process.env.GATE_PANELS) : PANELS_SET
/** each panel's width in the progress images' 2 x 2 grid (the controller's: about 1,000 px) */
const PANEL_WIDTH = Number(arg('panel-width') ?? 1000), GAP = 12

const git = (dir, args) => { try { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return null } }
const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
const fileSha = file => sha256(readFileSync(file))
const recordDir = dir => join(dir, 'lab/pdf/records')

// ---------------------------------------------------------------- the fixtures and their references
const FIXTURES = LAYOUTS === 'given' ? resolve(GIVEN) : LAYOUTS === 'fixed' || FREEZE ? REFS : madeFixtures()
/** the page the layer is drawn over: our base page where the fixture has one (base.pdf, BUNDLE 8: the final pass of the marked
 *  original, the layout file made over it, layer-fixtures.mjs), else arXiv's PDF as before; arxiv.pdf stays the left's */
const basePdf = name => { const ours = join(FIXTURES, name, 'base.pdf'); return existsSync(ours) ? ours : join(FIXTURES, name, 'arxiv.pdf') }
const fixtures = readdirSync(FIXTURES).filter(n => /^[A-Za-z0-9._-]+v\d+-[A-Za-z-]+$/.test(n) && existsSync(join(FIXTURES, n, 'units.json'))).sort()
for (const n of fixtures) if (!existsSync(join(FIXTURES, n, 'layout.json'))) console.log(`FAIL ${n}: no layout file (${existsSync(join(FIXTURES, n, 'refusal.json')) ? `refused: ${readJson(join(FIXTURES, n, 'refusal.json')).refused}` : 'none made'})`)
if (FREEZE) {
  let made = 0
  for (const name of readdirSync(REFS).filter(n => existsSync(join(REFS, n, 'layout.json'))).sort()) {
    const file = join(REFS, name, 'ref.json')
    // (=names: the reference as it stands, with a later maker's babel names added, D1a)
    if (FREEZE === 'names') {
      const layouts = REF_LAYOUTS.map(d => join(d, name, 'layout.json')).filter(f => existsSync(f)).map(f => readFileSync(f))
      if (!existsSync(file) || !layouts.length) continue
      writeFileSync(file, Buffer.from(JSON.stringify(withNames(readJson(file), layouts))))
      made++
      console.log(`ref  ${name}: ${fileSha(file).slice(0, 12)} (names)`)
      continue
    }
    if (existsSync(file) && FREEZE !== 'force') continue
    writeFileSync(file, refBytesOf(join(REFS, name), name, undefined, REF_LAYOUTS))
    made++
    console.log(`ref  ${name}: ${fileSha(file).slice(0, 12)}`)
  }
  console.log(`${made} reference${made === 1 ? '' : 's'} made`)
  process.exit(0)
}
/** --door-jump=<fixture>:<page>,…: the pages asked for, by fixture (a fixture is named whole, or by its paper's id alone) */
const JUMP_LIST = JUMP_SPEC !== null && JUMP_SPEC !== 'all' ? jumpListOf(JUMP_SPEC, fixtures) : null
if (JUMP_LIST && ONLY && ONLY.some(n => !JUMP_LIST.has(n))) throw new Error(`--only: ${ONLY.filter(n => !JUMP_LIST.has(n)).join(', ')} not among --door-jump's fixtures`)
const asked0 = JUMP_LIST ? fixtures.filter(n => JUMP_LIST.has(n) && (!ONLY || ONLY.includes(n))) : ONLY ? fixtures.filter(n => ONLY.includes(n)) : fixtures
/** --door-draw=inputs reads a paper's pages, not an output's: one fixture a paper */
const asked = DRAW_MODE === 'inputs' ? asked0.filter((n, i) => asked0.findIndex(m => nameOf(m).paper === nameOf(n).paper) === i) : asked0
if (ONLY && !JUMP_LIST && asked0.length !== ONLY.length) throw new Error(`--only: no fixture ${ONLY.filter(n => !fixtures.includes(n)).join(', ')} in ${FIXTURES}`)
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
  const H = await import(join(ENGINE, 'src/pdf-reader/engine/layer-proto/hyph.mjs'))
  // (each file in its encoding, the engine's TEX_PATTERN_ENCODINGS: hyph-utf8's French, Spanish and Portuguese are UTF-8, TeX's
  // 8-bit files Latin-1; an engine that names none reads its two as Latin-1, as before)
  for (const [lang, rel] of Object.entries(H.TEX_PATTERN_FILES)) {
    if (!existsSync(join(TEXMF, rel))) continue
    const encoding = H.TEX_PATTERN_ENCODINGS?.[lang] ?? 'latin1'
    HYPH.set(lang, JSON.stringify(H.patternsOfTex(readFileSync(join(TEXMF, rel), encoding), encoding)))
  }
}
function fileFor(path) {
  if (path.startsWith('/gate/')) return ['page.html', 'page.mjs', 'proto.mjs', 'measure.mjs', 'links.mjs', ...(DOOR !== null ? ['door.mjs'] : []), ...(DOOR_PARTS !== null ? ['door-parts.mjs'] : []), ...(DOOR_ORDER !== null || DOOR_JUMP !== null ? ['door-common.mjs', 'door-order.mjs'] : []), ...(DOOR_JUMP !== null ? ['door-jump.mjs'] : []), ...(DOOR_DRAW !== null ? ['door-common.mjs', 'door-draw.mjs'] : [])].includes(path.slice(6)) ? join(GATE, path.slice(6)) : null
  if (path.startsWith('/proto-fonts/')) return /^\/proto-fonts\/lm(?:roman|sans|mono)10-[a-z]+\.otf$/.test(path) ? join(TEXMF, 'fonts/opentype/public/lm', path.slice(13)) : null
  if (path === '/engine/layer/check.mjs') return CHECKER
  if (path === NO_START_PATH) return NO_START_FILE
  if (path === BREAK_ROOM_PATH) return BREAK_ROOM_FILE
  if (path === '/rules/layout-rules.json') return RULES_FILE
  if (path.startsWith('/zod/')) return /^\/zod\/(?:mini|v4)\/[\w./-]+\.js$/.test(path) ? under(ZOD, path.slice(5)) : null
  if (path.startsWith('/engine/')) return /\.(m?js|json)$/.test(path) ? under(join(ENGINE, 'src/pdf-reader/engine'), path.slice(8)) : null
  if (path.startsWith('/pdfjs/')) return /^\/pdfjs\/(build|cmaps|standard_fonts|wasm|iccs)\//.test(path) ? under(PDFJS, path.slice(7)) : null
  if (path.startsWith('/fonts/')) return /^\/fonts\/[A-Za-z0-9._-]+\.(otf|ttf)$/.test(path) ? under(FONTS, path.slice(7)) : null
  if (path.startsWith('/fixtures/')) {
    const [dir, file, ...rest] = path.slice(10).split('/')
    if (rest.length || !fixtures.includes(dir)) return null
    if (file === 'units.json') return trFile(dir, file)
    if (['arxiv.pdf', 'layout.json'].includes(file)) return join(FIXTURES, dir, file)
    // (the page the layer draws over: our base page wrapped by optional content where it could be, else the page itself, basePdf;
    // and the wrap's head fields beside it, layer-gate/wrap.mjs)
    if (file === 'base.pdf') return WRAPS.get(dir)?.file ?? basePdf(dir)
    if (file === 'wrap.json') return WRAPS.get(dir)?.headFile ?? null
    // v0's inputs: the made output's geometry (the prototype's, by paper), the fixture's record (its units file), the
    // prototype's own units file
    if (PROTO && file === 'geometry.json') return geometryFile(dir)
    // the instrument's layout file (its kept renderings): the fixture's own, whichever the hybrid is given
    if (PROTO && file === 'kept-layout.json') return join(REFS, dir, 'layout.json')
    if (PROTO && file === 'record.json') return trFile(dir, 'record.json')
    if (PROTO && file === 'units-p7.json') return protoUnitsOf(dir)
    return null
  }
  if (path.startsWith('/proto/')) { const m = /^\/proto\/([A-Za-z0-9._-]+)\/p(\d+)\.png$/.exec(path); return m && fixtures.includes(m[1]) ? (PROTO_PANELS ? join(PROTO_PANELS, `${m[1]}-p${m[2]}.png`) : join(REFS, m[1], 'proto', `p${m[2]}.png`)) : null }
  if (path.startsWith('/progress/')) { const m = /^\/progress\/([0-9]{2}-[a-z0-9-]+)\/engine\/([A-Za-z0-9._-]+\.png)$/.exec(path); return m ? join(PROGRESS, m[1], 'engine', m[2]) : null }
  if (path.startsWith('/previous/')) { const m = /^\/previous\/([A-Za-z0-9._-]+\.png)$/.exec(path); return m && PREVIOUS_DIR ? join(PREVIOUS_DIR, 'engine', m[1]) : null }
  return null
}
/** the engine's modules that moved into rules/, by the URL the hashed instrument asks them at */
const MOVED_MODULES = { '/engine/font-roles.mjs': 'rules/font-roles.mjs', '/engine/font-coverage.mjs': 'rules/font-coverage.mjs' }
/** each fixture's wrapped page and its head fields, as made or cached (layer-gate/wrap.mjs): fixture -> { file, head, headFile } */
const WRAPS = new Map(), WRAP_RUNS = new Map()
/** a fixture's base page wrapped (once a run a key), served as its base.pdf from then on */
async function wrappedOf(name) {
  if (!WRAPS.has(name)) {
    const { wrapOf } = await import('./layer-gate/wrap.mjs')
    WRAPS.set(name, await wrapOf({ engine: ENGINE, out: join(ROOT, 'out/layer-gate/wrap'), base: basePdf(name), layoutFile: join(FIXTURES, name, 'layout.json'), source: sourceOf(nameOf(name).paper), runs: WRAP_RUNS }))
  }
  return WRAPS.get(name)
}
/** --door: each fixture's bundle and rows, by the path the page asks for them at */
const DOOR_FILES = new Map()
/** --door-order and --door-jump: a fixture's bundle and rows, made once (a promise by fixture); its reference, the pages asked in order
 *  once, with their PNGs served; the tasks a fixture has left (what is served of it goes with the last); the pages --door-jump asks
 *  of it; and the pages of a task */
const DOOR_MADE = new Map(), DOOR_REFS = new Map(), DOOR_LEFT = new Map(), JUMP_PAGES = new Map()
const JUMP_CHUNK = 6
/** --door-parts, --door-order, --door-jump and --door-draw: run.mjs's stand-in, the instrument of door-parts.mjs, door-order.mjs,
 *  door-jump.mjs and door-draw.mjs (each run kept in __gateRuns, each wait told to __gateWait), each run keeping its units' records
 *  (`records`, which the reader's does not) for the comparison of the pages' records, and given no drawOf where __gateNoDraw is set
 *  (--door-draw's reference: every page read live) */
const RUN_STAND_IN = `export * from '/engine/layer-proto/run.mjs?real'
import { openProto as real } from '/engine/layer-proto/run.mjs?real'
export async function openProto(o) { const run = await real({ ...o, records: true, onWait: what => globalThis.__gateWait?.(what), ...(globalThis.__gateNoDraw ? { drawOf: null } : {}) }); (globalThis.__gateRuns ??= []).push(run); return run }
`
const server = createServer((req, res) => {
  let path
  try { path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname) } catch { res.writeHead(400); return res.end() }
  // (--door: the engine's own `../../../core/…` imports, read from /engine/translate/mt.mjs, clamp at the root and name /core, the repository's src/core)
  if (DOOR !== null && path.startsWith('/core/')) path = `/src${path}`
  const hy = /^\/hyph\/([a-z]+)\.json$/.exec(path)
  if (PROTO && hy) {
    if (!HYPH.has(hy[1])) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found') }
    res.writeHead(200, { 'content-type': TYPES['.json'], 'cache-control': 'no-store' })
    return res.end(HYPH.get(hy[1]))
  }
  // (--door: each fixture's bundle and rows as the driver made them, and the repository's modules under src/, TypeScript
  // transpiled as it is served: a directory's module redirected to its index, so that its own imports resolve beside it)
  if (DOOR !== null && DOOR_FILES.has(path)) {
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? TYPES['.json'], 'cache-control': 'no-store' })
    return res.end(DOOR_FILES.get(path))
  }
  if (DOOR !== null && path.startsWith('/src/')) {
    const at = under(join(REPO, 'src'), path.slice(5)), isFile = f => existsSync(f) && statSync(f).isFile()
    const found = at && [at, `${at}.ts`].find(f => /\.(ts|mjs|js)$/.test(f) && isFile(f))
    if (!found && at && isFile(join(at, 'index.ts'))) { res.writeHead(302, { location: `${path.replace(/\/+$/, '')}/index.ts` }); return res.end() }
    if (!found) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found') }
    const code = readFileSync(found, 'utf8')
    res.writeHead(200, { 'content-type': TYPES['.mjs'], 'cache-control': 'no-store' })
    return res.end(found.endsWith('.ts') ? ESBUILD.transformSync(code, { loader: 'ts', format: 'esm', target: 'es2022', sourcefile: found }).code : code)
  }
  // (the hashed instrument, layer-gate/proto.mjs, names two modules by the URLs they had before they moved into rules/: sent on
  // to where they are, so that their own imports resolve beside them; an engine that still has them there serves them itself)
  if (MOVED_MODULES[path] && !existsSync(join(ENGINE, 'src/pdf-reader/engine', path.slice(8)))) { res.writeHead(302, { location: `/engine/${MOVED_MODULES[path]}` }); return res.end() }
  // (--door-parts: run.mjs as the reader imports it is a stand-in that keeps each run it opens and tells the page what it waits
  // for; the module itself is served at ?real)
  if ((DOOR_PARTS !== null || DOOR_ORDER !== null || DOOR_JUMP !== null || DOOR_DRAW !== null) && path === '/engine/layer-proto/run.mjs' && !new URL(req.url, 'http://127.0.0.1').searchParams.has('real')) {
    res.writeHead(200, { 'content-type': TYPES['.mjs'], 'cache-control': 'no-store' })
    return res.end(RUN_STAND_IN)
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
  root: shownPath(ENGINE, REPO), commit: git(ENGINE, ['rev-parse', 'HEAD']), branch: git(ENGINE, ['rev-parse', '--abbrev-ref', 'HEAD']),
  dirty: !!git(ENGINE, ['status', '--porcelain', '--untracked-files=no', '--', 'src/pdf-reader/engine']),
}
const fontsDigest = sha256(readdirSync(FONTS).sort().map(f => `${f}:${statSync(join(FONTS, f)).size}`).join('\n'))
// (--door-memory: the JS heap read precisely, a collection to ask for, and a mark on the command line by which the browser's
// processes are found)
const MEMORY_MARK = `--axt-gate-memory=${process.pid}-${Date.now()}`
const browser = await chromium.launch(MEMORY !== null ? { args: ['--js-flags=--expose-gc', '--enable-precise-memory-info', MEMORY_MARK] } : undefined)
const inputs = {
  tier: TIER, pages: PAGES ? `the first ${PAGES}` : `the first ${PAGES_OF} of each output, every page of ${[...ALL_PAGES].join(', ')}`, scale: 2.5, inkScale: 2, inkMin: 4, composite: COMPOSITE,
  layouts: LAYOUTS, ...(LAYOUTS === 'made' ? { switch: SWITCH } : {}), fixtures: FIXTURES === REFS ? 'data/layer-fixtures' : shownPath(FIXTURES, ROOT), ...(RECORDS ? { records: shownPath(RECORDS, ROOT) } : {}), ...(process.env.LAYER_REFS ? { refs: shownPath(REFS, ROOT) } : {}), ...(process.env.LAYER_GEOMETRY ? { geometry: shownPath(resolve(PROTO_GEOMETRY), ROOT) } : {}), chromium: browser.version(),
  pdfjs: readJson(join(PDFJS, 'package.json')).version, fonts: fontsDigest.slice(0, 16), checker: fileSha(CHECKER).slice(0, 16),
  // the instrument: the measures, their arithmetic (links.mjs: the link measures, 3a-0), and the page that draws and accounts (lost ink's own glyphs)
  measures: sha256([...['measure.mjs', 'score.mjs', 'links.mjs', PROTO ? 'proto.mjs' : 'page.mjs'].map(f => join(GATE, f)), NO_START_FILE, BREAK_ROOM_FILE].map(f => readFileSync(f)).join('\n')).slice(0, 16),
  ...(PARTS ? { parts: String(PARTS) } : {}),
  ...(PROTO ? { kind: 'proto', protoUnits: PROTO_UNITS, place: PROTO_PLACE ? 'the prototype page\'s' : 'the gate\'s', order: PROTO_ORDER ? 'given' : 'layGroups', faces: PROTO_FACES ?? 'the engine\'s default', tex: TEX ? JSON.stringify(TEX) : 'none', rules: { version: RULES.version, sha256: RULES_SHA }, hyphenation: sha256([...HYPH].map(([l, j]) => `${l}:${j}`).join('\n')).slice(0, 16), erasure: 'wrapped' } : {}),
}
const leaks = []
const t0 = Date.now()
const results = new Map()
const failures = []
const queue = asked.slice().sort((a, b) => (ALL_PAGES.has(nameOf(b).paper) ? 1 : 0) - (ALL_PAGES.has(nameOf(a).paper) ? 1 : 0) || a.localeCompare(b))
/** --door-jump: the queue is tasks, a fixture's pages a few to a task (round by round, the long papers first), `JUMP_TASKS` by key */
const JUMP_TASKS = new Map()
if (JUMP_SPEC !== null) {
  const per = new Map(queue.map(name => [name, jumpPagesOf(name)]))
  const rounds = []
  for (const [name, pages] of per) for (let i = 0; i * JUMP_CHUNK < pages.length; i++) (rounds[i] ??= []).push([`${name}#${i}`, { name, pages: pages.slice(i * JUMP_CHUNK, (i + 1) * JUMP_CHUNK) }])
  queue.length = 0
  for (const round of rounds) for (const [key, task] of round) { JUMP_TASKS.set(key, task); queue.push(key) }
  for (const [name, pages] of per) DOOR_LEFT.set(name, Math.ceil(pages.length / JUMP_CHUNK))
}
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
      if (r?.memory) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${name}: measured to page ${MEMORY} (${((Date.now() - tf) / 1000).toFixed(1)} s)`)
      else if (r?.door) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${name}: ${r.line} (${((Date.now() - tf) / 1000).toFixed(1)} s)`)
      else if (r) console.log(`${r.ready ? 'ok  ' : 'FAIL'} ${name}: ${r.ready ? `${r.pages.length} pages, ${r.totals.textDrawn}/${r.totals.textOn} text units drawn${r.summary.parts ? `, in ${r.summary.parts.count} parts` : ''}` : r.why} (${((Date.now() - tf) / 1000).toFixed(1)} s)`)
    }
  } finally { await ctx.close() }
}

async function runFixture(page, name, errors) {
  if (MEMORY !== null) return memoryFixture(page, name, errors)
  if (DOOR_PARTS !== null) return doorPartsFixture(page, name, errors)
  if (DOOR_ORDER !== null) return doorOrderFixture(page, name, errors)
  if (DOOR_JUMP !== null) return doorJumpTask(page, name, errors)
  if (DOOR_DRAW !== null) return DRAW_MODE === 'inputs' ? doorDrawInputs(page, name, errors) : DRAW_MODE === 'jump' ? doorDrawJump(page, name, errors) : doorDrawPages(page, name, errors)
  if (DOOR !== null) return doorFixture(page, name, errors)
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
  // the page the layer draws over: the base page wrapped by optional content (or cached), as the reader's is
  const wrap = await wrappedOf(name)
  Object.assign(meta, { wrap: wrap.key })
  const sources = PROTO_UNITS === 'p7' ? null : await sourcesOf(name)
  const info = await page.evaluate(o => window.gate.open(o), { name, target, sources, ref: refPages(ref), composite: COMPOSITE, units: PROTO_UNITS, pages: PAGES ?? (ALL_PAGES.has(paper) ? 100000 : PAGES_OF), place: PROTO_PLACE?.[name] ?? null, dump: !!DUMP, order: PROTO_ORDER?.[name] ?? null, faces: PROTO_FACES, tex: TEX, rules: '/rules/layout-rules.json', names: RULES_LABELS(target), perf: PERF, parts: PARTS, slices: SLICES })
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
  // (--parts: every row taken in time, take's pieces the units file's, no unit's why left read before its row came)
  const pt = summary.parts
  if (pt && (pt.late.length || pt.pieces.length || pt.whys.length)) { failures.push(name); console.log(`FAIL ${name}: in ${pt.count} parts, ${pt.late.length} rows late (${pt.late.slice(0, 8).join(' ')}), ${pt.pieces.length} units' pieces not the units file's (${pt.pieces.slice(0, 8).join(' ')}), ${pt.whys.length} whys read early (${pt.whys.slice(0, 4).map(w => w.join(':')).join(' ')})`) }
  // (the wrap's own counts, in Node: what it could not hide, by why, and its time)
  summary.wrap = { ...summary.wrap, stats: wrap.head.stats ?? null, ms: wrap.head.ms, rulesPages: Object.keys(wrap.head.rules ?? {}).length }
  // (reported beside the measures: the lines TeX's rule opened or would have; the run's own counts)
  const totals = fixtureTotals(pages, frames, TIER)
  Object.assign(totals, { linesOpened: summary.linesOpened ?? null, linesUnopened: summary.linesUnopened ?? null })
  return { name, ready: true, info, meta, pages, totals, summary }
}

/** the browser's resident memory, KB: the process launched with MEMORY_MARK on its command line and every process under it */
function rssKb() {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,command='], { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').map(l => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(l)).filter(Boolean).map(m => [Number(m[1]), Number(m[2]), Number(m[3]), m[4]])
  const root = rows.find(r => r[3].includes(MEMORY_MARK) && !r[3].includes('--type='))?.[0]
  if (root === undefined) return null
  const tree = new Set([root])
  for (let grew = true; grew; ) { grew = false; for (const [pid, ppid] of rows) if (tree.has(ppid) && !tree.has(pid)) { tree.add(pid); grew = true } }
  return rows.filter(r => tree.has(r[0])).reduce((a, r) => a + r[2], 0)
}

/**
 * --door-memory: a fixture's bundle and rows made as --door makes them, then the door asked for page MEMORY at once and for
 * each page in turn, each in a page load of its own (layer-gate/door.mjs memory): what the page holds every 10th page laid
 */
const RSS_BOUND = new WeakSet()
async function memoryFixture(page, name, errors) {
  const { target } = nameOf(name)
  const made = await doorBundleOf(name)
  DOOR_FILES.set(`/door/${name}/bundle.json`, made.bytes)
  DOOR_FILES.set(`/door/${name}/rows.json`, JSON.stringify(made.rows))
  // (once a page: a worker's page is the next fixture's too, and Playwright refuses a name bound twice)
  if (!RSS_BOUND.has(page)) { await page.exposeFunction('axtRss', () => rssKb()); RSS_BOUND.add(page) }
  const o = { name, target, rules: '/rules/layout-rules.json', pages: MEMORY }
  const out = { name, memory: true, ready: true, scenarios: {} }
  for (const scenario of ['jump', 'steps']) {
    await page.goto(`${ORIGIN}/gate/page.html?kind=proto&door=1`)
    await page.waitForFunction(() => window.gateReady === true)
    out.scenarios[scenario] = await page.evaluate(x => window.door.memory(x), { ...o, scenario })
  }
  out.ok = !errors.length
  return out
}

/**
 * --door: a fixture checked through the reader's door (layer-gate/door.mjs). Its bundle and rows made here from the
 * fixture's parts (doorBundleOf), then its pages drawn twice, each in a page load of its own: by the gate's own call of
 * openProto with the door's inputs, and by openLayer over the bundle, its rows taken DOOR a part. Each page compared: the
 * SVG markup, the page PDF.js draws for the door against v0's own original, copyOf's pixels against the run's copy plane
 * (where two differ, the pixel rows that do)
 */
async function doorFixture(page, name, errors) {
  const { paper, target } = nameOf(name)
  const made = await doorBundleOf(name)
  DOOR_FILES.set(`/door/${name}/bundle.json`, made.bytes)
  DOOR_FILES.set(`/door/${name}/rows.json`, JSON.stringify(made.rows))
  // (the wrapped page's links against the page unwrapped, all the paper's pages, in Node: linksComposed, gated at 0)
  const links = await composedLinks(made.composed.base, made.composed.wrapped ? [made.composed.wrapped] : [], made.composed.pages)
  const o = { name, target, rules: '/rules/layout-rules.json', pages: PAGES ?? (ALL_PAGES.has(paper) ? 100000 : PAGES_OF), part: DOOR, shots: DOOR_SHOTS?.want.get(name) ?? [] }
  const open = async () => { await page.goto(`${ORIGIN}/gate/page.html?kind=proto&door=1`); await page.waitForFunction(() => window.gateReady === true) }
  await open()
  const gate = await page.evaluate(x => window.door.gate(x), o)
  for (const g of gate.pages) { DOOR_FILES.set(`/door/${name}/o${g.p}.png`, Buffer.from(g.png, 'base64')); delete g.png }
  await open()
  const door = await page.evaluate(x => window.door.door(x), o)
  if (DOOR_SHOTS) for (const d of door.pages) if (d.copyPng) { mkdirSync(DOOR_SHOTS.dir, { recursive: true }); writeFileSync(join(DOOR_SHOTS.dir, `${name}-p${d.p}.png`), Buffer.from(d.copyPng, 'base64')); writeFileSync(join(DOOR_SHOTS.dir, `${name}-p${d.p}.svg`), d.svg); const g = gate.pages.find(x => x.p === d.p); if (g) writeFileSync(join(DOOR_SHOTS.dir, `${name}-p${d.p}.gate.svg`), g.svg); delete d.copyPng }
  const rowsApart = (a, b) => { const out = []; for (let y = 0; y < Math.max(a.rows.length, b.rows.length); y++) if (a.rows[y] !== b.rows[y]) out.push(y); return out }
  for (const g of gate.pages) DOOR_FILES.delete(`/door/${name}/o${g.p}.png`)
  // (and the gate's own run at its recorded runs' resolution, 1.25 CSS px a unit at dpr 2, the same 2.5 device pixels:
  // whether the door's choice of 2.5 at dpr 1 lays and draws as the gate measures)
  await open()
  const gated = await page.evaluate(x => window.door.gate(x), { ...o, scale: 1.25, dpr: 2, png: false })
  const pages = door.pages.map((d, i) => {
    const g = gate.pages[i]
    const e = { p: d.p, svg: d.svg === g.svg, lang: d.lang === target, size: d.w === g.w && d.h === g.h, words: d.words === g.words, wordsAt: gated.pages[i]?.words === g.words, links: d.links === g.links, wordsSha: g.words, wordsBytes: g.wordsBytes, wordsTokens: g.wordsTokens, source: d.source.sha === g.o.sha, original: d.original.sha === g.o.sha, copy: d.copy.sha === g.c.sha, laid: gated.pages[i]?.recs === g.recs, drawn: gated.pages[i]?.c.sha === g.c.sha, read: gated.pages[i]?.o.sha === g.o.sha }
    if (!e.source) e.sourceRows = rowsApart(d.source, g.o).length
    if (!e.copy) { const ys = rowsApart(d.copy, g.c); e.copyRows = [ys.length, ys[0] ?? null, ys.at(-1) ?? null] }
    if (!e.svg) {
      // the page's two markups, to look at (never in the repository: they hold the paper's translation)
      const dir = join(ROOT, 'out/layer-gate/door-diff')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${name}-p${d.p}-gate.svg`), g.svg)
      writeFileSync(join(dir, `${name}-p${d.p}-door.svg`), d.svg)
    }
    return e
  })
  const all = key => pages.every(e => e[key])
  const ok = pages.length === gate.pages.length && pages.length > 0 && all('svg') && all('lang') && all('size') && all('words') && all('wordsAt') && all('links') && all('original') && all('copy') && door.sheets[0] === door.sheets[1] && door.completeOnce && !links.differing.length && !errors.length
  if (!ok) failures.push(name)
  const n = key => pages.filter(e => e[key]).length
  const line = `${pages.length} pages: SVG ${n('svg')}/${pages.length} equal, words ${n('words')}, links ${n('links')}, copy ${n('copy')}, this load's PDF.js page v0's original on ${n('source')}; at 1.25 x 2 records ${n('laid')}, words ${n('wordsAt')}, copy ${n('drawn')}, original ${n('read')}; rows ${made.meta.rows} (${made.meta.unexpected} not the target's) taken ${DOOR} a part, ${door.stats.dropped} dropped, ${door.stats.drawn} units drawn (the gate's run ${gate.summary.laid}); ${composedLine(links)}; bundle ${made.meta.bytes} bytes, ${made.meta.dropped} units dropped${errors.length ? `; page errors ${errors.splice(0).slice(0, 3).join(' | ')}` : ''}`
  return { name, door: true, ok, ready: true, line, pages, made: made.meta, gate: gate.summary, stats: door.stats, sheets: door.sheets, linksComposed: links }
}

/** --door-jump=<fixture>:<page>,…: the pages by fixture (a fixture named whole, or by its paper's id alone: 2307.16209 for 2307.16209v1-zh) */
function jumpListOf(spec, names) {
  const out = new Map()
  for (const part of spec.split(',')) {
    const [fx, page] = part.split(':')
    const hits = names.includes(fx) ? [fx] : names.filter(n => n.startsWith(`${fx}v`))
    if (hits.length !== 1) throw new Error(`--door-jump=${spec}: ${fx} names ${hits.length ? `${hits.length} fixtures (${hits.join(' ')})` : 'no fixture'}`)
    if (!out.has(hits[0])) out.set(hits[0], new Set())
    out.get(hits[0]).add(Number(page))
  }
  return out
}
/** the pages --door-jump asks of a fixture: those named, or every page the door shows of it (as --door) */
function jumpPagesOf(name) {
  if (!JUMP_PAGES.has(name)) {
    const { paper } = nameOf(name)
    const total = readJson(join(FIXTURES, name, 'layout.json')).paper.pages
    let pages
    if (JUMP_LIST) {
      pages = [...JUMP_LIST.get(name)].sort((a, b) => a - b)
      if (pages.at(-1) > total) throw new Error(`--door-jump: ${name} has ${total} pages, not ${pages.at(-1)}`)
    } else pages = Array.from({ length: Math.min(total, PAGES ?? (ALL_PAGES.has(paper) ? 100000 : PAGES_OF)) }, (_, i) => i + 1)
    JUMP_PAGES.set(name, pages)
  }
  return JUMP_PAGES.get(name)
}
/** a fixture's bundle and rows, made once and served (the door's own, as --door makes them) while the fixture has work */
function madeOf(name) {
  if (!DOOR_MADE.has(name)) {
    DOOR_MADE.set(name, (async () => {
      const made = await doorBundleOf(name)
      DOOR_FILES.set(`/door/${name}/bundle.json`, made.bytes)
      DOOR_FILES.set(`/door/${name}/rows.json`, JSON.stringify(made.rows))
      return made
    })())
  }
  return DOOR_MADE.get(name)
}
/** a fixture's task done: with its last, what was served of it goes */
function doneWith(name) {
  DOOR_LEFT.set(name, (DOOR_LEFT.get(name) ?? 1) - 1)
  if (DOOR_LEFT.get(name) > 0) return
  for (const f of [...DOOR_FILES.keys()]) if (f.startsWith(`/door/${name}/`)) DOOR_FILES.delete(f)
  DOOR_REFS.delete(name)
  DOOR_MADE.delete(name)
  DRAW_CUTS.delete(name)
}
const openDoorPage = async (page, kind) => { await page.goto(`${ORIGIN}/gate/page.html?kind=proto&${kind}=1`); await page.waitForFunction(() => window.gateReady === true) }
/** a fixture's reference, once (the task that needs it first makes it, the others wait for it): the pages 1 to `upTo` asked in order in
 *  a page load of their own (layer-gate/door-order.mjs ref), each page's PDF.js drawing served at /door/<name>/s<p>.png for the copies */
function referenceOf(page, name, upTo) {
  if (!DOOR_REFS.has(name)) {
    DOOR_REFS.set(name, (async () => {
      await madeOf(name)
      await openDoorPage(page, 'doororder')
      const ref = await page.evaluate(x => window.doorOrder.ref(x), { name, target: nameOf(name).target, rules: '/rules/layout-rules.json', pages: upTo })
      for (const e of ref.pages) { DOOR_FILES.set(`/door/${name}/s${e.p}.png`, Buffer.from(e.png, 'base64')); delete e.png }
      return ref
    })())
  }
  return DOOR_REFS.get(name)
}
/** a page's markups that differ, written to out/layer-gate/door-diff/<name>-p<page>-<side>.svg (never in the repository) */
function writeDiff(name, p, sides) {
  const dir = join(ROOT, 'out/layer-gate/door-diff')
  mkdirSync(dir, { recursive: true })
  for (const [side, svg] of Object.entries(sides)) writeFileSync(join(dir, `${name}-p${p}-${side}.svg`), svg)
}
/** what a page asked another way is compared by with the reference's: each answer equal */
const sameAs = (r, g, target) => ({ svg: r.svg === g?.svg, lang: r.lang === target, size: r.w === g?.w && r.h === g?.h, words: r.words === g?.words, links: r.links === g?.links, copy: r.copy.sha === g?.copy.sha, recs: r.recs === g?.recs })
const KEYS = ['svg', 'lang', 'size', 'words', 'links', 'copy', 'recs']
const secondsOf = ms => (ms / 1000).toFixed(1)
/**
 * --door-order: a fixture's pages asked for in another order (layer-gate/door-order.mjs): the reference, the pages asked in order in
 * a page load of its own, and ONE open of the door asked for the same pages in the mode's order, in another. Each page compared with
 * the reference's: SVG markup, word table digest, copyOf's pixels over the reference's PNG of the page, the records of its units; the
 * units left and why, the pages' states and the units drawn; a page asked twice answers alike; no ask fails but by its own abort
 */
async function doorOrderFixture(page, name, errors) {
  const { paper, target } = nameOf(name)
  DOOR_LEFT.set(name, 1)
  try {
    await madeOf(name)
    const pages = PAGES ?? (ALL_PAGES.has(paper) ? 100000 : PAGES_OF)
    const ref = await referenceOf(page, name, pages)
    await openDoorPage(page, 'doororder')
    const run = await page.evaluate(x => window.doorOrder.order(x), { name, target, rules: '/rules/layout-rules.json', pages, mode: DOOR_ORDER })
    const rows = run.pages.map((d, i) => (d.missing ? { p: d.p, missing: true } : { p: d.p, ...sameAs(d, ref.pages[i], target), wordsSha: ref.pages[i]?.words }))
    // (a page's two markups where they differ, to look at: never in the repository, they hold the paper's translation)
    for (const [i, e] of rows.entries()) if (!e.missing && !e.svg) writeDiff(name, e.p, { ref: ref.pages[i]?.svg ?? '', order: run.pages[i].svg })
    const n = key => rows.filter(e => e[key]).length
    const left = { skipped: run.skipped.join('\n') === ref.skipped.join('\n'), states: run.states === ref.states, drawn: run.drawn === ref.drawn }
    const ok = rows.length === ref.pages.length && rows.length > 0 && KEYS.every(k => n(k) === rows.length) && left.skipped && left.states && left.drawn && ref.completes.ok && run.completes.ok && !run.repeats.length && !run.errors.length && !errors.length
    if (!ok) failures.push(name)
    const st = run.stat
    const line = `${rows.length} pages asked ${DOOR_ORDER}: SVG ${n('svg')}/${rows.length} equal, words ${n('words')}, links ${n('links')}, copy ${n('copy')}, records ${n('recs')}; units left (${ref.skipped.length}) ${left.skipped ? 'equal' : 'NOT equal'}, states ${left.states ? 'equal' : 'NOT equal'}, units drawn ${run.drawn}${left.drawn ? '' : ` NOT the reference's ${ref.drawn}`}; completions ${ref.completes.ok && run.completes.ok ? 'told once each, as the run has them' : 'NOT as the run has them'}; ${st.asks} asks${st.bursts ? ` in ${st.bursts} bursts, ${st.aborted} aborted (${st.abortLost} resolved first), ${st.reasks} re-asks` : ''}${run.repeats.length ? `; asked twice and answered differently: ${run.repeats.slice(0, 5).join(' ')}` : ''}${run.errors.length ? `; ask errors ${run.errors.slice(0, 3).join(' | ')}` : ''}${errors.length ? `; page errors ${errors.splice(0).slice(0, 3).join(' | ')}` : ''}`
    return { name, door: true, ok, ready: true, line, pages: rows, mode: DOOR_ORDER, left, stat: st, repeats: run.repeats, errors: run.errors }
  } finally { doneWith(name) }
}
/**
 * --door-jump: a task of a fixture's pages (the key `<fixture>#<i>`), each asked first and alone in a fresh page load
 * (layer-gate/door-jump.mjs) and compared with the reference's page, with J: the pages PDF.js was asked for and the units laid
 * before the page was ready, and with --perf the time to it and the longest task, held to the page's closure Need(p) where
 * the engine exposes one (1b-D1: the pages drawn among its draw, the units laid among its lay entries), gated
 */
async function doorJumpTask(page, key, errors) {
  const { name, pages } = JUMP_TASKS.get(key)
  const { target } = nameOf(name)
  try {
    await madeOf(name)
    const ref = await referenceOf(page, name, jumpPagesOf(name).at(-1))
    const out = []
    for (const p of pages) {
      await openDoorPage(page, 'doorjump')
      const r = await page.evaluate(x => window.doorJump.ask(x), { name, target, rules: '/rules/layout-rules.json', page: p, perf: PERF })
      out.push({ p, ...sameAs(r, ref.pages[p - 1], target), completes: r.completes.ok, j: r.j, closure: r.closure, ...(r.ms ? { ms: r.ms, longest: r.longest, toggle: r.toggle } : {}) })
    }
    const n = key => out.filter(e => e[key]).length
    const ok = out.length === pages.length && KEYS.every(k => n(k) === out.length) && out.every(e => e.completes && (!e.closure || e.closure.within)) && !errors.length
    if (!ok) failures.push(key)
    const mean = f => (out.reduce((a, e) => a + f(e), 0) / out.length).toFixed(1)
    const detail = JUMP_LIST || PERF ? out.map(e => `p${e.p}${e.ms ? ` ${secondsOf(e.ms.open + e.ms.ask)} s (open ${secondsOf(e.ms.open)} + ask ${secondsOf(e.ms.ask)}), longest task ${e.longest} ms,${e.toggle ? ` a toggle's reopen to pages ${e.toggle.pages.join(' and ')} laid ${e.toggle.ms} ms,` : ''}` : ''} ${e.j.drawn.length} pages drawn ${e.j.drawn.length > 8 ? `(${e.j.drawn[0]}..${e.j.drawn.at(-1)})` : `(${e.j.drawn.join(' ')})`}, ${e.j.units} units laid`).join('; ') : ''
    const line = `${out.length} pages asked first and alone (${pages[0]}..${pages.at(-1)}): SVG ${n('svg')}/${out.length} equal, words ${n('words')}, links ${n('links')}, copy ${n('copy')}, records ${n('recs')}, completions ${n('completes')}; J: ${mean(e => e.j.drawn.length)} pages drawn and ${mean(e => e.j.units)} units laid a page; closure: ${out.some(e => e.closure) ? `J within Need(p) on ${out.filter(e => e.closure?.within).length}/${out.length}` : 'n/a'}${detail ? `; ${detail}` : ''}${errors.length ? `; page errors ${errors.splice(0).slice(0, 3).join(' | ')}` : ''}`
    return { name, key, door: true, ok, ready: true, line, pages: out }
  } finally { doneWith(name) }
}

/** --door-draw: a paper's draws as the prepare's container reads them (layer-gate/draws.mjs, a Node child of its own: PDF.js takes a
 *  process's worker at its first document, and this one keeps the stock worker), cached in out/layer-gate/draws/ by arXiv's bytes,
 *  the engine's reading and PDF.js; once a run a paper. { file, pdfjs, pages: [{ draw, why }] } */
const DRAWS = new Map()
function drawsOf(name) {
  const { paper } = nameOf(name)
  if (!DRAWS.has(paper)) {
    DRAWS.set(paper, (async () => {
      const pdf = basePdf(name), script = join(GATE, 'draws.mjs')
      const reading = ['pipeline/draw-data.mjs', 'pipeline/memory.mjs', 'layer-proto/draw.mjs', 'layout/json.mjs', 'layout/pdf-lite.mjs', 'layout/fills.mjs', 'layout/ink.mjs'].map(f => join(ENGINE, 'src/pdf-reader/engine', f)).filter(f => existsSync(f))
      const key = sha256([fileSha(pdf), ...reading.map(fileSha), fileSha(script), readJson(join(PDFJS, 'package.json')).version].join('|')).slice(0, 24)
      const dir = join(ROOT, 'out/layer-gate/draws'), file = join(dir, `${key}.json`)
      if (!existsSync(file)) {
        mkdirSync(dir, { recursive: true })
        await new Promise((ok, no) => execFile(process.execPath, [script, ENGINE, pdf, file], { maxBuffer: 1 << 24 }, e => (e ? no(e) : ok())))
      }
      return { file, ...readJson(file) }
    })())
  }
  return DRAWS.get(paper)
}
/** --door-draw=pages and jump: a fixture's bundle as --door makes it, cut as --door-parts cuts it (the doubling),
 *  its head saying the parts carry draws, every left part with no tokens and its page's draw (drawsOf), served for door-draw.mjs to read as a host does: the units' chunks,
 *  the head, the parts, the left parts (l<page>.json, and each one's gzip size, which the link is charged), the rows (the document
 *  the wrapped page, base.pdf). Once a fixture; what the cut shed is counted */
const DRAW_CUTS = new Map()
function drawCutOf(name) {
  if (!DRAW_CUTS.has(name)) {
    DRAW_CUTS.set(name, (async () => {
      const made = await doorBundleOf(name)
      const D = await drawsOf(name)
      const E = f => join(ENGINE, 'src/pdf-reader/engine', f)
      const [{ readBundle }, { cutBundle }, { startxrefOf }] = await Promise.all(['layer-proto/bundle.mjs', 'layer-proto/cut.mjs', 'layout/tail.mjs'].map(f => import(E(f))))
      const ours = made.composed.page
      const read3 = readBundle(new Uint8Array(made.bytes))
      if (D.pages.length !== read3.paper.pages) throw new Error(`${name}: ${D.pages.length} pages of draws, the paper's ${read3.paper.pages}`)
      const { base, orig } = doorBaseOf(ours, startxrefOf(ours), read3.paper.pages, made.wrap)
      const EMPTY = { perPage: [0], l: [], r: [], y: [], h: [], top: [], bottom: [] }
      // (the head says the parts carry draws, as the prepare's does: the door's drawsComing)
      const cut = await cutBundle(read3, { leftPages: p => ({ first: 0, tokens: EMPTY, spans: [], pairs: [], draw: D.pages[p - 1].draw }), base, orig, draw: true })
      const at = `/door/${name}`
      cut.units.forEach((u, i) => DOOR_FILES.set(`${at}/u${i}.json`, Buffer.from(u.bytes)))
      DOOR_FILES.set(`${at}/head.json`, Buffer.from(cut.head.bytes))
      cut.parts.forEach((p, i) => DOOR_FILES.set(`${at}/p${i}.json`, Buffer.from(p.bytes)))
      for (const l of cut.left) DOOR_FILES.set(`${at}/l${l.page}.json`, Buffer.from(l.bytes))
      // (no part carries a tail: the document a host opens is the wrapped page, base.pdf, through every part)
      const gz = cut.left.map(l => gzipSync(l.bytes).length)
      DOOR_FILES.set(`${at}/cut.json`, JSON.stringify({ units: cut.units.map((u, i) => ({ path: `${at}/u${i}.json`, ref: u.ref })), head: { path: `${at}/head.json`, ref: cut.head.ref }, parts: cut.parts.map((p, i) => ({ path: `${at}/p${i}.json`, ref: p.ref })), gz }))
      DOOR_FILES.set(`${at}/rows.json`, JSON.stringify(made.rows))
      const none = D.pages.flatMap((x, i) => (x.draw ? [] : [`${i + 1}:${x.why}`]))
      return { parts: cut.parts.map(p => p.pages), none, shed: cut.left.filter(l => l.drawShed).map(l => l.page), gz: gz.reduce((a, b) => a + b, 0), raw: cut.left.reduce((a, l) => a + l.bytes.length, 0) }
    })())
  }
  return DRAW_CUTS.get(name)
}
/** --door-draw: a fixture's reference, once (the door over the cut with no drawOf, its pages asked in order: layer-gate/door-draw.mjs
 *  ref), each page's PDF.js drawing served at /door/<name>/s<p>.png for the copies */
function drawRefOf(page, name, upTo) {
  if (!DOOR_REFS.has(name)) {
    DOOR_REFS.set(name, (async () => {
      await drawCutOf(name)
      await openDoorPage(page, 'doordraw')
      const ref = await page.evaluate(x => window.doorDraw.ref(x), { name, target: nameOf(name).target, rules: '/rules/layout-rules.json', pages: upTo })
      for (const e of ref.pages) { DOOR_FILES.set(`/door/${name}/s${e.p}.png`, Buffer.from(e.png, 'base64')); delete e.png }
      return ref
    })())
  }
  return DOOR_REFS.get(name)
}
/** the reads a page's drawing made of PDF.js, held to the run's own account (run.mjs drawStats): no getTextContent or getAnnotations on a
 *  page read from its draw, one of each on a page read live, and a page drawn by PDF.js while one was asked only where the run read
 *  its pixels, once. Null where they hold, else why not */
function readsOf(stats, counts) {
  if (!stats) return 'the run kept no account of its draws (drawStats null)'
  const n = (m, q) => m[q] ?? 0
  for (const q of stats.data) if (n(counts.text, q) || n(counts.annots, q)) return `page ${q}, read from its draw, read by PDF.js too (text ${n(counts.text, q)}, annotations ${n(counts.annots, q)})`
  for (const q of stats.live) if (n(counts.text, q) !== 1 || n(counts.annots, q) !== 1) return `page ${q}, read live, read ${n(counts.text, q)} and ${n(counts.annots, q)} times`
  const data = new Set(stats.data)
  for (const [q, k] of Object.entries(counts.render)) if (data.has(Number(q)) && (k > 1 || !(q in stats.pixels))) return `page ${q} drawn by PDF.js ${k} times while asked, its pixels ${q in stats.pixels ? `read for ${stats.pixels[q]}` : 'never read'}`
  return null
}
/** --door-draw=inputs: a paper's pages, read live in Chromium against their draws (layer-gate/door-draw.mjs inputs) */
async function doorDrawInputs(page, name, errors) {
  const { paper } = nameOf(name)
  const D = await drawsOf(name)
  DOOR_FILES.set(`/door/${paper}/draws.json`, readFileSync(D.file))
  try {
    await openDoorPage(page, 'doordraw')
    const r = await page.evaluate(x => window.doorDraw.inputs(x), { name, paper })
    const ok = r.compared + r.none.length === r.pages && r.equal === r.compared && !r.differ.length && !errors.length
    if (!ok) failures.push(name)
    // (PDF.js's overlaid text of each link against the text of the layer's own glyph points inside it: a measure, never gated)
    const ov = r.overlaid.reduce((a, o) => { for (const k of ['n', 'empty', 'same', 'space', 'other']) a[k] += o[k]; return a }, { n: 0, empty: 0, same: 0, space: 0, other: 0 })
    r.overlaidTotals = ov
    const line = `${r.overlaidLost ? `the draws' links carry no overlaid text where the live read has it (${r.overlaidLost} links: the draw read on pdf-lite's worker with TEXT_GUARD on); ` : ''}${paper}: ${r.pages} pages, ${r.compared} read from their draws and live: equal on ${r.equal} (${r.chars} characters, ${r.nu} of them no reading of their glyph, ${r.links} Link annotations; their overlaid text the layer's glyphs' on ${ov.same}, but for white space on ${ov.space}, other on ${ov.other}, none on ${ov.empty})${r.zeroSign ? ` (${r.zeroSign} numbers equal but the sign of zero)` : ''}; ${r.none.length ? `no draw on ${r.none.length} (${r.none.slice(0, 8).join(' ')})` : 'a draw on every page'}${r.differ.length ? `; differ: ${r.differ.slice(0, 3).join(' | ')}` : ''}${errors.length ? `; page errors ${errors.splice(0).slice(0, 3).join(' | ')}` : ''}`
    return { name, door: true, ok, ready: true, line, inputs: r }
  } finally { DOOR_FILES.delete(`/door/${paper}/draws.json`) }
}
/** --door-draw=pages: a fixture's pages asked in order, drawn from their draws, against the same door reading every page live */
async function doorDrawPages(page, name, errors) {
  const { paper, target } = nameOf(name)
  DOOR_LEFT.set(name, 1)
  try {
    const cut = await drawCutOf(name)
    const pages = PAGES ?? (ALL_PAGES.has(paper) ? 100000 : PAGES_OF)
    const ref = await drawRefOf(page, name, pages)
    await openDoorPage(page, 'doordraw')
    const run = await page.evaluate(x => window.doorDraw.data(x), { name, target, rules: '/rules/layout-rules.json', pages })
    const rows = run.pages.map((d, i) => ({ p: d.p, ...sameAs(d, ref.pages[i], target) }))
    for (const [i, e] of rows.entries()) if (!e.svg) writeDiff(name, e.p, { live: ref.pages[i]?.svg ?? '', data: run.pages[i].svg })
    const n = key => rows.filter(e => e[key]).length
    const left = { skipped: run.skipped.join('\n') === ref.skipped.join('\n'), states: run.states === ref.states, drawn: run.drawn === ref.drawn }
    const reads = readsOf(run.drawStats, run.counts)
    const st = run.drawStats
    const ok = rows.length === ref.pages.length && rows.length > 0 && KEYS.every(k => n(k) === rows.length) && left.skipped && left.states && left.drawn && ref.drawStats === null && reads === null && !errors.length
    if (!ok) failures.push(name)
    const px = st ? Object.values(st.pixels) : []
    const why = k => px.filter(v => v === k).length
    const line = `${rows.length} pages asked in order: SVG ${n('svg')}/${rows.length} equal, words ${n('words')}, links ${n('links')}, copy ${n('copy')}, records ${n('recs')}; units left ${left.skipped ? 'equal' : 'NOT equal'}, states ${left.states ? 'equal' : 'NOT equal'}, units drawn ${run.drawn}${left.drawn ? '' : ` NOT the reference's ${ref.drawn}`}; read from their draws ${st?.data.length ?? 0}, live ${st?.live.length ?? 0}${st?.refused.length ? ` (refused ${st.refused.join(' ')})` : ''}${st?.late.length ? ` (late ${st.late.join(' ')})` : ''}, pixels read ${px.length} (asked ${why('asked')}, freeFor ${why('freeFor')}, paperTo ${why('paperTo')}, crop ${why('crop')}, names ${why('names')}, paint ${why('paint')}), lays again ${st?.retries ?? 0}, draws read in ${Math.round(st?.ms ?? 0)} ms; PDF.js's reads ${reads ?? 'as the run tells them'}; no draw on ${cut.none.length}${cut.none.length ? ` (${cut.none.slice(0, 6).join(' ')})` : ''}, shed ${cut.shed.length}, left parts ${(cut.raw / 1024).toFixed(0)} KiB (${(cut.gz / 1024).toFixed(0)} KiB gzip)${errors.length ? `; page errors ${errors.splice(0).slice(0, 3).join(' | ')}` : ''}`
    return { name, door: true, ok, ready: true, line, pages: rows, left, stats: st, reads, cut }
  } finally { doneWith(name) }
}
/** --door-draw=jump: a task of a fixture's pages, each asked first and alone in a fresh load (every part told at the open) with drawOf,
 *  against the pages reference; J; with --link over the modelled link, with --perf the time */
async function doorDrawJump(page, key, errors) {
  const { name, pages } = JUMP_TASKS.get(key)
  const { target } = nameOf(name)
  try {
    await drawCutOf(name)
    const ref = await drawRefOf(page, name, jumpPagesOf(name).at(-1))
    const out = []
    for (const p of pages) {
      await openDoorPage(page, 'doordraw')
      const r = await page.evaluate(x => window.doorDraw.jump(x), { name, target, rules: '/rules/layout-rules.json', page: p, perf: PERF, link: LINK, draw: !DRAW_OFF })
      out.push({ p, ...sameAs(r, ref.pages[p - 1], target), j: r.j, closure: r.closure, reads: readsOf(r.j.drawStats, r.j.counts), ...(r.ms ? { ms: r.ms, longest: r.longest } : {}) })
    }
    const n = k => out.filter(e => e[k]).length
    const ok = out.length === pages.length && KEYS.every(k => n(k) === out.length) && out.every(e => e.closure.within && (DRAW_OFF || e.reads === null)) && !errors.length
    if (!ok) failures.push(key)
    const detail = out.map(e => {
      const st = e.j.drawStats ?? { data: [], live: [], pixels: {}, retries: 0 }
      return `p${e.p}${e.ms ? ` ask ${secondsOf(e.ms.ask)} s (open ${secondsOf(e.ms.open)} s), longest task ${e.longest} ms,` : ''} read ${st.data.length} from data (${st.data.join(' ')}) and ${st.live.length} live, pixels ${Object.entries(st.pixels).map(([q, w]) => `${q}:${w}`).join(' ') || 'none'}, lays again ${st.retries}, ${e.j.units} units laid${e.j.link ? `, the link ${(e.j.link.bytes / 1e6).toFixed(2)} MB in ${e.j.link.asked} asks` : ''}${e.reads ? `; ${e.reads}` : ''}`
    }).join('; ')
    const line = `${out.length} pages asked first and alone${LINK ? ` over ${LINK[0]} ms and ${(LINK[1] / 1e6).toFixed(1)} MB/s` : ''}: SVG ${n('svg')}/${out.length} equal, words ${n('words')}, links ${n('links')}, copy ${n('copy')}, records ${n('recs')}; ${detail}${errors.length ? `; page errors ${errors.splice(0).slice(0, 3).join(' | ')}` : ''}`
    return { name, key, door: true, ok, ready: true, line, pages: out }
  } finally { doneWith(name) }
}

/** a 32-bit integer's bits mixed (murmur3's finaliser) */
const mix32 = x => { x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return (x ^ (x >>> 16)) >>> 0 }
/** --door-parts: the last page of the part that begins at page a of N, by the schedule (null: the cutter's own, the doubling) */
function targetOf(schedule) {
  const [kind, n] = schedule.split(':')
  if (kind === 'splits') return (a, N) => Math.min(N, a + Number(n) - 1)
  // (a part of 1 to 4 pages, drawn from the seed and the page it begins at, mixed (murmur3's finaliser): the same cut on every run)
  if (kind === 'seed') return (a, N) => Math.min(N, a + (mix32(Math.imul(Number(n), 0x9e3779b1) ^ a) % 4))
  return null
}
/** Q1 over a door's log (its pages' states as it told them, the run's waits): a page told laying is ready (or failed) before the
 *  run waits for a part */
function q1Of(log) {
  const out = [], laying = new Set()
  for (const e of log) {
    const [what, p] = e.split(':')
    if (what === 'laying') laying.add(p)
    else if (what === 'ready' || what === 'failed') laying.delete(p)
    else if (e === 'wait:part' && laying.size) out.push(`a part waited for with page ${[...laying].join(', ')} laying`)
  }
  return out
}
/** the base the door's cuts are made over: the page the layer is drawn over (the wrapped page, or the base page where it could not
 *  be wrapped) as a base of ours (format.mjs layerDraws), with the wrap's head fields where it was wrapped (`wrap`, wrap.mjs's head),
 *  and as arXiv's PDF beside it (`orig`): the fixtures' layout files are made over that page */
function doorBaseOf(page, xref, pages, wrap = null) {
  const pdf = { bytes: page.length, sha256: sha256(page) }
  const fields = wrap?.wrapped ? { stats: wrap.stats, unhidden: wrap.unhidden, labelKept: wrap.labelKept } : {}
  return { base: { source: 'ours', ...pdf, xref, pages, tree: '2025', check: { pages: [pages, pages], boxes: 'equal', carried: 1 }, ...fields }, orig: pdf }
}

/**
 * --door-parts: a fixture's bundle made as --door makes it, cut at the schedule (cut.mjs cutBundle, the head's base the wrapped
 * page), its objects served for the page to read as a host does (layer-gate/door-parts.mjs); its pages drawn by door A (the cut
 * made whole, mergeParts) and door B (no part at the open, each told when the run waits for one), both over the wrapped page,
 * each in a page load of its own, and compared page by page: SVG markup, copyOf's pixels over door A's PNG of the page, the
 * run's records of the page's units; the units left and why; Q1 over door B's log
 */
async function doorPartsFixture(page, name, errors) {
  const { paper, target } = nameOf(name)
  const made = await doorBundleOf(name)
  const E = f => join(ENGINE, 'src/pdf-reader/engine', f)
  const [{ readBundle }, { cutBundle }, { startxrefOf }] = await Promise.all(['layer-proto/bundle.mjs', 'layer-proto/cut.mjs', 'layout/tail.mjs'].map(f => import(E(f))))
  const ours = made.composed.page
  const cutTo = targetOf(DOOR_PARTS)
  const read3 = readBundle(new Uint8Array(made.bytes))
  const { base, orig } = doorBaseOf(ours, startxrefOf(ours), read3.paper.pages, made.wrap)
  const cut = await cutBundle(read3, { leftPages: () => null, base, orig, ...(cutTo ? { target: cutTo } : {}) })
  const at = `/door/${name}`, served = []
  const serve = (path, body) => { DOOR_FILES.set(path, body); served.push(path) }
  cut.units.forEach((u, i) => serve(`${at}/u${i}.json`, Buffer.from(u.bytes)))
  serve(`${at}/head.json`, Buffer.from(cut.head.bytes))
  cut.parts.forEach((p, i) => serve(`${at}/p${i}.json`, Buffer.from(p.bytes)))
  // (no part carries a tail: the document a host opens is the wrapped page, base.pdf, through every part)
  serve(`${at}/cut.json`, JSON.stringify({ units: cut.units.map((u, i) => ({ path: `${at}/u${i}.json`, ref: u.ref })), head: { path: `${at}/head.json`, ref: cut.head.ref }, parts: cut.parts.map((p, i) => ({ path: `${at}/p${i}.json`, ref: p.ref })) }))
  serve(`${at}/rows.json`, JSON.stringify(made.rows))
  // (the wrapped page's links against the page unwrapped, in Node: linksComposed, gated at 0)
  const links = await composedLinks(made.composed.base, made.composed.wrapped ? [made.composed.wrapped] : [], read3.paper.pages)
  const o = { name, target, rules: '/rules/layout-rules.json', pages: PAGES ?? (ALL_PAGES.has(paper) ? 100000 : PAGES_OF) }
  const open = async () => { await page.goto(`${ORIGIN}/gate/page.html?kind=proto&doorparts=1`); await page.waitForFunction(() => window.gateReady === true) }
  try {
    await open()
    const a = await page.evaluate(x => window.doorParts.whole(x), o)
    for (const e of a.pages) { serve(`${at}/s${e.p}.png`, Buffer.from(e.png, 'base64')); delete e.png }
    await open()
    const b = await page.evaluate(x => window.doorParts.parts(x), o)
    const q1 = q1Of(b.log), waits = b.log.filter(e => e === 'wait:part').length
    const pages = b.pages.map((d, i) => {
      const g = a.pages[i]
      return { p: d.p, svg: d.svg === g?.svg, lang: d.lang === target, size: d.w === g?.w && d.h === g?.h, words: d.words === g?.words, links: d.links === g?.links, wordsSha: g?.words, copy: d.copy.sha === g?.copy.sha, recs: d.recs === g?.recs }
    })
    const all = key => pages.every(e => e[key]), n = key => pages.filter(e => e[key]).length
    // the units left: before endParts door B's are door A's less exactly what endParts' accounting adds (a multiset), and after
    // it they are door A's; the pages' states equal at both
    const counts = list => { const m = new Map(); for (const x of list) m.set(x, (m.get(x) ?? 0) + 1); return m }
    const minus = (x, y) => { const m = counts(x); for (const v of y) m.set(v, (m.get(v) ?? 0) - 1); return m }
    const nonNegative = m => [...m.values()].every(v => v >= 0)
    const same = (m, k) => [...new Set([...m.keys(), ...k.keys()])].every(v => (m.get(v) ?? 0) === (k.get(v) ?? 0))
    const lacking = minus(a.skipped, b.before.skipped), added = minus(b.after.skipped, b.before.skipped)
    const left = {
      subset: nonNegative(lacking), accounted: nonNegative(added) && same(lacking, added), after: b.after.skipped.join('\n') === a.skipped.join('\n'),
      statesBefore: b.before.states === a.states, statesAfter: b.after.states === a.states,
      lacking: [...lacking.values()].reduce((x, v) => x + v, 0), whys: [...new Set([...added].filter(([, v]) => v > 0).map(([e]) => e.slice(e.indexOf(':') + 1)))],
    }
    const leftOk = left.subset && left.accounted && left.after && left.statesBefore && left.statesAfter
    const ok = pages.length === a.pages.length && pages.length > 0 && all('svg') && all('lang') && all('size') && all('words') && all('links') && all('copy') && all('recs') && leftOk && !q1.length && !links.differing.length && !errors.length
    if (!ok) failures.push(name)
    const line = `${made.wrap.wrapped ? 'over the wrapped page' : `over the page unwrapped (${made.wrap.why}), every unit the original's`}, ${pages.length} pages, ${cut.parts.length} parts (${DOOR_PARTS}: ${b.parts.map(r => r.join('-')).join(' ')}): SVG ${n('svg')}/${pages.length} equal, words ${n('words')}, links ${n('links')}, copy ${n('copy')}, records ${n('recs')}; units left (${a.skipped.length}): before endParts ${left.subset && left.accounted ? `door A's less the ${left.lacking} its accounting adds${left.whys.length ? ` (${left.whys.join(', ')})` : ''}` : 'NOT door A\'s less the accounting'}, after it ${left.after ? 'equal' : 'NOT equal'}; states ${left.statesBefore && left.statesAfter ? 'equal' : 'NOT equal'} before and after; door B told ${b.needed} of ${b.of} parts as its run waited (${waits} waits), the rest at the end; Q1 ${q1.length ? `broken: ${q1.slice(0, 3).join('; ')}` : 'held'}; ${composedLine(links)}; ${b.drawn} units drawn (door A ${a.drawn})${errors.length ? `; page errors ${errors.splice(0).slice(0, 3).join(' | ')}` : ''}`
    return { name, door: true, ok, ready: true, line, pages, schedule: DOOR_PARTS, parts: b.parts, needed: b.needed, waits, q1, left, linksComposed: links }
  } finally { for (const f of served) DOOR_FILES.delete(f) }
}

/** a record piece as a result's piece (spikes/rows-check.mjs resultOf): a text it translated stays itself, one it left is
 *  the unit's own text piece, white space the wire cut off a piece of its own; any other piece the unit's source piece the
 *  key rule finds (kOfSource), else what it is */
function resultOf(rec, src, kOfSource) {
  const kOf = kOfSource(src.pieces), used = new Set()
  const pieces = rec.pieces.map(p => {
    if (p.t === 'text') {
      if (p.tr) return { ...p }
      const k = src.pieces.findIndex((q, i) => q.t === 'text' && q.s === p.s && (q.src ?? null) === (p.src ?? null) && !used.has(i))
      if (k >= 0) { used.add(k); return src.pieces[k] }
      return { ...p }
    }
    const k = kOf(p)
    return k >= 0 ? src.pieces[k] : p
  })
  return { pieces, state: rec.state, by: rec.by, ...(rec.sentences ? { sentences: rec.sentences } : {}) }
}
/** each paper's bundle units (openPaper's over its source, bundleUnitsOf), once a paper */
const PAPER_UNITS = new Map()
/**
 * Each unit's source pieces for the gate's own run, by its id (null for none): the paper's bundle units' (openPaper's over its
 * source.gz) where the fixture's record names the unit by the same hash (cache.mjs sourceHash: the pack may be of an earlier
 * pipeline), so that the run reads a unit as the reader's door does (rows.mjs unitOf's `source`). Null where the paper has no
 * source here
 */
async function sourcesOf(name) {
  const { paper } = nameOf(name)
  const source = sourceOf(paper), recordFile = trFile(name, 'record.json')
  if (!source || !existsSync(recordFile)) return null
  const E = f => join(ENGINE, 'src/pdf-reader/engine', f)
  const [{ bundleUnitsOf }, { sourceUnitsOf }, { openPaper }, { unpackSource }, { sourceHash }] = await Promise.all(['layer-proto/bundle.mjs', 'layer-proto/rows.mjs', 'pipeline/live.mjs', 'source/tar.mjs', 'pipeline/cache.mjs'].map(f => import(E(f))))
  if (!PAPER_UNITS.has(paper)) PAPER_UNITS.set(paper, bundleUnitsOf(openPaper((await unpackSource(new Uint8Array(readFileSync(source)))).files)))
  const src = sourceUnitsOf({ units: PAPER_UNITS.get(paper) }), record = readJson(recordFile)
  return Promise.all(record.units.map(async (rec, id) => (rec && src[id] && typeof rec.hash === 'string' && (await sourceHash(src[id])) === rec.hash ? src[id].pieces : null)))
}
/**
 * --door: a fixture's bundle, written by the engine from the parts a paper's prepare has (bundle-check.mjs's): its units
 * (openPaper over its source.gz), the geometry the gate gives v0 as its left, the fixture's layout file and its cell rules,
 * the page the layer is drawn over as its base (the wrapped page, layer-gate/wrap.mjs, or the base page where it could not be
 * wrapped); and the rows
 * of the fixture's record over the bundle as a reader reads it (rows.mjs rowOf; a cell of a group kept whole its `kept` row,
 * as layerRows gives it; a name or author the pipeline keeps, no row)
 */
async function doorBundleOf(name) {
  const { paper, target } = nameOf(name)
  const E = f => join(ENGINE, 'src/pdf-reader/engine', f)
  // (--ink: the wrap's ink units in the bundle after the source units', their rows in the layout, as the page pass carries them:
  // pipeline/ink-pass.mjs; an echo is drawn with its source unit's row, the others stay the original's, the gate holding no
  // translation of theirs; on the left their kinds and no anchor, the gate's geometry holding no tokens)
  const inkPass = INK ? await import(E('pipeline/ink-pass.mjs')) : null
  const [{ bundleUnitsOf, readBundle, writeBundle }, { rowOf, sourceUnitsOf, toTranslate }, { openPaper }, { unpackSource }, { kOfSource }, { parseLayout }] = await Promise.all(['layer-proto/bundle.mjs', 'layer-proto/rows.mjs', 'pipeline/live.mjs', 'source/tar.mjs', 'layer/pieces.mjs', 'layout/file.mjs'].map(f => import(E(f))))
  const source = sourceOf(paper)
  if (!source) throw new Error(`${name}: no source.gz for ${paper} under ${SOURCES.join(', ')} (--sources)`)
  if (!PAPER_UNITS.has(paper)) PAPER_UNITS.set(paper, bundleUnitsOf(openPaper((await unpackSource(new Uint8Array(readFileSync(source)))).files)))
  const wrap = await wrappedOf(name)
  const arxiv = new Uint8Array(readFileSync(wrap.file)), unwrapped = new Uint8Array(readFileSync(basePdf(name)))
  const ink = inkPass ? inkPass.inkOfHost(wrap.head.ink ?? null, { units: PAPER_UNITS.get(paper) }) : null
  const layout0 = parseLayout(new Uint8Array(readFileSync(join(FIXTURES, name, 'layout.json'))))
  const layout = ink ? inkPass.layoutWithInk(layout0, ink, ink.units.map(u => u.id)) : layout0
  const g = readJson(geometryFile(name))
  const [, id, version] = /^(.+)v(\d+)$/.exec(paper)
  const bytes = writeBundle({
    paper: { id, version: Number(version), pages: layout.paper.pages },
    base: { bytes: arxiv.length, sha256: sha256(arxiv), url: `/api/v1/original/${id.replace('/', '_')}v${version}` },
    // (a kind for each of the bundle's units: the geometry's, the source's and the structural names' (bundleUnitsOf's `name`
    // units), then the ink units')
    image: '1', units: ink ? inkPass.bundleWithInk(PAPER_UNITS.get(paper), ink) : PAPER_UNITS.get(paper), left: { kinds: [...PAPER_UNITS.get(paper).map((u, i) => g.kinds[i] ?? u[0]), ...(ink ? ink.units.map(u => u.kind) : [])], pages: g.left.pages, units: g.left.units }, layout,
    rules: Object.keys(wrap.head.rules ?? {}).length ? wrap.head.rules : null,
  })
  const bundle = readBundle(bytes), src = sourceUnitsOf(bundle), wanted = new Set(toTranslate(bundle, target))
  const record = readJson(trFile(name, 'record.json'))
  const rows = []
  record.units.forEach((rec, i) => {
    if (!rec || (rec.state === 'kept' && !rec.translation)) return
    if (rec.state === 'kept') rows.push([i, [], 'kept', rec.by ?? null, null, rec.translation])
    else rows.push(rowOf(bundle, i, (rec.state === 'whole' || rec.state === 'partial') && src[i] ? resultOf(rec, src[i], kOfSource) : { state: rec.state, by: rec.by }))
  })
  return { bytes: Buffer.from(bytes), rows, wrap: wrap.head, composed: { page: arxiv, base: unwrapped, wrapped: wrap.head.wrapped ? arxiv : null, pages: bundle.paper.pages }, meta: { bytes: bytes.length, units: bundle.units.length, dropped: bundle.dropped.length, rows: rows.length, unexpected: rows.filter(r => !wanted.has(r[0])).length } }
}

const openNode = async data => (await import('pdfjs-dist/legacy/build/pdf.mjs')).getDocument({ data: data.slice(), verbosity: 0, cMapUrl: `${PDFJS}/cmaps/`, cMapPacked: true, standardFontDataUrl: `${PDFJS}/standard_fonts/`, useSystemFonts: false }).promise

/**
 * linksComposed (3a-0): the pages 1 to N of the documents a reader is given (the wrapped page) whose Link annotations differ from
 * the page's own unwrapped, in rectangle, destination, url, border width, colour, overlaid text or quads (links.mjs composedDiff).
 * In Node, PDF.js's legacy build of the version the browser's is, no page drawn. Gated at 0: the wrap appends a section and
 * rewrites no annotation, and the reader's links are the left document's
 */
async function composedLinks(arxiv, composeds, N) {
  const a = await openNode(new Uint8Array(arxiv))
  try {
    const read = async doc => { const out = []; for (let p = 1; p <= N; p++) out.push(await (await doc.getPage(p)).getAnnotations()); return out }
    const base = await read(a), differing = new Set()
    for (const bytes of composeds) {
      const b = await openNode(new Uint8Array(bytes))
      try { for (const p of composedDiff(base, await read(b))) differing.add(p) } finally { await b.loadingTask.destroy() }
    }
    return { pages: N, documents: composeds.length, differing: [...differing].sort((x, y) => x - y) }
  } finally { await a.loadingTask.destroy() }
}
const composedLine = c => `linksComposed ${c.differing.length} of ${c.pages} pages differ from the page unwrapped${c.documents > 1 ? ` (${c.documents} documents)` : ''}${c.differing.length ? ` (${c.differing.slice(0, 5).join(' ')}${c.differing.length > 5 ? ' ...' : ''})` : ''}`

/**
 * A paper's server costs (--perf), measured afresh: the layout maker's time and its operator lists' (the engine's own
 * maker, layer-fixtures.mjs into a folder of its own, its compile kept from before: nothing is compiled), the wrap's (the
 * base page wrapped in Node, layer-gate/wrap.mjs: its time where this run made it, cached otherwise), and the bytes the reader
 * is sent for the layer beyond the page (the layout file), raw and gzipped
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
  const wrap = await wrappedOf(name)
  rmSync(dir, { recursive: true, force: true })
  return { maker, wrap: { ms: wrap.head.ms, wrapped: wrap.head.wrapped }, layoutBytes, layoutGzip, download: layoutGzip, layoutOf: layoutFile === made ? 'made' : 'fixtures' }
}

await Promise.all(Array.from({ length: Math.min(WORKERS, queue.length) }, worker))
await browser.close()
server.close()
const seconds = Math.round((Date.now() - t0) / 100) / 10
if (leaks.length) { console.log(`FAIL requests that would have left the machine: ${leaks.slice(0, 5).join(' ')}`); failures.push('network') }
if (MEMORY !== null) {
  const ran = [...results.values()].sort((a, b) => a.name.localeCompare(b.name))
  const made = new Date().toISOString()
  const mb = v => (v === null || v === undefined ? '-' : (v / 2 ** 20).toFixed(1))
  for (const r of ran) for (const [scenario, samples] of Object.entries(r.scenarios)) {
    console.log(`\n${r.name}, ${scenario === 'jump' ? `page ${MEMORY + 1} (or the paper's last) asked for at once` : 'each page in turn'}:\n  pages laid | canvases held | canvas MB | JS heap MB | browser RSS MB`)
    for (const x of samples) console.log(`  ${String(x.laid).padStart(10)} | ${String(x.canvases).padStart(13)} | ${mb(x.canvasBytes).padStart(9)} | ${mb(x.heap).padStart(10)} | ${mb(x.rss === null ? null : x.rss * 1024).padStart(14)}`)
  }
  const file = join(ROOT, 'out/layer-gate', `memory-${(engineInfo.commit ?? 'none').slice(0, 8)}${engineInfo.dirty ? '+' : ''}-${made.replace(/[:.]/g, '-')}.json`)
  writeFileSync(file, JSON.stringify({ schema: 1, made, seconds, engine: engineInfo, inputs: { ...inputs, door: DOOR, memory: MEMORY }, fixtures: Object.fromEntries(ran.map(r => [r.name, r])) }))
  console.log(`\nmemory: ${ran.length} outputs, to page ${MEMORY}, in ${seconds} s; the run in ${file}`)
  // (a fixture whose page raised an error is a failed reading, though it returned one)
  process.exit(failures.length || ran.length !== asked.length || ran.some(r => !r.ok) ? 1 : 0)
}
if (DOOR_PARTS !== null) {
  const ran = [...results.values()].sort((a, b) => a.name.localeCompare(b.name))
  const all = ran.flatMap(r => r.pages ?? [])
  const count = key => all.filter(e => e[key]).length
  const made = new Date().toISOString()
  const file = join(ROOT, 'out/layer-gate', `door-parts-${(engineInfo.commit ?? 'none').slice(0, 8)}${engineInfo.dirty ? '+' : ''}-${made.replace(/[:.]/g, '-')}.json`)
  writeFileSync(file, JSON.stringify({ schema: 1, made, seconds, engine: engineInfo, inputs: { ...inputs, doorParts: DOOR_PARTS }, fixtures: Object.fromEntries(ran.map(r => [r.name, r])) }))
  console.log(`\ndoor-parts (${DOOR_PARTS}): ${ran.length} outputs, ${all.length} pages: SVG markup equal on ${count('svg')}, the word tables on ${count('words')}, the link records on ${count('links')}, copyOf's pixels on ${count('copy')}, the records on ${count('recs')}; units left as door A's on ${ran.filter(r => r.left?.subset && r.left.accounted && r.left.after && r.left.statesBefore && r.left.statesAfter).length} outputs (before endParts less its accounting, after it equal; the states too); Q1 held on ${ran.filter(r => r.q1 && !r.q1.length).length}, the runs waiting for a part ${ran.reduce((n, r) => n + (r.waits ?? 0), 0)} times; the wrapped pages whose links differ from the pages unwrapped: ${ran.reduce((n, r) => n + (r.linksComposed?.differing.length ?? 0), 0)} of ${ran.reduce((n, r) => n + (r.linksComposed?.pages ?? 0), 0)}; ${failures.length ? `${failures.length} failed (${failures.join(' ')})` : 'none failed'}, in ${seconds} s; the run in ${file}`)
  process.exit(failures.length || ran.length !== asked.length ? 1 : 0)
}
if (DOOR_ORDER !== null) {
  const ran = [...results.values()].sort((a, b) => a.name.localeCompare(b.name))
  const all = ran.flatMap(r => r.pages ?? [])
  const count = key => all.filter(e => e[key]).length
  const made = new Date().toISOString()
  const file = join(ROOT, 'out/layer-gate', `door-order-${(engineInfo.commit ?? 'none').slice(0, 8)}${engineInfo.dirty ? '+' : ''}-${made.replace(/[:.]/g, '-')}.json`)
  writeFileSync(file, JSON.stringify({ schema: 1, made, seconds, engine: engineInfo, inputs: { ...inputs, doorOrder: DOOR_ORDER }, fixtures: Object.fromEntries(ran.map(r => [r.name, r])) }))
  const sum = key => ran.reduce((n, r) => n + (r.stat?.[key] ?? 0), 0)
  console.log(`\ndoor-order (${DOOR_ORDER}): ${ran.length} outputs, ${all.length} pages, every page compared with the page asked in order: SVG markup equal on ${count('svg')}, the word tables on ${count('words')}, the link records on ${count('links')}, copyOf's pixels on ${count('copy')}, the records on ${count('recs')}; units left, states and units drawn as the reference's on ${ran.filter(r => r.left?.skipped && r.left.states && r.left.drawn).length} outputs; ${sum('asks')} asks${sum('bursts') ? `, ${sum('aborted')} aborted and asked again, ${sum('reasks')} re-asks` : ''}; ${failures.length ? `${failures.length} failed (${failures.join(' ')})` : 'none failed'}, in ${seconds} s; the run in ${file}`)
  process.exit(failures.length || ran.length !== asked.length ? 1 : 0)
}
if (DOOR_JUMP !== null) {
  const ran = [...results.values()].sort((a, b) => a.key.localeCompare(b.key))
  const all = ran.flatMap(r => r.pages ?? [])
  const count = key => all.filter(e => e[key]).length
  const made = new Date().toISOString()
  const file = join(ROOT, 'out/layer-gate', `door-jump-${(engineInfo.commit ?? 'none').slice(0, 8)}${engineInfo.dirty ? '+' : ''}-${made.replace(/[:.]/g, '-')}.json`)
  writeFileSync(file, JSON.stringify({ schema: 1, made, seconds, engine: engineInfo, inputs: { ...inputs, doorJump: DOOR_JUMP }, fixtures: Object.fromEntries(ran.map(r => [r.key, r])) }))
  const drawn = all.map(e => e.j.drawn.length), units = all.map(e => e.j.units)
  const stats = xs => `${(xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length)).toFixed(1)} on average, ${Math.max(0, ...xs)} at most`
  const longest = all.filter(e => e.longest !== undefined).map(e => e.longest)
  console.log(`\ndoor-jump (${DOOR_JUMP}): ${new Set(ran.map(r => r.name)).size} outputs, ${all.length} pages each asked first and alone in a fresh load: SVG markup equal to the page asked in order on ${count('svg')}, the word tables on ${count('words')}, the link records on ${count('links')}, copyOf's pixels on ${count('copy')}, the records on ${count('recs')}; J: pages drawn ${stats(drawn)}, units laid ${stats(units)}; closure: ${all.some(e => e.closure) ? `J within Need(p) on ${all.filter(e => e.closure?.within).length}/${all.length} (Need drew ${stats(all.filter(e => e.closure).map(e => e.closure.draw.length))} pages)` : 'n/a'}${longest.length ? `; the longest task of 50 ms or more a page: ${Math.max(0, ...longest)} ms at most` : ''}; ${failures.length ? `${failures.length} failed (${failures.join(' ')})` : 'none failed'}, in ${seconds} s; the run in ${file}`)
  process.exit(failures.length || new Set(ran.map(r => r.name)).size !== asked.length ? 1 : 0)
}
if (DOOR_DRAW !== null) {
  const ran = [...results.values()].sort((a, b) => (a.key ?? a.name).localeCompare(b.key ?? b.name))
  const all = ran.flatMap(r => r.pages ?? [])
  const count = key => all.filter(e => e[key]).length
  const made = new Date().toISOString()
  const file = join(ROOT, 'out/layer-gate', `door-draw-${(engineInfo.commit ?? 'none').slice(0, 8)}${engineInfo.dirty ? '+' : ''}-${made.replace(/[:.]/g, '-')}.json`)
  writeFileSync(file, JSON.stringify({ schema: 1, made, seconds, engine: engineInfo, inputs: { ...inputs, doorDraw: DOOR_DRAW, link: LINK }, fixtures: Object.fromEntries(ran.map(r => [r.key ?? r.name, r])) }))
  const done = `${failures.length ? `${failures.length} failed (${failures.join(' ')})` : 'none failed'}, in ${seconds} s; the run in ${file}`
  if (DRAW_MODE === 'inputs') {
    const sum = k => ran.reduce((n, r) => n + (Array.isArray(r.inputs?.[k]) ? r.inputs[k].length : (r.inputs?.[k] ?? 0)), 0)
    console.log(`\ndoor-draw (inputs): ${ran.length} papers, ${sum('pages')} pages, ${sum('compared')} read from their draws and live in Chromium: the characters and Link annotations equal on ${sum('equal')} (${sum('chars')} characters, ${sum('nu')} no reading of their glyph, ${sum('links')} Link annotations)${sum('zeroSign') ? ` (${sum('zeroSign')} numbers equal but the sign of zero)` : ''}, differing on ${sum('differ')}${sum('overlaidLost') ? ` (${sum('overlaidLost')} links with no overlaid text in the draws: read on pdf-lite's worker with TEXT_GUARD on, FAIL)` : ''}; no draw on ${sum('none')} (${ran.flatMap(r => r.inputs?.none.map(x => `${nameOf(r.name).paper}:${x}`) ?? []).slice(0, 12).join(' ') || 'none'}); ${done}`)
  } else if (DRAW_MODE === 'pages') {
    const st = k => ran.reduce((n, r) => n + (r.stats?.[k]?.length ?? 0), 0)
    console.log(`\ndoor-draw (pages): ${ran.length} outputs, ${all.length} pages asked in order, drawn from their draws against the same door reading every page live: SVG markup equal on ${count('svg')}, the word tables on ${count('words')}, the link records on ${count('links')}, copyOf's pixels on ${count('copy')}, the records on ${count('recs')}; units left, states and units drawn equal on ${ran.filter(r => r.left?.skipped && r.left.states && r.left.drawn).length} outputs; pages read from data ${st('data')}, live ${st('live')}, refused ${st('refused')}, late ${st('late')}; PDF.js's reads as the run tells them on ${ran.filter(r => r.reads === null).length} outputs; ${done}`)
  } else {
    const ask = all.filter(e => e.ms).map(e => e.ms.ask)
    console.log(`\ndoor-draw (${DOOR_DRAW}${LINK ? `, link ${LINK[0]} ms ${(LINK[1] / 1e6).toFixed(1)} MB/s` : ''}): ${new Set(ran.map(r => r.name)).size} outputs, ${all.length} pages each asked first and alone: SVG markup equal to the page asked in order on ${count('svg')}, the word tables on ${count('words')}, the link records on ${count('links')}, copyOf's pixels on ${count('copy')}, the records on ${count('recs')}; pages read from data ${all.reduce((n, e) => n + (e.j.drawStats?.data.length ?? 0), 0)}, live ${all.reduce((n, e) => n + (e.j.drawStats?.live.length ?? 0), 0)}, pixels read ${all.reduce((n, e) => n + Object.keys(e.j.drawStats?.pixels ?? {}).length, 0)}; closure held on ${all.filter(e => e.closure?.within).length}/${all.length}; PDF.js's reads as the run tells them on ${all.filter(e => e.reads === null).length}/${all.length}${ask.length ? `; the ask ${(ask.reduce((a, b) => a + b, 0) / ask.length / 1000).toFixed(2)} s on average, ${(Math.max(...ask) / 1000).toFixed(2)} s at most` : ''}; ${done}`)
  }
  process.exit(failures.length || new Set(ran.map(r => r.name)).size !== asked.length ? 1 : 0)
}
if (DOOR !== null) {
  const ran = [...results.values()].sort((a, b) => a.name.localeCompare(b.name))
  const all = ran.flatMap(r => r.pages ?? [])
  const count = key => all.filter(e => e[key]).length
  const reach = key => ran.reduce((n, r) => n + (r.gate?.reach?.[key] ?? 0), 0)
  const made = new Date().toISOString()
  const file = join(ROOT, 'out/layer-gate', `door-${(engineInfo.commit ?? 'none').slice(0, 8)}${engineInfo.dirty ? '+' : ''}-${made.replace(/[:.]/g, '-')}.json`)
  writeFileSync(file, JSON.stringify({ schema: 1, made, seconds, engine: engineInfo, inputs: { ...inputs, door: DOOR }, fixtures: Object.fromEntries(ran.map(r => [r.name, r])) }))
  console.log(`\ndoor: ${ran.length} outputs, ${all.length} pages: SVG markup equal on ${count('svg')}, the word tables on ${count('words')} (at the gate's recorded scale on ${count('wordsAt')}), the link records on ${count('links')}, copyOf's pixels the copy plane on ${count('copy')} (drawn over v0's original, whose PNG read back is it on ${count('original')}), the page this load's PDF.js draws v0's original on ${count('source')}; the gate's own run at 1.25 CSS px a unit and dpr 2 against it at 2.5 and dpr 1: the units' records equal on ${count('laid')} pages, the copy planes on ${count('drawn')}, the originals on ${count('read')}; the wrapped pages whose links differ from the pages unwrapped: ${ran.reduce((n, r) => n + (r.linksComposed?.differing.length ?? 0), 0)} of ${ran.reduce((n, r) => n + (r.linksComposed?.pages ?? 0), 0)}; the words the translations have with no token carrying their index: ${reach('noToken')} of ${reach('words')}, and of the sentence starts (the records' sentences.tr) ${reach('startsNoToken')} of ${reach('starts')}; ${failures.length ? `${failures.length} failed (${failures.join(' ')})` : 'none failed'}, in ${seconds} s; the run in ${file}`)
  process.exit(failures.length || ran.length !== asked.length ? 1 : 0)
}

// ---------------------------------------------------------------- the totals, the record, the rule
const floor = readJson(join(GATE, 'floor.json'))
const ran = [...results.values()].filter(r => r.ready).sort((a, b) => a.name.localeCompare(b.name))
const run = {
  schema: 1, tier: TIER, made: new Date().toISOString(), seconds,
  gate: { commit: git(REPO, ['rev-parse', 'HEAD']), dirty: !!git(REPO, ['status', '--porcelain', '--untracked-files=no', '--', 'lab/pdf/spikes/layer-gate', 'lab/pdf/spikes/layer-gate.mjs', 'src/pdf-reader/engine/layer/check.mjs', ':(exclude)lab/pdf/spikes/layer-gate/floor.json']) },
  engine: engineInfo, inputs,
  totals: { all: pooled(ran.map(r => r.totals), TIER), shared: pooled(ran.filter(r => floor.shared.includes(r.name)).map(r => r.totals), TIER) },
  fixtures: Object.fromEntries(ran.map(r => [r.name, { meta: r.meta, info: { pages: r.info.pages, units: r.info.units, located: r.info.located, even: r.info.even, family: r.info.family }, summary: r.summary, totals: r.totals, pages: r.pages.map(compact) }])),
  failed: [...results.values()].filter(r => !r.ready).map(r => ({ name: r.name, why: r.why })),
  // what made the gate exit 1 and left no other trace in the file: an output that threw (it is in neither `fixtures` nor `failed`), one
  // that changed its inputs or took its parts late (it is in `fixtures`), a not-ready one (also in `failed`) and 'network'. Names and
  // that one word, never a message. Every worker is done and the leak check has run: nothing adds to it after this (rules-gate.mjs
  // refuses a run that holds any)
  failures: [...new Set(failures)].sort(),
}
// the server's costs, a paper each (--perf): its first output's
if (PERF) {
  run.perf = { server: {} }
  for (const name of ran.map(r => r.name)) { const { paper } = nameOf(name); if (!run.perf.server[paper]) run.perf.server[paper] = await serverPerf(name) }
}
const completeness = completenessRows(run, TIER)
const outDir = join(ROOT, 'out/layer-gate')
mkdirSync(outDir, { recursive: true })
const runFile = join(outDir, `${TIER}-${(engineInfo.commit ?? 'none').slice(0, 8)}${engineInfo.dirty ? '+' : ''}-${run.made.replace(/[:.]/g, '-')}.json`)
writeFileSync(runFile, JSON.stringify(run))
printTable(run)
console.log(`\n${TIER} tier: ${ran.length} outputs, ${ran.reduce((a, r) => a + r.pages.length, 0)} pages in ${seconds} s on ${WORKERS} workers; the run in ${runFile}`)

let exit = failures.length ? 1 : 0
const bad = completeness.filter(c => c.fails.length)
console.log(`completeness (spec §5): ${bad.length ? `${bad.length} of ${completeness.length} outputs fail: ${bad.map(c => `${c.name} [${c.fails.join(', ')}]`).join('; ')}` : `every one of ${completeness.length} outputs passes`}${bad.length && arg('check') ? ' (under --check the merge rule decides: each check is a measure of it)' : ''}`)
// (the outputs whose page could not be wrapped, every unit then the original's: reported, never silent)
if (PROTO) console.log(wrapLine(completeness))
// (the links' minimums' misses, each output's: the annotations not kept, page:rank, and the moved records not true, page:rank)
for (const c of completeness) {
  if (c.linksWrongAt) console.log(`  ${c.name}: links wrong at ${c.linksWrongAt.slice(0, 40).join(' ')}${c.linksWrongAt.length > 40 ? ' ...' : ''}`)
  if (c.linksLost) console.log(`  ${c.name}: links kept ${pct(c.linksKept)} < ${pct(LINKS_MIN.kept)}, ${c.linksLost.length} not kept: ${c.linksLost.slice(0, 40).join(' ')}${c.linksLost.length > 40 ? ' ...' : ''}`)
  if (c.linksFalse) console.log(`  ${c.name}: moved links true ${pct(c.linksTrue)} < ${pct(LINKS_MIN.true)}, ${c.linksFalse.length} not true: ${c.linksFalse.slice(0, 40).join(' ')}${c.linksFalse.length > 40 ? ' ...' : ''}`)
}
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
  else {
    // (and every output the record's run of this kind holds: a run given another folder of references, the gate's default
    // of 29, is whole by itself and would drop the 30th unseen. An output leaves the record by its own pull request, the
    // record edited so)
    const dropped = droppedOutputs(existsSync(recordAt) ? readJson(recordAt) : null, KEY, Object.keys(run.fixtures))
    if (dropped.length) { console.log(`FAIL --record: the record's ${KEY} run (or its pixel run) holds ${dropped.length} output${dropped.length === 1 ? '' : 's'} this run has not (${dropped.join(' ')}): give the references, translations and geometry its inputs name (LAYER_REFS, LAYER_RECORDS, LAYER_GEOMETRY; lab/pdf/README.md)`); exit = 1 }
    else writeRecords(recordAt, run, completeness)
  }
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

/** the merge rule against a recorded run: the inputs first (a reference or a scale changed is no comparison), then
 *  every measure of every fixture, then the pages */
function checkAgainst(last, run) {
  const out = { failed: false, lines: [] }
  const say = s => { out.lines.push(s); console.log(s) }
  for (const k of ['layouts', 'scale', 'inkScale', 'inkMin', 'composite', 'pages', 'checker', 'measures', 'kind', 'protoUnits', 'place', 'order', 'hyphenation', ...(AGAINST ? [] : ['tex', 'erasure'])].filter(k => !(AGAINST && PROTO && k === 'layouts'))) if (String(last.inputs[k] ?? (k === 'tex' || k === 'erasure' ? 'none' : undefined)) !== String(run.inputs[k] ?? (k === 'tex' || k === 'erasure' ? 'none' : undefined))) { say(`FAIL --check: the record's ${k} is ${last.inputs[k]}, this run's ${run.inputs[k]}: not comparable`); out.failed = true }
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
  const hybridOf = r => { const t = r.inputs.tex && r.inputs.tex !== 'none' ? JSON.parse(r.inputs.tex) : null; return t ? `; the layout file the layer's only source: each unit it locates whole takes its lines, label and placeholders from it, with the units only the file holds (but cells)${t.symbols === 'strict' ? ', a symbol drawn as text asked to be found too' : ''}${t.extents === 'tex' ? ', the file\'s erase rectangles' : ''}` : '' }
  // (and where the run was given its inputs from elsewhere: the references, the prototype's geometry, the translations,
  // as a front end's new cut of the units carries them, spikes/layer-cut.mjs)
  const givenOf = r => [r.inputs.layouts === 'made' && r.inputs.kind === 'proto' ? `the layout files made by the engine's maker (${r.inputs.fixtures})` : null, r.inputs.refs ? `the references of ${r.inputs.refs}` : null, r.inputs.geometry ? `the prototype's geometry of ${r.inputs.geometry}` : null, r.inputs.records ? `the translations of ${r.inputs.records}` : null].filter(Boolean)
  const layoutsOf = r => `${r.inputs.kind === 'proto' ? `v0 (the prototype in the engine), no layout file: the prototype's geometry and ${r.inputs.protoUnits === 'p7' ? "its own staging units" : "the fixtures' record.json"}, ${r.inputs.faces === 'prototype' ? "the prototype's own faces" : "the role table's faces"}${hybridOf(r)}` : r.inputs.layouts === 'made' ? "the engine's own layout files" : r.inputs.layouts === 'fixed' ? "the fixtures' layout files, as made for the layer lab" : `the layout files of ${r.inputs.fixtures}`}${givenOf(r).length ? `; ${givenOf(r).join(', ')}` : ''}`
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
  for (const [key, label] of REPORTED) L.push(`| ${label} (not gated) | ${key === 'pitch' || key === 'paraGap' ? '1' : key === 'onGrid' ? '100.0 %' : key === 'hanging' ? '0.0 %' : '0'} | ${cols.map(c => (key === 'onGrid' || key === 'hanging' ? pct(c[1]?.[key]) : num(c[1]?.[key], 3))).join(' | ')} |`)
  L.push('')
  const below = ms.filter(m => fl[m[0]] !== undefined && run.totals.shared && (() => { const w = closer(m, fl, run.totals.shared); return w !== null && w < 0 })())
  L.push(`**Below the prototype's floor on the shared ten** (${keys[0]}): ${below.length ? below.map(m => m[4]).join(', ') : 'none'}.`, '')
  const head = ['textTranslated', 'textEnglish', 'textBlank', 'cellsTranslated', 'unitsLeft', 'blankLines', 'fullSize', 'overlap', 'residue', 'bites', 'vanished', 'cropForeign', 'cropTextOverlap', 'cropBaselineOff', 'lostInk', 'wrongPageText', 'clipped', ...AGAINST_FILE].map(k => MEASURES.find(m => m[0] === k)).filter(m => ms.includes(m))
  L.push(`## By output (${keys[0]})`, '', `| output | ${head.map(m => m[4]).join(' | ')} | why left |`, `|---|${head.map(() => '---|').join('')}---|`)
  for (const [name, f] of Object.entries(run.fixtures)) L.push(`| ${name} | ${head.map(m => shown(f.totals, m)).join(' | ')} | ${Object.entries(f.totals.left).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || '-'} |`)
  // (the links, 3a-0: the original's links and what the layer does with them, by output; links.mjs)
  if (run.totals.all?.linksTotal !== undefined) {
    L.push('', `## Links (${keys[0]})`, '', 'The original\'s links (T: the Link annotations the reader can carry) and what the layer does with each: kept (a record with its own target, moved or in place on its rectangle), moved and in place records, moved records whose drawn text is the original\'s, records that are wrong (gated at 0). Kept and true have no value where there is nothing to share. Counts are over the gate\'s pages.', '', '| output | links (T) | not carried (U) | placeable in place | kept | moved | in place | true | wrong |', '|---|---|---|---|---|---|---|---|---|')
    const row = (n, t) => `| ${n} | ${t.linksTotal} | ${t.linksUnsupported} | ${t.linksPlaceable} | ${t.linksKeptN} (${pct(t.linksKept)}) | ${t.linksMoved} | ${t.linksInPlace} | ${t.linksTrueN} (${pct(t.linksTrue)}) | ${t.linksWrong ?? 0} |`
    for (const [name, f] of Object.entries(run.fixtures)) L.push(row(name, f.totals))
    L.push(row('all', run.totals.all))
  }
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
  L.push(`| output | pages | lost ink | missing | twice | doubled brackets | duplications | equation numbers shown | clipped | groups drawn partly | labels left in the source | lines over a display | lines opened by a barred mark | links wrong | links kept (at least ${pct(LINKS_MIN.kept)}) | moved links true (at least ${pct(LINKS_MIN.true)}) | ink not whole (capped / timed out / degraded pages) | fails |`, '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const r of rows) L.push(`| ${r.name} | ${r.pages} | ${r.lostInk ?? '-'} | ${r.missing} | ${r.twice} | ${r.brackets} | ${r.duplicated} | ${r.numbers[0]} / ${r.numbers[1]} | ${r.clipped} | ${r.groupsSplit ?? 0} | ${r.labelsSource ?? 0} | ${r.textInDisplay ?? 0} | ${r.lineStartPunct ?? 0} | ${r.linksWrong ?? 0} | ${r.linksKept === undefined ? '-' : pct(r.linksKept)} | ${r.linksTrue === undefined ? '-' : pct(r.linksTrue)} | ${r.ink ? `${r.ink.capped.length} / ${r.ink.timedOut.length} / ${r.ink.degraded.length}` : '-'} | ${r.fails.join(', ') || 'none'} |`)
  // (TeX's file against the drawing: defects held to the run before as rates, until the pull request that removes a
  // cause gates its measure at 0, README)
  const fileMs = AGAINST_FILE.map(k => MEASURES.find(m => m[0] === k)).filter(m => run.tier === 'pixel' || m[1] === 'model')
  L.push('', "## TeX's file against the drawing (held to the run before, not yet at 0)", '', `| output | ${fileMs.map(m => m[4]).join(' | ')} |`, `|---|${fileMs.map(() => '---|').join('')}`)
  for (const [name, f] of Object.entries(run.fixtures)) L.push(`| ${name} | ${fileMs.map(m => f.totals[m[0]] ?? '-').join(' | ')} |`)
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
