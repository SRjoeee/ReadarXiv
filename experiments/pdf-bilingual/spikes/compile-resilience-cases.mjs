// experiments/pdf-bilingual/spikes/compile-resilience-cases.mjs
// The compile's safety net under TeX (plans/2026-10-04-compile-resilience.md; src/pdf-reader/engine/tex-errors.mjs and
// live.mjs runLive's remedies): small synthetic documents through the reader's own translationFiles, compiled natively
// in Docker — halting on the first error as BusyTeX does, and in nonstop mode with latexmk -f as the gates' native
// compiler does —, each checking that TeX's log places a failure in the unit it stands in, and nowhere else.
// typeset-busytex-cases.mjs runs the same documents under the reader's own BusyTeX. Exits non-zero on a failure.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/compile-resilience-cases.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { citationLines, openPaper, translationFiles } from '../../../src/pdf-reader/engine/live.mjs'
import { strategiesFor } from '../../../src/pdf-reader/engine/scripts.mjs'
import { texErrors, unitsAtErrors } from '../../../src/pdf-reader/engine/tex-errors.mjs'

const dir = mkdtempSync(join(tmpdir(), 'compile-resilience-cases-'))
let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }
const enc = s => new TextEncoder().encode(s)
const ZH = '\u8bba\u6587'

/** files into a fresh directory, compiled: `halt` one pass of `engine` halting on the first error, else latexmk -f in
 *  nonstop mode; \u2192 its log, read as a native log is (Latin-1) */
function compile(name, files, { engine, main = 'main.tex', halt }) {
  const at = join(dir, name)
  for (const [p, b] of files) { const f = join(at, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
  const cmd = halt ? [engine, '-interaction=nonstopmode', '-halt-on-error', main] : ['latexmk', engine === 'xelatex' ? '-xelatex' : '-pdf', '-interaction=nonstopmode', '-f', main]
  try { execFileSync('docker', ['run', '--rm', '--init', '--network', 'none', '-v', `${at}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '300', ...cmd], { stdio: 'ignore' }) } catch {}
  const log = join(at, main.replace(/\.tex$/, '.log'))
  return existsSync(log) ? readFileSync(log, 'latin1') : ''
}
/** a paper, every unit translated into "Chinese" (its words each ZH), and the translation's text of unit `bad` put
 *  through `breaking` raw — what a translation that reached TeX unescaped would be */
function translated(files, breaking, bad) {
  const paper = openPaper(new Map([...files].map(([p, t]) => [p, enc(t)])))
  const tr = new Map(paper.units.map((u, i) => [u, u.pieces.map(p => (p.t === 'text' ? { ...p, tr: true, s: i === bad ? breaking(p.s.replace(/[A-Za-z]{2,}/g, ZH)) : p.s.replace(/[A-Za-z]{2,}/g, ZH) } : p))]))
  return { paper, tr }
}
const PARAS = n => Array.from({ length: n }, (_, k) => `Paragraph ${k} of the paper runs on, with words that make a line of prose.`).join('\n\n')

// 1. a unit whose translation breaks TeX — an undefined command glued to a subscript (\foo_bar) — under xeCJK: the log,
// halting or nonstop, places the failure in that unit alone, in the main file and in a file it \inputs, read as
// Latin-1 (a native log) and as UTF-8 (BusyTeX's)
for (const [where, files, bad] of [
  ['the main file', new Map([['main.tex', `\\documentclass{article}\n\\begin{document}\n${PARAS(6)}\n\\end{document}\n`]]), 3],
  ['a file it \\inputs', new Map([['main.tex', `\\documentclass{article}\n\\begin{document}\n${PARAS(3)}\n\n\\input{sections/b}\n\\end{document}\n`], ['sections/b.tex', `${PARAS(5)}\n`]]), 5],
]) {
  const { paper, tr } = translated(files, s => s.replace(/,/, ' \\foo_bar,'), bad)
  const [xe] = strategiesFor(paper.meta, 'zh'), spans = {}
  const out = translationFiles(paper, tr, { strategy: xe, fonts: null, draft: true, aux: null, bbl: null, spans })
  for (const halt of [true, false]) {
    const log = compile(`unit-${where.length}-${halt}`, new Map([...[...files].map(([p, t]) => [p, enc(t)]), ...out]), { engine: 'xelatex', halt })
    const errors = texErrors(log), utf8 = texErrors(new TextDecoder().decode(Buffer.from(log, 'latin1')))
    const placed = unitsAtErrors(errors, out, spans.lines()).map(u => paper.units.indexOf(u)), placed8 = unitsAtErrors(utf8, out, spans.lines()).map(u => paper.units.indexOf(u))
    check(`${halt ? 'halting' : 'nonstop'}, ${where}: the failure placed in unit ${bad} alone (${errors.length} error${errors.length === 1 ? '' : 's'})`, errors.length > 0 && JSON.stringify(placed) === JSON.stringify([bad]) && JSON.stringify(placed8) === JSON.stringify([bad]), JSON.stringify({ placed, placed8, errors: errors.slice(0, 3) }))
  }
}

// 2. a letter lost with no TeX error: the run's diagnosis, \tracinglostchars=3 before the first line, makes it an error at
// its place — XeTeX's lost CJK letter in a Latin face, pdfTeX's lost 8-bit code in cmr10 — and the line numbers stay
{
  // XeTeX, a German translation set in the paper's Latin Modern: unit 2 holds a letter none of its faces has
  const files = new Map([['main.tex', `\\documentclass{article}\n\\begin{document}\n${PARAS(4)}\n\\end{document}\n`]])
  const { paper, tr } = translated(files, s => s.replace(/,/, ' \u3067,'), 2)
  const [, xeLatin] = strategiesFor(paper.meta, 'de'), spans = {}
  for (const [k, pieces] of tr) tr.set(k, pieces.map(p => (p.t === 'text' ? { ...p, s: p.s.replaceAll(ZH, 'W\u00f6rter') } : p)))
  const out = translationFiles(paper, tr, { strategy: xeLatin, fonts: null, draft: true, aux: null, bbl: null, spans })
  const plain = compile('lost-xe-plain', out, { engine: 'xelatex', halt: true })
  check('XeTeX: the letter lost is no error as the paper is set (the reader sees it only as a lost letter)', /^Missing character: There is no \u00e3\u0081\u00a7/m.test(plain) && texErrors(plain).length === 0, JSON.stringify(texErrors(plain)))
  const tracked = new Map(out)
  tracked.set('main.tex', new Uint8Array([...enc('\\AtBeginDocument{\\tracinglostchars=3\\relax}'), ...out.get('main.tex')]))
  for (const halt of [true, false]) {
    const log = compile(`lost-xe-${halt}`, tracked, { engine: 'xelatex', halt })
    const errors = texErrors(log).filter(e => /^Missing character/.test(e.message))
    const placed = unitsAtErrors(errors, out, spans.lines()).map(u => paper.units.indexOf(u))
    check(`XeTeX, ${halt ? 'halting' : 'nonstop'}: with \\tracinglostchars=3 the lost letter is an error at its line, U+3067, in unit 2`, errors.length > 0 && errors[0].char === 0x3067 && JSON.stringify(placed) === '[2]', JSON.stringify({ errors: errors.slice(0, 2), placed }))
  }
}
{
  // pdfTeX: a code cmr10 has no glyph for, written raw in unit 1's translation (\char200)
  const files = new Map([['main.tex', `\\documentclass{article}\n\\begin{document}\n${PARAS(3)}\n\\end{document}\n`]])
  const { paper, tr } = translated(files, s => s.replace(/,/, ' \\char200,'), 1)
  const [own] = strategiesFor(paper.meta, 'de'), spans = {}
  for (const [k, pieces] of tr) tr.set(k, pieces.map(p => (p.t === 'text' ? { ...p, s: p.s.replaceAll(ZH, 'Worte') } : p)))
  const out = translationFiles(paper, tr, { strategy: own, fonts: null, draft: true, aux: null, bbl: null, spans })
  const tracked = new Map(out)
  tracked.set('main.tex', new Uint8Array([...enc('\\AtBeginDocument{\\tracinglostchars=3\\relax}'), ...out.get('main.tex')]))
  const log = compile('lost-pdf', tracked, { engine: 'pdflatex', halt: true })
  const errors = texErrors(log).filter(e => /^Missing character/.test(e.message))
  const placed = unitsAtErrors(errors, out, spans.lines()).map(u => paper.units.indexOf(u))
  check('pdfTeX, halting: with \\tracinglostchars=3 the lost code is an error at its line, in unit 1', errors.length === 1 && JSON.stringify(placed) === '[1]', JSON.stringify({ errors, placed }))
}

// 3. the references a draft is given (fix 1): apacite loaded before babel, as 2610.02069's class and preamble have them.
// apacite writes each entry twice to the aux, \bibcite then \APACbibcite; babel's \bibcite keeps it wrapped, and only
// the second line makes it whole again. Given the original's \bibcite lines alone, a one-pass draft breaks at every
// citation, as every draft of 2610.02069 did; given its citation lines (citationLines), it sets them
{
  const BIB = '@article{alpha, author={Author, A. and Writer, B.}, title={A first title}, journal={J}, year={2001}}\n@article{beta, author={Someone, C.}, title={A second title}, journal={J}, year={2020}}\n'
  const SRC = '\\documentclass{article}\n\\usepackage{apacite}\\usepackage[english]{babel}\n\\begin{document}\nA stream \\cite{alpha} alters, as \\citeA{beta} found.\n\\bibliographystyle{apacite}\n\\bibliography{refs}\n\\end{document}\n'
  const files = new Map([['main.tex', enc(SRC)], ['refs.bib', enc(BIB)]])
  compile('apa-original', files, { engine: 'pdflatex', halt: false })
  const at = join(dir, 'apa-original'), aux = readFileSync(join(at, 'main.aux'), 'latin1'), bbl = readFileSync(join(at, 'main.bbl'))
  const only = aux.split('\n').filter(l => l.startsWith('\\bibcite{')).join('\n'), lines = citationLines(aux)
  check('the original\'s aux holds apacite\'s two lines for each entry, and citationLines gives both, in order', /\\APACbibcite\{alpha\}/.test(lines) && lines.indexOf('\\bibcite{alpha}') < lines.indexOf('\\APACbibcite{alpha}'), lines)
  for (const engine of ['pdflatex', 'xelatex']) {
    const draft = given => compile(`apa-${engine}-${given === lines ? 'lines' : 'bibcite'}`, new Map([...files, ['main.aux', enc(`\\relax\n${given}\n`)], ['main.bbl', bbl]]), { engine, halt: true })
    const broken = draft(only), whole = draft(lines)
    check(`${engine}, halting: a draft given the \\bibcite lines alone breaks at its citations (the fault, documented)`, /^! Illegal parameter number in definition of \\B@my@dummy/m.test(broken), broken.match(/^! .*$/m)?.[0] ?? 'no error')
    check(`${engine}, halting: a draft given citationLines sets every citation, no error`, !/^! /m.test(whole) && /Output written on main\.(pdf|xdv)/.test(whole), whole.match(/^! .*$/m)?.[0] ?? 'no output')
  }
}

console.log(failed ? `${failed} failed (${dir})` : `all passed (${dir})`)
process.exit(failed ? 1 : 0)
