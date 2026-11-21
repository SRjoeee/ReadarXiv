// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { unitFactsOf } from '@/pdf-reader/engine/pipeline/instrument.mjs'

// Each caption's float type, LaTeX's \@captype where its \caption runs (`floatTypes`, the front end's: [unit index, type]
// beside the units, as `inFloat`): the float environment it is set in (a starred one's, wrapfig's and rotating's as their
// float's), \captionof's first argument, a deluxetable's \tablecaption a table's, a sub-caption (subcaption's \subcaption, a
// subfigure environment's \caption, subfig's \subfloat) its float's `sub` type. A figure's and a table's label is drawn in
// the target's word by its type, not by its spelling (the owner's ruling of 2026-11-08: one form a paper). And the units of an
// algorithm float's body (`pseudocode`: algorithm2e writes its lines there, not in an algorithmic environment the walk skips),
// kept as the original as code is (the owner's ruling of 2026-11-08, math.md Q2): its caption is the float's, translated.

type Unit = { kind: string; pieces: { t: string; s?: string }[] }
const enc = (s: string) => new TextEncoder().encode(s)
const doc = (body: string, pre = '') => `\\documentclass{article}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`
const textOf = (u: Unit) =>
  u.pieces
    .filter((p) => p.t === 'text')
    .map((p) => p.s)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

describe('the instrument’s unit facts from the front end’s (unitFactsOf)', () => {
  it('keeps a cell of an algorithm float as its pseudocode, and a cell that holds no ordinary word as written (R1)', () => {
    const paper = openPaper(
      new Map([
        [
          'main.tex',
          enc(
            doc(
              [
                'We compare GSM8K with the larger benchmark of the study, and MATH with the others.',
                '\\begin{tabular}{ll}Data & Score \\\\ GSM8K & the best one \\end{tabular}',
                '\\begin{algorithm}\\caption{Rank}\\begin{tabular}{l}MATH\\end{tabular}\\end{algorithm}',
              ].join('\n\n'),
              '\\usepackage{algorithm2e}',
            ),
          ),
        ],
      ]),
    ) as unknown as { units: Unit[] }
    const facts = unitFactsOf(paper as never)
    const why = paper.units.flatMap((u, i) => (facts.why.has(i) ? [[u.kind, textOf(u), facts.why.get(i)]] : []))
    // (PDF-READER §18.72 R1: "GSM8K" holds no ordinary word, kept as written; "Data", "Score" and "the best one" are words, sent.
    // Today's reader keeps "GSM8K" by its own name rule, its openPaper's `kept`, which the instrument does not read)
    expect((paper as unknown as { kept: Set<Unit> }).kept.has(paper.units.find((u) => textOf(u) === 'GSM8K')!)).toBe(true)
    expect(why).toEqual([
      ['cell', 'GSM8K', 'words'],
      ['cell', 'MATH', 'pseudocode'],
    ])
    expect([...facts.why.keys()].every((i) => facts.kept.has(i))).toBe(true)
  })
})
