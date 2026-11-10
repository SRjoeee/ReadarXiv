// A group that carries nothing is no group (lane style-wire C, the coordinator's ruling of 2026-11-11): a pair the front end
// read as setting its argument alone (latex-front.mjs identityPair: the open piece's `sets` 0, RevTeX's `\bibinfo{title}{…}`,
// `\bibnamefont{…}`), or a bare group `{…}` that holds no declaration of its own to scope (BibTeX's case braces), is its content:
// no span, which the tags wire would send as a tag pair for nothing. Over the 88 papers' bundles, 20,172 of the first kind and
// 2,943 of the second, none with a face, a fill, a link or a paragraph TeX opened at it of its own
import { describe, expect, it } from 'vitest'
import { passedOf, piecesOf, spansOf } from '../../src/pdf-reader/engine/pipeline/instrument.mjs'

type P = { t: string; s?: string; src?: string; id?: number }
const open = (src: string, id: number, sets?: 0): P => {
  const p: P = { t: 'open', src, id }
  if (sets === 0) Object.defineProperty(p, 'sets', { value: 0 })
  return p
}
const close = (id: number): P => ({ t: 'close', src: '}', id })
const text = (s: string): P => ({ t: 'text', s })
const ph = (src: string): P => ({ t: 'ph', src })
const shape = (ps: unknown[]): unknown[] =>
  (ps as { t: string; s?: string; id?: string; open?: string; content?: unknown[] }[]).map((p) =>
    p.t === 'span' ? ['span', p.id, p.open, shape(p.content ?? [])] : p.t === 'text' ? p.s : [p.t, p.id],
  )

describe('a group that carries nothing is its content', () => {
  it('a pair the front end read as setting its argument alone: no span, its content where it stands, every other piece its id', () => {
    const pieces = [text('A. Author, '), open('\\bibinfo{title}{', 1, 0), text('A study'), close(1), text(', '), ph('$x$'), text('.')]
    // (its text joined with the text on either side, as where the source holds no group)
    expect(shape(piecesOf(pieces))).toEqual(['A. Author, A study, ', ['el', '5'], '.'])
    expect(spansOf(pieces)).toEqual([])
  })
  it('a bare group with no declaration of its own (BibTeX\'s case braces), and one whose declaration a group inside it scopes', () => {
    const braces = [text('On '), open('{', 1), text('GPU'), close(1), text(' kernels.')]
    expect(shape(piecesOf(braces))).toEqual(['On GPU kernels.'])
    const outer = [open('{', 1), open('{', 2), ph('\\bf'), text('Bold'), close(2), text(' rest'), close(1), text(' after.')]
    expect(shape(piecesOf(outer))).toEqual([['span', '1', '{', [['el', '2'], 'Bold']], ' rest after.'])
  })
  it('a group still where it carries something or the front end says nothing of it: a declaration it scopes, a command not read as setting its argument alone, a style, an end outside the unit', () => {
    const scoped = [open('{', 1), ph('\\em'), text('all'), close(1), text(' of it.')]
    expect(shape(piecesOf(scoped))).toEqual([['span', '0', '{', [['el', '1'], 'all']], ' of it.'])
    const quoted = [open('\\enquote{', 1), text('A title'), close(1)]
    expect(shape(piecesOf(quoted))).toEqual([['span', '0', '\\enquote{', ['A title']]])
    expect(spansOf(quoted)).toEqual([['0', { cmd: 'enquote' }]])
    const styled = [open('\\emph{', 1), text('Nature'), close(1)]
    expect(shape(piecesOf(styled))).toEqual([['span', '0', '\\emph{', ['Nature']]])
    const cut = [open('\\bibinfo{title}{', 1, 0), text('A study')]
    expect(shape(piecesOf(cut))).toEqual([['span', '0', '\\bibinfo{title}{', ['A study']]])
  })
  it('states where each such group opened, in the projection, for the engine to count a paragraph TeX opened there (a gate)', () => {
    const pieces = [text('On '), open('{', 1), text('GPU'), close(1), text(' and '), ph('$x$'), text(' '), open('\\bibinfo{title}{', 2, 0), text('T'), close(2)]
    expect(passedOf(pieces)).toEqual([3, 13])
    expect(passedOf([open('{', 1), ph('\\em'), text('all'), close(1)])).toEqual([])
  })
})
