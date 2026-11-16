import { describe, expect, it } from 'vitest'
import { inMemory, loadProject, type SourceUnit, tableGrid } from '../../packages/engine/src/source/latex-front.ts'
import { openPaper, originalFiles } from '../../packages/engine/src/compile/live.ts'
import { LAYOUT_CLASSES } from '../../packages/engine/src/marks/marks.ts'
import { plainSource as plainOf } from '../../packages/engine/tests/helpers/unit-harness.ts'

// A table's consistency groups (the table-groups brief, 2026-10-07): the grid the TeX front end reads, each cell's
// group and the decision over what came back (the layer's rows read it: layer-proto/rows.mjs layerRows)

const enc = (s: string) => new TextEncoder().encode(s)
/** a unit's source as plain text (mt.mjs plainSource, over the front end's units) */
const plainSource = (u: SourceUnit) => plainOf(u as unknown as Parameters<typeof plainOf>[0])
const doc = (body: string, prose = 'The prose names AlphaNet and BetaNet in running text.') => `\\documentclass{article}\n\\begin{document}\n${prose}\n\n${body}\n\\end{document}\n`
const unitsOf_ = (tex: string) => loadProject(inMemory(new Map([['main.tex', enc(tex)]])), 'main.tex', { tables: true }).units as (SourceUnit & { file: string; start: number })[]
const cells = (tex: string) => unitsOf_(tex).filter(u => u.kind === 'cell').map(u => ({ text: plainSource(u), ...u.cell }))
/** a grid's cells of a body, without their offsets and their blocks' bands (R4's: `bands` below) */
const grid = (body: string) => tableGrid(body, 0, body.length).map(({ start: _s, end: _e, band: _b, ...c }) => c)
/** each cell's [row, col, band]: the row its block begins at (R4, PDF-READER §18.72) */
const bands = (body: string) => tableGrid(body, 0, body.length).map(c => [c.row, c.col, c.band])

describe('tableGrid: a table body as its cells lay it out', () => {
  it("states each cell's block band: a rule across the table, a partial rule over its columns, REVTeX's \\colrule", () => {
    expect(bands('A & 1 \\\\ B & 2 \\\\ \\cmidrule{2-2} C & 3 \\\\ \\midrule D & 4 \\\\ \\colrule E & 5')).toEqual([
      [0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 0], [2, 0, 0], [2, 1, 2], [3, 0, 3], [3, 1, 3], [4, 0, 4], [4, 1, 4],
    ])
    // (a \\cline over both columns, a \\cmidrule(lr) with its trim, a \\multicolumn's span crossing a partial rule's range)
    expect(bands('A & 1 \\\\ \\cline{1-2} B & 2 \\\\ \\cmidrule(lr){1-1} \\multicolumn{2}{c}{C}')).toEqual([[0, 0, 0], [0, 1, 0], [1, 0, 1], [1, 1, 1], [2, 0, 2]])
  })
  it('reads rows and columns by & and \\\\, a \\multicolumn spanning its columns, outside braces, math and comments', () => {
    expect(grid('a & {b & c} & $x & y$ \\\\ \\multicolumn{2}{c}{d} & e % f & g\n \\\\[2pt] h')).toEqual([
      { row: 0, col: 0, span: 1, head: false }, { row: 0, col: 1, span: 1, head: false }, { row: 0, col: 2, span: 1, head: false },
      { row: 1, col: 0, span: 2, head: false }, { row: 1, col: 2, span: 1, head: false },
      { row: 2, col: 0, span: 1, head: false },
    ])
  })
  it('the header is the rows above the first rule across the table: a \\cmidrule under a spanning heading does not end it', () => {
    const body = '\\toprule\n\\multirow{2}{*}{Model} & \\multicolumn{2}{c}{BLEU} \\\\\n\\cmidrule{2-3}\n& EN-DE & EN-FR \\\\\n\\hline\nByteNet & 1 & 2 \\\\\nGNMT & 3 & 4 \\\\\nMoE & 5 & 6 \\\\\n\\bottomrule'
    expect(grid(body).filter(c => c.head).map(c => [c.row, c.col])).toEqual([[0, 0], [0, 1], [1, 0], [1, 1], [1, 2]])
    expect(grid(body).filter(c => !c.head && c.col === 0).map(c => c.row)).toEqual([2, 3, 4, 5])
  })
  it('a rule\'s own arguments are its, a cell\'s first group after it the cell\'s (\\hline {\\bf Parser})', () => {
    const body = '\\specialrule{1pt}{-1pt}{0pt}\n{\\bf Parser} & {\\bf F1} \\\\ \\cmidrule(lr){1-2}\nA & 1 \\\\\n\\hline\nB & 2 \\\\ C & 3 \\\\ D & 4'
    expect(grid(body).filter(c => c.head).map(c => c.row)).toEqual([0, 0, 1, 1])
  })
  it('colortbl\'s \\rowcolor is a row\'s colour with its overhangs, no cell: a row of it alone holds nothing, and the header is the rows above the rule that hold any (2610.40394v1)', () => {
    const body = '\\rowcolor{gray!15}[0pt][0pt]\n\\multicolumn{2}{l}{Head words} \\\\\n\\rowcolor{gray!15}[0pt][0pt]\n\\\\\n\\hline\nA & B \\\\\nC & D \\\\\nE & F \\\\'
    expect(grid(body).filter(c => c.head).map(c => [c.row, c.col])).toEqual([[0, 0]])
  })
  it('no rule after the first rows, or one with no fewer rows below it than above: no header', () => {
    expect(grid('A & B \\\\ c & d \\\\ e & f').some(c => c.head)).toBe(false)
    expect(grid('\\toprule A & B \\\\ c & d \\\\ \\midrule e & f \\\\ \\bottomrule').some(c => c.head)).toBe(false)
    expect(grid('\\toprule A & B \\\\ \\bottomrule').some(c => c.head)).toBe(false)
  })
  it('a nested environment is one cell\'s content, its own & and \\\\ its own', () => {
    expect(grid('\\begin{tabular}{c}a\\\\b\\end{tabular} & c \\\\ \\hline d & e \\\\ f & g').map(c => [c.row, c.col, c.head])).toEqual([[0, 0, true], [0, 1, true], [1, 0, false], [1, 1, false], [2, 0, false], [2, 1, false]])
  })
})

describe('loadProject: each cell unit carries its place in its table', () => {
  const tex = doc('\\begin{tabular}{ll}\n\\toprule\nModel & Training cost \\\\\n\\midrule\nAlphaNet & fast training \\\\\nBetaNet & slow \\begin{tabular}{c}long\\\\training\\end{tabular} \\\\\n\\bottomrule\n\\end{tabular}\n\n\\begin{tabular}{l}\nOne cell of another table \\\\\n\\end{tabular}')
  // (a one-column tabular of several rows nested in a cell sets lines of that cell's text, one unit with its forced break, and is
  // no table of its own: the next table is the paper's second, PDF-READER §18.75; it was three units and the third table)
  it('its table, row, column and span, and whether its row is the header\'s; a nested one-column table\'s lines are the outer cell\'s text', () => {
    expect(cells(tex)).toEqual([
      { text: 'Model', table: 1, row: 0, col: 0, span: 1, head: true },
      { text: 'Training cost', table: 1, row: 0, col: 1, span: 1, head: true },
      { text: 'AlphaNet', table: 1, row: 1, col: 0, span: 1, head: false },
      { text: 'fast training', table: 1, row: 1, col: 1, span: 1, head: false },
      { text: 'BetaNet', table: 1, row: 2, col: 0, span: 1, head: false },
      { text: 'slow long training', table: 1, row: 2, col: 1, span: 1, head: false },
      { text: 'One cell of another table', table: 2, row: 0, col: 0, span: 1, head: false },
    ])
  })
})

describe('loadProject: an environment whose begin code begins a table is a table (2610.40576v1\'s casetable)', () => {
  // (read as a paragraph, its body was one unit across its rows, and our marks stood between a row's end and the next row's
  // rule: "Misplaced \noalign" eighteen times, and two guard compiles a prepare)
  const pre = String.raw`\newenvironment{casetable}{%
  \setlength{\tabcolsep}{0pt}%
  \tabularx{\linewidth}{lX}
  \textsc{trajectory excerpts} & \textsc{observations}\\[3pt]
}{\endtabularx}
\newenvironment{pairs}[1]{\begin{center}\begin{tabular}{#1}}{\end{tabular}\end{center}}
\newenvironment{plain}{\begin{center}\begin{tabular}{l}x\end{tabular}}{\end{center}}
\newcommand{\cseg}[2]{\specialrule{.4pt}{5pt}{3pt}\multicolumn{2}{l}{\textcolor{#2}{\bfseries #1}}\\[4pt]}
\newcommand{\crow}{\\[6pt]}
`
  const body = String.raw`\begin{casetable}
\cseg{Student continuation words}{red}
A first cell of words & a second cell of words\crow
A third cell of words & a fourth cell of words\\
\end{casetable}

\begin{pairs}{ll}
Left cell words & right cell words \\
\end{pairs}

\begin{plain}
Prose after a closed table.
\end{plain}`
  const tex = `\\documentclass{article}\n${pre}\\begin{document}\n${body}\n\\end{document}\n`
  it('its body\'s cells are units of their own, placed in its grid; one whose begin code closes its table is a container', () => {
    expect(unitsOf_(tex).map(u => [u.kind, plainSource(u)])).toEqual([
      ['cell', 'Student continuation words'], ['cell', 'A first cell of words'], ['cell', 'a second cell of words'],
      ['cell', 'A third cell of words'], ['cell', 'a fourth cell of words'],
      ['cell', 'Left cell words'], ['cell', 'right cell words'],
      ['para', 'Prose after a closed table.'],
    ])
    expect(cells(tex).slice(1, 3).map(c => [c.row, c.col])).toEqual([[1, 0], [1, 1]])
  })
  it('a row-ending macro read as TeX reads its arguments, a group or one token; one whose body holds cells (`&`) as before (Devin on #549)', () => {
    const more = String.raw`\newcommand{\rowtitle}[1]{\multicolumn{2}{c}{#1}\\}\newcommand{\Title}{Some title words}\newcommand{\both}[2]{\textbf{#1} & \textit{#2}\\}`
    const t = (rows: string) => `\\documentclass{article}\n${more}\n\\begin{document}\n\\begin{tabular}{ll}\n${rows}\n\\end{tabular}\n\\end{document}\n`
    // (an unbraced argument: the row ended after it in the grid as in the walk)
    expect(cells(t('\\rowtitle\\Title\nAfter the title & More words\\\\')).map(c => [c.text, c.row, c.col])).toEqual([['After the title', 1, 0], ['More words', 1, 1]])
    // (a body that sets two cells: its call as the paper's macro was read before, the rows after it where they were)
    expect(cells(t('\\both{Left text here}{Right text here}\nNext cell words & Value words\\\\')).map(c => [c.text, c.row, c.col])).toEqual([['Next cell words', 0, 0], ['Value words', 0, 1]])
  })
  it('…nor one defined otherwise too, nor one that stores its text (Codex on #549)', () => {
    const t = (more: string, rows: string) => `\\documentclass{article}\n${more}\n\\begin{document}\n\\begin{tabular}{lll}\n${rows}\n\\end{tabular}\n\\end{document}\n`
    // (a \def after the \newcommand is the definition TeX uses: no row's end)
    const def = t(String.raw`\newcommand{\celltext}[1]{#1\\}\def\celltext#1{#1}`, 'First column & \\celltext{Second column} & Third column\\\\')
    expect(cells(def).map(c => [c.text, c.row, c.col])).toEqual([['First column', 0, 0], ['Second column', 0, 1], ['Third column', 0, 2]])
    // (its text kept for elsewhere: a front unit with no mark, as before, the row still ended after the call)
    const stored = t(String.raw`\newcommand{\saverow}[1]{\gdef\saved{#1}Visible words\\}`, '\\saverow{Kept row words here}\nNext cell words & More words & Last\\\\')
    const paper = openPaper(new Map([['main.tex', enc(stored)]]))
    const marked = new TextDecoder().decode(originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES }).get('main.tex'))
    expect(marked).toContain('\\saverow{Kept row words here}')
    expect(cells(stored).filter(c => c.text.startsWith('Next')).map(c => [c.row, c.col])).toEqual([[1, 0]])
  })
  it('no mark of ours between a row\'s end and the next row', () => {
    const paper = openPaper(new Map([['main.tex', enc(tex)]]))
    const marked = new TextDecoder().decode(originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES }).get('main.tex'))
    expect(marked).toMatch(/\\crow\nA third|\\crow\n\\leavevmode\\axtmark\{t\d+s\}A third/)
    expect(marked).not.toMatch(/\\axtpm\{[^}]*\}\\crow|\\crow\\axt/)
    expect(marked).toMatch(/\\begin\{casetable\}\n\\cseg\{/)
  })
})

