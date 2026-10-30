// lab/pdf/spikes/cm-check.mjs
// CM, converge then mark (layout/paper.mjs layoutMarksOfPaper `converge`), against today's layout compile (L: the marked
// original with every pass, `rerun`, latexmk), both in one native TeX Live, on each paper given: the marked PDF's bytes,
// the marks file's and the layout file's (layout/make.mjs makeLayout over the marks and arXiv's PDF, as
// spikes/layout-make.mjs makes it), equal or every difference (the pages and lines L has that CM's PDF lost, as the
// layout-marks gate counts them: layout-marks-compare.mjs lostLines), with CM's record and each compile's CPU (user+sys
// of the process tree; real beside it) and TeX passes.
//
// It is also the reference host of the compile contract's CM fields (live.d.mts CompileRequest `draft`, `files`;
// Compiled `files`, `passes`), as the web's container sandbox answers them (container/src/sandbox.ts texCommand,
// bibCommand, runCompile): a one-pass compile is `<engine> -no-shell-escape -interaction=nonstopmode ./<main>`, XeLaTeX's
// through `xdvipdfmx -q -E -z 3`; `draft` adds -draftmode (pdfLaTeX), -no-pdf with no driver (XeLaTeX), --draftmode
// (LuaLaTeX), -draftmode (latex, arXiv's DVI compiler, whose one-pass compile is made a PDF by `dvipdfmx -q` after its pass);
// `bibtex: true` runs biber where the pass wrote a .bcf, else BibTeX, on ./<job> after it; `files` (the web's
// jail.sh in files mode) stamps every seeded file with a fixed old time and the marker a minute later, runs `makeindex -o
// ./<job>.ind ./<job>.idx` after the bibliography step where the pass wrote ./<job>.idx, and, with `ok`, returns every
// regular file (no link) newer than the marker — written, a rewrite of the same bytes too — but the outputs and the tools'
// logs, absent past 256 files or 8 MiB (the web's bound; the count and bytes are recorded whatever it); `rerun` is
// `latexmk -norc -pdf|-xelatex|-lualatex|-pdfdvi -e $dvipdf=… [-bibtex-] -no-shell-escape -interaction=nonstopmode -f ./<main>`
// (compile-image.mjs latexmkEngine). `passes`
// counts TeX passes alone. The project is written fresh for every compile, into one folder, so that no path differs
// between L and CM; a shipped <job>.pdf and .log are removed first, as the sandbox does.
//
// The TeX: TinyTeX's binaries, with a tree linking the packages it lacks into a full TeX Live of the same year as
// TEXMFLOCAL, case-folding off and the date pinned — the environment of lab/pdf/spikes/native-tex/docker on
// feat/gate-content-measures (db1ba26d), copied here so that this does not depend on that branch:
//   NATIVE_TEX_BIN       the TeX Live binaries (default: TinyTeX's, ~/Library/TinyTeX/bin/universal-darwin)
//   NATIVE_TEXMFLOCAL    the tree of the packages TinyTeX lacks, its ls-R made (mktexlsr); required
//   NATIVE_TEXMFVAR      a TEXMFVAR whose pdftex.map is the full tree's; optional
// Not the Docker image's package versions byte for byte. TinyTeX has no makeindex: where the binaries have mendex, a
// `makeindex` that runs it is put first on PATH, for latexmk and CM alike (the comparison is of the two orders of work,
// not of makeindex's bytes); a tool they lack altogether (biber) is skipped on both sides, and said so.
//   NATIVE_TEXMFLOCAL=<tree> [NATIVE_TEXMFVAR=<var>] [AXT_DATA=<data>] pnpm exec tsx lab/pdf/spikes/cm-check.mjs \
//     [<id>v<n> | corpus/<id> | <folder holding source.gz> …] [--corpus] [--from=<id>] [--layout] [--runs=<n>] [--out=<folder>]
//   <id>v<n>     data/layout/<id>v<n>/ (source.gz, arxiv.pdf); corpus/<id>, data/corpus/<id>/; a folder, itself
//   --corpus     every paper of data/corpus, in order (--from=<id>: from that one on)
//   --layout     the layout files compared on every paper with an arxiv.pdf (else only where the PDFs differ, and on XeLaTeX's,
//                whose one-pass driver compresses otherwise than latexmk's)
//   --runs=<n>   L and CM n times each, interleaved (L, CM, L, CM, ...), each run's CPU printed; the files compared on the first
// Writes <out>/<id>.json (the row) and, where they differ, both sides' marks and layout files (default out/cm-check). Exits 1
// where a paper differs or either side refuses. Makes no network request. Stops below 15 GiB free.
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statfsSync, utimesSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { getDocument, OPS, version } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { LITE } from './lite-pdfjs.mjs'
import { latexmkEngine } from './compile-image.mjs'
import { encodeLayout } from '../../../src/pdf-reader/engine/layout/file.mjs'
import { makeLayout } from '../../../src/pdf-reader/engine/layout/make.mjs'
import { marksFile, parseLayoutMarks } from '../../../src/pdf-reader/engine/layout/marks.mjs'
import { layoutMarksOfPaper } from '../../../src/pdf-reader/engine/layout/paper.mjs'
import { openPaper } from '../../../src/pdf-reader/engine/pipeline/live.mjs'
import { jobName } from '../../../src/pdf-reader/engine/source/latex-front.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/source/tar.mjs'
import { joinRuns, linesOf, lostLines } from './layout-marks-compare.mjs'

const root = new URL('..', import.meta.url).pathname
const argOf = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const DATA = resolve(process.env.AXT_DATA ?? join(root, 'data'))
const OUT = resolve(argOf('out') ?? join(root, 'out/cm-check'))
const RUNS = Number(argOf('runs') ?? 1)
const LAYOUT_ALL = process.argv.includes('--layout'), TRACE = process.argv.includes('--trace')
const FREE_MIN = 15 * 2 ** 30
const TIMEOUT_MS = 600_000
const NM = new URL('../../../node_modules/pdfjs-dist/', import.meta.url).pathname
const pdfOf = bytes => getDocument({ data: Uint8Array.from(bytes), ...LITE, verbosity: 0, cMapUrl: `${NM}cmaps/`, cMapPacked: true, standardFontDataUrl: `${NM}standard_fonts/`, useSystemFonts: false })

// ---------------------------------------------------------------- the native TeX
const BIN = process.env.NATIVE_TEX_BIN ?? join(process.env.HOME ?? '', 'Library/TinyTeX/bin/universal-darwin')
const LOCAL = process.env.NATIVE_TEXMFLOCAL
if (!LOCAL) throw new Error('NATIVE_TEXMFLOCAL is not set (the tree of the packages the TeX Live binaries lack)')
const TEX_ENV = {
  HOME: process.env.HOME ?? '', TMPDIR: process.env.TMPDIR ?? '/tmp', PATH: `${BIN}:/usr/bin:/bin`,
  TEXMFLOCAL: LOCAL, texmf_casefold_search: '0', FORCE_SOURCE_DATE: '1', SOURCE_DATE_EPOCH: '1767225600',
  ...(process.env.NATIVE_TEXMFVAR ? { TEXMFVAR: process.env.NATIVE_TEXMFVAR } : {}),
}
/** each engine's binary and its draft flag (an engine the host does not know is pdfLaTeX's, as the lab's compiles take it); latexmk's
 *  arguments are latexmkEngine's: a latex paper is never checked with pdfLaTeX */
const ENGINES = { pdflatex: ['pdflatex', '-draftmode'], xelatex: ['xelatex', '-no-pdf'], lualatex: ['lualatex', '--draftmode'], latex: ['latex', '-draftmode'] }
/** the sandbox's one-pass XeLaTeX driver (sandbox.ts DRAFT_DRIVER) */
const DRIVER = 'xdvipdfmx -q -E -z 3'
/** what `files` leaves out: the compile's outputs and the tools' logs */
const OUTPUTS = /\.(?:pdf|xdv|dvi|log|blg|ilg|glg|fls|fdb_latexmk)$|\.synctex\.gz$/
/** the host's bound on `files` (the web's: budget.ts FILES_MAX and SMALL_FILES) */
const FILES_MAX = 256, BYTES_MAX = 8 * 2 ** 20
/** the seeded files' time and the marker's, a minute later (the web's jail.sh in files mode): whatever the clock's
 *  granularity, a file written after the seeding is newer than the marker */
const SEEDED = 946684800, MARKER = SEEDED + 60
const WORK = join(OUT, 'work'), BUILD = join(WORK, 'build'), SHIMS = join(WORK, 'bin')
/** a tool, from the binaries or the shims (makeindex as mendex where the binaries have only that: `makeindex`) */
const has = tool => existsSync(join(BIN, tool)) || existsSync(join(SHIMS, tool))
const free = dir => { const s = statfsSync(dir); return s.bavail * s.bsize }
mkdirSync(SHIMS, { recursive: true })
const MAKEINDEX = existsSync(join(BIN, 'makeindex')) ? 'makeindex' : existsSync(join(BIN, 'mendex')) ? 'mendex' : null
if (MAKEINDEX === 'mendex') writeFileSync(join(SHIMS, 'makeindex'), `#!/bin/sh\nexec '${join(BIN, 'mendex')}' "$@"\n`, { mode: 0o755 })
TEX_ENV.PATH = `${SHIMS}:${TEX_ENV.PATH}`

/** a command in the build folder, its output appended to `out`: its CPU (user+sys of its process tree, bash's `time`) and real seconds */
function timed(argv, out) {
  const tf = join(WORK, 'time.txt')
  rmSync(tf, { force: true })
  const r = spawnSync('/bin/bash', ['-c', 'TIMEFORMAT="%R %U %S"; { time "$@" >>"$AXT_OUT" 2>&1 ; } 2>"$AXT_TIME"', 'axt', ...argv], { cwd: BUILD, env: { ...TEX_ENV, AXT_OUT: out, AXT_TIME: tf }, timeout: TIMEOUT_MS, killSignal: 'SIGKILL' })
  const [real, user, sys] = existsSync(tf) ? readFileSync(tf, 'utf8').trim().split(/\s+/).map(Number) : [Number.NaN, Number.NaN, Number.NaN]
  return { real, us: user + sys, killed: !!r.error || r.signal !== null }
}
/** every regular file (no link) under the build folder, by its path there, with its modification time (s) */
function walk(dir = BUILD, base = '', out = new Map()) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name), rel = base ? `${base}/${name}` : name, st = lstatSync(path)
    if (st.isDirectory()) walk(path, rel, out)
    else if (st.isFile()) out.set(rel, st.mtimeMs / 1000)
  }
  return out
}
/** written since the seeding: newer than the marker */
const written = (stamps, p) => stamps.has(p) && stamps.get(p) > MARKER

/**
 * One compile as the sandbox answers it (above), recorded in `records`: { kind, us, real, passes, steps, missing }.
 * `source`, the paper's own files, under the request's overrides
 */
function nativeCompile(source, req, records) {
  if (free(OUT) < FREE_MIN) throw new Error(`less than 15 GiB free on ${OUT}`)
  const [bin, draftFlag] = ENGINES[req.engine] ?? ENGINES.pdflatex
  const job = jobName(req.main), main = `./${req.main}`
  rmSync(BUILD, { recursive: true, force: true })
  for (const [p, b] of [...source, ...req.overrides]) { const f = join(BUILD, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
  for (const ext of ['pdf', 'log']) { const f = join(BUILD, `${job}.${ext}`); try { if (lstatSync(f).isFile()) rmSync(f) } catch {} }
  // (files mode: every seeded file at the old time, as the web's jail stamps them; else the times of the writing, as today)
  if (req.files) for (const p of walk().keys()) utimesSync(join(BUILD, p), SEEDED, SEEDED)
  const out = join(WORK, 'out.txt')
  rmSync(out, { force: true })
  const kind = req.rerun ? 'latexmk' : req.draft ? 'draft' : req.files ? 'marked' : 'probe'
  const steps = [], missing = []
  let passes = 0, killed = false
  const step = (tool, argv) => { const t = timed(argv, out); steps.push({ tool, us: t.us, real: t.real }); killed ||= t.killed; return t }
  if (req.rerun) {
    step('latexmk', ['latexmk', '-norc', ...latexmkEngine(bin), ...(req.bibtex === false ? ['-bibtex-'] : []), '-no-shell-escape', '-interaction=nonstopmode', '-f', main])
    const said = existsSync(out) ? readFileSync(out, 'latin1') : ''
    passes = (said.match(/^Run number \d+ of rule '(?:pdf|xe|lua)?latex'/gm) ?? []).length
    for (const tool of ['bibtex', 'biber', 'makeindex']) { const n = (said.match(new RegExp(`^Run number \\d+ of rule '${tool}`, 'gm')) ?? []).length; if (n) steps.push({ tool, runs: n }) }
  } else {
    const mode = req.draft ? [draftFlag] : bin === 'xelatex' ? [`-output-driver=${DRIVER}`] : []
    step(bin, [bin, '-no-shell-escape', '-interaction=nonstopmode', ...mode, main])
    passes = 1
    // (latex's DVI made a PDF by dvipdfmx, a step of the compile's own, as the sandbox's one-pass latex)
    if (!killed && !req.draft && bin === 'latex') step('dvipdfmx', ['dvipdfmx', '-q', '-o', `./${job}.pdf`, `./${job}.dvi`])
    if (!killed && req.bibtex === true) {
      // (a .bcf this pass wrote — in files mode, newer than the marker —, not one the source archive shipped)
      const bcf = join(BUILD, `${job}.bcf`), biber = req.files ? written(walk(), `${job}.bcf`) : existsSync(bcf), tool = biber ? 'biber' : 'bibtex'
      if (has(tool)) step(tool, [tool, `./${job}`])
      else missing.push(tool)
    }
    // (makeindex as latexmk's own rule runs it, <job>.idx to <job>.ind, after the bibliography step: files mode only)
    if (!killed && req.files && written(walk(), `${job}.idx`)) {
      if (has('makeindex')) step('makeindex', ['makeindex', '-o', `./${job}.ind`, `./${job}.idx`])
      else missing.push('makeindex')
    }
  }
  const read = (ext, enc) => { const f = join(BUILD, `${job}.${ext}`); return existsSync(f) ? readFileSync(f, enc) : null }
  const pdfBytes = read('pdf'), log = read('log', 'latin1') ?? ''
  const pdf = pdfBytes?.length ? new Uint8Array(pdfBytes) : null
  const complete = !!pdf && Buffer.from(pdf.subarray(-1024)).includes('%%EOF')
  const ok = !killed && (req.draft ? log !== '' : complete)
  // `files`: every file written since the seeding, its bytes as they are now (the last step's), with `ok` only and
  // within the bound; its count and bytes recorded whatever the bound
  let files, wrote = null
  if (req.files) {
    const stamps = walk(), all = new Map()
    for (const p of [...stamps.keys()].sort()) if (!OUTPUTS.test(p) && written(stamps, p)) all.set(p, new Uint8Array(readFileSync(join(BUILD, p))))
    const bytes = [...all.values()].reduce((n, b) => n + b.length, 0)
    wrote = { n: all.size, bytes }
    if (ok && all.size <= FILES_MAX && bytes <= BYTES_MAX) files = all
  }
  const us = steps.reduce((n, s) => n + (s.us ?? 0), 0), real = steps.reduce((n, s) => n + (s.real ?? 0), 0)
  records.push({ kind, us: Number(us.toFixed(2)), real: Number(real.toFixed(2)), passes, steps, ...(missing.length ? { missing } : {}), ok, ...(wrote ? { files: wrote } : {}), aux: read('aux', 'utf8'), ind: read('ind') })
  // --trace: each file the compile wrote, and whether its bytes are those it was given (the request's, else the paper's)
  if (TRACE && files) {
    const given = p => req.overrides.get(p) ?? source.get(p)
    console.log(`     trace ${kind} bibtex=${req.bibtex}: ${[...files].map(([p, b]) => `${p} ${b.length} ${given(p) ? (Buffer.from(given(p)).equals(Buffer.from(b)) ? 'same' : 'other') : 'new'}`).join(', ')}`)
    // (and the files themselves, by the compile's number: <out>/trace/<n>-<kind>/)
    const at = join(OUT, 'trace', `${records.length}-${kind}`)
    rmSync(at, { recursive: true, force: true })
    for (const [p, b] of files) { mkdirSync(dirname(join(at, p)), { recursive: true }); writeFileSync(join(at, p), b) }
  }
  return { ok, pdf: req.draft ? null : pdf, log, aux: read('aux', 'utf8'), bbl: req.bibtex === false ? null : read('bbl', 'utf8'), ms: Math.round(real * 1000), passes, ...(files ? { files } : {}) }
}

// ---------------------------------------------------------------- the two sides
/** one side: layoutMarksOfPaper over the native host, with the PDF its marks were read from and each compile's record */
async function side(paper, source, converge) {
  const records = []
  let pdf = null
  const open = async bytes => {
    pdf = Uint8Array.from(bytes)
    const task = pdfOf(bytes)
    try { return { doc: await task.promise, close: () => task.destroy() } } catch (e) { await task.destroy().catch(() => {}); throw e }
  }
  const made = await layoutMarksOfPaper(paper, { compile: async req => nativeCompile(source, req, records), open, OPS, converge })
  // (the marks are handed on in memory: their file, as this check compares files)
  if ('marks' in made) made.marks = new TextEncoder().encode(marksFile(made.marks))
  const last = records.filter(r => r.kind === 'latexmk' || r.kind === 'marked').at(-1)
  return { made, pdf, records, aux: last?.aux ?? null, ind: last?.ind ?? null }
}
/** the layout file made from a marks file and arXiv's PDF, as layout-make.mjs makes it */
async function layoutOf(paper, marks, arxivPdf, id) {
  const m = /^(\d{4}\.\d{4,5}|[a-z-]+\/\d{7})(?:v(\d+))?$/.exec(id)
  const task = pdfOf(arxivPdf)
  try {
    const out = await makeLayout({ units: paper.units, texOrder: paper.texOrder, marks: parseLayoutMarks(marks), arxiv: await task.promise, OPS, paper: { id: m?.[1] ?? '0000.00000', version: Number(m?.[2] ?? 1) }, left: '', pdfjs: version })
    return 'file' in out ? { text: encodeLayout(out.file), timedOut: out.stats.timedOut.length } : { refused: out.refused }
  } finally { await task.destroy() }
}
/** a PDF's text items per page (every one, and those with ink), as the layout-marks gate reads them */
async function itemsOf(bytes) {
  const task = pdfOf(bytes), all = []
  try {
    const doc = await task.promise
    for (let n = 1; n <= doc.numPages; n++) {
      const pg = await doc.getPage(n)
      all.push((await pg.getTextContent()).items.filter(i => i.str).map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height })))
      pg.cleanup()
    }
  } finally { await task.destroy() }
  return { all, ink: all.map(p => p.filter(i => /\S/.test(i.str))) }
}
/** the lines of L's PDF that CM's loses (strict and joined), by page, and the pages of each */
async function lost(pdfL, pdfC) {
  const a = await itemsOf(pdfL), b = await itemsOf(pdfC)
  const { strict, joined } = lostLines(a.ink, b.ink, a.all, b.all, a.ink.map(linesOf))
  const pages = set => [...new Set([...set].map(k => Number(k.split(':')[0])))].sort((x, y) => x - y)
  return { pages: [a.all.length, b.all.length], strict: strict.size, joined: joined.size, strictPages: pages(strict), joinedPages: pages(joined), first: [...strict].slice(0, 12), runs: a.all.map(joinRuns).reduce((n, p) => n + p.length, 0) }
}
/** where two JSON files differ: the first differing byte, and each top-level field that differs, with the entries that do */
function differences(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b), n = Math.min(x.length, y.length)
  let at = 0
  while (at < n && x[at] === y[at]) at++
  const show = z => JSON.stringify(z.subarray(Math.max(0, at - 24), at + 48).toString('utf8'))
  const out = [`sizes ${x.length} and ${y.length}; first differing byte ${at}: ${show(x)} against ${show(y)}`]
  try {
    const A = JSON.parse(x.toString('utf8')), B = JSON.parse(y.toString('utf8'))
    for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
      if (JSON.stringify(A[k]) === JSON.stringify(B[k])) continue
      if (Array.isArray(A[k]) && Array.isArray(B[k])) {
        const idx = []
        for (let i = 0; i < Math.max(A[k].length, B[k].length); i++) if (JSON.stringify(A[k][i]) !== JSON.stringify(B[k][i])) idx.push(i)
        out.push(`  ${k}: ${A[k].length} against ${B[k].length} entries, ${idx.length} differ (first ${idx.slice(0, 6).map(i => JSON.stringify(A[k][i])?.slice(0, 60)).join(' | ')})`)
      } else out.push(`  ${k}: ${JSON.stringify(A[k])?.slice(0, 80)} against ${JSON.stringify(B[k])?.slice(0, 80)}`)
    }
  } catch {}
  return out
}
const same = (a, b) => !!a && !!b && Buffer.from(a).equals(Buffer.from(b))
const cpu = records => records.map(r => `${r.kind}${r.kind === 'latexmk' ? `(${r.passes})` : ''} ${r.us.toFixed(2)}`).join(', ')
const total = records => Number(records.filter(r => r.kind !== 'probe').reduce((n, r) => n + r.us, 0).toFixed(2))

// ---------------------------------------------------------------- the papers
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))
const from = argOf('from')
let ids = named
if (process.argv.includes('--corpus')) {
  const all = readdirSync(join(DATA, 'corpus')).filter(id => existsSync(join(DATA, 'corpus', id, 'source.gz'))).sort().map(id => `corpus/${id}`)
  ids = [...named, ...(from ? all.slice(Math.max(0, all.indexOf(`corpus/${from}`))) : all)]
}
if (!ids.length) throw new Error('no paper given')
mkdirSync(WORK, { recursive: true })
console.log(`native TeX ${BIN}; TEXMFLOCAL ${LOCAL}; makeindex ${MAKEINDEX ?? 'none'}; biber ${has('biber') ? 'yes' : 'none'}; out ${OUT}`)
let failed = 0
const tally = { equal: 0, differ: 0, refused: 0 }, most = { n: 0, bytes: 0 }
for (const arg of ids) {
  const dir = arg.includes('/') && existsSync(join(DATA, arg)) ? join(DATA, arg) : existsSync(join(DATA, 'layout', arg)) ? join(DATA, 'layout', arg) : resolve(arg)
  const id = basename(dir)
  const t0 = Date.now()
  let row
  try {
    const { files: source } = await unpackSource(new Uint8Array(readFileSync(join(dir, 'source.gz'))))
    const paper = openPaper(source)
    const runs = []
    for (let i = 0; i < RUNS; i++) runs.push({ L: await side(paper, source, false), CM: await side(paper, source, true) })
    const { L, CM } = runs[0]
    row = { id, engine: paper.meta.compiler, bbl: !!paper.meta.bbl, units: paper.units.length }
    row.L = 'marks' in L.made ? { ms: L.made.ms } : { refused: L.made.refused }
    row.CM = { ...('marks' in CM.made ? { ms: CM.made.ms } : { refused: CM.made.refused }), cm: CM.made.cm }
    row.cpu = runs.map(r => ({ L: r.L.records.map(({ aux, ind, ...x }) => x), CM: r.CM.records.map(({ aux, ind, ...x }) => x), totalL: total(r.L.records), totalCM: total(r.CM.records) }))
    // (the most files one compile wrote, and their bytes: the bound's need)
    row.files = CM.records.reduce((m, r) => ({ n: Math.max(m.n, r.files?.n ?? 0), bytes: Math.max(m.bytes, r.files?.bytes ?? 0) }), { n: 0, bytes: 0 })
    most.n = Math.max(most.n, row.files.n); most.bytes = Math.max(most.bytes, row.files.bytes)
    const missing = [...new Set([...L.records, ...CM.records].flatMap(r => r.missing ?? []))]
    if (missing.length) row.missing = missing
    if (!('marks' in L.made) || !('marks' in CM.made)) {
      tally.refused++
      failed++
      console.log(`FAIL ${id}: refused (L ${row.L.refused ?? 'no'}, CM ${row.CM.refused ?? 'no'}); cm ${JSON.stringify(row.CM.cm)}`)
    } else {
      row.pdf = { equal: same(L.pdf, CM.pdf), bytes: [L.pdf.length, CM.pdf.length] }
      row.marks = { equal: same(L.made.marks, CM.made.marks), bytes: [L.made.marks.length, CM.made.marks.length] }
      row.aux = { equal: L.aux === CM.aux }
      // (the index the last pass read, where either has one: latexmk's against the one CM carried)
      if (L.ind || CM.ind) row.ind = { equal: same(L.ind, CM.ind), bytes: [L.ind?.length ?? null, CM.ind?.length ?? null] }
      const arxiv = join(dir, 'arxiv.pdf')
      if (existsSync(arxiv) && (LAYOUT_ALL || !row.pdf.equal || paper.meta.compiler === 'xelatex')) {
        const bytes = readFileSync(arxiv), lay = [await layoutOf(paper, L.made.marks, bytes, id), await layoutOf(paper, CM.made.marks, bytes, id)]
        row.layout = lay.every(l => l.text) ? { equal: lay[0].text === lay[1].text, bytes: lay.map(l => l.text.length), timedOut: lay.map(l => l.timedOut) } : { refused: lay.map(l => l.refused ?? null) }
        if (row.layout.equal === false) { mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, `${id}.L.layout.json`), lay[0].text); writeFileSync(join(OUT, `${id}.CM.layout.json`), lay[1].text); row.layout.differences = differences(lay[0].text, lay[1].text) }
      }
      if (!row.pdf.equal) row.lost = await lost(L.pdf, CM.pdf)
      if (!row.marks.equal) { mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, `${id}.L.marks.json`), L.made.marks); writeFileSync(join(OUT, `${id}.CM.marks.json`), CM.made.marks); row.marks.differences = differences(L.made.marks, CM.made.marks) }
      // equal: the same PDF (or, for XeLaTeX's, whose drivers compress otherwise, the same marks and layout)
      // (a layout asked for and refused is no equality: it verified nothing)
      const equal = row.pdf.equal ? row.marks.equal && (!row.layout || row.layout.equal === true) : paper.meta.compiler === 'xelatex' && row.marks.equal && row.layout?.equal === true
      row.equal = equal
      if (equal) tally.equal++
      else { tally.differ++; failed++ }
      const lay = row.layout ? `, layout ${row.layout.equal === undefined ? `refused ${JSON.stringify(row.layout.refused)}` : row.layout.equal ? 'equal' : 'DIFFERS'}` : ''
      console.log(`${equal ? 'ok  ' : 'FAIL'} ${id} (${row.engine}${row.bbl ? ', bbl' : ''}): pdf ${row.pdf.equal ? 'equal' : 'DIFFERS'}, marks ${row.marks.equal ? 'equal' : 'DIFFERS'}${lay}, final aux ${row.aux.equal ? 'equal' : 'differs'}${row.ind ? `, ind ${row.ind.equal ? 'equal' : 'DIFFERS'} (${row.ind.bytes.join(' against ')} B)` : ''}; files at most ${row.files.n} (${row.files.bytes} B); cm ${JSON.stringify(CM.made.cm)}; latexmk passes ${L.records.find(r => r.kind === 'latexmk')?.passes ?? '-'}${missing.length ? `; no ${missing.join(', ')} here` : ''}`)
      if (row.lost) console.log(`     L's lines CM's PDF loses: strict ${row.lost.strict}, joined ${row.lost.joined}; pages ${row.lost.pages.join(' against ')}; strict on pages ${row.lost.strictPages.join(' ')}; first ${row.lost.first.join(' ')}`)
      for (const l of [...(row.marks.differences ?? []), ...(row.layout?.differences ?? [])]) console.log(`     ${l}`)
    }
    for (const [i, r] of row.cpu.entries()) console.log(`     run ${i + 1} u+s: L ${cpu(r.L)} = ${r.totalL} s; CM ${cpu(r.CM)} = ${r.totalCM} s (probe outside both totals)`)
  } catch (e) {
    failed++
    tally.refused++
    row = { id, error: String(e?.stack ?? e).slice(0, 600) }
    console.log(`FAIL ${id}: ${row.error}`)
  }
  row.seconds = Math.round((Date.now() - t0) / 1000)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, `${id}.json`), `${JSON.stringify(row, null, 1)}\n`)
}
rmSync(BUILD, { recursive: true, force: true })
console.log(`papers ${ids.length}: equal ${tally.equal}, differ ${tally.differ}, refused or failed ${tally.refused}; the most files one compile wrote ${most.n}, the most bytes ${most.bytes}`)
process.exitCode = failed ? 1 : 0
