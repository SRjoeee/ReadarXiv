// The figures' text fixture (tests/fixtures/pdf/figures/; docs/route/orphan-text.md stage 5, the content class `figures`): one
// page of vector figures in each shape the engine cuts into figure units, compiled as our final pass compiles a paper's — the
// layout compile's points (layout/marks.mjs POINTS_TEX, a TikZ picture's `zs` and `ze` among them) before \documentclass — in
// the pinned TeX Live (lab/pdf/spikes/compile-image.mjs), with the date pinned, so that the same sources give the same bytes:
//   - `inc-codes.pdf`: written here, an included figure whose Type 3 font names its glyphs by codes (`/g41`) and carries no
//     /ToUnicode: its text is no character a reader can trust (remove.mjs unicodeOf), and stays the original's;
//   - `inc-tounicode.pdf`: inc-tounicode.tex compiled, an included figure whose fonts carry a /ToUnicode;
//   - `figures.pdf`: figures.tex compiled over the points, including both.
//   pnpm exec tsx scripts/make-figure-fixture.mjs            # writes the three PDFs
//   pnpm exec tsx scripts/make-figure-fixture.mjs --check    # makes them again in a scratch folder; exits 1 where they differ
// Nothing here is an arXiv paper's: the sources and the PDFs are ours, CC0. No request leaves this machine; the image is never pulled.
import { execFile } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { POINTS_TEX } from '../src/pdf-reader/engine/layout/marks.mjs'
import { checkCompileImage, COMPILE_IMAGE, PLATFORM } from '../lab/pdf/spikes/compile-image.mjs'

const run = promisify(execFile)
const FIXTURE = fileURLToPath(new URL('../tests/fixtures/pdf/figures/', import.meta.url))
/** the date every compile is pinned at (2026-10-25, UTC midnight) */
const EPOCH = '1792886400'
const check = process.argv.includes('--check')

/** a figure of one Type 3 font whose glyphs are named by codes, /g41 to /g44, with no /ToUnicode, showing them as one word */
function codesPdf() {
  const glyph = w => `${w} 0 40 0 ${w - 40} 700 d1 40 0 ${w - 80} 700 re f`
  const procs = ['g41', 'g42', 'g43', 'g44'].map((n, i) => [n, glyph(420 + 40 * i)])
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 160 60] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    null, // the content stream
    `<< /Type /Font /Subtype /Type3 /FontBBox [0 0 600 700] /FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << ${procs.map(([n], i) => `/${n} ${6 + i} 0 R`).join(' ')} >> /Encoding << /Type /Encoding /Differences [65 ${procs.map(([n]) => `/${n}`).join(' ')}] >> /FirstChar 65 /LastChar 68 /Widths [${procs.map((_, i) => 420 + 40 * i).join(' ')}] >>`,
  ]
  const content = 'q 0 0 0 rg BT /F1 24 Tf 12 20 Td (ABCD) Tj ET Q 0.5 w 2 2 156 56 re S'
  const streams = new Map([[4, content], ...procs.map(([, s], i) => [6 + i, s])])
  let out = '%PDF-1.4\n'
  const at = []
  const count = 5 + procs.length
  for (let n = 1; n <= count; n++) {
    at[n] = out.length
    const s = streams.get(n)
    out += s !== undefined ? `${n} 0 obj\n<< /Length ${s.length} >>\nstream\n${s}\nendstream\nendobj\n` : `${n} 0 obj\n${objects[n - 1]}\nendobj\n`
  }
  const xref = out.length
  out += `xref\n0 ${count + 1}\n0000000000 65535 f \n${at.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${count + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

/** `main` (a .tex in `dir`) compiled by pdflatex in the pinned image, twice (the axis' labels need no aux, the second pass is the
 *  same bytes), no network */
async function compile(dir, main) {
  const args = ['run', '--rm', '--init', '--pull', 'never', ...PLATFORM, '--network', 'none', '--cpus', '2', '--memory', '3g', '-e', 'FORCE_SOURCE_DATE=1', '-e', `SOURCE_DATE_EPOCH=${EPOCH}`, '-v', `${dir}:/work`, '-w', '/work', COMPILE_IMAGE, 'timeout', '300', 'pdflatex', '-interaction=nonstopmode', '-halt-on-error', main]
  try { await run('docker', args, { maxBuffer: 64 * 2 ** 20 }) } catch (e) {
    throw new Error(`pdflatex ${main}: ${String(e.stdout ?? e.message).split('\n').filter(l => l.startsWith('!')).slice(0, 3).join(' | ') || e.message}`)
  }
}

await checkCompileImage()
const dir = mkdtempSync(join(tmpdir(), 'axt-figures-'))
try {
  writeFileSync(join(dir, 'inc-codes.pdf'), codesPdf())
  copyFileSync(join(FIXTURE, 'inc-tounicode.tex'), join(dir, 'inc-tounicode.tex'))
  await compile(dir, 'inc-tounicode.tex')
  // (the main file as the layout compile sets it: the points first, then the paper)
  writeFileSync(join(dir, 'main.tex'), `\\makeatletter${POINTS_TEX}\\makeatother\n${readFileSync(join(FIXTURE, 'figures.tex'), 'utf8')}`)
  await compile(dir, 'main.tex')
  const made = { 'inc-codes.pdf': readFileSync(join(dir, 'inc-codes.pdf')), 'inc-tounicode.pdf': readFileSync(join(dir, 'inc-tounicode.pdf')), 'figures.pdf': readFileSync(join(dir, 'main.pdf')) }
  if (check) {
    const differ = Object.entries(made).filter(([f, b]) => { try { return Buffer.compare(readFileSync(join(FIXTURE, f)), b) !== 0 } catch { return true } }).map(([f]) => f)
    console.log(differ.length ? `they differ: ${differ.join(', ')}` : 'the same')
    process.exitCode = differ.length ? 1 : 0
  } else for (const [f, b] of Object.entries(made)) { writeFileSync(join(FIXTURE, f), b); console.log(`wrote ${f}: ${b.length} bytes`) }
} finally { rmSync(dir, { recursive: true, force: true }) }
