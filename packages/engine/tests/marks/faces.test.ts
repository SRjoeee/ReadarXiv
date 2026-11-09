// A unit's groups as TeX set them (packages/engine/src/marks/faces.ts): the face TeX set a group's own text in where it is
// not the face of the text around it, and the punctuation TeX set at a group's end that its source does not write, read off
// the unit's text glyphs in B's stream against its content. 2608.25210v2's heads are a paper's macro,
// `\newcommand{\topic}[1]{\vspace{.5pt} \noindent{\bf #1.}}`: the argument bold, then a stop of the macro's own; words of our own.
import type { Piece } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { groupFacts } from '../../src/marks/faces.ts'
import type { StyleGlyph } from '../../src/locate/facts.ts'

const t = (s: string): Piece => ({ t: 'text', s })
let n = 0
const el = (src: string, kind = 'macro'): Piece => ({ t: 'el', id: `e${n++}`, kind, src })
const group = (open: string, content: Piece[]): Piece & { t: 'span' } => ({
  t: 'span',
  id: `s${n++}`,
  style: 'other',
  open,
  close: '}',
  content,
})
const BOLD = 'LinLibertineTB'
const REGULAR = 'LinLibertineT'
const ITALIC = 'LinLibertineTI'
/** a text as TeX sets it: a glyph for each character that is no white space, in one font */
const set = (s: string, base: string): StyleGlyph[] =>
  [...s].filter((c) => !/\s/.test(c)).map((u) => ({ u, base, size: 8.97, fill: -1 }))

describe('the face TeX set a group in and the stop it set at its end, read off its glyphs', () => {
  it('a paper’s macro that sets its argument bold and a stop of its own: the face, the stop', () => {
    const head = group('\\topic{', [t('Current methods are not reliable')])
    const content = [head, t('  \nTo infer the source, one could rank sentences.')]
    const glyphs = [
      ...set('Current methods are not reliable.', BOLD),
      ...set('To infer the source, one could rank sentences.', REGULAR),
    ]
    const facts = groupFacts(content, glyphs).get(head)
    expect(facts?.change).toBe('bold')
    expect(facts?.style).toMatchObject({ role: 'serif', bold: 1, size: 8.97, design: BOLD })
    expect(facts?.stop).toBe('.')
  })
  it('the same where an element stands inside the head (its glyphs the element’s, not in the text glyphs)', () => {
    const head = group('\\topic{', [t('Merely a '), el('\\sys'), t(' to find concise sources')])
    const content = [head, t('  \nWe introduce a framework of strategies to find them at a low cost.')]
    const glyphs = [
      ...set('Merely a to find concise sources.', BOLD),
      ...set('We introduce a framework of strategies to find them at a low cost.', REGULAR),
    ]
    expect(groupFacts(content, glyphs).get(head)).toMatchObject({ change: 'bold', stop: '.' })
  })
  it('no stop where the source writes it, nor where TeX set nothing at the group’s end', () => {
    const own = group('\\nosection{', [t('Contributions.')])
    const glyphs = [...set('Contributions.', BOLD), ...set('We make three of them here.', REGULAR)]
    const facts = groupFacts([own, t(' We make three of them here.')], glyphs).get(own)
    expect(facts?.change).toBe('bold')
    expect(facts?.stop).toBeUndefined()
    const bare = group('\\name{', [t('Setup')])
    const g2 = [...set('Setup', BOLD), ...set('We use eight GPUs.', REGULAR)]
    expect(groupFacts([bare, t(' We use eight GPUs.')], g2).get(bare)?.stop).toBeUndefined()
  })
  it('a stop at the unit’s end: the glyphs after the group’s last letter to the unit’s last', () => {
    const head = group('\\topic{', [t('Verifiable sources')])
    const content = [t('We define two notions. '), head]
    const glyphs = [...set('We define two notions.', REGULAR), ...set('Verifiable sources.', BOLD)]
    expect(groupFacts(content, glyphs).get(head)).toMatchObject({ change: 'bold', stop: '.' })
  })
  it('no face where TeX set the group in the face of the text around it (a colour of black, \\revised{…})', () => {
    const plain = group('\\revised{', [t('retrieval approaches by')])
    const content = [t('One could leverage '), plain, t(' ranking the sentences.')]
    const glyphs = set('One could leverage retrieval approaches by ranking the sentences.', REGULAR)
    expect(groupFacts(content, glyphs).get(plain)?.change).toBeUndefined()
  })
  it('no stop where TeX set letters at the group’s end (a macro of prose): it sets more than a stop', () => {
    const todo = group('\\todo{', [t('Check')])
    const content = [todo, t(' the rest holds.')]
    const glyphs = [...set('Check (TODO)', BOLD), ...set('the rest holds.', REGULAR)]
    expect(groupFacts(content, glyphs).get(todo)?.stop).toBeUndefined()
  })
  it('no face where nothing around the group has text of its own (a cell that is the group alone)', () => {
    const only = group('\\rthree{', [t('CUAD')])
    expect(groupFacts([only], set('CUAD', BOLD)).get(only)?.change).toBeUndefined()
  })
  it('a group nested in another is read against its parent’s own text, a change of slant named so', () => {
    const inner = group('\\term{', [t('verifiable')])
    const outer = group('\\topic{', [t('Why '), inner, t(' sources matter')])
    const content = [outer, t(' We show it on three datasets and two models of our own.')]
    const glyphs = [
      ...set('Why', BOLD),
      ...set('verifiable', 'LinLibertineTBI'),
      ...set('sources matter.', BOLD),
      ...set('We show it on three datasets and two models of our own.', REGULAR),
    ]
    const facts = groupFacts(content, glyphs)
    expect(facts.get(outer)).toMatchObject({ change: 'bold', stop: '.' })
    expect(facts.get(inner)?.change).toBe('italic')
    expect(facts.get(inner)?.stop).toBeUndefined()
  })
  it('the face around a group is the face of most of its parent’s text, a body in a group of its own too', () => {
    const top = group('\\topic{', [t('Algorithm')])
    const body = group('\\rtwo{', [t('We illustrate it on an example.')])
    const glyphs = [...set('Algorithm.', BOLD), ...set('We illustrate it on an example.', REGULAR)]
    const facts = groupFacts([top, t(' \n'), body], glyphs)
    expect(facts.get(top)).toMatchObject({ change: 'bold', stop: '.' })
    // (the body is the paragraph's face: no face of its own)
    expect(facts.get(body)?.change).toBeUndefined()
  })
  it('a stop where an element whose ink is its own stands between (a citation after the head, a macro the head ends with)', () => {
    const head = group('\\topic{', [t('Finding a single source')])
    const content = [head, t('\n'), el('\\sys'), t(' uses two phases to find it, then a third.')]
    const glyphs = [
      ...set('Finding a single source.', BOLD),
      ...set('uses two phases to find it, then a third.', REGULAR),
    ]
    expect(groupFacts(content, glyphs).get(head)).toMatchObject({ change: 'bold', stop: '.' })
    const ends = group('\\topic{', [t('Cost of '), el('\\sys')])
    const g2 = [...set('Cost of.', BOLD), ...set('We present the cost.', REGULAR)]
    expect(groupFacts([ends, t('  \nWe present the cost.')], g2).get(ends)).toMatchObject({ change: 'bold', stop: '.' })
  })
  it('a text macro’s text is the source’s: TeX’s own letters there are no stop, its own punctuation none either', () => {
    const sys = el('\\sys')
    const head = group('\\topic{', [t('Merely a '), sys])
    const glyphs = [...set('Merely a BLIP.', BOLD), ...set('We introduce it.', REGULAR)]
    const shown = (p: Piece) => (p === sys ? 'BLIP' : undefined)
    expect(groupFacts([head, t(' We introduce it.')], glyphs, shown).get(head)).toMatchObject({
      change: 'bold',
      stop: '.',
    })
    // (unread, the macro's letters stand between: no stop)
    expect(groupFacts([head, t(' We introduce it.')], glyphs).get(head)?.stop).toBeUndefined()
    // (a text macro whose glyphs the ownership gave its marks, its ink its own: none of its letters among the text's glyphs)
    const after = group('\\topic{', [t('Finding a single source')])
    const sys2 = el('\\sys')
    const g4 = [...set('Finding a single source.', BOLD), ...set('uses two phases to find it, then a third.', REGULAR)]
    const shown2 = (p: Piece) => (p === sys2 ? 'BLIP' : undefined)
    const content2 = [after, t('\n'), sys2, t(' uses two phases to find it, then a third.')]
    expect(groupFacts(content2, g4, shown2).get(after)).toMatchObject({ change: 'bold', stop: '.' })
    const dots = el('\\ldots')
    const trail = group('\\topic{', [t('And so on')])
    const g3 = [...set('And so on…', BOLD), ...set('We stop.', REGULAR)]
    const by = (p: Piece) => (p === dots ? '…' : undefined)
    expect(groupFacts([trail, dots, t(' We stop.')], g3, by).get(trail)?.stop).toBeUndefined()
  })
  it('one stop for groups whose text ends together, on the innermost (`\\topic{\\revised{…}}`)', () => {
    const inner = group('\\revised{', [t('Accuracy and effort')])
    const outer = group('\\topic{', [inner])
    const glyphs = [...set('Accuracy and effort.', BOLD), ...set('We have shown it on every dataset.', REGULAR)]
    const facts = groupFacts([outer, t('   We have shown it on every dataset.')], glyphs)
    expect(facts.get(inner)).toMatchObject({ change: 'bold', stop: '.' })
    expect(facts.get(outer)?.stop).toBeUndefined()
  })
  it('the face around is the text’s own outside groups: a title set upright among a reference’s italic journal is none', () => {
    const title = group('\\showarticletitle{', [t('Data provenance')])
    const journal = group('\\emph{', [t('Foundations and Trends in Databases')])
    const content = [t('A. Author. 2009. '), title, t('. '), journal, t(' 1, 4.')]
    const glyphs = [
      ...set('A. Author. 2009.', REGULAR),
      ...set('Data provenance.', REGULAR),
      ...set('Foundations and Trends in Databases', ITALIC),
      ...set('1, 4.', REGULAR),
    ]
    expect(groupFacts(content, glyphs).get(title)?.change).toBeUndefined()
    // (an entry all of fields, ACM's `\bibinfo{…}`: the text outside the groups whose command names their style, `\emph`)
    const field = (s: string) => group('\\bibinfo{x}{', [t(s)])
    const t2 = group('\\showarticletitle{', [t('Data provenance')])
    const j2 = group('\\bibinfo{journal}{', [
      { ...group('\\emph{', [t('Foundations and Trends in Databases')]), style: 'italic' },
    ])
    const entry = [field('Boris Glavic'), t('. '), field('2021'), t('. '), t2, t('. '), j2, t(' '), field('1'), t('.')]
    const g3 = [
      ...set('Boris Glavic. 2021.', REGULAR),
      ...set('Data provenance.', REGULAR),
      ...set('Foundations and Trends in Databases', ITALIC),
      ...set('1.', REGULAR),
    ]
    expect(groupFacts(entry, g3).get(t2)?.change).toBeUndefined()
    // (a head longer than its body is read against the body all the same)
    const head = group('\\topic{', [t('A head of many words, longer than its body')])
    const g2 = [...set('A head of many words, longer than its body.', BOLD), ...set('It ends.', REGULAR)]
    expect(groupFacts([head, t(' It ends.')], g2).get(head)).toMatchObject({ change: 'bold', stop: '.' })
  })
  it('an italic group named by its change, read the same way', () => {
    const it2 = group('\\eg{', [t('for example')])
    const content = [t('Some tasks, '), it2, t(', are hard.')]
    const glyphs = [...set('Some tasks,', REGULAR), ...set('for example', ITALIC), ...set(', are hard.', REGULAR)]
    expect(groupFacts(content, glyphs).get(it2)).toMatchObject({ change: 'italic' })
    expect(groupFacts(content, glyphs).get(it2)?.stop).toBeUndefined()
  })
})
