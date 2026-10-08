// The server's preparation of the repository's own sample paper (tests/fixtures/pdf/sample-1/), run on this machine: the
// stand-in arXiv PDF and the layer bundle the reader's browser checks (tests/e2e/reader.mjs) are served from the stand-in
// of the layer API (tests/e2e/lib/layer-api.mjs). Nothing here is an arXiv paper's, so both outputs are committed.
//
//   pnpm exec tsx scripts/make-sample-bundle.mjs [--out=<dir>] [--check]
//
// The steps, in the order the server's prepare takes them, each through the engine's modules as they stand:
//   1. the stand-in arXiv PDF: the sample's source compiled unmarked (sample-1.pdf);
//   2. the units (live.mjs openPaper, as bundleUnitsOf writes them);
//   3. the left geometry: the source compiled again with a mark at each unit's start and end (live.mjs originalFiles),
//      those marks carried to the PDF of step 1 and the units anchored there (anchors.mjs), as the original's side is;
//   4. the layout marks (layout/paper.mjs layoutMarksOfPaper: the mark probe and the layout-marked original);
//   5. the layout file (layout/make.mjs makeLayout, over those marks and the PDF of step 1);
//   6. the add-on, its tail and manifest (layout/addon.mjs paperAddon);
//   7. the bundle (layer-proto/bundle.mjs writeBundle), read back at once by readBundle: bundle.json.
// Every compile is native TeX Live in Docker (the image the lab's gates run: texlive/texlive:latest, no network, 2 CPUs,
// 3 GB, 600 s) with the date pinned (SOURCE_DATE_EPOCH with FORCE_SOURCE_DATE), so that the same source gives the same
// bytes: run twice, the outputs are identical. `--out` writes elsewhere than the fixture's directory; `--check` makes the
// outputs in a temporary directory and exits 1 where they differ from the committed ones (a changed engine, a new
// TeX Live: remake them, and the stand-in's tests will tell what else moved). No request leaves this machine, and the
// image is never pulled.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { constants as zlibConstants, deflateSync, inflateRawSync, inflateSync } from 'node:zlib'
import * as PL from '@cantoo/pdf-lib'
import { getDocument, OPS, version as PDFJS_INSTALLED } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { anchorUnits, boundsFromMarks, markWords, tokenizeDocument } from '../src/pdf-reader/engine/anchors.mjs'
import { bundleUnitsOf, readBundle, writeBundle } from '../src/pdf-reader/engine/layer-proto/bundle.mjs'
import { openPaper, originalFiles } from '../src/pdf-reader/engine/live.mjs'
import { paperAddon } from '../src/pdf-reader/engine/layout/addon.mjs'
import { encodeLayout, indexLayout, parseLayout } from '../src/pdf-reader/engine/layout/file.mjs'
import { makeLayout } from '../src/pdf-reader/engine/layout/make.mjs'
import { parseLayoutMarks } from '../src/pdf-reader/engine/layout/marks.mjs'
import { layoutMarksOfPaper } from '../src/pdf-reader/engine/layout/paper.mjs'
import { displayEdges, unitText } from '../src/pdf-reader/engine/mt.mjs'
import { PDFJS } from '../src/pdf-reader/engine/versions.mjs'

const run = promisify(execFile)
const REPO = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE = join(REPO, 'tests/fixtures/pdf/sample-1')
const argOf = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const CHECK = process.argv.includes('--check')
const OUT = CHECK ? mkdtempSync(join(tmpdir(), 'sample-bundle-out-')) : (argOf('out') ?? FIXTURE)

/** the sample's identity: an identifier no arXiv paper has (there is no month 00), its first version, and the compiler
 *  image's name the web's prepare names (container/image.json) */
const PAPER = { id: '2600.00001', version: 1 }
const IMAGE = '1'
/** every compile's date, as the lab pins it (2026-10-06) */
const EPOCH = 1791244800
const FREE_MIN = 10 * 2 ** 30
/** the units TeX sets away from where the source has them (a float's caption, a footnote, a cell, a picture's text) */
const FLOATING = new Set(['caption', 'footnote', 'cell', 'figure'])

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
if (PDFJS_INSTALLED !== PDFJS) throw new Error(`PDF.js ${PDFJS_INSTALLED} is installed, the engine names ${PDFJS}`)
const free = dir => { const s = statfsSync(dir); return s.bavail * s.bsize }
if (free(tmpdir()) < FREE_MIN) throw new Error(`less than 10 GiB free on ${tmpdir()}`)

// ---- the sample's source: its three files (the outputs and the README beside them are not)
const SOURCE_FILES = ['main.tex', 'main.bbl', 'refs.bib']
const files = new Map(SOURCE_FILES.map(name => [name, new Uint8Array(readFileSync(join(FIXTURE, name)))]))
const paper = openPaper(files)
const { main } = paper.project
const stem = main.replace(/\.[^.]+$/, '')

/** one compile: the files in a directory of their own, latexmk in Docker, the PDF's bytes and the log's text (the PDF null
 *  where none was made). `once`: one pass, as the mark probe is compiled */
async function compile(sources, { once = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sample-bundle-tex-'))
  try {
    for (const [path, bytes] of sources) {
      const file = join(dir, path)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, bytes)
    }
    const flag = { xelatex: '-xelatex', lualatex: '-lualatex' }[paper.meta.compiler] ?? '-pdf'
    const args = ['run', '--rm', '--init', '--pull', 'never', '--network', 'none', '--cpus', '2', '--memory', '3g', '-e', 'FORCE_SOURCE_DATE=1', '-e', `SOURCE_DATE_EPOCH=${EPOCH}`, '-v', `${dir}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '600', 'latexmk', flag, ...(once ? ['-e', '$max_repeat=1'] : []), ...(paper.meta.bbl ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-f', main]
    // (latexmk -f exits non-zero on a TeX error and still leaves what it made: judged by its files. Docker's own failures are
    // not that: no docker, no daemon, no image on this machine — the image is never pulled — each is said as itself)
    await run('docker', args, { maxBuffer: 1 << 26 }).catch(e => {
      if (e?.code === 'ENOENT') throw new Error('docker is not installed, or not on the PATH: the sample is compiled in its texlive/texlive:latest image')
      if (/Cannot connect to the Docker daemon|Is the docker daemon running/i.test(String(e?.stderr ?? ''))) throw new Error('the Docker daemon is not running: start Docker, then make the outputs again')
      if (e?.code === 125) throw new Error(`docker could not run the compile (exit 125): ${String(e.stderr ?? '').trim().split('\n')[0] || 'no message'}; the image texlive/texlive:latest must be on this machine, and the maker never pulls it`)
    })
    const pdf = join(dir, `${stem}.pdf`), log = join(dir, `${stem}.log`)
    return existsSync(log) ? { pdf: existsSync(pdf) ? new Uint8Array(readFileSync(pdf)) : null, log: readFileSync(log, 'latin1') } : null
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
/** the source with the marked files laid over it */
const withSource = overrides => new Map([...files, ...overrides])

// ---- PDF.js, as the lab's Node spikes read a PDF
const NODE_MODULES = join(REPO, 'node_modules/pdfjs-dist/')
const open = bytes => getDocument({ data: bytes.slice(), verbosity: 0, cMapUrl: `${NODE_MODULES}cmaps/`, cMapPacked: true, standardFontDataUrl: `${NODE_MODULES}standard_fonts/`, useSystemFonts: false })
/** a document's pages' text, as anchors.mjs reads it, and their views */
async function textPages(doc) {
  const pages = [], views = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p), text = await page.getTextContent()
    pages.push({ page: p, items: text.items, styles: text.styles })
    views.push(page.view)
  }
  return { pages, views }
}
/** the named destinations of the unit marks (axt-<unit>s and axt-<unit>e): where each is, { page, x, y } */
async function unitMarks(doc) {
  const marks = new Map()
  for (const [name, d] of await doc.getDestinations()) if (d && /^axt-\d+[se]$/.test(name)) marks.set(name.slice(4), { page: (await doc.getPageIndex(d[0])) + 1, x: d[2], y: d[3] })
  return marks
}
const hundredths = x => Math.round(x * 100) / 100

const step = (n, what) => console.log(`${n}. ${what}`)

// 1. the stand-in arXiv PDF
step(1, 'the sample compiled unmarked')
const unmarked = await compile(files)
if (!unmarked?.pdf) throw new Error('the sample made no PDF')
const arxiv = unmarked.pdf
const arxivTask = open(arxiv)
const arxivDoc = await arxivTask.promise

// 2. the units
step(2, 'the units')
const kinds = paper.units.map(u => u.kind)
const units = bundleUnitsOf(paper)
console.log(`   ${units.length} units (${[...new Set(kinds)].map(k => `${kinds.filter(x => x === k).length} ${k}`).join(', ')})`)

// 3. the left geometry: our compile's unit marks carried to the PDF of step 1
step(3, 'the left geometry')
const marked = await compile(withSource(originalFiles(paper)))
if (!marked?.pdf) throw new Error('the marked original made no PDF')
const markedTask = open(marked.pdf)
const left = await (async () => {
  const markedDoc = await markedTask.promise
  const here = await textPages(arxivDoc)
  const doc = tokenizeDocument(here.pages)
  const carried = markWords(tokenizeDocument((await textPages(markedDoc)).pages), await unitMarks(markedDoc))
  const texts = paper.units.map((u, id) => ({ id, ...unitText(u.pieces), ...displayEdges(u) }))
  const anchors = anchorUnits(doc, texts, { bounds: boundsFromMarks(doc, carried), floating: id => FLOATING.has(kinds[id]) })
  const located = []
  for (const [id, anchor] of [...anchors].sort((a, b) => a[0] - b[0])) {
    if (!anchor?.rects.length) continue
    located.push([id, anchor.tokens[0], anchor.rects.map(r => [r.page, hundredths(r.x0), hundredths(r.y0), hundredths(r.x1), hundredths(r.y1)])])
  }
  return { kinds, pages: here.views.map(v => v.map(hundredths)), units: located }
})()
await markedTask.destroy()
console.log(`   ${left.units.length} of ${units.length} units located on ${left.pages.length} pages`)

// 4. the layout marks
step(4, 'the layout marks')
let compileFault = null
const made = await layoutMarksOfPaper(paper, {
  compile: async req => {
    try {
      const c = await compile(withSource(req.overrides), { once: !req.rerun })
      return c ? { ok: !!c.pdf?.length, pdf: c.pdf, log: c.log } : { ok: false, error: 'no log' }
    } catch (e) { compileFault = e; throw e }
  },
  open: async bytes => {
    const task = open(bytes)
    try { return { doc: await task.promise, close: () => task.destroy() } } catch (e) { await task.destroy().catch(() => {}); throw e }
  },
  OPS,
})
if (compileFault) throw compileFault
if (!('marks' in made)) throw new Error(`the layout marks were refused at the ${made.refused}`)
console.log(`   ${made.marks.length} bytes`)

// 5. the layout file
step(5, 'the layout file')
const layoutMade = await makeLayout({ units: paper.units, marks: parseLayoutMarks(made.marks), arxiv: arxivDoc, OPS, paper: PAPER, left: '', pdfjs: PDFJS })
if (!('file' in layoutMade)) throw new Error(`the layout maker refused the paper (${layoutMade.refused})`)
const layoutText = encodeLayout(layoutMade.file)
const layoutBytes = new TextEncoder().encode(layoutText)
const layout = parseLayout(layoutBytes)
const { located, total } = layoutMade.stats.units
console.log(`   ${layoutBytes.length} bytes; ${located} of ${total} units located`)

// 6. the add-on
step(6, 'the add-on')
const inflate = (bytes, limit) => {
  const o = { finishFlush: zlibConstants.Z_SYNC_FLUSH, maxOutputLength: limit + 1 }
  try { return new Uint8Array(inflateSync(bytes, o)) } catch (e) { if (e?.code === 'ERR_BUFFER_TOO_LARGE') throw e; return new Uint8Array(inflateRawSync(bytes.subarray(2), o)) }
}
const addonTask = open(arxiv)
const addon = await paperAddon({ bytes: arxiv, index: indexLayout(layout), doc: await addonTask.promise, OPS, PL, deflate: bytes => new Uint8Array(deflateSync(bytes)), inflate })
await addonTask.destroy()
if (!addon.ok) throw new Error(`the remover refused the paper: ${addon.refused}`)
const entries = Object.values(addon.manifest.page)
console.log(`   tail ${addon.tail.length} bytes; ${entries.filter(p => p.ok).length} of ${addon.manifest.pages} pages made, ${entries.filter(p => p.ok && p.at).length} with a removed page`)

// 7. the bundle, read back at once
step(7, 'the bundle')
const parts = {
  paper: { ...PAPER, pages: arxivDoc.numPages },
  base: { bytes: arxiv.length, sha256: sha256(arxiv), url: `/api/v1/original/${PAPER.id.replace('/', '_')}v${PAPER.version}` },
  image: IMAGE,
  units,
  left,
  layout,
  addon: { manifest: addon.manifest, tail: addon.tail },
}
const bundle = writeBundle(parts)
if (!same(writeBundle(parts), bundle)) throw new Error('the same parts gave other bytes')
const read = readBundle(bundle)
if (read.dropped.length) throw new Error(`the reader drops units ${read.dropped.join(', ')}`)
if (read.layout === null || read.addon === null) throw new Error('the bundle holds no layout or no add-on')
if (encodeLayout(read.layout) !== layoutText || !same(read.addon.tail, addon.tail)) throw new Error('readBundle does not give the layout and the tail back')
await arxivTask.destroy()

// the outputs
const outputs = new Map([['sample-1.pdf', arxiv], ['bundle.json', bundle]])
if (CHECK) {
  let differ = 0
  for (const [name, bytes] of outputs) {
    const committed = existsSync(join(FIXTURE, name)) ? new Uint8Array(readFileSync(join(FIXTURE, name))) : null
    const ok = committed !== null && same(committed, bytes)
    if (!ok) differ++
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${ok ? 'the committed bytes' : 'differs from the committed file'} (${bytes.length} bytes, sha256 ${sha256(bytes).slice(0, 16)})`)
  }
  rmSync(OUT, { recursive: true, force: true })
  process.exit(differ ? 1 : 0)
}
mkdirSync(OUT, { recursive: true })
for (const [name, bytes] of outputs) {
  writeFileSync(join(OUT, name), bytes)
  console.log(`wrote ${relative(REPO, join(OUT, name)) || name}: ${bytes.length} bytes, sha256 ${sha256(bytes)}`)
}
console.log(`${readdirSync(OUT).length} files in ${OUT.startsWith(REPO) ? relative(REPO, OUT) : 'the output directory'}`)
