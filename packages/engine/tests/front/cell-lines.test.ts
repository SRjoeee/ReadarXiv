// @vitest-environment node
// A table cell's unit is the grid's cell (docs/PDF-READER.md §18.75, the owner's decision of 2026-11-15): the source reader ends
// a cell's unit where the table's grid ends the cell (tableGrid: `&` and a row's end outside braces, math, comments and nested
// environments), and a `\\` inside the cell, in a box the cell holds (\makecell, \shortstack, a one-column tabular nested in it,
// a paper macro's argument), is a forced break of the cell's text, as it is in a paragraph. Read through the source reader's
// public reading (loadProject) and the front half's facts (unitFactsOf: R1, R2), on sources of our own.
import { describe, expect, it } from 'vitest'
import { openPaper } from '../../src/compile/live.ts'
import { elementKindOf, unitFactsOf } from '../../src/instrument/instrument.ts'
import { forcedBreak, inMemory, loadProject, phPiece, startOf } from '../../src/source/latex-front.ts'

type Piece = { t: string; s?: string; src?: string }
type Unit = { kind: string; pieces: Piece[]; cell?: { row: number; col: number } }
const enc = (s: string) => new TextEncoder().encode(s)
const PROSE = 'The running text of the paper names Gemini as a model.'
const doc = (preamble: string, body: string) =>
  `\\documentclass{article}\n\\usepackage{makecell}\n\\usepackage{multirow}\n${preamble}\n\\begin{document}\n${PROSE}\n\n${body}\n\\end{document}\n`
const unitsOf = (preamble: string, body: string): Unit[] =>
  loadProject(inMemory(new Map([['main.tex', enc(doc(preamble, body))]])), 'main.tex', { tables: true }).units
const words = (u: Unit) =>
  u.pieces
    .filter((p) => p.t === 'text')
    .map((p) => p.s)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
const BREAK = /^\\\\\*?(\[[^\]]*\])?$/
const breaks = (u: Unit) => u.pieces.filter((p) => p.t === 'ph' && BREAK.test(p.src ?? '')).length
const at = (us: Unit[], row: number, col: number) => us.filter((u) => u.kind === 'cell' && u.cell?.row === row && u.cell?.col === col)
const table = (head: string) => `\\begin{tabular}{c|c}\n\\hline\n${head} & testing \\\\\n\\hline\n1.5 & 2.5 \\\\\n\\hline\n\\end{tabular}`
/** the cell at row 0, column 0 is ONE unit: these words, this many forced breaks */
const one = (us: Unit[], text: string, n = 1) => {
  const c = at(us, 0, 0)
  expect(c.map((u) => ({ words: words(u), breaks: breaks(u) }))).toEqual([{ words: text, breaks: n }])
}

describe("a cell set on several lines is one unit, each `\\\\` inside it a forced break (it was one unit a line)", () => {
  it("A: a paper macro whose body is a one-column tabular (1512.03385v1's \\tabincell): one unit, the call a pair round it", () => {
    const us = unitsOf('\\newcommand{\\tabincell}[2]{\\begin{tabular}{@{}#1@{}}#2\\end{tabular}}', table('\\tabincell{c}{Error rate \\\\ on test set}'))
    one(us, 'Error rate on test set')
    expect(at(us, 0, 0)[0]!.pieces.some((p) => p.t === 'open' && p.src === '\\tabincell{c}{')).toBe(true)
  })
  it('B: makecell', () => one(unitsOf('', table('\\makecell{Error rate \\\\ on test set}')), 'Error rate on test set'))
  it('C: shortstack', () => one(unitsOf('', table('\\shortstack{Error rate \\\\[1pt] on test set}')), 'Error rate on test set'))
  it('D: a one-column tabular nested in the cell, its begin and end a pair round its rows', () => {
    const us = unitsOf('', table('\\begin{tabular}[c]{@{}c@{}}Error rate \\\\ on test set\\end{tabular}'))
    one(us, 'Error rate on test set')
    expect(at(us, 0, 0)[0]!.pieces.filter((p) => p.t === 'open' || p.t === 'close').map((p) => p.src)).toEqual([
      '\\begin{tabular}[c]{@{}c@{}}',
      '\\end{tabular}',
    ])
  })
  it('I: under \\multicolumn and \\multirow, \\shortstack: one unit', () => {
    const us = unitsOf('', table('\\multicolumn{1}{c}{\\multirow{2}{*}{\\shortstack{Success \\\\ Rate (\\%)}}}'))
    one(us, 'Success Rate (%)')
  })
  it('J: a rule between the nested rows is a placeholder of the unit, no cut', () => {
    const us = unitsOf('', table('\\begin{tabular}{@{}c@{}}Error rate \\\\ \\hline on test set\\end{tabular}'))
    one(us, 'Error rate on test set')
    expect(at(us, 0, 0)[0]!.pieces.some((p) => p.t === 'ph' && p.src === '\\hline')).toBe(true)
  })
})

describe('the other side, held', () => {
  it('E: a tabular of two columns nested in a cell is a table of its own: its four cells four units', () => {
    const us = unitsOf('', table('\\begin{tabular}{cc}alpha one & beta two \\\\ gamma three & delta four\\end{tabular}'))
    expect(at(us, 0, 0).map(words)).toEqual(['alpha one', 'beta two', 'gamma three', 'delta four'])
  })
  it('F: two rows of one-line cells stay two units', () => {
    const us = unitsOf('', '\\begin{tabular}{c|c}\n\\hline\nError rate & testing \\\\\non test set & \\\\\n\\hline\n1.5 & 2.5\n\\end{tabular}')
    expect([at(us, 0, 0).map(words), at(us, 1, 0).map(words)]).toEqual([['Error rate'], ['on test set']])
  })
  it("G: an author block's tabular keeps a name and a place apart", () => {
    const tex =
      '\\documentclass{article}\n\\title{A title}\n\\author{\\begin{tabular}{c}Alice Example \\\\ Example University\\end{tabular}}\n\\begin{document}\n\\maketitle\nThe running text.\n\\end{document}\n'
    const us = (loadProject(inMemory(new Map([['main.tex', enc(tex)]])), 'main.tex', { tables: true }).units as Unit[]).filter((u) =>
      /Alice|University/.test(words(u)),
    )
    expect(us.map(words)).toEqual(['Alice Example', 'Example University'])
  })
  it('H: a one-column tabular of one row nested in a cell is its unit as before', () => {
    // (its pieces as the source reader cut it before: no begin or end of the nested tabular, so its id and rows stay)
    const nested = at(unitsOf('', table('\\begin{tabular}[c]{@{}c@{}}\\textbf{Meta}\\end{tabular}')), 0, 0)
    expect(nested.map((u) => u.pieces.map((p) => (p.t === 'text' ? p.s : p.src)))).toEqual([['\\textbf{', 'Meta', '}']])
  })
})

describe('the names rules read a cell of several lines as one text (R1, R2: instrument/language.ts)', () => {
  const judged = (head: string) => {
    const paper = openPaper(new Map([['main.tex', enc(doc('', table(head)))]]))
    const facts = unitFactsOf(paper)
    return (paper.units as unknown as Unit[]).flatMap((u, i) =>
      u.kind === 'cell' && u.cell?.row === 0 && u.cell.col === 0 ? [[words(u), facts.kept.has(i) ? (facts.why.get(i) ?? null) : null]] : [],
    )
  }
  it('a text of words on two lines is sent whole', () => expect(judged('\\makecell{Error rate \\\\ on test set}')).toEqual([['Error rate on test set', null]]))
  it("a name the paper's running text writes and a version under it are kept whole (R2)", () =>
    expect(judged('\\shortstack{Gemini \\\\ (2.5-flash)}')).toEqual([['Gemini (2.5-flash)', 'paperNames']]))
  it('a number over a word in brackets is sent: the word is language', () =>
    expect(judged('\\makecell{0.824 \\\\ (reference)}')).toEqual([['0.824 (reference)', null]]))
  it('numbers and identifiers on every line are kept whole (R1)', () =>
    expect(judged('\\makecell{EER: 0.072 \\\\ ROC AUC: 0.960}')).toEqual([['EER: 0.072 ROC AUC: 0.960', 'words']]))
})

// (a paper's own row-ending macro, rowEndsOf's: a macro of no parameter whose body ends a row, `\newcommand{\br}{\\}`, one for each
// form of such a body; inside a grid cell, in a box the cell holds, it ends a line of the box as `\\` does there: the forced break
// of the cell's text, stated on its piece where the walk makes it, and read as such: its element a `break` (the instrument's
// kind) and the cell's start mark before the box that holds every forced break (startOf, the marking's))
const MACROS = '\\newcommand{\\br}{\\\\}\n\\newcommand{\\brs}{\\\\[2pt]}\n\\newcommand{\\brt}{\\tabularnewline}\n\\newcommand{\\brh}{\\\\\\hline}'
const BOXES: [string, (x: string) => string][] = [
  ['\\shortstack', (x) => `\\shortstack{${x}}`],
  ['\\makecell', (x) => `\\makecell{${x}}`],
  ['\\parbox', (x) => `\\parbox{3cm}{${x}}`],
  ['a nested one-column tabular', (x) => `\\begin{tabular}[c]{@{}c@{}}${x}\\end{tabular}`],
]
/** the cell at row 0, column 0: its words, its elements' kinds by source, and whether its start mark stands before its box (the
 *  unit's first open piece) */
const stated = (head: string) => {
  const c = at(unitsOf(MACROS, table(head)), 0, 0)
  const ps = c[0]?.pieces ?? []
  return {
    units: c.length,
    words: c[0] ? words(c[0]) : '',
    kinds: ps.flatMap((p) => (p.t === 'ph' && p.src !== '\\hline' ? [[p.src, elementKindOf(p)]] : [])),
    beforeBox: startOf(ps as never, true)[0] === ps.findIndex((p) => p.t === 'open'),
  }
}
describe("a paper's row-ending macro inside a grid cell is a forced break of the cell, as `\\\\` is there (§18.75)", () => {
  it("the reviewer's example: \\newcommand{\\br}{\\\\} in a \\shortstack", () =>
    expect(stated('\\shortstack{Error rate \\br on test set}')).toEqual({
      units: 1,
      words: 'Error rate on test set',
      kinds: [['\\br', 'break']],
      beforeBox: true,
    }))
  for (const [name, box] of BOXES)
    for (const body of ['\\br', '\\brs', '\\brt', '\\brh'])
      it(`${name}, the macro ${body}: one unit, its element a break, the start mark before the box`, () =>
        expect(stated(box(`Error rate ${body} on test set`))).toEqual({
          units: 1,
          words: 'Error rate on test set',
          kinds: [[body, 'break']],
          beforeBox: true,
        }))
  it('a cell mixing `\\\\` and the macro: one unit, both breaks', () => {
    expect(stated('\\makecell{Error rate \\\\ on test \\br set}')).toEqual({
      units: 1,
      words: 'Error rate on test set',
      kinds: [
        ['\\\\', 'break'],
        ['\\br', 'break'],
      ],
      beforeBox: true,
    })
    expect(stated('\\shortstack{Error rate \\br on test \\\\ set}').kinds).toEqual([
      ['\\br', 'break'],
      ['\\\\', 'break'],
    ])
  })
  it('the empty group after the call is the break’s, as the row’s end takes it', () =>
    expect(stated('\\makecell{Error rate \\br{} on test set}').kinds).toEqual([['\\br{}', 'break']]))
  it('the macro at the grid’s row end ends the row, as before', () => {
    const us = unitsOf(MACROS, '\\begin{tabular}{c|c}\n\\hline\nError rate & testing \\br\n\\hline\non test set & 2.5 \\brh\n\\end{tabular}')
    expect([at(us, 0, 0).map(words), at(us, 1, 0).map(words)]).toEqual([['Error rate'], ['on test set']])
  })
})

describe('LaTeX’s \\break is a forced break of its unit’s text, as `\\\\` and \\newline are', () => {
  it('states \\break a forced break, its element a break; a macro whose name begins so none', () => {
    // (the coordinator's ruling 4 of 2026-11-16: 2608.03841v2's amsart addresses, `\hfill\break\indent`, the marked compile
    // stating where each ends its line, BREAKS_TEX's point)
    expect(forcedBreak(phPiece('\\break'))).toBe(true)
    expect(elementKindOf(phPiece('\\break'))).toBe('break')
    expect(forcedBreak(phPiece('\\breakline'))).toBe(false)
    expect(forcedBreak(phPiece('\\linebreak'))).toBe(false)
  })
})
