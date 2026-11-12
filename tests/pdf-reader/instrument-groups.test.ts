// A group that carries nothing is no group (lane style-wire C, the coordinator's ruling of 2026-11-11): a pair the front end
// read as setting its argument alone (latex-front.mjs identityPair: the open piece's `sets` 0, RevTeX's `\bibinfo{title}{…}`,
// `\bibnamefont{…}`), or a bare group `{…}` that holds no declaration of its own to scope (BibTeX's case braces), is its content:
// no span, which the tags wire would send as a tag pair for nothing. Over the 88 papers' bundles, 20,172 of the first kind and
// 2,943 of the second, none with a face, a fill, a link or a paragraph TeX opened at it of its own
import { describe, expect, it } from 'vitest'
import { contentOf, passedOf, piecesOf, spansOf } from '../../src/pdf-reader/engine/pipeline/instrument.mjs'

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
    // (the inner group's switch its face, no element: switchesOf)
    expect(shape(piecesOf(outer))).toEqual([['span', '1', '{', ['Bold']], ' rest after.'])
  })
  it('a group still where it carries something or the front end says nothing of it: a declaration it scopes, a command not read as setting its argument alone, a style, an end outside the unit', () => {
    const scoped = [open('{', 1), ph('\\small'), text('all'), close(1), text(' of it.')]
    expect(shape(piecesOf(scoped))).toEqual([['span', '0', '{', [['el', '1'], 'all']], ' of it.'])
    // (a face switch it scopes is its face, no element: switchesOf)
    expect(shape(piecesOf([open('{', 1), ph('\\em'), text('all'), close(1), text(' of it.')]))).toEqual([['span', '0', '{', ['all']], ' of it.'])
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

// (the coordinator's ruling of 2026-11-11, lane style-wire: today's wire sends a .bbl field's pair as markers and a face group
// that fills the field rides them, so production draws that face; with the field's pair written as its content (above) v2
// sends the face group on no wire, upright. In a bibliography entry such a face group is `must`)
describe("a face that fills a bibliography's field: `must` (production's markers ride the field's pair)", () => {
  const spans = (ps: unknown[], out: { open?: string; must?: number }[] = []) => {
    for (const p of ps as { t: string; open?: string; must?: number; content?: unknown[] }[])
      if (p.t === 'span') {
        out.push({ open: p.open, ...(p.must ? { must: p.must } : {}) })
        spans(p.content ?? [], out)
      }
    return out
  }
  it('`\\bibinfo{journal}{\\emph{J}}` in a clause is `must`; a bare `\\emph{J}` in the same place is not', () => {
    const field = [text('A. Author, '), open('\\bibinfo{journal}{', 1, 0), open('\\emph{', 2), text('Journal of Flows'), close(2), close(1), text(', 12 (2020).')]
    expect(spans(piecesOf(field, { bib: true }))).toEqual([{ open: '\\emph{', must: 1 }])
    const bare = [text('A. Author, '), open('\\emph{', 2), text('Journal of Flows'), close(2), text(', 12 (2020).')]
    expect(spans(piecesOf(bare, { bib: true }))).toEqual([{ open: '\\emph{' }])
  })
  it('a field holding more than the one face group is not; nor the same field outside a bibliography entry', () => {
    const more = [text('A. Author, '), open('\\bibinfo{title}{', 1, 0), text('On '), open('\\emph{', 2), text('flows'), close(2), close(1), text('.')]
    expect(spans(piecesOf(more, { bib: true }))).toEqual([{ open: '\\emph{' }])
    const tail = [open('\\bibinfo{title}{', 1, 0), open('\\emph{', 2), text('Flows'), close(2), text(' and more'), close(1), text('.')]
    expect(spans(piecesOf(tail, { bib: true }))).toEqual([{ open: '\\emph{' }])
    const field = [text('See '), open('\\bibinfo{journal}{', 1, 0), open('\\emph{', 2), text('Journal of Flows'), close(2), close(1), text('.')]
    expect(spans(piecesOf(field))).toEqual([{ open: '\\emph{' }])
  })
  it("a face holding only a placeholder is not: REVTeX's `\\textbf{\\bibinfo{volume}{27}}`, the number's ink its own face", () => {
    const volume = [text('Phys. Rev. Lett. '), open('\\textbf{', 1), open('\\bibinfo{volume}{', 2, 0), ph('27'), close(2), close(1), text(', 1 (2020).')]
    expect(spans(piecesOf(volume, { bib: true }))).toEqual([{ open: '\\textbf{' }])
    const field = [text('A. Author, '), open('\\bibinfo{volume}{', 1, 0), open('\\textbf{', 2), ph('27'), close(2), close(1), text(', 1.')]
    expect(spans(piecesOf(field, { bib: true }))).toEqual([{ open: '\\textbf{' }])
    // (a volume with text of its own on the wire, `A349`, is)
    const label = [text('Phys. Rev. '), open('\\textbf{', 1), open('\\bibinfo{volume}{', 2, 0), text('A349'), close(2), close(1), text(', 1.')]
    expect(spans(piecesOf(label, { bib: true }))).toEqual([{ open: '\\textbf{', must: 1 }])
  })
  it("REVTeX's field around a face around a field, a space after it: `\\bibfield{journal}{\\emph{\\bibinfo{journal}{J}}\\ }`", () => {
    const revtex = [open('\\bibfield{journal}{', 1, 0), open('\\emph{', 2), open('\\bibinfo{journal}{', 3, 0), text('Phys. Rev. Lett.'), close(3), close(2), ph('\\ '), close(1), ph('12')]
    expect(spans(piecesOf(revtex, { bib: true }))).toEqual([{ open: '\\emph{', must: 1 }])
  })
  it('a link stays as it is; a bare group a face declaration opens sets that face, and rides the field as today\'s does', () => {
    const link = [open('\\bibinfo{note}{', 1, 0), open('\\href{https://x.org}{', 2), text('Online'), close(2), close(1), text('.')]
    expect(spans(piecesOf(link, { bib: true }))).toEqual([{ open: '\\href{https://x.org}{', must: 1 }])
    const declared = [open('\\bibinfo{journal}{', 1, 0), open('{', 2), ph('\\em'), text('Journal of Flows'), close(2), close(1), text(', 12.')]
    expect(spans(piecesOf(declared, { bib: true }))).toEqual([{ open: '{', must: 1 }])
    // (one a size or a family opens sets no face: as it was)
    const sized = [open('\\bibinfo{journal}{', 1, 0), open('{', 2), ph('\\small'), text('Journal of Flows'), close(2), close(1), text(', 12.')]
    expect(spans(piecesOf(sized, { bib: true }))).toEqual([{ open: '{' }])
  })
})

// (TeX sets `{\em x}` as it sets `\emph{x}`: a face switch that draws nothing, first in a bare group, is the group's face. Read as
// an element of the group's text, the group was stated `other`: no wire carried its face as a group's, a group holding an element
// was never placed (packages/translate groups.ts), and over r19's bundles 589 bibliography units in 15 papers (16,680 letters)
// held an italic stretch on arXiv's page, in such a group, that their unit stated as no italic group: PDF-READER §18.60)
describe("a face switch first in a bare group is the group's face, stated as `\\emph{…}`'s is", () => {
  type S = { t: string; id?: string; open?: string; style?: string; must?: number; content?: S[] }
  const groups = (ps: unknown[], out: [string | undefined, string | undefined, number][] = []) => {
    for (const p of ps as S[])
      if (p.t === 'span') {
        out.push([p.open, p.style, (p.content ?? []).filter((q) => q.t === 'el').length])
        groups(p.content ?? [], out)
      }
    return out
  }
  it('`{\\em Annals of Flow}` is an italic group of its text alone, its switch its command; `{\\bfseries …}` bold, `{\\scshape …}` small capitals', () => {
    const venue = [text('J. Doe, On eddies, '), open('{', 1), ph('\\em'), text(' Annals of Flow'), close(1), text(', 4 (1999).')]
    expect(groups(piecesOf(venue))).toEqual([['{', 'italic', 0]])
    expect(spansOf(venue)).toEqual([['1', { cmd: 'em' }]])
    expect(groups(piecesOf([open('{', 1), ph('\\bfseries'), text(' Lemma.'), close(1), text(' It holds.')]))).toEqual([['{', 'bold', 0]])
    expect(groups(piecesOf([open('{', 1), ph('\\scshape'), text(' Kepler'), close(1)]))).toEqual([['{', 'sc', 0]])
    expect(groups(piecesOf([open('{', 1), ph('\\it'), text('ibid.'), close(1)]))).toEqual([['{', 'italic', 0]])
  })
  it('the piece ids around it are as before; where the group opened is counted without it', () => {
    const venue = [text('In '), open('{', 1), ph('\\em'), text('Flows'), close(1), text(', '), ph('$x$'), text('.')]
    expect(shape(piecesOf(venue))).toEqual(['In ', ['span', '1', '{', ['Flows']], ', ', ['el', '6'], '.'])
    expect(passedOf([text('A '), open('{', 1), ph('\\em'), text('b'), close(1), open('{', 2), text('c'), close(2)])).toEqual([3])
  })
  it('a size, a family or a colour first is no face: an element of a group of style other, as before; a switch that is not first, too', () => {
    expect(groups(piecesOf([open('{', 1), ph('\\small'), text(' x'), close(1)]))).toEqual([['{', 'other', 1]])
    expect(groups(piecesOf([open('{', 1), ph('\\ttfamily'), text(' x'), close(1)]))).toEqual([['{', 'other', 1]])
    expect(groups(piecesOf([open('{', 1), text('A '), ph('\\em'), text('b'), close(1), text('.')]))).toEqual([['{', 'other', 1]])
    expect(spansOf([open('{', 1), ph('\\small'), text(' x'), close(1)])).toEqual([])
  })
  it("a run-in label a switch opens stays `must` (the run-in rule reads a bare group's face as the switch it was)", () => {
    const label = contentOf([text('The bound is tight. '), open('{', 1), ph('\\bf'), text(' Remark:'), close(1), text(' it holds for every n.')]) as S[]
    expect(label[1]).toMatchObject({ t: 'span', style: 'bold', must: 1 })
  })
  it('in a field it fills, it rides the field as before: `must`', () => {
    const field = [open('\\bibinfo{journal}{', 1, 0), open('{', 2), ph('\\em'), text('Annals of Flow'), close(2), close(1), text(', 4.')]
    expect(piecesOf(field, { bib: true })).toMatchObject([{ t: 'span', open: '{', style: 'italic', must: 1, content: [{ t: 'text', s: 'Annals of Flow' }] }, { t: 'text' }])
  })
})
