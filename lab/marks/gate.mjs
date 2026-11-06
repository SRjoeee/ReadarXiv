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
for (const [p, b] of tree) if (!source.has(p)) overrides.set(p, b)
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
const pages = read.pages.map(({ raw }) => (raw ? { glyphs: raw.glyphs, boxes: raw.boxes, points: raw.points.map(x => (/[A-Z]/.test(x.name) ? { ...x, name: x.name.toLowerCase() } : x)), paraEnds: raw.paraEnds ?? [] } : { glyphs: [], boxes: [], points: [], paraEnds: [] }))
const mine = instrumentFromPlan({ ink: read.doc, pages, plan, doc, log: markedC.log ?? '', made: { compiler: out.compiler, tree: year }, inkless: answersOf(A).inkless ?? [] })

// ---- compared
const SOURCE_KINDS = new Set('para heading caption footnote cell abstract theorem figure author affiliation reference name'.split(' '))
const ownerOf = (ins, P, j, kindOf) => { const u = P.unit[j]; if (u < 0) return 'none'; const x = ins.units[u]; return SOURCE_KINDS.has(x?.kind) ? `${x.id.slice(0, 12)}:${P.role[j]}:${P.role[j] === 2 ? P.piece[j] : ''}` : `other:${kindOf(x)}` }
const kindOfToday = x => (/^ink/.test(x?.kind ?? '') ? x.kind : x?.kind ?? '?')
const key = g => `${g.u}|${Math.round(g.x0 * 100)}|${Math.round(g.y * 100)}`
const todayPages = today.ink.pages, minePages = read.doc.pages
const classes = new Map()
const add = (cls, ex) => { const c = classes.get(cls) ?? classes.set(cls, { n: 0, ex: [] }).get(cls); c.n++; if (c.ex.length < 3) c.ex.push(ex) }
let samePages = 0, glyphsCompared = 0, glyphsSame = 0, boxesCompared = 0, boxesSame = 0
const pageGlyphs = (pg) => pg?.glyphs ?? []
for (let p = 0; p < Math.max(todayPages.length, minePages.length); p++) {
  const tg = pageGlyphs(read.pages[p]?.raw ?? null), og = (made.base && today.ink.pages[p]) ? null : null
  void og
  const T = today.glyphs[p], M = mine.glyphs[p]
  const tRaw = todayPages[p]?.glyphs ?? [], mRaw = minePages[p]?.glyphs ?? []
  if (!T || !M || tRaw.length !== mRaw.length || tRaw.some((g, j) => key(g) !== key(mRaw[j]))) { add('page: the two B differ', { page: p + 1, today: tRaw.length, mine: mRaw.length }); continue }
  void tg
  samePages++
  for (let j = 0; j < tRaw.length; j++) {
    glyphsCompared++
    const a = ownerOf(today, T, j, kindOfToday), b = ownerOf(mine, M, j, kindOfToday)
    const aT = a.startsWith('other:') ? 'none' : a
    if (aT === b) { glyphsSame++; continue }
    const role = s => (s === 'none' ? 'none' : s.startsWith('other:') ? s : `role ${s.split(':')[1]}`)
    add(`glyph: ${role(a)} | ${role(b)}${a !== 'none' && b !== 'none' && !a.startsWith('other') && a.split(':')[0] !== b.split(':')[0] ? ' (another unit)' : ''}`, { page: p + 1, glyph: j, u: tRaw[j].u, today: a, mine: b })
  }
  const TB = today.boxes[p], MB = mine.boxes[p]
  if (TB && MB && TB.unit.length === MB.unit.length)
    for (let j = 0; j < TB.unit.length; j++) {
      boxesCompared++
      const a = ownerOf(today, TB, j, kindOfToday), b = ownerOf(mine, MB, j, kindOfToday)
      if ((a.startsWith('other:') ? 'none' : a) === b) boxesSame++
      else add(`box: ${a.split(':')[1] ?? a} | ${b.split(':')[1] ?? b}`, { page: p + 1, box: j, today: a, mine: b })
    }
}
// (--show=<page>:<from>:<to>: each glyph there with both owners)
if (arg('show')) {
  const [sp, sf, st] = arg('show').split(':').map(Number)
  const tRaw = todayPages[sp - 1]?.glyphs ?? []
  for (let j = sf; j < Math.min(st, tRaw.length); j++) console.log('SHOW', sp, j, JSON.stringify(tRaw[j].u), ownerOf(today, today.glyphs[sp - 1], j, kindOfToday), ownerOf(mine, mine.glyphs[sp - 1], j, kindOfToday))
  const pts = read.pages[sp - 1]?.raw?.points ?? []
  for (const x of pts) if (x.glyph >= sf && x.glyph <= st) console.log('POINT', x.name, x.glyph)
}
const result = { ...out, ms: Math.round(performance.now() - t0), compiles: { today: statsToday, mine: statsMine }, pages: { today: todayPages.length, mine: minePages.length, same: samePages }, glyphs: { compared: glyphsCompared, same: glyphsSame }, boxes: { compared: boxesCompared, same: boxesSame }, units: { today: today.units.length, mine: mine.units.length, unplacedMine: plan.units.filter(u => u.why).length }, classes: Object.fromEntries([...classes].sort((a, b) => b[1].n - a[1].n)) }
writeFileSync(join(OUT, `${id}.json`), JSON.stringify(result, null, 1))
console.log(id, JSON.stringify({ pages: result.pages, glyphs: result.glyphs, boxes: result.boxes, compiles: result.compiles.mine }))
