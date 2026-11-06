// lab/source/definitions.mjs: the definitions pass over a corpus, through the pinned TeX images.
//
// For each paper: unpack its source, find the control sequences it uses (packages/engine/src/source/definitions.ts
// namesUsed), write the ask file beside it, and compile the unmarked source ONE pass in draft (no PDF: pdflatex -draftmode,
// xelatex -no-pdf, latex's DVI) with the ask file read at `begindocument/end`, through heavy-slot's docker slot (one
// runner, no network). Keeps `<id>.axtdefs` (the records TeX wrote), `<id>.log` and `<id>.json` (main, compiler, image,
// names asked, time) in --out; the build directory is removed. Licensed sources never leave lab-data: --out must be there.
//
//   node --experimental-strip-types lab/source/definitions.mjs --papers=<papers.json> --set=87 --out=<dir> [--only=id,id]
//        [--prepare=<baseline prepare dir>]   (the tree and compiler the baseline compiled each paper with)
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { askFile, jobName, namesUsed } from '../../packages/engine/src/source/definitions.ts'
import { LEX_RULES } from '../../packages/engine/src/source/kinds.ts'
import { analyze } from '../../src/pdf-reader/engine/source/paper-meta.mjs'
import { inMemory } from '../../src/pdf-reader/engine/source/latex-front.mjs'
import { unpackSource } from '../../src/pdf-reader/engine/source/tar.mjs'

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const OUT = arg('out')
if (!OUT?.includes('readarxiv-lab-data')) throw new Error('--out must be under readarxiv-lab-data (licensed sources stay there)')
const papers = JSON.parse(readFileSync(arg('papers'), 'utf8')).papers.filter(p => !arg('set') || p.sets.includes(arg('set')))
const only = arg('only')?.split(',')
const PREP = arg('prepare')
const PINS = JSON.parse(readFileSync(new URL('../pdf/compile-images.json', import.meta.url), 'utf8'))
const SLOT = '/Users/cheongzhiyan/Developer/readarxiv-lab-data/bin/heavy-slot.sh'
const run = promisify(execFile)
mkdirSync(OUT, { recursive: true })

for (const p of papers) {
  if (only && !only.includes(p.id)) continue
  if (existsSync(join(OUT, `${p.id}.json`)) && !arg('again')) continue
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(p.dir, 'source.gz'))))
  const meta = analyze(inMemory(files))
  const base = PREP ? JSON.parse(readFileSync(join(PREP, `${p.id}.prepare.json`), 'utf8')).paper.tex : null
  const compiler = base?.compiler ?? meta.compiler ?? 'pdflatex'
  const image = base?.image ?? PINS.images[PINS.default].texlive
  const main = meta.main
  const names = namesUsed({ main, files }, LEX_RULES)
  const build = join(OUT, `build-${p.id}`)
  rmSync(build, { recursive: true, force: true })
  for (const [path, bytes] of files) {
    const f = join(build, path)
    mkdirSync(dirname(f), { recursive: true })
    writeFileSync(f, bytes)
  }
  writeFileSync(join(build, 'axt-ask.tex'), askFile(names))
  const stem = jobName(main)
  const first = `\\AddToHook{begindocument/end}{\\input{axt-ask.tex}}\\input{${main}}`
  const engine = { pdflatex: ['pdflatex', '-draftmode'], xelatex: ['xelatex', '-no-pdf'], lualatex: ['lualatex', '--draftmode'], latex: ['latex'] }[compiler] ?? ['pdflatex', '-draftmode']
  const cmd = [...engine, '-interaction=nonstopmode', `-jobname=${stem}`, first]
  const t0 = performance.now()
  const said = await run(SLOT, ['docker', '--', 'nice', '-n', '10', 'docker', 'run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', '-v', `${build}:/work`, '-w', '/work', image, 'sh', '-c', 's=$(date +%s%N); timeout 300 "$@" >/dev/null 2>&1; e=$?; echo "axt-l2: exit $e ms $(( ($(date +%s%N) - s) / 1000000 ))"', 'sh', ...cmd], { maxBuffer: 1 << 26 }).then(r => `${r.stdout}${r.stderr}`, e => `${e?.stdout ?? ''}${e?.stderr ?? ''}`)
  const m = /axt-l2: exit (\d+) ms (\d+)/.exec(said)
  const defs = join(build, `${stem}.axtdefs`), log = join(build, `${stem}.log`)
  if (existsSync(defs)) writeFileSync(join(OUT, `${p.id}.axtdefs`), readFileSync(defs))
  if (existsSync(log)) writeFileSync(join(OUT, `${p.id}.log`), readFileSync(log))
  const info = { id: p.id, main, compiler, image, names: names.size, exit: m ? Number(m[1]) : null, texMs: m ? Number(m[2]) : null, wallMs: Math.round(performance.now() - t0), defs: existsSync(defs) }
  writeFileSync(join(OUT, `${p.id}.json`), `${JSON.stringify(info)}\n`)
  rmSync(build, { recursive: true, force: true })
  console.log(JSON.stringify(info))
}
