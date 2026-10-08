// One of the corpus's compiles (jobs.mjs) by TeX Live itself: the tree's own binaries (bin/aarch64-linux of the
// release ISO the tree was installed from) in a container of the texlive image, the tree mounted read-only and TEXMF
// its distribution tree, as the page's index sees it, behind the installation's texmf-var (updmap's font maps and
// language.dat, which BusyTeX's preload carries; of its names the distribution tree holds only language.dat, .def and .dat.lua, the full lists over the tree's templates) — what
// arXiv's TeX Live would do with the same files. One pass of the job's engine (and xdvipdfmx for XeLaTeX), the dates fixed as measure.mjs fixes them.
//   pnpm exec tsx experiments/pdf-bilingual/tex-page/native-compile.mjs <paper> <job> [--passes=n]
//   → out/tex-measure/native/<paper>__<job>/ (the files, the log, the PDF)
// The release ISO installs no formats; the job's engine's format is made once, by the same binaries from the tree
// (fmtutil.cnf's line for it), into out/tex-measure/native/fmt.
// Needs docker and the record run's papers.jsonl (the probes' fonts).
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { paperJobs } from './jobs.mjs'

const EXP = new URL('..', import.meta.url).pathname
const TREE = process.env.TEXLIVE_TREE ?? join(dirname(realpathSync(join(EXP, 'data/corpus'))), 'tl2026/2026/texmf-dist')
const TL = dirname(dirname(TREE)), YEAR = relative(TL, dirname(TREE))
const [paper, job] = process.argv.slice(2)
const passes = Number(process.argv.find(a => a.startsWith('--passes='))?.slice(9) ?? '1')
const fonts = new Map(readFileSync(join(EXP, 'out/tex-measure/record-old/papers.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)).map(p => [p.id, p.fonts])).get(paper)
const p = await paperJobs(paper, [job], fonts)
const j = p.jobs.get(`${paper}~${job}`)
const dir = join(EXP, 'out/tex-measure/native', `${paper}__${job}`)
rmSync(dir, { recursive: true, force: true })
const files = new Map(p.files)
for (const [k, v] of j.overrides) files.set(k, v)
for (const [path, bytes] of files) { mkdirSync(dirname(join(dir, 'src', path)), { recursive: true }); writeFileSync(join(dir, 'src', path), bytes) }
const engine = j.engine === 'xelatex' ? 'xelatex' : 'pdflatex'
const stem = j.main.replace(/\.tex$/, '')
const fmt = join(EXP, 'out/tex-measure/native/fmt')
mkdirSync(fmt, { recursive: true })
/** fmtutil.cnf: pdflatex pdftex language.dat -translate-file=cp227.tcx *pdflatex.ini; xelatex xetex language.def -etex xelatex.ini */
const ini = engine === 'xelatex' ? `xetex -ini -etex -interaction=batchmode '*xelatex.ini'` : `pdftex -ini -etex -interaction=batchmode -translate-file=cp227.tcx '*pdflatex.ini'`
const format = `[ -f /fmt/${engine}.fmt ] || (cd /fmt && ${ini} >/dev/null 2>&1; echo "format $?")`
const run = [
  format,
  'export TEXFORMATS=/fmt',
  ...Array.from({ length: passes }, () => `${engine} -interaction=batchmode -halt-on-error ${engine === 'xelatex' ? '-no-pdf ' : ''}'${j.main}' >/dev/null 2>&1; echo "pass $?"`),
  ...(engine === 'xelatex' ? [`xdvipdfmx -q -o '${stem}.pdf' '${stem}.xdv'; echo "xdvipdfmx $?"`] : []),
].join('\n')
const out = execFileSync('docker', ['run', '--rm', '-i', '-v', `${TL}:/tl:ro`, '-v', `${join(dir, 'src')}:/work`, '-v', `${fmt}:/fmt`, '-w', '/work', '-e', 'TEXMF={!!$TEXMFSYSVAR,!!$TEXMFDIST}', '-e', 'SOURCE_DATE_EPOCH=1767225600', '-e', 'FORCE_SOURCE_DATE=1', 'texlive/texlive:latest', 'sh', '-c', `export PATH=/tl/${YEAR}/bin/aarch64-linux:$PATH; ${run}`], { encoding: 'utf8' })
console.log(`${paper}~${job} by TeX Live's ${engine}: ${out.trim().split('\n').join(', ')} → ${relative(process.cwd(), join(dir, 'src', `${stem}.pdf`))}`)
