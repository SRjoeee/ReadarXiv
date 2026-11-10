// lab/marks/time-new.mjs: the rebuilt prepare of one paper, timed stage by stage, every compile made anew (contract stage
// 1b, deliverable 6; the fifth owner's step 3; today's sequence is lab/marks/time-today.mjs). The new sequence: the unmarked
// first pass (the definitions dump, the mark probe at its end, BibTeX or biber where the paper ships no .bbl: one docker
// run), readSource, markSource and the marked compile with its bounded recovery (drafts only: latexmk over the marked tree,
// graphicx's draft), B read, instrumentFromPlan, then the back half (prepareBack: read A, align, locate, wrap, bundle). The
// main file, compiler and tree as the gate's runs take them (live.mjs openPaper, the baseline's prepare dumps). Writes
// <out>/<id>.json: each TeX run's in-container and wall ms, each JavaScript stage's ms. Not shipped.
//   node --max-old-space-size=6144 --import tsx lab/marks/time-new.mjs --dir=<paper dir> --id=<id> --out=<dir> --prepare=<dir>
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { constants as Z, deflateSync, inflateRawSync, inflateSync } from 'node:zlib'
import * as PL from '@cantoo/pdf-lib'
import { prepareBack, readPdf } from '@readarxiv/engine'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { compileMarked } from '../../packages/engine/src/compile/recover.ts'
import { instrumentFromPlan } from '../../packages/engine/src/marks/instrument.ts'
import { bblHead, PROBE_FILE, PROBE_HOOK, probeBytes, probeFile, probeSamples, readAnswers, unprobed } from '../../packages/engine/src/marks/probe.ts'
import { askFile, jobName, NO_DEFINITIONS, namesUsed, readDefinitions } from '../../packages/engine/src/source/definitions.ts'
import { ASKED, LEX_RULES } from '../../packages/engine/src/source/kinds.ts'
import { readSource } from '../../packages/engine/src/source/read.ts'
import { openPaper } from '../../src/pdf-reader/engine/pipeline/live.mjs'
import { unpackSource } from '../../src/pdf-reader/engine/source/tar.mjs'

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const id = arg('id'), DIR = arg('dir'), OUT = arg('out')
mkdirSync(OUT, { recursive: true })
const ROOT = new URL('../../', import.meta.url).pathname
const { LITE } = await import(pathToFileURL(join(ROOT, 'lab/pdf/spikes/lite-pdfjs.mjs')).href)
globalThis.OffscreenCanvas ??= class { getContext() { return { measureText: () => ({ width: 0 }), font: '' } } }
const PINS = JSON.parse(readFileSync(join(ROOT, 'lab/pdf/compile-images.json'), 'utf8'))
const SLOT = '/Users/cheongzhiyan/Developer/readarxiv-lab-data/bin/heavy-slot.sh'
const run = promisify(execFile)
const NM = join(ROOT, 'node_modules/pdfjs-dist/')
const docOpts = { cMapUrl: `${NM}cmaps/`, cMapPacked: true, standardFontDataUrl: `${NM}standard_fonts/`, verbosity: 0, useSystemFonts: false }
const T0 = performance.now()
const js = {}
const tex = []
let t = performance.now()
const lap = k => { const now = performance.now(); js[k] = (js[k] ?? 0) + (now - t); t = now }
const filesUnder = (d, rel = '') => readdirSync(join(d, rel), { withFileTypes: true }).flatMap(x => (x.isDirectory() ? filesUnder(d, join(rel, x.name)) : [join(rel, x.name)]))
/** one docker run over `files` (a Map) in a build directory of its own, removed after; its in-container ms, and the files it made */
async function docker(kind, files, image, cmd, date) {
  const c0 = performance.now()
  const build = join(OUT, `build-${id}`)
  rmSync(build, { recursive: true, force: true })
  for (const [p, b] of files) { const f = join(build, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
  const env = Number.isSafeInteger(date) ? ['-e', `SOURCE_DATE_EPOCH=${date}`, '-e', 'FORCE_SOURCE_DATE=1'] : []
  const said = await run(SLOT, ['docker', '--', 'nice', '-n', '10', 'docker', 'run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', ...env, '-v', `${build}:/work`, '-w', '/work', image, 'sh', '-c', 's=$(date +%s%N); timeout 600 "$@" >/dev/null 2>&1; echo "axt-l2: ms $(( ($(date +%s%N) - s) / 1000000 ))"', 'sh', ...cmd], { maxBuffer: 1 << 26 }).then(r => r.stdout, e => e.stdout ?? '')
  const made = new Map()
  for (const p of filesUnder(build)) { const k = p.split(sep).join('/'), b = new Uint8Array(readFileSync(join(build, p))), had = files.get(k); if (!had || Buffer.compare(Buffer.from(had), Buffer.from(b)) !== 0) made.set(k, b) }
  rmSync(build, { recursive: true, force: true })
  const wall = performance.now() - c0
  tex.push({ kind, ms: Number(/axt-l2: ms (\d+)/.exec(said)?.[1] ?? NaN), wall: Math.round(wall) })
  t += wall
  return made
}

// ---- the paper as the box receives it (the gate's: main file, compiler and tree of the baseline's prepare)
const { files: source } = await unpackSource(new Uint8Array(readFileSync(join(DIR, 'source.gz'))))
const paper = openPaper(source)
const base = JSON.parse(readFileSync(join(arg('prepare'), `${id}.prepare.json`), 'utf8')).paper.tex
const main = paper.project.main, stem = jobName(main), compiler = base.compiler ?? 'pdflatex', image = base.image
const arxivBytes = new Uint8Array(readFileSync(join(DIR, 'arxiv.pdf')))
lap('open')

// ---- the first pass: unmarked, the definitions asked at the document's start, the probe at its end, the bibliography after
const pre = readSource({ main, files: source }, NO_DEFINITIONS)
const samples = probeSamples(pre)
const first = new Map(source)
first.set('axt-ask.tex', new TextEncoder().encode(askFile(namesUsed({ main, files: source }, LEX_RULES, ASKED))))
first.set(PROBE_FILE, probeBytes(probeFile(samples, compiler, bblHead({ main, files: source })), pre.encoding))
lap('ask')
const engine = { pdflatex: ['pdflatex', '-draftmode'], xelatex: ['xelatex', '-no-pdf'], lualatex: ['lualatex', '--draftmode'], latex: ['latex'] }[compiler] ?? ['pdflatex', '-draftmode']
const bib = source.has(`${stem}.bbl`) ? '' : `; if [ -f ${stem}.bcf ]; then biber ${stem}; elif grep -q bibdata ${stem}.aux 2>/dev/null; then bibtex ${stem}; fi`
const out1 = await docker('first', first, image, ['sh', '-c', `"$@" >/dev/null 2>&1${bib} >/dev/null 2>&1; true`, 'sh', ...engine, '-interaction=nonstopmode', `-jobname=${stem}`, `\\AddToHook{begindocument/end}{\\input{axt-ask.tex}}${PROBE_HOOK}\\input{${main}}`])
const definitions = out1.has(`${stem}.axtdefs`) ? new TextDecoder().decode(out1.get(`${stem}.axtdefs`)) : ''
const log1 = out1.has(`${stem}.log`) ? Buffer.from(out1.get(`${stem}.log`)).toString('latin1') : ''
const tree = new Map(source)
if (!source.has(`${stem}.bbl`) && out1.has(`${stem}.bbl`)) tree.set(`${stem}.bbl`, out1.get(`${stem}.bbl`))

// ---- the reader, the probe's answers, the marked compile with its recovery
const doc = readSource({ main, files: tree }, readDefinitions(definitions))
const pa = readAnswers(log1, samples)
lap('source')
const day = null
const rec = await compileMarked({
  tree: { main, files: tree }, doc, unmarkedLog: unprobed(log1),
  options: { compiler, answers: { switches: pa.switches, inkless: pa.inkless, apart: pa.apart, complete: doc.complete, probed: pa.probed, seen: pa.seen } },
  compile: async (marked, plan) => {
    const files = new Map(tree)
    for (const p of plan.files) files.set(p, marked.files.get(p))
    const latexmk = ['latexmk', '-norc', ...(compiler === 'latex' ? ['-pdfdvi', '-e', '$dvipdf=q{dvipdfmx %O -o %D %S}'] : [{ xelatex: '-xelatex', lualatex: '-lualatex' }[compiler] ?? '-pdf']), ...(tree.has(`${stem}.bbl`) ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-f', `./${main}`]
    const made = await docker('marked', files, image, latexmk, day)
    return { pdf: made.get(`${stem}.pdf`) ?? null, log: made.has(`${stem}.log`) ? Buffer.from(made.get(`${stem}.log`)).toString('latin1') : '' }
  },
})
lap('marks')
let back = null, stats = null
if (rec.ok) {
  const read = await readPdf({ getDocument, OPS }, rec.pdf, { options: { ...docOpts, ...LITE }, turned: true })
  const pages = read.pages.map(({ raw, page }) => (raw ? { glyphs: raw.glyphs, boxes: raw.boxes, paths: raw.paths ?? [], boxAt: raw.boxAt ?? [], points: raw.points.map(x => (/[A-Z]/.test(x.name) ? { ...x, name: x.name.toLowerCase() } : x)), paras: raw.paras ?? [], paraEnds: raw.paraEnds ?? [], view: [...page.view] } : { glyphs: [], boxes: [], paths: [], boxAt: [], points: [], paras: [], paraEnds: [], view: [...page.view] }))
  lap('readB')
  const ins = instrumentFromPlan({ ink: read.doc, pages, plan: rec.plan, doc, log: rec.log, made: { compiler, tree: String(base.tree) }, inkless: pa.inkless, texts: new Map(pa.texts), lineskip: pa.lineskip })
  lap('instrument')
  const sha = b => createHash('sha256').update(b).digest('hex')
  const deflate = b => new Uint8Array(deflateSync(b))
  const inflate = (b, limit) => { const o = { finishFlush: Z.Z_SYNC_FLUSH, maxOutputLength: limit + 1 }; try { return new Uint8Array(inflateSync(b, o)) } catch (e) { if (e?.code === 'ERR_BUFFER_TOO_LARGE') throw e; return new Uint8Array(inflateRawSync(b.subarray(2), o)) } }
  const m = /^(.+)v(\d+)$/.exec(id)
  for await (const x of prepareBack(ins, arxivBytes, { pdfjs: { getDocument, OPS }, pdfOptions: { ...docOpts, ...LITE }, PL, deflate, inflate, paper: { id: m[1], version: Number(m[2]) }, made: sha(arxivBytes), now: () => performance.now() }))
    if (x.kind === 'tally') { back = x.ms; stats = x.located }
  lap('back')
}
const sum = {}
for (const c of tex) { sum[c.kind] ??= { n: 0, ms: 0, wall: 0 }; sum[c.kind].n++; sum[c.kind].ms += c.ms; sum[c.kind].wall += c.wall }
const out = { id, compiler, tree: base.tree, ok: rec.ok, why: rec.why ?? null, steps: rec.attempts?.map(a => a.step) ?? [], ms: Math.round(performance.now() - T0), js: Object.fromEntries(Object.entries(js).map(([k, v]) => [k, Math.round(v)])), back: back ? Object.fromEntries(Object.entries(back).map(([k, v]) => [k, Math.round(v)])) : null, located: stats?.located ?? null, tex: sum, runs: tex }
writeFileSync(join(OUT, `${id}.json`), `${JSON.stringify(out)}\n`)
console.log(JSON.stringify({ id, ms: out.ms, tex: Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, v.ms])), js: out.js, back: out.back, located: out.located }))
process.exit(0)
