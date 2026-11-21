// lab/pdf/spikes/figure-final.mjs
// Our final pass of a paper as the prepare makes it (layout/paper.mjs layoutMarksOfPaper: the mark probe, the layout-marked
// original, its final pass), made again under this engine's layout compile, for the figures' text gate (figure-gate.mjs) on
// papers whose bases were made before the layout compile set a TikZ picture's points (LAYOUT 21: marks.mjs POINTS_TEX `zs`,
// `ze`). Each paper's source (`--sources`, <dir>/<id>/source.gz) compiled in the pinned TeX Live (compile-image.mjs), no network,
// the guard told arXiv's page count (`<dir>/<id>/arxiv.pdf`); writes `<out>/<id>/base.pdf` (the final pass) and `base.json` (the
// marking's texts, as a fixture's), one line a paper on stdout. One docker job at a time.
//   pnpm exec tsx lab/pdf/spikes/figure-final.mjs --sources=<dir> --out=<dir> <id>…
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { layoutMarksOfPaper } from '../../../src/pdf-reader/engine/layout/paper.mjs'
import { openPaper } from '../../../src/pdf-reader/engine/pipeline/live.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/source/tar.mjs'
import { checkCompileImage, COMPILE_IMAGE, latexmkEngine, PLATFORM } from './compile-image.mjs'

const run = promisify(execFile)
const argOf = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const SOURCES = argOf('sources'), OUT = argOf('out')
const IDS = process.argv.slice(2).filter(a => !a.startsWith('--'))
if (!SOURCES || !OUT || !IDS.length) { console.error('usage: figure-final.mjs --sources=<dir> --out=<dir> <id>…'); process.exit(2) }
await checkCompileImage()
/** the lab's pinned date (2026-10-06) */
const EPOCH = 1791244800
const open = bytes => getDocument({ data: bytes.slice(), verbosity: 0, useSystemFonts: false })

for (const id of IDS) {
  const t0 = performance.now()
  try {
    const unpacked = await unpackSource(new Uint8Array(readFileSync(join(SOURCES, id, 'source.gz'))))
    if (!('files' in unpacked)) throw new Error('the source is a PDF')
    const paper = openPaper(unpacked.files)
    const files = unpacked.files instanceof Map ? unpacked.files : new Map(Object.entries(unpacked.files))
    const arxivPath = join(SOURCES, id, 'arxiv.pdf')
    let pages = null
    if (existsSync(arxivPath)) { const t = open(new Uint8Array(readFileSync(arxivPath))); pages = (await t.promise).numPages; await t.destroy() }
    const main = paper.project.main, stem = main.replace(/\.[^.]+$/, '')
    const compile = async (sources, { once = false, keep = false } = {}) => {
      const dir = mkdtempSync(join(tmpdir(), 'figure-final-'))
      try {
        for (const [path, bytes] of sources) { const f = join(dir, path); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, bytes) }
        const args = ['run', '--rm', '--init', '--pull', 'never', ...PLATFORM, '--network', 'none', '--cpus', '2', '--memory', '3g', '-e', 'FORCE_SOURCE_DATE=1', '-e', `SOURCE_DATE_EPOCH=${EPOCH}`, '-v', `${dir}:/work`, '-w', '/work', COMPILE_IMAGE, 'timeout', '600', 'latexmk', ...latexmkEngine(paper.meta.compiler), ...(once ? ['-e', '$max_repeat=1'] : []), ...(paper.meta.bbl ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-f', main]
        await run('docker', args, { maxBuffer: 1 << 26 }).catch(() => {})
        const pdf = join(dir, `${stem}.pdf`), log = join(dir, `${stem}.log`)
        const left = keep ? new Map(readdirSync(dir, { recursive: true }).filter(p => statSync(join(dir, p)).isFile()).map(p => [String(p), new Uint8Array(readFileSync(join(dir, p)))])) : null
        return existsSync(log) ? { ok: existsSync(pdf), pdf: existsSync(pdf) ? new Uint8Array(readFileSync(pdf)) : null, log: readFileSync(log, 'latin1'), ...(left ? { files: left } : {}) } : { ok: false, error: 'no log' }
      } finally { rmSync(dir, { recursive: true, force: true }) }
    }
    const made = await layoutMarksOfPaper(paper, {
      compile: req => compile(new Map([...files, ...req.overrides]), { once: !req.rerun, keep: !!req.files }),
      open: async bytes => { const task = open(bytes); return { doc: await task.promise, close: () => task.destroy() } },
      OPS, pages,
    })
    if (!('marks' in made)) throw new Error(`the layout marks were refused at the ${made.refused}`)
    if (!made.base?.pdf) throw new Error(`no final pass: ${made.base?.refused ?? 'none'} ${made.base?.why ?? ''}`)
    mkdirSync(join(OUT, id), { recursive: true })
    writeFileSync(join(OUT, id, 'base.pdf'), made.base.pdf)
    writeFileSync(join(OUT, id, 'base.json'), JSON.stringify({ texts: made.marks?.marking?.texts ?? null }))
    console.log(JSON.stringify({ id, bytes: made.base.pdf.length, ms: Math.round(performance.now() - t0) }))
  } catch (e) { console.log(JSON.stringify({ id, failed: String(e?.message ?? e).slice(0, 300), ms: Math.round(performance.now() - t0) })) }
}
