import { describe, expect, it } from 'vitest'
import { DEFINITIONS_FORMAT, NO_DEFINITIONS, readDefinitions } from '../../src/source/definitions.ts'
import { readSource, type SourceUnit } from '../../src/source/read.ts'
import type { Piece } from '../../src/source/types.ts'

const tree = (files: Record<string, string>, main = 'main.tex') => ({
  main,
  files: new Map(Object.entries(files).map(([k, v]) => [k, new TextEncoder().encode(v)])),
})
const doc = (body: string, preamble = '', defs = NO_DEFINITIONS) =>
  readSource(tree({ 'main.tex': `\\documentclass{article}\n${preamble}\\begin{document}\n${body}\n\\end{document}\n` }), defs)
/** a unit's pieces as the id reads them: t text, p element, o/c a span's open and close, n a nested unit (an explicit
 *  stack: spans nest deep) */
const flat = (content: readonly Piece[]): string[][] => {
  const out: string[][] = []
  const stack: { list: readonly Piece[]; k: number; close?: string }[] = [{ list: content, k: 0 }]
  while (stack.length) {
    const top = stack[stack.length - 1] as { list: readonly Piece[]; k: number; close?: string }
    if (top.k >= top.list.length) {
      stack.pop()
      if (top.close !== undefined) out.push(['c', top.close])
      continue
    }
    const p = top.list[top.k++] as Piece
    if (p.t === 'text') out.push(['t', p.s])
    else if (p.t === 'el') out.push(['p', p.src, p.kind])
    else if (p.t === 'span') {
      if (p.open !== undefined) out.push(['o', p.open, p.style])
      stack.push(p.close !== undefined ? { list: p.content, k: 0, close: p.close } : { list: p.content, k: 0 })
    } else out.push(['n', p.pre, p.post])
  }
  return out
}
const text = (u: SourceUnit) => flat(u.content).map((p) => (p[0] === 't' ? p[1] : p[0] === 'p' ? '·' : '')).join('')
/** TeX's records as the definitions pass writes them */
const records = (...lines: string[]) =>
  readDefinitions([`H ${DEFINITIONS_FORMAT}`, ...lines, `END ${lines.filter((l) => l.startsWith('M ')).length}`].join('\n'))

describe('readSource: the cut', () => {
  it('cuts paragraphs at TeX’s paragraph ends, a comment’s empty line one of them', () => {
    const d = doc('First words here.\n\nSecond words here. % note\n\nThird words here.')
    expect(d.units.map((u) => [u.kind, text(u).trim()])).toEqual([
      ['para', 'First words here.'],
      ['para', 'Second words here.'],
      ['para', 'Third words here.'],
    ])
  })
  it('types the pieces where they are cut: math, a citation, a reference, a span’s style', () => {
    const [u] = doc('We see $x^2$ in \\cite{k} and \\ref{s}, \\emph{really}.').units
    expect(flat((u as SourceUnit).content)).toEqual([
      ['t', '\nWe see '],
      ['p', '$x^2$', 'math'],
      ['t', ' in '],
      ['p', '\\cite{k}', 'cite'],
      ['t', ' and '],
      ['p', '\\ref{s}', 'ref'],
      ['t', ', '],
      ['o', '\\emph{', 'italic'],
      ['t', 'really'],
      ['c', '}'],
      ['t', '.\n'],
    ])
  })
  it('nests a footnote in its paragraph, the inner unit first', () => {
    const d = doc('Words before\\footnote{A note of words.} words after.')
    expect(d.units.map((u) => u.kind)).toEqual(['footnote', 'para'])
    const outer = d.units[1] as SourceUnit
    expect(flat(outer.content)).toContainEqual(['n', '\\footnote{', '}'])
    expect(outer.content.find((p) => p.t === 'unit')).toMatchObject({ unit: d.units[0]?.id })
  })
  it('makes each table cell a unit, and gives equal units one id', () => {
    const d = doc('\\begin{tabular}{lll}\nOne & Same words & Two \\\\\nThree & Same words & Four\n\\end{tabular}')
    const cells = d.units.filter((u) => u.kind === 'cell')
    expect(cells.map((u) => text(u).trim())).toEqual(['One', 'Same words', 'Two', 'Three', 'Same words', 'Four'])
    expect(cells[1]?.id).toBe(cells[4]?.id)
    expect(new Set(cells.map((u) => u.id)).size).toBe(5)
  })
})

describe('readSource: the three gaps the dossier found by probe', () => {
  it('reads a file \\input unbraced, as TeX does', () => {
    const d = readSource(
      tree({
        'main.tex': '\\documentclass{article}\\begin{document}\n\\input sections/intro\nAfter it.\n\\end{document}',
        'sections/intro.tex': 'The introduction holds these words.',
      }),
      NO_DEFINITIONS,
    )
    expect(d.files).toContain('sections/intro.tex')
    expect(d.units.map((u) => text(u).trim())).toEqual(['The introduction holds these words.', 'After it.'])
  })
  it('walks the text of a \\NewDocumentCommand macro as a span, as a \\newcommand one, by TeX’s specification and code', () => {
    const preamble = '\\NewDocumentCommand{\\note}{m}{\\textbf{#1}}\n'
    const defs = records(
      'M note \\protected macro:->\\__cmd_start:nNNnnn {m}\\note  \\note code {\\__cmd_grab_m_1:w }{}{}',
      'S note m',
      'C note \\protected\\long macro:#1->\\textbf {#1}',
      'M NewDocumentCommand \\protected\\long macro:#1#2#3->\\__cmd_check_definable:nNT {#1}',
    )
    const [u] = doc('A \\note{marked phrase} here.', preamble, defs).units
    expect(flat((u as SourceUnit).content)).toEqual([
      ['t', '\nA '],
      ['o', '\\note{', 'group'],
      ['t', 'marked phrase'],
      ['c', '}'],
      ['t', ' here.\n'],
    ])
  })
  it('reads groups and spans nested past any recursion limit', () => {
    const n = 20_000
    const d = doc(`Words ${'{'.repeat(n)}deep${'}'.repeat(n)} and ${'\\textbf{'.repeat(n)}bold${'}'.repeat(n)} end.`)
    expect(d.units).toHaveLength(1)
    const pieces = flat((d.units[0] as SourceUnit).content)
    expect(pieces.filter((p) => p[0] === 'o')).toHaveLength(2 * n)
    expect(text(d.units[0] as SourceUnit).trim()).toBe('Words deep and bold end.')
  })
})

describe('readSource: what TeX holds decides', () => {
  it('walks only the branch TeX takes of a \\newif conditional, by its value at the document’s start', () => {
    const defs = records('M ifdraft \\iffalse', 'M drafttrue macro:->\\let \\ifdraft \\iftrue ')
    const d = doc('\\ifdraft Draft words only.\\else Final words only.\\fi', '\\newif\\ifdraft\n', defs)
    expect(d.units.map((u) => text(u))).toEqual(['· Final words only.·\n'])
  })
  it('takes no theorem for an environment whose meaning sets no run-in head', () => {
    const defs = records('M algorithm macro:->\\@protected@testopt \\algorithm \\\\algorithm {htbp}', 'M endalgorithm macro:->\\end {algocf@algorithm}')
    const d = doc('\\begin{algorithm}\nSome steps of words.\n\\end{algorithm}', '', defs)
    expect(d.units.map((u) => u.kind)).toEqual(['para'])
  })
})
