// lab/source/definitions.mjs: the definitions pass over a corpus, through the pinned TeX images.
//
// For each paper: unpack its source, find the control sequences it uses (packages/engine/src/source/definitions.ts
// namesUsed), write the ask file beside it, and compile the unmarked source ONE pass in draft (no PDF: pdflatex -draftmode,
// xelatex -no-pdf, latex's DVI) with the ask file read at `begindocument/end`, through heavy-slot's docker slot (one
// runner, no network). Keeps `<id>.axtdefs` (the records TeX wrote), `<id>.log` and `<id>.json` (main, compiler, image,
// names asked, time) in --out; the build directory is removed. Licensed sources never leave lab-data: --out must be there.
//
// --probe: the same pass asks the mark probe at its end (packages/engine/src/marks/probe.ts): its samples from a reading of the
// source with no definitions, its file read at `enddocument/end`; keeps `<id>.probe.json` (the samples the rows are numbered by).
// --bbl=<dir>: a job's .bbl made before (that dir's `<id>.bbl`) in the tree, where the paper ships none (else --out's own).
//
//   node --experimental-strip-types lab/source/definitions.mjs --papers=<papers.json> --set=87 --out=<dir> [--only=id,id]
//        [--prepare=<baseline prepare dir>]   (the tree and compiler the baseline compiled each paper with)
//        [--probe] [--bbl=<dir>] [--plain] [--digests]
// --plain: the pass with neither the ask file nor the probe (the paper's own first pass); --digests: every file the pass wrote
// or changed but the log, the output and the dump, by its SHA-256, in <id>.json `files`, the date fixed (SOURCE_DATE_EPOCH) so
// that two passes compare (review of #608, 4: a measuring pass writes nothing of the paper's otherwise).
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { bblHead, PROBE_FILE, PROBE_HOOK, probeBytes, probeFile, probeSamples } from '../../packages/engine/src/marks/probe.ts'
import { askFile, jobName, NO_DEFINITIONS, namesUsed } from '../../packages/engine/src/source/definitions.ts'
import { ASKED, LEX_RULES } from '../../packages/engine/src/source/kinds.ts'
import { readSource } from '../../packages/engine/src/source/read.ts'
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
  if (existsSync(join(OUT, `${p.id}.json`)) && !process.argv.includes('--again')) continue
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(p.dir, 'source.gz'))))
  const meta = analyze(inMemory(files))
  const base = PREP ? JSON.parse(readFileSync(join(PREP, `${p.id}.prepare.json`), 'utf8')).paper.tex : null
  const compiler = base?.compiler ?? meta.compiler ?? 'pdflatex'
  const image = base?.image ?? PINS.images[PINS.default].texlive
  const main = meta.main
  // (a bibliography an earlier pass made is read by this one, as the compile's later passes read it: its names asked too)
  const made = join(arg('bbl') ?? OUT, `${p.id}.bbl`)
  const madeBbl = !files.has(`${jobName(main)}.bbl`) && existsSync(made)
  if (madeBbl) files.set(`${jobName(main)}.bbl`, new Uint8Array(readFileSync(made)))
  const names = namesUsed({ main, files }, LEX_RULES, ASKED)
  const build = join(OUT, `build-${p.id}`)
  rmSync(build, { recursive: true, force: true })
  for (const [path, bytes] of files) {
    const f = join(build, path)
    mkdirSync(dirname(f), { recursive: true })
    writeFileSync(f, bytes)
  }
  writeFileSync(join(build, 'axt-ask.tex'), askFile(names))
  const stem = jobName(main)
  // (the probe's samples, chosen before TeX: the reader with no definitions)
  const PLAIN = process.argv.includes('--plain')
  const PROBE = process.argv.includes('--probe') && !PLAIN
  const t1 = performance.now()
  const pre = PROBE ? readSource({ main, files }, NO_DEFINITIONS) : null
  const samples = pre ? probeSamples(pre) : null
  const preMs = Math.round(performance.now() - t1)
  if (samples) writeFileSync(join(build, PROBE_FILE), probeBytes(probeFile(samples, compiler, bblHead({ main, files })), pre.encoding))
  const first = PLAIN ? `\\input{${main}}` : `\\AddToHook{begindocument/end}{\\input{axt-ask.tex}}${samples ? PROBE_HOOK : ''}\\input{${main}}`
  const engine = { pdflatex: ['pdflatex', '-draftmode'], xelatex: ['xelatex', '-no-pdf'], lualatex: ['lualatex', '--draftmode'], latex: ['latex'] }[compiler] ?? ['pdflatex', '-draftmode']
  // (and, where the package ships no .bbl of the job, the bibliography the pass asks for: BibTeX's, or biber's where the pass
  // wrote biblatex's control file, as the prepare's first pass makes it; kept as <id>.bbl)
  const bib = files.has(`${stem}.bbl`) && !madeBbl ? '' : madeBbl ? '' : `; if [ -f ${stem}.bcf ]; then biber ${stem}; elif grep -q bibdata ${stem}.aux 2>/dev/null; then bibtex ${stem}; fi`
  const cmd = ['sh', '-c', `"$@" >/dev/null 2>&1${bib} >/dev/null 2>&1; true`, 'sh', ...engine, '-interaction=nonstopmode', `-jobname=${stem}`, first]
  const t0 = performance.now()
  const DIGESTS = process.argv.includes('--digests')
  const said = await run(SLOT, ['docker', '--', 'nice', '-n', '10', 'docker', 'run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', ...(DIGESTS ? ['-e', 'SOURCE_DATE_EPOCH=1700000000', '-e', 'FORCE_SOURCE_DATE=1'] : []), '-v', `${build}:/work`, '-w', '/work', image, 'sh', '-c', 's=$(date +%s%N); timeout 300 "$@" >/dev/null 2>&1; e=$?; echo "axt-l2: exit $e ms $(( ($(date +%s%N) - s) / 1000000 ))"', 'sh', ...cmd], { maxBuffer: 1 << 26 }).then(r => `${r.stdout}${r.stderr}`, e => `${e?.stdout ?? ''}${e?.stderr ?? ''}`)
  const m = /axt-l2: exit (\d+) ms (\d+)/.exec(said)
  const defs = join(build, `${stem}.axtdefs`), log = join(build, `${stem}.log`), bbl = join(build, `${stem}.bbl`)
  if (existsSync(defs)) writeFileSync(join(OUT, `${p.id}.axtdefs`), readFileSync(defs))
  if (bib && existsSync(bbl)) writeFileSync(join(OUT, `${p.id}.bbl`), readFileSync(bbl))
  if (madeBbl) rmSync(join(build, `${stem}.bbl`), { force: true })
  if (existsSync(log)) writeFileSync(join(OUT, `${p.id}.log`), readFileSync(log))
  if (samples) writeFileSync(join(OUT, `${p.id}.probe.json`), JSON.stringify(samples))
  const digests = {}
  if (DIGESTS) {
    const walkDir = (d, rel = '') => readdirSync(join(d, rel), { withFileTypes: true }).flatMap(x => (x.isDirectory() ? walkDir(d, join(rel, x.name)) : [join(rel, x.name)]))
    for (const f of walkDir(build)) {
      if (/^axt-(?:ask|probe)\.tex$|\.(?:axtdefs|log|pdf|dvi|xdv|fls)$|\.synctex(?:\.gz)?$/.test(f)) continue
      const b = readFileSync(join(build, f)), had = files.get(f)
      if (had && Buffer.compare(Buffer.from(had), b) === 0) continue
      digests[f] = createHash('sha256').update(b).digest('hex')
    }
  }
  const info = { id: p.id, main, compiler, image, names: names.size, ...(DIGESTS ? { files: digests } : {}), ...(samples ? { probe: { punct: samples.punct.length, ahead: samples.ahead.length, ink: samples.ink.length, leads: samples.leads.length, preMs } } : {}), bbl: madeBbl ? 'made before' : bib ? existsSync(bbl) : 'shipped', exit: m ? Number(m[1]) : null, texMs: m ? Number(m[2]) : null, wallMs: Math.round(performance.now() - t0), defs: existsSync(defs) }
  writeFileSync(join(OUT, `${p.id}.json`), `${JSON.stringify(info)}\n`)
  if (!process.argv.includes('--keep-build')) rmSync(build, { recursive: true, force: true })
  console.log(JSON.stringify(info))
}
