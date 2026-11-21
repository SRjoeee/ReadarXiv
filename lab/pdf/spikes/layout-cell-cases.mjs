// lab/pdf/spikes/layout-cell-cases.mjs
// A table cell's alignment under TeX (packages/engine/src/marks/marks.ts LAYOUT_TEX's AXT-CELL, the class LaTeX built the
// cell's column template from, and AXT-ALIGN at a cell's end mark, its own paragraph's; read by packages/engine/src/marks/
// channels.ts readAlign): small documents, each cell unit's start and end mark set by hand as layoutMarking sets them
// (`\leavevmode\axtmark{t<i>s}` … `\axtend{t<i>e}`), compiled in each pinned TeX Live year's image under pdfLaTeX, XeLaTeX,
// LuaLaTeX and latex (arXiv's DVI compiler, its DVI made a PDF by dvipdfmx, with the DVI marks the marked original sets for it:
// DVI_MARK_DEF, DVI_LAYOUT_TEX), each cell's reading held to how TeX set it. The cases: LaTeX's own tabular (l, c, r, p, \multicolumn), array's
// (m and b, >{\centering\arraybackslash}p, a braced cell, a cell holding a tabular and a cell of a tabular in another cell),
// siunitx's S column (a braced text, centred), colortbl's colours (its template sets the cell in a box and paints leaders),
// tabularx's X, longtable, multirow and makecell, nicematrix's NiceTabular (its preamble LaTeX's), REVTeX's classes (revtex4,
// revtex4-1, revtex4-2: ltxutil builds a template by appending tokens it leaves unexpanded), and tables no template of
// LaTeX's sets: tabularray's tblr (its cells set as paragraphs: their own) and a plain \halign (nothing), neither of which
// may state a class, nor pass a cell's to a later table. With --base=<file> (the head of MARK_DEF and LAYOUT_TEX before the
// change, one file), each document is compiled with it too and the two PDFs are held equal byte for byte but for LuaTeX's
// trailer /ID: the readings put nothing in the PDF; and where the head sets cells' end points (below), the two pages' glyphs and
// rules equal (each glyph's character, advance, baseline and size and each box's edges to 0.001 pt; LuaTeX's to 0.011, the shift its
// PDF writer gives a glyph after a literal, POINTS_TEX's accepted bound; under dvipdfmx the text run a point splits placed anew by
// the writer, sameInk) and every point of the base's at its place in the stream, the head's cell end points the only ones added.
// The cell's end (the statement that an element's ink ends where TeX ends what it stands in, for a cell its cell's end: LAYOUT_TEX's
// \axt@te sets `t<i>x` at the end of the cell's template, where it writes AXT-CELL): every cell of a LaTeX template holds its
// point after its end mark, nothing between the two but the pieces TeX set after the cell's last text (a piece whose opening mark
// stands alone, as layoutMarking writes one whose source ends in a control word or whose class may read ahead), never a glyph of
// a later cell nor a rule TeX painted after the cell (the column's rules, a row's rules, a later row's ground); its destination at or
// past the cell's last ink across. A cell no template of LaTeX's sets (tabularray's tblr, a plain \halign) holds none, nor a p
// column of LaTeX's own tabular with array.sty not loaded (latex.ltx builds its template by \@classv, which the marks do not
// wrap: NO_END); those cells are read as before. The cases
// `end…` are one preamble kind each: a plain tabular with column and row rules, tabular*, tabularx's X, longtable over a page break,
// siunitx's S, array in math, \multicolumn under booktabs' \cmidrule, \multirow, colortbl's \rowcolor and \cellcolor, booktabs'
// rules, a cell ending in a control word, before `\\[2pt]`, before a comment, beside an empty cell, a nested tabular.
// Exit 1 on a reading that is not TeX's, a TeX error, or a PDF that differs.
//   pnpm exec tsx lab/pdf/spikes/layout-cell-cases.mjs [--years=2023,2025] [--engines=pdflatex,…] [--only=<case>,…]
//     [--base=<head.tex>] [--out=<dir>] [--ends]   (--ends: each cell's end point as read, for the table)
// Docker with the years' pinned images (lab/pdf/compile-images.json); no network.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pageInk } from '@readarxiv/engine'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readAlign } from '../../../packages/engine/src/marks/channels.ts'
import { DVI_MARK_DEF, MARK_DEF } from '../../../packages/engine/src/source/latex-front.ts'
import { DVI_LAYOUT_TEX, LAYOUT_TEX } from '../../../packages/engine/src/marks/marks.ts'
import { checkCompileImage, compileImageRef } from './compile-image.mjs'

const arg = name => { const a = process.argv.find(x => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null }
const YEARS = (arg('years') ?? '2023,2025').split(',')
const ENGINES = (arg('engines') ?? 'pdflatex,xelatex,lualatex,latex').split(',')
const OUT = resolve(arg('out') ?? join(tmpdir(), `layout-cell-cases-${process.pid}`))
const BASE = arg('base') ? readFileSync(resolve(arg('base')), 'latin1') : null

/** a cell unit between its marks, as layoutMarking writes them */
const C = (i, text = `cell ${i}`) => `\\leavevmode\\axtmark{t${i}s}${text}\\axtend{t${i}e}`
/** a unit no cell's (an author block's, a paragraph), between its marks as layoutMarking writes them */
const U = (i, text = `unit ${i}`) => `\\leavevmode\\axtmark{${i}s}${text}\\axtend{${i}e}`
const doc = (pre, body, cls = 'article') => `\\documentclass${cls === 'article' ? '' : '[aps,pra,twocolumn]'}{${cls}}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`
const LONG = 'a text longer than any cell'
/** a cell whose last piece stands after its end mark with its opening mark alone, as layoutMarking writes a cell's trailing piece
 *  whose source ends in a control word or whose class may read ahead (`\checkmark`, a paper's macro, `\textsuperscript{…}`) */
const T = (i, text, piece, k = 3) => `\\leavevmode\\axtmark{t${i}s}${text}\\axtend{t${i}e} \\axtpma{p${i}.${k}a}${piece} `
/** the end cases' own macros: a paper's macros of one letter each */
const OWN = '\\newcommand{\\ok}{v}\\newcommand{\\B}{B}'

/** a cell set on several lines (§18.75): its start mark before the box that holds its lines, as the marking sets it, or with
 *  --inside after the box's open (the marking before), its end mark after its last word; `box` [open, lines, close] */
const INSIDE = process.argv.includes('--inside')
const M = (i, [open, lines, close]) =>
  INSIDE ? `${open}\\leavevmode\\axtmark{t${i}s}${lines}\\axtend{t${i}e}${close}` : `\\leavevmode\\axtmark{t${i}s}${open}${lines}\\axtend{t${i}e}${close}`
/** the boxes a cell's lines stand in (lane hdr-lines' census: \\makecell, \\shortstack, a nested one-column tabular, a paper's
 *  macro, a \\parbox), each [open, lines, close, the cell's alignment where it is its own paragraph's] */
const BOXES = [
  ['\\makecell{', 'Two \\\\ lines', '}'],
  ['\\makecell[l]{', 'Two \\\\ lines', '}'],
  ['\\makecell[r]{', 'Two \\\\ lines', '}'],
  ['\\shortstack{', 'Two \\\\[1pt] lines', '}'],
  ['\\shortstack[l]{', 'Two \\\\ lines', '}'],
  ['\\begin{tabular}[c]{@{}c@{}}', 'Two \\\\ lines', '\\end{tabular}'],
  ['\\begin{tabular}[c]{@{}c@{}}', 'Two \\\\[2pt] lines', '\\end{tabular}'],
  ['\\begin{tabular}[c]{@{}c@{}}', 'Two \\\\ \\hline lines', '\\end{tabular}'],
  ['\\tabincell{c}{', 'Two \\\\ lines', '}'],
  ['\\parbox[t]{2cm}{', 'Two \\\\ lines', '}', 'j'],
]
const TABINCELL = '\\newcommand{\\tabincell}[2]{\\begin{tabular}{@{}#1@{}}#2\\end{tabular}}'
/** a paper's own row-ending macros (rowEndsOf: no parameter, a body that ends a row), one for each form of such a body; inside a
 *  cell's box each is the forced break `\\\\` is there (§18.75), marked as the cell written with `\\\\` is */
const ROW_ENDS = '\\newcommand{\\br}{\\\\}\\newcommand{\\brs}{\\\\[2pt]}\\newcommand{\\brt}{\\tabularnewline}\\newcommand{\\brh}{\\\\\\hline}'
/** the boxes of BOXES with their lines ended by such a macro, and four that mix the macro and `\\\\` (a \\tabularnewline body in the
 *  boxes that are tabulars, \\makecell's and a nested tabular; a body that draws a rule in a nested tabular) */
const MACRO_BOXES = [
  ['\\makecell{', 'Two \\br lines', '}'],
  ['\\makecell[l]{', 'Two \\brs lines', '}'],
  ['\\makecell[r]{', 'Two \\brt lines', '}'],
  ['\\shortstack{', 'Two \\br lines', '}'],
  ['\\shortstack[l]{', 'Two \\brs lines', '}'],
  ['\\begin{tabular}[c]{@{}c@{}}', 'Two \\br lines', '\\end{tabular}'],
  ['\\begin{tabular}[c]{@{}c@{}}', 'Two \\brt lines', '\\end{tabular}'],
  ['\\begin{tabular}[c]{@{}c@{}}', 'Two \\brh lines', '\\end{tabular}'],
  ['\\tabincell{c}{', 'Two \\br lines', '}'],
  ['\\parbox[t]{2cm}{', 'Two \\br lines', '}', 'j'],
  ['\\makecell{', 'Two \\\\ more \\br lines', '}'],
  ['\\shortstack{', 'Two \\br more \\\\ lines', '}'],
  ['\\begin{tabular}[c]{@{}c@{}}', 'Two \\\\ more \\brh lines', '\\end{tabular}'],
  ['\\parbox[t]{2cm}{', 'Two \\br more \\\\ lines', '}', 'j'],
]
/** each case: its document, each cell's alignment as TeX set it (a letter where TeX's reading must state it, '-' where nothing
 *  may be stated), and the cells no template of LaTeX's set, for which no class may be written (AXT-CELL) */
const CASES = {
  kernel: [doc('', [
    '\\begin{tabular}{lcrp{3cm}}',
    `${C(1)} & ${C(2)} & ${C(3)} & ${C(4)} \\\\`,
    `${LONG} & ${LONG} & ${LONG} & x \\\\`,
    // (\centering makes \\ a line's end in its cell: the row ends by \tabularnewline)
    `\\multicolumn{1}{r}{${C(5)}} & \\multicolumn{2}{c}{${C(6)}} & \\centering ${C(7)} \\tabularnewline`,
    `{${C(8)}} & \\textbf{${C(9)}} & {\\itshape ${C(10)}} & y \\\\`,
    '\\end{tabular}',
  ].join('\n')), { 1: 'l', 2: 'c', 3: 'r', 4: 'j', 5: 'r', 6: 'c', 7: 'c', 8: 'l', 9: 'c', 10: 'r' }],
  array: [doc('\\usepackage{array}', [
    '\\begin{tabular}{lcr>{\\centering\\arraybackslash}p{2.5cm}>{\\raggedleft\\arraybackslash}m{2.5cm}b{2cm}}',
    `${C(11)} & ${C(12)} & ${C(13)} & ${C(14)} & ${C(15)} & ${C(16)} \\\\`,
    `${LONG} & ${LONG} & ${LONG} & x & x & x \\\\`,
    `\\multicolumn{2}{l}{${C(17)}} & \\multicolumn{1}{c}{${C(18)}} & {${C(19)}} & & \\\\`,
    // (a cell holding a tabular of its own, r: the cell's class, never the inner cells'; a cell of a tabular in a cell, l)
    `x & ${C(20, 'outer \\begin{tabular}{r}inner\\\\inner two\\end{tabular}')} & \\begin{tabular}{l}${C(21)}\\\\${LONG}\\end{tabular} & & & \\\\`,
    '\\end{tabular}',
  ].join('\n')), { 11: 'l', 12: 'c', 13: 'r', 14: 'c', 15: 'r', 16: 'j', 17: 'l', 18: 'c', 19: 'c', 20: 'c', 21: 'l' }],
  siunitx: [doc('\\usepackage{siunitx}', [
    '\\begin{tabular}{lS[table-format=1.3(2)]S[table-format=2.1]}',
    `${C(30)} & {${C(31, 'Acc')}} & {${C(32, 'a text wider than its numbers')}} \\\\`,
    'x & 0.735(3) & 12.5 \\\\',
    'y & 0.347(12) & 1.0 \\\\',
    '\\end{tabular}',
  ].join('\n')), { 30: 'l', 31: 'c', 32: 'c' }],
  colortbl: [doc('\\usepackage[table]{xcolor}', [
    '\\begin{tabular}{>{\\columncolor{gray!20}}lcr}',
    `\\rowcolor{blue!10} ${C(41)} & ${C(42)} & ${C(43)} \\\\`,
    `${LONG} & ${LONG} & ${LONG} \\\\`,
    `\\cellcolor{red!20}${C(44)} & \\multicolumn{1}{>{\\columncolor{green!10}}r}{${C(45)}} & x \\\\`,
    '\\end{tabular}',
  ].join('\n')), { 41: 'l', 42: 'c', 43: 'r', 44: 'l', 45: 'r' }],
  tabularx: [doc('\\usepackage{tabularx}', [
    '\\begin{tabularx}{\\linewidth}{l>{\\centering\\arraybackslash}XX}',
    `${C(51)} & ${C(52)} & ${C(53)} \\\\`,
    '\\end{tabularx}',
  ].join('\n')), { 51: 'l', 52: 'c', 53: 'j' }],
  longtable: [doc('\\usepackage{longtable}', [
    '\\begin{longtable}{lcr}',
    `${C(61)} & ${C(62)} & ${C(63)} \\\\`,
    `${LONG} & ${LONG} & ${LONG} \\\\`,
    '\\end{longtable}',
  ].join('\n')), { 61: 'l', 62: 'c', 63: 'r' }],
  boxes: [doc('\\usepackage{multirow,makecell}', [
    '\\begin{tabular}{lc}',
    `\\multirow{2}{*}{${C(71)}} & ${C(72, '\\makecell{two\\\\lines}')} \\\\`,
    ` & ${LONG} \\\\`,
    '\\end{tabular}',
  ].join('\n')), { 71: 'l', 72: 'c' }],
  // (REVTeX's ltxutil builds a template's preamble by appending tokens it leaves unexpanded, its own macros run in the cell
  // (\array@row@rst, \cell@font): the class written after them must leave them so; revtex4's own \@mkpream, revtex4-2's
  // beside array's)
  ...Object.fromEntries(['revtex4', 'revtex4-1', 'revtex4-2'].map((cls, k) => {
    const i = 100 + 10 * k
    return [cls, [doc('', [
      '\\begin{tabular}{lcr}',
      `${C(i)} & ${C(i + 1)} & ${C(i + 2)} \\\\`,
      `${LONG} & ${LONG} & ${LONG} \\\\`,
      `\\multicolumn{2}{c}{${C(i + 3)}} & {${C(i + 4)}} \\\\`,
      '\\end{tabular}',
    ].join('\n'), cls), { [i]: 'l', [i + 1]: 'c', [i + 2]: 'r', [i + 3]: 'c', [i + 4]: 'r' }]]
  })),
  // (an author block's units, no cell's: NeurIPS's \And, each author a tabular[t]{c} of their own, and LaTeX's \author with
  // \and under \maketitle, each name and place its cell's line, in a brace group of its own or not: their column's class, each of
  // two units that share one cell's line too (the class places their line, which the lay runs as one). Not a unit in a box
  // inside the cell, whose line the box's is. A unit that is a
  // paragraph (a p column's) its paragraph's; a body's paragraph in a list and one holding a tabular theirs; longtable's
  // caption, in a \noalign, set as before)
  authors: [doc('\\usepackage{longtable}\n\\title{A}\n\\author{' + U(10, 'Alice Smith') + ' \\\\ ' + U(11, 'Some University') + ' \\and ' + U(12, 'Bob Jones') + '}', [
    '\\maketitle',
    `\\begin{tabular}[t]{c}\\bf\\rule{0pt}{24pt}${U(1, 'Ashish Vaswani')}\\footnotemark[1]\\\\ ${U(2, 'Google Brain')}\\\\ \\texttt{avaswani@google.com}\\\\`,
    `\\end{tabular}\\hfil\\linebreak[0]\\hfil\\begin{tabular}[t]{c}\\bf\\rule{0pt}{24pt}${U(3, 'Noam Shazeer')}\\footnotemark[1]\\\\ {${U(4, 'Google Research')}}\\\\ ${U(5, '{\\L}ukasz Kaiser')}\\end{tabular}`,
    '',
    `\\begin{tabular}{l} ${U(20)} \\\\ ${LONG} \\end{tabular}`,
    `\\begin{tabular}{c} ${U(21, 'A')}, ${U(22, 'B')} \\\\ ${LONG} \\\\ \\mbox{${U(23)}} \\\\ ${U(24, 'x')}\\footnotemark[2] \\end{tabular}`,
    `\\begin{tabular}{p{3cm}} ${U(26, 'a paragraph in a p column, long enough to break its lines in its cell')} \\end{tabular}`,
    '',
    `\\begin{itemize}\\item ${U(27, 'an item of a list, its paragraph justified')}\\end{itemize}`,
    '',
    `${U(28, 'a paragraph holding a tabular \\begin{tabular}{c} x \\end{tabular} and more words')}`,
    '',
    `\\begin{longtable}{c} \\caption{${U(29, 'A caption')}}\\\\ x \\\\ ${LONG} \\\\ \\end{longtable}`,
  ].join('\n')), { 1: 'c', 2: 'c', 3: 'c', 4: 'c', 5: 'c', 10: 'c', 11: 'c', 12: 'c', 20: 'l', 21: 'c', 22: 'c', 23: '-', 24: 'c', 26: 'j', 27: 'j', 28: 'j' }],
  // (the same under colortbl (xcolor's `table`, 2411.13093v4's NeurIPS author block), whose template sets the cell's content in an
  // \hbox it \unhbox-es into the cell: the content is the cell's line all the same, its units' class carried past the template's
  // own box (the content's level, \axt@cl before each column's content); never past a box of the paper's own, nor after a table
  // set in the cell, where the content's level is no longer known)
  authorsColortbl: [doc('\\usepackage{colortbl}', [
    `\\begin{tabular}[t]{c}\\bf\\rule{0pt}{24pt}${U(1, 'Yongdong Luo')}$^{1}$ \\quad ${U(2, 'Xiawu Zheng')}$^{1}$\\footnotemark[1] \\quad ${U(3, 'Guilin Li')} \\\\ \\textbf{${U(4, 'Chaoyou Fu')}} \\\\ \\mbox{${U(5)}} \\end{tabular}`,
    '',
    `\\begin{tabular}{c} \\begin{tabular}{c} x \\end{tabular} ${U(6, 'after a table')} \\\\ ${LONG} \\end{tabular}`,
    '',
    `\\begin{tabular}{lr} ${C(7)} & ${C(8)} \\\\ ${LONG} & ${LONG} \\end{tabular}`,
  ].join('\n')), { 1: 'c', 2: 'c', 3: 'c', 4: 'c', 5: '-', 6: '-', 7: 'l', 8: 'r' }],
  // (tabularray's tblr measures a cell in an \hbox, then sets it as a paragraph, \raggedright, \centering or \raggedleft: its
  // paragraph's; nicematrix's NiceTabular builds its preamble with LaTeX's; a plain \halign, no template of LaTeX's: nothing)
  others: [doc('\\usepackage{tabularray,nicematrix}', [
    `\\begin{tblr}{lcr} ${C(81)} & ${C(82)} & ${C(83)} \\\\ ${LONG} & ${LONG} & ${LONG} \\\\ \\end{tblr}`,
    '',
    `\\begin{NiceTabular}{lc} ${C(91)} & ${C(92)} \\\\ ${LONG} & ${LONG} \\\\ \\end{NiceTabular}`,
    '',
    `\\halign{#\\hfil\\quad&\\hfil#\\cr ${C(93)}&${C(94)}\\cr ${LONG}&${LONG}\\cr}`,
    '',
    // (a later table of LaTeX's whose cells hold no unit: none of them states a cell of the tables before)
    `\\begin{tabular}{rl} x & y \\\\ ${LONG} & ${LONG} \\\\ \\end{tabular}`,
  ].join('\n')), { 81: 'l', 82: 'c', 83: 'r', 91: 'l', 92: 'c', 93: '-', 94: '-' }, [81, 82, 83, 93, 94]],
  // (the cell's end, one preamble kind a case: each cell's alignment as TeX set it, and what its end point holds after its end
  // mark, END_AFTER)
  endTabular: [doc(OWN, [
    '\\begin{tabular}{l|c|r}', '\\hline',
    `${T(201, 'flat, 4.5', '\\ok')} & ${C(202)} & ${T(203, 'Mod', '\\textsuperscript{x}')} \\\\`, '\\hline',
    `${C(204)} & ${T(205, 'A vs', '\\B')} & 1.0 \\\\`, '\\hline',
    '\\end{tabular}',
  ].join('\n')), { 201: 'l', 202: 'c', 203: 'r', 204: 'l', 205: 'c' }],
  endTabularStar: [doc(OWN, [
    '\\begin{tabular*}{\\linewidth}{@{\\extracolsep{\\fill}}lcr@{}}',
    `${T(211, 'one', '\\ok')} & ${C(212)} & ${T(213, 'three', '\\B')} \\\\`,
    '\\end{tabular*}',
  ].join('\n')), { 211: 'l', 212: 'c', 213: 'r' }],
  endTabularx: [doc(`\\usepackage{tabularx}${OWN}`, [
    '\\begin{tabularx}{\\linewidth}{lX}',
    `${T(221, 'name', '\\ok')} & ${T(222, 'a paragraph of words in a column of the rest of the line', '\\B')} \\\\`,
    '\\end{tabularx}',
  ].join('\n')), { 221: 'l', 222: 'j' }],
  // (seventy rows: the table breaks over a page, each cell's point on its own page)
  endLongtable: [doc(`\\usepackage{longtable}${OWN}`, [
    '\\begin{longtable}{lr}',
    ...Array.from({ length: 70 }, (_, r) => `${T(300 + r, `row ${r}`, '\\ok')} & ${r} \\\\`),
    '\\end{longtable}',
  ].join('\n')), Object.fromEntries(Array.from({ length: 70 }, (_, r) => [300 + r, 'l']))],
  endSiunitx: [doc(`\\usepackage{siunitx}${OWN}`, [
    '\\begin{tabular}{lS[table-format=1.2]}',
    `${T(241, 'Acc', '\\ok')} & {${T(242, 'head', '\\B')}} \\\\`,
    'x & 0.73 \\\\',
    '\\end{tabular}',
  ].join('\n')), { 241: 'l', 242: 'c' }],
  // (an array in math: its cells in math mode, a formula's; the class its template's all the same)
  endArray: [doc(OWN, [
    '$\\begin{array}{cc}',
    `${T(251, 'ab', '\\ok')} & ${C(252, 'cd')} \\\\`,
    'e & f',
    '\\end{array}$',
  ].join('\n')), {}],
  endMulticolumn: [doc(`\\usepackage{booktabs}${OWN}`, [
    '\\begin{tabular}{lcc}', '\\toprule',
    `${C(261)} & \\multicolumn{2}{c}{${T(262, 'A vs', '\\B')}} \\\\`,
    '\\cmidrule(lr){1-1}\\cmidrule(lr){2-3}',
    'x & y & z \\\\', '\\bottomrule',
    '\\end{tabular}',
  ].join('\n')), { 261: 'l', 262: 'c' }],
  endMultirow: [doc(`\\usepackage{multirow}${OWN}`, [
    '\\begin{tabular}{lc}',
    `\\multirow{2}{*}{${T(271, 'two rows', '\\ok')}} & ${C(272)} \\\\`,
    ' & y \\\\',
    '\\end{tabular}',
  ].join('\n')), { 272: 'c' }],
  endColortbl: [doc(`\\usepackage[table]{xcolor}${OWN}`, [
    '\\begin{tabular}{lc}',
    `\\rowcolor{gray!20} ${T(281, 'shaded', '\\ok')} & ${C(282)} \\\\`,
    `\\cellcolor{red!20}${T(283, 'red', '\\B')} & z \\\\`,
    '\\rowcolor{blue!10} x & y \\\\',
    '\\end{tabular}',
  ].join('\n')), { 281: 'l', 282: 'c', 283: 'l' }],
  endBooktabs: [doc(`\\usepackage{booktabs}${OWN}`, [
    '\\begin{tabular}{lr}', '\\toprule',
    `${C(291)} & ${C(292)} \\\\`, '\\midrule',
    `${T(293, 'last', '\\ok')} & ${T(294, 'row', '\\B')} \\\\`, '\\bottomrule',
    '\\end{tabular}',
  ].join('\n')), { 291: 'l', 292: 'r', 293: 'l', 294: 'r' }],
  endControlWord: [doc(`\\usepackage{amssymb}${OWN}`, [
    '\\begin{tabular}{ll}',
    `${T(401, 'flat', '\\checkmark')} & ${T(402, 'ok', '\\ok')} \\\\`,
    '\\end{tabular}',
  ].join('\n')), { 401: 'l', 402: 'l' }],
  endBreakSkip: [doc(OWN, [
    '\\begin{tabular}{lc}',
    `${T(411, 'gap', '\\ok')} & ${T(412, 'after', '\\B')} \\\\[2pt]`,
    `${C(413)} & x \\\\`,
    '\\end{tabular}',
  ].join('\n')), { 411: 'l', 412: 'c', 413: 'l' }],
  endComment: [doc(OWN, [
    '\\begin{tabular}{lc}',
    `${T(421, 'noted', '\\ok')}% a comment after the piece`,
    `& ${C(422)} \\\\`,
    '\\end{tabular}',
  ].join('\n')), { 421: 'l', 422: 'c' }],
  endEmpty: [doc(OWN, [
    '\\begin{tabular}{lcr}',
    `${T(431, 'before', '\\ok')} & & ${C(432)} \\\\`,
    `x & & ${LONG} \\\\`,
    '\\end{tabular}',
  ].join('\n')), { 431: 'l', 432: 'r' }],
  endNested: [doc(OWN, [
    '\\begin{tabular}{ll}',
    `${T(441, 'outer', '\\B')} & \\begin{tabular}{c}${T(442, 'in', '\\ok')}\\\\ ${C(443)}\\end{tabular} \\\\`,
    `${C(444, `x \\begin{tabular}{c}${T(445, 'deep', '\\ok')}\\end{tabular}`)} & y \\\\`,
    '\\end{tabular}',
  ].join('\n')), { 441: 'l', 442: 'c', 443: 'c', 444: 'l', 445: 'c' }],
  // (the cells set on several lines, one unit since §18.75: each merged cell's start mark before the box that holds its lines, as
  // the marking sets it (latex-front.ts startOf, a cell), its end mark after its last word inside the box; each box in an l, a c
  // and an r column, then under \\multirow, under \\multicolumn and after a \\cellcolor. Each writes ONE AXT-CELL, the OUTER
  // column's class, and sets ONE end point after the whole box (MERGED); a \\parbox is a paragraph, its own (j). With --inside,
  // the start mark inside the box, after its open, as the marking set it before: the red)
  mergedAlone: [doc(`\\usepackage{makecell}${TABINCELL}`, [
    '\\begin{tabular}{lcr}',
    ...BOXES.map((b, k) => `${[0, 1, 2].map((c) => M(500 + 3 * k + c, b)).join(' & ')} \\\\`),
    `${LONG} & ${LONG} & ${LONG} \\\\`,
    '\\end{tabular}',
  ].join('\n')), Object.fromEntries(BOXES.flatMap((b, k) => [0, 1, 2].map((c) => [500 + 3 * k + c, b[3] ?? 'lcr'[c]])))],
  mergedUnder: [doc(`\\usepackage{makecell,multirow}\\usepackage[table]{xcolor}${TABINCELL}`, [
    '\\begin{tabular}{lcr}',
    `\\multirow{2}{*}{${M(560, BOXES[0])}} & \\multicolumn{1}{c}{${M(561, BOXES[3])}} & \\cellcolor{red!20}${M(562, BOXES[5])} \\\\`,
    ` & ${LONG} & ${LONG} \\\\`,
    `\\multicolumn{1}{r}{${M(563, BOXES[8])}} & \\multirow{2}{*}{${M(564, BOXES[7])}} & \\multicolumn{1}{l}{\\multirow{2}{*}{${M(565, BOXES[4])}}} \\\\`,
    `${LONG} & & \\\\`,
    '\\end{tabular}',
  ].join('\n')), { 560: 'l', 561: 'c', 562: 'r', 563: 'r', 564: 'c', 565: 'l' }],
  // (the same, the lines ended by a paper's row-ending macro (§18.75), alone and mixed with `\\\\`: marked as `\\\\`'s are)
  mergedMacro: [doc(`\\usepackage{makecell}${TABINCELL}${ROW_ENDS}`, [
    '\\begin{tabular}{lcr}',
    ...MACRO_BOXES.map((b, k) => `${[0, 1, 2].map((c) => M(600 + 3 * k + c, b)).join(' & ')} \\\\`),
    `${LONG} & ${LONG} & ${LONG} \\\\`,
    '\\end{tabular}',
  ].join('\n')), Object.fromEntries(MACRO_BOXES.flatMap((b, k) => [0, 1, 2].map((c) => [600 + 3 * k + c, b[3] ?? 'lcr'[c]])))],
}
/** what each cell's end point holds after its end mark, where it is not nothing: the characters of its trailing piece, or how many
 *  glyphs it sets (by case, by cell); every other cell of a LaTeX template holds nothing there */
/** the cells of a LaTeX template whose end the marks' template end does not reach, which state no end and are read as before
 *  (stream.ts ownedOf, no bound guessed): a p column of LaTeX's own tabular, array.sty not loaded, whose template latex.ltx's
 *  \@classv builds (`\@startpbox{<width>}\ignorespaces\@sharp\@endpbox`), where LAYOUT_TEX wraps \@classz alone (every column
 *  of array.sty's, the kernel's l, c and r): no \axt@te there, so no AXT-CELL either (§18.13: a p column states no box) */
const NO_END = { kernel: [4, 7] }
/** the merged cells (§18.75), by case: each writes ONE AXT-CELL (its outer column's class) and sets ONE end point, and its page's
 *  glyphs and rules are the document's without our marks (sameAsBare) */
const MERGED = {
  mergedAlone: Array.from({ length: 30 }, (_, k) => 500 + k),
  mergedUnder: [560, 561, 562, 563, 564, 565],
  mergedMacro: Array.from({ length: 3 * MACRO_BOXES.length }, (_, k) => 600 + k),
}
const END_AFTER = {
  endTabular: { 201: 'v', 203: 'x', 205: 'B' },
  endTabularStar: { 211: 'v', 213: 'B' },
  endTabularx: { 221: 'v', 222: 'B' },
  endLongtable: Object.fromEntries(Array.from({ length: 70 }, (_, r) => [300 + r, 'v'])),
  endSiunitx: { 241: 'v', 242: 'B' },
  endArray: { 251: 'v' },
  endMulticolumn: { 262: 'B' },
  endMultirow: { 271: 'v' },
  endColortbl: { 281: 'v', 283: 'B' },
  endBooktabs: { 293: 'v', 294: 'B' },
  // (amssymb's \checkmark: one glyph, "✓" where the font's map gives it, LuaTeX's embedding of MSAM10 reading as "X": counted)
  endControlWord: { 401: 1, 402: 'v' },
  endBreakSkip: { 411: 'v', 412: 'B' },
  endComment: { 421: 'v' },
  endEmpty: { 431: 'v' },
  endNested: { 441: 'B', 442: 'v', 445: 'v' },
}
/** a compile's pages as pageInk reads them (each glyph, each box, each point in stream order) and its axt- destinations' places */
async function inkOf(file) {
  if (!existsSync(file)) return null
  const task = getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }), pdf = await task.promise, pages = [], dests = new Map()
  for (let n = 1; n <= pdf.numPages; n++) { const pg = await pdf.getPage(n); pages.push(pageInk(OPS, await pg.getOperatorList(), pg.commonObjs, { rotate: pg.rotate })) }
  const all = await pdf.getDestinations()
  for (const [full, d] of all instanceof Map ? all : Object.entries(all ?? {})) if (full.startsWith('axt-')) dests.set(full.slice(4), [(await pdf.getPageIndex(d[0])) + 1, d[2], d[3]])
  await task.destroy()
  return { pages, dests }
}
/** the base's and the head's pages under engine `e`: equal glyphs and boxes, every base point at its place in the head's stream,
 *  the head's other points cells' end points alone; null where so, else why not. Equal is to 0.001 pt; under LuaTeX to 0.011, the
 *  shift its PDF writer gives a glyph after a literal (POINTS_TEX's accepted bound); under dvipdfmx (XeTeX's xdvipdfmx, latex's
 *  dvipdfmx) a glyph of the text run an added end point splits (on the baseline of the first glyph after the point, up to the next
 *  point) may stand elsewhere: the writer places it anew, absolutely, where the base reached it by a TJ kern, rounded to a
 *  thousandth of the font's size (the base 0.019 pt off pdfTeX's place in the longtable case, the head 0.001; TeX moved nothing,
 *  pdfLaTeX's pages equal). `split` the largest such difference, reported */
function sameInk(a, b, e) {
  if (a.pages.length !== b.pages.length) return { why: `${a.pages.length} pages, ${b.pages.length}` }
  const tol = e === 'lualatex' ? 0.011 : 0.001
  let worst = 0, split = 0
  for (let p = 0; p < a.pages.length; p++) {
    const A = a.pages[p], B = b.pages[p]
    if (A.glyphs.length !== B.glyphs.length || A.boxes.length !== B.boxes.length) return { why: `page ${p + 1}: ${A.glyphs.length}/${B.glyphs.length} glyphs, ${A.boxes.length / 4}/${B.boxes.length / 4} boxes` }
    const added = B.points.filter(q => !A.points.some(o => o.name === q.name && o.glyph === q.glyph && o.box === q.box))
    const lost = A.points.filter(o => !B.points.some(q => o.name === q.name && o.glyph === q.glyph && o.box === q.box))
    if (lost.length) return { why: `page ${p + 1}: ${lost.length} point(s) of the base moved or gone (${lost[0].name})` }
    if (added.some(q => !/^t\d+x$/.test(q.name))) return { why: `page ${p + 1}: a point added that is no cell's end (${added.find(q => !/^t\d+x$/.test(q.name)).name})` }
    // (the run an added end point splits: the last point at or before glyph g is one, and g stands on the baseline of the point's next glyph)
    const splitBy = g => {
      let last = null
      for (const q of B.points) if (q.glyph <= g) last = q
      return !!last && added.includes(last) && last.glyph < B.glyphs.length && Math.abs(B.glyphs[last.glyph].y - B.glyphs[g].y) < 0.001
    }
    for (let g = 0; g < A.glyphs.length; g++) {
      const x = A.glyphs[g], y = B.glyphs[g]
      if (x.u !== y.u) return { why: `page ${p + 1} glyph ${g}: ${JSON.stringify(x.u)} / ${JSON.stringify(y.u)}` }
      const d = Math.max(Math.abs(x.x0 - y.x0), Math.abs(x.x1 - y.x1), Math.abs(x.y - y.y), Math.abs(x.size - y.size))
      if (d > tol && (e === 'xelatex' || e === 'latex') && splitBy(g)) split = Math.max(split, d)
      else worst = Math.max(worst, d)
    }
    for (let i = 0; i < A.boxes.length; i++) worst = Math.max(worst, Math.abs(A.boxes[i] - B.boxes[i]))
  }
  return worst > tol ? { why: `a glyph or a box moved ${worst.toFixed(4)} pt` } : { why: null, split }
}
/** the marked document's pages against the same document with none of our marks (`bare`: every \\leavevmode\\axtmark and \\axtend
 *  taken off): the same glyphs and rules, each to 0.001 pt (LuaTeX's 0.011; under dvipdfmx a glyph of a text run a point splits,
 *  on its point's next glyph's baseline, up to 0.02: the writer places it anew, sameInk); null where so, else why not */
function sameAsBare(bare, marked, e) {
  if (bare.pages.length !== marked.pages.length) return { why: `${bare.pages.length} pages, ${marked.pages.length}` }
  const tol = e === 'lualatex' ? 0.011 : 0.001
  let worst = 0, split = 0
  for (let p = 0; p < bare.pages.length; p++) {
    const A = bare.pages[p], B = marked.pages[p]
    if (A.glyphs.length !== B.glyphs.length || A.boxes.length !== B.boxes.length) return { why: `page ${p + 1}: ${A.glyphs.length}/${B.glyphs.length} glyphs, ${A.boxes.length / 4}/${B.boxes.length / 4} boxes` }
    const splitBy = g => {
      let last = null
      for (const q of B.points) if (q.glyph <= g) last = q
      return !!last && last.glyph < B.glyphs.length && Math.abs(B.glyphs[last.glyph].y - B.glyphs[g].y) < 0.001
    }
    for (let g = 0; g < A.glyphs.length; g++) {
      const x = A.glyphs[g], y = B.glyphs[g]
      if (x.u !== y.u) return { why: `page ${p + 1} glyph ${g}: ${JSON.stringify(x.u)} / ${JSON.stringify(y.u)}` }
      const d = Math.max(Math.abs(x.x0 - y.x0), Math.abs(x.x1 - y.x1), Math.abs(x.y - y.y), Math.abs(x.size - y.size))
      if (d > tol && (e === 'xelatex' || e === 'latex') && d <= 0.02 && splitBy(g)) split = Math.max(split, d)
      else worst = Math.max(worst, d)
    }
    for (let i = 0; i < A.boxes.length; i++) worst = Math.max(worst, Math.abs(A.boxes[i] - B.boxes[i]))
  }
  return worst > tol ? { why: `a glyph or a box moved ${worst.toFixed(4)} pt` } : { why: null, split }
}
/** each cell's end point against its cell (`ink` the head's): where every cell `cells` names holds its point on its end mark's page,
 *  after its end mark, the glyphs between the two its trailing piece's characters (`after`, '' none), no box between, its destination
 *  at or past the last ink of the cell across, within `tol` (0.01 pt; under dvipdfmx 0.02: its writer places a glyph of a run a
 *  point splits anew, absolutely, sameInk's bound: a \\makecell[r] in an r column under XeLaTeX, its last glyph 0.0114 pt past the
 *  point TeX set at its end, pdfLaTeX's and LuaLaTeX's within 0.0001); and none for `none`. The faults, and each cell's reading */
function cellEnds(ink, cells, after, none, tol = 0.01) {
  const faults = [], read = []
  const at = name => { for (let p = 0; p < ink.pages.length; p++) { const q = ink.pages[p].points.findIndex(o => o.name === name); if (q >= 0) return { p, q, pt: ink.pages[p].points[q] } } return null }
  for (const i of cells) {
    const s = at(`t${i}s`), e = at(`t${i}e`), x = at(`t${i}x`)
    if (none.includes(i)) { if (x) faults.push(`${i}: a point at a cell whose template end the marks do not reach`); read.push(`${i} none`); continue }
    if (!e || !s) { faults.push(`${i}: its own marks not found`); continue }
    if (!x) { faults.push(`${i}: no end point`); continue }
    if (x.p !== e.p || x.q < e.q) { faults.push(`${i}: its end point before its end mark or on another page`); continue }
    const P = ink.pages[x.p]
    const between = P.glyphs.slice(e.pt.glyph, x.pt.glyph).map(g => g.u).join('').replace(/\s/g, '')
    const boxes = x.pt.box - e.pt.box
    const want = after[i] ?? ''
    if (typeof want === 'number' ? [...between].length !== want : between !== want) faults.push(`${i}: after its end mark ${JSON.stringify(between)} (TeX's ${JSON.stringify(want)})`)
    if (boxes) faults.push(`${i}: ${boxes} box(es) between its end mark and its end point`)
    const own = P.glyphs.slice(s.pt.glyph, x.pt.glyph).filter(g => /\S/.test(g.u))
    const last = own.length ? Math.max(...own.map(g => g.x1)) : null
    const d = ink.dests.get(`t${i}x`)
    if (d && last !== null && d[1] < last - tol) faults.push(`${i}: its destination at ${d[1].toFixed(2)}, before its cell's ink ends (${last.toFixed(2)})`)
    read.push(`${i} p${x.p + 1} ${JSON.stringify(between)}${d && last !== null ? ` +${(d[1] - last).toFixed(2)}` : ''}`)
  }
  return { faults, read }
}

// (--only=<case>,…: those cases alone)
if (arg('only')) for (const name of Object.keys(CASES)) if (!arg('only').split(',').includes(name)) delete CASES[name]
let bad = 0
// (a head as the marked original writes it: under latex, each part followed by its DVI marks; the base's LAYOUT_TEX the file's)
const headOf = (layout, e) => (e === 'latex' ? `${MARK_DEF}${DVI_MARK_DEF}${layout}${DVI_LAYOUT_TEX}\n` : `${MARK_DEF}${layout}\n`)
if (BASE && !BASE.startsWith(MARK_DEF)) throw new Error('--base does not begin with this MARK_DEF')
const heads = { new: LAYOUT_TEX, ...(BASE ? { base: BASE.slice(MARK_DEF.length).replace(/\n$/, '') } : {}) }
for (const year of YEARS) {
  const image = compileImageRef(process.env, year)
  await checkCompileImage(image, [])
  const dir = join(OUT, year)
  rmSync(dir, { recursive: true, force: true })
  for (const [h, head] of Object.entries(heads))
    for (const e of ENGINES)
      for (const [name, [src]] of Object.entries(CASES)) {
        mkdirSync(join(dir, `${h}-${e}-${name}`), { recursive: true })
        writeFileSync(join(dir, `${h}-${e}-${name}`, 'main.tex'), `${headOf(head, e)}${src}`)
        // (a merged case's document with none of our marks, its glyphs and rules the marked one's: sameAsBare)
        if (h === 'new' && MERGED[name]) {
          mkdirSync(join(dir, `bare-${e}-${name}`), { recursive: true })
          writeFileSync(join(dir, `bare-${e}-${name}`, 'main.tex'), `${headOf(head, e)}${src.replace(/\\leavevmode\\axtmark\{[^}]*\}|\\axtend\{[^}]*\}/g, '')}`)
        }
      }
  // (two passes each, as a paper's marked original gets; the date fixed, so that two heads' PDFs can be compared byte for byte)
  // (each pass at most 120 s: a document TeX never ends (an endless expansion) fails as one with no PDF, not the run)
  const pass = e => `timeout 120 ${e} -interaction=nonstopmode main.tex >/dev/null 2>&1${e === 'latex' ? '; dvipdfmx -q main.dvi >/dev/null 2>&1' : ''}`
  writeFileSync(join(dir, 'run.sh'), `${ENGINES.map(e => `for d in *-${e}-*/; do (cd "$d" && ${pass(e)}; ${pass(e)}); done`).join('\n')}\ntrue\n`)
  execFileSync('docker', ['run', '--rm', '--network', 'none', '-e', 'SOURCE_DATE_EPOCH=1700000000', '-e', 'FORCE_SOURCE_DATE=1', '-v', `${dir}:/work`, '-w', '/work', image, 'sh', 'run.sh'], { stdio: 'ignore', timeout: 1_800_000 })
  for (const e of ENGINES)
    for (const [name, [src, want, classless = []]] of Object.entries(CASES)) {
      const at = join(dir, `new-${e}-${name}`)
      if (!existsSync(join(at, 'main.log'))) { console.log(`FAIL ${year} ${e} ${name}: no log`); bad++; continue }
      const text = readFileSync(join(at, 'main.log'), 'latin1')
      const got = Object.fromEntries(readAlign(text))
      const wrong = Object.entries(want).filter(([i, c]) => (c === '-' ? got[i] !== undefined : got[i] !== c)).map(([i, c]) => `${i}: ${got[i] ?? 'none'} (TeX ${c})`)
      for (const i of classless) if (new RegExp(`^AXT-CELL ${i} `, 'm').test(text)) wrong.push(`${i}: a class written`)
      const errors = (text.match(/^! .*$/gm) ?? []).slice(0, 3)
      // (each cell's end point, every cell the document marks: `t<i>s` in its source)
      const ink = await inkOf(join(at, 'main.pdf'))
      const cells = [...src.matchAll(/\\axtmark\{t(\d+)s\}/g)].map(m => Number(m[1]))
      const ends = ink ? cellEnds(ink, cells, END_AFTER[name] ?? {}, [...classless, ...(NO_END[name] ?? [])], e === 'xelatex' || e === 'latex' ? 0.02 : 0.01) : { faults: ['no PDF'], read: [] }
      let same = ''
      if (BASE) {
        const a = join(dir, `base-${e}-${name}`, 'main.pdf'), b = join(at, 'main.pdf')
        // (LuaTeX's trailer /ID is made of the output's path, which the two directories differ by: masked)
        const bytes = f => readFileSync(f, 'latin1').replace(/\/ID \[ ?<[0-9A-Fa-f]+> ?<[0-9A-Fa-f]+> ?\]/g, '/ID []')
        if (!existsSync(a) || !existsSync(b)) same = 'no PDF'
        else if (bytes(a) === bytes(b)) same = 'PDF the same'
        else {
          // (where the head sets a cell's end point: the same glyphs and rules, every base point in its place)
          const r = sameInk(await inkOf(a), ink, e)
          same = r.why === null ? `ink the same, end points added${r.split ? ` (a run the point splits placed anew by the writer, ${r.split.toFixed(4)} pt)` : ''}` : `INK DIFFERS: ${r.why}`
        }
        if (same !== 'PDF the same' && !same.startsWith('ink the same, end points added')) bad++
      }
      // (a merged cell: one AXT-CELL, one end point, and the page the bare document's)
      if (MERGED[name] && ink) {
        for (const i of MERGED[name]) {
          const n = (text.match(new RegExp(`^AXT-CELL ${i} `, 'gm')) ?? []).length
          const x = ink.pages.flatMap((pg) => pg.points.filter((q) => q.name === `t${i}x`)).length
          if (n !== 1 || x !== 1) wrong.push(`${i}: ${n} AXT-CELL, ${x} end point(s)`)
        }
        const bare = await inkOf(join(dir, `bare-${e}-${name}`, 'main.pdf'))
        const r = bare ? sameAsBare(bare, ink, e) : { why: 'no bare PDF' }
        if (r.why) wrong.push(`AGAINST THE BARE DOCUMENT: ${r.why}`)
        else same ||= `the bare document's ink${r.split ? ` (a run a point splits placed anew by the writer, ${r.split.toFixed(4)} pt)` : ''}`
      }
      if (wrong.length || errors.length || ends.faults.length) bad++
      const ok = !wrong.length && !errors.length && !ends.faults.length && (!BASE || same === 'PDF the same' || same.startsWith('ink the same, end points added'))
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${year} ${e} ${name}${wrong.length ? `: ${wrong.join('; ')}` : ''}${errors.length ? `; TeX: ${errors.join(' | ')}` : ''}${same ? `; ${same}` : ''}${ends.faults.length ? `; ENDS: ${ends.faults.slice(0, 6).join('; ')}${ends.faults.length > 6 ? ` (+${ends.faults.length - 6})` : ''}` : ''}`)
      if (process.argv.includes('--ends')) console.log(`      ends: ${ends.read.join(', ')}`)
    }
}
console.log(`the documents and their logs: ${OUT}`)
process.exit(bad ? 1 : 0)
