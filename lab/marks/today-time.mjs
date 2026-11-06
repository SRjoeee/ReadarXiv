// lab/marks/today-time.mjs: today's compile sequence per paper, by step, from the lanes' compile caches (no TeX): today's
// front half as the box runs it (live.mjs openPaper, the job's BibTeX make, markedOfPaper: the probe, the marked original,
// the guard's compiles, our final pass), each compile's TeX milliseconds as its cache entry recorded them (this machine,
// when it was made). Not shipped. Writes one JSON: { <id>: { ms, steps: [{ step, ms }] } }.
//   NOCOMPILE=1 node --import tsx lab/marks/today-time.mjs --papers=<papers.json> --today=<gate6 keep dir> > <out.json>
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { deserialize } from 'node:v8'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { compiler, PINS } from './today.mjs'

const L1 = '/Users/cheongzhiyan/Developer/ArxivTranslate/.worktrees/rb-prepare/'
const im = f => import(pathToFileURL(L1 + f).href)
const live = await im('src/pdf-reader/engine/pipeline/live.mjs')
const tar = await im('src/pdf-reader/engine/source/tar.mjs')
const paperM = await im('src/pdf-reader/engine/layout/paper.mjs')
const baseM = await im('src/pdf-reader/engine/layout/base.mjs')
const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const papers = JSON.parse(readFileSync(arg('papers'), 'utf8')).papers.filter(p => p.sets.includes('87'))
const MINE = '/Users/cheongzhiyan/Developer/readarxiv-lab-data/refactor-2026-11/lanes/L2/marks/compiles'
const out = {}
for (const { id, dir } of papers) {
  const k6 = deserialize(readFileSync(join(arg('today'), `${id}.v8`)))
  const image = PINS.images[String(k6.out.year)].texlive
  const { files: source } = await tar.unpackSource(new Uint8Array(readFileSync(join(dir, 'source.gz'))))
  const base = compiler(id, image, source, MINE)
  const steps = []
  let n = 0
  const compile = async req => {
    const r = await base(req)
    const step = req.draft ? 'bibliography' : req.rerun ? (n++ === 0 ? 'marked' : 'guard') : steps.some(s => s.step === 'marked') ? 'final' : 'probe'
    steps.push({ step, ms: r.ms ?? null })
    return r
  }
  try {
    const task = getDocument({ data: new Uint8Array(readFileSync(join(dir, 'arxiv.pdf'))), verbosity: 0 })
    const arxiv = await task.promise
    let paper = live.openPaper(source)
    if (paperM.bibliographyKept(paper) === null) {
      const r = await paperM.madeBibliography(paper, { compile, engines: ['pdflatex', 'xelatex', 'lualatex', 'latex'] })
      if ('paper' in r) paper = r.paper
    }
    const day = await baseM.creationEpochOf(arxiv)
    await paperM.markedOfPaper(paper, { compile, compileBudgetMs: null, engines: ['pdflatex', 'xelatex', 'lualatex', 'latex'], pages: async () => arxiv.numPages, ...(day ? { sourceDate: day } : {}), textOf: async () => '' })
    await task.destroy()
  } catch (e) {
    steps.push({ step: 'error', why: String(e?.message ?? e).slice(0, 200) })
  }
  out[id] = { ms: steps.reduce((s, x) => s + (x.ms ?? 0), 0), steps }
}
console.log(JSON.stringify(out))
