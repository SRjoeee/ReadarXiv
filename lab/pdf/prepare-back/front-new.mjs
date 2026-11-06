// lab/pdf/prepare-back/front-new.mjs: the instrument from the rebuilt front half (lane L2's source reader, marks writer and
// instrumentFromPlan), for run.mjs --front=<dir>: <dir> holds lane L2's committed modules at the commit its lane file names
// ready (`git archive <commit> packages/engine/src/marks packages/engine/src/source lab/marks | tar -x -C <dir>`), read from there
// so that this branch holds none of them before the merge. The sequence is L2's gate (lab/marks/gate.mjs at that commit): readSource
// over the tree with the job's .bbl and TeX's definitions dump, markSource with the probe's answers, today's compile sequence
// over the marked tree (the marked original by latexmk with its files, then the final pass with graphicx's driver line), B read as
// the back half reads it, instrumentFromPlan. Compiles come from the caches only (run.mjs's compile: exit 3 where none holds one).
// Not shipped.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** the stage 1c corrections by paper (lanes/L2-source.md, classes 1-10 of stage 1c, run 6's class (a)): a unit of today's the
 *  new reader does not make is stated `stage 1c: <class>` in the candidate's dump, which acceptance.json accepts by that cause */
export const STAGE_1C = {
  '2610.20581v1': 'declared encoding',
  '2610.19159v1': 'row end after a call',
  '2610.21312v1': 'branch not taken',
  '2610.20716v1': 'natexlab prints nothing',
  '2610.21765v1': 'natexlab prints nothing',
  '2307.16209v1': 'orphan ink owned',
  '2406.06525v1': 'note in an author block group',
  '2610.21377v1': 'note in an author block group, formula in its group',
  '2610.30875v1': 'excluded comment',
  '2610.22065v1': 'excluded comment',
  '2608.06007v1': 'float over theorem',
  '2610.21098v1': 'ifdefined decided',
}

export async function newInstrument({ front, id, paper, source, compile, year, pages, day, defs, answers, bbl, pdfjs, documentOptions, readPdf }) {
  const im = f => import(pathToFileURL(join(front, f)).href)
  const { readDefinitions } = await im('packages/engine/src/source/definitions.ts')
  const { readSource } = await im('packages/engine/src/source/read.ts')
  const { markSource } = await im('packages/engine/src/marks/mark.ts')
  const { instrumentFromPlan } = await im('packages/engine/src/marks/instrument.ts')
  const { DRAFT_OPTION, NO_DRIVER_GROUP } = await im('packages/engine/src/marks/tex.ts')
  const { answersOf } = await im('lab/marks/answers-of.mjs')
  const A = answersOf(JSON.parse(readFileSync(answers, 'utf8'))[id])
  const main = paper.project.main
  const tree = new Map(source)
  const stem = main.split('/').pop().replace(/\.[^.]+$/, '')
  const bblPath = join(bbl, `${id}.bbl`)
  if (!source.has(`${stem}.bbl`) && existsSync(bblPath)) tree.set(`${stem}.bbl`, new Uint8Array(readFileSync(bblPath)))
  const doc = readSource({ main, files: tree }, readDefinitions(readFileSync(join(defs, `${id}.axtdefs`), 'utf8')))
  const compiler = paper.meta.compiler ?? 'pdflatex'
  const { tree: marked, plan } = markSource({ main, files: tree }, doc, { compiler, answers: A })
  const overrides = new Map(plan.files.map(p => [p, marked.files.get(p)]))
  for (const [p, b] of tree) if (!source.has(p) && !overrides.has(p)) overrides.set(p, b)
  const date = Number.isSafeInteger(day) ? { sourceDate: day } : {}
  const engine = paper.meta.compiler
  const markedC = await compile({ main, engine, rerun: true, bibtex: paper.meta.bbl ? false : null, overrides, files: true, ...date })
  if (markedC.ok === false || !(markedC.files instanceof Map)) return { refused: 'new front: the marked compile made no files' }
  const outputs = new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(?:pdf|dvi|xdv|log|blg|synctex(?:\\.gz)?|fls|fdb_latexmk)$`)
  const over = new Map()
  for (const [p, b] of [...overrides, ...markedC.files]) if (overrides.has(p) || !outputs.test(p)) over.set(p, overrides.get(p) ?? b)
  const text = Buffer.from(overrides.get(main)).toString('latin1')
  over.set(main, Uint8Array.from(`${NO_DRIVER_GROUP}\n${text.slice(DRAFT_OPTION.length + 1)}`, c => c.charCodeAt(0) & 0xff))
  const finalC = await compile({ main, engine, rerun: false, bibtex: false, overrides: over, ...date })
  if (!finalC?.pdf?.length) return { refused: 'new front: the final pass made no PDF' }
  const read = await readPdf(pdfjs, finalC.pdf, { options: documentOptions, turned: true })
  const raw = read.pages.map(({ raw: r, page }) => (r ? { glyphs: r.glyphs, boxes: r.boxes, paths: r.paths ?? [], boxAt: r.boxAt ?? [], points: r.points.map(x => (/[A-Z]/.test(x.name) ? { ...x, name: x.name.toLowerCase() } : x)), paras: r.paras ?? [], paraEnds: r.paraEnds ?? [], view: [...page.view] } : { glyphs: [], boxes: [], paths: [], boxAt: [], points: [], paras: [], paraEnds: [], view: [...page.view] }))
  const instrument = instrumentFromPlan({ ink: read.doc, pages: raw, plan, doc, log: markedC.log ?? '', made: { compiler, tree: year }, inkless: A.inkless ?? [], texts: A.texts })
  return { instrument: { ...instrument, made: { ...instrument.made, front: `rebuild/source ${front.split('/').pop()}` } }, finalPdf: finalC.pdf, pages }
}
