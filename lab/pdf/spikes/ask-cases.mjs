// lab/pdf/spikes/ask-cases.mjs
// The ink probe asked where the document uses a macro (the compile move's F15, PDF-READER §18.80: packages/engine/src/marks/
// marks.ts ASK_TEX, askOf; compile/live.ts askPlan and originalFiles `asks`; read by marks.ts useAnswersOf) under TeX: a small
// paper of our own, opened as the prepare opens one (live.ts openPaper), its marked files written as the loop's first pass is
// given them (originalFiles with the layout marks and the statements), its ink samples (marks.ts inkSamples) asked at their
// first use, compiled in each pinned TeX Live year's image under pdfLaTeX, XeLaTeX, LuaLaTeX and latex as the host makes that
// pass (one draft pass, then BibTeX: the paper ships no .bbl), twice: the marked files alone (`base`) and with the asks (`asks`).
// Held: (1) the .bbl BibTeX makes, the .aux and the .toc byte for byte the same both ways: the asks write nothing, step no
// counter and cite nothing; (2) as many TeX errors outside the asks as the base's, both run through; (3) each sample's answer
// where the document uses it, measured in the mode of its use (a paragraph's sample set as a paragraph at the measure in force):
// a macro an environment defines otherwise (elsarticle's `\sep`, empty outside `keyword`, `\unskip, ` in it) sets ink; one
// defined in the body, after the preamble, sets ink; a citation's macro sets ink and writes no citation; a counter's step and
// an empty macro set none (asked at a use in running text, never in a section's title or a caption, which the .aux, the .toc
// and hyperref's nameref copy as written: the paper loads hyperref, the title and the caption are labelled); a macro first used
// in a table's cell asked there; a macro that leaves math open (`$a`) asked, its math closed after it; a skip of no ink
// answered; a command that ends the paragraph or the line where it is used (`\par`, `\\`, `\newline`, a keywords
// environment's `\unskip\par`, as cas-sc's `\sep`) is never inkless; a macro that begins a paragraph between paragraphs
// (`\leavevmode`) is inkless, the paragraph's point of ours in its indent box read as no ink. Each sample asked at most once; a row's rule at a row's
// start not asked (no \noalign misplaced); a paragraph's own \begingroup and \endgroup never asked; two macros of 35 errors
// each in one paragraph asked and the pass run through (the count starts again after each ask). Exit 1 on a failure.
//   pnpm exec tsx lab/pdf/spikes/ask-cases.mjs [--years=2023,2025] [--engines=pdflatex,xelatex,lualatex,latex] [--out=<dir>]
// Docker with the years' pinned images (lab/pdf/compile-images.json); no network.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import * as LIVE from '../../../packages/engine/src/compile/live.ts'
import * as MARKS from '../../../packages/engine/src/marks/marks.ts'
import { checkCompileImage, compileImageRef } from './compile-image.mjs'

const arg = (name) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.slice(name.length + 3) : null
}
const YEARS = (arg('years') ?? '2023,2025').split(',')
const ENGINES = (arg('engines') ?? 'pdflatex,xelatex,lualatex,latex').split(',')
const OUT = resolve(arg('out') ?? join(tmpdir(), `ask-cases-${process.pid}`))
const DRAFT = { pdflatex: '-draftmode', xelatex: '-no-pdf', lualatex: '--draftmode', latex: '-draftmode' }

const MAIN = String.raw`\documentclass{article}
\usepackage{hyperref}
\newcommand\kw{}
\newenvironment{keys}{\def\kw{\unskip, }}{\par}
\newcommand\stepme{\refstepcounter{equation}}
\newcommand\withcite{see \cite{b}}
\newcommand\nada{}
\newcommand\later{}
\newcommand\wide{\hspace{2.5em}}
\newcommand\capt{}
\newcommand\incell{\textbf{c}}
\newcommand\myrule{\hline}
\newcommand\openmath{$a}
\newcommand\mypar{\par}
\newcommand\mycr{\\}
\newcommand\mynl{\newline}
\newenvironment{kws}{\par\def\ksep{\unskip\par}}{\par}
\newcommand\lead{\leavevmode}
\newcommand\noisyA{\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA\zzA}
\newcommand\noisyB{\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB\zzB}
\begin{document}
\tableofcontents
\section{One \nada}\label{s1}
Text \cite{a} and \withcite{} here, \nada{} and \capt{} in the text.
Here \openmath{} b, in \nameref{s1}.

\begin{keys}alpha \kw beta \kw gamma\end{keys}

\begin{equation}x\label{e1}\end{equation}
Words \stepme{} after.\label{after} A gap \wide{} there.

\begin{table}\begin{tabular}{ll} Name & Value \\ \myrule alpha & beta \incell \\ \end{tabular}\end{table}

\begingroup\small A group of the paragraph's own.\endgroup{} Then two noisy ones \noisyA{} and \noisyB{} in one paragraph.

Words that \mypar{} end here, a line \mycr{} cut, another \mynl{} too.

\begin{kws}alpha \ksep beta \ksep gamma\end{kws}

\lead{} A paragraph a macro begins.

\begin{figure}\caption{A caption \capt}\label{f1}\end{figure}
\renewcommand\later{Late}Then \later{} again.

\bibliographystyle{unsrt}
\bibliography{refs}
\end{document}
`
const BIB = `@misc{a, author = {A. Author}, title = {First}, year = {2020}}
@misc{b, author = {B. Author}, title = {Second}, year = {2021}}
`
/** each sample's answer where the document uses it: `inked` set some ink, `inkless` set none, `kept` answered and not inkless:
 *  a paragraph's or a line's end where a paragraph uses it (two lines there, or a line and a box) */
const WANT = {
  '\\kw': 'inked',
  '\\later{}': 'inked',
  '\\withcite{}': 'inked',
  '\\incell': 'inked',
  // (answered: under XeTeX's and dvipdfmx's drivers hyperref's anchor for the counter is a \\special, which the ink section's
  // reading takes as no inkless node; under pdfTeX and LuaTeX a \\pdfdest, which it does)
  '\\stepme{}': 'answered',
  '\\nada{}': 'inkless',
  '\\capt{}': 'inkless',
  '\\wide{}': 'inkless',
  // (in a section's title and a caption alone: not asked there)
  '\\nada': undefined,
  '\\capt': undefined,
  // (a row's rule at a row's start: not asked there, where a token of ours would begin a cell before its \\hline)
  '\\myrule': undefined,
  // (a paragraph's end or a line's where it is used: more than one line, or vertical material, in its paragraph: never inkless)
  '\\mypar{}': 'kept',
  '\\mycr{}': 'kept',
  '\\mynl{}': 'kept',
  '\\ksep': 'kept',
  // (a paragraph's start where it is used, between paragraphs: a line of no ink, our own point in its indent box)
  '\\lead{}': 'inkless',
}

const files = new Map([
  ['main.tex', new TextEncoder().encode(MAIN)],
  ['refs.bib', new TextEncoder().encode(BIB)],
])
const paper = LIVE.openPaper(files)
const samples = MARKS.inkSamples(paper.units)
// (the loop's first pass: the marked files, the statements after the layout marks; with the asks where they are known)
const marked = (asks) => LIVE.originalFiles(paper, { lines: true, layout: MARKS.LAYOUT_CLASSES, statements: true, asks })
const asked = LIVE.askPlan ? LIVE.askPlan(paper.project, samples) : { at: new Map(), asked: [] }
const sides = { base: marked(null), asks: marked(asked) }

let bad = 0
for (const year of YEARS) {
  const image = compileImageRef(process.env, year)
  await checkCompileImage(image, [])
  const dir = join(OUT, year)
  rmSync(dir, { recursive: true, force: true })
  for (const [side, over] of Object.entries(sides))
    for (const e of ENGINES) {
      const d = join(dir, `${side}-${e}`)
      mkdirSync(d, { recursive: true })
      for (const [p, b] of [...files, ...over]) writeFileSync(join(d, p), b)
    }
  const pass = (e) => `timeout 120 ${e} ${DRAFT[e]} -interaction=nonstopmode main.tex >/dev/null 2>&1; bibtex main >/dev/null 2>&1`
  writeFileSync(join(dir, 'run.sh'), `${ENGINES.map((e) => `for d in *-${e}/; do (cd "$d" && ${pass(e)}); done`).join('\n')}\ntrue\n`)
  execFileSync(
    'docker',
    ['run', '--rm', '--network', 'none', '-e', 'SOURCE_DATE_EPOCH=1700000000', '-e', 'FORCE_SOURCE_DATE=1', '-v', `${dir}:/work`, '-w', '/work', image, 'sh', 'run.sh'],
    { stdio: 'ignore', timeout: 1_800_000 },
  )
  for (const e of ENGINES) {
    const a = join(dir, `asks-${e}`), b = join(dir, `base-${e}`)
    const faults = []
    const read = (d, f) => (existsSync(join(d, f)) ? readFileSync(join(d, f), 'latin1') : null)
    for (const f of ['main.bbl', 'main.aux', 'main.toc']) {
      const x = read(a, f), y = read(b, f)
      if (y === null) faults.push(`the base wrote no ${f}`)
      else if (x !== y) faults.push(`${f} differs with the asks`)
    }
    const log = read(a, 'main.log') ?? '', baseLog = read(b, 'main.log') ?? ''
    // (the errors TeX met outside the asks' own rows, against the base's: the paper's own, as many; and both ran through)
    const outside = (t) => {
      let inAsk = false
      return t.split('\n').filter((l) => {
        if (/^LAYOUT-PROBE 1 ink-at /.test(l)) inAsk = true
        else if (/^LAYOUT-PROBE 1 ink-end /.test(l)) inAsk = false
        return !inAsk && /^! (?!OK\.)/.test(l)
      })
    }
    const errors = outside(log), baseErrors = outside(baseLog)
    if (errors.length !== baseErrors.length) faults.push(`TeX: ${errors.length} errors outside the asks, the base ${baseErrors.length}: ${errors.filter((x) => !baseErrors.includes(x)).slice(0, 3).join(' | ')}`)
    if (!/^AXT-END$/m.test(log) || !/^AXT-END$/m.test(baseLog)) faults.push('a pass did not run through')
    const uses = MARKS.useAnswersOf(log, asked.asked)
    const got = Object.fromEntries([...uses.inkless.map((s) => [s, 'inkless']), ...uses.inked.map((s) => [s, 'inked'])])
    for (const [s, want] of Object.entries(WANT))
      if (want === 'answered' ? got[s] === undefined : want === 'kept' ? got[s] !== 'inked' : got[s] !== want)
        faults.push(`${s}: ${got[s] ?? 'no answer'}, not ${want ?? 'no answer'}`)
    // (a piece that opens or closes the paragraph's own group is never asked: marks.ts askable)
    for (const s of ['\\begingroup', '\\endgroup']) if (asked.asked.includes(s)) faults.push(`${s} asked`)
    const once = asked.asked.map((_, i) => (log.match(new RegExp(`^LAYOUT-PROBE 1 ink-at ${i}$`, 'gm')) ?? []).length)
    // (at most once each: a sample TeX passes over where it stands, between an alignment's rows, is not asked there)
    if (once.some((n) => n > 1)) faults.push(`asked more than once: ${JSON.stringify(once)}`)
    if (once[asked.asked.indexOf('\\myrule')] !== 0) faults.push('the row rule asked at its row start')
    console.log(`${faults.length ? 'FAIL' : 'ok  '} ${year} ${e}: asked ${asked.asked.length} (${asked.asked.join(' ')}); ${JSON.stringify(got)}${faults.length ? `; ${faults.join('; ')}` : ''}`)
    if (faults.length) bad++
  }
}
console.log(bad ? `${bad} failed` : 'all held')
process.exit(bad ? 1 : 0)
