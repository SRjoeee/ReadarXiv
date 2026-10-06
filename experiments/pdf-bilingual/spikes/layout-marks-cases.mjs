// experiments/pdf-bilingual/spikes/layout-marks-cases.mjs
// The layout marks under TeX (src/pdf-reader/engine/layout/marks.mjs, LAYOUT_TEX and layoutMarking): small documents
// compiled natively in Docker, each one twice — v0, the marked original as the run makes it today (live.mjs
// originalFiles with lines), and v1, the same with the layout marks of every class — each case one way a mark could move
// a line of a paper, set a mark where the body does not set the text, or change what TeX writes to a file. pdfLaTeX
// unless a case names another engine. Exits non-zero on a failure; a finding (XeTeX's cells) is printed, never failed.
// The stream's own cases (Task 6b): the documents of the stream spike, each with its points and without them, under
// pdfLaTeX and XeLaTeX (and one under LuaLaTeX, a note): every glyph, box and destination where it was, the marks file
// the same but for its new fields, and each named piece's own ink by its points (layout/stream.mjs), checked by its
// characters and rules.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/layout-marks-cases.mjs            (ONLY=stream: the stream's cases alone)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { lastTexLog, latin1, latin1Bytes } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { pageInk } from '../../../src/pdf-reader/engine/layout/ink.mjs'
import { classOf, encodeLayoutMarks, layoutMarking, layoutMarksOf, MARK_CLASSES, POINTS_TEX, probeSamples, readMarkProbe } from '../../../src/pdf-reader/engine/layout/marks.mjs'
import { OWNED, OWNED_HOW } from '../../../src/pdf-reader/engine/layout/stream.mjs'
import { openPaper, originalFiles, probeFiles } from '../../../src/pdf-reader/engine/live.mjs'

let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }
/** the stream's own cases alone */
const STREAM_ONLY = process.env.ONLY === 'stream'
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
  if (STREAM_ONLY && !name.startsWith('stream-')) return paper
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
    const switches = q.own ? readMarkProbe(read(`${q.name}-probe`, 'log', 'latin1') ?? '', probeSamples(q.paper.units)) : {}
    q.switches = switches
    for (const v of q.variants) {
      const d = join(dir, `${q.name}-${v}`)
      mkdirSync(d, { recursive: true })
      // v1np: v1 with no points, LAYOUT_TEX as it was before them
      for (const [path, bytes] of originalFiles(q.paper, v === 'v0' ? { lines: true } : { lines: true, layout: MARK_CLASSES, switches })) writeFileSync(join(d, path), v === 'v1np' && path === 'main.tex' ? latin1Bytes(latin1(bytes).replace(POINTS_TEX, '')) : bytes)
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


// ---------------------------------------------------------------- the stream (Task 6b): each piece's own ink by its points
/** the stream spike's documents: A, a page of every kind of piece (sums with limits, fractions, radicals, scripts,
 *  delimiters, citations, references, code, a url, footnotes, align, a display across a page, a table, a float, a margin
 *  note, an [h] float); B, short two-column pages with cite.sty's super-citations; C, short two-column pages where
 *  formulas cross lines, columns and a page, between footnotes and running heads; D, formulas across a line after a
 *  margin note, an [h] float, a \\vadjust and a footnote */
const STREAM = {
  A: String.raw`\documentclass{article}
\usepackage{amsmath}
\usepackage{url}
\allowdisplaybreaks
\newcommand{\bert}{BERT}
\pagestyle{headings}
\begin{document}
\section{Introduction}\label{sec:intro}

The sum $\sum_{i=1}^{n} x_i$ is set in text style, with its limits as scripts, and the
same sum in display style $\displaystyle\sum_{i=0}^{n} A_i=-A_\infty$ has its limits above and below.

A scaled dot product $q\cdot k=\sum_{i=1}^{d_k}q_ik_i$ is divided by $\frac{1}{\sqrt{d_k}}$ and the
radius is $\sqrt{x^2+y^2}$ while $(z-z_i)^{A^{(i)}_0}$ and $e^{-i\frac{\pi}{2}\nu}=X_-$ have raised scripts.

Delimiters grow with $\left( \frac{a}{b} \right]$ and the model \bert{} is cited as \cite{vaswani} or \cite{he,vaswani}, see Section~\ref{sec:intro} and Eq.~\eqref{eq:one}, code \texttt{f(x)} and \url{https://arxiv.org}.

This sentence is written long enough that the formula at its end must be broken across two lines by TeX, namely $a_1+a_2+a_3+a_4+a_5+a_6+a_7+a_8+a_9+a_{10}+a_{11}+a_{12}+a_{13}+a_{14}$ and then it goes on with words.

A footnote call follows here\footnote{The footnote has a formula $f^2(x)$ in it.} and the text goes on, and $y^2$ after it.

\begin{equation}\label{eq:one}
\sum_{i=1}^{n} \frac{a_i}{b_i} = \int_0^1 f(x)\,dx
\end{equation}
and the paragraph resumes after the display with $z$.
\begin{align}
a &= b + c \label{eq:two}\\
d &= \frac{e}{f} + \sqrt{g}\\
h &= \left[ i + j \right]
\end{align}

\begin{table}[t]
\centering
\begin{tabular}{lc}
Name & Value\\
$\alpha_1$ & $\beta^{2}_{k}$\\
rate & $10^{-3}$
\end{tabular}
\caption{A table whose caption holds $\gamma_t$ and a cite \cite{he}.}
\end{table}

This paragraph has a margin note\marginpar{Note $m_1$ here} placed in its first line and an inline formula across the line break: $b_1+b_2+b_3+b_4+b_5+b_6+b_7+b_8+b_9+b_{10}+b_{11}+b_{12}$ and words.

This paragraph has a here-float in its middle,
\begin{figure}[h]\centering\fbox{\rule{0pt}{20pt}box}\caption{Figure caption $\delta$.}\end{figure}
and an inline formula across the line break: $c_1+c_2+c_3+c_4+c_5+c_6+c_7+c_8+c_9+c_{10}+c_{11}+c_{12}+c_{13}$ and words.

A long aligned display crosses the page:
\begin{align}
x_{1} &= y_{1} + z_{1}\\ x_{2} &= y_{2} + z_{2}\\ x_{3} &= y_{3} + z_{3}\\ x_{4} &= y_{4} + z_{4}\\
x_{5} &= y_{5} + z_{5}\\ x_{6} &= y_{6} + z_{6}\\ x_{7} &= y_{7} + z_{7}\\ x_{8} &= y_{8} + z_{8}\\
x_{9} &= y_{9} + z_{9}\\ x_{10} &= y_{10} + z_{10}\\ x_{11} &= y_{11} + z_{11}\\ x_{12} &= y_{12} + z_{12}\\
x_{13} &= y_{13} + z_{13}\\ x_{14} &= y_{14} + z_{14}\\ x_{15} &= y_{15} + z_{15}\\ x_{16} &= y_{16} + z_{16}\\
x_{17} &= y_{17} + z_{17}\\ x_{18} &= y_{18} + z_{18}\\ x_{19} &= y_{19} + z_{19}\\ x_{20} &= y_{20} + z_{20}\\
x_{21} &= y_{21} + z_{21}\\ x_{22} &= y_{22} + z_{22}\\ x_{23} &= y_{23} + z_{23}\\ x_{24} &= y_{24} + z_{24}\\
x_{25} &= y_{25} + z_{25}\\ x_{26} &= y_{26} + z_{26}\\ x_{27} &= y_{27} + z_{27}\\ x_{28} &= y_{28} + z_{28}\\
x_{29} &= y_{29} + z_{29}\\ x_{30} &= y_{30} + z_{30}\\ x_{31} &= y_{31} + z_{31}\\ x_{32} &= y_{32} + z_{32}\\
x_{33} &= y_{33} + z_{33}\\ x_{34} &= y_{34} + z_{34}\\ x_{35} &= y_{35} + z_{35}\\ x_{36} &= y_{36} + z_{36}
\end{align}
and the text after the long display\footnote{A second footnote on the page.}.

\begin{thebibliography}{9}
\bibitem{vaswani} A. Vaswani. Attention is all you need. 2017.
\bibitem{he} K. He. Deep residual learning. 2016.
\end{thebibliography}
\end{document}
`,
  B: String.raw`\documentclass[twocolumn]{article}
\usepackage[paperwidth=7in,paperheight=3.2in,margin=0.45in,headsep=6pt,headheight=10pt,footskip=14pt]{geometry}
\usepackage{amsmath}
\usepackage[super]{cite}
\allowdisplaybreaks
\pagestyle{myheadings}\markright{Running head words}
\begin{document}
Short pages make every long thing cross a break. Here is an inline formula $p_1+p_2+p_3+p_4+p_5+p_6+p_7+p_8+p_9$ and more words to fill the column so that it ends, with a footnote\footnote{Footnote text $u^2$ at the foot.} and a super citation \cite{one} then the text goes on.

Another paragraph of words and words and words and words and words and words and words with $q_1+q_2+q_3+q_4+q_5+q_6+q_7+q_8+q_9+q_{10}$ again words and words and words and words and words, and $r_1+r_2+r_3+r_4+r_5+r_6+r_7+r_8+r_9+r_{10}+r_{11}$ and words and words and words, and $s_1+s_2+s_3+s_4+s_5+s_6+s_7+s_8+s_9+s_{10}+s_{11}$ more words to end it, and $t_1+t_2+t_3+t_4+t_5+t_6+t_7+t_8+t_9+t_{10}+t_{11}$ the end.
\begin{align}
m_{1} &= n_{1}\\ m_{2} &= n_{2}\\ m_{3} &= n_{3}\\ m_{4} &= n_{4}\\ m_{5} &= n_{5}\\ m_{6} &= n_{6}\\ m_{7} &= n_{7}\\ m_{8} &= n_{8}\\ m_{9} &= n_{9}\\ m_{10} &= n_{10}
\end{align}
and the text after the display, with a citation \cite{two} and words and words and words and words and words and words and words to fill a column and words and words and words and words.

\begin{thebibliography}{9}
\bibitem{one} First reference.
\bibitem{two} Second reference.
\end{thebibliography}
\end{document}
`,
  C: String.raw`\documentclass[twocolumn]{article}
\usepackage[paperwidth=6.5in,paperheight=3.4in,margin=0.45in,headsep=6pt,headheight=10pt,footskip=14pt]{geometry}
\usepackage{amsmath}
\allowdisplaybreaks
\pagestyle{myheadings}\markright{Running head words}
\begin{document}
Paragraph 1 words and more text fills the column $a_{1}+a_{2}+a_{3}+a_{4}+a_{5}+a_{6}+a_{7}+a_{8}+a_{9}$ words and more text fills the column so that\footnote{Note 1 with $w_0$.} words and more text fills $k_{1}+k_{2}+k_{3}+k_{4}+k_{5}+k_{6}+k_{7}+k_{8}$ end \cite{one}.

Paragraph 2 words and more text fills the column so that words and more $b_{1}+b_{2}+b_{3}+b_{4}+b_{5}+b_{6}+b_{7}+b_{8}+b_{9}+b_{10}$ words and more text fills the column so that words and more words and more text fills $k_{1}+k_{2}+k_{3}+k_{4}+k_{5}+k_{6}+k_{7}+k_{8}+k_{9}$ end \cite{one}.

\begin{align}
m_{0} &= n_{0} + \frac{1}{\sqrt{d_0}}\\
m_{1} &= n_{1} + \frac{1}{\sqrt{d_1}}\\
m_{2} &= n_{2} + \frac{1}{\sqrt{d_2}}\\
m_{3} &= n_{3} + \frac{1}{\sqrt{d_3}}\\
m_{4} &= n_{4} + \frac{1}{\sqrt{d_4}}\\
m_{5} &= n_{5} + \frac{1}{\sqrt{d_5}}\\
m_{6} &= n_{6} + \frac{1}{\sqrt{d_6}}\\
m_{7} &= n_{7} + \frac{1}{\sqrt{d_7}}
\end{align}
and the text after the display words and more text fills the column so.

Paragraph 3 words and more text fills the column so that words and more text fills the column so $c_{1}+c_{2}+c_{3}+c_{4}+c_{5}+c_{6}+c_{7}+c_{8}+c_{9}+c_{10}+c_{11}$ words and more text fills the column so that words and more text fills the words and more text fills $k_{1}+k_{2}+k_{3}+k_{4}+k_{5}+k_{6}+k_{7}+k_{8}+k_{9}+k_{10}$ end \cite{one}.

Paragraph 4 words and more text fills the column so that words and more text fills the column so that words and more text $d_{1}+d_{2}+d_{3}+d_{4}+d_{5}+d_{6}+d_{7}+d_{8}+d_{9}+d_{10}+d_{11}+d_{12}$ words and more text fills the column so that\footnote{Note 4 with $w_3$.} words and more text fills $k_{1}+k_{2}+k_{3}+k_{4}+k_{5}+k_{6}+k_{7}+k_{8}+k_{9}+k_{10}+k_{11}$ end \cite{one}.

Paragraph 5 words and more text fills the column so that words and more text fills the column so that words and more text fills the column so that $e_{1}+e_{2}+e_{3}+e_{4}+e_{5}+e_{6}+e_{7}+e_{8}+e_{9}$ words and more text fills the column so that words and more words and more text fills $k_{1}+k_{2}+k_{3}+k_{4}+k_{5}+k_{6}+k_{7}+k_{8}+k_{9}+k_{10}+k_{11}+k_{12}$ end \cite{one}.

Paragraph 6 words and more text fills the column $f_{1}+f_{2}+f_{3}+f_{4}+f_{5}+f_{6}+f_{7}+f_{8}+f_{9}+f_{10}$ words and more text fills the column so that words and more text fills the words and more text fills $k_{1}+k_{2}+k_{3}+k_{4}+k_{5}+k_{6}+k_{7}+k_{8}$ end \cite{one}.

\begin{align}
m_{0} &= n_{0} + \frac{1}{\sqrt{d_0}}\\
m_{1} &= n_{1} + \frac{1}{\sqrt{d_1}}\\
m_{2} &= n_{2} + \frac{1}{\sqrt{d_2}}\\
m_{3} &= n_{3} + \frac{1}{\sqrt{d_3}}\\
m_{4} &= n_{4} + \frac{1}{\sqrt{d_4}}\\
m_{5} &= n_{5} + \frac{1}{\sqrt{d_5}}\\
m_{6} &= n_{6} + \frac{1}{\sqrt{d_6}}\\
m_{7} &= n_{7} + \frac{1}{\sqrt{d_7}}\\
m_{8} &= n_{8} + \frac{1}{\sqrt{d_8}}\\
m_{9} &= n_{9} + \frac{1}{\sqrt{d_9}}\\
m_{10} &= n_{10} + \frac{1}{\sqrt{d_10}}\\
m_{11} &= n_{11} + \frac{1}{\sqrt{d_11}}
\end{align}
and the text after the display words and more text fills the column so.

Paragraph 7 words and more text fills the column so that words and more $g_{1}+g_{2}+g_{3}+g_{4}+g_{5}+g_{6}+g_{7}+g_{8}+g_{9}+g_{10}+g_{11}$ words and more text fills the column so that\footnote{Note 7 with $w_6$.} words and more text fills $k_{1}+k_{2}+k_{3}+k_{4}+k_{5}+k_{6}+k_{7}+k_{8}+k_{9}$ end \cite{one}.

\begin{figure}[t]\centering\fbox{box}\caption{A float with $\phi$.}\end{figure}

Paragraph 8 words and more text fills the column so that words and more text fills the column so $h_{1}+h_{2}+h_{3}+h_{4}+h_{5}+h_{6}+h_{7}+h_{8}+h_{9}+h_{10}+h_{11}+h_{12}$ words and more text fills the column so that words and more words and more text fills $k_{1}+k_{2}+k_{3}+k_{4}+k_{5}+k_{6}+k_{7}+k_{8}+k_{9}+k_{10}$ end \cite{one}.

Paragraph 9 words and more text fills the column so that words and more text fills the column so that words and more text $i_{1}+i_{2}+i_{3}+i_{4}+i_{5}+i_{6}+i_{7}+i_{8}+i_{9}$ words and more text fills the column so that words and more text fills the words and more text fills $k_{1}+k_{2}+k_{3}+k_{4}+k_{5}+k_{6}+k_{7}+k_{8}+k_{9}+k_{10}+k_{11}$ end \cite{one}.

Paragraph 10 words and more text fills the column so that words and more text fills the column so that words and more text fills the column so that $j_{1}+j_{2}+j_{3}+j_{4}+j_{5}+j_{6}+j_{7}+j_{8}+j_{9}+j_{10}$ words and more text fills the column so that\footnote{Note 10 with $w_9$.} words and more text fills $k_{1}+k_{2}+k_{3}+k_{4}+k_{5}+k_{6}+k_{7}+k_{8}+k_{9}+k_{10}+k_{11}+k_{12}$ end \cite{one}.

\begin{align}
m_{0} &= n_{0} + \frac{1}{\sqrt{d_0}}\\
m_{1} &= n_{1} + \frac{1}{\sqrt{d_1}}\\
m_{2} &= n_{2} + \frac{1}{\sqrt{d_2}}\\
m_{3} &= n_{3} + \frac{1}{\sqrt{d_3}}\\
m_{4} &= n_{4} + \frac{1}{\sqrt{d_4}}\\
m_{5} &= n_{5} + \frac{1}{\sqrt{d_5}}\\
m_{6} &= n_{6} + \frac{1}{\sqrt{d_6}}\\
m_{7} &= n_{7} + \frac{1}{\sqrt{d_7}}\\
m_{8} &= n_{8} + \frac{1}{\sqrt{d_8}}\\
m_{9} &= n_{9} + \frac{1}{\sqrt{d_9}}\\
m_{10} &= n_{10} + \frac{1}{\sqrt{d_10}}\\
m_{11} &= n_{11} + \frac{1}{\sqrt{d_11}}\\
m_{12} &= n_{12} + \frac{1}{\sqrt{d_12}}\\
m_{13} &= n_{13} + \frac{1}{\sqrt{d_13}}\\
m_{14} &= n_{14} + \frac{1}{\sqrt{d_14}}\\
m_{15} &= n_{15} + \frac{1}{\sqrt{d_15}}
\end{align}
and the text after the display words and more text fills the column so.

Paragraph 11 words and more text fills the column $k_{1}+k_{2}+k_{3}+k_{4}+k_{5}+k_{6}+k_{7}+k_{8}+k_{9}+k_{10}+k_{11}$ words and more text fills the column so that words and more words and more text fills $k_{1}+k_{2}+k_{3}+k_{4}+k_{5}+k_{6}+k_{7}+k_{8}$ end \cite{one}.

Paragraph 12 words and more text fills the column so that words and more $l_{1}+l_{2}+l_{3}+l_{4}+l_{5}+l_{6}+l_{7}+l_{8}+l_{9}+l_{10}+l_{11}+l_{12}$ words and more text fills the column so that words and more text fills the words and more text fills $k_{1}+k_{2}+k_{3}+k_{4}+k_{5}+k_{6}+k_{7}+k_{8}+k_{9}$ end \cite{one}.

Paragraph 13 words and more text fills the column so that words and more text fills the column so $m_{1}+m_{2}+m_{3}+m_{4}+m_{5}+m_{6}+m_{7}+m_{8}+m_{9}$ words and more text fills the column so that\footnote{Note 13 with $w_12$.} words and more text fills $k_{1}+k_{2}+k_{3}+k_{4}+k_{5}+k_{6}+k_{7}+k_{8}+k_{9}+k_{10}$ end \cite{one}.

Paragraph 14 words and more text fills the column so that words and more text fills the column so that words and more text $n_{1}+n_{2}+n_{3}+n_{4}+n_{5}+n_{6}+n_{7}+n_{8}+n_{9}+n_{10}$ words and more text fills the column so that words and more words and more text fills $k_{1}+k_{2}+k_{3}+k_{4}+k_{5}+k_{6}+k_{7}+k_{8}+k_{9}+k_{10}+k_{11}$ end \cite{one}.

\begin{align}
m_{0} &= n_{0} + \frac{1}{\sqrt{d_0}}\\
m_{1} &= n_{1} + \frac{1}{\sqrt{d_1}}\\
m_{2} &= n_{2} + \frac{1}{\sqrt{d_2}}\\
m_{3} &= n_{3} + \frac{1}{\sqrt{d_3}}\\
m_{4} &= n_{4} + \frac{1}{\sqrt{d_4}}\\
m_{5} &= n_{5} + \frac{1}{\sqrt{d_5}}\\
m_{6} &= n_{6} + \frac{1}{\sqrt{d_6}}\\
m_{7} &= n_{7} + \frac{1}{\sqrt{d_7}}\\
m_{8} &= n_{8} + \frac{1}{\sqrt{d_8}}\\
m_{9} &= n_{9} + \frac{1}{\sqrt{d_9}}\\
m_{10} &= n_{10} + \frac{1}{\sqrt{d_10}}\\
m_{11} &= n_{11} + \frac{1}{\sqrt{d_11}}\\
m_{12} &= n_{12} + \frac{1}{\sqrt{d_12}}\\
m_{13} &= n_{13} + \frac{1}{\sqrt{d_13}}\\
m_{14} &= n_{14} + \frac{1}{\sqrt{d_14}}\\
m_{15} &= n_{15} + \frac{1}{\sqrt{d_15}}\\
m_{16} &= n_{16} + \frac{1}{\sqrt{d_16}}\\
m_{17} &= n_{17} + \frac{1}{\sqrt{d_17}}\\
m_{18} &= n_{18} + \frac{1}{\sqrt{d_18}}\\
m_{19} &= n_{19} + \frac{1}{\sqrt{d_19}}
\end{align}
and the text after the display words and more text fills the column so.

\begin{thebibliography}{9}
\bibitem{one} First reference.
\end{thebibliography}
\end{document}
`,
  D: String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
Margin: Words to fill the line before it so that the formula starts near the end of the line and breaks, here\marginpar{Margin note text} $a_{1}+a_{2}+a_{3}+a_{4}+a_{5}+a_{6}+a_{7}+a_{8}+a_{9}+a_{10}+a_{11}+a_{12}+a_{13}+a_{14}+a_{15}+a_{16}$ and words after.

Here-float: Words to fill the line before it so that the formula starts near the end of the line and breaks, here \begin{figure}[h]\centering\fbox{Float body text}\caption{Caption with $\phi$.}\end{figure}$b_{1}+b_{2}+b_{3}+b_{4}+b_{5}+b_{6}+b_{7}+b_{8}+b_{9}+b_{10}+b_{11}+b_{12}+b_{13}+b_{14}+b_{15}+b_{16}$ and words after.

Vadjust: Words to fill the line before it so that the formula starts near the end of the line and breaks, here\vadjust{\hbox{Vadjust box text}} $c_{1}+c_{2}+c_{3}+c_{4}+c_{5}+c_{6}+c_{7}+c_{8}+c_{9}+c_{10}+c_{11}+c_{12}+c_{13}+c_{14}+c_{15}+c_{16}$ and words after.

Footnote: Words to fill the line before it so that the formula starts near the end of the line and breaks, here\footnote{Footnote text.} $d_{1}+d_{2}+d_{3}+d_{4}+d_{5}+d_{6}+d_{7}+d_{8}+d_{9}+d_{10}+d_{11}+d_{12}+d_{13}+d_{14}+d_{15}+d_{16}$ and words after.
\end{document}
`,
}
const streamKey = (name, engine) => `stream-${name}-${engine}`
const streams = []
for (const [name, src] of Object.entries(STREAM)) for (const engine of ['pdflatex', 'xelatex']) streams.push({ key: streamKey(name, engine), name, engine, paper: queue(streamKey(name, engine), src, { engine, variants: ['v1', 'v1np'] }) })
// LuaTeX's PDF writer sets the glyphs after a literal by an absolute matrix: a note of how far (the ruling: ≤ ~0.011 pt)
const luaStream = { key: streamKey('A', 'lualatex'), name: 'A', engine: 'lualatex', paper: queue(streamKey('A', 'lualatex'), STREAM.A, { engine: 'lualatex', variants: ['v1', 'v1np'] }) }

prepare()
console.log(`compiling ${jobs.length} documents in ${dir}, after ${queued.filter(q => q.own && q.variants.includes('v1')).length} mark probes`)
compileAll(jobs)

// ---------------------------------------------------------------- the checks
if (!STREAM_ONLY) {
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

}

// ---------------------------------------------------------------- the stream's checks
/** a compile's ink by its operator lists (pageInk, the points among it) and its axt- destinations, its document kept */
async function inkOf(name) {
  const bytes = read(name, 'pdf')
  if (!bytes?.length) return null
  const task = getDocument({ data: new Uint8Array(bytes), verbosity: 0 }), pdf = await task.promise, pages = [], dests = []
  for (let n = 1; n <= pdf.numPages; n++) { const pg = await pdf.getPage(n); pages.push(pageInk(OPS, await pg.getOperatorList(), pg.commonObjs, { rotate: pg.rotate })) }
  for (const [full, d] of await pdf.getDestinations()) if (full.startsWith('axt-')) dests.push([full, (await pdf.getPageIndex(d[0])) + 1, d[2], d[3]])
  dests.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
  return { pdf, task, pages, dests }
}
/** two compiles' glyphs and boxes by index: the largest difference of a glyph's x0, x1, baseline or size and of a box's
 *  edge, how many past 0.001 pt; or why they cannot be compared */
function inkDiff(a, b) {
  if (a.pages.length !== b.pages.length) return { why: `${a.pages.length} pages, ${b.pages.length}` }
  let worst = 0, over = 0, glyphs = 0
  for (let p = 0; p < a.pages.length; p++) {
    const A = a.pages[p], B = b.pages[p]
    if (A.glyphs.length !== B.glyphs.length || A.boxes.length !== B.boxes.length) return { why: `page ${p + 1}: ${A.glyphs.length}/${B.glyphs.length} glyphs, ${A.boxes.length / 4}/${B.boxes.length / 4} boxes` }
    for (let g = 0; g < A.glyphs.length; g++) {
      const x = A.glyphs[g], y = B.glyphs[g]
      if (x.u !== y.u) return { why: `page ${p + 1} glyph ${g}: ${JSON.stringify(x.u)} / ${JSON.stringify(y.u)}` }
      const d = Math.max(Math.abs(x.x0 - y.x0), Math.abs(x.x1 - y.x1), Math.abs(x.y - y.y), Math.abs(x.size - y.size))
      if (d > worst) worst = d
      if (d > 0.001) over++
      glyphs++
    }
    for (let i = 0; i < A.boxes.length; i++) { const d = Math.abs(A.boxes[i] - B.boxes[i]); if (d > worst) worst = d; if (d > 0.001) over++ }
  }
  return { worst, over, glyphs }
}
/** a formula of terms as the glyphs give it, its rules: \\sqrt's sign and its bar, \\frac's numerator, bar and
 *  denominator, every script on the line, a minus sign TeX's */
const glyphsOf = src => {
  let rules = 0
  const t = src.replace(/\\label\{[^{}]*\}/g, '').replace(/\\sqrt\{([^{}]*)\}/g, (_, x) => { rules++; return `\u221a${x}` }).replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, x, y) => { rules++; return `${x}${y}` })
  return { s: t.replace(/\\(?:left|right)/g, '').replace(/[$_^{}&\s]/g, '').replace(/-/g, '\u2212'), rules }
}
/** an align's rows as the glyphs give them, each with its tag from `first` on */
const rowsOf = (src, first) => {
  const rows = src.replace(/^\\begin\{align\}|\\end\{align\}$/g, '').split('\\\\')
  const each = rows.map((r, i) => { const g = glyphsOf(r); return { s: `${g.s}(${first + i})`, rules: g.rules } })
  return { s: each.map(r => r.s).join(''), rules: each.reduce((n, r) => n + r.rules, 0) }
}
/** what each document's pieces own, by source (a footnote's call by its note's first words), in order: a string of
 *  characters and rules, or a function of the source and its occurrence, or `LOST:` and why it owns nothing; a source
 *  not listed is not checked. An open display across a page owns nothing (the ruling: its end not inferred) */
const OWN = {
  A: [
    ['$\\sum_{i=1}^{n} x_i$', '\u2211ni=1xi'], ['$\\displaystyle\\sum_{i=0}^{n} A_i=-A_\\infty$', 'n\u2211i=0Ai=\u2212A\u221e'], ['$q\\cdot k=\\sum_{i=1}^{d_k}q_ik_i$', 'q\u00b7k=\u2211dki=1qiki'],
    ['$\\frac{1}{\\sqrt{d_k}}$', '1\u221adk', 2], ['$\\sqrt{x^2+y^2}$', '\u221ax2+y2', 1], ['$(z-z_i)^{A^{(i)}_0}$', '(z\u2212zi)A(i)0'], ['$e^{-i\\frac{\\pi}{2}\\nu}=X_-$', 'e\u2212i\u03c02\u03bd=X\u2212', 1],
    ['$\\left( \\frac{a}{b} \\right]$', '(ab]', 1], ['\\cite{vaswani}', '[1]'], ['\\cite{he,vaswani}', '[2,1]'], ['\\ref{sec:intro}', '1'], ['\\eqref{eq:one}', '(1)'],
    ['\\texttt{f(x)}', 'f(x)'], ['\\url{https://arxiv.org}', 'https://arxiv.org'], ['call:The footnote has', '1'], ['$f^2(x)$', 'f2(x)'], ['$y^2$', 'y2'], ['$z$', 'z'],
    ['$\\alpha_1$', '\u03b11'], ['$\\beta^{2}_{k}$', '\u03b22k'], ['$10^{-3}$', '10\u22123'], ['$\\gamma_t$', '\u03b3t'], ['\\cite{he}', '[2]'],
    ['$a_1+', glyphsOf], ['$b_1+', glyphsOf], ['$c_1+', glyphsOf], ['call:A second footnote', '2'],
    ['\\begin{equation}', 'n\u2211i=1aibi=\u222b10f(x)dx(1)', 1], ['\\begin{align}\na &= b', src => rowsOf(src.trim(), 2)], ['\\begin{align}\nx_{1}', 'LOST:open, the next mark on another page'],
  ],
  B: [['$p_1+', glyphsOf], ['$q_1+', glyphsOf], ['$r_1+', glyphsOf], ['$s_1+', glyphsOf], ['$t_1+', glyphsOf], ['call:Footnote text', '1'], ['$u^2$', 'u2'], ['\\cite{one}', '1'], ['\\cite{two}', '2'], ['\\begin{align}', 'LOST:open, the next mark on another page']],
  // its aligns numbered on from 1, 9, 21 and 37
  C: [['$\\phi$', '\u03d5'], ['$', glyphsOf], ['\\cite{one}', '[1]'], ['call:Note ', null], ['\\begin{align}', (src, nth) => rowsOf(src.trim(), [1, 9, 21, 37][nth])]],
  D: [['$b_', glyphsOf], ['$', null]],
}
for (const s of [...streams, luaStream]) {
  const label = `the stream, ${s.name} (${s.engine})`
  const [a, b] = [await inkOf(`${s.key}-v1`), await inkOf(`${s.key}-v1np`)]
  if (!a || !b) { check(`${label}: compiled`, false, `no PDF (${a ? 'v1np' : 'v1'})`); continue }
  const d = inkDiff(a, b)
  const points = a.pages.reduce((n, p) => n + p.points.length, 0), brackets = a.pages.reduce((n, p) => n + p.points.filter(q => /^[bf][se]\d+$/.test(q.name)).length, 0)
  if (s.engine === 'lualatex') console.log(`note ${label}: ${d.why ?? `every glyph and box within ${d.worst.toFixed(4)} pt, ${d.over} past 0.001`}; destinations ${JSON.stringify(a.dests) === JSON.stringify(b.dests) ? 'the same' : 'differ'}`)
  else {
    // xdvipdfmx writes a glyph after a special by a position it reckons otherwise: up to 0.0013 pt on case A's margin
    // note since the float's points wrap its box, TeX's boxes the same (\tracingoutput)
    const tol = s.engine === 'xelatex' ? 0.002 : 0.001
    check(`${label}: every glyph and box within ${tol} pt of the compile with no point, every destination the same`, !d.why && d.worst <= tol && JSON.stringify(a.dests) === JSON.stringify(b.dests) && points > a.dests.length, JSON.stringify({ ...d, dests: [a.dests.length, b.dests.length], points }))
    if (!d.why && d.over) console.log(`note ${label}: ${d.over} glyphs or boxes past 0.001 pt, ${d.worst.toFixed(4)} at most`)
  }
  const log = n => read(n, 'log', 'latin1') ?? ''
  const units = s.paper.units
  const [m, plain, none] = [await layoutMarksOf(a.pdf, log(`${s.key}-v1`), { engine: s.engine, units, OPS }), await layoutMarksOf(b.pdf, log(`${s.key}-v1np`), { engine: s.engine }), await layoutMarksOf(b.pdf, log(`${s.key}-v1np`), { engine: s.engine, units, OPS })]
  if (s.engine !== 'lualatex') {
    // to its hundredths: a value on the file's rounding edge may round the other way
    const x = JSON.parse(encodeLayoutMarks({ ...m, chars: [], owned: [] })), y = JSON.parse(encodeLayoutMarks(plain))
    let edge = 0
    const same = (p, q) => (typeof p === 'number' && typeof q === 'number' ? (p === q || (Math.abs(p - q) <= 0.0100001 && ++edge > 0)) : Array.isArray(p) ? Array.isArray(q) && p.length === q.length && p.every((v, i) => same(v, q[i])) : p && typeof p === 'object' ? !!q && typeof q === 'object' && JSON.stringify(Object.keys(p)) === JSON.stringify(Object.keys(q)) && Object.keys(p).every(k => same(p[k], q[k])) : p === q)
    check(`${label}: the marks file the same but for each piece's own ink (to its hundredths)`, same(x, y), '')
    if (edge) console.log(`note ${label}: ${edge} value${edge > 1 ? 's' : ''} of the marks file a hundredth apart, a value on the rounding edge`)
    if (!d.why) console.log(`note ${label}: the largest difference of a glyph or a box ${d.worst.toExponential(1)} pt`)
  }
  for (const t of [a, b]) await t.task.destroy()
  // each named piece's own ink: its characters and its rules
  const byName = new Map(m.owned.map(e => [e[0], e]))
  // the pieces the marking marked (the probe's switch as v1 was compiled with): the others have no point by design
  const design = new Set()
  for (const c of layoutMarking(units, MARK_CLASSES, { lines: false, switches: queued.find(q => q.name === s.key)?.switches ?? {} }).units) for (const p of c.pieces) { const x = p.t === 'ph' && /^\\axtpma\{([pn]\d+\.\d+a)\}$/.exec(p.src ?? ''); if (x) design.add(x[1]) }
  const tally = {}, bad = [], seen = new Map()
  units.forEach((u, i) => u.pieces.forEach((p, k) => {
    const cls = classOf(p)
    if (!cls) return
    const name = `${cls === 'footnote' ? 'n' : 'p'}${i}.${k}a`, e = byName.get(name)
    const how = e ? OWNED_HOW[e[1]] : design.has(name) ? 'no point' : 'unmarked'
    tally[how] = (tally[how] ?? 0) + 1
    const src = p.t === 'nested' ? `call:${p.unit?.pieces?.find(q => q.t === 'text')?.s?.trim() ?? ''}` : String(p.src ?? '')
    // a key of a whole formula ($…$) the source itself, any other its start
    const rule = OWN[s.name].find(([at]) => (at.length > 1 && at.startsWith('$') && at.endsWith('$') ? src === at : src.startsWith(at)))
    if (!rule || rule[1] === null || how === 'unmarked') return
    const n = seen.get(rule[0]) ?? 0
    seen.set(rule[0], n + 1)
    if (typeof rule[1] === 'string' && rule[1].startsWith('LOST:')) { if (how !== rule[1].slice(5)) bad.push({ name, src: src.slice(0, 40), how, want: rule[1] }); return }
    const want = typeof rule[1] === 'function' ? rule[1](src, n) : { s: rule[1], rules: rule[2] ?? 0 }
    // the glyphs' characters, TeX Live 2026's variation selectors (∑ U+FE01) left out
    const got = e && e[1] < OWNED ? { s: Array.from({ length: e[2] }, (_, j) => m.chars[e[3 + 5 * j + 4]]).join('').replace(/\s|\p{Variation_Selector}/gu, ''), rules: (e.length - 3 - 5 * e[2]) / 5 } : null
    if (!got || got.s !== want.s || got.rules !== want.rules) bad.push({ name, src: src.slice(0, 40), how, got, want })
  }))
  const named = [...seen.values()].reduce((x, y) => x + y, 0)
  check(`${label}: each named piece owns its own glyphs and rules, nothing else`, !bad.length && named > 0, JSON.stringify(bad.slice(0, 6)))
  console.log(`note ${label}: ${points} points (${brackets} of brackets), ${named} pieces named; ${JSON.stringify(tally)}; with no point, ${none.owned.length} pieces own anything`)
  // A's display across a page: the stream holds its rows in order, the running foot and head and the footnote between
  // them outside the column bodies
  if (s.name === 'A') {
    const i = units.findIndex(u => u.pieces.some(p => String(p.src ?? '').startsWith('\\begin{align}\nx_{1}'))), k = units[i]?.pieces.findIndex(p => String(p.src ?? '').startsWith('\\begin{align}\nx_{1}'))
    let on = false, body = false, chars = '', all = ''
    for (const pg of a.pages) {
      let q = 0
      body = false
      for (let g = 0; g <= pg.glyphs.length; g++) {
        for (; q < pg.points.length && pg.points[q].glyph <= g; q++) { const n = pg.points[q].name; if (n === `p${i}.${k}a`) on = true; else if (/^bs\d+$/.test(n)) body = true; else if (/^be\d+$/.test(n)) body = false }
        if (on && g < pg.glyphs.length) { all += pg.glyphs[g].u; if (body) chars += pg.glyphs[g].u }
      }
    }
    const rows = rowsOf(units[i]?.pieces[k]?.src.trim() ?? '', 5).s, body0 = chars.replace(/\s|\p{Variation_Selector}/gu, '')
    check(`${label}: a display across a page, its rows in order in the stream, what TeX shipped between them outside the column bodies`, body0.startsWith(`${rows}andthetextafterthelongdisplay`) && !all.replace(/\s/g, '').startsWith(rows), JSON.stringify({ body: body0.slice(0, 80), all: all.slice(0, 80) }))
  }
}

if (!process.env.KEEP) rmSync(dir, { recursive: true, force: true })
else console.log(`kept ${dir}`)
console.log(failed ? `${failed} failed` : 'all ok')
process.exit(failed ? 1 : 0)
