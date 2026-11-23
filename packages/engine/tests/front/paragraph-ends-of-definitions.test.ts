import { describe, expect, it } from 'vitest'
import { openPaper } from '../../src/compile/live.ts'

// More forms of a definition that ends the paragraph TeX is setting (beside paragraph-macros.test.ts): TeX's vertical commands
// at the body's top level (TeX inserts \par before each in horizontal mode), LaTeX's \medbreak family inside a body, a body that
// ends the paragraph through another of the paper's macros; and the controls, a \par inside a box's or an argument's own text,
// which ends a paragraph of that box alone. Words of our own.

type Piece = { t: string; s?: string }
const enc = (s: string) => new TextEncoder().encode(s)
const saidOf = (preamble: string, body: string) =>
  openPaper(
    new Map([['main.tex', enc(`\\documentclass{article}\n${preamble}\n\\begin{document}\n${body}\n\\end{document}\n`)]]),
  ).units.map((u) =>
    (u.pieces as Piece[])
      .filter((p) => p.t === 'text')
      .map((p) => p.s)
      .join('')
      .replace(/\s+/g, ' ')
      .trim(),
  )

describe('a definition that ends the paragraph in other forms', () => {
  it('a vertical command after the argument (\\vskip): the head and the words after it are two units', () => {
    expect(saidOf('\\newcommand{\\sect}[1]{\\textbf{#1}\\vskip 4pt}', '\\sect{A head of ours} Words of the next one.')).toEqual([
      'A head of ours',
      'Words of the next one.',
    ])
  })
  it('\\medbreak at the body’s head: the paragraph before the call ends there', () => {
    const said = saidOf(
      '\\newcommand{\\pb}[1]{\\medbreak\\noindent\\textbf{#1}}',
      'Words of the paragraph before it. \\pb{A head} and the words of the next one.',
    )
    // (the call and its head begin the second unit, whatever piece the reader makes of them)
    expect(said.length).toBe(2)
    expect(said[0]).toBe('Words of the paragraph before it.')
    expect(said[1]).toMatch(/and the words of the next one\.$/)
  })
  it('through another of the paper’s macros (\\endp is \\par): read as TeX expands it', () => {
    expect(
      saidOf(
        '\\newcommand{\\endp}{\\par}\n\\newcommand{\\kick}[1]{{\\small #1}\\endp}',
        '\\kick{Field notes} A small title of ours.',
      ),
    ).toEqual(['Field notes', 'A small title of ours.'])
  })
  it('a \\par inside a box’s own text ends that box’s paragraph alone: one unit', () => {
    expect(
      saidOf(
        '\\newcommand{\\inbox}[1]{\\fbox{\\parbox{3cm}{#1\\par}}}',
        'A sentence of ours with \\inbox{boxed words} inside it goes on.',
      ),
    ).toEqual(['A sentence of ours with boxed words inside it goes on.'])
  })
})
