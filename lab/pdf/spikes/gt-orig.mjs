// The original source compiled natively with every unit's start and end marked as a PDF destination: the ground truth
// for the reader's text anchoring on the original side. The source is otherwise untouched.
// PLAIN=1: the same patched source without marks, into gt-plain (the fair baseline for "marks move nothing": same
// day, same TeX tree, same patch)
//   node spikes/gt-orig.mjs id ...
import { execFile } from 'node:child_process'
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { promisify } from 'node:util'
import { FONT_PROBE, loadProject, MARK_DEF, markUnits, patch, readFontProbe } from './latex-front.mjs'
import { analyze } from './paper-meta.mjs'
const run = promisify(execFile)
const root = new URL('..', import.meta.url).pathname
const IMAGE = /\.(png|jpe?g|pdf|eps|gif|bmp|tiff?)$/i
const walk = d => readdirSync(d).flatMap(n => { const f = join(d, n); return statSync(f).isDirectory() ? walk(f) : [f] })
const PLAIN = !!process.env.PLAIN
const FLAG = { pdflatex: '-pdf', xelatex: '-xelatex', lualatex: '-lualatex' }
for (const id of process.argv.slice(2)) {
  const src = join(root, 'data/corpus', id, 'src'), meta = analyze(src)
  if (!FLAG[meta.compiler]) { console.log(id, 'skipped: compiler', meta.compiler); continue }
  // table cells are units too (C1: no cost in compile rate); TABLES=0 for the prose-only runs of before
  const project = loadProject(src, meta.main, { tables: process.env.TABLES !== '0' })
  const work = join(root, PLAIN ? 'data/runs/gt-plain' : 'data/runs/gt-orig', id)
  rmSync(work, { recursive: true, force: true })
  for (const f of walk(src)) { const to = join(work, relative(src, f)); mkdirSync(dirname(to), { recursive: true }); if (IMAGE.test(f)) linkSync(f, to); else writeFileSync(to, readFileSync(f)) }
  for (const [rel, bytes] of patch(project, new Map(), PLAIN ? {} : { mark: markUnits(project.units) })) writeFileSync(join(work, rel), bytes)
  const mainPath = join(work, project.main)
  if (!PLAIN) {
    // the marks' definition first; the font probe before \begin{document} (it only writes to the log)
    let text = readFileSync(mainPath, 'latin1')
    const at = text.search(/\\begin\s*\{document\}/)
    if (at >= 0) text = text.slice(0, at) + FONT_PROBE + text.slice(at)
    writeFileSync(mainPath, Buffer.concat([Buffer.from(MARK_DEF), Buffer.from(text, 'latin1')]))
  }
  const t0 = Date.now()
  try { await run('docker', ['run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', '-v', `${work}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '300', 'latexmk', FLAG[meta.compiler], ...(meta.bbl ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-file-line-error', '-f', meta.main], { maxBuffer: 1 << 26 }) } catch {}
  const stem = meta.main.split('/').pop().replace(/\.[^.]+$/, '')
  const log = readFileSync(join(work, `${stem}.log`), 'latin1'), ref = readFileSync(join(root, 'data/runs/native', id, `${stem}.log`), 'latin1')
  const errs = l => (l.match(/^(?:\S+:\d+: |! )/gm) ?? []).length
  if (!PLAIN) { const fonts = readFontProbe(log); const file = join(root, 'out/fonts.json'); const all = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}; all[id] = fonts; writeFileSync(file, JSON.stringify(all, null, 1)) }
  console.log(id, meta.compiler, `${Math.round((Date.now() - t0) / 1000)}s`, 'new errors', errs(log) - errs(ref), 'dup marks', (log.match(/destination with the same identifier \(name\{axt-/g) ?? []).length)
}
