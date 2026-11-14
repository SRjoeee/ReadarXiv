// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { sourceUnitsOf } from '../../src/front.ts'
import { openPaper } from '../../src/compile/live.ts'
import { unitFactsOf } from '../../src/instrument/instrument.ts'

// Which texts of a table and a figure are language (docs/PDF-READER.md §18.72, the owner's direction of 2026-11-13: decide what is
// content and what is not, from the source's facts and the table's structure; a translator's error is not ours to correct).
// R1: a text that holds no ordinary word is not language and is kept as written (every token a symbol, a number or an
// identifier; text set in a code face, a formula, a citation are no words). R2: a title-case word the paper's running text
// writes capitalised mid-sentence and never in lower case is a name of that paper; a text of such names and R1's tokens is kept.
// Both are facts of a text, decided where Unit.kept is (instrument.mjs unitFactsOf); the table's structure (a header cell alone,
// a body column's cells between two rules) is the typesetter's (packages/typeset tests/unit/table-groups.test.ts). A text of
// fewer than two letters is no unit at all (latex-front.mjs flush): its ink stays.

type Unit = { kind: string; pieces: { t: string; s?: string }[]; cell?: { head?: boolean } }
const enc = (s: string) => new TextEncoder().encode(s)
const PROSE = 'We report the average recovery and the score on the test set.'
const paperOf = (body: string, prose = PROSE) =>
  openPaper(
    new Map([
      [
        'main.tex',
        enc(
          `\\documentclass{article}\n\\usepackage{booktabs}\n\\usepackage{tikz}\n\\begin{document}\n${prose}\n\n${body}\n\\end{document}\n`,
        ),
      ],
    ]),
  )
const textOf = (u: Unit) =>
  u.pieces
    .filter((x) => x.t === 'text')
    .map((x) => x.s)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
/** each unit of `kind`: its text, whether the front half keeps it and why (null where it is sent) */
const judged = (body: string, prose?: string, kind = 'cell') => {
  const paper = paperOf(body, prose)
  const facts = unitFactsOf(paper)
  const us = paper.units as unknown as Unit[]
  return us.flatMap((u, i) => (u.kind === kind ? [[textOf(u), facts.kept.has(i) ? (facts.why.get(i) ?? null) : null]] : []))
}
const table = (rows: string[], spec = 'lr') =>
  `\\begin{table}[t]\n\\begin{tabular}{${spec}}\n\\toprule\n${rows.join(' \\\\\n')} \\\\\n\\bottomrule\n\\end{tabular}\n\\caption{Results.}\n\\end{table}\n`

describe('R1: a text that holds no ordinary word is not language, and is kept as written', () => {
  it('Table 1’s header (2611.03953v2 p7): the dataset names kept, "Method" and "Avg. Recovery" sent', () => {
    expect(
      judged(
        table(['Method & MedQA & CaseHOLD & FinQA & IFBench & Avg. Recovery', '\\midrule\nOurs & 1.0 & 2.0 & 3.0 & 4.0 & 5.0'], 'lrrrrr'),
      ),
    ).toEqual([
      ['Method', null],
      ['MedQA', 'words'],
      ['CaseHOLD', 'words'],
      ['FinQA', 'words'],
      ['IFBench', 'words'],
      ['Avg. Recovery', null],
      ['Ours', null],
    ])
  })
  it('Table 2’s stub (2611.03953v2 p7): the dataset names kept, "Avg. Recovery" sent by itself', () => {
    expect(
      judged(table(['Domain & Final', '\\midrule\nMedQA & 89.8', 'CaseHOLD & 91.4', 'FinQA & 97.6', 'IFBench & 100.6', '\\midrule\nAvg. Recovery & 94.9'])),
    ).toEqual([
      ['Domain', null],
      ['Final', null],
      ['MedQA', 'words'],
      ['CaseHOLD', 'words'],
      ['FinQA', 'words'],
      ['IFBench', 'words'],
      ['Avg. Recovery', null],
    ])
  })
  it('an identifier by its exact reading: a digit, all capitals, a capital after a letter, a joined part, one letter alone', () => {
    const cellsOf = ['Howto-GEN', 'GPT-4o', 'ViT-B/16', 'Lean-GAP', 'MNLI-(m/mm)', 'N+ B', 'T(s)', '18-layer', 'Aes.Qual', 'MOPD']
    expect(judged(table(['Method & Score', '\\midrule\n' + cellsOf.map((c) => `${c} & 1.0`).join(' \\\\\n')])).slice(2)).toEqual(
      cellsOf.map((c) => [c, 'words']),
    )
  })
  it('a word sends its text, whatever it says: "Vanilla" (the translator’s reply is not ours to correct), joined words, labels', () => {
    const cellsOf = ['Vanilla', 'Self-Attention', 'w/o pretraining', 'Precision/Recall', 'MOPD (TA init)', 'Ours', 'Unsafe/labeled']
    expect(judged(table(['Method & Score', '\\midrule\n' + cellsOf.map((c) => `${c} & 1.0`).join(' \\\\\n')])).slice(2)).toEqual(
      cellsOf.map((c) => [c, null]),
    )
  })
  it('the source’s facts are no words: text in a code face, a formula, a citation beside an identifier', () => {
    expect(
      judged(
        table(['Method & Score', '\\midrule\n\\texttt{run}-all & 1.0', 'BERT~\\cite{devlin} & 2.0', '$\\alpha$-net $k$ & 3.0', 'base $\\alpha$ & 4.0']),
      ).slice(2),
    ).toEqual([
      ['-all', 'words'],
      ['BERT', 'words'],
      ['-net', null],
      ['base', null],
    ])
  })
  it('a figure’s text is judged as a cell is: "OCTMNIST" kept, "test error" sent', () => {
    expect(
      judged('\\begin{figure}\n\\begin{tikzpicture}\n\\node at (0,0) {OCTMNIST};\n\\node at (0,1) {test error};\n\\end{tikzpicture}\n\\caption{A plot.}\n\\end{figure}\n', PROSE, 'figure'),
    ).toEqual([
      ['OCTMNIST', 'words'],
      ['test error', null],
    ])
  })
  it('the units a translator reads first carry the same kept cells (front.ts sourceUnitsOf, the bundle’s fields)', () => {
    const paper = paperOf(table(['Model & EM', '\\midrule\nMedQA & GSM8K', 'Base & large']))
    const early = sourceUnitsOf(paper) as unknown as { kind: string; kept?: true; content: { t: string; s?: string }[] }[]
    const kept = early.filter((u) => u.kind === 'cell' && u.kept).map((u) => u.content.map((p) => p.s ?? '').join('').trim())
    expect(kept.sort()).toEqual(['EM', 'GSM8K', 'MedQA'])
  })
  it('a cell of symbols, digits or one letter alone is no unit: its ink stays the original’s', () => {
    // (latex-front.mjs flush: a text of fewer than two letters is no unit; a formula alone is a placeholder, no letter of text)
    expect(judged(table(['Method & Pass', '\\midrule\nOurs & $\\checkmark$', 'x & --', 'Base & 85.3']))).toEqual([
      ['Method', null],
      ['Pass', null],
      ['Ours', null],
      ['Base', null],
    ])
  })
})

describe('R2: a word the paper’s running text writes as a name is a name of that paper', () => {
  const prose =
    'We compare Claude and Mistral with GPT-4o, and filter outliers with Tukey fences as Tukey proposed. Claude is the strongest. ' +
    'Results are reported on the test set, as Test scores. Oracle numbers are an upper bound.'
  it('a header row of names (Claude, Mistral) kept: written capitalised mid-sentence and never in lower case', () => {
    expect(judged(table(['Model & Claude & Mistral', '\\midrule\nOurs & 1.0 & 2.0'], 'lrr'), prose)).toEqual([
      ['Model', null],
      ['Claude', 'paperNames'],
      ['Mistral', 'paperNames'],
      ['Ours', null],
    ])
  })
  it('a person’s name in a body cell kept; "Test", which the paper also writes "test", sent', () => {
    expect(judged(table(['Filter & Test', '\\midrule\nTukey & 1.0', 'Mean & 2.0']), prose)).toEqual([
      ['Filter', null],
      ['Test', null],
      ['Tukey', 'paperNames'],
      ['Mean', null],
    ])
  })
  it('a word written capitalised only where a sentence begins is no name ("Oracle", "Results")', () => {
    expect(judged(table(['Method & Score', '\\midrule\nOracle & 1.0', 'Results & 2.0', 'Claude GPT-4o & 3.0']), prose).slice(2)).toEqual([
      ['Oracle', null],
      ['Results', null],
      ['Claude GPT-4o', 'paperNames'],
    ])
  })
})

describe('R4: a text a names block keeps is a name of the paper, kept wherever its tables print it', () => {
  // (2608.06701v1 p5: Table II's column holds Vanilla, SAGE and three of the paper's text macros, each the call alone (no unit);
  // Table III's holds Vanilla and one such macro. The block is a body column's cells between the same two rules; its text cells
  // every cell that prints text: a unit, a call of the paper's macro that sets text, a cell wholly in a code face; not a number,
  // a formula or an empty cell. More than half of them names (R1, R2, or such a no-unit cell): its other units are kept, and so
  // is the same text wherever the paper's tables print it)
  const macros =
    '\\newcommand{\\predef}{\\textit{Predefined Advice}}\n\\newcommand{\\periodic}{\\textit{Periodic Advisor}}\n' +
    '\\newcommand{\\approach}{\\textsc{LivePlan}}\n\\newcommand{\\cmark}{\\ding{51}}\n\\newcommand{\\R}{\\mathbb{R}}\n'
  const tableII = table(['Method & Rate', '\\midrule\nVanilla & 21.76', 'SAGE & 18.79', '\\predef & 25.00', '\\periodic & 28.79', '\\approach & 34.09'])
  const tableIII = table(['Method & Rate', '\\midrule\nVanilla & 38.20', '\\approach & 49.40'])
  it("Table II: four names of five text cells, Vanilla kept by its block; and in Table III, the same text kept, though its own block is one of two", () => {
    expect(judged(macros + tableII + tableIII)).toEqual([
      ['Method', null],
      ['Rate', null],
      ['Vanilla', 'namesBlock'],
      ['SAGE', 'words'],
      ['Method', null],
      ['Rate', null],
      ['Vanilla', 'namesBlock'],
    ])
  })
  it('a block of exactly half names keeps nothing: Table III alone sends Vanilla', () => {
    expect(judged(macros + tableIII)).toEqual([
      ['Method', null],
      ['Rate', null],
      ['Vanilla', null],
    ])
  })
  it('a cell wholly in a code face is a name; a number, a formula, an empty cell and a macro that sets no text are no text cell', () => {
    expect(judged(table(['Error & Count', '\\midrule\n\\texttt{MCPError} & 1', '\\texttt{JSONDecodeError} & 2', 'none & 3']))).toEqual([
      ['Error', null],
      ['Count', null],
      ['none', 'namesBlock'],
    ])
    expect(judged(macros + table(['Model & Score', '\\midrule\nGPT-4o & 1', '$x$ & 2', '1.5 & 3', ' & 4', '\\cmark & 5', '\\R & 6', 'baseline & 7']))).toEqual([
      ['Model', null],
      ['Score', null],
      ['GPT-4o', 'words'],
      ['baseline', null],
    ])
  })
  it('a rule over the column ends its block: a \\cmidrule over it, and REVTeX’s \\colrule', () => {
    expect(judged(table(['Model & Score', '\\midrule\nGPT-4o & 1', 'Claude-3 & 2', '\\cmidrule{1-1}\nAverage & 3']))).toEqual([
      ['Model', null],
      ['Score', null],
      ['GPT-4o', 'words'],
      ['Claude-3', 'words'],
      ['Average', null],
    ])
    // (a \cmidrule over another column leaves this one's block whole)
    expect(judged(table(['Model & Score', '\\midrule\nGPT-4o & 1', 'Claude-3 & 2', '\\cmidrule{2-2}\nAverage & 3'])).at(-1)).toEqual(['Average', 'namesBlock'])
    expect(judged(table(['Dataset & Model', '\\colrule\nMNIST & CNN', 'CIFAR & ResNet']))).toEqual([
      ['Dataset', null],
      ['Model', null],
      ['MNIST', 'words'],
      ['CNN', 'words'],
      ['CIFAR', 'words'],
      ['ResNet', 'words'],
    ])
  })
  it('a header cell is in no block (R3): names under a header word leave it sent', () => {
    expect(judged(table(['Method & Rate', '\\midrule\nGPT-4o & 1', 'Claude-3 & 2'])).slice(0, 2)).toEqual([
      ['Method', null],
      ['Rate', null],
    ])
  })
})
