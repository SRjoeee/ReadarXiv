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

// P: an image sized in pdfTeX's px (1810.04805: \includegraphics[width=360px]), its pdfLaTeX paper set by XeLaTeX for a
// CJK target: given in bp, its value, the image sets; as the source has it, "Illegal unit of measure"
{
  const P = { 'main.tex': doc('An image \\includegraphics[width=36px]{example-image} and another \\includegraphics[height=0.1\\textwidth]{example-image}.\\setbox0\\hbox{\\includegraphics[width=36px]{example-image}}\\typeout{AXT-WIDTH=\\the\\wd0}', '\\usepackage{graphicx}\n') }
  const [xe] = strategiesFor({ compiler: 'pdflatex' }, 'zh')
  const fixed = compile('p-fixed', P, xe), bare = compile('p-bare', P, xe, { alter: tex => tex.replace(/\\makeatletter\\def\\axt@px[^\n]*\\makeatother\n/, '') })
  check('P: an image sized in px sets under XeLaTeX, 36px as wide as pdfTeX sets it (36 bp, 36.135 pt)', fixed.ok && /AXT-WIDTH=36\.135pt/.test(fixed.log), fixed.error || (fixed.log.match(/AXT-WIDTH=.*$/m)?.[0] ?? 'no width'))
  check('P: without it, XeTeX has no unit px: "Illegal unit of measure" (as the CJK finals failed)', !bare.ok && /Illegal unit of measure/.test(bare.log), bare.error)
}

// U: a translated heading a class uppercases (2307.16209's abntex2, its running heads; here book's), set under CJKutf8:
// with each CJK byte protected the case changers pass it by; as CJK defines them, "Extra \else"
{
  const U = { 'main.tex': '\\documentclass{book}\n\\begin{document}\n\\chapter{Results of the study}\nWords of the chapter.\\newpage\nMore words of it.\\newpage\nAnd more.\n\\end{document}\n' }
  const [, cjkutf8] = strategiesFor({ compiler: 'pdflatex' }, 'zh')
  const translate = paper => new Map(paper.units.filter(u => u.kind === 'heading').map(u => [u, [{ t: 'text', tr: true, s: '研究结果' }]]))
  const fixed = compile('u-fixed', U, cjkutf8, { translate }), bare = compile('u-bare', U, cjkutf8, { translate, alter: tex => tex.replace('\\axtcjkprotect}', '}') })
  check('U: a translated chapter title in book\'s uppercased running heads sets under CJKutf8', fixed.ok && !/Missing character/.test(fixed.log), fixed.error)
  // what TeX stops at depends on the characters: the thesis's "Extra \\else", here an encoding's missing command
  check('U: without the bytes protected, \\MakeUppercase expands them and TeX stops', !bare.ok && /^! /m.test(bare.log), bare.error || 'it set')
}

// S: a paper that loads siunitx, its locale Chinese (2307.16209 into zh under XeLaTeX): siunitx 3.6.2 opens
// babel-Hans-.ini; with a file that is not there passed over, the document sets. Without, it stops — under 3.6.2 alone
{
  const S = { 'main.tex': doc('A number, \\num{1.5}, in a paragraph.', '\\usepackage{siunitx}\n') }
  const [xe] = strategiesFor({ compiler: 'pdflatex' }, 'zh')
  const fixed = compile('s-fixed', S, xe), bare = compile('s-bare', S, xe, { alter: tex => tex.replace(/\\ExplSyntaxOn\n\\cs_if_exist:NT \\__siunitx_locale_setup:n[\s\S]*?\\ExplSyntaxOff\n/, '') })
  const version = fixed.log.match(/^Package: siunitx \S+ (v[\d.]+)/m)?.[1] ?? '?'
  check(`S: siunitx (${version}) with the target's locale Chinese sets`, fixed.ok, fixed.error)
  if (version === 'v3.6.2') check('S: without it, siunitx 3.6.2 stops at "File \'babel-Hans-.ini\' not found" (as the thesis did)', !bare.ok && /babel-Hans-\.ini' not found/.test(bare.log), bare.error)
  else console.log(`skip S without the fix: siunitx ${version} is not 3.6.2, the version with the misnamed file`)
}

rmSync(dir, { recursive: true, force: true })
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
