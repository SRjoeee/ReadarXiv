// experiments/pdf-bilingual/spikes/layout-paper-check.mjs
// The layout marks of a paper in one call (layout/paper.mjs layoutMarksOfPaper, E5) against the sequence the layer gate's
// fixture maker (spikes/layer-fixtures.mjs --switch) made them by until then, which this file keeps as its reference: the mark
// probe compiled in one pass, its answers read, the marked original compiled with them, its marks read from its PDF and
// last pass's log. Byte for byte, or every difference.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/layout-paper-check.mjs [<id>v<n> …] [--fresh] [--image=<docker image>]
//        [--compiles=<folder>] [--timeout=<s>] [--out=<folder>]
// With no paper, the gate's five. Both sides read the layer-fixtures.mjs compile cache (data/layout/<id>/compiles, by what is
// compiled), so that with no option nothing is compiled and what is checked is the call's order, requests and options.
// --fresh: layoutMarksOfPaper compiles into a folder of its own (--compiles, else <out>/compiles/<image>), the cache bypassed,
// each compile run natively as the maker runs it (latexmk in Docker's TeX Live, no network, 2 CPUs, 3 GB, --timeout seconds,
// 600) in --image (default texlive/texlive:latest), and its marks are checked against the reference's, which the cache holds
// as the maker's earlier image compiled them; each compile's seconds are printed. A compile already in --compiles is taken.
// Writes both marks files to <out>/marks/<image>/ (default out/layer-gate/e5-proof). Exits 1 where any differ or a paper is refused.
// Data (outside git): as layer-fixtures.mjs's. Makes no network request. Stops below 15 GiB free.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { layoutMarksOfPaper } from '../../../src/pdf-reader/engine/layout/paper.mjs'
import { encodeLayoutMarks, inkSamples, LAYOUT_CLASSES, layoutMarksOf, probeSamples, readInkProbe, readInkTexts, readMarkProbe } from '../../../src/pdf-reader/engine/layout/marks.mjs'
import { openPaper, originalFiles, probeFiles } from '../../../src/pdf-reader/engine/live.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/tar.mjs'

const run = promisify(execFile)
const root = new URL('..', import.meta.url).pathname
const argOf = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const FRESH = process.argv.includes('--fresh')
const IMAGE = argOf('image') ?? 'texlive/texlive:latest'
const TIMEOUT = Number(argOf('timeout') ?? 600)
const DATA = process.env.AXT_DATA ?? join(root, 'data')
const OUT = resolve(argOf('out') ?? join(root, 'out/layer-gate/e5-proof'))
const FREE_MIN = 15 * 2 ** 30
const PAPERS = ['1512.03385v1', '1706.03762v7', '1810.04805v2', '2307.16209v1', '2608.04322v1']
const NM = new URL('../../../node_modules/pdfjs-dist/', import.meta.url).pathname
const open = bytes => getDocument({ data: bytes, verbosity: 0, cMapUrl: `${NM}cmaps/`, cMapPacked: true, standardFontDataUrl: `${NM}standard_fonts/`, useSystemFonts: false })
const free = dir => { const s = statfsSync(dir); return s.bavail * s.bsize }
const tag = IMAGE.replace(/[^A-Za-z0-9.-]+/g, '_')

/** a compile's files by what it compiles, as layer-fixtures.mjs keys them (the paper's source files and the marked ones, sorted by path) */
const keyOf = (source, marked) => {
  const hash = createHash('sha256')
  for (const [p, b] of [...source, ...marked].sort((a, b) => (a[0] < b[0] ? -1 : 1))) hash.update(p).update(b)
  return hash.digest('hex').slice(0, 16)
}

/**
 * One native compile as layer-fixtures.mjs compiledNow makes it (latexmk in Docker's TeX Live, no network, 2 CPUs, 3 GB), in
 * IMAGE: its PDF and its last pass's log, with the seconds the container took and the containers already running; null where
 * it left no log
 */
async function dockerCompile(dir, name, files, paper, { once, bibtex }) {
  if (free(dir) < FREE_MIN) throw new Error(`less than 15 GiB free on ${dir}`)
  const main = paper.project.main, stem = main.split('/').pop().replace(/\.[^.]+$/, ''), build = join(dir, `build-${name}`)
  rmSync(build, { recursive: true, force: true })
  try {
    for (const [p, b] of files) { const f = join(build, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
    const flag = { xelatex: '-xelatex', lualatex: '-lualatex' }[paper.meta.compiler] ?? '-pdf'
    // (containers other than this one running at the start: what else the machine is compiling, which the seconds depend on)
    const others = (await run('docker', ['ps', '-q']).catch(() => ({ stdout: '' }))).stdout.split('\n').filter(Boolean).length
    const t0 = Date.now()
    await run('docker', ['run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', '-v', `${build}:/work`, '-w', '/work', IMAGE, 'timeout', String(TIMEOUT), 'latexmk', flag, ...(once ? ['-e', '$max_repeat=1'] : []), ...(bibtex ? [] : ['-bibtex-']), '-interaction=nonstopmode', '-f', main], { maxBuffer: 1 << 26 }).catch(() => null)
    const seconds = (Date.now() - t0) / 1000
    const pdf = join(build, `${stem}.pdf`), log = join(build, `${stem}.log`)
    return existsSync(log) ? { pdf: existsSync(pdf) ? new Uint8Array(readFileSync(pdf)) : null, log: readFileSync(log, 'latin1'), seconds, others } : null
  } finally { rmSync(build, { recursive: true, force: true }) }
}

/** a compile kept by what it compiles in `at` (<key>.pdf and .log, as layer-fixtures.mjs keeps them); `make` false: only what is kept */
async function kept(at, dir, name, files, paper, how, make) {
  const pdfF = join(at, `${name}.pdf`), logF = join(at, `${name}.log`)
  if (existsSync(logF)) return { pdf: existsSync(pdfF) ? new Uint8Array(readFileSync(pdfF)) : null, log: readFileSync(logF, 'latin1'), seconds: null }
  if (!make) throw new Error(`${name}: not in ${at} (layer-fixtures.mjs --switch makes it)`)
  const c = await dockerCompile(dir, name, files, paper, how)
  if (c) { mkdirSync(at, { recursive: true }); if (c.pdf) writeFileSync(pdfF, c.pdf); writeFileSync(logF, Buffer.from(c.log, 'latin1')) }
  return c
}

/** a PDF.js document of the bytes, with the close the call asks for */
const opened = async bytes => { const task = open(bytes); return { doc: await task.promise, close: () => task.destroy() } }

/**
 * The reference: the sequence layer-fixtures.mjs --switch had before E5 (its layoutOf), unchanged — the probe's compile
 * (one pass), the three readings of its log, the marked original with them, its compile, its marks read from the PDF and the
 * log with the units and OPS — over the kept compiles alone
 */
async function referenceMarks(paper, source, at) {
  const withSource = marked => { const all = new Map(source); for (const [p, b] of marked) all.set(p, b); return all }
  const probe = probeFiles(paper, { marks: true })
  const c0 = await kept(at, null, `probe-${keyOf(source, probe)}`, withSource(probe), paper, { once: true, bibtex: false }, false)
  const switches = readMarkProbe(c0?.log ?? '', probeSamples(paper.units))
  const inkless = readInkProbe(c0?.log ?? '', inkSamples(paper.units)), texts = readInkTexts(c0?.log ?? '', inkSamples(paper.units))
  const marked = originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES, switches, ...(inkless ? { inkless } : {}) })
  const c = await kept(at, null, keyOf(source, marked), withSource(marked), paper, { once: false, bibtex: !paper.meta.bbl }, false)
  if (!c?.pdf) return null
  const task = open(c.pdf)
  try { return Buffer.from(encodeLayoutMarks(await layoutMarksOf(await task.promise, c.log, { engine: paper.meta.compiler, classes: LAYOUT_CLASSES, switches, ...(inkless ? { inkless } : {}), ...(texts ? { texts } : {}), units: paper.units, OPS }))) } finally { await task.destroy() }
}

/** where two marks files differ: the first differing byte with its neighbours, and the fields that differ, with counts */
function differences(a, b) {
  const n = Math.min(a.length, b.length)
  let at = 0
  while (at < n && a[at] === b[at]) at++
  const show = x => JSON.stringify(Buffer.from(x.subarray(Math.max(0, at - 24), at + 48)).toString('utf8'))
  const lines = [`sizes ${a.length} and ${b.length}; first differing byte ${at}: ${show(a)} against ${show(b)}`]
  const A = JSON.parse(Buffer.from(a).toString('utf8')), B = JSON.parse(Buffer.from(b).toString('utf8'))
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
    const x = JSON.stringify(A[k]), y = JSON.stringify(B[k])
    if (x === y) continue
    const len = v => (Array.isArray(v) ? v.length : null)
    let moved = null
    if (Array.isArray(A[k]) && Array.isArray(B[k])) { moved = 0; for (let i = 0; i < Math.max(A[k].length, B[k].length); i++) if (JSON.stringify(A[k][i]) !== JSON.stringify(B[k][i])) moved++ }
    lines.push(`  ${k}: ${len(A[k]) ?? typeof A[k]} against ${len(B[k]) ?? typeof B[k]}${moved === null ? ` (${x?.slice(0, 80)} against ${y?.slice(0, 80)})` : `, ${moved} entries differ`}`)
  }
  return lines
}

const ids = process.argv.slice(2).filter(a => !a.startsWith('--'))
let failed = 0
console.log(`image ${IMAGE}: ${(await run('docker', ['image', 'inspect', IMAGE, '--format', '{{.Id}} {{.Architecture}}']).catch(() => ({ stdout: 'not found' }))).stdout.trim()}${FRESH ? ', fresh compiles' : ', kept compiles'}`)
for (const id of ids.length ? ids : PAPERS) {
  const dir = join(DATA, 'layout', id), cache = join(dir, 'compiles')
  const { files: source } = await unpackSource(new Uint8Array(readFileSync(join(dir, 'source.gz'))))
  const paper = openPaper(source)
  const at = FRESH ? resolve(argOf('compiles') ?? join(OUT, 'compiles', tag), id) : cache
  const ran = []
  // layoutMarksOfPaper's compiler: the same compile the maker made, kept by what it compiles
  const compile = async req => {
    const marked = req.overrides, probe = !req.rerun
    const withSource = new Map(source)
    for (const [p, b] of marked) withSource.set(p, b)
    const name = `${probe ? 'probe-' : ''}${keyOf(source, marked)}`
    const c = await kept(at, dir, name, withSource, paper, { once: probe, bibtex: req.bibtex !== false }, true)
    if (!c) return { ok: false, error: 'no log' }
    ran.push(`${probe ? 'probe' : 'original'} ${c.seconds === null ? 'kept' : `${c.seconds.toFixed(1)} s (${c.others} other containers)`}`)
    return { ok: !!c.pdf?.length, pdf: c.pdf, log: c.log }
  }
  const t0 = Date.now()
  const reference = await referenceMarks(paper, source, cache).catch(e => { console.log(`FAIL ${id} reference: ${e.message}`); return null })
  const made = await layoutMarksOfPaper(paper, { compile, open: opened, OPS })
  console.log(`${id}: ${ran.join(', ')}; ${JSON.stringify('ms' in made ? made.ms : null)} ms (${((Date.now() - t0) / 1000).toFixed(1)} s)`)
  if (!('marks' in made)) { failed++; console.log(`FAIL ${id}: refused at ${made.refused}`); continue }
  mkdirSync(join(OUT, 'marks', tag), { recursive: true })
  writeFileSync(join(OUT, 'marks', tag, `${id}.marks.json`), made.marks)
  if (!reference) { failed++; continue }
  writeFileSync(join(OUT, 'marks', tag, `${id}.reference.json`), reference)
  if (Buffer.compare(Buffer.from(made.marks), reference) === 0) console.log(`ok   ${id}: ${reference.length} bytes, equal`)
  else { failed++; console.log(`FAIL ${id}: the marks differ`); for (const l of differences(reference, made.marks)) console.log(l) }
}
process.exitCode = failed ? 1 : 0
