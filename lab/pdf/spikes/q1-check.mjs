// lab/pdf/spikes/q1-check.mjs
// Q1, the marked compile as the pass loop (packages/engine/src/compile/paper.ts markedOfPaper `converge`, which compiled.ts
// compiledOf sets), against today's marked compile (latexmk to its fixed point, then the final pass), both in one native TeX
// Live, on each paper given, each side through the package's markedOfPaper asked as compiledOf asks it (the paper opened, its
// bibliography made once where TeX must make it, arXiv's day and page count, the pages' text for the guard). Per paper:
//   - B (the base page compiledOf takes) by SHA-256, and where they differ the first file the pass that made each was given
//     that differs (both are asked with the same main file: today's final pass and the loop's settled pass);
//   - every reading of the log the instrument makes (readAlign, readBoxAlign, readCellBoxes, readColours, readRefNames,
//     readSkips, readSkipProbe), readLines, and the statements of ours in it (every AXT-* and LAYOUT-* line, in order);
//   - the instrument instrumentOf states over each side's B, log and options; the stored plan (plan.ts storedInstrumentOf);
//     the guard's record; and the bundle the back half (prepare.ts) makes of each instrument and arXiv's PDF, object by object;
//   - each side's TeX passes (the probe's among them) and TeX seconds (u+s of the process tree, real beside it), the
//     bibliography's pass apart (one, shared), and the files and bytes each compile is asked with and gives back.
// In the same run, each against Q1's own side: `qp1` (hyperref's draft option on line 1 beside graphicx's, every marked
// request: adopted only where every bundle object is the same and B holds no link annotation), `bib` (the bibliography pass's
// files carried into pass 1 and on, papers whose bibliography TeX makes) and `unmarked` (pass 1 the unmarked files, CM as it
// was built): the design's two open options, each built only where B and every reading are the same on every paper and the
// TeX seconds fewer.
//
// The native host is lab/pdf/spikes/cm-check.mjs's (the reference host of `draft` and `files`, as the web's container sandbox
// answers them), with two things the box does that cm-check's does not need: SOURCE_DATE_EPOCH is the request's
// `sourceDate`, and a one-pass `latex` compile's dvipdfmx terminal follows its log behind base.ts DRIVER_OUTPUT_MARK. A
// request asked twice in one paper (the probe, every side's; a pass two sides ask alike) is compiled once, its seconds counted
// to each side that asked it. TeX: TinyTeX's binaries (TeX Live 2026) with NATIVE_TEXMFLOCAL a tree linking the packages it
// lacks into a full TeX Live of the same year, NATIVE_TEXMFVAR its font maps (cm-check's header); not the Docker image's
// package versions: what is compared is two orders of work in one TeX.
//   NATIVE_TEXMFLOCAL=<tree> [NATIVE_TEXMFVAR=<var>] node --max-old-space-size=6144 --import tsx lab/pdf/spikes/q1-check.mjs \
//     --list=<tsv of id and folder> --out=<folder> [--only=<id>,…] [--from=<id>] [--variants=qp1,bib,unmarked|none] [--keep]
// Writes <out>/<id>.json (the row), <out>/<id>.<side>.pdf where B differs (with --keep, also each side's instrument as
// <out>/<id>.<side>.instrument.json and B where an instrument or a bundle differs), and prints one line a paper and a tally. Exit 1
// where a paper's B or any reading differs between today and Q1, or either side refused alone. No network, no Docker. Stops
// below 12 GiB free on the Mac or 8 GiB on the output's volume.
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statfsSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { constants as Z, deflateSync, inflateRawSync, inflateSync } from 'node:zlib'
import { spawnSync } from 'node:child_process'
import * as PL from '@cantoo/pdf-lib'
import { bibliographyKept, instrumentOf, isMemoryError, madeBibliography, markedOfPaper, originalFactsOf, prepare, treeOf } from '@readarxiv/engine'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { DRIVER_OUTPUT_MARK, textOfPdf } from '../../../packages/engine/src/compile/base.ts'
import { DRAFT_OPTION, NO_DRIVER_GROUP, originalFiles } from '../../../packages/engine/src/compile/live.ts'
import { readLines } from '../../../packages/engine/src/compile/tex.ts'
import { sourceUnitsOf, unitsObjects } from '../../../packages/engine/src/front.ts'
import { readAlign, readBoxAlign, readCellBoxes, readRefNames, readSkips } from '../../../packages/engine/src/marks/channels.ts'
import { readColours, readSkipProbe } from '../../../packages/engine/src/marks/marks.ts'
import { opened, storedInstrumentOf, withBbl } from '../../../packages/engine/src/plan.ts'
import { jobName, lastTexLog, latin1, latin1Bytes } from '../../../packages/engine/src/source/latex-front.ts'
import { unpackSource } from '../../../src/pdf-reader/engine/source/tar.mjs'
import { latexmkEngine } from './compile-image.mjs'
import { LITE } from './lite-pdfjs.mjs'

const ROOT = new URL('../../..', import.meta.url).pathname
const argOf = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const OUT = resolve(argOf('out') ?? join(ROOT, 'lab/pdf/out/q1-check'))
const LIST = argOf('list'), ONLY = argOf('only')?.split(',') ?? null, FROM = argOf('from')
const VARIANTS = (argOf('variants') ?? 'qp1,bib,unmarked').split(',').filter(v => v && v !== 'none')
const KEEP = process.argv.includes('--keep')
/** with --keep, a side's B and instrument written for a look at where two sides part */
const keepSide = (id, name, s, i) => {
  if (!KEEP) return
  mkdirSync(OUT, { recursive: true })
  if (s.base) writeFileSync(join(OUT, `${id}.${name}.pdf`), s.base.pdf)
  if (i?.text) writeFileSync(join(OUT, `${id}.${name}.instrument.json`), i.text)
}
const MAC_MIN = 12 * 2 ** 30, OUT_MIN = 8 * 2 ** 30
const TIMEOUT_MS = 600_000
const NM = join(ROOT, 'node_modules/pdfjs-dist/')
const docOpts = { cMapUrl: `${NM}cmaps/`, cMapPacked: true, standardFontDataUrl: `${NM}standard_fonts/`, verbosity: 0, useSystemFonts: false }
const pdfjs = { getDocument, OPS }, documentOptions = { ...docOpts, ...LITE }
// (layer2.mjs makes a measuring canvas at its load: a stub, nothing here measures)
globalThis.OffscreenCanvas ??= class { getContext() { return { measureText: () => ({ width: 0 }), font: '' } } }
const PINS = JSON.parse(readFileSync(join(ROOT, 'lab/pdf/compile-images.json'), 'utf8'))
const SERVED = Object.keys(PINS.images)
const HOST_ENGINES = ['pdflatex', 'xelatex', 'lualatex', 'latex']
/** the box's bound on the files one compile gives back (the web's COMPILE_ANSWER: 256 files, 8 MiB); what one ask may carry
 *  (ASK_OVERRIDES: 5,000 files and 24 MiB of the paper's own, and one answer's more) is held against each compile's `asked` */
const FILES_BOUND = { count: 256, bytes: 8 * 2 ** 20 }
const sha = b => createHash('sha256').update(b).digest('hex')

// ---------------------------------------------------------------- the native TeX (cm-check.mjs's host)
const BIN = process.env.NATIVE_TEX_BIN ?? join(process.env.HOME ?? '', 'Library/TinyTeX/bin/universal-darwin')
const LOCAL = process.env.NATIVE_TEXMFLOCAL
if (!LOCAL) throw new Error('NATIVE_TEXMFLOCAL is not set (the tree of the packages the TeX Live binaries lack)')
const TEX_ENV = {
  HOME: process.env.HOME ?? '', TMPDIR: process.env.TMPDIR ?? '/tmp', PATH: `${BIN}:/usr/bin:/bin`,
  TEXMFLOCAL: LOCAL, texmf_casefold_search: '0', FORCE_SOURCE_DATE: '1',
  ...(process.env.NATIVE_TEXMFVAR ? { TEXMFVAR: process.env.NATIVE_TEXMFVAR } : {}),
}
const DEFAULT_DAY = 1767225600
const ENGINES = { pdflatex: ['pdflatex', '-draftmode'], xelatex: ['xelatex', '-no-pdf'], lualatex: ['lualatex', '--draftmode'], latex: ['latex', '-draftmode'] }
const DRIVER = 'xdvipdfmx -q -E -z 3'
const OUTPUTS = /\.(?:pdf|xdv|dvi|log|blg|ilg|glg|fls|fdb_latexmk)$|\.synctex\.gz$/
const SEEDED = 946684800, MARKER = SEEDED + 60
const WORK = join(OUT, 'work'), BUILD = join(WORK, 'build'), SHIMS = join(WORK, 'bin')
const has = tool => existsSync(join(BIN, tool)) || existsSync(join(SHIMS, tool))
const free = dir => { const s = statfsSync(dir); return s.bavail * s.bsize }
mkdirSync(SHIMS, { recursive: true })
const MAKEINDEX = existsSync(join(BIN, 'makeindex')) ? 'makeindex' : existsSync(join(BIN, 'mendex')) ? 'mendex' : null
if (MAKEINDEX === 'mendex') writeFileSync(join(SHIMS, 'makeindex'), `#!/bin/sh\nexec '${join(BIN, 'mendex')}' "$@"\n`, { mode: 0o755 })
TEX_ENV.PATH = `${SHIMS}:${TEX_ENV.PATH}`

function timed(argv, out, env) {
  const tf = join(WORK, 'time.txt')
  rmSync(tf, { force: true })
  const r = spawnSync('/bin/bash', ['-c', 'TIMEFORMAT="%R %U %S"; { time "$@" >>"$AXT_OUT" 2>&1 ; } 2>"$AXT_TIME"', 'axt', ...argv], { cwd: BUILD, env: { ...env, AXT_OUT: out, AXT_TIME: tf }, timeout: TIMEOUT_MS, killSignal: 'SIGKILL' })
  const [real, user, sys] = existsSync(tf) ? readFileSync(tf, 'utf8').trim().split(/\s+/).map(Number) : [Number.NaN, Number.NaN, Number.NaN]
  return { real, us: user + sys, killed: !!r.error || r.signal !== null }
}
function walk(dir = BUILD, base = '', out = new Map()) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name), rel = base ? `${base}/${name}` : name, st = lstatSync(path)
    if (st.isDirectory()) walk(path, rel, out)
    else if (st.isFile()) out.set(rel, st.mtimeMs / 1000)
  }
  return out
}
const written = (stamps, p) => stamps.has(p) && stamps.get(p) > MARKER
/** a request's identity: every field and every file it carries */
const requestKey = req => {
  const h = createHash('sha256')
  h.update(JSON.stringify([req.main, req.engine, !!req.rerun, req.bibtex ?? null, !!req.draft, !!req.files, req.sourceDate ?? null]))
  for (const [p, b] of [...req.overrides].sort((a, b) => (a[0] < b[0] ? -1 : 1))) h.update(`\n${p}\n`).update(b)
  return h.digest('hex')
}
/** what a request is, by its shape: latexmk's every pass, a draft, a full pass of the loop, the final pass, the probe */
const kindOf = req => req.rerun ? 'latexmk' : req.draft ? 'draft' : req.files ? 'full' : latin1(req.overrides.get(req.main) ?? new Uint8Array()).startsWith(NO_DRIVER_GROUP) ? 'final' : 'probe'

function nativeCompile(source, req) {
  if (free(OUT) < OUT_MIN || free(ROOT) < MAC_MIN) throw new Error(`stopped: under ${free(ROOT) < MAC_MIN ? '12 GiB free on the Mac' : `8 GiB free on ${OUT}`}`)
  const [bin, draftFlag] = ENGINES[req.engine] ?? ENGINES.pdflatex
  const job = jobName(req.main), main = `./${req.main}`
  const env = { ...TEX_ENV, SOURCE_DATE_EPOCH: String(req.sourceDate ?? DEFAULT_DAY) }
  rmSync(BUILD, { recursive: true, force: true })
  for (const [p, b] of [...source, ...req.overrides]) { const f = join(BUILD, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
  for (const ext of ['pdf', 'log']) { const f = join(BUILD, `${job}.${ext}`); try { if (lstatSync(f).isFile()) rmSync(f) } catch {} }
  if (req.files) for (const p of walk().keys()) utimesSync(join(BUILD, p), SEEDED, SEEDED)
  const out = join(WORK, 'out.txt'), drv = join(WORK, 'driver.txt')
  rmSync(out, { force: true }); rmSync(drv, { force: true })
  const steps = [], missing = []
  let passes = 0, killed = false, driven = false
  const step = (tool, argv, to = out) => { const t = timed(argv, to, env); steps.push({ tool, us: t.us, real: t.real }); killed ||= t.killed; return t }
  if (req.rerun) {
    step('latexmk', ['latexmk', '-norc', ...latexmkEngine(bin), ...(req.bibtex === false ? ['-bibtex-'] : []), '-no-shell-escape', '-interaction=nonstopmode', '-f', main])
    const said = existsSync(out) ? readFileSync(out, 'latin1') : ''
    passes = (said.match(/^Run number \d+ of rule '(?:pdf|xe|lua)?latex'/gm) ?? []).length
  } else {
    const mode = req.draft ? [draftFlag] : bin === 'xelatex' ? [`-output-driver=${DRIVER}`] : []
    step(bin, [bin, '-no-shell-escape', '-interaction=nonstopmode', ...mode, main])
    passes = 1
    // (latex's DVI made a PDF by dvipdfmx, its terminal given after the log behind the host's line, as the box gives it)
    if (!killed && !req.draft && bin === 'latex') { step('dvipdfmx', ['dvipdfmx', '-q', '-o', `./${job}.pdf`, `./${job}.dvi`], drv); driven = true }
    if (!killed && req.bibtex === true) {
      const biber = req.files ? written(walk(), `${job}.bcf`) : existsSync(join(BUILD, `${job}.bcf`)), tool = biber ? 'biber' : 'bibtex'
      if (has(tool)) step(tool, [tool, `./${job}`])
      else missing.push(tool)
    }
    if (!killed && req.files && written(walk(), `${job}.idx`)) {
      if (has('makeindex')) step('makeindex', ['makeindex', '-o', `./${job}.ind`, `./${job}.idx`])
      else missing.push('makeindex')
    }
  }
  const read = (ext, enc) => { const f = join(BUILD, `${job}.${ext}`); return existsSync(f) ? readFileSync(f, enc) : null }
  const pdfBytes = read('pdf')
  let log = read('log', 'latin1') ?? ''
  if (driven) log += `${DRIVER_OUTPUT_MARK}\n${existsSync(drv) ? readFileSync(drv, 'latin1') : ''}`
  const pdf = pdfBytes?.length ? new Uint8Array(pdfBytes) : null
  const complete = !!pdf && Buffer.from(pdf.subarray(-1024)).includes('%%EOF')
  const ok = !killed && (req.draft ? log !== '' : complete)
  let files, wrote = null
  if (req.files) {
    const stamps = walk(), all = new Map()
    for (const p of [...stamps.keys()].sort()) if (!OUTPUTS.test(p) && written(stamps, p)) all.set(p, new Uint8Array(readFileSync(join(BUILD, p))))
    const bytes = [...all.values()].reduce((n, b) => n + b.length, 0)
    wrote = { n: all.size, bytes }
    if (ok && all.size <= FILES_BOUND.count && bytes <= FILES_BOUND.bytes) files = all
  }
  const tex = steps.filter(s => s.tool !== 'dvipdfmx')
  const record = {
    kind: kindOf(req), passes, ok,
    us: Number(steps.reduce((n, s) => n + (s.us ?? 0), 0).toFixed(2)), real: Number(steps.reduce((n, s) => n + (s.real ?? 0), 0).toFixed(2)),
    texUs: Number(tex.reduce((n, s) => n + (s.us ?? 0), 0).toFixed(2)),
    asked: { n: req.overrides.size, bytes: [...req.overrides.values()].reduce((n, b) => n + b.length, 0) },
    ...(wrote ? { files: wrote } : {}), ...(missing.length ? { missing } : {}),
  }
  return { answer: { ok, pdf: req.draft ? null : pdf, log, aux: read('aux', 'utf8'), bbl: req.bibtex === false ? null : read('bbl', 'utf8'), ms: Math.round(record.real * 1000), passes, ...(files ? { files } : {}) }, record }
}

// ---------------------------------------------------------------- a paper's sides
/** the paper's compile host: native, each distinct request compiled once in this paper, every request recorded by the side
 *  that asked it */
function hostOf(source) {
  const memo = new Map()
  return (records, rewrite = null) => async req => {
    const q = rewrite ? rewrite(req) : req
    const key = requestKey(q)
    let hit = memo.get(key)
    const again = !!hit
    if (!hit) { hit = nativeCompile(source, q); memo.set(key, hit) }
    records.push({ ...hit.record, ...(again ? { again: true } : {}), key: key.slice(0, 12), request: q })
    return hit.answer
  }
}
/** the pages' text of a compile's PDF, as compiledOf's pagesTextOf reads it */
async function pagesTextOf(pdf) {
  const task = getDocument({ ...documentOptions, data: pdf.slice() })
  try { return await textOfPdf(await task.promise) } catch (e) { if (isMemoryError(e)) throw e; return null } finally { await task.destroy().catch(() => {}) }
}
/** one side: markedOfPaper asked as compiledOf asks it, `converge` or not, through `rewrite` where a variant writes its requests */
async function side(host, paperOf, facts, { converge, rewrite = null }) {
  const records = []
  const paper = paperOf()
  const t0 = performance.now()
  const made = await markedOfPaper(paper, {
    compile: host(records, rewrite),
    ...(converge ? { converge: true, filesBound: FILES_BOUND } : {}),
    compileBudgetMs: null,
    engines: HOST_ENGINES,
    pages: async () => facts.pages,
    ...(facts.day ? { sourceDate: facts.day } : {}),
    textOf: pdf => pagesTextOf(pdf),
  })
  const ms = Math.round(performance.now() - t0)
  const base = 'pdf' in made && made.base && 'pdf' in made.base ? made.base : null
  // (the request that made B: the final pass, or the loop's settled pass)
  const maker = base ? records.findLast(r => r.ok && r.kind !== 'draft' && r.kind !== 'latexmk' && r.kind !== 'probe') ?? null : null
  return { paper, made, base, records, maker, ms }
}
const passesOf = records => records.reduce((n, r) => n + r.passes, 0)
const secondsOf = records => ({ us: Number(records.reduce((n, r) => n + r.us, 0).toFixed(2)), real: Number(records.reduce((n, r) => n + r.real, 0).toFixed(2)) })
/** a value as text that names every Map, Set and byte array by its contents */
const canon = v => JSON.stringify(v, (_k, x) => (x instanceof Map ? { map: [...x] } : x instanceof Set ? { set: [...x] } : ArrayBuffer.isView(x) ? { bytes: sha(Buffer.from(x.buffer, x.byteOffset, x.byteLength)) } : x))
/** every reading of a log the instrument makes, readLines, and our statements in it */
function readingsOf(log) {
  const l = lastTexLog(log)
  return {
    align: canon(readAlign(l)), boxAlign: canon(readBoxAlign(l)), cellBoxes: canon(readCellBoxes(l)), colours: canon(readColours(log)),
    refNames: canon(readRefNames(l)), skips: canon(readSkips(l)), skipProbe: canon(readSkipProbe(log)), lines: canon(readLines(l)),
    statements: canon((l.match(/^(?:AXT|LAYOUT)-[A-Z]+\b.*$/gm) ?? [])),
  }
}
/** where two values' texts first differ, and the top-level keys (or indices) that differ */
function whereDiffers(a, b) {
  try {
    const A = JSON.parse(a), B = JSON.parse(b), keys = []
    for (const k of new Set([...Object.keys(A ?? {}), ...Object.keys(B ?? {})])) if (JSON.stringify(A?.[k]) !== JSON.stringify(B?.[k])) {
      const x = A?.[k], y = B?.[k]
      if (Array.isArray(x) && Array.isArray(y)) { const i = x.findIndex((e, j) => JSON.stringify(e) !== JSON.stringify(y[j])); keys.push(`${k}[${i < 0 ? x.length : i}] of ${x.length}/${y.length}`) } else keys.push(k)
      if (keys.length >= 6) break
    }
    return keys
  } catch { return ['(not JSON)'] }
}
/** the first file two requests were given that differs (by path order), or the first one only one of them was given */
function firstFileDiffering(qa, qb) {
  if (!qa || !qb) return null
  const paths = [...new Set([...qa.overrides.keys(), ...qb.overrides.keys()])].sort()
  for (const p of paths) {
    const a = qa.overrides.get(p), b = qb.overrides.get(p)
    if (!a || !b) return `${p}: given to ${a ? 'today' : 'Q1'} only`
    if (Buffer.compare(Buffer.from(a), Buffer.from(b))) {
      let at = 0
      while (at < a.length && at < b.length && a[at] === b[at]) at++
      const show = x => JSON.stringify(Buffer.from(x.subarray(Math.max(0, at - 30), at + 50)).toString('latin1'))
      return `${p} (${a.length} and ${b.length} B) at byte ${at}: ${show(a)} against ${show(b)}`
    }
  }
  return null
}
/** the instrument over a side's B, log and options, as prepareFront states it; and the back half's bundle of it with A */
async function instrumentAndBundle(s, facts, arxiv, ref, tree, withBundle) {
  if (!s.base) return null
  const r = await instrumentOf({ paper: s.paper, finalPdf: s.base.pdf, options: s.made.options, log: s.made.log, pdfjs, documentOptions, made: { compiler: s.paper.meta.compiler ?? 'pdflatex', tree, front: 'today' } })
  const out = { instrument: sha(canon(r.instrument)), text: canon(r.instrument) }
  if (!withBundle) return out
  const objects = []
  const front = async input => { await input.units(unitsObjects(sourceUnitsOf(s.paper))); return { ok: true, instrument: r.instrument, made: null } }
  const deflate = b => new Uint8Array(deflateSync(b))
  const inflate = (b, limit) => { const o = { finishFlush: Z.Z_SYNC_FLUSH, maxOutputLength: limit + 1 }; try { return new Uint8Array(inflateSync(b, o)) } catch (e) { if (e?.code === 'ERR_BUFFER_TOO_LARGE' || isMemoryError(e)) throw e; return new Uint8Array(inflateRawSync(b.subarray(2), o)) } }
  const end = await prepare(() => ({ files: new Map([['main.tex', new Uint8Array()]]), original: arxiv, stored: null }), {
    paper: ref, made: 'q1-check', tree: { year: tree, served: SERVED, fallback: PINS.default }, engines: HOST_ENGINES, pdfjs, documentOptions, PL, deflate, inflate,
    compile: async () => { throw new Error('the back half compiles nothing') }, stage: () => {}, units: async () => {}, instrument: async () => {},
    object: async x => { objects.push(`${x.kind}:${x.digest}`) }, note: () => {}, now: () => performance.now(),
  }, front)
  out.bundle = end.ok ? objects : { refused: end.detail ?? end.wrongTree ?? 'refused' }
  return out
}
/** B's link annotations, every page's (PDF.js's annotations of subtype Link) */
async function linksOf(pdf) {
  const task = getDocument({ ...documentOptions, data: pdf.slice() })
  try {
    const doc = await task.promise
    let n = 0
    for (let i = 1; i <= doc.numPages; i++) { const pg = await doc.getPage(i); n += (await pg.getAnnotations()).filter(a => a.subtype === 'Link').length; pg.cleanup() }
    return n
  } finally { await task.destroy().catch(() => {}) }
}

// ---------------------------------------------------------------- the variants' requests
const HYPERREF_DRAFT = '\\PassOptionsToPackage{draft}{hyperref}'
/** QP1: every marked request's main file with hyperref's draft option on its first line, beside graphicx's (no line moves) */
const qp1Rewrite = req => {
  const b = req.overrides.get(req.main)
  if (!b) return req
  const t = latin1(b), nl = t.indexOf('\n'), first = t.slice(0, nl)
  if (nl < 0 || !(first === DRAFT_OPTION || first === NO_DRIVER_GROUP)) return req
  return { ...req, overrides: new Map(req.overrides).set(req.main, latin1Bytes(`${first}${HYPERREF_DRAFT}${t.slice(nl)}`)) }
}
/** option (ii): pass 1, the loop's draft, of the unmarked files (originalFiles with `lines`, the paper's own bytes: CM's drafts) */
const unmarkedRewrite = paper => req => (req.draft && !req.rerun ? { ...req, overrides: originalFiles(paper, { lines: true, transcode: false }) } : req)
/** option (i): the bibliography pass's files carried into every pass of the loop where the request carries none of that path */
const bibRewrite = bibFiles => req => {
  if (req.rerun || !req.files) return req
  const over = new Map(req.overrides)
  for (const [p, b] of bibFiles) if (!over.has(p)) over.set(p, b)
  return { ...req, overrides: over }
}

// ---------------------------------------------------------------- the papers
if (!LIST) throw new Error('--list=<tsv of id and folder> is required')
let papers = readFileSync(LIST, 'utf8').split('\n').filter(Boolean).map(l => l.split('\t')).map(([id, dir]) => ({ id, dir }))
if (ONLY) papers = papers.filter(p => ONLY.includes(p.id))
if (FROM) papers = papers.slice(Math.max(0, papers.findIndex(p => p.id === FROM)))
mkdirSync(WORK, { recursive: true })
console.log(`native TeX ${BIN}; TEXMFLOCAL ${LOCAL}; makeindex ${MAKEINDEX ?? 'none'}; biber ${has('biber') ? 'yes' : 'none'}; variants ${VARIANTS.join(',') || 'none'}; out ${OUT}; ${papers.length} papers`)
const tally = { same: 0, differ: 0, refusedBoth: 0, refusedOne: 0, failed: 0 }
let failed = 0
for (const { id, dir } of papers) {
  const t0 = Date.now()
  let row = { id }
  try {
    const { files: source } = await unpackSource(new Uint8Array(readFileSync(join(dir, 'source.gz'))))
    if (!source) { console.log(`skip ${id}: no source (a PDF submission)`); continue }
    const arxiv = new Uint8Array(readFileSync(join(dir, 'arxiv.pdf')))
    const facts = await originalFactsOf(arxiv, { pdfjs, documentOptions })
    const tree = treeOf({ files: source, banner: facts.banner, served: SERVED, fallback: PINS.default }).tree
    const m = /^(.+)v(\d+)$/.exec(id), ref = { id: m[1], version: Number(m[2]) }
    const host = hostOf(source)
    // ---- the paper opened, its bibliography made once where TeX must (compiledOf's order), each side opening it again
    const bibRecords = []
    let bbl = null, bibFiles = null, kept = null
    const first = opened(source)
    if (bibliographyKept(first) === null) {
      const capture = []
      const bibCompile = async req => { const a = await host(bibRecords)(req); capture.push(a); return a }
      const r = await madeBibliography(first, { compile: bibCompile, engines: HOST_ENGINES })
      if ('paper' in r) { bbl = r.made; bibFiles = capture.at(-1)?.files ?? null } else kept = r.kept
    } else kept = bibliographyKept(first)
    const paperOf = () => (bbl ? withBbl(opened(source), bbl) : opened(source))
    row = { id, engine: first.meta.compiler, tree, pages: facts.pages, bibliography: bbl ? 'made' : kept, bib: { passes: passesOf(bibRecords), ...secondsOf(bibRecords) } }
    // ---- today's and Q1's
    const T = await side(host, paperOf, facts, { converge: false })
    const Q = await side(host, paperOf, facts, { converge: true })
    const summary = s => ({
      refused: 'refused' in s.made ? `${s.made.refused}${s.made.why ? `: ${s.made.why.slice(0, 160)}` : ''}` : s.base ? null : `base: ${s.made.base?.why?.slice(0, 160) ?? 'none'}`,
      b: s.base ? sha(s.base.pdf) : null, bBytes: s.base?.pdf.length ?? null, cm: s.made.cm ?? null, guard: s.made.guard ?? null,
      passes: passesOf(s.records), ...secondsOf(s.records), ms: s.ms,
      compiles: s.records.map(r => `${r.kind}${r.kind === 'latexmk' ? `(${r.passes})` : ''}${r.again ? '*' : ''} ${r.us}`),
      asked: s.records.reduce((x, r) => ({ n: Math.max(x.n, r.asked.n), bytes: Math.max(x.bytes, r.asked.bytes) }), { n: 0, bytes: 0 }),
      wrote: s.records.reduce((x, r) => ({ n: Math.max(x.n, r.files?.n ?? 0), bytes: Math.max(x.bytes, r.files?.bytes ?? 0) }), { n: 0, bytes: 0 }),
    })
    row.today = summary(T); row.q1 = summary(Q)
    const both = T.base && Q.base
    if (!both) {
      const same = canon(row.today.refused) === canon(row.q1.refused) && !T.base && !Q.base
      if (same) tally.refusedBoth++
      else { tally.refusedOne++; failed++ }
      row.verdict = same ? 'refused alike' : 'REFUSED ON ONE SIDE'
    } else {
      // ---- B, the log's readings, the plan, the guard's record, the instrument and the bundle
      const eq = {}
      eq.b = row.today.b === row.q1.b
      const rt = readingsOf(T.made.log), rq = readingsOf(Q.made.log)
      eq.readings = Object.fromEntries(Object.keys(rt).map(k => [k, rt[k] === rq[k]]))
      const plan = s => { const x = storedInstrumentOf({ finalPdf: s.base.pdf, log: s.made.log, options: s.made.options, bbl, facts }); return x ? sha(x.plan) : null }
      eq.plan = plan(T) === plan(Q)
      eq.options = canon(T.made.options) === canon(Q.made.options)
      eq.guard = canon(T.made.guard ?? null) === canon(Q.made.guard ?? null)
      const iT = await instrumentAndBundle(T, facts, arxiv, ref, tree, true), iQ = await instrumentAndBundle(Q, facts, arxiv, ref, tree, true)
      eq.instrument = iT.instrument === iQ.instrument
      eq.bundle = canon(iT.bundle) === canon(iQ.bundle)
      row.eq = eq
      const same = eq.b && Object.values(eq.readings).every(Boolean) && eq.plan && eq.options && eq.guard && eq.instrument && eq.bundle
      row.verdict = same ? 'identical' : 'DIFFERS'
      if (same) tally.same++
      else {
        tally.differ++; failed++
        row.first = {
          what: !eq.b ? 'B' : Object.entries(eq.readings).find(([, v]) => !v)?.[0] ?? (!eq.instrument ? 'instrument' : !eq.bundle ? 'bundle' : !eq.guard ? 'guard' : 'plan'),
          file: firstFileDiffering(T.maker?.request, Q.maker?.request),
          instrument: eq.instrument ? null : whereDiffers(iT.text, iQ.text),
          bundle: eq.bundle ? null : Array.isArray(iT.bundle) && Array.isArray(iQ.bundle) ? { onlyToday: iT.bundle.filter(x => !iQ.bundle.includes(x)).slice(0, 6), onlyQ1: iQ.bundle.filter(x => !iT.bundle.includes(x)).slice(0, 6) } : { today: iT.bundle, q1: iQ.bundle },
        }
        mkdirSync(OUT, { recursive: true })
        if (!eq.b) { writeFileSync(join(OUT, `${id}.today.pdf`), T.base.pdf); writeFileSync(join(OUT, `${id}.q1.pdf`), Q.base.pdf) }
        keepSide(id, 'today', T, iT)
        keepSide(id, 'q1', Q, iQ)
      }
      // ---- the variants, each against Q1's side
      row.variants = {}
      for (const v of VARIANTS) {
        if (v === 'bib' && !bibFiles) { row.variants.bib = { skipped: bbl ? 'the bibliography pass returned no files' : 'no bibliography made' }; continue }
        const rewrite = v === 'qp1' ? qp1Rewrite : v === 'unmarked' ? unmarkedRewrite(paperOf()) : bibRewrite(bibFiles)
        const V = await side(host, paperOf, facts, { converge: true, rewrite })
        const s = summary(V)
        const r = { refused: s.refused, cm: s.cm, passes: s.passes, us: s.us, real: s.real, compiles: s.compiles }
        if (V.base) {
          const rv = readingsOf(V.made.log)
          r.b = s.b === row.q1.b
          r.readings = Object.keys(rq).filter(k => rq[k] !== rv[k])
          r.guard = canon(V.made.guard ?? null) === canon(Q.made.guard ?? null)
          if (v === 'qp1') {
            const iV = await instrumentAndBundle(V, facts, arxiv, ref, tree, true)
            r.instrument = iV.instrument === iQ.instrument
            r.bundle = canon(iV.bundle) === canon(iQ.bundle)
            if (!r.bundle && Array.isArray(iV.bundle) && Array.isArray(iQ.bundle)) r.bundleDiff = { onlyQ1: iQ.bundle.filter(x => !iV.bundle.includes(x)).length, onlyQp1: iV.bundle.filter(x => !iQ.bundle.includes(x)).length, kinds: [...new Set(iV.bundle.filter(x => !iQ.bundle.includes(x)).map(x => x.split(':')[0]))] }
            r.links = await linksOf(V.base.pdf)
            r.linksQ1 = await linksOf(Q.base.pdf)
            if (!r.instrument || !r.bundle) {
              r.instrumentDiff = r.instrument ? null : whereDiffers(iQ.text, iV.text)
              keepSide(id, 'q1', Q, iQ)
              keepSide(id, 'qp1', V, iV)
            }
          } else if (!r.b) r.file = firstFileDiffering(Q.maker?.request, V.maker?.request)
        }
        row.variants[v] = r
      }
    }
    const fmt = s => `${s.passes} passes ${s.us} s`
    const vs = Object.entries(row.variants ?? {}).map(([k, r]) => `${k} ${r.skipped ? '-' : r.refused ? `refused` : k === 'qp1' ? `bundle ${r.bundle ? '=' : '≠'} links ${r.links}` : `B ${r.b ? '=' : '≠'}${r.readings?.length ? ` readings≠${r.readings.join('/')}` : ''}`}${r.passes !== undefined ? ` (${fmt(r)})` : ''}`).join('; ')
    console.log(`${row.verdict === 'identical' ? 'ok  ' : row.verdict === 'refused alike' ? 'both' : 'FAIL'} ${id} (${row.engine}, bib ${row.bibliography}): ${row.verdict}${row.first ? ` [first: ${row.first.what}; ${row.first.file ?? 'no file differs'}]` : ''}; today ${fmt(row.today)}, q1 ${fmt(row.q1)} cm ${canon(row.q1.cm)}${row.today.refused ? `; today refused ${row.today.refused}` : ''}${row.q1.refused ? `; q1 refused ${row.q1.refused}` : ''}${vs ? `; ${vs}` : ''}`)
  } catch (e) {
    failed++; tally.failed++
    row = { ...row, error: String(e?.stack ?? e).slice(0, 800) }
    console.log(`FAIL ${id}: ${row.error.split('\n')[0]}`)
    if (/^Error: stopped:/.test(String(e))) { writeFileSync(join(OUT, `${id}.json`), `${JSON.stringify(row, null, 1)}\n`); break }
  }
  row.seconds = Math.round((Date.now() - t0) / 1000)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, `${id}.json`), `${JSON.stringify(row, (k, v) => (k === 'request' ? undefined : v), 1)}\n`)
}
rmSync(BUILD, { recursive: true, force: true })
console.log(`papers ${papers.length}: identical ${tally.same}, differ ${tally.differ}, refused alike ${tally.refusedBoth}, refused on one side ${tally.refusedOne}, failed ${tally.failed}`)
process.exitCode = failed ? 1 : 0
