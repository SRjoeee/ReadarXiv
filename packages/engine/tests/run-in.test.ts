// A title its author sets in the line at a paragraph's opening, with no mark after it (the display design's F40, the owner's ruling
// A of 2026-11-13, the coordinator's variant C): `\noindent\textbf{Global Matching} We leverage …` (2111.09276v1 pp5-6). The engine
// states it on the group (the part's SpanAt.runin), the lay sets the script's separation after it; no translator is told. The
// group (a) opens a paragraph of its unit (its start, or SpanAt.opens), (b) sets a face, (c) is followed in the source by plain
// white space alone, (d) by what begins a sentence (@readarxiv/text opensAfter), its text ending with no closing mark. Words of
// our own.
import type { Piece } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { runInsOf } from '../src/bundle/run-in.ts'

const t = (s: string): Piece => ({ t: 'text', s })
const el = (id: string, kind: string, src: string, silent = false): Piece =>
  silent ? { t: 'el', id, kind, src, silent: 1 } : { t: 'el', id, kind, src }
const span = (id: string, style: string, open: string, content: Piece[]): Piece => ({
  t: 'span',
  id,
  style,
  open,
  close: '}',
  content,
})
const bold = (id: string, s: string) => span(id, 'bold', '\\textbf{', [t(s)])
const none = new Set<string>()

describe('a title set in the line at a paragraph’s opening, with no mark after it (F40)', () => {
  it('a bold title before a sentence: stated', () => {
    expect([
      ...runInsOf(
        [el('0', 'other', '\\noindent', true), t('\n'), bold('2', 'Global Matching'), t(' We use the model.')],
        none,
      ),
    ]).toEqual(['2'])
  })
  it('a bold subject before a word in lower case: not ("RQ1 concerns …")', () => {
    expect([...runInsOf([bold('0', 'RQ1'), t(' concerns the forecast.')], none)]).toEqual([])
  })
  it('a coloured or linked first word: not (a colour or a link sets no face)', () => {
    const colour = span('0', 'colour', '\\textcolor{red}{', [t('The')])
    expect([...runInsOf([colour, t(' M3 comparison used one channel.')], none)]).toEqual([])
    const link = span('0', 'link', '\\href{https://example.org}{', [t('Positive-definite')])
    expect([...runInsOf([link, t(' Hessian matrices appear at extrema.')], none)]).toEqual([])
  })
  it('a title with its own stop, or one TeX ends with a stop of its own: not', () => {
    expect([...runInsOf([bold('0', 'Global Matching.'), t(' We use the model.')], none)]).toEqual([])
    const stopped: Piece = {
      t: 'span',
      id: '0',
      style: 'bold',
      open: '\\topic{',
      close: '}',
      stop: '.',
      content: [t('Global Matching')],
    }
    expect([...runInsOf([stopped, t(' We use the model.')], none)]).toEqual([])
  })
  it('a title the source follows with a spacing element of its own (`\\quad`, `\\hspace`): not, the element is the separation', () => {
    expect([
      ...runInsOf(
        [bold('0', 'Acknowledgments'), t('\n'), el('2', 'other', '\\quad'), t(' Authors thank the reviewers.')],
        none,
      ),
    ]).toEqual([])
    expect([
      ...runInsOf(
        [bold('0', 'Object Replacement'), t(' '), el('2', 'other', '\\hspace{0.2em}'), t('\nEach task has an object.')],
        none,
      ),
    ]).toEqual([])
  })
  it('a title, a tie and a citation, then a sentence: stated (the citation is no text and hides no start)', () => {
    expect([
      ...runInsOf(
        [bold('0', 'T5'), el('3', 'space', '~'), el('4', 'cite', '\\cite{x}'), t(' We propose a model.')],
        none,
      ),
    ]).toEqual(['0'])
    // (a subject's citation: what follows goes on in lower case)
    expect([...runInsOf([bold('0', 'COIN'), t(' '), el('2', 'cite', '\\cite{x}'), t(' is a dataset.')], none)]).toEqual(
      [],
    )
  })
  it('a formula that opens the sentence after it: not (a miss of the rule, "Textual Similarity $G$ is …")', () => {
    expect([
      ...runInsOf([bold('0', 'Textual Similarity'), t(' '), el('2', 'math', '$G$'), t(' is the similarity.')], none),
    ]).toEqual([])
  })
  it('a group TeX opened a paragraph at inside its unit: stated where its part says so, not otherwise', () => {
    const content = [
      t('It ends here.\n'),
      el('1', 'macro', '\\medbreak'),
      t('\n'),
      bold('3', 'Howto-GEN'),
      t(' To evaluate it, we split.'),
    ]
    expect([...runInsOf(content, new Set(['3']))]).toEqual(['3'])
    expect([...runInsOf(content, none)]).toEqual([])
  })
  it('a group glued to what follows, or the line it ends: not', () => {
    expect([...runInsOf([bold('0', 'Title'), t('We go.')], none)]).toEqual([])
    expect([...runInsOf([bold('0', 'Title'), el('2', 'break', '\\\\'), t('We go.')], none)]).toEqual([])
  })
})
