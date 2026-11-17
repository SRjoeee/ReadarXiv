import { describe, expect, it } from 'vitest'
import { bundleUnitsOf } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import { toTranslate } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { LAYOUT_CLASSES } from '@/pdf-reader/engine/layout/marks.mjs'
import { openPaper, originalFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
import { classesOn, unitClass, unitShown } from '@/pdf-reader/engine/rules/content-classes.mjs'

// The author block's names split from its places (docs/route/orphan-text.md §5, "Names"; the owner's rulings of 2026-10-25,
// 2026-10-28 and 2026-10-30: "names" is the whole author block under the title, its names, affiliations, addresses and e-mail
// line, one toggle): the authors' names stay units of kind `author`, the affiliations, institutions and addresses become units
// of kind `affiliation`, each placed by its own marks, both the reader's "names" (off by default). Read from the TeX the
// source holds (latex-front.mjs frontBlock): which command holds the text, the rows of the tabular LaTeX sets an \author in, the
// numbered list of places, an author's note; an e-mail, a web address and an ORCID stay the original's ink. Each shape a paper
// writes, one test.

type Piece = { t: string; s?: string; src?: string }
type Unit = { kind: string; pieces: Piece[] }
const enc = (s: string) => new TextEncoder().encode(s)
const open = (body: string, pre = '', cls = 'article') => openPaper(new Map([['main.tex', enc(`\\documentclass{${cls}}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`)]]))
const units = (p: ReturnType<typeof open>) => p.units as unknown as Unit[]
const textOf = (u: Unit) => u.pieces.filter(x => x.t === 'text').map(x => x.s).join('').replace(/\s+/g, ' ').trim()
const of = (p: ReturnType<typeof open>, kind: string) => units(p).filter(u => u.kind === kind).map(textOf)
const names = (p: ReturnType<typeof open>) => of(p, 'author'), places = (p: ReturnType<typeof open>) => of(p, 'affiliation')

describe('whatever TeX sets an author block in, its units are the block\'s: never a table\'s cells, an abstract or a theorem', () => {
  // (the owner's ruling of 2026-10-30: one toggle for the whole block. 2610.35877v1 sets its \author in a tabular of its own, and
  // its names were cells, of the tables' toggle, shown translated with the author block's off; 2608.06007v1's places row and
  // 2610.22214v1's whole block too, the only three of the 190 sources on disk)
  it('a tabular in \\author: each cell a unit of the row\'s kind, cut at & and \\\\ as cells are, at the number it had (2610.35877v1)', () => {
    const p = open('\\maketitle\nThe body.', '\\title{A Title}\n\\author{%\n\\begin{tabular}{c@{\\hspace{16mm}}c}\n\\normalsize Ayush Mittal & \\normalsize Dhruv Gupta\\\\[1.2mm]\n\\small\\href{mailto:a@x.world}{\\texttt{a@x.world}} & \\small\\href{mailto:d@y.in}{\\texttt{d@y.in}}\n\\end{tabular}%\n}')
    expect(units(p).map(u => [u.kind, textOf(u)])).toEqual([['heading', 'A Title'], ['author', 'Ayush Mittal'], ['author', 'Dhruv Gupta'], ['para', 'The body.']])
    expect(units(p).some(u => (u as { cell?: unknown }).cell)).toBe(false)
    expect(['author', 'affiliation'].map(k => unitClass(k))).toEqual(['names', 'names'])
    // (marked as the block's units, inside their cells: the alignment's & and \\\\ outside every unit)
    const tex = new TextDecoder().decode(originalFiles(p, { layout: LAYOUT_CLASSES }).get('main.tex'))
    expect(tex).toMatch(/\\leavevmode\\axtmark\{1s\}[^&]*Ayush Mittal\\axtend\{1e\} &/)
    expect(tex).toMatch(/\\leavevmode\\axtmark\{2s\}[^&]*Dhruv Gupta\\axtend\{2e\}\\\\/)
  })
  it('a row of places set in a tabular, a block in a center or a minipage: the row\'s kind; a table outside the block its cells (2608.06007v1)', () => {
    const p = open('\\maketitle\nThe body.\n\n\\begin{tabular}{cc} Model & Ours \\end{tabular}', '\\author{\\large {Yuhan Zhou, Hao Nie}\n\\\\\n\\large\n\\begin{tabular}{cc}\nPeking University & Stepfun\n\\end{tabular}\n}')
    expect(names(p)).toEqual(['Yuhan Zhou, Hao Nie'])
    expect(places(p)).toEqual(['Peking University', 'Stepfun'])
    expect(of(p, 'cell')).toEqual(['Model', 'Ours'])
    // (a name-only text of a block is no table's kept name: sent, and shown with the block)
    expect(units(p).filter(u => u.kind === 'affiliation').some(u => p.kept.has(u as never))).toBe(false)
    const q = open('\\maketitle\nWords.', '\\author{\\begin{center}\\begin{minipage}{0.4\\textwidth}\\begin{theorem}Jane Doe\\end{theorem}\\end{minipage}\\end{center} \\\\ Some University}', '\\newtheorem{theorem}{Theorem}')
    expect(units(q).map(u => [u.kind, textOf(u)]).filter(([k]) => k !== 'para')).toEqual([['author', 'Jane Doe'], ['affiliation', 'Some University']])
  })
})

describe('the places\' units: their number, their class, their marks', () => {
  const BIB = '\\begin{thebibliography}{9}\n\\bibitem{a} A.~Author.\n\\newblock A title of a paper.\n\\newblock 2020.\n\\end{thebibliography}'
  const p = open(`\\maketitle\nThe first paragraph.\n\nThe second paragraph.\n\n${BIB}`, '\\title{A Title}\n\\author{Alice Smith \\\\ University of Somewhere}')
  it('a place and a name are both the names\', the whole block shown with that toggle and hidden without it', () => {
    expect(['author', 'affiliation'].map(k => unitClass(k))).toEqual(['names', 'names'])
    const block = units(p).filter(u => u.kind === 'author' || u.kind === 'affiliation')
    // (the defaults, names off: the whole block the original's, its institution too)
    expect(block.map(u => unitShown(u, classesOn(null)))).toEqual([false, false])
    expect(block.map(u => unitShown(u, classesOn({ names: false })))).toEqual([false, false])
    // (names on: the whole block translated; another toggle shows none of it)
    expect(block.map(u => unitShown(u, classesOn({ names: true })))).toEqual([true, true])
    expect(block.map(u => unitShown(u, classesOn({ references: true, tables: true, heads: true, figures: true })))).toEqual([false, false])
    // (both sent, once, whatever the toggles)
    const bundle = { units: bundleUnitsOf(p) }
    expect(toTranslate(bundle, 'zh')).toEqual(expect.arrayContaining([1, 4]))
  })
})

