// lab/marks/time-today.mjs: today's prepare of one paper, timed stage by stage, every compile made anew (contract stage 1b,
// deliverable 6; the fifth owner's step 3). The sequence is the baseline's (baseline/tools/prepare.mjs: the tree, the job's
// BibTeX make, the units, markedOfPaper's probe, marked original, final pass and guard, the wrap with its delta, the page pass)
// on the code of `--root` (default: the main worktree, `next`'s head), its node_modules; each compile run in the docker slot
// (heavy-slot.sh, one runner, no network, the pinned image), in a build directory removed after it. Writes <out>/<id>.json:
// each compile (its kind, in-container ms, wall ms) and each JavaScript stage's ms. Not shipped.
//   node --max-old-space-size=6144 --import tsx lab/marks/time-today.mjs --dir=<paper dir> --id=<id> --out=<dir> [--root=<dir>]
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { constants as Z, deflateSync, inflateRawSync, inflateSync } from 'node:zlib'

const argOf = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const id = argOf('id'), OUT = argOf('out'), DIR = argOf('dir')
const ROOT = argOf('root') ?? '/Users/cheongzhiyan/Developer/ArxivTranslate'
const MODS = join(ROOT, 'node_modules')
const SLOT = '/Users/cheongzhiyan/Developer/readarxiv-lab-data/bin/heavy-slot.sh'
const run = promisify(execFile)
const PINS = JSON.parse(readFileSync(join(ROOT, 'lab/pdf/compile-images.json'), 'utf8'))
const E = join(ROOT, 'src/pdf-reader/engine'), im = f => import(pathToFileURL(join(E, f)).href)
const { getDocument, OPS } = await import(join(MODS, 'pdfjs-dist/legacy/build/pdf.mjs'))
const { LITE, LITE_DRAW } = await import(join(ROOT, 'lab/pdf/spikes/lite-pdfjs.mjs'))
const PL = await import(join(MODS, '@cantoo/pdf-lib/cjs/index.js')).then(m => m.default ?? m)
globalThis.OffscreenCanvas ??= class { getContext() { return { measureText: () => ({ width: 0 }), font: '' } } }
const live = await im('pipeline/live.mjs'), tar = await im('source/tar.mjs'), paperM = await im('layout/paper.mjs'), U = await im('layer-proto/units.mjs')
const arx = await im('layout/arxiv.mjs'), pass = await im('pipeline/page-pass.mjs'), tail = await im('layout/tail.mjs'), versions = await im('pipeline/versions.mjs'), baseM = await im('layout/base.mjs'), guard = await im('layout/guard.mjs')
const wrapMod = await im('layout/wrap.mjs'), deltaM = await im('layout/delta.mjs')
const NM = join(MODS, 'pdfjs-dist/')
const docOpts = { cMapUrl: `${NM}cmaps/`, cMapPacked: true, standardFontDataUrl: `${NM}standard_fonts/`, verbosity: 0, useSystemFonts: false }
const tasks = []
const open = (bytes, o = LITE) => { const t = getDocument({ data: bytes.slice(), ...o, ...docOpts }); tasks.push(t); return t.promise }
mkdirSync(OUT, { recursive: true })
const T0 = performance.now()
const js = {}
let t = performance.now()
const lap = k => { const now = performance.now(); js[k] = (js[k] ?? 0) + (now - t); t = now }

const { files: source } = await tar.unpackSource(new Uint8Array(readFileSync(join(DIR, 'source.gz'))))
const arxivBytes = new Uint8Array(readFileSync(join(DIR, 'arxiv.pdf')))
let paper = live.openPaper(source)
const arxivDoc0 = await open(arxivBytes)
const SERVED = Object.keys(PINS.images)
const declared = paper.meta.tlVersion == null ? null : String(paper.meta.tlVersion)
let year = declared && SERVED.includes(declared) ? declared : null
const banner = await guard.texLiveOfPdf(arxivDoc0).catch(() => null)
if (!year && declared === null && banner && SERVED.includes(String(banner))) year = String(banner)
year ??= PINS.default
const IMAGE = PINS.images[year].texlive
lap('open')

// ---- every compile made anew, its kind by its request and its place in the sequence
const compiles = []
let markedSeen = false
const filesUnder = (d, rel = '') => readdirSync(join(d, rel), { withFileTypes: true }).flatMap(x => (x.isDirectory() ? filesUnder(d, join(rel, x.name)) : [join(rel, x.name)]))
async function compile(req) {
  const c0 = performance.now()
  const all = new Map(source)
  for (const [p, b] of req.overrides ?? []) all.set(p, b)
  const build = join(OUT, `build-${id}`)
  rmSync(build, { recursive: true, force: true })
  for (const [p, b] of all) { const f = join(build, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
  const main = req.main, stem = main.split('/').pop().replace(/\.[^.]+$/, '')
  const eng = req.engine ?? 'pdflatex'
  const date = Number.isSafeInteger(req.sourceDate) ? ['-e', `SOURCE_DATE_EPOCH=${req.sourceDate}`, '-e', 'FORCE_SOURCE_DATE=1'] : []
  const draftFlag = { pdflatex: '-draftmode', latex: '-draftmode', lualatex: '--draftmode', xelatex: '-no-pdf' }[eng] ?? '-draftmode'
  const cmd = req.draft
    ? ['sh', '-c', `${eng} -interaction=nonstopmode ${draftFlag} ./${main}${req.bibtex ? `; bibtex ./${stem}` : ''}; true`]
    : req.rerun
      ? ['latexmk', '-norc', ...(eng === 'latex' ? ['-pdfdvi', '-e', '$dvipdf=q{dvipdfmx %O -o %D %S}'] : [{ xelatex: '-xelatex', lualatex: '-lualatex' }[eng] ?? '-pdf']), ...(req.bibtex === false ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-f', `./${main}`]
      : ['sh', '-c', `${eng === 'latex' ? 'latex' : eng} -interaction=nonstopmode ./${main}${eng === 'latex' ? `; dvipdfmx -o ${stem}.pdf ${stem}.dvi` : ''}; true`]
  const said = await run(SLOT, ['docker', '--', 'nice', '-n', '10', 'docker', 'run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', ...date, '-v', `${build}:/work`, '-w', '/work', IMAGE, 'sh', '-c', 's=$(date +%s%N); timeout 600 "$@" >/dev/null 2>&1; echo "axt-l2: ms $(( ($(date +%s%N) - s) / 1000000 ))"', 'sh', ...cmd], { maxBuffer: 1 << 26 }).then(r => r.stdout, e => e.stdout ?? '')
  const ms = Number(/axt-l2: ms (\d+)/.exec(said)?.[1] ?? NaN)
  const pdfF = join(build, `${stem}.pdf`), logF = join(build, `${stem}.log`)
  const pdf = existsSync(pdfF) && !req.draft ? new Uint8Array(readFileSync(pdfF)) : null
  const log = existsSync(logF) ? readFileSync(logF, 'latin1') : ''
  let files
  if (req.files) {
    files = new Map()
    for (const p of filesUnder(build)) { const k = p.split(sep).join('/'), b = new Uint8Array(readFileSync(join(build, p))), had = all.get(k); if (!had || Buffer.compare(Buffer.from(had), Buffer.from(b)) !== 0) files.set(k, b) }
  }
  rmSync(build, { recursive: true, force: true })
  const kind = req.draft ? 'bibliography' : req.rerun ? (markedSeen ? 'guard' : 'marked') : markedSeen ? 'final' : 'probe'
  if (req.rerun) markedSeen = true
  const wall = performance.now() - c0
  compiles.push({ kind, ms, wall: Math.round(wall) })
  t += wall
  return { ok: req.draft ? true : !!pdf?.length, pdf, log, ms, ...(files ? { files } : {}) }
}
const HOST_ENGINES = ['pdflatex', 'xelatex', 'lualatex', 'latex']

// ---- the job's .bbl, the units, the marked original and our final pass
if (paperM.bibliographyKept(paper) === null) {
  const r = await paperM.madeBibliography(paper, { compile, engines: HOST_ENGINES })
  if ('paper' in r) paper = r.paper
}
const bundle = U.bundleUnitsOf(paper)
lap('source')
const day = await baseM.creationEpochOf(arxivDoc0)
const textOf = async pdf => { const d = await open(pdf); return baseM.textOfPdf(d) }
const made = await paperM.markedOfPaper(paper, { compile, compileBudgetMs: null, engines: HOST_ENGINES, pages: async () => arxivDoc0.numPages, ...(day ? { sourceDate: day } : {}), textOf })
lap('marking')
let refusal = made.refused ? `marked: ${made.refused}` : null

// ---- the wrap with its delta, as ours.ts makes it
let ours = null
const finalPdf = made.base?.pdf instanceof Uint8Array ? made.base.pdf : null
const arxiv = refusal ? null : await open(arxivBytes, LITE_DRAW)
const text = refusal ? null : await arx.readArxivText(arxiv, { draw: true })
const mdoc = refusal ? null : await open(made.pdf)
const orig = { bytes: arxivBytes.length, sha256: null, xref: tail.startxrefOf(arxivBytes) }
lap('read')
if (!refusal && finalPdf) {
  const deflate = b => new Uint8Array(deflateSync(b))
  const inflate = (b, limit) => { const o = { finishFlush: Z.Z_SYNC_FLUSH, maxOutputLength: limit + 1 }; try { return new Uint8Array(inflateSync(b, o)) } catch (e) { if (e?.code === 'ERR_BUFFER_TOO_LARGE') throw e; return new Uint8Array(inflateRawSync(b.subarray(2), o)) } }
  const texts = Array.isArray(made.options?.texts) ? made.options.texts.flatMap(x => (Array.isArray(x) ? [String(x[0]), String(x[1])] : [String(x)])) : null
  const w = await wrapMod.wrapFinal(finalPdf, { PL, getDocument, documentOptions: { ...docOpts, ...LITE }, OPS, units: paper.units, texts, inkless: Array.isArray(made.options?.inkless) ? made.options.inkless : null, names: paper.theoremNames ?? null, inkFrom: bundle.length, deflate, inflate, keepOwned: true })
  if (w.refused) refusal = `wrap: ${w.refused}`
  else {
    let delta
    try {
      const d = await deltaM.deltaOf(arxivBytes, w.bytes, { PL })
      if (d.refused) delta = { refused: d.refused }
      else {
        const proved = await deltaM.proveDelta(arxivBytes, d.delta, w.bytes, { PL, getDocument, documentOptions: { ...docOpts, ...LITE }, replaced: d.replaced })
        delta = proved.ok ? { bytes: d.delta, sha256: d.sha256, replaced: d.replaced, stats: d.stats } : { refused: 'delta-proof' }
        for (const x of Object.values(proved.documents ?? {})) await x?.destroy?.().catch(() => {})
      }
    } catch (e) { delta = { refused: 'delta-proof' } }
    ours = { doc: await open(w.bytes, LITE_DRAW), bytes: w.bytes.length, sha256: w.sha256, xref: w.xref, delta, wrap: { stats: w.stats, unhidden: w.unhidden, labelKept: w.labelKept, pages: w.pages, ...(w.ledger ? { ledger: w.ledger } : {}), ...(w.figures ? { figures: w.figures } : {}) }, ink: w.ink }
  }
}
lap('wrap')
// ---- the page pass
let threw = null
if (!refusal) {
  try {
    await pass.layerOfPaper({ paper: { id: id.replace(/v\d+$/, ''), version: Number(/v(\d+)$/.exec(id)?.[1] ?? 1) }, source: paper, marked: { doc: mdoc, log: made.log, options: made.options }, arxiv: { doc: arxiv, text }, OPS, pdfjs: versions.PDFJS, base: orig, ...(ours ? { ours, orig, tree: year } : {}), image: '4', onHead: async () => {}, onLeft: () => {}, onPart: () => {} })
  } catch (e) { threw = `${e?.name}: ${e?.message}`.slice(0, 200) }
}
lap('pass')
for (const x of tasks) await x.destroy().catch(() => {})
const tex = {}
for (const c of compiles) { tex[c.kind] ??= { n: 0, ms: 0, wall: 0 }; tex[c.kind].n++; tex[c.kind].ms += c.ms; tex[c.kind].wall += c.wall }
const out = { id, root: ROOT, year, compiler: paper.meta.compiler ?? 'pdflatex', refused: refusal, threw, ms: Math.round(performance.now() - T0), js: Object.fromEntries(Object.entries(js).map(([k, v]) => [k, Math.round(v)])), tex, compiles }
writeFileSync(join(OUT, `${id}.json`), `${JSON.stringify(out)}\n`)
console.log(JSON.stringify({ id, ms: out.ms, tex: Object.fromEntries(Object.entries(tex).map(([k, v]) => [k, v.ms])), js: out.js, refusal, threw }))
process.exit(0)
