// experiments/pdf-bilingual/spikes/layout-make.mjs
// The layout maker on one paper (or several), end to end as the prepare will run it (Plan 8b, Task 6): the paper's
// layout compile — its marked original with the layout marks of every class on (live.mjs originalFiles with `layout`),
// compiled natively as the container compiles (latexmk in Docker's texlive/texlive:latest, --network none, 2 CPUs, 3 GB,
// 600 s), cached by its files' hash —, its marks file (marks.mjs layoutMarksOf), and the layout file made from it and
// arXiv's PDF (layout/make.mjs makeLayout); then the stats, beside the bars the layout research set for the four papers
// it measured (records/layout-maker.md). Exits 1 where a bar is not met, or nothing was made.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/layout-make.mjs [<id>v<n> …]   (the four researched papers by default)
// Data (outside git): <AXT_DATA, else experiments/pdf-bilingual/data>/layout/<id>v<n>/source.gz and arxiv.pdf, fetched
// once from arXiv where absent, with the project's User-Agent and nothing else; the compile in build/, the marks file in
// marks.json, the layout file in layout.json beside them. Stops below 10 GiB free on the data's disk.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { gzipSync } from 'node:zlib'
import { getDocument, OPS, version } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { keptFor, openPaper, originalFiles } from '../../../src/pdf-reader/engine/live.mjs'
import { LAYOUT_CLASSES, encodeLayoutMarks, layoutMarksOf, parseLayoutMarks } from '../../../src/pdf-reader/engine/layout/marks.mjs'
import { encodeLayout } from '../../../src/pdf-reader/engine/layout/file.mjs'
import { makeLayout } from '../../../src/pdf-reader/engine/layout/make.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/tar.mjs'

const run = promisify(execFile)
const root = new URL('..', import.meta.url).pathname
const DATA = process.env.AXT_DATA ?? join(root, 'data')
const UA = 'ReadarXiv/0.1 (+https://readarxiv.org; research)'
const FREE_MIN = 10 * 2 ** 30
const NM = new URL('../../../node_modules/pdfjs-dist/', import.meta.url).pathname
const open = bytes => getDocument({ data: bytes, verbosity: 0, cMapUrl: `${NM}cmaps/`, cMapPacked: true, standardFontDataUrl: `${NM}standard_fonts/`, useSystemFonts: false })
/** the layout research's bars (2026-10-06), by paper: cells and footnotes located, heading labels found */
const BARS = {
  '1512.03385v1': { cells: 0.95, headings: 13 },
  '1706.03762v7': { footnotes: 0.8, headings: 22 },
  '2307.16209v1': { footnotes: 0.8, headings: 45 },
  '2608.04322v1': { cells: 0.95, headings: 20 },
}
/** first baselines within a hundredth of TeX's start marks: the marks file holds hundredths (the controller's ruling of
 *  2026-10-06 on the brief's 0.003 pt, which a file of hundredths cannot show) */
const LINES_MIN = 0.975, PH_MIN = 0.98, BASELINE = 0.01, BASELINES_MIN = 0.98
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)} %` : '-')
const free = dir => { const s = statfsSync(dir); return s.bavail * s.bsize }

/** a paper's source and arXiv's PDF, from arXiv where they are not on this machine yet */
async function fetched(id, dir) {
  mkdirSync(dir, { recursive: true })
  for (const [file, url] of [['source.gz', `https://arxiv.org/e-print/${id}`], ['arxiv.pdf', `https://arxiv.org/pdf/${id}`]]) {
    const path = join(dir, file)
    if (existsSync(path)) continue
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
    writeFileSync(path, new Uint8Array(await res.arrayBuffer()))
  }
}

let failed = 0
const check = (paper, name, ok, detail) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${paper} ${name}: ${detail}`) }

for (const id of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BARS)) {
  const m = /^(.+)v(\d+)$/.exec(id)
  if (!m) throw new Error(`${id}: not an id with its version`)
  const dir = join(DATA, 'layout', id)
  mkdirSync(dir, { recursive: true })
  if (free(dir) < FREE_MIN) throw new Error(`less than 10 GiB free on ${dir}`)
  await fetched(id, dir)
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(dir, 'source.gz'))))
  const paper = openPaper(files)
  const main = paper.project.main, stem = main.split('/').pop().replace(/\.[^.]+$/, '')
  // the layout compile, cached by what it compiles
  const marked = originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES })
  const hash = createHash('sha256')
  for (const [p, b] of [...files, ...marked].sort((a, b) => (a[0] < b[0] ? -1 : 1))) hash.update(p).update(b)
  const key = hash.digest('hex').slice(0, 16)
  const build = join(dir, 'build'), marksFile = join(dir, 'marks.json'), stamp = join(dir, 'marks.key')
  let compileMs = null
  if (!existsSync(marksFile) || !existsSync(stamp) || readFileSync(stamp, 'utf8') !== key) {
    rmSync(build, { recursive: true, force: true })
    for (const [p, b] of [...files, ...marked]) { const f = join(build, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
    const t0 = Date.now()
    const flag = { xelatex: '-xelatex', lualatex: '-lualatex' }[paper.meta.compiler] ?? '-pdf'
    await run('docker', ['run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', '-v', `${build}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '600', 'latexmk', flag, ...(paper.meta.bbl ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-f', main], { maxBuffer: 1 << 26 }).catch(() => null)
    compileMs = Date.now() - t0
    const pdf = join(build, `${stem}.pdf`)
    if (!existsSync(pdf)) { check(id, 'compile', false, 'no PDF'); continue }
    const task = open(new Uint8Array(readFileSync(pdf)))
    const made = await layoutMarksOf(await task.promise, readFileSync(join(build, `${stem}.log`), 'latin1'), { engine: paper.meta.compiler })
    await task.destroy()
    writeFileSync(marksFile, encodeLayoutMarks(made))
    writeFileSync(stamp, key)
    rmSync(build, { recursive: true, force: true })
  }
  const marks = parseLayoutMarks(new Uint8Array(readFileSync(marksFile)))
  const task = open(new Uint8Array(readFileSync(join(dir, 'arxiv.pdf'))))
  const arxiv = await task.promise
  const t0 = performance.now()
  const out = await makeLayout({ units: paper.units, marks, arxiv, OPS, paper: { id: m[1], version: Number(m[2]) }, left: '', pdfjs: version })
  const wall = performance.now() - t0
  await task.destroy()
  const { stats } = out
  if (!('file' in out)) { check(id, 'made', false, `refused: ${out.refused} ${JSON.stringify(stats.refusal ?? stats.lines)}`); continue }
  const text = encodeLayout(out.file)
  writeFileSync(join(dir, 'layout.json'), text)
  const S = stats
  // the bars
  const L = S.lines
  check(id, 'lines carried', L.carried >= LINES_MIN * L.total, `${L.carried}/${L.total} ${pct(L.carried, L.total)}`)
  const four = ['math', 'cite', 'ref', 'code'].map(k => S.ph.byKind[k] ?? [0, 0]), found = four.reduce((a, [f]) => a + f, 0), marked4 = four.reduce((a, [, n]) => a + n, 0)
  check(id, 'placeholders found (math, cite, ref, code)', found >= PH_MIN * marked4, `${found}/${marked4} ${pct(found, marked4)}`)
  const bar = BARS[id] ?? {}
  const kind = k => S.units.byKind[k] ?? [0, 0]
  if (bar.cells) { const [a, b] = kind('cell'); check(id, 'cells located', a >= bar.cells * b, `${a}/${b} ${pct(a, b)}`) }
  if (bar.footnotes) { const [a, b] = kind('footnote'); check(id, 'footnotes located', a >= bar.footnotes * b, `${a}/${b} ${pct(a, b)}`) }
  if (bar.headings) { const [a, b] = S.labels.heading ?? [0, 0]; check(id, 'heading labels', a >= bar.headings, `${a}/${b} (bar ${bar.headings})`) }
  // the brief's 0.003 pt printed beside the bar
  const firsts = S.baselines.first, close = firsts.filter(d => d <= BASELINE + 1e-9).length, fine = firsts.filter(d => d <= 0.003 + 1e-9).length
  check(id, `first baselines within ${BASELINE} pt of TeX's start marks`, close >= BASELINES_MIN * firsts.length, `${close}/${firsts.length} ${pct(close, firsts.length)}; within 0.003 pt ${fine}/${firsts.length} ${pct(fine, firsts.length)}`)
  // displays: none written EMPTY (the layer draws nothing for one, and a display with ink lost from the page is the
  // completeness the layer must keep); found of those marked printed beside it
  const displays = out.file.ph.filter(r => r[2] === 1), dEmpty = displays.filter(r => r[3] & 16).length, dLost = displays.filter(r => r[3] & 32).length
  check(id, 'displays: none EMPTY', dEmpty === 0, `found ${displays.length - dEmpty - dLost}/${displays.length}, EMPTY ${dEmpty}, LOST ${dLost}`)
  // what was made, and what it cost
  const kept = keptFor(paper, 'zh'), cells = paper.units.map((u, i) => [u, i]).filter(([u]) => u.kind === 'cell' && !kept.has(u))
  const placedIds = new Set(out.file.units.map(u => u[0]))
  console.log(JSON.stringify({
    id, engine: paper.meta.compiler, compileMs, pages: out.file.paper.pages,
    lines: S.lines, units: S.units, translatedCells: [cells.filter(([, i]) => placedIds.has(i)).length, cells.length],
    ph: S.ph, labels: S.labels, frames: S.frames, capped: S.capped, timedOut: S.timedOut, over: S.over,
    lastBaselines: `${S.baselines.last.filter(d => d <= BASELINE + 1e-9).length}/${S.baselines.last.length} within ${BASELINE}`,
    bytes: { ...S.bytes, gzip9: gzipSync(text, { level: 9 }).length }, ms: Object.fromEntries(Object.entries(S.ms).map(([k, v]) => [k, Math.round(v)])), wallMs: Math.round(wall),
    fonts: out.file.fonts.length,
  }))
}
process.exitCode = failed ? 1 : 0
