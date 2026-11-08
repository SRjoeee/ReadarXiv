// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { unitFactsOf } from '@/pdf-reader/engine/pipeline/instrument.mjs'
import { inMemory, loadProject } from '@/pdf-reader/engine/source/latex-front.mjs'

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
const project = (tex: string, files: Record<string, string> = {}) =>
  loadProject(
    inMemory(new Map([['main.tex', enc(tex)], ...Object.entries(files).map(([k, v]) => [k, enc(v)] as [string, Uint8Array])])),
    'main.tex',
    { tables: true },
  )
/** each caption's text and its float type */
const types = (tex: string, files: Record<string, string> = {}) => {
  const p = project(tex, files) as unknown as { units: Unit[]; floatTypes: [number, string][] }
  const of = new Map(p.floatTypes)
  return p.units.flatMap((u, i) => (u.kind === 'caption' ? [[textOf(u), of.get(i) ?? null] as const] : []))
}

describe('floatTypes: each caption’s float type, LaTeX’s \\@captype there', () => {
  it('is the float environment it is set in, a starred or a package’s one as its float’s', () => {
    expect(
      types(
        doc(
          [
            '\\begin{figure}[t]\\centering\\caption{The first figure of the paper.}\\end{figure}',
            '\\begin{table*}\\caption{The scores of the models.}\\begin{tabular}{l}x\\\\\\end{tabular}\\end{table*}',
            '\\begin{wrapfigure}{r}{0.4\\textwidth}\\caption{A figure set in the text.}\\end{wrapfigure}',
            '\\begin{sidewaystable}\\caption{A table set turned.}\\end{sidewaystable}',
            '\\begin{algorithm}\\caption{The search over the tree.}\\end{algorithm}',
            '\\begin{table}\\input{tab/body}\\end{table}',
          ].join('\n\n'),
        ),
        { 'tab/body.tex': '\\caption{A table read from its own file.}\n' },
      ),
    ).toEqual([
      ['The first figure of the paper.', 'figure'],
      ['The scores of the models.', 'table'],
      ['A figure set in the text.', 'figure'],
      ['A table set turned.', 'table'],
      ['The search over the tree.', 'algorithm'],
      ['A table read from its own file.', 'table'],
    ])
  })
  it('is \\captionof’s type, a \\tablecaption’s a table’s, a sub-caption’s its float’s sub type; none outside a float', () => {
    expect(
      types(
        doc(
          [
            '\\begin{minipage}{0.5\\textwidth}\\captionof{table}{A table beside a figure.}\\end{minipage}',
            '\\begin{deluxetable}{ll}\\tablecaption{The sources observed.}\\end{deluxetable}',
            '\\begin{figure}\\begin{subfigure}{0.5\\textwidth}\\caption{The left half of it.}\\end{subfigure}\\subcaption{The right half of it.}\\caption{Both halves of the figure.}\\end{figure}',
            '\\begin{figure}\\subfloat[The first panel of three.]{\\includegraphics{a}}\\caption{Three panels in a row.}\\end{figure}',
            '\\caption{A caption no float holds here.}',
          ].join('\n\n'),
        ),
      ),
    ).toEqual([
      ['A table beside a figure.', 'table'],
      ['The sources observed.', 'table'],
      ['The left half of it.', 'subfigure'],
      ['The right half of it.', 'subfigure'],
      ['Both halves of the figure.', 'figure'],
      ['The first panel of three.', 'subfigure'],
      ['Three panels in a row.', 'figure'],
      ['A caption no float holds here.', null],
    ])
  })
})

describe('the instrument’s unit facts from the front end’s (unitFactsOf)', () => {
  it('states a caption’s float type, and keeps an algorithm float’s body as the original, its caption translated', () => {
    // (2608.25210v2 p7's Algorithm 1, algorithm2e's lines written in the float itself: a paragraph unit of 21 lines whose
    // formulas the marks did not find; v2 erased it and drew one line)
    const paper = openPaper(
      new Map([
        [
          'main.tex',
          enc(
            doc(
              [
                'The text before the algorithm goes on here.',
                '\\begin{algorithm}\\caption{Prune the ranked tables}\\KwIn{the tables in order} set the best one aside and return it\\end{algorithm}',
                '\\begin{figure}\\caption{The tables ranked.}\\end{figure}',
              ].join('\n\n'),
              '\\usepackage{algorithm2e}',
            ),
          ),
        ],
      ]),
    ) as unknown as { units: Unit[] }
    const facts = unitFactsOf(paper as never) as { float: Map<number, string>; kept: Set<number> }
    const rows = paper.units.map((u, i) => [u.kind, textOf(u), facts.float.get(i) ?? null, facts.kept.has(i)])
    expect(rows).toEqual([
      ['para', 'The text before the algorithm goes on here.', null, false],
      ['caption', 'Prune the ranked tables', 'algorithm', false],
      ['para', expect.stringContaining('set the best one aside'), null, true],
      ['caption', 'The tables ranked.', 'figure', false],
    ])
  })
})
