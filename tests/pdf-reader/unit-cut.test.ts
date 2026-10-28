// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { inkUnitsOf } from '@/pdf-reader/engine/layout/ink-units.mjs'
import { type LedgerPage, ledgerOf } from '@/pdf-reader/engine/layout/ledger.mjs'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { PIPELINE_VERSION } from '@/pdf-reader/engine/pipeline/versions.mjs'
import { wrapped } from './helpers/ocg-pdfs'

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
// A source's structural names are its units too (bundleUnitsOf, after the source's): each recorded as `name: <its text>`.
// So are the units the wrap cuts of our pages after them (PIPELINE 31): the ink units (layout/ink-units.mjs) of a few pages written
// here, each recorded whole (kind, echo, its pieces' text and sources), and the figure units of the figures fixture
// (tests/fixtures/pdf/figures/, layout/figure-text.mjs), each by its text: an ink or a figure unit's cut moving under the same
// version fails as a source unit's does (LAYOUT 23 and 25 moved the ink units under PIPELINE 30)

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
// ---- the ink units' sources: pages of glyphs as the wrap reads them (5 pt a character, on a baseline), the ledger's classes
type G = LedgerPage['glyphs'][number] & { top: number; bottom: number; ix0: number; ix1: number }
function inkRun(text: string, x: number, y: number, { font = 'CMR10', size = 10, fill = 0, space = 5 }: { font?: string; size?: number; fill?: number; space?: number } = {}): G[] {
  const out: G[] = []
  for (const ch of text) {
    if (ch !== ' ') out.push({ u: ch, x0: x, x1: x + 5, ix0: x, ix1: x + 5, y, top: y + 7, bottom: y - 2, size, font, fill } as G)
    x += ch === ' ' ? space : 5
  }
  return out
}
type Part = { glyphs: G[] } | { point: string } | { para: number }
function inkPage(...parts: Part[]) {
  const glyphs: G[] = [], own: null[] = [], points: { name: string; glyph: number; box: number }[] = [], paras: { name: string; glyph: number; box: number }[] = []
  for (const p of parts) {
    if ('point' in p) points.push({ name: p.point, glyph: glyphs.length, box: 0 })
    else if ('para' in p) paras.push({ name: `q${p.para}`, glyph: glyphs.length, box: 0 })
    else for (const g of p.glyphs) { glyphs.push(g); own.push(null) }
  }
  return { page: { glyphs, boxes: [], points, paras, view: [0, 0, 612, 792] }, own }
}
const HEADING = [{ kind: 'heading', pieces: [{ t: 'text', s: 'Introduction' }] }, { kind: 'para', pieces: [{ t: 'text', s: 'Body words of the paper here' }] }]
const INK_CUT_SOURCES: Record<string, () => { pages: ReturnType<typeof inkPage>[]; units: unknown[] }> = {
  // a contents entry echoing its heading, another over two lines, a running head
  contents: () => ({ units: HEADING, pages: [inkPage({ point: 'bs1' }, { point: 'n1.contents.e' }, { para: 1 }, { glyphs: inkRun('1  Introduction . . . 3', 100, 700) }, { para: 2 }, { glyphs: inkRun('2  Black hole perturbations and', 100, 688) }, { glyphs: inkRun('quasinormal modes . . . 21', 110, 676) }, { point: 'be1' })] }),
  // LAYOUT 25's: a list set double, an entry one unit; a formula's script its placeholder's
  double: () => ({ units: [], pages: [inkPage({ point: 'bs1' }, { point: 'n1.contents.e' }, { para: 7 }, { glyphs: inkRun('6  Internal structure of the depth-', 100, 700, { size: 12 }) }, { glyphs: inkRun('wise convolutions and the mod-', 115, 671, { size: 12 }) }, { glyphs: inkRun('ule shown here . . . 14', 115, 642, { size: 12 }) }, { para: 8 }, { glyphs: [...inkRun('7  Turbulence strength', 100, 613, { size: 12 }), ...inkRun('C', 230, 613, { font: 'CMMI12', size: 12 }), ...inkRun('n', 236, 611, { font: 'CMMI8', size: 8 }), ...inkRun('2', 241, 618, { font: 'CMR8', size: 8 }), ...inkRun('. . . 15', 260, 613, { size: 12 })] }, { point: 'be1' })] }),
  // a running head with a year in its words and its folio set apart (2010.11929v2's): the year the head's, the folio no unit's
  heads: () => ({ units: HEADING, pages: [inkPage({ point: 'c1-2' }, { glyphs: inkRun('Published as a conference paper at ICLR 2021', 100, 760, { space: 3.33 }) }, { glyphs: inkRun('12', 520, 760) }, { point: 'bs1' }, { point: 'be1' })] }),
  // LAYOUT 23's: an orphan's runs of another weight, colour and slant
  styles: () => ({ units: [], pages: [inkPage({ point: 'bs1' }, { para: 1 }, { glyphs: [...inkRun('Definition 1', 100, 700, { font: 'CMBX10' }), ...inkRun('([TT])', 165, 700), ...inkRun('holds', 200, 700, { fill: 0x0071bc }), ...inkRun('here and now', 230, 700, { font: 'CMTI10' })] }, { point: 'be1' })] }),
}
/** each ink unit of a source page as `kind<echo: pieces`, each piece its text, a placeholder its source, a group its command */
const inkCutOf = (): Cut => Object.fromEntries(Object.entries(INK_CUT_SOURCES).map(([name, make]) => {
  const { pages, units } = make()
  const ledger = ledgerOf(pages.map(p => p.page) as never, { glyphs: pages.map(p => p.own) } as never, { units } as never)
  const ink = inkUnitsOf(pages.map(p => p.page) as never, ledger, { units: units as never }) as { kind: string; echo: number | null; pieces: { t: string; s?: string; src?: string }[] }[]
  return [name, ink.map(u => `${u.kind}${u.echo === null ? '' : `<${u.echo}`}: ${u.pieces.map(p => (p.t === 'text' ? JSON.stringify(p.s) : p.t === 'ph' ? `ph(${p.src})` : p.t === 'open' ? `open(${p.src})` : p.t)).join(',')}`)]
}))
/** the figures fixture's figure units, wrapped with no source units, each by its text, in order */
async function figureCutOf(): Promise<Cut> {
  const r = await (wrapped(new Uint8Array(readFileSync(new URL('../fixtures/pdf/figures/figures.pdf', import.meta.url)))) as unknown as Promise<{ figures: { units: { text: string; why: string | null }[] } }>)
  return { figures: r.figures.units.map(u => `figure${u.why ? `(${u.why})` : ''}: ${u.text}`) }
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
  it('the recorded cut is today\'s, under today\'s PIPELINE_VERSION: a cut that moves raises the version', async () => {
    const now = cutOf(), ink = inkCutOf(), figures = await figureCutOf()
    const golden = (existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, 'utf8')) : { pipeline: null, units: {} }) as { pipeline: string | null; units: Cut; ink?: Cut; figures?: Cut }
    const diff = [...moved(now, golden.units), ...moved(ink, golden.ink ?? {}).map(d => `ink ${d}`), ...moved(figures, golden.figures ?? {}).map(d => `figures ${d}`)]
    const same = golden.pipeline === PIPELINE_VERSION
    if (process.env.WRITE_UNIT_CUT === '1') {
      if (diff.length && same) throw new Error(`the unit cut moved under PIPELINE_VERSION ${PIPELINE_VERSION}: raise PIPELINE_VERSION (pipeline/versions.mjs) before recording it again\n${diff.join('\n')}`)
      writeFileSync(GOLDEN, `${JSON.stringify({ pipeline: PIPELINE_VERSION, units: now, ink, figures }, null, 1)}\n`)
      return
    }
    if (same) expect(diff, `the unit cut moved under PIPELINE_VERSION ${PIPELINE_VERSION}: a translation stored for the old cut would be given to the new one. Raise PIPELINE_VERSION (pipeline/versions.mjs), then record the cut again (WRITE_UNIT_CUT=1)`).toEqual([])
    else expect(golden.pipeline, `PIPELINE_VERSION is ${PIPELINE_VERSION}, the cut was recorded under ${golden.pipeline}: record it again (WRITE_UNIT_CUT=1)`).toBe(PIPELINE_VERSION)
  })

  it('the sources hold the cuts they are here for: a citation, a footnote, display math, a table, a \\url', async () => {
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
    // (the ink units' sources hold what they are here for: an echo, a contents entry whole, a list set double one unit, a script
    // in its placeholder, style groups; the figures fixture its figure units)
    const ink = inkCutOf()
    expect(ink['contents']?.[0]).toMatch(/^inkcontents<0: /)
    expect(ink['double']).toHaveLength(2)
    expect(ink['double']?.[1]).toContain('ph($Cn2$)')
    expect(ink['styles']?.[0]).toContain('open(\\textbf{)')
    expect((await figureCutOf()).figures?.length).toBeGreaterThan(3)
  })
})
