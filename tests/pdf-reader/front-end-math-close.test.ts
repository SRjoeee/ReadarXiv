import { describe, expect, it } from 'vitest'
import { inMemory, loadProject } from '@/pdf-reader/engine/source/latex-front.mjs'

// An inline formula ends where TeX ends it. LaTeX's \( is a math shift outside math, and its \) a math shift inside inline
// math (latex.ltx: \( `\ifmmode\@badmath\else$\fi`, \) `\ifmmode\ifinner$\else\@badmath\fi`), so a formula opened by `$` is
// closed by \) and one opened by \( is closed by `$`: TeX sets `$1-x\in I\)` as one formula. The front end paired a `$` with
// the next `$` alone and read on: every `$` after it closed what was text and opened what was math, the paragraphs after it
// one unit of formulas that TeX's marks never closed, and every page after that point had no source unit (2610.21377v1: one
// `$…\)` on p. 35, its appendix pp. 34-43 read off arXiv's ink alone, lines kept English, joins and pieces at the original's
// place over the reflowed text)

type Piece = { t: string; s?: string; src?: string }
type Unit = { kind: string; pieces: Piece[] }
const enc = (s: string) => new TextEncoder().encode(s)
const doc = (body: string) => `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`
const unitsOf = (body: string) => loadProject(inMemory(new Map([['main.tex', enc(doc(body))]])), 'main.tex', { tables: true }).units as unknown as Unit[]
const textOf = (u: Unit) => u.pieces.filter(p => p.t === 'text').map(p => p.s).join('').replace(/\s+/g, ' ').trim()
const formulasOf = (u: Unit) => u.pieces.filter(p => p.t === 'ph').map(p => p.src)

describe('an inline formula closes at TeX\'s math shift: `$` or \\), whichever opened it', () => {
  const MIXED = 'Since $1-x\\in[a,b]\\) for a.e. \\(x\\in[c,d]\\), we have\n\\[ y = 0. \\]\nHence $\\pi=0$ on $I$.\n\nThe next paragraph names $z$ and ends.'
  it('`$…\\)`: one formula, and the paragraphs after it read as they are (2610.21377v1 p. 35)', () => {
    const us = unitsOf(MIXED)
    expect(us.map(textOf)).toEqual(['Since for a.e. , we have Hence on .', 'The next paragraph names and ends.'])
    expect(formulasOf(us[0]!)[0]).toBe('$1-x\\in[a,b]\\)')
    expect(formulasOf(us[1]!)).toEqual(['$z$'])
  })
  it('`\\(…$`: one formula likewise', () => {
    const us = unitsOf('Take \\(x>0$ and $y<0$ here.\n\nThen $z$ follows.')
    expect(us.map(textOf)).toEqual(['Take and here.', 'Then follows.'])
    expect(formulasOf(us[0]!)).toEqual(['\\(x>0$', '$y<0$'])
  })
  it('a math shift inside a group of the formula, a text box\'s own formula, closes nothing of it (Codex on #634, round 8 B5)', () => {
    // (TeX ends inline math at a math shift of the formula's own level: one inside a group, `\\text{for $y>0$}`, is the box's own
    // formula; a closing shift inside a group of math proper is an error TeX reports)
    const us = unitsOf('So \\(x+\\text{for $y>0$}=z\\) and $a+\\mbox{if $b$, \\(c\\)}$ hold.')
    expect(us.map(textOf)).toEqual(['So and hold.'])
    expect(formulasOf(us[0]!)).toEqual(['\\(x+\\text{for $y>0$}=z\\)', '$a+\\mbox{if $b$, \\(c\\)}$'])
  })
  it('a formula opened and closed alike reads as before, an escaped dollar no shift', () => {
    const us = unitsOf('Costs $\\$5$ and \\(a\\) and $b$ here.')
    expect(us.map(textOf)).toEqual(['Costs and and here.'])
    expect(formulasOf(us[0]!)).toEqual(['$\\$5$', '\\(a\\)', '$b$'])
  })
})
