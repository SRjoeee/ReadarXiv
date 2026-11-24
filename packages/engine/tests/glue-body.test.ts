// A call of a paper's macro of no argument whose body is glue alone states that glue (El.glue), as `\hskip` written in place
// does: te_preprint.sty's `\newcommand{\authorsep}{\hskip 1.15em \@plus .4em\relax}` between the names of 2611.18114v1's author
// line stated none, and the typesetter set a word space where TeX set 1.15 em (the coordinator's ruling of 2026-11-25).
import { describe, expect, it } from 'vitest'
import { openPaper } from '../src/compile/live.ts'
import { classesOf } from '../src/instrument/instrument.ts'
import { glueBody, statedGlue } from '../src/source/latex-front.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const unitsOf = (defs: string) =>
  openPaper(
    new Map([
      [
        'main.tex',
        enc(
          `\\documentclass{article}\n\\makeatletter\n${defs}\n\\makeatother\n\\begin{document}\nOur first words\\sep{}our second words, a line long enough to be a unit of its own.\n\\end{document}\n`,
        ),
      ],
    ]),
  ).units

describe('the glue a paper macro of glue alone sets', () => {
  it('its body as TeX reads it, its stretch and its trailing \\relax left out', () => {
    const m = new Map([
      ['a', '\\hskip 1.15em \\@plus .4em\\relax'],
      ['b', '\\hspace{2pt}'],
      ['c', '\\quad'],
      ['d', '\\textbf{x}'],
      ['e', '\\hskip 1em\\textbf{x}'],
      // (a stretch and a shrink both: LaTeX's \newblock in a bibliography)
      ['g', '\\hskip .11em\\@plus.33em\\@minus.07em'],
      ['h', '\\hskip 1em plus 1fil minus 2pt'],
    ])
    expect(['\\a', '\\b{}', '\\c', '\\d', '\\f', '\\g', '\\h'].map((s) => glueBody(s, m))).toEqual([
      '\\hskip 1.15em',
      '\\hspace{2pt}',
      '\\quad',
      null,
      null,
      '\\hskip .11em',
      '\\hskip 1em',
    ])
  })
  it('the reader states it on the call, and the instrument states the glue', () => {
    const units = unitsOf('\\newcommand{\\sep}{\\hskip 1.15em \\@plus .4em\\relax}')
    const p = units[0]!.pieces.find((x) => x.t === 'ph')!
    expect(statedGlue(p)).toBe('\\hskip 1.15em')
    const k = String(units[0]!.pieces.indexOf(p))
    const cls = classesOf(units[0]!.pieces as never).find(([id]) => id === k)?.[1]
    expect(cls?.glue).toEqual([1.15, 'em', 1])
  })
  it('the other side: a macro that sets more than glue states none', () => {
    const units = unitsOf('\\newcommand{\\sep}{\\hskip 1em\\textbf{x}}')
    const p = units[0]!.pieces.find((x) => x.t === 'ph')!
    const k = String(units[0]!.pieces.indexOf(p))
    expect(classesOf(units[0]!.pieces as never).find(([id]) => id === k)?.[1]?.glue).toBeUndefined()
  })
})
