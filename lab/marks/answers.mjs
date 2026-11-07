// lab/marks/answers.mjs: today's prepare front for each corpus paper, from the lanes' cached compiles alone (no TeX run): the
// probe's answers and the complete macros the marked original took (markedOfPaper's `options`: the switches, the inkless
// macros, the texts the probe showed macros set), and the job's .bbl where the
// bibliography draft made one, into <out>/answers.json and <out>/bbl/<id>.bbl; a paper whose compiles no cache holds is listed.
//   node --experimental-strip-types lab/marks/answers.mjs --papers=<papers.json> --set=87 --out=<dir> [--only=…]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { baseM, compiler, HOST_ENGINES, live, paperM, tar, treeOf } from './today.mjs'

process.env.NOCOMPILE = '1'
const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const OUT = arg('out')
if (!OUT?.includes('readarxiv-lab-data')) throw new Error('--out must be under readarxiv-lab-data')
const papers = JSON.parse(readFileSync(arg('papers'), 'utf8')).papers.filter(p => !arg('set') || p.sets.includes(arg('set')))
const only = arg('only')?.split(',')
mkdirSync(join(OUT, 'bbl'), { recursive: true })
const NM = new URL('../../node_modules/pdfjs-dist/', import.meta.url).pathname
const docOpts = { cMapUrl: `${NM}cmaps/`, cMapPacked: true, standardFontDataUrl: `${NM}standard_fonts/`, verbosity: 0, useSystemFonts: false }
globalThis.OffscreenCanvas ??= class { getContext() { return { measureText: () => ({ width: 0 }), font: '' } } }
const out = {}
const missing = []
for (const p of papers) {
  if (only && !only.includes(p.id)) continue
  try {
    const { files } = await tar.unpackSource(new Uint8Array(readFileSync(join(p.dir, 'source.gz'))))
    let paper = live.openPaper(files)
    const task = getDocument({ data: new Uint8Array(readFileSync(join(p.dir, 'arxiv.pdf'))), ...docOpts })
    const arxiv = await task.promise
    const { year, image } = await treeOf(paper, arxiv)
    const compile = compiler(p.id, image, files, join(OUT, 'compiles'))
    let bbl = null
    if (paperM.bibliographyKept(paper) === null) {
      const r = await paperM.madeBibliography(paper, { compile, engines: HOST_ENGINES })
      if ('paper' in r) {
        paper = r.paper
        const stem = paper.project.main.split('/').pop().replace(/\.[^.]+$/, '')
        bbl = paper.fsys.read(`${stem}.bbl`) ?? null
        if (bbl) writeFileSync(join(OUT, 'bbl', `${p.id}.bbl`), bbl)
      }
    }
    const day = await baseM.creationEpochOf(arxiv)
    const made = await paperM.markedOfPaper(paper, { compile, compileBudgetMs: null, engines: HOST_ENGINES, pages: async () => arxiv.numPages, ...(day ? { sourceDate: day } : {}), textOf: async () => '' })
    const o = made.options ?? {}
    out[p.id] = { year, image, compiler: paper.meta.compiler ?? 'pdflatex', sourceDate: day ?? null, bbl: !!bbl, refused: made.refused ?? null, guard: made.guard ?? null, switches: o.switches ?? null, inkless: o.inkless ?? null, complete: o.complete instanceof Map ? [...o.complete] : (o.complete ?? null), apart: o.apart ?? null, texts: o.texts instanceof Map ? [...o.texts].flat() : (o.texts ?? null) }
    await task.destroy()
    console.log(p.id, made.refused ? `refused ${made.refused}` : 'ok', Object.keys(o.switches ?? {}).length)
  } catch (e) {
    missing.push(`${p.id}: ${String(e?.message ?? e).slice(0, 200)}`)
    console.log(p.id, 'missing', String(e?.message ?? e).slice(0, 120))
  }
}
writeFileSync(join(OUT, 'answers.json'), JSON.stringify(out))
console.log(JSON.stringify({ papers: Object.keys(out).length, missing }))
