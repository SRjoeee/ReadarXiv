import { describe, expect, it } from 'vitest'
import { openPaper } from '../../src/compile/live.ts'

// What a paper's own command wraps, read through its definition, where the definition hands its argument to a box register
// (F18): TeX sets a parameter put into a register with \sbox, \savebox, \setbox or lrbox where the body shows that register
// (\usebox, \box, \copy, \unhbox …), as the box's content; one the body only measures (\wd, \ht) is set nowhere. 2610.37668v1's
// `\fittabular[<pad>]{<columns>}{<tabular>}` sets its third argument into a register twice and shows it once, inside
// \resizebox or \makebox: the source reader followed no parameter through a register, the argument was no text, and every one
// of its tables (317 lines) had no cell

type Piece = { t: string; s?: string; src?: string }
const enc = (s: string) => new TextEncoder().encode(s)
const unitsOf = (preamble: string, body: string) =>
  openPaper(
    new Map([['main.tex', enc(`\\documentclass{article}\n${preamble}\n\\begin{document}\n${body}\n\\end{document}\n`)]]),
  ).units.map((u) => ({ kind: u.kind, pieces: u.pieces as Piece[] }))
const textOf = (u: { pieces: Piece[] }) =>
  u.pieces
    .filter((p) => p.t === 'text')
    .map((p) => p.s)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
const read = (preamble: string, body: string) => unitsOf(preamble, body).map((u) => [u.kind, textOf(u)])

const FIT = String.raw`\newsavebox{\fitbox}\newlength{\fitsep}
\newcommand{\fittable}[3][\maxdimen]{%
  \begingroup
  \setlength{\tabcolsep}{0pt}%
  \sbox{\fitbox}{#3}%
  \setlength{\fitsep}{\dimexpr(\linewidth-\wd\fitbox)/\numexpr2*#2-2\relax\relax}%
  \ifdim\fitsep>#1\setlength{\fitsep}{#1}\fi
  \setlength{\tabcolsep}{\fitsep}%
  \sbox{\fitbox}{#3}%
  \ifdim\wd\fitbox>\linewidth
    \resizebox{\linewidth}{!}{\usebox{\fitbox}}%
  \else
    \makebox[\linewidth][c]{\usebox{\fitbox}}%
  \fi
  \endgroup}`
const TABLE = String.raw`\begin{table}
\caption{Results on every scene.}
\fittable{3}{%
\begin{tabular}{@{}lrr@{}}
Method & Speed & Memory \\
Our method & 12 & 40 \\
\end{tabular}}
\end{table}`

describe("a paper's command that sets its argument into a box register it shows: the argument is the box's content (F18)", () => {
  it("2610.37668v1's form: the table inside the command is read as a table, each cell its unit", () => {
    expect(read(FIT, TABLE)).toEqual([
      ['caption', 'Results on every scene.'],
      ['cell', 'Method'],
      ['cell', 'Speed'],
      ['cell', 'Memory'],
      ['cell', 'Our method'],
    ])
  })
  it('\\setbox with \\hbox, shown by \\box inside \\fbox: the argument is text of its paragraph', () => {
    const units = read(
      '\\newcommand{\\framed}[1]{\\setbox0=\\hbox{#1}\\fbox{\\box0}}',
      'We read \\framed{the boxed words here} in a sentence.',
    )
    expect(units).toEqual([['para', 'We read the boxed words here in a sentence.']])
  })
  it('\\savebox with its optional width, shown by \\usebox', () => {
    const units = read(
      '\\newsavebox{\\keep}\\newcommand{\\kept}[1]{\\savebox{\\keep}[4cm][l]{#1}\\usebox{\\keep}}',
      'We read \\kept{the saved words here} in a sentence.',
    )
    expect(units).toEqual([['para', 'We read the saved words here in a sentence.']])
  })
  it('a register the body only measures, never shows: the argument is no text, the call one placeholder, as before', () => {
    const units = unitsOf(
      '\\newsavebox{\\tmp}\\newlength{\\len}\\newcommand{\\measure}[1]{\\sbox{\\tmp}{#1}\\setlength{\\len}{\\wd\\tmp}}',
      'We read \\measure{the measured words here} in a sentence.',
    )
    expect(units.map(textOf)).toEqual(['We read in a sentence.'])
    expect(units[0]!.pieces.filter((p) => p.t === 'ph').map((p) => p.src)).toEqual([
      '\\measure{the measured words here}',
    ])
  })
})
