// The highlights fixture (tests/fixtures/pdf/highlights/): a page of our own whose words carry soul's highlights — through the
// paper's own macros of two colours and through \hl itself; two of them glued inside one word, in a paragraph and in a caption;
// one at a word's start, its middle and its end; one run across a line's end —, made as the box's prepare makes a paper's, up to
// the instrument: the stand-in for arXiv's PDF (highlights.tex compiled as it is), then the engine's front half over it
// (layout/paper.mjs markedOfPaper: the mark probe, the marked original, our final pass), each compile in the pinned TeX Live
// (lab/pdf/spikes/compile-image.mjs) with the date pinned, so that the same source gives the same bytes. It writes:
//   - `arxiv.pdf`: the stand-in, what the back half locates on (prepareBack's A);
//   - `final.pdf`: our final pass, what the instrument reads (B);
//   - `made.json`: what the front half handed the instrument besides it: the marking's options (`options`) and the marked
//     compile's log (`log`).
// The back half (the instrument, locate, the wrap) is run by the tests over these (tests/pdf-reader/highlights.test.ts), so that a
// change there is held without a compile; a change of the front half's marking is made again here.
//   pnpm exec tsx scripts/make-highlight-fixture.mjs            # writes the three files
//   pnpm exec tsx scripts/make-highlight-fixture.mjs --check    # makes them again in a scratch folder; exits 1 where they differ
// Nothing here is an arXiv paper's: the source and everything made from it are ours, CC0. No request leaves this machine; the image
// is never pulled.
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { openPaper } from '../src/pdf-reader/engine/pipeline/live.mjs'
import { markedOfPaper } from '../src/pdf-reader/engine/layout/paper.mjs'
import { DRIVER_OUTPUT_MARK, textOfPdf } from '../src/pdf-reader/engine/layout/base.mjs'
import { checkCompileImage, COMPILE_IMAGE, PLATFORM } from '../lab/pdf/spikes/compile-image.mjs'

const run = promisify(execFile)
const FIXTURE = fileURLToPath(new URL('../tests/fixtures/pdf/highlights/', import.meta.url))
const MAIN = 'highlights.tex'
/** the date every compile is pinned at (2026-11-12, UTC midnight): the stand-in's and every compile of the front half's */
const EPOCH = 1794441600
const check = process.argv.includes('--check')
const NM = fileURLToPath(new URL('../node_modules/pdfjs-dist/', import.meta.url))
const DOC = { cMapUrl: `${NM}cmaps/`, cMapPacked: true, standardFontDataUrl: `${NM}standard_fonts/`, verbosity: 0, useSystemFonts: false }
const filesUnder = (d, rel = '') => readdirSync(join(d, rel), { withFileTypes: true }).flatMap(x => (x.isDirectory() ? filesUnder(d, join(rel, x.name)) : [join(rel, x.name)]))

/** one compile in the pinned image, no network, as the box answers a CompileRequest (lab/marks/today.mjs's compiler, uncached):
 *  `files` the paper's with the request's overrides, in a folder of its own */
async function compileIn(scratch, files, req) {
  const build = mkdtempSync(join(scratch, 'c-'))
  for (const [p, b] of files) { const f = join(build, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
  const main = req.main, stem = main.split('/').pop().replace(/\.[^.]+$/, '')
  const engine = req.engine ?? 'pdflatex'
  const date = Number.isSafeInteger(req.sourceDate) ? ['-e', `SOURCE_DATE_EPOCH=${req.sourceDate}`, '-e', 'FORCE_SOURCE_DATE=1'] : []
  const draftFlag = { pdflatex: '-draftmode', latex: '-draftmode', lualatex: '--draftmode', xelatex: '-no-pdf' }[engine] ?? '-draftmode'
  const cmd = req.draft
    ? ['sh', '-c', `${engine} -interaction=nonstopmode ${draftFlag} ./${main}${req.bibtex ? `; bibtex ./${stem}` : ''}; true`]
    : req.rerun
      ? ['latexmk', '-norc', ...(engine === 'latex' ? ['-pdfdvi', '-e', '$dvipdf=q{dvipdfmx %O -o %D %S}'] : [{ xelatex: '-xelatex', lualatex: '-lualatex' }[engine] ?? '-pdf']), ...(req.bibtex === false ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-f', main]
      : ['sh', '-c', `${engine === 'latex' ? 'latex' : engine} -interaction=nonstopmode ./${main}${engine === 'latex' ? `; dvipdfmx -o ${stem}.pdf ${stem}.dvi` : ''}; true`]
  const said = await run('docker', ['run', '--rm', '--init', '--pull', 'never', ...PLATFORM, '--network', 'none', '--cpus', '2', '--memory', '3g', ...date, '-v', `${build}:/work`, '-w', '/work', COMPILE_IMAGE, 'timeout', '600', ...cmd], { maxBuffer: 1 << 26 }).then(r => `${r.stdout}${r.stderr}`, e => `${e?.stdout ?? ''}${e?.stderr ?? ''}`)
  const pdf = join(build, `${stem}.pdf`), log = join(build, `${stem}.log`)
  const out = {
    ok: req.draft ? true : existsSync(pdf),
    pdf: existsSync(pdf) && !req.draft ? new Uint8Array(readFileSync(pdf)) : null,
    log: existsSync(log) ? readFileSync(log, 'latin1') + (!req.rerun && !req.draft && engine === 'latex' ? `\n${DRIVER_OUTPUT_MARK}\n${said}` : '') : '',
  }
  if (req.files) {
    out.files = new Map()
    for (const p of filesUnder(build)) { const k = p.split(sep).join('/'), b = new Uint8Array(readFileSync(join(build, p))), had = files.get(k); if (!had || Buffer.compare(Buffer.from(had), Buffer.from(b)) !== 0) out.files.set(k, b) }
  }
  rmSync(build, { recursive: true, force: true })
  return out
}

await checkCompileImage()
const scratch = mkdtempSync(join(tmpdir(), 'axt-highlights-'))
try {
  const source = new Map([[MAIN, new Uint8Array(readFileSync(join(FIXTURE, MAIN)))]])
  // (the stand-in for arXiv's PDF: the source compiled as it is, on the pinned day)
  const stand = await compileIn(scratch, source, { main: MAIN, engine: 'pdflatex', sourceDate: EPOCH })
  if (!stand.pdf) throw new Error(`the stand-in did not compile:\n${stand.log.split('\n').filter(l => l.startsWith('!')).slice(0, 5).join('\n')}`)
  const open = bytes => getDocument({ data: bytes.slice(), ...DOC }).promise
  const arxiv = await open(stand.pdf)
  const paper = openPaper(source)
  const compile = req => {
    const files = new Map(source)
    for (const [p, b] of req.overrides ?? []) files.set(p, b)
    return compileIn(scratch, files, req)
  }
  const made = await markedOfPaper(paper, { compile, compileBudgetMs: null, engines: ['pdflatex'], pages: async () => arxiv.numPages, sourceDate: EPOCH, textOf: async pdf => textOfPdf(await open(pdf)) })
  if (made.refused || !(made.base?.pdf instanceof Uint8Array)) throw new Error(`the front half refused: ${made.refused ?? made.base?.why ?? 'no final pass'}`)
  const out = {
    'arxiv.pdf': Buffer.from(stand.pdf),
    'final.pdf': Buffer.from(made.base.pdf),
    'made.json': Buffer.from(`${JSON.stringify({ options: made.options ?? {}, log: made.log ?? '' })}\n`),
  }
  if (check) {
    const differ = Object.entries(out).filter(([f, b]) => { try { return Buffer.compare(readFileSync(join(FIXTURE, f)), b) !== 0 } catch { return true } }).map(([f]) => f)
    console.log(differ.length ? `they differ: ${differ.join(', ')}` : 'the same')
    process.exitCode = differ.length ? 1 : 0
  } else for (const [f, b] of Object.entries(out)) { writeFileSync(join(FIXTURE, f), b); console.log(`wrote ${f}: ${b.length} bytes`) }
} finally { rmSync(scratch, { recursive: true, force: true }) }
