// @vitest-environment node
// A paper's macro whose body begins an environment (docs/PDF-READER.md §18.73): TeX's \begin{name} reads the environment's own
// arguments as the environment declares them (a tabular's [pos]{preamble}, a minipage's [pos][height][inner]{width}), so a
// parameter there is no text; and an argument the body sets inside an environment of its own is that environment's content, a
// block TeX sets apart (a minipage's paragraph, a tabular's cells), as the same environment written in place is to the walk.
// Read through the source reader's public reading (loadProject), on sources of our own.
import { describe, expect, it } from 'vitest'
import { inMemory, loadProject } from '../../src/source/latex-front.ts'

type Piece = { t: string; s?: string; src?: string }
type Unit = { kind: string; pieces: Piece[]; cell?: { row: number; col: number } }
const enc = (s: string) => new TextEncoder().encode(s)
const doc = (preamble: string, body: string) =>
  `\\documentclass{article}\n\\usepackage{graphicx}\n${preamble}\n\\begin{document}\nThe running text of the paper.\n\n${body}\n\\end{document}\n`
const unitsOf = (preamble: string, body: string): Unit[] =>
  loadProject(inMemory(new Map([['main.tex', enc(doc(preamble, body))]])), 'main.tex', { tables: true }).units
const words = (u: Unit) =>
  u.pieces
    .filter((p) => p.t === 'text')
    .map((p) => p.s)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
const cellWords = (us: Unit[], row: number, col: number) =>
  us
    .filter((u) => u.kind === 'cell' && u.cell?.row === row && u.cell?.col === col)
    .map(words)
    .join(' ')
const table = (head: string) => `\\begin{tabular}{c|c}\n\\hline\n${head} & testing \\\\\n\\hline\n1.5 & 2.5 \\\\\n\\hline\n\\end{tabular}`

describe("a paper's macro whose body is a one-column tabular, its column letter one parameter and its text another", () => {
  const TWOLINE = '\\newcommand{\\twoline}[2]{\\begin{tabular}{@{}#1@{}}#2\\end{tabular}}'
  it("a header cell's text set on two lines is the cell's units (it was one placeholder: no unit at all)", () => {
    const us = unitsOf(TWOLINE, table('\\twoline{c}{Error rate \\\\ on test set}'))
    expect(cellWords(us, 0, 0)).toBe('Error rate on test set')
    expect(cellWords(us, 0, 1)).toBe('testing')
  })
  it("a header cell's text on one line is its unit", () => {
    const us = unitsOf(TWOLINE, table('\\twoline{l}{Mean score}'))
    expect(cellWords(us, 0, 0)).toBe('Mean score')
  })
})

describe('a macro whose body sets one argument in a minipage whose width is another, called several times in a row', () => {
  const PANEL =
    '\\newcommand{\\panel}[3]{\\begin{minipage}[t]{#1}\\centering\n  \\includegraphics[width=\\linewidth]{#2}\\\\[1pt]#3\\end{minipage}}'
  const FIGURE = [
    '\\begin{figure}',
    '\\panel{0.3\\textwidth}{a.png}{First panel shows the input}\\hfill',
    '\\panel{0.3\\textwidth}{b.png}{Second panel shows the output}\\\\[3pt]',
    '\\panel{0.6\\textwidth}{c.png}{Third panel compares both}',
    '\\caption{Three panels side by side.}',
    '\\end{figure}',
  ].join('\n')
  it("each call's text is a unit of its own (each was one placeholder: no unit at all)", () => {
    const us = unitsOf(PANEL, FIGURE).filter((u) => u.kind !== 'caption' && /panel/i.test(words(u)))
    expect(us.map(words)).toEqual(['First panel shows the input', 'Second panel shows the output', 'Third panel compares both'])
  })
  it('never one paragraph across the calls', () => {
    const us = unitsOf(PANEL, FIGURE)
    expect(us.filter((u) => (words(u).match(/panel/gi) ?? []).length > 1)).toEqual([])
  })
})

describe('the other side, held', () => {
  it('a macro with two text parameters outside any environment stays one placeholder, its call as written', () => {
    const us = unitsOf('\\newcommand{\\both}[2]{\\textbf{#1} versus \\emph{#2}}', 'We compare \\both{alpha}{beta} in this test.')
    const para = us.find((u) => /We compare/.test(words(u)))!
    expect(words(para)).toBe('We compare in this test.')
    expect(para.pieces.filter((p) => p.t === 'ph').map((p) => p.src)).toContain('\\both{alpha}{beta}')
  })
  it("an environment's own arguments are never text: a tabular's preamble, a minipage's position and width", () => {
    const us = unitsOf(
      [
        '\\newcommand{\\cellbox}[2]{\\begin{tabular}{#1}#2\\end{tabular}}',
        '\\newcommand{\\aside}[3]{\\begin{minipage}[#1]{#2}#3\\end{minipage}}',
      ].join('\n'),
      `${table('\\cellbox{@{}l@{}}{Mean score}')}\n\n\\aside{t}{0.4\\linewidth}{Some words of the aside.}`,
    )
    const texts = us.flatMap((u) => u.pieces.filter((p) => p.t === 'text').map((p) => p.s!.trim()))
    expect(texts.filter((s) => /@\{\}|linewidth|0\.4/.test(s) || s === 't' || s === 'l')).toEqual([])
  })
})
