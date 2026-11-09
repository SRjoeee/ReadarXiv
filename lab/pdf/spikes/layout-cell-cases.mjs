// lab/pdf/spikes/layout-cell-cases.mjs
// A table cell's alignment under TeX (src/pdf-reader/engine/layout/marks.mjs LAYOUT_TEX's AXT-CELL, the class LaTeX built the
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
// trailer /ID: the readings put nothing in the PDF.
// Exit 1 on a reading that is not TeX's, a TeX error, or a PDF that differs.
//   pnpm exec tsx lab/pdf/spikes/layout-cell-cases.mjs [--years=2023,2025] [--engines=pdflatex,…] [--only=<case>,…]
//     [--base=<head.tex>] [--out=<dir>]
// Docker with the years' pinned images (lab/pdf/compile-images.json); no network.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { readAlign } from '../../../packages/engine/src/marks/channels.ts'
import { DVI_MARK_DEF, MARK_DEF } from '../../../src/pdf-reader/engine/source/latex-front.mjs'
import { DVI_LAYOUT_TEX, LAYOUT_TEX } from '../../../src/pdf-reader/engine/layout/marks.mjs'
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
  // \and under \maketitle, each name and place its cell's line, in a brace group of its own or not: their column's class. Not
  // where the cell's line is more than the unit: two units in one cell, a unit in a box inside the cell. A unit that is a
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
  ].join('\n')), { 1: 'c', 2: 'c', 3: 'c', 4: 'c', 5: 'c', 10: 'c', 11: 'c', 12: 'c', 20: 'l', 21: '-', 22: '-', 23: '-', 24: 'c', 26: 'j', 27: 'j', 28: 'j' }],
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
      }
  // (two passes each, as a paper's marked original gets; the date fixed, so that two heads' PDFs can be compared byte for byte)
  // (each pass at most 120 s: a document TeX never ends (an endless expansion) fails as one with no PDF, not the run)
  const pass = e => `timeout 120 ${e} -interaction=nonstopmode main.tex >/dev/null 2>&1${e === 'latex' ? '; dvipdfmx -q main.dvi >/dev/null 2>&1' : ''}`
  writeFileSync(join(dir, 'run.sh'), `${ENGINES.map(e => `for d in *-${e}-*/; do (cd "$d" && ${pass(e)}; ${pass(e)}); done`).join('\n')}\ntrue\n`)
  execFileSync('docker', ['run', '--rm', '--network', 'none', '-e', 'SOURCE_DATE_EPOCH=1700000000', '-e', 'FORCE_SOURCE_DATE=1', '-v', `${dir}:/work`, '-w', '/work', image, 'sh', 'run.sh'], { stdio: 'ignore', timeout: 1_800_000 })
  for (const e of ENGINES)
    for (const [name, [, want, classless = []]] of Object.entries(CASES)) {
      const at = join(dir, `new-${e}-${name}`)
      if (!existsSync(join(at, 'main.log'))) { console.log(`FAIL ${year} ${e} ${name}: no log`); bad++; continue }
      const text = readFileSync(join(at, 'main.log'), 'latin1')
      const got = Object.fromEntries(readAlign(text))
      const wrong = Object.entries(want).filter(([i, c]) => (c === '-' ? got[i] !== undefined : got[i] !== c)).map(([i, c]) => `${i}: ${got[i] ?? 'none'} (TeX ${c})`)
      for (const i of classless) if (new RegExp(`^AXT-CELL ${i} `, 'm').test(text)) wrong.push(`${i}: a class written`)
      const errors = (text.match(/^! .*$/gm) ?? []).slice(0, 3)
      let same = ''
      if (BASE) {
        const a = join(dir, `base-${e}-${name}`, 'main.pdf'), b = join(at, 'main.pdf')
        // (LuaTeX's trailer /ID is made of the output's path, which the two directories differ by: masked)
        const bytes = f => readFileSync(f, 'latin1').replace(/\/ID \[ ?<[0-9A-Fa-f]+> ?<[0-9A-Fa-f]+> ?\]/g, '/ID []')
        same = !existsSync(a) || !existsSync(b) ? 'no PDF' : bytes(a) === bytes(b) ? 'PDF the same' : 'PDF DIFFERS'
        if (same !== 'PDF the same') bad++
      }
      if (wrong.length || errors.length) bad++
      console.log(`${wrong.length || errors.length || (BASE && same !== 'PDF the same') ? 'FAIL' : 'ok  '} ${year} ${e} ${name}${wrong.length ? `: ${wrong.join('; ')}` : ''}${errors.length ? `; TeX: ${errors.join(' | ')}` : ''}${same ? `; ${same}` : ''}`)
    }
}
console.log(`the documents and their logs: ${OUT}`)
process.exit(bad ? 1 : 0)
