// experiments/pdf-bilingual/spikes/tex-path-cases.mjs
// The TeX path's failures the layer lab's finals met when compiled as BusyTeX compiles (halting on the first error; the
// lab's report of 2026-10-06, concern 1), each as a small document through the reader's own translationFiles, compiled
// natively in Docker with -halt-on-error. Each case with the fix and without it: the fix sets the document, and without
// it TeX stops, or loses letters, where the lab's finals did. Exits non-zero on a failure.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/tex-path-cases.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { openPaper, translationFiles } from '../../../src/pdf-reader/engine/live.mjs'
import { strategiesFor } from '../../../src/pdf-reader/engine/scripts.mjs'

const dir = mkdtempSync(join(tmpdir(), 'tex-path-cases-'))
let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }
const enc = s => new TextEncoder().encode(s)
/**
 * A document (`files`: path → text, main.tex the main file) through translationFiles under `strategy`, with what
 * `translate(paper)` gives (unit → pieces), `undo(paper)` first where the case is compiled without its fix; compiled
 * once by the strategy's engine halting on the first error, no font made on the way (faithful.mjs) → { ok: TeX's exit
 * status, log, error: its first }
 */
function compile(name, files, strategy, { translate = () => new Map(), undo = null, alter = null } = {}) {
  const paper = openPaper(new Map(Object.entries(files).map(([p, t]) => [p, enc(t)])))
  undo?.(paper)
  const out = new Map([...paper.fsys.list().map(p => [p, paper.fsys.read(p)]), ...translationFiles(paper, translate(paper), { strategy, fonts: null, draft: false })])
  const at = join(dir, name)
  mkdirSync(at, { recursive: true })
  for (const [p, b] of out) { mkdirSync(dirname(join(at, p)), { recursive: true }); writeFileSync(join(at, p), alter && p === 'main.tex' ? alter(new TextDecoder('latin1').decode(b)) : b) }
  let ok = true
  try { execFileSync('docker', ['run', '--rm', '--network', 'none', '-e', 'MKTEXTFM=0', '-e', 'MKTEXPK=0', '-e', 'MKTEXMF=0', '-v', `${at}:/work`, '-w', '/work', 'texlive/texlive:latest', strategy.engine, '-interaction=nonstopmode', '-halt-on-error', 'main.tex'], { stdio: 'ignore' }) } catch { ok = false }
  const log = existsSync(join(at, 'main.log')) ? readFileSync(join(at, 'main.log'), 'latin1') : ''
  rmSync(at, { recursive: true, force: true })
  return { ok, log, error: log.match(/^! .*$/m)?.[0] ?? '' }
}
const doc = (body, preamble = '') => `\\documentclass{article}\n${preamble}\\begin{document}\n${body}\n\\end{document}\n`

// R: a cell's row commands, which an engine moved after the cell's words (1512.03385 into es: "Nombre de la capa @a#",
// the row's \hline; 1810.04805 into es and fr, \toprule): written where the row has them, TeX sets the table; as the
// engine sent them, "Misplaced \noalign"
{
  const R = { 'main.tex': doc('\\begin{tabular}{ll}\n\\toprule\nlayer name & output size \\\\\n\\midrule\nconv1 & 112 \\\\\n\\bottomrule\n\\end{tabular}', '\\usepackage{booktabs}\n') }
  const [es] = strategiesFor({ compiler: 'pdflatex' }, 'es')
  /** each cell translated as the engine sent it back: its words first, then every placeholder */
  const translate = paper => new Map(paper.units.filter(u => u.kind === 'cell').map(u => [u, [{ t: 'text', tr: true, s: `${u.pieces.filter(p => p.t === 'text').map(p => p.s.trim()).join(' ')} ` }, ...u.pieces.filter(p => p.t === 'ph')]]))
  const fixed = compile('r-fixed', R, es, { translate }), bare = compile('r-bare', R, es, { translate, undo: paper => { for (const u of paper.units) { delete u.rowLead; delete u.rowTrail } } })
  check('R: a cell whose rule the engine moved after its words sets, the rule first again', fixed.ok, fixed.error)
  check('R: as the engine sent it, the rule after the words: "Misplaced \\noalign" (as the finals stopped)', !bare.ok && /Misplaced \\noalign/.test(bare.log), bare.error)
}

rmSync(dir, { recursive: true, force: true })
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
