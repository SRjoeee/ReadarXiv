// @vitest-environment node
// A table cell set on several lines, one unit since §18.75: where the marked original puts its start mark (docs/PDF-READER.md
// §18.75, the marking). The cell's lines are the rows of a box the cell holds (\makecell, \shortstack, a nested one-column
// tabular, a paper macro's box); a start mark inside the box defines the cell's index in the box's first entry, whose template
// would then write the box's class (AXT-CELL) and set the cell's end point there, after line 1. So the start mark goes before the
// open piece of the innermost group that holds every forced break of the cell, at the outer entry's level, and never before a
// \multicolumn (its \omit opens the entry). The end mark stays after the last word, inside the box; a cell of one line, and one
// whose first word stands before the box, keep their start mark where it was. Read through originalFiles, as the compile writes
// the marked original, on sources of our own.
import { describe, expect, it } from 'vitest'
import { openPaper, originalFiles } from '../../src/compile/live.ts'
import { MARK_CLASSES } from '../../src/marks/marks.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const PRE =
  '\\usepackage{makecell,multirow,colortbl}\n\\newcommand{\\tabincell}[2]{\\begin{tabular}{@{}#1@{}}#2\\end{tabular}}'
const marked = (row: string): string => {
  const tex = `\\documentclass{article}\n${PRE}\n\\begin{document}\nSome prose words here.\n\n\\begin{tabular}{l|c|r}\n\\hline\n${row} \\\\\n\\hline\n1.5 & 2.5 & 3.5 \\\\\n\\end{tabular}\n\\end{document}\n`
  const out = new TextDecoder().decode(originalFiles(openPaper(new Map([['main.tex', enc(tex)]])), { lines: true, layout: MARK_CLASSES }).get('main.tex')!)
  return out.slice(out.indexOf('\\begin{tabular}{l|c|r}'), out.indexOf('\\end{document}'))
}
const S = String.raw`\\leavevmode\\axtmark\{t\d+s\}`

describe('a cell of several lines has its start mark before the box that holds its lines, at the outer entry', () => {
  it('before \\makecell{, its end mark inside the box after the last word', () => {
    const m = marked('\\makecell{Error rate \\\\ on test set} & testing & x')
    expect(m).toMatch(new RegExp(`${S}\\\\makecell\\{Error rate \\\\\\\\ on test set\\\\axtend\\{t\\d+e\\}\\}`))
  })
  it('before a nested one-column tabular’s \\begin', () => {
    expect(marked('\\begin{tabular}[c]{@{}c@{}}Inner one \\\\ inner two\\end{tabular} & testing & x')).toMatch(
      new RegExp(`${S}\\\\begin\\{tabular\\}\\[c\\]\\{@\\{\\}c@\\{\\}\\}Inner one`),
    )
  })
  it('before a paper macro’s pair (\\tabincell{c}{)', () => {
    expect(marked('\\tabincell{c}{LOC \\\\ method} & testing & x')).toMatch(new RegExp(`${S}\\\\tabincell\\{c\\}\\{LOC`))
  })
  it('inside \\multicolumn and \\multirow, before the \\shortstack that holds the break: never before a \\multicolumn', () => {
    expect(marked('x & testing & \\multicolumn{1}{c}{\\multirow{2}{*}{\\shortstack{Success \\\\ Rate}}}')).toMatch(
      new RegExp(`\\\\multicolumn\\{1\\}\\{c\\}\\{\\\\multirow\\{2\\}\\{\\*\\}\\{${S}\\\\shortstack\\{Success`),
    )
  })
  it('inside a font group that holds the box, before the box (the innermost group that holds every break)', () => {
    expect(marked('\\textbf{\\makecell[l]{Bold \\\\ lines}} & testing & x')).toMatch(
      new RegExp(`\\\\textbf\\{${S}\\\\makecell\\[l\\]\\{Bold`),
    )
  })
  it('after a \\cellcolor at the head, before the box', () => {
    expect(marked('\\cellcolor{red}\\makecell{X \\\\ Y} & testing & x')).toMatch(new RegExp(`\\\\cellcolor\\{red\\}${S}\\\\makecell\\{X`))
  })
})

describe('the start marks that stay where they were', () => {
  it('a cell of one line', () => {
    expect(marked('\\makecell{Error rate \\\\ on test set} & testing & x')).toMatch(new RegExp(`& ${S}testing\\\\axtend`))
  })
  it('a cell whose first word stands before the box', () => {
    expect(marked('Total \\makecell{left \\\\ right} & testing & x')).toMatch(new RegExp(`${S}Total \\\\makecell\\{left`))
  })
  it('no mark between an inner row’s end and a rule that opens the next inner row', () => {
    expect(marked('\\begin{tabular}{@{}c@{}}Top \\\\ \\hline Bottom\\end{tabular} & testing & x')).toMatch(
      /Top \\\\ \\hline Bottom\\axtend\{t\d+e\}\\end\{tabular\}/,
    )
  })
})
