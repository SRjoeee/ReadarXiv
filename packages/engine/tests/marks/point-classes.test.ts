// The points' classes (marks/marks.ts POINT_CLASSES, B0 of the compile move): each class of point the marked compile sets, by
// the names it gives, with its declared `optional` (a class that states a fact of TeX's typesetting the instrument can also
// read, less exactly, from the page, and from which no unit's ownership or text is read: design-performance Q2). The table
// moves no byte of the marked TeX: the TeX and the marked source of papers written here are held as digests taken at
// 7d8fad7c4, before the table.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { openPaper, originalFiles, reducedFiles } from '../../src/compile/live.ts'
import {
  DVI_LAYOUT_TEX,
  LAYOUT_CLASSES,
  LAYOUT_TEX,
  LAYOUT_TEX_REDUCED,
  POINT_CLASSES,
  POINTS,
  POINTS_TEX,
  POINTS_TEX_REDUCED,
  pointClassOf,
} from '../../src/marks/marks.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const sha = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex').slice(0, 16)
const readme = (compiler: string) =>
  JSON.stringify({ sources: [{ usage: 'toplevel', filename: 'main.tex' }], process: { compiler } })
/** a paper of every kind of thing the points are set around: a heading, a footnote, a figure with its caption, a table, a
 *  display, an alignment, a reference, a citation and its bibliography */
const PAPER = [
  '\\documentclass{article}',
  '\\usepackage{graphicx}\\usepackage{amsmath}',
  '\\begin{document}',
  '\\begin{abstract}A short abstract of the work.\\end{abstract}',
  '\\section{Introduction}\\label{s}',
  'We use the method of \\cite{a} as in Section~\\ref{s}.\\footnote{A note of the authors.}',
  '',
  '\\begin{figure}[t]\\centering\\includegraphics[width=2cm]{fig}\\caption{A figure of the method.}\\end{figure}',
  '\\begin{table}[t]\\centering\\begin{tabular}{lc}A cell & another cell\\\\ third & fourth\\end{tabular}\\caption{A table.}\\end{table}',
  'A paragraph before a display',
  '\\begin{equation}x = y + z\\end{equation}',
  'and an alignment',
  '\\begin{align}a &= b\\\\ c &= d\\end{align}',
  'with the end of its paragraph.',
  '',
  '\\begin{thebibliography}{1}\\bibitem{a} A. Author. A title of a paper. 2020.\\end{thebibliography}',
  '\\end{document}',
  '',
].join('\n')
const papers = {
  pdflatex: () => openPaper(new Map([['main.tex', enc(PAPER)]])),
  latex: () =>
    openPaper(
      new Map([
        ['main.tex', enc(PAPER)],
        ['00README.json', enc(readme('latex'))],
      ]),
    ),
}
const markedDigests = (paper: ReturnType<typeof openPaper>) =>
  [...originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES })].map(([p, b]) => `${p} ${sha(b)}`)

/** the TeX and the marked sources at 7d8fad7c4 (this file's computation run there, before POINT_CLASSES); LAYOUT_TEX's and the
 *  marked sources' taken again where the gated marks became robust (marks.ts GATED_MARKS): the points' and the DVI forms' as they were */
const AT_BASE = {
  tex: { points: 'bcedcfb561bf0e88', layout: '472d40ec331befca', dvi: '651ee0348d79c9fc' },
  sources: { pdflatex: ['main.tex 6064a693944f761d'], latex: ['main.tex 485f98f459f93740'] },
}

describe("no byte of the marked TeX moves (held at 7d8fad7c4, before the points' table)", () => {
  it('the points, the layout marks and their DVI forms', () => {
    expect({ points: sha(POINTS_TEX), layout: sha(LAYOUT_TEX), dvi: sha(DVI_LAYOUT_TEX) }).toEqual(AT_BASE.tex)
  })
  it('the marked source of a paper under pdfLaTeX and under latex', () => {
    expect({ pdflatex: markedDigests(papers.pdflatex()), latex: markedDigests(papers.latex()) }).toEqual(
      AT_BASE.sources,
    )
  })
})

describe("the points' classes", () => {
  it('declare the paragraph-end points and the forced breaks’ optional and no other class: the cell-end points, which ownership reads, not', () => {
    // (the forced breaks' `kb<n>`: STATEMENTS_TEX's BREAKS_TEX, the compile move's F35, kept apart from the marks' points)
    expect(
      Object.entries(POINT_CLASSES)
        .filter(([, c]) => c.optional)
        .map(([k]) => k),
    ).toEqual(['para-end', 'forced-break'])
    expect(POINT_CLASSES['cell-end'].optional).toBe(false)
    expect(Object.keys(POINT_CLASSES)).toEqual([
      'body',
      'float',
      'caption',
      'picture',
      'front',
      'bibliography',
      'para-start',
      'para-end',
      'display',
      'cell-end',
      'forced-break',
      'mark',
    ])
  })
  it("are the points' TeX in its order, every part of it of a class or shared", () => {
    expect(POINTS.map(([, tex]) => tex).join('')).toBe(POINTS_TEX)
    // (the paragraph-end class: its own macros and its hook, nothing any other class reads)
    const pe = POINTS.filter(([c]) => c === 'para-end')
      .map(([, tex]) => tex)
      .join('')
    expect(pe).toContain('\\AddToHook{para/end}')
    for (const name of ['\\axt@pos', '\\axt@pecode', '\\axt@pepop', '\\axt@peat', '\\axt@pe{'])
      expect(
        POINTS.filter(([c]) => c !== 'para-end').some(([, tex]) => tex.includes(name)),
        name,
      ).toBe(false)
  })
  it('class every point name the marked TeX writes by its form', () => {
    const cases: [string, string][] = [
      ['bs3', 'body'],
      ['be3', 'body'],
      ['fs2', 'float'],
      ['fe2', 'float'],
      ['fn2', 'float'],
      ['ka4', 'caption'],
      ['zs', 'picture'],
      ['ze', 'picture'],
      ['fm1', 'front'],
      ['bi7', 'bibliography'],
      ['bz7', 'bibliography'],
      ['q12', 'para-start'],
      ['qe12c', 'para-end'],
      ['qe3j', 'para-end'],
      ['dps1', 'display'],
      ['dpe1', 'display'],
      ['dts2', 'display'],
      ['dte2', 'display'],
      ['dms3', 'display'],
      ['dme3', 'display'],
      ['t17x', 'cell-end'],
      ['0s', 'mark'],
      ['12e', 'mark'],
      ['p3.1a', 'mark'],
      ['p3.1b', 'mark'],
      ['n1.abstract.s', 'mark'],
      ['4c', 'mark'],
      ['g2a', 'mark'],
      ['g2t', 'mark'],
    ]
    for (const [name, c] of cases) expect(pointClassOf(name), name).toBe(c)
  })
})

describe('the reduced marked source (Q2): no TeX of an optional class, nothing else moved', () => {
  const dec = (b: Uint8Array | undefined) => new TextDecoder().decode(b)
  it("the points' TeX without the paragraph ends', the layout marks' with it, one line still", () => {
    expect(POINTS_TEX_REDUCED).toBe(
      POINTS.filter(([c]) => c !== 'para-end')
        .map(([, tex]) => tex)
        .join(''),
    )
    expect(POINTS_TEX_REDUCED).not.toContain('para/end')
    expect(LAYOUT_TEX.split(POINTS_TEX)).toHaveLength(2)
    expect(LAYOUT_TEX_REDUCED).toBe(LAYOUT_TEX.split(POINTS_TEX).join(POINTS_TEX_REDUCED))
    expect(LAYOUT_TEX_REDUCED).not.toMatch(/\n/)
  })
  it("originalFiles' `reduced`: the main file's layout marks reduced, its lines and every other file as they were; reducedFiles the same of any request's files", () => {
    for (const make of [papers.pdflatex, papers.latex]) {
      const full = originalFiles(make(), { lines: true, layout: LAYOUT_CLASSES })
      const reduced = originalFiles(make(), { lines: true, layout: LAYOUT_CLASSES, reduced: true })
      expect([...reduced.keys()]).toEqual([...full.keys()])
      const a = dec(full.get('main.tex')),
        b = dec(reduced.get('main.tex'))
      expect(b).toBe(a.split(POINTS_TEX).join(POINTS_TEX_REDUCED))
      expect(b.split('\n')).toHaveLength(a.split('\n').length)
      // (a request's files: its own, the carried beside them, a final pass's main file: the main file's points reduced)
      const carried = new Map([...full, ['main.aux', new TextEncoder().encode('\\relax\n')]])
      expect([...reducedFiles(carried, 'main.tex')].map(([p, x]) => [p, dec(x)])).toEqual(
        [...reduced, ['main.aux', new TextEncoder().encode('\\relax\n')]].map(([p, x]) => [p, dec(x as Uint8Array)]),
      )
    }
    // (without `reduced`, or without layout marks, the bytes as they were)
    expect(dec(originalFiles(papers.pdflatex(), { lines: true, reduced: true }).get('main.tex'))).toBe(
      dec(originalFiles(papers.pdflatex(), { lines: true }).get('main.tex')),
    )
  })
})
