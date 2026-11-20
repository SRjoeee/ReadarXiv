import { describe, expect, it } from 'vitest'
import { openPaper } from '../../src/compile/live.ts'

// TeX's vertical commands end the paragraph they meet (the TeXbook, chapter 25, "Summary of horizontal mode"; tex.web §1094,
// head_for_vmode): in horizontal mode \vskip, \vfil, \vfill, \vss, \vfilneg, \hrule, \unvbox, \unvcopy and \halign make TeX
// insert \par and read the command again in vertical mode. The source reader ends the unit there as at \par once its text has
// begun; LaTeX's \vspace (a \vadjust in a paragraph), \\ and \newline stay inside it. A unit holding two of TeX's paragraphs
// and the rule between them drew the rule as an inline element of its translation (2610.21765v1 p3's protocol box)

type Piece = { t: string; s?: string; src?: string }
const enc = (s: string) => new TextEncoder().encode(s)
const unitsOf = (body: string) =>
  openPaper(new Map([['main.tex', enc(`\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`)]])).units.map(
    (u) => ({ kind: u.kind, pieces: u.pieces as Piece[] }),
  )
const said = (u: { pieces: Piece[] }) =>
  u.pieces
    .filter((p) => p.t === 'text')
    .map((p) => p.s)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
const phs = (u: { pieces: Piece[] }) => u.pieces.filter((p) => p.t === 'ph').map((p) => p.src)

describe("a vertical command ends the paragraph it meets, as TeX's \\par does (TeXbook ch. 25)", () => {
  it('a title, a rule and a heading with no blank line between: two units, the rule between them in neither’s text', () => {
    const us = unitsOf(
      '{\\bf Protocol for the toy case}\n\\vspace{0.2cm}\n\\hrule\n\\vspace{0.2cm}\n\\textbf{Procedure for it}',
    )
    expect(us.map(said)).toEqual(['Protocol for the toy case', 'Procedure for it'])
    expect(phs(us[0]!)).not.toContain('\\hrule')
    // (read again in vertical mode: the next unit's head, which the start mark passes over, its ink the original's)
    expect(phs(us[1]!)[0]).toBe('\\hrule')
  })
  it('LaTeX’s \\vspace inside a paragraph does not cut it (a \\vadjust there), nor \\\\ or \\newline', () => {
    expect(unitsOf('First words of the paragraph \\vspace{2pt} and its last words.').map(said)).toEqual([
      'First words of the paragraph and its last words.',
    ])
    expect(unitsOf('First words of the paragraph\\\\ and\\newline its last words.').length).toBe(1)
  })
  it('\\vskip does, its glue with it; \\vfill and \\hrule with its spec alike', () => {
    const us = unitsOf('First words of the paragraph \\vskip 2pt plus 1pt the words of the next paragraph.')
    expect(us.map(said)).toEqual(['First words of the paragraph', 'the words of the next paragraph.'])
    expect(phs(us[1]!)[0]).toBe('\\vskip 2pt plus 1pt')
    expect(unitsOf('One paragraph of words \\vfill another paragraph of words.').map(said)).toEqual([
      'One paragraph of words',
      'another paragraph of words.',
    ])
    expect(unitsOf('One paragraph of words \\hrule height 1pt another paragraph of words.').map(said)).toEqual([
      'One paragraph of words',
      'another paragraph of words.',
    ])
  })
  it('before the unit’s text has begun nothing ends: rules over a title stay its head', () => {
    const us = unitsOf('\\hrule\n\\vspace{0.5mm}\n\\hrule\n{\\bf Protocol for the toy case}')
    expect(us.map(said)).toEqual(['Protocol for the toy case'])
    expect(phs(us[0]!).filter((s) => s === '\\hrule').length).toBe(2)
  })
  it('a trailing rule after the text ends the unit before it: the rule no piece of it', () => {
    const us = unitsOf('{\\bf Protocol for the even case}\n\\vspace{0.2cm}\n\\hrule\n\\vspace{0.25cm}\n\nThe next paragraph here.')
    expect(us.map(said)).toEqual(['Protocol for the even case', 'The next paragraph here.'])
    expect(us.flatMap(phs)).not.toContain('\\hrule')
  })
})
