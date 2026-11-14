// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { openPaper } from '../../src/front.types.ts'
import { commandParams } from '../../src/source/arg-roles.ts'

// Plain TeX's line boxes, LaTeX's own (ltplain.dtx): \line is \hb@xt@\hsize, \centerline#1 \line{\hss#1\hss}, \leftline#1
// \line{#1\hss}, \rightline#1 \line{\hss#1}. Their argument is what the page shows, a box's content as \mbox's is
// (PDF-READER §18.46). Read as one placeholder (LaTeXML's untyped argument), a table inside one was no cell and no unit
// (2608.06701v1 p8: every cell of Table 4 English whatever the tables toggle, its lines the ledger's float lines).

type Unit = { kind: string; pieces: { t: string; s?: string }[] }
const enc = (s: string) => new TextEncoder().encode(s)
const open = (body: string, pre = '') => openPaper(new Map([['main.tex', enc(`\\documentclass{article}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`)]]))
const units = (p: ReturnType<typeof open>) => p.units as unknown as Unit[]
const textOf = (u: Unit) =>
  u.pieces
    .filter((x) => x.t === 'text')
    .map((x) => x.s)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

describe('the line boxes: \\centerline, \\leftline, \\rightline set their argument', () => {
  it('reads the argument as a box’s content in the role table, as \\mbox’s', () => {
    for (const name of ['centerline', 'leftline', 'rightline']) expect(commandParams(name), name).toEqual(commandParams('mbox'))
  })
  it('reads a table set inside one as a table: its cells units (2608.06701v1 p8)', () => {
    const p = open(
      '\\begin{table}[t]\n\\caption{Resolution transitions.}\n\\setlength{\\tabcolsep}{2pt}\n\\centerline{\\small\\begin{tabular}{ll}\n\\toprule\n\\textbf{Dataset} & \\textbf{Method} \\\\\n\\midrule\nVerified & Advisor \\\\\n\\bottomrule\n\\end{tabular}}\n\\end{table}',
      '\\usepackage{booktabs}',
    )
    expect(units(p).map((u) => [u.kind, textOf(u)])).toEqual([
      ['caption', 'Resolution transitions.'],
      ['cell', 'Dataset'],
      ['cell', 'Method'],
      ['cell', 'Verified'],
      ['cell', 'Advisor'],
    ])
  })
  it('sets a line of its own where it stands between paragraphs: TeX’s \\line starts no paragraph, the text after it begins one', () => {
    for (const name of ['centerline', 'leftline', 'rightline']) {
      const p = open(`Before it.\n\n\\${name}{A centred line of words.}\nAfter it.`)
      expect(units(p).map(textOf), name).toEqual(['Before it.', 'A centred line of words.', 'After it.'])
    }
  })
  it('sets its words in the paragraph it stands in, a box of the line’s width there', () => {
    const p = open('The words before \\centerline{the box} and after.')
    expect(units(p).map(textOf)).toEqual(['The words before the box and after.'])
  })
})
