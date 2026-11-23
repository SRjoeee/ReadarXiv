import { describe, expect, it } from 'vitest'
import { openPaper } from '../../src/compile/live.ts'

// The kind of a row of an author block's names (F, PDF-READER §18.111). The source reader takes the rows of \author after its
// first, between `\\` (FRONT_ROW), for places unless what the row sets says it is names: an affiliation's mark after a name
// (MARK_AFTER), a note, "and". llncs's mark is \inst, which that reading did not know: 2604.10456v1's names after `\\`, each
// with its \inst, were read as places, no person to the one-person rule (PDF-READER §19.15). A row that sets no such fact keeps
// its position's kind (a block that holds its places, the control). Words of our own.

type Piece = { t: string; s?: string }
const enc = (s: string) => new TextEncoder().encode(s)
const kindsOf = (cls: string, body: string) =>
  openPaper(new Map([['main.tex', enc(`${cls}\n\\begin{document}\n${body}\n\\end{document}\n`)]]))
    .units.filter((u) => u.kind === 'author' || u.kind === 'affiliation')
    .map((u) => [
      u.kind,
      (u.pieces as Piece[])
        .filter((p) => p.t === 'text')
        .map((p) => p.s)
        .join('')
        .trim(),
    ])

describe('a row of an author block’s names is a name where the paper writes its places apart', () => {
  it('llncs: the names after `\\\\` in \\author are names; \\institute’s rows its places', () => {
    expect(
      kindsOf(
        '\\documentclass{llncs}',
        '\\title{A Title of Ours}\n\\author{Ann Lee\\inst{1} \\and Bob Ray\\inst{2} \\\\ Cy Day\\inst{1} \\and Di Fox\\inst{2}}\n\\institute{First Place \\and Second Place}\n\\maketitle\nWords of ours.',
      ).sort(),
    ).toEqual(
      [
        ['author', 'Ann Lee'],
        ['author', 'Bob Ray'],
        ['author', 'Cy Day'],
        ['author', 'Di Fox'],
        ['affiliation', 'First Place'],
        ['affiliation', 'Second Place'],
      ].sort(),
    )
  })
  it('the control: a block that holds its places keeps them places', () => {
    expect(
      kindsOf(
        '\\documentclass{article}',
        '\\title{A Title of Ours}\n\\author{Ann Lee \\\\ Some Place of Ours \\and Bob Ray \\\\ Another Place}\n\\maketitle\nWords of ours.',
      ).sort(),
    ).toEqual(
      [
        ['author', 'Ann Lee'],
        ['author', 'Bob Ray'],
        ['affiliation', 'Some Place of Ours'],
        ['affiliation', 'Another Place'],
      ].sort(),
    )
  })
})
