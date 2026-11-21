import { describe, expect, it } from 'vitest'
import { openPaper } from '../../src/index.ts'

// What a comment holds TeX never reads: an unescaped `%` ends its line for TeX, a brace or a closing delimiter after it with it
// (`\%` is the character, `\\%` a line break and then a comment). The front end's scans for where a formula, a display or an
// environment ends counted what stood in a comment: a commented `{` kept `$x % { note⏎+y$` open past its closing `$`, so its
// letters went to the translator as text and the words between it and the next formula became one (a reviewer's finding on
// round B15's pull request, F37); a commented `\]`, `$$`, `\eeq` or `\end{align}` closed a display early, the rest of it
// read as prose

type Piece = { t: string; s?: string; src?: string }
const enc = (s: string) => new TextEncoder().encode(s)
const doc = (body: string, preamble = '') =>
  `\\documentclass{article}\n${preamble}\\begin{document}\n${body}\n\\end{document}\n`
const unitsOf = (body: string, preamble = '') =>
  openPaper(new Map([['main.tex', enc(doc(body, preamble))]])).units.map((u) => ({
    kind: u.kind,
    pieces: u.pieces as Piece[],
  }))
const textOf = (u: { pieces: Piece[] }) =>
  u.pieces
    .filter((p) => p.t === 'text')
    .map((p) => p.s)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
const formulasOf = (u: { pieces: Piece[] }) => u.pieces.filter((p) => p.t === 'ph').map((p) => p.src)
/** the one unit of a body, as its text and its formulas */
const read = (body: string, preamble = '') => {
  const us = unitsOf(body, preamble)
  return { texts: us.map(textOf), formulas: us.flatMap(formulasOf) }
}

describe('an inline formula ends where TeX ends it, past what a comment in it holds', () => {
  it('a brace in a comment opens no group: the formula closes at its `$` (the finding)', () => {
    expect(read('Take $x % { comment\n+y$ and $z$ here.')).toEqual({
      texts: ['Take and here.'],
      formulas: ['$x % { comment\n+y$', '$z$'],
    })
  })
  it('likewise in \\( … \\)', () => {
    expect(read('Take \\(x % { comment\n+y\\) and \\(z\\) here.')).toEqual({
      texts: ['Take and here.'],
      formulas: ['\\(x % { comment\n+y\\)', '\\(z\\)'],
    })
  })
  it('a closing shift in a comment closes nothing', () => {
    expect(read('Take $x % was $y$\n+y$ and $z$ here.')).toEqual({
      texts: ['Take and here.'],
      formulas: ['$x % was $y$\n+y$', '$z$'],
    })
    expect(read('Take \\(x % was \\)\n+y\\) and \\(z\\) here.')).toEqual({
      texts: ['Take and here.'],
      formulas: ['\\(x % was \\)\n+y\\)', '\\(z\\)'],
    })
  })
  it('an escaped `\\%` is the character, no comment: a brace after it counts', () => {
    expect(read('Take $a+\\text{50\\% {of $n$} more}$ and $w$ here.')).toEqual({
      texts: ['Take and here.'],
      formulas: ['$a+\\text{50\\% {of $n$} more}$', '$w$'],
    })
  })
  it('`\\\\%` is a line break, then a comment', () => {
    expect(read('Take $\\sum_{\\substack{i<n \\\\% {\nj>0}} x_{ij}$ and $w$ here.')).toEqual({
      texts: ['Take and here.'],
      formulas: ['$\\sum_{\\substack{i<n \\\\% {\nj>0}} x_{ij}$', '$w$'],
    })
  })
  it('a comment whose braces pair: the formula reads as it did', () => {
    expect(read('Take $x % {a} b\n+y$ and $z$ here.')).toEqual({
      texts: ['Take and here.'],
      formulas: ['$x % {a} b\n+y$', '$z$'],
    })
  })
  it("a comment that ends the formula's line, the formula closed on the next", () => {
    expect(read('Take $x+y % sum {\n$ and $z$ here.')).toEqual({
      texts: ['Take and here.'],
      formulas: ['$x+y % sum {\n$', '$z$'],
    })
    expect(read('Take \\(x+y % sum {\n\\) and \\(z\\) here.')).toEqual({
      texts: ['Take and here.'],
      formulas: ['\\(x+y % sum {\n\\)', '\\(z\\)'],
    })
  })
})

describe('a display ends where TeX ends it, not at a delimiter in a comment', () => {
  // (an author's equation split in two and joined again, the old end and beginning commented out)
  it('\\[ … \\]', () => {
    expect(read('We have\n\\[ a = b\n%\\]\n%\\[\n + c \\]\nwhich ends.')).toEqual({
      texts: ['We have which ends.'],
      formulas: ['\\[ a = b\n%\\]\n%\\[\n + c \\]'],
    })
  })
  it('$$ … $$', () => {
    expect(read('We have\n$$ a = b\n%$$\n%$$\n + c $$\nwhich ends.')).toEqual({
      texts: ['We have which ends.'],
      formulas: ['$$ a = b\n%$$\n%$$\n + c $$'],
    })
  })
  it("the paper's own commands for an environment's begin and end (\\beq … \\eeq)", () => {
    const pre = '\\newcommand{\\beq}{\\begin{equation}}\n\\newcommand{\\eeq}{\\end{equation}}\n'
    expect(read('We have\n\\beq\n a = b\n%\\eeq\n%\\beq\n + c\n\\eeq\nwhich ends.', pre)).toEqual({
      texts: ['We have which ends.'],
      formulas: ['\\beq\n a = b\n%\\eeq\n%\\beq\n + c\n\\eeq'],
    })
  })
  it("an environment's \\end after `\\\\%`, which is a comment", () => {
    expect(read('We have\n\\begin{align}\n a &= b \\\\%\\end{align}\n c &= d\n\\end{align}\nwhich ends.')).toEqual({
      texts: ['We have which ends.'],
      formulas: ['\\begin{align}\n a &= b \\\\%\\end{align}\n c &= d\n\\end{align}'],
    })
  })
})

describe('a TikZ node in a comment is no text TeX sets', () => {
  it("a node after `\\\\%` in a matrix's row", () => {
    const us = unitsOf(
      '\\begin{tikzpicture}\n\\matrix { \\node {Alpha}; \\\\% \\node {Old label};\n\\node {Beta}; \\\\ };\n\\end{tikzpicture}',
    )
    expect(us.map(textOf)).toEqual(['Alpha', 'Beta'])
  })
})
