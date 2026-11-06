// lab/marks/front.mjs: the new front half of the prepare as stage 1b makes it, one paper (contract stage1b-compile.md,
// deliverables 4 and 1). Not shipped.
// The instrument's cache (packages/engine/src/compile/cache.ts): its key over the source, the marks code, the tree, the
// compiler, the date and the steps (and the probe's answers while the probe stands); on a miss readSource, markSource and the
// marked compile (drafts only: latexmk over the marked tree, graphicx's draft; no final pass, no 0.01 pt check), through the
// lanes' compile caches or the docker slot (lab/marks/today.mjs), stored; then the instrument from what the store holds
// (readPdf of the draft, instrumentFromPlan). On a miss the instrument is also made from the compile's outputs as they came
// and the two are compared (their digests: the cache gives what a fresh compile gives).
// Compared with today's owners kept by the gate's run 6 (gate.mjs --keep: today's instrument over today's final pass, and the
// new final pass's pages, which are today's where the two B were the same): each page's glyphs and boxes outside the
// \includegraphics frames, by compare.mjs. Writes <out>/<id>.json (gate-sum.mjs sums them); --keep=<dir> the instrument's
// inputs as replay.mjs and lane L1 read them (`mine`), with today's owners.
//   node --max-old-space-size=6144 --import tsx lab/marks/front.mjs --id=<id> --dir=<paper dir> --out=<dir> --store=<dir>
//        --today=<gate6 keep dir> --defs=<dir> --answers=<answers.json> --bbl=<dir> --compiles=<dir> [--keep=<dir>]
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { deserialize, serialize } from 'node:v8'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { decodeStored, encodeStored, instrumentKey } from '../../packages/engine/src/compile/cache.ts'
import { instrumentFromPlan } from '../../packages/engine/src/marks/instrument.ts'
import { markSource } from '../../packages/engine/src/marks/mark.ts'
import { readDefinitions } from '../../packages/engine/src/source/definitions.ts'
import { sha256Hex } from '../../packages/engine/src/source/id.ts'
import { readSource } from '../../packages/engine/src/source/read.ts'
import { answersOf } from './answers-of.mjs'
import { compare, draftPage } from './compare.mjs'
import { compiler, PINS } from './today.mjs'

const L1 = '/Users/cheongzhiyan/Developer/ArxivTranslate/.worktrees/rb-prepare/'
const im = f => import(pathToFileURL(L1 + f).href)
const live = await im('src/pdf-reader/engine/pipeline/live.mjs')
const tar = await im('src/pdf-reader/engine/source/tar.mjs')
const paperM = await im('src/pdf-reader/engine/layout/paper.mjs')
const baseM = await im('src/pdf-reader/engine/layout/base.mjs')
const { readPdf } = await im('packages/engine/src/index.ts')
const { LITE } = await im('lab/pdf/spikes/lite-pdfjs.mjs')
globalThis.OffscreenCanvas ??= class { getContext() { return { measureText: () => ({ width: 0 }), font: '' } } }

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const id = arg('id'), DIR = arg('dir'), OUT = arg('out'), STORE = arg('store')
/** the compile plan's name, a key input: drafts only (stage 1b deliverable 1) */
const STEPS = 'drafts: latexmk over the marked tree, graphicx draft; no final pass'
mkdirSync(OUT, { recursive: true })
mkdirSync(STORE, { recursive: true })
const NM = `${L1}node_modules/pdfjs-dist/`
const docOpts = { cMapUrl: `${NM}cmaps/`, cMapPacked: true, standardFontDataUrl: `${NM}standard_fonts/`, verbosity: 0, useSystemFonts: false }
const pdfjs = { getDocument, OPS }
const t0 = performance.now()
const ms = { source: 0, key: 0, marks: 0, tex: 0, store: 0, pdf: 0, instrument: 0, compare: 0 }
const lap = (k, t) => { ms[k] += performance.now() - t; return performance.now() }
const k6 = deserialize(readFileSync(join(arg('today'), `${id}.v8`)))
const A = JSON.parse(readFileSync(arg('answers'), 'utf8'))[id]
const { files: source } = await tar.unpackSource(new Uint8Array(readFileSync(join(DIR, 'source.gz'))))

// ---- the paper as the box receives it: main file, compiler, tree, date (today's decisions, as the gate's run 6 took them)
const arxivTask = getDocument({ data: new Uint8Array(readFileSync(join(DIR, 'arxiv.pdf'))), ...docOpts })
const arxiv = await arxivTask.promise
let paper = live.openPaper(source)
const year = String(k6.out.year), image = PINS.images[year].texlive
const statsMine = { read: 0, made: 0, ms: 0 }
const compileMine = compiler(id, image, source, arg('compiles'), statsMine)
if (paperM.bibliographyKept(paper) === null) {
  const r = await paperM.madeBibliography(paper, { compile: compiler(id, image, source, arg('compiles')), engines: ['pdflatex', 'xelatex', 'lualatex', 'latex'] })
  if ('paper' in r) paper = r.paper
}
const day = await baseM.creationEpochOf(arxiv)
await arxivTask.destroy()
const sourceDate = Number.isSafeInteger(day) ? day : null
const main = paper.project.main, engine = paper.meta.compiler, compilerName = engine ?? 'pdflatex'
const stem = main.split('/').pop().replace(/\.[^.]+$/, '')
let t = lap('source', t0)

// ---- the key, and the store
const key = instrumentKey({ files: source, main, tree: image, compiler: compilerName, sourceDate, steps: STEPS, answers: A ?? null })
const file = join(STORE, `${key}.axti`)
t = lap('key', t)
const made = { compiler: compilerName, tree: year }
const treeWith = madeFiles => { const tr = new Map(source); for (const [p, b] of madeFiles) tr.set(p, b); return { main, files: tr } }
/** the instrument from a paper's TeX outputs: the reader over the source and what the first pass made, B's pages read */
async function instrumentOf({ doc, plan, pdf, log, answers }) {
  let t1 = performance.now()
  const read = await readPdf(pdfjs, pdf, { options: { ...docOpts, ...LITE }, turned: true })
  const pages = read.pages.map(({ raw, page }) => (raw ? { glyphs: raw.glyphs, boxes: raw.boxes, paths: raw.paths ?? [], boxAt: raw.boxAt ?? [], points: raw.points.map(x => (/[A-Z]/.test(x.name) ? { ...x, name: x.name.toLowerCase() } : x)), paras: raw.paras ?? [], paraEnds: raw.paraEnds ?? [], view: [...page.view] } : { glyphs: [], boxes: [], paths: [], boxAt: [], points: [], paras: [], paraEnds: [], view: [...page.view] }))
  t1 = lap('pdf', t1)
  const a = answersOf(answers)
  const ins = instrumentFromPlan({ ink: read.doc, pages, plan, doc, log, made, inkless: a.inkless ?? [], texts: a.texts })
  lap('instrument', t1)
  return { ins, pages, a }
}
const digestOf = ins => sha256Hex(new Uint8Array(serialize({ units: ins.units, glyphs: ins.glyphs, boxes: ins.boxes, turned: ins.turned ?? null, places: ins.places ?? null, tex: ins.tex, made: ins.made })))

let stored, fresh = null, hit = existsSync(file)
if (hit) stored = decodeStored(new Uint8Array(readFileSync(file)), key)
else {
  // (the first pass's outputs: TeX's definitions dump and the job's .bbl today made, lanes/L2/defs and marks/bbl)
  const definitions = readFileSync(join(arg('defs'), `${id}.axtdefs`), 'utf8')
  const bblPath = join(arg('bbl'), `${id}.bbl`)
  const madeFiles = !source.has(`${stem}.bbl`) && existsSync(bblPath) ? [[`${stem}.bbl`, new Uint8Array(readFileSync(bblPath))]] : []
  const tree = treeWith(madeFiles)
  const doc = readSource(tree, readDefinitions(definitions))
  const { tree: marked, plan } = markSource(tree, doc, { compiler: compilerName, answers: answersOf(A) })
  const overrides = new Map(plan.files.map(p => [p, marked.files.get(p)]))
  for (const [p, b] of tree.files) if (!source.has(p) && !overrides.has(p)) overrides.set(p, b)
  t = lap('marks', t)
  const markedC = await compileMine({ main, engine, rerun: true, bibtex: paper.meta.bbl ? false : null, overrides, files: true, ...(sourceDate !== null ? { sourceDate } : {}) })
  t = lap('tex', t)
  if (!markedC.pdf?.length) {
    writeFileSync(join(OUT, `${id}.json`), JSON.stringify({ id, why: 'the marked draft did not compile', log: String(markedC.log ?? '').slice(-2000) }))
    process.exit(0)
  }
  fresh = { key, definitions, made: madeFiles, answers: A ?? null, plan, pdf: markedC.pdf, log: markedC.log ?? '', compiles: [{ step: 'marked draft', ok: true, ...(Number.isFinite(markedC.ms) ? { ms: markedC.ms } : {}) }], doc }
  const { doc: _d, ...entry } = fresh
  writeFileSync(`${file}.tmp`, encodeStored(entry))
  renameSync(`${file}.tmp`, file)
  stored = decodeStored(new Uint8Array(readFileSync(file)), key)
  t = lap('store', t)
}
const sDoc = readSource(treeWith(stored.made), readDefinitions(stored.definitions))
t = lap('source', t)
const mine = await instrumentOf({ doc: sDoc, plan: stored.plan, pdf: stored.pdf, log: stored.log, answers: stored.answers })
const cache = { hit, key, digest: digestOf(mine.ins) }
if (fresh) {
  const f = await instrumentOf(fresh)
  cache.fresh = digestOf(f.ins)
  cache.equal = cache.fresh === cache.digest
}
t = performance.now()

// ---- compared with today's (run 6's kept owners over today's final pass), outside the frames
const fin = k6.mine.pages
const maps = [], same = [], draftDiffer = []
for (let p = 0; p < Math.max(fin.length, mine.pages.length); p++) {
  const F = fin[p], D = mine.pages[p]
  const dp = F && D ? draftPage(F, D) : null
  maps.push(dp)
  same.push(!!k6.same[p] && !!dp?.same)
  if (k6.same[p] && !dp?.same) draftDiffer.push(p + 1)
}
const cmp = compare({ today: k6.today, mine: mine.ins, same, chars: k6.chars, guarded: k6.guarded, maps })
for (const p of draftDiffer) {
  const c = cmp.classes['draft: page: the draft holds other glyphs than the final pass outside the frames'] ??= { n: 0, ex: [] }
  c.n++
  if (c.ex.length < 3) c.ex.push({ page: p })
}
lap('compare', t)
if (arg('keep')) {
  mkdirSync(arg('keep'), { recursive: true })
  const slim = mine.pages.map(pg => ({ ...pg, glyphs: pg.glyphs.map(g => ({ u: g.u, x0: g.x0, x1: g.x1, ix0: g.ix0, ix1: g.ix1, y: g.y, size: g.size, top: g.top, bottom: g.bottom, ...(g.blank ? { blank: true } : {}) })) }))
  writeFileSync(join(arg('keep'), `${id}.v8`), serialize({ id, out: k6.out, key, mine: { pages: slim, plan: stored.plan, doc: sDoc, log: stored.log, inkless: mine.a.inkless ?? [], texts: mine.a.texts, made } }))
}
const result = { id, year, compiler: compilerName, guard: k6.out.guard ?? null, ms: Math.round(performance.now() - t0), stages: Object.fromEntries(Object.entries(ms).map(([k, v]) => [k, Math.round(v)])), cache, compiles: { mine: statsMine, stored: stored.compiles }, draftDiffer, ...cmp, units: { mine: mine.ins.units.length, unplacedMine: stored.plan.units.filter(u => u.why).length } }
writeFileSync(join(OUT, `${id}.json`), JSON.stringify(result, null, 1))
console.log(id, JSON.stringify({ pages: result.pages, glyphs: result.glyphs, boxes: result.boxes, cache, draftDiffer: draftDiffer.length }))
