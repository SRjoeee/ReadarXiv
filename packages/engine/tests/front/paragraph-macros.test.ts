import { describe, expect, it } from 'vitest'
import { openPaper } from '../../src/compile/live.ts'

// A command whose definition ends the paragraph ends the unit where TeX ends it. TeX reads a macro's call as its body: a
// `\par` at the body's top level after its argument (`\newcommand{\tagline}[1]{{\small\bfseries #1}\par}`) ends the paragraph
// the argument was set in, one before it ends the paragraph before the call, as a `\par` written in the source does (the
// marked compile states both: a paragraph end, `qe<n>`, and a start, `q<n>`, between the argument's glyphs and the next text).
// LaTeX's own \smallbreak, \medbreak and \bigbreak begin with \par (latex.ltx: `\def\medbreak{\par\ifdim\lastskip<…}`). The
// source reader walked such a call as a pair around its argument, or as an element, and the label and the title after it
// were one unit: one row, one size and one face for the two paragraphs TeX set (a report's kicker drawn at its title's size).
// RED until the source reader reads the paragraph ends a definition holds. Words of our own.

type Piece = { t: string; s?: string; src?: string }
const enc = (s: string) => new TextEncoder().encode(s)
const unitsOf = (preamble: string, body: string) =>
  openPaper(
    new Map([['main.tex', enc(`\\documentclass{article}\n${preamble}\n\\begin{document}\n${body}\n\\end{document}\n`)]]),
  ).units.map((u) => ({ kind: u.kind, pieces: u.pieces as Piece[] }))
const said = (u: { pieces: Piece[] }) =>
  u.pieces
    .filter((p) => p.t === 'text')
    .map((p) => p.s)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

describe("a command whose definition ends the paragraph ends the unit where TeX does, as a written \\par does", () => {
  it('a paper’s macro that sets its argument and then \\par: the label and the title after it are two units', () => {
    const us = unitsOf(
      '\\newcommand{\\tagline}[1]{{\\small\\bfseries #1}\\par}',
      '\\tagline{Field notes}\n\\vspace{6mm}\n{\\Large\\bfseries A small title of ours\\par}\n\nThe first paragraph of the body.',
    )
    expect(us.map(said)).toEqual(['Field notes', 'A small title of ours', 'The first paragraph of the body.'])
  })
  it('the same macro written with \\def, and with \\endgraf (LaTeX’s \\par of the primitive)', () => {
    for (const def of ['\\def\\tagline#1{{\\small #1}\\par}', '\\newcommand{\\tagline}[1]{{\\small #1}\\endgraf}'])
      expect(unitsOf(def, '\\tagline{Field notes}\nA small title of ours.').map(said)).toEqual([
        'Field notes',
        'A small title of ours.',
      ])
  })
  it('a paper’s macro whose body begins with \\par: the paragraph before the call ends there', () => {
    const us = unitsOf(
      '\\newcommand{\\lead}[1]{\\par\\noindent{\\bfseries #1}\\quad}',
      'Words of the paragraph before it. \\lead{A head} Words of the paragraph it begins.',
    )
    // (the call and its head begin the second unit, whatever piece the reader makes of them)
    expect(us.length).toBe(2)
    expect(said(us[0]!)).toBe('Words of the paragraph before it.')
    expect(said(us[1]!)).toMatch(/Words of the paragraph it begins\.$/)
  })
  it('LaTeX’s \\medbreak between two paragraphs with no blank line: two units', () => {
    const us = unitsOf(
      '',
      'The words of one paragraph end here.\n\\medbreak\n\\noindent\\textbf{A head} and the words of the next one.',
    )
    expect(us.map(said)).toEqual(['The words of one paragraph end here.', 'A head and the words of the next one.'])
  })
  it('a macro that ends no paragraph keeps its call inside the unit (its argument a group of it)', () => {
    const us = unitsOf(
      '\\newcommand{\\term}[1]{\\textbf{#1}}',
      'A sentence with a \\term{defined term} inside it and more words after.',
    )
    expect(us.map(said)).toEqual(['A sentence with a defined term inside it and more words after.'])
  })
})
