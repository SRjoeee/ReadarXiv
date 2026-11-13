// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { sourceUnitsOf } from '../../src/front.ts'
import { openPaper, unitFactsOf } from '../../src/front.types.ts'

// A table's cell is text like any other (the owner, 2026-11-13): the front half keeps a unit as the original only for what its
// source states it is (an algorithm's body, code set in one pitch, an identifier, a formula or a citation as elements). Whether a
// word is a name is the translator's: no cell is kept because its words look like names (the rule that did, nameCells, is
// today's reader's alone). And a text of fewer than two letters is no unit at all (latex-front.mjs flush): its ink stays.

type Unit = { kind: string; pieces: { t: string; s?: string }[]; cell?: { head?: boolean } }
const enc = (s: string) => new TextEncoder().encode(s)
const paperOf = (body: string) =>
  openPaper(
    new Map([
      [
        'main.tex',
        enc(
          `\\documentclass{article}\n\\usepackage{booktabs}\n\\begin{document}\n${body}\nWe report the average recovery and the score.\n\\end{document}\n`,
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
/** each cell's text and whether the front half keeps it, in the paper's order */
const cells = (body: string) => {
  const paper = paperOf(body)
  const facts = unitFactsOf(paper)
  const us = paper.units as unknown as Unit[]
  return us.flatMap((u, i) => (u.kind === 'cell' ? [[textOf(u), facts.kept.has(i), !!u.cell?.head]] : []))
}
const table = (rows: string[]) =>
  `\\begin{table}[t]\n\\begin{tabular}{lr}\n\\toprule\n${rows.join(' \\\\\n')} \\\\\n\\bottomrule\n\\end{tabular}\n\\caption{Results.}\n\\end{table}\n`

describe('a table’s cell is text like any other: no cell is kept for looking like a name', () => {
  it('a column of names with one label: every cell goes to the translator, the names and the label alike', () => {
    expect(cells(table(['Dataset & Score', '\\midrule\nMedQA & 81.2', 'CaseHOLD & 74.0', 'Avg. Recovery & 77.6']))).toEqual([
      ['Dataset', false, true],
      ['Score', false, true],
      ['MedQA', false, false],
      ['CaseHOLD', false, false],
      ['Avg. Recovery', false, false],
    ])
  })
  it('a header row with a name in it is a row of texts like the others: none of its cells kept', () => {
    expect(cells(table(['Model & EM', '\\midrule\nBERT large & 84.1', 'GPT large & 85.0']))).toEqual([
      ['Model', false, true],
      ['EM', false, true],
      ['BERT large', false, false],
      ['GPT large', false, false],
    ])
  })
  it('the units a translator reads first carry no kept cell either (front.ts sourceUnitsOf, the bundle’s fields)', () => {
    const paper = paperOf(table(['Model & EM', '\\midrule\nMedQA & GSM8K']))
    const early = sourceUnitsOf(paper) as unknown as { kind: string; kept?: true }[]
    expect(early.filter((u) => u.kind === 'cell').length).toBeGreaterThan(0)
    expect(early.filter((u) => u.kind === 'cell' && u.kept)).toEqual([])
  })
  it('a cell of symbols, digits or one letter alone is no unit: its ink stays the original’s', () => {
    // (latex-front.mjs flush: a text of fewer than two letters is no unit; a formula alone is a placeholder, no letter of text)
    expect(cells(table(['Method & Pass', '\\midrule\nOurs & $\\checkmark$', 'x & --', 'Base & 85.3']))).toEqual([
      ['Method', false, true],
      ['Pass', false, true],
      ['Ours', false, false],
      ['Base', false, false],
    ])
  })
})
