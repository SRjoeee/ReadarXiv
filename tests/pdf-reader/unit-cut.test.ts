// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { PIPELINE_VERSION } from '@/pdf-reader/engine/pipeline/versions.mjs'

// The unit cut is a part of what PIPELINE_VERSION names (CLAUDE.md, hard rule 4): a translation is stored and found again by an
// output identity that names the pipeline, so that a unit cut otherwise under the same version is given a translation made for
// another cut. #435 (2c62b00e) cut 2610.19860's `\url{…}` as one placeholder where it had been a group around one, PIPELINE
// still 25, and staging gave unit 176 the row of its old seven pieces: the door dropped it (piece 5 of 5) and the unit stayed
// English. This golden is the cut of every unit of a few sources the repository holds (each unit's kind and its pieces' types,
// in order), recorded with the PIPELINE_VERSION it was recorded under: the cut moving under the same version fails, and so
// does a version moved with the cut not recorded again.
//
//   WRITE_UNIT_CUT=1 pnpm vitest run tests/pdf-reader/unit-cut.test.ts   records the cut again, under the version as it stands:
//                                                                        refused while the cut moved and the version did not
//
// The sources, each a unit cut the engine has had to get right, none rewritten for this test:
//   sample-1     tests/fixtures/pdf/sample-1/ (the CC0 sample paper): citations, a footnote, display math (equation, align,
//                \[…\]), a table, a theorem, a list, \href, \emph
//   llncs-url    layout-route-fallbacks.test.ts's 2610.19860 case as it stands: llncs.cls's fallback \url under hyperref, the
//                \newline before it and a formula after (the cut #435 moved)
//   text-read    PIPELINE 27's cuts (source-reader-text.test.ts): a macro that sets words of its own (2610.21547's \nb), a
//                Latin-1 file under its inputenc (2610.20581), a conditional the paper decides (2610.21098's \ifdefined)
//   arity        PIPELINE 28's cuts (heading-arity.test.ts): a group after a heading, a starred heading with a short title, a
//                \multirow of five arguments (2610.31660v1's stray brace, 2607.24653v2's \multirow)
//   bibliography PIPELINE 29's cuts (bibliography-units.test.ts): a .bbl's entries, natbib's author-year, IEEEtran's quoted
//                title, REVTeX's fields; an entry's numbers placeholders; and PIPELINE 30's: each entry one unit, whole
//   names        PIPELINE 29's name units (paper-names.test.ts): a paper's own theorem names and cleveref's, and where it calls
//                \cref the words no package names in some target (2610.18513v1's "Section", "and")
//   authors      PIPELINE 30's author blocks (author-places.test.ts): the names apart from the places, a row each, an \And block,
//                a numbered list of places, an \affil; what was one unit numbered as it was, the rows cut from it after the others
//   made-bbl     PIPELINE 30's \bibliography (made-bibliography.test.ts): the paragraph that runs into it ends there, the job's
//                .bbl BibTeX makes or none
// A source's structural names are its units too (bundleUnitsOf, after the source's): each recorded as `name: <its text>`

const enc = (s: string) => new TextEncoder().encode(s)
const SAMPLE = new URL('../fixtures/pdf/sample-1/', import.meta.url)
const LLNCS = '\\NeedsTeXFormat{LaTeX2e}\\ProvidesClass{llncs}\\LoadClass{article}\n\\AtBeginDocument{\\@ifundefined{url}{\\def\\url#1{#1}}{}}\n'
/** TeX's opening quotes, which a template literal cannot hold as they are */
const QUOTES = '``'
const UNIT_CUT_SOURCES: Record<string, () => Map<string, Uint8Array>> = {
  'sample-1': () => new Map(['main.tex', 'main.bbl', 'refs.bib'].map(name => [name, new Uint8Array(readFileSync(new URL(name, SAMPLE)))])),
  'llncs-url': () => new Map([
    ['main.tex', enc('\\documentclass{llncs}\n\\usepackage{hyperref}\n\\begin{document}\nThe code is available at\\newline\n\\url{https://github.com/a/b-c} with $x$.\n\\end{document}\n')],
    ['llncs.cls', enc(LLNCS)],
  ]),
  'text-read': () => new Map([
    ['main.tex', Uint8Array.from('\\def\\Preprint{1}\n\\documentclass{article}\n\\usepackage[latin1]{inputenc}\n\\newcommand{\\nb}[1]{Notebook~#1}\n\\begin{document}\nThe notebooks (\\nb{4}--\\nb{6}) of the Universit\xe9 run.\n\n\\ifdefined\\Preprint\nThe public code is at \\url{a}.\n\\else\nAn anonymized copy is at \\url{b}.\n\\fi\nIt contains the generator.\n\\end{document}\n', c => c.charCodeAt(0))],
  ]),
  names: () => new Map([
    ['main.tex', enc('\\documentclass{article}\n\\usepackage{amsthm,cleveref}\n\\newtheorem{conj}{Conjecture}\n\\crefname{conj}{conjecture}{conjectures}\n\\begin{document}\n\\section{Intro}\\label{s}\nAs \\cref{s} says.\n\\begin{conj}\\label{c}\nIt holds.\n\\end{conj}\n\\end{document}\n')],
  ]),
  arity: () => new Map([
    ['main.tex', enc('\\documentclass{article}\n\\begin{document}\n\\section{Approaches to $H_0$}\n{Measurements differ.\n\n\\section*[Short]{A long title}\n{\\bf Lead} words.\n\n\\begin{tabular}{cc}\n\\multirow[c]{2}{*}[-2pt]{Merged} & One \\\\\n& Two \\\\\n\\end{tabular}}\n\\end{document}\n')],
  ]),
  bibliography: () => new Map([
    ['main.tex', enc('\\documentclass{article}\n\\usepackage{natbib}\n\\begin{document}\nWords \\citep{a} and \\citep{b}.\n\n\\bibliography{refs}\n\\end{document}\n')],
    ['main.bbl', enc(String.raw`\begin{thebibliography}{3}
\providecommand{\natexlab}[1]{#1}

\bibitem[{Ando and Zhang(2005)}]{a}
Rie~Kubota Ando and Tong Zhang. 2005.
\newblock A framework for learning.
\newblock \emph{Journal of Machine Learning Research}, 6(Nov):1817--1853.

\bibitem{b}
C.~Wang and S.~Shang, ${QUOTES}Building pipelines,'' in \emph{Proc. ACM}, 2025, pp. 1230--1233.

\bibitem [{\citenamefont {Davis}(1971)}]{c}%
  \BibitemOpen
  \bibfield  {author} {\bibinfo {author} {\bibfnamefont {M.}~\bibnamefont {Davis}},\ }\bibinfo {journal} {Phys. Rev. Lett.}\ \textbf {\bibinfo {volume} {27}} (\bibinfo {year} {1971})\BibitemShut {NoStop}%
\end{thebibliography}
`)],
  ]),
  authors: () => new Map([
    ['main.tex', enc('\\documentclass{article}\n\\author{Alice Smith\\thanks{Equal.} \\\\ Google Brain \\\\ \\texttt{alice@g.com} \\And Bob Jones$^{1}$ \\\\ $^{1}$University of Somewhere}\n\\affil{Institute of Elsewhere}\n\\begin{document}\n\\maketitle\nThe body.\n\\end{document}\n')],
  ]),
  'made-bbl': () => new Map([
    ['main.tex', enc('\\documentclass{article}\n\\begin{document}\nNormalization helps \\cite{ba}.\nThe paragraph runs into it.\n\\bibliographystyle{plain}\n\\bibliography{refs}\n\\end{document}\n')],
    ['refs.bib', enc('@article{ba, author={Jimmy Lei Ba}, title={Layer normalization}, year={2016}}\n')],
  ]),
}
const GOLDEN = new URL('./golden/unit-cut.json', import.meta.url)
type Cut = Record<string, string[]>
/** each unit of a source as `kind: type,type,…` (its pieces' types in order: text, ph, open, close, nested) */
const cutOf = (): Cut => Object.fromEntries(Object.entries(UNIT_CUT_SOURCES).map(([name, files]) => {
  const p = openPaper(files())
  return [name, [...(p.units as { kind: string; pieces: { t: string }[] }[]).map(u => `${u.kind}: ${u.pieces.map(q => q.t).join(',')}`), ...p.names.map(s => `name: ${s}`)]]
}))
/** the sources whose cut differs from the recorded one, and the first unit that does in each */
function moved(now: Cut, was: Cut): string[] {
  const out: string[] = []
  for (const name of new Set([...Object.keys(now), ...Object.keys(was)])) {
    const a = was[name] ?? [], b = now[name] ?? []
    const at = Array.from({ length: Math.max(a.length, b.length) }, (_, i) => i).find(i => a[i] !== b[i])
    if (at !== undefined) out.push(`${name} unit ${at}: ${a[at] ?? '(none)'} -> ${b[at] ?? '(none)'}`)
  }
  return out
}

describe('the unit cut is recorded under the PIPELINE_VERSION it was cut by', () => {
  it('the recorded cut is today\'s, under today\'s PIPELINE_VERSION: a cut that moves raises the version', () => {
    const now = cutOf()
    const golden = (existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, 'utf8')) : { pipeline: null, units: {} }) as { pipeline: string | null; units: Cut }
    const diff = moved(now, golden.units)
    const same = golden.pipeline === PIPELINE_VERSION
    if (process.env.WRITE_UNIT_CUT === '1') {
      if (diff.length && same) throw new Error(`the unit cut moved under PIPELINE_VERSION ${PIPELINE_VERSION}: raise PIPELINE_VERSION (pipeline/versions.mjs) before recording it again\n${diff.join('\n')}`)
      writeFileSync(GOLDEN, `${JSON.stringify({ pipeline: PIPELINE_VERSION, units: now }, null, 1)}\n`)
      return
    }
    if (same) expect(diff, `the unit cut moved under PIPELINE_VERSION ${PIPELINE_VERSION}: a translation stored for the old cut would be given to the new one. Raise PIPELINE_VERSION (pipeline/versions.mjs), then record the cut again (WRITE_UNIT_CUT=1)`).toEqual([])
    else expect(golden.pipeline, `PIPELINE_VERSION is ${PIPELINE_VERSION}, the cut was recorded under ${golden.pipeline}: record it again (WRITE_UNIT_CUT=1)`).toBe(PIPELINE_VERSION)
  })

  it('the sources hold the cuts they are here for: a citation, a footnote, display math, a table, a \\url', () => {
    const now = cutOf()
    const kinds = new Set(now['sample-1']?.map(u => u.split(':')[0]))
    for (const k of ['para', 'footnote', 'cell', 'caption', 'theorem', 'heading']) expect(kinds.has(k), k).toBe(true)
    const sources = JSON.stringify((openPaper(UNIT_CUT_SOURCES['sample-1']!()).units as { pieces: { src?: string }[] }[]).flatMap(u => u.pieces.map(p => p.src ?? '')))
    for (const s of ['\\\\cite{', '\\\\begin{equation}', '\\\\begin{align}', '\\\\[', '\\\\href{']) expect(sources.includes(s), s).toBe(true)
    // (#435's cut: the \url one placeholder, the \newline one before it)
    expect(now['llncs-url']).toEqual(['para: text,ph,text,ph,text,ph,text'])
    // (PIPELINE 28's: the group after each heading the text's, the \multirow's content a cell's pair)
    expect(now['arity']?.slice(0, 5).map(u => u.split(':')[0])).toEqual(['heading', 'para', 'heading', 'para', 'cell'])
    expect(now['arity']?.[4]).toBe('cell: open,text,close,text')
    // (PIPELINE 30's: each entry one unit, whole, the sample's three and the .bbl's three)
    expect(now['sample-1']?.filter(u => !u.startsWith('name: ')).slice(-3).map(u => u.split(':')[0])).toEqual(['reference', 'reference', 'reference'])
    expect(now['sample-1']?.filter(u => !u.startsWith('name: ')).slice(-4, -3).map(u => u.split(':')[0])).not.toEqual(['reference'])
    // (and PIPELINE 29's name units, after the source's: the sample's theorem names)
    expect(now['sample-1']?.filter(u => u.startsWith('name: '))).toEqual(['name: Theorem', 'name: Lemma', 'name: Definition'])
    expect(now['bibliography']?.slice(1).map(u => u.split(':')[0])).toEqual(['reference', 'reference', 'reference'])
    // (PIPELINE 30's author blocks: what was one unit keeps its number in the first unit cut from it, of either kind; the others
    // after the source's other units)
    expect(now['authors']?.map(u => u.split(':')[0])).toEqual(['author', 'footnote', 'affiliation', 'affiliation', 'para', 'author', 'affiliation'])
    // (and its \\bibliography: the paragraph before it ends there, no placeholder of it; \\bibliographystyle before it the
    // paragraph's, with the .bbl or without)
    expect(now['made-bbl']).toEqual(['para: text,ph,text,ph,text'])
  })
})
