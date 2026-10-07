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
import { hostedFontsDockerArgs } from './faithful.mjs'
// the faces the TeX page's tree serves beside TeX Live's (Source Han Serif, URW's base 35: faithful.mjs)
const HOSTED = hostedFontsDockerArgs(new URL('../data/fonts', import.meta.url).pathname)

const dir = mkdtempSync(join(tmpdir(), 'compile-resilience-cases-'))
let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }
const enc = s => new TextEncoder().encode(s)
const ZH = '\u8bba\u6587'

/** files into a fresh directory, compiled: `halt` one pass of `engine` halting on the first error, else latexmk -f in
 *  nonstop mode; → its log, read as a native log is (Latin-1) */
function compile(name, files, { engine, main = 'main.tex', halt }) {
  const at = join(dir, name)
  for (const [p, b] of files) { const f = join(at, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
  const cmd = halt ? [engine, '-interaction=nonstopmode', '-halt-on-error', main] : ['latexmk', engine === 'xelatex' ? '-xelatex' : '-pdf', '-interaction=nonstopmode', '-f', main]
  try { execFileSync('docker', ['run', '--rm', '--init', '--network', 'none', ...HOSTED, '-v', `${at}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '300', ...cmd], { stdio: 'ignore' }) } catch {}
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

// 1b. a footnote's own words that break TeX are the footnote's, not its paragraph's, and the paragraph's own words its
// own: the nested unit's span inside its paragraph's, the innermost unit whose bytes hold the error's context. The
// numbers keep ASCII around the place under a CJK translation, which the context is compared by (tex-errors.mjs skeleton)
{
  const src = `\\documentclass{article}\n\\begin{document}\n${PARAS(2)}\n\nA paragraph 1234567890123, with a note\\footnote{The note 2345678901234, says 3456789012345 and more.} and words 9876543210 after it.\n\n${PARAS(1)}\n\\end{document}\n`
  const files = new Map([['main.tex', src]])
  const units = openPaper(new Map([['main.tex', enc(src)]])).units
  const note = units.findIndex(u => u.nested), para = units.findIndex(u => u.pieces.some(p => p.t === 'nested'))
  for (const [what, bad] of [['a footnote', note], ['its paragraph', para]]) {
    const { paper, tr } = translated(files, s => s.replace(/,/, ' \\foo_bar,'), bad)
    const [xe] = strategiesFor(paper.meta, 'zh'), spans = {}
    const out = translationFiles(paper, tr, { strategy: xe, fonts: null, draft: true, aux: null, bbl: null, spans })
    for (const halt of [true, false]) {
      const log = compile(`nested-${bad}-${halt}`, new Map([...[...files].map(([p, t]) => [p, enc(t)]), ...out]), { engine: 'xelatex', halt })
      const errors = texErrors(log), placed = unitsAtErrors(errors, out, spans.lines()).map(u => paper.units.indexOf(u))
      check(`${halt ? 'halting' : 'nonstop'}, ${what}'s own words: the failure placed in unit ${bad} alone (${errors.length} error${errors.length === 1 ? '' : 's'})`, errors.length > 0 && JSON.stringify(placed) === JSON.stringify([bad]), JSON.stringify({ placed, note, para, errors: errors.slice(0, 3) }))
    }
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

// 4. a citation is one placeholder (fault B): apacite's \cite<>[…]{key}, 2610.02069's Open Research sentence as it
// stands, keeps its key whole in a translation, which sets with no error, halting, under both of Chinese's strategies.
// And the fault the browser spikes break a unit with now (reader-in-source.mjs, reader-partial.mjs): a command of the
// paper's own whose argument in angle brackets the walker does not read (xparse's d<>), its key sent as prose — the
// translation halts in that unit alone, as 2610.02069's did before
{
  const BIB = '@misc{modified_code, author={Author, A.}, title={The code}, year={2026}}\n@article{key_one, author={One, A. and Two, B.}, title={An earlier work}, journal={J}, year={2001}}\n'
  const OPEN = 'The code to reproduce the work in this paper is archived in a public repository \\cite<>[available at \\url{https://doi.org/10.5281/zenodo.21144536}]{modified_code}.'
  const OWN = 'The last paragraph compares the result with earlier work \\compare<e.g.,>{key_one} and finds it holds.'
  const doc = last => `\\documentclass{article}\n\\usepackage{apacite}\\usepackage{url}\n\\NewDocumentCommand{\\compare}{d<>m}{\\IfValueT{#1}{#1~}\\cite{#2}}\n\\begin{document}\n${PARAS(2)}\n\n${last}\n\n${PARAS(1)}\n\\nocite{modified_code,key_one}\n\\bibliographystyle{apacite}\n\\bibliography{refs}\n\\end{document}\n`
  for (const [what, last, breaks] of [['apacite\'s \\cite<>[…]{modified_code}', OPEN, false], ['a command of the paper\'s own with an angle argument (the browser spikes\' fault)', OWN, true]]) {
    const files = new Map([['main.tex', doc(last)], ['refs.bib', BIB]])
    const name = breaks ? 'own' : 'open'
    const original = compile(`cite-${name}-original`, new Map([...files].map(([p, t]) => [p, enc(t)])), { engine: 'pdflatex', halt: false })
    const at = join(dir, `cite-${name}-original`), aux = readFileSync(join(at, 'main.aux'), 'latin1'), bbl = readFileSync(join(at, 'main.bbl'), 'utf8')
    check(`${what}: the original sets with no error`, !/^! /m.test(original), original.match(/^! .*$/m)?.[0] ?? '')
    const { paper, tr } = translated(files, s => s, -1)
    const bad = paper.units.findIndex(u => /compare|repository/.test(JSON.stringify(u.pieces)))
    for (const strategy of strategiesFor(paper.meta, 'zh')) {
      const spans = {}, out = translationFiles(paper, tr, { strategy, fonts: null, draft: true, aux: citationLines(aux), bbl, spans })
      const log = compile(`cite-${name}-${strategy.engine}`, new Map([...[...files].map(([p, t]) => [p, enc(t)]), ...out]), { engine: strategy.engine, halt: true })
      const errors = texErrors(log), placed = unitsAtErrors(errors, out, spans.lines()).map(u => paper.units.indexOf(u))
      if (breaks) check(`${what}, ${strategy.name}, halting: the failure placed in its unit alone`, errors.length > 0 && JSON.stringify(placed) === JSON.stringify([bad]), JSON.stringify({ placed, bad, errors: errors.slice(0, 2) }))
      else check(`${what}, ${strategy.name}, halting: the translation sets with no error, the call as written`, !/^! /m.test(log) && /Output written on main\.(pdf|xdv)/.test(log) && new TextDecoder().decode(out.get('main.tex')).includes(OPEN.slice(OPEN.indexOf('\\cite'), -1)), log.match(/^! .*$/m)?.[0] ?? 'no output')
    }
  }
}

// 5. an accent inside a word is its letter in the translation (latex-front.mjs accentLetter): a translation whose
// words keep the letters — the units' text, read as the engine reads it (UTF-8), with its ASCII words replaced by the
// target's and the letters left as they are — sets every one of them, halting, with no letter lost, under Chinese's two
// strategies, German's two and Russian's two (T2A under pdfLaTeX, CMU under XeLaTeX), in the paper's Computer Modern
// (OT1) and under T1 with Times; the original sets its accents as written
const utf8 = s => new TextDecoder().decode(Uint8Array.from(s, c => c.charCodeAt(0)))
for (const [face, pre] of [['OT1', ''], ['T1 Times', '\\usepackage[T1]{fontenc}\\usepackage{times}\n']]) {
  const words = 'Poincar\\\'e, Erd\\H{o}s, El Ni{\\~n}o, Babu\\v{s}ka, Fran\\c{c}ois, \\.{Z}ywiec, Mart\\\'{\\i}nez, na\\"\\i ve, Erdo\\u{g}an and \\^{W}ales'
  const files = new Map([['main.tex', `\\documentclass{article}\n${pre}\\begin{document}\n${PARAS(1)}\n\nThe works of ${words} are cited.\n\n\\section{On Poincar\\'e's lemma}\nAs Schr\\"odinger wrote.\n\\end{document}\n`]])
  const paper = openPaper(new Map([...files].map(([p, t]) => [p, enc(t)])))
  const trFor = word => new Map(paper.units.map(u => [u, u.pieces.map(p => (p.t === 'text' ? { t: 'text', tr: true, s: utf8(p.s).replace(/\p{L}+/gu, w => (/^[A-Za-z]{2,}$/.test(w) ? word : w)) } : p))]))
  const original = compile(`accent-${face.length}-original`, new Map([...files].map(([p, t]) => [p, enc(t)])), { engine: 'pdflatex', halt: true })
  check(`accents, ${face}: the original sets with no error and no letter lost`, !/^! /m.test(original) && !/^Missing character/m.test(original), original.match(/^(! |Missing character).*$/m)?.[0] ?? '')
  for (const [lang, word] of [['zh', ZH], ['de', 'Wort'], ['ru', '\u0441\u043b\u043e\u0432\u043e']]) for (const strategy of strategiesFor(paper.meta, lang)) {
    const out = translationFiles(paper, trFor(word), { strategy, fonts: null, draft: true, aux: null, bbl: null })
    const text = new TextDecoder().decode(out.get('main.tex'))
    const log = compile(`accent-${face.length}-${lang}-${strategy.engine}`, new Map([...[...files].map(([p, t]) => [p, enc(t)]), ...out]), { engine: strategy.engine, halt: true })
    check(`accents, ${face}, ${lang} by ${strategy.name}, halting: the letters set, no error, no letter lost`, /Niño/.test(text) && /Erdős/.test(text) && !/^! /m.test(log) && !/^Missing character/m.test(log) && /Output written on main\.(pdf|xdv)/.test(log), log.match(/^(! |Missing character).*$/m)?.[0] ?? 'no output')
  }
}

console.log(failed ? `${failed} failed (${dir})` : `all passed (${dir})`)
process.exit(failed ? 1 : 0)
