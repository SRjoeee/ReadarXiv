// lab/marks/gate.mjs: the equivalence gate of stage 1c-2 (item 4), one paper. Not shipped.
// TODAY: today's front half as the box runs it (live.mjs openPaper, the job's BibTeX make, markedOfPaper: probe, marked
// original, our final pass B), from the lanes' cached compiles, and lane L1's adapter (src/pdf-reader/engine/pipeline/
// instrument.mjs) over B — all imported from L1's worktree (branch rebuild/prepare), read only.
// NEW: readSource over the same tree (the job's .bbl today made, TeX's definitions dump), markSource with the probe's answers
// today's compile took, then today's compile sequence over the marked tree (the marked original by latexmk with its files,
// the final pass over them with graphicx's driver line), compiled in the docker slot where no cache holds it, and
// instrumentFromPlan over that B, read as L1 reads B (readPdf, the wrap's options).
// Compared: where a page of the two B's holds the same glyphs (Unicode, place to 0.01 pt), the owner of each glyph and box
// (its unit's id, role and piece); elsewhere each unit's owned glyphs' text. Writes <out>/<id>.json.
//   node --max-old-space-size=6144 --import tsx lab/marks/gate.mjs --id=<id> --dir=<paper dir> --out=<dir> --defs=<dir>
//        --answers=<answers.json> --bbl=<dir> --compiles=<dir>
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { serialize } from 'node:v8'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readDefinitions } from '../../packages/engine/src/source/definitions.ts'
import { readSource } from '../../packages/engine/src/source/read.ts'
import { markSource } from '../../packages/engine/src/marks/mark.ts'
import { instrumentFromPlan } from '../../packages/engine/src/marks/instrument.ts'
import { DRAFT_OPTION, NO_DRIVER_GROUP } from '../../packages/engine/src/marks/tex.ts'
import { answersOf } from './answers-of.mjs'
import { compiler, treeOf } from './today.mjs'
import { compare, samePage } from './compare.mjs'

const L1 = '/Users/cheongzhiyan/Developer/ArxivTranslate/.worktrees/rb-prepare/'
const im = f => import(pathToFileURL(L1 + f).href)
const live = await im('src/pdf-reader/engine/pipeline/live.mjs')
const tar = await im('src/pdf-reader/engine/source/tar.mjs')
const paperM = await im('src/pdf-reader/engine/layout/paper.mjs')
const baseM = await im('src/pdf-reader/engine/layout/base.mjs')
const { instrumentOf } = await im('src/pdf-reader/engine/pipeline/instrument.mjs')
const { readPdf } = await im('packages/engine/src/index.ts')
const { LITE } = await im('lab/pdf/spikes/lite-pdfjs.mjs')
globalThis.OffscreenCanvas ??= class { getContext() { return { measureText: () => ({ width: 0 }), font: '' } } }

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const id = arg('id'), DIR = arg('dir'), OUT = arg('out')
mkdirSync(OUT, { recursive: true })
const NM = `${L1}node_modules/pdfjs-dist/`
const docOpts = { cMapUrl: `${NM}cmaps/`, cMapPacked: true, standardFontDataUrl: `${NM}standard_fonts/`, verbosity: 0, useSystemFonts: false }
const pdfjs = { getDocument, OPS }
const t0 = performance.now()
const A = JSON.parse(readFileSync(arg('answers'), 'utf8'))[id]
const { files: source } = await tar.unpackSource(new Uint8Array(readFileSync(join(DIR, 'source.gz'))))

// ---- today's
const arxivTask = getDocument({ data: new Uint8Array(readFileSync(join(DIR, 'arxiv.pdf'))), ...docOpts })
const arxiv = await arxivTask.promise
let paper = live.openPaper(source)
const { year, image } = await treeOf(paper, arxiv)
const statsToday = { read: 0, made: 0, ms: 0 }, statsMine = { read: 0, made: 0, ms: 0 }
const compileToday = compiler(id, image, source, arg('compiles'), statsToday)
if (paperM.bibliographyKept(paper) === null) {
  const r = await paperM.madeBibliography(paper, { compile: compileToday, engines: ['pdflatex', 'xelatex', 'lualatex', 'latex'] })
  if ('paper' in r) paper = r.paper
}
const day = await baseM.creationEpochOf(arxiv)
const made = await paperM.markedOfPaper(paper, { compile: compileToday, compileBudgetMs: null, engines: ['pdflatex', 'xelatex', 'lualatex', 'latex'], pages: async () => arxiv.numPages, ...(day ? { sourceDate: day } : {}), textOf: async () => '' })
await arxivTask.destroy()
const out = { id, year, compiler: paper.meta.compiler ?? 'pdflatex', guard: made.guard ?? null, refused: made.refused ?? null }
if (made.refused || !(made.base?.pdf instanceof Uint8Array)) { writeFileSync(join(OUT, `${id}.json`), JSON.stringify({ ...out, why: 'today has no B' })); process.exit(0) }
const docOptions = { ...docOpts, ...LITE }
const today = (await instrumentOf({ paper, finalPdf: made.base.pdf, options: made.options ?? {}, log: made.log ?? '', pdfjs, documentOptions: docOptions, made: { compiler: out.compiler, tree: year, front: 'today' } })).instrument

// ---- the new front half
const main = paper.project.main
const tree = new Map(source)
const stem = main.split('/').pop().replace(/\.[^.]+$/, '')
const bblPath = join(arg('bbl'), `${id}.bbl`)
if (!source.has(`${stem}.bbl`) && existsSync(bblPath)) tree.set(`${stem}.bbl`, new Uint8Array(readFileSync(bblPath)))
const doc = readSource({ main, files: tree }, readDefinitions(readFileSync(join(arg('defs'), `${id}.axtdefs`), 'utf8')))
const { tree: marked, plan } = markSource({ main, files: tree }, doc, { compiler: out.compiler, answers: answersOf(A) })
const overrides = new Map(plan.files.map(p => [p, marked.files.get(p)]))
// (a file the source does not hold, today's made .bbl, as the tree has it where markSource wrote nothing in it)
for (const [p, b] of tree) if (!source.has(p) && !overrides.has(p)) overrides.set(p, b)
const compileMine = compiler(id, image, source, arg('compiles'), statsMine)
const date = Number.isSafeInteger(day) ? { sourceDate: day } : {}
const engine = paper.meta.compiler
const markedC = await compileMine({ main, engine, rerun: true, bibtex: paper.meta.bbl ? false : null, overrides, files: true, ...date })
let finalC = null
if (markedC.ok !== false && markedC.files instanceof Map) {
  const outputs = new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(?:pdf|dvi|xdv|log|blg|synctex(?:\\.gz)?|fls|fdb_latexmk)$`)
  const over = new Map()
  for (const [p, b] of [...overrides, ...markedC.files]) if (overrides.has(p) || !outputs.test(p)) over.set(p, overrides.get(p) ?? b)
  const text = Buffer.from(overrides.get(main)).toString('latin1')
  over.set(main, Uint8Array.from(`${NO_DRIVER_GROUP}\n${text.slice(DRAFT_OPTION.length + 1)}`, c => c.charCodeAt(0) & 0xff))
  finalC = await compileMine({ main, engine, rerun: false, bibtex: false, overrides: over, ...date })
}
if (!finalC?.pdf?.length) { writeFileSync(join(OUT, `${id}.json`), JSON.stringify({ ...out, why: 'the new B did not compile', log: String(markedC.log ?? '').slice(-2000) })); process.exit(0) }
const read = await readPdf(pdfjs, finalC.pdf, { options: docOptions, turned: true })
const pages = read.pages.map(({ raw, page }) => (raw ? { glyphs: raw.glyphs, boxes: raw.boxes, paths: raw.paths ?? [], boxAt: raw.boxAt ?? [], points: raw.points.map(x => (/[A-Z]/.test(x.name) ? { ...x, name: x.name.toLowerCase() } : x)), paras: raw.paras ?? [], paraEnds: raw.paraEnds ?? [], view: [...page.view] } : { glyphs: [], boxes: [], paths: [], boxAt: [], points: [], paras: [], paraEnds: [], view: [...page.view] }))
const mine = instrumentFromPlan({ ink: read.doc, pages, plan, doc, log: markedC.log ?? '', made: { compiler: out.compiler, tree: year }, inkless: answersOf(A).inkless ?? [], texts: answersOf(A).texts })

// ---- compared
const todayPages = today.ink.pages, minePages = read.doc.pages
const same = Array.from({ length: Math.max(todayPages.length, minePages.length) }, (_, p) => samePage(todayPages[p]?.glyphs ?? [], minePages[p]?.glyphs ?? []) && !!todayPages[p] && !!minePages[p])
const chars = todayPages.map(pg => (pg?.glyphs ?? []).map(g => g.u))
const guarded = made.guard?.unmarked ?? []
const cmp = compare({ today, mine, same, chars, guarded })
// (--keep=<dir>: what replay.mjs needs to run the instrument again over the same B, no PDF read)
if (arg('keep')) {
  mkdirSync(arg('keep'), { recursive: true })
  const slim = pages.map(pg => ({ ...pg, glyphs: pg.glyphs.map(g => ({ u: g.u, x0: g.x0, x1: g.x1, ix0: g.ix0, ix1: g.ix1, y: g.y, size: g.size, top: g.top, bottom: g.bottom, ...(g.blank ? { blank: true } : {}) })) }))
  const owners = ins => ({ units: ins.units.map(u => ({ id: u.id, kind: u.kind })), glyphs: ins.glyphs, boxes: ins.boxes })
  writeFileSync(join(arg('keep'), `${id}.v8`), serialize({ id, out, guarded, same, chars, today: owners(today), mine: { pages: slim, plan, doc, log: markedC.log ?? '', inkless: answersOf(A).inkless ?? [], texts: answersOf(A).texts, made: { compiler: out.compiler, tree: year } } }))
}
// (--show=<page>:<from>:<to>: each glyph there with both owners)
if (arg('show')) {
  const [sp, sf, st] = arg('show').split(':').map(Number)
  const tRaw = todayPages[sp - 1]?.glyphs ?? []
  const own = (ins, j) => { const P = ins.glyphs[sp - 1], u = P.unit[j]; return u < 0 ? 'none' : `${ins.units[u].kind}:${ins.units[u].id.slice(0, 8)}:${P.role[j]}:${P.piece[j]}` }
  for (let j = sf; j < Math.min(st, tRaw.length); j++) console.log('SHOW', sp, j, JSON.stringify(tRaw[j].u), own(today, j), own(mine, j))
  const pts = read.pages[sp - 1]?.raw?.points ?? []
  for (const x of pts) if (x.glyph >= sf && x.glyph <= st) console.log('POINT', x.name, x.glyph)
}
const result = { ...out, ms: Math.round(performance.now() - t0), compiles: { today: statsToday, mine: statsMine }, ...cmp, units: { today: today.units.length, mine: mine.units.length, unplacedMine: plan.units.filter(u => u.why).length } }
writeFileSync(join(OUT, `${id}.json`), JSON.stringify(result, null, 1))
console.log(id, JSON.stringify({ pages: result.pages, glyphs: result.glyphs, boxes: result.boxes, compiles: result.compiles.mine }))
