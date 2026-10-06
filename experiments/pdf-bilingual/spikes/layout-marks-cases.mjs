// experiments/pdf-bilingual/spikes/layout-marks-cases.mjs
// The layout marks under TeX (src/pdf-reader/engine/layout/marks.mjs, LAYOUT_TEX and layoutMarking): small documents
// compiled natively in Docker, each one twice — v0, the marked original as the run makes it today (live.mjs
// originalFiles with lines), and v1, the same with the layout marks of every class — each case one way a mark could move
// a line of a paper, set a mark where the body does not set the text, or change what TeX writes to a file. pdfLaTeX
// unless a case names another engine. Exits non-zero on a failure; a finding (XeTeX's cells) is printed, never failed.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/layout-marks-cases.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { lastTexLog } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { layoutMarksOf, MARK_CLASSES, probeSamples, readMarkProbe } from '../../../src/pdf-reader/engine/layout/marks.mjs'
import { openPaper, originalFiles, probeFiles } from '../../../src/pdf-reader/engine/live.mjs'

let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }
const dir = mkdtempSync(join(tmpdir(), 'layout-marks-cases-'))

// ---------------------------------------------------------------- the documents
const WORDS = ['we', 'show', 'that', 'the', 'considerably', 'larger', 'model', 'of', 'a', 'results', 'in', 'an', 'experimental', 'setting', 'is']
/** prose of `n` phrases of two to six words, `put(i)` after the i-th: the marks fall at every place of a line, its end among them */
const prose = (n, put) => Array.from({ length: n }, (_, i) => `${Array.from({ length: 2 + (i % 5) }, (_, j) => WORDS[(i * 7 + j * 3) % WORDS.length]).join(' ')}${put(i)}`).join(' ')
const BIB = String.raw`\begin{thebibliography}{9}
\bibitem[Author(2020)]{a} A. Author. A title of a paper. 2020.
\bibitem[Bauthor(2021)]{b} B. Bauthor. Another title. 2021.
\end{thebibliography}`
const doc = (pre, body, cls = '\\documentclass{article}') => `${cls}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`

/** the documents whose every text item must stay where it is, each also with hyperref loaded */
const STAY = {
  'cite.sty': doc('\\usepackage{cite}', `${prose(24, i => [' \\cite{a}', '~\\cite{b}', ' \\cite{a,b}.', ' \\cite{a} and'][i % 4])}\n\n${prose(12, i => (i % 2 ? ' \\cite{b},' : ' \\cite{a}'))}\n\n${BIB}`),
  'cite.sty [super]': doc('\\usepackage[super]{cite}', `${prose(24, i => (i % 2 ? ' \\cite{a} and' : '~\\cite{b} we'))}\n\n${BIB}`),
  'a tie before \\ref': doc('\\usepackage{amsmath}', `\\begin{figure}[t]\\centering\\rule{2cm}{1cm}\\caption{A figure.}\\label{f}\\end{figure}\n${prose(24, i => (i % 3 === 0 ? ' Fig.~\\ref{f}' : i % 3 === 1 ? ' see~\\eqref{e}' : ' and Section~\\ref{s}'))}\n\\section{More}\\label{s}\n\\begin{equation}a=b\\label{e}\\end{equation}`),
  '\\xspace after a paper\'s macro': doc('\\usepackage{xspace}\\newcommand\\bert{BERT\\xspace}', `${prose(30, i => [' \\bert words', ' \\bert.', ' \\bert, then', ' with \\bert'][i % 4])}`),
  'a macro reading an optional argument by \\@ifnextchar[ after it': doc('\\makeatletter\\newcommand\\opt{\\@ifnextchar[\\opt@x{\\opt@x[none]}}\\def\\opt@x[#1]{opt(#1)}\\makeatother', `${prose(24, i => (i % 2 ? ' \\opt[a] then' : ' \\opt and'))}`),
  'an inline formula opening a paragraph': doc('', Array.from({ length: 6 }, (_, i) => `$x_${i}$ is ${prose(8, j => (j % 3 ? '' : ` $y_${j}$`))}`).join('\n\n')),
  // two displays in a row: TeX drops the empty paragraph between them, which a mark would keep (2608.20051)
  'two displays in a row': doc('\\usepackage{amsmath}', `${prose(6, () => '')} define\n\\[ a = b \\]\n\\[ c = d \\]\n\\begin{equation} e = f \\end{equation}\n$$ g = h $$\n${prose(6, () => '')}`),
  // amsmath's \\] ends in \\ignorespaces, which skips a macro that sets nothing and the line end after it; a mark set
  // there would end the skip, and the next line begin with a space (2608.29782's \\delete{…} after a display)
  'a macro that sets nothing after a display': doc('\\usepackage{amsmath}\\newcommand\\delete[1]{}', `${prose(6, () => '')} by\n\\[ a = b \\]\n\\delete{A passage $x$ set aside.}\n${prose(6, () => '')} and\n\\begin{align*} c = d \\end{align*}\n\\delete{More.}\n${prose(6, () => '')}`),
  // subequations with a \\label after its align: \\end's skip of the spaces after it ends at a mark (2608.12255)
  'an environment that skips the spaces after it': doc('\\usepackage{amsmath}', `${prose(8, () => '')} integers $r$\n\t\\begin{subequations}\n\\begin{align} a &= b \\label{eq:a} \\\\ c &= d \\end{align}\n\\label{eq:ab}\n\t\\end{subequations}\n\t${prose(8, () => '')}`),
  'a display inside a paragraph, and one ending it': doc('\\usepackage{amsmath}', `${prose(8, () => '')}\n\\[ a = b + c \\]\n${prose(8, i => (i === 3 ? ' $z$' : ''))}\n\\begin{equation} c = d \\end{equation}\n${prose(6, () => '')} \\begin{align} e &= f \\\\ g &= h \\end{align} ${prose(6, () => '')}\n\n${prose(6, () => '')}\n\\[ p = q \\]\n\n${prose(6, () => '')}`),
  'a footnote\'s call': doc('', `${prose(20, i => (i % 3 ? '' : `\\footnote{A note ${i} with $n_${i}$.}`))}. ${prose(8, i => (i === 4 ? '\\footnote{Last.}.' : ''))}`),
  'a footnote\'s call with footmisc': doc('\\usepackage[hang]{footmisc}', `${prose(20, i => (i % 3 ? '' : `\\footnote{A note ${i}.}`))}. ${prose(8, i => (i === 4 ? '\\footnote{Last.}.' : ''))}`),
  'natbib\'s \\citep[p.~3]{a}': doc('\\usepackage{natbib}', `${prose(24, i => [' \\citep[p.~3]{a}', ' \\citet{b}', ' \\citep{a,b}.', '~\\citep[see][]{a}'][i % 4])}\n\n${BIB}`),
  'a cell in \\resizebox': doc('\\usepackage{graphicx}', `${prose(6, () => '')}\n\n\\begin{table}[h]\\centering\\resizebox{0.5\\linewidth}{!}{\\begin{tabular}{lll}\\hline \\textit{Alpha} cell & Beta $x$ & \\texttt{code} \\\\ \\hline Gamma ray & delta \\cite{a} & epsilon \\\\ \\hline\\end{tabular}}\\caption{A table.}\\end{table}\n${BIB}`),
  // the engine's own cases: a row's commands before a cell (an opening mark there would begin the cell before \\cline's
  // \\noalign, a paper's \\multicolumn's \\omit), a footnote's call right after a macro \\xspace ends, a call that is a control word
  'a table row\'s \\cline, \\rowcolor and a paper\'s \\multicolumn before a cell': doc('\\usepackage[table]{xcolor}\\newcommand\\mc[1]{\\multicolumn{1}{c}{#1}}', `\\begin{tabular}{lc}\\hline\n\\mc{Head $h$} & \\mc{\\cite{a} two} \\\\\n\\cline{1-2}\n\\rowcolor{gray} $x$ cell & Value \\\\\n\\cline{2-2} \\texttt{code} here & $y$ \\\\\\hline\\end{tabular}\n\n${prose(6, () => '')}\n${BIB}`),
  'a footnote\'s call after \\xspace, and \\footnotemark': doc('\\usepackage{xspace}\\newcommand\\bert{BERT\\xspace}', `${prose(12, i => [' \\bert\\footnote{One.}', ' \\bert \\footnote{Two.} then', ' a\\footnotemark{} and', ' b\\footnotemark and'][i % 4])}`),
  'an italic correction before a citation': doc('', `${prose(20, i => (i % 2 ? ' \\textit{word} \\cite{a}' : ' \\emph{f} $x$'))}\n\n${BIB}`),
  // a word glued to a formula or a footnote's call is never hyphenated (TeX's rule: a box or math after it), and a mark
  // between them would make it so (2608.01890's "order$Y_H$" moved a page's lines); narrow columns, long words
  // a control space at a line's end (2608.08350's `.\\` before a blank line): a mark after it would stand on the blank
  // line, and the two paragraphs would be one
  'a control space before a blank line': doc('', `${prose(10, () => '')} \\cite{a}.\\\n\n${prose(10, () => '')} \\cite{b}.\\\n\n${prose(8, () => '')}\n\n${BIB}`),
  // a tabularray table, which the scanner reads as prose: \\SetCell must open its cell (2608.03994)
  'a tabularray row\'s \\SetCell': doc('\\usepackage{tabularray}', `\\begin{tblr}{colspec={lccccc}}\nModel & Size & \\SetCell[c=3]{c} Slopes & & & $\\delta_1$ \\\\\nAlpha & 1.5 & 2 & 3 & 4 & $x$ \\\\\n\\end{tblr}\n\n${prose(6, () => '')}`),
  // the paper's own switch: a package that sets the punctuation after a citation before it (cite.sty's and natbib's
  // super, natmove); there no mark goes on a citation the punctuation follows
  'cite.sty [super], a citation before a full stop or a comma (the switch)': doc('\\usepackage[super]{cite}', `${prose(16, i => [' \\cite{a}.', ' \\cite{b},', ' \\cite{a} and', '~\\cite{b};'][i % 4])}\n\n${BIB}`),
  'natbib [super] with natmove, a citation before a full stop or a comma (the switch)': doc('\\usepackage[super,sort&compress]{natbib}\\usepackage{natmove}', `${prose(16, i => [' \\cite{a}.', ' \\cite{b},', ' \\cite{a} and', ' \\cite{a,b}:'][i % 4])}\n\n${BIB}`),
  // fnpct, in Times, whose "y." kerns: a call keeps its opening mark alone (it looks ahead), and fnpct sets the full stop
  // after a node of its own, which the mark does not part from the word; no switch is needed
  'fnpct in Times, a footnote\'s call before a full stop or a comma': doc('\\usepackage{times}\\usepackage{fnpct}', `${prose(16, i => [` way\\footnote{Note ${i}.}.`, ` day\\footnote{Note ${i}.},`, ' and', ` key\\footnote{Note ${i}.} then`][i % 4])}`),
  // what moves the punctuation after a citation, wherever it comes from (review I2): biblatex's \autocite scans for
  // .,;:!? as a superscript or a footnote, in its own styles and in other packages' (biblatex-chem, biblatex-ext);
  // REVTeX 4.2's superscripts swap it (\super@cite@swap); natbib's super alone
  'biblatex autocite=superscript, \\autocite before ? and !': doc('\\usepackage[autocite=superscript]{biblatex}', `${prose(16, i => [' \\autocite{a}?', ' \\autocite{b}!', ' \\autocite{a} and', ' \\autocite{b}.'][i % 4])}`),
  'biblatex autocite=footnote, \\autocite before ? and !': doc('\\usepackage[autocite=footnote]{biblatex}', `${prose(16, i => [' \\autocite{a}?', ' \\autocite{b}!', ' \\autocite{a} and', ' \\autocite{b},'][i % 4])}`),
  'biblatex style=chem-acs, \\autocite before . and ,': doc('\\usepackage[style=chem-acs]{biblatex}', `${prose(16, i => [' \\autocite{a}.', ' \\autocite{b},', ' \\autocite{a} and', ' \\autocite{b};'][i % 4])}`),
  'biblatex style=ext-verbose, \\autocite before . and ,': doc('\\usepackage[style=ext-verbose]{biblatex}', `${prose(16, i => [' \\autocite{a}.', ' \\autocite{b},', ' \\autocite{a} and', ' \\autocite{b}?'][i % 4])}`),
  'REVTeX 4.2 aip,jcp, \\cite before . and ,': doc('', `${prose(16, i => [' \\cite{a}.', ' \\cite{b},', ' \\cite{a} and', ' \\cite{a,b};'][i % 4])}\n\n${BIB}`, '\\documentclass[aip,jcp,reprint]{revtex4-2}'),
  // REVTeX 4.2's own swap runs under citeautoscript alone: it takes the token after a citation into a \csname, a closing
  // mark there an error (the re-review's I-new: the probe measured the box before)
  'REVTeX 4.2 aip,jcp,citeautoscript, \\cite before !, ? and a word': doc('', `${prose(16, i => [' \\cite{a}!', ' \\cite{b}?', ' \\cite{a} and', ' \\cite{b}.'][i % 4])}\n\n${BIB}`, '\\documentclass[aip,jcp,reprint,citeautoscript]{revtex4-2}'),
  'natbib [super] alone, \\cite before . and ,': doc('\\usepackage[super]{natbib}', `${prose(16, i => [' \\cite{a}.', ' \\cite{b},', ' \\cite{a} and', ' \\citep{b};'][i % 4])}\n\n${BIB}`),
  // footnote calls: one whose note has a letter alone (no unit: a call all the same), and two in a row, the second
  // marked where TeX answers that a mark between them changes nothing; under footmisc's [multiple] too, whose separator
  // comes from a flag the first call sets, not from a look ahead
  'a footnote of one letter, and two calls in a row': doc('', `${prose(16, i => [' word\\footnote{A}', ' more\\footnote{One note.}\\footnote{Two note.} and', ' then\\footnote{B}\\footnote{C}.', ' last'][i % 4])}`),
  'two calls in a row under footmisc [multiple]': doc('\\usepackage[multiple]{footmisc}', `${prose(16, i => [' more\\footnote{One note.}\\footnote{Two note.} and', ' word\\footnote{A}\\footnote{B}', ' then', ' last\\footnote{Three note.}.'][i % 4])}`),
  // a parameter set in a paragraph, a number or a dimension at its end: TeX takes the space after it as the number's end
  // and reads on for a unit or a `plus`, which a closing mark would stop (2608.30640's `.\n\looseness=-1 While`)
  'a number or a dimension set before a word': doc('', `${prose(16, i => ['.\n\\looseness=-1 While', ' \\linepenalty=100 and', ' \\spaceskip=3pt plus 1pt the', ' \\hyphenpenalty 50 we'][i % 4])}`),
  // leaders before a placeholder: a mark taking the glue off and putting it back would put back plain glue, the dots gone
  // (\\dotfill ends in \\kern\\z@, which guards its leaders from an \\unskip)
  'leaders before a formula': doc('', `\\noindent Total\\dotfill{} $0$\n\n\\noindent Total 0\\dotfill{} $0$\n\n\\noindent Sum \\hrulefill\\ $x$ and \\dotfill \\cite{a}\n\n${prose(6, () => '')}\n${BIB}`),
  // a paper's macro looks ahead past its own argument, at what a closing mark would be (review C1): \\xspace, \\@ifnextchar,
  // \\@esphack's \\ignorespaces (todonotes [disable], \\nocite, \\marginpar); the next placeholder's opening mark too
  'a macro with \\xspace after its argument': doc('\\usepackage{xspace}\\newcommand\\code[1]{\\texttt{#1}\\xspace}', `${prose(24, i => [' \\code{X} is', ' \\code{Y}.', ' \\code{Z}, then', ' \\code{a}\\footnote{x} and'][i % 4])}`),
  'a macro reading \\@ifnextchar[ after its argument': doc('\\makeatletter\\newcommand\\opt[1]{\\texttt{#1}\\@ifnextchar[\\opt@x{}}\\def\\opt@x[#1]{(#1)}\\makeatother', `${prose(24, i => (i % 2 ? ' \\opt{a} then' : ' \\opt{b}[c] and'))}`),
  'todonotes [disable], \\nocite and \\marginpar': doc('\\usepackage[disable]{todonotes}', `${prose(24, i => [' more \\todo{x} words', ' see \\nocite{a} then', ' then \\marginpar{note} then', ' and \\todo{y} $z$'][i % 4])}\n\n${BIB}`),
  // LaTeX's \\) reads nothing after it: an inline formula of \\( \\) keeps its closing mark, as one of $ $
  'an inline formula of \\( \\)': doc('', `${prose(24, i => [' \\(x_{' + i + '}\\) is', ' \\(y\\).', ' \\(z\\), then', '~\\(w\\) and'][i % 4])}`),
  'a macro that ends in leaders': doc('\\newcommand\\fillto[1]{#1\\dotfill}', `\\noindent\\fillto{Entry} $3$\n\n\\noindent\\fillto{Other entry} \\cite{a}\n\n${prose(6, () => '')}\n${BIB}`),
  // the probe takes the marks off these calls (fnpct sets the full stop first); the formula keeps the case from being vacuous
  'fnpct, a full stop after a footnote\'s call': doc('\\usepackage{fnpct}', `${prose(16, i => (i % 2 ? ' word\\footnote{One.}. And $x$' : ' more\\footnote{Two.}, then'))}`),
  // an italic word's correction before \\eqref's \\textup, under each engine: XeTeX's word is a whatsit (review I2)
  'an italic word before \\eqref': { engines: ['pdflatex', 'xelatex', 'lualatex'], src: doc('\\usepackage{iftex}\\ifPDFTeX\\else\\usepackage{fontspec}\\fi\\usepackage{amsmath}\\usepackage{amsthm}\\newtheorem{theorem}{Theorem}', `\\begin{equation} x = y \\label{e} \\end{equation}\n\\begin{theorem}${prose(24, i => [' by \\eqref{e}', ' with~\\eqref{e} and', ' of \\ref{e}', ' \\emph{set} by \\eqref{e}'][i % 4])}.\\end{theorem}\n${prose(6, () => '')}`) },
  'a word glued to a formula or a footnote\'s call, never hyphenated': doc('\\usepackage[margin=6.5cm]{geometry}', `${prose(30, i => [' representations$x_{' + i + '}$', ' characterization\\footnote{N.}', ' considerably$y$ is', ' experimentally\\footnotemark{} and'][i % 4])}`),
}

// ---------------------------------------------------------------- compiling
/** each job in its own directory, all in one container: `passes` runs of `engine`, the terminal kept. XeLaTeX's own run
 *  calls xdvipdfmx quiet (-q), which then says nothing of a destination set twice: the two steps here, as the TeX page
 *  runs them */
function compileAll(jobs) {
  const pass = j => (j.engine === 'xelatex' && !j.probe ? 'xelatex -no-pdf -interaction=nonstopmode main.tex >> term.txt 2>&1; xdvipdfmx main.xdv >> term.txt 2>&1' : `${j.engine} -interaction=nonstopmode main.tex >> term.txt 2>&1`)
  const script = jobs.map(j => `cd /work/${j.name} && for i in ${Array.from({ length: j.passes }, (_, k) => k + 1).join(' ')}; do ${pass(j)}; done`).join('\n')
  writeFileSync(join(dir, 'run.sh'), `${script}\n`)
  try { execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${dir}:/work`, '-w', '/work', 'texlive/texlive:latest', 'sh', 'run.sh'], { stdio: 'ignore', timeout: 1_800_000 }) } catch {}
}
const jobs = [], queued = []
/** the source as v0 and v1 of a job, queued: written once the mark probes have answered (prepare) */
function queue(name, src, { engine = 'pdflatex', passes = 2, variants = ['v0', 'v1'], own = true } = {}) {
  const paper = openPaper(new Map([['main.tex', new TextEncoder().encode(src)]]))
  queued.push({ name, paper, engine, passes, variants, own })
  return paper
}
/** v1 with the paper's own switch as the run gets it: the mark probe compiled first, one pass in the paper's engine (the
 *  font probe's compile, `marks`), its answers read; then every job's files written */
function prepare() {
  const probes = queued.filter(q => q.own && q.variants.includes('v1'))
  for (const q of probes) { const d = join(dir, `${q.name}-probe`); mkdirSync(d, { recursive: true }); for (const [path, bytes] of probeFiles(q.paper, { marks: true })) writeFileSync(join(d, path), bytes) }
  compileAll(probes.map(q => ({ name: `${q.name}-probe`, engine: q.engine === 'xelatex' ? 'xelatex -no-pdf' : q.engine, passes: 1, probe: true })))
  for (const q of queued) {
    const switches = q.own ? readMarkProbe(read(`${q.name}-probe`, 'log', 'latin1') ?? '', probeSamples(q.paper.units)) : null
    q.switches = switches
    for (const v of q.variants) {
      const d = join(dir, `${q.name}-${v}`)
      mkdirSync(d, { recursive: true })
      for (const [path, bytes] of originalFiles(q.paper, v === 'v1' ? { lines: true, layout: MARK_CLASSES, switches } : { lines: true })) writeFileSync(join(d, path), bytes)
      jobs.push({ name: `${q.name}-${v}`, engine: q.engine, passes: q.passes })
    }
  }
}
const read = (name, ext, enc) => { const f = join(dir, name, `main.${ext}`); return existsSync(f) ? readFileSync(f, enc) : null }
/** a compiled PDF's text items by page (string, origin, width, size) and its axt- destinations (page 1-based) */
async function pdfOf(name, keep = false) {
  const bytes = read(name, 'pdf')
  if (!bytes?.length) return null
  const task = getDocument({ data: new Uint8Array(bytes), verbosity: 0 })
  const pdf = await task.promise
  const pages = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const items = (await (await pdf.getPage(n)).getTextContent()).items
    pages.push(items.filter(i => i.str?.trim()).map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, size: Math.hypot(i.transform[0], i.transform[1]) })))
  }
  const dests = new Map()
  for (const [full, d] of await pdf.getDestinations()) if (full.startsWith('axt-')) dests.set(full.slice(4), { page: (await pdf.getPageIndex(d[0])) + 1, x: d[2], y: d[3] })
  if (keep) return { pages, dests, pdf, task }
  await task.destroy()
  return { pages, dests }
}
/** the text items that moved from v0 to v1: by page, each string's places in order, to 0.01 pt */
function moved(a, b) {
  if (a.pages.length !== b.pages.length) return [`${a.pages.length} pages → ${b.pages.length}`]
  const out = []
  const byString = items => { const m = new Map(); for (const it of items) (m.get(it.str) ?? m.set(it.str, []).get(it.str)).push(it); for (const l of m.values()) l.sort((u, v) => v.y - u.y || u.x - v.x); return m }
  a.pages.forEach((pa, p) => {
    const ma = byString(pa), mb = byString(b.pages[p])
    for (const [s, la] of ma) {
      const lb = mb.get(s) ?? []
      if (la.length !== lb.length) { out.push(`page ${p + 1} "${s}" ×${la.length} → ×${lb.length}`); continue }
      la.forEach((u, i) => { const v = lb[i]; if (Math.abs(u.x - v.x) > 0.01 || Math.abs(u.y - v.y) > 0.01) out.push(`page ${p + 1} "${s}" (${u.x.toFixed(2)}, ${u.y.toFixed(2)}) → (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`) })
    }
    for (const s of mb.keys()) if (!ma.has(s)) out.push(`page ${p + 1} "${s}" new`)
  })
  return out
}
const READ_LINE = /^(?:AXT-|Missing character: |! LaTeX Error: Unicode character )/
/** the log lines the run reads (live.mjs readingsOf), and LaTeX's warnings and errors */
const readLog = name => lastTexLog(read(name, 'log', 'latin1') ?? '').split('\n').filter(l => READ_LINE.test(l) || /^(?:LaTeX|Package \S+|Class \S+) Warning|^! /.test(l))
const errorsOf = name => (read(name, 'log', 'latin1') ?? '').match(/^! .*/gm) ?? []
const near = (m, page, x, y, d) => !!m && m.page === page && Math.hypot(m.x - x, m.y - y) <= d

// ---------------------------------------------------------------- the jobs
/** each document of STAY under each of its engines (pdfLaTeX unless it names others), by its job's key */
const stays = Object.entries(STAY).flatMap(([name, v]) => (typeof v === 'string' ? [[name, v, 'pdflatex']] : v.engines.map(e => [name, v.src, e])))
const stayKey = (name, engine) => `stay-${name.replace(/[^A-Za-z0-9]+/g, '-')}${engine === 'pdflatex' ? '' : `-${engine}`}`
for (const [name, src, engine] of stays) {
  queue(stayKey(name, engine), src, { engine })
  queue(`${stayKey(name, engine)}-hyperref`, src.replace('\n\\begin{document}', '\n\\usepackage{hyperref}\n\\begin{document}'), { engine })
}
// a caption in the list of figures: the list alone on its page, the figure on the next
const lofPaper = queue('lof', doc('', `\\listoffigures\n\\clearpage\n${prose(10, () => '')}\n\\begin{figure}[h]\\centering\\rule{2cm}{1cm}\\caption{\\textit{Zebra} caption text.}\\end{figure}\n${prose(10, () => '')}`), { passes: 3 })
// headings in the contents and in the running heads, the contents alone on the first page
const tocBody = `\\tableofcontents\n\\clearpage\n${['Alpha', 'Beta', 'Gamma', 'Delta'].map(w => `\\section{\\textit{${w}} heading}\n${Array.from({ length: 5 }, () => prose(20, () => '')).join('\n\n')}`).join('\n')}`
const tocPaper = queue('toc', doc('\\pagestyle{headings}', tocBody), { passes: 3 })
// what TeX writes: the aux (labels, nameref's titles), the contents, the lists, hyperref's bookmarks
const filesSrc = doc('\\usepackage{amsmath}\\usepackage{hyperref}', `\\tableofcontents\\listoffigures\\listoftables\n\\section{The $x$ method}\\label{sec:m}\n${prose(10, i => (i === 5 ? ' see \\nameref{sec:m} and \\nameref{fig:z}' : ''))}\n\\begin{figure}[h]\\centering\\rule{1cm}{1cm}\\caption{A $y$ figure \\cite{a}, see Eq.~\\protect\\eqref{eq:e}.}\\label{fig:z}\\end{figure}\n\\subsection{\\texttt{code} heading}\n${prose(8, () => '')}\n\\begin{equation}a\\label{eq:e}\\end{equation}\n\\begin{table}[h]\\centering\\begin{tabular}{l}x\\end{tabular}\\caption{A table, with \\ref{sec:m}.}\\label{tab:t}\\end{table}\n${BIB}`)
queue('files', filesSrc, { passes: 3 })
// titlesec sets nameref's title itself, past gettitlestring (2608.13505)
queue('files-titlesec', filesSrc.replace('\\usepackage{hyperref}', '\\usepackage{titlesec}\\usepackage{hyperref}'), { passes: 3 })
// the cells of a scaled table, under pdfTeX (failed) and under XeTeX (printed)
const cellSrc = /** @type {string} */ (STAY['a cell in \\resizebox'])
const cellPaper = queue('cell-xe', cellSrc, { engine: 'xelatex', variants: ['v1'] })
// an opening mark before a space
const spacePaper = queue('space', doc('', `We set the $x$ model here, and the $x$ model again.`))
// a heading set twice: its title in a box used twice; under each engine
const twiceSrc = doc('\\newsavebox\\axttitlebox\\renewcommand\\section[1]{\\par\\sbox\\axttitlebox{\\bfseries #1}\\noindent\\usebox\\axttitlebox\\par\\noindent\\usebox\\axttitlebox\\par}', `\\section{Twice set}\n${prose(6, () => '')}`)
const twicePaper = queue('twice', twiceSrc, { variants: ['v1'] })
queue('twice-xe', twiceSrc, { engine: 'xelatex', variants: ['v1'] })
queue('twice-lua', twiceSrc, { engine: 'lualatex', variants: ['v1'] })
// a heading set in capitals keeps its marks' names (a case change leaves them)
const capsPaper = queue('caps', doc('\\makeatletter\\renewcommand\\section{\\@startsection{section}{1}{\\z@}{3ex}{2ex}{\\normalfont\\bfseries\\MakeUppercase}}\\makeatother', `\\section{Capital $x$ heading}\n${prose(6, () => '')}`), { variants: ['v1'] })
// a finding, what the paper's own switch keeps from moving: cite.sty's [super] moves a full stop after a citation before
// its number, looking past the closing mark (v1 here without the switch)
queue('super-stop', doc('\\usepackage[super]{cite}', `${prose(12, i => (i % 2 ? ' \\cite{a}.' : ' \\cite{b},'))}\n\n${BIB}`), { own: false })
queue('natmove-stop', STAY['natbib [super] with natmove, a citation before a full stop or a comma (the switch)'], { own: false })

prepare()
console.log(`compiling ${jobs.length} documents in ${dir}, after ${queued.filter(q => q.own && q.variants.includes('v1')).length} mark probes`)
compileAll(jobs)

// ---------------------------------------------------------------- the checks
for (const [name, , engine] of stays) {
  for (const hyper of [false, true]) {
    const key = `${stayKey(name, engine)}${hyper ? '-hyperref' : ''}`
    const [a, b] = [await pdfOf(`${key}-v0`), await pdfOf(`${key}-v1`)]
    const label = `no line moves: ${name}${engine === 'pdflatex' ? '' : ` (${engine})`}${hyper ? ', with hyperref' : ''}`
    if (!a || !b) { check(label, false, `no PDF (${a ? 'v1' : 'v0'})`); continue }
    const m = moved(a, b), newErrors = errorsOf(`${key}-v1`).filter(e => !errorsOf(`${key}-v0`).includes(e))
    const logA = readLog(`${key}-v0`), logB = readLog(`${key}-v1`)
    const marks = [...b.dests.keys()].filter(k => /^[pnth]\d/.test(k)).length
    check(label, !m.length && !newErrors.length && marks > 0, JSON.stringify({ moved: m.slice(0, 6), newErrors, layoutMarks: marks }))
    check(`${label}: the log the run reads and LaTeX's warnings unchanged`, JSON.stringify(logA) === JSON.stringify(logB), JSON.stringify(logB.filter(l => !logA.includes(l)).slice(0, 4)))
  }
}

{
  // REVTeX's swap takes the closing mark into a \csname: the probe's box with both marks errors, so before `!`, `?` and
  // a word the answer is the opening mark alone, not every mark (a box that errors measured the previous box once)
  const name = 'REVTeX 4.2 aip,jcp,citeautoscript, \\cite before !, ? and a word'
  for (const key of [stayKey(name, 'pdflatex'), `${stayKey(name, 'pdflatex')}-hyperref`]) {
    const got = queued.find(q => q.name === key)?.switches?.['\\cite']
    check(`the mark probe's answer: ${key}`, got === '22221110', JSON.stringify({ got }))
  }
}
{
  const inline = await pdfOf(`${stayKey('an inline formula of \\( \\)', 'pdflatex')}-v1`)
  const closing = [...(inline?.dests.keys() ?? [])].filter(k => /^p\d+\.\d+b$/.test(k)).length
  check('an inline formula of \\( \\) has its closing marks', closing >= 18, JSON.stringify({ closing }))
}
{
  const lof = await pdfOf('lof-v1')
  const n = lofPaper.units.findIndex(u => u.kind === 'caption')
  const zebra = lof?.pages.flatMap((p, i) => p.filter(it => it.str.startsWith('Zebra')).map(it => ({ ...it, page: i + 1 }))).find(it => it.page === 2)
  const s = lof?.dests.get(`${n}s`)
  const onList = [...(lof?.dests ?? [])].filter(([k, d]) => d.page === 1 && !/^c[12]-/.test(k)).map(([k]) => k)
  check('a caption in the list of figures makes no mark there', !!zebra && near(s, 2, zebra.x, zebra.y, 2) && !onList.length, JSON.stringify({ mark: s, glyph: zebra, onList }))
}
{
  const toc = await pdfOf('toc-v1')
  const heads = tocPaper.units.map((u, i) => [u, i]).filter(([u]) => u.kind === 'heading')
  const bad = []
  for (const [u, i] of heads) {
    const word = u.pieces.find(p => p.t === 'text' && /\w/.test(p.s))?.s.trim().split(/\s+/)[0]
    const m = toc?.dests.get(`h${i}s`)
    // the heading's own glyph: its word at the heading's size, not the contents' nor the running head's
    const glyph = m && toc.pages[m.page - 1].find(it => it.str.startsWith(word) && it.size > 12)
    if (!m || !glyph || m.page === 1 || !near(m, m.page, glyph.x, glyph.y, 2)) bad.push({ h: i, word, mark: m, glyph })
  }
  const onContents = [...(toc?.dests ?? [])].filter(([k, d]) => d.page === 1 && /^h/.test(k)).map(([k]) => k)
  check('a heading in the contents or a running head makes no mark there', heads.length === 4 && !bad.length && !onContents.length, JSON.stringify({ bad, onContents }))
}
for (const [job, label] of [['files', 'with hyperref and nameref'], ['files-titlesec', 'and with titlesec']]) {
  const same = ['aux', 'toc', 'lof', 'lot', 'out'].map(ext => [ext, read(`${job}-v0`, ext, 'latin1'), read(`${job}-v1`, ext, 'latin1')])
  const differ = same.filter(([, a, b]) => a === null || a !== b).map(([ext]) => ext)
  check(`a heading or a caption written to a file writes no mark, ${label}: aux, toc, lof, lot, out as v0's`, !differ.length, JSON.stringify(differ))
  check(`… and the files hold the text written (not vacuous), ${label}`, /newlabel\{sec:m\}\{\{1\}\{1\}\{The \$x\$ method\}/.test(same[0][1] ?? '') && /The \$x\$ method/.test(same[1][1] ?? '') && /eqref/.test(same[2][1] ?? ''), (same[0][1] ?? '').slice(0, 300))
}
{
  const key = `stay-${'a cell in \\resizebox'.replace(/[^A-Za-z0-9]+/g, '-')}`
  const firsts = cellPaper.units.map((u, i) => [u, i]).filter(([u]) => u.kind === 'cell').map(([u, i]) => [i, u.pieces.find(p => p.t === 'text' && /\w/.test(p.s))?.s.trim().split(/\s+/)[0]])
  const at = async (name, engine) => {
    const r = await pdfOf(name)
    return firsts.map(([i, word]) => { const m = r?.dests.get(`t${i}s`), g = m && r.pages[m.page - 1].find(it => it.str.startsWith(word)); return { cell: i, word, d: m && g ? Math.hypot(m.x - g.x, m.y - g.y) : null, engine } })
  }
  const pdftex = await at(`${key}-v1`, 'pdflatex'), xetex = await at('cell-xe-v1', 'xelatex')
  check('a cell mark in \\resizebox lies on its glyphs under pdfTeX (within 1 pt)', pdftex.length >= 4 && pdftex.every(c => c.d !== null && c.d <= 1), JSON.stringify(pdftex))
  const xeOk = xetex.every(c => c.d !== null && c.d <= 1)
  console.log(`note XeTeX, a cell mark in \\resizebox: ${xeOk ? 'ok' : `off its glyphs: ${xetex.map(c => `t${c.cell} ${c.d === null ? 'none' : `${c.d.toFixed(1)} pt`}`).join(', ')}`}`)
}
{
  const [a, b] = [await pdfOf('space-v0'), await pdfOf('space-v1')]
  const i = spacePaper.units.findIndex(u => u.pieces.some(p => p.src === '$x$')), k = spacePaper.units[i]?.pieces.findIndex(p => p.src === '$x$')
  const opening = b?.dests.get(`p${i}.${k}a`)
  const the = b?.pages[0].find(it => /the$/.test(it.str) && it.x < (b?.pages[0].find(x => x.str === 'x')?.x ?? 0))
  const xs = s => s?.pages[0].filter(it => it.str === 'x').map(it => [it.x.toFixed(2), it.y.toFixed(2)])
  check('an opening mark before a space keeps the space: at the end of "the"\'s glyphs, $x$ where v0 has it', !!the && near(opening, 1, the.x + the.w, the.y, 0.1) && JSON.stringify(xs(a)) === JSON.stringify(xs(b)) && !moved(a, b).length, JSON.stringify({ opening, the, x0: xs(a), x1: xs(b) }))
}
{
  const r = await pdfOf('twice-v1', true)
  const i = twicePaper.units.findIndex(u => u.kind === 'heading')
  const log = read('twice-v1', 'log', 'latin1') ?? ''
  const marks = r ? await layoutMarksOf(r.pdf, log, { engine: 'pdflatex' }) : null
  await r?.task.destroy()
  check('a name set twice is dropped: pdfTeX logs it, layoutMarksOf lists it', /destination with the same identifier \(name\{axt-h\d+s\}\)/.test(log.replace(/^(.{79})\n/gm, '$1')) && !!marks?.dropped.includes(`h${i}s`) && !marks.marks.some(m => m[0] === `h${i}s`), JSON.stringify(marks?.dropped))
  for (const [name, engine] of [['twice-xe', 'xelatex'], ['twice-lua', 'lualatex']]) {
    const x = await pdfOf(`${name}-v1`, true)
    const said = `${read(`${name}-v1`, 'log', 'latin1') ?? ''}\n${readFileSync(join(dir, `${name}-v1`, 'term.txt'), 'latin1')}`
    const m = x ? await layoutMarksOf(x.pdf, said, { engine }) : null
    await x?.task.destroy()
    const lines = said.split('\n').filter(l => /axt-h\d+s/.test(l) && /dup|already|same/i.test(l)).slice(0, 2)
    check(`a name set twice is dropped under ${engine}`, !!m?.dropped.includes(`h${i}s`), JSON.stringify({ dropped: m?.dropped, lines }))
  }
}
{
  // every call carries its opening mark: a note of one letter is a call, and a second call is marked where the probe
  // says a mark between two calls changes nothing, which footmisc [multiple] does not contradict (nothing moves)
  const key = name => `stay-${name.replace(/[^A-Za-z0-9]+/g, '-')}-v1`
  const calls = async name => { const r = await pdfOf(key(name)); return r ? [...r.dests.keys()].filter(k => /^n\d+\.\d+a$/.test(k)).length : -1 }
  const plain = await calls('a footnote of one letter, and two calls in a row'), multiple = await calls('two calls in a row under footmisc [multiple]')
  // the plain document's 16 phrases: 4 one-letter calls, 8 calls in pairs, 8 in pairs before a full stop, none on the last
  check('every footnote call is marked, a note of one letter and the second of two included', plain === 20, `${plain} opening marks, 20 calls`)
  // 20 calls: 8 in pairs of whole notes, 8 in pairs of one letter, 4 alone
  check('under footmisc [multiple] too, every call is marked', multiple === 20, `${multiple} opening marks, 20 calls`)
}
{
  const r = await pdfOf('caps-v1')
  const i = capsPaper.units.findIndex(u => u.kind === 'heading')
  check('a heading set in capitals keeps its marks\' names', !!r?.dests.has(`h${i}s`) && !!r?.dests.has(`h${i}e`) && [...(r?.dests.keys() ?? [])].every(k => !/[A-Z]/.test(k)), JSON.stringify([...(r?.dests.keys() ?? [])]))
}
{
  const [a, b] = [await pdfOf('super-stop-v0'), await pdfOf('super-stop-v1')]
  const m = a && b ? moved(a, b) : ['no PDF']
  console.log(`note cite.sty [super], a citation before a full stop or a comma, without the paper's switch: ${m.length ? `${m.length} items moved, e.g. ${m.slice(0, 2).join('; ')}` : 'ok'}`)
}
for (const [job, label] of [['natmove-stop', "natbib [super] with natmove, a citation before a full stop or a comma"]]) {
  const [a, b] = [await pdfOf(`${job}-v0`), await pdfOf(`${job}-v1`)]
  const m = a && b ? moved(a, b) : ['no PDF']
  console.log(`note ${label}, without the paper's switch: ${m.length ? `${m.length} items moved, e.g. ${m.slice(0, 2).join('; ')}` : 'ok'}`)
}

if (!process.env.KEEP) rmSync(dir, { recursive: true, force: true })
else console.log(`kept ${dir}`)
console.log(failed ? `${failed} failed` : 'all ok')
process.exit(failed ? 1 : 0)
